import { createPanel, createLeg, createFrame } from '../../domain/partModels';
import { createAssembly } from '../../domain/assemblyModels';
import { createConstraint } from '../../domain/constraintModels';
import { computeFaceAlignedPartOverrides, buildFaceAttachmentConstraints } from '../../domain/facePlacement';
import { snapToGrid, smartSnap3d } from '../snap';
import { SKETCH_GRID_MINOR } from '../../domain/defaults';
import { projectToPlane, planeLocalToWorld, faceToDrawingPlane, identifyFace, GROUND_PLANE } from '../../domain/drawingPlane';

const partFactories = {
  panel: createPanel,
  leg: createLeg,
  frame: createFrame,
};

function toDomainPoint(point) {
  if (!point) return null;
  return { x: point.x, y: point.z, z: point.y };
}

function capitalize(value) {
  if (!value) return 'Module';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildModuleName(project, objectId, partType) {
  const label = capitalize(partType);
  const count = (project.assemblies || []).filter((assembly) => assembly.objectId === objectId).length;
  return `${label} ${count + 1}`;
}

function getPlacementObjectId(project, { hostPart, activeAssemblyId, selectedId, selectedType }) {
  if (hostPart?.objectId) return hostPart.objectId;

  if (activeAssemblyId) {
    const activeAssembly = project.assemblies.find((assembly) => assembly.id === activeAssemblyId);
    if (activeAssembly?.objectId) return activeAssembly.objectId;
  }

  if (selectedType === 'object') return selectedId;
  if (selectedType === 'assembly') {
    return project.assemblies.find((assembly) => assembly.id === selectedId)?.objectId || null;
  }
  if (selectedType === 'part') {
    return project.parts.find((part) => part.id === selectedId)?.objectId || null;
  }

  return null;
}

function resolvePlacementTarget({
  dispatch,
  project,
  partType,
  hostPart,
  activeAssemblyId,
  selectedId,
  selectedType,
  placementModuleMode,
}) {
  const placementObjectId = getPlacementObjectId(project, {
    hostPart,
    activeAssemblyId,
    selectedId,
    selectedType,
  });

  const activeAssembly = activeAssemblyId
    ? project.assemblies.find((assembly) => assembly.id === activeAssemblyId)
    : null;
  const canUseCurrentAssembly = (
    placementModuleMode === 'current'
    && activeAssembly
    && (!placementObjectId || activeAssembly.objectId === placementObjectId)
  );

  if (canUseCurrentAssembly) {
    return {
      assemblyId: activeAssembly.id,
      objectId: activeAssembly.objectId || placementObjectId || null,
    };
  }

  if (placementObjectId) {
    const assembly = createAssembly(buildModuleName(project, placementObjectId, partType), {
      objectId: placementObjectId,
      category: partType,
      description: `${capitalize(partType)} module`,
      source: 'manual',
    });
    dispatch({ type: 'ASSEMBLY_ADD', assembly });
    return { assemblyId: assembly.id, objectId: placementObjectId };
  }

  return {
    assemblyId: null,
    objectId: hostPart?.objectId || null,
  };
}

function getPlacementPlane(toolState, drawingPlane) {
  return toolState.placementPlane || drawingPlane || GROUND_PLANE;
}

function getDefaultPlacementMode(toolState, activeAssemblyId) {
  return toolState.placementModuleMode || (activeAssemblyId ? 'current' : 'new');
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

/**
 * 3D rectangle drawing handler.
 * Click-drag on a host face or the active drawing plane to create a part.
 */
export function createDrawRectHandler3d({
  dispatch,
  editorDispatch,
  project,
  activeAssemblyId,
  selectedId,
  selectedType,
  partType,
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

  function beginDrawing(hostPart, faceId, plane, domainPoint, viewport, toolState) {
    const local = projectToPlane(domainPoint, plane);
    const { local: snapped, snapResult } = snapLocal(local, plane, viewport);
    const placementModuleMode = getDefaultPlacementMode(toolState, activeAssemblyId);

    if (plane !== (drawingPlane || GROUND_PLANE)) {
      editorDispatch({ type: 'SET_DRAWING_PLANE', plane });
    }

    editorDispatch({
      type: 'UPDATE_TOOL_STATE',
      payload: {
        drawing: true,
        placementPlane: plane,
        placementHostPartId: hostPart?.id || null,
        placementFaceId: faceId || null,
        placementModuleMode,
        startLocal: snapped,
        currentLocal: snapped,
        startWorld: planeLocalToWorld(snapped.u, snapped.v, plane),
        currentWorld: planeLocalToWorld(snapped.u, snapped.v, plane),
        hoverPartId: hostPart?.id || null,
        hoverFaceId: faceId || null,
        snapResult,
      },
    });
  }

  return {
    onPointerDown(intersection, e, toolState, viewport) {
      if (e.button !== 0) return;
      editorDispatch({ type: 'LOCK_PLANE' });

      const hostPart = intersection?.partId
        ? project.parts.find((part) => part.id === intersection.partId)
        : null;
      const faceId = intersection?.faceNormal ? identifyFace(intersection.faceNormal) : null;
      const hostObject = hostPart?.objectId
        ? project.objects.find((object) => object.id === hostPart.objectId)
        : null;

      if (hostObject?.editingPolicy === 'parametric') {
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: 'Detach the object before attaching custom parts to a generated face.',
        });
        return;
      }

      const plane = hostPart && faceId
        ? faceToDrawingPlane(hostPart, faceId)
        : (drawingPlane || GROUND_PLANE);
      const domainPoint = hostPart && faceId
        ? toDomainPoint(intersection?.point)
        : intersection?.drawingPlanePoint;

      if (!domainPoint) return;

      beginDrawing(hostPart, faceId, plane, domainPoint, viewport, toolState);
    },

    onPointerMove(intersection, e, toolState, viewport) {
      if (!toolState.drawing) return;

      const plane = getPlacementPlane(toolState, drawingPlane);
      const planePoint = intersection?.drawingPlanePoint;
      if (!planePoint) return;

      const local = projectToPlane(planePoint, plane);
      const { local: snapped, snapResult } = snapLocal(local, plane, viewport);

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          currentLocal: snapped,
          currentWorld: planeLocalToWorld(snapped.u, snapped.v, plane),
          snapResult,
        },
      });
    },

    onHover(intersection, e, toolState, viewport) {
      if (toolState.drawing) return;

      if (intersection?.partId && intersection?.faceNormal) {
        const part = project.parts.find((entry) => entry.id === intersection.partId);
        if (!part) return;

        const faceId = identifyFace(intersection.faceNormal);
        const plane = faceToDrawingPlane(part, faceId);
        const domainPoint = toDomainPoint(intersection.point);
        const local = domainPoint ? projectToPlane(domainPoint, plane) : null;
        const snapped = local ? snapLocal(local, plane, viewport).snapResult : null;

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            hoverPartId: part.id,
            hoverFaceId: faceId,
            snapResult: snapped?.inference ? snapped : null,
          },
        });
        return;
      }

      clearHover(editorDispatch);
    },

    onPointerUp(intersection, e, toolState, viewport) {
      if (!toolState.drawing || !toolState.startLocal) return;

      const plane = getPlacementPlane(toolState, drawingPlane);
      let endLocal = toolState.currentLocal;

      if (intersection?.drawingPlanePoint) {
        const local = projectToPlane(intersection.drawingPlanePoint, plane);
        const { local: snapped } = snapLocal(local, plane, viewport);
        endLocal = snapped;
      }

      const uSize = Math.abs(endLocal.u - toolState.startLocal.u);
      const vSize = Math.abs(endLocal.v - toolState.startLocal.v);
      const minSize = 10;

      if (uSize > minSize && vSize > minSize) {
        const minU = Math.min(toolState.startLocal.u, endLocal.u);
        const minV = Math.min(toolState.startLocal.v, endLocal.v);
        const worldPos = planeLocalToWorld(minU, minV, plane);
        const hostPart = toolState.placementHostPartId
          ? project.parts.find((part) => part.id === toolState.placementHostPartId)
          : null;
        const faceId = toolState.placementFaceId || plane.sourceFace || null;

        const overrides = computeFaceAlignedPartOverrides(
          plane,
          faceId,
          worldPos,
          uSize,
          vSize,
          partType
        );

        const placementTarget = resolvePlacementTarget({
          dispatch,
          project,
          partType,
          hostPart,
          activeAssemblyId,
          selectedId,
          selectedType,
          placementModuleMode: getDefaultPlacementMode(toolState, activeAssemblyId),
        });

        overrides.assemblyId = placementTarget.assemblyId;
        overrides.objectId = placementTarget.objectId || hostPart?.objectId || null;

        const factory = partFactories[partType];
        if (factory) {
          const part = factory(overrides);
          dispatch({ type: 'PART_ADD', part });

          if (placementTarget.assemblyId) {
            dispatch({
              type: 'ASSEMBLY_ADD_PART',
              assemblyId: placementTarget.assemblyId,
              partId: part.id,
            });
          }

          if (hostPart && faceId) {
            const constraints = buildFaceAttachmentConstraints(part, hostPart, faceId);
            for (const definition of constraints) {
              dispatch({
                type: 'CONSTRAINT_ADD',
                constraint: createConstraint(definition),
              });
            }
          }

          editorDispatch({
            type: 'SET_STATUS_MESSAGE',
            message: hostPart
              ? `${capitalize(partType)} attached to ${hostPart.name}`
              : `${partType}: ${Math.round(uSize)} x ${Math.round(vSize)} mm`,
          });
        }
      }

      editorDispatch({ type: 'UNLOCK_PLANE' });
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          drawing: false,
          placementPlane: null,
          placementHostPartId: null,
          placementFaceId: null,
          startLocal: null,
          currentLocal: null,
          startWorld: null,
          currentWorld: null,
          snapResult: null,
        },
      });
    },

    onKeyDown(e) {
      if (e.key === 'Escape') {
        editorDispatch({ type: 'UNLOCK_PLANE' });
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            drawing: false,
            placementPlane: null,
            placementHostPartId: null,
            placementFaceId: null,
            startLocal: null,
            currentLocal: null,
            startWorld: null,
            currentWorld: null,
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
}
