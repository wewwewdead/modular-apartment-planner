// The press brake's punch and die length (docs/sketch-studio-brake-tool-length.md,
// TL-1): a trim per end on the bend record and the session, the tooling runs
// trimmed (and lengthened, on the bed) for the collision check and the scene,
// the honest rules (a shorter tool carries the force on less of it, leaves
// the ends unpressed, may not be shorter than a section or cover less than
// half the bend), the fix buttons offered only when a trial clears, the ram
// advice that says the facts, and the §4 acceptance cases 1 – 9.
import { describe, expect, it } from 'vitest';
import { flangedPanel, presetFace } from './panelMaker.js';
import { foldSheet, poseFold } from './sheetMetal.js';
import {
  MIN_COVERAGE,
  assessBend,
  brakeFrame,
  brakeHit,
  gaugeEdges,
  lineTooling,
  strokeTooling,
  toolLengths,
  toolingRuns,
  trimRuns,
} from './pressBrake.js';
import { brakeCollisions, ramClearance } from './brakeCollisions.js';
import {
  bendOnPatch,
  brakeCarry,
  brakePatch,
  brakeSessionDefaults,
  brakeStation,
  sequenceChecks,
  sessionLine,
  startStroke,
} from './brakeStation.js';
import { fingerRestore } from './brakeHands.js';
import { jobSheet } from './jobSheet.js';
import { emptyModel, normalizeModel } from './model.js';
import { PUNCHES, SHORTEST_SECTION, machineOf, toolingLimit } from './shopCatalog.js';

const machine = machineOf('brake-50-2000');
const close = (value, expected, digits = 6) => expect(value).toBeCloseTo(expected, digits);
const modelOf = (feature, profile) => ({
  ...emptyModel(),
  sketches: [{ id: feature.sketchId, name: 'Blank', plane: 'XY', profile, primitives: [], constrained: false }],
  parts: [{ id: 'p', name: 'Tray', material: 'SPCC cold-rolled steel', features: [feature] }],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
});
// §2: SPCC t 1.5, a 600 × 400 face, a flange on all four edges; the two long
// ones made (hits 1 – 2), the third line pending on a short edge.
function tray(depth, { down = false } = {}) {
  const panel = flangedPanel({
    face: presetFace('rectangle', { width: 600, height: 400 }),
    thickness: 1.5,
    stock: 'spcc',
    flanges: [0, 1, 2, 3].map((edge) => ({ edge, depth, ...(down && edge % 2 === 0 ? { direction: 'down' } : {}) })),
  });
  const feature = { ...panel.feature, bends: panel.feature.bends.slice(0, 2) };
  const third = panel.feature.bends[2];
  return { model: modelOf(feature, panel.profile), line: [third.a, third.b], feature, profile: panel.profile };
}
const sessionOf = (line, extra = {}) => ({
  ...brakeSessionDefaults(),
  instanceId: 'i',
  mode: 'points',
  points: line,
  ...extra,
});
const station = ({ model, line }, extra = {}, advise = true) =>
  brakeStation({ model, session: sessionOf(line, extra), advise });
const clears = (pending) => !pending.error && !pending.refusals.length && !pending.collision.hit;
const FITTED = 391.8;

describe('trimRuns (§3.2)', () => {
  it('moves every run in by the trim at both ends, out when negative, on the bed; no trim is the runs themselves', () => {
    const runs = [
      [-100, -20],
      [20, 100],
    ];
    expect(trimRuns(runs, 0)).toBe(runs);
    expect(trimRuns(runs, null)).toBe(runs);
    expect(trimRuns(runs, 5)).toEqual([
      [-95, -25],
      [25, 95],
    ]);
    // Lengthened until they meet: one run; and no further than the bed.
    expect(trimRuns(runs, -25, 110)).toEqual([[-110, 110]]);
    // A run trimmed to nothing is left out.
    expect(trimRuns(runs, 45)).toEqual([]);
  });
});

describe('§4 item 1: the fitted punch, unchanged', () => {
  const setup = tray(50);
  it('stands the punch, its holders and the die over ±195.9, and the hit clears', () => {
    const { pending } = station(setup);
    expect(clears(pending)).toBe(true);
    expect(pending.warnings).toEqual([]);
    expect(pending.tooling.fitted).toHaveLength(1);
    close(pending.tooling.fitted[0][0], -FITTED / 2, 6);
    close(pending.tooling.fitted[0][1], FITTED / 2, 6);
    expect(pending.tooling.punch).toBe(pending.tooling.fitted);
    expect(pending.tooling.die).toBe(pending.tooling.fitted);
    // The record carries no trim, so a fitted hit is saved as before.
    expect(pending.data.every((d) => !('punchTrim' in d) && !('dieTrim' in d))).toBe(true);
    expect(pending.fold.bends.every((b) => !('punchTrim' in b) && !('dieTrim' in b))).toBe(true);
    // The frame's runs are toolingRuns' own (today's output), the die's the same ones.
    const posed = poseFold(pending.fold, { [pending.bendIds[0]]: 0 });
    const frame = brakeFrame(posed, pending.bendIds[0], { die: pending.die, bed: machine.bed });
    expect(frame.dieRanges).toBe(frame.ranges);
    expect(frame.ranges).toHaveLength(1);
    close(frame.ranges[0][1] - frame.ranges[0][0], FITTED, 6);
    const bend = posed.bends.find((b) => b.id === pending.bendIds[0]);
    const runs = toolingRuns(posed, bend, bend.intervals);
    close(runs[0][1] - runs[0][0], FITTED, 6);
    // The tooling limit is today's: the weaker tool over the bend's length.
    expect(pending.readouts.toolingLimit).toBe(toolingLimit(pending.punch, pending.die, pending.readouts.length));
  });
});

describe('§4 items 2 – 3: the punch longer and shorter than the bend', () => {
  const setup = tray(50);
  const lengthTrim = (length) => Math.round(((FITTED - length) / 2) * 1e6) / 1e6;
  it('400 mm (the sides stand 398.5 apart): the punch meets them coming down, either way round', () => {
    const { pending } = station(setup, { punchTrim: lengthTrim(400) });
    const hit = pending.collision.hit;
    expect(['punch', 'holder']).toContain(hit.tool);
    expect(hit.phase).toBe('approach');
    expect(pending.collision.turn).toBeUndefined();
    for (const turned of [false, true]) {
      const run = brakeCollisions({
        fold: pending.fold,
        bendIds: pending.bendIds,
        machine,
        punch: pending.punch,
        die: pending.die,
        turned,
        advise: false,
      });
      expect(['punch', 'holder']).toContain(run.hit?.tool);
    }
    expect(pending.tooling.punch[0][1] - pending.tooling.punch[0][0]).toBeCloseTo(400, 6);
    // The card's fix, tried: fitted clears.
    expect(pending.collision.length).toEqual({ label: 'Fit the punch to the bend', session: { punchTrim: null } });
    expect(hit.message).toMatch(
      /^Bend 3: the part hits the (punch|punch holder) as the ram comes down\. Bend this one earlier \(.+\), or fit the punch to the bend\./,
    );
    expect(clears(station(setup, pending.collision.length.session).pending)).toBe(true);
  });
  it('380 mm: clear, with the note that the ends are not pressed (5.9 mm each)', () => {
    const { pending } = station(setup, { punchTrim: lengthTrim(380) });
    expect(clears(pending)).toBe(true);
    expect(pending.warnings.map((w) => w.message)).toEqual([
      'The punch stops 5.9 mm short of each end of the bend: the ends are not pressed and come out a little open.',
    ]);
    // On the record the pedal commits, shared by the stroke; the die stays fitted.
    const stroke = startStroke({ station: station(setup, { punchTrim: lengthTrim(380) }), token: 't', id: 'b3' });
    expect(stroke.bends[0]).toMatchObject({ punchTrim: 5.9 });
    expect('dieTrim' in stroke.bends[0]).toBe(false);
    expect(toolLengths(stroke.view.fold, ['b3'], { bed: machine.bed })).toEqual({ punch: '380 mm', die: null });
  });
  it('refuses a punch shorter than a section, or over less than half the bend, with Fit the punch as the fix', () => {
    expect(SHORTEST_SECTION).toBe(10);
    const short = station(setup, { punchTrim: lengthTrim(4) }).pending;
    expect(short.refusals.map((r) => [r.code, r.message])).toContainEqual([
      'tool-short',
      'The punch would be 4 mm long: the shortest section is 10 mm.',
    ]);
    expect(short.refusals.find((r) => r.code === 'tool-short').fix).toEqual({
      label: 'Fit the punch to the bend',
      session: { punchTrim: null },
    });
    const half = station(setup, { punchTrim: lengthTrim(180) }).pending;
    expect(MIN_COVERAGE).toBe(0.5);
    expect(half.refusals.map((r) => r.code)).toContain('tool-cover');
    expect(half.refusals.find((r) => r.code === 'tool-cover').message).toBe(
      // One piece (docs/sketch-studio-piece-pick.md §5.4): what would let a part of it bend alone follows.
      'The punch stands over 180 mm of the 391.8 mm bend: less than half of it is pressed. Make it longer, or fit it to the bend. A piece of sheet bends whole. To bend a part of it alone, cut a relief across the bend line between that part and the rest (Relief, in the sketcher).',
    );
    expect(clears(station(setup, { punchTrim: lengthTrim(200) }).pending)).toBe(true);
  });
  it('lengthens no further than the bed', () => {
    const { pending } = station(setup, { punchTrim: -5000 });
    expect(pending.tooling.punch).toEqual([[-machine.bed / 2, machine.bed / 2]]);
  });
});

describe('§4 items 4 – 5: the ram tells the truth (§3.6)', () => {
  it('flanges 100, straight punch: the ram at about 88.8°, no shorter punch, a taller one offered and clearing', () => {
    const setup = tray(100);
    const { pending } = station(setup);
    const hit = pending.collision.hit;
    expect(hit.tool).toBe('ram');
    close(hit.angle, 88.8, 1);
    expect(pending.collision.length).toBeUndefined();
    // docs/sketch-studio-shop-punches.md §5.4: the taller punches now hold the shop's three 88°
    // ones (95 mm), the lowest first: the A 101 is tried first and clears.
    expect(pending.collision.fix).toEqual({
      label: 'Use the A 101 punch',
      session: { punch: 'a101', reverse: false },
    });
    // Tight bends TB-2 (docs/sketch-studio-tight-bends.md §5.2): the order and a part-way bend are tried too.
    expect(hit.message).toBe(
      'Bend 3: the part hits the ram at 88.8°. This punch and its holder stand the ram 166.5 mm above the tip. Use the A 101 punch: it holds the ram higher. Turning the sheet around, bending this one earlier and a part-way bend first were tried: none clears.',
    );
    expect(hit.message).not.toMatch(/shorten|shorter/i);
    expect(clears(station(setup, pending.collision.fix.session).pending)).toBe(true);
  });
  it('flanges 200: every punch meets the ram; the card says so, and the height the bend needs', () => {
    const setup = tray(200);
    const straight = Object.values(PUNCHES).filter((p) => !p.round && p.angle === 88);
    // The shop's three 88° punches among them (shop punches §5.1).
    expect(straight.map((p) => p.key).sort()).toEqual(
      [
        'a101',
        'a102',
        'a108',
        'gooseneck-88',
        'gooseneck-88-deep',
        'straight-88',
        'straight-88-sharp',
        'straight-88-tall',
      ].sort(),
    );
    for (const punch of straight)
      expect(station(setup, { punch: punch.key }, false).pending.collision.hit?.tool, punch.key).toBe('ram');
    const { pending } = station(setup);
    expect(pending.collision.fix).toBeUndefined();
    expect(pending.collision.length).toBeUndefined();
    // Tight bends TB-2 (§5.2): no order and no part-way bend clears it either, and nothing else is offered: try 3.
    expect(pending.collision.hit.message).toBe(
      // Shop punches §5.4, then §6.2: NO_WAY says what was tried, the earlier bends with another punch among it.
      'Bend 3: the part hits the ram as the ram comes down. This punch and its holder stand the ram 166.5 mm above the tip. No punch in the list holds the ram high enough (the tallest gives 245 mm): this bend needs about 315 mm. Turning the sheet around was tried: it does not clear. No order, no part-way bend and no other punch for the earlier bends clears it. Make the web wider or the flange shorter, or use tooling this rack does not hold.',
    );
    // No remedy that was not tried: not "bend this one earlier", no punch named.
    expect(pending.collision.hit.message).not.toMatch(/bend this one earlier|Use the/i);
    // The height, measured from the stroke's poses: just over 310 mm.
    const need = ramClearance({ fold: pending.fold, bendIds: pending.bendIds, machine, die: pending.die });
    expect(need).toBeGreaterThan(310);
    expect(need).toBeLessThanOrEqual(315);
  });
});

// §4 item 6: a tray whose long flanges carry inward return lips (bent first),
// the short flanges lower than the lips. Face 600 × 400 with 6 mm corner
// notches; long flanges 60 high on the 600 edges, each with a 15 mm lip
// (bent up first, so it turns inward), made with the gooseneck; short flanges
// 40 high on the 400 edges. Hit 5 is the right short flange.
function lipTray() {
  const [H, W, S] = [60, 15, 40];
  const L = 2 + H + W;
  const profile = {
    type: 'polygon',
    points: [
      [6, -L],
      [594, -L],
      [594, 6],
      [600 + S, 6],
      [600 + S, 394],
      [594, 394],
      [594, 400 + L],
      [6, 400 + L],
      [6, 394],
      [-S, 394],
      [-S, 6],
      [6, 6],
    ],
  };
  const bend = (id, a, b, extra = {}) => ({ id, a, b, angle: 90, direction: 'up', radius: null, ...extra });
  const feature = {
    id: 'sm',
    type: 'sheetmetal',
    sketchId: 's',
    thickness: 1.5,
    stock: 'spcc',
    kFactor: null,
    base: null,
    marks: [],
    bends: [
      bend('lip1', [5, 2 - H], [595, 2 - H], { punch: 'straight-88' }),
      bend('lip2', [595, 398 + H], [5, 398 + H], { punch: 'straight-88' }),
      bend('long1', [5, 2], [595, 2], { punch: 'gooseneck-88' }),
      bend('long2', [595, 398], [5, 398], { punch: 'gooseneck-88' }),
    ],
  };
  return {
    model: modelOf(feature, profile),
    line: [
      [598, 5],
      [598, 395],
    ],
    feature,
    profile,
  };
}

describe('§4 item 6: a shorter punch between return lips', () => {
  const setup = lipTray();
  it('makes the lips and long flanges first, every step passing', () => {
    const checks = sequenceChecks({ fold: foldSheet(setup.feature, setup.profile), machine });
    expect(checks.map((c) => [c.refusals.length, c.collision])).toEqual([
      [0, null],
      [0, null],
      [0, null],
      [0, null],
    ]);
  });
  it('fitted (388 mm), the punch meets a lip coming down; Shorten the punch to 348 mm clears it', () => {
    const { pending } = station(setup);
    close(pending.tooling.fitted[0][1] - pending.tooling.fitted[0][0], 388, 6);
    const hit = pending.collision.hit;
    expect(hit).toMatchObject({ tool: 'punch', phase: 'approach' });
    expect(pending.collision.length).toEqual({ label: 'Shorten the punch to 348 mm', session: { punchTrim: 20 } });
    expect(hit.message).toBe(
      // Shop punches §5.4: every other sharp punch in the rack is tried, said as one item.
      // Punch library §4.4: horn sections clear these lips, so the card names them before the shorter punch.
      'Bend 5: the part hits the punch as the ram comes down. Bend this one earlier (before the flange in the way), use horn sections at the ends or shorten the punch to 348 mm. Turning the sheet around and every other punch in the rack, either way round, were tried: neither clears.',
    );
    // 10 mm off each end is not enough (the lips reach 15 mm in); 20 is.
    expect(station(setup, { punchTrim: 10 }, false).pending.collision.hit?.tool).toBe('punch');
    const shortened = station(setup, { punchTrim: 20 });
    expect(clears(shortened.pending)).toBe(true);
    expect(shortened.pending.warnings.map((w) => w.message)).toEqual([
      'The punch stops 20 mm short of each end of the bend: the ends are not pressed and come out a little open.',
    ]);
  });
  it('the stored step passes sequenceChecks with its trim, and fails without it', () => {
    const shortened = station(setup, { punchTrim: 20 });
    const stroke = startStroke({ station: shortened, token: 't', id: 'short1' });
    expect(stroke.bends[0].punchTrim).toBe(20);
    const made = { ...setup.feature, bends: [...setup.feature.bends, ...stroke.bends] };
    const checks = sequenceChecks({ fold: foldSheet(made, setup.profile), machine });
    expect(checks.at(-1)).toMatchObject({ refusals: [], collision: null });
    const { punchTrim: _trim, ...fitted } = stroke.bends[0];
    const without = sequenceChecks({
      fold: foldSheet({ ...setup.feature, bends: [...setup.feature.bends, fitted] }, setup.profile),
      machine,
    });
    expect(without.at(-1).collision).toMatchObject({ tool: 'punch' });
    // The sequence and the job sheet name the length.
    expect(toolLengths(foldSheet(made, setup.profile), ['short1'], { bed: machine.bed }).punch).toBe('348 mm');
    const sheet = jobSheet({
      ...setup.model,
      parts: setup.model.parts.map((p) => ({ ...p, features: [made] })),
    });
    const bendStep = sheet.products[0].steps.find((s) => s.key === 'bend');
    expect(bendStep.items.at(-1).detail).toContain('UP 90° R1.6 · Straight 88° punch, 348 mm · V10 88° die');
    expect(bendStep.items[0].detail).toContain('Straight 88° punch, V10 88° die');
  });
});

describe('§4 item 7: the die', () => {
  // The long flanges bent down: they hang beside the die's ends at ±199.25.
  const setup = tray(50, { down: true });
  it('fitted, the die stands between the hanging sides; lengthened past the bend it meets them', () => {
    expect(clears(station(setup).pending)).toBe(true);
    const { pending } = station(setup, { dieTrim: -10 });
    expect(pending.tooling.die[0][1] - pending.tooling.die[0][0]).toBeCloseTo(FITTED + 20, 6);
    expect(pending.tooling.punch).toBe(pending.tooling.fitted);
    expect(pending.collision.hit.tool).toBe('die');
    expect(pending.collision.length).toEqual({ label: 'Fit the die to the bend', session: { dieTrim: null } });
    expect(pending.collision.hit.message).toMatch(/ Or fit the die to the bend\.$/);
    expect(clears(station(setup, pending.collision.length.session).pending)).toBe(true);
  });
  it('a die trim is stored and round-trips like the punch', () => {
    const shortened = station(setup, { dieTrim: 5 });
    expect(clears(shortened.pending)).toBe(true);
    expect(shortened.pending.warnings.map((w) => w.message)).toEqual([
      'The die stops 5 mm short of each end of the bend: the ends are not pressed and come out a little open.',
    ]);
    const stroke = startStroke({ station: shortened, token: 't', id: 'd3' });
    expect(stroke.bends[0].dieTrim).toBe(5);
    const feature = { ...setup.feature, bends: [...setup.feature.bends, ...stroke.bends] };
    const model = { ...setup.model, parts: setup.model.parts.map((p) => ({ ...p, features: [feature] })) };
    const loaded = normalizeModel(JSON.parse(JSON.stringify(model)));
    expect(loaded.parts[0].features[0].bends.at(-1).dieTrim).toBe(5);
    const fold = foldSheet(loaded.parts[0].features[0], loaded.sketches[0].profile);
    expect(fold.bends.at(-1).dieTrim).toBe(5);
    expect(toolLengths(fold, ['d3'], { bed: machine.bed })).toEqual({ punch: null, die: '381.8 mm' });
  });
});

describe('§4 item 8: the tooling limit over the length of the tool under the bend (§3.3)', () => {
  // SUS304 t 2 across a 400 wide strip, the gooseneck (500 kN/m) in a V8 die:
  // 164.4 kN over 400 mm, 82 % of the punch's 200 kN.
  const feature = (extra = {}) => ({
    id: 'sm',
    type: 'sheetmetal',
    sketchId: 's',
    thickness: 2,
    stock: 'sus304',
    kFactor: null,
    base: null,
    marks: [],
    bends: [
      {
        id: 'b1',
        a: [200, -1],
        b: [200, 401],
        angle: 90,
        direction: 'up',
        radius: null,
        punch: 'gooseneck-88',
        die: 'v8-88',
        ...extra,
      },
    ],
  });
  const profile = { type: 'rectangle', width: 400, height: 400, origin: [0, 0] };
  const assess = (extra) => assessBend(foldSheet(feature(extra), profile), 'b1', { machine });
  it('passes fitted and 20 mm short at each end; refused at 40 (320 mm of punch: 160 kN)', () => {
    const fitted = assess();
    close(fitted.readouts.tonnage, 164.436, 3);
    close(fitted.readouts.toolingLimit, 200, 9);
    expect(fitted.refusals).toEqual([]);
    const twenty = assess({ punchTrim: 20 });
    close(twenty.readouts.toolingLimit, 180, 6);
    expect(twenty.refusals).toEqual([]);
    const forty = assess({ punchTrim: 40 });
    close(forty.readouts.toolingLimit, 160, 6);
    expect(forty.refusals.map((r) => r.code)).toEqual(['tooling-load']);
    expect(forty.refusals[0].message).toBe(
      'This hit needs 164.44 kN; the Gooseneck 88° punch is rated 500 kN/m, 160 kN over the 320 mm of it under the bend. Make the punch longer (fit it to the bend) or use a wider die.',
    );
    expect(forty.refusals[0].fix).toEqual({ label: 'Fit the punch to the bend', session: { punchTrim: null } });
  });
});

describe('§4 item 9: save and load', () => {
  const setup = tray(50);
  it('keeps punchTrim and dieTrim; a model without them re-saves byte for byte', () => {
    const plain = station(setup);
    const trimmed = station(setup, { punchTrim: 5.9, dieTrim: -2 });
    for (const [st, id] of [
      [plain, 'plain'],
      [trimmed, 'trimmed'],
    ]) {
      const stroke = startStroke({ station: st, token: 't', id });
      const feature = { ...setup.feature, bends: [...setup.feature.bends, ...stroke.bends] };
      const model = { ...setup.model, parts: setup.model.parts.map((p) => ({ ...p, features: [feature] })) };
      const saved = JSON.stringify(model);
      const loaded = normalizeModel(JSON.parse(saved));
      const last = loaded.parts[0].features[0].bends.at(-1);
      if (id === 'plain') {
        expect('punchTrim' in last || 'dieTrim' in last).toBe(false);
        expect(JSON.stringify(loaded.parts)).toBe(JSON.stringify(model.parts));
        expect(JSON.stringify(normalizeModel(JSON.parse(JSON.stringify(loaded))))).toBe(JSON.stringify(loaded));
      } else {
        expect(last).toMatchObject({ punchTrim: 5.9, dieTrim: -2 });
        const fold = foldSheet(loaded.parts[0].features[0], loaded.sketches[0].profile);
        expect(fold.bends.at(-1)).toMatchObject({ punchTrim: 5.9, dieTrim: -2 });
      }
    }
  });
  it('validates a trim by name', () => {
    const bend = { id: 'b1', a: [50, -1], b: [50, 101], angle: 90, direction: 'up', radius: null };
    const feature = { id: 'sm', type: 'sheetmetal', sketchId: 's', thickness: 1.5, stock: 'spcc', bends: [] };
    const profile = { type: 'rectangle', width: 100, height: 100, origin: [0, 0] };
    expect(() => foldSheet({ ...feature, bends: [{ ...bend, punchTrim: 'nope' }] }, profile)).toThrow(
      /^Bend 1 punch length/,
    );
    expect(() => foldSheet({ ...feature, bends: [{ ...bend, dieTrim: {} }] }, profile)).toThrow(/^Bend 1 die length/);
    expect(brakeHit({ feature, profile, bend: { ...bend, id: 'p', punchTrim: 'x' }, machine }).error).toMatch(
      /^This hit punch length/,
    );
  });
});

describe('several tooling runs', () => {
  it('trims every run at both ends and words it by sections', () => {
    // A 300 × 100 blank notched twice across the line: three tabs, the middle
    // one left out of the stroke, so the tooling stands in two runs.
    const profile = {
      type: 'polygon',
      points: [
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
    };
    const feature = { id: 'sm', type: 'sheetmetal', sketchId: 's', thickness: 1.5, stock: 'spcc', bends: [] };
    const model = modelOf(feature, profile);
    const session = sessionOf(
      [
        [-1, 30],
        [301, 30],
      ],
      { skip: [1] },
    );
    const { pending } = brakeStation({ model, session, advise: false });
    expect(pending.error).toBeUndefined();
    expect(pending.tooling.fitted).toHaveLength(2);
    const trimmed = brakeStation({ model, session: { ...session, punchTrim: 5 }, advise: false }).pending;
    expect(trimmed.tooling.punch).toHaveLength(trimmed.tooling.fitted.length);
    trimmed.tooling.punch.forEach(([a, b], k) => {
      close(a, trimmed.tooling.fitted[k][0] + 5, 9);
      close(b, trimmed.tooling.fitted[k][1] - 5, 9);
    });
    const tooling = strokeTooling(trimmed.fold, trimmed.bendIds, { bed: machine.bed });
    expect(tooling.punchTrim).toBe(5);
    const stroke = startStroke({
      station: brakeStation({ model, session: { ...session, punchTrim: 5 }, advise: false }),
      token: 't',
      id: 'r',
    });
    expect(
      toolLengths(
        stroke.view.fold,
        stroke.bends.map((b) => b.id),
        { bed: machine.bed },
      ),
    ).toEqual({
      punch: '2 sections, 5 mm shorter at each end',
      die: null,
    });
  });
});

// ---------------------------------------------------------------- TL-2: the lengths stay as set (§9)
describe('TL-2: a tool’s length changes only when the operator changes it (§9.3, §9.5)', () => {
  const plate = (profile, bends = [], thickness = 1.2) =>
    modelOf(
      {
        id: 'sm',
        type: 'sheetmetal',
        sketchId: 's',
        thickness,
        stock: 'spcc',
        kFactor: null,
        base: null,
        marks: [],
        bends,
      },
      profile,
    );
  const rectangle = (width, height) => ({ type: 'rectangle', width, height, origin: [0, 0] });
  const [W, H] = [605.4, 420.4];
  const BLANK = plate(rectangle(W, H));
  const edgeAt = (width, height, x) =>
    gaugeEdges([
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ]).findIndex((e) => Math.abs(e.a[0] - x) < 1e-6 && Math.abs(e.b[0] - x) < 1e-6);
  const RIGHT_EDGE = edgeAt(W, H, W);
  const LEFT_EDGE = edgeAt(W, H, 0);
  const fresh = (extra = {}) => ({
    ...brakeSessionDefaults(),
    stage: 'setup',
    key: 'k',
    instanceId: 'i',
    mode: 'gauge',
    angle: 90,
    ...extra,
  });
  // The workspace's rule: the patch through brakePatch with the station of the session it applies to.
  const stationOf = (model, s) => brakeStation({ model, session: s, advise: false });
  const apply = (model, s, patch) => brakePatch(s, patch, stationOf(model, s));
  // The one run under the session's line (lineTooling) and the Length field's value on it.
  const spanOf = (model, s) => {
    const st = stationOf(model, s);
    const runs = lineTooling(st.fold, st.polygon, sessionLine(st, s).line, s.skip || []);
    return runs.length === 1 ? runs[0][1] - runs[0][0] : null;
  };
  const field = (model, s, key = 'punchTrim') => Number((spanOf(model, s) - 2 * (Number(s[key]) || 0)).toFixed(1));
  // Typing a length (BladeLength's commit): the trim per end on this line.
  const typeLength = (model, s, length, key = 'punchTrim') =>
    apply(model, s, { [key]: Math.round(((spanOf(model, s) - length) / 2) * 1e6) / 1e6, scrub: null });

  it('lineTooling gives strokeTooling’s fitted lengths: a rectangle, the comb, a tab skipped, a line on a made bend', () => {
    const comb = plate({
      type: 'polygon',
      points: [
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
    });
    const made = plate(rectangle(W, H), [
      { id: 'b1', a: [W - 29, 0], b: [W - 29, H], angle: 30, direction: 'up', radius: null, punch: 'straight-88' },
    ]);
    const cases = [
      [BLANK, fresh({ edge: RIGHT_EDGE, distance: 29 })],
      [
        BLANK,
        fresh({
          mode: 'points',
          points: [
            [0, 200],
            [W, 200],
          ],
        }),
      ],
      [
        comb,
        fresh({
          mode: 'points',
          points: [
            [-1, 30],
            [301, 30],
          ],
        }),
      ],
      [
        comb,
        fresh({
          mode: 'points',
          points: [
            [-1, 30],
            [301, 30],
          ],
          skip: [1],
        }),
      ],
      [
        comb,
        fresh({
          mode: 'points',
          points: [
            [-1, 30],
            [301, 30],
          ],
          skip: [0],
        }),
      ],
      [made, fresh({ edge: RIGHT_EDGE, distance: 29 })],
    ];
    for (const [model, s] of cases) {
      const st = stationOf(model, s);
      const ids = st.pending.again ? st.pending.again.bendIds : st.pending.bendIds;
      const folded = strokeTooling(st.pending.fold, st.pending.bendIds, { bed: machine.bed }).fitted;
      const before = lineTooling(st.fold, st.polygon, sessionLine(st, s).line, s.skip || []);
      expect(ids.length).toBeGreaterThan(0);
      expect(before.map(([a, b]) => b - a)).toHaveLength(folded.length);
      before.forEach(([a, b], k) => close(b - a, folded[k][1] - folded[k][0], 6));
    }
    // The comb with its middle tab left flat: two runs.
    expect(
      lineTooling(stationOf(...cases[3]).fold, stationOf(...cases[3]).polygon, { a: [-1, 30], b: [301, 30] }, [1]),
    ).toHaveLength(2);
  });

  it('380 on the right edge at L 29 stays 380: L 30, L 11, the left edge, two points, the fingers, Esc', () => {
    let s = apply(BLANK, fresh(), { edge: RIGHT_EDGE, distance: 29 });
    expect(field(BLANK, s)).toBe(420.4);
    s = typeLength(BLANK, s, 380);
    expect(s.punchHold).toBe(380);
    expect(field(BLANK, s)).toBe(380);
    for (const patch of [
      { distance: 30 },
      { distance: 11 },
      { edge: LEFT_EDGE, distance: 29 },
      {
        mode: 'points',
        points: [
          [300, 0],
          [300, H],
        ],
      },
      { mode: 'gauge', edge: RIGHT_EDGE, distance: 29 },
    ]) {
      s = apply(BLANK, s, patch);
      expect(field(BLANK, s)).toBe(380);
      expect(s.punchHold).toBe(380);
    }
    // The fingers' drag: one patch per L, then Esc puts the line and its tools back.
    const before = s;
    for (const distance of [28, 26, 24, 22, 20]) {
      s = apply(BLANK, s, { distance, scrub: null });
      expect(field(BLANK, s)).toBe(380);
    }
    expect(apply(BLANK, s, fingerRestore(before))).toEqual(before);
  });

  it('a line of another length: the trim re-derived, the length kept (short of the bend, or past it on the next part)', () => {
    let s = typeLength(BLANK, apply(BLANK, fresh(), { edge: RIGHT_EDGE, distance: 29 }), 380);
    s = apply(BLANK, s, {
      mode: 'points',
      points: [
        [0, 200],
        [W, 200],
      ],
    });
    expect(field(BLANK, s)).toBe(380);
    close(s.punchTrim, (W - 380) / 2, 6);
    expect(stationOf(BLANK, s).pending.warnings.map((w) => w.message)).toContain(
      'The punch stops 112.7 mm short of each end of the bend: the ends are not pressed and come out a little open.',
    );
    // The next part (a 300 × 200 plate) with the tools still in: its first line derives the trim from the hold.
    const SMALL = plate(rectangle(300, 200));
    const carried = { ...fresh(), ...brakeCarry(s) };
    expect(carried.punchHold).toBe(380);
    const next = apply(SMALL, carried, { edge: edgeAt(300, 200, 300), distance: 29 });
    expect(next.punchTrim).toBe(-90);
    expect(field(SMALL, next)).toBe(380);
    const pending = stationOf(SMALL, next).pending;
    expect(pending.tooling.punch[0][1] - pending.tooling.punch[0][0]).toBeCloseTo(380, 6);
  });

  it('Fit to bend: fitted, and fitted on the next line too', () => {
    let s = typeLength(BLANK, apply(BLANK, fresh(), { edge: RIGHT_EDGE, distance: 29 }), 380);
    s = apply(BLANK, s, { punchTrim: null, scrub: null });
    expect('punchHold' in s).toBe(false);
    expect(field(BLANK, s)).toBe(420.4);
    s = apply(BLANK, s, {
      mode: 'points',
      points: [
        [0, 200],
        [W, 200],
      ],
    });
    expect(s.punchTrim).toBe(null);
    expect(field(BLANK, s)).toBe(605.4);
  });

  it('the card’s "Shorten the punch to …": that length kept on the next line', () => {
    // §4 item 6's tray: return lips over the punch's ends.
    const [Hh, Ww, S] = [60, 15, 40];
    const L = 2 + Hh + Ww;
    const profile = {
      type: 'polygon',
      points: [
        [6, -L],
        [594, -L],
        [594, 6],
        [600 + S, 6],
        [600 + S, 394],
        [594, 394],
        [594, 400 + L],
        [6, 400 + L],
        [6, 394],
        [-S, 394],
        [-S, 6],
        [6, 6],
      ],
    };
    const bend = (id, a, b, punch) => ({ id, a, b, angle: 90, direction: 'up', radius: null, punch });
    const model = plate(
      profile,
      [
        bend('lip1', [5, 2 - Hh], [595, 2 - Hh], 'straight-88'),
        bend('lip2', [595, 398 + Hh], [5, 398 + Hh], 'straight-88'),
        bend('long1', [5, 2], [595, 2], 'gooseneck-88'),
        bend('long2', [595, 398], [5, 398], 'gooseneck-88'),
      ],
      1.5,
    );
    let s = apply(model, fresh(), {
      mode: 'points',
      points: [
        [598, 5],
        [598, 395],
      ],
    });
    const fix = brakeStation({ model, session: s }).pending.collision.length;
    expect(fix).toEqual({ label: 'Shorten the punch to 348 mm', session: { punchTrim: 20 } });
    s = apply(model, s, { ...fix.session, scrub: null });
    expect(s.punchHold).toBe(348);
    s = apply(model, s, {
      mode: 'points',
      points: [
        [597, 5],
        [597, 395],
      ],
    });
    expect(field(model, s)).toBe(348);
    expect(s.punchTrim).toBe(20);
  });

  it('several runs: the trim kept; a segment toggled keeps it; the die the same as the punch', () => {
    const comb = plate({
      type: 'polygon',
      points: [
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
    });
    let s = apply(comb, fresh(), {
      mode: 'points',
      points: [
        [-1, 30],
        [301, 30],
      ],
    });
    s = apply(comb, s, { skip: [1] });
    s = apply(comb, s, { punchTrim: 5, scrub: null });
    expect(s.punchTrim).toBe(5);
    expect('punchHold' in s).toBe(false);
    s = apply(comb, s, {
      mode: 'points',
      points: [
        [-1, 35],
        [301, 35],
      ],
    });
    expect(s.punchTrim).toBe(5);
    s = apply(comb, s, { skip: [1] });
    expect(s.punchTrim).toBe(5);
    expect('punchHold' in s).toBe(false);
    // One run again (the skip put back): the trim stays, now a length held.
    s = apply(comb, s, { skip: [] });
    expect(s.punchTrim).toBe(5);
    expect(s.punchHold).toBe(290);
    // The die: 380 held across lines like the punch.
    let d = typeLength(BLANK, apply(BLANK, fresh(), { edge: RIGHT_EDGE, distance: 29 }), 380, 'dieTrim');
    d = apply(BLANK, d, { distance: 40 });
    expect(field(BLANK, d, 'dieTrim')).toBe(380);
    expect(d.punchTrim).toBe(null);
  });

  it('Bend on a made bend: the length kept', () => {
    const made = plate(rectangle(W, H), [
      { id: 'b1', a: [W - 29, 0], b: [W - 29, H], angle: 30, direction: 'up', radius: null, punch: 'straight-88' },
    ]);
    let s = typeLength(made, apply(made, fresh(), { edge: RIGHT_EDGE, distance: 100 }), 380);
    const patch = bendOnPatch(stationOf(made, s), 'b1');
    expect('punchTrim' in patch).toBe(false);
    s = apply(made, s, patch);
    expect(stationOf(made, s).pending.again).toBeTruthy();
    expect(field(made, s)).toBe(380);
  });

  it('a session that never sets a length: no hold, the trims as today', () => {
    let s = fresh();
    for (const patch of [
      { edge: RIGHT_EDGE, distance: 29 },
      { distance: 30 },
      { skip: [] },
      { edge: LEFT_EDGE, distance: 29 },
      {
        mode: 'points',
        points: [
          [300, 0],
          [300, H],
        ],
      },
      { angle: 45 },
    ]) {
      s = apply(BLANK, s, patch);
      expect(s.punchTrim).toBe(null);
      expect(s.dieTrim).toBe(null);
      expect('punchHold' in s || 'dieHold' in s).toBe(false);
    }
    // brakeCarry without and with a hold.
    expect(brakeCarry(s)).toEqual({ punch: 'straight-88', die: null, reverse: false });
    const held = typeLength(BLANK, apply(BLANK, fresh(), { edge: RIGHT_EDGE, distance: 29 }), 380);
    expect(brakeCarry(held)).toEqual({
      punch: 'straight-88',
      die: null,
      reverse: false,
      punchTrim: 20.2,
      punchHold: 380,
    });
  });
});
