import { useEffect } from 'react';
import {
  cancelDraft,
  commitEntity,
  deleteSelected,
  endTransform,
  patchDraft,
  setActiveTool,
  setDocumentEntities,
  setPrecisionInput,
} from '../store/sketchStudioActions';
import { calculateDistance } from '../utils/canvasMath';
import { createAngleDimensionEntity, createPolylineEntity } from '../utils/entityUtils';
import { getNextActiveLayer } from '../utils/layerUtils';
import {
  DEFAULT_FILLET_RADIUS,
  MAX_FILLET_RADIUS,
  MIN_FILLET_RADIUS,
  FILLET_RADIUS_STEP,
} from '../utils/filletUtils';
import { applyFillet } from '../utils/filletUtils';
import { removeLastPolylineVertex } from '../utils/polylineUtils';
import { translateEntities } from '../utils/transformUtils';
import {
  TOOL_SHORTCUT_MAP,
  isEditableTarget,
  constrainAnglePoint,
  parsePositiveNumber,
} from './sketchConstants';

export default function useSketchKeyboard(state, dispatch, callbacks) {
  const { commitPrecisionDraft, undo, redo, isSpacePanActiveRef } = callbacks;

  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = String(event.key).toLowerCase();
      const hasPrimaryModifier = event.ctrlKey || event.metaKey;

      if (hasPrimaryModifier && !event.altKey && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (event.ctrlKey && !event.metaKey && !event.altKey && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (event.code === 'Space') {
        event.preventDefault();
        isSpacePanActiveRef.current = true;
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const shortcutToolId = TOOL_SHORTCUT_MAP.get(key);
        if (shortcutToolId) {
          event.preventDefault();
          dispatch(setActiveTool(shortcutToolId));
          return;
        }
      }

      if (event.key === ']' && state.draft.type === 'fillet') {
        event.preventDefault();
        const currentRadius = parsePositiveNumber(state.draft.precisionInput?.radius) ?? DEFAULT_FILLET_RADIUS;
        dispatch(
          setPrecisionInput({ radius: String(Math.min(MAX_FILLET_RADIUS, currentRadius + FILLET_RADIUS_STEP)) }),
        );
        return;
      }

      if (event.key === '[' && state.draft.type === 'fillet') {
        event.preventDefault();
        const currentRadius = parsePositiveNumber(state.draft.precisionInput?.radius) ?? DEFAULT_FILLET_RADIUS;
        dispatch(
          setPrecisionInput({ radius: String(Math.max(MIN_FILLET_RADIUS, currentRadius - FILLET_RADIUS_STEP)) }),
        );
        return;
      }

      if (event.key === 'Escape') {
        if (state.interaction.mode === 'transform') {
          dispatch(endTransform());
          return;
        }
        if (state.draft.type === 'fillet') {
          dispatch(cancelDraft());
          dispatch(setActiveTool('select'));
          return;
        }
        if (state.draft.type) {
          dispatch(cancelDraft());
        }
        return;
      }

      if (event.key === 'Backspace' && state.draft.type === 'polyline') {
        event.preventDefault();
        if (state.draft.points.length <= 1) {
          dispatch(cancelDraft());
          return;
        }
        const nextPoints = removeLastPolylineVertex(state.draft.points);
        dispatch(
          patchDraft({
            points: nextPoints,
            currentPoint: nextPoints.at(-1) ?? null,
            sourceRefs: state.draft.sourceRefs.slice(0, -1),
            closedPreview: false,
          }),
        );
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selection.selectedIds.length) {
        event.preventDefault();
        dispatch(deleteSelected());
        return;
      }

      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) &&
        state.selection.selectedIds.length
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const delta = {
          ArrowUp: { x: 0, y: -step },
          ArrowDown: { x: 0, y: step },
          ArrowLeft: { x: -step, y: 0 },
          ArrowRight: { x: step, y: 0 },
        }[event.key];
        dispatch(setDocumentEntities(translateEntities(state.document.entities, state.selection.selectedIds, delta)));
        return;
      }

      if (event.key === 'Enter') {
        if (state.draft.type === 'fillet' && state.draft.hoveredCorner && state.draft.previewGeometry) {
          event.preventDefault();
          const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);
          dispatch(
            setDocumentEntities(
              applyFillet(
                state.document.entities,
                state.draft.hoveredCorner,
                state.draft.previewGeometry,
                targetLayerId,
              ),
            ),
          );
          dispatch(patchDraft({ hoveredCorner: null, previewGeometry: null }));
          return;
        }

        if (
          state.draft.type === 'angle' &&
          state.draft.step === 'pickSecond' &&
          state.draft.points.length === 2 &&
          state.draft.currentPoint
        ) {
          event.preventDefault();
          const vertex = state.draft.points[1];
          const inputAngle = parsePositiveNumber(state.draft.precisionInput?.angle);
          const isoPlane = state.ui.viewMode === 'isometric' ? state.ui.isometricPlane : null;
          const p2 =
            inputAngle != null
              ? constrainAnglePoint(vertex, state.draft.points[0], state.draft.currentPoint, inputAngle, isoPlane)
              : state.draft.currentPoint;
          const arcRadius = Math.max(calculateDistance(vertex, p2), 20);
          const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);
          dispatch(
            commitEntity(
              createAngleDimensionEntity({
                vertex,
                p1: state.draft.points[0],
                p2,
                arcRadius,
                entities: state.document.entities,
                sourceRefs: state.draft.sourceRefs?.filter(Boolean) ?? [],
                layerId: state.document.layers.some((l) => l.id === 'dimensions') ? 'dimensions' : targetLayerId,
                isometricPlane: isoPlane,
              }),
            ),
          );
          return;
        }

        if (state.draft.type === 'polyline' && state.draft.points.length >= 2) {
          event.preventDefault();
          const nextEntity = createPolylineEntity(
            state.draft.points,
            state.document.entities,
            getNextActiveLayer(state.document, state.ui.activeLayerId),
            state.draft.closedPreview,
          );
          if (nextEntity) dispatch(commitEntity(nextEntity));
          return;
        }

        if (['line', 'rect', 'circle', 'holeCircle', 'cutoutRect', 'offset'].includes(state.draft.type)) {
          event.preventDefault();
          commitPrecisionDraft();
        }
      }
    };

    const handleKeyUp = (event) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      isSpacePanActiveRef.current = false;
    };

    const handleWindowBlur = () => {
      isSpacePanActiveRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [
    commitPrecisionDraft,
    dispatch,
    isSpacePanActiveRef,
    redo,
    undo,
    state.document,
    state.draft,
    state.interaction.mode,
    state.selection.selectedIds.length,
    state.ui.activeLayerId,
    state.ui.activeTool,
  ]);
}
