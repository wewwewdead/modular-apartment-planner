import { describe, expect, it } from 'vitest';
import { add, distance, dot, lerp, midpoint, normalize, perpendicular, rotate, scale, subtract } from './point';

describe('point primitives', () => {
  describe('distance', () => {
    it('computes euclidean distance on a 3-4-5 triangle', () => {
      expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });

    it('returns zero for identical points', () => {
      expect(distance({ x: 7, y: -2 }, { x: 7, y: -2 })).toBe(0);
    });

    it('is symmetric', () => {
      const a = { x: 1, y: 2 };
      const b = { x: -4, y: 9 };
      expect(distance(a, b)).toBeCloseTo(distance(b, a), 10);
    });
  });

  describe('midpoint', () => {
    it('returns the average of both coordinates', () => {
      expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
    });

    it('handles negatives', () => {
      expect(midpoint({ x: -10, y: 4 }, { x: 10, y: -4 })).toEqual({ x: 0, y: 0 });
    });
  });

  describe('lerp', () => {
    it('returns start at t=0 and end at t=1', () => {
      const a = { x: 2, y: 3 };
      const b = { x: 12, y: 23 };
      expect(lerp(a, b, 0)).toEqual(a);
      expect(lerp(a, b, 1)).toEqual(b);
    });

    it('interpolates the midpoint at t=0.5', () => {
      expect(lerp({ x: 0, y: 0 }, { x: 8, y: 4 }, 0.5)).toEqual({ x: 4, y: 2 });
    });

    it('extrapolates beyond the segment for t>1', () => {
      expect(lerp({ x: 0, y: 0 }, { x: 10, y: 0 }, 2)).toEqual({ x: 20, y: 0 });
    });
  });

  describe('rotate', () => {
    it('rotates 90 degrees CCW around origin (SVG y-down convention)', () => {
      const result = rotate({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
      expect(result.x).toBeCloseTo(0, 10);
      expect(result.y).toBeCloseTo(1, 10);
    });

    it('rotates 180 degrees around a non-origin center', () => {
      const result = rotate({ x: 3, y: 5 }, { x: 1, y: 1 }, 180);
      expect(result.x).toBeCloseTo(-1, 10);
      expect(result.y).toBeCloseTo(-3, 10);
    });

    it('is identity at 0 degrees', () => {
      const result = rotate({ x: 7, y: -2 }, { x: 1, y: 1 }, 0);
      expect(result.x).toBeCloseTo(7, 10);
      expect(result.y).toBeCloseTo(-2, 10);
    });

    it('is identity at 360 degrees', () => {
      const result = rotate({ x: 7, y: -2 }, { x: 0, y: 0 }, 360);
      expect(result.x).toBeCloseTo(7, 10);
      expect(result.y).toBeCloseTo(-2, 10);
    });
  });

  describe('add / subtract / scale', () => {
    it('adds componentwise', () => {
      expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    });

    it('subtracts componentwise', () => {
      expect(subtract({ x: 5, y: 5 }, { x: 3, y: 8 })).toEqual({ x: 2, y: -3 });
    });

    it('scales by a scalar', () => {
      expect(scale({ x: 2, y: -3 }, 4)).toEqual({ x: 8, y: -12 });
    });

    it('add and subtract are inverses', () => {
      const a = { x: 3, y: 7 };
      const b = { x: -2, y: 5 };
      expect(subtract(add(a, b), b)).toEqual(a);
    });
  });

  describe('normalize', () => {
    it('returns a unit vector for a non-zero input', () => {
      const result = normalize({ x: 3, y: 4 });
      expect(result.x).toBeCloseTo(0.6, 10);
      expect(result.y).toBeCloseTo(0.8, 10);
      expect(Math.hypot(result.x, result.y)).toBeCloseTo(1, 10);
    });

    it('returns zero vector for a zero input (no NaN)', () => {
      expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    });
  });

  describe('perpendicular', () => {
    it('rotates a vector 90 degrees', () => {
      const a = perpendicular({ x: 1, y: 0 });
      expect(a.x).toBeCloseTo(0, 10);
      expect(a.y).toBeCloseTo(1, 10);
      expect(perpendicular({ x: 0, y: 1 })).toEqual({ x: -1, y: 0 });
    });

    it('is orthogonal to the input (dot product zero)', () => {
      const v = { x: 3, y: 7 };
      expect(dot(v, perpendicular(v))).toBe(0);
    });
  });

  describe('dot', () => {
    it('computes the scalar product', () => {
      expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
    });

    it('is zero for orthogonal vectors', () => {
      expect(dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
    });
  });
});
