import { useCallback } from 'react';
import { calculateDistance, pixelsToWorldUnits } from '../utils/canvasMath';
import { duplicateEntitiesByIds, updateEntityInList } from '../utils/entityUtils';
import { inferDimensionSubtype } from '../utils/dimensionUtils';
import { updateEntityFromHandle } from '../utils/handleUtils';
import { applyIsometricOrthoPoint } from '../utils/isometricUtils';
import { findTopmostEntityAtPoint } from '../utils/hitTest';
import { findFilletableCorner, computeSketchFillet, DEFAULT_FILLET_RADIUS } from '../utils/filletUtils';
import { expandGroupedSelection } from '../utils/groupUtils';
import { applyOrthoPoint } from '../utils/canvasMath';
import { rotateEntities, translateEntities } from '../utils/transformUtils';
import { getEntityIdsInSelectionBox, normalizeSelectionBox } from '../utils/selectionUtils';
import {
  clearPointerDecorations,
  endAnchorDrag,
  endHandleDrag,
  endPan,
  endSelectionBox,
  endTransform,
  patchDraft,
  patchTransform,
  setDocumentEntities,
  setPointerDown,
  setSelection,
  setSuppressNextClick,
  startDraft,
  startPan,
  startSelectionBox,
  startTransform,
  syncPointer,
  updatePan,
  updateSelectionBox,
} from '../store/sketchStudioActions';
import {
  PROFILE_CLOSE_TOLERANCE_PX,
  TRANSFORM_DRAG_THRESHOLD_PX,
  getEmptySnapState,
  mergeSelection,
  parsePositiveNumber,
  HIT_TOLERANCE_PX,
} from './sketchConstants';

export default function useSketchPointer(state, dispatch, viewportHook, options) {
  const { activeTool, editableEntities, isSpacePanActiveRef, selectionBounds, getConstrainedDraftPoint } = options;
  const { readCanvasPoint, readWorldPoint, getOrthoReferencePoint, resolveSnap, resolvePointerState } = viewportHook;

  const handlePointerDown = useCallback(
    (event) => {
      const shouldPan =
        event.button === 1 ||
        (event.button === 0 && activeTool === 'pan') ||
        (event.button === 0 && isSpacePanActiveRef.current);

      if (shouldPan) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dispatch(
          startPan({ pointerId: event.pointerId, screenPoint: readCanvasPoint(event), startViewport: state.viewport }),
        );
        return;
      }

      if (event.button !== 0) return;

      const worldPoint = readWorldPoint(readCanvasPoint(event));

      if (activeTool === 'select') {
        const hoveredEntity = findTopmostEntityAtPoint(
          editableEntities,
          worldPoint,
          pixelsToWorldUnits(HIT_TOLERANCE_PX, state.viewport.zoom),
        );

        if (hoveredEntity && state.selection.selectedIds.includes(hoveredEntity.id)) {
          event.currentTarget.setPointerCapture(event.pointerId);
          dispatch(
            startTransform({
              type: 'move',
              copyMode: event.ctrlKey ? 'pending' : 'off',
              copiedEntityIds: [],
              pointerId: event.pointerId,
              startWorld: worldPoint,
              startAngle: 0,
              pivot: selectionBounds
                ? {
                    x: (selectionBounds.minX + selectionBounds.maxX) / 2,
                    y: (selectionBounds.minY + selectionBounds.maxY) / 2,
                  }
                : null,
              entityIds: state.selection.selectedIds,
              startEntities: state.document.entities,
            }),
          );
          return;
        }

        if (!hoveredEntity) {
          event.currentTarget.setPointerCapture(event.pointerId);
          dispatch(startSelectionBox(worldPoint));
          return;
        }
      }

      dispatch(setPointerDown(true));
    },
    [
      activeTool,
      dispatch,
      editableEntities,
      isSpacePanActiveRef,
      readCanvasPoint,
      readWorldPoint,
      selectionBounds,
      state.document.entities,
      state.selection.selectedIds,
      state.viewport,
    ],
  );

  const handlePointerMove = useCallback(
    (event) => {
      const screenPoint = readCanvasPoint(event);

      if (state.interaction.mode === 'panning') {
        const nextViewport = {
          ...state.interaction.panStartViewport,
          panX: state.interaction.panStartViewport.panX + (screenPoint.x - state.interaction.panStartScreen.x),
          panY: state.interaction.panStartViewport.panY + (screenPoint.y - state.interaction.panStartScreen.y),
        };
        dispatch(
          updatePan({
            pointerId: event.pointerId,
            viewport: nextViewport,
            screenPoint,
            worldPoint: readWorldPoint(screenPoint, nextViewport),
          }),
        );
        return;
      }

      if (state.interaction.mode === 'selection-box' && state.selection.selectionBox.isActive) {
        const currentPoint = readWorldPoint(screenPoint);
        const threshold = pixelsToWorldUnits(4, state.viewport.zoom);
        dispatch(
          updateSelectionBox({
            currentPoint,
            hasMoved:
              Math.abs(currentPoint.x - state.selection.selectionBox.start.x) > threshold ||
              Math.abs(currentPoint.y - state.selection.selectionBox.start.y) > threshold,
          }),
        );
        resolvePointerState(screenPoint);
        return;
      }

      if (state.interaction.mode === 'handle-drag' && state.interaction.handleDrag) {
        const rawWorldPoint = readWorldPoint(screenPoint);
        const draggedEntity = state.document.entities.find((e) => e.id === state.interaction.handleDrag.entityId);
        if (!draggedEntity) return;
        const anchorPoint =
          draggedEntity.type === 'line'
            ? state.interaction.handleDrag.handleId === 'start'
              ? { x: draggedEntity.x2, y: draggedEntity.y2 }
              : { x: draggedEntity.x1, y: draggedEntity.y1 }
            : null;
        const nextSnap = resolveSnap(rawWorldPoint, anchorPoint);
        const basePoint = nextSnap.point ?? rawWorldPoint;
        const nextPoint =
          draggedEntity.type === 'line' && state.ui.orthoEnabled && anchorPoint
            ? state.ui.viewMode === 'isometric'
              ? applyIsometricOrthoPoint(anchorPoint, basePoint)
              : applyOrthoPoint(anchorPoint, basePoint)
            : basePoint;
        dispatch(
          setDocumentEntities(
            updateEntityInList(state.document.entities, draggedEntity.id, (entity) =>
              updateEntityFromHandle(entity, state.interaction.handleDrag.handleId, nextPoint),
            ),
          ),
        );
        dispatch(syncPointer({ screenPoint, worldPoint: nextPoint, hoveredId: draggedEntity.id, snap: nextSnap }));
        return;
      }

      if (state.interaction.mode === 'transform' && state.interaction.transform) {
        const rawWorldPoint = readWorldPoint(screenPoint);
        const transformState = state.interaction.transform;
        const dragDistance = calculateDistance(transformState.startWorld, rawWorldPoint);
        const dragThreshold = pixelsToWorldUnits(TRANSFORM_DRAG_THRESHOLD_PX, state.viewport.zoom);

        if (transformState.type === 'move') {
          let moveEntityIds = transformState.entityIds;
          let moveStartEntities = transformState.startEntities;
          if (transformState.copyMode === 'pending') {
            if (dragDistance <= dragThreshold) {
              dispatch(
                syncPointer({
                  screenPoint,
                  worldPoint: rawWorldPoint,
                  hoveredId: state.hover.hoveredId,
                  snap: getEmptySnapState(),
                }),
              );
              return;
            }
            const duplicated = duplicateEntitiesByIds(transformState.startEntities, transformState.entityIds);
            if (duplicated.duplicatedIds.length) {
              moveEntityIds = duplicated.duplicatedIds;
              moveStartEntities = duplicated.entities;
              dispatch(setSelection(moveEntityIds));
              dispatch(
                patchTransform({
                  copyMode: 'active',
                  entityIds: moveEntityIds,
                  copiedEntityIds: moveEntityIds,
                  startEntities: moveStartEntities,
                }),
              );
            } else {
              dispatch(patchTransform({ copyMode: 'off' }));
            }
          }
          dispatch(
            setDocumentEntities(
              translateEntities(moveStartEntities, moveEntityIds, {
                x: rawWorldPoint.x - transformState.startWorld.x,
                y: rawWorldPoint.y - transformState.startWorld.y,
              }),
            ),
          );
        }

        if (transformState.type === 'rotate' && transformState.pivot) {
          const currentAngle = Math.atan2(
            rawWorldPoint.y - transformState.pivot.y,
            rawWorldPoint.x - transformState.pivot.x,
          );
          dispatch(
            setDocumentEntities(
              rotateEntities(
                transformState.startEntities,
                transformState.entityIds,
                transformState.pivot,
                currentAngle - transformState.startAngle,
              ),
            ),
          );
        }

        dispatch(
          syncPointer({
            screenPoint,
            worldPoint: rawWorldPoint,
            hoveredId: state.hover.hoveredId,
            snap: getEmptySnapState(),
          }),
        );
        return;
      }

      const draftAnchor = getOrthoReferencePoint(state.draft.type, state.draft);
      const { worldPoint, snap } = resolvePointerState(screenPoint, state.viewport, { anchorPoint: draftAnchor });

      if (activeTool === 'fillet') {
        if (!state.draft.type) dispatch(startDraft({ type: 'fillet' }));
        const filletTolerance = pixelsToWorldUnits(HIT_TOLERANCE_PX * 2, state.viewport.zoom);
        const filletRadius = parsePositiveNumber(state.draft.precisionInput?.radius) ?? DEFAULT_FILLET_RADIUS;
        const corner = findFilletableCorner(state.document.entities, worldPoint, filletTolerance);
        if (corner) {
          const geometry = computeSketchFillet(corner, filletRadius);
          dispatch(patchDraft({ hoveredCorner: corner, previewGeometry: geometry, currentPoint: worldPoint }));
        } else {
          dispatch(patchDraft({ hoveredCorner: null, previewGeometry: null, currentPoint: worldPoint }));
        }
        return;
      }

      if (!state.draft.type) return;

      if (state.draft.type === 'offset') {
        dispatch(patchDraft({ currentPoint: worldPoint }));
        return;
      }

      if (state.draft.type === 'dimension') {
        dispatch(
          patchDraft({
            currentPoint: state.draft.step === 'pickSecond' ? (snap.point ?? worldPoint) : worldPoint,
            subtype:
              state.draft.step === 'pickSecond'
                ? inferDimensionSubtype(state.draft.points[0], snap.point ?? worldPoint)
                : state.draft.subtype,
          }),
        );
        return;
      }

      if (state.draft.type === 'text') {
        dispatch(patchDraft({ currentPoint: worldPoint }));
        return;
      }

      if (state.draft.type === 'angle') {
        dispatch(patchDraft({ currentPoint: snap.point ?? worldPoint }));
        return;
      }

      if (state.draft.type === 'polyline' && state.draft.points.length >= 2) {
        const nextPoint = getConstrainedDraftPoint('polyline', state.draft, snap.point ?? worldPoint);
        const startPoint = state.draft.points[0];
        const closeTolerance = pixelsToWorldUnits(PROFILE_CLOSE_TOLERANCE_PX, state.viewport.zoom);
        const closedPreview = calculateDistance(startPoint, nextPoint) <= closeTolerance;
        dispatch(patchDraft({ currentPoint: closedPreview ? startPoint : nextPoint, closedPreview }));
        return;
      }

      dispatch(
        patchDraft({ currentPoint: getConstrainedDraftPoint(state.draft.type, state.draft, snap.point ?? worldPoint) }),
      );
    },
    [
      dispatch,
      getConstrainedDraftPoint,
      getOrthoReferencePoint,
      readCanvasPoint,
      readWorldPoint,
      resolvePointerState,
      resolveSnap,
      state.document.entities,
      state.draft,
      state.hover.hoveredId,
      state.interaction,
      state.selection.selectionBox,
      state.ui.orthoEnabled,
      state.ui.viewMode,
      state.viewport,
      activeTool,
    ],
  );

  const handlePointerUp = useCallback(
    (event) => {
      if (state.interaction.mode === 'panning' && event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
        dispatch(endPan());
        dispatch(setSuppressNextClick(true));
        return;
      }

      if (state.interaction.mode === 'selection-box') {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        const { selectionBox } = state.selection;
        if (selectionBox.isActive && selectionBox.hasMoved) {
          const nextIds = expandGroupedSelection(
            editableEntities,
            getEntityIdsInSelectionBox(
              editableEntities,
              normalizeSelectionBox(selectionBox.start, selectionBox.current),
            ),
          );
          dispatch(setSelection(mergeSelection(state.selection.selectedIds, nextIds, event.shiftKey)));
          dispatch(setSuppressNextClick(true));
        }
        dispatch(endSelectionBox());
        return;
      }

      if (state.interaction.mode === 'handle-drag') {
        dispatch(endHandleDrag());
        return;
      }
      if (state.interaction.mode === 'anchor-drag') {
        dispatch(endAnchorDrag());
        return;
      }

      if (state.interaction.mode === 'transform') {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        if (
          calculateDistance(state.interaction.transform.startWorld, readWorldPoint(readCanvasPoint(event))) >
          pixelsToWorldUnits(TRANSFORM_DRAG_THRESHOLD_PX, state.viewport.zoom)
        ) {
          dispatch(setSuppressNextClick(true));
        }
        dispatch(endTransform());
        return;
      }

      dispatch(setPointerDown(false));
    },
    [
      dispatch,
      editableEntities,
      readCanvasPoint,
      readWorldPoint,
      state.interaction,
      state.selection,
      state.viewport.zoom,
    ],
  );

  const handlePointerCancel = useCallback(() => {
    if (state.interaction.mode === 'panning') {
      dispatch(endPan());
      return;
    }
    if (state.interaction.mode === 'selection-box') {
      dispatch(endSelectionBox());
      return;
    }
    if (state.interaction.mode === 'handle-drag') {
      dispatch(endHandleDrag());
      return;
    }
    if (state.interaction.mode === 'anchor-drag') {
      dispatch(endAnchorDrag());
      return;
    }
    if (state.interaction.mode === 'transform') {
      dispatch(endTransform());
      return;
    }
    dispatch(setPointerDown(false));
  }, [dispatch, state.interaction.mode]);

  const handlePointerLeave = useCallback(() => {
    if (state.interaction.mode === 'idle') dispatch(clearPointerDecorations());
  }, [dispatch, state.interaction.mode]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
  };
}
