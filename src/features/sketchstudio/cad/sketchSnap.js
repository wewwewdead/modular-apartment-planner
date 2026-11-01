import { distanceToSegment, entityKeyPoints, entitySegments, roundPoint } from './sketchProfile.js';

const gridRound = (value, grid) => (grid > 0 ? Math.round(value / grid) * grid : value);
const AXIS_EPS = 1e-6;

function nearestOnSegment(p, [a, b]) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

// Every snap target, most specific first. `boundary` holds the projected edges
// of the face (and any other model edges) lying in the sketch plane; `marks`
// the 3D measure mark points projected onto the plane.
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
  return { points, curves };
}

// Snap a raw plane point. Order: key points, then edges (keeping a grid step
// along an axis-aligned edge), then the grid. Shift (ortho) locks the move to
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
