import { describe, expect, it } from 'vitest';
import {
  bendArcPoint,
  bendLabel,
  bendLineFromEdge,
  bendNumbers,
  blankHoles,
  distanceFromLeg,
  foldProblem,
  foldSheet,
  foldedBounds,
  legFromDistance,
  nestProfiles,
  poseFold,
  profilePolygon,
  transformPoint,
} from './sheetMetal.js';

// SPCC t 1.5, default tooling: V ≥ 6 t = 9 → V10 (88°, shoulder R1.2); straight
// 88° punch R0.8; r = max(0.8, 0.16 × 10) = 1.6; r/t = 1.07 → K 0.43 (medium).
const t = 1.5,
  r = 1.6,
  K = 0.43;
const BA = (Math.PI / 2) * (r + K * t); // 3.526459…
const OSSB = r + t; // tan 45° = 1
const BD = 2 * OSSB - BA; // 2.673541…
const h = BA / 2;

const rect = (width, height, holes) => ({
  type: 'rectangle',
  width,
  height,
  origin: [0, 0],
  ...(holes ? { holes } : {}),
});
const sheet = (bends, extra = {}) => ({
  id: 'sm',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: t,
  stock: 'spcc',
  kFactor: null,
  base: null,
  bends: bends.map((bend, i) => ({ id: `b${i + 1}`, angle: 90, direction: 'up', radius: null, ...bend })),
  ...extra,
});
const close = (value, expected, digits = 6) => expect(value).toBeCloseTo(expected, digits);
const closeBox = (box, expected, digits = 6) =>
  box.forEach((corner, i) => corner.forEach((v, k) => close(v, expected[i][k], digits)));

describe('per-bend numbers (§5.2)', () => {
  it('uses the air-bend radius of the default die and the K table', () => {
    const numbers = bendNumbers({ thickness: t, stock: 'spcc', angle: 90 });
    expect(numbers.die).toBe('v10-88');
    expect(numbers.punch).toBe('straight-88');
    close(numbers.radius, 1.6);
    close(numbers.kFactor, 0.43);
    close(numbers.allowance, BA);
    close(numbers.setback, OSSB);
    close(numbers.deduction, BD);
    expect(numbers.sharp).toBe(false);
  });
  it('measures the setback to the outer tangent above 90° and honours overrides', () => {
    const numbers = bendNumbers({ thickness: 2, stock: 'spcc', angle: 120, radius: 3, kFactor: 0.5 });
    close(numbers.radius, 3);
    close(numbers.kFactor, 0.5);
    close(numbers.allowance, ((120 * Math.PI) / 180) * (3 + 1));
    close(numbers.setback, 5);
    close(numbers.deduction, 10 - ((120 * Math.PI) / 180) * 4);
  });
  it('turns a too-small air bend sharp at 0.63 t', () => {
    // 3 mm SPCC on the default V20: 0.16 × 20 = 3.2 > 1.89, not sharp; force a V6 die.
    const numbers = bendNumbers({ thickness: 3, stock: 'spcc', angle: 90, die: 'v6-88' });
    expect(numbers.sharp).toBe(true);
    close(numbers.radius, 0.63 * 3);
  });
  it('converts between flat distance and outside leg both ways', () => {
    const numbers = bendNumbers({ thickness: t, stock: 'spcc', angle: 90 });
    close(legFromDistance(distanceFromLeg(25, numbers), numbers), 25);
    close(distanceFromLeg(30, numbers), 30 - OSSB + h);
  });
  it('labels a bend the way the flat pattern reads', () => {
    expect(bendLabel({ direction: 'up', angle: 90, radius: 1.5 })).toBe('UP 90° R1.5');
    expect(bendLabel({ direction: 'down', angle: 45.5, radius: 1.6 })).toBe('DOWN 45.5° R1.6');
  });
});

describe('the flat blank', () => {
  it('samples arcs and circles to the chord error and reads size, cut length and pierces', () => {
    const { outer, holes } = profilePolygon(rect(100, 60, [{ type: 'circle', radius: 4, center: [20, 30] }]));
    expect(outer).toHaveLength(4);
    expect(holes).toHaveLength(1);
    // Every chord of the hole stays within 0.05 mm of the circle.
    const n = holes[0].length;
    expect(4 * (1 - Math.cos(Math.PI / n))).toBeLessThanOrEqual(0.05 + 1e-12);
    const fold = foldSheet(sheet([]), rect(100, 60, [{ type: 'circle', radius: 4, center: [20, 30] }]));
    close(fold.flat.width, 100);
    close(fold.flat.height, 60);
    close(fold.flat.cutLength, 320 + 2 * Math.PI * 4, 1);
    expect(fold.flat.pierces).toBe(2);
    expect(fold.pieces).toHaveLength(1);
  });
  it('refuses an offset profile and a cut-out outside the blank', () => {
    expect(() => profilePolygon({ ...rect(10, 10), offset: 1 })).toThrow(/offset/);
    expect(() => profilePolygon(rect(10, 10, [{ type: 'circle', radius: 2, center: [11, 5] }]))).toThrow(/outside/);
  });
});

describe('folding by numbers (§5.3–5.4)', () => {
  it('folds an L 50 × 30 whose legs and bounds match the bend deduction', () => {
    // Legs 50 (fixed) and 30 (flange): blank 80 − BD, bend line 30 − BD/2 in from the left.
    const d = 30 - OSSB + h;
    const width = 80 - BD;
    const fold = foldSheet(sheet([{ a: [d, 0], b: [d, 40] }]), rect(width, 40));
    expect(fold.pieces).toHaveLength(2);
    const bend = fold.bends[0];
    close(bend.legs.fixed, 50);
    close(bend.legs.moving, 30);
    close(bend.length, 40);
    // The left piece is the flange; the bend was flipped so the fixed side is v < 0.
    expect(fold.rootPiece).toBe(bend.fixedPiece);
    expect(bend.n[0]).toBeLessThan(0);
    closeBox(foldedBounds(fold), [
      [width - 50, 0, 0],
      [width, 40, 30],
    ]);
    expect(fold.warnings).toEqual([]);
  });
  it('folds a U channel 20 / 60 / 20 and reads the web to the mould lines', () => {
    const width = 100 - 2 * BD;
    const x1 = 20 - BD / 2,
      x2 = width - x1;
    const fold = foldSheet(
      sheet([
        { a: [x1, 0], b: [x1, 50] },
        { a: [x2, 0], b: [x2, 50] },
      ]),
      rect(width, 50),
    );
    expect(fold.pieces).toHaveLength(3);
    for (const bend of fold.bends) {
      close(bend.legs.moving, 20);
      close(bend.legs.fixed, 60);
      close(bend.deduction, BD);
    }
    const box = foldedBounds(fold);
    close(box[1][0] - box[0][0], 60);
    close(box[1][2] - box[0][2], 20);
    close(box[0][2], 0);
  });
  it('folds a Z (up then down): the down flange hangs from the top face', () => {
    const width = 100 - 2 * BD;
    const x1 = 20 - BD / 2,
      x2 = width - x1;
    const fold = foldSheet(
      sheet([
        { a: [x1, 0], b: [x1, 50], direction: 'up' },
        { a: [x2, 0], b: [x2, 50], direction: 'down' },
      ]),
      rect(width, 50),
    );
    closeBox(foldedBounds(fold), [
      [x1 + h - OSSB, 0, t - 20],
      [x2 - h + OSSB, 50, 20],
    ]);
  });
  it('maps the flange end through the transform exactly (§5.4)', () => {
    const d = 30 - OSSB + h;
    const fold = foldSheet(sheet([{ a: [d, 0], b: [d, 40] }]), rect(80 - BD, 40));
    const flange = fold.pieces.find((p) => p.id !== fold.rootPiece);
    // The blank's left edge, bottom face, goes to the flange top, outer face.
    const p = transformPoint(flange.matrix, [0, 10, 0]);
    close(p[0], d + h - OSSB);
    close(p[1], 10);
    close(p[2], 30);
    // The arc meets both pieces: φ = 0 on the fixed edge, φ = θ on the moved one.
    const bend = fold.bends[0];
    const start = bendArcPoint(bend, t, bend.transform, 5, 0, 0);
    const startFlat = [bend.a[0] - bend.n[0] * h + bend.u[0] * 5, bend.a[1] - bend.n[1] * h + bend.u[1] * 5, 0];
    start.forEach((v, i) => close(v, startFlat[i]));
    const end = bendArcPoint(bend, t, bend.transform, 5, 1, t);
    const moved = transformPoint(flange.matrix, [
      bend.a[0] + bend.n[0] * h + bend.u[0] * 5,
      bend.a[1] + bend.n[1] * h + bend.u[1] * 5,
      t,
    ]);
    end.forEach((v, i) => close(v, moved[i]));
  });
  it('bends a line through a window over both intervals, joining one pair', () => {
    const fold = foldSheet(
      sheet([{ a: [30, 0], b: [30, 60] }]),
      rect(100, 60, [{ type: 'rectangle', width: 10, height: 10, origin: [25, 25] }]),
    );
    expect(fold.pieces).toHaveLength(2);
    expect(fold.bends[0].intervals).toHaveLength(2);
    close(fold.bends[0].length, 50);
    expect(fold.bends[0].movingPieces).toHaveLength(1);
    expect(fold.warnings.map((w) => w.code)).toContain('hole-near-bend');
  });
  it('bends a comb: three teeth move on one side of one bend', () => {
    const comb = {
      type: 'polygon',
      points: [
        [0, 0],
        [50, 0],
        [50, 60],
        [40, 60],
        [40, 20],
        [30, 20],
        [30, 60],
        [20, 60],
        [20, 20],
        [10, 20],
        [10, 60],
        [0, 60],
      ],
    };
    const fold = foldSheet(sheet([{ a: [0, 40], b: [50, 40] }]), comb);
    expect(fold.pieces).toHaveLength(4);
    const bend = fold.bends[0];
    expect(bend.intervals).toHaveLength(3);
    expect(bend.movingPieces).toHaveLength(3);
    close(bend.length, 30);
    // Each tooth tip stands up 20 − BA/2 + OSSB above the base.
    const box = foldedBounds(fold);
    close(box[1][2], 20 - h + OSSB);
  });
  it('poses at other angles: 0° is the flat blank, the target angle is the fold', () => {
    const d = 30 - OSSB + h;
    const fold = foldSheet(sheet([{ a: [d, 0], b: [d, 40] }]), rect(80 - BD, 40));
    const flat = poseFold(fold, { b1: 0 });
    closeBox(foldedBounds(flat), [
      [0, 0, 0],
      [80 - BD, 40, t],
    ]);
    const half = poseFold(fold, { b1: 45 });
    expect(half.bends[0].posedAngle).toBe(45);
    // The zone keeps its flat width: the posed radius grows as the angle shrinks.
    close(half.bends[0].transform.radius, BA / (Math.PI / 4) - K * t);
    closeBox(foldedBounds(poseFold(fold)), foldedBounds(fold));
  });
  it('keeps the piece that holds the base point in place', () => {
    const d = 30 - OSSB + h;
    const fold = foldSheet(sheet([{ a: [d, 0], b: [d, 40] }], { base: [5, 5] }), rect(80 - BD, 40));
    const root = fold.pieces.find((p) => p.id === fold.rootPiece);
    expect(root.centroid[0]).toBeLessThan(d);
    const box = foldedBounds(fold);
    close(box[1][2], 50);
  });
});

describe('validation (§5.5)', () => {
  const ring = rect(100, 60, [{ type: 'rectangle', width: 60, height: 20, origin: [20, 20] }]);
  it('refuses a bend that does not separate the sheet', () => {
    expect(() => foldSheet(sheet([{ a: [0, 30], b: [20, 30] }]), ring)).toThrow(
      'Bend 1 does not separate the sheet: material beside the punch line is still connected. Run the bend edge to edge or cut a relief.',
    );
  });
  it('refuses two bends that close a loop, naming them', () => {
    expect(() =>
      foldSheet(
        sheet([
          { a: [0, 30], b: [20, 30] },
          { a: [80, 30], b: [100, 30] },
        ]),
        ring,
      ),
    ).toThrow(/^Bends 1 and 2 close a loop/);
  });
  it('refuses crossing bends', () => {
    expect(() =>
      foldSheet(
        sheet([
          { a: [50, 0], b: [50, 60] },
          { a: [0, 30], b: [100, 30] },
        ]),
        rect(100, 60),
      ),
    ).toThrow('Bend 2 crosses bend 1.');
  });
  it('refuses a line that misses the blank, a bad angle, a zero thickness', () => {
    expect(() => foldSheet(sheet([{ a: [150, 0], b: [150, 60] }]), rect(100, 60))).toThrow(
      'Bend 1: the punch line misses the blank.',
    );
    expect(() => foldSheet(sheet([{ a: [50, 0], b: [50, 60], angle: 0 }]), rect(100, 60))).toThrow(/more than 0°/);
    expect(() => foldSheet(sheet([{ a: [50, 0], b: [50, 60], angle: 181 }]), rect(100, 60))).toThrow(/at most 180°/);
    expect(() => foldSheet(sheet([], { thickness: 0 }), rect(100, 60))).toThrow(/greater than zero/);
    expect(foldProblem(sheet([{ a: [150, 0], b: [150, 60] }]), rect(100, 60))).toMatch(/misses/);
    expect(foldProblem(sheet([{ a: [50, 0], b: [50, 60] }]), rect(100, 60))).toBe('');
  });
  it('refuses a bend whose zone runs off the edge', () => {
    expect(() => foldSheet(sheet([{ a: [1, 0], b: [1, 60] }]), rect(100, 60))).toThrow(/too close to the edge/);
  });
  it('warns about a short leg, a tight radius and an oblique outline', () => {
    const short = foldSheet(sheet([{ a: [5, 0], b: [5, 60] }]), rect(100, 60));
    expect(short.warnings.map((w) => w.code)).toEqual(['short-leg']);
    // V10 at 90°: 10 / (2 cos 45°) + 1.2 = 8.27 mm.
    expect(short.warnings[0].message).toBe(
      'Bend 1: the flange leg is 5 mm from the bend line in the flat; the V10 88° die needs at least 8.27 mm to sit on both shoulders.',
    );
    const tight = foldSheet(sheet([{ a: [50, 0], b: [50, 60] }], { stock: 'a6061', thickness: 1.6 }), rect(100, 60));
    expect(tight.warnings.map((w) => w.code)).toContain('tight-radius');
    const trapezoid = {
      type: 'polygon',
      points: [
        [0, 0],
        [100, 0],
        [90, 60],
        [10, 60],
      ],
    };
    const oblique = foldSheet(sheet([{ a: [0, 30], b: [100, 30] }]), trapezoid);
    expect(oblique.warnings.map((w) => w.code)).toContain('outline-not-square');
  });
});

describe('Add bend helpers', () => {
  it('runs a line parallel to each blank edge, edge to edge', () => {
    const { outer } = profilePolygon(rect(100, 60));
    expect(bendLineFromEdge(outer, 'left', 20)).toEqual({ a: [20, 0], b: [20, 60] });
    expect(bendLineFromEdge(outer, 'right', 20)).toEqual({ a: [80, 60], b: [80, 0] });
    expect(bendLineFromEdge(outer, 'front', 10)).toEqual({ a: [100, 10], b: [0, 10] });
    expect(bendLineFromEdge(outer, 'rear', 10)).toEqual({ a: [0, 50], b: [100, 50] });
  });
});

describe('drawing profiles → blanks', () => {
  it('makes a loop inside another its cut-out and reports a loop inside a cut-out', () => {
    const candidates = [
      { id: 'outer', name: 'Outline', sourceIds: ['o'], profile: rect(100, 60) },
      {
        id: 'hole',
        name: 'Window',
        sourceIds: ['w'],
        profile: { type: 'rectangle', width: 40, height: 30, origin: [10, 10] },
      },
      { id: 'island', name: 'Island', sourceIds: ['i'], profile: { type: 'circle', radius: 3, center: [30, 25] } },
      { id: 'pierce', name: 'Hole', sourceIds: ['h'], profile: { type: 'circle', radius: 4, center: [80, 30] } },
      {
        id: 'other',
        name: 'Tab',
        sourceIds: ['t'],
        profile: { type: 'rectangle', width: 10, height: 10, origin: [200, 0] },
      },
    ];
    const { blanks, skipped } = nestProfiles(candidates);
    expect(blanks.map((b) => b.id)).toEqual(['outer', 'other']);
    expect(blanks[0].holes).toBe(2);
    expect(blanks[0].profile.holes.map((h) => h.type)).toEqual(['rectangle', 'circle']);
    expect(blanks[0].sourceIds).toEqual(['o', 'w', 'h']);
    expect(skipped).toEqual([
      { id: 'island', name: 'Island', reason: 'It sits inside a cut-out; cut it from its own blank.' },
    ]);
  });
});

describe('a blank’s laser-cut holes', () => {
  it('lists each round cut-out clear of the bends, on its piece’s top face, pointing into the sheet', () => {
    const profile = rect(100, 60, [
      { type: 'circle', center: [20, 30], radius: 2.25 },
      // In the bend zone (the line at x = 50): left out.
      { type: 'circle', center: [50.5, 10], radius: 2.25 },
      // Not a circle: left out, but it keeps its place in the list.
      { type: 'rectangle', width: 4, height: 4, origin: [30, 40] },
      { type: 'circle', center: [80, 30], radius: 2.25 },
    ]);
    const fold = foldSheet(
      sheet([{ id: 'b', a: [50, 0], b: [50, 60], angle: 90, direction: 'up', radius: null }], { base: [10, 30] }),
      profile,
    );
    const rows = blankHoles(fold, profile);
    expect(rows.map((r) => [r.index, r.diameter])).toEqual([
      [0, 4.5],
      [3, 4.5],
    ]);
    // The fixed flat: on its top face (z = t), into the sheet (−Z).
    expect(rows[0].centre).toEqual([20, 30, 1.5]);
    expect(rows[0].direction).toEqual([0, 0, -1]);
    // The flange stands up: its hole looks along ∓X, at the flange's height.
    expect(Math.abs(rows[1].direction[0])).toBeCloseTo(1, 9);
    expect(rows[1].centre[2]).toBeGreaterThan(20);
  });
});
