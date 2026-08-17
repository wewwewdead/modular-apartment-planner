import { createSlab } from '@/domain/models';
import { SNAP_DISTANCE_PX } from '@/domain/defaults';
import { getFloorElevation } from '@/domain/floorModels';
import { distance } from '@/geometry/point';
import { resolveReferenceSnapGeometry, snapPointToReference } from './referenceSnap';

function resetSlabToolState(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      slabPoints: [],
      slabPreviewPoint: null,
    },
  });
}

export function createSlabPlaceHandler({
  dispatch,
  editorDispatch,
  getFloor,
  activeFloorId,
  viewport,
  activePhaseId,
  snapEnabled = false,
  floorBelow = null,
  showFloorBelowUnderlay = false,
}) {
  /**
   * Plate corners have no same-floor snapping of their own, so the floor below is
   * the only thing that can catch them: tracing a slab over the ghost lands its
   * corners on the walls and columns it will bear on. With the ghost hidden — or
   * snapping off — this is the raw cursor, exactly as before.
   */
  function resolveSlabPoint(modelPos) {
    const geometry = resolveReferenceSnapGeometry({ floorBelow, showFloorBelowUnderlay, snapEnabled });
    const hit = snapPointToReference(modelPos, geometry, SNAP_DISTANCE_PX / viewport.zoom);
    return hit ? { x: hit.x, y: hit.y } : { x: modelPos.x, y: modelPos.y };
  }

  function commitSlab(points) {
    const floor = getFloor(activeFloorId);
    if (!floor || points.length < 3) return;

    const slab = createSlab(floor.id, points, undefined, getFloorElevation(floor));
    slab.phaseId = activePhaseId || null;
    dispatch({ type: 'SLAB_ADD', floorId: activeFloorId, slab });
    editorDispatch({ type: 'SELECT_OBJECT', id: slab.id, objectType: 'slab' });
    editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Created slab.' });

    resetSlabToolState(editorDispatch);
  }

  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const floor = getFloor(activeFloorId);
      if (!floor) return;

      const points = toolState.slabPoints || [];
      const closeDistance = SNAP_DISTANCE_PX / viewport.zoom;
      const point = resolveSlabPoint(modelPos);

      if (points.length === 0) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            slabPoints: [point],
            slabPreviewPoint: { ...point },
          },
        });
        return;
      }

      // Measured on the point that would actually be placed: coming back around
      // to the first corner usually catches the same reference it did, so the
      // ring closes on the vertex rather than stacking a duplicate on top of it.
      if (points.length >= 3 && distance(point, points[0]) <= closeDistance) {
        commitSlab(points);
        return;
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          slabPoints: [...points, point],
          slabPreviewPoint: { ...point },
        },
      });
    },

    onMouseMove(modelPos, e, toolState) {
      if (!(toolState.slabPoints || []).length) return;
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          slabPreviewPoint: resolveSlabPoint(modelPos),
        },
      });
    },

    onDoubleClick(modelPos, e, toolState) {
      const points = toolState.slabPoints || [];
      if (points.length < 3) return;
      commitSlab(points);
    },

    onKeyDown(e) {
      if (e.key !== 'Escape') return;
      resetSlabToolState(editorDispatch);
      editorDispatch({ type: 'SET_TOOL', tool: 'select' });
    },

    getCursor(toolState) {
      return (toolState.slabPoints || []).length ? 'crosshair' : 'crosshair';
    },
  };
}
