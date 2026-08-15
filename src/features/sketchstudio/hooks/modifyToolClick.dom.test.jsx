/* @vitest-environment jsdom */
/**
 * Click flows for the modify toolset. These exercise the wiring the pure utils
 * tests cannot see: which actions a click dispatches, in what order, and that a
 * single gesture only ever produces one document write.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import useSketchToolClick from './useSketchToolClick';

function line(id, x1, y1, x2, y2) {
  return { id, type: 'line', x1, y1, x2, y2, layerId: 'default', visible: true, meta: {} };
}

const TRIM_TARGET = line('line-target', 0, 0, 1000, 0);
const CUT_ONE = line('cut-1', 250, -50, 250, 50);
const CUT_TWO = line('cut-2', 750, -50, 750, 50);
const AXIS_LINE = line('axis-line', 0, -100, 0, 100);

function buildState({ entities, draft = {}, selectedIds = [], ui = {} }) {
  return {
    document: {
      entities,
      layers: [
        { id: 'default', visible: true, locked: false },
        { id: 'dimensions', visible: true, locked: false },
      ],
      units: 'mm',
      joints: [],
      groupIndex: new Map(),
    },
    draft: { precisionInput: {}, ...draft },
    selection: { selectedIds },
    interaction: { suppressNextClick: false },
    viewport: { zoom: 1, panX: 0, panY: 0 },
    ui: {
      activeLayerId: 'default',
      activeHardwareId: null,
      viewMode: 'plan',
      isometricPlane: 'top',
      arrayMode: 'linear',
      ...ui,
    },
  };
}

function clickTool(activeTool, state, { worldPoint, snap = {}, hoveredEntity = null }) {
  const dispatch = vi.fn();
  const viewportHook = {
    readCanvasPoint: () => ({ x: 0, y: 0 }),
    getOrthoReferencePoint: () => null,
    resolvePointerState: () => ({ worldPoint, snap, hoveredEntity }),
  };
  const options = {
    activeTool,
    editableEntities: state.document.entities,
    draftPreview: null,
    commitPrecisionDraft: vi.fn(),
    getConstrainedDraftPoint: (_tool, _draft, point) => point,
  };

  const { result } = renderHook(() => useSketchToolClick(state, dispatch, viewportHook, options));
  result.current.handleCanvasClick({ button: 0, shiftKey: false });

  return dispatch.mock.calls.map((call) => call[0]);
}

function findAction(actions, type) {
  return actions.find((action) => action.type === type) ?? null;
}

describe('trim tool click flow', () => {
  it('writes the document once, dropping the target and adding both pieces', () => {
    const state = buildState({ entities: [TRIM_TARGET, CUT_ONE, CUT_TWO] });
    const actions = clickTool('trim', state, { worldPoint: { x: 500, y: 0 } });
    const documentActions = actions.filter((action) => action.type === 'SET_DOCUMENT');

    expect(documentActions).toHaveLength(1);

    const nextEntities = documentActions[0].payload.entities;
    const pieces = nextEntities.filter((entity) => entity.type === 'line' && !entity.id.startsWith('cut-'));

    expect(nextEntities.some((entity) => entity.id === 'line-target')).toBe(false);
    expect(pieces).toHaveLength(2);
    expect(pieces[0].x2).toBeCloseTo(250, 6);
    expect(pieces[1].x1).toBeCloseTo(750, 6);
  });

  it('deletes the whole entity when nothing crosses it', () => {
    const state = buildState({ entities: [TRIM_TARGET] });
    const actions = clickTool('trim', state, { worldPoint: { x: 500, y: 0 } });

    expect(findAction(actions, 'SET_DOCUMENT').payload.entities).toEqual([]);
  });

  it('does nothing at all when the click misses every trimmable entity', () => {
    const state = buildState({ entities: [TRIM_TARGET] });

    expect(clickTool('trim', state, { worldPoint: { x: 500, y: 5000 } })).toEqual([]);
  });

  it('drops a trimmed-away entity out of the selection', () => {
    const state = buildState({ entities: [TRIM_TARGET, CUT_ONE, CUT_TWO], selectedIds: ['line-target', 'cut-1'] });
    const actions = clickTool('trim', state, { worldPoint: { x: 500, y: 0 } });

    expect(findAction(actions, 'SET_SELECTION').payload).toEqual(['cut-1']);
  });

  it('stays on the tool so the next click keeps trimming', () => {
    const state = buildState({ entities: [TRIM_TARGET, CUT_ONE, CUT_TWO] });
    const actions = clickTool('trim', state, { worldPoint: { x: 500, y: 0 } });

    expect(findAction(actions, 'SET_ACTIVE_TOOL')).toBeNull();
    expect(findAction(actions, 'CANCEL_DRAFT')).toBeNull();
  });
});

describe('extend tool click flow', () => {
  it('extends the picked end in one document write', () => {
    const state = buildState({ entities: [line('line-a', 0, 0, 100, 0), line('blocker', 300, -100, 300, 100)] });
    const actions = clickTool('extend', state, { worldPoint: { x: 100, y: 0 } });
    const documentActions = actions.filter((action) => action.type === 'SET_DOCUMENT_ENTITIES');

    expect(documentActions).toHaveLength(1);
    expect(documentActions[0].payload[0].x2).toBeCloseTo(300, 6);
  });

  it('toasts instead of moving anything when nothing is in the way', () => {
    const state = buildState({ entities: [line('line-a', 0, 0, 100, 0)] });
    const actions = clickTool('extend', state, { worldPoint: { x: 100, y: 0 } });

    expect(findAction(actions, 'SET_DOCUMENT_ENTITIES')).toBeNull();
    expect(findAction(actions, 'SET_UI_FLAG').payload.key).toBe('toast');
    expect(findAction(actions, 'SET_UI_FLAG').payload.value.message).toMatch(/nothing lies in the path/i);
  });

  it('toasts when the click is nowhere near a free end', () => {
    const state = buildState({ entities: [line('line-a', 0, 0, 100, 0), line('blocker', 300, -100, 300, 100)] });
    const actions = clickTool('extend', state, { worldPoint: { x: 50, y: 0 } });

    expect(findAction(actions, 'SET_UI_FLAG').payload.value.message).toMatch(/free end/i);
  });
});

describe('mirror tool click flow', () => {
  const SELECTION = [line('line-a', 100, 0, 200, 0)];

  it('refuses to start without a selection', () => {
    const state = buildState({ entities: SELECTION });
    const actions = clickTool('mirror', state, { worldPoint: { x: 0, y: 0 } });

    expect(findAction(actions, 'START_DRAFT')).toBeNull();
    expect(findAction(actions, 'SET_UI_FLAG').payload.value.message).toMatch(/select the entities to mirror/i);
  });

  it('snapshots the selection on the first axis pick', () => {
    const state = buildState({ entities: SELECTION, selectedIds: ['line-a'] });
    const actions = clickTool('mirror', state, { worldPoint: { x: 0, y: 0 } });
    const draft = findAction(actions, 'START_DRAFT').payload;

    expect(draft.type).toBe('mirror');
    expect(draft.step).toBe('pickAxisEnd');
    expect(draft.points).toEqual([{ x: 0, y: 0 }]);
    expect(draft.selectionIds).toEqual(['line-a']);
  });

  it('commits copies on the second pick, selects them, and clears the draft', () => {
    const state = buildState({
      entities: SELECTION,
      selectedIds: ['line-a'],
      draft: { type: 'mirror', step: 'pickAxisEnd', points: [{ x: 0, y: 0 }], selectionIds: ['line-a'] },
    });
    const actions = clickTool('mirror', state, { worldPoint: { x: 0, y: 100 } });
    const documentActions = actions.filter((action) => action.type === 'SET_DOCUMENT_ENTITIES');

    expect(documentActions).toHaveLength(1);

    const nextEntities = documentActions[0].payload;

    expect(nextEntities).toHaveLength(2);
    expect(nextEntities[0]).toBe(SELECTION[0]);
    expect(nextEntities[1]).toMatchObject({ x1: -100, x2: -200 });
    expect(findAction(actions, 'SET_SELECTION').payload).toEqual([nextEntities[1].id]);
    expect(findAction(actions, 'CANCEL_DRAFT')).not.toBeNull();
  });

  it('uses a picked line entity as the whole axis in a single click', () => {
    const state = buildState({ entities: [...SELECTION, AXIS_LINE], selectedIds: ['line-a'] });
    const actions = clickTool('mirror', state, {
      worldPoint: { x: 0, y: 40 },
      hoveredEntity: AXIS_LINE,
    });

    expect(findAction(actions, 'START_DRAFT')).toBeNull();

    const nextEntities = findAction(actions, 'SET_DOCUMENT_ENTITIES').payload;

    expect(nextEntities).toHaveLength(3);
    expect(nextEntities[2]).toMatchObject({ x1: -100, x2: -200 });
  });

  it('reports skipped annotations once', () => {
    const text = { id: 'text-1', type: 'text', x: 10, y: 10, text: 'Label', layerId: 'default', meta: {} };
    const state = buildState({
      entities: [...SELECTION, text],
      selectedIds: ['line-a', 'text-1'],
      draft: {
        type: 'mirror',
        step: 'pickAxisEnd',
        points: [{ x: 0, y: 0 }],
        selectionIds: ['line-a', 'text-1'],
      },
    });
    const actions = clickTool('mirror', state, { worldPoint: { x: 0, y: 100 } });
    const toast = findAction(actions, 'SET_UI_FLAG');

    expect(toast.payload.value.message).toMatch(/1 annotation skipped/i);
  });
});

describe('array tool click flow', () => {
  const SELECTION = [line('line-a', 0, 0, 50, 0)];

  it('refuses to start without a selection', () => {
    const state = buildState({ entities: SELECTION });
    const actions = clickTool('array', state, { worldPoint: { x: 0, y: 0 } });

    expect(findAction(actions, 'SET_UI_FLAG').payload.value.message).toMatch(/select the entities to array/i);
  });

  it('picks a base point then commits a linear run', () => {
    const state = buildState({
      entities: SELECTION,
      selectedIds: ['line-a'],
      draft: {
        type: 'array',
        step: 'pickSecond',
        points: [{ x: 0, y: 0 }],
        selectionIds: ['line-a'],
        precisionInput: { count: '3' },
      },
    });
    const actions = clickTool('array', state, { worldPoint: { x: 100, y: 0 } });
    const nextEntities = findAction(actions, 'SET_DOCUMENT_ENTITIES').payload;

    expect(nextEntities).toHaveLength(3);
    expect(nextEntities.map((entity) => entity.x1)).toEqual([0, 100, 200]);
  });

  it('commits a polar ring when the mode is polar', () => {
    const state = buildState({
      entities: [line('line-a', 100, 0, 200, 0)],
      selectedIds: ['line-a'],
      ui: { arrayMode: 'polar' },
      draft: {
        type: 'array',
        step: 'pickCount',
        points: [{ x: 0, y: 0 }],
        selectionIds: ['line-a'],
        precisionInput: { count: '4', angle: '360' },
      },
    });
    const actions = clickTool('array', state, { worldPoint: { x: 50, y: 50 } });
    const nextEntities = findAction(actions, 'SET_DOCUMENT_ENTITIES').payload;

    expect(nextEntities).toHaveLength(4);
    expect(nextEntities[1].x1).toBeCloseTo(0, 6);
    expect(nextEntities[1].y1).toBeCloseTo(100, 6);
  });
});

describe('chamfer tool click flow', () => {
  it('cuts the picked corner in one document write', () => {
    const state = buildState({
      entities: [line('line-a', 0, 0, 100, 0), line('line-b', 100, 0, 100, 100)],
      draft: { precisionInput: { distance: '20' } },
    });
    const actions = clickTool('chamfer', state, { worldPoint: { x: 100, y: 0 } });
    const documentActions = actions.filter((action) => action.type === 'SET_DOCUMENT_ENTITIES');

    expect(documentActions).toHaveLength(1);

    const nextEntities = documentActions[0].payload;

    expect(nextEntities).toHaveLength(3);
    expect(nextEntities[2]).toMatchObject({ type: 'line', x1: 80, y1: 0, x2: 100, y2: 20 });
    expect(nextEntities.some((entity) => entity.type === 'arc')).toBe(false);
  });

  it('does nothing when the click is away from any corner', () => {
    const state = buildState({
      entities: [line('line-a', 0, 0, 100, 0), line('line-b', 100, 0, 100, 100)],
    });

    expect(clickTool('chamfer', state, { worldPoint: { x: 5000, y: 5000 } })).toEqual([]);
  });
});
