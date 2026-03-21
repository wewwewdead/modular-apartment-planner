import { describe, expect, it } from 'vitest';
import {
  assignFeatureToPart,
  createCutoutFeature,
  createHoleFeature,
  getFeatureTargetSummary,
} from './featureUtils';

describe('featureUtils', () => {
  describe('createHoleFeature', () => {
    it('creates a hole feature with circle defaults', () => {
      const feature = createHoleFeature({ id: 'f1', diameter: 35 });
      expect(feature.type).toBe('hole');
      expect(feature.shape).toBe('circle');
      expect(feature.diameter).toBe(35);
      expect(feature.operation).toBe('subtract');
      expect(feature.through).toBe(true);
    });

    it('uses defaults when called with no args', () => {
      const feature = createHoleFeature();
      expect(feature.type).toBe('hole');
      expect(feature.diameter).toBe(0);
      expect(feature.targetPartId).toBeNull();
    });
  });

  describe('createCutoutFeature', () => {
    it('creates a cutout feature with rect defaults', () => {
      const feature = createCutoutFeature({ id: 'f2', width: 100, height: 50, depth: 10 });
      expect(feature.type).toBe('cutout');
      expect(feature.shape).toBe('rect');
      expect(feature.width).toBe(100);
      expect(feature.height).toBe(50);
      expect(feature.depth).toBe(10);
    });
  });

  describe('assignFeatureToPart', () => {
    const features = [
      { id: 'f1', type: 'hole', targetPartId: null },
      { id: 'f2', type: 'cutout', targetPartId: 'part-1' },
    ];

    it('assigns a feature to a target part', () => {
      const result = assignFeatureToPart(features, 'f1', 'part-2');
      expect(result[0].targetPartId).toBe('part-2');
      expect(result[1].targetPartId).toBe('part-1');
    });

    it('clears target when given null', () => {
      const result = assignFeatureToPart(features, 'f2', null);
      expect(result[1].targetPartId).toBeNull();
    });

    it('returns unchanged array when feature id not found', () => {
      const result = assignFeatureToPart(features, 'f99', 'part-1');
      expect(result).toEqual(features);
    });
  });

  describe('getFeatureTargetSummary', () => {
    const parts = [
      { id: 'part-1', name: 'Left Panel' },
      { id: 'part-2', name: 'Shelf 1' },
    ];

    it('returns "Unassigned" for null feature', () => {
      expect(getFeatureTargetSummary(null, parts)).toBe('Unassigned');
    });

    it('returns "Object" when no targetPartId', () => {
      expect(getFeatureTargetSummary({ id: 'f1', targetPartId: null }, parts)).toBe('Object');
    });

    it('returns part name when targetPartId matches', () => {
      expect(getFeatureTargetSummary({ id: 'f1', targetPartId: 'part-1' }, parts)).toBe('Left Panel');
    });

    it('returns "Unknown Part" for missing targetPartId', () => {
      expect(getFeatureTargetSummary({ id: 'f1', targetPartId: 'part-99' }, parts)).toBe('Unknown Part');
    });
  });
});
