// Moving, turning and mirroring (docs/sketch-studio-hand-drawing.md §7.3,
// §7.8): every transform on every entity type, a mirror twice and four
// quarter turns give the drawing back, a rectangle stays one or becomes its
// lines and arcs as §7.3 says, ids and dimensions.
import { describe, expect, it } from 'vitest';
import {
  applyTo,
  keepsAxes,
  normalAngle,
  reflection,
  rotation,
  transformDimensions,
  transformEntities,
  transformEntity,
  translation,
} from './sketchTransform.js';
import { entitiesToProfile, entityPolyline } from './sketchProfile.js';
import { linearLine, linearValue } from './sheetAnnotations.js';

const line = { id: 'e1', type: 'line', a: [10, 0], b: [30, 10] };
const arc = { id: 'e2', type: 'arc', a: [0, 0], b: [20, 0], m: [10, 5] };
const circle = { id: 'e3', type: 'circle', c: [50, 50], r: 6 };
const slot = { id: 'e4', type: 'slot', c: [60, 28], length: 22, width: 5, angle: 30 };
const polygon = { id: 'e5', type: 'polygon', c: [150, 50], sides: 6, af: 10, angle: 0 };
const triangle = { id: 'e6', type: 'polygon', c: [0, 80], sides: 3, af: 12, angle: 0, construction: true };
const rect = { id: 'e7', type: 'rect', a: [100, 0], b: [140, 20] };
const rounded = { id: 'e8', type: 'rect', a: [0, 100], b: [100, 160], r: 8 };
const all = [line, arc, circle, slot, polygon, triangle, rect, rounded];
// The drawn shape of an entity, rounded: what "the same" means after a round trip.
const drawn = (entity) =>
  entityPolyline(entity, 16).map(([x, y]) => [Math.round(x * 1e4) / 1e4 + 0, Math.round(y * 1e4) / 1e4 + 0]);

describe('the transforms', () => {
  it('move, turn and mirror points exactly; quarter turns and level / plumb mirrors keep X and Y', () => {
    expect(applyTo(translation(5, -2), [1, 1])).toEqual([6, -1]);
    expect(applyTo(rotation([10, 0], 90), [20, 0])).toEqual([10, 10]);
    expect(applyTo(rotation([0, 0], 30), [10, 0])).toEqual([8.660254, 5]);
    expect(applyTo(reflection([0, 0], [0, 1]), [7, 3])).toEqual([-7, 3]);
    expect(applyTo(reflection([0, 5], [10, 5]), [7, 3])).toEqual([7, 7]);
    expect(applyTo(reflection([0, 0], [1, 1]), [7, 3])).toEqual([3, 7]);
    expect(
      [translation(1, 2), rotation([3, 4], 90), rotation([0, 0], 180), reflection([0, 0], [0, 1])].map(keepsAxes),
    ).toEqual([true, true, true, true]);
    // A mirror about a 45° line swaps X and Y: it keeps them too.
    expect(keepsAxes(reflection([0, 0], [1, 1]))).toBe(true);
    expect([rotation([0, 0], 30), reflection([0, 0], [1, 2])].map(keepsAxes)).toEqual([false, false]);
    expect([190, -190, 180, -180, 360, 0].map(normalAngle)).toEqual([-170, 170, 180, 180, 0, 0]);
  });

  it('takes every type through a move, a turn and a mirror as itself (a turned or skew-mirrored rect: its pieces)', () => {
    const turn = rotation([0, 0], 30),
      level = reflection([0, 0], [1, 0]),
      skew = reflection([0, 0], [1, 2]);
    for (const entity of all) {
      const moved = transformEntity(entity, translation(3, 4));
      expect(moved, entity.id).toHaveLength(1);
      expect(moved[0].id).toBe(entity.id);
      expect(moved[0].type).toBe(entity.type);
    }
    // A slot's and a polygon's angle turns; a mirror reflects it (a polygon's flats half a turn more).
    expect(transformEntity(slot, turn)[0]).toEqual({ ...slot, c: [37.961524, 54.248711], angle: 60 });
    expect(transformEntity(polygon, turn)[0].angle).toBe(30);
    expect(transformEntity(slot, level)[0]).toEqual({ ...slot, c: [60, -28], angle: -30 });
    expect(transformEntity(polygon, level)[0].angle).toBe(180);
    expect(transformEntity(triangle, level)[0]).toEqual({ ...triangle, c: [0, -80], angle: 180 });
    // The circle and the arc: their points; the line its ends.
    expect(transformEntity(circle, level)[0]).toEqual({ ...circle, c: [50, -50] });
    expect(transformEntity(arc, level)[0]).toEqual({ ...arc, a: [0, 0], b: [20, 0], m: [10, -5] });
    // A rect stays one under a move, a quarter turn and a level or plumb mirror (its r kept)…
    expect(transformEntity(rect, rotation([0, 0], 90))).toEqual([{ ...rect, a: [0, 100], b: [-20, 140] }]);
    expect(transformEntity(rounded, level)).toEqual([{ ...rounded, a: [0, -100], b: [100, -160] }]);
    // …and becomes its lines (and arcs) under any other turn or mirror, ids "{id}.{n}".
    const turned = transformEntity(rect, turn);
    expect(turned.map((e) => [e.id, e.type])).toEqual([
      ['e7.1', 'line'],
      ['e7.2', 'line'],
      ['e7.3', 'line'],
      ['e7.4', 'line'],
    ]);
    expect(transformEntity(rounded, skew).map((e) => e.type)).toEqual([
      'line',
      'arc',
      'line',
      'arc',
      'line',
      'arc',
      'line',
      'arc',
    ]);
    expect(() => transformEntity({ id: 'x', type: 'spline' }, turn)).toThrow('A spline cannot be moved.');
  });

  it('gives the drawing back after a mirror twice and after four quarter turns, for every type', () => {
    // About a level, a plumb and a 45° line exactly; about any other line to 1e-6 mm
    // (each mirror rounds its points to 1e-6 mm, as every drawn point is).
    for (const mirror of [reflection([0, 7], [10, 7]), reflection([-3, 0], [-3, 1]), reflection([1, 2], [5, 6])])
      for (const entity of all) {
        const twice = transformEntity(transformEntity(entity, mirror)[0], mirror)[0];
        expect(twice, entity.id).toEqual(entity);
      }
    const mirror = reflection([3, 7], [11, 2]);
    const quarter = rotation([12.5, -4], 90);
    for (const entity of all) {
      const once = transformEntity(entity, mirror);
      const twice = once.flatMap((piece) => transformEntity(piece, mirror));
      const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1.5e-6;
      if (entity.type !== 'rect') {
        for (const key of ['a', 'b', 'm', 'c'])
          if (entity[key]) expect(near(twice[0][key], entity[key]), entity.id).toBe(true);
        for (const key of ['angle', 'length', 'width', 'af', 'r', 'sides'])
          if (key in entity) expect(Math.abs(twice[0][key] - entity[key]), entity.id).toBeLessThan(1e-6);
      } else {
        // A skew-mirrored rect is its pieces; twice mirrored they lie on the rect's own outline.
        const outline = drawn(entity);
        for (const piece of twice)
          for (const end of [piece.a, piece.b])
            expect(
              outline.some((p) => Math.hypot(p[0] - end[0], p[1] - end[1]) < 1e-4),
              entity.id,
            ).toBe(true);
      }
      let turned = entity;
      for (let i = 0; i < 4; i++) [turned] = transformEntity(turned, quarter);
      expect(turned, entity.id).toEqual(entity);
    }
  });
});

describe('transformEntities', () => {
  it('moves the selection in place, ids kept; copies go after the last entity with new ids', () => {
    const { entities, ids, nextId, before } = transformEntities(all, ['e3', 'e4'], translation(10, 0), { nextId: 9 });
    expect(entities.map((e) => e.id)).toEqual(all.map((e) => e.id));
    expect(ids).toEqual(['e3', 'e4']);
    expect(nextId).toBe(9);
    expect(before).toEqual([circle, slot]);
    expect(entities[2].c).toEqual([60, 50]);
    expect(entities[0]).toBe(line);
    const copy = transformEntities(all, ['e1', 'e4'], translation(0, 20), { keep: true, nextId: 9 });
    expect(copy.entities.slice(0, all.length)).toEqual(all);
    expect(copy.ids).toEqual(['e9', 'e10']);
    expect(copy.entities.at(-1)).toEqual({ ...slot, id: 'e10', c: [60, 48] });
    expect(Object.keys(copy.entities.at(-1))[0]).toBe('id');
    // A turned rect: its pieces where it was, new ids.
    const turned = transformEntities(all, ['e7'], rotation([0, 0], 45), { nextId: 20 });
    expect(turned.ids).toEqual(['e20', 'e21', 'e22', 'e23']);
    expect(turned.entities.slice(6, 10).map((e) => e.id)).toEqual(['e20', 'e21', 'e22', 'e23']);
    expect(turned.entities[10]).toBe(rounded);
    // The drawing stays a closed rectangle loop as lines.
    expect(entitiesToProfile(turned.entities.slice(6, 10))).toMatchObject({ closed: true });
  });

  it('carries the dimensions on the moved entities: a linear end on a key point, a radial one on a round part', () => {
    const dimensions = [
      { id: 'd1', type: 'linear', from: [10, 0], to: [100, 0], orientation: 'horizontal', offset: -10 },
      { id: 'd2', type: 'radial', mode: 'diameter', center: [50, 50], radius: 6, at: [60, 60] },
      { id: 'd3', type: 'linear', from: [100, 0], to: [140, 20], orientation: 'aligned', offset: 4 },
    ];
    const T = translation(5, 5);
    const moved = transformDimensions(dimensions, [line, circle], T);
    expect(moved[0]).toEqual({ ...dimensions[0], from: [15, 5] });
    expect(moved[1]).toEqual({ ...dimensions[1], center: [55, 55], at: [65, 65] });
    expect(moved[2]).toBe(dimensions[2]);
    expect(transformDimensions(dimensions, [], T)).toBe(dimensions);
    // A rect turned a quarter with its level dimension: it reads plumb, the same length.
    const width = { id: 'd4', type: 'linear', from: [100, 0], to: [140, 0], orientation: 'horizontal', offset: -5 };
    const [turned] = transformDimensions([width], [rect], rotation([100, 0], 90));
    expect(turned).toMatchObject({ from: [100, 0], to: [100, 40], orientation: 'vertical', offset: 5 });
    // Mirrored about a plumb line: still level, the same offset.
    const [mirrored] = transformDimensions([width], [rect], reflection([0, 0], [0, 1]));
    expect(mirrored).toMatchObject({ from: [-100, 0], to: [-140, 0], orientation: 'horizontal', offset: -5 });
  });

  // HD-4 (§8.0 item 1): turned by what does not keep the axes, a level or plumb one becomes aligned.
  it('turns a level or plumb dimension by 30° into an aligned one that keeps its reading and its side', () => {
    const width = { id: 'd4', type: 'linear', from: [100, 0], to: [140, 0], orientation: 'horizontal', offset: -5 };
    const T = rotation([100, 0], 30);
    const [turned] = transformDimensions([width], [rect], T);
    expect(turned.orientation).toBe('aligned');
    expect(turned.from).toEqual([100, 0]);
    expect(turned.to).toEqual(applyTo(T, [140, 0]));
    // 40 (not 40 cos 30° = 34.64), the line still 5 below what it measures, turned with it.
    expect(linearValue(turned)).toBeCloseTo(40, 6);
    expect(turned.offset).toBeCloseTo(-5, 6);
    const [start] = linearLine(turned);
    expect(start[0]).toBeCloseTo(100 + 5 * Math.sin(Math.PI / 6), 6);
    expect(start[1]).toBeCloseTo(-5 * Math.cos(Math.PI / 6), 6);
    // A plumb one, and a mirror about a 30° line: aligned too; a quarter turn still swaps.
    const height = { id: 'd5', type: 'linear', from: [140, 0], to: [140, 20], orientation: 'vertical', offset: 6 };
    const [mirrored] = transformDimensions(
      [height],
      [rect],
      reflection([0, 0], [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]),
    );
    expect(mirrored.orientation).toBe('aligned');
    expect(linearValue(mirrored)).toBeCloseTo(20, 6);
    expect(transformDimensions([height], [rect], rotation([0, 0], 90))[0].orientation).toBe('horizontal');
  });
});
