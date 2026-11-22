// Bend one piece of the line (docs/sketch-studio-piece-pick.md, PK-1 §5.7):
// on the lip tray, §3's numbers as they stood before the change; the pick
// (pieceChoice: plain, add, take out, the last one kept, out of range); the
// lengths that stay when the pieces change (§5.2, both orders, the die the
// same, the comb); what a line starts with and what a new L keeps (§5.3);
// and the honest words (§5.4).
import { describe, expect, it } from 'vitest';
import { poseFold } from './sheetMetal.js';
import { brakeFrame, machineFrom } from './pressBrake.js';
import {
  brakePatch,
  brakeSessionDefaults,
  brakeStation,
  pieceChoice,
  pieceDefault,
  piecesTogether,
  sessionLine,
  startStroke,
  turnAround,
} from './brakeStation.js';
import {
  PIECE_PICK_PX,
  brakeHint,
  edgeSegments,
  fingerPlacement,
  fingerRestore,
  nearestPiece,
  pieceChip,
  pieceOffer,
  pieceSegments,
} from './brakeHands.js';
import { FAR_LIP_EDGE, FIRST_LIP_EDGE, FLANGE_EDGE, ONE_PIECE_TRAY, lipTrayModel } from './piecePick.fixtures.js';

const close = (value, expected, digits = 6) => expect(value).toBeCloseTo(expected, digits);
const fresh = (extra = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  mode: 'gauge',
  angle: 90,
  ...extra,
});
// The workspace's rule: every patch through brakePatch with the station of the session it applies to.
const stationOf = (model, s) => brakeStation({ model, session: s, advise: false });
const apply = (model, s, patch) => brakePatch(s, patch, stationOf(model, s));
const clears = (pending) => !pending.error && !pending.refusals.length && !pending.collision.hit;
const runsOf = (runs) => runs.map(([a, b]) => [Number(a.toFixed(6)), Number(b.toFixed(6))]);
// The machine frame's X translation of the pending hit, as the shop layer poses it.
function frameX(station) {
  const view = station.view;
  const side = { gaugePoint: view.gaugePoint || null, turned: Boolean(view.turned) };
  const posed = poseFold(view.fold, view.angles || {}, machineFrom(view.fold, view.bendIds, side));
  return brakeFrame(posed, view.bendId, { die: view.die, ...side, members: view.bendIds, bed: 2000 }).matrix[12];
}

const TRAY = lipTrayModel();
// The first lip's edge at L 15: the line x = 410 across the three pieces.
const lipLine = () => apply(TRAY, fresh(), { edge: FIRST_LIP_EDGE, distance: 15 });
// Typing a length (PressBrakePanel.jsx BladeLength's commit): the trim per end, or the bend's own length held.
const typeLength = (model, s, length, [trim, hold] = ['punchTrim', 'punchHold']) => {
  const st = stationOf(model, s);
  const [[a, b]] = st.pending.tooling.fitted;
  const next = Math.round(((b - a - length) / 2) * 1e6) / 1e6;
  return apply(
    model,
    s,
    Math.abs(next) < 1e-6 ? { [trim]: null, [hold]: length, scrub: null } : { [trim]: next, scrub: null },
  );
};
// The first lip bent (90° up), the far lip and the flange still flat.
function lipBent() {
  const station = stationOf(TRAY, { ...lipLine(), skip: [1, 2] });
  const { bends } = startStroke({ station, token: 't', id: 'lip1' });
  return lipTrayModel(bends);
}

describe('§3 as it stood (the fixture)', () => {
  it('three pieces at 26 – 108 / 112 – 634 / 638 – 720, one run ±347, the frame at 66 / 372 / 678 for each alone', () => {
    const s = lipLine();
    const station = stationOf(TRAY, s);
    expect(station.segments.map((p) => [p.index, p.s0, p.s1])).toEqual([
      [0, 26, 108],
      [1, 112, 634],
      [2, 638, 720],
    ]);
    expect(s.skip).toEqual([]);
    expect(runsOf(station.pending.tooling.fitted)).toEqual([[-347, 347]]);
    const alone = [0, 1, 2].map((k) => stationOf(TRAY, { ...s, skip: pieceChoice(3, [], k) }));
    alone.forEach((st, k) => close(frameX(st), [66, 372, 678][k], 6));
    expect(alone.map((st) => runsOf(st.pending.tooling.fitted))).toEqual([[[-41, 41]], [[-261, 261]], [[-41, 41]]]);
    expect(alone.every((st) => clears(st.pending))).toBe(true);
  });
});

describe('pieceChoice (§5.1)', () => {
  it('plain: only that piece; add: in or out; the last piece stays; out of range: nothing', () => {
    expect(pieceChoice(3, [], 0)).toEqual([1, 2]);
    expect(pieceChoice(3, [1, 2], 2)).toEqual([0, 1]);
    // Already the only piece in: nothing changes.
    expect(pieceChoice(3, [1, 2], 0)).toBe(null);
    // Add: a piece left flat goes in; one in goes out.
    expect(pieceChoice(3, [1, 2], 1, { add: true })).toEqual([2]);
    expect(pieceChoice(3, [2], 0, { add: true })).toEqual([0, 2]);
    expect(pieceChoice(3, [], 1, { add: true })).toEqual([1]);
    // The last piece in the hit cannot be taken out.
    expect(pieceChoice(3, [1, 2], 0, { add: true })).toBe(null);
    for (const index of [3, -1, 1.5, null]) expect(pieceChoice(3, [], index)).toBe(null);
    // A skip naming pieces the line no longer has reads as the pieces it does.
    expect(pieceChoice(2, [5], 0)).toEqual([1]);
  });
});

describe('§5.2 the lengths stay when the pieces change', () => {
  it('82 typed with every piece in, then only the lip: trim null, hold 82, punch ±41, clear; every piece: trim 306', () => {
    let s = typeLength(TRAY, lipLine(), 82);
    expect([s.punchTrim, s.punchHold]).toEqual([306, 82]);
    s = apply(TRAY, s, { skip: pieceChoice(3, s.skip, 0), scrub: null });
    expect([s.punchTrim, s.punchHold]).toEqual([null, 82]);
    const pending = stationOf(TRAY, s).pending;
    expect(runsOf(pending.tooling.punch)).toEqual([[-41, 41]]);
    expect(clears(pending)).toBe(true);
    s = apply(TRAY, s, { skip: [], scrub: null });
    expect([s.punchTrim, s.punchHold]).toEqual([306, 82]);
  });

  it('the lip picked, then 82 typed: the same punch; every piece again: trim 306 (and 100 typed: 297)', () => {
    let s = apply(TRAY, lipLine(), { skip: [1, 2], scrub: null });
    s = typeLength(TRAY, s, 82);
    expect([s.punchTrim, s.punchHold]).toEqual([null, 82]);
    expect(apply(TRAY, s, { skip: [], scrub: null })).toMatchObject({ punchTrim: 306, punchHold: 82 });
    s = typeLength(TRAY, s, 100);
    expect([s.punchTrim, s.punchHold]).toEqual([-9, 100]);
    expect(apply(TRAY, s, { skip: [], scrub: null })).toMatchObject({ punchTrim: 297, punchHold: 100 });
  });

  it('the die the same, in both orders', () => {
    const die = ['dieTrim', 'dieHold'];
    let s = typeLength(TRAY, lipLine(), 82, die);
    s = apply(TRAY, s, { skip: [1, 2], scrub: null });
    expect([s.dieTrim, s.dieHold, s.punchTrim]).toEqual([null, 82, null]);
    expect(runsOf(stationOf(TRAY, s).pending.tooling.die)).toEqual([[-41, 41]]);
    s = apply(TRAY, s, { skip: [], scrub: null });
    expect([s.dieTrim, s.dieHold]).toEqual([306, 82]);
    let t = apply(TRAY, lipLine(), { skip: [1, 2], scrub: null });
    t = apply(TRAY, typeLength(TRAY, t, 82, die), { skip: [], scrub: null });
    expect([t.dieTrim, t.dieHold]).toEqual([306, 82]);
  });

  it('the comb: a trim with several runs, then one piece: the trim kept, the hold read; a hold never 0 or below', () => {
    const comb = lipTrayModel(
      [],
      [
        [0, 0],
        [95, 0],
        [95, 60],
        [105, 60],
        [105, 0],
        [195, 0],
        [195, 60],
        [205, 60],
        [205, 0],
        [300, 0],
        [300, 100],
        [0, 100],
      ],
    );
    const line = {
      mode: 'points',
      points: [
        [-1, 30],
        [301, 30],
      ],
    };
    let s = apply(comb, fresh(), line);
    s = apply(comb, s, { skip: [1], scrub: null });
    s = apply(comb, s, { punchTrim: 5, scrub: null });
    expect(s.punchTrim).toBe(5);
    expect('punchHold' in s).toBe(false);
    // Every tab again: one run of 300, the trim kept and the hold read from it.
    s = apply(comb, s, { skip: [], scrub: null });
    expect([s.punchTrim, s.punchHold]).toEqual([5, 290]);
    // A trim that leaves nothing of the one run: no hold, the trim kept.
    let t = apply(comb, apply(comb, fresh(), line), { skip: [1], scrub: null });
    t = apply(comb, apply(comb, t, { punchTrim: 160, scrub: null }), { skip: [], scrub: null });
    expect(t.punchTrim).toBe(160);
    expect('punchHold' in t).toBe(false);
    // §3 item 3 on the lip tray: never −530, and a trim typed past the lip's own length holds nothing.
    const lip = apply(TRAY, typeLength(TRAY, lipLine(), 82), { skip: [1, 2], scrub: null });
    expect(lip.punchHold).toBe(82);
    expect('punchHold' in apply(TRAY, lip, { punchTrim: 41, scrub: null })).toBe(false);
  });
});

describe('§5.3 what a line starts with, and what a new L keeps', () => {
  const bent = lipBent();
  it('the first lip bent, the same line by edge 11, edge 3 and edge 7 (L 118): the made lip starts left flat, clear', () => {
    for (const [edge, distance] of [
      [FAR_LIP_EDGE, 15],
      [FIRST_LIP_EDGE, 15],
      [FLANGE_EDGE, 118],
    ]) {
      const s = apply(bent, fresh(), { mode: 'gauge', edge, distance, scrub: null });
      const station = stationOf(bent, s);
      expect(s.skip).toEqual([0]);
      expect(station.segments.map((p) => p.made)).toEqual([90, null, null]);
      expect(pieceDefault(station)).toEqual([0]);
      expect(pieceDefault(station, sessionLine(station, s).line)).toEqual([0]);
      expect(clears(station.pending)).toBe(true);
      expect(station.pending.again).toBeUndefined();
      expect(runsOf(station.pending.tooling.fitted)).toEqual([[-304, 304]]);
    }
  });

  it('every piece made: all in, Bend on', () => {
    const station = stationOf(TRAY, lipLine());
    const { bends } = startStroke({ station, token: 't', id: 'all' });
    const made = lipTrayModel(bends);
    const s = apply(made, fresh(), { mode: 'gauge', edge: FIRST_LIP_EDGE, distance: 15, scrub: null });
    expect(s.skip).toEqual([]);
    const after = stationOf(made, s);
    expect(after.segments.every((p) => p.made === 90)).toBe(true);
    expect(after.pending.again.bendIds).toHaveLength(3);
  });

  it('L 15 → 14 → 20 typed and by the fingers with only the lip in: still only the lip; Esc restores', () => {
    let s = typeLength(TRAY, lipLine(), 82);
    s = apply(TRAY, s, { skip: [1, 2], scrub: null });
    for (const distance of [14, 20]) {
      s = apply(TRAY, s, { distance, scrub: null });
      expect(s.skip).toEqual([1, 2]);
      expect([s.punchTrim, s.punchHold]).toEqual([null, 82]);
    }
    // The fingers' drag (CadWorkspace.jsx brakeFingers): one patch per L, its stop first; Esc one patch back.
    const before = apply(TRAY, s, { distance: 15, scrub: null });
    const from = fingerRestore(before);
    let dragged = before;
    for (const distance of [14, 15, 16, 17, 18, 19, 20]) {
      dragged = apply(TRAY, dragged, { distance, scrub: null, dragStop: from.stop ?? null });
      expect(dragged.skip).toEqual([1, 2]);
      expect(dragged.punchHold).toBe(82);
    }
    expect(apply(TRAY, dragged, { ...from, scrub: null })).toEqual({ ...before, scrub: null });
    // The card's line drag names a flat distance (stop null): the same.
    expect(apply(TRAY, before, { distance: 13, stop: null, scrub: null }).skip).toEqual([1, 2]);
  });

  it('an L that changes the piece count, or a new edge: the default', () => {
    const s = apply(TRAY, lipLine(), { skip: [1, 2], scrub: null });
    // L 30: the line x = 395 is in the column, past the notches: one piece.
    const inColumn = apply(TRAY, s, { distance: 30, scrub: null });
    expect(inColumn.skip).toEqual([]);
    expect(stationOf(TRAY, inColumn).segments).toHaveLength(1);
    expect(apply(TRAY, s, { mode: 'gauge', edge: FAR_LIP_EDGE, distance: 15, scrub: null }).skip).toEqual([]);
    // The same edge clicked again is no new edge: the pick stays.
    expect(apply(TRAY, s, { mode: 'gauge', edge: FIRST_LIP_EDGE, scrub: null }).skip).toEqual([1, 2]);
    // Without a station, as before: every piece.
    expect(brakePatch(s, { distance: 14 }).skip).toEqual([]);
  });

  it('a pick of every piece is not kept: L onto the made lip’s line leaves it flat', () => {
    const bent2 = lipBent();
    let s = apply(bent2, fresh(), { mode: 'gauge', edge: FIRST_LIP_EDGE, distance: 14, scrub: null });
    expect(s.skip).toEqual([]);
    s = apply(bent2, s, { distance: 15, scrub: null });
    expect(s.skip).toEqual([0]);
    expect(clears(stationOf(bent2, s).pending)).toBe(true);
  });
});

describe('§5.4 honest words', () => {
  it('the lip alone with punch 100: tool-over-flat naming 5 mm; its fix clears it; punch 90 passes', () => {
    const lip = apply(TRAY, lipLine(), { skip: [1, 2], scrub: null });
    const s = typeLength(TRAY, lip, 100);
    const { pending } = stationOf(TRAY, s);
    // The flange and the far lip, along the bend (its line runs −y here), from the lip's middle.
    expect(runsOf(pending.tooling.flat)).toEqual([
      [-653, -571],
      [-567, -45],
    ]);
    const over = pending.refusals.find((r) => r.code === 'tool-over-flat');
    expect(over).toEqual({
      code: 'tool-over-flat',
      message:
        'The punch stands over 5 mm of a piece this hit leaves flat: it would bend that too. Make the punch shorter, or fit it to the bend.',
      // Since the sheet slides by hand (docs/sketch-studio-sheet-slide.md §4.4): the smallest slide that clears.
      fix: { label: 'Slide the sheet 5 mm to the left', session: { slide: -5 } },
    });
    expect(pending.refusals).toHaveLength(1);
    const fixed = apply(TRAY, s, { ...over.fix.session, scrub: null });
    expect(clears(stationOf(TRAY, fixed).pending)).toBe(true);
    // The punch fitted clears it too.
    expect(clears(stationOf(TRAY, apply(TRAY, s, { punchTrim: null, scrub: null })).pending)).toBe(true);
    // 90: 4 mm past each end, over the notch only.
    expect(clears(stationOf(TRAY, typeLength(TRAY, lip, 90)).pending)).toBe(true);
    // A die under the flat flange presses nothing: no refusal for it (it meets the flange
    // as it swings, which the collision check says: §3, checked and left alone).
    const die = stationOf(TRAY, typeLength(TRAY, lip, 100, ['dieTrim', 'dieHold'])).pending;
    expect(die.refusals).toEqual([]);
  });

  it('the fitted punch never stands over a piece left flat', () => {
    for (const skip of [[], [1, 2], [0, 2], [0, 1], [1], [0], [2]]) {
      const { pending } = stationOf(TRAY, { ...lipLine(), skip });
      expect(pending.refusals.map((r) => r.code)).not.toContain('tool-over-flat');
    }
  });

  it('82 with every piece in: the punch does not reach every piece, click the one to bend', () => {
    const { pending } = stationOf(TRAY, typeLength(TRAY, lipLine(), 82));
    expect(pending.refusals).toEqual([
      {
        code: 'tool-cover',
        message:
          'The punch is 82 mm long and does not reach every piece this hit bends (3 pieces, 694 mm end to end). Click the piece to bend: it comes under the punch. Or fit the punch to the bend.',
        fix: { label: 'Fit the punch to the bend', session: { punchTrim: null } },
      },
    ]);
  });

  it('one piece under half pressed: today’s sentence, then the relief', () => {
    const tray = lipTrayModel([], ONE_PIECE_TRAY);
    const s = apply(tray, fresh(), { edge: FIRST_LIP_EDGE, distance: 15 });
    const station = stationOf(tray, s);
    expect(station.segments.map((p) => [p.s0, p.s1])).toEqual([[26, 720]]);
    const { pending } = stationOf(tray, typeLength(tray, s, 82));
    expect(pending.refusals.map((r) => r.message)).toEqual([
      'The punch stands over 82 mm of the 694 mm bend: less than half of it is pressed. Make it longer, or fit it to the bend. A piece of sheet bends whole. To bend a part of it alone, cut a relief across the bend line between that part and the rest (Relief, in the sketcher).',
    ]);
  });

  it('the made lip added back: bent on whole, click a piece to bend only it', () => {
    const bent = lipBent();
    let s = apply(bent, fresh(), { mode: 'gauge', edge: FAR_LIP_EDGE, distance: 15, scrub: null });
    s = apply(bent, s, { skip: pieceChoice(3, s.skip, 0, { add: true }), scrub: null });
    expect(s.skip).toEqual([]);
    expect(stationOf(bent, s).pending.error).toBe(
      "This line is bend 1's line, but the pieces in this hit are not the ones bend 1 bends: a made bend is bent on whole, and nothing else with it. Click a piece to bend only it.",
    );
  });

  it('the offset on several tabs: click the one to offset', () => {
    const s = apply(TRAY, { ...lipLine(), shape: 'offset' }, { shape: 'offset', scrub: null });
    expect(stationOf(TRAY, s).pending.error).toBe(
      'The line crosses 3 separate tabs: an offset is made on one at a time. Click the one to offset: the others are left flat.',
    );
  });
});

it('a plain plate gains nothing: one piece, none made, every piece in', () => {
  const plate = lipTrayModel(
    [],
    [
      [0, 0],
      [300, 0],
      [300, 100],
      [0, 100],
    ],
  );
  const s = apply(plate, fresh(), { edge: 1, distance: 20 });
  expect(s.skip).toEqual([]);
  expect(stationOf(plate, s).segments.map((p) => p.made)).toEqual([null]);
});

// ---------------------------------------------------------------- the PK-1 audit's four fixes
describe('the audit: a made bend over several pieces, the turn, a drag, an angle past the die', () => {
  // A plate with a slot across the line y = 30 and a notch: pieces 1 – 121, 181 – 301, 311 – 401
  // along the two-point line; with the third left out the hit is ONE record over the first two.
  const slotted = (bends = []) => {
    const model = lipTrayModel(bends, [
      [0, 0],
      [300, 0],
      [300, 60],
      [310, 60],
      [310, 0],
      [400, 0],
      [400, 100],
      [0, 100],
    ]);
    model.sketches[0].profile.holes = [
      {
        type: 'polygon',
        points: [
          [120, 20],
          [180, 20],
          [180, 40],
          [120, 40],
        ],
      },
    ];
    return model;
  };
  const across = {
    mode: 'points',
    points: [
      [-1, 30],
      [401, 30],
    ],
  };
  it('a made bend owns all its pieces: they start left flat together, and go in and out together', () => {
    const flat = slotted();
    const first = stationOf(flat, { ...apply(flat, fresh(), across), skip: [2] });
    expect(first.segments.map((p) => [p.s0, p.s1])).toEqual([
      [1, 121],
      [181, 301],
      [311, 401],
    ]);
    expect(first.pending.data.map((d) => [d.a, d.b])).toEqual([
      [
        [0.5, 30],
        [299.5, 30],
      ],
    ]);
    const made = slotted(startStroke({ station: first, token: 't', id: 'b1' }).bends);
    const s = apply(made, fresh(), across);
    const station = stationOf(made, s);
    expect(station.segments.map((p) => [p.made, p.bend])).toEqual([
      [90, 'b1'],
      [90, 'b1'],
      [null, null],
    ]);
    expect(s.skip).toEqual([0, 1]);
    expect(clears(station.pending)).toBe(true);
    const together = piecesTogether(station.segments);
    expect(together).toEqual([[0, 1]]);
    // A plain click on a made piece: its bend's pieces, bent on whole.
    const on = apply(made, s, { skip: pieceChoice(3, s.skip, 0, { together }), scrub: null });
    expect(on.skip).toEqual([2]);
    expect(stationOf(made, on).pending.again).toMatchObject({ bendIds: ['b1'], number: 1 });
    // A chip (add): the bend's pieces in together (the hit is then refused: bent on whole)…
    expect(pieceChoice(3, [0, 1], 1, { add: true, together })).toEqual([]);
    // …and out together; never the last of the hit.
    expect(pieceChoice(3, [], 0, { add: true, together })).toEqual([0, 1]);
    expect(pieceChoice(3, [2], 1, { add: true, together })).toBe(null);
    expect(pieceChoice(3, [0, 1], 2, { add: true, together })).toBe(null);
  });

  it('Turn sheet around keeps the pick and the length: the same pieces, seen from the other side', () => {
    let s = apply(TRAY, typeLength(TRAY, lipLine(), 82), { skip: [1, 2], scrub: null });
    const patch = turnAround(stationOf(TRAY, s), s);
    expect(patch).toEqual({ edge: 15, distance: 410, turned: false });
    s = apply(TRAY, s, { ...patch, scrub: null });
    const station = stationOf(TRAY, s);
    // The line runs the other way from the left edge: the lip is the last piece now.
    expect(station.segments.map((p) => [p.s0, p.s1, p.skipped])).toEqual([
      [26, 108, true],
      [112, 634, true],
      [638, 720, false],
    ]);
    expect([s.punchTrim, s.punchHold]).toEqual([null, 82]);
    expect(runsOf(station.pending.tooling.punch)).toEqual([[-41, 41]]);
    // A new edge is still a new line (the far lip's, the same x = 410): the default.
    expect(apply(TRAY, apply(TRAY, lipLine(), { skip: [1, 2] }), { edge: FAR_LIP_EDGE, distance: 15 }).skip).toEqual(
      [],
    );
  });

  it('a drag matches the pick against the line it started from: L 16, 18, 30, 19 → the lip again', () => {
    const before = apply(TRAY, lipLine(), { skip: [1, 2], scrub: null });
    const from = fingerRestore(before);
    let s = before;
    const seen = [];
    for (const distance of [16, 18, 30, 19]) {
      s = apply(TRAY, s, { distance, scrub: null, dragStop: from.stop ?? null, dragFrom: from });
      seen.push(s.skip);
      expect('dragFrom' in s).toBe(false);
    }
    expect(seen).toEqual([[1, 2], [1, 2], [], [1, 2]]);
    // Esc as before: the line and its pick back in one patch.
    expect(apply(TRAY, s, { ...from, scrub: null })).toEqual({ ...before, scrub: null });
    // Without the drag's start (typed L), L 30 then 19 starts afresh.
    expect(apply(TRAY, apply(TRAY, before, { distance: 30 }), { distance: 19 }).skip).toEqual([]);
  });

  it('an angle past the die: the angle refusal alone, no leg figures beside it', () => {
    const bent = lipBent();
    let s = apply(bent, fresh(), { mode: 'gauge', edge: FIRST_LIP_EDGE, distance: 15, scrub: null });
    s = apply(bent, s, { skip: pieceChoice(3, s.skip, 0), scrub: null });
    // Bend on the lip alone: the arrival sets 180°, past the V8 88° die.
    expect(s.angle).toBe(180);
    const { pending } = stationOf(bent, s);
    expect(pending.again).toBeTruthy();
    expect(pending.refusals.map((r) => r.code)).toEqual(['angle']);
  });
});

// ---------------------------------------------------------------- PK-2: on the sheet (§6)
describe('PK-2: the pieces on the sheet (§6.1, §6.3, §6.4)', () => {
  // The rest pose as the shop layer draws it (shopLayer.js framePose).
  const pose = (station) => {
    const view = station.view;
    const side = { gaugePoint: view.gaugePoint || null, turned: Boolean(view.turned) };
    const posed = poseFold(view.fold, view.angles || {}, machineFrom(view.fold, view.bendIds, side));
    const frame = brakeFrame(posed, view.bendId, { die: view.die, ...side, members: view.bendIds, bed: 2000 });
    return { posed, frame };
  };
  const xsOf = (segments) => segments.flatMap(([p, q]) => [p[0], q[0]]);

  it('each piece’s stretch on the sheet: in the hit on the punch line, left flat on its own piece, a made one along its bend', () => {
    const station = stationOf(TRAY, { ...lipLine(), skip: [1, 2] });
    const { posed, frame } = pose(station);
    const stretches = station.segments.map((p) => pieceSegments(posed, p, frame.matrix));
    expect(stretches.every((s) => s.length === 1)).toBe(true);
    // Along the bed (machine X), the lip centred: ±41; the flange and the far lip beyond it, on the line (Y 0).
    expect(xsOf(stretches[0]).map((x) => Math.round(Math.abs(x)))).toEqual([41, 41]);
    const flange = xsOf(stretches[1])
      .map(Math.abs)
      .sort((p, q) => p - q);
    close(flange[0], 45, 6);
    close(flange[1], 567, 6);
    for (const s of stretches) for (const p of s[0]) close(p[1], 0, 6);
    // The lip made: its stretch along its bend (the zone's middle stands off the flat line).
    const bent = lipBent();
    const s = apply(bent, fresh(), { mode: 'gauge', edge: FAR_LIP_EDGE, distance: 15, scrub: null });
    const onFlat = stationOf(bent, s);
    const placed = pose(onFlat);
    const lip = pieceSegments(placed.posed, onFlat.segments[0], placed.frame.matrix);
    expect(lip).toHaveLength(1);
    expect(Math.abs(lip[0][0][2] - lip[0][1][2])).toBeLessThan(1e-6);
    // On the face the punch meets, the zone's middle stands above a flat piece's (t + 0.15).
    expect(lip[0][0][2]).toBeGreaterThan(placed.posed.thickness + 0.3);
  });

  it('the nearest test: a piece, an edge nearer than the piece, none', () => {
    const pieces = [
      {
        index: 0,
        segments: [
          [
            [0, 100],
            [200, 100],
          ],
        ],
      },
    ];
    const edges = [
      {
        index: 3,
        segments: [
          [
            [0, 108],
            [200, 108],
          ],
        ],
      },
    ];
    expect(nearestPiece(pieces, edges, [50, 101])).toBe(0);
    expect(nearestPiece(pieces, edges, [50, 106])).toBe(null);
    expect(nearestPiece(pieces, [], [50, 100 + PIECE_PICK_PX])).toBe(0);
    expect(nearestPiece(pieces, [], [50, 100 + PIECE_PICK_PX + 1])).toBe(null);
  });

  it('the chip’s three sentences', () => {
    const offered = (skip) => pieceOffer(stationOf(TRAY, { ...lipLine(), skip }).segments);
    expect(pieceChip(offered([]), 0)).toBe('Piece 1 of 3 · 82 mm · click to bend only this');
    expect(pieceChip(offered([1, 2]), 0)).toBe('Piece 1 of 3 · 82 mm · in this hit · Ctrl+click another to add it');
    expect(pieceChip(offered([1, 2]), 1)).toBe(
      'Piece 2 of 3 · 522 mm · left flat · click to bend only this · Ctrl+click adds it',
    );
  });

  it('the hint line with more than one piece', () => {
    expect(brakeHint(true, 'gauge', 3)).toBe(
      'Click a piece of the line to bend only it · Ctrl+click adds or leaves out · F flip · T turn around · Enter bends · Esc clears the line',
    );
    expect(brakeHint(true, 'gauge', 1)).toBe(
      'Drag a ring to flip or turn the sheet, the arrow to slide it · F flip · T turn around · Enter bends · Esc clears the line',
    );
  });

  it('the fingers stand behind the edge: edge 3, one at the lip; edge 7, two inside the flange’s run', () => {
    const fingers = (s) => {
      const station = stationOf(TRAY, s);
      const { posed, frame } = pose(station);
      const xs = xsOf(edgeSegments(posed, station.edge, frame.matrix));
      const width = frame.span[1] - frame.span[0];
      return {
        run: [Math.min(...xs), Math.max(...xs)],
        at: fingerPlacement([Math.min(...xs), Math.max(...xs)], width, 2000),
      };
    };
    // Every piece in, gauged off the lip: the bend is centred, the lip at one end; one finger, at the lip.
    const all = fingers(lipLine());
    close(Math.abs((all.run[0] + all.run[1]) / 2), 306, 6);
    expect(all.at).toHaveLength(1);
    close(all.at[0], (all.run[0] + all.run[1]) / 2, 6);
    // The lip alone: one finger at its middle (the run 82 mm: no room for two with half a finger clear of each end).
    const lip = fingers({ ...lipLine(), skip: [1, 2] });
    expect(lip.at).toHaveLength(1);
    close(lip.at[0], 0, 6);
    // The flange's edge at L 118, the flange alone: two fingers, both inside its run.
    const flange = fingers(apply(TRAY, fresh(), { edge: FLANGE_EDGE, distance: 118 }));
    expect(flange.at).toHaveLength(2);
    for (const x of flange.at) {
      expect(x - 12).toBeGreaterThanOrEqual(flange.run[0]);
      expect(x + 12).toBeLessThanOrEqual(flange.run[1]);
    }
    // No gauge edge: today's pair about the bend.
    expect(fingerPlacement(null, 400, 2000)).toEqual([-120, 120]);
  });
});
