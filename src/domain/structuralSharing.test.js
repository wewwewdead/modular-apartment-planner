import { describe, expect, it } from 'vitest';
import { plainValuesEqual, reuseArrayIfSameElements, reuseIfEqual } from './structuralSharing';

describe('plainValuesEqual', () => {
  it('compares plain data all the way down', () => {
    expect(plainValuesEqual({ a: [1, { b: 'x' }], c: null }, { c: null, a: [1, { b: 'x' }] })).toBe(true);
    expect(plainValuesEqual({ a: [1, { b: 'x' }] }, { a: [1, { b: 'y' }] })).toBe(false);
    expect(plainValuesEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(plainValuesEqual(Number.NaN, Number.NaN)).toBe(true);
  });

  it('treats a key present as undefined as different from an absent one', () => {
    expect(plainValuesEqual({ a: undefined }, {})).toBe(false);
    expect(plainValuesEqual({}, { a: undefined })).toBe(false);
  });

  it('never calls two different non-plain objects equal', () => {
    expect(plainValuesEqual(new Map(), new Map())).toBe(false);
    expect(plainValuesEqual({ when: new Date(0) }, { when: new Date(0) })).toBe(false);
    const shared = new Map();
    expect(plainValuesEqual({ m: shared }, { m: shared })).toBe(true);
  });
});

describe('reuseIfEqual', () => {
  it('keeps the old object for an equal value and takes the new one otherwise', () => {
    const previous = { id: 't', span: 6000, sizes: { web: { depth: 90 } } };
    expect(reuseIfEqual(previous, { id: 't', span: 6000, sizes: { web: { depth: 90 } } })).toBe(previous);
    const changed = { id: 't', span: 6000, sizes: { web: { depth: 70 } } };
    expect(reuseIfEqual(previous, changed)).toBe(changed);
    expect(reuseIfEqual(previous, null)).toBe(null);
    expect(reuseIfEqual(null, changed)).toBe(changed);
  });
});

describe('reuseArrayIfSameElements', () => {
  it('keeps the old array only when every element is the same object', () => {
    const a = {};
    const b = {};
    const previous = [a, b];
    expect(reuseArrayIfSameElements(previous, [a, b])).toBe(previous);
    const next = [a, { ...b }];
    expect(reuseArrayIfSameElements(previous, next)).toBe(next);
    const shorter = [a];
    expect(reuseArrayIfSameElements(previous, shorter)).toBe(shorter);
    const fresh = [];
    expect(reuseArrayIfSameElements(undefined, fresh)).toBe(fresh);
  });
});
