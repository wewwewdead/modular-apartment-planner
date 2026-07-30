import { describe, expect, it } from 'vitest';
import { resolveSelectPointerDownAction } from './selectPointerUtils';

describe('resolveSelectPointerDownAction', () => {
  it('starts a selection box when no entity is hovered', () => {
    expect(
      resolveSelectPointerDownAction({
        hoveredEntityId: null,
        expandedSelectionIds: [],
        selectedIds: ['entity-a'],
      }),
    ).toEqual({
      intent: 'selection-box',
      selectionIds: [],
    });
  });

  it('moves the current selection when the hovered target is already selected', () => {
    expect(
      resolveSelectPointerDownAction({
        hoveredEntityId: 'entity-a',
        expandedSelectionIds: ['entity-a', 'entity-b'],
        selectedIds: ['entity-a', 'entity-b', 'entity-c'],
      }),
    ).toEqual({
      intent: 'transform-current-selection',
      selectionIds: ['entity-a', 'entity-b', 'entity-c'],
    });
  });

  it('returns select-only when hovering an unselected entity', () => {
    expect(
      resolveSelectPointerDownAction({
        hoveredEntityId: 'entity-b',
        expandedSelectionIds: ['entity-b'],
        selectedIds: ['entity-a'],
      }),
    ).toEqual({
      intent: 'select-only',
      selectionIds: ['entity-b'],
    });
  });

  it('expands grouped targets when selecting an unselected group', () => {
    expect(
      resolveSelectPointerDownAction({
        hoveredEntityId: 'group-a-1',
        expandedSelectionIds: ['group-a-1', 'group-a-2'],
        selectedIds: [],
      }),
    ).toEqual({
      intent: 'select-only',
      selectionIds: ['group-a-1', 'group-a-2'],
    });
  });

  it('merges the hit entity into the current selection when shift is held', () => {
    expect(
      resolveSelectPointerDownAction({
        hoveredEntityId: 'entity-b',
        expandedSelectionIds: ['entity-b'],
        selectedIds: ['entity-a'],
        shiftKey: true,
      }),
    ).toEqual({
      intent: 'select-only',
      selectionIds: ['entity-a', 'entity-b'],
    });
  });
});
