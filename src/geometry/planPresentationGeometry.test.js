import { describe, expect, it } from 'vitest';
import { createColumn, createWall } from '@/domain/models';
import {
  WALL_TIERS,
  buildPlanCardRegion,
  buildWallTierRegions,
  cachedWallTierRegions,
  hasCachedWallTierRegions,
  regionsToPath,
  wallTier,
} from './planPresentationGeometry';

function masonry(start, end, thickness = 200, options = {}) {
  return createWall(start, end, thickness, options);
}

describe('wallTier', () => {
  it('reads thick masonry as solid structure', () => {
    expect(wallTier(masonry({ x: 0, y: 0 }, { x: 4000, y: 0 }, 150))).toBe(WALL_TIERS.SOLID);
    expect(wallTier(masonry({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200))).toBe(WALL_TIERS.SOLID);
  });

  it('reads thin nonstructural masonry as a partition', () => {
    expect(wallTier(masonry({ x: 0, y: 0 }, { x: 4000, y: 0 }, 100))).toBe(WALL_TIERS.PARTITION);
  });

  it('makes a declared loadbearing wall solid whatever its thickness', () => {
    const wall = masonry({ x: 0, y: 0 }, { x: 4000, y: 0 }, 100, { structuralRole: 'loadbearing' });
    expect(wallTier(wall)).toBe(WALL_TIERS.SOLID);
  });

  it('keeps every framed assembly a partition, even a thick one', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200, { assembly: { preset: 'fiber_cement' } });
    expect(wallTier(wall)).toBe(WALL_TIERS.PARTITION);
  });
});

describe('buildWallTierRegions — one seamless outline per tier', () => {
  it('fuses an L corner into one ring with no interior edge', () => {
    const a = masonry({ x: 0, y: 0 }, { x: 4000, y: 0 });
    const b = masonry({ x: 4000, y: 0 }, { x: 4000, y: 3000 });
    const { solid, partition } = buildWallTierRegions([a, b], []);

    expect(partition).toEqual([]);
    expect(solid).toHaveLength(1);
    expect(solid[0].holes).toEqual([]);
    // The outside corner is filled: the ring reaches the corner square's far
    // vertex, which neither wall's own rectangle contains.
    const xs = solid[0].outline.map((p) => p.x);
    const ys = solid[0].outline.map((p) => p.y);
    expect(Math.max(...xs)).toBeCloseTo(4100, 6);
    expect(Math.min(...ys)).toBeCloseTo(-100, 6);
    // An L has six corners; a seam would show up as extra vertices.
    expect(solid[0].outline).toHaveLength(6);
  });

  it('fuses a tee into one ring', () => {
    const through = masonry({ x: 0, y: 0 }, { x: 6000, y: 0 });
    const stem = masonry({ x: 3000, y: 0 }, { x: 3000, y: 3000 });
    const { solid } = buildWallTierRegions([through, stem], []);

    expect(solid).toHaveLength(1);
    expect(solid[0].holes).toEqual([]);
    expect(solid[0].outline).toHaveLength(8);
  });

  it('keeps the tiers apart and closes a ring of walls around its hole', () => {
    const ring = [
      masonry({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      masonry({ x: 4000, y: 0 }, { x: 4000, y: 4000 }),
      masonry({ x: 4000, y: 4000 }, { x: 0, y: 4000 }),
      masonry({ x: 0, y: 4000 }, { x: 0, y: 0 }),
    ];
    const partitionWall = masonry({ x: 0, y: 2000 }, { x: 4000, y: 2000 }, 100);
    const { solid, partition } = buildWallTierRegions([...ring, partitionWall], []);

    expect(solid).toHaveLength(1);
    expect(solid[0].holes).toHaveLength(1);
    expect(partition).toHaveLength(1);
  });

  it('puts columns in the solid tier', () => {
    const column = createColumn(10000, 10000, 300, 300);
    const { solid } = buildWallTierRegions([], [column]);
    expect(solid).toHaveLength(1);
  });

  it('falls back to the unmerged rings on degenerate input rather than dropping geometry', () => {
    // A zero-length wall's outline is a collapsed ring; the union must not
    // throw, and the real wall beside it must still be drawn.
    const real = masonry({ x: 0, y: 0 }, { x: 4000, y: 0 });
    const collapsed = { ...masonry({ x: 0, y: 0 }, { x: 4000, y: 0 }), end: { x: 0, y: 0 } };
    const { solid } = buildWallTierRegions([real, collapsed], []);
    expect(solid.length).toBeGreaterThanOrEqual(1);
    expect(regionsToPath(solid)).toMatch(/^M/);
  });
});

describe('buildPlanCardRegion', () => {
  it('unions walls, rooms and slabs into one footprint', () => {
    const walls = [masonry({ x: 0, y: 0 }, { x: 4000, y: 0 })];
    const rooms = [
      {
        points: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
          { x: 0, y: 3000 },
        ],
      },
    ];
    const card = buildPlanCardRegion({ walls, rooms, columns: [], slabs: [] });
    expect(card).toHaveLength(1);
  });

  it('is empty for an empty floor', () => {
    expect(buildPlanCardRegion({ walls: [], rooms: [], columns: [], slabs: [] })).toEqual([]);
    expect(buildPlanCardRegion(null)).toEqual([]);
  });
});

describe('the identity cache', () => {
  it('answers the same arrays without re-unioning, and knows when it has an answer', () => {
    const walls = [masonry({ x: 0, y: 0 }, { x: 4000, y: 0 })];
    const columns = [];
    expect(hasCachedWallTierRegions(walls, columns)).toBe(false);
    const first = cachedWallTierRegions(walls, columns);
    expect(hasCachedWallTierRegions(walls, columns)).toBe(true);
    expect(cachedWallTierRegions(walls, columns)).toBe(first);
    expect(hasCachedWallTierRegions([...walls], columns)).toBe(false);
  });
});
