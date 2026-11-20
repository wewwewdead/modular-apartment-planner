// Pattern (docs/sketch-studio-hand-drawing.md §7.4, §7.6, §7.8): row, grid
// (staggered), circle at 360 and at 90, the guards and their words; and the
// budgets of §7.6 in node: a 15 × 24 staggered grid of one hexagon (360
// copies) and the drawing it makes, and moving 500 selected entities.
import { describe, expect, it } from 'vitest';
import {
  PATTERN_LIMIT,
  defaultPattern,
  patternEntities,
  patternRefusal,
  patternTransforms,
  patternWords,
  planPattern,
  withoutCopies,
} from './sketchPattern.js';
import { applyTo, transformEntities, translation } from './sketchTransform.js';
import { entitiesToProfile, entityPolyline } from './sketchProfile.js';
import { checkDrawing } from './sketchCheck.js';
import { boxSelect } from './sketchSelect.js';
import { createSketchState, sketchReducer } from './sketchTools.js';
import { timeRuns } from './vw400Samples.testkit.js';

const slot = { id: 'e2', type: 'slot', c: [20, 20], length: 22, width: 5, angle: 0 };
const hole = { id: 'e3', type: 'circle', c: [100, 0], r: 2.5 };
const pattern = (patch) => ({ ...defaultPattern(), ...patch });
const centres = (entities) => entities.map((e) => e.c);

describe('pattern counts and places', () => {
  it('a row: the count includes the original, each step from the last', () => {
    const { copies, leftOut } = planPattern([slot], ['e2'], pattern({ kind: 'row', count: 4, dx: 30, dy: 5 }));
    expect(leftOut).toBe(0);
    expect(centres(copies)).toEqual([
      [50, 25],
      [80, 30],
      [110, 35],
    ]);
    expect(copies[0]).toEqual({ type: 'slot', c: [50, 25], length: 22, width: 5, angle: 0 });
    expect(patternWords({ copies, leftOut })).toBe('adds 3');
  });

  it('a grid: columns across each row, rows upward, odd rows shifted half a column step with stagger', () => {
    const grid = pattern({ kind: 'grid', columns: 4, rows: 3, columnStep: 30, rowStep: 12 });
    expect(planPattern([slot], ['e2'], grid).copies).toHaveLength(11);
    const staggered = planPattern([slot], ['e2'], { ...grid, stagger: true }).copies;
    expect(centres(staggered).slice(0, 4)).toEqual([
      [50, 20],
      [80, 20],
      [110, 20],
      [35, 32], // row 1: + 15
    ]);
    expect(centres(staggered).slice(7, 8)).toEqual([[20, 44]]); // row 2: not shifted
    // 4 × 3 of two entities: 22 new shapes.
    expect(planPattern([slot, hole], ['e2', 'e3'], grid).copies).toHaveLength(22);
  });

  it('a circle: at 360 evenly round, the last never on the first; at 90 from 0 to 90, both ends included; the copies turn', () => {
    const round = pattern({ kind: 'circle', count: 6, total: 360, center: [0, 0] });
    const six = planPattern([hole], ['e3'], round).copies;
    expect(six).toHaveLength(5);
    expect(centres(six)).toEqual([
      [50, 86.60254],
      [-50, 86.60254],
      [-100, 0],
      [-50, -86.60254],
      [50, -86.60254],
    ]);
    const quarter = planPattern([hole], ['e3'], { ...round, count: 4, total: 90 }).copies;
    expect(centres(quarter)).toEqual([
      [86.60254, 50],
      [50, 86.60254],
      [0, 100],
    ]);
    // The centre unset: the zero.
    const aboutZero = patternTransforms(pattern({ kind: 'circle', count: 2, total: 360 }), [100, 50]);
    expect(applyTo(aboutZero[0], [100, 0])).toEqual([100, 100]);
    // A slot turns with the angle.
    const turned = planPattern([{ ...slot, c: [50, 0] }], ['e2'], { ...round, count: 4 }).copies;
    expect(turned.map((e) => e.angle)).toEqual([90, 180, -90]);
  });

  it('leaves out and counts copies that would lie on a shape already there; refuses a count under 1 and a zero step', () => {
    // A row of 4 at 30 mm over a drawing that already has a hole at the second place.
    const there = { id: 'e9', type: 'circle', c: [130, 0], r: 2.5 };
    const plan = planPattern([hole, there], ['e3'], pattern({ kind: 'row', count: 4, dx: 30, dy: 0 }));
    expect(centres(plan.copies)).toEqual([
      [160, 0],
      [190, 0],
    ]);
    expect(plan.leftOut).toBe(1);
    expect(patternWords(plan)).toBe('adds 2 · 1 left out: already there');
    // The same rule for copies among themselves and for Copy (withoutCopies).
    expect(withoutCopies([hole], [{ ...hole, id: 'x' }, { ...there }, { ...there, id: 'y' }])).toEqual({
      kept: [there],
      leftOut: 2,
    });
    expect(patternRefusal(pattern({ kind: 'row', count: 0 }))).toBe('The count is a whole number, 1 or more.');
    expect(patternRefusal(pattern({ kind: 'row', count: 2.5 }))).toBe('The count is a whole number, 1 or more.');
    expect(patternRefusal(pattern({ kind: 'row', count: 3, dx: 0, dy: 0 }))).toBe(
      'A step of zero puts the copies on the original: type a step.',
    );
    expect(patternRefusal(pattern({ kind: 'row', count: 1, dx: 0, dy: 0 }))).toBe('');
    expect(patternRefusal(pattern({ kind: 'grid', columns: 3, rows: 1, columnStep: 0 }))).toBe(
      'A step of zero puts the copies on the original: type a step.',
    );
    expect(patternRefusal(pattern({ kind: 'circle', count: 4, total: 0 }))).toBe(
      'The total angle is more than 0° and at most 360°.',
    );
    expect(patternWords(planPattern([hole], ['e3'], pattern({ kind: 'row', count: 1 })))).toBe('adds nothing');
    expect(planPattern([hole], ['e3'], pattern({ kind: 'row', count: 0 }))).toEqual({
      copies: [],
      leftOut: 0,
      refusal: 'The count is a whole number, 1 or more.',
    });
    // Applied: new ids after the last entity; nothing added keeps the very array.
    const applied = patternEntities([hole], ['e3'], pattern({ kind: 'row', count: 3, dx: 10, dy: 0 }), { nextId: 7 });
    expect(applied.added).toEqual(['e7', 'e8']);
    expect(applied.nextId).toBe(9);
    const none = [hole];
    expect(patternEntities(none, ['e3'], pattern({ kind: 'row', count: 1 })).entities).toBe(none);
    expect(PATTERN_LIMIT).toBe(2000);
  });
});

// The drawing of §7.6: an outline round a 15 × 24 staggered grid of one hexagon 8 across flats.
const outline = { id: 'e1', type: 'rect', a: [-10, -10], b: [165, 215], r: 5 };
const hexagon = { id: 'e2', type: 'polygon', c: [0, 0], sides: 6, af: 8, angle: 0 };
const hexGrid = pattern({ kind: 'grid', columns: 15, rows: 24, columnStep: 10, rowStep: 8.66, stagger: true });
// Up to five rounds of timings under the suite's load, stopping once inside the budget.
const within = (fn, budget, runs = 9) => {
  let timing;
  for (let round = 0; round < 5 && !(timing?.median <= budget); round++) timing = timeRuns(fn, runs);
  return timing;
};

describe('the budgets of §7.6 (node)', () => {
  it('patterns 360 hexagons in ≤ 20 ms; the drawing profiles in ≤ 30 ms, checks in ≤ 80 ms, box-selects in ≤ 2 ms', () => {
    const drawing = [outline, hexagon];
    const result = patternEntities(drawing, ['e2'], hexGrid, { nextId: 3 });
    expect(result.added).toHaveLength(359);
    expect(result.leftOut).toBe(0);
    const entities = result.entities;
    expect(entities.filter((e) => e.type === 'polygon')).toHaveLength(360);
    const pattern = within(() => patternEntities(drawing, ['e2'], hexGrid, { nextId: 3 }), 20);
    const profile = within(() => entitiesToProfile(entities), 30);
    const check = within(() => checkDrawing(entities), 80);
    const box = within(
      () =>
        boxSelect(
          entities,
          [
            [-1, -1],
            [80, 100],
          ],
          'inside',
        ),
      2,
      41,
    );
    expect(entitiesToProfile(entities)).toMatchObject({ closed: true, holes: 360 });
    expect(checkDrawing(entities).notes).toEqual(['Nothing to fix: a closed outline with 360 cut-outs.']);
    console.warn(
      `HD-3 budgets: patternEntities ${pattern.median.toFixed(2)} ms (worst ${pattern.worst.toFixed(1)}), ` +
        `entitiesToProfile ${profile.median.toFixed(2)} ms, checkDrawing ${check.median.toFixed(2)} ms, ` +
        `boxSelect ${box.median.toFixed(3)} ms (median)`,
    );
    expect(pattern.median).toBeLessThanOrEqual(20);
    expect(profile.median).toBeLessThanOrEqual(30);
    expect(check.median).toBeLessThanOrEqual(80);
    expect(box.median).toBeLessThanOrEqual(2);
  });

  it('moves 500 selected entities in ≤ 10 ms a step (a drag frame), and on the release', () => {
    const drawing = [outline, hexagon];
    const { entities } = patternEntities(
      drawing,
      ['e2'],
      pattern({ kind: 'grid', columns: 20, rows: 25, columnStep: 8, rowStep: 8 }),
      { nextId: 3 },
    );
    const ids = entities.filter((e) => e.type === 'polygon').map((e) => e.id);
    expect(ids).toHaveLength(500);
    let state = { ...createSketchState(entities), selectedIds: ids };
    // A drag frame: the reducer's drag step and the selection's polyline at the offset (what the overlay draws).
    const frame = (i) => {
      state = sketchReducer(state, { type: 'drag', grab: [0, 0], to: [i * 0.1, i * 0.05] });
      const [dx, dy] = [state.drag.to[0] - state.drag.grab[0], state.drag.to[1] - state.drag.grab[1]];
      let points = 0;
      for (const id of ids) {
        const entity = state.entities[Number(id.slice(1)) - 1];
        points += entityPolyline(entity).map(([u, v]) => [u + dx, v + dy]).length;
      }
      return points;
    };
    const step = within(frame, 10);
    // The release: the move itself, one history step.
    const release = within(() => transformEntities(entities, ids, translation(12.5, -3), { nextId: 600 }), 10);
    const end = sketchReducer(state, { type: 'drag-end' });
    expect(end.history.undo).toHaveLength(1);
    expect(end.entities.find((e) => e.id === ids[0]).c).toEqual([state.drag.to[0], state.drag.to[1]]);
    console.warn(
      `HD-3 budgets: a drag frame of 500 selected ${step.median.toFixed(2)} ms (worst ${step.worst.toFixed(1)}), ` +
        `the release ${release.median.toFixed(2)} ms`,
    );
    expect(step.median).toBeLessThanOrEqual(10);
    expect(release.median).toBeLessThanOrEqual(10);
  });
});
