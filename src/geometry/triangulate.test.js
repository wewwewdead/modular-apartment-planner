import { describe, expect, it } from 'vitest';
import { triangulate } from './triangulate';
import { polygonArea } from './polygon';

/** Total area of the produced triangles. */
function triangleArea({ vertices, indices }) {
  let total = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const a = vertices[indices[index]];
    const b = vertices[indices[index + 1]];
    const c = vertices[indices[index + 2]];
    total += Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  }
  return total;
}

const SQUARE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('simple polygons', () => {
  it('splits a square into two triangles covering it exactly', () => {
    const result = triangulate(SQUARE);
    expect(result.indices).toHaveLength(6);
    expect(triangleArea(result)).toBeCloseTo(10000, 6);
  });

  it('handles a concave polygon without folding over itself', () => {
    // An L. A centroid fan would put triangles outside the shape here, which is
    // the whole reason this is ear clipping and not a fan.
    const shape = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ];
    const result = triangulate(shape);
    expect(triangleArea(result)).toBeCloseTo(polygonArea(shape), 6);
    expect(result.indices.length / 3).toBe(shape.length - 2);
  });

  it('gives the same area whichever way the polygon is wound', () => {
    const clockwise = [...SQUARE].reverse();
    expect(triangleArea(triangulate(clockwise))).toBeCloseTo(10000, 6);
  });

  it('triangulates a many-sided polygon', () => {
    const circle = Array.from({ length: 24 }, (_, index) => {
      const angle = (index / 24) * Math.PI * 2;
      return { x: 500 * Math.cos(angle), y: 500 * Math.sin(angle) };
    });
    const result = triangulate(circle);
    expect(result.indices.length / 3).toBe(22);
    expect(triangleArea(result)).toBeCloseTo(polygonArea(circle), 3);
  });

  it('returns nothing for a degenerate input rather than throwing', () => {
    expect(triangulate([]).indices).toHaveLength(0);
    expect(
      triangulate([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]).indices,
    ).toHaveLength(0);
    expect(triangulate(null).indices).toHaveLength(0);
  });
});

describe('polygons with holes', () => {
  it('leaves a square hole uncovered', () => {
    // The case that matters for the building mesh: a merged floor plate is a
    // ring, and capping the courtyard would shade it as if it were roofed.
    const hole = [
      { x: 30, y: 30 },
      { x: 70, y: 30 },
      { x: 70, y: 70 },
      { x: 30, y: 70 },
    ];
    const result = triangulate(SQUARE, [hole]);
    expect(triangleArea(result)).toBeCloseTo(10000 - 1600, 4);
  });

  it('handles two holes', () => {
    const holes = [
      [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 30, y: 30 },
        { x: 10, y: 30 },
      ],
      [
        { x: 60, y: 60 },
        { x: 90, y: 60 },
        { x: 90, y: 90 },
        { x: 60, y: 90 },
      ],
    ];
    const result = triangulate(SQUARE, holes);
    expect(triangleArea(result)).toBeCloseTo(10000 - 400 - 900, 4);
  });

  it('ignores a degenerate hole', () => {
    const result = triangulate(SQUARE, [
      [
        { x: 5, y: 5 },
        { x: 6, y: 6 },
      ],
    ]);
    expect(triangleArea(result)).toBeCloseTo(10000, 4);
  });
});

describe('elevation', () => {
  it('carries z through hole bridging so a sloped cap lands at the right height', () => {
    const outline = [
      { x: 0, y: 0, z: 1000 },
      { x: 100, y: 0, z: 1000 },
      { x: 100, y: 100, z: 3000 },
      { x: 0, y: 100, z: 3000 },
    ];
    const hole = [
      { x: 30, y: 30, z: 1600 },
      { x: 70, y: 30, z: 1600 },
      { x: 70, y: 70, z: 2400 },
      { x: 30, y: 70, z: 2400 },
    ];
    const result = triangulate(outline, [hole]);

    // Every vertex keeps a z from the input set, never an invented one.
    const heights = new Set(result.vertices.map((vertex) => vertex.z));
    for (const height of heights) expect([1000, 1600, 2400, 3000]).toContain(height);
    // And the z travels with its own point: the corner at (0,0) is still 1000.
    const corner = result.vertices.find((vertex) => vertex.x === 0 && vertex.y === 0);
    expect(corner.z).toBe(1000);
  });

  it('defaults a missing z to zero', () => {
    expect(triangulate(SQUARE).vertices.every((vertex) => vertex.z === 0)).toBe(true);
  });
});
