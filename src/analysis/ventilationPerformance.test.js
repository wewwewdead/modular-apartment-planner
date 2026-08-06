import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDoor, createProject, createRoom, createWall, createWindow } from '@/domain/models';
import { solveD2Q9, solveD2Q9Async } from './lbmSolver';
import { computeVentilationNetwork, sampleFacadePressure } from './ventilationNetwork';
import { computeWindStudy } from './windRunner';
import { createWindStudyRunner } from './wind.worker';
import {
  WIND_FIXTURE_PERFORMANCE_COMFORT_SETTINGS,
  WIND_FIXTURE_PERFORMANCE_DIRECTION_SETTINGS,
  createWindApartmentProject,
} from './__fixtures__/windApartmentProject';

/**
 * Entries into the lattice, counted.
 *
 * The cache's central claim is negative — "this request did not solve" — and a
 * timing cannot prove a negative. Wrapping both solver entry points can. The
 * wrapper delegates to the real thing, so nothing else in this file is affected
 * by it beyond a function call per solve.
 */
const lbmCalls = vi.hoisted(() => ({ sync: 0, async: 0 }));

vi.mock('./lbmSolver', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    solveD2Q9: (...args) => {
      lbmCalls.sync += 1;
      return actual.solveD2Q9(...args);
    },
    solveD2Q9Async: (...args) => {
      lbmCalls.async += 1;
      return actual.solveD2Q9Async(...args);
    },
  };
});

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
 *   5. What the worker's solved-field cache turns (4) into end to end — the
 *      whole study re-answered without the lattice — and what the chunked,
 *      abandonable solver costs for being interruptible.
 */

function elapsed(fn) {
  const start = performance.now();
  const value = fn();
  return { ms: performance.now() - start, value };
}

async function elapsedAsync(fn) {
  const start = performance.now();
  const value = await fn();
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

/* -------------------------------------------------------------------------- */
/* The warm path                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What the worker's solved-field cache is worth (T6).
 *
 * The ring above measures the multizone solve on its own. This measures the
 * thing a user actually experiences: a whole wind study re-answered after a
 * ventilation-only edit — same walls, one window's open fraction moved — which
 * is the single most common interaction the study supports and used to cost a
 * complete lattice solve.
 *
 * Same discipline as the rest of the file: every figure was measured on one
 * developer machine on the date beside it, and every threshold is about ten
 * times it.
 */
function ventilationEdit(openFraction) {
  const project = createWindApartmentProject();
  const window = project.floors[0].windows[0];
  window.ventilation = { ...window.ventilation, openFraction };
  return project;
}

describe('wind study cache — the massing-hit path', () => {
  beforeEach(() => {
    lbmCalls.sync = 0;
    lbmCalls.async = 0;
  });

  /**
   * Measured 2026-08-06, production defaults (resolution 96, padding 30000,
   * 450 iterations) on the fixture apartment:
   *
   *     direction, cold          351.6 ms
   *     direction, warm mean       0.446 ms   (30 repeats after one warm-up)
   *
   * That is the answer to the plan's promise about single-digit milliseconds:
   * it is not single-digit, it is sub-millisecond, because at this size the
   * multizone solve on four rooms is well under the 0.568 ms the ten-room ring
   * above costs and the rest is array copies. The ratio is ~790x.
   */
  it('re-answers a ventilation-only change without going near the lattice', async () => {
    const runner = createWindStudyRunner();
    const settings = { ...WIND_FIXTURE_PERFORMANCE_DIRECTION_SETTINGS };

    const cold = await elapsedAsync(() => runner.run({ project: createWindApartmentProject(), windStudy: settings }));
    expect(lbmCalls.async).toBe(1);
    expect(cold.value.grid.columns * cold.value.grid.rows).toBe(8736);

    await runner.run({ project: ventilationEdit(0.01), windStudy: settings });
    const REPEATS = 20;
    const warm = await elapsedAsync(async () => {
      for (let pass = 0; pass < REPEATS; pass += 1) {
        await runner.run({ project: ventilationEdit(0.02 + pass * 0.01), windStudy: settings });
      }
    });

    // The negative claim, which the counter is the only honest proof of: across
    // 21 further studies the lattice was entered exactly zero more times.
    expect(lbmCalls.async).toBe(1);
    expect(lbmCalls.sync).toBe(0);

    // Threshold is 10x the 0.446 ms measured 2026-08-06, and comfortably inside
    // the single-digit millisecond budget the plan promised.
    expect(warm.ms / REPEATS).toBeLessThan(5);
    // Guard against a vacuous pass: the cold run really was the expensive one.
    expect(cold.ms).toBeGreaterThan(warm.ms / REPEATS);

    // And the warm answers are answers, not the cold one handed back: closing
    // the NW window has to move that room.
    const achOf = (result) => result.ventilation.rooms.find((room) => room.id === 'room_nw').airChangesPerHour;
    const closed = await runner.run({ project: ventilationEdit(0.02), windStudy: settings });
    expect(achOf(closed)).toBeLessThan(achOf(cold.value) / 5);
  }, 120_000);

  /**
   * Measured 2026-08-06, sixteen sectors at production resolution:
   *
   *     comfort, cold          4277.9 ms
   *     comfort, warm mean      150.3 ms   (6 repeats after one warm-up)
   *
   * 28x, and the 150 ms that remain are not the network: they are the comfort
   * classification over 8736 cells x 16 sectors plus the half-megabyte of
   * per-sector Cp the result carries. Worth naming, because it is the number
   * that would have to come down if a comfort study ever had to feel live.
   */
  it('re-mixes a sixteen-sector comfort study without re-solving one sector', async () => {
    const runner = createWindStudyRunner();
    const settings = { ...WIND_FIXTURE_PERFORMANCE_COMFORT_SETTINGS };

    const cold = await elapsedAsync(() => runner.run({ project: createWindApartmentProject(), windStudy: settings }));
    expect(lbmCalls.async).toBe(16);
    expect(cold.value.windRose).toHaveLength(16);

    await runner.run({ project: ventilationEdit(0.01), windStudy: settings });
    const REPEATS = 4;
    const warm = await elapsedAsync(async () => {
      for (let pass = 0; pass < REPEATS; pass += 1) {
        await runner.run({ project: ventilationEdit(0.02 + pass * 0.01), windStudy: settings });
      }
    });

    expect(lbmCalls.async).toBe(16);
    // Threshold is 10x the 150.3 ms measured 2026-08-06.
    expect(warm.ms / REPEATS).toBeLessThan(1500);
    expect(cold.ms).toBeGreaterThan((warm.ms / REPEATS) * 10);
  }, 180_000);
});

/**
 * What being interruptible costs.
 *
 * The worker solves through `solveD2Q9Async`, which hands the event loop a turn
 * every 50 iterations so a superseded run can be abandoned. If that turn were
 * expensive the cure would be worse than the disease, so it is measured rather
 * than assumed — and measured at the yield, not at the study, because a study
 * only yields nine times and would hide a hundredfold regression in its noise.
 *
 * Measured 2026-08-06, a 40 x 30 lattice run to a fixed 400 iterations:
 *
 *     synchronous                    40.9 ms
 *     chunked at 50 (7 yields)       38.7 ms
 *     chunked at 1 (399 yields)      42.5 ms   ->  3.9 us per yield
 *
 * At the production chunk size the overhead is not distinguishable from noise:
 * nine yields on a 350 ms study is about 35 microseconds, or 0.01 %. The
 * 399-yield case is the sensitive one and is what the threshold below guards —
 * a yield that regressed to a nesting-clamped `setTimeout(0)` would cost 4 ms
 * each and blow it out by more than an order of magnitude.
 */
describe('chunked solver overhead', () => {
  const columns = 40;
  const rows = 30;

  function fixedRun() {
    const obstacles = new Uint8Array(columns * rows);
    for (let row = 10; row < 20; row += 1) {
      for (let column = 15; column < 22; column += 1) obstacles[row * columns + column] = 1;
    }
    return {
      columns,
      rows,
      obstacles,
      iterations: 400,
      relaxationTime: 0.6,
      // Pin the iteration count: comparing two runs that stopped at different
      // places would measure the stopping rule, not the yielding.
      minIterations: 400,
      convergenceTolerance: 0,
    };
  }

  it('costs microseconds per yield, so the production chunk size is free', async () => {
    const PASSES = 3;
    let sync = 0;
    let chunked = 0;
    let perIteration = 0;

    // One untimed pass so the JIT has seen every path before anything counts.
    solveD2Q9(fixedRun());
    await solveD2Q9Async(fixedRun(), { chunkIterations: 1 });

    for (let pass = 0; pass < PASSES; pass += 1) {
      sync += elapsed(() => solveD2Q9(fixedRun())).ms;
      chunked += (await elapsedAsync(() => solveD2Q9Async(fixedRun(), { chunkIterations: 50 }))).ms;
      perIteration += (await elapsedAsync(() => solveD2Q9Async(fixedRun(), { chunkIterations: 1 }))).ms;
    }

    // At the production chunk size, within noise of the synchronous path.
    expect(chunked / PASSES).toBeLessThan((sync / PASSES) * 2);
    // 399 yields on a 40 ms solve. Measured at 1.04x; the threshold is 3x,
    // which a 4 ms-clamped timer (399 x 4 ms = 1.6 s) misses by a factor of 13.
    expect(perIteration / PASSES).toBeLessThan((sync / PASSES) * 3);
  }, 120_000);
});
