// The sketcher's Relief tool as a reducer (docs/sketch-studio-bend-relief.md
// §3.2): hover previews, a click cuts and the tool stays on, a refused click
// changes nothing, Undo last puts the outline back (after a relief, after a
// relief then a line, after a rectangle was split), Esc, typed sizes and the
// readout's words.
import { describe, expect, it } from 'vitest';
import {
  SKETCH_TOOLS,
  createSketchState,
  mergeRelief,
  previewEntities,
  reliefReadout,
  sketchFields,
  sketchReducer,
} from './sketchTools.js';

const run = (state, ...actions) => actions.reduce(sketchReducer, state);
const chain = (points) =>
  points.map((p, i) => ({ id: `e${i + 1}`, type: 'line', a: p, b: points[(i + 1) % points.length] }));
// The cross blank: base 200 × 100, flaps 20 (inside corners at the base's corners).
const CROSS = chain([
  [0, -20],
  [200, -20],
  [200, 0],
  [220, 0],
  [220, 100],
  [200, 100],
  [200, 120],
  [0, 120],
  [0, 100],
  [-20, 100],
  [-20, 0],
  [0, 0],
]);
const SHEET_12 = { sheet: { thickness: 1.2, stock: 'spcc' } };
const at = (type, point, raw = point) => ({ type, point, kind: 'endpoint', raw, tolerance: 1 });
const move = (...args) => at('move', ...args);
const click = (...args) => at('click', ...args);
const relieving = (entities = CROSS, relief = SHEET_12) =>
  sketchReducer(createSketchState(entities, {}, [], [], relief), { type: 'tool', tool: 'relief' });

describe('the Relief tool', () => {
  it('follows Dimension in the bar, with no HUD fields; it starts on Square for 1.5 mm SPCC', () => {
    expect(SKETCH_TOOLS.at(-1)).toEqual(['relief', 'Relief']);
    expect(SKETCH_TOOLS.at(-2)).toEqual(['dimension', 'Dimension']);
    expect(sketchFields(relieving())).toEqual([]);
    expect(createSketchState().relief).toEqual({
      shape: 'square',
      sizes: { diameter: null, size: null, width: null, depth: null },
      sheet: { thickness: 1.5, stock: 'spcc' },
    });
  });

  it('previews at the hovered corner, cuts on the click and stays on', () => {
    let state = relieving();
    expect(reliefReadout(state)).toBe(null);
    state = sketchReducer(state, move([0, 0], [0.2, 0.1]));
    expect(reliefReadout(state)).toEqual({ value: 'Square 4 × 4', note: 'click to cut · Esc ends the tool' });
    expect(previewEntities(state)).toEqual([
      { id: 'preview-1', type: 'line', a: [-2, 0], b: [-2, 2] },
      { id: 'preview-2', type: 'line', a: [-2, 2], b: [2, 2] },
      { id: 'preview-3', type: 'line', a: [2, 2], b: [2, -2] },
      { id: 'preview-4', type: 'line', a: [2, -2], b: [0, -2] },
    ]);
    // The preview leaves the drawing alone.
    expect(state.entities).toBe(CROSS);
    state = sketchReducer(state, click([0, 0], [0.2, 0.1]));
    expect(state.tool).toBe('relief');
    expect(state.entities).toHaveLength(16);
    expect(state.entities.find((e) => e.id === 'e11').b).toEqual([-2, 0]);
    expect(state.nextId).toBe(17);
    // HD-1: the cut is one history step (the outline before it), no longer an `added` record.
    expect(state.history.undo).toEqual([{ entities: CROSS, dimensions: [] }]);
    expect(state.message).toBe('');
    // Until the cursor moves the box says what was cut (the relief's own corners are under it now).
    expect(reliefReadout(state)).toEqual({
      value: 'Square 4 × 4 cut',
      note: 'Undo last takes it back · Esc ends the tool',
    });
    // Moved: what a click there would do now (the corner is cut away).
    expect(reliefReadout(sketchReducer(state, move([0, 0], [0.2, 0.1]))).value).toBe(
      'No inside corner here: move to the corner that needs the relief.',
    );
    expect(reliefReadout(sketchReducer(state, { type: 'undo' })).value).toBe('Square 4 × 4');
  });

  it('refuses a click away from a corner: the message, nothing changed', () => {
    const before = relieving();
    const state = sketchReducer(before, click([100, 50]));
    expect(state.message).toBe('No inside corner here: move to the corner that needs the relief.');
    expect(state.entities).toBe(before.entities);
    expect(state.history.undo).toEqual([]);
    expect(state.tool).toBe('relief');
    // The readout says it too, with no note, and nothing is previewed.
    const hover = sketchReducer(before, move([220, 0]));
    expect(reliefReadout(hover)).toEqual({
      value: 'An outside corner needs no relief: move to an inside corner.',
      note: '',
    });
    expect(previewEntities(hover)).toEqual([]);
  });

  it('Undo last after a relief puts the corner back as it was', () => {
    const state = run(relieving(), click([0, 0]), { type: 'undo' });
    expect(state.entities).toEqual(CROSS);
    expect(state.history.undo).toEqual([]);
  });

  it('Undo last after a relief, then a line: the line first, then the relief', () => {
    let state = run(
      relieving(),
      click([200, 100]),
      { type: 'tool', tool: 'line' },
      { type: 'click', point: [50, 50] },
      { type: 'click', point: [80, 50] },
    );
    expect(state.entities).toHaveLength(17);
    state = sketchReducer(state, { type: 'undo' });
    expect(state.entities).toHaveLength(16);
    expect(state.entities.some((e) => e.a[0] === 50 && e.a[1] === 50)).toBe(false);
    state = sketchReducer(state, { type: 'undo' });
    expect(state.entities).toEqual(CROSS);
  });

  it('Undo last after a rectangle was split: the rectangle comes back where it was', () => {
    const plate = [
      { id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] },
      { id: 'e2', type: 'circle', c: [50, 30], r: 10 },
    ];
    let state = run(relieving(plate), { type: 'relief', shape: 'rect' }, click([20, 0], [20, 0.2]));
    expect(state.entities.map((e) => e.type)).toEqual(Array(8).fill('line').concat('circle'));
    // Two reliefs on the split sides, then both undone.
    state = run(state, click([50, 60], [50, 59.8]));
    expect(state.entities).toHaveLength(13);
    state = run(state, { type: 'undo' }, { type: 'undo' });
    expect(state.entities).toEqual(plate);
  });

  it('Esc ends the tool; Enter does nothing', () => {
    const state = sketchReducer(relieving(), move([0, 0]));
    expect(sketchReducer(state, { type: 'enter' })).toBe(state);
    const ended = sketchReducer(state, { type: 'escape' });
    expect(ended.tool).toBe(null);
    expect(previewEntities(ended)).toEqual([]);
    expect(reliefReadout(ended)).toBe(null);
  });

  it('cuts with a typed size; a cleared size is automatic again', () => {
    let state = run(relieving(), { type: 'relief', sizes: { size: 3 } }, move([0, 0]));
    expect(reliefReadout(state).value).toBe('Square 3 × 3');
    state = run(state, { type: 'relief', sizes: { size: null } }, move([0, 0]));
    expect(reliefReadout(state).value).toBe('Square 4 × 4');
    // The sheet decides the automatic sizes; the shape changes what is cut.
    state = run(state, { type: 'relief', sheet: { thickness: 2 } }, move([0, 0]));
    expect(reliefReadout(state).value).toBe('Square 5.4 × 5.4');
    state = run(state, { type: 'relief', shape: 'round' }, move([0, 0]));
    expect(reliefReadout(state).value).toBe('Round Ø5.4');
    state = run(state, { type: 'relief', shape: 'obround', sheet: { thickness: 1.2 } }, move([0, 0], [-0.3, 0]));
    expect(reliefReadout(state).value).toBe('Obround 1.2 × 2.6');
    state = run(state, { type: 'relief', shape: 'rect', sizes: { width: 1.5 } }, move([0, 0], [-0.3, 0]));
    expect(reliefReadout(state).value).toBe('Rectangular 1.5 × 2');
    expect(state.entities).toBe(CROSS);
  });

  it('says what is wrong with a typed size or the sheet before the click', () => {
    let state = run(relieving(), { type: 'relief', sizes: { size: 0 } }, move([0, 0]));
    expect(reliefReadout(state)).toEqual({ value: 'The relief size must be a positive number.', note: '' });
    state = run(relieving(), { type: 'relief', sheet: { thickness: 0 } }, move([0, 0]));
    expect(reliefReadout(state).value).toBe('Type the sheet thickness: the automatic sizes come from it.');
    expect(sketchReducer(state, click([0, 0])).entities).toBe(CROSS);
  });

  it('merges settings: typed sizes kept per field, the sheet per key', () => {
    const relief = mergeRelief(
      { shape: 'round', sizes: { diameter: 5 }, sheet: { thickness: 1.2, stock: 'sus304' } },
      { sizes: { width: 2 }, sheet: { thickness: 2 } },
    );
    expect(relief).toEqual({
      shape: 'round',
      sizes: { diameter: 5, size: null, width: 2, depth: null },
      sheet: { thickness: 2, stock: 'sus304' },
    });
  });
});
