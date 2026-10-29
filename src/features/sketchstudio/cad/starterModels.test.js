import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { emptyModel, normalizeModel, resolveParameters, validateReferences } from './model.js';
import { createKernelSession } from './kernel.js';
import { furnitureExample } from './examples.js';
import { mergeParameters } from './parameters.js';
import { presetById } from './parameterPresets.js';
import { partsListRows } from './partsList.js';
import {
  PIN_STEPS,
  PIN_ZONES,
  PILOT_FRACTIONS,
  buildStarterModel,
  cabinetStarter,
  starterModel,
  starterParameterNames,
} from './starterModels.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

let ids = 0;
const presetModel = (presetId, changes = {}) => {
  const entries = presetById(presetId).parameters.map((p) => ({ ...p, value: changes[p.name] ?? p.value }));
  const { parameters } = mergeParameters([], entries, () => `parameter-${++ids}`);
  return normalizeModel(buildStarterModel(emptyModel(), presetId, parameters));
};
const build = (model, fn) => {
  const session = createKernelSession(model);
  try {
    return fn(session, session.snapshot());
  } finally {
    session.dispose();
  }
};
const close = (actual, expected, digits = 4) =>
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, digits));

describe('cabinet starter model', { timeout: 60000 }, () => {
  it('has 8 part definitions and 10 instances, every size an expression over the preset', () => {
    const starter = cabinetStarter();
    expect(starter.parts.map((p) => p.name)).toEqual([
      'Side',
      'Bottom',
      'Top',
      'Fixed shelf',
      'Stiffener',
      'Plinth',
      'Back',
      'Adjustable shelf',
    ]);
    expect(starter.instances).toHaveLength(10);
    // Both sides (and both adjustable shelves) are one definition each.
    const count = (partId) => starter.instances.filter((i) => i.partId === partId).length;
    expect(count('side')).toBe(2);
    expect(count('adjustable-shelf')).toBe(2);
    expect(starter.parts.find((p) => p.id === 'bottom').features[0]).toMatchObject({
      type: 'box',
      width: '=width-2*t',
      depth: '=depth',
      height: '=t',
    });
    expect(starter.parts.every((p) => p.material === 'Birch plywood')).toBe(true);
    expect(starter.parts.find((p) => p.id === 'side').grain).toBe('Z');
    expect(starterParameterNames(starter)).toEqual(['backT', 'depth', 'height', 't', 'toe', 'width']);
    expect(
      presetById('cabinet')
        .parameters.map((p) => p.name)
        .sort(),
    ).toEqual(starterParameterNames(starter));
  });

  it('drills 12 Ø4 through pilot holes and 20 Ø5 × 10 shelf-pin holes in the Side', () => {
    const holes = cabinetStarter().parts[0].features.filter((f) => f.type === 'hole');
    const pilots = holes.filter((h) => h.diameter === 4);
    const pins = holes.filter((h) => h.diameter === 5);
    expect(pilots).toHaveLength(3 * PILOT_FRACTIONS.length);
    expect(pilots.every((h) => h.throughAll)).toBe(true);
    expect(pins).toHaveLength(PIN_ZONES.length * PIN_STEPS.length * 2);
    expect(pins.every((h) => h.depth === 10 && h.direction[0] === -1)).toBe(true);
    // Joint rows at Y 50, 180, 320, 450 on a 500 mm deep cabinet.
    const p = resolveParameters(presetModel('cabinet').parameters);
    expect(PILOT_FRACTIONS.map((f) => +(p.depth * f).toFixed(6))).toEqual([50, 180, 320, 450]);
  });

  it('builds in the kernel, re-sizes from the parameters, and has no overlaps', () => {
    for (const [width, inner] of [
      [800, 764],
      [900, 864],
    ]) {
      const model = presetModel('cabinet', { width });
      expect(validateReferences(model)).toEqual([]);
      build(model, (session, snapshot) => {
        const bounds = (id) => snapshot.instances.find((i) => i.id === id).bounds;
        const size = (id) => bounds(id)[1].map((v, i) => v - bounds(id)[0][i]);
        close(size('bottom'), [inner, 500, 18]);
        close(bounds('bottom')[0], [18, 0, 100]);
        close(bounds('side-right')[0], [width - 18, 0, 0]);
        close(bounds('side-right')[1], [width, 500, 1800]);
        close(bounds('top')[0], [18, 0, 1782]);
        close(bounds('fixed-shelf')[0], [18, 0, 900]);
        close(bounds('stiffener')[0], [18, 0, 882]);
        close(bounds('plinth')[0], [18, 50, 0]);
        close(size('back'), [width, 12, 1700]);
        close(size('adjustable-shelf-2'), [inner - 2, 480, 18]);
        const side = snapshot.parts.find((p) => p.id === 'side').volume;
        const drilled = 12 * Math.PI * 4 * 18 + 20 * Math.PI * 6.25 * 10;
        expect(side).toBeCloseTo(18 * 500 * 1800 - drilled, 0);
        if (width === 800) expect(session.inspect()).toEqual([]);
      });
    }
  });

  it('puts the right side’s shelf pins on its inner face (one definition, turned)', () => {
    const model = presetModel('cabinet');
    // Ø4 probes 4 mm into the right side at a pin location: inside the Ø5 pin
    // hole on the inner face (no overlap), solid wood on the outer face.
    const probe = (id, position, direction) => ({
      id,
      partId: 'probe',
      name: id,
      position,
      rotation: direction,
      visible: true,
    });
    const withProbes = {
      ...model,
      parts: [
        ...model.parts,
        { id: 'probe', name: 'Probe', features: [{ id: 'c', type: 'cylinder', radius: 2, length: 4 }] },
      ],
      instances: [
        ...model.instances,
        // Cylinder along +Z turned to point along X.
        probe('inner', [782, 37, 495], [0, 90, 0]),
        probe('outer', [796, 37, 495], [0, 90, 0]),
      ],
    };
    build(withProbes, (session) => {
      const hits = session
        .inspect()
        .filter((c) => [c.first, c.second].some((id) => ['inner', 'outer'].includes(id)))
        .map((c) => [c.first, c.second].find((id) => ['inner', 'outer'].includes(id)));
      expect(hits).toEqual(['outer']);
    });
  });

  it('reads Side 2 and Adjustable shelf 2 in the parts list', () => {
    const model = presetModel('cabinet');
    build(model, (_, snapshot) => {
      const rows = partsListRows(model, snapshot, model.sheets[0]);
      expect(rows.map((r) => [r.name, r.quantity])).toEqual([
        ['Side', 2],
        ['Bottom', 1],
        ['Top', 1],
        ['Fixed shelf', 1],
        ['Stiffener', 1],
        ['Plinth', 1],
        ['Back', 1],
        ['Adjustable shelf', 2],
      ]);
      expect(rows[0].size).toEqual([1800, 500, 18]);
    });
  });

  it('refuses to build over existing parts or without the names it needs', () => {
    const occupied = furnitureExample('desk');
    expect(() => buildStarterModel(occupied, 'cabinet', occupied.parameters)).toThrow(/already has parts/);
    expect(() => buildStarterModel(emptyModel(), 'cabinet', [{ id: 'w', name: 'width', value: 800 }])).toThrow(
      /needs backT, depth, height, t, toe/,
    );
  });
});

describe('table and steel frame starters reuse the examples', { timeout: 60000 }, () => {
  it('table: the wooden desk on width, depth, height, thickness and legSize', () => {
    const starter = starterModel('table');
    expect(starterParameterNames(starter)).toEqual(['depth', 'height', 'legSize', 'thickness', 'width']);
    expect(starter.parts.map((p) => p.name)).toEqual(['Desktop', 'Wood leg', 'Long apron']);
    // The default example is unchanged by the new option.
    expect(furnitureExample('desk').parts[1].features[0]).toMatchObject({ width: 60, depth: 60 });
    expect(furnitureExample('desk').parts[2].features[0].width).toBe('=width-120');
    const model = presetModel('table', { legSize: 80 });
    build(model, (_, snapshot) => {
      const leg = snapshot.instances.find((i) => i.id === 'leg-1-1').bounds;
      close(leg[0], [1120, 570, 0]);
      close(leg[1], [1200, 650, 726]);
      const apron = snapshot.instances.find((i) => i.id === 'apron-front').bounds;
      close([apron[0][0], apron[1][0]], [80, 1120]);
    });
  });
  it('steel frame: the welded table on section, wall, weldGap (and the top thickness)', () => {
    const starter = starterModel('steel-frame');
    expect(starterParameterNames(starter)).toEqual([
      'depth',
      'height',
      'section',
      'thickness',
      'wall',
      'weldGap',
      'width',
    ]);
    expect(
      presetById('steel-frame')
        .parameters.map((p) => p.name)
        .sort(),
    ).toEqual(starterParameterNames(starter));
    const model = presetModel('steel-frame', { width: 1000 });
    build(model, (_, snapshot) => {
      expect(snapshot.instances.length).toBe(model.instances.length);
      const top = snapshot.instances.find((i) => i.partId === 'top').bounds;
      expect(top[1][0] - top[0][0]).toBeCloseTo(1000, 4);
    });
  });
});
