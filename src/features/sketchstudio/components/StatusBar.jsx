import { memo } from 'react';
import styles from './StatusBar.module.css';
import { SHORTCUT_OVERLAY_TOGGLE_KEY } from '../utils/shortcutManifest';

function getToolLabel(activeTool, tools) {
  return tools.find((tool) => tool.id === activeTool)?.label ?? activeTool;
}

function StatusBar({
  zoom,
  cursorWorld,
  activeTool,
  activeLayer,
  tools,
  snap,
  snapPoint,
  orthoEnabled,
  selectedCount,
  activeObjectName,
  selectedProfileCount,
  documentStatus,
  viewMode,
  isometricPlane,
  onShowShortcuts,
}) {
  return (
    <footer className="sketchStudioStatusBar">
      <div className="sketchStudioStatusGroup">
        <span className="sketchStudioStatusItem">Tool {getToolLabel(activeTool, tools)}</span>
        <span className="sketchStudioStatusItem">Layer {activeLayer?.name ?? '-'}</span>
        <span className="sketchStudioStatusItem">Zoom {Math.round(zoom * 100)}%</span>
        <span className="sketchStudioStatusItem">X {cursorWorld.x.toFixed(1)}</span>
        <span className="sketchStudioStatusItem">Y {cursorWorld.y.toFixed(1)}</span>
      </div>
      <div className="sketchStudioStatusGroup">
        <span className="sketchStudioStatusItem">Snap {snap.snapType ?? '-'}</span>
        <span className="sketchStudioStatusItem">
          Snap Pt {snapPoint ? `${snapPoint.x.toFixed(1)}, ${snapPoint.y.toFixed(1)}` : '-'}
        </span>
        <span className="sketchStudioStatusItem">Ortho {orthoEnabled ? 'On' : 'Off'}</span>
        <span className="sketchStudioStatusItem">
          View {viewMode === 'isometric' ? `Iso ${isometricPlane}` : 'Plan'}
        </span>
        <span className="sketchStudioStatusItem">Selected {selectedCount}</span>
        <span className="sketchStudioStatusItem">Profiles {selectedProfileCount}</span>
        <span className="sketchStudioStatusItem">Object {activeObjectName ?? '-'}</span>
        <span className="sketchStudioStatusItem">Sketch {documentStatus ?? 'idle'}</span>
        <span className="sketchStudioStatusHint">Esc cancels, Enter commits exact input</span>
        {onShowShortcuts && (
          <button
            type="button"
            className={styles.shortcutHintBtn}
            onClick={onShowShortcuts}
            title="Show keyboard shortcuts"
          >
            <kbd className={styles.shortcutHintKbd}>{SHORTCUT_OVERLAY_TOGGLE_KEY}</kbd>
            shortcuts
          </button>
        )}
      </div>
    </footer>
  );
}

export default memo(StatusBar);
