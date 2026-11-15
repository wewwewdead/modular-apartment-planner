// The sketcher's Dimension tool as a reducer (docs/sketch-studio-sketch-
// dimensions.md §3.3): three clicks for two points, two for a line, circle or
// arc, each Esc of the table, the readout, select / delete, the pruning when
// an entity goes, and Undo last in mixed order and on a reopened sketch.
import { describe, expect, it } from 'vitest';
import {
  SKETCH_TOOLS,
  createSketchState,
  dimensionReadout,
  dimensionStep,
  finishRefusal,
  pendingDimension,
  previewEntities,
  sketchFields,
  sketchReducer,
} from './sketchTools.js';

const run = (state, ...actions) => actions.reduce(sketchReducer, state);
const rect = { id: 'e1', type: 'rect', a: [0, 0], b: [300, 200] };
const hole = { id: 'e2', type: 'circle', c: [50, 50], r: 10 };
// A snapped click / move: on a key point by default, or on an entity's body.
const at = (type, point, kind = 'endpoint', raw = point, extra = {}) => ({
  type,
  point,
  kind,
  raw,
  tolerance: 2,
  ...extra,
});
const click = (...args) => at('click', ...args);
const move = (...args) => at('move', ...args);
const dimensioning = (entities = [rect, hole], dimensions = []) =>
  sketchReducer(createSketchState(entities, {}, dimensions), { type: 'tool', tool: 'dimension' });

describe('the Dimension tool', () => {
  it('is the last sketch tool, with no HUD fields', () => {
    expect(SKETCH_TOOLS.at(-1)).toEqual(['dimension', 'Dimension']);
    expect(sketchFields(dimensioning())).toEqual([]);
  });

  it('keeps a linear dimension from three clicks: two points, then where it goes', () => {
    let state = run(dimensioning(), click([50, 50], 'center'));
    expect(dimensionStep(state)).toBe('second');
    // The hole centre to the plate's left side, read square to it.
    state = sketchReducer(state, move([0, 47], 'on sketch', [0.4, 47]));
    expect(dimensionReadout(state)).toEqual({ value: '50 mm · ΔX -50 · ΔY 0', note: '' });
    expect(previewEntities(state)).toEqual([{ id: 'preview', type: 'line', a: [50, 50], b: [0, 50] }]);
    state = sketchReducer(state, click([0, 47], 'on sketch', [0.4, 47]));
    expect(dimensionStep(state)).toBe('place');
    expect(state.points).toEqual([]);
    state = sketchReducer(state, move([25, 20], 'grid'));
    expect(dimensionReadout(state)).toEqual({ value: 'Horizontal 50 mm', note: 'click to keep · Esc drops it' });
    expect(pendingDimension(state).dimension).toMatchObject({ id: 'd1', orientation: 'horizontal', offset: -30 });
    state = sketchReducer(state, click([25, 20], 'grid'));
    expect(state.dimensions).toEqual([
      { id: 'd1', type: 'linear', from: [50, 50], to: [0, 50], orientation: 'horizontal', offset: -30 },
    ]);
    // The tool stays on, back at its first step; the drawing is untouched.
    expect(state.tool).toBe('dimension');
    expect(dimensionStep(state)).toBe('first');
    expect(state.entities).toEqual([rect, hole]);
    expect(state.nextDimensionId).toBe(2);
  });

  it('keeps an entity dimension from two clicks: the side, then where it goes', () => {
    let state = sketchReducer(dimensioning(), move([150, 200], 'on sketch', [150, 200.4]));
    expect(dimensionReadout(state)).toEqual({ value: 'Side 300 mm', note: '' });
    state = sketchReducer(state, click([150, 200], 'on sketch', [150, 200.4]));
    expect(dimensionStep(state)).toBe('place');
    state = run(state, move([150, 240], 'grid'), click([150, 240], 'grid'));
    expect(state.dimensions).toEqual([
      { id: 'd1', type: 'linear', from: [300, 200], to: [0, 200], orientation: 'horizontal', offset: 40 },
    ]);
    // Beside its height it would have been vertical; elsewhere aligned.
    const line = { id: 'e3', type: 'line', a: [400, 0], b: [500, 100] };
    state = run(dimensioning([line]), click([450, 50], 'on sketch', [450.3, 50]), move([600, 50], 'grid'));
    expect(dimensionReadout(state).value).toBe('Vertical 100 mm');
    state = sketchReducer(state, move([600, 300], 'grid'));
    expect(dimensionReadout(state).value).toBe('Aligned 141.42 mm');
  });

  it('keeps a radial dimension: the circle, then the label point', () => {
    let state = sketchReducer(dimensioning(), move([60, 50], 'on sketch', [60.3, 50]));
    expect(dimensionReadout(state).value).toBe('Ø20');
    state = run(state, click([60, 50], 'on sketch', [60.3, 50]), move([80, 90], 'grid'));
    expect(dimensionReadout(state)).toEqual({ value: 'Ø20', note: 'click to keep · Esc drops it' });
    state = sketchReducer(state, click([80, 90], 'grid'));
    expect(state.dimensions).toEqual([
      { id: 'd1', type: 'radial', mode: 'diameter', center: [50, 50], radius: 10, at: [80, 90] },
    ]);
  });

  it('steps back one Esc at a time: the place, then the first point, then the tool', () => {
    // Place → back to the first step, nothing added (the "just measure" use).
    let state = run(dimensioning(), click([0, 0]), click([300, 200]), move([400, 300], 'grid'));
    expect(dimensionReadout(state).value).toBe('Aligned 360.56 mm');
    state = sketchReducer(state, { type: 'escape' });
    expect(state).toMatchObject({ tool: 'dimension', pending: null, points: [], dimensions: [] });
    // An entity's place step goes straight back to the first step too.
    state = run(state, click([60, 50], 'on sketch', [60.3, 50]), { type: 'escape' });
    expect(state).toMatchObject({ tool: 'dimension', pending: null, points: [] });
    // Second → the first point clears.
    state = run(state, click([0, 0]), { type: 'escape' });
    expect(state).toMatchObject({ tool: 'dimension', points: [] });
    // First → the tool ends.
    state = sketchReducer(state, { type: 'escape' });
    expect(state.tool).toBe(null);
    expect(state.dimensions).toEqual([]);
  });

  it('does nothing on Enter, refuses the same point and a dimension it cannot place', () => {
    let state = run(dimensioning(), click([0, 0]));
    expect(sketchReducer(state, { type: 'enter' })).toBe(state);
    state = sketchReducer(state, click([0, 0]));
    expect(state.message).toBe('Pick a different point.');
    expect(dimensionStep(state)).toBe('second');
    // A pending span with no length (never offered by a pick) is refused at
    // the place click: the message shows and the step stays.
    const degenerate = { ...dimensioning(), pending: { type: 'span', from: [5, 5], to: [5, 5] } };
    const refused = sketchReducer(degenerate, click([20, 20], 'grid'));
    expect(refused.message).toMatch(/two different points/);
    expect(dimensionStep(refused)).toBe('place');
    expect(refused.dimensions).toEqual([]);
    expect(dimensionReadout({ ...degenerate, cursor: [20, 20] }).note).toBe('Esc drops it');
  });

  it('selects and deletes a dimension, one thing selected at a time', () => {
    const kept = { id: 'd4', type: 'linear', from: [0, 0], to: [300, 0], orientation: 'horizontal', offset: -20 };
    let state = run(createSketchState([rect], {}, [kept]), { type: 'select', id: 'e1' });
    expect(state).toMatchObject({ selectedId: 'e1', selectedDimensionId: null });
    state = sketchReducer(state, { type: 'select', dimensionId: 'd4' });
    expect(state).toMatchObject({ selectedId: null, selectedDimensionId: 'd4' });
    state = sketchReducer(state, { type: 'escape' });
    expect(state.selectedDimensionId).toBe(null);
    state = run(state, { type: 'select', dimensionId: 'd4' }, { type: 'delete' });
    expect(state.dimensions).toEqual([]);
    expect(state.entities).toEqual([rect]);
    expect(state.selectedDimensionId).toBe(null);
    // Ids continue after reopening.
    expect(createSketchState([], {}, [kept]).nextDimensionId).toBe(5);
  });

  it('prunes the dimensions an entity carried when it is deleted', () => {
    let state = run(
      dimensioning(),
      click([50, 50], 'center'),
      click([0, 47], 'on sketch', [0.4, 47]),
      click([25, 20], 'grid'),
      click([60, 50], 'on sketch', [60.3, 50]),
      click([80, 90], 'grid'),
      click([150, 200], 'on sketch', [150, 200.4]),
      click([150, 240], 'grid'),
      { type: 'escape' },
    );
    expect(state.dimensions.map((d) => d.id)).toEqual(['d1', 'd2', 'd3']);
    state = run(state, { type: 'select', id: 'e2' }, { type: 'delete' });
    expect(state.entities).toEqual([rect]);
    expect(state.dimensions.map((d) => d.id)).toEqual(['d3']);
  });

  it('undoes the last thing added, entity or dimension, in the order added', () => {
    let state = run(
      createSketchState(),
      { type: 'tool', tool: 'rect' },
      click([0, 0]),
      click([300, 200]),
      { type: 'tool', tool: 'dimension' },
      click([150, 200], 'on sketch', [150, 200.4]),
      click([150, 240], 'grid'),
      { type: 'tool', tool: 'circle' },
      click([50, 50]),
      click([60, 50]),
      { type: 'tool', tool: 'dimension' },
      click([60, 50], 'on sketch', [60.3, 50]),
      click([80, 90], 'grid'),
    );
    expect(state.entities.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(state.dimensions.map((d) => d.id)).toEqual(['d1', 'd2']);
    const undo = (s) => sketchReducer(s, { type: 'undo' });
    state = undo(state);
    expect([state.entities.length, state.dimensions.map((d) => d.id)]).toEqual([2, ['d1']]);
    state = undo(state);
    expect([state.entities.map((e) => e.id), state.dimensions.map((d) => d.id)]).toEqual([['e1'], ['d1']]);
    state = undo(state);
    expect([state.entities.map((e) => e.id), state.dimensions]).toEqual([['e1'], []]);
    state = undo(state);
    expect(state.entities).toEqual([]);
    expect(undo(state)).toBe(state);
  });

  it('undoes on a reopened sketch: the last entity, then the last dimension', () => {
    const free = { id: 'd1', type: 'linear', from: [-50, -50], to: [-50, 250], orientation: 'vertical', offset: -20 };
    let state = createSketchState([rect, hole], {}, [free]);
    state = sketchReducer(state, { type: 'undo' });
    expect(state.entities).toEqual([rect]);
    state = sketchReducer(state, { type: 'undo' });
    expect(state.entities).toEqual([]);
    expect(state.dimensions).toEqual([free]);
    state = sketchReducer(state, { type: 'undo' });
    expect(state.dimensions).toEqual([]);
    expect(sketchReducer(state, { type: 'undo' })).toBe(state);
  });

  it('refuses to finish dimensions with no drawing', () => {
    const free = { id: 'd1', type: 'linear', from: [0, 0], to: [100, 0], orientation: 'horizontal', offset: 10 };
    expect(finishRefusal(createSketchState([], {}, [free]))).toBe(
      'Dimensions are kept with a drawing: draw the outline first, or Cancel sketch to leave.',
    );
    expect(finishRefusal(createSketchState([rect], {}, [free]))).toBe('');
    expect(finishRefusal(createSketchState())).toBe('');
  });
});
