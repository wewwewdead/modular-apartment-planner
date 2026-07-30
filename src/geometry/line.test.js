import { describe, expect, it } from 'vitest';
import { distanceToSegment, nearestPointOnSegment, segmentIntersection, segmentLength } from './line';

describe('line / segment math', () => {
  describe('nearestPointOnSegment', () => {
    it('projects onto the interior of a horizontal segment', () => {
      const { point, t } = nearestPointOnSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
      expect(point).toEqual({ x: 5, y: 0 });
      expect(t).toBeCloseTo(0.5, 10);
    });

    it('clamps to the start when the projection is before the segment', () => {
      const { point, t } = nearestPointOnSegment({ x: -5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 });
      expect(point).toEqual({ x: 0, y: 0 });
      expect(t).toBe(0);
    });

    it('clamps to the end when the projection is past the segment', () => {
      const { point, t } = nearestPointOnSegment({ x: 20, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 });
      expect(point).toEqual({ x: 10, y: 0 });
      expect(t).toBe(1);
    });

    it('handles a degenerate zero-length segment', () => {
      const { point, t } = nearestPointOnSegment({ x: 5, y: 5 }, { x: 2, y: 2 }, { x: 2, y: 2 });
      expect(point).toEqual({ x: 2, y: 2 });
      expect(t).toBe(0);
    });
  });

  describe('distanceToSegment', () => {
    it('returns perpendicular distance for an interior projection', () => {
      expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    });

    it('returns distance to the nearest endpoint when projecting outside', () => {
      expect(distanceToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    });
  });

  describe('segmentLength', () => {
    it('computes euclidean length', () => {
      expect(segmentLength({ x: 0, y: 0 }, { x: 6, y: 8 })).toBe(10);
    });
  });

  describe('segmentIntersection', () => {
    it('finds the crossing point of two perpendicular segments', () => {
      const p = segmentIntersection({ x: -5, y: 0 }, { x: 5, y: 0 }, { x: 0, y: -5 }, { x: 0, y: 5 });
      expect(p).not.toBeNull();
      expect(p.x).toBeCloseTo(0, 10);
      expect(p.y).toBeCloseTo(0, 10);
    });

    it('returns null for parallel (non-intersecting) segments', () => {
      const p = segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 });
      expect(p).toBeNull();
    });

    it('returns null for collinear segments (cross product is zero)', () => {
      // NOTE: collinear/overlapping segments are treated as no-intersection.
      const p = segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 });
      expect(p).toBeNull();
    });

    it('returns null when segments would cross only if extended', () => {
      const p = segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 });
      expect(p).toBeNull();
    });

    it('detects intersection exactly at a shared endpoint', () => {
      const p = segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 });
      expect(p).not.toBeNull();
      expect(p.x).toBeCloseTo(10, 10);
      expect(p.y).toBeCloseTo(0, 10);
    });
  });
});
