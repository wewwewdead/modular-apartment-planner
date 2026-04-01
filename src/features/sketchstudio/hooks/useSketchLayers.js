import { useCallback, useMemo } from 'react';
import { setActiveLayer, setDocument } from '../store/sketchStudioActions';
import {
  createLayer,
  getNextActiveLayer,
  moveEntitiesToLayer,
  renameLayer,
  toggleLayerLock,
  toggleLayerVisibility,
} from '../utils/layerUtils';
import { normalizeCommittedSketchName } from '../utils/sketchDocumentUtils';

export default function useSketchLayers(state, dispatch) {
  const activeLayer = useMemo(
    () => state.document.layers.find((layer) => layer.id === state.ui.activeLayerId) ?? null,
    [state.document.layers, state.ui.activeLayerId],
  );

  const updateDocumentState = useCallback((updater) => {
    dispatch(setDocument(updater(state.document)));
  }, [state.document, dispatch]);

  const handleActiveLayerChange = useCallback(
    (layerId) => dispatch(setActiveLayer(layerId)),
    [dispatch],
  );

  const handleLayerCreate = useCallback((name) => {
    updateDocumentState((document) => ({
      ...document,
      layers: [...document.layers, createLayer(document.layers, name)],
    }));
  }, [updateDocumentState]);

  const handleLayerRename = useCallback((layerId, name) => {
    updateDocumentState((document) => ({
      ...document,
      layers: renameLayer(document.layers, layerId, name),
    }));
  }, [updateDocumentState]);

  const handleDocumentNameCommit = useCallback((name) => {
    updateDocumentState((document) => ({
      ...document,
      name: normalizeCommittedSketchName(name),
    }));
  }, [updateDocumentState]);

  const handleLayerVisibilityToggle = useCallback((layerId) => {
    updateDocumentState((document) => ({
      ...document,
      layers: toggleLayerVisibility(document.layers, layerId),
    }));
  }, [updateDocumentState]);

  const handleLayerLockToggle = useCallback((layerId) => {
    updateDocumentState((document) => ({
      ...document,
      layers: toggleLayerLock(document.layers, layerId),
    }));
  }, [updateDocumentState]);

  const handleMoveSelectionToLayer = useCallback((layerId) => {
    if (!state.selection.selectedIds.length) {
      return;
    }

    updateDocumentState((document) => ({
      ...document,
      entities: moveEntitiesToLayer(document.entities, state.selection.selectedIds, layerId),
    }));
  }, [state.selection.selectedIds, updateDocumentState]);

  return {
    activeLayer,
    updateDocumentState,
    handleActiveLayerChange,
    handleLayerCreate,
    handleLayerRename,
    handleDocumentNameCommit,
    handleLayerVisibilityToggle,
    handleLayerLockToggle,
    handleMoveSelectionToLayer,
  };
}
