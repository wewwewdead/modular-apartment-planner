import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createProject, createWall } from '@/domain/models';
import { filterProjectByPhase } from '@/domain/phaseFilter';
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

  it('pins what the fixture domain does to absolute Cp: 40% blockage, 11 cells of fetch', () => {
    const openings = fixtureDirectionRun().ventilation.openings.filter((opening) => opening.exterior);
    // characterization: pins current behaviour; see T2. Cp is now measured
    // against the solver's own far-field probe (lbmSolver.js), which removes
    // the run-dependent offset the old `rho - 1` form carried. What is left in
    // THIS fixture is not a solver defect but a domain one: the fixture runs at
    // domainPadding 12000 to stay fast, which rasterises to a 15 x 15 solid
    // block in a 48 x 37 lattice — 40 % blockage with 11 cells of upstream
    // fetch. At that geometry the reference band is inside the body's own
    // stagnation influence, so the whole field reads about 1.3 low. The
    // production default (domainPadding 30000) does not do this; the test
    // below runs it and gets a sane field.
    expect(openings.every((opening) => opening.pressureCoefficient < 0)).toBe(true);
    const spread =
      Math.max(...openings.map((opening) => opening.pressureCoefficient)) -
      Math.min(...openings.map((opening) => opening.pressureCoefficient));
    expect(spread).toBeGreaterThan(1.4);
    // A domain-wide mean is not required to be zero even with a correct
    // reference: a blocked, drag-loaded channel has a real streamwise pressure
    // drop. Under-padding still leaves this one far more negative than a
    // well-padded run (-0.30 at domainPadding 120000).
    expect(DIRECTION_FIXTURE.grid.pressureCoefficientSum / DIRECTION_FIXTURE.summary.assessedCellCount).toBeLessThan(
      -1.5,
    );
  });

  it('pins the flow reversal that mixing an LBM sample with a correlation sample can cause', () => {
    // characterization: pins current behaviour; see T2. `win_sw_south` samples
    // Cp = -3.36 in this cramped domain, fails the |Cp| <= 3 sanity test and is
    // replaced by the Swami-Chandra value -0.534. That value is correct on its
    // own datum, but the three surviving LBM samples still carry this domain's
    // ~1.3 low bias, so the substituted opening ends up the HIGHEST pressure of
    // the four and the NW/SW pair draws air in through its leeward facade. With
    // the wind from 45 deg the north and east facades should be the inlets.
    // Mixing sources is only safe when they share a reference, and the guard
    // against that is a well-padded domain, not the sanity test.
    const run = fixtureDirectionRun();
    const byId = Object.fromEntries(run.ventilation.openings.map((opening) => [opening.id, opening]));
    expect(byId.win_sw_south.cpSource).toBe('correlation');
    expect(run.ventilation.model.cpFallbackCount).toBe(1);
    expect(['win_nw_north', 'win_ne_north', 'win_ne_east'].every((id) => byId[id].cpSource === 'lbm')).toBe(true);
    expect(byId.win_sw_south.pressureCoefficient).toBeGreaterThan(byId.win_nw_north.pressureCoefficient);
    // Air enters the leeward south window and leaves the windward north one.
    expect(byId.win_sw_south.flowM3s).toBeLessThan(0);
    expect(byId.win_nw_north.flowM3s).toBeGreaterThan(0);
    // NE is untouched: both its openings are LBM-sourced, so the offset they
    // share cancels exactly and its air-change rate is the pre-fix one to
    // eight significant figures. That is the offset-cancellation claim, tested.
    expect(byId.win_ne_north.cpSource).toBe('lbm');
    expect(run.ventilation.rooms.find((room) => room.id === 'room_ne').airChangesPerHour).toBeCloseTo(31.8942896, 5);
  });

  it('produces a sane, all-LBM facade field at the production default padding', () => {
    // Not characterization: this is the physics the fixture's cramped domain
    // cannot show. Wind from 45 deg (NE), converged, default domainPadding.
    const result = computeWindStudy({
      project: createWindApartmentProject(),
      windStudy: { ...WIND_FIXTURE_DIRECTION_SETTINGS, domainPadding: 30000, iterations: 3000 },
    });
    const byId = Object.fromEntries(result.ventilation.openings.map((opening) => [opening.id, opening]));
    expect(result.grid.solver.residual).toBeLessThan(1e-3);
    expect(result.ventilation.model.cpFallbackCount).toBe(0);
    expect(
      result.ventilation.openings.filter((opening) => opening.exterior).every((opening) => opening.cpSource === 'lbm'),
    ).toBe(true);
    // Every windward facade sits above the leeward one, and none of them is
    // anywhere near the -0.5 to -2.0 band the old un-referenced field produced.
    for (const id of ['win_nw_north', 'win_ne_north', 'win_ne_east']) {
      expect(byId[id].pressureCoefficient, id).toBeGreaterThan(byId.win_sw_south.pressureCoefficient);
      expect(byId[id].pressureCoefficient, id).toBeGreaterThan(-0.5);
    }
    expect(byId.win_sw_south.pressureCoefficient).toBeLessThan(-1);
    // Air enters on the windward side and leaves the leeward one.
    expect(byId.win_nw_north.flowM3s).toBeLessThan(0);
    expect(byId.win_sw_south.flowM3s).toBeGreaterThan(0);
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
      'a-to-b',
      'b-to-a',
      'a-to-b',
      'b-to-a',
      'a-to-b',
    ]);
  });

  it('pins the room-height fallback that leaves SE shorter than its walls', () => {
    const rooms = fixtureDirectionRun().ventilation.rooms;
    const heightById = Object.fromEntries(rooms.map((room) => [room.id, room.heightMm]));
    // characterization: pins current behaviour; see T2. `roomHeight`
    // (ventilationNetwork.js:49) only probes each wall's MIDPOINT, so a room
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
    // Updated by T13. This used to be 1, counting SE — a room with no airflow
    // path at all, whose 0 ACH means "never modelled" rather than "starved".
    // `stagnantRoomCount` now counts only rooms that were actually assessed, and
    // all three of those are far above 0.1 ACH.
    expect(fixtureDirectionRun().ventilation.summary.stagnantRoomCount).toBe(0);
  });

  it('reports the fixture ventilation solve as converged, on an ok model', () => {
    const ventilation = fixtureDirectionRun().ventilation;
    expect(ventilation.status).toBe('ok');
    expect(ventilation.solver.converged).toBe(true);
    expect(ventilation.solver.failure).toBeNull();
    expect(ventilation.solver.residualM3s).toBeLessThan(1e-7);
  });
});

/**
 * A diverged solve has to reach the user as the study's error state.
 *
 * `wind.worker.js` wraps `computeWindStudy` in one try/catch and posts
 * `{ type: 'error', message: error?.message || 'Wind study failed.' }`, which
 * `useStudyWorker` turns into `status: 'error'` with that message verbatim —
 * both already pinned in `useWindStudy.dom.test.jsx`. The untested link was the
 * first one: that the runner lets the throw out at all rather than swallowing it
 * and returning a half-built study. The worker file itself cannot be imported
 * under the node environment, so this is tested at the runner.
 */
describe('wind study — a diverged solver run', () => {
  const UNSTABLE_SETTINGS = { ...WIND_FIXTURE_DIRECTION_SETTINGS, relaxationTime: 0.5, iterations: 400 };

  it('propagates the solver error out of the runner, with a message worth showing', () => {
    let thrown = null;
    try {
      computeWindStudy({ project: createWindApartmentProject(), windStudy: UNSTABLE_SETTINGS });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    // What the worker forwards. It has to be actionable, not just present.
    expect(thrown.message).toBe('Wind solver became unstable. Increase relaxation time or domain resolution.');
    expect(thrown.message).toMatch(/relaxation time/);
  });

  it('propagates it out of comfort mode too, rather than dropping the sector', () => {
    expect(() =>
      computeWindStudy({
        project: createWindApartmentProject(),
        windStudy: { ...UNSTABLE_SETTINGS, ...WIND_FIXTURE_COMFORT_SETTINGS, relaxationTime: 0.5, iterations: 400 },
      }),
    ).toThrow(/unstable/);
  });

  it('does not throw at the relaxation time the fixture actually ships with', () => {
    expect(WIND_FIXTURE_DIRECTION_SETTINGS.relaxationTime).toBe(0.58);
    expect(() => fixtureDirectionRun()).not.toThrow();
  });
});

/**
 * The phase-filtered payload, end to end.
 *
 * `WindStudyContext.dom.test.jsx` pins what the provider POSTS in a strict
 * single-phase view: `filterProjectByPhase` keeps only the two explicitly
 * phased partitions and drops the shell, so the worker receives 2 walls and 0
 * windows. What it cannot show is what the solver then makes of that, because
 * its worker is a stub. This runs the same payload through the real runner.
 */
describe('wind study — a phase view that filters the building away', () => {
  function phasedWindProject() {
    const project = createWindApartmentProject();
    project.phases = [
      { id: 'phase_existing', name: 'Existing', order: 0, color: '#888888', visible: true },
      { id: 'phase_new', name: 'New work', order: 1, color: '#4488cc', visible: true },
    ];
    const floor = project.floors[0];
    floor.walls = floor.walls.map((wall) => ({
      ...wall,
      phaseId: wall.id === 'wall_spine' || wall.id === 'wall_cross' ? 'phase_new' : 'phase_existing',
    }));
    return project;
  }

  it('says the airflow model is empty instead of reporting a silent zero', () => {
    const filtered = filterProjectByPhase(phasedWindProject(), 'phase_new', 'single');
    expect(filtered.floors[0].walls.map((wall) => wall.id)).toEqual(['wall_spine', 'wall_cross']);
    expect(filtered.floors[0].windows).toHaveLength(0);
    expect(filtered.floors[0].rooms).toHaveLength(0);

    const result = computeWindStudy({ project: filtered, windStudy: { ...WIND_FIXTURE_DIRECTION_SETTINGS } });
    // Two partitions are still solid massing at pedestrian height, so this is
    // NOT the null "no massing" study the panel already explains — the outdoor
    // field is real and the peak amplification is a genuine number.
    expect(result).not.toBeNull();
    expect(result.summary.peakAmplification).toBeGreaterThan(1);

    expect(result.ventilation.status).toBe('no-rooms');
    expect(result.ventilation.summary.roomCount).toBe(0);
    expect(result.ventilation.summary.openExteriorCount).toBe(0);
    expect(result.ventilation.summary.meanAirChangesPerHour).toBe(0);
    expect(result.ventilation.summary.maxAirChangesPerHour).toBe(0);
    expect(result.ventilation.summary.stagnantRoomCount).toBe(0);
    // Nothing to solve is not a failed solve.
    expect(result.ventilation.solver).toEqual({
      iterations: 0,
      residualM3s: 0,
      converged: true,
      failure: null,
    });
  });

  it('keeps the full model in the unfiltered view, so the pin above is not vacuous', () => {
    const result = computeWindStudy({
      project: phasedWindProject(),
      windStudy: { ...WIND_FIXTURE_DIRECTION_SETTINGS },
    });
    expect(result.ventilation.status).toBe('ok');
    expect(result.ventilation.summary.roomCount).toBe(4);
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
    expect(Object.keys(result.ventilation).sort()).toEqual([
      'model',
      'openings',
      'rooms',
      'solver',
      'status',
      'summary',
    ]);
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
    expect(Object.keys(result.ventilation.solver).sort()).toEqual([
      'converged',
      'failure',
      'iterations',
      'residualM3s',
    ]);
    expect(Object.keys(result.ventilation.model).sort()).toEqual([
      'cpFallbackCount',
      'cpFallbackModel',
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
      'cpSource',
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
    expect(internal.cpSource).toBeNull();
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
