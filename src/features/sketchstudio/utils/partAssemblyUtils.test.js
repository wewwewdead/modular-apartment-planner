import { describe, expect, it } from 'vitest';
import {
  assignSelectionToPart,
  clonePartArray,
  createManualPart,
  updatePartTransform,
} from './partAssemblyUtils';

describe('partAssemblyUtils', () => {
  const baseDraft = {
    bounds: { width: 600, depth: 400, height: 900 },
    defaults: { thickness: 18, material: 'plywood' },
    parts: [],
  };

  it('creates manual parts with a canonical transform', () => {
    const part = createManualPart({ objectDraft: baseDraft, role: 'panel' });
    expect(part.transform).toEqual({
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
      mirrorX: false,
      mirrorY: false,
    });
  });

  it('assigns selected geometry ids to a part', () => {
    const parts = assignSelectionToPart([{ id: 'part-1', profileEntityIds: [] }], 'part-1', ['a', 'b', 'a']);
    expect(parts[0].profileEntityIds).toEqual(['a', 'b']);
  });

  it('updates transform and syncs parametric origin', () => {
    const parts = updatePartTransform([{
      id: 'part-1',
      transform: { x: 0, y: 0, z: 0, rotation: 0, mirrorX: false, mirrorY: false },
      parametric: {
        origin: { x: 0, y: 0, z: 0 },
      },
    }], 'part-1', { x: 120, rotation: 90 });

    expect(parts[0].transform.x).toBe(120);
    expect(parts[0].transform.rotation).toBe(90);
    expect(parts[0].parametric.origin.x).toBe(120);
  });

  it('creates simple clone arrays with safe copied references', () => {
    const parts = clonePartArray({
      parts: [{
        id: 'part-1',
        name: 'Rail',
        profileEntityIds: ['geom-1'],
        featureIds: ['feat-1'],
        transform: { x: 0, y: 0, z: 0, rotation: 0, mirrorX: false, mirrorY: false },
        parametric: {
          origin: { x: 0, y: 0, z: 0 },
          extents: { width: 100, depth: 18, height: 18 },
        },
        metadata: {},
      }],
    }, 'part-1', { axis: 'x', count: 3, spacing: 120 });

    expect(parts).toHaveLength(3);
    expect(parts[1].profileEntityIds).toEqual([]);
    expect(parts[2].transform.x).toBe(240);
  });
});

