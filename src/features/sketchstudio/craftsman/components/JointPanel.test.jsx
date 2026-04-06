import { describe, expect, it } from 'vitest';
import {
  getFocusedJointForEditing,
  getJointFormContextPairIds,
  getJointPanelContextMessage,
  orderSelectedJoineryEntities,
} from './JointPanel';

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
    const entities = [createRectEntity('upright', 0, 0, 18, 200), createRectEntity('shelf', 9, 40, 120, 18)];
    const selectedEntities = [...entities];
    const selectedIds = ['shelf', 'upright'];

    const orderedSelection = orderSelectedJoineryEntities(entities, selectedEntities, selectedIds);

    expect(orderedSelection.map((entity) => entity.id)).toEqual(['shelf', 'upright']);
  });

  it('uses the clicked joint pair for editing context even without a selected pair', () => {
    const editingJoint = {
      id: 'joint-dado',
      label: 'Shelf Dado',
      sourcePartId: 'shelf',
      targetPartId: 'upright',
    };

    const contextPairIds = getJointFormContextPairIds(editingJoint, []);
    const contextMessage = getJointPanelContextMessage({
      editingJoint,
      formContextPairIds: contextPairIds,
      editablePair: false,
      orderedSelectedEntities: [],
      selectedEntity: null,
    });

    expect(contextPairIds).toEqual(['shelf', 'upright']);
    expect(contextMessage).toBe('Editing pair: shelf + upright');
  });

  it('resolves the focused joint id to the matching editable joint', () => {
    const joints = [
      { id: 'joint-rabbet', label: 'Back Rabbet' },
      { id: 'joint-dado', label: 'Shelf Dado' },
    ];

    expect(getFocusedJointForEditing(joints, 'joint-dado')).toMatchObject({
      id: 'joint-dado',
      label: 'Shelf Dado',
    });
    expect(getFocusedJointForEditing(joints, 'missing-joint')).toBeNull();
    expect(getFocusedJointForEditing(joints, null)).toBeNull();
  });
});
