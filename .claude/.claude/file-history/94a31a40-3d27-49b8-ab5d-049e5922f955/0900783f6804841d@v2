import { createWall } from '@/domain/models';
import { distance } from '@/geometry/point';
import { SNAP_DISTANCE_PX, MIN_WALL_LENGTH } from '@/domain/defaults';
import { snapWallEndpoint } from '@/geometry/wallColumnGeometry';

function constrainAngle(start, end, shiftHeld) {
  if (!shiftHeld) return end;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.sqrt(dx * dx + dy * dy);
  return {
    x: start.x + Math.cos(snapAngle) * len,
    y: start.y + Math.sin(snapAngle) * len,
  };
}

export function createWallDrawHandler({ dispatch, editorDispatch, getFloor, activeFloorId, viewport, snapEnabled, activePhaseId }) {
  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      const floor = getFloor(activeFloorId);
      if (!floor) return;
      const snapDistModel = SNAP_DISTANCE_PX / viewport.zoom;
      const shiftHeld = e.shiftKey;

      let snapped = modelPos;
      let attachment = null;
      if (snapEnabled) {
        const snapResult = snapWallEndpoint(modelPos, {
          walls: floor.walls,
          columns: floor.columns || [],
          snapDist: snapDistModel,
          chainStart: toolState.chainStart,
          otherPoint: toolState.start,
        });
        if (snapResult) {
          snapped = { ...snapResult.point };
          attachment = snapResult.attachment;
        }
      }
      if (shiftHeld && toolState.start) {
        snapped = constrainAngle(toolState.start, snapped, true);
        attachment = null;
      }

      if (!toolState.start) {
        // First click: set start
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { start: snapped, chainStart: snapped, startAttachment: attachment, preview: null },
        });
      } else {
        // Second+ click: create wall and chain
        const endPt = snapped;

        const len = distance(toolState.start, endPt);
        if (len < MIN_WALL_LENGTH) return;

        const wall = createWall(toolState.start, endPt, undefined, {
          startAttachment: toolState.startAttachment || null,
          endAttachment: attachment,
        });
        wall.phaseId = activePhaseId || null;
        dispatch({ type: 'WALL_ADD', floorId: activeFloorId, wall });

        // Check if we snapped back to chain start (close loop)
        if (toolState.chainStart && distance(endPt, toolState.chainStart) < snapDistModel) {
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { start: null, chainStart: null, startAttachment: null, preview: null },
          });
        } else {
          // Chain: end becomes new start
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { start: endPt, startAttachment: attachment, preview: null },
          });
        }
      }
    },

    onMouseMove(modelPos, e, toolState) {
      if (!toolState.start) return;
      let preview = modelPos;

      const floor = getFloor(activeFloorId);
      if (!floor) return;
      const snapDistModel = SNAP_DISTANCE_PX / viewport.zoom;
      if (snapEnabled) {
        const snapResult = snapWallEndpoint(modelPos, {
          walls: floor.walls,
          columns: floor.columns || [],
          snapDist: snapDistModel,
          chainStart: toolState.chainStart,
          otherPoint: toolState.start,
        });
        if (snapResult) preview = { ...snapResult.point };
      }
      if (e.shiftKey) {
        preview = constrainAngle(toolState.start, preview, true);
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { preview },
      });
    },

    onDoubleClick(modelPos, e, toolState) {
      // Finish chain
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { start: null, chainStart: null, startAttachment: null, preview: null },
      });
    },

    onKeyDown(e, toolState) {
      if (e.key === 'Escape') {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { start: null, chainStart: null, startAttachment: null, preview: null },
        });
      }
    },

    getCursor(toolState) {
      return 'crosshair';
    },
  };
}
