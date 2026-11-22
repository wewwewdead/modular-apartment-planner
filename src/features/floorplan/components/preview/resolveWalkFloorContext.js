import { DEFAULT_WALK_DIRECTION, WALK_EYE_HEIGHT, WALK_LOOK_DISTANCE } from './previewConfig';

function createLookAt(position) {
  return {
    x: position.x + DEFAULT_WALK_DIRECTION.x * WALK_LOOK_DISTANCE,
    y: position.y,
    z: position.z + DEFAULT_WALK_DIRECTION.z * WALK_LOOK_DISTANCE,
  };
}

export function resolveWalkFloorContext(sceneDescriptor, activeFloorId, eyeHeightOffset = WALK_EYE_HEIGHT) {
  if (!sceneDescriptor) {
    return {
      floorId: activeFloorId || null,
      spawn: null,
    };
  }

  // A walk starts on a storey, never on a roof: each roof is a `floors` entry
  // of its own (keyed by the roof id), so the roof layers are left out.
  const roofLayerIds = new Set(sceneDescriptor.roofLayerIds || []);
  const storeys = sceneDescriptor.floors.filter((entry) => !roofLayerIds.has(entry.floorId));
  const floor =
    storeys.find((entry) => entry.floorId === activeFloorId) ||
    storeys.find((entry) => entry.floorId === sceneDescriptor.activeFloorId) ||
    null;

  const floorId = floor?.floorId || activeFloorId || sceneDescriptor.activeFloorId || null;
  const navigationTarget = floor?.navigationTarget || {
    x: sceneDescriptor.defaultTarget.x,
    z: sceneDescriptor.defaultTarget.z,
  };
  const elevation = Number.isFinite(floor?.elevation) ? floor.elevation : (sceneDescriptor.groundLevel ?? 0);
  const position = {
    x: navigationTarget.x,
    y: elevation + eyeHeightOffset,
    z: navigationTarget.z,
  };

  return {
    floorId,
    spawn: {
      position,
      lookAt: createLookAt(position),
      elevation,
      eyeHeightOffset,
    },
  };
}
