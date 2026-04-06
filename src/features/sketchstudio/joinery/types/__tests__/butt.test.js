import { describe, expect, it } from 'vitest';
import butt from '../butt';
import { createMockContext, createMockJoint, validationHelpers, geometryHelpers } from './helpers';

describe('butt joint type', () => {
  it('has correct metadata', () => {
    expect(butt.type).toBe('butt');
    expect(butt.fabrication.process).toBe('assembly');
    expect(butt.fabrication.operationKind).toBe('butt');
  });

  describe('normalizeParameters', () => {
    it('normalizes offset to a finite number', () => {
      expect(butt.normalizeParameters({ offset: 5 })).toEqual({ offset: 5 });
    });

    it('defaults missing offset to 0', () => {
      expect(butt.normalizeParameters({})).toEqual({ offset: 0 });
    });

    it('replaces non-finite offset with 0', () => {
      expect(butt.normalizeParameters({ offset: NaN })).toEqual({ offset: 0 });
    });
  });

  describe('computeDefaults', () => {
    it('returns offset 0 regardless of context', () => {
      const result = butt.computeDefaults(createMockContext());
      expect(result).toEqual({ offset: 0 });
    });

    it('handles null context', () => {
      expect(butt.computeDefaults(null)).toEqual({ offset: 0 });
    });
  });

  describe('validate', () => {
    it('returns no reasons for any butt joint', () => {
      const joint = createMockJoint('butt');
      const context = createMockContext();
      const reasons = butt.validate(joint, context, { offset: 0 }, validationHelpers);
      expect(reasons).toBeUndefined();
    });
  });

  describe('buildGeometry', () => {
    it('returns occupied regions for both source and target', () => {
      const joint = createMockJoint('butt', { parameters: { offset: 0 } });
      const context = createMockContext();
      const result = butt.buildGeometry(joint, context, geometryHelpers);

      expect(result.occupiedRegions).toHaveLength(2);
      expect(result.occupiedRegions[0].partId).toBe('part-a');
      expect(result.occupiedRegions[1].partId).toBe('part-b');
      expect(result.featureEntities).toBeUndefined();
    });
  });
});
