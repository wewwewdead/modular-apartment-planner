/**
 * Pure helpers for the wall detail canvas chrome: aspect-true fitting of the
 * elevation SVG inside its frame, ruler tick generation, and plain-language
 * labels for snap references. All wall coordinates are millimetres with V
 * measured upward from the finished floor.
 */

const RULER_STEP_CANDIDATES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/**
 * Contain-fit the wall elevation inside the canvas frame so the SVG box always
 * matches the drawing aspect exactly. Keeping the box aspect-true is what makes
 * pointer math, rulers, and "Fit wall" all agree.
 */
export function computeCanvasFit({ frameWidth, frameHeight, length, height, margin = 56 }) {
  const availableWidth = Math.max(0, (Number(frameWidth) || 0) - margin * 2);
  const availableHeight = Math.max(0, (Number(frameHeight) || 0) - margin * 2);
  if (!(length > 0) || !(height > 0) || availableWidth < 40 || availableHeight < 40) {
    return { ready: false, frameWidth: 0, frameHeight: 0, fitWidth: 0, fitHeight: 0, pxPerMm: 0 };
  }
  const pxPerMm = Math.min(availableWidth / length, availableHeight / height);
  return {
    ready: true,
    frameWidth: Number(frameWidth),
    frameHeight: Number(frameHeight),
    fitWidth: length * pxPerMm,
    fitHeight: height * pxPerMm,
    pxPerMm,
  };
}

/** How many wall millimetres one on-screen pixel covers at the current zoom. */
export function wallUnitsPerPixel(metrics, viewport, bounds) {
  const zoom = Math.max(0.001, Number(viewport?.zoom) || 1);
  if (metrics?.ready && metrics.pxPerMm > 0) return 1 / (metrics.pxPerMm * zoom);
  const size = Math.max(Number(bounds?.length) || 0, Number(bounds?.height) || 0) || 1000;
  return size / 900 / zoom;
}

/**
 * Map a wall-local point (mm, V up from floor) to screen pixels relative to the
 * canvas frame, honouring the centred CSS `translate(pan) scale(zoom)` camera.
 */
export function wallPointToFrame(point, metrics, viewport) {
  const zoom = Math.max(0.001, Number(viewport?.zoom) || 1);
  const panU = Number(viewport?.panU) || 0;
  const panV = Number(viewport?.panV) || 0;
  return {
    x: metrics.frameWidth / 2 + panU + zoom * ((Number(point?.u) || 0) * metrics.pxPerMm - metrics.fitWidth / 2),
    y: metrics.frameHeight / 2 + panV + zoom * (metrics.fitHeight / 2 - (Number(point?.v) || 0) * metrics.pxPerMm),
  };
}

/** Pick a labelled ruler step (and minor subdivision) for the current scale. */
export function chooseRulerStep(screenPxPerMm, minLabelPx = 64) {
  const perMm = Math.max(1e-6, Number(screenPxPerMm) || 0);
  const step =
    RULER_STEP_CANDIDATES.find((candidate) => candidate * perMm >= minLabelPx) ||
    RULER_STEP_CANDIDATES[RULER_STEP_CANDIDATES.length - 1];
  const minor = [step / 5, step / 2].find((candidate) => Number.isInteger(candidate) && candidate * perMm >= 7) || null;
  return { step, minor };
}

/**
 * Build ruler ticks for one axis, clipped to the frame. Every tick carries its
 * frame-space position; `labeled` ticks get a printed mm value. The wall's far
 * end is always labelled so the overall size stays readable.
 */
export function buildRulerTicks({ axis, sizeMm, metrics, viewport, minLabelPx = 64 }) {
  const zoom = Math.max(0.001, Number(viewport?.zoom) || 1);
  const { step, minor } = chooseRulerStep(metrics.pxPerMm * zoom, minLabelPx);
  const spacing = minor || step;
  const span = axis === 'u' ? metrics.frameWidth : metrics.frameHeight;
  const positionOf = (value) => {
    const point = axis === 'u' ? { u: value, v: 0 } : { u: 0, v: value };
    const at = wallPointToFrame(point, metrics, viewport);
    return axis === 'u' ? at.x : at.y;
  };
  const ticks = [];
  for (let value = 0; value <= sizeMm + 1e-6; value += spacing) {
    const pos = positionOf(value);
    if (pos < -2 || pos > span + 2) continue;
    const labeled = Math.abs(value / step - Math.round(value / step)) < 1e-6;
    ticks.push({ value: Math.round(value), pos, labeled });
  }
  const endPos = positionOf(sizeMm);
  const hasEnd = ticks.some((tick) => Math.abs(tick.value - Math.round(sizeMm)) < 0.5);
  if (!hasEnd && endPos >= -2 && endPos <= span + 2) {
    ticks.push({ value: Math.round(sizeMm), pos: endPos, labeled: true });
  }
  return { ticks, step, minor };
}

const ANCHOR_PHRASES = {
  edge_left: 'left edge',
  edge_right: 'right edge',
  edge_top: 'top edge',
  edge_bottom: 'bottom edge',
  bottom_left: 'bottom-left corner',
  bottom_center: 'bottom edge midpoint',
  bottom_right: 'bottom-right corner',
  center_left: 'left edge midpoint',
  center: 'center',
  center_right: 'right edge midpoint',
  top_left: 'top-left corner',
  top_center: 'top edge midpoint',
  top_right: 'top-right corner',
  axis_center: 'centerline',
  guide_line: 'pencil line',
  guide_intersection: 'measurement crossing',
  start: 'start point',
  end: 'end point',
};

/** Translate a snap anchor id into installer language ("left edge", "corner 2"). */
export function friendlyAnchorPhrase(anchor) {
  if (!anchor) return '';
  if (ANCHOR_PHRASES[anchor]) return ANCHOR_PHRASES[anchor];
  const vertex = /^vertex_(\d+)$/.exec(anchor);
  if (vertex) return `corner ${Number(vertex[1]) + 1}`;
  const edge = /^outline_edge_(\d+)$/.exec(anchor);
  if (edge) return `edge ${Number(edge[1]) + 1}`;
  return String(anchor).replaceAll('_', ' ');
}
