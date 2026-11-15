import { describe, expect, it } from 'vitest';
import { wallFinishDrawingTint } from '@/domain/wallFinishes';
import {
  FASTENER_HALO_GAP_PX,
  FASTENER_SYMBOL_MIN_RADIUS_PX,
  TONAL_RING_CONTRAST,
  contrastRatio,
  fastenerHaloRadius,
  fastenerSymbolRadius,
  tonalFastenerInk,
} from './fastenerSymbol';

describe('the screw symbol on the wall elevation (docs/wall-fastener-visibility.md §2.3)', () => {
  it('is never smaller than a 6 px dot', () => {
    // A 3.7 m wall fitted into ~900 px: about 4 mm per pixel.
    const unitPx = 4.1;
    const radius = fastenerSymbolRadius(8, unitPx);
    expect(radius).toBeCloseTo(FASTENER_SYMBOL_MIN_RADIUS_PX * unitPx, 9);
    expect((2 * radius) / unitPx).toBeCloseTo(6, 9);
  });

  it('is true size once zoomed in past that', () => {
    // 0.5 mm per pixel: a 4 mm head radius is 8 px, more than the 3 px floor.
    expect(fastenerSymbolRadius(8, 0.5)).toBe(4);
    expect(fastenerSymbolRadius(12, 0.25)).toBe(6);
  });

  it('no longer scales its floor with the size of the wall', () => {
    // The old floor was min(length, height) / 600 — 5 mm here, whatever the zoom.
    expect(fastenerSymbolRadius(8, 0.1)).toBe(4);
  });

  it('puts the halo a fixed 7 px outside the head', () => {
    const unitPx = 3;
    const radius = fastenerSymbolRadius(8, unitPx);
    expect(fastenerHaloRadius(radius, unitPx) - radius).toBe(FASTENER_HALO_GAP_PX * unitPx);
  });

  it('survives a scale it cannot read', () => {
    expect(fastenerSymbolRadius(8, undefined)).toBe(4);
    expect(fastenerSymbolRadius(8, Number.NaN)).toBe(4);
    expect(fastenerHaloRadius(4, 0)).toBe(4);
  });
});

describe('the tonal head ink', () => {
  // The stock board fills the editor draws (`faceColor`), and finished faces as
  // drawn: the finish knocked back towards the paper (`wallFinishDrawingTint`).
  const BOARDS = {
    fibreCement: '#dedbd1',
    plywood: '#c9975d',
    gypsum: '#d3d7da',
    rainscreen: '#dcc0ac',
    charcoalFinish: wallFinishDrawingTint('#2F3338'),
    blackFinish: wallFinishDrawingTint('#000000'),
    orangeFinish: wallFinishDrawingTint('#E0701F'),
  };

  it('is filled with the colour the board is drawn in', () => {
    for (const [name, fill] of Object.entries(BOARDS)) {
      expect(tonalFastenerInk(fill).fill, name).toBe(fill.toLowerCase());
    }
  });

  it('rings every board at 3 : 1 or better', () => {
    for (const [name, fill] of Object.entries(BOARDS)) {
      expect(contrastRatio(tonalFastenerInk(fill).stroke, fill), name).toBeGreaterThanOrEqual(TONAL_RING_CONTRAST);
    }
  });

  it('stays quiet: no harder than it has to be on a light board', () => {
    expect(contrastRatio(tonalFastenerInk(BOARDS.fibreCement).stroke, BOARDS.fibreCement)).toBeLessThan(3.3);
  });

  it('derives the ring direction from the board: dark on a light board, light on a dark one', () => {
    const lightRing = tonalFastenerInk('#2f3338').stroke;
    expect(contrastRatio(lightRing, '#2f3338')).toBeGreaterThanOrEqual(TONAL_RING_CONTRAST);
    expect(contrastRatio(lightRing, '#ffffff')).toBeLessThan(contrastRatio('#2f3338', '#ffffff'));
    const darkRing = tonalFastenerInk(BOARDS.fibreCement).stroke;
    expect(contrastRatio(darkRing, '#000000')).toBeLessThan(contrastRatio(BOARDS.fibreCement, '#000000'));
    // Same hue family as the board, not one grey for all: plywood's ring is warm.
    const plyRing = tonalFastenerInk(BOARDS.plywood).stroke;
    const [r, , b] = [1, 3, 5].map((index) => parseInt(plyRing.slice(index, index + 2), 16));
    expect(r).toBeGreaterThan(b);
  });

  it('falls back to a neutral ink for a fill it cannot read', () => {
    const ink = tonalFastenerInk('not a colour');
    expect(contrastRatio(ink.stroke, ink.fill)).toBeGreaterThanOrEqual(TONAL_RING_CONTRAST);
  });
});
