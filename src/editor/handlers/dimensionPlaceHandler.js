import { DIMENSION_DEFAULT_OFFSET, GRID_MINOR } from '@/domain/defaults';
import { createLinearDimensionAnnotation } from '@/domain/models';
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

function resetDimensionTool(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      dimensionStartPoint: null,
      dimensionPreviewPoint: null,
      dimensionPreviewOffset: null,
    },
  });
}

export function createDimensionPlaceHandler({ dispatch, editorDispatch, activeFloorId, snapEnabled }) {
  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const point = resolvePoint(modelPos, snapEnabled);
      if (!toolState.dimensionStartPoint) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            dimensionStartPoint: point,
            dimensionPreviewPoint: point,
            dimensionPreviewOffset: DIMENSION_DEFAULT_OFFSET,
          },
        });
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Click the end point for the dimension.' });
        return;
      }

      if (distance(toolState.dimensionStartPoint, point) < GRID_MINOR / 2) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Choose a different end point for the dimension.' });
        return;
      }

      const annotation = createLinearDimensionAnnotation(
        toolState.dimensionStartPoint,
        point,
        {
          mode: 'aligned',
          offset: toolState.dimensionPreviewOffset ?? DIMENSION_DEFAULT_OFFSET,
        }
      );

      dispatch({ type: 'ANNOTATION_ADD', floorId: activeFloorId, annotation });
      editorDispatch({ type: 'SELECT_OBJECT', id: annotation.id, objectType: 'annotation' });
      resetDimensionTool(editorDispatch);
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Dimension created.' });
    },

    onMouseMove(modelPos, e, toolState) {
      if (!toolState.dimensionStartPoint) return;

      const point = resolvePoint(modelPos, snapEnabled);
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          dimensionPreviewPoint: point,
          dimensionPreviewOffset: DIMENSION_DEFAULT_OFFSET,
        },
      });
    },

    onKeyDown(e) {
      if (e.key !== 'Escape') return;
      resetDimensionTool(editorDispatch);
      editorDispatch({ type: 'SET_TOOL', tool: 'select' });
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
