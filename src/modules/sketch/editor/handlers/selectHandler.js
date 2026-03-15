import { projectPartToView } from '../../domain/viewProjection';
import { projectDimensionPoint } from '../../renderers/DimensionRenderer';
import { createDimensionFigure, hitTestDimensionFigure } from '@/annotations/dimensions';
import { snapPoint } from '../snap';
import { SKETCH_GRID_MINOR } from '../../domain/defaults';

export function createSketchSelectHandler({ dispatch, editorDispatch, project, activeView, viewport, snapEnabled, activeAssemblyId, selectedId, selectedType }) {
  function hitTestDimensions(modelPos) {
    const tolerance = 8 / viewport.zoom;
    const dims = project.parts.filter((p) => p.type === 'dimension');

    for (let i = dims.length - 1; i >= 0; i--) {
      const dim = dims[i];
      const start2D = projectDimensionPoint(dim.startPoint, activeView);
      const end2D = projectDimensionPoint(dim.endPoint, activeView);

      const figure = createDimensionFigure({
        id: dim.id,
        startPoint: start2D,
        endPoint: end2D,
        mode: 'aligned',
        offset: dim.offset || 200,
        source: 'manual',
      });

      if (figure && hitTestDimensionFigure(modelPos, figure, tolerance)) {
        return { id: dim.id, type: 'part' };
      }
    }
    return null;
  }

  function hitTestParts(modelPos, filterFn) {
    const tolerance = 6 / viewport.zoom;
    const parts = project.parts.filter((p) => p.type !== 'dimension' && (!filterFn || filterFn(p)));

    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      const { svgX, svgY, svgWidth, svgHeight } = projectPartToView(part, activeView);

      if (
        modelPos.x >= svgX - tolerance &&
        modelPos.x <= svgX + svgWidth + tolerance &&
        modelPos.y >= svgY - tolerance &&
        modelPos.y <= svgY + svgHeight + tolerance
      ) {
        return part;
      }
    }
    return null;
  }

  function computeViewDelta(dx, dy) {
    switch (activeView) {
      case 'top':
        return { dx, dy, dz: 0 };
      case 'front':
        return { dx, dy: 0, dz: -dy };
      case 'side':
        return { dx: 0, dy: dx, dz: -dy };
      default:
        return { dx, dy, dz: 0 };
    }
  }

  const isEditMode = activeAssemblyId !== null;

  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      // Try dimensions first (they render on top)
      const dimHit = hitTestDimensions(modelPos);
      if (dimHit) {
        editorDispatch({ type: 'SELECT_OBJECT', id: dimHit.id, objectType: dimHit.type });
        return;
      }

      if (isEditMode) {
        // Edit mode: only hit-test parts within the active assembly
        const hitPart = hitTestParts(modelPos, (p) => p.assemblyId === activeAssemblyId);
        if (hitPart) {
          editorDispatch({ type: 'SELECT_OBJECT', id: hitPart.id, objectType: 'part' });
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { dragging: true, startPos: modelPos, dragPartId: hitPart.id },
          });
        } else {
          editorDispatch({ type: 'DESELECT' });
        }
      } else {
        // Normal mode: hit-test all parts
        const hitPart = hitTestParts(modelPos);
        if (hitPart) {
          const parametricObject = hitPart.objectId
            ? (project.objects || []).find((object) => object.id === hitPart.objectId && object.editingPolicy === 'parametric')
            : null;

          if (parametricObject) {
            editorDispatch({ type: 'SELECT_OBJECT', id: hitPart.objectId, objectType: 'object' });
            editorDispatch({
              type: 'UPDATE_TOOL_STATE',
              payload: { dragging: true, startPos: modelPos, dragObjectId: hitPart.objectId },
            });
          } else if (hitPart.assemblyId) {
            // Promote to assembly selection
            editorDispatch({ type: 'SELECT_OBJECT', id: hitPart.assemblyId, objectType: 'assembly' });
            editorDispatch({
              type: 'UPDATE_TOOL_STATE',
              payload: { dragging: true, startPos: modelPos, dragAssemblyId: hitPart.assemblyId },
            });
          } else {
            // Select individual part
            editorDispatch({ type: 'SELECT_OBJECT', id: hitPart.id, objectType: 'part' });
            editorDispatch({
              type: 'UPDATE_TOOL_STATE',
              payload: { dragging: true, startPos: modelPos, dragPartId: hitPart.id },
            });
          }
        } else {
          editorDispatch({ type: 'DESELECT' });
        }
      }
    },

    onMouseMove(modelPos, e, toolState) {
      if (!toolState.dragging || !toolState.startPos) return;

      const dx = modelPos.x - toolState.startPos.x;
      const dy = modelPos.y - toolState.startPos.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      // Assembly drag (normal mode)
      if (toolState.dragAssemblyId) {
        const delta = computeViewDelta(dx, dy);

        // Snap the delta
        if (snapEnabled) {
          const snapped = snapPoint({ x: delta.dx, y: delta.dy }, SKETCH_GRID_MINOR);
          if (Math.abs(snapped.x) < 1 && Math.abs(snapped.y) < 1) return;
          // Recompute full 3D delta from snapped 2D
          const snappedDelta = computeViewDelta(snapped.x, snapped.y);
          dispatch({
            type: 'ASSEMBLY_MOVE',
            assemblyId: toolState.dragAssemblyId,
            delta: snappedDelta,
          });
        } else {
          dispatch({
            type: 'ASSEMBLY_MOVE',
            assemblyId: toolState.dragAssemblyId,
            delta,
          });
        }

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { startPos: modelPos },
        });
        return;
      }

      if (toolState.dragObjectId) {
        const delta = computeViewDelta(dx, dy);
        if (snapEnabled) {
          const snapped = snapPoint({ x: delta.dx, y: delta.dy }, SKETCH_GRID_MINOR);
          if (Math.abs(snapped.x) < 1 && Math.abs(snapped.y) < 1) return;
          dispatch({
            type: 'OBJECT_MOVE',
            objectId: toolState.dragObjectId,
            delta: computeViewDelta(snapped.x, snapped.y),
          });
        } else {
          dispatch({
            type: 'OBJECT_MOVE',
            objectId: toolState.dragObjectId,
            delta,
          });
        }

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { startPos: modelPos },
        });
        return;
      }

      // Individual part drag (edit mode or unassigned part)
      if (toolState.dragPartId) {
        const part = project.parts.find((p) => p.id === toolState.dragPartId);
        if (!part || part.type === 'dimension') return;

        const pos = { ...part.position };
        switch (activeView) {
          case 'top':
            pos.x += dx;
            pos.y += dy;
            break;
          case 'front':
            pos.x += dx;
            pos.z -= dy;
            break;
          case 'side':
            pos.y += dx;
            pos.z -= dy;
            break;
        }

        if (snapEnabled) {
          const snapped = snapPoint(pos, SKETCH_GRID_MINOR);
          pos.x = snapped.x;
          pos.y = snapped.y;
        }

        dispatch({
          type: 'PART_UPDATE',
          part: { id: toolState.dragPartId, position: pos },
        });

        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { startPos: modelPos },
        });
      }
    },

    onMouseUp(modelPos, e, toolState) {
      if (toolState.dragging) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { dragging: false, startPos: null, dragPartId: null, dragAssemblyId: null, dragObjectId: null },
        });
      }
    },

    onDoubleClick(modelPos, e, toolState) {
      if (isEditMode) return;

      // In normal mode: if we hit a part that belongs to an assembly, enter edit mode
      const hitPart = hitTestParts(modelPos);
      const parametricObject = hitPart?.objectId
        ? (project.objects || []).find((object) => object.id === hitPart.objectId && object.editingPolicy === 'parametric')
        : null;
      if (hitPart && hitPart.assemblyId && !parametricObject) {
        editorDispatch({ type: 'ENTER_ASSEMBLY_EDIT', assemblyId: hitPart.assemblyId });
      }
    },

    onKeyDown(e, toolState, currentSelectedId) {
      // Escape in edit mode: exit edit mode
      if (e.key === 'Escape' && isEditMode) {
        e.preventDefault();
        e.stopPropagation();
        // Exit edit mode, re-select the assembly
        editorDispatch({ type: 'SET_ACTIVE_ASSEMBLY', assemblyId: null });
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && currentSelectedId) {
        if (selectedType === 'object') {
          dispatch({ type: 'OBJECT_DELETE', objectId: currentSelectedId });
        } else if (selectedType === 'assembly' && !isEditMode) {
          // Delete assembly with all its parts
          dispatch({ type: 'ASSEMBLY_DELETE_WITH_PARTS', assemblyId: currentSelectedId });
        } else {
          // Delete individual part
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
