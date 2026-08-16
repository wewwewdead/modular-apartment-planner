/**
 * The adaptation law is checked against the rigs it has to serve, not against a
 * screenshot.
 *
 * Three things have to hold for the shipped preview to stay right: night comes
 * out at exactly one (or the calibration the night look was measured with moves
 * under it), daylight comes out high enough that the default 650 lm can is a
 * pool rather than a rounding error, and the correction is *partial* — a lamp
 * that recovered its whole night-time dominance under a noon sun would be a
 * lamp no room has ever contained.
 *
 * The rig figures below mirror the constants in `createPreviewViewport`; they
 * are restated rather than imported because that module builds a WebGL context
 * the moment it is called.
 */

import { describe, expect, it } from 'vitest';
import { fixtureLightIntensity } from '@/geometry/lightingMath';
import {
  ENVIRONMENT_IRRADIANCE_RESPONSE,
  FIXTURE_ADAPTATION_EXPONENT,
  MAX_FIXTURE_ADAPTATION,
  ambientIrradiance,
  fixtureAdaptationScale,
  srgbHexLuminance,
} from './fixtureAdaptation';
import { STUDIO_ENVIRONMENT_INTENSITY, SKY_ENVIRONMENT_INTENSITY } from './createEnvironment';
import { RENDER_STYLE_PRESETS, RENDER_STYLES } from './renderStyle';
import { mixNumber, mixSrgbHex, nightfallBlend } from './twilightBlend';

const REALISTIC = RENDER_STYLE_PRESETS[RENDER_STYLES.REALISTIC];

/** `createPreviewViewport`'s night rig. */
const NIGHT_RIG = Object.freeze({
  ambientIntensity: 0.015,
  hemisphereIntensity: 0.25,
  hemisphereSkyHex: 0x1a2438,
  fillIntensity: 0,
  environmentIntensity: REALISTIC.environmentIntensity * STUDIO_ENVIRONMENT_INTENSITY * 0.02,
});

/** Sun study running, sun high: no ambient, no hemisphere, sky map only. */
const noonRig = (skyIntensityScale = 0.974) => ({
  ambientIntensity: 0,
  hemisphereIntensity: 0,
  fillIntensity: 0,
  environmentIntensity: REALISTIC.environmentIntensity * SKY_ENVIRONMENT_INTENSITY * skyIntensityScale,
});

/** Sun study running, sun six degrees under: the sky is nearly out. */
const duskRig = () => noonRig(0.1748);

const nightAmbient = ambientIrradiance(NIGHT_RIG);

/**
 * The rig `applySun` builds for a sun study at a given altitude, once the
 * nightfall fade has been applied. Mirrors the blend in the sun-enabled branch;
 * `skyIntensityScale` is passed in because it is the sun model's business, not
 * this one's.
 */
const studyRig = (altitudeDeg, skyIntensityScale) => {
  const amount = nightfallBlend(altitudeDeg);
  return {
    ambientIntensity: mixNumber(0, NIGHT_RIG.ambientIntensity, amount),
    hemisphereIntensity: mixNumber(0, NIGHT_RIG.hemisphereIntensity, amount),
    hemisphereSkyHex: mixSrgbHex(0xdde7f4, NIGHT_RIG.hemisphereSkyHex, amount),
    fillIntensity: 0,
    environmentIntensity: mixNumber(
      REALISTIC.environmentIntensity * SKY_ENVIRONMENT_INTENSITY * skyIntensityScale,
      NIGHT_RIG.environmentIntensity,
      amount,
    ),
  };
};

describe('srgbHexLuminance', () => {
  it('is one for white and zero for black', () => {
    expect(srgbHexLuminance(0xffffff)).toBeCloseTo(1, 9);
    expect(srgbHexLuminance(0x000000)).toBe(0);
  });

  it('undoes the transfer curve rather than averaging the bytes', () => {
    // Mid sRGB grey is 21.6% of the light, not 50% — the whole reason the curve
    // has to come off before channels are weighted.
    expect(srgbHexLuminance(0x808080)).toBeCloseTo(0.2159, 3);
  });

  it('reads the night sky as very nearly dark', () => {
    expect(srgbHexLuminance(0x1a2438)).toBeLessThan(0.03);
    expect(srgbHexLuminance(0x1a2438)).toBeGreaterThan(0);
  });

  it('falls back to white rather than NaN on rubbish', () => {
    expect(srgbHexLuminance('blue')).toBe(1);
    expect(srgbHexLuminance(undefined)).toBe(1);
  });
});

describe('ambientIrradiance', () => {
  it('adds the three fills and the environment, weighting the hemisphere by its colour', () => {
    expect(
      ambientIrradiance({
        ambientIntensity: 0.08,
        hemisphereIntensity: 0.18,
        hemisphereSkyHex: 0xffffff,
        fillIntensity: 0.35,
        environmentIntensity: 0.2,
      }),
    ).toBeCloseTo(0.08 + 0.18 + 0.35 + 0.2 * ENVIRONMENT_IRRADIANCE_RESPONSE, 9);
  });

  it('has no term for the key light at all', () => {
    // The case being answered is a room the sun cannot reach; there is no
    // parameter for the beam because the beam is not in the room.
    expect(ambientIrradiance({ keyIntensity: 3.9 })).toBe(0);
    expect(ambientIrradiance()).toBe(0);
  });

  it('ignores negative and unusable intensities', () => {
    expect(ambientIrradiance({ ambientIntensity: -5, environmentIntensity: 'bright' })).toBe(0);
  });

  it('puts a sun-study interior an order of magnitude above the night rig', () => {
    // This gap *is* the bug: with no key light and no ambient, an interior under
    // a sun study still sits in open-shade daylight because image-based light is
    // not occluded, and a lamp calibrated for the night rig disappears into it.
    const ratio = ambientIrradiance(noonRig()) / nightAmbient;
    expect(ratio).toBeGreaterThan(10);
    expect(ratio).toBeLessThan(25);
  });
});

describe('fixtureAdaptationScale', () => {
  it('leaves the night rig at exactly one', () => {
    expect(fixtureAdaptationScale(nightAmbient, nightAmbient)).toBe(1);
    // Whatever the number happens to be — the guard is identity, not a tolerance.
    for (const level of [0.001, 0.0278, 1, 12.5]) {
      expect(fixtureAdaptationScale(level, level)).toBe(1);
    }
  });

  it('never dims a lamp below its calibrated output', () => {
    // Nothing in the rig is darker than night, but a below-horizon sun with the
    // sky nearly gone comes close, and a scale under one there would be
    // correcting in the wrong direction.
    expect(fixtureAdaptationScale(nightAmbient / 4, nightAmbient)).toBe(1);
    expect(fixtureAdaptationScale(0, nightAmbient)).toBe(1);
  });

  it('is defined when there is no reference to compare against', () => {
    expect(fixtureAdaptationScale(1, 0)).toBe(1);
    expect(fixtureAdaptationScale(1, Number.NaN)).toBe(1);
  });

  it('rises with the ambient, and only partially', () => {
    const ratios = [2, 5, 13, 30];
    const scales = ratios.map((ratio) => fixtureAdaptationScale(nightAmbient * ratio, nightAmbient));

    for (let index = 1; index < scales.length; index += 1) {
      expect(scales[index]).toBeGreaterThan(scales[index - 1]);
    }
    // Partial: the exponent is below one, so the correction always lags the rise
    // it is answering. Full compensation would make a downlight own a sunlit room.
    for (let index = 0; index < ratios.length; index += 1) {
      expect(scales[index]).toBeLessThan(ratios[index]);
      expect(scales[index]).toBeCloseTo(Math.min(ratios[index] ** FIXTURE_ADAPTATION_EXPONENT, 8), 9);
    }
  });

  it('stops at the point the lamp would no longer be the specified lamp', () => {
    expect(fixtureAdaptationScale(nightAmbient * 1e6, nightAmbient)).toBe(MAX_FIXTURE_ADAPTATION);
  });
});

describe('what a lamp is worth in each rig', () => {
  // The default fixture the RCP tool places: a 6" can with a BR30 flood, 650 lm
  // through a 110° beam, on a 2.7 m ceiling over a floor 2.4 m below it.
  const DEFAULT_CAN = fixtureLightIntensity(650, 110);
  const FLOOR_DISTANCE_MM = 2400;
  const poolIrradiance = (scale) => (DEFAULT_CAN * scale) / (FLOOR_DISTANCE_MM * FLOOR_DISTANCE_MM);

  it('is unchanged at night, where the calibration was measured', () => {
    const scale = fixtureAdaptationScale(nightAmbient, nightAmbient);
    expect(scale).toBe(1);
    // Seven times the room's own level: the lamp is the light in a night render,
    // which is the look this fix must not disturb.
    expect(poolIrradiance(scale) / nightAmbient).toBeGreaterThan(5);
  });

  it('goes from a fifth of the daylit room to twice it', () => {
    const ambient = ambientIrradiance(noonRig());
    const before = poolIrradiance(1) / ambient;
    const after = poolIrradiance(fixtureAdaptationScale(ambient, nightAmbient)) / ambient;

    // Reported symptom: the lens glows, the floor does not move.
    expect(before).toBeLessThan(0.5);
    // A legible pool — clearly the brightest thing on the floor, and still short
    // of the direct beam outside, which runs about 3.3 in the same units.
    expect(after).toBeGreaterThan(1.5);
    expect(poolIrradiance(fixtureAdaptationScale(ambient, nightAmbient))).toBeLessThan(3.3);
  });

  it('barely touches dusk, where the lamps already won', () => {
    const ambient = ambientIrradiance(duskRig());
    const scale = fixtureAdaptationScale(ambient, nightAmbient);

    expect(scale).toBeLessThan(2.5);
    // Below the horizon there is no beam and almost no sky, so the room reads as
    // lamp-lit either way; the correction must not turn that into a blowout.
    expect(poolIrradiance(1) / ambient).toBeGreaterThan(2);
    expect(poolIrradiance(scale) / ambient).toBeLessThan(6);
  });

  it('is exactly one below nautical twilight, because the rig IS the night rig', () => {
    // `skyPalette` clamps at −12°, so every altitude from there down shares the
    // same sky scale; the fade is finished at all of them and the identity has
    // to hold for each.
    for (const altitudeDeg of [-12, -15, -20, -40]) {
      const rig = studyRig(altitudeDeg, 0.0399);

      // Not "close to" the night rig — the same numbers, term by term. This is
      // what lets the scale be compared rather than tolerated.
      expect(rig.ambientIntensity).toBe(NIGHT_RIG.ambientIntensity);
      expect(rig.hemisphereIntensity).toBe(NIGHT_RIG.hemisphereIntensity);
      expect(rig.hemisphereSkyHex).toBe(NIGHT_RIG.hemisphereSkyHex);
      expect(rig.environmentIntensity).toBe(NIGHT_RIG.environmentIntensity);

      expect(ambientIrradiance(rig)).toBe(nightAmbient);
      expect(fixtureAdaptationScale(ambientIrradiance(rig), nightAmbient)).toBe(1);
    }
  });

  it('never dips below one on the way down to it', () => {
    // The old below-horizon rig had no floor: ambient fell under the night
    // reference and the lamps ran bare calibration into a room with nothing else
    // in it. Across the whole fade the room now converges on the night level
    // from above, so the correction only ever relaxes towards one.
    const window = [
      [-6, 0.1748],
      [-7.5, 0.128],
      [-9, 0.0927],
      [-10.5, 0.0621],
      [-12, 0.0399],
    ];
    const scales = window.map(([altitudeDeg, sky]) =>
      fixtureAdaptationScale(ambientIrradiance(studyRig(altitudeDeg, sky)), nightAmbient),
    );

    for (let index = 1; index < scales.length; index += 1) {
      expect(scales[index]).toBeLessThanOrEqual(scales[index - 1]);
      expect(scales[index]).toBeGreaterThanOrEqual(1);
    }
    expect(scales.at(-1)).toBe(1);
  });

  it('is monotonic across the day, so dragging the time dial never jumps', () => {
    const skyScales = [0.0399, 0.1748, 0.6135, 0.918, 0.974, 1.0277];
    const scales = skyScales.map((sky) => fixtureAdaptationScale(ambientIrradiance(noonRig(sky)), nightAmbient));

    for (let index = 1; index < scales.length; index += 1) {
      expect(scales[index]).toBeGreaterThanOrEqual(scales[index - 1]);
    }
  });
});
