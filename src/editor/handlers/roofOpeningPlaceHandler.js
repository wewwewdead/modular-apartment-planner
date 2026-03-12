import { SNAP_DISTANCE_PX } from '@/domain/defaults';
import { createRoofOpening, isValidRoofPolygon } from '@/domain/roofModels';
import { distance } from '@/geometry/point';
import { roofContainsPoint } from '@/geometry/roofPlanGeometry';

function resetToolState(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      roofOpeningPoints: [],
      roofOpeningPreviewPoint: null,
    },
  });
}

export function createRoofOpeningPlaceHandler({ dispatch, editorDispatch, roofSystem, viewport }) {
  function commitRoofOpening(points) {
    if (!roofSystem || !isValidRoofPolygon(points) || !points.every((point) => roofContainsPoint(roofSystem, point))) {
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Roof openings must stay inside the roof boundary.' });
      return;
    }

    const roofOpening = createRoofOpening(points);
    dispatch({ type: 'ROOF_OPENING_ADD', roofOpening });
    editorDispatch({ type: 'SELECT_OBJECT', id: roofOpening.id, objectType: 'roofOpening' });
    editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Created roof opening.' });
    resetToolState(editorDispatch);
  }

  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0 || !roofSystem) return;
      if (!roofContainsPoint(roofSystem, modelPos)) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Roof openings must stay inside the roof boundary.' });
        return;
      }

      const points = toolState.roofOpeningPoints || [];
      const closeDistance = SNAP_DISTANCE_PX / viewport.zoom;

      if (!points.length) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            roofOpeningPoints: [{ x: modelPos.x, y: modelPos.y }],
            roofOpeningPreviewPoint: { x: modelPos.x, y: modelPos.y },
          },
        });
        return;
      }

      if (points.length >= 3 && distance(modelPos, points[0]) <= closeDistance) {
        commitRoofOpening(points);
        return;
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          roofOpeningPoints: [...points, { x: modelPos.x, y: modelPos.y }],
          roofOpeningPreviewPoint: { x: modelPos.x, y: modelPos.y },
        },
      });
    },

    onMouseMove(modelPos, e, toolState) {
      if (!(toolState.roofOpeningPoints || []).length) return;
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          roofOpeningPreviewPoint: { x: modelPos.x, y: modelPos.y },
        },
      });
    },

    onDoubleClick(modelPos, e, toolState) {
      const points = toolState.roofOpeningPoints || [];
      if (points.length < 3) return;
      commitRoofOpening(points);
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
