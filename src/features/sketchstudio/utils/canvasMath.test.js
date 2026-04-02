import { describe, expect, it } from 'vitest';
import { clampZoom, getNextZoom, screenToWorld, worldToScreen, zoomAtPoint } from './canvasMath';

describe('canvasMath', () => {
  it('converts between screen and world coordinates', () => {
    const viewport = { zoom: 2, panX: 40, panY: -20 };
    const worldPoint = screenToWorld({ x: 140, y: 80 }, viewport);

    expect(worldPoint).toEqual({ x: 50, y: 50 });
    expect(worldToScreen(worldPoint, viewport)).toEqual({ x: 140, y: 80 });
  });

  it('keeps the cursor world point stable while zooming', () => {
    const viewport = { zoom: 1, panX: 0, panY: 0 };
    const screenPoint = { x: 200, y: 120 };
    const nextViewport = zoomAtPoint(viewport, screenPoint, 2);

    expect(screenToWorld(screenPoint, nextViewport)).toEqual({ x: 200, y: 120 });
  });

  it('clamps zoom updates to configured bounds', () => {
    expect(clampZoom(500)).toBe(200);
    expect(clampZoom(0.001)).toBe(0.002);
    expect(getNextZoom(200, -1000)).toBe(200);
    expect(getNextZoom(0.002, 1000)).toBe(0.002);
  });
});
