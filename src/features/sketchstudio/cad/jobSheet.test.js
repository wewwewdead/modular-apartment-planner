// The job sheet (docs/sketch-studio-fab-shop.md §9 SM-4 item 2): products
// (top-level groups or lone parts), the four steps with their markers, the
// numbers taken from the stations' own readouts, what is not made here, the
// batch, the CSV.
import { describe, expect, it } from 'vitest';
import { emptyModel } from './model.js';
import { createHardware, hardwareDefaults } from './hardware.js';
import { boughtInItem } from './shopParts.js';
import { foldSheet } from './sheetMetal.js';
import { laserNumbers } from './laserStation.js';
import { assessBend, strokeTimeline } from './pressBrake.js';
import { machineOf } from './shopCatalog.js';
import { BEND_HANDLING_S, PRINT_HANDLING_S, formatDuration, jobProducts, jobSheet, jobSheetCsv } from './jobSheet.js';

const rect = (width, height, holes = []) => ({ type: 'rectangle', width, height, origin: [0, 0], holes });
const sheetPart = (id, sketchId, bends = []) => ({
  id,
  name: `Part ${id}`,
  material: 'SPCC cold-rolled steel',
  features: [{ id: `${id}-f`, type: 'sheetmetal', sketchId, thickness: 1.5, stock: 'spcc', bends }],
});
const L = [{ id: 'b1', a: [30, 0], b: [30, 60], angle: 90, direction: 'up', radius: null }];
function shopModel() {
  return {
    ...emptyModel(),
    sketches: [
      {
        id: 's1',
        name: 'Blank 1',
        plane: 'XY',
        profile: rect(100, 60, [{ type: 'circle', center: [70, 30], radius: 5 }]),
      },
      { id: 's2', name: 'Blank 2', plane: 'XY', profile: rect(200, 120) },
    ],
    parts: [
      sheetPart('a', 's1', L),
      sheetPart('b', 's2'),
      { id: 'c', name: 'Board', features: [{ id: 'c-f', type: 'box', width: 10, depth: 10, height: 10 }] },
    ],
    instances: [
      { id: 'ia', partId: 'a', name: 'Angle', groupId: 'g', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 'ib', partId: 'b', name: 'Plate', groupId: 'g', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 'ic', partId: 'c', name: 'Board', position: [0, 0, 0], rotation: [0, 0, 0] },
    ],
    groups: [{ id: 'g', name: 'Frame', parentId: null }],
  };
}
// A snapshot stand-in: a mesh per instance for the area.
const snapshotOf = (model) => ({
  parameters: {},
  parts: [],
  instances: model.instances.map((i) => ({
    id: i.id,
    partId: i.partId,
    placement: [],
    // One 100 × 100 mm square (0.01 m²).
    mesh: { vertices: new Float32Array([0, 0, 0, 100, 0, 0, 100, 100, 0, 0, 100, 0]), triangles: [0, 1, 2, 0, 2, 3] },
  })),
});

describe('jobSheet', () => {
  it('reads products as the top-level nodes: a group, a lone part', () => {
    expect(jobProducts(shopModel())).toEqual([
      { id: 'g', name: 'Frame', instanceIds: ['ia', 'ib'] },
      { id: 'ic', name: 'Board', instanceIds: ['ic'] },
    ]);
  });

  it('marks what is done: cut and bent; not yet painted; no print, so Print not needed', () => {
    const model = shopModel();
    const [frame, board] = jobSheet(model, snapshotOf(model)).products;
    // Cut, Bend, Paint, Print (docs/sketch-studio-shop-trim.md §4.5): no Weld, no Assemble.
    expect(frame.steps.map((s) => [s.name, s.status])).toEqual([
      ['Cut', 'done'],
      ['Bend', 'done'],
      ['Paint', 'todo'],
      // Print is optional, `none` without a print.
      ['Print', 'none'],
    ]);
    expect(frame.done).toBe(false);
    expect(frame.steps[1].summary).toBe('1 hit on the press brake; flat: Plate');
    // A board is not a laser part.
    expect(board.steps[0]).toMatchObject({
      status: 'todo',
      summary: 'No sheet-metal blank: nothing to cut on the laser',
    });
  });

  it('times the cut and the hits with the stations’ own readouts, and the handling as a stated estimate', () => {
    const model = shopModel();
    const [frame] = jobSheet(model, snapshotOf(model)).products;
    const fold = foldSheet(model.parts[0].features[0], model.sketches[0].profile);
    const laser = laserNumbers({ cutLength: fold.flat.cutLength, pierces: 2, stock: 'spcc', thickness: 1.5 });
    expect(frame.steps[0].items[0].seconds).toBeCloseTo(laser.perBlank, 9);
    expect(frame.steps[0].items[0].detail).toBe(
      '100 × 60 mm · t 1.5 SPCC cold-rolled steel · cut 351.4 mm · 2 pierces',
    );
    const machine = machineOf();
    const hit = assessBend(fold, 'b1', { machine });
    const stroke = strokeTimeline(machine, hit.readouts.ramDepth).total / 1000;
    const [bend] = frame.steps[1].items;
    expect(bend.seconds).toBeCloseTo(stroke + BEND_HANDLING_S, 9);
    expect(bend.detail).toContain('UP 90° R1.6 · Straight 88° punch, V10 88° die');
    expect(bend.detail).toContain(`+ ${BEND_HANDLING_S} s handling`);
  });

  it('counts the paint (partial until every part is painted, the cure once) and the prints; the total is their sum', () => {
    const model = shopModel();
    model.finishes = [
      {
        id: 'f1',
        instanceId: 'ia',
        kind: 'powder',
        name: 'RAL 9005 Jet black',
        colour: '#0e0e10',
        gloss: 'matte',
        thickness: 70,
      },
    ];
    model.prints = [
      {
        id: 'p1',
        instanceId: 'ib',
        origin: [10, 10, 1.5],
        x: [1, 0, 0],
        normal: [0, 0, 1],
        width: 30,
        height: 10,
        method: 'silk',
        kind: 'text',
        text: 'ACME',
        font: 'sans-serif',
        colour: '#ffffff',
      },
    ];
    const [frame] = jobSheet(model, snapshotOf(model)).products;
    const [cut, bend, paint, print] = frame.steps;
    expect(frame.time).toBeCloseTo(cut.time + bend.time + paint.time + print.time, 9);
    expect(paint.status).toBe('partial');
    expect(paint.summary).toBe('1 of 2 parts painted · RAL 9005 Jet black');
    expect(paint.items.map((i) => i.label)).toEqual(['Angle · RAL 9005 Jet black', 'Oven cure']);
    expect(paint.items[0].detail).toBe('Matte · 70 µm powder · 0.01 m² · 1.8 g powder');
    expect(paint.time).toBe(600);
    // The quantity counts the parts painted, not the oven load (SF-4 audit: the kiosk read 8 for 7 parts).
    expect(paint.quantity).toBe(1);
    expect(paint.items[1]).toMatchObject({ quantity: 1, load: true });
    expect(print).toMatchObject({ status: 'done', time: PRINT_HANDLING_S });
    expect(print.items[0].detail).toBe('text “ACME” · 30 × 10 mm');
    // Batch 5: five of every item, one oven load.
    const batch = jobSheet(model, snapshotOf(model), { batch: 5 }).products[0];
    expect(batch.steps[3].time).toBe(5 * PRINT_HANDLING_S);
    expect(batch.steps[2].time).toBe(600);
    expect(batch.steps[2].quantity).toBe(5);
    expect(batch.steps[0].quantity).toBe(10);
    const csv = jobSheetCsv(jobSheet(model, snapshotOf(model)));
    expect(csv.split('\r\n')[0]).toBe(
      '"Product","Step","Status","Item","What was done","Quantity","Estimated time each s","Estimated time s"',
    );
    expect(csv).toContain('"Frame","Paint","Part done","Paint total","1 of 2 parts painted · RAL 9005 Jet black"');
    expect(csv).not.toMatch(/"Weld"|"Assemble"/);
  });

  it('lists what is in a product but not made here, untimed, by label and count', () => {
    const model = shopModel();
    const bought = boughtInItem({ name: 'Display 21.5 in', width: 500, depth: 40, height: 300 });
    const screw = createHardware(hardwareDefaults('pan-head', 'M4'));
    model.parts.push(bought.part, screw.part);
    model.instances.push(
      { ...bought.instance, id: 'id', groupId: 'g' },
      ...Array.from({ length: 8 }, (_, k) => ({ ...screw.instance, id: `is${k}`, groupId: 'g' })),
    );
    const [frame] = jobSheet(model, snapshotOf(model)).products;
    expect(frame.notMade).toEqual([
      { label: 'Display 21.5 in (bought in)', count: 1 },
      { label: 'M4 × 12 pan head', count: 8 },
    ]);
    // Cut and Paint count the parts made here only: the display and the screws leave them as they were.
    expect(frame.steps[0]).toMatchObject({ status: 'done', summary: '2 blanks cut from sheet' });
    expect(frame.steps[2].summary).toBe('Not painted');
    // Untimed: the total is still the steps'.
    expect(frame.time).toBeCloseTo(
      frame.steps.reduce((sum, s) => sum + (s.time || 0), 0),
      9,
    );
    expect(jobSheet(model, snapshotOf(model), { batch: 2 }).products[0].notMade[1].count).toBe(16);
    const csv = jobSheetCsv(jobSheet(model, snapshotOf(model)));
    expect(csv).toContain('"Frame","Not made here","","M4 × 12 pan head","Bought in or fastener: not timed","8","",""');
    // A node made only of hardware is not a product.
    model.instances.push({ ...screw.instance, id: 'loose' });
    expect(jobProducts(model).map((p) => p.id)).toEqual(['g', 'ic']);
  });

  it('a bought-in item on its own is no product; grouped with a made part it is that product’s, not made here', () => {
    const model = shopModel();
    const bought = boughtInItem({ name: 'Display', width: 500, depth: 40, height: 300 });
    const screw = createHardware(hardwareDefaults('pan-head', 'M4'));
    model.parts.push(bought.part, screw.part);
    model.instances.push({ ...bought.instance, id: 'id' });
    expect(jobProducts(model).map((p) => p.id)).toEqual(['g', 'ic']);
    expect(jobSheet(model, snapshotOf(model)).products.map((p) => p.name)).toEqual(['Frame', 'Board']);
    // Nothing made here in a group of a bought-in item and its screws either.
    model.groups.push({ id: 'kit', name: 'Display kit', parentId: null });
    model.instances = model.instances.map((i) => (i.id === 'id' ? { ...i, groupId: 'kit' } : i));
    model.instances.push({ ...screw.instance, id: 'is', groupId: 'kit' });
    expect(jobProducts(model).map((p) => p.id)).toEqual(['g', 'ic']);
    // Grouped with the frame: one of its members, on its "not made here" line.
    model.groups = model.groups.map((g) => (g.id === 'kit' ? { ...g, parentId: 'g' } : g));
    expect(jobProducts(model).map((p) => p.id)).toEqual(['g', 'ic']);
    const [frame] = jobSheet(model, snapshotOf(model)).products;
    expect(frame.instanceIds).toEqual(expect.arrayContaining(['id', 'is']));
    expect(frame.notMade).toEqual([
      { label: 'Display (bought in)', count: 1 },
      { label: 'M4 × 12 pan head', count: 1 },
    ]);
  });

  it('formats durations', () => {
    expect([formatDuration(3.21), formatDuration(38.4), formatDuration(125), formatDuration(3725)]).toEqual([
      '3.2 s',
      '38 s',
      '2 min 05 s',
      '1 h 02 min',
    ]);
    expect(formatDuration(null)).toBe('—');
  });
});

describe('Print is optional (SF-3)', () => {
  it('a product with no print: Not needed on the job sheet, the CSV, the route and the job board', async () => {
    const { partProgress, routeProgress } = await import('./shopRoute.js');
    const model = shopModel();
    const sheet = jobSheet(model, snapshotOf(model));
    const [frame] = sheet.products;
    expect(frame.steps.find((s) => s.key === 'print').status).toBe('none');
    const rows = jobSheetCsv(sheet).split(/\r?\n/);
    expect(rows.some((r) => r.includes('Print total') && r.includes('Not needed'))).toBe(true);
    const route = routeProgress(model, frame.id);
    expect(route.print).toEqual({ status: 'none', text: 'not needed' });
    expect(route).not.toHaveProperty('weld');
    expect(route).not.toHaveProperty('assembly');
    const part = partProgress(model, frame.instanceIds[0]);
    expect(part.print.status).toBe('none');
  });
});
