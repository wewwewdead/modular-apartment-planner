import { describe, expect, it } from 'vitest';
import { intersectionArea, subtractPolygons, unionRegions } from './polygonBoolean';

const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe('intersectionArea', () => {
  it('computes overlap of two rectangles', () => {
    expect(intersectionArea(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBeCloseTo(25, 6);
  });

  it('returns 0 for disjoint polygons', () => {
    expect(intersectionArea(rect(0, 0, 10, 10), rect(100, 100, 10, 10))).toBe(0);
  });

  it('returns 0 for edge-only contact', () => {
    expect(intersectionArea(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBeCloseTo(0, 6);
  });

  it('handles concave (L-shaped) polygons correctly', () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    // Rect covering the L's notch quadrant only overlaps where the L exists.
    expect(intersectionArea(lShape, rect(10, 10, 10, 10))).toBeCloseTo(0, 6);
    // Rect over the left arm.
    expect(intersectionArea(lShape, rect(0, 0, 10, 20))).toBeCloseTo(200, 6);
  });

  it('returns full inner area for containment', () => {
    expect(intersectionArea(rect(0, 0, 100, 100), rect(20, 20, 10, 10))).toBeCloseTo(100, 6);
  });

  it('is safe on degenerate inputs', () => {
    expect(intersectionArea([], rect(0, 0, 10, 10))).toBe(0);
    expect(
      intersectionArea(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        rect(0, 0, 10, 10),
      ),
    ).toBe(0);
  });
});

describe('subtractPolygons', () => {
  it('returns a manufacturing region with a hole for a contained cut', () => {
    const result = subtractPolygons(rect(0, 0, 100, 100), [rect(20, 20, 30, 40)]);

    expect(result).toHaveLength(1);
    expect(result[0].outline).toHaveLength(4);
    expect(result[0].holes).toHaveLength(1);
    expect(result[0].holes[0]).toHaveLength(4);
  });
});

describe('unionRegions', () => {
  it('preserves a courtyard hole when merging regions', () => {
    const ring = { outline: rect(0, 0, 100, 100), holes: [rect(20, 20, 60, 60)] };
    const detached = { outline: rect(200, 0, 20, 20), holes: [] };
    const result = unionRegions([ring, detached]);

    expect(result).toHaveLength(2);
    expect(result.find((region) => region.holes.length)?.holes).toHaveLength(1);
  });
});
