import { useCallback, useMemo } from 'react';
import { useClipboard } from '@/app/ClipboardProvider';
import { useEditor } from '@/app/EditorProvider';
import { useProject } from '@/app/ProjectProvider';
import {
  buildPlanClipboardPayload,
  countPlanContent,
  cutPlanSelectionFromFloor,
  materializePlanClipboardContent,
  pastePlanClipboardOnFloor,
} from './planClipboard';

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function usePlanClipboardController() {
  const { project, dispatch, getFloor } = useProject();
  const editor = useEditor();
  const { clipboard, hasClipboard, setClipboard } = useClipboard();
  const {
    activeFloorId,
    workspaceMode,
    viewMode,
    regionSelection,
    pastePreview,
    dispatch: editorDispatch,
  } = editor;

  const isPlanView = workspaceMode === 'model' && viewMode === 'plan';
  const floor = getFloor(activeFloorId);

  const previewContent = useMemo(() => {
    if (!pastePreview?.active || !clipboard || !pastePreview.point) return null;
    return materializePlanClipboardContent(clipboard, pastePreview.point);
  }, [clipboard, pastePreview]);

  const captureSelection = useCallback((store = true) => {
    if (!isPlanView || !floor) {
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Clipboard works only in the plan editor.' });
      return null;
    }

    if (!regionSelection?.objectCount) {
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Drag a selection region first.' });
      return null;
    }

    const payload = buildPlanClipboardPayload({
      projectId: project.id,
      floorId: activeFloorId,
      floor,
      regionSelection,
    });

    if (!payload.objectCount) {
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: 'Nothing copyable was found in the selected region.',
      });
      return null;
    }

    if (store) {
      setClipboard(payload);
    }
    return payload;
  }, [activeFloorId, editorDispatch, floor, isPlanView, project.id, regionSelection, setClipboard]);

  const copySelection = useCallback(() => {
    const payload = captureSelection();
    if (!payload) return false;

    const skipped = Math.max(0, (payload.sourceSelectionCount || 0) - payload.objectCount);
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: skipped
        ? `Copied ${pluralize(payload.objectCount, 'object')}; ${pluralize(skipped, 'item')} skipped because required references were not selected.`
        : `Copied ${pluralize(payload.objectCount, 'object')}.`,
    });
    return true;
  }, [captureSelection, editorDispatch]);

  const cutSelection = useCallback(() => {
    const payload = captureSelection(false);
    if (!payload) return false;

    const nextFloor = cutPlanSelectionFromFloor(floor, regionSelection.selection);
    const removedCount = countPlanContent(floor) - countPlanContent(nextFloor);

    if (payload.objectCount !== payload.sourceSelectionCount || removedCount !== payload.objectCount) {
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: 'Cut requires every dependent item that would be removed to be fully selected. Expand the region and try again.',
      });
      return false;
    }

    setClipboard(payload);
    dispatch({ type: 'FLOOR_REPLACE', floorId: activeFloorId, floor: nextFloor });
    editorDispatch({ type: 'DESELECT' });
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: `Cut ${pluralize(payload.objectCount, 'object')}. Load another project and paste into its plan.`,
    });
    return true;
  }, [activeFloorId, captureSelection, dispatch, editorDispatch, floor, regionSelection, setClipboard]);

  const beginPaste = useCallback((point = null) => {
    if (!isPlanView || !floor) {
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Paste works only in the plan editor.' });
      return false;
    }
    if (!hasClipboard || !clipboard) {
      editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Clipboard is empty.' });
      return false;
    }

    editorDispatch({
      type: 'START_PASTE_PREVIEW',
      point,
    });
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: 'Move the cursor over the destination plan and click to place the clipboard.',
    });
    return true;
  }, [clipboard, editorDispatch, floor, hasClipboard, isPlanView]);

  const updatePastePreview = useCallback((point) => {
    if (!pastePreview?.active) return;
    editorDispatch({ type: 'UPDATE_PASTE_PREVIEW', point });
  }, [editorDispatch, pastePreview]);

  const cancelPaste = useCallback(() => {
    if (!pastePreview?.active) return;
    editorDispatch({ type: 'CANCEL_PASTE_PREVIEW' });
    editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Paste cancelled.' });
  }, [editorDispatch, pastePreview]);

  const placePaste = useCallback((point) => {
    if (!pastePreview?.active || !clipboard || !floor) return false;

    const result = pastePlanClipboardOnFloor({
      floor,
      floorId: activeFloorId,
      payload: clipboard,
      placementPoint: point,
    });

    if (!result.insertedCount) {
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: 'Nothing could be pasted into this floor.',
      });
      editorDispatch({ type: 'CANCEL_PASTE_PREVIEW' });
      return false;
    }

    dispatch({ type: 'FLOOR_REPLACE', floorId: activeFloorId, floor: result.nextFloor });
    if (result.insertedBounds) {
      editorDispatch({
        type: 'SET_REGION_SELECTION',
        bounds: result.insertedBounds,
        selection: result.insertedSelection,
      });
    } else {
      editorDispatch({ type: 'DESELECT' });
    }
    editorDispatch({ type: 'CANCEL_PASTE_PREVIEW' });
    editorDispatch({
      type: 'SET_STATUS_MESSAGE',
      message: `Pasted ${pluralize(result.insertedCount, 'object')}.`,
    });
    return true;
  }, [activeFloorId, clipboard, dispatch, editorDispatch, floor, pastePreview]);

  return {
    isPlanView,
    canCopySelection: Boolean(isPlanView && regionSelection?.objectCount),
    canPaste: Boolean(isPlanView && hasClipboard && floor),
    hasClipboard,
    regionSelection,
    pastePreview,
    previewContent,
    copySelection,
    cutSelection,
    beginPaste,
    updatePastePreview,
    cancelPaste,
    placePaste,
  };
}
