/**
 * D2Q9 lattice-Boltzmann flow solver for the pedestrian-height wind slice.
 *
 * BGK collision, half-way bounce-back on rasterized buildings, a Zou/He
 * velocity inlet, zero-gradient outlet and periodic cross-flow boundaries.
 * Lattice velocity stays below Mach 0.1; physical wind speed is applied after
 * solving because the output planners need is the dimensionless amplification
 * factor U_local / U_reference.
 */

/**
 * The lattice, indexed exactly as the four tables below are ordered.
 *
 * +x is downstream — the Zou/He inlet is column 0 and the zero-gradient outlet
 * is the last column. +y is increasing row, which is screen-DOWN in this app's
 * coordinate convention, so direction 2 travels south and direction 4 north.
 * Weights in parentheses. Half-way bounce-back reflects through the opposite
 * pairs 1<->3, 2<->4, 5<->7 and 6<->8, which is what OPPOSITE tabulates.
 *
 *          7 (1/36)     4 (1/9)     8 (1/36)
 *                  \       |       /
 *                   \      |      /           row - 1   (-y, north)
 *                    \     |     /
 *     3 (1/9) ------- 0 (4/9) ------- 1 (1/9) row       ( 0)
 *                    /     |     \
 *                   /      |      \           row + 1   (+y, south)
 *                  /       |       \
 *          6 (1/36)     2 (1/9)     5 (1/36)
 *
 *               col - 1     col      col + 1
 *                 (-x)      ( 0)      (+x)
 *
 * The weights sum to 1: 4/9 + 4*(1/9) + 4*(1/36).
 */
const CX = Int8Array.from([0, 1, 0, -1, 0, 1, -1, -1, 1]);
const CY = Int8Array.from([0, 0, 1, 0, -1, 1, 1, -1, -1]);
const OPPOSITE = Uint8Array.from([0, 3, 4, 1, 2, 7, 8, 5, 6]);
const WEIGHTS = Float64Array.from([4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36]);

const DEFAULT_LATTICE_SPEED = 0.06;

/**
 * Fluid columns used as the far-field static-pressure reference, counted from
 * the inlet. Column 0 is skipped: the Zou/He boundary writes three populations
 * there directly, so its density is a boundary artefact rather than a solved
 * value.
 */
const REFERENCE_BAND_COLUMNS = 2;

function equilibrium(direction, density, ux, uy) {
  const projection = CX[direction] * ux + CY[direction] * uy;
  const speedSquared = ux * ux + uy * uy;
  return WEIGHTS[direction] * density * (1 + 3 * projection + 4.5 * projection * projection - 1.5 * speedSquared);
}

function createPopulations(cellCount, obstacles, inletSpeed) {
  const populations = Array.from({ length: 9 }, () => new Float32Array(cellCount));
  for (let index = 0; index < cellCount; index += 1) {
    const ux = obstacles[index] ? 0 : inletSpeed;
    for (let direction = 0; direction < 9; direction += 1) {
      populations[direction][index] = equilibrium(direction, 1, ux, 0);
    }
  }
  return populations;
}

/**
 * Density and velocity of one cell, plus whether the raw density was usable.
 *
 * `diverged` exists because the two callers want opposite things from a cell
 * that has blown up. The reporting paths — `referenceDensity` and the output
 * field — need a finite number to keep one bad cell from poisoning a mean or an
 * array, so the still-air substitution below stands in. The collision loop needs
 * the OPPOSITE: it is the instability guard, and it has to see that the
 * substitution happened. Testing the substituted values instead, which is what
 * the guard used to do, can never fire — sanitised velocities are 0 and 0 is
 * finite and slow — so the density half of the guard was unreachable.
 *
 * Exported as a test seam. The branch is defensive: every instability reachable
 * through `solveD2Q9`'s own arguments trips the |u| > 0.35 test first, at some
 * cell, several iterations before any density overflows, so the ordering can
 * only be pinned at this level.
 */
export function macroscopic(populations, index) {
  const density =
    populations[0][index] +
    populations[1][index] +
    populations[2][index] +
    populations[3][index] +
    populations[4][index] +
    populations[5][index] +
    populations[6][index] +
    populations[7][index] +
    populations[8][index];
  if (!(density > 1e-8) || !Number.isFinite(density)) return { density: 1, ux: 0, uy: 0, diverged: true };
  return {
    diverged: false,
    density,
    ux:
      (populations[1][index] +
        populations[5][index] +
        populations[8][index] -
        populations[3][index] -
        populations[6][index] -
        populations[7][index]) /
      density,
    uy:
      (populations[2][index] +
        populations[5][index] +
        populations[6][index] -
        populations[4][index] -
        populations[7][index] -
        populations[8][index]) /
      density,
  };
}

function applyZouHeInlet(populations, columns, rows, obstacles, inletSpeed) {
  for (let row = 0; row < rows; row += 1) {
    const index = row * columns;
    if (obstacles[index]) continue;
    const f0 = populations[0][index];
    const f2 = populations[2][index];
    const f3 = populations[3][index];
    const f4 = populations[4][index];
    const f6 = populations[6][index];
    const f7 = populations[7][index];
    const density = (f0 + f2 + f4 + 2 * (f3 + f6 + f7)) / (1 - inletSpeed);
    populations[1][index] = f3 + (2 / 3) * density * inletSpeed;
    populations[5][index] = f7 + 0.5 * (f4 - f2) + (1 / 6) * density * inletSpeed;
    populations[8][index] = f6 + 0.5 * (f2 - f4) + (1 / 6) * density * inletSpeed;
  }
}

function applyOutlet(populations, columns, rows, obstacles) {
  const outletColumn = columns - 1;
  for (let row = 0; row < rows; row += 1) {
    const index = row * columns + outletColumn;
    const source = index - 1;
    if (obstacles[index]) continue;
    for (let direction = 0; direction < 9; direction += 1) {
      populations[direction][index] = populations[direction][source];
    }
  }
}

/**
 * Static pressure of the undisturbed approach flow, in lattice density units.
 *
 * These boundary conditions do not conserve mass: the Zou/He inlet injects
 * whatever mass its own solved density calls for and the zero-gradient outlet
 * copies its neighbour, so the settled far-field density drifts away from the
 * initial lattice value of 1 and keeps drifting while the run develops. Reading
 * Cp against the constant 1 therefore put a large, run-dependent offset on the
 * whole field: on the committed wind fixture it is 1.32 at iteration 220 and
 * has grown to 3.62 by the time the run converges.
 *
 * The inlet-adjacent band is the reference because it is the one place in the
 * domain where the reference condition of a pressure coefficient — flow at the
 * undisturbed reference velocity U_ref — is imposed by construction rather than
 * hoped for: the Zou/He inlet pins u = inletSpeed across the whole inlet plane.
 * Its disturbance from the building decays like exp(-2*pi*x/W) across the
 * periodic cross-flow width W, so a domain padded by more than about W/2
 * upstream reads a genuinely undisturbed static pressure there. The downstream
 * half cannot be used instead: a bluff body leaves a real drag-induced pressure
 * deficit behind it that must NOT average to zero.
 *
 * If the band is entirely solid (a building rasterized onto the inlet) the mean
 * over every fluid cell is used, which at least removes the global drift, and a
 * fully solid domain falls back to the lattice value.
 */
function referenceDensity(populations, columns, rows, obstacles) {
  const lastBandColumn = Math.min(REFERENCE_BAND_COLUMNS, columns - 2);
  let total = 0;
  let count = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 1; column <= lastBandColumn; column += 1) {
      const index = row * columns + column;
      if (obstacles[index]) continue;
      total += macroscopic(populations, index).density;
      count += 1;
    }
  }
  if (count > 0) return total / count;
  for (let index = 0; index < obstacles.length; index += 1) {
    if (obstacles[index]) continue;
    total += macroscopic(populations, index).density;
    count += 1;
  }
  return count > 0 ? total / count : 1;
}

function fieldAndResidual(populations, columns, rows, obstacles, inletSpeed, previousSpeed = null) {
  const cellCount = obstacles.length;
  const amplification = new Float32Array(cellCount);
  const velocityX = new Float32Array(cellCount);
  const velocityY = new Float32Array(cellCount);
  const density = new Float32Array(cellCount);
  const pressureCoefficient = new Float32Array(cellCount);
  const reference = referenceDensity(populations, columns, rows, obstacles);
  let delta = 0;
  let magnitude = 0;
  for (let index = 0; index < cellCount; index += 1) {
    if (obstacles[index]) continue;
    const macro = macroscopic(populations, index);
    const { ux, uy } = macro;
    const speed = Math.hypot(ux, uy);
    density[index] = macro.density;
    // For D2Q9, p = rho * c_s^2 and c_s^2 = 1/3. The gauge pressure is measured
    // against the far-field reference above, not against the lattice value 1,
    // and normalised by 0.5 * rho_ref * U_ref^2 to give this Cp expression.
    pressureCoefficient[index] = (2 * (macro.density - reference)) / (3 * inletSpeed * inletSpeed);
    velocityX[index] = ux / inletSpeed;
    velocityY[index] = uy / inletSpeed;
    amplification[index] = speed / inletSpeed;
    if (previousSpeed) delta += Math.abs(speed - previousSpeed[index]);
    magnitude += speed;
  }
  return {
    amplification,
    velocityX,
    velocityY,
    density,
    pressureCoefficient,
    referenceDensity: reference,
    residual: previousSpeed ? delta / Math.max(magnitude, 1e-9) : Infinity,
  };
}

/**
 * How a solve that was abandoned reports itself.
 *
 * Not an error the user should ever see: it means a NEWER request arrived while
 * this one was mid-flight, which is a scheduling outcome rather than a failure
 * of the model. It travels as a throw because that is the only thing that
 * unwinds a nested sector loop cleanly, and it is recognised by `name` rather
 * than by `instanceof` so a copy of the class that crossed a module boundary
 * still reads as one.
 */
export class StudyAbortedError extends Error {
  constructor(message = 'Wind solve abandoned.') {
    super(message);
    this.name = 'StudyAborted';
  }
}

export function isStudyAborted(error) {
  return error?.name === 'StudyAborted';
}

/** Iterations run between yields on the async path. */
const DEFAULT_CHUNK_ITERATIONS = 50;

/**
 * Everything one solve carries between iterations.
 *
 * Extracted from the loop so the same iteration can be driven two ways: to
 * completion in one synchronous call, which is what every physics test and
 * every direct caller wants, or in awaited chunks, which is what lets a worker
 * notice that the building has moved on. There is exactly one copy of the
 * physics; the two entry points differ only in who calls `advanceSolve` and how
 * often.
 */
function createSolveState({
  columns,
  rows,
  obstacles,
  iterations = 450,
  relaxationTime = 0.58,
  inletSpeed = DEFAULT_LATTICE_SPEED,
  convergenceTolerance = 2e-4,
  minIterations = 150,
  onProgress = null,
}) {
  if (columns < 3 || rows < 3 || obstacles?.length !== columns * rows) {
    throw new Error('Wind solver needs a valid obstacle grid at least 3 × 3 cells.');
  }
  const cellCount = columns * rows;
  return {
    columns,
    rows,
    obstacles,
    iterations,
    inletSpeed,
    convergenceTolerance,
    minIterations,
    onProgress,
    omega: 1 / Math.max(0.501, relaxationTime),
    cellCount,
    current: createPopulations(cellCount, obstacles, inletSpeed),
    next: Array.from({ length: 9 }, () => new Float32Array(cellCount)),
    collided: Array.from({ length: 9 }, () => new Float32Array(cellCount)),
    previousSpeed: null,
    residual: Infinity,
    completedIterations: 0,
    // A zero-iteration budget is already finished, which is what the loop this
    // replaced did by never entering its body.
    done: !(iterations > 0),
  };
}

/** One collide-stream-boundary pass, plus the periodic residual probe. */
function stepSolve(state) {
  const { columns, rows, obstacles, cellCount, omega, inletSpeed, collided, current, next } = state;

  // Collision.
  for (let index = 0; index < cellCount; index += 1) {
    if (obstacles[index]) continue;
    // `diverged` is the raw-density verdict and has to be read here, before
    // the sanitised velocities are looked at: a cell whose density is NaN,
    // infinite or non-positive reports still air, which passes every test
    // below and would let a dead lattice run to completion and report itself
    // as a calm one.
    const { density, ux, uy, diverged } = macroscopic(current, index);
    if (diverged || !Number.isFinite(ux) || !Number.isFinite(uy) || Math.hypot(ux, uy) > 0.35) {
      throw new Error('Wind solver became unstable. Increase relaxation time or domain resolution.');
    }
    for (let direction = 0; direction < 9; direction += 1) {
      const value = current[direction][index];
      collided[direction][index] = value - omega * (value - equilibrium(direction, density, ux, uy));
    }
  }

  // Pull streaming. Cross-flow edges wrap; inlet/outlet populations are
  // completed by their explicit boundary conditions below.
  for (let direction = 0; direction < 9; direction += 1) {
    const cx = CX[direction];
    const cy = CY[direction];
    const sourceField = collided[direction];
    const bouncedField = collided[OPPOSITE[direction]];
    const targetField = next[direction];
    for (let row = 0; row < rows; row += 1) {
      const sourceRow = (row - cy + rows) % rows;
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        if (obstacles[index]) continue;
        const sourceColumn = column - cx;
        if (sourceColumn < 0 || sourceColumn >= columns) continue;
        const sourceIndex = sourceRow * columns + sourceColumn;
        targetField[index] = obstacles[sourceIndex] ? bouncedField[index] : sourceField[sourceIndex];
      }
    }
  }

  applyZouHeInlet(next, columns, rows, obstacles, inletSpeed);
  applyOutlet(next, columns, rows, obstacles);
  state.current = next;
  state.next = current;
  state.completedIterations += 1;

  if (state.completedIterations % 50 === 0 || state.completedIterations === state.iterations) {
    const field = fieldAndResidual(state.current, columns, rows, obstacles, inletSpeed, state.previousSpeed);
    state.residual = field.residual;
    state.previousSpeed = Float32Array.from(field.amplification, (value) => value * inletSpeed);
    state.onProgress?.({
      iteration: state.completedIterations,
      iterations: state.iterations,
      residual: state.residual,
    });
    if (state.completedIterations >= state.minIterations && state.residual < state.convergenceTolerance) {
      state.done = true;
      return;
    }
  }
  if (state.completedIterations >= state.iterations) state.done = true;
}

/** Run at most `budget` iterations. Returns true once the solve has finished. */
function advanceSolve(state, budget) {
  let spent = 0;
  while (!state.done && spent < budget) {
    stepSolve(state);
    spent += 1;
  }
  return state.done;
}

function finishSolve(state) {
  const field = fieldAndResidual(state.current, state.columns, state.rows, state.obstacles, state.inletSpeed);
  return { ...field, residual: state.residual, iterations: state.completedIterations, inletSpeed: state.inletSpeed };
}

/**
 * Hand the event loop a turn.
 *
 * A microtask will not do. The whole point of yielding is to let a `message`
 * event that is already sitting in the worker's queue be delivered, and message
 * delivery is a TASK — a promise continuation runs before it, not after. A
 * `MessageChannel` post is the cheapest task available and, being on the same
 * task source as the incoming request, cannot jump ahead of one that arrived
 * first. `setTimeout` is the fallback, and is measurably worse: chained timers
 * hit the 4 ms nesting clamp, which on a sixteen-sector study is most of a
 * second of pure waiting.
 */
function createYieldControl() {
  // Node, which is where the chunked path is measured and tested. `setImmediate`
  // is a task, is not clamped, and does not hold the event loop open the way a
  // started `MessagePort` does — a vitest run that never exits is a worse
  // failure than a slightly different yield primitive. Reached off `globalThis`
  // because it is not a browser global and the lint config only knows browser
  // ones; the module has to load in both.
  const immediate = globalThis.setImmediate;
  if (typeof immediate === 'function') {
    return () => new Promise((resolve) => immediate(resolve));
  }
  if (typeof MessageChannel === 'function') {
    const channel = new MessageChannel();
    return () =>
      new Promise((resolve) => {
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(0);
      });
  }
  return () => new Promise((resolve) => setTimeout(resolve, 0));
}

let sharedYieldControl = null;
function defaultYieldControl() {
  if (!sharedYieldControl) sharedYieldControl = createYieldControl();
  return sharedYieldControl();
}

/**
 * Solve to completion without ever giving up the thread.
 *
 * The API and the numbers it returns are exactly what they were before the
 * chunked path existed, which is the point: every physics test, every
 * validation suite and both other studies call this and must not have to know
 * that a second entry point exists.
 */
export function solveD2Q9(options) {
  const state = createSolveState(options);
  advanceSolve(state, Infinity);
  return finishSolve(state);
}

/**
 * The same solve, in chunks, abandonable between them.
 *
 * Used only by the wind worker. `shouldAbort` is consulted at every chunk
 * boundary and before the first one; when it answers true the solve throws
 * `StudyAbortedError` rather than returning a half-built field, so a caller
 * cannot accidentally treat an abandoned run as an answer.
 *
 * Cancellation had to work this way. A token in a shared message cannot reach a
 * worker whose thread is inside a 450-iteration loop — the message sits in the
 * queue until the loop ends — and a `SharedArrayBuffer` flag needs COOP/COEP
 * headers this app does not send. Yielding is the only mechanism that gets the
 * queue drained at all.
 *
 * @param {object} options  As `solveD2Q9`.
 * @param {object} [control]
 * @param {number} [control.chunkIterations]  Iterations per uninterrupted burst.
 * @param {() => boolean} [control.shouldAbort]
 * @param {() => Promise<void>} [control.yieldControl]  Injectable, for measurement.
 */
export async function solveD2Q9Async(options, control = {}) {
  const {
    chunkIterations = DEFAULT_CHUNK_ITERATIONS,
    shouldAbort = null,
    yieldControl = defaultYieldControl,
  } = control;
  const state = createSolveState(options);
  const budget = Math.max(1, Math.floor(chunkIterations));

  while (!state.done) {
    if (shouldAbort?.()) throw new StudyAbortedError();
    advanceSolve(state, budget);
    if (!state.done) await yieldControl();
  }
  if (shouldAbort?.()) throw new StudyAbortedError();
  return finishSolve(state);
}

export const LBM_CONSTANTS = {
  CX,
  CY,
  OPPOSITE,
  WEIGHTS,
  DEFAULT_LATTICE_SPEED,
  REFERENCE_BAND_COLUMNS,
  DEFAULT_CHUNK_ITERATIONS,
};
