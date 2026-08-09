/**
 * Contours are display geometry, so the thing worth pinning is that they say
 * something true about the field underneath them: a line labelled "5 h" has to
 * run where the field really is five hours, close it where the field closes,
 * and stop where the study stopped assessing.
 *
 * The fields here are analytic — a ramp and a cone — so the answer is known
 * before the algorithm runs and the test is checking geometry rather than
 * echoing back whatever the implementation produced.
 */

import { describe, expect, it } from 'vitest';
import { contourLabelAnchor, contourPath, sunHoursContourLevels, sunHoursContours } from './sunHoursContours';

/** A grid in the shape `sunHoursGrid` returns, filled from a function of position. */
function fieldGrid({ columns, rows, cellSize = 1000, origin = { x: 0, y: 0 }, value, assessed = () => true }) {
  const hours = new Float32Array(columns * rows);
  const mask = new Uint8Array(columns * rows);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const x = origin.x + (column + 0.5) * cellSize;
      const y = origin.y + (row + 0.5) * cellSize;
      hours[index] = value(x, y);
      mask[index] = assessed(column, row) ? 1 : 0;
    }
  }

  let maxHours = 0;
  for (let index = 0; index < hours.length; index += 1) {
    if (mask[index] && hours[index] > maxHours) maxHours = hours[index];
  }

  return { hours, mask, columns, rows, cellSize, origin, maxHours, thresholdHours: 2 };
}

const everyPoint = (entry) => entry.lines.flatMap((line) => line.points);

describe('sunHoursContourLevels', () => {
  it('spaces levels so a map carries a handful of lines, not a hundred', () => {
    expect(sunHoursContourLevels(3)).toEqual([0.5, 1, 1.5, 2, 2.5]);
    expect(sunHoursContourLevels(6)).toEqual([1, 2, 3, 4, 5]);
    expect(sunHoursContourLevels(14)).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it('leaves the threshold to the line that is drawn heavier', () => {
    expect(sunHoursContourLevels(8, { threshold: 4 })).not.toContain(4);
  });

  it('drops a level that would sit on the maximum, where a contour is a dot', () => {
    expect(sunHoursContourLevels(5.05)).toEqual([1, 2, 3, 4]);
  });

  it('has nothing to contour in a field with no sun', () => {
    expect(sunHoursContourLevels(0)).toEqual([]);
  });
});

describe('sunHoursContours', () => {
  it('puts a level where the field actually reaches it', () => {
    // Hours climb by one per metre of x, so 4.5 h is at x = 5000 exactly:
    // halfway between the cell centres holding 4 h and 5 h.
    const grid = fieldGrid({
      columns: 11,
      rows: 5,
      value: (x) => (x - 500) / 1000,
    });

    const [entry] = sunHoursContours(grid, [4.5]);

    expect(entry.level).toBe(4.5);
    for (const point of everyPoint(entry)) expect(point.x).toBeCloseTo(5000, 6);
  });

  it('closes a ring around a peak, at the radius the field says', () => {
    // A cone falling 1 h per metre from the centre of the grid: the 5 h contour
    // is the circle of radius 5 m about that centre.
    const grid = fieldGrid({
      columns: 21,
      rows: 21,
      origin: { x: -10500, y: -10500 },
      value: (x, y) => Math.max(0, 10 - Math.hypot(x, y) / 1000),
    });

    const [entry] = sunHoursContours(grid, [5]);

    expect(entry.lines).toHaveLength(1);
    expect(entry.lines[0].closed).toBe(true);
    for (const point of everyPoint(entry)) {
      // Corner-cutting pulls the smoothed ring a little inside the sampled one;
      // half a cell is the honest allowance for a field sampled at 1 m.
      expect(Math.hypot(point.x, point.y)).toBeGreaterThan(4500);
      expect(Math.hypot(point.x, point.y)).toBeLessThan(5100);
    }
  });

  it('reports the ring long enough to hang a label on, first', () => {
    const grid = fieldGrid({
      columns: 31,
      rows: 21,
      origin: { x: -15500, y: -10500 },
      // Two peaks, the left one broad and the right one narrow, so the 5 h
      // level closes two rings of very different size.
      value: (x, y) => Math.max(0, 10 - Math.hypot(x + 8000, y) / 1000, 10 - Math.hypot(x - 8000, y) / 400),
    });

    const [entry] = sunHoursContours(grid, [5]);

    expect(entry.lines.length).toBeGreaterThan(1);
    expect(entry.lines[0].length).toBeGreaterThan(entry.lines[1].length);
  });

  it('never draws through ground the study did not assess', () => {
    const grid = fieldGrid({
      columns: 11,
      rows: 5,
      value: (x) => (x - 500) / 1000,
      assessed: (column) => column < 6,
    });

    // 4.5 h falls between two assessed cells and still contours.
    expect(sunHoursContours(grid, [4.5])).toHaveLength(1);
    // 6.5 h falls out in the unassessed strip, and is not guessed at.
    expect(sunHoursContours(grid, [6.5])).toEqual([]);
  });

  it('produces finite geometry from a field that is flat on the level itself', () => {
    // Every cell sits exactly on the contoured value — the degenerate case that
    // makes naive interpolation divide by zero.
    const grid = fieldGrid({ columns: 8, rows: 8, value: () => 3 });

    for (const point of sunHoursContours(grid, [3]).flatMap(everyPoint)) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('has nothing to say about a field that never reaches the level', () => {
    const grid = fieldGrid({ columns: 8, rows: 8, value: () => 1 });

    expect(sunHoursContours(grid, [4])).toEqual([]);
  });
});

describe('contourLabelAnchor', () => {
  it('sits halfway along the line and lies along it', () => {
    const anchor = contourLabelAnchor({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      closed: false,
    });

    expect(anchor.x).toBeCloseTo(100);
    expect(anchor.y).toBeCloseTo(0);
  });

  it('folds the angle so a label never reads upside down', () => {
    for (const direction of [
      [-100, 0],
      [-100, -100],
      [0, -100],
      [100, 100],
    ]) {
      const anchor = contourLabelAnchor({
        points: [
          { x: 0, y: 0 },
          { x: direction[0], y: direction[1] },
        ],
        closed: false,
      });
      expect(Math.abs(anchor.angle)).toBeLessThanOrEqual(90);
    }
  });
});

describe('contourPath', () => {
  it('closes a ring and leaves an open line open', () => {
    const ring = contourPath([
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        closed: true,
      },
    ]);
    const open = contourPath([
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        closed: false,
      },
    ]);

    expect(ring).toBe('M 0 0 L 10 0 L 10 10 Z');
    expect(open).toBe('M 0 0 L 10 0');
  });
});
