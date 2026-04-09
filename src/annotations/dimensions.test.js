import { describe, expect, it } from 'vitest';
import { createWall } from '@/domain/models';
import { buildOverallDimensionFigures, buildWallDimensionFigures } from './dimensions';

describe('dimensions', () => {
  it('does not add overall dimensions for a single wall', () => {
    const walls = [createWall({ x: 0, y: 0 }, { x: 2400, y: 0 })];

    expect(buildWallDimensionFigures(walls)).toHaveLength(1);
    expect(buildOverallDimensionFigures(walls)).toEqual([]);
  });

  it('still adds overall dimensions once multiple walls define an extent', () => {
    const walls = [createWall({ x: 0, y: 0 }, { x: 2400, y: 0 }), createWall({ x: 2400, y: 0 }, { x: 2400, y: 1800 })];

    expect(buildOverallDimensionFigures(walls).length).toBeGreaterThan(0);
  });
});
