// Gauging off a flange (docs/sketch-studio-skin-gauge.md, SG-1): "Backgauge
// L" is what the real backgauge reads. §3's probe as assertions on the
// reading (pressBrake.js brakeReading, skinReach) and the take-up
// (stopTakeUp); §4.4's table through brakePatch with the station; I-1 over a
// sweep of L on one stop; an unknown stop; Turn sheet around and Bend on keep
// the flat line and come out canonical; Esc on a finger drag; an armed try
// keeps the line; Gauge off held, its refusal and the hint.
import { describe, expect, it } from 'vitest';
import { foldSheet, poseFold, profilePolygon } from './sheetMetal.js';
import {
  automaticStop,
  bendOnPatch,
  brakePatch,
  brakeSessionDefaults,
  brakeStation,
  edgeStops,
  lineStop,
  sessionLine,
  turnAround,
} from './brakeStation.js';
import { brakeFrame, brakeReading, flatLineFrame, gaugeEdges, skinReach, stopTakeUp } from './pressBrake.js';
import { fingerOffer, fingerReadout, fingerRestore } from './brakeHands.js';
import { FINGER_FACE } from './shopCatalog.js';
import { emptyModel } from './model.js';

// §3: the 300 × 100 blank, t 1.2 SPCC, the straight 88° punch, the automatic die (V8 88°),
// the gauge edge at x = 0 (edge 4), every bend parallel to it.
const W = 300,
  H = 100;
const BLANK = { type: 'rectangle', width: W, height: H, origin: [0, 0] };
const feature = (bends = []) => ({
  id: 'f',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: 1.2,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends,
});
// A bend `x` from the gauge edge (flat), the punch line across the blank.
const line = (id, x, angle = 90, direction = 'up') => ({
  id,
  a: [x, 0],
  b: [x, H],
  angle,
  direction,
  radius: null,
  punch: 'straight-88',
});
const modelOf = (bends) => {
  const model = emptyModel();
  model.sketches = [{ id: 's', name: 'S', plane: 'XY', profile: BLANK, primitives: [], constrained: false }];
  model.parts = [{ id: 'p', name: 'Tray', features: [feature(bends)] }];
  model.instances = [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }];
  return model;
};
const EDGES = gaugeEdges(profilePolygon(BLANK).outer);
const LEFT = EDGES.findIndex((e) => Math.abs(e.a[0]) < 1e-6 && Math.abs(e.b[0]) < 1e-6);
const RIGHT = EDGES.findIndex((e) => Math.abs(e.a[0] - W) < 1e-6 && Math.abs(e.b[0] - W) < 1e-6);
const EDGE = EDGES[LEFT];
const session = (extra = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  mode: 'gauge',
  edge: LEFT,
  distance: 20,
  ...extra,
});
// A pick as the workspace applies it (changeBrake: brakePatch with the station of the session before).
const pick = (model, patch, before = session()) => {
  const station = brakeStation({ model, session: before, advise: false });
  const after = brakePatch(before, patch, station);
  return { session: after, station: brakeStation({ model, session: after, advise: false }) };
};
const clear = (pending) => Boolean(pending) && !pending.error && !pending.refusals.length && !pending.collision.hit;
// The reading for a pending line at flat `x` (its direction `dir`) on a blank with `made` bent.
const reading = (made, x, dir = 'up') =>
  brakeReading(foldSheet(feature([...made, line('p', x, 90, dir)]), BLANK), 'p', EDGE);
const takeUp = (made, id, dir = 'up') => stopTakeUp(foldSheet(feature(made), BLANK), EDGE, id, { up: dir === 'up' });
// Bend 1 made at L 20, 90° up (the user's first hit, §1).
const B1 = () => [line('b1', 20)];

describe('the reading (§3, §4.2)', () => {
  it('reproduces the probe: every row of §3 to 1e-3', () => {
    const rows = [
      // [made, pending flat, its direction, reads, take-up]
      [[], 50, 'up', 50, 0],
      [B1(), 50, 'up', 31.0694, 18.9306],
      [B1(), 48.9306, 'up', 30, 18.9306],
      [[line('b1', 20, 90, 'down')], 50, 'up', 31.0694, 18.9306],
      [[line('b1', 20, 135)], 50, 'up', 30.3641, 19.6359],
      // §3 printed 42.3042 (take-up 7.6958): the spec's own tip (44.6918, 14.37 above the die)
      // puts the 45° flange's outer skin on Y − Z = 30.3218, so at the finger's top (Z 12) it
      // reads 42.3218; brakeFrame's pose gives the same (below). See §8.
      [[line('b1', 20, 45)], 50, 'up', 42.322, 7.678],
      [[line('b1', 10), line('b2', 40)], 100, 'up', 61.0694, 38.9306],
      [[line('b1', 150)], 165, 'down', 16.0694, 148.9306],
    ];
    for (const [made, x, dir, reads, up] of rows) {
      const r = reading(made, x, dir);
      expect(r.distance, `${made.map((b) => `${b.a[0]}@${b.angle}`)} ${x}`).toBeCloseTo(reads, 3);
      expect(x - r.distance).toBeCloseTo(up, 3);
      // The take-up of the stop the line is beyond, the part as made, is the same number.
      if (made.length) expect(takeUp(made, made.at(-1).id, dir)).toBeCloseTo(up, 3);
    }
    // A 90° flange: d + BA/2 − (r + t), so the user's "50" lands 1.07 off (§3).
    expect(takeUp(B1(), 'b1')).toBeCloseTo(20 + 2.8212 / 2 - 2.48, 3);
    expect(50 - takeUp(B1(), 'b1') - 30).toBeCloseTo(1.0694, 3);
  });
  it('answers as today where the edge is beside the line: the flat distance, no stop', () => {
    expect(reading([], 50)).toEqual({ distance: 50, piece: expect.any(String) });
    expect(reading(B1(), 12).distance).toBeCloseTo(12, 9);
    expect(reading(B1(), 12).stop).toBeUndefined();
    // Off the skin: the stop is bend 1, the line's flat distance beside it.
    expect(reading(B1(), 50)).toMatchObject({ stop: { bendId: 'b1' }, flat: 50 });
    // The lipped wall: the wall's flange (bend 2) is the stop, the lip is over it.
    expect(reading([line('b1', 10), line('b2', 40)], 100).stop).toEqual({ bendId: 'b2' });
  });
  it('the 45° row: the finger’s top corner meets the leaning flange, whose tip is over it', () => {
    const fold = foldSheet(feature([line('b1', 20, 45), line('p', 50)]), BLANK);
    const posed = poseFold(fold, { p: 0 });
    const frame = brakeFrame(posed, 'p', { gaugePoint: [0, 50] });
    // The flange's tip, the finger no limit above: 44.6918, as §3 says.
    expect(skinReach(posed, frame.matrix, { face: { below: 8, above: 1000 } })).toBeCloseTo(44.6918, 3);
    expect(skinReach(posed, frame.matrix)).toBeCloseTo(42.322, 3);
    expect(FINGER_FACE).toEqual({ below: 8, above: 12 });
  });
  it('the flat line’s frame is brakeFrame’s for a flat bend (the reading’s frame, §4.2)', () => {
    const fold = foldSheet(feature([...B1(), line('p', 50)]), BLANK);
    const posed = poseFold(fold, { p: 0 });
    const bend = posed.bends.find((b) => b.id === 'p');
    // The side toward the gauge edge (x = 0) to the back.
    const ours = flatLineFrame(bend.fixedMatrix, bend.a, [-1, 0], true, posed.thickness);
    const theirs = brakeFrame(posed, 'p', { gaugePoint: [0, 50] }).matrix;
    // Y (the row toward the backgauge) and Z the same; X runs along the line either way.
    for (const row of [1, 2])
      for (const col of [0, 1, 2, 3]) expect(ours[col * 4 + row]).toBeCloseTo(theirs[col * 4 + row], 9);
  });
  it('keeps the no-gauge answers: turned around, two points, a non-parallel edge', () => {
    const model = modelOf(B1());
    expect(brakeStation({ model, session: session({ distance: 30, turned: true }) }).gauge.distance).toBe(null);
    const points = brakeStation({
      model,
      session: session({
        mode: 'points',
        points: [
          [50, 0],
          [50, H],
        ],
      }),
    });
    expect(points.gauge).toEqual({ distance: null, reason: 'Two-point line: no backgauge edge.' });
    const fold = foldSheet(feature([...B1(), line('p', 50)]), BLANK);
    expect(brakeReading(fold, 'p', EDGES[(LEFT + 1) % 4]).reason).toBe(
      'The gauge edge is not parallel to the punch line.',
    );
  });
});

describe('which stop a typed L means (§4.4)', () => {
  it('the user’s part, bend 1 made at 20: the table', () => {
    const model = modelOf(B1());
    // 12: flat 12 from the edge, a line inside the 20 flange (as today).
    const twelve = pick(model, { distance: 12 });
    expect([twelve.session.distance, twelve.session.stop, twelve.station.flat]).toEqual([12, null, 12]);
    // 20: bend 1's line, bend it on (tight bends §4.4).
    const twenty = pick(model, { distance: 20 });
    expect([twenty.session.distance, twenty.session.stop]).toEqual([20, null]);
    expect(twenty.station.pending.again).toMatchObject({ bendIds: ['b1'], number: 1 });
    // 22: within 4 of bend 1, seats on it (tight bends §7).
    const seat = pick(model, { distance: 22 });
    expect([seat.session.distance, seat.session.seated.from]).toEqual([20, 22]);
    expect(seat.station.pending.again.number).toBe(1);
    // 30: 30 from bend 1's skin, flat 48.9306 (was flat 30, no reading).
    const thirty = pick(model, { distance: 30 });
    expect([thirty.session.distance, thirty.session.stop]).toEqual([30, 'b1']);
    expect(thirty.station.flat).toBeCloseTo(48.9306, 3);
    expect(thirty.station.pending.data[0].a[0]).toBeCloseTo(48.9306, 3);
    expect(thirty.station.gauge).toMatchObject({ stop: { bendId: 'b1', number: 1 } });
    expect(thirty.station.gauge.distance).toBeCloseTo(30, 6);
    expect(clear(thirty.station.pending)).toBe(true);
    // 48.9306: 48.9306 from bend 1's skin, flat 67.8612.
    const far = pick(model, { distance: 48.9306 });
    expect(far.session.stop).toBe('b1');
    expect(far.station.flat).toBeCloseTo(67.8612, 3);
  });
  it('bend 2 made at L 30 (flat 48.9306): L 30 is bend 2’s line, L 20 bend 1’s, L 60 off bend 2’s flange', () => {
    const made = modelOf(B1());
    const at = pick(made, { distance: 30 }).station.flat;
    const model = modelOf([...B1(), line('b2', at)]);
    const thirty = pick(model, { distance: 30 });
    expect(thirty.station.pending.again).toMatchObject({ bendIds: ['b2'], number: 2 });
    expect([thirty.session.distance, thirty.session.stop]).toEqual([30, 'b1']);
    // The bend-on hit's reading is nominal (its own bend flat): what the field says.
    expect(thirty.station.gauge.distance).toBeCloseTo(30, 6);
    const twenty = pick(model, { distance: 20 });
    expect(twenty.station.pending.again).toMatchObject({ bendIds: ['b1'], number: 1 });
    expect(twenty.session.stop).toBe(null);
    const sixty = pick(model, { distance: 60 });
    expect([sixty.session.distance, sixty.session.stop]).toEqual([60, 'b2']);
    expect(sixty.station.flat).toBeCloseTo(60 + at + 2.8212 / 2 - 2.48, 3);
    expect(sixty.station.gauge.distance).toBeCloseTo(60, 6);
  });
  it('the edge’s stops, nearest first; the line’s own stop; automatic on its own', () => {
    const model = modelOf([line('b1', 10), line('b2', 40)]);
    const { fold } = brakeStation({ model, session: session() });
    expect(edgeStops(fold, EDGE).map((s) => [s.bendId, s.d, s.number])).toEqual([
      ['b1', 10, 1],
      ['b2', 40, 2],
    ]);
    // From the other edge the same bends, the other way round.
    expect(edgeStops(fold, EDGES[RIGHT]).map((s) => s.bendId)).toEqual(['b2', 'b1']);
    expect([
      lineStop(fold, EDGE, 5),
      lineStop(fold, EDGE, 10),
      lineStop(fold, EDGE, 30),
      lineStop(fold, EDGE, 41),
    ]).toEqual([null, null, 'b1', 'b2']);
    const station = { fold };
    expect(automaticStop(station, session(), EDGE, 12)).toBe(null);
    expect(automaticStop(station, session(), EDGE, 25)).toBe('b1');
    // The wall from bend 1's skin to bend 2: 40 − 8.9306 = 31.07 is on bend 2, within 4 still bend 1's.
    expect(automaticStop(station, session(), EDGE, 34)).toBe('b1');
    expect(automaticStop(station, session(), EDGE, 60)).toBe('b2');
    // A finger drag's own stop first, while it makes the line.
    expect(automaticStop(station, session(), EDGE, 12, 'b1')).toBe('b1');
    expect(automaticStop(station, session(), EDGE, 0.5, 'b1')).toBe(null);
  });
});

describe('I-1: the field reads what the fingers read (§4.3)', () => {
  it('over a sweep of L on one stop, for several flanges and either way up', () => {
    const parts = [
      B1(),
      [line('b1', 20, 135)],
      [line('b1', 20, 45)],
      [line('b1', 20, 90, 'down')],
      [line('b1', 10), line('b2', 40)],
    ];
    let checked = 0;
    for (const made of parts) {
      const model = modelOf(made);
      for (const flip of [false, true])
        for (let L = 25; L <= 200; L += 7.3) {
          const { session: s, station } = pick(model, { distance: L }, session({ flip }));
          if (station.pending.error || station.gauge.distance == null) continue;
          checked += 1;
          expect(s.stop, `${made.length} ${flip} ${L}`).not.toBe(null);
          expect(Math.abs(station.gauge.distance - s.distance), `${made[0].angle} ${flip} ${L}`).toBeLessThan(1e-6);
        }
    }
    // Most of the sweep is a line the fold takes (a few land too near a bend for a new one).
    expect(checked).toBeGreaterThan(200);
  });
  it('the line follows from L and the stop only: sessionLine, an unknown stop reads as the edge', () => {
    const model = modelOf(B1());
    const { station } = pick(model, { distance: 30 });
    const s = session({ distance: 30, stop: 'b1' });
    expect(sessionLine(station, s).line.a[0]).toBeCloseTo(48.9306, 3);
    // Without the fold (the old rule's callers) L is the flat distance.
    expect(sessionLine({ polygon: station.polygon, edges: station.edges }, s).line.a[0]).toBeCloseTo(30, 9);
    // A stop the fold no longer has (the bend undone): L is from the edge.
    const gone = brakeStation({ model, session: session({ distance: 30, stop: 'gone' }) });
    expect([gone.stop, gone.flat]).toEqual([null, 30]);
    expect(gone.pending.data[0].a[0]).toBeCloseTo(30, 9);
    const undone = brakeStation({ model: modelOf([]), session: s });
    expect(undone.flat).toBe(30);
  });
});

describe('the session (§4.5)', () => {
  it('Turn sheet around and Bend on keep the same flat line and come out canonical', () => {
    const model = modelOf(B1());
    const { session: s, station } = pick(model, { distance: 30 });
    // Turned: the right edge, the same line (300 − 48.9306), nothing bent between: from that edge.
    const turned = brakePatch(s, turnAround(station, s), station);
    expect(turned.edge).toBe(RIGHT);
    expect(turned.distance).toBeCloseTo(W - 48.9306, 3);
    expect(turned.stop).toBe(null);
    const there = brakeStation({ model, session: turned });
    expect(there.pending.data[0].a[0]).toBeCloseTo(48.9306, 3);
    expect(there.gauge.distance).toBeCloseTo(turned.distance, 6);
    // And back: the left edge, off bend 1's flange again, L 30.
    const back = brakePatch(turned, turnAround(there, turned), there);
    expect([back.edge, back.stop]).toEqual([LEFT, 'b1']);
    expect(back.distance).toBeCloseTo(30, 6);
    // Bend on a bend behind a flange: bend 2's flat line, the field what the fingers read.
    const two = modelOf([...B1(), line('b2', 48.9306)]);
    const at = brakeStation({ model: two, session: session({ distance: 100 }) });
    const patch = bendOnPatch(at, 'b2');
    expect(patch).toMatchObject({ edge: LEFT, distance: 48.9306, stop: null });
    const on = brakePatch(session({ distance: 100 }), patch, at);
    expect(on.stop).toBe('b1');
    expect(on.distance).toBeCloseTo(30, 3);
    const onStation = brakeStation({ model: two, session: on });
    expect(onStation.pending.again.number).toBe(2);
    expect(onStation.gauge.distance).toBeCloseTo(on.distance, 6);
  });
  it('Esc on a finger drag puts L and its stop back; the drag stays on its stop while it makes the line', () => {
    const model = modelOf(B1());
    const before = pick(model, { distance: 30 }).session;
    // Dragged forward to L 10 on bend 1's flange: still off the flange (automatic would take the edge).
    const dragged = pick(model, { distance: 10, dragStop: 'b1' }, before);
    expect([dragged.session.distance, dragged.session.stop, 'dragStop' in dragged.session]).toEqual([10, 'b1', false]);
    expect(dragged.station.flat).toBeCloseTo(28.9306, 3);
    expect(pick(model, { distance: 10 }, before).session.stop).toBe(null);
    // Esc: the line back as it was.
    const back = brakePatch(dragged.session, fingerRestore(before), dragged.station);
    expect(back).toEqual(before);
    // Dragged back from the edge past the seat: the flange takes the fingers (the L stays the L dragged).
    const fromEdge = pick(model, { distance: 12 }).session;
    const past = pick(model, { distance: 26, dragStop: null }, fromEdge);
    expect([past.session.distance, past.session.stop]).toEqual([26, 'b1']);
  });
  it('the fingers offer the stop; the chip says it', () => {
    const model = modelOf(B1());
    const { session: s, station } = pick(model, { distance: 30 });
    const offer = fingerOffer(station, s);
    expect(offer).toMatchObject({ offered: true, off: 1 });
    expect(offer.L).toBeCloseTo(30, 6);
    expect(fingerReadout(30, offer.flange, null, offer.off)).toBe(`L 30 mm · off bend 1 · flange ${offer.flange}`);
    // Off the edge: no `off`, the chip as before.
    const plain = pick(model, { distance: 12 });
    expect('off' in fingerOffer(plain.station, plain.session)).toBe(false);
    // The 3D view stands the fingers at the reading.
    expect(station.view.gaugeDistance).toBeCloseTo(30, 6);
  });
  it('an armed "before" try keeps the line; its reading is the order’s (the sheet still flat there)', () => {
    // Bend 1 at 20 made, the line off its flange; armed before bend 1, the flange is not yet standing.
    const model = modelOf(B1());
    const { session: s, station } = pick(model, { distance: 30 });
    const armed = brakeStation({ model, session: { ...s, armed: { kind: 'before', key: 'b1' } }, advise: false });
    expect(armed.pending.armed).toMatchObject({ kind: 'before', number: 1 });
    expect(armed.flat).toBeCloseTo(station.flat, 9);
    expect(armed.pending.data[0].a[0]).toBeCloseTo(station.pending.data[0].a[0], 9);
    // Made first, the sheet is flat to the edge: the fingers read the flat distance, not the field's L.
    expect(armed.gauge.distance).toBeCloseTo(48.9306, 3);
    expect(armed.gauge.stop).toBe(null);
  });
  it('a new edge, the mode or the points put Gauge off back to automatic; a defaults session has the keys', () => {
    expect(brakeSessionDefaults()).toMatchObject({ stop: null, stopHold: null });
    const model = modelOf(B1());
    const held = pick(model, { stopHold: 'edge', distance: 30 }).session;
    expect(held.stopHold).toBe('edge');
    expect(pick(model, { distance: 31 }, held).session.stopHold).toBe('edge');
    expect(pick(model, { edge: RIGHT }, held).session.stopHold).toBe(null);
    expect(pick(model, { mode: 'points', points: [] }, held).session.stopHold).toBe(null);
    // The same edge picked again keeps it.
    expect(pick(model, { mode: 'gauge', edge: LEFT }, held).session.stopHold).toBe('edge');
  });
});

describe('Gauge off (§4.6)', () => {
  it('bend 1’s flange held: L 15 is 15 from its skin, flat 33.9306; the edge held: L from the edge', () => {
    const model = modelOf(B1());
    const off = pick(model, { stopHold: 'b1', distance: 15 });
    expect([off.session.distance, off.session.stop]).toEqual([15, 'b1']);
    expect(off.station.flat).toBeCloseTo(33.9306, 3);
    expect(off.station.gauge.distance).toBeCloseTo(15, 6);
    // A 12.5 mm web behind a standing 20 flange: the punch meets the flange (its own matter); no gauge refusal.
    expect(off.station.pending.refusals).toEqual([]);
    // Automatic, L 15 is from the edge: the hint says so, with its click.
    const auto = pick(model, { distance: 15 });
    expect(auto.station.flat).toBe(15);
    expect(auto.station.gaugeHint).toEqual({
      L: 15,
      bendId: 'b1',
      number: 1,
      words: "L 15 is from the edge, inside bend 1's flange.",
      label: "Gauge off bend 1's flange",
    });
    // On bend 1's line, seated from 22: the L asked for.
    expect(pick(model, { distance: 22 }).station.gaugeHint.words).toBe("L 22 is from the edge, on bend 1's line.");
    // Off a flange, or held: no hint.
    expect(off.station.gaugeHint).toBe(null);
    expect(pick(model, { distance: 30 }).station.gaugeHint).toBe(null);
    // The edge held and the line past bend 1: the fingers would read the flange, so it is refused in words.
    const edge = pick(model, { stopHold: 'edge', distance: 30 });
    expect([edge.session.distance, edge.session.stop, edge.station.flat]).toEqual([30, null, 30]);
    const refusal = edge.station.pending.refusals.find((r) => r.code === 'gauge-stop');
    expect(refusal.message).toMatch(
      /^Gauged off the edge, L 30 mm does not reach this line: here the fingers stop on bend 1's flange, at L 11\.07 mm\./,
    );
    expect(refusal.fix.label).toBe("Gauge off bend 1's flange");
    // Its click: the same line, off the flange.
    const fixed = pick(model, refusal.fix.session, edge.session);
    expect(fixed.station.flat).toBeCloseTo(30, 6);
    expect([fixed.session.stopHold, fixed.session.stop]).toEqual(['b1', 'b1']);
    expect(fixed.station.pending.refusals.some((r) => r.code === 'gauge-stop')).toBe(false);
  });
  it('checks the backgauge’s reach against the reading off a flange', () => {
    const model = modelOf(B1());
    // Off bend 1's flange at L 4.5 (the V6 seats only to 3 mm: the line stays 3.43 past bend 1).
    const { station } = pick(model, { distance: 4.5 }, session({ stopHold: 'b1', die: 'v6-88' }));
    expect(station.gauge.distance).toBeCloseTo(4.5, 6);
    expect(station.pending.refusals.find((r) => r.code === 'backgauge').message).toMatch(
      /L 4\.5 mm is out of its reach/,
    );
  });
});
