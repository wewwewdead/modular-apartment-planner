import { describe, expect, it } from 'vitest';
import {
  pointInPolygon,
  polygonArea,
  polygonAreaCentroid,
  polygonCentroid,
  polygonSelfIntersects,
  signedPolygonArea,
} from './polygon';

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

  /**
   * The L-shape both centroid functions are compared on, in y-down coordinates:
   *
   *     (0,0) ────────────────── (60,0)
   *       │                        │
   *       │        arm A           │
   *       │                        │
   *     (0,20) ───── (20,20) ── (60,20)
   *       │            │
   *       │  arm B     │
   *       │            │
   *     (0,60) ───── (20,60)
   *
   * Hand-decomposed into two disjoint rectangles:
   *   A = x 0..60, y 0..20   area 1200, centroid (30, 10)
   *   B = x 0..20, y 20..60  area  800, centroid (10, 40)
   * Area-weighted mean:
   *   x = (1200*30 + 800*10) / 2000 = 44000 / 2000 = 22
   *   y = (1200*10 + 800*40) / 2000 = 44000 / 2000 = 22
   * so the area centroid is exactly (22, 22), while the six-vertex mean is
   * (160/6, 160/6) = (26.667, 26.667) — 6.6 units out along both axes.
   */
  const L_SHAPE = [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 20 },
    { x: 20, y: 20 },
    { x: 20, y: 60 },
    { x: 0, y: 60 },
  ];

  describe('polygonAreaCentroid', () => {
    it('lands on the analytic area centroid of an L-shape', () => {
      const centroid = polygonAreaCentroid(L_SHAPE);
      expect(centroid.x).toBeCloseTo(22, 12);
      expect(centroid.y).toBeCloseTo(22, 12);
    });

    it('differs visibly from the vertex mean on that same L-shape', () => {
      const vertexMean = polygonCentroid(L_SHAPE);
      expect(vertexMean.x).toBeCloseTo(160 / 6, 12);
      expect(vertexMean.y).toBeCloseTo(160 / 6, 12);
      expect(Math.abs(vertexMean.x - polygonAreaCentroid(L_SHAPE).x)).toBeGreaterThan(4);
      expect(Math.abs(vertexMean.y - polygonAreaCentroid(L_SHAPE).y)).toBeGreaterThan(4);
    });

    it('is independent of winding order', () => {
      expect(polygonAreaCentroid([...L_SHAPE].reverse())).toEqual(polygonAreaCentroid(L_SHAPE));
    });

    it('agrees with the vertex mean on a rectangle, where they coincide', () => {
      expect(polygonAreaCentroid(RECT_CW)).toEqual({ x: 50, y: 100 });
      expect(polygonAreaCentroid(RECT_CCW)).toEqual({ x: 50, y: 100 });
    });

    it('ignores an extra collinear vertex that biases the vertex mean', () => {
      // Same square, one redundant midpoint vertex on the bottom edge. The
      // vertex mean moves to y = 40 (pinned above); the area centroid must not.
      const withMidpoint = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const centroid = polygonAreaCentroid(withMidpoint);
      expect(centroid.x).toBeCloseTo(50, 12);
      expect(centroid.y).toBeCloseTo(50, 12);
      expect(polygonCentroid(withMidpoint)).toEqual({ x: 50, y: 40 });
    });

    it('puts a triangle centroid at the vertex mean, as the maths requires', () => {
      const tri = [
        { x: 0, y: 0 },
        { x: 9, y: 0 },
        { x: 0, y: 6 },
      ];
      const centroid = polygonAreaCentroid(tri);
      expect(centroid.x).toBeCloseTo(3, 12);
      expect(centroid.y).toBeCloseTo(2, 12);
    });

    it('is exactly rotated by the integer quarter-turn (x, y) -> (-y, x)', () => {
      // Quarter-turn rotations of a scene must be bit-identical: every cross
      // product is invariant under this map and the two coordinate sums simply
      // swap, so the centroid must rotate exactly.
      const rotated = L_SHAPE.map((point) => ({ x: -point.y, y: point.x }));
      const base = polygonAreaCentroid(L_SHAPE);
      expect(polygonAreaCentroid(rotated)).toEqual({ x: -base.y, y: base.x });
    });

    it('falls back to the vertex mean for a zero-area (collinear) ring', () => {
      const collinear = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 30, y: 30 },
      ];
      expect(polygonArea(collinear)).toBe(0);
      expect(polygonAreaCentroid(collinear)).toEqual(polygonCentroid(collinear));
    });

    it('falls back to the vertex mean for a degenerate two-point ring', () => {
      const segment = [
        { x: 4, y: 8 },
        { x: 10, y: 20 },
      ];
      expect(polygonAreaCentroid(segment)).toEqual({ x: 7, y: 14 });
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

  describe('polygonSelfIntersects', () => {
    it('passes a simple rectangle, either winding', () => {
      expect(polygonSelfIntersects(RECT_CW)).toBe(false);
      expect(polygonSelfIntersects(RECT_CCW)).toBe(false);
    });

    it('passes a triangle, whose every edge pair is adjacent', () => {
      expect(
        polygonSelfIntersects([
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 0, y: 80 },
        ]),
      ).toBe(false);
    });

    it('passes a concave L-shape', () => {
      expect(polygonSelfIntersects(L_SHAPE)).toBe(false);
    });

    it('catches a bow-tie, where two far edges cross', () => {
      // The diagonals (100,0)->(0,100) and (100,100)->(0,0) meet at (50,50).
      expect(
        polygonSelfIntersects([
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 0, y: 100 },
          { x: 100, y: 100 },
        ]),
      ).toBe(true);
    });

    it('does not count the vertex two adjacent edges share, even when they double back along each other', () => {
      // Edge 0 (0,0)->(100,0) and edge 1 (100,0)->(50,0) overlap over 50 units,
      // but they are neighbours: that is the ring being closed, not a fault.
      expect(
        polygonSelfIntersects([
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ]),
      ).toBe(false);
    });

    it('counts collinear overlap between two NON-adjacent edges', () => {
      // Flattened ring: edge 0 spans x 0..60 and edge 2 spans x 20..80, both on y = 0.
      expect(
        polygonSelfIntersects([
          { x: 0, y: 0 },
          { x: 60, y: 0 },
          { x: 20, y: 0 },
          { x: 80, y: 0 },
        ]),
      ).toBe(true);
    });

    it('catches a plate collapsed flat onto its opposite edge', () => {
      // A 6000 x 4000 slab with its top edge pushed in by exactly 4000: the two
      // long edges now lie on each other, which is a crossing by any other name.
      expect(
        polygonSelfIntersects([
          { x: 0, y: 4000 },
          { x: 6000, y: 4000 },
          { x: 6000, y: 4000 },
          { x: 0, y: 4000 },
        ]),
      ).toBe(true);
    });

    it('treats a vertex landing exactly ON a far edge as a touch, and the next step past it as a crossing', () => {
      // The ring dips down to graze the y = 0 edge at (50, 0)...
      const touching = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 50, y: 0 },
        { x: 0, y: 100 },
      ];
      expect(polygonSelfIntersects(touching)).toBe(false);

      // ...and 10 units further it has gone through.
      const crossing = touching.map((point, index) => (index === 3 ? { x: 50, y: -10 } : point));
      expect(polygonSelfIntersects(crossing)).toBe(true);
    });

    it('has nothing to report for a degenerate ring', () => {
      expect(polygonSelfIntersects([])).toBe(false);
      expect(polygonSelfIntersects([{ x: 0, y: 0 }])).toBe(false);
      expect(
        polygonSelfIntersects([
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ]),
      ).toBe(false);
    });
  });
});
