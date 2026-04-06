import { describe, expect, it } from 'vitest';
import pocket_screw from '../pocket_screw';
import { createMockContext, createMockJoint, validationHelpers, geometryHelpers } from './helpers';

describe('pocket_screw joint type', () => {
  it('has correct metadata', () => {
    expect(pocket_screw.type).toBe('pocket_screw');
    expect(pocket_screw.fabrication.process).toBe('drilling');
    expect(pocket_screw.fabrication.hardware).toEqual({ kind: 'pocket-screw' });
  });

  describe('normalizeParameters', () => {
    it('normalizes valid parameters', () => {
      const result = pocket_screw.normalizeParameters({
        pocketDiameter: 9.5,
        pilotDiameter: 3.5,
        count: 2,
        spacing: 40,
        edgeOffset: 10,
        pocketOffset: 12,
        depth: 12,
      });
      expect(result.pocketDiameter).toBe(9.5);
      expect(result.pilotDiameter).toBe(3.5);
      expect(result.count).toBe(2);
    });

    it('handles missing parameters', () => {
      const result = pocket_screw.normalizeParameters({});
      expect(result.pocketDiameter).toBeNull();
      expect(result.pilotDiameter).toBeNull();
      expect(result.count).toBeNull();
    });
  });

  describe('computeDefaults', () => {
    it('computes defaults from context', () => {
      const context = createMockContext({ sourceThickness: 18, minThickness: 18 });
      const result = pocket_screw.computeDefaults(context);

      expect(result.pocketDiameter).toBe(9.5);
      expect(result.pilotDiameter).toBe(3.5);
      expect(result.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('validate', () => {
    it('returns no reasons for valid parameters', () => {
      const joint = createMockJoint('pocket_screw');
      const context = createMockContext();
      const reasons = pocket_screw.validate(
        joint,
        context,
        { pocketDiameter: 9.5, pilotDiameter: 3.5, count: 1, spacing: 0, edgeOffset: 10, pocketOffset: 12, depth: 12 },
        validationHelpers,
      );
      expect(reasons).toHaveLength(0);
    });

    it('catches pocket depth exceeding source thickness', () => {
      const joint = createMockJoint('pocket_screw');
      const context = createMockContext({ sourceThickness: 8 });
      const reasons = pocket_screw.validate(
        joint,
        context,
        { pocketDiameter: 9.5, pilotDiameter: 3.5, count: 1, spacing: 0, edgeOffset: 0, pocketOffset: 0, depth: 15 },
        validationHelpers,
      );
      expect(reasons.some((r) => r.includes('Pocket depth exceeds'))).toBe(true);
    });
  });

  describe('buildGeometry', () => {
    it('returns feature entities for pocket and pilot holes', () => {
      const joint = createMockJoint('pocket_screw', {
        parameters: {
          pocketDiameter: 9.5,
          pilotDiameter: 3.5,
          count: 2,
          spacing: 40,
          edgeOffset: 10,
          pocketOffset: 12,
          depth: 12,
        },
      });
      const context = createMockContext();
      const result = pocket_screw.buildGeometry(joint, context, geometryHelpers);

      expect(result.featureEntities.length).toBe(4); // 2 pocket + 2 pilot
      expect(result.occupiedRegions.length).toBe(4);
    });

    it('returns error when layout fails', () => {
      const joint = createMockJoint('pocket_screw', {
        parameters: {
          pocketDiameter: 0,
          pilotDiameter: 0,
          count: 0,
          spacing: 0,
          edgeOffset: 0,
          pocketOffset: 0,
          depth: 0,
        },
      });
      const context = createMockContext();
      const result = pocket_screw.buildGeometry(joint, context, geometryHelpers);
      expect(result.error).toBeTruthy();
    });
  });
});
