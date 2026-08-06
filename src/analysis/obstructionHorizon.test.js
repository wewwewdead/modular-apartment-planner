import { describe, expect, it } from 'vitest';
import {
  HORIZON_CONSTANTS,
  buildObstructionHorizon,
  emptyHorizon,
  horizonAltitude,
  obstructionAngleDeg,
  seesSky,
  skyAngleDeg,
} from './obstructionHorizon';

const RAD = 180 / Math.PI;
const DEG = Math.PI / 180;
const HALF_PI = Math.PI / 2;

/** A window at the origin looking down +y, 1.5 m above the floor. */
const WINDOW = { origin: { x: 0, y: 0, z: 1500 }, outwardNormal: { x: 0, y: 1 } };

function block({ x, y, width, depth, top, base = 0 }) {
  const footprint = [
    { x: x - width / 2, y },
    { x: x + width / 2, y },
    { x: x + width / 2, y: y + depth },
    { x: x - width / 2, y: y + depth },
  ];
  return {
    id: `block:${x}:${y}`,
    footprint,
    holes: [],
    baseElevation: base,
    topElevations: footprint.map(() => top),
    sloped: false,
  };
}

/** A hand-built mask blocking everything up to `angleDeg` in every direction. */
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

describe('an unobstructed window', () => {
  it('sees the whole sky', () => {
    const mask = buildObstructionHorizon({ ...WINDOW, masses: [] });
    expect(mask.obstructed).toBe(false);
    expect(skyAngleDeg(mask, WINDOW.outwardNormal)).toBe(90);
    expect(obstructionAngleDeg(mask, WINDOW.outwardNormal)).toBe(0);
  });

  it('lets every upward ray through', () => {
    const mask = emptyHorizon();
    expect(seesSky(mask, { x: 0, y: 1, z: 0.001 })).toBe(true);
    expect(seesSky(mask, { x: 0, y: 0, z: 1 })).toBe(true);
    // Nothing below the horizontal is sky, whatever the obstruction.
    expect(seesSky(mask, { x: 0, y: 1, z: -0.5 })).toBe(false);
  });
});

describe('a building opposite', () => {
  it('subtends the angle trigonometry says it should', () => {
    // A 10 m tall block 10 m away, seen from 1.5 m up: atan(8.5/10) = 40.36°.
    const mask = buildObstructionHorizon({
      ...WINDOW,
      masses: [block({ x: 0, y: 10000, width: 40000, depth: 10000, top: 10000 })],
    });
    expect(mask.maxAltitude * RAD).toBeCloseTo(Math.atan2(8500, 10000) * RAD, 0);
  });

  it('closes down the sky angle by roughly its own height', () => {
    const mask = buildObstructionHorizon({
      ...WINDOW,
      // Wide enough to fill the window's whole field, so the cosine-weighted
      // mean should land near the single-section value a hand method reads off.
      masses: [block({ x: 0, y: 10000, width: 400000, depth: 10000, top: 10000 })],
    });
    const expected = 90 - Math.atan2(8500, 10000) * RAD;
    expect(skyAngleDeg(mask, WINDOW.outwardNormal)).toBeGreaterThan(expected - 8);
    expect(skyAngleDeg(mask, WINDOW.outwardNormal)).toBeLessThan(expected + 8);
  });

  it('matters less the further away it is', () => {
    const near = buildObstructionHorizon({
      ...WINDOW,
      masses: [block({ x: 0, y: 5000, width: 40000, depth: 5000, top: 12000 })],
    });
    const far = buildObstructionHorizon({
      ...WINDOW,
      masses: [block({ x: 0, y: 40000, width: 40000, depth: 5000, top: 12000 })],
    });
    expect(skyAngleDeg(near, WINDOW.outwardNormal)).toBeLessThan(skyAngleDeg(far, WINDOW.outwardNormal));
  });

  it('blocks only the directions it actually covers', () => {
    // A narrow tower off to one side.
    const mask = buildObstructionHorizon({
      ...WINDOW,
      masses: [block({ x: 12000, y: 10000, width: 3000, depth: 3000, top: 30000 })],
    });

    expect(horizonAltitude(mask, 0, 1)).toBe(0);
    expect(horizonAltitude(mask, 12000, 10000)).toBeGreaterThan(30 * DEG);

    const angle = skyAngleDeg(mask, WINDOW.outwardNormal);
    expect(angle).toBeLessThan(90);
    expect(angle).toBeGreaterThan(75);
  });

  it('blocks a band, not a horizon, when it does not reach the ground', () => {
    // A neighbour's balcony slab: 3 m to 3.2 m above ground, 4 m away. It takes
    // a slice out of the view and leaves the sky above it alone. Treating it as
    // a horizon would black out everything below it as well.
    const elevated = block({ x: 0, y: 4000, width: 20000, depth: 1500, top: 3200, base: 3000 });
    const mask = buildObstructionHorizon({ ...WINDOW, masses: [elevated] });

    // The slab spans 3.0-3.2 m over 4.0-5.5 m out, so from 1.5 m up it hides
    // altitudes between atan(1.5/5.5) = 15.3° and atan(1.7/4.0) = 23.0°, and
    // nothing else.
    const at = (altitudeDeg) => ({ x: 0, y: Math.cos(altitudeDeg * DEG), z: Math.sin(altitudeDeg * DEG) });
    expect(seesSky(mask, at(20))).toBe(false); // through the slab
    expect(seesSky(mask, at(30))).toBe(true); // over it
    expect(seesSky(mask, at(10))).toBe(true); // under it
  });
});

describe('what must never count as an obstruction', () => {
  it('ignores the wall the window is set in', () => {
    // The merged floor massing runs straight through the window: a 200 mm band
    // along y = 0, exactly where the glass is. It is coplanar with the window,
    // so it blocks nothing — but sampled naively it subtends nearly 90°.
    const hostWall = {
      id: 'host',
      footprint: [
        { x: -20000, y: -100 },
        { x: 20000, y: -100 },
        { x: 20000, y: 100 },
        { x: -20000, y: 100 },
      ],
      holes: [],
      baseElevation: 0,
      topElevations: [3000, 3000, 3000, 3000],
      sloped: false,
    };

    const mask = buildObstructionHorizon({ ...WINDOW, masses: [hostWall] });
    expect(mask.obstructed).toBe(false);
    expect(skyAngleDeg(mask, WINDOW.outwardNormal)).toBe(90);
  });

  it('does not mistake the wall of the storey above for a canopy', () => {
    // Same band, one floor up. The window is inside its footprint and its base
    // is above the glass, which is the literal definition of an overhang — but
    // it projects nothing in front of the window, so it shades nothing.
    const wallAbove = {
      id: 'above',
      footprint: [
        { x: -20000, y: -100 },
        { x: 20000, y: -100 },
        { x: 20000, y: 100 },
        { x: -20000, y: 100 },
      ],
      holes: [],
      baseElevation: 3000,
      topElevations: [6000, 6000, 6000, 6000],
      sloped: false,
    };

    const mask = buildObstructionHorizon({ ...WINDOW, masses: [wallAbove] });
    expect(mask.overhung).toBe(false);
    expect(skyAngleDeg(mask, WINDOW.outwardNormal)).toBe(90);
  });

  it('ignores massing behind the window', () => {
    const behind = block({ x: 0, y: -30000, width: 40000, depth: 20000, top: 40000 });
    expect(buildObstructionHorizon({ ...WINDOW, masses: [behind] }).obstructed).toBe(false);
  });

  it('ignores anything lower than the window centre', () => {
    // A 1 m parapet seen from 1.5 m up is below the eye line, so it takes away
    // no sky from a horizontal working plane.
    const mask = buildObstructionHorizon({
      ...WINDOW,
      masses: [block({ x: 0, y: 4000, width: 20000, depth: 500, top: 1000 })],
    });
    expect(mask.maxAltitude).toBe(0);
  });
});

describe('an overhang above the window', () => {
  // A balcony slab one storey up, projecting 1.5 m in front of the glass and
  // reaching back over it.
  const balcony = {
    id: 'balcony',
    footprint: [
      { x: -3000, y: -200 },
      { x: 3000, y: -200 },
      { x: 3000, y: 1500 },
      { x: -3000, y: 1500 },
    ],
    holes: [],
    baseElevation: 3000,
    topElevations: [3200, 3200, 3200, 3200],
    sloped: false,
  };

  it('blocks the high angles and leaves the low ones open', () => {
    // This is the case a plain horizon cannot express. A ray escapes only if it
    // clears the balcony edge before rising the 1.5 m to its soffit, so straight
    // ahead the cut-off is atan(1500/1500) = 45°.
    const mask = buildObstructionHorizon({ ...WINDOW, masses: [balcony] });
    expect(mask.overhung).toBe(true);

    const at = (altitudeDeg) => ({ x: 0, y: Math.cos(altitudeDeg * DEG), z: Math.sin(altitudeDeg * DEG) });
    expect(seesSky(mask, at(20))).toBe(true);
    expect(seesSky(mask, at(70))).toBe(false);

    const straightAhead = mask.ceiling[Math.floor((90 / 360) * mask.bins)];
    expect(straightAhead * RAD).toBeCloseTo(45, 0);
  });

  it('takes a large bite out of the sky angle', () => {
    const mask = buildObstructionHorizon({ ...WINDOW, masses: [balcony] });
    const angle = skyAngleDeg(mask, WINDOW.outwardNormal);
    expect(angle).toBeLessThan(50);
    expect(angle).toBeGreaterThan(10);
  });

  it('matters less the shallower it is', () => {
    const shallow = {
      ...balcony,
      id: 'eave',
      footprint: [
        { x: -3000, y: -200 },
        { x: 3000, y: -200 },
        { x: 3000, y: 500 },
        { x: -3000, y: 500 },
      ],
    };
    const deep = buildObstructionHorizon({ ...WINDOW, masses: [balcony] });
    const brief = buildObstructionHorizon({ ...WINDOW, masses: [shallow] });
    expect(skyAngleDeg(brief, WINDOW.outwardNormal)).toBeGreaterThan(skyAngleDeg(deep, WINDOW.outwardNormal));
  });
});

describe('sky angle as a pure function of the mask', () => {
  it('is exactly 90 minus a uniform obstruction angle', () => {
    for (const angle of [10, 25, 40, 65]) {
      expect(skyAngleDeg(uniformMask(angle), { x: 0, y: 1 })).toBeCloseTo(90 - angle, 4);
    }
    expect(skyAngleDeg(uniformMask(0), { x: 0, y: 1 })).toBe(90);
  });

  it('does not depend on which way the window faces', () => {
    const uniform = uniformMask(30);
    const north = skyAngleDeg(uniform, { x: 0, y: -1 });
    const east = skyAngleDeg(uniform, { x: 1, y: 0 });
    const diagonal = skyAngleDeg(uniform, { x: Math.SQRT1_2, y: Math.SQRT1_2 });
    expect(north).toBeCloseTo(east, 6);
    expect(diagonal).toBeCloseTo(east, 6);
  });

  it('weights the view straight ahead more than the view along the wall', () => {
    // Same obstruction, once straight ahead and once off to the side. A vertical
    // window admits flux by the cosine of the angle off its normal, so the one
    // in front has to cost more sky.
    const ahead = uniformMask(0);
    const beside = uniformMask(0);
    ahead.obstructed = true;
    beside.obstructed = true;

    for (let bin = 0; bin < 360; bin += 1) {
      const azimuth = ((bin + 0.5) / 360) * 2 * Math.PI;
      const offNormal = Math.abs(Math.atan2(Math.sin(azimuth - Math.PI / 2), Math.cos(azimuth - Math.PI / 2))) * RAD;
      if (offNormal < 30) ahead.top[bin] = 45 * DEG;
      if (offNormal > 50 && offNormal < 110) beside.top[bin] = 45 * DEG;
    }

    expect(skyAngleDeg(ahead, { x: 0, y: 1 })).toBeLessThan(skyAngleDeg(beside, { x: 0, y: 1 }));
  });
});

describe('ray visibility', () => {
  it('passes rays above the horizon and stops those below it', () => {
    const mask = uniformMask(30);
    const at = (altitudeDeg) => ({ x: 0, y: Math.cos(altitudeDeg * DEG), z: Math.sin(altitudeDeg * DEG) });

    expect(seesSky(mask, at(45))).toBe(true);
    expect(seesSky(mask, at(15))).toBe(false);
    expect(seesSky(mask, { x: 0, y: 0, z: 1 })).toBe(true);
  });
});

describe('sampling density', () => {
  it('leaves no gaps in a long wall seen end to end', () => {
    // One very long edge. Sampled only at its corners, or stepped by the
    // distance to them, the view straight ahead would come back clear — the
    // failure this guards, and the reason the step is set from how close the
    // edge passes rather than how far its ends are.
    const wall = block({ x: 0, y: 30000, width: 200000, depth: 1000, top: 20000 });
    const mask = buildObstructionHorizon({ ...WINDOW, masses: [wall] });

    let filled = 0;
    for (let bin = 0; bin < mask.bins; bin += 1) if (mask.top[bin] > 0) filled += 1;

    // The wall spans azimuths 16.7° to 163.3°, so ~146 bins must be covered
    // with no holes between them.
    expect(filled).toBeGreaterThan(140);
    expect(HORIZON_CONSTANTS.MAX_EDGE_SAMPLES).toBeGreaterThan(16);
  });
});
