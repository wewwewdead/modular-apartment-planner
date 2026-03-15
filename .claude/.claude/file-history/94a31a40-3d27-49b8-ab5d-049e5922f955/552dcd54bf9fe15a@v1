import { createContext, useContext, useEffect, useReducer } from 'react';
import { TOOLS } from '@/editor/tools';
import { DEFAULT_ZOOM } from '@/domain/defaults';

const EditorContext = createContext(null);

function normalizeViewMode(viewMode) {
  if (viewMode === 'elevation_side') return 'elevation_left';
  return viewMode;
}

function getInitialModelViewport() {
  return { panX: 400, panY: 300, zoom: DEFAULT_ZOOM };
}

function getInitialSheetViewport() {
  return { panX: 120, panY: 80, zoom: 2 };
}

function clearSelectionState(state) {
  return {
    ...state,
    selectedId: null,
    selectedType: null,
    regionSelection: null,
    pastePreview: { active: false, point: null },
  };
}

function editorReducer(state, action) {
  switch (action.type) {
    case 'SET_TOOL':
      return {
        ...clearSelectionState(state),
        activeTool: action.tool,
        toolState: {},
        statusMessage: null,
      };

    case 'SET_VIEW_MODE':
      return {
        ...clearSelectionState(state),
        workspaceMode: 'model',
        viewMode: normalizeViewMode(action.viewMode),
        activeSectionCutId: action.sectionCutId ?? state.activeSectionCutId,
        viewport: { ...state.modelViewport },
        toolState: {},
        statusMessage: null,
      };

    case 'SET_WORKSPACE_MODE':
      return {
        ...clearSelectionState(state),
        workspaceMode: action.workspaceMode,
        viewport: action.workspaceMode === 'sheet'
          ? { ...state.sheetViewport }
          : { ...state.modelViewport },
        toolState: {},
        statusMessage: null,
      };

    case 'SET_ACTIVE_SHEET':
      return {
        ...clearSelectionState(state),
        activeSheetId: action.sheetId,
        statusMessage: null,
      };

    case 'SELECT_OBJECT':
      return {
        ...clearSelectionState(state),
        selectedId: action.id,
        selectedType: action.objectType,
      };

    case 'DESELECT':
      return clearSelectionState(state);

    case 'SET_REGION_SELECTION':
      return {
        ...clearSelectionState(state),
        regionSelection: action.selection && action.bounds
          ? {
              bounds: action.bounds,
              selection: action.selection,
              objectCount: Object.values(action.selection).reduce((count, ids) => count + (ids?.length || 0), 0),
            }
          : null,
      };

    case 'UPDATE_TOOL_STATE':
      return {
        ...state,
        toolState: { ...state.toolState, ...action.payload },
      };

    case 'SET_VIEWPORT':
      return {
        ...state,
        modelViewport: state.workspaceMode === 'model' ? { ...action.viewport } : state.modelViewport,
        sheetViewport: state.workspaceMode === 'sheet' ? { ...action.viewport } : state.sheetViewport,
        viewport: { ...action.viewport },
      };

    case 'PAN':
      return {
        ...state,
        modelViewport: state.workspaceMode === 'model'
          ? {
              ...state.modelViewport,
              panX: state.modelViewport.panX + action.dx,
              panY: state.modelViewport.panY + action.dy,
            }
          : state.modelViewport,
        sheetViewport: state.workspaceMode === 'sheet'
          ? {
              ...state.sheetViewport,
              panX: state.sheetViewport.panX + action.dx,
              panY: state.sheetViewport.panY + action.dy,
            }
          : state.sheetViewport,
        viewport: {
          ...state.viewport,
          panX: state.viewport.panX + action.dx,
          panY: state.viewport.panY + action.dy,
        },
      };

    case 'ZOOM': {
      const { zoom, panX, panY } = action;
      return {
        ...state,
        modelViewport: state.workspaceMode === 'model' ? { zoom, panX, panY } : state.modelViewport,
        sheetViewport: state.workspaceMode === 'sheet' ? { zoom, panX, panY } : state.sheetViewport,
        viewport: { zoom, panX, panY },
      };
    }

    case 'TOGGLE_GRID':
      return { ...state, showGrid: !state.showGrid };

    case 'TOGGLE_SNAP':
      return { ...state, snapEnabled: !state.snapEnabled };

    case 'SET_ACTIVE_FLOOR':
      return {
        ...clearSelectionState(state),
        activeFloorId: action.floorId,
        toolState: {},
        statusMessage: null,
      };

    case 'SET_STATUS_MESSAGE':
      return { ...state, statusMessage: action.message };

    case 'CLEAR_STATUS_MESSAGE':
      if (!state.statusMessage) return state;
      return { ...state, statusMessage: null };

    case 'START_PASTE_PREVIEW':
      return {
        ...state,
        selectedId: null,
        selectedType: null,
        regionSelection: null,
        pastePreview: {
          active: true,
          point: action.point ?? null,
        },
      };

    case 'UPDATE_PASTE_PREVIEW':
      if (!state.pastePreview?.active) return state;
      return {
        ...state,
        pastePreview: {
          active: true,
          point: action.point,
        },
      };

    case 'CANCEL_PASTE_PREVIEW':
      if (!state.pastePreview?.active) return state;
      return {
        ...state,
        pastePreview: {
          active: false,
          point: null,
        },
      };

    case 'TOGGLE_MAXIMIZE_PANEL':
      return {
        ...state,
        maximizedPanel: state.maximizedPanel === action.panel ? null : action.panel,
      };

    default:
      return state;
  }
}

export function createInitialEditorState(activeFloorId = null) {
  const modelViewport = getInitialModelViewport();
  const sheetViewport = getInitialSheetViewport();
  return {
    activeTool: TOOLS.SELECT,
    selectedId: null,
    selectedType: null,
    toolState: {},
    workspaceMode: 'model',
    viewport: { ...modelViewport },
    modelViewport,
    sheetViewport,
    showGrid: true,
    snapEnabled: true,
    viewMode: 'plan',
    activeFloorId,
    activeSheetId: null,
    activeSectionCutId: null,
    statusMessage: null,
    regionSelection: null,
    pastePreview: { active: false, point: null },
    maximizedPanel: null,
  };
}

export function EditorProvider({ children, initialActiveFloorId = null, availableFloorIds = [] }) {
  const [state, dispatch] = useReducer(
    editorReducer,
    initialActiveFloorId,
    createInitialEditorState
  );

  useEffect(() => {
    if (!availableFloorIds.length) {
      if (state.activeFloorId !== null) {
        dispatch({ type: 'SET_ACTIVE_FLOOR', floorId: null });
      }
      return;
    }

    if (!state.activeFloorId || !availableFloorIds.includes(state.activeFloorId)) {
      dispatch({ type: 'SET_ACTIVE_FLOOR', floorId: availableFloorIds[0] });
    }
  }, [availableFloorIds, state.activeFloorId]);

  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return { ...ctx.state, dispatch: ctx.dispatch };
}
