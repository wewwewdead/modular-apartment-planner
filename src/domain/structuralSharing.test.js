import { describe, expect, it } from 'vitest';
import { plainValuesEqual, reuseArrayIfSameElements, reuseIfEqual, reuseUnchanged } from './structuralSharing';

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

describe('reuseUnchanged', () => {
  it('hands back the old value when the new one is the same, all the way down', () => {
    const previous = { id: 'b', site: { boundary: [{ x: 0, y: 0 }] }, list: [1, 'two', null] };
    expect(reuseUnchanged(previous, { id: 'b', site: { boundary: [{ x: 0, y: 0 }] }, list: [1, 'two', null] })).toBe(
      previous,
    );
    expect(reuseUnchanged(Number.NaN, Number.NaN)).toBeNaN();
  });

  it('keeps the unchanged parts of a value that changed', () => {
    const site = { boundary: [{ x: 0, y: 0 }] };
    const shaftA = { id: 'a', origin: { x: 1, y: 1 } };
    const shaftB = { id: 'b', origin: { x: 2, y: 2 } };
    const previous = { site, systems: { shafts: [shaftA, shaftB] } };
    const next = {
      site: { boundary: [{ x: 0, y: 0 }] },
      systems: {
        shafts: [
          { id: 'a', origin: { x: 1, y: 1 } },
          { id: 'b', origin: { x: 9, y: 2 } },
        ],
      },
    };
    const result = reuseUnchanged(previous, next);

    expect(result).not.toBe(previous);
    expect(result).not.toBe(next);
    expect(result.site).toBe(site);
    expect(result.systems.shafts[0]).toBe(shaftA);
    expect(result.systems.shafts[1]).toBe(next.systems.shafts[1]);
    expect(JSON.stringify(result)).toBe(JSON.stringify(next));
  });

  it('never reuses an object whose keys come in another order, and keeps the new order', () => {
    const previous = { a: 1, b: { c: 2 } };
    const next = { b: { c: 2 }, a: 1 };
    const result = reuseUnchanged(previous, next);
    expect(result).not.toBe(previous);
    expect(result.b).toBe(previous.b);
    expect(Object.keys(result)).toEqual(['b', 'a']);
    expect(JSON.stringify(result)).toBe(JSON.stringify(next));
  });

  it('tells a key set to undefined from a missing one, and a shorter array from a longer one', () => {
    const previous = { a: 1 };
    const withUndefined = { a: 1, b: undefined };
    expect(reuseUnchanged(previous, withUndefined)).toBe(withUndefined);
    const list = [1, 2];
    const longer = [1, 2, 3];
    expect(reuseUnchanged(list, longer)).toBe(longer);
    const shorter = [1];
    expect(reuseUnchanged(list, shorter)).toBe(shorter);
  });

  it('keeps anything but plain data only by identity', () => {
    const when = new Date(0);
    expect(reuseUnchanged({ when }, { when: new Date(0) }).when).not.toBe(when);
    const shared = new Map();
    const previous = { m: shared };
    expect(reuseUnchanged(previous, { m: shared })).toBe(previous);
    const bare = Object.assign(Object.create(null), { a: 1 });
    expect(reuseUnchanged({ a: 1 }, bare)).toBe(bare);
  });

  it('writes into neither argument', () => {
    const previous = Object.freeze({ a: Object.freeze([Object.freeze({ x: 1 })]), b: 1 });
    const next = Object.freeze({ a: Object.freeze([Object.freeze({ x: 1 })]), b: 2 });
    const result = reuseUnchanged(previous, next);
    expect(result.a).toBe(previous.a);
    expect(result.b).toBe(2);
  });
});
