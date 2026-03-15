import { createGuidePoint } from '../../domain/constructionModels';
import { faceToDrawingPlane, identifyFace, GROUND_PLANE } from '../../domain/drawingPlane';
import { smartSnap3d } from '../snap';
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

function clearHover(editorDispatch) {
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      hoverPartId: null,
      hoverFaceId: null,
      snapResult: null,
    },
  });
}

export function createGuidePointHandler3d({
  dispatch,
  editorDispatch,
  project,
  snapEnabled,
  drawingPlane,
  inferenceCache,
}) {
  function snapPoint(point, plane, viewport) {
    if (!point) return { point: null, snapResult: null };
    if (!snapEnabled) return { point, snapResult: null };

    const inferencePoints = inferenceCache
      ? inferenceCache.getPoints(project.parts, project.annotations || [])
      : null;

    const snapResult = smartSnap3d(point, {
      inferencePoints,
      gridSize: SKETCH_GRID_MINOR,
      plane,
      camera: viewport?.getCamera?.(),
      domElement: viewport?.getDomElement?.(),
    });

    return { point: snapResult.point, snapResult };
  }

  return {
    onPointerDown(intersection, e, toolState, viewport) {
      if (e.button !== 0) return;

      const { point, plane } = getPlacementContext(intersection, drawingPlane, project);
      if (!point) return;

      const snapped = snapPoint(point, plane, viewport);
      if (!snapped.point) return;

      const annotation = createGuidePoint(snapped.point);
      dispatch({ type: 'ANNOTATION_ADD', annotation });
      editorDispatch({ type: 'SELECT_OBJECT', id: annotation.id, objectType: 'annotation' });
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: 'Guide point added.',
      });
    },

    onPointerMove() {},

    onHover(intersection, e, toolState, viewport) {
      const { hostPart, faceId, point, plane } = getPlacementContext(intersection, drawingPlane, project);
      if (!point) {
        clearHover(editorDispatch);
        return;
      }

      const snapped = snapPoint(point, plane, viewport);
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

    onKeyDown(e) {
      if (e.key === 'Escape') {
        clearHover(editorDispatch);
      }
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
