import { startTransition, useCallback, useEffect, useRef } from 'react';

/** How long the RCP has to sit idle before the coordination models catch up. */
export const COORDINATION_SETTLE_DELAY_MS = 1500;

const SETTLE_ACTION = Object.freeze({ type: 'END_DRAG_GESTURE', settleDeferred: true });

/**
 * The other half of `coordination: 'defer'` (see `createDragGesture` in the
 * floorplan reducer).
 *
 * The ceiling editor sends every assembly edit deferred, because none of the
 * whole-project coordination models reads a ceiling's boards, screws or lights
 * and the pass cost ~100 ms per click. Deferred is not skipped, though: the
 * lifecycle panels and the status-bar issue count under the overlay still have
 * to catch up. They do so once the editor has been idle for
 * COORDINATION_SETTLE_DELAY_MS after its last deferred commit — a run of
 * placements settles once, after the run — and straight away when the editor
 * closes or unmounts, so nothing outside it is ever left stale.
 *
 * Returns the function to call after each deferred dispatch.
 */
export function useDeferredCoordination(dispatch, active = true) {
  const timerRef = useRef(null);
  const pendingRef = useRef(false);

  const settleNow = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!pendingRef.current) return;
    pendingRef.current = false;
    // A transition, like the commits it settles: the pass itself is one call,
    // but everything that re-renders on the fresh models can be sliced.
    startTransition(() => dispatch(SETTLE_ACTION));
  }, [dispatch]);

  const scheduleSettle = useCallback(() => {
    pendingRef.current = true;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(settleNow, COORDINATION_SETTLE_DELAY_MS);
  }, [settleNow]);

  // Closing the editor (it renders nothing once the editor state lets go of the
  // ceiling) and unmounting both settle whatever is still pending.
  useEffect(() => {
    if (!active) settleNow();
  }, [active, settleNow]);
  useEffect(() => settleNow, [settleNow]);

  return scheduleSettle;
}
