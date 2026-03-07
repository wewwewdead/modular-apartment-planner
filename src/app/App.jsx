import { useState, useEffect, useCallback } from 'react';
import { ProjectProvider, useProject } from './ProjectProvider';
import { EditorProvider, useEditor } from './EditorProvider';
import SvgCanvas from '@/renderers/SvgCanvas';
import SheetCanvas from '@/renderers/SheetCanvas';
import Toolbar from '@/ui/Toolbar';
import Sidebar from '@/ui/Sidebar';
import PropertiesPanel from '@/ui/PropertiesPanel';
import Modal from '@/ui/Modal';
import { createProject } from '@/domain/models';
import { saveProject, loadProject, listProjects, deleteProject } from '@/persistence/storage';
import { useAutosave } from '@/persistence/useAutosave';
import { isTypingTarget } from '@/utils/keyboard';
import styles from './App.module.css';

function EditorShell({
  project,
  handleNew,
  handleSave,
  handleLoadClick,
  isSidebarCollapsed,
  isPropertiesCollapsed,
  onToggleSidebar,
  onToggleProperties,
}) {
  const { workspaceMode, activeSheetId, dispatch: editorDispatch } = useEditor();

  useEffect(() => {
    const sheets = project.sheets || [];
    if (!sheets.length) {
      if (activeSheetId !== null) {
        editorDispatch({ type: 'SET_ACTIVE_SHEET', sheetId: null });
      }
      if (workspaceMode === 'sheet') {
        editorDispatch({ type: 'SET_WORKSPACE_MODE', workspaceMode: 'model' });
      }
      return;
    }

    if (!activeSheetId || !sheets.some((sheet) => sheet.id === activeSheetId)) {
      editorDispatch({ type: 'SET_ACTIVE_SHEET', sheetId: sheets[0].id });
    }
  }, [activeSheetId, editorDispatch, project.sheets, workspaceMode]);

  return (
    <div
      className={styles.layout}
      style={{
        '--layout-sidebar-width': isSidebarCollapsed ? '0px' : 'var(--sidebar-width)',
        '--layout-properties-width': isPropertiesCollapsed ? '0px' : 'var(--properties-width)',
      }}
    >
      <div className={styles.toolbar}>
        <Toolbar
          onNew={handleNew}
          onSave={handleSave}
          onLoad={handleLoadClick}
          isSidebarCollapsed={isSidebarCollapsed}
          isPropertiesCollapsed={isPropertiesCollapsed}
          onToggleSidebar={onToggleSidebar}
          onToggleProperties={onToggleProperties}
        />
      </div>
      <div className={`${styles.sidebar} ${isSidebarCollapsed ? styles.panelHidden : ''}`}>
        <Sidebar />
      </div>
      <div className={styles.canvas}>
        {workspaceMode === 'sheet' ? <SheetCanvas /> : <SvgCanvas />}
      </div>
      <div className={`${styles.properties} ${isPropertiesCollapsed ? styles.panelHidden : ''}`}>
        <PropertiesPanel />
      </div>
    </div>
  );
}

function AppInner() {
  const { project, isDirty, dispatch } = useProject();
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedProjects, setSavedProjects] = useState([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(false);

  useAutosave(project, isDirty, dispatch);

  // beforeunload warning
  useEffect(() => {
    const handler = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleNew = useCallback(() => {
    if (isDirty && !window.confirm('Unsaved changes will be lost. Continue?')) return;
    dispatch({ type: 'PROJECT_NEW', project: createProject() });
  }, [isDirty, dispatch]);

  const handleSave = useCallback(async () => {
    await saveProject(project);
    dispatch({ type: 'MARK_SAVED' });
  }, [project, dispatch]);

  // Ctrl+S save
  useEffect(() => {
    const handler = (e) => {
      if (isTypingTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
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

  const handleLoad = useCallback(async (id) => {
    if (isDirty && !window.confirm('Unsaved changes will be lost. Continue?')) return;
    try {
      const { project: loaded, savedAt } = await loadProject(id);
      dispatch({ type: 'PROJECT_LOAD', project: loaded, savedAt });
      setShowLoadModal(false);
    } catch (err) {
      alert('Failed to load project: ' + err.message);
    }
  }, [isDirty, dispatch]);

  const handleDelete = useCallback(async (id, name) => {
    const confirmed = window.confirm(`Delete "${name}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await deleteProject(id);
      setSavedProjects(projects => projects.filter(project => project.id !== id));
    } catch (err) {
      alert('Failed to delete project: ' + err.message);
    }
  }, []);

  const activeFloorId = project.floors[0]?.id;

  return (
    <EditorProvider activeFloorId={activeFloorId}>
      <EditorShell
        project={project}
        handleNew={handleNew}
        handleSave={handleSave}
        handleLoadClick={handleLoadClick}
        isSidebarCollapsed={isSidebarCollapsed}
        isPropertiesCollapsed={isPropertiesCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed(value => !value)}
        onToggleProperties={() => setIsPropertiesCollapsed(value => !value)}
      />

      {showLoadModal && (
        <Modal title="Load Project" onClose={() => setShowLoadModal(false)}>
          {savedProjects.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              No saved projects found.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {savedProjects.map(p => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface-elevated)',
                    fontSize: '13px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                      {new Date(p.savedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleLoad(p.id)}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        background: 'var(--color-surface-elevated)',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid var(--color-danger-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        background: 'var(--color-danger-subtle)',
                        color: 'var(--color-danger)',
                        fontSize: '12px',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowLoadModal(false)}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              background: 'var(--color-surface-elevated)',
            }}
          >
            Cancel
          </button>
        </Modal>
      )}
    </EditorProvider>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <AppInner />
    </ProjectProvider>
  );
}
