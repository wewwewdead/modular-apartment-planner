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

  describe('fit clearance', () => {
    const cases = [
      ['standard', 0],
      ['piston', 0.04],
      ['glue', 0.1],
      ['loose', 0.3],
    ];
    const parameters = { count: 2, tabWidth: 20, spacing: 5, edgeOffset: 10, depth: 10 };

    it.each(cases)('widens every slot by the %s clearance and leaves the tabs nominal', (fit, expectedDelta) => {
      const context = createMockContext();
      const legacy = tab_slot.buildGeometry(createMockJoint('tab_slot', { parameters }), context, geometryHelpers);
      const withFit = tab_slot.buildGeometry(
        createMockJoint('tab_slot', { parameters, tolerance: { clearance: 0.2, fit } }),
        context,
        geometryHelpers,
      );

      const legacyTabs = legacy.partModifications[0].modifications;
      const fitTabs = withFit.partModifications[0].modifications;
      const legacySlots = legacy.partModifications[1].modifications;
      const fitSlots = withFit.partModifications[1].modifications;

      expect(fitTabs).toHaveLength(legacyTabs.length);
      legacyTabs.forEach((tab, index) => {
        // Male unchanged: only the legacy 0.2mm allowance shrank it, as before.
        expect(fitTabs[index].start).toBeCloseTo(tab.start, 9);
        expect(fitTabs[index].end).toBeCloseTo(tab.end, 9);
      });

      legacySlots.forEach((slot, index) => {
        expect(slot.length).toBeCloseTo(20.2, 9);
        expect(fitSlots[index].length - slot.length).toBeCloseTo(expectedDelta, 9);
      });
    });
  });
});
