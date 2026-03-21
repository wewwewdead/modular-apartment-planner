import { describe, expect, it } from 'vitest';
import {
  applyIsometricOrthoPoint,
  buildIsometricEllipse,
  buildIsometricPlaneRectangle,
  getIsometricGridData,
} from './isometricUtils';

describe('isometricUtils', () => {
  it('constrains points to the nearest isometric axis', () => {
    const constrained = applyIsometricOrthoPoint({ x: 0, y: 0 }, { x: 120, y: 20 });

    expect(constrained.x).toBeCloseTo(98.7, 1);
    expect(constrained.y).toBeCloseTo(57, 1);
  });

  it('builds plane-aligned isometric rectangles', () => {
    const shape = buildIsometricPlaneRectangle({ x: 0, y: 0 }, { x: 100, y: 60 }, 'top');

    expect(shape.points).toHaveLength(4);
    expect(shape.width).toBeGreaterThan(0);
    expect(shape.height).toBeGreaterThan(0);
  });

  it('builds ellipses for projected circles', () => {
    const ellipse = buildIsometricEllipse({ x: 0, y: 0 }, { x: 50, y: 0 }, 'left');

    expect(ellipse.rx).toBeGreaterThan(ellipse.ry);
    expect(Math.abs(ellipse.rotation)).toBeGreaterThan(0);
  });

  it('builds three-family isometric grid lines', () => {
    const grid = getIsometricGridData({ zoom: 1, panX: 0, panY: 0 }, { width: 800, height: 600 });

    expect(grid.isoMinor.length).toBeGreaterThan(0);
    expect(grid.isoMajor.length).toBeGreaterThan(0);
    expect(grid.axis).toHaveLength(3);
  });
});
