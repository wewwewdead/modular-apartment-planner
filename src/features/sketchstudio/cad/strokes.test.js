// One bend per hinge, one stroke may make several (docs/sketch-studio-shop-
// floor.md §6.1), and the brake's sectional set-up (§6.2), on the cases the
// 2026-11-13 probes found: a notched flange as one stroke, alone and with a
// crease after it; the crease first, then the flange line (refused at the
// brake: no longer in line; two points accepted); split flanges then the
// crease; a comb of three tabs (three bends, one stroke, the old single bend's
// folded size). The §1 face frame passes the brake in the shop's order and is
// refused with the crease first, with advice that names bending the flanges
// first. Old files (a comb stored as one bend) load and fold as before.
import { describe, expect, it } from 'vitest';
import {
  bendNumbers,
  bendStrokes,
  distanceFromLeg,
  foldSheet,
  foldedBounds,
  strokeBends,
  strokeOf,
} from './sheetMetal.js';
import { PENDING_BEND, brakeSessionDefaults, brakeStation, sequenceChecks, startStroke } from './brakeStation.js';
import { brakeHit, strokeInLine } from './pressBrake.js';
import { emptyModel, normalizeModel } from './model.js';
import { machineOf } from './shopCatalog.js';

const feature = (bends = []) => ({
  id: 'f',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: 1.5,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends,
});
const bend = (id, a, b, extra = {}) => ({ id, a, b, angle: 90, direction: 'up', radius: null, ...extra });
// The gang probe: 200 × 300, a 34 mm left strip notched at y 140 … 160.
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
const FLANGE = { a: [30, 0], b: [30, 300], angle: 90, direction: 'up', radius: null };
const CREASE = bend('C', [40, 150], [200, 150], { angle: 12, direction: 'down' });
const asBends = (lines, line, stroke = 's1') =>
  lines.map((l, i) => ({ ...line, ...l, id: `L${i + 1}`, ...(lines.length > 1 ? { stroke } : {}) }));

describe('strokeBends', () => {
  it('splits a notched flange into one bend per tab, one stroke; it folds alone', () => {
    const lines = strokeBends(feature(), NOTCHED, {}, FLANGE);
    expect(lines).toEqual([
      { a: [30, 0.5], b: [30, 139.5] },
      { a: [30, 160.5], b: [30, 299.5] },
    ]);
    const fold = foldSheet(feature(asBends(lines, FLANGE)), NOTCHED);
    expect(fold.pieces).toHaveLength(3);
    expect(bendStrokes(fold.bends).map((s) => s.bendIds)).toEqual([['L1', 'L2']]);
  });
  it('then a crease: it folds (the old one-bend stroke is refused, truthfully)', () => {
    // Before SF-3 the line was one bend of two intervals; the crease after it
    // is refused, naming that bend and the remedy (SF-4: it used to say "Bends
    // 1 and 2 close a loop", which is untrue: hinge by hinge there is no loop).
    expect(() => foldSheet(feature([bend('L', [30, 0], [30, 300]), CREASE]), NOTCHED)).toThrow(
      'Bend 1 bends separate tabs in one record (a file made before strokes): its tabs now hang on different pieces of the sheet, so it cannot fold as one bend. Remove it and make it again at the press brake, where its punch line makes one bend per tab in one stroke.',
    );
    // Alone it folds as before (old files that fold are unchanged).
    expect(foldSheet(feature([bend('L', [30, 0], [30, 300])]), NOTCHED).pieces).toHaveLength(3);
    const fold = foldSheet(feature([...asBends(strokeBends(feature(), NOTCHED, {}, FLANGE), FLANGE), CREASE]), NOTCHED);
    expect(fold.pieces).toHaveLength(4);
    expect(bendStrokes(fold.bends).map((s) => s.bendIds)).toEqual([['L1', 'L2'], ['C']]);
  });
  it('crease first, then the flange line: two bends the brake refuses as one stroke, accepts one at a time', () => {
    const creased = feature([CREASE]);
    const lines = strokeBends(creased, NOTCHED, {}, FLANGE);
    expect(lines).toHaveLength(2);
    const both = brakeHit({
      feature: creased,
      profile: NOTCHED,
      bend: asBends(lines, FLANGE).map((b, i) => ({ ...b, id: i ? `${PENDING_BEND}:2` : PENDING_BEND })),
      machine: machineOf(),
    });
    expect(both.refusals.map((r) => r.code)).toContain('not-in-line');
    expect(both.refusals.find((r) => r.code === 'not-in-line').message).toBe(
      'The sheet is already bent between these flanges, so they are no longer in line. Bend them one at a time: click a piece to bend only it.',
    );
    // By two points, one tab each: accepted.
    for (const line of lines) {
      const one = brakeHit({
        feature: creased,
        profile: NOTCHED,
        bend: { ...FLANGE, ...line, id: PENDING_BEND },
        machine: machineOf(),
      });
      expect(one.refusals.map((r) => r.code)).not.toContain('not-in-line');
    }
  });
  it('split flanges (two points each) then a crease fold, each its own stroke', () => {
    const fold = foldSheet(
      feature([bend('L1', [30, 0], [30, 139]), bend('L2', [30, 161], [30, 300]), CREASE]),
      NOTCHED,
    );
    expect(bendStrokes(fold.bends).map((s) => s.bendIds)).toEqual([['L1'], ['L2'], ['C']]);
  });
  it('a comb of three tabs: three bends, one stroke, the old single bend’s folded size', () => {
    const comb = {
      type: 'polygon',
      points: [
        [0, 0],
        [100, 0],
        [100, 60],
        [80, 60],
        [80, 80],
        [60, 80],
        [60, 60],
        [45, 60],
        [45, 80],
        [25, 80],
        [25, 60],
        [20, 60],
        [20, 80],
        [0, 80],
      ],
    };
    const line = { a: [-1, 65], b: [101, 65], angle: 90, direction: 'up', radius: null };
    const old = foldSheet(feature([{ ...line, id: 'x' }]), comb);
    const lines = strokeBends(feature(), comb, {}, line);
    expect(lines).toHaveLength(3);
    const split = foldSheet(feature(asBends(lines, line)), comb);
    expect(bendStrokes(split.bends)).toHaveLength(1);
    const [a0, a1] = foldedBounds(old),
      [b0, b1] = foldedBounds(split);
    for (let k = 0; k < 3; k++) {
      expect(b0[k]).toBeCloseTo(a0[k], 6);
      expect(b1[k]).toBeCloseTo(a1[k], 6);
    }
  });
  it('a line crossing a window stays one bend (the same piece pair twice)', () => {
    const plate = {
      type: 'rectangle',
      width: 100,
      height: 60,
      origin: [0, 0],
      holes: [{ type: 'rectangle', width: 20, height: 10, origin: [40, 25] }],
    };
    const line = { a: [-1, 30], b: [101, 30], angle: 90, direction: 'up' };
    expect(strokeBends(feature(), plate, {}, line)).toEqual([{ a: line.a, b: line.b }]);
  });
  it('refuses tabs that interleave on the line, and a line with every segment left out', () => {
    // An arch tab (two legs, one top) with a small tab standing between its legs.
    const arch = {
      type: 'polygon',
      points: [
        [0, 0],
        [60, 0],
        [60, 60],
        [40, 60],
        [40, 80],
        [0, 80],
      ],
      holes: [
        {
          type: 'polygon',
          points: [
            [10, 60],
            [15, 60],
            [15, 68],
            [25, 68],
            [25, 60],
            [30, 60],
            [30, 75],
            [10, 75],
          ],
        },
      ],
    };
    expect(() => strokeBends(feature(), arch, {}, { a: [-1, 65], b: [61, 65], angle: 90, direction: 'up' })).toThrow(
      'These tabs interleave on the line: bend them one at a time (two points).',
    );
    expect(() => strokeBends(feature(), NOTCHED, {}, FLANGE, { skip: [0, 1] })).toThrow(
      'Every segment of this line is left out: keep at least one to bend.',
    );
  });
});

describe('bendStrokes', () => {
  it('groups neighbours sharing a stroke id; an id that comes back later is a new stroke', () => {
    const list = [{ id: 'a', stroke: 's' }, { id: 'b', stroke: 's' }, { id: 'c' }, { id: 'd', stroke: 's' }];
    expect(bendStrokes(list).map((s) => [s.id, s.key, s.bendIds, s.start, s.end, s.index])).toEqual([
      ['s', 'a', ['a', 'b'], 0, 1, 0],
      ['c', 'c', ['c'], 2, 2, 1],
      ['s', 'd', ['d'], 3, 3, 2],
    ]);
    expect(strokeOf(list, 'b').bendIds).toEqual(['a', 'b']);
  });
  it('a file keeps the stroke and the etched lines’ bends (CAD_VERSION 1)', () => {
    const model = emptyModel();
    model.parts = [
      {
        id: 'p',
        name: 'P',
        features: [
          {
            ...feature([
              bend('a', [30, 0.5], [30, 139.5], { stroke: 's' }),
              bend('b', [30, 160.5], [30, 299.5], { stroke: 's' }),
            ]),
            marks: [{ id: 'm', a: [30, 0], b: [30, 300], bend: { angle: 90, direction: 'up' } }],
          },
        ],
      },
    ];
    const loaded = normalizeModel(JSON.parse(JSON.stringify(model)));
    expect(loaded.parts[0].features[0].bends.map((b) => b.stroke)).toEqual(['s', 's']);
    expect(loaded.parts[0].features[0].marks[0].bend).toEqual({ angle: 90, direction: 'up' });
  });
});

// The §1 kiosk face frame (the 2026-11-13 probe's layout): 600 × 1400 outside,
// t 1.5 SPCC, 40 mm flanges on four sides, two windows, a 12° crease at 600,
// the side flanges notched where it crosses them.
function faceFrame({ order = 'shop', F = 40 } = {}) {
  const t = 1.5,
    stock = 'spcc',
    W = 600,
    HL = 600,
    HU = 800,
    e = 1;
  const n90 = bendNumbers({ thickness: t, stock, angle: 90 });
  const nc = bendNumbers({ thickness: t, stock, angle: 12 });
  const h = n90.allowance / 2,
    hc = nc.allowance / 2,
    r = n90.radius;
  const c = r + t - h,
    d = distanceFromLeg(F, n90);
  const xL = d,
    xR = d + (W - 2 * c),
    X = xR + d;
  const yB = d,
    yC = yB + HL,
    yT = yC + HU,
    Y = yT + d;
  const nx = hc + e;
  const rect = (x0, y0, x1, y1) => ({
    type: 'polygon',
    points: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  });
  const profile = {
    type: 'polygon',
    points: [
      [xL + h + e, 0],
      [xR - h - e, 0],
      [xR - h - e, yB + h + e],
      [X, yB + h + e],
      [X, yC - nx],
      [xR - h - e, yC - nx],
      [xR - h - e, yC + nx],
      [X, yC + nx],
      [X, yT - h - e],
      [xR - h - e, yT - h - e],
      [xR - h - e, Y],
      [xL + h + e, Y],
      [xL + h + e, yT - h - e],
      [0, yT - h - e],
      [0, yC + nx],
      [xL + h + e, yC + nx],
      [xL + h + e, yC - nx],
      [0, yC - nx],
      [0, yB + h + e],
      [xL + h + e, yB + h + e],
    ],
    holes: [rect(xL + 60, yC + 80, xR - 60, yT - 80), rect(xL + 60, yB + 80, xR - 60, yC - 80)],
  };
  const b = (id, a, bb, extra) => bend(id, a, bb, { punch: 'straight-88', ...extra });
  const crease = b('crease', [xL + h + e + 0.5, yC], [xR - h - e - 0.5, yC], { angle: 12, direction: 'down' });
  const gang = order === 'shop';
  const flanges = [
    b('LL', [xL, yC - nx - 1], [xL, yB + h + e + 1], gang ? { stroke: 'left' } : {}),
    b('LU', [xL, yT - h - e - 1], [xL, yC + nx + 1], gang ? { stroke: 'left' } : {}),
    b('RL', [xR, yB + h + e + 1], [xR, yC - nx - 1], gang ? { stroke: 'right' } : {}),
    b('RU', [xR, yC + nx + 1], [xR, yT - h - e - 1], gang ? { stroke: 'right' } : {}),
    b('B', [xR - h - e - 1, yB], [xL + h + e + 1, yB]),
    b('T', [xL + h + e + 1, yT], [xR - h - e - 1, yT]),
  ];
  return { profile, feature: feature(order === 'shop' ? [...flanges, crease] : [crease, ...flanges]) };
}

describe('the §1 face frame on the 50 t × 2 m press (§6.2 acceptance)', () => {
  it('left flange stroke (two tabs), right, bottom, top, crease: no refusal, no collision', () => {
    const { profile, feature: f } = faceFrame();
    const checks = sequenceChecks({ fold: foldSheet(f, profile), machine: machineOf('brake-50-2000') });
    expect(checks.map((c) => [c.label, c.bendIds.length])).toEqual([
      ['UP 90° R1.6 · 2 flanges', 2],
      ['UP 90° R1.6 · 2 flanges', 2],
      ['UP 90° R1.6', 1],
      ['UP 90° R1.6', 1],
      ['DOWN 12° R1.6', 1],
    ]);
    expect(checks.map((c) => ({ refusals: c.refusals, collision: c.collision }))).toEqual(
      Array.from({ length: 5 }, () => ({ refusals: [], collision: null })),
    );
  });
  it('the crease first: each flange hit alone tips the creased half into the bed, and says bend the flanges first', () => {
    const { profile, feature: f } = faceFrame({ order: 'crease-first' });
    const checks = sequenceChecks({ fold: foldSheet(f, profile), machine: machineOf('brake-50-2000') });
    expect(checks[0].collision).toBe(null);
    for (const check of checks.slice(1, 5)) {
      expect(check.collision).toMatchObject({ tool: 'bed' });
      expect(check.collision.message).toMatch(
        /^Bend [2-5]: the part hits the bed as the ram comes down\. Bend this one before bend 1 \(DOWN 12° R1\.6\): that bend turns part of the sheet down into the bed\. Or flip the sheet \(bend the other way up\)\.$/,
      );
    }
  });
  it('the crease made part-way and bent on first (tight bends §5.2): the culprit named by its first step, as its row reads', () => {
    // culprit reads steps: the crease to 6°, on to 12°, then the flanges; each flange still meets the
    // bed (the crease at 12° then), and the bend to make it before is step 1, "DOWN 6° R1.6" as row 1 reads.
    const { profile, feature: f } = faceFrame({ order: 'crease-first' });
    const [crease, ...flanges] = f.bends;
    const bends = [
      { ...crease, angle: 6 },
      { id: 'crease-on', again: 'crease', angle: 12, punch: 'straight-88' },
      ...flanges,
    ];
    const checks = sequenceChecks({ fold: foldSheet({ ...f, bends }, profile), machine: machineOf('brake-50-2000') });
    expect(checks.map((c) => c.label).slice(0, 2)).toEqual(['DOWN 6° R1.6', 'bend 1 on: 6° → 12°']);
    expect(checks.slice(0, 2).every((c) => !c.collision)).toBe(true);
    for (const check of checks.slice(2, 6)) {
      expect(check.collision).toMatchObject({ tool: 'bed', earlier: 1 });
      expect(check.collision.message).toMatch(
        /^Bend [3-6]: the part hits the bed as the ram comes down\. Bend this one before bend 1 \(DOWN 6° R1\.6\): that bend turns part of the sheet down into the bed\. Or flip the sheet \(bend the other way up\)\.$/,
      );
    }
  });
  it('the crease first and the side flanges as strokes: refused, no longer in line', () => {
    const { profile, feature: f } = faceFrame();
    const creaseFirst = { ...f, bends: [f.bends.at(-1), ...f.bends.slice(0, -1)] };
    const checks = sequenceChecks({ fold: foldSheet(creaseFirst, profile), machine: machineOf() });
    expect(checks[1].refusals.map((r) => r.code)).toEqual(['not-in-line']);
    expect(checks[2].refusals.map((r) => r.code)).toEqual(['not-in-line']);
    const fold = foldSheet(creaseFirst, profile);
    expect(strokeInLine(fold, ['LL', 'LU'], { LL: 0, LU: 0 })).toMatch(/no longer in line/);
    expect(strokeInLine(foldSheet(f, profile), ['LL', 'LU'], { LL: 0, LU: 0, crease: 0 })).toBe(null);
  });
});

// The SF-3 audit's case: 600 × 1400, four 82 mm flanges, a 12° down crease
// bent last. The crease hits the bed (the flanges hang below the 80 mm die);
// "bend this one before bend 2" would put it between bend 2's two tabs, which
// the brake then refuses, so the advice must not say it.
describe('collision advice the brake would take (SF-4, Part A)', () => {
  const panel = async (depth) => {
    const { flangedPanel, presetFace } = await import('./panelMaker.js');
    return flangedPanel({
      face: presetFace('rectangle', { width: 600, height: 1400 }),
      thickness: 1.5,
      stock: 'spcc',
      flanges: [0, 1, 2, 3].map((edge) => ({ edge, depth })),
      creases: [{ a: [0, 600], b: [600, 600], angle: 12, direction: 'down' }],
    });
  };
  it('does not advise an order that breaks a two-tab stroke out of line', async () => {
    const result = await panel(82);
    const checks = sequenceChecks({ fold: result.fold, machine: machineOf('brake-50-2000') });
    const last = checks.at(-1);
    expect(last.collision).toMatchObject({ tool: 'bed' });
    expect(last.collision.earlier).toBeUndefined();
    expect(last.collision.message).toBe(
      "Bend 5: the part hits the bed as the ram comes down. Bending it before bend 2 would leave bend 2's 2 flanges out of line. Make the flanges that hang below the die shallower (the V10 88° die stands 80 mm above the bed), bend bend 2's flanges one at a time, or flip the sheet (bend the other way up).",
    );
    // What the old advice led to: the crease moved before bend 2, which the brake then refuses.
    const bends = result.feature.bends;
    const first = bendStrokes(bends)[0].bendIds.length;
    const moved = [...bends.slice(0, first), bends.at(-1), ...bends.slice(first, -1)];
    const followed = sequenceChecks({
      fold: foldSheet({ ...result.feature, bends: moved }, result.profile),
      machine: machineOf(),
    });
    expect(followed[2].refusals.map((r) => r.code)).toEqual(['not-in-line']);
    // The advice that works: a flange the die clears (81 mm) and the same order passes.
    expect((await panel(81)).report.problems).toEqual([]);
  });
});

describe('the brake station with a stroke', () => {
  it('a pending hit is a list of bends; the pedal commits them with one stroke id', () => {
    const model = emptyModel();
    model.sketches = [{ id: 's', name: 'S', plane: 'XY', profile: NOTCHED, primitives: [], constrained: false }];
    model.parts = [{ id: 'p', name: 'P', features: [feature()] }];
    model.instances = [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }];
    const session = {
      ...brakeSessionDefaults(),
      stage: 'setup',
      key: 'k',
      instanceId: 'i',
      mode: 'points',
      points: [FLANGE.a, FLANGE.b],
    };
    const station = brakeStation({ model, session });
    expect(station.pending.bendIds).toEqual([PENDING_BEND, `${PENDING_BEND}:2`]);
    expect(station.segments.map((s) => [s.index, s.skipped])).toEqual([
      [0, false],
      [1, false],
    ]);
    expect(station.pending.readouts.length).toBeCloseTo(280, 6);
    expect(station.view.bendIds).toEqual(station.pending.bendIds);
    let n = 0;
    const stroke = startStroke({ station, token: 't', newId: () => `b${++n}`, strokeId: 'S' });
    expect(stroke.bends.map((b) => [b.id, b.stroke])).toEqual([
      ['b1', 'S'],
      ['b2', 'S'],
    ]);
    expect(stroke.run.bendIds).toEqual(['b1', 'b2']);
    // Left out: one bend, no stroke id.
    const skipped = brakeStation({ model, session: { ...session, skip: [1] } });
    expect(skipped.pending.bendIds).toEqual([PENDING_BEND]);
    expect(skipped.segments[1].skipped).toBe(true);
    // The tooling stands over the one tab: one run, shorter than the line.
    expect(skipped.pending.collision.hit).toBe(null);
  });
});

describe('the control box front wall (§6.2)', () => {
  it('is one gauge pick with the two flange ends clicked off: no typed points', async () => {
    const { CONTROL_BOX, controlBoxBody, sheetMetalControlBox } = await import('./shopExamples.js');
    const { gaugeBendLine, gaugeEdges } = await import('./pressBrake.js');
    const { lineSegments, profilePolygon } = await import('./sheetMetal.js');
    const example = sheetMetalControlBox();
    const body = example.parts.find((p) => p.id === 'shop-box-body').features[0];
    const { profile, layout } = controlBoxBody(CONTROL_BOX);
    const polygon = profilePolygon(profile);
    // The front edge (y 0) on the backgauge, L = the flange's flat distance.
    const edge = gaugeEdges(polygon.outer).find((e) => Math.abs(e.a[1]) < 1e-6 && Math.abs(e.b[1]) < 1e-6);
    const line = gaugeBendLine(polygon.outer, edge, layout.d);
    // The line crosses the left flange, the front wall and the right flange.
    expect(lineSegments(polygon, line)).toHaveLength(3);
    const sides = { ...body, bends: body.bends.slice(0, 2) };
    const hit = { ...line, angle: 90, direction: 'up', radius: null, punch: 'straight-88', die: 'v8-88' };
    const [front] = strokeBends(sides, profile, {}, hit, { skip: [0, 2] });
    const ours = foldSheet({ ...sides, bends: [...sides.bends, { ...hit, ...front, id: 'front' }] }, profile);
    const theirs = foldSheet({ ...sides, bends: body.bends.slice(0, 3) }, profile);
    const [a0, a1] = foldedBounds(ours),
      [b0, b1] = foldedBounds(theirs);
    for (let k = 0; k < 3; k++) {
      expect(a0[k]).toBeCloseTo(b0[k], 6);
      expect(a1[k]).toBeCloseTo(b1[k], 6);
    }
  });
});

describe('the job sheet and the route count strokes (§6.1)', () => {
  it('one stroke of two tabs is one hit, timed once', async () => {
    const { jobSheet } = await import('./jobSheet.js');
    const { routeProgress } = await import('./shopRoute.js');
    const model = emptyModel();
    model.sketches = [{ id: 's', name: 'S', plane: 'XY', profile: NOTCHED, primitives: [], constrained: false }];
    model.parts = [
      {
        id: 'p',
        name: 'Frame',
        features: [
          feature(
            asBends(strokeBends(feature(), NOTCHED, {}, FLANGE), { ...FLANGE, punch: 'straight-88', die: 'v10-88' }),
          ),
        ],
      },
    ];
    model.instances = [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }];
    const [product] = jobSheet(model).products;
    const bend = product.steps.find((s) => s.key === 'bend');
    expect(bend.summary).toBe('1 hit on the press brake');
    expect(bend.items).toHaveLength(1);
    expect(bend.items[0].detail).toMatch(/^UP 90° R1\.6 · 2 flanges · Straight 88° punch, V10 88° die/);
    expect(routeProgress(model, 'i').bend).toEqual({ status: 'done', text: '1 hit' });
  });
});
