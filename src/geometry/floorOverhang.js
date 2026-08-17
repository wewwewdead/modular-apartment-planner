/**
 * Where a storey's slab reaches out past the storey below it.
 *
 * A cantilevered floor is not a property anyone sets — it is what you get when
 * an upper slab is drawn wider than the one under it. So it has to be measured,
 * not read: walk the upper slab's boundary, ask of each point whether anything
 * below it is holding it up, and report the stretches where nothing is.
 *
 * Everything here is plan geometry in millimetres. Nothing in this module knows
 * about elevations, loads or capacity — the depth it reports is a plan
 * dimension, and what that depth *means* structurally is a question for
 * `structuralCoordination`.
 */

import { getOrderedFloors } from '@/domain/floorModels';
import { distanceToSegment, segmentIntersection } from './line';
import { distance, dot, lerp } from './point';
import { pointInPolygon, signedPolygonArea } from './polygon';
import { isValidSlabBoundary } from './slabGeometry';

/**
 * Mirrors STRUCTURAL_ALIGNMENT_TOLERANCE in `@/domain/buildingGraph`. Kept as a
 * local copy on purpose: that module pulls in the whole validation graph, and
 * this one is meant to stay importable from plain geometry code.
 */
const ALIGNMENT_TOLERANCE_MM = 25;

/** Boundary sampling step. Finer than any overhang worth reporting. */
const SAMPLE_SPACING_MM = 100;

/** Under this an "overhang" is snap noise, not a design move. */
export const MIN_REPORTED_OVERHANG_MM = 50;

/** How close a beam axis has to run to an overhanging edge to be under it. */
export const BEAM_SUPPORT_PROXIMITY_MM = 150;

function distanceToPolygonBoundary(point, polygon) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    minimum = Math.min(minimum, distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]));
  }
  return minimum;
}

/**
 * A sample is carried when it sits inside any polygon below, or close enough to
 * one's edge that the difference is a snap. Otherwise its overhang depth is how
 * far it is from the nearest thing below — the reach it has beyond support.
 */
function sampleCoverage(point, polygons, tolerance) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const polygon of polygons) {
    const gap = distanceToPolygonBoundary(point, polygon);
    if (gap <= tolerance || pointInPolygon(point, polygon)) return { covered: true, depth: 0 };
    if (gap < nearest) nearest = gap;
  }
  return { covered: false, depth: nearest };
}

function edgeOverhangRuns(start, end, polygons, spacing, tolerance, boundaryEdgeIndex) {
  const length = distance(start, end);
  if (length < 1e-6) return [];

  const steps = Math.max(1, Math.ceil(length / spacing));
  const runs = [];
  let current = null;

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const { covered, depth } = sampleCoverage(lerp(start, end, t), polygons, tolerance);
    if (covered) {
      if (current) runs.push(current);
      current = null;
      continue;
    }
    if (!current) current = { fromT: t, toT: t, depthMm: depth };
    else {
      current.toT = t;
      current.depthMm = Math.max(current.depthMm, depth);
    }
  }
  if (current) runs.push(current);

  // A run really reaches halfway to the carried samples on either side of it.
  // Without that a single overhanging sample collapses to a zero-length edge,
  // which nothing downstream — dimensioning, beam proximity — can use.
  const half = 0.5 / steps;
  return runs.map((run) => {
    const runStart = lerp(start, end, Math.max(0, run.fromT - half));
    const runEnd = lerp(start, end, Math.min(1, run.toT + half));
    // How far the overhang runs ALONG the building edge, as opposed to how far
    // it reaches out past it. Both are needed to say what a cantilever is.
    //
    // `boundaryEdgeIndex` is the run's way back to the plate it came off: a run
    // is a SUB-SEGMENT of one boundary edge, and the only thing anyone can
    // actually edit is that edge. Without it a caller wanting to pull the
    // overhang back would have to re-derive which edge this stretch lies on,
    // and re-derivation by proximity gets it wrong exactly where it matters —
    // at a corner, where two edges are equally close.
    return {
      start: runStart,
      end: runEnd,
      depthMm: run.depthMm,
      lengthMm: distance(runStart, runEnd),
      boundaryEdgeIndex,
    };
  });
}

/** The slabs a floor presents to the storey above: the ones with a real ring. */
export function getFloorFootprintSlabs(floor) {
  return (floor?.slabs || []).filter((slab) => isValidSlabBoundary(slab.boundaryPoints));
}

/** The plan outlines a floor presents to the storey above: its valid slabs. */
export function getFloorFootprintPolygons(floor) {
  return getFloorFootprintSlabs(floor).map((slab) => slab.boundaryPoints.map((point) => ({ x: point.x, y: point.y })));
}

/**
 * Measure one slab against what is under it.
 *
 * Returns null when there is nothing below to compare against — an empty floor
 * is not evidence that the whole slab is cantilevered, it is an absence of
 * evidence, and reporting the entire perimeter as an overhang would bury the
 * real ones.
 *
 * @param {object} slab
 * @param {Array<Array<{x: number, y: number}>>} belowPolygons
 * @param {object} [options]
 * @param {number} [options.sampleSpacingMm]
 * @param {number} [options.toleranceMm]
 * @returns {{slabId: string, overhangEdges: Array<{start: {x: number, y: number},
 *   end: {x: number, y: number}, depthMm: number, lengthMm: number,
 *   boundaryEdgeIndex: number}>, maxDepthMm: number} | null}
 */
export function computeSlabOverhang(slab, belowPolygons, options = {}) {
  const boundary = slab?.boundaryPoints || [];
  if (!isValidSlabBoundary(boundary)) return null;

  const polygons = (belowPolygons || []).filter((polygon) => (polygon || []).length >= 3);
  if (!polygons.length) return null;

  const spacing = options.sampleSpacingMm ?? SAMPLE_SPACING_MM;
  const tolerance = options.toleranceMm ?? ALIGNMENT_TOLERANCE_MM;

  const overhangEdges = [];
  let maxDepthMm = 0;

  for (let index = 0; index < boundary.length; index += 1) {
    const runs = edgeOverhangRuns(
      boundary[index],
      boundary[(index + 1) % boundary.length],
      polygons,
      spacing,
      tolerance,
      index,
    );
    for (const run of runs) {
      overhangEdges.push(run);
      maxDepthMm = Math.max(maxDepthMm, run.depthMm);
    }
  }

  return { slabId: slab.id, overhangEdges, maxDepthMm };
}

/**
 * Every slab in the project that reaches past the storey below it.
 *
 * "Below" is the previous floor in `getOrderedFloors`, so a project's lowest
 * floor is never reported: there is nothing under it to overhang.
 *
 * @param {object} project
 * @returns {Array<{floorId: string, belowFloorId: string, slabId: string,
 *   overhangEdges: Array<{start: {x: number, y: number}, end: {x: number, y: number},
 *   depthMm: number, lengthMm: number, boundaryEdgeIndex: number}>, maxDepthMm: number}>}
 */
export function computeFloorOverhangs(project) {
  const floors = getOrderedFloors(project);
  const overhangs = [];

  for (let index = 1; index < floors.length; index += 1) {
    const floor = floors[index];
    const below = floors[index - 1];
    const belowPolygons = getFloorFootprintPolygons(below);
    if (!belowPolygons.length) continue;

    for (const slab of floor.slabs || []) {
      const measured = computeSlabOverhang(slab, belowPolygons);
      if (!measured || measured.maxDepthMm <= MIN_REPORTED_OVERHANG_MM) continue;
      overhangs.push({ floorId: floor.id, belowFloorId: below.id, ...measured });
    }
  }

  return overhangs;
}

/**
 * How far along the ray from `origin` the footprint below begins, or null when
 * the ray never reaches it.
 *
 * Cast rather than stepped: the answer is a distance, and a distance found by
 * intersecting the ray with the footprint's own edges is exact. Sampling for it
 * would land on a multiple of whatever step was chosen, and "pull the edge back
 * 587.5 mm" is not a dimension anyone drew.
 */
function firstCoveredTravelMm(origin, direction, polygons, reachMm, tolerance) {
  if (sampleCoverage(origin, polygons, tolerance).covered) return 0;

  const tip = { x: origin.x + direction.x * reachMm, y: origin.y + direction.y * reachMm };
  let nearest = null;
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const crossing = segmentIntersection(origin, tip, polygon[index], polygon[(index + 1) % polygon.length]);
      if (!crossing) continue;
      const travel = distance(origin, crossing);
      if (nearest === null || travel < nearest) nearest = travel;
    }
  }
  return nearest;
}

/**
 * How far this run's own boundary edge has to travel inward before the run
 * lands on the storey below. Null when moving that edge cannot get it there.
 *
 * NOT the same number as the run's `depthMm`, and the difference is the whole
 * reason this exists. The depth is the distance to the NEAREST thing below,
 * measured in whatever direction that thing happens to lie; the edge can only
 * move along its own normal. The two agree when the support line below runs
 * parallel to the edge — the ordinary rectangular case — and diverge everywhere
 * else, always by understating the travel.
 *
 * Samples that nothing can carry are skipped rather than counted. A run at the
 * corner of a bay that projects on two sides hangs over the diagonal gap
 * because of the OTHER edge, and no amount of pulling this one back reaches it;
 * demanding that it be covered would refuse an operation that is perfectly
 * well defined, and answering it by moving this edge forever would be worse.
 * Null means every sample was like that — the run belongs to the edge next to
 * it, and that is the one to pull back.
 *
 * @param {{start: {x: number, y: number}, end: {x: number, y: number}}} run
 * @param {Array<{x: number, y: number}>} boundary the overhanging slab's outline
 * @param {Array<Array<{x: number, y: number}>>} belowPolygons
 * @param {object} [options]
 * @returns {number | null} millimetres of inward travel
 */
export function overhangRunRetractionMm(run, boundary, belowPolygons, options = {}) {
  const inward = overhangEdgeInwardNormal(run, boundary);
  if (!inward) return null;

  const polygons = (belowPolygons || []).filter((polygon) => (polygon || []).length >= 3);
  if (!polygons.length) return null;

  const tolerance = options.toleranceMm ?? ALIGNMENT_TOLERANCE_MM;
  // There is no point searching further in than there is plate to give up.
  const reachMm = boundary.reduce(
    (deepest, point) => Math.max(deepest, (point.x - run.start.x) * inward.x + (point.y - run.start.y) * inward.y),
    0,
  );
  if (!(reachMm > 0)) return null;

  // Finer than the measurement's own step: this is looking for the WORST point
  // along the run, and a peak that falls between two samples is a peak that
  // stays hanging.
  const spacing = options.sampleSpacingMm ?? tolerance;
  const steps = Math.max(1, Math.ceil(distance(run.start, run.end) / spacing));

  let needed = null;
  for (let index = 0; index <= steps; index += 1) {
    const travel = firstCoveredTravelMm(lerp(run.start, run.end, index / steps), inward, polygons, reachMm, tolerance);
    if (travel === null) continue;
    if (needed === null || travel > needed) needed = travel;
  }
  return needed;
}

/** Closest approach of two plan segments; zero when they cross or touch. */
export function segmentGap(firstStart, firstEnd, secondStart, secondEnd) {
  if (segmentIntersection(firstStart, firstEnd, secondStart, secondEnd)) return 0;
  return Math.min(
    distanceToSegment(firstStart, secondStart, secondEnd),
    distanceToSegment(firstEnd, secondStart, secondEnd),
    distanceToSegment(secondStart, firstStart, firstEnd),
    distanceToSegment(secondEnd, firstStart, firstEnd),
  );
}

/**
 * Does a beam axis run under any of these overhanging edges?
 *
 * Plan test only — whether the beam is at the right height to carry the slab is
 * a separate question, and the caller answers it.
 *
 * @param {{start: {x: number, y: number}, end: {x: number, y: number}}} axis
 * @param {Array<{start: {x: number, y: number}, end: {x: number, y: number}}>} overhangEdges
 * @param {number} [proximityMm]
 */
export function beamSupportsOverhang(axis, overhangEdges = [], proximityMm = BEAM_SUPPORT_PROXIMITY_MM) {
  if (!axis?.start || !axis?.end) return false;
  return (overhangEdges || []).some((edge) => segmentGap(axis.start, axis.end, edge.start, edge.end) <= proximityMm);
}

/* ── Laying out beams under an overhang ──────────────────────────────────
 *
 * Measuring an overhang says where it is. Carrying one is a placement problem:
 * beams reach out from the frame below and stop on the projecting edge, spaced
 * closely enough that no stretch of the edge is left hanging between them.
 *
 * Everything below is plan geometry and returns intentions, not beams — which
 * floor they are filed on, how deep they are and what a "column" is belong to
 * the domain layer.
 */

/** No stretch of a projecting edge is left further than this from a beam. */
export const OVERHANG_SUPPORT_SPACING_MM = 1800;

/** End stations step back from the corner so a beam does not land on it. */
export const OVERHANG_SUPPORT_END_INSET_MM = 150;

/**
 * A station this close to a beam already running under the edge is that beam's
 * station, not a new one.
 *
 * Measured from the station rather than between whole axes: support beams fan
 * out from the columns they share, so two of them always touch at their inboard
 * end and an axis-to-axis gap would read every fan as one beam drawn twice.
 */
export const OVERHANG_SUPPORT_MIN_SEPARATION_MM = 300;

/** How far off the inward normal a column may sit and still anchor a beam. */
export const OVERHANG_SUPPORT_MAX_DEVIATION_DEGREES = 30;

/** Reach of the search for an anchoring column, in plan. */
export const OVERHANG_SUPPORT_MAX_SPAN_MM = 6000;

/**
 * Where beams should meet one overhanging run.
 *
 * One station near each end so the corners are held, and enough in between that
 * no gap exceeds the spacing. The end inset keeps a beam off the corner itself,
 * where it would foul the returning edge.
 *
 * A run too short to carry two stations further apart than the minimum beam
 * separation — anything up to about 600 mm, which covers the nibs and rebates a
 * pair of beams would only duplicate — gets a single beam at its midpoint.
 *
 * @param {{start: {x: number, y: number}, end: {x: number, y: number}}} edge
 * @param {object} [options]
 * @param {number} [options.spacingMm]
 * @param {number} [options.endInsetMm]
 * @param {number} [options.minSeparationMm]
 * @returns {Array<{x: number, y: number}>} points on the edge, run start first
 */
export function overhangSupportStations(edge, options = {}) {
  const start = edge?.start;
  const end = edge?.end;
  if (!start || !end) return [];
  const length = distance(start, end);
  if (!(length > 0)) return [];

  const spacing = options.spacingMm ?? OVERHANG_SUPPORT_SPACING_MM;
  const inset = options.endInsetMm ?? OVERHANG_SUPPORT_END_INSET_MM;
  const minSeparation = options.minSeparationMm ?? OVERHANG_SUPPORT_MIN_SEPARATION_MM;

  const first = Math.min(inset, length / 2);
  const span = length - 2 * first;
  if (span <= minSeparation) return [lerp(start, end, 0.5)];

  const intervals = Math.max(1, Math.ceil(span / spacing));
  const stations = [];
  for (let index = 0; index <= intervals; index += 1) {
    stations.push(lerp(start, end, (first + (span * index) / intervals) / length));
  }
  return stations;
}

/**
 * The unit normal of an overhanging edge that points back into the slab.
 *
 * Read off the boundary's winding rather than by probing a point inside: the
 * probe has to guess a distance, and on a slab arm narrower than that guess it
 * guesses wrong. This is exact — but only for an edge running the way the
 * boundary does, which is how `computeSlabOverhang` reports them.
 *
 * @param {{start: {x: number, y: number}, end: {x: number, y: number}}} edge
 * @param {Array<{x: number, y: number}>} boundary
 * @returns {{x: number, y: number} | null}
 */
export function overhangEdgeInwardNormal(edge, boundary) {
  if (!edge?.start || !edge?.end || (boundary || []).length < 3) return null;
  const dx = edge.end.x - edge.start.x;
  const dy = edge.end.y - edge.start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return null;

  const winding = signedPolygonArea(boundary) >= 0 ? 1 : -1;
  return { x: (-dy / length) * winding, y: (dx / length) * winding };
}

/**
 * The column a beam at this station should reach back to.
 *
 * Nearest wins, among the columns that lie roughly the way the beam wants to
 * run — a column off to the side is reachable, but a beam angled at it stops
 * being a cantilever perpendicular to the edge and becomes a diagonal nobody
 * asked for.
 *
 * @param {{x: number, y: number}} station
 * @param {{x: number, y: number}} inward unit normal, pointing into the slab
 * @param {Array<{id: string, x: number, y: number}>} columns
 * @param {object} [options]
 * @param {number} [options.maxSpanMm]
 * @param {number} [options.maxDeviationDegrees]
 * @returns {{column: object, spanMm: number, deviationDegrees: number} | null}
 */
export function findOverhangSupportColumn(station, inward, columns, options = {}) {
  if (!station || !inward) return null;
  const maxSpan = options.maxSpanMm ?? OVERHANG_SUPPORT_MAX_SPAN_MM;
  const maxDeviation = options.maxDeviationDegrees ?? OVERHANG_SUPPORT_MAX_DEVIATION_DEGREES;

  let best = null;
  for (const column of columns || []) {
    if (!Number.isFinite(column?.x) || !Number.isFinite(column?.y)) continue;
    const offset = { x: column.x - station.x, y: column.y - station.y };
    const spanMm = Math.hypot(offset.x, offset.y);
    if (!(spanMm > 0) || spanMm > maxSpan) continue;
    const cosine = Math.max(-1, Math.min(1, dot(inward, { x: offset.x / spanMm, y: offset.y / spanMm })));
    const deviationDegrees = (Math.acos(cosine) * 180) / Math.PI;
    if (deviationDegrees > maxDeviation) continue;
    if (!best || spanMm < best.spanMm) best = { column, spanMm, deviationDegrees };
  }
  return best;
}

/**
 * Beams to plant under one slab's overhang.
 *
 * Stations that already have a beam running under them are left alone, so
 * running this twice plants nothing the second time; stations with no column
 * to reach back to are counted rather than forced, because a beam anchored on
 * nothing is worse than an honest gap.
 *
 * @param {object} input
 * @param {Array<{start: {x: number, y: number}, end: {x: number, y: number}}>} input.overhangEdges
 * @param {Array<{x: number, y: number}>} input.boundary the overhanging slab's outline
 * @param {Array<{id: string, x: number, y: number}>} input.columns on the floor below
 * @param {Array<{start: {x: number, y: number}, end: {x: number, y: number}}>} [input.existingAxes]
 *   axes of beams already carrying this overhang, at the right level
 * @param {object} [options] forwarded to the station and column helpers
 * @returns {{placements: Array<{freeEnd: {x: number, y: number}, columnId: string,
 *   spanMm: number, deviationDegrees: number, edgeIndex: number}>, stationCount: number,
 *   carriedStationCount: number, skippedStationCount: number}}
 */
export function planOverhangSupportBeams(
  { overhangEdges = [], boundary = [], columns = [], existingAxes = [] } = {},
  options = {},
) {
  const minSeparation = options.minSeparationMm ?? OVERHANG_SUPPORT_MIN_SEPARATION_MM;
  const claimed = (existingAxes || []).map((axis) => ({ start: axis.start, end: axis.end }));
  const placements = [];
  let stationCount = 0;
  let carriedStationCount = 0;
  let skippedStationCount = 0;

  (overhangEdges || []).forEach((edge, edgeIndex) => {
    const inward = overhangEdgeInwardNormal(edge, boundary);
    if (!inward) return;

    for (const freeEnd of overhangSupportStations(edge, options)) {
      stationCount += 1;
      if (claimed.some((entry) => distanceToSegment(freeEnd, entry.start, entry.end) <= minSeparation)) {
        carriedStationCount += 1;
        continue;
      }
      const support = findOverhangSupportColumn(freeEnd, inward, columns, options);
      if (!support) {
        skippedStationCount += 1;
        continue;
      }
      claimed.push({ start: { x: support.column.x, y: support.column.y }, end: freeEnd });
      placements.push({
        freeEnd,
        columnId: support.column.id,
        spanMm: support.spanMm,
        deviationDegrees: support.deviationDegrees,
        edgeIndex,
      });
    }
  });

  return { placements, stationCount, carriedStationCount, skippedStationCount };
}
