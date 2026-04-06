import { useCallback } from 'react';
import { setDocumentEntities, startHandleDrag, startTransform } from '../store/sketchStudioActions';
import { toggleBrokenLineForEntities } from '../utils/entityUtils';
import { mirrorEntities, rotateEntities } from '../utils/transformUtils';

export default function useSketchTransform(state, dispatch, viewportHook, selection) {
  const { readCanvasPoint, readWorldPoint } = viewportHook;
  const { selectedIds, selectedEntity, selectionBounds } = selection;

  const handleTransformPointerDown = useCallback(
    (transformType, event, options = {}) => {
      event.stopPropagation();
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const worldPoint = readWorldPoint(readCanvasPoint(event));
      const entityIds = options.entityIds ?? selectedIds;
      const copyMode = transformType === 'move' && event.ctrlKey ? 'pending' : 'off';
      if (!entityIds.length) return;
      dispatch(
        startTransform({
          type: transformType,
          pointerId: event.pointerId,
          startWorld: worldPoint,
          startAngle: options.pivot ? Math.atan2(worldPoint.y - options.pivot.y, worldPoint.x - options.pivot.x) : 0,
          pivot: options.pivot ?? null,
          entityIds,
          startEntities: state.document.entities,
          copyMode,
          copiedEntityIds: [],
        }),
      );
    },
    [dispatch, readCanvasPoint, readWorldPoint, state.document.entities, selectedIds],
  );

  const handleRotateSelection = useCallback(
    (degrees) => {
      if (!selectedIds.length || !selectionBounds) return;
      const pivot = {
        x: (selectionBounds.minX + selectionBounds.maxX) / 2,
        y: (selectionBounds.minY + selectionBounds.maxY) / 2,
      };
      dispatch(
        setDocumentEntities(rotateEntities(state.document.entities, selectedIds, pivot, (degrees * Math.PI) / 180)),
      );
    },
    [dispatch, selectedIds, selectionBounds, state.document.entities],
  );

  const handleFlipSelection = useCallback(
    (direction) => {
      if (!selectedIds.length || !selectionBounds) return;
      const pivot = {
        x: (selectionBounds.minX + selectionBounds.maxX) / 2,
        y: (selectionBounds.minY + selectionBounds.maxY) / 2,
      };
      dispatch(setDocumentEntities(mirrorEntities(state.document.entities, selectedIds, pivot, direction)));
    },
    [dispatch, selectedIds, selectionBounds, state.document.entities],
  );

  const handleToggleBrokenLines = useCallback(() => {
    if (!selectedIds.length) return;
    dispatch(setDocumentEntities(toggleBrokenLineForEntities(state.document.entities, selectedIds)));
  }, [dispatch, selectedIds, state.document.entities]);

  const handleHandlePointerDown = useCallback(
    (handle, event) => {
      if (!selectedEntity) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dispatch(startHandleDrag({ entityId: selectedEntity.id, handleId: handle.id, pointerId: event.pointerId }));
    },
    [dispatch, selectedEntity],
  );

  return {
    handleTransformPointerDown,
    handleRotateSelection,
    handleFlipSelection,
    handleToggleBrokenLines,
    handleHandlePointerDown,
  };
}
