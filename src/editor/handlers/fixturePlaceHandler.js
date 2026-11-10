import { createFixture } from '@/domain/models';
import { FIXTURE_TYPES } from '@/editor/tools';
import { snapToGrid } from './handlerSnapUtils';
import { isBareKey } from './bareKey';

export function createFixturePlaceHandler({
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

    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;
      let x = modelPos.x;
      let y = modelPos.y;
      if (snapEnabled) {
        x = snapToGrid(x);
        y = snapToGrid(y);
      }
      const fixtureType = toolState?.fixtureType || FIXTURE_TYPES.KITCHEN_TOP;
      const rotation = toolState?.previewRotation || 0;
      // A second press with no move between (a double-click) would stack the
      // same piece on the one the first press just placed, so the press checks
      // the floor as it is now (see the door tool).
      const floor = getFloor(activeFloorId);
      const alreadyThere = (floor?.fixtures || []).some(
        (entry) =>
          entry.fixtureType === fixtureType && entry.x === x && entry.y === y && (entry.rotation || 0) === rotation,
      );
      if (alreadyThere) return;
      const fixture = createFixture(fixtureType, x, y, { rotation });
      fixture.phaseId = activePhaseId || null;
      dispatch({ type: 'FIXTURE_ADD', floorId: activeFloorId, fixture });
    },

    // R turns the preview 90°; without the claim the plan's R (Room tool)
    // shortcut took the key first.
    claimsKey(e) {
      return isBareKey(e, 'r');
    },

    onKeyDown(e, toolState) {
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const current = toolState?.previewRotation || 0;
        const next = (current + 90) % 360;
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { previewRotation: next },
        });
      } else if (e.key === 'Escape') {
        editorDispatch({ type: 'SET_TOOL', tool: 'select' });
      }
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
