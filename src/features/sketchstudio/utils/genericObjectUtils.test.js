import { describe, expect, it } from 'vitest';
import {
  computeGenericObjectBounds,
  computeGenericObjectFootprint,
  migrateLegacyObjectDraft,
} from './genericObjectUtils';

describe('genericObjectUtils', () => {
  it('migrates legacy generator metadata into the generic draft shape', () => {
    const draft = migrateLegacyObjectDraft({
      id: 'object-1',
      name: 'Legacy Shelving',
      generator: {
        type: 'shelvingUnit',
        params: { width: 900 },
      },
      parts: [],
    });

    expect(draft.template).toEqual({
      id: 'shelvingUnit',
      source: 'generator',
      label: 'shelvingUnit',
      metadata: {},
    });
    expect(draft.metadata.creationMode).toBe('generator');
  });

  it('computes bounds and footprint from generic part extents', () => {
    const objectDraft = {
      bounds: { width: 0, depth: 0, height: 0 },
      parts: [
        {
          id: 'part-1',
          parametric: {
            origin: { x: 0, y: 0, z: 0 },
            extents: { width: 50, depth: 400, height: 900 },
          },
        },
        {
          id: 'part-2',
          parametric: {
            origin: { x: 550, y: 0, z: 0 },
            extents: { width: 50, depth: 400, height: 900 },
          },
        },
      ],
    };

    expect(computeGenericObjectBounds(objectDraft)).toEqual({
      width: 600,
      depth: 400,
      height: 900,
    });
    expect(computeGenericObjectFootprint(objectDraft)).toEqual({
      type: 'profile',
      points: [
        { x: 0, y: 0 },
        { x: 600, y: 0 },
        { x: 600, y: 400 },
        { x: 0, y: 400 },
      ],
    });
  });
});

