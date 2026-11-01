import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardProvider } from '@/app/ClipboardProvider';
import Modal from '@/ui/Modal';
import NewProjectModal from '@/ui/NewProjectModal';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import styles from '@/app/App.module.css';
import { ChevronDownIcon, ChevronUpIcon } from '@/ui/ToolbarIcons';
import modalStyles from '@/ui/Modal.module.css';
import { FloorplanProvider, useEditorState, useFloorplanContext, useToolState } from './context/FloorplanContext';
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

/*
 * Escape leaves focus mode — but the canvas tools get first refusal.
 *
 * On the canvas, Escape already means something: it drops a drag, clears a wall
 * chain, aborts a paste. So focus mode stands aside whenever one of those is in
 * flight, and you press Escape twice — once to cancel what you were doing, once
 * to come back out. That is the order people expect.
 *
 * The list below is of *in-progress markers*, deliberately not "is a placement
 * tool active". Tools do not all return to select on Escape — the wall tool
 * clears its chain and stays on the wall tool — so keying off the active tool
 * would mean the keyboard could never leave focus again. Every marker here is
 * cleared by the very Escape that was withheld, which is what guarantees the
 * second press gets through and focus can never trap you.
 *
 * This listener belongs to a parent, and React flushes child effects first, so
 * the canvas has already had its turn at the key by the time this runs.
 *
 * It lives in its own component because the markers it reads are rewritten on
 * every pointer frame of a placement tool, and the shell it used to sit in
 * renders the entire workspace. Reading them through a ref keeps the window
 * listener from being re-subscribed frame by frame as well.
 */
function FocusEscapeGuard({ focusedPanel }) {
  const { pastePreview, dispatch } = useEditorState();
  const toolState = useToolState();
  const markersRef = useRef(null);

  useEffect(() => {
    markersRef.current = { toolState, pastePreview };
  });

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;

      if (focusedPanel === 'canvas') {
        const markers = markersRef.current || {};
        const activeToolState = markers.toolState || {};
        const cancellingSomething =
          markers.pastePreview?.active ||
          activeToolState.dragging ||
          activeToolState.pendingDrag ||
          activeToolState.start ||
          activeToolState.chainStart ||
          activeToolState.startColumnId;
        if (cancellingSomething) return;
      }

      dispatch({ type: 'TOGGLE_FOCUS_PANEL', panel: null });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedPanel, dispatch]);

  return null;
}

const SIDEBAR_WIDTH_KEY = 'floorplan.sidebar.width';
const SIDEBAR_WIDTH_DEFAULT = 256;
const SIDEBAR_WIDTH_MIN = 240;
const SIDEBAR_WIDTH_MAX = 420;
const SIDEBAR_WIDTH_STEP = 16;
const OVERLAY_BREAKPOINT = '(max-width: 1024px)';

function clampSidebarWidth(width) {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));
}

function readSidebarWidth() {
  try {
    const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return stored > 0 ? clampSidebarWidth(stored) : SIDEBAR_WIDTH_DEFAULT;
  } catch {
    return SIDEBAR_WIDTH_DEFAULT; // private mode or blocked storage: the default is fine
  }
}

function writeSidebarWidth(width) {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {
    /* the width still applies, it just is not remembered */
  }
}

/** True while the window is at the width where the sidebar becomes an overlay. */
function useOverlayBreakpoint() {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(OVERLAY_BREAKPOINT).matches),
  );
  useEffect(() => {
    const query = window.matchMedia?.(OVERLAY_BREAKPOINT);
    if (!query) return undefined;
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return matches;
}

/*
 * The sidebar's grab strip. A drag writes `--layout-sidebar-width` straight
 * onto the layout element, at most once a frame, and only hands the width to
 * React on release: re-rendering the shell renders the whole workspace, which
 * is far too much to do per pointer frame. Nothing here touches the floorplan
 * store.
 */
function SidebarResizer({ width, layoutRef, onCommit }) {
  const dragRef = useRef(null);

  const apply = (strip, next) => {
    layoutRef.current?.style.setProperty('--layout-sidebar-width', `${next}px`);
    strip.setAttribute('aria-valuenow', String(next));
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const strip = event.currentTarget;
    strip.setPointerCapture(event.pointerId);
    strip.dataset.dragging = 'true';
    dragRef.current = { startX: event.clientX, startWidth: width, next: width, frame: 0 };
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.next = clampSidebarWidth(drag.startWidth + event.clientX - drag.startX);
    if (drag.frame) return;
    const strip = event.currentTarget;
    drag.frame = window.requestAnimationFrame(() => {
      drag.frame = 0;
      apply(strip, drag.next);
    });
  };

  const finishDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const strip = event.currentTarget;
    if (drag.frame) window.cancelAnimationFrame(drag.frame);
    if (strip.hasPointerCapture?.(event.pointerId)) strip.releasePointerCapture(event.pointerId);
    delete strip.dataset.dragging;
    apply(strip, drag.next);
    onCommit(drag.next);
  };

  const handleKeyDown = (event) => {
    const steps = { ArrowLeft: -SIDEBAR_WIDTH_STEP, ArrowRight: SIDEBAR_WIDTH_STEP };
    if (event.key in steps) onCommit(clampSidebarWidth(width + steps[event.key]));
    else if (event.key === 'Home') onCommit(SIDEBAR_WIDTH_MIN);
    else if (event.key === 'End') onCommit(SIDEBAR_WIDTH_MAX);
    else return;
    event.preventDefault();
  };

  return (
    <div
      className={styles.sidebarResizer}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={SIDEBAR_WIDTH_MAX}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize the sidebar · double-click to reset"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onDoubleClick={() => onCommit(SIDEBAR_WIDTH_DEFAULT)}
      onKeyDown={handleKeyDown}
    />
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
  const { workspaceMode, activeFloorId, focusedPanel, wallDetailEditor, ceilingDetailEditor, dispatch } =
    useEditorState();

  /*
   * A detail editor is an overlay, and this whole shell stays mounted under it.
   * That is what makes the plan's own 3D preview expensive at exactly the wrong
   * moment: every edit committed in the editor changes the project, and the
   * preview behind the overlay answers by rebuilding its scene and then
   * refining it — several seconds of frames, at tens of milliseconds each,
   * spent on a picture that is completely covered up, out of the same budget as
   * the pane the pointer is in. Suspending it rather than unmounting it keeps
   * the camera and the walk pose, and it catches up in one rebuild on the way
   * back out.
   */
  const isCoveredByDetailEditor = Boolean(wallDetailEditor || ceilingDetailEditor);

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

  const handleTogglePreviewFocus = useCallback(
    () => dispatch({ type: 'TOGGLE_FOCUS_PANEL', panel: 'preview' }),
    [dispatch],
  );

  // The sidebar's user-set width. Under the overlay breakpoint the sidebar
  // floats at --sidebar-width regardless, so the stored width only applies to
  // the docked layout.
  const layoutRef = useRef(null);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const isOverlayLayout = useOverlayBreakpoint();
  const commitSidebarWidth = useCallback((width) => {
    setSidebarWidth(width);
    writeSidebarWidth(width);
  }, []);
  const showSidebarResizer = !isFocused && !isSidebarCollapsed && !isOverlayLayout;

  return (
    <div
      ref={layoutRef}
      className={`${styles.layout} ${isFocused ? styles.layoutFocused : ''} ${
        isToolbarHidden ? styles.layoutToolbarHidden : ''
      }`}
      style={{
        // In focus mode the panels float over the pane rather than taking a
        // column from it, so the grid tracks collapse either way.
        '--layout-sidebar-width': isSidebarCollapsed || isFocused ? '0px' : `${sidebarWidth}px`,
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
      {showSidebarResizer && (
        <SidebarResizer width={sidebarWidth} layoutRef={layoutRef} onCommit={commitSidebarWidth} />
      )}
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
                    onToggleFocus={handleTogglePreviewFocus}
                    suspended={isCoveredByDetailEditor}
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
      {isFocused && <FocusEscapeGuard focusedPanel={focusedPanel} />}
    </div>
  );
}

const MemoizedEditorShell = memo(EditorShell);

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

      <MemoizedEditorShell
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
