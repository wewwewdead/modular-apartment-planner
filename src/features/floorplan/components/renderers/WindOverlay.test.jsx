import { describe, expect, it } from 'vitest';
import { windRampColor } from './WindOverlay';

describe('wind overlay ramp', () => {
  it('moves from sheltered blue through reference green to accelerated red', () => {
    const sheltered = windRampColor(0.3);
    const reference = windRampColor(1);
    const accelerated = windRampColor(2.5);
    expect(sheltered[2]).toBeGreaterThan(sheltered[0]);
    expect(reference[1]).toBeGreaterThan(reference[0]);
    expect(accelerated[0]).toBeGreaterThan(accelerated[1]);
  });
});
