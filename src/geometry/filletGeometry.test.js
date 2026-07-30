import { describe, expect, it } from 'vitest';
import {
  arcWallLength,
  arcWallOutline,
  computeFilletGeometry,
  findCorner,
  interpolateQuadratic,
  sampleArc,
} from './filletGeometry';
import { createWall } from '@/domain/models';

describe('interpolateQuadratic', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 100, y: 100 };
    const p2 = { x: 200, y: 0 };
    expect(interpolateQuadratic(p0, p1, p2, 0)).toEqual(p0);
    expect(interpolateQuadratic(p0, p1, p2, 1)).toEqual(p2);
  });

  it('evaluates the midpoint of a symmetric quadratic', () => {
    // For a symmetric arc, t=0.5 sits halfway in x and halfway to the control in y.
    const mid = interpolateQuadratic({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 0 }, 0.5);
    expect(mid.x).toBeCloseTo(100, 6);
    expect(mid.y).toBeCloseTo(50, 6);
  });
});

describe('sampleArc', () => {
  it('returns numSegments + 1 points', () => {
    expect(sampleArc({ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }, 4)).toHaveLength(5);
    expect(sampleArc({ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }, 16)).toHaveLength(17);
  });

  it('includes the start and end points exactly', () => {
    const points = sampleArc({ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }, 8);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 100, y: 0 });
  });
});

describe('arcWallLength', () => {
  it('equals the straight distance when the control point is collinear', () => {
    const wall = { start: { x: 0, y: 0 }, controlPoint: { x: 100, y: 0 }, end: { x: 200, y: 0 } };
    expect(arcWallLength(wall)).toBeCloseTo(200, 6);
  });

  it('is longer than the chord for a curved arc', () => {
    const wall = { start: { x: 0, y: 0 }, controlPoint: { x: 100, y: 100 }, end: { x: 200, y: 0 } };
    expect(arcWallLength(wall)).toBeGreaterThan(200);
  });
});

describe('arcWallOutline', () => {
  it('returns 2*(numSegments+1) points (outer + inner offset)', () => {
    const wall = { start: { x: 0, y: 0 }, controlPoint: { x: 100, y: 100 }, end: { x: 200, y: 0 }, thickness: 150 };
    expect(arcWallOutline(wall, 8)).toHaveLength(18);
  });

  it('offsets a straight arc by +/- half thickness perpendicular to the run', () => {
    const wall = { start: { x: 0, y: 0 }, controlPoint: { x: 100, y: 0 }, end: { x: 200, y: 0 }, thickness: 100 };
    const outline = arcWallOutline(wall, 4);
    const ys = outline.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(-50, 6);
    expect(Math.max(...ys)).toBeCloseTo(50, 6);
  });
});

describe('computeFilletGeometry', () => {
  it('computes tangent points for a 90-degree corner', () => {
    const w1 = createWall({ x: 0, y: 0 }, { x: 5000, y: 0 });
    const w2 = createWall({ x: 0, y: 0 }, { x: 0, y: 5000 });
    const fillet = computeFilletGeometry(w1, 'start', w2, 'start', 200);
    expect(fillet).not.toBeNull();
    // tangentDist = radius / tan(45deg) = 200; points sit 200 along each wall.
    expect(fillet.tangentPoint1.x).toBeCloseTo(200, 6);
    expect(fillet.tangentPoint1.y).toBeCloseTo(0, 6);
    expect(fillet.tangentPoint2.x).toBeCloseTo(0, 6);
    expect(fillet.tangentPoint2.y).toBeCloseTo(200, 6);
    // The control point of the quadratic is the shared corner.
    expect(fillet.controlPoint).toEqual({ x: 0, y: 0 });
    expect(fillet.radius).toBe(200);
  });

  it('returns null for (anti)parallel walls', () => {
    const w1 = createWall({ x: 0, y: 0 }, { x: 5000, y: 0 });
    const w2 = createWall({ x: 0, y: 0 }, { x: -5000, y: 0 });
    expect(computeFilletGeometry(w1, 'start', w2, 'start', 200)).toBeNull();
  });

  it('returns null when the radius is too large for the wall lengths', () => {
    const w1 = createWall({ x: 0, y: 0 }, { x: 100, y: 0 });
    const w2 = createWall({ x: 0, y: 0 }, { x: 0, y: 100 });
    expect(computeFilletGeometry(w1, 'start', w2, 'start', 2000)).toBeNull();
  });

  it('scales the tangent distance with the corner angle', () => {
    // A 90-degree corner: tangentDist = radius (tan 45 = 1).
    const right1 = createWall({ x: 0, y: 0 }, { x: 5000, y: 0 });
    const right2 = createWall({ x: 0, y: 0 }, { x: 0, y: 5000 });
    const rightFillet = computeFilletGeometry(right1, 'start', right2, 'start', 200);
    const rightDist = Math.hypot(rightFillet.tangentPoint1.x, rightFillet.tangentPoint1.y);
    expect(rightDist).toBeCloseTo(200, 6);
  });
});

describe('findCorner', () => {
  it('finds a corner where exactly two walls share an endpoint', () => {
    const w1 = createWall({ x: 0, y: 0 }, { x: 5000, y: 0 });
    const w2 = createWall({ x: 0, y: 0 }, { x: 0, y: 5000 });
    const corner = findCorner([w1, w2], { x: 5, y: 5 }, 100);
    expect(corner).not.toBeNull();
    expect(corner.cornerPoint).toEqual({ x: 0, y: 0 });
    expect(corner.wall1Endpoint).toBe('start');
    expect(corner.wall2Endpoint).toBe('start');
    expect(new Set([corner.wall1.id, corner.wall2.id])).toEqual(new Set([w1.id, w2.id]));
  });

  it('returns null when the click is far from any corner', () => {
    const w1 = createWall({ x: 0, y: 0 }, { x: 5000, y: 0 });
    const w2 = createWall({ x: 0, y: 0 }, { x: 0, y: 5000 });
    expect(findCorner([w1, w2], { x: 9000, y: 9000 }, 100)).toBeNull();
  });

  it('ignores arc walls (they cannot form fillettable corners)', () => {
    const arc = createWall({ x: 0, y: 0 }, { x: 5000, y: 0 }, 150, { controlPoint: { x: 2500, y: 500 } });
    const straight = createWall({ x: 0, y: 0 }, { x: 0, y: 5000 });
    // Only one non-arc wall meets at (0,0) -> not a 2-wall corner.
    expect(findCorner([arc, straight], { x: 5, y: 5 }, 100)).toBeNull();
  });

  it('returns null when three or more walls meet at the same point', () => {
    const w1 = createWall({ x: 0, y: 0 }, { x: 5000, y: 0 });
    const w2 = createWall({ x: 0, y: 0 }, { x: 0, y: 5000 });
    const w3 = createWall({ x: 0, y: 0 }, { x: -5000, y: -5000 });
    expect(findCorner([w1, w2, w3], { x: 5, y: 5 }, 100)).toBeNull();
  });
});
