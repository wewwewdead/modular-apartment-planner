/**
 * When a resize of the preview pane actually reaches the renderer.
 *
 * A splitter or sidebar drag fires the pane's `ResizeObserver` on every frame,
 * and every resize reallocates the whole offscreen chain — the multisampled
 * scene target, the occlusion buffers, the accumulation — to land one frame
 * that the next callback throws away. Twenty frames of dragging was twenty
 * reallocations for one final size.
 *
 * So a burst of resizes is coalesced. The first one of a burst is applied at
 * once — opening a pane, or a single window snap, must not wait — and the rest
 * only once the size has been still for `settleMs`. In between, the canvas is
 * simply stretched by CSS (it is sized `100%` of its pane), so for a few frames
 * of a splitter drag the picture is scaled rather than re-rendered; it snaps
 * back to sharp as soon as the drag stops.
 *
 * Pure apart from the clock and timer it is handed, so the policy is testable
 * with fake ones.
 */

/** How long the pane must hold one size before the renderer follows it. */
export const RESIZE_SETTLE_MS = 120;

export function createResizeCoalescer({
  apply,
  settleMs = RESIZE_SETTLE_MS,
  now = () => performance.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (handle) => clearTimeout(handle),
}) {
  let timer = null;
  // When the renderer last followed the pane; -Infinity so the very first
  // resize is applied at once.
  let lastAppliedAt = -Infinity;

  const flush = () => {
    timer = null;
    lastAppliedAt = now();
    apply();
  };

  return {
    /** The pane changed size (a `ResizeObserver` callback). */
    request() {
      if (timer === null && now() - lastAppliedAt >= settleMs) {
        flush();
        return;
      }
      if (timer !== null) clearTimer(timer);
      timer = setTimer(flush, settleMs);
    },

    /** Whether a resize is waiting for the size to settle. */
    get pending() {
      return timer !== null;
    },

    /** Drop any waiting resize (the pane is going away). */
    cancel() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
