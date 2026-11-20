// Offset (docs/sketch-studio-hand-drawing.md §8.4, §8.9): each type to both
// sides, each staying its type, each refusal with its numbers.
import { describe, expect, it } from 'vitest';
import { offsetCopy, offsetCut, offsetPick } from './sketchOffset.js';
import { arcGeometry } from './sketchProfile.js';

const copy = (entity, raw, d = 5) => offsetCopy(entity, raw, d).copy;

describe('Offset', () => {
  it('a line: a parallel line of the same length, on the cursor’s side', () => {
    const line = { id: 'e1', type: 'line', a: [0, 0], b: [100, 0] };
    expect(copy(line, [50, 3])).toEqual({ type: 'line', a: [0, 5], b: [100, 5] });
    expect(copy(line, [50, -3])).toEqual({ type: 'line', a: [0, -5], b: [100, -5] });
    const slanted = copy({ id: 'e1', type: 'line', a: [0, 0], b: [30, 40] }, [0, 10]);
    expect(slanted).toEqual({ type: 'line', a: [-4, 3], b: [26, 43] });
    expect(() => offsetCopy(line, [50, 0], 5)).toThrow('Move off it, to the side the copy goes on.');
  });

  it('an arc: the same centre and angles, the radius ± d; inward to nothing refused', () => {
    const arc = { id: 'e1', type: 'arc', a: [10, 0], m: [0, 10], b: [-10, 0] };
    const out = copy(arc, [0, 20]);
    expect(out).toEqual({ type: 'arc', a: [15, 0], m: [0, 15], b: [-15, 0] });
    const inside = copy(arc, [0, 3], 4);
    expect(arcGeometry(inside.a, inside.m, inside.b).radius).toBeCloseTo(6, 9);
    expect(() => offsetCopy(arc, [0, 3], 10)).toThrow('Offsetting inward by 10 leaves nothing of this R10 arc.');
  });

  it('a circle, a slot and a polygon: their sizes ± d (± 2d across), each one entity', () => {
    const hole = { id: 'e1', type: 'circle', c: [0, 0], r: 4, construction: true };
    expect(copy(hole, [10, 0])).toEqual({ type: 'circle', c: [0, 0], r: 9, construction: true });
    expect(copy(hole, [1, 0], 3)).toEqual({ type: 'circle', c: [0, 0], r: 1, construction: true });
    expect(() => offsetCopy(hole, [1, 0], 5)).toThrow('Offsetting inward by 5 leaves nothing of this Ø8 circle.');
    const slot = { id: 'e1', type: 'slot', c: [0, 0], length: 22, width: 5, angle: 30 };
    expect(copy(slot, [0, 20])).toEqual({ type: 'slot', c: [0, 0], length: 32, width: 15, angle: 30 });
    expect(copy(slot, [0, 0.5], 1)).toEqual({ type: 'slot', c: [0, 0], length: 20, width: 3, angle: 30 });
    expect(() => offsetCopy(slot, [0, 0.5], 3)).toThrow('Offsetting inward by 3 leaves nothing of this 22 × 5 slot.');
    const hexagon = { id: 'e1', type: 'polygon', c: [0, 0], sides: 6, af: 10, angle: 0 };
    expect(copy(hexagon, [0, 20])).toEqual({ type: 'polygon', c: [0, 0], sides: 6, af: 20, angle: 0 });
    expect(copy(hexagon, [0, 1], 2)).toEqual({ type: 'polygon', c: [0, 0], sides: 6, af: 6, angle: 0 });
    expect(() => offsetCopy(hexagon, [0, 1], 5)).toThrow(
      'Offsetting inward by 5 leaves nothing of this hexagon 10 across flats.',
    );
  });

  it('a rectangle: each side out or in, sharp corners sharp, a corner radius ± d (sharp at nothing or less)', () => {
    const rect = { id: 'e1', type: 'rect', a: [60, 30], b: [0, 0] };
    expect(copy(rect, [80, 15])).toEqual({ type: 'rect', a: [-5, -5], b: [65, 35] });
    expect(copy(rect, [30, 15])).toEqual({ type: 'rect', a: [5, 5], b: [55, 25] });
    const rounded = { ...rect, r: 4 };
    expect(copy(rounded, [80, 15])).toEqual({ type: 'rect', a: [-5, -5], b: [65, 35], r: 9 });
    expect(copy(rounded, [30, 15], 3)).toEqual({ type: 'rect', a: [3, 3], b: [57, 27], r: 1 });
    expect(copy(rounded, [30, 15], 4)).toEqual({ type: 'rect', a: [4, 4], b: [56, 26] });
    expect(() => offsetCopy(rect, [30, 15], 15)).toThrow(
      'Offsetting inward by 15 leaves nothing of this 60 × 30 rectangle.',
    );
  });

  it('picks the entity under the cursor, then adds the copy after the last entity with a new id', () => {
    const entities = [
      { id: 'e1', type: 'circle', c: [0, 0], r: 4 },
      { id: 'e2', type: 'line', a: [20, 0], b: [40, 0] },
    ];
    expect(offsetPick({ entities, raw: [30, 0.3], tolerance: 1 })).toEqual({ type: 'entity', index: 1, id: 'e2' });
    expect(offsetPick({ entities, raw: [30, 9], tolerance: 1 }).message).toBe(
      'Point at a line, arc, circle or shape to offset.',
    );
    const result = offsetCut({ entities, id: 'e1', raw: [9, 0], distance: 2, nextId: 7 });
    expect(result.entities.slice(0, 2)).toEqual(entities);
    expect(result.entities[0]).toBe(entities[0]);
    expect(result.entities[2]).toEqual({ id: 'e7', type: 'circle', c: [0, 0], r: 6 });
    expect(result).toMatchObject({ added: ['e7'], nextId: 8, text: 'Offset 2 mm outward', removed: [] });
    expect(result.pieces).toEqual([{ type: 'circle', c: [0, 0], r: 6 }]);
    expect(offsetCut({ entities, id: 'e2', raw: [30, 1], distance: 2, nextId: 7 }).text).toBe('Offset 2 mm');
    expect(() => offsetCut({ entities, id: 'e9', raw: [0, 0], distance: 2, nextId: 7 })).toThrow(
      'That is no longer in the drawing.',
    );
    expect(() => offsetCut({ entities, id: 'e1', raw: [9, 0], distance: 0, nextId: 7 })).toThrow(
      'Type an offset distance greater than zero.',
    );
  });
});
