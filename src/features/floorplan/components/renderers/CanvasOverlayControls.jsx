import { memo } from 'react';
import { CenterViewIcon, ExpandIcon, CollapseIcon } from '@/ui/ToolbarIcons';
import styles from './SvgCanvas.module.css';

const CanvasOverlayControls = memo(function CanvasOverlayControls({ onResetCenter, onToggleMaximize, isMaximized }) {
  return (
    <div className={styles.overlayControls}>
      <button
        type="button"
        className={styles.overlayBtn}
        onClick={onResetCenter}
        title="Reset center point"
        aria-label="Reset center point"
      >
        <CenterViewIcon />
      </button>
      <button
        type="button"
        className={styles.overlayBtn}
        onClick={onToggleMaximize}
        title={isMaximized ? 'Restore split view' : 'Maximize canvas'}
        aria-label={isMaximized ? 'Restore split view' : 'Maximize canvas'}
      >
        {isMaximized ? <CollapseIcon /> : <ExpandIcon />}
      </button>
    </div>
  );
});

export default CanvasOverlayControls;
