import { MIN_WALL_LENGTH, SNAP_DISTANCE_PX } from '@/domain/defaults';
import { createParapet } from '@/domain/roofModels';
import { distance } from '@/geometry/point';
import { findNearestParapetCandidateEdge } from '@/geometry/roofPlanGeometry';

function resetToolState(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      roofParapetStart: null,
      roofParapetPreview: null,
      roofParapetSnapEdge: null,
      roofParapetSnapStart: null,
      roofParapetSnapEnd: null,
    },
  });
}

export function createRoofParapetPlaceHandler({ dispatch, editorDispatch, roofSystem, viewport }) {
  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0 || !roofSystem) return;

      const start = toolState.roofParapetStart;
      const snapEdge = toolState.roofParapetSnapEdge;

      if (!start && snapEdge && !e.shiftKey) {
        const parapet = createParapet(snapEdge.start, snapEdge.end, {
          attachment: {
            type: 'roof_edge',
            edgeIndex: snapEdge.index,
            startOffset: 0,
            endOffset: snapEdge.length,
          },
        });
        dispatch({ type: 'PARAPET_ADD', parapet });
        editorDispatch({ type: 'SELECT_OBJECT', id: parapet.id, objectType: 'parapet' });
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Created edge-following parapet.' });
        resetToolState(editorDispatch);
        return;
      }

      if (!start) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            roofParapetStart: { x: modelPos.x, y: modelPos.y },
            roofParapetPreview: { x: modelPos.x, y: modelPos.y },
            roofParapetSnapEdge: null,
            roofParapetSnapStart: null,
            roofParapetSnapEnd: null,
          },
        });
        return;
      }

      if (distance(start, modelPos) < MIN_WALL_LENGTH) return;

      const parapet = createParapet(start, modelPos);
      dispatch({ type: 'PARAPET_ADD', parapet });
      editorDispatch({ type: 'SELECT_OBJECT', id: parapet.id, objectType: 'parapet' });
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Created parapet.' });
      resetToolState(editorDispatch);
    },

    onMouseMove(modelPos, e, toolState) {
      if (!toolState.roofParapetStart) {
        const snapDistance = SNAP_DISTANCE_PX / Math.max(0.0001, viewport.zoom);
        const nearestEdge = findNearestParapetCandidateEdge(roofSystem, modelPos, snapDistance);
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            roofParapetSnapEdge: nearestEdge?.edge || null,
            roofParapetSnapStart: nearestEdge?.edge?.start || null,
            roofParapetSnapEnd: nearestEdge?.edge?.end || null,
          },
        });
        return;
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          roofParapetPreview: { x: modelPos.x, y: modelPos.y },
          roofParapetSnapEdge: null,
          roofParapetSnapStart: null,
          roofParapetSnapEnd: null,
        },
      });
    },

    onKeyDown(e) {
      if (e.key !== 'Escape') return;
      resetToolState(editorDispatch);
      editorDispatch({ type: 'SET_TOOL', tool: 'select' });
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
