// Moving one straight edge of a blank outline (docs/sketch-studio-corner-gaps.md
// §4.1, §4.4 items 1 and 4c): slides along straight neighbours at an angle,
// jogs at a parallel neighbour, an arc and a span's ends, the rectangle kept a
// rectangle, the refusals in shop words; and what the sketcher keeps through a
// move (§4.3): the same entities, ids kept, and the reference dimensions on a
// corner that moved.
import { describe, expect, it } from 'vitest';
import { carryDimensions, carryEntities, moveProfileEdge, outlineEditor, outlineMoveProblem } from './outlineMove.js';
import { entitiesToProfile, profileToEntities } from './sketchProfile.js';
import { profilePolygon } from './sheetMetal.js';
import { USER_TRAY_PROFILE } from './cornerGaps.fixtures.js';

const polygon = (points) => ({ type: 'polygon', points });
const path = (points, extra = []) => ({
  type: 'path',
  start: points[0],
  segments: [...points.slice(1).map((end) => ({ type: 'line', end })), ...extra, { type: 'line', end: points[0] }],
  closed: true,
});
const corners = (profile) => [profile.start, ...profile.segments.slice(0, -1).map((s) => s.end)];

describe('moveProfileEdge (§4.1)', () => {
  it('slides both corners along straight neighbours at an angle: a mitre keeps its line, a notch its side', () => {
    // The user's rear wall end (segment 2, x = 285.97) between its mitre (45°) and the notch's top edge.
    const moved = moveProfileEdge(USER_TRAY_PROFILE, { loop: 0, index: 2 }, 0.5);
    expect(moved.type).toBe('path');
    expect(moved.segments).toHaveLength(USER_TRAY_PROFILE.segments.length);
    // Out of the metal is +x here; the mitre's end slides down its own 45° line, the notch top shortens.
    expect(moved.segments[1].end).toEqual([286.470563, 102.529437]);
    expect(moved.segments[2].end).toEqual([286.470563, 83.029437]);
    // Everything else as it was (the same segment objects).
    moved.segments.forEach((segment, i) => {
      if (i !== 1 && i !== 2) expect(segment).toBe(USER_TRAY_PROFILE.segments[i]);
    });
    expect(moved.start).toBe(USER_TRAY_PROFILE.start);
    // In (negative) the other way.
    expect(moveProfileEdge(USER_TRAY_PROFILE, { loop: 0, index: 2 }, -0.25).segments[2].end).toEqual([
      285.720563, 83.029437,
    ]);
  });

  it('keeps a rectangle a rectangle', () => {
    const rect = { type: 'rectangle', width: 100, height: 60, origin: [0, 0] };
    expect(moveProfileEdge(rect, { loop: 0, index: 1 }, 5)).toEqual({
      type: 'rectangle',
      width: 105,
      height: 60,
      origin: [0, 0],
    });
    expect(moveProfileEdge(rect, { loop: 0, index: 0 }, 5)).toEqual({
      type: 'rectangle',
      width: 100,
      height: 65,
      origin: [0, -5],
    });
    expect(moveProfileEdge(rect, { loop: 0, index: 3 }, -2.5)).toEqual({
      type: 'rectangle',
      width: 97.5,
      height: 60,
      origin: [2.5, 0],
    });
  });

  it('jogs at a parallel neighbour: the rest keeps its place, a square edge joins the two', () => {
    // Edges 0 and 1 in one line along the bottom: edge 1 moved down 5.
    const moved = moveProfileEdge(
      polygon([
        [0, 0],
        [40, 0],
        [100, 0],
        [100, 60],
        [0, 60],
      ]),
      { loop: 0, index: 1 },
      5,
    );
    expect(moved.points).toEqual([
      [0, 0],
      [40, 0],
      [40, -5],
      [100, -5],
      [100, 60],
      [0, 60],
    ]);
  });

  it('jogs at an arc and leaves the arc as it was', () => {
    const arc = { type: 'arc', mid: [-10, 30], end: [0, 0] };
    const profile = {
      type: 'path',
      start: [0, 0],
      segments: [
        { type: 'line', end: [100, 0] },
        { type: 'line', end: [100, 60] },
        { type: 'line', end: [0, 60] },
        arc,
      ],
      closed: true,
    };
    // The top edge's far neighbour is the arc: a jog there, a slide at the right edge.
    const moved = moveProfileEdge(profile, { loop: 0, index: 2 }, 4);
    expect(corners(moved)).toEqual([
      [0, 0],
      [100, 0],
      [100, 64],
      [0, 64],
      [0, 60],
    ]);
    expect(moved.segments.at(-1)).toBe(arc);
    expect(moved.segments.at(-2)).toEqual({ type: 'line', end: [0, 60] });
  });

  it("moves a cut-out's edge out of the metal, into the hole", () => {
    const profile = {
      type: 'rectangle',
      width: 100,
      height: 60,
      origin: [0, 0],
      holes: [{ type: 'rectangle', width: 20, height: 10, origin: [40, 20] }],
    };
    const moved = moveProfileEdge(profile, { loop: 1, index: 1 }, 3);
    expect(moved.holes[0]).toEqual({ type: 'rectangle', width: 17, height: 10, origin: [40, 20] });
    // The outline itself is the same object; the blank still folds as a blank with its cut-out.
    expect(profilePolygon(moved).holes).toHaveLength(1);
    expect(() => moveProfileEdge(profile, { loop: 0, index: 1 }, -55)).toThrow(
      'This would run a cut-out out of the blank.',
    );
  });

  it('takes out a neighbour brought to no length, makes one edge of edges left in one line, and says how far it can go', () => {
    // A step at the top right: the right edge moved in 20 meets the step's inner side.
    const L = polygon([
      [0, 0],
      [100, 0],
      [100, 40],
      [80, 40],
      [80, 60],
      [0, 60],
    ]);
    expect(moveProfileEdge(L, { loop: 0, index: 1 }, -20).points).toEqual([
      [0, 0],
      [80, 0],
      [80, 60],
      [0, 60],
    ]);
    expect(() => moveProfileEdge(L, { loop: 0, index: 1 }, -25)).toThrow(
      'This edge can move at most 20 mm: its neighbour ends there.',
    );
    // An edge left shorter than 0.01 is too short to cut.
    expect(() => moveProfileEdge(L, { loop: 0, index: 1 }, -19.995)).toThrow(/too short to cut/);
  });

  it('refuses an outline driven by parameters, a curve, an outline that would cross itself', () => {
    expect(() => moveProfileEdge({ type: 'rectangle', width: '=w', height: 60 }, { loop: 0, index: 1 }, 1)).toThrow(
      'This outline is driven by parameters: change the parameter instead.',
    );
    expect(
      outlineMoveProblem(
        path([
          [0, 0],
          ['=a', 0],
          [100, 60],
        ]),
      ),
    ).toBe('This outline is driven by parameters: change the parameter instead.');
    const arc = {
      type: 'path',
      start: [0, 0],
      segments: [
        { type: 'line', end: [100, 0] },
        { type: 'arc', mid: [50, 50], end: [0, 0] },
      ],
      closed: true,
    };
    expect(() => moveProfileEdge(arc, { loop: 0, index: 1 }, 1)).toThrow(
      'Only a straight edge of the outline can be moved.',
    );
    // A V notch from the top: the bottom edge moved up past its tip.
    const vee = polygon([
      [0, 0],
      [100, 0],
      [100, 100],
      [60, 100],
      [50, 50],
      [40, 100],
      [0, 100],
    ]);
    expect(() => moveProfileEdge(vee, { loop: 0, index: 0 }, -60)).toThrow('This would make the outline cross itself.');
    expect(moveProfileEdge(vee, { loop: 0, index: 0 }, -40).points[0]).toEqual([0, 40]);
  });

  it("with a span, jogs square at both span ends; a span end on the edge's own end slides as without one (§4.4 4c)", () => {
    const rect = { type: 'rectangle', width: 100, height: 60, origin: [0, 0] };
    const both = moveProfileEdge(rect, { loop: 0, index: 1 }, 5, {
      span: [
        [100, 40],
        [100, 20],
      ],
    });
    expect(both.type).toBe('path');
    expect(corners(both)).toEqual([
      [0, 0],
      [100, 0],
      [100, 20],
      [105, 20],
      [105, 40],
      [100, 40],
      [100, 60],
      [0, 60],
    ]);
    // The jogs are square to the moved edge.
    expect(both.segments[2].end[1]).toBe(both.segments[1].end[1]);
    // From the edge's start: a slide there, a jog at the span's other end.
    const one = moveProfileEdge(
      polygon([
        [0, 0],
        [100, 0],
        [100, 60],
        [0, 60],
      ]),
      { loop: 0, index: 1 },
      5,
      {
        span: [
          [100, 0],
          [100, 30],
        ],
      },
    );
    expect(one.points).toEqual([
      [0, 0],
      [105, 0],
      [105, 30],
      [100, 30],
      [100, 60],
      [0, 60],
    ]);
    // The whole edge as its span: as without one.
    expect(
      moveProfileEdge(rect, { loop: 0, index: 1 }, 5, {
        span: [
          [100, 0],
          [100, 60],
        ],
      }),
    ).toEqual(moveProfileEdge(rect, { loop: 0, index: 1 }, 5));
    expect(() =>
      moveProfileEdge(rect, { loop: 0, index: 1 }, 5, {
        span: [
          [90, 0],
          [90, 60],
        ],
      }),
    ).toThrow('The stretch to move is not on that edge.');
  });

  it("the user's covering ear: the rear wall's own stretch out with square jogs, the zones' stretches kept", () => {
    const span = [
      [285.970563, 84.789254],
      [285.970563, 101.468104],
    ];
    const moved = moveProfileEdge(USER_TRAY_PROFILE, { loop: 0, index: 2 }, 1.9336, { span });
    expect(moved.segments).toHaveLength(USER_TRAY_PROFILE.segments.length + 4);
    expect(moved.segments.slice(1, 7).map((s) => s.end)).toEqual([
      [285.970563, 103.029437],
      [285.970563, 101.468104],
      [287.904163, 101.468104],
      [287.904163, 84.789254],
      [285.970563, 84.789254],
      [285.970563, 83.029437],
    ]);
  });
});

describe('outlineEditor: several moves read from one outline', () => {
  it('keeps every handle good although a jog shifts the indexes behind it, and traces where things came from', () => {
    const editor = outlineEditor(
      polygon([
        [0, 0],
        [100, 0],
        [100, 60],
        [0, 60],
      ]),
    );
    const right = editor.edge({ loop: 0, index: 1 }),
      top = editor.edge({ loop: 0, index: 2 });
    editor.move(right, 5, {
      span: [
        [100, 20],
        [100, 40],
      ],
    });
    editor.move(top, 2);
    editor.check();
    expect(editor.profile().points).toEqual([
      [0, 0],
      [100, 0],
      [100, 20],
      [105, 20],
      [105, 40],
      [100, 40],
      [100, 62],
      [0, 62],
    ]);
    expect(editor.trace().loops[0].map((o) => o && o.index)).toEqual([0, null, null, 1, null, null, 2, 3]);
    expect(editor.trace().corners).toEqual([
      { from: [100, 60], to: [100, 62] },
      { from: [0, 60], to: [0, 62] },
    ]);
    expect(editor.moved()).toEqual([
      { segment: { loop: 0, index: 3 }, origin: { loop: 0, index: 1 }, distance: 5 },
      { segment: { loop: 0, index: 6 }, origin: { loop: 0, index: 2 }, distance: 2 },
    ]);
  });
});

describe('what the sketcher keeps (§4.3)', () => {
  it('carries the entities: points moved, ids kept, a new edge given the next id, in step after', () => {
    const profile = path([
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ]);
    const entities = profileToEntities(profile).map((e, i) => ({ ...e, id: `e${10 + i}` }));
    expect(JSON.stringify(entitiesToProfile(entities).profile)).toBe(JSON.stringify(profile));
    // A slide: the same four entities.
    let editor = outlineEditor(profile);
    editor.move(editor.edge({ loop: 0, index: 1 }), 5);
    let next = editor.profile();
    let carried = carryEntities(entities, profile, next, editor.trace());
    expect(carried.map((e) => e.id)).toEqual(['e10', 'e11', 'e12', 'e13']);
    expect(carried[1]).toEqual({ id: 'e11', type: 'line', a: [105, 0], b: [105, 60] });
    expect(JSON.stringify(entitiesToProfile(carried).profile)).toBe(JSON.stringify(next));
    // A span: the moved stretch keeps the entity; the rest and the jogs are new, each after the entity before it.
    editor = outlineEditor(profile);
    editor.move(editor.edge({ loop: 0, index: 1 }), 5, {
      span: [
        [100, 20],
        [100, 40],
      ],
    });
    next = editor.profile();
    carried = carryEntities(entities, profile, next, editor.trace());
    expect(carried.map((e) => e.id)).toEqual(['e10', 'e14', 'e15', 'e11', 'e16', 'e17', 'e12', 'e13']);
    expect(carried[3]).toEqual({ id: 'e11', type: 'line', a: [105, 20], b: [105, 40] });
    expect(JSON.stringify(entitiesToProfile(carried).profile)).toBe(JSON.stringify(next));
    // Entities not in step with the profile are not carried (the caller rebuilds them).
    expect(carryEntities(entities.slice(1), profile, next, editor.trace())).toBe(null);
  });

  it("carries the user's own entities through a set of their wall end", () => {
    const entities = profileToEntities(USER_TRAY_PROFILE);
    const editor = outlineEditor(USER_TRAY_PROFILE);
    editor.move(editor.edge({ loop: 0, index: 2 }), 0.5);
    const next = editor.profile();
    const carried = carryEntities(entities, USER_TRAY_PROFILE, next, editor.trace());
    expect(carried.map((e) => e.id)).toEqual(entities.map((e) => e.id));
    expect(JSON.stringify(entitiesToProfile(carried).profile)).toBe(JSON.stringify(next));
  });

  it('a reference dimension on a corner that moved goes with it; any other end stays', () => {
    const editor = outlineEditor(
      polygon([
        [0, 0],
        [100, 0],
        [100, 60],
        [0, 60],
      ]),
    );
    editor.move(editor.edge({ loop: 0, index: 1 }), 5);
    const dimensions = [
      { id: 'd1', type: 'linear', from: [100, 0], to: [100, 60], orientation: 'vertical', offset: 10 },
      { id: 'd2', type: 'linear', from: [0, 0], to: [100.0004, 60], orientation: 'horizontal', offset: -8 },
      { id: 'd3', type: 'linear', from: [0, 0], to: [50, 30], orientation: 'aligned', offset: 0 },
      { id: 'd4', type: 'radial', mode: 'radius', center: [100, 0], radius: 3, at: [104, 4] },
    ];
    const carried = carryDimensions(dimensions, editor.trace());
    expect(carried[0]).toEqual({ ...dimensions[0], from: [105, 0], to: [105, 60] });
    expect(carried[1]).toEqual({ ...dimensions[1], to: [105, 60] });
    expect(carried[2]).toBe(dimensions[2]);
    expect(carried[3]).toBe(dimensions[3]);
    // Nothing moved: the list as it was.
    expect(
      carryDimensions(
        dimensions,
        outlineEditor(
          polygon([
            [0, 0],
            [1, 0],
            [1, 1],
          ]),
        ).trace(),
      ),
    ).toBe(dimensions);
    expect(carryDimensions(undefined, editor.trace())).toBe(undefined);
  });
});
