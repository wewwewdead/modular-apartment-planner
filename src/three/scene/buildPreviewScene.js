import {
  buildFloorPreviewObjects,
  buildFloorSystemsPreviewObjects,
  buildStairElevationContexts,
} from './objectBuilders';
import { buildRoofPreviewObjects } from '@/geometry/roof3dGeometry';
import {
  getDefaultActiveFloorId,
  getFloorElevation,
  getFloorStackBounds,
  getOrderedFloors,
} from '@/domain/floorModels';
import { buildTrussPreviewObjects } from '@/geometry/trussGeometry';
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

function createNavigationTarget(bounds, fallbackBounds) {
  const source = bounds || fallbackBounds;
  return {
    x: (source.minX + source.maxX) / 2,
    z: (source.minY + source.maxY) / 2,
  };
}

export function buildPreviewScene(project, options = {}) {
  const floors = getOrderedFloors(project);
  // { wallId: ['interior', ...] } of board faces stripped for frame inspection.
  const hiddenBoardSides = new Map(Object.entries(options.hiddenWallBoards || {}).filter(([, sides]) => sides?.length));
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
  const stairContexts = buildStairElevationContexts(floors);
  const stairSources = floors.map((floor) => floor.stairs);
  const landingSources = floors.map((floor) => floor.landings);

  const floorDescriptors = floors.map((floor, index) => {
    const floorTrussSystems = (project?.trussSystems || []).filter((trussSystem) => trussSystem.floorId === floor.id);
    const trussObjects = floorTrussSystems.flatMap((trussSystem) => buildTrussPreviewObjects(trussSystem));
    const floorCeilings = (project?.ceilings || []).filter((ceiling) => ceiling.floorId === floor.id);
    const ceilingObjects = floorCeilings.flatMap((ceiling) =>
      buildCeilingPreviewObjects(ceiling, project, { fasteners: assemblyDetail }),
    );
    const systemObjects = buildFloorSystemsPreviewObjects(floor, project?.building?.systems || {});
    const objects = [
      ...buildFloorPreviewObjects(floor, { stairContexts, hiddenBoardSides }),
      ...systemObjects,
      ...trussObjects,
      ...ceilingObjects,
    ];
    // Only the floors actually holding a stripped wall get a changing key, so
    // toggling one wall does not re-triangulate the rest of the building. The
    // faces are part of the key: hiding the far side is a different scene.
    const strippedHere = (floor.walls || [])
      .filter((wall) => hiddenBoardSides.has(wall.id))
      .map((wall) => `${wall.id}:${[...hiddenBoardSides.get(wall.id)].sort().join('+')}`)
      .join('|');
    return {
      floorId: floor.id,
      name: floor.name,
      elevation: getFloorElevation(floor),
      visible: visibleFloorIds.has(floor.id),
      objects,
      bounds: boundsFromObjects(objects),
      // sourceKey: identity of the geometry inputs for this floor. Floors are
      // updated immutably (reducers spread), so a changed floor gets a new
      // object reference while untouched floors keep identity — this lets the
      // preview object cache skip re-triangulating unchanged floors. Truss
      // systems are separate source objects, so include their refs too — and
      // ceilings likewise live in a project-level array. A ceiling's attachment
      // plane and obstructions come from the beams, columns and walls of this
      // same floor, so `floor` answers for them — but its boundary reaches as
      // far as the slab it closes off, which is filed on the floor ABOVE, so
      // pulling a slab edge out over a cantilever up there has to rebuild the
      // ceiling down here. Only floors carrying a ceiling declare it.
      // stairSources/landingSources: cross-floor railing-stair attachment means
      // any floor's stairs or landings changing must rebuild every floor.
      sourceKey: {
        floor,
        slabsAbove: floorCeilings.length ? floors[index + 1]?.slabs || null : null,
        strippedHere,
        // Part of the identity, not a render-time flag: turning screws on has to
        // re-triangulate the ceilings, and a cached floor would swallow it.
        assemblyDetail,
        systems: project?.building?.systems,
        trussSystems: floorTrussSystems,
        ceilings: floorCeilings,
        stairSources,
        landingSources,
      },
    };
  });

  if (project?.roofSystem) {
    const roofObjects = buildRoofPreviewObjects(project.roofSystem).map((descriptor) => ({
      ...descriptor,
      metadata: {
        ...(descriptor.metadata || {}),
        floorId: topFloor?.id || activeFloorId,
      },
    }));

    floorDescriptors.push({
      floorId: project.roofSystem.id,
      name: project.roofSystem.name || 'Roof',
      elevation: project.roofSystem.baseElevation ?? stackBounds.maxElevation,
      visible: !options.visibleFloorIds || (topFloor ? visibleFloorIds.has(topFloor.id) : true),
      objects: roofObjects,
      bounds: boundsFromObjects(roofObjects),
      sourceKey: { roofSystem: project.roofSystem },
    });
  }

  const visibleObjects = floorDescriptors.filter((floor) => floor.visible).flatMap((floor) => floor.objects);
  const bounds = boundsFromObjects(visibleObjects) || createFallbackBounds(stackBounds, activeFloor);
  const floorsWithNavigationTargets = floorDescriptors.map((floor) => ({
    ...floor,
    navigationTarget: createNavigationTarget(floor.bounds, bounds),
  }));

  return {
    activeFloorId,
    visibleFloorIds: [...visibleFloorIds],
    floors: floorsWithNavigationTargets,
    roofLayerId: project?.roofSystem?.id || null,
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
