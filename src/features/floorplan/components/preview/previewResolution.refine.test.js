import { describe, expect, it } from 'vitest';
import {
  REFINE_PIXEL_CAP,
  cappedRefineSupersample,
  estimateOffscreenBytes,
  multisampleCountFor,
  refineSupersample,
} from './previewResolution';

/*
 * The refine's memory: how many pixels a sample may have, how many
 * multisamples each of them gets, and what the chain costs. The relationships
 * that must hold are the point — the settled image never below the canvas,
 * never fewer coverage samples per canvas pixel than a moving frame had.
 */
describe('refine pixel cap', () => {
  it('leaves a 2560×1440 window at the usual desktop ratio untouched', () => {
    const supersample = refineSupersample(1, true);
    expect(supersample).toBe(2);
    expect(cappedRefineSupersample(supersample, 2560 * 1440)).toBe(2);
    expect(2560 * 1440 * 4).toBeLessThanOrEqual(REFINE_PIXEL_CAP);
  });

  it('stops a 4K window asking for 33 megapixels a sample', () => {
    const pixels = 3840 * 2160;
    const capped = cappedRefineSupersample(2, pixels);
    expect(capped).toBeLessThan(2);
    expect(pixels * capped * capped).toBeLessThanOrEqual(REFINE_PIXEL_CAP + 1);
    expect(pixels * capped * capped).toBeGreaterThan(REFINE_PIXEL_CAP - 1000);
  });

  it('never caps the settled image below the canvas, however big the canvas', () => {
    expect(cappedRefineSupersample(2, 8000 * 5000)).toBe(1);
    expect(cappedRefineSupersample(1.5, 7680 * 4320)).toBe(1);
  });

  it('leaves a refine at the canvas size alone', () => {
    expect(cappedRefineSupersample(1, 3840 * 2160)).toBe(1);
    expect(cappedRefineSupersample(1, 0)).toBe(1);
  });
});

describe('multisampleCountFor', () => {
  it('keeps the 8× it always had at the canvas size and below', () => {
    for (const scale of [1, 0.85, 0.7, 0.58, 0.5]) expect(multisampleCountFor(scale)).toBe(8);
  });

  it('halves it where the refine is supersampled 2× or more', () => {
    expect(multisampleCountFor(2)).toBe(4);
    expect(multisampleCountFor(3)).toBe(4);
    // Coverage per canvas pixel never falls below the moving frame's 8.
    for (const scale of [2, 2.4, 3]) expect(scale * scale * multisampleCountFor(scale)).toBeGreaterThanOrEqual(8);
  });

  it('keeps 8× for a 1.5× refine and a capped one, where fewer measured worse on the first sample', () => {
    expect(multisampleCountFor(1.5)).toBe(8);
    expect(multisampleCountFor(1.389)).toBe(8);
    expect(multisampleCountFor(1.99)).toBe(8);
  });

  it('never asks for more than the GPU offers', () => {
    expect(multisampleCountFor(1, 4)).toBe(4);
    expect(multisampleCountFor(2, 2)).toBe(2);
    expect(multisampleCountFor(2, 0)).toBe(0);
  });
});

describe('estimateOffscreenBytes', () => {
  const MB = 1024 * 1024;

  it('prices the old chain at the audit figure, ~260 bytes a rendered pixel', () => {
    const bytes = estimateOffscreenBytes({ width: 1000, height: 1000, samples: 8, plainWriteBuffer: false });
    expect(bytes / 1e6).toBe(260);
  });

  it('more than halves the refine chain of a 1440p window', () => {
    const before = estimateOffscreenBytes({ width: 5120, height: 2880, samples: 8, plainWriteBuffer: false });
    const after = estimateOffscreenBytes({ width: 5120, height: 2880, samples: 4, plainWriteBuffer: true });
    expect(before / MB).toBeGreaterThan(3600);
    expect(after / MB).toBeLessThan(1600);
  });
});
