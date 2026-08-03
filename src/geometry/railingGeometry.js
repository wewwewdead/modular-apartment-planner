import { add, subtract, scale, normalize, perpendicular, distance, dot, midpoint } from './point';
import { pointInPolygon } from './polygon';
import { stairDirectionVector, stairRun, stairTotalRise } from './stairGeometry';

const EPSILON = 1e-6;

// Railings are typically drawn on the stair's edge line itself, so allow lateral
// slack beyond the half-width for snap offsets and the railing's own width.
const STAIR_ATTACH_LATERAL_TOLERANCE = 200;

function makeOutline(start, end, width) {
  const direction = normalize(subtract(end, start));
  const offset = scale(perpendicular(direction), width / 2);
  return [add(start, offset), add(end, offset), subtract(end, offset), subtract(start, offset)];
}

export function getRailingRenderData(railing) {
  if (!railing || !railing.startPoint || !railing.endPoint) return null;
  const { startPoint, endPoint, width } = railing;
  const len = distance(startPoint, endPoint);
  if (len < 1) return null;

  const outline = makeOutline(startPoint, endPoint, width);

  return {
    railing,
    start: startPoint,
    end: endPoint,
    outline,
    midpoint: midpoint(startPoint, endPoint),
    length: len,
  };
}

export function railingContainsPoint(railing, point) {
  const renderData = getRailingRenderData(railing);
  if (!renderData) return false;
  return pointInPolygon(point, renderData.outline);
}

export function railingLength(railing) {
  return distance(railing.startPoint, railing.endPoint);
}

/**
 * Find the stair a railing runs along, if any, and the railing's base elevation
 * at each end relative to that stair's base. A railing counts as stair-attached
 * when both endpoints sit within the stair footprint (plus lateral tolerance)
 * and at least half its length overlaps the stair run. Returns null for
 * free-standing railings, which stay flat at floor level.
 */
export function getRailingStairProfile(railing, stairs = [], options = {}) {
  if (!railing?.startPoint || !railing?.endPoint) return null;
  const lateralTolerance = options.lateralTolerance ?? STAIR_ATTACH_LATERAL_TOLERANCE;
  const railLength = distance(railing.startPoint, railing.endPoint);
  if (railLength < EPSILON) return null;

  let best = null;
  for (const stair of stairs || []) {
    if (!stair?.startPoint) continue;
    const run = stairRun(stair);
    const totalRise = stairTotalRise(stair);
    if (run < EPSILON || totalRise < EPSILON) continue;

    const direction = stairDirectionVector(stair);
    if (Math.abs(direction.x) < EPSILON && Math.abs(direction.y) < EPSILON) continue;
    const normal = perpendicular(direction);
    const maxOffset = (stair.width || 0) / 2 + lateralTolerance;

    const relStart = subtract(railing.startPoint, stair.startPoint);
    const relEnd = subtract(railing.endPoint, stair.startPoint);
    if (Math.abs(dot(relStart, normal)) > maxOffset || Math.abs(dot(relEnd, normal)) > maxOffset) continue;

    const tStart = dot(relStart, direction);
    const tEnd = dot(relEnd, direction);
    const overlap = Math.min(Math.max(tStart, tEnd), run) - Math.max(Math.min(tStart, tEnd), 0);
    // A railing crossing the stair or barely touching it stays flat.
    if (overlap < railLength * 0.5) continue;

    if (!best || overlap > best.overlap) best = { stair, tStart, tEnd, overlap };
  }

  if (!best) return null;

  const { stair, tStart, tEnd, overlap } = best;
  const totalRise = stairTotalRise(stair);
  // Pitch line through the tread nosing tops, so the railing base rests on the
  // steps instead of cutting through them. Clamped to floor level and total rise.
  const riseAt = (t) => {
    const raw = (t / stair.treadDepth + 1) * stair.riserHeight;
    return Math.min(Math.max(raw, 0), totalRise);
  };

  return {
    stair,
    startRise: riseAt(tStart),
    endRise: riseAt(tEnd),
    overlap,
  };
}
