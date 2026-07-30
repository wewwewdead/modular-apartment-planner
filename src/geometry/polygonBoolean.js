import polygonClipping from 'polygon-clipping';
import { polygonArea } from './polygon';

/**
 * Thin wrapper around the polygon-clipping library (Martinez-Rueda booleans).
 * Callers never touch the library API directly — everything speaks the app's
 * native `[{x, y}, ...]` polygon shape. Handles concave polygons, holes, and
 * degenerate inputs, which hand-rolled clipping cannot do reliably.
 */

function toLibraryRing(points) {
  return points.map((point) => [point.x, point.y]);
}

function ringArea(ring) {
  return polygonArea(ring.map(([x, y]) => ({ x, y })));
}

/**
 * Area of the intersection of two polygons (mm²). Returns 0 for disjoint,
 * degenerate (<3 vertices), or edge-only contact.
 */
export function intersectionArea(pointsA, pointsB) {
  if (!pointsA || pointsA.length < 3 || !pointsB || pointsB.length < 3) return 0;

  let result;
  try {
    result = polygonClipping.intersection([toLibraryRing(pointsA)], [toLibraryRing(pointsB)]);
  } catch {
    // The library throws on truly degenerate input (e.g. all-collinear rings).
    return 0;
  }

  let area = 0;
  for (const polygon of result) {
    polygon.forEach((ring, index) => {
      // Ring 0 is the outer boundary; subsequent rings are holes.
      area += index === 0 ? ringArea(ring) : -ringArea(ring);
    });
  }
  return area;
}
