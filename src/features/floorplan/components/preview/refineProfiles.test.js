import { describe, expect, it } from 'vitest';
import { REFINE_PROFILES } from './createProgressiveRenderer';

/**
 * The two settings that make a walk-mode refine cheap, asserted rather than
 * assumed. Both were reported as freezes before they existed: a resolution
 * change in both directions every time the walker stopped, and a 4096² shadow
 * map re-rendered once per accumulated sample.
 */
describe('REFINE_PROFILES', () => {
  it('refines a walk at the interactive resolution, so the gear change is a no-op', () => {
    expect(REFINE_PROFILES.walk.supersample).toBe(1);
  });

  it('holds the sun at the disc centre while walking, so the shadow map is cached', () => {
    expect(REFINE_PROFILES.walk.jitterSunDisc).toBe(false);
  });

  it('gives a walk a sample budget short enough to be interrupted', () => {
    expect(REFINE_PROFILES.walk.maxSamples).toBeGreaterThan(4);
    expect(REFINE_PROFILES.walk.maxSamples).toBeLessThan(32);
  });

  it('leaves inspect mode with the quality it shipped with', () => {
    expect(REFINE_PROFILES.inspect.jitterSunDisc).toBe(true);
    expect(REFINE_PROFILES.inspect.maxSamples).toBe(Infinity);
    // Browser build: one canvas pixel per rendered pixel. The desktop shell's 2×
    // comes from `refineSupersample` and is covered by previewResolution.test.
    expect(REFINE_PROFILES.inspect.supersample).toBe(1);
  });
});
