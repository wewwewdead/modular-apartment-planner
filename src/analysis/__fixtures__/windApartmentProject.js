/**
 * Deterministic apartment used by the wind-study characterization tests.
 *
 * Test-support input only: no production module imports this file. Every id is
 * assigned by hand because `generateId` is clocked off `Date.now()`, and a
 * committed fixture cannot key its rows on a value that moves between the run
 * that generated the JSON and the run that reads it.
 *
 * Plan topology, all millimetres, +y is south (screen-down):
 *
 *   - Outer shell 12000 x 8000, walls 200 thick, 3200 tall.
 *   - `wall_spine`  y = 4500, x 0 -> 12000, 150 thick (splits north / south).
 *   - `wall_cross`  x = 7000, y 0 -> 8000, 150 thick (splits west / east).
 *   - Four rooms: NW, NE, SW, SE.
 *
 *   Openings (mixed on purpose, so the topology filter has something to do):
 *     win_nw_north   NW, exterior, openFraction 0.65
 *     door_front     NW, exterior door with no ventilation block -> closed
 *     win_ne_north   NE, exterior, openFraction 0.25
 *     win_ne_east    NE, exterior, openFraction 0.40
 *     win_sw_south   SW, exterior, openFraction 0.55
 *     win_sw_shut    SW, operable but openFraction 0 -> excluded
 *     win_se_fixed   SE, type 'fixed' -> excluded, leaving SE with no path
 *     door_nw_sw     internal door on wall_spine, openFraction 0.80
 *
 *   So NW <-> SW cross-ventilate through the internal door, NE cross-ventilates
 *   through its own two facades, and SE is deliberately disconnected.
 */

import { createDoor, createProject, createRoom, createWall, createWindow } from '@/domain/models';

const WALL_HEIGHT_MM = 3200;
const EXTERIOR_THICKNESS_MM = 200;
const PARTITION_THICKNESS_MM = 150;

const OUTER = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 8000 },
  { x: 0, y: 8000 },
];

const SPINE_Y = 4500;
const CROSS_X = 7000;

function withId(entity, id) {
  entity.id = id;
  return entity;
}

export function createWindApartmentProject() {
  const project = createProject('Wind characterization apartment');
  project.id = 'proj_wind_fixture';
  project.building.site.northAngle = 0;

  const floor = project.floors[0];
  floor.id = 'floor_wind_fixture';
  floor.name = 'Ground Floor';
  floor.elevation = 0;
  floor.floorToFloorHeight = 3000;

  const exteriorNames = ['n', 'e', 's', 'w'];
  const exteriorWalls = OUTER.map((corner, index) =>
    withId(
      createWall(corner, OUTER[(index + 1) % OUTER.length], EXTERIOR_THICKNESS_MM, { height: WALL_HEIGHT_MM }),
      `wall_ext_${exteriorNames[index]}`,
    ),
  );
  const spine = withId(
    createWall({ x: 0, y: SPINE_Y }, { x: 12000, y: SPINE_Y }, PARTITION_THICKNESS_MM, { height: WALL_HEIGHT_MM }),
    'wall_spine',
  );
  const cross = withId(
    createWall({ x: CROSS_X, y: 0 }, { x: CROSS_X, y: 8000 }, PARTITION_THICKNESS_MM, { height: WALL_HEIGHT_MM }),
    'wall_cross',
  );
  floor.walls = [...exteriorWalls, spine, cross];

  floor.rooms = [
    withId(
      createRoom('NW living', [
        { x: 0, y: 0 },
        { x: CROSS_X, y: 0 },
        { x: CROSS_X, y: SPINE_Y },
        { x: 0, y: SPINE_Y },
      ]),
      'room_nw',
    ),
    withId(
      createRoom('NE bedroom', [
        { x: CROSS_X, y: 0 },
        { x: 12000, y: 0 },
        { x: 12000, y: SPINE_Y },
        { x: CROSS_X, y: SPINE_Y },
      ]),
      'room_ne',
    ),
    withId(
      createRoom('SW kitchen', [
        { x: 0, y: SPINE_Y },
        { x: CROSS_X, y: SPINE_Y },
        { x: CROSS_X, y: 8000 },
        { x: 0, y: 8000 },
      ]),
      'room_sw',
    ),
    withId(
      createRoom('SE store', [
        { x: CROSS_X, y: SPINE_Y },
        { x: 12000, y: SPINE_Y },
        { x: 12000, y: 8000 },
        { x: CROSS_X, y: 8000 },
      ]),
      'room_se',
    ),
  ];

  const nwNorth = withId(createWindow('wall_ext_n', 3000, 1600), 'win_nw_north');
  nwNorth.ventilation = { operable: true, openFraction: 0.65, dischargeCoefficient: 0.62 };

  const neNorth = withId(createWindow('wall_ext_n', 9500, 1200), 'win_ne_north');
  neNorth.ventilation = { operable: true, openFraction: 0.25, dischargeCoefficient: 0.62 };

  const neEast = withId(createWindow('wall_ext_e', 2000, 1000), 'win_ne_east');
  neEast.ventilation = { operable: true, openFraction: 0.4, dischargeCoefficient: 0.62 };

  const swSouth = withId(createWindow('wall_ext_s', 9000, 1600), 'win_sw_south');
  swSouth.ventilation = { operable: true, openFraction: 0.55, dischargeCoefficient: 0.62 };

  const swShut = withId(createWindow('wall_ext_w', 2000, 1200), 'win_sw_shut');
  swShut.ventilation = { operable: true, openFraction: 0, dischargeCoefficient: 0.62 };

  const seFixed = withId(createWindow('wall_ext_e', 6500, 1400, 'fixed'), 'win_se_fixed');

  floor.windows = [nwNorth, neNorth, neEast, swSouth, swShut, seFixed];

  const internalDoor = withId(createDoor('wall_spine', 3000), 'door_nw_sw');
  internalDoor.ventilation = { operable: true, openFraction: 0.8, dischargeCoefficient: 0.62 };

  // No ventilation block at all: pins that doors stay closed until configured.
  const frontDoor = withId(createDoor('wall_ext_n', 6000), 'door_front');

  floor.doors = [internalDoor, frontDoor];

  return project;
}

/** Direction-mode settings the committed JSON fixture was generated with. */
export const WIND_FIXTURE_DIRECTION_SETTINGS = Object.freeze({
  enabled: true,
  mode: 'direction',
  directionDeg: 45,
  referenceSpeed: 6,
  sliceHeight: 1500,
  resolution: 48,
  iterations: 220,
  relaxationTime: 0.58,
  domainPadding: 12000,
});

/** Four-sector rose, deliberately uneven so one sector is clearly dominant. */
export const WIND_FIXTURE_ROSE = Object.freeze([
  Object.freeze({ directionDeg: 0, frequency: 0.4, weibullK: 2, weibullC: 5.5 }),
  Object.freeze({ directionDeg: 90, frequency: 0.25, weibullK: 1.9, weibullC: 4.2 }),
  Object.freeze({ directionDeg: 180, frequency: 0.2, weibullK: 2.1, weibullC: 3.8 }),
  Object.freeze({ directionDeg: 270, frequency: 0.15, weibullK: 2, weibullC: 4.8 }),
]);

/** Comfort-mode settings used by the key-set pins. */
export const WIND_FIXTURE_COMFORT_SETTINGS = Object.freeze({
  ...WIND_FIXTURE_DIRECTION_SETTINGS,
  mode: 'comfort',
  windRose: WIND_FIXTURE_ROSE.map((sector) => ({ ...sector })),
  windRoseSource: 'user',
});

function sumOf(field) {
  let total = 0;
  for (let index = 0; index < field.length; index += 1) total += field[index];
  return total;
}

function countTruthy(field) {
  let total = 0;
  for (let index = 0; index < field.length; index += 1) if (field[index]) total += 1;
  return total;
}

/**
 * Reduce a direction-mode result to the plain JSON the fixture pins. Typed
 * arrays are collapsed to a count plus a sum so the fixture stays readable
 * while still failing if a single cell of the solved field moves.
 */
export function summarizeWindDirectionRun(result) {
  return {
    mode: result.mode,
    directionDeg: result.directionDeg,
    sliceHeight: result.sliceHeight,
    grid: {
      columns: result.grid.columns,
      rows: result.grid.rows,
      cellSize: result.grid.cellSize,
      origin: { x: result.grid.origin.x, y: result.grid.origin.y },
      obstacleCellCount: countTruthy(result.grid.obstacles),
      amplificationSum: sumOf(result.grid.amplification),
      velocityXSum: sumOf(result.grid.velocityX),
      velocityYSum: sumOf(result.grid.velocityY),
      pressureCoefficientSum: sumOf(result.grid.pressureCoefficient),
      solver: { iterations: result.grid.solver.iterations, residual: result.grid.solver.residual },
    },
    summary: {
      referenceSpeed: result.summary.referenceSpeed,
      peakAmplification: result.summary.peakAmplification,
      peakSpeed: result.summary.peakSpeed,
      meanAmplification: result.summary.meanAmplification,
      acceleratedFraction: result.summary.acceleratedFraction,
      shelteredFraction: result.summary.shelteredFraction,
      assessedCellCount: result.summary.assessedCellCount,
    },
    ventilation: {
      summary: { ...result.ventilation.summary },
      solver: { ...result.ventilation.solver },
      model: { ...result.ventilation.model },
      rooms: result.ventilation.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        floorId: room.floorId,
        areaMm2: room.areaMm2,
        heightMm: room.heightMm,
        volumeM3: room.volumeM3,
        connectedToExterior: room.connectedToExterior,
        pressurePa: room.pressurePa,
        inflowM3s: room.inflowM3s,
        outflowM3s: room.outflowM3s,
        airChangesPerHour: room.airChangesPerHour,
        crossVentilated: room.crossVentilated,
      })),
      openings: result.ventilation.openings.map((opening) => ({
        id: opening.id,
        kind: opening.kind,
        wallId: opening.wallId,
        exterior: opening.exterior,
        roomAId: opening.roomAId,
        roomBId: opening.roomBId,
        widthMm: opening.widthMm,
        heightMm: opening.heightMm,
        centreElevation: opening.centreElevation,
        openFraction: opening.openFraction,
        dischargeCoefficient: opening.dischargeCoefficient,
        effectiveAreaM2: opening.effectiveAreaM2,
        pressureCoefficient: opening.pressureCoefficient,
        cpSource: opening.cpSource,
        outsidePressurePa: opening.outsidePressurePa,
        flowM3s: opening.flowM3s,
        flowDirection: opening.flowDirection,
      })),
    },
    model: { ...result.model },
  };
}
