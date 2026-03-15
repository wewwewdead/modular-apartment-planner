import { createFixture } from '@/domain/models';
import { GRID_MINOR } from '@/domain/defaults';
import { FIXTURE_TYPES } from '@/editor/tools';

function snapToGrid(value) {
  return Math.round(value / GRID_MINOR) * GRID_MINOR;
}

export function createFixturePlaceHandler({ dispatch, editorDispatch, getFloor, activeFloorId, snapEnabled, activePhaseId }) {
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
      const fixture = createFixture(fixtureType, x, y, { rotation });
      fixture.phaseId = activePhaseId || null;
      dispatch({ type: 'FIXTURE_ADD', floorId: activeFloorId, fixture });
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
