// The shop floor's route (docs/sketch-studio-shop-floor.md §4.1, §4.3): the
// stations in shop order, where a product and a part stand on it (always the
// job sheet's statuses), and what each station opens on.
import { describe, expect, it } from 'vitest';
import { emptyModel, normalizeModel, removeInstances } from './model.js';
import { jobProducts, jobSheet } from './jobSheet.js';
import { sheetMetalControlBox, sheetMetalPumpBracket } from './shopExamples.js';
import { sheetMetalPart } from './ShopPanels.jsx';
import {
  ROUTE,
  cutParts,
  partProgress,
  readyOutlines,
  routeNeighbour,
  routeProgress,
  sheetPartOf,
  shopOutlineView,
  stationEntry,
} from './shopRoute.js';

const STEPS = ['cut', 'bend', 'paint', 'print'];
const rect = (width, height) => ({ type: 'rectangle', width, height, origin: [0, 0] });
// Two flat blanks and a board in one group, plus a lone flat blank and a loose outline.
function floorModel() {
  const part = (id, sketchId) => ({ ...sheetMetalPart({ sketchId, stock: 'spcc', thickness: 1.5 }), id, name: id });
  return {
    ...emptyModel(),
    sketches: [
      { id: 's1', name: 'Blank 1', plane: 'XY', profile: rect(100, 60) },
      { id: 's2', name: 'Blank 2', plane: 'XY', profile: rect(200, 120) },
      { id: 's3', name: 'Loose', plane: 'XY', profile: rect(40, 30) },
      { id: 's4', name: 'Side', plane: 'XZ', profile: rect(40, 30) },
    ],
    parts: [
      part('a', 's1'),
      part('b', 's2'),
      { id: 'c', name: 'Board', features: [{ id: 'c-f', type: 'box', width: 10, depth: 10, height: 10 }] },
    ],
    instances: [
      { id: 'ia', partId: 'a', name: 'Angle', groupId: 'g', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 'ib', partId: 'b', name: 'Plate', groupId: 'g', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 'ic', partId: 'c', name: 'Board', groupId: 'g', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 'id', partId: 'a', name: 'Spare', position: [0, 0, 0], rotation: [0, 0, 0] },
    ],
    groups: [{ id: 'g', name: 'Frame', parentId: null }],
    finishes: [{ id: 'f1', instanceId: 'ia', kind: 'powder', name: 'RAL 9005 Jet black', colour: '#0e0e10' }],
  };
}
const examples = {
  'pump bracket': () => normalizeModel(sheetMetalPumpBracket()),
  'control box': () => normalizeModel(sheetMetalControlBox()),
  'a mixed group': floorModel,
};

describe('the route', () => {
  it('runs Draw · Cut · Bend · Paint · Print, numbered 1–5, each with its icon and panel', () => {
    expect(ROUTE.map((s) => [s.number, s.name, s.icon, s.region])).toEqual([
      [1, 'Draw', 'ShopCut', 'Draw'],
      [2, 'Cut', 'ShopLaser', 'Laser station'],
      [3, 'Bend', 'ShopBrake', 'Press brake'],
      [4, 'Paint', 'ShopPaint', 'Paint booth'],
      [5, 'Print', 'ShopPrint', 'Print station'],
    ]);
    expect(routeNeighbour('draw', -1)).toBe(null);
    // Bend's Next is Paint.
    expect(routeNeighbour('bend', 1).key).toBe('paint');
    expect(routeNeighbour('paint', -1).key).toBe('bend');
    expect(routeNeighbour('print', 1)).toBe(null);
  });

  for (const [name, build] of Object.entries(examples))
    it(`agrees with the job sheet step by step: ${name}`, () => {
      const model = build();
      const sheet = jobSheet(model, null);
      expect(sheet.products.length).toBeGreaterThan(0);
      for (const product of sheet.products) {
        const progress = routeProgress(model, product.id);
        expect(STEPS.map((key) => progress[key].status)).toEqual(product.steps.map((s) => s.status));
      }
    });

  it('says what each station made on the control box, and that nothing is next', () => {
    const model = examples['control box']();
    const [product] = jobProducts(model);
    const progress = routeProgress(model, product.id);
    expect(ROUTE.map((s) => progress[s.key].text)).toEqual([
      '2 outlines',
      '2 blanks',
      '6 hits',
      'RAL 7035',
      '2 prints',
    ]);
    expect(Object.keys(progress).sort()).toEqual(['bend', 'cut', 'draw', 'next', 'paint', 'print']);
    expect(progress.next).toBe(null);
  });

  it('marks part-done work and names the next step', () => {
    const model = floorModel();
    const progress = routeProgress(model, 'g');
    // Two of three parts are blanks, both flat; one of three painted.
    expect(progress.cut).toEqual({ status: 'partial', text: '2 of 3' });
    expect(progress.bend).toEqual({ status: 'todo', text: 'flat' });
    expect(progress.paint).toEqual({ status: 'partial', text: '1 of 3' });
    expect(progress.next).toBe('cut');
    expect(routeProgress(model, 'id')).toMatchObject({ cut: { status: 'done', text: '1 blank' }, next: 'bend' });
  });

  it('with no product counts the outlines ready to cut', () => {
    expect(routeProgress(emptyModel(), null)).toMatchObject({ draw: { status: 'todo', text: '—' }, next: 'draw' });
    const outlined = { ...emptyModel(), sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile: rect(120, 80) }] };
    expect(routeProgress(outlined, null)).toMatchObject({ draw: { status: 'done', text: '1 outline' }, next: 'cut' });
  });
});

describe('a part on the route', () => {
  it('reads the blank, the bends and the next station that applies to one part', () => {
    const pump = examples['pump bracket']();
    const progress = partProgress(pump, 'shop-pump-instance');
    expect(progress.bend).toEqual({ status: 'done', text: '2 bends' });
    expect(progress.blank).toMatch(/^t 1\.5 A5052 · [\d.]+ × [\d.]+$/);
    expect(progress.state).toBe('2 bends');
    // Bent: paint comes next.
    expect(progress.next).toBe('paint');
    const floor = floorModel();
    expect(partProgress(floor, 'ib')).toMatchObject({ state: 'flat · no bends yet', next: 'bend' });
    // The painted flat part still needs its bends first.
    expect(partProgress(floor, 'ia').next).toBe('bend');
    // A board is never cut or bent: only painting applies.
    expect(partProgress(floor, 'ic')).toMatchObject({ cut: { status: 'todo' }, next: 'paint' });
  });
});

describe('entering a station', () => {
  it('opens on the subject, asks which part, or says what is missing', () => {
    const box = examples['control box']();
    const body = 'shop-box-body-instance',
      lid = 'shop-box-lid-instance';
    // The product chosen (an example loads with its group selected): which part?
    expect(stationEntry(box, { station: 'bend', subject: { productId: 'shop-box-group' } })).toEqual({
      pick: [body, lid],
    });
    expect(stationEntry(box, { station: 'cut', subject: { productId: 'shop-box-group', instanceId: lid } })).toEqual({
      open: { instanceId: lid },
    });
    expect(stationEntry(box, { station: 'paint', subject: { productId: 'shop-box-group', instanceId: body } })).toEqual(
      { open: { instanceId: body } },
    );
    expect(stationEntry(box, { station: 'draw' })).toEqual({ open: {} });
    // One sheet-metal part in the product: chosen without asking.
    const pump = examples['pump bracket']();
    expect(stationEntry(pump, { station: 'bend', subject: null })).toEqual({
      open: { instanceId: 'shop-pump-instance' },
    });
  });

  it('turns an empty workspace into a step back, never an error', () => {
    const empty = emptyModel();
    // In one hop to the station that fixes it (SF-1 audit): with no outline, Draw, not Cut.
    expect(stationEntry(empty, { station: 'bend' })).toEqual({
      blocked: { message: 'Nothing to bend yet: draw the outline first.', go: 'draw' },
    });
    expect(stationEntry(empty, { station: 'cut' })).toEqual({
      blocked: { message: 'Nothing to cut yet: draw the outline first.', go: 'draw' },
    });
    for (const station of ['paint', 'print'])
      expect(stationEntry(empty, { station }).blocked).toMatchObject({ go: 'draw' });
    // One outline drawn, no part yet: Cut opens on it, so every later station points at Cut.
    const outlined = { ...empty, sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile: rect(120, 80) }] };
    expect(stationEntry(outlined, { station: 'cut' })).toEqual({
      open: { outline: { kind: 'sketch', sketchId: 's' } },
    });
    expect(stationEntry(outlined, { station: 'bend' })).toEqual({
      blocked: { message: 'Nothing to bend yet: cut a blank first.', go: 'cut' },
    });
    for (const station of ['paint', 'print'])
      expect(stationEntry(outlined, { station }).blocked).toMatchObject({ go: 'cut' });
    // Several outlines (docs/sketch-studio-outline-edit-sheet-nest.md §4.8): Cut opens on them
    // all — since cut-pick §4.1 the picker, nothing selected — so the later stations point at
    // Cut too (no "Several outlines…" card).
    const two = { ...outlined, sketches: [...outlined.sketches, { ...outlined.sketches[0], id: 't' }] };
    expect(stationEntry(two, { station: 'cut' })).toEqual({ open: { outline: { kind: 'pick', selected: [] } } });
    expect(stationEntry(two, { station: 'bend' })).toEqual({
      blocked: { message: 'Nothing to bend yet: cut a blank first.', go: 'cut' },
    });
    expect(stationEntry(two, { station: 'paint' })).toEqual({
      blocked: { message: 'Nothing to paint yet: cut a blank first.', go: 'cut' },
    });
    expect(stationEntry(two, { station: 'print' }).blocked).toMatchObject({ go: 'cut' });
    // A part that is not sheet metal does not stop the picker: Cut has no blank to open.
    const board = {
      ...two,
      parts: [{ id: 'b', name: 'Board', features: [{ id: 'bf', type: 'box', width: 1, depth: 1, height: 1 }] }],
      instances: [{ id: 'ib', partId: 'b', position: [0, 0, 0], rotation: [0, 0, 0] }],
    };
    expect(stationEntry(board, { station: 'cut' }).open.outline.kind).toBe('pick');
    // …nor does it make one outline a picker: Cut from sheet on it, as before.
    expect(stationEntry({ ...board, sketches: outlined.sketches }, { station: 'cut' })).toEqual({
      open: { outline: { kind: 'sketch', sketchId: 's' } },
    });
  });

  // docs/sketch-studio-cut-pick.md §4.1: Cut's four rows, in order.
  it('opens Cut on the picker whenever an outline waits beside another or beside a cut part', () => {
    const floor = floorModel(); // one loose outline (s3), sheet-metal parts ia / ib / id
    const pick = { open: { outline: { kind: 'pick', selected: [] } } };
    // 1. A part the route was sent to: the laser on it, outline or not.
    expect(stationEntry(floor, { station: 'cut', subject: { productId: 'g', instanceId: 'ib' } })).toEqual({
      open: { instanceId: 'ib' },
    });
    // The same part as the selection only (the route bar): the picker first.
    expect(
      stationEntry(floor, { station: 'cut', subject: { productId: 'g', instanceId: 'ib' }, fromSelection: true }),
    ).toEqual(pick);
    // 2. One outline and a cut part, with or without a product chosen: the picker.
    expect(stationEntry(floor, { station: 'cut' })).toEqual(pick);
    expect(stationEntry(floor, { station: 'cut', subject: { productId: 'g' } })).toEqual(pick);
    // Five outlines and no part: the picker.
    const five = {
      ...emptyModel(),
      sketches: [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, name: `Plate ${n}`, plane: 'XY', profile: rect(50, 40) })),
    };
    expect(stationEntry(five, { station: 'cut' })).toEqual(pick);
    // 3. One outline alone: Cut from sheet on it (the "turns an empty workspace" test above).
    // 4. No outline ready: as before — one part the laser, several the gate, the selection's part the laser.
    const cut = { ...floor, sketches: floor.sketches.filter((s) => s.id !== 's3') };
    expect(stationEntry(cut, { station: 'cut' })).toEqual({ pick: ['ia', 'ib', 'id'] });
    expect(
      stationEntry(cut, { station: 'cut', subject: { productId: 'g', instanceId: 'ib' }, fromSelection: true }),
    ).toEqual({ open: { instanceId: 'ib' } });
    // Bend never opens the picker.
    expect(stationEntry(floor, { station: 'bend', subject: { productId: 'g' } })).toEqual({ pick: ['ia', 'ib'] });
  });

  it('gives a removed sheet-metal part’s outline back to Cut (RC-1)', () => {
    const floor = floorModel();
    // Part b's one blank (ib) goes: b goes with it, its outline s2 is ready again.
    const next = removeInstances(floor, ['ib']);
    expect(next.parts.map((p) => p.id)).toEqual(['a', 'c']);
    expect(readyOutlines(next).map((o) => o.id)).toEqual(['s2', 's3']);
    // One of part a's two blanks: a stays, s1 is still cut.
    expect(readyOutlines(removeInstances(floor, ['id'])).map((o) => o.id)).toEqual(['s3']);
  });

  it('lists the cut parts for Already cut, one row per part with a blank', () => {
    expect(cutParts(floorModel())).toEqual([
      { partId: 'a', instanceId: 'ia', name: 'Angle', copies: 2, sheet: 't 1.5 SPCC', profile: rect(100, 60) },
      { partId: 'b', instanceId: 'ib', name: 'Plate', copies: 1, sheet: 't 1.5 SPCC', profile: rect(200, 120) },
    ]);
    expect(cutParts(emptyModel())).toEqual([]);
  });

  it('draws the picker’s selected outlines chosen, several at once', () => {
    const five = {
      ...emptyModel(),
      sketches: [1, 2, 3].map((n) => ({ id: `s${n}`, name: `Plate ${n}`, plane: 'XY', profile: rect(50, 40) })),
    };
    expect(shopOutlineView(five, {}, ['s1', 's3']).map((o) => [o.id, o.chosen])).toEqual([
      ['s1', true],
      ['s2', false],
      ['s3', true],
    ]);
    // Draw's one id, and none.
    expect(shopOutlineView(five, {}, 's2').map((o) => o.chosen)).toEqual([false, true, false]);
    expect(shopOutlineView(five, {}, null).some((o) => o.chosen)).toBe(false);
    // The outer ring first: the view's click test reads it.
    expect(shopOutlineView(five)[0].rings[0].closed).toBe(true);
  });

  it('counts as ready to cut only closed XY outlines no part is made from', () => {
    const floor = floorModel();
    expect(readyOutlines(floor).map((o) => [o.id, o.width, o.height])).toEqual([['s3', 40, 30]]);
    expect(sheetPartOf(floor, 'ic')).toBe(null);
    expect(sheetPartOf(floor, 'ia').sketch.id).toBe('s1');
  });
});
