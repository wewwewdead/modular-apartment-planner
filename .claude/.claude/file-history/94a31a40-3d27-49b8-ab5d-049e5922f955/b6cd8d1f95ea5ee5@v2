import { GRID_MINOR, MIN_WALL_LENGTH } from '@/domain/defaults';
import { createRailing } from '@/domain/models';
import { distance } from '@/geometry/point';

function snapToGrid(value) {
  return Math.round(value / GRID_MINOR) * GRID_MINOR;
}

function resolvePoint(modelPos, snapEnabled) {
  if (!snapEnabled) return { x: modelPos.x, y: modelPos.y };
  return {
    x: snapToGrid(modelPos.x),
    y: snapToGrid(modelPos.y),
  };
}

function resetRailingTool(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      railingStartPoint: null,
      railingPreviewPoint: null,
    },
  });
}

export function createRailingPlaceHandler({ dispatch, editorDispatch, activeFloorId, snapEnabled, activePhaseId }) {
  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const point = resolvePoint(modelPos, snapEnabled);
      if (!toolState.railingStartPoint) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            railingStartPoint: point,
            railingPreviewPoint: point,
          },
        });
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Click the end point for the railing.' });
        return;
      }

      if (distance(toolState.railingStartPoint, point) < MIN_WALL_LENGTH) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Railing is too short.' });
        return;
      }

      const railing = createRailing(toolState.railingStartPoint, point);
      railing.phaseId = activePhaseId || null;

      dispatch({ type: 'RAILING_ADD', floorId: activeFloorId, railing });
      editorDispatch({ type: 'SELECT_OBJECT', id: railing.id, objectType: 'railing' });
      resetRailingTool(editorDispatch);
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Railing placed.' });
    },

    onMouseMove(modelPos) {
      const point = resolvePoint(modelPos, snapEnabled);
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          railingPreviewPoint: point,
        },
      });
    },

    onKeyDown(e) {
      if (e.key !== 'Escape') return;
      resetRailingTool(editorDispatch);
      editorDispatch({ type: 'SET_TOOL', tool: 'select' });
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
