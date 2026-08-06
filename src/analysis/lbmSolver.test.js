import { beforeAll, describe, expect, it } from 'vitest';
import { LBM_CONSTANTS, macroscopic, solveD2Q9 } from './lbmSolver';

function obstacleGrid(columns, rows, predicate = () => false) {
  const obstacles = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (predicate(column, row)) obstacles[row * columns + column] = 1;
    }
  }
  return obstacles;
}

describe('D2Q9 wind solver', () => {
  it('keeps an unobstructed domain at uniform reference speed', () => {
    const columns = 48;
    const rows = 24;
    const result = solveD2Q9({
      columns,
      rows,
      obstacles: obstacleGrid(columns, rows),
      iterations: 200,
    });
    const middle = result.amplification[12 * columns + 24];
    expect(middle).toBeCloseTo(1, 2);
    expect(result.pressureCoefficient[12 * columns + 24]).not.toBeNaN();
    expect(result.pressureCoefficient).toHaveLength(columns * rows);
    expect(result.residual).toBeLessThan(1e-3);
  });

  it('creates a wake and accelerated flow around a solid block', () => {
    const columns = 72;
    const rows = 36;
    const obstacles = obstacleGrid(
      columns,
      rows,
      (column, row) => column >= 28 && column <= 34 && row >= 13 && row <= 22,
    );
    const result = solveD2Q9({ columns, rows, obstacles, iterations: 500, relaxationTime: 0.62 });

    expect(result.amplification[18 * columns + 31]).toBe(0);
    const wake = result.amplification[18 * columns + 40];
    expect(wake).toBeLessThan(0.9);
    expect(Math.max(...result.amplification)).toBeGreaterThan(1.05);
    const fluidPressure = Array.from(result.pressureCoefficient).filter((_, index) => !obstacles[index]);
    expect(fluidPressure.every(Number.isFinite)).toBe(true);
    expect(Math.max(...fluidPressure) - Math.min(...fluidPressure)).toBeGreaterThan(0.01);
  });
});

/* -------------------------------------------------------------------------- */
/* Lattice tables                                                             */
/* -------------------------------------------------------------------------- */

describe('D2Q9 lattice tables', () => {
  const { CX, CY, OPPOSITE, WEIGHTS } = LBM_CONSTANTS;

  it('matches the diagram at the top of the module, direction for direction', () => {
    expect(Array.from(CX)).toEqual([0, 1, 0, -1, 0, 1, -1, -1, 1]);
    expect(Array.from(CY)).toEqual([0, 0, 1, 0, -1, 1, 1, -1, -1]);
    expect(Array.from(WEIGHTS)).toEqual([4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36]);
  });

  it('pairs every direction with its exact reverse', () => {
    for (let direction = 0; direction < 9; direction += 1) {
      const opposite = OPPOSITE[direction];
      // `===` rather than `toBe`, which distinguishes 0 from -0 for the rest
      // direction; the lattice does not.
      expect(CX[opposite] === -CX[direction], `CX[${direction}]`).toBe(true);
      expect(CY[opposite] === -CY[direction], `CY[${direction}]`).toBe(true);
      expect(OPPOSITE[opposite], `OPPOSITE is an involution at ${direction}`).toBe(direction);
      expect(WEIGHTS[opposite], `WEIGHTS[${direction}]`).toBe(WEIGHTS[direction]);
    }
  });

  it('carries a normalised, isotropic weight set', () => {
    expect(Array.from(WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 15);
    // Second moment of the weights is c_s^2 = 1/3 on each axis, which is the
    // constant the Cp expression in `fieldAndResidual` divides by.
    const secondMoment = Array.from(WEIGHTS).reduce((sum, weight, index) => sum + weight * CX[index] * CX[index], 0);
    expect(secondMoment).toBeCloseTo(1 / 3, 15);
  });
});

/* -------------------------------------------------------------------------- */
/* Instability guard                                                          */
/* -------------------------------------------------------------------------- */

/** Nine populations for a single cell, given as plain numbers. */
function oneCell(values) {
  return values.map((value) => Float64Array.of(value));
}

describe('D2Q9 instability guard', () => {
  it('reads a healthy cell without flagging it', () => {
    const populations = oneCell([0.4, 0.1, 0.05, 0.08, 0.05, 0.02, 0.01, 0.01, 0.02]);
    const macro = macroscopic(populations, 0);
    expect(macro.diverged).toBe(false);
    expect(macro.density).toBeCloseTo(0.74, 12);
    expect(macro.ux).toBeCloseTo((0.1 + 0.02 + 0.02 - 0.08 - 0.01 - 0.01) / 0.74, 12);
  });

  /**
   * The bug this pins: the still-air substitution is applied FIRST, so reading
   * the substituted velocities can never detect the cell it was applied to.
   * `diverged` is the only thing that survives the substitution, and each case
   * below returns ux = uy = 0 — values that pass the collision loop's finiteness
   * and speed tests unchanged.
   */
  for (const [label, total] of [
    ['NaN', Number.NaN],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['zero', 0],
    ['negative', -0.5],
    ['below the 1e-8 floor', 1e-9],
  ]) {
    it(`flags a ${label} raw density while still reporting still air to the field`, () => {
      const populations = oneCell([total, 0, 0, 0, 0, 0, 0, 0, 0]);
      const macro = macroscopic(populations, 0);
      expect(macro.diverged).toBe(true);
      // The substitution itself is deliberate and stays: the reporting paths
      // need a finite number so one dead cell cannot poison a whole field.
      expect(macro.density).toBe(1);
      expect(macro.ux).toBe(0);
      expect(macro.uy).toBe(0);
    });
  }

  it('throws rather than returning a field when the lattice goes unstable', () => {
    // tau at the 0.5 stability limit with a strong inlet. This diverges within a
    // couple of iterations, and the guard has to stop it: the alternative is a
    // plausible-looking amplification map computed from a dead lattice.
    const columns = 60;
    const rows = 40;
    const obstacles = obstacleGrid(columns, rows, (column, row) => column === 25 && row >= 10 && row < 30);
    expect(() =>
      solveD2Q9({
        columns,
        rows,
        obstacles,
        iterations: 400,
        relaxationTime: 0.5,
        inletSpeed: 0.34,
        minIterations: 400,
        convergenceTolerance: 0,
      }),
    ).toThrow(/unstable/);
    expect(() =>
      solveD2Q9({
        columns,
        rows,
        obstacles,
        iterations: 400,
        relaxationTime: 0.5,
        inletSpeed: 0.34,
        minIterations: 400,
        convergenceTolerance: 0,
      }),
    ).toThrow('Wind solver became unstable. Increase relaxation time or domain resolution.');
  });

  it('leaves a stable run of the same geometry alone', () => {
    // Guards the test above against passing for the wrong reason: the geometry
    // is fine, it is the relaxation time and inlet speed that are not.
    const columns = 60;
    const rows = 40;
    const obstacles = obstacleGrid(columns, rows, (column, row) => column === 25 && row >= 10 && row < 30);
    const result = solveD2Q9({ columns, rows, obstacles, iterations: 200, relaxationTime: 0.6, inletSpeed: 0.06 });
    expect(Array.from(result.amplification).every(Number.isFinite)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Absolute Cp magnitude                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Blunt-body reference case. Everything the wind stack shipped before this
 * checked Cp DIFFERENCES, which are blind to the reference pressure the whole
 * field is measured against; these two tests check the absolute scale, which
 * has exactly two anchors an incompressible flow must hit:
 *
 *   Cp = +1 at the windward stagnation point (all the dynamic head recovered)
 *   Cp =  0 in the undisturbed approach flow
 *
 * Domain: a 10 x 8 cell rectangular block in a 94 x 80 channel — 10 % blockage
 * across the periodic cross-flow, 44 cells of upstream fetch (more than half
 * the channel width, so the body's exp(-2*pi*x/W) upstream influence is down to
 * ~3 % at the reference band) and 40 cells of wake before the outlet.
 *
 * tau = 0.6 and U = 0.12 put the lattice Reynolds number near 11. That is
 * laminar, and the residual viscous over-pressure at the stagnation point is
 * why the measured value settles at ~1.11 rather than 1.000; running hotter
 * pushes it towards 1 but the wake starts shedding and a snapshot stops being a
 * mean. 8000 iterations reaches residual ~4e-5, and the answer is stable to
 * +/-0.006 over the last 2000 of them.
 */
const STAGNATION_CASE = {
  columns: 94,
  rows: 80,
  firstColumn: 44,
  lastColumn: 53,
  firstRow: 36,
  lastRow: 43,
  inletSpeed: 0.12,
  relaxationTime: 0.6,
  iterations: 8000,
};

let stagnationRun = null;
function solveStagnationCase() {
  const { columns, rows, firstColumn, lastColumn, firstRow, lastRow } = STAGNATION_CASE;
  const obstacles = obstacleGrid(
    columns,
    rows,
    (column, row) => column >= firstColumn && column <= lastColumn && row >= firstRow && row <= lastRow,
  );
  const result = solveD2Q9({
    columns,
    rows,
    obstacles,
    iterations: STAGNATION_CASE.iterations,
    relaxationTime: STAGNATION_CASE.relaxationTime,
    inletSpeed: STAGNATION_CASE.inletSpeed,
    // Pin the iteration count: the assertions below are physics, and physics
    // read off a run that stopped at an arbitrary residual is not comparable.
    minIterations: STAGNATION_CASE.iterations,
    convergenceTolerance: 0,
  });
  return { ...result, obstacles };
}

/** Mean Cp over the two cells straddling mid-span, one column off the face. */
function stagnationCp(run) {
  const { columns, firstColumn, firstRow, lastRow } = STAGNATION_CASE;
  const midSpan = [Math.floor((firstRow + lastRow) / 2), Math.ceil((firstRow + lastRow) / 2)];
  return (
    midSpan.reduce((sum, row) => sum + run.pressureCoefficient[row * columns + firstColumn - 1], 0) / midSpan.length
  );
}

describe('D2Q9 absolute pressure coefficient', () => {
  // One 8000-iteration solve shared by the whole block; it takes about 6 s.
  beforeAll(() => {
    stagnationRun = solveStagnationCase();
  }, 120000);

  it('recovers Cp = 1 at the windward stagnation point of a blunt block', () => {
    const run = stagnationRun;
    // Half-way bounce-back puts the wall midway between the last solid cell and
    // this one, so the cell one column upstream of the face at mid-span is the
    // closest the lattice gets to the stagnation point.
    expect(run.residual).toBeLessThan(1e-3);
    expect(stagnationCp(run)).toBeGreaterThan(0.85);
    expect(stagnationCp(run)).toBeLessThan(1.15);
  });

  it('holds the undisturbed approach flow at Cp = 0', () => {
    const { columns, rows, firstColumn, firstRow, lastRow } = STAGNATION_CASE;
    const run = stagnationRun;
    // Upstream only. A bluff body leaves a real drag-induced pressure deficit
    // downstream of itself, so a domain-wide mean is not required to vanish and
    // asserting that it does would be asserting the wrong physics. The band
    // stops two body heights short of the block and starts clear of the
    // reference band itself, so it is not measuring its own definition.
    const height = lastRow - firstRow + 1;
    const start = 4 + LBM_CONSTANTS.REFERENCE_BAND_COLUMNS;
    const end = firstColumn - 2 * height;
    let total = 0;
    let count = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = start; column < end; column += 1) {
        const index = row * columns + column;
        if (run.obstacles[index]) continue;
        total += run.pressureCoefficient[index];
        count += 1;
      }
    }

    expect(count).toBeGreaterThan(500);
    expect(Math.abs(total / count)).toBeLessThan(0.05);
  });

  it('proves the far-field re-referencing is load-bearing, not a no-op', () => {
    const { inletSpeed } = STAGNATION_CASE;
    const run = stagnationRun;
    // These boundary conditions do not conserve mass, so the settled far-field
    // density is NOT the lattice initial value of 1. Reading Cp against 1 — what
    // the solver did before this test existed — offsets the whole field by this
    // much, which is far larger than either tolerance above.
    const offset = (2 * (run.referenceDensity - 1)) / (3 * inletSpeed * inletSpeed);
    expect(Math.abs(run.referenceDensity - 1)).toBeGreaterThan(1e-3);
    expect(Math.abs(offset)).toBeGreaterThan(0.25);
    expect(Math.abs(stagnationCp(run) + offset - 1)).toBeGreaterThan(0.15);
  });

  it('leaves an unobstructed domain at Cp = 0 everywhere', () => {
    const columns = 48;
    const rows = 24;
    const result = solveD2Q9({ columns, rows, obstacles: obstacleGrid(columns, rows), iterations: 400 });
    const extreme = Array.from(result.pressureCoefficient).reduce(
      (worst, value) => Math.max(worst, Math.abs(value)),
      0,
    );
    expect(extreme).toBeLessThan(0.05);
  });
});
