import {
  buildFloorPreviewObjects,
  buildFloorSystemsPreviewObjects,
  buildStairElevationContexts,
} from './objectBuilders';
import { buildRoofPreviewObjects } from '@/geometry/roof3dGeometry';
import { resolveRoofEdgeKitContext } from '@/roof/roofEdgeKit';
import { getProjectRoofs, getRoofFloorId, getRoofForTrussSystem } from '@/domain/projectRoofs';
import { CLOSURE_OWNER_MATERIAL_KEYS, ROOF_OWNER_MATERIAL_KEYS, ownerMaterialKey } from '@/domain/roofCoveringCatalog';
import {
  getDefaultActiveFloorId,
  getFloorElevation,
  getFloorStackBounds,
  getOrderedFloors,
} from '@/domain/floorModels';
import { buildTrussPreviewObjects, buildTrussSystemGeometry } from '@/geometry/trussGeometry';
import { buildEndClosureObjects } from '@/truss/endClosures';
import { buildCeilingPreviewObjects } from '@/geometry/ceilingGeometry';

function mergeBounds(current, next) {
  if (!next) return current;
  if (!current) return { ...next };

  return {
    minX: Math.min(current.minX, next.minX),
    maxX: Math.max(current.maxX, next.maxX),
    minY: Math.min(current.minY, next.minY),
    maxY: Math.max(current.maxY, next.maxY),
    minElevation: Math.min(current.minElevation, next.minElevation),
    maxElevation: Math.max(current.maxElevation, next.maxElevation),
  };
}

function boundsFromObjects(objects = []) {
  return objects.reduce((accumulator, objectDescriptor) => mergeBounds(accumulator, objectDescriptor.bounds), null);
}

const ROOF_OWNED_KEYS = new Set(ROOF_OWNER_MATERIAL_KEYS);
const CLOSURE_OWNED_KEYS = new Set(CLOSURE_OWNER_MATERIAL_KEYS);

/**
 * Point a descriptor drawn in one of `ownedKeys` at its owner's own copy of
 * that material (docs/multi-roof.md §6), so each roof and each truss system's
 * closures can wear their own colours. The geometry modules keep emitting the
 * base keys; this is the one place they are rewritten. The owner key holds
 * the owner's id and never its colour, so a colour edit leaves the descriptor
 * equal and the cache carries its mesh over.
 */
function withOwnerMaterialKey(descriptor, ownedKeys, ownerId) {
  if (!ownerId || !ownedKeys.has(descriptor.materialKey)) return descriptor;
  return { ...descriptor, materialKey: ownerMaterialKey(descriptor.materialKey, ownerId) };
}

function createFallbackBounds(stackBounds, activeFloor) {
  const level = stackBounds?.minElevation ?? getFloorElevation(activeFloor);
  const top = stackBounds?.maxElevation ?? level + 3000;
  return {
    minX: -1500,
    maxX: 1500,
    minY: -1500,
    maxY: 1500,
    minElevation: level,
    maxElevation: top,
  };
}

/*
 * Descriptor memo, for a caller that builds the scene over and over.
 *
 * The preview pane runs this on every project commit — fifteen-plus times a
 * second through a plan drag — and every run used to regenerate every floor's
 * descriptors, only for the scene cache to throw the untouched floors' away
 * again on their unchanged `sourceKey`. A caller that passes `options.memo`
 * (any object it keeps for as long as it keeps building: one per pane) gets a
 * floor's previous descriptor back — the same `objects` array, the same
 * `bounds`, the same `sourceKey` object — whenever every input the key is made
 * from is the same as last time, so nothing is regenerated and the cache's own
 * key comparison ends on its first identity check.
 *
 * "Every input the key is made from" is checked exactly the way the cache
 * checks it (`sameKey` is its `sourceKeyEqual`), plus the one thing a floor's
 * objects also read that its key leaves out: the floor elevations the stair
 * contexts are derived from. A truss system's objects — the heaviest part of a
 * floor that carries one — are memoised on their own inputs too (the system
 * and the roof it carries), so editing the floor under a truss rebuilds the
 * floor's objects without re-cutting the truss. Each roof layer is memoised on
 * its key, its elevation and the floor id its objects report. `visible` is not
 * geometry and is always read fresh. A caller that passes nothing gets exactly
 * the fresh build it always did.
 */
function sameKey(prev, next) {
  if (prev === next) return true;
  if (!prev || !next) return false;
  const prevKeys = Object.keys(prev);
  if (prevKeys.length !== Object.keys(next).length) return false;
  for (const key of prevKeys) {
    const prevValue = prev[key];
    const nextValue = next[key];
    if (Array.isArray(prevValue) || Array.isArray(nextValue)) {
      if (!Array.isArray(prevValue) || !Array.isArray(nextValue) || prevValue.length !== nextValue.length) return false;
      for (let index = 0; index < prevValue.length; index += 1) {
        if (prevValue[index] !== nextValue[index]) return false;
      }
      continue;
    }
    if (prevValue !== nextValue) return false;
  }
  return true;
}

function memoTables(memo) {
  if (!memo || typeof memo !== 'object') return null;
  if (!memo.floors) {
    memo.floors = new Map();
    memo.trusses = new Map();
    memo.roofs = new Map();
  }
  return memo;
}

/** The descriptor as last handed out, with `visible` read fresh. */
function withVisibility(descriptor, visible) {
  return descriptor.visible === visible ? descriptor : { ...descriptor, visible };
}

function createNavigationTarget(bounds, fallbackBounds) {
  const source = bounds || fallbackBounds;
  return {
    x: (source.minX + source.maxX) / 2,
    z: (source.minY + source.maxY) / 2,
  };
}

export function buildPreviewScene(project, options = {}) {
  const floors = getOrderedFloors(project);
  // See "Descriptor memo" above. Each table is rebuilt from what this run used,
  // so the entry for a floor, truss or roof that has gone goes with it.
  const memo = memoTables(options.memo);
  const nextFloors = memo ? new Map() : null;
  const nextTrusses = memo ? new Map() : null;
  const nextRoofs = memo ? new Map() : null;
  // { wallId: ['interior', ...] } of board faces stripped for frame inspection.
  const hiddenBoardSides = new Map(Object.entries(options.hiddenWallBoards || {}).filter(([, sides]) => sides?.length));
  // The same move for ceilings, but a ceiling has one board plane facing the
  // room, so there is nothing to name: the id is in the set or it is not.
  const hiddenCeilingBoards = new Set(
    Object.entries(options.hiddenCeilingBoards || {})
      .filter(([, hidden]) => hidden)
      .map(([ceilingId]) => ceilingId),
  );
  // Full assembly detail — currently the ceiling's screws — is what an assembly
  // editor's own pane asks for and what a whole-building view must not pay for.
  const assemblyDetail = Boolean(options.assemblyDetail);
  const activeFloorId = getDefaultActiveFloorId(project, options.activeFloorId);
  const activeFloor = floors.find((floor) => floor.id === activeFloorId) || null;
  const topFloor = floors[floors.length - 1] || null;
  const stackBounds = getFloorStackBounds(floors);
  const resolvedVisibleFloorIds = options.visibleFloorIds || floors.map((floor) => floor.id);
  const visibleFloorIds = new Set(resolvedVisibleFloorIds);

  // Railings attach to stairs by plan position across floors (a stairwell
  // railing drawn on the arrival floor follows the flight from below), so every
  // floor's objects can depend on every floor's stairs and landings.
  // Built only when some floor's objects are: a run in which every floor comes
  // back from the memo needs none.
  let stairContexts = null;
  const getStairContexts = () => {
    if (!stairContexts) stairContexts = buildStairElevationContexts(floors);
    return stairContexts;
  };
  // What the stair contexts read that no floor's key holds: every floor's
  // elevation.
  const elevations = memo ? floors.map((floor) => getFloorElevation(floor)).join('|') : null;
  const stairSources = floors.map((floor) => floor.stairs);
  const landingSources = floors.map((floor) => floor.landings);
  // Every roof the project (as the phase view shows it) holds, each drawn as
  // its own layer below (docs/multi-roof.md §5.5).
  const previewRoofs = getProjectRoofs(project);

  const floorDescriptors = floors.map((floor, index) => {
    const floorTrussSystems = (project?.trussSystems || []).filter((trussSystem) => trussSystem.floorId === floor.id);
    // The gable-end closures are part of their truss system's objects, so they
    // live (and phase-filter) with it. Their top edge follows the underside of
    // the roof THAT system carries, which is why those roofs are in this floor's key.
    const systemRoofs = floorTrussSystems.map((trussSystem) => getRoofForTrussSystem(project, trussSystem.id));
    // Only the roofs on this floor's own truss systems are read here: every
    // other floor keeps its cached group when a roof changes. A fresh array of
    // the same roofs is still the same key (`sourceKeyEqual` compares arrays
    // element by element).
    const roofSources = systemRoofs.filter(Boolean);
    const floorCeilings = (project?.ceilings || []).filter((ceiling) => ceiling.floorId === floor.id);
    // Only the floors actually holding a stripped wall get a changing key, so
    // toggling one wall does not re-triangulate the rest of the building. The
    // faces are part of the key: hiding the far side is a different scene.
    const strippedHere = (floor.walls || [])
      .filter((wall) => hiddenBoardSides.has(wall.id))
      .map((wall) => `${wall.id}:${[...hiddenBoardSides.get(wall.id)].sort().join('+')}`)
      .join('|');
    // Ceilings are built into this floor's group, so the same rule applies to
    // them: a floor whose ceiling lost its boards has to say so in its key, or
    // the cache hands back the fully boarded group it built last time and the
    // toggle does nothing on screen.
    const strippedCeilingsHere = floorCeilings
      .filter((ceiling) => hiddenCeilingBoards.has(ceiling.id))
      .map((ceiling) => ceiling.id)
      .join('|');
    // See the comment on `sourceKey` below for what each part is.
    const sourceKey = {
      floor,
      slabsAbove: floorCeilings.length ? floors[index + 1]?.slabs || null : null,
      strippedHere,
      strippedCeilingsHere,
      assemblyDetail,
      systems: project?.building?.systems,
      trussSystems: floorTrussSystems,
      roofSystems: roofSources,
      ceilings: floorCeilings,
      stairSources,
      landingSources,
    };
    const visible = visibleFloorIds.has(floor.id);

    const remembered = memo?.floors.get(floor.id);
    if (remembered && remembered.elevations === elevations && sameKey(remembered.descriptor.sourceKey, sourceKey)) {
      nextFloors.set(floor.id, remembered);
      // Its truss systems were not looked at, but they are still in use.
      for (const trussSystem of floorTrussSystems) {
        const entry = memo.trusses.get(trussSystem.id);
        if (entry) nextTrusses.set(trussSystem.id, entry);
      }
      return withVisibility(remembered.descriptor, visible);
    }

    const trussObjects = floorTrussSystems.flatMap((trussSystem, systemIndex) => {
      const roof = systemRoofs[systemIndex];
      const rememberedTruss = memo?.trusses.get(trussSystem.id);
      if (rememberedTruss && rememberedTruss.trussSystem === trussSystem && rememberedTruss.roof === roof) {
        nextTrusses.set(trussSystem.id, rememberedTruss);
        return rememberedTruss.objects;
      }
      const systemGeometry = buildTrussSystemGeometry(trussSystem);
      const trussSystemObjects = [
        ...buildTrussPreviewObjects(trussSystem, systemGeometry),
        ...buildEndClosureObjects(trussSystem, systemGeometry, roof).map((descriptor) =>
          withOwnerMaterialKey(descriptor, CLOSURE_OWNED_KEYS, trussSystem.id),
        ),
      ];
      nextTrusses?.set(trussSystem.id, { trussSystem, roof, objects: trussSystemObjects });
      return trussSystemObjects;
    });
    const ceilingObjects = floorCeilings.flatMap((ceiling) =>
      buildCeilingPreviewObjects(ceiling, project, {
        fasteners: assemblyDetail,
        hideBoards: hiddenCeilingBoards.has(ceiling.id),
      }),
    );
    const systemObjects = buildFloorSystemsPreviewObjects(floor, project?.building?.systems || {});
    const objects = [
      ...buildFloorPreviewObjects(floor, { stairContexts: getStairContexts(), hiddenBoardSides }),
      ...systemObjects,
      ...trussObjects,
      ...ceilingObjects,
    ];
    const descriptor = {
      floorId: floor.id,
      name: floor.name,
      elevation: getFloorElevation(floor),
      visible,
      objects,
      bounds: boundsFromObjects(objects),
      // sourceKey: identity of the geometry inputs for this floor. Floors are
      // updated immutably (reducers spread), so a changed floor gets a new
      // object reference while untouched floors keep identity — this lets the
      // preview object cache skip re-triangulating unchanged floors. Truss
      // systems are separate source objects, so include their refs too — and
      // ceilings likewise live in a project-level array. A ceiling's attachment
      // plane and obstructions come from the beams, columns and walls of this
      // same floor, so `floor` answers for them — and so does its boundary
      // wherever those beams frame a rectangle. Where they frame none (no
      // supports, one beam, a collinear pair) the boundary is the slab overhead
      // instead, which is filed on the floor ABOVE: pulling that slab's edge has
      // to rebuild the ceiling down here, and this floor's own identity cannot
      // say so. A per-floor key cannot tell which of its ceilings are framed, so
      // every floor carrying one declares it.
      // stairSources/landingSources: cross-floor railing-stair attachment means
      // any floor's stairs or landings changing must rebuild every floor.
      // assemblyDetail: part of the identity, not a render-time flag — turning
      // screws on has to re-triangulate the ceilings, and a cached floor would
      // swallow it. roofSystems: the end closures' top edge is the attached
      // roof's underside (RT-2), so a roof slope or thickness change has to
      // rebuild them.
      sourceKey,
    };
    nextFloors?.set(floor.id, { elevations, descriptor });
    return descriptor;
  });

  // One layer per roof, keyed by the roof id so the cache rebuilds only the
  // roof that changed. A roof stands with its truss system's floor (the top
  // floor when it is detached): that floor's scope shows or hides it, and its
  // objects report that floor when picked.
  const roofLayerIds = [];
  for (const previewRoof of previewRoofs) {
    const roofFloorId = getRoofFloorId(project, previewRoof, topFloor?.id || null);
    // The edge kit reads two things from outside the roof: the attached truss
    // system (its bearing line is where the soffit stops) and the bottom of the
    // floor stack (where the downpipes end). Both go in the roof's sourceKey.
    const roofEdgeKitContext = resolveRoofEdgeKitContext(project, previewRoof);
    const reportedFloorId = roofFloorId || activeFloorId;
    const sourceKey = {
      roofSystem: previewRoof,
      trussSystem: roofEdgeKitContext.trussSystem,
      groundElevation: roofEdgeKitContext.groundElevation,
    };
    const elevation = previewRoof.baseElevation ?? stackBounds.maxElevation;
    const visible = !options.visibleFloorIds || (roofFloorId ? visibleFloorIds.has(roofFloorId) : true);
    roofLayerIds.push(previewRoof.id);

    const remembered = memo?.roofs.get(previewRoof.id);
    if (
      remembered &&
      remembered.reportedFloorId === reportedFloorId &&
      remembered.descriptor.elevation === elevation &&
      sameKey(remembered.descriptor.sourceKey, sourceKey)
    ) {
      nextRoofs.set(previewRoof.id, remembered);
      floorDescriptors.push(withVisibility(remembered.descriptor, visible));
      continue;
    }

    const roofObjects = buildRoofPreviewObjects(previewRoof, roofEdgeKitContext).map((descriptor) => ({
      ...withOwnerMaterialKey(descriptor, ROOF_OWNED_KEYS, previewRoof.id),
      metadata: {
        ...(descriptor.metadata || {}),
        floorId: reportedFloorId,
      },
    }));
    const descriptor = {
      floorId: previewRoof.id,
      name: previewRoof.name || 'Roof',
      elevation,
      visible,
      objects: roofObjects,
      bounds: boundsFromObjects(roofObjects),
      sourceKey,
    };
    nextRoofs?.set(previewRoof.id, { reportedFloorId, descriptor });
    floorDescriptors.push(descriptor);
  }
  if (memo) {
    memo.floors = nextFloors;
    memo.trusses = nextTrusses;
    memo.roofs = nextRoofs;
  }

  const visibleObjects = floorDescriptors.filter((floor) => floor.visible).flatMap((floor) => floor.objects);
  const bounds = boundsFromObjects(visibleObjects) || createFallbackBounds(stackBounds, activeFloor);
  const floorsWithNavigationTargets = floorDescriptors.map((floor) => ({
    ...floor,
    navigationTarget: createNavigationTarget(floor.bounds, bounds),
  }));

  return {
    activeFloorId,
    // Carried on the scene as well as on each floor's `sourceKey` so that a
    // reader with the whole descriptor in hand can tell an assembly editor's
    // pane — one mesh per screw and per board, every one of them pickable —
    // from a whole-building view. It says nothing about how those meshes are
    // drawn: batching folds them into instanced calls either way, and the parts
    // stay pickable because the meshes themselves are left standing.
    assemblyDetail,
    visibleFloorIds: [...visibleFloorIds],
    floors: floorsWithNavigationTargets,
    // Which `floors` entries are roofs rather than storeys: a reader counting
    // or walking storeys skips these.
    roofLayerIds,
    bounds,
    defaultTarget: {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minElevation + bounds.maxElevation) / 2,
      z: (bounds.minY + bounds.maxY) / 2,
    },
    groundLevel: stackBounds.minElevation,
    hasVisibleObjects: visibleObjects.length > 0,
  };
}
