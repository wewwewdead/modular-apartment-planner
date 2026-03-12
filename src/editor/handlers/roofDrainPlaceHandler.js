import { createDrain } from '@/domain/roofModels';
import { roofContainsPoint } from '@/geometry/roofPlanGeometry';

export function createRoofDrainPlaceHandler({ dispatch, editorDispatch, roofSystem }) {
  return {
    onMouseDown(modelPos, e) {
      if (e.button !== 0 || !roofSystem) return;
      if (!roofContainsPoint(roofSystem, modelPos)) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Place drains inside the roof boundary.' });
        return;
      }

      const drain = createDrain(modelPos);
      dispatch({ type: 'DRAIN_ADD', drain });
      editorDispatch({ type: 'SELECT_OBJECT', id: drain.id, objectType: 'drain' });
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Created drain.' });
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
