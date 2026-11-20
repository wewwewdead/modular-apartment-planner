// Hands on the sheet HO-1 (docs/sketch-studio-brake-hands-on.md §5.6, unit):
// the turn rule of §5.3 over a flip, a turn to the opposite edge, a turn with
// none (`turned`), a new edge at 90°, a new L and a new angle; the shared
// session patch against the three rules it replaces (§5.4); the chips' words;
// a drag's progress (the dead zone, either direction, the 90° threshold);
// where the hands go on a flat blank, a part with a flange standing at the
// front, the kiosk face frame and a 100 × 60 tab; the outcomes the grip shows
// agreeing with the collision card; and what the pair costs on the kiosk.
import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { emptyModel, normalizeModel } from './model.js';
import { poseFold, sheetMetalFeature, transformPoint } from './sheetMetal.js';
import { brakeFrame, flatFrame, machineFrom } from './pressBrake.js';
import { brakePatch, brakeSessionDefaults, brakeStation, turnAround } from './brakeStation.js';
import { sheetMetalKiosk } from './shopExamples.js';
import {
  BACK_SAME,
  COMMIT_DEGREES,
  backDirection,
  brakeActPatch,
  brakeHandOutcomes,
  brakeHint,
  brakeKeyAct,
  brakeOutcome,
  defaultGripAxis,
  dragChip,
  edgeSegments,
  fingerL,
  fingerOffer,
  fingerReadout,
  fingerRestore,
  freeRect,
  gripAnchor,
  gripChip,
  gripDrag,
  HAND_ORDER,
  axisTravel,
  hitVerdict,
  inRects,
  legsText,
  nearestAxis,
  nearestEdge,
  outcomeLine,
  pickInOrder,
  reachChip,
  reachRect,
  placementGap,
  polylineDistance,
  rebaseMatrix,
  relativeTurn,
  slideAnchor,
  turnChanged,
  typedL,
} from './brakeHands.js';

const rect = (width, height) => ({ type: 'rectangle', width, height, origin: [0, 0] });
const sheet = (bends = []) => ({
  id: 'sm',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: 1.5,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends: bends.map((bend, i) => ({ id: `b${i + 1}`, angle: 90, direction: 'up', radius: null, ...bend })),
});
// SPCC t 1.5, a W × H blank, automatic tooling, the 50 t × 2 m press.
const modelOf = (width, height = 100, bends = []) => ({
  ...emptyModel(),
  sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile: rect(width, height), primitives: [], constrained: false }],
  parts: [{ id: 'p', name: 'Step', material: 'SPCC cold-rolled steel', features: [sheet(bends)] }],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
});
// Edges of a rectangle blank: 1 the bottom (y 0, the front on a flat blank), 2 the right end, 3 the top, 4 the left end.
const BOTTOM = 0,
  RIGHT = 1,
  LEFT = 3;
const session = (patch = {}) => ({ ...brakeSessionDefaults(), stage: 'setup', key: 'k', instanceId: 'i', ...patch });
const stationOf = (model, patch) => brakeStation({ model, session: session(patch), advise: false });

// A view's rest pose as the shop layer poses it (shopLayer.js framePose,
// poseStation): the posed part, its machine frame, the side up and the edge
// to the backgauge.
function restPose(view) {
  const members = view.bendIds?.length ? view.bendIds : view.bendId ? [view.bendId] : [];
  const side = { gaugePoint: view.gaugePoint || null, turned: Boolean(view.turned) };
  const posed = poseFold(view.fold, view.angles || {}, members.length ? machineFrom(view.fold, members, side) : {});
  const frame = view.bendId
    ? brakeFrame(posed, view.bendId, { die: view.die, ...side, members, bed: 2000 })
    : flatFrame(posed, { flipped: Boolean(view.flipped) });
  const bend = view.bendId ? posed.bends.find((b) => b.id === view.bendId) : null;
  const flipped = bend ? bend.direction === 'down' : Boolean(view.flipped);
  return { posed, frame, flipped, back: backDirection(bend, frame.back, flipped), scrub: Boolean(view.scrub) };
}
// Every outline corner of the posed part, both faces, in the machine frame.
const machineCorners = ({ posed, frame }) =>
  posed.pieces.flatMap((piece) =>
    piece.outer.flatMap(([x, y]) =>
      [0, posed.thickness].map((z) => transformPoint(frame.matrix, transformPoint(piece.matrix, [x, y, z]))),
    ),
  );
const poseOf = (model, patch) => restPose(stationOf(model, patch).view);

describe('the turn rule (§5.3)', () => {
  const model = modelOf(300);
  const gauged = { edge: RIGHT, distance: 200 };
  it('turns the sheet for a flip: the side up changes', () => {
    expect(turnChanged(poseOf(model, gauged), poseOf(model, { ...gauged, flip: true }))).toBe(true);
    // A flat blank too (flatFrame turns it over about the bed's axis).
    expect(turnChanged(poseOf(model, {}), poseOf(model, { flip: true }))).toBe(true);
  });
  it('turns it for Turn sheet around to the opposite edge: the other side of the line goes back', () => {
    const now = stationOf(model, gauged);
    const patch = turnAround(now, session(gauged));
    expect(patch).toEqual({ edge: LEFT, distance: 100, turned: false });
    const before = restPose(now.view),
      after = poseOf(model, brakePatch(session(gauged), patch));
    expect(before.flipped).toBe(after.flipped);
    expect(before.back[0] * after.back[0] + before.back[1] * after.back[1]).toBeCloseTo(-1, 9);
    expect(turnChanged(before, after)).toBe(true);
  });
  it('turns it for Turn sheet around with no opposite edge (`turned`, a two-point line)', () => {
    const points = {
      mode: 'points',
      points: [
        [100, 0],
        [100, 100],
      ],
    };
    const turnedPatch = turnAround(stationOf(model, points), session(points));
    expect(turnedPatch).toEqual({ turned: true });
    expect(turnChanged(poseOf(model, points), poseOf(model, { ...points, ...turnedPatch }))).toBe(true);
  });
  it('turns it for a newly picked edge at 90°, and from the flat blank to an edge not already at the back', () => {
    expect(turnChanged(poseOf(model, gauged), poseOf(model, { edge: BOTTOM, distance: 40 }))).toBe(true);
    expect(turnChanged(poseOf(model, {}), poseOf(model, gauged))).toBe(true);
    // The top edge already faces the backgauge on the flat blank: it stays.
    expect(turnChanged(poseOf(model, {}), poseOf(model, { edge: 2, distance: 40 }))).toBe(false);
  });
  it('never turns it for a new L, a new angle, the tooling or the bend shape', () => {
    const before = poseOf(model, gauged);
    for (const patch of [{ distance: 150 }, { angle: 45 }, { die: 'v12-88' }, { shape: 'round', radius: 20 }])
      expect(turnChanged(before, poseOf(model, { ...gauged, ...patch }))).toBe(false);
  });
  it('keeps to the side up for a made step shown (a scrub) and on the replay', () => {
    const a = poseOf(model, gauged),
      b = poseOf(model, { edge: BOTTOM, distance: 40 });
    expect(turnChanged({ ...a, scrub: true }, b)).toBe(false);
    expect(turnChanged(a, { ...b, film: true })).toBe(false);
    expect(turnChanged({ ...a, film: true }, { ...a, flipped: !a.flipped, film: true })).toBe(true);
    expect(BACK_SAME).toBeCloseTo(Math.cos((2 * Math.PI) / 180), 12);
  });
  it('reads the back direction off the frame: −n on the fixed side, +n on the moving side; +Y on a flat blank', () => {
    const bend = { n: [1, 0] };
    expect(backDirection(bend, 'moving')).toEqual([1, 0]);
    expect(backDirection(bend, 'fixed')).toEqual([-1, -0]);
    expect(backDirection(null, null, false)).toEqual([0, 1]);
    expect(backDirection(null, null, true)).toEqual([0, -1]);
  });
});

describe('the shared session patch (§5.4)', () => {
  // The three rules it replaces, as they stood before HO-1; since TL-2
  // (docs/sketch-studio-brake-tool-length.md §9.4) a new line keeps the trims.
  const oldChangeBrake = (s, patch) => {
    const newLine = ['edge', 'distance', 'points', 'mode'].some((k) => k in patch) && !('skip' in patch);
    return { ...s, ...(newLine ? { skip: [], turned: false } : {}), ...patch };
  };
  const oldTrial = (s, patch) => ({
    ...s,
    ...('edge' in patch ? { skip: [] } : {}),
    ...patch,
  });
  const busy = session({ edge: RIGHT, distance: 200, skip: [1], turned: true, punchTrim: 5, dieTrim: 3, flip: true });
  it('is the workspace rule for every pick', () => {
    for (const patch of [
      { edge: LEFT },
      { distance: 120 },
      {
        points: [
          [0, 0],
          [1, 1],
        ],
      },
      { mode: 'points' },
      { skip: [0, 2] },
      { edge: RIGHT, skip: [1] },
      { angle: 45 },
      { flip: false, scrub: null },
      { turned: false },
      { punchTrim: 10 },
    ])
      expect(brakePatch(busy, patch)).toEqual(oldChangeBrake(busy, patch));
  });
  it('is the collision card trial for both kinds of Turn sheet around', () => {
    for (const patch of [{ edge: LEFT, distance: 100, turned: false }, { turned: false }, { turned: true }])
      expect(brakePatch(busy, patch)).toEqual(oldTrial(busy, patch));
  });
  it("makes the grip's acts exactly as the panel's controls do", () => {
    const station = stationOf(modelOf(300), { edge: RIGHT, distance: 200 });
    const now = session({ edge: RIGHT, distance: 200 });
    expect(brakeActPatch('flip', station, now)).toEqual({ flip: true, scrub: null });
    expect(brakeActPatch('turn', station, now)).toEqual({ ...turnAround(station, now), scrub: null });
    // No line: nothing to turn around.
    expect(brakeActPatch('turn', stationOf(modelOf(300), {}), session())).toBe(null);
  });
});

describe('what the acts would leave (§5.4)', () => {
  // The BT-2 channel: a U channel with the gooseneck reversed collides one way round only.
  const channel = modelOf(115, 60, [{ a: [45, -1], b: [45, 61], punch: 'straight-88' }]);
  const reversed = session({ edge: RIGHT, distance: 20, punch: 'gooseneck-88', reverse: true });
  it("agrees with the collision card's Turn the sheet around wherever both exist", () => {
    const advised = brakeStation({ model: channel, session: reversed });
    expect(advised.pending.collision.turn).toBeDefined();
    const outcomes = brakeHandOutcomes({ model: channel, session: reversed, params: {}, station: advised });
    expect(outcomes.turn).toMatchObject({ hit: true, ok: true, fact: null });
    // The same line gauged from the left end, as the card's button sets it.
    expect(outcomes.turn.view.gaugePoint[0]).toBeCloseTo(0, 9);
    // Flipped over, the same punch collides: the fact without its remedy.
    expect(outcomes.flip.hit).toBe(true);
    // The straight punch: turned around it still meets the flange, so no button and no "clears".
    const straight = session({ edge: RIGHT, distance: 20 });
    const card = brakeStation({ model: channel, session: straight });
    expect(card.pending.collision.turn).toBeUndefined();
    const plain = brakeHandOutcomes({ model: channel, session: straight, params: {}, station: card });
    expect(plain.turn.ok).toBe(false);
    expect(plain.turn.fact).toMatch(/^the part hits the punch at [\d.]+°\.$/);
    expect(outcomeLine('turn', plain.turn)).toMatch(/^Turned around: the part hits the punch at [\d.]+°$/);
  });
  it('has no turn without a line, and a flip with no hit pending says nothing more', () => {
    const flat = stationOf(modelOf(300), {});
    const outcomes = brakeHandOutcomes({ model: modelOf(300), session: session(), params: {}, station: flat });
    expect(outcomes.turn).toBe(null);
    expect(outcomes.flip).toMatchObject({ hit: false, ok: false, fact: null });
    expect(outcomes.flip.view.flipped).toBe(true);
    expect(outcomeLine('flip', outcomes.flip)).toBe(null);
  });
  it('words a refusal as the blade picker does, and an error as itself', () => {
    expect(hitVerdict({ error: null, refusals: [], collision: null })).toEqual({ ok: true, text: 'Clears this hit' });
    expect(
      hitVerdict({
        refusals: [{ message: 'This hit: the flange is 5 mm from the punch line. Cut the blank larger.' }],
        collision: null,
      }),
    ).toEqual({ ok: false, text: 'the flange is 5 mm from the punch line.' });
    expect(
      hitVerdict({ refusals: [], collision: { message: 'Bend 2: the part hits the die at 62°. Bend it earlier.' } }),
    ).toEqual({ ok: false, text: 'the part hits the die at 62°.' });
    expect(brakeOutcome({ error: 'no fold' })).toBe(null);
    expect(brakeOutcome({ view: {}, pending: { error: 'The punch line misses the blank.' } })).toMatchObject({
      hit: true,
      ok: false,
      fact: 'The punch line misses the blank.',
    });
  });
});

describe('the words on the sheet (§4.3, §5.2, §5.5)', () => {
  it('names each handle with its key and what it would leave', () => {
    expect(gripChip('flip', null)).toEqual({ title: 'Flip sheet · F', outcome: null });
    expect(gripChip('turn', { hit: true, ok: true })).toEqual({
      title: 'Turn sheet around · T',
      outcome: 'Turned around it clears',
    });
    expect(outcomeLine('flip', { hit: true, ok: true })).toBe('Flipped over it clears');
    expect(outcomeLine('flip', { hit: true, ok: false, fact: 'The part hits the die at 62°.' })).toBe(
      'Flipped over: the part hits the die at 62°',
    );
    expect(outcomeLine('turn', { hit: true, ok: false, fact: 'V10 die too small.' })).toBe(
      'Turned around: V10 die too small',
    );
  });
  it('reads a drag as Rotate part reads its rings, and the hint line by the line picked', () => {
    expect(dragChip('flip', 120)).toBe('Flip sheet · 120° · release to flip');
    expect(dragChip('flip', -45)).toBe('Flip sheet · 45° · release to leave it');
    expect(dragChip('turn', 90)).toBe('Turn sheet around · 90° · release to turn it around');
    // HO-2 (§6.1): with no line the edge is clicked on the sheet; two points stay on the flat blank.
    expect(brakeHint(false)).toBe('Click an edge of the sheet: it goes to the backgauge · F flips the sheet');
    expect(brakeHint(false, 'points')).toBe('Click two points on the flat blank · F flips the sheet');
    expect(brakeHint(true)).toBe(
      'Drag a ring on the sheet to flip or turn it · F flip · T turn around · Enter bends · Esc clears the line',
    );
    // No em dashes and none of the words the brief keeps off the screen.
    const words = [
      dragChip('flip', 120),
      dragChip('turn', 10),
      brakeHint(true),
      brakeHint(false),
      brakeHint(false, 'points'),
    ].join(' ');
    expect(words).not.toMatch(/—|heading|alternate|trial|gizmo/);
  });
});

describe('a drag on a handle (§5.2)', () => {
  it('is a press inside the dead zone, then progress either way round, committing at 90°', () => {
    expect(gripDrag({ travel: 3, degrees: 120 })).toEqual({ dragging: false, swept: 0, progress: 0, commit: false });
    expect(gripDrag({ travel: 4, degrees: 120 }).dragging).toBe(false);
    expect(gripDrag({ travel: 5, degrees: 45 })).toEqual({ dragging: true, swept: 45, progress: 0.25, commit: false });
    expect(gripDrag({ travel: 5, degrees: -45 })).toEqual(gripDrag({ travel: 5, degrees: 45 }));
    expect(gripDrag({ travel: 9, degrees: 89.9 }).commit).toBe(false);
    expect(gripDrag({ travel: 9, degrees: COMMIT_DEGREES }).commit).toBe(true);
    expect(gripDrag({ travel: 9, degrees: -90 }).commit).toBe(true);
    expect(gripDrag({ travel: 9, degrees: 270 })).toMatchObject({ progress: 1, commit: true });
  });
  it('picks a handle within 12 px of its arc, the nearest first', () => {
    const arc = [
      [0, 0],
      [10, 0],
      [20, 0],
    ];
    expect(polylineDistance(arc, [5, 5])).toBeCloseTo(5, 9);
    expect(polylineDistance(arc, [25, 0])).toBeCloseTo(5, 9);
    expect(polylineDistance([], [0, 0])).toBe(Infinity);
  });
  it('takes its axis and colour from the turn between the two placements', () => {
    const now = new Matrix4();
    const flip = new Matrix4().makeRotationY(Math.PI).setPosition(10, 0, 3);
    const t = relativeTurn(now.toArray(), flip.toArray());
    expect(t.degrees).toBeCloseTo(180, 6);
    expect(nearestAxis(t.axis)).toBe('Y');
    const around = new Matrix4().makeRotationZ(Math.PI);
    expect(nearestAxis(relativeTurn(now.toArray(), around.toArray()).axis)).toBe('Z');
    expect(relativeTurn(now.toArray(), now.toArray())).toEqual({ axis: null, degrees: 0 });
    expect(defaultGripAxis('flip', true)).toEqual([0, 1, 0]);
    expect(defaultGripAxis('flip', false)).toEqual([1, 0, 0]);
    expect(defaultGripAxis('turn', true)).toEqual([0, 0, 1]);
  });
  it('carries a sheet rooted on another piece onto the same place (the rigid-body rule)', () => {
    // Two pieces; the second fold is rooted on the other one: every piece matrix differs by one rigid R.
    const P = [new Matrix4(), new Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 50, 0)];
    const R = new Matrix4().makeRotationZ(0.7).setPosition(5, -3, 2);
    const piece = (m, i) => ({
      id: `piece-${i + 1}`,
      area: i ? 100 : 400,
      centroid: i ? [10, 60] : [10, 20],
      outer: [
        [0, 0],
        [20, 0],
        [20, 40],
      ],
      matrix: m.toArray(),
    });
    const from = P.map(piece),
      to = P.map((m, i) => piece(R.clone().multiply(m), i));
    const G = new Matrix4().makeRotationY(1.1).setPosition(100, 0, 1000);
    const G2 = rebaseMatrix({ matrix: G, pieces: from }, { pieces: to });
    // Each piece where it was drawn: G·P = G2·(R·P).
    for (let i = 0; i < 2; i++) {
      const drawn = G.clone().multiply(P[i]),
        again = G2.clone().multiply(R.clone().multiply(P[i]));
      expect(placementGap(drawn, again, [{ ...from[i], matrix: new Matrix4().toArray() }]).mm).toBeLessThan(1e-9);
    }
    expect(rebaseMatrix({ matrix: G, pieces: from }, { pieces: [{ ...to[0], centroid: [999, 999] }] })).toBe(null);
  });
});

describe('where the hands go (§5.2)', () => {
  const anchorOf = (pose) => {
    const points = machineCorners(pose);
    const anchor = gripAnchor(points);
    const minY = Math.min(...points.map((p) => p[1]));
    return { anchor, points, minY };
  };
  // On the part: front corners at its height run either side of it.
  const onThePart = ({ anchor, points }) => {
    const depth = Math.max(...points.map((p) => p[1])) - anchor.y;
    const near = anchor.y + Math.max(0.5, depth * 0.02);
    const front = points.filter((p) => p[1] <= near + 1e-9);
    expect(front.some((p) => Math.abs(p[2] - anchor.z) < 1e-9)).toBe(true);
    expect(Math.min(...front.map((p) => p[0]))).toBeLessThanOrEqual(anchor.point[0] + 1e-9);
    expect(Math.max(...front.map((p) => p[0]))).toBeGreaterThanOrEqual(anchor.point[0] - 1e-9);
  };
  it('stands at the middle of a flat blank’s front edge, on its top face', () => {
    const found = anchorOf(poseOf(modelOf(300), {}));
    expect(found.anchor.y).toBeCloseTo(found.minY, 9);
    expect(found.anchor.point[0]).toBeCloseTo(0, 9);
    expect(found.anchor.z).toBeCloseTo(1.5, 9);
    expect(found.anchor.edge[1] - found.anchor.edge[0]).toBeCloseTo(300, 6);
    onThePart(found);
  });
  it('stands on top of a flange standing at the front', () => {
    // A 20 mm flange made at x 280, shown in the die with the long side to the back: it rises toward
    // the operator (both wings stand at half the angle in the die), its tip the front of the part.
    const model = modelOf(300, 100, [{ a: [280, -1], b: [280, 101] }]);
    const view = stationOf(model, { lastHit: { bendId: 'b1', gaugePoint: [0, 50], punch: 'straight-88' } }).view;
    const found = anchorOf(restPose(view));
    expect(found.anchor.z).toBeGreaterThan(10);
    expect(found.anchor.y).toBeCloseTo(found.minY, 9);
    onThePart(found);
  });
  it('stands on the kiosk face frame, and on a 100 × 60 tab', () => {
    const kiosk = normalizeModel(sheetMetalKiosk());
    const part = kiosk.parts.find((p) => p.id === 'shop-kiosk-face');
    expect(sheetMetalFeature(part).bends.length).toBeGreaterThan(3);
    const face = brakeStation({
      model: kiosk,
      session: session({ instanceId: 'shop-kiosk-front' }),
      advise: false,
    });
    const found = anchorOf(restPose(face.view));
    expect(found.anchor.y).toBeCloseTo(found.minY, 9);
    onThePart(found);
    for (const patch of [{}, { edge: RIGHT, distance: 30 }]) {
      const tab = anchorOf(poseOf(modelOf(100, 60), patch));
      expect(tab.anchor.y).toBeCloseTo(tab.minY, 9);
      onThePart(tab);
    }
  });
  it('slides along the front edge to stay in the free part of the view, clear of the cards', () => {
    const rect = freeRect({
      width: 1000,
      height: 600,
      cards: [{ left: 12, top: 12, right: 332, bottom: 500 }],
      cube: { left: 880, top: 15, right: 980, bottom: 75 },
      hint: { left: 14, top: 570, right: 986, bottom: 590 },
    });
    expect(rect).toEqual({ left: 340, top: 83, right: 992, bottom: 562 });
    const spots = [
      { x: 0, screen: [300, 300] },
      { x: 30, screen: [360, 300] },
    ];
    expect(slideAnchor(spots, rect).x).toBe(30);
    expect(slideAnchor([spots[0]], rect).x).toBe(0);
    expect(slideAnchor([], rect)).toBe(null);
  });
});

describe('F and T (§5.5)', () => {
  const press = (key, extra = {}) => ({ key, code: `Key${key.toUpperCase()}`, repeat: false, ...extra });
  const state = { setup: true, lined: true, editable: false };
  it('flips with F and turns around with T, in setup, never while typing or with a modifier or on repeat', () => {
    expect(brakeKeyAct(press('f'), state)).toBe('flip');
    expect(brakeKeyAct(press('F'), state)).toBe('flip');
    expect(brakeKeyAct(press('t'), state)).toBe('turn');
    expect(brakeKeyAct(press('t'), { ...state, lined: false })).toBe(null);
    expect(brakeKeyAct(press('f'), { ...state, setup: false })).toBe(null);
    expect(brakeKeyAct(press('f'), { ...state, editable: true })).toBe(null);
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'repeat', 'defaultPrevented'])
      expect(brakeKeyAct(press('f', { [modifier]: true }), state)).toBe(null);
    expect(brakeKeyAct(press('g'), state)).toBe(null);
  });
});

describe('the cost of knowing before acting (§5.4)', () => {
  it('measures the pair on the kiosk face frame (its crease about to be made): one outcome costs about one station', () => {
    const kiosk = normalizeModel(sheetMetalKiosk());
    const part = kiosk.parts.find((p) => p.id === 'shop-kiosk-face');
    const feature = sheetMetalFeature(part);
    const crease = feature.bends.at(-1);
    expect(crease.direction).toBe('down');
    // The face frame with every hit but the crease made, the crease on the brake as two points.
    const model = {
      ...kiosk,
      finishes: [],
      prints: [],
      parts: kiosk.parts.map((p) =>
        p === part
          ? { ...p, features: p.features.map((f) => (f === feature ? { ...f, bends: f.bends.slice(0, -1) } : f)) }
          : p,
      ),
    };
    const now = session({
      instanceId: 'shop-kiosk-front',
      mode: 'points',
      points: [crease.a.map(Number), crease.b.map(Number)],
      angle: Number(crease.angle),
      flip: true,
    });
    const station = brakeStation({ model, session: now, advise: false });
    expect(station.pending && !station.pending.error).toBe(true);
    const timed = (work, runs = 5) => {
      work();
      const start = performance.now();
      let result;
      for (let i = 0; i < runs; i++) result = work();
      return { result, ms: (performance.now() - start) / runs };
    };
    const facts = timed(() => brakeStation({ model, session: now, advise: false }));
    const pair = timed(() => brakeHandOutcomes({ model, session: now, params: {}, station }));
    const flip = timed(() => brakeHandOutcomes({ model, session: now, params: {}, station, kinds: ['flip'] }));
    const turn = timed(() => brakeHandOutcomes({ model, session: now, params: {}, station, kinds: ['turn'] }));
    console.warn(
      `hands on the sheet, kiosk face frame (crease pending): facts ${facts.ms.toFixed(1)} ms, both outcomes ${pair.ms.toFixed(1)} ms (flip ${flip.ms.toFixed(1)}, turn ${turn.ms.toFixed(1)})`,
    );
    expect(pair.result.flip.hit && pair.result.turn.hit).toBe(true);
    expect(Object.keys(flip.result)).toEqual(['flip']);
    // The workspace's rule (CadWorkspace.jsx handsLazy) estimates the pair as two stations like the facts.
    expect(pair.ms).toBeLessThan(4 * facts.ms + 20);
    expect(2 * facts.ms).toBeGreaterThan(pair.ms / 4);
    // Some 30 stations of the heaviest part: over the default 5 s when the whole suite loads the machine.
  }, 30000);
});

// ---------------------------------------------------------------- HO-2: set the hit on the sheet (§6.4, unit)
describe('an edge on the sheet (§6.1)', () => {
  const length = ([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  it('carries a flat blank’s edge onto the sheet as one segment, through the frame it is posed in', () => {
    const station = stationOf(modelOf(300), {});
    const segments = edgeSegments(station.fold, station.edges[RIGHT]);
    expect(segments).toHaveLength(1);
    const [[p, q]] = segments;
    // Along the edge at mid thickness (t 1.5): either face reads, the thin end face between.
    [
      [p, [300, 0, 0.75]],
      [q, [300, 100, 0.75]],
    ].forEach(([got, want]) => got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 6)));
    const frame = new Matrix4().makeTranslation(10, 20, 30).toArray();
    edgeSegments(station.fold, station.edges[RIGHT], frame)[0][0].forEach((v, i) =>
      expect(v).toBeCloseTo([310, 20, 30.75][i], 6),
    );
  });
  it('lights an edge an earlier bend crosses in its parts, each where its piece is posed', () => {
    const station = stationOf(modelOf(300, 100, [{ a: [280, -1], b: [280, 101] }]), {});
    const bend = station.fold.bends[0];
    const segments = edgeSegments(station.fold, station.edges[BOTTOM]);
    expect(segments).toHaveLength(2);
    // The long side lies flat; the 20 mm side stands up with its flange (90°): straight up.
    const flat = segments.find(([p, q]) => Math.abs(p[2] - q[2]) < 1e-6);
    const flange = segments.find((s) => s !== flat);
    expect(flat[0][2]).toBeCloseTo(0.75, 6);
    expect(length(flat)).toBeCloseTo(280 - bend.allowance / 2, 3);
    expect(length(flange)).toBeCloseTo(20 - bend.allowance / 2, 3);
    expect(Math.abs(flange[1][2] - flange[0][2])).toBeCloseTo(length(flange), 3);
    // The edge the bend does not cross stays whole, standing with the flange.
    const end = edgeSegments(station.fold, station.edges[RIGHT]);
    expect(end).toHaveLength(1);
    expect(length(end[0])).toBeCloseTo(100, 6);
  });
  it('picks the nearest edge within 10 px of the pointer (the card’s SNAP_PX)', () => {
    const lines = [
      {
        index: 0,
        segments: [
          [
            [0, 0],
            [100, 0],
          ],
        ],
      },
      {
        index: 1,
        segments: [
          [
            [0, 8],
            [40, 8],
          ],
          [
            [60, 8],
            [100, 8],
          ],
        ],
      },
    ];
    expect(nearestEdge(lines, [50, 3])).toBe(0);
    expect(nearestEdge(lines, [70, 6])).toBe(1);
    expect(nearestEdge(lines, [70, 18])).toBe(1);
    expect(nearestEdge(lines, [70, 18.5])).toBe(null);
    expect(nearestEdge([], [0, 0])).toBe(null);
  });
});

describe('what is under the pointer (§6.3)', () => {
  it('asks in the order grip, fingers, blades, edges, and no further than it must', () => {
    expect(HAND_ORDER).toEqual(['grip', 'fingers', 'blade', 'edge']);
    let asked = [];
    const ask = (kind, found) => () => {
      asked.push(kind);
      return found;
    };
    const pickers = (found) => Object.fromEntries(HAND_ORDER.map((kind) => [kind, ask(kind, found[kind] || null)]));
    expect(pickInOrder(pickers({ blade: { blade: 'die' }, edge: { index: 2 } }))).toEqual({
      kind: 'blade',
      blade: 'die',
    });
    expect(asked).toEqual(['grip', 'fingers', 'blade']);
    asked = [];
    expect(pickInOrder(pickers({ grip: { handle: 'flip' }, fingers: { offered: true } }))).toEqual({
      kind: 'grip',
      handle: 'flip',
    });
    expect(asked).toEqual(['grip']);
    asked = [];
    expect(pickInOrder(pickers({}))).toBe(null);
    expect(asked).toEqual(HAND_ORDER);
    // A picker left out is not asked; a target may name its own kind (the machine, found by the blades' ray).
    expect(pickInOrder({ edge: () => ({ index: 0 }) })).toEqual({ kind: 'edge', index: 0 });
    expect(pickInOrder({ blade: () => ({ kind: 'machine', part: 'bed' }) })).toEqual({ kind: 'machine', part: 'bed' });
  });
  it('grows a finger’s box on the canvas to a 24 px target at least', () => {
    expect(reachRect({ left: 100, top: 50, right: 110, bottom: 90 })).toEqual({
      left: 93,
      top: 50,
      right: 117,
      bottom: 90,
    });
    expect(reachRect({ left: 0, top: 0, right: 40, bottom: 30 })).toEqual({ left: 0, top: 0, right: 40, bottom: 30 });
    const rects = [reachRect({ left: 100, top: 50, right: 110, bottom: 90 })];
    expect(inRects(rects, [94, 60])).toBe(true);
    expect(inRects(rects, [92, 60])).toBe(false);
    expect(inRects([], [0, 0])).toBe(false);
  });
});

describe('the backgauge in the hand (§6.2)', () => {
  it('steps L a millimetre at a time, a tenth with Alt, never below 0', () => {
    expect(fingerL(200, 12.6)).toBe(213);
    expect(fingerL(200, 12.6, { free: true })).toBe(212.6);
    expect(fingerL(200, -0.4)).toBe(200);
    expect(fingerL(187.3, 0.1)).toBe(187);
    expect(fingerL(5, -20)).toBe(0);
    expect(fingerL(0.3, -0.12, { free: true })).toBe(0.2);
    expect(fingerL(0.3, -1, { free: true })).toBe(0);
    // Edge on (the plane seen along its face): the pointer's travel along the axis as drawn.
    expect(axisTravel([30, 0], [2, 0])).toBeCloseTo(15, 9);
    expect(axisTravel([0, -12], [0, -3])).toBeCloseTo(4, 9);
    expect(axisTravel([5, 5], [0, 0])).toBe(0);
  });
  it('takes a typed L exactly, and Esc puts the line back as it was before the drag', () => {
    expect(typedL('150')).toBe(150);
    expect(typedL('150.25')).toBe(150.25);
    expect(typedL('0')).toBe(0);
    for (const bad of ['', '-2', '1e', 'abc', '.']) expect(typedL(bad)).toBe(null);
    const before = session({ edge: 1, distance: 200, skip: [1], turned: true, punchTrim: 5, dieTrim: -3 });
    // A drag's changes go through the card's own path: a new L resets the segments and the turn; the
    // trims stay (brake tool length §9.3, TL-2).
    const dragged = [190, 187].reduce((s, distance) => brakePatch(s, { distance, scrub: null }), before);
    expect(dragged).toMatchObject({ distance: 187, skip: [], turned: false, punchTrim: 5, dieTrim: -3 });
    expect(brakePatch(dragged, fingerRestore(before))).toEqual(before);
  });
  it('offers the fingers only where a millimetre of drag is a millimetre of L, and says why elsewhere', () => {
    const model = modelOf(300);
    const gauged = session({ edge: RIGHT, distance: 200 });
    const station = brakeStation({ model, session: gauged, advise: false });
    expect(fingerOffer(station, gauged)).toEqual({
      offered: true,
      L: 200,
      flange: legsText(station.pending.readouts, 'moving'),
      why: null,
    });
    expect(legsText(station.pending.readouts, 'moving')).toMatch(/^\d+(\.\d+)?$/);
    // No line: no fingers stand, nothing to say.
    const bare = session();
    expect(fingerOffer(brakeStation({ model, session: bare, advise: false }), bare)).toMatchObject({
      offered: false,
      why: null,
    });
    // A two-point line has no backgauge.
    const points = session({
      mode: 'points',
      points: [
        [150, -1],
        [150, 101],
      ],
    });
    expect(fingerOffer(brakeStation({ model, session: points, advise: false }), points)).toEqual({
      offered: false,
      L: null,
      flange: null,
      why: 'No backgauge on a two-point line',
    });
    // Turned around with no edge to gauge: the station's reason.
    const turned = session({ edge: RIGHT, distance: 200, turned: true });
    expect(fingerOffer(brakeStation({ model, session: turned, advise: false }), turned)).toMatchObject({
      offered: false,
      why: 'Turned around: the gauge edge faces the operator, and no straight edge opposite it can go to the backgauge.',
    });
    // An offset whose hit on the die is gauged for its other line: the fingers stand elsewhere than L.
    const offset = {
      edge: station.edge,
      gauge: { distance: 200 },
      view: { gaugeDistance: 231.4 },
      pending: { readouts: {}, offset: { hits: [{ line: 'Line B', around: false }] } },
    };
    expect(fingerOffer(offset, gauged)).toEqual({
      offered: false,
      L: 200,
      flange: null,
      why: 'Set for line B of the offset: type L in the panel',
    });
    offset.pending.offset.hits[0] = { line: 'Line A', around: true };
    expect(fingerOffer(offset, gauged).why).toBe('Gauged off the opposite edge for this hit: type L in the panel');
  });
  it('words the backgauge, an edge, the blades and the machine in shop language', () => {
    const fingers = { offered: true, L: 200, flange: '113.45', why: null };
    expect(reachChip({ kind: 'fingers' }, { fingers })).toEqual({
      title: 'Backgauge · L 200 · drag, or click to type',
      line: null,
    });
    expect(
      reachChip({ kind: 'fingers' }, { fingers: { offered: false, why: 'No backgauge on a two-point line' } }),
    ).toEqual({
      title: 'Backgauge',
      line: 'No backgauge on a two-point line',
    });
    expect(fingerReadout(187, '113.45')).toBe('L 187 mm · flange 113.45');
    expect(fingerReadout(187.3, null)).toBe('L 187.3 mm');
    const edges = [{ index: 2, length: 300 }];
    expect(reachChip({ kind: 'edge', index: 2 }, { edges, picked: null }).title).toBe(
      'Edge 3 · 300 mm · click: to the backgauge',
    );
    expect(reachChip({ kind: 'edge', index: 2 }, { edges, picked: 2 }).title).toBe(
      'Edge 3 · 300 mm · at the backgauge',
    );
    expect(reachChip({ kind: 'blade', blade: 'punch', name: 'Straight 88°' }).title).toBe(
      'Straight 88° punch · click to change',
    );
    expect(reachChip({ kind: 'blade', blade: 'die', name: 'V12 88°' }).title).toBe('V12 88° die · click to change');
    for (const [part, name] of [
      ['holder', 'Punch holder'],
      ['ram', 'Ram'],
      ['bed', 'Bed'],
      ['beam', 'Backgauge beam'],
      ['frame', 'Side frame'],
    ])
      expect(reachChip({ kind: 'machine', part })).toEqual({ title: name, line: null });
    expect(reachChip(null)).toBe(null);
    const words = [
      reachChip({ kind: 'fingers' }, { fingers }).title,
      reachChip({ kind: 'edge', index: 2 }, { edges }).title,
      fingerReadout(187, '113.45'),
    ].join(' ');
    expect(words).not.toMatch(/—|heading|alternate|trial|gizmo/);
  });
});
