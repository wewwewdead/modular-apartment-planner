// Trim and Extend (docs/sketch-studio-hand-drawing.md §8.2, §8.9): every pair
// of line, arc and circle (a span in the middle, at an end, none), a circle
// to an arc, each shape exploded, the meet rule, the keyhole in all 24 trim
// orders, a property test over 300 random drawings; Extend to a line, a
// circle, an arc, an arc round its circle, onto an end, each refusal; the
// Trim hover's budget on the cover sample; the four new modules pure.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MEET_MM,
  drawingPieces,
  extendCut,
  extendPick,
  measureOf,
  primitiveOf,
  trimCut,
  trimPick,
} from './sketchTrim.js';
import { arcGeometry, entitiesToProfile, explode, roundPoint } from './sketchProfile.js';
import { distanceToPrimitive } from './sketchIntersect.js';
import { TINY_MM, checkDrawing } from './sketchCheck.js';
import { profileArea, samplePartEntities, timeRuns } from './vw400Samples.testkit.js';

const line = (id, a, b, extra = {}) => ({ id, type: 'line', a, b, ...extra });
const arc = (id, a, m, b) => ({ id, type: 'arc', a, m, b });
const circle = (id, c, r) => ({ id, type: 'circle', c, r });
// One trim at `raw` (tolerance 0.5 mm): the cut, or the refusal's words.
const trim = (entities, raw, nextId = 50) => {
  const pick = trimPick({ entities, raw, tolerance: 0.5 });
  return pick.type === 'none' ? pick.message : trimCut({ entities, pick, nextId });
};
const lengthOf = (entity) =>
  (entity.type === 'circle' ? [entity] : explode(entity)).reduce((sum, piece) => {
    if (piece.type === 'circle') return sum + 2 * Math.PI * piece.r;
    if (piece.type === 'line') return sum + Math.hypot(piece.b[0] - piece.a[0], piece.b[1] - piece.a[1]);
    const g = arcGeometry(piece.a, piece.m, piece.b);
    return sum + (g ? g.radius * Math.abs(g.sweep) : 0);
  }, 0);
const total = (entities) => entities.reduce((sum, e) => sum + lengthOf(e), 0);

describe('Trim: every pair of line, arc and circle', () => {
  // A level line through y = 0 from x = 0 to 100; each cutter crosses it.
  const target = line('e1', [0, 0], [100, 0]);
  const cutters = {
    line: [line('e2', [30, -10], [30, 10]), line('e3', [70, -10], [70, 10])],
    arc: [arc('e2', [20, -10], [30, 0], [20, 10]), arc('e3', [80, -10], [70, 0], [80, 10])],
    circle: [circle('e2', [30, 0], 5), circle('e3', [70, 0], 5)],
  };
  it.each(Object.keys(cutters))('a line cut by a %s: the middle span (two pieces), an end, then none', (kind) => {
    const drawing = [target, ...cutters[kind]];
    const middle = trim(drawing, [50, 0.1]);
    const cut = kind === 'circle' ? [35, 65] : [30, 70];
    expect(middle.entities[0]).toEqual(line('e1', [0, 0], [cut[0], 0]));
    expect(middle.entities[1]).toEqual(line('e50', [cut[1], 0], [100, 0]));
    expect(middle.added).toEqual(['e50']);
    expect(middle.replaced).toEqual([target]);
    expect(middle.text).toBe(`Trim ${cut[1] - cut[0]} mm`);
    expect(middle.removed).toEqual([{ type: 'line', a: [cut[0], 0], b: [cut[1], 0] }]);
    // The untouched cutters keep their objects.
    expect(middle.entities.slice(2)).toEqual(cutters[kind]);
    expect(middle.entities[2]).toBe(cutters[kind][0]);
    // At the end: shortened, the id kept.
    const end = trim(drawing, [90, 0]);
    expect(end.entities[0]).toEqual(line('e1', [0, 0], [kind === 'circle' ? 75 : 70, 0]));
    expect(end.added).toEqual([]);
    // Nothing crosses it: the whole line goes, and the readout says so.
    const alone = trim([target], [50, 0]);
    expect(alone.entities).toEqual([]);
    expect(alone.text).toBe('Nothing crosses it: click removes the whole line');
  });

  it('an arc cut by a line, an arc and a circle: the kept arcs on its circle, their middles the middles', () => {
    // A half circle R50 about the origin, from (50, 0) through (0, 50) to (−50, 0).
    const half = arc('e1', [50, 0], [0, 50], [-50, 0]);
    for (const [kind, cutter] of [
      ['line', line('e2', [0, 0], [0, 80])],
      ['arc', arc('e2', [-10, 40], [0, 60], [10, 40])],
      ['circle', circle('e2', [0, 50], 10)],
    ]) {
      const result = trim([half, cutter], [Math.cos(0.3) * 50, Math.sin(0.3) * 50]);
      const [kept] = result.entities;
      expect(kept.id, kind).toBe('e1');
      expect(kept.b).toBe(half.b);
      const g = arcGeometry(kept.a, kept.m, kept.b);
      expect(g.radius).toBeCloseTo(50, 5);
      expect(Math.hypot(...g.center)).toBeLessThan(1e-5);
      // The middle point is the middle of what is kept.
      const ends = [Math.atan2(kept.a[1], kept.a[0]), Math.atan2(kept.b[1], kept.b[0])];
      expect(Math.atan2(kept.m[1], kept.m[0])).toBeCloseTo((ends[0] + ends[1]) / 2, 5);
      expect(result.entities).toHaveLength(2);
    }
    // The middle span of the half: two arcs, the second new right after it.
    const two = trim([half, line('e2', [30, 0], [30, 60]), line('e3', [-30, 0], [-30, 60])], [0, 50]);
    expect(two.entities.map((e) => [e.id, e.type])).toEqual([
      ['e1', 'arc'],
      ['e50', 'arc'],
      ['e2', 'line'],
      ['e3', 'line'],
    ]);
    expect(two.entities[0].b).toEqual([30, 40]);
    expect(two.entities[1].a).toEqual([-30, 40]);
    // Nothing crosses it: the whole arc goes.
    const alone = trim([half], [0, 50]);
    expect(alone.entities).toEqual([]);
    expect(alone.text).toBe('Nothing crosses it: click removes the whole arc');
  });

  it('a circle: with two or more cut points the rest stays as one arc (a new id); with one or none it goes', () => {
    const hole = circle('e1', [0, 0], 10);
    const cutter = line('e2', [-20, 6], [20, 6]);
    const result = trim([hole, cutter], [0, 10]);
    expect(result.entities).toHaveLength(2);
    const [kept] = result.entities;
    expect(kept).toMatchObject({ id: 'e50', type: 'arc', a: [-8, 6], b: [8, 6] });
    expect(kept.m).toEqual([0, -10]);
    expect(result.replaced).toEqual([hole]);
    expect(result.removed[0]).toEqual({ type: 'arc', a: [8, 6], b: [-8, 6], m: [0, 10] });
    // By an arc and by a circle too.
    expect(trim([hole, arc('e2', [-20, 6], [0, 7], [20, 6])], [0, 10]).entities[0].type).toBe('arc');
    expect(trim([hole, circle('e2', [10, 0], 5)], [10, 0.1]).entities[0].type).toBe('arc');
    // A tangent is one cut point: the whole circle goes.
    const once = trim([hole, line('e2', [-20, 10], [20, 10])], [0, -10]);
    expect(once.entities.map((e) => e.id)).toEqual(['e2']);
    expect(once.text).toBe('Nothing crosses it: click removes the whole circle');
    expect(once.removed).toEqual([{ type: 'circle', c: [0, 0], r: 10 }]);
  });

  it('keeps construction on what is left, and a piece under 0.01 mm goes with the cut', () => {
    const marked = line('e1', [0, 0], [100, 0], { construction: true });
    const result = trim([marked, line('e2', [50, -5], [50, 5])], [80, 0]);
    expect(result.entities[0]).toEqual({ ...marked, b: [50, 0] });
    // A cutter 0.005 mm from the line's start: the stub before it goes too.
    const stub = trim([line('e1', [0, 0], [100, 0]), line('e2', [0.005, -5], [0.005, 5])], [50, 0]);
    expect(stub.entities.map((e) => e.id)).toEqual(['e2']);
    expect(stub.removed).toHaveLength(2);
  });
});

describe('Trim: shapes become their lines and arcs first', () => {
  const cutter = line('e2', [50, -10], [50, 70]);
  it.each([
    ['rect', { id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] }, [70, 0], 4],
    ['rounded rect', { id: 'e1', type: 'rect', a: [0, 0], b: [100, 60], r: 5 }, [70, 0], 8],
    ['slot', { id: 'e1', type: 'slot', c: [50, 30], length: 60, width: 20, angle: 0 }, [65, 20], 4],
    ['polygon', { id: 'e1', type: 'polygon', c: [50, 30], sides: 6, af: 40, angle: 0 }, [55, 10], 6],
  ])('a %s: the picked side cut, the others its pieces with new ids in its place', (name, shape, raw, count) => {
    const result = trim([shape, cutter], raw);
    expect(result.replaced[0]).toBe(shape);
    // The pieces in the shape's place, from e50 on, the cut side's far part new after them.
    const pieces = result.entities.slice(0, -1);
    expect(pieces.every((e) => e.type === 'line' || e.type === 'arc')).toBe(true);
    expect(pieces[0].id).toBe('e50');
    expect(result.entities.at(-1)).toBe(cutter);
    expect(pieces).toHaveLength(count);
    expect(new Set(pieces.map((e) => e.id)).size).toBe(count);
    expect(result.added).toEqual(pieces.map((e) => e.id));
    // The cut side ends on the cutter.
    expect(pieces.some((e) => e.a[0] === 50 || e.b[0] === 50)).toBe(true);
    expect(total(result.entities)).toBeCloseTo(
      total([shape, cutter]) - result.removed.reduce((s, e) => s + lengthOf(e), 0),
      6,
    );
  });

  it('a whole side of a rectangle with nothing crossing it', () => {
    const result = trim([{ id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] }], [50, 0]);
    expect(result.text).toBe('Nothing crosses it: click removes the whole side');
    expect(result.entities.map((e) => e.id)).toEqual(['e51', 'e52', 'e53']);
    expect(result.added).toEqual(['e51', 'e52', 'e53']);
  });
});

describe('the meet rule (§8.1)', () => {
  it('lands a cut point on an end within 0.001 mm, coordinate by coordinate', () => {
    // A line ending 0.0004 mm off the target: the target's cut point IS that end.
    const end = [40.0004, 0.0003];
    const result = trim([line('e1', [0, 0], [100, 0]), line('e2', [40, 20], end)], [70, 0]);
    expect(result.entities[0].b).toBe(end);
    expect(result.entities[0].b[0]).toBe(end[0]);
    expect(result.entities[0].b[1]).toBe(end[1]);
  });

  it('finds a cut point on an arc left by an earlier trim even without an exact crossing', () => {
    // The circle trimmed first: its arc ends where the line crossed it, rounded to 1e-6.
    const drawing = [circle('e1', [0, 0], 7), line('e2', [-3, -20], [-3, 20]), line('e3', [3, -20], [3, 20])];
    const first = trim(drawing, [0, -7]);
    const [kept] = first.entities;
    // Then the line: its cut point is the arc's end itself, bit for bit.
    const second = trim(first.entities, [3, -15], first.nextId);
    const trimmed = second.entities.find((e) => e.id === 'e3');
    expect([trimmed.a, trimmed.b]).toContain(kept.a);
    expect(MEET_MM).toBe(1e-3);
  });
});

// The keyhole of §8.9: a Ø12 circle and a 6 wide slot from its centre, four trims.
describe('the keyhole', () => {
  const C = [50, 70];
  const drawing = [
    { id: 'e1', type: 'circle', c: C, r: 6 },
    { id: 'e2', type: 'slot', c: [50, 58], length: 30, width: 6, angle: -90 },
  ];
  // The circle's bottom between the slot's sides, the slot's near end, its two sides inside the circle.
  const clicks = [
    [50, 64.05],
    [50, 73],
    [53, 67],
    [47, 67],
  ];
  const orders = (list) =>
    list.length <= 1
      ? [list]
      : list.flatMap((x, i) => orders([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [x, ...rest]));
  // The closed form: the disc, the strip below it to the far end's centre (24 mm), the far half round.
  const y0 = Math.sqrt(36 - 9);
  const area = 36 * Math.PI + 6 * 24 - (3 * y0 + 36 * Math.asin(3 / 6)) + 4.5 * Math.PI;

  it('gives the same closed profile in all 24 orders, its area the closed form’s, Check clean', () => {
    const profiles = new Set();
    for (const order of orders([0, 1, 2, 3])) {
      let entities = drawing,
        nextId = 3;
      for (const i of order) {
        const result = trim(entities, clicks[i], nextId);
        expect(typeof result, `order ${order}`).toBe('object');
        ({ entities, nextId } = result);
      }
      const { profile, closed } = entitiesToProfile(entities);
      expect(closed, `order ${order}`).toBe(true);
      profiles.add(JSON.stringify(profile));
      expect(checkDrawing(entities).problems, `order ${order}`).toEqual([]);
    }
    expect(profiles.size).toBe(1);
    const profile = JSON.parse([...profiles][0]);
    expect(profile.segments).toHaveLength(4);
    expect(Math.abs(profileArea(profile) - area) / area).toBeLessThan(1e-6);
  });
});

describe('a property test: 300 random drawings, one trim each', () => {
  const random = (seed) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  it('leaves no piece under 0.01 mm, every new end on another piece, the length less by the span, the rest untouched', () => {
    const rand = random(20261121);
    const at = () => roundPoint([rand() * 100, rand() * 100]);
    let trims = 0;
    for (let k = 0; k < 300; k++) {
      const drawing = [];
      const count = 3 + Math.floor(rand() * 6);
      for (let i = 0; i < count; i++) {
        const id = `e${i + 1}`;
        const kind = Math.floor(rand() * 7);
        const c = at();
        if (kind < 2) drawing.push(line(id, c, at()));
        else if (kind === 2) {
          const [a, b] = [c, at()];
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const n = [b[1] - a[1], a[0] - b[0]];
          const bulge = (rand() - 0.5) * 1.2;
          drawing.push(arc(id, a, roundPoint([mid[0] + n[0] * bulge, mid[1] + n[1] * bulge]), b));
        } else if (kind === 3) drawing.push(circle(id, c, 3 + Math.round(rand() * 300) / 10));
        else if (kind === 4) {
          const [w, h] = [5 + Math.round(rand() * 400) / 10, 5 + Math.round(rand() * 400) / 10];
          const r = rand() < 0.5 ? Math.round(rand() * Math.min(w, h) * 4) / 10 : 0;
          drawing.push({ id, type: 'rect', a: c, b: roundPoint([c[0] + w, c[1] + h]), ...(r > 0 ? { r } : {}) });
        } else if (kind === 5) {
          const width = 2 + Math.round(rand() * 80) / 10;
          drawing.push({
            id,
            type: 'slot',
            c,
            width,
            length: width + 1 + Math.round(rand() * 300) / 10,
            angle: Math.round(rand() * 360) - 180,
          });
        } else
          drawing.push({
            id,
            type: 'polygon',
            c,
            sides: 3 + Math.floor(rand() * 6),
            af: 5 + Math.round(rand() * 250) / 10,
            angle: Math.round(rand() * 60),
          });
      }
      const all = drawingPieces(drawing);
      if (!all.length) continue;
      const target = all[Math.floor(rand() * all.length)];
      const measure = measureOf(target.prim);
      const raw = measure.point(measure.length * (0.05 + 0.9 * rand()));
      const pick = trimPick({ entities: drawing, raw, tolerance: 0.01 });
      if (pick.type === 'none') continue;
      const result = trimCut({ entities: drawing, pick, nextId: 100 });
      trims += 1;
      const where = `drawing ${k}: ${JSON.stringify(drawing)} at ${raw}`;
      const touched = new Set([pick.id, ...result.added]);
      // No piece under TINY_MM among what the cut made or changed.
      for (const entity of result.entities.filter((e) => touched.has(e.id)))
        expect(lengthOf(entity), where).toBeGreaterThanOrEqual(TINY_MM);
      // Every new end is another piece's end (===) or within 1e-6 mm of another piece.
      const others = drawingPieces(result.entities).filter((p) => !touched.has(result.entities[p.index].id));
      for (const end of [pick.from?.point, pick.to?.point].filter(Boolean)) {
        const onEnd = others.some((p) => p.ends.some((e) => e[0] === end[0] && e[1] === end[1]));
        const onPiece = others.some((p) => distanceToPrimitive(end, p.prim) <= 1e-6);
        expect(onEnd || onPiece, where).toBe(true);
      }
      // The length less by what went, to 1e-6 of the whole.
      const before = total(drawing);
      const gone = result.removed.reduce((sum, e) => sum + lengthOf(e), 0);
      expect(Math.abs(before - gone - total(result.entities)) / before, where).toBeLessThan(1e-6);
      // Every entity not touched is the same object.
      for (const entity of drawing.filter((e) => e.id !== pick.id))
        expect(
          result.entities.find((e) => e.id === entity.id),
          where,
        ).toBe(entity);
    }
    expect(trims).toBeGreaterThan(250);
  });
});

describe('Extend', () => {
  const wall = line('e2', [100, -50], [100, 50]);
  it('runs a line to a line, a circle and an arc, its id kept; the run previewed with its length', () => {
    const short = line('e1', [0, 0], [60, 0]);
    for (const [cutter, to] of [
      [wall, [100, 0]],
      [circle('e2', [120, 0], 10), [110, 0]],
      [arc('e2', [100, -30], [70, 0], [100, 30]), [70, 0]],
    ]) {
      const pick = extendPick({ entities: [short, cutter], raw: [58, 0.2], tolerance: 1 });
      expect(pick).toMatchObject({ type: 'end', id: 'e1', end: 'b', from: [60, 0], to });
      const result = extendCut({ entities: [short, cutter], pick, nextId: 9 });
      expect(result.entities[0]).toEqual({ ...short, b: to });
      expect(result.entities[1]).toBe(cutter);
      expect(result.pieces).toEqual([{ type: 'line', a: [60, 0], b: to }]);
      expect(result.text).toBe(`click to extend ${to[0] - 60} mm`);
    }
    // The end nearer the cursor: the start runs back to a line behind it.
    const back = extendPick({ entities: [short, line('e2', [-20, -5], [-20, 5])], raw: [3, 0], tolerance: 1 });
    expect(back).toMatchObject({ end: 'a', to: [-20, 0] });
  });

  it('runs an arc round its own circle to the next piece, its middle the middle of the longer arc', () => {
    // A quarter R20 from (20, 0) to (0, 20), a line across the circle's left at x = −10.
    const quarter = arc('e1', [20, 0], [14.142136, 14.142136], [0, 20]);
    const pick = extendPick({ entities: [quarter, line('e2', [-10, -40], [-10, 40])], raw: [1, 19.9], tolerance: 1 });
    expect(pick.end).toBe('b');
    expect(pick.to[0]).toBe(-10);
    expect(pick.to[1]).toBeCloseTo(Math.sqrt(300), 5);
    const result = extendCut({ entities: [quarter, line('e2', [-10, -40], [-10, 40])], pick, nextId: 3 });
    const [after] = result.entities;
    expect(after.a).toBe(quarter.a);
    const g = arcGeometry(after.a, after.m, after.b);
    expect(g.radius).toBeCloseTo(20, 5);
    expect(g.sweep).toBeCloseTo((120 * Math.PI) / 180, 5);
    expect(result.pieces[0].type).toBe('arc');
    expect(pick.run).toBeCloseTo((30 * Math.PI * 20) / 180, 6);
  });

  it('lands on an end within 0.001 mm exactly, and says why it cannot', () => {
    const end = [100.0006, 0.0002];
    const pick = extendPick({
      entities: [line('e1', [0, 0], [60, 0]), line('e2', [100, 40], end)],
      raw: [59, 0],
      tolerance: 1,
    });
    expect(pick.to).toBe(end);
    const refusal = (entities, raw) => extendPick({ entities, raw, tolerance: 1 }).message;
    expect(refusal([line('e1', [0, 0], [60, 0])], [59, 0])).toBe('Nothing ahead of this end to extend to.');
    expect(refusal([circle('e1', [0, 0], 10)], [10, 0])).toBe('A circle has no end to extend.');
    expect(refusal([{ id: 'e1', type: 'rect', a: [0, 0], b: [10, 5] }], [5, 0])).toBe(
      'A rectangle is closed: there is no end to extend.',
    );
    expect(refusal([{ id: 'e1', type: 'slot', c: [0, 0], length: 20, width: 4, angle: 0 }], [0, 2])).toBe(
      'A slot is closed: there is no end to extend.',
    );
    expect(refusal([arc('e1', [20, 0], [0, 20], [-20, 0])], [-19.9, 0.5])).toBe(
      'This arc meets only its own other end: there is nothing to extend it to.',
    );
    expect(refusal([], [0, 0])).toBe('Point near the end of a line or arc to extend it.');
  });
});

describe('the budget of §8.7 (node)', () => {
  it('a Trim hover (pick and cut, not memoised) on the cover sample in ≤ 3 ms', () => {
    const cover = samplePartEntities()[1].entities;
    const all = drawingPieces(cover);
    const points = Array.from({ length: 41 }, (_, i) => {
      const item = all[(i * 53) % all.length];
      const measure = measureOf(item.prim);
      return measure.point(measure.length * 0.37);
    });
    const hover = (i = 0) => {
      const pick = trimPick({ entities: cover, raw: points[i % points.length], tolerance: 0.5 });
      return pick.type === 'none' ? null : trimCut({ entities: cover, pick, nextId: 3000 });
    };
    expect(points.filter((_, i) => hover(i)).length).toBe(41);
    let timing;
    for (let round = 0; round < 5 && !(timing?.median <= 3); round++) timing = timeRuns(hover, 41);
    console.warn(
      `HD-4 budget: a Trim hover on the cover ${timing.median.toFixed(2)} ms (worst ${timing.worst.toFixed(1)})`,
    );
    expect(timing.median).toBeLessThanOrEqual(3);
  });
});

describe('the pure modules of HD-4', () => {
  it('sketchTrim.js, sketchCorner.js, sketchOffset.js and sketchHelp.js: pure, LF', () => {
    for (const [name, allowed] of [
      ['sketchTrim.js', ['./sketchProfile.js', './sketchIntersect.js', './sketchCheck.js']],
      ['sketchCorner.js', ['./sketchProfile.js', './sketchCheck.js', './sketchTrim.js']],
      ['sketchOffset.js', ['./sketchProfile.js', './sketchIntersect.js', './sketchTrim.js']],
      ['sketchHelp.js', []],
    ]) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
      expect(
        [...source.matchAll(/^import [^;]* from '([^']+)';/gm)].map((m) => m[1]),
        name,
      ).toEqual(allowed);
      expect(source, name).not.toMatch(/\b(document|window|navigator)\./);
      expect(source, name).not.toContain('\r\n');
    }
    expect(primitiveOf({ type: 'arc', a: [0, 0], m: [1, 1], b: [2, 2] })).toBe(null);
  });
});
