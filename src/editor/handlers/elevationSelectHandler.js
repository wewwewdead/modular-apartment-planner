import { buildProjectElevationScene } from '@/elevations/scene';
import { getElevationView, projectElevationHorizontal } from '@/elevations/projection';
import { resolveWallVerticalSpan } from '@/domain/wallFit';
import { elevationRegionContainsPoint, getVisibleElevationDrawables } from '@/elevations/visibility';
import { clampWallOpeningOffset, wallLength } from '@/geometry/wallGeometry';

const EPSILON = 1e-6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  for (const element of getVisibleElevationDrawables(scene)) {
    if (element.category !== 'window' || !element.sourceId) continue;
    if (elevationRegionContainsPoint(element, modelPos)) {
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

      const view = getElevationView(viewMode);
      const startHorizontal = projectElevationHorizontal(view, wall.start);
      const endHorizontal = projectElevationHorizontal(view, wall.end);
      const projectedSpan = endHorizontal - startHorizontal;

      let nextOffset = windowItem.offset;
      if (Math.abs(projectedSpan) > EPSILON) {
        const t = (modelPos.x - startHorizontal) / projectedSpan;
        nextOffset = clampWallOpeningOffset(wallLen, windowItem.width, t * wallLen);
      }

      // Dragged against the span the elevation actually drew, not the wall's
      // stored height: a bypass wall is taller than the number on it, and a
      // sill clamped to that number would stop short of the glass on screen.
      // The sill is still measured from the floor, which is where it is typed.
      const span = resolveWallVerticalSpan(wall, floor, project);
      const maxSillHeight = Math.max(0, span.top - span.datum - (windowItem.height ?? 0));
      const sceneHeight = -modelPos.y;
      const nextSillHeight = clamp(sceneHeight - span.datum, 0, maxSillHeight);

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
