/**
 * Bulk air-movement index for one room of the ventilation network.
 *
 * ## What this is, and what it is not
 *
 * This is a BULK TRANSPORT index: the volume of air the pressure network moves
 * through a room, divided by the cross-section that volume has to pass through.
 * It answers "how fast is the air in this room being replaced, expressed as a
 * speed" — the number a ventilation guide means when it says a room "moves air".
 *
 * It is NOT an occupied-zone velocity. Real indoor air arrives as a jet from
 * each inlet, decays, separates and recirculates; the speed a person feels at a
 * desk can be several times this index near the inlet and near zero in the
 * corner behind it. Nothing here models a jet. Every field is named for the
 * bulk quantity it actually is, so a reader cannot mistake one for the other.
 *
 * TODO (jet decay): an inlet-jet model (throw length from opening area and
 * discharge velocity, ASHRAE-style Ar/K decay, plus a recirculation allowance)
 * would give an occupied-zone velocity. It slots in behind this same signature:
 * `computeRoomAirSpeed` would return the same shape with a different `speedMs`
 * and a narrower band, and no caller would change.
 *
 * ## The physics
 *
 *   v = Q / A_cross
 *
 *   Q        the room's THROUGH-flow, m³/s. Half the total absolute flow across
 *            its openings, which is the matched in/out volume: a room in steady
 *            state takes in exactly as much as it puts out, and the air that
 *            traverses it is that matched volume, not the sum of both halves.
 *   A_cross  the room's cross-section perpendicular to the flow direction, m².
 *            Constructed as: project every polygon vertex onto the axis
 *            perpendicular to `flowNormal`, take (max - min) as the width the
 *            flow spreads across, and multiply by the room height already
 *            resolved on the ventilation topology. For a rectangular room with
 *            flow along one side this is exactly the other side x the height.
 *
 * `flowNormal` is the unit vector from the area-weighted centroid of the room's
 * INLET openings to the area-weighted centroid of its OUTLET openings, weighted
 * by effective opening area — the straight line the bulk of the air takes.
 *
 * ## Uncertainty
 *
 * A fixed +/-50 % band, on every path that reports a number. The figure follows
 * the accuracy ventilation guidance claims for exactly this kind of bulk
 * estimate: CIBSE AM10 and the ASHRAE Fundamentals natural-ventilation chapter
 * both present through-flow/cross-section velocity as an order-of-magnitude
 * screening quantity and warn that opening discharge coefficients alone carry
 * tens of percent, before the plan-shape idealisation here is counted.
 *
 * The band is deliberately NOT derived from the solver residual. A converged
 * pressure network says the flows balance to 1e-7 m³/s; it says nothing about
 * whether Q/A_cross is the velocity in the room. Residuals cannot bound a
 * modelling error, and dressing one up as an error bar would be worse than
 * having no bar at all.
 */

import { normalize, perpendicular, subtract } from '@/geometry/point';
import { polygonAreaCentroid } from '@/geometry/polygon';

/** Half-width of the reported band, as a fraction of the index itself. */
export const ROOM_AIR_SPEED_BAND_FRACTION = 0.5;

/** Names the construction, for `model.airSpeedMethod`. */
export const ROOM_AIR_SPEED_METHOD = 'bulk-cross-section';

/**
 * What a room that was never in the network reports.
 *
 * `null`, not 0. A room with no airflow path at all was not modelled; a room
 * that was modelled and moves no air is a different statement, and that one
 * gets a real 0 with a real (zero-width) band. The ventilation summary already
 * draws this distinction for stagnant-room counting and this follows it.
 */
export const UNRESOLVED_ROOM_AIR_SPEED = Object.freeze({
  speedMs: null,
  band: null,
  flowNormal: null,
  crossSectionM2: null,
  throughFlowM3s: null,
});

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

/**
 * Signed volume flow INTO `roomId` through one opening, m³/s.
 *
 * The network's sign convention is "positive leaves room A": an exterior
 * opening only has an A side, an internal one moves A -> B when positive.
 */
function inflowThrough(opening, roomId) {
  const flow = finite(opening?.flowM3s, 0);
  if (opening?.roomAId === roomId) return -flow;
  if (opening?.roomBId === roomId) return flow;
  return 0;
}

/** Extent of the polygon's projection onto a unit axis, mm. */
function projectedExtentMm(polygon, axis) {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const point of polygon) {
    const projection = point.x * axis.x + point.y * axis.y;
    if (projection < minimum) minimum = projection;
    if (projection > maximum) maximum = projection;
  }
  return maximum - minimum;
}

/**
 * The polygon's longest axis, as a unit vector.
 *
 * "Longest axis" is the major principal axis of the filled area — the
 * eigenvector of the second area moments about the area centroid with the
 * larger eigenvalue. For a rectangle that is exactly the long side, which is
 * what a reader means by the phrase; the alternative reading, the
 * furthest-apart pair of vertices, returns the DIAGONAL of a rectangle and a
 * cross-section wider than either side, which is not a room dimension at all.
 *
 * Every moment is normalised by the signed area, so reversing the winding
 * leaves the axis unchanged rather than rotating it a quarter turn.
 */
function longestAxis(polygon) {
  const centroid = polygonAreaCentroid(polygon);
  let twiceArea = 0;
  let momentXX = 0;
  let momentYY = 0;
  let momentXY = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const next = (index + 1) % polygon.length;
    const xi = polygon[index].x - centroid.x;
    const yi = polygon[index].y - centroid.y;
    const xj = polygon[next].x - centroid.x;
    const yj = polygon[next].y - centroid.y;
    const cross = xi * yj - xj * yi;
    twiceArea += cross;
    momentXX += cross * (xi * xi + xi * xj + xj * xj);
    momentYY += cross * (yi * yi + yi * yj + yj * yj);
    momentXY += cross * (xi * yj + 2 * xi * yi + 2 * xj * yj + xj * yi);
  }
  if (!Number.isFinite(twiceArea) || twiceArea === 0) return { x: 1, y: 0 };
  // Area-normalised central moments: variance in x, variance in y, covariance.
  const varianceX = momentXX / (6 * twiceArea);
  const varianceY = momentYY / (6 * twiceArea);
  const covariance = momentXY / (12 * twiceArea);
  const angle = 0.5 * Math.atan2(2 * covariance, varianceX - varianceY);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/**
 * Effective-area-weighted centre of a set of openings.
 *
 * Equal weights stand in when every area is zero or absent. The network never
 * builds an opening below MIN_EFFECTIVE_AREA_M2, so that path is for callers
 * handing over partial data; without it a missing area would silently collapse
 * the whole side and send the direction to the long-axis fallback instead.
 */
function weightedCentre(entries) {
  let weight = 0;
  let x = 0;
  let y = 0;
  for (const entry of entries) {
    weight += entry.weight;
    x += entry.centre.x * entry.weight;
    y += entry.centre.y * entry.weight;
  }
  if (weight > 0) return { x: x / weight, y: y / weight };
  if (!entries.length) return null;
  return {
    x: entries.reduce((sum, entry) => sum + entry.centre.x, 0) / entries.length,
    y: entries.reduce((sum, entry) => sum + entry.centre.y, 0) / entries.length,
  };
}

function bandAround(speedMs) {
  return {
    lowMs: speedMs * (1 - ROOM_AIR_SPEED_BAND_FRACTION),
    highMs: speedMs * (1 + ROOM_AIR_SPEED_BAND_FRACTION),
    fraction: ROOM_AIR_SPEED_BAND_FRACTION,
  };
}

/**
 * Bulk air-movement index for one room.
 *
 * @param {object} options
 * @param {object} options.room      Topology room: `id`, `polygon` (mm), `heightMm`.
 * @param {Array}  options.openings  The solved openings touching this room, each
 *   carrying `roomAId`, `roomBId`, `flowM3s`, `effectiveAreaM2`, `centre`.
 * @returns {{speedMs: number|null, band: object|null, flowNormal: {x: number, y: number}|null,
 *   crossSectionM2: number|null, throughFlowM3s: number|null}}
 *   A band accompanies every reported speed; a null speed carries a null band.
 */
export function computeRoomAirSpeed({ room, openings }) {
  const polygon = room?.polygon || [];
  const heightM = finite(room?.heightMm, 0) / 1000;
  const touching = (openings || []).filter(
    (opening) => opening && (opening.roomAId === room?.id || opening.roomBId === room?.id),
  );
  if (polygon.length < 3 || !(heightM > 0) || !touching.length) return UNRESOLVED_ROOM_AIR_SPEED;

  let inflowM3s = 0;
  let outflowM3s = 0;
  const inlets = [];
  const outlets = [];

  for (const opening of touching) {
    const signed = inflowThrough(opening, room.id);
    if (signed === 0) continue;
    const entry = {
      weight: Math.max(0, finite(opening.effectiveAreaM2, 0)),
      centre: { x: finite(opening.centre?.x, 0), y: finite(opening.centre?.y, 0) },
    };
    if (signed > 0) {
      inflowM3s += signed;
      inlets.push(entry);
    } else {
      outflowM3s += -signed;
      outlets.push(entry);
    }
  }

  // The matched in/out volume. Balanced by construction on a converged solve;
  // averaging rather than picking one side keeps the index finite on a run that
  // stopped short of balance.
  const throughFlowM3s = (inflowM3s + outflowM3s) / 2;

  let flowNormal = null;
  const from = weightedCentre(inlets);
  const to = weightedCentre(outlets);
  if (from && to) {
    const separation = subtract(to, from);
    if (Math.hypot(separation.x, separation.y) > 1e-6) flowNormal = normalize(separation);
  }
  // One opening, or two that resolve to the same point: there is no in-to-out
  // line to take. The air still has to travel the room's depth, so the long
  // axis stands in and the cross-section becomes the room's narrow face.
  if (!flowNormal) flowNormal = longestAxis(polygon);

  const widthM = projectedExtentMm(polygon, perpendicular(flowNormal)) / 1000;
  const crossSectionM2 = widthM * heightM;
  if (!(crossSectionM2 > 0)) return UNRESOLVED_ROOM_AIR_SPEED;

  const speedMs = throughFlowM3s / crossSectionM2;
  return { speedMs, band: bandAround(speedMs), flowNormal, crossSectionM2, throughFlowM3s };
}

export default computeRoomAirSpeed;
