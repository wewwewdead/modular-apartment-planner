import { describe, expect, it } from 'vitest';
import {
  intersectPolygons,
  intersectionArea,
  multiPolygonArea,
  snapRing,
  subtractPolygons,
  unionRegions,
} from './polygonBoolean';
import { benchShadowPieces, benchSunCase } from './__fixtures__/benchShadowCase';

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

describe('intersectPolygons', () => {
  it('returns the overlapping region of two rectangles', () => {
    const result = intersectPolygons(rect(0, 0, 10, 10), rect(5, 5, 10, 10));

    expect(result).toHaveLength(1);
    expect(result[0].outline).toHaveLength(4);
    expect(result[0].holes).toEqual([]);
    expect(multiPolygonArea(result)).toBeCloseTo(25, 6);
  });

  it('returns an empty list for disjoint polygons', () => {
    expect(intersectPolygons(rect(0, 0, 10, 10), rect(100, 100, 10, 10))).toEqual([]);
  });

  it('returns the subject unchanged when it sits fully inside the clip', () => {
    const result = intersectPolygons(rect(20, 20, 10, 10), rect(0, 0, 100, 100));

    expect(result).toHaveLength(1);
    expect(multiPolygonArea(result)).toBeCloseTo(100, 6);
  });

  it('splits the subject into separate regions across a concave clip', () => {
    const uShape = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
      { x: 20, y: 30 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 30 },
      { x: 0, y: 30 },
    ];
    const result = intersectPolygons(rect(0, 20, 30, 10), uShape);

    expect(result).toHaveLength(2);
    expect(multiPolygonArea(result)).toBeCloseTo(200, 6);
  });

  it('is safe on degenerate inputs', () => {
    expect(intersectPolygons([], rect(0, 0, 10, 10))).toEqual([]);
    expect(intersectPolygons(rect(0, 0, 10, 10), null)).toEqual([]);
    expect(
      intersectPolygons(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        rect(0, 0, 10, 10),
      ),
    ).toEqual([]);
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

describe('snapRing', () => {
  it('rounds to the millimetre grid and merges the points the snap makes identical', () => {
    const ring = [
      { x: 0.2, y: -0.4 },
      { x: 0.4, y: 0.3 }, // snaps onto the first point
      { x: 10.49, y: 0 },
      { x: 10.2, y: 9.6 },
      { x: -0.3, y: 10.1 },
      { x: 0.1, y: 0.1 }, // a closing duplicate of the first
    ];

    expect(snapRing(ring)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it('snaps to a coarser grid when asked', () => {
    expect(snapRing(rect(1.1, 1.1, 3.2, 3.2), 2)).toEqual([
      { x: 2, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 4 },
      { x: 2, y: 4 },
    ]);
  });

  it('drops a ring the snap leaves with fewer than three points', () => {
    expect(snapRing(rect(0.1, 0.1, 0.2, 0.2))).toEqual([]);
    expect(snapRing(rect(0, 0, 10, 0.3))).toEqual([]);
  });
});

describe('unionRegions never hands back the unmerged set', () => {
  it('merges the bench shadow pieces the unsnapped union threw on (U4)', () => {
    // The 244 pieces of the bench fixture's first sample above 1° (2.2°): the
    // caps and edge quads of 11 masses, sharing edges exactly. Unsnapped, the
    // pairwise union threw "Unable to find segment …" and the old catch
    // returned every piece as its own region.
    const { masses, samplesAboveOneDegree } = benchSunCase();
    const pieces = benchShadowPieces(masses, samplesAboveOneDegree[0]);
    expect(pieces.length).toBeGreaterThan(200);

    const stats = {};
    const merged = unionRegions(pieces, { stats });

    expect(merged.length).toBeLessThanOrEqual(3);
    expect(stats.appended).toBe(0);
    expect(stats.merged).toBeGreaterThan(200);
  });

  it('merges two squares that share an edge, plus the quad bridging them, to one region', () => {
    // The coincident-edge shape of a shadow: caps and the quad between them
    // share edges, here with the sub-ulp disagreement real projections carry.
    const left = rect(0, 0, 1000, 1000);
    const right = rect(1000.0000000001, 0, 1000, 1000);
    const bridge = [
      { x: 500, y: 0 },
      { x: 1499.9999999999, y: 0 },
      { x: 1500, y: 1000.0000000002 },
      { x: 500.0000000001, y: 1000 },
    ];
    const stats = {};

    const result = unionRegions(
      [left, right, bridge].map((outline) => ({ outline, holes: [] })),
      { stats },
    );

    expect(result).toHaveLength(1);
    expect(result[0].holes).toEqual([]);
    expect(multiPolygonArea(result)).toBeCloseTo(2000 * 1000, 0);
    expect(stats).toEqual({ merged: 3, appended: 0, strategy: 'single' });
  });

  it('keeps every piece when merging incrementally', () => {
    // An input the one-call union handles: the incremental route must cover
    // exactly the same ground, holes included.
    const regions = [
      { outline: rect(0, 0, 10000, 10000), holes: [rect(3000, 3000, 4000, 4000)] },
      { outline: rect(8000, 2000, 6000, 3000), holes: [] },
      { outline: rect(20000, 0, 2000, 2000), holes: [] },
      { outline: rect(-500, 9000, 3000, 3000), holes: [] },
      { outline: rect(4000, 4000, 1000, 1000), holes: [] },
    ];
    const single = {};
    const incremental = {};

    const once = unionRegions(regions, { stats: single });
    const piecewise = unionRegions(regions, { strategy: 'incremental', stats: incremental });

    expect(single.strategy).toBe('single');
    expect(incremental).toEqual({ merged: 5, appended: 0, strategy: 'incremental' });
    expect(piecewise).toHaveLength(once.length);
    expect(multiPolygonArea(piecewise)).toBeCloseTo(multiPolygonArea(once), 0);
    expect(piecewise.reduce((count, region) => count + region.holes.length, 0)).toBe(
      once.reduce((count, region) => count + region.holes.length, 0),
    );
  });

  it('keeps its one-argument signature and an unchanged result for simple input', () => {
    const result = unionRegions([
      { outline: rect(0, 0, 10, 10), holes: [] },
      { outline: rect(5, 0, 10, 10), holes: [] },
    ]);

    expect(result).toHaveLength(1);
    expect(multiPolygonArea(result)).toBeCloseTo(150, 6);
  });
});
