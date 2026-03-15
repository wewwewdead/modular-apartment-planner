import * as THREE from 'three';
import { snapToGrid, smartSnap3d } from '../snap';
import { SKETCH_GRID_MINOR } from '../../domain/defaults';
import { faceToDrawingPlane, identifyFace, GROUND_PLANE } from '../../domain/drawingPlane';
import { getPartDimensions } from '../../domain/partGeometry';
import { computeFlushSnapPoints } from '../inferenceEngine';

/**
 * 3D select/move handler.
 * Left-click to select, drag to move on a camera-perpendicular plane.
 */
export function createSelectHandler3d({ dispatch, editorDispatch, project, activeAssemblyId, snapEnabled, selectedId, selectedType, inferenceCache }) {
  const isEditMode = activeAssemblyId !== null;

  return {
    onPointerDown(intersection, e, toolState, viewport) {
      if (e.button !== 0) return;

      if (!intersection || !intersection.partId) {
        // Clicked empty space - deselect and reset drawing plane
        editorDispatch({ type: 'DESELECT' });
        editorDispatch({ type: 'RESET_DRAWING_PLANE' });
        return;
      }

      const { partId, objectId, point, faceNormal } = intersection;

      // Determine face for drawing plane
      if (faceNormal) {
        const faceId = identifyFace(faceNormal);
        const part = project.parts.find((p) => p.id === partId);
        if (part) {
          const plane = faceToDrawingPlane(part, faceId);
          editorDispatch({ type: 'SET_DRAWING_PLANE', plane });
        }
      }

      if (isEditMode) {
        const part = project.parts.find((p) => p.id === partId && p.assemblyId === activeAssemblyId);
        if (part) {
          editorDispatch({ type: 'SELECT_OBJECT', id: part.id, objectType: 'part' });
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { dragging: true, startPoint: point, dragPartId: part.id },
          });
        } else {
          editorDispatch({ type: 'DESELECT' });
        }
        return;
      }

      // Normal mode selection hierarchy: part -> assembly -> object
      const part = project.parts.find((p) => p.id === partId);
      if (!part) {
        editorDispatch({ type: 'DESELECT' });
        return;
      }

      const parametricObject = part.objectId
        ? (project.objects || []).find((o) => o.id === part.objectId && o.editingPolicy === 'parametric')
        : null;

      if (parametricObject) {
        editorDispatch({ type: 'SELECT_OBJECT', id: part.objectId, objectType: 'object' });
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { dragging: true, startPoint: point, dragObjectId: part.objectId },
        });
      } else if (part.assemblyId) {
        editorDispatch({ type: 'SELECT_OBJECT', id: part.assemblyId, objectType: 'assembly' });
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { dragging: true, startPoint: point, dragAssemblyId: part.assemblyId },
        });
      } else {
        editorDispatch({ type: 'SELECT_OBJECT', id: part.id, objectType: 'part' });
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { dragging: true, startPoint: point, dragPartId: part.id },
        });
      }
    },

    onPointerMove(intersection, e, toolState, viewport) {
      if (!toolState.dragging || !toolState.startPoint) return;

      // Get current 3D point on movement plane
      const currentPoint = intersection?.planePoint;
      if (!currentPoint) return;

      const startPoint = toolState.startPoint;
      let dx = currentPoint.x - startPoint.x;
      let dy = currentPoint.z - startPoint.z; // Three.js Z = domain Y
      let dz = -(currentPoint.y - startPoint.y); // Three.js Y = domain Z (negated for correct direction)

      // Convert Three.js deltas to domain deltas
      // Three.js: x=domain x, y=domain z, z=domain y
      const domainDelta = {
        dx: dx,
        dy: dy,
        dz: -dz, // correct back
      };

      if (snapEnabled) {
        domainDelta.dx = snapToGrid(domainDelta.dx, SKETCH_GRID_MINOR);
        domainDelta.dy = snapToGrid(domainDelta.dy, SKETCH_GRID_MINOR);
        domainDelta.dz = snapToGrid(domainDelta.dz, SKETCH_GRID_MINOR);
        if (Math.abs(domainDelta.dx) < 1 && Math.abs(domainDelta.dy) < 1 && Math.abs(domainDelta.dz) < 1) return;
      }

      // For single-part drags, try inference snap on the target position
      if (toolState.dragPartId && snapEnabled && inferenceCache) {
        const part = project.parts.find((p) => p.id === toolState.dragPartId);
        if (part && part.type !== 'dimension') {
          const targetPos = {
            x: part.position.x + domainDelta.dx,
            y: part.position.y + domainDelta.dy,
            z: part.position.z + domainDelta.dz,
          };

          const inferencePoints = inferenceCache.getPoints(project.parts, project.annotations || [], toolState.dragPartId);
          const camera = viewport?.getCamera?.();
          const domElement = viewport?.getDomElement?.();

          // Compute flush snap points
          const movingDims = getPartDimensions(part);
          const flushPoints = computeFlushSnapPoints(project.parts, toolState.dragPartId, movingDims);

          const snapResult = smartSnap3d(targetPos, {
            inferencePoints,
            gridSize: SKETCH_GRID_MINOR,
            camera,
            domElement,
            flushPoints,
          });

          if (snapResult.inference) {
            dispatch({
              type: 'PART_UPDATE',
              part: { id: toolState.dragPartId, position: snapResult.point },
            });

            editorDispatch({
              type: 'UPDATE_TOOL_STATE',
              payload: { startPoint: currentPoint, snapResult },
            });
            return;
          }
        }
      }

      if (toolState.dragObjectId) {
        dispatch({
          type: 'OBJECT_MOVE',
          objectId: toolState.dragObjectId,
          delta: domainDelta,
        });
      } else if (toolState.dragAssemblyId) {
        dispatch({
          type: 'ASSEMBLY_MOVE',
          assemblyId: toolState.dragAssemblyId,
          delta: domainDelta,
        });
      } else if (toolState.dragPartId) {
        const part = project.parts.find((p) => p.id === toolState.dragPartId);
        if (!part || part.type === 'dimension') return;

        const pos = {
          x: part.position.x + domainDelta.dx,
          y: part.position.y + domainDelta.dy,
          z: part.position.z + domainDelta.dz,
        };

        if (snapEnabled) {
          pos.x = snapToGrid(pos.x, SKETCH_GRID_MINOR);
          pos.y = snapToGrid(pos.y, SKETCH_GRID_MINOR);
          pos.z = snapToGrid(pos.z, SKETCH_GRID_MINOR);
        }

        dispatch({
          type: 'PART_UPDATE',
          part: { id: toolState.dragPartId, position: pos },
        });
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { startPoint: currentPoint, snapResult: null },
      });
    },

    onHover(intersection, e, toolState, viewport) {
      if (toolState.dragging) return;

      // Detect face under cursor for hover highlight
      if (intersection?.partId && intersection?.faceNormal) {
        const part = project.parts.find((p) => p.id === intersection.partId);
        const faceId = identifyFace(intersection.faceNormal);

        if (part) {
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: {
              hoverPartId: part.id,
              hoverFaceId: faceId,
            },
          });
          return;
        }
      }

      // No part hovered
      if (toolState.hoverPartId) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { hoverPartId: null, hoverFaceId: null },
        });
      }
    },

    onPointerUp(intersection, e, toolState) {
      if (toolState.dragging) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            dragging: false,
            startPoint: null,
            dragPartId: null,
            dragAssemblyId: null,
            dragObjectId: null,
            snapResult: null,
          },
        });
      }
    },

    onDoubleClick(intersection, e, toolState) {
      if (isEditMode) return;
      if (!intersection?.partId) return;

      const part = project.parts.find((p) => p.id === intersection.partId);
      if (!part || !part.assemblyId) return;

      const parametricObject = part.objectId
        ? (project.objects || []).find((o) => o.id === part.objectId && o.editingPolicy === 'parametric')
        : null;
      if (parametricObject) return;

      editorDispatch({ type: 'ENTER_ASSEMBLY_EDIT', assemblyId: part.assemblyId });
    },

    onKeyDown(e, toolState, currentSelectedId) {
      if (e.key === 'Escape' && isEditMode) {
        e.preventDefault();
        e.stopPropagation();
        editorDispatch({ type: 'SET_ACTIVE_ASSEMBLY', assemblyId: null });
        return;
      }

      // Quick-rotate: Q rotates 90° around Z, Shift+Q rotates -90°
      if (e.key.toLowerCase() === 'q' && currentSelectedId) {
        const part = project.parts.find((p) => p.id === currentSelectedId);
        if (part && part.type !== 'dimension') {
          e.preventDefault();
          const delta = e.shiftKey ? -Math.PI / 2 : Math.PI / 2;
          dispatch({
            type: 'PART_UPDATE',
            part: { id: part.id, rotation: { z: (part.rotation.z || 0) + delta } },
          });
          editorDispatch({
            type: 'SET_STATUS_MESSAGE',
            message: e.shiftKey ? 'Rotated -90° Z' : 'Rotated +90° Z',
          });
          return;
        }
      }

      // Flip toggles: Shift+X/Y/Z
      if (e.shiftKey && ['x', 'y', 'z'].includes(e.key.toLowerCase()) && currentSelectedId) {
        const part = project.parts.find((p) => p.id === currentSelectedId);
        if (part && part.type !== 'dimension') {
          e.preventDefault();
          const axis = e.key.toLowerCase();
          const currentFlip = part.flip || { x: false, y: false, z: false };
          dispatch({
            type: 'PART_UPDATE',
            part: { id: part.id, flip: { [axis]: !currentFlip[axis] } },
          });
          editorDispatch({
            type: 'SET_STATUS_MESSAGE',
            message: `Flip ${axis.toUpperCase()}: ${!currentFlip[axis] ? 'on' : 'off'}`,
          });
          return;
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && currentSelectedId) {
        if (selectedType === 'object') {
          dispatch({ type: 'OBJECT_DELETE', objectId: currentSelectedId });
        } else if (selectedType === 'assembly' && !isEditMode) {
          dispatch({ type: 'ASSEMBLY_DELETE_WITH_PARTS', assemblyId: currentSelectedId });
        } else {
          dispatch({ type: 'PART_DELETE', partId: currentSelectedId });
        }
        editorDispatch({ type: 'DESELECT' });
      }
    },

    getCursor(toolState) {
      if (toolState?.dragging) return 'grabbing';
      return 'default';
    },
  };
}
