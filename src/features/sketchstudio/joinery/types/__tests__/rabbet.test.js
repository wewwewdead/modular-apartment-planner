import { describe, expect, it } from 'vitest';
import rabbet from '../rabbet';
import { createMockContext, createMockJoint, validationHelpers, geometryHelpers } from './helpers';

describe('rabbet joint type', () => {
  it('has correct metadata', () => {
    expect(rabbet.type).toBe('rabbet');
    expect(rabbet.fabrication.process).toBe('milling');
    expect(rabbet.fabrication.operationKind).toBe('profile-step');
  });

  describe('normalizeParameters', () => {
    it('normalizes valid parameters', () => {
      const result = rabbet.normalizeParameters({ width: 18, depth: 9, inset: 0, offset: 0 });
      expect(result).toEqual({ width: 18, depth: 9, inset: 0, offset: 0 });
    });

    it('nullifies invalid width', () => {
      expect(rabbet.normalizeParameters({ width: -1 }).width).toBeNull();
    });
  });

  describe('computeDefaults', () => {
    it('derives depth from target thickness at 50% factor', () => {
      const context = createMockContext({ targetThickness: 18 });
      const result = rabbet.computeDefaults(context);
      expect(result.depth).toBe(9);
    });
  });

  describe('validate', () => {
    it('returns no reasons for valid parameters', () => {
      const joint = createMockJoint('rabbet');
      const context = createMockContext();
      const reasons = rabbet.validate(joint, context, { width: 50, depth: 6, inset: 0, offset: 0 }, validationHelpers);
      expect(reasons).toHaveLength(0);
    });

    it('catches depth exceeding target thickness', () => {
      const joint = createMockJoint('rabbet');
      const context = createMockContext({ targetThickness: 5 });
      const reasons = rabbet.validate(joint, context, { width: 50, depth: 10, inset: 0, offset: 0 }, validationHelpers);
      expect(reasons.some((r) => r.includes('Depth exceeds'))).toBe(true);
    });
  });

  describe('buildGeometry', () => {
    it('returns part modifications and occupied regions', () => {
      const joint = createMockJoint('rabbet', { parameters: { width: 50, depth: 6, inset: 0, offset: 0 } });
      const context = createMockContext();
      const result = rabbet.buildGeometry(joint, context, geometryHelpers);

      expect(result.partModifications).toHaveLength(1);
      expect(result.partModifications[0].partId).toBe('part-b');
      expect(result.occupiedRegions).toHaveLength(1);
    });

    it('returns error when female interval cannot be computed', () => {
      const joint = createMockJoint('rabbet', { parameters: { width: 0, depth: 6, inset: 0, offset: 0 } });
      const context = createMockContext();
      const result = rabbet.buildGeometry(joint, context, geometryHelpers);
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

    it.each(cases)('widens the receiving step by exactly the %s clearance', (fit, expectedDelta) => {
      const parameters = { width: 50, depth: 6, inset: 0, offset: 0 };
      const context = createMockContext();
      const legacy = rabbet.buildGeometry(createMockJoint('rabbet', { parameters }), context, geometryHelpers);
      const withFit = rabbet.buildGeometry(
        createMockJoint('rabbet', { parameters, tolerance: { clearance: 0.2, fit } }),
        context,
        geometryHelpers,
      );

      const legacyCut = legacy.partModifications[0].modifications[0];
      const fitCut = withFit.partModifications[0].modifications[0];

      // Legacy already carries the pre-existing 0.2mm tolerance allowance; the
      // fit clearance composes on top of it and nothing else changes.
      expect(legacyCut.length).toBeCloseTo(50.2, 9);
      expect(fitCut.length - legacyCut.length).toBeCloseTo(expectedDelta, 9);
      expect(fitCut.center).toBeCloseTo(legacyCut.center, 9);
      expect(fitCut.depth).toBe(legacyCut.depth);
    });
  });
});
