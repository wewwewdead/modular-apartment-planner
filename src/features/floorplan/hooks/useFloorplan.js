import { startTransition, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useConfirmDialog } from '@/ui/ConfirmDialog';
import { useUnsavedChangesGuard } from '@/app/useUnsavedChangesGuard';
import { createProject } from '@/domain/models';
import { createDuplicatedFloor, getOrderedFloors } from '@/domain/floorModels';
import { filterProjectByPhase } from '@/domain/phaseFilter';
import { deleteProject, listProjects, loadProject, pruneDrafts, saveProject } from '@/persistence/storage';
import {
  exportProjectArchive,
  exportProjectFile,
  importProjectFile,
  isFilePickerAbortError,
  isNotAProjectFileError,
  openProjectFile,
} from '@/persistence/fileTransfer';
import { afterPaint, LOADING_COPY } from '@/ui/loading';
import { useAutosave } from '@/persistence/useAutosave';
import floorplanReducer, { initializeFloorplanState } from '../store/floorplanReducer';
import { projectOpenEventForStage, projectOpenMachine } from './projectOpenMachine';

// An autosave that fails has nothing on screen to answer for it, so the
// canvas status toast says so; the project stays dirty either way.
function getAutosaveErrorMessage(err) {
  return err?.name === 'QuotaExceededError'
    ? 'Autosave failed: browser storage is full. Delete drafts you no longer need in Open Project, or save to a file (Ctrl+S).'
    : 'Autosave failed. Save the project to a file (Ctrl+S) to keep your work.';
}

// A save the user asked for and did not get says so the same way; the file
// write is what failed, so the project stays dirty.
const SAVE_ERROR_MESSAGE = 'Save failed: the project file could not be written. Your changes are not saved to it.';

// Clears drafts that hold nothing (see pruneDrafts); never the open one, and a
// failure only means they stay.
function pruneDraftsQuietly(keepId) {
  pruneDrafts({ keepId }).catch((err) => console.warn('[drafts] Pruning failed:', err));
}

function getImportErrorMessage(err) {
  if (isNotAProjectFileError(err)) return LOADING_COPY.badProjectFile;
  const message = typeof err?.message === 'string' ? err.message.trim() : '';
  return message || 'The selected file could not be opened as an Apartment Planner project.';
}

/*
  The open attempt in flight, held in a ref as `{ lastId, liveId, state }`:
  `state` is where the live run stands in projectOpenMachine. Each attempt
  gets the next id; closing the dialog cancels the live run and leaves no run
  live. Whatever a run reports once it is not the live one, or that the table
  has no move for, is dropped.
*/
function beginOpenRun(runRef) {
  const id = runRef.current.lastId + 1;
  runRef.current = { lastId: id, liveId: id, state: projectOpenMachine.initial };
  return id;
}

function advanceOpenRun(runRef, runId, event) {
  const run = runRef.current;
  if (run.liveId !== runId || !projectOpenMachine.can(run.state, event)) return false;
  runRef.current = { ...run, state: projectOpenMachine.next(run.state, event) };
  return true;
}

function cancelOpenRun(runRef) {
  if (!advanceOpenRun(runRef, runRef.current.liveId, 'CANCEL')) return false;
  runRef.current = { ...runRef.current, liveId: null };
  return true;
}

export default function useFloorplan({ initialProject, isPlayground = false } = {}) {
  const confirm = useConfirmDialog();
  const [state, dispatch] = useReducer(floorplanReducer, initialProject || createProject(), initializeFloorplanState);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [savedProjects, setSavedProjects] = useState([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(false);
  const [projectFileHandle, setProjectFileHandle] = useState(null);
  /*
    A project on its way in (§5.3): `{ stage: 'draft', draftId }` or
    `{ stage: 'reading' | 'unpacking', name }`. Set before any of the work so
    the clicked control and the bar answer first; cleared in the same commit
    that puts the project on screen. A failure while the Open Project dialog is
    up lands on its Project File card rather than in a dialog over it.
  */
  const [projectOpening, setProjectOpening] = useState(null);
  const [projectOpenError, setProjectOpenError] = useState(null);
  const showLoadModalRef = useRef(false);
  useEffect(() => {
    showLoadModalRef.current = showLoadModal;
  }, [showLoadModal]);
  // Closing the dialog takes back a load still running: it must not replace
  // the project, adopt a file handle or show an error after that.
  const openRunRef = useRef({ lastId: 0, liveId: null, state: projectOpenMachine.initial });
  const importInputRef = useRef(null);

  const project = state.project;
  const editor = state.editor;
  const orderedFloors = useMemo(() => getOrderedFloors(project), [project]);
  const availableFloorIds = useMemo(() => orderedFloors.map((floor) => floor.id), [orderedFloors]);
  const availablePhaseIds = useMemo(() => (project.phases || []).map((phase) => phase.id), [project.phases]);

  const handleAutosaveError = useCallback((err) => {
    dispatch({ type: 'SET_STATUS_MESSAGE', message: getAutosaveErrorMessage(err) });
  }, []);
  const handleAutosaved = useCallback((savedProject) => pruneDraftsQuietly(savedProject.id), []);
  useAutosave(
    project,
    state.isDirty && !isPlayground,
    dispatch,
    handleAutosaveError,
    handleAutosaved,
    state.changeVersion,
  );

  // On app start, once the workspace is idle: the drafts left from earlier
  // sessions that hold nothing. The playground never touches stored drafts.
  const startProjectIdRef = useRef(project.id);
  useEffect(() => {
    if (isPlayground) return undefined;
    const prune = () => pruneDraftsQuietly(startProjectIdRef.current);
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(prune, { timeout: 5000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(prune, 3000);
    return () => window.clearTimeout(timer);
  }, [isPlayground]);
  useUnsavedChangesGuard(state.isDirty && !isPlayground);

  useEffect(() => {
    const sheets = project.sheets || [];
    if (!sheets.length) {
      if (editor.activeSheetId !== null) {
        dispatch({ type: 'SET_ACTIVE_SHEET', sheetId: null });
      }
      if (editor.workspaceMode === 'sheet') {
        dispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'model' });
      }
      return;
    }

    if (!editor.activeSheetId || !sheets.some((sheet) => sheet.id === editor.activeSheetId)) {
      dispatch({ type: 'SET_ACTIVE_SHEET', sheetId: sheets[0].id });
    }
  }, [editor.activeSheetId, editor.workspaceMode, project.sheets]);

  useEffect(() => {
    if (!availableFloorIds.length) {
      if (editor.activeFloorId !== null) {
        dispatch({ type: 'SET_ACTIVE_FLOOR', floorId: null });
      }
      return;
    }

    if (!editor.activeFloorId || !availableFloorIds.includes(editor.activeFloorId)) {
      dispatch({ type: 'SET_ACTIVE_FLOOR', floorId: availableFloorIds[0] });
    }
  }, [availableFloorIds, editor.activeFloorId]);

  useEffect(() => {
    if (editor.activePhaseId && !availablePhaseIds.includes(editor.activePhaseId)) {
      dispatch({ type: 'SET_ACTIVE_PHASE', phaseId: null });
      dispatch({ type: 'SET_PHASE_VIEW_MODE', mode: 'all' });
    }
  }, [availablePhaseIds, editor.activePhaseId]);

  const handleCreateProject = useCallback(({ name }) => {
    const newProject = createProject(name);
    setProjectFileHandle(null);
    dispatch({ type: 'PROJECT_NEW', project: newProject });
    setShowNewProjectModal(false);
  }, []);

  const handleNew = useCallback(async () => {
    if (state.isDirty && !(await confirm('Unsaved changes will be lost. Continue?'))) return;
    setShowNewProjectModal(true);
  }, [confirm, state.isDirty]);

  const changeVersion = state.changeVersion;
  const handleSave = useCallback(async () => {
    // The version of the project this save writes; anything edited while the
    // file write is awaited stays dirty.
    const version = changeVersion;
    try {
      const { fileHandle } = await exportProjectFile(project, {
        fileHandle: projectFileHandle,
      });
      setProjectFileHandle(fileHandle);
      try {
        await saveProject(project);
        pruneDraftsQuietly(project.id);
      } catch {
        // Browser draft sync is secondary to file save.
      }
      dispatch({ type: 'MARK_SAVED', version });
    } catch (err) {
      if (isFilePickerAbortError(err)) return;
      console.warn('[save] Failed to save project file:', err);
      dispatch({ type: 'SET_STATUS_MESSAGE', message: SAVE_ERROR_MESSAGE });
    }
  }, [changeVersion, project, projectFileHandle]);

  // Sharing writes a standalone copy: it never adopts a file handle or clears the dirty flag.
  const handleShareProject = useCallback(async () => {
    try {
      await exportProjectArchive(project);
    } catch (err) {
      if (isFilePickerAbortError(err)) return;
      console.warn('[share] Failed to export shared project archive:', err);
    }
  }, [project]);

  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.closest('[contenteditable="true"]'))
      ) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  const handleLoadClick = useCallback(async () => {
    setSavedProjects(await listProjects());
    setProjectOpenError(null);
    setShowLoadModal(true);
  }, []);

  /*
    Everything after the read: the busy state has painted by now, and the
    load itself — the reducer's migration pass and the re-render of the whole
    workspace — runs as a transition so the page keeps answering through it.
    The modal closes in that same commit, with the project already drawn. A
    run the user cancelled before it got here commits nothing.
  */
  const commitLoadedProject = useCallback(async ({ project: loadedProject, savedAt }, fileHandle, runId) => {
    await afterPaint();
    if (!advanceOpenRun(openRunRef, runId, 'COMMIT')) return;
    startTransition(() => {
      dispatch({ type: 'PROJECT_LOAD', project: loadedProject, savedAt });
      setProjectFileHandle(fileHandle);
      setShowLoadModal(false);
      setProjectOpening(null);
    });
  }, []);

  const failProjectOpen = useCallback(
    async (err, runId) => {
      if (!advanceOpenRun(openRunRef, runId, 'FAIL')) return;
      setProjectOpening(null);
      const message = getImportErrorMessage(err);
      if (showLoadModalRef.current) {
        setProjectOpenError(message);
        return;
      }
      await confirm(message, { title: 'Could not open project', variant: 'alert' });
    },
    [confirm],
  );

  const trackOpenProgress = useCallback((runId, { stage, name }) => {
    if (!advanceOpenRun(openRunRef, runId, projectOpenEventForStage(stage))) return;
    setProjectOpenError(null);
    setProjectOpening({ stage, name });
  }, []);

  const handleOpenProjectFile = useCallback(async () => {
    if (typeof window.showOpenFilePicker !== 'function') {
      importInputRef.current?.click();
      return;
    }

    if (state.isDirty && !(await confirm('Unsaved changes will be lost. Continue?'))) {
      return;
    }

    const runId = beginOpenRun(openRunRef);
    advanceOpenRun(openRunRef, runId, 'PICK');
    try {
      // The picker owns the wait until a file is chosen; the progress callback
      // is the first moment there is a name to show.
      const result = await openProjectFile({ onProgress: (progress) => trackOpenProgress(runId, progress) });
      await commitLoadedProject(result, result.fileHandle, runId);
    } catch (err) {
      if (isFilePickerAbortError(err)) {
        advanceOpenRun(openRunRef, runId, 'CANCEL');
        return;
      }
      console.warn('[open] Failed to import project file:', err);
      await failProjectOpen(err, runId);
    }
  }, [commitLoadedProject, confirm, failProjectOpen, state.isDirty, trackOpenProgress]);

  const handleImportFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0] || null;
      event.target.value = '';
      if (!file) return;

      if (state.isDirty && !(await confirm('Unsaved changes will be lost. Continue?'))) {
        return;
      }

      const runId = beginOpenRun(openRunRef);
      try {
        trackOpenProgress(runId, { stage: 'reading', name: file.name });
        await afterPaint();
        const result = await importProjectFile(file, { onProgress: (progress) => trackOpenProgress(runId, progress) });
        await commitLoadedProject(result, null, runId);
      } catch (err) {
        console.warn('[import] Failed to import project file:', err);
        await failProjectOpen(err, runId);
      }
    },
    [commitLoadedProject, confirm, failProjectOpen, state.isDirty, trackOpenProgress],
  );

  const handleLoadDraft = useCallback(
    async (projectId) => {
      if (state.isDirty && !(await confirm('Unsaved changes will be lost. Continue?'))) return;

      const runId = beginOpenRun(openRunRef);
      try {
        advanceOpenRun(openRunRef, runId, 'OPEN_DRAFT');
        setProjectOpenError(null);
        setProjectOpening({ stage: 'draft', draftId: projectId });
        await afterPaint();
        const result = await loadProject(projectId);
        await commitLoadedProject(result, null, runId);
      } catch (err) {
        console.warn('[load] Failed to load project:', err);
        await failProjectOpen(err, runId);
      }
    },
    [commitLoadedProject, confirm, failProjectOpen, state.isDirty],
  );

  const handleDeleteDraft = useCallback(
    async (projectId, name) => {
      if (!(await confirm(`Delete "${name}"? This cannot be undone.`))) return;

      try {
        await deleteProject(projectId);
        setSavedProjects((projects) => projects.filter((savedProject) => savedProject.id !== projectId));
      } catch (err) {
        console.warn('[delete] Failed to delete project:', err);
      }
    },
    [confirm],
  );

  const getFloor = useCallback((floorId) => project.floors.find((floor) => floor.id === floorId), [project.floors]);

  const duplicateFloor = useCallback(
    (floorId) => {
      const floor = project.floors.find((entry) => entry.id === floorId) || null;
      return floor ? createDuplicatedFloor(floor) : null;
    },
    [project.floors],
  );

  const filteredProject = useMemo(
    () => filterProjectByPhase(project, editor.activePhaseId, editor.phaseViewMode),
    [editor.activePhaseId, editor.phaseViewMode, project],
  );
  const activeFloor = useMemo(
    () => orderedFloors.find((floor) => floor.id === editor.activeFloorId) || null,
    [editor.activeFloorId, orderedFloors],
  );
  const activeSheet = useMemo(
    () => (project.sheets || []).find((sheet) => sheet.id === editor.activeSheetId) || null,
    [editor.activeSheetId, project.sheets],
  );
  const filteredFloor = useMemo(
    () => (filteredProject.floors || []).find((floor) => floor.id === editor.activeFloorId) || null,
    [editor.activeFloorId, filteredProject.floors],
  );
  const floorTrussSystems = useMemo(
    () => (filteredProject.trussSystems || []).filter((trussSystem) => trussSystem.floorId === editor.activeFloorId),
    [editor.activeFloorId, filteredProject.trussSystems],
  );
  const floorCeilings = useMemo(
    () => (filteredProject.ceilings || []).filter((ceiling) => ceiling.floorId === editor.activeFloorId),
    [editor.activeFloorId, filteredProject.ceilings],
  );
  const resolvedDocument = useMemo(
    () => ({
      project: filteredProject,
      floor: filteredFloor,
      activeFloor,
      activeSheet,
      roofSystem: filteredProject.roofSystem || null,
      trussSystems: floorTrussSystems,
      ceilings: floorCeilings,
      entities: {
        walls: filteredFloor?.walls || [],
        rooms: filteredFloor?.rooms || [],
        doors: filteredFloor?.doors || [],
        windows: filteredFloor?.windows || [],
        electricalDevices: filteredFloor?.electricalDevices || [],
        columns: filteredFloor?.columns || [],
        beams: filteredFloor?.beams || [],
        stairs: filteredFloor?.stairs || [],
        landings: filteredFloor?.landings || [],
        fixtures: filteredFloor?.fixtures || [],
        annotations: filteredFloor?.annotations || [],
        slabs: filteredFloor?.slabs || [],
        sectionCuts: filteredFloor?.sectionCuts || [],
        railings: filteredFloor?.railings || [],
        roofPlanes: filteredProject.roofSystem?.roofPlanes || [],
        roofEdges: filteredProject.roofSystem?.roofEdges || [],
        parapets: filteredProject.roofSystem?.parapets || [],
        drains: filteredProject.roofSystem?.drains || [],
        roofOpenings: filteredProject.roofSystem?.roofOpenings || [],
        trussSystems: floorTrussSystems,
        ceilings: floorCeilings,
      },
    }),
    [activeFloor, activeSheet, filteredFloor, filteredProject, floorCeilings, floorTrussSystems],
  );

  const selectors = useMemo(
    () => ({
      orderedFloors,
      availableFloorIds,
      availablePhaseIds,
      activeFloor,
      activeSheet,
      filteredProject,
      filteredFloor,
      floorTrussSystems,
      floorCeilings,
      resolvedDocument,
      canUndo: state.history.length > 0,
      canRedo: state.future.length > 0,
      getFloor,
      duplicateFloor,
      workspaceUi: {
        showLoadModal,
        showNewProjectModal,
        savedProjects,
        isSidebarCollapsed,
        isPropertiesCollapsed,
        projectFileHandle,
        projectOpening,
        projectOpenError,
      },
      workspaceRefs: {
        importInputRef,
      },
    }),
    [
      activeFloor,
      activeSheet,
      availableFloorIds,
      availablePhaseIds,
      duplicateFloor,
      filteredFloor,
      filteredProject,
      floorCeilings,
      floorTrussSystems,
      getFloor,
      isPropertiesCollapsed,
      isSidebarCollapsed,
      orderedFloors,
      projectFileHandle,
      projectOpenError,
      projectOpening,
      resolvedDocument,
      savedProjects,
      showLoadModal,
      showNewProjectModal,
      state.future.length,
      state.history.length,
      importInputRef,
    ],
  );

  const actions = useMemo(
    () => ({
      workspace: {
        toggleSidebar: () => setIsSidebarCollapsed((value) => !value),
        toggleProperties: () => setIsPropertiesCollapsed((value) => !value),
        openLoadModal: handleLoadClick,
        closeLoadModal: () => {
          if (cancelOpenRun(openRunRef)) setProjectOpening(null);
          setProjectOpenError(null);
          setShowLoadModal(false);
        },
        openNewProjectModal: () => setShowNewProjectModal(true),
        closeNewProjectModal: () => setShowNewProjectModal(false),
      },
      project: {
        newProject: handleNew,
        createProject: handleCreateProject,
        saveProject: handleSave,
        shareProject: handleShareProject,
        openProjectFile: handleOpenProjectFile,
        importProjectFile: handleImportFile,
        loadDraft: handleLoadDraft,
        deleteDraft: handleDeleteDraft,
      },
      editor: {
        setActiveFloor: (floorId) => dispatch({ type: 'SET_ACTIVE_FLOOR', floorId }),
        setActiveSheet: (sheetId) => dispatch({ type: 'SET_ACTIVE_SHEET', sheetId }),
        setActivePhase: (phaseId) => dispatch({ type: 'SET_ACTIVE_PHASE', phaseId }),
        setPhaseViewMode: (mode) => dispatch({ type: 'SET_PHASE_VIEW_MODE', mode }),
        setWorkspaceMode: (workspaceMode) => dispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode }),
        toggleFloorBelowUnderlay: () => dispatch({ type: 'TOGGLE_FLOOR_BELOW_UNDERLAY' }),
        setShowFloorBelowUnderlay: (show) => dispatch({ type: 'SET_SHOW_FLOOR_BELOW_UNDERLAY', show }),
        setViewMode: (viewMode, sectionCutId = undefined) =>
          dispatch({ type: 'SET_VIEW_MODE', viewMode, sectionCutId }),
      },
    }),
    [
      handleCreateProject,
      handleDeleteDraft,
      handleImportFile,
      handleLoadClick,
      handleLoadDraft,
      handleNew,
      handleOpenProjectFile,
      handleSave,
      handleShareProject,
    ],
  );

  // Memoized so a re-render that changed nothing does not republish the store
  // to every consumer of the raw context.
  return useMemo(
    () => ({
      state,
      dispatch,
      actions,
      selectors,
    }),
    [actions, selectors, state],
  );
}
