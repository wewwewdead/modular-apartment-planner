// Bend reliefs in one click (docs/sketch-studio-bend-relief.md §3.1, §5.1):
// the inside corners of an outline, the automatic sizes, what a click takes,
// each shape's exact points, the user's own hand-drawn relief, every refusal
// in its words, the ids, and the fold: a cross blank whose corners are
// relieved folds where the bare one is refused, and a tab's slots let its bend
// line sit inside the edge.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chosenSizes, cutRelief, describeRelief, reliefCorners, reliefPick, reliefSizes } from './sketchRelief.js';
import { crossingText, foldSheet } from './sheetMetal.js';
import { entitiesToProfile } from './sketchProfile.js';

const chain = (points, first = 1) =>
  points.map((p, i) => ({ id: `e${first + i}`, type: 'line', a: p, b: points[(i + 1) % points.length] }));
// The cross blank of §2.2: base 200 × 100, flaps 20; its inside corners are the base's corners.
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
// The tab blank: a 20 mm tab on the top edge of a 100 × 100 base.
const TAB = chain([
  [0, 0],
  [100, 0],
  [100, 100],
  [60, 100],
  [60, 120],
  [40, 120],
  [40, 100],
  [0, 100],
]);
const AUTO = reliefSizes({ thickness: 1.2, stock: 'spcc' });
const sized = (shape, typed = {}) => chosenSizes(shape, typed, AUTO);
const pickAt = (entities, raw, shape, extra = {}) =>
  reliefPick({ entities, raw, point: raw, tolerance: 1, shape, ...extra });
const cutAt = (entities, raw, shape, typed = {}, nextId = entities.length + 1) =>
  cutRelief({ entities, pick: pickAt(entities, raw, shape), shape, sizes: sized(shape, typed), nextId });
const refusal = (run) => {
  try {
    run();
  } catch (error) {
    return error.message;
  }
  return null;
};

describe('reliefCorners (§3.1)', () => {
  it('finds the four inside corners of the cross, of its twelve', () => {
    const corners = reliefCorners(CROSS);
    expect(corners.map((c) => c.point)).toEqual([
      [200, 0],
      [200, 100],
      [0, 100],
      [0, 0],
    ]);
    expect(corners.every((c) => c.square)).toBe(true);
    // The edge walked in on, then the one walked out on, with the directions away from the corner.
    expect(corners[3].edges).toEqual([
      { id: 'e11', away: [-1, 0] },
      { id: 'e12', away: [0, -1] },
    ]);
  });

  it('finds none on a rectangle, four on a rectangular cut-out (with their sides)', () => {
    expect(reliefCorners([{ id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] }])).toEqual([]);
    const corners = reliefCorners([
      { id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] },
      { id: 'e2', type: 'rect', a: [20, 20], b: [50, 40] },
    ]);
    expect(corners.map((c) => c.point)).toEqual([
      [20, 20],
      [50, 20],
      [50, 40],
      [20, 40],
    ]);
    expect(corners[0].edges).toEqual([
      { id: 'e2', side: 3, away: [0, 1] },
      { id: 'e2', side: 0, away: [1, 0] },
    ]);
  });

  it('finds none on an open chain, beside an arc, or on construction lines', () => {
    expect(
      reliefCorners(
        chain([
          [0, 0],
          [100, 0],
          [100, 100],
          [50, 100],
        ]).slice(0, 3),
      ),
    ).toEqual([]);
    // An L whose inside corner (50, 50) has an arc for a neighbour.
    const l = chain([
      [0, 0],
      [100, 0],
      [100, 50],
      [50, 50],
      [50, 100],
      [0, 100],
    ]);
    expect(reliefCorners(l).map((c) => c.point)).toEqual([[50, 50]]);
    const curved = l.map((e) =>
      e.id === 'e4' ? { id: 'e4', type: 'arc', a: [50, 50], b: [50, 100], m: [60, 75] } : e,
    );
    expect(reliefCorners(curved)).toEqual([]);
    expect(reliefCorners(CROSS.map((e) => ({ ...e, construction: true })))).toEqual([]);
  });

  it('marks a 135° inside corner not square', () => {
    const corners = reliefCorners(
      chain([
        [0, 0],
        [100, 0],
        [100, 50],
        [50, 50],
        [0, 100],
      ]),
    );
    expect(corners).toHaveLength(1);
    expect(corners[0]).toMatchObject({ point: [50, 50], square: false });
  });
});

describe('reliefSizes (§3.1): half the 90° bend zone + 0.5, up to 0.1 mm', () => {
  it('for 0.8 / 1.2 / 1.5 / 2 / 3 mm SPCC', () => {
    const table = [0.8, 1.2, 1.5, 2, 3].map((thickness) => [thickness, reliefSizes({ thickness, stock: 'spcc' })]);
    expect(table).toEqual([
      [0.8, { reach: 1.6, round: 3.2, square: 3.2, width: 0.8, rectDepth: 1.6, obroundDepth: 2 }],
      [1.2, { reach: 2, round: 4, square: 4, width: 1.2, rectDepth: 2, obroundDepth: 2.6 }],
      [1.5, { reach: 2.3, round: 4.6, square: 4.6, width: 1.5, rectDepth: 2.3, obroundDepth: 3.05 }],
      [2, { reach: 2.7, round: 5.4, square: 5.4, width: 2, rectDepth: 2.7, obroundDepth: 3.7 }],
      [3, { reach: 4.7, round: 9.4, square: 9.4, width: 3, rectDepth: 4.7, obroundDepth: 6.2 }],
    ]);
    expect(reliefSizes({ thickness: 0.3 }).width).toBe(0.5);
    expect(() => reliefSizes({ thickness: 0 })).toThrow('Type the sheet thickness');
  });

  it('lets a typed size win; an obround’s automatic depth follows its width', () => {
    expect(sized('square', { size: 3 })).toMatchObject({ size: 3, diameter: 4 });
    expect(sized('obround', { width: 2 })).toMatchObject({ width: 2, depth: 3 });
    expect(sized('rect', { width: 2 })).toMatchObject({ width: 2, depth: 2 });
    expect(sized('obround', { depth: 5 })).toMatchObject({ width: 1.2, depth: 5 });
    expect([
      describeRelief('round', sized('round')),
      describeRelief('square', sized('square')),
      describeRelief('rect', sized('rect')),
      describeRelief('obround', sized('obround')),
    ]).toEqual(['Round Ø4', 'Square 4 × 4', 'Rectangular 1.2 × 2', 'Obround 1.2 × 2.6']);
  });
});

describe('each shape on the cross corner (0, 0)', () => {
  // Walked in on e11 ([-20, 0] → [0, 0]), out on e12 ([0, 0] → [0, -20]).
  const near = (cut) => cut.entities.slice(10, 10 + 2 + cut.added.length);

  it('Square 4: the two edges trimmed to 2, four lines 2, 4, 4, 2 round the corner', () => {
    const cut = cutAt(CROSS, [0, 0], 'square');
    expect(cut).toMatchObject({ added: ['e13', 'e14', 'e15', 'e16'], nextId: 17, text: 'Square 4 × 4' });
    expect(near(cut)).toEqual([
      { id: 'e11', type: 'line', a: [-20, 0], b: [-2, 0] },
      { id: 'e13', type: 'line', a: [-2, 0], b: [-2, 2] },
      { id: 'e14', type: 'line', a: [-2, 2], b: [2, 2] },
      { id: 'e15', type: 'line', a: [2, 2], b: [2, -2] },
      { id: 'e16', type: 'line', a: [2, -2], b: [0, -2] },
      { id: 'e12', type: 'line', a: [0, -2], b: [0, -20] },
    ]);
    expect(cut.replaced).toEqual([CROSS[10], CROSS[11]]);
    expect(cut.entities).toHaveLength(16);
  });

  it('Round Ø4: the edges trimmed to R, one arc through the metal', () => {
    const cut = cutAt(CROSS, [0, 0], 'round');
    expect(cut).toMatchObject({ added: ['e13'], text: 'Round Ø4' });
    expect(near(cut)).toEqual([
      { id: 'e11', type: 'line', a: [-20, 0], b: [-2, 0] },
      { id: 'e13', type: 'arc', a: [-2, 0], b: [0, -2], m: [1.414214, 1.414214] },
      { id: 'e12', type: 'line', a: [0, -2], b: [0, -20] },
    ]);
  });

  it('Rectangular 1.2 × 2: a slot continuing the edge pointed at, from each edge', () => {
    // Pointed at e11 (its side of the corner): e11 runs on 2 past the corner, e12 is trimmed by 1.2.
    const fromE11 = cutAt(CROSS, [-0.3, 0.05], 'rect');
    expect(near(fromE11)).toEqual([
      { id: 'e11', type: 'line', a: [-20, 0], b: [2, 0] },
      { id: 'e13', type: 'line', a: [2, 0], b: [2, -1.2] },
      { id: 'e14', type: 'line', a: [2, -1.2], b: [0, -1.2] },
      { id: 'e12', type: 'line', a: [0, -1.2], b: [0, -20] },
    ]);
    const fromE12 = cutAt(CROSS, [0.05, -0.3], 'rect');
    expect(near(fromE12)).toEqual([
      { id: 'e11', type: 'line', a: [-20, 0], b: [-1.2, 0] },
      { id: 'e13', type: 'line', a: [-1.2, 0], b: [-1.2, 2] },
      { id: 'e14', type: 'line', a: [-1.2, 2], b: [0, 2] },
      { id: 'e12', type: 'line', a: [0, 2], b: [0, -20] },
    ]);
    expect(fromE11.text).toBe('Rectangular 1.2 × 2');
  });

  it('Obround 1.2 × 2.6: the same slot with a half-round bottom', () => {
    const cut = cutAt(CROSS, [-0.3, 0.05], 'obround');
    expect(near(cut)).toEqual([
      { id: 'e11', type: 'line', a: [-20, 0], b: [2, 0] },
      { id: 'e13', type: 'arc', a: [2, 0], b: [2, -1.2], m: [2.6, -0.6] },
      { id: 'e14', type: 'line', a: [2, -1.2], b: [0, -1.2] },
      { id: 'e12', type: 'line', a: [0, -1.2], b: [0, -20] },
    ]);
    // Depth exactly half the width: a half round, no straight side.
    const half = cutAt(CROSS, [-0.3, 0.05], 'obround', { width: 2, depth: 1 });
    expect(near(half)).toEqual([
      { id: 'e11', type: 'line', a: [-20, 0], b: [0, 0] },
      { id: 'e13', type: 'arc', a: [0, 0], b: [0, -2], m: [1, -1] },
      { id: 'e12', type: 'line', a: [0, -2], b: [0, -20] },
    ]);
  });

  it('a slot on a 135° corner trims the other edge by w / sin θ', () => {
    const outline = chain([
      [0, 0],
      [100, 0],
      [100, 50],
      [50, 50],
      [0, 100],
    ]);
    const cut = cutAt(outline, [50.3, 50.05], 'rect');
    expect(cut.entities.slice(2)).toEqual([
      { id: 'e3', type: 'line', a: [100, 50], b: [48, 50] },
      { id: 'e6', type: 'line', a: [48, 50], b: [48, 51.2] },
      // d + w·cot θ = 2 − 1.2 on this side.
      { id: 'e7', type: 'line', a: [48, 51.2], b: [48.8, 51.2] },
      { id: 'e4', type: 'line', a: [48.8, 51.2], b: [0, 100] },
      { id: 'e5', type: 'line', a: [0, 100], b: [0, 0] },
    ]);
    expect(cutAt(outline, [50, 50], 'round').text).toBe('Round Ø4');
  });
});

describe('the user’s own relief (§2.3)', () => {
  it('Square 2 on their tray corner gives the points they drew, without the skew', () => {
    const drawn = JSON.parse(
      readFileSync(resolve(process.cwd(), 'scripts/fixtures/corner-gaps-sample-bending.json'), 'utf8'),
    ).document.model.sketches[0].entities;
    const theirs = (id) => drawn.find((e) => e.id === id);
    const V = [285.970563, 82.029437];
    // Their two edges as they met before the relief, closed into an L of metal round the corner.
    const corner = [
      { ...theirs('e43'), b: V },
      { id: 'e57', type: 'line', a: V, b: [306.970563, 82.029437] },
      ...chain(
        [
          [306.970563, 82.029437],
          [306.970563, 60],
          [260, 60],
          [260, 103.029437],
          [285.970563, 103.029437],
        ],
        100,
      ).slice(0, 4),
    ];
    const cut = cutAt(corner, V, 'square', { size: 2 }, 51);
    expect(cut.entities.slice(0, 6)).toEqual([
      theirs('e43'),
      { ...theirs('e51'), id: 'e51' },
      { ...theirs('e54'), id: 'e52' },
      { ...theirs('e55'), id: 'e53' },
      // Their fifth line came out skew ending at (286.9855, 82.029325).
      { id: 'e54', type: 'line', a: theirs('e56').a, b: [286.970563, 82.029437] },
      { id: 'e57', type: 'line', a: [286.970563, 82.029437], b: [306.970563, 82.029437] },
    ]);
  });
});

describe('Rectangular and Obround on the tab', () => {
  it('from the tab’s side at both corners, a slot down into the base', () => {
    let cut = cutAt(TAB, [40, 100.3], 'rect');
    expect(cut.entities.slice(5, 9)).toEqual([
      { id: 'e6', type: 'line', a: [40, 120], b: [40, 98] },
      { id: 'e9', type: 'line', a: [40, 98], b: [38.8, 98] },
      { id: 'e10', type: 'line', a: [38.8, 98], b: [38.8, 100] },
      { id: 'e7', type: 'line', a: [38.8, 100], b: [0, 100] },
    ]);
    cut = cutAt(cut.entities, [60, 100.3], 'obround', {}, cut.nextId);
    expect(cut.entities.slice(2, 6)).toEqual([
      { id: 'e3', type: 'line', a: [100, 100], b: [61.2, 100] },
      { id: 'e11', type: 'line', a: [61.2, 100], b: [61.2, 98] },
      { id: 'e12', type: 'arc', a: [61.2, 98], b: [60, 98], m: [60.6, 97.4] },
      { id: 'e4', type: 'line', a: [60, 98], b: [60, 120] },
    ]);
  });

  it('from the base edge, the slot continues the base edge into the tab', () => {
    const cut = cutAt(TAB, [39.7, 100.05], 'rect');
    expect(cut.entities.slice(5, 9)).toEqual([
      { id: 'e6', type: 'line', a: [40, 120], b: [40, 101.2] },
      { id: 'e9', type: 'line', a: [40, 101.2], b: [42, 101.2] },
      { id: 'e10', type: 'line', a: [42, 101.2], b: [42, 100] },
      { id: 'e7', type: 'line', a: [42, 100], b: [0, 100] },
    ]);
  });

  it('on a point of a straight edge: the edge split in two, three lines join them', () => {
    const pick = reliefPick({ entities: TAB, raw: [50.2, 0.3], point: [50, 0], tolerance: 1, shape: 'rect' });
    expect(pick).toEqual({ type: 'edge', id: 'e1', at: [50, 0] });
    const cut = cutRelief({ entities: TAB, pick, shape: 'rect', sizes: sized('rect'), nextId: 9 });
    expect(cut.added).toEqual(['e9', 'e10', 'e11', 'e12']);
    expect(cut.entities.slice(0, 6)).toEqual([
      { id: 'e1', type: 'line', a: [0, 0], b: [49.4, 0] },
      { id: 'e9', type: 'line', a: [49.4, 0], b: [49.4, 2] },
      { id: 'e10', type: 'line', a: [49.4, 2], b: [50.6, 2] },
      { id: 'e11', type: 'line', a: [50.6, 2], b: [50.6, 0] },
      { id: 'e12', type: 'line', a: [50.6, 0], b: [100, 0] },
      TAB[1],
    ]);
    const obround = cutRelief({ entities: TAB, pick, shape: 'obround', sizes: sized('obround'), nextId: 9 });
    expect(obround.entities[2]).toEqual({ id: 'e10', type: 'arc', a: [49.4, 2], b: [50.6, 2], m: [50, 2.6] });
    expect(obround.text).toBe('Obround 1.2 × 2.6');
  });

  it('a rectangle’s side becomes four lines first (new ids), the rectangle goes in replaced', () => {
    const plate = [
      { id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] },
      { id: 'e2', type: 'circle', c: [50, 30], r: 10 },
    ];
    const pick = reliefPick({ entities: plate, raw: [50, 0.2], point: [50, 0], tolerance: 1, shape: 'rect' });
    expect(pick).toEqual({ type: 'edge', id: 'e1', side: 0, at: [50, 0] });
    const cut = cutRelief({ entities: plate, pick, shape: 'rect', sizes: sized('rect'), nextId: 3 });
    expect(cut.replaced).toEqual([plate[0]]);
    expect(cut.added).toEqual(['e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'e10']);
    expect(cut.entities.map((e) => [e.id, e.type, e.a, e.b])).toEqual([
      ['e3', 'line', [0, 0], [49.4, 0]],
      ['e7', 'line', [49.4, 0], [49.4, 2]],
      ['e8', 'line', [49.4, 2], [50.6, 2]],
      ['e9', 'line', [50.6, 2], [50.6, 0]],
      ['e10', 'line', [50.6, 0], [100, 0]],
      ['e4', 'line', [100, 0], [100, 60]],
      ['e5', 'line', [100, 60], [0, 60]],
      ['e6', 'line', [0, 60], [0, 0]],
      ['e2', 'circle', undefined, undefined],
    ]);
    expect(entitiesToProfile(cut.entities)).toMatchObject({ closed: true, holes: 1, problems: [] });
  });
});

describe('refusals (§3.1), nothing changed', () => {
  it('names what a pick cannot take', () => {
    const open = chain([
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]).slice(0, 3);
    expect(pickAt(TAB, [100, 0], 'rect').message).toBe('An outside corner needs no relief: move to an inside corner.');
    expect(pickAt(TAB, [50, 50], 'square').message).toBe(
      'No inside corner here: move to the corner that needs the relief.',
    );
    expect(pickAt(TAB, [50, 50], 'obround').message).toBe('No inside corner or straight edge here: move to one.');
    expect(pickAt(TAB, [50, 0.3], 'round').message).toBe(
      'Round and Square go on an inside corner: move to one, or use Obround or Rectangular on an edge.',
    );
    expect(
      pickAt(
        chain([
          [0, 0],
          [100, 0],
          [100, 50],
          [50, 50],
          [0, 100],
        ]),
        [50, 50],
        'square',
      ).message,
    ).toBe('Square needs a square corner: use Round here.');
    expect(pickAt(open, [100, 100], 'square').message).toBe(
      'Close the outline first: a relief is cut into a closed outline.',
    );
    expect(pickAt(open, [50, 0.3], 'rect').message).toBe(
      'Close the outline first: a relief is cut into a closed outline.',
    );
    const branching = [...TAB, { id: 'e9', type: 'line', a: [40, 100], b: [40, 60] }];
    expect(pickAt(branching, [40, 100], 'square').message).toBe(
      'Three or more lines meet at one point: fix the outline first.',
    );
  });

  it('refuses sizes, short edges, a shallow obround, a slot at an end and a cut through an edge', () => {
    const before = JSON.stringify(TAB);
    expect(refusal(() => cutAt(TAB, [40, 100], 'square', { size: 0 }))).toBe(
      'The relief size must be a positive number.',
    );
    expect(refusal(() => cutAt(TAB, [40, 100], 'round', { diameter: -1 }))).toBe(
      'The relief diameter must be a positive number.',
    );
    expect(refusal(() => cutAt(TAB, [40, 100.3], 'rect', { width: Number.NaN }))).toBe(
      'The relief width must be a positive number.',
    );
    expect(refusal(() => cutAt(TAB, [40, 100], 'square', { size: 50 }))).toBe(
      'The edge beside this corner is 20 mm long: the relief needs 25 mm of it.',
    );
    // An edge exactly as long as the trim: 0.01 mm of it must stay.
    expect(refusal(() => cutAt(TAB, [40, 100], 'square', { size: 40 }))).toBe(
      'The edge beside this corner is 20 mm long: the relief needs more than 20 mm of it.',
    );
    expect(refusal(() => cutAt(TAB, [40, 100.3], 'obround', { width: 2, depth: 0.5 }))).toBe(
      'An obround relief is at least half its width deep: 1 mm here.',
    );
    const atEnd = reliefPick({ entities: TAB, raw: [0.5, 0.05], tolerance: 0.1, shape: 'rect' });
    expect(atEnd).toEqual({ type: 'edge', id: 'e1', at: [0.5, 0] });
    expect(
      refusal(() => cutRelief({ entities: TAB, pick: atEnd, shape: 'rect', sizes: sized('rect'), nextId: 9 })),
    ).toBe('The slot needs 0.6 mm of the edge each side of its centre: move it away from the corner.');
    // A slot deeper than the base is tall runs out through the far edge.
    const deep = pickAt(TAB, [20, 0.3], 'rect');
    expect(
      refusal(() =>
        cutRelief({ entities: TAB, pick: deep, shape: 'rect', sizes: sized('rect', { depth: 110 }), nextId: 9 }),
      ),
    ).toBe('This relief would cut through another edge: make it smaller.');
    // A slot continuing the base edge 25 into a 20 mm tab runs out through its far side.
    expect(refusal(() => cutAt(TAB, [39.7, 100.05], 'rect', { depth: 25 }))).toBe(
      'This relief would cut through another edge: make it smaller.',
    );
    expect(JSON.stringify(TAB)).toBe(before);
    // A relief that swallows a cut-out beside the corner would leave it outside the outline.
    const holed = [...CROSS, { id: 'e40', type: 'circle', c: [4, 4], r: 2 }];
    expect(refusal(() => cutAt(holed, [0, 0], 'round', { diameter: 12 }, 50))).toBe(
      'This relief would cut through another edge: make it smaller.',
    );
    // Clear of the cut-out it is cut as anywhere else.
    expect(cutAt(holed, [0, 0], 'round', { diameter: 3 }, 50).text).toBe('Round Ø3');
  });
});

// The fold (§2.2, §5.1): bends through the cross's corners, segments kept within the base.
const CROSS_BENDS = [
  { id: 'b1', a: [8, 0], b: [192, 0], angle: 90, direction: 'up' },
  { id: 'b2', a: [192, 100], b: [8, 100], angle: 90, direction: 'up' },
  { id: 'b3', a: [0, 92], b: [0, 8], angle: 90, direction: 'up' },
  { id: 'b4', a: [200, 8], b: [200, 92], angle: 90, direction: 'up' },
];
const fold = (entities, bends, base) => {
  const { profile, closed, problems } = entitiesToProfile(entities);
  expect({ closed, problems }).toEqual({ closed: true, problems: [] });
  return foldSheet({ thickness: 1.2, stock: 'spcc', bends, base }, profile, {});
};
const relieveAll = (entities, corners, shape, raw = (c) => c) =>
  corners.reduce(
    (state, corner) => {
      const cut = cutRelief({
        entities: state.entities,
        pick: pickAt(state.entities, raw(corner), shape),
        shape,
        sizes: sized(shape),
        nextId: state.nextId,
      });
      return { entities: cut.entities, nextId: cut.nextId };
    },
    { entities, nextId: entities.length + 1 },
  ).entities;

describe('the fold takes the automatic reliefs (1.2 mm SPCC)', () => {
  const corners = [
    [0, 0],
    [200, 0],
    [200, 100],
    [0, 100],
  ];
  it('the bare cross is refused: its bends cross at the corners', () => {
    let message = '';
    try {
      fold(CROSS, CROSS_BENDS, [100, 50]);
    } catch (error) {
      message = crossingText(error);
    }
    expect(message).toMatch(/crosses/);
  });

  it('Square at the four corners folds with no warning', () => {
    const folded = fold(relieveAll(CROSS, corners, 'square'), CROSS_BENDS, [100, 50]);
    expect(folded.pieces).toHaveLength(5);
    expect(folded.warnings).toEqual([]);
  });

  it('Round at the four corners folds; each bend ending on its curve gets the outline-not-square note', () => {
    const folded = fold(relieveAll(CROSS, corners, 'round'), CROSS_BENDS, [100, 50]);
    expect(folded.pieces).toHaveLength(5);
    expect(folded.warnings.map((w) => w.code)).toEqual(Array(4).fill('outline-not-square'));
  });

  it('the tab: Rectangular, then Obround, at both corners lets a line 1 mm inside the edge bend the tab alone', () => {
    const bend = [{ id: 'b1', a: [41, 99], b: [59, 99], angle: 90, direction: 'up' }];
    const interval = (entities) => fold(entities, bend, [50, 50]).bends[0].intervals.map(([s0, s1]) => s1 - s0);
    // Bare, the line inside the edge finds the whole 100 mm strip.
    expect(interval(TAB)).toEqual([100]);
    const tabSide = (corner) => [corner[0], corner[1] + 0.3];
    for (const shape of ['rect', 'obround']) {
      const relieved = relieveAll(
        TAB,
        [
          [40, 100],
          [60, 100],
        ],
        shape,
        tabSide,
      );
      const [length] = interval(relieved);
      expect(length).toBeCloseTo(20, 9);
    }
  });
});
