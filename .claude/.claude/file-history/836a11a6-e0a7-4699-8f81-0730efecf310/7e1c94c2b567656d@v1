import { createSlab } from '@/domain/models';
import { SNAP_DISTANCE_PX } from '@/domain/defaults';
import { distance } from '@/geometry/point';

function resetSlabToolState(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      slabPoints: [],
      slabPreviewPoint: null,
    },
  });
}

export function createSlabPlaceHandler({ dispatch, editorDispatch, getFloor, activeFloorId, viewport }) {
  function commitSlab(points) {
    const floor = getFloor(activeFloorId);
    if (!floor || points.length < 3) return;

    if (floor.slab) {
      dispatch({
        type: 'SLAB_UPDATE',
        floorId: activeFloorId,
        slab: {
          id: floor.slab.id,
          floorId: floor.id,
          boundaryPoints: points,
        },
      });
      editorDispatch({ type: 'SELECT_OBJECT', id: floor.slab.id, objectType: 'slab' });
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Updated slab boundary.' });
    } else {
      const slab = createSlab(floor.id, points);
      dispatch({ type: 'SLAB_SET', floorId: activeFloorId, slab });
      editorDispatch({ type: 'SELECT_OBJECT', id: slab.id, objectType: 'slab' });
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Created floor slab.' });
    }

    resetSlabToolState(editorDispatch);
  }

  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const floor = getFloor(activeFloorId);
      if (!floor) return;

      const points = toolState.slabPoints || [];
      const closeDistance = SNAP_DISTANCE_PX / viewport.zoom;

      if (points.length === 0) {
        if (floor.slab) {
          editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Draw a new slab boundary to replace the current one.' });
        }
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            slabPoints: [{ x: modelPos.x, y: modelPos.y }],
            slabPreviewPoint: { x: modelPos.x, y: modelPos.y },
          },
        });
        return;
      }

      if (points.length >= 3 && distance(modelPos, points[0]) <= closeDistance) {
        commitSlab(points);
        return;
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          slabPoints: [...points, { x: modelPos.x, y: modelPos.y }],
          slabPreviewPoint: { x: modelPos.x, y: modelPos.y },
        },
      });
    },

    onMouseMove(modelPos, e, toolState) {
      if (!(toolState.slabPoints || []).length) return;
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          slabPreviewPoint: { x: modelPos.x, y: modelPos.y },
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
