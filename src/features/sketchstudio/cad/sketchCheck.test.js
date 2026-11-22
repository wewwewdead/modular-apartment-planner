// Check (docs/sketch-studio-hand-drawing.md §6.4, §6.7): each kind found and
// worded, each fix applied (and undone as one step in the reducer), agreement
// with entitiesToProfile over random drawings, the three fixture parts clean
// and inside the budget.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLOSE_MM, applyFix, checkDrawing } from './sketchCheck.js';
import { entitiesToProfile } from './sketchProfile.js';
import { createSketchState, removeEntities, sketchReducer } from './sketchTools.js';
import { samplePartEntities, timeRuns } from './vw400Samples.testkit.js';

let next = 0;
const line = (a, b, extra = {}) => ({ id: `e${++next}`, type: 'line', a, b, ...extra });
const circle = (c, r, extra = {}) => ({ id: `e${++next}`, type: 'circle', c, r, ...extra });
const rect = (a, b) => ({ id: `e${++next}`, type: 'rect', a, b });
const arc = (a, m, b) => ({ id: `e${++next}`, type: 'arc', a, m, b });
const poly = (points, closed = true) =>
  (closed ? points : points.slice(0, -1)).map((p, i) => line(p, points[(i + 1) % points.length]));
const kinds = (result) => result.problems.map((p) => p.kind);
const texts = (result) => result.problems.map((p) => p.text);

// An L outline drawn with Line whose last end stops 0.3 mm short of its start.
const gapped = () => {
  next = 0;
  return [
    ...poly(
      [
        [0, 0],
        [100, 0],
        [100, 40],
        [40, 40],
        [40, 80],
        [0, 80],
      ],
      false,
    ),
    line([0, 80], [0, 0.3]),
  ];
};

describe('open ends', () => {
  it('finds a 0.3 mm gap as one problem, and Close it moves the later end onto the start', () => {
    const drawing = gapped();
    expect(entitiesToProfile(drawing).closed).toBe(false);
    const result = checkDrawing(drawing);
    expect(result.problems).toEqual([
      {
        id: 'open-end:e6:b',
        kind: 'open-end',
        text: 'Open end at (0, 0.3): 0.3 mm from the nearest other end',
        at: [0, 0.3],
        points: [
          [0, 0.3],
          [0, 0],
        ],
        entityIds: ['e6', 'e1'],
        fix: { label: 'Close it', kind: 'close', id: 'e6', end: 'b', to: [0, 0] },
      },
    ]);
    const fixed = applyFix(drawing, [], result.problems[0]);
    expect(fixed.entities[5]).toEqual({ id: 'e6', type: 'line', a: [0, 80], b: [0, 0] });
    expect(fixed.entities.slice(0, 5)).toEqual(drawing.slice(0, 5));
    expect(entitiesToProfile(fixed.entities).closed).toBe(true);
    expect(checkDrawing(fixed.entities)).toEqual({
      problems: [],
      notes: ['Nothing to fix: a closed outline with no cut-outs.'],
    });
  });

  it('gives no fix from 0.5 mm, and says when no other end is within 5 mm', () => {
    next = 0;
    const wide = [
      ...poly(
        [
          [0, 0],
          [100, 0],
          [100, 50],
          [0, 50],
        ],
        false,
      ),
      line([0, 50], [0, CLOSE_MM]),
    ];
    expect(checkDrawing(wide).problems).toMatchObject([
      { kind: 'open-end', text: 'Open end at (0, 0.5): 0.5 mm from the nearest other end' },
    ]);
    expect(checkDrawing(wide).problems[0].fix).toBeUndefined();
    next = 0;
    expect(texts(checkDrawing([line([0, 0], [10, 0])]))).toEqual([
      'Open end at (0, 0): no other end within 5 mm',
      'Open end at (10, 0): no other end within 5 mm',
    ]);
  });

  it('measures an end left near a corner of the outline to that corner', () => {
    next = 0;
    const drawing = [
      rect([0, 0], [100, 50]),
      ...poly([
        [0, 0],
        [100, 0],
        [100, 50],
        [0, 50],
      ]),
      line([20, 20], [99.8, 49.9]),
    ];
    const ends = checkDrawing(drawing).problems.filter((p) => p.kind === 'open-end');
    expect(ends.map((p) => p.text)).toEqual([
      'Open end at (20, 20): no other end within 5 mm',
      'Open end at (99.8, 49.9): 0.224 mm from the nearest other end',
    ]);
    expect(ends[1].fix).toEqual({ label: 'Close it', kind: 'close', id: 'e6', end: 'b', to: [100, 50] });
  });
});

describe('the other kinds', () => {
  it('finds three lines at one corner', () => {
    next = 0;
    const drawing = [
      ...poly([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]),
      line([10, 10], [20, 20]),
    ];
    expect(entitiesToProfile(drawing).closed).toBe(false);
    const result = checkDrawing(drawing);
    expect(kinds(result)).toEqual(['open-end', 'branch']);
    expect(result.problems[1]).toMatchObject({
      text: '3 lines meet at (10, 10): an outline corner joins two',
      entityIds: ['e2', 'e3', 'e5'],
    });
    expect(result.problems[1].fix).toBeUndefined();
  });

  it('finds copies either way round, and Remove the copy takes the later one', () => {
    next = 0;
    const drawing = [
      rect([0, 0], [100, 50]),
      circle([50, 25], 5),
      circle([50, 25], 5),
      line([10, 10], [20, 10], { construction: true }),
      line([20, 10], [10, 10], { construction: true }),
      rect([100, 50], [0, 0]),
    ];
    const result = checkDrawing(drawing);
    // The construction copies are no problem.
    expect(result.problems.map((p) => [p.kind, p.text, p.entityIds])).toEqual([
      ['duplicate', 'Two circles on the same place at (50, 25)', ['e2', 'e3']],
      ['duplicate', 'Two rectangles on the same place at (0, 0)', ['e1', 'e6']],
    ]);
    const fixed = applyFix(drawing, [], result.problems[0]);
    expect(fixed.entities.map((e) => e.id)).toEqual(['e1', 'e2', 'e4', 'e5', 'e6']);
    // Lines and arcs drawn the other way round are copies too.
    next = 0;
    const reversed = [
      line([0, 0], [10, 0]),
      line([10, 0], [0, 0]),
      arc([20, 0], [25, 5], [30, 0]),
      arc([30, 0], [25, 5], [20, 0]),
      arc([30, 0], [25, -5], [20, 0]),
    ];
    expect(
      checkDrawing(reversed)
        .problems.filter((p) => p.kind === 'duplicate')
        .map((p) => p.text),
    ).toEqual(['Two lines on the same place at (5, 0)', 'Two arcs on the same place at (25, 5)']);
  });

  it('finds two collinear lines sharing a stretch', () => {
    next = 0;
    const drawing = [
      ...poly([
        [0, 0],
        [100, 0],
        [100, 50],
        [0, 50],
      ]),
      line([20, 0], [32, 0]),
    ];
    const overlap = checkDrawing(drawing).problems.find((p) => p.kind === 'overlap');
    expect(overlap).toMatchObject({ text: 'Two lines overlap for 12 mm at (26, 0)', entityIds: ['e1', 'e5'] });
    expect(overlap.fix).toBeUndefined();
    // Touching end to end is no overlap.
    next = 0;
    expect(kinds(checkDrawing([line([0, 0], [10, 0]), line([10, 0], [20, 0])]))).toEqual(['open-end', 'open-end']);
  });

  it('finds a cut-out crossing the outline, two cut-outs crossing, and an open line crossing the outline', () => {
    next = 0;
    expect(texts(checkDrawing([rect([0, 0], [100, 50]), circle([100, 25], 10)]))).toEqual([
      'A cut-out crosses the outline at (100, 15)',
    ]);
    next = 0;
    const holes = checkDrawing([rect([0, 0], [100, 100]), circle([40, 50], 15), circle([60, 50], 15)]);
    expect(holes.problems).toMatchObject([
      { kind: 'crossing', text: 'Two cut-outs cross at (50, 61.18)', entityIds: ['e2', 'e3'] },
    ]);
    expect(holes.problems[0].points).toHaveLength(2);
    next = 0;
    const crossing = checkDrawing([rect([0, 0], [100, 50]), line([50, -10], [50, 60])]);
    expect(texts(crossing)).toEqual([
      'Open end at (50, -10): no other end within 5 mm',
      'Open end at (50, 60): no other end within 5 mm',
      'An open line crosses the outline at (50, 0)',
    ]);
    // Touching is not crossing, but since HD-4 (§8.0) a problem of its own: a hole sharing a side
    // with the outline, a circle tangent inside it.
    next = 0;
    const touching = [
      ...poly([
        [0, 0],
        [100, 0],
        [100, 60],
        [0, 60],
      ]),
      ...poly([
        [0, 20],
        [20, 20],
        [20, 40],
        [0, 40],
      ]),
      circle([80, 30], 20),
    ];
    expect(texts(checkDrawing(touching)).filter((text) => /cross|touch/.test(text))).toEqual([
      'A cut-out touches the outline at (100, 30)',
      'A cut-out touches the outline at (0, 20)',
    ]);
  });

  it('finds tiny pieces, and Remove it takes them out', () => {
    next = 0;
    const drawing = [rect([0, 0], [100, 50]), line([10, 10], [10.004, 10]), circle([50, 25], 0.002)];
    const result = checkDrawing(drawing);
    expect(texts(result)).toEqual([
      'Open end at (10, 10): no other end within 5 mm',
      'Open end at (10.004, 10): no other end within 5 mm',
      'A line 0.004 mm long at (10.002, 10)',
      'A circle Ø0.004 at (50, 25)',
    ]);
    const tiny = result.problems.filter((p) => p.kind === 'tiny');
    expect(tiny.map((p) => p.fix)).toEqual([
      { label: 'Remove it', kind: 'remove', id: 'e2' },
      { label: 'Remove it', kind: 'remove', id: 'e3' },
    ]);
    const fixed = tiny.reduce((list, problem) => applyFix(list, [], problem).entities, drawing);
    expect(checkDrawing(fixed).problems).toEqual([]);
  });

  it('finds a closed shape inside a cut-out', () => {
    next = 0;
    expect(checkDrawing([rect([0, 0], [100, 100]), circle([50, 50], 30), circle([50, 50], 10)]).problems).toMatchObject(
      [{ kind: 'nested', text: 'A shape inside a cut-out at (50, 50) is left out of the blank', entityIds: ['e3'] }],
    );
  });
});

describe('notes, the zero and construction', () => {
  it('notes separate outlines for the shop’s finish and the Sketch tab’s, and what a clean drawing is', () => {
    next = 0;
    const two = [rect([0, 0], [100, 100]), circle([50, 50], 10), rect([200, 0], [260, 40])];
    expect(checkDrawing(two).notes).toEqual([
      '2 separate outlines: Finish makes 2 sketches',
      'Nothing to fix: a closed outline with 1 cut-out.',
    ]);
    expect(checkDrawing(two, { split: false }).notes[0]).toBe(
      '2 separate outlines: one extrusion uses the largest; sketch the others separately',
    );
    expect(checkDrawing([]).notes).toEqual(['Nothing to fix: no outline drawn yet.']);
  });

  it('words X, Y from the zero (the points stay in sketch coordinates); construction is never a problem', () => {
    const drawing = gapped();
    const [problem] = checkDrawing(drawing, { zero: [40, 40] }).problems;
    expect(problem.text).toBe('Open end at (-40, -39.7): 0.3 mm from the nearest other end');
    expect(problem.at).toEqual([0, 0.3]);
    const marked = drawing.map((e) => ({ ...e, construction: true }));
    expect(checkDrawing(marked)).toEqual({ problems: [], notes: ['Nothing to fix: no outline drawn yet.'] });
  });
});

describe('fixes', () => {
  it('moves the dimensions on a closed end, prunes through removeEntities, and refuses a stale problem', () => {
    const drawing = gapped();
    const dimension = { id: 'd1', type: 'linear', from: [0, 80], to: [0, 0.3], orientation: 'vertical', offset: -10 };
    const [problem] = checkDrawing(drawing).problems;
    const fixed = applyFix(drawing, [dimension], problem);
    expect(fixed.dimensions).toEqual([{ ...dimension, to: [0, 0] }]);
    expect(() => applyFix(fixed.entities, fixed.dimensions, problem)).toThrow(
      'That problem is no longer in the drawing.',
    );
    expect(() => applyFix(drawing, [], { kind: 'branch' })).toThrow('This problem has no fix.');
    next = 0;
    const copies = [rect([0, 0], [100, 50]), circle([50, 25], 5), circle([50, 25], 5)];
    const radial = { id: 'd1', type: 'radial', mode: 'diameter', center: [50, 25], radius: 5, at: [50, 40] };
    const removed = applyFix(copies, [radial], checkDrawing(copies).problems[0], { remove: removeEntities });
    // The dimension hangs on the circle that stays.
    expect(removed.entities.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(removed.dimensions).toEqual([radial]);
  });

  it('is one Undo step in the reducer, and Redo applies it again', () => {
    const drawing = gapped();
    const start = createSketchState(drawing);
    const [problem] = checkDrawing(drawing).problems;
    const fixed = sketchReducer(start, { type: 'fix', problem });
    expect(entitiesToProfile(fixed.entities).closed).toBe(true);
    expect(fixed.history.undo).toHaveLength(1);
    const back = sketchReducer(fixed, { type: 'undo' });
    expect(back.entities).toBe(drawing);
    expect(sketchReducer(back, { type: 'redo' }).entities).toBe(fixed.entities);
    // A stale fix is the message, and nothing changes.
    const stale = sketchReducer(fixed, { type: 'fix', problem });
    expect(stale.entities).toBe(fixed.entities);
    expect(stale.message).toBe('That problem is no longer in the drawing.');
  });

  it('leaves a sound selection: a dimension it took away is let go, an action left with nothing ends', () => {
    next = 0;
    const drawing = [rect([0, 0], [100, 50]), circle([50, 25], 0.002), circle([20, 25], 5)];
    const onTiny = { id: 'd1', type: 'radial', mode: 'diameter', center: [50, 25], radius: 0.002, at: [50, 40] };
    const onHole = { id: 'd2', type: 'radial', mode: 'diameter', center: [20, 25], radius: 5, at: [20, 40] };
    const start = createSketchState(drawing, {}, [onTiny, onHole]);
    const problem = checkDrawing(drawing).problems.find((p) => p.kind === 'tiny');
    const run = (state, ...actions) => actions.reduce(sketchReducer, state);
    const click = (point) => ({ type: 'click', point });
    // The dimension on the tiny circle selected: Remove it takes both, and the selection with them.
    const fixed = run(start, { type: 'select', dimensionId: 'd1' }, { type: 'fix', problem });
    expect(fixed.dimensions).toEqual([onHole]);
    expect(fixed.selectedDimensionId).toBe(null);
    // One the fix leaves stays selected.
    expect(run(start, { type: 'select', dimensionId: 'd2' }, { type: 'fix', problem }).selectedDimensionId).toBe('d2');
    // Move on the tiny circle alone: the fix ends it, and the next click adds no step.
    const moving = run(start, { type: 'select', id: 'e2' }, { type: 'op', kind: 'move' }, click([50, 25]));
    const ended = sketchReducer(moving, { type: 'fix', problem });
    expect(ended).toMatchObject({ op: null, selectedIds: [] });
    expect(sketchReducer(ended, click([60, 25])).history.undo).toHaveLength(1);
    // Copy ends as Esc ends it: its copies that remain become the selection.
    const copying = run(
      start,
      { type: 'select', id: 'e2' },
      { type: 'op', kind: 'copy' },
      click([50, 25]),
      click([50, 45]),
    );
    expect(copying.op.copies).toEqual(['e4']);
    expect(sketchReducer(copying, { type: 'fix', problem })).toMatchObject({ op: null, selectedIds: ['e4'] });
    // With a selection left the action goes on.
    const both = run(
      start,
      { type: 'select', id: 'e2' },
      { type: 'select', id: 'e3', toggle: true },
      { type: 'op', kind: 'move' },
    );
    expect(sketchReducer(both, { type: 'fix', problem })).toMatchObject({
      op: { kind: 'move', step: 'base' },
      selectedIds: ['e3'],
    });
  });
});

describe('agreement with entitiesToProfile', () => {
  // A seeded generator: lines between points of a small integer grid (ends join
  // exactly, so branches and open chains are common), circles and rectangles.
  const random = (seed) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  it('has a located problem whenever the profile is open or branching (400 random drawings)', () => {
    const rand = random(20261120);
    const pick = (n) => Math.floor(rand() * n);
    let open = 0;
    for (let k = 0; k < 400; k++) {
      next = 0;
      const drawing = [];
      const count = 1 + pick(9);
      for (let i = 0; i < count; i++) {
        const shape = pick(10);
        const p = [pick(7) * 10, pick(7) * 10];
        if (shape < 7) drawing.push(line(p, [pick(7) * 10, pick(7) * 10]));
        else if (shape < 8) drawing.push(circle(p, 1 + pick(30)));
        else if (shape < 9) drawing.push(rect(p, [p[0] + 5 + pick(40), p[1] + 5 + pick(40)]));
        else drawing.push(arc(p, [p[0] + 5, p[1] + 5 + pick(5)], [p[0] + 10, p[1]]));
      }
      const profile = entitiesToProfile(drawing);
      const broken = profile.problems.some((text) => /open outline|Three or more lines/.test(text));
      if (!broken) continue;
      open += 1;
      const { problems } = checkDrawing(drawing);
      expect(problems.length, JSON.stringify(drawing)).toBeGreaterThan(0);
      for (const problem of problems) {
        expect(problem.at.every(Number.isFinite)).toBe(true);
        expect(problem.text).toMatch(/\(-?[\d.]+, -?[\d.]+\)/);
      }
      expect(problems.some((p) => p.kind === 'open-end' || p.kind === 'branch')).toBe(true);
    }
    expect(open).toBeGreaterThan(100);
  });

  it('finds the three fixture parts clean, the cover inside 150 ms', () => {
    const parts = samplePartEntities();
    expect(parts.map((p) => [p.name, p.entities.length, checkDrawing(p.entities)])).toEqual([
      ['BODY -01', 226, { problems: [], notes: ['Nothing to fix: a closed outline with 68 cut-outs.'] }],
      ['COVER -02', 2210, { problems: [], notes: ['Nothing to fix: a closed outline with 368 cut-outs.'] }],
      ['MOUNTING PLATE -03', 117, { problems: [], notes: ['Nothing to fix: a closed outline with 35 cut-outs.'] }],
    ]);
    const cover = parts[1].entities;
    // Wall clock: up to five runs of five under the suite's load, stopping once inside the budget.
    let timing;
    for (let run = 0; run < 5 && !(timing?.median <= 150); run++) timing = timeRuns(() => checkDrawing(cover), 5);
    console.warn(
      `checkDrawing on the cover: median ${timing.median.toFixed(1)} ms, worst ${timing.worst.toFixed(1)} ms`,
    );
    expect(timing.median).toBeLessThanOrEqual(150);
  });

  it('is pure: imports pure modules only, with LF line endings', () => {
    for (const [name, allowed] of [
      ['sketchCheck.js', ['./sketchProfile.js', './sketchIntersect.js', './sketchEdit.js', './sketchZero.js']],
      ['sketchZero.js', []],
    ]) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
      expect(
        [...source.matchAll(/^import [^;]* from '([^']+)';/gm)].map((m) => m[1]),
        name,
      ).toEqual(allowed);
      expect(source, name).not.toMatch(/\b(document|window|navigator)\./);
      expect(source, name).not.toContain('\r\n');
    }
  });
});

// HD-4 (docs/sketch-studio-hand-drawing.md §8.0 item 2): a loop crossing or
// touching itself, two loops touching at an end of a piece or a tangent.
describe('crossings of HD-4', () => {
  it('finds an outline and a cut-out crossing themselves, never where two pieces join', () => {
    next = 0;
    const bow = poly([
      [0, 0],
      [100, 100],
      [100, 0],
      [0, 100],
    ]);
    expect(checkDrawing(bow).problems).toMatchObject([
      { kind: 'crossing', text: 'The outline crosses itself at (50, 50)', entityIds: ['e1', 'e3'] },
    ]);
    next = 0;
    const holed = [
      rect([-50, -50], [150, 150]),
      ...poly([
        [10, 10],
        [40, 40],
        [40, 10],
        [10, 40],
      ]),
    ];
    expect(texts(checkDrawing(holed))).toEqual(['A cut-out crosses itself at (25, 25)']);
    // A loop of lines and tangent arcs (a rounded window), and one touching itself at a point.
    next = 0;
    const window = [
      line([5, 0], [95, 0]),
      arc([95, 0], [98.535534, 1.464466], [100, 5]),
      line([100, 5], [100, 55]),
      arc([100, 55], [98.535534, 58.535534], [95, 60]),
      line([95, 60], [5, 60]),
      arc([5, 60], [1.464466, 58.535534], [0, 55]),
      line([0, 55], [0, 5]),
      arc([0, 5], [1.464466, 1.464466], [5, 0]),
    ];
    expect(checkDrawing(window).problems).toEqual([]);
    next = 0;
    const pinched = poly([
      [0, 0],
      [100, 0],
      [100, 60],
      [50, 0.0],
      [0, 60],
    ]);
    // The fourth corner lies on the first side: touching, anywhere but at a join.
    expect(texts(checkDrawing(pinched)).filter((t) => /itself/.test(t))).toEqual([
      'The outline crosses itself at (50, 0)',
    ]);
  });

  it('finds a cut-out touching the outline at a corner, and two cut-outs touching (a tangent, a shared corner)', () => {
    next = 0;
    const diamond = [
      rect([0, 0], [100, 60]),
      ...poly([
        [50, 0],
        [60, 10],
        [50, 20],
        [40, 10],
      ]),
    ];
    expect(checkDrawing(diamond).problems).toMatchObject([
      { kind: 'crossing', text: 'A cut-out touches the outline at (50, 0)', entityIds: ['e1', 'e2'] },
    ]);
    next = 0;
    const tangent = [rect([0, 0], [100, 60]), circle([30, 30], 10), circle([50, 30], 10)];
    expect(texts(checkDrawing(tangent))).toEqual(['Two cut-outs touch at (40, 30)']);
    next = 0;
    const corners = [rect([0, 0], [100, 60]), rect([10, 10], [30, 30]), rect([30, 30], [50, 50])];
    expect(texts(checkDrawing(corners))).toEqual(['Two cut-outs touch at (30, 30)']);
    // Apart they are clean, as are copies (a copy is a duplicate, not a touch).
    next = 0;
    expect(checkDrawing([rect([0, 0], [100, 60]), circle([30, 30], 10), circle([51, 30], 10)]).problems).toEqual([]);
    next = 0;
    expect(kinds(checkDrawing([rect([0, 0], [100, 60]), rect([10, 10], [30, 30]), rect([10, 10], [30, 30])]))).toEqual([
      'duplicate',
    ]);
  });
});
