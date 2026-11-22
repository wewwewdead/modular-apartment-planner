// HD-3 in the sketcher's reducer (docs/sketch-studio-hand-drawing.md §7.2 –
// §7.4, §7.8): Slot, Polygon and the rectangles' corner radius step by step,
// typed and clicked, with each option; Move, Copy, Rotate, Mirror and Pattern
// typed and clicked, Esc at each step, Undo / Redo as one step; dimensions
// following a move; Copy staying on; the drag with Esc; M with nothing selected.
import { describe, expect, it } from 'vitest';
import {
  SKETCH_KEYS,
  createSketchState,
  derivedValues,
  ghostEntities,
  liveValues,
  mergeShapes,
  orthoFrom,
  previewEntities,
  shapeRefusal,
  sketchCommand,
  sketchKey,
  sketchPairs,
  sketchReducer,
} from './sketchTools.js';
import { placeFocus } from './sketchOperations.js';
import { planeFrame } from './sketchPlane.js';

const run = (state, ...actions) => actions.reduce(sketchReducer, state);
const click = (point, extra = {}) => ({ type: 'click', point, ...extra });
const move = (point, extra = {}) => ({ type: 'move', point, ...extra });
const typed = (field, value) => ({ type: 'typed', field, value: String(value) });
const enter = { type: 'enter' };
const last = (state) => state.entities.at(-1);

describe('Slot (S)', () => {
  it('clicks the centre, then the far end’s centre; the HUD asks Length, Angle · X, Y', () => {
    let state = run(createSketchState(), { type: 'tool', tool: 'slot' });
    expect(sketchPairs(state)).toEqual([['X', 'Y']]);
    state = run(state, click([60, 28]), move([68.5, 28]));
    expect(sketchPairs(state)).toEqual([
      ['Length', 'Angle'],
      ['X', 'Y'],
    ]);
    // 8.5 to the far end's centre: 17 centre to centre, 22 overall with the default width 5.
    expect(liveValues(state)).toEqual({ Length: 22, Angle: 0, X: 68.5, Y: 28 });
    expect(previewEntities(state)).toEqual([
      { id: 'preview', type: 'slot', c: [60, 28], length: 22, width: 5, angle: 0 },
    ]);
    state = run(state, click([68.5, 28]));
    expect(last(state)).toEqual({ id: 'e1', type: 'slot', c: [60, 28], length: 22, width: 5, angle: 0 });
    expect(state.history.undo).toHaveLength(1);
    expect(state.points).toEqual([]);
    expect(state.tool).toBe('slot');
  });

  it('takes a typed Length and Angle exactly (overall, or centre to centre), and typed X, Y as the far end', () => {
    let state = run(createSketchState(), { type: 'tool', tool: 'slot' }, click([60, 28]), move([70, 30]));
    state = run(state, typed('Length', 22), typed('Angle', 30));
    // X, Y greyed: the far end's centre 8.5 along 30°.
    expect(derivedValues(state)).toEqual({ X: 67.361216, Y: 32.25 });
    state = run(state, enter);
    expect(last(state)).toEqual({ id: 'e1', type: 'slot', c: [60, 28], length: 22, width: 5, angle: 30 });
    // Centre to centre 17 with width 4: overall 21.
    state = run(
      state,
      { type: 'shapes', slotLength: 'centers', width: 4 },
      click([0, 0]),
      move([5, 5]),
      typed('Length', 17),
      typed('Angle', 90),
      enter,
    );
    expect(last(state)).toMatchObject({ c: [0, 0], length: 21, width: 4, angle: 90 });
    // X, Y typed: the far end's centre there.
    state = run(state, click([100, 0]), typed('X', 110), typed('Y', 0), enter);
    expect(last(state)).toMatchObject({ c: [100, 0], length: 24, width: 4, angle: 0 });
  });

  it('with "one end" the clicks are the two end centres; the entity still stores its centre', () => {
    const state = run(
      createSketchState(),
      { type: 'shapes', slotFirst: 'end' },
      { type: 'tool', tool: 'slot' },
      click([0, 0]),
      click([0, 17]),
    );
    expect(last(state)).toEqual({ id: 'e1', type: 'slot', c: [0, 8.5], length: 22, width: 5, angle: 90 });
  });

  it('refuses a slot no longer than its width in words, by the cursor and on Enter, adding nothing; Construction marks it', () => {
    let state = run(createSketchState(), { type: 'tool', tool: 'slot' }, click([0, 0]), move([3, 0]));
    state = run(state, typed('Length', 4));
    expect(shapeRefusal(state)).toBe("A slot's length must be more than its width.");
    expect(previewEntities(state)).toEqual([]);
    state = run(state, enter);
    expect(state.message).toBe("A slot's length must be more than its width.");
    expect(state.entities).toEqual([]);
    state = run(state, { type: 'construction' }, typed('Length', 30), enter);
    expect(last(state)).toMatchObject({ type: 'slot', construction: true });
  });
});

describe('Polygon (P)', () => {
  it('clicks the centre, then a flat’s middle: a click below the centre puts a flat at the bottom', () => {
    let state = run(createSketchState(), { type: 'tool', tool: 'polygon' }, click([150, 50]), move([150, 45]));
    expect(sketchPairs(state)).toEqual([
      ['Across flats', 'Angle'],
      ['X', 'Y'],
    ]);
    expect(liveValues(state)).toEqual({ 'Across flats': 10, Angle: 0, X: 150, Y: 45 });
    state = run(state, click([150, 45]));
    expect(last(state)).toEqual({ id: 'e1', type: 'polygon', c: [150, 50], sides: 6, af: 10, angle: 0 });
    // To the right of the centre: a flat facing right, 90° on, within one side's turn (60°): 30.
    state = run(state, click([0, 0]), click([5, 0]));
    expect(last(state)).toMatchObject({ af: 10, angle: 30 });
  });

  it('takes Sides and "across corners", and typed sizes exactly', () => {
    let state = run(
      createSketchState(),
      { type: 'shapes', sides: 8, polygonSize: 'corners' },
      { type: 'tool', tool: 'polygon' },
      click([0, 0]),
      move([3, 3]),
    );
    expect(sketchPairs(state)[0]).toEqual(['Across corners', 'Angle']);
    state = run(state, typed('Across corners', 20), typed('Angle', 0), enter);
    expect(last(state)).toMatchObject({ sides: 8, af: 18.477591, angle: 0 });
    state = run(state, { type: 'shapes', polygonSize: 'flats', sides: 3 }, click([50, 0]), move([50, 5]));
    state = run(state, typed('Across flats', 12), typed('Angle', 45), enter);
    expect(last(state)).toEqual({ id: 'e2', type: 'polygon', c: [50, 0], sides: 3, af: 12, angle: 45 });
  });
});

describe('the rectangles’ corner radius', () => {
  it('draws a rounded rectangle with the options row’s radius; one too large is refused in words', () => {
    let state = run(createSketchState(), { type: 'shapes', radius: 8 }, { type: 'tool', tool: 'rect' });
    state = run(state, click([0, 0]), click([240, 160]));
    expect(last(state)).toEqual({ id: 'e1', type: 'rect', a: [0, 0], b: [240, 160], r: 8 });
    state = run(state, { type: 'tool', tool: 'rect-center' }, click([0, 0]), move([20, 10]));
    expect(previewEntities(state)[0]).toMatchObject({ type: 'rect', r: 8 });
    state = run(state, move([20, 6]));
    expect(shapeRefusal(state)).toBe('The corner radius can be at most half the shorter side: 6 mm here.');
    state = run(state, click([20, 6]));
    expect(state.message).toBe('The corner radius can be at most half the shorter side: 6 mm here.');
    expect(state.entities).toHaveLength(1);
    // Empty: sharp, no key.
    state = run(state, { type: 'shapes', radius: null }, click([20, 6]));
    expect(last(state)).toEqual({ id: 'e2', type: 'rect', a: [-20, -6], b: [20, 6] });
  });

  it('keeps the options (defaults Width 5, Sides 6) and merges a patch', () => {
    expect(mergeShapes()).toEqual({
      width: 5,
      slotLength: 'overall',
      slotFirst: 'center',
      sides: 6,
      polygonSize: 'flats',
      radius: null,
      // HD-4 (§8.1): the Fillet radius, the Chamfer and Offset distances.
      fillet: 5,
      chamfer: 2,
      offset: 5,
    });
    expect(mergeShapes({ width: 3, junk: 1 }, { sides: 8 })).toMatchObject({ width: 3, sides: 8 });
    expect(createSketchState([], {}, [], [], {}, null, { radius: 2 }).shapes.radius).toBe(2);
  });
});

describe('the keys', () => {
  it('S Slot and P Polygon are tools; M, K, Q, I, G the actions; Shift, Ctrl and a held key are none', () => {
    expect([sketchKey({ key: 's' }), sketchKey({ key: 'P' })]).toEqual(['slot', 'polygon']);
    expect(SKETCH_KEYS.slot).toBe('S');
    expect(['m', 'k', 'q', 'i', 'g'].map((key) => sketchCommand({ key }))).toEqual([
      'move',
      'copy',
      'rotate',
      'mirror',
      'pattern',
    ]);
    expect(sketchCommand({ key: 'm', shiftKey: true })).toBe(null);
    expect(sketchCommand({ key: 'k', ctrlKey: true })).toBe(null);
    expect(sketchCommand({ key: 'g', repeat: true })).toBe(null);
  });
});

// A plate with a slot and a hole selected, and a dimension from the hole to the plate's corner.
const plate = [
  { id: 'e1', type: 'rect', a: [0, 0], b: [200, 100] },
  { id: 'e2', type: 'slot', c: [50, 50], length: 22, width: 5, angle: 0 },
  { id: 'e3', type: 'circle', c: [100, 50], r: 5 },
];
const toCorner = { id: 'd1', type: 'linear', from: [100, 50], to: [0, 0], orientation: 'horizontal', offset: -20 };
const onHole = { id: 'd2', type: 'radial', mode: 'diameter', center: [100, 50], radius: 5, at: [110, 60] };
const selected = (ids = ['e2', 'e3'], dimensions = [toCorner, onHole]) => ({
  ...createSketchState(plate, {}, dimensions),
  selectedIds: ids,
});

describe('Move (M)', () => {
  it('says so with nothing selected, and changes nothing', () => {
    const state = createSketchState(plate);
    const after = sketchReducer(state, { type: 'op', kind: 'move' });
    expect(after.message).toBe('Select what to move first.');
    expect(after.op).toBe(null);
    expect(sketchReducer(state, { type: 'op', kind: 'copy' }).message).toBe('Select what to copy first.');
    expect(sketchReducer(state, { type: 'op', kind: 'rotate' }).message).toBe('Select what to turn first.');
  });

  it('moves at once by a typed ΔX, ΔY: one step, ids kept, the dimensions following, the selection kept', () => {
    let state = run(selected(), { type: 'op', kind: 'move' });
    expect(state.op).toEqual({ kind: 'move', step: 'base' });
    expect(sketchPairs(state)).toEqual([['ΔX', 'ΔY']]);
    state = run(state, typed('ΔX', 10), typed('ΔY', -5), enter);
    expect(state.op).toBe(null);
    expect(state.entities[1]).toEqual({ ...plate[1], c: [60, 45] });
    expect(state.entities[2]).toEqual({ ...plate[2], c: [110, 45] });
    expect(state.entities[0]).toBe(plate[0]);
    expect(state.selectedIds).toEqual(['e2', 'e3']);
    expect(state.dimensions[0]).toEqual({ ...toCorner, from: [110, 45] });
    expect(state.dimensions[1]).toEqual({ ...onHole, center: [110, 45], at: [120, 55] });
    expect(state.history.undo).toHaveLength(1);
    // Undo: one step back, the whole move; Redo again.
    const back = sketchReducer(state, { type: 'undo' });
    expect(back.entities).toBe(plate);
    expect(back.dimensions).toEqual([toCorner, onHole]);
    expect(sketchReducer(back, { type: 'redo' }).entities).toBe(state.entities);
  });

  it('clicks a base point, then the target (X, Y typed from the zero work too); Shift locks from the base; Esc at each step', () => {
    let state = run(selected(), { type: 'op', kind: 'move' }, click([100, 50]));
    expect(state.op).toMatchObject({ step: 'target', base: [100, 50] });
    expect(orthoFrom(state)).toEqual([100, 50]);
    state = run(state, move([130, 70]));
    expect(liveValues(state)).toEqual({ ΔX: 30, ΔY: 20, X: 130, Y: 70 });
    // The ghost: the selection where the click would put it.
    expect(ghostEntities(state).entities.map((e) => e.c)).toEqual([
      [80, 70],
      [130, 70],
    ]);
    // Esc at the target step ends the action, nothing moved, the selection kept.
    const escaped = sketchReducer(state, { type: 'escape' });
    expect(escaped).toMatchObject({ op: null, selectedIds: ['e2', 'e3'] });
    expect(escaped.entities).toBe(plate);
    expect(escaped.history.undo).toEqual([]);
    // Esc at the base step too; a second Esc then clears the selection.
    const atBase = run(selected(), { type: 'op', kind: 'move' }, { type: 'escape' });
    expect(atBase).toMatchObject({ op: null, selectedIds: ['e2', 'e3'] });
    expect(sketchReducer(atBase, { type: 'escape' }).selectedIds).toEqual([]);
    // The click.
    state = run(state, click([130, 70]));
    expect(state.entities[2].c).toEqual([130, 70]);
    // Typed X, Y of the target with the zero moved.
    const zeroed = run({ ...selected(['e3']), zero: [100, 0] }, { type: 'op', kind: 'move' }, click([100, 50]));
    const done = run(zeroed, typed('X', 10), typed('Y', 60), enter);
    expect(done.entities[2].c).toEqual([110, 60]);
  });

  it('is ended by a tool, Ctrl+A, Delete and Undo (which drops it in the same press as its step back)', () => {
    const on = run(selected(), { type: 'op', kind: 'move' }, click([0, 0]));
    expect(sketchReducer(on, { type: 'tool', tool: 'line' })).toMatchObject({ op: null, tool: 'line' });
    expect(sketchReducer(on, { type: 'select-all' }).op).toBe(null);
    expect(sketchReducer(on, { type: 'delete' }).op).toBe(null);
    const undone = sketchReducer(on, { type: 'undo' });
    expect(undone.op).toBe(null);
    expect(undone.entities).toBe(plate);
    // The same key again ends it.
    expect(sketchReducer(on, { type: 'op', kind: 'move' }).op).toBe(null);
  });
});

describe('Copy (K)', () => {
  it('stays on for more copies from the same base, each one step; the copies become the selection when it ends', () => {
    let state = run(selected(['e3']), { type: 'op', kind: 'copy' }, click([100, 50]), click([120, 50]));
    expect(state.op).toMatchObject({ kind: 'copy', step: 'target', base: [100, 50], copies: ['e4'] });
    expect(last(state)).toEqual({ id: 'e4', type: 'circle', c: [120, 50], r: 5 });
    expect(state.selectedIds).toEqual(['e3']);
    state = run(state, click([140, 50]));
    expect(state.op.copies).toEqual(['e4', 'e5']);
    expect(state.history.undo).toHaveLength(2);
    // Copies carry no dimensions.
    expect(state.dimensions).toEqual([toCorner, onHole]);
    state = sketchReducer(state, { type: 'escape' });
    expect(state).toMatchObject({ op: null, selectedIds: ['e4', 'e5'] });
  });

  it('ends before another action starts, so the new one acts on the copies', () => {
    const copied = run(selected(['e3']), { type: 'op', kind: 'copy' }, click([100, 50]), click([120, 50]));
    const turning = sketchReducer(copied, { type: 'op', kind: 'rotate' });
    expect(turning).toMatchObject({ op: { kind: 'rotate', step: 'center' }, selectedIds: ['e4'] });
    expect(turning.history).toBe(copied.history);
    // With no copy made the selection stays the original, as Esc leaves it.
    const none = run(selected(['e3']), { type: 'op', kind: 'copy' }, { type: 'op', kind: 'move' });
    expect(none).toMatchObject({ op: { kind: 'move', step: 'base' }, selectedIds: ['e3'] });
    // Move then Mirror: Mirror on the same selection.
    const moving = run(selected(['e2', 'e3']), { type: 'op', kind: 'move' }, click([0, 0]));
    expect(sketchReducer(moving, { type: 'op', kind: 'mirror' })).toMatchObject({
      op: { kind: 'mirror', step: 'first' },
      selectedIds: ['e2', 'e3'],
    });
  });

  it('refuses a copy that would lie exactly on a shape already there, with the count', () => {
    const doubled = {
      ...createSketchState([...plate, { id: 'e4', type: 'circle', c: [120, 50], r: 5 }]),
      selectedIds: ['e3'],
    };
    let state = run(doubled, { type: 'op', kind: 'copy' }, typed('ΔX', 20), enter);
    expect(state.message).toBe('The copy would lie on shapes already there: nothing added.');
    expect(state.entities).toHaveLength(4);
    // Two selected, one lands on a shape: that one is left out and counted.
    state = run({ ...doubled, selectedIds: ['e2', 'e3'] }, { type: 'op', kind: 'copy' }, typed('ΔX', 20), enter);
    expect(state.entities).toHaveLength(5);
    expect(last(state)).toMatchObject({ type: 'slot', c: [70, 50] });
    expect(state.message).toBe('1 left out: already there');
  });
});

describe('Rotate (Q)', () => {
  it('takes a centre, then the angle typed or from the cursor (whole degrees, 15° with Shift); Keep the original', () => {
    let state = run(selected(['e2']), { type: 'op', kind: 'rotate' });
    expect(sketchPairs(state)).toEqual([['X', 'Y']]);
    state = run(state, click([50, 50]));
    expect(sketchPairs(state)).toEqual([['Angle']]);
    expect(orthoFrom(state)).toBe(null);
    state = run(state, move([60, 57], { angleStep: 1 }));
    expect(liveValues(state)).toEqual({ Angle: 35 });
    state = run(state, move([60, 57], { angleStep: 15 }));
    expect(liveValues(state)).toEqual({ Angle: 30 });
    const turned = run(state, typed('Angle', 90), enter);
    expect(turned.entities[1]).toEqual({ ...plate[1], angle: 90 });
    expect(turned).toMatchObject({ op: null, selectedIds: ['e2'] });
    // Keep the original: a turned copy, new id, selected.
    const kept = run(state, { type: 'op-option', patch: { keep: true } }, click([60, 57]));
    expect(kept.entities).toHaveLength(4);
    expect(last(kept)).toEqual({ id: 'e4', type: 'slot', c: [50, 50], length: 22, width: 5, angle: 30 });
    expect(kept.selectedIds).toEqual(['e4']);
    // A turn of 0 is refused; Esc at the angle step ends it.
    expect(run(state, typed('Angle', 0), enter).message).toBe('A turn of 0° moves nothing.');
    expect(sketchReducer(state, { type: 'escape' }).op).toBe(null);
  });

  it('turns a rectangle a quarter as a rectangle, and by 30° as its lines', () => {
    const square = { ...createSketchState(plate), selectedIds: ['e1'] };
    const quarter = run(square, { type: 'op', kind: 'rotate' }, click([0, 0]), typed('Angle', 90), enter);
    expect(quarter.entities[0]).toEqual({ id: 'e1', type: 'rect', a: [0, 0], b: [-100, 200] });
    const skew = run(square, { type: 'op', kind: 'rotate' }, click([0, 0]), typed('Angle', 30), enter);
    expect(skew.entities.slice(0, 4).map((e) => [e.id, e.type])).toEqual([
      ['e4', 'line'],
      ['e5', 'line'],
      ['e6', 'line'],
      ['e7', 'line'],
    ]);
    expect(skew.selectedIds).toEqual(['e4', 'e5', 'e6', 'e7']);
    expect(skew.nextId).toBe(8);
  });
});

describe('Mirror (I)', () => {
  const withAxis = [...plate, { id: 'e4', type: 'line', a: [150, 0], b: [150, 100], construction: true }];
  it('mirrors about a line the cursor is over (the original stays), or about two clicked points', () => {
    const base = { ...createSketchState(withAxis), selectedIds: ['e3'] };
    let state = run(
      base,
      { type: 'op', kind: 'mirror' },
      move([150.2, 30], { raw: [150.2, 30], kind: 'on sketch', tolerance: 1 }),
    );
    expect(ghostEntities(state).entities).toEqual([{ id: 'e3', type: 'circle', c: [200, 50], r: 5 }]);
    state = run(state, click([150.2, 30], { raw: [150.2, 30], kind: 'on sketch', tolerance: 1 }));
    expect(last(state)).toEqual({ id: 'e5', type: 'circle', c: [200, 50], r: 5 });
    expect(state.entities).toHaveLength(5);
    expect(state).toMatchObject({ op: null, selectedIds: ['e5'] });
    // Two points: the axis from the first click to the second (a key point is a point, not the line).
    state = run(base, { type: 'op', kind: 'mirror' }, click([0, 60], { kind: 'grid' }));
    expect(state.op).toMatchObject({ step: 'second', first: [0, 60] });
    expect(run(state, click([0, 60])).message).toBe("Pick a different point for the axis's other end.");
    state = run(state, click([10, 60]));
    expect(last(state)).toMatchObject({ c: [100, 70] });
  });

  it('Left ↔ right and Top ↔ bottom about the zero apply at once; Remove the original moves it instead', () => {
    const base = { ...createSketchState(plate), selectedIds: ['e2'], zero: [100, 50] };
    const lr = run(base, { type: 'op', kind: 'mirror' }, { type: 'mirror-zero', axis: 'vertical' });
    expect(last(lr)).toEqual({ id: 'e4', type: 'slot', c: [150, 50], length: 22, width: 5, angle: 180 });
    expect(lr.history.undo).toHaveLength(1);
    const removed = run(
      base,
      { type: 'op', kind: 'mirror' },
      { type: 'op-option', patch: { remove: true } },
      { type: 'mirror-zero', axis: 'horizontal' },
    );
    expect(removed.entities).toHaveLength(3);
    expect(removed.entities[1]).toEqual({ ...plate[1], c: [50, 50], angle: 0 });
    // Esc at the first step ends it.
    expect(run(base, { type: 'op', kind: 'mirror' }, { type: 'escape' }).op).toBe(null);
  });
});

describe('Pattern (G)', () => {
  it('applies its copies as one step, the selection the original; Enter applies; Esc ends with nothing added', () => {
    let state = run(selected(['e3']), { type: 'op', kind: 'pattern' });
    expect(sketchPairs(state)).toEqual([]);
    state = run(state, { type: 'pattern', patch: { kind: 'grid', columns: 4, rows: 3, columnStep: 12, rowStep: 12 } });
    expect(ghostEntities(state).entities).toHaveLength(11);
    expect(sketchReducer(state, { type: 'escape' }).entities).toBe(plate);
    state = sketchReducer(state, enter);
    expect(state.entities).toHaveLength(14);
    expect(state).toMatchObject({ op: null, selectedIds: ['e3'], message: '11 added' });
    expect(state.history.undo).toHaveLength(1);
    expect(sketchReducer(state, { type: 'undo' }).entities).toBe(plate);
  });

  it('takes a circle’s centre from a click; asks once before more than 2 000 new shapes', () => {
    let state = run(
      selected(['e3']),
      { type: 'op', kind: 'pattern' },
      { type: 'pattern', patch: { kind: 'circle', count: 4, total: 360 } },
    );
    state = run(state, click([100, 0]));
    expect(state.pattern.center).toEqual([100, 0]);
    expect(ghostEntities(state).entities.map((e) => e.c)).toEqual([
      [50, 0],
      [100, -50],
      [150, 0],
    ]);
    // 50 × 50 − 1 = 2 499 copies: the first Apply only asks, a number changed asks again, the second applies.
    state = run(state, { type: 'pattern', patch: { kind: 'grid', columns: 50, rows: 50, columnStep: 3, rowStep: 3 } });
    expect(ghostEntities(state)).toMatchObject({ more: 499 });
    expect(ghostEntities(state).entities).toHaveLength(2000);
    state = sketchReducer(state, { type: 'pattern-apply' });
    expect(state.op.confirm).toBe(true);
    expect(state.entities).toBe(plate);
    expect(sketchReducer(state, { type: 'pattern', patch: { rows: 49 } }).op.confirm).toBe(false);
    state = sketchReducer(state, { type: 'pattern-apply' });
    expect(state.entities).toHaveLength(3 + 2499);
  });
});

describe('the drag', () => {
  it('moves the selection on the release, one step; Esc, pointercancel or a missed release put it back with no step', () => {
    let state = run(
      selected(),
      { type: 'drag', grab: [100, 50], to: [110, 50] },
      { type: 'drag', grab: [0, 0], to: [120, 60] },
    );
    // Nothing moves while dragging; the grabbed point stays the first.
    expect(state.drag).toEqual({ grab: [100, 50], to: [120, 60] });
    expect(state.entities).toBe(plate);
    expect(orthoFrom(state)).toEqual([100, 50]);
    const released = sketchReducer(state, { type: 'drag-end' });
    expect(released.entities[2].c).toEqual([120, 60]);
    expect(released.dimensions[0].from).toEqual([120, 60]);
    expect(released.history.undo).toHaveLength(1);
    expect(released.drag).toBe(null);
    const escaped = sketchReducer(state, { type: 'escape' });
    expect(escaped).toMatchObject({ drag: null, selectedIds: ['e2', 'e3'] });
    expect(escaped.entities).toBe(plate);
    expect(escaped.history.undo).toEqual([]);
    const cancelled = sketchReducer(state, { type: 'drag-cancel' });
    expect(cancelled.drag).toBe(null);
    expect(cancelled.entities).toBe(plate);
    // No drag with a tool or an action on, or with nothing selected.
    expect(run(createSketchState(plate), { type: 'drag', grab: [0, 0], to: [1, 1] }).drag).toBe(null);
    // A release where it began is no step.
    const still = run(selected(), { type: 'drag', grab: [5, 5], to: [5, 5] }, { type: 'drag-end' });
    expect(still.history.undo).toEqual([]);
  });
});

describe('§7.0: a Check row frames its place with its surroundings', () => {
  it('grows the points to four times their extent, never under 10 mm', () => {
    const frame = planeFrame('XY');
    // A 0.3 mm gap: 10 mm across, centred on it.
    const gap = placeFocus(frame, [
      [0, 0.3],
      [0, 0],
    ]);
    expect(gap.span).toBe(10);
    expect(gap.position).toEqual([0, 0.15, 0]);
    // A crossing 30 mm long: 120 mm.
    expect(
      placeFocus(frame, [
        [0, 0],
        [30, 10],
      ]).span,
    ).toBe(120);
  });
});

describe('Esc at every step of an action', () => {
  it('ends Rotate at its centre and angle steps and Mirror at its first and second, nothing changed, no step', () => {
    const base = selected(['e2']);
    for (const actions of [
      [{ type: 'op', kind: 'rotate' }],
      [{ type: 'op', kind: 'rotate' }, click([50, 50])],
      [{ type: 'op', kind: 'mirror' }],
      [{ type: 'op', kind: 'mirror' }, click([0, 60], { kind: 'grid' })],
      [{ type: 'op', kind: 'copy' }, click([50, 50])],
      [{ type: 'op', kind: 'pattern' }],
    ]) {
      const before = run(base, ...actions);
      expect(before.op).not.toBe(null);
      const after = sketchReducer(before, { type: 'escape' });
      expect(after).toMatchObject({ op: null, selectedIds: ['e2'] });
      expect(after.entities).toBe(plate);
      expect(after.history.undo).toEqual([]);
    }
  });
});
