import { describe, expect, it } from 'vitest';
import { applyWindStudyPatch, createUniformWindRose, createWindStudyState, normalizeWindRose } from './windState';

describe('wind study state', () => {
  it('creates a normalized sixteen-sector screening rose', () => {
    const rose = createUniformWindRose();
    expect(rose).toHaveLength(16);
    expect(rose.reduce((sum, sector) => sum + sector.frequency, 0)).toBeCloseTo(1, 8);
  });

  it('normalizes user frequencies and rejects unusable Weibull sectors', () => {
    expect(
      normalizeWindRose([
        { directionDeg: 0, frequency: 3, weibullK: 2, weibullC: 5 },
        { directionDeg: 180, frequency: 1, weibullK: 1.8, weibullC: 6 },
      ]).map((sector) => sector.frequency),
    ).toEqual([0.75, 0.25]);
    expect(normalizeWindRose([{ directionDeg: 0, frequency: 1, weibullK: 0, weibullC: 5 }])).toBeNull();
  });

  it('clamps solver controls and wraps meteorological direction', () => {
    const state = createWindStudyState();
    const next = applyWindStudyPatch(state, {
      directionDeg: -22.5,
      resolution: 999,
      iterations: 1,
      relaxationTime: 0.2,
    });
    expect(next.directionDeg).toBe(337.5);
    expect(next.resolution).toBe(256);
    expect(next.iterations).toBe(100);
    expect(next.relaxationTime).toBe(0.51);
  });

  it('accepts location-backed wind climate provenance', () => {
    const state = createWindStudyState();
    const metadata = { locationKey: '10.3200|123.8900', period: '2021–2025' };
    const next = applyWindStudyPatch(state, { windRoseSource: 'site-climate', windClimate: metadata });
    expect(next.windRoseSource).toBe('site-climate');
    expect(next.windClimate).toBe(metadata);
  });
});
