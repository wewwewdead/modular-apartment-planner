import { createColumn } from '@/domain/models';
import { snapToGrid } from './handlerSnapUtils';

export function createColumnPlaceHandler({
  dispatch,
  editorDispatch,
  getFloor,
  activeFloorId,
  snapEnabled,
  activePhaseId,
}) {
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
      // A second press with no move between (a double-click) would stack a
      // column on the one the first press just placed, so the press checks the
      // floor as it is now (see the door tool).
      const floor = getFloor(activeFloorId);
      const alreadyThere = (floor?.columns || []).some(
        (entry) =>
          (entry.type ?? 'rectangular') === column.type &&
          entry.x === x &&
          entry.y === y &&
          (entry.rotation ?? 0) === column.rotation,
      );
      if (alreadyThere) return;
      column.phaseId = activePhaseId || null;
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
