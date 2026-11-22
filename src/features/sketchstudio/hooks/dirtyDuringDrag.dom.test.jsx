/* @vitest-environment jsdom */
/**
 * Perf pass 3, C3: the dirty check no longer stringifies the whole document on
 * every drag frame. The oracle is the check as it stood: the comparison string
 * built by `serializeComparableSketchWorkspace(buildSketchWorkspaceSnapshot(…))`
 * from the live document, against the string taken at load or save, with the
 * persistence machine's EDIT / CLEAN fed from its changes. Every step below is
 * driven through the real studio and checked against that oracle:
 *   - at rest, `isDirty` and the status are always the oracle's;
 *   - during a drag that started clean they are the oracle's at every frame
 *     (a drag back to the start reads clean again, a zero-length drag never
 *     reads dirty, a press that never moves changes nothing);
 *   - during a drag that started dirty the sketch reads dirty until the drag
 *     ends (the one shortcut the spec allows), then the oracle's again;
 *   - undo back to the saved state reads clean;
 *   - the 3D workshop's model commits are not drags and follow the oracle.
 * And a drag frame builds no comparison string at all.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import useSketchStudio from './useSketchStudio';
import useSketchPersistence from './useSketchPersistence';
import sampleDocument from '../data/sampleDocument';
import { ConfirmDialogProvider } from '../../../ui/ConfirmDialog';
import { advancePersistenceMeta } from './sketchPersistenceMachine';
import {
  SKETCH_WORKSPACE_KIND,
  buildSketchWorkspaceSnapshot,
  serializeComparableSketchWorkspace,
} from '../utils/workspaceSerializationUtils';
import { saveSketchWorkspaceFile } from '../utils/sketchWorkspaceFileUtils';
import { furnitureExample } from '../cad/examples';
import sketchStudioReducer from '../store/sketchStudioReducer';
import sketchStudioInitialState from '../store/sketchStudioInitialState';
import { loadWorkspaceSnapshot } from '../store/sketchStudioActions';

vi.mock('../utils/sketchWorkspaceFileUtils', async (importOriginal) => ({
  ...(await importOriginal()),
  openSketchWorkspaceFile: vi.fn(),
  saveSketchWorkspaceFile: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(saveSketchWorkspaceFile).mockReset();
});
afterEach(cleanup);

const line = (id, x1, y1, x2, y2) => ({
  id,
  type: 'line',
  x1,
  y1,
  x2,
  y2,
  layerId: 'default',
  visible: true,
  meta: {},
});
const rect = (id, x, y, width, height) => ({
  id,
  type: 'rect',
  x,
  y,
  width,
  height,
  rotation: 0,
  thickness: 18,
  layerId: 'default',
  visible: true,
  meta: {},
});

// Lines to drag, two rects joined by a joint, a variable, and a 3D model: the
// comparison string covers all of it.
function buildWorkspace() {
  return {
    document: {
      ...sampleDocument,
      name: 'Dirty drag',
      variables: [{ id: 'v-w', name: 'w', value: 120, unit: 'mm' }],
      joints: [{ id: 'j1', type: 'butt', sourcePartId: 'r1', targetPartId: 'r2' }],
      entities: [
        line('a', 0, 0, 100, 0),
        line('b', 0, 300, 100, 300),
        rect('r1', 500, 0, 100, 50),
        rect('r2', 600, 0, 100, 50),
      ],
      model: furnitureExample('desk'),
    },
    viewport: { zoom: 1, panX: 0, panY: 0 },
    ui: { activeLayerId: 'default' },
  };
}

function pointer({ x, y, buttons = 0 }) {
  return {
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    pointerId: 1,
    preventDefault() {},
    stopPropagation() {},
    currentTarget: { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} },
  };
}

// The comparison as it stood before perf pass 3, verbatim in substance.
function oracleComparable(studio) {
  return serializeComparableSketchWorkspace(
    buildSketchWorkspaceSnapshot({
      document: studio.document,
      ui: {
        activeLayerId: studio.ui.activeLayerId,
        snapEnabled: studio.ui.snapEnabled,
        orthoEnabled: studio.ui.orthoEnabled,
        viewMode: studio.ui.viewMode,
        isometricPlane: studio.ui.isometricPlane,
        craftsmanMode: studio.ui.craftsmanMode,
        workspaceMode: studio.ui.workspaceMode,
      },
    }),
  );
}

function mountStudio() {
  const view = renderHook(() => useSketchStudio(), { wrapper: ConfirmDialogProvider });
  const studio = () => view.result.current;
  const workspace = buildWorkspace();
  act(() => studio().loadTemplate(workspace));
  const canvas = document.createElement('div');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 2000, height: 2000, right: 2000, bottom: 2000 });
  studio().canvasRef.current = canvas;

  // The oracle's own state: the persisted string, the dirty flag and the
  // machine status it would have produced.
  const oracle = {
    persisted: serializeComparableSketchWorkspace({ document: workspace.document, ui: workspace.ui }),
    dirty: false,
    meta: advancePersistenceMeta({ status: 'idle', error: null }, 'LOAD'),
  };
  const step = (fn) => {
    act(fn);
    const dirty = oracleComparable(studio()) !== oracle.persisted;
    if (dirty !== oracle.dirty) {
      oracle.dirty = dirty;
      oracle.meta = advancePersistenceMeta(oracle.meta, dirty ? 'EDIT' : 'CLEAN');
    }
    return { isDirty: studio().documentPersistence.isDirty, status: studio().documentPersistence.status };
  };
  const expectOracle = (label) => {
    expect(studio().documentPersistence.isDirty, label).toBe(oracle.dirty);
    expect(studio().documentPersistence.status, label).toBe(oracle.meta.status);
  };
  const save = async () => {
    vi.mocked(saveSketchWorkspaceFile).mockResolvedValueOnce({
      savedAt: '2026-11-22T10:00:00.000Z',
      fileHandle: { name: 'drag.sketch.json' },
      fileName: 'drag.sketch.json',
    });
    await act(() => studio().saveSketch());
    oracle.persisted = oracleComparable(studio());
    oracle.dirty = false;
    oracle.meta = advancePersistenceMeta(advancePersistenceMeta(oracle.meta, 'SAVE'), 'SAVED');
    expectOracle('after save');
    expect(studio().documentPersistence.status).toBe('saved');
  };
  const select = (at) => {
    step(() => studio().onCanvasPointerMove(pointer(at)));
    step(() => studio().onCanvasPointerDown(pointer({ ...at, buttons: 1 })));
    step(() => studio().onCanvasPointerUp(pointer(at)));
    step(() => studio().onCanvasClick(pointer(at)));
  };
  return { studio, oracle, step, expectOracle, save, select };
}

describe('C3: dirty during a move, against the pre-change comparison', () => {
  it('a drag away and back, from saved: dirty while away, clean again, then idle as before', async () => {
    const env = await (async () => {
      const mounted = mountStudio();
      await mounted.save();
      return mounted;
    })();
    env.select({ x: 50, y: 0 });
    expect(env.studio().selection.selectedIds).toEqual(['a']);

    env.step(() => env.studio().onCanvasPointerDown(pointer({ x: 50, y: 0, buttons: 1 })));
    expect(env.studio().interaction.mode).toBe('transform');
    const seen = [];
    for (const x of [60, 90, 50, 55, 50]) {
      seen.push(env.step(() => env.studio().onCanvasPointerMove(pointer({ x, y: 0, buttons: 1 }))));
      env.expectOracle(`frame x=${x}`);
    }
    expect(seen.map((state) => state.isDirty)).toEqual([true, true, false, true, false]);
    env.step(() => env.studio().onCanvasPointerUp(pointer({ x: 50, y: 0 })));
    env.expectOracle('at rest');
    expect(env.studio().documentPersistence).toMatchObject({ isDirty: false, status: 'idle' });
  });

  it('a drag of zero length never reads dirty: the status stays saved', async () => {
    const env = mountStudio();
    await env.save();
    env.select({ x: 50, y: 0 });
    env.step(() => env.studio().onCanvasPointerDown(pointer({ x: 50, y: 0, buttons: 1 })));
    const startDocument = env.studio().document;
    for (let index = 0; index < 3; index += 1) {
      env.step(() => env.studio().onCanvasPointerMove(pointer({ x: 50, y: 0, buttons: 1 })));
      env.expectOracle(`zero frame ${index}`);
      // A frame was written (a new document, the same values): the drag
      // shortcut is the path being checked.
      expect(env.studio().interaction.mode).toBe('transform');
      expect(env.studio().document).not.toBe(startDocument);
    }
    env.step(() => env.studio().onCanvasPointerUp(pointer({ x: 50, y: 0 })));
    env.expectOracle('at rest');
    expect(env.studio().documentPersistence).toMatchObject({ isDirty: false, status: 'saved' });
  });

  it('a press that never moves changes nothing', async () => {
    const env = mountStudio();
    await env.save();
    env.select({ x: 50, y: 0 });
    const before = env.studio().document;
    env.step(() => env.studio().onCanvasPointerDown(pointer({ x: 50, y: 0, buttons: 1 })));
    env.expectOracle('pressed');
    env.step(() => env.studio().onCanvasPointerUp(pointer({ x: 50, y: 0 })));
    env.expectOracle('released');
    expect(env.studio().documentPersistence.status).toBe('saved');
    expect(env.studio().document.entities).toEqual(before.entities);
  });

  it('a drag that starts dirty reads dirty until it ends, then the comparison decides', async () => {
    const env = mountStudio();
    await env.save();
    env.select({ x: 50, y: 300 });
    // An unsaved edit: line b moved by 10.
    env.step(() => env.studio().onCanvasPointerDown(pointer({ x: 50, y: 300, buttons: 1 })));
    env.step(() => env.studio().onCanvasPointerMove(pointer({ x: 60, y: 300, buttons: 1 })));
    env.step(() => env.studio().onCanvasPointerUp(pointer({ x: 60, y: 300 })));
    env.expectOracle('edited');
    expect(env.studio().documentPersistence.isDirty).toBe(true);

    // Drag it back through the saved position and release there.
    env.step(() => env.studio().onCanvasPointerDown(pointer({ x: 60, y: 300, buttons: 1 })));
    for (const x of [55, 50, 52, 50]) {
      env.step(() => env.studio().onCanvasPointerMove(pointer({ x, y: 300, buttons: 1 })));
      expect(env.studio().documentPersistence.isDirty, `frame x=${x}`).toBe(true);
    }
    env.step(() => env.studio().onCanvasPointerUp(pointer({ x: 50, y: 300 })));
    env.expectOracle('at rest');
    expect(env.studio().documentPersistence).toMatchObject({ isDirty: false, status: 'idle' });
  });

  it('a handle drag away and back, and undo back to the saved state, read clean', async () => {
    const env = mountStudio();
    await env.save();
    env.select({ x: 50, y: 0 });
    env.step(() =>
      env.studio().handleBindings.onHandlePointerDown(
        { id: 'end' },
        {
          button: 0,
          pointerId: 1,
          stopPropagation() {},
          preventDefault() {},
          currentTarget: { setPointerCapture() {} },
        },
      ),
    );
    expect(env.studio().interaction.mode).toBe('handle-drag');
    for (const at of [
      { x: 140, y: 40 },
      { x: 180, y: 0 },
      { x: 100, y: 0 },
    ]) {
      env.step(() => env.studio().onCanvasPointerMove(pointer({ ...at, buttons: 1 })));
      env.expectOracle(`handle at ${at.x},${at.y}`);
    }
    env.step(() => env.studio().onCanvasPointerUp(pointer({ x: 100, y: 0 })));
    env.expectOracle('handle released');

    // An edit, then undo back to the saved document.
    env.step(() => void env.studio().duplicateEntities(['b']));
    env.expectOracle('duplicated');
    expect(env.studio().documentPersistence.isDirty).toBe(true);
    env.step(() => env.studio().undo());
    env.expectOracle('undone');
    expect(env.studio().documentPersistence.isDirty).toBe(false);
  });

  it('the 3D workshop model commits follow the comparison, as before', async () => {
    const env = mountStudio();
    await env.save();
    const original = env.studio().document.model;
    env.step(() => env.studio().setCadModel(furnitureExample('table')));
    env.expectOracle('model replaced');
    expect(env.studio().documentPersistence.isDirty).toBe(true);
    env.step(() => env.studio().setCadModel(original, { skipHistory: true }));
    env.expectOracle('model restored');
    expect(env.studio().documentPersistence.isDirty).toBe(false);
  });

  it('builds no comparison string on a drag frame', async () => {
    const env = mountStudio();
    await env.save();
    env.select({ x: 50, y: 0 });
    env.step(() => env.studio().onCanvasPointerDown(pointer({ x: 50, y: 0, buttons: 1 })));
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      for (const x of [70, 90, 110]) {
        stringify.mockClear();
        act(() => env.studio().onCanvasPointerMove(pointer({ x, y: 0, buttons: 1 })));
        const workspaceStrings = stringify.mock.calls.filter(([value]) => value?.kind === SKETCH_WORKSPACE_KIND);
        expect(workspaceStrings, `frame x=${x}`).toHaveLength(0);
        expect(env.studio().documentPersistence.isDirty).toBe(true);
      }
    } finally {
      stringify.mockRestore();
    }
    act(() => env.studio().onCanvasPointerUp(pointer({ x: 110, y: 0 })));
    expect(env.studio().documentPersistence.isDirty).toBe(true);
  });
});

describe('C3: the comparison string itself', () => {
  it('is the string the pre-change formula builds, for a document with joints, variables and a model', () => {
    const state = sketchStudioReducer(
      { ...sketchStudioInitialState, history: { past: [], future: [] } },
      loadWorkspaceSnapshot(buildWorkspace()),
    );
    const { result } = renderHook(() => useSketchPersistence(state, () => {}), { wrapper: ConfirmDialogProvider });
    expect(result.current.comparableWorkspaceSnapshot).toBe(oracleComparable(state));
  });
});
