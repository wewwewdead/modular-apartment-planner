/**
 * The fade from a daylight rig to the night rig, checked at its ends.
 *
 * The middle of a crossfade is a matter of taste; its ends are not. The whole
 * reason this exists is that a study left running past dark has to arrive at the
 * night rig *exactly*, so that the fixture adaptation's identity argument holds
 * and toggling Night at midnight changes nothing. A blend that came within an
 * ulp would break that quietly.
 */

import { describe, expect, it } from 'vitest';
import { CIVIL_TWILIGHT_DEG, NAUTICAL_TWILIGHT_DEG, mixNumber, mixSrgbHex, nightfallBlend } from './twilightBlend';

describe('nightfallBlend', () => {
  it('does nothing at all while the sun is up', () => {
    for (const altitudeDeg of [90, 60, 30, 8, 0.5, 0, -1, -5.9]) {
      expect(nightfallBlend(altitudeDeg)).toBe(0);
    }
  });

  it('starts at civil twilight and finishes at nautical', () => {
    expect(CIVIL_TWILIGHT_DEG).toBe(-6);
    expect(NAUTICAL_TWILIGHT_DEG).toBe(-12);
    expect(nightfallBlend(CIVIL_TWILIGHT_DEG)).toBe(0);
    expect(nightfallBlend(NAUTICAL_TWILIGHT_DEG)).toBe(1);
  });

  it('stays finished all the way to the antisolar point', () => {
    for (const altitudeDeg of [-12, -15, -20, -45, -90]) {
      expect(nightfallBlend(altitudeDeg)).toBe(1);
    }
  });

  it('rises monotonically across the window', () => {
    const samples = [];
    for (let altitudeDeg = -6; altitudeDeg >= -12; altitudeDeg -= 0.25) {
      samples.push(nightfallBlend(altitudeDeg));
    }
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeGreaterThan(samples[index - 1]);
    }
    expect(samples.at(-1)).toBe(1);
  });

  it('is half way across at the middle of the window', () => {
    expect(nightfallBlend(-9)).toBeCloseTo(0.5, 12);
  });

  it('leaves both ends flat, so the dial shows no crease', () => {
    // Smoothstep's derivative is zero at 0 and 1: the first and last steps of
    // the fade have to be far smaller than the one in the middle, which a linear
    // ramp cannot manage.
    const step = (from, to) => Math.abs(nightfallBlend(to) - nightfallBlend(from));
    const middle = step(-9, -9.25);
    expect(step(-6, -6.25)).toBeLessThan(middle / 4);
    expect(step(-11.75, -12)).toBeLessThan(middle / 4);
  });

  it('treats an unusable altitude as daylight rather than dimming the scene', () => {
    expect(nightfallBlend(Number.NaN)).toBe(0);
    expect(nightfallBlend(undefined)).toBe(0);
    expect(nightfallBlend('dusk')).toBe(0);
  });
});

describe('mixNumber', () => {
  it('lands on its endpoints exactly, not nearly', () => {
    // 0.1 + (0.3 - 0.1) * 1 is not 0.3 in binary floating point; identity here
    // is what the night-rig comparison downstream is built on.
    expect(mixNumber(0.1, 0.3, 1)).toBe(0.3);
    expect(mixNumber(0.1, 0.3, 0)).toBe(0.1);
    // The pair the exposure blend actually runs: the sun study's clamped 4×
    // ceiling, and the night rig's own scale.
    expect(mixNumber(4, 8, 1)).toBe(8);
    expect(mixNumber(1, 0.03, 1)).toBe(0.03);
  });

  it('interpolates in between and clamps outside', () => {
    expect(mixNumber(0, 10, 0.25)).toBeCloseTo(2.5, 12);
    expect(mixNumber(0, 10, 2)).toBe(10);
    expect(mixNumber(0, 10, -1)).toBe(0);
    expect(mixNumber(0, 10, Number.NaN)).toBe(0);
  });
});

describe('mixSrgbHex', () => {
  const DAY_SKY = 0xdde7f4;
  const NIGHT_SKY = 0x1a2438;

  it('hands back the exact endpoint colours', () => {
    expect(mixSrgbHex(DAY_SKY, NIGHT_SKY, 1)).toBe(NIGHT_SKY);
    expect(mixSrgbHex(DAY_SKY, NIGHT_SKY, 0)).toBe(DAY_SKY);
    expect(mixSrgbHex(0xe6ded0, 0x0d0f14, 1)).toBe(0x0d0f14);
  });

  it('walks each channel between the two', () => {
    const middle = mixSrgbHex(0x000000, 0xffffff, 0.5);
    expect(middle).toBe(0x808080);

    const halfway = mixSrgbHex(DAY_SKY, NIGHT_SKY, 0.5);
    for (let shift = 16; shift >= 0; shift -= 8) {
      const channel = (halfway >> shift) & 0xff;
      expect(channel).toBeLessThan((DAY_SKY >> shift) & 0xff);
      expect(channel).toBeGreaterThan((NIGHT_SKY >> shift) & 0xff);
    }
  });

  it('darkens monotonically per channel as the fade runs', () => {
    let previous = 0x100;
    for (const amount of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const blue = mixSrgbHex(DAY_SKY, NIGHT_SKY, amount) & 0xff;
      expect(blue).toBeLessThanOrEqual(previous);
      previous = blue;
    }
    expect(previous).toBe(NIGHT_SKY & 0xff);
  });
});
