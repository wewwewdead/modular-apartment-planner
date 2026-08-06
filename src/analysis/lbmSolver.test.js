import { describe, expect, it } from 'vitest';
import { solveD2Q9 } from './lbmSolver';

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
