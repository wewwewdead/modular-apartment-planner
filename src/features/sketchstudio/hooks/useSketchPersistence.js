import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfirmDialog } from '@/ui/ConfirmDialog';
import { loadWorkspaceSnapshot } from '../store/sketchStudioActions';
import sketchStudioInitialState from '../store/sketchStudioInitialState';
import {
  buildSketchWorkspaceSnapshot,
  normalizeParsedSketchWorkspace,
  serializeComparableSketchWorkspace,
} from '../utils/workspaceSerializationUtils';
import {
  getSketchWorkspaceFileName,
  importSketchWorkspaceFile,
  isFilePickerAbortError,
  isSketchRenamePending,
  openSketchWorkspaceFile,
  saveSketchWorkspaceFile,
} from '../utils/sketchWorkspaceFileUtils';
import { createBlankSketchDocument } from '../utils/sketchDocumentUtils';
import { clearSketchRecovery, loadSketchRecovery, saveSketchRecovery } from '../../../shared/sketchAssetStorage';
import { isEditableTarget } from './sketchConstants';

export default function useSketchPersistence(state, dispatch) {
  const confirm = useConfirmDialog();
  const [documentFileHandle, setDocumentFileHandle] = useState(null);
  // `savedDocumentName` is the document name as it was at the last save/open:
  // a plain Save silently overwrites the current file until the user renames
  // the document, and only then re-prompts under the new name.
  const [documentPersistenceMeta, setDocumentPersistenceMeta] = useState({
    savedAt: null,
    fileName: null,
    savedDocumentName: null,
    status: 'idle',
    error: null,
  });
  const persistedWorkspaceSnapshotRef = useRef(null);

  // Document snapshot excludes viewport so dirty detection is not triggered by pan/zoom.
  const documentSnapshot = useMemo(
    () =>
      buildSketchWorkspaceSnapshot({
        document: state.document,
        ui: {
          activeLayerId: state.ui.activeLayerId,
          snapEnabled: state.ui.snapEnabled,
          orthoEnabled: state.ui.orthoEnabled,
          viewMode: state.ui.viewMode,
          isometricPlane: state.ui.isometricPlane,
          craftsmanMode: state.ui.craftsmanMode,
        },
      }),
    [
      state.document,
      state.ui.activeLayerId,
      state.ui.craftsmanMode,
      state.ui.isometricPlane,
      state.ui.orthoEnabled,
      state.ui.snapEnabled,
      state.ui.viewMode,
    ],
  );

  // Full snapshot includes viewport — used for recovery autosave and explicit file save.
  const currentWorkspaceSnapshot = useMemo(
    () => ({ ...documentSnapshot, viewport: state.viewport }),
    [documentSnapshot, state.viewport],
  );

  // Comparable string derives from document-only snapshot so viewport changes
  // do not mark the file as dirty.
  const comparableWorkspaceSnapshot = useMemo(
    () => serializeComparableSketchWorkspace(documentSnapshot),
    [documentSnapshot],
  );

  const desiredSketchFileName = useMemo(() => getSketchWorkspaceFileName(state.document.name), [state.document.name]);

  const documentIsDirty =
    persistedWorkspaceSnapshotRef.current != null
      ? comparableWorkspaceSnapshot !== persistedWorkspaceSnapshotRef.current
      : false;

  // Recovery load on mount
  useEffect(() => {
    const recoverySnapshot = loadSketchRecovery();
    if (!recoverySnapshot) {
      if (persistedWorkspaceSnapshotRef.current == null) {
        persistedWorkspaceSnapshotRef.current = comparableWorkspaceSnapshot;
      }
      return;
    }

    try {
      const workspace = normalizeParsedSketchWorkspace(recoverySnapshot);
      dispatch(loadWorkspaceSnapshot(workspace));
      // Use document-only comparable string so viewport is excluded from dirty detection.
      persistedWorkspaceSnapshotRef.current = serializeComparableSketchWorkspace({
        document: workspace.document,
        ui: workspace.ui,
      });
      setDocumentPersistenceMeta({
        savedAt: workspace.savedAt ?? null,
        fileName: null,
        savedDocumentName: workspace.document?.name ?? null,
        status: 'recovered',
        error: null,
      });
    } catch {
      persistedWorkspaceSnapshotRef.current = comparableWorkspaceSnapshot;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only recovery load

  // Track persisted snapshot
  useEffect(() => {
    if (persistedWorkspaceSnapshotRef.current == null) {
      persistedWorkspaceSnapshotRef.current = comparableWorkspaceSnapshot;
    }
  }, [comparableWorkspaceSnapshot]);

  // Debounced recovery save
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        saveSketchRecovery(currentWorkspaceSnapshot);
      } catch {
        // Recovery storage is best-effort only.
      }
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentWorkspaceSnapshot]);

  // Dirty status tracking
  useEffect(() => {
    setDocumentPersistenceMeta((current) => {
      const nextStatus = documentIsDirty ? 'dirty' : current.status === 'dirty' ? 'idle' : current.status;

      if (nextStatus === current.status) {
        return current;
      }

      return {
        ...current,
        status: nextStatus,
      };
    });
  }, [documentIsDirty]);

  const applyWorkspace = useCallback(
    (workspace, options = {}) => {
      dispatch(
        loadWorkspaceSnapshot({
          document: workspace.document,
          viewport: workspace.viewport,
          ui: workspace.ui,
        }),
      );
      // Persist the document-only comparable string so dirty detection stays
      // viewport-agnostic after loading a workspace.
      persistedWorkspaceSnapshotRef.current = serializeComparableSketchWorkspace({
        document: workspace.document,
        ui: workspace.ui,
      });
      setDocumentFileHandle(options.fileHandle ?? null);
      setDocumentPersistenceMeta({
        savedAt: workspace.savedAt ?? options.savedAt ?? null,
        fileName: options.fileName ?? options.fileHandle?.name ?? null,
        savedDocumentName: workspace.document?.name ?? null,
        status: options.status ?? 'idle',
        error: null,
      });
    },
    [dispatch],
  );

  const shouldConfirmWorkspaceReplacement = useCallback(async () => {
    if (!documentIsDirty) return true;
    return confirm('Unsaved sketch changes will be lost. Continue?');
  }, [documentIsDirty, confirm]);

  const handleNewSketch = useCallback(async () => {
    if (!(await shouldConfirmWorkspaceReplacement())) {
      return;
    }

    const nextDocument = createBlankSketchDocument({
      units: state.document.units,
    });
    const workspace = buildSketchWorkspaceSnapshot({
      document: nextDocument,
      viewport: sketchStudioInitialState.viewport,
      ui: {
        activeLayerId: nextDocument.layers[0]?.id || 'default',
        snapEnabled: state.ui.snapEnabled,
        orthoEnabled: state.ui.orthoEnabled,
      },
    });
    applyWorkspace(workspace, {
      fileHandle: null,
      fileName: null,
      savedAt: null,
      status: 'idle',
    });
  }, [
    applyWorkspace,
    shouldConfirmWorkspaceReplacement,
    state.document.units,
    state.ui.orthoEnabled,
    state.ui.snapEnabled,
  ]);

  const handleImportSketchFile = useCallback(
    async (file) => {
      if (!file) {
        return;
      }

      if (!(await shouldConfirmWorkspaceReplacement())) {
        return;
      }

      try {
        const { workspace, fileName } = await importSketchWorkspaceFile(file);
        applyWorkspace(workspace, {
          fileHandle: null,
          fileName,
          status: 'opened',
        });
      } catch (err) {
        setDocumentPersistenceMeta((current) => ({
          ...current,
          status: 'error',
          error: err.message || 'Failed to open sketch.',
        }));
      }
    },
    [applyWorkspace, shouldConfirmWorkspaceReplacement],
  );

  const handleOpenSketch = useCallback(async () => {
    if (!(await shouldConfirmWorkspaceReplacement())) {
      return;
    }

    try {
      const { workspace, fileHandle, fileName } = await openSketchWorkspaceFile();
      applyWorkspace(workspace, {
        fileHandle,
        fileName,
        status: 'opened',
      });
    } catch (err) {
      if (isFilePickerAbortError(err)) {
        return;
      }

      setDocumentPersistenceMeta((current) => ({
        ...current,
        status: 'error',
        error: err.message || 'Failed to open sketch.',
      }));
    }
  }, [applyWorkspace, shouldConfirmWorkspaceReplacement]);

  const handleSaveSketch = useCallback(
    async (options = {}) => {
      const saveAs = options.saveAs === true;
      const renamePending = isSketchRenamePending({
        fileHandle: documentFileHandle,
        savedDocumentName: documentPersistenceMeta.savedDocumentName,
        documentName: state.document.name,
      });
      setDocumentPersistenceMeta((current) => ({
        ...current,
        status: 'saving',
        error: null,
      }));

      try {
        const { savedAt, fileHandle, fileName } = await saveSketchWorkspaceFile(currentWorkspaceSnapshot, {
          fileHandle: saveAs || renamePending ? null : documentFileHandle,
        });
        persistedWorkspaceSnapshotRef.current = comparableWorkspaceSnapshot;
        setDocumentFileHandle(fileHandle);
        setDocumentPersistenceMeta({
          savedAt,
          fileName,
          savedDocumentName: state.document.name ?? null,
          status: 'saved',
          error: null,
        });
        clearSketchRecovery();
      } catch (err) {
        if (isFilePickerAbortError(err)) {
          setDocumentPersistenceMeta((current) => ({
            ...current,
            status: documentIsDirty ? 'dirty' : 'idle',
            error: null,
          }));
          return;
        }

        setDocumentPersistenceMeta((current) => ({
          ...current,
          status: 'error',
          error: err.message || 'Failed to save sketch.',
        }));
      }
    },
    [
      comparableWorkspaceSnapshot,
      currentWorkspaceSnapshot,
      documentFileHandle,
      documentIsDirty,
      documentPersistenceMeta.savedDocumentName,
      state.document.name,
    ],
  );

  // Ctrl+S shortcut
  useEffect(() => {
    const handleSaveShortcut = (event) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && String(event.key).toLowerCase() === 's') {
        event.preventDefault();
        handleSaveSketch();
      }
    };

    window.addEventListener('keydown', handleSaveShortcut);
    return () => {
      window.removeEventListener('keydown', handleSaveShortcut);
    };
  }, [handleSaveSketch]);

  const documentPersistence = useMemo(
    () => ({
      ...documentPersistenceMeta,
      isDirty: documentIsDirty,
      hasFileHandle: Boolean(documentFileHandle),
      desiredFileName: desiredSketchFileName,
      renamePending: isSketchRenamePending({
        fileHandle: documentFileHandle,
        savedDocumentName: documentPersistenceMeta.savedDocumentName,
        documentName: state.document.name,
      }),
    }),
    [desiredSketchFileName, documentFileHandle, documentIsDirty, documentPersistenceMeta, state.document.name],
  );

  return {
    documentPersistence,
    documentIsDirty,
    currentWorkspaceSnapshot,
    comparableWorkspaceSnapshot,
    applyWorkspace,
    handleNewSketch,
    handleOpenSketch,
    handleImportSketchFile,
    handleSaveSketch,
  };
}
