import { GRID_MINOR, SNAP_DISTANCE_PX } from '@/domain/defaults';
import { createStair } from '@/domain/models';
import { add, distance, scale } from '@/geometry/point';
import { snapToLandingEdge } from '@/geometry/landingGeometry';
import { stairRun, stairDirectionVector } from '@/geometry/stairGeometry';

function snapToGrid(value) {
  return Math.round(value / GRID_MINOR) * GRID_MINOR;
}

function getAngleDegrees(startPoint, endPoint) {
  return (Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x) * 180) / Math.PI;
}

function resolvePoint(modelPos, snapEnabled) {
  if (!snapEnabled) return { x: modelPos.x, y: modelPos.y };
  return {
    x: snapToGrid(modelPos.x),
    y: snapToGrid(modelPos.y),
  };
}

function resetStairTool(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      stairStartPoint: null,
      stairPreviewPoint: null,
      stairPreviewAngle: null,
      startLandingAttachment: null,
    },
  });
}

export function createStairPlaceHandler({ dispatch, editorDispatch, getFloor, activeFloorId, viewport, snapEnabled }) {
  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      let point = resolvePoint(modelPos, snapEnabled);
      const floor = getFloor(activeFloorId);
      const landings = floor?.landings || [];
      const snapDist = SNAP_DISTANCE_PX / (viewport?.zoom || 0.1);

      if (!toolState.stairStartPoint) {
        // Try snap start to landing edge
        let startLandingAttachment = null;
        const startSnap = snapToLandingEdge(point, landings, snapDist);
        if (startSnap) {
          point = startSnap.point;
          startLandingAttachment = { landingId: startSnap.landingId, edge: startSnap.edge };
        }

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            stairStartPoint: point,
            stairPreviewPoint: point,
            stairPreviewAngle: 0,
            startLandingAttachment,
          },
        });
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Click again to set stair direction.' });
        return;
      }

      if (distance(toolState.stairStartPoint, point) < GRID_MINOR / 2) {
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Choose a direction farther from the stair start.' });
        return;
      }

      const angle = getAngleDegrees(toolState.stairStartPoint, point);

      // Check if end point snaps to a landing
      let endLandingAttachment = null;
      const tempStair = {
        startPoint: toolState.stairStartPoint,
        numberOfRisers: 18,
        treadDepth: 280,
        direction: { angle },
        width: 1000,
      };
      const run = stairRun(tempStair);
      const dir = stairDirectionVector(tempStair);
      const endPoint = add(toolState.stairStartPoint, scale(dir, run));
      const endSnap = snapToLandingEdge(endPoint, landings, snapDist);
      if (endSnap) {
        endLandingAttachment = { landingId: endSnap.landingId, edge: endSnap.edge };
      }

      const stair = createStair(
        toolState.stairStartPoint,
        undefined,
        undefined,
        undefined,
        undefined,
        { angle },
        { fromFloorId: activeFloorId, toFloorId: activeFloorId },
        {
          startLandingAttachment: toolState.startLandingAttachment || null,
          endLandingAttachment,
        }
      );

      dispatch({ type: 'STAIR_ADD', floorId: activeFloorId, stair });
      editorDispatch({ type: 'SELECT_OBJECT', id: stair.id, objectType: 'stair' });
      resetStairTool(editorDispatch);
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Stair created.' });
    },

    onMouseMove(modelPos, e, toolState) {
      if (!toolState.stairStartPoint) return;
      const point = resolvePoint(modelPos, snapEnabled);
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          stairPreviewPoint: point,
          stairPreviewAngle: getAngleDegrees(toolState.stairStartPoint, point),
        },
      });
    },

    onKeyDown(e) {
      if (e.key !== 'Escape') return;
      resetStairTool(editorDispatch);
      editorDispatch({ type: 'SET_TOOL', tool: 'select' });
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
