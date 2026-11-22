import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfirmDialog } from '@/ui/ConfirmDialog';
import { loadWorkspaceSnapshot } from '../store/sketchStudioActions';
import sketchStudioInitialState from '../store/sketchStudioInitialState';
import { getDragFrameOrigin } from '../store/sketchStudioReducer';
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
import { advancePersistenceMeta, resumeEventFor, sketchPersistenceMachine } from './sketchPersistenceMachine';

// The document a move or a handle drag started from, while one is under way.
function getDragStartDocument(interaction) {
  if (interaction.mode === 'transform') return interaction.transform?.historySnapshot?.document ?? null;
  if (interaction.mode === 'handle-drag') return interaction.handleDrag?.historySnapshot?.document ?? null;
  return null;
}

// Same entities, value for value, in the same order: identity first, then the
// JSON of the few that a drag rewrote.
function haveSameEntityContent(entities, otherEntities) {
  if (entities === otherEntities) return true;
  if (!Array.isArray(entities) || !Array.isArray(otherEntities) || entities.length !== otherEntities.length) {
    return false;
  }
  for (let index = 0; index < entities.length; index += 1) {
    if (
      entities[index] !== otherEntities[index] &&
      JSON.stringify(entities[index]) !== JSON.stringify(otherEntities[index])
    ) {
      return false;
    }
  }
  return true;
}

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
    status: sketchPersistenceMachine.initial,
    error: null,
  });
  // The file being read right now, by name: the Reading … pill names it.
  const [readingFileName, setReadingFileName] = useState(null);
  const persistedWorkspaceSnapshotRef = useRef(null);

  // Document snapshot excludes viewport so dirty detection is not triggered by pan/zoom.
  // Built once per change; the fields the reducer already normalised (the 3D
  // model above all) are reused rather than normalised again.
  const documentSnapshot = useMemo(
    () =>
      buildSketchWorkspaceSnapshot(
        {
          document: state.document,
          ui: {
            activeLayerId: state.ui.activeLayerId,
            snapEnabled: state.ui.snapEnabled,
            orthoEnabled: state.ui.orthoEnabled,
            viewMode: state.ui.viewMode,
            isometricPlane: state.ui.isometricPlane,
            craftsmanMode: state.ui.craftsmanMode,
            workspaceMode: state.ui.workspaceMode,
          },
        },
        { reuseNormalized: true },
      ),
    [
      state.document,
      state.ui.activeLayerId,
      state.ui.craftsmanMode,
      state.ui.isometricPlane,
      state.ui.orthoEnabled,
      state.ui.snapEnabled,
      state.ui.viewMode,
      state.ui.workspaceMode,
    ],
  );

  // Full snapshot includes viewport — used for recovery autosave and explicit file save.
  const currentWorkspaceSnapshot = useMemo(
    () => ({ ...documentSnapshot, viewport: state.viewport }),
    [documentSnapshot, state.viewport],
  );

  // Comparable string derives from document-only snapshot so viewport changes
  // do not mark the file as dirty. Its second pass reuses what the snapshot
  // already normalised (the 3D model above all) and normalises the entities
  // and joints again, as before. Built on first use for each snapshot: a drag
  // frame does not need it.
  const comparableCacheRef = useRef({ snapshot: null, value: null });
  const readComparableWorkspaceSnapshot = useCallback(() => {
    if (comparableCacheRef.current.snapshot !== documentSnapshot) {
      comparableCacheRef.current = {
        snapshot: documentSnapshot,
        value: serializeComparableSketchWorkspace(documentSnapshot, { reuseNormalized: true }),
      };
    }
    return comparableCacheRef.current.value;
  }, [documentSnapshot]);

  const desiredSketchFileName = useMemo(() => getSketchWorkspaceFileName(state.document.name), [state.document.name]);

  // The string comparison is the authority on dirty. One shortcut, while a
  // move or a handle drag is under way: every frame is a new document, and it
  // differs from the one the drag started from only in its entities (the
  // reducer records that origin). If the sketch was dirty when the drag
  // started, it reads dirty until the drag ends; if it was clean, it is dirty
  // exactly when an entity no longer matches its start. Anything else -- the
  // drag's end, an edit from elsewhere mid-drag, a save, a ui change -- takes
  // the full comparison.
  const dirtyBaselineRef = useRef(null);
  const persistedComparable = persistedWorkspaceSnapshotRef.current;
  const dirtyUiKey = JSON.stringify(documentSnapshot.ui);
  const dragStartDocument = getDragStartDocument(state.interaction);
  const baseline = dirtyBaselineRef.current;
  let documentIsDirty = false;
  if (persistedComparable != null) {
    if (
      dragStartDocument &&
      state.document !== dragStartDocument &&
      getDragFrameOrigin(state.document) === dragStartDocument &&
      baseline?.document === dragStartDocument &&
      baseline.uiKey === dirtyUiKey &&
      baseline.persisted === persistedComparable
    ) {
      documentIsDirty = baseline.dirty || !haveSameEntityContent(state.document.entities, dragStartDocument.entities);
    } else {
      documentIsDirty = readComparableWorkspaceSnapshot() !== persistedComparable;
      dirtyBaselineRef.current = {
        document: state.document,
        uiKey: dirtyUiKey,
        persisted: persistedComparable,
        dirty: documentIsDirty,
      };
    }
  }

  // Recovery load on mount
  useEffect(() => {
    const recoverySnapshot = loadSketchRecovery();
    if (!recoverySnapshot) {
      if (persistedWorkspaceSnapshotRef.current == null) {
        persistedWorkspaceSnapshotRef.current = readComparableWorkspaceSnapshot();
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
      setDocumentPersistenceMeta((current) =>
        advancePersistenceMeta(current, 'RECOVER', {
          savedAt: workspace.savedAt ?? null,
          fileName: null,
          savedDocumentName: workspace.document?.name ?? null,
        }),
      );
    } catch {
      persistedWorkspaceSnapshotRef.current = readComparableWorkspaceSnapshot();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only recovery load

  // Track persisted snapshot
  useEffect(() => {
    if (persistedWorkspaceSnapshotRef.current == null) {
      persistedWorkspaceSnapshotRef.current = readComparableWorkspaceSnapshot();
    }
  }, [readComparableWorkspaceSnapshot]);

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
    setDocumentPersistenceMeta((current) => advancePersistenceMeta(current, documentIsDirty ? 'EDIT' : 'CLEAN'));
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
      setDocumentPersistenceMeta((current) =>
        advancePersistenceMeta(current, options.status === 'opened' ? 'OPEN' : 'LOAD', {
          savedAt: workspace.savedAt ?? options.savedAt ?? null,
          fileName: options.fileName ?? options.fileHandle?.name ?? null,
          savedDocumentName: workspace.document?.name ?? null,
        }),
      );
    },
    [dispatch],
  );

  // A recovered sketch is clean only against its own autosave: it was never
  // written to a file, and replacing it lets the autosave overwrite the one
  // recovery slot. So it asks like unsaved edits do, until it is saved, edited
  // (dirty asks anyway) or replaced once with the user's consent.
  const shouldConfirmWorkspaceReplacement = useCallback(async () => {
    if (!documentIsDirty && documentPersistenceMeta.status !== 'recovered') return true;
    return confirm('Unsaved sketch changes will be lost. Continue?');
  }, [documentIsDirty, documentPersistenceMeta.status, confirm]);

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
        // New keeps the current workspace (3D stays 3D; a missing mode loads as 2D drafting).
        workspaceMode: state.ui.workspaceMode,
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
    state.ui.workspaceMode,
  ]);

  const handleImportSketchFile = useCallback(
    async (file) => {
      if (!file) {
        return;
      }

      if (!(await shouldConfirmWorkspaceReplacement())) {
        return;
      }

      setReadingFileName(file.name || null);
      try {
        const { workspace, fileName } = await importSketchWorkspaceFile(file);
        applyWorkspace(workspace, {
          fileHandle: null,
          fileName,
          status: 'opened',
        });
      } catch (err) {
        setDocumentPersistenceMeta((current) =>
          advancePersistenceMeta(current, 'FAIL', { error: err.message || 'Failed to open sketch.' }),
        );
      } finally {
        setReadingFileName(null);
      }
    },
    [applyWorkspace, shouldConfirmWorkspaceReplacement],
  );

  const handleOpenSketch = useCallback(async () => {
    if (!(await shouldConfirmWorkspaceReplacement())) {
      return;
    }

    try {
      const { workspace, fileHandle, fileName } = await openSketchWorkspaceFile({
        onFileChosen: setReadingFileName,
      });
      applyWorkspace(workspace, {
        fileHandle,
        fileName,
        status: 'opened',
      });
    } catch (err) {
      if (isFilePickerAbortError(err)) {
        return;
      }

      setDocumentPersistenceMeta((current) =>
        advancePersistenceMeta(current, 'FAIL', { error: err.message || 'Failed to open sketch.' }),
      );
    } finally {
      setReadingFileName(null);
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
      // Closing the picker puts the status back to this one.
      const statusBeforeSave = documentPersistenceMeta.status;
      setDocumentPersistenceMeta((current) => advancePersistenceMeta(current, 'SAVE'));

      try {
        const { savedAt, fileHandle, fileName } = await saveSketchWorkspaceFile(currentWorkspaceSnapshot, {
          fileHandle: saveAs || renamePending ? null : documentFileHandle,
        });
        persistedWorkspaceSnapshotRef.current = readComparableWorkspaceSnapshot();
        setDocumentFileHandle(fileHandle);
        setDocumentPersistenceMeta((current) =>
          advancePersistenceMeta(current, 'SAVED', {
            savedAt,
            fileName,
            savedDocumentName: state.document.name ?? null,
          }),
        );
        clearSketchRecovery();
      } catch (err) {
        if (isFilePickerAbortError(err)) {
          setDocumentPersistenceMeta((current) => advancePersistenceMeta(current, resumeEventFor(statusBeforeSave)));
          return;
        }

        setDocumentPersistenceMeta((current) =>
          advancePersistenceMeta(current, 'FAIL', { error: err.message || 'Failed to save sketch.' }),
        );
      }
    },
    [
      currentWorkspaceSnapshot,
      documentFileHandle,
      documentPersistenceMeta.savedDocumentName,
      documentPersistenceMeta.status,
      readComparableWorkspaceSnapshot,
      state.document.name,
    ],
  );

  // The error toast's dismissal: the status stays, the message goes.
  const dismissError = useCallback(() => {
    setDocumentPersistenceMeta((current) => advancePersistenceMeta(current, 'DISMISS'));
  }, []);

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
      reading: readingFileName,
      isDirty: documentIsDirty,
      hasFileHandle: Boolean(documentFileHandle),
      desiredFileName: desiredSketchFileName,
      renamePending: isSketchRenamePending({
        fileHandle: documentFileHandle,
        savedDocumentName: documentPersistenceMeta.savedDocumentName,
        documentName: state.document.name,
      }),
    }),
    [
      desiredSketchFileName,
      documentFileHandle,
      documentIsDirty,
      documentPersistenceMeta,
      readingFileName,
      state.document.name,
    ],
  );

  return {
    documentPersistence,
    documentIsDirty,
    currentWorkspaceSnapshot,
    // Built when read (see readComparableWorkspaceSnapshot).
    get comparableWorkspaceSnapshot() {
      return readComparableWorkspaceSnapshot();
    },
    applyWorkspace,
    handleNewSketch,
    handleOpenSketch,
    handleImportSketchFile,
    handleSaveSketch,
    dismissError,
  };
}
