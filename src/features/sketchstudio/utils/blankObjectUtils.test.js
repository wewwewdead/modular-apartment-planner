import { describe, expect, it } from 'vitest';
import {
  createBlankObjectDraft,
  createManualPart,
  duplicatePart,
  mirrorPartAcrossAxis,
} from './blankObjectUtils';

describe('createBlankObjectDraft', () => {
  it('creates a valid shape with all required fields', () => {
    const draft = createBlankObjectDraft({
      document: { id: 'doc-1', units: 'mm' },
    });

    expect(draft).toHaveProperty('id');
    expect(draft).toHaveProperty('name');
    expect(draft).toHaveProperty('objectType');
    expect(draft).toHaveProperty('category');
    expect(draft).toHaveProperty('bounds');
    expect(draft).toHaveProperty('parts');
    expect(draft).toHaveProperty('features');
    expect(draft).toHaveProperty('anchors');
    expect(draft).toHaveProperty('footprint');
    expect(draft).toHaveProperty('generator');
    expect(draft).toHaveProperty('bom');
    expect(draft).toHaveProperty('constraints');
    expect(draft).toHaveProperty('patterns');
    expect(draft).toHaveProperty('metadata');
    expect(draft).toHaveProperty('isDirty');
  });

  it('generates unique ids based on existing objects', () => {
    const draft1 = createBlankObjectDraft({ existingObjects: [] });
    expect(draft1.id).toBe('object-1');

    const draft2 = createBlankObjectDraft({ existingObjects: [{ id: 'object-3' }] });
    expect(draft2.id).toBe('object-4');

    const draft3 = createBlankObjectDraft({
      existingObjects: [{ id: 'object-2' }, { id: 'object-5' }],
    });
    expect(draft3.id).toBe('object-6');
  });

  it('uses default bounds 600x400x900', () => {
    const draft = createBlankObjectDraft();
    expect(draft.bounds).toEqual({ width: 600, depth: 400, height: 900 });
  });

  it('has a primary anchor', () => {
    const draft = createBlankObjectDraft();
    const primary = draft.anchors.find((a) => a.kind === 'primary');
    expect(primary).toBeTruthy();
    expect(draft.activeAnchorId).toBe(primary.id);
  });

  it('has origin, center, and front-left anchors', () => {
    const draft = createBlankObjectDraft();
    const names = draft.anchors.map((a) => a.name);
    expect(names).toContain('origin');
    expect(names).toContain('center');
    expect(names).toContain('front-left');
  });

  it('defaults objectType to assembly and category to custom', () => {
    const draft = createBlankObjectDraft();
    expect(draft.objectType).toBe('assembly');
    expect(draft.category).toBe('custom');
    expect(draft.template).toBeNull();
    expect(draft.metadata.creationMode).toBe('blank');
  });

  it('accepts custom name, objectType, and category', () => {
    const draft = createBlankObjectDraft({
      name: 'My Desk',
      objectType: 'frame',
      category: 'custom',
    });
    expect(draft.name).toBe('My Desk');
    expect(draft.objectType).toBe('frame');
    expect(draft.category).toBe('custom');
  });

  it('reads units and sourceDocumentId from document', () => {
    const draft = createBlankObjectDraft({
      document: { id: 'doc-42', units: 'inches' },
    });
    expect(draft.units).toBe('inches');
    expect(draft.sourceDocumentId).toBe('doc-42');
  });

  it('starts with empty parts, features, and null footprint', () => {
    const draft = createBlankObjectDraft();
    expect(draft.parts).toEqual([]);
    expect(draft.features).toEqual([]);
    expect(draft.footprint).toBeNull();
  });
});

describe('createManualPart', () => {
  const baseDraft = createBlankObjectDraft({
    document: { id: 'doc-1', units: 'mm' },
  });

  it('creates a part with the correct role', () => {
    const part = createManualPart({ objectDraft: baseDraft, role: 'shelf' });
    expect(part.role).toBe('shelf');
    expect(part.parametric.template).toBe('shelf');
  });

  it('uses objectDraft defaults for thickness and material', () => {
    const draft = { ...baseDraft, defaults: { thickness: 25, material: 'birch' } };
    const part = createManualPart({ objectDraft: draft });
    expect(part.thickness).toBe(25);
    expect(part.material).toBe('birch');
  });

  it('generates sequential ids from existing parts', () => {
    const draft = {
      ...baseDraft,
      parts: [{ id: 'part-1' }, { id: 'part-2' }],
    };
    const part = createManualPart({ objectDraft: draft, name: 'Third' });
    expect(part.id).toBe('part-3');
  });

  it('auto-names when no name provided', () => {
    const part = createManualPart({ objectDraft: baseDraft });
    expect(part.name).toMatch(/Part \d+/);
  });

  it('uses objectDraft bounds for part dimensions', () => {
    const draft = { ...baseDraft, bounds: { width: 900, depth: 500, height: 1200 } };
    const part = createManualPart({ objectDraft: draft, role: 'panel' });
    expect(part.parametric.width).toBe(900);
    expect(part.parametric.height).toBe(1200);
  });

  it('allows overriding width, height, thickness, material', () => {
    const part = createManualPart({
      objectDraft: baseDraft,
      width: 300,
      height: 400,
      thickness: 12,
      material: 'mdf',
    });
    expect(part.parametric.width).toBe(300);
    expect(part.parametric.height).toBe(400);
    expect(part.thickness).toBe(12);
    expect(part.material).toBe('mdf');
  });
});

describe('duplicatePart', () => {
  const baseDraft = {
    parts: [
      {
        id: 'part-1',
        name: 'Left Side',
        role: 'panel',
        thickness: 18,
        material: 'plywood',
        profileEntityIds: ['ent-1'],
        featureIds: ['feat-1'],
        parametric: {
          template: 'panel',
          origin: { x: 0, y: 0, z: 0 },
          extents: { width: 18, depth: 450, height: 900 },
        },
        metadata: { generated: true },
      },
    ],
  };

  it('returns a new parts array with cloned part appended', () => {
    const result = duplicatePart(baseDraft, 'part-1');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('part-1');
  });

  it('assigns a new sequential id', () => {
    const result = duplicatePart(baseDraft, 'part-1');
    expect(result[1].id).toBe('part-2');
  });

  it('adds (copy) suffix to name', () => {
    const result = duplicatePart(baseDraft, 'part-1');
    expect(result[1].name).toBe('Left Side (copy)');
  });

  it('offsets parametric origin by default {x:50, y:0, z:0}', () => {
    const result = duplicatePart(baseDraft, 'part-1');
    expect(result[1].parametric.origin).toEqual({ x: 50, y: 0, z: 0 });
  });

  it('accepts custom offset', () => {
    const result = duplicatePart(baseDraft, 'part-1', { x: 0, y: 100, z: 0 });
    expect(result[1].parametric.origin).toEqual({ x: 0, y: 100, z: 0 });
  });

  it('preserves role, thickness, material, metadata', () => {
    const result = duplicatePart(baseDraft, 'part-1');
    const cloned = result[1];
    expect(cloned.role).toBe('panel');
    expect(cloned.thickness).toBe(18);
    expect(cloned.material).toBe('plywood');
    expect(cloned.metadata.generated).toBe(true);
  });

  it('clears profileEntityIds on cloned part', () => {
    const result = duplicatePart(baseDraft, 'part-1');
    expect(result[1].profileEntityIds).toEqual([]);
  });

  it('returns original parts when source not found', () => {
    const result = duplicatePart(baseDraft, 'nonexistent');
    expect(result).toEqual(baseDraft.parts);
  });

  it('deep clones parametric so mutations are isolated', () => {
    const result = duplicatePart(baseDraft, 'part-1');
    result[1].parametric.origin.x = 999;
    expect(baseDraft.parts[0].parametric.origin.x).toBe(0);
  });
});

describe('mirrorPartAcrossAxis', () => {
  const objectBounds = { width: 1200, depth: 450, height: 900 };
  const baseDraft = {
    bounds: objectBounds,
    parts: [
      {
        id: 'part-1',
        name: 'Left Side',
        role: 'panel',
        thickness: 18,
        material: 'plywood',
        profileEntityIds: ['ent-1'],
        featureIds: [],
        parametric: {
          template: 'panel',
          origin: { x: 0, y: 0, z: 0 },
          extents: { width: 18, depth: 450, height: 900 },
        },
        metadata: {},
      },
    ],
  };

  it('mirrors across X axis correctly', () => {
    const result = mirrorPartAcrossAxis(baseDraft, 'part-1', 'x');
    const mirrored = result[1];
    // x should be objectBounds.width - origin.x - extents.width = 1200 - 0 - 18 = 1182
    expect(mirrored.parametric.origin.x).toBe(1182);
    expect(mirrored.parametric.origin.y).toBe(0);
    expect(mirrored.parametric.origin.z).toBe(0);
  });

  it('mirrors across Y axis correctly', () => {
    const result = mirrorPartAcrossAxis(baseDraft, 'part-1', 'y');
    const mirrored = result[1];
    // y should be objectBounds.depth - origin.y - extents.depth = 450 - 0 - 450 = 0
    expect(mirrored.parametric.origin.y).toBe(0);
    expect(mirrored.parametric.origin.x).toBe(0);
  });

  it('assigns new id and (mirror) suffix', () => {
    const result = mirrorPartAcrossAxis(baseDraft, 'part-1', 'x');
    expect(result[1].id).toBe('part-2');
    expect(result[1].name).toBe('Left Side (mirror)');
  });

  it('clears profileEntityIds on mirrored part', () => {
    const result = mirrorPartAcrossAxis(baseDraft, 'part-1', 'x');
    expect(result[1].profileEntityIds).toEqual([]);
  });

  it('returns original parts when source not found', () => {
    const result = mirrorPartAcrossAxis(baseDraft, 'nonexistent', 'x');
    expect(result).toEqual(baseDraft.parts);
  });

  it('handles parts without parametric.origin gracefully', () => {
    const draft = {
      bounds: objectBounds,
      parts: [
        {
          id: 'part-1',
          name: 'Simple Part',
          role: 'generic',
          profileEntityIds: [],
          featureIds: [],
          metadata: {},
        },
      ],
    };
    const result = mirrorPartAcrossAxis(draft, 'part-1', 'x');
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe('Simple Part (mirror)');
  });

  it('uses objectDraft.bounds as fallback when objectBounds not provided', () => {
    const result = mirrorPartAcrossAxis(baseDraft, 'part-1', 'x', undefined);
    const mirrored = result[1];
    expect(mirrored.parametric.origin.x).toBe(1182);
  });

  it('deep clones parametric so mutations are isolated', () => {
    const result = mirrorPartAcrossAxis(baseDraft, 'part-1', 'x');
    result[1].parametric.origin.x = 999;
    expect(baseDraft.parts[0].parametric.origin.x).toBe(0);
  });
});
