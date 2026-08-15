import { describe, expect, it } from 'vitest';
import {
  JOINT_FIT_CLASSES,
  JOINT_FIT_CLEARANCES_MM,
  MAX_SANE_FIT_CLEARANCE_MM,
  MIN_SANE_FIT_CLEARANCE_MM,
  createDefaultTolerance,
  describeJointFit,
  getJointFitOptions,
  isKnownJointFitClass,
  normalizeJointFitClass,
  resolveJointFitClearance,
  supportsJointFitClearance,
} from './jointDefaults';
import { validateResolvedJoint } from './jointValidationUtils';
import { normalizeJoint } from './jointSerializationUtils';
import { createMockContext } from './types/__tests__/helpers';

describe('joint fit classes', () => {
  it('applies a fit only to types with female geometry to widen', () => {
    ['dado', 'rabbet', 'tab_slot', 'mortise_tenon'].forEach((type) => {
      expect(supportsJointFitClearance(type)).toBe(true);
    });
    // Butt has no female half; dowel and pocket screw size their holes from
    // hardware data, which is already the right source of truth.
    ['butt', 'dowel', 'pocket_screw'].forEach((type) => {
      expect(supportsJointFitClearance(type)).toBe(false);
      expect(getJointFitOptions(type)).toEqual([]);
    });
  });

  it('publishes the same clearance table for every fitted type', () => {
    Object.values(JOINT_FIT_CLEARANCES_MM).forEach((table) => {
      expect(table).toEqual({ standard: 0, glue: 0.1, piston: 0.04, loose: 0.3 });
    });
  });

  it('resolves each class to its documented clearance', () => {
    expect(resolveJointFitClearance('dado', { fit: 'standard' })).toBe(0);
    expect(resolveJointFitClearance('dado', { fit: 'piston' })).toBe(0.04);
    expect(resolveJointFitClearance('dado', { fit: 'glue' })).toBe(0.1);
    expect(resolveJointFitClearance('dado', { fit: 'loose' })).toBe(0.3);
    expect(resolveJointFitClearance('tab_slot', { fit: 'custom', clearanceMm: 0.42 })).toBe(0.42);
    expect(resolveJointFitClearance('dowel', { fit: 'loose' })).toBe(0);
  });

  it('treats a missing, unknown or malformed fit as legacy (zero clearance)', () => {
    expect(resolveJointFitClearance('dado', null)).toBe(0);
    expect(resolveJointFitClearance('dado', {})).toBe(0);
    expect(resolveJointFitClearance('dado', { fit: 'tight' })).toBe(0);
    expect(resolveJointFitClearance('dado', { fit: 'custom' })).toBe(0);
    expect(resolveJointFitClearance('dado', { fit: 'custom', clearanceMm: 'nonsense' })).toBe(0);
  });

  it('preserves an unrecognized fit label instead of rewriting it', () => {
    expect(normalizeJointFitClass('tight')).toBe('tight');
    expect(isKnownJointFitClass('tight')).toBe(false);
    expect(normalizeJointFitClass('')).toBe(JOINT_FIT_CLASSES.LEGACY);
    expect(normalizeJointFitClass(undefined)).toBe(JOINT_FIT_CLASSES.LEGACY);
    // 'legacy' is a friendly alias for the wire value.
    expect(normalizeJointFitClass('legacy')).toBe(JOINT_FIT_CLASSES.LEGACY);
  });

  it('normalizes a tolerance block without disturbing the legacy allowance', () => {
    // Same defaults the pre-fit build produced.
    expect(createDefaultTolerance()).toMatchObject({ clearance: 0, fit: 'standard', clearanceMm: null });
    expect(createDefaultTolerance({ clearance: 0.5, fit: 'tight' })).toMatchObject({ clearance: 0.5, fit: 'tight' });
    expect(createDefaultTolerance({ fit: 'custom', clearanceMm: 0.25 }).clearanceMm).toBe(0.25);
  });

  it('states which half of the joint moved, in one sentence', () => {
    const fit = describeJointFit('dado', { fit: 'glue' });
    expect(fit.clearanceMm).toBe(0.1);
    expect(fit.note).toContain('female opening widened by 0.1mm');
    expect(fit.note).toContain('male part stays nominal');
    expect(describeJointFit('butt', { fit: 'glue' })).toBeNull();
  });
});

describe('pathological fit clearance warnings', () => {
  function validate(tolerance) {
    const joint = normalizeJoint({
      id: 'joint-1',
      type: 'dado',
      sourcePartId: 'part-a',
      targetPartId: 'part-b',
      tolerance,
    });
    return validateResolvedJoint(joint, createMockContext(), { width: 50, depth: 6, inset: 0, offset: 0 });
  }

  it('warns when the clearance is too loose to grip', () => {
    const state = validate({ fit: 'custom', clearanceMm: MAX_SANE_FIT_CLEARANCE_MM });
    expect(state.status).toBe('warning');
    expect(state.warnings.some((warning) => warning.includes('very loose'))).toBe(true);
  });

  it('warns on an unassemblable interference fit', () => {
    const state = validate({ fit: 'custom', clearanceMm: MIN_SANE_FIT_CLEARANCE_MM - 0.01 });
    expect(state.status).toBe('warning');
    expect(state.warnings.some((warning) => warning.includes('interference fit'))).toBe(true);
  });

  it('stays quiet for every catalog fit class and for a mild interference', () => {
    ['standard', 'piston', 'glue', 'loose'].forEach((fit) => {
      expect(validate({ fit }).warnings).toHaveLength(0);
    });
    expect(validate({ fit: 'custom', clearanceMm: MIN_SANE_FIT_CLEARANCE_MM }).warnings).toHaveLength(0);
  });

  it('stays quiet for joint types that take no fit clearance', () => {
    const joint = normalizeJoint({
      id: 'joint-2',
      type: 'butt',
      sourcePartId: 'part-a',
      targetPartId: 'part-b',
      tolerance: { fit: 'custom', clearanceMm: 5 },
    });

    expect(validateResolvedJoint(joint, createMockContext(), { offset: 0 }).warnings).toHaveLength(0);
  });
});
