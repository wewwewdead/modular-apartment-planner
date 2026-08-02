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

function fromLibraryRing(ring) {
  const points = ring.map(([x, y]) => ({ x, y }));
  if (points.length > 1 && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y) {
    points.pop();
  }
  return points;
}

function fromLibraryMultiPolygon(result) {
  return result
    .map((polygon) => ({
      outline: fromLibraryRing(polygon[0] || []),
      holes: polygon
        .slice(1)
        .map(fromLibraryRing)
        .filter((ring) => ring.length >= 3),
    }))
    .filter((polygon) => polygon.outline.length >= 3);
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

/**
 * Subtract one or more simple polygons from a subject polygon. The result is a
 * list because a cut can divide a panel into separate regions. Each region has
 * one outer outline and zero or more holes, all in the app's native point form.
 */
export function subtractPolygons(subject, cuts = []) {
  if (!subject || subject.length < 3) return [];
  const validCuts = cuts.filter((cut) => cut?.length >= 3);
  if (!validCuts.length) return [{ outline: subject.map((point) => ({ ...point })), holes: [] }];

  try {
    return fromLibraryMultiPolygon(
      polygonClipping.difference([toLibraryRing(subject)], ...validCuts.map((cut) => [toLibraryRing(cut)])),
    );
  } catch {
    return [{ outline: subject.map((point) => ({ ...point })), holes: [] }];
  }
}
