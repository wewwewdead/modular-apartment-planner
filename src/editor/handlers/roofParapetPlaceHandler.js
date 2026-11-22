import { MIN_WALL_LENGTH, SNAP_DISTANCE_PX } from '@/domain/defaults';
import { createParapet } from '@/domain/roofModels';
import { distance } from '@/geometry/point';
import { findNearestParapetCandidateEdge, roofContainsPoint } from '@/geometry/roofPlanGeometry';
import { findContextRoofAt, otherRoofMessage } from './roofContextPick';

function resetToolState(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      roofParapetStart: null,
      roofParapetPreview: null,
      roofParapetSnapEdge: null,
      roofParapetSnapStart: null,
      roofParapetSnapEnd: null,
    },
  });
}

// An edge-following parapet already standing on exactly this edge, end to end.
function edgeAlreadyHasParapet(roofSystem, edge) {
  return (roofSystem.parapets || []).some(
    (entry) =>
      entry.attachment?.type === 'roof_edge' &&
      entry.attachment.edgeIndex === edge.index &&
      entry.startPoint?.x === edge.start.x &&
      entry.startPoint?.y === edge.start.y &&
      entry.endPoint?.x === edge.end.x &&
      entry.endPoint?.y === edge.end.y,
  );
}

export function createRoofParapetPlaceHandler({
  dispatch,
  editorDispatch,
  roofSystem,
  contextRoofSystems = [],
  viewport,
}) {
  const snapDistance = () => SNAP_DISTANCE_PX / Math.max(0.0001, viewport.zoom);

  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0 || !roofSystem) return;

      const start = toolState.roofParapetStart;
      const snapEdge = toolState.roofParapetSnapEdge;

      // A second press with no move between (a double-click) finds the snap
      // edge already cleared by the first press's commit, and would start a
      // free parapet on the spot; with a move between, it would stack a second
      // parapet on the same edge. Either way the edge under the press already
      // carries the parapet the first press made, so the press does nothing.
      if (!start && !e.shiftKey) {
        const edgeHere = snapEdge || findNearestParapetCandidateEdge(roofSystem, modelPos, snapDistance())?.edge;
        if (edgeHere && edgeAlreadyHasParapet(roofSystem, edgeHere)) return;
      }

      // A first press that is neither on an edge of the active roof nor inside
      // it, but inside another roof, was meant for that roof: the tool stays on
      // the active one and says so, rather than starting a free parapet there.
      if (!start && !snapEdge && !roofContainsPoint(roofSystem, modelPos)) {
        const otherRoof = findContextRoofAt(contextRoofSystems, modelPos);
        if (otherRoof) {
          editorDispatch({ type: 'SET_STATUS_MESSAGE', message: otherRoofMessage(otherRoof) });
          return;
        }
      }

      if (!start && snapEdge && !e.shiftKey) {
        const parapet = createParapet(snapEdge.start, snapEdge.end, {
          attachment: {
            type: 'roof_edge',
            edgeIndex: snapEdge.index,
            startOffset: 0,
            endOffset: snapEdge.length,
          },
        });
        dispatch({ type: 'PARAPET_ADD', roofId: roofSystem?.id || null, parapet });
        editorDispatch({ type: 'SELECT_OBJECT', id: parapet.id, objectType: 'parapet' });
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Created edge-following parapet.' });
        resetToolState(editorDispatch);
        return;
      }

      if (!start) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            roofParapetStart: { x: modelPos.x, y: modelPos.y },
            roofParapetPreview: { x: modelPos.x, y: modelPos.y },
            roofParapetSnapEdge: null,
            roofParapetSnapStart: null,
            roofParapetSnapEnd: null,
          },
        });
        return;
      }

      if (distance(start, modelPos) < MIN_WALL_LENGTH) return;

      const parapet = createParapet(start, modelPos);
      dispatch({ type: 'PARAPET_ADD', roofId: roofSystem?.id || null, parapet });
      editorDispatch({ type: 'SELECT_OBJECT', id: parapet.id, objectType: 'parapet' });
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Created parapet.' });
      resetToolState(editorDispatch);
    },

    onMouseMove(modelPos, e, toolState) {
      if (!toolState.roofParapetStart) {
        const nearestEdge = findNearestParapetCandidateEdge(roofSystem, modelPos, snapDistance());
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            roofParapetSnapEdge: nearestEdge?.edge || null,
            roofParapetSnapStart: nearestEdge?.edge?.start || null,
            roofParapetSnapEnd: nearestEdge?.edge?.end || null,
          },
        });
        return;
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          roofParapetPreview: { x: modelPos.x, y: modelPos.y },
          roofParapetSnapEdge: null,
          roofParapetSnapStart: null,
          roofParapetSnapEnd: null,
        },
      });
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
