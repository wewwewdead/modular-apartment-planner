import { describe, expect, it } from 'vitest';
import { ZOOM_COMMIT_DELAY_MS, gestureTransform, panViewport, sameViewport, zoomViewportAbout } from './canvasGestures';

const limits = { min: 0.02, max: 10 };

describe('zoomViewportAbout', () => {
  it('keeps the world point under the cursor where it is', () => {
    const viewport = { zoom: 0.5, panX: 100, panY: 40 };
    const mouse = { x: 640, y: 360 };
    const worldX = (mouse.x - viewport.panX) / viewport.zoom;
    const worldY = (mouse.y - viewport.panY) / viewport.zoom;
    const next = zoomViewportAbout(viewport, 1.1, mouse.x, mouse.y, limits);
    expect(next.zoom).toBeCloseTo(0.55);
    expect(next.panX + worldX * next.zoom).toBeCloseTo(mouse.x);
    expect(next.panY + worldY * next.zoom).toBeCloseTo(mouse.y);
  });

  it('clamps to the zoom limits and hands back the same viewport when nothing changes', () => {
    const atMax = { zoom: 10, panX: 0, panY: 0 };
    expect(zoomViewportAbout(atMax, 1.1, 10, 10, limits)).toBe(atMax);
    const nearMin = { zoom: 0.021, panX: 5, panY: 5 };
    expect(zoomViewportAbout(nearMin, 1 / 1.1, 10, 10, limits).zoom).toBe(0.02);
  });

  it('composes: ten notches about one point equal one zoom by the product', () => {
    let viewport = { zoom: 0.3, panX: 20, panY: -10 };
    for (let i = 0; i < 10; i += 1) viewport = zoomViewportAbout(viewport, 1.1, 300, 200, limits);
    const direct = zoomViewportAbout({ zoom: 0.3, panX: 20, panY: -10 }, 1.1 ** 10, 300, 200, limits);
    expect(viewport.zoom).toBeCloseTo(direct.zoom, 10);
    expect(viewport.panX).toBeCloseTo(direct.panX, 6);
    expect(viewport.panY).toBeCloseTo(direct.panY, 6);
  });
});

describe('gestureTransform', () => {
  it('is empty for the committed view itself', () => {
    const viewport = { zoom: 0.4, panX: 12, panY: 34 };
    expect(gestureTransform(viewport, viewport)).toBe('');
    expect(gestureTransform(null, viewport)).toBe('');
  });

  it('is a pure translate for a pan', () => {
    const committed = { zoom: 0.4, panX: 12, panY: 34 };
    expect(gestureTransform(committed, { zoom: 0.4, panX: 72, panY: 4 })).toBe('translate(60px, -30px) scale(1)');
  });

  it('puts every world point where the pending viewport would draw it', () => {
    const committed = { zoom: 0.25, panX: 80, panY: 60 };
    const pending = zoomViewportAbout(committed, 1.1 ** 3, 500, 300, limits);
    const [, dx, dy, scale] = gestureTransform(committed, pending)
      .match(/translate\((-?[\d.e+-]+)px, (-?[\d.e+-]+)px\) scale\((-?[\d.e+-]+)\)/)
      .map(Number);
    for (const [wx, wy] of [
      [0, 0],
      [4000, 2500],
      [-1200, 9000],
    ]) {
      const laidOutX = committed.panX + wx * committed.zoom;
      const laidOutY = committed.panY + wy * committed.zoom;
      expect(laidOutX * scale + dx).toBeCloseTo(pending.panX + wx * pending.zoom, 6);
      expect(laidOutY * scale + dy).toBeCloseTo(pending.panY + wy * pending.zoom, 6);
    }
  });
});

describe('sameViewport', () => {
  it('compares number for number', () => {
    expect(sameViewport({ zoom: 1, panX: 2, panY: 3 }, { zoom: 1, panX: 2, panY: 3 })).toBe(true);
    expect(sameViewport({ zoom: 1, panX: 2, panY: 3 }, { zoom: 1, panX: 2.0000001, panY: 3 })).toBe(false);
    expect(sameViewport(null, { zoom: 1, panX: 2, panY: 3 })).toBe(false);
  });
});

it('commits a wheel burst well inside a tenth of a second', () => {
  expect(ZOOM_COMMIT_DELAY_MS).toBeGreaterThan(0);
  expect(ZOOM_COMMIT_DELAY_MS).toBeLessThanOrEqual(100);
});

describe('panViewport', () => {
  it('moves the pan by the step and keeps the zoom', () => {
    expect(panViewport({ zoom: 0.4, panX: 12, panY: 34 }, 15, -7.5)).toEqual({ zoom: 0.4, panX: 27, panY: 26.5 });
  });

  it('hands back the same viewport for a zero step', () => {
    const viewport = { zoom: 0.4, panX: 12, panY: 34 };
    expect(panViewport(viewport, 0, 0)).toBe(viewport);
  });

  it('steps sum: a pan in pieces lands where one pan by the total does', () => {
    let viewport = { zoom: 0.25, panX: 80, panY: 60 };
    const steps = [
      [15, 7.5],
      [-3, 12],
      [40.5, -2],
      [0, 0],
      [7, 7],
    ];
    for (const [dx, dy] of steps) viewport = panViewport(viewport, dx, dy);
    expect(viewport).toEqual({ zoom: 0.25, panX: 80 + 59.5, panY: 60 + 24.5 });
  });

  /*
   * The invariant the canvas is built on: during a pan, the world point under
   * the pointer stays under it whatever else happens. A wheel notch about the
   * pointer keeps it there by construction, and every later step moves the
   * pointer and the view together, so the folded view must still put the
   * grabbed point under the pointer at release.
   */
  it('a wheel notch mid-pan keeps the grabbed point under the pointer', () => {
    const start = { zoom: 0.3, panX: 100, panY: 50 };
    let pointer = { x: 700, y: 500 };
    const grabbed = { x: (pointer.x - start.panX) / start.zoom, y: (pointer.y - start.panY) / start.zoom };
    let viewport = start;
    const move = (dx, dy) => {
      pointer = { x: pointer.x + dx, y: pointer.y + dy };
      viewport = panViewport(viewport, dx, dy);
    };
    for (let i = 0; i < 4; i += 1) move(15, 7.5);
    viewport = zoomViewportAbout(viewport, 1.1, pointer.x, pointer.y, limits);
    for (let i = 0; i < 8; i += 1) move(15, 7.5);
    expect(viewport.zoom).toBeCloseTo(0.33, 10);
    expect(viewport.panX + grabbed.x * viewport.zoom).toBeCloseTo(pointer.x, 8);
    expect(viewport.panY + grabbed.y * viewport.zoom).toBeCloseTo(pointer.y, 8);
  });
});
