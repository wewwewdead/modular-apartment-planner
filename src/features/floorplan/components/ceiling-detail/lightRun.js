/**
 * Several lights from one gesture with the Light tool (docs/ceiling-light-placement.md §5.1).
 *
 * A press and release that hardly moves is one light, exactly as before. A drag
 * from A to B is a row of `count` lights spread evenly from A to B inclusive;
 * with Shift held it is a grid filling the rectangle A → B, `columns` along U
 * and `rows` along V. The arrow keys change the counts while the pointer is
 * still down. Even spacing is the point, so only the two ends snap: the lights
 * in between land wherever the spacing puts them.
 *
 * Pure and unit-tested; everything is ceiling-local UV millimetres.
 */

export const MIN_LIGHT_RUN_COUNT = 2;
export const MAX_LIGHT_RUN_COUNT = 24;

/**
 * Screen travel, in px, below which a press is a click rather than a drag. The
 * same 6 px the 3D pane uses (`CLICK_DISTANCE_THRESHOLD` in
 * `preview/previewConfig.js`; `lightRun.test.js` keeps the two equal). Not
 * imported from there: that module loads three.js, which the plan has no other
 * reason to pull in.
 */
export const LIGHT_RUN_CLICK_PX = 6;

/** A side of a run or grid shorter than this has one light along it. */
const COLLAPSE_MM = 1;

function mm(value) {
  return `${Math.round(value).toLocaleString('en-US')} mm`;
}

/** A count the arrow keys may set: a whole number from 2 to 24. */
export function clampLightCount(value) {
  const count = Math.round(Number(value));
  if (!Number.isFinite(count)) return MIN_LIGHT_RUN_COUNT;
  return Math.min(MAX_LIGHT_RUN_COUNT, Math.max(MIN_LIGHT_RUN_COUNT, count));
}

/** `count` values evenly from `from` to `to` inclusive; one (at `from`) when the span is under 1 mm. */
function spread(from, to, count) {
  if (count <= 1 || Math.abs(to - from) < COLLAPSE_MM) return [from];
  return Array.from({ length: count }, (_, index) => from + ((to - from) * index) / (count - 1));
}

/** `count` lights evenly spaced from `start` to `end`, both ends included. */
export function layoutLightRun(start, end, count) {
  const steps = Math.max(1, Math.round(Number(count)) || 1);
  if (steps === 1 || Math.hypot(end.u - start.u, end.v - start.v) < COLLAPSE_MM) return [{ u: start.u, v: start.v }];
  return Array.from({ length: steps }, (_, index) => ({
    u: start.u + ((end.u - start.u) * index) / (steps - 1),
    v: start.v + ((end.v - start.v) * index) / (steps - 1),
  }));
}

/**
 * A grid filling the rectangle spanned by `start` and `end`: `columns` along U,
 * `rows` along V, row by row from `start`. A side under 1 mm gets one light
 * whatever its count, so a grid dragged along one axis is a row and a grid
 * with no extent is a single light.
 */
export function layoutLightGrid(start, end, columns, rows) {
  const us = spread(start.u, end.u, Math.max(1, Math.round(Number(columns)) || 1));
  const vs = spread(start.v, end.v, Math.max(1, Math.round(Number(rows)) || 1));
  return vs.flatMap((v) => us.map((u) => ({ u, v })));
}

/**
 * What the run will place, for the chip: `3 × 1,500 mm` for a row (count ×
 * spacing between neighbours), `3 × 2 · 1,500 × 1,200 mm` for a grid (columns
 * × rows · spacing along U × along V). A grid that collapsed to a line reads
 * as the row it became.
 */
export function describeLightRun(points, { grid = false, columns = 0, rows = 0 } = {}) {
  if (!points?.length) return '';
  if (points.length === 1) return '1 light';
  if (grid && columns >= 2 && rows >= 2 && points.length === columns * rows) {
    const alongU = Math.abs(points[1].u - points[0].u);
    const alongV = Math.abs(points[columns].v - points[0].v);
    return `${columns} × ${rows} · ${Math.round(alongU).toLocaleString('en-US')} × ${mm(alongV)}`;
  }
  return `${points.length} × ${mm(Math.hypot(points[1].u - points[0].u, points[1].v - points[0].v))}`;
}

/** A fresh run gesture's counts: a row of two, or a 2 × 2 grid. */
export const LIGHT_RUN_DEFAULTS = Object.freeze({ count: 2, columns: 2, rows: 2 });

/**
 * A Light-tool press, as the editor's `draw` gesture: `start` is A, already
 * snapped; `hover` is the raw pointer the end will be snapped from; the screen
 * point is kept so travel is judged in pixels.
 */
export function startLightRun(start, hover, { pointerId, clientX, clientY, shiftKey }) {
  return {
    kind: 'draw',
    tool: 'add_light',
    start,
    current: hover.point,
    hover,
    ...LIGHT_RUN_DEFAULTS,
    grid: Boolean(shiftKey),
    travelPx: 0,
    pointerId,
    screenX: clientX,
    screenY: clientY,
  };
}

/** The run after a pointer move (or the release): where B is, Shift, and how far it has travelled. */
export function moveLightRun(run, { clientX, clientY, shiftKey }, hover) {
  return {
    ...run,
    current: hover.point,
    hover,
    grid: Boolean(shiftKey),
    travelPx: Math.hypot(clientX - run.screenX, clientY - run.screenY),
  };
}

/**
 * The change a key makes to a live run, or null for a key the run ignores.
 * ↑/↓ add or drop a light in a row and a row of lights in a grid; ←/→ drop or
 * add a column in a grid and do nothing to a row (still claimed, so the page
 * does not scroll under the drag); Shift turns the row into a grid.
 */
export function adjustLightRun(run, key) {
  if (key === 'Shift') return { grid: true };
  const step = { ArrowUp: 1, ArrowDown: -1, ArrowRight: 1, ArrowLeft: -1 }[key];
  if (!step) return null;
  const vertical = key === 'ArrowUp' || key === 'ArrowDown';
  if (!run.grid) return vertical ? { count: clampLightCount(run.count + step) } : {};
  return vertical ? { rows: clampLightCount(run.rows + step) } : { columns: clampLightCount(run.columns + step) };
}

/** Whether a press has travelled far enough on screen to be a drag (more than 6 px). */
export function isLightRunDrag(run) {
  return Number(run?.travelPx) > LIGHT_RUN_CLICK_PX;
}

/**
 * Where a run gesture's lights go, given the snapped end point. A press that
 * travelled no further than a click is the one light at its (snapped) start.
 */
export function resolveLightRunPoints(run, end) {
  if (!isLightRunDrag(run)) return [{ u: run.start.u, v: run.start.v }];
  return run.grid ? layoutLightGrid(run.start, end, run.columns, run.rows) : layoutLightRun(run.start, end, run.count);
}
