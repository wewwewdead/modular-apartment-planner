/**
 * How much sky a window can see, given everything else in the model.
 *
 * Both daylight methods need the same answer to the same question — "in this
 * direction, is there sky or is there a building?" — so both get it from one
 * structure: a **sky mask** built once per window and sampled per ray. For each
 * azimuth bin around the window it records which band of altitudes is blocked.
 *
 * Two bands, because obstructions come in two shapes and a single horizon can
 * only describe one of them:
 *
 *   - `top` / `bottom` — something standing in front of the window. A building
 *     opposite blocks everything from the ground up to its parapet, so the band
 *     runs from below the horizontal to its top. An elevated obstruction that
 *     does not reach the ground blocks only its own slice.
 *   - `ceiling` — something *over* the window. A balcony soffit or a roof eave
 *     blocks everything **above** a threshold and lets the low angles through,
 *     which is the exact inverse of a horizon. A model that only stored a
 *     horizon would silently report an overhung window as unobstructed, and
 *     since overhangs are the commonest cause of a dark room in an apartment
 *     block, that omission would be the study's largest error.
 *
 * The silhouette is sampled rather than intersected: footprint edges are
 * subdivided by how close they pass to the window, and the arc between
 * consecutive samples is filled in, so a long wall far away cannot fall between
 * two samples and leave a hole in the sky mask. Sloped roof planes carry a
 * per-vertex top elevation, so a gable's silhouette comes out right with no
 * special case.
 *
 * Plan azimuth here is `atan2(y, x)` in model space. No north angle enters: the
 * CIE overcast sky is rotationally symmetric, so a daylight factor does not know
 * which way the building is turned. That is a property of the metric, not an
 * omission.
 */

import { pointInPolygon } from '@/geometry/polygon';

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const RAD_TO_DEG = 180 / Math.PI;

/** Azimuth bins around the full circle. 360 gives a 1° sky mask. */
const DEFAULT_BINS = 360;

/**
 * Samples closer to the window plane than this are ignored.
 *
 * This is what keeps a window's own wall out of its sky mask. The wall the
 * window sits in is coplanar with it, so it blocks nothing — but its footprint
 * runs straight through the sample point, and at a few hundred millimetres a
 * coplanar edge subtends a near-vertical angle. Requiring samples to be
 * genuinely *in front* of the glass removes the whole class of problem, and the
 * same guard stops the wall directly above a window being mistaken for a
 * canopy over it.
 */
const DEFAULT_MIN_FORWARD_MM = 250;

/** Angular step the edge subdivision aims for, as a fraction of distance. */
const TARGET_ANGULAR_STEP = 0.06;

/** Hard cap on samples per edge, so a huge site cannot stall the study. */
const MAX_EDGE_SAMPLES = 192;

/**
 * Consecutive samples further apart than this in azimuth are not joined.
 * A jump that large means the edge swept past the window rather than across
 * the view, and filling it would black out half the sky.
 */
const MAX_SPAN_RADIANS = Math.PI / 2;

function binOf(azimuth, bins) {
  const normalized = ((azimuth % TWO_PI) + TWO_PI) % TWO_PI;
  return Math.min(bins - 1, Math.floor((normalized / TWO_PI) * bins));
}

function createMask(bins) {
  return {
    bins,
    // Highest and lowest altitude of the blocked band, per bin.
    top: new Float32Array(bins),
    bottom: new Float32Array(bins).fill(Infinity),
    // Lowest altitude blocked from above. π/2 means open to the zenith.
    ceiling: new Float32Array(bins).fill(HALF_PI),
    obstructed: false,
    overhung: false,
  };
}

/** Distance from the origin to the nearest point of a segment. */
function distanceToSegment(origin, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return Math.hypot(start.x - origin.x, start.y - origin.y);

  const t = Math.max(0, Math.min(1, ((origin.x - start.x) * dx + (origin.y - start.y) * dy) / lengthSquared));
  return Math.hypot(start.x + dx * t - origin.x, start.y + dy * t - origin.y);
}

/**
 * Walk one ring, subdividing each edge by how close it passes to the window.
 *
 * The step is set from the *segment's* nearest approach, not its endpoints. A
 * long façade seen end-on has both corners far away and its middle close, and
 * stepping by the corner distance would sample the part of it that fills the
 * view most coarsely of all.
 */
function subdivideRing(ring, origin, topAt) {
  const samples = [];
  const count = ring.length;
  if (count < 3) return samples;

  for (let index = 0; index < count; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % count];
    const startTop = topAt(index);
    const endTop = topAt((index + 1) % count);

    const edgeLength = Math.hypot(end.x - start.x, end.y - start.y);
    const step = Math.max(50, TARGET_ANGULAR_STEP * distanceToSegment(origin, start, end));
    const segments = Math.max(1, Math.min(MAX_EDGE_SAMPLES, Math.ceil(edgeLength / step)));

    // The last sample of each edge is the first of the next, so stop one short
    // and let the ring close on itself.
    for (let sample = 0; sample < segments; sample += 1) {
      const t = sample / segments;
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      samples.push({
        x,
        y,
        top: startTop + (endTop - startTop) * t,
        azimuth: Math.atan2(y - origin.y, x - origin.x),
        distance: Math.hypot(x - origin.x, y - origin.y),
      });
    }
  }

  return samples;
}

/** Whether a sample is far enough in front of the glass to obstruct it. */
function isForward(sample, origin, outwardNormal, minForward) {
  return (sample.x - origin.x) * outwardNormal.x + (sample.y - origin.y) * outwardNormal.y >= minForward;
}

function altitudeOf(elevation, originZ, distance) {
  return Math.atan2(elevation - originZ, Math.max(1, distance));
}

/**
 * Mark the arc between two consecutive silhouette samples as blocked.
 *
 * Marking only each sample's own bin would leave gaps: a wall 50 m away is
 * sampled every metre or so and lands in every third bin. The arc between two
 * samples is genuinely covered by the edge joining them, so it is filled with
 * the altitudes interpolated across it.
 */
function fillSpan(mask, fromAzimuth, toAzimuth, apply) {
  let delta = toAzimuth - fromAzimuth;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (Math.abs(delta) > MAX_SPAN_RADIANS) return;

  const binWidth = TWO_PI / mask.bins;
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / binWidth));

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    apply(binOf(fromAzimuth + delta * t, mask.bins), t);
  }
}

/**
 * Block the band a solid covers, for a solid the window is *not* standing under.
 */
function accumulateSilhouette(mask, samples, { origin, outwardNormal, minForward, baseElevation }) {
  const count = samples.length;
  if (!count) return;

  for (let index = 0; index < count; index += 1) {
    const current = samples[index];
    const next = samples[(index + 1) % count];
    if (!isForward(current, origin, outwardNormal, minForward)) continue;

    const currentTop = altitudeOf(current.top, origin.z, current.distance);
    const currentBottom = altitudeOf(baseElevation, origin.z, current.distance);
    const nextForward = isForward(next, origin, outwardNormal, minForward);
    const nextTop = nextForward ? altitudeOf(next.top, origin.z, next.distance) : currentTop;
    const nextBottom = nextForward ? altitudeOf(baseElevation, origin.z, next.distance) : currentBottom;

    // Nothing above the window centre in this direction: no sky is lost from a
    // horizontal working plane.
    if (currentTop <= 0 && nextTop <= 0) continue;
    mask.obstructed = true;

    const apply = (bin, t) => {
      const top = currentTop + (nextTop - currentTop) * t;
      const bottom = currentBottom + (nextBottom - currentBottom) * t;
      if (top > mask.top[bin]) mask.top[bin] = top;
      // The union of several solids' bands is not itself a band, so the
      // smallest band containing them is used. That over-blocks the gaps
      // between them, which errs towards reporting a room as darker than it is
      // — the safe direction for a daylight claim.
      if (bottom < mask.bottom[bin]) mask.bottom[bin] = bottom;
    };

    if (nextForward) fillSpan(mask, current.azimuth, next.azimuth, apply);
    else apply(binOf(current.azimuth, mask.bins), 0);
  }
}

/**
 * Block everything above the soffit, for a solid the window stands under.
 *
 * A ray leaving the window rises as it goes. It escapes only if it clears the
 * edge of the overhang before it reaches the soffit's height, so the critical
 * altitude in each direction is set by the distance to that edge.
 */
function accumulateCanopy(mask, samples, { origin, outwardNormal, minForward, baseElevation }) {
  const count = samples.length;
  if (!count) return;

  const rise = baseElevation - origin.z;
  if (!(rise > 0)) return;

  for (let index = 0; index < count; index += 1) {
    const current = samples[index];
    const next = samples[(index + 1) % count];
    if (!isForward(current, origin, outwardNormal, minForward)) continue;

    const nextForward = isForward(next, origin, outwardNormal, minForward);
    const currentAngle = Math.atan2(rise, current.distance);
    const nextAngle = nextForward ? Math.atan2(rise, next.distance) : currentAngle;
    mask.obstructed = true;
    mask.overhung = true;

    const apply = (bin, t) => {
      const angle = currentAngle + (nextAngle - currentAngle) * t;
      if (angle < mask.ceiling[bin]) mask.ceiling[bin] = angle;
    };

    if (nextForward) fillSpan(mask, current.azimuth, next.azimuth, apply);
    else apply(binOf(current.azimuth, mask.bins), 0);
  }
}

/** Whether the window stands under a mass rather than in front of it. */
function isUnder(mass, origin) {
  if (!(mass.baseElevation > origin.z)) return false;
  if (!pointInPolygon(origin, mass.footprint)) return false;
  return !(mass.holes || []).some((hole) => (hole || []).length >= 3 && pointInPolygon(origin, hole));
}

/**
 * Build the sky mask seen from one point.
 *
 * @param {object} options
 * @param {{x: number, y: number, z: number}} options.origin  Window centre, absolute elevation.
 * @param {{x: number, y: number}} options.outwardNormal      Unit, pointing away from the room.
 * @param {Array} options.masses     From `buildAnalysisMassing`.
 * @param {number} [options.bins]
 * @param {number} [options.minForwardMm]
 */
export function buildObstructionHorizon({
  origin,
  outwardNormal,
  masses = [],
  bins = DEFAULT_BINS,
  minForwardMm = DEFAULT_MIN_FORWARD_MM,
}) {
  const mask = createMask(bins);
  const context = { origin, outwardNormal, minForward: minForwardMm, baseElevation: 0 };

  for (const mass of masses) {
    const footprint = mass.footprint || [];
    if (footprint.length < 3) continue;

    const topElevations = mass.topElevations || [];
    const fallbackTop = topElevations.length ? Math.max(...topElevations) : mass.baseElevation || 0;
    const topAt = (index) => (Number.isFinite(topElevations[index]) ? topElevations[index] : fallbackTop);

    context.baseElevation = Number.isFinite(mass.baseElevation) ? mass.baseElevation : 0;
    const accumulate = isUnder(mass, origin) ? accumulateCanopy : accumulateSilhouette;

    accumulate(mask, subdivideRing(footprint, origin, topAt), context);

    // A hole is a courtyard or light well: its boundary is where the solid
    // stops, so it is a silhouette too. Holes carry no per-vertex top, so they
    // take the mass's highest — correct for the merged wall bands that produce
    // nearly all of them.
    for (const hole of mass.holes || []) {
      if ((hole || []).length < 3) continue;
      accumulate(
        mask,
        subdivideRing(hole, origin, () => fallbackTop),
        context,
      );
    }
  }

  let maxAltitude = 0;
  for (let bin = 0; bin < bins; bin += 1) if (mask.top[bin] > maxAltitude) maxAltitude = mask.top[bin];
  mask.maxAltitude = maxAltitude;

  return mask;
}

/** A mask with nothing in it — a window open to the whole sky. */
export function emptyHorizon(bins = DEFAULT_BINS) {
  const mask = createMask(bins);
  mask.maxAltitude = 0;
  return mask;
}

/** Obstruction altitude in radians for a plan direction, 0 when clear. */
export function horizonAltitude(horizon, dx, dy) {
  if (!horizon) return 0;
  return horizon.top[binOf(Math.atan2(dy, dx), horizon.bins)];
}

/**
 * Whether a 3D direction reaches the sky. `direction.z` is up in absolute
 * elevation; the plan components use the same axes as the model.
 */
export function seesSky(horizon, direction) {
  if (!(direction.z > 0)) return false;
  if (!horizon || !horizon.obstructed) return true;

  const horizontal = Math.hypot(direction.x, direction.y);
  // Straight up: no azimuth to look up, and the only thing that can block it is
  // something directly overhead.
  if (horizontal <= 0) return !horizon.overhung;

  const altitude = Math.atan2(direction.z, horizontal);
  const bin = binOf(Math.atan2(direction.y, direction.x), horizon.bins);

  if (altitude >= horizon.ceiling[bin]) return false;
  return !(altitude <= horizon.top[bin] && altitude >= horizon.bottom[bin]);
}

/**
 * The angle of visible sky at a window, in degrees — the θ of the BRE average
 * daylight factor formula.
 *
 * The hand method reads θ off a single section drawn perpendicular to the
 * window. This generalises that to the whole outward half-plane, weighting each
 * azimuth by the cosine of its angle off the normal, because that is how a
 * vertical aperture actually admits flux. It collapses to the hand value when
 * the obstruction is uniform, and degrades sensibly when it is not: a tower
 * blocking one side of the view lowers θ in proportion to how much of the
 * window's field it takes, and an overhang lowers it from the top down.
 *
 * @returns {number} 0-90 degrees. 90 is a clear horizon and an open zenith.
 */
export function skyAngleDeg(horizon, outwardNormal) {
  if (!horizon || !horizon.obstructed) return 90;

  const bins = horizon.bins;
  const normalAzimuth = Math.atan2(outwardNormal.y, outwardNormal.x);
  let weighted = 0;
  let weight = 0;

  for (let index = 0; index < bins; index += 1) {
    const azimuth = ((index + 0.5) / bins) * TWO_PI;
    // Fold into (-π, π] so the cosine below measures the true angle off the
    // window normal rather than the way round the circle we happened to go.
    const offNormal = Math.atan2(Math.sin(azimuth - normalAzimuth), Math.cos(azimuth - normalAzimuth));
    const cosine = Math.cos(offNormal);
    if (cosine <= 0) continue;

    const top = Math.min(90, horizon.top[index] * RAD_TO_DEG);
    const bottom = Math.max(0, horizon.bottom[index] * RAD_TO_DEG);
    const ceiling = Math.min(90, horizon.ceiling[index] * RAD_TO_DEG);

    const blockedBelow = Math.max(0, top - bottom);
    const blockedAbove = Math.max(0, 90 - ceiling);
    // The two bands can overlap when a solid both stands in front of the window
    // and reaches over it; counting the overlap twice would drive the sky angle
    // negative, so the total is capped at the whole quadrant.
    const visible = Math.max(0, 90 - Math.min(90, blockedBelow + blockedAbove));

    weighted += cosine * visible;
    weight += cosine;
  }

  return weight > 0 ? weighted / weight : 90;
}

/**
 * The obstruction angle the BRE internally reflected component is tabulated
 * against: the complement of the visible sky angle.
 */
export function obstructionAngleDeg(horizon, outwardNormal) {
  return Math.max(0, 90 - skyAngleDeg(horizon, outwardNormal));
}

export const HORIZON_CONSTANTS = {
  DEFAULT_BINS,
  DEFAULT_MIN_FORWARD_MM,
  TARGET_ANGULAR_STEP,
  MAX_EDGE_SAMPLES,
  MAX_SPAN_RADIANS,
};
