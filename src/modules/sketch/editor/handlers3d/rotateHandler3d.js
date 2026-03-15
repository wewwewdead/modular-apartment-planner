import { identifyFace, faceToDrawingPlane } from '../../domain/drawingPlane';

const SNAP_ANGLE = 15; // degrees

/**
 * Rotate tool. Click to set rotation center, drag to rotate.
 * Press X/Y/Z to set rotation axis. Shift = snap to 15-degree increments.
 * Numeric input for exact angle.
 */
export function createRotateHandler3d({ dispatch, editorDispatch, project, snapEnabled, selectedId, selectedType }) {
  function toDeg(rad) {
    return rad * (180 / Math.PI);
  }
  function toRad(deg) {
    return deg * (Math.PI / 180);
  }

  return {
    onPointerDown(intersection, e, toolState, viewport) {
      if (e.button !== 0) return;

      if (!intersection || !intersection.partId) {
        editorDispatch({ type: 'DESELECT' });
        return;
      }

      const part = project.parts.find((p) => p.id === intersection.partId);
      if (!part) return;

      // Set drawing plane from face
      if (intersection.faceNormal) {
        const faceId = identifyFace(intersection.faceNormal);
        const plane = faceToDrawingPlane(part, faceId);
        editorDispatch({ type: 'SET_DRAWING_PLANE', plane });
      }

      editorDispatch({ type: 'SELECT_OBJECT', id: part.id, objectType: 'part' });
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          rotating: true,
          rotatePartId: part.id,
          startPoint: intersection.point,
          rotationAxis: toolState.rotationAxis || 'z',
          startAngle: 0,
          currentAngle: 0,
          numericInput: '',
        },
      });
    },

    onPointerMove(intersection, e, toolState, viewport) {
      if (!toolState.rotating || !toolState.startPoint || !toolState.rotatePartId) return;

      const currentPoint = intersection?.planePoint;
      if (!currentPoint) return;

      const start = toolState.startPoint;
      const dx = currentPoint.x - start.x;
      const dy = currentPoint.z - start.z;

      let angle = toDeg(Math.atan2(dy, dx));

      // Shift = snap to 15-degree increments
      if (e.shiftKey) {
        angle = Math.round(angle / SNAP_ANGLE) * SNAP_ANGLE;
      }

      const part = project.parts.find((p) => p.id === toolState.rotatePartId);
      if (!part) return;

      const rotation = { ...part.rotation };
      const axis = toolState.rotationAxis || 'z';
      rotation[axis] = toRad(angle);

      dispatch({
        type: 'PART_UPDATE',
        part: { id: part.id, rotation },
      });

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { currentAngle: angle },
      });
    },

    onHover(intersection, e, toolState) {
      if (toolState.rotating) return;

      if (intersection?.partId) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { hoverPartId: intersection.partId, hoverFaceId: null },
        });
      } else if (toolState.hoverPartId) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { hoverPartId: null, hoverFaceId: null },
        });
      }
    },

    onPointerUp(intersection, e, toolState) {
      if (toolState.rotating) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            rotating: false,
            startPoint: null,
            rotatePartId: null,
          },
        });
      }
    },

    onDoubleClick() {},

    onKeyDown(e, toolState, currentSelectedId) {
      const key = e.key.toLowerCase();

      // Rotation axis shortcuts
      if (key === 'x' || key === 'y' || key === 'z') {
        e.preventDefault();
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { rotationAxis: key },
        });
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: `Rotation axis: ${key.toUpperCase()}`,
        });
        return;
      }

      // Numeric input
      if (toolState.rotating || currentSelectedId) {
        if (e.key >= '0' && e.key <= '9') {
          e.preventDefault();
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { numericInput: (toolState.numericInput || '') + e.key },
          });
          return;
        }

        if (e.key === '-' && !(toolState.numericInput || '').includes('-')) {
          e.preventDefault();
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { numericInput: '-' + (toolState.numericInput || '') },
          });
          return;
        }

        if (e.key === 'Backspace' && toolState.numericInput) {
          e.preventDefault();
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { numericInput: toolState.numericInput.slice(0, -1) },
          });
          return;
        }

        if (e.key === 'Enter' && toolState.numericInput && currentSelectedId) {
          e.preventDefault();
          const angle = parseFloat(toolState.numericInput);
          if (!isNaN(angle)) {
            const part = project.parts.find((p) => p.id === currentSelectedId);
            if (part) {
              const rotation = { ...part.rotation };
              const axis = toolState.rotationAxis || 'z';
              rotation[axis] = toRad(angle);
              dispatch({ type: 'PART_UPDATE', part: { id: part.id, rotation } });
              editorDispatch({
                type: 'SET_STATUS_MESSAGE',
                message: `Rotated ${angle} degrees around ${axis.toUpperCase()}`,
              });
            }
          }
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { numericInput: '', rotating: false, rotatePartId: null },
          });
          return;
        }
      }

      if (e.key === 'Escape') {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { rotating: false, startPoint: null, rotatePartId: null, numericInput: '' },
        });
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && currentSelectedId) {
        dispatch({ type: 'PART_DELETE', partId: currentSelectedId });
        editorDispatch({ type: 'DESELECT' });
      }
    },

    getCursor(toolState) {
      if (toolState?.rotating) return 'grabbing';
      return 'crosshair';
    },
  };
}
