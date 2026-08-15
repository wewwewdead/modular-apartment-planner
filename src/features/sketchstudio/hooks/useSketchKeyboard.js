import { useEffect } from 'react';
import {
  cancelDraft,
  closeShortcutOverlay,
  commitEntity,
  deleteSelected,
  endTransform,
  patchDraft,
  setActiveTool,
  setDocumentEntities,
  setPrecisionInput,
  setUiFlag,
  toggleShortcutOverlay,
} from '../store/sketchStudioActions';
import { createPolylineEntity } from '../utils/entityUtils';
import { getNextActiveLayer } from '../utils/layerUtils';
import { withIsometricPlaneMeta } from '../utils/isometricUtils';
import { DEFAULT_FILLET_RADIUS, MAX_FILLET_RADIUS, MIN_FILLET_RADIUS, FILLET_RADIUS_STEP } from '../utils/filletUtils';
import { applyFillet } from '../utils/filletUtils';
import {
  applyChamfer,
  CHAMFER_DISTANCE_STEP,
  DEFAULT_CHAMFER_DISTANCE,
  MAX_CHAMFER_DISTANCE,
  MIN_CHAMFER_DISTANCE,
} from '../utils/chamferUtils';
import { commitSelectionCopyResult } from './selectionCopyCommit';
import { removeLastPolylineVertex } from '../utils/polylineUtils';
import { translateEntities } from '../utils/transformUtils';
import {
  TOOL_SHORTCUT_MAP,
  buildAngleDimensionEntityFromDraft,
  buildSketchArrayResult,
  buildSketchMirrorResult,
  isEditableTarget,
  parsePositiveNumber,
} from './sketchConstants';
import { SHORTCUT_OVERLAY_TOGGLE_KEY } from '../utils/shortcutManifest';

export default function useSketchKeyboard(state, dispatch, callbacks) {
  const { commitPrecisionDraft, undo, redo, isSpacePanActiveRef, groupSelection, degroupSelection } = callbacks;

  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = String(event.key).toLowerCase();
      const hasPrimaryModifier = event.ctrlKey || event.metaKey;

      // The shortcut overlay is modal: while it is open it swallows every binding so
      // Escape closes the overlay instead of also cancelling the active draft.
      if (state.ui.shortcutOverlayOpen) {
        if (event.key === 'Escape' || event.key === SHORTCUT_OVERLAY_TOGGLE_KEY) {
          event.preventDefault();
          dispatch(closeShortcutOverlay());
        }
        return;
      }

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

      if (event.key === SHORTCUT_OVERLAY_TOGGLE_KEY && !hasPrimaryModifier && !event.altKey) {
        event.preventDefault();
        dispatch(toggleShortcutOverlay());
        return;
      }

      if (hasPrimaryModifier && !event.altKey && key === 'g') {
        if (event.shiftKey) {
          if (
            state.document.entities.some(
              (entity) => state.selection.selectedIds.includes(entity.id) && Boolean(entity.meta?.groupId),
            )
          ) {
            event.preventDefault();
            degroupSelection();
          }
        } else if (state.selection.selectedIds.length >= 2) {
          event.preventDefault();
          groupSelection();
        }
        return;
      }

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

      // Tab flips the array between a straight run and a ring. Only while the
      // array tool is active, so Tab keeps its normal focus behaviour elsewhere.
      if (event.key === 'Tab' && state.ui.activeTool === 'array' && !hasPrimaryModifier && !event.altKey) {
        event.preventDefault();
        dispatch(setUiFlag('arrayMode', state.ui.arrayMode === 'polar' ? 'linear' : 'polar'));
        return;
      }

      if ((event.key === ']' || event.key === '[') && state.draft.type === 'chamfer') {
        event.preventDefault();
        const currentDistance = parsePositiveNumber(state.draft.precisionInput?.distance) ?? DEFAULT_CHAMFER_DISTANCE;
        const nextDistance =
          event.key === ']'
            ? Math.min(MAX_CHAMFER_DISTANCE, currentDistance + CHAMFER_DISTANCE_STEP)
            : Math.max(MIN_CHAMFER_DISTANCE, currentDistance - CHAMFER_DISTANCE_STEP);
        dispatch(setPrecisionInput({ distance: String(nextDistance) }));
        return;
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
        if (state.draft.type === 'fillet' || state.draft.type === 'chamfer') {
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
        if (state.draft.type === 'chamfer' && state.draft.hoveredCorner && state.draft.previewGeometry) {
          event.preventDefault();
          dispatch(
            setDocumentEntities(
              applyChamfer(
                state.document.entities,
                state.draft.hoveredCorner,
                state.draft.previewGeometry,
                getNextActiveLayer(state.document, state.ui.activeLayerId),
              ),
            ),
          );
          dispatch(patchDraft({ hoveredCorner: null, previewGeometry: null }));
          return;
        }

        if (state.draft.type === 'mirror' && state.draft.points?.length && state.draft.currentPoint) {
          event.preventDefault();
          commitSelectionCopyResult(
            dispatch,
            buildSketchMirrorResult({
              entities: state.document.entities,
              draft: state.draft,
              selectedIds: state.selection.selectedIds,
              axisStart: state.draft.points[0],
              axisEnd: state.draft.currentPoint,
            }),
            'Nothing in the selection can be mirrored',
          );
          return;
        }

        if (state.draft.type === 'array' && state.draft.points?.length) {
          event.preventDefault();
          commitSelectionCopyResult(
            dispatch,
            buildSketchArrayResult({
              entities: state.document.entities,
              draft: state.draft,
              selectedIds: state.selection.selectedIds,
              arrayMode: state.ui.arrayMode,
              targetPoint: state.draft.currentPoint,
            }),
            'Nothing in the selection can be arrayed',
          );
          return;
        }

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
          const nextEntity = buildAngleDimensionEntityFromDraft({
            draft: state.draft,
            referencePoint: state.draft.currentPoint,
            document: state.document,
            targetLayerId: getNextActiveLayer(state.document, state.ui.activeLayerId),
            sourceRefs: state.draft.sourceRefs ?? [],
            viewMode: state.ui.viewMode,
            isometricPlane: state.ui.isometricPlane,
          });
          if (nextEntity) dispatch(commitEntity(nextEntity));
          return;
        }

        if (state.draft.type === 'polyline' && state.draft.points.length >= 2) {
          event.preventDefault();
          const nextEntity = withIsometricPlaneMeta(
            createPolylineEntity(
              state.draft.points,
              state.document.entities,
              getNextActiveLayer(state.document, state.ui.activeLayerId),
              state.draft.closedPreview,
            ),
            state.ui.viewMode,
            state.ui.isometricPlane,
          );
          if (nextEntity) dispatch(commitEntity(nextEntity));
          return;
        }

        if (['line', 'rect', 'circle', 'holeCircle', 'cutoutRect', 'fastener', 'offset'].includes(state.draft.type)) {
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
    degroupSelection,
    dispatch,
    groupSelection,
    isSpacePanActiveRef,
    redo,
    undo,
    state.document,
    state.draft,
    state.interaction.mode,
    state.selection.selectedIds,
    state.ui.activeLayerId,
    state.ui.activeTool,
    state.ui.arrayMode,
    state.ui.isometricPlane,
    state.ui.shortcutOverlayOpen,
    state.ui.viewMode,
  ]);
}
