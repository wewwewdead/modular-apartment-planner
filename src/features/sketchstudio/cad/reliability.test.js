import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { init_planegcs_module } from '@salusoft89/planegcs';
import { solveSketches } from './solver.js';
import { emptyModel, normalizeModel, validateReferences } from './model.js';
import { enableConstraints, addConstraint } from './constraints.js';
import { RevisionWorker } from './workerClient.js';
import { serializeSketchWorkspace, deserializeSketchWorkspace } from '../utils/workspaceSerializationUtils.js';
import { createBlankSketchDocument } from '../utils/sketchDocumentUtils.js';
import sketchStudioReducer from '../store/sketchStudioReducer.js';
import initialState from '../store/sketchStudioInitialState.js';
import { furnitureExample } from './examples.js';
import { buildCutList, planLinearStock, planSheets, cutListCsv } from './fabrication.js';
import { annotationText, sheetSvg } from './drawings.js';
const require = createRequire(import.meta.url);
let module;
beforeAll(async () => {
  module = await init_planegcs_module({
    wasmBinary: readFileSync(require.resolve('@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm')),
  });
});

describe('optional constraints', () => {
  it('solves a radius constraint and binds it to the solid profile', () => {
    const s = enableConstraints({ id: 's', name: 'Circle', profile: { type: 'circle', radius: 12 } }, []);
    const circle = s.primitives.find((p) => p.type === 'circle');
    const model = { ...emptyModel(), sketches: [addConstraint(s, 'radius', { c_id: circle.id }, 20)] };
    const solved = solveSketches(model, module);
    expect(solved.model.sketches[0].profile.radius).toBeCloseTo(20, 6);
    expect(model.sketches[0].profile.radius).toBe(12);
  });
  it('reports conflicting constraint IDs without changing the input', () => {
    const model = emptyModel();
    model.sketches = [
      {
        id: 's',
        name: 'Conflict',
        constrained: true,
        profile: { type: 'circle', radius: 12, circleId: 'c' },
        primitives: [
          { id: 'p', type: 'point', x: 0, y: 0, fixed: true },
          { id: 'c', type: 'circle', c_id: 'p', radius: 12 },
          { id: 'r1', type: 'circle_radius', c_id: 'c', radius: 10 },
          { id: 'r2', type: 'circle_radius', c_id: 'c', radius: 20 },
        ],
      },
    ];
    const original = JSON.stringify(model);
    expect(() => solveSketches(model, module)).toThrow(/conflict/i);
    expect(JSON.stringify(model)).toBe(original);
  });
  it('leaves freehand sketches untouched', () => {
    const model = {
      ...emptyModel(),
      sketches: [{ id: 's', profile: { type: 'circle', radius: 10 }, constrained: false }],
    };
    expect(solveSketches(model, module).model).toEqual(model);
  });
});

describe('persistence and history', () => {
  it('migrates legacy files without inventing parts and round trips v4/v2', () => {
    const doc = createBlankSketchDocument({
      version: 3,
      entities: [{ id: 'e', type: 'circle', cx: 10, cy: 10, r: 20, layerId: 'default' }],
    });
    expect(doc.model.parts).toEqual([]);
    const model = furnitureExample();
    const saved = serializeSketchWorkspace({ document: { ...doc, model }, ui: { workspaceMode: 'model' } });
    const reopened = deserializeSketchWorkspace(saved);
    expect(reopened.version).toBe(2);
    expect(reopened.document.version).toBe(4);
    expect(reopened.document.model).toEqual(model);
    expect(reopened.document.entities).toEqual(doc.entities);
    expect(reopened.ui.workspaceMode).toBe('model');
    expect(() => deserializeSketchWorkspace(JSON.stringify({ ...reopened, version: 100 }))).toThrow(/newer/);
  });
  it('restores model data with undo and redo and opens model mode', () => {
    const model = furnitureExample();
    const state = sketchStudioReducer(initialState, { type: 'SET_CAD_MODEL', payload: model });
    const undone = sketchStudioReducer(state, { type: 'UNDO' });
    expect(undone.document.model).toEqual(initialState.document.model);
    const redone = sketchStudioReducer(undone, { type: 'REDO' });
    expect(redone.document.model).toEqual(model);
    const opened = sketchStudioReducer(initialState, {
      type: 'LOAD_WORKSPACE_SNAPSHOT',
      payload: { document: redone.document, ui: { workspaceMode: 'model' } },
    });
    expect(opened.ui.workspaceMode).toBe('model');
  });
  it('flags lost feature references without reattaching them', () => {
    const model = furnitureExample();
    model.sheets[0].annotations.push({ id: 'dim', type: 'hole', partId: 'top', featureId: 'deleted-hole' });
    expect(validateReferences(model)[0].annotationId).toBe('dim');
    expect(() => normalizeModel({ ...model, parts: [{ id: 'p', features: null }] })).toThrow(/Invalid part/);
  });
});

describe('worker isolation', () => {
  const factory = () => ({ postMessage: vi.fn(), terminate: vi.fn() });
  it('rejects superseded results and recovers after cancellation or failure', async () => {
    const client = new RevisionWorker(factory);
    const old = client.request('build', {}, 1);
    const oldWorker = client.worker;
    const rejected = expect(old).rejects.toThrow(/cancelled/);
    client.cancel();
    await rejected;
    const current = client.request('build', {}, 2);
    oldWorker.onmessage({ data: { requestId: 1, revision: 1, result: 'outdated' } });
    client.worker.onmessage({ data: { requestId: 2, revision: 2, result: 'current' } });
    await expect(current).resolves.toBe('current');
    const failed = client.request('build', {}, 3),
      expectation = expect(failed).rejects.toThrow('crashed');
    client.worker.onerror({ message: 'crashed' });
    await expectation;
    expect(client.worker).toBeNull();
    client.cancel();
  });
  it('times out a blocked worker and frees pending requests', async () => {
    vi.useFakeTimers();
    const client = new RevisionWorker(factory, 100);
    const promise = client.request('build', {}, 1),
      expectation = expect(promise).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(101);
    await expectation;
    expect(client.pending.size).toBe(0);
    client.cancel();
    vi.useRealTimers();
  });
});

describe('workshop accuracy', () => {
  it('counts hidden instances, separates nominal cuts from allowances and reserves kerf', () => {
    const model = furnitureExample();
    model.instances[1].visible = false;
    model.fabrication.allowance = 4;
    const snapshot = {
      parts: model.parts.map((p) => ({
        id: p.id,
        bounds: [
          [0, 0, 0],
          [100, 50, 20],
        ],
        volume: 1000,
      })),
    };
    const rows = buildCutList(model, snapshot),
      leg = rows.find((r) => r.partId === 'leg');
    expect(leg.quantity).toBe(4);
    expect(leg.blankLength - leg.member.longPoint).toBe(4);
    expect(planLinearStock(rows, model.fabrication).every((s) => s.remaining >= 0)).toBe(true);
    expect(cutListCsv(rows)).toContain('Long point mm');
    const layouts = planSheets(rows, [{ partId: 'top', thickness: 24, viewBox: [0, 0, 1200, 650] }], model.fabrication);
    expect(layouts[0].parts[0].width).toBe(1200);
  });
  it('links hole callouts to feature dimensions and rejects overflow instead of changing scale', () => {
    const model = furnitureExample();
    expect(annotationText({ type: 'hole', partId: 'top', featureId: 'top-hole-0-0' }, model, {})).toContain('Ø6.00');
    const sheet = {
      ...model.sheets[0],
      scale: 1,
      views: [{ name: 'front', viewBox: [0, 0, 1200, 750], visible: [], hidden: [] }],
    };
    expect(() => sheetSvg(sheet, model, {})).toThrow(/does not fit/);
  });
});
