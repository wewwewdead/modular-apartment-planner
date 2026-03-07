import { GRID_MINOR } from '@/domain/defaults';
import { createStair } from '@/domain/models';
import { distance } from '@/geometry/point';

function snapToGrid(value) {
  return Math.round(value / GRID_MINOR) * GRID_MINOR;
}

function getAngleDegrees(startPoint, endPoint) {
  return (Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x) * 180) / Math.PI;
}

function resolvePoint(modelPos, snapEnabled) {
  if (!snapEnabled) return { x: modelPos.x, y: modelPos.y };
  return {
    x: snapToGrid(modelPos.x),
    y: snapToGrid(modelPos.y),
  };
}

function resetStairTool(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      stairStartPoint: null,
      stairPreviewPoint: null,
      stairPreviewAngle: null,
    },
  });
}

export function createStairPlaceHandler({ dispatch, editorDispatch, activeFloorId, snapEnabled }) {
  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const point = resolvePoint(modelPos, snapEnabled);

      if (!toolState.stairStartPoint) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            stairStartPoint: point,
            stairPreviewPoint: point,
            stairPreviewAngle: 0,
          },
        });
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Click again to set stair direction.' });
        return;
      }

      if (distance(toolState.stairStartPoint, point) < GRID_MINOR / 2) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Choose a direction farther from the stair start.' });
        return;
      }

      const stair = createStair(
        toolState.stairStartPoint,
        undefined,
        undefined,
        undefined,
        undefined,
        { angle: getAngleDegrees(toolState.stairStartPoint, point) },
        { fromFloorId: activeFloorId, toFloorId: activeFloorId }
      );

      dispatch({ type: 'STAIR_ADD', floorId: activeFloorId, stair });
      editorDispatch({ type: 'SELECT_OBJECT', id: stair.id, objectType: 'stair' });
      resetStairTool(editorDispatch);
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Stair created.' });
    },

    onMouseMove(modelPos, e, toolState) {
      if (!toolState.stairStartPoint) return;
      const point = resolvePoint(modelPos, snapEnabled);
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          stairPreviewPoint: point,
          stairPreviewAngle: getAngleDegrees(toolState.stairStartPoint, point),
        },
      });
    },

    onKeyDown(e) {
      if (e.key !== 'Escape') return;
      resetStairTool(editorDispatch);
      editorDispatch({ type: 'SET_TOOL', tool: 'select' });
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
