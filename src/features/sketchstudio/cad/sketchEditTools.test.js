// HD-4 in the sketcher's reducer (docs/sketch-studio-hand-drawing.md §8.1,
// §8.5, §8.9): Trim, Extend, Fillet, Chamfer and Offset — each one's hover
// (preview, the red cut, the readout), the click, the tool staying on, Esc at
// each step, Undo / Redo as one step, a tool key in the middle of Offset, the
// dimension rules of §8.1; and a sketch stored before HD-4 opening and
// finishing byte for byte.
import { describe, expect, it } from 'vitest';
import {
  EDIT_TOOLS,
  SKETCH_KEYS,
  createSketchState,
  cutEntities,
  editHover,
  editReadout,
  previewEntities,
  sketchFields,
  sketchReducer,
} from './sketchTools.js';
import { editableEntities, sketchFromSession } from './sketchOperations.js';
import { entitiesToProfile } from './sketchProfile.js';

const run = (state, ...actions) => actions.reduce(sketchReducer, state);
// The cursor at `raw`, as the sketcher sends it (the snapped point the raw one here), 1 mm pick radius.
const move = (raw) => ({ type: 'move', point: raw, kind: 'free', raw, tolerance: 1 });
const click = (raw) => ({ type: 'click', point: raw, kind: 'free', raw, tolerance: 1 });
const tool = (name) => ({ type: 'tool', tool: name });
const line = (id, a, b) => ({ id, type: 'line', a, b });
// A 100 × 60 outline of lines with a plumb line across it at x = 40.
const OUTLINE = [
  line('e1', [0, 0], [100, 0]),
  line('e2', [100, 0], [100, 60]),
  line('e3', [100, 60], [0, 60]),
  line('e4', [0, 60], [0, 0]),
];
const ACROSS = line('e5', [40, -20], [40, 80]);

describe('the Edit tools', () => {
  it('are bar tools with keys T, E, F, H, O; no HUD boxes; Enter does nothing', () => {
    expect([...EDIT_TOOLS].map((name) => SKETCH_KEYS[name])).toEqual(['T', 'E', 'F', 'H', 'O']);
    for (const name of EDIT_TOOLS) {
      const state = run(createSketchState(OUTLINE), tool(name), move([50, 0.2]));
      expect(sketchFields(state)).toEqual([]);
      expect(run(state, { type: 'enter' })).toBe(state);
    }
  });
});

describe('Trim (T)', () => {
  it('previews the span red, says what a click does, cuts it as one step and stays on; Undo / Redo', () => {
    const start = createSketchState([...OUTLINE, ACROSS]);
    let state = run(start, tool('trim'), move([40, 70]));
    expect(editReadout(state)).toEqual({ value: 'Trim 20 mm', note: 'click to trim · Esc ends the tool' });
    expect(cutEntities(state)).toEqual([{ type: 'line', a: [40, 60], b: [40, 80] }]);
    // The same array while nothing changes (the overlay keeps its piece).
    expect(cutEntities(run(state, { type: 'typed', field: 'X', value: '' }))).toBe(cutEntities(state));
    expect(previewEntities(state)).toEqual([]);
    expect(state.entities).toBe(start.entities);
    state = run(state, click([40, 70]));
    expect(state.tool).toBe('trim');
    expect(state.entities.find((e) => e.id === 'e5')).toEqual(line('e5', [40, -20], [40, 60]));
    expect(state.history.undo).toHaveLength(1);
    expect(state.selectedIds).toEqual([]);
    expect(state.message).toBe('');
    // The stub below, then the outline's own bottom edge between x = 0 and 40.
    state = run(state, click([40, -10]), click([20, 0]));
    expect(state.history.undo).toHaveLength(3);
    expect(state.entities.find((e) => e.id === 'e1')).toEqual(line('e1', [40, 0], [100, 0]));
    const undone = run(state, { type: 'undo' });
    expect(undone.entities.find((e) => e.id === 'e1')).toEqual(OUTLINE[0]);
    expect(undone.tool).toBe('trim');
    expect(run(undone, { type: 'redo' }).entities).toBe(state.entities);
    // Esc ends the tool.
    expect(run(state, { type: 'escape' }).tool).toBe(null);
  });

  it('says when nothing crosses, refuses where there is nothing, and leaves the drawing as it was', () => {
    let state = run(createSketchState([line('e1', [0, 0], [50, 0])]), tool('trim'), move([20, 0.3]));
    expect(editReadout(state)).toEqual({
      value: 'Nothing crosses it: click removes the whole line',
      note: 'Esc ends the tool',
    });
    state = run(state, move([20, 30]));
    expect(editReadout(state)).toEqual({ value: 'Point at a line, arc or circle to trim.', note: '' });
    expect(cutEntities(state)).toEqual([]);
    const refused = run(state, click([20, 30]));
    expect(refused.entities).toBe(state.entities);
    expect(refused.history.undo).toHaveLength(0);
    expect(refused.message).toBe('Point at a line, arc or circle to trim.');
  });

  it('takes away a dimension hanging on what went that now lies on nothing; keeps every other', () => {
    const dimensions = [
      // On the trimmed part's end (40, 80): it goes.
      { id: 'd1', type: 'linear', from: [40, 80], to: [100, 60], orientation: 'horizontal', offset: 30 },
      // On the outline's corners: stays.
      { id: 'd2', type: 'linear', from: [0, 0], to: [100, 0], orientation: 'horizontal', offset: -10 },
      // On the cut point (40, 60), which the kept part still ends on: stays.
      { id: 'd3', type: 'linear', from: [40, 60], to: [0, 60], orientation: 'horizontal', offset: 10 },
    ];
    const state = run(createSketchState([...OUTLINE, ACROSS], {}, dimensions), tool('trim'), click([40, 70]));
    expect(state.dimensions.map((d) => d.id)).toEqual(['d2', 'd3']);
    expect(run(state, { type: 'undo' }).dimensions).toBe(dimensions);
  });
});

describe('Extend (E)', () => {
  it('previews the run with its length, extends on the click with the id kept, and the dimension on the end follows', () => {
    const short = line('e1', [0, 0], [60, 0]);
    const wall = line('e2', [100, -50], [100, 50]);
    const dimensions = [{ id: 'd1', type: 'linear', from: [0, 0], to: [60, 0], orientation: 'horizontal', offset: -5 }];
    let state = run(createSketchState([short, wall], {}, dimensions), tool('extend'), move([58, 0.2]));
    expect(editReadout(state)).toEqual({ value: 'click to extend 40 mm', note: 'Esc ends the tool' });
    expect(previewEntities(state)).toEqual([{ id: 'preview-1', type: 'line', a: [60, 0], b: [100, 0] }]);
    expect(cutEntities(state)).toEqual([]);
    state = run(state, click([58, 0.2]));
    expect(state.entities[0]).toEqual({ ...short, b: [100, 0] });
    expect(state.dimensions).toEqual([{ ...dimensions[0], to: [100, 0] }]);
    expect(state.tool).toBe('extend');
    expect(state.history.undo).toHaveLength(1);
    // Nothing ahead now: the refusal by the cursor, and a click changes nothing.
    state = run(state, move([98, 0.2]));
    expect(editReadout(state).value).toBe('Nothing ahead of this end to extend to.');
    expect(run(state, click([98, 0.2])).entities).toBe(state.entities);
    expect(run(state, { type: 'undo' }).entities[0]).toBe(short);
  });
});

describe('Fillet (F) and Chamfer (H)', () => {
  it('rounds a corner with the row’s radius, keeps every dimension, and stays on; the sizes are kept in `shapes`', () => {
    const dimensions = [
      { id: 'd1', type: 'linear', from: [0, 0], to: [100, 0], orientation: 'horizontal', offset: -10 },
    ];
    let state = run(createSketchState(OUTLINE, {}, dimensions), tool('fillet'), move([0.3, 0.4]));
    expect(state.shapes).toMatchObject({ fillet: 5, chamfer: 2, offset: 5 });
    expect(editReadout(state)).toEqual({ value: 'Fillet R5', note: 'click to round · Esc ends the tool' });
    expect(previewEntities(state)).toEqual([
      { id: 'preview-1', type: 'arc', a: [5, 0], b: [0, 5], m: [1.464466, 1.464466] },
    ]);
    expect(cutEntities(state)).toEqual([
      { type: 'line', a: [0, 0], b: [5, 0] },
      { type: 'line', a: [0, 0], b: [0, 5] },
    ]);
    state = run(state, { type: 'shapes', fillet: 8 }, move([0.3, 0.4]));
    expect(editReadout(state).value).toBe('Fillet R8');
    state = run(state, click([0.3, 0.4]));
    // The arc right after the first of its two lines (e1, then e4 last in the list).
    expect(state.entities.map((e) => e.id)).toEqual(['e1', 'e5', 'e2', 'e3', 'e4']);
    expect(state.entities[1]).toMatchObject({ type: 'arc', a: [8, 0], b: [0, 8] });
    expect(state.dimensions).toBe(dimensions);
    expect(state.tool).toBe('fillet');
    expect(entitiesToProfile(state.entities).closed).toBe(true);
    // One Undo step back, Redo again.
    const back = run(state, { type: 'undo' });
    expect(back.entities).toBe(OUTLINE);
    expect(back.tool).toBe('fillet');
    expect(run(back, { type: 'redo' }).entities).toBe(state.entities);
    // Too large: the refusal with its number, by the cursor and on a click.
    state = run(state, { type: 'shapes', fillet: 70 }, move([100, 0]));
    expect(editReadout(state)).toEqual({
      value: 'R70 does not fit here: at most R60 (the shorter line is 60 mm).',
      note: '',
    });
    expect(run(state, click([100, 0])).message).toBe('R70 does not fit here: at most R60 (the shorter line is 60 mm).');
    // Construction armed marks only what the Draw tools add.
    const armed = run(createSketchState(OUTLINE), { type: 'construction' }, tool('fillet'), click([100, 60]));
    expect(armed.entities.at(-1).construction).toBeUndefined();
  });

  it('tells a rectangle’s corner (the row says its own Radius does all four)', () => {
    const state = run(
      createSketchState([{ id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] }]),
      tool('fillet'),
      move([99.7, 59.6]),
    );
    expect(editHover(state).pick.rect).toBe(true);
    expect(run(state, tool('chamfer'), move([99.7, 59.6]), click([99.7, 59.6])).entities).toHaveLength(5);
  });

  it('cuts a corner with the row’s distance', () => {
    let state = run(createSketchState(OUTLINE), tool('chamfer'), move([100, 60]));
    expect(editReadout(state)).toEqual({ value: 'Chamfer 2', note: 'click to cut the corner · Esc ends the tool' });
    state = run(state, click([100, 60]));
    expect(state.entities[2]).toEqual({ id: 'e5', type: 'line', a: [100, 58], b: [98, 60] });
    expect(state.entities[1].b).toEqual([100, 58]);
    expect(state.entities[3].a).toEqual([98, 60]);
  });
});

describe('Offset (O)', () => {
  const hole = { id: 'e5', type: 'circle', c: [50, 30], r: 10 };
  it('chooses the entity (no step), previews the copy on the cursor’s side, adds it as one step and goes back', () => {
    let state = run(createSketchState([...OUTLINE, hole]), tool('offset'), move([60, 30]));
    expect(editReadout(state)).toEqual({ value: 'Offset 5 mm', note: 'click to choose it · Esc ends the tool' });
    expect(previewEntities(state)).toEqual([{ id: 'preview-1', type: 'circle', c: [50, 30], r: 10 }]);
    state = run(state, click([60, 30]));
    expect(state.offsetFrom).toBe('e5');
    expect(state.history.undo).toHaveLength(0);
    state = run(state, move([75, 30]));
    expect(editReadout(state)).toEqual({
      value: 'Offset 5 mm outward',
      note: 'click to place the copy · Esc lets go of it',
    });
    expect(previewEntities(state)).toEqual([{ id: 'preview-1', type: 'circle', c: [50, 30], r: 15 }]);
    state = run(state, move([52, 30]));
    expect(editReadout(state).value).toBe('Offset 5 mm inward');
    state = run(state, click([52, 30]));
    expect(state.entities.at(-1)).toEqual({ id: 'e6', type: 'circle', c: [50, 30], r: 5 });
    expect(state.offsetFrom).toBe(null);
    expect(state.tool).toBe('offset');
    expect(state.history.undo).toHaveLength(1);
    expect(run(state, { type: 'undo' }).entities).toHaveLength(5);
    expect(run(state, { type: 'undo' }, { type: 'redo' }).entities).toBe(state.entities);
    // A refused side says why and adds nothing.
    state = run(state, { type: 'shapes', offset: 12 }, click([60, 30]), move([52, 30]));
    expect(editReadout(state).value).toBe('Offsetting inward by 12 leaves nothing of this Ø20 circle.');
    expect(run(state, click([52, 30])).entities).toBe(state.entities);
  });

  it('lets go of the chosen entity on every way out: Esc (then the tool), a tool key, Undo, Delete, select all, a Check row', () => {
    const chosen = run(createSketchState([...OUTLINE, hole]), tool('offset'), click([60, 30]));
    expect(chosen.offsetFrom).toBe('e5');
    const esc = run(chosen, { type: 'escape' });
    expect([esc.offsetFrom, esc.tool]).toEqual([null, 'offset']);
    expect(run(esc, { type: 'escape' }).tool).toBe(null);
    for (const action of [
      tool('trim'),
      tool('offset'),
      { type: 'undo' },
      { type: 'delete' },
      { type: 'select-all' },
      { type: 'select-ids', ids: ['e1'] },
    ])
      expect(run(chosen, action).offsetFrom, action.type).toBe(null);
  });
});

describe('a sketch stored before HD-4', () => {
  it('opens and finishes byte for byte as it was, the Edit tools turned on and off', () => {
    const stored = {
      id: 's1',
      name: 'Sketch 1',
      plane: 'XY',
      profile: null,
      entities: [
        { id: 'e1', type: 'rect', a: [0, 0], b: [100, 60], r: 5 },
        { id: 'e2', type: 'slot', c: [30, 30], length: 22, width: 5, angle: 0 },
        { id: 'e3', type: 'circle', c: [70, 30], r: 5 },
      ],
      primitives: [],
      constrained: false,
      dimensions: [{ id: 'd1', type: 'radial', mode: 'diameter', center: [70, 30], radius: 5, at: [80, 40] }],
    };
    stored.profile = entitiesToProfile(stored.entities).profile;
    const before = JSON.stringify(stored);
    let state = createSketchState(editableEntities(stored), {}, stored.dimensions);
    for (const name of EDIT_TOOLS) state = run(state, tool(name), move([70, 35]), { type: 'escape' });
    expect(state.entities).toBe(stored.entities);
    expect(state.dimensions).toBe(stored.dimensions);
    const { sketch } = sketchFromSession({
      session: {},
      entities: state.entities,
      existing: stored,
      name: 'Sketch 1',
      dimensions: state.dimensions,
    });
    expect(JSON.stringify(sketch)).toBe(before);
  });
});
