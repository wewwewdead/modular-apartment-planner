import { useCallback, useMemo, useReducer, useRef } from 'react';
import sketchStudioInitialState from '../store/sketchStudioInitialState';
import sketchStudioReducer from '../store/sketchStudioReducer';
import {
  commitEntity,
  setActiveTool,
  setDocumentEntities,
  setPrecisionInput,
  setUiFlag,
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
} from '../store/sketchStudioActions';
import { roundWorldValue } from '../utils/canvasMath';
import { updateEntityFromNumericField, updateEntityInList } from '../utils/entityUtils';
import { getPrecisionHudData } from '../utils/draftPrecisionUtils';
import { getEditableEntities, getNextActiveLayer, getVisibleEntities } from '../utils/layerUtils';
import { getDraftPreviewEntity, TOOL_DEFINITIONS } from './sketchConstants';
import useSketchSelection from './useSketchSelection';
import useSketchViewport from './useSketchViewport';
import useSketchLayers from './useSketchLayers';
import useSketchHistory from './useSketchHistory';
import useSketchPersistence from './useSketchPersistence';
import useSketchDraftCommit from './useSketchDraftCommit';
import useSketchTransform from './useSketchTransform';
import useSketchKeyboard from './useSketchKeyboard';
import useSketchPointer from './useSketchPointer';
import useSketchToolClick from './useSketchToolClick';

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

  const { selectedEntity, selectionBounds } = selection;
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
  const {
    handleTransformPointerDown,
    handleRotateSelection,
    handleFlipSelection,
    handleToggleBrokenLines,
    handleHandlePointerDown,
  } = useSketchTransform(state, dispatch, viewport, selection);

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
  const { handleCanvasClick } = useSketchToolClick(state, dispatch, viewport, {
    activeTool,
    editableEntities,
    draftPreview,
    commitPrecisionDraft,
    getConstrainedDraftPoint: viewport.getConstrainedDraftPoint,
  });

  const focusJoint = useCallback(
    (jointId) => {
      dispatch(setUiFlag('focusedJointId', jointId || null));
      dispatch(setUiFlag('editingJointId', jointId || null));
    },
    [dispatch],
  );
  const clearFocusedJoint = useCallback(() => dispatch(setUiFlag('focusedJointId', null)), [dispatch]);
  const editJoint = useCallback((jointId) => dispatch(setUiFlag('editingJointId', jointId || null)), [dispatch]);
  const clearEditingJoint = useCallback(() => dispatch(setUiFlag('editingJointId', null)), [dispatch]);

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
    canvasRef,
    onCanvasClick: handleCanvasClick,
    onCanvasPointerDown: handlePointerDown,
    onCanvasPointerMove: handlePointerMove,
    onCanvasPointerUp: handlePointerUp,
    onCanvasPointerCancel: handlePointerCancel,
    onCanvasPointerLeave: handlePointerLeave,
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
    focusJoint,
    clearFocusedJoint,
    editJoint,
    clearEditingJoint,
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
