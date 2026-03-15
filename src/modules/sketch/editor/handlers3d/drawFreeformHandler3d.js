import { createMesh3d } from '../../domain/partModels';

const CLOSE_THRESHOLD = 30; // mm in 3D space

function toDomainPoint(threePoint) {
  if (!threePoint) return null;
  return { x: threePoint.x, y: threePoint.z, z: threePoint.y };
}

function distance3d(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Freeform 3D drawing handler.
 * Each click places a point at the 3D raycast intersection.
 * Close the shape to create a mesh3d part.
 */
export function createDrawFreeformHandler3d({
  dispatch,
  editorDispatch,
  project,
  activeAssemblyId,
}) {
  function clearToolState() {
    editorDispatch({
      type: 'UPDATE_TOOL_STATE',
      payload: {
        drawingFreeform: false,
        freeformPoints: [],
        currentFreeformPoint: null,
      },
    });
  }

  function commitMesh(points) {
    if (points.length < 3) {
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: 'Need at least 3 points to create a mesh.',
      });
      clearToolState();
      return;
    }

    const part = createMesh3d({
      vertices3d: points,
      thickness: 18,
      assemblyId: activeAssemblyId || null,
    });

    dispatch({ type: 'PART_ADD', part });

    if (activeAssemblyId) {
      dispatch({ type: 'ASSEMBLY_ADD_PART', assemblyId: activeAssemblyId, partId: part.id });
    }

    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: `Mesh created with ${points.length} vertices.`,
    });
    clearToolState();
  }

  function getPointFromIntersection(intersection) {
    // Prefer surface hit, fall back to drawing plane
    if (intersection?.point) {
      return toDomainPoint(intersection.point);
    }
    if (intersection?.drawingPlanePoint) {
      return intersection.drawingPlanePoint;
    }
    return null;
  }

  return {
    onPointerDown(intersection, e, toolState) {
      if (e.button !== 0) return;

      const point = getPointFromIntersection(intersection);
      if (!point) return;

      const existingPoints = toolState.freeformPoints || [];

      // Check if closing the polygon
      if (existingPoints.length >= 3) {
        const first = existingPoints[0];
        if (distance3d(point, first) < CLOSE_THRESHOLD) {
          commitMesh(existingPoints);
          return;
        }
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          drawingFreeform: true,
          freeformPoints: [...existingPoints, point],
          currentFreeformPoint: point,
        },
      });
    },

    onPointerMove(intersection, e, toolState) {
      if (!toolState.drawingFreeform) return;

      const point = getPointFromIntersection(intersection);
      if (!point) return;

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { currentFreeformPoint: point },
      });
    },

    onHover() {},

    onPointerUp() {},

    onDoubleClick(intersection, e, toolState) {
      if (!toolState.drawingFreeform) return;

      const points = toolState.freeformPoints || [];
      if (points.length >= 3) {
        commitMesh(points);
      } else {
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: 'Need at least 3 points. Keep clicking to add more.',
        });
      }
    },

    onKeyDown(e, toolState) {
      if (e.key === 'Escape') {
        clearToolState();
        return;
      }

      if (e.key === 'Backspace' && toolState.drawingFreeform) {
        e.preventDefault();
        const nextPoints = [...(toolState.freeformPoints || [])];
        nextPoints.pop();
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            drawingFreeform: nextPoints.length > 0,
            freeformPoints: nextPoints,
          },
        });
        return;
      }

      if (e.key === 'Enter' && toolState.drawingFreeform) {
        e.preventDefault();
        const points = toolState.freeformPoints || [];
        if (points.length >= 3) {
          commitMesh(points);
        }
      }
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
