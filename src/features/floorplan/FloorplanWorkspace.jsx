import { lazy, Suspense, useEffect, useState } from 'react';
import { ClipboardProvider } from '@/app/ClipboardProvider';
import Modal from '@/ui/Modal';
import NewProjectModal from '@/ui/NewProjectModal';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import styles from '@/app/App.module.css';
import { ChevronDownIcon, ChevronUpIcon } from '@/ui/ToolbarIcons';
import modalStyles from '@/ui/Modal.module.css';
import { FloorplanProvider, useEditor, useFloorplanContext } from './context/FloorplanContext';
import { DaylightStudyProvider } from './context/DaylightStudyContext';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import PropertiesPanel from './components/PropertiesPanel';
import SvgCanvas from './components/renderers/SvgCanvas';
import SheetCanvas from './components/renderers/SheetCanvas';
import WallDetailEditor from './components/wall-detail/WallDetailEditor';
import CeilingDetailEditor from './components/ceiling-detail/CeilingDetailEditor';

const ThreePreviewPanel = lazy(() => import('./components/preview/ThreePreviewPanel'));

/** How long the way out stays on screen after entering focus mode. */
const FOCUS_HINT_LIFETIME_MS = 2600;

/**
 * A moment's reminder of how to get back.
 *
 * Focus mode removes every piece of chrome, which is the point of it and also
 * the problem with it: the only remaining exits are Escape and a small button
 * in a corner. Showing the shortcut once, briefly, on entry costs nothing and
 * means nobody has to guess. Its caller keys it on the focused pane, so
 * switching panes remounts it and shows the hint again — that is a fresh act of
 * entering, and remounting beats resetting state from inside an effect.
 */
function FocusExitHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), FOCUS_HINT_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.focusHint} role="status">
      Press <kbd className={styles.focusHintKey}>Esc</kbd> to exit focus
    </div>
  );
}

function EditorShell({
  project,
  onNew,
  onSave,
  onShare,
  onLoad,
  isSidebarCollapsed,
  isPropertiesCollapsed,
  onToggleSidebar,
  onToggleProperties,
}) {
  const { workspaceMode, activeFloorId, focusedPanel, toolState, pastePreview, dispatch } = useEditor();

  // Focus only means anything over the model workspace; the sheet view has no
  // second pane to choose between.
  const isFocused = workspaceMode === 'model' && Boolean(focusedPanel);

  /*
   * Focus mode keeps the toolbar, because a pane you cannot draw on is not a
   * workspace. It can still be folded away for a completely clean view, which
   * is what the tab under it does.
   *
   * Only ever hidden *inside* focus mode — the split view always has its
   * toolbar — so the flag is read through `isFocused` rather than reset when
   * focus ends. Within a session the choice sticks, and the tab to bring it
   * back sits exactly where it went.
   */
  const [toolbarHiddenInFocus, setToolbarHiddenInFocus] = useState(false);
  const isToolbarHidden = isFocused && toolbarHiddenInFocus;

  /*
   * Escape leaves focus mode — but the canvas tools get first refusal.
   *
   * On the canvas, Escape already means something: it drops a drag, clears a
   * wall chain, aborts a paste. So focus mode stands aside whenever one of
   * those is in flight, and you press Escape twice — once to cancel what you
   * were doing, once to come back out. That is the order people expect.
   *
   * The list below is of *in-progress markers*, deliberately not "is a
   * placement tool active". Tools do not all return to select on Escape — the
   * wall tool clears its chain and stays on the wall tool — so keying off the
   * active tool would mean the keyboard could never leave focus again. Every
   * marker here is cleared by the very Escape that was withheld, which is what
   * guarantees the second press gets through and focus can never trap you.
   *
   * This listener belongs to a parent, and React flushes child effects first,
   * so the canvas has already had its turn at the key by the time this runs.
   */
  useEffect(() => {
    if (!isFocused) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;

      if (focusedPanel === 'canvas') {
        const cancellingSomething =
          pastePreview?.active ||
          toolState?.dragging ||
          toolState?.pendingDrag ||
          toolState?.start ||
          toolState?.chainStart ||
          toolState?.startColumnId;
        if (cancellingSomething) return;
      }

      dispatch({ type: 'TOGGLE_FOCUS_PANEL', panel: null });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, focusedPanel, toolState, pastePreview, dispatch]);

  return (
    <div
      className={`${styles.layout} ${isFocused ? styles.layoutFocused : ''} ${
        isToolbarHidden ? styles.layoutToolbarHidden : ''
      }`}
      style={{
        // In focus mode the panels float over the pane rather than taking a
        // column from it, so the grid tracks collapse either way.
        '--layout-sidebar-width': isSidebarCollapsed || isFocused ? '0px' : 'var(--sidebar-width)',
        '--layout-properties-width': isPropertiesCollapsed || isFocused ? '0px' : 'var(--properties-width)',
      }}
    >
      {!isToolbarHidden && (
        <div className={styles.toolbar}>
          <Toolbar
            onNew={onNew}
            onSave={onSave}
            onShare={onShare}
            onLoad={onLoad}
            isSidebarCollapsed={isSidebarCollapsed}
            isPropertiesCollapsed={isPropertiesCollapsed}
            onToggleSidebar={onToggleSidebar}
            onToggleProperties={onToggleProperties}
          />
        </div>
      )}
      <div
        className={`${styles.sidebar} ${
          isSidebarCollapsed ? (isFocused ? '' : styles.panelHidden) : styles.sidebarVisible
        }`}
      >
        <Sidebar />
      </div>
      <div className={styles.canvas}>
        {workspaceMode === 'sheet' ? (
          <SheetCanvas />
        ) : (
          <div className={`${styles.modelWorkspace} ${focusedPanel ? styles.workspaceMaximized : ''}`}>
            {focusedPanel !== 'preview' && (
              <div className={styles.primaryCanvas}>
                <SvgCanvas />
              </div>
            )}
            {focusedPanel !== 'canvas' && (
              <div className={styles.preview}>
                <Suspense fallback={<div className={styles.previewFallback}>Loading 3D preview...</div>}>
                  <ThreePreviewPanel
                    project={project}
                    activeFloorId={activeFloorId}
                    isFocused={focusedPanel === 'preview'}
                    onToggleFocus={() => dispatch({ type: 'TOGGLE_FOCUS_PANEL', panel: 'preview' })}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}
      </div>
      <div
        className={`${styles.properties} ${
          isPropertiesCollapsed ? (isFocused ? '' : styles.panelHidden) : styles.propertiesVisible
        }`}
      >
        <PropertiesPanel />
      </div>
      {isFocused && (
        <button
          type="button"
          className={`${styles.toolbarTab} ${isToolbarHidden ? styles.toolbarTabRaised : ''}`}
          onClick={() => setToolbarHiddenInFocus((hidden) => !hidden)}
          title={isToolbarHidden ? 'Show toolbar' : 'Hide toolbar'}
          aria-label={isToolbarHidden ? 'Show toolbar' : 'Hide toolbar'}
          aria-expanded={!isToolbarHidden}
        >
          {isToolbarHidden ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </button>
      )}
      {isFocused && <FocusExitHint key={focusedPanel} />}
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
        accept=".json,.apz,.zip,application/json,application/zip"
        onChange={actions.project.importProjectFile}
        style={{ display: 'none' }}
      />

      <EditorShell
        project={state.project}
        onNew={actions.project.newProject}
        onSave={actions.project.saveProject}
        onShare={actions.project.shareProject}
        onLoad={actions.workspace.openLoadModal}
        isSidebarCollapsed={isSidebarCollapsed}
        isPropertiesCollapsed={isPropertiesCollapsed}
        onToggleSidebar={actions.workspace.toggleSidebar}
        onToggleProperties={actions.workspace.toggleProperties}
      />

      {state.editor.wallDetailEditor && <WallDetailEditor />}

      {state.editor.ceilingDetailEditor && <CeilingDetailEditor />}

      {showNewProjectModal && (
        <NewProjectModal onConfirm={actions.project.createProject} onClose={actions.workspace.closeNewProjectModal} />
      )}

      {showLoadModal && (
        <Modal title="Open Project" onClose={actions.workspace.closeLoadModal}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className={modalStyles.modalCard}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className={modalStyles.modalCardTitle}>Project File</span>
                <span className={modalStyles.modalCardDesc}>
                  Open a saved .json project or a shared .apz archive from your computer.
                </span>
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
            {/* Inside the floorplan provider, because the study reads the
                phase-filtered project; outside the shell, because the sidebar
                panel and the canvas overlay must share one result. */}
            <DaylightStudyProvider>
              <FloorplanShell />
            </DaylightStudyProvider>
          </FloorplanProvider>
        </ConfirmDialogProvider>
      </ClipboardProvider>
    </div>
  );
}
