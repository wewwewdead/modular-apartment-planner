import { describe, expect, it } from 'vitest';
import { offsetPolygon, signedAreaX2 } from './polygonOffset';

function polygonArea(points) {
  return Math.abs(signedAreaX2(points)) / 2;
}

/**
 * For every original edge, assert the corresponding offset edge is parallel and
 * sits exactly `distance` away on the OUTWARD side. This is the core regression
 * test for the 30% undersizing bug: bisector displacement offsets each edge by
 * only distance*sin(theta/2) and fails this at non-90 corners.
 *
 * "Outward" is defined the same way offsetting defines it: the winding-based
 * edge normal (right-hand normal for CCW-in-math-coords input). Both offset
 * endpoints must project onto the original edge line at exactly `+distance`
 * along that outward normal — this is winding-agnostic and correct even for
 * reflex edges of a concave polygon, where a centroid heuristic would fail.
 */
function expectEdgeOffsets(original, offset, distance) {
  const count = original.length;
  expect(offset).toHaveLength(count);

  const winding = signedAreaX2(original) >= 0 ? 1 : -1;
  for (let i = 0; i < count; i += 1) {
    const a = original[i];
    const b = original[(i + 1) % count];
    const oa = offset[i];
    const ob = offset[(i + 1) % count];

    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const length = Math.hypot(ex, ey);
    // Outward normal for winding: right-hand normal (uy, -ux) for CCW input.
    const nx = (ey / length) * winding;
    const ny = (-ex / length) * winding;

    // Displacement of each offset endpoint projected onto the outward normal.
    const da = (oa.x - a.x) * nx + (oa.y - a.y) * ny;
    const db = (ob.x - b.x) * nx + (ob.y - b.y) * ny;

    expect(da).toBeCloseTo(distance, 6);
    expect(db).toBeCloseTo(distance, 6);
  }
}

describe('offsetPolygon', () => {
  it('expands an axis-aligned square so every edge moves out by k', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const k = 5;
    const result = offsetPolygon(square, k);

    expect(result).toEqual([
      { x: -5, y: -5 },
      { x: 105, y: -5 },
      { x: 105, y: 105 },
      { x: -5, y: 105 },
    ]);

    // Area of the expanded square is (w + 2k)(h + 2k).
    expect(polygonArea(result)).toBeCloseTo((100 + 2 * k) * (100 + 2 * k), 6);
  });

  it('offsets every 90-degree corner edge by exactly k (undersizing regression)', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const k = 0.5;
    const result = offsetPolygon(square, k);
    expectEdgeOffsets(square, result, k);

    // Total range grows by 2k (k per side), NOT the bisector's k*sqrt(2)/2.
    const xs = result.map((p) => p.x);
    const ys = result.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100 + 2 * k, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(100 + 2 * k, 6);
  });

  it('offsets a 45-degree corner edge by exactly k', () => {
    // Right triangle with a 45-deg apex; the hypotenuse is a 45-deg edge.
    const triangle = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const k = 2;
    const result = offsetPolygon(triangle, k);
    expectEdgeOffsets(triangle, result, k);
  });

  it('offsets a 135-degree corner edge by exactly k', () => {
    // Regular-ish pentagon-like shape featuring obtuse (135-deg) corners.
    const shape = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 150, y: 50 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const k = 3;
    const result = offsetPolygon(shape, k);
    expectEdgeOffsets(shape, result, k);
  });

  it('handles a concave L-shape with a valid reflex corner', () => {
    // L-shape (CCW), with one reflex (concave) vertex at (50, 50).
    const lShape = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 50 }, // reflex corner
      { x: 50, y: 100 },
      { x: 0, y: 100 },
    ];
    const k = 4;
    const result = offsetPolygon(lShape, k);
    expectEdgeOffsets(lShape, result, k);

    // Expanding a concave polygon still grows its area.
    expect(polygonArea(result)).toBeGreaterThan(polygonArea(lShape));
    // No NaN / Infinity leaked through.
    result.forEach((p) => {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    });
  });

  it('produces the same outward result for CW and CCW triangle input', () => {
    const ccw = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 },
    ];
    const cw = [...ccw].reverse();
    const k = 3;

    const ccwOffset = offsetPolygon(ccw, k);
    const cwOffset = offsetPolygon(cw, k);

    // Both must expand (area larger than original), and the resulting polygons
    // must describe the same outer boundary regardless of traversal order.
    expect(polygonArea(ccwOffset)).toBeGreaterThan(polygonArea(ccw));
    expect(polygonArea(cwOffset)).toBeGreaterThan(polygonArea(cw));
    expect(polygonArea(cwOffset)).toBeCloseTo(polygonArea(ccwOffset), 6);
    expectEdgeOffsets(ccw, ccwOffset, k);
    expectEdgeOffsets(cw, cwOffset, k);
  });

  it('skips repeated/coincident consecutive points', () => {
    const withDupes = [
      { x: 0, y: 0 },
      { x: 0, y: 0 }, // duplicate
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 100 }, // duplicate
      { x: 0, y: 100 },
    ];
    const k = 5;
    const result = offsetPolygon(withDupes, k);

    // Dedupe collapses to the clean 4-vertex square.
    expect(result).toHaveLength(4);
    expect(result).toEqual([
      { x: -5, y: -5 },
      { x: 105, y: -5 },
      { x: 105, y: 105 },
      { x: -5, y: 105 },
    ]);
  });

  it('handles a collinear midpoint on an edge', () => {
    // Point (50, 0) lies exactly on the bottom edge (collinear).
    const withCollinear = [
      { x: 0, y: 0 },
      { x: 50, y: 0 }, // collinear midpoint
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const k = 5;
    const result = offsetPolygon(withCollinear, k);

    expect(result).toHaveLength(withCollinear.length);
    result.forEach((p) => {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    });
    // Every offset vertex sits on the correct offset line for its edges.
    expectEdgeOffsets(withCollinear, result, k);
  });

  it('shrinks a square with a negative offset (inward, for holes)', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const k = -5;
    const result = offsetPolygon(square, k);

    expect(result).toEqual([
      { x: 5, y: 5 },
      { x: 95, y: 5 },
      { x: 95, y: 95 },
      { x: 5, y: 95 },
    ]);
    expect(polygonArea(result)).toBeCloseTo(90 * 90, 6);
  });

  it('returns the cleaned polygon unchanged for a zero offset', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ];
    expect(offsetPolygon(triangle, 0)).toEqual(triangle);
  });

  it('returns input unchanged when there are fewer than 3 distinct points', () => {
    expect(
      offsetPolygon(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        5,
      ),
    ).toHaveLength(2);
    expect(offsetPolygon([], 5)).toEqual([]);
  });

  it('clamps runaway miter spikes at very sharp reflex corners', () => {
    // A narrow dart producing a sharp reflex corner. With a large offset the
    // naive miter intersection would fly far away; the miter limit must clamp it.
    const dart = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 50, y: 2 }, // deep reflex notch toward the interior
    ];
    const k = 10;
    const result = offsetPolygon(dart, k);

    result.forEach((p) => {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    });

    // No vertex may be displaced more than miterLimit (4) * offset from its
    // original position.
    for (let i = 0; i < dart.length; i += 1) {
      const moved = Math.hypot(result[i].x - dart[i].x, result[i].y - dart[i].y);
      expect(moved).toBeLessThanOrEqual(4 * k + 1e-6);
    }
  });
});
