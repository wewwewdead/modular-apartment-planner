import { GRID_MINOR, MIN_WALL_LENGTH } from '@/domain/defaults';
import { createSectionCut } from '@/domain/models';
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

function resetSectionTool(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      sectionStartPoint: null,
      sectionPreviewPoint: null,
    },
  });
}

export function createSectionPlaceHandler({ dispatch, editorDispatch, activeFloorId, getFloor, snapEnabled }) {
  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const point = resolvePoint(modelPos, snapEnabled);
      if (!toolState.sectionStartPoint) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            sectionStartPoint: point,
            sectionPreviewPoint: point,
          },
        });
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Click the end point for the section cut.' });
        return;
      }

      if (distance(toolState.sectionStartPoint, point) < MIN_WALL_LENGTH) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Section cut is too short.' });
        return;
      }

      const floor = getFloor(activeFloorId);
      const existing = floor?.sectionCut || null;
      const sectionCut = existing
        ? {
            ...existing,
            startPoint: toolState.sectionStartPoint,
            endPoint: point,
          }
        : createSectionCut(toolState.sectionStartPoint, point);

      dispatch({ type: 'SECTION_SET', floorId: activeFloorId, sectionCut });
      editorDispatch({ type: 'SELECT_OBJECT', id: sectionCut.id, objectType: 'sectionCut' });
      resetSectionTool(editorDispatch);
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Section cut updated.' });
    },

    onMouseMove(modelPos) {
      const point = resolvePoint(modelPos, snapEnabled);
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          sectionPreviewPoint: point,
        },
      });
    },

    onKeyDown(e) {
      if (e.key !== 'Escape') return;
      resetSectionTool(editorDispatch);
      editorDispatch({ type: 'SET_TOOL', tool: 'select' });
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
