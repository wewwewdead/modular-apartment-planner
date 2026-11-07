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

/**
 * The grid, in millimetres, every boolean input is snapped to. polygon-clipping
 * orders segments on its sweep line by exact floating-point comparisons, and
 * inputs that share edges "almost exactly" — a shadow's edge quads against its
 * caps, one moment's footprint edge against the next's — disagree in the last
 * few bits and throw "Unable to find segment …". On an integer-millimetre grid
 * those edges are identical or clearly apart, and the sweep can order them. One
 * millimetre is far below anything a shadow, a section cut or an overlap test
 * claims (docs/all-day-shadow-freeze.md §4.1).
 */
export const BOOLEAN_SNAP_GRID_MM = 1;

/** The coarser grid a piece is retried on when the 1 mm union still throws. */
const RETRY_SNAP_GRID_MM = 2;

/**
 * Round a ring's points to a `grid`-millimetre lattice. Consecutive points the
 * snap makes identical are merged (and a closing duplicate dropped); a ring left
 * with fewer than three points comes back empty, so callers can drop it.
 */
export function snapRing(points, grid = BOOLEAN_SNAP_GRID_MM) {
  if (!Array.isArray(points)) return [];
  const snapped = [];
  for (const point of points) {
    if (!point) continue;
    // `+ 0` turns a -0 into 0, so a snapped ring compares equal to itself.
    const x = grid > 0 ? Math.round(point.x / grid) * grid + 0 : point.x;
    const y = grid > 0 ? Math.round(point.y / grid) * grid + 0 : point.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const last = snapped[snapped.length - 1];
    if (last && last.x === x && last.y === y) continue;
    snapped.push({ x, y });
  }
  while (
    snapped.length > 1 &&
    snapped[0].x === snapped[snapped.length - 1].x &&
    snapped[0].y === snapped[snapped.length - 1].y
  ) {
    snapped.pop();
  }
  return snapped.length >= 3 ? snapped : [];
}

/** A ring snapped to `grid`, in the library's `[x, y]` form; empty when the snap degenerates it. */
function toSnappedLibraryRing(points, grid = BOOLEAN_SNAP_GRID_MM) {
  return toLibraryRing(snapRing(points, grid));
}

/** A region (outline + holes) as one snapped library polygon, or null when its outline degenerates. */
function toSnappedLibraryPolygon(region, grid = BOOLEAN_SNAP_GRID_MM) {
  const outline = toSnappedLibraryRing(region.outline, grid);
  if (outline.length < 3) return null;
  const holes = (region.holes || [])
    .filter((hole) => hole?.length >= 3)
    .map((hole) => toSnappedLibraryRing(hole, grid))
    .filter((ring) => ring.length >= 3);
  return [outline, ...holes];
}

/** A library multipolygon re-snapped to `grid`, degenerate rings and polygons dropped. */
function snapLibraryMultiPolygon(multiPolygon, grid) {
  const snapLibraryRing = (ring) =>
    toSnappedLibraryRing(
      ring.map(([x, y]) => ({ x, y })),
      grid,
    );
  return multiPolygon
    .map((polygon) => {
      const [outline, ...holes] = polygon.map(snapLibraryRing);
      if (!outline || outline.length < 3) return null;
      return [outline, ...holes.filter((ring) => ring.length >= 3)];
    })
    .filter(Boolean);
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
 *
 * Unlike the union and the difference, this one snaps only when asked
 * (`{ snap: true }`, as the shadow coverage readout does). Its many domain
 * callers measure deliberately sub-millimetre shapes — an opening drawn as a
 * 0.1 mm sliver to test whether it touches a column — that a 1 mm grid would
 * collapse to nothing.
 *
 * @param {Array} pointsA
 * @param {Array} pointsB
 * @param {object} [options]
 * @param {boolean} [options.snap]  Snap both rings to the 1 mm grid first.
 */
export function intersectionArea(pointsA, pointsB, { snap = false } = {}) {
  if (!pointsA || pointsA.length < 3 || !pointsB || pointsB.length < 3) return 0;

  const ringA = snap ? toSnappedLibraryRing(pointsA) : toLibraryRing(pointsA);
  const ringB = snap ? toSnappedLibraryRing(pointsB) : toLibraryRing(pointsB);
  if (ringA.length < 3 || ringB.length < 3) return 0;

  let result;
  try {
    result = polygonClipping.intersection([ringA], [ringB]);
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
 *
 * Every input is snapped to the 1 mm grid first (`snapRing`). When the library
 * still throws, the union does NOT give up and return the pieces unmerged — that
 * fallback once drew a day of shadow as 8,408 overlapping polygons and froze the
 * window on every slider step (docs/all-day-shadow-freeze.md). It merges the
 * pieces one at a time instead, each guarded; a piece that throws is retried on
 * a 2 mm grid, and only a piece that throws again is appended as its own region.
 *
 * @param {Array<{outline: Array, holes?: Array}>} regions
 * @param {object} [options]
 * @param {object} [options.stats]  Filled with `{ merged, appended, strategy }`:
 *   how many inputs went into the union, how many had to be appended unmerged,
 *   and whether the union ran as one call (or balanced pairwise rounds) —
 *   `'single'` — or piece by piece — `'incremental'`.
 * @param {'auto'|'incremental'} [options.strategy]  `'incremental'` skips the
 *   one-call attempt, for inputs known to defeat it (the day envelope's
 *   moments). Pieces are then merged in the order given.
 */
export function unionRegions(regions = [], options = {}) {
  const { stats = null, strategy = 'auto' } = options || {};
  const polygons = [];
  for (const region of regions) {
    if (!(region?.outline?.length >= 3)) continue;
    const polygon = toSnappedLibraryPolygon(region);
    if (polygon) polygons.push(polygon);
  }

  const report = (appended, used) => {
    if (stats) Object.assign(stats, { merged: polygons.length - appended, appended, strategy: used });
    if (appended > 0) warnUnmergedOnce(appended, polygons.length);
  };

  if (!polygons.length) {
    report(0, 'single');
    return [];
  }
  if (polygons.length === 1) {
    report(0, 'single');
    return fromLibraryMultiPolygon(polygons);
  }

  if (strategy !== 'incremental') {
    if (polygons.length > PAIRWISE_UNION_THRESHOLD) {
      const result = pairwiseUnion(polygons);
      report(result.appended.length, result.incremental ? 'incremental' : 'single');
      return fromLibraryMultiPolygon([...result.merged, ...result.appended]);
    }
    try {
      const merged = polygonClipping.union(polygons[0], ...polygons.slice(1));
      report(0, 'single');
      return fromLibraryMultiPolygon(merged);
    } catch {
      // Coincident edges the sweep line cannot order even on the grid — merge
      // piece by piece below rather than handing back the unmerged set.
    }
  }

  const result = incrementalUnion(polygons);
  report(result.appended.length, 'incremental');
  return fromLibraryMultiPolygon([...result.merged, ...result.appended]);
}

/**
 * Union library polygons one at a time into an accumulator. Each step unions
 * the running result with one piece, which is fast and far more robust than one
 * sweep over everything. A piece that throws is retried with the accumulator
 * and the piece both snapped to the 2 mm grid; one that throws again is kept
 * aside, unmerged, and counted — never fed into a further union (an unmerged
 * set sent back through polygon-clipping can loop for seconds).
 *
 * @param {Array} polygons  Library polygons.
 * @returns {{merged: Array, appended: Array}} A library multipolygon, plus the pieces kept aside.
 */
function incrementalUnion(polygons) {
  let merged = null;
  const appended = [];
  for (const polygon of polygons) {
    if (!merged) {
      try {
        merged = polygonClipping.union(polygon);
      } catch {
        merged = [polygon];
      }
      continue;
    }
    try {
      merged = polygonClipping.union(merged, polygon);
      continue;
    } catch {
      // Retried on the coarser grid below.
    }
    try {
      const piece = snapLibraryMultiPolygon([polygon], RETRY_SNAP_GRID_MM);
      if (piece.length) merged = polygonClipping.union(snapLibraryMultiPolygon(merged, RETRY_SNAP_GRID_MM), piece);
    } catch {
      appended.push(polygon);
    }
  }
  return { merged: merged || [], appended };
}

/**
 * One "pieces left unmerged" warning per session, in dev builds only, so a
 * silent fallback cannot come back unnoticed.
 */
let warnedUnmerged = false;
function warnUnmergedOnce(appended, total) {
  if (warnedUnmerged || !import.meta.env?.DEV) return;
  warnedUnmerged = true;
  console.warn(
    `[polygonBoolean] unionRegions left ${appended} of ${total} pieces unmerged: polygon-clipping threw on them ` +
      'even on the 2 mm retry grid, so areas measured from this union may double-count their overlaps.',
  );
}

/**
 * Merge in rounds, pairing neighbours each pass. Each individual union stays
 * small and mostly-disjoint, and the tree is log(n) deep rather than one pass
 * over everything at once.
 *
 * Each pair is guarded: when the library throws on a pair, the two sides are
 * merged piece by piece instead of failing the whole round. Anything even that
 * cannot merge is set aside for the result, never carried into the next round.
 *
 * @param {Array} polygons  Library polygons (already snapped).
 * @returns {{merged: Array, appended: Array, incremental: boolean}}
 */
function pairwiseUnion(polygons) {
  let current = polygons.map((polygon) => [polygon]);
  const appended = [];
  let incremental = false;

  while (current.length > 1) {
    const next = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1];
      if (!right) {
        next.push(left);
        continue;
      }
      try {
        next.push(polygonClipping.union(left, right));
      } catch {
        incremental = true;
        const result = incrementalUnion([...left, ...right]);
        next.push(result.merged);
        appended.push(...result.appended);
      }
    }
    current = next;
  }

  return { merged: current[0] || [], appended, incremental };
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
  // Snapped to the 1 mm grid like the other booleans here. A subject the snap
  // collapses (sub-millimetre) comes back untouched, as an uncut one does.
  const snappedSubject = toSnappedLibraryRing(subject);
  const validCuts = cuts
    .filter((cut) => cut?.length >= 3)
    .map((cut) => toSnappedLibraryRing(cut))
    .filter((ring) => ring.length >= 3);
  if (!validCuts.length || snappedSubject.length < 3) {
    return [{ outline: subject.map((point) => ({ ...point })), holes: [] }];
  }

  try {
    return fromLibraryMultiPolygon(polygonClipping.difference([snappedSubject], ...validCuts.map((cut) => [cut])));
  } catch {
    return [{ outline: subject.map((point) => ({ ...point })), holes: [] }];
  }
}
