import { describe, expect, it } from 'vitest';
import mortise_tenon from '../mortise_tenon';
import { createMockContext, createMockJoint, validationHelpers, geometryHelpers } from './helpers';

describe('mortise_tenon joint type', () => {
  it('has correct metadata', () => {
    expect(mortise_tenon.type).toBe('mortise_tenon');
    expect(mortise_tenon.fabrication.operationKind).toBe('tenon-mortise');
  });

  describe('normalizeParameters', () => {
    it('normalizes valid parameters', () => {
      const result = mortise_tenon.normalizeParameters({ width: 30, depth: 10, inset: 0, offset: 0 });
      expect(result).toEqual({ width: 30, depth: 10, inset: 0, offset: 0 });
    });
  });

  describe('computeDefaults', () => {
    it('computes width from overlap and minThickness', () => {
      const context = createMockContext({ minThickness: 18, targetThickness: 18 });
      const result = mortise_tenon.computeDefaults(context);

      // width = max(18*1.5, 100*0.6) = max(27, 60) = 60
      expect(result.width).toBe(60);
      // depth = 18 * 0.6 = 10.8
      expect(result.depth).toBeCloseTo(10.8, 1);
    });

    it('falls back to draft depth with null context', () => {
      const result = mortise_tenon.computeDefaults(null);
      expect(result.depth).toBe(12); // DEFAULT_DRAFT_DEPTH
    });
  });

  describe('validate', () => {
    it('returns no reasons for valid parameters', () => {
      const joint = createMockJoint('mortise_tenon');
      const context = createMockContext();
      const reasons = mortise_tenon.validate(
        joint,
        context,
        { width: 30, depth: 10, inset: 0, offset: 0 },
        validationHelpers,
      );
      expect(reasons).toHaveLength(0);
    });

    it('catches missing width', () => {
      const joint = createMockJoint('mortise_tenon');
      const context = createMockContext();
      const reasons = mortise_tenon.validate(
        joint,
        context,
        { width: 0, depth: 10, inset: 0, offset: 0 },
        validationHelpers,
      );
      expect(reasons.some((r) => r.includes('Width'))).toBe(true);
    });
  });

  describe('buildGeometry', () => {
    it('returns part modifications for both source and target', () => {
      const joint = createMockJoint('mortise_tenon', {
        parameters: { width: 30, depth: 10, inset: 0, offset: 0 },
      });
      const context = createMockContext();
      const result = mortise_tenon.buildGeometry(joint, context, geometryHelpers);

      expect(result.partModifications.length).toBeGreaterThanOrEqual(1);
      expect(result.occupiedRegions.length).toBeGreaterThanOrEqual(2);
    });

    it('returns error when intervals cannot be computed', () => {
      const joint = createMockJoint('mortise_tenon', {
        parameters: { width: 0, depth: 10, inset: 0, offset: 0 },
      });
      const context = createMockContext();
      const result = mortise_tenon.buildGeometry(joint, context, geometryHelpers);
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

    it.each(cases)('widens the mortise by the %s clearance and leaves the tenon nominal', (fit, expectedDelta) => {
      const parameters = { width: 50, depth: 6, inset: 0, offset: 0 };
      const context = createMockContext();
      const legacy = mortise_tenon.buildGeometry(
        createMockJoint('mortise_tenon', { parameters }),
        context,
        geometryHelpers,
      );
      const withFit = mortise_tenon.buildGeometry(
        createMockJoint('mortise_tenon', { parameters, tolerance: { clearance: 0.2, fit } }),
        context,
        geometryHelpers,
      );

      const legacyTenon = legacy.partModifications[0].modifications[0];
      const fitTenon = withFit.partModifications[0].modifications[0];
      const legacyMortise = legacy.partModifications[1].modifications[0];
      const fitMortise = withFit.partModifications[1].modifications[0];

      // Male stays nominal: the tenon is untouched by any fit class.
      expect(fitTenon.start).toBeCloseTo(legacyTenon.start, 9);
      expect(fitTenon.end).toBeCloseTo(legacyTenon.end, 9);
      expect(legacyTenon.length).toBeCloseTo(50, 9);

      // Female widens by exactly the class clearance.
      expect(legacyMortise.length).toBeCloseTo(50.2, 9);
      expect(fitMortise.length - legacyMortise.length).toBeCloseTo(expectedDelta, 9);
    });
  });
});
