import { describe, expect, it } from 'vitest';
import tab_slot from '../tab_slot';
import { createMockContext, createMockJoint, validationHelpers, geometryHelpers } from './helpers';

describe('tab_slot joint type', () => {
  it('has correct metadata', () => {
    expect(tab_slot.type).toBe('tab_slot');
    expect(tab_slot.fabrication.process).toBe('milling');
    expect(tab_slot.fabrication.operationKind).toBe('tab-slot');
  });

  describe('normalizeParameters', () => {
    it('normalizes valid parameters', () => {
      const result = tab_slot.normalizeParameters({ count: 3, tabWidth: 20, spacing: 5, edgeOffset: 10, depth: 12 });
      expect(result).toEqual({ count: 3, tabWidth: 20, spacing: 5, edgeOffset: 10, depth: 12 });
    });

    it('nullifies non-integer count', () => {
      expect(tab_slot.normalizeParameters({ count: 2.5 }).count).toBeNull();
    });
  });

  describe('computeDefaults', () => {
    it('computes defaults from context', () => {
      const context = createMockContext({ targetThickness: 18, minThickness: 18 });
      const result = tab_slot.computeDefaults(context);

      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(result.tabWidth).toBeGreaterThan(0);
      expect(result.depth).toBeCloseTo(10.8, 1); // 18 * 0.6
    });
  });

  describe('validate', () => {
    it('returns no reasons for valid parameters', () => {
      const joint = createMockJoint('tab_slot');
      const context = createMockContext();
      const reasons = tab_slot.validate(
        joint,
        context,
        { count: 2, tabWidth: 20, spacing: 5, edgeOffset: 10, depth: 10 },
        validationHelpers,
      );
      expect(reasons).toHaveLength(0);
    });

    it('catches tab depth exceeding target thickness', () => {
      const joint = createMockJoint('tab_slot');
      const context = createMockContext({ targetThickness: 8 });
      const reasons = tab_slot.validate(
        joint,
        context,
        { count: 1, tabWidth: 20, spacing: 0, edgeOffset: 0, depth: 15 },
        validationHelpers,
      );
      expect(reasons.some((r) => r.includes('Tab depth exceeds'))).toBe(true);
    });

    it('catches non-integer count', () => {
      const joint = createMockJoint('tab_slot');
      const context = createMockContext();
      const reasons = tab_slot.validate(
        joint,
        context,
        { count: 0, tabWidth: 20, spacing: 0, edgeOffset: 0, depth: 10 },
        validationHelpers,
      );
      expect(reasons.some((r) => r.includes('Tab count'))).toBe(true);
    });
  });

  describe('buildGeometry', () => {
    it('returns part modifications for source and target', () => {
      const joint = createMockJoint('tab_slot', {
        parameters: { count: 2, tabWidth: 20, spacing: 5, edgeOffset: 10, depth: 10 },
      });
      const context = createMockContext();
      const result = tab_slot.buildGeometry(joint, context, geometryHelpers);

      expect(result.partModifications.length).toBeGreaterThanOrEqual(1);
      expect(result.occupiedRegions.length).toBeGreaterThanOrEqual(2);
    });

    it('returns error when intervals are empty', () => {
      const joint = createMockJoint('tab_slot', {
        parameters: { count: 0, tabWidth: 0, spacing: 0, edgeOffset: 0, depth: 10 },
      });
      const context = createMockContext();
      const result = tab_slot.buildGeometry(joint, context, geometryHelpers);
      expect(result.error).toBeTruthy();
    });
  });
});
