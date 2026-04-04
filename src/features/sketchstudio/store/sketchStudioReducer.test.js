import { describe, expect, it } from 'vitest';
import { toggleBrokenLineForEntities } from '../utils/entityUtils';
import sketchStudioInitialState from './sketchStudioInitialState';
import sketchStudioReducer from './sketchStudioReducer';
import {
  addJoint,
  commitEntity,
  deleteSelected,
  endHandleDrag,
  endTransform,
  loadWorkspaceSnapshot,
  patchTransform,
  redo,
  removeJoint,
  setSelection,
  setDocumentEntities,
  setViewport,
  startHandleDrag,
  startTransform,
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
    const loadedState = sketchStudioReducer(changedState, loadWorkspaceSnapshot({
      document: {
        ...baseState.document,
        id: 'doc-loaded',
      },
      viewport: changedState.viewport,
      ui: {
        activeLayerId: 'default',
      },
    }));

    expect(loadedState.document.id).toBe('doc-loaded');
    expect(loadedState.history.past).toHaveLength(0);
    expect(loadedState.history.future).toHaveLength(0);
  });

  it('does not track viewport-only changes in history', () => {
    const nextState = sketchStudioReducer(createState(), setViewport({
      zoom: 2,
      panX: 10,
      panY: 20,
    }));

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

    const startedState = sketchStudioReducer(baseState, startHandleDrag({
      entityId: 'line-1',
      handleId: 'end',
      pointerId: 1,
    }));

    const movedState = sketchStudioReducer(startedState, setDocumentEntities([
      createLineEntity('line-1', 0, 0, 160, 0),
    ]));

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

  it('treats copy-drag transforms as a single undo step', () => {
    const state = createState();
    const baseState = {
      ...state,
      document: {
        ...state.document,
        entities: [createLineEntity('line-1', 0, 0, 100, 0)],
      },
    };

    const startedState = sketchStudioReducer(baseState, startTransform({
      type: 'move',
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      startAngle: 0,
      pivot: null,
      entityIds: ['line-1'],
      startEntities: baseState.document.entities,
      copyMode: 'pending',
      copiedEntityIds: [],
    }));

    const activatedState = sketchStudioReducer(startedState, patchTransform({
      copyMode: 'active',
      entityIds: ['line-2'],
      copiedEntityIds: ['line-2'],
      startEntities: [
        createLineEntity('line-1', 0, 0, 100, 0),
        createLineEntity('line-2', 0, 0, 100, 0),
      ],
    }));

    const movedState = sketchStudioReducer(activatedState, setDocumentEntities([
      createLineEntity('line-1', 0, 0, 100, 0),
      createLineEntity('line-2', 50, 0, 150, 0),
    ]));
    const endedState = sketchStudioReducer(movedState, endTransform());

    expect(endedState.history.past).toHaveLength(1);
    expect(endedState.document.entities.map((entity) => entity.id)).toEqual(['line-1', 'line-2']);

    const undoneState = sketchStudioReducer(endedState, undo());

    expect(undoneState.document.entities.map((entity) => entity.id)).toEqual(['line-1']);
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

    const startedState = sketchStudioReducer(baseState, startTransform({
      type: 'move',
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      startAngle: 0,
      pivot: null,
      entityIds: ['circle-1', 'arc-1'],
      startEntities: baseState.document.entities,
      copyMode: 'pending',
      copiedEntityIds: [],
    }));

    const activatedState = sketchStudioReducer(startedState, patchTransform({
      copyMode: 'active',
      entityIds: ['circle-2', 'arc-2'],
      copiedEntityIds: ['circle-2', 'arc-2'],
      startEntities: [
        createCircleEntity('circle-1', 40, 40, 20),
        createArcEntity('arc-1', { x: 100, y: 10 }, { x: 160, y: 10 }, { x: 130, y: 45 }),
        createCircleEntity('circle-2', 40, 40, 20),
        createArcEntity('arc-2', { x: 100, y: 10 }, { x: 160, y: 10 }, { x: 130, y: 45 }),
      ],
    }));

    const movedState = sketchStudioReducer(activatedState, setDocumentEntities([
      createCircleEntity('circle-1', 40, 40, 20),
      createArcEntity('arc-1', { x: 100, y: 10 }, { x: 160, y: 10 }, { x: 130, y: 45 }),
      createCircleEntity('circle-2', 90, 40, 20),
      createArcEntity('arc-2', { x: 150, y: 10 }, { x: 210, y: 10 }, { x: 180, y: 45 }),
    ]));
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
        entities: [
          createRectEntity('panel', 0, 0, 200, 120, 18),
          createRectEntity('shelf', 40, -18, 60, 18, 18),
        ],
      },
    };
    const joint = {
      id: 'joint-dado',
      type: 'dado',
      primaryEntityId: 'panel',
      secondaryEntityId: 'shelf',
      primaryEdgeRef: { entityId: 'panel', sourceType: 'segment', sourceKey: 'top' },
      secondaryEdgeRef: { entityId: 'shelf', sourceType: 'segment', sourceKey: 'bottom' },
      parameters: {
        width: 60,
        depth: 6,
      },
    };

    const addedState = sketchStudioReducer(baseState, addJoint(joint));

    expect(addedState.document.joints).toHaveLength(1);
    expect(addedState.jointDiagnostics[0]).toMatchObject({ jointId: 'joint-dado', status: 'applied' });
    expect(addedState.manufacturingPreviewEntities[0]).toMatchObject({
      type: 'feature',
      width: 60,
      depth: 6,
    });

    const updatedState = sketchStudioReducer(addedState, updateJoint('joint-dado', {
      parameters: {
        depth: 9,
      },
    }));

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
        entities: [
          createRectEntity('panel', 0, 0, 200, 120, 18),
          createRectEntity('back', 50, -18, 100, 18, 6),
        ],
      },
    };
    const joint = {
      id: 'joint-rabbet',
      type: 'rabbet',
      primaryEntityId: 'panel',
      secondaryEntityId: 'back',
      primaryEdgeRef: { entityId: 'panel', sourceType: 'segment', sourceKey: 'top' },
      secondaryEdgeRef: { entityId: 'back', sourceType: 'segment', sourceKey: 'bottom' },
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
});
