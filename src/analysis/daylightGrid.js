/**
 * Monte Carlo daylight factors on a working-plane grid, under the CIE standard
 * overcast sky.
 *
 * **What this actually does.** From each sensor, fire a few hundred rays over
 * the upper hemisphere, cosine-weighted because the sensor measures horizontal
 * illuminance. A ray that finds its way out through a window aperture and clears
 * the obstruction horizon collects that direction's sky luminance; a ray that
 * meets a wall collects nothing. Sum, divide by the illuminance the same sky
 * would deliver to an unobstructed horizontal plane, and the result is the sky
 * component of the daylight factor at that sensor.
 *
 * **What it deliberately does not do.** No interreflection bounces. Light that
 * arrives after bouncing off the floor and ceiling is the internally reflected
 * component, and it is added from the BRE formula in `daylightModel.js` as a
 * room-uniform term. That is the classical split-flux decomposition, and it is
 * honest in a way a truncated path tracer would not be: the IRC really is close
 * to uniform in a normal room, and computing it analytically costs nothing and
 * cannot introduce bounce noise.
 *
 * The result validates against split-flux — two independent routes to the same
 * number — which is the whole reason for having both.
 *
 * **The aperture is a tunnel, not a hole.** A ray must clear the rectangle at
 * the inner wall face *and* the one at the outer face. That is what makes deep
 * reveals shade the way they do in reality, and it costs one extra plane test.
 *
 * Pure and worker-safe: no DOM, no imports from the store, no `Math.random`.
 * The sampling is a Hammersley sequence with a per-sensor offset, so the same
 * room always produces the same map — a study that flickered between runs would
 * be impossible to trust or to test.
 */

import { distanceToSegment } from '@/geometry/line';
import { pointInPolygon } from '@/geometry/polygon';
import { OVERCAST_HORIZONTAL_FACTOR } from './daylightModel';
import { seesSky } from './obstructionHorizon';

/** Rays per sensor. 256 keeps the sampling noise under ~0.05% DF. */
export const DEFAULT_RAY_COUNT = 256;

/** Working plane height above the floor, mm. Desk height, per BS EN 12464. */
export const DEFAULT_WORKING_PLANE_MM = 850;

/** Sensor spacing, mm. */
export const DEFAULT_SENSOR_SPACING_MM = 500;

/**
 * Border strip excluded from the grid, mm — the standard 0.5 m offset from the
 * walls that BS EN 12464 and BS EN 17037 both use to define a task area.
 *
 * This is not cosmetic. A sensor 250 mm from a window sees an enormous slice of
 * sky and reads five to ten times the room average, so including the strip
 * against the glass lets a handful of cells carry the mean — and it is exactly
 * the strip nobody puts a desk, a bed or a worktop in. Leaving it in made the
 * grid read about 30% above the split-flux average for every room tested; taking
 * it out is both standard practice and what brings the two methods into line.
 */
export const DEFAULT_BORDER_INSET_MM = 500;

/**
 * Reflectance assumed for external obstructions, applied to the sky luminance
 * they hide. This is the externally reflected component, and 0.2 is the BRE
 * default for an ordinary masonry surface with no view of the ground.
 */
export const DEFAULT_OBSTRUCTION_REFLECTANCE = 0.2;

/** Hard stop on sensors per room, so a huge open plan cannot stall a worker. */
const MAX_SENSORS_PER_ROOM = 4000;

/** Van der Corput radical inverse in base 2 — the second Hammersley coordinate. */
function radicalInverse2(index) {
  let bits = index;
  bits = ((bits << 16) | (bits >>> 16)) >>> 0;
  bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
  bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
  bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
  bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
  return bits * 2.3283064365386963e-10;
}

/**
 * Cosine-weighted directions over the upper hemisphere.
 *
 * The same low-discrepancy set for every sensor would put the seam between lit
 * and unlit directions in the same place each time, printing a faint pattern of
 * the window across the map. A per-sensor Cranley-Patterson rotation — shift
 * both coordinates, wrap — decorrelates them while staying deterministic.
 */
export function hemisphereDirections(count, offsetU = 0, offsetV = 0, out = null) {
  // Callers in a hot loop pass their own buffer: a grid regenerates this set
  // once per sensor, and allocating thousands of short-lived typed arrays costs
  // more than the ray tracing does.
  const directions = out && out.length >= count * 3 ? out : new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const u = ((index + 0.5) / count + offsetU) % 1;
    const v = (radicalInverse2(index) + offsetV) % 1;

    const sinTheta = Math.sqrt(u);
    const cosTheta = Math.sqrt(Math.max(0, 1 - u));
    const phi = 2 * Math.PI * v;

    directions[index * 3] = sinTheta * Math.cos(phi);
    directions[index * 3 + 1] = sinTheta * Math.sin(phi);
    directions[index * 3 + 2] = cosTheta;
  }

  return directions;
}

/** Deterministic, well-spread offsets per sensor: the golden-ratio pair. */
function sensorOffsets(index) {
  return { u: (index * 0.7548776662466927) % 1, v: (index * 0.5698402909980532) % 1 };
}

/**
 * The aperture a ray leaves through, if any.
 *
 * Returns the nearest one, because a ray crossing the room exits at the first
 * wall it meets — taking any other would credit it with the wrong window's
 * glazing and the wrong patch of sky.
 */
function exitAperture(sensor, direction, apertures) {
  let best = null;
  let bestDistance = Infinity;

  for (const aperture of apertures) {
    const normal = aperture.outwardNormal;
    const denominator = direction.x * normal.x + direction.y * normal.y;
    // Heading into the back of the glass, or running parallel to it.
    if (denominator <= 1e-9) continue;

    const half = aperture.width / 2;
    let passes = true;
    let entryDistance = 0;

    // Inner face first, then outer: both rectangles must be cleared, which is
    // what gives a deep reveal its shading.
    for (let face = 0; face < 2 && passes; face += 1) {
      const offset = face === 0 ? -aperture.halfThickness : aperture.halfThickness;
      const planeX = aperture.centre.x + normal.x * offset;
      const planeY = aperture.centre.y + normal.y * offset;

      const distance = ((planeX - sensor.x) * normal.x + (planeY - sensor.y) * normal.y) / denominator;
      if (!(distance > 0)) {
        passes = false;
        break;
      }
      if (face === 0) entryDistance = distance;

      const hitX = sensor.x + direction.x * distance;
      const hitY = sensor.y + direction.y * distance;
      const hitZ = sensor.z + direction.z * distance;

      const lateral = (hitX - aperture.centre.x) * aperture.tangent.x + (hitY - aperture.centre.y) * aperture.tangent.y;
      if (Math.abs(lateral) > half) passes = false;
      else if (hitZ < aperture.sillElevation || hitZ > aperture.headElevation) passes = false;
    }

    if (passes && entryDistance < bestDistance) {
      bestDistance = entryDistance;
      best = aperture;
    }
  }

  return best;
}

/**
 * Sky component of the daylight factor at one point, as a percentage.
 *
 * @param {object} options
 * @param {{x: number, y: number, z: number}} options.sensor  Absolute elevation.
 * @param {Array} options.apertures    From `buildDaylightRooms`, with `efficiency` resolved.
 * @param {Map} options.horizons       Aperture id → horizon map.
 * @param {Float32Array} options.directions
 * @param {number} [options.obstructionReflectance]
 */
export function skyComponentAt({
  sensor,
  apertures,
  horizons,
  directions,
  rayCount = directions.length / 3,
  obstructionReflectance = DEFAULT_OBSTRUCTION_REFLECTANCE,
}) {
  if (!apertures.length) return 0;

  const direction = { x: 0, y: 0, z: 0 };
  let total = 0;

  for (let index = 0; index < rayCount; index += 1) {
    direction.x = directions[index * 3];
    direction.y = directions[index * 3 + 1];
    direction.z = directions[index * 3 + 2];

    const aperture = exitAperture(sensor, direction, apertures);
    if (!aperture) continue;

    // The directions are unit vectors, so z is already cos(zenith angle) and
    // the CIE overcast distribution reduces to (1 + 2z)/3. Worth writing out:
    // this is the innermost line of the whole study, and an `acos` here costs
    // more than the ray's aperture test.
    const luminance = (1 + 2 * direction.z) / 3;
    const visible = seesSky(horizons.get(aperture.id), direction) ? 1 : obstructionReflectance;

    total += luminance * visible * aperture.efficiency;
  }

  // Cosine-weighted estimator: E = (π/N)·Σ L, against E_h = (7π/9)·Lz.
  return (100 * (Math.PI / rayCount) * total) / OVERCAST_HORIZONTAL_FACTOR;
}

/** Shortest distance from a point to a polygon's boundary. */
function distanceToBoundary(point, polygon) {
  let nearest = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const distance = distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]);
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

/** Plan bounding box of a polygon. */
function polygonBounds(polygon) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of polygon) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Daylight factor map across one room.
 *
 * Cells outside the room polygon are masked rather than dropped, so the result
 * is a rectangular image the overlay can draw in one node instead of thousands.
 *
 * @param {object} options
 * @param {object} options.room                Room from `buildDaylightRooms`.
 * @param {Array} options.apertures            With `efficiency` resolved.
 * @param {Map} options.horizons
 * @param {number} options.internallyReflectedPercent  Added uniformly.
 * @param {object} [options.settings]
 * @returns {object|null} Null when the room has no sensor inside it.
 */
export function computeRoomDaylightGrid({ room, apertures, horizons, internallyReflectedPercent = 0, settings = {} }) {
  const spacing = Math.max(100, settings.sensorSpacing || DEFAULT_SENSOR_SPACING_MM);
  const rayCount = Math.max(16, Math.round(settings.rayCount || DEFAULT_RAY_COUNT));
  const workingPlane = Math.max(0, settings.workingPlaneHeight ?? DEFAULT_WORKING_PLANE_MM);
  const obstructionReflectance = settings.obstructionReflectance ?? DEFAULT_OBSTRUCTION_REFLECTANCE;

  const bounds = polygonBounds(room.polygon);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (!(width > 0) || !(height > 0)) return null;

  // Coarsen rather than refuse: a warehouse floor still returns something.
  let cellSize = spacing;
  while (Math.ceil(width / cellSize) * Math.ceil(height / cellSize) > MAX_SENSORS_PER_ROOM) cellSize *= 2;

  const columns = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const values = new Float32Array(columns * rows);
  const mask = new Uint8Array(columns * rows);

  // Mark the task area first, so the border inset can be relaxed before a
  // single ray is fired. A cupboard narrower than twice the inset would
  // otherwise come back with no sensors at all, which reads as "no daylight"
  // rather than "too small to apply the convention to".
  const requestedInset = Math.max(0, settings.gridBorderInset ?? DEFAULT_BORDER_INSET_MM);
  const probe = { x: 0, y: 0 };
  let borderInset = requestedInset;
  let inside = 0;

  for (let attempt = 0; attempt < 2 && inside === 0; attempt += 1) {
    if (attempt === 1) borderInset = 0;
    for (let row = 0; row < rows; row += 1) {
      probe.y = bounds.minY + (row + 0.5) * cellSize;
      for (let column = 0; column < columns; column += 1) {
        probe.x = bounds.minX + (column + 0.5) * cellSize;
        if (!pointInPolygon(probe, room.polygon)) continue;
        if (borderInset > 0 && distanceToBoundary(probe, room.polygon) < borderInset) continue;
        mask[row * columns + column] = 1;
        inside += 1;
      }
    }
  }

  if (!inside) return null;

  const sensorZ = (room.floorElevation || 0) + workingPlane;
  const sensor = { x: 0, y: 0, z: sensorZ };
  const directions = new Float32Array(rayCount * 3);

  let sampled = 0;
  let total = 0;
  let minimum = Infinity;
  let maximum = 0;

  for (let row = 0; row < rows; row += 1) {
    probe.y = bounds.minY + (row + 0.5) * cellSize;
    for (let column = 0; column < columns; column += 1) {
      probe.x = bounds.minX + (column + 0.5) * cellSize;
      const index = row * columns + column;
      if (!mask[index]) continue;

      sensor.x = probe.x;
      sensor.y = probe.y;

      const offsets = sensorOffsets(sampled);
      hemisphereDirections(rayCount, offsets.u, offsets.v, directions);
      const sky = skyComponentAt({ sensor, apertures, horizons, directions, rayCount, obstructionReflectance });
      const daylightFactor = sky + internallyReflectedPercent;

      values[index] = daylightFactor;
      total += daylightFactor;
      if (daylightFactor < minimum) minimum = daylightFactor;
      if (daylightFactor > maximum) maximum = daylightFactor;
      sampled += 1;
    }
  }

  const mean = total / sampled;

  return {
    values,
    mask,
    columns,
    rows,
    cellSize,
    borderInset,
    origin: { x: bounds.minX, y: bounds.minY },
    sensorCount: sampled,
    rayCount,
    mean,
    min: minimum,
    max: maximum,
    // Uniformity as BS EN 12464 defines it for a daylight grid: the worst
    // sensor against the average. Below about 0.3 a room reads as gloomy at the
    // back however good its average looks.
    uniformity: mean > 0 ? minimum / mean : 0,
  };
}

/** Share of a room's sensors at or above a daylight factor. */
export function fractionAbove(grid, targetPercent) {
  if (!grid || !grid.sensorCount) return 0;
  let count = 0;
  for (let index = 0; index < grid.values.length; index += 1) {
    if (grid.mask[index] && grid.values[index] >= targetPercent) count += 1;
  }
  return count / grid.sensorCount;
}

export const GRID_CONSTANTS = { MAX_SENSORS_PER_ROOM };
