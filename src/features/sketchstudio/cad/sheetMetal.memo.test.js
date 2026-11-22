// Perf pass 3, B2.4 (docs/perf-pass-3.md §6): foldSheet keeps a fold at the
// bends' own angles per (feature, profile, params) object. The oracle is a
// fold made with `angles` (never kept): an empty angle map poses every bend
// at its own angle, as the fold without one does.
import { describe, expect, it } from 'vitest';
import { foldSheet, sheetMetalFeature } from './sheetMetal.js';
import { sheetMetalControlBox, sheetMetalKiosk } from './shopExamples.js';
import { resolveParameters } from './model.js';

const blanks = (model) =>
  model.parts
    .map((part) => sheetMetalFeature(part))
    .filter(Boolean)
    .map((feature) => ({ feature, profile: model.sketches.find((s) => s.id === feature.sketchId)?.profile }));
const modelOf = (made) => made.model || made;

describe('foldSheet memo', () => {
  it('hands the same fold back for the same objects, equal to a fresh fold', () => {
    for (const model of [modelOf(sheetMetalKiosk()), modelOf(sheetMetalControlBox())]) {
      const params = resolveParameters(model.parameters);
      const list = blanks(model);
      expect(list.length).toBeGreaterThan(1);
      for (const { feature, profile } of list) {
        const fold = foldSheet(feature, profile, params);
        expect(foldSheet(feature, profile, params)).toBe(fold);
        expect(foldSheet(feature, profile, params, { angles: null })).toBe(fold);
        const fresh = foldSheet(feature, profile, params, { angles: {} });
        expect(fresh).not.toBe(fold);
        expect(fresh).toEqual(fold);
      }
    }
  });

  it('folds again for another feature, profile or parameters object, and never keeps a posed fold', () => {
    const model = modelOf(sheetMetalKiosk());
    const params = resolveParameters(model.parameters);
    const { feature, profile } = blanks(model)[0];
    const fold = foldSheet(feature, profile, params);
    const copy = { ...feature };
    expect(foldSheet(copy, profile, params)).not.toBe(fold);
    expect(foldSheet(copy, profile, params)).toEqual(fold);
    expect(foldSheet(feature, { ...profile }, params)).not.toBe(fold);
    expect(foldSheet(feature, profile, { ...params })).not.toBe(fold);
    const bend = fold.bends[0];
    const posed = foldSheet(feature, profile, params, { angles: { [bend.id]: 0 } });
    expect(posed).not.toBe(foldSheet(feature, profile, params, { angles: { [bend.id]: 0 } }));
    expect(foldSheet(feature, profile, params)).toBe(fold);
    // Parameters left out: a new {} each call, so nothing is shared.
    expect(foldSheet(feature, profile)).not.toBe(foldSheet(feature, profile));
  });

  it('keeps no refusal: a blank that does not fold throws every time', () => {
    const model = modelOf(sheetMetalKiosk());
    const params = resolveParameters(model.parameters);
    const { feature, profile } = blanks(model)[0];
    const broken = { ...feature, thickness: 0 };
    expect(() => foldSheet(broken, profile, params)).toThrow(/thickness/i);
    expect(() => foldSheet(broken, profile, params)).toThrow(/thickness/i);
  });
});
