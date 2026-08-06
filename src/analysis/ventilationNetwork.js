/**
 * Steady wind-pressure opening/room network.
 *
 * This is a multizone airflow model, not indoor CFD. Each room has one unknown
 * pressure and each open window/door is an orifice. Outdoor pressures come
 * from the pedestrian-height LBM field and are applied uniformly over height;
 * stack effect, fans, ductwork, leakage and thermal buoyancy are excluded.
 */

import { add, normalize, perpendicular, scale, subtract } from '@/geometry/point';
import { pointInPolygon, polygonArea, polygonCentroid } from '@/geometry/polygon';
import { positionOnWall, wallLength } from '@/geometry/wallGeometry';
import { WALL_HEIGHT } from '@/domain/defaults';
import { CP_CORRELATION, correlationCp, incidenceFromFlow, isPlausibleCp } from './cpCorrelation';
import { windDirectionBasis } from './windDomain';

const AIR_DENSITY_KG_M3 = 1.204;
const DEFAULT_DISCHARGE_COEFFICIENT = 0.62;
const ROOM_PROBE_MM = 80;
const MIN_EFFECTIVE_AREA_M2 = 1e-4;
const PRESSURE_SMOOTHING_PA = 0.01;
const MAX_SOLVE_ITERATIONS = 60;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function openingSettings(opening, kind) {
  const ventilation = opening?.ventilation || {};
  const fixed = kind === 'window' && opening?.type === 'fixed';
  const operable = fixed ? false : (ventilation.operable ?? true);
  const legacyFraction = kind === 'window' && !fixed ? 0.5 : 0;
  const openFraction = operable ? clamp(finite(ventilation.openFraction, legacyFraction), 0, 1) : 0;
  return {
    operable,
    openFraction,
    dischargeCoefficient: clamp(finite(ventilation.dischargeCoefficient, DEFAULT_DISCHARGE_COEFFICIENT), 0.05, 1),
  };
}

function roomHeight(room, walls, floor) {
  let height = 0;
  for (const wall of walls) {
    const wallHeight = finite(wall.height, 0);
    if (wallHeight <= height || wallLength(wall) <= 0) continue;
    const tangent = normalize(subtract(wall.end, wall.start));
    const normal = perpendicular(tangent);
    const centre = positionOnWall(wall, wallLength(wall) / 2);
    const reach = finite(wall.thickness, 0) / 2 + ROOM_PROBE_MM;
    if (
      pointInPolygon(add(centre, scale(normal, reach)), room.polygon) ||
      pointInPolygon(add(centre, scale(normal, -reach)), room.polygon)
    ) {
      height = wallHeight;
    }
  }
  return height || finite(floor.floorToFloorHeight, WALL_HEIGHT) || WALL_HEIGHT;
}

/** Extract rooms and operable connections without depending on renderer data. */
export function buildVentilationTopology(project) {
  const rooms = [];
  const openings = [];

  for (const floor of project?.floors || []) {
    const walls = floor.walls || [];
    const wallsById = new Map(walls.map((wall) => [wall.id, wall]));
    const floorElevation = finite(floor.elevation, 0);
    const floorRooms = (floor.rooms || [])
      .filter((room) => (room.points || []).length >= 3)
      .map((room) => {
        const polygon = room.points.map((point) => ({ x: point.x, y: point.y }));
        const areaMm2 = polygonArea(polygon);
        return {
          id: room.id,
          floorId: floor.id,
          name: room.name || 'Room',
          polygon,
          centroid: polygonCentroid(polygon),
          areaMm2,
          floorElevation,
          heightMm: 0,
          volumeM3: 0,
        };
      });

    for (const room of floorRooms) {
      room.heightMm = roomHeight(room, walls, floor);
      room.volumeM3 = (room.areaMm2 * room.heightMm) / 1e9;
      rooms.push(room);
    }

    const candidates = [
      ...(floor.windows || []).map((opening) => ({ opening, kind: 'window' })),
      ...(floor.doors || []).map((opening) => ({ opening, kind: 'door' })),
    ];

    for (const { opening, kind } of candidates) {
      const wall = wallsById.get(opening.wallId);
      const length = wall ? wallLength(wall) : 0;
      if (!wall || !(length > 0)) continue;
      const width = finite(opening.width, 0);
      const height = finite(opening.height, 0);
      const settings = openingSettings(opening, kind);
      const effectiveAreaM2 = (width * height * settings.openFraction) / 1e6;
      if (effectiveAreaM2 < MIN_EFFECTIVE_AREA_M2) continue;

      const centre = positionOnWall(wall, clamp(finite(opening.offset, 0), 0, length));
      const tangent = normalize(subtract(wall.end, wall.start));
      const normal = perpendicular(tangent);
      const halfThickness = Math.max(1, finite(wall.thickness, 0) / 2);
      const reach = halfThickness + ROOM_PROBE_MM;
      const positiveRoom =
        floorRooms.find((room) => pointInPolygon(add(centre, scale(normal, reach)), room.polygon)) || null;
      const negativeRoom =
        floorRooms.find((room) => pointInPolygon(add(centre, scale(normal, -reach)), room.polygon)) || null;
      if (!positiveRoom && !negativeRoom) continue;
      if (positiveRoom?.id === negativeRoom?.id) continue;

      const exterior = !positiveRoom || !negativeRoom;
      const roomA = positiveRoom || negativeRoom;
      const roomB = exterior ? null : negativeRoom;
      const outwardNormal = exterior ? (positiveRoom ? scale(normal, -1) : normal) : null;
      const sillElevation = floorElevation + finite(opening.sillHeight, 0);

      openings.push({
        id: opening.id,
        kind,
        wallId: wall.id,
        floorId: floor.id,
        centre,
        centreElevation: sillElevation + height / 2,
        outwardNormal,
        roomAId: roomA.id,
        roomBId: roomB?.id || null,
        exterior,
        widthMm: width,
        heightMm: height,
        effectiveAreaM2,
        openFraction: settings.openFraction,
        dischargeCoefficient: settings.dischargeCoefficient,
      });
    }
  }

  return { rooms, openings };
}

function gridCell(grid, point) {
  const column = Math.floor((point.x - grid.origin.x) / grid.cellSize);
  const row = Math.floor((point.y - grid.origin.y) / grid.cellSize);
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return -1;
  return row * grid.columns + column;
}

/**
 * Direction the free stream TRAVELS in, as a world-frame vector.
 *
 * An explicit meteorological bearing is exact and is what the runner passes. A
 * cached result that carries only fields is read instead: the LBM writes its
 * velocity vectors into the result grid in world coordinates, so their mean over
 * the clear cells is the free stream. Returns null when neither is available.
 */
function freeStreamDirection(grid, directionDeg, northAngle) {
  // `Number(null)` is 0, so the type has to be checked before the value: a
  // missing bearing must not silently read as due north.
  if (typeof directionDeg === 'number' && Number.isFinite(directionDeg)) {
    return windDirectionBasis(directionDeg, finite(northAngle, 0)).flow;
  }
  let x = 0;
  let y = 0;
  const cellCount = grid?.obstacles?.length || 0;
  for (let index = 0; index < cellCount; index += 1) {
    if (grid.obstacles[index]) continue;
    x += finite(grid.velocityX?.[index], 0);
    y += finite(grid.velocityY?.[index], 0);
  }
  return Math.hypot(x, y) > 1e-9 ? { x, y } : null;
}

/**
 * Empirical Cp for one exterior opening, used when the solved field cannot be
 * trusted at that facade.
 *
 * Side ratio is fixed at 1 (a square plan, G = 0). The correlation's side-ratio
 * term needs the width of this facade and of the one adjacent to it, and a
 * general floorplan has no unambiguous "adjacent facade"; the term is worth at
 * most about +/-0.15 at glancing incidence and exactly nothing at normal
 * incidence, which is a smaller error than the situation that triggered the
 * fallback in the first place. With no wind direction at all the opening is
 * treated as a side wall, the least committal of the three regimes — every
 * opening then reads the same Cp, so no spurious flow is invented.
 */
function fallbackPressureCoefficient(opening, flowDirection) {
  const incidenceDeg = flowDirection ? incidenceFromFlow(opening.outwardNormal, flowDirection) : 90;
  return correlationCp({ incidenceDeg, sideRatio: 1 });
}

/**
 * Sample the first clear CFD cell outside an exterior opening, falling back to
 * the Swami-Chandra correlation when that sample fails a sanity test.
 *
 * The sanity test is deliberately wide: non-finite, or outside the plausibility
 * band in `cpCorrelation.js` (|Cp| > 3). A coarse 2D slice legitimately reaches
 * -2.6 on a strongly accelerated side wall, so anything narrower would start
 * discarding real answers. This replaces a silent clamp to +/-2.5, which turned
 * a diverged cell into a plausible-looking number instead of disclosing it.
 *
 * @returns {{pressureCoefficient: number, pressurePa: number, source: 'lbm'|'correlation'}}
 */
export function sampleFacadePressure(opening, grid, referenceSpeed, flowDirection = null) {
  const dynamicPressure = 0.5 * AIR_DENSITY_KG_M3 * referenceSpeed * referenceSpeed;
  const distances = [0.55, 1, 1.75, 2.75, 4].map((factor) => Math.max(100, grid.cellSize * factor));
  let pressureCoefficient = null;
  for (const distance of distances) {
    const point = add(opening.centre, scale(opening.outwardNormal, distance));
    const index = gridCell(grid, point);
    if (index < 0 || grid.obstacles?.[index]) continue;
    const candidate = grid.pressureCoefficient?.[index];
    if (candidate === undefined) break;
    if (isPlausibleCp(candidate)) {
      pressureCoefficient = candidate;
      break;
    }
  }

  const source = pressureCoefficient === null ? 'correlation' : 'lbm';
  if (pressureCoefficient === null) pressureCoefficient = fallbackPressureCoefficient(opening, flowDirection);

  return {
    pressureCoefficient,
    pressurePa: pressureCoefficient * dynamicPressure,
    source,
  };
}

function connectedRooms(rooms, openings) {
  const adjacency = new Map(rooms.map((room) => [room.id, new Set()]));
  const queue = [];
  const connected = new Set();
  for (const opening of openings) {
    if (opening.exterior) {
      if (!connected.has(opening.roomAId)) queue.push(opening.roomAId);
      connected.add(opening.roomAId);
    } else {
      adjacency.get(opening.roomAId)?.add(opening.roomBId);
      adjacency.get(opening.roomBId)?.add(opening.roomAId);
    }
  }
  while (queue.length) {
    const roomId = queue.shift();
    for (const neighbour of adjacency.get(roomId) || []) {
      if (connected.has(neighbour)) continue;
      connected.add(neighbour);
      queue.push(neighbour);
    }
  }
  return connected;
}

function flowAtPressureDifference(opening, pressureDifference) {
  const factor = opening.dischargeCoefficient * opening.effectiveAreaM2 * Math.sqrt(2 / AIR_DENSITY_KG_M3);
  const absolute = Math.abs(pressureDifference);
  const denominator = Math.sqrt(absolute + PRESSURE_SMOOTHING_PA);
  return {
    flow: (factor * pressureDifference) / denominator,
    derivative: (factor * (0.5 * absolute + PRESSURE_SMOOTHING_PA)) / Math.pow(absolute + PRESSURE_SMOOTHING_PA, 1.5),
  };
}

function solveLinear(matrix, rhs) {
  const size = rhs.length;
  const rows = matrix.map((row, index) => [...row, rhs[index]]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let selected = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(rows[row][pivot]) > Math.abs(rows[selected][pivot])) selected = row;
    }
    if (Math.abs(rows[selected][pivot]) < 1e-12) return null;
    [rows[pivot], rows[selected]] = [rows[selected], rows[pivot]];
    const divisor = rows[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) rows[pivot][column] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const multiplier = rows[row][pivot];
      for (let column = pivot; column <= size; column += 1) {
        rows[row][column] -= multiplier * rows[pivot][column];
      }
    }
  }
  return rows.map((row) => row[size]);
}

function solvePressures(rooms, openings) {
  const activeIds = connectedRooms(rooms, openings);
  const activeRooms = rooms.filter((room) => activeIds.has(room.id));
  const indexById = new Map(activeRooms.map((room, index) => [room.id, index]));
  const pressures = new Float64Array(activeRooms.length);
  const outsidePressures = openings.filter((opening) => opening.exterior).map((opening) => opening.outsidePressurePa);
  pressures.fill(
    outsidePressures.length ? outsidePressures.reduce((sum, value) => sum + value, 0) / outsidePressures.length : 0,
  );
  let residualM3s = Infinity;
  let iterations = 0;

  for (iterations = 0; iterations < MAX_SOLVE_ITERATIONS && activeRooms.length; iterations += 1) {
    const residual = new Float64Array(activeRooms.length);
    const jacobian = Array.from({ length: activeRooms.length }, () => new Float64Array(activeRooms.length));
    for (const opening of openings) {
      const a = indexById.get(opening.roomAId);
      const b = opening.exterior ? undefined : indexById.get(opening.roomBId);
      if (a === undefined) continue;
      const pressureB = opening.exterior ? opening.outsidePressurePa : pressures[b];
      const { flow, derivative } = flowAtPressureDifference(opening, pressures[a] - pressureB);
      residual[a] += flow;
      jacobian[a][a] += derivative;
      if (b !== undefined) {
        residual[b] -= flow;
        jacobian[a][b] -= derivative;
        jacobian[b][a] -= derivative;
        jacobian[b][b] += derivative;
      }
    }
    residualM3s = Math.max(0, ...Array.from(residual, Math.abs));
    if (residualM3s < 1e-7) break;
    const correction = solveLinear(
      jacobian,
      Array.from(residual, (value) => -value),
    );
    if (!correction) break;
    for (let index = 0; index < pressures.length; index += 1) pressures[index] += correction[index] * 0.75;
  }

  return { activeIds, activeRooms, indexById, pressures, iterations, residualM3s };
}

/**
 * Compute room pressures, opening flows and air-change rates for one wind run.
 *
 * `directionDeg` / `northAngle` are the meteorological bearing of the run. They
 * are only consulted when a facade sample fails its sanity test and the
 * correlation fallback needs an incidence angle; the solved field is the engine
 * everywhere the sample is sane.
 */
export function computeVentilationNetwork({ project, grid, referenceSpeed = 5, directionDeg = null, northAngle = 0 }) {
  const topology = buildVentilationTopology(project);
  const flowDirection = freeStreamDirection(grid, directionDeg, northAngle);
  let cpFallbackCount = 0;
  const openings = topology.openings.map((opening) => {
    if (!opening.exterior) {
      return { ...opening, outsidePressurePa: null, pressureCoefficient: null, cpSource: null };
    }
    const pressure = sampleFacadePressure(opening, grid, Math.max(0.1, finite(referenceSpeed, 5)), flowDirection);
    if (pressure.source === 'correlation') cpFallbackCount += 1;
    return {
      ...opening,
      outsidePressurePa: pressure.pressurePa,
      pressureCoefficient: pressure.pressureCoefficient,
      cpSource: pressure.source,
    };
  });
  const solved = solvePressures(topology.rooms, openings);
  const roomMetrics = new Map(
    topology.rooms.map((room) => [room.id, { inflowM3s: 0, outflowM3s: 0, openingIds: new Set() }]),
  );

  const openingResults = openings.map((opening) => {
    const a = solved.indexById.get(opening.roomAId);
    const b = opening.exterior ? undefined : solved.indexById.get(opening.roomBId);
    const pressureA = a === undefined ? 0 : solved.pressures[a];
    const pressureB = opening.exterior ? opening.outsidePressurePa : b === undefined ? 0 : solved.pressures[b];
    const flowM3s = a === undefined ? 0 : flowAtPressureDifference(opening, pressureA - pressureB).flow;
    const aMetrics = roomMetrics.get(opening.roomAId);
    aMetrics?.openingIds.add(opening.id);
    if (flowM3s >= 0) aMetrics.outflowM3s += flowM3s;
    else aMetrics.inflowM3s += -flowM3s;
    if (!opening.exterior) {
      const bMetrics = roomMetrics.get(opening.roomBId);
      bMetrics?.openingIds.add(opening.id);
      if (flowM3s >= 0) bMetrics.inflowM3s += flowM3s;
      else bMetrics.outflowM3s += -flowM3s;
    }
    return {
      ...opening,
      flowM3s,
      flowDirection: Math.abs(flowM3s) < 1e-6 ? 'balanced' : flowM3s > 0 ? 'a-to-b' : 'b-to-a',
    };
  });

  const rooms = topology.rooms.map((room) => {
    const index = solved.indexById.get(room.id);
    const metrics = roomMetrics.get(room.id);
    const balancedFlowM3s = (metrics.inflowM3s + metrics.outflowM3s) / 2;
    const airChangesPerHour = room.volumeM3 > 0 ? (balancedFlowM3s * 3600) / room.volumeM3 : 0;
    const hasExchange = metrics.inflowM3s > 1e-5 && metrics.outflowM3s > 1e-5;
    return {
      ...room,
      connectedToExterior: solved.activeIds.has(room.id),
      pressurePa: index === undefined ? 0 : solved.pressures[index],
      inflowM3s: metrics.inflowM3s,
      outflowM3s: metrics.outflowM3s,
      airChangesPerHour,
      crossVentilated: hasExchange && metrics.openingIds.size >= 2,
    };
  });

  const assessedRooms = rooms.filter((room) => room.connectedToExterior);
  return {
    rooms,
    openings: openingResults,
    summary: {
      roomCount: rooms.length,
      assessedRoomCount: assessedRooms.length,
      openExteriorCount: openings.filter((opening) => opening.exterior).length,
      openInternalCount: openings.filter((opening) => !opening.exterior).length,
      crossVentilatedRoomCount: rooms.filter((room) => room.crossVentilated).length,
      stagnantRoomCount: rooms.filter((room) => room.airChangesPerHour < 0.1).length,
      meanAirChangesPerHour: assessedRooms.length
        ? assessedRooms.reduce((sum, room) => sum + room.airChangesPerHour, 0) / assessedRooms.length
        : 0,
      maxAirChangesPerHour: Math.max(0, ...rooms.map((room) => room.airChangesPerHour)),
    },
    solver: { iterations: solved.iterations, residualM3s: solved.residualM3s },
    model: {
      kind: 'wind-pressure-multizone',
      screeningOnly: true,
      pressureHeightModel: 'uniform-from-outdoor-slice',
      includesStackEffect: false,
      includesThermalBuoyancy: false,
      includesIndoorMomentum: false,
      // How many exterior openings could not use the solved field, and what
      // stood in for it. Panels should disclose a non-zero count: those
      // openings carry an empirical low-rise estimate, not this building's CFD.
      cpFallbackCount,
      cpFallbackModel: CP_CORRELATION.model,
    },
  };
}

export const VENTILATION_CONSTANTS = {
  AIR_DENSITY_KG_M3,
  DEFAULT_DISCHARGE_COEFFICIENT,
  PRESSURE_SMOOTHING_PA,
  CP_PLAUSIBILITY_LIMIT: CP_CORRELATION.CP_PLAUSIBILITY_LIMIT,
};
