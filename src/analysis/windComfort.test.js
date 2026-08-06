import { describe, expect, it } from 'vitest';
import { classifyComfortGrid, comfortCategoryIndex, weibullMixtureCdf, weibullMixtureQuantile } from './windComfort';

const rose = [{ directionDeg: 0, frequency: 1, weibullK: 2, weibullC: 2 }];

describe('wind comfort', () => {
  it('inverts a Weibull sector distribution', () => {
    const q95 = weibullMixtureQuantile([1], rose, 0.95);
    expect(q95).toBeCloseTo(2 * Math.sqrt(-Math.log(0.05)), 5);
    expect(weibullMixtureCdf(q95, [1], rose)).toBeCloseTo(0.95, 6);
  });

  it('moves into a worse category as local amplification rises', () => {
    const low = weibullMixtureQuantile([0.5], rose, 0.95);
    const high = weibullMixtureQuantile([2], rose, 0.95);
    expect(comfortCategoryIndex(low)).toBeLessThan(comfortCategoryIndex(high));
  });

  it('classifies fluid cells while excluding building cells', () => {
    const result = classifyComfortGrid({
      sectorAmplifications: Float32Array.from([1, 0, 2]),
      sectorCount: 1,
      cellCount: 3,
      obstacles: Uint8Array.from([0, 1, 0]),
      windRose: rose,
    });
    expect(result.assessedCellCount).toBe(2);
    expect(result.counts.reduce((sum, value) => sum + value, 0)).toBe(2);
    expect(result.comfortSpeed[1]).toBe(0);
    expect(result.categories[2]).toBeGreaterThan(result.categories[0]);
  });
});
