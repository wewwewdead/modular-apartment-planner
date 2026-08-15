import { MAX_ARRAY_COUNT } from '../utils/arrayUtils';
import { cancelDraft, setDocumentEntities, setSelection, showToast } from '../store/sketchStudioActions';

/**
 * Commit a mirror/array result.
 *
 * One entity write, so the whole operation is a single undo entry however many
 * copies it made. The copies become the selection, and anything that could not
 * be copied (text, dimensions, angle dimensions) is reported once by count
 * instead of silently disappearing.
 */
export function commitSelectionCopyResult(dispatch, result, emptyMessage) {
  if (!result?.createdIds?.length) {
    dispatch(showToast(emptyMessage));
    dispatch(cancelDraft());
    return false;
  }

  dispatch(setDocumentEntities(result.entities));
  dispatch(setSelection(result.createdIds));
  dispatch(cancelDraft());

  if (result.capped) {
    dispatch(showToast(`Array capped at ${MAX_ARRAY_COUNT} copies`));
  } else if (result.skippedEntities?.length) {
    const count = result.skippedEntities.length;
    dispatch(showToast(`${count} annotation${count === 1 ? '' : 's'} skipped: text and dimensions are not copied`));
  }

  return true;
}
