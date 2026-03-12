import { buildFloorPreviewObjects } from './objectBuilders';
import { buildRoofPreviewObjects } from '@/geometry/roof3dGeometry';
import { getDefaultActiveFloorId, getFloorElevation, getFloorStackBounds, getOrderedFloors } from '@/domain/floorModels';

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
  return objects.reduce((accumulator, objectDescriptor) => (
    mergeBounds(accumulator, objectDescriptor.bounds)
  ), null);
}

function createFallbackBounds(stackBounds, activeFloor) {
  const level = stackBounds?.minElevation ?? getFloorElevation(activeFloor);
  const top = stackBounds?.maxElevation ?? (level + 3000);
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
  const activeFloorId = getDefaultActiveFloorId(project, options.activeFloorId);
  const activeFloor = floors.find((floor) => floor.id === activeFloorId) || null;
  const topFloor = floors[floors.length - 1] || null;
  const stackBounds = getFloorStackBounds(floors);
  const resolvedVisibleFloorIds = options.visibleFloorIds || floors.map((floor) => floor.id);
  const visibleFloorIds = new Set(resolvedVisibleFloorIds);

  const floorDescriptors = floors.map((floor) => {
    const objects = buildFloorPreviewObjects(floor);
    return {
      floorId: floor.id,
      name: floor.name,
      elevation: getFloorElevation(floor),
      visible: visibleFloorIds.has(floor.id),
      objects,
      bounds: boundsFromObjects(objects),
    };
  });

  if (project?.roofSystem) {
    const roofObjects = buildRoofPreviewObjects(project.roofSystem)
      .map((descriptor) => ({
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
    });
  }

  const visibleObjects = floorDescriptors
    .filter((floor) => floor.visible)
    .flatMap((floor) => floor.objects);
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
