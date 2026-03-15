import { useEffect } from 'react';
import { saveSketchProject } from './sketchStorage';

const AUTOSAVE_DELAY = 5000;

export function useSketchAutosave(project, isDirty, dispatch) {
  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(async () => {
      try {
        await saveSketchProject(project);
        dispatch({ type: 'MARK_SAVED' });
      } catch {
        // Autosave failed silently — user can still manual save
      }
    }, AUTOSAVE_DELAY);

    return () => clearTimeout(timer);
  }, [project, isDirty, dispatch]);
}
