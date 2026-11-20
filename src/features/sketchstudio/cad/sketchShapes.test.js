// HD-3's three shapes (docs/sketch-studio-hand-drawing.md §7.1, §7.8): a
// 22 × 5 slot at 30°, a hexagon 10 across flats and a 100 × 60 rectangle R5
// against hand-worked numbers; explode round trips (area and bounds); key
// points in their documented order; the words; the profile (outline and
// cut-out, the same JSON twice, a sketch stored before HD-3 unchanged, a fold
// of a blank with slot and polygon cut-outs); and the readers of §7.1.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cornerRadiusRefusal,
  polygonCorners,
  polygonName,
  polygonRefusal,
  shapeKeyPoints,
  shapePieces,
  slotRefusal,
} from './sketchShapes.js';
import {
  describeEntity,
  entitiesToProfile,
  entityKeyPoints,
  entityPolyline,
  explode,
  hitEntity,
  profileLoops,
  splitOutlines,
} from './sketchProfile.js';
import { arcGeometry } from './sketchProfile.js';
import { primitiveBox, primitives, entityIntersections } from './sketchIntersect.js';
import { snapPoint, snapTargets } from './sketchSnap.js';
import { boxSelect, describeSelection } from './sketchSelect.js';
import { checkDrawing } from './sketchCheck.js';
import { editEntity, entityFields, followDimensions } from './sketchEdit.js';
import { dimensionPick, pruneDimensions } from './sketchDimensions.js';
import { cutRelief, reliefPick } from './sketchRelief.js';
import { carryEntities, outlineEditor } from './outlineMove.js';
import { editableEntities, sketchFromSession } from './sketchOperations.js';
import { foldSheet } from './sheetMetal.js';

const close = (actual, expected, digits = 6) => expect(actual).toBeCloseTo(expected, digits);
// An area to 1e-6 of itself: every drawn point is rounded to 1e-6 mm, which moves an area by about its perimeter × 1e-6.
const closeArea = (actual, expected) => expect(Math.abs(actual - expected) / expected).toBeLessThan(1e-6);
const closePoint = (p, q, digits = 6) => {
  close(p[0], q[0], digits);
  close(p[1], q[1], digits);
};
const rad = (d) => (d * Math.PI) / 180;

// Hand-worked: a 22 × 5 slot at 30° about (60, 28): the end centres 8.5 mm
// from the centre (11 − 2.5), u = (cos 30°, sin 30°) = (0.866025, 0.5), n = (−0.5, 0.866025).
const slot = { id: 'e2', type: 'slot', c: [60, 28], length: 22, width: 5, angle: 30 };
const u = [Math.cos(rad(30)), Math.sin(rad(30))],
  n = [-Math.sin(rad(30)), Math.cos(rad(30))];
const at = (s, v) => [60 + u[0] * s + n[0] * v, 28 + u[1] * s + n[1] * v];
// A hexagon 10 across flats about (150, 50), a flat at the bottom: R = 5 / cos 30° = 5.773503.
const hexagon = { id: 'e3', type: 'polygon', c: [150, 50], sides: 6, af: 10, angle: 0 };
const R = 5 / Math.cos(rad(30));
// A 100 × 60 rectangle R5 from the origin.
const rounded = { id: 'e1', type: 'rect', a: [0, 0], b: [100, 60], r: 5 };

// The area a loop of lines and arcs encloses (counter-clockwise positive):
// the polygon of its ends plus each arc's segment.
function loopArea(pieces) {
  let area = 0;
  for (const piece of pieces) {
    area += (piece.a[0] * piece.b[1] - piece.b[0] * piece.a[1]) / 2;
    if (piece.type === 'arc') {
      const { radius, sweep } = arcGeometry(piece.a, piece.m, piece.b);
      area += (radius * radius * (sweep - Math.sin(sweep))) / 2;
    }
  }
  return area;
}
// The exact bounds of a loop (each arc's own extent).
function loopBounds(entity) {
  return primitives(entity)
    .map(primitiveBox)
    .reduce(
      (box, b) => [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
}
// The points the exact bounds come from: a slot's two end circles' extremes, a polygon's corners, a rectangle's box.
function polygonOf(shape) {
  if (shape.type === 'polygon') return polygonCorners(shape);
  if (shape.type === 'rect') return [shape.a, shape.b];
  const t = rad(shape.angle),
    h = shape.length / 2 - shape.width / 2,
    r = shape.width / 2;
  return [-h, h].flatMap((s) => {
    const c = [shape.c[0] + Math.cos(t) * s, shape.c[1] + Math.sin(t) * s];
    return [
      [c[0] - r, c[1] - r],
      [c[0] + r, c[1] + r],
    ];
  });
}
const joined = (pieces) =>
  pieces.every((p, i) => {
    const next = pieces[(i + 1) % pieces.length];
    return Math.hypot(p.b[0] - next.a[0], p.b[1] - next.a[1]) < 1e-9;
  });

describe('the three shapes against hand-worked numbers', () => {
  it('a 22 × 5 slot at 30°: its sides, ends, key points, area and bounds', () => {
    const pieces = explode(slot);
    expect(pieces.map((p) => p.type)).toEqual(['line', 'arc', 'line', 'arc']);
    closePoint(pieces[0].a, at(-8.5, -2.5));
    closePoint(pieces[0].a, [53.888784, 21.584936]);
    closePoint(pieces[0].b, [68.611216, 30.084936]);
    // The far end: through its tip, 11 mm along the slot.
    closePoint(pieces[1].m, at(11, 0));
    closePoint(pieces[1].m, [69.526279, 33.5]);
    expect(joined(pieces)).toBe(true);
    // Area: (22 − 5) × 5 + π 2.5² = 85 + 19.634954.
    closeArea(loopArea(pieces), 104.634954);
    // Bounds: the end centres (60 ∓ 7.361216, 28 ∓ 4.25) ± 2.5.
    const box = loopBounds(slot);
    [50.138784, 21.25, 69.861216, 34.75].forEach((v, i) => close(box[i], v));
    // Key points: centre, end centres, tips, the four side ends, the two side middles.
    const keys = entityKeyPoints(slot).map((k) => k.point);
    expect(keys).toHaveLength(11);
    [
      [60, 28],
      at(-8.5, 0),
      at(8.5, 0),
      at(-11, 0),
      at(11, 0),
      at(-8.5, -2.5),
      at(8.5, -2.5),
      at(8.5, 2.5),
      at(-8.5, 2.5),
      at(0, -2.5),
      at(0, 2.5),
    ].forEach((p, i) => closePoint(keys[i], p));
    expect(entityKeyPoints(slot).map((k) => k.kind)).toEqual([
      'center',
      'center',
      'center',
      'quadrant',
      'quadrant',
      'endpoint',
      'endpoint',
      'endpoint',
      'endpoint',
      'midpoint',
      'midpoint',
    ]);
  });

  it('a hexagon 10 across flats: corners, flat middles, area and bounds', () => {
    const corners = polygonCorners(hexagon);
    // The bottom flat from (150 − R/2, 45) to (150 + R/2, 45), then round counter-clockwise.
    closePoint(corners[0], [150 - R / 2, 45]);
    closePoint(corners[1], [150 + R / 2, 45]);
    closePoint(corners[2], [150 + R, 50]);
    closePoint(corners[3], [150 + R / 2, 55]);
    closePoint(corners[4], [150 - R / 2, 55]);
    closePoint(corners[5], [150 - R, 50]);
    close(R, 5.773503);
    const pieces = explode(hexagon);
    expect(pieces).toHaveLength(6);
    expect(pieces.every((p) => p.type === 'line')).toBe(true);
    expect(joined(pieces)).toBe(true);
    // Area: (√3 / 2) × 10² = 86.602540.
    closeArea(loopArea(pieces), 86.60254);
    const box = loopBounds(hexagon);
    [150 - R, 45, 150 + R, 55].forEach((v, i) => close(box[i], v));
    const keys = entityKeyPoints(hexagon);
    expect(keys).toHaveLength(13);
    closePoint(keys[0].point, [150, 50]);
    closePoint(keys[7].point, [150, 45]); // the first flat middle: the bottom
    expect(keys.map((k) => k.kind)).toEqual(['center', ...Array(6).fill('endpoint'), ...Array(6).fill('midpoint')]);
    // Across corners 2R; odd counts measure across flats too (twice the inradius).
    const triangle = { ...hexagon, sides: 3, af: 10 };
    const t = polygonCorners(triangle);
    close(Math.hypot(t[0][0] - 150, t[0][1] - 50), 10); // R = (af / 2) / cos 60°
    close(Math.min(...t.map((p) => p[1])), 45); // the flat 5 mm below the centre
  });

  it('a 100 × 60 rectangle R5: four sides and four quarter arcs, area and bounds; R half the height: two lines', () => {
    const pieces = explode(rounded);
    expect(pieces.map((p) => p.type)).toEqual(['line', 'arc', 'line', 'arc', 'line', 'arc', 'line', 'arc']);
    expect(pieces[0]).toMatchObject({ a: [5, 0], b: [95, 0] });
    expect(pieces[1].b).toEqual([100, 5]);
    closePoint(pieces[1].m, [95 + 5 * Math.SQRT1_2, 5 - 5 * Math.SQRT1_2]);
    expect(joined(pieces)).toBe(true);
    // 6000 − (4 − π) 25 = 5978.539816.
    closeArea(loopArea(pieces), 5978.539816);
    expect(loopBounds(rounded).map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([0, 0, 100, 60]);
    // Key points: four arc centres, eight tangent points, four side middles, the centre.
    const keys = entityKeyPoints(rounded);
    expect(keys).toHaveLength(17);
    expect(keys.slice(0, 4).map((k) => k.point)).toEqual([
      [5, 5],
      [95, 5],
      [95, 55],
      [5, 55],
    ]);
    expect(keys.slice(4, 12).map((k) => k.point)).toEqual([
      [5, 0],
      [95, 0],
      [100, 5],
      [100, 55],
      [95, 60],
      [5, 60],
      [0, 55],
      [0, 5],
    ]);
    expect(keys.slice(12).map((k) => k.point)).toEqual([
      [50, 0],
      [100, 30],
      [50, 60],
      [0, 30],
      [50, 30],
    ]);
    // R half the height (30): the side ends vanish, two lines and two half-round ends.
    const capsule = { ...rounded, r: 30 };
    expect(explode(capsule).map((p) => p.type)).toEqual(['line', 'arc', 'line', 'arc']);
    closeArea(loopArea(explode(capsule)), 40 * 60 + Math.PI * 900);
    // A square with R half its side is a circle (two half rounds).
    const disc = { id: 'e9', type: 'rect', a: [0, 0], b: [20, 20], r: 10 };
    expect(explode(disc).map((p) => p.type)).toEqual(['arc', 'arc']);
    closeArea(loopArea(explode(disc)), Math.PI * 100);
    // A sharp rectangle is as before: four sides from the lower-left corner, nine key points.
    const sharp = { id: 'e4', type: 'rect', a: [100, 60], b: [0, 0] };
    expect(explode(sharp).map((p) => [p.a, p.b])).toEqual([
      [
        [0, 0],
        [100, 0],
      ],
      [
        [100, 0],
        [100, 60],
      ],
      [
        [100, 60],
        [0, 60],
      ],
      [
        [0, 60],
        [0, 0],
      ],
    ]);
    expect(entityKeyPoints(sharp)).toHaveLength(9);
  });

  it('explodes round trip: every shape’s pieces enclose its area and bounds to 1e-6, with no zero-length piece', () => {
    const shapes = [
      slot,
      { ...slot, angle: -135, length: 40, width: 39.5 },
      hexagon,
      ...[3, 4, 5, 7, 8, 9, 12].map((sides) => ({ ...hexagon, sides, angle: 17 })),
      rounded,
      { ...rounded, r: 0.25 },
    ];
    for (const shape of shapes) {
      const pieces = explode(shape);
      expect(joined(pieces), JSON.stringify(shape)).toBe(true);
      expect(pieces.every((p) => Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) > 1e-9)).toBe(true);
      let area;
      if (shape.type === 'slot') area = (shape.length - shape.width) * shape.width + Math.PI * (shape.width / 2) ** 2;
      else if (shape.type === 'polygon')
        area = (shape.sides * shape.af * shape.af * Math.tan(Math.PI / shape.sides)) / 4;
      else area = 100 * 60 - (4 - Math.PI) * shape.r * shape.r;
      expect(Math.abs(loopArea(pieces) - area) / area, JSON.stringify(shape)).toBeLessThan(1e-6);
      // Bounds to 1e-6 mm.
      const ring = polygonOf(shape);
      const want = [
        Math.min(...ring.map((p) => p[0])),
        Math.min(...ring.map((p) => p[1])),
        Math.max(...ring.map((p) => p[0])),
        Math.max(...ring.map((p) => p[1])),
      ];
      loopBounds(shape).forEach((v, i) => expect(Math.abs(v - want[i]), JSON.stringify(shape)).toBeLessThan(1e-6));
      // The drawn polyline lies within the exact bounds.
      const box = loopBounds(shape);
      for (const [x, y] of entityPolyline(shape))
        expect(x >= box[0] - 1e-6 && x <= box[2] + 1e-6 && y >= box[1] - 1e-6 && y <= box[3] + 1e-6).toBe(true);
    }
    // A piece keeps the entity's construction flag; with ids, "{id}.{n}".
    expect(explode({ ...hexagon, construction: true }, { ids: true })[2]).toMatchObject({
      id: 'e3.3',
      type: 'line',
      construction: true,
    });
    expect(explode({ id: 'x', type: 'unknown' })).toEqual([]);
  });
});

describe('refusals and words', () => {
  it('refuses in words', () => {
    expect(slotRefusal({ length: 5, width: 5 })).toBe("A slot's length must be more than its width.");
    expect(slotRefusal({ length: 22, width: 0 })).toBe('A slot needs a width greater than zero.');
    expect(slotRefusal(slot)).toBe('');
    expect(polygonRefusal({ sides: 13, af: 10 })).toBe('A polygon has 3 to 12 sides.');
    expect(polygonRefusal({ sides: 6, af: 0 })).toBe('A polygon needs a size greater than zero.');
    expect(cornerRadiusRefusal({ a: [0, 0], b: [100, 24] }, 13)).toBe(
      'The corner radius can be at most half the shorter side: 12 mm here.',
    );
    expect(cornerRadiusRefusal({ a: [0, 0], b: [100, 24] }, 12)).toBe('');
    expect(cornerRadiusRefusal({ a: [0, 0], b: [100, 24] }, null)).toBe('');
    // A refused size has no pieces; a radius too large reads as sharp.
    expect(shapePieces({ ...slot, length: 4 })).toEqual([]);
    expect(shapeKeyPoints({ ...hexagon, sides: 2 })).toEqual([]);
    expect(explode({ ...rounded, r: 31 })).toHaveLength(4);
  });

  it('names polygons and says what is selected', () => {
    expect([3, 4, 5, 6, 7, 8, 9, 12].map(polygonName)).toEqual([
      'Triangle',
      'Square',
      'Pentagon',
      'Hexagon',
      'Heptagon',
      'Octagon',
      '9-sided polygon',
      '12-sided polygon',
    ]);
    expect(describeEntity(slot)).toBe('Slot 22 × 5 at (60, 28)');
    expect(describeEntity(hexagon, [100, 0])).toBe('Hexagon 10 across flats at (50, 50)');
    expect(describeEntity(rounded)).toBe('Rectangle 100 × 60, corners R5 at (0, 0)');
    expect(describeEntity({ ...rounded, r: undefined })).toBe('Rectangle 100 × 60 at (0, 0)');
    expect(describeSelection([slot, hexagon, rounded], ['e1', 'e2', 'e3'])).toBe(
      '3 selected: 1 slot, 1 polygon, 1 rectangle',
    );
  });
});

describe('the profile', () => {
  it('takes each shape as an outline and as a cut-out, the same JSON every time', () => {
    // As outlines: a path from the first line's start, a polygon's points.
    const asOutline = (entity) => entitiesToProfile([entity]).profile;
    expect(asOutline(rounded)).toMatchObject({ type: 'path', start: [5, 0], closed: true });
    expect(asOutline(rounded).segments).toHaveLength(8);
    expect(asOutline(rounded).segments.at(-1)).toEqual({
      type: 'arc',
      end: [5, 0],
      mid: [1.464466, 1.464466],
    });
    expect(asOutline(slot)).toMatchObject({ type: 'path', start: [53.888784, 21.584936], closed: true });
    expect(asOutline(slot).segments.map((s) => s.type)).toEqual(['line', 'arc', 'line', 'arc']);
    expect(asOutline(hexagon)).toEqual({ type: 'polygon', points: polygonCorners(hexagon) });
    // A disc-like rounded square starts at its first arc.
    expect(asOutline({ id: 'e9', type: 'rect', a: [0, 0], b: [20, 20], r: 10 }).start).toEqual([10, 0]);
    // Half the width: a half round at the bottom first, then the right side.
    expect(explode({ id: 'e8', type: 'rect', a: [0, 0], b: [20, 50], r: 10 }).map((p) => p.type)).toEqual([
      'arc',
      'line',
      'arc',
      'line',
    ]);
    // As cut-outs of a 240 × 160 outline.
    const plate = [
      { id: 'e1', type: 'rect', a: [0, 0], b: [240, 160], r: 8 },
      { ...slot, id: 'e2' },
      { ...hexagon, id: 'e3', c: [150, 50] },
      { id: 'e4', type: 'rect', a: [150, 100], b: [200, 130], r: 5 },
    ];
    const result = entitiesToProfile(plate);
    expect(result).toMatchObject({ closed: true, problems: [], loops: 4, holes: 3 });
    expect(result.profile.holes.map((h) => h.type)).toEqual(['path', 'polygon', 'path']);
    expect(JSON.stringify(entitiesToProfile(plate))).toBe(JSON.stringify(result));
    // editableEntities: the stored entities give the stored profile back, so they reopen as drawn.
    const { sketch: stored } = sketchFromSession({
      session: {},
      entities: plate,
      existing: { id: 's1', name: 'Blank', plane: 'XY' },
      name: 'Blank',
    });
    expect(editableEntities(stored)).toBe(plate);
    // A construction slot takes no part.
    expect(entitiesToProfile([...plate, { ...slot, id: 'e5', c: [30, 30], construction: true }]).holes).toBe(3);
    // One outline per separate shape.
    expect(splitOutlines([{ ...hexagon }, { ...slot, id: 'e9', c: [300, 300] }])).toHaveLength(2);
    expect(profileLoops(plate).loops.map((l) => l.kind)).toEqual(['shape', 'shape', 'shape', 'shape']);
  });

  it('opens and finishes a sketch stored before HD-3 byte for byte as it was', () => {
    // As a finish wrote it before HD-3: id, name, plane, profile, entities, primitives, constrained.
    const stored = {
      id: 's1',
      name: 'Sketch 1',
      plane: 'XY',
      profile: null,
      entities: [
        { id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] },
        { id: 'e2', type: 'circle', c: [30, 30], r: 5 },
        { id: 'e3', type: 'line', a: [60, 10], b: [80, 10] },
        { id: 'e4', type: 'line', a: [80, 10], b: [70, 30] },
        { id: 'e5', type: 'line', a: [70, 30], b: [60, 10] },
      ],
      primitives: [],
      constrained: false,
    };
    stored.profile = entitiesToProfile(stored.entities).profile;
    const before = JSON.stringify(stored);
    // The profile of a sharp rectangle with its holes is exactly as before HD-3.
    expect(stored.profile).toMatchObject({ type: 'rectangle', width: 100, height: 60, origin: [0, 0] });
    expect(editableEntities(stored)).toBe(stored.entities);
    const { sketch: finished } = sketchFromSession({
      session: {},
      entities: editableEntities(stored),
      existing: stored,
      name: 'Sketch 1',
    });
    expect(finished.entities).toBe(stored.entities);
    expect(JSON.stringify(finished)).toBe(before);
    expect(JSON.stringify(stored)).toBe(before);
  });

  it('folds a blank whose cut-outs are slots and polygons on one bend', () => {
    const blank = [
      { id: 'e1', type: 'rect', a: [0, 0], b: [200, 120], r: 4 },
      ...[30, 60, 90].map((x, i) => ({ id: `e${i + 2}`, type: 'slot', c: [x, 30], length: 22, width: 5, angle: 90 })),
      ...[30, 60, 90].map((x, i) => ({ id: `e${i + 5}`, type: 'polygon', c: [x, 90], sides: 6, af: 10, angle: 0 })),
    ];
    const { profile } = entitiesToProfile(blank);
    expect(profile.holes).toHaveLength(6);
    const feature = {
      id: 'sm',
      type: 'sheetmetal',
      thickness: 1.2,
      stock: 'spcc',
      kFactor: null,
      base: null,
      marks: [],
      bends: [{ id: 'b1', a: [150, 0], b: [150, 120], angle: 90, direction: 'up', radius: null }],
    };
    const fold = foldSheet(feature, profile);
    expect(fold.bends).toHaveLength(1);
    // The flat blank's area: the rounded outline less three slots and three hexagons.
    const slotArea = 17 * 5 + Math.PI * 6.25,
      hexArea = (Math.sqrt(3) / 2) * 100;
    // (the fold samples arcs to 0.05 mm chords: within 1e-4 of the area)
    const area = 200 * 120 - (4 - Math.PI) * 16 - 3 * slotArea - 3 * hexArea;
    expect(Math.abs(fold.flat.area - area) / area).toBeLessThan(1e-4);
    // Seven pierces: the outline and its six cut-outs; 200 mm wide flat.
    expect(fold.flat.pierces).toBe(7);
    expect(fold.flat.width).toBeCloseTo(200, 6);
  });
});

describe('the readers of §7.1', () => {
  it('snap to a slot’s tip and to where a line crosses its end; select it by a box; hit it on an arc', () => {
    const line = { id: 'e9', type: 'line', a: [69.5, 20], b: [69.5, 40] };
    const targets = snapTargets({ entities: [slot, line] });
    const tip = at(11, 0);
    expect(snapPoint([tip[0] + 0.3, tip[1] - 0.2], { targets, tolerance: 1 })).toMatchObject({ kind: 'quadrant' });
    // The line x = 69.5 crosses the far end's arc (centre at(8.5, 0), r 2.5) twice.
    const crossings = entityIntersections(line, slot);
    expect(crossings).toHaveLength(2);
    const centre = at(8.5, 0);
    for (const p of crossings) close(Math.hypot(p[0] - centre[0], p[1] - centre[1]), 2.5);
    expect(snapPoint([crossings[0][0] + 0.2, crossings[0][1]], { targets, tolerance: 0.6 }).kind).toBe('intersection');
    expect(
      boxSelect(
        [slot, hexagon],
        [
          [50, 21],
          [70, 35],
        ],
        'inside',
      ),
    ).toEqual(['e2']);
    expect(
      boxSelect(
        [slot, hexagon],
        [
          [50, 21],
          [69, 35],
        ],
        'inside',
      ),
    ).toEqual([]);
    expect(
      boxSelect(
        [slot, hexagon],
        [
          [50, 21],
          [69, 35],
        ],
        'touching',
      ),
    ).toEqual(['e2']);
    expect(hitEntity([slot, hexagon], [150 + R - 0.05, 50], 0.2)).toBe('e3');
  });

  it('Check finds a copied slot and a polygon crossing the outline; the numbers row reads and edits each', () => {
    const outline = { id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] };
    const copies = checkDrawing([outline, { ...slot, c: [40, 30] }, { ...slot, id: 'e5', c: [40, 30], angle: -150 }]);
    expect(copies.problems.map((p) => p.kind)).toEqual(['duplicate']);
    expect(copies.problems[0].text).toBe('Two slots on the same place at (40, 30)');
    const crossing = checkDrawing([outline, { ...hexagon, c: [100, 30] }]);
    expect(crossing.problems.map((p) => p.kind)).toEqual(['crossing']);
    expect(crossing.problems[0].text).toMatch(/^A cut-out crosses the outline at/);
    expect(checkDrawing([outline, { ...slot, c: [40, 30] }]).notes).toEqual([
      'Nothing to fix: a closed outline with 1 cut-out.',
    ]);
    // The row: a slot's X, Y, Length, Width, Angle; a polygon's X, Y, Sides, Across flats, Angle; a rectangle's Radius.
    const values = (entity, zero) => Object.fromEntries(entityFields(entity, zero).map((f) => [f.label, f.value]));
    expect(values(slot, [10, 0])).toEqual({ X: 50, Y: 28, Length: 22, Width: 5, Angle: 30 });
    expect(values(hexagon)).toEqual({ X: 150, Y: 50, Sides: 6, 'Across flats': 10, Angle: 0 });
    expect(values(rounded)).toMatchObject({ Width: 100, Height: 60, Radius: 5 });
    const edit = (entity, patch) => editEntity([entity], entity.id, patch)[0];
    expect(edit(slot, { length: 30, x: 70 })).toEqual({ ...slot, length: 30, c: [70, 28] });
    expect(() => edit(slot, { width: 22 })).toThrow("A slot's length must be more than its width.");
    expect(edit(hexagon, { sides: 8, af: 12 })).toEqual({ ...hexagon, sides: 8, af: 12 });
    expect(() => edit(hexagon, { sides: 2 })).toThrow('A polygon has 3 to 12 sides.');
    expect(edit(rounded, { r: null })).toEqual({ id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] });
    expect(edit(rounded, { r: 0 })).toEqual({ id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] });
    expect(edit({ ...rounded, r: undefined }, { r: 8 })).toMatchObject({ r: 8 });
    expect(() => edit(rounded, { r: 31 })).toThrow(
      'The corner radius can be at most half the shorter side: 30 mm here.',
    );
    expect(() => edit(rounded, { height: 8 })).toThrow(
      'The corner radius can be at most half the shorter side: 4 mm here.',
    );
  });

  it('dimensions a slot’s side as a side and its end as an arc; they follow an edit and go with it', () => {
    const side = dimensionPick({
      point: at(0, -2.4),
      kind: 'on sketch',
      raw: at(0, -2.4),
      tolerance: 0.5,
      entities: [slot],
    });
    expect(side.type).toBe('span');
    expect(side.source).toBe('side');
    close(Math.hypot(side.to[0] - side.from[0], side.to[1] - side.from[1]), 17);
    const end = dimensionPick({
      point: at(10.9, 0.4),
      kind: 'on sketch',
      raw: at(10.9, 0.4),
      tolerance: 0.5,
      entities: [slot],
    });
    expect(end).toMatchObject({ type: 'circle', mode: 'radius', radius: 2.5 });
    const corner = dimensionPick({
      point: [1, 1],
      kind: 'on sketch',
      raw: [1.4, 1.4],
      tolerance: 0.5,
      entities: [rounded],
    });
    expect(corner).toMatchObject({ type: 'circle', mode: 'radius', radius: 5, center: [5, 5] });
    // A radial one on the far end follows a turn of the slot; one on its centre follows a move.
    const radial = { id: 'd1', type: 'radial', mode: 'radius', center: end.center, radius: 2.5, at: at(14, 0) };
    const linear = { id: 'd2', type: 'linear', from: [60, 28], to: [0, 28], orientation: 'horizontal', offset: 5 };
    const moved = { ...slot, c: [70, 28] };
    const [r2, l2] = followDimensions([radial, linear], slot, moved);
    closePoint(r2.center, [end.center[0] + 10, end.center[1]]);
    expect(l2.from).toEqual([70, 28]);
    // The slot gone: the radial dimension on its end goes with it.
    expect(pruneDimensions([radial], slot, [])).toEqual([]);
    expect(pruneDimensions([radial], slot, [slot])).toEqual([radial]);
  });

  it('cuts a relief into a polygon cut-out’s corner (the polygon becomes its lines) and none into a rounded corner', () => {
    const outline = { id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] };
    const square = { id: 'e2', type: 'polygon', c: [50, 30], sides: 4, af: 20, angle: 0 };
    const entities = [outline, square];
    const pick = reliefPick({ entities, raw: [40.2, 20.2], tolerance: 1, shape: 'round' });
    expect(pick.type).toBe('corner');
    const cut = cutRelief({ entities, pick, shape: 'round', sizes: { diameter: 4 }, nextId: 3 });
    expect(cut.replaced).toEqual([square]);
    expect(cut.entities.some((e) => e.type === 'polygon')).toBe(false);
    expect(cut.entities.filter((e) => e.type === 'line')).toHaveLength(4);
    expect(entitiesToProfile(cut.entities)).toMatchObject({ closed: true, holes: 1 });
    // A rounded cut-out's corners are arcs: no corner there.
    const window = { id: 'e2', type: 'rect', a: [30, 20], b: [70, 40], r: 4 };
    expect(reliefPick({ entities: [outline, window], raw: [30.5, 20.5], tolerance: 1, shape: 'round' }).type).toBe(
      'none',
    );
  });

  it('carries a rounded outline through an edge move as its lines and arcs, or leaves it to the rebuild', () => {
    const entities = [rounded, { ...slot, id: 'e2', c: [50, 30], angle: 0 }];
    const profile = entitiesToProfile(entities).profile;
    // The right side (segment 2) moved 5 mm: in step, the rectangle becomes its pieces with new ids.
    let editor = outlineEditor(profile);
    editor.move(editor.edge({ loop: 0, index: 2 }), 5);
    let next = editor.profile();
    const carried = carryEntities(entities, profile, next, editor.trace());
    // Its four arcs kept, its sides moved or joined by new short sides where the arcs stay.
    expect(carried.filter((e) => e.type === 'arc')).toHaveLength(4);
    expect(carried.some((e) => e.type === 'rect')).toBe(false);
    expect(new Set(carried.map((e) => e.id)).size).toBe(carried.length);
    expect(carried.at(-1)).toBe(entities[1]);
    expect(JSON.stringify(entitiesToProfile(carried).profile)).toBe(JSON.stringify(next));
    // The bottom side (where the path starts): not in step, so the caller rebuilds from the profile (null).
    editor = outlineEditor(profile);
    editor.move(editor.edge({ loop: 0, index: 0 }), 5);
    next = editor.profile();
    expect(carryEntities(entities, profile, next, editor.trace())).toBe(null);
  });
});

describe('purity', () => {
  it('sketchShapes.js, sketchTransform.js and sketchPattern.js: pure modules, LF', () => {
    for (const [name, allowed] of [
      ['sketchShapes.js', []],
      ['sketchTransform.js', ['./sketchProfile.js', './sketchEdit.js']],
      ['sketchPattern.js', ['./sketchTransform.js', './sketchCheck.js']],
    ]) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
      expect(
        [...source.matchAll(/^import [^;]* from '([^']+)';/gm)].map((m) => m[1]),
        name,
      ).toEqual(allowed);
      expect(source, name).not.toMatch(/\b(document|window|navigator)\./);
      expect(source, name).not.toContain('\r\n');
    }
  });
});
