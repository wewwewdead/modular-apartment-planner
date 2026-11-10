import { useCallback } from 'react';
import { cancelDraft, undo, redo } from '../store/sketchStudioActions';
import { interactionEndAction } from '../store/interactionEnd';
import { HOVER_DRAFT_TOOLS } from './sketchConstants';

export default function useSketchHistory(state, dispatch) {
  const canUndo = state.history.past.length > 0;
  const canRedo = state.history.future.length > 0;

  const cancelTransientInteraction = useCallback(() => {
    const endAction = interactionEndAction(state.interaction.mode, 'undo');
    if (endAction) {
      dispatch(endAction);
      return true;
    }

    if (state.draft.type && !HOVER_DRAFT_TOOLS.has(state.draft.type)) {
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
