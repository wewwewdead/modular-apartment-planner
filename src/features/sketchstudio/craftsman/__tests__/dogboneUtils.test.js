import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BIT_DIAMETER,
  DOGBONE_STYLES,
  applyDogboneToEntity,
  applyDogboneToPolygon,
  buildCornerRelief,
  findReliefCorners,
  getDogboneRegion,
  isDogboneExemptEntity,
  normalizeDogboneSettings,
} from '../export/dogboneUtils';

const BIT = 6.35;
const RADIUS = BIT / 2;

/** A 100x60 rectangle, counter-clockwise in standard math coords. */
const CCW_RECT = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 60 },
  { x: 0, y: 60 },
];

/** The same rectangle wound the other way. */
const CW_RECT = [...CCW_RECT].reverse();

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('dogbone corner detection', () => {
  it('flags every corner of a pocket as unreachable, for both windings', () => {
    const ccw = findReliefCorners(CCW_RECT, { region: 'inside' });
    const cw = findReliefCorners(CW_RECT, { region: 'inside' });

    expect(ccw).toHaveLength(4);
    expect(cw).toHaveLength(4);
    ccw.forEach((corner) => expect(corner.cutRegionAngleDeg).toBeCloseTo(90, 9));
    cw.forEach((corner) => expect(corner.cutRegionAngleDeg).toBeCloseTo(90, 9));
  });

  it('flags no corner of a rectangular PERIMETER, for both windings', () => {
    // The waste is outside the path, so every 90-degree perimeter corner
    // presents 270 degrees to the cutter - it drives around freely.
    expect(findReliefCorners(CCW_RECT, { region: 'outside' })).toHaveLength(0);
    expect(findReliefCorners(CW_RECT, { region: 'outside' })).toHaveLength(0);
  });

  it('flags only the reflex vertices of a notched perimeter, for both windings', () => {
    // A square with a rectangular notch bitten out of the top edge. The two
    // inside corners of the notch are the only places the bit cannot reach.
    const notched = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 70, y: 100 },
      { x: 70, y: 70 },
      { x: 30, y: 70 },
      { x: 30, y: 100 },
      { x: 0, y: 100 },
    ];

    const forward = findReliefCorners(notched, { region: 'outside' });
    const reversed = findReliefCorners([...notched].reverse(), { region: 'outside' });

    expect(forward).toHaveLength(2);
    expect(reversed).toHaveLength(2);

    const forwardPoints = forward.map((corner) => `${corner.point.x},${corner.point.y}`).sort();
    const reversedPoints = reversed.map((corner) => `${corner.point.x},${corner.point.y}`).sort();
    expect(forwardPoints).toEqual(['30,70', '70,70']);
    expect(reversedPoints).toEqual(['30,70', '70,70']);
    forward.forEach((corner) => expect(corner.cutRegionAngleDeg).toBeCloseTo(90, 9));
  });

  it('ignores corners flatter than the relief threshold', () => {
    // A regular hexagon: interior angles are 120 degrees, so at the default
    // 170-degree threshold every corner still qualifies...
    const hexagon = Array.from({ length: 6 }, (_, index) => ({
      x: 50 * Math.cos((index * Math.PI) / 3),
      y: 50 * Math.sin((index * Math.PI) / 3),
    }));
    expect(findReliefCorners(hexagon, { region: 'inside' })).toHaveLength(6);

    // ...and none does once the threshold drops below 120.
    expect(findReliefCorners(hexagon, { region: 'inside', maxReliefAngleDeg: 100 })).toHaveLength(0);
  });

  it('returns nothing for a degenerate path', () => {
    expect(
      findReliefCorners(
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        { region: 'inside' },
      ),
    ).toEqual([]);
    expect(findReliefCorners(null, { region: 'inside' })).toEqual([]);
  });
});

describe('dogbone relief placement', () => {
  it('puts the original sharp corner exactly ON the relief circle', () => {
    // This is the defining property of the whole feature: the bit sweep has to
    // just reach the corner point, or the corner is still rounded off.
    const corners = findReliefCorners(CCW_RECT, { region: 'inside' });

    corners.forEach((corner) => {
      const relief = buildCornerRelief(corner, RADIUS, DOGBONE_STYLES.DOGBONE);
      expect(distance(relief.center, corner.point)).toBeCloseTo(RADIUS, 9);
      expect(relief.radius).toBeCloseTo(RADIUS, 9);
    });
  });

  it('places the relief centre on the bisector, INTO the region being cut', () => {
    const corner = findReliefCorners(CCW_RECT, { region: 'inside' }).find(
      (candidate) => candidate.point.x === 0 && candidate.point.y === 0,
    );
    const relief = buildCornerRelief(corner, RADIUS, DOGBONE_STYLES.DOGBONE);

    // Pocket interior is toward (+x, +y) from the origin corner.
    expect(relief.center.x).toBeCloseTo(RADIUS / Math.SQRT2, 9);
    expect(relief.center.y).toBeCloseTo(RADIUS / Math.SQRT2, 9);
  });

  it('bites both walls symmetrically by 2*r*cos(alpha)', () => {
    const corners = findReliefCorners(CCW_RECT, { region: 'inside' });

    corners.forEach((corner) => {
      const relief = buildCornerRelief(corner, RADIUS, DOGBONE_STYLES.DOGBONE);
      const expectedBite = 2 * RADIUS * Math.cos(Math.PI / 4); // r * sqrt(2)

      expect(relief.entryBite).toBeCloseTo(expectedBite, 9);
      expect(relief.exitBite).toBeCloseTo(expectedBite, 9);
      // Symmetric in geometry too, not just in the reported numbers.
      expect(distance(relief.entry, corner.point)).toBeCloseTo(expectedBite, 9);
      expect(distance(relief.exit, corner.point)).toBeCloseTo(expectedBite, 9);
      // Both cut ends sit on the relief circle.
      expect(distance(relief.entry, relief.center)).toBeCloseTo(RADIUS, 9);
      expect(distance(relief.exit, relief.center)).toBeCloseTo(RADIUS, 9);
    });
  });

  it('sweeps exactly a semicircle at a 90-degree corner', () => {
    const corner = findReliefCorners(CCW_RECT, { region: 'inside' })[0];
    const relief = buildCornerRelief(corner, RADIUS, DOGBONE_STYLES.DOGBONE);

    expect(relief.sweepDeg).toBeCloseTo(180, 9);
    expect(Math.abs(relief.bulge)).toBeCloseTo(1, 9);
  });

  it('sweeps 360 - 4*alpha at a non-right-angled corner', () => {
    // Isosceles triangle pocket with a 60-degree apex.
    const triangle = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 86.60254037844386 },
    ];
    const corners = findReliefCorners(triangle, { region: 'inside' });
    expect(corners).toHaveLength(3);

    corners.forEach((corner) => {
      const relief = buildCornerRelief(corner, RADIUS, DOGBONE_STYLES.DOGBONE);
      expect(corner.cutRegionAngleDeg).toBeCloseTo(60, 6);
      expect(relief.sweepDeg).toBeCloseTo(360 - 2 * 60, 6);
      expect(distance(relief.center, corner.point)).toBeCloseTo(RADIUS, 9);
    });
  });

  it('keeps the same relief geometry whichever way the pocket is wound', () => {
    const ccwCorner = findReliefCorners(CCW_RECT, { region: 'inside' }).find(
      (corner) => corner.point.x === 0 && corner.point.y === 0,
    );
    const cwCorner = findReliefCorners(CW_RECT, { region: 'inside' }).find(
      (corner) => corner.point.x === 0 && corner.point.y === 0,
    );

    const ccwRelief = buildCornerRelief(ccwCorner, RADIUS, DOGBONE_STYLES.DOGBONE);
    const cwRelief = buildCornerRelief(cwCorner, RADIUS, DOGBONE_STYLES.DOGBONE);

    expect(cwRelief.center.x).toBeCloseTo(ccwRelief.center.x, 9);
    expect(cwRelief.center.y).toBeCloseTo(ccwRelief.center.y, 9);
    expect(cwRelief.sweepDeg).toBeCloseTo(ccwRelief.sweepDeg, 9);
    // Winding reverses the traversal, so entry/exit swap and the arc turns the
    // other way - the cut REGION is identical.
    expect(cwRelief.bulge).toBeCloseTo(-ccwRelief.bulge, 9);
  });
});

describe('t-bone relief placement', () => {
  it('still puts the corner on the relief circle, but bites a single wall', () => {
    const corner = findReliefCorners(CCW_RECT, { region: 'inside' }).find(
      (candidate) => candidate.point.x === 0 && candidate.point.y === 0,
    );
    const relief = buildCornerRelief(corner, RADIUS, DOGBONE_STYLES.TBONE_X);

    expect(relief.style).toBe(DOGBONE_STYLES.TBONE_X);
    expect(distance(relief.center, corner.point)).toBeCloseTo(RADIUS, 9);
    // One wall takes the full 2r bite, the other is only tangent (zero bite).
    const bites = [relief.entryBite, relief.exitBite].sort((a, b) => a - b);
    expect(bites[0]).toBeCloseTo(0, 9);
    expect(bites[1]).toBeCloseTo(2 * RADIUS, 9);
    expect(relief.sweepDeg).toBeCloseTo(180, 9);
  });

  it('picks the wall that runs along the requested axis', () => {
    const corner = findReliefCorners(CCW_RECT, { region: 'inside' }).find(
      (candidate) => candidate.point.x === 0 && candidate.point.y === 0,
    );

    const alongX = buildCornerRelief(corner, RADIUS, DOGBONE_STYLES.TBONE_X);
    const alongY = buildCornerRelief(corner, RADIUS, DOGBONE_STYLES.TBONE_Y);

    // X-wall relief slides the centre along x; Y-wall relief slides it along y.
    expect(alongX.center.x).toBeCloseTo(RADIUS, 9);
    expect(alongX.center.y).toBeCloseTo(0, 9);
    expect(alongY.center.x).toBeCloseTo(0, 9);
    expect(alongY.center.y).toBeCloseTo(RADIUS, 9);
  });

  it('falls back to a bisector dogbone on an obtuse cut corner', () => {
    const hexagon = Array.from({ length: 6 }, (_, index) => ({
      x: 50 * Math.cos((index * Math.PI) / 3),
      y: 50 * Math.sin((index * Math.PI) / 3),
    }));
    const corner = findReliefCorners(hexagon, { region: 'inside' })[0];

    expect(corner.cutRegionAngleDeg).toBeCloseTo(120, 6);
    expect(buildCornerRelief(corner, RADIUS, DOGBONE_STYLES.TBONE_X).style).toBe(DOGBONE_STYLES.DOGBONE);
  });
});

describe('applyDogboneToPolygon', () => {
  it('replaces each relieved corner with an entry/exit pair carrying a bulge', () => {
    const result = applyDogboneToPolygon(CCW_RECT, {
      region: 'inside',
      style: DOGBONE_STYLES.DOGBONE,
      bitDiameter: BIT,
    });

    expect(result.applied).toBe(true);
    expect(result.points).toHaveLength(8);
    expect(result.reliefs).toHaveLength(4);

    const bulged = result.points.filter((point) => point.bulge);
    expect(bulged).toHaveLength(4);
    bulged.forEach((point) => expect(Math.abs(point.bulge)).toBeCloseTo(1, 9));
  });

  it('is a no-op for style "none" and for a zero bit', () => {
    expect(applyDogboneToPolygon(CCW_RECT, { style: DOGBONE_STYLES.NONE, bitDiameter: BIT }).applied).toBe(false);
    expect(applyDogboneToPolygon(CCW_RECT, { style: DOGBONE_STYLES.DOGBONE, bitDiameter: 0 }).applied).toBe(false);
    expect(applyDogboneToPolygon(CCW_RECT, { style: DOGBONE_STYLES.NONE }).points).toBe(CCW_RECT);
  });

  it('is a no-op on a rectangular perimeter, where nothing is unreachable', () => {
    const result = applyDogboneToPolygon(CCW_RECT, {
      region: 'outside',
      style: DOGBONE_STYLES.DOGBONE,
      bitDiameter: BIT,
    });

    expect(result.applied).toBe(false);
    expect(result.points).toBe(CCW_RECT);
  });

  it('drops reliefs whose bites would overrun the wall they sit on', () => {
    // A 5mm-wide slot cannot carry two r*sqrt(2) = 4.49mm bites on the same
    // 5mm wall, so those corners are left sharp rather than folded through.
    const narrowSlot = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 80 },
      { x: 0, y: 80 },
    ];
    const result = applyDogboneToPolygon(narrowSlot, {
      region: 'inside',
      style: DOGBONE_STYLES.DOGBONE,
      bitDiameter: BIT,
    });

    expect(result.applied).toBe(false);
    expect(result.skippedCorners).toBe(4);
  });

  it('relieves a slot whose walls are long enough for the bit', () => {
    const slot = [
      { x: 0, y: 0 },
      { x: 18, y: 0 },
      { x: 18, y: 80 },
      { x: 0, y: 80 },
    ];
    const result = applyDogboneToPolygon(slot, {
      region: 'inside',
      style: DOGBONE_STYLES.DOGBONE,
      bitDiameter: BIT,
    });

    expect(result.applied).toBe(true);
    expect(result.reliefs).toHaveLength(4);
    result.reliefs.forEach((relief) => expect(relief.radius).toBeCloseTo(RADIUS, 9));
  });
});

describe('entity-level dogbone rules', () => {
  it('classifies which entities have a cut region at all', () => {
    expect(getDogboneRegion({ type: 'feature', shape: 'rect', operation: 'subtract' })).toBe('inside');
    expect(getDogboneRegion({ type: 'feature', shape: 'polygon' })).toBe('inside');
    expect(getDogboneRegion({ type: 'polyline', closed: true })).toBe('outside');
    expect(getDogboneRegion({ type: 'polyline', closed: false })).toBeNull();
    expect(getDogboneRegion({ type: 'feature', shape: 'circle' })).toBeNull();
    expect(getDogboneRegion({ type: 'feature', shape: 'rect', operation: 'engrave' })).toBeNull();
    // A rectangle can never have a concave corner, so it stays untouched.
    expect(getDogboneRegion({ type: 'rect' })).toBeNull();
  });

  it('exempts drilled holes and reference geometry', () => {
    expect(isDogboneExemptEntity({ type: 'feature', shape: 'circle', hardwareId: 'hw-screw-8-32' })).toBe(true);
    expect(isDogboneExemptEntity({ type: 'polyline', meta: { dxfKerfExempt: true } })).toBe(true);
    expect(isDogboneExemptEntity({ type: 'feature', shape: 'rect', meta: { dxfDogboneExempt: true } })).toBe(true);
    expect(isDogboneExemptEntity({ type: 'feature', shape: 'rect' })).toBe(false);
  });

  it('turns a relieved rect pocket into a bulged polygon feature', () => {
    const feature = {
      id: 'f1',
      type: 'feature',
      shape: 'rect',
      operation: 'subtract',
      x: 0,
      y: 0,
      width: 40,
      height: 30,
    };
    const result = applyDogboneToEntity(feature, { style: DOGBONE_STYLES.DOGBONE, bitDiameter: BIT });

    expect(result).not.toBe(feature);
    expect(result.shape).toBe('polygon');
    expect(result.points).toHaveLength(8);
    expect(result.points.filter((point) => point.bulge)).toHaveLength(4);
  });

  it('returns the SAME object when nothing is relieved', () => {
    const perimeter = { id: 'p1', type: 'polyline', closed: true, points: CCW_RECT };
    const fastener = { id: 'h1', type: 'feature', shape: 'circle', hardwareId: 'hw-screw-8-32', cx: 0, cy: 0 };
    const settings = { style: DOGBONE_STYLES.DOGBONE, bitDiameter: BIT };

    expect(applyDogboneToEntity(perimeter, settings)).toBe(perimeter);
    expect(applyDogboneToEntity(fastener, settings)).toBe(fastener);
    expect(applyDogboneToEntity(perimeter, { style: DOGBONE_STYLES.NONE })).toBe(perimeter);
  });
});

describe('normalizeDogboneSettings', () => {
  it('treats absent, "none" and non-positive bits as switched off', () => {
    expect(normalizeDogboneSettings(null)).toBeNull();
    expect(normalizeDogboneSettings(undefined)).toBeNull();
    expect(normalizeDogboneSettings({ style: DOGBONE_STYLES.NONE })).toBeNull();
    expect(normalizeDogboneSettings({ style: 'nonsense' })).toBeNull();
    expect(normalizeDogboneSettings({ style: DOGBONE_STYLES.DOGBONE, bitDiameter: 0 })).toBeNull();
  });

  it('defaults the bit to a 1/4" cutter', () => {
    expect(normalizeDogboneSettings({ style: DOGBONE_STYLES.DOGBONE }).bitDiameter).toBe(DEFAULT_BIT_DIAMETER);
  });
});
