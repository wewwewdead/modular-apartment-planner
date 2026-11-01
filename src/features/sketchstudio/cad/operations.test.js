import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { emptyModel, createPart } from './model.js';
import { createKernelSession } from './kernel.js';
import { createOperationDraft, operationModel, operationProblem } from './operations.js';
import sketchStudioReducer from '../store/sketchStudioReducer.js';
import initialState from '../store/sketchStudioInitialState.js';
import { buildCutList, planLinearStock } from './fabrication.js';
const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);
const board = () => {
  const created = createPart('board');
  created.part.features[0] = { ...created.part.features[0], width: 100, depth: 80, height: 50 };
  return { ...emptyModel(), parts: [created.part], instances: [created.instance] };
};
describe('guided solid operations', () => {
  it('does not export or allocate the original tube length after an extrusion changes the geometry', () => {
    const created = createPart('member'),
      model = { ...emptyModel(), parts: [created.part], instances: [created.instance] };
    const next = operationModel(createOperationDraft({ type: 'extrude', model, partId: created.part.id }));
    const session = createKernelSession(next);
    try {
      const rows = buildCutList(next, session.snapshot());
      expect(rows[0].member).toBeNull();
      expect(rows[0].blankLength).toBeNull();
      expect(rows[0].sourceMember.centerline).toBe(700);
      expect(rows[0].note).toContain('Excluded from automatic');
      expect(rows[0].dimensions[2]).toBeCloseTo(718, 4);
      expect(planLinearStock(rows, next.fabrication)).toEqual([]);
    } finally {
      session.dispose();
    }
  });
  for (const kind of ['tube', 'pipe'])
    it(`extrudes a copied hollow ${kind} section along an inclined member`, () => {
      const created = createPart('member');
      created.part.features[0].end = [300, 400, 0];
      created.part.features[0].gapEnd = 2;
      if (kind === 'pipe') created.part.features[0].section = { type: 'pipe', diameter: 40, wall: 2 };
      const model = { ...emptyModel(), parts: [created.part], instances: [created.instance] };
      const draft = createOperationDraft({ type: 'extrude', model, partId: created.part.id });
      expect(draft.sketches[0].profile.holes).toHaveLength(1);
      expect(draft.sketches[0].normal).toEqual([0.6, 0.8, 0]);
      const session = createKernelSession(operationModel(draft));
      try {
        const area = kind === 'tube' ? 304 : Math.PI * (400 - 324);
        expect(session.snapshot().parts[0].volume).toBeCloseTo(area * (500 - 2 + 18), 3);
      } finally {
        session.dispose();
      }
    });
  for (const [type, expectedVolume] of [
    ['extrude', 28800],
    ['revolve', 12000 * Math.PI],
    ['sweep', 2500 * Math.PI],
    ['loft', (190000 * Math.PI) / 3],
  ])
    it(`builds the ${type} starter as an independent preview and applies in one history step`, () => {
      const model = emptyModel(),
        original = JSON.stringify(model);
      const draft = createOperationDraft({ type, model });
      const next = operationModel(draft);
      expect(operationProblem(draft.feature, next, draft.partId)).toBe('');
      const session = createKernelSession(next);
      try {
        expect(session.snapshot().parts[0].volume).toBeCloseTo(expectedVolume, 3);
      } finally {
        session.dispose();
      }
      expect(JSON.stringify(model)).toBe(original);
      const before = { ...initialState, document: { ...initialState.document, model } };
      const applied = sketchStudioReducer(before, { type: 'SET_CAD_MODEL', payload: next });
      const undone = sketchStudioReducer(applied, { type: 'UNDO' });
      expect(undone.document.model).toEqual(model);
      expect(sketchStudioReducer(undone, { type: 'REDO' }).document.model).toEqual(next);
    });
  for (const type of ['fillet', 'chamfer', 'shell', 'mirror', 'pattern', 'trim', 'transform'])
    it(`previews ${type} with geometry-derived defaults`, () => {
      const model = board(),
        source = createKernelSession(model);
      let draft;
      try {
        draft = createOperationDraft({
          type,
          model,
          partId: model.parts[0].id,
          bounds: source.snapshot().parts[0].bounds,
          references: source.referenceOptions(model.parts[0].id),
        });
      } finally {
        source.dispose();
      }
      const session = createKernelSession(operationModel(draft));
      try {
        expect(session.snapshot().parts[0].volume).toBeGreaterThan(0);
        if (type === 'trim') expect(session.snapshot().parts[0].volume).toBeCloseTo(200000, 2);
        if (type === 'pattern') expect(session.snapshot().parts[0].volume).toBeCloseTo(1200000, 2);
      } finally {
        session.dispose();
      }
    });
  for (const type of ['union', 'subtract', 'intersect'])
    it(`validates the ${type} tool and uses exact overlapping volumes`, () => {
      const model = board(),
        draft = createOperationDraft({ type, model, partId: model.parts[0].id });
      expect(operationProblem(draft.feature, operationModel(draft), draft.partId)).toMatch(/another part/);
      const tool = createPart('board');
      tool.part.features[0] = { ...tool.part.features[0], width: 100, depth: 80, height: 50 };
      model.parts.push(tool.part);
      draft.feature.toolPartId = tool.part.id;
      draft.feature.position = [50, 0, 0];
      const session = createKernelSession(operationModel(draft));
      try {
        expect(session.snapshot().parts[0].volume).toBeCloseTo(type === 'union' ? 600000 : 200000, 3);
      } finally {
        session.dispose();
      }
      if (type === 'subtract') {
        draft.feature.position = [1000, 0, 0];
        expect(() => createKernelSession(operationModel(draft))).toThrow(/removes no material/);
      }
    });
  it('counts actual tube boundary edges rather than assuming four, and retains references when editing', () => {
    const created = createPart('member'),
      model = { ...emptyModel(), parts: [created.part], instances: [created.instance] };
    const source = createKernelSession(model);
    let references;
    try {
      references = source.referenceOptions(created.part.id);
    } finally {
      source.dispose();
    }
    expect(references.find((r) => r.label.startsWith('Top')).edges).toBe(8);
    const draft = createOperationDraft({ type: 'chamfer', model, partId: created.part.id, references });
    const next = operationModel(draft),
      session = createKernelSession(next);
    try {
      const before = session.referenceOptions(created.part.id, draft.feature.id);
      expect(before.find((r) => r.label.startsWith('Top')).edges).toBe(8);
    } finally {
      session.dispose();
    }
    const edit = createOperationDraft({
      type: 'chamfer',
      model: next,
      partId: created.part.id,
      existingFeature: draft.feature,
      references,
    });
    edit.feature.radius = 100;
    expect(() => createKernelSession(operationModel(edit))).toThrow();
    expect(next.parts[0].features.at(-1).radius).toBe(0.5);
  });
  it('rejects incomplete or coincident sweep, loft, pattern and open-profile extrusion', () => {
    const model = emptyModel();
    const sweep = createOperationDraft({ type: 'sweep', model });
    sweep.feature.profileId = sweep.feature.sketchId;
    expect(operationProblem(sweep.feature, operationModel(sweep), sweep.partId)).toMatch(/two different/);
    const loft = createOperationDraft({ type: 'loft', model });
    loft.feature.sections = [loft.feature.sketchId];
    expect(() => createKernelSession(operationModel(loft))).toThrow(/different closed section/);
    const extrude = createOperationDraft({ type: 'extrude', model });
    extrude.sketches[0].profile = {
      type: 'path',
      start: [0, 0],
      segments: [{ type: 'line', end: [50, 0] }],
      closed: false,
    };
    expect(() => createKernelSession(operationModel(extrude))).toThrow(/closed profile/);
    const base = board(),
      pattern = createOperationDraft({ type: 'pattern', model: base, partId: base.parts[0].id });
    pattern.feature.step = [0, 0, 0];
    expect(() => createKernelSession(operationModel(pattern))).toThrow(/nonzero spacing/);
  });
  // Phase M: hardware seated in several holes brings one instance per hole.
  it('appends a hardware draft’s extra instances after its new instance, with every connection', () => {
    const model = board();
    const part = { id: 'bolt', name: 'Hex bolt M6', features: [] };
    const feature = { id: 'hw', type: 'hardware', kind: 'bolt', size: 'M6' };
    const at = (id, x) => ({ id, partId: 'bolt', position: [x, 0, 50], rotation: [0, 0, 0], visible: true });
    const connection = (from, extra = {}) => ({
      id: `c-${from}`,
      type: 'concentric',
      from,
      to: model.instances[0].id,
      fromFeatureId: 'hw',
      toFeatureId: 'r',
      offset: 0,
      ...extra,
    });
    const draft = {
      baseModel: model,
      partId: 'bolt',
      newPart: part,
      newInstance: at('i1', 10),
      extraInstances: [at('i2', 40), at('i3', 70)],
      sketches: [],
      editing: false,
      feature,
      connections: [connection('i1'), connection('i2', { holeIndex: 1 }), connection('i3', { holeIndex: 2 })],
    };
    const next = operationModel(draft);
    expect(next.parts.at(-1)).toEqual({ ...part, features: [feature] });
    expect(next.instances.map((i) => i.id)).toEqual([model.instances[0].id, 'i1', 'i2', 'i3']);
    expect(next.connections).toEqual(draft.connections);
    // No extras (every older draft): one instance, as before.
    expect(operationModel({ ...draft, extraInstances: undefined }).instances).toHaveLength(2);
  });
});
