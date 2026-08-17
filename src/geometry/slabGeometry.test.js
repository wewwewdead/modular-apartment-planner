import { describe, expect, it } from 'vitest';
import { pointInPolygon } from './polygon';
import { offsetSlabEdge, slabArea, slabEdgeOutwardNormal } from './slabGeometry';

// A 6000 x 4000 plate, wound both ways. Slabs are traced by hand on the canvas,
// so both windings turn up in real projects and the edge push has to mean the
// same thing in each.
const CLOCKWISE = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];
const COUNTER_CLOCKWISE = [...CLOCKWISE].reverse();

function midOfEdge(points, edgeIndex) {
  const start = points[edgeIndex];
  const end = points[(edgeIndex + 1) % points.length];
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

describe('slabEdgeOutwardNormal', () => {
  it('points away from the plate for every edge, whichever way the ring winds', () => {
    for (const ring of [CLOCKWISE, COUNTER_CLOCKWISE]) {
      for (let edgeIndex = 0; edgeIndex < ring.length; edgeIndex++) {
        const normal = slabEdgeOutwardNormal(ring, edgeIndex);
        const mid = midOfEdge(ring, edgeIndex);
        const outside = { x: mid.x + normal.x * 10, y: mid.y + normal.y * 10 };
        const inside = { x: mid.x - normal.x * 10, y: mid.y - normal.y * 10 };

        expect(pointInPolygon(outside, ring)).toBe(false);
        expect(pointInPolygon(inside, ring)).toBe(true);
        expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1, 10);
      }
    }
  });

  it('has no answer for a degenerate edge or ring', () => {
    // Coincident vertices: the edge has no direction, so it has no outside.
    expect(
      slabEdgeOutwardNormal(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 1000, y: 1000 },
        ],
        0,
      ),
    ).toBeNull();
    // Collinear ring: no area to be outside of.
    expect(
      slabEdgeOutwardNormal(
        [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
          { x: 2000, y: 0 },
        ],
        0,
      ),
    ).toBeNull();
    expect(slabEdgeOutwardNormal([{ x: 0, y: 0 }], 0)).toBeNull();
    expect(slabEdgeOutwardNormal(CLOCKWISE, 4)).toBeNull();
  });
});

describe('offsetSlabEdge', () => {
  it('carries only the dragged edge and grows the plate by edge length x distance', () => {
    // The 6000-long bottom edge pushed 600 out: the classic cantilevered bay.
    const pushed = offsetSlabEdge(CLOCKWISE, 0, 600);

    expect(pushed).toHaveLength(4);
    expect(pushed[2]).toEqual(CLOCKWISE[2]);
    expect(pushed[3]).toEqual(CLOCKWISE[3]);
    expect(slabArea({ boundaryPoints: pushed })).toBeCloseTo(slabArea({ boundaryPoints: CLOCKWISE }) + 6000 * 600, 6);
  });

  it('pulls the edge back in on a negative distance, either winding', () => {
    for (const ring of [CLOCKWISE, COUNTER_CLOCKWISE]) {
      const pulled = offsetSlabEdge(ring, 0, -500);
      const edgeLength = 6000;
      expect(slabArea({ boundaryPoints: pulled })).toBeCloseTo(
        slabArea({ boundaryPoints: ring }) - edgeLength * 500,
        6,
      );
    }
  });

  it('returns null rather than a mangled ring when the edge is degenerate', () => {
    expect(
      offsetSlabEdge(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 1000, y: 1000 },
        ],
        0,
        600,
      ),
    ).toBeNull();
  });
});
