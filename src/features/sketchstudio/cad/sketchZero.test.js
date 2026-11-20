// The zero (docs/sketch-studio-hand-drawing.md §6.1, §6.7): the two helpers,
// the Zero tool by click and by typed X, Y, Reset zero, every X and Y with a
// moved zero (the HUD, typed values, the selection row, the note), and the
// zero is never a history step.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ORIGIN, fromZero, isOrigin, storedZero, toZero } from './sketchZero.js';
import { createSketchState, liveValues, sketchCommand, sketchReducer, typedPoint } from './sketchTools.js';
import { describeEntity } from './sketchProfile.js';
import { entityFields } from './sketchEdit.js';
import { outlineSketches, sketchFromSession } from './sketchOperations.js';
import { planeFrame } from './sketchPlane.js';

const run = (state, ...actions) => actions.reduce(sketchReducer, state);
const click = (point) => ({ type: 'click', point });
const type = (values) =>
  Object.entries(values).map(([field, value]) => ({ type: 'typed', field, value: String(value) }));

describe('the helpers', () => {
  it('measures from the zero and back, the origin changing nothing', () => {
    expect(fromZero([50, 60], [40, 40])).toEqual([10, 20]);
    expect(toZero([10, 20], [40, 40])).toEqual([50, 60]);
    expect(fromZero([0.3, 0.1], [0.1, 0.2])).toEqual([0.2, -0.1]);
    expect(toZero(fromZero([13.94, -7.5], [100.25, 3]), [100.25, 3])).toEqual([13.94, -7.5]);
    const point = [5, 6];
    expect(fromZero(point, null)).toBe(point);
    expect(fromZero(point, ORIGIN)).toBe(point);
    expect(isOrigin(null)).toBe(true);
    expect(isOrigin([0, 0])).toBe(true);
    expect(isOrigin([0, 1])).toBe(false);
  });

  it('reads a stored zero back: two finite numbers off the origin, else none', () => {
    expect(storedZero([40, 40])).toEqual([40, 40]);
    for (const value of [undefined, null, [0, 0], [1], [1, 2, 3], [Number.NaN, 1], '1,2', { 0: 1, 1: 2 }])
      expect(storedZero(value), JSON.stringify(value)).toBe(null);
    expect(createSketchState([], {}, [], [], {}, [40, 40]).zero).toEqual([40, 40]);
    expect(createSketchState().zero).toEqual([0, 0]);
    expect(createSketchState([], {}, [], [], {}, 'bad').zero).toEqual([0, 0]);
  });

  it('is pure, with LF line endings', () => {
    const source = readFileSync(new URL('./sketchZero.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/^import /m);
    expect(source).not.toContain('\r\n');
  });
});

describe('the Zero tool', () => {
  it('is Z, sets the zero on a click and ends, never a history step; Undo never moves it', () => {
    expect(sketchCommand({ key: 'z' })).toBe('zero');
    expect(sketchCommand({ key: 'Z', shiftKey: true })).toBe(null);
    let state = run(createSketchState([{ id: 'e1', type: 'rect', a: [0, 0], b: [100, 80] }]), {
      type: 'tool',
      tool: 'zero',
    });
    state = sketchReducer(state, click([40, 40]));
    expect(state).toMatchObject({ zero: [40, 40], tool: null, points: [] });
    expect(state.history.undo).toEqual([]);
    state = run(state, { type: 'tool', tool: 'circle' }, click([50, 50]), ...type({ Radius: 5 }), { type: 'enter' });
    expect(state.history.undo).toHaveLength(1);
    state = run(state, { type: 'undo' });
    expect(state.zero).toEqual([40, 40]);
    expect(run(state, { type: 'redo' }).zero).toEqual([40, 40]);
  });

  it('takes typed X, Y from the zero as it is, and @ from the last point', () => {
    let state = run(
      createSketchState([], {}, [], [], {}, [40, 40]),
      { type: 'tool', tool: 'zero' },
      ...type({ X: 10, Y: -5 }),
      {
        type: 'enter',
      },
    );
    expect(state.zero).toEqual([50, 35]);
    state = run(
      state,
      { type: 'tool', tool: 'line' },
      click([100, 100]),
      { type: 'escape' },
      { type: 'tool', tool: 'zero' },
    );
    state = run(state, ...type({ X: '@-20', Y: '@0' }), { type: 'enter' });
    expect(state.zero).toEqual([80, 100]);
  });

  it('goes back to the sketch origin with Reset zero, which ends the tool', () => {
    const state = run(
      createSketchState([], {}, [], [], {}, [40, 40]),
      { type: 'tool', tool: 'zero' },
      { type: 'zero-reset' },
    );
    expect(state).toMatchObject({ zero: [0, 0], tool: null });
    expect(state.history.undo).toEqual([]);
  });
});

describe('every X and Y from a moved zero', () => {
  const plate = [
    { id: 'e1', type: 'rect', a: [0, 0], b: [100, 80] },
    { id: 'e2', type: 'circle', c: [50, 60], r: 6 },
    { id: 'e3', type: 'line', a: [10, 70], b: [90, 70] },
  ];
  const zeroed = () => createSketchState(plate, {}, [], [], {}, [40, 40]);

  it('in the HUD, live and typed; lengths and angles unchanged', () => {
    let state = run(zeroed(), { type: 'tool', tool: 'circle' }, { type: 'move', point: [45, 52] });
    expect(liveValues(state)).toEqual({ X: 5, Y: 12 });
    state = run(state, ...type({ X: 10, Y: 20 }));
    expect(typedPoint(state)).toEqual([50, 60]);
    state = run(state, { type: 'enter' }, { type: 'move', point: [53, 64] });
    expect(liveValues(state)).toEqual({ Radius: 5, Diameter: 10 });
    const line = run(zeroed(), { type: 'tool', tool: 'line' }, click([40, 40]), { type: 'move', point: [43, 44] });
    expect(liveValues(line)).toEqual({ Length: 5, Angle: expect.closeTo(53.130102, 5), X: 3, Y: 4 });
  });

  it('in the selection row and its edit, and in the note', () => {
    expect(entityFields(plate[1], [40, 40]).map((f) => [f.key, f.value])).toEqual([
      ['x', 10],
      ['y', 20],
      ['diameter', 12],
    ]);
    expect(entityFields(plate[2], [40, 40]).map((f) => [f.key, f.value])).toEqual([
      ['x1', -30],
      ['y1', 30],
      ['x2', 50],
      ['y2', 30],
      ['length', 80],
      ['angle', 0],
    ]);
    expect(
      entityFields(plate[0], [40, 40])
        .slice(0, 2)
        .map((f) => f.value),
    ).toEqual([-40, -40]);
    let state = run(zeroed(), { type: 'select', id: 'e2' }, { type: 'edit', id: 'e2', patch: { x: 25 } });
    expect(state.entities[1]).toEqual({ id: 'e2', type: 'circle', c: [65, 60], r: 6 });
    state = sketchReducer(state, { type: 'edit', id: 'e3', patch: { y2: 0 } });
    expect(state.entities[2]).toMatchObject({ a: [10, 70], b: [90, 40] });
    expect(describeEntity(plate[1], [40, 40])).toBe('Circle Ø12 at (10, 20)');
    expect(describeEntity(plate[0], [40, 40])).toBe('Rectangle 100 × 80 at (-40, -40)');
    expect(describeEntity(plate[2], [40, 40])).toBe('Line 80 mm');
    // The sketch origin as before.
    expect(describeEntity(plate[1])).toBe('Circle Ø12 at (50, 60)');
  });
});

describe('stored with the sketch (sketchFromSession, outlineSketches)', () => {
  const session = { frame: planeFrame('XY'), support: { type: 'plane', plane: 'XY', offset: 0 } };
  const plate = [{ id: 'e1', type: 'rect', a: [0, 0], b: [200, 100] }];

  it('keeps a moved zero, never the origin, and an edited sketch its own unless it is reset', () => {
    expect(sketchFromSession({ session, entities: plate, name: 'S', zero: [40, 40] }).sketch.zero).toEqual([40, 40]);
    for (const zero of [undefined, null, [0, 0]])
      expect('zero' in sketchFromSession({ session, entities: plate, name: 'S', zero }).sketch).toBe(false);
    const existing = sketchFromSession({ session, entities: plate, name: 'S', zero: [40, 40] }).sketch;
    expect(sketchFromSession({ session, entities: plate, existing }).sketch.zero).toEqual([40, 40]);
    expect(sketchFromSession({ session, entities: plate, existing, zero: [10, 0] }).sketch.zero).toEqual([10, 0]);
    expect('zero' in sketchFromSession({ session, entities: plate, existing, zero: null }).sketch).toBe(false);
  });

  it('finishes a sketch stored before HD-2 byte for byte as it was', () => {
    const stored = sketchFromSession({ session, entities: plate, name: 'S' }).sketch;
    expect('zero' in stored).toBe(false);
    const again = sketchFromSession({ session, entities: stored.entities, existing: stored }).sketch;
    expect(JSON.stringify(again)).toBe(JSON.stringify(stored));
    const split = outlineSketches({ session, entities: stored.entities, existing: stored, name: 'S' });
    expect(JSON.stringify(split.sketch)).toBe(JSON.stringify(stored));
  });

  it('gives every outline of a split the same zero', () => {
    const two = [...plate, { id: 'e2', type: 'rect', a: [260, 0], b: [460, 100] }];
    const made = outlineSketches({ session, entities: two, existing: null, name: 'S', zero: [40, 40] });
    expect([made.sketch.zero, ...made.extras.map((s) => s.zero)]).toEqual([
      [40, 40],
      [40, 40],
    ]);
    const plain = outlineSketches({ session, entities: two, existing: null, name: 'S' });
    expect([plain.sketch, ...plain.extras].some((s) => 'zero' in s)).toBe(false);
  });
});
