import { describe, expect, it } from 'vitest';
import { formatDimensionText, getDimensionGeometry, inferDimensionSubtype, measureDistance } from './dimensionUtils';

describe('dimensionUtils', () => {
  it('infers horizontal, vertical, and aligned dimension types', () => {
    expect(inferDimensionSubtype({ x: 0, y: 0 }, { x: 100, y: 5 })).toBe('horizontal');
    expect(inferDimensionSubtype({ x: 0, y: 0 }, { x: 5, y: 100 })).toBe('vertical');
    expect(inferDimensionSubtype({ x: 0, y: 0 }, { x: 80, y: 80 })).toBe('aligned');
  });

  it('builds stable geometry for aligned dimensions', () => {
    const geometry = getDimensionGeometry({
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 100 },
      subtype: 'aligned',
      offset: 20,
    });

    expect(geometry.dimLine.x1).not.toBe(geometry.dimLine.x2);
    expect(geometry.textPoint.x).toBeTypeOf('number');
  });

  it('formats measured values in current units', () => {
    expect(measureDistance({ x: 0, y: 0 }, { x: 200, y: 0 }, 'horizontal')).toBe(200);
    expect(formatDimensionText(200, 'mm')).toBe('200 mm');
  });
});
