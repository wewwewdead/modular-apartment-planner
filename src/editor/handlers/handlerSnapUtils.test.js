import { describe, it, expect } from 'vitest';
import { snapToGrid, resolvePoint } from './handlerSnapUtils';
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
