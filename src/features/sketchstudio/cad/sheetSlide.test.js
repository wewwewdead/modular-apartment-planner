// Slide the sheet under the punch (docs/sketch-studio-sheet-slide.md §7): the
// one flat stretch whoever asks (the pending hit and the stored step put the
// punch on the same stretch of the blank: a line turned by the fold, the sheet
// bent down, a two-point line drawn b → a, Bend on against the made bend's
// record), the frame's left and right, the checks and their fixes on the lip
// tray, the session's rules, TL-1's tray with a standing side, the bed, and
// the record (save and load, refused by name).
import { describe, expect, it } from 'vitest';
import { foldSheet, poseFold, stepFold, stepOf } from './sheetMetal.js';
import { brakeFrame, endSide, frameSign, machineFrom, strokeTooling, toolEnds, toolLengths } from './pressBrake.js';
import { brakeCarry, brakePatch, brakeSessionDefaults, brakeStation, startStroke, turnAround } from './brakeStation.js';
import { fingerRestore } from './brakeHands.js';
import { flangedPanel, presetFace } from './panelMaker.js';
import { emptyModel, normalizeModel } from './model.js';
import { FAR_LIP_EDGE, FIRST_LIP_EDGE, lipTrayModel } from './piecePick.fixtures.js';

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
const stationOf = (model, s, advise = false) => brakeStation({ model, session: s, advise });
const apply = (model, s, patch) => brakePatch(s, patch, stationOf(model, s));
const clears = (pending) => !pending.error && !pending.refusals.length && !pending.collision.hit;
const TRAY = lipTrayModel();
// The first lip alone at the brake: edge 4, L 15, the flange and the far lip left flat.
const lipAlone = (extra = {}) => ({
  ...apply(TRAY, fresh(), { edge: FIRST_LIP_EDGE, distance: 15 }),
  skip: [1, 2],
  ...extra,
});
// The punch's stretches on the flat blank (a fold, the step's bends): points, sorted, for comparing.
function punchStretch(fold, ids) {
  const tooling = strokeTooling(fold, ids, { bed: 2000 });
  const at = (s) => [tooling.line.a[0] + tooling.line.u[0] * s, tooling.line.a[1] + tooling.line.u[1] * s];
  return tooling.punch
    .map(([a, b]) => [at(a), at(b)].sort((p, q) => p[0] - q[0] || p[1] - q[1]))
    .sort((p, q) => p[0][0] - q[0][0] || p[0][1] - q[0][1]);
}
// The pending hit's stretch, and the stored step's once the pedal has committed it.
function bothStretches(model, session) {
  const station = stationOf(model, session);
  expect(station.pending.error).toBeUndefined();
  const pending = punchStretch(station.pending.fold, station.pending.bendIds);
  const stroke = startStroke({ station, token: 't', id: 'made-x' });
  const feature = model.parts[0].features[0];
  const after = { ...feature, bends: stroke.placed || [...(feature.bends || []), ...stroke.bends] };
  const profile = model.sketches[0].profile;
  const fold = foldSheet(after, profile, {});
  const step = stepOf(fold, stroke.bends[0].id);
  const stored = punchStretch(stepFold(fold, step), step.bendIds);
  return { station, pending, stored, records: stroke.bends, fold, step };
}
const sameStretch = (p, q) => {
  expect(q).toHaveLength(p.length);
  p.forEach((segment, i) => segment.forEach((point, j) => point.forEach((v, k) => close(v, q[i][j][k], 6))));
};
// The frame's sign as the shop layer poses the pending hit.
function poseSign(station) {
  const view = station.view;
  const side = { gaugePoint: view.gaugePoint || null, turned: Boolean(view.turned) };
  const posed = poseFold(view.fold, view.angles || {}, machineFrom(view.fold, view.bendIds, side));
  return brakeFrame(posed, view.bendId, { die: view.die, ...side, members: view.bendIds, bed: 2000 });
}

describe('§7 item 3: one flat stretch, whoever asks', () => {
  it('the lip tray’s edge 4: the pending hit’s punch is the stored step’s, the fold turning the line', () => {
    const s = lipAlone({ punchTrim: -9, slide: -5 });
    const { station, pending, stored, records } = bothStretches(TRAY, s);
    // The fold turns this bend (its u runs −y, the record's +y): the slide is read the other way.
    expect(station.pending.fold.bends.find((b) => b.id === station.pending.bendIds[0]).u[1]).toBeLessThan(0);
    expect(records[0].slide).toBe(-5);
    sameStretch(pending, stored);
    // The punch on x = 410 from y 11 to y 111.
    expect(pending.map(([p, q]) => [p[0], p[1], q[0], q[1]].map((v) => Math.round(v * 1e6) / 1e6))).toEqual([
      [410, 11, 410, 111],
    ]);
  });

  it('the same bent down (Flip sheet), a line the fold does not turn, a two-point line drawn b → a', () => {
    const down = bothStretches(TRAY, lipAlone({ punchTrim: -9, slide: -5, flip: true }));
    sameStretch(down.pending, down.stored);
    sameStretch(down.pending, [
      [
        [410, 11],
        [410, 111],
      ],
    ]);
    // A plain 300 × 100 plate gauged off its right end: this bend is not turned by the fold.
    const plate = lipTrayModel(
      [],
      [
        [0, 0],
        [300, 0],
        [300, 100],
        [0, 100],
      ],
    );
    const plain = bothStretches(plate, {
      ...apply(plate, fresh(), { edge: 1, distance: 200 }),
      punchTrim: 20,
      slide: 7,
    });
    sameStretch(plain.pending, plain.stored);
    // Two points, b → a: the line runs −y, the pieces read from the far lip; the lip is the last.
    const reversed = apply(TRAY, fresh(), {
      mode: 'points',
      points: [
        [410, 745],
        [410, -1],
      ],
    });
    const back = bothStretches(TRAY, { ...reversed, skip: [0, 1], punchTrim: -9, slide: 5 });
    sameStretch(back.pending, back.stored);
    sameStretch(back.pending, [
      [
        [410, 11],
        [410, 111],
      ],
    ]);
  });

  it('Bend on with the session’s line running against the made bend’s record', () => {
    // The lip made first (its record runs +y), then bent on by two points drawn the other way.
    const lip = stationOf(TRAY, lipAlone());
    const made = lipTrayModel(startStroke({ station: lip, token: 't', id: 'lip1' }).bends);
    const record = made.parts[0].features[0].bends[0];
    expect(record.b[1]).toBeGreaterThan(record.a[1]);
    const s = {
      ...apply(made, fresh(), {
        mode: 'points',
        points: [
          [410, 745],
          [410, -1],
        ],
      }),
      skip: [0, 1],
      angle: 120,
      punchTrim: -9,
      slide: 5,
    };
    const on = bothStretches(made, s);
    expect(on.station.pending.again).toBeTruthy();
    // Along the made bend's record: the session's +5 (−y) is −5 there.
    expect(on.records[0]).toMatchObject({ again: 'lip1', slide: -5 });
    sameStretch(on.pending, on.stored);
    sameStretch(on.pending, [
      [
        [410, 11],
        [410, 111],
      ],
    ]);
  });

  it('left and right: frameSign is the frame’s own sign, up and down, gauged either side, turned', () => {
    const cases = [
      lipAlone(),
      lipAlone({ flip: true }),
      lipAlone({ turned: true }),
      lipAlone({ flip: true, turned: true }),
      { ...apply(TRAY, fresh(), { edge: FAR_LIP_EDGE, distance: 15 }), skip: [0, 1] },
    ];
    for (const s of cases) {
      const station = stationOf(TRAY, s);
      const frame = poseSign(station);
      const bend = station.pending.fold.bends.find((b) => b.id === station.pending.bendIds[0]);
      expect(frameSign(bend, { gaugePoint: station.gaugePoint, turned: Boolean(s.turned) })).toBe(frame.sign);
      expect(station.pending.tooling.sign).toBe(frame.sign);
    }
    // +X along the bed is the operator's right.
    expect(endSide(1, 1)).toBe('right');
    expect(endSide(-1, 1)).toBe('left');
  });
});

describe('§7 items 1, 2: the lip, its checks and their fixes', () => {
  it('punch 100 centred: tool-over-flat 5 mm, "Slide the sheet 5 mm to the left"; applied, clear; 9 mm more, the inner end bare', () => {
    const centred = stationOf(TRAY, lipAlone({ punchTrim: -9 })).pending;
    const over = centred.refusals.find((r) => r.code === 'tool-over-flat');
    expect(over.fix).toEqual({ label: 'Slide the sheet 5 mm to the left', session: { slide: -5 } });
    const slid = stationOf(
      TRAY,
      apply(TRAY, lipAlone({ punchTrim: -9 }), { ...over.fix.session, scrub: null }),
    ).pending;
    expect(clears(slid)).toBe(true);
    expect(slid.warnings).toEqual([]);
    expect(toolEnds(slid.tooling, slid.tooling.sign)).toEqual({ left: -4, right: -14 });
    const further = stationOf(TRAY, lipAlone({ punchTrim: -9, slide: -14 })).pending;
    expect(further.refusals).toEqual([]);
    expect(further.warnings).toEqual([
      {
        code: 'tool-short-ends',
        message:
          'The punch stops 5 mm short of the left end of the bend: that end is not pressed and comes out a little open.',
        // Centred, the same punch runs past both ends (§4.4).
        fix: { label: 'Centre the sheet', session: { slide: 0 } },
      },
    ]);
  });

  it('punch fitted, slid 20 toward the free end: 20 mm bare, Centre the sheet; slid 45: under half, refused', () => {
    const twenty = stationOf(TRAY, lipAlone({ slide: -20 })).pending;
    expect(twenty.refusals).toEqual([]);
    expect(twenty.warnings).toEqual([
      {
        code: 'tool-short-ends',
        message:
          'The punch stops 20 mm short of the left end of the bend: that end is not pressed and comes out a little open.',
        fix: { label: 'Centre the sheet', session: { slide: 0 } },
      },
    ]);
    const centred = stationOf(TRAY, apply(TRAY, lipAlone({ slide: -20 }), { slide: 0, scrub: null })).pending;
    expect(clears(centred)).toBe(true);
    expect(centred.warnings).toEqual([]);
    const half = stationOf(TRAY, lipAlone({ slide: -45 })).pending;
    expect(half.refusals.map((r) => [r.code, r.fix])).toEqual([
      ['tool-cover', { label: 'Centre the sheet', session: { slide: 0 } }],
    ]);
    expect(half.refusals[0].message).toMatch(/^The punch stands over 37 mm of the 82 mm bend: less than half/);
  });
});

describe('§7 item 4: the session’s rules (§5)', () => {
  it('what puts the slide back to 0, what keeps it, Esc after a finger drag, never carried', () => {
    const s = lipAlone({ slide: -5 });
    // Reset: a new edge, the mode, the points, a piece picked, Turn sheet around (both kinds), a new L with other pieces.
    for (const patch of [
      { edge: FAR_LIP_EDGE, distance: 15 },
      { mode: 'points' },
      {
        mode: 'points',
        points: [
          [410, -1],
          [410, 745],
        ],
      },
      { skip: [0, 2] },
      { ...turnAround(stationOf(TRAY, s), s) },
      { turned: true },
      { distance: 30 },
    ])
      expect(apply(TRAY, s, { ...patch, scrub: null }).slide).toBe(0);
    // Kept: L with the pick kept, the angle, Flip sheet, the punch, the die, the lengths, the horns.
    for (const patch of [
      { distance: 14 },
      { angle: 45 },
      { flip: true },
      { punch: 'gooseneck-88' },
      { die: 'v10-88' },
      { punchTrim: 4 },
      { horns: true },
    ])
      expect(apply(TRAY, s, { ...patch, scrub: null }).slide).toBe(-5);
    // A patch naming the slide is no new line, and disarms an armed try.
    const armed = apply(TRAY, { ...s, armed: { kind: 'before', key: 'x' } }, { slide: 3, scrub: null });
    expect([armed.slide, armed.armed, armed.skip]).toEqual([3, null, [1, 2]]);
    // The fingers' drag: L 16, 30, 19 from the lip alone; its start's slide comes back with its pick; Esc restores.
    const from = fingerRestore(s);
    let dragged = s;
    const seen = [];
    for (const distance of [16, 30, 19]) {
      dragged = apply(TRAY, dragged, { distance, scrub: null, dragStop: from.stop ?? null, dragFrom: from });
      seen.push([dragged.skip, dragged.slide]);
    }
    expect(seen).toEqual([
      [[1, 2], -5],
      [[], 0],
      [[1, 2], -5],
    ]);
    expect(apply(TRAY, dragged, { ...from, scrub: null })).toEqual({ ...s, scrub: null });
    expect('slide' in brakeCarry(s)).toBe(false);
  });

  it('an offset is made centred: the shape puts the slide back to 0 and nothing offers one for its pair', () => {
    const s = lipAlone({ slide: -5 });
    // The shape becoming an offset; another shape keeps the slide.
    expect(apply(TRAY, s, { shape: 'offset', scrub: null }).slide).toBe(0);
    expect(apply(TRAY, s, { shape: 'round', scrub: null }).slide).toBe(-5);
    // The pair's tooling has no `right` (the panel's field and the arrow read it); a plain bend's has.
    const offset = stationOf(TRAY, { ...lipAlone(), shape: 'offset', offset: 5 }).pending;
    expect(offset.error).toBeUndefined();
    expect(offset.tooling.right).toBeUndefined();
    expect(Math.abs(stationOf(TRAY, lipAlone()).pending.tooling.right)).toBe(1);
  });
});

describe('§7 item 5: TL-1’s tray, hit 3, punch 380', () => {
  const panel = flangedPanel({
    face: presetFace('rectangle', { width: 600, height: 400 }),
    thickness: 1.5,
    stock: 'spcc',
    flanges: [0, 1, 2, 3].map((edge) => ({ edge, depth: 50 })),
  });
  const feature = { ...panel.feature, bends: panel.feature.bends.slice(0, 2) };
  const model = {
    ...emptyModel(),
    sketches: [
      { id: feature.sketchId, name: 'Blank', plane: 'XY', profile: panel.profile, primitives: [], constrained: false },
    ],
    parts: [{ id: 'p', name: 'Tray', material: 'SPCC cold-rolled steel', features: [feature] }],
    instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
  };
  const third = panel.feature.bends[2];
  const s = (extra) => ({ ...fresh({ mode: 'points', points: [third.a, third.b] }), punchTrim: 5.9, ...extra });
  it('clear centred; slid 12 the punch or its holder meets the standing side, and centring clears it; slid 5, short per end', () => {
    expect(clears(stationOf(model, s(), true).pending)).toBe(true);
    const twelve = stationOf(model, s({ slide: 12 }), true).pending;
    expect(['punch', 'holder']).toContain(twelve.collision.hit?.tool);
    expect(twelve.collision.length).toEqual({ label: 'Centre the sheet under the punch', session: { slide: 0 } });
    const five = stationOf(model, s({ slide: 5 }), true).pending;
    expect(clears(five)).toBe(true);
    expect(five.warnings.map((w) => w.message)).toEqual([
      expect.stringMatching(
        /^The punch stops 10\.9 mm short of the (left|right) end of the bend and 0\.9 mm short of the (left|right) end: the ends are not pressed/,
      ),
    ]);
    // The stored step names the length and the slide, no left or right.
    const stroke = startStroke({ station: stationOf(model, s({ slide: 5 })), token: 't', id: 'r' });
    expect(
      toolLengths(
        stroke.view.fold,
        stroke.bends.map((b) => b.id),
        { bed: 2000 },
      ).punch,
    ).toBe('380 mm, 5 mm off centre');
  });
});

describe('§7 items 6, 7: the bed, the record', () => {
  it('a slide that takes the bend past the bed is refused, with Centre the sheet', () => {
    const pending = stationOf(TRAY, lipAlone({ slide: -1100 })).pending;
    const bed = pending.refusals.find((r) => r.code === 'bed');
    expect(bed).toEqual({
      code: 'bed',
      // The 50 t press's bed is 2090 mm: ±1045 about the punch; the lip ±41 slid 1100 to the left: 96 mm over.
      message: 'The bend would stand 96 mm past the left end of the bed: slide the sheet back.',
      fix: { label: 'Centre the sheet', session: { slide: 0 } },
    });
  });

  it('save and load keep the slide; a model without one is the same; a slide that is not a number is refused by name', () => {
    const lip = stationOf(TRAY, lipAlone({ slide: -5, punchTrim: -9 }));
    const bends = startStroke({ station: lip, token: 't', id: 'b1' }).bends;
    const model = lipTrayModel(bends);
    const loaded = normalizeModel(JSON.parse(JSON.stringify(model)));
    expect(loaded.parts[0].features[0].bends[0].slide).toBe(-5);
    const plain = lipTrayModel(startStroke({ station: stationOf(TRAY, lipAlone()), token: 't', id: 'b1' }).bends);
    expect('slide' in plain.parts[0].features[0].bends[0]).toBe(false);
    expect(JSON.stringify(normalizeModel(JSON.parse(JSON.stringify(plain))))).toBe(
      JSON.stringify(normalizeModel(plain)),
    );
    const feature = { ...model.parts[0].features[0], bends: [{ ...bends[0], slide: 'x' }] };
    expect(() => foldSheet(feature, model.sketches[0].profile, {})).toThrow(/^Bend 1 slide/);
  });
});
