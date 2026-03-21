import { describe, expect, it } from 'vitest';
import {
  applyObjectDefaultsToPart,
  buildFloorPlannerAssetFromObject,
  createObjectDraftFromSelection,
} from './objectUtils';

describe('objectUtils', () => {
  const document = {
    id: 'doc-1',
    units: 'mm',
  };

  it('creates an object draft from selection', () => {
    const selectedEntities = [
      { id: 'rect-1', type: 'rect', x: 0, y: 0, width: 1200, height: 450, layerId: 'default', rotation: 0 },
      { id: 'feature-1', type: 'feature', featureType: 'hole', shape: 'circle', cx: 120, cy: 80, diameter: 20, layerId: 'default', meta: {} },
    ];
    const draft = createObjectDraftFromSelection({ document, selectedEntities });

    expect(draft.name).toBe('Custom Object');
    expect(draft.profileEntityIds).toEqual(['rect-1']);
    expect(draft.features).toHaveLength(1);
    expect(draft.bounds).toMatchObject({ width: 1200, depth: 450 });
    expect(draft.parts).toHaveLength(1);
    expect(draft.anchors.some((anchor) => anchor.kind === 'primary')).toBe(true);
  });

  it('ignores isometric projection entities when creating objects', () => {
    const selectedEntities = [
      {
        id: 'polyline-1',
        type: 'polyline',
        points: [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 100 }],
        closed: true,
        meta: { projectionMode: 'isometric', isometricPlane: 'top' },
      },
      { id: 'rect-1', type: 'rect', x: 0, y: 0, width: 400, height: 200, layerId: 'default', rotation: 0 },
    ];

    const draft = createObjectDraftFromSelection({ document, selectedEntities });

    expect(draft.profileEntityIds).toEqual(['rect-1']);
  });

  it('applies object defaults to parts', () => {
    const part = applyObjectDefaultsToPart({
      defaults: { thickness: 21, material: 'oak' },
    }, {
      id: 'part-1',
      name: 'Shelf',
      role: 'shelf',
      thickness: 0,
      material: '',
    });

    expect(part.thickness).toBe(21);
    expect(part.material).toBe('oak');
  });

  it('builds a floor planner asset payload', () => {
    const asset = buildFloorPlannerAssetFromObject({
      id: 'object-1',
      name: 'Cabinet',
      category: 'furniture',
      footprint: { type: 'profile', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] },
      bounds: { width: 1200, depth: 450, height: 900 },
      defaults: { thickness: 18, material: 'plywood' },
      parts: [{ id: 'part-1', name: 'Body', role: 'panel', thickness: 18, material: 'plywood', profileEntityIds: ['rect-1'], featureIds: [], layerId: 'default', metadata: {} }],
      features: [],
      anchors: [{ id: 'anchor-origin', name: 'origin', x: 0, y: 0, kind: 'primary' }],
      anchor: { x: 0, y: 0, name: 'origin', kind: 'primary' },
      metadata: {},
    });

    expect(asset.objectId).toBe('object-1');
    expect(asset.bounds.height).toBe(900);
  });
});
