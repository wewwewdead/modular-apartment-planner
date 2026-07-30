import { describe, expect, it } from 'vitest';
import {
  createTrussInstance,
  deriveTrussPitchFromRise,
  deriveTrussRiseFromPitch,
  getDefaultTrussTypes,
  getTrussRun,
  normalizeTrussInstance,
  resolveTrussType,
} from './trussModels';

// RISE is the single geometric source of truth for a truss instance; pitch is a
// derived/alternative INPUT. These tests pin the coupling that keeps the two
// consistent in every place an instance is created or normalized.

describe('rise/pitch derivation helpers', () => {
  it('uses span/2 as the run for the gable family and the full span otherwise', () => {
    expect(getTrussRun(8000, 'gable')).toBe(4000);
    expect(getTrussRun(6000, 'shed')).toBe(6000);
    expect(getTrussRun(7200, 'flat')).toBe(7200);
  });

  it('round-trips rise -> pitch -> rise for a gable', () => {
    const rise = 2000;
    const pitch = deriveTrussPitchFromRise(rise, 8000, 'gable');
    expect(pitch).toBeCloseTo(50, 6);
    expect(deriveTrussRiseFromPitch(pitch, 8000, 'gable')).toBeCloseTo(rise, 6);
  });

  it('forces pitch to zero for a flat truss regardless of rise', () => {
    expect(deriveTrussPitchFromRise(900, 7200, 'flat')).toBe(0);
    expect(deriveTrussRiseFromPitch(25, 7200, 'flat')).toBe(0);
  });
});

describe('createTrussInstance rise/pitch coupling', () => {
  it('derives rise from pitch when only pitch is given', () => {
    const instance = createTrussInstance({ trussTypeId: 'truss_type_gable', span: 8000, pitch: 50 });
    expect(instance.pitch).toBe(50);
    // run = span/2 = 4000; rise = 50% * 4000 = 2000.
    expect(instance.rise).toBeCloseTo(2000, 6);
  });

  it('derives pitch from rise when only rise is given (rise wins)', () => {
    const instance = createTrussInstance({ trussTypeId: 'truss_type_gable', span: 8000, rise: 2000 });
    expect(instance.rise).toBe(2000);
    expect(instance.pitch).toBeCloseTo(50, 6);
  });

  it('lets an explicit rise win over a conflicting explicit pitch', () => {
    const instance = createTrussInstance({ trussTypeId: 'truss_type_gable', span: 8000, rise: 2000, pitch: 25 });
    expect(instance.rise).toBe(2000);
    expect(instance.pitch).toBeCloseTo(50, 6);
  });

  it('produces a self-consistent default pair (default pitch derived from default rise)', () => {
    // The truss-type default pitch is NOT trusted; pitch is recomputed from the
    // default rise so a freshly created instance never carries a stale pair.
    for (const trussType of getDefaultTrussTypes()) {
      const instance = createTrussInstance({ trussTypeId: trussType.id });
      const expectedPitch = deriveTrussPitchFromRise(instance.rise, instance.span, trussType.family);
      expect(instance.pitch).toBeCloseTo(expectedPitch, 6);
    }
  });

  it('keeps flat trusses at pitch zero', () => {
    const instance = createTrussInstance({ trussTypeId: 'truss_type_flat', span: 7200, rise: 900 });
    expect(instance.rise).toBe(900);
    expect(instance.pitch).toBe(0);
  });
});

describe('normalizeTrussInstance rise/pitch coupling', () => {
  it('trusts a stored rise and refreshes a stale pitch (legacy inconsistent pair)', () => {
    const normalized = normalizeTrussInstance({
      trussTypeId: 'truss_type_gable',
      span: 8000,
      rise: 2000,
      pitch: 25, // stale value stored in a legacy save
    });
    expect(normalized.rise).toBe(2000);
    expect(normalized.pitch).toBeCloseTo(50, 6);
  });

  it('derives rise from a stored pitch when rise is missing', () => {
    const trussType = resolveTrussType('truss_type_gable');
    const normalized = normalizeTrussInstance({
      trussTypeId: 'truss_type_gable',
      span: 8000,
      pitch: 50,
    });
    expect(normalized.pitch).toBe(50);
    expect(normalized.rise).toBeCloseTo(2000, 6);
    // Sanity: not the raw truss-type default rise.
    expect(normalized.rise).not.toBeCloseTo(trussType.defaultRise, 6);
  });
});
