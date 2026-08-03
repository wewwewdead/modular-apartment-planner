import { describe, expect, it } from 'vitest';
import { getRailingStairProfile } from './railingGeometry';

// 10 risers x 175mm over 250mm treads: run 2500, total rise 1750, running +x from origin
function makeStair(overrides = {}) {
  return {
    id: 'stair_1',
    startPoint: { x: 0, y: 0 },
    width: 1000,
    numberOfRisers: 10,
    riserHeight: 175,
    treadDepth: 250,
    direction: { angle: 0 },
    ...overrides,
  };
}

function makeRailing(startPoint, endPoint) {
  return { id: 'rail_1', startPoint, endPoint, width: 50, height: 1000 };
}

describe('getRailingStairProfile', () => {
  it('attaches a railing drawn along the stair edge and follows the nosing pitch line', () => {
    const stair = makeStair();
    const railing = makeRailing({ x: 0, y: 500 }, { x: 2500, y: 500 });

    const profile = getRailingStairProfile(railing, [stair]);

    expect(profile).not.toBeNull();
    expect(profile.stair).toBe(stair);
    // First nosing top at the bottom, clamped to total rise at the top
    expect(profile.startRise).toBeCloseTo(175, 5);
    expect(profile.endRise).toBeCloseTo(1750, 5);
  });

  it('handles a railing drawn from the top of the stair down', () => {
    const stair = makeStair();
    const railing = makeRailing({ x: 2500, y: 500 }, { x: 0, y: 500 });

    const profile = getRailingStairProfile(railing, [stair]);

    expect(profile.startRise).toBeCloseTo(1750, 5);
    expect(profile.endRise).toBeCloseTo(175, 5);
  });

  it('clamps a railing overshooting the stair run to the total rise', () => {
    const stair = makeStair();
    const railing = makeRailing({ x: 0, y: 500 }, { x: 3000, y: 500 });

    const profile = getRailingStairProfile(railing, [stair]);

    expect(profile.endRise).toBeCloseTo(1750, 5);
  });

  it('follows a rotated stair run', () => {
    const stair = makeStair({ direction: { angle: 90 } });
    const railing = makeRailing({ x: 500, y: 0 }, { x: 500, y: 2500 });

    const profile = getRailingStairProfile(railing, [stair]);

    expect(profile).not.toBeNull();
    expect(profile.startRise).toBeCloseTo(175, 5);
    expect(profile.endRise).toBeCloseTo(1750, 5);
  });

  it('ignores railings far from any stair', () => {
    const railing = makeRailing({ x: 0, y: 3000 }, { x: 2500, y: 3000 });
    expect(getRailingStairProfile(railing, [makeStair()])).toBeNull();
  });

  it('ignores railings crossing the stair perpendicular to the run', () => {
    const railing = makeRailing({ x: 1250, y: -500 }, { x: 1250, y: 500 });
    expect(getRailingStairProfile(railing, [makeStair()])).toBeNull();
  });

  it('ignores stairs with no rise', () => {
    const railing = makeRailing({ x: 0, y: 500 }, { x: 2500, y: 500 });
    expect(getRailingStairProfile(railing, [makeStair({ numberOfRisers: 0 })])).toBeNull();
  });

  it('picks the stair with the largest overlap when several qualify', () => {
    // Both stairs overlap the railing enough to qualify: 1000mm vs 1500mm of a 1500mm railing
    const shortStair = makeStair({ id: 'stair_short', numberOfRisers: 4 });
    const longStair = makeStair({ id: 'stair_long' });
    const railing = makeRailing({ x: 0, y: 500 }, { x: 1500, y: 500 });

    const profile = getRailingStairProfile(railing, [shortStair, longStair]);

    expect(profile.stair).toBe(longStair);
  });
});
