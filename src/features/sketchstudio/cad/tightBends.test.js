// Bending a bend on (docs/sketch-studio-tight-bends.md §4, TB-1): a bend
// made part-way can be hit again later, further, with other bends made in
// between. The record and its refusals (§4.1), the order made (§4.2), the
// checks from a part-bent sheet (§4.3: the §2 table as assertions), the
// station (§4.4), the job sheet and the film; and parity: a feature with no
// bend-on entry folds, checks, lists, times and films as before.
import { describe, expect, it } from 'vitest';
import {
  anglesBefore,
  bendStrokes,
  foldSheet,
  foldedBounds,
  hitSequence,
  sheetMetalFeature,
  stepFold,
  stepPose,
  strokeBends,
} from './sheetMetal.js';
import {
  PENDING_BEND,
  bendOnPatch,
  brakePatch,
  brakeSessionDefaults,
  brakeStation,
  madeLine,
  rerunStroke,
  sequenceChecks,
  startStroke,
} from './brakeStation.js';
import { brakeCollisions, partSurface } from './brakeCollisions.js';
import { assessBend, gaugeEdges, strokeAt, strokeTimeline } from './pressBrake.js';
import { emptyModel } from './model.js';
import { machineOf } from './shopCatalog.js';
import { jobSheet, strokeHits } from './jobSheet.js';
import { filmScenes, filmState } from './shopFilm.js';
import { sheetMetalControlBox, sheetMetalKiosk, sheetMetalPumpBracket } from './shopExamples.js';
import { foldOf } from './shopRoute.js';

// The user's screenshot (§1): a 605.4 × 420.4 blank, t 1.2 SPCC; lines 29 mm
// (the inner bend) and 11 mm (the return lip) from the right edge.
const W = 605.4,
  H = 420.4;
const BLANK = { type: 'rectangle', width: W, height: H, origin: [0, 0] };
const MACHINE = 'brake-50-2000';
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
const on = (id, again, angle, extra = {}) => ({ id, again, angle, punch: 'straight-88', ...extra });
const fold = (bends) => foldSheet(feature(bends), BLANK);
const refusal = (bends) => {
  try {
    fold(bends);
    return '';
  } catch (error) {
    return error.message;
  }
};
const modelOf = (bends, profile = BLANK) => {
  const model = emptyModel();
  model.sketches = [{ id: 's', name: 'S', plane: 'XY', profile, primitives: [], constrained: false }];
  model.parts = [{ id: 'p', name: 'Tray', features: [feature(bends)] }];
  model.instances = [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }];
  return model;
};
const RIGHT = gaugeEdges([
  [0, 0],
  [W, 0],
  [W, H],
  [0, H],
]).findIndex((e) => Math.abs(e.a[0] - W) < 1e-6 && Math.abs(e.b[0] - W) < 1e-6);
const session = (extra = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  mode: 'gauge',
  edge: RIGHT,
  ...extra,
});
const hitOf = (result) =>
  result.hit ? { tool: result.hit.tool, phase: result.hit.phase, angle: result.hit.angle } : null;
const collide = (f, options) =>
  brakeCollisions({ fold: f, machine: MACHINE, punch: 'straight-88', die: null, advise: false, ...options });

describe('the bend-on record (§4.1)', () => {
  it('folds as the bend at its final angle: the same part as the two bends made at 90°', () => {
    const staged = fold([line('inner', 29, 30), line('lip', 11), on('again', 'inner', 90)]);
    const plain = fold([line('lip', 11), line('inner', 29)]);
    expect(staged.bends.map((b) => b.id)).toEqual(['inner', 'lip']);
    const inner = staged.bends.find((b) => b.id === 'inner');
    expect(inner.angle).toBe(90);
    expect(inner.hits.map((h) => [h.id, h.index, h.angle])).toEqual([
      ['inner', 0, 30],
      ['again', 2, 90],
    ]);
    // The numbers are the final angle's (the allowance stays the 90° one).
    const same = plain.bends.find((b) => b.id === 'inner');
    for (const key of ['radius', 'allowance', 'setback', 'deduction']) expect(inner[key]).toBeCloseTo(same[key], 12);
    const [a0, a1] = foldedBounds(staged),
      [b0, b1] = foldedBounds(plain);
    for (let k = 0; k < 3; k++) {
      expect(a0[k]).toBeCloseTo(b0[k], 6);
      expect(a1[k]).toBeCloseTo(b1[k], 6);
    }
  });
  it('takes the last hit’s punch, die and lengths for the bend as made', () => {
    const f = fold([
      line('inner', 29, 30, { die: 'v8-88' }),
      on('again', 'inner', 90, { die: 'v10-88', punchTrim: 5 }),
    ]);
    const inner = f.bends[0];
    expect([inner.die, inner.punchTrim]).toEqual(['v10-88', 5]);
    expect(inner.hits.map((h) => [h.die, h.punchTrim ?? null])).toEqual([
      ['v8-88', null],
      ['v10-88', 5],
    ]);
  });
  it('refuses in shop words, naming the step by its place in the sequence', () => {
    expect(refusal([line('inner', 29, 30), on('x', 'inner', 20)])).toBe(
      'Bend 1 is already at 30°: a hit only bends it further.',
    );
    expect(refusal([line('inner', 29, 30), on('x', 'inner', 30)])).toBe(
      'Bend 1 is already at 30°: a hit only bends it further.',
    );
    // An edited first angle that passes a later step is refused by the same rule.
    expect(refusal([line('inner', 29, 100), line('lip', 11), on('x', 'inner', 90)])).toBe(
      'Bend 1 is already at 100°: a hit only bends it further.',
    );
    expect(refusal([line('inner', 29, 30), on('x', 'inner', 60), on('y', 'inner', 45)])).toBe(
      'Bend 1 is already at 60°: a hit only bends it further.',
    );
    expect(refusal([line('inner', 29, 30), on('x', 'inner', 190)])).toBe('Step 2: a bend goes at most to 180°.');
    expect(refusal([on('x', 'inner', 90), line('inner', 29, 30)])).toBe(
      'Step 1 bends a bend on before it is made: a bend is made first, then bent on.',
    );
    expect(refusal([line('inner', 29, 30), on('x', 'nothing', 90)])).toBe(
      'Step 2 bends on a bend that is not on this part.',
    );
    expect(refusal([on('x', 'y', 90), on('y', 'x', 90)])).toBe('Step 1 bends on a bend that is not on this part.');
    expect(refusal([line('inner', 29, 30), on('x', 'x', 90)])).toBe('Step 2 bends on a bend that is not on this part.');
    expect(refusal([line('r', 100, 45, { radius: 20, steps: 4 }), on('x', 'r', 90)])).toBe(
      'Step 2: a round bend is made in its own hits: it cannot be bent on.',
    );
    expect(refusal([line('inner', 29, 30), on('x', 'inner', 90, { punch: 'radius-10' })])).toMatch(
      /^Step 2: a radius punch makes a round bend/,
    );
    expect(
      refusal([line('inner', 29, 30), line('lip', 11, 90, { stroke: 'S' }), on('x', 'inner', 90, { stroke: 'S' })]),
    ).toBe('Step 2 makes new bends and bends made ones on in one hit: make them as separate hits.');
    expect(
      refusal([line('inner', 29, 30), on('x', 'inner', 60, { stroke: 'S' }), on('y', 'inner', 90, { stroke: 'S' })]),
    ).toBe('Step 2 bends bend 1 on twice in one hit.');
  });
});

describe('the order made (§4.2)', () => {
  it('hitSequence: the steps with their angles before and after; anglesBefore', () => {
    const f = fold([line('inner', 29, 30), line('lip', 11), on('again', 'inner', 90)]);
    const steps = hitSequence(f);
    expect(steps.map((s) => [s.key, s.again, s.bendIds, s.recordIds, s.from, s.to, s.start, s.end])).toEqual([
      ['inner', false, ['inner'], ['inner'], { inner: 0 }, { inner: 30 }, 0, 0],
      ['lip', false, ['lip'], ['lip'], { lip: 0 }, { lip: 90 }, 1, 1],
      ['again', true, ['inner'], ['again'], { inner: 30 }, { inner: 90 }, 2, 2],
    ]);
    expect(anglesBefore(f, 0)).toEqual({ inner: 0, lip: 0 });
    expect(anglesBefore(f, 2)).toEqual({ inner: 30, lip: 90 });
    expect(anglesBefore(f, 3)).toEqual({ inner: 90, lip: 90 });
    // The step's own fold: the bend at that step's angle, the zone the final one's.
    const first = stepFold(f, steps[0]);
    expect(first.bends[0].angle).toBe(30);
    expect(first.bends[0].label).toBe('UP 30° R1.28');
    expect(first.bends[0].allowance).toBe(f.bends[0].allowance);
    expect(stepPose(f, 2).angles).toEqual({ inner: 30 });
    expect(stepPose(f, 0, { after: true }).angles).toEqual({ lip: 0 });
  });
  it('a stroke of tabs is bent on as one step', () => {
    // Two tabs on one line (a notched flange): one stroke, then bent on as one hit.
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
    const FLANGE = { a: [30, 0], b: [30, 300], angle: 30, direction: 'up', radius: null };
    const tabs = strokeBends({ ...feature(), thickness: 1.5 }, NOTCHED, {}, FLANGE).map((l, i) => ({
      ...FLANGE,
      ...l,
      id: `L${i + 1}`,
      stroke: 'S1',
    }));
    const f = foldSheet(
      {
        ...feature([...tabs, on('A1', 'L1', 90, { stroke: 'S2' }), on('A2', 'L2', 90, { stroke: 'S2' })]),
        thickness: 1.5,
      },
      NOTCHED,
    );
    const steps = hitSequence(f);
    expect(steps.map((s) => [s.id, s.bendIds, s.recordIds, s.again])).toEqual([
      ['S1', ['L1', 'L2'], ['L1', 'L2'], false],
      ['S2', ['L1', 'L2'], ['A1', 'A2'], true],
    ]);
    expect(steps[1].from).toEqual({ L1: 30, L2: 30 });
    expect(steps[1].to).toEqual({ L1: 90, L2: 90 });
  });
});

// Parity (§4.2): a feature with no bend-on entry is listed, checked, re-run and timed as before.
describe('parity on the examples', () => {
  const examples = {
    'pump bracket': sheetMetalPumpBracket,
    'control box': sheetMetalControlBox,
    kiosk: sheetMetalKiosk,
  };
  for (const [name, make] of Object.entries(examples))
    it(`${name}: hitSequence is bendStrokes step for step; the checks, re-runs and hits as before`, () => {
      const model = make();
      const machine = machineOf(MACHINE);
      let parts = 0;
      for (const instance of model.instances) {
        const part = model.parts.find((p) => p.id === instance.partId);
        const sm = sheetMetalFeature(part);
        if (!sm || part.features.indexOf(sm) !== part.features.findIndex((f) => !f.suppressed)) continue;
        const f = foldOf(model, instance.id, {});
        if (!f?.bends.length) continue;
        parts += 1;
        const strokes = bendStrokes(f.bends);
        const steps = hitSequence(f);
        expect(
          steps.map(({ id, key, bendIds, start, end, index }) => ({ id, key, bendIds, start, end, index })),
        ).toEqual(strokes);
        expect(steps.every((s) => !s.again)).toBe(true);
        for (const bend of f.bends) expect(bend.hits).toHaveLength(1);
        for (const step of steps) expect(stepFold(f, step)).toBe(f);
        // The old sequenceChecks, as it was written before TB-1.
        const surface = partSurface(f);
        const old = strokes.map((stroke, index) => {
          const bend = f.bends[stroke.start];
          const ids = stroke.bendIds;
          const angles = Object.fromEntries(f.bends.slice(stroke.end + 1).map((b) => [b.id, 0]));
          const refusals = assessBend(f, ids.length === 1 ? ids[0] : ids, {
            machine,
            label: `Bend ${index + 1}`,
            angles: { ...angles, ...Object.fromEntries(ids.map((id) => [id, 0])) },
          }).refusals;
          let hit = null;
          if (!refusals.some((r) => r.code === 'not-in-line')) {
            const options = {
              fold: f,
              bendIds: ids,
              angles,
              machine,
              punch: bend.punch,
              die: bend.die,
              surface,
              number: index + 1,
            };
            const first = brakeCollisions(options);
            hit = first.hit ? brakeCollisions({ ...options, turned: true, advise: false }).hit && first.hit : null;
          }
          return {
            bendId: stroke.key,
            bendIds: ids,
            index,
            label: ids.length > 1 ? `${bend.label} · ${ids.length} flanges` : bend.label,
            refusals: refusals.map((r) => r.message),
            collision: hit ? { tool: hit.tool, angle: hit.angle, message: hit.message } : null,
          };
        });
        const now = sequenceChecks({ fold: f, machine }).map((c) => ({
          ...c,
          refusals: c.refusals.map((r) => r.message),
          collision: c.collision
            ? { tool: c.collision.tool, angle: c.collision.angle, message: c.collision.message }
            : null,
        }));
        expect(now).toEqual(old);
        // The old re-run: the strokes after it flat, it bent again from 0.
        for (const stroke of strokes) {
          const bend = f.bends[stroke.start];
          const { view, run } = rerunStroke({ station: { fold: f, machine }, token: 't', bendId: stroke.key });
          expect(view.fold).toBe(f);
          expect(view.angles).toEqual(Object.fromEntries(f.bends.slice(stroke.end + 1).map((b) => [b.id, 0])));
          expect([view.bendId, view.die, view.punch, run.target, run.from]).toEqual([
            bend.id,
            bend.die,
            bend.punch,
            bend.angle,
            undefined,
          ]);
        }
        // The old hit count.
        expect(strokeHits(f)).toBe(strokes.reduce((sum, s) => sum + (f.bends[s.start].steps || 1), 0));
      }
      expect(parts).toBeGreaterThan(0);
    });
});

// §2's table on the brake's own collision check (50 t × 2 m press, automatic die, straight 88° punch).
describe('brakeCollisions from a part-bent sheet (§4.3, the §2 table)', () => {
  it('inner first then the lip hits the ram as it comes down; the lip first clears', () => {
    const userOrder = fold([line('inner', 29), line('lip', 11)]);
    expect(hitOf(collide(userOrder, { bendIds: ['lip'] }))).toMatchObject({ tool: 'ram', phase: 'approach' });
    const shopOrder = fold([line('lip', 11), line('inner', 29)]);
    expect(collide(shopOrder, { bendIds: ['lip'], angles: { inner: 0 } }).hit).toBe(null);
    expect(collide(shopOrder, { bendIds: ['inner'] }).hit).toBe(null);
  });
  it('inner to 30° lets the lip clear; to 45° it meets the ram near 79°, to 60° near 50°; the bend on clears', () => {
    const results = {};
    for (const pre of [30, 45, 60]) {
      const f = fold([line('inner', 29, pre), line('lip', 11), on('again', 'inner', 90)]);
      results[pre] = hitOf(collide(f, { bendIds: ['lip'], angles: { inner: pre } }));
      // The bend on from `pre` to 90° with the lip made (the §2 order's last step).
      expect(collide(f, { bendIds: ['inner'], start: pre, target: 90 }).hit).toBe(null);
    }
    expect(results[30]).toBe(null);
    expect(results[45]).toMatchObject({ tool: 'ram', phase: 'bend' });
    expect(results[45].angle).toBeGreaterThan(77);
    expect(results[45].angle).toBeLessThan(81);
    expect(results[60]).toMatchObject({ tool: 'ram', phase: 'bend' });
    expect(results[60].angle).toBeGreaterThan(48);
    expect(results[60].angle).toBeLessThan(52);
  });
  it('`start` checks the approach at the part-bent angle; a bend on that collides gets the fact and the tooling', () => {
    // The inner bend made at 90°, the lip to 30°, then the lip on to 90°: the
    // lip at 30° already stands in the punch's way as the ram comes down.
    const f = fold([line('inner', 29), line('lip', 11, 30), on('again', 'lip', 90)]);
    const met = brakeCollisions({
      fold: f,
      bendIds: ['lip'],
      start: 30,
      target: 90,
      machine: MACHINE,
      punch: 'straight-88',
      die: null,
    }).hit;
    expect([met.tool, met.phase, met.angle]).toEqual(['punch', 'approach', 30]);
    // Named by the bend (its first step) and where the hit goes; no "bend this one earlier", no flip.
    expect(met.message).toBe(
      'Bend 2 on to 90°: the part hits the punch as the ram comes down. Use the gooseneck punch.',
    );
    const fact = collide(f, { bendIds: ['lip'], start: 30, target: 90 }).hit;
    expect(fact.message).toBe('Bend 2 on to 90°: the part hits the punch as the ram comes down.');
    // From flat the same hit is checked at 0° first.
    expect(collide(f, { bendIds: ['lip'], target: 90 }).hit.angle).toBe(0);
  });
  it('strokeAt runs from the angle the bend stands at', () => {
    const timeline = strokeTimeline(MACHINE, 2);
    expect(strokeAt(timeline, 0, 90, 30).angle).toBe(30);
    expect(strokeAt(timeline, timeline.approach + timeline.bend / 2, 90, 30).angle).toBeCloseTo(60, 9);
    expect(strokeAt(timeline, timeline.total + 1, 90, 30).angle).toBe(90);
    expect(strokeAt(timeline, 0, 90).angle).toBe(0);
  });
});

describe('sequenceChecks on the three-step part (§4.3)', () => {
  it('each step from its angle to its angle, the others as they stand then', () => {
    const f = fold([line('inner', 29, 30), line('lip', 11), on('again', 'inner', 90)]);
    const checks = sequenceChecks({ fold: f, machine: machineOf(MACHINE) });
    expect(checks.map((c) => [c.bendId, c.index, c.label, c.refusals.length, c.collision])).toEqual([
      ['inner', 0, 'UP 30° R1.28', 0, null],
      ['lip', 1, 'UP 90° R1.28', 0, null],
      ['again', 2, 'bend 1 on: 30° → 90°', 0, null],
    ]);
    // The user's order made in full: the lip is refused (the ram), as the screenshot.
    const refused = sequenceChecks({ fold: fold([line('inner', 29), line('lip', 11)]), machine: machineOf(MACHINE) });
    expect(refused[1].collision?.tool).toBe('ram');
    // Inner to 45°, then the lip: the ram, near 79° (the fact).
    const deep = sequenceChecks({ fold: fold([line('inner', 29, 45), line('lip', 11)]), machine: machineOf(MACHINE) });
    expect(deep[1].collision?.tool).toBe('ram');
    expect(deep[1].collision.angle).toBeGreaterThan(77);
    expect(deep[1].collision.angle).toBeLessThan(81);
  });
});

describe('the station (§4.4)', () => {
  const twoMade = () => modelOf([line('b1', 29, 30), line('b2', 11)]);
  it('a pending line on a made bend’s line is that bend’s next hit; the pedal commits the bend-on entry', () => {
    const model = twoMade();
    const station = brakeStation({ model, session: session({ distance: 29, angle: 90 }) });
    const { pending } = station;
    expect(pending.again).toMatchObject({ bendIds: ['b1'], from: 30, to: 90, number: 1 });
    expect(pending.bendIds).toEqual(['b1']);
    expect(pending.data).toEqual([{ id: PENDING_BEND, again: 'b1', angle: 90, punch: 'straight-88' }]);
    expect(pending.refusals).toEqual([]);
    expect(pending.collision.hit).toBe(null);
    // The sheet sits in the die at the angle the bend stands at.
    expect(station.view.angles).toEqual({ b1: 30 });
    let n = 0;
    const stroke = startStroke({ station, token: 't', newId: () => `n${++n}`, strokeId: 'S' });
    expect(stroke.bends).toEqual([{ id: 'n1', again: 'b1', angle: 90, punch: 'straight-88', die: pending.die.key }]);
    expect([stroke.run.from, stroke.run.target, stroke.run.bendIds, stroke.run.commit]).toEqual([30, 90, ['b1'], true]);
  });
  it('a line that crosses, lies beside or covers part of a bend is no bend’s next hit', () => {
    const model = twoMade();
    const station = brakeStation({ model, session: session({ distance: 29 }) });
    const { fold: f, polygon } = station;
    expect(madeLine(f, polygon, { a: [W - 29, 0], b: [W - 29, H] })).toMatchObject({ bendIds: ['b1'] });
    // 0.04 mm off: the same line; 0.1 mm off: beside it.
    expect(madeLine(f, polygon, { a: [W - 29.04, 0], b: [W - 29.04, H] })).toMatchObject({ bendIds: ['b1'] });
    expect(madeLine(f, polygon, { a: [W - 29.1, 0], b: [W - 29.1, H] })).toBe(null);
    // Across it, or at a slant through it.
    expect(madeLine(f, polygon, { a: [0, 200], b: [W, 200] })).toBe(null);
    expect(madeLine(f, polygon, { a: [W - 29, 0], b: [W - 30, H] })).toBe(null);
    // Two points half way along still press the whole of the material the line touches (as any
    // hit does, lineSegments): the same segment, so the same line.
    expect(madeLine(f, polygon, { a: [W - 29, 0], b: [W - 29, H / 2] })).toMatchObject({ bendIds: ['b1'] });
    // So the station takes them as new lines, and the fold says what it says.
    const slant = brakeStation({
      model,
      session: session({
        mode: 'points',
        edge: null,
        points: [
          [W - 29, 0],
          [W - 30, H],
        ],
      }),
    });
    expect(slant.pending.again).toBeUndefined();
  });
  it('arriving with an angle not above the bend’s sets it to 90° (180° from 90° on); typed lower it is refused', () => {
    const model = twoMade();
    const station = brakeStation({ model, session: session({ distance: 50, angle: 20 }) });
    expect(brakePatch(session({ distance: 50, angle: 20 }), { distance: 29 }, station).angle).toBe(90);
    expect(brakePatch(session({ distance: 50, angle: 120 }), { distance: 29 }, station).angle).toBe(120);
    // Without the station (the old rule's callers) nothing changes.
    expect(brakePatch(session({ distance: 50, angle: 20 }), { distance: 29 }).angle).toBe(20);
    // A bend at 90° or more: on to 180°.
    const lip = brakeStation({ model, session: session({ distance: 50, angle: 90 }) });
    expect(brakePatch(session({ distance: 50, angle: 90 }), { distance: 11 }, lip).angle).toBe(180);
    // Passing over a made line on the way (a gauge edge clicked at the last L): moving on before
    // the angle is touched puts the operator's angle back; once typed, it stays.
    const over = brakePatch(session({ distance: 50, angle: 90 }), { distance: 11 }, lip);
    expect([over.angle, over.arrived]).toEqual([180, { from: 90, set: 180 }]);
    const on29 = brakePatch(over, { distance: 29 }, lip);
    expect([on29.angle, on29.arrived]).toEqual([90, null]);
    const away = brakePatch(over, { distance: 60 }, lip);
    expect(away.angle).toBe(90);
    const typed = brakePatch(over, { angle: 150 }, lip);
    expect([typed.angle, typed.arrived]).toEqual([150, null]);
    expect(brakePatch(typed, { distance: 60 }, lip).angle).toBe(150);
    // Typed after arriving: the refusal, nothing to commit.
    const low = brakeStation({ model, session: session({ distance: 29, angle: 20 }) });
    expect(low.pending.error).toBe('Bend 1 is already at 30°: a hit only bends it further.');
    expect(low.pending.again).toMatchObject({ from: 30, to: 20 });
  });
  it('Bend on sets the line to that bend’s: the nearest parallel edge and L', () => {
    const model = twoMade();
    const station = brakeStation({ model, session: session() });
    expect(bendOnPatch(station, 'b1')).toEqual({
      mode: 'gauge',
      edge: RIGHT,
      distance: 29,
      skip: [],
      turned: false,
      punchTrim: null,
      dieTrim: null,
      scrub: null,
    });
    expect(bendOnPatch(station, 'nothing')).toBe(null);
  });
  it('re-runs and scrubs a bend-on step from the angle it started at', () => {
    const f = fold([line('inner', 29, 30), line('lip', 11), on('again', 'inner', 90)]);
    const { view, run } = rerunStroke({
      station: { fold: f, machine: machineOf(MACHINE) },
      token: 't',
      bendId: 'again',
    });
    expect([run.from, run.target, run.bendIds, view.bendId]).toEqual([30, 90, ['inner'], 'inner']);
    const first = rerunStroke({ station: { fold: f, machine: machineOf(MACHINE) }, token: 't', bendId: 'inner' });
    expect([first.run.from, first.run.target]).toEqual([undefined, 30]);
    expect(first.view.angles).toEqual({ lip: 0 });
    expect(first.view.fold.bends[0].angle).toBe(30);
  });
});

describe('the job sheet and the film (§4.3)', () => {
  const made = () => modelOf([line('b1', 29, 30), line('b2', 11), on('b3', 'b1', 90, { die: 'v8-88' })]);
  it('a bend-on step is one hit, timed as a hit', () => {
    const model = made();
    const [product] = jobSheet(model).products;
    const bend = product.steps.find((s) => s.key === 'bend');
    expect(bend.summary).toBe('3 hits on the press brake');
    expect(bend.items.map((i) => i.detail.split(' · ')[0])).toEqual([
      'UP 30° R1.28',
      'UP 90° R1.28',
      'bend 1 on: 30° → 90°',
    ]);
    expect(bend.items[2].seconds).toBeGreaterThan(0);
  });
  it('one scene per step, the bend-on one "Bend 1 on to 90°"; the film’s angles follow `to`', () => {
    const model = made();
    const productId = model.instances[0].productId ?? null;
    const scenes = filmScenes(model, productId || (jobSheet(model).products[0]?.id ?? null));
    const bends = scenes.filter((s) => s.station === 'bend');
    expect(bends).toHaveLength(3);
    expect(bends[2].title).toBe('Bend 1 on to 90°');
    expect(bends[2]).toMatchObject({ again: true, stepKey: 'b3', angles: { b1: 90 }, from: { b1: 30 } });
    const at = (i, p) => filmState(scenes, scenes.indexOf(bends[i]), p).angles.i;
    expect(at(0, 1)).toEqual({ b1: 30, b2: 0 });
    expect(at(1, 1)).toEqual({ b1: 30, b2: 90 });
    expect(at(2, 0)).toEqual({ b1: 30, b2: 90 });
    expect(at(2, 1)).toEqual({ b1: 90, b2: 90 });
  });
});
