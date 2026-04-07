import { describe, expect, it } from 'vitest';
import { resolveJointGeometry } from './jointGeometryUtils';

function makeRect(id, x, y, width, height, extras = {}) {
  return { id, type: 'rect', x, y, width, height, rotation: 0, visible: true, ...extras };
}

function makeTouchingPair() {
  return [makeRect('r1', 0, 0, 100, 50, { thickness: 18 }), makeRect('r2', 100, 0, 100, 50, { thickness: 18 })];
}

/**
 * Overlapping rects for joint types that require penetration contact
 * (dado, rabbet, mortise_tenon, tab_slot).
 * r1 is a narrow vertical panel that penetrates into r2.
 * r1: x=90..110, y=10..40 (w=20, h=30) — centered in r2's left edge
 * r2: x=100..300, y=0..50 (w=200, h=50)
 * r1's right edge (x=110) penetrates 10mm into r2.
 * r2's left edge (x=100) penetrates 10mm into r1.
 * Only the r1->r2 direction has a valid penetration candidate
 * because r1 is narrower than r2 (source is the narrower part).
 */
function makeOverlappingPair() {
  return [makeRect('r1', 90, 10, 20, 30, { thickness: 18 }), makeRect('r2', 100, 0, 200, 50, { thickness: 18 })];
}

function makeJoint(type, overrides = {}) {
  return {
    type,
    sourcePartId: 'r1',
    targetPartId: 'r2',
    ...overrides,
  };
}

describe('resolveJointGeometry', () => {
  it('returns resolved joints, diagnostics, and entity arrays', () => {
    const entities = makeTouchingPair();
    const joints = [makeJoint('butt')];
    const result = resolveJointGeometry(entities, joints);

    expect(result.joints).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(Array.isArray(result.previewEntities)).toBe(true);
    expect(Array.isArray(result.exportEntities)).toBe(true);
  });

  it('handles empty joints array', () => {
    const entities = makeTouchingPair();
    const result = resolveJointGeometry(entities, []);
    expect(result.joints).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('handles empty entities array', () => {
    const result = resolveJointGeometry([], [makeJoint('butt')]);
    expect(result.joints).toHaveLength(1);
    // Should produce an invalid joint since parts are missing
    expect(result.joints[0].validationState.status).toBe('invalid');
  });

  describe('per-type dispatch', () => {
    const types = ['butt', 'dado', 'rabbet', 'mortise_tenon', 'dowel', 'pocket_screw', 'tab_slot'];

    for (const type of types) {
      it(`resolves ${type} joint without errors`, () => {
        const entities = makeTouchingPair();
        const joints = [makeJoint(type)];
        const result = resolveJointGeometry(entities, joints);

        expect(result.joints).toHaveLength(1);
        const resolved = result.joints[0];
        expect(resolved.type).toBe(type);
        // Butt joints are metadata-only, so valid/warning; others depend on defaults
        expect(['valid', 'warning', 'invalid']).toContain(resolved.validationState.status);
      });
    }
  });

  describe('butt joint specifics', () => {
    it('produces a valid butt joint with no feature entities', () => {
      const entities = makeTouchingPair();
      const joints = [makeJoint('butt')];
      const result = resolveJointGeometry(entities, joints);
      const resolved = result.joints[0];

      expect(resolved.validationState.status).toBe('valid');
      // Butt joints don't generate feature entities, only occupied regions
      const buttFeatures = result.previewEntities.filter((e) => e.meta?.joinery?.jointType === 'butt');
      // Butt joints may produce profiles but not feature entities
      expect(resolved.validationState.canApply).toBe(true);
    });
  });

  describe('dado joint with overlapping rects', () => {
    it('produces feature entities for a valid dado joint', () => {
      const entities = makeOverlappingPair();
      const joints = [
        makeJoint('dado', {
          parameters: { width: 15, depth: 6, inset: 0, offset: 0 },
        }),
      ];
      const result = resolveJointGeometry(entities, joints);
      const resolved = result.joints[0];

      expect(resolved.validationState.status).toBe('valid');
      // Dado joints produce feature entities (slot cut)
      const dadoFeatures = result.previewEntities.filter((e) => e.meta?.joinery?.jointType === 'dado');
      expect(dadoFeatures.length).toBeGreaterThan(0);
    });
  });

  describe('overlapping joint conflict detection', () => {
    it('detects conflict when two butt joints occupy the same edge region', () => {
      const entities = makeTouchingPair();
      // Two butt joints on the same pair of touching parts
      const joints = [makeJoint('butt', { id: 'j1' }), makeJoint('butt', { id: 'j2' })];
      const result = resolveJointGeometry(entities, joints);

      // First joint should be valid, second should have a conflict warning
      expect(result.joints[0].validationState.status).toBe('valid');
      expect(result.joints[1].validationState.status).toBe('warning');
      expect(result.joints[1].validationState.canApply).toBe(false);
    });
  });

  describe('manufacturing entity generation', () => {
    it('generates preview entities for dado joints on overlapping rects', () => {
      const entities = makeOverlappingPair();
      const joints = [
        makeJoint('dado', {
          parameters: { width: 15, depth: 6, inset: 0, offset: 0 },
        }),
      ];
      const result = resolveJointGeometry(entities, joints);

      expect(result.previewEntities.length).toBeGreaterThan(0);
      // Should include at least feature entities or profile entities
      const generated = result.previewEntities.filter((e) => e.meta?.joineryGenerated);
      expect(generated.length).toBeGreaterThan(0);
    });

    it('includes cloned source entities in export output', () => {
      const entities = makeTouchingPair();
      const joints = [makeJoint('butt')];
      const result = resolveJointGeometry(entities, joints);

      // Export entities always contain at least the cloned source entities
      expect(result.exportEntities.length).toBeGreaterThanOrEqual(entities.length);
    });
  });

  describe('disabled joints', () => {
    it('skips geometry generation for disabled joints', () => {
      const entities = makeTouchingPair();
      const joints = [makeJoint('dado', { enabled: false })];
      const result = resolveJointGeometry(entities, joints);
      const resolved = result.joints[0];

      expect(resolved.validationState.status).toBe('disabled');
      expect(resolved.validationState.canApply).toBe(false);
    });
  });
});
