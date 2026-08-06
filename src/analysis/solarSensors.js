/**
 * Lays sensor points over the building's facades and roofs.
 *
 * A solar study is only as good as where it measures. Sensors come from the
 * *merged* massing rings rather than from individual walls, which matters: the
 * merged ring is the building envelope, so interior partitions contribute
 * nothing and a wall shared between two wings is not counted twice.
 *
 * Each sensor carries a position, an outward normal, the area it represents and
 * the surface it belongs to, so results can be rolled up per facade and per
 * orientation instead of arriving as an undifferentiated cloud of numbers.
 *
 * Millimetres throughout, elevations absolute, matching `buildingMassing`.
 */

import { pointInPolygon } from '@/geometry/polygon';
import { bvhIntersectsRay } from './rayBvh';

/** Default sensor spacing, mm. */
export const DEFAULT_SENSOR_SPACING_MM = 1000;

/** Sensors are pushed this far off the surface so they do not hit their own face. */
const SURFACE_OFFSET_MM = 15;

/**
 * A mass top with *anything* above it is a floor, not a roof.
 *
 * The tempting version of this test uses a small clearance — "is something
 * pressing down on this surface" — and it is wrong in a way that is obvious
 * once seen. A ground floor slab has six metres of open air above it before the
 * next storey, so a short probe clears easily and the floor you walk on inside
 * the building gets reported as prime photovoltaic real estate.
 *
 * An exposed roof is defined by having nothing over it at all, at any height.
 * The cost is that a terrace under a projecting floor stops counting as roof,
 * which is the right answer: it is a soffit, and no panel goes there.
 */
const ROOF_CLEARANCE_MM = Infinity;

/** Facades shorter than this are trim, not elevation. */
const MIN_FACADE_HEIGHT_MM = 300;

/** Hard stop, so a large site coarsens rather than stalling the worker. */
const MAX_SENSORS = 24000;

const DEG = Math.PI / 180;

function doubleSignedArea(ring) {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    total += current.x * next.y - next.x * current.y;
  }
  return total;
}

/**
 * Sixteen-point compass label for a plan normal, matching the sun study's
 * convention: `northAngle` rotates the drawing, bearings run clockwise from
 * north, and plan y increases downward.
 */
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function normalBearingDeg(nx, ny, northAngle = 0) {
  // Inverse of `(sin θ, -cos θ)`: recover the bearing, then take out the
  // drawing's rotation so the answer is a true compass direction.
  const bearing = Math.atan2(nx, -ny) / DEG - northAngle;
  return ((bearing % 360) + 360) % 360;
}

export function compassLabel(bearingDeg) {
  return COMPASS[Math.round((((bearingDeg % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * Least-squares plane through a mass's top vertices, as `z = a·x + b·y + c`.
 *
 * Exact for a roof plane, which is planar by construction, and a sensible
 * average for anything else. Falls back to a flat top when the footprint is
 * degenerate enough to make the normal equations singular.
 */
function fitTopPlane(footprint, topAt) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxz = 0;
  let syz = 0;

  // Centred on the first vertex: a site 500 km from the origin would otherwise
  // lose all the precision that matters to rounding.
  const ox = footprint[0].x;
  const oy = footprint[0].y;

  for (let index = 0; index < footprint.length; index += 1) {
    const x = footprint[index].x - ox;
    const y = footprint[index].y - oy;
    const z = topAt(index);
    n += 1;
    sx += x;
    sy += y;
    sz += z;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sxz += x * z;
    syz += y * z;
  }

  const m00 = sxx - (sx * sx) / n;
  const m01 = sxy - (sx * sy) / n;
  const m11 = syy - (sy * sy) / n;
  const r0 = sxz - (sx * sz) / n;
  const r1 = syz - (sy * sz) / n;
  const determinant = m00 * m11 - m01 * m01;

  if (Math.abs(determinant) < 1e-6) {
    const flat = sz / n;
    return { at: () => flat, normal: { x: 0, y: 0, z: 1 } };
  }

  const a = (r0 * m11 - r1 * m01) / determinant;
  const b = (r1 * m00 - r0 * m01) / determinant;
  const c = (sz - a * sx - b * sy) / n;

  const length = Math.hypot(-a, -b, 1);
  return {
    at: (x, y) => a * (x - ox) + b * (y - oy) + c,
    normal: { x: -a / length, y: -b / length, z: 1 / length },
  };
}

function ringBounds(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Facade sensors along one ring of a mass.
 *
 * The outward direction is read off the ring's winding rather than probed. For
 * the outline, "outward" is away from the ring's interior; for a hole it is the
 * opposite, because the solid is outside a hole and its face looks into the
 * courtyard.
 */
function addFacadeRing({ ring, isHole, base, topAt, spacing, mass, northAngle, surfaces, sink }) {
  const orientation = doubleSignedArea(ring) > 0 ? 1 : -1;
  const sign = isHole ? -orientation : orientation;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const edgeLength = Math.hypot(dx, dy);
    if (!(edgeLength > 1)) continue;

    const nx = (sign * dy) / edgeLength;
    const ny = (sign * -dx) / edgeLength;

    /*
     * One surface per footprint edge, not per ring.
     *
     * A merged ring wraps the whole building, so rolling its sensors up
     * together averages the south elevation with the north one and reports a
     * number that describes neither. An edge is a single plane with a single
     * bearing, which is what makes "this facade gets 900 kWh/m²" mean anything.
     */
    const surfaceId = surfaces.length;
    const bearing = normalBearingDeg(nx, ny, northAngle);
    surfaces.push({
      id: surfaceId,
      kind: 'facade',
      massId: mass.id,
      bearingDeg: bearing,
      compass: compassLabel(bearing),
      normal: { x: nx, y: ny, z: 0 },
      base,
      start: { x: current.x, y: current.y },
      end: { x: next.x, y: next.y },
      isHole,
    });

    const columns = Math.max(1, Math.round(edgeLength / spacing));
    const columnWidth = edgeLength / columns;

    for (let column = 0; column < columns; column += 1) {
      const t = (column + 0.5) / columns;
      const x = current.x + dx * t;
      const y = current.y + dy * t;
      const top = topAt(index) + (topAt((index + 1) % ring.length) - topAt(index)) * t;
      const height = top - base;
      if (height < MIN_FACADE_HEIGHT_MM) continue;

      const rows = Math.max(1, Math.round(height / spacing));
      const rowHeight = height / rows;

      for (let row = 0; row < rows; row += 1) {
        const z = base + (row + 0.5) * rowHeight;
        sink.push({
          x: x + nx * SURFACE_OFFSET_MM,
          y: y + ny * SURFACE_OFFSET_MM,
          z,
          nx,
          ny,
          nz: 0,
          area: columnWidth * rowHeight,
          surfaceId,
          heightAboveBase: z - base,
        });
      }
    }
  }
}

/**
 * Roof sensors over a mass's top face.
 *
 * A mass with another mass sitting on it is an intermediate floor, not a roof,
 * so every candidate fires one short ray upward and drops out if it hits
 * something immediately. Cheaper and more reliable than reasoning about which
 * storey a mass belongs to, and it correctly keeps the exposed part of a top
 * that is only partly built over.
 */
function addRoofFace({ mass, base, topAt, spacing, surfaceId, sink, bvh }) {
  const footprint = mass.footprint;
  const plane = fitTopPlane(footprint, topAt);
  const bounds = ringBounds(footprint);
  const holes = (mass.holes || []).filter((hole) => (hole || []).length >= 3);

  const columns = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / spacing));
  const rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / spacing));
  const cellX = (bounds.maxX - bounds.minX) / columns;
  const cellY = (bounds.maxY - bounds.minY) / rows;
  const probe = { x: 0, y: 0 };

  // A grid is laid out in plan, so a sloped roof's real area is larger than the
  // cell by exactly one over the cosine of its tilt.
  const slopeFactor = plane.normal.z > 0.01 ? 1 / plane.normal.z : 1;

  for (let row = 0; row < rows; row += 1) {
    probe.y = bounds.minY + (row + 0.5) * cellY;
    for (let column = 0; column < columns; column += 1) {
      probe.x = bounds.minX + (column + 0.5) * cellX;
      if (!pointInPolygon(probe, footprint)) continue;
      if (holes.some((hole) => pointInPolygon(probe, hole))) continue;

      const z = plane.at(probe.x, probe.y);
      if (!(z > base)) continue;

      if (bvh && bvhIntersectsRay(bvh, probe.x, probe.y, z + SURFACE_OFFSET_MM, 0, 0, 1, ROOF_CLEARANCE_MM)) continue;

      sink.push({
        x: probe.x + plane.normal.x * SURFACE_OFFSET_MM,
        y: probe.y + plane.normal.y * SURFACE_OFFSET_MM,
        z: z + plane.normal.z * SURFACE_OFFSET_MM,
        nx: plane.normal.x,
        ny: plane.normal.y,
        nz: plane.normal.z,
        area: cellX * cellY * slopeFactor,
        surfaceId,
        heightAboveBase: z - base,
      });
    }
  }
}

/**
 * Build the sensor set for a building.
 *
 * @param {object} options
 * @param {Array} options.masses     From `buildAnalysisMassing`.
 * @param {object} [options.bvh]     Used to reject roof candidates that are
 *   built over. Optional, but without it every intermediate floor slab is
 *   reported as roof.
 * @param {number} [options.spacing]
 * @param {number} [options.northAngle]
 * @param {boolean} [options.includeFacades]
 * @param {boolean} [options.includeRoofs]
 * @returns {{positions: Float32Array, normals: Float32Array, areas: Float32Array,
 *   surfaceIds: Int32Array, heights: Float32Array, count: number,
 *   surfaces: Array, spacing: number}}
 */
export function buildSolarSensors({
  masses = [],
  bvh = null,
  spacing = DEFAULT_SENSOR_SPACING_MM,
  northAngle = 0,
  includeFacades = true,
  includeRoofs = true,
  maxSensors = MAX_SENSORS,
}) {
  let step = Math.max(100, spacing);
  let sensors = [];
  let surfaces = [];

  // Coarsen and retry rather than refuse: a tower block at 250 mm spacing would
  // otherwise return nothing at all.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    sensors = [];
    surfaces = [];

    masses.forEach((mass, massIndex) => {
      const footprint = mass.footprint || [];
      if (footprint.length < 3) return;

      const base = Number.isFinite(mass.baseElevation) ? mass.baseElevation : 0;
      const tops = mass.topElevations || [];
      const fallbackTop = tops.length ? Math.max(...tops) : base;
      const topAt = (index) => (Number.isFinite(tops[index]) ? tops[index] : fallbackTop);

      if (includeFacades) {
        addFacadeRing({
          ring: footprint,
          isHole: false,
          base,
          topAt,
          spacing: step,
          mass,
          northAngle,
          surfaces,
          sink: sensors,
        });

        for (const hole of mass.holes || []) {
          if ((hole || []).length < 3) continue;
          addFacadeRing({
            ring: hole,
            isHole: true,
            base,
            topAt: () => fallbackTop,
            spacing: step,
            mass,
            northAngle,
            surfaces,
            sink: sensors,
          });
        }
      }

      if (includeRoofs) {
        const surfaceId = surfaces.length;
        surfaces.push({
          id: surfaceId,
          kind: 'roof',
          massId: mass.id,
          massIndex,
          base,
          bearingDeg: null,
          compass: null,
        });
        addRoofFace({ mass, base, topAt, spacing: step, surfaceId, sink: sensors, bvh });
      }
    });

    if (sensors.length <= maxSensors) break;
    step *= 1.5;
  }

  const count = sensors.length;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const areas = new Float32Array(count);
  const surfaceIds = new Int32Array(count);
  const heights = new Float32Array(count);

  sensors.forEach((sensor, index) => {
    positions[index * 3] = sensor.x;
    positions[index * 3 + 1] = sensor.y;
    positions[index * 3 + 2] = sensor.z;
    normals[index * 3] = sensor.nx;
    normals[index * 3 + 1] = sensor.ny;
    normals[index * 3 + 2] = sensor.nz;
    areas[index] = sensor.area;
    surfaceIds[index] = sensor.surfaceId;
    heights[index] = sensor.heightAboveBase;
  });

  // Drop surfaces that ended up with no sensors, so a roof that turned out to
  // be an intermediate floor — or an edge too short to sample — does not appear
  // in the results as an empty row.
  const used = new Set(surfaceIds);
  const labelled = surfaces.map((surface) => ({
    ...surface,
    sensorCount: 0,
    label: surface.kind === 'roof' ? 'Roof' : `${surface.compass} facade`,
  }));
  for (const id of surfaceIds) labelled[id].sensorCount += 1;

  return {
    positions,
    normals,
    areas,
    surfaceIds,
    heights,
    count,
    spacing: step,
    surfaces: labelled.filter((surface) => used.has(surface.id)),
    northAngle,
  };
}

export const SENSOR_CONSTANTS = { SURFACE_OFFSET_MM, ROOF_CLEARANCE_MM, MIN_FACADE_HEIGHT_MM, MAX_SENSORS };
