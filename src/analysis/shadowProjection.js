/**
 * Ground shadows cast by building massing, computed exactly rather than
 * sampled.
 *
 * The shadow of a solid with a flat base and a planar (possibly sloped) top is
 * the union of three things: the base outline projected to the ground, the top
 * outline projected to the ground, and one quad per silhouette edge joining
 * them. That union is the true shadow — no rasterising, no marching, and it
 * stays crisp at any zoom because the result is still a polygon.
 *
 * Coordinate conventions, which are easy to get subtly wrong:
 *   - Model space is millimetres with **y increasing downward**, matching SVG.
 *   - `northAngle` is degrees, following the site model and SVG's `rotate()`:
 *     0 puts true north at the top of the screen, and positive values swing
 *     north clockwise.
 *   - `azimuth` (from `solarPosition`) is a compass bearing in radians,
 *     clockwise from true north.
 */

import { unionRegions, multiPolygonArea, intersectionArea } from '@/geometry/polygonBoolean';
import { pointInPolygon, polygonArea } from '@/geometry/polygon';

const DEG = Math.PI / 180;

/**
 * Below this the sun is grazing the horizon, shadows run to the horizon, and
 * the numbers stop meaning anything useful for a site study.
 */
const DEFAULT_MIN_ALTITUDE_DEG = 1;

/**
 * Horizontal displacement from a point at `height` to the ground point its
 * shadow lands on.
 *
 * The sun sits at compass bearing `azimuth`, so shadows run along the opposite
 * bearing. Converting a bearing to model space means adding `northAngle` and
 * reading off (sin, -cos) — the negated y because the plan's y axis points
 * down.
 */
export function shadowOffset({ altitude, azimuth, northAngle = 0, height }) {
  if (!(altitude > 0) || !(height > 0)) return { x: 0, y: 0 };

  const distance = height / Math.tan(altitude);
  const bearing = northAngle * DEG + azimuth + Math.PI;

  return { x: distance * Math.sin(bearing), y: -distance * Math.cos(bearing) };
}

function translatePolygon(points, offset) {
  return points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y }));
}

/**
 * Every polygon making up one solid's shadow, before merging. Exported mainly
 * so tests can inspect the pieces; callers normally want `castShadows`.
 */
export function massShadowPieces(mass, { altitude, azimuth, northAngle = 0 }) {
  const footprint = mass.footprint || [];
  if (footprint.length < 3 || !(altitude > 0)) return [];

  const topElevations = mass.topElevations || [];
  const baseOffset = shadowOffset({ altitude, azimuth, northAngle, height: mass.baseElevation || 0 });

  const baseShadow = translatePolygon(footprint, baseOffset);
  const topShadow = footprint.map((point, index) => {
    const offset = shadowOffset({ altitude, azimuth, northAngle, height: topElevations[index] ?? 0 });
    return { x: point.x + offset.x, y: point.y + offset.y };
  });

  const holes = (mass.holes || []).filter((hole) => hole?.length >= 3);
  // Analysis masses with holes are flat prisms (merged walls/floor plates).
  // Roof planes carry no holes. Falling back to the highest top keeps the
  // representation safe if a future sloped mass does acquire an opening.
  const holeTopElevation = topElevations.length ? Math.max(...topElevations) : mass.baseElevation || 0;
  const holeTopOffset = shadowOffset({ altitude, azimuth, northAngle, height: holeTopElevation });
  const baseHoles = holes.map((hole) => translatePolygon(hole, baseOffset));
  const topHoles = holes.map((hole) => translatePolygon(hole, holeTopOffset));

  // Caps remain polygonal regions with holes. A courtyard only becomes shaded
  // where one of its inner side faces projects across it; flattening either cap
  // to a simple outer ring would fill the whole courtyard at every sun angle.
  const pieces = [
    { outline: baseShadow, holes: baseHoles },
    { outline: topShadow, holes: topHoles },
  ];

  // One quad per edge sweeps the gap between the base and top projections.
  // Together with the two caps this covers the solid's whole silhouette,
  // whichever way the sun happens to be pointing.
  for (let index = 0; index < footprint.length; index += 1) {
    const next = (index + 1) % footprint.length;
    pieces.push({ outline: [baseShadow[index], baseShadow[next], topShadow[next], topShadow[index]], holes: [] });
  }

  // The vertical walls around holes cast their own strips of shadow into a
  // courtyard/light well. Projecting those faces is the exact complement to
  // keeping the holes in the caps above.
  for (let holeIndex = 0; holeIndex < holes.length; holeIndex += 1) {
    const baseHole = baseHoles[holeIndex];
    const topHole = topHoles[holeIndex];
    for (let index = 0; index < baseHole.length; index += 1) {
      const next = (index + 1) % baseHole.length;
      pieces.push({ outline: [baseHole[index], baseHole[next], topHole[next], topHole[index]], holes: [] });
    }
  }

  return pieces;
}

/**
 * Merged ground shadow for a set of solids at one instant.
 *
 * @param {Array} masses  From `buildAnalysisMassing`.
 * @param {object} sun    `{ altitude, azimuth }` in radians — pass
 *   `trueAltitude` from `solarPosition`, since shadow length is geometric.
 * @param {object} [options]
 * @param {number} [options.northAngle]
 * @param {number} [options.minAltitudeDeg]
 * @returns {Array<{outline: Array, holes: Array}>} Empty when the sun is down.
 */
export function castShadows(masses = [], sun, options = {}) {
  const { northAngle = 0, minAltitudeDeg = DEFAULT_MIN_ALTITUDE_DEG } = options;
  if (!sun || !(sun.altitude > minAltitudeDeg * DEG)) return [];

  const pieces = [];
  for (const mass of masses) {
    pieces.push(...massShadowPieces(mass, { altitude: sun.altitude, azimuth: sun.azimuth, northAngle }));
  }

  return unionRegions(pieces);
}

/**
 * Ground ever touched by shadow across a series of sun positions — the
 * "shadow range" diagram planning authorities ask for.
 *
 * Unioning every time step at once is far cheaper than unioning them
 * pairwise, because polygon-clipping sweeps all the input rings together.
 *
 * @param {Array} masses
 * @param {Array} sunSamples  From `sampleDaySunPositions`.
 * @param {object} [options]
 */
export function shadowRangeEnvelope(masses = [], sunSamples = [], options = {}) {
  const { northAngle = 0, minAltitudeDeg = DEFAULT_MIN_ALTITUDE_DEG } = options;

  // Collapse each time step to its own shadow first, then merge those.
  //
  // Throwing every piece from every step into a single union looks tidier and
  // is dramatically slower: the pieces from one step overlap each other almost
  // completely, and the sweep-line pays for every one of those intersections.
  // Resolving a step to one polygon first turns a union of thousands of
  // overlapping quads into a union of a few dozen simple outlines.
  const perSample = [];
  for (const sample of sunSamples) {
    if (!(sample.altitude > minAltitudeDeg * DEG)) continue;

    perSample.push(...castShadows(masses, sample, { northAngle, minAltitudeDeg }));
  }

  // Keep per-moment holes through the final union. Polygon union will retain a
  // hole only when it remains unshaded at every sampled moment — precisely the
  // definition of ground outside the shadow-range envelope.
  return unionRegions(perSample);
}

/**
 * Wrap each region with its bounding box.
 *
 * A ray-crossing test walks every edge of a polygon, so testing thousands of
 * grid cells against a many-sided shadow is the dominant cost of a sun-hours
 * map. Nearly all of those cells are nowhere near the region, and four numeric
 * comparisons reject them before the walk ever starts.
 */
function withBounds(regions) {
  return regions.map((region) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of region.outline) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
    return { region, minX, minY, maxX, maxY };
  });
}

function pointInBoundedRegions(point, bounded) {
  for (const entry of bounded) {
    if (point.x < entry.minX || point.x > entry.maxX || point.y < entry.minY || point.y > entry.maxY) continue;
    if (!pointInPolygon(point, entry.region.outline)) continue;
    // A point inside a hole (a courtyard, a light well) is not in shadow.
    const inHole = (entry.region.holes || []).some((hole) => pointInPolygon(point, hole));
    if (!inHole) return true;
  }
  return false;
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point, start, end) {
  const epsilon = 1e-7;
  return (
    Math.abs(orientation(start, end, point)) <= epsilon &&
    point.x >= Math.min(start.x, end.x) - epsilon &&
    point.x <= Math.max(start.x, end.x) + epsilon &&
    point.y >= Math.min(start.y, end.y) - epsilon &&
    point.y <= Math.max(start.y, end.y) + epsilon
  );
}

function segmentsIntersect(a, b, c, d) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) {
    return true;
  }
  return pointOnSegment(c, a, b) || pointOnSegment(d, a, b) || pointOnSegment(a, c, d) || pointOnSegment(b, c, d);
}

function pointInCell(point, minX, minY, maxX, maxY) {
  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

/**
 * Exact area of a target polygon inside one rectangular grid cell.
 *
 * Most cells are trivially all-in or all-out and avoid polygon clipping. Only
 * boundary cells pay for an intersection, which keeps an assessment mask exact
 * without turning a 40,000-cell map into 40,000 boolean-geometry operations.
 */
function targetAreaInCell(target, minX, minY, maxX, maxY) {
  const cell = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  const inside = cell.map((corner) => pointInPolygon(corner, target));

  let boundaryCrosses = false;
  for (let targetIndex = 0; targetIndex < target.length && !boundaryCrosses; targetIndex += 1) {
    const start = target[targetIndex];
    const end = target[(targetIndex + 1) % target.length];
    for (let cellIndex = 0; cellIndex < cell.length; cellIndex += 1) {
      if (segmentsIntersect(start, end, cell[cellIndex], cell[(cellIndex + 1) % cell.length])) {
        boundaryCrosses = true;
        break;
      }
    }
  }

  const containsVertex = target.some((point) => pointInCell(point, minX, minY, maxX, maxY));
  if (inside.every(Boolean) && !boundaryCrosses && !containsVertex) return (maxX - minX) * (maxY - minY);
  if (!inside.some(Boolean) && !boundaryCrosses && !containsVertex) return 0;
  return intersectionArea(cell, target);
}

/**
 * Hours of direct sun reaching each cell of a ground grid over a day.
 *
 * This is the number overshadowing rules are written against ("no less than
 * two hours of direct sun to 50% of the amenity area on 21 June"), so the
 * result carries the per-cell hours, the sampling step used, and the share of
 * area meeting a threshold.
 *
 * Cost is cells x time steps x shadow polygons. The default 1 m grid keeps a
 * typical site under a few hundred milliseconds; `maxCells` is a hard stop that
 * coarsens the grid rather than letting the UI freeze.
 *
 * @param {object} options
 * @param {Array}  options.masses
 * @param {Array}  options.sunSamples   From `sampleDaySunPositions`.
 * @param {object} options.bounds       `{minX, minY, maxX, maxY}` in mm.
 * @param {number} [options.cellSize]   mm. Default 1000.
 * @param {number} [options.stepMinutes] Minutes each sample represents.
 * @param {number} [options.northAngle]
 * @param {number} [options.thresholdHours] For the compliance share. Default 2.
 * @param {number} [options.maxCells]   Default 40000.
 * @param {Array}  [options.targetPolygon] Property/neighbor area to assess.
 *   Cells outside it remain transparent and do not enter compliance totals.
 */
export function sunHoursGrid({
  masses = [],
  sunSamples = [],
  bounds,
  cellSize = 1000,
  stepMinutes = 15,
  northAngle = 0,
  minAltitudeDeg = DEFAULT_MIN_ALTITUDE_DEG,
  thresholdHours = 2,
  maxCells = 40000,
  targetPolygon = null,
}) {
  if (!bounds) return null;

  const width = Math.max(0, bounds.maxX - bounds.minX);
  const height = Math.max(0, bounds.maxY - bounds.minY);
  if (width <= 0 || height <= 0) return null;

  // Coarsen rather than refuse, so a huge site still returns something usable.
  let size = Math.max(1, cellSize);
  while (Math.ceil(width / size) * Math.ceil(height / size) > maxCells) size *= 2;

  const columns = Math.ceil(width / size);
  const rows = Math.ceil(height / size);
  const hours = new Float32Array(columns * rows);
  const mask = new Uint8Array(columns * rows);
  const assessedAreas = new Float64Array(columns * rows);
  const stepHours = stepMinutes / 60;

  let assessedAreaMm2 = 0;
  for (let row = 0; row < rows; row += 1) {
    const minY = bounds.minY + row * size;
    const maxY = Math.min(bounds.maxY, minY + size);
    for (let column = 0; column < columns; column += 1) {
      const minX = bounds.minX + column * size;
      const maxX = Math.min(bounds.maxX, minX + size);
      const index = row * columns + column;
      const area =
        targetPolygon?.length >= 3
          ? targetAreaInCell(targetPolygon, minX, minY, maxX, maxY)
          : Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
      if (area <= 0) continue;
      mask[index] = 1;
      assessedAreas[index] = area;
      assessedAreaMm2 += area;
    }
  }

  if (assessedAreaMm2 <= 0) return null;

  // Precompute each step's shadow once, then test every cell against it.
  const probe = { x: 0, y: 0 };
  for (const sample of sunSamples) {
    if (!(sample.altitude > minAltitudeDeg * DEG)) continue;

    const bounded = withBounds(castShadows(masses, sample, { northAngle, minAltitudeDeg }));

    // Cells outside every region's bounding box are lit for this step, so the
    // whole row band can be credited without a single polygon walk.
    let shadowMinX = Infinity;
    let shadowMinY = Infinity;
    let shadowMaxX = -Infinity;
    let shadowMaxY = -Infinity;
    for (const entry of bounded) {
      if (entry.minX < shadowMinX) shadowMinX = entry.minX;
      if (entry.minY < shadowMinY) shadowMinY = entry.minY;
      if (entry.maxX > shadowMaxX) shadowMaxX = entry.maxX;
      if (entry.maxY > shadowMaxY) shadowMaxY = entry.maxY;
    }

    for (let row = 0; row < rows; row += 1) {
      const y = bounds.minY + (row + 0.5) * size;
      const rowOutside = !bounded.length || y < shadowMinY || y > shadowMaxY;
      const rowOffset = row * columns;

      if (rowOutside) {
        for (let column = 0; column < columns; column += 1) {
          if (mask[rowOffset + column]) hours[rowOffset + column] += stepHours;
        }
        continue;
      }

      probe.y = y;
      for (let column = 0; column < columns; column += 1) {
        const index = rowOffset + column;
        if (!mask[index]) continue;
        const x = bounds.minX + (column + 0.5) * size;
        if (x < shadowMinX || x > shadowMaxX) {
          hours[index] += stepHours;
          continue;
        }
        probe.x = x;
        if (!pointInBoundedRegions(probe, bounded)) hours[index] += stepHours;
      }
    }
  }

  let maxHours = 0;
  let cellsMeetingThreshold = 0;
  let compliantAreaMm2 = 0;
  let weightedHourArea = 0;
  for (let index = 0; index < hours.length; index += 1) {
    if (!mask[index]) continue;
    const value = hours[index];
    if (value > maxHours) maxHours = value;
    weightedHourArea += value * assessedAreas[index];
    if (value >= thresholdHours) {
      cellsMeetingThreshold += 1;
      compliantAreaMm2 += assessedAreas[index];
    }
  }

  return {
    hours,
    mask,
    assessedAreas,
    columns,
    rows,
    cellSize: size,
    origin: { x: bounds.minX, y: bounds.minY },
    maxHours,
    thresholdHours,
    targetAreaMm2: targetPolygon?.length >= 3 ? Math.abs(polygonArea(targetPolygon)) : assessedAreaMm2,
    assessedAreaMm2,
    compliantAreaMm2,
    compliantFraction: assessedAreaMm2 > 0 ? compliantAreaMm2 / assessedAreaMm2 : 0,
    meanSunHours: assessedAreaMm2 > 0 ? weightedHourArea / assessedAreaMm2 : 0,
    assessedCellCount: mask.reduce((total, value) => total + value, 0),
    cellsMeetingThreshold,
  };
}

/**
 * Ground area (mm²) covered by a shadow result, holes excluded. Useful for
 * reporting how much of a site or neighbouring lot a massing option shades.
 */
export function shadowArea(regions = []) {
  return multiPolygonArea(regions);
}

/**
 * Fraction of a given plot that a shadow covers, 0-1. Answers the question a
 * neighbour actually asks: "how much of my garden does this take?"
 */
export function shadowCoverageOfPlot(regions = [], plot = []) {
  if (plot.length < 3 || !regions.length) return 0;

  const plotArea = multiPolygonArea([{ outline: plot, holes: [] }]);
  if (plotArea <= 0) return 0;

  // Regions coming out of a union are disjoint, so their overlaps with the plot
  // simply add up. Each region's holes are the parts of it that let light
  // through, so they come back off again.
  const shaded = regions.reduce((total, region) => {
    // Disjoint regions, so their overlaps with the plot simply add up.
    const outer = intersectionArea(region.outline, plot);
    const holes = (region.holes || []).reduce((sum, hole) => sum + intersectionArea(hole, plot), 0);
    return total + Math.max(0, outer - holes);
  }, 0);

  return Math.min(1, shaded / plotArea);
}

export const SHADOW_CONSTANTS = { DEFAULT_MIN_ALTITUDE_DEG };
