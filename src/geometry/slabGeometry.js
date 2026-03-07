import { polygonArea, polygonCentroid, pointInPolygon } from './polygon';

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

export function getSlabRenderData(slab) {
  if (!slab || !isValidSlabBoundary(slab.boundaryPoints)) return null;

  return {
    outline: normalizeSlabBoundary(slab.boundaryPoints),
    area: slabArea(slab),
    centroid: slabCentroid(slab),
    points: slabSvgPoints(slab),
  };
}
