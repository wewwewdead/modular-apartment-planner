import { createElectricalDevice } from '@/domain/models';
import { distanceToSegment } from '@/geometry/line';
import {
  clampWallOpeningOffset,
  projectPointOnWall,
  snapOffsetToWallColumns,
  wallLength,
  wallSideOfPoint,
} from '@/geometry/wallGeometry';
import { ELECTRICAL_PLATE, ELECTRICAL_SYMBOL_SIZE } from '@/domain/defaults';
import { ELECTRICAL_DEVICE_TYPES } from '@/editor/tools';

const WALL_DETECT_RADIUS = 500; // mm

function findNearestWall(modelPos, walls) {
  let best = null;
  let bestDist = WALL_DETECT_RADIUS;

  for (const wall of walls) {
    if (wall.controlPoint) continue; // skip arc walls
    const d = distanceToSegment(modelPos, wall.start, wall.end);
    if (d < bestDist) {
      best = wall;
      bestDist = d;
    }
  }
  return best;
}

// A device may not straddle an opening (there is no wall face to mount to), nor
// crowd a device already on the same face of the same wall. The opposite face is
// free — back-to-back outlets are a normal detail. Openings are checked against
// the true plate footprint (a switch belongs hard against a door jamb); only
// device-to-device spacing keeps the wider symbol size so plan glyphs stay legible.
function isBlocked(wallId, offset, side, floor) {
  const halfPlate = ELECTRICAL_PLATE.width / 2;
  const min = offset - halfPlate;
  const max = offset + halfPlate;

  for (const door of floor.doors || []) {
    if (door.wallId !== wallId) continue;
    if (min < door.offset + door.width / 2 && max > door.offset - door.width / 2) return true;
  }
  for (const windowItem of floor.windows || []) {
    if (windowItem.wallId !== wallId) continue;
    if (min < windowItem.offset + windowItem.width / 2 && max > windowItem.offset - windowItem.width / 2) return true;
  }
  for (const device of floor.electricalDevices || []) {
    if (device.wallId !== wallId || device.side !== side) continue;
    if (Math.abs(device.offset - offset) < ELECTRICAL_SYMBOL_SIZE) return true;
  }
  return false;
}

export function createElectricalPlaceHandler({ dispatch, editorDispatch, getFloor, activeFloorId, activePhaseId }) {
  return {
    onMouseMove(modelPos, e, toolState) {
      const floor = getFloor(activeFloorId);
      if (!floor) return;
      const wall = findNearestWall(modelPos, floor.walls);
      const deviceType = toolState.deviceType || ELECTRICAL_DEVICE_TYPES.OUTLET;

      if (wall) {
        // Clamp and snap by the physical plate, not the drawing symbol — the
        // plate is what must land flush against columns and wall ends.
        const offset = projectPointOnWall(wall, modelPos);
        const snappedOffset = snapOffsetToWallColumns(wall, offset, floor.columns, ELECTRICAL_PLATE.width);
        const clampedOffset = clampWallOpeningOffset(wallLength(wall), ELECTRICAL_PLATE.width, snappedOffset);
        const side = wallSideOfPoint(wall, modelPos);

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            previewWallId: wall.id,
            previewOffset: clampedOffset,
            previewSide: side,
            previewBlocked: isBlocked(wall.id, clampedOffset, side, floor),
            deviceType,
          },
        });
      } else {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            previewWallId: null,
            previewOffset: null,
            previewSide: null,
            previewBlocked: false,
            deviceType,
          },
        });
      }
    },

    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;
      if (!toolState.previewWallId || toolState.previewBlocked) return;

      const device = createElectricalDevice(
        toolState.previewWallId,
        toolState.previewOffset,
        toolState.deviceType || ELECTRICAL_DEVICE_TYPES.OUTLET,
        toolState.previewSide || 'right',
      );
      device.phaseId = activePhaseId || null;
      dispatch({ type: 'ELECTRICAL_DEVICE_ADD', floorId: activeFloorId, device });
    },

    onKeyDown(e, toolState) {
      if (e.key === 'Escape') {
        editorDispatch({ type: 'SET_TOOL', tool: 'select' });
      }
      if (e.key === 'f' || e.key === 'F') {
        const flipped = toolState.previewSide === 'left' ? 'right' : 'left';
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { previewSide: flipped },
        });
      }
    },

    getCursor(toolState) {
      if (!toolState.previewWallId || toolState.previewBlocked) return 'not-allowed';
      return 'copy';
    },
  };
}
