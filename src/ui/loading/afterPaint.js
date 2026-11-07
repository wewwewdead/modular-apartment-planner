import { useEffect, useRef } from 'react';

/*
 * A hidden tab runs no animation frames at all; a wait that only resolved on
 * one would hang there. Past this the paint is presumed to have happened.
 */
const PAINT_FALLBACK_MS = 120;

/**
 * Resolves after the current commit has been painted: two animation frames —
 * the first runs before the frame that shows the commit, the second only once
 * that frame is on screen. Heavy work queued behind it can no longer sit
 * between a click and its first visible answer (§3 rule 2).
 */
export function afterPaint() {
  return new Promise((resolve) => {
    let fallback = 0;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      resolve();
    };
    fallback = setTimeout(done, PAINT_FALLBACK_MS);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(done));
    }
  });
}

/**
 * Runs `callback` once the render that scheduled it has painted. Re-arms when
 * `deps` change; a change or an unmount before the paint cancels it.
 */
export function useAfterPaint(callback, deps) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    let cancelled = false;
    afterPaint().then(() => {
      if (!cancelled) callbackRef.current?.();
    });
    return () => {
      cancelled = true;
    };
    // The caller's deps are the contract, exactly as for useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
