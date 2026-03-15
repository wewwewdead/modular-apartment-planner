import { createReferencePlane, createSectionPlane } from '../../domain/constructionModels';
import { faceToDrawingPlane, identifyFace, GROUND_PLANE } from '../../domain/drawingPlane';

function toDomainPoint(point) {
  if (!point) return null;
  return { x: point.x, y: point.z, z: point.y };
}

function buildPlacementPlane(intersection, drawingPlane, project) {
  if (intersection?.partId && intersection?.faceNormal && intersection?.point) {
    const part = project.parts.find((entry) => entry.id === intersection.partId);
    const faceId = identifyFace(intersection.faceNormal);
    const basePlane = part ? faceToDrawingPlane(part, faceId) : (drawingPlane || GROUND_PLANE);
    return {
      hostPart: part,
      faceId,
      plane: {
        ...basePlane,
        origin: toDomainPoint(intersection.point) || basePlane.origin,
      },
    };
  }

  return {
    hostPart: null,
    faceId: null,
    plane: {
      ...(drawingPlane || GROUND_PLANE),
      origin: intersection?.drawingPlanePoint || (drawingPlane || GROUND_PLANE).origin,
    },
  };
}

function createPlaneHandler(factory, label) {
  return function createHandler({
    dispatch,
    editorDispatch,
    project,
    drawingPlane,
  }) {
    return {
      onPointerDown(intersection, e) {
        if (e.button !== 0) return;
        const { plane } = buildPlacementPlane(intersection, drawingPlane, project);
        if (!plane) return;
        const annotation = factory(plane);
        dispatch({ type: 'ANNOTATION_ADD', annotation });
        editorDispatch({ type: 'SELECT_OBJECT', id: annotation.id, objectType: 'annotation' });
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: `${label} added.`,
        });
      },

      onPointerMove() {},

      onHover(intersection) {
        const { hostPart, faceId } = buildPlacementPlane(intersection, drawingPlane, project);
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            hoverPartId: hostPart?.id || null,
            hoverFaceId: faceId || null,
            snapResult: null,
          },
        });
      },

      onPointerUp() {},
      onDoubleClick() {},

      onKeyDown(e) {
        if (e.key === 'Escape') {
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: {
              hoverPartId: null,
              hoverFaceId: null,
              snapResult: null,
            },
          });
        }
      },

      getCursor() {
        return 'crosshair';
      },
    };
  };
}

export const createReferencePlaneHandler3d = createPlaneHandler(createReferencePlane, 'Reference plane');
export const createSectionPlaneHandler3d = createPlaneHandler(createSectionPlane, 'Section plane');
