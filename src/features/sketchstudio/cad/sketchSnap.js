import { distanceToSegment, entityKeyPoints, entitySegments, roundPoint } from './sketchProfile.js';
import { distanceToPrimitive, intersect, primitiveBox, primitives } from './sketchIntersect.js';

const gridRound = (value, grid) => (grid > 0 ? Math.round(value / grid) * grid : value);
const AXIS_EPS = 1e-6;
// Intersection snap looks at no more pieces than this near the cursor (pairwise:
// at most 2 016 pairs), the nearest first.
const NEAR_LIMIT = 64;

function nearestOnSegment(p, [a, b]) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

// One snappable shape for the intersection snap: its pieces and its box.
function shapeOf(pieces, owner) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const piece of pieces) {
    const [x0, y0, x1, y1] = primitiveBox(piece);
    if (x0 < box[0]) box[0] = x0;
    if (y0 < box[1]) box[1] = y0;
    if (x1 > box[2]) box[2] = x1;
    if (y1 > box[3]) box[3] = y1;
  }
  return { pieces, box, owner };
}

// Every snap target, most specific first. `boundary` holds the projected edges
// of the face (and any other model edges) lying in the sketch plane; `marks`
// the 3D measure mark points projected onto the plane. `shapes`: the
// entities (construction ones too) and the model edges as exact pieces with
// their boxes, for the intersection snap (docs/sketch-studio-hand-drawing.md §6.3).
export function snapTargets({ entities = [], boundary = [], extraPoints = [], marks = [] }) {
  const points = [{ point: [0, 0], kind: 'origin' }];
  for (const point of extraPoints) points.push({ point, kind: 'endpoint' });
  for (const entity of entities) points.push(...entityKeyPoints(entity));
  for (const [a, b] of boundary)
    points.push(
      { point: a, kind: 'edge end' },
      { point: b, kind: 'edge end' },
      { point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], kind: 'edge midpoint' },
    );
  for (const point of marks) points.push({ point, kind: 'mark' });
  const curves = [
    ...boundary.map((segment) => ({ segment, kind: 'on edge' })),
    ...entities.flatMap((entity) => entitySegments(entity).map((segment) => ({ segment, kind: 'on sketch' }))),
  ];
  const shapes = [
    ...entities.map((entity) => shapeOf(primitives(entity), entity.id)),
    ...boundary.map(([a, b], i) => shapeOf([{ type: 'segment', a, b }], `edge ${i}`)),
  ].filter((shape) => shape.pieces.length);
  return { points, curves, shapes };
}

/**
 * The crossing nearest `raw` within `tolerance`: { point, d } or null. Only
 * the pieces near the cursor are tried, pairwise: those of shapes whose box
 * grown by the tolerance holds `raw` and that pass within the tolerance of it
 * (a crossing within the tolerance lies on both). Never an all-pairs pass.
 */
export function nearestIntersection(raw, shapes = [], tolerance = 1) {
  const near = [];
  for (const shape of shapes) {
    const [x0, y0, x1, y1] = shape.box;
    if (raw[0] < x0 - tolerance || raw[0] > x1 + tolerance || raw[1] < y0 - tolerance || raw[1] > y1 + tolerance)
      continue;
    for (const piece of shape.pieces) {
      const d = distanceToPrimitive(raw, piece);
      if (d <= tolerance) near.push({ piece, owner: shape.owner, d });
    }
  }
  if (near.length < 2) return null;
  if (near.length > NEAR_LIMIT) near.sort((p, q) => p.d - q.d).length = NEAR_LIMIT;
  let best = null;
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++) {
      // One shape's own pieces meet at its corners, which are key points already.
      if (near[i].owner === near[j].owner) continue;
      for (const point of intersect(near[i].piece, near[j].piece)) {
        const d = Math.hypot(point[0] - raw[0], point[1] - raw[1]);
        if (d <= tolerance && (!best || d < best.d)) best = { point, d };
      }
    }
  return best;
}

// Snap a raw plane point. Order: key points and intersections (the nearest;
// a key point on a tie), then edges (keeping a grid step along an
// axis-aligned edge), then the grid. Shift (ortho) locks the move to
// horizontal or vertical from `from`, still aligning to key points and grid.
export function snapPoint(raw, { targets, grid = 0, tolerance = 1, ortho = false, from = null }) {
  if (ortho && from) {
    const horizontal = Math.abs(raw[0] - from[0]) >= Math.abs(raw[1] - from[1]);
    const free = horizontal ? 0 : 1;
    const locked = [...raw];
    locked[1 - free] = from[1 - free];
    let best = null;
    for (const target of targets.points) {
      const d = Math.abs(target.point[free] - raw[free]);
      if (d <= tolerance && (!best || d < best.d)) best = { d, value: target.point[free], kind: target.kind };
    }
    locked[free] = best ? best.value : gridRound(raw[free], grid);
    return { point: roundPoint(locked), kind: best ? `ortho · ${best.kind}` : 'ortho' };
  }
  let best = null;
  for (const target of targets.points) {
    const d = Math.hypot(target.point[0] - raw[0], target.point[1] - raw[1]);
    if (d <= tolerance && (!best || d < best.d)) best = { d, ...target };
  }
  const crossing = nearestIntersection(raw, targets.shapes, tolerance);
  // A crossing on a key point (two lines ending on one corner) is that key point.
  if (crossing && (!best || crossing.d < best.d - 1e-9))
    return { point: roundPoint(crossing.point), kind: 'intersection' };
  if (best) return { point: roundPoint(best.point), kind: best.kind };
  let edge = null;
  for (const curve of targets.curves) {
    const d = distanceToSegment(raw, curve.segment);
    if (d <= tolerance && (!edge || d < edge.d)) edge = { d, ...curve };
  }
  if (edge) {
    const [a, b] = edge.segment;
    let point = nearestOnSegment(raw, edge.segment);
    if (Math.abs(a[1] - b[1]) < AXIS_EPS) point = [clampTo(gridRound(point[0], grid), a[0], b[0]), a[1]];
    else if (Math.abs(a[0] - b[0]) < AXIS_EPS) point = [a[0], clampTo(gridRound(point[1], grid), a[1], b[1])];
    return { point: roundPoint(point), kind: edge.kind };
  }
  if (grid > 0) return { point: roundPoint([gridRound(raw[0], grid), gridRound(raw[1], grid)]), kind: 'grid' };
  return { point: roundPoint(raw), kind: 'free' };
}
const clampTo = (value, a, b) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), value));
