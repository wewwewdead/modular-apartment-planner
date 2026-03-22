import { distance, subtract, normalize, add, scale, dot, perpendicular } from './point';
import { segmentLength } from './line';
import { ENDPOINT_MERGE_TOLERANCE } from '@/domain/defaults';

const ARC_SEGMENTS = 16;

/**
 * Evaluate a quadratic Bezier curve at parameter t.
 */
export function interpolateQuadratic(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/**
 * Tangent vector of a quadratic Bezier at parameter t (not normalized).
 */
function quadraticTangent(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
  };
}

/**
 * Sample N+1 points along a quadratic Bezier.
 */
export function sampleArc(start, controlPoint, end, numSegments = ARC_SEGMENTS) {
  const points = [];
  for (let i = 0; i <= numSegments; i++) {
    points.push(interpolateQuadratic(start, controlPoint, end, i / numSegments));
  }
  return points;
}

/**
 * Approximate arc length of a quadratic Bezier by summing sample segment lengths.
 */
export function arcWallLength(wall, numSegments = ARC_SEGMENTS) {
  const points = sampleArc(wall.start, wall.controlPoint, wall.end, numSegments);
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += distance(points[i - 1], points[i]);
  }
  return len;
}

/**
 * Generate a thick polygon outline for an arc wall by offsetting sample points
 * along the curve normal by ±halfThickness.
 */
export function arcWallOutline(wall, numSegments = ARC_SEGMENTS) {
  const { start, controlPoint, end, thickness } = wall;
  const halfThick = thickness / 2;
  const outer = [];
  const inner = [];

  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const pt = interpolateQuadratic(start, controlPoint, end, t);
    const tan = quadraticTangent(start, controlPoint, end, t);
    const n = normalize(tan);
    const perp = perpendicular(n);

    outer.push(add(pt, scale(perp, halfThick)));
    inner.push(subtract(pt, scale(perp, halfThick)));
  }

  return [...outer, ...inner.reverse()];
}

/**
 * Find a corner where exactly 2 walls share an endpoint near clickPoint.
 * Returns { cornerPoint, wall1, wall1Endpoint, wall2, wall2Endpoint } or null.
 */
export function findCorner(walls, clickPoint, tolerance) {
  // Collect all endpoints
  const endpoints = [];
  for (const wall of walls) {
    // Skip arc walls — they don't form fillettable corners
    if (wall.controlPoint) continue;
    endpoints.push({ wall, key: 'start', point: wall.start });
    endpoints.push({ wall, key: 'end', point: wall.end });
  }

  // Group endpoints by proximity (merge tolerance)
  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < endpoints.length; i++) {
    if (assigned.has(i)) continue;
    const group = [endpoints[i]];
    assigned.add(i);
    for (let j = i + 1; j < endpoints.length; j++) {
      if (assigned.has(j)) continue;
      if (distance(endpoints[i].point, endpoints[j].point) <= ENDPOINT_MERGE_TOLERANCE) {
        group.push(endpoints[j]);
        assigned.add(j);
      }
    }
    groups.push(group);
  }

  // Find the group nearest to clickPoint that has exactly 2 distinct walls
  let bestGroup = null;
  let bestDist = Infinity;

  for (const group of groups) {
    // Ensure exactly 2 distinct walls
    const wallIds = new Set(group.map(ep => ep.wall.id));
    if (wallIds.size !== 2) continue;

    const centroid = {
      x: group.reduce((s, ep) => s + ep.point.x, 0) / group.length,
      y: group.reduce((s, ep) => s + ep.point.y, 0) / group.length,
    };
    const dist = distance(clickPoint, centroid);
    if (dist < bestDist && dist <= tolerance) {
      bestDist = dist;
      bestGroup = group;
    }
  }

  if (!bestGroup) return null;

  // Extract the two wall entries
  const wallEntries = [];
  const seenWalls = new Set();
  for (const ep of bestGroup) {
    if (!seenWalls.has(ep.wall.id)) {
      seenWalls.add(ep.wall.id);
      wallEntries.push(ep);
    }
  }
  if (wallEntries.length !== 2) return null;

  const cornerPoint = {
    x: bestGroup.reduce((s, ep) => s + ep.point.x, 0) / bestGroup.length,
    y: bestGroup.reduce((s, ep) => s + ep.point.y, 0) / bestGroup.length,
  };

  return {
    cornerPoint,
    wall1: wallEntries[0].wall,
    wall1Endpoint: wallEntries[0].key,
    wall2: wallEntries[1].wall,
    wall2Endpoint: wallEntries[1].key,
  };
}

/**
 * Compute the fillet geometry for two walls meeting at a corner.
 * Returns { tangentPoint1, tangentPoint2, controlPoint, radius } or null if invalid.
 */
export function computeFilletGeometry(wall1, wall1Endpoint, wall2, wall2Endpoint, radius) {
  // Corner point is the shared endpoint
  const corner = { ...wall1[wall1Endpoint] };

  // Direction vectors going AWAY from the corner
  const other1 = wall1Endpoint === 'start' ? wall1.end : wall1.start;
  const other2 = wall2Endpoint === 'start' ? wall2.end : wall2.start;

  const dir1 = normalize(subtract(other1, corner));
  const dir2 = normalize(subtract(other2, corner));

  // Angle between the two direction vectors
  const cosAngle = Math.max(-1, Math.min(1, dot(dir1, dir2)));
  const angle = Math.acos(cosAngle);

  // Reject nearly parallel or coincident walls (angle close to 0 or PI)
  if (angle < 0.05 || angle > Math.PI - 0.05) return null;

  // Tangent distance from corner to tangent point
  const halfAngle = angle / 2;
  const tangentDist = radius / Math.tan(halfAngle);

  // Check both walls are long enough
  const len1 = segmentLength(corner, other1);
  const len2 = segmentLength(corner, other2);
  if (tangentDist >= len1 - 1 || tangentDist >= len2 - 1) return null;

  // Tangent points on each wall
  const tangentPoint1 = add(corner, scale(dir1, tangentDist));
  const tangentPoint2 = add(corner, scale(dir2, tangentDist));

  // The control point for the quadratic Bezier is the original corner point.
  // This produces a smooth curve tangent to both walls at the tangent points.
  const controlPoint = { ...corner };

  return {
    tangentPoint1,
    tangentPoint2,
    controlPoint,
    radius,
  };
}
