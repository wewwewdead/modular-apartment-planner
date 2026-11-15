// The paint booth's logic (docs/sketch-studio-fab-shop.md §9 SM-3, §8.6):
// area from the mesh, powder by the coverage formula, one finish per
// instance, prints removed by painting or stripping, holes likely to fill.
import { describe, expect, it } from 'vitest';
import { emptyModel, normalizeModel } from './model.js';
import {
  FINISH_DEFAULTS,
  applyFinish,
  fillingHoles,
  finishLabel,
  meshArea,
  paintNumbers,
  paintPick,
  printsOn,
  stripFinish,
} from './paintStation.js';
import { POWDER, RAL_CLASSIC, powderCoverage, ralOf } from './shopCatalog.js';

// A closed box mesh, 8 corners and 12 triangles.
const boxMesh = ([x0, y0, z0], [x1, y1, z1]) => ({
  vertices: [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ].flat(),
  triangles: [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7,
  ],
});
const model = () => ({
  ...emptyModel(),
  parts: [{ id: 'p', name: 'Plate', features: [{ id: 'f', type: 'box', width: 1, depth: 1, height: 1 }] }],
  instances: ['a', 'b', 'c'].map((id) => ({ id, partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] })),
});
const print = (id, instanceId) => ({
  id,
  instanceId,
  origin: [0, 0, 1],
  x: [1, 0, 0],
  normal: [0, 0, 1],
  width: 10,
  height: 5,
  rotation: 0,
  method: 'silk',
  kind: 'text',
  text: 'A',
  font: 'sans-serif',
  colour: '#ffffff',
});

describe('the RAL list (shopCatalog.js)', () => {
  it('names each colour "RAL 9005 Jet black" with its hex approximation', () => {
    expect(RAL_CLASSIC.length).toBeGreaterThanOrEqual(25);
    expect(new Set(RAL_CLASSIC.map((r) => r.code)).size).toBe(RAL_CLASSIC.length);
    expect(RAL_CLASSIC.every((r) => /^RAL \d{4} [A-Z]/.test(r.name) && /^#[0-9a-f]{6}$/.test(r.colour))).toBe(true);
    expect(RAL_CLASSIC.find((r) => r.code === 9005)).toEqual({
      code: 9005,
      name: 'RAL 9005 Jet black',
      colour: '#0e0e10',
    });
    // The spec's example finish (§4.2).
    expect(ralOf({ colour: '#C5C7C4' }).name).toBe('RAL 7035 Light grey');
    expect(ralOf({ name: 'RAL 3020 Traffic red' }).colour).toBe('#bb1e10');
    expect(ralOf({ colour: '#123456' })).toBeNull();
  });
});

describe('paintNumbers (§8.6)', () => {
  it('area from the mesh, powder from the coverage formula, the cure', () => {
    expect(meshArea(boxMesh([0, 0, 0], [100, 60, 1.5]))).toBeCloseTo(2 * 6000 + 2 * 150 + 2 * 90, 9);
    expect(meshArea(null)).toBe(0);
    const coverage = (1000 / (1.5 * 70)) * 0.6;
    expect(powderCoverage(70)).toBeCloseTo(coverage, 12);
    const numbers = paintNumbers({ area: 61500, kind: 'powder', thickness: 70 });
    expect(numbers.area).toBeCloseTo(0.0615, 12);
    expect(numbers.coverage).toBeCloseTo(5.714285714, 8);
    expect(numbers.mass).toBeCloseTo(0.0615 / coverage, 12);
    expect(numbers.cure).toBe('200 °C part temperature for 10 min');
    expect(numbers.warnings).toEqual([]);
  });
  it('a film outside 50 – 125 µm is a warning; wet paint has no powder figures', () => {
    expect(paintNumbers({ area: 1e6, kind: 'powder', thickness: 150 }).warnings[0].message).toBe(
      'A 150 µm powder film is outside the 50 – 125 µm a booth lays down.',
    );
    const wet = paintNumbers({ area: 1e6, kind: 'wet', thickness: 40 });
    expect(wet).toMatchObject({ area: 1, coverage: null, mass: null });
    expect(wet.warnings).toEqual([]);
    expect(POWDER.film).toBe(70);
  });
});

describe('finishes (§4.2: one per instance)', () => {
  it('writes one row per instance, replacing what it had, and drops the prints on it', () => {
    const before = {
      ...model(),
      finishes: [
        { id: 'old', instanceId: 'a', kind: 'wet', name: 'Old', colour: '#ffffff', gloss: 'gloss', thickness: 40 },
      ],
      prints: [print('t1', 'a'), print('t2', 'c')],
    };
    expect(printsOn(before, ['a', 'b']).map((p) => p.id)).toEqual(['t1']);
    const painted = applyFinish(before, ['a', 'b'], {
      kind: 'powder',
      name: 'RAL 9005 Jet black',
      colour: '#0E0E10',
      gloss: 'satin',
      thickness: 80,
    });
    expect(painted.finishes.map((f) => [f.instanceId, f.name, f.colour, f.gloss, f.thickness])).toEqual([
      ['a', 'RAL 9005 Jet black', '#0e0e10', 'satin', 80],
      ['b', 'RAL 9005 Jet black', '#0e0e10', 'satin', 80],
    ]);
    expect(painted.prints.map((p) => p.id)).toEqual(['t2']);
    expect(() => normalizeModel(painted)).not.toThrow();
    // A custom colour with no name is named by its hex.
    expect(applyFinish(model(), ['c'], { ...FINISH_DEFAULTS, name: ' ', colour: '#123456' }).finishes[0].name).toBe(
      'Custom #123456',
    );
    const stripped = stripFinish(painted, ['a']);
    expect(stripped.finishes.map((f) => f.instanceId)).toEqual(['b']);
    expect(finishLabel(painted.finishes[0])).toBe('RAL 9005 Jet black · satin · 80 µm powder');
  });
  it('offers the part’s own group, its parts made here only (a bought-in item or a fastener is not painted)', () => {
    const grouped = {
      ...model(),
      parts: [
        ...model().parts,
        {
          id: 'd',
          name: 'Display',
          purchased: { colour: '#111111', reference: '' },
          features: [{ id: 'x', type: 'box' }],
        },
      ],
      groups: [
        { id: 'outer', name: 'Kiosk', parentId: null },
        { id: 'inner', name: 'Frame', parentId: 'outer' },
      ],
      instances: [
        ...model().instances.map((i) => ({ ...i, groupId: i.id === 'c' ? 'outer' : 'inner' })),
        { id: 'screen', partId: 'd', groupId: 'outer', position: [0, 0, 0], rotation: [0, 0, 0] },
      ],
    };
    // The innermost group: the frame's two parts.
    expect(paintPick(grouped, 'b')).toEqual({
      instanceIds: ['b'],
      group: { id: 'inner', name: 'Frame', instanceIds: ['a', 'b'] },
    });
    // The kiosk's parts made here: the frame's and c; the display is left out.
    expect(paintPick(grouped, 'c').group).toEqual({ id: 'outer', name: 'Kiosk', instanceIds: ['a', 'b', 'c'] });
    // A part in no group, or alone among bought-in items, is painted alone.
    expect(paintPick(model(), 'c')).toEqual({ instanceIds: ['c'], group: null });
    const withDisplay = { ...grouped, instances: grouped.instances.filter((i) => ['c', 'screen'].includes(i.id)) };
    expect(paintPick(withDisplay, 'c').group).toBe(null);
  });
  it('flags open holes below 1.0 mm as likely to fill', () => {
    const m = {
      ...model(),
      sketches: [
        {
          id: 's',
          profile: {
            type: 'rectangle',
            width: 50,
            height: 40,
            origin: [0, 0],
            holes: [
              { type: 'circle', radius: 0.4, center: [10, 10] },
              { type: 'circle', radius: 2, center: [30, 20] },
            ],
          },
        },
      ],
    };
    const part = {
      features: [
        { id: 'sm', type: 'sheetmetal', sketchId: 's', thickness: 1, bends: [] },
        { id: 'h', type: 'hole', diameter: 0.8 },
        { id: 'h2', type: 'hole', diameter: 5 },
      ],
    };
    const holes = fillingHoles(part, m);
    expect(holes.map((h) => h.where)).toEqual(['a cut-out in the blank', 'a drilled hole']);
    expect(holes[0].size).toBeCloseTo(0.8, 1);
    expect(holes[1].size).toBe(0.8);
  });
});
