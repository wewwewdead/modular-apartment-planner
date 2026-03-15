import { createPanel, createLeg, createFrame, createCutout, createHole } from '../../domain/partModels';
import { viewToModelPosition, viewToModelExtents } from '../../domain/viewProjection';
import { snapPoint } from '../snap';
import { SKETCH_GRID_MINOR } from '../../domain/defaults';

const partFactories = {
  panel: createPanel,
  leg: createLeg,
  frame: createFrame,
  cutout: createCutout,
  hole: createHole,
};

export function createPartPlaceHandler({ dispatch, editorDispatch, activeView, activeAssemblyId, partType, selectedId, project, snapEnabled }) {
  const needsParent = partType === 'cutout' || partType === 'hole';

  return {
    onMouseDown(modelPos, e, toolState) {
      if (e.button !== 0) return;

      if (activeAssemblyId) {
        const activeAssembly = project.assemblies.find((assembly) => assembly.id === activeAssemblyId);
        const managedObject = activeAssembly?.objectId
          ? project.objects.find((object) => object.id === activeAssembly.objectId && object.editingPolicy === 'parametric')
          : null;
        if (managedObject) {
          editorDispatch({
            type: 'SET_STATUS_MESSAGE',
            message: 'Detach the object before manually adding parts to a generated assembly.',
          });
          return;
        }
      }

      if (needsParent) {
        const parentPart = selectedId ? project.parts.find((p) => p.id === selectedId) : null;
        if (!parentPart || parentPart.type !== 'panel') {
          editorDispatch({
            type: 'SET_STATUS_MESSAGE',
            message: `Select a panel first to place a ${partType}.`,
          });
          return;
        }
      }

      const pos = snapEnabled ? snapPoint(modelPos, SKETCH_GRID_MINOR) : modelPos;

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          drawing: true,
          startPos: { x: pos.x, y: pos.y },
          currentPos: { x: pos.x, y: pos.y },
        },
      });
    },

    onMouseMove(modelPos, e, toolState) {
      if (!toolState.drawing) return;

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          currentPos: { x: modelPos.x, y: modelPos.y },
        },
      });
    },

    onMouseUp(modelPos, e, toolState) {
      if (!toolState.drawing || !toolState.startPos) return;

      const endPos = snapEnabled ? snapPoint(modelPos, SKETCH_GRID_MINOR) : modelPos;

      const x = Math.min(toolState.startPos.x, endPos.x);
      const y = Math.min(toolState.startPos.y, endPos.y);
      const svgW = Math.abs(endPos.x - toolState.startPos.x);
      const svgH = Math.abs(endPos.y - toolState.startPos.y);

      const minSize = 10; // mm
      if (svgW > minSize && svgH > minSize) {
        const position = viewToModelPosition(x, y, activeView);
        const extents = viewToModelExtents(svgW, svgH, activeView, partType);

        const factory = partFactories[partType];
        if (!factory) return;

        const overrides = {
          position,
          ...extents,
        };

        if (needsParent) {
          overrides.parentId = selectedId;
        }

        const part = factory(overrides);

        dispatch({ type: 'PART_ADD', part });

        if (activeAssemblyId) {
          dispatch({ type: 'ASSEMBLY_ADD_PART', assemblyId: activeAssemblyId, partId: part.id });
        }

        editorDispatch({
          type: 'SET_STATUS_MESSAGE',
          message: `${partType}: ${Math.round(svgW)} x ${Math.round(svgH)} mm`,
        });
      }

      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: {
          drawing: false,
          startPos: null,
          currentPos: null,
        },
      });
    },

    onKeyDown(e) {
      if (e.key === 'Escape') {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            drawing: false,
            startPos: null,
            currentPos: null,
          },
        });
      }
    },

    getCursor(toolState) {
      return 'crosshair';
    },
  };
}
