import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useConfirmDialog } from '@/ui/ConfirmDialog';
import { useUnsavedChangesGuard } from '@/app/useUnsavedChangesGuard';
import { createProject } from '@/domain/models';
import { createDuplicatedFloor, getOrderedFloors } from '@/domain/floorModels';
import { filterProjectByPhase } from '@/domain/phaseFilter';
import { deleteProject, listProjects, loadProject, saveProject } from '@/persistence/storage';
import {
  exportProjectFile,
  importProjectFile,
  isFilePickerAbortError,
  openProjectFile,
} from '@/persistence/fileTransfer';
import { useAutosave } from '@/persistence/useAutosave';
import floorplanReducer, { initializeFloorplanState } from '../store/floorplanReducer';

export default function useFloorplan({ initialProject, isPlayground = false } = {}) {
  const confirm = useConfirmDialog();
  const [state, dispatch] = useReducer(floorplanReducer, initialProject || createProject(), initializeFloorplanState);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [savedProjects, setSavedProjects] = useState([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(false);
  const [projectFileHandle, setProjectFileHandle] = useState(null);
  const importInputRef = useRef(null);

  const project = state.project;
  const editor = state.editor;
  const orderedFloors = useMemo(() => getOrderedFloors(project), [project]);
  const availableFloorIds = useMemo(() => orderedFloors.map((floor) => floor.id), [orderedFloors]);
  const availablePhaseIds = useMemo(() => (project.phases || []).map((phase) => phase.id), [project.phases]);

  useAutosave(project, state.isDirty && !isPlayground, dispatch);
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

  const handleSave = useCallback(async () => {
    try {
      const { fileHandle } = await exportProjectFile(project, { fileHandle: projectFileHandle });
      setProjectFileHandle(fileHandle);
      try {
        await saveProject(project);
      } catch {
        // Browser draft sync is secondary to file save.
      }
      dispatch({ type: 'MARK_SAVED' });
    } catch (err) {
      if (isFilePickerAbortError(err)) return;
      console.warn('[save] Failed to save project file:', err);
    }
  }, [project, projectFileHandle]);

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
    setShowLoadModal(true);
  }, []);

  const handleOpenProjectFile = useCallback(async () => {
    if (typeof window.showOpenFilePicker !== 'function') {
      importInputRef.current?.click();
      return;
    }

    if (state.isDirty && !(await confirm('Unsaved changes will be lost. Continue?'))) {
      return;
    }

    try {
      const { project: loadedProject, savedAt, fileHandle } = await openProjectFile();
      dispatch({ type: 'PROJECT_LOAD', project: loadedProject, savedAt });
      setProjectFileHandle(fileHandle);
      setShowLoadModal(false);
    } catch (err) {
      if (isFilePickerAbortError(err)) return;
      console.warn('[open] Failed to import project file:', err);
    }
  }, [confirm, state.isDirty]);

  const handleImportFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0] || null;
      event.target.value = '';
      if (!file) return;

      if (state.isDirty && !(await confirm('Unsaved changes will be lost. Continue?'))) {
        return;
      }

      try {
        const { project: loadedProject, savedAt } = await importProjectFile(file);
        dispatch({ type: 'PROJECT_LOAD', project: loadedProject, savedAt });
        setProjectFileHandle(null);
        setShowLoadModal(false);
      } catch (err) {
        console.warn('[import] Failed to import project file:', err);
      }
    },
    [confirm, state.isDirty],
  );

  const handleLoadDraft = useCallback(
    async (projectId) => {
      if (state.isDirty && !(await confirm('Unsaved changes will be lost. Continue?'))) return;

      try {
        const { project: loadedProject, savedAt } = await loadProject(projectId);
        dispatch({ type: 'PROJECT_LOAD', project: loadedProject, savedAt });
        setProjectFileHandle(null);
        setShowLoadModal(false);
      } catch (err) {
        console.warn('[load] Failed to load project:', err);
      }
    },
    [confirm, state.isDirty],
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
  const resolvedDocument = useMemo(
    () => ({
      project: filteredProject,
      floor: filteredFloor,
      activeFloor,
      activeSheet,
      roofSystem: filteredProject.roofSystem || null,
      trussSystems: floorTrussSystems,
      entities: {
        walls: filteredFloor?.walls || [],
        rooms: filteredFloor?.rooms || [],
        doors: filteredFloor?.doors || [],
        windows: filteredFloor?.windows || [],
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
      },
    }),
    [activeFloor, activeSheet, filteredFloor, filteredProject, floorTrussSystems],
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
      floorTrussSystems,
      getFloor,
      isPropertiesCollapsed,
      isSidebarCollapsed,
      orderedFloors,
      projectFileHandle,
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
        closeLoadModal: () => setShowLoadModal(false),
        openNewProjectModal: () => setShowNewProjectModal(true),
        closeNewProjectModal: () => setShowNewProjectModal(false),
      },
      project: {
        newProject: handleNew,
        createProject: handleCreateProject,
        saveProject: handleSave,
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
    ],
  );

  return {
    state,
    dispatch,
    actions,
    selectors,
  };
}
