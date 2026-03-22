import { createWall } from '@/domain/models';
import { FILLET_DEFAULT_RADIUS, FILLET_RADIUS_STEP, FILLET_MIN_RADIUS, FILLET_MAX_RADIUS, SNAP_DISTANCE_PX } from '@/domain/defaults';
import { findCorner, computeFilletGeometry } from '@/geometry/filletGeometry';

export function createFilletPlaceHandler({ dispatch, editorDispatch, getFloor, activeFloorId, viewport, activePhaseId }) {
  return {
    onMouseMove(modelPos, e, toolState) {
      const floor = getFloor(activeFloorId);
      if (!floor) return;

      const radius = toolState.radius ?? FILLET_DEFAULT_RADIUS;
      const tolerance = (SNAP_DISTANCE_PX / viewport.zoom) * 2;
      const corner = findCorner(floor.walls, modelPos, tolerance);

      if (corner) {
        const geometry = computeFilletGeometry(
          corner.wall1, corner.wall1Endpoint,
          corner.wall2, corner.wall2Endpoint,
          radius,
        );
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            radius,
            hoveredCorner: corner,
            previewGeometry: geometry,
          },
        });
      } else {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            radius,
            hoveredCorner: null,
            previewGeometry: null,
          },
        });
      }
    },

    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const corner = toolState.hoveredCorner;
      const geometry = toolState.previewGeometry;
      if (!corner || !geometry) return;

      const { wall1, wall1Endpoint, wall2, wall2Endpoint } = corner;
      const { tangentPoint1, tangentPoint2, controlPoint } = geometry;

      const arcWall = createWall(tangentPoint1, tangentPoint2, wall1.thickness, {
        controlPoint,
        height: wall1.height,
      });
      arcWall.phaseId = activePhaseId || null;

      dispatch({
        type: 'FILLET_APPLY',
        floorId: activeFloorId,
        wall1Id: wall1.id,
        wall1Endpoint: wall1Endpoint,
        tangentPoint1,
        wall2Id: wall2.id,
        wall2Endpoint: wall2Endpoint,
        tangentPoint2,
        arcWall,
      });

      // Clear preview after applying
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          radius: toolState.radius ?? FILLET_DEFAULT_RADIUS,
          hoveredCorner: null,
          previewGeometry: null,
        },
      });
    },

    onMouseUp() {},

    onKeyDown(e, toolState) {
      if (e.key === 'Escape') {
        editorDispatch({ type: 'SET_TOOL', tool: 'select' });
        return;
      }

      const radius = toolState.radius ?? FILLET_DEFAULT_RADIUS;

      if (e.key === ']') {
        const newRadius = Math.min(FILLET_MAX_RADIUS, radius + FILLET_RADIUS_STEP);
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { ...toolState, radius: newRadius },
        });
      }
      if (e.key === '[') {
        const newRadius = Math.max(FILLET_MIN_RADIUS, radius - FILLET_RADIUS_STEP);
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { ...toolState, radius: newRadius },
        });
      }
    },

    getCursor(toolState) {
      if (toolState.hoveredCorner && toolState.previewGeometry) return 'crosshair';
      return 'default';
    },
  };
}
