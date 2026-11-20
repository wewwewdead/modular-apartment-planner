// The HUD's boxes in the reducer (docs/sketch-studio-hand-drawing.md §6.2,
// §6.7): the table step by step, the pair rule both ways, Radius against
// Diameter, `@` on each box, on a first point after another tool's point,
// and refused with no point placed.
import { describe, expect, it } from 'vitest';
import {
  RELATIVE_REFUSAL,
  axisValue,
  createSketchState,
  derivedValues,
  previewEntities,
  sketchFields,
  sketchPairs,
  sketchReducer,
  typedPoint,
} from './sketchTools.js';

const run = (state, ...actions) => actions.reduce(sketchReducer, state);
const click = (point) => ({ type: 'click', point });
const move = (point) => ({ type: 'move', point });
const type = (values) =>
  Object.entries(values).map(([field, value]) => ({ type: 'typed', field, value: String(value) }));
const tool = (name) => ({ type: 'tool', tool: name });

describe('the table of §6.2', () => {
  it('asks X, Y for every first point, every arc point and Zero', () => {
    for (const name of ['line', 'rect', 'rect-center', 'circle', 'arc', 'zero'])
      expect(sketchPairs(run(createSketchState(), tool(name))), name).toEqual([['X', 'Y']]);
    let arc = run(createSketchState(), tool('arc'), click([0, 0]));
    expect(sketchFields(arc)).toEqual(['X', 'Y']);
    arc = sketchReducer(arc, click([20, 0]));
    expect(sketchFields(arc)).toEqual(['X', 'Y']);
    // The Dimension and Relief tools, and no tool, have none.
    for (const name of ['dimension', 'relief', null])
      expect(sketchFields(run(createSketchState(), tool(name)))).toEqual([]);
  });

  it('asks Length, Angle · X, Y for a line’s next point and Width, Height · X, Y for a second corner', () => {
    const line = run(createSketchState(), tool('line'), click([10, 10]));
    expect(sketchPairs(line)).toEqual([
      ['Length', 'Angle'],
      ['X', 'Y'],
    ]);
    expect(sketchFields(line)).toEqual(['Length', 'Angle', 'X', 'Y']);
    for (const name of ['rect', 'rect-center'])
      expect(sketchPairs(run(createSketchState(), tool(name), click([0, 0])))).toEqual([
        ['Width', 'Height'],
        ['X', 'Y'],
      ]);
    expect(sketchPairs(run(createSketchState(), tool('circle'), click([0, 0])))).toEqual([['Radius'], ['Diameter']]);
    // Tab runs through all four.
    let state = run(line, { type: 'field', index: 3 });
    expect(state.field).toBe(3);
    state = sketchReducer(state, { type: 'field', index: 4 });
    expect(state.field).toBe(0);
  });

  it('places a line’s next point by absolute X, Y, and a rectangle’s corner (a Center rectangle’s too)', () => {
    let state = run(createSketchState(), tool('line'), click([10, 10]), move([40, 20]), ...type({ X: 60, Y: 10 }));
    expect(typedPoint(state)).toEqual([60, 10]);
    state = sketchReducer(state, { type: 'enter' });
    expect(state.entities).toEqual([{ id: 'e1', type: 'line', a: [10, 10], b: [60, 10] }]);
    // X typed, Y left empty: Y is the cursor's.
    state = run(state, move([70, 33]), ...type({ X: 60 }), { type: 'enter' });
    expect(state.entities[1]).toMatchObject({ a: [60, 10], b: [60, 33] });
    const rect = run(createSketchState(), tool('rect'), click([0, 0]), move([5, 5]), ...type({ X: 120, Y: 80 }), {
      type: 'enter',
    });
    expect(rect.entities).toEqual([{ id: 'e1', type: 'rect', a: [0, 0], b: [120, 80] }]);
    const centred = run(createSketchState(), tool('rect-center'), click([50, 50]), ...type({ X: 70, Y: 60 }), {
      type: 'enter',
    });
    expect(centred.entities).toEqual([{ id: 'e1', type: 'rect', a: [30, 40], b: [70, 60] }]);
  });
});

describe('the pair rule', () => {
  it('empties the other pair when one is typed in, both ways, and greys it with what the typed one gives', () => {
    let state = run(createSketchState(), tool('line'), click([10, 10]), move([40, 50]), ...type({ Length: 30 }));
    expect(state.typed).toEqual({ Length: '30' });
    // Typed Length 30, Angle the cursor's (53.13°): X, Y greyed at the point it gives.
    let derived = derivedValues(state);
    expect(Object.keys(derived)).toEqual(['X', 'Y']);
    expect(derived.X).toBeCloseTo(28, 6);
    expect(derived.Y).toBeCloseTo(34, 6);
    // X typed: Length goes, and Length, Angle are greyed instead.
    state = run(state, ...type({ X: 10 }));
    expect(state.typed).toEqual({ X: '10' });
    derived = derivedValues(state);
    expect(Object.keys(derived)).toEqual(['Length', 'Angle']);
    expect(derived.Length).toBeCloseTo(40, 6);
    expect(derived.Angle).toBeCloseTo(90, 6);
    // And back: Angle typed empties X.
    state = run(state, ...type({ Angle: 0 }));
    expect(state.typed).toEqual({ Angle: '0' });
    expect(typedPoint(state)).toEqual([60, 10]);
    // Emptying a box empties nothing else; with nothing typed nothing is greyed.
    state = run(state, ...type({ Length: 5 }), { type: 'typed', field: 'Angle', value: '' });
    expect(state.typed).toEqual({ Length: '5', Angle: '' });
    expect(derivedValues(run(createSketchState(), tool('line'), click([0, 0]), move([3, 4])))).toEqual({});
    // A refused typed value greys nothing.
    expect(derivedValues(run(state, ...type({ Length: -1 })))).toEqual({});
  });

  it('takes Radius or Diameter, the last typed, the other greyed', () => {
    let state = run(createSketchState(), tool('circle'), click([50, 60]), move([53, 64]), ...type({ Diameter: 12 }));
    expect(derivedValues(state).Radius).toBeCloseTo(6, 6);
    expect(previewEntities(state)[0]).toMatchObject({ c: [50, 60] });
    expect(previewEntities(state)[0].r).toBeCloseTo(6, 6);
    state = run(state, ...type({ Radius: 4 }));
    expect(state.typed).toEqual({ Radius: '4' });
    expect(derivedValues(state).Diameter).toBeCloseTo(8, 6);
    state = run(state, ...type({ Diameter: 20 }), { type: 'enter' });
    expect(state.entities).toEqual([{ id: 'e1', type: 'circle', c: [50, 60], r: 10 }]);
    // The words of a refusal stay.
    state = run(state, click([0, 0]), ...type({ Diameter: 0 }), { type: 'enter' });
    expect(state.message).toBe('Diameter must be greater than zero.');
    expect(run(state, ...type({ Radius: -1 }), { type: 'enter' }).message).toBe('Radius must be greater than zero.');
  });
});

describe('@ from the last point', () => {
  it('measures a line’s next point from the line’s own last point, each box on its own', () => {
    let state = run(createSketchState(), tool('line'), click([10, 10]), move([30, 47]), ...type({ X: '@25' }));
    // 25 to the right of (10, 10) at the cursor's height.
    expect(typedPoint(state)).toEqual([35, 47]);
    state = run(state, ...type({ Y: '@-5' }), { type: 'enter' });
    expect(state.entities[0]).toMatchObject({ a: [10, 10], b: [35, 5] });
    // Now from (35, 5), an expression after the @.
    state = run(
      createSketchState([], { pitch: 13.94 }),
      tool('line'),
      click([0, 0]),
      ...type({ X: '@=pitch', Y: '@0' }),
    );
    expect(typedPoint(state)).toEqual([13.94, 0]);
    expect(axisValue(state, 'X', '@=pitch')).toBeCloseTo(13.94, 9);
    // "@" alone is the last point's own coordinate.
    expect(axisValue(state, 'Y', '@')).toBe(0);
  });

  it('measures a first point from the last point any tool placed, a circle’s being its centre', () => {
    let state = run(createSketchState(), tool('circle'), click([50, 60]), ...type({ Radius: 5 }), { type: 'enter' });
    expect(state.entities).toHaveLength(1);
    // The next circle's centre @25 from the first one's: (75, 60).
    state = run(state, ...type({ X: '@25', Y: '@0' }), { type: 'enter' });
    expect(state.points).toEqual([[75, 60]]);
    state = run(state, ...type({ Diameter: 10 }), { type: 'enter' });
    expect(state.entities[1]).toEqual({ id: 'e2', type: 'circle', c: [75, 60], r: 5 });
    // Another tool: a rectangle's first corner @ from that centre, its second corner @ from its first.
    state = run(state, tool('rect'), ...type({ X: '@10', Y: '@-10' }), { type: 'enter' });
    expect(state.points).toEqual([[85, 50]]);
    state = run(state, ...type({ X: '@20', Y: '@20' }), { type: 'enter' });
    expect(state.entities[2]).toEqual({ id: 'e3', type: 'rect', a: [85, 50], b: [105, 70] });
    // An arc's points each from the one before.
    state = run(state, tool('arc'), ...type({ X: '@0', Y: '@10' }), { type: 'enter' });
    expect(state.points).toEqual([[105, 80]]);
  });

  it('is refused with no point placed, and nothing changes', () => {
    const start = run(createSketchState(), tool('line'), ...type({ X: '@5' }));
    const refused = sketchReducer(start, { type: 'enter' });
    expect(refused.message).toBe(RELATIVE_REFUSAL);
    expect(RELATIVE_REFUSAL).toBe('@ measures from the last point: place one first.');
    expect(refused.points).toEqual([]);
    expect(refused.entities).toBe(start.entities);
    expect(() => axisValue(start, 'X', '@5')).toThrow(RELATIVE_REFUSAL);
    // A typed value that is no number keeps today's words.
    expect(sketchReducer(run(start, ...type({ X: 'abc' })), { type: 'enter' }).message).toBe('X: Not a number');
  });
});
