import { describe, it, expect } from 'vitest';
import { dropTrailingRepeatedPoints, snapToGrid, resolvePoint } from './handlerSnapUtils';
import { GRID_MINOR } from '@/domain/defaults';

describe('snapToGrid', () => {
  it('leaves exact grid multiples unchanged', () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(GRID_MINOR)).toBe(GRID_MINOR);
    expect(snapToGrid(GRID_MINOR * 4)).toBe(GRID_MINOR * 4);
  });

  it('rounds to the nearest grid line', () => {
    // GRID_MINOR = 50: 24 rounds down to 0, 26 rounds up to 50
    expect(snapToGrid(GRID_MINOR / 2 - 1)).toBe(0);
    expect(snapToGrid(GRID_MINOR / 2 + 1)).toBe(GRID_MINOR);
  });

  it('rounds half values up (Math.round behavior)', () => {
    expect(snapToGrid(GRID_MINOR / 2)).toBe(GRID_MINOR);
  });

  it('snaps negative values symmetrically', () => {
    expect(snapToGrid(-GRID_MINOR * 2)).toBe(-GRID_MINOR * 2);
    expect(snapToGrid(-(GRID_MINOR / 2 + 1))).toBe(-GRID_MINOR);
  });
});

describe('resolvePoint', () => {
  it('returns the raw coordinates when snapping is disabled', () => {
    const result = resolvePoint({ x: 123.4, y: -56.7 }, false);
    expect(result).toEqual({ x: 123.4, y: -56.7 });
  });

  it('snaps both axes when snapping is enabled', () => {
    const result = resolvePoint({ x: GRID_MINOR + 1, y: GRID_MINOR * 3 - 1 }, true);
    expect(result).toEqual({ x: GRID_MINOR, y: GRID_MINOR * 3 });
  });

  it('returns a new object rather than mutating the input', () => {
    const input = { x: 10, y: 20 };
    const result = resolvePoint(input, false);
    expect(result).not.toBe(input);
    expect(result).toEqual({ x: 10, y: 20 });
  });
});

describe('dropTrailingRepeatedPoints', () => {
  const A = { x: 0, y: 0 };
  const B = { x: 1000, y: 0 };
  const C = { x: 1000, y: 1000 };

  it('drops the corner a double-click put down twice', () => {
    expect(dropTrailingRepeatedPoints([A, B, C, { ...C }], 100)).toEqual([A, B, C]);
  });

  it('drops every trailing repeat within the tolerance, and only trailing ones', () => {
    const nearlyC = { x: 1040, y: 1030 };
    expect(dropTrailingRepeatedPoints([A, { ...A }, B, C, nearlyC, { ...nearlyC }], 100)).toEqual([A, { ...A }, B, C]);
  });

  it('keeps a last corner that is farther than the tolerance from the one before', () => {
    expect(dropTrailingRepeatedPoints([A, B, C], 100)).toEqual([A, B, C]);
  });

  it('never empties the list and leaves the input alone', () => {
    const input = [A, { ...A }];
    expect(dropTrailingRepeatedPoints(input, 100)).toEqual([A]);
    expect(input).toHaveLength(2);
    expect(dropTrailingRepeatedPoints(undefined, 100)).toEqual([]);
  });
});
