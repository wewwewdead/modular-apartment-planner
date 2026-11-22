import { createDrain } from '@/domain/roofModels';
import { roofContainsPoint } from '@/geometry/roofPlanGeometry';
import { findContextRoofAt, otherRoofMessage } from './roofContextPick';

export function createRoofDrainPlaceHandler({ dispatch, editorDispatch, roofSystem, contextRoofSystems = [] }) {
  return {
    onMouseDown(modelPos, e) {
      if (e.button !== 0 || !roofSystem) return;
      if (!roofContainsPoint(roofSystem, modelPos)) {
        // The tool stays on the active roof; a press on another one says so.
        const otherRoof = findContextRoofAt(contextRoofSystems, modelPos);
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: otherRoof ? otherRoofMessage(otherRoof) : 'Place drains inside the roof boundary.',
        });
        return;
      }

      // A second press with no move between (a double-click) would stack a
      // drain on the one the first press just placed (see the column tool).
      const alreadyThere = (roofSystem.drains || []).some(
        (entry) => entry.position?.x === modelPos.x && entry.position?.y === modelPos.y,
      );
      if (alreadyThere) return;

      const drain = createDrain(modelPos);
      dispatch({ type: 'DRAIN_ADD', roofId: roofSystem?.id || null, drain });
      editorDispatch({ type: 'SELECT_OBJECT', id: drain.id, objectType: 'drain' });
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Created drain.' });
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
