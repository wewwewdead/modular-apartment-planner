import { useEffect, useRef } from 'react';
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

  /*
   * Leaving inside the five seconds — a route change, or a render crash that
   * takes the whole workspace down with it — would drop the edits made since
   * the last autosave. The draft is written once more on the way out, best
   * effort: there is nobody left to mark saved or to tell about a failure.
   * Only on unmount; an edit that restarts the timer above is not a leave.
   */
  const latestRef = useRef({ project, isDirty });
  useEffect(() => {
    latestRef.current = { project, isDirty };
  });
  useEffect(
    () => () => {
      const { project: lastProject, isDirty: lastDirty } = latestRef.current;
      if (!lastDirty) return;
      const warn = (err) => console.warn('[autosave] Failed to save project on leaving:', err);
      try {
        Promise.resolve(saveProject(lastProject)).catch(warn);
      } catch (err) {
        warn(err);
      }
    },
    [],
  );
}
