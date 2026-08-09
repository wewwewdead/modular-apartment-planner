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
 * Clip a subject polygon to a clip polygon. Returns the same region list shape
 * as `subtractPolygons` — a concave clip can split the subject into several
 * disjoint regions, each with its own outline and holes.
 */
export function intersectPolygons(subjectPoints, clipPoints) {
  if (!subjectPoints || subjectPoints.length < 3 || !clipPoints || clipPoints.length < 3) return [];

  try {
    return fromLibraryMultiPolygon(
      polygonClipping.intersection([toLibraryRing(subjectPoints)], [toLibraryRing(clipPoints)]),
    );
  } catch {
    return [];
  }
}

/**
 * Above this many input polygons, union them as a balanced binary tree instead
 * of in one flat call. The sweep-line cost grows with the number of edge
 * *intersections*, which for heavily-overlapping input is closer to quadratic
 * in the polygon count than linear — so a thousand overlapping quads in one
 * call is far slower than ten rounds of pairwise merges, even though the
 * pairwise route runs the algorithm many more times.
 */
const PAIRWISE_UNION_THRESHOLD = 16;

/**
 * Merge any number of simple polygons into their union. Overlapping shapes
 * fuse, disjoint shapes stay separate regions, and enclosed gaps become holes.
 *
 * Used by the shadow study, where a building's cast shadow is the union of its
 * footprint, its translated top face, and one quad per silhouette edge — a set
 * that overlaps heavily and must be merged before it can be drawn or measured.
 */
export function unionPolygons(polygons = []) {
  return unionRegions(polygons.map((outline) => ({ outline, holes: [] })));
}

/**
 * Merge polygons that may already contain holes.
 *
 * `unionPolygons` is the convenient API for simple rings. Environmental
 * projection also needs to union planar faces such as a wall ring or roof slab,
 * whose courtyard/light-well openings must remain holes until the inner side
 * faces actually shade them. Keeping that distinction through polygon-clipping
 * is what makes those shadows geometric rather than conservative silhouettes.
 */
export function unionRegions(regions = []) {
  const polygons = regions
    .filter((region) => region?.outline?.length >= 3)
    .map((region) => [
      toLibraryRing(region.outline),
      ...(region.holes || []).filter((hole) => hole?.length >= 3).map(toLibraryRing),
    ]);
  if (!polygons.length) return [];
  if (polygons.length === 1) return fromLibraryMultiPolygon(polygons);

  try {
    return fromLibraryMultiPolygon(
      polygons.length > PAIRWISE_UNION_THRESHOLD
        ? pairwiseUnion(polygons)
        : polygonClipping.union(polygons[0], ...polygons.slice(1)),
    );
  } catch {
    // Degenerate input (collinear or zero-area rings) — fall back to the
    // unmerged set rather than dropping geometry the caller can still draw.
    return polygons.flatMap((polygon) => fromLibraryMultiPolygon([polygon]));
  }
}

/**
 * Merge in rounds, pairing neighbours each pass. Each individual union stays
 * small and mostly-disjoint, and the tree is log(n) deep rather than one pass
 * over everything at once.
 */
function pairwiseUnion(multiPolygons) {
  let current = multiPolygons;

  while (current.length > 1) {
    const next = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1];
      next.push(right ? polygonClipping.union(left, right) : left);
    }
    current = next;
  }

  return current[0];
}

/**
 * Total area (mm²) of a native multipolygon list, holes subtracted. Pairs with
 * `unionPolygons` for "how much ground does this cover" questions.
 */
export function multiPolygonArea(regions = []) {
  return regions.reduce((total, region) => {
    const outer = Math.abs(polygonArea(region.outline || []));
    const holes = (region.holes || []).reduce((sum, hole) => sum + Math.abs(polygonArea(hole)), 0);
    return total + outer - holes;
  }, 0);
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
