// Changing what is drawn HD-1 (docs/sketch-studio-hand-drawing.md §5.3 –
// §5.4): every box of the selection row on every entity, the refusals in
// their words, the dimensions that follow an edit, the joins at an end, the
// construction flag.
import { describe, expect, it } from 'vitest';
import { arcGeometry } from './sketchProfile.js';
import { EDIT_FIELDS, editEntity, entityFields, followDimensions, joinsAt, setConstruction } from './sketchEdit.js';

const line = { id: 'e1', type: 'line', a: [10, 20], b: [40, 60] }; // 50 long
const rect = { id: 'e2', type: 'rect', a: [100, 80], b: [20, 30] }; // drawn from its top-right
const circle = { id: 'e3', type: 'circle', c: [50, 50], r: 10 };
// Over the chord (0, 0) → (20, 0) bulging up, radius 12.5: its centre below the chord (less than half a circle).
const arc = { id: 'e4', type: 'arc', a: [0, 0], b: [20, 0], m: [10, 5] };
const drawing = [line, rect, circle, arc];
const edit = (id, patch) => editEntity(drawing, id, patch).find((e) => e.id === id);
const values = (entity) => Object.fromEntries(entityFields(entity).map(({ key, value }) => [key, value]));

describe('the selection row numbers', () => {
  it('lists the boxes of §5.3 for each entity, X and Y from the origin', () => {
    expect(entityFields(line).map((f) => f.label)).toEqual(['X1', 'Y1', 'X2', 'Y2', 'Length', 'Angle']);
    expect(values(line)).toEqual({ x1: 10, y1: 20, x2: 40, y2: 60, length: 50, angle: 53.130102 });
    expect(entityFields(line).at(-1).unit).toBe('°');
    // HD-3 (§7.1): a rectangle's corner Radius (null: sharp), and the slot's and polygon's rows.
    expect(values(rect)).toEqual({ x: 20, y: 30, width: 80, height: 50, r: null });
    expect(values(circle)).toEqual({ x: 50, y: 50, diameter: 20 });
    expect(values(arc)).toEqual({ x1: 0, y1: 0, x2: 20, y2: 0, radius: 12.5 });
    expect(Object.keys(EDIT_FIELDS)).toEqual(['line', 'rect', 'slot', 'polygon', 'circle', 'arc']);
  });
});

describe('editEntity', () => {
  it('moves a line end alone, by X1, Y1, X2, Y2', () => {
    expect(edit('e1', { x1: 0 })).toEqual({ ...line, a: [0, 20] });
    expect(edit('e1', { y1: 0 })).toEqual({ ...line, a: [10, 0] });
    expect(edit('e1', { x2: 70 })).toEqual({ ...line, b: [70, 60] });
    expect(edit('e1', { y2: 20 })).toEqual({ ...line, b: [40, 20] });
  });

  it("changes a line's Length keeping end 1 and the direction, its Angle about end 1", () => {
    expect(edit('e1', { length: 100 })).toEqual({ ...line, b: [70, 100] });
    expect(edit('e1', { angle: 0 })).toEqual({ ...line, b: [60, 20] });
    expect(edit('e1', { angle: 90 })).toEqual({ ...line, b: [10, 70] });
  });

  it('moves a rectangle by its lower-left corner and sizes it from there', () => {
    expect(edit('e2', { x: 0 })).toEqual({ ...rect, a: [0, 30], b: [80, 80] });
    expect(edit('e2', { y: 0 })).toEqual({ ...rect, a: [20, 0], b: [100, 50] });
    expect(edit('e2', { width: 10 })).toEqual({ ...rect, a: [20, 30], b: [30, 80] });
    expect(edit('e2', { height: 5 })).toEqual({ ...rect, a: [20, 30], b: [100, 35] });
  });

  it("keeps a circle's centre when its Diameter changes; X, Y move it", () => {
    expect(edit('e3', { diameter: 12 })).toEqual({ ...circle, r: 6 });
    expect(edit('e3', { x: 0, y: -5 })).toEqual({ ...circle, c: [0, -5] });
  });

  it("keeps an arc's ends and side when its Radius changes, and its radius when an end moves", () => {
    const larger = edit('e4', { radius: 20 });
    expect(larger.a).toEqual(arc.a);
    expect(larger.b).toEqual(arc.b);
    const geometry = arcGeometry(larger.a, larger.m, larger.b);
    expect(geometry.radius).toBeCloseTo(20, 5);
    // Still bulging up, centre still below the chord: a flatter arc.
    expect(larger.m[1]).toBeGreaterThan(0);
    expect(larger.m[1]).toBeCloseTo(20 - Math.sqrt(300), 5);
    expect(geometry.center[1]).toBeLessThan(0);
    // An arc of more than half a circle stays one.
    const major = { id: 'e5', type: 'arc', a: [0, 0], b: [20, 0], m: [10, 20] }; // radius 12.5, centre above
    const grown = editEntity([major], 'e5', { radius: 15 })[0];
    expect(arcGeometry(grown.a, grown.m, grown.b).center[1]).toBeGreaterThan(0);
    expect(grown.m).toEqual([10, Number((Math.sqrt(125) + 15).toFixed(6))]);
    // An end moved: the radius stays.
    const moved = edit('e4', { x2: 24 });
    expect(moved.b).toEqual([24, 0]);
    expect(arcGeometry(moved.a, moved.m, moved.b).radius).toBeCloseTo(12.5, 5);
    // The bulge side is kept on a chord drawn the other way too.
    const down = { id: 'e6', type: 'arc', a: [20, 0], b: [0, 0], m: [10, -5] };
    expect(editEntity([down], 'e6', { radius: 20 })[0].m[1]).toBeLessThan(0);
  });

  it('refuses in words and changes nothing', () => {
    expect(() => edit('e2', { width: 0 })).toThrow('A rectangle needs a nonzero width and height.');
    expect(() => edit('e2', { height: -3 })).toThrow('A rectangle needs a nonzero width and height.');
    expect(() => edit('e3', { diameter: 0 })).toThrow('A circle needs a diameter greater than zero.');
    expect(() => edit('e1', { length: 0 })).toThrow('A line needs a length greater than zero.');
    expect(() => edit('e1', { x2: 10, y2: 20 })).toThrow('A line needs two different ends.');
    expect(() => edit('e4', { radius: 9 })).toThrow("An arc's radius must be at least half its chord: 10 mm here.");
    expect(() => edit('e4', { x2: 40 })).toThrow("An arc's radius must be at least half its chord: 20 mm here.");
    expect(() => edit('e4', { x2: 0 })).toThrow('An arc needs two different ends.');
    expect(() => edit('e3', { width: 3 })).toThrow('A circle has no width.');
    expect(() => edit('e3', { diameter: Number.NaN })).toThrow('Diameter must be a number.');
    expect(() => editEntity(drawing, 'gone', { x: 1 })).toThrow('That entity is no longer in the drawing.');
  });

  it('returns the same list when nothing changes, and a new one with the others kept', () => {
    expect(editEntity(drawing, 'e2', { width: 80 })).toBe(drawing);
    expect(editEntity(drawing, 'e3', { diameter: 20 })).toBe(drawing);
    expect(editEntity(drawing, 'e4', { radius: 12.5 })).toBe(drawing);
    const next = editEntity(drawing, 'e3', { diameter: 8 });
    expect(next).not.toBe(drawing);
    expect(next.filter((e) => e.id !== 'e3').every((e, i) => e === drawing.filter((x) => x.id !== 'e3')[i])).toBe(true);
  });
});

describe('dimensions follow an edit', () => {
  it('shows the new diameter on the edited circle, the label as far off it as before', () => {
    const radial = { id: 'd1', type: 'radial', mode: 'diameter', center: [50, 50], radius: 10, at: [50, 75] };
    const after = edit('e3', { diameter: 30 });
    const [followed] = followDimensions([radial], circle, after);
    expect(followed).toEqual({ ...radial, radius: 15, at: [50, 80] });
    const moved = edit('e3', { x: 0 });
    expect(followDimensions([radial], circle, moved)[0]).toMatchObject({ center: [0, 50], at: [0, 75] });
  });

  it('moves a dimension end that lay on the moved line end, not one on another entity', () => {
    const other = { id: 'e7', type: 'line', a: [200, 0], b: [200, 50] };
    const span = { id: 'd2', type: 'linear', from: [40, 60], to: [200, 50], orientation: 'aligned', offset: 5 };
    const after = edit('e1', { x2: 70 });
    const [followed] = followDimensions([span], line, after);
    expect(followed).toEqual({ ...span, from: [70, 60] });
    // The line's midpoint moved too: a dimension from it follows.
    const mid = { id: 'd3', type: 'linear', from: [25, 40], to: other.a, orientation: 'horizontal', offset: 0 };
    expect(followDimensions([mid], line, after)[0].from).toEqual([40, 40]);
    // Nothing on it: the same array.
    const free = [{ id: 'd4', type: 'linear', from: [0, -50], to: [10, -50], orientation: 'horizontal', offset: 0 }];
    expect(followDimensions(free, line, after)).toBe(free);
  });

  it("follows a rectangle's corners and an arc's radius", () => {
    const side = { id: 'd5', type: 'linear', from: [20, 80], to: [100, 80], orientation: 'horizontal', offset: 10 };
    const wider = edit('e2', { width: 100 });
    expect(followDimensions([side], rect, wider)[0]).toMatchObject({ from: [20, 80], to: [120, 80] });
    const radius = { id: 'd6', type: 'radial', mode: 'radius', center: [10, -7.5], radius: 12.5, at: [10, 20] };
    const flatter = edit('e4', { radius: 20 });
    const [followed] = followDimensions([radius], arc, flatter);
    expect(followed.radius).toBe(20);
    expect(followed.center[1]).toBeCloseTo(-Math.sqrt(300), 5);
  });
});

describe('joins and construction', () => {
  it('counts the drawn lines and arcs ending at a point', () => {
    const chain = [
      { id: 'a', type: 'line', a: [0, 0], b: [10, 0] },
      { id: 'b', type: 'line', a: [10, 0], b: [10, 10] },
      { id: 'c', type: 'arc', a: [10, 0], b: [20, 0], m: [15, 3] },
      { id: 'd', type: 'line', a: [10, 0], b: [10, -10], construction: true },
    ];
    expect(joinsAt(chain, 'a', [10, 0])).toBe(2);
    expect(joinsAt(chain, 'a', [0, 0])).toBe(0);
  });

  it('sets and takes off the construction flag, the others untouched', () => {
    const marked = setConstruction(drawing, ['e1', 'e3'], true);
    expect(marked.filter((e) => e.construction).map((e) => e.id)).toEqual(['e1', 'e3']);
    expect(marked[1]).toBe(rect);
    expect(setConstruction(marked, ['e1'], true)).not.toBe(drawing);
    expect(setConstruction(marked, ['e1', 'e3'], true)).toBe(marked);
    const off = setConstruction(marked, ['e1'], false);
    expect('construction' in off[0]).toBe(false);
    expect(off[0]).toEqual(line);
  });
});
