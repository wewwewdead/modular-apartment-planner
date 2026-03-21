import { describe, expect, it } from 'vitest';
import { normalizeObjectDraft, normalizePartFields, inferPartKind } from './objectNormalization';

describe('inferPartKind', () => {
  it('maps panel-like roles to panel', () => {
    expect(inferPartKind('panel')).toBe('panel');
    expect(inferPartKind('shelf')).toBe('panel');
    expect(inferPartKind('top')).toBe('panel');
    expect(inferPartKind('bottom')).toBe('panel');
    expect(inferPartKind('side')).toBe('panel');
    expect(inferPartKind('back')).toBe('panel');
    expect(inferPartKind('front')).toBe('panel');
    expect(inferPartKind('divider')).toBe('panel');
    expect(inferPartKind('generic')).toBe('panel');
  });

  it('maps rail-like roles to rail', () => {
    expect(inferPartKind('leg')).toBe('rail');
    expect(inferPartKind('support')).toBe('rail');
    expect(inferPartKind('brace')).toBe('rail');
    expect(inferPartKind('rail')).toBe('rail');
  });

  it('maps profile-like roles to profile', () => {
    expect(inferPartKind('door')).toBe('profile');
    expect(inferPartKind('drawer-front')).toBe('profile');
    expect(inferPartKind('custom-profile')).toBe('profile');
  });
});

describe('normalizePartFields', () => {
  it('returns null/undefined inputs unchanged', () => {
    expect(normalizePartFields(null)).toBeNull();
    expect(normalizePartFields(undefined)).toBeUndefined();
  });

  it('adds kind field from role mapping', () => {
    const part = { id: 'p1', role: 'shelf' };
    const result = normalizePartFields(part);
    expect(result.kind).toBe('panel');
  });

  it('preserves existing kind', () => {
    const part = { id: 'p1', role: 'shelf', kind: 'rail' };
    const result = normalizePartFields(part);
    expect(result.kind).toBe('rail');
  });

  it('adds transform from parametric.origin', () => {
    const part = {
      id: 'p1',
      role: 'panel',
      parametric: { origin: { x: 10, y: 20, z: 30 } },
    };
    const result = normalizePartFields(part);
    expect(result.transform).toEqual({
      x: 10,
      y: 20,
      z: 30,
      rotation: 0,
      mirrorX: false,
      mirrorY: false,
    });
  });

  it('adds default transform when no origin', () => {
    const part = { id: 'p1', role: 'panel' };
    const result = normalizePartFields(part);
    expect(result.transform).toEqual({
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
      mirrorX: false,
      mirrorY: false,
    });
  });

  it('preserves existing transform', () => {
    const part = { id: 'p1', role: 'panel', transform: { x: 5, y: 5, z: 5 } };
    const result = normalizePartFields(part);
    expect(result.transform).toEqual({
      x: 5,
      y: 5,
      z: 5,
      rotation: 0,
      mirrorX: false,
      mirrorY: false,
    });
  });
});

describe('normalizeObjectDraft', () => {
  it('returns null/undefined unchanged', () => {
    expect(normalizeObjectDraft(null)).toBeNull();
    expect(normalizeObjectDraft(undefined)).toBeUndefined();
  });

  it('adds objectType when missing', () => {
    const draft = { id: 'obj-1', name: 'Test', category: 'furniture', parts: [] };
    const result = normalizeObjectDraft(draft);
    expect(result.objectType).toBe('assembly');
  });

  it('preserves valid objectType', () => {
    const draft = { id: 'obj-1', objectType: 'frame', parts: [] };
    const result = normalizeObjectDraft(draft);
    expect(result.objectType).toBe('frame');
  });

  it('replaces invalid objectType with default', () => {
    const draft = { id: 'obj-1', objectType: 'invalid-type', parts: [] };
    const result = normalizeObjectDraft(draft);
    expect(result.objectType).toBe('assembly');
  });

  it('normalizes all parts', () => {
    const draft = {
      id: 'obj-1',
      parts: [
        { id: 'p1', role: 'shelf' },
        { id: 'p2', role: 'leg' },
      ],
    };
    const result = normalizeObjectDraft(draft);
    expect(result.parts[0].kind).toBe('panel');
    expect(result.parts[1].kind).toBe('rail');
  });

  it('legacy pre-Phase9 object round-trips without data loss', () => {
    const legacy = {
      id: 'object-1',
      name: 'Legacy Cabinet',
      category: 'furniture',
      bounds: { width: 1200, depth: 450, height: 900 },
      defaults: { thickness: 18, material: 'plywood' },
      parts: [
        {
          id: 'part-1',
          name: 'Left Side',
          role: 'panel',
          thickness: 18,
          material: 'plywood',
          profileEntityIds: [],
          featureIds: [],
          parametric: {
            template: 'panel',
            origin: { x: 0, y: 0, z: 0 },
            extents: { width: 18, depth: 450, height: 900 },
          },
        },
      ],
      features: [],
      anchors: [],
      footprint: { type: 'profile', points: [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 450 }, { x: 0, y: 450 }] },
    };

    const result = normalizeObjectDraft(legacy);
    expect(result.objectType).toBe('assembly');
    expect(result.name).toBe('Legacy Cabinet');
    expect(result.category).toBe('furniture');
    expect(result.bounds).toEqual(legacy.bounds);
    expect(result.parts[0].id).toBe('part-1');
    expect(result.parts[0].name).toBe('Left Side');
    expect(result.parts[0].role).toBe('panel');
    expect(result.parts[0].kind).toBe('panel');
    expect(result.parts[0].transform).toEqual({
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
      mirrorX: false,
      mirrorY: false,
    });
    expect(result.parts[0].parametric).toEqual(legacy.parts[0].parametric);
    expect(result.footprint).toEqual(legacy.footprint);
  });
});
