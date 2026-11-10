import { describe, expect, it } from 'vitest';
import { isSameSunState } from './sunStateEquality';

const sun = (overrides = {}) => ({ enabled: true, altitude: 0.6, azimuth: 2.1, northAngle: 0, ...overrides });

describe('isSameSunState', () => {
  it('treats a fresh but equal vector as the same sun', () => {
    expect(isSameSunState(sun(), sun())).toBe(true);
    expect(isSameSunState(null, null)).toBe(true);
    expect(isSameSunState(undefined, null)).toBe(false);
  });

  it('sees every field that moves the light', () => {
    expect(isSameSunState(sun(), sun({ azimuth: 2.11 }))).toBe(false);
    expect(isSameSunState(sun(), sun({ altitude: -0.1 }))).toBe(false);
    expect(isSameSunState(sun(), sun({ northAngle: 15 }))).toBe(false);
    expect(isSameSunState(sun(), sun({ enabled: false }))).toBe(false);
    expect(isSameSunState(sun(), null)).toBe(false);
    expect(isSameSunState(sun(), { ...sun(), extra: 1 })).toBe(false);
  });
});
