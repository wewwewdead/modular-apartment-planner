import { TRUSS_SUPPORT_MODES } from '@/domain/trussModels';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { buildTrussSystemGeometry } from '@/geometry/trussGeometry';
import {
  buildSystemBoundary,
  collectSystemCopyBearingPoints,
  normalizePlanVector,
  projectPointOntoAxis,
  resolveSystemLayoutRange,
  resolveSystemPlanAxes,
} from './systemPlanAxes';

// Matches the tolerance the beam-pair support check uses, so a beam that was
// parallel enough to carry the trusses is parallel enough to trim the ceiling.
const PARALLEL_TOLERANCE = 0.05;

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function resolveSupportBeams(systemGeometry, floor) {
  const beamIds = new Set();
  for (const instanceGeometry of systemGeometry?.instances || []) {
    const instance = instanceGeometry.instance;
    if (instance?.supportMode !== TRUSS_SUPPORT_MODES.BEAM_PAIR) continue;
    for (const beamId of [instance.supportBeamIds?.start, instance.supportBeamIds?.end]) {
      if (beamId) beamIds.add(beamId);
    }
  }
  if (!beamIds.size) return [];

  return (floor?.beams || [])
    .filter((beam) => beamIds.has(beam.id))
    .map((beam) => getBeamRenderData(beam, floor?.columns || []))
    .filter(Boolean);
}

/**
 * Pulls the span extents back to the inner faces of the beams the trusses bear
 * on. The bearing line runs down the middle of each support beam, so a ceiling
 * that stopped there would still have half a beam's width of board buried in
 * the beam below it.
 *
 * A rotated system keeps its beam references but no longer sits on them; those
 * beams read as skewed against the (rotated) span axis, so the parallel check
 * drops them and the ceiling falls back to the bearing extents.
 */
function clipSpanRangeToSupportBeams(spanRange, systemGeometry, floor, planAxes) {
  const midSpan = (spanRange.min + spanRange.max) / 2;
  let { min, max } = spanRange;

  for (const renderData of resolveSupportBeams(systemGeometry, floor)) {
    const beamAxis = normalizePlanVector({
      x: renderData.end.x - renderData.start.x,
      y: renderData.end.y - renderData.start.y,
    });
    if (Math.abs(cross(beamAxis, planAxes.layoutAxis)) > PARALLEL_TOLERANCE) continue;

    const projections = renderData.outline.map((point) =>
      projectPointOntoAxis(point, planAxes.origin, planAxes.spanAxis),
    );
    const near = Math.min(...projections);
    const far = Math.max(...projections);
    // Whichever side of the trusses the beam sits on, the ceiling stops at the
    // face looking back toward them.
    if ((near + far) / 2 <= midSpan) {
      min = Math.max(min, far);
    } else {
      max = Math.min(max, near);
    }
  }

  return { min, max };
}

/**
 * Plan boundary for a ceiling hung from a truss system.
 *
 * Unlike the roof boundary, this traces the bottom chords rather than the roof
 * outline: the top chords carry on past the bearings as eaves, and the support
 * beams hang below the bearing plane, so a ceiling taken from the roof extents
 * runs its boards out into the overhang and straight through the beams. The
 * extents are the bearing (bottom-chord) ends, clipped to the inner faces of
 * the support beams.
 *
 * `floor` is the truss system's floor — a ceiling may hang from a truss that is
 * not on its own floor. Without it the boundary still stops at the bearings.
 */
export function deriveCeilingBoundaryFromTrussSystem(trussSystem, floor = null, sourceSystemGeometry = null) {
  const systemGeometry = sourceSystemGeometry || (trussSystem ? buildTrussSystemGeometry(trussSystem) : null);
  const planAxes = resolveSystemPlanAxes(systemGeometry);
  const bearingPoints = collectSystemCopyBearingPoints(systemGeometry);
  if (!planAxes || !bearingPoints.length) return null;

  const spanValues = bearingPoints.map((point) => projectPointOntoAxis(point, planAxes.origin, planAxes.spanAxis));
  const bearingRange = { min: Math.min(...spanValues), max: Math.max(...spanValues) };

  return buildSystemBoundary(
    planAxes,
    clipSpanRangeToSupportBeams(bearingRange, systemGeometry, floor, planAxes),
    resolveSystemLayoutRange(systemGeometry, planAxes),
  );
}
