// @vitest-environment jsdom
// Hands on the sheet HO-1 in the viewport (docs/sketch-studio-brake-hands-on.md
// §5.2, §5.3, §5.6): the grip drawn on the station's sheet, a click on a
// handle reaching the workspace as the act, a drag past 90° as the act and
// short of it as nothing, Esc mid-drag putting the sheet back, no handles
// while the workspace says the station is not being set up (a scrub, the
// replay), reduced motion landing at once, and the rigid-body rule: from the
// press to the landing the drawn sheet (a part with an earlier bend
// standing) is one rigid body, and the hand-over to the committed pose moves
// it less than 0.5 mm and 0.5°.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import * as THREE from 'three';
import CadViewport from './CadViewport.jsx';
import { emptyModel } from './model.js';
import { SHEET_STOCK } from './shopCatalog.js';
import { brakePatch, brakeSessionDefaults, brakeStation } from './brakeStation.js';
import { brakeActPatch, brakeOutcome, relativeTurn } from './brakeHands.js';
import { WORK_HEIGHT } from './shopLayer.js';

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
const step = (ms) => {
  now += ms;
  const run = frames;
  frames = [];
  run.forEach((callback) => callback(now));
};
const settle = () => {
  for (let i = 0; i < 60 && frames.length; i++) step(16);
};

// A 300 × 100 SPCC blank with a 20 mm flange already made at x 280, its next
// line gauged off the right end: the sheet on the die with a bend standing.
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
          bends: [{ id: 'b1', a: [280, -1], b: [280, 101], angle: 90, direction: 'up', radius: null }],
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
const stationOf = (s) => brakeStation({ model: brakeModel, session: s, advise: false });
// The station now, the session after an act and the grip's prop (both outcomes worked out).
const setup = (s = session()) => {
  const station = stationOf(s);
  const after = (kind) => {
    const patch = brakeActPatch(kind, station, s);
    return patch ? stationOf(brakePatch(s, patch)) : null;
  };
  const acts = { flip: after('flip'), turn: after('turn') };
  return {
    station,
    view: station.view,
    after: acts,
    grip: (extra = {}) => ({
      shown: true,
      lined: Boolean(acts.turn),
      flip: brakeOutcome(acts.flip),
      turn: acts.turn ? brakeOutcome(acts.turn) : null,
      ms: 1,
      ...extra,
    }),
  };
};

// The viewport's own model and snapshot: one plain part (the station hides it).
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
const props = (extra = {}) => ({
  model,
  snapshot,
  selectedId: null,
  ready: true,
  view: 'isometric',
  onSelect: vi.fn(),
  ...extra,
});
const station = () => document.querySelector('.cad-viewport').cadShop().station;
const canvas = () => document.querySelector('.cad-viewport canvas');
const named = (name) => scenes.last.getObjectByName(name);
// Every piece's outline corners as drawn (world, the machine frame's Z).
const corners = () => {
  const part = named('press-brake-part');
  part.updateMatrixWorld(true);
  return part.children[0].children
    .filter((m) => m.name.startsWith('sheet-piece'))
    .flatMap((m) => {
      const p = m.geometry.getAttribute('position');
      return Array.from({ length: p.count }, (_, i) =>
        new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m.matrixWorld),
      );
    });
};
// The drawn sheet's largest piece placement (world), for its rotation.
const pieceWorld = () => {
  const part = named('press-brake-part');
  part.updateMatrixWorld(true);
  const pieces = part.children[0].children.filter((m) => m.name.startsWith('sheet-piece'));
  return pieces[0].matrixWorld.clone();
};
const gap = (a, b) => Math.max(...a.map((p, i) => p.distanceTo(b[i])));
const press = (type, [x, y], extra = {}) =>
  fireEvent[type](canvas(), {
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerUp' ? 0 : 1,
    pointerId: 1,
    ...extra,
  });
// Along a handle's arc as drawn, from sample `from` to `to` (the dial sweeps 7.5° a sample on the ring).
const dragArc = (arc, from, to, { release = true } = {}) => {
  press('pointerDown', arc[from]);
  const way = to > from ? 1 : -1;
  for (let i = from + way; way > 0 ? i <= to : i >= to; i += way) press('pointerMove', arc[i]);
  if (release) press('pointerUp', arc[to]);
};

it('draws the grip on the sheet: the flip hoop always, the turn ring with a line, coloured by their axes', () => {
  const now = setup();
  const { rerender } = render(<CadViewport {...props({ brakeView: now.view, brakeGrip: now.grip() })} />);
  const grip = station().grip;
  expect(grip.shown).toBe(true);
  expect(grip.handles.flip.axis).toBe('Y');
  expect(grip.handles.turn.axis).toBe('Z');
  expect(grip.handles.flip.arc.length).toBeGreaterThan(20);
  // No line: the hoop alone, about the bed's axis (the flat blank turns over about X).
  const flat = setup(session({ edge: null }));
  rerender(<CadViewport {...props({ brakeView: flat.view, brakeGrip: flat.grip({ lined: false, turn: null }) })} />);
  settle();
  expect(station().grip.handles.turn).toBe(null);
  expect(station().grip.handles.flip).not.toBe(null);
  // Not being set up (a scrub, the replay): no handles.
  rerender(<CadViewport {...props({ brakeView: now.view, brakeGrip: now.grip({ shown: false }) })} />);
  settle();
  expect(station().grip.handles).toEqual({ flip: null, turn: null });
  rerender(<CadViewport {...props({ brakeView: now.view, brakeGrip: null })} />);
  expect(station().grip.handles).toEqual({ flip: null, turn: null });
  expect(document.querySelector('.cad-viewport-hint').textContent).toContain(
    'Drag background to orbit · Right drag to pan · Scroll to zoom',
  );
  expect(document.querySelector('.cad-viewport-hint').textContent).not.toContain('Click a part to select');
});

it('says what to do at the brake in the hint line, by the line picked', () => {
  const now = setup();
  const { rerender } = render(<CadViewport {...props({ brakeView: now.view, brakeGrip: now.grip() })} />);
  expect(document.querySelector('.cad-viewport-hint').textContent).toContain(
    'Drag a ring to flip or turn the sheet, the arrow to slide it · F flip · T turn around · Enter bends · Esc clears the line · Drag background to orbit',
  );
  rerender(<CadViewport {...props({ brakeView: now.view, brakeGrip: now.grip({ lined: false }) })} />);
  expect(document.querySelector('.cad-viewport-hint').textContent).toContain(
    // HO-2 (§6.1): the edge is clicked on the sheet now.
    'Click an edge of the sheet: it goes to the backgauge · F flips the sheet · Drag background to orbit',
  );
});

it('acts on a click: a press without travel reaches the workspace as the act', () => {
  const act = vi.fn();
  const now = setup();
  render(<CadViewport {...props({ brakeView: now.view, brakeGrip: now.grip(), onBrakeGrip: act })} />);
  const at = station().grip.handles.flip.press;
  press('pointerDown', at);
  expect(document.querySelector('.cad-viewport').cadShop().station.grip.dragging).toBe(null);
  press('pointerMove', [at[0] + 2, at[1] + 1]);
  press('pointerUp', [at[0] + 2, at[1] + 1]);
  expect(act).toHaveBeenCalledTimes(1);
  expect(act).toHaveBeenCalledWith('flip');
  // A press elsewhere on the canvas is no act.
  press('pointerDown', [5, 5]);
  press('pointerUp', [5, 5]);
  expect(act).toHaveBeenCalledTimes(1);
});

it('turns the sheet in the hand: short of 90° it eases back and nothing changes; Esc puts it back', () => {
  const act = vi.fn();
  const now = setup();
  render(<CadViewport {...props({ brakeView: now.view, brakeGrip: now.grip(), onBrakeGrip: act })} />);
  const rest = corners();
  const { arc } = station().grip.handles.turn;
  const middle = Math.floor(arc.length / 2);
  // 60° along the ring, let go.
  dragArc(arc, middle, middle + 8);
  expect(act).not.toHaveBeenCalled();
  expect(station().grip.lastDrag.frames).toBeGreaterThan(3);
  expect(station().turning).toBe(true);
  settle();
  expect(station().turning).toBe(false);
  expect(gap(corners(), rest)).toBeLessThan(1e-6);
  // 120° and Esc before letting go.
  dragArc(arc, middle, middle + 16, { release: false });
  expect(station().grip.dragging).toBe('turn');
  expect(station().grip.fraction).toBeGreaterThan(0.5);
  expect(station().phase).toBe('around');
  expect(gap(corners(), rest)).toBeGreaterThan(10);
  fireEvent.keyDown(window, { key: 'Escape' });
  press('pointerUp', arc[middle + 16]);
  expect(act).not.toHaveBeenCalled();
  settle();
  expect(gap(corners(), rest)).toBeLessThan(1e-6);
});

it('hands a drag past 90° over to the committed pose as one rigid body, without a jump, and lands on it', () => {
  const act = vi.fn();
  const now = setup();
  const { rerender } = render(
    <CadViewport {...props({ brakeView: now.view, brakeGrip: now.grip(), onBrakeGrip: act })} />,
  );
  const rest = corners();
  const { arc } = station().grip.handles.turn;
  const middle = Math.floor(arc.length / 2);
  // A rigid body all the way: every pair of corners keeps its distance.
  const span = (points) => [points[0].distanceTo(points[5]), points[1].distanceTo(points.at(-1))];
  dragArc(arc, middle, middle + 18, { release: false });
  span(corners()).forEach((d, i) => expect(d).toBeCloseTo(span(rest)[i], 6));
  press('pointerUp', arc[middle + 18]);
  expect(act).toHaveBeenCalledWith('turn');
  expect(station().grip.handover).toBe(true);
  // Let go, the sheet waits where the hand left it for the act.
  const handed = corners(),
    handedPiece = pieceWorld();
  // The workspace applies the act: the station's new view (the opposite edge, L 100).
  const turned = setup(session({ edge: 3, distance: 100 }));
  expect(turned.view.gaugeDistance).toBeCloseTo(now.after.turn.view.gaugeDistance, 9);
  rerender(<CadViewport {...props({ brakeView: now.after.turn.view, brakeGrip: turned.grip(), onBrakeGrip: act })} />);
  const taken = corners(),
    takenPiece = pieceWorld();
  // The rigid-body rule (§5.2): the hand-over moves it less than 0.5 mm and 0.5°.
  const moved = { mm: gap(taken, handed), degrees: relativeTurn(handedPiece.toArray(), takenPiece.toArray()).degrees };
  console.warn(
    `hands on the sheet: the hand-over moved the sheet ${moved.mm.toExponential(2)} mm, ${moved.degrees.toExponential(2)}°`,
  );
  expect(moved.mm).toBeLessThan(0.5);
  expect(moved.degrees).toBeLessThan(0.5);
  expect(station().turning).toBe(true);
  // It carries on (without starting over) and lands on the pose the station computes.
  step(16);
  const moving = corners();
  expect(gap(moving, taken)).toBeLessThan(20);
  settle();
  expect(station().turning).toBe(false);
  const landed = corners();
  // The landing and the start are the same body turned round.
  span(landed).forEach((d, i) => expect(d).toBeCloseTo(span(rest)[i], 6));
  expect(gap(landed, rest)).toBeGreaterThan(10);
  expect(station().gaugeDistance).toBeCloseTo(100, 6);
  // The very pose the station computes: the same view opened afresh draws it there.
  rerender(<CadViewport {...props({ brakeView: null })} />);
  rerender(<CadViewport {...props({ brakeView: now.after.turn.view })} />);
  expect(station().turning).toBe(false);
  expect(gap(corners(), landed)).toBeLessThan(1e-6);
});

it('lands every turn at once with prefers-reduced-motion: reduce', () => {
  vi.stubGlobal('matchMedia', (query) => ({ matches: query.includes('reduce'), media: query }));
  const now = setup();
  const { rerender } = render(<CadViewport {...props({ brakeView: now.view, brakeGrip: now.grip() })} />);
  rerender(<CadViewport {...props({ brakeView: now.after.flip.view, brakeGrip: now.grip() })} />);
  expect(station().turning).toBe(false);
  expect(station().flipped).toBe(true);
  expect(station().lastTurn).toMatchObject({ frames: 1, ms: 0 });
  // Turned around: at once too.
  rerender(<CadViewport {...props({ brakeView: now.after.turn.view, brakeGrip: now.grip() })} />);
  expect(station().turning).toBe(false);
  expect(frames).toHaveLength(0);
});

it('swings a newly picked gauge edge to the fingers, and never turns for a new L', () => {
  const flat = setup(session({ edge: null }));
  const { rerender } = render(<CadViewport {...props({ brakeView: flat.view })} />);
  // At rest the last hit shows with its short side (the 20 mm flange, the right) to the back. Edge 4
  // (the left end) picked: the sheet turns round to bring it to the fingers.
  const gauged = setup(session({ edge: 3, distance: 50 }));
  rerender(<CadViewport {...props({ brakeView: gauged.view })} />);
  expect(station().turning).toBe(true);
  expect(station().phase).toBe('around');
  settle();
  // A new L: the pose follows at once.
  const nearer = setup(session({ edge: 3, distance: 60 }));
  rerender(<CadViewport {...props({ brakeView: nearer.view })} />);
  expect(station().turning).toBe(false);
  expect(WORK_HEIGHT).toBe(1000);
});

it('lets the press go with the drag when the station ends it: a new view under it, the grip hidden, the station closed', () => {
  const act = vi.fn();
  const now = setup();
  const ref = createRef();
  const shown = (extra) => (
    <CadViewport {...props({ ref, brakeView: now.view, brakeGrip: now.grip(), onBrakeGrip: act, ...extra })} />
  );
  const endings = [
    // A rebuild landing re-poses the station under the drag.
    shown({ snapshot: { ...snapshot } }),
    // The workspace says the station is no longer being set up.
    shown({ brakeGrip: now.grip({ shown: false }) }),
    // The station closes.
    shown({ brakeView: null, brakeGrip: null }),
  ];
  for (const ending of endings) {
    const { rerender } = render(shown());
    const { arc } = station().grip.handles.turn;
    const middle = Math.floor(arc.length / 2);
    dragArc(arc, middle, middle + 8, { release: false });
    expect(station().grip.dragging).toBe('turn');
    expect(ref.current.isDragging()).toBe(true);
    expect(document.querySelector('.cad-grip-chip').hidden).toBe(false);
    rerender(ending);
    // The press is over with the drag: no chip, the orbit back, nothing in the hand.
    expect(ref.current.isDragging()).toBe(false);
    expect(document.querySelector('.cad-grip-chip').hidden).toBe(true);
    expect(document.querySelector('.cad-viewport').cadPlacement().orbit).toBe(true);
    expect(canvas().style.cursor).toBe('');
    press('pointerMove', arc[middle + 12]);
    press('pointerUp', arc[middle + 12]);
    expect(act).not.toHaveBeenCalled();
    cleanup();
  }
});
