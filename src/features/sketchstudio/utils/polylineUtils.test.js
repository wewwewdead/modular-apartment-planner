import { describe, expect, it } from 'vitest';
import { appendPolylineVertex, getPolylineBoundingBox, getPolylineSegments, removeLastPolylineVertex } from './polylineUtils';

describe('polylineUtils', () => {
  it('appends and removes polyline vertices', () => {
    const points = appendPolylineVertex([{ x: 0, y: 0 }], { x: 50, y: 50 });
    expect(points).toHaveLength(2);
    expect(removeLastPolylineVertex(points)).toEqual([{ x: 0, y: 0 }]);
  });

  it('extracts polyline segments and bounding boxes', () => {
    const polyline = {
      type: 'polyline',
      points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 60 }],
      closed: false,
    };

    expect(getPolylineSegments(polyline)).toHaveLength(2);
    expect(getPolylineBoundingBox(polyline)).toMatchObject({
      minX: 0,
      minY: 0,
      maxX: 40,
      maxY: 60,
    });
  });
});
