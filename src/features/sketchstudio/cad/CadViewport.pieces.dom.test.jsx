// @vitest-environment jsdom
// Piece pick PK-2 in the viewport (docs/sketch-studio-piece-pick.md §6.1 –
// §6.4, §6.5): on the lip tray, the pieces of the line drawn on the sheet (the
// ones left flat a quieter line), a piece in reach lights and its chip says what
// a click does, a click (Ctrl, Shift or Meta: add) reaches the workspace, an
// edge nearer than any piece wins, the piece the panel names is lit with no
// chip, the hint line, the fingers behind the gauge edge, and the sheet
// sliding along the bed when other pieces are picked (X only, then the pose).
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import CadViewport from './CadViewport.jsx';
import { brakePatch, brakeSessionDefaults, brakeStation } from './brakeStation.js';
import { FIRST_LIP_EDGE, FLANGE_EDGE, lipTrayModel } from './piecePick.fixtures.js';
import { PIECE_PICK_PX, fingerOffer, pieceOffer, polylineDistance } from './brakeHands.js';

const { scenes } = vi.hoisted(() => ({ scenes: { last: null } }));
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      info = { programs: [] };
      setPixelRatio() {}
      setSize() {}
      dispose() {}
      render(scene) {
        scenes.last = scene;
      }
    },
  };
});
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { EventDispatcher, Vector3 } = await import('three');
  return {
    OrbitControls: class extends EventDispatcher {
      target = new Vector3();
      update() {}
      dispose() {}
    },
  };
});
vi.mock('three/addons/controls/TransformControls.js', async () => {
  const { EventDispatcher, Object3D } = await import('three');
  return {
    TransformControls: class extends EventDispatcher {
      getHelper() {
        return new Object3D();
      }
      setMode() {}
      setSpace() {}
      setSize() {}
      setTranslationSnap() {}
      setRotationSnap() {}
      attach() {}
      detach() {}
      dispose() {}
    },
  };
});

let frames = [],
  now = 0;
beforeEach(() => {
  scenes.last = null;
  frames = [];
  now = 1000;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 600, height: 600 }),
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const step = (ms = 16) => {
  now += ms;
  const run = frames;
  frames = [];
  run.forEach((callback) => callback(now));
};

const TRAY = lipTrayModel();
const fresh = (patch = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'brake-1',
  instanceId: 'i',
  mode: 'gauge',
  angle: 90,
  ...patch,
});
const stationOf = (s) => brakeStation({ model: TRAY, session: s, advise: false });
// The first lip's edge at L 15, as the workspace applies it.
const lipLine = (patch = {}) => ({
  ...brakePatch(fresh(), { edge: FIRST_LIP_EDGE, distance: 15 }, stationOf(fresh())),
  ...patch,
});
// The station and the grip prop as the workspace makes it (CadWorkspace.jsx brakeGrip).
const setup = (s, extra = {}) => {
  const station = stationOf(s);
  return {
    station,
    view: station.view,
    grip: {
      shown: true,
      lined: Boolean(station.edge),
      flip: null,
      turn: null,
      ms: null,
      lazy: false,
      mode: s.mode,
      edges: station.edges,
      edge: station.edge?.index ?? null,
      fingers: fingerOffer(station, s),
      pieces: station.segments.length > 1 ? pieceOffer(station.segments) : null,
      litPiece: null,
      gaugeEdge: station.edge || null,
      ...extra,
    },
  };
};
const model = {
  sketches: [],
  parts: [{ id: 'plate', name: 'Plate', material: 'Steel', features: [{ id: 'f', type: 'box' }] }],
  instances: [{ id: 'plate-1', partId: 'plate', position: [0, 0, 0], rotation: [0, 0, 0] }],
  connections: [],
};
const snapshot = {
  parts: [],
  instances: [
    {
      id: 'plate-1',
      partId: 'plate',
      bounds: [
        [0, 0, 0],
        [10, 10, 10],
      ],
      mesh: { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], triangles: [0, 1, 2] },
      edges: { lines: [0, 0, 0, 1, 0, 0] },
      placement: [{ translation: [0, 0, 0] }],
    },
  ],
};
const calls = () => ({ edge: vi.fn(), piece: vi.fn() });
const props = (now, spy, extra = {}) => ({
  model,
  snapshot,
  selectedId: null,
  ready: true,
  view: 'isometric',
  onSelect: vi.fn(),
  brakeView: now.view,
  brakeGrip: now.grip,
  onBrakeEdge: spy.edge,
  onBrakeFingers: vi.fn(),
  onBrakeFocus: vi.fn(),
  onBrakePiece: spy.piece,
  ...extra,
});
const viewport = () => document.querySelector('.cad-viewport');
const station = () => viewport().cadShop().station;
const canvas = () => document.querySelector('.cad-viewport canvas');
const chip = () => document.querySelector('.cad-grip-chip');
const hand = ([x, y]) => viewport().cadBrakeHand(x, y);
const press = (type, [x, y], extra = {}) =>
  fireEvent[type](canvas(), {
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerUp' || type === 'pointerMove' ? 0 : 1,
    pointerId: 1,
    ...extra,
  });
const hover = (at) => {
  press('pointerMove', at, { buttons: 0 });
  step();
};
const settle = () => {
  for (let i = 0; i < 30; i++) step(16);
};
// A point on piece `index`'s stretch the pick gives to that piece.
const piecePoint = (index) =>
  station()
    .reach.pieces.find((p) => p.index === index)
    .points.find((p) => hand(p)?.kind === 'piece' && hand(p).index === index);
const click = (at, extra = {}) => {
  press('pointerDown', at, extra);
  press('pointerUp', at, extra);
};

it('draws the pieces on the sheet: in the hit the punch line, left flat a quieter line; the hint names them', () => {
  const spy = calls();
  const { rerender } = render(<CadViewport {...props(setup(lipLine()), spy)} />);
  expect(station().reach.pieces.map((p) => [p.index, p.skipped])).toEqual([
    [0, false],
    [1, false],
    [2, false],
  ]);
  expect(station().reach.flatDrawn).toBe(false);
  expect(document.querySelector('.cad-viewport-hint').textContent).toContain(
    'Click a piece of the line to bend only it · Ctrl+click adds or leaves out · F flip · T turn around · Enter bends · Esc clears the line',
  );
  rerender(<CadViewport {...props(setup(lipLine({ skip: [1, 2] })), spy)} />);
  settle();
  expect(station().reach.pieces.map((p) => p.skipped)).toEqual([false, true, true]);
  // Once the slide lands the quieter line shows with the punch line: two stretches, four ends.
  expect(station().reach.flatDrawn).toBe(true);
  const flat = scenes.last.getObjectByName('press-brake-flat-pieces');
  expect(flat.visible).toBe(true);
  expect(flat.material.color.getHexString()).not.toBe('d9480f');
  expect(flat.geometry.getAttribute('position').count).toBe(4);
});

it('a piece in reach lights with its chip; a click is the card’s pick, Ctrl, Shift or Meta adds', () => {
  const spy = calls();
  render(<CadViewport {...props(setup(lipLine({ skip: [1, 2] })), spy)} />);
  settle();
  const at = piecePoint(1);
  expect(at).toBeTruthy();
  hover(at);
  expect(station().reach.lit).toEqual({ kind: 'piece', index: 1, blade: null, part: null });
  expect(station().reach.edgeLit).toBe(true);
  expect(canvas().style.cursor).toBe('pointer');
  expect(chip().textContent).toBe('Piece 2 of 3 · 522 mm · left flat · click to bend only this · Ctrl+click adds it');
  click(at);
  expect(spy.piece).toHaveBeenLastCalledWith(1, { add: false });
  for (const key of ['ctrlKey', 'shiftKey', 'metaKey']) {
    click(at, { [key]: true });
    expect(spy.piece).toHaveBeenLastCalledWith(1, { add: true });
  }
  expect(spy.edge).not.toHaveBeenCalled();
  hover(piecePoint(0));
  expect(chip().textContent).toBe('Piece 1 of 3 · 82 mm · in this hit · Ctrl+click another to add it');
});

it('an edge nearer the pointer than any piece wins: the lip’s own edge, 15 mm from the line', () => {
  const spy = calls();
  render(<CadViewport {...props(setup(lipLine({ skip: [1, 2] })), spy)} />);
  settle();
  // A point of the lip's edge within the piece's reach of the lip's stretch: the edge is nearer, the edge wins.
  const [p, , q] = station().reach.pieces[0].points;
  const toLip = (x) => polylineDistance([p, q], x);
  const edge = station().reach.edges.find((e) => e.index === FIRST_LIP_EDGE);
  const at = edge.points.find(
    (x) => toLip(x) <= PIECE_PICK_PX && hand(x)?.kind === 'edge' && hand(x).index === FIRST_LIP_EDGE,
  );
  expect(at).toBeTruthy();
  hover(at);
  expect(station().reach.lit).toMatchObject({ kind: 'edge', index: FIRST_LIP_EDGE });
  click(at);
  expect(spy.edge).toHaveBeenCalledWith(FIRST_LIP_EDGE);
  expect(spy.piece).not.toHaveBeenCalled();
});

it('the piece the panel names is lit, with no chip and no cursor', () => {
  const spy = calls();
  const now = setup(lipLine());
  const { rerender } = render(<CadViewport {...props(now, spy)} />);
  rerender(<CadViewport {...props({ ...now, grip: { ...now.grip, litPiece: 2 } }, spy)} />);
  expect(station().reach.lit).toEqual({ kind: 'piece', index: 2, blade: null, part: null });
  expect(chip().hidden).toBe(true);
  rerender(<CadViewport {...props({ ...now, grip: { ...now.grip, litPiece: null } }, spy)} />);
  expect(station().reach.lit).toBe(null);
});

it('the fingers stand behind the gauge edge: one at the lip, two inside the flange', () => {
  const spy = calls();
  const { rerender } = render(<CadViewport {...props(setup(lipLine({ skip: [1, 2] })), spy)} />);
  expect(station().reach.fingerX).toEqual([0]);
  expect(station().reach.fingers).toHaveLength(1);
  const flange = brakePatch(fresh(), { edge: FLANGE_EDGE, distance: 118 }, stationOf(fresh()));
  rerender(<CadViewport {...props(setup(flange), spy)} />);
  settle();
  const xs = station().reach.fingerX;
  expect(xs).toHaveLength(2);
  expect(xs[0]).toBeCloseTo(-xs[1], 6);
  expect(Math.abs(xs[0]) + 12).toBeLessThanOrEqual(261);
});

it('slides the sheet along the bed when other pieces are picked: X only, then the new pose; a new L does not', () => {
  const spy = calls();
  const { rerender } = render(<CadViewport {...props(setup(lipLine()), spy)} />);
  const startX = station().drawn[12];
  rerender(<CadViewport {...props(setup(lipLine({ skip: [1, 2] })), spy)} />);
  expect(station().sliding).toBe(true);
  const target = station().posedAt;
  const seen = [];
  for (let i = 0; i < 4; i++) {
    step(50);
    seen.push(station().drawn);
  }
  // Two frames mid-slide differ in X and in nothing else, between where it was and where it goes.
  const [a, b] = seen;
  expect(Math.abs(a[12] - b[12])).toBeGreaterThan(1);
  a.forEach((v, i) => i !== 12 && expect(v).toBeCloseTo(b[i], 3));
  expect(a[12]).toBeGreaterThan(Math.min(startX, target[12]));
  expect(a[12]).toBeLessThan(Math.max(startX, target[12]));
  expect(station().phase).toBe(null);
  settle();
  expect(station().sliding).toBe(false);
  station().drawn.forEach((v, i) => expect(v).toBeCloseTo(target[i], 3));
  // L moved with the pick kept: no slide.
  rerender(<CadViewport {...props(setup(lipLine({ skip: [1, 2], distance: 14 })), spy)} />);
  expect(station().sliding).toBe(false);
});
