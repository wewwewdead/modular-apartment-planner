import { snapToGrid, smartSnap3d } from '../snap';
import { SKETCH_GRID_MINOR } from '../../domain/defaults';
import { identifyFace, faceToDrawingPlane } from '../../domain/drawingPlane';
import { getPartDimensions } from '../../domain/partGeometry';
import { computeFlushSnapPoints } from '../inferenceEngine';

/**
 * Dedicated Move tool with axis constraints.
 * Press X/Y/Z to lock movement to that axis. Type a number + Enter for exact distance.
 */
export function createMoveHandler3d({ dispatch, editorDispatch, project, activeAssemblyId, snapEnabled, selectedId, selectedType, inferenceCache }) {
  const isEditMode = activeAssemblyId !== null;

  return {
    onPointerDown(intersection, e, toolState, viewport) {
      if (e.button !== 0) return;

      if (!intersection || !intersection.partId) {
        editorDispatch({ type: 'DESELECT' });
        return;
      }

      const { partId, objectId, point, faceNormal } = intersection;

      // Set drawing plane
      if (faceNormal) {
        const faceId = identifyFace(faceNormal);
        const part = project.parts.find((p) => p.id === partId);
        if (part) {
          const plane = faceToDrawingPlane(part, faceId);
          editorDispatch({ type: 'SET_DRAWING_PLANE', plane });
        }
      }

      // Select and start drag
      const part = project.parts.find((p) => p.id === partId);
      if (!part) return;

      if (isEditMode && part.assemblyId !== activeAssemblyId) {
        editorDispatch({ type: 'DESELECT' });
        return;
      }

      editorDispatch({ type: 'SELECT_OBJECT', id: part.id, objectType: 'part' });
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          moving: true,
          startPoint: point,
          movePartId: part.id,
          axisLock: toolState.axisLock || null,
          numericInput: '',
        },
      });
    },

    onPointerMove(intersection, e, toolState, viewport) {
      if (!toolState.moving || !toolState.startPoint || !toolState.movePartId) return;

      const currentPoint = intersection?.planePoint;
      if (!currentPoint) return;

      const startPoint = toolState.startPoint;
      let dx = currentPoint.x - startPoint.x;
      let dy = currentPoint.z - startPoint.z; // Three.js Z = domain Y
      let dz = -(currentPoint.y - startPoint.y); // Three.js Y = domain Z

      const domainDelta = { dx, dy, dz: -dz };

      // Apply axis lock
      if (toolState.axisLock === 'x') {
        domainDelta.dy = 0;
        domainDelta.dz = 0;
      } else if (toolState.axisLock === 'y') {
        domainDelta.dx = 0;
        domainDelta.dz = 0;
      } else if (toolState.axisLock === 'z') {
        domainDelta.dx = 0;
        domainDelta.dy = 0;
      }

      if (snapEnabled) {
        domainDelta.dx = snapToGrid(domainDelta.dx, SKETCH_GRID_MINOR);
        domainDelta.dy = snapToGrid(domainDelta.dy, SKETCH_GRID_MINOR);
        domainDelta.dz = snapToGrid(domainDelta.dz, SKETCH_GRID_MINOR);
        if (Math.abs(domainDelta.dx) < 1 && Math.abs(domainDelta.dy) < 1 && Math.abs(domainDelta.dz) < 1) return;
      }

      const part = project.parts.find((p) => p.id === toolState.movePartId);
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

      // Try inference snap (point inference > flush snap > grid)
      if (snapEnabled && inferenceCache) {
        const inferencePoints = inferenceCache.getPoints(project.parts, project.annotations || [], toolState.movePartId);
        const camera = viewport?.getCamera?.();
        const domElement = viewport?.getDomElement?.();

        // Compute flush snap points
        const movingDims = getPartDimensions(part);
        let flushPoints = computeFlushSnapPoints(project.parts, toolState.movePartId, movingDims);

        // Filter flush points by axis lock if active
        if (toolState.axisLock) {
          flushPoints = flushPoints.filter((fp) => fp.faceAxis === toolState.axisLock);
        }

        const snapResult = smartSnap3d(pos, {
          inferencePoints,
          gridSize: SKETCH_GRID_MINOR,
          camera,
          domElement,
          flushPoints,
        });

        if (snapResult.inference) {
          dispatch({
            type: 'PART_UPDATE',
            part: { id: toolState.movePartId, position: snapResult.point },
          });
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { startPoint: currentPoint, snapResult },
          });
          return;
        }
      }

      dispatch({
        type: 'PART_UPDATE',
        part: { id: toolState.movePartId, position: pos },
      });

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { startPoint: currentPoint, snapResult: null },
      });
    },

    onHover(intersection, e, toolState) {
      if (toolState.moving) return;

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
      if (toolState.moving) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            moving: false,
            startPoint: null,
            movePartId: null,
            snapResult: null,
          },
        });
      }
    },

    onDoubleClick() {},

    onKeyDown(e, toolState, currentSelectedId) {
      // Axis lock shortcuts
      const key = e.key.toLowerCase();
      if (key === 'x' || key === 'y' || key === 'z') {
        e.preventDefault();
        const newLock = toolState.axisLock === key ? null : key;
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { axisLock: newLock },
        });
        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: newLock ? `Axis locked to ${newLock.toUpperCase()}` : 'Axis lock cleared',
        });
        return;
      }

      // Numeric input for exact distance
      if (toolState.moving && toolState.movePartId) {
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

        if (e.key === 'Enter' && toolState.numericInput) {
          e.preventDefault();
          const dist = parseFloat(toolState.numericInput);
          if (!isNaN(dist) && toolState.axisLock) {
            const part = project.parts.find((p) => p.id === toolState.movePartId);
            if (part) {
              const pos = { ...part.position };
              pos[toolState.axisLock] += dist;
              dispatch({ type: 'PART_UPDATE', part: { id: part.id, position: pos } });
              editorDispatch({
                type: 'SET_STATUS_MESSAGE',
                message: `Moved ${dist} mm along ${toolState.axisLock.toUpperCase()}`,
              });
            }
          }
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { numericInput: '', moving: false, startPoint: null, movePartId: null },
          });
          return;
        }
      }

      if (e.key === 'Escape') {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { moving: false, startPoint: null, movePartId: null, axisLock: null, numericInput: '' },
        });
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && currentSelectedId) {
        dispatch({ type: 'PART_DELETE', partId: currentSelectedId });
        editorDispatch({ type: 'DESELECT' });
      }
    },

    getCursor(toolState) {
      if (toolState?.moving) return 'grabbing';
      return 'move';
    },
  };
}
