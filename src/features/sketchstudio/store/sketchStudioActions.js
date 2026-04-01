export const SKETCH_STUDIO_ACTIONS = {
  SET_CANVAS_SIZE: 'SET_CANVAS_SIZE',
  SET_ACTIVE_TOOL: 'SET_ACTIVE_TOOL',
  SET_ACTIVE_LAYER: 'SET_ACTIVE_LAYER',
  SET_UI_FLAG: 'SET_UI_FLAG',
  SET_VIEWPORT: 'SET_VIEWPORT',
  SET_POINTER_DOWN: 'SET_POINTER_DOWN',
  START_PAN: 'START_PAN',
  UPDATE_PAN: 'UPDATE_PAN',
  END_PAN: 'END_PAN',
  SYNC_POINTER: 'SYNC_POINTER',
  START_SELECTION_BOX: 'START_SELECTION_BOX',
  UPDATE_SELECTION_BOX: 'UPDATE_SELECTION_BOX',
  END_SELECTION_BOX: 'END_SELECTION_BOX',
  SET_SELECTION: 'SET_SELECTION',
  SET_SUPPRESS_NEXT_CLICK: 'SET_SUPPRESS_NEXT_CLICK',
  START_DRAFT: 'START_DRAFT',
  PATCH_DRAFT: 'PATCH_DRAFT',
  SET_PRECISION_INPUT: 'SET_PRECISION_INPUT',
  CANCEL_DRAFT: 'CANCEL_DRAFT',
  SET_SNAP: 'SET_SNAP',
  COMMIT_ENTITY: 'COMMIT_ENTITY',
  SET_DOCUMENT: 'SET_DOCUMENT',
  SET_DOCUMENT_ENTITIES: 'SET_DOCUMENT_ENTITIES',
  START_HANDLE_DRAG: 'START_HANDLE_DRAG',
  END_HANDLE_DRAG: 'END_HANDLE_DRAG',
  CANCEL_HANDLE_DRAG: 'CANCEL_HANDLE_DRAG',
  START_ANCHOR_DRAG: 'START_ANCHOR_DRAG',
  END_ANCHOR_DRAG: 'END_ANCHOR_DRAG',
  CANCEL_ANCHOR_DRAG: 'CANCEL_ANCHOR_DRAG',
  START_TRANSFORM: 'START_TRANSFORM',
  PATCH_TRANSFORM: 'PATCH_TRANSFORM',
  END_TRANSFORM: 'END_TRANSFORM',
  CANCEL_TRANSFORM: 'CANCEL_TRANSFORM',
  DELETE_SELECTED: 'DELETE_SELECTED',
  CLEAR_POINTER_DECORATIONS: 'CLEAR_POINTER_DECORATIONS',
  LOAD_WORKSPACE_SNAPSHOT: 'LOAD_WORKSPACE_SNAPSHOT',
  UNDO: 'UNDO',
  REDO: 'REDO',
  SET_ENTITY_MATERIAL: 'SET_ENTITY_MATERIAL',
  SET_ENTITY_THICKNESS: 'SET_ENTITY_THICKNESS',
  TOGGLE_CRAFTSMAN_MODE: 'TOGGLE_CRAFTSMAN_MODE',
  SET_VARIABLES: 'SET_VARIABLES',
};

export const setCanvasSize = (canvasSize) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_CANVAS_SIZE,
  payload: canvasSize,
});

export const setActiveTool = (toolId) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_ACTIVE_TOOL,
  payload: toolId,
});

export const setActiveLayer = (layerId) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_ACTIVE_LAYER,
  payload: layerId,
});

export const setUiFlag = (key, value) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_UI_FLAG,
  payload: { key, value },
});

export const setViewport = (viewport) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_VIEWPORT,
  payload: viewport,
});

export const setPointerDown = (isPointerDown) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_POINTER_DOWN,
  payload: isPointerDown,
});

export const startPan = ({ pointerId, screenPoint, startViewport }) => ({
  type: SKETCH_STUDIO_ACTIONS.START_PAN,
  payload: { pointerId, screenPoint, startViewport },
});

export const updatePan = ({ pointerId, viewport, screenPoint, worldPoint }) => ({
  type: SKETCH_STUDIO_ACTIONS.UPDATE_PAN,
  payload: { pointerId, viewport, screenPoint, worldPoint },
});

export const endPan = () => ({
  type: SKETCH_STUDIO_ACTIONS.END_PAN,
});

export const syncPointer = ({ screenPoint, worldPoint, hoveredId, snap }) => ({
  type: SKETCH_STUDIO_ACTIONS.SYNC_POINTER,
  payload: { screenPoint, worldPoint, hoveredId, snap },
});

export const startSelectionBox = (startPoint) => ({
  type: SKETCH_STUDIO_ACTIONS.START_SELECTION_BOX,
  payload: startPoint,
});

export const updateSelectionBox = ({ currentPoint, hasMoved }) => ({
  type: SKETCH_STUDIO_ACTIONS.UPDATE_SELECTION_BOX,
  payload: { currentPoint, hasMoved },
});

export const endSelectionBox = () => ({
  type: SKETCH_STUDIO_ACTIONS.END_SELECTION_BOX,
});

export const setSelection = (selectedIds) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_SELECTION,
  payload: selectedIds,
});

export const setSuppressNextClick = (value) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_SUPPRESS_NEXT_CLICK,
  payload: value,
});

export const startDraft = (draftState) => ({
  type: SKETCH_STUDIO_ACTIONS.START_DRAFT,
  payload: draftState,
});

export const patchDraft = (draftPatch) => ({
  type: SKETCH_STUDIO_ACTIONS.PATCH_DRAFT,
  payload: draftPatch,
});

export const setPrecisionInput = (precisionPatch) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_PRECISION_INPUT,
  payload: precisionPatch,
});

export const cancelDraft = () => ({
  type: SKETCH_STUDIO_ACTIONS.CANCEL_DRAFT,
});

export const setSnap = (snapState) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_SNAP,
  payload: snapState,
});

export const commitEntity = (entity) => ({
  type: SKETCH_STUDIO_ACTIONS.COMMIT_ENTITY,
  payload: entity,
});

export const setDocument = (document, meta = undefined) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_DOCUMENT,
  payload: document,
  meta,
});

export const setDocumentEntities = (entities, meta = undefined) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_DOCUMENT_ENTITIES,
  payload: entities,
  meta,
});

export const startHandleDrag = (handleDrag) => ({
  type: SKETCH_STUDIO_ACTIONS.START_HANDLE_DRAG,
  payload: handleDrag,
});

export const endHandleDrag = () => ({
  type: SKETCH_STUDIO_ACTIONS.END_HANDLE_DRAG,
});

export const cancelHandleDrag = () => ({
  type: SKETCH_STUDIO_ACTIONS.CANCEL_HANDLE_DRAG,
});

export const startAnchorDrag = (anchorDrag) => ({
  type: SKETCH_STUDIO_ACTIONS.START_ANCHOR_DRAG,
  payload: anchorDrag,
});

export const endAnchorDrag = () => ({
  type: SKETCH_STUDIO_ACTIONS.END_ANCHOR_DRAG,
});

export const cancelAnchorDrag = () => ({
  type: SKETCH_STUDIO_ACTIONS.CANCEL_ANCHOR_DRAG,
});

export const startTransform = (transform) => ({
  type: SKETCH_STUDIO_ACTIONS.START_TRANSFORM,
  payload: transform,
});

export const patchTransform = (transformPatch) => ({
  type: SKETCH_STUDIO_ACTIONS.PATCH_TRANSFORM,
  payload: transformPatch,
});

export const endTransform = () => ({
  type: SKETCH_STUDIO_ACTIONS.END_TRANSFORM,
});

export const cancelTransform = () => ({
  type: SKETCH_STUDIO_ACTIONS.CANCEL_TRANSFORM,
});

export const deleteSelected = () => ({
  type: SKETCH_STUDIO_ACTIONS.DELETE_SELECTED,
});

export const clearPointerDecorations = () => ({
  type: SKETCH_STUDIO_ACTIONS.CLEAR_POINTER_DECORATIONS,
});

export const loadWorkspaceSnapshot = (workspace) => ({
  type: SKETCH_STUDIO_ACTIONS.LOAD_WORKSPACE_SNAPSHOT,
  payload: workspace,
});

export const undo = () => ({
  type: SKETCH_STUDIO_ACTIONS.UNDO,
});

export const redo = () => ({
  type: SKETCH_STUDIO_ACTIONS.REDO,
});

export const setEntityMaterial = (entityIds, materialId) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_ENTITY_MATERIAL,
  payload: { entityIds, materialId },
});

export const setEntityThickness = (entityIds, thickness) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_ENTITY_THICKNESS,
  payload: { entityIds, thickness },
});

export const toggleCraftsmanMode = () => ({
  type: SKETCH_STUDIO_ACTIONS.TOGGLE_CRAFTSMAN_MODE,
});

export const setVariables = (variables) => ({
  type: SKETCH_STUDIO_ACTIONS.SET_VARIABLES,
  payload: variables,
});
