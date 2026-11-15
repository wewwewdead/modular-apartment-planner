// Reference dimensions on an in-viewport sketch (docs/sketch-studio-sketch-
// dimensions.md, SD-1). Kept in `sketch.dimensions`, never in `entities`, in
// sketch-plane millimetres:
//   { id, type: 'linear', from, to, orientation, offset }
//   { id, type: 'radial', mode: 'diameter' | 'radius', center, radius, at }
// The drawing sheets' record shape without `view`, built and measured by the
// same functions (sheetAnnotations.js): they are handedness-free arithmetic,
// so they work unchanged in the sketch plane. Pure: plain arrays in and out.
import {
  arcGeometry,
  distanceToSegment,
  entityKeyPoints,
  entitySegments,
  roundPoint,
  samePoint,
} from './sketchProfile.js';
import { createLinearDimension, createRadialDimension, linearLine, linearValue } from './sheetAnnotations.js';
import { formatMm } from './marks.js';

// A dimension end lies on an entity within this (mm): it hangs on that entity.
const ATTACH_MM = 1e-3;
// Snap kinds that are not a key point: a click there takes the whole entity under it.
const NOT_KEY = new Set(['on sketch', 'on edge', 'grid', 'free']);
const isKeySnap = (kind) => Boolean(kind) && !NOT_KEY.has(kind) && !String(kind).startsWith('ortho');
const round = (value) => {
  const result = Math.round(value * 1e6) / 1e6;
  return Object.is(result, -0) ? 0 : result;
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (a, s) => [a[0] * s, a[1] * s];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : null;
};
const sidesOf = (entity) => entitySegments(entity);

// The straight pieces a second click can read square to: lines, rectangle
// sides and the model edges in the plane (never a circle or an arc).
function straightSegments(entities, boundary) {
  return [
    ...entities.filter((e) => e.type === 'line').map((e) => [e.a, e.b]),
    ...entities.filter((e) => e.type === 'rect').flatMap(sidesOf),
    ...boundary,
  ];
}

// Foot of the perpendicular from `p` onto segment ab, or null when it falls off the segment.
function footOn(p, [a, b]) {
  const d = sub(b, a);
  const length = d[0] * d[0] + d[1] * d[1];
  if (!length) return null;
  const t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / length;
  if (t < -1e-9 || t > 1 + 1e-9) return null;
  return add(a, scale(d, t));
}

// The circle a circle or an arc lies on, or null.
function circleOf(entity) {
  if (entity.type === 'circle') return { center: entity.c, radius: entity.r };
  if (entity.type === 'arc') {
    const geometry = arcGeometry(entity.a, entity.m, entity.b);
    return geometry && { center: roundPoint(geometry.center), radius: round(geometry.radius) };
  }
  return null;
}
const sameCircle = (circle, dimension) =>
  samePoint(circle.center, dimension.center, ATTACH_MM) && Math.abs(circle.radius - dimension.radius) <= ATTACH_MM;

// What a click on an entity's body dimensions: a line its length, a
// rectangle the side under the cursor, a circle its diameter, an arc its radius.
function wholeEntity(entity, raw) {
  if (entity.type === 'line') return { type: 'span', source: 'line', from: entity.a, to: entity.b };
  if (entity.type === 'rect') {
    const sides = sidesOf(entity);
    const side = sides.reduce((best, s) => (distanceToSegment(raw, s) < distanceToSegment(raw, best) ? s : best));
    return { type: 'span', source: 'side', from: roundPoint(side[0]), to: roundPoint(side[1]) };
  }
  const circle = circleOf(entity);
  if (!circle) return null;
  return {
    type: 'circle',
    center: roundPoint(circle.center),
    radius: round(circle.radius),
    mode: entity.type === 'arc' ? 'radius' : 'diameter',
  };
}

/**
 * What a Dimension tool click takes (§3.2). `point` / `kind` are the snapped
 * click, `raw` the plane point under the cursor, `tolerance` the snap radius
 * (mm), `first` the point already held (second click) or null.
 * Returns { type: 'point', point } | { type: 'span', source, from, to } |
 * { type: 'circle', center, radius, mode } | { type: 'refused', message }.
 */
export function dimensionPick({
  point,
  kind,
  raw = point,
  tolerance = 0,
  entities = [],
  boundary = [],
  first = null,
  shift = false,
}) {
  if (!first) {
    if (!isKeySnap(kind)) {
      let best = null;
      for (const entity of entities) {
        const d = Math.min(...entitySegments(entity).map((s) => distanceToSegment(raw, s)));
        if (d <= tolerance && (!best || d < best.d)) best = { entity, d };
      }
      const whole = best && wholeEntity(best.entity, raw);
      if (whole) return whole;
    }
    return { type: 'point', point: roundPoint(point) };
  }
  let taken = roundPoint(point);
  // Point to edge reads square to the edge: the hole-to-edge distance.
  if (!isKeySnap(kind) && !shift) {
    let best = null;
    for (const segment of straightSegments(entities, boundary)) {
      const d = distanceToSegment(raw, segment);
      if (d <= tolerance && (!best || d < best.d)) best = { segment, d };
    }
    const foot = best && footOn(first, best.segment);
    if (foot) taken = roundPoint(foot);
  }
  if (samePoint(taken, first)) return { type: 'refused', message: 'Pick a different point.' };
  return { type: 'point', point: taken };
}

// The drawing sheets' creators, without their `view`.
export function linearDimension({ id, from, to, at, orientation }) {
  const { view: _view, ...dimension } = createLinearDimension({ id, from, to, at, orientation });
  return dimension;
}
export function radialDimension({ id, center, radius, at, mode = 'diameter' }) {
  const { view: _view, ...dimension } = createRadialDimension({
    id,
    circle: { center: roundPoint(center), radius: round(radius) },
    at,
    mode,
  });
  return dimension;
}

/**
 * The drawing of one dimension in sketch-plane mm: { value, text, segments,
 * labelAt }. `size` is the overlay's marker size (mm for about 4 px), so the
 * ticks, gaps and the centre cross keep their size on screen.
 */
export function dimensionGeometry(dimension, size = 1) {
  if (dimension.type === 'radial') {
    const { center, radius, at } = dimension;
    const toward = unit(sub(at, center)) || [1, 0];
    const value = dimension.mode === 'radius' ? radius : radius * 2;
    return {
      value,
      text: `${dimension.mode === 'radius' ? 'R' : 'Ø'}${formatMm(value)}`,
      segments: [
        [at, add(center, scale(toward, radius))],
        [add(center, [-size, 0]), add(center, [size, 0])],
        [add(center, [0, -size]), add(center, [0, size])],
      ],
      labelAt: at,
    };
  }
  const [lineA, lineB] = linearLine(dimension);
  const segments = [[lineA, lineB]];
  // Extension lines: from just off each measured point, overshooting the line.
  let side = null;
  for (const [measured, end] of [
    [dimension.from, lineA],
    [dimension.to, lineB],
  ]) {
    const d = sub(end, measured),
      l = len(d);
    if (l < 1e-9) continue;
    const u = scale(d, 1 / l);
    side = side || u;
    segments.push([add(measured, scale(u, Math.min(0.5 * size, l))), add(end, scale(u, size))]);
  }
  // 45° ticks (the marks' look): between the line's direction and the side it stands off to.
  const along = unit(sub(lineB, lineA)) || [1, 0];
  const t = scale(unit(add(along, side || [-along[1], along[0]])), size);
  for (const end of [lineA, lineB]) segments.push([sub(end, t), add(end, t)]);
  const value = linearValue(dimension);
  return { value, text: formatMm(value), segments, labelAt: scale(add(lineA, lineB), 0.5) };
}

/**
 * The id of the dimension nearest `point`: a segment within `tolerance`, or
 * the label point within 3 × tolerance (the chip is wider than a line); null.
 */
export function hitDimension(dimensions = [], point, tolerance, size = 1) {
  let best = null;
  for (const dimension of dimensions) {
    const { segments, labelAt } = dimensionGeometry(dimension, size);
    const line = Math.min(...segments.map((s) => distanceToSegment(point, s)));
    const label = len(sub(point, labelAt));
    if (line > tolerance && label > 3 * tolerance) continue;
    const d = Math.min(line, label);
    if (!best || d < best.d) best = { id: dimension.id, d };
  }
  return best?.id || null;
}

// An end hangs on an entity when it is one of its key points or lies on it.
function attached(point, entity) {
  if (entityKeyPoints(entity).some((k) => samePoint(k.point, point, ATTACH_MM))) return true;
  if (entity.type === 'circle' && Math.abs(len(sub(point, entity.c)) - entity.r) <= ATTACH_MM) return true;
  return entitySegments(entity).some((s) => distanceToSegment(point, s) <= ATTACH_MM);
}
const measures = (dimension, entity) => {
  const circle = circleOf(entity);
  return Boolean(circle) && sameCircle(circle, dimension);
};

/**
 * The dimensions left once `removed` (one entity) is gone from the drawing:
 * a linear one goes when an end that hung on it hangs on none of `remaining`;
 * a radial one when it measured that circle / arc and no remaining one has
 * the same centre and radius. An end that never hung on the removed entity (a
 * model edge, the origin, a corner another entity shares) keeps it.
 */
export function pruneDimensions(dimensions = [], removed, remaining = []) {
  if (!removed) return dimensions;
  const kept = dimensions.filter((dimension) => {
    if (dimension.type === 'radial')
      return !measures(dimension, removed) || remaining.some((entity) => measures(dimension, entity));
    return [dimension.from, dimension.to].every(
      (end) => !attached(end, removed) || remaining.some((entity) => attached(end, entity)),
    );
  });
  return kept.length === dimensions.length ? dimensions : kept;
}

/**
 * One list per entity group (outlineSketches' split outlines): a dimension
 * goes to the first group its `from`, then its `to` (a radial one: its
 * circle) hangs on, else to the first group.
 */
export function splitDimensions(groups, dimensions = []) {
  const lists = groups.map(() => []);
  const owner = (test) => groups.findIndex((group) => group.some(test));
  for (const dimension of dimensions) {
    let index = -1;
    if (dimension.type === 'radial') index = owner((entity) => measures(dimension, entity));
    else
      for (const end of [dimension.from, dimension.to]) {
        index = owner((entity) => attached(end, entity));
        if (index >= 0) break;
      }
    lists[Math.max(0, index)]?.push(dimension);
  }
  return lists;
}

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
// "Horizontal 120 mm", "Aligned 86.6 mm", "Ø20", "R12.5".
export function describeDimension(dimension) {
  if (dimension.type === 'radial') return dimensionGeometry(dimension).text;
  return `${capital(dimension.orientation)} ${formatMm(linearValue(dimension))} mm`;
}

// What a first click on an entity would dimension, in words ('' for a point).
export function describePick(pick) {
  if (pick?.type === 'span')
    return `${pick.source === 'side' ? 'Side' : 'Line'} ${formatMm(len(sub(pick.to, pick.from)))} mm`;
  if (pick?.type === 'circle')
    return `${pick.mode === 'radius' ? 'R' : 'Ø'}${formatMm(pick.mode === 'radius' ? pick.radius : pick.radius * 2)}`;
  return '';
}

// The points Look at frames: every segment end and the label point.
export function dimensionPoints(dimension, size = 1) {
  const { segments, labelAt } = dimensionGeometry(dimension, size);
  return [...segments.flat(), labelAt];
}

// "d3": one past the highest number in the list.
export function nextDimensionNumber(dimensions = []) {
  return dimensions.reduce((max, d) => Math.max(max, Number(String(d.id).replace(/\D/g, '')) || 0), 0) + 1;
}
