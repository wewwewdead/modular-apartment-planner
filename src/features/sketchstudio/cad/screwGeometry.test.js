// Phase N (docs/sketch-studio-screw-library.md §10): the 22 screw kinds as
// real OpenCascade solids on the seating-plane contract.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { emptyModel } from './model.js';
import { createKernelSession } from './kernel.js';
import {
  SCREW_KINDS,
  createHardware,
  hardwareDefaults,
  resolveHardware,
  withDrive,
  withHead,
  withPoint,
} from './hardware.js';
import { sheetSvg } from './drawings.js';
import { rearCoverExample } from './rearCover.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

// Builds features as parts of one model; returns { part(i), dispose }.
function build(features) {
  const items = features.map((f) => createHardware(f));
  const model = { ...emptyModel(), parts: items.map((i) => i.part), instances: items.map((i) => i.instance) };
  const session = createKernelSession(model);
  const snapshot = session.snapshot();
  return { model, items, snapshot, part: (i) => snapshot.parts[i], dispose: () => session.dispose() };
}
const plain = (f) => withDrive(f, 'none');
// The head top of spec §10: k, h, c + k, d2, f, k + dome.
function headTop(f) {
  const r = resolveHardware(f);
  switch (r.head) {
    case 'countersunk':
    case 'bugle':
    case 'none':
      return 0;
    case 'raised-countersunk':
      return r.domeHeight;
    case 'fillister':
      return r.headHeight + r.domeHeight;
    case 'knurled-high':
      return r.collarHeight + r.headHeight;
    case 'eye':
      return r.headDiameter;
    default:
      return r.headHeight;
  }
}

describe('every kind at its default size', () => {
  const kinds = Object.keys(SCREW_KINDS);
  const defaults = kinds.map((kind) => hardwareDefaults(kind));
  let built, bare;
  beforeAll(() => {
    built = build(defaults);
    // The same screws without a recess: a recess cuts a dome's apex away.
    bare = build(defaults.map(plain));
  }, 120000);
  afterAll(() => {
    built?.dispose();
    bare?.dispose();
  });

  it('builds a solid for each of the 22 kinds', () => {
    expect(built.snapshot.parts).toHaveLength(22);
    built.snapshot.parts.forEach((p, i) => expect(p.volume, kinds[i]).toBeGreaterThan(0));
  });
  it('puts the head on the seating plane and the tip at −length', () => {
    kinds.forEach((kind, i) => {
      const f = defaults[i];
      const [min, max] = bare.part(i).bounds;
      expect(max[2], `${kind} head top`).toBeCloseTo(headTop(f), 3);
      const tip = kind === 'shoulder' ? -(f.length + f.threadLength) : -f.length;
      expect(min[2], `${kind} tip`).toBeCloseTo(tip, 3);
      expect(built.part(i).bounds[0][2], `${kind} tip with its drive`).toBeCloseTo(tip, 3);
    });
  });
  it('tops flush heads and the set screw out at Z = 0, with their drive cut', () => {
    for (const kind of ['countersunk-socket', 'countersunk-machine', 'tapping-countersunk', 'drywall', 'set-screw']) {
      const i = kinds.indexOf(kind);
      expect(built.part(i).bounds[1][2], kind).toBeCloseTo(0, 3);
    }
    // Flat-topped heads keep their top with the recess.
    for (const kind of ['socket-cap', 'cheese-head', 'hex-flange', 'lag', 'shoulder']) {
      const i = kinds.indexOf(kind);
      expect(built.part(i).bounds[1][2], kind).toBeCloseTo(defaults[i].headHeight, 3);
    }
  });
  it('spans the head widths: wing span, dk of pan / button / cheese, the eye thickness', () => {
    const width = (kind, axis = 0) => {
      const [min, max] = built.part(kinds.indexOf(kind)).bounds;
      return max[axis] - min[axis];
    };
    expect(width('wing')).toBeCloseTo(hardwareDefaults('wing').headDiameter, 3);
    for (const kind of ['pan-head', 'button-head', 'cheese-head'])
      expect(width(kind), kind).toBeCloseTo(hardwareDefaults(kind).headDiameter, 3);
    expect(width('eye-bolt')).toBeCloseTo(hardwareDefaults('eye-bolt').headDiameter, 3);
    expect(width('eye-bolt', 1)).toBeCloseTo(hardwareDefaults('eye-bolt').headHeight, 3);
  });
  it('a recess removes material', () => {
    kinds.forEach((kind, i) => {
      if (defaults[i].drive === 'none') return;
      expect(built.part(i).volume, kind).toBeLessThan(bare.part(i).volume);
    });
  });
});

describe('specific solids', () => {
  it('drive none is heavier than a hex socket (socket cap M6)', () => {
    const cap = hardwareDefaults('socket-cap', 'M6');
    const b = build([cap, plain(cap)]);
    try {
      expect(b.part(1).volume).toBeGreaterThan(b.part(0).volume);
      // Security Torx: the pin puts some of the star back.
      const t = build([withDrive(cap, 'torx'), withDrive(cap, 'pin-torx')]);
      expect(t.part(1).volume).toBeGreaterThan(t.part(0).volume);
      t.dispose();
    } finally {
      b.dispose();
    }
  });
  it('the bugle head is concave: less volume than the straight cone of the same dk, k, d', () => {
    const bugle = plain(hardwareDefaults('drywall', '3.5'));
    // The same envelope as a countersunk wood screw 3.5.
    const cone = plain({
      ...hardwareDefaults('wood', '3.5'),
      headDiameter: bugle.headDiameter,
      headHeight: bugle.headHeight,
      length: bugle.length,
      diameter: bugle.diameter,
    });
    const b = build([bugle, cone]);
    try {
      expect(b.part(0).volume).toBeLessThan(b.part(1).volume);
      expect(b.part(0).bounds[1][0]).toBeCloseTo(b.part(1).bounds[1][0], 3);
    } finally {
      b.dispose();
    }
  });
  it('the carriage bolt square neck adds material', () => {
    const carriage = hardwareDefaults('carriage', 'M8');
    const b = build([carriage, { ...carriage, neckHeight: 0.01 }]);
    try {
      expect(b.part(0).volume).toBeGreaterThan(b.part(1).volume);
      expect(b.part(0).bounds[1][0] - b.part(0).bounds[0][0]).toBeCloseTo(20, 3);
    } finally {
      b.dispose();
    }
  });
  it('set-screw points: cone < cup < flat; the dog is body + dog cylinder', () => {
    const set = plain(hardwareDefaults('set-screw', 'M6'));
    const points = ['cone', 'flat', 'dog', 'cup'].map((point) => withPoint(set, point));
    const b = build(points);
    try {
      const [cone, flat, dog, cup] = [0, 1, 2, 3].map((i) => b.part(i).volume);
      expect(cone).toBeLessThan(flat);
      expect(cup).toBeLessThan(flat);
      expect(cone).toBeLessThan(cup);
      // Tip at Z = −length in every case (spec §2.3): body 0 … −(L − z), dog Ø dp × z.
      const { length: L, neckHeight: z, bodyDiameter: dp } = points[2];
      expect(dog).toBeCloseTo(Math.PI * 9 * (L - z) + Math.PI * (dp / 2) ** 2 * z, 3);
      b.snapshot.parts.forEach((p) => expect(p.bounds[0][2]).toBeCloseTo(-L, 3));
    } finally {
      b.dispose();
    }
  });
  it('every head of the multi-head kinds builds', () => {
    const features = [
      ...['countersunk', 'raised-countersunk', 'round'].map((h) => withHead(hardwareDefaults('wood'), h)),
      ...['countersunk', 'raised-countersunk', 'pan'].map((h) => withHead(hardwareDefaults('chipboard'), h)),
      ...['hex-washer', 'pan', 'countersunk'].map((h) => withHead(hardwareDefaults('self-drilling'), h)),
      ...['hex', 'hex-washer'].map((h) => withHead(hardwareDefaults('lag'), h)),
      ...['knurled-high', 'knurled-low'].map((h) => withHead(hardwareDefaults('thumb'), h)),
      ...['cheese', 'fillister'].map((h) => withHead(hardwareDefaults('cheese-head'), h)),
      withHead(hardwareDefaults('tapping-countersunk'), 'raised-countersunk'),
      ...['slot', 'phillips', 'torx', 'square', 'spanner', 'one-way'].map((d) =>
        withDrive(hardwareDefaults('pan-head'), d),
      ),
    ];
    const b = build(features);
    try {
      b.snapshot.parts.forEach((p, i) =>
        expect(p.volume, `${features[i].kind} ${features[i].head}`).toBeGreaterThan(0),
      );
      // The lag washer face is 1.6 · s wide.
      expect(b.part(10).bounds[1][0] * 2).toBeCloseTo(1.6 * 13, 3);
      // The low thumb screw has no shoulder: its top is the knurl height.
      expect(b.part(12).bounds[1][2]).toBeCloseTo(5, 3);
    } finally {
      b.dispose();
    }
  });
});

describe('downstream', () => {
  it('a Torx pan head renders on a drawing sheet', () => {
    const model = rearCoverExample();
    const { part, instance } = createHardware(withDrive(hardwareDefaults('pan-head', 'M6'), 'torx'));
    model.parts.push(part);
    model.instances.push({ ...instance, position: [500, 0, 0] });
    const session = createKernelSession(model);
    try {
      const snapshot = session.snapshot();
      const sheet = session.drawings({ includeParts: true }).find((d) => d.partId === part.id);
      expect(sheet).toBeTruthy();
      const svg = sheetSvg(sheet, model, snapshot);
      expect(svg.length).toBeGreaterThan(0);
      expect(svg).toContain('Pan head machine screw M6');
    } finally {
      session.dispose();
    }
  });
});
