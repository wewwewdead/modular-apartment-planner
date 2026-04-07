import { describe, expect, it } from 'vitest';
import {
  toFiniteNumber,
  toPositiveNumber,
  toNonNegativeNumber,
  toPositiveInteger,
  normalizeJointParameterModes,
  createDefaultTolerance,
  roundJoineryValue,
  JOINT_PARAMETER_DEPTH_MODES,
  JOINT_PLACEMENT_MODES,
  DEFAULT_JOINT_CLEARANCE,
} from './jointDefaults';

describe('toFiniteNumber', () => {
  it('returns valid numbers unchanged', () => {
    expect(toFiniteNumber(5)).toBe(5);
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber(-3.14)).toBe(-3.14);
  });

  it('converts numeric strings', () => {
    expect(toFiniteNumber('123')).toBe(123);
    expect(toFiniteNumber('0')).toBe(0);
    expect(toFiniteNumber('-7.5')).toBe(-7.5);
  });

  it('returns fallback for NaN', () => {
    expect(toFiniteNumber(NaN)).toBeNull();
    expect(toFiniteNumber(NaN, 42)).toBe(42);
  });

  it('returns fallback for Infinity', () => {
    expect(toFiniteNumber(Infinity)).toBeNull();
    expect(toFiniteNumber(-Infinity, 10)).toBe(10);
  });

  it('treats empty string as 0 since Number("") is 0', () => {
    // Number('') === 0 which is finite, so it returns 0 not fallback
    expect(toFiniteNumber('')).toBe(0);
  });

  it('handles null and undefined', () => {
    // Number(null) === 0 which is finite
    expect(toFiniteNumber(null)).toBe(0);
    // Number(undefined) === NaN, so fallback
    expect(toFiniteNumber(undefined)).toBeNull();
  });

  it('returns fallback for non-numeric strings', () => {
    expect(toFiniteNumber('abc', 99)).toBe(99);
  });

  it('uses null as default fallback', () => {
    expect(toFiniteNumber('abc')).toBeNull();
  });
});

describe('toPositiveNumber', () => {
  it('returns positive numbers', () => {
    expect(toPositiveNumber(5)).toBe(5);
    expect(toPositiveNumber(0.01)).toBe(0.01);
  });

  it('returns null for zero', () => {
    expect(toPositiveNumber(0)).toBeNull();
  });

  it('returns null for negative numbers', () => {
    expect(toPositiveNumber(-1)).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(toPositiveNumber(NaN)).toBeNull();
  });

  it('returns null for non-finite values', () => {
    expect(toPositiveNumber(Infinity)).toBeNull();
  });
});

describe('toNonNegativeNumber', () => {
  it('returns non-negative numbers', () => {
    expect(toNonNegativeNumber(5)).toBe(5);
    expect(toNonNegativeNumber(0)).toBe(0);
  });

  it('returns fallback for negative numbers', () => {
    expect(toNonNegativeNumber(-1)).toBe(0);
    expect(toNonNegativeNumber(-1, 10)).toBe(10);
  });

  it('returns fallback for NaN', () => {
    expect(toNonNegativeNumber(NaN)).toBe(0);
    expect(toNonNegativeNumber(NaN, 5)).toBe(5);
  });

  it('uses 0 as default fallback', () => {
    expect(toNonNegativeNumber(undefined)).toBe(0);
  });
});

describe('toPositiveInteger', () => {
  it('returns positive integers', () => {
    expect(toPositiveInteger(3)).toBe(3);
    expect(toPositiveInteger(1)).toBe(1);
  });

  it('returns null for zero', () => {
    expect(toPositiveInteger(0)).toBeNull();
  });

  it('returns null for negative integers', () => {
    expect(toPositiveInteger(-1)).toBeNull();
  });

  it('returns null for non-integer values', () => {
    expect(toPositiveInteger(1.5)).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(toPositiveInteger(NaN)).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(toPositiveInteger(Infinity)).toBeNull();
  });
});

describe('normalizeJointParameterModes', () => {
  it('returns AUTO_OVERLAP for supported type with AUTO_CONTACT placement', () => {
    const result = normalizeJointParameterModes(
      'dado',
      JOINT_PLACEMENT_MODES.AUTO_CONTACT,
      { depth: JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP },
      {},
    );
    expect(result.depth).toBe(JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP);
  });

  it('downgrades AUTO_OVERLAP to MANUAL for MANUAL_REFS placement', () => {
    const result = normalizeJointParameterModes(
      'dado',
      JOINT_PLACEMENT_MODES.MANUAL_REFS,
      { depth: JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP },
      {},
    );
    expect(result.depth).toBe(JOINT_PARAMETER_DEPTH_MODES.MANUAL);
  });

  it('returns MANUAL for unsupported type requesting AUTO_OVERLAP', () => {
    const result = normalizeJointParameterModes(
      'butt',
      JOINT_PLACEMENT_MODES.AUTO_CONTACT,
      { depth: JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP },
      {},
    );
    expect(result.depth).toBe(JOINT_PARAMETER_DEPTH_MODES.MANUAL);
  });

  it('returns MANUAL when explicitly requested', () => {
    const result = normalizeJointParameterModes(
      'dado',
      JOINT_PLACEMENT_MODES.AUTO_CONTACT,
      { depth: JOINT_PARAMETER_DEPTH_MODES.MANUAL },
      {},
    );
    expect(result.depth).toBe(JOINT_PARAMETER_DEPTH_MODES.MANUAL);
  });

  it('defaults to AUTO_OVERLAP for supported type with AUTO_CONTACT and no explicit depth', () => {
    const result = normalizeJointParameterModes('tab_slot', JOINT_PLACEMENT_MODES.AUTO_CONTACT, {}, {});
    expect(result.depth).toBe(JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP);
  });

  it('defaults to MANUAL when explicit depth is provided and no mode requested', () => {
    const result = normalizeJointParameterModes('dado', JOINT_PLACEMENT_MODES.AUTO_CONTACT, {}, { depth: 10 });
    expect(result.depth).toBe(JOINT_PARAMETER_DEPTH_MODES.MANUAL);
  });
});

describe('createDefaultTolerance', () => {
  it('returns zero clearance and standard fit when no input is given', () => {
    // With no input, clearance resolves as toNonNegativeNumber(undefined ?? null, 0.2)
    // Number(null) is 0 which is >= 0, then roundJoineryValue(0) is 0
    const result = createDefaultTolerance();
    expect(result.clearance).toBe(0);
    expect(result.fit).toBe('standard');
  });

  it('uses custom clearance from input', () => {
    const result = createDefaultTolerance({ clearance: 0.5, fit: 'tight' });
    expect(result.clearance).toBe(0.5);
    expect(result.fit).toBe('tight');
  });

  it('uses legacy clearance parameter as fallback', () => {
    const result = createDefaultTolerance({}, 0.3);
    expect(result.clearance).toBe(0.3);
  });

  it('input clearance overrides legacy clearance', () => {
    const result = createDefaultTolerance({ clearance: 0.1 }, 0.3);
    expect(result.clearance).toBe(0.1);
  });

  it('falls back to DEFAULT_JOINT_CLEARANCE for invalid clearance', () => {
    const result = createDefaultTolerance({ clearance: -1 });
    expect(result.clearance).toBe(DEFAULT_JOINT_CLEARANCE);
  });
});

describe('roundJoineryValue', () => {
  it('rounds clean numbers to two decimal places', () => {
    expect(roundJoineryValue(3.14159)).toBe(3.14);
    expect(roundJoineryValue(10)).toBe(10);
    expect(roundJoineryValue(0)).toBe(0);
  });

  it('handles repeating decimals', () => {
    expect(roundJoineryValue(1 / 3)).toBe(0.33);
    expect(roundJoineryValue(2 / 3)).toBe(0.67);
  });

  it('returns null for NaN', () => {
    expect(roundJoineryValue(NaN)).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(roundJoineryValue(Infinity)).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(roundJoineryValue('abc')).toBeNull();
  });

  it('converts numeric strings', () => {
    expect(roundJoineryValue('3.14159')).toBe(3.14);
  });
});
