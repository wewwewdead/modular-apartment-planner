import { pointInPolygon } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';

const DEG = Math.PI / 180;

export function windDirectionBasis(directionDeg, northAngle = 0) {
  const fromBearing = (directionDeg + northAngle) * DEG;
  // A meteorological bearing names the direction the wind comes from. Negate
  // that compass vector to get the direction the air travels in model space.
  const flow = { x: -Math.sin(fromBearing), y: Math.cos(fromBearing) };
  const cross = { x: -flow.y, y: flow.x };
  return { flow, cross };
}

export function massesAtSlice(masses = [], sliceHeight = 1500) {
  return masses.filter((mass) => {
    const top = Math.max(...(mass.topElevations || []), -Infinity);
    return mass.footprint?.length >= 3 && (mass.baseElevation || 0) <= sliceHeight && top >= sliceHeight;
  });
}

function projectedBounds(masses, basis) {
  let minS = Infinity;
  let maxS = -Infinity;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const mass of masses) {
    for (const point of mass.footprint) {
      const s = point.x * basis.flow.x + point.y * basis.flow.y;
      const t = point.x * basis.cross.x + point.y * basis.cross.y;
      minS = Math.min(minS, s);
      maxS = Math.max(maxS, s);
      minT = Math.min(minT, t);
      maxT = Math.max(maxT, t);
    }
  }
  return Number.isFinite(minS) ? { minS, maxS, minT, maxT } : null;
}

function worldBounds(masses) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const mass of masses) {
    for (const point of mass.footprint) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function massEntries(masses) {
  return masses.map((mass) => ({
    mass,
    bounds: mass.footprint.reduce(
      (bounds, point) => ({
        minX: Math.min(bounds.minX, point.x),
        minY: Math.min(bounds.minY, point.y),
        maxX: Math.max(bounds.maxX, point.x),
        maxY: Math.max(bounds.maxY, point.y),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    ),
  }));
}

function cellIntersectsMasses(cell, entries) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of cell) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

  for (const { mass, bounds } of entries) {
    if (maxX < bounds.minX || minX > bounds.maxX || maxY < bounds.minY || minY > bounds.maxY) continue;
    // Most solid cells are caught without invoking polygon clipping. Boundary
    // cells use exact overlap so walls thinner than one CFD cell do not vanish.
    if (pointInPolygon(center, mass.footprint) && !(mass.holes || []).some((hole) => pointInPolygon(center, hole))) {
      return true;
    }
    const outerArea = intersectionArea(cell, mass.footprint);
    if (outerArea <= 0) continue;
    const holeArea = (mass.holes || []).reduce((sum, hole) => sum + intersectionArea(cell, hole), 0);
    if (outerArea - holeArea > 1e-6) return true;
  }
  return false;
}

/** Rasterize the pedestrian-height solid slice into a wind-aligned domain. */
export function buildWindDomain({
  masses,
  directionDeg,
  northAngle = 0,
  sliceHeight = 1500,
  resolution = 96,
  domainPadding = 30000,
}) {
  const activeMasses = massesAtSlice(masses, sliceHeight);
  if (!activeMasses.length) return null;
  const basis = windDirectionBasis(directionDeg, northAngle);
  const projected = projectedBounds(activeMasses, basis);
  const padding = Math.max(1000, domainPadding);
  const minS = projected.minS - padding;
  const maxS = projected.maxS + padding * 2;
  const minT = projected.minT - padding;
  const maxT = projected.maxT + padding;
  const cellSize = Math.max(maxS - minS, maxT - minT) / Math.max(16, resolution);
  const columns = Math.max(3, Math.ceil((maxS - minS) / cellSize));
  const rows = Math.max(3, Math.ceil((maxT - minT) / cellSize));
  const obstacles = new Uint8Array(columns * rows);
  const entries = massEntries(activeMasses);

  for (let row = 0; row < rows; row += 1) {
    const t0 = minT + row * cellSize;
    const t1 = t0 + cellSize;
    for (let column = 0; column < columns; column += 1) {
      const s0 = minS + column * cellSize;
      const s1 = s0 + cellSize;
      const world = (s, t) => ({
        x: basis.flow.x * s + basis.cross.x * t,
        y: basis.flow.y * s + basis.cross.y * t,
      });
      const cell = [world(s0, t0), world(s1, t0), world(s1, t1), world(s0, t1)];
      if (cellIntersectsMasses(cell, entries)) obstacles[row * columns + column] = 1;
    }
  }

  return { columns, rows, cellSize, minS, minT, basis, obstacles, activeMasses };
}

/** Common model-space grid used to combine differently rotated sector runs. */
export function buildWindResultGrid({ masses, sliceHeight = 1500, resolution = 96, domainPadding = 30000 }) {
  const activeMasses = massesAtSlice(masses, sliceHeight);
  const bounds = worldBounds(activeMasses);
  if (!bounds) return null;
  const padding = Math.max(1000, domainPadding);
  const minX = bounds.minX - padding;
  const minY = bounds.minY - padding;
  const maxX = bounds.maxX + padding;
  const maxY = bounds.maxY + padding;
  const cellSize = Math.max(maxX - minX, maxY - minY) / Math.max(16, resolution);
  const columns = Math.max(1, Math.ceil((maxX - minX) / cellSize));
  const rows = Math.max(1, Math.ceil((maxY - minY) / cellSize));
  const obstacles = new Uint8Array(columns * rows);
  const entries = massEntries(activeMasses);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x0 = minX + column * cellSize;
      const y0 = minY + row * cellSize;
      const cell = [
        { x: x0, y: y0 },
        { x: x0 + cellSize, y: y0 },
        { x: x0 + cellSize, y: y0 + cellSize },
        { x: x0, y: y0 + cellSize },
      ];
      if (cellIntersectsMasses(cell, entries)) obstacles[row * columns + column] = 1;
    }
  }
  return { columns, rows, cellSize, origin: { x: minX, y: minY }, obstacles };
}

export function sampleLocalFieldAtWorld(domain, field, x, y, fallback = 1) {
  const s = x * domain.basis.flow.x + y * domain.basis.flow.y;
  const t = x * domain.basis.cross.x + y * domain.basis.cross.y;
  const column = Math.floor((s - domain.minS) / domain.cellSize);
  const row = Math.floor((t - domain.minT) / domain.cellSize);
  if (column < 0 || row < 0 || column >= domain.columns || row >= domain.rows) return fallback;
  return field[row * domain.columns + column];
}
