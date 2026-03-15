import { createDimension } from '../../domain/partModels';
import { smartSnap3d, snapToGrid } from '../snap';
import { SKETCH_GRID_MINOR } from '../../domain/defaults';

/**
 * Measure/Tape handler. Click two points to measure distance.
 * Creates permanent dimension parts. Snaps to vertices, edges, face centers.
 */
export function createMeasureHandler3d({ dispatch, editorDispatch, project, snapEnabled, inferenceCache }) {
  function snapPoint(point, viewport) {
    if (!snapEnabled || !point) return { point, snapResult: null };

    const inferencePoints = inferenceCache
      ? inferenceCache.getPoints(project.parts, project.annotations || [])
      : null;
    const camera = viewport?.getCamera?.();
    const domElement = viewport?.getDomElement?.();

    const result = smartSnap3d(point, {
      inferencePoints,
      gridSize: SKETCH_GRID_MINOR,
      camera,
      domElement,
    });

    if (result.inference) {
      return { point: result.point, snapResult: result };
    }

    return {
      point: {
        x: snapToGrid(point.x, SKETCH_GRID_MINOR),
        y: snapToGrid(point.y, SKETCH_GRID_MINOR),
        z: snapToGrid(point.z, SKETCH_GRID_MINOR),
      },
      snapResult: result,
    };
  }

  function domainPointFromIntersection(intersection) {
    if (!intersection) return null;

    // If we hit a surface, use that 3D point converted to domain coords
    if (intersection.point) {
      return {
        x: intersection.point.x,
        y: intersection.point.z,  // Three.js Z = domain Y
        z: intersection.point.y,  // Three.js Y = domain Z
      };
    }

    if (intersection.drawingPlanePoint) {
      return intersection.drawingPlanePoint;
    }

    return null;
  }

  function clearToolState() {
    editorDispatch({
      type: 'UPDATE_TOOL_STATE',
      payload: {
        measuring: false,
        measureStart: null,
        measureEnd: null,
        snapResult: null,
      },
    });
  }

  return {
    onPointerDown(intersection, e, toolState, viewport) {
      if (e.button !== 0) return;

      const domainPoint = domainPointFromIntersection(intersection);
      if (!domainPoint) return;

      const { point: snapped, snapResult } = snapPoint(domainPoint, viewport);

      if (!toolState.measuring) {
        // First click - set start point
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            measuring: true,
            measureStart: snapped,
            measureEnd: snapped,
            snapResult,
          },
        });
        return;
      }

      // Second click - commit measurement
      const startPt = toolState.measureStart;
      const endPt = snapped;

      const dx = endPt.x - startPt.x;
      const dy = endPt.y - startPt.y;
      const dz = endPt.z - startPt.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < 1) {
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: 'Points too close. Click further apart.',
        });
        return;
      }

      const dim = createDimension({
        startPoint: { ...startPt },
        endPoint: { ...endPt },
        offset: 100,
      });
      dispatch({ type: 'PART_ADD', part: dim });

      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: `Distance: ${Math.round(distance)} mm`,
      });

      clearToolState();
    },

    onPointerMove(intersection, e, toolState, viewport) {
      if (!toolState.measuring) return;

      const domainPoint = domainPointFromIntersection(intersection);
      if (!domainPoint) return;

      const { point: snapped, snapResult } = snapPoint(domainPoint, viewport);

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { measureEnd: snapped, snapResult },
      });
    },

    onHover(intersection, e, toolState, viewport) {
      if (toolState.measuring) return;

      const domainPoint = domainPointFromIntersection(intersection);
      if (!domainPoint) {
        editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { snapResult: null } });
        return;
      }

      const { snapResult } = snapPoint(domainPoint, viewport);
      editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { snapResult } });
    },

    onPointerUp() {},
    onDoubleClick() {},

    onKeyDown(e, toolState) {
      if (e.key === 'Escape') {
        clearToolState();
      }
    },

    getCursor(toolState) {
      if (toolState?.measuring) return 'crosshair';
      return 'crosshair';
    },
  };
}
