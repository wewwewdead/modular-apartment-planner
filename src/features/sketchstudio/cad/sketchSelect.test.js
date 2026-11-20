// Selection HD-1 (docs/sketch-studio-hand-drawing.md §5.1): the box that takes
// what lies wholly inside it or what it touches, for each entity type; an
// empty box; a click's and a box's selection; the selection note's words.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boxSelect, boxSelection, clickSelection, describeSelection, inDrawingOrder } from './sketchSelect.js';

const line = { id: 'l', type: 'line', a: [10, 10], b: [40, 10] };
const rect = { id: 'r', type: 'rect', a: [60, 0], b: [100, 30] };
const circle = { id: 'c', type: 'circle', c: [50, 50], r: 10 };
// A half circle over the chord (0, 80) → (20, 80): its top at y 90.
const arc = { id: 'a', type: 'arc', a: [0, 80], b: [20, 80], m: [10, 90] };
const drawing = [line, rect, circle, arc];

describe('boxSelect', () => {
  it('takes a line wholly inside, or touched by a box over part of it', () => {
    expect(
      boxSelect(
        [line],
        [
          [0, 0],
          [50, 20],
        ],
        'inside',
      ),
    ).toEqual(['l']);
    expect(
      boxSelect(
        [line],
        [
          [20, 0],
          [50, 20],
        ],
        'inside',
      ),
    ).toEqual([]);
    expect(
      boxSelect(
        [line],
        [
          [20, 0],
          [50, 20],
        ],
        'touching',
      ),
    ).toEqual(['l']);
    // A box between the ends, crossing the line with no end in it.
    expect(
      boxSelect(
        [line],
        [
          [20, 5],
          [30, 15],
        ],
        'touching',
      ),
    ).toEqual(['l']);
    // Beside it: nothing.
    expect(
      boxSelect(
        [line],
        [
          [0, 12],
          [50, 20],
        ],
        'touching',
      ),
    ).toEqual([]);
  });

  it('takes a circle the box straddles only when touching; inside needs all of it', () => {
    const straddle = [
      [45, 30],
      [80, 70],
    ];
    expect(boxSelect([circle], straddle, 'inside')).toEqual([]);
    expect(boxSelect([circle], straddle, 'touching')).toEqual(['c']);
    expect(
      boxSelect(
        [circle],
        [
          [39.9, 39.9],
          [60.1, 60.1],
        ],
        'inside',
      ),
    ).toEqual(['c']);
    // A box wholly inside the circle crosses none of its segments.
    expect(
      boxSelect(
        [circle],
        [
          [48, 48],
          [52, 52],
        ],
        'touching',
      ),
    ).toEqual([]);
  });

  it('reads an arc by its own curve, not its circle', () => {
    // Its top is at y 90: a box to y 91 holds it, one to y 89 does not.
    expect(
      boxSelect(
        [arc],
        [
          [-1, 79],
          [21, 91],
        ],
        'inside',
      ),
    ).toEqual(['a']);
    expect(
      boxSelect(
        [arc],
        [
          [-1, 79],
          [21, 89],
        ],
        'inside',
      ),
    ).toEqual([]);
    expect(
      boxSelect(
        [arc],
        [
          [-1, 79],
          [21, 89],
        ],
        'touching',
      ),
    ).toEqual(['a']);
    // Below the chord lies the rest of its circle, not the arc.
    expect(
      boxSelect(
        [arc],
        [
          [0, 65],
          [20, 75],
        ],
        'touching',
      ),
    ).toEqual([]);
  });

  it('takes a rectangle by its four sides', () => {
    expect(
      boxSelect(
        [rect],
        [
          [55, -5],
          [105, 35],
        ],
        'inside',
      ),
    ).toEqual(['r']);
    expect(
      boxSelect(
        [rect],
        [
          [55, -5],
          [80, 35],
        ],
        'inside',
      ),
    ).toEqual([]);
    expect(
      boxSelect(
        [rect],
        [
          [55, -5],
          [80, 35],
        ],
        'touching',
      ),
    ).toEqual(['r']);
    // Inside the rectangle, clear of its sides: no side touched.
    expect(
      boxSelect(
        [rect],
        [
          [70, 10],
          [90, 20],
        ],
        'touching',
      ),
    ).toEqual([]);
  });

  it('takes nothing with an empty box, either corner first, and keeps drawing order', () => {
    expect(
      boxSelect(
        drawing,
        [
          [200, 200],
          [300, 300],
        ],
        'touching',
      ),
    ).toEqual([]);
    expect(
      boxSelect(
        drawing,
        [
          [10, 10],
          [10, 10],
        ],
        'touching',
      ),
    ).toEqual([]);
    expect(
      boxSelect(
        drawing,
        [
          [0, 0],
          [100, 0],
        ],
        'touching',
      ),
    ).toEqual([]);
    expect(
      boxSelect(
        [],
        [
          [0, 0],
          [10, 10],
        ],
        'inside',
      ),
    ).toEqual([]);
    // Opposite corners in any order; ids in the order drawn.
    expect(
      boxSelect(
        drawing,
        [
          [110, 100],
          [-5, -5],
        ],
        'inside',
      ),
    ).toEqual(['l', 'r', 'c', 'a']);
  });
});

describe('the selection', () => {
  it('follows a click: alone, or with Shift / Ctrl added and taken out', () => {
    expect(clickSelection(drawing, ['l', 'r'], 'c')).toEqual(['c']);
    expect(clickSelection(drawing, ['l', 'r'], null)).toEqual([]);
    expect(clickSelection(drawing, ['a'], 'l', true)).toEqual(['l', 'a']);
    expect(clickSelection(drawing, ['l', 'a'], 'l', true)).toEqual(['a']);
    const kept = ['l'];
    expect(clickSelection(drawing, kept, null, true)).toBe(kept);
  });

  it('takes a box in place of the selection, or added to it with Shift', () => {
    expect(boxSelection(drawing, ['a'], ['l', 'r'])).toEqual(['l', 'r']);
    expect(boxSelection(drawing, ['a', 'l'], ['r', 'l'], true)).toEqual(['l', 'r', 'a']);
    expect(inDrawingOrder(drawing, ['a', 'gone', 'l'])).toEqual(['l', 'a']);
  });

  it('counts several by kind in the note', () => {
    const more = [...drawing, { ...line, id: 'l2' }, { ...circle, id: 'c2' }, { ...line, id: 'l3' }];
    expect(describeSelection(more, ['l', 'c', 'l2', 'c2', 'l3'])).toBe('5 selected: 3 lines, 2 circles');
    expect(describeSelection(drawing, ['r', 'a'])).toBe('2 selected: 1 rectangle, 1 arc');
  });
});

describe('the pure modules of HD-1', () => {
  // HD-2 (docs/sketch-studio-hand-drawing.md §6.1): sketchProfile.js and sketchEdit.js measure
  // X, Y from the zero through sketchZero.js, itself pure (no imports). HD-3 (§7.1):
  // sketchProfile.js builds the slot, polygon and rounded rectangle on sketchShapes.js
  // (pure, no imports: sketchShapes.test.js).
  it('import sketchProfile.js only: no three, no DOM (sketchProfile.js runs in the worker)', () => {
    for (const name of ['sketchSelect.js', 'sketchHistory.js', 'sketchEdit.js', 'sketchProfile.js']) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
      const imports = [...source.matchAll(/^import [^;]* from '([^']+)';/gm)].map((m) => m[1]);
      expect(
        imports.filter(
          (path) =>
            path !== './sketchProfile.js' &&
            path !== './sketchZero.js' &&
            !(name === 'sketchProfile.js' && path === './sketchShapes.js'),
        ),
        name,
      ).toEqual([]);
      expect(source, name).not.toMatch(/\b(document|window|navigator)\./);
    }
  });
});
