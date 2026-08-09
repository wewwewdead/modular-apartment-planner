import { memo } from 'react';
import { CenterViewIcon, ExpandIcon, CollapseIcon } from '@/ui/ToolbarIcons';
import styles from './SvgCanvas.module.css';

const CanvasOverlayControls = memo(function CanvasOverlayControls({ onResetCenter, onToggleFocus, isFocused }) {
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
        className={`${styles.overlayBtn} ${isFocused ? styles.overlayBtnFocused : ''}`}
        onClick={onToggleFocus}
        title={isFocused ? 'Exit focus mode (Esc)' : 'Focus canvas — fills the window'}
        aria-label={isFocused ? 'Exit focus mode' : 'Focus canvas'}
        aria-pressed={isFocused}
      >
        {isFocused ? <CollapseIcon /> : <ExpandIcon />}
      </button>
    </div>
  );
});

export default CanvasOverlayControls;
