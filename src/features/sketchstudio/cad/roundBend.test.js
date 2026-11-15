// Round bends by bump bending (docs/sketch-studio-round-bend.md, RB-1): the
// record (`steps`), the hit numbers (§5.1), the part-way pose as N mini-bends
// filled from one side (§5.2, measured on sampled points), the hit in the
// machine (§5.3), the per-hit checks (§5.4), the collision walk (§5.5) and the
// §8 acceptance table.
import { describe, expect, it } from 'vitest';
import {
  autoHits,
  bendArcPoint,
  bendStrokes,
  blankHoles,
  bendLabel,
  bendNumbers,
  bendTransform,
  bumpHits,
  foldSheet,
  foldedBounds,
  poseFold,
  transformPoint,
  zoneSamples,
} from './sheetMetal.js';
import {
  BUMP_GAP,
  STROKE_GAP,
  backSide,
  brakeFrame,
  brakeHit,
  bumpTimeline,
  machineFrom,
  sheetSection,
  strokeAt,
  strokeTimeline,
} from './pressBrake.js';
import { brakeCollisions } from './brakeCollisions.js';
import { PRINT_DEFAULTS, bendZoneHits, createPrint } from './printStation.js';
import { BEND_HANDLING_S, BUMP_HANDLING_S, jobProducts, jobSheet, strokeSeconds } from './jobSheet.js';
import { routeProgress } from './shopRoute.js';
import { BEND_TABLE_WIDTH, bendLinesSvg, bendTableSvg } from './bendTable.js';
import { profileSvg } from './drawings.js';
import { drawingDxf } from './exports.js';
import { FILM_PACE, filmScenes } from './shopFilm.js';
import { sequenceChecks } from './brakeStation.js';
import { emptyModel, normalizeModel } from './model.js';
import { dieOf, machineOf, minLeg, ramDepth, springback, stockOf, tonnage } from './shopCatalog.js';

const t = 1.5;
const R = 40;
const rect = (width, height, holes) => ({
  type: 'rectangle',
  width,
  height,
  origin: [0, 0],
  ...(holes ? { holes } : {}),
});
// The brake's line off the right edge at L 300 (pressBrake.js gaugeBendLine runs it 1 mm past the blank).
const round = (extra = {}) => ({
  id: 'r',
  a: [300, -1],
  b: [300, 401],
  angle: 90,
  direction: 'up',
  radius: R,
  steps: 13,
  punch: 'straight-88',
  ...extra,
});
const sheet = (bends, extra = {}) => ({
  id: 'sm',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: t,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends,
  ...extra,
});
const profile = rect(600, 400);
const foldOf = (bend = round(), outline = profile) => foldSheet(sheet([bend]), outline);
const machine = machineOf('brake-50-2000');
const close = (value, expected, digits = 5) => expect(value).toBeCloseTo(expected, digits);
const deg = Math.PI / 180;
const BA = (Math.PI / 2) * (R + 0.5 * t);

// ---------------------------------------------------------------- sampled-point helpers
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a) => Math.hypot(...a);
const unit3 = (a) => a.map((v) => v / len3(a));
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const angleBetween = (a, b) => {
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len3(a) * len3(b));
  return Math.acos(Math.max(-1, Math.min(1, c)));
};
// The circumradius of three points.
const circumradius = (p, q, r) => {
  const a = len3(sub3(q, r)),
    b = len3(sub3(p, r)),
    c = len3(sub3(p, q));
  const area = len3(cross3(sub3(q, p), sub3(r, p))) / 2;
  return (a * b * c) / (4 * area);
};
// A posed fold's zone point (bend 'r') in the part frame.
const pointOf = (posed, fraction, z, s = 200) => {
  const bend = posed.bends[0];
  return transformPoint(bend.fixedMatrix, bendArcPoint(bend, t, bend.transform, s, fraction, z));
};
const pose = (fold, angle, from = 'fixed') => poseFold(fold, { r: angle }, { r: from });

describe('the round bend record (§4, §5.1)', () => {
  it('reads the §8 numbers: K, allowance, deduction, legs, folded size', () => {
    const fold = foldOf();
    const bend = fold.bends[0];
    close(bend.kFactor, 0.5);
    close(bend.allowance, 64.00995);
    close(bend.deduction, 18.99005);
    close(bend.legs.fixed, 309.49502);
    close(bend.legs.moving, 309.49502);
    const [min, max] = foldedBounds(fold);
    const size = max.map((v, i) => v - min[i]);
    expect(size[0]).toBeCloseTo(309.495, 3);
    expect(size[1]).toBeCloseTo(400, 6);
    expect(size[2]).toBeCloseTo(309.495, 3);
    expect(bend.die).toBe('v10-88');
  });
  it('carries the hits on the fold and in the label', () => {
    const bend = foldOf().bends[0];
    expect(bend.steps).toBe(13);
    close(bend.stepAngle, 6.92308);
    close(bend.pitch, 4.92384);
    close(bend.flat, 0.07571);
    expect(bend.label).toBe('UP 90° R40 · 13 hits');
    expect(bendLabel({ direction: 'up', angle: 90, radius: 1.6 })).toBe('UP 90° R1.6');
    // An ordinary bend carries none of them.
    const plain = foldOf(round({ steps: undefined, radius: null })).bends[0];
    for (const key of ['steps', 'stepAngle', 'pitch', 'flat']) expect(plain).not.toHaveProperty(key);
  });
  it('gives the hit lines and the automatic count (pitch = half the die opening)', () => {
    const hits = bumpHits(foldOf().bends[0], t);
    expect(hits.steps).toBe(13);
    close(hits.stepAngle, 90 / 13);
    close(hits.pitch, BA / 13);
    close(hits.flat, (R + t) * (1 - Math.cos((90 / 13 / 2) * deg)));
    expect(hits.lines).toHaveLength(13);
    close(hits.lines[0], -BA / 2 + BA / 26);
    close(hits.lines[12], BA / 2 - BA / 26);
    expect(autoHits({ allowance: BA, thickness: t })).toBe(13);
    expect(autoHits({ allowance: BA, die: 'v20-88', thickness: t })).toBe(7);
    // Never fewer than two.
    expect(autoHits({ allowance: 3, thickness: t })).toBe(2);
    expect(bumpHits({ angle: 90, allowance: 3, radius: 1.6 }, t)).toBeNull();
  });
  it('reproduces the other §8 cases: R15, R10 and R40 at 180°', () => {
    const at = (radius, angle) => {
      const numbers = bendNumbers({ thickness: t, stock: 'spcc', angle, radius });
      const steps = autoHits({ allowance: numbers.allowance, die: numbers.die, thickness: t });
      return { numbers, steps, ...bumpHits({ ...numbers, angle, steps }, t) };
    };
    const r15 = at(15, 90);
    expect(r15.steps).toBe(5);
    close(r15.stepAngle, 18);
    close(r15.pitch, 4.94801);
    close(r15.flat, 0.20314);
    const r10 = at(10, 90);
    expect(r10.steps).toBe(4);
    close(r10.stepAngle, 22.5);
    const r180 = at(40, 180);
    expect(r180.steps).toBe(26);
    close(r180.numbers.allowance, 128.0199, 4);
  });
  it('refuses a bad round bend by name', () => {
    const problem = (bend) => {
      try {
        foldSheet(sheet([round(), { ...round(), id: 'x', a: [100, -1], b: [100, 401], ...bend }]), profile);
        return '';
      } catch (error) {
        return error.message;
      }
    };
    expect(problem({ steps: 1 })).toBe('Bend 2: a round bend is made in a whole number of hits from 2 to 200.');
    expect(problem({ steps: 2.5 })).toMatch(/^Bend 2: a round bend is made in a whole number of hits/);
    expect(problem({ steps: 201 })).toMatch(/^Bend 2: a round bend is made in a whole number of hits/);
    expect(problem({ radius: null, steps: 4 })).toBe('Bend 2: a round bend needs its inside radius.');
    expect(problem({ radius: 1.6, steps: 4 })).toBe(
      'Bend 2: R1.6 is what one hit in the V10 88° die makes: make it an ordinary bend.',
    );
    expect(problem({ radius: 10, steps: 30 })).toBe('Bend 2: 30 hits would stand 0.56 mm apart: use fewer hits.');
    // The first bend crosses nothing and passes: the problem is the second's.
    expect(problem({ radius: 10, steps: 4 })).toBe('');
  });
  it('warns an ordinary bend whose radius is three times what its tooling forms', () => {
    const warned = foldOf(round({ steps: undefined })).warnings.filter((w) => w.code === 'radius-needs-hits');
    expect(warned.map((w) => w.message)).toEqual([
      'Bend 1: one hit in the V10 88° die forms about R1.6, not R40: make it a round bend (several hits).',
    ]);
    // Not below three times (R4.7 < 3 × 1.6), never on a round bend.
    expect(foldOf(round({ steps: undefined, radius: 4.7 })).warnings.map((w) => w.code)).not.toContain(
      'radius-needs-hits',
    );
    expect(foldOf().warnings.map((w) => w.code)).not.toContain('radius-needs-hits');
  });
  it('survives a save and a reload: the same bend, the same folded bounds', () => {
    const model = {
      ...emptyModel(),
      sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile, primitives: [], constrained: false }],
      parts: [{ id: 'p', name: 'Kiosk side', features: [sheet([round({ die: 'v10-88' })])] }],
      instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
    };
    const loaded = normalizeModel(JSON.parse(JSON.stringify(model)));
    const feature = loaded.parts[0].features[0];
    expect(feature.bends[0].steps).toBe(13);
    const before = foldedBounds(foldSheet(model.parts[0].features[0], profile));
    const after = foldedBounds(foldSheet(feature, loaded.sketches[0].profile));
    after.forEach((corner, i) => corner.forEach((v, k) => close(v, before[i][k], 9)));
  });
});

describe('the part-way pose (§5.2, sampled points)', () => {
  const fold = foldOf();
  const bend = fold.bends[0];
  const a = 90 / 13;
  const inner = t; // an up bend's inside face
  const neutralZ = t - bend.kFactor * t;
  const length = (posed, samples = 4000) => {
    let total = 0,
      previous = null;
    for (let i = 0; i <= samples; i++) {
      const p = pointOf(posed, i / samples, neutralZ);
      if (previous) total += len3(sub3(p, previous));
      previous = p;
    }
    return total;
  };
  const tangent = (posed, f, side) => {
    const d = 1e-6;
    return side < 0
      ? sub3(pointOf(posed, f, inner), pointOf(posed, f - d, inner))
      : sub3(pointOf(posed, f + d, inner), pointOf(posed, f, inner));
  };
  it('keeps the neutral fibre BA long at every pose', () => {
    for (const from of ['fixed', 'moving'])
      for (const angle of [0, 1.3, a, 2.5 * a, 45, 6 * a + 0.01, 89.99, 90])
        expect(Math.abs(length(pose(fold, angle, from)) - bend.allowance)).toBeLessThan(1e-4);
  });
  it('is continuous in position and tangent across every hit boundary', () => {
    for (const angle of [a / 2, 3.4 * a, 9 * a, 90]) {
      const posed = pose(fold, angle);
      for (let i = 1; i < 13; i++) {
        const f = i / 13;
        expect(len3(sub3(pointOf(posed, f - 1e-12, inner), pointOf(posed, f, inner)))).toBeLessThan(1e-6);
        expect(angleBetween(tangent(posed, f, -1), tangent(posed, f, 1))).toBeLessThan(1e-4);
      }
    }
  });
  it('after k whole hits: the first k sub-zones on a circle of radius R, the rest straight', () => {
    for (const k of [1, 4, 9]) {
      const posed = pose(fold, k * a);
      const curve = (u) => pointOf(posed, (u * k) / 13, inner);
      for (const [p, q, r] of [
        [0, 0.5, 1],
        [0.1, 0.35, 0.9],
        [0.02, 0.6, 0.97],
      ])
        expect(circumradius(curve(p), curve(q), curve(r))).toBeCloseTo(R, 5);
      const rest = (u) => pointOf(posed, k / 13 + (u * (13 - k)) / 13, inner);
      const [p, q, r] = [rest(0), rest(0.4), rest(1)];
      expect(len3(cross3(unit3(sub3(q, p)), unit3(sub3(r, p))))).toBeLessThan(1e-9);
      // The flat still to come runs on with the moving side: straight on into the next piece.
      const beyond = pointOf(posed, 1, inner);
      expect(len3(cross3(unit3(sub3(beyond, p)), unit3(sub3(r, p))))).toBeLessThan(1e-9);
      expect(posed.bends[0].posedAngle).toBeCloseTo(k * a, 12);
    }
  });
  it("from 'moving' is the mirror image", () => {
    for (const angle of [2 * a, 5.5 * a, 11 * a]) {
      const fixed = pose(fold, angle, 'fixed'),
        moving = pose(fold, angle, 'moving');
      const turnOf = (posed, f) =>
        angleBetween(tangent(posed, Math.max(f, 1e-5), 1), tangent(posed, 1e-5, 1)) -
        angleBetween(tangent(posed, 1e-5, 1), tangent(posed, 1e-5, 1));
      for (const f of [0.05, 0.2, 0.31, 0.5, 0.77, 0.95]) {
        const mirrored = angle * deg - turnOf(fixed, 1 - f);
        expect(turnOf(moving, f)).toBeCloseTo(mirrored, 4);
      }
      expect(moving.bends[0].posedAngle).toBeCloseTo(angle, 12);
    }
  });
  it('gives today’s transform at the full angle, field for field', () => {
    const plain = { ...bend };
    delete plain.steps;
    const today = bendTransform(plain, t, 90);
    for (const from of ['fixed', 'moving']) {
      const full = bendTransform(bend, t, 90, from);
      for (const key of ['matrix', 'translate', 'origin', 'axis'])
        full[key].forEach((v, i) => close(v, today[key][i], 9));
      close(full.angle, today.angle, 9);
      close(full.radius, today.radius, 9);
    }
    // The unposed fold is that pose, and it is continuous into it.
    fold.bends[0].transform.matrix.forEach((v, i) => close(v, today.matrix[i], 9));
    bendTransform(bend, t, 90 - 1e-7).matrix.forEach((v, i) => close(v, today.matrix[i], 5));
  });
  // The first frames of a hit's bend (BQ-1: verify-round-bend-rb2 died once on
  // "object null is not iterable" at "hit 3 of 10"): a hit a hair past its
  // start — under zoneTransform's radian threshold, over a degree one — poses.
  it('poses a hit a hair past its start (1e-9° … 6e-8°) without losing the hit being formed', () => {
    const a = 90 / 13;
    for (const from of ['fixed', 'moving'])
      for (const k of [2, 7, 12])
        for (const delta of [2e-9, 2e-8, 5e-8]) {
          const posed = bendTransform(bend, t, k * a + delta, from);
          const before = bendTransform(bend, t, k * a, from);
          expect(posed.origin).not.toBe(null);
          posed.matrix.forEach((v, i) => close(v, before.matrix[i], 6));
        }
  });
  it('samples every sub-zone boundary in the preview and the collision strips', () => {
    expect(zoneSamples(bend, 16) % 13).toBe(0);
    expect(zoneSamples(bend, 8) % 13).toBe(0);
    expect(zoneSamples({ steps: 4 }, 16)).toBe(16);
    expect(zoneSamples({}, 16)).toBe(16);
  });
});

describe('the hit in the machine (§5.3)', () => {
  const fold = foldOf();
  const gaugePoint = [600, 200];
  const bend = fold.bends[0];
  it('bumps from the side away from the backgauge', () => {
    const back = backSide(bend, { gaugePoint });
    const gaugeSide =
      (gaugePoint[0] - bend.a[0]) * bend.n[0] + (gaugePoint[1] - bend.a[1]) * bend.n[1] < 0 ? 'fixed' : 'moving';
    expect(back).toBe(gaugeSide);
    expect(machineFrom(fold, ['r'], { gaugePoint })).toEqual({ r: back === 'fixed' ? 'moving' : 'fixed' });
    expect(backSide(bend, { gaugePoint, turned: true })).not.toBe(back);
    expect(machineFrom(foldOf(round({ steps: undefined, radius: null })), ['r'], { gaugePoint })).toEqual({});
  });
  it('puts the hit line over the V and steps it toward the backgauge', () => {
    const from = machineFrom(fold, ['r'], { gaugePoint });
    const hits = bumpHits(bend, t);
    const s = Math.abs(200 - bend.a[1]);
    for (const hit of [1, 5, 13]) {
      const angle = (hit - 1) * hits.stepAngle;
      const posed = poseFold(fold, { r: angle }, from);
      const frame = brakeFrame(posed, 'r', { die: 'v10-88', gaugePoint, hit });
      expect(frame.hit).toBe(hit);
      expect(frame.hits).toBe(13);
      // The hit still flat on the die: its line (outer face) on the V centre, the punch tip a sheet above.
      const index = from.r === 'fixed' ? hit : 14 - hit;
      const at = transformPoint(frame.matrix, pointOf(posed, (index - 0.5) / 13, 0, s));
      close(at[1], 0, 6);
      close(at[2], 0, 6);
      close(frame.tipZ, t, 9);
      // The flat still to come lies on the die top, toward the backgauge (+Y).
      const backBend = posed.bends[0];
      const [piece, v] =
        from.r === 'fixed'
          ? [posed.pieces.find((p) => p.id === backBend.movingPieces[0]), BA / 2 + 10]
          : [posed.pieces.find((p) => p.id === backBend.fixedPiece), -BA / 2 - 10];
      const flat = [bend.a[0] + bend.u[0] * s + bend.n[0] * v, bend.a[1] + bend.u[1] * s + bend.n[1] * v, 0];
      const back = transformPoint(frame.matrix, transformPoint(piece.matrix, flat));
      close(back[2], 0, 6);
      expect(back[1]).toBeGreaterThan(0);
    }
    // Part-way through a hit: its own frame by default, both wings symmetric, the tip on the inside.
    const posed = poseFold(fold, { r: 4.5 * hits.stepAngle }, from);
    const frame = brakeFrame(posed, 'r', { die: 'v10-88', gaugePoint });
    expect(frame.hit).toBe(5);
    expect(frame.tipZ).toBeLessThan(t);
  });
  it('sits the finished bend with its last hit in the die', () => {
    const from = machineFrom(fold, ['r'], { gaugePoint });
    const frame = brakeFrame(poseFold(fold, null, from), 'r', { die: 'v10-88', gaugePoint });
    expect(frame.hit).toBe(13);
  });
});

describe('the checks per hit (§5.4)', () => {
  const pending = (bend = round(), outline = profile, gauge = { distance: 300 }) =>
    brakeHit({ feature: sheet([]), profile: outline, bend: { ...bend, id: 'hit' }, machine, gauge });
  it('reads the §8 machine numbers', () => {
    const result = pending();
    expect(result.refusals).toEqual([]);
    const r = result.readouts;
    expect(r.hits).toBe(13);
    close(r.stepAngle, 6.92308);
    close(r.pitch, 4.92384);
    close(r.flat, 0.07571);
    // L + BA/2 − (j − ½)·p. The spec's §8 table reads 329.54303 → 270.45697:
    // 300 + 32.004975 − 2.461921 = 329.543054, so its fifth decimal is off by 2.
    close(r.gaugeFirst, 329.54305);
    close(r.gaugeLast, 270.45695);
    close(r.tonnage, 42.174, 3);
    close(r.minLeg, 6.20914);
    close(r.ramDepth, 0.26072);
    close(r.bendTo, 7.14065);
    // The springback is the whole bend's (display only).
    close(r.springback, springback(stockOf('spcc'), 90, R, t), 9);
    const v10 = dieOf('v10-88');
    close(r.minLeg, minLeg(v10, 90 / 13), 9);
    close(r.tonnage, tonnage(stockOf('spcc'), t, 400, v10), 9);
    close(
      r.ramDepth,
      ramDepth({
        v: 10,
        thickness: t,
        radius: R,
        angle: 90 / 13,
        springback: r.springback / 13,
        shoulderRadius: v10.shoulderRadius,
        dieAngle: v10.angle,
      }),
      9,
    );
    // An ordinary hit's readouts are as before.
    const plain = pending(round({ steps: undefined, radius: null })).readouts;
    for (const key of ['hits', 'stepAngle', 'pitch', 'flat', 'gaugeFirst', 'gaugeLast'])
      expect(plain).not.toHaveProperty(key);
  });
  it('applies the die angle to one hit: a 180° round bend is allowed by the die', () => {
    const result = pending(round({ angle: 180, steps: 26 }));
    expect(result.refusals.map((r) => r.code)).not.toContain('angle');
  });
  it('is not refused for short legs with eighteen hits (pitch 3.56)', () => {
    const result = pending(round({ steps: 18 }));
    close(result.readouts.pitch, BA / 18);
    expect(result.refusals.map((r) => r.code)).not.toContain('short-leg');
    expect(result.fold.warnings.map((w) => w.code)).not.toContain('short-leg');
  });
  it('measures a leg from the outermost hit on its side', () => {
    // 3 mm of straight sheet beside the zone + half a pitch < the V10 minimum at 6.92°.
    const narrow = rect(BA + 6, 100);
    const line = { a: [BA / 2 + 3, -1], b: [BA / 2 + 3, 101] };
    const result = pending(round({ ...line }), narrow, null);
    const shortLegs = result.refusals.filter((r) => r.code === 'short-leg');
    expect(shortLegs).toHaveLength(2);
    expect(shortLegs[0].message).toMatch(
      /^The flange is 5.46 mm from the outermost hit in the flat; the V10 88° die needs 6.21 mm/,
    );
    // The same rule words the fold's warning.
    expect(result.fold.warnings.filter((w) => w.code === 'short-leg').map((w) => w.message)).toContain(
      'Bend 1: the flange leg is 5.46 mm from the outermost hit in the flat; the V10 88° die needs at least 6.21 mm to sit on both shoulders.',
    );
  });
  it('names the hit the backgauge cannot reach', () => {
    const result = pending(round(), profile, { distance: 590 });
    const refusal = result.refusals.find((r) => r.code === 'backgauge');
    expect(refusal.message).toBe(
      'The backgauge reaches 5–600 mm from the punch line; the first hit gauges at L 619.54 mm, out of its reach. Gauge from the opposite edge or set the line with two points.',
    );
    const near = pending(round(), profile, { distance: 30 }).refusals.find((r) => r.code === 'backgauge');
    expect(near.message).toMatch(/the last hit gauges at L 0.46 mm, out of its reach/);
  });
  it('warns a die more than 2.5 pitches wide, with the narrower die as the fix', () => {
    const result = pending(round({ die: 'v16-88' }));
    const warning = result.warnings.find((w) => w.code === 'bump-die');
    expect(warning.message).toBe(
      'The V16 88° die is 16 mm wide and the hits are 4.92 mm apart: the part already bumped sinks into the die. Use the V8 88° die or fewer hits.',
    );
    expect(warning.fix).toEqual({ label: 'Use the V8 88° die', session: { die: 'v8-88' } });
    expect(pending().warnings.map((w) => w.code)).not.toContain('bump-die');
  });
  it('flags a cut-out within half the zone plus 2.5 t of the bend line', () => {
    const hole = { type: 'circle', center: [300 + BA / 2 + 3, 200], radius: 2 };
    const near = foldOf(round(), rect(600, 400, [hole])).warnings.filter((w) => w.code === 'hole-near-bend');
    expect(near).toHaveLength(1);
    expect(near[0].message).toMatch(/within 35.75 mm \(half the bend zone \+ 2.5 t\) it will distort/);
    const far = { ...hole, center: [300 + BA / 2 + 8, 200] };
    expect(foldOf(round(), rect(600, 400, [far])).warnings.map((w) => w.code)).not.toContain('hole-near-bend');
  });
});

describe('the bump stroke (§6)', () => {
  it('cycles the ram once per hit, lifting BUMP_GAP between hits', () => {
    const one = strokeTimeline(machine, 0.26072);
    const bump = bumpTimeline(machine, 0.26072, 13);
    expect(bump.steps).toBe(13);
    expect(bump.hits).toHaveLength(13);
    expect(bump.hits[0].gap).toBe(STROKE_GAP);
    expect(bump.hits[1].gap).toBe(BUMP_GAP);
    expect(bump.total).toBeGreaterThan(7000);
    expect(bump.total).toBeLessThan(10000);
    expect(bump.total).toBeGreaterThan(one.total);
    const target = 90;
    const seen = [];
    for (let ms = 0; ms <= bump.total + 10; ms += 5) {
      const at = strokeAt(bump, ms, target);
      if (!seen.length || seen.at(-1).hit !== at.hit || seen.at(-1).phase !== at.phase) seen.push(at);
      expect(at.angle).toBeGreaterThanOrEqual(((at.hit - 1) * target) / 13 - 1e-9);
      expect(at.angle).toBeLessThanOrEqual((at.hit * target) / 13 + 1e-9);
    }
    expect(seen.map((s) => `${s.hit}${s.phase[0]}`).join(' ')).toBe(
      [...Array(13).keys()].map((k) => `${k + 1}a ${k + 1}b ${k + 1}r`).join(' ') + ' 13d',
    );
    expect(strokeAt(bump, bump.total + 1, target)).toMatchObject({ phase: 'done', angle: 90, done: true, hit: 13 });
  });
});

describe('the side view of a round bend', () => {
  it('draws the formed curve, the hit in the die and the flat still to come', () => {
    const fold = foldOf();
    const gaugePoint = [600, 200];
    const from = machineFrom(fold, ['r'], { gaugePoint });
    const posed = poseFold(fold, { r: 4.5 * (90 / 13) }, from);
    const frame = brakeFrame(posed, 'r', { die: 'v10-88', gaugePoint });
    const section = sheetSection(posed, 'r', frame);
    // The sheet's outer face rests on the die top near the V, its two wings run off either way.
    expect(section.wings.back.direction[0]).toBeGreaterThan(0);
    expect(section.wings.front.direction[0]).toBeLessThan(0);
    // The flat still to come (at the back) is straight, its wing tilted by half the hit's angle only.
    expect(Math.abs(Math.atan2(section.wings.back.direction[1], section.wings.back.direction[0]))).toBeLessThan(
      (90 / 13 / 2) * deg + 1e-6,
    );
    // The front wing has turned through the hits already made.
    expect(Math.atan2(section.wings.front.direction[1], -section.wings.front.direction[0])).toBeGreaterThan(
      4 * (90 / 13) * deg,
    );
    expect(section.outline.length).toBeGreaterThan(40);
    expect(section.angle).toBeCloseTo(4.5 * (90 / 13), 9);
  });
});

describe('collisions, hit by hit (§5.5)', () => {
  it('clears the R40 bend through all 13 hits, either way round (sequenceChecks)', () => {
    const fold = foldOf(round({ die: 'v10-88' }));
    const checks = sequenceChecks({ fold, machine });
    expect(checks).toHaveLength(1);
    expect(checks[0].label).toBe('UP 90° R40 · 13 hits');
    expect(checks[0].refusals).toEqual([]);
    expect(checks[0].collision).toBeNull();
    for (const turned of [false, true]) {
      const result = brakeCollisions({ fold, bendId: 'r', machine, punch: 'straight-88', die: 'v10-88', turned });
      expect(result.hit).toBeNull();
      // At least two poses per hit, no more than about twice an ordinary bend's.
      expect(result.samples).toBeGreaterThanOrEqual(26);
      expect(result.samples).toBeLessThanOrEqual(52);
    }
  });
  it('names the hit in a collision', () => {
    // A 180° round bend folds the far leg down onto the ram's side of the machine.
    const fold = foldOf(round({ angle: 180, steps: 26, die: 'v10-88' }));
    const result = brakeCollisions({ fold, bendId: 'r', machine, punch: 'straight-88', die: 'v10-88' });
    expect(result.hit).not.toBeNull();
    expect(result.hit.message).toMatch(/^Bend 1, hit \d+ of 26: the part hits the /);
    expect(result.hit.bumps).toBe(26);
    expect(result.hit.bump).toBeGreaterThanOrEqual(1);
  });
});

describe('downstream of a round bend (§7)', () => {
  const kiosk = (bends = [round({ die: 'v10-88' })]) => ({
    ...emptyModel(),
    sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile, primitives: [], constrained: false }],
    parts: [{ id: 'p', name: 'Kiosk side', material: 'SPCC cold-rolled steel', features: [sheet(bends)] }],
    instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
  });
  it('keeps print artwork off the whole wide zone', () => {
    const fold = foldOf();
    // The piece that stays flat, and the zone's edge on its side.
    const base = fold.pieces.find((p) => !p.path.length);
    const left = base.centroid[0] < 300;
    const edge = left ? 300 - BA / 2 : 300 + BA / 2;
    const at = (x) =>
      createPrint({
        instanceId: 'i',
        point: [x, 200, t],
        normal: [0, 0, 1],
        x: [1, 0, 0],
        artwork: { ...PRINT_DEFAULTS, width: 20, height: 10 },
      });
    // 20 mm from the bend line: clear of an ordinary bend's 1.8 mm zone, inside the round one's 32 mm.
    const inside = left ? edge + 1 - 10 : edge - 1 + 10;
    expect(bendZoneHits(at(inside), fold).map((b) => b.id)).toEqual(['r']);
    const clear = left ? edge - 1 - 10 : edge + 1 + 10;
    expect(bendZoneHits(at(clear), fold)).toEqual([]);
  });
  it('takes no fastener in a hole inside the wide zone (blankHoles)', () => {
    const holes = [
      { type: 'circle', center: [300 - 25, 100], radius: 2.5 },
      { type: 'circle', center: [300 - 40, 300], radius: 2.5 },
    ];
    const outline = rect(600, 400, holes);
    const fold = foldOf(round(), outline);
    expect(blankHoles(fold, outline).map((h) => h.index)).toEqual([1]);
    // An ordinary bend there would take both.
    const plain = foldOf(round({ steps: undefined, radius: null }), outline);
    expect(blankHoles(plain, outline).map((h) => h.index)).toEqual([0, 1]);
  });
  it('times it on the job sheet as its hits, the handling once and 3 s per further hit', () => {
    const model = kiosk();
    const sheetOf = jobSheet(model);
    const bendStep = sheetOf.products[0].steps.find((s) => s.key === 'bend');
    expect(bendStep.summary).toBe('13 hits on the press brake');
    expect(bendStep.items).toHaveLength(1);
    const item = bendStep.items[0];
    expect(item.detail).toMatch(
      /^UP 90° R40 · 13 hits · Straight 88° punch, V10 88° die · 42\.2 kN per hit · 13 strokes /,
    );
    const fold = foldSheet(model.parts[0].features[0], profile);
    const { stroke } = strokeSeconds(fold, bendStrokes(fold.bends)[0], machine);
    close(stroke, bumpTimeline(machine, 0.2607185, 13).total / 1000, 3);
    close(item.seconds, stroke + BEND_HANDLING_S + 12 * BUMP_HANDLING_S, 9);
    // The route bar counts the hits too.
    expect(routeProgress(model, jobProducts(model)[0].id).bend.text).toBe('13 hits');
  });
  it('replays it as one scene, up to twice a bend scene long', () => {
    const model = kiosk();
    const scenes = filmScenes(model, jobProducts(model)[0].id).filter((s) => s.station === 'bend');
    expect(scenes).toHaveLength(1);
    expect(scenes[0].detail).toBe('UP 90° R40 · 13 hits · v10-88');
    expect(scenes[0].seconds).toBeGreaterThan(FILM_PACE.bend.min);
    expect(scenes[0].seconds).toBeLessThanOrEqual(2 * FILM_PACE.bend.max);
  });
});

describe('the drawing readers of a round bend (§7)', () => {
  const ordinary = {
    bend: 1,
    angle: 90,
    direction: 'up',
    radius: 1.6,
    allowance: 3.53,
    deduction: 2.67,
    tooling: 'Straight 88° / V10 88°',
  };
  it('reads "R40 · 13 HITS" in a table widened at INSIDE R, the total width kept', () => {
    const plain = bendTableSvg([ordinary], 0, 0, 200);
    // An ordinary table: TOOLING starts at 93 (11 + 14 + 12 + 16 + 20 + 20), as before.
    expect(plain).toContain('<text x="94.2" y="8.2" font-weight="bold" font-size="2">TOOLING (PUNCH / DIE)</text>');
    expect(plain).toContain('>R1.6<');
    const roundTable = bendTableSvg([ordinary, { ...ordinary, bend: 2, radius: 40, steps: 13 }], 0, 0, 200);
    expect(roundTable).toContain('>R40 · 13 HITS<');
    expect(roundTable).toContain(
      '<text x="102.2" y="8.2" font-weight="bold" font-size="2">TOOLING (PUNCH / DIE)</text>',
    );
    expect(roundTable).toContain(`width="${BEND_TABLE_WIDTH}"`);
    expect(BEND_TABLE_WIDTH).toBe(145);
  });
  it('draws tangent lines thin and continuous, never labelled', () => {
    const view = {
      bendLines: [
        { a: [0, 0], b: [0, 10], bend: 1, direction: 'up', label: 'UP 90° R40 · 13 hits' },
        // Longer than the centre line: still never the labelled one.
        { a: [5, -10], b: [5, 30], bend: 1, direction: 'up', tangent: true },
        { a: [-5, -10], b: [-5, 30], bend: 1, direction: 'up', tangent: true },
      ],
    };
    const svg = bendLinesSvg(view, (p) => p);
    expect(svg.match(/data-tangent="true"/g)).toHaveLength(2);
    expect(svg.match(/<text /g)).toHaveLength(1);
    expect(svg).toContain('transform="rotate(90 1.2 5)">1 · UP 90° R40 · 13 hits</text>');
    expect(svg.match(/stroke-dasharray/g)).toHaveLength(1);
  });
  it('writes tangent lines to the cutting SVG (solid) and the flat DXF (on BEND)', () => {
    const paths = ['M 0 0 L 100 0 L 100 60 L 0 60 L 0 0 Z'];
    const centre = { a: [50, 0], b: [50, 60], angle: 90, direction: 'up', radius: 40 };
    const tangent = { ...centre, a: [18, 0], b: [18, 60], tangent: true };
    const svg = profileSvg({ viewBox: [0, 0, 100, 60], visible: paths, bendLines: [centre, tangent] });
    expect(svg).toContain('<line x1="50" y1="0" x2="50" y2="60"><title>UP 90° R40</title></line>');
    expect(svg).toContain(
      '<line x1="18" y1="0" x2="18" y2="60" stroke-dasharray="none" stroke-width="0.05"><title>UP 90° R40 TANGENT</title></line>',
    );
    const dxf = drawingDxf(paths, { bendLines: [centre, tangent] });
    expect(dxf.match(/\n8\nBEND\n/g)).toHaveLength(2);
    expect(dxf).toContain('\n8\nBEND\n100\nAcDbLine\n10\n18\n20\n0\n');
  });
});
