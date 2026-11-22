// @vitest-environment jsdom
// Slide sheet in the viewport (docs/sketch-studio-sheet-slide.md §6.1, §7): the
// third handle beside the rings, its chip on approach, a drag along the bed (the
// sheet drawn under the pointer at once, one new slide a frame, the readout by
// the cursor, the detents), Esc puts it back, a click asks for the panel's
// field, and the release glides the sheet onto its pose.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import CadViewport from './CadViewport.jsx';
import { brakePatch, brakeSessionDefaults, brakeStation } from './brakeStation.js';
import { FIRST_LIP_EDGE, lipTrayModel } from './piecePick.fixtures.js';
import { fingerOffer, pieceOffer, slideOffer } from './brakeHands.js';

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
// The first lip alone, punch 100.
const lipAlone = (patch = {}) => ({
  ...brakePatch(fresh(), { edge: FIRST_LIP_EDGE, distance: 15 }, stationOf(fresh())),
  skip: [1, 2],
  punchTrim: -9,
  ...patch,
});
const setup = (s) => {
  const station = stationOf(s);
  return {
    station,
    view: station.view,
    grip: {
      shown: true,
      lined: true,
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
      slide: slideOffer(station.pending.tooling, s.slide),
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
const props = (now, spy, extra = {}) => ({
  model,
  snapshot,
  selectedId: null,
  ready: true,
  view: 'isometric',
  onSelect: vi.fn(),
  brakeView: now.view,
  brakeGrip: now.grip,
  onBrakeEdge: vi.fn(),
  onBrakeFingers: vi.fn(),
  onBrakeFocus: spy.focus,
  onBrakePiece: vi.fn(),
  onBrakeSlide: spy.slide,
  ...extra,
});
const calls = () => ({ slide: vi.fn(), focus: vi.fn() });
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
// The arrow's press point and the bed's +X on the canvas (client px per mm), from what the scene reports.
const arrow = () => station().grip.handles.slide;
const along = () => {
  const { arc } = arrow();
  const [p, q] = [arc[0], arc.at(-1)];
  const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
  return [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
};

it('shows the third handle beside the rings; on approach it names where the sheet stands', () => {
  const spy = calls();
  render(<CadViewport {...props(setup(lipAlone()), spy)} />);
  step();
  const { flip, turn, slide } = station().grip.handles;
  expect(flip && turn && slide).toBeTruthy();
  expect(slide.axis).toBe('X');
  // Apart from the rings on the canvas.
  expect(Math.hypot(slide.centre[0] - turn.centre[0], slide.centre[1] - turn.centre[1])).toBeGreaterThan(30);
  expect(hand(slide.press)).toEqual({ kind: 'grip', handle: 'slide' });
  hover(slide.press);
  expect(station().grip.hot).toBe('slide');
  expect(chip().textContent).toBe('Slide sheet · drag along the bed · centred');
});

it('drags the sheet along the bed: drawn at once, one slide a frame, the readout; Esc puts it back', () => {
  const spy = calls();
  render(<CadViewport {...props(setup(lipAlone()), spy)} />);
  step();
  const at = arrow().press;
  const [dx, dy] = along();
  const before = station().drawn[12];
  press('pointerDown', at);
  // Inside the dead zone nothing moves.
  press('pointerMove', [at[0] + dx * 2, at[1] + dy * 2], { buttons: 1 });
  expect(spy.slide).not.toHaveBeenCalled();
  for (let i = 1; i <= 5; i++) {
    press('pointerMove', [at[0] + dx * (6 + 8 * i), at[1] + dy * (6 + 8 * i)], { buttons: 1 });
    step();
  }
  const sent = spy.slide.mock.calls.map(([e]) => e);
  expect(sent[0]).toEqual({ start: true });
  const values = sent.slice(1).map((e) => e.slide);
  expect(values.length).toBeGreaterThanOrEqual(3);
  values.forEach((v) => expect(v).toBeGreaterThan(0));
  // The sheet is under the pointer already (the session has not answered: the view is the old one).
  expect(station().drawn[12] - before).toBeCloseTo(values.at(-1), 6);
  expect(station().grip.sliding).toBe(values.at(-1));
  expect(chip().textContent).toMatch(/^Slide \d+(\.\d)? mm right · punch /);
  // Esc: the slide put back, the sheet glides home.
  act(() => fireEvent.keyDown(window, { key: 'Escape' }));
  expect(spy.slide.mock.calls.at(-1)[0]).toEqual({ cancel: true });
  expect(station().grip.sliding).toBe(null);
  expect(station().sliding).toBe(true);
  for (let i = 0; i < 30; i++) step(16);
  expect(station().drawn[12]).toBeCloseTo(before, 6);
});

it('a click on the arrow asks for the panel’s field; a typed slide with Enter sets it exactly', () => {
  const spy = calls();
  render(<CadViewport {...props(setup(lipAlone()), spy)} />);
  step();
  const at = arrow().press;
  press('pointerDown', at);
  press('pointerUp', at);
  expect(spy.focus).toHaveBeenCalledWith('slide');
  const [dx, dy] = along();
  press('pointerDown', at);
  press('pointerMove', [at[0] + dx * 20, at[1] + dy * 20], { buttons: 1 });
  step();
  for (const key of ['-', '3']) act(() => fireEvent.keyDown(window, { key }));
  expect(chip().textContent).toContain('-3 mm · Enter applies · Esc cancels');
  act(() => fireEvent.keyDown(window, { key: 'Enter' }));
  const last = spy.slide.mock.calls.map(([e]) => e).slice(-2);
  expect(last).toEqual([{ slide: -3 }, { end: true }]);
});
