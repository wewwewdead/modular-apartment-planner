import { createBeam } from '@/domain/models';
import { BEAM_WIDTH, BEAM_DEPTH } from '@/domain/defaults';
import { getFloorElevation, getFloorTopElevation } from '@/domain/floorModels';
import { columnOutline } from '@/geometry/columnGeometry';
import { pointInPolygon } from '@/geometry/polygon';

function findColumnAtPoint(columns, modelPos) {
  for (const column of columns || []) {
    if (pointInPolygon(modelPos, columnOutline(column))) {
      return column;
    }
  }
  return null;
}

export function createBeamPlaceHandler({ dispatch, editorDispatch, getFloor, activeFloorId, activePhaseId }) {
  return {
    onMouseMove(modelPos, e, toolState) {
      const floor = getFloor(activeFloorId);
      if (!floor) return;

      const hoveredColumn = findColumnAtPoint(floor.columns || [], modelPos);
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          previewColumnId: hoveredColumn?.id || null,
        },
      });
    },

    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const floor = getFloor(activeFloorId);
      if (!floor) return;

      const column = findColumnAtPoint(floor.columns || [], modelPos);
      if (!column) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Click a column to place a beam.' });
        return;
      }

      if (!toolState.startColumnId) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            startColumnId: column.id,
            previewColumnId: column.id,
          },
        });
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Select the end column for the beam.' });
        return;
      }

      if (toolState.startColumnId === column.id) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Choose a different end column.' });
        return;
      }

      const placementRole = toolState.beamPlacementMode === 'roof_ring' ? 'roof_ring' : 'floor';
      const beamLevel = placementRole === 'roof_ring' ? getFloorTopElevation(floor) : getFloorElevation(floor);
      const beam = createBeam(
        { kind: 'column', id: toolState.startColumnId },
        { kind: 'column', id: column.id },
        BEAM_WIDTH,
        BEAM_DEPTH,
        beamLevel,
        { placementRole },
      );

      beam.phaseId = activePhaseId || null;
      dispatch({ type: 'BEAM_ADD', floorId: activeFloorId, beam });
      editorDispatch({ type: 'SELECT_OBJECT', id: beam.id, objectType: 'beam' });
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          startColumnId: null,
          previewColumnId: null,
        },
      });
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message:
          placementRole === 'roof_ring'
            ? `Top / roof beam created at ${Math.round(beamLevel)} mm.`
            : `Floor / slab beam created at ${Math.round(beamLevel)} mm.`,
      });
    },

    onKeyDown(e) {
      if (e.key === 'Escape') {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            startColumnId: null,
            previewColumnId: null,
          },
        });
        editorDispatch({ type: 'SET_TOOL', tool: 'select' });
      }
    },

    getCursor(toolState) {
      return toolState.startColumnId ? 'copy' : 'crosshair';
    },
  };
}
