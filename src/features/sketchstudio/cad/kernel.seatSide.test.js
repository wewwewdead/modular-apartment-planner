// Phase Q (docs/sketch-studio-hardware-seat-side.md §6.1) through the real
// kernel: every hole's far opening is measured on the solid it is cut from
// (metrics `exits`), and a concentric connection with side: 'far' seats the
// hardware on it, facing back up the hole.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createPart, emptyModel } from './model.js';
import { createCutFeature } from './cutPlacement.js';
import { createKernelSession } from './kernel.js';
import { createHardware, hardwareDefaults, hardwareDimensions } from './hardware.js';
import { mapPlacement } from './placement.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);
const close = (actual, expected, digits = 6) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
};
const fixture = (features) => ({
  ...emptyModel(),
  parts: [{ id: 'p', name: 'Board', features }],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
});
// A 10 mm board, holes drilled from its top face (z = 10) down.
const board = { id: 'base', type: 'box', width: 100, depth: 80, height: 10 };
const topHole = (extra = {}) => ({
  id: 'h',
  type: 'hole',
  diameter: 6.6,
  depth: 5,
  throughAll: true,
  position: [30, 40, 10],
  direction: [0, 0, -1],
  ...extra,
});
const SHANK = hardwareDimensions(hardwareDefaults('socket-cap', 'M6')).length;
const metricsOf = (model, partId = 'p', featureId = 'h') => {
  const session = createKernelSession(model);
  try {
    return session.snapshot().parts.find((p) => p.id === partId).features[featureId];
  } finally {
    session.dispose();
  }
};
// A socket cap screw M6 posed anywhere and seated by a concentric connection
// to hole `h` (the connection patch: side, holeIndex, offset); the seat
// origin (local Z = 0, the underside of the head), the shank direction
// (local -Z) and the world bounds.
function seated(features, patch = {}) {
  const model = fixture(features);
  const { part, instance } = createHardware(hardwareDefaults('socket-cap', 'M6'));
  model.parts.push(part);
  model.instances.push({ ...instance, position: [5, -60, 40], rotation: [30, 0, 0] });
  model.connections.push({
    id: 'seat',
    type: 'concentric',
    from: instance.id,
    to: 'i',
    fromFeatureId: part.features[0].id,
    toFeatureId: 'h',
    offset: 0,
    ...patch,
  });
  const session = createKernelSession(model);
  try {
    const placed = session.snapshot().instances.find((x) => x.id === instance.id);
    return {
      origin: mapPlacement([0, 0, 0], placed.placement),
      shank: mapPlacement([0, 0, -1], placed.placement, true),
      bounds: placed.bounds,
    };
  } finally {
    session.dispose();
  }
}

describe('far openings (metrics exits)', () => {
  it('a through hole in a 10 mm board comes out at 10 mm', () => {
    const metrics = metricsOf(fixture([board, topHole()]));
    expect(metrics.exits).toHaveLength(1);
    expect(metrics.exits[0]).toBeCloseTo(10, 6);
    // The through-all tool runs past it (to the bounding box + 0.01).
    expect(metrics.cut.depth).toBeGreaterThan(metrics.exits[0]);
  });

  it('a blind hole that stops in the material has none', () => {
    const metrics = metricsOf(fixture([board, topHole({ throughAll: false, depth: 6 })]));
    expect(metrics.exits).toEqual([null]);
  });

  it('a hole exactly as deep as the board is through', () => {
    const metrics = metricsOf(fixture([board, topHole({ throughAll: false, depth: 10 })]));
    expect(metrics.exits[0]).toBeCloseTo(10, 6);
  });

  it('a row: one exit per centre', () => {
    const row = { count: 4, pitch: 15, direction: [1, 0, 0] };
    const metrics = metricsOf(fixture([board, topHole({ row })]));
    expect(metrics.row.centres).toHaveLength(4);
    expect(metrics.exits).toHaveLength(4);
    metrics.exits.forEach((exit) => expect(exit).toBeCloseTo(10, 6));
  });

  it('an angle bar 50×50×5: a through-all hole in one leg comes out at 5, not at the 50 mm box', () => {
    // Drilled up from under the bottom leg (y = -25 → +y): the tool runs to
    // the box's far side, 50 mm, through the 5 mm leg.
    const created = createPart('angle');
    const hole = {
      id: 'h',
      type: 'hole',
      diameter: 6.6,
      throughAll: true,
      position: [0, -25, 350],
      direction: [0, 1, 0],
    };
    created.part.features.push(hole);
    const model = { ...emptyModel(), parts: [created.part], instances: [created.instance] };
    const metrics = metricsOf(model, created.part.id, 'h');
    expect(metrics.cut.depth).toBeCloseTo(50.01, 6);
    expect(metrics.exits[0]).toBeCloseTo(5, 5);
  });

  it('the default member-placed hole of the Angle bar comes out of the leg it drills, from every side', () => {
    for (const side of ['front', 'rear', 'left', 'right']) {
      const created = createPart('angle');
      const cut = createCutFeature('hole', created.part);
      cut.placement.side = side;
      created.part.features.push(cut);
      const model = { ...emptyModel(), parts: [created.part], instances: [created.instance] };
      const metrics = metricsOf(model, created.part.id, cut.id);
      expect(metrics.exits).toHaveLength(1);
      expect(metrics.exits[0]).toBeCloseTo(5, 5);
    }
  });

  it('an SHS tube: a hole through both walls comes out of the far outer wall', () => {
    const created = createPart('member'); // 40 × 40 × 2
    const cut = createCutFeature('hole', created.part);
    created.part.features.push(cut);
    const model = { ...emptyModel(), parts: [created.part], instances: [created.instance] };
    const metrics = metricsOf(model, created.part.id, cut.id);
    expect(metrics.exits[0]).toBeCloseTo(40, 5);
  });

  it('pockets carry no exits', () => {
    const pocket = {
      id: 'k',
      type: 'pocket',
      shape: 'rectangle',
      width: 10,
      height: 10,
      depth: 2,
      position: [60, 40, 10],
      direction: [0, 0, -1],
    };
    expect(metricsOf(fixture([board, pocket]), 'p', 'k').exits).toBeUndefined();
  });
});

describe("the side: 'far' concentric seat", () => {
  it('drill side (no key): the head on the top face, the shank down — as before', () => {
    const top = seated([board, topHole()]);
    close(top.origin, [30, 40, 10], 4);
    close(top.shank, [0, 0, -1], 6);
    // The head stands on the top face, the shank runs down.
    expect(top.bounds[0][2]).toBeCloseTo(10 - SHANK, 3);
  });

  it('far side: the head on the bottom face, the shank pointing up into the board', () => {
    const far = seated([board, topHole()], { side: 'far' });
    close(far.origin, [30, 40, 0], 4);
    close(far.shank, [0, 0, 1], 6);
    // Head below the board, the shank up into it.
    expect(far.bounds[1][2]).toBeCloseTo(SHANK, 3);
    expect(far.bounds[0][2]).toBeLessThan(0);
  });

  it('a positive offset sinks the hardware deeper into the hole on both sides', () => {
    const top = seated([board, topHole()], { offset: 2 });
    close(top.origin, [30, 40, 8], 4);
    const far = seated([board, topHole()], { side: 'far', offset: 2 });
    close(far.origin, [30, 40, 2], 4);
  });

  it('hole 3 of a row, far side', () => {
    const row = { count: 4, pitch: 15, direction: [1, 0, 0] };
    const far = seated([board, topHole({ row })], { side: 'far', holeIndex: 2 });
    close(far.origin, [60, 40, 0], 4);
    close(far.shank, [0, 0, 1], 6);
  });

  it('on a turned instance the far seat follows the pose', () => {
    const model = (features) => ({
      ...fixture(features),
      instances: [{ id: 'i', partId: 'p', position: [200, 0, 0], rotation: [180, 0, 0] }],
    });
    const { part, instance } = createHardware(hardwareDefaults('socket-cap', 'M6'));
    const m = model([board, topHole()]);
    m.parts.push(part);
    m.instances.push(instance);
    m.connections.push({
      id: 'seat',
      type: 'concentric',
      from: instance.id,
      to: 'i',
      fromFeatureId: part.features[0].id,
      toFeatureId: 'h',
      side: 'far',
      offset: 0,
    });
    const session = createKernelSession(m);
    try {
      const placed = session.snapshot().instances.find((x) => x.id === instance.id);
      // Turned over about X: the board's bottom (z = 0) is now its top (z = 0
      // still, the board hangs below it), and the far seat looks up.
      close(mapPlacement([0, 0, 0], placed.placement), [230, -40, 0], 4);
      close(mapPlacement([0, 0, -1], placed.placement, true), [0, 0, -1], 6);
    } finally {
      session.dispose();
    }
  });

  it('a blind hole has no far opening: the build names it', () => {
    expect(() => seated([board, topHole({ throughAll: false, depth: 6 })], { side: 'far' })).toThrow(
      'The hole on Board has no far opening for Socket head cap screw M6: seat it on the drill side or make the hole go through.',
    );
  });

  it('only a hole has a far side', () => {
    const model = fixture([board]);
    const pin = { id: 'pin-part', name: 'Pin', features: [{ id: 'axis', type: 'cylinder', radius: 3, length: 20 }] };
    model.parts.push(pin);
    model.instances.push({ id: 'pin', partId: 'pin-part', position: [0, 0, 0], rotation: [0, 0, 0] });
    model.instances.push({ id: 'pin2', partId: 'pin-part', position: [50, 0, 0], rotation: [0, 0, 0] });
    model.connections.push({
      id: 'c',
      type: 'concentric',
      from: 'pin2',
      to: 'pin',
      fromFeatureId: 'axis',
      toFeatureId: 'axis',
      side: 'far',
      offset: 0,
    });
    expect(() => createKernelSession(model)).toThrow('Only a hole has a far side to seat on: axis');
  });
});
