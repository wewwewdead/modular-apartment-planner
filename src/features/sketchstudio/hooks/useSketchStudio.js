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
  addConstraint,
  updateConstraint,
  removeConstraint,
  addJoint,
  updateJoint,
  removeJoint,
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
import useSketchDraftCommit from './useSketchDraftCommit';
import useSketchTransform from './useSketchTransform';
import useSketchKeyboard from './useSketchKeyboard';
import useSketchPointer from './useSketchPointer';

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
  const {
    readCanvasPoint,
    readWorldPoint,
    getOrthoReferencePoint,
    getConstrainedDraftPoint,
    resolveSnap,
    resolvePointerState,
  } = viewport;
  const { handleUndo, handleRedo } = history;

  // --- Draft preview ---
  const draftPreview = useMemo(
    () =>
      getDraftPreviewEntity(
        state.draft,
        state.document,
        getNextActiveLayer(state.document, state.ui.activeLayerId),
        state.ui,
      ),
    [state.document, state.draft, state.ui],
  );
  const precisionHud = useMemo(() => getPrecisionHudData(state.draft, draftPreview), [state.draft, draftPreview]);

  // --- Simple action callbacks ---
  const handleToolChange = useCallback((toolId) => dispatch(setActiveTool(toolId)), []);
  const toggleOrtho = useCallback(
    () => dispatch(setUiFlag('orthoEnabled', !state.ui.orthoEnabled)),
    [state.ui.orthoEnabled],
  );
  const toggleSnap = useCallback(
    () => dispatch(setUiFlag('snapEnabled', !state.ui.snapEnabled)),
    [state.ui.snapEnabled],
  );
  const setViewMode = useCallback(
    (viewMode) => dispatch(setUiFlag('viewMode', viewMode === 'isometric' ? 'isometric' : 'plan')),
    [],
  );
  const setIsometricPlane = useCallback((plane) => {
    if (!['top', 'left', 'right'].includes(plane)) return;
    dispatch(setUiFlag('isometricPlane', plane));
  }, []);

  const updateSelectedEntityField = useCallback(
    (field, rawValue) => {
      if (!selectedEntity) return;
      dispatch(
        setDocumentEntities(
          updateEntityInList(state.document.entities, selectedEntity.id, (entity) =>
            updateEntityFromNumericField(entity, field, rawValue),
          ),
        ),
      );
    },
    [selectedEntity, state.document.entities],
  );

  // --- Commit precision draft ---
  const { commitPrecisionDraft } = useSketchDraftCommit(state, dispatch, draftPreview);

  // --- Transform handlers ---
  const { handleTransformPointerDown, handleRotateSelection, handleFlipSelection, handleToggleBrokenLines, handleHandlePointerDown } =
    useSketchTransform(state, dispatch, viewport, selection);

  // --- Keyboard effect ---
  useSketchKeyboard(state, dispatch, {
    commitPrecisionDraft,
    undo: handleUndo,
    redo: handleRedo,
    isSpacePanActiveRef,
  });

  // --- Pointer handlers ---
  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handlePointerLeave } =
    useSketchPointer(state, dispatch, viewport, {
      activeTool,
      editableEntities,
      isSpacePanActiveRef,
      selectionBounds,
      getConstrainedDraftPoint: viewport.getConstrainedDraftPoint,
    });

  // --- Canvas click handler ---
  const handleCanvasClick = useCallback(
    (event) => {
      if (state.interaction.suppressNextClick) {
        dispatch(setSuppressNextClick(false));
        return;
      }
      if (event.button !== 0) return;

      const screenPoint = readCanvasPoint(event);
      const draftAnchor = getOrthoReferencePoint(state.draft.type, state.draft);
      const { worldPoint, snap, hoveredEntity } = resolvePointerState(screenPoint, state.viewport, {
        anchorPoint: draftAnchor,
      });
      const targetLayerId = getNextActiveLayer(state.document, state.ui.activeLayerId);

      if (activeTool === 'select') {
        dispatch(
          setSelection(
            mergeSelection(state.selection.selectedIds, hoveredEntity ? [hoveredEntity.id] : [], event.shiftKey),
          ),
        );
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
          dispatch(
            startDraft({
              type: 'offset',
              step: 'pickDistance',
              currentPoint: worldPoint,
              sourceEntityId: hoveredEntity.id,
              sourceEntityType: hoveredEntity.type,
              points: [worldPoint],
            }),
          );
          return;
        }
        const nextEntity = buildOffsetEntityFromDraft(state.draft, state.document, targetLayerId);
        if (nextEntity) {
          dispatch(commitEntity(nextEntity));
        } else {
          dispatch(cancelDraft());
        }
        return;
      }

      if (activeTool === 'text') {
        const point = snap.point ?? worldPoint;

        if (!state.draft.type) {
          dispatch(
            startDraft({
              type: 'text',
              step: 'placeLabel',
              currentPoint: point,
              points: [point],
              sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
            }),
          );
          return;
        }

        const nextEntity = createTextEntity(worldPoint, state.document.entities, targetLayerId, {
          leader: {
            target: state.draft.points[0],
          },
        });
        if (nextEntity) {
          dispatch(commitEntity(nextEntity));
          dispatch(setSelection([nextEntity.id]));
          dispatch(setActiveTool('select'));
        }
        return;
      }

      if (['line', 'rect', 'circle', 'holeCircle', 'cutoutRect'].includes(activeTool)) {
        const draftPoint = state.draft.startPoint
          ? getConstrainedDraftPoint(activeTool, state.draft, snap.point ?? worldPoint)
          : (snap.point ?? worldPoint);

        if (!state.draft.type) {
          dispatch(
            startDraft({
              type: activeTool,
              step: 'pickEnd',
              startPoint: draftPoint,
              currentPoint: draftPoint,
              points: [draftPoint],
              sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
            }),
          );
          return;
        }

        if (activeTool === 'holeCircle') {
          const nextEntity = createFeatureEntity(
            {
              featureType: 'hole',
              shape: state.ui.viewMode === 'isometric' ? 'ellipse' : 'circle',
              cx: draftPreview?.cx ?? state.draft.startPoint.x,
              cy: draftPreview?.cy ?? state.draft.startPoint.y,
              diameter: draftPreview?.diameter,
              rx: draftPreview?.rx,
              ry: draftPreview?.ry,
              rotation: draftPreview?.rotation,
              meta:
                state.ui.viewMode === 'isometric'
                  ? { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane }
                  : {},
            },
            state.document.entities,
            targetLayerId,
          );
          if (nextEntity) {
            dispatch(commitEntity(nextEntity));
          } else {
            dispatch(cancelDraft());
          }
          return;
        }

        if (activeTool === 'cutoutRect') {
          const nextEntity = createFeatureEntity(
            {
              featureType: 'cutout',
              shape: state.ui.viewMode === 'isometric' ? 'polygon' : 'rect',
              x: draftPreview?.startPoint ? Math.min(draftPreview.startPoint.x, draftPreview.endPoint.x) : undefined,
              y: draftPreview?.startPoint ? Math.min(draftPreview.startPoint.y, draftPreview.endPoint.y) : undefined,
              width:
                draftPreview?.width ??
                (draftPreview?.startPoint ? Math.abs(draftPreview.endPoint.x - draftPreview.startPoint.x) : undefined),
              height:
                draftPreview?.height ??
                (draftPreview?.startPoint ? Math.abs(draftPreview.endPoint.y - draftPreview.startPoint.y) : undefined),
              points: draftPreview?.points,
              meta:
                state.ui.viewMode === 'isometric'
                  ? { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane }
                  : {},
            },
            state.document.entities,
            targetLayerId,
          );
          if (nextEntity) {
            dispatch(commitEntity(nextEntity));
          } else {
            dispatch(cancelDraft());
          }
          return;
        }

        const nextEntity =
          activeTool === 'line'
            ? createLineEntity(
                state.draft.startPoint,
                getLineEndpointFromDraft({ ...state.draft, currentPoint: draftPoint }),
                state.document.entities,
                targetLayerId,
              )
            : activeTool === 'rect'
              ? state.ui.viewMode === 'isometric'
                ? (() => {
                    const shape = getIsometricRectangleFromDraft(
                      { ...state.draft, currentPoint: draftPoint },
                      state.ui.isometricPlane,
                    );
                    const base = shape
                      ? createPolylineEntity(shape.points, state.document.entities, targetLayerId, true)
                      : null;
                    return base
                      ? {
                          ...base,
                          meta: {
                            ...(base.meta || {}),
                            projectionMode: 'isometric',
                            isometricPlane: state.ui.isometricPlane,
                          },
                        }
                      : null;
                  })()
                : createRectEntity(
                    state.draft.startPoint,
                    getRectEndpointFromDraft({ ...state.draft, currentPoint: draftPoint }),
                    state.document.entities,
                    targetLayerId,
                  )
              : state.ui.viewMode === 'isometric'
                ? createEllipseEntity(state.draft.startPoint, draftPoint, state.document.entities, targetLayerId, {
                    plane: state.ui.isometricPlane,
                    radius:
                      parsePositiveNumber(state.draft.precisionInput.radius) ??
                      calculateDistance(state.draft.startPoint, draftPoint),
                    meta: { projectionMode: 'isometric', isometricPlane: state.ui.isometricPlane },
                  })
                : createCircleEntity(
                    state.draft.startPoint,
                    getCircleRadiusPointFromDraft({ ...state.draft, currentPoint: draftPoint }),
                    state.document.entities,
                    targetLayerId,
                  );
        if (nextEntity) {
          dispatch(commitEntity(nextEntity));
        } else {
          dispatch(cancelDraft());
        }
        return;
      }

      if (activeTool === 'polyline') {
        const nextPoint = state.draft.points.length
          ? getConstrainedDraftPoint('polyline', state.draft, snap.point ?? worldPoint)
          : (snap.point ?? worldPoint);
        if (!state.draft.type) {
          dispatch(
            startDraft({
              type: 'polyline',
              step: 'append',
              startPoint: nextPoint,
              currentPoint: nextPoint,
              points: [nextPoint],
              sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
              closedPreview: false,
            }),
          );
          return;
        }
        const lastPoint = state.draft.points.at(-1);
        if (lastPoint && lastPoint.x === nextPoint.x && lastPoint.y === nextPoint.y) return;
        if (
          state.draft.points.length >= 3 &&
          calculateDistance(state.draft.points[0], nextPoint) <=
            pixelsToWorldUnits(PROFILE_CLOSE_TOLERANCE_PX, state.viewport.zoom)
        ) {
          const nextEntity = closePolyline(
            createPolylineEntity(state.draft.points, state.document.entities, targetLayerId, true),
          );
          if (nextEntity) dispatch(commitEntity(nextEntity));
          return;
        }
        dispatch(
          patchDraft({
            points: appendPolylineVertex(state.draft.points, nextPoint),
            currentPoint: nextPoint,
            sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean),
            closedPreview: false,
          }),
        );
        return;
      }

      if (activeTool === 'arc') {
        const point = snap.point ?? worldPoint;
        if (!state.draft.type) {
          dispatch(
            startDraft({
              type: 'arc',
              step: 'pickEnd',
              currentPoint: point,
              points: [point],
              sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
            }),
          );
          return;
        }
        if (state.draft.step === 'pickEnd') {
          dispatch(
            patchDraft({
              step: 'pickControl',
              points: [state.draft.points[0], point],
              currentPoint: point,
              sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean),
            }),
          );
          return;
        }
        const nextEntity = createArcEntity(
          state.draft.points[0],
          state.draft.points[1],
          point,
          state.document.entities,
          targetLayerId,
        );
        if (nextEntity) dispatch(commitEntity(nextEntity));
        return;
      }

      if (activeTool === 'dimension') {
        const point = snap.point ?? worldPoint;
        if (!state.draft.type) {
          dispatch(
            startDraft({
              type: 'dimension',
              step: 'pickSecond',
              currentPoint: point,
              points: [point],
              subtype: null,
              sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
            }),
          );
          return;
        }
        if (state.draft.step === 'pickSecond') {
          dispatch(
            patchDraft({
              step: 'place',
              points: [state.draft.points[0], point],
              subtype: inferDimensionSubtype(state.draft.points[0], point),
              currentPoint: worldPoint,
              sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean),
            }),
          );
          return;
        }
        dispatch(
          commitEntity(
            createDimensionEntity({
              p1: state.draft.points[0],
              p2: state.draft.points[1],
              placementPoint: worldPoint,
              units: state.document.units,
              entities: state.document.entities,
              sourceRefs: state.draft.sourceRefs.filter(Boolean),
              layerId: state.document.layers.some((l) => l.id === 'dimensions') ? 'dimensions' : targetLayerId,
              subtype: state.draft.subtype,
            }),
          ),
        );
      }

      if (activeTool === 'angle') {
        const point = snap.point ?? worldPoint;
        const tolerance = pixelsToWorldUnits(HIT_TOLERANCE_PX, state.viewport.zoom);
        const hitEntity = findTopmostEntityAtPoint(editableEntities, worldPoint, tolerance);
        const isLineHit = hitEntity && (hitEntity.type === 'line' || hitEntity.type === 'polyline');

        // Line-to-line shortcut: click two lines → auto-compute intersection + angle
        if (!state.draft.type && isLineHit) {
          dispatch(
            startDraft({
              type: 'angle',
              step: 'pickLine2',
              currentPoint: point,
              points: [point],
              sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
              lineEntity1: hitEntity,
            }),
          );
          return;
        }
        if (state.draft.step === 'pickLine2' && isLineHit && hitEntity.id !== state.draft.lineEntity1?.id) {
          const line1 = state.draft.lineEntity1;
          const a1 = { x: line1.x1, y: line1.y1 };
          const a2 = { x: line1.x2, y: line1.y2 };
          const b1 = { x: hitEntity.x1, y: hitEntity.y1 };
          const b2 = { x: hitEntity.x2, y: hitEntity.y2 };
          // Compute ray intersection (extend lines infinitely)
          const dax = a2.x - a1.x;
          const day = a2.y - a1.y;
          const dbx = b2.x - b1.x;
          const dby = b2.y - b1.y;
          const denom = dax * dby - day * dbx;
          if (Math.abs(denom) > 1e-6) {
            const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
            const vertex = { x: a1.x + t * dax, y: a1.y + t * day };
            // Pick points on each line away from vertex for the arc
            const distA = Math.max(calculateDistance(vertex, a1), calculateDistance(vertex, a2));
            const distB = Math.max(calculateDistance(vertex, b1), calculateDistance(vertex, b2));
            const arcRadius = Math.min(distA, distB, 60) * 0.5;
            const p1 = calculateDistance(vertex, a2) > calculateDistance(vertex, a1) ? a2 : a1;
            const p2 = calculateDistance(vertex, b2) > calculateDistance(vertex, b1) ? b2 : b1;
            const isoPlane = state.ui.viewMode === 'isometric' ? state.ui.isometricPlane : null;
            dispatch(
              commitEntity(
                createAngleDimensionEntity({
                  vertex,
                  p1,
                  p2,
                  arcRadius: Math.max(arcRadius, 20),
                  entities: state.document.entities,
                  sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
                  layerId: state.document.layers.some((l) => l.id === 'dimensions') ? 'dimensions' : targetLayerId,
                  isometricPlane: isoPlane,
                }),
              ),
            );
            return;
          }
          // Lines are parallel — fall through to manual mode
        }

        // Manual 3-click mode (fallback: click empty space or non-line entities)
        if (!state.draft.type) {
          dispatch(
            startDraft({
              type: 'angle',
              step: 'pickVertex',
              currentPoint: point,
              points: [point],
              sourceRefs: [buildSourceRefFromSnap(snap)].filter(Boolean),
            }),
          );
          return;
        }
        if (state.draft.step === 'pickVertex') {
          dispatch(
            patchDraft({
              step: 'pickSecond',
              points: [state.draft.points[0], point],
              currentPoint: worldPoint,
              sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean),
            }),
          );
          return;
        }
        if (state.draft.step === 'pickLine2') {
          dispatch(
            patchDraft({
              step: 'pickSecond',
              points: [state.draft.points[0], point],
              currentPoint: worldPoint,
              sourceRefs: [...state.draft.sourceRefs, buildSourceRefFromSnap(snap)].filter(Boolean),
              lineEntity1: undefined,
            }),
          );
          return;
        }
        if (state.draft.step === 'pickSecond') {
          const vertex = state.draft.points[1];
          const inputAngle = parsePositiveNumber(state.draft.precisionInput?.angle);
          const isoPlane = state.ui.viewMode === 'isometric' ? state.ui.isometricPlane : null;
          const p2 =
            inputAngle != null
              ? constrainAnglePoint(vertex, state.draft.points[0], point, inputAngle, isoPlane)
              : point;
          const arcRadius = Math.max(calculateDistance(vertex, p2), 20);
          const p2SourceRef = inputAngle != null ? null : buildSourceRefFromSnap(snap);
          dispatch(
            commitEntity(
              createAngleDimensionEntity({
                vertex,
                p1: state.draft.points[0],
                p2,
                arcRadius,
                entities: state.document.entities,
                sourceRefs: [...state.draft.sourceRefs, p2SourceRef].filter(Boolean),
                layerId: state.document.layers.some((l) => l.id === 'dimensions') ? 'dimensions' : targetLayerId,
                isometricPlane: isoPlane,
              }),
            ),
          );
        }
      }
    },
    [
      activeTool,
      commitPrecisionDraft,
      draftPreview,
      editableEntities,
      getConstrainedDraftPoint,
      getOrthoReferencePoint,
      readCanvasPoint,
      resolvePointerState,
      state.document,
      state.draft,
      state.interaction.suppressNextClick,
      state.selection.selectedIds,
      state.ui.activeLayerId,
      state.ui.isometricPlane,
      state.ui.viewMode,
      state.viewport,
    ],
  );

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
    selectedEntities: selection.selectedEntities,
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
      cursorWorld: {
        x: roundWorldValue(state.interaction.cursorWorld.x),
        y: roundWorldValue(state.interaction.cursorWorld.y),
      },
      snapPoint: state.snap.point
        ? { x: roundWorldValue(state.snap.point.x), y: roundWorldValue(state.snap.point.y) }
        : null,
      selectedProfileCount: selection.selectedProfileInfo?.count ?? 0,
      documentStatus: persistence.documentPersistence.isDirty ? 'dirty' : persistence.documentPersistence.status,
      viewMode: state.ui.viewMode,
      isometricPlane: state.ui.isometricPlane,
    },
    documentPersistence: persistence.documentPersistence,
    constraintDiagnostics: state.constraintDiagnostics || [],
    jointDiagnostics: state.jointDiagnostics || [],
    manufacturingPreviewEntities: state.manufacturingPreviewEntities || [],
    manufacturingExportEntities: state.manufacturingExportEntities || [],
    setEntityMaterial: (entityIds, materialId) => dispatch(setEntityMaterial(entityIds, materialId)),
    setEntityThickness: (entityIds, thickness) => dispatch(setEntityThickness(entityIds, thickness)),
    toggleCraftsmanMode: () => dispatch(toggleCraftsmanMode()),
    setVariables: (vars) => dispatch(setVariables(vars)),
    addConstraint: (constraint) => dispatch(addConstraint(constraint)),
    updateConstraint: (constraintId, patch) => dispatch(updateConstraint(constraintId, patch)),
    removeConstraint: (constraintId) => dispatch(removeConstraint(constraintId)),
    addJoint: (joint) => dispatch(addJoint(joint)),
    updateJoint: (jointId, patch) => dispatch(updateJoint(jointId, patch)),
    removeJoint: (jointId) => dispatch(removeJoint(jointId)),
    loadTemplate: (workspace) => persistence.applyWorkspace(workspace, { status: 'idle' }),
    duplicateEntities: (entityIds) => {
      const idSet = new Set(entityIds);
      const toDuplicate = state.document.entities.filter((e) => idSet.has(e.id));
      for (const entity of toDuplicate) {
        const clone = {
          ...entity,
          id: `${entity.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        };
        dispatch(commitEntity(clone));
      }
    },
  };
}
