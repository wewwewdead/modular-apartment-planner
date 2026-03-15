import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Guards against losing unsaved changes on both route navigation and tab close.
 * @param {boolean} isDirty - Whether there are unsaved changes.
 */
export function useUnsavedChangesGuard(isDirty) {
  // Guard against React Router navigation (in-app links, back button within SPA)
  useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname &&
      !window.confirm('You have unsaved changes. Leave this page?'),
  );

  // Guard against tab close / browser navigation away
  useEffect(() => {
    const handler = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
