import { lazy, Suspense } from 'react';
import { ClipboardProvider } from '@/app/ClipboardProvider';
import Modal from '@/ui/Modal';
import NewProjectModal from '@/ui/NewProjectModal';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import styles from '@/app/App.module.css';
import modalStyles from '@/ui/Modal.module.css';
import { FloorplanProvider, useEditor, useFloorplanContext } from './context/FloorplanContext';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import PropertiesPanel from './components/PropertiesPanel';
import SvgCanvas from './components/renderers/SvgCanvas';
import SheetCanvas from './components/renderers/SheetCanvas';

const ThreePreviewPanel = lazy(() => import('./components/preview/ThreePreviewPanel'));

function EditorShell({
  project,
  onNew,
  onSave,
  onLoad,
  isSidebarCollapsed,
  isPropertiesCollapsed,
  onToggleSidebar,
  onToggleProperties,
}) {
  const { workspaceMode, activeFloorId, maximizedPanel, dispatch } = useEditor();

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
          onNew={onNew}
          onSave={onSave}
          onLoad={onLoad}
          isSidebarCollapsed={isSidebarCollapsed}
          isPropertiesCollapsed={isPropertiesCollapsed}
          onToggleSidebar={onToggleSidebar}
          onToggleProperties={onToggleProperties}
        />
      </div>
      <div className={`${styles.sidebar} ${isSidebarCollapsed ? styles.panelHidden : styles.sidebarVisible}`}>
        <Sidebar />
      </div>
      <div className={styles.canvas}>
        {workspaceMode === 'sheet' ? (
          <SheetCanvas />
        ) : (
          <div className={`${styles.modelWorkspace} ${maximizedPanel ? styles.workspaceMaximized : ''}`}>
            {maximizedPanel !== 'preview' && (
              <div className={styles.primaryCanvas}>
                <SvgCanvas />
              </div>
            )}
            {maximizedPanel !== 'canvas' && (
              <div className={styles.preview}>
                <Suspense fallback={<div className={styles.previewFallback}>Loading 3D preview...</div>}>
                  <ThreePreviewPanel
                    project={project}
                    activeFloorId={activeFloorId}
                    isMaximized={maximizedPanel === 'preview'}
                    onToggleMaximize={() => dispatch({ type: 'TOGGLE_MAXIMIZE_PANEL', panel: 'preview' })}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}
      </div>
      <div className={`${styles.properties} ${isPropertiesCollapsed ? styles.panelHidden : styles.propertiesVisible}`}>
        <PropertiesPanel />
      </div>
    </div>
  );
}

function FloorplanShell() {
  const { state, actions, selectors } = useFloorplanContext();
  const { showLoadModal, showNewProjectModal, savedProjects, isSidebarCollapsed, isPropertiesCollapsed } =
    selectors.workspaceUi;
  const { importInputRef } = selectors.workspaceRefs;

  return (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        onChange={actions.project.importProjectFile}
        style={{ display: 'none' }}
      />

      <EditorShell
        project={state.project}
        onNew={actions.project.newProject}
        onSave={actions.project.saveProject}
        onLoad={actions.workspace.openLoadModal}
        isSidebarCollapsed={isSidebarCollapsed}
        isPropertiesCollapsed={isPropertiesCollapsed}
        onToggleSidebar={actions.workspace.toggleSidebar}
        onToggleProperties={actions.workspace.toggleProperties}
      />

      {showNewProjectModal && (
        <NewProjectModal onConfirm={actions.project.createProject} onClose={actions.workspace.closeNewProjectModal} />
      )}

      {showLoadModal && (
        <Modal title="Open Project" onClose={actions.workspace.closeLoadModal}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className={modalStyles.modalCard}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className={modalStyles.modalCardTitle}>Project File</span>
                <span className={modalStyles.modalCardDesc}>Open a JSON file previously saved to your computer.</span>
              </div>
              <button
                className={modalStyles.modalBtn}
                onClick={actions.project.openProjectFile}
                style={{ alignSelf: 'flex-start' }}
              >
                Open Project File
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className={modalStyles.modalCardTitle}>Browser Drafts</span>
                <span className={modalStyles.modalCardDesc} style={{ fontSize: '11px' }}>
                  Stored only in this browser on this machine.
                </span>
              </div>
              {savedProjects.length === 0 ? (
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', margin: 0 }}>
                  No browser drafts found.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {savedProjects.map((savedProject) => (
                    <div
                      key={savedProject.id}
                      className={modalStyles.modalCard}
                      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 500, fontSize: '13px' }}>{savedProject.name}</span>
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                          {new Date(savedProject.savedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className={modalStyles.modalBtn}
                          onClick={() => actions.project.loadDraft(savedProject.id)}
                        >
                          Load
                        </button>
                        <button
                          className={modalStyles.modalBtnDanger}
                          onClick={() => actions.project.deleteDraft(savedProject.id, savedProject.name)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            className={modalStyles.modalBtn}
            onClick={actions.workspace.closeLoadModal}
            style={{ marginTop: '16px' }}
          >
            Cancel
          </button>
        </Modal>
      )}
    </>
  );
}

export default function FloorplanWorkspace({ initialProject, isPlayground = false }) {
  return (
    <div className="editorRoot">
      <ClipboardProvider>
        <ConfirmDialogProvider>
          <FloorplanProvider initialProject={initialProject} isPlayground={isPlayground}>
            <FloorplanShell />
          </FloorplanProvider>
        </ConfirmDialogProvider>
      </ClipboardProvider>
    </div>
  );
}
