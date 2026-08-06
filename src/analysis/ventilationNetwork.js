/**
 * Steady wind-pressure opening/room network.
 *
 * This is a multizone airflow model, not indoor CFD. Each room has one unknown
 * pressure and each open window/door is an orifice. Outdoor pressures come
 * from the pedestrian-height LBM field and are applied uniformly over height;
 * stack effect, fans, ductwork, leakage and thermal buoyancy are excluded.
 */

import { add, normalize, perpendicular, scale, subtract } from '@/geometry/point';
import { pointInPolygon, polygonArea, polygonAreaCentroid } from '@/geometry/polygon';
import { positionOnWall, wallLength } from '@/geometry/wallGeometry';
import { WALL_HEIGHT } from '@/domain/defaults';
import { CP_CORRELATION, correlationCp, incidenceFromFlow, isPlausibleCp } from './cpCorrelation';
import { computeRoomAirSpeed, ROOM_AIR_SPEED_METHOD, UNRESOLVED_ROOM_AIR_SPEED } from './roomAirSpeed';
import { windDirectionBasis } from './windDomain';

const AIR_DENSITY_KG_M3 = 1.204;
const DEFAULT_DISCHARGE_COEFFICIENT = 0.62;
const ROOM_PROBE_MM = 80;
/** Height the outdoor slice is cut at when a caller does not say, mm. */
const DEFAULT_SLICE_HEIGHT_MM = 1500;
/**
 * How far an opening's centre may sit from the Cp slice before its pressure
 * coefficient is disclosed as extrapolated, mm.
 *
 * +/-1500 mm around the default 1500 mm slice spans 0 .. 3000 mm — one storey.
 * Every opening on the storey the slice actually cuts is therefore treated as
 * sampled, and an opening a full floor above or below is flagged: the solve ran
 * in a single horizontal plane and never saw the flow at that height, so the
 * coefficient it hands back is an assumption of vertical uniformity rather than
 * anything the field measured. Purely a disclosure threshold — crossing it
 * changes no number, only what the result admits about itself.
 */
const CP_SLICE_BAND_MM = 1500;
const MIN_EFFECTIVE_AREA_M2 = 1e-4;
const PRESSURE_SMOOTHING_PA = 0.01;
const MAX_SOLVE_ITERATIONS = 60;
/** Newton stops when no room node is out of balance by more than this. */
const CONVERGENCE_RESIDUAL_M3S = 1e-7;
/** Under-relaxation on each Newton correction; the orifice law is stiff near dP = 0. */
const NEWTON_RELAXATION = 0.75;

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
          // Area centroid, not the vertex mean: an L-shaped or many-vertexed
          // room has to report the centre of the air it contains.
          centroid: polygonAreaCentroid(polygon),
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

/**
 * Net flow out of every room node at the given pressures, plus the Jacobian of
 * that net flow with respect to them.
 *
 * Pulled out of the Newton loop so the residual can be re-assembled AFTER the
 * last correction is applied. Assembling it only at the top of each pass — what
 * this used to do — meant a run that stopped on the iteration cap reported the
 * balance of the pressures it had one step ago, not the ones it returned.
 */
function assembleNewtonSystem(openings, pressures, indexById) {
  const size = pressures.length;
  const residual = new Float64Array(size);
  const jacobian = Array.from({ length: size }, () => new Float64Array(size));
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
  // Empty active set: no equations, so nothing is out of balance. `Math.max(0)`
  // already says 0 rather than -Infinity, which is the answer that belongs here.
  return { residual, jacobian, maximum: Math.max(0, ...Array.from(residual, Math.abs)) };
}

/**
 * Damped Newton on the room-pressure network.
 *
 * Reports how it stopped as well as where, because the two are not the same
 * question and a panel that prints air-change rates from a failed solve is
 * lying. `converged` is measured against the loop's own break criterion, and
 * `failure` names the exit that was taken when it is not met:
 *
 *   - `'iteration-cap'`      MAX_SOLVE_ITERATIONS corrections were applied and
 *     the network still is not in balance. Reachable in practice by driving the
 *     flows so large that CONVERGENCE_RESIDUAL_M3S falls below the double
 *     precision of the residual sum itself.
 *   - `'singular-jacobian'`  Gaussian elimination found no usable pivot, so
 *     there is no correction to apply. In this network that means the orifice
 *     derivatives underflowed: they decay like 1/sqrt(dP), so an extreme driving
 *     pressure flattens the system until it is numerically rank-deficient.
 */
function solvePressures(rooms, openings) {
  const activeIds = connectedRooms(rooms, openings);
  const activeRooms = rooms.filter((room) => activeIds.has(room.id));
  const indexById = new Map(activeRooms.map((room, index) => [room.id, index]));
  const pressures = new Float64Array(activeRooms.length);
  const outsidePressures = openings.filter((opening) => opening.exterior).map((opening) => opening.outsidePressurePa);
  pressures.fill(
    outsidePressures.length ? outsidePressures.reduce((sum, value) => sum + value, 0) / outsidePressures.length : 0,
  );

  let system = assembleNewtonSystem(openings, pressures, indexById);
  let iterations = 0;
  let failure = null;

  while (!(system.maximum < CONVERGENCE_RESIDUAL_M3S)) {
    if (iterations >= MAX_SOLVE_ITERATIONS) {
      failure = 'iteration-cap';
      break;
    }
    const correction = solveLinear(
      system.jacobian,
      Array.from(system.residual, (value) => -value),
    );
    if (!correction) {
      failure = 'singular-jacobian';
      break;
    }
    for (let index = 0; index < pressures.length; index += 1) pressures[index] += correction[index] * NEWTON_RELAXATION;
    iterations += 1;
    system = assembleNewtonSystem(openings, pressures, indexById);
  }

  return {
    activeIds,
    activeRooms,
    indexById,
    pressures,
    iterations,
    residualM3s: system.maximum,
    converged: system.maximum < CONVERGENCE_RESIDUAL_M3S,
    failure,
  };
}

/**
 * Compute room pressures, opening flows and air-change rates for one wind run.
 *
 * `directionDeg` / `northAngle` are the meteorological bearing of the run. They
 * are only consulted when a facade sample fails its sanity test and the
 * correlation fallback needs an incidence angle; the solved field is the engine
 * everywhere the sample is sane.
 *
 * `sliceHeightMm` is the height the outdoor field was solved at. Nothing in the
 * solve uses it — the Cp values arrive already sampled — but the result has to
 * be able to say which openings the slice could plausibly speak for, so it is
 * carried through to the disclosure flags rather than left implicit.
 */
export function computeVentilationNetwork({
  project,
  grid,
  referenceSpeed = 5,
  directionDeg = null,
  northAngle = 0,
  sliceHeightMm = DEFAULT_SLICE_HEIGHT_MM,
}) {
  const topology = buildVentilationTopology(project);
  const flowDirection = freeStreamDirection(grid, directionDeg, northAngle);
  // `Number(null)` is 0, and a default parameter only fires on `undefined`, so
  // an explicit null would otherwise put the slice on the ground and re-label
  // every opening's coefficient off the back of it.
  const requestedSliceHeight = finite(sliceHeightMm, DEFAULT_SLICE_HEIGHT_MM);
  const sliceHeight = requestedSliceHeight > 0 ? requestedSliceHeight : DEFAULT_SLICE_HEIGHT_MM;
  let cpFallbackCount = 0;
  let cpExtrapolatedCount = 0;
  const cpSampledFloorIds = new Set();
  const openings = topology.openings.map((opening) => {
    if (!opening.exterior) {
      // An internal opening never touches the outdoor field, so every
      // outdoor-only field is null rather than false: "not applicable", which
      // is a different statement from "sampled and found to be in band".
      return {
        ...opening,
        outsidePressurePa: null,
        pressureCoefficient: null,
        cpSource: null,
        cpExtrapolated: null,
      };
    }
    const pressure = sampleFacadePressure(opening, grid, Math.max(0.1, finite(referenceSpeed, 5)), flowDirection);
    if (pressure.source === 'correlation') cpFallbackCount += 1;
    else cpSampledFloorIds.add(opening.floorId);
    const cpExtrapolated = Math.abs(finite(opening.centreElevation, 0) - sliceHeight) > CP_SLICE_BAND_MM;
    if (cpExtrapolated) cpExtrapolatedCount += 1;
    return {
      ...opening,
      outsidePressurePa: pressure.pressurePa,
      pressureCoefficient: pressure.pressureCoefficient,
      cpSource: pressure.source,
      cpExtrapolated,
    };
  });
  const solved = solvePressures(topology.rooms, openings);
  const roomMetrics = new Map(
    topology.rooms.map((room) => [room.id, { inflowM3s: 0, outflowM3s: 0, openingIds: new Set(), openings: [] }]),
  );

  const openingResults = openings.map((opening) => {
    const a = solved.indexById.get(opening.roomAId);
    const b = opening.exterior ? undefined : solved.indexById.get(opening.roomBId);
    const pressureA = a === undefined ? 0 : solved.pressures[a];
    const pressureB = opening.exterior ? opening.outsidePressurePa : b === undefined ? 0 : solved.pressures[b];
    const flowM3s = a === undefined ? 0 : flowAtPressureDifference(opening, pressureA - pressureB).flow;
    const result = {
      ...opening,
      flowM3s,
      flowDirection: Math.abs(flowM3s) < 1e-6 ? 'balanced' : flowM3s > 0 ? 'a-to-b' : 'b-to-a',
    };
    // `roomMetrics` is keyed by every room in the topology and an opening is
    // only ever built from rooms in that same list, so both lookups are
    // invariants, not possibilities. The optional chaining that used to guard
    // the first line of each pair was theatre: the very next line dereferences
    // the same value unconditionally, so a miss would throw anyway, one line
    // later and with a worse message.
    const aMetrics = roomMetrics.get(opening.roomAId);
    aMetrics.openingIds.add(opening.id);
    aMetrics.openings.push(result);
    if (flowM3s >= 0) aMetrics.outflowM3s += flowM3s;
    else aMetrics.inflowM3s += -flowM3s;
    if (!opening.exterior) {
      const bMetrics = roomMetrics.get(opening.roomBId);
      bMetrics.openingIds.add(opening.id);
      bMetrics.openings.push(result);
      if (flowM3s >= 0) bMetrics.inflowM3s += flowM3s;
      else bMetrics.outflowM3s += -flowM3s;
    }
    return result;
  });

  const rooms = topology.rooms.map((room) => {
    const index = solved.indexById.get(room.id);
    const metrics = roomMetrics.get(room.id);
    const balancedFlowM3s = (metrics.inflowM3s + metrics.outflowM3s) / 2;
    const airChangesPerHour = room.volumeM3 > 0 ? (balancedFlowM3s * 3600) / room.volumeM3 : 0;
    const hasExchange = metrics.inflowM3s > 1e-5 && metrics.outflowM3s > 1e-5;
    const connectedToExterior = solved.activeIds.has(room.id);
    // Every assessed room carries the bulk index by construction. A room that
    // never joined the network reports null rather than 0: its zero would mean
    // "not modelled", which is the one thing a speed of zero must not say.
    const airSpeed = connectedToExterior
      ? computeRoomAirSpeed({ room, openings: metrics.openings })
      : UNRESOLVED_ROOM_AIR_SPEED;
    return {
      ...room,
      connectedToExterior,
      pressurePa: index === undefined ? 0 : solved.pressures[index],
      inflowM3s: metrics.inflowM3s,
      outflowM3s: metrics.outflowM3s,
      airChangesPerHour,
      crossVentilated: hasExchange && metrics.openingIds.size >= 2,
      // Bulk air-movement index, NOT an occupied-zone velocity. The band is
      // never absent when the speed is present; see roomAirSpeed.js.
      airSpeedMs: airSpeed.speedMs,
      airSpeedBand: airSpeed.band,
    };
  });

  const assessedRooms = rooms.filter((room) => room.connectedToExterior);
  return {
    rooms,
    openings: openingResults,
    // Whether there was anything to solve at all, kept separate from the answer.
    // A phase view that filters the facade away leaves a project with walls but
    // no room polygons and no operable openings, and every number below is then
    // a hard zero — indistinguishable, to a reader, from a sealed building that
    // really does move no air. `'no-rooms'` says which one it is.
    status: rooms.length ? 'ok' : 'no-rooms',
    summary: {
      roomCount: rooms.length,
      assessedRoomCount: assessedRooms.length,
      openExteriorCount: openings.filter((opening) => opening.exterior).length,
      openInternalCount: openings.filter((opening) => !opening.exterior).length,
      crossVentilatedRoomCount: rooms.filter((room) => room.crossVentilated).length,
      // Only rooms that were actually assessed can be stagnant. Counting over
      // every room made a room with no airflow path at all — which reports 0 ACH
      // because it was never in the network, not because the wind failed to
      // reach it — indistinguishable from one the solver found starved.
      stagnantRoomCount: assessedRooms.filter((room) => room.airChangesPerHour < 0.1).length,
      meanAirChangesPerHour: assessedRooms.length
        ? assessedRooms.reduce((sum, room) => sum + room.airChangesPerHour, 0) / assessedRooms.length
        : 0,
      maxAirChangesPerHour: Math.max(0, ...rooms.map((room) => room.airChangesPerHour)),
    },
    solver: {
      iterations: solved.iterations,
      residualM3s: solved.residualM3s,
      converged: solved.converged,
      failure: solved.failure,
    },
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
      // Storeys are solved as independent networks. There is no shaft, stair or
      // lift-lobby path between floors in this model, and no buoyancy to drive
      // one even if there were: an opening only ever connects two rooms on the
      // same floor, because that is all `buildVentilationTopology` builds.
      verticalCoupling: false,
      // Which slice the facade coefficients came from, and who could actually
      // see it. A floor absent from `cpSampledFloorIds` had no exterior opening
      // that took a usable sample — its openings ran on the correlation instead.
      cpSliceHeightMm: sliceHeight,
      cpSampledFloorIds: [...cpSampledFloorIds].sort(),
      cpExtrapolatedCount,
      // Every assessed room carries `airSpeedMs`/`airSpeedBand`. The METHOD is
      // stated once, here, rather than repeated on every room: a per-room copy
      // of the string invites a reader to believe rooms could differ, and they
      // cannot — one construction is applied to all of them.
      includesRoomAirSpeed: true,
      airSpeedMethod: ROOM_AIR_SPEED_METHOD,
    },
  };
}

export const VENTILATION_CONSTANTS = {
  AIR_DENSITY_KG_M3,
  DEFAULT_DISCHARGE_COEFFICIENT,
  PRESSURE_SMOOTHING_PA,
  CONVERGENCE_RESIDUAL_M3S,
  MAX_SOLVE_ITERATIONS,
  CP_PLAUSIBILITY_LIMIT: CP_CORRELATION.CP_PLAUSIBILITY_LIMIT,
  CP_SLICE_BAND_MM,
  DEFAULT_SLICE_HEIGHT_MM,
};
