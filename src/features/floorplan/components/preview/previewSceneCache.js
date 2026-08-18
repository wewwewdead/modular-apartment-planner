import * as THREE from 'three';
import { buildFloorObjectGroup } from './buildPreviewObjects';
import { disposeScene } from './disposeScene';

/**
 * Incremental builder for the 3D preview world root.
 *
 * Problem it solves: `buildPreviewObjectRoot` re-triangulates every mesh on
 * every floor whenever any part of the project changes, because it always
 * builds fresh THREE geometries for the whole scene descriptor. Moving one wall
 * on one floor should not rebuild the meshes for other floors.
 *
 * Why it is safe: floors (and roof/truss systems) are updated immutably in this
 * codebase — reducers use object spread via `updateFloor`/`replaceFloors` in
 * `src/domain/projectStateHelpers.js`, so a floor that changed gets a brand-new
 * object reference while untouched floors keep their identity. Each floor
 * descriptor produced by `buildPreviewScene` carries a `sourceKey` object
 * referencing its source `floor` (+ truss systems / roof system). We shallow-
 * compare the previous vs. next `sourceKey` values by reference; equal means the
 * geometry inputs are unchanged and the previously built THREE group can be
 * reused verbatim. Visibility, ordering and metadata are otherwise identical to
 * a full rebuild, so visual output, selection overlay and walkthrough/inspect
 * modes are unaffected.
 *
 * Second level, for when the `sourceKey` does change: `buildFloorObjectGroup`
 * is handed the floor's previous entries and carries over every object whose
 * descriptor is unchanged, so a rebuilt floor only re-triangulates what
 * actually moved. That matters most for the dependencies a floor cannot avoid
 * declaring — a stair anywhere in the building invalidates every floor's key,
 * because a railing on any floor may be riding it — where the honest answer is
 * "one object changed" and the key can only say "something did".
 *
 * Disposal: floors that are removed or rebuilt have their old geometries
 * disposed via `disposeScene(group, { disposeMaterials: false })` — matching the
 * existing convention where shared palette materials are owned by the viewport
 * and disposed separately in `viewport.dispose()`. Carried-over objects have
 * already been re-parented out of the old group by then, so the traversal
 * reaches only what was genuinely replaced.
 *
 * Batches: the cache keeps a second root beside the first, holding one group of
 * instanced draw calls per floor (see `previewBatching`). It is a *sibling*
 * rather than a child on purpose — the walk controller's collision index and
 * the click picker both read the world root, and neither must ever meet a
 * batch. A floor's batch group has exactly the lifetime of the floor group it
 * was folded from: rebuilt with it, hidden with it, disposed with it.
 */

function sourceKeyEqual(prev, next) {
  if (prev === next) return true;
  if (!prev || !next) return false;

  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return false;

  for (const key of prevKeys) {
    const prevValue = prev[key];
    const nextValue = next[key];

    // Arrays (e.g. trussSystems) — shallow compare element references.
    if (Array.isArray(prevValue) || Array.isArray(nextValue)) {
      if (!Array.isArray(prevValue) || !Array.isArray(nextValue)) return false;
      if (prevValue.length !== nextValue.length) return false;
      for (let i = 0; i < prevValue.length; i += 1) {
        if (prevValue[i] !== nextValue[i]) return false;
      }
      continue;
    }

    if (prevValue !== nextValue) return false;
  }

  return true;
}

function applyFloorVisibility(cacheEntry, visible) {
  if (cacheEntry.floorGroup.visible !== visible) {
    cacheEntry.floorGroup.visible = visible;
  }
  // The batch group is what is actually drawn for this floor, so scope changes
  // have to reach it too — the source group's flag only decides what the walk
  // is allowed to bump into.
  if (cacheEntry.batchGroup && cacheEntry.batchGroup.visible !== visible) {
    cacheEntry.batchGroup.visible = visible;
  }
  // Keep meshMap `floorVisible` flags in sync so the selection overlay (which
  // skips objects on hidden floors) behaves identically to a full rebuild.
  if (cacheEntry.floorVisible !== visible) {
    cacheEntry.floorVisible = visible;
    for (const entry of cacheEntry.entries.values()) {
      entry.floorVisible = visible;
    }
  }
}

/**
 * `batch: false` builds one mesh per descriptor and no instanced draw calls.
 * Nothing in the app asks for it — a pane that draws is a pane that batches,
 * assembly editors included — but a caller running against a THREE that has no
 * instancing to fold geometry into needs a way to say so.
 */
export function createPreviewSceneCache({ batch = true } = {}) {
  const root = new THREE.Group();
  root.name = 'preview-root';
  const batchRoot = new THREE.Group();
  batchRoot.name = 'preview-batch-root';

  // floorId -> { floorGroup, batchGroup, entries: Map<id, entry>, sourceKey, floorVisible }
  let floorCache = new Map();
  // Fixed for the cache's lifetime, and it has to be: a group built under one
  // rule must never be carried over into a build under the other, because a
  // batched one is on a layer the camera does not look at and would simply be
  // missing from the picture.
  const batching = Boolean(batch);

  function disposeFloor(entry, survivor = null) {
    root.remove(entry.floorGroup);
    disposeScene(entry.floorGroup, { disposeMaterials: false });
    // A rebuilt floor whose batches still fitted gets the same batch group
    // back, refilled. Disposing it here because its floor group was replaced
    // would free the instance buffers the new build is drawing from.
    if (entry.batchGroup && entry.batchGroup !== survivor?.batchGroup) {
      batchRoot.remove(entry.batchGroup);
      disposeScene(entry.batchGroup, { disposeMaterials: false });
    }
  }

  function build(sceneDescriptor, materialPalette) {
    const nextCache = new Map();
    const meshMap = new Map();
    const orderedGroups = [];
    const orderedBatchGroups = [];

    for (const floor of sceneDescriptor.floors) {
      const previous = floorCache.get(floor.floorId);
      const reusable = previous && sourceKeyEqual(previous.sourceKey, floor.sourceKey);

      let cacheEntry;
      if (reusable) {
        cacheEntry = previous;
        cacheEntry.sourceKey = floor.sourceKey;
        applyFloorVisibility(cacheEntry, floor.visible);
      } else {
        const { floorGroup, entries, batchGroup } = buildFloorObjectGroup(floor, materialPalette, previous?.entries, {
          batch: batching,
          previousBatchGroup: previous?.batchGroup || null,
        });
        cacheEntry = {
          floorGroup,
          batchGroup,
          entries,
          sourceKey: floor.sourceKey,
          floorVisible: floor.visible,
        };
      }

      nextCache.set(floor.floorId, cacheEntry);
      orderedGroups.push(cacheEntry.floorGroup);
      if (cacheEntry.batchGroup) orderedBatchGroups.push(cacheEntry.batchGroup);
      for (const [id, entry] of cacheEntry.entries) {
        meshMap.set(id, entry);
      }
    }

    // Dispose floors that are gone or were rebuilt (their old groups are no
    // longer referenced by nextCache).
    for (const [floorId, previous] of floorCache) {
      const survivor = nextCache.get(floorId);
      if (survivor && survivor.floorGroup === previous.floorGroup) continue;
      disposeFloor(previous, survivor);
    }

    // Re-attach children in descriptor order. clear() detaches without
    // disposing (reused groups must survive), then add back.
    root.clear();
    for (const group of orderedGroups) {
      root.add(group);
    }
    batchRoot.clear();
    for (const group of orderedBatchGroups) {
      batchRoot.add(group);
    }

    floorCache = nextCache;
    return { root, batchRoot, meshMap };
  }

  function dispose() {
    for (const [, previous] of floorCache) {
      disposeFloor(previous);
    }
    floorCache = new Map();
  }

  return { build, dispose, getRoot: () => root, getBatchRoot: () => batchRoot };
}
