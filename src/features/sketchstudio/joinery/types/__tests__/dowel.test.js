import { describe, expect, it } from 'vitest';
import dowel from '../dowel';
import { createMockContext, createMockJoint, validationHelpers, geometryHelpers } from './helpers';

describe('dowel joint type', () => {
  it('has correct metadata', () => {
    expect(dowel.type).toBe('dowel');
    expect(dowel.fabrication.process).toBe('drilling');
    expect(dowel.fabrication.hardware).toEqual({ kind: 'dowel' });
  });

  describe('normalizeParameters', () => {
    it('normalizes valid parameters', () => {
      const result = dowel.normalizeParameters({ dowelDiameter: 8, count: 2, spacing: 40, edgeOffset: 10, depth: 12 });
      expect(result).toEqual({ dowelDiameter: 8, count: 2, spacing: 40, edgeOffset: 10, depth: 12 });
    });

    it('nullifies non-positive diameter', () => {
      expect(dowel.normalizeParameters({ dowelDiameter: 0 }).dowelDiameter).toBeNull();
    });

    it('nullifies non-integer count', () => {
      expect(dowel.normalizeParameters({ count: 1.5 }).count).toBeNull();
    });
  });

  describe('computeDefaults', () => {
    it('computes defaults from context', () => {
      const context = createMockContext({ minThickness: 18 });
      const result = dowel.computeDefaults(context);

      expect(result.dowelDiameter).toBeCloseTo(6.3, 1); // 18 * 0.35
      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(result.depth).toBeCloseTo(10.8, 1); // 18 * 0.6
    });

    it('handles null context', () => {
      const result = dowel.computeDefaults(null);
      expect(result.dowelDiameter).toBe(8);
      expect(result.depth).toBe(12);
    });
  });

  describe('validate', () => {
    it('returns no reasons for valid parameters', () => {
      const joint = createMockJoint('dowel');
      const context = createMockContext();
      const reasons = dowel.validate(
        joint,
        context,
        { dowelDiameter: 8, count: 2, spacing: 40, edgeOffset: 10, depth: 12 },
        validationHelpers,
      );
      expect(reasons).toHaveLength(0);
    });

    it('catches oversized diameter', () => {
      const joint = createMockJoint('dowel');
      const context = createMockContext({ minThickness: 6 });
      const reasons = dowel.validate(
        joint,
        context,
        { dowelDiameter: 10, count: 1, spacing: 0, edgeOffset: 0, depth: 4 },
        validationHelpers,
      );
      expect(reasons.some((r) => r.includes('diameter exceeds'))).toBe(true);
    });
  });

  describe('buildGeometry', () => {
    it('returns feature entities for source and target holes', () => {
      const joint = createMockJoint('dowel', {
        parameters: { dowelDiameter: 8, count: 2, spacing: 40, edgeOffset: 10, depth: 12 },
      });
      const context = createMockContext();
      const result = dowel.buildGeometry(joint, context, geometryHelpers);

      expect(result.featureEntities.length).toBe(4); // 2 source + 2 target
      expect(result.occupiedRegions.length).toBe(4);
    });

    it('returns error when intervals are empty', () => {
      const joint = createMockJoint('dowel', {
        parameters: { dowelDiameter: 0, count: 0, spacing: 0, edgeOffset: 0, depth: 12 },
      });
      const context = createMockContext();
      const result = dowel.buildGeometry(joint, context, geometryHelpers);
      expect(result.error).toBeTruthy();
    });
  });
});
