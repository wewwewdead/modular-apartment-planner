import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createProject, createWall } from '@/domain/models';
import { computeWindStudy } from './windRunner';
import { createWindStudyState } from './windState';
import {
  WIND_FIXTURE_COMFORT_SETTINGS,
  WIND_FIXTURE_DIRECTION_SETTINGS,
  createWindApartmentProject,
  summarizeWindDirectionRun,
} from './__fixtures__/windApartmentProject';

/**
 * Committed static data. Generated once by running `computeWindStudy` against
 * `createWindApartmentProject()` with `WIND_FIXTURE_DIRECTION_SETTINGS` and
 * writing `summarizeWindDirectionRun(result)` to disk; this suite only reads
 * it. Regenerating it is a deliberate act, not a side effect of a test run.
 */
const DIRECTION_FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('./__fixtures__/windDirectionRun.json', import.meta.url)), 'utf8'),
);

/**
 * Same code, same inputs, so equality is the real expectation; the tolerance
 * only absorbs the last bit of double arithmetic. This is regression pinning,
 * not physics validation.
 */
const FLOAT_TOLERANCE = 1e-9;

function expectDeepClose(actual, expected, path = 'result') {
  if (expected === null) {
    expect(actual, path).toBeNull();
    return;
  }
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    const tolerance = FLOAT_TOLERANCE * Math.max(1, Math.abs(expected));
    expect(actual, path).toBeGreaterThanOrEqual(expected - tolerance);
    expect(actual, path).toBeLessThanOrEqual(expected + tolerance);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect(actual.length, `${path}.length`).toBe(expected.length);
    expected.forEach((entry, index) => expectDeepClose(actual[index], entry, `${path}[${index}]`));
    return;
  }
  if (typeof expected === 'object') {
    expect(Object.keys(actual).sort(), `${path} keys`).toEqual(Object.keys(expected).sort());
    for (const key of Object.keys(expected)) expectDeepClose(actual[key], expected[key], `${path}.${key}`);
    return;
  }
  expect(actual, path).toBe(expected);
}

let comfortRun = null;
function fixtureComfortRun() {
  if (!comfortRun) {
    comfortRun = computeWindStudy({
      project: createWindApartmentProject(),
      windStudy: { ...WIND_FIXTURE_COMFORT_SETTINGS },
    });
  }
  return comfortRun;
}

let directionRun = null;
function fixtureDirectionRun() {
  if (!directionRun) {
    directionRun = computeWindStudy({
      project: createWindApartmentProject(),
      windStudy: { ...WIND_FIXTURE_DIRECTION_SETTINGS },
    });
  }
  return directionRun;
}

function projectWithBlock() {
  const project = createProject('Wind');
  const corners = [
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 10000 },
    { x: 0, y: 10000 },
  ];
  project.floors[0].walls = corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], 500, { height: 9000 }),
  );
  return project;
}

describe('wind study runner', () => {
  it('returns an amplification field for one meteorological direction', () => {
    const result = computeWindStudy({
      project: projectWithBlock(),
      windStudy: createWindStudyState({
        enabled: true,
        mode: 'direction',
        resolution: 48,
        iterations: 150,
        domainPadding: 10000,
      }),
    });
    expect(result.mode).toBe('direction');
    expect(result.grid.amplification).toHaveLength(result.grid.columns * result.grid.rows);
    expect(result.summary.peakAmplification).toBeGreaterThan(1);
    expect(result.model.screeningOnly).toBe(true);
  });

  it('runs a multi-sector Weibull comfort classification', () => {
    const windRose = [
      { directionDeg: 0, frequency: 0.6, weibullK: 2, weibullC: 3 },
      { directionDeg: 180, frequency: 0.4, weibullK: 2, weibullC: 3 },
    ];
    const progress = [];
    const result = computeWindStudy(
      {
        project: projectWithBlock(),
        windStudy: createWindStudyState({
          enabled: true,
          mode: 'comfort',
          windRose,
          windRoseSource: 'user',
          resolution: 48,
          iterations: 120,
          domainPadding: 10000,
        }),
      },
      (entry) => progress.push(entry),
    );
    expect(result.mode).toBe('comfort');
    expect(result.grid.categories).toHaveLength(result.grid.columns * result.grid.rows);
    expect(result.representativeFlow.directionDeg).toBe(0);
    expect(result.representativeFlow.frequency).toBeCloseTo(0.6);
    expect(result.representativeFlow.velocityX).toHaveLength(result.grid.columns * result.grid.rows);
    expect(result.summary.fractions.reduce((sum, entry) => sum + entry.fraction, 0)).toBeCloseTo(1, 5);
    expect(result.windRoseSource).toBe('user');
    expect(progress.some((entry) => entry.stage === 'classify')).toBe(true);
  });

  it('returns null when disabled or no pedestrian-height massing exists', () => {
    expect(
      computeWindStudy({ project: projectWithBlock(), windStudy: createWindStudyState({ enabled: false }) }),
    ).toBeNull();
    expect(
      computeWindStudy({ project: createProject('Empty'), windStudy: createWindStudyState({ enabled: true }) }),
    ).toBeNull();
  });
});

/**
 * Characterization suite. These tests pin what the wind stack does TODAY, ahead
 * of the hardening work; every assertion here is a description of current
 * behaviour, not an endorsement of it. Where the pinned value looks wrong the
 * comment says so and names the task that owns the fix.
 */
describe('wind study characterization — direction-mode fixture', () => {
  it('reproduces the committed per-room / per-opening fixture exactly', () => {
    expectDeepClose(summarizeWindDirectionRun(fixtureDirectionRun()), DIRECTION_FIXTURE);
  });

  it('pins the per-room air-change rates the fixture apartment produces', () => {
    const rooms = fixtureDirectionRun().ventilation.rooms;
    const achById = Object.fromEntries(rooms.map((room) => [room.id, room.airChangesPerHour]));
    const fixtureAchById = Object.fromEntries(
      DIRECTION_FIXTURE.ventilation.rooms.map((room) => [room.id, room.airChangesPerHour]),
    );
    expect(Object.keys(achById).sort()).toEqual(['room_ne', 'room_nw', 'room_se', 'room_sw']);
    expectDeepClose(achById, fixtureAchById, 'airChangesPerHour');

    // characterization: pins current behaviour; see T2. Note the ORDER of
    // magnitude, not just the digits — a 100 m³ room with 1.25 m² of open
    // window in a 6 m/s wind lands around 115 h⁻¹ today.
    expect(achById.room_nw).toBeGreaterThan(100);
    expect(achById.room_sw).toBeGreaterThan(100);
    expect(achById.room_ne).toBeGreaterThan(10);
  });

  it('pins the negative Cp offset the LBM field currently carries', () => {
    const openings = fixtureDirectionRun().ventilation.openings.filter((opening) => opening.exterior);
    // characterization: pins current behaviour; see T2. The wind comes from
    // 45° (NE), so the north and east facades are WINDWARD and should sample a
    // positive Cp. Every exterior opening samples a negative one, because
    // lbmSolver.js:114 normalises against lattice density 1.0 with no
    // far-field re-zeroing, leaving a roughly -1.3 constant offset on the
    // whole field. The offset cancels inside the multizone network (only
    // pressure DIFFERENCES drive flow, and the spread here is a believable
    // ΔCp ≈ 1.5), so this is a reporting/absolute-value defect rather than a
    // flow defect — but anything that reads absolute Cp is wrong today.
    expect(openings.every((opening) => opening.pressureCoefficient < 0)).toBe(true);
    const windward = openings.find((opening) => opening.id === 'win_nw_north');
    const leeward = openings.find((opening) => opening.id === 'win_sw_south');
    expect(windward.pressureCoefficient).toBeLessThan(0);
    expect(leeward.pressureCoefficient).toBeLessThan(windward.pressureCoefficient);
    expect(windward.pressureCoefficient - leeward.pressureCoefficient).toBeGreaterThan(1.4);
    // The whole-field mean is far from the ~0 a settled far field should give.
    expect(DIRECTION_FIXTURE.grid.pressureCoefficientSum / DIRECTION_FIXTURE.summary.assessedCellCount).toBeLessThan(
      -0.4,
    );
  });

  it('pins that the fixture run stops on the iteration cap, not on convergence', () => {
    // characterization: pins current behaviour; see T2. `solveD2Q9` converges
    // at residual < 2e-4; this run ends at ~3.5e-2 after all 220 iterations.
    // The fixture is a regression pin, not a converged solution.
    expect(fixtureDirectionRun().grid.solver.iterations).toBe(220);
    expect(fixtureDirectionRun().grid.solver.residual).toBeGreaterThan(2e-4);
  });

  it('pins which openings survive the ventilation topology filter', () => {
    const openings = fixtureDirectionRun().ventilation.openings;
    expect(openings.map((opening) => opening.id)).toEqual([
      'win_nw_north',
      'win_ne_north',
      'win_ne_east',
      'win_sw_south',
      'door_nw_sw',
    ]);
    // Dropped before the network is built: a fixed window, an operable window
    // left at openFraction 0, and a door with no ventilation block at all.
    const ids = new Set(openings.map((opening) => opening.id));
    expect(ids.has('win_se_fixed')).toBe(false);
    expect(ids.has('win_sw_shut')).toBe(false);
    expect(ids.has('door_front')).toBe(false);
  });

  it('pins per-opening flow magnitude and direction', () => {
    const openings = fixtureDirectionRun().ventilation.openings;
    const byId = Object.fromEntries(openings.map((opening) => [opening.id, opening]));
    const fixtureById = Object.fromEntries(
      DIRECTION_FIXTURE.ventilation.openings.map((opening) => [opening.id, opening]),
    );
    for (const id of Object.keys(fixtureById)) {
      expectDeepClose(byId[id].flowM3s, fixtureById[id].flowM3s, `${id}.flowM3s`);
      expect(byId[id].flowDirection, `${id}.flowDirection`).toBe(fixtureById[id].flowDirection);
    }
    expect(openings.map((opening) => opening.flowDirection)).toEqual([
      'b-to-a',
      'b-to-a',
      'a-to-b',
      'a-to-b',
      'b-to-a',
    ]);
  });

  it('pins the room-height fallback that leaves SE shorter than its walls', () => {
    const rooms = fixtureDirectionRun().ventilation.rooms;
    const heightById = Object.fromEntries(rooms.map((room) => [room.id, room.heightMm]));
    // characterization: pins current behaviour; see T2. `roomHeight`
    // (ventilationNetwork.js:43) only probes each wall's MIDPOINT, so a room
    // that no wall midpoint falls into silently drops to the floor-to-floor
    // height. Every wall in the fixture is 3200 tall, yet SE reports 3000.
    expect(heightById.room_nw).toBe(3200);
    expect(heightById.room_ne).toBe(3200);
    expect(heightById.room_sw).toBe(3200);
    expect(heightById.room_se).toBe(3000);
  });

  it('pins the disconnected room that only has a fixed window', () => {
    const rooms = fixtureDirectionRun().ventilation.rooms;
    const se = rooms.find((room) => room.id === 'room_se');
    expect(se.connectedToExterior).toBe(false);
    expect(se.pressurePa).toBe(0);
    expect(se.airChangesPerHour).toBe(0);
    expect(se.crossVentilated).toBe(false);
    expect(fixtureDirectionRun().ventilation.summary.assessedRoomCount).toBe(3);
    expect(fixtureDirectionRun().ventilation.summary.stagnantRoomCount).toBe(1);
  });
});

describe('wind study characterization — result key sets', () => {
  it('pins the direction-mode top-level key set', () => {
    expect(Object.keys(fixtureDirectionRun()).sort()).toEqual([
      'directionDeg',
      'grid',
      'mode',
      'model',
      'sliceHeight',
      'summary',
      'ventilation',
    ]);
  });

  it('pins the direction-mode nested key sets', () => {
    const result = fixtureDirectionRun();
    expect(Object.keys(result.grid).sort()).toEqual([
      'amplification',
      'cellSize',
      'columns',
      'obstacles',
      'origin',
      'pressureCoefficient',
      'rows',
      'solver',
      'velocityX',
      'velocityY',
    ]);
    expect(Object.keys(result.grid.solver).sort()).toEqual(['iterations', 'residual']);
    expect(Object.keys(result.summary).sort()).toEqual([
      'acceleratedFraction',
      'assessedCellCount',
      'meanAmplification',
      'peakAmplification',
      'peakSpeed',
      'referenceSpeed',
      'shelteredFraction',
    ]);
    expect(Object.keys(result.model).sort()).toEqual(['kind', 'screeningOnly']);
    expect(Object.keys(result.ventilation).sort()).toEqual(['model', 'openings', 'rooms', 'solver', 'summary']);
    expect(Object.keys(result.ventilation.summary).sort()).toEqual([
      'assessedRoomCount',
      'crossVentilatedRoomCount',
      'maxAirChangesPerHour',
      'meanAirChangesPerHour',
      'openExteriorCount',
      'openInternalCount',
      'roomCount',
      'stagnantRoomCount',
    ]);
    expect(Object.keys(result.ventilation.solver).sort()).toEqual(['iterations', 'residualM3s']);
    expect(Object.keys(result.ventilation.model).sort()).toEqual([
      'includesIndoorMomentum',
      'includesStackEffect',
      'includesThermalBuoyancy',
      'kind',
      'pressureHeightModel',
      'screeningOnly',
    ]);
    expect(Object.keys(result.ventilation.rooms[0]).sort()).toEqual([
      'airChangesPerHour',
      'areaMm2',
      'centroid',
      'connectedToExterior',
      'crossVentilated',
      'floorElevation',
      'floorId',
      'heightMm',
      'id',
      'inflowM3s',
      'name',
      'outflowM3s',
      'polygon',
      'pressurePa',
      'volumeM3',
    ]);
    // Exterior and internal openings share one shape; the internal one simply
    // carries null for the outdoor-only fields.
    const openingKeys = [
      'centre',
      'centreElevation',
      'dischargeCoefficient',
      'effectiveAreaM2',
      'exterior',
      'floorId',
      'flowDirection',
      'flowM3s',
      'heightMm',
      'id',
      'kind',
      'openFraction',
      'outsidePressurePa',
      'outwardNormal',
      'pressureCoefficient',
      'roomAId',
      'roomBId',
      'wallId',
      'widthMm',
    ];
    expect(Object.keys(result.ventilation.openings[0]).sort()).toEqual(openingKeys);
    const internal = result.ventilation.openings.find((opening) => !opening.exterior);
    expect(Object.keys(internal).sort()).toEqual(openingKeys);
    expect(internal.outwardNormal).toBeNull();
    expect(internal.pressureCoefficient).toBeNull();
    expect(internal.outsidePressurePa).toBeNull();
  });

  it('pins the keys direction mode does NOT produce', () => {
    const result = fixtureDirectionRun();
    expect(result.windRose).toBeUndefined();
    expect(result.windRoseSource).toBeUndefined();
    expect(result.representativeFlow).toBeUndefined();
    expect(result.solverRuns).toBeUndefined();
    expect(result.grid.comfortSpeed).toBeUndefined();
    expect(result.grid.categories).toBeUndefined();
  });

  it('pins the comfort-mode top-level key set', () => {
    expect(Object.keys(fixtureComfortRun()).sort()).toEqual([
      'grid',
      'mode',
      'model',
      'representativeFlow',
      'sliceHeight',
      'solverRuns',
      'summary',
      'windRose',
      'windRoseSource',
    ]);
  });

  it('pins the comfort-mode nested key sets', () => {
    const result = fixtureComfortRun();
    expect(Object.keys(result.grid).sort()).toEqual([
      'assessedCellCount',
      'categories',
      'cellSize',
      'columns',
      'comfortSpeed',
      'counts',
      'obstacles',
      'origin',
      'rows',
      'safetySpeed',
      'unsafe',
      'unsafeCellCount',
      'unsafeFraction',
    ]);
    expect(Object.keys(result.representativeFlow).sort()).toEqual([
      'amplification',
      'directionDeg',
      'frequency',
      'referenceSpeed',
      'velocityX',
      'velocityY',
    ]);
    expect(Object.keys(result.summary).sort()).toEqual(['assessedCellCount', 'fractions', 'unsafeFraction']);
    expect(Object.keys(result.summary.fractions[0]).sort()).toEqual(['fraction', 'id', 'label']);
    expect(result.summary.fractions.map((entry) => entry.id)).toEqual([
      'frequentSitting',
      'occasionalSitting',
      'standing',
      'walking',
      'uncomfortable',
    ]);
    expect(result.solverRuns).toHaveLength(4);
    expect(Object.keys(result.solverRuns[0]).sort()).toEqual(['directionDeg', 'iterations', 'residual']);
    expect(Object.keys(result.model).sort()).toEqual(['kind', 'screeningOnly']);
    expect(Object.keys(result.windRose[0]).sort()).toEqual(['directionDeg', 'frequency', 'weibullC', 'weibullK']);
    expect(result.windRoseSource).toBe('user');
  });

  it('pins the keys comfort mode does NOT produce', () => {
    const result = fixtureComfortRun();
    // characterization: pins current behaviour; see T2 (amendment 2A adds
    // fields here). Only the amplification field survives a sector run
    // (windRunner.js:151); velocity and Cp are discarded for every sector
    // except the representative one, and even that keeps no Cp. Consequently
    // there is no facade pressure to feed a network, and comfort mode returns
    // no `ventilation` block at all.
    expect(result.ventilation).toBeUndefined();
    expect(result.directionDeg).toBeUndefined();
    expect(result.grid.amplification).toBeUndefined();
    expect(result.grid.velocityX).toBeUndefined();
    expect(result.grid.velocityY).toBeUndefined();
    expect(result.grid.pressureCoefficient).toBeUndefined();
    expect(result.grid.solver).toBeUndefined();
    expect(result.representativeFlow.pressureCoefficient).toBeUndefined();
  });

  it('pins the representative sector chosen for the fixture rose', () => {
    const result = fixtureComfortRun();
    expect(result.representativeFlow.directionDeg).toBe(0);
    expect(result.representativeFlow.frequency).toBeCloseTo(0.4, 12);
    // Documented in windRunner.js: the representative "reference speed" is the
    // sector's Weibull scale, used only to pace the 3D particles.
    expect(result.representativeFlow.referenceSpeed).toBe(5.5);
    // The direction-mode `referenceSpeed` setting is ignored in comfort mode.
    expect(WIND_FIXTURE_COMFORT_SETTINGS.referenceSpeed).toBe(6);
  });
});
