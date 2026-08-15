import { describe, expect, it } from 'vitest';
import { canvasPixelRatio, refinePixelRatio, refineSupersample } from './previewResolution';

/**
 * The whole point of these three numbers is the *relationship* between them:
 * the canvas may never exceed what the display can show, the refine resolution
 * may never be lower than the canvas, and on the desktop shell the refine
 * resolution has to be a whole multiple of the canvas or the present blit stops
 * being an exact box filter.
 */
describe('preview resolution policy', () => {
  it('never asks the canvas for more pixels than the display has', () => {
    expect(canvasPixelRatio(1)).toBe(1);
    expect(canvasPixelRatio(1.25)).toBe(1.25);
    expect(canvasPixelRatio(1.5)).toBe(1.5);
  });

  it('caps the canvas at 2x on absurd device ratios', () => {
    expect(canvasPixelRatio(3)).toBe(2);
    expect(canvasPixelRatio(4)).toBe(2);
  });

  it('falls back to 1 for a missing device ratio', () => {
    expect(canvasPixelRatio(0)).toBe(1);
    expect(canvasPixelRatio(undefined)).toBe(1);
  });

  it('supersamples the settled image by exactly 2 on a desktop 1.25x panel', () => {
    // Exactly 2, not 1.99: a canvas pixel then sits precisely between four
    // texels and a bilinear tap averages them evenly.
    expect(refineSupersample(1.25, true)).toBe(2);
    expect(refinePixelRatio(1.25, true)).toBe(2.5);
  });

  it('keeps the desktop refine ratio capped at 3', () => {
    expect(refinePixelRatio(2, true)).toBe(3);
    expect(refinePixelRatio(3, true)).toBe(3);
  });

  it('never renders the settled image below canvas resolution', () => {
    for (const ratio of [1, 1.25, 1.5, 2, 2.5, 3, 4]) {
      expect(refineSupersample(ratio, true)).toBeGreaterThanOrEqual(1);
      expect(refineSupersample(ratio, false)).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not supersample in a browser tab', () => {
    // A tab is sharing an unknown GPU; the accumulation's own jitter is the
    // antialiasing there.
    expect(refineSupersample(1.25, false)).toBe(1);
    expect(refineSupersample(2, false)).toBe(1);
    expect(refinePixelRatio(1.25, false)).toBe(canvasPixelRatio(1.25));
  });
});
