// Flip, turn and the offset bend (docs/sketch-studio-brake-flip-tooling.md §5,
// BT-2): the offset's spacing and web measured on the folded part, the order
// chosen for the user (A then B; B then A when only that clears, said so),
// the §5.5 table through the machine's checks, Turn sheet around (the same
// punch line, the other side at the back), the advice for a side that hangs
// down (only remedies that were tried, each tried again here), the two hits'
// timeline and the radius punch holders read from the catalogue (§5.6).
import { describe, expect, it } from 'vitest';
import { foldSheet, foldedBounds } from './sheetMetal.js';
import { brakeCollisions, hangingMessage, partSurface, shortenedSurface } from './brakeCollisions.js';
import {
  bladeOptions,
  brakeSessionDefaults,
  brakeStation,
  needsAdvice,
  offsetSpacing,
  oppositeEdge,
  sequenceChecks,
  startStroke,
  turnAround,
} from './brakeStation.js';
import { TURN_MS, backSide, brakeFrame, flatFrame, pairTimeline, strokeAt, strokeTimeline } from './pressBrake.js';
import { emptyModel } from './model.js';
import {
  PUNCHES,
  RADIUS_HOLDERS,
  RADIUS_PUNCHES,
  defaultDie,
  machineOf,
  maxBendAngle,
  punchSection,
  punchSymmetric,
} from './shopCatalog.js';
import { poseFold, transformPoint } from './sheetMetal.js';

const close = (a, b, digits = 5) => expect(a).toBeCloseTo(b, digits);
const machine = machineOf('brake-50-2000');
const rect = (width, height = 100) => ({ type: 'rectangle', width, height, origin: [0, 0] });
const sheet = (bends = []) => ({
  id: 'sm',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: 1.5,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends: bends.map((bend, i) => ({ id: `b${i + 1}`, angle: 90, direction: 'up', radius: null, ...bend })),
});
// SPCC t 1.5, a W × 100 blank, automatic tooling, the 50 t × 2 m press (§5.5).
const modelOf = (width, bends = [], height = 100) => ({
  ...emptyModel(),
  sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile: rect(width, height), primitives: [], constrained: false }],
  parts: [{ id: 'p', name: 'Step', material: 'SPCC cold-rolled steel', features: [sheet(bends)] }],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
});
// Edge 2 (index 1) is the right end of a rectangle blank, edge 4 (index 3) the left end.
const RIGHT = 1,
  LEFT = 3;
const session = (patch = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  ...patch,
});
const offset = (width, patch) =>
  brakeStation({ model: modelOf(width), session: session({ shape: 'offset', ...patch }) });
// A model's part as folded with its bends; a step's records made by the pedal, folded.
const made = (station) => startStroke({ station, token: 't', id: 'x' });
const height = (fold) => {
  const [min, max] = foldedBounds(fold);
  return max[2] - min[2];
};
// SPCC t 1.5 in the automatic V10 die: R1.6, K 0.43.
const numbers = (angle) => ({ radius: 1.6, allowance: ((angle * Math.PI) / 180) * (1.6 + 0.43 * 1.5), thickness: 1.5 });

describe('the offset maths (§5.3)', () => {
  it('works out the web and the spacing from the step, the angle and the bend numbers', () => {
    const at45 = offsetSpacing({ offset: 6.35, angle: 45, ...numbers(45) });
    close(at45.web, 7.03345);
    close(at45.spacing, 8.79667);
    const at90 = offsetSpacing({ offset: 20, angle: 90, ...numbers(90) });
    close(at90.web, 15.3, 9);
    // §5.5 prints 18.82646: BA at 90° is (1.6 + 0.645) · π/2 = 3.526438, so 18.82644.
    close(at90.spacing, 18.82644);
  });
  it('makes the step it was asked for: measured on the folded part, outside to outside it is offset + t', () => {
    for (const [step, angle] of [
      [6.35, 45],
      [20, 90],
      [12, 60],
    ]) {
      const { spacing } = offsetSpacing({ offset: step, angle, ...numbers(angle) });
      const fold = foldSheet(
        sheet([
          { a: [100, -1], b: [100, 101], angle },
          { a: [100 + spacing, -1], b: [100 + spacing, 101], angle, direction: 'down' },
        ]),
        rect(300),
      );
      close(height(fold), step + 1.5, 6);
      // The two outer faces stay parallel: the far pieces are not tilted.
      const far = fold.pieces.find((p) => p.outer.some(([x]) => x > 290));
      const z = (x) => transformPoint(far.matrix, [x, 50, 0])[2];
      close(z(250), z(290), 9);
    }
  });
});

describe('the §5.5 table: SPCC t 1.5, automatic tooling, 50 t × 2 m press, 100 wide', () => {
  it('300 long, gauged off the right end, L 200, Offset 6.35 at 45°: made A then B, both clear', () => {
    const station = offset(300, { edge: RIGHT, distance: 200, offset: 6.35, angle: 45 });
    const { pending } = station;
    expect(pending.refusals).toEqual([]);
    expect(pending.collision.hit).toBeNull();
    close(pending.offset.spacing, 8.79667);
    close(pending.offset.web, 7.03345);
    expect(pending.offset.order).toBe('ab');
    expect(pending.offset.note).toBeNull();
    const [one, two] = pending.offset.hits;
    expect(one).toMatchObject({ label: 'Hit 1', line: 'Line A', direction: 'up', ok: true, around: false });
    expect(two).toMatchObject({ label: 'Hit 2', line: 'Line B', direction: 'down', ok: true, around: false });
    close(one.distance, 200, 9);
    close(two.distance, 191.20333);
    expect(station.gauge.distance).toBeCloseTo(200, 9);
    // The pedal: two ordinary records, in the order made; the step 7.85 high; the sequence clears.
    const stroke = made(station);
    expect(stroke.bends.map((b) => [b.direction, b.angle])).toEqual([
      ['up', 45],
      ['down', 45],
    ]);
    expect(stroke.bends.every((b) => !('stroke' in b))).toBe(true);
    close(height(stroke.view.fold), 7.85, 6);
    expect(sequenceChecks({ fold: stroke.view.fold, machine }).map((c) => [c.refusals, c.collision])).toEqual([
      [[], null],
      [[], null],
    ]);
  });
  it('260 long, line A 60 from the left end gauged off the right end, Offset 20 at 90°: A then B clears', () => {
    const { pending } = offset(260, { edge: RIGHT, distance: 200, offset: 20, angle: 90 });
    close(pending.offset.spacing, 18.82644);
    expect(pending.offset.order).toBe('ab');
    expect(pending.refusals).toEqual([]);
    expect(pending.collision.hit).toBeNull();
    close(pending.offset.hits[1].distance, 260 - 60 - pending.offset.spacing, 6);
  });
  it('260 long, gauged off the left end with line B 60 from it: A then B is refused, B then A is made and said', () => {
    const { spacing } = offsetSpacing({ offset: 20, angle: 90, ...numbers(90) });
    const station = offset(260, { edge: LEFT, distance: 60 + spacing, offset: 20, angle: 90 });
    const { pending } = station;
    expect(pending.offset.order).toBe('ba');
    expect(pending.offset.note).toBe('Made the other way round: the shorter side hangs down.');
    expect(pending.refusals).toEqual([]);
    expect(pending.collision.hit).toBeNull();
    const [one, two] = pending.offset.hits;
    expect(one).toMatchObject({ line: 'Line B', direction: 'down', ok: true, around: false });
    close(one.distance, 60, 6);
    // Line A after line B: the left end is beyond B now, so the hit gauges off the right end (turned around).
    expect(two).toMatchObject({ line: 'Line A', direction: 'up', ok: true, around: true });
    close(two.distance, 260 - 60 - spacing, 6);
    // A then B (the 181 mm side hanging) is what the machine refuses: tried here as two ordinary hits.
    const abFold = foldSheet(
      sheet([
        { a: [60 + spacing, -1], b: [60 + spacing, 101] },
        { a: [60, -1], b: [60, 101], direction: 'down' },
      ]),
      rect(260),
    );
    const second = brakeCollisions({ fold: abFold, bendId: 'b2', machine, gaugePoint: [0, 50] });
    expect(second.hit).toMatchObject({ tool: 'bed' });
    // The records are in the order made: B (down) first.
    const stroke = made(station);
    expect(stroke.bends.map((b) => b.direction)).toEqual(['down', 'up']);
    close(stroke.bends[0].a[0], 60, 6);
    expect(sequenceChecks({ fold: stroke.view.fold, machine }).every((c) => !c.collision && !c.refusals.length)).toBe(
      true,
    );
  });
  it('300 long, line A 100 from the left end, Offset 20 at 90°: refused both ways with the §5.4 message; 40 clears', () => {
    const { pending } = offset(300, { edge: RIGHT, distance: 200, offset: 20, angle: 90 });
    expect(pending.offset.order).toBeNull();
    expect(pending.pair).toBeNull();
    const hit = pending.collision.hit;
    expect(hit).toMatchObject({ tool: 'bed' });
    expect(hit.message).toBe(
      'Bend 2: the 100 mm side hangs down beside the die and meets the bed (the V10 88° die stands 80 mm above it). Neither order clears: shorten the side that hangs to 79.9 mm or less, or make the step at least 30.6 mm so it hangs clear of the bed.',
    );
    // The pose before the pedal is the second hit at the contact, the first bend hanging.
    expect(pending.view).toMatchObject({ bendId: 'pending-hit:2', angles: { 'pending-hit:2': hit.angle } });
    // Each remedy tried again: a 30.6 mm step clears (30 does not), 40 clears, and a side of 79.9 mm clears.
    expect(offset(300, { edge: RIGHT, distance: 200, offset: 30.6, angle: 90 }).pending.offset.order).toBe('ab');
    expect(offset(300, { edge: RIGHT, distance: 200, offset: 30, angle: 90 }).pending.offset.order).toBeNull();
    expect(offset(300, { edge: RIGHT, distance: 200, offset: 40, angle: 90 }).pending.offset.order).toBe('ab');
    const shorter = offset(279.9, { edge: RIGHT, distance: 200, offset: 20, angle: 90 }).pending;
    expect(shorter.offset.order).toBe('ab');
    // B then A (the 181 mm side hanging) was tried too and is refused.
    const { spacing } = offsetSpacing({ offset: 20, angle: 90, ...numbers(90) });
    const baFold = foldSheet(
      sheet([
        { a: [100 + spacing, -1], b: [100 + spacing, 101], direction: 'down' },
        { a: [100, -1], b: [100, 101] },
      ]),
      rect(300),
    );
    for (const turned of [false, true])
      expect(brakeCollisions({ fold: baFold, bendId: 'b2', machine, turned }).hit).toMatchObject({ tool: 'bed' });
  });
  it('260 long, Offset 5 at 45°: the web is short of the V10 die; the die offered is tried and clears', () => {
    const { pending } = offset(260, { edge: RIGHT, distance: 200, offset: 5, angle: 45 });
    expect(pending.offset.order).toBeNull();
    const [refusal] = pending.refusals;
    expect(refusal.code).toBe('offset-small');
    expect(refusal.message).toBe(
      'Offset 5 mm at 45° is too small for the V10 88° die: the web leaves 6.01 mm beside the punch line; the die needs 6.61 mm to carry it. The smallest it makes at 45° is 5.9 mm. The V8 88° die makes 5 mm.',
    );
    // Judgment call (§11): the nearest die that makes it, the V8; §5.5 names the V6, which clears too.
    expect(refusal.fix).toEqual({ label: 'Use the V8 88° die', session: { die: 'v8-88' } });
    for (const die of ['v8-88', 'v6-88']) {
      const fixed = offset(260, { edge: RIGHT, distance: 200, offset: 5, angle: 45, die }).pending;
      expect(fixed.refusals, die).toEqual([]);
      expect(fixed.collision.hit, die).toBeNull();
      expect(fixed.offset.hits.map((h) => h.ok)).toEqual([true, true]);
    }
    // The smallest the V10 makes, tried: 5.9 clears, 5.8 does not.
    expect(offset(260, { edge: RIGHT, distance: 200, offset: 5.9, angle: 45 }).pending.offset.order).not.toBeNull();
    expect(offset(260, { edge: RIGHT, distance: 200, offset: 5.8, angle: 45 }).pending.offset.order).toBeNull();
  });
  it('the same at Offset 4: no die makes it; the card says the smallest offset that works at 45°', () => {
    const { pending } = offset(260, { edge: RIGHT, distance: 200, offset: 4, angle: 45 });
    const [refusal] = pending.refusals;
    expect(refusal.fix).toBeUndefined();
    expect(refusal.message).toBe(
      'Offset 4 mm at 45° is too small for the V10 88° die: the web leaves 4.59 mm beside the punch line; the die needs 6.61 mm to carry it. The smallest it makes at 45° is 5.9 mm. The V6 88° die makes 4.5 mm and up.',
    );
    // With the V6 die the side bent first meets the die's body at 4 mm; 4.5 clears (between 4 and 5, §5.5).
    const v6 = (step) => offset(260, { edge: RIGHT, distance: 200, offset: step, angle: 45, die: 'v6-88' }).pending;
    const four = v6(4);
    expect(four.offset.order).toBeNull();
    expect(four.refusals[0].message).toMatch(
      /^Offset 4 mm at 45° is too small for the V6 88° die: the side bent first meets the die's body\./,
    );
    expect(v6(4.5).offset.order).toBe('ab');
    expect(v6(4.4).offset.order).toBeNull();
  });
  it('draws both lines on the flat blank and poses the first hit flat on the die', () => {
    const station = offset(300, { edge: RIGHT, distance: 200, offset: 6.35, angle: 45 });
    const [a, b] = station.pending.offset.lines;
    expect(a).toMatchObject({ name: 'Line A', direction: 'up' });
    expect(b).toMatchObject({ name: 'Line B', direction: 'down' });
    close(a.segments[0][0][0], 100, 9);
    close(b.segments[0][0][0], 108.79667);
    expect(station.view).toMatchObject({ bendId: 'pending-hit', angles: { 'pending-hit': 0 }, gaugeDistance: 200 });
  });
  it('turns over with Flip sheet: line A down, line B up', () => {
    const { pending } = offset(300, { edge: RIGHT, distance: 200, offset: 6.35, angle: 45, flip: true });
    expect(pending.offset.hits.map((h) => h.direction)).toEqual(['down', 'up']);
    expect(pending.offset.order).toBe('ab');
  });
  it('makes both hits in one stroke: hit one, the turn, hit two', () => {
    const station = offset(300, { edge: RIGHT, distance: 200, offset: 6.35, angle: 45 });
    const stroke = made(station);
    expect(stroke.run.hits.map((h) => h.bendId)).toEqual(['x', 'x-2']);
    expect(stroke.run.hits[0].angles).toEqual({ 'x-2': 0 });
    expect(stroke.run.hits[1].gaugeDistance).toBeCloseTo(191.20333, 5);
    expect(stroke.bend.id).toBe('x-2');
    const { timeline } = stroke.run;
    expect(timeline).toMatchObject({ pair: true, turn: TURN_MS });
    close(timeline.total, timeline.first.total + TURN_MS + timeline.second.total, 9);
    const first = strokeTimeline(machine, station.pending.pair[0].readouts.ramDepth);
    close(timeline.first.total, first.total, 9);
    expect(strokeAt(timeline, first.total / 2, 45)).toMatchObject({ part: 0, done: false });
    expect(strokeAt(timeline, first.total + TURN_MS / 2, 45)).toMatchObject({ phase: 'turn', part: 0, turn: 0.5 });
    expect(strokeAt(timeline, first.total + TURN_MS + 1, 45)).toMatchObject({ phase: 'approach', part: 1 });
    expect(strokeAt(timeline, timeline.total + 1, 45)).toMatchObject({ phase: 'done', part: 1, done: true });
  });
});

describe('Turn sheet around (§5.2)', () => {
  it('picks the opposite parallel edge and the same punch line from there; the other side goes back', () => {
    const before = brakeStation({ model: modelOf(300), session: session({ edge: RIGHT, distance: 200 }) });
    const patch = turnAround(before, session({ edge: RIGHT, distance: 200 }));
    expect(patch).toEqual({ edge: LEFT, distance: 100, turned: false });
    const after = brakeStation({ model: modelOf(300), session: session(patch) });
    const [p, q] = [before.pending.bend, after.pending.bend];
    // The same line: x 100, whichever way it runs.
    for (const bend of [p, q]) close(bend.a[0], 100, 9);
    // The other side at the back: the right of the line, then the left.
    const backX = (station) => {
      const bend = station.pending.bend;
      const side = backSide(bend, { gaugePoint: station.gaugePoint });
      // A flat point on the side that goes back.
      const probe = side === 'moving' ? [bend.a[0] + bend.n[0], 50] : [bend.a[0] - bend.n[0], 50];
      return Math.sign(probe[0] - 100);
    };
    expect(backX(before)).toBe(1);
    expect(backX(after)).toBe(-1);
    close(after.gauge.distance, 100, 9);
    // Back again: the original edge and L.
    expect(turnAround(after, session(patch))).toEqual({ edge: RIGHT, distance: 200, turned: false });
  });
  it('finds the farthest opposite edge on a stepped outline', () => {
    const edges = [
      { index: 0, d: [0, 1], inward: [-1, 0], a: [300, 0] },
      { index: 1, d: [0, -1], inward: [1, 0], a: [0, 100] },
      { index: 2, d: [0, -1], inward: [1, 0], a: [40, 50] },
    ];
    expect(oppositeEdge(edges, edges[0], [100, 50])).toMatchObject({ edge: edges[1], distance: 100 });
  });
  it('toggles `turned` on a two-point line, which the check, the pose and the stroke use', () => {
    const points = {
      mode: 'points',
      points: [
        [100, 0],
        [100, 100],
      ],
    };
    const plain = brakeStation({ model: modelOf(300), session: session(points) });
    expect(turnAround(plain, session(points))).toEqual({ turned: true });
    const turned = brakeStation({ model: modelOf(300), session: session({ ...points, turned: true }) });
    expect(turned.view.turned).toBe(true);
    expect(plain.view.turned).toBe(false);
    // The pose puts the other side back: the frame's back side swaps.
    const posed = poseFold(turned.pending.fold, { 'pending-hit': 0 });
    const frame = (t) => brakeFrame(posed, 'pending-hit', { turned: t });
    expect(frame(true).back).not.toBe(frame(false).back);
    expect(turnAround(turned, session({ ...points, turned: true }))).toEqual({ turned: false });
  });
  it('turns the collision card\'s "turned around it clears" into a button, only when the whole hit passes', () => {
    // A U channel with the gooseneck reversed (its throat to the backgauge): the standing flange meets its neck.
    const channel = modelOf(115, [{ a: [45, -1], b: [45, 61], punch: 'straight-88' }], 60);
    const reversed = { edge: RIGHT, distance: 20, punch: 'gooseneck-88', reverse: true };
    const { pending } = brakeStation({ model: channel, session: session(reversed) });
    expect(pending.collision.hit).toMatchObject({ tool: 'punch' });
    expect(pending.collision.turnedClears).toBe(true);
    expect(pending.collision.turn).toEqual({
      label: 'Turn the sheet around',
      // Past the made bend from the left edge: a flat distance, named so (skin gauge §4.5 step 1).
      session: { edge: LEFT, distance: 95, turned: false, stop: null },
    });
    const turned = brakeStation({
      model: channel,
      session: session({ ...reversed, ...pending.collision.turn.session }),
    });
    expect(turned.pending.refusals).toEqual([]);
    expect(turned.pending.collision.hit).toBeNull();
    // The straight punch: turned around the flange still meets it, so no button.
    const straight = brakeStation({ model: channel, session: session({ edge: RIGHT, distance: 20 }) }).pending;
    expect(straight.collision.hit).toMatchObject({ tool: 'punch' });
    expect(straight.collision.turn).toBeUndefined();
  });
  it('a session from before BT-2 (no turned, no offset) behaves as before', () => {
    const old = { ...session({ edge: RIGHT, distance: 200 }) };
    delete old.turned;
    delete old.offset;
    const a = brakeStation({ model: modelOf(300), session: old });
    const b = brakeStation({ model: modelOf(300), session: session({ edge: RIGHT, distance: 200 }) });
    expect(a.pending.readouts).toEqual(b.pending.readouts);
    expect(a.view.turned).toBe(false);
    expect(a.pending.offset).toBeUndefined();
  });
});

describe('a side that hangs down from a back-to-back pair (§5.4)', () => {
  // Line A made up 90° at x 100 of a 300 blank, then line B down 18.83 mm nearer the right end.
  const { spacing } = offsetSpacing({ offset: 20, angle: 90, ...numbers(90) });
  it('says the facts and only what was tried: neither order, the shorter side, the larger step', () => {
    const model = modelOf(300, [{ a: [100, -1], b: [100, 101] }]);
    const { pending } = brakeStation({
      model,
      session: session({ edge: RIGHT, distance: 300 - 100 - spacing, flip: true }),
    });
    // Tight bends TB-2 (docs/sketch-studio-tight-bends.md §5.2): after the hanging side's own
    // remedies, the brake tried bend 1 part-way first and it passes: offered, as its button says.
    // 45° since docs/sketch-studio-shop-punches.md §6.4 (PART_WAY tries 45° first; 60° passes too).
    expect(pending.collision.hit.message).toBe(
      'Bend 2: the 100 mm side hangs down beside the die and meets the bed (the V10 88° die stands 80 mm above it). Neither order clears: shorten the side that hangs to 79.9 mm or less, or make the step at least 30.6 mm so it hangs clear of the bed. Or bend 1 to 45° first, finish it after this hit.',
    );
    expect(pending.collision.ways).toMatchObject({
      first: null,
      partway: { label: 'Bend 1 to 45° first, finish it after this hit' },
    });
    expect(pending.collision.hit.hanging).toMatchObject({ tool: 'bed', otherFirst: false, shorten: 79.9 });
    // No "flip the sheet", no "bend this one before bend 1".
    expect(pending.collision.hit.message).not.toMatch(/flip|before bend/i);
  });
  it('offers the other order when it was tried and clears', () => {
    // B made first (down) at 78.83 of a 260 blank, then A up at 60 off the left end: the 181 mm side hangs.
    const model = modelOf(260, [{ a: [60 + spacing, -1], b: [60 + spacing, 101], direction: 'down' }]);
    const { pending } = brakeStation({ model, session: session({ edge: LEFT, distance: 60 }) });
    expect(pending.collision.hit.message).toBe(
      'Bend 2: the 181.2 mm side hangs down beside the die and meets the bed (the V10 88° die stands 80 mm above it). Bend the other one first, so the 60 mm side hangs instead.',
    );
    expect(pending.collision.hit.earlier).toBe(1);
    // Tried: the other order clears.
    const other = modelOf(260, [{ a: [60, -1], b: [60, 101] }]);
    expect(
      brakeStation({ model: other, session: session({ edge: RIGHT, distance: 200 - spacing, flip: true }) }).pending
        .collision.hit,
    ).toBeNull();
  });
  it('words the facts alone when the remedies are not asked for', () => {
    const hanging = {
      prefix: 'Bend 2',
      tool: 'die',
      side: 260,
      other: 60,
      die: { name: 'V10 88°', height: 80, width: 18 },
      otherFirst: false,
      broken: null,
      shorten: null,
      advised: false,
    };
    expect(hangingMessage(hanging)).toBe(
      "Bend 2: the 260 mm side hangs down and meets the die's body (the V10 88° die is 18 mm wide).",
    );
    expect(hangingMessage({ ...hanging, advised: true }, { step: 6 })).toBe(
      "Bend 2: the 260 mm side hangs down and meets the die's body (the V10 88° die is 18 mm wide). Neither order clears: make the step at least 6 mm so it hangs clear of the die.",
    );
  });
  it('cuts the side that hangs for the shorter-side try, the bend zones past the cut left out', () => {
    const fold = foldSheet(
      sheet([
        { a: [100, -1], b: [100, 101] },
        { a: [100 + spacing, -1], b: [100 + spacing, 101], direction: 'down' },
      ]),
      rect(300),
    );
    const bend = fold.bends[0];
    const web = fold.pieces.find((p) => p.outer.some(([x]) => Math.abs(x - 110) < 9)).id;
    const surface = partSurface(fold);
    const cut = shortenedSurface(surface, fold, bend, web, 50);
    const xs = cut.pieces.flatMap((p) => p.triangles.flat().map(([x]) => x));
    expect(Math.min(...xs)).toBeCloseTo(50, 6);
    expect(Math.max(...xs)).toBeCloseTo(300, 6);
    expect(cut.arcs).toHaveLength(surface.arcs.length);
  });
});

describe('Flip sheet on the die (§5.1)', () => {
  it('lies the flat blank the other way up, still on the die top', () => {
    const fold = foldSheet(sheet(), rect(300));
    const up = flatFrame(fold),
      over = flatFrame(fold, { flipped: true });
    const corner = (frame) => transformPoint(frame.matrix, [0, 0, 0]);
    expect(corner(up)).toEqual([-150, -50, 0]);
    expect(corner(over)).toEqual([-150, 50, 1.5]);
    expect(transformPoint(over.matrix, [0, 0, 1.5])[2]).toBe(0);
    expect(over.span).toEqual(up.span);
  });
  it('says which side is up in the station view', () => {
    const plain = brakeStation({ model: modelOf(300), session: session() });
    expect(plain.view.flipped).toBe(false);
    expect(brakeStation({ model: modelOf(300), session: session({ flip: true }) }).view.flipped).toBe(true);
  });
  it('times the turn at about half a second and runs a pair of hits through it', () => {
    expect(TURN_MS).toBe(500);
    const one = strokeTimeline(machine, 2);
    const pair = pairTimeline(one, one);
    expect(pair.total).toBeCloseTo(2 * one.total + 500, 9);
  });
});

describe('the radius punch holders (§5.6)', () => {
  it('reads the HH-015 and HH-016 outlines from the catalogue drawing: 100 and 103.5 high, 41 wide', () => {
    expect(RADIUS_HOLDERS['HH-015']).toMatchObject({ height: 100, width: 41 });
    expect(RADIUS_HOLDERS['HH-016']).toMatchObject({ height: 103.5, width: 41 });
    for (const holder of Object.values(RADIUS_HOLDERS)) {
      expect(holder.outline[0][1]).toBe(0);
      expect(holder.outline.at(-1)).toEqual([20.5, holder.height]);
      // The foot narrows below the head: it is no square block.
      expect(holder.outline[0][0]).toBeLessThan(20.5);
    }
    expect(RADIUS_PUNCHES.map((p) => p.holderOutline)).toEqual([
      RADIUS_HOLDERS['HH-015'].outline,
      RADIUS_HOLDERS['HH-015'].outline,
      RADIUS_HOLDERS['HH-015'].outline,
      RADIUS_HOLDERS['HH-016'].outline,
      RADIUS_HOLDERS['HH-016'].outline,
    ]);
  });
  it("sits each ruler in its holder's foot: the circle up to the foot, then the holder, still its own mirror", () => {
    for (const punch of RADIUS_PUNCHES) {
      const ring = punchSection(punch);
      const foot = punch.height - punch.holder.height;
      // Below the foot every point lies on the ruler's circle.
      for (const [y, z] of ring.filter(([, z]) => z < foot - 1e-9))
        expect(Math.hypot(y, z - punch.radius)).toBeCloseTo(punch.radius, 9);
      expect(punchSymmetric(punch)).toBe(true);
    }
    // The R10's ruler meets its foot 14.3 mm up, 9 mm out: the 41 mm head is 80 mm higher.
    const r10 = punchSection(PUNCHES['radius-10']);
    const footCorner = r10.find(([y]) => y === 12.86);
    expect(footCorner[1]).toBeCloseTo(14.3, 9);
    expect(Math.max(...r10.filter(([, z]) => z < 80).map(([y]) => Math.abs(y)))).toBeCloseTo(19.52, 9);
  });
  it("makes a plain bend with every radius punch up to its die's limit, either way round", () => {
    // Before BT-2 the R10 hit its square holder: "the part hits the punch at 86.3°".
    for (const punch of RADIUS_PUNCHES) {
      const die = defaultDie(1.5, punch);
      for (const angle of [90, maxBendAngle(die)]) {
        const fold = foldSheet(sheet([{ a: [150, -1], b: [150, 101], angle, punch: punch.key }]), rect(300));
        for (const gaugePoint of [
          [0, 50],
          [300, 50],
        ])
          expect(
            brakeCollisions({ fold, bendId: 'b1', machine, punch: punch.key, die: die.key, gaugePoint }).hit,
            `${punch.key} ${angle}°`,
          ).toBeNull();
      }
    }
  });
  it('the picker says the R10 clears that bend', () => {
    const cards = bladeOptions({
      model: modelOf(300),
      session: session({ edge: RIGHT, distance: 150 }),
      kind: 'punch',
    });
    expect(cards.find((c) => c.key === 'radius-10')).toMatchObject({ error: null, refusals: [], collision: null });
  });
});

describe('the collision advice says what was tried (BT-2 follow-up)', () => {
  // SPCC t 1.5: a 90° flange already up, then a hit whose standing flange swings into the punch.
  const flange45 = modelOf(300, [{ a: [45, -1], b: [45, 101] }]);
  const channel = (width = 115) => modelOf(width, [{ a: [45, -1], b: [45, 61], punch: 'straight-88' }], 60);
  const pending = (model, patch) => brakeStation({ model, session: session(patch) }).pending.collision;
  it('names no remedy that was tried and does not clear, and says what was tried', () => {
    // docs/sketch-studio-shop-punches.md §5.4: the whole rack is tried, in order; the A 102
    // (its room toward the operator, or reversed from the other end) is the first that clears,
    // and what was tried before it is said.
    for (const [patch, fix, said] of [
      [
        { edge: RIGHT, distance: 215 },
        'Use the A 102 punch',
        'Use the A 102 punch. Turning the sheet around, bending this one earlier, a part-way bend first and the A 101 punch either way round were tried: none clears.',
      ],
      [
        { edge: LEFT, distance: 85 },
        'Use the A 102 punch, reversed',
        'Use the A 102 punch, reversed. Turning the sheet around, bending this one earlier, a part-way bend first, the A 102 punch and the A 101 punch either way round were tried: none clears.',
      ],
    ]) {
      const collision = pending(flange45, patch);
      expect(collision.fix.label).toBe(fix);
      expect(collision.turn).toBeUndefined();
      // Tight bends TB-2 (§5.2): the order and a part-way bend are tried too; neither clears, so
      // "bend this one earlier" is not said.
      expect(collision.ways).toBeUndefined();
      expect(collision.hit.message.replace(/^Bend 2: the part hits the punch at [\d.]+°\. /, '')).toBe(said);
    }
  });
  it('names the turn alone when only the turn clears', () => {
    // A long channel gauged 620 mm off the right end (out of the backgauge's reach) with the gooseneck reversed:
    // turned round the punch still gauges there; turned around, the sheet gauges 95 off the left end.
    const collision = pending(channel(715), { edge: RIGHT, distance: 620, punch: 'gooseneck-88', reverse: true });
    expect(collision.turn).toEqual({
      label: 'Turn the sheet around',
      // Past the made bend from the left edge: a flat distance, named so (skin gauge §4.5 step 1).
      session: { edge: LEFT, distance: 95, turned: false, stop: null },
    });
    expect(collision.fix).toBeUndefined();
    // Tight bends TB-2 (§5.2): the order and a part-way bend were tried and do not clear: said so.
    expect(collision.hit.message).toMatch(
      // Shop punches §5.4: past two punches the tried list says "every other punch in the rack".
      /^Bend 2: the part hits the punch at [\d.]+°\. Turn the sheet around\. Bending this one earlier, a part-way bend first, turning the punch round and every other punch in the rack, either way round, were tried: none clears\.$/,
    );
  });
  it('names the punch alone when only the punch clears, worded as its button', () => {
    // Shop punches §5.4: the first punch in the rack that clears, the A 101.
    const collision = pending(channel(), { edge: RIGHT, distance: 20 });
    expect(collision.fix.label).toBe('Use the A 101 punch');
    expect(collision.turn).toBeUndefined();
    expect(collision.hit.message).toMatch(
      /^Bend 2: the part hits the punch at [\d.]+°\. Bend this one earlier \(before the flange in the way\), or use the A 101 punch\. Turning the sheet around was tried: it does not clear\.$/,
    );
    // The holders: a taller punch (the A 101, 95 mm), with why.
    const box = modelOf(128, [{ a: [48, -1], b: [48, 61] }], 60);
    expect(pending(box, { edge: RIGHT, distance: 20 }).hit.message).toMatch(
      /^Bend 2: the part hits the punch holder at [\d.]+°\. Bend this one earlier \(before the flange that swings over the punch\), or use the A 101 punch: it holds the clamps higher\. Turning the sheet around was tried: it does not clear\.$/,
    );
  });
  it('with the gooseneck in, reversed: turning the punch round, not "use the gooseneck punch"', () => {
    const collision = pending(channel(), { edge: RIGHT, distance: 20, punch: 'gooseneck-88', reverse: true });
    expect(collision.hit.message).toMatch(
      /^Bend 2: the part hits the punch at [\d.]+°\. Bend this one earlier \(before the flange in the way\), turn the sheet around or turn the punch round\.$/,
    );
  });
  it('never suggests turning the sheet around for a stored step (refused only when both ways round collide)', () => {
    const fold = foldSheet(
      sheet([
        { a: [45, -1], b: [45, 61] },
        { a: [95, -1], b: [95, 61] },
      ]),
      rect(115, 60),
    );
    const [, second] = sequenceChecks({ fold, machine });
    expect(second.collision.message).toMatch(
      /^Bend 2: the part hits the punch at [\d.]+°\. Bend this one earlier \(before the flange in the way\), or use the gooseneck punch\.$/,
    );
  });
  it('gives the fact alone, and no button, without advice; the advice only where it can differ', () => {
    const facts = brakeStation({ model: channel(), session: session({ edge: RIGHT, distance: 20 }), advise: false });
    expect(facts.pending.collision.hit.message).toMatch(/^Bend 2: the part hits the punch at [\d.]+°\.$/);
    expect(facts.pending.collision.fix).toBeUndefined();
    expect(facts.pending.collision.turn).toBeUndefined();
    expect(needsAdvice(facts)).toBe(true);
    // A clear hit, an ordinary refusal: the facts are the advice.
    expect(
      needsAdvice(
        brakeStation({ model: modelOf(300), session: session({ edge: RIGHT, distance: 150 }), advise: false }),
      ),
    ).toBe(false);
    expect(needsAdvice(offset(300, { edge: RIGHT, distance: 200, offset: 6.35, angle: 45 }))).toBe(false);
    // A refused offset: its searches wait for the advice; the facts keep the lines, the hits and the pose.
    const fast = brakeStation({
      model: modelOf(300),
      session: session({ shape: 'offset', edge: RIGHT, distance: 200, offset: 20, angle: 90 }),
      advise: false,
    });
    const full = offset(300, { edge: RIGHT, distance: 200, offset: 20, angle: 90 });
    expect(needsAdvice(fast)).toBe(true);
    expect(fast.pending.offset.hits).toEqual(full.pending.offset.hits);
    expect(fast.view.angles).toEqual(full.view.angles);
    expect(fast.pending.collision.hit.message).toBe(
      'Bend 2: the 100 mm side hangs down beside the die and meets the bed (the V10 88° die stands 80 mm above it).',
    );
  });
});
