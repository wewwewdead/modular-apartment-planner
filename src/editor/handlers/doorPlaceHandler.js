import { createDoor } from '@/domain/models';
import { distanceToSegment } from '@/geometry/line';
import { clampWallOpeningOffset, projectPointOnWall, wallLength } from '@/geometry/wallGeometry';
import { DOOR_WIDTH } from '@/domain/defaults';

const WALL_DETECT_RADIUS = 500; // mm

function findNearestWall(modelPos, walls) {
  let best = null;
  let bestDist = WALL_DETECT_RADIUS;

  for (const wall of walls) {
    const d = distanceToSegment(modelPos, wall.start, wall.end);
    if (d < bestDist) {
      best = wall;
      bestDist = d;
    }
  }
  return best;
}

function overlapsExisting(wallId, offset, width, doors, windows) {
  const halfW = width / 2;
  const min = offset - halfW;
  const max = offset + halfW;

  for (const d of doors) {
    if (d.wallId !== wallId) continue;
    const dMin = d.offset - d.width / 2;
    const dMax = d.offset + d.width / 2;
    if (min < dMax && max > dMin) return true;
  }
  for (const w of windows) {
    if (w.wallId !== wallId) continue;
    const wMin = w.offset - w.width / 2;
    const wMax = w.offset + w.width / 2;
    if (min < wMax && max > wMin) return true;
  }
  return false;
}

export function createDoorPlaceHandler({ dispatch, editorDispatch, getFloor, activeFloorId, activePhaseId }) {
  return {
    onMouseMove(modelPos, e, toolState) {
      const floor = getFloor(activeFloorId);
      if (!floor) return;
      const wall = findNearestWall(modelPos, floor.walls);

      if (wall) {
        const offset = projectPointOnWall(wall, modelPos);
        const clampedOffset = clampWallOpeningOffset(wallLength(wall), DOOR_WIDTH, offset);
        const blocked = overlapsExisting(wall.id, clampedOffset, DOOR_WIDTH, floor.doors, floor.windows);

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            previewWallId: wall.id,
            previewOffset: clampedOffset,
            previewBlocked: blocked,
            openDirection: toolState.openDirection || 'left',
          },
        });
      } else {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { previewWallId: null, previewOffset: null, previewBlocked: false, openDirection: toolState.openDirection || 'left' },
        });
      }
    },

    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;
      if (!toolState.previewWallId || toolState.previewBlocked) return;

      const openDir = toolState.openDirection || 'left';
      const door = createDoor(toolState.previewWallId, toolState.previewOffset, DOOR_WIDTH, openDir);
      door.phaseId = activePhaseId || null;
      dispatch({ type: 'DOOR_ADD', floorId: activeFloorId, door });
    },

    onKeyDown(e, toolState) {
      if (e.key === 'Escape') {
        editorDispatch({ type: 'SET_TOOL', tool: 'select' });
      }
      if (e.key === 'f' || e.key === 'F') {
        const flipped = toolState.openDirection === 'right' ? 'left' : 'right';
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { openDirection: flipped },
        });
      }
    },

    getCursor(toolState) {
      if (!toolState.previewWallId || toolState.previewBlocked) return 'not-allowed';
      return 'copy';
    },
  };
}
