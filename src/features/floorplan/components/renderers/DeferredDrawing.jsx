import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { LOADING_COPY, LOADING_TIMING, LoadingBar, LoadingPill, usePresence } from '@/ui/loading';
import styles from './DeferredDrawing.module.css';

/*
 * The plan canvas's promise to the section and elevation renderers inside it:
 * there is a browser frame to wait for, so draw the paper now and run the
 * hidden-line pass after it (docs/night-section-freezes.md §4.3). Anything
 * that renders those renderers outside the canvas — a test, a static render —
 * gets no provider, and with it the old synchronous drawing.
 *
 * `overlayHost` is an HTML layer over the canvas: the loading kit's bar and
 * pill are HTML, and inside the scaled drawing they would scale with it.
 */
export const DeferredDrawingContext = createContext(null);

export function useDeferredDrawing() {
  return useContext(DeferredDrawingContext);
}

/** The layer the canvas renders over its <svg>, for the bar and pill below. */
export function DeferredDrawingOverlayHost({ hostRef }) {
  return <div ref={hostRef} className={styles.host} data-drawing-overlay="" />;
}

/**
 * The canvas-level half of a deferred drawing's wait: the region bar from the
 * first frame of any wait (§3 rule 1), and — while an edit is being recomputed
 * under the previous drawing — the "Recomputing…" pill, as the daylight and
 * solar overlays do. A first entry's words live in the placeholder itself.
 */
export function DeferredDrawingProgress({ status }) {
  const deferred = useDeferredDrawing();
  const host = deferred?.overlayHost;
  const waiting = status === 'loading' || status === 'stale';
  // Mounted with the wait rather than switched on inside it: a bar that mounts
  // active is on screen in the commit the wait began in, where one switched on
  // later shows a frame behind — and a recompute is often over by then.
  const { mounted: barMounted } = usePresence(waiting, LOADING_TIMING.exitMs);
  if (!host) return null;
  return createPortal(
    <>
      {barMounted ? <LoadingBar active={waiting} placement="region" /> : null}
      <LoadingPill active={status === 'stale'} label={LOADING_COPY.recomputing} placement="region" />
    </>,
    host,
  );
}
