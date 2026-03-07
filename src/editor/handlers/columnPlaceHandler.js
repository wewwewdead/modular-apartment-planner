import { createColumn } from '@/domain/models';
import { GRID_MINOR } from '@/domain/defaults';

function snapToGrid(value) {
  return Math.round(value / GRID_MINOR) * GRID_MINOR;
}

export function createColumnPlaceHandler({ dispatch, editorDispatch, getFloor, activeFloorId, snapEnabled }) {
  return {
    onMouseMove(modelPos) {
      let x = modelPos.x;
      let y = modelPos.y;
      if (snapEnabled) {
        x = snapToGrid(x);
        y = snapToGrid(y);
      }
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { previewX: x, previewY: y },
      });
    },

    onMouseDown(modelPos, e) {
      if (e.button !== 0) return;
      let x = modelPos.x;
      let y = modelPos.y;
      if (snapEnabled) {
        x = snapToGrid(x);
        y = snapToGrid(y);
      }
      const column = createColumn(x, y);
      dispatch({ type: 'COLUMN_ADD', floorId: activeFloorId, column });
    },

    onKeyDown(e) {
      if (e.key === 'Escape') {
        editorDispatch({ type: 'SET_TOOL', tool: 'select' });
      }
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
