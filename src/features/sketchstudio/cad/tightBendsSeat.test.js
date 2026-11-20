// The line finds the bend (docs/sketch-studio-tight-bends.md §7, TB-3): a
// punch line along a made bend within half the V of the hit's die IS that
// bend's line (the seat, §7.3); the refusals that remain say what is wrong in
// the brake's words, by the step number, and carry "Bend {n} on instead"
// (§7.4 (c)). §7.2's table as assertions through brakePatch with the station,
// the fold's crossing data (§7.4 (a)), bendOnKey, and the hands' readout (f).
import { describe, expect, it } from 'vitest';
import { strokeBends } from './sheetMetal.js';
import {
  bendAlong,
  bendOnKey,
  bendOnPatch,
  brakePatch,
  brakeSessionDefaults,
  brakeStation,
  seatOf,
  seatReach,
} from './brakeStation.js';
import { fingerOffer, fingerReadout, fingerRestore } from './brakeHands.js';
import { gaugeEdges } from './pressBrake.js';
import { emptyModel } from './model.js';

// §7.2: the 605.4 × 420.4 blank, t 1.2 SPCC, bend 1 made at L 29 from the right
// edge to 45° with the straight punch and the automatic die (V8 88°).
const W = 605.4,
  H = 420.4;
const BLANK = { type: 'rectangle', width: W, height: H, origin: [0, 0] };
const feature = (bends = [], thickness = 1.2) => ({
  id: 'f',
  type: 'sheetmetal',
  sketchId: 's',
  thickness,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends,
});
const line = (id, fromRight, angle = 90, extra = {}) => ({
  id,
  a: [W - fromRight, 0],
  b: [W - fromRight, H],
  angle,
  direction: 'up',
  radius: null,
  punch: 'straight-88',
  ...extra,
});
const modelOf = (bends, profile = BLANK, thickness = 1.2) => {
  const model = emptyModel();
  model.sketches = [{ id: 's', name: 'S', plane: 'XY', profile, primitives: [], constrained: false }];
  model.parts = [{ id: 'p', name: 'Tray', features: [feature(bends, thickness)] }];
  model.instances = [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }];
  return model;
};
const EDGES = gaugeEdges([
  [0, 0],
  [W, 0],
  [W, H],
  [0, H],
]);
const RIGHT = EDGES.findIndex((e) => Math.abs(e.a[0] - W) < 1e-6 && Math.abs(e.b[0] - W) < 1e-6);
const LEFT = EDGES.findIndex((e) => Math.abs(e.a[0]) < 1e-6 && Math.abs(e.b[0]) < 1e-6);
const session = (extra = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  mode: 'gauge',
  edge: RIGHT,
  distance: 100,
  ...extra,
});
const MADE = () => modelOf([line('b1', 29, 45)]);
// A pick as the workspace applies it (changeBrake: brakePatch with the station of the session before).
const pick = (model, patch, before = session()) => {
  const station = brakeStation({ model, session: before, advise: false });
  const after = brakePatch(before, patch, station);
  return { session: after, station: brakeStation({ model, session: after, advise: false }) };
};
const clear = (pending) => Boolean(pending) && !pending.error && !pending.refusals.length && !pending.collision.hit;

describe('the seat (§7.3, §7.2’s table)', () => {
  it('on the bend’s line to 0.05 mm: bend 1 on as before, nothing seated', () => {
    for (const L of [29, 29.04]) {
      const { session: s, station } = pick(MADE(), { distance: L });
      expect(s.distance).toBe(L);
      expect('seated' in s).toBe(false);
      expect(station.pending.again).toMatchObject({ bendIds: ['b1'], from: 45, to: 90, number: 1 });
      expect(clear(station.pending)).toBe(true);
    }
  });
  it('L 29.1 … 33 (within V8 / 2) seats on bend 1: L 29, bend 1 on 45° → 90°, clear', () => {
    for (const L of [29.1, 29.4, 30, 31, 32, 32.9, 33]) {
      const { session: s, station } = pick(MADE(), { distance: L });
      expect(s.distance).toBe(29);
      expect(s.edge).toBe(RIGHT);
      expect(s.seated.number).toBe(1);
      expect(s.seated.from).toBe(L);
      expect(s.seated.off).toBeCloseTo(L - 29, 9);
      expect(station.pending.again).toMatchObject({ bendIds: ['b1'], from: 45, to: 90, number: 1 });
      expect(clear(station.pending)).toBe(true);
    }
    // From the edge side too: L 25 is 4 mm short of the bend.
    expect(pick(MADE(), { distance: 25 }).session.distance).toBe(29);
  });
  it('L 34 does not seat: the short-leg refusal stands, with Bend 1 on instead; L 37 is a new bend', () => {
    // Typed, L 34 is past the seat and reads off bend 1's flange (docs/sketch-studio-skin-gauge.md
    // §4.4): 34 from its skin, the line flat 34 + 16.678 (the 45° flange's take-up) from the edge.
    const typed = pick(MADE(), { distance: 34 });
    expect([typed.session.distance, typed.session.stop, 'seated' in typed.session]).toEqual([34, 'b1', false]);
    expect(typed.station.flat).toBeCloseTo(50.678, 3);
    expect(typed.station.gauge.distance).toBeCloseTo(34, 6);
    expect(clear(typed.station.pending)).toBe(true);
    // The line at flat 34 (a session set without brakePatch, as the net meets one): the short leg.
    const s = session({ distance: 34 });
    const station = brakeStation({ model: MADE(), session: s, advise: false });
    expect([s.distance, 'seated' in s]).toEqual([34, false]);
    const { pending } = station;
    expect(pending.again).toBeUndefined();
    const short = pending.refusals.find((r) => r.code === 'short-leg');
    expect(short.message).toMatch(/^The flange is 4\.29 mm from the punch line in the flat; the V8 88° die needs/);
    expect(pending.seat).toEqual({ key: 'b1', number: 1, off: expect.any(Number), label: 'Bend 1 on instead' });
    expect(pending.seat.off).toBeCloseTo(5, 9);
    const far = pick(MADE(), { distance: 37 });
    expect([far.session.distance, far.station.pending.again, far.station.pending.seat]).toEqual([
      37,
      undefined,
      undefined,
    ]);
    expect(clear(far.station.pending)).toBe(true);
  });
  it('off the left edge: L 576.4 is bend 1’s line, L 576 seats on it, the left edge kept', () => {
    const exact = pick(MADE(), { edge: LEFT, distance: 576.4 });
    expect('seated' in exact.session).toBe(false);
    expect(exact.station.pending.again.number).toBe(1);
    const { session: s, station } = pick(MADE(), { edge: LEFT, distance: 576 });
    expect([s.edge, s.distance]).toEqual([LEFT, 576.4]);
    expect(s.seated).toEqual({ number: 1, off: expect.any(Number), from: 576 });
    expect(s.seated.off).toBeCloseTo(0.4, 9);
    expect(station.gauge.distance).toBeCloseTo(576.4, 9);
    expect(clear(station.pending)).toBe(true);
  });
  it('two points 0.2–0.3 mm off the line seat on it, point A kept at its end; points across do not', () => {
    const { session: s, station } = pick(MADE(), {
      mode: 'points',
      points: [
        [576.7, 5],
        [576.6, 415],
      ],
    });
    expect(s.points).toEqual([
      [576.4, 0],
      [576.4, H],
    ]);
    expect(s.seated).toEqual({ number: 1, off: expect.any(Number), from: null });
    expect(s.seated.off).toBeCloseTo(0.3, 2);
    expect(station.pending.again.number).toBe(1);
    const across = pick(MADE(), {
      mode: 'points',
      points: [
        [0, 200],
        [W, 200],
      ],
    });
    expect('seated' in across.session).toBe(false);
    expect(across.station.pending.error).toBe(
      'This line runs across bend 1, which is already made: the brake cannot bend across a formed bend.',
    );
    expect(across.station.pending.seat).toBeUndefined();
  });
  it('seats within half the V of the hit’s die: V6 to 3 mm only; a radius punch and Round never', () => {
    const v6 = session({ die: 'v6-88' });
    expect(seatReach({ thickness: 1.2 }, v6)).toBe(3);
    expect(pick(MADE(), { distance: 32 }, v6).session.distance).toBe(29);
    // Typed past the seat, L 32.1 reads off bend 1's flange (skin gauge §4.4); the line at flat
    // 32.1 (a session set without brakePatch) is the one the net meets.
    expect(pick(MADE(), { distance: 32.1 }, v6).session.stop).toBe('b1');
    const flat = session({ die: 'v6-88', distance: 32.1 });
    const past = { session: flat, station: brakeStation({ model: MADE(), session: flat, advise: false }) };
    expect([past.session.distance, 'seated' in past.session]).toEqual([32.1, false]);
    // Past the seat, never a dead end (§7.3): the leg is short for the V6, the bend is bent on instead.
    expect(past.station.pending.refusals.some((r) => r.code === 'short-leg')).toBe(true);
    expect(past.station.pending.seat?.label).toBe('Bend 1 on instead');
    for (const other of [session({ punch: 'radius-10', shape: 'round' }), session({ shape: 'round' })]) {
      expect(seatReach({ thickness: 1.2 }, other)).toBe(0);
      const { session: s } = pick(MADE(), { distance: 30 }, other);
      expect([s.distance, 'seated' in s]).toEqual([30, false]);
    }
    // The automatic die for the session's punch: V8 for 1.2 mm with the straight punch.
    expect(seatReach({ thickness: 1.2 }, session())).toBe(4);
  });
  it('`seated` is set, cleared by the next line, absent from a session that never seated, back with Esc', () => {
    const model = MADE();
    const seated = pick(model, { distance: 30 }).session;
    expect(seated.seated).toMatchObject({ number: 1, from: 30 });
    const moved = pick(model, { distance: 60 }, seated).session;
    expect([moved.distance, moved.seated]).toEqual([60, null]);
    const never = pick(model, { distance: 60 }).session;
    expect('seated' in never).toBe(false);
    // A segment toggled is the same line: the seat stands.
    expect(pick(model, { skip: [] }, seated).session.seated).toEqual(seated.seated);
    // Esc on a finger drag (brakeHands.js fingerRestore): the line and its note back as they were.
    const station = brakeStation({ model, session: moved, advise: false });
    const back = brakePatch(moved, fingerRestore(seated), station);
    expect([back.distance, back.seated]).toEqual([29, seated.seated]);
    const plain = brakePatch(moved, fingerRestore(never), station);
    expect(plain.seated).toBeUndefined();
  });
  it('the arrival rule runs on the seated line, and puts the angle back when the line moves on', () => {
    const model = MADE();
    const low = session({ angle: 20 });
    const { session: s } = pick(model, { distance: 31 }, low);
    expect([s.distance, s.angle, s.arrived]).toEqual([29, 90, { from: 20, set: 90 }]);
    const on = pick(model, { distance: 60 }, s).session;
    expect([on.angle, on.arrived, on.seated]).toEqual([20, null, null]);
    // An etched mark's patch names the angle: it seats all the same, the angle its own.
    const marked = pick(model, {
      mode: 'points',
      points: [
        [576.5, 0],
        [576.5, H],
      ],
      angle: 60,
    }).session;
    expect([marked.angle, marked.seated?.number, marked.points[0][0]]).toEqual([60, 1, 576.4]);
  });
  it('seatOf and bendAlong: the nearest bend wins; nothing to move on a made line', () => {
    const model = modelOf([line('b1', 29, 45), line('b2', 35, 45)]);
    const station = brakeStation({ model, session: session(), advise: false });
    const { fold, polygon } = station;
    // L 31.5 is 2.5 from bend 1 and 3.5 from bend 2: bend 1's line.
    const along = bendAlong(fold, polygon, { a: [W - 31.5, 0], b: [W - 31.5, H] }, [], 4);
    expect(along).toMatchObject({ bendIds: ['b1'], bendId: 'b1', number: 1 });
    expect(along.off).toBeCloseTo(2.5, 9);
    const near2 = seatOf(station, session({ distance: 33 }));
    expect([near2.number, near2.patch.distance]).toEqual([2, 35]);
    expect(seatOf(station, session({ distance: 29 }))).toBe(null);
    expect(seatOf(station, session({ distance: 200 }))).toBe(null);
    expect(seatOf(station, session({ edge: null }))).toBe(null);
  });
});

describe('the fold’s crossing refusal carries data (§7.4 (a))', () => {
  const crossing = (probe) => {
    try {
      strokeBends(feature([line('b1', 29, 45)]), BLANK, {}, probe);
      return null;
    } catch (error) {
      return { message: error.message, crossing: error.crossing };
    }
  };
  it('along for a parallel line in the zone, not for a line across; the text unchanged', () => {
    expect(crossing({ a: [W - 30, 0], b: [W - 30, H], angle: 90, direction: 'up' })).toEqual({
      message: 'Bend 2 crosses bend 1.',
      crossing: { bend: 1, other: 0, along: true },
    });
    expect(crossing({ a: [0, 200], b: [W, 200], angle: 90, direction: 'up' })).toEqual({
      message: 'Bend 2 crosses bend 1.',
      crossing: { bend: 1, other: 0, along: false },
    });
    // At a slant through the zone: across.
    expect(crossing({ a: [W - 26, 0], b: [W - 32, H], angle: 90, direction: 'up' }).crossing.along).toBe(false);
  });
});

describe('the net: a session that reaches the station unseated (§7.4 (c))', () => {
  const raw = (model, extra) => brakeStation({ model, session: session(extra), advise: false }).pending;
  it('along and off the line: too close for a new bend, Bend 1 on instead', () => {
    const pending = raw(MADE(), { distance: 30 });
    expect(pending.error).toBe(
      "This line is 1 mm from bend 1's line: too close for a new bend. To bend bend 1 further, bend it on.",
    );
    expect(pending.seat).toEqual({ key: 'b1', number: 1, off: 1, label: 'Bend 1 on instead' });
    expect(raw(MADE(), { distance: 29.1 }).error).toMatch(/^This line is 0\.1 mm from bend 1's line/);
  });
  it('a bend that cannot be bent on (round): the fact, no remedy, no button', () => {
    const pending = raw(modelOf([line('r', 29, 90, { radius: 20, steps: 4 })]), { distance: 31 });
    expect(pending.error).toBe("This line is 2 mm from bend 1's line: too close for a new bend.");
    expect(pending.seat).toBeUndefined();
  });
  // A notched blank (two tabs on one line, x = 30): tab 1 made alone.
  const NOTCHED = {
    type: 'polygon',
    points: [
      [34, 0],
      [200, 0],
      [200, 300],
      [34, 300],
      [0, 300],
      [0, 160],
      [34, 160],
      [34, 140],
      [0, 140],
      [0, 0],
    ],
  };
  const tab = (id, extra = {}) => ({
    id,
    a: [30, 0],
    b: [30, 100],
    angle: 45,
    direction: 'up',
    radius: null,
    punch: 'straight-88',
    ...extra,
  });
  const notchedPoints = (points) => ({ mode: 'points', edge: null, points });
  // The full line down x = 30 (+ dx), through both tabs.
  const full = (dx = 0) =>
    notchedPoints([
      [30 + dx, -1],
      [30 + dx, 301],
    ]);
  it('a line along a made tab that also crosses an unbent one does not seat: the net, the toggles kept', () => {
    // Tab 1 made alone; the line on it exactly, and 0.4 mm off it, set through brakePatch.
    const model = modelOf([tab('t1')], NOTCHED, 1.5);
    const exact = pick(model, full(), session(notchedPoints([])));
    expect('seated' in exact.session).toBe(false);
    expect(exact.session.points).toEqual(full().points);
    expect(exact.station.segments.map((s) => s.skipped)).toEqual([false, false]);
    expect(exact.station.pending.error).toBe(
      "This line is bend 1's line, but the pieces in this hit are not the ones bend 1 bends: a made bend is bent on whole, and nothing else with it. Click a piece on the flat blank to leave it out of this hit.",
    );
    expect(exact.station.pending.seat).toMatchObject({ key: 't1', number: 1, label: 'Bend 1 on instead' });
    const beside = pick(model, full(0.4), session(notchedPoints([])));
    expect('seated' in beside.session).toBe(false);
    expect(beside.station.segments.map((s) => s.skipped)).toEqual([false, false]);
    expect(beside.station.pending.error).toBe(
      "This line is 0.4 mm from bend 1's line: too close for a new bend. To bend bend 1 further, bend it on.",
    );
    expect(beside.station.pending.seat).toMatchObject({ key: 't1', number: 1, label: 'Bend 1 on instead' });
    // Tab 1's segment left out: the line bends tab 2 as a new bend.
    const station = brakeStation({ model, session: exact.session, advise: false });
    const s = brakePatch(exact.session, { skip: [0] }, station);
    const tab2 = brakeStation({ model, session: s, advise: false }).pending;
    expect([tab2.error, tab2.again, tab2.seat, 'seated' in s]).toEqual([undefined, undefined, undefined, false]);
    expect(tab2.data).toHaveLength(1);
    expect(Math.min(tab2.data[0].a[1], tab2.data[0].b[1])).toBeGreaterThan(159);
    expect(tab2.refusals).toEqual([]);
  });
  it('two tabs made in one stroke: the line 0.4 mm off seats on both', () => {
    const model = modelOf(
      [tab('t1', { stroke: 'S' }), tab('t2', { a: [30, 200], b: [30, 300], stroke: 'S' })],
      NOTCHED,
      1.5,
    );
    const { session: s, station } = pick(model, full(0.4), session(notchedPoints([])));
    expect(s.seated).toMatchObject({ number: 1, from: null });
    expect(s.seated.off).toBeCloseTo(0.4, 9);
    expect(s.skip).toEqual([]);
    expect(station.pending.again).toMatchObject({ bendIds: ['t1', 't2'], number: 1 });
    expect(station.pending.error).toBeUndefined();
  });
  it('across a made bend: the fact, and with more than one piece on the line, how to leave it out', () => {
    // A bend across the blank at y = 50, then a line down x = 30 through both tabs.
    const model = modelOf(
      [{ id: 'h', a: [0, 50], b: [200, 50], angle: 45, direction: 'up', radius: null, punch: 'straight-88' }],
      NOTCHED,
      1.5,
    );
    const pending = raw(
      model,
      notchedPoints([
        [30, -1],
        [30, 301],
      ]),
    );
    expect(pending.error).toBe(
      'This line runs across bend 1, which is already made: the brake cannot bend across a formed bend. Click that piece on the flat blank to leave it out of this hit.',
    );
    expect(pending.seat).toBeUndefined();
  });
  it('names the made bend by its step number, not its place in the fold', () => {
    // Step 1 bends two tabs (fold bends 1 and 2); step 2 makes the bend at x = 100 (fold bend 3).
    const model = modelOf(
      [
        tab('t1', { stroke: 'S' }),
        tab('t2', { a: [30, 200], b: [30, 300], stroke: 'S' }),
        { id: 'c', a: [100, 0], b: [100, 300], angle: 45, direction: 'up', radius: null, punch: 'straight-88' },
      ],
      NOTCHED,
      1.5,
    );
    const pending = raw(
      model,
      notchedPoints([
        [101, 0],
        [101, 300],
      ]),
    );
    expect(pending.error).toBe(
      "This line is 1 mm from bend 2's line: too close for a new bend. To bend bend 2 further, bend it on.",
    );
    expect(pending.seat).toMatchObject({ key: 'c', number: 2 });
  });
  it('another fold error keeps today’s "This hit" wording', () => {
    const pending = raw(MADE(), {
      mode: 'points',
      edge: null,
      points: [
        [700, 0],
        [700, H],
      ],
    });
    expect(pending.error).toMatch(/^This hit: the punch line misses the blank\.$/);
  });
});

describe('bendOnKey and bendOnPatch', () => {
  it('bendOnKey: the bend’s last step while it is sharp and under 180°', () => {
    const station = (bends) => brakeStation({ model: modelOf(bends), session: session(), advise: false }).fold;
    const on = { id: 'again', again: 'b1', angle: 90, punch: 'straight-88' };
    expect(bendOnKey(station([line('b1', 29, 30), line('b2', 11)]), 'b1')).toBe('b1');
    expect(bendOnKey(station([line('b1', 29, 30), line('b2', 11), on]), 'b1')).toBe('again');
    expect(bendOnKey(station([line('b1', 29, 180)]), 'b1')).toBe(null);
    expect(bendOnKey(station([line('r', 100, 90, { radius: 20, steps: 4 })]), 'r')).toBe(null);
    expect(bendOnKey(station([line('b1', 29, 30)]), 'nothing')).toBe(null);
  });
  it('bendOnPatch is as before: the nearest parallel edge and L', () => {
    const station = brakeStation({ model: MADE(), session: session(), advise: false });
    expect(bendOnPatch(station, 'b1')).toEqual({
      mode: 'gauge',
      edge: RIGHT,
      distance: 29,
      skip: [],
      // A flat distance, named so (skin gauge §4.5 step 1): the edge has made bends in front of it.
      stop: null,
      turned: false,
      scrub: null,
    });
  });
});

describe('hands on the sheet (§7.4 (f))', () => {
  it('fingerOffer gains the bend on and the L the fingers were dragged to; the readout says it', () => {
    const model = MADE();
    const { session: s, station } = pick(model, { distance: 31 });
    expect(fingerOffer(station, s)).toMatchObject({ offered: true, L: 29, on: 1, from: 31 });
    const exact = pick(model, { distance: 29 });
    const offer = fingerOffer(exact.station, exact.session);
    expect(offer.on).toBe(1);
    expect('from' in offer).toBe(false);
    const plain = pick(model, { distance: 60 });
    expect('on' in fingerOffer(plain.station, plain.session)).toBe(false);
    expect(fingerReadout(29, '12.3', 1)).toBe('L 29 mm · on bend 1');
    expect(fingerReadout(187, '113.45')).toBe('L 187 mm · flange 113.45');
  });
});
