/**
 * D2Q9 lattice-Boltzmann flow solver for the pedestrian-height wind slice.
 *
 * BGK collision, half-way bounce-back on rasterized buildings, a Zou/He
 * velocity inlet, zero-gradient outlet and periodic cross-flow boundaries.
 * Lattice velocity stays below Mach 0.1; physical wind speed is applied after
 * solving because the output planners need is the dimensionless amplification
 * factor U_local / U_reference.
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

function macroscopic(populations, index) {
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
  if (!(density > 1e-8) || !Number.isFinite(density)) return { density: 1, ux: 0, uy: 0 };
  return {
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

export function solveD2Q9({
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
  const omega = 1 / Math.max(0.501, relaxationTime);
  const cellCount = columns * rows;
  let current = createPopulations(cellCount, obstacles, inletSpeed);
  let next = Array.from({ length: 9 }, () => new Float32Array(cellCount));
  const collided = Array.from({ length: 9 }, () => new Float32Array(cellCount));
  let previousSpeed = null;
  let residual = Infinity;
  let completedIterations = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    // Collision.
    for (let index = 0; index < cellCount; index += 1) {
      if (obstacles[index]) continue;
      const { density, ux, uy } = macroscopic(current, index);
      if (!Number.isFinite(ux) || !Number.isFinite(uy) || Math.hypot(ux, uy) > 0.35) {
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
    [current, next] = [next, current];
    completedIterations = iteration + 1;

    if (completedIterations % 50 === 0 || completedIterations === iterations) {
      const field = fieldAndResidual(current, columns, rows, obstacles, inletSpeed, previousSpeed);
      residual = field.residual;
      previousSpeed = Float32Array.from(field.amplification, (value) => value * inletSpeed);
      onProgress?.({ iteration: completedIterations, iterations, residual });
      if (completedIterations >= minIterations && residual < convergenceTolerance) break;
    }
  }

  const field = fieldAndResidual(current, columns, rows, obstacles, inletSpeed);
  return { ...field, residual, iterations: completedIterations, inletSpeed };
}

export const LBM_CONSTANTS = { CX, CY, OPPOSITE, WEIGHTS, DEFAULT_LATTICE_SPEED, REFERENCE_BAND_COLUMNS };
