import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CP_CORRELATION,
  correlationCp,
  incidenceFromFlow,
  isPlausibleCp,
  normalizeIncidenceDeg,
} from './cpCorrelation';

/**
 * Committed static data, evaluated offline from the published expression — see
 * `__fixtures__/cpReference/README.md`. The module under test never wrote it,
 * so agreement here is a real check of the transcription and not a tautology.
 */
const REFERENCE = JSON.parse(
  readFileSync(fileURLToPath(new URL('./__fixtures__/cpReference/swamiChandraLowRise.json', import.meta.url)), 'utf8'),
);

describe('Swami-Chandra correlation', () => {
  it('reproduces the committed incidence sweep for all three side ratios', () => {
    for (const entry of REFERENCE.incidenceSweep) {
      const cases = [
        ['squarePlan', REFERENCE.sideRatios.squarePlan],
        ['longFacade', REFERENCE.sideRatios.longFacade],
        ['shortFacade', REFERENCE.sideRatios.shortFacade],
      ];
      for (const [key, sideRatio] of cases) {
        const label = `${key} at ${entry.incidenceDeg} deg`;
        // The fixture is rounded to 6 decimals; nothing looser is needed.
        expect(correlationCp({ incidenceDeg: entry.incidenceDeg, sideRatio }), label).toBeCloseTo(entry[key], 6);
      }
    }
    expect(REFERENCE.incidenceSweep).toHaveLength(8);
  });

  it('reproduces every facade of the committed 8-wind-angle table', () => {
    expect(REFERENCE.windAngles).toHaveLength(8);
    for (const angle of REFERENCE.windAngles) {
      expect(angle.facades, `dir ${angle.directionDeg}`).toHaveLength(4);
      for (const facade of angle.facades) {
        expect(
          correlationCp({ incidenceDeg: facade.incidenceDeg, sideRatio: facade.sideRatio }),
          `dir ${angle.directionDeg} ${facade.id}`,
        ).toBeCloseTo(facade.cp, 6);
      }
    }
  });

  it('puts the published landmark values where the correlation says they are', () => {
    // Normal incidence is the fit's own normalisation point. The bracket there
    // is 2.734, not e, so the answer is 0.6034 rather than exactly 0.6.
    expect(correlationCp({ incidenceDeg: 0, sideRatio: 1 })).toBeCloseTo(0.603459, 6);
    expect(CP_CORRELATION.CP_NORMAL_INCIDENCE).toBe(0.6);
    // A square plan drops the side-ratio term entirely (G = ln 1 = 0).
    expect(correlationCp({ incidenceDeg: 90, sideRatio: 1 })).toBeCloseTo(-0.442675, 6);
    expect(correlationCp({ incidenceDeg: 180, sideRatio: 1 })).toBeCloseTo(-0.364182, 6);
  });

  it('is monotonically falling from normal incidence to the side wall', () => {
    let previous = Infinity;
    for (let incidenceDeg = 0; incidenceDeg <= 90; incidenceDeg += 5) {
      const value = correlationCp({ incidenceDeg, sideRatio: 1 });
      expect(value, `${incidenceDeg} deg`).toBeLessThan(previous);
      previous = value;
    }
  });

  it('puts its deepest suction near 110 degrees, not on the leeward wall', () => {
    // Physically real and worth pinning: for a surface AVERAGE the strongest
    // suction sits on the wall the flow separates over, and the fully leeward
    // wall recovers. Any test that assumes windward > side > leeward is wrong
    // about this correlation.
    const samples = [];
    for (let incidenceDeg = 0; incidenceDeg <= 180; incidenceDeg += 2.5) {
      samples.push({ incidenceDeg, cp: correlationCp({ incidenceDeg, sideRatio: 1 }) });
    }
    const deepest = samples.reduce((best, entry) => (entry.cp < best.cp ? entry : best));
    expect(deepest.incidenceDeg).toBeGreaterThan(100);
    expect(deepest.incidenceDeg).toBeLessThan(120);
    expect(correlationCp({ incidenceDeg: 180, sideRatio: 1 })).toBeGreaterThan(deepest.cp);
  });

  it('applies the side ratio only away from normal incidence', () => {
    // Every side-ratio term carries a sin(a/2) or sin(2aG) factor, so all plans
    // agree exactly at a = 0 and separate as the wind swings round.
    expect(correlationCp({ incidenceDeg: 0, sideRatio: 1.5 })).toBe(correlationCp({ incidenceDeg: 0, sideRatio: 0.4 }));
    expect(correlationCp({ incidenceDeg: 90, sideRatio: 1.5 })).toBeGreaterThan(
      correlationCp({ incidenceDeg: 90, sideRatio: 1 }),
    );
    expect(correlationCp({ incidenceDeg: 90, sideRatio: 2 / 3 })).toBeLessThan(
      correlationCp({ incidenceDeg: 90, sideRatio: 1 }),
    );
  });

  it('folds any incidence onto the 0..180 range the fit is defined on', () => {
    expect(normalizeIncidenceDeg(200)).toBe(160);
    expect(normalizeIncidenceDeg(-45)).toBe(45);
    expect(normalizeIncidenceDeg(360 + 30)).toBe(30);
    expect(normalizeIncidenceDeg(Number.NaN)).toBe(0);
    expect(correlationCp({ incidenceDeg: 225, sideRatio: 1 })).toBeCloseTo(
      correlationCp({ incidenceDeg: 135, sideRatio: 1 }),
      12,
    );
  });

  it('defaults a missing or nonsensical side ratio to a square plan', () => {
    const square = correlationCp({ incidenceDeg: 90, sideRatio: 1 });
    expect(correlationCp({ incidenceDeg: 90 })).toBe(square);
    expect(correlationCp({ incidenceDeg: 90, sideRatio: 0 })).toBe(square);
    expect(correlationCp({ incidenceDeg: 90, sideRatio: -2 })).toBe(square);
    expect(correlationCp({ incidenceDeg: 90, sideRatio: Number.NaN })).toBe(square);
    expect(Number.isFinite(correlationCp())).toBe(true);
  });

  it('derives incidence from an outward normal and the direction air travels', () => {
    const north = { x: 0, y: -1 };
    // +y is south, so air travelling south (0, 1) hits the north facade square on.
    expect(incidenceFromFlow(north, { x: 0, y: 1 })).toBeCloseTo(0, 9);
    expect(incidenceFromFlow(north, { x: 0, y: -1 })).toBeCloseTo(180, 9);
    expect(incidenceFromFlow(north, { x: 1, y: 0 })).toBeCloseTo(90, 9);
    expect(incidenceFromFlow(north, { x: 1, y: 1 })).toBeCloseTo(45, 9);
    // Magnitudes are irrelevant; degenerate inputs read as normal incidence.
    expect(incidenceFromFlow(north, { x: 0, y: 7.5 })).toBeCloseTo(0, 9);
    expect(incidenceFromFlow(north, { x: 0, y: 0 })).toBe(0);
    expect(incidenceFromFlow(null, { x: 0, y: 1 })).toBe(0);
  });

  it('rejects only genuinely non-physical facade samples', () => {
    expect(CP_CORRELATION.CP_PLAUSIBILITY_LIMIT).toBe(3);
    // A coarse 2D slice legitimately reaches -2.6 on an accelerated side wall.
    for (const value of [0, 1, -2.6, 2.9, -3, 3]) expect(isPlausibleCp(value), `${value}`).toBe(true);
    for (const value of [3.01, -4, Number.NaN, Infinity, -Infinity, null, undefined]) {
      expect(isPlausibleCp(value), `${value}`).toBe(false);
    }
  });
});
