import { useCallback } from 'react';
import { setDocumentEntities, startHandleDrag, startTransform } from '../store/sketchStudioActions';
import { toggleBrokenLineForEntities } from '../utils/entityUtils';
import { mirrorEntities, rotateEntities } from '../utils/transformUtils';

export default function useSketchTransform(state, dispatch, viewportHook, selection) {
  const { readCanvasPoint, readWorldPoint } = viewportHook;
  const { selectedIds, selectedEntity, selectionBounds } = selection;
  // The frame and the handles belong to the select tool. A drawing tool leaves
  // what it drew selected, so its next click (the end of the line just drawn,
  // a point inside the last rectangle) lands on them; with another tool armed
  // the press goes through to the canvas and the tool gets its click.
  const ownsPresses = state.ui.activeTool === 'select';

  const handleTransformPointerDown = useCallback(
    (transformType, event, options = {}) => {
      if (!ownsPresses) return;
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
    [dispatch, ownsPresses, readCanvasPoint, readWorldPoint, state.document.entities, selectedIds],
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
      if (!ownsPresses || !selectedEntity) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dispatch(startHandleDrag({ entityId: selectedEntity.id, handleId: handle.id, pointerId: event.pointerId }));
    },
    [dispatch, ownsPresses, selectedEntity],
  );

  return {
    handleTransformPointerDown,
    handleRotateSelection,
    handleFlipSelection,
    handleToggleBrokenLines,
    handleHandlePointerDown,
  };
}
