// The fabrication shop's model keys (docs/sketch-studio-fab-shop.md §4):
// defaults, validation, the removeInstance cascade and the kernel-inert rule;
// and the load rule for files saved while the shop had its Weld and Assembly
// stations (docs/sketch-studio-shop-trim.md §4.2), against today's kiosk and
// control box saved as they were before (fixtures/*-before-shop-trim.json).
import { describe, expect, it } from 'vitest';
import oldKiosk from './fixtures/kiosk-before-shop-trim.json';
import oldBox from './fixtures/control-box-before-shop-trim.json';
import { normalizeSketchDocument } from '../utils/sketchDocumentUtils.js';
import {
  CAD_VERSION,
  DEFAULT_SHOP,
  KERNEL_INERT_KEYS,
  emptyModel,
  kernelPayload,
  normalizeModel,
  removeInstance,
  removePart,
  sameKernelInput,
} from './model.js';

const base = () => ({
  ...emptyModel(),
  parts: [{ id: 'p', name: 'Plate', features: [{ id: 'f', type: 'box', width: 1, depth: 1, height: 1 }] }],
  instances: [
    { id: 'i1', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'i2', partId: 'p', position: [10, 0, 0], rotation: [0, 0, 0] },
  ],
});
const finish = (id, instanceId) => ({
  id,
  instanceId,
  kind: 'powder',
  name: 'RAL 7035 Light grey',
  colour: '#c5c7c4',
  gloss: 'satin',
  thickness: 70,
});
const print = (id, instanceId, extra = {}) => ({
  id,
  instanceId,
  origin: [0, 0, 1],
  x: [1, 0, 0],
  normal: [0, 0, 1],
  width: 20,
  height: 10,
  rotation: 0,
  method: 'silk',
  kind: 'text',
  text: 'ACME',
  font: 'sans-serif',
  colour: '#000000',
  ...extra,
});

describe('shop model keys', () => {
  it('defaults the lists and the shop settings without bumping the schema', () => {
    const model = emptyModel();
    expect(CAD_VERSION).toBe(1);
    expect(model).not.toHaveProperty('welds');
    expect(model).not.toHaveProperty('assembly');
    expect(model.finishes).toEqual([]);
    expect(model.prints).toEqual([]);
    expect(model.fabrication.shop).toEqual(DEFAULT_SHOP);
    expect(model.fabrication.kerf).toBe(3);
  });
  it('opens an old file without the keys and fills them in', () => {
    const { finishes: _f, prints: _p, ...old } = base();
    const normalized = normalizeModel({ ...old, fabrication: { kerf: 2 } });
    expect(normalized.finishes).toEqual([]);
    expect(normalized.fabrication).toEqual({ ...emptyModel().fabrication, kerf: 2 });
  });
  it('keeps the fabrication object when nothing is missing (the rebuild rule compares it)', () => {
    const model = normalizeModel(base());
    expect(normalizeModel(model).fabrication).toBe(model.fabrication);
  });
  it('validates finish and print rows', () => {
    const ok = normalizeModel({
      ...base(),
      finishes: [finish('f1', 'i1')],
      prints: [print('t', 'i1'), print('img', 'i2', { kind: 'image', image: 'data:image/png;base64,AAAA' })],
    });
    expect(ok.prints).toHaveLength(2);
    expect(() => normalizeModel({ ...base(), finishes: [{ ...finish('f1', 'i1'), colour: 'grey' }] })).toThrow(
      'Invalid finish: f1',
    );
    expect(() => normalizeModel({ ...base(), finishes: [finish('f1', 'i1'), finish('f2', 'i1')] })).toThrow(
      'Instance i1 has more than one finish.',
    );
    expect(() => normalizeModel({ ...base(), prints: [print('t', 'i1', { width: 0 })] })).toThrow('Invalid print: t');
    expect(() =>
      normalizeModel({
        ...base(),
        prints: [print('t', 'i1', { kind: 'image', image: `data:image/png;base64,${'A'.repeat(512 * 1024)}` })],
      }),
    ).toThrow('Invalid print: t');
    expect(() => normalizeModel({ ...base(), fabrication: { ...base().fabrication, shop: { machine: 1 } } })).toThrow(
      /Invalid shop settings/,
    );
  });
  it('validates the sheet-metal feature shape', () => {
    const part = (bends) => ({
      id: 's',
      name: 'Sheet',
      features: [{ id: 'sm', type: 'sheetmetal', sketchId: 'x', thickness: 1.5, stock: 'spcc', bends }],
    });
    expect(() => normalizeModel({ ...base(), parts: [part([{ id: 'b' }, { id: 'b' }])] })).toThrow(
      'Invalid sheet-metal feature: s / sm',
    );
    expect(() => normalizeModel({ ...base(), parts: [part(null)] })).toThrow(/Invalid sheet-metal/);
  });
  it('drops the rows that name a removed instance', () => {
    const model = normalizeModel({
      ...base(),
      finishes: [finish('f1', 'i1'), finish('f2', 'i2')],
      prints: [print('t1', 'i1'), print('t2', 'i2')],
    });
    const next = removeInstance(model, 'i1');
    expect(next.finishes.map((f) => f.id)).toEqual(['f2']);
    expect(next.prints.map((p) => p.id)).toEqual(['t2']);
    expect(removePart(model, 'p').finishes).toEqual([]);
    expect(() => normalizeModel(next)).not.toThrow();
  });
  it('tells a kernel-inert change from one that needs a rebuild', () => {
    const model = normalizeModel(base());
    expect(KERNEL_INERT_KEYS).toEqual(['finishes', 'prints', 'fabrication']);
    expect(sameKernelInput(model, { ...model, finishes: [finish('f', 'i1')] })).toBe(true);
    // The press brake's machine (and the kerf, stock and sheet sizes) never reach the kernel.
    expect(
      sameKernelInput(model, {
        ...model,
        fabrication: { ...model.fabrication, shop: { ...model.fabrication.shop, machine: 'brake-80-2500' } },
      }),
    ).toBe(true);
    expect(sameKernelInput(model, { ...model, finishes: [], prints: [] })).toBe(true);
    expect(sameKernelInput(model, { ...model, instances: [...model.instances] })).toBe(false);
    expect(sameKernelInput(model, { ...model, marks: [] })).toBe(false);
    expect(sameKernelInput(model, null)).toBe(false);
  });
  it('treats a group edit as kernel-inert (grouping parts never rebuilds them)', () => {
    const model = normalizeModel(base());
    const grouped = {
      ...model,
      groups: [{ id: 'g', name: 'Group 1', parentId: null }],
      instances: model.instances.map((i) => ({ ...i, groupId: 'g' })),
    };
    expect(sameKernelInput(model, grouped)).toBe(true);
    expect(sameKernelInput(grouped, model)).toBe(true);
    // Only the group changed on the first; the second also moved.
    expect(
      sameKernelInput(model, {
        ...grouped,
        instances: [grouped.instances[0], { ...grouped.instances[1], position: [11, 0, 0] }],
      }),
    ).toBe(false);
    // A record with another key changed, or a different count, still rebuilds.
    expect(
      sameKernelInput(model, { ...model, instances: [{ ...model.instances[0], visible: false }, model.instances[1]] }),
    ).toBe(false);
    expect(sameKernelInput(model, { ...model, instances: model.instances.slice(0, 1) })).toBe(false);
    expect(sameKernelInput(model, { ...model, groups: [{ id: 'g', name: 'G', parentId: null }] })).toBe(true);
  });
  it('sends the kernel the model without the shop records (a print image never reaches a worker)', () => {
    const model = normalizeModel({
      ...base(),
      finishes: [finish('f', 'i1')],
      prints: [print('t', 'i1', { kind: 'image', image: `data:image/png;base64,${'A'.repeat(400000)}` })],
    });
    const payload = kernelPayload(model);
    expect(payload).not.toHaveProperty('finishes');
    expect(payload).not.toHaveProperty('prints');
    expect(payload.instances).toBe(model.instances);
    expect(JSON.stringify(payload).length).toBeLessThan(5000);
    // What the worker rebuilds from is still a valid model.
    expect(normalizeModel(payload).prints).toEqual([]);
    const plain = normalizeModel(base());
    expect(kernelPayload(plain)).toBe(plain);
  });
});

describe('a file saved with the Weld and Assembly stations (docs/sketch-studio-shop-trim.md §4.2)', () => {
  // What an instance is, where it stands and what was done to it.
  const state = (model) =>
    model.instances.map((i) => ({
      id: i.id,
      partId: i.partId,
      position: i.position,
      rotation: i.rotation,
      group: i.groupId ?? null,
      finish: model.finishes.find((f) => f.instanceId === i.id) || null,
      prints: model.prints.filter((p) => p.instanceId === i.id),
    }));
  for (const [name, old] of [
    ['the kiosk', oldKiosk],
    ['the control box', oldBox],
  ])
    it(`opens ${name} with the same parts, poses, groups, finishes and prints, its seams and steps left out`, () => {
      expect(old.welds.length).toBeGreaterThan(0);
      expect(old.assembly.length).toBeGreaterThan(0);
      // The load path of a saved file (normalizeSketchDocument, as Open and the recovery load run it).
      const opened = normalizeSketchDocument({ name: 'Old shop file', model: old }).model;
      expect(opened).not.toHaveProperty('welds');
      expect(opened).not.toHaveProperty('assembly');
      expect(opened.version).toBe(1);
      expect(state(opened)).toEqual(state(old));
      // The groups stay, with their names, parents and members; the weldment flag goes.
      expect(opened.groups).toEqual(old.groups.map(({ weldment: _weldment, ...group }) => group));
      for (const key of ['parts', 'sketches', 'connections', 'sheets', 'finishes', 'prints', 'fabrication'])
        expect(opened[key]).toEqual(old[key]);
    });
  it('never validates the old records: a malformed seam or step does not refuse the file', () => {
    const old = {
      ...base(),
      groups: [{ id: 'g', name: 'Weldment 1', parentId: null, weldment: true }],
      instances: base().instances.map((i) => ({ ...i, groupId: 'g' })),
      welds: [{ id: 'w', kind: 'glue' }, { id: 'w' }, null],
      assembly: 'not a list',
    };
    const opened = normalizeModel(old);
    expect(opened).not.toHaveProperty('welds');
    expect(opened).not.toHaveProperty('assembly');
    expect(opened.groups).toEqual([{ id: 'g', name: 'Weldment 1', parentId: null }]);
    expect(opened.instances.map((i) => i.groupId)).toEqual(['g', 'g']);
    // A model with no such keys comes back with none.
    expect(normalizeModel(base())).not.toHaveProperty('welds');
  });
});
