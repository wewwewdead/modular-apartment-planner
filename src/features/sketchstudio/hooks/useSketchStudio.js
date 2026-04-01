import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import sketchStudioInitialState from '../store/sketchStudioInitialState';
import sketchStudioReducer from '../store/sketchStudioReducer';
import {
  cancelDraft,
  commitEntity,
  deleteSelected,
  endAnchorDrag,
  endHandleDrag,
  endPan,
  endSelectionBox,
  endTransform,
  patchTransform,
  patchDraft,
  setActiveTool,
  setDocumentEntities,
  setPointerDown,
  setPrecisionInput,
  setSelection,
  setSuppressNextClick,
  setUiFlag,
  startDraft,
  startHandleDrag,
  startPan,
  startSelectionBox,
  startTransform,
  updatePan,
  updateSelectionBox,
  setEntityMaterial,
  setEntityThickness,
  toggleCraftsmanMode,
  setVariables,
  syncPointer,
  clearPointerDecorations,
} from '../store/sketchStudioActions';
import { calculateDistance, pixelsToWorldUnits, roundWorldValue } from '../utils/canvasMath';
import {
  buildSourceRefFromSnap,
  createArcEntity,
  createCircleEntity,
  createAngleDimensionEntity,
  createDimensionEntity,
  duplicateEntitiesByIds,
  createEllipseEntity,
  createFeatureEntity,
  createLineEntity,
  createPolylineEntity,
  createRectEntity,
  createTextEntity,
  toggleBrokenLineForEntities,
  updateEntityFromNumericField,
  updateEntityInList,
} from '../utils/entityUtils';
import { inferDimensionSubtype } from '../utils/dimensionUtils';
import { getPrecisionHudData } from '../utils/draftPrecisionUtils';
import { updateEntityFromHandle } from '../utils/handleUtils';
import { applyIsometricOrthoPoint } from '../utils/isometricUtils';
import { findTopmostEntityAtPoint } from '../utils/hitTest';
import { getEditableEntities, getNextActiveLayer, getVisibleEntities } from '../utils/layerUtils';
import {
  findFilletableCorner,
  computeSketchFillet,
  applyFillet,
  DEFAULT_FILLET_RADIUS,
  MIN_FILLET_RADIUS,
  MAX_FILLET_RADIUS,
  FILLET_RADIUS_STEP,
} from '../utils/filletUtils';
import { closePolyline } from '../utils/profileUtils';
import { appendPolylineVertex, removeLastPolylineVertex } from '../utils/polylineUtils';
import { getEntityIdsInSelectionBox, normalizeSelectionBox } from '../utils/selectionUtils';
import { applyOrthoPoint } from '../utils/canvasMath';
import { mirrorEntities, rotateEntities, translateEntities } from '../utils/transformUtils';
import {
  PROFILE_CLOSE_TOLERANCE_PX,
  TRANSFORM_DRAG_THRESHOLD_PX,
  TOOL_SHORTCUT_MAP,
  getEmptySnapState,
  isEditableTarget,
  mergeSelection,
  constrainAnglePoint,
  parsePositiveNumber,
  isOffsettableEntity,
  getRectEndpointFromDraft,
  getIsometricRectangleFromDraft,
  getLineEndpointFromDraft,
  getCircleRadiusPointFromDraft,
  buildOffsetEntityFromDraft,
  getDraftPreviewEntity,
  HIT_TOLERANCE_PX,
  TOOL_DEFINITIONS,
} from './sketchConstants';
import useSketchSelection from './useSketchSelection';
import useSketchViewport from './useSketchViewport';
import useSketchLayers from './useSketchLayers';
import useSketchHistory from './useSketchHistory';
import useSketchPersistence from './useSketchPersistence';

// Re-export for consumers that import TOOL_DEFINITIONS from this file
export { TOOL_DEFINITIONS } from './sketchConstants';

export default function useSketchStudio() {
  const [state, dispatch] = useReducer(sketchStudioReducer, sketchStudioInitialState);
  const canvasRef = useRef(null);
  const isSpacePanActiveRef = useRef(false);

  const activeTool = state.ui.activeTool;
  const visibleEntities = useMemo(() => getVisibleEntities(state.document), [state.document]);
  const editableEntities = useMemo(() => getEditableEntities(state.document), [state.document]);

  // --- Sub-hooks ---
  const selection = useSketchSelection(state);
  const viewport = useSketchViewport(state, dispatch, canvasRef, { visibleEntities, editableEntities });
  const layers = useSketchLayers(state, dispatch);
  const history = useSketchHistory(state, dispatch);
  const persistence = useSketchPersistence(state, dispatch);

  const { selectedIds, selectedEntity, selectedEntities, selectionBounds } = selection;
  const { readCanvasPoint, readWorldPoint, getOrthoReferencePoint, getConstrainedDraftPoint, resolveSnap, resolvePointerState } = viewport;
  const { handleUndo, handleRedo } = history;

  // --- Draft preview ---
  const draftPreview = useMemo(
    () => getDraftPreviewEntity(state.draft, state.document, getNextActiveLayer(state.document, state.ui.activeLayerId), state.ui),
    [state.document, state.draft, state.ui],
  );
  const precisionHud = useMemo(() => getPrecisionHudData(state.draft, draftPreview), [state.draft, draftPreview]);

  // --- Simple action callbacks ---
  const handleToolChange = useCallback((toolId) => dispatch(setActiveTool(toolId)), []);
  const toggleOrtho = useCallback(() => dispatch(setUiFlag('orthoEnabled', !state.ui.orthoEnabled)), [state.ui.orthoEnabled]);
  const toggleSnap = useCallback(() => dispatch(setUiFlag('snapEnabled', !state.ui.snapEnabled)), [state.ui.snapEnabled]);
  const setViewMode = useCallback((viewMode) => dispatch(setUiFlag('viewMode', viewMode === 'isometric' ? 'isometric' : 'plan')), []);
  const setIsometricPlane = useCallback((plane) => {
    if (!['top', 'left', 'right'].includes(plane)) return;
    dispatch(setUiFlag('isometricPlane', plane));
  }, []);

  const updateSelectedEntityField = useCallback((field, rawValue) => {
    if (!selectedEntity) return;
    dispatch(setDocumentEntities(updateEntityInList(state.document.entities, selectedEntity.id, (entity) => updateEntityFromNumericField(entity, field, rawValue))));
  }, [selectedEntity, state.document.entities]);

  // --- Commit precision draft ---
  const commitPrecisionDraft = useCallback(() => {
    if (!state.draft.type || !draftPreview) return;

    const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);

    if (state.draft.type === 'line') {
      const nextEntity = createLineEntity(state.draft.startPoint, { x: draftPreview.x2, y: draftPreview.y2 }, state.document.entities, targetLayerId);
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    if (state.draft.type === 'rect') {
      const nextEntity = state.ui.viewMode === 'isometric'
        ? (() => {
            const baseEntity = createPolylineEntity(draftPreview.points, state.document.entities, targetLayerId, true);
            return baseEntity ? { ...baseEntity, meta: { ...(baseEntity.meta || {}), projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane } } : null;
          })()
        : createRectEntity(draftPreview.startPoint, draftPreview.endPoint, state.document.entities, targetLayerId);
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    if (state.draft.type === 'circle') {
      const nextEntity = state.ui.viewMode === 'isometric'
        ? createEllipseEntity({ x: draftPreview.cx, y: draftPreview.cy }, { x: draftPreview.cx + draftPreview.rx, y: draftPreview.cy }, state.document.entities, targetLayerId, {
            plane: state.ui.isometricPlane, radius: draftPreview.radius, meta: { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane },
          })
        : createCircleEntity(draftPreview.center, draftPreview.radiusPoint, state.document.entities, targetLayerId);
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    if (state.draft.type === 'holeCircle') {
      const nextEntity = createFeatureEntity({
        featureType: 'hole', shape: state.ui.viewMode === 'isometric' ? 'ellipse' : 'circle',
        cx: draftPreview.cx, cy: draftPreview.cy, diameter: draftPreview.diameter,
        rx: draftPreview.rx, ry: draftPreview.ry, rotation: draftPreview.rotation,
        meta: state.ui.viewMode === 'isometric' ? { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane } : {},
      }, state.document.entities, targetLayerId);
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    if (state.draft.type === 'cutoutRect') {
      const nextEntity = createFeatureEntity({
        featureType: 'cutout', shape: state.ui.viewMode === 'isometric' ? 'polygon' : 'rect',
        x: draftPreview.startPoint ? Math.min(draftPreview.startPoint.x, draftPreview.endPoint.x) : undefined,
        y: draftPreview.startPoint ? Math.min(draftPreview.startPoint.y, draftPreview.endPoint.y) : undefined,
        width: draftPreview.width ?? (draftPreview.startPoint ? Math.abs(draftPreview.endPoint.x - draftPreview.startPoint.x) : undefined),
        height: draftPreview.height ?? (draftPreview.startPoint ? Math.abs(draftPreview.endPoint.y - draftPreview.startPoint.y) : undefined),
        points: draftPreview.points,
        meta: state.ui.viewMode === 'isometric' ? { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane } : {},
      }, state.document.entities, targetLayerId);
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    if (state.draft.type === 'offset') {
      const nextEntity = buildOffsetEntityFromDraft(state.draft, state.document, targetLayerId);
      if (nextEntity) { dispatch(commitEntity(nextEntity)); } else { dispatch(cancelDraft()); }
    }
  }, [draftPreview, state.document, state.draft, state.ui.activeLayerId, state.ui.isometricPlane, state.ui.viewMode]);

  // --- Transform handlers ---
  const handleTransformPointerDown = useCallback((transformType, event, options = {}) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const worldPoint = readWorldPoint(readCanvasPoint(event));
    const entityIds = options.entityIds ?? selectedIds;
    const copyMode = transformType === 'move' && event.ctrlKey ? 'pending' : 'off';
    if (!entityIds.length) return;
    dispatch(startTransform({
      type: transformType, pointerId: event.pointerId, startWorld: worldPoint,
      startAngle: options.pivot ? Math.atan2(worldPoint.y - options.pivot.y, worldPoint.x - options.pivot.x) : 0,
      pivot: options.pivot ?? null, entityIds, startEntities: state.document.entities, copyMode, copiedEntityIds: [],
    }));
  }, [readCanvasPoint, readWorldPoint, state.document.entities, selectedIds]);

  const handleRotateSelection = useCallback((degrees) => {
    if (!selectedIds.length || !selectionBounds) return;
    const pivot = { x: (selectionBounds.minX + selectionBounds.maxX) / 2, y: (selectionBounds.minY + selectionBounds.maxY) / 2 };
    dispatch(setDocumentEntities(rotateEntities(state.document.entities, selectedIds, pivot, (degrees * Math.PI) / 180)));
  }, [selectedIds, selectionBounds, state.document.entities]);

  const handleFlipSelection = useCallback((direction) => {
    if (!selectedIds.length || !selectionBounds) return;
    const pivot = { x: (selectionBounds.minX + selectionBounds.maxX) / 2, y: (selectionBounds.minY + selectionBounds.maxY) / 2 };
    dispatch(setDocumentEntities(mirrorEntities(state.document.entities, selectedIds, pivot, direction)));
  }, [selectedIds, selectionBounds, state.document.entities]);

  const handleToggleBrokenLines = useCallback(() => {
    if (!selectedIds.length) return;
    dispatch(setDocumentEntities(toggleBrokenLineForEntities(state.document.entities, selectedIds)));
  }, [selectedIds, state.document.entities]);

  const handleHandlePointerDown = useCallback((handle, event) => {
    if (!selectedEntity) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dispatch(startHandleDrag({ entityId: selectedEntity.id, handleId: handle.id, pointerId: event.pointerId }));
  }, [selectedEntity]);

  // --- Keyboard effect ---
  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = String(event.key).toLowerCase();
      const hasPrimaryModifier = event.ctrlKey || event.metaKey;

      if (hasPrimaryModifier && !event.altKey && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) { handleRedo(); } else { handleUndo(); }
        return;
      }

      if (event.ctrlKey && !event.metaKey && !event.altKey && key === 'y') {
        event.preventDefault();
        handleRedo();
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
        dispatch(setPrecisionInput({ radius: String(Math.min(MAX_FILLET_RADIUS, currentRadius + FILLET_RADIUS_STEP)) }));
        return;
      }

      if (event.key === '[' && state.draft.type === 'fillet') {
        event.preventDefault();
        const currentRadius = parsePositiveNumber(state.draft.precisionInput?.radius) ?? DEFAULT_FILLET_RADIUS;
        dispatch(setPrecisionInput({ radius: String(Math.max(MIN_FILLET_RADIUS, currentRadius - FILLET_RADIUS_STEP)) }));
        return;
      }

      if (event.key === 'Escape') {
        if (state.interaction.mode === 'transform') { dispatch(endTransform()); return; }
        if (state.draft.type === 'fillet') { dispatch(cancelDraft()); dispatch(setActiveTool('select')); return; }
        if (state.draft.type) { dispatch(cancelDraft()); }
        return;
      }

      if (event.key === 'Backspace' && state.draft.type === 'polyline') {
        event.preventDefault();
        if (state.draft.points.length <= 1) { dispatch(cancelDraft()); return; }
        const nextPoints = removeLastPolylineVertex(state.draft.points);
        dispatch(patchDraft({ points: nextPoints, currentPoint: nextPoints.at(-1) ?? null, sourceRefs: state.draft.sourceRefs.slice(0, -1), closedPreview: false }));
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selection.selectedIds.length) {
        event.preventDefault();
        dispatch(deleteSelected());
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && state.selection.selectedIds.length) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const delta = { ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step }, ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 } }[event.key];
        dispatch(setDocumentEntities(translateEntities(state.document.entities, state.selection.selectedIds, delta)));
        return;
      }

      if (event.key === 'Enter') {
        if (state.draft.type === 'fillet' && state.draft.hoveredCorner && state.draft.previewGeometry) {
          event.preventDefault();
          const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);
          dispatch(setDocumentEntities(applyFillet(state.document.entities, state.draft.hoveredCorner, state.draft.previewGeometry, targetLayerId)));
          dispatch(patchDraft({ hoveredCorner: null, previewGeometry: null }));
          return;
        }

        if (state.draft.type === 'angle' && state.draft.step === 'pickSecond' && state.draft.points.length === 2 && state.draft.currentPoint) {
          event.preventDefault();
          const vertex = state.draft.points[1];
          const inputAngle = parsePositiveNumber(state.draft.precisionInput?.angle);
          const isoPlane = state.ui.viewMode === 'isometric' ? state.ui.isometricPlane : null;
          const p2 = inputAngle != null ? constrainAnglePoint(vertex, state.draft.points[0], state.draft.currentPoint, inputAngle, isoPlane) : state.draft.currentPoint;
          const arcRadius = Math.max(calculateDistance(vertex, p2), 20);
          const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);
          dispatch(commitEntity(createAngleDimensionEntity({
            vertex, p1: state.draft.points[0], p2, arcRadius, entities: state.document.entities,
            sourceRefs: state.draft.sourceRefs?.filter(Boolean) ?? [],
            layerId: state.document.layers.some((l) => l.id === 'dimensions') ? 'dimensions' : targetLayerId,
            isometricPlane: isoPlane,
          })));
          return;
        }

        if (state.draft.type === 'polyline' && state.draft.points.length >= 2) {
          event.preventDefault();
          const nextEntity = createPolylineEntity(state.draft.points, state.document.entities, getNextActiveLayer(state.document, state.ui.activeLayerId), state.draft.closedPreview);
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

    const handleWindowBlur = () => { isSpacePanActiveRef.current = false; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [commitPrecisionDraft, handleRedo, handleUndo, state.document, state.draft, state.interaction.mode, state.selection.selectedIds.length, state.ui.activeLayerId, state.ui.activeTool]);

  // --- Pointer handlers ---
  const handlePointerDown = useCallback((event) => {
    const shouldPan = event.button === 1 || (event.button === 0 && activeTool === 'pan') || (event.button === 0 && isSpacePanActiveRef.current);

    if (shouldPan) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dispatch(startPan({ pointerId: event.pointerId, screenPoint: readCanvasPoint(event), startViewport: state.viewport }));
      return;
    }

    if (event.button !== 0) return;

    const worldPoint = readWorldPoint(readCanvasPoint(event));

    if (activeTool === 'select') {
      const hoveredEntity = findTopmostEntityAtPoint(editableEntities, worldPoint, pixelsToWorldUnits(HIT_TOLERANCE_PX, state.viewport.zoom));

      if (hoveredEntity && state.selection.selectedIds.includes(hoveredEntity.id)) {
        event.currentTarget.setPointerCapture(event.pointerId);
        dispatch(startTransform({
          type: 'move', copyMode: event.ctrlKey ? 'pending' : 'off', copiedEntityIds: [],
          pointerId: event.pointerId, startWorld: worldPoint, startAngle: 0,
          pivot: selectionBounds ? { x: (selectionBounds.minX + selectionBounds.maxX) / 2, y: (selectionBounds.minY + selectionBounds.maxY) / 2 } : null,
          entityIds: state.selection.selectedIds, startEntities: state.document.entities,
        }));
        return;
      }

      if (!hoveredEntity) {
        event.currentTarget.setPointerCapture(event.pointerId);
        dispatch(startSelectionBox(worldPoint));
        return;
      }
    }

    dispatch(setPointerDown(true));
  }, [activeTool, editableEntities, readCanvasPoint, readWorldPoint, selectionBounds, state.document.entities, state.selection.selectedIds, state.viewport]);

  const handlePointerMove = useCallback((event) => {
    const screenPoint = readCanvasPoint(event);

    if (state.interaction.mode === 'panning') {
      const nextViewport = {
        ...state.interaction.panStartViewport,
        panX: state.interaction.panStartViewport.panX + (screenPoint.x - state.interaction.panStartScreen.x),
        panY: state.interaction.panStartViewport.panY + (screenPoint.y - state.interaction.panStartScreen.y),
      };
      dispatch(updatePan({ pointerId: event.pointerId, viewport: nextViewport, screenPoint, worldPoint: readWorldPoint(screenPoint, nextViewport) }));
      return;
    }

    if (state.interaction.mode === 'selection-box' && state.selection.selectionBox.isActive) {
      const currentPoint = readWorldPoint(screenPoint);
      const threshold = pixelsToWorldUnits(4, state.viewport.zoom);
      dispatch(updateSelectionBox({
        currentPoint,
        hasMoved: Math.abs(currentPoint.x - state.selection.selectionBox.start.x) > threshold || Math.abs(currentPoint.y - state.selection.selectionBox.start.y) > threshold,
      }));
      resolvePointerState(screenPoint);
      return;
    }

    if (state.interaction.mode === 'handle-drag' && state.interaction.handleDrag) {
      const rawWorldPoint = readWorldPoint(screenPoint);
      const draggedEntity = state.document.entities.find((e) => e.id === state.interaction.handleDrag.entityId);
      if (!draggedEntity) return;
      const anchorPoint = draggedEntity.type === 'line'
        ? state.interaction.handleDrag.handleId === 'start' ? { x: draggedEntity.x2, y: draggedEntity.y2 } : { x: draggedEntity.x1, y: draggedEntity.y1 }
        : null;
      const nextSnap = resolveSnap(rawWorldPoint, anchorPoint);
      const basePoint = nextSnap.point ?? rawWorldPoint;
      const nextPoint = draggedEntity.type === 'line' && state.ui.orthoEnabled && anchorPoint
        ? (state.ui.viewMode === 'isometric' ? applyIsometricOrthoPoint(anchorPoint, basePoint) : applyOrthoPoint(anchorPoint, basePoint))
        : basePoint;
      dispatch(setDocumentEntities(updateEntityInList(state.document.entities, draggedEntity.id, (entity) => updateEntityFromHandle(entity, state.interaction.handleDrag.handleId, nextPoint))));
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
            dispatch(syncPointer({ screenPoint, worldPoint: rawWorldPoint, hoveredId: state.hover.hoveredId, snap: getEmptySnapState() }));
            return;
          }
          const duplicated = duplicateEntitiesByIds(transformState.startEntities, transformState.entityIds);
          if (duplicated.duplicatedIds.length) {
            moveEntityIds = duplicated.duplicatedIds;
            moveStartEntities = duplicated.entities;
            dispatch(setSelection(moveEntityIds));
            dispatch(patchTransform({ copyMode: 'active', entityIds: moveEntityIds, copiedEntityIds: moveEntityIds, startEntities: moveStartEntities }));
          } else {
            dispatch(patchTransform({ copyMode: 'off' }));
          }
        }
        dispatch(setDocumentEntities(translateEntities(moveStartEntities, moveEntityIds, { x: rawWorldPoint.x - transformState.startWorld.x, y: rawWorldPoint.y - transformState.startWorld.y })));
      }

      if (transformState.type === 'rotate' && transformState.pivot) {
        const currentAngle = Math.atan2(rawWorldPoint.y - transformState.pivot.y, rawWorldPoint.x - transformState.pivot.x);
        dispatch(setDocumentEntities(rotateEntities(transformState.startEntities, transformState.entityIds, transformState.pivot, currentAngle - transformState.startAngle)));
      }

      dispatch(syncPointer({ screenPoint, worldPoint: rawWorldPoint, hoveredId: state.hover.hoveredId, snap: getEmptySnapState() }));
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

    if (state.draft.type === 'offset') { dispatch(patchDraft({ currentPoint: worldPoint })); return; }

    if (state.draft.type === 'dimension') {
      dispatch(patchDraft({
        currentPoint: state.draft.step === 'pickSecond' ? (snap.point ?? worldPoint) : worldPoint,
        subtype: state.draft.step === 'pickSecond' ? inferDimensionSubtype(state.draft.points[0], snap.point ?? worldPoint) : state.draft.subtype,
      }));
      return;
    }

    if (state.draft.type === 'angle') { dispatch(patchDraft({ currentPoint: snap.point ?? worldPoint })); return; }

    if (state.draft.type === 'polyline' && state.draft.points.length >= 2) {
      const nextPoint = getConstrainedDraftPoint('polyline', state.draft, snap.point ?? worldPoint);
      const startPoint = state.draft.points[0];
      const closeTolerance = pixelsToWorldUnits(PROFILE_CLOSE_TOLERANCE_PX, state.viewport.zoom);
      const closedPreview = calculateDistance(startPoint, nextPoint) <= closeTolerance;
      dispatch(patchDraft({ currentPoint: closedPreview ? startPoint : nextPoint, closedPreview }));
      return;
    }

    dispatch(patchDraft({ currentPoint: getConstrainedDraftPoint(state.draft.type, state.draft, snap.point ?? worldPoint) }));
  }, [getConstrainedDraftPoint, getOrthoReferencePoint, readCanvasPoint, readWorldPoint, resolvePointerState, resolveSnap, state.document.entities, state.draft, state.hover.hoveredId, state.interaction, state.selection.selectionBox, state.ui.orthoEnabled, state.viewport, activeTool]);

  const handlePointerUp = useCallback((event) => {
    if (state.interaction.mode === 'panning' && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      dispatch(endPan());
      dispatch(setSuppressNextClick(true));
      return;
    }

    if (state.interaction.mode === 'selection-box') {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      const { selectionBox } = state.selection;
      if (selectionBox.isActive && selectionBox.hasMoved) {
        const nextIds = getEntityIdsInSelectionBox(editableEntities, normalizeSelectionBox(selectionBox.start, selectionBox.current));
        dispatch(setSelection(mergeSelection(state.selection.selectedIds, nextIds, event.shiftKey)));
        dispatch(setSuppressNextClick(true));
      }
      dispatch(endSelectionBox());
      return;
    }

    if (state.interaction.mode === 'handle-drag') { dispatch(endHandleDrag()); return; }
    if (state.interaction.mode === 'anchor-drag') { dispatch(endAnchorDrag()); return; }

    if (state.interaction.mode === 'transform') {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (calculateDistance(state.interaction.transform.startWorld, readWorldPoint(readCanvasPoint(event))) > pixelsToWorldUnits(TRANSFORM_DRAG_THRESHOLD_PX, state.viewport.zoom)) {
        dispatch(setSuppressNextClick(true));
      }
      dispatch(endTransform());
      return;
    }

    dispatch(setPointerDown(false));
  }, [editableEntities, readCanvasPoint, readWorldPoint, state.interaction, state.selection, state.viewport.zoom]);

  const handlePointerCancel = useCallback(() => {
    if (state.interaction.mode === 'panning') { dispatch(endPan()); return; }
    if (state.interaction.mode === 'selection-box') { dispatch(endSelectionBox()); return; }
    if (state.interaction.mode === 'handle-drag') { dispatch(endHandleDrag()); return; }
    if (state.interaction.mode === 'anchor-drag') { dispatch(endAnchorDrag()); return; }
    if (state.interaction.mode === 'transform') { dispatch(endTransform()); return; }
    dispatch(setPointerDown(false));
  }, [state.interaction.mode]);

  const handlePointerLeave = useCallback(() => {
    if (state.interaction.mode === 'idle') dispatch(clearPointerDecorations());
  }, [state.interaction.mode]);

  // --- Canvas click handler ---
  const handleCanvasClick = useCallback((event) => {
    if (state.interaction.suppressNextClick) { dispatch(setSuppressNextClick(false)); return; }
    if (event.button !== 0) return;

    const screenPoint = readCanvasPoint(event);
    const draftAnchor = getOrthoReferencePoint(state.draft.type, state.draft);
    const { worldPoint, snap, hoveredEntity } = resolvePointerState(screenPoint, state.viewport, { anchorPoint: draftAnchor });
    const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);

    if (activeTool === 'select') {
      dispatch(setSelection(mergeSelection(state.selection.selectedIds, hoveredEntity ? [hoveredEntity.id] : [], event.shiftKey)));
      return;
    }

    if (activeTool === 'fillet') {
      const filletTolerance = pixelsToWorldUnits(HIT_TOLERANCE_PX * 2, state.viewport.zoom);
      const filletRadius = parsePositiveNumber(state.draft.precisionInput?.radius) ?? DEFAULT_FILLET_RADIUS;
      const corner = findFilletableCorner(state.document.entities, worldPoint, filletTolerance);
      if (corner) {
        const geometry = computeSketchFillet(corner, filletRadius);
        if (geometry) {
          dispatch(setDocumentEntities(applyFillet(state.document.entities, corner, geometry, targetLayerId)));
          dispatch(patchDraft({ hoveredCorner: null, previewGeometry: null }));
        }
      }
      return;
    }

    if (activeTool === 'offset') {
      if (!state.draft.type) {
        if (!isOffsettableEntity(hoveredEntity)) return;
        dispatch(startDraft({ type: 'offset', step: 'pickDistance', currentPoint: worldPoint, sourceEntityId: hoveredEntity.id, sourceEntityType: hoveredEntity.type, points: [worldPoint] }));
        return;
      }
      const nextEntity = buildOffsetEntityFromDraft(state.draft, state.document, targetLayerId);
      if (nextEntity) { dispatch(commitEntity(nextEntity)); } else { dispatch(cancelDraft()); }
      return;
    }

    if (activeTool === 'text') {
      const nextEntity = createTextEntity(snap.point ?? worldPoint, state.document.entities, targetLayerId);
      if (nextEntity) { dispatch(commitEntity(nextEntity)); dispatch(setSelection([nextEntity.id])); dispatch(setActiveTool('select')); }
      return;
    }

    if (['line', 'rect', 'circle', 'holeCircle', 'cutoutRect'].includes(activeTool)) {
      const draftPoint = state.draft.startPoint ? getConstrainedDraftPoint(activeTool, state.draft, snap.point ?? worldPoint) : (snap.point ?? worldPoint);

      if (!state.draft.type) {
        dispatch(startDraft({ type: activeTool, step: 'pickEnd', startPoint: draftPoint, currentPoint: draftPoint, points: [draftPoint], sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean) }));
        return;
      }

      if (activeTool === 'holeCircle') {
        const nextEntity = createFeatureEntity({
          featureType: 'hole', shape: state.ui.viewMode === 'isometric' ? 'ellipse' : 'circle',
          cx: draftPreview?.cx ?? state.draft.startPoint.x, cy: draftPreview?.cy ?? state.draft.startPoint.y,
          diameter: draftPreview?.diameter, rx: draftPreview?.rx, ry: draftPreview?.ry, rotation: draftPreview?.rotation,
          meta: state.ui.viewMode === 'isometric' ? { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane } : {},
        }, state.document.entities, targetLayerId);
        if (nextEntity) { dispatch(commitEntity(nextEntity)); } else { dispatch(cancelDraft()); }
        return;
      }

      if (activeTool === 'cutoutRect') {
        const nextEntity = createFeatureEntity({
          featureType: 'cutout', shape: state.ui.viewMode === 'isometric' ? 'polygon' : 'rect',
          x: draftPreview?.startPoint ? Math.min(draftPreview.startPoint.x, draftPreview.endPoint.x) : undefined,
          y: draftPreview?.startPoint ? Math.min(draftPreview.startPoint.y, draftPreview.endPoint.y) : undefined,
          width: draftPreview?.width ?? (draftPreview?.startPoint ? Math.abs(draftPreview.endPoint.x - draftPreview.startPoint.x) : undefined),
          height: draftPreview?.height ?? (draftPreview?.startPoint ? Math.abs(draftPreview.endPoint.y - draftPreview.startPoint.y) : undefined),
          points: draftPreview?.points,
          meta: state.ui.viewMode === 'isometric' ? { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane } : {},
        }, state.document.entities, targetLayerId);
        if (nextEntity) { dispatch(commitEntity(nextEntity)); } else { dispatch(cancelDraft()); }
        return;
      }

      const nextEntity = activeTool === 'line'
        ? createLineEntity(state.draft.startPoint, getLineEndpointFromDraft({ ...state.draft, currentPoint: draftPoint }), state.document.entities, targetLayerId)
        : activeTool === 'rect'
          ? (state.ui.viewMode === 'isometric'
            ? (() => { const shape = getIsometricRectangleFromDraft({ ...state.draft, currentPoint: draftPoint }, state.ui.isometricPlane); const base = shape ? createPolylineEntity(shape.points, state.document.entities, targetLayerId, true) : null; return base ? { ...base, meta: { ...(base.meta || {}), projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane } } : null; })()
            : createRectEntity(state.draft.startPoint, getRectEndpointFromDraft({ ...state.draft, currentPoint: draftPoint }), state.document.entities, targetLayerId))
          : (state.ui.viewMode === 'isometric'
            ? createEllipseEntity(state.draft.startPoint, draftPoint, state.document.entities, targetLayerId, { plane: state.ui.isometricPlane, radius: parsePositiveNumber(state.draft.precisionInput.radius) ?? calculateDistance(state.draft.startPoint, draftPoint), meta: { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane } })
            : createCircleEntity(state.draft.startPoint, getCircleRadiusPointFromDraft({ ...state.draft, currentPoint: draftPoint }), state.document.entities, targetLayerId));
      if (nextEntity) { dispatch(commitEntity(nextEntity)); } else { dispatch(cancelDraft()); }
      return;
    }

    if (activeTool === 'polyline') {
      const nextPoint = state.draft.points.length ? getConstrainedDraftPoint('polyline', state.draft, snap.point ?? worldPoint) : (snap.point ?? worldPoint);
      if (!state.draft.type) {
        dispatch(startDraft({ type: 'polyline', step: 'append', startPoint: nextPoint, currentPoint: nextPoint, points: [nextPoint], sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean), closedPreview: false }));
        return;
      }
      const lastPoint = state.draft.points.at(-1);
      if (lastPoint && lastPoint.x === nextPoint.x && lastPoint.y === nextPoint.y) return;
      if (state.draft.points.length >= 3 && calculateDistance(state.draft.points[0], nextPoint) <= pixelsToWorldUnits(PROFILE_CLOSE_TOLERANCE_PX, state.viewport.zoom)) {
        const nextEntity = closePolyline(createPolylineEntity(state.draft.points, state.document.entities, targetLayerId, true));
        if (nextEntity) dispatch(commitEntity(nextEntity));
        return;
      }
      dispatch(patchDraft({ points: appendPolylineVertex(state.draft.points, nextPoint), currentPoint: nextPoint, sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean), closedPreview: false }));
      return;
    }

    if (activeTool === 'arc') {
      const point = snap.point ?? worldPoint;
      if (!state.draft.type) { dispatch(startDraft({ type: 'arc', step: 'pickEnd', currentPoint: point, points: [point], sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean) })); return; }
      if (state.draft.step === 'pickEnd') { dispatch(patchDraft({ step: 'pickControl', points: [state.draft.points[0], point], currentPoint: point, sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean) })); return; }
      const nextEntity = createArcEntity(state.draft.points[0], state.draft.points[1], point, state.document.entities, targetLayerId);
      if (nextEntity) dispatch(commitEntity(nextEntity));
      return;
    }

    if (activeTool === 'dimension') {
      const point = snap.point ?? worldPoint;
      if (!state.draft.type) { dispatch(startDraft({ type: 'dimension', step: 'pickSecond', currentPoint: point, points: [point], subtype: null, sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean) })); return; }
      if (state.draft.step === 'pickSecond') { dispatch(patchDraft({ step: 'place', points: [state.draft.points[0], point], subtype: inferDimensionSubtype(state.draft.points[0], point), currentPoint: worldPoint, sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean) })); return; }
      dispatch(commitEntity(createDimensionEntity({ p1: state.draft.points[0], p2: state.draft.points[1], placementPoint: worldPoint, units: state.document.units, entities: state.document.entities, sourceRefs: state.draft.sourceRefs.filter(Boolean), layerId: state.document.layers.some((l) => l.id === 'dimensions') ? 'dimensions' : targetLayerId, subtype: state.draft.subtype })));
    }

    if (activeTool === 'angle') {
      const point = snap.point ?? worldPoint;
      if (!state.draft.type) { dispatch(startDraft({ type: 'angle', step: 'pickVertex', currentPoint: point, points: [point], sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean) })); return; }
      if (state.draft.step === 'pickVertex') { dispatch(patchDraft({ step: 'pickSecond', points: [state.draft.points[0], point], currentPoint: worldPoint, sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean) })); return; }
      if (state.draft.step === 'pickSecond') {
        const vertex = state.draft.points[1];
        const inputAngle = parsePositiveNumber(state.draft.precisionInput?.angle);
        const isoPlane = state.ui.viewMode === 'isometric' ? state.ui.isometricPlane : null;
        const p2 = inputAngle != null ? constrainAnglePoint(vertex, state.draft.points[0], point, inputAngle, isoPlane) : point;
        const arcRadius = Math.max(calculateDistance(vertex, p2), 20);
        const p2SourceRef = inputAngle != null ? null : buildSourceRefFromSnap(snap);
        dispatch(commitEntity(createAngleDimensionEntity({ vertex, p1: state.draft.points[0], p2, arcRadius, entities: state.document.entities, sourceRefs: [...state.draft.sourceRefs, p2SourceRef].filter(Boolean), layerId: state.document.layers.some((l) => l.id === 'dimensions') ? 'dimensions' : targetLayerId, isometricPlane: isoPlane })));
      }
    }
  }, [activeTool, commitPrecisionDraft, draftPreview, getConstrainedDraftPoint, getOrthoReferencePoint, readCanvasPoint, resolvePointerState, state.document, state.draft, state.interaction.suppressNextClick, state.selection.selectedIds, state.ui.activeLayerId, state.ui.isometricPlane, state.ui.viewMode, state.viewport]);

  // --- Return composed API ---
  return {
    document: state.document,
    viewport: state.viewport,
    ui: state.ui,
    interaction: state.interaction,
    selection: state.selection,
    hover: state.hover,
    draft: state.draft,
    draftPreview,
    precisionHud,
    snap: state.snap,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    activeTool,
    activeLayer: layers.activeLayer,
    tools: TOOL_DEFINITIONS,
    visibleEntities,
    selectedEntity: selection.selectedEntity,
    selectedMeasurements: selection.selectedMeasurements,
    selectedHandles: selection.selectedHandles,
    selectionBounds: selection.selectionBounds,
    groupSelectionSummary: selection.groupSelectionSummary,
    selectedProfileInfo: selection.selectedProfileInfo,
    isBrokenLineSelection: selection.isBrokenLineSelection,
    setActiveTool: handleToolChange,
    toggleOrtho,
    toggleSnap,
    setViewMode,
    setIsometricPlane,
    updateSelectedEntityField,
    rotateSelectionLeft: () => handleRotateSelection(-90),
    rotateSelectionRight: () => handleRotateSelection(90),
    flipSelectionHorizontal: () => handleFlipSelection('horizontal'),
    flipSelectionVertical: () => handleFlipSelection('vertical'),
    toggleBrokenLines: handleToggleBrokenLines,
    newSketch: persistence.handleNewSketch,
    openSketch: persistence.handleOpenSketch,
    importSketchFile: persistence.handleImportSketchFile,
    saveSketch: persistence.handleSaveSketch,
    saveSketchAs: () => persistence.handleSaveSketch({ saveAs: true }),
    undo: history.handleUndo,
    redo: history.handleRedo,
    commitDocumentName: layers.handleDocumentNameCommit,
    precisionBindings: {
      onInputChange: (field, value) => dispatch(setPrecisionInput({ [field]: value, activeField: field })),
      onSubmit: () => commitPrecisionDraft(),
    },
    handleBindings: {
      onHandlePointerDown: handleHandlePointerDown,
      onTransformPointerDown: handleTransformPointerDown,
    },
    canvasBindings: {
      ref: canvasRef,
      onClick: handleCanvasClick,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onPointerLeave: handlePointerLeave,
    },
    status: {
      cursorWorld: { x: roundWorldValue(state.interaction.cursorWorld.x), y: roundWorldValue(state.interaction.cursorWorld.y) },
      snapPoint: state.snap.point ? { x: roundWorldValue(state.snap.point.x), y: roundWorldValue(state.snap.point.y) } : null,
      selectedProfileCount: selection.selectedProfileInfo?.count ?? 0,
      documentStatus: persistence.documentPersistence.isDirty ? 'dirty' : persistence.documentPersistence.status,
      viewMode: state.ui.viewMode,
      isometricPlane: state.ui.isometricPlane,
    },
    documentPersistence: persistence.documentPersistence,
    setEntityMaterial: (entityIds, materialId) => dispatch(setEntityMaterial(entityIds, materialId)),
    setEntityThickness: (entityIds, thickness) => dispatch(setEntityThickness(entityIds, thickness)),
    toggleCraftsmanMode: () => dispatch(toggleCraftsmanMode()),
    setVariables: (vars) => dispatch(setVariables(vars)),
    loadTemplate: (workspace) => persistence.applyWorkspace(workspace, { status: 'idle' }),
  };
}
