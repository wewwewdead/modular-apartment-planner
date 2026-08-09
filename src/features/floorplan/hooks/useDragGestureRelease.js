import { useEffect } from 'react';

/**
 * Closes an open drag gesture on any pointer release, wherever it lands.
 *
 * A canvas opens a gesture on pointer-down so the drag that follows costs one
 * undo entry and one coordination pass instead of one of each per frame (see
 * `createDragGesture` in the floorplan reducer). Closing it cannot be left to
 * the canvas's own pointer-up handler: a drag released off-canvas, or
 * interrupted by alt-tab, would never settle, and the store would stay in
 * per-frame mode for edits that are not drags at all.
 *
 * Binding at the window closes every one of those paths. The canvas's own
 * handler still runs first — React dispatches at the root container, below
 * window — so a tool that commits on release has committed before the gesture
 * ends. END is a no-op when no gesture is open, which is what most pointer
 * releases in the app are.
 */
export function useDragGestureRelease(dispatch) {
  useEffect(() => {
    const endGesture = () => dispatch({ type: 'END_DRAG_GESTURE' });

    window.addEventListener('pointerup', endGesture);
    window.addEventListener('pointercancel', endGesture);
    window.addEventListener('blur', endGesture);

    return () => {
      window.removeEventListener('pointerup', endGesture);
      window.removeEventListener('pointercancel', endGesture);
      window.removeEventListener('blur', endGesture);
    };
  }, [dispatch]);
}
