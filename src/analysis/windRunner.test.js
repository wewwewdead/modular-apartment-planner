import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createProject, createWall } from '@/domain/models';
import { filterProjectByPhase } from '@/domain/phaseFilter';
import { computeWindStudy } from './windRunner';
import { createWindStudyState } from './windState';
import { VENTILATION_CONSTANTS } from './ventilationNetwork';
// The worker module installs its message handler only where `self` exists, so
// its marshalling helper can be imported and tested here under plain node.
import { transferablesOf } from './wind.worker';
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
    // magnitude, not just the digits. Updated by T11: the fixture's 6 m/s is a
    // 10 m meteorological speed, and the suburban exposure default now brings
    // it to 3.95 m/s at the 1.5 m slice. Every flow is linear in that speed, so
    // a 100 m³ room with 1.25 m² of open window lands around 72 h⁻¹ rather than
    // the 109 h⁻¹ it used to — the same run, read at the height it happens at.
    expect(achById.room_nw).toBeGreaterThan(50);
    expect(achById.room_sw).toBeGreaterThan(50);
    expect(achById.room_ne).toBeGreaterThan(10);
    // Still far above any plausible design target: the cramped fixture domain,
    // not the exposure correction, is what makes these enormous.
    expect(achById.room_nw).toBeLessThan(100);
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
    // share cancels exactly. Updated by T11 — the value moved from 31.8942896
    // to 20.9759360 because the whole run is now read at the 1.5 m slice under
    // the suburban default (x0.65878), not because the cancellation changed.
    expect(byId.win_ne_north.cpSource).toBe('lbm');
    expect(run.ventilation.rooms.find((room) => room.id === 'room_ne').airChangesPerHour).toBeCloseTo(20.975936, 5);
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

  it('gives every fixture room a band whenever it gives it a speed', () => {
    // The T10 contract, swept over the whole fixture rather than asserted on
    // one room: no bare number anywhere, and no 0 standing in for "not
    // modelled". SE is the room that proves the null branch is not vacuous.
    const rooms = fixtureDirectionRun().ventilation.rooms;
    expect(rooms).toHaveLength(4);
    for (const room of rooms) {
      expect(room.airSpeedMs === null, room.id).toBe(room.airSpeedBand === null);
      if (room.airSpeedMs === null) {
        expect(room.connectedToExterior, room.id).toBe(false);
        continue;
      }
      expect(Number.isFinite(room.airSpeedMs), room.id).toBe(true);
      expect(room.airSpeedBand.lowMs, room.id).toBeCloseTo(room.airSpeedMs * 0.5, 12);
      expect(room.airSpeedBand.highMs, room.id).toBeCloseTo(room.airSpeedMs * 1.5, 12);
    }
    expect(rooms.filter((room) => room.airSpeedMs === null).map((room) => room.id)).toEqual(['room_se']);
    expect(fixtureDirectionRun().ventilation.model.includesRoomAirSpeed).toBe(true);
    expect(fixtureDirectionRun().ventilation.model.airSpeedMethod).toBe('bulk-cross-section');
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
 * The disclosure flags a result carries about itself (T12).
 *
 * These are not characterization pins — they are the contract the screening
 * disclaimer is generated from. A flag with no sentence, or a sentence with no
 * flag, fails in `WindStudyPanel.test.jsx`; what fails here is a flag that does
 * not describe what the run actually did.
 */
describe('wind study — model disclosure flags', () => {
  it('discloses the LBM iteration budget it was given, not the residual it reached', () => {
    const run = fixtureDirectionRun();
    expect(run.model.convergence).toBe(`screening-${WIND_FIXTURE_DIRECTION_SETTINGS.iterations}`);
    expect(run.model.convergence).toBe('screening-220');
    // The budget is a separate statement from the outcome, and the fixture is
    // the case where they disagree: it spends all 220 and is still not settled.
    expect(run.grid.solver.iterations).toBe(220);
    expect(run.grid.solver.residual).toBeGreaterThan(2e-4);
  });

  it('changes the disclosed budget when the budget changes', () => {
    const run = computeWindStudy({
      project: createWindApartmentProject(),
      windStudy: { ...WIND_FIXTURE_DIRECTION_SETTINGS, iterations: 600 },
    });
    expect(run.model.convergence).toBe('screening-600');
  });

  it('stamps a neutral phase scope when the caller does not name one', () => {
    expect(fixtureDirectionRun().model.phaseScope).toEqual({ activePhaseId: null, phaseViewMode: 'all' });
    expect(fixtureComfortRun().model.phaseScope).toEqual({ activePhaseId: null, phaseViewMode: 'all' });
  });

  it('carries the phase scope the caller ran under, in both modes', () => {
    const phaseScope = { activePhaseId: 'phase_new', phaseViewMode: 'single' };
    const direction = computeWindStudy({
      project: createWindApartmentProject(),
      windStudy: { ...WIND_FIXTURE_DIRECTION_SETTINGS },
      phaseScope,
    });
    const comfort = computeWindStudy({
      project: createWindApartmentProject(),
      windStudy: { ...WIND_FIXTURE_COMFORT_SETTINGS },
      phaseScope,
    });
    expect(direction.model.phaseScope).toEqual(phaseScope);
    expect(comfort.model.phaseScope).toEqual(phaseScope);
  });

  it('refuses a phase view mode it does not recognise rather than echoing it', () => {
    const run = computeWindStudy({
      project: createWindApartmentProject(),
      windStudy: { ...WIND_FIXTURE_DIRECTION_SETTINGS },
      phaseScope: { activePhaseId: '', phaseViewMode: 'sideways' },
    });
    expect(run.model.phaseScope).toEqual({ activePhaseId: null, phaseViewMode: 'all' });
  });

  it('hands the ventilation network the slice height the field was solved at', () => {
    const run = computeWindStudy({
      project: createWindApartmentProject(),
      windStudy: { ...WIND_FIXTURE_DIRECTION_SETTINGS, sliceHeight: 2200 },
    });
    expect(run.sliceHeight).toBe(2200);
    expect(run.ventilation.model.cpSliceHeightMm).toBe(2200);
    // Which also moves the exposure transform, since both read one setting.
    expect(run.model.exposure.sliceHeightM).toBe(2.2);
  });

  it('names the floors whose openings actually sampled the slice', () => {
    const run = fixtureDirectionRun();
    // Three of the four exterior openings took a usable sample; `win_sw_south`
    // fell back to the correlation. All four sit on the one fixture floor.
    expect(run.ventilation.model.cpSampledFloorIds).toEqual(['floor_wind_fixture']);
    expect(run.ventilation.model.cpFallbackCount).toBe(1);
    expect(run.ventilation.model.verticalCoupling).toBe(false);
  });

  it('flags no extrapolated openings when every one sits on the slice', () => {
    const run = fixtureDirectionRun();
    // Every fixture opening centres at 1500 mm, exactly the slice height.
    expect(run.ventilation.openings.filter((opening) => opening.exterior).map((o) => o.centreElevation)).toEqual([
      1500, 1500, 1500, 1500,
    ]);
    expect(run.ventilation.model.cpExtrapolatedCount).toBe(0);
    expect(run.ventilation.openings.filter((opening) => opening.cpExtrapolated === true)).toHaveLength(0);
  });

  it('flags every opening as extrapolated once the slice is moved a storey away', () => {
    // 3100 mm still cuts the fixture's 3200 mm walls, so there is a real field
    // to sample; the openings centre at 1500 mm, 1600 mm below it — past the
    // 1500 mm band, and the sort of gap a second storey would introduce.
    const run = computeWindStudy({
      project: createWindApartmentProject(),
      windStudy: { ...WIND_FIXTURE_DIRECTION_SETTINGS, sliceHeight: 3100 },
    });
    expect(run.ventilation.model.cpSliceHeightMm).toBe(3100);
    expect(run.ventilation.model.cpExtrapolatedCount).toBe(4);
    expect(run.ventilation.openings.filter((opening) => opening.exterior).every((o) => o.cpExtrapolated)).toBe(true);
    // The internal door stays null: it never sampled the slice at all.
    expect(run.ventilation.openings.find((opening) => !opening.exterior).cpExtrapolated).toBeNull();
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
    expect(Object.keys(result.model).sort()).toEqual([
      'convergence',
      'exposure',
      'kind',
      'phaseScope',
      'screeningOnly',
    ]);
    expect(Object.keys(result.model.exposure).sort()).toEqual([
      'alpha',
      'class',
      'factor',
      'referenceHeightM',
      'sliceHeightM',
    ]);
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
      'airSpeedMethod',
      'cpExtrapolatedCount',
      'cpFallbackCount',
      'cpFallbackModel',
      'cpSampledFloorIds',
      'cpSliceHeightMm',
      'includesIndoorMomentum',
      'includesRoomAirSpeed',
      'includesStackEffect',
      'includesThermalBuoyancy',
      'kind',
      'pressureHeightModel',
      'screeningOnly',
      'verticalCoupling',
    ]);
    expect(Object.keys(result.ventilation.rooms[0]).sort()).toEqual([
      'airChangesPerHour',
      'airSpeedBand',
      'airSpeedMs',
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
      'cpExtrapolated',
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
    // Null, not false: an internal opening never sampled the slice at all, and
    // "not applicable" is a different claim from "sampled and found in band".
    expect(internal.cpExtrapolated).toBeNull();
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
    // Extended by T15: `sectorPressureCoefficients` joins the set. It is the
    // only per-sector field the result keeps — the amplifications are consumed
    // by the classifier and discarded, the Cp fields are not reconstructible
    // from anything that survives, and Stage 2 needs them per sector.
    expect(Object.keys(fixtureComfortRun()).sort()).toEqual([
      'grid',
      'mode',
      'model',
      'representativeFlow',
      'sectorPressureCoefficients',
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
    // Extended by T15: `pressureCoefficient` and `ventilation` join the set.
    expect(Object.keys(result.representativeFlow).sort()).toEqual([
      'amplification',
      'directionDeg',
      'frequency',
      'pressureCoefficient',
      'referenceSpeed',
      'velocityX',
      'velocityY',
      'ventilation',
    ]);
    // The nested network is the same object direction mode returns, not a
    // reduced copy of it: same keys, all the way down to the solver block.
    expect(Object.keys(result.representativeFlow.ventilation).sort()).toEqual([
      'model',
      'openings',
      'rooms',
      'solver',
      'status',
      'summary',
    ]);
    expect(Object.keys(result.representativeFlow.ventilation.solver).sort()).toEqual([
      'converged',
      'failure',
      'iterations',
      'residualM3s',
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
    expect(Object.keys(result.model).sort()).toEqual([
      'convergence',
      'exposure',
      'kind',
      'phaseScope',
      'screeningOnly',
    ]);
    expect(Object.keys(result.windRose[0]).sort()).toEqual(['directionDeg', 'frequency', 'weibullC', 'weibullK']);
    expect(result.windRoseSource).toBe('user');
  });

  it('pins the keys comfort mode does NOT produce', () => {
    const result = fixtureComfortRun();
    // A comfort study is not a single-direction study, and the shape says so.
    // There is no top-level `ventilation` because there is no one set of room
    // pressures a sixteen-sector mixture could report: the network T15 added
    // belongs to the representative SECTOR and is nested inside it. Likewise no
    // top-level `directionDeg`, and no single-direction fields on the grid —
    // the grid a comfort study returns is the classified mixture.
    expect(result.ventilation).toBeUndefined();
    expect(result.directionDeg).toBeUndefined();
    expect(result.grid.amplification).toBeUndefined();
    expect(result.grid.velocityX).toBeUndefined();
    expect(result.grid.velocityY).toBeUndefined();
    expect(result.grid.pressureCoefficient).toBeUndefined();
    expect(result.grid.solver).toBeUndefined();
    // Flipped by T15 (amendment 2A). This used to assert
    // `result.representativeFlow.pressureCoefficient` was undefined: the sector
    // runs discarded Cp, so nothing downstream could ask what a facade was
    // doing. It is now the representative sector's own Cp field.
    expect(result.representativeFlow.pressureCoefficient).toBeInstanceOf(Float32Array);
  });

  it('pins the representative sector chosen for the fixture rose', () => {
    const result = fixtureComfortRun();
    expect(result.representativeFlow.directionDeg).toBe(0);
    expect(result.representativeFlow.frequency).toBeCloseTo(0.4, 12);
    // Documented in windRunner.js: the representative "reference speed" is the
    // sector's Weibull scale. Updated by T11 — it is that scale AT SLICE
    // HEIGHT: 5.5 m/s at 10 m becomes 5.5 x 0.6587795011005992 =
    // 3.6232872560532960 under the suburban default. As of T15 it paces the 3D
    // particles AND sets the dynamic pressure the sector's ventilation network
    // is solved at; the number itself did not move.
    expect(result.representativeFlow.referenceSpeed).toBeCloseTo(3.623287256053296, 12);
    // The rose itself is reported unchanged, still quoted at 10 m.
    expect(result.windRose.find((sector) => sector.directionDeg === 0).weibullC).toBe(5.5);
    // The direction-mode `referenceSpeed` setting is ignored in comfort mode.
    expect(WIND_FIXTURE_COMFORT_SETTINGS.referenceSpeed).toBe(6);
  });
});

/**
 * What a comfort study keeps from its sector runs (T15, plan amendment 2A).
 *
 * These are not characterization pins. They are the contract Stage 2's live
 * canvas and Stage 3's coach are being written against: a sector's pressure
 * field has to still exist after the classifier has taken its amplitudes, and
 * the dominant sector has to arrive with a solved airflow network attached.
 */
describe('wind study — comfort-mode field retention', () => {
  function cellCountOf(result) {
    return result.grid.columns * result.grid.rows;
  }

  it('keeps one Cp field per rose sector, laid out sector-major', () => {
    const result = fixtureComfortRun();
    const cellCount = cellCountOf(result);
    expect(result.windRose).toHaveLength(4);
    expect(result.sectorPressureCoefficients).toBeInstanceOf(Float32Array);
    expect(result.sectorPressureCoefficients).toHaveLength(cellCount * result.windRose.length);
    // Not a zero-filled allocation: every sector wrote something into its slice.
    for (let sector = 0; sector < result.windRose.length; sector += 1) {
      const slice = result.sectorPressureCoefficients.subarray(sector * cellCount, (sector + 1) * cellCount);
      expect(
        slice.some((value) => value !== 0),
        `sector ${sector}`,
      ).toBe(true);
      expect(
        slice.every((value) => Number.isFinite(value)),
        `sector ${sector}`,
      ).toBe(true);
    }
  });

  it('gives sectors that face different ways different fields', () => {
    // Guards the layout itself: a stride bug that wrote every sector over the
    // same slice, or read one, would still pass the sizing test above.
    const result = fixtureComfortRun();
    const cellCount = cellCountOf(result);
    const north = result.sectorPressureCoefficients.subarray(0, cellCount);
    const east = result.sectorPressureCoefficients.subarray(cellCount, cellCount * 2);
    expect(result.windRose[0].directionDeg).toBe(0);
    expect(result.windRose[1].directionDeg).toBe(90);
    let differing = 0;
    for (let cell = 0; cell < cellCount; cell += 1) if (north[cell] !== east[cell]) differing += 1;
    expect(differing).toBeGreaterThan(cellCount / 2);
  });

  it('stores the representative sector as its own array and as a slice, cell for cell', () => {
    // The two are separate allocations on purpose — the flow field is handed to
    // the preview whole, the per-sector block is indexed — so they are checked
    // against each other rather than assumed to be the same object.
    const result = fixtureComfortRun();
    const cellCount = cellCountOf(result);
    const sectorIndex = result.windRose.findIndex(
      (sector) => sector.directionDeg === result.representativeFlow.directionDeg,
    );
    expect(sectorIndex).toBe(0);
    const field = result.representativeFlow.pressureCoefficient;
    expect(field).toHaveLength(cellCount);
    expect(field.buffer).not.toBe(result.sectorPressureCoefficients.buffer);
    const slice = result.sectorPressureCoefficients.subarray(sectorIndex * cellCount, (sectorIndex + 1) * cellCount);
    // Float32 into Float32, so the copy is exact and equality is the right test.
    const mismatched = [];
    for (let cell = 0; cell < cellCount; cell += 1) if (field[cell] !== slice[cell]) mismatched.push(cell);
    expect(mismatched).toEqual([]);
  });

  it('solves the representative sector as a full airflow network, in direction mode’s shape', () => {
    const comfort = fixtureComfortRun().representativeFlow.ventilation;
    const direction = fixtureDirectionRun().ventilation;
    expect(Object.keys(comfort).sort()).toEqual(Object.keys(direction).sort());
    expect(Object.keys(comfort.model).sort()).toEqual(Object.keys(direction.model).sort());
    expect(Object.keys(comfort.solver).sort()).toEqual(Object.keys(direction.solver).sort());
    expect(Object.keys(comfort.summary).sort()).toEqual(Object.keys(direction.summary).sort());
    expect(Object.keys(comfort.rooms[0]).sort()).toEqual(Object.keys(direction.rooms[0]).sort());
    expect(Object.keys(comfort.openings[0]).sort()).toEqual(Object.keys(direction.openings[0]).sort());

    // And it is a solved network, not an empty shell: same fixture apartment,
    // so the same four rooms and the same five surviving openings.
    expect(comfort.status).toBe('ok');
    expect(comfort.solver.converged).toBe(true);
    expect(comfort.solver.failure).toBeNull();
    expect(comfort.rooms.map((room) => room.id)).toEqual(direction.rooms.map((room) => room.id));
    expect(comfort.openings.map((opening) => opening.id)).toEqual(direction.openings.map((opening) => opening.id));
    expect(comfort.model.cpSliceHeightMm).toBe(WIND_FIXTURE_COMFORT_SETTINGS.sliceHeight);
  });

  it('reads that network at the sector’s own slice-height speed, exposure applied once', () => {
    const result = fixtureComfortRun();
    const sector = result.windRose.find((entry) => entry.directionDeg === result.representativeFlow.directionDeg);
    const speed = result.representativeFlow.referenceSpeed;
    // The basis: the sector's 10 m Weibull scale through the same exposure
    // factor direction mode puts `settings.referenceSpeed` through — once.
    expect(speed).toBeCloseTo(sector.weibullC * result.model.exposure.factor, 12);
    expect(speed).toBeLessThan(sector.weibullC);

    // Proved at the network rather than asserted at the call site: every
    // exterior opening's outdoor pressure is Cp * 0.5 * rho * U^2 with exactly
    // that U. A second application of the factor would show up here as a
    // dynamic pressure low by 1 / factor^2, about 2.3x.
    const dynamicPressure = 0.5 * VENTILATION_CONSTANTS.AIR_DENSITY_KG_M3 * speed * speed;
    const exterior = result.representativeFlow.ventilation.openings.filter((opening) => opening.exterior);
    expect(exterior.length).toBeGreaterThan(0);
    for (const opening of exterior) {
      expect(Math.abs(opening.pressureCoefficient), opening.id).toBeGreaterThan(1e-6);
      expect(opening.outsidePressurePa / opening.pressureCoefficient, opening.id).toBeCloseTo(dynamicPressure, 9);
    }
  });

  it('samples the representative network off the sector’s own field, not the mixture', () => {
    // The comfort grid carries no `pressureCoefficient` at all, so a network
    // built from it would fall back to the correlation on every opening. Three
    // of the four exterior openings here are LBM-sampled, which can only have
    // come from the sector run's own field.
    const comfort = fixtureComfortRun().representativeFlow.ventilation;
    const exterior = comfort.openings.filter((opening) => opening.exterior);
    expect(exterior.filter((opening) => opening.cpSource === 'lbm').length).toBeGreaterThanOrEqual(3);
    expect(comfort.model.cpSampledFloorIds).toEqual(['floor_wind_fixture']);
  });
});

/**
 * What the worker is allowed to hand over rather than copy.
 *
 * `postMessage` throws a DataCloneError on a repeated buffer and silently
 * detaches whatever it is given, so this list is the one place a wrong answer
 * costs a run-time failure in a real `Worker` and nothing anywhere else. The
 * function is unit-testable precisely so that failure has a cheaper home.
 */
describe('wind worker — transferable buffers', () => {
  it('offers every array a comfort result owns, each exactly once', () => {
    const result = fixtureComfortRun();
    const buffers = transferablesOf(result);
    const expected = [
      result.grid.obstacles,
      result.grid.comfortSpeed,
      result.grid.safetySpeed,
      result.grid.categories,
      result.grid.unsafe,
      result.grid.counts,
      result.sectorPressureCoefficients,
      result.representativeFlow.amplification,
      result.representativeFlow.velocityX,
      result.representativeFlow.velocityY,
      result.representativeFlow.pressureCoefficient,
    ];
    for (const array of expected) {
      expect(buffers.filter((buffer) => buffer === array.buffer)).toHaveLength(1);
    }
    // Nothing extra, and nothing that is not an ArrayBuffer.
    expect(buffers).toHaveLength(expected.length);
    expect(buffers.every((buffer) => buffer instanceof ArrayBuffer)).toBe(true);
  });

  it('offers the two buffers T15 added, which used not to exist', () => {
    const result = fixtureComfortRun();
    const buffers = transferablesOf(result);
    // Before T15 the list was: grid.obstacles/comfortSpeed/safetySpeed/
    // categories/unsafe/counts plus representativeFlow amplification/velocityX/
    // velocityY — nine. A field left off it is structured-cloned instead of
    // transferred, which is a silent half-megabyte copy per study, so the count
    // is pinned rather than the membership alone.
    expect(buffers).toContain(result.sectorPressureCoefficients.buffer);
    expect(buffers).toContain(result.representativeFlow.pressureCoefficient.buffer);
    expect(buffers).toHaveLength(11);
  });

  it('offers every array a direction result owns, each exactly once', () => {
    const result = fixtureDirectionRun();
    const buffers = transferablesOf(result);
    expect(buffers).toHaveLength(5);
    for (const array of [
      result.grid.obstacles,
      result.grid.amplification,
      result.grid.velocityX,
      result.grid.velocityY,
      result.grid.pressureCoefficient,
    ]) {
      expect(buffers.filter((buffer) => buffer === array.buffer)).toHaveLength(1);
    }
    // A direction study has no representative sector and no per-sector block.
    expect(result.representativeFlow).toBeUndefined();
    expect(result.sectorPressureCoefficients).toBeUndefined();
  });

  it('lists a shared buffer once, however many fields view it', () => {
    // Two views of one allocation is a DataCloneError, not a double transfer.
    const shared = new ArrayBuffer(64);
    const buffers = transferablesOf({
      grid: { obstacles: new Uint8Array(shared, 0, 16), amplification: new Float32Array(shared, 16, 4) },
      sectorPressureCoefficients: new Float32Array(shared, 32, 4),
    });
    expect(buffers).toEqual([shared]);
  });

  it('has nothing to transfer when there is no study', () => {
    expect(transferablesOf(null)).toEqual([]);
    expect(transferablesOf(undefined)).toEqual([]);
    expect(transferablesOf({})).toEqual([]);
  });
});
