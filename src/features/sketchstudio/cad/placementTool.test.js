// Direct placement (Phase H): frames for faces, the ground and turned parts,
// part-coordinate round trips, the drag-direction inference table, Through
// all, sweep bend arcs, the face-centre candidate, reference matching, the
// revolve axis, loft sections, mirror / trim planes and the boolean tool pose.
import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Quaternion, Ray, Vector3 } from 'three';
import { emptyModel } from './model.js';
import { createOperationDraft, operationModel } from './operations.js';
import { mapPlacement } from './placement.js';
import { arcGeometry } from './sketchProfile.js';
import { faceFrame, frameToInstance, mapFrame, segmentsInPlane, sketchLocalFrame, uprightAxes } from './sketchPlane.js';
import { measureCandidates } from './marks.js';
import {
  CURVED_FACE,
  NO_REFERENCE,
  applyPlacementDrag,
  changeSweepOptions,
  defaultSquare,
  directionLabel,
  distanceState,
  dragReadout,
  dragView,
  faceCentroid,
  faceLabel,
  finishPlacement,
  ghostSegments,
  gripValue,
  matchReference,
  placeClick,
  placeFrame,
  placementSummary,
  placementView,
  polylineWithBends,
  replacePlacement,
  sketchFlowDistance,
  startAxisPick,
  startPlacement,
  stepBack,
  stopInference,
  toolPoseAfterMove,
  toolPoseAfterTurn,
} from './placementTool.js';

const close = (actual, expected, digits = 6) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
};
const BOARD = [
  [0, 0, 0],
  [600, 400, 18],
];
const REFERENCES = [
  { plane: 'XY', offset: 0, label: 'Bottom (XY)', edges: 4, faces: 1 },
  { plane: 'XY', offset: 18, label: 'Top (XY)', edges: 4, faces: 1 },
  { plane: 'XZ', offset: 0, label: 'Front (XZ)', edges: 4, faces: 1 },
  // The kernel builds XZ at offset · (0, -1, 0): this one selects y = -400.
  { plane: 'XZ', offset: 400, label: 'Rear (XZ)', edges: 0, faces: 0 },
  { plane: 'YZ', offset: 0, label: 'Left (YZ)', edges: 4, faces: 1 },
  { plane: 'YZ', offset: 600, label: 'Right (YZ)', edges: 4, faces: 1 },
];
// A board instance 'b1', optionally turned about Z and moved.
function world({ angle = 0, position = [0, 0, 0] } = {}) {
  const part = {
    id: 'board',
    name: 'Board',
    features: [{ id: 'box', type: 'box', width: 600, depth: 400, height: 18 }],
  };
  const instance = { id: 'b1', partId: 'board', name: '', position, rotation: [0, 0, angle] };
  const model = { ...emptyModel(), parts: [part], instances: [instance] };
  const placement = [...(angle ? [{ axis: [0, 0, 1], angle, origin: [0, 0, 0] }] : []), { translation: position }];
  const corners = [];
  for (const x of [0, 600])
    for (const y of [0, 400]) for (const z of [0, 18]) corners.push(mapPlacement([x, y, z], placement));
  const bounds = [0, 1, 2].map((k) => [Math.min(...corners.map((c) => c[k])), Math.max(...corners.map((c) => c[k]))]);
  const snapshot = {
    parameters: {},
    parts: [{ id: 'board', bounds: BOARD }],
    instances: [{ id: 'b1', partId: 'board', placement, bounds: [bounds.map((b) => b[0]), bounds.map((b) => b[1])] }],
  };
  return { model, snapshot, placement, ctx: { model, snapshot, parameters: {} } };
}
// Click info for a face of the board given in part coordinates.
function face(w, localPoint, localNormal, localCorners) {
  const toWorld = (p) => mapPlacement(p, w.placement);
  const normal = mapPlacement(localNormal, w.placement, true);
  const outlineWorld = localCorners.map((c, i) => [toWorld(c), toWorld(localCorners[(i + 1) % localCorners.length])]);
  const frame = faceFrame(normal, outlineWorld.flat());
  return {
    kind: 'face',
    planar: true,
    instanceId: 'b1',
    partId: 'board',
    point: toWorld(localPoint),
    normal,
    faceFrame: frame,
    outline: segmentsInPlane(frame, outlineWorld, 0.05),
    outlineWorld,
    snapKind: 'face',
  };
}
const TOP = [
  [0, 0, 18],
  [600, 0, 18],
  [600, 400, 18],
  [0, 400, 18],
];
const RIGHT = [
  [600, 0, 0],
  [600, 400, 0],
  [600, 400, 18],
  [600, 0, 18],
];
const BOTTOM = [
  [0, 0, 0],
  [0, 400, 0],
  [600, 400, 0],
  [600, 0, 0],
];
const draftFor = (w, type, { selected = false, existingFeature = null } = {}) =>
  createOperationDraft({
    type,
    model: w.model,
    partId: selected ? 'board' : undefined,
    bounds: BOARD,
    references: REFERENCES,
    existingFeature,
    placement: startPlacement({ type, existingFeature, hostInstanceId: selected ? 'b1' : null }),
  });

describe('frames and labels', () => {
  it('places on uprightAxes: a top face reads like XY, an underside has x = -X', () => {
    const top = placeFrame([10, 20, 18], [0, 0, 1]);
    close(top.x, [1, 0, 0]);
    close(top.y, [0, 1, 0]);
    const under = placeFrame([10, 20, 0], [0, 0, -1]);
    close(under.x, [-1, 0, 0]);
    close(under.normal, [0, 0, -1]);
    expect(uprightAxes([0, -1, 0]).x).toEqual([1, 0, 0]);
    expect(faceLabel([0, 0, 1])).toBe('top face');
    expect(faceLabel([0, -1, 0])).toBe('front face');
    expect(faceLabel([0.8, 0.6, 0])).toBe('face');
    expect(directionLabel([0, 0, -1])).toBe('-Z');
    expect(
      defaultSquare(
        segmentsInPlane(
          faceFrame([1, 0, 0], RIGHT),
          RIGHT.map((c, i) => [c, RIGHT[(i + 1) % 4]]),
        ),
      ),
    ).toBe(9);
    expect(defaultSquare([])).toBe(40);
  });
});

describe('Extrude placement', () => {
  it('starts in Place with no feature; a top-face click shapes that part in part coordinates', () => {
    const w = world();
    const draft = draftFor(w, 'extrude');
    expect(draft.placement.stage).toBe('place');
    expect(draft.feature).toBeNull();
    expect(operationModel(draft)).toBe(w.model);
    const placed = placeClick(draft, face(w, [120, 60, 18], [0, 0, 1], TOP), w.ctx);
    expect(placed.placement.stage).toBe('shape');
    expect(placed.partId).toBe('board');
    expect(placed.newPart).toBeNull();
    const sketch = placed.sketches[0];
    expect(sketch).toMatchObject({ plane: 'XY', origin: [120, 60, 18] });
    expect(sketch.profile).toEqual({ type: 'rectangle', width: 40, height: 40, origin: [-20, -20] });
    expect(placed.feature).toMatchObject({ type: 'extrude', operation: 'add', length: 18, sketchId: sketch.id });
    expect(placementSummary(placed, w.ctx)).toBe('On Board · top face · profile 40 × 40 mm at (120, 60) · along +Z');
    // The draft model holds the feature on the board definition.
    expect(operationModel(placed).parts[0].features.at(-1)).toBe(placed.feature);
  });

  it('a face of a part turned 37° about Z stores a part-coordinate sketch square to that face', () => {
    const w = world({ angle: 37, position: [500, 100, 0] });
    const info = face(w, [600, 200, 9], [1, 0, 0], RIGHT);
    const placed = placeClick(draftFor(w, 'extrude'), info, w.ctx);
    const sketch = placed.sketches[0];
    expect(sketch).toMatchObject({ plane: 'YZ', origin: [600, 200, 9] });
    // Round trip: the stored frame mapped by the kernel placement is the clicked world frame.
    const back = mapFrame(sketchLocalFrame(sketch), w.placement);
    close(back.origin, info.point, 4);
    close(back.normal, info.normal);
    // The 18 mm face gives a 9 mm default square.
    expect(sketch.profile.width).toBe(9);
  });

  it('an underside face keeps uprightAxes (x = -X) as an explicit plane', () => {
    const w = world();
    const placed = placeClick(draftFor(w, 'extrude'), face(w, [300, 200, 0], [0, 0, -1], BOTTOM), w.ctx);
    expect(placed.sketches[0]).toMatchObject({
      plane: 'custom',
      origin: [300, 200, 0],
      normal: [0, 0, -1],
      xDirection: [-1, 0, 0],
    });
    const view = placementView(placed, w.ctx);
    const arrow = view.handles.find((h) => h.id === 'distance');
    close(arrow.direction, [0, 0, -1]);
    close(arrow.origin, [300, 200, 0]);
  });

  it('clicking empty ground with an empty model makes a new part posed at the click', () => {
    const model = emptyModel();
    const ctx = { model, snapshot: { parameters: {}, parts: [], instances: [] }, parameters: {} };
    const draft = createOperationDraft({ type: 'extrude', model, placement: startPlacement({ type: 'extrude' }) });
    const placed = placeClick(draft, { kind: 'ground', point: [100, 50, 0], normal: [0, 0, 1], planar: true }, ctx);
    expect(placed.newPart.name).toBe('Part 1');
    expect(placed.newInstance).toMatchObject({
      position: [100, 50, 0],
      rotation: [0, 0, 0],
      partId: placed.newPart.id,
    });
    expect(placed.sketches[0]).toMatchObject({ plane: 'XY', origin: [0, 0, 0] });
    expect(placed.partId).toBe(placed.newPart.id);
    const model2 = operationModel(placed);
    expect(model2.parts).toHaveLength(1);
    expect(model2.instances).toHaveLength(1);
  });

  it('refuses a curved face and a click on the draft’s own new part', () => {
    const w = world();
    expect(() => placeClick(draftFor(w, 'extrude'), { kind: 'face', planar: false, instanceId: 'b1' }, w.ctx)).toThrow(
      CURVED_FACE,
    );
    const ground = placeClick(
      draftFor(w, 'extrude'),
      { kind: 'ground', point: [-200, 0, 0], normal: [0, 0, 1], planar: true },
      w.ctx,
    );
    const replace = replacePlacement(ground);
    expect(() =>
      placeClick(replace, { ...face(w, [1, 1, 18], [0, 0, 1], TOP), instanceId: ground.newInstance.id }, w.ctx),
    ).toThrow('existing part');
  });
});

describe('the distance arrow', () => {
  const existing = { active: true, existing: true, operation: 'add', depth: 18 };
  it('infers add / cut from the drag direction (outward/inward × existing/new × manual)', () => {
    expect(distanceState(existing, 25)).toMatchObject({ operation: 'add', reverse: false, cut: false, length: 25 });
    expect(distanceState(existing, -6)).toMatchObject({ operation: 'cut', reverse: true, cut: true, length: 6 });
    // A new part: inward is only a flip.
    const fresh = { active: true, existing: false, operation: 'add', depth: Infinity };
    expect(distanceState(fresh, -6)).toMatchObject({ operation: 'add', reverse: true, cut: false });
    // Operation chosen by hand: no inference either way.
    const manual = { active: false, existing: true, operation: 'add', depth: 18 };
    expect(distanceState(manual, -6)).toMatchObject({ operation: 'add', reverse: true, cut: false });
    const manualCut = { ...manual, operation: 'cut' };
    expect(distanceState(manualCut, 6)).toMatchObject({ operation: 'cut', reverse: false });
  });

  it('is Through all past the part’s far side, and never below 0.1 mm', () => {
    expect(distanceState(existing, -18).throughAll).toBe(false);
    expect(distanceState(existing, -18.5).throughAll).toBe(true);
    expect(distanceState(existing, -0.01).length).toBe(0.1);
  });

  it('drags into the board → cut, past it → Through all, back out → add; a manual Operation stops it', () => {
    const w = world();
    const placed = placeClick(draftFor(w, 'extrude'), face(w, [300, 200, 18], [0, 0, 1], TOP), w.ctx);
    const view = placementView(placed, w.ctx);
    expect(view.inference).toMatchObject({ active: true, existing: true, depth: 18 });
    const cut = applyPlacementDrag(placed, { id: 'distance', value: -6 }, w.ctx);
    expect(cut.feature).toMatchObject({ operation: 'cut', reverse: true, length: 6, throughAll: false });
    expect(placementView(cut, w.ctx).cut).toBe(true);
    const through = applyPlacementDrag(placed, { id: 'distance', value: -30 }, w.ctx);
    expect(through.feature).toMatchObject({ operation: 'cut', throughAll: true, length: 30 });
    const back = applyPlacementDrag(through, { id: 'distance', value: 30 }, w.ctx);
    expect(back.feature).toMatchObject({ operation: 'add', reverse: false, length: 30 });
    expect(back.feature).not.toHaveProperty('throughAll');
    const manual = stopInference(placed);
    const flipped = applyPlacementDrag(manual, { id: 'distance', value: -6 }, w.ctx);
    expect(flipped.feature).toMatchObject({ operation: 'add', reverse: true });
    // The live view and readout follow the same rule.
    const live = dragView(view, 'distance', -30);
    expect(live.cut).toBe(true);
    expect(live.throughAll).toBe(true);
    expect(dragReadout(view, 'distance', -6).text).toBe('Cut 6 mm');
    expect(dragReadout(view, 'distance', 25).text).toBe('25 mm');
  });

  it('slides the profile on the face and resizes it from the centred corner grip', () => {
    const w = world();
    const placed = placeClick(draftFor(w, 'extrude'), face(w, [100, 100, 18], [0, 0, 1], TOP), w.ctx);
    const slid = applyPlacementDrag(placed, { id: 'slide', value: [150, 80, 18], from: [100, 100, 18] }, w.ctx);
    expect(slid.sketches[0].origin).toEqual([150, 80, 18]);
    const grip = placementView(slid, w.ctx).handles.find((h) => h.id === 'corner');
    close(grip.at, [170, 100, 18]);
    const size = gripValue(grip, [180, 105, 18], { snap: 1 });
    expect(size).toEqual({ width: 60, height: 50 });
    const resized = applyPlacementDrag(slid, { id: 'corner', value: size }, w.ctx);
    expect(resized.sketches[0].profile).toEqual({ type: 'rectangle', width: 60, height: 50, origin: [-30, -25] });
    expect(resized.sketches[0].origin).toEqual([150, 80, 18]);
  });

  it('edits an existing extrude on its stored sketch, and hides the square and grip for a shared sketch', () => {
    const w = world();
    const sketch = {
      id: 's1',
      name: 'Pad',
      plane: 'XY',
      origin: [10, 10, 18],
      profile: { type: 'circle', radius: 5, center: [0, 0] },
    };
    const feature = { id: 'f1', type: 'extrude', operation: 'add', sketchId: 's1', length: 12 };
    const model = {
      ...w.model,
      sketches: [sketch],
      parts: [{ ...w.model.parts[0], features: [...w.model.parts[0].features, feature] }],
    };
    const ctx = { ...w.ctx, model };
    const draft = createOperationDraft({
      type: 'extrude',
      model,
      partId: 'board',
      existingFeature: feature,
      placement: startPlacement({ type: 'extrude', existingFeature: feature, hostInstanceId: 'b1' }),
    });
    const view = placementView(draft, ctx);
    expect(view.handles.map((h) => h.id)).toEqual(['distance', 'slide', 'radius']);
    expect(view.handles[0].value).toBe(12);
    const longer = applyPlacementDrag(draft, { id: 'distance', value: 20 }, ctx);
    expect(longer.feature.length).toBe(20);
    const moved = applyPlacementDrag(draft, { id: 'slide', value: [15, 30, 18], from: [10, 10, 18] }, ctx);
    expect(moved.sketches).toEqual([{ ...sketch, origin: [15, 30, 18] }]);
    expect(operationModel(moved).sketches.find((s) => s.id === 's1').origin).toEqual([15, 30, 18]);
    const shared = {
      ...model,
      parts: [{ ...model.parts[0], features: [...model.parts[0].features, { ...feature, id: 'f2' }] }],
    };
    const sharedView = placementView(
      createOperationDraft({
        ...draft,
        type: 'extrude',
        model: shared,
        partId: 'board',
        existingFeature: feature,
        placement: draft.placement,
      }),
      { ...ctx, model: shared },
    );
    // Moving or resizing a shared sketch would change the other feature: only the arrow.
    expect(sharedView.handles.map((h) => h.id)).toEqual(['distance']);
    expect(sharedView.hint).toContain('shared with another feature');
    expect(() => replacePlacement(draft)).toThrow('Edit sketch');
  });
});

describe('sweep', () => {
  // Tangent of an arc segment at a point on it: square to the radius, in the sweep direction.
  const tangentAt = (a, mid, b, point, toward) => {
    const { center } = arcGeometry(a, mid, b);
    const r = [point[0] - center[0], point[1] - center[1]];
    let t = [-r[1], r[0]];
    const l = Math.hypot(...t);
    t = [t[0] / l, t[1] / l];
    if (t[0] * toward[0] + t[1] * toward[1] < 0) t = [-t[0], -t[1]];
    return t;
  };
  it('rounds each corner with a tangent arc trimmed by r·tan(φ/2)', () => {
    const { start, segments } = polylineWithBends(
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      10,
    );
    expect(start).toEqual([0, 0]);
    expect(segments.map((s) => s.type)).toEqual(['line', 'arc', 'line']);
    expect(segments[0].end).toEqual([90, 0]);
    expect(segments[1].end).toEqual([100, 10]);
    // Tangency: the arc leaves along the first segment and arrives along the second.
    close(tangentAt([90, 0], segments[1].mid, [100, 10], [90, 0], [1, 0]), [1, 0]);
    close(tangentAt([90, 0], segments[1].mid, [100, 10], [100, 10], [0, 1]), [0, 1]);
    expect(arcGeometry([90, 0], segments[1].mid, [100, 10]).radius).toBeCloseTo(10, 5);
    // A 45° right turn: trim = r·tan(22.5°).
    const turn = polylineWithBends(
      [
        [0, 0],
        [100, 0],
        [200, -100],
      ],
      20,
    );
    expect(turn.segments[0].end[0]).toBeCloseTo(100 - 20 * Math.tan(Math.PI / 8), 5);
    const d = Math.SQRT1_2;
    close(tangentAt(turn.segments[0].end, turn.segments[1].mid, turn.segments[1].end, turn.segments[1].end, [d, -d]), [
      d,
      -d,
    ]);
  });

  it('refuses a segment too short for the bend and a path that turns back; 0 keeps sharp corners', () => {
    expect(() =>
      polylineWithBends(
        [
          [0, 0],
          [5, 0],
          [5, 100],
        ],
        10,
      ),
    ).toThrow('Segment 1 (5 mm) is too short for a 10 mm bend radius');
    expect(() =>
      polylineWithBends(
        [
          [0, 0],
          [50, 0],
          [0, 0],
        ],
        5,
      ),
    ).toThrow('turns back');
    expect(
      polylineWithBends(
        [
          [0, 0],
          [50, 0],
          [50, 50],
        ],
        0,
      ).segments.map((s) => s.type),
    ).toEqual(['line', 'line']);
  });

  it('draws the path by clicks on the face plane, finishes, and sizes the section by the grip', () => {
    const w = world();
    const front = [
      [0, 0, 0],
      [600, 0, 0],
      [600, 0, 18],
      [0, 0, 18],
    ];
    let draft = draftFor(w, 'sweep');
    expect(draft.placement.stage).toBe('place');
    draft = placeClick(draft, face(w, [300, 0, 18], [0, -1, 0], front), w.ctx);
    expect(draft.placement.problem).toBe('Click the next corner of the path.');
    expect(stepBack(draft, w.ctx).placement.points).toEqual([]);
    draft = placeClick(draft, { kind: 'path', point: [300, 0, 138] }, w.ctx);
    // A double-click's second click repeats the point: ignored.
    expect(placeClick(draft, { kind: 'path', point: [300, 0, 138] }, w.ctx)).toBe(draft);
    draft = placeClick(draft, { kind: 'path', point: [450, 0, 138] }, w.ctx);
    expect(placementSummary(draft, w.ctx)).toBe('Path: 2 segments, 270 mm · on Board · front face');
    draft = finishPlacement(draft);
    expect(draft.placement.stage).toBe('shape');
    const path = draft.sketches.find((s) => s.id === draft.feature.sketchId);
    expect(path).toMatchObject({ plane: 'XZ', origin: [300, 0, 18] });
    expect(path.profile.segments.map((s) => s.type)).toEqual(['line', 'arc', 'line']);
    // Default bend radius 2 × r = 10.
    expect(path.profile.segments[0].end).toEqual([0, 110]);
    const grip = placementView(draft, w.ctx).handles.find((h) => h.id === 'section');
    close(grip.at, [300, -5, 18]);
    const size = gripValue(grip, [300, -11, 18], { snap: 1 });
    expect(size).toEqual({ radius: 11 });
    const bigger = applyPlacementDrag(draft, { id: 'section', value: size }, w.ctx);
    expect(bigger.sketches.find((s) => s.id === bigger.feature.profileId).profile).toEqual({
      type: 'circle',
      radius: 11,
      center: [0, 0],
    });
    expect(bigger.sketches.find((s) => s.id === bigger.feature.sketchId).profile.segments[0].end).toEqual([0, 98]);
    // Too large a bend is a problem, not a crash; a wall makes a hollow section.
    const tight = changeSweepOptions(bigger, { bendRadius: 200 }, w.ctx);
    expect(tight.placement.problem).toContain('too short for a 200 mm bend radius');
    const hollow = changeSweepOptions(bigger, { bendRadius: 0, section: { wall: 2 } }, w.ctx);
    expect(hollow.placement.problem).toBe('');
    expect(hollow.sketches.find((s) => s.id === hollow.feature.profileId).profile.holes).toEqual([
      { type: 'circle', radius: 9, center: [0, 0] },
    ]);
    expect(hollow.sketches.find((s) => s.id === hollow.feature.sketchId).profile.segments.map((s) => s.type)).toEqual([
      'line',
      'line',
    ]);
  });
});

describe('the face-centre snap candidate', () => {
  it('is the area centroid of the face triangles (an L shape)', () => {
    // An L of two rectangles: [0,20]×[0,10] and [0,10]×[10,30].
    const positions = [0, 0, 0, 20, 0, 0, 20, 10, 0, 0, 10, 0, 10, 10, 0, 10, 30, 0, 0, 30, 0];
    const index = [0, 1, 2, 0, 2, 3, 3, 4, 5, 3, 5, 6];
    // Areas 200 at (10, 5) and 200 at (5, 20).
    close(faceCentroid(positions, index, [0, 1, 2, 3]), [7.5, 12.5, 0]);
  });

  it('ranks between midpoint and mark in measureCandidates', () => {
    const camera = new OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
    camera.position.set(0, 0, 500);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const project = (v) => {
      const p = v.clone().project(camera);
      return [((p.x + 1) / 2) * 200, ((1 - p.y) / 2) * 200];
    };
    const common = {
      pointer: [100, 100],
      camera,
      project,
      height: 200,
      ray: new Ray(new Vector3(0, 0, 500), new Vector3(0, 0, -1)),
    };
    const extra = [{ point: [0, 0, 0], kind: 'face centre', instanceId: 'b1' }];
    const mark = { point: [0, 0, 0], anchor: { instanceId: null, local: [0, 0, 0] } };
    expect(measureCandidates({ ...common, marks: [mark], extra }).kind).toBe('face centre');
    expect(measureCandidates({ ...common, extra })).toMatchObject({ kind: 'face centre', point: [0, 0, 0] });
  });
});

describe('reference faces (Fillet / Chamfer / Shell)', () => {
  it('matches the six kernel planes by part coordinate and normal, within 0.05 mm', () => {
    expect(matchReference(REFERENCES, 'edges', [300, 200, 18], [0, 0, 1]).label).toBe('Top (XY)');
    expect(matchReference(REFERENCES, 'edges', [300, 200, 18.04], [0, 0, 1]).label).toBe('Top (XY)');
    expect(matchReference(REFERENCES, 'edges', [300, 200, 18.2], [0, 0, 1])).toBeNull();
    expect(matchReference(REFERENCES, 'edges', [600, 100, 9], [1, 0, 0]).label).toBe('Right (YZ)');
    expect(matchReference(REFERENCES, 'faces', [0, 100, 9], [-1, 0, 0]).label).toBe('Left (YZ)');
    expect(matchReference(REFERENCES, 'edges', [300, 0, 9], [0, -1, 0]).label).toBe('Front (XZ)');
    // The kernel's "Rear (XZ)" at offset 400 selects y = -400 (no edges): no match for the rear face.
    expect(matchReference(REFERENCES, 'edges', [300, 400, 9], [0, 1, 0])).toBeNull();
    // A normal not along the plane's axis never matches.
    expect(matchReference(REFERENCES, 'edges', [300, 200, 18], [0, 0.6, 0.8])).toBeNull();
  });

  it('a top-face click picks Top (XY); a face off the six planes says so', () => {
    const w = world({ angle: 90, position: [400, 0, 0] });
    const draft = draftFor(w, 'fillet', { selected: true });
    expect(draft.placement).toMatchObject({ stage: 'shape', mode: 'reference' });
    const picked = placeClick(draft, face(w, [100, 100, 18], [0, 0, 1], TOP), w.ctx);
    expect(picked.feature.reference).toEqual({ plane: 'XY', offset: 18, expectedCount: 4 });
    expect(placementSummary(picked, w.ctx)).toBe('Picked Top (XY) in the viewport');
    const right = placeClick(draft, face(w, [600, 100, 9], [1, 0, 0], RIGHT), w.ctx);
    expect(right.feature.reference).toEqual({ plane: 'YZ', offset: 600, expectedCount: 4 });
    const mid = face(w, [300, 200, 9], [0, 0, 1], TOP);
    expect(() => placeClick(draft, mid, w.ctx)).toThrow(NO_REFERENCE);
    expect(() => placeClick(draft, { ...mid, instanceId: 'other' }, w.ctx)).toThrow('selected part');
  });
});

describe('revolve and loft', () => {
  it('revolves about the face edge nearest the click, keeps the profile on one side, and changes the axis', () => {
    const w = world();
    const placed = placeClick(draftFor(w, 'revolve'), face(w, [300, 30, 18], [0, 0, 1], TOP), w.ctx);
    // Nearest edge: the front edge y = 0, along X.
    expect(placed.feature.axis.map(Math.abs)).toEqual([1, 0, 0]);
    expect(placed.feature.origin[1]).toBe(0);
    expect(placed.feature.origin[2]).toBe(18);
    // The click is 30 mm from the axis: the 40 mm profile starts on the axis, not across it.
    const profile = placed.sketches[0].profile;
    expect(profile).toMatchObject({ type: 'rectangle', width: 10, height: 40 });
    expect(profile.origin[1]).toBe(-20);
    const close5 = placeClick(draftFor(w, 'revolve'), face(w, [300, 5, 18], [0, 0, 1], TOP), w.ctx);
    expect(close5.sketches[0].profile.origin[1]).toBe(-5);
    const view = placementView(placed, w.ctx);
    expect(view.extras[0].kind).toBe('axis');
    expect(view.handles.map((h) => h.id)).toEqual(['slide', 'corner']);
    // Change axis: an edge off the profile plane is refused; the left edge is taken.
    const picking = startAxisPick(placed);
    expect(placementView(picking, w.ctx).pick).toBe('edge');
    expect(() => placeClick(picking, { kind: 'edge', a: [0, 0, 0], b: [600, 0, 0] }, w.ctx)).toThrow(
      'Edge must lie in the profile plane',
    );
    const turned = placeClick(picking, { kind: 'edge', a: [0, 0, 18], b: [0, 400, 18] }, w.ctx);
    expect(turned.placement.stage).toBe('shape');
    expect(turned.feature.axis.map(Math.abs)).toEqual([0, 1, 0]);
    expect(turned.feature.origin).toEqual([0, 0, 18]);
    expect(stepBack(picking, w.ctx).placement.stage).toBe('shape');
  });

  it('two face clicks make two sections in click order; Enter finishes; Esc drops the last', () => {
    const w = world();
    const front = [
      [0, 0, 0],
      [600, 0, 0],
      [600, 0, 18],
      [0, 0, 18],
    ];
    let draft = placeClick(draftFor(w, 'loft'), face(w, [150, 200, 18], [0, 0, 1], TOP), w.ctx);
    expect(draft.feature).toBeNull();
    expect(() => finishPlacement(draft)).toThrow('at least two faces');
    draft = placeClick(draft, face(w, [450, 0, 9], [0, -1, 0], front), w.ctx);
    expect(draft.feature).toMatchObject({
      type: 'loft',
      sketchId: draft.sketches[0].id,
      sections: [draft.sketches[1].id],
    });
    expect(draft.sketches.map((s) => [s.plane, s.origin])).toEqual([
      ['XY', [150, 200, 18]],
      ['XZ', [450, 0, 9]],
    ]);
    expect(finishPlacement(draft).placement.stage).toBe('shape');
    expect(stepBack(draft, w.ctx).placement.sections).toHaveLength(1);
    const grown = applyPlacementDrag(finishPlacement(draft), { id: 'loft-radius', value: { radius: 30 } }, w.ctx);
    expect(grown.sketches.find((s) => s.id === grown.feature.sections[0]).profile.radius).toBe(30);
  });
});

describe('mirror and trim', () => {
  it('mirror takes a face square to a part axis; trim starts half-way in and keeps the centre side', () => {
    const w = world();
    const mirror = placeClick(
      draftFor(w, 'mirror', { selected: true }),
      face(w, [600, 200, 9], [1, 0, 0], RIGHT),
      w.ctx,
    );
    expect(mirror.feature).toMatchObject({ plane: 'YZ', origin: [600, 200, 9] });
    const slanted = { ...face(w, [600, 200, 9], [1, 0, 0], RIGHT), normal: [0.8, 0.6, 0] };
    expect(() => placeClick(draftFor(w, 'mirror', { selected: true }), slanted, w.ctx)).toThrow(
      'Mirror needs a face square to X, Y or Z',
    );
    const trim = placeClick(draftFor(w, 'trim', { selected: true }), face(w, [600, 200, 9], [1, 0, 0], RIGHT), w.ctx);
    expect(trim.feature).toMatchObject({ origin: [300, 200, 9], normal: [1, 0, 0], side: 'negative' });
    const moved = applyPlacementDrag(trim, { id: 'plane', value: -100 }, w.ctx);
    expect(moved.feature.origin).toEqual([500, 200, 9]);
    const outside = applyPlacementDrag(trim, { id: 'plane', value: 50 }, w.ctx);
    expect(placementView(outside, w.ctx).hint).toContain('The plane misses the part');
  });
});

describe('boolean tool pose', () => {
  it('converts a world move and turn of the tool into the target part’s coordinates', () => {
    // Target turned 90° about Z: world +X is part -Y.
    const host = [{ axis: [0, 0, 1], angle: 90, origin: [0, 0, 0] }, { translation: [100, 0, 0] }];
    expect(toolPoseAfterMove({ position: [10, 20, 0], rotation: [0, 0, 0] }, [5, 0, 0], host)).toEqual({
      position: [10, 15, 0],
      rotation: [0, 0, 0],
    });
    // A world 90° turn about Z through the tool's world centre.
    const pose = { position: [10, 0, 0], rotation: [0, 0, 0] };
    const centre = mapPlacement([10, 0, 0], host);
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2).toArray();
    const turned = toolPoseAfterTurn(pose, turn, centre, host);
    expect(turned.rotation).toEqual([0, 0, 90]);
    close(turned.position, [10, 0, 0]);
    // About a world point off the tool: the position swings around it.
    const swung = toolPoseAfterTurn(pose, turn, mapPlacement([0, 0, 0], host), host);
    close(swung.position, [0, 10, 0]);
  });

  it('starts the tool at the target centre and exposes the gizmo in the view', () => {
    const w = world();
    const tube = { id: 'tube', name: 'Tube', features: [] };
    const model = { ...w.model, parts: [...w.model.parts, tube] };
    const ctx = {
      ...w.ctx,
      model,
      snapshot: {
        ...w.snapshot,
        parts: [
          ...w.snapshot.parts,
          {
            id: 'tube',
            bounds: [
              [-20, -20, 0],
              [20, 20, 700],
            ],
          },
        ],
      },
    };
    const draft = createOperationDraft({
      type: 'subtract',
      model,
      partId: 'board',
      bounds: BOARD,
      placement: startPlacement({ type: 'subtract', hostInstanceId: 'b1' }),
    });
    expect(draft.feature.position).toEqual([300, 200, 9]);
    const view = placementView(draft, ctx);
    expect(view.toolGizmo).toMatchObject({ partId: 'tube', position: [300, 200, 9], hostInstanceId: 'b1' });
    expect(view.cut).toBe(true);
    const moved = applyPlacementDrag(
      draft,
      { id: 'tool', value: { position: [310, 200, 9], rotation: [0, 0, 0] } },
      ctx,
    );
    expect(moved.feature.position).toEqual([310, 200, 9]);
  });
});

describe('pattern step and the sketch flow', () => {
  it('drags the pattern spacing along the step direction', () => {
    const w = world();
    const draft = draftFor(w, 'pattern', { selected: true });
    const arrow = placementView(draft, w.ctx).handles.find((h) => h.id === 'step');
    expect(arrow.value).toBe(610);
    close(arrow.direction, [1, 0, 0]);
    expect(applyPlacementDrag(draft, { id: 'step', value: 700 }, w.ctx).feature.step).toEqual([700, 0, 0]);
  });

  it('turns a face sketch’s extrude into a cut of its support part when dragged inward', () => {
    const w = world();
    const sketch = {
      id: 'sk',
      name: 'Sketch 1',
      plane: 'XY',
      origin: [0, 0, 18],
      profile: { type: 'circle', radius: 10, center: [50, 50] },
      support: { type: 'face', instanceId: 'b1', partId: 'board' },
    };
    const model = { ...w.model, sketches: [sketch] };
    const ctx = { ...w.ctx, model };
    const draft = {
      baseModel: model,
      sketchFlow: {
        sketchId: 'sk',
        mode: 'extrude',
        target: 'new',
        distance: 18,
        reverse: false,
        inferOperation: true,
      },
      placement: { tool: 'sketch', stage: 'shape', mode: 'sketch' },
      sketches: [],
    };
    const view = placementView(draft, ctx);
    expect(view.inference).toMatchObject({ active: true, supportId: 'b1', depth: 18 });
    const arrow = view.handles[0];
    close(arrow.origin, [50, 50, 18]);
    const cut = sketchFlowDistance(draft, -8, ctx);
    expect(cut).toMatchObject({
      mode: 'cut',
      target: 'b1',
      baseTarget: 'new',
      distance: 8,
      reverse: true,
      throughAll: false,
    });
    const out = sketchFlowDistance({ ...draft, sketchFlow: cut }, 12, ctx);
    expect(out).toMatchObject({ mode: 'extrude', target: 'new', distance: 12, reverse: false });
    const manual = sketchFlowDistance(
      { ...draft, sketchFlow: { ...draft.sketchFlow, inferOperation: false } },
      -8,
      ctx,
    );
    expect(manual).toMatchObject({ mode: 'extrude', reverse: true });
  });
});

describe('ghost segments', () => {
  it('draws a prism ghost at both ends with the drag value, and the frame for a new part', () => {
    const frame = placeFrame([0, 0, 0], [0, 0, 1]);
    const loop = [
      [-5, -5],
      [5, -5],
      [5, 5],
      [-5, 5],
    ];
    const segments = ghostSegments({ kind: 'prism', frame, loops: [loop], value: 10 });
    // Four base edges, four top edges, four connectors.
    expect(segments).toHaveLength(12);
    expect(segments.some(([a]) => a[2] === 10)).toBe(true);
    expect(frameToInstance(placeFrame([5, 6, 0], [0, 0, 1]))).toEqual({ position: [5, 6, 0], rotation: [0, 0, 0] });
  });
});
