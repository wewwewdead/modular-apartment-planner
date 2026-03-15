import { createSolid } from '../../domain/partModels';
import { projectToPlane, planeLocalToWorld, GROUND_PLANE } from '../../domain/drawingPlane';
import { smartSnap3d, snapToGrid } from '../snap';
import { SKETCH_GRID_MINOR } from '../../domain/defaults';

const MIN_POINT_DISTANCE = 10;
const MIN_PROFILE_AREA = 100;
const CLOSE_THRESHOLD = 20;

function polygonArea(points) {
  if (!points || points.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    total += current.u * next.v - next.u * current.v;
  }
  return Math.abs(total) / 2;
}

/**
 * Line drawing handler. Click-to-click line chain drawing (like SketchUp's Line tool).
 * When lines form a closed polygon, creates a solid part.
 */
export function createDrawLineHandler3d({
  dispatch,
  editorDispatch,
  project,
  activeAssemblyId,
  snapEnabled,
  drawingPlane,
  inferenceCache,
}) {
  const plane = drawingPlane || GROUND_PLANE;

  function snapLocal(local, viewport) {
    if (!snapEnabled) return { local, snapResult: null };

    const worldPoint = planeLocalToWorld(local.u, local.v, plane);
    const inferencePoints = inferenceCache
      ? inferenceCache.getPoints(project.parts, project.annotations || [])
      : null;
    const camera = viewport?.getCamera?.();
    const domElement = viewport?.getDomElement?.();

    const result = smartSnap3d(worldPoint, {
      inferencePoints,
      gridSize: SKETCH_GRID_MINOR,
      plane,
      camera,
      domElement,
    });

    if (result.inference) {
      return {
        local: projectToPlane(result.point, plane),
        snapResult: result,
      };
    }

    return {
      local: {
        u: snapToGrid(local.u, SKETCH_GRID_MINOR),
        v: snapToGrid(local.v, SKETCH_GRID_MINOR),
      },
      snapResult: result,
    };
  }

  function clearToolState() {
    editorDispatch({ type: 'UNLOCK_PLANE' });
    editorDispatch({
      type: 'UPDATE_TOOL_STATE',
      payload: {
        drawingLine: false,
        linePoints: [],
        currentLocal: null,
        snapResult: null,
      },
    });
  }

  function commitClosedPolygon(points) {
    if (points.length < 3 || polygonArea(points) < MIN_PROFILE_AREA) {
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: 'Need at least 3 points with enough area to create a solid.',
      });
      clearToolState();
      return;
    }

    const sourcePart = plane.sourcePartId
      ? project.parts.find((p) => p.id === plane.sourcePartId)
      : null;

    const part = createSolid({
      position: { ...plane.origin },
      plane,
      profilePoints: points,
      extrusionDepth: Math.abs(plane.normal.z) > 0.9 ? 120 : 60,
      assemblyId: activeAssemblyId || sourcePart?.assemblyId || null,
      objectId: sourcePart?.objectId || null,
    });

    dispatch({ type: 'PART_ADD', part });

    if (activeAssemblyId) {
      dispatch({ type: 'ASSEMBLY_ADD_PART', assemblyId: activeAssemblyId, partId: part.id });
    }

    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: `Closed polygon created with ${points.length} points.`,
    });
    clearToolState();
  }

  return {
    onPointerDown(intersection, e, toolState, viewport) {
      if (e.button !== 0) return;

      const planePoint = intersection?.drawingPlanePoint;
      if (!planePoint) return;

      const local = projectToPlane(planePoint, plane);
      const { local: snapped, snapResult } = snapLocal(local, viewport);
      const existingPoints = toolState.linePoints || [];

      if (!toolState.drawingLine) {
        // Start a new line chain
        editorDispatch({ type: 'LOCK_PLANE' });
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            drawingLine: true,
            linePoints: [snapped],
            currentLocal: snapped,
            snapResult,
          },
        });
        return;
      }

      // Check if closing the polygon
      if (existingPoints.length >= 3) {
        const first = existingPoints[0];
        if (Math.hypot(snapped.u - first.u, snapped.v - first.v) < CLOSE_THRESHOLD) {
          commitClosedPolygon(existingPoints);
          return;
        }
      }

      // Skip duplicate points
      const last = existingPoints[existingPoints.length - 1];
      if (last && Math.hypot(snapped.u - last.u, snapped.v - last.v) < MIN_POINT_DISTANCE) {
        return;
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          drawingLine: true,
          linePoints: [...existingPoints, snapped],
          currentLocal: snapped,
          snapResult,
        },
      });
    },

    onPointerMove(intersection, e, toolState, viewport) {
      const planePoint = intersection?.drawingPlanePoint;
      if (!planePoint) return;

      const local = projectToPlane(planePoint, plane);
      const { local: snapped, snapResult } = snapLocal(local, viewport);

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { currentLocal: snapped, snapResult },
      });
    },

    onHover(intersection, e, toolState, viewport) {
      if (toolState.drawingLine) return;

      const planePoint = intersection?.drawingPlanePoint;
      if (!planePoint) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { snapResult: null },
        });
        return;
      }

      const local = projectToPlane(planePoint, plane);
      const { snapResult } = snapLocal(local, viewport);
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { snapResult },
      });
    },

    onDoubleClick(intersection, e, toolState) {
      if (!toolState.drawingLine) return;

      const points = toolState.linePoints || [];
      if (points.length >= 3) {
        commitClosedPolygon(points);
      } else {
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: 'Need at least 3 points. Keep clicking to add more.',
        });
      }
    },

    onPointerUp() {},

    onKeyDown(e, toolState) {
      if (e.key === 'Escape') {
        clearToolState();
        return;
      }

      if (e.key === 'Backspace' && toolState.drawingLine) {
        e.preventDefault();
        const nextPoints = [...(toolState.linePoints || [])];
        nextPoints.pop();
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            drawingLine: nextPoints.length > 0,
            linePoints: nextPoints,
          },
        });
        return;
      }

      if (e.key === 'Enter' && toolState.drawingLine) {
        e.preventDefault();
        const points = toolState.linePoints || [];
        if (points.length >= 3) {
          commitClosedPolygon(points);
        }
      }
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
