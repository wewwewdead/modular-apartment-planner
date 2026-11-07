// Phase O (docs/sketch-studio-rivet-library.md §10): the 15 rivet kinds as
// real OpenCascade solids on the seating-plane contract, installed (set) and
// as supplied (unset).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { emptyModel } from './model.js';
import { createKernelSession } from './kernel.js';
import {
  HEAD_STYLES,
  RIVET_KINDS,
  createHardware,
  hardwareDefaults,
  headsFor,
  resolveHardware,
  sizesFor,
  withBody,
  withHead,
  withState,
} from './hardware.js';
import { rivetGeometry } from './rivetGeometry.js';
import { buildCutList } from './fabrication.js';
import { mapPlacement } from './placement.js';
import { sheetSvg } from './drawings.js';
import { rearCoverExample } from './rearCover.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    cad.setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

const kinds = Object.keys(RIVET_KINDS);
// Builds features as parts of one model; returns { part(i), dispose }.
function build(features) {
  const items = features.map((f) => createHardware(f));
  const model = { ...emptyModel(), parts: items.map((i) => i.part), instances: items.map((i) => i.instance) };
  const session = createKernelSession(model);
  const snapshot = session.snapshot();
  return { model, items, snapshot, part: (i) => snapshot.parts[i], dispose: () => session.dispose() };
}
// One rivet straight from rivetGeometry (no kernel session): its volume and
// bounds, every intermediate shape deleted.
function solidOf(f, probe) {
  const shapes = [];
  const own = (shape) => (shapes.push(shape), shape);
  try {
    const shape = rivetGeometry(f, {}, own);
    const result = { volume: cad.measureVolume(shape), bounds: own(shape.boundingBox).bounds };
    if (probe) result.probe = probe(shape, own);
    return result;
  } finally {
    for (const shape of new Set(shapes)) shape?.delete?.();
  }
}

const MANDREL = ['blind-open', 'blind-closed', 'blind-multigrip', 'blind-peel', 'blind-structural', 'blind-drive'];
const RECESSED = ['blind-open', 'blind-closed', 'blind-multigrip', 'blind-peel', 'blind-structural'];
const CAPS = ['dome', 'large-flange', 'universal', 'round', 'truss'];
const UPSET_TO_TAIL = ['blind-drive', 'self-piercing', 'blind-rivet-nut', 'blind-rivet-stud', 'push-rivet'];
const MANDREL_HEAD = ['blind-open', 'blind-multigrip', 'blind-peel', 'blind-structural'];
// Z of a spherical cap (base dk, height k on Z = 0) at radius r.
function capZ(dk, k, r) {
  const radius = (dk * dk) / 4 / (2 * k) + k / 2;
  return k - radius + Math.sqrt(radius * radius - r * r);
}
// The top of spec §4: k; 0 for flush heads; the dome of a raised countersunk
// head; k + T (stud); k + 0.35·d (push rivet); + 0.1 (drive pin); + ml as
// supplied. A set blind rivet's broken-mandrel recess (Ø dm) takes a cap
// head's apex away: its top is the cap at r = dm/2 (a tubular round head's
// through bore: at r = bore/2).
function expectedTop(f) {
  const r = resolveHardware(f);
  const set = r.state !== 'unset';
  const top = r.head === 'raised-countersunk' ? r.domeHeight : HEAD_STYLES[r.head].flush ? 0 : r.headHeight;
  if (r.kind === 'blind-rivet-stud') return top + r.threadLength;
  if (r.kind === 'push-rivet') return r.headHeight + 0.35 * r.diameter + (set ? 0 : r.mandrelLength);
  if (r.kind === 'blind-drive') return top + (set ? 0.1 : r.mandrelLength);
  if (MANDREL.includes(r.kind) && !set) return top + r.mandrelLength;
  if (RECESSED.includes(r.kind) && CAPS.includes(r.head))
    return capZ(r.headDiameter, r.headHeight, r.mandrelDiameter / 2);
  if (r.kind === 'tubular' && CAPS.includes(r.head)) return capZ(r.headDiameter, r.headHeight, r.boreDiameter / 2);
  return top;
}
// zmin of spec §4: −(g + h) set, −(L + 0.6·dm) for the mandrel-headed kinds
// as supplied, else −L.
function expectedBottom(f) {
  const r = resolveHardware(f);
  if (r.state === 'unset') return MANDREL_HEAD.includes(r.kind) ? -(r.length + 0.6 * r.mandrelDiameter) : -r.length;
  return UPSET_TO_TAIL.includes(r.kind) ? -r.length : -(r.grip + r.bulbHeight);
}
// x extent: the petal / leg span, the lockbolt collar flange (2.1·d), else
// the head (the push rivet's head is 2.5·d = headDiameter).
function expectedWidth(f) {
  const r = resolveHardware(f);
  if (r.state !== 'unset' && ['blind-peel', 'split'].includes(r.kind)) return r.bulbDiameter;
  if (r.state !== 'unset' && r.kind === 'lockbolt') return 2.1 * r.diameter;
  return r.headDiameter;
}

describe('every kind at its default size, default head', () => {
  const set = kinds.map((kind) => hardwareDefaults(kind));
  const unset = set.map((f) => withState(f, 'unset'));
  let built, supplied;
  beforeAll(() => {
    built = build(set);
    supplied = build(unset);
  }, 120000);
  afterAll(() => {
    built?.dispose();
    supplied?.dispose();
  });

  it('builds a solid for each of the 15 kinds, installed and as supplied', () => {
    expect(built.snapshot.parts).toHaveLength(15);
    expect(supplied.snapshot.parts).toHaveLength(15);
    kinds.forEach((kind, i) => {
      expect(built.part(i).volume, `${kind} set`).toBeGreaterThan(0);
      expect(supplied.part(i).volume, `${kind} unset`).toBeGreaterThan(0);
    });
  });
  it('set: the head top, the upset bottom and the width of spec §4', () => {
    kinds.forEach((kind, i) => {
      const [min, max] = built.part(i).bounds;
      expect(max[2], `${kind} top`).toBeCloseTo(expectedTop(set[i]), 3);
      expect(min[2], `${kind} bottom`).toBeCloseTo(expectedBottom(set[i]), 3);
      expect(max[0] - min[0], `${kind} x extent`).toBeCloseTo(expectedWidth(set[i]), 3);
    });
    // The literal tops of §4 where nothing is recessed.
    const top = (kind) => built.part(kinds.indexOf(kind)).bounds[1][2];
    expect(top('solid')).toBeCloseTo(set[kinds.indexOf('solid')].headHeight, 3);
    expect(top('self-piercing')).toBeCloseTo(0, 3);
    expect(top('blind-rivet-stud')).toBeCloseTo(1.5 + 16, 3);
    expect(top('push-rivet')).toBeCloseTo(1.2 + 0.35 * 6, 3);
    expect(top('blind-drive')).toBeCloseTo(2.06 + 0.1, 3);
    expect(top('lockbolt')).toBeCloseTo(2.56, 3);
    // The recess takes the dome's apex: below k, above the recess floor.
    expect(top('blind-open')).toBeLessThan(1.5);
    expect(top('blind-open')).toBeGreaterThan(0.6 * 1.5);
  });
  it('unset: the mandrel / pin above the head, the mandrel head under the body', () => {
    kinds.forEach((kind, i) => {
      const [min, max] = supplied.part(i).bounds;
      expect(max[2], `${kind} top`).toBeCloseTo(expectedTop(unset[i]), 3);
      expect(min[2], `${kind} bottom`).toBeCloseTo(expectedBottom(unset[i]), 3);
      expect(max[0] - min[0], `${kind} x extent`).toBeCloseTo(expectedWidth(unset[i]), 3);
    });
    expect(supplied.part(0).bounds[0][2]).toBeCloseTo(-(10 + 0.6 * 2.95), 3);
    expect(supplied.part(0).bounds[1][2]).toBeCloseTo(1.5 + 27, 3);
  });
  // The pulled-mandrel kinds: the mandrel is discarded on setting. (The drive
  // and push rivets keep their pin in both states, and their set flare adds
  // envelope, so they are not compared.)
  it('the mandrel makes every pulled-mandrel kind heavier as supplied', () => {
    RECESSED.forEach((kind) => {
      const i = kinds.indexOf(kind);
      expect(built.part(i).volume, kind).toBeLessThan(supplied.part(i).volume);
    });
  });
});

describe('specific solids', () => {
  it('the hexagon rivet nut M6: 10.39 across the corners (X) and 9 across the flats (Y) over the grip', () => {
    const round = hardwareDefaults('blind-rivet-nut', 'M6');
    const hex = withBody(round, 'hex');
    expect(hex).toMatchObject({ body: 'hex', bodyDiameter: 9, bulbDiameter: 11.7 });
    // A slab of the body: inside the grip (−g … 0) and inside the bulge.
    const slab = (z0, z1) => (shape, own) =>
      own(own(shape.intersect(own(cad.makeBox([-20, -20, z0], [20, 20, z1])))).boundingBox).bounds;
    const span = ([min, max]) => [max[0] - min[0], max[1] - min[1]];
    const g = hex.grip,
      h = hex.bulbHeight;
    const grip = (f) => span(solidOf(f, slab(-g + 0.2, -0.2)).probe);
    const bulge = (f) => span(solidOf(f, slab(-g - 0.6 * h, -g - 0.4 * h)).probe);
    // hexPrism puts a corner on +X (the Phase J orientation).
    const [hx, hy] = grip(hex);
    expect(hx).toBeCloseTo((2 * 9) / Math.sqrt(3), 3);
    expect(hy).toBeCloseTo(9, 3);
    const [rx, ry] = grip(round);
    expect(rx).toBeCloseTo(9, 3);
    expect(ry).toBeCloseTo(9, 3);
    for (const f of [round, hex]) bulge(f).forEach((w) => expect(w).toBeCloseTo(11.7, 3));
    // The thread bore runs through both.
    const core = (shape, own) => cad.measureVolume(own(shape.intersect(own(cad.makeCylinder(1, 40, [0, 0, -20])))));
    expect(solidOf(hex, core).probe).toBeLessThan(1e-6);
    expect(solidOf(withState(hex, 'unset'), core).probe).toBeLessThan(1e-6);
  });
  it('the tubular rivet is hollow along its axis; the semi-tubular one is not', () => {
    const axis = (shape, own) => cad.measureVolume(own(shape.intersect(own(cad.makeCylinder(0.3, 60, [0, 0, -30])))));
    const tubular = hardwareDefaults('tubular', '4');
    for (const f of [tubular, withState(tubular, 'unset'), withHead(tubular, 'round')])
      expect(solidOf(f, axis).probe, `${f.head} ${f.state}`).toBeLessThan(1e-6);
    expect(solidOf(hardwareDefaults('semi-tubular', '4'), axis).probe).toBeGreaterThan(0.1);
    const solid = { ...hardwareDefaults('solid', '4'), headDiameter: 6, headHeight: 0.8, head: 'round' };
    expect(solidOf(tubular).volume).toBeLessThan(solidOf(solid).volume);
  });
  it('every head of the multi-head kinds builds, set and as supplied', () => {
    for (const kind of kinds.filter((k) => headsFor(k).length > 1))
      for (const head of headsFor(kind))
        for (const state of ['set', 'unset']) {
          const f = withState(withHead(hardwareDefaults(kind), head), state);
          const { volume, bounds } = solidOf(f);
          expect(volume, `${kind} ${head} ${state}`).toBeGreaterThan(0);
          expect(bounds[1][2], `${kind} ${head} ${state} top`).toBeCloseTo(expectedTop(f), 3);
          expect(bounds[0][2], `${kind} ${head} ${state} bottom`).toBeCloseTo(expectedBottom(f), 3);
        }
  });
  it('every kind × size × head × state (× body) builds with the Z extents of §4', () => {
    let count = 0;
    for (const kind of kinds)
      for (const size of sizesFor(kind))
        for (const head of headsFor(kind))
          for (const state of ['set', 'unset'])
            for (const body of kind.startsWith('blind-rivet-') ? ['round', 'hex'] : [null]) {
              let f = withState(withHead(hardwareDefaults(kind, size), head), state);
              if (body) f = withBody(f, body);
              const label = `${kind} ${size} ${head} ${state} ${body || ''}`;
              const { volume, bounds } = solidOf(f);
              expect(volume, label).toBeGreaterThan(0);
              expect(bounds[1][2], `${label} top`).toBeCloseTo(expectedTop(f), 3);
              expect(bounds[0][2], `${label} bottom`).toBeCloseTo(expectedBottom(f), 3);
              count++;
            }
    expect(count).toBe(526);
  }, 60000);
  it('a saved rivet without state / grip / bulb fields builds with the kind defaults', () => {
    const full = hardwareDefaults('blind-open', '4.8');
    const { state, grip, bulbDiameter, bulbHeight, mandrelDiameter, mandrelLength, head, ...old } = full;
    const a = solidOf(full),
      b = solidOf(old);
    expect(b.volume).toBeCloseTo(a.volume, 6);
    expect(b.bounds).toEqual(a.bounds);
    expect([state, grip, bulbDiameter, bulbHeight, mandrelDiameter, mandrelLength, head]).toEqual([
      'set',
      5,
      7.2,
      3.12,
      2.95,
      27,
      'dome',
    ]);
  });
});

describe('downstream', () => {
  // The Phase M / N kernel fixture: a 100 × 80 × 10 plate with a 3-hole row.
  const plate = { id: 'base', type: 'box', width: 100, depth: 80, height: 10 };
  const rowHole = (row) => ({
    id: 'row',
    type: 'hole',
    diameter: 6,
    depth: 5,
    throughAll: true,
    position: [20, 40, 10],
    direction: [0, 0, -1],
    row,
  });
  const fixture = (features) => ({
    ...emptyModel(),
    parts: [{ id: 'p', name: 'Test part', features }],
    instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
  });
  it('seats a countersunk-120 blind rivet 4.8 in hole 2 of a 3-hole row; its BOM note names ISO 15977 and the grip', () => {
    const model = fixture([plate, rowHole({ count: 3, pitch: 30, direction: [1, 0, 0] })]);
    const { part, instance } = createHardware(withHead(hardwareDefaults('blind-open', '4.8'), 'countersunk-120'));
    model.parts.push(part);
    model.instances.push({ ...instance, position: [5, -50, 40] });
    model.connections.push({
      id: 'seat',
      type: 'concentric',
      from: instance.id,
      to: 'i',
      fromFeatureId: part.features[0].id,
      toFeatureId: 'row',
      holeIndex: 1,
      offset: 0,
    });
    const session = createKernelSession(model);
    try {
      const snapshot = session.snapshot();
      const placed = snapshot.instances.find((x) => x.id === instance.id);
      const origin = mapPlacement([0, 0, 0], placed.placement);
      [50, 40, 10].forEach((v, i) => expect(origin[i]).toBeCloseTo(v, 4));
      // The 120° rim is flush with the plate top; the bulb is at −(g + h).
      expect(placed.bounds[1][2]).toBeCloseTo(10, 3);
      expect(placed.bounds[0][2]).toBeCloseTo(10 - (5 + 3.12), 3);
      const row = buildCutList(model, snapshot).find((r) => r.partId === part.id);
      expect(row).toMatchObject({ name: 'Blind rivet, open end (pop rivet) 4.8', quantity: 1 });
      expect(row.note).toContain('ISO 15977');
      expect(row.note).toContain('Countersunk 120° (blind rivet) head');
      expect(row.note).toContain('grip 5 mm, installed');
    } finally {
      session.dispose();
    }
  });
  it('a set blind rivet renders on a drawing sheet', () => {
    const model = rearCoverExample();
    const { part, instance } = createHardware(hardwareDefaults('blind-open', '4.8'));
    model.parts.push(part);
    model.instances.push({ ...instance, position: [500, 0, 0] });
    const session = createKernelSession(model);
    try {
      const snapshot = session.snapshot();
      const sheet = session.drawings({ includeParts: true }).find((d) => d.partId === part.id);
      expect(sheet).toBeTruthy();
      const svg = sheetSvg(sheet, model, snapshot);
      expect(svg.length).toBeGreaterThan(0);
      expect(svg).toContain('Blind rivet, open end (pop rivet) 4.8');
    } finally {
      session.dispose();
    }
  });
});
