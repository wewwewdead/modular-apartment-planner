// Exact crossings of sketch entities (docs/sketch-studio-hand-drawing.md §6.3,
// HD-2): every entity as segments, arcs and circles, and where any two of
// those meet, in closed form (no sampling). Intersection snap and Check use it;
// HD-4's Trim, Extend and Fillet are to be built on it. Pure: it imports
// sketchProfile.js only, no three, no DOM.
//   segment { type: 'segment', a, b }
//   arc     { type: 'arc', center, radius, start, sweep, a, b }   sweep signed (CCW > 0), radians
//   circle  { type: 'circle', center, radius }
import { arcGeometry, explode } from './sketchProfile.js';

// Lengths (mm) and an arc's range are respected to this.
export const INTERSECT_EPS = 1e-9;
const TAU = Math.PI * 2;
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
const cross = (p, q) => p[0] * q[1] - p[1] * q[0];
const len = (p) => Math.hypot(p[0], p[1]);

/**
 * The segments, arcs and circles an entity is made of: a circle itself, any
 * other entity its pieces (sketchProfile.js explode): a line one segment, a
 * rectangle its four sides (counter-clockwise from the lower-left corner), an
 * arc itself (none when its three points lie on a line), a slot, a polygon or
 * a rounded rectangle its sides and arcs (HD-3, §7.1).
 */
export function primitives(entity) {
  if (entity.type === 'circle') return [{ type: 'circle', center: entity.c, radius: entity.r }];
  return explode(entity).flatMap((piece) => {
    if (piece.type === 'line') return [{ type: 'segment', a: piece.a, b: piece.b }];
    const geometry = arcGeometry(piece.a, piece.m, piece.b);
    return geometry ? [{ type: 'arc', ...geometry, a: piece.a, b: piece.b }] : [];
  });
}

// Does an arc's range hold the point at angle `theta` on its circle (to INTERSECT_EPS
// along the arc, either end included)?
function onArc(arc, theta) {
  const tolerance = INTERSECT_EPS / Math.max(arc.radius, INTERSECT_EPS);
  const along = arc.sweep >= 0 ? theta - arc.start : arc.start - theta;
  const turned = ((along % TAU) + TAU) % TAU;
  return turned <= Math.abs(arc.sweep) + tolerance || turned >= TAU - tolerance;
}
const angleAt = (circle, p) => Math.atan2(p[1] - circle.center[1], p[0] - circle.center[0]);
// Keep the points an arc's range holds (a circle holds all).
const onCurve = (curve, points) =>
  curve.type === 'arc' ? points.filter((p) => onArc(curve, angleAt(curve, p))) : points;

/**
 * [x0, y0, x1, y1] round a primitive: a segment's ends, an arc's own extent
 * (its ends and the quadrants it passes), a circle's square.
 */
export function primitiveBox(primitive) {
  if (primitive.type === 'segment') {
    const { a, b } = primitive;
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }
  const [cx, cy] = primitive.center,
    r = primitive.radius;
  if (primitive.type === 'circle') return [cx - r, cy - r, cx + r, cy + r];
  const points = [primitive.a, primitive.b];
  for (let k = 0; k < 4; k++) if (onArc(primitive, (k * Math.PI) / 2)) points.push(quadrant(primitive, k));
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const quadrant = ({ center, radius }, k) => [
  center[0] + radius * [1, 0, -1, 0][k],
  center[1] + radius * [0, 1, 0, -1][k],
];

// The distance from `p` to a primitive.
export function distanceToPrimitive(p, primitive) {
  if (primitive.type === 'segment') {
    const d = sub(primitive.b, primitive.a);
    const l = dot(d, d);
    const t = l ? Math.max(0, Math.min(1, dot(sub(p, primitive.a), d) / l)) : 0;
    return Math.hypot(p[0] - primitive.a[0] - t * d[0], p[1] - primitive.a[1] - t * d[1]);
  }
  const off = len(sub(p, primitive.center));
  if (primitive.type === 'circle' || onArc(primitive, angleAt(primitive, p))) return Math.abs(off - primitive.radius);
  return Math.min(len(sub(p, primitive.a)), len(sub(p, primitive.b)));
}

// The unit direction of a primitive at a point on it (a curve's tangent, counter-clockwise).
export function directionAt(primitive, p) {
  if (primitive.type === 'segment') {
    const d = sub(primitive.b, primitive.a);
    const l = len(d);
    return l ? [d[0] / l, d[1] / l] : [0, 0];
  }
  const r = sub(p, primitive.center);
  const l = len(r);
  return l ? [-r[1] / l, r[0] / l] : [0, 0];
}

// Segment × segment: one point, or none when parallel (overlapping collinear
// segments included) or apart. An end on the other segment counts.
function segmentSegment(s, t) {
  const d1 = sub(s.b, s.a),
    d2 = sub(t.b, t.a);
  const l1 = len(d1),
    l2 = len(d2);
  if (!l1 || !l2) return [];
  const den = cross(d1, d2);
  if (Math.abs(den) <= 1e-12 * l1 * l2) return [];
  const w = sub(t.a, s.a);
  const u = cross(w, d2) / den,
    v = cross(w, d1) / den;
  const e1 = INTERSECT_EPS / l1,
    e2 = INTERSECT_EPS / l2;
  if (u < -e1 || u > 1 + e1 || v < -e2 || v > 1 + e2) return [];
  // An end on the other segment is that end exactly.
  if (Math.abs(u) <= e1) return [s.a];
  if (Math.abs(u - 1) <= e1) return [s.b];
  if (Math.abs(v) <= e2) return [t.a];
  if (Math.abs(v - 1) <= e2) return [t.b];
  return [[s.a[0] + u * d1[0], s.a[1] + u * d1[1]]];
}

// Segment × circle (or an arc's circle): through the foot of the
// perpendicular from the centre; a tangent is one point.
function segmentCircle(s, c) {
  const d = sub(s.b, s.a);
  const l = len(d);
  if (!l) return [];
  const u = [d[0] / l, d[1] / l];
  const w = sub(c.center, s.a);
  const along = dot(w, u),
    off = Math.abs(cross(u, w));
  const tolerance = INTERSECT_EPS * Math.max(1, c.radius);
  if (off > c.radius + tolerance) return [];
  const at = (t) => [s.a[0] + u[0] * t, s.a[1] + u[1] * t];
  const within = (t) => t >= -INTERSECT_EPS && t <= l + INTERSECT_EPS;
  const ends = (t) => (Math.abs(t) <= INTERSECT_EPS ? s.a : Math.abs(t - l) <= INTERSECT_EPS ? s.b : at(t));
  if (Math.abs(off - c.radius) <= tolerance) return within(along) ? [ends(along)] : [];
  const half = Math.sqrt(c.radius * c.radius - off * off);
  return [along - half, along + half].filter(within).map(ends);
}

// Circle × circle: none for one circle (or concentric ones), one for a tangent, else two.
function circleCircle(p, q) {
  const dv = sub(q.center, p.center);
  const d = len(dv);
  const tolerance = INTERSECT_EPS * Math.max(1, p.radius, q.radius);
  if (d <= tolerance) return [];
  if (d > p.radius + q.radius + tolerance || d < Math.abs(p.radius - q.radius) - tolerance) return [];
  const a = (p.radius * p.radius - q.radius * q.radius + d * d) / (2 * d);
  const u = [dv[0] / d, dv[1] / d];
  const foot = [p.center[0] + u[0] * a, p.center[1] + u[1] * a];
  if (Math.abs(d - (p.radius + q.radius)) <= tolerance || Math.abs(d - Math.abs(p.radius - q.radius)) <= tolerance)
    return [foot];
  const h = Math.sqrt(Math.max(0, p.radius * p.radius - a * a));
  return [
    [foot[0] - u[1] * h, foot[1] + u[0] * h],
    [foot[0] + u[1] * h, foot[1] - u[0] * h],
  ];
}

/**
 * Where two primitives meet: [] , [point] or [p, q]. Exact (closed form);
 * a tangent is one point; an arc's own range is respected (its ends
 * included); overlapping collinear segments, one circle or arc lying on the
 * other's circle, and concentric circles give none.
 */
export function intersect(p, q) {
  if (p.type === 'segment' && q.type === 'segment') return segmentSegment(p, q);
  if (p.type === 'segment') return onCurve(q, segmentCircle(p, q));
  if (q.type === 'segment') return onCurve(p, segmentCircle(q, p));
  return onCurve(q, onCurve(p, circleCircle(p, q)));
}

// The points one entity's primitives and another's meet at, each once (a
// rectangle corner on a line is one point, not two).
export function entityIntersections(a, b) {
  const points = [];
  for (const p of primitives(a))
    for (const q of primitives(b))
      for (const point of intersect(p, q))
        if (!points.some((other) => len(sub(other, point)) <= INTERSECT_EPS * 10)) points.push(point);
  return points;
}
