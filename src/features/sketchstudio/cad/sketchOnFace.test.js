import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { Vector3 } from 'three';
import { emptyModel, normalizeModel } from './model.js';
import { instanceMatrix } from './movement.js';
import { createKernelSession } from './kernel.js';
import { operationModel } from './operations.js';
import {
  faceFrame,
  faceOutline,
  frameToInstance,
  frameToSketchFields,
  makeFrame,
  mapFrame,
  planeFrame,
  segmentsInPlane,
  sketchLocalFrame,
  sketchWorldFrame,
  toPlane,
  toWorld,
  unmapFrame,
  uprightAxes,
} from './sketchPlane.js';
import { arcGeometry, entitiesToProfile, profileToEntities, describeEntity, hitEntity } from './sketchProfile.js';
import { snapPoint, snapTargets } from './sketchSnap.js';
import {
  createSketchState,
  liveValues,
  previewEntities,
  sketchFields,
  sketchReducer,
  typedPoint,
} from './sketchTools.js';
import {
  defaultSketchSettings,
  editableEntities,
  mergeSegments,
  sketchEditProblem,
  sketchFromSession,
  sketchOperationDraft,
  sketchView,
} from './sketchOperations.js';

const close = (actual, expected, digits = 6) =>
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, digits));
const run = (state, ...actions) => actions.reduce(sketchReducer, state);

describe('sketch plane frames', () => {
  it('matches the kernel named planes, including offsets along the plane axis', () => {
    const xy = planeFrame('XY', 24);
    close(xy.origin, [0, 0, 24]);
    close(xy.y, [0, 1, 0]);
    const xz = planeFrame('XZ', 100);
    close(xz.origin, [0, 100, 0]);
    close(xz.normal, [0, -1, 0]);
    close(xz.y, [0, 0, 1]); // Replicad: y = normal × x
    const yz = planeFrame('YZ', -5);
    close(yz.origin, [-5, 0, 0]);
    close(yz.x, [0, 1, 0]);
    close(yz.y, [0, 0, 1]);
    expect(() => planeFrame('ZX')).toThrow(/Choose a sketch plane/);
    for (const name of ['XY', 'XZ', 'YZ']) {
      const frame = planeFrame(name);
      const upright = uprightAxes(frame.normal);
      close(upright.x, frame.x);
      close(upright.y, frame.y);
    }
  });

  it('round-trips points and stores named planes by name', () => {
    const frame = makeFrame([10, 20, 30], [0, 0, 1], [1, 1, 0]);
    const world = toWorld(frame, [12.5, -7]);
    close(toPlane(frame, world), [12.5, -7, 0]);
    expect(frameToSketchFields(planeFrame('XZ', 3))).toEqual({
      plane: 'XZ',
      origin: [0, 3, 0],
      normal: undefined,
      xDirection: undefined,
    });
    const custom = frameToSketchFields(frame);
    expect(custom.plane).toBe('custom');
    const back = sketchLocalFrame(custom);
    close(back.normal, frame.normal);
    close(back.x, frame.x);
    close(back.origin, frame.origin);
  });

  it('puts a face sketch origin at the lower-left corner of the face as seen from outside', () => {
    // Underside of a 1200 × 650 board lying on z = 0, seen from below.
    const outline = [
      [0, 0, 0],
      [1200, 0, 0],
      [1200, 650, 0],
      [0, 650, 0],
    ];
    const frame = faceFrame([0, 0, -1], outline);
    close(frame.normal, [0, 0, -1]);
    close(frame.x, [-1, 0, 0]); // matches the standard bottom view (screen right = −X)
    close(frame.y, [0, 1, 0]);
    close(frame.origin, [1200, 0, 0]);
    close(toWorld(frame, [60, 60]), [1140, 60, 0]);
    // Top face: same orientation as the XY plane, origin at the board corner.
    const top = faceFrame(
      [0, 0, 1],
      outline.map(([x, y]) => [x + 100, y + 50, 24]),
    );
    close(top.origin, [100, 50, 24]);
    close(top.x, [1, 0, 0]);
    // Front face (normal −Y): x along +X, y up.
    const front = faceFrame(
      [0, -1, 0],
      [
        [0, 0, 0],
        [60, 0, 0],
        [60, 0, 726],
        [0, 0, 726],
      ],
    );
    close(front.x, [1, 0, 0]);
    close(front.y, [0, 0, 1]);
  });

  it('finds the picked face outline from a mesh with shared face vertices', () => {
    // Two faces: a 10×10 square at z=0 (two triangles) and a separate side face.
    const positions = [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 0, 10, 0, 0, 10, 0, 5];
    const index = [0, 1, 2, 0, 2, 3, 4, 5, 6];
    const outline = faceOutline(positions, index, 1, [0, 0, 1]);
    expect(outline.triangles.sort()).toEqual([0, 1]);
    expect(outline.segments).toHaveLength(4);
    const frame = faceFrame([0, 0, 1], outline.points);
    const inPlane = segmentsInPlane(frame, outline.segments);
    expect(inPlane).toHaveLength(4);
    expect(
      segmentsInPlane(frame, [
        [
          [0, 0, 1],
          [5, 0, 1],
        ],
      ]),
    ).toHaveLength(0);
  });

  it('turns a frame into an instance pose that maps the sketch onto it', () => {
    const frames = [
      planeFrame('XY'),
      planeFrame('XZ', 40),
      faceFrame(
        [0, 0, -1],
        [
          [0, 0, 0],
          [100, 50, 0],
        ],
      ),
      makeFrame([5, -3, 70], [0.6, 0.8, 0], [0.8 * 0.6, -0.6 * 0.6, 0.8]),
    ];
    for (const frame of frames) {
      const instance = frameToInstance(frame);
      const matrix = instanceMatrix(instance);
      for (const uv of [
        [0, 0],
        [120, 0],
        [0, 45],
        [33, -17],
      ]) {
        const mapped = new Vector3(uv[0], uv[1], 0).applyMatrix4(matrix).toArray();
        close(mapped, toWorld(frame, uv), 5);
      }
      const normal = new Vector3(0, 0, 1).transformDirection(matrix).toArray();
      close(normal, frame.normal, 6);
    }
  });

  it('moves frames between world and part coordinates with kernel placement operations', () => {
    const placement = [{ angle: 90, axis: [0, 0, 1], origin: [0, 0, 0] }, { translation: [100, 0, 726] }];
    const world = planeFrame('XY', 726);
    const local = unmapFrame(world, placement);
    close(local.origin, [0, 100, 0], 6);
    close(local.normal, [0, 0, 1]);
    const again = mapFrame(local, placement);
    close(again.origin, world.origin);
    close(again.x, world.x);
  });
});

describe('sketch entities to kernel profiles', () => {
  it('emits rectangle and circle primitives when one was drawn', () => {
    expect(entitiesToProfile([{ id: 'e1', type: 'rect', a: [1200, 650], b: [0, 0] }]).profile).toEqual({
      type: 'rectangle',
      width: 1200,
      height: 650,
      origin: [0, 0],
    });
    expect(entitiesToProfile([{ id: 'e1', type: 'circle', c: [60, 60], r: 3 }]).profile).toEqual({
      type: 'circle',
      radius: 3,
      center: [60, 60],
    });
  });

  it('chains lines and arcs into one closed path, in any drawing order and direction', () => {
    const entities = [
      { id: 'a', type: 'line', a: [100, 0], b: [0, 0] },
      { id: 'b', type: 'arc', a: [100, 0], b: [100, 50], m: [125, 25] },
      { id: 'c', type: 'line', a: [0, 50], b: [0, 0] },
      { id: 'd', type: 'line', a: [100, 50], b: [0, 50] },
    ];
    const { profile, closed, problems } = entitiesToProfile(entities);
    expect(closed).toBe(true);
    expect(problems).toEqual([]);
    expect(profile.type).toBe('path');
    expect(profile.closed).toBe(true);
    expect(profile.segments).toHaveLength(4);
    expect(profile.segments.at(-1).end).toEqual(profile.start);
    expect(profile.segments.filter((s) => s.type === 'arc')).toEqual([expect.objectContaining({ mid: [125, 25] })]);
  });

  it('turns inner loops into holes and reports what it cannot use', () => {
    const plate = { id: 'p', type: 'rect', a: [0, 0], b: [200, 100] };
    const hole = { id: 'h', type: 'circle', c: [50, 50], r: 10 };
    const slot = { id: 's', type: 'rect', a: [100, 20], b: [180, 40] };
    const result = entitiesToProfile([hole, plate, slot]);
    expect(result.profile.type).toBe('rectangle');
    expect(result.profile.holes).toEqual([
      { type: 'circle', radius: 10, center: [50, 50] },
      { type: 'rectangle', width: 80, height: 20, origin: [100, 20] },
    ]);
    const island = { id: 'i', type: 'circle', c: [50, 50], r: 4 };
    const second = { id: 'x', type: 'rect', a: [300, 0], b: [310, 10] };
    const messy = entitiesToProfile([plate, hole, island, second]);
    expect(messy.profile.holes).toHaveLength(1);
    expect(messy.problems.join(' ')).toMatch(/separate outlines/);
    expect(messy.problems.join(' ')).toMatch(/inside a hole/);
  });

  it('keeps an open outline as an open path and refuses branching outlines', () => {
    const open = entitiesToProfile([
      { id: 'a', type: 'line', a: [0, 0], b: [10, 0] },
      { id: 'b', type: 'line', a: [10, 0], b: [10, 10] },
    ]);
    expect(open.closed).toBe(false);
    expect(open.profile).toMatchObject({ type: 'path', closed: false, start: [0, 0] });
    expect(open.problems[0]).toMatch(/open outline/);
    const branch = entitiesToProfile([
      { id: 'a', type: 'line', a: [0, 0], b: [10, 0] },
      { id: 'b', type: 'line', a: [10, 0], b: [10, 10] },
      { id: 'c', type: 'line', a: [10, 10], b: [0, 0] },
      { id: 'd', type: 'line', a: [10, 0], b: [20, 0] },
    ]);
    expect(branch.closed).toBe(false);
    expect(branch.problems[0]).toMatch(/Three or more lines/);
    expect(entitiesToProfile([]).profile).toBeNull();
  });

  it('converts stored profiles back to editable entities, but not expressions or splines', () => {
    const profile = {
      type: 'path',
      start: [0, 0],
      segments: [
        { type: 'line', end: [40, 0] },
        { type: 'arc', end: [40, 20], mid: [50, 10] },
        { type: 'line', end: [0, 20] },
      ],
      closed: true,
      holes: [{ type: 'circle', radius: 3, center: [10, 10] }],
    };
    const entities = profileToEntities(profile);
    expect(entities.map((e) => e.type)).toEqual(['line', 'arc', 'line', 'line', 'circle']);
    const rebuilt = entitiesToProfile(entities).profile;
    expect(rebuilt.holes).toEqual(profile.holes);
    expect(rebuilt.segments.slice(0, 3)).toEqual(profile.segments);
    expect(profileToEntities({ type: 'rectangle', width: '=width', height: 10 })).toBeNull();
    expect(profileToEntities({ ...profile, segments: [{ type: 'spline', end: [1, 1] }] })).toBeNull();
    expect(describeEntity({ type: 'circle', c: [60, 60], r: 3 })).toBe('Circle Ø6 at (60, 60)');
  });

  it('computes 3-point arcs in the drawn direction', () => {
    const ccw = arcGeometry([10, 0], [0, 10], [-10, 0]);
    close(ccw.center, [0, 0]);
    expect(ccw.sweep).toBeCloseTo(Math.PI);
    const cw = arcGeometry([10, 0], [0, -10], [-10, 0]);
    expect(cw.sweep).toBeCloseTo(-Math.PI);
    expect(arcGeometry([0, 0], [5, 0], [10, 0])).toBeNull();
  });
});

describe('sketch snapping', () => {
  const rect = { id: 'e1', type: 'rect', a: [0, 0], b: [100, 50] };
  const boundary = [
    [
      [0, -40],
      [300, -40],
    ],
  ];
  const targets = snapTargets({ entities: [rect], boundary });
  it('prefers key points, then edges, then the grid', () => {
    expect(snapPoint([99.2, 50.6], { targets, grid: 10, tolerance: 2 })).toEqual({
      point: [100, 50],
      kind: 'endpoint',
    });
    expect(snapPoint([50.4, 0.7], { targets, grid: 10, tolerance: 2 }).kind).toBe('midpoint');
    expect(snapPoint([0.5, -0.4], { targets, grid: 10, tolerance: 2 }).point).toEqual([0, 0]);
    expect(snapPoint([150.6, 50.4], { targets, grid: 10, tolerance: 2 })).toEqual({ point: [150, 50], kind: 'grid' });
    // On a horizontal model edge, keep the grid step along it.
    expect(snapPoint([212.6, -39.2], { targets, grid: 5, tolerance: 2 })).toEqual({
      point: [215, -40],
      kind: 'on edge',
    });
    expect(snapPoint([299.4, -40.5], { targets, grid: 5, tolerance: 2 }).kind).toBe('edge end');
    expect(snapPoint([12.34, 56.78], { targets, grid: 0, tolerance: 0.01 })).toEqual({
      point: [12.34, 56.78],
      kind: 'free',
    });
  });
  it('locks horizontal or vertical from the previous point with Shift', () => {
    expect(snapPoint([73.4, 8], { targets, grid: 1, tolerance: 2, ortho: true, from: [0, 0] })).toEqual({
      point: [73, 0],
      kind: 'ortho',
    });
    // Ortho still aligns with a key point's coordinate.
    expect(snapPoint([3, 50.8], { targets, grid: 1, tolerance: 2, ortho: true, from: [0, 0] })).toEqual({
      point: [0, 50],
      kind: 'ortho · endpoint',
    });
  });
});

describe('sketch tools', () => {
  it('draws a typed rectangle: first corner, then width Tab height Enter', () => {
    let state = run(createSketchState(), { type: 'tool', tool: 'rect' }, { type: 'click', point: [0, 0] });
    expect(sketchFields(state)).toEqual(['Width', 'Height']);
    state = run(
      state,
      { type: 'move', point: [30, 20] },
      { type: 'typed', field: 'Width', value: '1200' },
      { type: 'field', index: 1 },
      { type: 'typed', field: 'Height', value: '650' },
    );
    expect(previewEntities(state)[0]).toMatchObject({ a: [0, 0], b: [1200, 650] });
    state = sketchReducer(state, { type: 'enter' });
    expect(state.entities).toEqual([{ id: 'e1', type: 'rect', a: [0, 0], b: [1200, 650] }]);
    expect(state.tool).toBe('rect');
    expect(state.points).toEqual([]);
  });

  it('types a first point, a circle radius, and rejects invalid values', () => {
    let state = run(createSketchState(), { type: 'tool', tool: 'circle' }, { type: 'move', point: [3, 4] });
    expect(sketchFields(state)).toEqual(['X', 'Y']);
    state = run(
      state,
      { type: 'typed', field: 'X', value: '60' },
      { type: 'typed', field: 'Y', value: '60' },
      { type: 'enter' },
    );
    expect(state.points).toEqual([[60, 60]]);
    expect(liveValues({ ...state, cursor: [63, 64] }).Radius).toBeCloseTo(5);
    state = run(state, { type: 'typed', field: 'Radius', value: '-2' }, { type: 'enter' });
    expect(state.message).toMatch(/greater than zero/);
    state = run(state, { type: 'typed', field: 'Radius', value: '3' }, { type: 'enter' });
    expect(state.entities).toEqual([{ id: 'e1', type: 'circle', c: [60, 60], r: 3 }]);
  });

  it('draws a closed polyline by clicking back on its start, and typed lengths follow the cursor angle', () => {
    let state = run(
      createSketchState(),
      { type: 'tool', tool: 'line' },
      { type: 'click', point: [0, 0] },
      { type: 'move', point: [10, 0.2] },
      { type: 'typed', field: 'Length', value: '100' },
      { type: 'typed', field: 'Angle', value: '0' },
      { type: 'enter' },
      { type: 'click', point: [100, 50] },
      { type: 'click', point: [0, 50] },
      { type: 'click', point: [0, 0] },
    );
    expect(state.entities.map((e) => [e.a, e.b])).toEqual([
      [
        [0, 0],
        [100, 0],
      ],
      [
        [100, 0],
        [100, 50],
      ],
      [
        [100, 50],
        [0, 50],
      ],
      [
        [0, 50],
        [0, 0],
      ],
    ]);
    expect(state.points).toEqual([]);
    expect(entitiesToProfile(state.entities).closed).toBe(true);
    // Typed length without an angle follows the cursor direction.
    state = run(state, { type: 'click', point: [0, 0] }, { type: 'move', point: [0, -5] });
    expect(typedPoint({ ...state, typed: { Length: '30' } })).toEqual([0, -30]);
    // Enter with nothing typed (or a repeated click) ends the polyline.
    expect(sketchReducer(state, { type: 'enter' }).points).toEqual([]);
    expect(sketchReducer(state, { type: 'click', point: [0, 0] }).points).toEqual([]);
  });

  it('draws centre rectangles and 3-point arcs; Esc drops the tool, then deselects', () => {
    let state = run(
      createSketchState(),
      { type: 'tool', tool: 'rect-center' },
      { type: 'click', point: [0, 0] },
      { type: 'typed', field: 'Width', value: '60' },
      { type: 'typed', field: 'Height', value: '40' },
      { type: 'move', point: [-1, -1] },
      { type: 'enter' },
    );
    expect(state.entities[0]).toMatchObject({ a: [30, 20], b: [-30, -20] });
    state = run(
      state,
      { type: 'tool', tool: 'arc' },
      { type: 'click', point: [10, 0] },
      { type: 'click', point: [-10, 0] },
    );
    expect(sketchReducer(state, { type: 'click', point: [0, 0] }).message).toMatch(/chord/);
    state = sketchReducer(state, { type: 'click', point: [0, 10] });
    expect(state.entities[1]).toMatchObject({ type: 'arc', a: [10, 0], b: [-10, 0], m: [0, 10] });
    state = run(state, { type: 'click', point: [5, 5] }, { type: 'escape' });
    expect(state.tool).toBeNull();
    expect(state.points).toEqual([]);
    state = run(state, { type: 'select', id: 'e1' }, { type: 'delete' });
    expect(state.entities.map((e) => e.id)).toEqual(['e2']);
    state = sketchReducer(state, { type: 'undo' });
    expect(state.entities).toEqual([]);
    // Ids continue after reopening a sketch.
    expect(createSketchState([{ id: 'e7', type: 'circle', c: [0, 0], r: 1 }]).nextId).toBe(8);
    expect(hitEntity([{ id: 'c', type: 'circle', c: [0, 0], r: 10 }], [10.2, 0], 0.5)).toBe('c');
  });
});

describe('finished sketches and operation drafts', () => {
  const rectEntities = [{ id: 'e1', type: 'rect', a: [0, 0], b: [100, 50] }];
  it('stores a new sketch on its frame and an edited one on its existing plane', () => {
    const session = { frame: planeFrame('XZ', 10), support: { type: 'plane', plane: 'XZ', offset: 10 } };
    const { sketch, closed } = sketchFromSession({ session, entities: rectEntities, name: 'Sketch 1' });
    expect(closed).toBe(true);
    expect(sketch).toMatchObject({ name: 'Sketch 1', plane: 'XZ', origin: [0, 10, 0], entities: rectEntities });
    expect(() => normalizeModel({ ...emptyModel(), sketches: [sketch] })).not.toThrow();
    const edited = sketchFromSession({
      session,
      entities: [{ id: 'e1', type: 'circle', c: [0, 0], r: 5 }],
      existing: { ...sketch, plane: 'XY', origin: [0, 0, 0] },
    }).sketch;
    expect(edited).toMatchObject({ id: sketch.id, plane: 'XY', profile: { type: 'circle', radius: 5 } });
    expect(() => sketchFromSession({ session, entities: [] })).toThrow(/closed outline/);
    expect(editableEntities(sketch)).toBe(sketch.entities);
    // A profile edited elsewhere is re-read rather than trusting stale entities.
    const changed = { ...sketch, profile: { type: 'circle', radius: 9, center: [1, 2] } };
    expect(editableEntities(changed)).toEqual([{ id: 'e1', type: 'circle', c: [1, 2], r: 9 }]);
    expect(sketchEditProblem({ ...sketch, profile: { type: 'rectangle', width: '=w', height: 2 } })).toMatch(
      /parameter/,
    );
  });

  it('frames the view on the face outline or the projected model, including the origin', () => {
    const view = sketchView(planeFrame('XY'), [
      [
        [0, 0],
        [1200, 650],
      ],
    ]);
    close(view.focus.position, [600, 325, 0]);
    close(view.focus.up, [0, 1, 0]);
    expect(view.span).toBeCloseTo(1200 * 1.35);
    const projected = sketchView(planeFrame('XY'), [], {
      instances: [
        {
          bounds: [
            [100, 100, 0],
            [300, 200, 50],
          ],
        },
      ],
    });
    close(projected.focus.position, [150, 100, 0]);
    expect(
      mergeSegments([
        [
          [0, 0],
          [1, 0],
        ],
        [
          [1, 0],
          [0, 0],
        ],
      ]),
    ).toHaveLength(1);
  });
});

// Real OpenCascade round trip: the hand-built wooden desk top.
describe('sketch → extrude → face sketch → cut, in the kernel', () => {
  beforeAll(
    async () =>
      setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
    60000,
  );
  const require = createRequire(import.meta.url);
  const build = (model, fn) => {
    const session = createKernelSession(model);
    try {
      return fn(session, session.snapshot());
    } finally {
      session.dispose();
    }
  };
  const applyDraft = (model, snapshot, sketchId, settings) =>
    normalizeModel(operationModel(sketchOperationDraft({ model, snapshot, sketchId, settings })));

  it('builds the desk top, drills Ø6 from the underside, and lands a face sketch exactly on the face', () => {
    // 1. Rectangle 1200 × 650 on XY, extruded 24 as a new part.
    let model = emptyModel();
    const topSketch = sketchFromSession({
      session: { frame: planeFrame('XY'), support: { type: 'plane', plane: 'XY', offset: 0 } },
      entities: [{ id: 'e1', type: 'rect', a: [0, 0], b: [1200, 650] }],
      name: 'Top',
    }).sketch;
    model = { ...model, sketches: [topSketch] };
    model = applyDraft(model, null, topSketch.id, defaultSketchSettings({ model, sketch: topSketch, mode: 'extrude' }));
    model.parts[0].features[0].length = 24;
    const top = model.instances[0];
    expect(top.position).toEqual([0, 0, 0]);
    expect(top.rotation).toEqual([0, 0, 0]);
    let snapshot = build(model, (_, snap) => snap);
    close(snapshot.instances[0].bounds[0], [0, 0, 0], 4);
    close(snapshot.instances[0].bounds[1], [1200, 650, 24], 4);

    // 2. Pick the underside (normal −Z), sketch a Ø6 circle at (60, 60), cut through.
    const under = faceFrame(
      [0, 0, -1],
      [
        [0, 0, 0],
        [1200, 0, 0],
        [1200, 650, 0],
        [0, 650, 0],
      ],
    );
    const holeSketch = sketchFromSession({
      session: { frame: under, support: { type: 'face', instanceId: top.id, partId: top.partId } },
      entities: [{ id: 'e1', type: 'circle', c: [60, 60], r: 3 }],
      name: 'Hole',
    }).sketch;
    model = { ...model, sketches: [...model.sketches, holeSketch] };
    const cutSettings = defaultSketchSettings({ model, snapshot, sketch: holeSketch, mode: 'cut' });
    expect(cutSettings).toMatchObject({ target: top.id, reverse: true, throughAll: true });
    const before = snapshot.parts[0].volume;
    model = applyDraft(model, snapshot, holeSketch.id, cutSettings);
    expect(model.parts[0].features.map((f) => f.operation)).toEqual(['add', 'cut']);

    // A probe pin where the hole should be overlaps nothing; one at the mirror corner does.
    const probe = (id, position) => ({ id, partId: 'pin', name: id, position, rotation: [0, 0, 0], visible: true });
    const withPins = {
      ...model,
      parts: [
        ...model.parts,
        { id: 'pin', name: 'Pin', features: [{ id: 'f', type: 'cylinder', radius: 2.5, length: 10 }] },
      ],
      instances: [...model.instances, probe('in-hole', [1140, 60, 7]), probe('in-wood', [60, 60, 7])],
    };
    build(withPins, (session, snap) => {
      expect(before - snap.parts[0].volume).toBeCloseTo(Math.PI * 9 * 24, 2);
      const collisions = session.inspect();
      expect(collisions.map((c) => c.first).sort()).toEqual([top.id]);
      expect(collisions.map((c) => c.second)).toEqual(['in-wood']);
    });

    // 3. Sketch on the top face of a rotated, raised instance; the new part lands on it.
    snapshot = build(model, (_, snap) => snap);
    const moved = {
      ...model,
      instances: [{ ...top, position: [0, 0, 726], rotation: [0, 0, 90] }],
    };
    snapshot = build(moved, (_, snap) => snap);
    const [min, max] = snapshot.instances[0].bounds;
    const topFace = faceFrame(
      [0, 0, 1],
      [min, [max[0], max[1], min[2]]].map(([x, y]) => [x, y, max[2]]),
    );
    const blockSketch = sketchFromSession({
      session: { frame: topFace, support: { type: 'face', instanceId: top.id, partId: top.partId } },
      entities: [{ id: 'e1', type: 'rect', a: [10, 20], b: [70, 80] }],
      name: 'Block',
    }).sketch;
    let withBlock = { ...moved, sketches: [...moved.sketches, blockSketch] };
    withBlock = applyDraft(withBlock, snapshot, blockSketch.id, {
      mode: 'extrude',
      target: 'new',
      distance: 30,
    });
    const block = withBlock.instances.at(-1);
    build(withBlock, (_, snap) => {
      const bounds = snap.instances.find((i) => i.id === block.id).bounds;
      close(bounds[0], [topFace.origin[0] + 10, topFace.origin[1] + 20, 750], 4);
      close(bounds[1], [topFace.origin[0] + 70, topFace.origin[1] + 80, 780], 4);
    });

    // 4. Join instead: the same sketch re-expressed in the rotated part's coordinates.
    const joined = applyDraft({ ...moved, sketches: [...moved.sketches, blockSketch] }, snapshot, blockSketch.id, {
      mode: 'extrude',
      target: top.id,
      distance: 30,
    });
    const joinedSketch = joined.sketches.find((s) => s.id === blockSketch.id);
    const shown = sketchWorldFrame(joined, snapshot, joinedSketch).frame;
    close(shown.origin, topFace.origin, 5);
    close(shown.x, topFace.x, 6);
    build(joined, (_, snap) => {
      expect(snap.parts[0].volume).toBeCloseTo(snapshot.parts[0].volume + 60 * 60 * 30, 1);
      expect(snap.instances[0].bounds[1][2]).toBeCloseTo(780, 4);
    });
  });

  it('extrudes against the sketch normal when flipped, and through-all cuts from either side', () => {
    const sketch = {
      id: 's',
      name: 's',
      plane: 'XY',
      origin: [0, 0, 0],
      profile: { type: 'rectangle', width: 10, height: 10, origin: [0, 0] },
    };
    const model = {
      ...emptyModel(),
      sketches: [sketch],
      parts: [
        { id: 'p', name: 'p', features: [{ id: 'f', type: 'extrude', sketchId: 's', length: 5, reverse: true }] },
      ],
      instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
    };
    build(model, (_, snap) => {
      expect(snap.parts[0].volume).toBeCloseTo(500, 4);
      close(snap.parts[0].bounds[0], [0, 0, -5], 4);
    });
    const plate = {
      ...model,
      sketches: [sketch, { ...sketch, id: 'c', profile: { type: 'circle', radius: 2, center: [5, 5] } }],
      parts: [
        {
          id: 'p',
          name: 'p',
          features: [
            { id: 'f', type: 'extrude', sketchId: 's', length: 40 },
            { id: 'c1', type: 'extrude', operation: 'cut', sketchId: 'c', length: 1, throughAll: true },
          ],
        },
      ],
    };
    build(plate, (_, snap) => expect(snap.parts[0].volume).toBeCloseTo(4000 - Math.PI * 4 * 40, 2));
    plate.parts[0].features[1].reverse = true;
    expect(() => createKernelSession(plate)).toThrow(/removes no material/);
  });

  it('extrudes drawn arcs and inner loops exactly as sketched', () => {
    const entities = [
      { id: 'e1', type: 'line', a: [0, 0], b: [100, 0] },
      { id: 'e2', type: 'arc', a: [100, 0], b: [100, 50], m: [125, 25] },
      { id: 'e3', type: 'line', a: [100, 50], b: [0, 50] },
      { id: 'e4', type: 'line', a: [0, 50], b: [0, 0] },
      { id: 'e5', type: 'circle', c: [30, 25], r: 10 },
      { id: 'e6', type: 'rect', a: [60, 15], b: [80, 35] },
    ];
    const { sketch } = sketchFromSession({
      session: { frame: planeFrame('YZ', 5), support: { type: 'plane', plane: 'YZ', offset: 5 } },
      entities,
      name: 'D plate',
    });
    let model = { ...emptyModel(), sketches: [sketch] };
    model = applyDraft(model, null, sketch.id, { mode: 'extrude', target: 'new', distance: 10 });
    build(model, (_, snap) => {
      const area = 100 * 50 + (Math.PI * 25 * 25) / 2 - Math.PI * 100 - 400;
      expect(snap.parts[0].volume).toBeCloseTo(area * 10, 1);
      // YZ plane at X = 5: u → +Y, v → +Z, extruded along +X.
      close(snap.instances[0].bounds[0], [5, 0, 0], 3);
      close(snap.instances[0].bounds[1], [15, 125, 50], 3);
    });
  });
});
