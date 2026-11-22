// @vitest-environment jsdom
// Hands on the sheet HO-2 in the viewport (docs/sketch-studio-brake-hands-on.md
// §6.1 – §6.4): an edge of the 3D sheet lights on approach and a click on it
// reaches the workspace as the card's edge pick; the backgauge fingers drag
// (whole millimetres, a tenth with Alt, at most one new L a frame, typed L +
// Enter, Esc puts the line back) and a click on them asks for the L field;
// the punch and the die name themselves and a click asks for their picker;
// the pick order (grip, fingers, blades, edges); and nothing in reach while
// the station is not being set up or in points mode.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import CadViewport from './CadViewport.jsx';
import { emptyModel } from './model.js';
import { SHEET_STOCK } from './shopCatalog.js';
import { brakePatch, brakeSessionDefaults, brakeStation } from './brakeStation.js';
import { fingerOffer } from './brakeHands.js';

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

// A 300 × 100 SPCC blank, nothing made yet, gauged off its right end (edge 2) at L 200.
const rect = { type: 'rectangle', width: 300, height: 100, origin: [0, 0] };
const brakeModel = {
  ...emptyModel(),
  sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile: rect, primitives: [], constrained: false }],
  parts: [
    {
      id: 'p',
      name: 'Tray',
      material: SHEET_STOCK.spcc.name,
      features: [
        {
          id: 'sm',
          type: 'sheetmetal',
          sketchId: 's',
          thickness: 1.5,
          stock: 'spcc',
          kFactor: null,
          base: null,
          marks: [],
          bends: [],
        },
      ],
    },
  ],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
};
const session = (patch = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'brake-1',
  instanceId: 'i',
  edge: 1,
  distance: 200,
  ...patch,
});
// The station and the grip prop as the workspace makes it (CadWorkspace.jsx brakeGrip).
const setup = (s = session(), extra = {}) => {
  const station = brakeStation({ model: brakeModel, session: s, advise: false });
  return {
    station,
    view: station.view,
    grip: {
      shown: true,
      lined: Boolean(station.edge) || (s.mode === 'points' && s.points.length === 2),
      flip: null,
      turn: null,
      ms: null,
      lazy: false,
      mode: s.mode,
      edges: s.mode === 'gauge' ? station.edges : null,
      edge: station.edge?.index ?? null,
      fingers: fingerOffer(station, s),
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
const calls = () => ({ edge: vi.fn(), fingers: vi.fn(), focus: vi.fn() });
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
  onBrakeFingers: spy.fingers,
  onBrakeFocus: spy.focus,
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
// Hover a point and let the hover frame run.
const hover = (at) => {
  press('pointerMove', at, { buttons: 0 });
  step();
};
// A point on the canvas where nothing is in reach (the background), scanning from the corners in.
const emptyPoint = () => {
  for (let i = 4; i < 300; i += 8)
    for (const p of [
      [i, 596 - i],
      [596 - i, 596 - i],
      [i, i],
      [596 - i, i],
    ])
      if (!hand(p)) return p;
  return null;
};
// A point on edge `index` the pick gives to that edge (not under a handle, the fingers or a blade).
const edgePoint = (index) =>
  station()
    .reach.edges.find((e) => e.index === index)
    .points.find((p) => hand(p)?.kind === 'edge' && hand(p).index === index);

it('lights an edge of the sheet on approach and hands a click on it to the workspace as the card’s pick', () => {
  const spy = calls();
  render(<CadViewport {...props(setup(session({ edge: null })), spy)} />);
  // No line: every gauge edge of the blank is offered on the sheet.
  expect(station().reach.edges.map((e) => e.index)).toEqual([0, 1, 2, 3]);
  expect(document.querySelector('.cad-viewport-hint').textContent).toContain(
    'Click an edge of the sheet: it goes to the backgauge · F flips the sheet',
  );
  const at = edgePoint(2);
  expect(at).toBeTruthy();
  hover(at);
  expect(station().reach.lit).toEqual({ kind: 'edge', index: 2, blade: null, part: null });
  expect(station().reach.edgeLit).toBe(true);
  expect(scenes.last.getObjectByName('press-brake-lights').visible).toBe(true);
  expect(canvas().style.cursor).toBe('pointer');
  expect(chip().hidden).toBe(false);
  expect(chip().textContent).toBe('Edge 3 · 300 mm · click: to the backgauge');
  // A click (no travel): exactly the card's edge pick.
  press('pointerDown', at);
  press('pointerUp', at);
  expect(spy.edge).toHaveBeenCalledTimes(1);
  expect(spy.edge).toHaveBeenCalledWith(2);
  expect(spy.focus).not.toHaveBeenCalled();
  // Off the sheet: nothing lit, no chip.
  hover(emptyPoint());
  expect(station().reach.lit).toBe(null);
  expect(chip().hidden).toBe(true);
  expect(scenes.last.getObjectByName('press-brake-lights').visible).toBe(false);
  // A drag that starts by an edge orbits: no pick.
  press('pointerDown', at);
  press('pointerMove', [at[0] + 40, at[1] + 30], { buttons: 1 });
  press('pointerUp', [at[0] + 40, at[1] + 30]);
  expect(spy.edge).toHaveBeenCalledTimes(1);
});

it('asks in the order grip, fingers, blades, edges: the flip hoop over the front edge wins it', () => {
  const spy = calls();
  render(<CadViewport {...props(setup(), spy)} />);
  const hoop = station().grip.handles.flip.press;
  // The hoop stands over the front edge (edge 1 of a gauged blank is in reach there too).
  expect(hand(hoop)).toEqual({ kind: 'grip', handle: 'flip' });
  expect(hand(station().reach.fingers[0])).toEqual({ kind: 'fingers', offered: true });
  const { punch, die } = viewport().cadBrakeSpots();
  expect(hand(punch)).toMatchObject({ kind: 'blade', blade: 'punch', name: 'Straight 88°' });
  expect(hand(die)).toMatchObject({ kind: 'blade', blade: 'die' });
  // From an edge onto the hoop: the hoop lights, the edge goes out.
  hover(edgePoint(1));
  expect(station().reach.lit).toMatchObject({ kind: 'edge', index: 1 });
  hover(hoop);
  expect(station().grip.hot).toBe('flip');
  expect(station().reach.lit).toBe(null);
  expect(station().reach.edgeLit).toBe(false);
  expect(chip().textContent).toContain('Flip sheet · F');
});

it('drags the backgauge: whole millimetres, a tenth with Alt, one new L a frame, the readout by the cursor', () => {
  const spy = calls();
  const now = setup();
  render(<CadViewport {...props(now, spy)} />);
  const [x, y] = station().reach.fingers[0];
  hover([x, y]);
  expect(chip().textContent).toBe('Backgauge · L 200 · drag, or click to type');
  expect(canvas().style.cursor).toBe('grab');
  expect(station().reach.lit).toMatchObject({ kind: 'fingers' });
  press('pointerDown', [x, y]);
  // Inside the dead zone: nothing yet.
  press('pointerMove', [x, y - 2], { buttons: 1 });
  expect(spy.fingers).not.toHaveBeenCalled();
  // Up the screen is toward the backgauge: L grows.
  for (let i = 1; i <= 6; i++) {
    press('pointerMove', [x, y - 4 - 6 * i], { buttons: 1 });
    step();
  }
  const sent = spy.fingers.mock.calls.map(([e]) => e);
  expect(sent[0]).toEqual({ start: true });
  const distances = sent.slice(1).map((e) => e.distance);
  expect(distances.length).toBeGreaterThanOrEqual(5);
  distances.forEach((d, i) => {
    expect(Number.isInteger(d)).toBe(true);
    expect(d).toBeGreaterThan(i ? distances[i - 1] : 200);
  });
  expect(station().reach.held).toBe(true);
  expect(station().grip.shown).toBe(false);
  expect(chip().textContent).toMatch(/^L \d+ mm/);
  // Two moves in one frame: one new L, the second in the next frame.
  const before = spy.fingers.mock.calls.length;
  press('pointerMove', [x, y - 70], { buttons: 1 });
  press('pointerMove', [x, y - 80], { buttons: 1 });
  expect(spy.fingers.mock.calls.length).toBe(before + 1);
  step();
  expect(spy.fingers.mock.calls.length).toBe(before + 2);
  // Alt: a tenth at a time.
  const free = [];
  for (let i = 1; i <= 7; i++) {
    step();
    press('pointerMove', [x, y - 80 - i], { buttons: 1, altKey: true });
    free.push(spy.fingers.mock.calls.at(-1)[0].distance);
  }
  free.forEach((d) => expect(Math.round(d * 10)).toBeCloseTo(d * 10, 6));
  expect(free.some((d) => !Number.isInteger(d))).toBe(true);
  // Let go: the drag ends with its last L sent, nothing else.
  press('pointerUp', [x, y - 87]);
  expect(spy.fingers.mock.calls.at(-1)[0]).toEqual({ end: true });
  expect(spy.focus).not.toHaveBeenCalled();
  expect(station().reach.held).toBe(false);
});

it('sets L exactly from digits + Enter mid-drag, and Esc puts the line back', () => {
  const spy = calls();
  render(<CadViewport {...props(setup(), spy)} />);
  const [x, y] = station().reach.fingers[0];
  press('pointerDown', [x, y]);
  press('pointerMove', [x, y - 30], { buttons: 1 });
  step();
  for (const key of ['1', '5', '0']) fireEvent.keyDown(window, { key });
  expect(chip().textContent).toContain('150 mm · Enter applies · Esc cancels');
  fireEvent.keyDown(window, { key: 'Enter' });
  const events = spy.fingers.mock.calls.map(([e]) => e);
  expect(events.slice(-2)).toEqual([{ distance: 150 }, { end: true }]);
  press('pointerUp', [x, y - 30]);
  // Esc mid-drag: the workspace puts the line back; nothing else is sent.
  spy.fingers.mockClear();
  press('pointerDown', [x, y]);
  press('pointerMove', [x, y - 30], { buttons: 1 });
  step();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(spy.fingers.mock.calls.at(-1)[0]).toEqual({ cancel: true });
  const count = spy.fingers.mock.calls.length;
  press('pointerMove', [x, y - 60], { buttons: 1 });
  press('pointerUp', [x, y - 60]);
  expect(spy.fingers.mock.calls.length).toBe(count);
  // A right press mid-drag cancels too.
  spy.fingers.mockClear();
  press('pointerDown', [x, y]);
  press('pointerMove', [x, y - 30], { buttons: 1 });
  step();
  press('pointerDown', [x, y - 30], { button: 2, buttons: 2 });
  expect(spy.fingers.mock.calls.at(-1)[0]).toEqual({ cancel: true });
});

it('reads the L the fingers stand at and the bend while the line seats on a made bend (tight bends §7.4 (f))', () => {
  // Bend 1 made at L 200 to 45° (the automatic V10 seats within 5 mm): the fingers grabbed at L 194,
  // dragged toward the back onto it.
  const sm = brakeModel.parts[0].features[0];
  const made = {
    ...brakeModel,
    parts: [
      {
        ...brakeModel.parts[0],
        features: [
          {
            ...sm,
            bends: [
              { id: 'b1', a: [100, 0], b: [100, 100], angle: 45, direction: 'up', radius: null, punch: 'straight-88' },
            ],
          },
        ],
      },
    ],
  };
  const at = (s) => {
    const st = brakeStation({ model: made, session: s, advise: false });
    return { st, now: { view: st.view, grip: { ...setup(s).grip, fingers: fingerOffer(st, s) } } };
  };
  const spy = calls();
  const start = session({ distance: 194 });
  const first = at(start);
  expect(first.now.grip.fingers).toMatchObject({ offered: true, L: 194 });
  expect('on' in first.now.grip.fingers).toBe(false);
  const { rerender } = render(<CadViewport {...props(first.now, spy)} />);
  const [x, y] = station().reach.fingers[0];
  press('pointerDown', [x, y]);
  for (let i = 1; i <= 12 && spy.fingers.mock.calls.length < 2; i++) {
    press('pointerMove', [x, y - 4 - i], { buttons: 1 });
    step();
  }
  const dragged = spy.fingers.mock.calls.at(-1)[0].distance;
  expect(dragged).not.toBe(200);
  expect(Math.abs(dragged - 200)).toBeLessThanOrEqual(5);
  // The workspace has not caught up: the dragged L, as ever.
  expect(chip().textContent).toMatch(new RegExp(`^L ${dragged} mm`));
  // The pick seats on bend 1 (the workspace's brakePatch): the fingers stand at 200, the chip says so.
  const seated = brakePatch(start, { distance: dragged }, first.st);
  expect([seated.distance, seated.seated?.from]).toEqual([200, dragged]);
  const next = at(seated);
  expect(next.now.grip.fingers).toMatchObject({ L: 200, on: 1, from: dragged });
  rerender(<CadViewport {...props(next.now, spy)} />);
  expect(chip().textContent).toMatch(/^L 200 mm · on bend 1/);
  press('pointerUp', [x, y - 20]);
});

it('asks for the L field on a click of the fingers, and for its picker on a click of a blade', () => {
  const spy = calls();
  render(<CadViewport {...props(setup(), spy)} />);
  const fingers = station().reach.fingers[0];
  press('pointerDown', fingers);
  press('pointerUp', [fingers[0] + 1, fingers[1] + 1]);
  expect(spy.focus).toHaveBeenCalledWith('distance');
  expect(spy.fingers).not.toHaveBeenCalled();
  const { punch, die } = viewport().cadBrakeSpots();
  hover(punch);
  expect(chip().textContent).toBe('Straight 88° punch · click to change');
  expect(station().reach.lit).toMatchObject({ kind: 'blade', blade: 'punch' });
  // A tint, never the collision red.
  const section = scenes.last.getObjectByName('press-brake-punch').children[0];
  expect(`#${section.material.color.getHexString()}`).toBe('#a9cbe3');
  press('pointerDown', punch);
  press('pointerUp', punch);
  expect(spy.focus).toHaveBeenLastCalledWith('punch');
  hover(die);
  expect(chip().textContent).toMatch(/^V\d+ 88° die · click to change$/);
  // The punch is itself again.
  expect(`#${section.material.color.getHexString()}`).not.toBe('#a9cbe3');
  press('pointerDown', die);
  press('pointerUp', die);
  expect(spy.focus).toHaveBeenLastCalledWith('die');
  expect(spy.edge).not.toHaveBeenCalled();
});

it('offers nothing while the station is not being set up, and no edges or fingers in points mode', () => {
  const spy = calls();
  const now = setup();
  const { rerender } = render(<CadViewport {...props(now, spy, { brakeGrip: { ...now.grip, shown: false } })} />);
  const fingers = station().reach.fingers;
  expect(fingers).toEqual([]);
  expect(station().reach.edges).toEqual([]);
  expect(viewport().cadBrakeSpots()).toEqual({ punch: null, die: null });
  // The replay: no grip at all.
  rerender(<CadViewport {...props(now, spy, { brakeGrip: null })} />);
  expect(station().reach.edges).toEqual([]);
  // Points mode with its line: no edges, the fingers scenery (none stand on a two-point line).
  const points = setup(
    session({
      mode: 'points',
      edge: null,
      points: [
        [150, -1],
        [150, 101],
      ],
    }),
  );
  rerender(<CadViewport {...props(points, spy)} />);
  // The sheet swings to its new line first (a turn: nothing in reach meanwhile), then rests.
  for (let i = 0; i < 60 && frames.length; i++) step();
  expect(station().turning).toBe(false);
  expect(station().grip.shown).toBe(true);
  expect(points.grip.fingers).toMatchObject({ offered: false, why: 'No backgauge on a two-point line' });
  expect(station().reach.edges).toEqual([]);
  expect(station().reach.fingers).toEqual([]);
  expect(document.querySelector('.cad-viewport-hint').textContent).toContain(
    'Drag a ring to flip or turn the sheet, the arrow to slide it',
  );
  const spots = viewport().cadBrakeSpots();
  // The blades still lead to their pickers there.
  expect(hand(spots.punch)).toMatchObject({ kind: 'blade', blade: 'punch' });
});
