import { useCallback, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import sketchStudioInitialState from '../store/sketchStudioInitialState';
import sketchStudioReducer from '../store/sketchStudioReducer';
import {
  setActiveTool,
  setDocumentEntities,
  setSelection,
  setPrecisionInput,
  setUiFlag,
  setEntityMaterial,
  setEntityThickness,
  setEntityGrainAngle,
  setEntityHardware,
  setActiveHardware,
  toggleCraftsmanMode,
  toggleShortcutOverlay as toggleShortcutOverlayAction,
  closeShortcutOverlay as closeShortcutOverlayAction,
  setVariables,
  addJoint,
  updateJoint,
  removeJoint,
  groupSelection as groupSelectionAction,
  degroupSelection as degroupSelectionAction,
  dismissToast as dismissToastAction,
} from '../store/sketchStudioActions';
import { roundWorldValue } from '../utils/canvasMath';
import { duplicateEntitiesByIds, updateEntityFromNumericField, updateEntityInList } from '../utils/entityUtils';
import { getPrecisionHudData } from '../utils/draftPrecisionUtils';
import { buildGroupIndex } from '../utils/groupUtils';
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
import { createCursorChannel } from './cursorChannel';

// Re-export for consumers that import TOOL_DEFINITIONS from this file
export { TOOL_DEFINITIONS } from './sketchConstants';

function initializeSketchStudioState(initialState) {
  if (initialState.document?.groupIndex instanceof Map) {
    return initialState;
  }

  return {
    ...initialState,
    document: {
      ...initialState.document,
      groupIndex: buildGroupIndex(initialState.document?.entities || []),
    },
  };
}

export default function useSketchStudio() {
  const [state, dispatch] = useReducer(sketchStudioReducer, sketchStudioInitialState, initializeSketchStudioState);
  const canvasRef = useRef(null);
  const isSpacePanActiveRef = useRef(false);
  // The cursor position travels outside the reducer: see cursorChannel.js.
  const [cursorChannel] = useState(createCursorChannel);

  const activeTool = state.ui.activeTool;
  const groupIndex = state.document.groupIndex;
  const visibleEntities = useMemo(() => getVisibleEntities(state.document), [state.document]);
  const editableEntities = useMemo(() => getEditableEntities(state.document), [state.document]);

  // --- Sub-hooks ---
  const selection = useSketchSelection(state, groupIndex);
  const viewport = useSketchViewport(state, dispatch, canvasRef, { visibleEntities, editableEntities, cursorChannel });
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
  const precisionHud = useMemo(
    () => getPrecisionHudData(state.draft, draftPreview, state.ui),
    [state.draft, draftPreview, state.ui],
  );

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
  const handleGroupSelection = useCallback(() => {
    if (selection.selectedIds.length < 2) {
      return false;
    }

    dispatch(groupSelectionAction());
    return true;
  }, [dispatch, selection.selectedIds.length]);
  const handleDegroupSelection = useCallback(() => {
    if (!selection.hasGroupedSelection) {
      return false;
    }

    dispatch(degroupSelectionAction());
    return true;
  }, [dispatch, selection.hasGroupedSelection]);
  const setViewMode = useCallback(
    (viewMode) => dispatch(setUiFlag('viewMode', viewMode === 'isometric' ? 'isometric' : 'plan')),
    [],
  );
  const toggleShortcutOverlay = useCallback(() => dispatch(toggleShortcutOverlayAction()), []);
  // Stable identity: Toast restarts its dismiss timer whenever this changes.
  const dismissToast = useCallback(() => dispatch(dismissToastAction()), []);
  const closeShortcutOverlay = useCallback(() => dispatch(closeShortcutOverlayAction()), []);
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
    groupSelection: handleGroupSelection,
    degroupSelection: handleDegroupSelection,
  });

  // --- Pointer handlers ---
  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handlePointerLeave } =
    useSketchPointer(state, dispatch, viewport, {
      activeTool,
      editableEntities,
      isSpacePanActiveRef,
      selectionBounds,
      getConstrainedDraftPoint: viewport.getConstrainedDraftPoint,
      cursorChannel,
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

  // Stable identities for everything handed to the memoised panels (RightPanel,
  // CraftsmanSidebar, TopBar): a fresh arrow per render re-rendered them on
  // every pointer move.
  // meta: { skipHistory, revertSession } from a CAD field's typing session.
  const setCadModel = useCallback((model, meta) => dispatch({ type: 'SET_CAD_MODEL', payload: model, meta }), []);
  const setWorkspaceMode = useCallback((mode) => dispatch(setUiFlag('workspaceMode', mode)), []);
  const rotateSelectionLeft = useCallback(() => handleRotateSelection(-90), [handleRotateSelection]);
  const rotateSelectionRight = useCallback(() => handleRotateSelection(90), [handleRotateSelection]);
  const flipSelectionHorizontal = useCallback(() => handleFlipSelection('horizontal'), [handleFlipSelection]);
  const flipSelectionVertical = useCallback(() => handleFlipSelection('vertical'), [handleFlipSelection]);
  const { handleSaveSketch, applyWorkspace } = persistence;
  const saveSketchAs = useCallback(() => handleSaveSketch({ saveAs: true }), [handleSaveSketch]);
  const precisionBindings = useMemo(
    () => ({
      onInputChange: (field, value) => dispatch(setPrecisionInput({ [field]: value, activeField: field })),
      onSubmit: () => commitPrecisionDraft(),
      onToggleChange: (key, value) => dispatch(setUiFlag(key, value)),
    }),
    [commitPrecisionDraft],
  );
  const handleBindings = useMemo(
    () => ({
      onHandlePointerDown: handleHandlePointerDown,
      onTransformPointerDown: handleTransformPointerDown,
    }),
    [handleHandlePointerDown, handleTransformPointerDown],
  );
  const setEntityMaterialCallback = useCallback(
    (entityIds, materialId) => dispatch(setEntityMaterial(entityIds, materialId)),
    [],
  );
  const setEntityThicknessCallback = useCallback(
    (entityIds, thickness) => dispatch(setEntityThickness(entityIds, thickness)),
    [],
  );
  const setEntityGrainAngleCallback = useCallback(
    (entityIds, grainAngle) => dispatch(setEntityGrainAngle(entityIds, grainAngle)),
    [],
  );
  const setEntityHardwareCallback = useCallback(
    (entityIds, hardwareId) => dispatch(setEntityHardware(entityIds, hardwareId)),
    [],
  );
  const setActiveHardwareCallback = useCallback((hardwareId) => dispatch(setActiveHardware(hardwareId)), []);
  const toggleCraftsmanModeCallback = useCallback(() => dispatch(toggleCraftsmanMode()), []);
  const setVariablesCallback = useCallback((vars) => dispatch(setVariables(vars)), []);
  const addJointCallback = useCallback((joint) => dispatch(addJoint(joint)), []);
  const updateJointCallback = useCallback((jointId, patch) => dispatch(updateJoint(jointId, patch)), []);
  const removeJointCallback = useCallback((jointId) => dispatch(removeJoint(jointId)), []);
  const loadTemplate = useCallback((workspace) => applyWorkspace(workspace, { status: 'idle' }), [applyWorkspace]);
  // Stable across document changes (the cutting list's Duplicate button holds
  // it): it reads the entities of the last committed render, as its closure did.
  const committedEntitiesRef = useRef(state.document.entities);
  useLayoutEffect(() => {
    committedEntitiesRef.current = state.document.entities;
  }, [state.document.entities]);
  const duplicateEntities = useCallback((entityIds) => {
    const result = duplicateEntitiesByIds(committedEntitiesRef.current, entityIds);
    if (!result.duplicatedIds.length) return [];
    dispatch(setDocumentEntities(result.entities));
    dispatch(setSelection(result.duplicatedIds));
    return result.duplicatedIds;
  }, []);

  // The cursor's X / Y is not in here: the status bar reads it from the
  // cursor channel.
  const snapPoint = state.snap.point;
  const status = useMemo(
    () => ({
      snapPoint: snapPoint ? { x: roundWorldValue(snapPoint.x), y: roundWorldValue(snapPoint.y) } : null,
      selectedProfileCount: selection.selectedProfileInfo?.count ?? 0,
      documentStatus: persistence.documentPersistence.isDirty ? 'dirty' : persistence.documentPersistence.status,
      viewMode: state.ui.viewMode,
      isometricPlane: state.ui.isometricPlane,
    }),
    [
      snapPoint,
      selection.selectedProfileInfo,
      persistence.documentPersistence.isDirty,
      persistence.documentPersistence.status,
      state.ui.viewMode,
      state.ui.isometricPlane,
    ],
  );

  // --- Return composed API ---
  return {
    document: state.document,
    setCadModel,
    setWorkspaceMode,
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
    hasGroupedSelection: selection.hasGroupedSelection,
    setActiveTool: handleToolChange,
    toggleOrtho,
    toggleSnap,
    groupSelection: handleGroupSelection,
    degroupSelection: handleDegroupSelection,
    setViewMode,
    setIsometricPlane,
    toggleShortcutOverlay,
    closeShortcutOverlay,
    updateSelectedEntityField,
    rotateSelectionLeft,
    rotateSelectionRight,
    flipSelectionHorizontal,
    flipSelectionVertical,
    toggleBrokenLines: handleToggleBrokenLines,
    newSketch: persistence.handleNewSketch,
    openSketch: persistence.handleOpenSketch,
    importSketchFile: persistence.handleImportSketchFile,
    saveSketch: persistence.handleSaveSketch,
    saveSketchAs,
    undo: history.handleUndo,
    redo: history.handleRedo,
    commitDocumentName: layers.handleDocumentNameCommit,
    precisionBindings,
    dismissToast,
    handleBindings,
    canvasRef,
    cursorChannel,
    onCanvasClick: handleCanvasClick,
    onCanvasPointerDown: handlePointerDown,
    onCanvasPointerMove: handlePointerMove,
    onCanvasPointerUp: handlePointerUp,
    onCanvasPointerCancel: handlePointerCancel,
    onCanvasPointerLeave: handlePointerLeave,
    status,
    documentPersistence: persistence.documentPersistence,
    // Stable identity, like dismissToast: the error toast times out through it.
    dismissDocumentError: persistence.dismissError,
    jointDiagnostics: state.jointDiagnostics || [],
    manufacturingPreviewEntities: state.manufacturingPreviewEntities || [],
    manufacturingExportEntities: state.manufacturingExportEntities || [],
    setEntityMaterial: setEntityMaterialCallback,
    setEntityThickness: setEntityThicknessCallback,
    setEntityGrainAngle: setEntityGrainAngleCallback,
    setEntityHardware: setEntityHardwareCallback,
    setActiveHardware: setActiveHardwareCallback,
    toggleCraftsmanMode: toggleCraftsmanModeCallback,
    setVariables: setVariablesCallback,
    focusJoint,
    clearFocusedJoint,
    editJoint,
    clearEditingJoint,
    addJoint: addJointCallback,
    updateJoint: updateJointCallback,
    removeJoint: removeJointCallback,
    loadTemplate,
    duplicateEntities,
  };
}
