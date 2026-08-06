import { describe, expect, it } from 'vitest';
import { createDoor, createProject, createRoom, createWall, createWindow } from '@/domain/models';
import { computeVentilationNetwork, sampleFacadePressure } from './ventilationNetwork';
import { computeWindStudy } from './windRunner';
import {
  WIND_FIXTURE_PERFORMANCE_COMFORT_SETTINGS,
  WIND_FIXTURE_PERFORMANCE_DIRECTION_SETTINGS,
  createWindApartmentProject,
} from './__fixtures__/windApartmentProject';

/**
 * What the wind and ventilation stack costs, and what its answers are worth at
 * that cost.
 *
 * ## How to read the numbers in this file
 *
 * EVERY measured figure below was taken on one developer machine on the date
 * its comment names, and every threshold is roughly TEN TIMES the measurement
 * beside it. That ratio is the whole discipline, borrowed from
 * `sunStudyPerformance.test.js`: these tests exist to catch a study that has
 * gone from seconds to minutes, not to police a slower laptop or a loaded CI
 * box. A threshold is never relaxed without a fresh measurement written next to
 * it and dated; a measurement that has grown by an order of magnitude is a
 * regression to fix, not a budget to raise.
 *
 * ## What is measured, and why each one
 *
 *   1. The comfort study a user actually waits for — sixteen sectors at the
 *      production resolution. Nothing else in the stack is within an order of
 *      magnitude of it.
 *   2. Residual against iteration budget. This is not a guard at all so much as
 *      a recorded curve: the screening default stops on its iteration cap, and
 *      choosing a better cap needs to know what the extra iterations buy.
 *   3. How far a facade has to move before the solved field notices. The Cp a
 *      window reads is the value of ONE cell, so below one cell a move changes
 *      nothing at all — a coach that offers 100 mm nudges would be offering
 *      the user a number it cannot back up.
 *   4. The multizone re-solve, which is the operation an interactive "what if I
 *      open this window" has to run per keystroke.
 */

function elapsed(fn) {
  const start = performance.now();
  const value = fn();
  return { ms: performance.now() - start, value };
}

/**
 * One production-default direction run, shared by the tests that need a real
 * res-96 field rather than a timing. Building it is ~0.3 s; two tests want it.
 */
let defaultRun = null;
function defaultDirectionRun() {
  if (!defaultRun) {
    defaultRun = computeWindStudy({
      project: createWindApartmentProject(),
      windStudy: { ...WIND_FIXTURE_PERFORMANCE_DIRECTION_SETTINGS },
    });
  }
  return defaultRun;
}

describe('wind comfort study performance', () => {
  it('runs a full sixteen-sector comfort study at production resolution', () => {
    const { ms, value } = elapsed(() =>
      computeWindStudy({
        project: createWindApartmentProject(),
        windStudy: { ...WIND_FIXTURE_PERFORMANCE_COMFORT_SETTINGS },
      }),
    );

    // The run really was the full-size one, not a degenerate grid: 96 x 91
    // cells, sixteen sectors, and a per-sector Cp block of 546 KB — the cost
    // plan amendment 2A accepted in exchange for keeping the fields.
    expect(value.mode).toBe('comfort');
    expect(value.windRose).toHaveLength(16);
    expect(value.grid.columns * value.grid.rows).toBe(8736);
    expect(value.sectorPressureCoefficients).toHaveLength(8736 * 16);
    expect(value.sectorPressureCoefficients.byteLength).toBe(559_104);

    // Measured 2026-08-06: 4.40 s (4402 ms). The plan budgeted 6 s, so the
    // study is inside its budget with room to spare. Threshold is 10x.
    expect(ms).toBeLessThan(45_000);
  }, 90_000);
});

describe('LBM residual against iteration budget', () => {
  /**
   * Measured 2026-08-06, production defaults (resolution 96, padding 30000,
   * relaxation 0.58) on the fixture apartment:
   *
   *     budget   spent   residual     wall time
   *        450     450   2.6545e-2       285 ms   <- `createWindStudyState` default
   *        900     900   1.4528e-2       555 ms
   *       1800    1800   6.3223e-3      1014 ms
   *       3600    3600   2.2912e-3      2025 ms
   *
   * Two things T6 has to weigh, both visible in that table. Cost is linear in
   * the budget — 8x the iterations for 8x the time, no surprises. Accuracy is
   * not: 8x the iterations buys 11.6x less residual, and even then the run has
   * NOT reached `solveD2Q9`'s own 2e-4 convergence tolerance. Every budget here
   * spends every iteration it is given; none of them converges. Whatever cap
   * T6 lands on, the disclaimer has to keep saying "screening".
   */
  const BUDGETS = [450, 900, 1800, 3600];

  it('lowers the residual monotonically as the budget grows, without ever converging', () => {
    const project = createWindApartmentProject();
    const curve = BUDGETS.map((iterations) => {
      const run = computeWindStudy({
        project,
        windStudy: { ...WIND_FIXTURE_PERFORMANCE_DIRECTION_SETTINGS, iterations },
      });
      return { iterations, spent: run.grid.solver.iterations, residual: run.grid.solver.residual };
    });

    for (let index = 1; index < curve.length; index += 1) {
      expect(curve[index].residual, `budget ${curve[index].iterations}`).toBeLessThanOrEqual(curve[index - 1].residual);
    }
    // Every run stopped on its cap, so each residual is what that budget
    // bought and not what an early convergence break happened to leave.
    for (const entry of curve) expect(entry.spent, `budget ${entry.iterations}`).toBe(entry.iterations);
    // The finding T6 owns: eight times the default budget is still an order
    // of magnitude short of the solver's own convergence tolerance. If this
    // ever fails because the residual dropped below 2e-4, the solver got
    // better and this file should say so rather than quietly pass.
    expect(curve[curve.length - 1].residual).toBeGreaterThan(2e-4);

    // Upper bound on the default budget's residual, at 10x the 2.6545e-2
    // measured 2026-08-06. A screening solve is allowed to be unconverged;
    // it is not allowed to silently become ten times worse than that.
    expect(curve[0].iterations).toBe(450);
    expect(curve[0].residual).toBeLessThan(0.27);
  }, 120_000);
});

/**
 * How far a window has to move before the field notices, in millimetres.
 *
 * Measured 2026-08-06 by sliding a probe along the fixture's north facade in
 * 100 mm steps and watching `sampleFacadePressure`. The sampled value is
 * piecewise constant, and the shortest run of constant samples is 700 mm — one
 * grid cell (752.08 mm at resolution 96 on this fixture) to within the 100 mm
 * scan step. This is the floor on the S3 coach's move suggestions: a 200 mm
 * nudge is a no-op on the model that would justify it.
 *
 * The converse is NOT true and the coach must not assume it. A one-cell step
 * always lands in a different CELL, but where the field is flat the neighbouring
 * cell can carry the same Cp: across the 8 m scan only 6 distinct values appear
 * in 81 samples, and the smallest step that changed the value at EVERY position
 * was 2300 mm. One cell is the minimum that CAN matter, not the minimum that
 * must.
 */
const CP_SAMPLE_QUANTISATION_MM = 700;
const CP_PROBE_STEP_MM = 100;
const CP_PROBE_SPAN_MM = 8000;

describe('facade Cp sensitivity to position', () => {
  it('quantises facade Cp to one grid cell, which is the coach’s smallest meaningful move', () => {
    const grid = defaultDirectionRun().grid;
    // The fixture's north facade runs along y = 0 from x = 0 to x = 12000 with
    // its outward normal pointing north (-y). The probe walks it through the
    // same call an opening's Cp is read by, so what is measured is the real
    // sampling path and not a re-derivation of it.
    const samples = [];
    for (let offset = 0; offset <= CP_PROBE_SPAN_MM; offset += CP_PROBE_STEP_MM) {
      const probe = { id: 'probe', centre: { x: 1000 + offset, y: 0 }, outwardNormal: { x: 0, y: -1 } };
      samples.push(sampleFacadePressure(probe, grid, 5, { x: 0, y: 1 }).pressureCoefficient);
    }

    const changes = [];
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index] !== samples[index - 1]) changes.push(index * CP_PROBE_STEP_MM);
    }
    // The leading plateau is skipped: it is truncated by where the scan starts,
    // so its length says something about the probe and nothing about the grid.
    const gaps = changes.slice(1).map((position, index) => position - changes[index]);
    expect(gaps.length).toBeGreaterThan(4);

    const shortestPlateauMm = Math.min(...gaps);
    // One cell, to within the scan step, in both directions. The upper bound is
    // the claim that matters — a coarser field would make small moves even more
    // meaningless — and the lower bound is what stops the test passing on a
    // sampler that had started jittering cell to cell.
    expect(shortestPlateauMm).toBeLessThanOrEqual(grid.cellSize);
    expect(shortestPlateauMm).toBeGreaterThan(grid.cellSize - CP_PROBE_STEP_MM);
    expect(shortestPlateauMm).toBe(CP_SAMPLE_QUANTISATION_MM);
    expect(CP_SAMPLE_QUANTISATION_MM).toBeLessThanOrEqual(grid.cellSize);

    // Far fewer distinct values than samples: the field is flat over stretches
    // of this facade, which is why one cell is a floor and not a guarantee.
    expect(new Set(samples).size).toBeLessThan(samples.length / 4);
  });
});

/**
 * A ring of rooms, built to a room count rather than drawn.
 *
 * `n` trapezoidal rooms fill an annulus. Each shares a radial partition with
 * the room before it — including room 0 with room n-1, so the internal doors
 * form a closed loop — and each has one operable window on its own stretch of
 * the outer facade. That gives exactly `n` pressure unknowns, `n` exterior
 * openings and `n` internal ones, which is the shape a real floorplate has and
 * the shape the dense Newton solve is worst at.
 *
 * Everything here is a function of `roomCount`. No randomness, no clock: the
 * same topology comes out on every run and on every machine.
 */
const RING_INNER_RADIUS_MM = 6000;
const RING_OUTER_RADIUS_MM = 12000;

function ringPoint(radius, index, count) {
  const angle = (index / count) * Math.PI * 2;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

function syntheticRingProject(roomCount) {
  const project = createProject(`Ring ${roomCount}`);
  const floor = project.floors[0];
  floor.id = 'floor_ring';
  floor.elevation = 0;
  floor.floorToFloorHeight = 3000;
  const walls = [];
  const rooms = [];
  const windows = [];
  const doors = [];

  for (let index = 0; index < roomCount; index += 1) {
    const inner = ringPoint(RING_INNER_RADIUS_MM, index, roomCount);
    const outer = ringPoint(RING_OUTER_RADIUS_MM, index, roomCount);
    const nextInner = ringPoint(RING_INNER_RADIUS_MM, index + 1, roomCount);
    const nextOuter = ringPoint(RING_OUTER_RADIUS_MM, index + 1, roomCount);

    const radial = createWall(inner, outer, 150, { height: 3000 });
    radial.id = `wall_radial_${index}`;
    const facade = createWall(outer, nextOuter, 200, { height: 3000 });
    facade.id = `wall_facade_${index}`;
    const back = createWall(nextInner, inner, 150, { height: 3000 });
    back.id = `wall_back_${index}`;
    walls.push(radial, facade, back);

    const room = createRoom(`Room ${index}`, [inner, outer, nextOuter, nextInner]);
    room.id = `room_${index}`;
    rooms.push(room);

    const facadeLength = Math.hypot(nextOuter.x - outer.x, nextOuter.y - outer.y);
    const sash = createWindow(facade.id, facadeLength / 2, 1200);
    sash.id = `win_${index}`;
    sash.ventilation = { operable: true, openFraction: 0.5, dischargeCoefficient: 0.62 };
    windows.push(sash);

    const door = createDoor(radial.id, (RING_OUTER_RADIUS_MM - RING_INNER_RADIUS_MM) / 2);
    door.id = `door_${index}`;
    door.ventilation = { operable: true, openFraction: 0.8, dischargeCoefficient: 0.62 };
    doors.push(door);
  }

  floor.walls = walls;
  floor.rooms = rooms;
  floor.windows = windows;
  floor.doors = doors;
  return project;
}

/**
 * A smooth synthetic outdoor field, so the network's cost is the network's.
 *
 * A real LBM slice would be another second of solve time and would measure the
 * solver, not the multizone step this test is about. The Cp ramp below is
 * plausible (-1.2 to +0.4, well inside the sanity band), so every opening takes
 * the `'lbm'` path and none of them detours through the correlation fallback.
 */
function syntheticOutdoorField() {
  const cellSize = 500;
  const extent = 20000;
  const columns = Math.ceil((extent * 2) / cellSize);
  const rows = columns;
  const obstacles = new Uint8Array(columns * rows);
  const pressureCoefficient = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = -extent + (column + 0.5) * cellSize;
      pressureCoefficient[row * columns + column] = 0.8 * (x / extent) - 0.4;
    }
  }
  return { columns, rows, cellSize, origin: { x: -extent, y: -extent }, obstacles, pressureCoefficient };
}

describe('ventilation network re-solve cost', () => {
  const field = syntheticOutdoorField();

  function solveRing(project) {
    return computeVentilationNetwork({
      project,
      grid: field,
      referenceSpeed: 4,
      directionDeg: 0,
      northAngle: 0,
      sliceHeightMm: 1500,
    });
  }

  /**
   * Measured 2026-08-06, mean of repeated solves after one warm-up call:
   *
   *     n = 10 rooms    0.568 ms   (Stage 3 budgeted < 5 ms; it is 9x inside)
   *     n = 60 rooms    9.459 ms
   *
   * Six times the rooms costs seventeen times the time, which is the dense
   * Gauss elimination inside the Newton loop showing its O(n^3): both sizes
   * take the same 14 Newton passes, so the growth is all in the linear solve.
   * A floorplate several times larger than 60 rooms would stop being
   * interactive, and that is the thing this test is here to notice.
   */
  it.each([
    { roomCount: 10, repeats: 40, budgetMs: 6 },
    { roomCount: 60, repeats: 8, budgetMs: 95 },
  ])(
    're-solves a $roomCount-room ring within its budget',
    ({ roomCount, repeats, budgetMs }) => {
      const project = syntheticRingProject(roomCount);
      // Warm-up, and the correctness check that makes the timing mean something:
      // a network that silently found no rooms would be very fast indeed.
      const warm = solveRing(project);
      expect(warm.status).toBe('ok');
      expect(warm.rooms).toHaveLength(roomCount);
      expect(warm.summary.assessedRoomCount).toBe(roomCount);
      expect(warm.summary.openExteriorCount).toBe(roomCount);
      expect(warm.summary.openInternalCount).toBe(roomCount);
      expect(warm.solver.converged).toBe(true);
      expect(warm.model.cpFallbackCount).toBe(0);

      const { ms } = elapsed(() => {
        for (let pass = 0; pass < repeats; pass += 1) solveRing(project);
      });
      // Thresholds are 10x the per-solve means quoted above.
      expect(ms / repeats).toBeLessThan(budgetMs);
    },
    60_000,
  );
});
