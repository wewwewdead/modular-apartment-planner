import { createGuideLine } from '../../domain/constructionModels';
import {
  faceToDrawingPlane,
  identifyFace,
  projectToPlane,
  planeLocalToWorld,
  GROUND_PLANE,
} from '../../domain/drawingPlane';
import { smartSnap3d, snapToGrid } from '../snap';
import { SKETCH_GRID_MINOR } from '../../domain/defaults';

function toDomainPoint(point) {
  if (!point) return null;
  return { x: point.x, y: point.z, z: point.y };
}

function getPlacementContext(intersection, drawingPlane, project) {
  if (intersection?.partId && intersection?.faceNormal && intersection?.point) {
    const hostPart = project.parts.find((part) => part.id === intersection.partId);
    const faceId = identifyFace(intersection.faceNormal);
    return {
      hostPart,
      faceId,
      plane: hostPart ? faceToDrawingPlane(hostPart, faceId) : (drawingPlane || GROUND_PLANE),
      point: toDomainPoint(intersection.point),
    };
  }

  return {
    hostPart: null,
    faceId: null,
    plane: drawingPlane || GROUND_PLANE,
    point: intersection?.drawingPlanePoint || null,
  };
}

function clearToolState(editorDispatch) {
  editorDispatch({ type: 'UNLOCK_PLANE' });
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      drawingGuideLine: false,
      guideLinePlane: null,
      guideLineStartLocal: null,
      guideLineCurrentLocal: null,
      hoverPartId: null,
      hoverFaceId: null,
      snapResult: null,
    },
  });
}

export function createGuideLineHandler3d({
  dispatch,
  editorDispatch,
  project,
  snapEnabled,
  drawingPlane,
  inferenceCache,
}) {
  function snapLocal(local, plane, viewport) {
    if (!snapEnabled) return { local, snapResult: null };

    const worldPoint = planeLocalToWorld(local.u, local.v, plane);
    const inferencePoints = inferenceCache
      ? inferenceCache.getPoints(project.parts, project.annotations || [])
      : null;

    const snapResult = smartSnap3d(worldPoint, {
      inferencePoints,
      gridSize: SKETCH_GRID_MINOR,
      plane,
      camera: viewport?.getCamera?.(),
      domElement: viewport?.getDomElement?.(),
    });

    if (snapResult?.inference) {
      return {
        local: projectToPlane(snapResult.point, plane),
        snapResult,
      };
    }

    return {
      local: {
        u: snapToGrid(local.u, SKETCH_GRID_MINOR),
        v: snapToGrid(local.v, SKETCH_GRID_MINOR),
      },
      snapResult,
    };
  }

  function commitLine(plane, startLocal, endLocal) {
    if (!plane || !startLocal || !endLocal) {
      clearToolState(editorDispatch);
      return;
    }

    if (Math.hypot(endLocal.u - startLocal.u, endLocal.v - startLocal.v) < 10) {
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: 'Guide line needs two distinct points.',
      });
      clearToolState(editorDispatch);
      return;
    }

    const annotation = createGuideLine(
      planeLocalToWorld(startLocal.u, startLocal.v, plane),
      planeLocalToWorld(endLocal.u, endLocal.v, plane),
    );
    dispatch({ type: 'ANNOTATION_ADD', annotation });
    editorDispatch({ type: 'SELECT_OBJECT', id: annotation.id, objectType: 'annotation' });
    editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Guide line added.' });
    clearToolState(editorDispatch);
  }

  return {
    onPointerDown(intersection, e, toolState, viewport) {
      if (e.button !== 0) return;

      const { hostPart, faceId, plane, point } = getPlacementContext(intersection, drawingPlane, project);
      if (!point) return;

      const local = projectToPlane(point, plane);
      const snapped = snapLocal(local, plane, viewport);

      if (!toolState.drawingGuideLine) {
        editorDispatch({ type: 'LOCK_PLANE' });
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            drawingGuideLine: true,
            guideLinePlane: plane,
            guideLineStartLocal: snapped.local,
            guideLineCurrentLocal: snapped.local,
            hoverPartId: hostPart?.id || null,
            hoverFaceId: faceId || null,
            snapResult: snapped.snapResult,
          },
        });
        return;
      }

      commitLine(toolState.guideLinePlane || plane, toolState.guideLineStartLocal, snapped.local);
    },

    onPointerMove(intersection, e, toolState, viewport) {
      const activePlane = toolState.guideLinePlane || drawingPlane || GROUND_PLANE;
      const point = intersection?.drawingPlanePoint || toDomainPoint(intersection?.point);
      if (!point) return;

      const local = projectToPlane(point, activePlane);
      const snapped = snapLocal(local, activePlane, viewport);

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          guideLineCurrentLocal: snapped.local,
          snapResult: snapped.snapResult,
        },
      });
    },

    onHover(intersection, e, toolState, viewport) {
      if (toolState.drawingGuideLine) return;

      const { hostPart, faceId, plane, point } = getPlacementContext(intersection, drawingPlane, project);
      if (!point) {
        clearToolState(editorDispatch);
        return;
      }

      const local = projectToPlane(point, plane);
      const snapped = snapLocal(local, plane, viewport);
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          hoverPartId: hostPart?.id || null,
          hoverFaceId: faceId || null,
          snapResult: snapped.snapResult,
        },
      });
    },

    onPointerUp() {},
    onDoubleClick() {},

    onKeyDown(e, toolState) {
      if (e.key === 'Escape') {
        clearToolState(editorDispatch);
        return;
      }

      if (e.key === 'Enter' && toolState.drawingGuideLine) {
        e.preventDefault();
        commitLine(toolState.guideLinePlane, toolState.guideLineStartLocal, toolState.guideLineCurrentLocal);
      }
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
