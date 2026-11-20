// Undo / Redo HD-1 (docs/sketch-studio-hand-drawing.md §5.2): the pure
// stacks, then the sketcher's reducer on them — undo and redo back to the very
// arrays drawn, redo cleared by a new action, a delete of three as one step,
// a relief, the cap, a half-drawn line, a reopened sketch.
import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, canRedo, canUndo, commit, emptyHistory, redo, undo } from './sketchHistory.js';
import { createSketchState, sketchReducer } from './sketchTools.js';

const run = (state, ...actions) => actions.reduce(sketchReducer, state);
const click = (point) => ({ type: 'click', point });
const drawing = (entities = [], dimensions = []) => ({ entities, dimensions, history: emptyHistory() });

describe('the history stacks', () => {
  it('push the drawing before an action, step back and forward by reference', () => {
    const start = drawing();
    const one = commit(start, { ...start, entities: [{ id: 'e1' }] });
    expect(one.history.undo).toEqual([{ entities: start.entities, dimensions: start.dimensions }]);
    expect(canUndo(one) && !canRedo(one)).toBe(true);
    const back = undo(one);
    expect(back.entities).toBe(start.entities);
    expect(back.history.redo[0].entities).toBe(one.entities);
    const again = redo(back);
    expect(again.entities).toBe(one.entities);
    expect(again.dimensions).toBe(one.dimensions);
    expect(canRedo(again)).toBe(false);
    expect(undo(start)).toBe(null);
    expect(redo(start)).toBe(null);
  });

  it('ignore an action that changed neither array, and clear redo on a new one', () => {
    const start = drawing([{ id: 'e1' }]);
    const same = { ...start, message: 'x' };
    expect(commit(start, same)).toBe(same);
    const one = commit(start, { ...start, entities: [] });
    const back = undo(one);
    const other = commit(back, { ...back, dimensions: [{ id: 'd1' }] });
    expect(other.history.redo).toEqual([]);
    expect(other.history.undo).toHaveLength(1);
  });

  it(`keeps at most ${HISTORY_LIMIT} steps, dropping the oldest`, () => {
    let state = drawing();
    const first = state.entities;
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) state = commit(state, { ...state, entities: [{ id: `e${i}` }] });
    expect(state.history.undo).toHaveLength(HISTORY_LIMIT);
    expect(state.history.undo[0].entities).not.toBe(first);
    expect(state.history.undo[0].entities).toEqual([{ id: 'e5' }]);
  });
});

describe('Undo last and Redo in the sketcher', () => {
  const lineAndCircle = (start = createSketchState()) =>
    run(
      start,
      { type: 'tool', tool: 'line' },
      click([0, 0]),
      click([100, 0]),
      { type: 'finish-chain' },
      { type: 'tool', tool: 'circle' },
      click([50, 50]),
      click([60, 50]),
    );

  it('steps a line and a circle back and forward to the very arrays drawn', () => {
    const empty = createSketchState();
    const withLine = run(empty, { type: 'tool', tool: 'line' }, click([0, 0]), click([100, 0]));
    const drawn = lineAndCircle(empty);
    expect(drawn.entities.map((e) => e.type)).toEqual(['line', 'circle']);
    const once = sketchReducer(drawn, { type: 'undo' });
    expect(once.entities).toEqual(withLine.entities);
    const twice = sketchReducer(once, { type: 'undo' });
    expect(twice.entities).toBe(empty.entities);
    expect(twice.tool).toBe('circle');
    const back = run(twice, { type: 'redo' }, { type: 'redo' });
    expect(back.entities).toBe(drawn.entities);
    expect(back.dimensions).toBe(drawn.dimensions);
    expect(sketchReducer(back, { type: 'redo' })).toBe(back);
    // Ids are never reused: the next entity after the undos is e3.
    const after = run(twice, click([0, 0]), click([5, 0]));
    expect(after.entities.map((e) => e.id)).toEqual(['e3']);
  });

  it('clears redo with a new action after an undo', () => {
    let state = sketchReducer(lineAndCircle(), { type: 'undo' });
    expect(canRedo(state)).toBe(true);
    state = run(state, click([200, 200]), click([210, 200]));
    expect(canRedo(state)).toBe(false);
    expect(sketchReducer(state, { type: 'redo' })).toBe(state);
  });

  it('deletes three in one step; undo brings all three back in place with their dimensions', () => {
    const entities = [
      { id: 'e1', type: 'rect', a: [0, 0], b: [200, 100] },
      { id: 'e2', type: 'circle', c: [50, 50], r: 10 },
      { id: 'e3', type: 'circle', c: [100, 50], r: 10 },
      { id: 'e4', type: 'circle', c: [150, 50], r: 10 },
    ];
    const dimensions = [
      { id: 'd1', type: 'radial', mode: 'diameter', center: [100, 50], radius: 10, at: [120, 80] },
      { id: 'd2', type: 'linear', from: [50, 50], to: [150, 50], orientation: 'horizontal', offset: 30 },
      { id: 'd3', type: 'linear', from: [0, 100], to: [200, 100], orientation: 'horizontal', offset: 20 },
    ];
    const start = createSketchState(entities, {}, dimensions);
    let state = run(start, { type: 'select', id: 'e2' }, { type: 'select', id: 'e3', toggle: true });
    state = run(state, { type: 'select', id: 'e4', toggle: true }, { type: 'delete' });
    expect(state.entities.map((e) => e.id)).toEqual(['e1']);
    expect(state.dimensions.map((d) => d.id)).toEqual(['d3']);
    expect(state.history.undo).toHaveLength(1);
    state = sketchReducer(state, { type: 'undo' });
    expect(state.entities).toBe(entities);
    expect(state.dimensions).toBe(dimensions);
    // The selection was emptied by the delete: nothing comes back selected.
    expect(state.selectedIds).toEqual([]);
  });

  it('takes a relief back and puts it again', () => {
    const plate = [{ id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] }];
    const at = (type, point, raw = point) => ({ type, point, kind: 'endpoint', raw, tolerance: 1 });
    let state = run(
      createSketchState(plate, {}, [], [], { sheet: { thickness: 1.2, stock: 'spcc' } }),
      { type: 'tool', tool: 'relief' },
      { type: 'relief', shape: 'rect' },
      at('click', [20, 0], [20, 0.2]),
    );
    const cut = state.entities;
    expect(cut).toHaveLength(8);
    state = sketchReducer(state, { type: 'undo' });
    expect(state.entities).toBe(plate);
    expect(state.tool).toBe('relief');
    state = sketchReducer(state, { type: 'redo' });
    expect(state.entities).toBe(cut);
  });

  it('drops a half-drawn line with the step before it, one step only', () => {
    let state = lineAndCircle();
    state = run(state, { type: 'tool', tool: 'line' }, click([300, 300]));
    expect(state.points).toEqual([[300, 300]]);
    state = sketchReducer(state, { type: 'undo' });
    expect(state.points).toEqual([]);
    expect(state.chainStart).toBe(null);
    expect(state.entities.map((e) => e.type)).toEqual(['line']);
    expect(state.tool).toBe('line');
    // With nothing to step back to, only the half-drawn shape goes.
    const lone = run(createSketchState(), { type: 'tool', tool: 'line' }, click([5, 5]));
    const dropped = sketchReducer(lone, { type: 'undo' });
    expect(dropped.points).toEqual([]);
    expect(dropped.entities).toBe(lone.entities);
  });

  it('does nothing on a sketch just reopened', () => {
    const stored = [{ id: 'e1', type: 'rect', a: [0, 0], b: [10, 10] }];
    const state = createSketchState(stored, {}, []);
    expect(canUndo(state)).toBe(false);
    expect(sketchReducer(state, { type: 'undo' })).toBe(state);
    expect(sketchReducer(state, { type: 'redo' })).toBe(state);
  });

  it('keeps the tool, and of the selection what still exists', () => {
    const entities = [
      { id: 'e1', type: 'line', a: [0, 0], b: [10, 0] },
      { id: 'e2', type: 'line', a: [10, 0], b: [10, 10] },
    ];
    let state = run(createSketchState(entities), { type: 'select', id: 'e1' }, { type: 'construction' });
    state = run(state, { type: 'select', id: 'e2', toggle: true });
    expect(state.selectedIds).toEqual(['e1', 'e2']);
    const back = sketchReducer(state, { type: 'undo' });
    expect(back.entities).toBe(entities);
    expect(back.selectedIds).toBe(state.selectedIds);
    // A selection of what an undo removes is let go.
    const drawn = run(createSketchState(), { type: 'tool', tool: 'circle' }, click([0, 0]), click([5, 0]));
    const picked = run(drawn, { type: 'escape' }, { type: 'select', id: 'e1' });
    expect(sketchReducer(picked, { type: 'undo' }).selectedIds).toEqual([]);
  });
});
