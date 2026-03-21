import { describe, expect, it } from 'vitest';
import { recomputeObjectDraftDerivedData } from './derivedObjectUtils';

describe('derivedObjectUtils', () => {
  it('recomputes bounds, footprint, anchors, and bom from parametric parts', () => {
    const draft = recomputeObjectDraftDerivedData({
      id: 'object-1',
      name: 'Cabinet',
      bounds: { width: 0, depth: 0, height: 0 },
      footprint: null,
      anchors: [],
      parts: [
        {
          id: 'part-1',
          name: 'Left Panel',
          role: 'panel',
          thickness: 18,
          material: 'plywood',
          parametric: {
            template: 'panel',
            width: 18,
            height: 900,
            depth: 450,
            thickness: 18,
            origin: { x: 0, y: 0, z: 0 },
            extents: { width: 18, depth: 450, height: 900 },
          },
        },
        {
          id: 'part-2',
          name: 'Right Panel',
          role: 'panel',
          thickness: 18,
          material: 'plywood',
          parametric: {
            template: 'panel',
            width: 18,
            height: 900,
            depth: 450,
            thickness: 18,
            origin: { x: 1182, y: 0, z: 0 },
            extents: { width: 18, depth: 450, height: 900 },
          },
        },
      ],
    }, []);

    expect(draft.bounds).toMatchObject({ width: 1200, depth: 450, height: 900 });
    expect(draft.footprint.points).toHaveLength(4);
    expect(draft.anchors.some((anchor) => anchor.kind === 'primary')).toBe(true);
    expect(draft.bom.rows).toHaveLength(2);
  });
});
