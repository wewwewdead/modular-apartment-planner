import { memo } from 'react';

function SelectionActions({
  isBrokenLineSelection,
  onRotateLeft,
  onRotateRight,
  onFlipHorizontal,
  onFlipVertical,
  onToggleBrokenLines,
}) {
  return (
    <div className="sketchStudioSelectionActions">
      <button type="button" className="sketchStudioInlineButton" onClick={onRotateLeft}>
        Rotate Left
      </button>
      <button type="button" className="sketchStudioInlineButton" onClick={onRotateRight}>
        Rotate Right
      </button>
      <button type="button" className="sketchStudioInlineButton" onClick={onFlipHorizontal}>
        Flip Horizontal
      </button>
      <button type="button" className="sketchStudioInlineButton" onClick={onFlipVertical}>
        Flip Vertical
      </button>
      <button
        type="button"
        className="sketchStudioInlineButton sketchStudioInlineButtonWide"
        onClick={onToggleBrokenLines}
      >
        {isBrokenLineSelection ? 'Use Solid Lines' : 'Use Broken Lines'}
      </button>
    </div>
  );
}

export default memo(SelectionActions);
