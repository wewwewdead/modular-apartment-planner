import { buildProjectElevationScene } from '@/elevations/scene';
import { getElevationView, projectElevationHorizontal } from '@/elevations/projection';
import { getFloorElevation } from '@/domain/floorModels';
import { pointInPolygon } from '@/geometry/polygon';
import { wallLength } from '@/geometry/wallGeometry';

const EPSILON = 1e-6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectPolygon(element) {
  return [
    { x: element.left, y: -element.top },
    { x: element.right, y: -element.top },
    { x: element.right, y: -element.bottom },
    { x: element.left, y: -element.bottom },
  ];
}

function findWindowOwner(project, windowId) {
  for (const floor of project?.floors || []) {
    const windowItem = (floor.windows || []).find((entry) => entry.id === windowId);
    if (windowItem) {
      return { floor, windowItem };
    }
  }

  return { floor: null, windowItem: null };
}

function hitTestElevationWindow(modelPos, project, sourceFloorId, viewMode) {
  const scene = buildProjectElevationScene(project, sourceFloorId, viewMode);
  if (!scene?.elements?.length) return null;

  let hit = null;
  for (const element of scene.elements) {
    if (element.category !== 'window' || !element.sourceId) continue;
    if (pointInPolygon(modelPos, rectPolygon(element))) {
      const { floor } = findWindowOwner(project, element.sourceId);
      hit = { id: element.sourceId, type: 'window', floorId: floor?.id ?? null };
    }
  }

  return hit;
}

export function createElevationSelectHandler({ dispatch, editorDispatch, project, getFloor, activeFloorId, viewMode }) {
  return {
    onMouseDown(modelPos, e) {
      if (e.button !== 0) return;

      const floor = getFloor(activeFloorId);
      if (!floor) return;

      const hit = hitTestElevationWindow(modelPos, project, activeFloorId, viewMode);
      if (!hit) {
        editorDispatch({ type: 'DESELECT' });
        return;
      }

      editorDispatch({ type: 'SELECT_OBJECT', id: hit.id, objectType: hit.type });
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          dragging: true,
          dragType: 'elevation-window-move',
          startPos: modelPos,
        },
      });
    },

    onMouseMove(modelPos, e, toolState, selectedId, selectedType) {
      if (!toolState.dragging || toolState.dragType !== 'elevation-window-move') return;
      if (selectedType !== 'window' || !selectedId) return;

      const { floor, windowItem } = findWindowOwner(project, selectedId);
      if (!floor) return;
      if (!windowItem) return;

      const wall = (floor.walls || []).find((entry) => entry.id === windowItem.wallId);
      if (!wall) return;

      const wallLen = wallLength(wall);
      const halfWidth = (windowItem.width || 0) / 2;
      const minOffset = halfWidth;
      const maxOffset = Math.max(halfWidth, wallLen - halfWidth);

      const view = getElevationView(viewMode);
      const startHorizontal = projectElevationHorizontal(view, wall.start);
      const endHorizontal = projectElevationHorizontal(view, wall.end);
      const projectedSpan = endHorizontal - startHorizontal;

      let nextOffset = windowItem.offset;
      if (Math.abs(projectedSpan) > EPSILON) {
        const t = (modelPos.x - startHorizontal) / projectedSpan;
        nextOffset = clamp(t * wallLen, minOffset, maxOffset);
      }

      const wallBase = getFloorElevation(floor);
      const wallHeight = wall.height ?? 0;
      const maxSillHeight = Math.max(0, wallHeight - (windowItem.height ?? 0));
      const sceneHeight = -modelPos.y;
      const nextSillHeight = clamp(sceneHeight - wallBase, 0, maxSillHeight);

      dispatch({
        type: 'WINDOW_UPDATE',
        floorId: floor.id,
        window: {
          id: windowItem.id,
          offset: nextOffset,
          sillHeight: nextSillHeight,
        },
      });

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { startPos: modelPos },
      });
    },

    onMouseUp(modelPos, e, toolState) {
      if (!toolState.dragging) return;
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          dragging: false,
          dragType: null,
          startPos: null,
        },
      });
    },

    onKeyDown(e, toolState, selectedId, selectedType) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedType === 'window' && selectedId) {
        const { floor } = findWindowOwner(project, selectedId);
        if (!floor) return;
        dispatch({ type: 'WINDOW_DELETE', floorId: floor.id, windowId: selectedId });
        editorDispatch({ type: 'DESELECT' });
      }
    },

    getCursor(toolState) {
      if (toolState.dragging) return 'grabbing';
      return 'default';
    },
  };
}
