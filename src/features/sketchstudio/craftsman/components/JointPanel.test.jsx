import { describe, expect, it } from 'vitest';
import { orderSelectedJoineryEntities } from './JointPanel';

function createRectEntity(id, x, y, width, height) {
  return {
    id,
    type: 'rect',
    x,
    y,
    width,
    height,
    rotation: 0,
    layerId: 'default',
    meta: {},
  };
}

describe('JointPanel', () => {
  it('orders selected joinery parts by selected id order instead of document order', () => {
    const entities = [
      createRectEntity('upright', 0, 0, 18, 200),
      createRectEntity('shelf', 9, 40, 120, 18),
    ];
    const selectedEntities = [...entities];
    const selectedIds = ['shelf', 'upright'];

    const orderedSelection = orderSelectedJoineryEntities(entities, selectedEntities, selectedIds);

    expect(orderedSelection.map((entity) => entity.id)).toEqual(['shelf', 'upright']);
  });
});
