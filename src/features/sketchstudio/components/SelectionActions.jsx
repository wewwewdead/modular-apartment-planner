import { memo } from 'react';

function SelectionActions({
  isBrokenLineSelection,
  canGroupSelection,
  canUngroupSelection,
  onRotateLeft,
  onRotateRight,
  onFlipHorizontal,
  onFlipVertical,
  onToggleBrokenLines,
  onGroupSelection,
  onUngroupSelection,
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
      {canGroupSelection && (
        <button type="button" className="sketchStudioInlineButton" onClick={onGroupSelection}>
          Group
        </button>
      )}
      {canUngroupSelection && (
        <button type="button" className="sketchStudioInlineButton" onClick={onUngroupSelection}>
          De-group
        </button>
      )}
    </div>
  );
}

export default memo(SelectionActions);
