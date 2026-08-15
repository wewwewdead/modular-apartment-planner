import { describe, expect, it } from 'vitest';
import { duplicateEntitiesByIds, toggleBrokenLineForEntities } from '../utils/entityUtils';
import { buildGroupIndex } from '../utils/groupUtils';
import { HISTORY_LIMIT } from '../utils/historyUtils';
import sketchStudioInitialState from './sketchStudioInitialState';
import sketchStudioReducer from './sketchStudioReducer';
import {
  addJoint,
  closeShortcutOverlay,
  commitEntity,
  degroupSelection,
  deleteSelected,
  endHandleDrag,
  endTransform,
  groupSelection,
  loadWorkspaceSnapshot,
  patchTransform,
  redo,
  removeJoint,
  setActiveHardware,
  setEntityHardware,
  setEntityMaterial,
  setEntityGrainAngle,
  setSelection,
  setDocumentEntities,
  setViewport,
  startHandleDrag,
  startTransform,
  toggleShortcutOverlay,
  undo,
  updateJoint,
} from './sketchStudioActions';

function createState() {
  return {
    ...sketchStudioInitialState,
    document: {
      ...sketchStudioInitialState.document,
      entities: [...sketchStudioInitialState.document.entities],
      layers: [...sketchStudioInitialState.document.layers],
    },
    history: {
      past: [],
      future: [],
    },
  };
}

function createLineEntity(id, x1, y1, x2, y2) {
  return {
    id,
    type: 'line',
    x1,
    y1,
    x2,
    y2,
    layerId: 'default',
    meta: {},
  };
}

function createCircleEntity(id, cx, cy, r) {
  return {
    id,
    type: 'circle',
    cx,
    cy,
    r,
    layerId: 'default',
    meta: {},
  };
}

function createRectEntity(id, x, y, width, height, thickness = 18) {
  return {
    id,
    type: 'rect',
    x,
    y,
    width,
    height,
    rotation: 0,
    thickness,
    layerId: 'default',
    meta: {},
  };
}

/** A placed fastener: a subtractive hole carrying the catalog id it stands for. */
function createFastenerEntity(id, hardwareId = 'hw-screw-8-32') {
  return {
    id,
    type: 'feature',
    featureType: 'hole',
    operation: 'subtract',
    shape: 'circle',
    cx: 120,
    cy: 80,
    diameter: 3,
    hardwareId,
    targetPartId: 'panel-left',
    depth: 32,
    through: false,
    layerId: 'default',
    meta: {},
  };
}

function createArcEntity(id, start, end, control) {
  return {
    id,
    type: 'arc',
    start,
    end,
    control,
    layerId: 'default',
    meta: {},
  };
}

describe('sketchStudioReducer history', () => {
  it('undos and redoes committed entity creation', () => {
    const createdState = sketchStudioReducer(createState(), commitEntity(createLineEntity('line-1', 0, 0, 120, 0)));

    expect(createdState.document.entities).toHaveLength(1);
    expect(createdState.history.past).toHaveLength(1);

    const undoneState = sketchStudioReducer(createdState, undo());

    expect(undoneState.document.entities).toHaveLength(0);
    expect(undoneState.history.past).toHaveLength(0);
    expect(undoneState.history.future).toHaveLength(1);

    const redoneState = sketchStudioReducer(undoneState, redo());

    expect(redoneState.document.entities).toHaveLength(1);
    expect(redoneState.document.entities[0].id).toBe('line-1');
    expect(redoneState.history.past).toHaveLength(1);
    expect(redoneState.history.future).toHaveLength(0);
  });

  it('clears redo history after a new committed change', () => {
    const firstState = sketchStudioReducer(createState(), commitEntity(createLineEntity('line-1', 0, 0, 100, 0)));
    const undoneState = sketchStudioReducer(firstState, undo());
    const secondState = sketchStudioReducer(undoneState, commitEntity(createLineEntity('line-2', 0, 0, 0, 100)));

    expect(secondState.history.future).toHaveLength(0);
    expect(secondState.document.entities.map((entity) => entity.id)).toEqual(['line-2']);
  });

  it('resets history when a workspace snapshot is loaded', () => {
    const baseState = createState();
    const changedState = sketchStudioReducer(baseState, commitEntity(createLineEntity('line-1', 0, 0, 100, 0)));
    const loadedState = sketchStudioReducer(
      changedState,
      loadWorkspaceSnapshot({
        document: {
          ...baseState.document,
          id: 'doc-loaded',
        },
        viewport: changedState.viewport,
        ui: {
          activeLayerId: 'default',
        },
      }),
    );

    expect(loadedState.document.id).toBe('doc-loaded');
    expect(loadedState.history.past).toHaveLength(0);
    expect(loadedState.history.future).toHaveLength(0);
  });

  it('does not track viewport-only changes in history', () => {
    const nextState = sketchStudioReducer(
      createState(),
      setViewport({
        zoom: 2,
        panX: 10,
        panY: 20,
      }),
    );

    expect(nextState.viewport.zoom).toBe(2);
    expect(nextState.history.past).toHaveLength(0);
  });

  it('commits handle-drag changes as a single undo step on drag end', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [createLineEntity('line-1', 0, 0, 100, 0)],
      },
    };

    const startedState = sketchStudioReducer(
      baseState,
      startHandleDrag({
        entityId: 'line-1',
        handleId: 'end',
        pointerId: 1,
      }),
    );

    const movedState = sketchStudioReducer(
      startedState,
      setDocumentEntities([createLineEntity('line-1', 0, 0, 160, 0)]),
    );

    expect(movedState.history.past).toHaveLength(0);

    const endedState = sketchStudioReducer(movedState, endHandleDrag());

    expect(endedState.history.past).toHaveLength(1);
    expect(endedState.document.entities[0].x2).toBe(160);

    const undoneState = sketchStudioReducer(endedState, undo());

    expect(undoneState.document.entities[0].x2).toBe(100);
  });

  it('tracks broken-line style toggles in undo history', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [createLineEntity('line-1', 0, 0, 100, 0)],
      },
    };

    const toggledState = sketchStudioReducer(
      baseState,
      setDocumentEntities(toggleBrokenLineForEntities(baseState.document.entities, ['line-1'])),
    );

    expect(toggledState.document.entities[0].meta.lineStyle).toBe('broken');
    expect(toggledState.history.past).toHaveLength(1);

    const undoneState = sketchStudioReducer(toggledState, undo());
    expect(undoneState.document.entities[0].meta.lineStyle).toBeUndefined();
  });

  it('groups and de-groups a multi-selection as undoable document changes', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [
          createRectEntity('panel-left', 0, 0, 200, 120, 18),
          createRectEntity('panel-right', 220, 0, 200, 120, 18),
        ],
      },
    };

    const selectedState = sketchStudioReducer(baseState, setSelection(['panel-left', 'panel-right']));
    const groupedState = sketchStudioReducer(selectedState, groupSelection());
    const groupId = groupedState.document.entities[0].meta.groupId;

    expect(groupId).toBeTruthy();
    expect(groupedState.document.entities[1].meta.groupId).toBe(groupId);
    expect(groupedState.history.past).toHaveLength(1);

    const degroupedState = sketchStudioReducer(groupedState, degroupSelection());

    expect(degroupedState.document.entities[0].meta.groupId).toBeUndefined();
    expect(degroupedState.document.entities[1].meta.groupId).toBeUndefined();
    expect(degroupedState.history.past).toHaveLength(2);

    const undoneState = sketchStudioReducer(degroupedState, undo());

    expect(undoneState.document.entities[0].meta.groupId).toBe(groupId);
    expect(undoneState.document.entities[1].meta.groupId).toBe(groupId);
  });

  it('cleans up singleton group ids after grouped members are deleted', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [
          createRectEntity('panel-left', 0, 0, 200, 120, 18),
          createRectEntity('panel-right', 220, 0, 200, 120, 18),
        ].map((entity) => ({
          ...entity,
          meta: { groupId: 'group-a' },
        })),
      },
    };

    const selectedState = sketchStudioReducer(baseState, setSelection(['panel-left']));
    const deletedState = sketchStudioReducer(selectedState, deleteSelected());

    expect(deletedState.document.entities).toHaveLength(1);
    expect(deletedState.document.entities[0].meta.groupId).toBeUndefined();
  });

  it('treats copy-drag transforms as a single undo step', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [createLineEntity('line-1', 0, 0, 100, 0)],
      },
    };

    const startedState = sketchStudioReducer(
      baseState,
      startTransform({
        type: 'move',
        pointerId: 1,
        startWorld: { x: 0, y: 0 },
        startAngle: 0,
        pivot: null,
        entityIds: ['line-1'],
        startEntities: baseState.document.entities,
        copyMode: 'pending',
        copiedEntityIds: [],
      }),
    );

    const activatedState = sketchStudioReducer(
      startedState,
      patchTransform({
        copyMode: 'active',
        entityIds: ['line-2'],
        copiedEntityIds: ['line-2'],
        startEntities: [createLineEntity('line-1', 0, 0, 100, 0), createLineEntity('line-2', 0, 0, 100, 0)],
      }),
    );

    const movedState = sketchStudioReducer(
      activatedState,
      setDocumentEntities([createLineEntity('line-1', 0, 0, 100, 0), createLineEntity('line-2', 50, 0, 150, 0)]),
    );
    const endedState = sketchStudioReducer(movedState, endTransform());

    expect(endedState.history.past).toHaveLength(1);
    expect(endedState.document.entities.map((entity) => entity.id)).toEqual(['line-1', 'line-2']);

    const undoneState = sketchStudioReducer(endedState, undo());

    expect(undoneState.document.entities.map((entity) => entity.id)).toEqual(['line-1']);
  });

  it('does not create an undo step when a transform ends without document changes', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [createLineEntity('line-1', 0, 0, 100, 0)],
      },
      selection: {
        ...state.selection,
        selectedIds: ['line-1'],
      },
    };

    const startedState = sketchStudioReducer(
      baseState,
      startTransform({
        type: 'move',
        pointerId: 1,
        startWorld: { x: 0, y: 0 },
        startAngle: 0,
        pivot: null,
        entityIds: ['line-1'],
        startEntities: baseState.document.entities,
        copyMode: 'off',
        copiedEntityIds: [],
      }),
    );

    const endedState = sketchStudioReducer(startedState, endTransform());

    expect(endedState.history.past).toHaveLength(0);
    expect(endedState.document.entities).toEqual(baseState.document.entities);
  });

  it('keeps mixed-shape copy-drag transforms as a single undo step', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [
          createCircleEntity('circle-1', 40, 40, 20),
          createArcEntity('arc-1', { x: 100, y: 10 }, { x: 160, y: 10 }, { x: 130, y: 45 }),
        ],
      },
    };

    const startedState = sketchStudioReducer(
      baseState,
      startTransform({
        type: 'move',
        pointerId: 1,
        startWorld: { x: 0, y: 0 },
        startAngle: 0,
        pivot: null,
        entityIds: ['circle-1', 'arc-1'],
        startEntities: baseState.document.entities,
        copyMode: 'pending',
        copiedEntityIds: [],
      }),
    );

    const activatedState = sketchStudioReducer(
      startedState,
      patchTransform({
        copyMode: 'active',
        entityIds: ['circle-2', 'arc-2'],
        copiedEntityIds: ['circle-2', 'arc-2'],
        startEntities: [
          createCircleEntity('circle-1', 40, 40, 20),
          createArcEntity('arc-1', { x: 100, y: 10 }, { x: 160, y: 10 }, { x: 130, y: 45 }),
          createCircleEntity('circle-2', 40, 40, 20),
          createArcEntity('arc-2', { x: 100, y: 10 }, { x: 160, y: 10 }, { x: 130, y: 45 }),
        ],
      }),
    );

    const movedState = sketchStudioReducer(
      activatedState,
      setDocumentEntities([
        createCircleEntity('circle-1', 40, 40, 20),
        createArcEntity('arc-1', { x: 100, y: 10 }, { x: 160, y: 10 }, { x: 130, y: 45 }),
        createCircleEntity('circle-2', 90, 40, 20),
        createArcEntity('arc-2', { x: 150, y: 10 }, { x: 210, y: 10 }, { x: 180, y: 45 }),
      ]),
    );
    const endedState = sketchStudioReducer(movedState, endTransform());

    expect(endedState.history.past).toHaveLength(1);
    expect(endedState.document.entities.map((entity) => entity.id)).toEqual(['circle-1', 'arc-1', 'circle-2', 'arc-2']);

    const undoneState = sketchStudioReducer(endedState, undo());

    expect(undoneState.document.entities.map((entity) => entity.id)).toEqual(['circle-1', 'arc-1']);
  });

  it('adds, updates, and removes joints while keeping generated geometry in sync', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [createRectEntity('panel', 0, 0, 200, 120, 18), createRectEntity('shelf', 40, -18, 60, 18, 18)],
      },
    };
    const joint = {
      id: 'joint-dado',
      type: 'dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
      sourceEdgeRef: { entityId: 'shelf', sourceType: 'segment', sourceKey: 'bottom' },
      targetEdgeRef: { entityId: 'panel', sourceType: 'segment', sourceKey: 'top' },
      parameters: {
        width: 60,
        depth: 6,
      },
    };

    const addedState = sketchStudioReducer(baseState, addJoint(joint));

    expect(addedState.document.joints).toHaveLength(1);
    expect(addedState.document.joints[0]).toMatchObject({
      id: 'joint-dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
    });
    expect(addedState.jointDiagnostics[0]).toMatchObject({ jointId: 'joint-dado', status: 'applied' });
    expect(addedState.manufacturingPreviewEntities[0]).toMatchObject({
      type: 'feature',
      width: 60,
      depth: 6,
    });

    const updatedState = sketchStudioReducer(
      addedState,
      updateJoint('joint-dado', {
        parameters: {
          depth: 9,
        },
      }),
    );

    expect(updatedState.manufacturingPreviewEntities[0]).toMatchObject({
      type: 'feature',
      width: 60,
      depth: 9,
    });

    const removedState = sketchStudioReducer(updatedState, removeJoint('joint-dado'));

    expect(removedState.document.joints).toEqual([]);
    expect(removedState.manufacturingPreviewEntities).toEqual([]);
  });

  it('prunes dependent joints when selected source entities are deleted', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [createRectEntity('panel', 0, 0, 200, 120, 18), createRectEntity('back', 50, -18, 100, 18, 6)],
      },
    };
    const joint = {
      id: 'joint-rabbet',
      type: 'rabbet',
      sourcePartId: 'back',
      targetPartId: 'panel',
      sourceEdgeRef: { entityId: 'back', sourceType: 'segment', sourceKey: 'bottom' },
      targetEdgeRef: { entityId: 'panel', sourceType: 'segment', sourceKey: 'top' },
      parameters: {
        width: 100,
        depth: 9,
      },
    };
    const withJointState = sketchStudioReducer(baseState, addJoint(joint));
    const withSelectionState = sketchStudioReducer(withJointState, setSelection(['back']));
    const deletedState = sketchStudioReducer(withSelectionState, deleteSelected());

    expect(deletedState.document.entities.map((entity) => entity.id)).toEqual(['panel']);
    expect(deletedState.document.joints).toEqual([]);
    expect(deletedState.manufacturingPreviewEntities).toEqual([]);
  });

  it('shares the unchanged document reference between the history snapshot and prior state', () => {
    const baseState = createState();
    const documentBeforeEdit = baseState.document;

    const createdState = sketchStudioReducer(baseState, commitEntity(createLineEntity('line-1', 0, 0, 120, 0)));

    // The edit produced a brand-new document object (immutability), and the single
    // history snapshot references the PRE-edit document by identity, not a clone.
    expect(createdState.document).not.toBe(documentBeforeEdit);
    expect(createdState.history.past).toHaveLength(1);
    expect(createdState.history.past[0].document).toBe(documentBeforeEdit);
  });

  it('caps the past stack and drops the oldest entry once the limit is exceeded', () => {
    let state = createState();
    const totalEdits = HISTORY_LIMIT + 5;

    for (let index = 0; index < totalEdits; index += 1) {
      state = sketchStudioReducer(state, commitEntity(createLineEntity(`line-${index}`, index, 0, index + 10, 0)));
    }

    expect(state.history.past).toHaveLength(HISTORY_LIMIT);
    // The oldest snapshot (empty document) must have been evicted: the earliest
    // retained snapshot should already contain the first few entities.
    expect(state.history.past[0].document.entities.length).toBeGreaterThan(0);
  });

  it('keeps the past stack capped while cycling redo repeatedly', () => {
    let state = createState();

    for (let index = 0; index < HISTORY_LIMIT + 3; index += 1) {
      state = sketchStudioReducer(state, commitEntity(createLineEntity(`line-${index}`, index, 0, index + 10, 0)));
    }

    expect(state.history.past).toHaveLength(HISTORY_LIMIT);

    // Undo once, then redo: the redo must not push past beyond the cap.
    const undoneState = sketchStudioReducer(state, undo());
    const redoneState = sketchStudioReducer(undoneState, redo());

    expect(redoneState.history.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });

  it('round-trips exact prior document state through undo', () => {
    const baseState = createState();
    const createdState = sketchStudioReducer(baseState, commitEntity(createLineEntity('line-1', 0, 0, 120, 0)));
    const documentAfterCreate = createdState.document;

    const undoneState = sketchStudioReducer(createdState, undo());
    expect(undoneState.document.entities).toHaveLength(0);

    const redoneState = sketchStudioReducer(undoneState, redo());
    // Redo restores the same entity set; the future snapshot referenced the
    // post-create document by identity.
    expect(redoneState.document.entities.map((entity) => entity.id)).toEqual(
      documentAfterCreate.entities.map((entity) => entity.id),
    );
  });

  it('applies one material change across multiple selected entities', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [
          createRectEntity('panel-left', 0, 0, 200, 120, 18),
          createRectEntity('panel-right', 220, 0, 200, 120, 18),
          createRectEntity('panel-top', 0, 140, 420, 18, 18),
        ],
      },
    };

    const nextState = sketchStudioReducer(
      baseState,
      setEntityMaterial(['panel-left', 'panel-right'], 'plywood-birch-18'),
    );

    expect(nextState.document.entities).toEqual([
      expect.objectContaining({ id: 'panel-left', materialId: 'plywood-birch-18' }),
      expect.objectContaining({ id: 'panel-right', materialId: 'plywood-birch-18' }),
      expect.objectContaining({ id: 'panel-top' }),
    ]);
    expect(nextState.document.entities.find((entity) => entity.id === 'panel-top')).not.toHaveProperty('materialId');
  });

  it('applies a grain direction across the selection and folds it onto the fibre axis', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [
          createRectEntity('panel-left', 0, 0, 200, 120, 18),
          createRectEntity('panel-right', 220, 0, 200, 120, 18),
        ],
      },
    };

    // 270 degrees is the same fibre axis as 90, so it normalizes on the way in.
    const nextState = sketchStudioReducer(baseState, setEntityGrainAngle(['panel-left', 'panel-right'], 270));
    expect(nextState.document.entities.map((entity) => entity.grainAngle)).toEqual([90, 90]);

    // Clearing the constraint stores null, not a stale angle.
    const clearedState = sketchStudioReducer(nextState, setEntityGrainAngle(['panel-left'], null));
    expect(clearedState.document.entities.find((entity) => entity.id === 'panel-left').grainAngle).toBeNull();
    expect(clearedState.document.entities.find((entity) => entity.id === 'panel-right').grainAngle).toBe(90);
  });

  it('tracks the fastener tool hardware outside the document and history', () => {
    const state = createState();

    expect(state.ui.activeHardwareId).toBe('hw-screw-8-32');

    const nextState = sketchStudioReducer(state, setActiveHardware('hw-bolt-m6-40'));
    expect(nextState.ui.activeHardwareId).toBe('hw-bolt-m6-40');
    expect(nextState.document).toBe(state.document);
    expect(nextState.history).toBe(state.history);

    // Repeating the same id is a no-op, and clearing falls back to the default.
    expect(sketchStudioReducer(nextState, setActiveHardware('hw-bolt-m6-40'))).toBe(nextState);
    expect(sketchStudioReducer(nextState, setActiveHardware(null)).ui.activeHardwareId).toBe('hw-screw-8-32');
  });

  it('re-points a placed fastener at another catalog item and keeps it undoable', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [createFastenerEntity('feature-1'), createRectEntity('panel-left', 0, 0, 200, 120, 18)],
      },
    };

    const nextState = sketchStudioReducer(baseState, setEntityHardware(['feature-1'], 'hw-bolt-m6-40'));
    const fastener = nextState.document.entities.find((entity) => entity.id === 'feature-1');

    expect(fastener).toMatchObject({
      hardwareId: 'hw-bolt-m6-40',
      // Pilot diameter of the bolt, and bolts pass clean through.
      diameter: 6.5,
      depth: null,
      through: true,
    });
    expect(nextState.document.entities.find((entity) => entity.id === 'panel-left')).toBe(
      baseState.document.entities[1],
    );
    expect(nextState.history.past).toHaveLength(1);

    const undoneState = sketchStudioReducer(nextState, undo());
    expect(undoneState.document.entities.find((entity) => entity.id === 'feature-1')).toMatchObject({
      hardwareId: 'hw-screw-8-32',
      diameter: 3,
      depth: 32,
      through: false,
    });
  });

  it('ignores hardware changes for non-features and unknown catalog ids', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [createFastenerEntity('feature-1'), createRectEntity('panel-left', 0, 0, 200, 120, 18)],
      },
    };

    expect(sketchStudioReducer(baseState, setEntityHardware(['panel-left'], 'hw-bolt-m6-40'))).toBe(baseState);
    expect(sketchStudioReducer(baseState, setEntityHardware(['feature-1'], 'not-a-catalog-id'))).toBe(baseState);
  });

  it('toggles and closes the shortcut overlay without touching history', () => {
    const state = createState();

    expect(state.ui.shortcutOverlayOpen).toBe(false);

    const openedState = sketchStudioReducer(state, toggleShortcutOverlay());
    expect(openedState.ui.shortcutOverlayOpen).toBe(true);
    expect(openedState.history).toBe(state.history);
    expect(openedState.document).toBe(state.document);

    const closedState = sketchStudioReducer(openedState, closeShortcutOverlay());
    expect(closedState.ui.shortcutOverlayOpen).toBe(false);

    expect(sketchStudioReducer(closedState, closeShortcutOverlay())).toBe(closedState);
    expect(sketchStudioReducer(closedState, toggleShortcutOverlay()).ui.shortcutOverlayOpen).toBe(true);
  });
});

// Serialize a group index (groupId -> Set of ids) into a plain, order-independent
// structure so it can be deep-compared against a from-scratch rebuild.
function snapshotGroupIndex(groupIndex) {
  if (!(groupIndex instanceof Map)) {
    return null;
  }
  return Object.fromEntries(
    Array.from(groupIndex.entries())
      .map(([groupId, members]) => [groupId, Array.from(members).sort()])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function expectIndexMatchesRebuild(state) {
  expect(snapshotGroupIndex(state.document.groupIndex)).toEqual(
    snapshotGroupIndex(buildGroupIndex(state.document.entities)),
  );
}

function createGroupedBaseState() {
  const state = createState();
  const entities = [
    createRectEntity('panel-left', 0, 0, 200, 120, 18),
    createRectEntity('panel-right', 220, 0, 200, 120, 18),
    createRectEntity('spacer', 0, 200, 60, 60, 18),
  ];
  return {
    ...state,
    document: {
      ...state.document,
      entities,
      // Seed the runtime index exactly as the hook's initializer would.
      groupIndex: buildGroupIndex(entities),
    },
  };
}

describe('sketchStudioReducer groupIndex reuse', () => {
  it('never rebuilds the index on a geometry-only move but stays consistent through a full lifecycle', () => {
    // add (via commit) -> group -> move -> duplicate -> degroup -> delete -> undo -> redo
    const baseState = createGroupedBaseState();
    expectIndexMatchesRebuild(baseState);

    // add: commit a new entity (membership set grows -> rebuild is expected)
    const committedState = sketchStudioReducer(
      baseState,
      commitEntity(createRectEntity('panel-back', 0, 300, 200, 18, 6)),
    );
    expectIndexMatchesRebuild(committedState);

    // group: two panels into a shared group (membership changes -> rebuild)
    const selectedState = sketchStudioReducer(committedState, setSelection(['panel-left', 'panel-right']));
    const groupedState = sketchStudioReducer(selectedState, groupSelection());
    const groupId = groupedState.document.entities.find((entity) => entity.id === 'panel-left').meta.groupId;
    expect(groupId).toBeTruthy();
    expect(groupedState.document.entities.find((entity) => entity.id === 'panel-right').meta.groupId).toBe(groupId);
    expectIndexMatchesRebuild(groupedState);
    expect(groupedState.document.groupIndex.get(groupId)).toEqual(new Set(['panel-left', 'panel-right']));

    // move: translate the grouped panels. Membership is unchanged, so the index
    // MUST be reused by reference (the O(1) win on the hot path).
    const indexBeforeMove = groupedState.document.groupIndex;
    const movedEntities = groupedState.document.entities.map((entity) =>
      entity.meta?.groupId === groupId ? { ...entity, x: entity.x + 500 } : entity,
    );
    const movedState = sketchStudioReducer(groupedState, setDocumentEntities(movedEntities));
    expect(movedState.document.entities.find((entity) => entity.id === 'panel-left').x).toBe(500);
    expect(movedState.document.groupIndex).toBe(indexBeforeMove);
    expectIndexMatchesRebuild(movedState);

    // duplicate grouped entities: membership grows (new ids + new group) -> rebuild,
    // and the index must reflect BOTH the original and the duplicated group.
    const duplication = duplicateEntitiesByIds(movedState.document.entities, ['panel-left', 'panel-right']);
    const duplicatedState = sketchStudioReducer(movedState, setDocumentEntities(duplication.entities));
    expect(duplicatedState.document.groupIndex).not.toBe(indexBeforeMove);
    expectIndexMatchesRebuild(duplicatedState);
    const duplicatedGroupId = duplicatedState.document.entities.find(
      (entity) => duplication.duplicatedIdSet.has(entity.id) && entity.meta?.groupId,
    ).meta.groupId;
    expect(duplicatedGroupId).not.toBe(groupId);
    expect(duplicatedState.document.groupIndex.get(groupId)).toEqual(new Set(['panel-left', 'panel-right']));
    expect(duplicatedState.document.groupIndex.get(duplicatedGroupId)).toEqual(new Set(duplication.duplicatedIds));

    // degroup: remove the original group membership (membership changes -> rebuild)
    const degroupSelectedState = sketchStudioReducer(duplicatedState, setSelection(['panel-left', 'panel-right']));
    const degroupedState = sketchStudioReducer(degroupSelectedState, degroupSelection());
    expect(degroupedState.document.entities.find((entity) => entity.id === 'panel-left').meta.groupId).toBeUndefined();
    expectIndexMatchesRebuild(degroupedState);
    expect(degroupedState.document.groupIndex.has(groupId)).toBe(false);
    // The duplicated group is untouched by the degroup.
    expect(degroupedState.document.groupIndex.get(duplicatedGroupId)).toEqual(new Set(duplication.duplicatedIds));

    // delete: remove a duplicated group member (membership shrinks -> rebuild)
    const deleteSelectedState = sketchStudioReducer(degroupedState, setSelection([...duplication.duplicatedIds]));
    const deletedState = sketchStudioReducer(deleteSelectedState, deleteSelected());
    expectIndexMatchesRebuild(deletedState);
    expect(deletedState.document.groupIndex.has(duplicatedGroupId)).toBe(false);

    // undo: restore the pre-delete document. The index must be recomputed to
    // match the restored entities.
    const undoneState = sketchStudioReducer(deletedState, undo());
    expectIndexMatchesRebuild(undoneState);
    expect(undoneState.document.groupIndex.get(duplicatedGroupId)).toEqual(new Set(duplication.duplicatedIds));

    // redo: re-apply the delete. The index must be recomputed again.
    const redoneState = sketchStudioReducer(undoneState, redo());
    expectIndexMatchesRebuild(redoneState);
    expect(redoneState.document.groupIndex.has(duplicatedGroupId)).toBe(false);
  });

  it('reuses the index reference across a property edit that does not touch group membership', () => {
    const baseState = createGroupedBaseState();
    const groupedState = sketchStudioReducer(
      sketchStudioReducer(baseState, setSelection(['panel-left', 'panel-right'])),
      groupSelection(),
    );
    const indexBeforeEdit = groupedState.document.groupIndex;

    // A material change is membership-invariant and already passes reuseGroupIndex.
    const materialState = sketchStudioReducer(groupedState, setEntityMaterial(['panel-left'], 'plywood-birch-18'));
    expect(materialState.document.groupIndex).toBe(indexBeforeEdit);
    expectIndexMatchesRebuild(materialState);

    // A broken-line toggle flows through SET_DOCUMENT_ENTITIES and only edits
    // meta.lineStyle, so the index reference must be preserved too.
    const toggledState = sketchStudioReducer(
      materialState,
      setDocumentEntities(toggleBrokenLineForEntities(materialState.document.entities, ['panel-left'])),
    );
    expect(toggledState.document.groupIndex).toBe(indexBeforeEdit);
    expectIndexMatchesRebuild(toggledState);
  });
});
