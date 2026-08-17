import { polygonArea, polygonCentroid, pointInPolygon, signedPolygonArea } from './polygon';

const EDGE_EPSILON = 1e-6;

export function normalizeSlabBoundary(boundaryPoints = []) {
  return boundaryPoints.map((point) => ({ x: point.x, y: point.y }));
}

export function slabArea(slab) {
  return polygonArea(slab?.boundaryPoints || []);
}

export function slabCentroid(slab) {
  const boundaryPoints = slab?.boundaryPoints || [];
  if (boundaryPoints.length < 3) return { x: 0, y: 0 };
  return polygonCentroid(boundaryPoints);
}

export function isValidSlabBoundary(boundaryPoints = []) {
  return boundaryPoints.length >= 3 && polygonArea(boundaryPoints) > 0;
}

export function slabSvgPoints(slab) {
  return (slab?.boundaryPoints || []).map((point) => `${point.x},${point.y}`).join(' ');
}

export function slabContainsPoint(slab, point) {
  const boundaryPoints = slab?.boundaryPoints || [];
  if (boundaryPoints.length < 3) return false;
  return pointInPolygon(point, boundaryPoints);
}

/**
 * Unit normal pointing OUT of the plate, for the edge that starts at
 * `edgeIndex` and ends at the next vertex.
 *
 * Which perpendicular is "out" depends on which way the ring winds, and slabs
 * are traced by hand in either direction, so the winding is read off the signed
 * area rather than assumed. For a positively-wound ring the outward side of a
 * step (dx, dy) is (dy, -dx); a negatively-wound ring is the same ring walked
 * backwards, so the answer flips with it. Purely algebraic, which is what makes
 * it correct in the y-down plan space as well.
 *
 * Returns null when the edge has no direction (coincident vertices) or the ring
 * has no area to be outside of — a degenerate drag with nothing to push.
 */
export function slabEdgeOutwardNormal(boundaryPoints = [], edgeIndex = 0) {
  const count = boundaryPoints.length;
  if (count < 3 || !Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= count) return null;

  const start = boundaryPoints[edgeIndex];
  const end = boundaryPoints[(edgeIndex + 1) % count];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < EDGE_EPSILON) return null;

  const winding = signedPolygonArea(boundaryPoints);
  if (Math.abs(winding) < EDGE_EPSILON) return null;

  const sign = winding > 0 ? 1 : -1;
  return { x: (dy / length) * sign, y: (-dx / length) * sign };
}

/**
 * Translates one edge along its outward normal, carrying both of its vertices
 * and leaving the rest of the ring alone — pushing a floor plate out into a
 * cantilever. A negative distance pulls it back in.
 *
 * Returns null when the edge has no outward direction (see
 * `slabEdgeOutwardNormal`). Self-intersection is NOT prevented: pushed far
 * enough inward an edge will cross another, and the caller gets the crossed
 * ring it asked for.
 */
export function offsetSlabEdge(boundaryPoints = [], edgeIndex = 0, distance = 0) {
  const normal = slabEdgeOutwardNormal(boundaryPoints, edgeIndex);
  if (!normal) return null;

  const count = boundaryPoints.length;
  const endIndex = (edgeIndex + 1) % count;

  return boundaryPoints.map((point, index) =>
    index === edgeIndex || index === endIndex
      ? { x: point.x + normal.x * distance, y: point.y + normal.y * distance }
      : { x: point.x, y: point.y },
  );
}

export function getSlabRenderData(slab) {
  if (!slab || !isValidSlabBoundary(slab.boundaryPoints)) return null;

  return {
    outline: normalizeSlabBoundary(slab.boundaryPoints),
    area: slabArea(slab),
    centroid: slabCentroid(slab),
    points: slabSvgPoints(slab),
  };
}
