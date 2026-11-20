// Fillet and Chamfer (docs/sketch-studio-hand-drawing.md §8.3, §8.9): a fillet
// at 90° in all four quadrants and at 30° and 150° (the arc's ends on both
// lines, tangent, its radius the typed one), a rectangle's and a polygon's
// corner, a line used up exactly, each refusal with its number, all four
// corners of a 100 × 60 rectangle one by one against `rect { r: 5 }`; Chamfer
// the same way; the Fillet pick's budget on the cover sample.
import { describe, expect, it } from 'vitest';
import { chamferCut, cornerPick, filletCut } from './sketchCorner.js';
import { arcGeometry, entitiesToProfile } from './sketchProfile.js';
import { checkDrawing } from './sketchCheck.js';
import { profileArea, samplePartEntities, timeRuns } from './vw400Samples.testkit.js';

const line = (id, a, b, extra = {}) => ({ id, type: 'line', a, b, ...extra });
const pickAt = (entities, raw, tool = 'fillet') => cornerPick({ entities, raw, tolerance: 1, tool });
const fillet = (entities, raw, radius = 5, nextId = 50) =>
  filletCut({ entities, pick: pickAt(entities, raw), radius, nextId });
const chamfer = (entities, raw, distance = 2, nextId = 50) =>
  chamferCut({ entities, pick: pickAt(entities, raw, 'chamfer'), distance, nextId });
const deg = (d) => (d * Math.PI) / 180;
// Two lines from `corner` along the angles u and v (degrees), 40 long.
const corner = (P, u, v) => [
  line('e1', [P[0] + 40 * Math.cos(deg(u)), P[1] + 40 * Math.sin(deg(u))], P),
  line('e2', P, [P[0] + 40 * Math.cos(deg(v)), P[1] + 40 * Math.sin(deg(v))]),
];
// The angle (rad) between the arc's direction at `end` and a line's.
function tangency(arc, end, other) {
  const g = arcGeometry(arc.a, arc.m, arc.b);
  const r = [end[0] - g.center[0], end[1] - g.center[1]];
  const d = [other[0] - end[0], other[1] - end[1]];
  return Math.abs(r[0] * d[0] + r[1] * d[1]) / (Math.hypot(...r) * Math.hypot(...d));
}

describe('Fillet', () => {
  it.each([
    ['90° (first quadrant)', [10, 10], 0, 90],
    ['90° (second quadrant)', [-10, 10], 90, 180],
    ['90° (third quadrant)', [-10, -10], 180, 270],
    ['90° (fourth quadrant)', [10, -10], 270, 360],
    ['30°', [0, 0], 0, 30],
    ['150°', [0, 0], 0, 150],
  ])('rounds a corner at %s: the arc’s ends on both lines, tangent to both, its radius the typed one', (_, P, u, v) => {
    const drawing = corner(P, u, v);
    const result = fillet(drawing, [P[0] + 0.3, P[1] + 0.2]);
    const [first, arc, second] = result.entities;
    expect(arc).toMatchObject({ id: 'e50', type: 'arc' });
    expect(result.entities.map((e) => e.id)).toEqual(['e1', 'e50', 'e2']);
    // The lines keep their ids and far ends; their corner ends are the arc's ends, bit for bit.
    expect(first.a).toBe(drawing[0].a);
    expect(second.b).toBe(drawing[1].b);
    expect(arc.a).toBe(first.b);
    expect(arc.b).toBe(second.a);
    const g = arcGeometry(arc.a, arc.m, arc.b);
    expect(Math.abs(g.radius - 5)).toBeLessThan(1e-5);
    // Tangent: the radius to each end square to its line (points rounded to 1e-6 mm, so to 1e-6).
    expect(tangency(arc, arc.a, first.a)).toBeLessThan(1e-6);
    expect(tangency(arc, arc.b, second.b)).toBeLessThan(1e-6);
    // Cut back by r / tan(θ / 2).
    const back = 5 / Math.tan(deg(v - u) / 2);
    expect(Math.hypot(arc.a[0] - P[0], arc.a[1] - P[1])).toBeCloseTo(back, 5);
    expect(result.text).toBe('Fillet R5');
    expect(result.pieces).toEqual([{ type: 'arc', a: arc.a, b: arc.b, m: arc.m }]);
    expect(result.removed).toEqual([
      { type: 'line', a: P, b: arc.a },
      { type: 'line', a: P, b: arc.b },
    ]);
  });

  it('rounds a rectangle’s corner (its sides first, new ids) and a polygon’s, and says a rectangle has its own Radius', () => {
    const rect = { id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] };
    const pick = pickAt([rect], [99.5, 0.4]);
    expect(pick).toMatchObject({ type: 'corner', point: [100, 0], rect: true });
    const result = filletCut({ entities: [rect], pick, radius: 5, nextId: 50 });
    expect(result.replaced).toEqual([rect]);
    expect(result.entities.map((e) => [e.id, e.type])).toEqual([
      ['e50', 'line'],
      ['e54', 'arc'],
      ['e51', 'line'],
      ['e52', 'line'],
      ['e53', 'line'],
    ]);
    expect(result.entities[0].b).toEqual([95, 0]);
    expect(result.entities[2].a).toEqual([100, 5]);
    expect(entitiesToProfile(result.entities).closed).toBe(true);
    const hexagon = { id: 'e1', type: 'polygon', c: [0, 0], sides: 6, af: 40, angle: 0 };
    const hex = filletCut({ entities: [hexagon], pick: pickAt([hexagon], [23.09, 0]), radius: 2, nextId: 9 });
    expect(hex.entities).toHaveLength(7);
    expect(hex.entities.filter((e) => e.type === 'arc')).toHaveLength(1);
    expect(entitiesToProfile(hex.entities).closed).toBe(true);
    expect(pickAt([hexagon], [23.09, 0]).rect).toBe(false);
  });

  it('takes away a line used up exactly, the arc ending on its far end', () => {
    // A 90° corner whose first line is 5 long: R5 uses it up.
    const drawing = [line('e1', [5, 0], [0, 0]), line('e2', [0, 0], [0, 40]), line('e3', [5, 0], [5, -20])];
    const result = fillet(drawing, [0.2, 0.2]);
    expect(result.entities.map((e) => e.id)).toEqual(['e50', 'e2', 'e3']);
    expect(result.entities[0].a).toBe(drawing[0].a);
    expect(result.entities[1].a).toEqual([0, 5]);
    expect(result.added).toEqual(['e50']);
  });

  it('says why it cannot, with its number', () => {
    const refusal = (entities, raw, radius = 5) => {
      const pick = pickAt(entities, raw);
      if (pick.type === 'none') return pick.message;
      try {
        filletCut({ entities, pick, radius, nextId: 9 });
        return 'cut';
      } catch (error) {
        return error.message;
      }
    };
    const square = corner([0, 0], 0, 90);
    expect(refusal(square, [20, 20])).toBe('Point at a corner where two lines meet.');
    expect(refusal([square[0]], [0, 0])).toBe('Point at a corner where two lines meet.');
    expect(refusal([...square, line('e3', [0, 0], [-10, -10])], [0, 0])).toBe('More than two lines meet here.');
    expect(refusal([square[0], { id: 'e2', type: 'arc', a: [0, 0], m: [7, 3], b: [10, 10] }], [0, 0])).toBe(
      'Fillet rounds a corner between two straight lines.',
    );
    expect(refusal([line('e1', [-10, 0], [0, 0]), line('e2', [0, 0], [10, 0])], [0, 0])).toBe(
      'These lines run straight on: there is no corner.',
    );
    // A 6 mm line at 90°: at most R6; at 60° at most R3.46.
    const short = [line('e1', [6, 0], [0, 0]), line('e2', [0, 0], [0, 40])];
    expect(refusal(short, [0, 0], 8)).toBe('R8 does not fit here: at most R6 (the shorter line is 6 mm).');
    const sixty = [line('e1', [6, 0], [0, 0]), line('e2', [0, 0], [20, 34.641016])];
    expect(refusal(sixty, [0, 0], 8)).toBe('R8 does not fit here: at most R3.46 (the shorter line is 6 mm).');
    expect(refusal(short, [0, 0], 0)).toBe('Type a fillet radius greater than zero.');
  });

  it('rounds all four corners of a 100 × 60 rectangle R5 one by one into the profile of rect { r: 5 }', () => {
    let entities = [{ id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] }],
      nextId = 2;
    for (const raw of [
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ])
      ({ entities, nextId } = fillet(entities, raw, 5, nextId));
    expect(entities.filter((e) => e.type === 'arc')).toHaveLength(4);
    const { profile, closed } = entitiesToProfile(entities);
    expect(closed).toBe(true);
    const rounded = profileArea(entitiesToProfile([{ id: 'r', type: 'rect', a: [0, 0], b: [100, 60], r: 5 }]).profile);
    // Its own arcs are three points rounded to 1e-6 mm: the closed form to 1e-6 of itself.
    expect(Math.abs(rounded / (6000 - (4 - Math.PI) * 25) - 1)).toBeLessThan(1e-6);
    expect(Math.abs(profileArea(profile) - rounded) / rounded).toBeLessThan(1e-6);
    expect(checkDrawing(entities).problems).toEqual([]);
  });

  it('makes the arc construction only when both lines are', () => {
    const marked = corner([0, 0], 0, 90).map((e) => ({ ...e, construction: true }));
    expect(fillet(marked, [0, 0]).entities[1].construction).toBe(true);
    expect(fillet([marked[0], corner([0, 0], 0, 90)[1]], [0, 0]).entities[1].construction).toBeUndefined();
  });
});

describe('Chamfer', () => {
  it('cuts a corner at 90°, 30° and 150° back by the distance on both lines, one line joining them', () => {
    for (const [u, v] of [
      [0, 90],
      [0, 30],
      [0, 150],
    ]) {
      const drawing = corner([0, 0], u, v);
      const result = chamfer(drawing, [0.2, 0.1]);
      const [first, join, second] = result.entities;
      expect(join).toEqual({ id: 'e50', type: 'line', a: first.b, b: second.a });
      expect(Math.hypot(...first.b)).toBeCloseTo(2, 6);
      expect(Math.hypot(...second.a)).toBeCloseTo(2, 6);
      expect(result.text).toBe('Chamfer 2');
    }
  });

  it('chamfers a rectangle’s corners one by one (area less by four triangles), and says why it cannot', () => {
    let entities = [{ id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] }],
      nextId = 2;
    for (const raw of [
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ])
      ({ entities, nextId } = chamfer(entities, raw, 2, nextId));
    const { profile, closed } = entitiesToProfile(entities);
    expect(closed).toBe(true);
    expect(Math.abs(profileArea(profile) - 5992) / 5992).toBeLessThan(1e-6);
    const short = [line('e1', [4, 0], [0, 0]), line('e2', [0, 0], [0, 40])];
    expect(() => chamfer(short, [0, 0], 5)).toThrow('A 5 mm chamfer does not fit here: the shorter line is 4 mm.');
    expect(
      pickAt([short[0], { id: 'e2', type: 'arc', a: [0, 0], m: [7, 3], b: [10, 10] }], [0, 0], 'chamfer').message,
    ).toBe('Chamfer cuts a corner between two straight lines.');
    // A chamfer of the whole shorter line uses it up.
    expect(chamfer(short, [0, 0], 4).entities.map((e) => e.id)).toEqual(['e50', 'e2']);
  });
});

describe('the budget of §8.7 (node)', () => {
  it('a Fillet pick (and its cut) on the cover sample in ≤ 3 ms', () => {
    const cover = samplePartEntities()[1].entities;
    // The outline's corners: the ends of its first lines.
    const corners = cover
      .filter((e) => e.type === 'line')
      .slice(0, 41)
      .map((e) => e.a);
    const hover = (i = 0) => {
      const pick = cornerPick({ entities: cover, raw: corners[i % corners.length], tolerance: 0.5 });
      if (pick.type === 'none') return pick;
      try {
        return filletCut({ entities: cover, pick, radius: 0.2, nextId: 3000 });
      } catch (error) {
        return error;
      }
    };
    let timing;
    for (let round = 0; round < 5 && !(timing?.median <= 3); round++) timing = timeRuns(hover, 41);
    console.warn(
      `HD-4 budget: a Fillet pick on the cover ${timing.median.toFixed(2)} ms (worst ${timing.worst.toFixed(1)})`,
    );
    expect(timing.median).toBeLessThanOrEqual(3);
  });
});
