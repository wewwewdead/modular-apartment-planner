import { memo, useLayoutEffect, useRef } from 'react';
import styles from './StatusBar.module.css';
import { roundWorldValue } from '../utils/canvasMath';
import { SHORTCUT_OVERLAY_TOGGLE_KEY } from '../utils/shortcutManifest';

function getToolLabel(activeTool, tools) {
  return tools.find((tool) => tool.id === activeTool)?.label ?? activeTool;
}

const formatCursorX = (world) => `X ${roundWorldValue(world.x).toFixed(1)}`;
const formatCursorY = (world) => `Y ${roundWorldValue(world.y).toFixed(1)}`;

/**
 * X / Y of the cursor, written straight into the two spans from the cursor
 * channel on every pointer move (see `hooks/cursorChannel.js`). Each span has
 * one text child computed from the channel at render, so a re-render produces
 * what the channel last wrote and React leaves the node alone.
 */
const CursorReadout = memo(function CursorReadout({ cursorChannel }) {
  const xRef = useRef(null);
  const yRef = useRef(null);

  useLayoutEffect(() => {
    const write = (channel) => {
      if (xRef.current) xRef.current.textContent = formatCursorX(channel.world);
      if (yRef.current) yRef.current.textContent = formatCursorY(channel.world);
    };
    // A move between this render and the subscription is not lost.
    write(cursorChannel);
    return cursorChannel.subscribe(write);
  }, [cursorChannel]);

  return (
    <>
      <span ref={xRef} className="sketchStudioStatusItem">
        {formatCursorX(cursorChannel.world)}
      </span>
      <span ref={yRef} className="sketchStudioStatusItem">
        {formatCursorY(cursorChannel.world)}
      </span>
    </>
  );
});

function StatusBar({
  zoom,
  cursorChannel,
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
        <CursorReadout cursorChannel={cursorChannel} />
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
