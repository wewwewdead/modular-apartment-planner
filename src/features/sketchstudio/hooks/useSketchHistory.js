import { useCallback } from 'react';
import {
  cancelDraft,
  cancelAnchorDrag,
  cancelHandleDrag,
  cancelTransform,
  endPan,
  endSelectionBox,
  undo,
  redo,
} from '../store/sketchStudioActions';

export default function useSketchHistory(state, dispatch) {
  const canUndo = state.history.past.length > 0;
  const canRedo = state.history.future.length > 0;

  const cancelTransientInteraction = useCallback(() => {
    if (state.interaction.mode === 'transform') {
      dispatch(cancelTransform());
      return true;
    }

    if (state.interaction.mode === 'handle-drag') {
      dispatch(cancelHandleDrag());
      return true;
    }

    if (state.interaction.mode === 'anchor-drag') {
      dispatch(cancelAnchorDrag());
      return true;
    }

    if (state.interaction.mode === 'selection-box') {
      dispatch(endSelectionBox());
      return true;
    }

    if (state.interaction.mode === 'panning') {
      dispatch(endPan());
      return true;
    }

    if (state.draft.type && state.draft.type !== 'fillet') {
      dispatch(cancelDraft());
      return true;
    }

    return false;
  }, [state.draft.type, state.interaction.mode, dispatch]);

  const handleUndo = useCallback(() => {
    if (cancelTransientInteraction() || !canUndo) {
      return;
    }

    dispatch(undo());
  }, [canUndo, cancelTransientInteraction, dispatch]);

  const handleRedo = useCallback(() => {
    if (!canRedo) {
      return;
    }

    dispatch(redo());
  }, [canRedo, dispatch]);

  return {
    canUndo,
    canRedo,
    cancelTransientInteraction,
    handleUndo,
    handleRedo,
  };
}
