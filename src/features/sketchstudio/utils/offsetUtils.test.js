import { describe, expect, it } from 'vitest';
import { normalizeOffsetDistance, offsetLineEntity, offsetPolylineEntity, offsetRectEntity } from './offsetUtils';

describe('offsetUtils', () => {
  it('normalizes offset distance', () => {
    expect(normalizeOffsetDistance('-20')).toBe(20);
  });

  it('offsets lines and rectangles', () => {
    const line = { id: 'line-1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, layerId: 'default' };
    const rect = { id: 'rect-1', type: 'rect', x: 10, y: 10, width: 30, height: 20, rotation: 0, layerId: 'default' };

    expect(offsetLineEntity(line, { x: 0, y: 20 }, 10, [line])).toMatchObject({
      y1: 10,
      y2: 10,
    });
    expect(offsetRectEntity(rect, { x: 0, y: 0 }, 5, [rect])).toMatchObject({
      x: 5,
      y: 5,
      width: 40,
      height: 30,
    });
  });

  it('offsets closed polylines', () => {
    const polyline = {
      id: 'polyline-1',
      type: 'polyline',
      points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }],
      closed: true,
      layerId: 'default',
    };

    expect(offsetPolylineEntity(polyline, { x: 100, y: 100 }, 5, [polyline]).points).toHaveLength(4);
  });
});
