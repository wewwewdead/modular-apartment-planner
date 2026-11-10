import { useEffect } from 'react';
import { saveProject } from './storage';

const AUTOSAVE_DELAY = 5000;

// `version` is the store's change version for this `project`: the save names
// it, so an edit that lands while the write is awaited is not marked saved.
export function useAutosave(project, isDirty, dispatch, onError, onSaved, version) {
  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(async () => {
      try {
        await saveProject(project);
        dispatch({ type: 'MARK_SAVED', version });
        if (onSaved) onSaved(project);
      } catch (err) {
        console.warn('[autosave] Failed to save project:', err);
        if (onError) onError(err);
      }
    }, AUTOSAVE_DELAY);

    return () => clearTimeout(timer);
  }, [project, isDirty, dispatch, onError, onSaved, version]);
}
