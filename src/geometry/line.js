import { subtract, dot, add, scale, distance } from './point';

export function nearestPointOnSegment(p, a, b) {
  const ab = subtract(b, a);
  const ap = subtract(p, a);
  const lenSq = dot(ab, ab);
  if (lenSq === 0) return { point: { ...a }, t: 0 };
  let t = dot(ap, ab) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return {
    point: add(a, scale(ab, t)),
    t,
  };
}

export function distanceToSegment(p, a, b) {
  const { point } = nearestPointOnSegment(p, a, b);
  return distance(p, point);
}

export function segmentLength(a, b) {
  return distance(a, b);
}

export function segmentIntersection(a1, a2, b1, b2) {
  const d1 = subtract(a2, a1);
  const d2 = subtract(b2, b1);
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-10) return null;

  const d = subtract(b1, a1);
  const t = (d.x * d2.y - d.y * d2.x) / cross;
  const u = (d.x * d1.y - d.y * d1.x) / cross;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return add(a1, scale(d1, t));
  }
  return null;
}
