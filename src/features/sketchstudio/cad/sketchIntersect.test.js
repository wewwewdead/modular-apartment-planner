// Exact crossings (docs/sketch-studio-hand-drawing.md §6.3, §6.7): every pair
// of segment, arc and circle; tangents; misses; an arc's range at both ends;
// collinear overlap; a rectangle against a circle. Every number is worked by
// hand (3-4-5 triangles, so the answers are exact).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  directionAt,
  distanceToPrimitive,
  entityIntersections,
  intersect,
  primitiveBox,
  primitives,
} from './sketchIntersect.js';

const segment = (a, b) => ({ type: 'segment', a, b });
const circle = (center, radius) => ({ type: 'circle', center, radius });
// An arc as the sketcher draws it (a, a point on it, b), as a primitive.
const arc = (a, m, b) => primitives({ type: 'arc', a, m, b })[0];
// The upper half of the circle at the origin of radius 5, counter-clockwise from (5, 0) to (-5, 0).
const upper = arc([5, 0], [0, 5], [-5, 0]);
const close = (points, expected) => {
  expect(points).toHaveLength(expected.length);
  points.forEach((p, i) => {
    expect(p[0]).toBeCloseTo(expected[i][0], 9);
    expect(p[1]).toBeCloseTo(expected[i][1], 9);
  });
};

describe('primitives', () => {
  it('makes a line one segment, a rectangle four sides, a circle and an arc themselves', () => {
    expect(primitives({ type: 'line', a: [0, 0], b: [4, 3] })).toEqual([segment([0, 0], [4, 3])]);
    expect(primitives({ type: 'rect', a: [10, 10], b: [0, 0] })).toEqual([
      segment([0, 0], [10, 0]),
      segment([10, 0], [10, 10]),
      segment([10, 10], [0, 10]),
      segment([0, 10], [0, 0]),
    ]);
    expect(primitives({ type: 'circle', c: [1, 2], r: 3 })).toEqual([circle([1, 2], 3)]);
    expect(upper).toMatchObject({ type: 'arc', radius: 5, a: [5, 0], b: [-5, 0] });
    expect(upper.center[0]).toBeCloseTo(0, 12);
    expect(upper.center[1]).toBeCloseTo(0, 12);
    expect(upper.sweep).toBeCloseTo(Math.PI, 12);
    // Three points on a line are no arc.
    expect(primitives({ type: 'arc', a: [0, 0], m: [1, 1], b: [2, 2] })).toEqual([]);
  });

  it('boxes, distances and directions', () => {
    expect(primitiveBox(segment([4, 0], [0, 3]))).toEqual([0, 0, 4, 3]);
    expect(primitiveBox(circle([1, 1], 2))).toEqual([-1, -1, 3, 3]);
    const box = primitiveBox(upper);
    [-5, 0, 5, 5].forEach((value, i) => expect(box[i]).toBeCloseTo(value, 9));
    expect(distanceToPrimitive([2, 4], segment([0, 0], [4, 0]))).toBe(4);
    expect(distanceToPrimitive([3, 4], circle([0, 0], 10))).toBe(5);
    // Below the upper half: the distance is to its nearer end.
    expect(distanceToPrimitive([5, -3], upper)).toBeCloseTo(3, 9);
    expect(distanceToPrimitive([0, 8], upper)).toBeCloseTo(3, 9);
    expect(directionAt(segment([0, 0], [0, 2]), [0, 1])).toEqual([0, 1]);
    const tangent = directionAt(circle([0, 0], 5), [5, 0]);
    expect(tangent[0]).toBeCloseTo(0, 12);
    expect(tangent[1]).toBeCloseTo(1, 12);
  });
});

describe('segment × segment', () => {
  it('crosses, misses, meets end-on, and gives none when parallel or overlapping', () => {
    expect(intersect(segment([0, 0], [10, 10]), segment([0, 10], [10, 0]))).toEqual([[5, 5]]);
    expect(intersect(segment([0, 0], [8, 6]), segment([0, 6], [8, 0]))).toEqual([[4, 3]]);
    // Apart: the lines cross beyond the segments.
    expect(intersect(segment([0, 0], [4, 0]), segment([5, -1], [5, 1]))).toEqual([]);
    // End-on, either way round: the end exactly.
    expect(intersect(segment([0, 0], [4, 0]), segment([4, -2], [4, 2]))).toEqual([[4, 0]]);
    expect(intersect(segment([5, 0], [5, 5]), segment([0, 0], [10, 0]))).toEqual([[5, 0]]);
    expect(intersect(segment([0, 0], [10, 0]), segment([5, 0], [5, 5]))).toEqual([[5, 0]]);
    // Parallel, collinear overlapping, collinear end to end: none.
    expect(intersect(segment([0, 0], [10, 0]), segment([0, 1], [10, 1]))).toEqual([]);
    expect(intersect(segment([0, 0], [10, 0]), segment([5, 0], [15, 0]))).toEqual([]);
    expect(intersect(segment([0, 0], [10, 0]), segment([10, 0], [20, 0]))).toEqual([]);
    // A point-long segment: none.
    expect(intersect(segment([1, 1], [1, 1]), segment([0, 0], [2, 2]))).toEqual([]);
  });
});

describe('segment × circle', () => {
  it('crosses twice, is tangent once, misses, and ends inside or on it', () => {
    close(intersect(segment([-10, 3], [10, 3]), circle([0, 0], 5)), [
      [-4, 3],
      [4, 3],
    ]);
    // Either order of the pair.
    close(intersect(circle([0, 0], 5), segment([-10, 3], [10, 3])), [
      [-4, 3],
      [4, 3],
    ]);
    close(intersect(segment([-10, 5], [10, 5]), circle([0, 0], 5)), [[0, 5]]);
    expect(intersect(segment([-10, 6], [10, 6]), circle([0, 0], 5))).toEqual([]);
    close(intersect(segment([0, 0], [10, 0]), circle([0, 0], 5)), [[5, 0]]);
    // An end on the circle is that end exactly; a segment wholly inside meets nothing.
    expect(intersect(segment([5, 0], [10, 0]), circle([0, 0], 5))).toEqual([[5, 0]]);
    expect(intersect(segment([-1, 0], [1, 0]), circle([0, 0], 5))).toEqual([]);
    // A slanted secant: x + y = 7 through the circle of radius 5 meets it at (3, 4) and (4, 3).
    close(intersect(segment([0, 7], [7, 0]), circle([0, 0], 5)), [
      [3, 4],
      [4, 3],
    ]);
  });
});

describe('segment × arc', () => {
  it('keeps the points on the arc, its two ends included, and none a hair past them', () => {
    close(intersect(segment([-10, 3], [10, 3]), upper), [
      [-4, 3],
      [4, 3],
    ]);
    expect(intersect(segment([-10, -3], [10, -3]), upper)).toEqual([]);
    // Tangent at the start and at the end of the arc: each end counts.
    close(intersect(segment([5, -1], [5, 1]), upper), [[5, 0]]);
    close(intersect(segment([-5, -1], [-5, 1]), upper), [[-5, 0]]);
    // A line 1e-3 under the diameter meets the circle just past both ends: not the arc.
    expect(intersect(segment([-10, -1e-3], [10, -1e-3]), upper)).toEqual([]);
    // The diameter itself runs through both ends.
    close(intersect(segment([-10, 0], [10, 0]), upper), [
      [-5, 0],
      [5, 0],
    ]);
    // A clockwise arc (from (-5, 0) over the top to (5, 0)): the same points.
    const clockwise = arc([-5, 0], [0, 5], [5, 0]);
    expect(clockwise.sweep).toBeLessThan(0);
    close(intersect(segment([-10, 3], [10, 3]), clockwise), [
      [-4, 3],
      [4, 3],
    ]);
    expect(intersect(segment([-10, -3], [10, -3]), clockwise)).toEqual([]);
  });
});

describe('circle × circle, arc × circle, arc × arc', () => {
  it('crosses twice, is tangent outside and inside, misses, and gives none for one circle', () => {
    close(intersect(circle([0, 0], 5), circle([8, 0], 5)), [
      [4, 3],
      [4, -3],
    ]);
    close(intersect(circle([0, 0], 5), circle([10, 0], 5)), [[5, 0]]);
    close(intersect(circle([0, 0], 5), circle([2, 0], 3)), [[5, 0]]);
    expect(intersect(circle([0, 0], 5), circle([11, 0], 5))).toEqual([]);
    expect(intersect(circle([0, 0], 5), circle([1, 0], 1))).toEqual([]);
    expect(intersect(circle([0, 0], 5), circle([0, 0], 5))).toEqual([]);
    expect(intersect(circle([0, 0], 5), circle([0, 0], 3))).toEqual([]);
    // 13 and 15 at 14 apart: a = 5, h = 12.
    close(intersect(circle([0, 0], 13), circle([14, 0], 15)), [
      [5, 12],
      [5, -12],
    ]);
  });

  it('keeps an arc’s own range on both of a pair', () => {
    // The upper half against the whole circle at (8, 0): (4, 3) only.
    close(intersect(upper, circle([8, 0], 5)), [[4, 3]]);
    close(intersect(circle([8, 0], 5), upper), [[4, 3]]);
    // Against the upper half of that circle, (13, 0) → (8, 5) → (3, 0): (4, 3) again.
    close(intersect(upper, arc([13, 0], [8, 5], [3, 0])), [[4, 3]]);
    // Against its lower half: (4, -3) is not on the upper arc.
    expect(intersect(upper, arc([3, 0], [8, -5], [13, 0]))).toEqual([]);
    // Two arcs of one circle, overlapping: none.
    expect(intersect(upper, arc([0, 5], [-5, 0], [0, -5]))).toEqual([]);
    // Tangent at an end: the upper half and the circle at (10, 0) meet at (5, 0), the arc's start.
    close(intersect(upper, circle([10, 0], 5)), [[5, 0]]);
  });
});

describe('entityIntersections', () => {
  it('meets a rectangle with a circle on its right side, and a line through its corner once', () => {
    const plate = { type: 'rect', a: [0, 0], b: [10, 10] };
    close(entityIntersections(plate, { type: 'circle', c: [10, 5], r: 3 }), [
      [10, 2],
      [10, 8],
    ]);
    expect(entityIntersections(plate, { type: 'line', a: [-5, 5], b: [5, -5] })).toEqual([[0, 0]]);
    // A circle inside the rectangle meets none of it.
    expect(entityIntersections(plate, { type: 'circle', c: [5, 5], r: 2 })).toEqual([]);
    // A line and an arc of the sketcher's own kind.
    close(
      entityIntersections({ type: 'line', a: [-10, 3], b: [10, 3] }, { type: 'arc', a: [5, 0], m: [0, 5], b: [-5, 0] }),
      [
        [-4, 3],
        [4, 3],
      ],
    );
  });

  it('is pure: it imports sketchProfile.js only, with LF line endings', () => {
    const source = readFileSync(new URL('./sketchIntersect.js', import.meta.url), 'utf8');
    expect([...source.matchAll(/^import [^;]* from '([^']+)';/gm)].map((m) => m[1])).toEqual(['./sketchProfile.js']);
    expect(source).not.toMatch(/\b(document|window|navigator)\./);
    expect(source).not.toContain('\r\n');
  });
});
