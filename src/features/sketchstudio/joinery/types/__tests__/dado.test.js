import { describe, expect, it } from 'vitest';
import dado from '../dado';
import { createMockContext, createMockJoint, validationHelpers, geometryHelpers } from './helpers';

describe('dado joint type', () => {
  it('has correct metadata', () => {
    expect(dado.type).toBe('dado');
    expect(dado.fabrication.process).toBe('milling');
    expect(dado.fabrication.operationKind).toBe('slot');
  });

  describe('normalizeParameters', () => {
    it('normalizes valid parameters', () => {
      const result = dado.normalizeParameters({ width: 18, depth: 6, inset: 2, offset: 0 });
      expect(result).toEqual({ width: 18, depth: 6, inset: 2, offset: 0 });
    });

    it('sets non-positive width to null', () => {
      expect(dado.normalizeParameters({ width: 0, depth: 6 }).width).toBeNull();
    });

    it('defaults missing inset to 0', () => {
      expect(dado.normalizeParameters({}).inset).toBe(0);
    });
  });

  describe('computeDefaults', () => {
    it('derives width from overlap and depth from target thickness', () => {
      const context = createMockContext({ targetThickness: 18 });
      const result = dado.computeDefaults(context);

      expect(result.width).toBe(100); // overlap length
      expect(result.depth).toBeCloseTo(5.94, 1); // 18 * 0.33
      expect(result.inset).toBe(0);
      expect(result.offset).toBe(0);
    });

    it('handles null context', () => {
      const result = dado.computeDefaults(null);
      expect(result.width).toBeNull();
      expect(result.depth).toBeNull();
    });
  });

  describe('validate', () => {
    it('returns no reasons for valid parameters', () => {
      const joint = createMockJoint('dado');
      const context = createMockContext();
      const reasons = dado.validate(joint, context, { width: 50, depth: 6, inset: 0, offset: 0 }, validationHelpers);
      expect(reasons).toHaveLength(0);
    });

    it('returns reasons when width is missing', () => {
      const joint = createMockJoint('dado');
      const context = createMockContext();
      const reasons = dado.validate(joint, context, { width: 0, depth: 6, inset: 0, offset: 0 }, validationHelpers);
      expect(reasons.some((r) => r.includes('Width'))).toBe(true);
    });

    it('returns reasons when depth exceeds target thickness', () => {
      const joint = createMockJoint('dado');
      const context = createMockContext({ targetThickness: 10 });
      const reasons = dado.validate(joint, context, { width: 50, depth: 15, inset: 0, offset: 0 }, validationHelpers);
      expect(reasons.some((r) => r.includes('Depth exceeds'))).toBe(true);
    });
  });

  describe('buildGeometry', () => {
    it('returns a feature entity and occupied regions', () => {
      const joint = createMockJoint('dado', { parameters: { width: 50, depth: 6, inset: 0, offset: 0 } });
      const context = createMockContext();
      const result = dado.buildGeometry(joint, context, geometryHelpers);

      expect(result.featureEntities).toHaveLength(1);
      expect(result.featureEntities[0].shape).toBe('rect');
      expect(result.occupiedRegions).toHaveLength(1);
      expect(result.occupiedRegions[0].partId).toBe('part-b');
    });

    it('returns error when interval does not fit', () => {
      const joint = createMockJoint('dado', { parameters: { width: 0, depth: 6, inset: 0, offset: 0 } });
      const context = createMockContext();
      const result = dado.buildGeometry(joint, context, geometryHelpers);
      expect(result.error).toBeTruthy();
    });
  });

  describe('fit clearance', () => {
    // The dado IS the female half: the fit clearance widens the slot and the
    // source panel never moves. Deltas are TOTAL width, half per side.
    const cases = [
      ['standard', 0],
      ['piston', 0.04],
      ['glue', 0.1],
      ['loose', 0.3],
    ];

    it.each(cases)('widens the slot by exactly the %s clearance', (fit, expectedDelta) => {
      const parameters = { width: 50, depth: 6, inset: 0, offset: 0 };
      const legacy = createMockJoint('dado', { parameters });
      const withFit = createMockJoint('dado', { parameters, tolerance: { clearance: 0.2, fit } });
      const context = createMockContext();

      const legacyInterval = geometryHelpers.buildWidthOffsetInterval(
        context,
        parameters,
        geometryHelpers.getFemaleFitClearance(legacy),
      );
      const fitInterval = geometryHelpers.buildWidthOffsetInterval(
        context,
        parameters,
        geometryHelpers.getFemaleFitClearance(withFit),
      );

      expect(legacyInterval.length).toBeCloseTo(50, 9);
      expect(fitInterval.length - legacyInterval.length).toBeCloseTo(expectedDelta, 9);
      // Symmetric: the slot grows the same amount on each side of centre.
      expect(fitInterval.center).toBeCloseTo(legacyInterval.center, 9);
    });

    it('honours a custom numeric clearance', () => {
      const parameters = { width: 50, depth: 6, inset: 0, offset: 0 };
      const joint = createMockJoint('dado', {
        parameters,
        tolerance: { clearance: 0.2, fit: 'custom', clearanceMm: 0.55 },
      });
      const context = createMockContext();
      const interval = geometryHelpers.buildWidthOffsetInterval(
        context,
        parameters,
        geometryHelpers.getFemaleFitClearance(joint),
      );

      expect(interval.length).toBeCloseTo(50.55, 9);
    });

    it('leaves a joint with no fit exactly where it was', () => {
      const parameters = { width: 50, depth: 6, inset: 0, offset: 0 };
      const noFit = createMockJoint('dado', { parameters, tolerance: { clearance: 0.2 } });
      const context = createMockContext();

      expect(geometryHelpers.getFemaleFitClearance(noFit)).toBe(0);
      expect(
        geometryHelpers.buildWidthOffsetInterval(context, parameters, geometryHelpers.getFemaleFitClearance(noFit))
          .length,
      ).toBeCloseTo(50, 9);
    });
  });
});
