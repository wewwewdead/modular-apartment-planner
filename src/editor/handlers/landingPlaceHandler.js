import { createLanding } from '@/domain/models';
import { GRID_MINOR } from '@/domain/defaults';

function snapToGrid(value) {
  return Math.round(value / GRID_MINOR) * GRID_MINOR;
}

export function createLandingPlaceHandler({ dispatch, editorDispatch, activeFloorId, snapEnabled, activePhaseId }) {
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
      const landing = createLanding({ x, y });
      landing.phaseId = activePhaseId || null;
      dispatch({ type: 'LANDING_ADD', floorId: activeFloorId, landing });
      editorDispatch({ type: 'SELECT_OBJECT', id: landing.id, objectType: 'landing' });
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Landing placed.' });
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
