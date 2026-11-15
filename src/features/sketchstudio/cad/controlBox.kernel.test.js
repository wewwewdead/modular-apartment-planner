// Shop → Example: control box (docs/sketch-studio-fab-shop.md §9 SM-4 item 4)
// in the real kernel: it normalises, builds, passes every station's own checks
// (laser, press brake, paint, print), its job sheet shows every step done
// (Cut, Bend, Paint, Print); the drawing view kind 'flat' through the sheet
// pipeline; etched marks on the flat DXF (layer ETCH) without changing the
// folded solid.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { emptyModel, normalizeModel } from './model.js';
import { createKernelSession } from './kernel.js';
import { foldSheet, foldedBounds, sheetMetalFeature } from './sheetMetal.js';
import { CONTROL_BOX, sheetMetalControlBox, sheetMetalPumpBracket } from './shopExamples.js';
import { laserStation } from './laserStation.js';
import { sequenceChecks } from './brakeStation.js';
import { assessBend, gaugeEdges, gaugeReading } from './pressBrake.js';
import { fillingHoles, meshArea, paintNumbers } from './paintStation.js';
import { localMesh, printWarnings } from './printStation.js';
import { jobSheet, jobSheetCsv } from './jobSheet.js';
import { drawingDxf } from './exports.js';
import { sheetSvg } from './drawings.js';
import { sheetFit } from './sheetLayout.js';
import { machineOf } from './shopCatalog.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

const size = ([min, max]) => max.map((v, i) => v - min[i]);
const expectSize = (box, expected, tolerance = 0.01) =>
  size(box).forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThan(tolerance));
let built;
const build = (model, sheetIds = []) => {
  const started = performance.now();
  const session = createKernelSession(model);
  try {
    const snapshot = session.snapshot();
    const ms = performance.now() - started;
    return {
      snapshot,
      ms,
      profiles: session.planarProfiles(),
      drawings: session.drawings({ sheetIds, collectErrors: true }),
    };
  } finally {
    session.dispose();
  }
};

describe('Example: control box', () => {
  const model = normalizeModel(sheetMetalControlBox());

  it('normalises with the records the stations write', () => {
    expect(model.parts.map((p) => p.features[0].bends.length)).toEqual([4, 2]);
    expect(model.parts.map((p) => p.features[0].marks.length)).toEqual([4, 2]);
    expect(model).not.toHaveProperty('welds');
    expect(model).not.toHaveProperty('assembly');
    expect(model.finishes.map((f) => [f.name, f.colour, f.gloss, f.kind, f.thickness])).toEqual(
      Array(2).fill(['RAL 7035 Light grey', '#c5c7c4', 'texture', 'powder', 70]),
    );
    expect(model.prints.map((p) => [p.kind, p.method, p.width, p.height])).toEqual([
      ['image', 'uv', 24, 24],
      ['text', 'silk', 72, 9],
    ]);
    expect(model.prints[0].image).toMatch(/^data:image\/png;base64,/);
    expect(model.prints[0].image.length).toBeLessThan(512 * 1024);
    expect(model.groups).toEqual([{ id: 'shop-box-group', name: 'Control box', parentId: null }]);
    expect(model.instances.every((i) => i.groupId === 'shop-box-group')).toBe(true);
    // Each bend as the brake writes it: its line, 90°, the direction, no radius, the tooling.
    for (const part of model.parts)
      for (const bend of part.features[0].bends)
        expect(Object.keys(bend).sort()).toEqual(['a', 'angle', 'b', 'die', 'direction', 'id', 'punch', 'radius']);
  });

  it('builds in the kernel: a 160 × 100 × 25 body and a 160 × 103 × 15 lid', () => {
    built = build(model, ['shop-box-flat-sheet']);
    const [body, lid] = built.snapshot.parts;
    expectSize(body.bounds, [CONTROL_BOX.length, CONTROL_BOX.width, CONTROL_BOX.height]);
    expectSize(lid.bounds, [CONTROL_BOX.length, CONTROL_BOX.width + 2 * (1.2 + 0.3), CONTROL_BOX.lidFlange]);
    // The lid sits on the walls' top edges, its flanges outside the front and rear walls.
    const [bodyBox, lidBox] = built.snapshot.instances.map((i) => i.bounds);
    expect(lidBox[1][2] - bodyBox[1][2]).toBeCloseTo(1.2, 3);
    expect(bodyBox[0][1] - lidBox[0][1]).toBeCloseTo(1.5, 3);
    // Build + snapshot of both parts (fold, cut, revolve, fuse, mesh): 350 – 380 ms measured in node.
    expect(built.ms).toBeLessThan(20000);
  });

  it('passes the laser, the press brake, the paint and the print checks', () => {
    const machine = machineOf();
    for (const [index, part] of model.parts.entries()) {
      const instance = model.instances.find((i) => i.partId === part.id);
      const laser = laserStation({ model, session: { instanceId: instance.id, quantity: 1 } });
      expect(laser.checks.refusals).toEqual([]);
      expect(laser.checks.warnings).toEqual([]);
      const feature = sheetMetalFeature(part);
      const fold = foldSheet(feature, model.sketches.find((s) => s.id === feature.sketchId).profile);
      expect(fold.warnings).toEqual([]);
      expect(sequenceChecks({ fold, machine }).filter((c) => c.refusals.length || c.collision)).toEqual([]);
      // The gauged hits read a backgauge L in reach; every hit's own checks pass.
      const edges = gaugeEdges(laser.polygon.outer);
      for (const bend of fold.bends) {
        const readings = edges.map((edge) => gaugeReading(fold, bend.id, edge)).filter((g) => g.distance != null);
        const gauged = readings.some((g) => Math.abs(g.distance - (index ? 13.931 : 23.931)) < 0.01);
        if (gauged) expect(assessBend(fold, bend.id, { machine, gauge: readings[0] }).refusals).toEqual([]);
        expect(assessBend(fold, bend.id, { machine }).refusals).toEqual([]);
      }
    }
    // Paint: both parts in range, no hole that fills.
    for (const finish of model.finishes) {
      const mesh = built.snapshot.instances.find((i) => i.id === finish.instanceId).mesh;
      expect(paintNumbers({ area: meshArea(mesh), kind: finish.kind, thickness: finish.thickness }).warnings).toEqual(
        [],
      );
    }
    for (const part of model.parts) expect(fillingHoles(part, model)).toEqual([]);
    // Print: both on the lid's flat top, clear of its edges and of the bend zones.
    const lidItem = built.snapshot.instances.find((i) => i.id === 'shop-box-lid-instance');
    const lidPart = model.parts.find((p) => p.id === 'shop-box-lid');
    const lidFold = foldSheet(lidPart.features[0], model.sketches.find((s) => s.id === 'shop-box-lid-blank').profile);
    for (const print of model.prints)
      expect(printWarnings({ print, mesh: localMesh(lidItem), fold: lidFold }).warnings).toEqual([]);
  });

  it('has a job sheet with every step done and estimated times', () => {
    const sheet = jobSheet(model, built.snapshot);
    expect(sheet.products.map((p) => p.name)).toEqual(['Control box']);
    const [product] = sheet.products;
    expect(product.done).toBe(true);
    expect(product.steps.map((s) => [s.key, s.status])).toEqual([
      ['cut', 'done'],
      ['bend', 'done'],
      ['paint', 'done'],
      ['print', 'done'],
    ]);
    // Paint counts the two parts painted (SF-5, the SF-4 audit: the oven cure is one load, not a part).
    expect(product.steps.map((s) => s.quantity)).toEqual([2, 6, 2, 2]);
    expect(product.notMade).toEqual([]);
    expect(product.steps.every((s) => s.time > 0)).toBe(true);
    // Each laser item times its blank by the laser's own readout.
    const cut = product.steps[0].items.map((i) => i.seconds);
    expect(cut[0]).toBeCloseTo(3.229, 2);
    expect(cut[1]).toBeCloseTo(1.778, 2);
    expect(jobSheetCsv(sheet)).toContain('"Control box","Route","Done","Product total"');
  });

  it('draws the flat view: the blank in its own X, Y, the bend lines with labels and the bend table', () => {
    const [drawn] = built.drawings;
    expect(drawn.error).toBeUndefined();
    const [view] = drawn.views;
    expect(view.view).toBe('flat');
    expect(view.viewBox[2]).toBeCloseTo(205.72, 1);
    expect(view.viewBox[3]).toBeCloseTo(145.72, 1);
    expect(view.hidden).toEqual([]);
    expect(view.bendLines.map((b) => b.label)).toEqual(Array(4).fill('UP 90° R1.28'));
    expect(view.bendTable.map((r) => [r.bend, r.angle, r.direction, +r.radius.toFixed(2), r.tooling])).toEqual([
      [1, 90, 'up', 1.28, 'Straight 88° / V8 88°'],
      [2, 90, 'up', 1.28, 'Straight 88° / V8 88°'],
      [3, 90, 'up', 1.28, 'Straight 88° / V8 88°'],
      [4, 90, 'up', 1.28, 'Straight 88° / V8 88°'],
    ]);
    const sheet = {
      ...model.sheets.find((s) => s.id === 'shop-box-flat-sheet'),
      bounds: drawn.bounds,
      views: drawn.views,
    };
    const svg = sheetSvg(sheet, model, built.snapshot, 2, 2);
    expect(svg).toContain('BEND TABLE — IN THE ORDER MADE');
    expect(svg).toContain('1 · UP 90° R1.28');
    expect(svg).toContain('Straight 88° / V8 88°');
    expect(svg).toContain('data-view="flat"');
    // Overall blank dimensions and a fitted scale.
    expect(svg).toContain('>205.72<');
    expect(svg).toContain('>145.72<');
    expect(sheetFit(sheet, sheet.views).fits).toBe(true);
    // The workshop overview layout draws them too.
    const overview = sheetSvg({ ...sheet, layout: 'standard' }, model, built.snapshot);
    expect(overview).toContain('BEND TABLE — IN THE ORDER MADE');
  });

  it('writes the etched marks to the flat DXF on layer ETCH, beside the bend lines', () => {
    const body = built.profiles.find((p) => p.partId === 'shop-box-body');
    expect(body.etchLines).toHaveLength(4);
    const dxf = drawingDxf(body.visible, { bendLines: body.bendLines, etchLines: body.etchLines });
    expect(dxf.match(/\n8\nETCH\n/g)).toHaveLength(4);
    expect(dxf.match(/\n8\nBEND\n/g)).toHaveLength(4);
  });
});

describe('the flat view and marks elsewhere', () => {
  const rect = (width, height, holes) => ({ type: 'rectangle', width, height, origin: [0, 0], holes });
  const sheetModel = (marks = []) => ({
    ...emptyModel(),
    sketches: [
      {
        id: 's',
        name: 'Blank',
        plane: 'XY',
        // A cut-out near the top left: the flat view must not mirror it.
        profile: rect(80, 40, [{ type: 'circle', center: [60, 32], radius: 3 }]),
        primitives: [],
        constrained: false,
      },
    ],
    parts: [
      {
        id: 'p',
        name: 'Sheet part',
        material: 'SPCC cold-rolled steel',
        features: [
          {
            id: 'sm',
            type: 'sheetmetal',
            sketchId: 's',
            thickness: 1.5,
            stock: 'spcc',
            kFactor: null,
            base: null,
            marks,
            bends: [{ id: 'b1', a: [20, 0], b: [20, 40], angle: 90, direction: 'down', radius: null }],
          },
        ],
      },
      { id: 'q', name: 'Board', features: [{ id: 'g', type: 'box', width: 10, depth: 10, height: 10 }] },
    ],
    instances: [
      { id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 'j', partId: 'q', position: [200, 0, 0], rotation: [0, 0, 0] },
    ],
    sheets: [
      ...emptyModel().sheets,
      {
        id: 'flat',
        title: 'Flat',
        partId: 'p',
        size: 'A4',
        scaleMode: 'fit',
        scale: 1,
        views: ['flat'],
        annotations: [],
      },
      { id: 'board-flat', title: 'Board flat', partId: 'q', size: 'A4', scale: 1, views: ['flat'], annotations: [] },
    ],
  });

  it('keeps +Y up (not mirrored), labels a down bend and refuses a part that is not sheet metal', () => {
    const { drawings } = build(sheetModel(), ['flat', 'board-flat']);
    const [flat, board] = drawings;
    const view = flat.views[0];
    // The drawing frame is (X, −Y): the cut-out at Y 32 (near the top) has drawn y −32.
    const [x0, y0, w, h] = view.viewBox;
    expect([x0, y0, w, h].map((v) => +v.toFixed(3) + 0)).toEqual([0, -40, 80, 40]);
    expect(view.visible.join(' ')).toContain('M 57 -32 A 3 3');
    expect(view.bendLines).toHaveLength(1);
    expect(view.bendLines[0]).toMatchObject({ bend: 1, direction: 'down', label: 'DOWN 90° R1.6' });
    expect(view.bendLines[0].a[0]).toBeCloseTo(20, 6);
    expect(view.bendLines[0].b[0]).toBeCloseTo(20, 6);
    expect(Math.abs(view.bendLines[0].a[1] - view.bendLines[0].b[1])).toBeCloseTo(40, 6);
    expect(board.error).toBe(
      "The flat view draws a sheet-metal part's blank: choose a sheet-metal part as this sheet's Drawing subject.",
    );
  });

  it('a marks edit leaves the folded solid as it was; no marks, no ETCH and no etchLines key', () => {
    const marked = build(sheetModel([{ id: 'm1', a: [20, 0], b: [20, 40] }]));
    const plain = build(sheetModel());
    expect(marked.snapshot.parts[0].bounds).toEqual(plain.snapshot.parts[0].bounds);
    expect(marked.snapshot.parts[0].volume).toBeCloseTo(plain.snapshot.parts[0].volume, 9);
    const profile = plain.profiles.find((p) => p.partId === 'p');
    expect('etchLines' in profile).toBe(false);
    expect(drawingDxf(profile.visible, { bendLines: profile.bendLines })).not.toContain('ETCH');
    expect(marked.profiles.find((p) => p.partId === 'p').etchLines).toHaveLength(1);
    // The pump bracket's profile (no marks) is unchanged by SM-4.
    const pump = build(sheetMetalPumpBracket()).profiles[0];
    expect(Object.keys(pump).sort()).toEqual([
      'basis',
      'bendLines',
      'hidden',
      'partId',
      'thickness',
      'viewBox',
      'visible',
    ]);
  });

  it('folds the example the same way the kernel does (main thread)', () => {
    const model = normalizeModel(sheetMetalControlBox());
    const body = model.parts[0].features[0];
    const fold = foldSheet(body, model.sketches[0].profile);
    // The blank's corners are written to 0.0001 mm.
    expectSize(foldedBounds(fold), [160, 100, 25], 1e-3);
  });
});
