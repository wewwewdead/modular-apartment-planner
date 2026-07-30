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
 * Disposal: floors that are removed or rebuilt have their old geometries
 * disposed via `disposeScene(group, { disposeMaterials: false })` — matching the
 * existing convention where shared palette materials are owned by the viewport
 * and disposed separately in `viewport.dispose()`.
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
  // Keep meshMap `floorVisible` flags in sync so the selection overlay (which
  // skips objects on hidden floors) behaves identically to a full rebuild.
  if (cacheEntry.floorVisible !== visible) {
    cacheEntry.floorVisible = visible;
    for (const entry of cacheEntry.entries.values()) {
      entry.floorVisible = visible;
    }
  }
}

export function createPreviewSceneCache() {
  const root = new THREE.Group();
  root.name = 'preview-root';

  // floorId -> { floorGroup, entries: Map<id, entry>, sourceKey, floorVisible }
  let floorCache = new Map();

  function build(sceneDescriptor, materialPalette) {
    const nextCache = new Map();
    const meshMap = new Map();
    const orderedGroups = [];

    for (const floor of sceneDescriptor.floors) {
      const previous = floorCache.get(floor.floorId);
      const reusable = previous && sourceKeyEqual(previous.sourceKey, floor.sourceKey);

      let cacheEntry;
      if (reusable) {
        cacheEntry = previous;
        cacheEntry.sourceKey = floor.sourceKey;
        applyFloorVisibility(cacheEntry, floor.visible);
      } else {
        const { floorGroup, entries } = buildFloorObjectGroup(floor, materialPalette);
        cacheEntry = {
          floorGroup,
          entries,
          sourceKey: floor.sourceKey,
          floorVisible: floor.visible,
        };
      }

      nextCache.set(floor.floorId, cacheEntry);
      orderedGroups.push(cacheEntry.floorGroup);
      for (const [id, entry] of cacheEntry.entries) {
        meshMap.set(id, entry);
      }
    }

    // Dispose floors that are gone or were rebuilt (their old groups are no
    // longer referenced by nextCache).
    for (const [floorId, previous] of floorCache) {
      const survivor = nextCache.get(floorId);
      if (survivor && survivor.floorGroup === previous.floorGroup) continue;
      root.remove(previous.floorGroup);
      disposeScene(previous.floorGroup, { disposeMaterials: false });
    }

    // Re-attach children in descriptor order. clear() detaches without
    // disposing (reused groups must survive), then add back.
    root.clear();
    for (const group of orderedGroups) {
      root.add(group);
    }

    floorCache = nextCache;
    return { root, meshMap };
  }

  function dispose() {
    for (const [, previous] of floorCache) {
      root.remove(previous.floorGroup);
      disposeScene(previous.floorGroup, { disposeMaterials: false });
    }
    floorCache = new Map();
  }

  return { build, dispose, getRoot: () => root };
}
