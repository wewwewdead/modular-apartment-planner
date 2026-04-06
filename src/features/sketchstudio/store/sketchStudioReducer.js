import {
  buildUndoableSketchStateSnapshot,
  createEmptyHistoryState,
  pushUndoableHistorySnapshot,
} from '../utils/historyUtils';
import {
  addJointToDocument,
  pruneDocumentJointsByEntityIds,
  removeJointFromDocument,
  updateJointInDocument,
} from '../joinery/jointReducerHelpers';
import { getNextActiveLayer } from '../utils/layerUtils';
import { resolveSketchDocument } from '../utils/sketchDocumentResolver';
import { SKETCH_STUDIO_ACTIONS } from './sketchStudioActions';

function emptySnap() {
  return {
    point: null,
    sourceEntityId: null,
    entityType: null,
    sourceType: null,
    sourceKey: null,
    snapType: null,
  };
}

function emptySelectionBox() {
  return {
    start: null,
    current: null,
    isActive: false,
    hasMoved: false,
  };
}

function emptyPrecisionInput() {
  return {
    length: '',
    width: '',
    height: '',
    radius: '',
    diameter: '',
    offset: '',
    angle: '',
    activeField: null,
  };
}

function emptyDraft() {
  return {
    type: null,
    step: null,
    startPoint: null,
    currentPoint: null,
    points: [],
    sourceRefs: [],
    subtype: null,
    precisionInput: emptyPrecisionInput(),
  };
}

function getIdleMode(draftType) {
  return draftType ? 'drawing' : 'idle';
}

function buildResolvedDocumentState(document) {
  return resolveSketchDocument(document);
}

function getJointStatePatch(resolvedDocumentState) {
  return {
    jointDiagnostics: resolvedDocumentState.jointDiagnostics,
    manufacturingPreviewEntities: resolvedDocumentState.manufacturingPreviewEntities,
    manufacturingExportEntities: resolvedDocumentState.manufacturingExportEntities,
  };
}

function restoreUndoableSnapshot(state, snapshot) {
  if (!snapshot) {
    return state;
  }

  const nextDocument = snapshot.document ?? state.document;
  const resolvedDocumentState = buildResolvedDocumentState(nextDocument);

  return {
    ...state,
    document: resolvedDocumentState.document,
    constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
    ...getJointStatePatch(resolvedDocumentState),
    ui: {
      ...state.ui,
      activeLayerId: getNextActiveLayer(
        resolvedDocumentState.document,
        snapshot.ui?.activeLayerId ?? state.ui.activeLayerId,
      ),
    },
    interaction: {
      ...state.interaction,
      mode: 'idle',
      isPointerDown: false,
      pointerId: null,
      panStartScreen: null,
      panStartViewport: null,
      handleDrag: null,
      anchorDrag: null,
      transform: null,
      suppressNextClick: false,
    },
    selection: {
      selectedIds: [],
      selectionBox: emptySelectionBox(),
    },
    hover: {
      hoveredId: null,
    },
    draft: emptyDraft(),
    snap: emptySnap(),
  };
}

function finalizeUndoableState(state, nextState, options = {}) {
  if (options.skipHistory) {
    return nextState;
  }

  const previousSnapshot = options.previousSnapshot ?? buildUndoableSketchStateSnapshot(state);
  const nextSnapshot = buildUndoableSketchStateSnapshot(nextState);

  return {
    ...nextState,
    history: pushUndoableHistorySnapshot(state.history, previousSnapshot, nextSnapshot),
  };
}

export default function sketchStudioReducer(state, action) {
  switch (action.type) {
    case SKETCH_STUDIO_ACTIONS.SET_CANVAS_SIZE:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          canvasSize: action.payload,
        },
      };

    case SKETCH_STUDIO_ACTIONS.SET_ACTIVE_TOOL:
      return {
        ...state,
        ui: {
          ...state.ui,
          activeTool: action.payload,
        },
        interaction: {
          ...state.interaction,
          mode: 'idle',
          isPointerDown: false,
          pointerId: null,
          panStartScreen: null,
          panStartViewport: null,
          handleDrag: null,
          anchorDrag: null,
          transform: null,
        },
        selection: {
          ...state.selection,
          selectionBox: emptySelectionBox(),
        },
        hover: {
          hoveredId: null,
        },
        draft: emptyDraft(),
        snap: emptySnap(),
      };

    case SKETCH_STUDIO_ACTIONS.SET_ACTIVE_LAYER:
      return {
        ...state,
        ui: {
          ...state.ui,
          activeLayerId: action.payload,
        },
      };

    case SKETCH_STUDIO_ACTIONS.SET_UI_FLAG:
      return {
        ...state,
        ui: {
          ...state.ui,
          [action.payload.key]: action.payload.value,
        },
      };

    case SKETCH_STUDIO_ACTIONS.SET_VIEWPORT:
      return {
        ...state,
        viewport: action.payload,
      };

    case SKETCH_STUDIO_ACTIONS.SET_POINTER_DOWN:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          isPointerDown: action.payload,
        },
      };

    case SKETCH_STUDIO_ACTIONS.START_PAN:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          mode: 'panning',
          isPointerDown: true,
          pointerId: action.payload.pointerId,
          panStartScreen: action.payload.screenPoint,
          panStartViewport: action.payload.startViewport,
        },
        hover: {
          hoveredId: null,
        },
        snap: emptySnap(),
      };

    case SKETCH_STUDIO_ACTIONS.UPDATE_PAN:
      if (state.interaction.pointerId !== action.payload.pointerId) {
        return state;
      }

      return {
        ...state,
        viewport: action.payload.viewport,
        interaction: {
          ...state.interaction,
          cursorScreen: action.payload.screenPoint,
          cursorWorld: action.payload.worldPoint,
        },
      };

    case SKETCH_STUDIO_ACTIONS.END_PAN:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          mode: getIdleMode(state.draft.type),
          isPointerDown: false,
          pointerId: null,
          panStartScreen: null,
          panStartViewport: null,
        },
      };

    case SKETCH_STUDIO_ACTIONS.SYNC_POINTER:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          cursorScreen: action.payload.screenPoint,
          cursorWorld: action.payload.worldPoint,
        },
        hover: {
          hoveredId: action.payload.hoveredId,
        },
        snap: action.payload.snap,
      };

    case SKETCH_STUDIO_ACTIONS.START_SELECTION_BOX:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          mode: 'selection-box',
          isPointerDown: true,
        },
        selection: {
          ...state.selection,
          selectionBox: {
            start: action.payload,
            current: action.payload,
            isActive: true,
            hasMoved: false,
          },
        },
      };

    case SKETCH_STUDIO_ACTIONS.UPDATE_SELECTION_BOX:
      return {
        ...state,
        selection: {
          ...state.selection,
          selectionBox: {
            ...state.selection.selectionBox,
            current: action.payload.currentPoint,
            hasMoved: action.payload.hasMoved,
          },
        },
      };

    case SKETCH_STUDIO_ACTIONS.END_SELECTION_BOX:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          mode: 'idle',
          isPointerDown: false,
        },
        selection: {
          ...state.selection,
          selectionBox: emptySelectionBox(),
        },
      };

    case SKETCH_STUDIO_ACTIONS.SET_SELECTION:
      return {
        ...state,
        selection: {
          ...state.selection,
          selectedIds: action.payload,
        },
      };

    case SKETCH_STUDIO_ACTIONS.SET_SUPPRESS_NEXT_CLICK:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          suppressNextClick: action.payload,
        },
      };

    case SKETCH_STUDIO_ACTIONS.START_DRAFT:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          mode: 'drawing',
        },
        draft: {
          ...emptyDraft(),
          ...action.payload,
        },
      };

    case SKETCH_STUDIO_ACTIONS.PATCH_DRAFT:
      return {
        ...state,
        draft: {
          ...state.draft,
          ...action.payload,
        },
      };

    case SKETCH_STUDIO_ACTIONS.SET_PRECISION_INPUT:
      return {
        ...state,
        draft: {
          ...state.draft,
          precisionInput: {
            ...state.draft.precisionInput,
            ...action.payload,
          },
        },
      };

    case SKETCH_STUDIO_ACTIONS.CANCEL_DRAFT:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          mode: 'idle',
        },
        draft: emptyDraft(),
        snap: emptySnap(),
      };

    case SKETCH_STUDIO_ACTIONS.SET_SNAP:
      return {
        ...state,
        snap: action.payload,
      };

    case SKETCH_STUDIO_ACTIONS.COMMIT_ENTITY: {
      const resolvedDocumentState = buildResolvedDocumentState({
        ...state.document,
        entities: [...state.document.entities, action.payload],
      });

      return finalizeUndoableState(state, {
        ...state,
        document: resolvedDocumentState.document,
        constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
        ...getJointStatePatch(resolvedDocumentState),
        selection: {
          ...state.selection,
          selectedIds: [action.payload.id],
        },
        hover: {
          hoveredId: action.payload.id,
        },
        interaction: {
          ...state.interaction,
          mode: 'idle',
        },
        draft: emptyDraft(),
      });
    }

    case SKETCH_STUDIO_ACTIONS.SET_DOCUMENT: {
      const resolvedDocumentState = buildResolvedDocumentState(action.payload);

      return finalizeUndoableState(
        state,
        {
          ...state,
          document: resolvedDocumentState.document,
          constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
          ...getJointStatePatch(resolvedDocumentState),
          ui: {
            ...state.ui,
            activeLayerId: getNextActiveLayer(resolvedDocumentState.document, state.ui.activeLayerId),
          },
        },
        {
          skipHistory: action.meta?.skipHistory,
        },
      );
    }

    case SKETCH_STUDIO_ACTIONS.SET_DOCUMENT_ENTITIES: {
      const resolvedDocumentState = buildResolvedDocumentState({
        ...state.document,
        entities: action.payload,
      });

      return finalizeUndoableState(
        state,
        {
          ...state,
          document: resolvedDocumentState.document,
          constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
          ...getJointStatePatch(resolvedDocumentState),
        },
        {
          skipHistory:
            action.meta?.skipHistory ||
            state.interaction.mode === 'handle-drag' ||
            state.interaction.mode === 'transform',
        },
      );
    }

    case SKETCH_STUDIO_ACTIONS.START_HANDLE_DRAG:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          mode: 'handle-drag',
          handleDrag: {
            ...action.payload,
            historySnapshot: buildUndoableSketchStateSnapshot(state),
          },
          isPointerDown: true,
        },
      };

    case SKETCH_STUDIO_ACTIONS.END_HANDLE_DRAG:
      return finalizeUndoableState(
        state,
        {
          ...state,
          interaction: {
            ...state.interaction,
            mode: 'idle',
            handleDrag: null,
            isPointerDown: false,
          },
        },
        {
          previousSnapshot: state.interaction.handleDrag?.historySnapshot,
        },
      );

    case SKETCH_STUDIO_ACTIONS.CANCEL_HANDLE_DRAG:
      return restoreUndoableSnapshot(state, state.interaction.handleDrag?.historySnapshot);

    case SKETCH_STUDIO_ACTIONS.START_ANCHOR_DRAG:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          mode: 'anchor-drag',
          anchorDrag: {
            ...action.payload,
            historySnapshot: buildUndoableSketchStateSnapshot(state),
          },
          isPointerDown: true,
        },
      };

    case SKETCH_STUDIO_ACTIONS.END_ANCHOR_DRAG:
      return finalizeUndoableState(
        state,
        {
          ...state,
          interaction: {
            ...state.interaction,
            mode: 'idle',
            anchorDrag: null,
            isPointerDown: false,
          },
        },
        {
          previousSnapshot: state.interaction.anchorDrag?.historySnapshot,
        },
      );

    case SKETCH_STUDIO_ACTIONS.CANCEL_ANCHOR_DRAG:
      return restoreUndoableSnapshot(state, state.interaction.anchorDrag?.historySnapshot);

    case SKETCH_STUDIO_ACTIONS.START_TRANSFORM:
      return {
        ...state,
        interaction: {
          ...state.interaction,
          mode: 'transform',
          transform: {
            ...action.payload,
            historySnapshot: buildUndoableSketchStateSnapshot(state),
          },
          isPointerDown: true,
        },
      };

    case SKETCH_STUDIO_ACTIONS.PATCH_TRANSFORM:
      if (!state.interaction.transform) {
        return state;
      }

      return {
        ...state,
        interaction: {
          ...state.interaction,
          transform: {
            ...state.interaction.transform,
            ...action.payload,
          },
        },
      };

    case SKETCH_STUDIO_ACTIONS.END_TRANSFORM:
      return finalizeUndoableState(
        state,
        {
          ...state,
          interaction: {
            ...state.interaction,
            mode: 'idle',
            transform: null,
            isPointerDown: false,
          },
        },
        {
          previousSnapshot: state.interaction.transform?.historySnapshot,
        },
      );

    case SKETCH_STUDIO_ACTIONS.CANCEL_TRANSFORM:
      return restoreUndoableSnapshot(state, state.interaction.transform?.historySnapshot);

    case SKETCH_STUDIO_ACTIONS.DELETE_SELECTED: {
      const selectedIdSet = new Set(state.selection.selectedIds);
      const nextDocument = pruneDocumentJointsByEntityIds(
        {
          ...state.document,
          entities: state.document.entities.filter((entity) => !selectedIdSet.has(entity.id)),
        },
        state.selection.selectedIds,
      );
      const resolvedDocumentState = buildResolvedDocumentState(nextDocument);

      return finalizeUndoableState(state, {
        ...state,
        document: resolvedDocumentState.document,
        constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
        ...getJointStatePatch(resolvedDocumentState),
        selection: {
          ...state.selection,
          selectedIds: [],
        },
        hover: {
          hoveredId: selectedIdSet.has(state.hover.hoveredId) ? null : state.hover.hoveredId,
        },
      });
    }

    case SKETCH_STUDIO_ACTIONS.CLEAR_POINTER_DECORATIONS:
      return {
        ...state,
        hover: {
          hoveredId: null,
        },
        snap: emptySnap(),
      };

    case SKETCH_STUDIO_ACTIONS.LOAD_WORKSPACE_SNAPSHOT: {
      const resolvedDocumentState = buildResolvedDocumentState(action.payload.document);
      const nextDocument = resolvedDocumentState.document;
      const nextViewport = action.payload.viewport || state.viewport;
      const nextUi = action.payload.ui || {};

      return {
        ...state,
        document: nextDocument,
        constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
        ...getJointStatePatch(resolvedDocumentState),
        viewport: nextViewport,
        ui: {
          ...state.ui,
          activeTool: 'select',
          activeLayerId: getNextActiveLayer(nextDocument, nextUi.activeLayerId || state.ui.activeLayerId),
          snapEnabled: nextUi.snapEnabled ?? state.ui.snapEnabled,
          orthoEnabled: nextUi.orthoEnabled ?? state.ui.orthoEnabled,
          viewMode: nextUi.viewMode ?? state.ui.viewMode,
          isometricPlane: nextUi.isometricPlane ?? state.ui.isometricPlane,
          focusedJointId: null,
          editingJointId: null,
        },
        interaction: {
          ...state.interaction,
          mode: 'idle',
          isPointerDown: false,
          pointerId: null,
          panStartScreen: null,
          panStartViewport: null,
          handleDrag: null,
          anchorDrag: null,
          transform: null,
          suppressNextClick: false,
        },
        selection: {
          selectedIds: [],
          selectionBox: emptySelectionBox(),
        },
        hover: {
          hoveredId: null,
        },
        draft: emptyDraft(),
        snap: emptySnap(),
        history: createEmptyHistoryState(),
      };
    }

    case SKETCH_STUDIO_ACTIONS.UNDO: {
      if (!state.history.past.length) {
        return state;
      }

      const previousSnapshot = state.history.past.at(-1);
      const currentSnapshot = buildUndoableSketchStateSnapshot(state);
      const restoredState = restoreUndoableSnapshot(state, previousSnapshot);

      return {
        ...restoredState,
        history: {
          past: state.history.past.slice(0, -1),
          future: [currentSnapshot, ...state.history.future],
        },
      };
    }

    case SKETCH_STUDIO_ACTIONS.REDO: {
      if (!state.history.future.length) {
        return state;
      }

      const nextSnapshot = state.history.future[0];
      const currentSnapshot = buildUndoableSketchStateSnapshot(state);
      const restoredState = restoreUndoableSnapshot(state, nextSnapshot);

      return {
        ...restoredState,
        history: {
          past: [...state.history.past, currentSnapshot],
          future: state.history.future.slice(1),
        },
      };
    }

    case SKETCH_STUDIO_ACTIONS.SET_ENTITY_MATERIAL: {
      const { entityIds, materialId } = action.payload;
      const idSet = new Set(entityIds);
      const nextEntities = state.document.entities.map((entity) => {
        if (!idSet.has(entity.id)) return entity;
        return { ...entity, materialId: materialId || null };
      });
      const resolvedDocumentState = buildResolvedDocumentState({
        ...state.document,
        entities: nextEntities,
      });
      return finalizeUndoableState(state, {
        ...state,
        document: resolvedDocumentState.document,
        constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
        ...getJointStatePatch(resolvedDocumentState),
      });
    }

    case SKETCH_STUDIO_ACTIONS.SET_ENTITY_THICKNESS: {
      const { entityIds, thickness } = action.payload;
      const idSet = new Set(entityIds);
      const parsedThickness = Number(thickness);
      const nextEntities = state.document.entities.map((entity) => {
        if (!idSet.has(entity.id)) return entity;
        return {
          ...entity,
          thickness: Number.isFinite(parsedThickness) && parsedThickness > 0 ? parsedThickness : null,
        };
      });
      const resolvedDocumentState = buildResolvedDocumentState({
        ...state.document,
        entities: nextEntities,
      });
      return finalizeUndoableState(state, {
        ...state,
        document: resolvedDocumentState.document,
        constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
        ...getJointStatePatch(resolvedDocumentState),
      });
    }

    case SKETCH_STUDIO_ACTIONS.TOGGLE_CRAFTSMAN_MODE:
      return {
        ...state,
        ui: { ...state.ui, craftsmanMode: !state.ui.craftsmanMode },
      };

    case SKETCH_STUDIO_ACTIONS.SET_VARIABLES: {
      const resolvedDocumentState = buildResolvedDocumentState({
        ...state.document,
        variables: action.payload ?? [],
      });

      return finalizeUndoableState(state, {
        ...state,
        document: resolvedDocumentState.document,
        constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
        ...getJointStatePatch(resolvedDocumentState),
      });
    }

    case SKETCH_STUDIO_ACTIONS.ADD_CONSTRAINT: {
      const resolvedDocumentState = buildResolvedDocumentState({
        ...state.document,
        constraints: [...(state.document.constraints || []), action.payload],
      });

      return finalizeUndoableState(state, {
        ...state,
        document: resolvedDocumentState.document,
        constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
        ...getJointStatePatch(resolvedDocumentState),
      });
    }

    case SKETCH_STUDIO_ACTIONS.UPDATE_CONSTRAINT: {
      const { constraintId, patch } = action.payload;
      const resolvedDocumentState = buildResolvedDocumentState({
        ...state.document,
        constraints: (state.document.constraints || []).map((constraint) =>
          constraint.id === constraintId ? { ...constraint, ...patch } : constraint,
        ),
      });

      return finalizeUndoableState(state, {
        ...state,
        document: resolvedDocumentState.document,
        constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
        ...getJointStatePatch(resolvedDocumentState),
      });
    }

    case SKETCH_STUDIO_ACTIONS.REMOVE_CONSTRAINT: {
      const resolvedDocumentState = buildResolvedDocumentState({
        ...state.document,
        constraints: (state.document.constraints || []).filter((constraint) => constraint.id !== action.payload),
      });

      return finalizeUndoableState(state, {
        ...state,
        document: resolvedDocumentState.document,
        constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
        ...getJointStatePatch(resolvedDocumentState),
      });
    }

    case SKETCH_STUDIO_ACTIONS.ADD_JOINT: {
      const resolvedDocumentState = buildResolvedDocumentState(addJointToDocument(state.document, action.payload));

      return finalizeUndoableState(state, {
        ...state,
        document: resolvedDocumentState.document,
        constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
        ...getJointStatePatch(resolvedDocumentState),
      });
    }

    case SKETCH_STUDIO_ACTIONS.UPDATE_JOINT: {
      const { jointId, patch } = action.payload;
      const resolvedDocumentState = buildResolvedDocumentState(updateJointInDocument(state.document, jointId, patch));

      return finalizeUndoableState(state, {
        ...state,
        document: resolvedDocumentState.document,
        constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
        ...getJointStatePatch(resolvedDocumentState),
      });
    }

    case SKETCH_STUDIO_ACTIONS.REMOVE_JOINT: {
      const resolvedDocumentState = buildResolvedDocumentState(removeJointFromDocument(state.document, action.payload));

      return finalizeUndoableState(state, {
        ...state,
        document: resolvedDocumentState.document,
        constraintDiagnostics: resolvedDocumentState.constraintDiagnostics,
        ...getJointStatePatch(resolvedDocumentState),
      });
    }

    default:
      return state;
  }
}
