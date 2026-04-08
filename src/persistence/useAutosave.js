import { useEffect } from 'react';
import { saveProject } from './storage';

const AUTOSAVE_DELAY = 5000;

export function useAutosave(project, isDirty, dispatch, onError) {
  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(async () => {
      try {
        await saveProject(project);
        dispatch({ type: 'MARK_SAVED' });
      } catch (err) {
        console.warn('[autosave] Failed to save project:', err);
        if (onError) onError(err);
      }
    }, AUTOSAVE_DELAY);

    return () => clearTimeout(timer);
  }, [project, isDirty, dispatch, onError]);
}
