import { createContext, useContext, useMemo } from 'react';
import { createDuplicatedFloor } from '@/domain/floorModels';
import useFloorplan from '../hooks/useFloorplan';

/*
 * One store, several windows onto it.
 *
 * The store is a single reducer, so every dispatch produces a new state object —
 * and for a long time that object was the context value, which meant a pan frame
 * re-rendered the toolbar, the sidebar, the properties panel and the 3D preview
 * along with the canvas that actually moved. On a two-floor project that is the
 * difference between a smooth pan and ten frames a second.
 *
 * So the state is published through layered contexts, each carrying only what
 * changes on its own timescale:
 *
 *   ProjectContext   — the project facade. Changes on an edit, an undo, a load.
 *   EditorContext    — selection, active tool, modes, phase state, study state.
 *                      Changes on a discrete user action.
 *   ToolSettingsContext — the settled fields of `toolState`: which fixture is
 *                      armed, the fillet radius, the truss type. Scalars, so the
 *                      memo below only republishes when one of them is chosen.
 *   ToolStateContext — the whole of `toolState`, ghost previews included. This
 *                      is the per-frame one: a placement tool rewrites it on
 *                      every pointer move.
 *   ViewportContext  — pan and zoom. The other per-frame one.
 *   SelectorsContext — the workspace-level derivations (the phase-filtered
 *                      project, the resolved document, the modal state), which
 *                      already only recompute on a project or phase change.
 *
 * A component takes the narrowest window that answers its question. `useEditor`
 * still hands back the flat editor slice it always did, for the handful of
 * consumers that genuinely track the pointer.
 */

const FloorplanContext = createContext(null);
const SelectorsContext = createContext(null);
const ProjectContext = createContext(null);
const EditorContext = createContext(null);
const ToolSettingsContext = createContext(null);
const ToolStateContext = createContext(null);
const ViewportContext = createContext(null);

const EMPTY_TOOL_STATE = {};

export function FloorplanProvider({ children, initialProject, isPlayground = false }) {
  const floorplan = useFloorplan({ initialProject, isPlayground });
  const { state, dispatch, selectors } = floorplan;
  const editor = state.editor;
  const { getFloor } = selectors;

  const projectValue = useMemo(
    () => ({
      project: state.project,
      floors: state.floors,
      rooms: state.rooms,
      walls: state.walls,
      phases: state.phases,
      entities: state.entities,
      derived: state.derived,
      isDirty: state.isDirty,
      lastSavedAt: state.lastSavedAt,
      changeVersion: state.changeVersion,
      canUndo: state.history.length > 0,
      canRedo: state.future.length > 0,
      dispatch,
      duplicateFloor: (floorId) => {
        const floor = state.project.floors.find((entry) => entry.id === floorId) || null;
        return floor ? createDuplicatedFloor(floor) : null;
      },
      getFloor,
    }),
    [
      dispatch,
      getFloor,
      state.changeVersion,
      state.entities,
      state.derived,
      state.floors,
      state.future.length,
      state.history.length,
      state.isDirty,
      state.lastSavedAt,
      state.phases,
      state.project,
      state.rooms,
      state.walls,
    ],
  );

  /*
   * Spelled out field by field rather than spread from `editor`, because the
   * editor slice itself is a new object on every pan frame. Listing the cold
   * fields is what makes the memo below able to say "none of these moved".
   */
  const editorValue = useMemo(
    () => ({
      activeTool: editor.activeTool,
      modelTarget: editor.modelTarget,
      selectedId: editor.selectedId,
      selectedType: editor.selectedType,
      selectedOverhangEdge: editor.selectedOverhangEdge,
      workspaceMode: editor.workspaceMode,
      showGrid: editor.showGrid,
      snapEnabled: editor.snapEnabled,
      showFloorBelowUnderlay: editor.showFloorBelowUnderlay,
      viewMode: editor.viewMode,
      activeFloorId: editor.activeFloorId,
      activeSheetId: editor.activeSheetId,
      activeSectionCutId: editor.activeSectionCutId,
      statusMessage: editor.statusMessage,
      regionSelection: editor.regionSelection,
      pastePreview: editor.pastePreview,
      focusedPanel: editor.focusedPanel,
      activePhaseId: editor.activePhaseId,
      phaseViewMode: editor.phaseViewMode,
      lifecycleStage: editor.lifecycleStage,
      lastRejection: editor.lastRejection,
      wallDetailEditor: editor.wallDetailEditor,
      ceilingDetailEditor: editor.ceilingDetailEditor,
      hiddenWallBoards: editor.hiddenWallBoards,
      hiddenCeilingBoards: editor.hiddenCeilingBoards,
      sunStudy: editor.sunStudy,
      daylight: editor.daylight,
      solarAccess: editor.solarAccess,
      dispatch,
    }),
    [
      dispatch,
      editor.activeFloorId,
      editor.activeSectionCutId,
      editor.activeSheetId,
      editor.activeTool,
      editor.activePhaseId,
      editor.ceilingDetailEditor,
      editor.daylight,
      editor.focusedPanel,
      editor.hiddenCeilingBoards,
      editor.hiddenWallBoards,
      editor.lastRejection,
      editor.lifecycleStage,
      editor.modelTarget,
      editor.pastePreview,
      editor.phaseViewMode,
      editor.regionSelection,
      editor.selectedId,
      editor.selectedOverhangEdge,
      editor.selectedType,
      editor.showFloorBelowUnderlay,
      editor.showGrid,
      editor.snapEnabled,
      editor.solarAccess,
      editor.statusMessage,
      editor.sunStudy,
      editor.viewMode,
      editor.wallDetailEditor,
      editor.workspaceMode,
    ],
  );

  /*
   * The fields of `toolState` that outlive a pointer frame: what a placement
   * tool is armed with, and what a two-step tool has already picked. Panels and
   * the toolbar read these to show which choice is live, and none of them wants
   * to be re-rendered by the ghost preview that shares the same slice.
   *
   * `UPDATE_TOOL_STATE` merges rather than replaces, so an untouched object
   * field here keeps its identity across a preview frame.
   */
  const toolSettingsValue = useMemo(
    () => ({
      fixtureType: editor.toolState.fixtureType ?? null,
      deviceType: editor.toolState.deviceType ?? null,
      beamPlacementMode: editor.toolState.beamPlacementMode ?? null,
      trussTypeId: editor.toolState.trussTypeId ?? null,
      trussMaterial: editor.toolState.trussMaterial ?? null,
      targetTrussSystemId: editor.toolState.targetTrussSystemId ?? null,
      radius: editor.toolState.radius ?? null,
      cantileverMode: editor.toolState.cantileverMode ?? null,
      cantileverPick: editor.toolState.cantileverPick ?? null,
    }),
    [
      editor.toolState.beamPlacementMode,
      editor.toolState.cantileverMode,
      editor.toolState.cantileverPick,
      editor.toolState.deviceType,
      editor.toolState.fixtureType,
      editor.toolState.radius,
      editor.toolState.targetTrussSystemId,
      editor.toolState.trussMaterial,
      editor.toolState.trussTypeId,
    ],
  );

  const toolStateValue = editor.toolState;
  const viewportValue = editor.viewport;

  return (
    <FloorplanContext.Provider value={floorplan}>
      <SelectorsContext.Provider value={selectors}>
        <ProjectContext.Provider value={projectValue}>
          <EditorContext.Provider value={editorValue}>
            <ToolSettingsContext.Provider value={toolSettingsValue}>
              <ToolStateContext.Provider value={toolStateValue}>
                <ViewportContext.Provider value={viewportValue}>{children}</ViewportContext.Provider>
              </ToolStateContext.Provider>
            </ToolSettingsContext.Provider>
          </EditorContext.Provider>
        </ProjectContext.Provider>
      </SelectorsContext.Provider>
    </FloorplanContext.Provider>
  );
}

export function useFloorplanContext() {
  const context = useContext(FloorplanContext);
  if (!context) {
    throw new Error('useFloorplanContext must be used within FloorplanProvider');
  }
  return context;
}

function useRequiredContext(context, name) {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${name} must be used within FloorplanProvider`);
  }
  return value;
}

export function useProject() {
  return useRequiredContext(ProjectContext, 'useProject');
}

/**
 * The workspace-level derivations — the phase-filtered project, the ordered
 * floors, the resolved document, the modal and file-picker state. Published
 * apart from the raw store so that reading one of them does not cost a render
 * per pan frame.
 */
export function useFloorplanSelectors() {
  return useRequiredContext(SelectorsContext, 'useFloorplanSelectors');
}

/**
 * The editor slice minus anything that moves with the pointer — everything a
 * component that is not the canvas normally wants.
 */
export function useEditorState() {
  return useRequiredContext(EditorContext, 'useEditorState');
}

/** Pan and zoom. Per-frame: only the canvases should be reading this. */
export function useViewport() {
  return useRequiredContext(ViewportContext, 'useViewport');
}

/** The whole live tool state, ghost previews included. Per-frame. */
export function useToolState() {
  return useContext(ToolStateContext) || EMPTY_TOOL_STATE;
}

/** The settled tool choices, without the per-frame preview fields. */
export function useToolSettings() {
  return useRequiredContext(ToolSettingsContext, 'useToolSettings');
}

/**
 * The flat editor slice, unchanged in shape from when it was one context. Costs
 * a render on every pan and every ghost-preview frame, so it belongs to
 * consumers that genuinely track the pointer; everything else wants
 * `useEditorState`.
 */
export function useEditor() {
  const cold = useRequiredContext(EditorContext, 'useEditor');
  const toolState = useToolState();
  const viewport = useContext(ViewportContext);

  return useMemo(() => ({ ...cold, toolState, viewport }), [cold, toolState, viewport]);
}
