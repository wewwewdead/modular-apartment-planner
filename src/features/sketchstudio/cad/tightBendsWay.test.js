// The brake finds the way (docs/sketch-studio-tight-bends.md §5, TB-2): a hit
// that collides is tried earlier in the order (this hit first) and with a
// made step part-way first, on the station's own checks; what passes is one
// click (armed, then the pedal), and when nothing passes the card says so.
// The three reference parts of §5.3 as pure-function assertions, the stored
// sequence's remedies, bend-on entries kept after their bends, and the armed
// session's checks and disarming (`culprit` reading steps: strokes.test.js).
import { describe, expect, it } from 'vitest';
import { foldSheet, foldedBounds } from './sheetMetal.js';
import {
  NO_WAY,
  PART_WAY,
  brakePatch,
  brakeSessionDefaults,
  brakeStation,
  placedBends,
  sequenceChecks,
  sequenceTries,
  startStroke,
} from './brakeStation.js';
import { gaugeEdges } from './pressBrake.js';
import { emptyModel } from './model.js';
import { machineOf } from './shopCatalog.js';

const MACHINE = machineOf('brake-50-2000');
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
const rectangle = (W, H) => ({ type: 'rectangle', width: W, height: H, origin: [0, 0] });
const modelOf = (bends, W, H) => {
  const model = emptyModel();
  model.sketches = [{ id: 's', name: 'S', plane: 'XY', profile: rectangle(W, H), primitives: [], constrained: false }];
  model.parts = [{ id: 'p', name: 'Tray', features: [feature(bends)] }];
  model.instances = [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }];
  return model;
};
// The gauge edge on the right (x = W) or the left (x = 0) of a W × H rectangle.
const edgeOf = (W, H, side) =>
  gaugeEdges([
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ]).findIndex((e) => {
    const x = side === 'right' ? W : 0;
    return Math.abs(e.a[0] - x) < 1e-6 && Math.abs(e.b[0] - x) < 1e-6;
  });
const session = (extra = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  mode: 'gauge',
  ...extra,
});
const line = (id, x, H, angle = 90, direction = 'up') => ({
  id,
  a: [x, 0],
  b: [x, H],
  angle,
  direction,
  radius: null,
  punch: 'straight-88',
  die: 'v8-88',
});
const on = (id, again, angle) => ({ id, again, angle, punch: 'straight-88', die: 'v8-88' });
const passes = (pending) => Boolean(pending && !pending.error && !pending.refusals.length && !pending.collision?.hit);
const allOk = (fold) => sequenceChecks({ fold, machine: MACHINE }).every((c) => !c.refusals.length && !c.collision);
const ids = (bends) => bends.map((b) => b.id);
const size = (fold) => {
  const [lo, hi] = foldedBounds(fold);
  return lo.map((v, i) => Number((hi[i] - v).toFixed(2)));
};

// §5.3 1: the screenshot's part (§1) in the user's order.
const W = 605.4,
  H = 420.4;
const RIGHT = edgeOf(W, H, 'right');
// §5.3 2: the tight Z, 315 × 200, up 150 from the left, down 150 from the right (web 15).
const ZW = 315,
  ZH = 200;
const ZRIGHT = edgeOf(ZW, ZH, 'right');

describe('try 1: this hit first (§5.2, §5.3 1: the screenshot’s part)', () => {
  const model = modelOf([line('inner', W - 29, H)], W, H);
  const lip = session({ edge: RIGHT, distance: 11, angle: 90 });
  it('offers "Make this hit before bend 1", only as tried; "bend this one earlier" is said', () => {
    const { pending } = brakeStation({ model, session: lip });
    expect(pending.collision.hit).toMatchObject({ tool: 'ram', phase: 'approach' });
    expect(pending.collision.ways).toEqual({
      first: {
        label: 'Make this hit before bend 1',
        session: { armed: { kind: 'before', key: 'inner' } },
        number: 1,
      },
      partway: null,
    });
    expect(pending.collision.hit.message).toMatch(
      /^Bend 2: the part hits the ram as the ram comes down\. This punch and its holder stand the ram [\d.]+ mm above the tip\. Bend this one earlier\. /,
    );
    expect(pending.collision.hit.message).not.toContain(NO_WAY);
    // The facts (advise: false) try nothing.
    expect(brakeStation({ model, session: lip, advise: false }).pending.collision.ways).toBeUndefined();
  });
  it('armed: the hit is checked and shown as it is then (the inner line flat); the pedal commits it first', () => {
    const armed = { kind: 'before', key: 'inner' };
    const station = brakeStation({ model, session: { ...lip, armed }, advise: false });
    expect(passes(station.pending)).toBe(true);
    expect(station.pending.armed).toMatchObject({ kind: 'before', key: 'inner', number: 1, again: false, place: 0 });
    expect(station.view.angles).toEqual({ inner: 0, 'pending-hit': 0 });
    let n = 0;
    const stroke = startStroke({ station, token: 't', newId: () => `n${++n}` });
    expect(ids(stroke.placed)).toEqual(['n1', 'inner']);
    expect(stroke.notice).toBe(null);
    // The stroke runs with the inner line still flat.
    expect(stroke.view.angles).toEqual({ inner: 0 });
    const made = foldSheet(feature(stroke.placed), rectangle(W, H));
    // TB-1's lip-first size (§4.7).
    expect(size(made)).toEqual([577.47, 420.4, 20.14]);
    expect(allOk(made)).toBe(true);
  });
});

describe('try 2: a part-way bend (§5.2, §5.3 2: the tight Z)', () => {
  const model = modelOf([line('b1', 150, ZH)], ZW, ZH);
  const down = session({ edge: ZRIGHT, distance: 150, angle: 90, flip: true });
  it('no place passes; "Bend 1 to 60° first, finish it after this hit" does', () => {
    const { pending } = brakeStation({ model, session: down });
    expect(pending.collision.hit).toMatchObject({ tool: 'bed' });
    expect(pending.collision.ways.first).toBe(null);
    expect(pending.collision.ways.partway).toEqual({
      label: 'Bend 1 to 60° first, finish it after this hit',
      session: { armed: { kind: 'partway', key: 'b1', angle: 60 } },
      number: 1,
      angle: 60,
    });
    // The hanging side's advice (brake flip tooling §5.4) stands; the part-way bend follows it.
    expect(pending.collision.hit.message).toMatch(
      /Neither order clears: .+\. Or bend 1 to 60° first, finish it after this hit\.$/,
    );
    expect(pending.collision.hit.message).not.toMatch(/Make this hit before|Bend this one earlier/);
    // Tried, not assumed: the order really fails (arming it is refused by the station's own checks).
    const before = brakeStation({ model, session: { ...down, armed: { kind: 'before', key: 'b1' } }, advise: false });
    expect(passes(before.pending)).toBe(false);
  });
  it('armed: bend 1 shown at 60°; the pedal makes the hit and, in one commit, bend 1 at 60° and its bend-on entry', () => {
    const armed = { kind: 'partway', key: 'b1', angle: 60 };
    const station = brakeStation({ model, session: { ...down, armed }, advise: false });
    expect(passes(station.pending)).toBe(true);
    expect(station.view.angles).toEqual({ b1: 60, 'pending-hit': 0 });
    let n = 0;
    const stroke = startStroke({ station, token: 't', newId: () => `n${++n}` });
    expect(stroke.placed.map((b) => [b.id, b.again ?? null, b.angle, b.direction ?? null])).toEqual([
      ['b1', null, 60, 'up'],
      ['n1', null, 90, 'down'],
      ['n2', 'b1', 90, null],
    ]);
    // Its punch and die the step's own.
    expect(stroke.placed[2]).toMatchObject({ punch: 'straight-88', die: 'v8-88' });
    expect(stroke.notice).toBe('Bend 1 now stands at 60° and is finished in step 3.');
    const made = foldSheet(feature(stroke.placed), rectangle(ZW, ZH));
    expect(sequenceChecks({ fold: made, machine: MACHINE }).map((c) => [c.label, failedOf(c)])).toEqual([
      ['UP 60° R1.28', false],
      ['DOWN 90° R1.28', false],
      ['bend 1 on: 60° → 90°', false],
    ]);
    // The same part as the two bends made at 90° (the bend-on entry keeps the 90° zone).
    const plain = foldSheet(
      feature([line('b1', 150, ZH), { ...line('b2', 165, ZH), direction: 'down' }]),
      rectangle(ZW, ZH),
    );
    expect(size(made)).toEqual(size(plain));
  });
  it('tries the part-way angles largest first', () => {
    expect(PART_WAY).toEqual([60, 45, 30, 15]);
  });
});
const failedOf = (c) => Boolean(c.refusals.length || c.collision);

describe('try 3: nothing passes (§5.2, §5.3 3: lip 15 / web 15)', () => {
  it('inner first, or the lip first: no button, the fact, what was tried and try 3’s words', () => {
    for (const [made, L] of [
      ['inner', 15],
      ['lip', 30],
    ]) {
      const model = modelOf([line(made, made === 'inner' ? W - 30 : W - 15, H)], W, H);
      const { pending } = brakeStation({ model, session: session({ edge: RIGHT, distance: L, angle: 90 }) });
      expect(pending.collision.hit, made).toBeTruthy();
      expect(pending.collision.ways, made).toBeUndefined();
      expect(pending.collision.fix, made).toBeUndefined();
      const message = pending.collision.hit.message;
      expect(message.endsWith(` ${NO_WAY}`), message).toBe(true);
      expect(message).toMatch(/were tried: (none|neither) clears\. No order/);
      // Never "bend this one earlier" where the order was tried and failed.
      expect(message).not.toMatch(/Bend this one earlier/);
    }
  });
  it('armed into a worse order the station refuses it in the order’s words (re-checked as at the pedal)', () => {
    // Lip 15 / web 15, inner made: the lip first clears, but the inner then meets the punch.
    const model = modelOf([line('inner', W - 30, H)], W, H);
    const station = brakeStation({
      model,
      session: session({ edge: RIGHT, distance: 15, angle: 90, armed: { kind: 'before', key: 'inner' } }),
      advise: false,
    });
    expect(station.pending.collision.hit).toBe(null);
    expect(station.pending.refusals.map((r) => r.code)).toEqual(['order']);
    expect(station.pending.refusals[0].message).toMatch(
      /^That order is refused: step 2 could not be made then\. Bend 2: the part hits the punch/,
    );
  });
});

describe('bend-on entries stay after their bends (§5.2)', () => {
  it('placedBends puts the records before a step and keeps every bend-on entry after its bend', () => {
    const bends = [line('inner', W - 29, H, 30), line('lip', W - 11, H), on('again', 'inner', 90)];
    expect(ids(placedBends(bends, [{ id: 'new' }], { kind: 'before', key: 'lip' }))).toEqual([
      'inner',
      'new',
      'lip',
      'again',
    ]);
    expect(ids(placedBends(bends, [{ id: 'new' }], { kind: 'before', key: 'again' }))).toEqual([
      'inner',
      'lip',
      'new',
      'again',
    ]);
    expect(ids(placedBends(bends, [{ id: 'new' }]))).toEqual(['inner', 'lip', 'again', 'new']);
    // A part-way step: its angle and the bend-on entry, nothing else changed.
    const partway = placedBends(
      [line('b1', 150, ZH)],
      [{ id: 'new' }],
      { kind: 'partway', key: 'b1', angle: 45 },
      'fin',
    );
    expect(partway).toEqual([
      { ...line('b1', 150, ZH), angle: 45 },
      { id: 'new' },
      { id: 'fin', again: 'b1', angle: 90, punch: 'straight-88', die: 'v8-88' },
    ]);
  });
  it('a bend-on hit is never armed before its own bend, and its tries start after it', () => {
    // Bend 1 at 30°, the lip made: bending bend 1 on to 90° clears made last (TB-1); armed before
    // bend 1 itself, the station ignores the try and checks the hit made last.
    const model = modelOf([line('inner', W - 29, H, 30), line('lip', W - 11, H)], W, H);
    const s = session({ edge: RIGHT, distance: 29, angle: 90 });
    expect(brakeStation({ model, session: s, advise: false }).pending.again).toMatchObject({ bendIds: ['inner'] });
    const before = brakeStation({ model, session: { ...s, armed: { kind: 'before', key: 'inner' } }, advise: false });
    expect(before.pending.armed).toBeUndefined();
    // Before the lip (after its bend) it may go: the station checks it there.
    const between = brakeStation({ model, session: { ...s, armed: { kind: 'before', key: 'lip' } }, advise: false });
    expect(between.pending.armed).toMatchObject({ kind: 'before', key: 'lip', place: 1 });
    // Its own bend is never opened part-way under it.
    const self = brakeStation({
      model,
      session: { ...s, armed: { kind: 'partway', key: 'inner', angle: 15 } },
      advise: false,
    });
    expect(self.pending.armed).toBeUndefined();
  });
  it('a stored bend-on step is never offered a move before its bend', () => {
    // Inner 30°, inner on to 90°, then the lip (the user's order, which meets the ram): moving the
    // lip first is offered; the bend-on step itself is never moved before inner's first hit.
    const bends = [line('inner', W - 29, H, 30), on('again', 'inner', 90), line('lip', W - 11, H)];
    const checks = sequenceChecks({ fold: foldSheet(feature(bends), rectangle(W, H)), machine: MACHINE });
    expect(checks.map(failedOf)).toEqual([false, false, true]);
    const tries = sequenceTries({ feature: feature(bends), profile: rectangle(W, H), machine: MACHINE, checks });
    expect(Object.keys(tries)).toEqual(['lip']);
    expect(tries.lip.move.label).toBe('Move step 3 before step 2');
    expect(ids(tries.lip.move.bends)).toEqual(['inner', 'lip', 'again']);
    for (const { move } of Object.values(tries))
      if (move) {
        const order = ids(move.bends);
        expect(order.indexOf('again')).toBeGreaterThan(order.indexOf('inner'));
      }
  });
});

describe('the stored sequence’s remedies (§5.2, §5.3 4)', () => {
  it('inner then lip by data: "Move step 2 before step 1", the lip first, every step ok', () => {
    const bends = [line('inner', W - 29, H), line('lip', W - 11, H)];
    const tries = sequenceTries({ feature: feature(bends), profile: rectangle(W, H), machine: MACHINE });
    expect(Object.keys(tries)).toEqual(['lip']);
    expect(tries.lip.move.label).toBe('Move step 2 before step 1');
    expect(tries.lip.partway).toBe(null);
    expect(ids(tries.lip.move.bends)).toEqual(['lip', 'inner']);
    expect(allOk(foldSheet(feature(tries.lip.move.bends), rectangle(W, H)))).toBe(true);
  });
  it('the tight Z by data: no move clears; "Bend 1 to 60° first" with its bend-on entry after step 2', () => {
    const bends = [line('b1', 150, ZH), { ...line('b2', 165, ZH), direction: 'down' }];
    const tries = sequenceTries({
      feature: feature(bends),
      profile: rectangle(ZW, ZH),
      machine: MACHINE,
      newId: () => 'fin',
    });
    expect(tries.b2.move).toBe(null);
    expect(tries.b2.partway.label).toBe('Bend 1 to 60° first');
    expect(tries.b2.partway.bends.map((b) => [b.id, b.again ?? null, b.angle])).toEqual([
      ['b1', null, 60],
      ['b2', null, 90],
      ['fin', 'b1', 90],
    ]);
    expect(allOk(foldSheet(feature(tries.b2.partway.bends), rectangle(ZW, ZH)))).toBe(true);
  });
  it('a sequence that passes has nothing to offer', () => {
    const bends = [line('lip', W - 11, H), line('inner', W - 29, H)];
    expect(sequenceTries({ feature: feature(bends), profile: rectangle(W, H), machine: MACHINE })).toEqual({});
  });
});

describe('the armed try in the session (§5.2)', () => {
  const armed = { kind: 'before', key: 'inner' };
  it('a new line, a segment toggle, Flip sheet or another shape disarms it; the tooling and the angle keep it', () => {
    const s = session({ edge: RIGHT, distance: 11, armed });
    for (const patch of [
      { distance: 12 },
      { edge: 0 },
      { mode: 'points' },
      { skip: [0] },
      { flip: true },
      { shape: 'round' },
    ])
      expect(brakePatch(s, patch).armed, JSON.stringify(patch)).toBe(null);
    for (const patch of [
      { punch: 'gooseneck-88' },
      { die: 'v10-88' },
      { angle: 80 },
      { punchTrim: 5 },
      { scrub: null },
    ])
      expect(brakePatch(s, patch).armed, JSON.stringify(patch)).toEqual(armed);
    expect(brakePatch(s, { armed: null }).armed).toBe(null);
    // The part-way note goes with the next pick.
    expect(brakePatch({ ...s, notice: 'Bend 1 now stands at 60°' }, { punch: 'straight-88' }).notice).toBe(null);
    // A session without the keys keeps none.
    const plain = brakePatch(session({ edge: RIGHT }), { distance: 5 });
    expect('armed' in plain && plain.armed).toBe(null);
    expect('notice' in plain).toBe(false);
  });
  it('an armed step that is gone is ignored: the hit is made last, as ever', () => {
    const model = modelOf([line('inner', W - 29, H)], W, H);
    const station = brakeStation({
      model,
      session: session({ edge: RIGHT, distance: 11, armed: { kind: 'before', key: 'nothing' } }),
      advise: false,
    });
    expect(station.pending.armed).toBeUndefined();
    expect(station.pending.collision.hit).toMatchObject({ tool: 'ram' });
  });
});

// `culprit` with a bend-on entry in the sequence: strokes.test.js (the §1 face frame's crease made
// part-way and bent on before the flanges), where the face frame is built.
