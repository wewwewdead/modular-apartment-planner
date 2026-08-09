/**
 * The lighting model is checked against physics, not against a screenshot.
 *
 * Air mass has published values, extinction has a known direction and a known
 * ordering between channels, and the sun/sky balance has to invert as the sun
 * sets. None of that needs a GPU, and all of it is the sort of thing that can
 * be quietly broken by a plausible-looking tweak.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  OPTICAL_DEPTH,
  REFERENCE_ALTITUDE_DEG,
  airMass,
  atmosphericTransmittance,
  diffuseFraction,
  directBeamFactor,
  exposureScale,
  illuminanceSplit,
  relativeIlluminance,
  skyIntensityScale,
  skyLuminanceFactor,
  sunColor,
} from './sunLighting';

const deg = (value) => THREE.MathUtils.degToRad(value);

describe('airMass', () => {
  it('is one atmosphere straight overhead', () => {
    expect(airMass(deg(90))).toBeCloseTo(1, 2);
  });

  it('matches the published Kasten-Young values', () => {
    // The table this model exists to reproduce.
    expect(airMass(deg(60))).toBeCloseTo(1.15, 2);
    expect(airMass(deg(30))).toBeCloseTo(2.0, 1);
    expect(airMass(deg(10))).toBeCloseTo(5.6, 1);
    expect(airMass(deg(5))).toBeCloseTo(10.3, 0);
  });

  it('stays finite at the horizon, where 1/sin would not', () => {
    // A naive 1/sin(altitude) says infinity here. With a curved atmosphere and
    // refraction the real answer is about 38, and the difference is the whole
    // reason a sunset is red rather than black.
    const horizon = airMass(deg(0));
    expect(Number.isFinite(horizon)).toBe(true);
    expect(horizon).toBeGreaterThan(30);
    expect(horizon).toBeLessThan(45);
  });

  it('grows slowly near the zenith and fast near the horizon', () => {
    expect(airMass(deg(60)) - airMass(deg(90))).toBeLessThan(0.2);
    expect(airMass(deg(5)) - airMass(deg(20))).toBeGreaterThan(5);
  });
});

describe('atmosphericTransmittance', () => {
  it('lets red through more easily than blue, at every altitude', () => {
    for (const altitude of [80, 45, 20, 8, 2]) {
      const transmittance = atmosphericTransmittance(deg(altitude));
      expect(transmittance.r, `${altitude}deg`).toBeGreaterThan(transmittance.g);
      expect(transmittance.g, `${altitude}deg`).toBeGreaterThan(transmittance.b);
    }
  });

  it('follows Beer-Lambert', () => {
    const altitude = deg(30);
    const mass = airMass(altitude);
    const transmittance = atmosphericTransmittance(altitude);
    expect(transmittance.r).toBeCloseTo(Math.exp(-OPTICAL_DEPTH.r * mass), 6);
    expect(transmittance.b).toBeCloseTo(Math.exp(-OPTICAL_DEPTH.b * mass), 6);
  });

  it('is nearly clear overhead and nearly opaque to blue at the horizon', () => {
    expect(atmosphericTransmittance(deg(90)).r).toBeGreaterThan(0.85);
    expect(atmosphericTransmittance(deg(0)).b).toBeLessThan(0.02);
  });
});

describe('sunColor', () => {
  it('is close to white overhead', () => {
    const color = sunColor(deg(85));
    expect(color.b / color.r).toBeGreaterThan(0.85);
  });

  it('reddens all the way down, and never brightens on the way', () => {
    let previous = Infinity;
    for (let altitude = 85; altitude >= 1; altitude -= 2) {
      const { r, b } = sunColor(deg(altitude));
      const blueness = b / r;
      expect(blueness).toBeLessThanOrEqual(previous + 1e-9);
      previous = blueness;
    }
    // By the time it reaches the horizon there is essentially no blue left.
    expect(sunColor(deg(1)).b).toBeLessThan(0.1);
  });

  it('keeps its brightest channel at full, so intensity is not applied twice', () => {
    for (const altitude of [80, 30, 5]) {
      const color = sunColor(deg(altitude));
      expect(Math.max(color.r, color.g, color.b)).toBeCloseTo(1, 6);
    }
  });
});

describe('directBeamFactor', () => {
  it('keeps changing above 30 degrees', () => {
    // The bug this model replaces: the old ramp saturated at 30°, so the whole
    // of a tropical working day was one flat lighting condition.
    expect(directBeamFactor(deg(75))).toBeGreaterThan(directBeamFactor(deg(45)) * 1.02);
    expect(directBeamFactor(deg(45))).toBeGreaterThan(directBeamFactor(deg(30)) * 1.02);
  });

  it('falls monotonically with the sun', () => {
    let previous = Infinity;
    for (let altitude = 90; altitude >= 0; altitude -= 1) {
      const factor = directBeamFactor(deg(altitude));
      expect(factor).toBeLessThanOrEqual(previous + 1e-9);
      previous = factor;
    }
  });

  it('is gone below the horizon', () => {
    expect(directBeamFactor(deg(0))).toBe(0);
    expect(directBeamFactor(deg(-5))).toBe(0);
  });

  it('loses most of the beam between a high sun and a low one', () => {
    expect(directBeamFactor(deg(10)) / directBeamFactor(deg(60))).toBeLessThan(0.6);
  });
});

describe('the sun and sky balance', () => {
  it('is sun-dominated at a high sun', () => {
    const { direct, diffuse } = illuminanceSplit(deg(REFERENCE_ALTITUDE_DEG));
    expect(direct).toBeGreaterThan(diffuse * 2.5);
  });

  it('inverts as the sun sets — the sky ends up doing all the work', () => {
    expect(diffuseFraction(deg(60))).toBeLessThan(0.3);
    expect(diffuseFraction(deg(10))).toBeGreaterThan(0.5);
    expect(diffuseFraction(deg(1))).toBeGreaterThan(0.9);
    expect(diffuseFraction(deg(-5))).toBe(1);
  });

  it('rises without ever going backwards', () => {
    let previous = -Infinity;
    for (let altitude = 90; altitude >= 1; altitude -= 1) {
      const fraction = diffuseFraction(deg(altitude));
      expect(fraction).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = fraction;
    }
  });
});

describe('skyIntensityScale', () => {
  it('is exactly one at the altitude it is normalised against', () => {
    expect(skyIntensityScale(REFERENCE_ALTITUDE_DEG)).toBeCloseTo(1, 6);
  });

  it('darkens into the night, never the other way', () => {
    let previous = Infinity;
    for (let altitude = 25; altitude >= -18; altitude -= 1) {
      const scale = skyIntensityScale(altitude);
      expect(scale).toBeLessThanOrEqual(previous + 1e-9);
      previous = scale;
    }
  });

  it('still lights the model after the sun has gone', () => {
    // Twilight is not darkness. The beam is finished but the sky is not.
    expect(skyIntensityScale(-4)).toBeGreaterThan(0);
    expect(skyLuminanceFactor(-4)).toBeGreaterThan(skyLuminanceFactor(-12));
  });
});

describe('exposureScale', () => {
  it('leaves a high sun alone', () => {
    expect(exposureScale(deg(REFERENCE_ALTITUDE_DEG))).toBeCloseTo(1, 2);
  });

  it('opens up as the light goes, but only partly', () => {
    const dusk = exposureScale(deg(2));
    expect(dusk).toBeGreaterThan(1.5);
    // Fully compensating would render dusk and noon identically, which throws
    // away the one thing a sun study is for.
    expect(dusk * relativeIlluminance(deg(2))).toBeLessThan(0.6);
  });

  it('never darkens the scene below its reference', () => {
    for (const altitude of [90, 60, 30, 10, 0, -10]) {
      expect(exposureScale(deg(altitude))).toBeGreaterThanOrEqual(1);
    }
  });

  it('is bounded, so a night scene cannot be amplified into noise', () => {
    expect(exposureScale(deg(-30))).toBeLessThanOrEqual(4);
  });

  it('rises monotonically as the sun falls', () => {
    let previous = -Infinity;
    for (let altitude = 90; altitude >= -12; altitude -= 1) {
      const scale = exposureScale(deg(altitude));
      expect(scale).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = scale;
    }
  });
});
