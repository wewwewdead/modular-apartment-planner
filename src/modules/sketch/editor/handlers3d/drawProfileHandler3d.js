import { createSolid } from '../../domain/partModels';
import { projectToPlane, planeLocalToWorld, GROUND_PLANE } from '../../domain/drawingPlane';
import { smartSnap3d, snapToGrid } from '../snap';
import { SKETCH_GRID_MINOR } from '../../domain/defaults';

const MIN_PROFILE_AREA = 100;
const MIN_POINT_DISTANCE = 10;

function getDefaultExtrusionDepth(plane) {
  return Math.abs(plane.normal.z) > 0.9 ? 120 : 60;
}

function polygonArea(points) {
  if (!points || points.length < 3) return 0;
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    total += current.u * next.v - next.u * current.v;
  }
  return Math.abs(total) / 2;
}

export function createDrawProfileHandler3d({
  dispatch,
  editorDispatch,
  project,
  activeAssemblyId,
  partType,
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
        drawingProfile: false,
        profilePoints: [],
        currentLocal: null,
        snapResult: null,
      },
    });
  }

  function commitProfile(toolState, candidatePoint = null) {
    const points = [...(toolState.profilePoints || [])];
    if (candidatePoint) {
      const last = points[points.length - 1];
      if (!last || Math.hypot(candidatePoint.u - last.u, candidatePoint.v - last.v) >= MIN_POINT_DISTANCE) {
        points.push(candidatePoint);
      }
    }

    if (points.length < 3 || polygonArea(points) < MIN_PROFILE_AREA) {
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: 'Add at least three distinct points to create a solid profile.',
      });
      clearToolState();
      return;
    }

    const sourcePart = plane.sourcePartId
      ? project.parts.find((entry) => entry.id === plane.sourcePartId)
      : null;

    const part = createSolid({
      position: { ...plane.origin },
      plane,
      profilePoints: points,
      extrusionDepth: getDefaultExtrusionDepth(plane),
      assemblyId: activeAssemblyId || sourcePart?.assemblyId || null,
      objectId: sourcePart?.objectId || null,
    });

    dispatch({ type: 'PART_ADD', part });

    if (activeAssemblyId) {
      dispatch({ type: 'ASSEMBLY_ADD_PART', assemblyId: activeAssemblyId, partId: part.id });
    }

    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: `Solid created with ${points.length} points. Adjust extrusion in Properties.`,
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
      const existingPoints = toolState.profilePoints || [];

      if (!toolState.drawingProfile) {
        editorDispatch({ type: 'LOCK_PLANE' });
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            drawingProfile: true,
            profilePoints: [snapped],
            currentLocal: snapped,
            snapResult,
          },
        });
        return;
      }

      if (existingPoints.length >= 3) {
        const first = existingPoints[0];
        if (Math.hypot(snapped.u - first.u, snapped.v - first.v) < MIN_POINT_DISTANCE * 2) {
          commitProfile(toolState);
          return;
        }
      }

      const last = existingPoints[existingPoints.length - 1];
      if (last && Math.hypot(snapped.u - last.u, snapped.v - last.v) < MIN_POINT_DISTANCE) {
        return;
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          drawingProfile: true,
          profilePoints: [...existingPoints, snapped],
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
        payload: {
          currentLocal: snapped,
          snapResult,
        },
      });
    },

    onHover(intersection, e, toolState, viewport) {
      if (toolState.drawingProfile) return;

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

    onDoubleClick(intersection, e, toolState, viewport) {
      if (!toolState.drawingProfile) return;

      const planePoint = intersection?.drawingPlanePoint;
      if (!planePoint) {
        commitProfile(toolState);
        return;
      }

      const local = projectToPlane(planePoint, plane);
      const { local: snapped } = snapLocal(local, viewport);
      commitProfile(toolState, snapped);
    },

    onKeyDown(e, toolState) {
      if (e.key === 'Escape') {
        clearToolState();
        return;
      }

      if (e.key === 'Backspace' && toolState.drawingProfile) {
        e.preventDefault();
        const nextPoints = [...(toolState.profilePoints || [])];
        nextPoints.pop();
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            drawingProfile: nextPoints.length > 0,
            profilePoints: nextPoints,
          },
        });
        return;
      }

      if (e.key === 'Enter' && toolState.drawingProfile) {
        e.preventDefault();
        commitProfile(toolState);
      }
    },

    getCursor() {
      return 'crosshair';
    },
  };
}
