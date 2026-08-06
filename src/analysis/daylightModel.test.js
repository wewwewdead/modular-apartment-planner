import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REFLECTANCES,
  OVERCAST_HORIZONTAL_FACTOR,
  averageDaylightFactorPercent,
  averageReflectance,
  daylightFactorToLux,
  daylightTargetFor,
  internallyReflectedComponentPercent,
  ircCoefficient,
  limitingDepthRatio,
  overcastRelativeLuminance,
  resolveGlazing,
  roomSurfaces,
  splitReflectances,
} from './daylightModel';

/**
 * Brute-force integration of the CIE overcast sky over the upper hemisphere,
 * weighting each direction by `weight`. Deliberately dumb: it shares no code
 * with the analytic results it is checking, which is the only way a closed form
 * gets a genuine test.
 */
function integrateSky(weight, steps = 400) {
  let total = 0;
  for (let i = 0; i < steps; i += 1) {
    const theta = ((i + 0.5) / steps) * (Math.PI / 2);
    const luminance = overcastRelativeLuminance(theta);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    for (let j = 0; j < steps; j += 1) {
      const phi = ((j + 0.5) / steps) * 2 * Math.PI;
      const direction = { x: sinTheta * Math.cos(phi), y: sinTheta * Math.sin(phi), z: cosTheta };
      const w = weight(direction);
      if (w <= 0) continue;
      total += luminance * w * sinTheta;
    }
  }
  return total * (Math.PI / 2 / steps) * ((2 * Math.PI) / steps);
}

describe('CIE standard overcast sky', () => {
  it('is three times brighter at the zenith than at the horizon', () => {
    expect(overcastRelativeLuminance(0)).toBeCloseTo(1, 10);
    expect(overcastRelativeLuminance(Math.PI / 2)).toBeCloseTo(1 / 3, 10);
    // No azimuthal term at all — this is why a daylight factor does not depend
    // on which way the building faces.
    expect(overcastRelativeLuminance(Math.PI / 4)).toBeCloseTo((1 + 2 * Math.cos(Math.PI / 4)) / 3, 10);
  });

  it('delivers 7π/9 × zenith luminance to an unobstructed horizontal plane', () => {
    expect(OVERCAST_HORIZONTAL_FACTOR).toBeCloseTo(2.443461, 5);
    expect(integrateSky((direction) => direction.z)).toBeCloseTo(OVERCAST_HORIZONTAL_FACTOR, 3);
  });

  it('gives an unobstructed vertical wall the textbook 39.6% vertical sky component', () => {
    // The number every BRE daylight assessment starts from: a vertical plane
    // with a clear horizon sees 39.6% of the horizontal illuminance. If the sky
    // model were wrong, this would not land on the published value.
    const vertical = integrateSky((direction) => direction.x);
    expect(vertical / OVERCAST_HORIZONTAL_FACTOR).toBeCloseTo(0.3962, 3);
  });
});

describe('BRE average daylight factor', () => {
  // The worked example every daylight primer uses: a 4 × 5 m room, 2.5 m high,
  // mean reflectance 0.5, with 2 m² of clear glazing and a clear horizon.
  const textbook = {
    glazingAreaM2: 2,
    efficiency: 0.7,
    skyAngleDeg: 90,
    totalSurfaceAreaM2: 85,
    averageReflectance: 0.5,
  };

  it('reproduces the published worked example', () => {
    // T·A·θ/(A_total(1−R²)) = 0.7×2×90/(85×0.75) = 1.976
    expect(averageDaylightFactorPercent(textbook)).toBeCloseTo(1.976, 3);
  });

  it('confirms the rule of thumb that glazing at a tenth of the floor gives ~2%', () => {
    // 20 m² floor, 2 m² glass. Architects carry this number in their heads, and
    // a formula that disagreed with it would be wrong.
    expect(averageDaylightFactorPercent(textbook)).toBeGreaterThan(1.5);
    expect(averageDaylightFactorPercent(textbook)).toBeLessThan(2.5);
  });

  it('scales linearly with glazing area', () => {
    const doubled = averageDaylightFactorPercent({ ...textbook, glazingAreaM2: 4 });
    expect(doubled).toBeCloseTo(averageDaylightFactorPercent(textbook) * 2, 6);
  });

  it('falls as the sky angle closes down', () => {
    const clear = averageDaylightFactorPercent(textbook);
    const obstructed = averageDaylightFactorPercent({ ...textbook, skyAngleDeg: 45 });
    expect(obstructed).toBeCloseTo(clear / 2, 6);
    expect(averageDaylightFactorPercent({ ...textbook, skyAngleDeg: 0 })).toBe(0);
  });

  it('rises with interior reflectance, because interreflection is inside the formula', () => {
    const dark = averageDaylightFactorPercent({ ...textbook, averageReflectance: 0.2 });
    const light = averageDaylightFactorPercent({ ...textbook, averageReflectance: 0.7 });
    expect(light).toBeGreaterThan(dark);
  });

  it('returns zero rather than Infinity for degenerate rooms', () => {
    expect(averageDaylightFactorPercent({ ...textbook, totalSurfaceAreaM2: 0 })).toBe(0);
    expect(averageDaylightFactorPercent({ ...textbook, glazingAreaM2: 0 })).toBe(0);
    expect(Number.isFinite(averageDaylightFactorPercent({ ...textbook, averageReflectance: 1 }))).toBe(true);
  });
});

describe('internally reflected component', () => {
  const room = {
    glazingAreaM2: 2,
    efficiency: 0.7,
    totalSurfaceAreaM2: 85,
    averageReflectance: 0.5,
    floorAndLowerWallsReflectance: 0.35,
    ceilingAndUpperWallsReflectance: 0.6,
  };

  it('follows the published C table against obstruction angle', () => {
    expect(ircCoefficient(0)).toBe(39);
    expect(ircCoefficient(30)).toBe(25);
    expect(ircCoefficient(80)).toBe(5);
    // Interpolated between the 10° steps.
    expect(ircCoefficient(15)).toBeCloseTo(33, 6);
    // Clamped outside the table rather than extrapolated into nonsense.
    expect(ircCoefficient(120)).toBe(5);
    expect(ircCoefficient(-20)).toBe(39);
  });

  it('is a modest but real share of the average daylight factor', () => {
    const irc = internallyReflectedComponentPercent({ ...room, obstructionAngleDeg: 0 });
    const average = averageDaylightFactorPercent({ ...room, skyAngleDeg: 90 });
    // Interreflection typically supplies a fifth to a half of the light in a
    // normally reflective room. Outside that band, one of the two formulas is
    // being fed the wrong units.
    expect(irc / average).toBeGreaterThan(0.15);
    expect(irc / average).toBeLessThan(0.6);
  });

  it('drops as the obstruction rises, because less flux enters to bounce', () => {
    const clear = internallyReflectedComponentPercent({ ...room, obstructionAngleDeg: 0 });
    const shaded = internallyReflectedComponentPercent({ ...room, obstructionAngleDeg: 60 });
    expect(shaded).toBeLessThan(clear);
    expect(shaded).toBeGreaterThan(0);
  });

  it('vanishes with no glazing', () => {
    expect(internallyReflectedComponentPercent({ ...room, glazingAreaM2: 0 })).toBe(0);
  });
});

describe('room surfaces and reflectance', () => {
  it('counts floor, ceiling and walls, with glazing taken out of the wall', () => {
    // 5 × 4 m room, 2.5 m high, 2.8 m² of opening.
    const surfaces = roomSurfaces({
      floorAreaMm2: 20e6,
      perimeterMm: 18000,
      heightMm: 2500,
      glazingAreaMm2: 2.8e6,
    });

    expect(surfaces.floor).toBeCloseTo(20, 6);
    expect(surfaces.ceiling).toBeCloseTo(20, 6);
    expect(surfaces.glazing).toBeCloseTo(2.8, 6);
    expect(surfaces.wall).toBeCloseTo(45 - 2.8, 6);
    // Total is the whole envelope: glazing sits inside the wall gross, not on top.
    expect(surfaces.total).toBeCloseTo(85, 6);
  });

  it('never lets glazing exceed the wall it sits in', () => {
    const surfaces = roomSurfaces({ floorAreaMm2: 20e6, perimeterMm: 18000, heightMm: 2500, glazingAreaMm2: 1e9 });
    expect(surfaces.wall).toBe(0);
    expect(surfaces.glazing).toBeCloseTo(45, 6);
  });

  it('area-weights the reflectances', () => {
    const surfaces = roomSurfaces({ floorAreaMm2: 20e6, perimeterMm: 18000, heightMm: 2500, glazingAreaMm2: 2.8e6 });
    const mean = averageReflectance(surfaces, DEFAULT_REFLECTANCES);
    const expected = (20 * 0.2 + 20 * 0.7 + 42.2 * 0.5 + 2.8 * 0.15) / 85;
    expect(mean).toBeCloseTo(expected, 6);
  });

  it('splits the room at the window mid-height for the IRC', () => {
    const surfaces = roomSurfaces({ floorAreaMm2: 20e6, perimeterMm: 18000, heightMm: 2500, glazingAreaMm2: 2.8e6 });
    const split = splitReflectances({ surfaces, windowMidHeightMm: 1600, heightMm: 2500 });

    // Below the window mid-height sits the dark floor, so the lower half is
    // always the duller of the two.
    expect(split.floorAndLowerWalls).toBeLessThan(split.ceilingAndUpperWalls);
    expect(split.floorAndLowerWalls).toBeGreaterThan(0.2);
    expect(split.ceilingAndUpperWalls).toBeLessThan(0.7);
  });
});

describe('limiting room depth', () => {
  const head = 2100;

  it('passes a shallow room lit from one side', () => {
    expect(limitingDepthRatio({ depthMm: 4000, widthMm: 5000, windowHeadHeightMm: head })).toBeLessThan(1);
  });

  it('fails a room too deep to light from a single window wall', () => {
    expect(limitingDepthRatio({ depthMm: 12000, widthMm: 5000, windowHeadHeightMm: head })).toBeGreaterThan(1);
  });

  it('gives credit for a higher window head', () => {
    const low = limitingDepthRatio({ depthMm: 8000, widthMm: 5000, windowHeadHeightMm: 1800 });
    const high = limitingDepthRatio({ depthMm: 8000, widthMm: 5000, windowHeadHeightMm: 2700 });
    expect(high).toBeLessThan(low);
  });
});

describe('settings resolution', () => {
  it('prefers the window’s own glazing over the study settings over the preset', () => {
    expect(resolveGlazing({}, {}, 'standard').transmittance).toBeCloseTo(0.68, 6);
    expect(resolveGlazing({}, { transmittance: 0.5 }, 'standard').transmittance).toBeCloseTo(0.5, 6);
    expect(resolveGlazing({ glazing: { transmittance: 0.3 } }, { transmittance: 0.5 }).transmittance).toBeCloseTo(
      0.3,
      6,
    );
  });

  it('clamps nonsense into the physical range', () => {
    const glazing = resolveGlazing({ glazing: { transmittance: 4, frameFactor: -1 } }, {});
    expect(glazing.transmittance).toBe(1);
    expect(glazing.frameFactor).toBe(0);
  });

  it('knows which space types carry a recommended level and which do not', () => {
    expect(daylightTargetFor('kitchen')).toBe(2);
    expect(daylightTargetFor('bedroom')).toBe(1);
    // A bathroom has no daylight recommendation; reporting one would be invented.
    expect(daylightTargetFor('bathroom')).toBeNull();
    expect(daylightTargetFor(null, 1.5)).toBe(1.5);
    expect(daylightTargetFor('something_unmapped', 1.5)).toBe(1.5);
  });
});

describe('illuminance conversion', () => {
  it('is a rescaling of the daylight factor and nothing more', () => {
    expect(daylightFactorToLux(2, 10000)).toBeCloseTo(200, 6);
    expect(daylightFactorToLux(2, 5000)).toBeCloseTo(100, 6);
  });
});
