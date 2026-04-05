import { describe, expect, it } from 'vitest';
import { getJoineryPreviewVisibleEntities } from './DraftingCanvas';

describe('DraftingCanvas', () => {
  it('hides base entities that are replaced by joinery preview profiles', () => {
    const visibleEntities = [
      {
        id: 'panel',
        type: 'rect',
        x: 0,
        y: 0,
        width: 120,
        height: 18,
        visible: true,
        meta: {},
      },
      {
        id: 'label-1',
        type: 'text',
        x: 10,
        y: 10,
        text: 'Panel',
        fontSize: 12,
        visible: true,
        meta: {},
      },
    ];
    const manufacturingPreviewEntities = [
      {
        id: 'joinery-profile-panel',
        type: 'polyline',
        points: [],
        closed: true,
        visible: true,
        meta: {
          manufacturingDetailType: 'profile',
          manufacturingSourceEntityIds: ['panel'],
        },
      },
    ];

    const previewVisibleEntities = getJoineryPreviewVisibleEntities(visibleEntities, manufacturingPreviewEntities);

    expect(previewVisibleEntities.map((entity) => entity.id)).toEqual(['label-1']);
  });
});
