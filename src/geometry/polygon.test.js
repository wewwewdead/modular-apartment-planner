import { describe, expect, it } from 'vitest';
import { pointInPolygon, polygonArea, polygonCentroid, signedPolygonArea } from './polygon';

// A 100 x 200 axis-aligned rectangle, given clockwise in screen (y-down) coords.
const RECT_CW = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 200 },
  { x: 0, y: 200 },
];

// Same rectangle wound the other direction.
const RECT_CCW = [...RECT_CW].reverse();

describe('polygon math', () => {
  describe('signedPolygonArea', () => {
    it('returns positive area for clockwise winding in y-down space', () => {
      // Shoelace with y increasing downward makes CW loops positive.
      expect(signedPolygonArea(RECT_CW)).toBe(20000);
    });

    it('returns negative area for the reversed winding', () => {
      expect(signedPolygonArea(RECT_CCW)).toBe(-20000);
    });

    it('flips sign when winding reverses', () => {
      expect(signedPolygonArea(RECT_CW)).toBe(-signedPolygonArea(RECT_CCW));
    });

    it('computes the area of a right triangle', () => {
      const tri = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 3 },
      ];
      expect(Math.abs(signedPolygonArea(tri))).toBe(6);
    });
  });

  describe('polygonArea', () => {
    it('is always the absolute value of the signed area', () => {
      expect(polygonArea(RECT_CW)).toBe(20000);
      expect(polygonArea(RECT_CCW)).toBe(20000);
    });
  });

  describe('polygonCentroid', () => {
    it('returns the vertex average (note: NOT the area centroid)', () => {
      // polygonCentroid averages vertices, which equals the true centroid for a rectangle.
      expect(polygonCentroid(RECT_CW)).toEqual({ x: 50, y: 100 });
    });

    it('averages vertices for a triangle (vertex mean, not area centroid)', () => {
      const tri = [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 0, y: 6 },
      ];
      // True area centroid of this triangle is (2, 2); vertex mean is also (2, 2) here.
      expect(polygonCentroid(tri)).toEqual({ x: 2, y: 2 });
    });

    it('is a plain vertex mean and can differ from the area centroid when vertices are uneven', () => {
      // Extra collinear vertex on one edge biases the vertex mean.
      const poly = [
        { x: 0, y: 0 },
        { x: 50, y: 0 }, // midpoint vertex on bottom edge
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      // Vertex mean: x = (0+50+100+100+0)/5 = 50, y = (0+0+0+100+100)/5 = 40
      expect(polygonCentroid(poly)).toEqual({ x: 50, y: 40 });
    });
  });

  describe('pointInPolygon', () => {
    it('detects a point strictly inside', () => {
      expect(pointInPolygon({ x: 50, y: 100 }, RECT_CW)).toBe(true);
    });

    it('detects a point clearly outside', () => {
      expect(pointInPolygon({ x: -10, y: 100 }, RECT_CW)).toBe(false);
      expect(pointInPolygon({ x: 200, y: 100 }, RECT_CW)).toBe(false);
    });

    it('handles a concave (L-shaped) polygon', () => {
      const lShape = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 40 },
        { x: 40, y: 40 },
        { x: 40, y: 100 },
        { x: 0, y: 100 },
      ];
      // Point inside the notch region (should be OUTSIDE the L)
      expect(pointInPolygon({ x: 70, y: 70 }, lShape)).toBe(false);
      // Point inside the vertical arm
      expect(pointInPolygon({ x: 20, y: 70 }, lShape)).toBe(true);
      // Point inside the horizontal arm
      expect(pointInPolygon({ x: 70, y: 20 }, lShape)).toBe(true);
    });

    it('gives consistent results regardless of winding order', () => {
      const p = { x: 50, y: 100 };
      expect(pointInPolygon(p, RECT_CW)).toBe(pointInPolygon(p, RECT_CCW));
    });
  });
});
