/* @vitest-environment jsdom */
/**
 * How a canvas gesture ends: the button coming up, the browser taking the
 * pointer away, Escape, or undo pressed mid-gesture. Each of those used to be
 * decided separately in its own hook, and they disagreed: Escape kept a moved
 * selection where it was dropped, did nothing at all for a handle drag, a pan
 * or a marquee, and a tool shortcut pressed mid-drag left the moved geometry
 * outside the history. These drive the real hook and reducer, so what is
 * checked is what the canvas does, not which branch ran.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import useSketchStudio from './useSketchStudio';
import useSketchPointer from './useSketchPointer';
import useSketchHistory from './useSketchHistory';
import sampleDocument from '../data/sampleDocument';
import { ConfirmDialogProvider } from '../../../ui/ConfirmDialog';
import { SKETCH_STUDIO_ACTIONS } from '../store/sketchStudioActions';
import { INTERACTION_END, interactionEndAction } from '../store/interactionEnd';
import { HOVER_DRAFT_TOOLS, TOOL_DEFINITIONS } from './sketchConstants';

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

function line(id, x1, y1, x2, y2) {
  return { id, type: 'line', x1, y1, x2, y2, layerId: 'default', visible: true, meta: {} };
}

const LINE = line('line-a', 0, 0, 100, 0);
const OTHER = line('line-b', 0, 300, 100, 300);

function pointer({ x = 0, y = 0, button = 0, ctrlKey = false, shiftKey = false } = {}) {
  return {
    clientX: x,
    clientY: y,
    button,
    ctrlKey,
    shiftKey,
    metaKey: false,
    pointerId: 1,
    preventDefault() {},
    stopPropagation() {},
    currentTarget: { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} },
  };
}

function press(key, options = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
  });
}

/** The real hook with `entities` loaded, the viewport at 1:1 so a client point is a world point. */
function mountStudio(entities = [LINE, OTHER]) {
  const view = renderHook(() => useSketchStudio(), { wrapper: ConfirmDialogProvider });
  act(() => view.result.current.loadTemplate({ document: { ...sampleDocument, entities } }));
  const canvas = document.createElement('div');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000 });
  view.result.current.canvasRef.current = canvas;
  const studio = () => view.result.current;
  const run = (name, ...args) => act(() => studio()[name](...args));
  const entity = (id) => studio().document.entities.find((candidate) => candidate.id === id);
  return { studio, run, entity };
}

/** Select a line by pressing on it and letting go, as the select tool does. */
function selectLine(env, at = { x: 50, y: 0 }) {
  env.run('onCanvasPointerDown', pointer(at));
  env.run('onCanvasPointerUp', pointer(at));
  env.run('onCanvasClick', pointer(at));
  expect(env.studio().selection.selectedIds).toEqual(['line-a']);
}

/** Press on the selected line and drag it 40 down. */
function startMove(env, { ctrlKey = false } = {}) {
  env.run('onCanvasPointerDown', pointer({ x: 50, y: 0, ctrlKey }));
  env.run('onCanvasPointerMove', pointer({ x: 50, y: 40, ctrlKey }));
  expect(env.studio().interaction.mode).toBe('transform');
}

describe('Escape during a drag', () => {
  it('puts a moved selection back, adds no history entry and keeps the selection', () => {
    const env = mountStudio();
    selectLine(env);
    const pastBefore = env.studio().canUndo;
    startMove(env);
    expect(env.entity('line-a').y1).toBe(40);

    press('Escape');

    expect(env.entity('line-a')).toMatchObject({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(env.studio().interaction.mode).toBe('idle');
    expect(env.studio().canUndo).toBe(pastBefore);
    expect(env.studio().selection.selectedIds).toEqual(['line-a']);

    // The button is still down; letting go must not click whatever is under it.
    env.run('onCanvasPointerUp', pointer({ x: 50, y: 40 }));
    env.run('onCanvasClick', pointer({ x: 500, y: 500 }));
    expect(env.studio().selection.selectedIds).toEqual(['line-a']);
    expect(env.studio().interaction.suppressNextClick).toBe(false);
  });

  it('drops the copies of a Ctrl-drag and keeps the original selection', () => {
    const env = mountStudio();
    selectLine(env);
    startMove(env, { ctrlKey: true });
    expect(env.studio().document.entities).toHaveLength(3);
    expect(env.studio().selection.selectedIds).not.toEqual(['line-a']);

    press('Escape');

    expect(env.studio().document.entities.map((candidate) => candidate.id)).toEqual(['line-a', 'line-b']);
    expect(env.studio().selection.selectedIds).toEqual(['line-a']);
  });

  it('puts a dragged handle back', () => {
    const env = mountStudio();
    selectLine(env);
    const pastBefore = env.studio().canUndo;
    act(() => env.studio().handleBindings.onHandlePointerDown({ id: 'end' }, pointer({ x: 100, y: 0 })));
    env.run('onCanvasPointerMove', pointer({ x: 160, y: 70 }));
    expect(env.studio().interaction.mode).toBe('handle-drag');
    expect(env.entity('line-a').x2).not.toBe(100);

    press('Escape');

    expect(env.entity('line-a')).toMatchObject({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(env.studio().interaction.mode).toBe('idle');
    expect(env.studio().canUndo).toBe(pastBefore);
    expect(env.studio().selection.selectedIds).toEqual(['line-a']);
    expect(env.studio().interaction.suppressNextClick).toBe(true);
  });

  it('abandons a marquee without touching the selection or clicking on release', () => {
    const env = mountStudio();
    selectLine(env);
    env.run('onCanvasPointerDown', pointer({ x: 500, y: 500 }));
    env.run('onCanvasPointerMove', pointer({ x: -50, y: -50 }));
    expect(env.studio().interaction.mode).toBe('selection-box');

    press('Escape');

    expect(env.studio().interaction.mode).toBe('idle');
    expect(env.studio().selection.selectionBox.isActive).toBe(false);
    env.run('onCanvasPointerUp', pointer({ x: -50, y: -50 }));
    env.run('onCanvasClick', pointer({ x: -50, y: -50 }));
    // A click on empty canvas would have cleared the selection.
    expect(env.studio().selection.selectedIds).toEqual(['line-a']);
  });

  it('ends a left-button pan and swallows the click its release makes', () => {
    const env = mountStudio();
    selectLine(env);
    env.run('setActiveTool', 'pan');
    env.run('onCanvasPointerDown', pointer({ x: 300, y: 300 }));
    env.run('onCanvasPointerMove', pointer({ x: 320, y: 330 }));
    expect(env.studio().interaction.mode).toBe('panning');

    press('Escape');

    expect(env.studio().interaction.mode).toBe('idle');
    expect(env.studio().interaction.suppressNextClick).toBe(true);
  });

  it('ends a middle-button pan without arming a click that will never come', () => {
    const env = mountStudio();
    env.run('onCanvasPointerDown', pointer({ x: 300, y: 300, button: 1 }));
    env.run('onCanvasPointerMove', pointer({ x: 320, y: 330, button: 1 }));
    expect(env.studio().interaction.mode).toBe('panning');

    press('Escape');

    expect(env.studio().interaction.mode).toBe('idle');
    expect(env.studio().interaction.suppressNextClick).toBe(false);
  });
});

describe('the other ways a drag ends are unchanged', () => {
  it('releasing the button commits a move as one undo step', () => {
    const env = mountStudio();
    selectLine(env);
    startMove(env);
    env.run('onCanvasPointerUp', pointer({ x: 50, y: 40 }));

    expect(env.studio().interaction.mode).toBe('idle');
    expect(env.entity('line-a').y1).toBe(40);
    expect(env.studio().selection.selectedIds).toEqual(['line-a']);
    env.run('undo');
    expect(env.entity('line-a').y1).toBe(0);
  });

  it('a pointer-cancel commits a move', () => {
    const env = mountStudio();
    selectLine(env);
    startMove(env);
    env.run('onCanvasPointerCancel', pointer({ x: 50, y: 40 }));

    expect(env.studio().interaction.mode).toBe('idle');
    expect(env.entity('line-a').y1).toBe(40);
    expect(env.studio().canUndo).toBe(true);
  });

  it('undo mid-drag puts the move back and clears the selection, as before', () => {
    const env = mountStudio();
    selectLine(env);
    startMove(env);
    env.run('undo');

    expect(env.studio().interaction.mode).toBe('idle');
    expect(env.entity('line-a').y1).toBe(0);
    expect(env.studio().selection.selectedIds).toEqual([]);
    expect(env.studio().interaction.suppressNextClick).toBe(false);
  });
});

/** A pointer hook over a hand-built state, dispatch recorded. */
function pointerHookIn(interaction, selection = {}) {
  const state = {
    document: { entities: [], layers: [], groupIndex: new Map() },
    draft: { type: null, precisionInput: {}, points: [], sourceRefs: [] },
    selection: { selectedIds: [], selectionBox: { isActive: false, hasMoved: false }, ...selection },
    interaction: { suppressNextClick: false, ...interaction },
    hover: { hoveredId: null },
    viewport: { zoom: 1, panX: 0, panY: 0 },
    ui: { activeTool: 'select', orthoEnabled: false, viewMode: 'plan' },
    history: { past: [], future: [] },
  };
  const dispatch = vi.fn();
  const viewportHook = {
    readCanvasPoint: () => ({ x: 0, y: 0 }),
    readWorldPoint: (point) => point,
    getOrthoReferencePoint: () => null,
    resolveSnap: () => ({ point: null }),
    resolvePointerState: () => ({ worldPoint: { x: 0, y: 0 }, snap: { point: null }, hoveredEntity: null }),
  };
  const { result } = renderHook(() =>
    useSketchPointer(state, dispatch, viewportHook, {
      activeTool: 'select',
      editableEntities: [],
      isSpacePanActiveRef: { current: false },
      selectionBounds: null,
      getConstrainedDraftPoint: (_tool, _draft, point) => point,
    }),
  );
  const history = renderHook(() => useSketchHistory(state, dispatch)).result;
  const types = () => dispatch.mock.calls.map(([action]) => action.type);
  return { pointerHook: result.current, history: history.current, dispatch, types };
}

const MODE_STATE = {
  panning: { mode: 'panning', panButton: 0 },
  'selection-box': { mode: 'selection-box' },
  'handle-drag': { mode: 'handle-drag', handleDrag: { entityId: 'x', handleId: 'end' } },
  'anchor-drag': { mode: 'anchor-drag', anchorDrag: {} },
  transform: { mode: 'transform', transform: { startWorld: { x: 0, y: 0 } } },
};

const END_TYPES = new Set([
  SKETCH_STUDIO_ACTIONS.END_PAN,
  SKETCH_STUDIO_ACTIONS.END_SELECTION_BOX,
  SKETCH_STUDIO_ACTIONS.END_HANDLE_DRAG,
  SKETCH_STUDIO_ACTIONS.END_ANCHOR_DRAG,
  SKETCH_STUDIO_ACTIONS.END_TRANSFORM,
  SKETCH_STUDIO_ACTIONS.CANCEL_HANDLE_DRAG,
  SKETCH_STUDIO_ACTIONS.CANCEL_ANCHOR_DRAG,
  SKETCH_STUDIO_ACTIONS.CANCEL_TRANSFORM,
]);

describe('every way out agrees with the table', () => {
  it('has a state for every mode the table lists', () => {
    expect(Object.keys(MODE_STATE).sort()).toEqual(Object.keys(INTERACTION_END).sort());
  });

  it.each(Object.keys(MODE_STATE))('pointer-up ends %s as the release column says', (mode) => {
    const { pointerHook, types } = pointerHookIn(MODE_STATE[mode]);
    pointerHook.handlePointerUp(pointer());
    expect(types().filter((type) => END_TYPES.has(type))).toEqual([interactionEndAction(mode, 'release').type]);
  });

  it.each([
    ['panning', [SKETCH_STUDIO_ACTIONS.END_PAN]],
    ['selection-box', [SKETCH_STUDIO_ACTIONS.END_SELECTION_BOX]],
    ['handle-drag', [SKETCH_STUDIO_ACTIONS.END_HANDLE_DRAG]],
    ['anchor-drag', [SKETCH_STUDIO_ACTIONS.END_ANCHOR_DRAG]],
    ['transform', [SKETCH_STUDIO_ACTIONS.END_TRANSFORM]],
    ['idle', [SKETCH_STUDIO_ACTIONS.SET_POINTER_DOWN]],
  ])('pointer-cancel ends %s exactly as before', (mode, expected) => {
    const { pointerHook, types } = pointerHookIn(MODE_STATE[mode] ?? { mode });
    pointerHook.handlePointerCancel();
    expect(types()).toEqual(expected);
    if (MODE_STATE[mode]) expect(expected).toEqual([interactionEndAction(mode, 'abort').type]);
  });

  it.each([
    ['panning', [SKETCH_STUDIO_ACTIONS.END_PAN]],
    ['selection-box', [SKETCH_STUDIO_ACTIONS.END_SELECTION_BOX]],
    ['handle-drag', [SKETCH_STUDIO_ACTIONS.CANCEL_HANDLE_DRAG]],
    ['anchor-drag', [SKETCH_STUDIO_ACTIONS.CANCEL_ANCHOR_DRAG]],
    ['transform', [SKETCH_STUDIO_ACTIONS.CANCEL_TRANSFORM]],
  ])('undo ends %s exactly as before', (mode, expected) => {
    const { history, types } = pointerHookIn(MODE_STATE[mode]);
    history.handleUndo();
    expect(types()).toEqual(expected);
    expect(expected).toEqual([interactionEndAction(mode, 'undo').type]);
  });
});

describe('releasing a pan', () => {
  it('does not arm click suppression for a middle-button release, which makes no click', () => {
    const { pointerHook, types } = pointerHookIn({ mode: 'panning', panButton: 1 });
    pointerHook.handlePointerUp(pointer({ button: 1 }));
    expect(types()).toEqual([SKETCH_STUDIO_ACTIONS.END_PAN]);
  });

  it('still swallows the click a left-button release makes', () => {
    const { pointerHook, types, dispatch } = pointerHookIn({ mode: 'panning', panButton: 0 });
    pointerHook.handlePointerUp(pointer({ button: 0 }));
    expect(types()).toEqual([SKETCH_STUDIO_ACTIONS.END_PAN, SKETCH_STUDIO_ACTIONS.SET_SUPPRESS_NEXT_CLICK]);
    expect(dispatch.mock.calls[1][0].payload).toBe(true);
  });

  it('lets the next left click through after a middle-button pan', () => {
    const env = mountStudio();
    env.run('setActiveTool', 'line');
    env.run('onCanvasPointerDown', pointer({ x: 300, y: 300, button: 1 }));
    env.run('onCanvasPointerMove', pointer({ x: 320, y: 330, button: 1 }));
    env.run('onCanvasPointerUp', pointer({ x: 320, y: 330, button: 1 }));
    expect(env.studio().interaction.mode).toBe('idle');

    // The first left click of the line tool starts a line.
    env.run('onCanvasPointerDown', pointer({ x: 500, y: 500 }));
    env.run('onCanvasPointerUp', pointer({ x: 500, y: 500 }));
    env.run('onCanvasClick', pointer({ x: 500, y: 500 }));
    expect(env.studio().draft.type).toBe('line');
  });
});

describe('tool shortcuts during a drag', () => {
  it('are ignored until the drag is released, so the drag stays one undo step', () => {
    const env = mountStudio();
    selectLine(env);
    startMove(env);

    press('l');

    expect(env.studio().activeTool).toBe('select');
    expect(env.studio().interaction.mode).toBe('transform');
    env.run('onCanvasPointerUp', pointer({ x: 50, y: 40 }));
    expect(env.entity('line-a').y1).toBe(40);
    env.run('undo');
    expect(env.entity('line-a').y1).toBe(0);
  });

  it('still switch tools while idle and while drawing', () => {
    const env = mountStudio();
    press('l');
    expect(env.studio().activeTool).toBe('line');
    env.run('onCanvasClick', pointer({ x: 500, y: 500 }));
    expect(env.studio().interaction.mode).toBe('drawing');
    press('r');
    expect(env.studio().activeTool).toBe('rect');
  });
});

describe('hover tools', () => {
  const HOVER_TOOLS = ['fillet', 'chamfer', 'trim', 'extend', 'fastener'];

  function armTool(tool) {
    const env = mountStudio();
    // One undoable edit to step back over.
    act(() => {
      env.studio().duplicateEntities(['line-b']);
    });
    expect(env.studio().document.entities).toHaveLength(3);
    env.run('setActiveTool', tool);
    env.run('onCanvasPointerMove', pointer({ x: 700, y: 700 }));
    expect(env.studio().draft.type).toBe(tool);
    return env;
  }

  it('are exactly the tools whose draft a bare pointer move starts', () => {
    expect([...HOVER_DRAFT_TOOLS].sort()).toEqual([...HOVER_TOOLS].sort());
    const env = mountStudio();
    const startedByMove = TOOL_DEFINITIONS.map((tool) => tool.id).filter((toolId) => {
      env.run('setActiveTool', toolId);
      env.run('onCanvasPointerMove', pointer({ x: 700, y: 700 }));
      return env.studio().draft.type === toolId;
    });
    expect(startedByMove.sort()).toEqual([...HOVER_TOOLS].sort());
  });

  it.each(HOVER_TOOLS)('let undo through while %s is active', (tool) => {
    const env = armTool(tool);
    env.run('undo');
    expect(env.studio().document.entities).toHaveLength(2);
  });

  it.each(HOVER_TOOLS)('leave %s for the select tool on Escape', (tool) => {
    const env = armTool(tool);
    press('Escape');
    expect(env.studio().activeTool).toBe('select');
    expect(env.studio().draft.type).toBeNull();
  });
});
