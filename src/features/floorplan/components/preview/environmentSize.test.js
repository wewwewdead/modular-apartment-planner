/* @vitest-environment jsdom */
/**
 * The sky and the studio must prefilter at one size: a material's program
 * carries the environment's cube-UV size in its identity, so a sky that
 * prefiltered smaller re-linked every lit material the moment the sun study
 * started (docs/night-section-freezes.md §2.3). three sizes an
 * equirectangular prefilter at `image.width / 4`.
 */
import { describe, expect, it } from 'vitest';
import { createSunSky } from './createSunSky';
import { ENVIRONMENT_PREFILTER_SIZE, SKY_CANVAS_HEIGHT, SKY_CANVAS_WIDTH } from './environmentSize';

describe('environment prefilter size', () => {
  it('sizes the sky canvas so three prefilters it at the studio size', () => {
    expect(SKY_CANVAS_WIDTH / 4).toBe(ENVIRONMENT_PREFILTER_SIZE);
    expect(SKY_CANVAS_WIDTH).toBe(SKY_CANVAS_HEIGHT * 2);
  });

  it('paints the actual sky canvas at that size on every platform', () => {
    const sky = createSunSky();
    const image = sky.getSkyTexture()?.image;
    expect(image).toBeTruthy();
    expect(image.width / 4).toBe(ENVIRONMENT_PREFILTER_SIZE);
    expect(image.height).toBe(image.width / 2);
    sky.dispose();
  });

  it('is a power of two, as the PMREM generator rounds to one', () => {
    expect(2 ** Math.floor(Math.log2(ENVIRONMENT_PREFILTER_SIZE))).toBe(ENVIRONMENT_PREFILTER_SIZE);
  });
});
