import { mergeSelection } from './sketchConstants';

export function resolveSelectPointerDownAction({
  hoveredEntityId,
  expandedSelectionIds = [],
  selectedIds = [],
  shiftKey = false,
}) {
  if (!hoveredEntityId) {
    return {
      intent: 'selection-box',
      selectionIds: [],
    };
  }

  const targetSelectionIds = expandedSelectionIds.length ? expandedSelectionIds : [hoveredEntityId];
  const isTargetAlreadySelected =
    targetSelectionIds.length > 0 && targetSelectionIds.every((entityId) => selectedIds.includes(entityId));

  if (isTargetAlreadySelected) {
    return {
      intent: 'transform-current-selection',
      selectionIds: selectedIds,
    };
  }

  return {
    intent: 'transform-next-selection',
    selectionIds: mergeSelection(selectedIds, targetSelectionIds, shiftKey),
  };
}
