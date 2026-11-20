// Horn sections (docs/sketch-studio-punch-library.md §4, PL-1): the end
// pieces of a sectioned punch whose tip runs 20 mm past the body to reach
// under a lip. Their profile, the punch's sections with them (and bit for bit
// without them), the §2.2 tray through the collision check (a horn swept only
// HORN_GAP above the sheet, `hooked` when it passes only that way), the load
// rule, the short-run refusal, the record, the carry and the punch choice, a
// stored step re-checked with its horns, the card's try and the job sheet.
import { describe, expect, it } from 'vitest';
import { foldSheet, hitSequence, stepFold } from './sheetMetal.js';
import { HORN_GAP, assessBend, brakeFrame } from './pressBrake.js';
import { HORN_DRAWN_SLICE, HORN_SLICES, brakeCollisions, partSurface, toolingSections } from './brakeCollisions.js';
import {
  HOOKED,
  brakeCarry,
  brakeSessionDefaults,
  brakeStation,
  punchChoice,
  rerunStroke,
  sequenceChecks,
  startStroke,
} from './brakeStation.js';
import { jobSheet } from './jobSheet.js';
import { emptyModel, normalizeModel } from './model.js';
import { HORN, HORNS, HORN_KEYS, dieOf, hornOf, hornProfile, hornRise, machineOf, punchOf } from './shopCatalog.js';

const machine = machineOf('brake-50-2000');
const W = 400,
  H = 300;
// The §2.2 tray (the probe's outline): a 400 × 300 base of t 1.2 SPCC, side
// walls `depth` deep (bent first), `lip` mm lips bent in on them before, 2 × 4
// reliefs at the corners; the flange between the walls is the pending hit,
// its line (2, 300) → (398, 300).
const bend = (id, a, b, extra = {}) => ({
  id,
  a,
  b,
  angle: 90,
  direction: 'up',
  radius: null,
  punch: 'straight-88',
  ...extra,
});
function tray({ depth = 30, lip = 0, t = 1.2, die = null } = {}) {
  const out = depth + lip;
  const profile = {
    type: 'polygon',
    points: [
      [-out, 0],
      [W + out, 0],
      [W + out, H - 4],
      [W - 2, H - 4],
      [W - 2, H + depth],
      [2, H + depth],
      [2, H - 4],
      [-out, H - 4],
    ],
  };
  const tooling = die ? { die } : {};
  const feature = {
    id: 'f',
    type: 'sheetmetal',
    sketchId: 's',
    thickness: t,
    stock: 'spcc',
    kFactor: null,
    base: [W / 2, H / 2],
    marks: [],
    bends: [
      ...(lip
        ? [
            bend('lipR', [W + depth, 0], [W + depth, H - 4], tooling),
            bend('lipL', [-depth, H - 4], [-depth, 0], tooling),
          ]
        : []),
      bend('sideR', [W, 0], [W, H - 4], tooling),
      bend('sideL', [0, H - 4], [0, 0], tooling),
    ],
  };
  return { model: modelOf(feature, profile), feature, profile };
}
function modelOf(feature, profile) {
  const model = emptyModel();
  model.sketches = [{ id: 's', name: 'S', plane: 'XY', profile, primitives: [], constrained: false }];
  model.parts = [{ id: 'p', name: 'Tray', features: [feature] }];
  model.instances = [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }];
  return model;
}
const LINE = [
  [2, H],
  [W - 2, H],
];
const sessionOf = (extra = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  mode: 'points',
  points: LINE,
  ...extra,
});
const station = (setup, extra = {}, advise = true) =>
  brakeStation({ model: setup.model, session: sessionOf(extra), advise });
const clears = (pending) => !pending.error && !pending.refusals.length && !pending.collision.hit;
// The pending hit's own check, as the station runs it (no advice).
const checkOf = (pending, extra = {}) =>
  brakeCollisions({
    fold: pending.fold,
    bendIds: pending.bendIds,
    machine,
    punch: pending.punch,
    die: pending.die,
    advise: false,
    ...extra,
  });

describe('hornProfile (§4.1)', () => {
  it('rises from 10 mm at the horn’s end to 34.49 at the body on the R 25 arc', () => {
    // §4.8: the standard horn is one of HORNS and carries its section and name too.
    expect(HORN).toMatchObject({ reach: 20, tip: 10, radius: 25, load: 0.5 });
    expect(Object.isFrozen(HORN)).toBe(true);
    expect(hornRise).toBeCloseTo(34.49, 2);
    expect(hornProfile(0)).toBeCloseTo(10, 9);
    expect(hornProfile(5)).toBeCloseTo(11.58, 2);
    expect(hornProfile(15)).toBeCloseTo(19.49, 2);
    expect(hornProfile(20)).toBeCloseTo(34.49, 2);
    // On the arc: every point is R 25 from the centre (reach − radius, hornRise).
    for (const s of [0, 3, 7.5, 12, 18, 20])
      expect(Math.hypot(s - (HORN.reach - HORN.radius), hornProfile(s) - hornRise)).toBeCloseTo(HORN.radius, 9);
    // It only rises.
    for (let s = 0; s < 20; s += 0.5) expect(hornProfile(s + 0.5)).toBeGreaterThan(hornProfile(s));
  });
});

describe('toolingSections with horn sections (§4.2)', () => {
  const options = {
    machine,
    punch: punchOf('straight-88'),
    die: dieOf('v8-88'),
    tipZ: 1.2,
    span: [-198, 198],
    ranges: [[-198, 198]],
  };
  it('without horns: the same object as before, no parts key', () => {
    const plain = toolingSections(options);
    expect('parts' in plain.punch).toBe(false);
    expect(toolingSections({ ...options, horns: false })).toEqual(plain);
    expect(plain.punch.ranges).toEqual([[-198, 198]]);
    expect(plain.holder.ranges).toEqual([[-198, 198]]);
    expect(Object.keys(plain.punch)).toEqual(['ring', 'x', 'ranges']);
  });
  it('with horns: the body and holders 20 mm shorter each end, five slices each end, none lower than the horn', () => {
    const tools = toolingSections({ ...options, horns: true });
    const plain = toolingSections(options);
    expect(tools.punch.ranges).toEqual([[-178, 178]]);
    expect(tools.holder.ranges).toEqual([[-178, 178]]);
    expect(tools.punch.x).toEqual([-178, 178]);
    expect(tools.punch.ring).toEqual(plain.punch.ring);
    // The die, ram and bed are untouched.
    for (const key of ['die', 'ram', 'bed']) expect(tools[key]).toEqual(plain[key]);
    expect(HORN_SLICES).toBe(5);
    // The straight blade cut off at each height is one ring: one part per slice.
    expect(tools.punch.parts).toHaveLength(HORN_SLICES);
    const width = HORN.reach / HORN_SLICES;
    for (const [k, part] of tools.punch.parts.entries()) {
      expect(part.horn).toBe(true);
      const [a, b] = [k * width, (k + 1) * width];
      // One slice at each end of the run.
      expect(part.ranges).toEqual([
        [-198 + a, -198 + b],
        [198 - b, 198 - a],
      ]);
      const zs = part.ring.map(([, z]) => z - 1.2);
      // Cut at the horn's height at the slice's inner end, the taller one.
      expect(Math.max(...zs)).toBeCloseTo(hornProfile(b), 9);
      for (let s = a; s <= b + 1e-9; s += 0.25) expect(Math.max(...zs)).toBeGreaterThanOrEqual(hornProfile(s) - 1e-9);
      // The tip is the punch's own.
      expect(Math.min(...zs)).toBeCloseTo(0, 9);
      // Within the punch's section.
      const ys = part.ring.map(([y]) => y);
      const plainYs = plain.punch.ring.map(([y]) => y);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(Math.min(...plainYs) - 1e-9);
      expect(Math.max(...ys)).toBeLessThanOrEqual(Math.max(...plainYs) + 1e-9);
    }
  });
  it('a reversed gooseneck’s horns are its mirrored section; a radius punch takes none', () => {
    const goose = toolingSections({ ...options, punch: punchOf('gooseneck-88'), reverse: true, horns: true });
    const ahead = toolingSections({ ...options, punch: punchOf('gooseneck-88'), horns: true });
    expect(goose.punch.parts.length).toBeGreaterThanOrEqual(HORN_SLICES);
    expect(goose.punch.parts).toHaveLength(ahead.punch.parts.length);
    const points = (ring) =>
      ring
        .map(([y, z]) => `${y.toFixed(6)},${z.toFixed(6)}`)
        .sort()
        .join(' ');
    for (const [k, part] of goose.punch.parts.entries())
      expect(points(part.ring)).toBe(points(ahead.punch.parts[k].ring.map(([y, z]) => [-y + 0, z])));
    const round = toolingSections({ ...options, punch: punchOf('radius-10'), horns: true });
    expect('parts' in round.punch).toBe(false);
    expect(round).toEqual(toolingSections({ ...options, punch: punchOf('radius-10') }));
  });
  it('a run shorter than two horns: no body, each horn half of it', () => {
    const tools = toolingSections({ ...options, span: [-15, 15], ranges: [[-15, 15]], horns: true });
    expect(tools.punch.ranges).toEqual([]);
    const covered = tools.punch.parts.flatMap((p) => p.ranges);
    expect(Math.min(...covered.map((r) => r[0]))).toBe(-15);
    expect(Math.max(...covered.map((r) => r[1]))).toBe(15);
    for (const [x0, x1] of covered) expect(x1 - x0).toBeGreaterThan(0);
  });
  it('brakeFrame passes the bend’s horns through; the die’s runs are the bend’s', () => {
    const setup = tray({ depth: 30, lip: 15 });
    const { pending } = station(setup, { horns: true }, false);
    const posed = pending.fold;
    const frame = brakeFrame(posed, pending.bendIds[0], { die: pending.die, bed: machine.bed });
    expect(frame.horns).toBe(true);
    expect(frame.dieRanges).toBe(frame.ranges);
    const plain = station(setup, {}, false).pending;
    expect('horns' in brakeFrame(plain.fold, plain.bendIds[0], { die: plain.die, bed: machine.bed })).toBe(false);
  });
});

describe('the §2.2 tray through the collision check (§4.3)', () => {
  it('plain walls: clear with and without horns, never hooked', () => {
    const setup = tray({ depth: 30 });
    for (const horns of [false, true]) {
      const { pending } = station(setup, { horns }, false);
      expect(clears(pending)).toBe(true);
      expect(pending.collision.hooked).toBeUndefined();
      expect(pending.warnings).toEqual([]);
    }
  });
  for (const lip of [10, 15])
    it(`lips ${lip}: the punch meets them coming down; with horns it clears, hooked`, () => {
      const setup = tray({ depth: 30, lip });
      const plain = station(setup, {}, false).pending;
      expect(plain.collision.hit).toMatchObject({ tool: 'punch', phase: 'approach' });
      expect(plain.collision.hit.horn).toBeUndefined();
      const { pending } = station(setup, { horns: true }, false);
      expect(clears(pending)).toBe(true);
      expect(pending.collision.hooked).toBe(true);
      expect(pending.warnings).toEqual([{ code: 'horn-hooked', message: HOOKED }]);
      // The corners are pressed: the punch is fitted, no "ends not pressed".
      expect(pending.warnings.some((w) => w.code === 'tool-short-ends')).toBe(false);
      // Swept as the body is, the horns would meet the lip: only the short sweep passes.
      const result = checkOf(pending);
      expect(result.hit).toBe(null);
      expect(result.hooked).toBe(true);
    });
  it('lips 15 on walls 20 deep: the horn rises into the lip (a punch hit, horn: true)', () => {
    const setup = tray({ depth: 20, lip: 15 });
    const { pending } = station(setup, { horns: true }, false);
    expect(pending.collision.hit).toMatchObject({ tool: 'punch', horn: true, phase: 'approach' });
    expect(pending.collision.hit.message).toBe("Bend 5: the part hits the punch's horn as the ram comes down.");
  });
  it('without horns the result has no hooked key (bit for bit as before)', () => {
    const setup = tray({ depth: 30, lip: 15 });
    const { pending } = station(setup, {}, false);
    expect('hooked' in pending.collision).toBe(false);
    expect('horns' in pending.data[0]).toBe(false);
    expect(HORN_GAP).toBe(5);
  });
});

describe('the record, the carry and the punch choice (§4.1)', () => {
  const setup = tray({ depth: 30, lip: 15 });
  it('writes horns: true only when on, and never with a radius punch', () => {
    expect(brakeSessionDefaults().horns).toBe(false);
    expect('horns' in station(setup, {}, false).pending.data[0]).toBe(false);
    expect(station(setup, { horns: true }, false).pending.data[0].horns).toBe(true);
    const round = station(setup, { horns: true, punch: 'radius-10', shape: 'round' }, false).pending;
    expect(round.data.every((d) => !('horns' in d))).toBe(true);
  });
  it('a new line keeps them; brakeCarry carries them with the punch; a radius punch clears them', () => {
    expect(brakeCarry({ ...brakeSessionDefaults(), horns: true })).toEqual({
      punch: 'straight-88',
      die: null,
      reverse: false,
      horns: true,
    });
    expect(brakeCarry(brakeSessionDefaults())).toEqual({ punch: 'straight-88', die: null, reverse: false });
    expect(punchChoice({ ...brakeSessionDefaults(), horns: true }, 'radius-10')).toEqual({
      punch: 'radius-10',
      shape: 'round',
      die: null,
      horns: false,
    });
    expect(punchChoice({ ...brakeSessionDefaults(), horns: true }, 'gooseneck-88')).toEqual({ punch: 'gooseneck-88' });
  });
  it('the fold refuses horns on a radius punch by name', () => {
    expect(() =>
      foldSheet(
        {
          thickness: 1.2,
          stock: 'spcc',
          kFactor: null,
          bends: [{ ...bend('b1', [0, 50], [100, 50]), punch: 'radius-10', radius: 10, horns: true }],
        },
        { type: 'rectangle', width: 100, height: 100, origin: [0, 0] },
      ),
    ).toThrow('Bend 1: a radius punch has no horn sections.');
  });
  it('a made hit stores them; save and load keep them; the step and the stepped fold carry them', () => {
    const stroke = startStroke({ station: station(setup, { horns: true }), token: 't', id: 'flange' });
    expect(stroke.bends[0].horns).toBe(true);
    const feature = { ...setup.feature, bends: [...setup.feature.bends, ...stroke.bends] };
    const model = { ...setup.model, parts: setup.model.parts.map((p) => ({ ...p, features: [feature] })) };
    const loaded = normalizeModel(JSON.parse(JSON.stringify(model)));
    expect(loaded.parts[0].features[0].bends.at(-1).horns).toBe(true);
    const fold = foldSheet(loaded.parts[0].features[0], loaded.sketches[0].profile);
    expect(fold.bends.at(-1).horns).toBe(true);
    const step = hitSequence(fold).at(-1);
    expect(step.horns).toBe(true);
    expect(hitSequence(fold)[0].horns).toBeUndefined();
    expect(stepFold(fold, step).bends.at(-1).horns).toBe(true);
  });
});

describe('a stored step with horns re-checked by sequenceChecks (§4.3)', () => {
  const setup = tray({ depth: 30, lip: 15 });
  it('passes with its horns and fails without them', () => {
    const stroke = startStroke({ station: station(setup, { horns: true }), token: 't', id: 'flange' });
    const made = { ...setup.feature, bends: [...setup.feature.bends, ...stroke.bends] };
    const checks = sequenceChecks({ fold: foldSheet(made, setup.profile), machine });
    expect(checks.at(-1)).toMatchObject({ refusals: [], collision: null });
    const { horns: _horns, ...plain } = stroke.bends[0];
    const without = sequenceChecks({
      fold: foldSheet({ ...setup.feature, bends: [...setup.feature.bends, plain] }, setup.profile),
      machine,
    });
    expect(without.at(-1).collision).toMatchObject({ tool: 'punch' });
    // The job sheet names them on that step only.
    const sheet = jobSheet({ ...setup.model, parts: setup.model.parts.map((p) => ({ ...p, features: [made] })) });
    const bendStep = sheet.products[0].steps.find((s) => s.key === 'bend');
    expect(bendStep.items.at(-1).detail).toMatch(/Straight 88° punch, V8 88° die · horn sections · /);
    expect(bendStep.items[0].detail).not.toContain('horn sections');
  });
});

describe('the load rule (§4.3)', () => {
  // The plain tray of 3 mm SPCC in a V8 die: 527 kN/m, within the straight
  // punch's 1000, over the 500 its horn sections carry.
  const setup = tray({ depth: 30, t: 3, die: 'v8-88' });
  it('halves the punch’s rating with horns and names it in the tooling-load refusal', () => {
    const plain = station(setup, { die: 'v8-88' }, false).pending;
    expect(plain.refusals.map((r) => r.code)).not.toContain('tooling-load');
    const length = plain.readouts.length;
    expect(plain.readouts.toolingLimit).toBeCloseTo((1000 * length) / 1000, 9);
    const { pending } = station(setup, { die: 'v8-88', horns: true }, false);
    expect(pending.readouts.toolingLimit).toBeCloseTo((500 * length) / 1000, 9);
    const refusal = pending.refusals.find((r) => r.code === 'tooling-load');
    const fmt = (v) => Number(v.toFixed(2)).toString();
    expect(refusal.message).toBe(
      `This hit needs ${fmt(pending.readouts.tonnage)} kN; the Straight 88° punch with horn sections is rated 500 kN/m (half the punch's), ${fmt(pending.readouts.toolingLimit)} kN over ${fmt(length)} mm. Use a wider die, or bend it without horn sections.`,
    );
  });
  it('assessBend reads the record’s horns', () => {
    const feature = {
      thickness: 3,
      stock: 'spcc',
      kFactor: null,
      bends: [{ ...bend('b1', [0, 50], [400, 50]), die: 'v8-88', horns: true }],
    };
    const fold = foldSheet(feature, { type: 'rectangle', width: 400, height: 100, origin: [0, 0] });
    const result = assessBend(fold, 'b1', { machine });
    expect(result.refusals.map((r) => r.code)).toEqual(['tooling-load']);
    expect(result.refusals[0].message).toContain(
      "the Straight 88° punch with horn sections is rated 500 kN/m (half the punch's)",
    );
  });
});

describe('horn-short (§4.1)', () => {
  it('refuses horns on a run shorter than 50 mm', () => {
    const feature = (extra) => ({
      thickness: 1.2,
      stock: 'spcc',
      kFactor: null,
      bends: [{ ...bend('b1', [0, 50], [40, 50]), ...extra }],
    });
    const profile = { type: 'rectangle', width: 40, height: 100, origin: [0, 0] };
    const plain = assessBend(foldSheet(feature({}), profile), 'b1', { machine });
    expect(plain.refusals).toEqual([]);
    const horned = assessBend(foldSheet(feature({ horns: true }), profile), 'b1', { machine });
    expect(horned.refusals).toEqual([
      { code: 'horn-short', message: 'Horn sections need a bend of at least 50 mm: this one is 40 mm.' },
    ]);
    // 50 mm is enough.
    const fifty = assessBend(
      foldSheet(
        { ...feature({ horns: true }), bends: [{ ...bend('b1', [0, 50], [50, 50]), horns: true }] },
        { ...profile, width: 50 },
      ),
      'b1',
      { machine },
    );
    expect(fifty.refusals).toEqual([]);
  });
});

describe('the card’s try (§4.4)', () => {
  it('lips 15: "Use horn sections at the ends" before "Shorten the punch to 356 mm", and it clears', () => {
    const setup = tray({ depth: 30, lip: 15 });
    const { pending } = station(setup);
    expect(pending.collision.horn).toEqual({ label: 'Use horn sections at the ends', session: { horns: true } });
    expect(pending.collision.length.label).toBe('Shorten the punch to 356 mm');
    expect(clears(station(setup, pending.collision.horn.session).pending)).toBe(true);
  });
  it('lips 10: offered too; lips 15 on walls 20 deep and the plain tray: no horn button', () => {
    expect(station(tray({ depth: 30, lip: 10 })).pending.collision.horn).toEqual({
      label: 'Use horn sections at the ends',
      session: { horns: true },
    });
    const deep = station(tray({ depth: 20, lip: 15 })).pending;
    expect(deep.collision.hit).toBeTruthy();
    expect(deep.collision.horn).toBeUndefined();
    const withHorns = station(tray({ depth: 20, lip: 15 }), { horns: true }).pending;
    expect(withHorns.collision.hit.horn).toBe(true);
    expect(withHorns.collision.horn).toBeUndefined();
    const plain = station(tray({ depth: 30 })).pending;
    expect(clears(plain)).toBe(true);
    expect(plain.collision.horn).toBeUndefined();
  });
  it('measures the pending check with and without horns on the reference tray', () => {
    const setup = tray({ depth: 30, lip: 15 });
    const plain = station(setup, {}, false).pending;
    const horned = station(setup, { horns: true }, false).pending;
    const surface = partSurface(horned.fold);
    // Both run; the horn check samples the whole stroke (the plain one stops at the approach).
    expect(checkOf(plain).samples).toBe(1);
    expect(checkOf(horned, { surface }).samples).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------- PL-1.1: horn lengths (§4.8)
describe('the horn lengths (§4.8)', () => {
  it('HORNS keyed by reach, the standard HORN among them; hornOf reads true, a key or its string', () => {
    expect(HORN_KEYS).toEqual([20, 25, 30, 55]);
    expect(HORN).toBe(HORNS[20]);
    for (const key of HORN_KEYS) {
      expect(Object.isFrozen(HORNS[key])).toBe(true);
      expect(HORNS[key].reach).toBe(key);
      expect(HORNS[key].load).toBe(0.5);
    }
    expect(HORNS[55]).toMatchObject({ tip: 45, radius: 20, section: 150, name: 'Special 55 mm' });
    expect(hornOf(true)).toBe(HORNS[20]);
    expect(hornOf(30)).toBe(HORNS[30]);
    expect(hornOf('25')).toBe(HORNS[25]);
    for (const none of [false, null, undefined, '', 0, 17, 'toString']) expect(hornOf(none)).toBe(null);
  });
  it('hornProfile at each horn’s points; the standard exactly as before', () => {
    // The standard, bit for bit against PL-1's own formula.
    const before = (s) => {
      const at = Math.max(0, Math.min(20, s));
      return hornRise - Math.sqrt(Math.max(0, 25 ** 2 - (20 - at - 25) ** 2));
    };
    for (let s = -1; s <= 21; s += 0.25) {
      expect(hornProfile(s)).toBe(before(s));
      expect(hornProfile(s, HORNS[20])).toBe(before(s));
    }
    expect(hornProfile(0, HORNS[25])).toBe(10);
    expect(hornProfile(10, HORNS[25])).toBeCloseTo(16, 9);
    expect(hornProfile(20, HORNS[25])).toBeCloseTo(22, 9);
    expect(hornProfile(25, HORNS[25])).toBeCloseTo(35, 9);
    expect(hornProfile(0, HORNS[30])).toBe(10);
    expect(hornProfile(25, HORNS[30])).toBeCloseTo(22.5, 9);
    expect(hornProfile(27.5, HORNS[30])).toBeCloseTo(28.75, 9);
    expect(hornProfile(30, HORNS[30])).toBeCloseTo(35, 9);
    // The special: flat at 45 to 20 mm from the body, then the R 20 fillet up to 65.
    expect(hornProfile(0, HORNS[55])).toBe(45);
    expect(hornProfile(35, HORNS[55])).toBeCloseTo(45, 9);
    expect(hornProfile(45, HORNS[55])).toBeCloseTo(65 - Math.sqrt(300), 9);
    expect(hornProfile(55, HORNS[55])).toBeCloseTo(65, 9);
  });
  const options = {
    machine,
    punch: punchOf('straight-88'),
    die: dieOf('v8-88'),
    tipZ: 1.2,
    span: [-198, 198],
    ranges: [[-198, 198]],
  };
  for (const key of HORN_KEYS)
    it(`the ${key} mm horn: the body stands back ${key} mm, slices no wider than 4 mm (1 mm drawn), never under the profile`, () => {
      const horn = HORNS[key];
      for (const [hornSlice, widest] of [
        [undefined, 4],
        [HORN_DRAWN_SLICE, 1],
      ]) {
        const tools = toolingSections({ ...options, horns: key, ...(hornSlice ? { hornSlice } : {}) });
        expect(tools.punch.ranges).toEqual([[-198 + key, 198 - key]]);
        expect(tools.holder.ranges).toEqual(tools.punch.ranges);
        expect(tools.punch.parts).toHaveLength(Math.ceil(key / widest - 1e-9));
        let covered = 0;
        for (const part of tools.punch.parts) {
          const [[a0, a1], [b0, b1]] = part.ranges;
          expect(a1 - a0).toBeLessThanOrEqual(widest + 1e-9);
          expect(b1 - b0).toBeCloseTo(a1 - a0, 9);
          covered += a1 - a0;
          const top = Math.max(...part.ring.map(([, z]) => z - 1.2));
          for (let s = a0 + 198; s <= a1 + 198 + 1e-9; s += 0.1)
            expect(top).toBeGreaterThanOrEqual(hornProfile(s, horn) - 1e-9);
        }
        expect(covered).toBeCloseTo(key, 9);
      }
      // `true` is the standard.
      if (key === 20)
        expect(toolingSections({ ...options, horns: true })).toEqual(toolingSections({ ...options, horns: 20 }));
    });
  it('horn-short per horn: 50, 60, 70 and 120 mm', () => {
    const at = (length, horns) =>
      assessBend(
        foldSheet(
          { thickness: 1.2, stock: 'spcc', kFactor: null, bends: [{ ...bend('b1', [0, 50], [length, 50]), horns }] },
          { type: 'rectangle', width: length, height: 100, origin: [0, 0] },
        ),
        'b1',
        { machine },
      ).refusals;
    for (const [horns, least, words] of [
      [true, 50, 'Horn sections'],
      [25, 60, '25 mm horn sections'],
      [30, 70, '30 mm horn sections'],
      [55, 120, '55 mm horn sections'],
    ]) {
      expect(at(least - 1, horns)).toEqual([
        { code: 'horn-short', message: `${words} need a bend of at least ${least} mm: this one is ${least - 1} mm.` },
      ]);
      expect(at(least, horns)).toEqual([]);
    }
  });
  it('the fold refuses a horn length the rack does not hold', () => {
    expect(() =>
      foldSheet(
        { thickness: 1.2, stock: 'spcc', kFactor: null, bends: [{ ...bend('b1', [0, 50], [100, 50]), horns: 17 }] },
        { type: 'rectangle', width: 100, height: 100, origin: [0, 0] },
      ),
    ).toThrow('Bend 1: there are no 17 mm horn sections in the rack.');
  });
  it('the session: a key carries and is written; the standard stays true; a radius punch clears it', () => {
    expect(brakeCarry({ ...brakeSessionDefaults(), horns: 30 })).toMatchObject({ horns: 30 });
    expect(brakeCarry({ ...brakeSessionDefaults(), horns: 20 })).toMatchObject({ horns: true });
    expect(punchChoice({ ...brakeSessionDefaults(), horns: 55 }, 'radius-10')).toMatchObject({ horns: false });
    const setup = tray({ depth: 30, lip: 22 });
    expect(station(setup, { horns: 30 }, false).pending.data[0].horns).toBe(30);
    expect(station(setup, { horns: 20 }, false).pending.data[0].horns).toBe(true);
  });
});

describe('the card tries the horns shortest first (§4.8)', () => {
  const card = (setup, extra = {}) => station(setup, extra).pending.collision;
  it('lips 19 on walls 30: the standard horn meets them; "Use 25 mm horn sections at the ends", named in the sentence', () => {
    const setup = tray({ depth: 30, lip: 19 });
    expect(station(setup, { horns: true }, false).pending.collision.hit).toMatchObject({ tool: 'punch', horn: true });
    const c = card(setup);
    expect(c.horn).toEqual({ label: 'Use 25 mm horn sections at the ends', session: { horns: 25 } });
    expect(c.hit.message).toContain('use 25 mm horn sections at the ends or shorten the punch to 356 mm.');
    const made = station(setup, c.horn.session, false).pending;
    expect(clears(made)).toBe(true);
    expect(made.collision.hooked).toBe(true);
    // With the standard on, the longer one is tried.
    expect(card(setup, { horns: true }).horn).toEqual({
      label: 'Use 25 mm horn sections at the ends',
      session: { horns: 25 },
    });
  });
  it('lips 22: the 30 mm horn (the 25 meets them); lips 28: none; lips 40 on walls 60: the 55; lips 40 on walls 30: none', () => {
    expect(card(tray({ depth: 30, lip: 22 })).horn).toEqual({
      label: 'Use 30 mm horn sections at the ends',
      session: { horns: 30 },
    });
    expect(station(tray({ depth: 30, lip: 22 }), { horns: 25 }, false).pending.collision.hit.horn).toBe(true);
    expect(card(tray({ depth: 30, lip: 22 }), { horns: 25 }).horn.session).toEqual({ horns: 30 });
    expect(card(tray({ depth: 30, lip: 28 })).horn).toBeUndefined();
    expect(station(tray({ depth: 30, lip: 28 }), { horns: 30 }, false).pending.collision.hit.horn).toBe(true);
    const deep = tray({ depth: 60, lip: 40 });
    expect(card(deep).horn).toEqual({ label: 'Use 55 mm horn sections at the ends', session: { horns: 55 } });
    expect(clears(station(deep, { horns: 55 }, false).pending)).toBe(true);
    const low = card(tray({ depth: 30, lip: 40 }));
    expect(low.hit).toBeTruthy();
    expect(low.horn).toBeUndefined();
    expect(station(tray({ depth: 30, lip: 40 }), { horns: 55 }, false).pending.collision.hit.horn).toBe(true);
  });
});

describe('a record with horns: 30 (§4.8)', () => {
  it('saved, reloaded, re-run, checked and named', () => {
    const setup = tray({ depth: 30, lip: 22 });
    const stroke = startStroke({ station: station(setup, { horns: 30 }), token: 't', id: 'flange' });
    expect(stroke.bends[0].horns).toBe(30);
    const feature = { ...setup.feature, bends: [...setup.feature.bends, ...stroke.bends] };
    const model = { ...setup.model, parts: setup.model.parts.map((p) => ({ ...p, features: [feature] })) };
    const loaded = normalizeModel(JSON.parse(JSON.stringify(model)));
    const fold = foldSheet(loaded.parts[0].features[0], loaded.sketches[0].profile);
    expect(fold.bends.at(-1).horns).toBe(30);
    expect(hitSequence(fold).at(-1).horns).toBe(30);
    expect(sequenceChecks({ fold, machine }).at(-1)).toMatchObject({ refusals: [], collision: null });
    // Re-run: the step's fold carries the horn, and its frame passes it to the scene.
    const after = brakeStation({ model: loaded, session: sessionOf({ mode: 'gauge', points: [] }) });
    const rerun = rerunStroke({ station: after, token: 'r', bendId: 'flange' });
    expect(rerun.view.fold.bends.find((b) => b.id === 'flange').horns).toBe(30);
    expect(brakeFrame(rerun.view.fold, 'flange', { die: 'v8-88', bed: machine.bed }).horns).toBe(30);
    const sheet = jobSheet(loaded);
    const bendStep = sheet.products[0].steps.find((s) => s.key === 'bend');
    expect(bendStep.items.at(-1).detail).toMatch(/V8 88° die · 30 mm horn sections · /);
    // Its load: half the punch's, as every horn.
    const tooling = assessBend(fold, 'flange', { machine });
    expect(tooling.readouts.toolingLimit).toBeCloseTo((500 * tooling.readouts.length) / 1000, 9);
  });
});
