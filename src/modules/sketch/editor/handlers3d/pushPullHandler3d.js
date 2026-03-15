import { createPanel } from '../../domain/partModels';
import { createConstraint } from '../../domain/constraintModels';
import { computeExtrusionFromFace } from '../../domain/extrusion';
import { identifyFace } from '../../domain/drawingPlane';
import { snapToGrid, smartSnap3d } from '../snap';
import { SKETCH_GRID_MINOR } from '../../domain/defaults';

/**
 * Push/pull extrusion handler.
 * Click a face and drag outward to create a new part attached to that face.
 * Type a number + Enter for exact distance.
 */
export function createPushPullHandler3d({ dispatch, editorDispatch, project, snapEnabled, inferenceCache }) {
  /**
   * Snap extrusion distance along the extrusion axis using inference points.
   */
  function snapExtrusionDistance(distance, sourcePart, faceId, viewport) {
    if (!snapEnabled) return { distance, snapResult: null };

    if (!inferenceCache) {
      return { distance: snapToGrid(distance, SKETCH_GRID_MINOR), snapResult: null };
    }

    // Determine which axis the extrusion operates on
    const axisMap = {
      '+x': 'x', '-x': 'x',
      '+y': 'y', '-y': 'y',
      '+z': 'z', '-z': 'z',
    };
    const axis = axisMap[faceId];
    if (!axis) {
      return { distance: snapToGrid(distance, SKETCH_GRID_MINOR), snapResult: null };
    }

    // Compute where the extrusion endpoint would be
    const { position } = sourcePart;
    const dims = getSimpleDims(sourcePart);
    let endValue;
    const sign = faceId.startsWith('+') ? 1 : -1;

    if (sign > 0) {
      endValue = position[axis] + dims[axisToDim(axis)] + distance;
    } else {
      endValue = position[axis] - distance;
    }

    // Check if any inference point's axis value is close to endValue
    const inferencePoints = inferenceCache.getPoints(project.parts, project.annotations || [], sourcePart.id);
    const camera = viewport?.getCamera?.();
    const domElement = viewport?.getDomElement?.();

    // Use smartSnap3d with a synthetic point along the extrusion axis
    const probePoint = { ...position };
    probePoint[axis] = endValue;

    const snapResult = smartSnap3d(probePoint, {
      inferencePoints,
      gridSize: SKETCH_GRID_MINOR,
      camera,
      domElement,
    });

    if (snapResult.inference) {
      // Compute the snapped distance from the inference point's axis value
      let snappedEnd = snapResult.inference[axis];
      let snappedDistance;
      if (sign > 0) {
        snappedDistance = snappedEnd - position[axis] - dims[axisToDim(axis)];
      } else {
        snappedDistance = position[axis] - snappedEnd;
      }
      return { distance: snappedDistance, snapResult };
    }

    return { distance: snapToGrid(distance, SKETCH_GRID_MINOR), snapResult: null };
  }

  return {
    onPointerDown(intersection, e, toolState, viewport) {
      if (e.button !== 0) return;

      if (!intersection || !intersection.partId || !intersection.faceNormal) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { extruding: false, sourcePart: null, faceId: null, numericInput: '', snapResult: null },
        });
        return;
      }

      const part = project.parts.find((p) => p.id === intersection.partId);
      if (!part) return;

      const faceId = identifyFace(intersection.faceNormal);

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          extruding: true,
          sourcePart: part,
          faceId,
          startPoint: intersection.point,
          faceNormal: intersection.faceNormal,
          extrusionDistance: 0,
          numericInput: '',
          snapResult: null,
        },
      });
    },

    onPointerMove(intersection, e, toolState, viewport) {
      if (!toolState.extruding || !toolState.startPoint || !toolState.faceNormal) return;

      const currentPoint = intersection?.planePoint;
      if (!currentPoint) return;

      // Project mouse movement onto face normal axis
      const fn = toolState.faceNormal;
      const dx = currentPoint.x - toolState.startPoint.x;
      const dy = currentPoint.y - toolState.startPoint.y;
      const dz = currentPoint.z - toolState.startPoint.z;

      // Dot product with face normal gives distance along normal
      let distance = dx * fn.x + dy * fn.y + dz * fn.z;

      const { distance: snappedDistance, snapResult } = snapExtrusionDistance(
        distance, toolState.sourcePart, toolState.faceId, viewport
      );

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { extrusionDistance: snappedDistance, snapResult },
      });
    },

    onHover(intersection, e, toolState, viewport) {
      if (toolState.extruding) return;

      // Highlight face under cursor
      if (intersection?.partId && intersection?.faceNormal) {
        const part = project.parts.find((p) => p.id === intersection.partId);
        const faceId = identifyFace(intersection.faceNormal);

        if (part) {
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { hoverPartId: part.id, hoverFaceId: faceId },
          });
          return;
        }
      }

      if (toolState.hoverPartId) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { hoverPartId: null, hoverFaceId: null },
        });
      }
    },

    onPointerUp(intersection, e, toolState, viewport) {
      if (!toolState.extruding || !toolState.sourcePart || !toolState.faceId) return;

      const distance = toolState.extrusionDistance || 0;
      if (Math.abs(distance) < 1) {
        // Too small - keep state for numeric input
        return;
      }

      commitExtrusion(dispatch, editorDispatch, toolState.sourcePart, toolState.faceId, distance);
    },

    onKeyDown(e, toolState) {
      if (!toolState.extruding && !toolState.sourcePart) return;

      // Numeric input mode
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { numericInput: (toolState.numericInput || '') + e.key },
        });
        return;
      }

      if (e.key === '.' && !(toolState.numericInput || '').includes('.')) {
        e.preventDefault();
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { numericInput: (toolState.numericInput || '') + '.' },
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

      if (e.key === '-' && !(toolState.numericInput || '').includes('-')) {
        e.preventDefault();
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { numericInput: '-' + (toolState.numericInput || '') },
        });
        return;
      }

      if (e.key === 'Enter' && toolState.numericInput && toolState.sourcePart && toolState.faceId) {
        e.preventDefault();
        const distance = parseFloat(toolState.numericInput);
        if (!isNaN(distance) && Math.abs(distance) >= 1) {
          commitExtrusion(dispatch, editorDispatch, toolState.sourcePart, toolState.faceId, distance);
        }
        return;
      }

      if (e.key === 'Escape') {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            extruding: false,
            sourcePart: null,
            faceId: null,
            startPoint: null,
            faceNormal: null,
            extrusionDistance: 0,
            numericInput: '',
            snapResult: null,
          },
        });
      }
    },

    getCursor(toolState) {
      if (toolState?.extruding) return 'ns-resize';
      return 'crosshair';
    },
  };
}

function commitExtrusion(dispatch, editorDispatch, sourcePart, faceId, distance) {
  const result = computeExtrusionFromFace(sourcePart, faceId, distance);
  if (!result) return;

  const part = createPanel(result.partOverrides);
  dispatch({ type: 'PART_ADD', part });

  if (result.constraint) {
    const constraint = createConstraint({
      ...result.constraint,
      sourcePartId: part.id,
    });
    dispatch({ type: 'CONSTRAINT_ADD', constraint });
  }

  editorDispatch({
    type: 'SET_STATUS_MESSAGE',
    message: `Extruded ${Math.round(Math.abs(distance))} mm from ${faceId} face`,
  });

  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: {
      extruding: false,
      sourcePart: null,
      faceId: null,
      startPoint: null,
      faceNormal: null,
      extrusionDistance: 0,
      numericInput: '',
      snapResult: null,
    },
  });
}

// Simple dimension getter (avoids importing partGeometry for this single use)
function getSimpleDims(part) {
  switch (part.type) {
    case 'panel': return { width: part.width, depth: part.depth, height: part.thickness };
    case 'leg': return { width: part.width, depth: part.depth, height: part.height };
    case 'frame': {
      const w = part.axis === 'y' ? part.width : part.length;
      const d = part.axis === 'y' ? part.length : part.width;
      return { width: w, depth: d, height: part.height };
    }
    default: return { width: part.width || 100, depth: part.depth || 100, height: part.height || part.thickness || 18 };
  }
}

function axisToDim(axis) {
  return axis === 'x' ? 'width' : axis === 'y' ? 'depth' : 'height';
}
