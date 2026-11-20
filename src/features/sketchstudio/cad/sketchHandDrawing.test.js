// HD-1 in the sketcher's reducer (docs/sketch-studio-hand-drawing.md §5.1,
// §5.3, §5.4): Shift-click, Esc on a selection, Ctrl+A, a box, Delete on
// five, an edit with its dimensions and its note, Construction on a selection
// and armed, the keys, and a stored sketch that finishes unchanged.
import { describe, expect, it } from 'vitest';
import {
  SKETCH_COMMAND_KEYS,
  constructionPressed,
  createSketchState,
  removeEntities,
  sketchCommand,
  sketchKey,
  sketchReducer,
} from './sketchTools.js';
import { entitiesToProfile } from './sketchProfile.js';

const run = (state, ...actions) => actions.reduce(sketchReducer, state);
const click = (point) => ({ type: 'click', point });
const plate = [
  { id: 'e1', type: 'rect', a: [0, 0], b: [200, 120] },
  ...[30, 65, 100, 135, 170].map((x, i) => ({ id: `e${i + 2}`, type: 'circle', c: [x, 60], r: 5 })),
];

describe('selection in the reducer', () => {
  it('adds and takes out with Shift-click; a plain click selects alone, nothing clears', () => {
    let state = run(createSketchState(plate), { type: 'select', id: 'e3' });
    expect(state.selectedIds).toEqual(['e3']);
    state = run(state, { type: 'select', id: 'e5', toggle: true }, { type: 'select', id: 'e2', toggle: true });
    expect(state.selectedIds).toEqual(['e2', 'e3', 'e5']);
    state = sketchReducer(state, { type: 'select', id: 'e3', toggle: true });
    expect(state.selectedIds).toEqual(['e2', 'e5']);
    // A Shift-click on nothing keeps the selection; a plain one on nothing clears it.
    expect(sketchReducer(state, { type: 'select', id: null, toggle: true })).toBe(state);
    expect(sketchReducer(state, { type: 'select', id: 'e4' }).selectedIds).toEqual(['e4']);
    expect(sketchReducer(state, { type: 'select', id: null }).selectedIds).toEqual([]);
    // The same selection again keeps its array (the overlay rebuilds the entity batch for a new one only).
    const empty = createSketchState(plate);
    expect(sketchReducer(empty, { type: 'select', id: null }).selectedIds).toBe(empty.selectedIds);
    expect(sketchReducer(state, { type: 'select', id: 'e2', toggle: true }).selectedIds).not.toBe(state.selectedIds);
    const again = run(state, { type: 'select', id: 'e4' });
    expect(sketchReducer(again, { type: 'select', id: 'e4' }).selectedIds).toBe(again.selectedIds);
    // A dimension is selected alone.
    const withDimension = sketchReducer(state, { type: 'select', dimensionId: 'd1' });
    expect(withDimension).toMatchObject({ selectedIds: [], selectedDimensionId: 'd1' });
  });

  it('clears the selection with Esc; with none and no tool Esc changes nothing (the sketcher then finishes)', () => {
    const state = run(
      createSketchState(plate),
      { type: 'select', id: 'e1' },
      { type: 'select', id: 'e2', toggle: true },
    );
    const cleared = sketchReducer(state, { type: 'escape' });
    expect(cleared).toMatchObject({ selectedIds: [], selectedDimensionId: null, tool: null });
    expect(cleared.entities).toBe(state.entities);
    const again = sketchReducer(cleared, { type: 'escape' });
    expect(again).toMatchObject({ selectedIds: [], tool: null, box: null });
    expect(again.entities).toBe(state.entities);
  });

  it('selects every entity with Ctrl+A, ending a tool and its half-drawn shape', () => {
    const state = run(createSketchState(plate), { type: 'tool', tool: 'line' }, click([5, 5]), { type: 'select-all' });
    expect(state.selectedIds).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);
    expect(state).toMatchObject({ tool: null, points: [], chainStart: null });
  });

  it('selects by a box on its release, added with Shift; Esc drops the box', () => {
    let state = sketchReducer(createSketchState(plate), {
      type: 'box',
      from: [20, 40],
      to: [110, 80],
      mode: 'inside',
      add: false,
    });
    expect(state.selectedIds).toEqual([]);
    expect(sketchReducer(state, { type: 'escape' }).box).toBe(null);
    state = sketchReducer(state, { type: 'box-end' });
    expect(state.selectedIds).toEqual(['e2', 'e3', 'e4']);
    expect(state.box).toBe(null);
    state = run(
      state,
      { type: 'box', from: [190, 50], to: [160, 58], mode: 'touching', add: true },
      { type: 'box-end' },
    );
    expect(state.selectedIds).toEqual(['e2', 'e3', 'e4', 'e6']);
    // A box is never history.
    expect(state.history.undo).toEqual([]);
  });

  it('deletes five in one step, and the tool switch clears the selection', () => {
    let state = run(createSketchState(plate), { type: 'box', from: [-1, 40], to: [201, 70], mode: 'inside' });
    state = run(state, { type: 'box-end' });
    expect(state.selectedIds).toHaveLength(5);
    state = sketchReducer(state, { type: 'delete' });
    expect(state.entities).toEqual([plate[0]]);
    expect(state.history.undo).toHaveLength(1);
    expect(state.selectedIds).toEqual([]);
    expect(run(state, { type: 'select', id: 'e1' }, { type: 'tool', tool: 'line' }).selectedIds).toEqual([]);
  });
  it('removes a selection with the dimensions that hung on it only (removeEntities)', () => {
    const dimensions = [
      { id: 'd1', type: 'radial', mode: 'diameter', center: [30, 60], radius: 5, at: [30, 80] },
      { id: 'd2', type: 'linear', from: [0, 0], to: [200, 0], orientation: 'horizontal', offset: -10 },
      { id: 'd3', type: 'linear', from: [30, 60], to: [65, 60], orientation: 'horizontal', offset: 20 },
    ];
    const { entities, dimensions: kept } = removeEntities(plate, dimensions, ['e3', 'e2']);
    expect(entities.map((e) => e.id)).toEqual(['e1', 'e4', 'e5', 'e6']);
    expect(kept).toEqual([dimensions[1]]);
    const same = removeEntities(plate, dimensions, ['nothing']);
    expect(same.entities).toBe(plate);
    expect(same.dimensions).toBe(dimensions);
  });
});

describe('editing in the reducer', () => {
  it('is one history step, the dimension on the circle following; a refusal is the message', () => {
    const dimension = { id: 'd1', type: 'radial', mode: 'diameter', center: [30, 60], radius: 5, at: [30, 80] };
    const start = createSketchState(plate, {}, [dimension]);
    let state = run(start, { type: 'select', id: 'e2' }, { type: 'edit', id: 'e2', patch: { diameter: 12 } });
    expect(state.entities[1]).toEqual({ id: 'e2', type: 'circle', c: [30, 60], r: 6 });
    expect(state.dimensions[0]).toMatchObject({ radius: 6, at: [30, 81] });
    expect(state.history.undo).toHaveLength(1);
    state = sketchReducer(state, { type: 'edit', id: 'e2', patch: { x: 50 } });
    expect(state.entities[1].c).toEqual([50, 60]);
    const back = run(state, { type: 'undo' }, { type: 'undo' });
    expect(back.entities).toBe(start.entities);
    expect(back.dimensions).toBe(start.dimensions);
    expect(back.selectedIds).toEqual(['e2']);
    const refused = sketchReducer(state, { type: 'edit', id: 'e2', patch: { diameter: 0 } });
    expect(refused.message).toBe('A circle needs a diameter greater than zero.');
    expect(refused.entities).toBe(state.entities);
    expect(refused.history).toBe(state.history);
    // The same number again: no step.
    expect(sketchReducer(state, { type: 'edit', id: 'e2', patch: { x: 50 } })).toBe(state);
  });

  it('says so when a joined end moved alone opens the outline', () => {
    const triangle = [
      { id: 'e1', type: 'line', a: [0, 0], b: [100, 0] },
      { id: 'e2', type: 'line', a: [100, 0], b: [0, 80] },
      { id: 'e3', type: 'line', a: [0, 80], b: [0, 0] },
    ];
    expect(entitiesToProfile(triangle).closed).toBe(true);
    const state = sketchReducer(createSketchState(triangle), { type: 'edit', id: 'e1', patch: { x2: 120 } });
    expect(state.entities[1]).toBe(triangle[1]);
    expect(state.message).toBe('This end joins 1 other: it stays.');
    expect(entitiesToProfile(state.entities).closed).toBe(false);
    // Its Length the same way; an end joining nothing says nothing.
    const free = [{ id: 'e1', type: 'line', a: [0, 0], b: [10, 0] }];
    expect(sketchReducer(createSketchState(free), { type: 'edit', id: 'e1', patch: { length: 20 } }).message).toBe('');
  });
});

describe('Construction', () => {
  it('flips a selection in one step: all on, then all off', () => {
    let state = run(createSketchState(plate), { type: 'select', id: 'e2' }, { type: 'select', id: 'e3', toggle: true });
    expect(constructionPressed(state)).toBe(false);
    state = sketchReducer(state, { type: 'construction' });
    expect(state.entities.filter((e) => e.construction).map((e) => e.id)).toEqual(['e2', 'e3']);
    expect(state.history.undo).toHaveLength(1);
    expect(constructionPressed(state)).toBe(true);
    expect(state.construction).toBe(false);
    // The profile leaves them out: two holes fewer.
    expect(entitiesToProfile(state.entities).holes).toBe(3);
    state = sketchReducer(state, { type: 'construction' });
    expect(state.entities.some((e) => e.construction)).toBe(false);
    expect(state.entities).toEqual(plate);
  });

  it('arms the Draw tools with no selection: a drawn line carries the flag, the profile ignores it', () => {
    let state = sketchReducer(createSketchState(plate), { type: 'construction' });
    expect(state.construction).toBe(true);
    expect(constructionPressed(state)).toBe(true);
    expect(state.history.undo).toEqual([]);
    state = run(state, { type: 'tool', tool: 'line' }, click([0, 60]), click([200, 60]));
    expect(state.entities.at(-1)).toEqual({ id: 'e7', type: 'line', a: [0, 60], b: [200, 60], construction: true });
    expect(constructionPressed(state)).toBe(true);
    const profile = entitiesToProfile(state.entities);
    expect(profile.closed).toBe(true);
    expect(profile.problems).toEqual([]);
    expect(profile.holes).toBe(5);
    // Off again: the next line is drawn.
    state = run(state, { type: 'finish-chain' }, { type: 'construction' }, click([0, 10]), click([10, 10]));
    expect(state.entities.at(-1).construction).toBeUndefined();
    // Relief and Dimension are not Draw tools: nothing they make is marked.
    expect(run(createSketchState(), { type: 'construction' }, { type: 'tool', tool: 'dimension' }).construction).toBe(
      true,
    );
  });
});

describe('the keys of HD-1', () => {
  it('reads Ctrl+Y, Ctrl+Shift+Z (and Meta) as Redo, Ctrl+A as select all, X as Construction', () => {
    expect(SKETCH_COMMAND_KEYS).toEqual({
      redo: ['Ctrl+Y', 'Ctrl+Shift+Z'],
      'select-all': ['Ctrl+A'],
      construction: ['X'],
      // HD-2's Zero (docs/sketch-studio-hand-drawing.md §6.1).
      zero: ['Z'],
      // HD-3's actions on a selection (§7.3).
      move: ['M'],
      copy: ['K'],
      rotate: ['Q'],
      mirror: ['I'],
      pattern: ['G'],
    });
    expect(sketchCommand({ key: 'y', ctrlKey: true })).toBe('redo');
    expect(sketchCommand({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(sketchCommand({ key: 'z', metaKey: true, shiftKey: true, repeat: true })).toBe('redo');
    expect(sketchCommand({ key: 'a', ctrlKey: true })).toBe('select-all');
    expect(sketchCommand({ key: 'x' })).toBe('construction');
    expect(sketchCommand({ key: 'X' })).toBe('construction');
    for (const event of [
      { key: 'x', repeat: true },
      { key: 'x', ctrlKey: true },
      { key: 'X', shiftKey: true },
      { key: 'x', altKey: true },
      { key: 'y' },
      { key: 'z', ctrlKey: true },
    ])
      expect(sketchCommand(event), JSON.stringify(event)).toBe(null);
    // Undo last stays sketchKey's.
    expect(sketchKey({ key: 'z', ctrlKey: true })).toBe('undo');
  });
});

describe('a sketch stored before HD-1', () => {
  it('opens with nothing selected or undoable, and finishes with its entities and dimensions unchanged', () => {
    const stored = [
      { id: 'e1', type: 'line', a: [0, 0], b: [100, 0] },
      { id: 'e2', type: 'line', a: [100, 0], b: [100, 50] },
      { id: 'e3', type: 'line', a: [100, 50], b: [0, 0] },
      { id: 'e4', type: 'circle', c: [70, 15], r: 4 },
    ];
    const dimensions = [
      { id: 'd2', type: 'linear', from: [0, 0], to: [100, 0], orientation: 'horizontal', offset: -10 },
    ];
    const state = createSketchState(stored, {}, dimensions);
    expect(state).toMatchObject({ selectedIds: [], construction: false, box: null, history: { undo: [], redo: [] } });
    // Looking around changes nothing.
    const looked = run(state, { type: 'move', point: [3, 3] }, { type: 'select', id: 'e4' }, { type: 'escape' });
    expect(looked.entities).toBe(stored);
    expect(looked.dimensions).toBe(dimensions);
  });
});
