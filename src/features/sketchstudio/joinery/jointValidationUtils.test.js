import { describe, expect, it } from 'vitest';
import {
  createValidationState,
  createJointDiagnostic,
  detectOccupiedRegionConflicts,
  validateResolvedJoint,
  buildConflictValidationState,
} from './jointValidationUtils';

describe('createValidationState', () => {
  it('creates a pending state by default', () => {
    const state = createValidationState();
    expect(state.status).toBe('pending');
    expect(state.reasons).toEqual([]);
    expect(state.warnings).toEqual([]);
    expect(state.canApply).toBe(false);
    expect(state.generatedEntityIds).toEqual([]);
  });

  it('creates a valid state with canApply true', () => {
    const state = createValidationState('valid');
    expect(state.status).toBe('valid');
    expect(state.canApply).toBe(true);
  });

  it('creates an invalid state with reasons', () => {
    const state = createValidationState('invalid', {
      reasons: ['missing part', 'bad dimension'],
      canApply: false,
    });
    expect(state.status).toBe('invalid');
    expect(state.reasons).toEqual(['missing part', 'bad dimension']);
    expect(state.canApply).toBe(false);
  });

  it('filters out falsy reasons and warnings', () => {
    const state = createValidationState('warning', {
      reasons: ['valid', null, '', undefined],
      warnings: ['warn', false, 0],
    });
    expect(state.reasons).toEqual(['valid']);
    expect(state.warnings).toEqual(['warn']);
  });

  it('deduplicates generated entity IDs', () => {
    const state = createValidationState('valid', {
      generatedEntityIds: ['a', 'b', 'a', 'c', 'b'],
    });
    expect(state.generatedEntityIds).toEqual(['a', 'b', 'c']);
  });
});

describe('detectOccupiedRegionConflicts', () => {
  it('returns empty array when no regions overlap', () => {
    const existing = [{ jointId: 'j1', partId: 'p1', edgeKey: 'top', start: 0, end: 50 }];
    const next = [{ jointId: 'j2', partId: 'p1', edgeKey: 'top', start: 60, end: 100 }];
    expect(detectOccupiedRegionConflicts(existing, next)).toEqual([]);
  });

  it('detects overlapping regions on the same part and edge', () => {
    const existing = [{ jointId: 'j1', partId: 'p1', edgeKey: 'top', start: 0, end: 50 }];
    const next = [{ jointId: 'j2', partId: 'p1', edgeKey: 'top', start: 40, end: 80 }];
    const conflicts = detectOccupiedRegionConflicts(existing, next);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain('j1');
    expect(conflicts[0]).toContain('p1:top');
  });

  it('ignores regions on different parts', () => {
    const existing = [{ jointId: 'j1', partId: 'p1', edgeKey: 'top', start: 0, end: 50 }];
    const next = [{ jointId: 'j2', partId: 'p2', edgeKey: 'top', start: 0, end: 50 }];
    expect(detectOccupiedRegionConflicts(existing, next)).toEqual([]);
  });

  it('ignores regions on different edges', () => {
    const existing = [{ jointId: 'j1', partId: 'p1', edgeKey: 'top', start: 0, end: 50 }];
    const next = [{ jointId: 'j2', partId: 'p1', edgeKey: 'bottom', start: 0, end: 50 }];
    expect(detectOccupiedRegionConflicts(existing, next)).toEqual([]);
  });

  it('handles barely-touching regions as non-conflicting (within tolerance)', () => {
    const existing = [{ jointId: 'j1', partId: 'p1', edgeKey: 'top', start: 0, end: 50 }];
    const next = [{ jointId: 'j2', partId: 'p1', edgeKey: 'top', start: 50, end: 100 }];
    expect(detectOccupiedRegionConflicts(existing, next)).toEqual([]);
  });

  it('returns empty for empty inputs', () => {
    expect(detectOccupiedRegionConflicts([], [])).toEqual([]);
    expect(detectOccupiedRegionConflicts()).toEqual([]);
  });
});

describe('buildConflictValidationState', () => {
  it('merges conflict messages into warnings', () => {
    const base = createValidationState('valid', { warnings: ['existing warning'] });
    const result = buildConflictValidationState(base, ['conflict 1', 'conflict 2']);
    expect(result.status).toBe('warning');
    expect(result.warnings).toContain('existing warning');
    expect(result.warnings).toContain('conflict 1');
    expect(result.warnings).toContain('conflict 2');
    expect(result.canApply).toBe(false);
  });

  it('preserves reasons from base state', () => {
    const base = createValidationState('invalid', { reasons: ['bad input'] });
    const result = buildConflictValidationState(base, ['conflict']);
    expect(result.reasons).toContain('bad input');
  });
});

describe('validateResolvedJoint', () => {
  it('returns disabled state when joint is disabled', () => {
    const joint = { enabled: false, type: 'butt' };
    const result = validateResolvedJoint(joint, {}, {});
    expect(result.status).toBe('disabled');
    expect(result.canApply).toBe(false);
  });

  it('returns invalid state when context has an error', () => {
    const joint = { enabled: true, type: 'butt' };
    const context = { error: 'Missing parts.' };
    const result = validateResolvedJoint(joint, context, {});
    expect(result.status).toBe('invalid');
    expect(result.reasons).toContain('Missing parts.');
  });

  it('returns invalid state when context is null', () => {
    const joint = { enabled: true, type: 'butt' };
    const result = validateResolvedJoint(joint, null, {});
    expect(result.status).toBe('invalid');
  });

  it('returns valid state for a properly configured butt joint', () => {
    const joint = { enabled: true, type: 'butt', tolerance: { clearance: 0.2 } };
    const context = {
      overlap: { start: 0, end: 100, length: 100, center: 50 },
      sourceEdge: { edgeKey: 'right', start: 0, end: 100 },
      targetEdge: { edgeKey: 'left', start: 0, end: 100 },
      sourceThickness: 18,
      targetThickness: 18,
      fabricationReady: true,
      missingThicknessPartIds: [],
    };
    const parameters = { offset: 0 };
    const result = validateResolvedJoint(joint, context, parameters);
    expect(result.status).toBe('valid');
    expect(result.canApply).toBe(true);
  });

  it('returns warning state when parts are missing thickness', () => {
    const joint = { enabled: true, type: 'butt' };
    const context = {
      overlap: { start: 0, end: 100, length: 100, center: 50 },
      sourceEdge: { edgeKey: 'right', start: 0, end: 100 },
      targetEdge: { edgeKey: 'left', start: 0, end: 100 },
      sourceThickness: null,
      targetThickness: null,
      fabricationReady: false,
      missingThicknessPartIds: ['part-a', 'part-b'],
    };
    const result = validateResolvedJoint(joint, context, {});
    expect(result.status).toBe('warning');
    expect(result.warnings.some((w) => w.includes('thickness'))).toBe(true);
  });
});

describe('createJointDiagnostic', () => {
  it('creates a diagnostic for a valid joint', () => {
    const joint = {
      id: 'j1',
      type: 'dado',
      label: 'My Dado',
      validationState: createValidationState('valid', { canApply: true }),
    };
    const diag = createJointDiagnostic(joint);
    expect(diag.jointId).toBe('j1');
    expect(diag.type).toBe('dado');
    expect(diag.label).toBe('My Dado');
    expect(diag.status).toBe('applied');
    expect(diag.canApply).toBe(true);
  });

  it('creates a diagnostic for an invalid joint', () => {
    const joint = {
      id: 'j2',
      type: 'butt',
      validationState: createValidationState('invalid', {
        reasons: ['Missing parts.'],
        canApply: false,
      }),
    };
    const diag = createJointDiagnostic(joint);
    expect(diag.status).toBe('invalid');
    expect(diag.message).toContain('Missing parts.');
    expect(diag.canApply).toBe(false);
  });

  it('creates a diagnostic for a joint with no validation state', () => {
    const joint = { id: 'j3', type: 'rabbet' };
    const diag = createJointDiagnostic(joint);
    expect(diag.status).toBe('invalid');
    expect(diag.canApply).toBe(false);
  });
});
