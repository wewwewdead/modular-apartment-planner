import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RAY_COUNT,
  computeRoomDaylightGrid,
  fractionAbove,
  hemisphereDirections,
  skyComponentAt,
} from './daylightGrid';
import { emptyHorizon } from './obstructionHorizon';

const DEG = Math.PI / 180;
const HALF_PI = Math.PI / 2;

/**
 * An aperture so wide and so tall that the wall around it effectively vanishes.
 * A sensor pressed against it sees exactly half the sky, which is a limit the
 * estimator has to reproduce to 50.00% or something is wrong with the sampling,
 * the sky model or the normalisation.
 */
function unboundedAperture(overrides = {}) {
  return {
    id: 'open',
    centre: { x: 0, y: 0 },
    tangent: { x: 1, y: 0 },
    outwardNormal: { x: 0, y: 1 },
    halfThickness: 1,
    width: 1e9,
    sillElevation: -1e9,
    headElevation: 1e9,
    efficiency: 1,
    ...overrides,
  };
}

function uniformMask(angleDeg, bins = 360) {
  return {
    bins,
    top: new Float32Array(bins).fill(angleDeg * DEG),
    bottom: new Float32Array(bins).fill(-HALF_PI),
    ceiling: new Float32Array(bins).fill(HALF_PI),
    obstructed: angleDeg > 0,
    overhung: false,
    maxAltitude: angleDeg * DEG,
  };
}

describe('hemisphere sampling', () => {
  const directions = hemisphereDirections(4096);

  it('produces unit vectors in the upper hemisphere', () => {
    for (let index = 0; index < 4096; index += 1) {
      const x = directions[index * 3];
      const y = directions[index * 3 + 1];
      const z = directions[index * 3 + 2];
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
      expect(z).toBeGreaterThanOrEqual(0);
    }
  });

  it('is cosine-weighted, so the mean elevation cosine is 2/3', () => {
    // ∫ cos θ · (cos θ/π) dω = 2/3. Any other value means the directions are
    // not distributed the way the estimator assumes and every daylight factor
    // would be biased.
    let total = 0;
    for (let index = 0; index < 4096; index += 1) total += directions[index * 3 + 2];
    expect(total / 4096).toBeCloseTo(2 / 3, 2);
  });

  it('is deterministic, and decorrelated between sensors', () => {
    expect(Array.from(hemisphereDirections(64))).toEqual(Array.from(hemisphereDirections(64)));
    expect(Array.from(hemisphereDirections(64, 0.3, 0.7))).not.toEqual(Array.from(hemisphereDirections(64)));
  });

  it('fills a caller-supplied buffer instead of allocating', () => {
    const buffer = new Float32Array(64 * 3);
    expect(hemisphereDirections(64, 0, 0, buffer)).toBe(buffer);
  });
});

describe('the half-sky limit', () => {
  const sensor = { x: 0, y: -10, z: 0 };
  const directions = hemisphereDirections(8192);

  it('gives 50% daylight factor at an unbounded opening', () => {
    // Half the hemisphere, and by symmetry half the horizontal illuminance.
    // This one number exercises the sky luminance distribution, the
    // cosine-weighted estimator, the 7π/9 normalisation and the aperture test
    // all at once.
    const daylightFactor = skyComponentAt({
      sensor,
      apertures: [unboundedAperture()],
      horizons: new Map(),
      directions,
    });
    expect(daylightFactor).toBeCloseTo(50, 0);
  });

  it('scales with glazing transmittance', () => {
    const half = skyComponentAt({
      sensor,
      apertures: [unboundedAperture({ efficiency: 0.5 })],
      horizons: new Map(),
      directions,
    });
    expect(half).toBeCloseTo(25, 0);
  });

  it('falls to the obstruction reflectance when the sky is entirely hidden', () => {
    // Everything blocked, so all that is left is light bounced off whatever is
    // doing the blocking: 50% × 0.2.
    const horizons = new Map([['open', uniformMask(89.9)]]);
    const daylightFactor = skyComponentAt({
      sensor,
      apertures: [unboundedAperture()],
      horizons,
      directions,
      obstructionReflectance: 0.2,
    });
    expect(daylightFactor).toBeCloseTo(10, 0);
  });

  it('loses more than a proportional share to a low obstruction', () => {
    // A 30° obstruction hides only a third of the altitude range but far more
    // than a third of the light, because the overcast sky is brightest overhead
    // and a horizontal sensor weights the zenith most.
    const clear = skyComponentAt({ sensor, apertures: [unboundedAperture()], horizons: new Map(), directions });
    const obstructed = skyComponentAt({
      sensor,
      apertures: [unboundedAperture()],
      horizons: new Map([['open', uniformMask(30)]]),
      directions,
      obstructionReflectance: 0,
    });
    expect(obstructed).toBeLessThan(clear);
    expect(obstructed).toBeGreaterThan(clear * 0.5);
  });
});

describe('the aperture as a tunnel', () => {
  const directions = hemisphereDirections(4096);
  const sensor = { x: 0, y: -2000, z: 850 };

  function windowAperture(halfThickness) {
    return {
      id: 'win',
      centre: { x: 0, y: 0 },
      tangent: { x: 1, y: 0 },
      outwardNormal: { x: 0, y: 1 },
      halfThickness,
      width: 1500,
      sillElevation: 900,
      headElevation: 2100,
      efficiency: 1,
    };
  }

  it('shades the room more the deeper the reveal', () => {
    // A window in a 100 mm partition and the same window in a 500 mm masonry
    // wall are not the same window, and a study that ignored the reveal would
    // call them identical.
    const thin = skyComponentAt({ sensor, apertures: [windowAperture(50)], horizons: new Map(), directions });
    const deep = skyComponentAt({ sensor, apertures: [windowAperture(250)], horizons: new Map(), directions });

    expect(thin).toBeGreaterThan(0);
    expect(deep).toBeLessThan(thin);
  });

  it('admits nothing through a window behind the sensor', () => {
    // Facing away: the sensor is on the outside of the glass.
    const behind = { ...windowAperture(100), outwardNormal: { x: 0, y: -1 } };
    expect(skyComponentAt({ sensor, apertures: [behind], horizons: new Map(), directions })).toBe(0);
  });

  it('admits nothing with no apertures at all', () => {
    expect(skyComponentAt({ sensor, apertures: [], horizons: new Map(), directions })).toBe(0);
  });

  it('falls off with distance from the window', () => {
    const near = skyComponentAt({
      sensor: { x: 0, y: -1000, z: 850 },
      apertures: [windowAperture(100)],
      horizons: new Map(),
      directions,
    });
    const far = skyComponentAt({
      sensor: { x: 0, y: -6000, z: 850 },
      apertures: [windowAperture(100)],
      horizons: new Map(),
      directions,
    });
    expect(far).toBeLessThan(near);
  });
});

describe('a room grid', () => {
  // 5 × 4 m room with its window wall along y = 0.
  const room = {
    id: 'room',
    name: 'Living',
    polygon: [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    floorElevation: 0,
  };

  const apertures = [
    {
      id: 'win',
      centre: { x: 2500, y: 0 },
      tangent: { x: 1, y: 0 },
      outwardNormal: { x: 0, y: -1 },
      halfThickness: 100,
      width: 2000,
      sillElevation: 900,
      headElevation: 2300,
      efficiency: 0.43,
    },
  ];

  const grid = computeRoomDaylightGrid({
    room,
    apertures,
    horizons: new Map([['win', emptyHorizon()]]),
    internallyReflectedPercent: 0.5,
    settings: { sensorSpacing: 500, rayCount: 128 },
  });

  it('covers the task area and leaves the border strip out', () => {
    expect(grid.columns).toBe(10);
    expect(grid.rows).toBe(8);
    // 10 × 8 cells, minus the 0.5 m strip against every wall: 8 × 6.
    expect(grid.sensorCount).toBe(48);
    expect(grid.borderInset).toBe(500);
    // The excluded cells are masked out, not silently averaged in as zero.
    expect(grid.mask.filter((flag) => flag === 1)).toHaveLength(48);
    expect(grid.mask[0]).toBe(0);
  });

  it('relaxes the border inset rather than returning an empty grid', () => {
    // A cupboard narrower than twice the inset has no task area at all. It
    // should still be measured, not reported as having no daylight.
    const cupboard = {
      ...room,
      polygon: [
        { x: 0, y: 0 },
        { x: 800, y: 0 },
        { x: 800, y: 800 },
        { x: 0, y: 800 },
      ],
    };
    const tiny = computeRoomDaylightGrid({
      room: cupboard,
      apertures,
      horizons: new Map([['win', emptyHorizon()]]),
      settings: { sensorSpacing: 500, rayCount: 32 },
    });
    expect(tiny.sensorCount).toBeGreaterThan(0);
    expect(tiny.borderInset).toBe(0);
  });

  it('is brightest at the window and dimmest at the back', () => {
    // Rows 0 and 7 fall in the excluded border strip, so compare the nearest
    // and furthest rows that carry sensors.
    const atWindow = grid.values[1 * grid.columns + 5];
    const atBack = grid.values[(grid.rows - 2) * grid.columns + 5];
    expect(atWindow).toBeGreaterThan(atBack);
    // The back of a side-lit room typically holds a fifth of the light at the
    // glass; anything close to uniform would mean the aperture test is leaking.
    expect(atBack).toBeLessThan(atWindow * 0.6);
  });

  it('never drops below the internally reflected floor', () => {
    for (let index = 0; index < grid.values.length; index += 1) {
      if (grid.mask[index]) expect(grid.values[index]).toBeGreaterThanOrEqual(0.5);
    }
    expect(grid.min).toBeGreaterThanOrEqual(0.5);
  });

  it('reports a uniformity a side-lit room would actually have', () => {
    // One window in one wall is the classic non-uniform case: BS EN 12464
    // uniformity well under a half.
    expect(grid.uniformity).toBeGreaterThan(0);
    expect(grid.uniformity).toBeLessThan(0.6);
    expect(grid.mean).toBeGreaterThan(grid.min);
    expect(grid.max).toBeGreaterThan(grid.mean);
  });

  it('lands in a believable range for a 2 m × 1.4 m window', () => {
    // Roughly a 2% average daylight factor room. If this came out at 0.2% or
    // 20% the units are wrong somewhere.
    expect(grid.mean).toBeGreaterThan(0.5);
    expect(grid.mean).toBeLessThan(6);
  });

  it('is reproducible run to run', () => {
    const again = computeRoomDaylightGrid({
      room,
      apertures,
      horizons: new Map([['win', emptyHorizon()]]),
      internallyReflectedPercent: 0.5,
      settings: { sensorSpacing: 500, rayCount: 128 },
    });
    expect(Array.from(again.values)).toEqual(Array.from(grid.values));
  });

  it('counts the share of the room over a target', () => {
    expect(fractionAbove(grid, 0)).toBe(1);
    expect(fractionAbove(grid, 1e6)).toBe(0);
    expect(fractionAbove(grid, grid.mean)).toBeGreaterThan(0);
    expect(fractionAbove(grid, grid.mean)).toBeLessThan(1);
  });

  it('coarsens rather than refusing a very large room', () => {
    const warehouse = {
      ...room,
      polygon: [
        { x: 0, y: 0 },
        { x: 200000, y: 0 },
        { x: 200000, y: 150000 },
        { x: 0, y: 150000 },
      ],
    };
    const coarse = computeRoomDaylightGrid({
      room: warehouse,
      apertures,
      horizons: new Map(),
      settings: { sensorSpacing: 500, rayCount: 32 },
    });
    expect(coarse).not.toBeNull();
    expect(coarse.cellSize).toBeGreaterThan(500);
    expect(coarse.sensorCount).toBeLessThanOrEqual(4000);
  });

  it('returns nothing for a degenerate room', () => {
    const sliver = {
      ...room,
      polygon: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    };
    expect(computeRoomDaylightGrid({ room: sliver, apertures, horizons: new Map() })).toBeNull();
  });

  it('uses a sane default ray count', () => {
    expect(DEFAULT_RAY_COUNT).toBeGreaterThanOrEqual(128);
  });
});
