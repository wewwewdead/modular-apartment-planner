import { useEffect, useLayoutEffect, useState } from 'react';

/*
 * Kept out of the hooks on purpose: a lazy initializer runs once, so reading
 * the clock there is not the render-time impurity the lint rule guards against.
 */
function msSince(since) {
  return typeof since === 'number' ? performance.now() - since : 0;
}

function clockNow() {
  return performance.now();
}

/*
 * The last click or key press, in `performance.now()` terms (an event's
 * timeStamp is on the same clock). A wait a click started is timed from that
 * click — the moment the user began waiting — not from whenever the component
 * that shows it got to mount, which can be a busy frame or two later.
 */
let lastInputAt = null;
const RECENT_INPUT_MS = 1000;
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const noteInput = (event) => {
    lastInputAt = event.timeStamp;
  };
  window.addEventListener('click', noteInput, { capture: true, passive: true });
  window.addEventListener('keydown', noteInput, { capture: true, passive: true });
}

/** The moment a wait began, for `since`: the click that started it, or now. */
export function loadingClock() {
  const now = clockNow();
  return lastInputAt !== null && now - lastInputAt >= 0 && now - lastInputAt < RECENT_INPUT_MS ? lastInputAt : now;
}

/**
 * True once `active` has held for `delayMs`, and — once true — for at least
 * `minVisibleMs`, even if `active` drops sooner. That pair is what keeps a
 * loading state from flashing on a fast wait and from flickering off a slow
 * one (§3 rule 5).
 *
 * `since` measures the delay from an earlier moment than this mount, so a
 * placeholder that is swapped for another mid-wait (a Suspense fallback
 * handing over to the panel's own) keeps one timeline instead of restarting.
 */
export function useDelayedFlag(active, { delayMs = 0, minVisibleMs = 0, since } = {}) {
  const [shownAt, setShownAt] = useState(() => (active && msSince(since) >= delayMs ? clockNow() : null));
  const shown = shownAt !== null;

  useEffect(() => {
    if (active && !shown) {
      const wait = Math.max(0, delayMs - msSince(since));
      const timer = setTimeout(() => setShownAt(clockNow()), wait);
      return () => clearTimeout(timer);
    }
    if (!active && shown) {
      const remaining = Math.max(0, minVisibleMs - (clockNow() - shownAt));
      const timer = setTimeout(() => setShownAt(null), remaining);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [active, shown, shownAt, delayMs, minVisibleMs, since]);

  return shown;
}

/**
 * Hands a loading element's timing to the compositor, so it holds even while
 * the main thread is busy — which, during a load, it usually is.
 *
 * The words' reveal and the outline's breathing are CSS animations. A CSS
 * animation starts on the first frame after its element is styled, which on a
 * busy page can be a long way behind schedule — so their start times are
 * pinned here instead, through the element's own animation objects: the
 * reveal to `since` (its CSS delay, `--words-delay`, then lands it exactly
 * `delayMs` after the wait began, whenever this element mounted), the breath
 * to the document's time origin (every outline on one shared cycle, so a
 * placeholder taking over from another mid-wait carries on the same breath).
 *
 * Also answers whether this mount is the start of the wait (`entering`): a
 * placeholder that takes over from another one must not fade in from nothing.
 */
export function useCompositorTiming(ref, { since, delayMs = 0 } = {}) {
  const [entering] = useState(() => msSince(since) < 120);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty('--words-delay', `${Math.max(0, Math.round(delayMs))}ms`);
    if (typeof node.getAnimations !== 'function') return;
    for (const animation of node.getAnimations({ subtree: true })) {
      const name = animation.animationName || '';
      if (/Reveal/.test(name) && typeof since === 'number') animation.startTime = since;
      else if (/Breathe/.test(name)) animation.startTime = 0;
    }
    // Once per wait: the pinned times are absolute, and reading animations
    // forces a style pass a busy page should not pay on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since, delayMs]);
  return entering;
}

/**
 * Keeps something mounted for `exitMs` after it stops being wanted, so its
 * exit can be a fade rather than a hard cut. `leaving` is the fade window.
 */
export function usePresence(present, exitMs = 300) {
  const [mounted, setMounted] = useState(present);
  if (present && !mounted) setMounted(true);

  useEffect(() => {
    if (present || !mounted) return undefined;
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [present, mounted, exitMs]);

  return { mounted: present || mounted, leaving: mounted && !present };
}
