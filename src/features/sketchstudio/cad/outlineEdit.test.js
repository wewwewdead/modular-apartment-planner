// Outline edit OE-1 (docs/sketch-studio-outline-edit-sheet-nest.md §3): the
// outlines of a model (shopOutlines, what the view draws of them), several
// outlines in one sketch split into blanks (splitOutlines, outlineSketches)
// and the guard that keeps an edit from breaking a cut part's bends.
import { describe, expect, it } from 'vitest';
import { emptyModel } from './model.js';
import { sheetMetalPart } from './ShopPanels.jsx';
import { NOT_CLOSED, outlineEditRefusal, readyOutlines, shopOutlineView, shopOutlines } from './shopRoute.js';
import { entitiesToProfile, splitOutlines } from './sketchProfile.js';
import { outlineSketches } from './sketchOperations.js';
import { planeFrame } from './sketchPlane.js';

const rect = (id, a, b) => ({ id, type: 'rect', a, b });
const line = (id, a, b) => ({ id, type: 'line', a, b });
const circle = (id, c, r) => ({ id, type: 'circle', c, r });
const ids = (groups) => groups.map((g) => g.map((e) => e.id));

describe('splitOutlines', () => {
  it('splits two rectangles into two groups, largest first', () => {
    const small = rect('small', [260, 0], [360, 50]);
    const large = rect('large', [0, 0], [200, 100]);
    expect(ids(splitOutlines([small, large]))).toEqual([['large'], ['small']]);
  });

  it('keeps a circle inside a rectangle with it and the rectangle beside on its own', () => {
    const entities = [
      rect('plate', [0, 0], [200, 100]),
      circle('hole', [50, 50], 10),
      rect('tab', [260, 0], [300, 40]),
      circle('tab-hole', [280, 20], 5),
    ];
    const groups = splitOutlines(entities);
    expect(ids(groups)).toEqual([
      ['plate', 'hole'],
      ['tab', 'tab-hole'],
    ]);
    expect(entitiesToProfile(groups[0]).profile).toMatchObject({
      type: 'rectangle',
      width: 200,
      holes: [{ radius: 10 }],
    });
    expect(entitiesToProfile(groups[1]).profile).toMatchObject({
      type: 'rectangle',
      width: 40,
      holes: [{ radius: 5 }],
    });
  });

  it('leaves an open chain and construction lines with the first group (one closed loop: unchanged)', () => {
    const entities = [
      line('a', [500, 0], [600, 0]),
      line('b', [600, 0], [600, 80]),
      rect('plate', [0, 0], [100, 60]),
      { ...line('guide', [0, 0], [100, 60]), construction: true },
    ];
    expect(splitOutlines(entities)[0]).toBe(entities);
    expect(splitOutlines(entities)).toHaveLength(1);
    // With a second closed loop the stray lines follow the largest outline.
    const more = [...entities, rect('tab', [0, 200], [20, 220])];
    expect(ids(splitOutlines(more))).toEqual([['a', 'b', 'plate', 'guide'], ['tab']]);
  });

  it('keeps line chains whole and a loop inside a cut-out with the first group', () => {
    // A closed triangle of lines beside a rectangle holding a circle with a dot inside it.
    const entities = [
      rect('plate', [0, 0], [300, 200]),
      circle('window', [100, 100], 50),
      circle('island', [100, 100], 10),
      line('t1', [400, 0], [500, 0]),
      line('t2', [500, 0], [450, 80]),
      line('t3', [450, 80], [400, 0]),
    ];
    expect(ids(splitOutlines(entities))).toEqual([
      ['plate', 'window', 'island'],
      ['t1', 't2', 't3'],
    ]);
  });

  it('returns the entities as they are for one loop or none', () => {
    const one = [rect('plate', [0, 0], [100, 60])];
    expect(splitOutlines(one)).toEqual([one]);
    expect(splitOutlines(one)[0]).toBe(one);
    const none = [line('a', [0, 0], [10, 0])];
    expect(splitOutlines(none)[0]).toBe(none);
    expect(splitOutlines([])).toEqual([[]]);
  });
});

describe('outlineSketches', () => {
  const session = { frame: planeFrame('XY'), support: { type: 'plane', plane: 'XY', offset: 0 } };
  const two = [rect('a', [0, 0], [200, 100]), rect('b', [260, 0], [460, 100])];

  it('makes the first outline the sketch and each other a new sketch named after it', () => {
    const made = outlineSketches({ session, entities: two, existing: null, name: 'Sketch 2', taken: ['Sketch 1'] });
    expect(made.sketch).toMatchObject({ name: 'Sketch 2', plane: 'XY', entities: [two[0]] });
    expect(made.extras).toHaveLength(1);
    expect(made.extras[0]).toMatchObject({
      name: 'Sketch 2 · 2',
      plane: 'XY',
      entities: [two[1]],
      profile: { type: 'rectangle', width: 200, height: 100, origin: [260, 0] },
      support: session.support,
    });
    expect(made.extras[0].id).not.toBe(made.sketch.id);
    // The first free names.
    const taken = outlineSketches({ session, entities: two, existing: null, name: 'Plate', taken: ['Plate · 2'] });
    expect(taken.extras[0].name).toBe('Plate · 3');
  });

  it('keeps an edited sketch its id, name and plane, the new outline on the same plane fields', () => {
    const existing = {
      id: 'blank',
      name: 'Blank',
      plane: 'XY',
      origin: [0, 0, 0],
      profile: { type: 'rectangle', width: 10, height: 10, origin: [0, 0] },
      primitives: [],
    };
    const made = outlineSketches({ session, entities: two, existing, name: 'Blank', taken: ['Blank'] });
    expect(made.sketch).toMatchObject({ id: 'blank', name: 'Blank', plane: 'XY', origin: [0, 0, 0] });
    expect(made.extras[0]).toMatchObject({ name: 'Blank · 2', plane: 'XY', origin: [0, 0, 0] });
    expect('normal' in made.extras[0]).toBe(false);
  });

  it('keeps an edited sketch the outline it was opened with when a larger one is drawn beside it', () => {
    const existing = {
      id: 'blank',
      name: 'Blank',
      plane: 'XY',
      profile: { type: 'rectangle', width: 100, height: 60, origin: [0, 0] },
      primitives: [],
    };
    const own = rect('own', [0, 0], [100, 60]);
    const larger = rect('larger', [200, 0], [600, 300]);
    const made = outlineSketches({
      session: { ...session, entities: [own] },
      entities: [own, larger],
      existing,
      name: 'Blank',
      taken: ['Blank'],
    });
    expect(made.sketch).toMatchObject({ id: 'blank', profile: { width: 100, height: 60 }, entities: [own] });
    expect(made.extras[0]).toMatchObject({ name: 'Blank · 2', profile: { width: 400, height: 300 } });
  });
});

describe('shopOutlines', () => {
  const sheet = (id, sketchId, name = id) => ({
    ...sheetMetalPart({ sketchId, stock: 'spcc', thickness: 1.5 }),
    id,
    name,
  });
  const model = () => ({
    ...emptyModel(),
    sketches: [
      {
        id: 'cut',
        name: 'Cut blank',
        plane: 'XY',
        profile: { type: 'rectangle', width: 100, height: 60, origin: [0, 0] },
      },
      {
        id: 'ready',
        name: 'Plate',
        plane: 'XY',
        profile: { type: 'rectangle', width: 40, height: 30, origin: [0, 0] },
      },
      {
        id: 'open',
        name: 'Open',
        plane: 'XY',
        profile: { type: 'path', start: [0, 0], segments: [{ type: 'line', end: [50, 0] }], closed: false },
        entities: [line('e1', [0, 0], [50, 0]), line('e2', [50, 0], [50, 40])],
      },
      { id: 'side', name: 'Side', plane: 'XZ', profile: { type: 'rectangle', width: 40, height: 30 } },
      {
        id: 'bad',
        name: 'Bad hole',
        plane: 'XY',
        profile: {
          type: 'rectangle',
          width: 40,
          height: 30,
          origin: [0, 0],
          holes: [{ type: 'circle', radius: 5, center: [100, 100] }],
        },
      },
      { id: 'frozen', name: 'Frozen', plane: 'XY', profile: { type: 'rectangle', width: 40, height: 30, offset: 2 } },
    ],
    parts: [sheet('p', 'cut', 'Tray')],
    instances: [{ id: 'pi', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0] }],
  });

  it('lists every XY outline no part is made from, in model order, ready or with why not', () => {
    const rows = shopOutlines(model());
    expect(rows.map((r) => [r.id, r.ready, r.width, r.height])).toEqual([
      ['ready', true, 40, 30],
      ['open', false, null, null],
      ['bad', false, null, null],
      ['frozen', false, null, null],
    ]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.open.problem).toBe(NOT_CLOSED);
    expect(byId.open.problem).toBe('Not closed: connect the ends so the outline is one loop.');
    expect(byId.bad.problem).toBe('A cut-out runs outside the blank.');
    expect(byId.frozen.problem).toBe('A sheet-metal blank cannot use an offset profile; draw the outline itself.');
    expect(byId.ready.editProblem).toBe('');
    expect(byId.open.editProblem).toBe('');
    expect(byId.frozen.editProblem).toMatch(/^This profile uses parameter expressions/);
    // readyOutlines stays: the ready ones, today's fields.
    expect(readyOutlines(model())).toEqual([{ id: 'ready', name: 'Plate', width: 40, height: 30 }]);
  });

  it('gives the view the blanks as rings and an open outline as its drawn lines, the chosen one marked', () => {
    const view = shopOutlineView({ ...model(), sketches: model().sketches.slice(0, 3) }, {}, 'open');
    expect(view.map((v) => [v.id, v.ready, v.chosen, v.rings.length])).toEqual([
      ['ready', true, false, 1],
      ['open', false, true, 2],
    ]);
    expect(view[0].rings[0].closed).toBe(true);
    expect(view[1].rings.map((r) => [r.closed, r.points])).toEqual([
      [
        false,
        [
          [0, 0],
          [50, 0],
        ],
      ],
      [
        false,
        [
          [50, 0],
          [50, 40],
        ],
      ],
    ]);
  });
});

describe('outlineEditRefusal (the guard, §3.6)', () => {
  // A 100 × 60 blank with one bend 20 mm in from its left edge.
  const bent = () => {
    const part = { ...sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.5 }), id: 'p', name: 'Tray' };
    part.features[0].bends = [{ id: 'b1', a: [20, 0], b: [20, 60], angle: 90, direction: 'up' }];
    return {
      ...emptyModel(),
      sketches: [
        {
          id: 'blank',
          name: 'Blank',
          plane: 'XY',
          profile: { type: 'rectangle', width: 100, height: 60, origin: [0, 0] },
        },
      ],
      parts: [part],
      instances: [{ id: 'pi', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0] }],
    };
  };

  it('passes an outline that still takes every bend, and one no part is cut from', () => {
    const larger = { type: 'rectangle', width: 140, height: 80, origin: [0, 0] };
    expect(outlineEditRefusal(bent(), 'blank', larger)).toBe('');
    expect(outlineEditRefusal(bent(), 'other', { type: 'path', start: [0, 0], segments: [], closed: false })).toBe('');
  });

  it('refuses an outline the bend line falls off, and an outline that is no longer closed', () => {
    const shrunk = { type: 'rectangle', width: 60, height: 60, origin: [40, 0] };
    expect(outlineEditRefusal(bent(), 'blank', shrunk)).toBe(
      'This outline no longer takes the bends of Tray: Bend 1: the punch line misses the blank. Fix the outline, or remove that bend first.',
    );
    const open = { type: 'path', start: [0, 0], segments: [{ type: 'line', end: [100, 0] }], closed: false };
    expect(outlineEditRefusal(bent(), 'blank', open)).toBe('Tray is cut from this outline: close it before finishing.');
  });
});
