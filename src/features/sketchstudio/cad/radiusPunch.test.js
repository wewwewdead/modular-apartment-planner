// Round bends by a radius punch (docs/sketch-studio-round-bend.md §12, RB-2):
// the catalogue (§12.3: the radius punches, the wide 60° dies, the round
// nose's section, the automatic die), the checks (§12.4), "round" meaning
// either way (§12.5), the station's session (§12.6) and the §12.7 acceptance.
import { describe, expect, it } from 'vitest';
import {
  autoHits,
  bendNumbers,
  bendStrokes,
  foldSheet,
  foldedBounds,
  isRoundBend,
  roundTangents,
} from './sheetMetal.js';
import { assessBend, brakeHit, gaugeEdges, nearestLine, sideViewWindow } from './pressBrake.js';
import { brakeCollisions } from './brakeCollisions.js';
import { brakeSessionDefaults, brakeStation, sequenceChecks } from './brakeStation.js';
import { strokeHits } from './jobSheet.js';
import { emptyModel, normalizeModel } from './model.js';
import {
  DIES,
  PUNCHES,
  RADIUS_PUNCHES,
  airBendRadius,
  defaultDie,
  dieSection,
  machineOf,
  nearestRadiusPunch,
  punchSection,
  radiusDieOpening,
  radiusPunchFor,
  stockOf,
  suggestedDie,
} from './shopCatalog.js';

const t = 1.5;
const rect = (width, height, holes) => ({
  type: 'rectangle',
  width,
  height,
  origin: [0, 0],
  ...(holes ? { holes } : {}),
});
const sheet = (bends) => ({
  id: 'sm',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: t,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends,
});
// A radius-punch bend across the 40 wide strip at x: an ordinary one-hit bend whose punch has a round nose (§12.2).
const across = (id, x, extra = {}) => ({
  id,
  a: [x, -1],
  b: [x, 41],
  angle: 90,
  direction: 'up',
  radius: null,
  punch: 'radius-30',
  ...extra,
});
const strip = rect(1000, 40);
const machine = machineOf('brake-50-2000');
const close = (value, expected, digits = 5) => expect(value).toBeCloseTo(expected, digits);
const ringArea = (ring) =>
  ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;

describe('the catalogue (§12.3)', () => {
  it('lists the Amada radius punches R10 … R30 on their holders', () => {
    expect(RADIUS_PUNCHES.map((p) => p.key)).toEqual(['radius-10', 'radius-15', 'radius-20', 'radius-25', 'radius-30']);
    expect(RADIUS_PUNCHES.map((p) => p.height)).toEqual([114.3, 125.1, 135.9, 146.7, 157.4]);
    expect(PUNCHES['radius-30']).toMatchObject({
      name: 'Radius R30',
      round: true,
      angle: null,
      radius: 30,
      width: 60,
      load: 1300,
      holder: { height: 103.5, width: 41 },
    });
    expect(PUNCHES['radius-10'].holder).toEqual({ height: 100, width: 41 });
    // The heights lie on one line: about 2.16 mm per mm of radius.
    for (const p of RADIUS_PUNCHES) expect(Math.abs(p.height - (114.33 + 2.155 * (p.radius - 10)))).toBeLessThan(0.1);
    expect(radiusPunchFor(30)).toBe(PUNCHES['radius-30']);
    expect(radiusPunchFor(40)).toBeNull();
    expect(nearestRadiusPunch(20)).toBe(PUNCHES['radius-20']);
    expect(nearestRadiusPunch(40)).toBe(PUNCHES['radius-30']);
    expect(nearestRadiusPunch(2)).toBe(PUNCHES['radius-10']);
  });
  it('adds the Amada 1-V 60° dies V32 … V100, each as deep as its catalogue drawing', () => {
    const wide = Object.values(DIES).filter((d) => d.angle === 60);
    expect(wide.map((d) => [d.v, d.shoulderRadius, d.width, d.height, d.load])).toEqual([
      [32, 5, 60, 80, 1300],
      [40, 5, 60, 80, 1300],
      [50, 6, 80, 85, 1300],
      [63, 8, 80, 95, 1300],
      [80, 10, 100, 100, 1300],
      [100, 12, 135, 125, 1300],
    ]);
    expect(DIES['v80-60'].name).toBe('V80 60°');
    // The V fits in the die body: 60° at V100 is 86.6 deep, the die 125.
    for (const die of wide) expect(Math.min(...dieSection(die).map((p) => p[1]))).toBe(-die.height);
  });
  it('draws a radius punch as a full round nose on its ruler, then the holder', () => {
    for (const punch of RADIUS_PUNCHES) {
      const ring = punchSection(punch);
      expect(ringArea(ring)).toBeGreaterThan(0);
      expect(Math.min(...ring.map((p) => p[1]))).toBeCloseTo(0, 9);
      expect(Math.max(...ring.map((p) => p[1]))).toBeCloseTo(punch.height, 9);
      // The nose: a half circle of radius R about (0, R), from one side round the bottom to the other.
      const nose = ring.filter(([, z]) => z <= punch.radius + 1e-9);
      expect(nose.length).toBeGreaterThanOrEqual(17);
      for (const [y, z] of nose) expect(Math.hypot(y, z - punch.radius)).toBeCloseTo(punch.radius, 9);
      // The ruler is 2 R wide; it sits in its holder's foot, drawn as the catalogue
      // draws it since BT-2 (brake flip tooling §5.6), the holder 41 wide.
      const shoulder = punch.height - punch.holder.height;
      expect(ring).toContainEqual([punch.holderOutline[0][0], shoulder]);
      expect(ring).toContainEqual([-20.5, punch.height]);
      expect(Math.max(...ring.map(([y]) => Math.abs(y)))).toBe(Math.max(punch.radius, 20.5));
    }
    // The side view is wide enough for the nose and the die.
    expect(sideViewWindow({ punch: 'radius-30', die: 'v80-60' }).y1).toBe(75);
  });
  it('picks the narrowest die with V ≥ 2.2 × (R + t) for a radius punch; any other punch as before', () => {
    expect(RADIUS_PUNCHES.map((p) => defaultDie(t, p).key)).toEqual(['v32-60', 'v40-60', 'v50-60', 'v63-60', 'v80-60']);
    expect(defaultDie(t, 'radius-30').key).toBe('v80-60');
    close(radiusDieOpening(PUNCHES['radius-30'], t), 69.3, 9);
    expect(suggestedDie(t, 'radius-30')).toMatchObject({ fits: true });
    close(suggestedDie(t, 'radius-30').wanted, 69.3, 9);
    // R10 on thin sheet: the 88° V25 is wide enough (2.2 × 10.6 = 23.32).
    expect(defaultDie(0.6, 'radius-10').key).toBe('v25-88');
    // Past the catalogue: the widest, said.
    expect(suggestedDie(20, 'radius-30')).toMatchObject({ die: DIES['v100-60'], fits: false });
    // Ordinary punches pick by thickness, exactly as before.
    for (const thickness of [0.6, 1, 1.5, 2, 3, 6]) {
      for (const punch of [null, 'straight-88', 'gooseneck-88', 'acute-30'])
        expect(defaultDie(thickness, punch)).toBe(defaultDie(thickness));
      expect(suggestedDie(thickness, 'straight-88')).toEqual(suggestedDie(thickness));
    }
    // One hit of the round nose in its die forms the nose's radius.
    expect(airBendRadius(stockOf('spcc'), t, PUNCHES['radius-30'], DIES['v80-60'])).toEqual({
      radius: 30,
      sharp: false,
    });
    expect(bendNumbers({ thickness: t, stock: 'spcc', angle: 90, punch: 'radius-30' })).toMatchObject({
      radius: 30,
      kFactor: 0.5,
      die: 'v80-60',
      punch: 'radius-30',
    });
  });
});

describe('§12.7 acceptance: the strip, two radius-punch bends', () => {
  const fold = foldSheet(sheet([across('b1', 300), across('b2', 700)]), strip);
  it('reads the table: R30, K, allowance, deduction, die, legs, folded size', () => {
    for (const bend of fold.bends) {
      expect(bend.radius).toBe(30);
      expect(bend.steps).toBeUndefined();
      expect(bend.label).toBe('UP 90° R30');
      close(bend.kFactor, 0.5);
      close(bend.allowance, 48.30199);
      close(bend.deduction, 14.69801);
      expect(bend.die).toBe('v80-60');
    }
    close(fold.bends[0].legs.moving, 307.34901);
    close(fold.bends[0].legs.fixed, 414.69801);
    close(fold.bends[1].legs.moving, 307.34901);
    const [min, max] = foldedBounds(fold);
    const size = max.map((v, i) => v - min[i]);
    close(size[0], 414.698, 3);
    close(size[1], 40, 6);
    close(size[2], 307.349, 3);
    expect(fold.warnings).toEqual([]);
  });
  it('makes it in two hits, both clear on the 50 t × 2 m press, either way round', () => {
    expect(bendStrokes(fold.bends)).toHaveLength(2);
    expect(strokeHits(fold)).toBe(2);
    const checks = sequenceChecks({ fold, machine });
    expect(checks.map((c) => [c.label, c.refusals, c.collision])).toEqual([
      ['UP 90° R30', [], null],
      ['UP 90° R30', [], null],
    ]);
    for (const [bendId, angles] of [
      ['b1', { b2: 0 }],
      ['b2', {}],
    ])
      for (const turned of [false, true]) {
        const run = brakeCollisions({ fold, bendId, angles, machine, punch: 'radius-30', die: 'v80-60', turned });
        expect(run.hit).toBeNull();
      }
    const report = assessBend(fold, 'b1', { machine });
    expect(report.readouts.hits).toBeUndefined();
    close(report.readouts.radius, 30);
    close(report.readouts.minLeg, 40 * Math.SQRT2 + 10);
    expect(report.punch.key).toBe('radius-30');
  });
  it('saves and reloads: the same bends fold to the same bounds', () => {
    const model = {
      ...emptyModel(),
      sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile: strip, primitives: [], constrained: false }],
      parts: [
        {
          id: 'p',
          name: 'Strip',
          material: 'SPCC cold-rolled steel',
          features: [sheet([across('b1', 300, { die: 'v80-60' }), across('b2', 700, { die: 'v80-60' })])],
        },
      ],
      instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
    };
    const loaded = normalizeModel(JSON.parse(JSON.stringify(model)));
    const again = foldSheet(loaded.parts[0].features[0], loaded.sketches[0].profile);
    expect(loaded.parts[0].features[0].bends.map((b) => b.punch)).toEqual(['radius-30', 'radius-30']);
    expect(foldedBounds(again)).toEqual(foldedBounds(fold));
  });
});

describe('the checks (§12.4)', () => {
  const big = rect(600, 400);
  // The right edge on the backgauge at L 40 (pressBrake.js gaugeBendLine runs the line 1 mm past the blank).
  const near = (extra = {}) => ({
    id: 'p',
    a: [560, 401],
    b: [560, -1],
    angle: 90,
    direction: 'up',
    radius: null,
    punch: 'radius-30',
    ...extra,
  });
  it('refuses the R30 punch in the V25 die, with the die it needs as the fix (§12.7 item 2)', () => {
    const hit = brakeHit({ feature: sheet([]), profile: strip, bend: across('p', 300, { die: 'v25-88' }), machine });
    expect(hit.refusals).toEqual([
      {
        code: 'radius-die',
        message:
          'The Radius R30 punch with 1.5 mm sheet needs a die at least 69.3 mm wide; the V25 88° die is 25 mm. Use the V80 60° die.',
        fix: { label: 'Use the V80 60° die', session: { die: 'v80-60' } },
      },
    ]);
    // Blunter than the die is no refusal for a round nose; it still is for a straight punch.
    expect(hit.refusals.some((r) => r.code === 'punch-angle')).toBe(false);
    const straight = brakeHit({
      feature: sheet([]),
      profile: strip,
      bend: across('p', 300, { punch: 'straight-88', die: 'v80-60' }),
      machine,
    });
    expect(straight.refusals.map((r) => r.code)).toContain('punch-angle');
  });
  it('warns when the die is so wide that it forms a rounder bend than the punch', () => {
    const hit = brakeHit({
      feature: sheet([]),
      profile: strip,
      bend: across('p', 300, { punch: 'radius-10', die: 'v100-60' }),
      machine,
    });
    expect(hit.refusals).toEqual([]);
    expect(hit.bend.radius).toBe(16);
    expect(hit.warnings).toEqual([
      {
        code: 'radius-die-wide',
        message:
          "The V100 60° die forms about R16 on its own, more than the Radius R10 punch's R10: the bend comes out R16, rounder than the punch. Use the V32 60° die.",
        fix: { label: 'Use the V32 60° die', session: { die: 'v32-60' } },
      },
    ]);
  });
  it('refuses a short leg and offers bump hits; after the fix the same bend passes in 10 hits (§12.7 item 1)', () => {
    const hit = brakeHit({ feature: sheet([]), profile: big, bend: near(), machine, gauge: { distance: 40 } });
    expect(hit.die.key).toBe('v80-60');
    expect(hit.refusals).toEqual([
      {
        code: 'short-leg',
        message:
          'The flange is 40 mm from the punch line in the flat; the V80 60° die needs 66.57 mm to carry it on both shoulders. Cut the blank larger, so the flange is at least 66.57 mm from the punch line, or make it with bump hits: they need only about 27.95 mm.',
        fix: {
          label: 'Make it with bump hits',
          session: { shape: 'round', radius: 30, steps: null, punch: 'straight-88', die: null },
        },
      },
    ]);
    // The fix's session: bump hits at R30, the straight punch, the automatic die and hits.
    const allowance = bendNumbers({ thickness: t, stock: 'spcc', angle: 90, radius: 30 }).allowance;
    const steps = autoHits({ allowance, thickness: t });
    expect(steps).toBe(10);
    expect(Math.ceil(48.30199 / 5)).toBe(10);
    const bumped = brakeHit({
      feature: sheet([]),
      profile: big,
      bend: near({ radius: 30, steps, punch: 'straight-88' }),
      machine,
      gauge: { distance: 40 },
    });
    expect(bumped.refusals).toEqual([]);
    expect(bumped.readouts.hits).toBe(10);
    for (const turned of [false, true])
      expect(
        brakeCollisions({
          fold: bumped.fold,
          bendId: 'p',
          machine,
          punch: 'straight-88',
          die: bumped.die,
          gaugePoint: [600, 200],
          turned,
        }).hit,
      ).toBeNull();
  });
  it('offers no bump fix when bump hits could not carry the leg either', () => {
    const hit = brakeHit({ feature: sheet([]), profile: big, bend: near({ a: [574, 401], b: [574, -1] }), machine });
    const [refusal] = hit.refusals;
    expect(refusal.code).toBe('short-leg');
    expect(refusal.message).toBe(
      'The flange is 26 mm from the punch line in the flat; the V80 60° die needs 66.57 mm to carry it on both shoulders. Cut the blank larger, so the flange is at least 66.57 mm from the punch line.',
    );
    expect(refusal.fix).toBeUndefined();
  });
  it('names the radius punch in the bump-die and radius-needs-hits messages when the catalogue has one', () => {
    const bump = brakeHit({
      feature: sheet([]),
      profile: big,
      bend: near({ a: [300, -1], b: [300, 401], radius: 30, steps: 10, punch: 'straight-88', die: 'v16-88' }),
      machine,
    });
    expect(bump.warnings.find((w) => w.code === 'bump-die').message).toBe(
      'The V16 88° die is 16 mm wide and the hits are 4.83 mm apart: the part already bumped sinks into the die. Use the V8 88° die or fewer hits. Or make it in one hit with the Radius R30 punch.',
    );
    const plain = foldSheet(
      sheet([{ id: 'r', a: [300, -1], b: [300, 401], angle: 90, direction: 'up', radius: 30 }]),
      big,
    );
    expect(plain.warnings.find((w) => w.code === 'radius-needs-hits').message).toBe(
      'Bend 1: one hit in the V10 88° die forms about R1.6, not R30: make it a round bend (several hits), or make it in one hit with the Radius R30 punch.',
    );
  });
});

describe('"round" means either way (§12.5)', () => {
  it('reads a bend as round by its hits or by its punch', () => {
    expect(isRoundBend({ steps: 13, punch: 'straight-88' })).toBe(true);
    expect(isRoundBend({ punch: 'radius-15' })).toBe(true);
    expect(isRoundBend({ punch: 'straight-88' })).toBe(false);
    expect(isRoundBend({ punch: 'no-such-punch' })).toBe(false);
    expect(isRoundBend(null)).toBe(false);
  });
  it("gives a radius-punch bend its zone's tangent lines and the zone's hole rule", () => {
    const fold = foldSheet(sheet([across('b1', 300)]), strip);
    const [bend] = fold.bends;
    const half = bend.allowance / 2;
    expect(roundTangents(bend)).toEqual([
      [bend.intervals[0][0], bend.intervals[0][1], -half],
      [bend.intervals[0][0], bend.intervals[0][1], half],
    ]);
    // A cut-out 26 mm from the line: inside half the zone + 2.5 t (27.90 mm).
    const hole = (x) => ({ type: 'rectangle', origin: [x, 15], width: 4, height: 10 });
    const warned = foldSheet(sheet([across('b1', 300)]), rect(1000, 40, [hole(326)]));
    expect(warned.warnings.map((w) => w.message)).toEqual([
      'Bend 1: a cut-out is 26 mm from the bend line; within 27.9 mm (half the bend zone + 2.5 t) it will distort.',
    ]);
    // 30 mm off is clear (the ordinary 2.5 t + r rule would have said 33.75).
    expect(foldSheet(sheet([across('b1', 300)]), rect(1000, 40, [hole(330)])).warnings).toEqual([]);
  });
});

describe('the station (§12.6)', () => {
  const modelOf = (profile) => ({
    ...emptyModel(),
    sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile, primitives: [], constrained: false }],
    parts: [{ id: 'p', name: 'Strip', material: 'SPCC cold-rolled steel', features: [sheet([])] }],
    instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
  });
  const session = (patch) => ({
    ...brakeSessionDefaults(),
    stage: 'setup',
    key: 'k',
    instanceId: 'i',
    edge: 1,
    distance: 300,
    ...patch,
  });
  it('makes a radius-punch hit an ordinary one-hit bend with that punch and its automatic die', () => {
    const station = brakeStation({ model: modelOf(strip), session: session({ shape: 'round', punch: 'radius-30' }) });
    expect(station.autoSteps).toBeNull();
    expect(station.pending.data[0]).toMatchObject({ radius: null, punch: 'radius-30', angle: 90 });
    expect(station.pending.data[0].steps).toBeUndefined();
    expect(station.pending.die.key).toBe('v80-60');
    expect(station.pending.refusals).toEqual([]);
    expect(station.pending.collision.hit).toBeNull();
    expect(station.pending.bend.label).toBe('UP 90° R30');
    // The punch is the source of truth: a radius punch with the shape left Sharp is the same hit.
    const sharp = brakeStation({ model: modelOf(strip), session: session({ punch: 'radius-30' }) });
    expect(sharp.pending.data).toEqual(station.pending.data);
  });
  it('keeps a bump-hit session as RB-1 made it', () => {
    const station = brakeStation({
      model: modelOf(rect(600, 400)),
      session: session({ shape: 'round', radius: 40 }),
    });
    expect(station.autoSteps).toBe(13);
    expect(station.pending.data[0]).toMatchObject({ radius: 40, steps: 13, punch: 'straight-88' });
  });
});

describe('the flat-blank card on a thin strip (§12.8: the gauge-edge pick)', () => {
  // The card's sizes for a 1000 × 40 blank: dot = (1000 + 2 × 82) / 90, the
  // edge strips ± 1.6 dot (20.7 mm): the two long edges' strips overlap and
  // cover the whole strip and both ends.
  const edges = gaugeEdges([
    [0, 0],
    [1000, 0],
    [1000, 40],
    [0, 40],
  ]);
  const reach = (1.6 * 1164) / 90;
  const lines = edges.map((e) => ({ a: e.a, b: e.b, reach, index: e.index }));
  const pick = (point, prefer = null) => nearestLine(lines, point, prefer)?.index ?? null;
  it('picks the edge nearest the pointer, whichever strip is drawn on top', () => {
    expect(edges.map((e) => [e.a, e.b])).toEqual([
      [
        [0, 0],
        [1000, 0],
      ],
      [
        [1000, 0],
        [1000, 40],
      ],
      [
        [1000, 40],
        [0, 40],
      ],
      [
        [0, 40],
        [0, 0],
      ],
    ]);
    // The long edges, away from the ends.
    expect(pick([500, 3])).toBe(0);
    expect(pick([500, -8])).toBe(0);
    expect(pick([500, 37])).toBe(2);
    expect(pick([500, 50])).toBe(2);
    // The end edges: on them, inside near them, and from just outside the end.
    expect(pick([1000, 20])).toBe(1);
    expect(pick([1000, 35])).toBe(1);
    expect(pick([997, 20])).toBe(1);
    expect(pick([1006, 20])).toBe(1);
    expect(pick([1006, 38])).toBe(1);
    expect(pick([0, 20])).toBe(3);
    expect(pick([-6, 5])).toBe(3);
    // A tie goes to the strip clicked; beyond every reach, nothing.
    expect(pick([500, 20], lines[2])).toBe(2);
    expect(pick([500, 20], lines[0])).toBe(0);
    expect(pick([1030, 20])).toBeNull();
  });
});
