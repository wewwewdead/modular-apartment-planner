// Sketch dimensions SD-1 (docs/sketch-studio-sketch-dimensions.md §3.1, §3.2,
// §3.5): what a Dimension click takes, the drawing, hit testing, pruning when
// geometry goes, the split for shop outlines, and the sketch entry / model
// rules that keep the key only when there are dimensions.
import { describe, expect, it } from 'vitest';
import {
  describeDimension,
  describePick,
  dimensionGeometry,
  dimensionPick,
  dimensionPoints,
  hitDimension,
  linearDimension,
  nextDimensionNumber,
  pruneDimensions,
  radialDimension,
  splitDimensions,
} from './sketchDimensions.js';
import { outlineSketches, sketchFromSession } from './sketchOperations.js';
import { emptyModel, normalizeModel } from './model.js';
import { planeFrame } from './sketchPlane.js';

const rect = { id: 'e1', type: 'rect', a: [0, 0], b: [300, 200] };
const hole = { id: 'e2', type: 'circle', c: [50, 50], r: 10 };
const line = { id: 'e3', type: 'line', a: [400, 0], b: [400, 100] };
const arc = { id: 'e4', type: 'arc', a: [500, 0], b: [500, 40], m: [520, 20] };
const entities = [rect, hole, line, arc];
const close = (actual, expected, digits = 6) =>
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, digits));
const length = ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

describe('dimensionPick: the first click', () => {
  const first = (point, kind, raw = point) => dimensionPick({ point, kind, raw, tolerance: 2, entities });
  it('takes a key point as a point', () => {
    expect(first([50, 50], 'center')).toEqual({ type: 'point', point: [50, 50] });
    expect(first([0, 0], 'origin')).toEqual({ type: 'point', point: [0, 0] });
    expect(first([300, 200], 'endpoint', [301, 199])).toEqual({ type: 'point', point: [300, 200] });
  });
  it('takes a line body as the span of its two ends', () => {
    expect(first([400, 50], 'on sketch', [400.5, 50])).toEqual({
      type: 'span',
      source: 'line',
      from: [400, 0],
      to: [400, 100],
    });
  });
  it('takes a rectangle body as the side under the cursor', () => {
    expect(first([150, 200], 'on sketch', [150, 200.4])).toEqual({
      type: 'span',
      source: 'side',
      from: [300, 200],
      to: [0, 200],
    });
    expect(first([0, 120], 'on sketch', [0.3, 120])).toMatchObject({ from: [0, 200], to: [0, 0] });
  });
  it('takes a circle as its diameter and an arc as its radius', () => {
    expect(first([60, 50], 'on sketch', [60.3, 50])).toEqual({
      type: 'circle',
      center: [50, 50],
      radius: 10,
      mode: 'diameter',
    });
    expect(first([520, 20], 'on sketch', [520.2, 20])).toEqual({
      type: 'circle',
      center: [500, 20],
      radius: 20,
      mode: 'radius',
    });
  });
  it('takes the snapped point in free space, on the grid or on a model edge', () => {
    expect(first([150, 100], 'grid', [150.4, 100.2])).toEqual({ type: 'point', point: [150, 100] });
    expect(first([150.4, 100.2], 'free')).toEqual({ type: 'point', point: [150.4, 100.2] });
    expect(first([150, -50], 'on edge', [150, -50.3])).toEqual({ type: 'point', point: [150, -50] });
  });
});

describe('dimensionPick: the second click', () => {
  const boundary = [
    [
      [-100, -50],
      [500, -50],
    ],
  ];
  const second = (first, point, kind, raw = point, extra = {}) =>
    dimensionPick({ point, kind, raw, tolerance: 2, entities, boundary, first, ...extra });
  it('takes a key point as it is', () => {
    expect(second([50, 50], [300, 200], 'endpoint')).toEqual({ type: 'point', point: [300, 200] });
  });
  it('reads square to an axis-aligned edge: the foot of the perpendicular', () => {
    // A hole centre to the plate's left side, clicked anywhere along it.
    expect(second([50, 50], [0, 47], 'on sketch', [0.4, 47])).toEqual({ type: 'point', point: [0, 50] });
    expect(second([50, 50], [0, 140], 'on sketch', [0.4, 140])).toEqual({ type: 'point', point: [0, 50] });
    // A model edge counts too.
    expect(second([50, 50], [170.3, -50], 'on edge', [170.3, -50.2])).toEqual({ type: 'point', point: [50, -50] });
  });
  it('reads square to a slanted edge', () => {
    const slanted = [{ id: 'e1', type: 'line', a: [0, 0], b: [100, 100] }];
    const pick = dimensionPick({
      point: [30, 30],
      kind: 'on sketch',
      raw: [30.3, 29.7],
      tolerance: 1,
      entities: slanted,
      first: [100, 0],
    });
    expect(pick).toEqual({ type: 'point', point: [50, 50] });
  });
  it('keeps the snapped point when the foot falls off the edge', () => {
    const short = [{ id: 'e1', type: 'line', a: [0, 0], b: [10, 0] }];
    const pick = dimensionPick({
      point: [5, 0],
      kind: 'on sketch',
      raw: [5, 0.2],
      tolerance: 1,
      entities: short,
      first: [50, 20],
    });
    expect(pick).toEqual({ type: 'point', point: [5, 0] });
  });
  it('keeps the snapped point with Shift held (the horizontal / vertical lock)', () => {
    expect(second([50, 50], [0.4, 50], 'ortho', [0.4, 47], { shift: true })).toEqual({
      type: 'point',
      point: [0.4, 50],
    });
  });
  it('never reads square to a circle: its body gives the snapped point', () => {
    expect(second([150, 100], [60, 50], 'on sketch', [60.2, 50])).toEqual({ type: 'point', point: [60, 50] });
  });
  it('refuses the same point as the first', () => {
    expect(second([50, 50], [50, 50], 'endpoint')).toEqual({ type: 'refused', message: 'Pick a different point.' });
    // A foot that lands on the first point is the same point.
    expect(second([0, 50], [0, 47], 'on sketch', [0.4, 47])).toMatchObject({ type: 'refused' });
  });
});

describe('dimensionGeometry', () => {
  const horizontal = { id: 'd1', type: 'linear', from: [0, 0], to: [100, 0], orientation: 'horizontal', offset: -20 };
  it('draws a horizontal dimension: line, two extensions, two ticks', () => {
    const g = dimensionGeometry(horizontal, 2);
    expect(g.value).toBe(100);
    expect(g.text).toBe('100');
    expect(g.labelAt).toEqual([50, -20]);
    expect(g.segments).toHaveLength(5);
    expect(g.segments[0]).toEqual([
      [0, -20],
      [100, -20],
    ]);
    // An extension starts half a marker off the point and overshoots the line by one.
    expect(g.segments[1]).toEqual([
      [0, -1],
      [0, -22],
    ]);
    // 45° ticks of half-length `size` at each end.
    const tick = g.segments[3];
    expect(length(tick)).toBeCloseTo(4, 9);
    close(tick[0], [-Math.SQRT2, -20 + Math.SQRT2]);
  });
  it('draws vertical and aligned ones', () => {
    const vertical = dimensionGeometry(
      { id: 'd2', type: 'linear', from: [0, 0], to: [0, 50], orientation: 'vertical', offset: 30 },
      1,
    );
    expect(vertical.value).toBe(50);
    expect(vertical.labelAt).toEqual([30, 25]);
    expect(vertical.segments).toHaveLength(5);
    const aligned = dimensionGeometry(
      { id: 'd3', type: 'linear', from: [0, 0], to: [30, 40], orientation: 'aligned', offset: 10 },
      1,
    );
    expect(aligned.value).toBe(50);
    expect(aligned.text).toBe('50');
    close(aligned.labelAt, [7, 26]);
    close(aligned.segments[0][0], [-8, 6]);
    expect(aligned.segments).toHaveLength(5);
  });
  it('draws no extension lines when the measured points lie on the dimension line', () => {
    const g = dimensionGeometry({ ...horizontal, offset: 0 }, 2);
    expect(g.segments).toHaveLength(3);
  });
  it('draws a radial dimension: a leader to the circle and a centre cross', () => {
    const diameter = dimensionGeometry(
      { id: 'd4', type: 'radial', mode: 'diameter', center: [50, 50], radius: 10, at: [80, 90] },
      2,
    );
    expect(diameter).toMatchObject({ value: 20, text: 'Ø20', labelAt: [80, 90] });
    expect(diameter.segments).toHaveLength(3);
    close(diameter.segments[0][1], [56, 58]);
    expect(length(diameter.segments[1])).toBeCloseTo(4, 9);
    const radius = dimensionGeometry(
      { id: 'd5', type: 'radial', mode: 'radius', center: [0, 0], radius: 12.5, at: [-30, 0] },
      2,
    );
    expect(radius).toMatchObject({ value: 12.5, text: 'R12.5' });
  });
  it('scales ticks, gaps and the centre cross with the marker size', () => {
    const small = dimensionGeometry(horizontal, 1),
      large = dimensionGeometry(horizontal, 4);
    expect(length(large.segments[3]) / length(small.segments[3])).toBeCloseTo(4, 9);
    expect(large.segments[1][0]).toEqual([0, -2]);
    expect(small.segments[1][0]).toEqual([0, -0.5]);
    expect(large.segments[0]).toEqual(small.segments[0]);
  });
  it('lists the points Look at frames', () => {
    const points = dimensionPoints(horizontal, 2);
    expect(points).toHaveLength(11);
    expect(points.at(-1)).toEqual([50, -20]);
  });
});

describe('creating, hitting and describing', () => {
  it('creates the sheet records without their view', () => {
    const linear = linearDimension({ id: 'd1', from: [0, 0], to: [100, 50], at: [50, -20] });
    expect(linear).toEqual({
      id: 'd1',
      type: 'linear',
      from: [0, 0],
      to: [100, 50],
      orientation: 'horizontal',
      offset: -20,
    });
    expect(linearDimension({ id: 'd2', from: [0, 0], to: [100, 50], at: [150, 20] }).orientation).toBe('vertical');
    expect(linearDimension({ id: 'd3', from: [0, 0], to: [100, 50], at: [150, 120] }).orientation).toBe('aligned');
    expect(() => linearDimension({ id: 'd4', from: [0, 0], to: [0, 0], at: [5, 5] })).toThrow(/two different points/);
    expect(radialDimension({ id: 'd5', center: [50, 50], radius: 10, at: [80, 90] })).toEqual({
      id: 'd5',
      type: 'radial',
      mode: 'diameter',
      center: [50, 50],
      radius: 10,
      at: [80, 90],
    });
  });
  it('hits a dimension by its lines or near its label, nearest first', () => {
    const dimensions = [
      { id: 'd1', type: 'linear', from: [0, 0], to: [100, 0], orientation: 'horizontal', offset: -20 },
      { id: 'd2', type: 'radial', mode: 'diameter', center: [50, 50], radius: 10, at: [80, 90] },
    ];
    expect(hitDimension(dimensions, [30, -20.5], 1, 2)).toBe('d1');
    expect(hitDimension(dimensions, [82.5, 90], 1, 2)).toBe('d2');
    expect(hitDimension(dimensions, [200, 200], 1, 2)).toBe(null);
    expect(hitDimension([], [0, 0], 1, 2)).toBe(null);
  });
  it('describes dimensions and what a first click would dimension', () => {
    const linear = (orientation, to) => ({ id: 'd', type: 'linear', from: [0, 0], to, orientation, offset: 5 });
    expect(describeDimension(linear('horizontal', [120, 30]))).toBe('Horizontal 120 mm');
    expect(describeDimension(linear('vertical', [10, 65]))).toBe('Vertical 65 mm');
    expect(describeDimension(linear('aligned', [43.3, 75]))).toBe('Aligned 86.6 mm');
    expect(describeDimension({ type: 'radial', mode: 'diameter', center: [0, 0], radius: 10, at: [1, 1] })).toBe('Ø20');
    expect(describeDimension({ type: 'radial', mode: 'radius', center: [0, 0], radius: 12.5, at: [1, 1] })).toBe(
      'R12.5',
    );
    expect(describePick({ type: 'span', source: 'line', from: [0, 0], to: [120, 0] })).toBe('Line 120 mm');
    expect(describePick({ type: 'span', source: 'side', from: [300, 200], to: [0, 200] })).toBe('Side 300 mm');
    expect(describePick({ type: 'point', point: [0, 0] })).toBe('');
    expect(nextDimensionNumber([{ id: 'd2' }, { id: 'd7' }])).toBe(8);
    expect(nextDimensionNumber([])).toBe(1);
  });
});

describe('pruneDimensions', () => {
  const holeToEdge = { id: 'd1', type: 'linear', from: [50, 50], to: [0, 50], orientation: 'horizontal', offset: -30 };
  const holeSize = { id: 'd2', type: 'radial', mode: 'diameter', center: [50, 50], radius: 10, at: [80, 90] };
  const topSide = { id: 'd3', type: 'linear', from: [300, 200], to: [0, 200], orientation: 'horizontal', offset: 20 };
  const dimensions = [holeToEdge, holeSize, topSide];
  it('drops what hung on the removed entity and keeps the rest', () => {
    expect(pruneDimensions(dimensions, hole, [rect]).map((d) => d.id)).toEqual(['d3']);
    expect(pruneDimensions(dimensions, rect, [hole]).map((d) => d.id)).toEqual(['d2']);
    // Nothing hung on it: the same list comes back.
    expect(pruneDimensions(dimensions, line, [rect, hole])).toBe(dimensions);
  });
  it('keeps a dimension on a corner another entity shares', () => {
    const spur = { id: 'e5', type: 'line', a: [300, 200], b: [400, 250] };
    const fromCorner = {
      id: 'd4',
      type: 'linear',
      from: [300, 200],
      to: [500, 500],
      orientation: 'aligned',
      offset: 5,
    };
    const alongSpur = { id: 'd5', type: 'linear', from: [300, 200], to: [400, 250], orientation: 'aligned', offset: 5 };
    expect(pruneDimensions([fromCorner, alongSpur], spur, [rect]).map((d) => d.id)).toEqual(['d4']);
  });
  it('keeps an end on a model edge: only the entity end decides', () => {
    const toEdge = { id: 'd6', type: 'linear', from: [0, 0], to: [0, -50], orientation: 'vertical', offset: -20 };
    expect(pruneDimensions([toEdge], hole, [rect])).toEqual([toEdge]);
    expect(pruneDimensions([toEdge], rect, [hole])).toEqual([]);
  });
  it('drops a radial dimension only when no remaining circle has its centre and radius', () => {
    const twin = { ...hole, id: 'e6' };
    expect(pruneDimensions([holeSize], hole, [twin, rect])).toEqual([holeSize]);
    expect(pruneDimensions([holeSize], hole, [rect])).toEqual([]);
    const onArc = { id: 'd7', type: 'radial', mode: 'radius', center: [500, 20], radius: 20, at: [540, 20] };
    expect(pruneDimensions([onArc], arc, [rect])).toEqual([]);
    expect(pruneDimensions([onArc], hole, [rect, arc])).toEqual([onArc]);
  });
});

describe('splitDimensions', () => {
  it('gives each outline the dimensions hanging on it, the rest to the first', () => {
    const left = [rect, hole];
    const right = [{ id: 'e7', type: 'rect', a: [400, 0], b: [600, 100] }];
    const dimensions = [
      { id: 'd1', type: 'radial', mode: 'diameter', center: [50, 50], radius: 10, at: [80, 90] },
      { id: 'd2', type: 'linear', from: [400, 0], to: [600, 0], orientation: 'horizontal', offset: -20 },
      { id: 'd3', type: 'linear', from: [700, 700], to: [600, 50], orientation: 'aligned', offset: 5 },
      { id: 'd4', type: 'linear', from: [700, 700], to: [800, 800], orientation: 'aligned', offset: 5 },
    ];
    const lists = splitDimensions([left, right], dimensions);
    expect(lists.map((list) => list.map((d) => d.id))).toEqual([
      ['d1', 'd4'],
      ['d2', 'd3'],
    ]);
  });
});

describe('dimensions on the sketch entry', () => {
  const session = { frame: planeFrame('XY'), support: { type: 'plane', plane: 'XY', offset: 0 } };
  const rectangle = [{ id: 'e1', type: 'rect', a: [0, 0], b: [300, 200] }];
  const dimension = { id: 'd1', type: 'linear', from: [300, 200], to: [0, 200], orientation: 'horizontal', offset: 20 };
  it('adds the key only when there are dimensions', () => {
    const without = sketchFromSession({ session, entities: rectangle, name: 'Sketch 1' }).sketch;
    expect('dimensions' in without).toBe(false);
    const empty = sketchFromSession({ session, entities: rectangle, name: 'Sketch 1', dimensions: [] }).sketch;
    expect('dimensions' in empty).toBe(false);
    const withOne = sketchFromSession({ session, entities: rectangle, name: 'Sketch 1', dimensions: [dimension] });
    expect(withOne.sketch.dimensions).toEqual([dimension]);
    expect(() => normalizeModel({ ...emptyModel(), sketches: [withOne.sketch] })).not.toThrow();
  });
  it('replaces an edited sketch’s list, and an edit that removes the last one drops the key', () => {
    const existing = {
      ...sketchFromSession({ session, entities: rectangle, name: 'S' }).sketch,
      dimensions: [dimension],
    };
    const kept = sketchFromSession({ session, entities: rectangle, existing, name: 'S', dimensions: [dimension] });
    expect(kept.sketch.dimensions).toEqual([dimension]);
    const removed = sketchFromSession({ session, entities: rectangle, existing, name: 'S', dimensions: [] }).sketch;
    expect('dimensions' in removed).toBe(false);
    // A sketch that never had any saves exactly as before.
    const plain = sketchFromSession({ session, entities: rectangle, name: 'S' }).sketch;
    const edited = sketchFromSession({ session, entities: rectangle, existing: plain, name: 'S' }).sketch;
    expect(JSON.stringify(edited)).toBe(JSON.stringify({ ...plain, profile: edited.profile }));
  });
  it('splits them with the outlines of a shop finish', () => {
    const two = [
      { id: 'e1', type: 'rect', a: [0, 0], b: [200, 100] },
      { id: 'e2', type: 'rect', a: [260, 0], b: [460, 100] },
    ];
    const onLeft = { id: 'd1', type: 'linear', from: [0, 100], to: [200, 100], orientation: 'horizontal', offset: 20 };
    const onRight = { id: 'd2', type: 'linear', from: [460, 0], to: [460, 100], orientation: 'vertical', offset: 20 };
    const { sketch, extras } = outlineSketches({
      session,
      entities: two,
      name: 'Sketch 1',
      dimensions: [onLeft, onRight],
    });
    expect(sketch.dimensions).toEqual([onLeft]);
    expect(extras).toHaveLength(1);
    expect(extras[0].dimensions).toEqual([onRight]);
    // None on the second outline: no key on it.
    const lone = outlineSketches({ session, entities: two, name: 'Sketch 1', dimensions: [onLeft] });
    expect('dimensions' in lone.extras[0]).toBe(false);
  });
});

describe('normalizeModel and sketch dimensions', () => {
  const sketch = (dimensions) => ({
    id: 'sk',
    name: 'Sketch 1',
    plane: 'XY',
    origin: [0, 0, 0],
    profile: { type: 'rectangle', width: 300, height: 200, origin: [0, 0] },
    ...(dimensions === undefined ? {} : { dimensions }),
  });
  const valid = [
    { id: 'd1', type: 'linear', from: [0, 0], to: [300, 0], orientation: 'horizontal', offset: -20 },
    { id: 'd2', type: 'radial', mode: 'radius', center: [50, 50], radius: 10, at: [80, 90] },
  ];
  it('keeps valid dimensions and leaves a model without the key unchanged', () => {
    const model = normalizeModel({ ...emptyModel(), sketches: [sketch(valid)] });
    expect(model.sketches[0].dimensions).toEqual(valid);
    const plain = { ...emptyModel(), sketches: [sketch()] };
    const normalized = normalizeModel(plain);
    expect(normalized.sketches[0]).toBe(plain.sketches[0]);
    expect('dimensions' in normalized.sketches[0]).toBe(false);
  });
  it.each([
    ['not a list', { id: 'd1' }],
    ['a missing id', [{ ...valid[0], id: '' }]],
    ['a duplicate id', [valid[0], { ...valid[1], id: 'd1' }]],
    ['an unknown type', [{ ...valid[0], type: 'angle' }]],
    ['a bad orientation', [{ ...valid[0], orientation: 'slanted' }]],
    ['a non-finite coordinate', [{ ...valid[0], from: [0, Number.NaN] }]],
    ['a missing offset', [{ ...valid[0], offset: undefined }]],
    ['a bad mode', [{ ...valid[1], mode: 'chord' }]],
    ['a zero radius', [{ ...valid[1], radius: 0 }]],
    ['a three-coordinate point', [{ ...valid[1], at: [1, 2, 3] }]],
  ])('refuses %s', (_, dimensions) => {
    expect(() => normalizeModel({ ...emptyModel(), sketches: [sketch(dimensions)] })).toThrow(
      'Invalid sketch dimension: sk',
    );
  });
});
