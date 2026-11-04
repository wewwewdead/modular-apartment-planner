/**
 * Pan and wheel-zoom as compositor gestures.
 *
 * Changing the world transform on the plan's root `<g>` re-lays-out and
 * repaints every element in the SVG — on a pan frame that is several
 * milliseconds of main-thread work plus a full re-raster of the picture,
 * filters and all, for a picture that has merely moved. So while a pan or a
 * burst of wheel notches lasts, the canvas leaves the SVG laid out for the
 * last COMMITTED viewport and shows the PENDING one with a CSS transform on
 * the `<svg>` element itself, which the compositor applies without touching
 * the main thread or the rasterised tiles. The store is told once, when the
 * gesture settles, and the transform comes off in the same paint the new
 * layout lands in.
 *
 * The pending view is ABSOLUTE and there is only one of it, whatever mix of
 * gestures produced it: a pan move moves it by that move's own step, a wheel
 * notch zooms it about the cursor, and the commit hands the store the view
 * itself rather than a delta. A delta replayed onto "whatever the store holds
 * then" lands twice, or in the wrong place, as soon as anything else touched
 * the viewport while the gesture lasted — a wheel notch clicked by the same
 * finger holding the wheel down, or a Reset centre point — which is what made
 * a pan "go random anywhere".
 *
 * The helpers are pure so the arithmetic can be tested without a DOM.
 */

/** How long after the last wheel notch the zoom is committed to the store. */
export const ZOOM_COMMIT_DELAY_MS = 90;

/**
 * The viewport after zooming `viewport` by `factor` about the screen point
 * (`mouseX`, `mouseY`), measured from the canvas origin, clamped to
 * [`min`, `max`]. Returns `viewport` itself when the clamp leaves it as it is.
 */
export function zoomViewportAbout(viewport, factor, mouseX, mouseY, { min, max }) {
  const zoom = Math.max(min, Math.min(max, viewport.zoom * factor));
  if (zoom === viewport.zoom) return viewport;
  const ratio = zoom / viewport.zoom;
  return {
    zoom,
    panX: mouseX - (mouseX - viewport.panX) * ratio,
    panY: mouseY - (mouseY - viewport.panY) * ratio,
  };
}

/**
 * The viewport after panning `viewport` by one pointer step of (`dx`, `dy`)
 * screen pixels. Returns `viewport` itself for a zero step, so a move that
 * went nowhere does not count as a change.
 */
export function panViewport(viewport, dx, dy) {
  if (!dx && !dy) return viewport;
  return { zoom: viewport.zoom, panX: viewport.panX + dx, panY: viewport.panY + dy };
}

/**
 * The CSS transform (origin 0 0) that makes an SVG laid out for `committed`
 * show `pending`: scale by the zoom ratio, then translate so the committed
 * pan lands on the pending one. Empty when the two are the same view.
 */
export function gestureTransform(committed, pending) {
  if (!committed || !pending) return '';
  const scale = pending.zoom / committed.zoom;
  const dx = pending.panX - committed.panX * scale;
  const dy = pending.panY - committed.panY * scale;
  if (scale === 1 && dx === 0 && dy === 0) return '';
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

/** Whether two viewports are the same view, number for number. */
export function sameViewport(a, b) {
  return Boolean(a && b) && a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY;
}
