import { describe, expect, it } from 'vitest';
import { createDoor, createProject, createRoom, createWall, createWindow } from '@/domain/models';
import { buildVentilationTopology, computeVentilationNetwork, VENTILATION_CONSTANTS } from './ventilationNetwork';

function rectangularRoomProject() {
  const project = createProject('Ventilation');
  const floor = project.floors[0];
  const points = [
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 8000 },
    { x: 0, y: 8000 },
  ];
  floor.walls = points.map((point, index) => createWall(point, points[(index + 1) % points.length], 200));
  floor.rooms = [createRoom('Living', points)];
  floor.windows = [createWindow(floor.walls[0].id, 3000, 1600), createWindow(floor.walls[2].id, 3000, 1600)];
  return project;
}

function pressureGrid() {
  const columns = 20;
  const rows = 18;
  const cellSize = 1000;
  const pressureCoefficient = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      pressureCoefficient[row * columns + column] = row < 5 ? 0.6 : -0.3;
    }
  }
  return {
    columns,
    rows,
    cellSize,
    origin: { x: -5000, y: -5000 },
    obstacles: new Uint8Array(columns * rows),
    pressureCoefficient,
    velocityX: new Float32Array(columns * rows),
    velocityY: new Float32Array(columns * rows),
  };
}

describe('opening/room pressure network', () => {
  it('extracts legacy operable windows and treats doors as closed until configured', () => {
    const project = rectangularRoomProject();
    project.floors[0].doors = [createDoor(project.floors[0].walls[1].id, 2000)];
    const topology = buildVentilationTopology(project);
    expect(topology.rooms).toHaveLength(1);
    expect(topology.openings).toHaveLength(2);
    expect(topology.openings.every((opening) => opening.kind === 'window')).toBe(true);
    expect(topology.openings[0].openFraction).toBe(0.5);
  });

  it('balances opposing facade pressures and reports room ACH', () => {
    const result = computeVentilationNetwork({
      project: rectangularRoomProject(),
      grid: pressureGrid(),
      referenceSpeed: 5,
    });
    expect(result.summary.assessedRoomCount).toBe(1);
    expect(result.summary.openExteriorCount).toBe(2);
    expect(result.rooms[0].airChangesPerHour).toBeGreaterThan(0.1);
    expect(result.rooms[0].crossVentilated).toBe(true);
    expect(result.openings[0].flowM3s * result.openings[1].flowM3s).toBeLessThan(0);
    expect(result.solver.residualM3s).toBeLessThan(1e-5);
  });

  it('keeps a fixed window out of the airflow topology', () => {
    const project = rectangularRoomProject();
    project.floors[0].windows[0].type = 'fixed';
    project.floors[0].windows[1].ventilation = { operable: false, openFraction: 1 };
    expect(buildVentilationTopology(project).openings).toHaveLength(0);
  });

  it('moves air between rooms through an explicitly open internal door', () => {
    const project = createProject('Two rooms');
    const floor = project.floors[0];
    const outer = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 8000 },
      { x: 0, y: 8000 },
    ];
    floor.walls = outer.map((point, index) => createWall(point, outer[(index + 1) % outer.length], 200));
    const partition = createWall({ x: 5000, y: 0 }, { x: 5000, y: 8000 }, 150);
    floor.walls.push(partition);
    floor.rooms = [
      createRoom('West room', [outer[0], { x: 5000, y: 0 }, { x: 5000, y: 8000 }, outer[3]]),
      createRoom('East room', [{ x: 5000, y: 0 }, outer[1], outer[2], { x: 5000, y: 8000 }]),
    ];
    floor.windows = [createWindow(floor.walls[0].id, 2500, 1600), createWindow(floor.walls[2].id, 2500, 1600)];
    const door = createDoor(partition.id, 4000);
    door.ventilation = { operable: true, openFraction: 0.75, dischargeCoefficient: 0.62 };
    floor.doors = [door];

    const result = computeVentilationNetwork({ project, grid: pressureGrid(), referenceSpeed: 5 });
    expect(result.summary.assessedRoomCount).toBe(2);
    expect(result.summary.openInternalCount).toBe(1);
    expect(result.rooms.every((room) => room.airChangesPerHour > 0.1)).toBe(true);
    expect(result.openings.find((opening) => opening.id === door.id).flowM3s).not.toBeCloseTo(0, 5);
  });
});

/* -------------------------------------------------------------------------- */
/* First-principles physics fixtures                                          */
/* -------------------------------------------------------------------------- */

/**
 * Synthetic Cp field: 60 x 60 cells of 1 m, centred on the model origin so it
 * spans -30 m .. +30 m on both axes.
 *
 * The square, origin-centred layout is what makes the quarter-turn symmetry
 * test bit-exact. On such a grid the world map (x, y) -> (-y, x) sends cell
 * (column, row) to (cells - 1 - row, column), so a rotated field is a pure
 * PERMUTATION of the original values: no resampling, no rounding, no drift to
 * hide a sign error behind. Every fixture below is positioned so its facade
 * probe points land on a cell mid-line (coordinate = 500 mm mod 1000), because
 * exactly on a cell boundary that index map would be ambiguous.
 */
const CP_CELLS = 60;
const CP_CELL_MM = 1000;
const CP_HALF_MM = (CP_CELLS * CP_CELL_MM) / 2;

function cpGrid(valueAt) {
  const count = CP_CELLS * CP_CELLS;
  const pressureCoefficient = new Float32Array(count);
  for (let row = 0; row < CP_CELLS; row += 1) {
    for (let column = 0; column < CP_CELLS; column += 1) {
      pressureCoefficient[row * CP_CELLS + column] = valueAt(column, row);
    }
  }
  return {
    columns: CP_CELLS,
    rows: CP_CELLS,
    cellSize: CP_CELL_MM,
    origin: { x: -CP_HALF_MM, y: -CP_HALF_MM },
    obstacles: new Uint8Array(count),
    pressureCoefficient,
    velocityX: new Float32Array(count),
    velocityY: new Float32Array(count),
  };
}

/**
 * Windward on the north-west diagonal, leeward on the south-east one, so every
 * facade in these fixtures — north, south, east and west — sees a driving
 * pressure difference rather than a degenerate zero.
 */
function diagonalCpGrid() {
  return cpGrid((column, row) => (column + row < 68 ? 0.6 : -0.3));
}

/** Quarter turn of the Cp field: the exact permutation described above. */
function rotateCpGrid90(grid) {
  const size = grid.columns;
  const pressureCoefficient = new Float32Array(grid.pressureCoefficient.length);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      pressureCoefficient[column * size + (size - 1 - row)] = grid.pressureCoefficient[row * size + column];
    }
  }
  return { ...grid, pressureCoefficient };
}

function rotatePoint90(point) {
  return { x: -point.y, y: point.x };
}

/**
 * Quarter turn of the scene using integer coordinate swaps only. Everything the
 * network derives from geometry stays bit-identical: wall directions normalise
 * to exact unit vectors either way, `polygonArea` is term-for-term unchanged by
 * (x, y) -> (-y, x), and openings are placed by wall id + offset rather than by
 * world position. Walls and room outlines are the only geometry the ventilation
 * network reads.
 */
function rotateProject90(project) {
  const next = structuredClone(project);
  for (const floor of next.floors) {
    for (const wall of floor.walls) {
      wall.start = rotatePoint90(wall.start);
      wall.end = rotatePoint90(wall.end);
    }
    for (const room of floor.rooms) {
      room.points = room.points.map(rotatePoint90);
    }
  }
  return next;
}

function withId(entity, id) {
  entity.id = id;
  return entity;
}

/** Ids are hand-assigned: `generateId` is clocked off `Date.now()`. */
function physicsProject(name, id) {
  const project = createProject(name);
  project.id = id;
  const floor = project.floors[0];
  floor.id = `${id}_floor`;
  floor.elevation = 0;
  floor.floorToFloorHeight = 3000;
  floor.walls = [];
  floor.rooms = [];
  floor.windows = [];
  floor.doors = [];
  return project;
}

/** Outer shell shared by every physics fixture. Corners avoid 0 so no rotation produces -0. */
const SHELL = [
  { x: 1050, y: 1050 },
  { x: 10950, y: 1050 },
  { x: 10950, y: 8950 },
  { x: 1050, y: 8950 },
];

function shellWalls(height = 3000) {
  return SHELL.map((corner, index) =>
    withId(createWall(corner, SHELL[(index + 1) % SHELL.length], 200, { height }), `wall_shell_${index}`),
  );
}

function partitionWall(id, start, end, height = 3000) {
  return withId(createWall(start, end, 150, { height }), id);
}

function operableWindow(id, wallId, offset, options = {}) {
  const { width = 2000, height = 1500, openFraction = 1, dischargeCoefficient = 0.62 } = options;
  const window = withId(createWindow(wallId, offset, width), id);
  window.height = height;
  window.sillHeight = 900;
  window.ventilation = { operable: true, openFraction, dischargeCoefficient };
  return window;
}

function openDoor(id, wallId, offset, options = {}) {
  const { width = 900, height = 2100, openFraction = 1, dischargeCoefficient = 0.62 } = options;
  const door = withId(createDoor(wallId, offset, width), id);
  door.height = height;
  door.sillHeight = 0;
  door.ventilation = { operable: true, openFraction, dischargeCoefficient };
  return door;
}

/** (a) One room, two openings on opposite facades. */
function singleRoomProject({ north = {}, south = {} } = {}) {
  const project = physicsProject('Single room', 'proj_single');
  const floor = project.floors[0];
  floor.walls = shellWalls();
  floor.rooms = [withId(createRoom('Room', SHELL), 'room_main')];
  floor.windows = [
    operableWindow('win_north', 'wall_shell_0', 2450, north),
    operableWindow('win_south', 'wall_shell_2', 6450, south),
  ];
  return project;
}

/** (b) Three rooms in series: west facade -> room -> door -> room -> door -> room -> east facade. */
function seriesRoomsProject() {
  const project = physicsProject('Three rooms in series', 'proj_series');
  const floor = project.floors[0];
  const firstX = 4250;
  const secondX = 7750;
  floor.walls = [
    ...shellWalls(),
    partitionWall('wall_p1', { x: firstX, y: SHELL[0].y }, { x: firstX, y: SHELL[2].y }),
    partitionWall('wall_p2', { x: secondX, y: SHELL[0].y }, { x: secondX, y: SHELL[2].y }),
  ];
  floor.rooms = [
    withId(
      createRoom('West', [SHELL[0], { x: firstX, y: SHELL[0].y }, { x: firstX, y: SHELL[2].y }, SHELL[3]]),
      'room_west',
    ),
    withId(
      createRoom('Middle', [
        { x: firstX, y: SHELL[0].y },
        { x: secondX, y: SHELL[0].y },
        { x: secondX, y: SHELL[2].y },
        { x: firstX, y: SHELL[2].y },
      ]),
      'room_middle',
    ),
    withId(
      createRoom('East', [{ x: secondX, y: SHELL[0].y }, SHELL[1], SHELL[2], { x: secondX, y: SHELL[2].y }]),
      'room_east',
    ),
  ];
  floor.windows = [operableWindow('win_west', 'wall_shell_3', 5450), operableWindow('win_east', 'wall_shell_1', 2450)];
  floor.doors = [openDoor('door_west_middle', 'wall_p1', 2450), openDoor('door_middle_east', 'wall_p2', 4450)];
  return project;
}

/** Interior partition lines shared by the multi-room fixtures. */
const SPINE_Y = 4950;
const CROSS_X = 5950;

/**
 * (c) Four rooms wired into a closed loop: NW -> NE -> SE -> SW -> NW. A ring is
 * the topology that exposes a Jacobian sign error, because air has two routes
 * between any pair of rooms and the loop must still close on itself.
 *
 * Walls are 3200 tall against a 3000 floor-to-floor, which deliberately trips
 * the documented `roomHeight` midpoint probe: no wall midpoint lands in NW, so
 * NW falls back to 3000 while its neighbours read 3200.
 */
function ringRoomsProject() {
  const project = physicsProject('Ring of rooms', 'proj_ring');
  const floor = project.floors[0];
  floor.walls = [
    ...shellWalls(3200),
    partitionWall('wall_spine', { x: SHELL[0].x, y: SPINE_Y }, { x: SHELL[1].x, y: SPINE_Y }, 3200),
    partitionWall('wall_cross', { x: CROSS_X, y: SHELL[0].y }, { x: CROSS_X, y: SHELL[2].y }, 3200),
  ];
  floor.rooms = [
    withId(
      createRoom('NW', [
        SHELL[0],
        { x: CROSS_X, y: SHELL[0].y },
        { x: CROSS_X, y: SPINE_Y },
        { x: SHELL[0].x, y: SPINE_Y },
      ]),
      'room_nw',
    ),
    withId(
      createRoom('NE', [
        { x: CROSS_X, y: SHELL[0].y },
        SHELL[1],
        { x: SHELL[1].x, y: SPINE_Y },
        { x: CROSS_X, y: SPINE_Y },
      ]),
      'room_ne',
    ),
    withId(
      createRoom('SW', [
        { x: SHELL[0].x, y: SPINE_Y },
        { x: CROSS_X, y: SPINE_Y },
        { x: CROSS_X, y: SHELL[2].y },
        SHELL[3],
      ]),
      'room_sw',
    ),
    withId(
      createRoom('SE', [
        { x: CROSS_X, y: SPINE_Y },
        { x: SHELL[1].x, y: SPINE_Y },
        SHELL[2],
        { x: CROSS_X, y: SHELL[2].y },
      ]),
      'room_se',
    ),
  ];
  floor.windows = [
    operableWindow('win_nw_north', 'wall_shell_0', 2450, { openFraction: 0.65 }),
    operableWindow('win_ne_east', 'wall_shell_1', 1450, { openFraction: 0.4 }),
    operableWindow('win_se_south', 'wall_shell_2', 3450, { openFraction: 0.55 }),
  ];
  floor.doors = [
    openDoor('door_nw_ne', 'wall_cross', 1450, { openFraction: 0.8 }),
    openDoor('door_sw_se', 'wall_cross', 5450, { openFraction: 0.8 }),
    openDoor('door_nw_sw', 'wall_spine', 1450, { openFraction: 0.6 }),
    openDoor('door_ne_se', 'wall_spine', 7450, { openFraction: 0.6 }),
  ];
  return project;
}

/** (d) A room whose only connection to anywhere is one internal door. */
function deadEndRoomProject() {
  const project = physicsProject('Dead-end room', 'proj_dead_end');
  const floor = project.floors[0];
  floor.walls = [
    ...shellWalls(),
    partitionWall('wall_p1', { x: CROSS_X, y: SHELL[0].y }, { x: CROSS_X, y: SHELL[2].y }),
  ];
  floor.rooms = [
    withId(
      createRoom('Vented', [SHELL[0], { x: CROSS_X, y: SHELL[0].y }, { x: CROSS_X, y: SHELL[2].y }, SHELL[3]]),
      'room_vented',
    ),
    withId(
      createRoom('Dead end', [{ x: CROSS_X, y: SHELL[0].y }, SHELL[1], SHELL[2], { x: CROSS_X, y: SHELL[2].y }]),
      'room_dead_end',
    ),
  ];
  floor.windows = [
    operableWindow('win_north', 'wall_shell_0', 2450),
    operableWindow('win_south', 'wall_shell_2', 6450),
  ];
  floor.doors = [openDoor('door_dead_end', 'wall_p1', 2450)];
  return project;
}

/**
 * Net flow out of one room, computed independently of the module's own
 * bookkeeping: positive `flowM3s` runs room A -> room B (or A -> outdoors).
 */
function roomFlowBalance(result, roomId) {
  let net = 0;
  let throughput = 0;
  for (const opening of result.openings) {
    if (opening.roomAId === roomId) net += opening.flowM3s;
    else if (opening.roomBId === roomId) net -= opening.flowM3s;
    else continue;
    throughput += Math.abs(opening.flowM3s);
  }
  return { net, throughput };
}

function expectMassConserved(result, label) {
  expect(result.rooms.length, `${label}: rooms`).toBeGreaterThan(0);
  for (const room of result.rooms) {
    const { net, throughput } = roomFlowBalance(result, room.id);
    // The solver's own break criterion (ventilationNetwork.js:280) is
    // max |node residual| < 1e-7 m3/s, so every node must meet it individually.
    expect(Math.abs(net), `${label}: ${room.id} absolute imbalance`).toBeLessThan(1e-7);
    if (throughput > 0) {
      expect(Math.abs(net) / throughput, `${label}: ${room.id} relative imbalance`).toBeLessThan(1e-5);
    }
    // The reported per-room metrics must agree with the flows they were derived
    // from, otherwise the ACH a user sees is not the ACH the solver computed.
    expect(room.outflowM3s - room.inflowM3s, `${label}: ${room.id} reported balance`).toBeCloseTo(net, 9);
  }
  expect(result.solver.residualM3s, `${label}: reported solver residual`).toBeLessThan(1e-7);
}

function expectFlowDirectionsConsistent(result, label) {
  for (const opening of result.openings) {
    const expected = Math.abs(opening.flowM3s) < 1e-6 ? 'balanced' : opening.flowM3s > 0 ? 'a-to-b' : 'b-to-a';
    expect(opening.flowDirection, `${label}: ${opening.id} direction`).toBe(expected);
  }
}

/**
 * A facade opening samples outdoor pressure by stepping along its outward
 * normal, so that normal has to point away from the room it serves. Rotation
 * cannot see a normal convention that is uniformly inverted — it rotates with
 * everything else — so the sign is pinned against room geometry directly.
 */
function expectOutwardNormalsPointOut(result, label) {
  const centroidById = new Map(result.rooms.map((room) => [room.id, room.centroid]));
  for (const opening of result.openings) {
    if (!opening.exterior) continue;
    const centroid = centroidById.get(opening.roomAId);
    const inward = { x: centroid.x - opening.centre.x, y: centroid.y - opening.centre.y };
    const alignment = inward.x * opening.outwardNormal.x + inward.y * opening.outwardNormal.y;
    expect(alignment, `${label}: ${opening.id} outward normal points into its room`).toBeLessThan(0);
  }
}

describe('ventilation physics — mass conservation at every room node', () => {
  const topologies = [
    ['single room, two openings', singleRoomProject()],
    ['three rooms in series', seriesRoomsProject()],
    ['ring of four rooms', ringRoomsProject()],
    ['dead-end room behind one internal door', deadEndRoomProject()],
  ];

  for (const [label, project] of topologies) {
    it(`conserves mass at every node — ${label}`, () => {
      const result = computeVentilationNetwork({ project, grid: diagonalCpGrid(), referenceSpeed: 5 });
      expectMassConserved(result, label);
      expectFlowDirectionsConsistent(result, label);
      expectOutwardNormalsPointOut(result, label);
    });
  }

  it('drives real air through every topology, so conservation is not trivially satisfied', () => {
    for (const [label, project] of topologies) {
      const result = computeVentilationNetwork({ project, grid: diagonalCpGrid(), referenceSpeed: 5 });
      const moved = result.openings.reduce((sum, opening) => sum + Math.abs(opening.flowM3s), 0);
      expect(moved, `${label}: total flow`).toBeGreaterThan(0.05);
    }
  });

  it('leaves a dead-end room at rest: no net exchange through its only door', () => {
    const result = computeVentilationNetwork({
      project: deadEndRoomProject(),
      grid: diagonalCpGrid(),
      referenceSpeed: 5,
    });
    const deadEnd = result.rooms.find((room) => room.id === 'room_dead_end');
    const door = result.openings.find((opening) => opening.id === 'door_dead_end');
    // A room with one opening cannot exchange air: whatever enters must leave
    // through the same hole, so the steady solution is zero flow.
    expect(deadEnd.connectedToExterior).toBe(true);
    expect(Math.abs(door.flowM3s)).toBeLessThan(1e-7);
    expect(deadEnd.airChangesPerHour).toBeLessThan(1e-3);
    expect(deadEnd.crossVentilated).toBe(false);
  });
});

describe('ventilation physics — rotational symmetry (network)', () => {
  it('gives bit-identical results for 90, 180 and 270 degree rotations of the scene', () => {
    const baseProject = ringRoomsProject();
    const baseGrid = diagonalCpGrid();
    const base = computeVentilationNetwork({ project: baseProject, grid: baseGrid, referenceSpeed: 5 });

    let project = baseProject;
    let grid = baseGrid;
    for (const quarter of [1, 2, 3]) {
      project = rotateProject90(project);
      grid = rotateCpGrid90(grid);
      const rotated = computeVentilationNetwork({ project, grid, referenceSpeed: 5 });
      const turn = `${quarter * 90} deg`;

      expect(
        rotated.openings.map((opening) => opening.id),
        `${turn}: opening order`,
      ).toEqual(base.openings.map((opening) => opening.id));
      base.openings.forEach((opening, index) => {
        const other = rotated.openings[index];
        expect(other.roomAId, `${turn}: ${opening.id} room A`).toBe(opening.roomAId);
        expect(other.roomBId, `${turn}: ${opening.id} room B`).toBe(opening.roomBId);
        expect(other.pressureCoefficient, `${turn}: ${opening.id} Cp`).toBe(opening.pressureCoefficient);
        // A Jacobian or normal sign error reverses an opening before it changes
        // any magnitude, so the direction string is checked on its own.
        expect(other.flowDirection, `${turn}: ${opening.id} direction`).toBe(opening.flowDirection);
        expect(other.flowM3s, `${turn}: ${opening.id} flow`).toBe(opening.flowM3s);
      });
      base.rooms.forEach((room, index) => {
        const other = rotated.rooms[index];
        expect(other.id, `${turn}: room order`).toBe(room.id);
        expect(other.heightMm, `${turn}: ${room.id} height`).toBe(room.heightMm);
        expect(other.airChangesPerHour, `${turn}: ${room.id} ACH`).toBe(room.airChangesPerHour);
        expect(other.pressurePa, `${turn}: ${room.id} pressure`).toBe(room.pressurePa);
      });
      expect(rotated.summary, `${turn}: summary`).toEqual(base.summary);
    }
  });

  it('rotates a scene that actually has direction-dependent flow', () => {
    const base = computeVentilationNetwork({
      project: ringRoomsProject(),
      grid: diagonalCpGrid(),
      referenceSpeed: 5,
    });
    // Guard against a symmetric fixture making the test above vacuous: the
    // openings must disagree about which way the air is going.
    const directions = new Set(base.openings.map((opening) => opening.flowDirection));
    expect(directions.has('a-to-b')).toBe(true);
    expect(directions.has('b-to-a')).toBe(true);
    expect(base.summary.crossVentilatedRoomCount).toBeGreaterThan(1);
  });
});

describe('ventilation physics — opening-area monotonicity', () => {
  function achFor(overrides) {
    const result = computeVentilationNetwork({
      project: singleRoomProject({ north: overrides }),
      grid: diagonalCpGrid(),
      referenceSpeed: 5,
    });
    return result.rooms.find((room) => room.id === 'room_main').airChangesPerHour;
  }

  function expectNonDecreasing(series, label) {
    for (let index = 1; index < series.length; index += 1) {
      expect(series[index].value, `${label} at ${series[index].step}`).toBeGreaterThanOrEqual(
        series[index - 1].value - 1e-9,
      );
    }
    expect(series[series.length - 1].value, `${label} span`).toBeGreaterThan(series[0].value * 1.5);
  }

  it('never loses air changes when one opening is opened further', () => {
    const series = [];
    for (let step = 1; step <= 20; step += 1) {
      const openFraction = step / 20;
      series.push({ step: `openFraction ${openFraction.toFixed(2)}`, value: achFor({ openFraction }) });
    }
    expectNonDecreasing(series, 'openFraction sweep');
  });

  it('never loses air changes when one opening is made wider', () => {
    const series = [];
    for (let step = 1; step <= 16; step += 1) {
      const width = step * 250;
      series.push({ step: `width ${width}`, value: achFor({ width, openFraction: 0.6 }) });
    }
    expectNonDecreasing(series, 'width sweep');
  });
});

describe('ventilation physics — analytic orifice comparison', () => {
  const { AIR_DENSITY_KG_M3, PRESSURE_SMOOTHING_PA } = VENTILATION_CONSTANTS;

  /** Q = Cd * A_eff * sqrt(2 dP / rho), with 1/A_eff^2 = sum 1/A_i^2 in series. */
  function analyticSeriesFlow(areasM2, dischargeCoefficient, deltaPressurePa) {
    const effectiveArea = 1 / Math.sqrt(areasM2.reduce((sum, area) => sum + 1 / (area * area), 0));
    return dischargeCoefficient * effectiveArea * Math.sqrt((2 * deltaPressurePa) / AIR_DENSITY_KG_M3);
  }

  function twoSidedRun({ referenceSpeed, northWidth = 2000, southWidth = 2000 }) {
    const project = singleRoomProject({
      north: { width: northWidth, height: 1500, openFraction: 1 },
      south: { width: southWidth, height: 1500, openFraction: 1 },
    });
    const result = computeVentilationNetwork({ project, grid: diagonalCpGrid(), referenceSpeed });
    const north = result.openings.find((opening) => opening.id === 'win_north');
    const south = result.openings.find((opening) => opening.id === 'win_south');
    const dynamicPressure = 0.5 * AIR_DENSITY_KG_M3 * referenceSpeed * referenceSpeed;
    return {
      result,
      north,
      south,
      // Read the Cp the module actually sampled, so the closed form is compared
      // against the same driving pressure and not a re-derived one.
      deltaPressurePa: (north.pressureCoefficient - south.pressureCoefficient) * dynamicPressure,
      analytic: (areas) =>
        analyticSeriesFlow(
          areas,
          north.dischargeCoefficient,
          (north.pressureCoefficient - south.pressureCoefficient) * dynamicPressure,
        ),
    };
  }

  it('matches the closed-form series orifice equation within 1% at 5 m/s', () => {
    const run = twoSidedRun({ referenceSpeed: 5 });
    expect(run.north.pressureCoefficient).toBeCloseTo(0.6, 6);
    expect(run.south.pressureCoefficient).toBeCloseTo(-0.3, 6);
    expect(run.deltaPressurePa).toBeGreaterThan(1);

    const expected = run.analytic([run.north.effectiveAreaM2, run.south.effectiveAreaM2]);
    // Windward opening pulls air in (negative = outdoors -> room), leeward pushes it out.
    expect(run.north.flowM3s).toBeLessThan(0);
    expect(run.south.flowM3s).toBeGreaterThan(0);
    expect(Math.abs(run.north.flowM3s + run.south.flowM3s)).toBeLessThan(1e-9);
    expect(Math.abs(Math.abs(run.south.flowM3s) - expected) / expected).toBeLessThan(0.01);
  });

  it('matches the closed form when the two openings have different areas', () => {
    const run = twoSidedRun({ referenceSpeed: 5, northWidth: 3000, southWidth: 1200 });
    const expected = run.analytic([run.north.effectiveAreaM2, run.south.effectiveAreaM2]);
    expect(run.north.effectiveAreaM2).not.toBeCloseTo(run.south.effectiveAreaM2, 6);
    expect(Math.abs(Math.abs(run.south.flowM3s) - expected) / expected).toBeLessThan(0.01);
  });

  it('pins the bias the PRESSURE_SMOOTHING_PA regulariser costs near zero pressure', () => {
    // Characterisation, not physics. `flowAtPressureDifference` divides by
    // sqrt(|dP| + PRESSURE_SMOOTHING_PA) instead of sqrt(|dP|) to keep the
    // Jacobian finite at dP = 0. Well above 0.01 Pa the penalty is invisible
    // (previous test: 0.074% low); at 0.01 Pa across the pair — 0.005 Pa per
    // opening, half the regulariser — the module reports 42.264972% LESS flow
    // than the orifice equation. That number is the cost of the regulariser,
    // pinned here so a future change to it cannot pass unnoticed.
    const dynamicPressureAtOne = 0.5 * AIR_DENSITY_KG_M3;
    const deltaCp = 0.9;
    const referenceSpeed = Math.sqrt(0.01 / (deltaCp * dynamicPressureAtOne));
    const run = twoSidedRun({ referenceSpeed });
    expect(run.deltaPressurePa).toBeCloseTo(0.01, 6);

    const expected = run.analytic([run.north.effectiveAreaM2, run.south.effectiveAreaM2]);
    const ratio = Math.abs(run.south.flowM3s) / expected;
    // Closed form for the symmetric pair: sqrt(dP_i / (dP_i + s)) with
    // dP_i = 0.005 Pa and s = PRESSURE_SMOOTHING_PA = 0.01 Pa, i.e. sqrt(1/3).
    expect(PRESSURE_SMOOTHING_PA).toBe(0.01);
    expect(ratio).toBeCloseTo(Math.sqrt(1 / 3), 6);
    expect(1 - ratio).toBeCloseTo(0.4226497, 6);
  });
});
