import { createContext, useContext, useReducer } from 'react';
import { SKETCH_TOOLS, DEFAULT_SKETCH_ZOOM } from '../domain/defaults';
import { GROUND_PLANE, FRONT_PLANE, SIDE_PLANE } from '../domain/drawingPlane';

const SketchEditorContext = createContext(null);

function sketchEditorReducer(state, action) {
  switch (action.type) {
    case 'SET_TOOL':
      return {
        ...state,
        activeTool: action.tool,
        toolState: {},
        selectedId: null,
        selectedType: null,
        planeLocked: false,
      };

    case 'SELECT_OBJECT':
      return {
        ...state,
        selectedId: action.id,
        selectedType: action.objectType,
        ...(state.workspaceMode === 'model' && action.objectType !== 'sheet' && action.objectType !== 'sheetViewport'
          ? {
              lastModelSelectedId: action.id,
              lastModelSelectedType: action.objectType,
            }
          : {}),
      };

    case 'DESELECT':
      return {
        ...state,
        selectedId: null,
        selectedType: null,
      };

    case 'UPDATE_TOOL_STATE':
      return {
        ...state,
        toolState: { ...state.toolState, ...action.payload },
      };

    case 'SET_VIEWPORT': {
      const vpKey = state.workspaceMode === 'sheet' ? 'sheetViewport' : 'modelViewport';
      return {
        ...state,
        [vpKey]: { ...action.viewport },
      };
    }

    case 'PAN': {
      const vpKey = state.workspaceMode === 'sheet' ? 'sheetViewport' : 'modelViewport';
      return {
        ...state,
        [vpKey]: {
          ...state[vpKey],
          panX: state[vpKey].panX + action.dx,
          panY: state[vpKey].panY + action.dy,
        },
      };
    }

    case 'ZOOM': {
      const { zoom, panX, panY } = action;
      const vpKey = state.workspaceMode === 'sheet' ? 'sheetViewport' : 'modelViewport';
      return {
        ...state,
        [vpKey]: { zoom, panX, panY },
      };
    }

    case 'SET_WORKSPACE_MODE':
      return {
        ...state,
        workspaceMode: action.workspaceMode,
        selectedId: null,
        selectedType: null,
      };

    case 'SET_ACTIVE_SHEET':
      return {
        ...state,
        activeSheetId: action.sheetId,
        selectedId: null,
        selectedType: null,
      };

    case 'SET_VIEW':
      return {
        ...state,
        activeView: action.view,
      };

    case 'SET_ACTIVE_ASSEMBLY':
      return {
        ...state,
        activeAssemblyId: action.assemblyId,
      };

    case 'ENTER_ASSEMBLY_EDIT':
      return {
        ...state,
        activeAssemblyId: action.assemblyId,
        selectedId: action.assemblyId,
        selectedType: 'assembly',
        lastModelSelectedId: action.assemblyId,
        lastModelSelectedType: 'assembly',
      };

    case 'TOGGLE_GRID':
      return { ...state, showGrid: !state.showGrid };

    case 'TOGGLE_SNAP':
      return { ...state, snapEnabled: !state.snapEnabled };

    case 'SET_CLIPBOARD':
      return { ...state, clipboard: action.data };

    case 'CLEAR_CLIPBOARD':
      return { ...state, clipboard: null };

    case 'SET_STATUS_MESSAGE':
      return { ...state, statusMessage: action.message };

    case 'CLEAR_STATUS_MESSAGE':
      if (!state.statusMessage) return state;
      return { ...state, statusMessage: null };

    case 'DISMISS_EMPTY_STATE':
      return { ...state, emptyStateDismissed: true };

    case 'TOGGLE_MAXIMIZE_PANEL':
      return { ...state, maximizedPanel: state.maximizedPanel === action.panel ? null : action.panel };

    case 'SET_DRAWING_PLANE':
      return { ...state, drawingPlane: action.plane };

    case 'RESET_DRAWING_PLANE':
      return { ...state, drawingPlane: null };

    case 'SET_PLANE_MODE': {
      const mode = action.mode;
      let plane = null;
      if (mode === 'front') plane = FRONT_PLANE;
      else if (mode === 'side') plane = SIDE_PLANE;
      else if (mode === 'ground') plane = null; // null = GROUND_PLANE default
      // 'camera' mode: plane is computed dynamically in SketchViewport
      return {
        ...state,
        planeMode: mode,
        planeLocked: false,
        drawingPlane: plane,
      };
    }

    case 'LOCK_PLANE':
      return { ...state, planeLocked: true };

    case 'UNLOCK_PLANE':
      return { ...state, planeLocked: false };

    default:
      return state;
  }
}

export function createInitialSketchEditorState() {
  return {
    activeTool: SKETCH_TOOLS.SELECT,
    selectedId: null,
    selectedType: null,
    lastModelSelectedId: null,
    lastModelSelectedType: null,
    toolState: {},
    modelViewport: { panX: 400, panY: 300, zoom: DEFAULT_SKETCH_ZOOM },
    sheetViewport: { panX: 400, panY: 300, zoom: 2.0 },
    workspaceMode: 'model',
    activeSheetId: null,
    activeView: 'top',
    activeAssemblyId: null,
    showGrid: true,
    snapEnabled: true,
    statusMessage: null,
    emptyStateDismissed: false,
    maximizedPanel: null,
    drawingPlane: null,
    planeMode: 'camera',
    planeLocked: false,
    clipboard: null,
  };
}

export function SketchEditorProvider({ children }) {
  const [state, dispatch] = useReducer(
    sketchEditorReducer,
    null,
    createInitialSketchEditorState
  );

  return (
    <SketchEditorContext.Provider value={{ state, dispatch }}>
      {children}
    </SketchEditorContext.Provider>
  );
}

export function useSketchEditor() {
  const ctx = useContext(SketchEditorContext);
  if (!ctx) throw new Error('useSketchEditor must be used within SketchEditorProvider');
  const { state } = ctx;
  const viewport = state.workspaceMode === 'sheet' ? state.sheetViewport : state.modelViewport;
  return { ...state, viewport, dispatch: ctx.dispatch };
}
