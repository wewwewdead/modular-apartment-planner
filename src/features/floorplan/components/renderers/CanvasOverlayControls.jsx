import { memo } from 'react';
import { CameraIcon, CenterViewIcon, ExpandIcon, CollapseIcon, PresentationStyleIcon } from '@/ui/ToolbarIcons';
import styles from './SvgCanvas.module.css';

const PRESENTATION_TOOLTIP =
  'Presentation style — tinted zones, solid walls, furniture shading. Off for the drafting line drawing.';

const CanvasOverlayControls = memo(function CanvasOverlayControls({
  onResetCenter,
  onToggleFocus,
  isFocused,
  presentation = false,
  onTogglePresentation,
  onSavePlanImage,
  savingPlanImage = false,
}) {
  return (
    <div className={`${styles.overlayControls} ${isFocused ? styles.overlayControlsFocused : ''}`}>
      {onSavePlanImage ? (
        <button
          type="button"
          className={styles.overlayBtn}
          onClick={onSavePlanImage}
          disabled={savingPlanImage}
          title="Save plan image — the plan as it looks now, as a PNG"
          aria-label="Save plan image"
        >
          <CameraIcon />
        </button>
      ) : null}
      {onTogglePresentation ? (
        <button
          type="button"
          className={`${styles.overlayBtn} ${presentation ? styles.overlayBtnOn : ''}`}
          onClick={onTogglePresentation}
          title={PRESENTATION_TOOLTIP}
          aria-label="Presentation style"
          aria-pressed={presentation}
        >
          <PresentationStyleIcon />
        </button>
      ) : null}
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
