// @vitest-environment jsdom
// Direct placement in the viewport (Phase H): the hover ghost and snap
// readout, a click hands the workspace a face frame (or the ground), and the
// distance arrow drags with snapping, typed values and Esc — never selecting.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import CadViewport from './CadViewport.jsx';
import { createOperationDraft } from './operations.js';
import { placeClick, placementView, startPlacement } from './placementTool.js';
import { hardwareDefaults } from './hardware.js';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      setPixelRatio() {}
      setSize() {}
      dispose() {}
      render() {}
    },
  };
});
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { EventDispatcher, Vector3 } = await import('three');
  return {
    OrbitControls: class extends EventDispatcher {
      target = new Vector3();
      enabled = true;
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
      attach(object) {
        this.object = object;
      }
      detach() {
        this.object = null;
      }
      dispose() {}
    },
  };
});

const SIZE = 600;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: SIZE, height: SIZE }),
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(SIZE);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(SIZE);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// A box mesh as the kernel sends it: every face its own vertices and normals.
function boxMesh([x0, y0, z0], [x1, y1, z1]) {
  const faces = [
    [
      [0, 0, 1],
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
    ],
    [
      [0, 0, -1],
      [
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y0, z0],
      ],
    ],
    [
      [0, -1, 0],
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
    ],
    [
      [0, 1, 0],
      [
        [x0, y1, z0],
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
    ],
    [
      [1, 0, 0],
      [
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y0, z1],
      ],
    ],
  ];
  const vertices = [],
    normals = [],
    triangles = [];
  faces.forEach(([normal, corners], f) => {
    corners.forEach((c) => {
      vertices.push(...c);
      normals.push(...normal);
    });
    triangles.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  return { vertices, normals, triangles };
}
function boxEdges([x0, y0, z0], [x1, y1, z1]) {
  const rect = (z) => [
    [x0, y0, z],
    [x1, y0, z],
    [x1, y1, z],
    [x0, y1, z],
  ];
  const bottom = rect(z0),
    top = rect(z1);
  const lines = [];
  for (let i = 0; i < 4; i++) lines.push(...bottom[i], ...bottom[(i + 1) % 4], ...top[i], ...top[(i + 1) % 4]);
  for (let i = 0; i < 4; i++) lines.push(...bottom[i], ...top[i]);
  return lines;
}
const BOUNDS = [
  [0, 0, 0],
  [600, 400, 18],
];
const board = {
  id: 'board',
  partId: 'board',
  bounds: BOUNDS,
  mesh: boxMesh(...BOUNDS),
  edges: { lines: boxEdges(...BOUNDS) },
  placement: [{ translation: [0, 0, 0] }],
};
const model = {
  parameters: [],
  sketches: [],
  marks: [],
  parts: [{ id: 'board', name: 'Board', features: [] }],
  instances: [{ id: 'board', partId: 'board', position: [0, 0, 0], rotation: [0, 0, 0] }],
  connections: [],
};
const snapshot = { parameters: {}, parts: [{ id: 'board', bounds: BOUNDS }], instances: [board] };
const ctx = { model, snapshot, parameters: {} };
const placeDraft = () =>
  createOperationDraft({ type: 'extrude', model, placement: startPlacement({ type: 'extrude' }) });

const canvas = () => document.querySelector('canvas');
const viewportEl = () => document.querySelector('.cad-viewport');
const state = () => viewportEl().cadPlacement();
const pointer = (type, [clientX, clientY], init = {}) =>
  act(() => canvas().dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, ...init })));
const click = (at) => {
  pointer('pointerdown', at, { button: 0 });
  pointer('pointerup', at, { button: 0 });
};
const press = (key) => act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
const props = (extra) => ({
  model,
  snapshot,
  ready: true,
  view: 'top',
  onSelect: vi.fn(),
  moveSnap: 1,
  ...extra,
});

it('shows the ghost and the snap readout on hover, and a click places with the face frame', () => {
  const onPlace = vi.fn(),
    onSelect = vi.fn();
  const placement = placementView(placeDraft(), ctx);
  render(<CadViewport {...props({ placement, onPlace, onSelect })} />);
  expect(document.querySelector('.cad-viewport-hint').textContent).toContain(
    'Extrude: click a flat face to place the profile',
  );
  // Near the middle of the top face: the face centre snaps.
  const centre = viewportEl().cadProject([300, 200, 18]);
  pointer('pointermove', [centre[0] + 2, centre[1] + 1]);
  expect(state()).toMatchObject({ stage: 'place', pick: 'face', snapKind: 'face centre' });
  expect(state().hover.point).toEqual([300, 200, 18]);
  expect(state().layers).toEqual(expect.arrayContaining(['placement-hover', 'placement-cursor']));
  const hud = document.querySelector('.cad-placement-hud');
  expect(hud.hidden).toBe(false);
  expect(hud.textContent).toContain('face centre · Board top');
  // Elsewhere on the face: the 1 mm grid of the face (from its lower-left corner).
  const free = viewportEl().cadProject([123.4, 87.6, 18]);
  pointer('pointermove', free);
  expect(state().snapKind).toBe('grid');
  click(free);
  expect(onPlace).toHaveBeenCalledOnce();
  const info = onPlace.mock.calls[0][0];
  expect(info).toMatchObject({ kind: 'face', instanceId: 'board', partId: 'board', planar: true, normal: [0, 0, 1] });
  info.point.forEach((v, i) => expect(v).toBeCloseTo([123, 88, 18][i], 6));
  expect(info.faceFrame.origin).toEqual([0, 0, 18]);
  expect(info.outline).toHaveLength(4);
  // Placing never changes the selection.
  expect(onSelect).not.toHaveBeenCalled();
});

it('a click on empty space places on the ground (z = 0) for a new part', () => {
  const onPlace = vi.fn();
  render(<CadViewport {...props({ placement: placementView(placeDraft(), ctx), onPlace })} />);
  const outside = viewportEl().cadProject([800, -150, 0]);
  click(outside);
  expect(onPlace).toHaveBeenCalledOnce();
  const info = onPlace.mock.calls[0][0];
  expect(info.kind).toBe('ground');
  info.point.forEach((v, i) => expect(v).toBeCloseTo([800, -150, 0][i], 6));
});

// A placed profile on the top face, seen from the front so the arrow is square to the view.
function shaped(extra = {}) {
  const draft = placeClick(
    placeDraft(),
    {
      kind: 'face',
      planar: true,
      instanceId: 'board',
      partId: 'board',
      point: [300, 200, 18],
      normal: [0, 0, 1],
      faceFrame: { origin: [0, 0, 18], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1] },
      outline: [],
    },
    ctx,
  );
  const callbacks = { onPlacementDrag: vi.fn(), onPlacementCancelDrag: vi.fn(), onSelect: vi.fn() };
  render(<CadViewport {...props({ placement: placementView(draft, ctx), view: 'front', ...callbacks, ...extra })} />);
  return callbacks;
}
const arrowHead = () => state().handles.find((h) => h.id === 'distance');

it('drags the distance arrow with snapping and a readout, then reports the value once', () => {
  const { onPlacementDrag, onSelect } = shaped();
  expect(state().handles.map((h) => h.id)).toEqual(['distance', 'slide', 'corner']);
  expect(state().layers).toEqual(expect.arrayContaining(['placement-ghost', 'placement-arrow-distance']));
  const head = arrowHead();
  pointer('pointerdown', [head.x, head.y], { button: 0 });
  expect(state()).toMatchObject({ dragging: 'distance', orbit: false });
  // Up the screen by 30.4 mm worth of pixels: 18 + 30.4 → snapped to 48.
  const target = viewportEl().cadProject([head.at[0], head.at[1], head.at[2] + 30.4]);
  pointer('pointermove', target, { buttons: 1 });
  expect(state().value).toBe(48);
  const hud = document.querySelector('.cad-placement-hud');
  expect(hud.textContent).toContain('48 mm');
  expect(hud.textContent).toContain('Type a value');
  expect(onPlacementDrag).not.toHaveBeenCalled();
  pointer('pointerup', target, { button: 0 });
  expect(onPlacementDrag).toHaveBeenCalledOnce();
  expect(onPlacementDrag.mock.calls[0][0]).toMatchObject({ id: 'distance', value: 48 });
  expect(state()).toMatchObject({ dragging: null, orbit: true });
  expect(onSelect).not.toHaveBeenCalled();
});

it('takes a typed value during the drag; into the part it reads as a cut', () => {
  const { onPlacementDrag } = shaped();
  const head = arrowHead();
  pointer('pointerdown', [head.x, head.y], { button: 0 });
  const into = viewportEl().cadProject([head.at[0], head.at[1], head.at[2] - 30]);
  pointer('pointermove', into, { buttons: 1 });
  expect(state().cut).toBe(true);
  expect(document.querySelector('.cad-placement-hud').textContent).toContain('Cut 12 mm');
  for (const key of ['2', '5']) press(key);
  expect(document.querySelector('.cad-placement-hud').textContent).toContain('25 mm · Enter applies');
  press('Enter');
  // Typed in the cut direction: 25 mm deep.
  expect(onPlacementDrag).toHaveBeenCalledOnce();
  expect(onPlacementDrag.mock.calls[0][0]).toMatchObject({ id: 'distance', value: -25 });
  expect(state()).toMatchObject({ dragging: null, orbit: true });
});

it('Esc during a drag restores the value and orbiting, and reports nothing', () => {
  const { onPlacementDrag, onPlacementCancelDrag } = shaped();
  const head = arrowHead();
  pointer('pointerdown', [head.x, head.y], { button: 0 });
  pointer('pointermove', viewportEl().cadProject([head.at[0], head.at[1], head.at[2] + 40]), { buttons: 1 });
  expect(state().handles.find((h) => h.id === 'distance').value).toBe(58);
  press('Escape');
  expect(onPlacementCancelDrag).toHaveBeenCalledOnce();
  expect(state()).toMatchObject({ dragging: null, orbit: true });
  expect(state().handles.find((h) => h.id === 'distance').value).toBe(18);
  pointer('pointerup', [head.x, head.y], { button: 0 });
  expect(onPlacementDrag).not.toHaveBeenCalled();
});

it('drags the corner grip to a centred size and the slide square onto the plane grid', () => {
  const { onPlacementDrag } = shaped({ view: 'top' });
  const corner = state().handles.find((h) => h.id === 'corner');
  pointer('pointerdown', [corner.x, corner.y], { button: 0 });
  pointer('pointermove', viewportEl().cadProject([330.2, 225.4, 18]), { buttons: 1 });
  expect(document.querySelector('.cad-placement-hud').textContent).toContain('60 × 51 mm');
  pointer('pointerup', viewportEl().cadProject([330.2, 225.4, 18]), { button: 0 });
  expect(onPlacementDrag.mock.calls[0][0]).toMatchObject({ id: 'corner', value: { width: 60, height: 51 } });
  // Until the workspace sends the new view, the dragged ghost stays: the
  // square sits where it was (the corner drag keeps the centre).
  const square = state().handles.find((h) => h.id === 'slide');
  pointer('pointerdown', [square.x, square.y], { button: 0 });
  pointer('pointermove', viewportEl().cadProject([350.3, 260.2, 18]), { buttons: 1 });
  expect(document.querySelector('.cad-placement-hud').textContent).toContain('at (350, 260) mm');
  pointer('pointerup', viewportEl().cadProject([350.3, 260.2, 18]), { button: 0 });
  expect(onPlacementDrag.mock.calls[1][0]).toMatchObject({ id: 'slide', value: [350, 260, 18], from: [300, 200, 18] });
});

it('draws Revolve’s dashed axis with its label, and an edge click for a new axis', () => {
  const draft = placeClick(
    createOperationDraft({ type: 'revolve', model, placement: startPlacement({ type: 'revolve' }) }),
    {
      kind: 'face',
      planar: true,
      instanceId: 'board',
      partId: 'board',
      point: [300, 30, 18],
      normal: [0, 0, 1],
      faceFrame: { origin: [0, 0, 18], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1] },
      outline: [
        [
          [0, 0],
          [600, 0],
        ],
        [
          [0, 0],
          [0, 400],
        ],
      ],
    },
    ctx,
  );
  const onPlace = vi.fn();
  const { rerender } = render(<CadViewport {...props({ placement: placementView(draft, ctx), onPlace })} />);
  expect(state().layers).toEqual(expect.arrayContaining(['placement-axis', 'placement-axis-label']));
  expect(document.querySelector('.cad-placement-label').hidden).toBe(false);
  // The axis pick: an edge of the displayed part under the pointer.
  const picking = { ...draft, placement: { ...draft.placement, stage: 'axis' } };
  rerender(<CadViewport {...props({ placement: placementView(picking, ctx), onPlace })} />);
  expect(state().pick).toBe('edge');
  const onEdge = viewportEl().cadProject([0, 200, 18]);
  click([onEdge[0] + 2, onEdge[1]]);
  expect(onPlace).toHaveBeenCalledOnce();
  const edge = onPlace.mock.calls[0][0];
  expect(edge.kind).toBe('edge');
  // Seen from the top the bottom-left edge lies under it: the one in the profile plane wins.
  expect([edge.a, edge.b].map((p) => [p[0], p[2]])).toEqual([
    [0, 18],
    [0, 18],
  ]);
});

// Phase J: Hole / Pocket / Transform in the viewport.
const holeDraft = () => createOperationDraft({ type: 'hole', model, placement: startPlacement({ type: 'hole' }) });
const topClick = (point) => ({
  kind: 'face',
  planar: true,
  instanceId: 'board',
  partId: 'board',
  point,
  normal: [0, 0, 1],
  faceFrame: { origin: [0, 0, 18], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1] },
  outline: [],
});

it('Hole: a red circle ghost on hover, a click hands over the face, never selecting', () => {
  const onPlace = vi.fn(),
    onSelect = vi.fn();
  render(<CadViewport {...props({ placement: placementView(holeDraft(), ctx), onPlace, onSelect })} />);
  expect(document.querySelector('.cad-viewport-hint').textContent).toContain('Hole: click a flat face to drill there');
  const centre = viewportEl().cadProject([300, 200, 18]);
  pointer('pointermove', [centre[0] + 2, centre[1] + 1]);
  expect(state()).toMatchObject({ tool: 'hole', stage: 'place', pick: 'face', cut: true, snapKind: 'face centre' });
  expect(state().layers).toEqual(expect.arrayContaining(['placement-hover', 'placement-cursor']));
  expect(document.querySelectorAll('.cad-placement-hud')).toHaveLength(1);
  expect(document.querySelector('.cad-placement-hud').textContent).toContain('face centre · Board top');
  click([centre[0] + 2, centre[1] + 1]);
  expect(onPlace).toHaveBeenCalledOnce();
  expect(onPlace.mock.calls[0][0]).toMatchObject({
    kind: 'face',
    instanceId: 'board',
    planar: true,
    normal: [0, 0, 1],
  });
  expect(onSelect).not.toHaveBeenCalled();
});

it('Hole: an existing hole centre on the face snaps', () => {
  const withHole = {
    ...snapshot,
    parts: [
      {
        id: 'board',
        bounds: BOUNDS,
        features: { old: { cut: { position: [150, 100, 18], direction: [0, 0, -1], widthDirection: [1, 0, 0] } } },
      },
    ],
  };
  const holeModel = {
    ...model,
    parts: [{ id: 'board', name: 'Board', features: [{ id: 'old', type: 'hole', diameter: 6, depth: 5 }] }],
  };
  const placement = placementView(
    createOperationDraft({ type: 'hole', model: holeModel, placement: startPlacement({ type: 'hole' }) }),
    { model: holeModel, snapshot: withHole, parameters: {} },
  );
  render(<CadViewport {...props({ placement, onPlace: vi.fn() })} />);
  const at = viewportEl().cadProject([150, 100, 18]);
  pointer('pointermove', [at[0] + 3, at[1] - 2]);
  expect(state().snapKind).toBe('hole centre');
  state().hover.point.forEach((v, i) => expect(v).toBeCloseTo([150, 100, 18][i], 6));
});

// A placed hole (through all) seen from the front: its arrow points down into the board.
function shapedHole(view = 'front') {
  const draft = placeClick(holeDraft(), topClick([300, 200, 18]), ctx);
  const callbacks = { onPlacementDrag: vi.fn(), onPlacementCancelDrag: vi.fn(), onSelect: vi.fn() };
  render(<CadViewport {...props({ placement: placementView(draft, ctx), view, ...callbacks })} />);
  return callbacks;
}

it('Hole: the red depth arrow drags from Through all to a blind depth; typed 3 + Enter sets 3 mm', () => {
  const { onPlacementDrag, onSelect } = shapedHole();
  expect(state()).toMatchObject({ stage: 'shape', cut: true, throughAll: true });
  expect(state().handles.map((h) => h.id)).toEqual(['distance', 'slide', 'radius']);
  expect(state().layers).toEqual(expect.arrayContaining(['placement-ghost', 'placement-arrow-distance']));
  const head = state().handles.find((h) => h.id === 'distance');
  expect(head.value).toBe(18);
  pointer('pointerdown', [head.x, head.y], { button: 0 });
  expect(state()).toMatchObject({ dragging: 'distance', orbit: false });
  // Back up 9 mm: a 9 mm blind hole.
  pointer('pointermove', viewportEl().cadProject([head.at[0], head.at[1], head.at[2] + 9.2]), { buttons: 1 });
  expect(state().value).toBe(9);
  expect(state().throughAll).toBe(false);
  const hud = document.querySelector('.cad-placement-hud');
  expect(hud.textContent).toContain('Depth 9 mm');
  // Out past the face: clamped at the minimum, never outward.
  pointer('pointermove', viewportEl().cadProject([head.at[0], head.at[1], head.at[2] + 60]), { buttons: 1 });
  expect(state().value).toBe(0.1);
  // Down past the far face: Through all.
  pointer('pointermove', viewportEl().cadProject([head.at[0], head.at[1], head.at[2] - 6]), { buttons: 1 });
  expect(state().throughAll).toBe(true);
  expect(hud.textContent).toContain('Through all');
  press('3');
  press('Enter');
  expect(onPlacementDrag).toHaveBeenCalledOnce();
  expect(onPlacementDrag.mock.calls[0][0]).toMatchObject({ id: 'distance', value: 3 });
  expect(state()).toMatchObject({ dragging: null, orbit: true });
  expect(onSelect).not.toHaveBeenCalled();
});

it('Hole: the radius grip reads Ø, clamps at 0.1 mm; Esc cancels and re-enables orbit', () => {
  const { onPlacementDrag, onPlacementCancelDrag } = shapedHole('top');
  const grip = state().handles.find((h) => h.id === 'radius');
  pointer('pointerdown', [grip.x, grip.y], { button: 0 });
  pointer('pointermove', viewportEl().cadProject([305, 200, 18]), { buttons: 1 });
  expect(document.querySelector('.cad-placement-hud').textContent).toContain('Ø 10 mm');
  press('Escape');
  expect(onPlacementCancelDrag).toHaveBeenCalledOnce();
  expect(state()).toMatchObject({ dragging: null, orbit: true });
  pointer('pointerdown', [grip.x, grip.y], { button: 0 });
  pointer('pointermove', viewportEl().cadProject([300, 200, 18]), { buttons: 1 });
  pointer('pointerup', viewportEl().cadProject([300, 200, 18]), { button: 0 });
  expect(onPlacementDrag.mock.calls[0][0]).toMatchObject({ id: 'radius', value: { radius: 0.05 } });
});

it('Transform: the gizmo sits on a ghost of the part itself', () => {
  const draft = createOperationDraft({
    type: 'transform',
    model,
    partId: 'board',
    placement: startPlacement({ type: 'transform', hostInstanceId: 'board' }),
  });
  const placement = placementView(draft, ctx);
  expect(placement.toolGizmo).toMatchObject({ self: true, partId: 'board' });
  render(<CadViewport {...props({ placement, onPlacementDrag: vi.fn() })} />);
  expect(document.querySelector('.cad-viewport-hint').textContent).toContain("Transform: drag the part's ghost");
  const tool = state().tool3d;
  expect(tool).toMatchObject({ mode: 'translate' });
  // The ghost of the 600 × 400 × 18 board at its own (zero) pose: the pivot is its centre.
  tool.pivot.forEach((v, i) => expect(v).toBeCloseTo([300, 200, 9][i], 6));
});

const emptySnapshot = { parameters: {}, parts: [], instances: [] };
const expectSameScreen = (point, before) =>
  viewportEl()
    .cadProject(point)
    .forEach((v, i) => expect(v).toBeCloseTo(before[i], 6));

it('mounted empty: neither a preview nor the first committed part moves the camera', () => {
  const empty = { ...model, parts: [], instances: [] };
  const view = render(<CadViewport {...props({ model: empty, snapshot: emptySnapshot, view: 'isometric' })} />);
  const probe = [300, 200, 0];
  const before = viewportEl().cadProject(probe);
  // The first extrude's preview on the empty model: the camera stays put.
  view.rerender(<CadViewport {...props({ model, snapshot, view: 'isometric', previewShown: true })} />);
  expectSameScreen(probe, before);
  // A part added in this session (committed, then rebuilt): still no fit.
  view.rerender(<CadViewport {...props({ model, snapshot: emptySnapshot, view: 'isometric' })} />);
  expectSameScreen(probe, before);
  view.rerender(<CadViewport {...props({ model, snapshot, view: 'isometric' })} />);
  expectSameScreen(probe, before);
  view.rerender(<CadViewport {...props({ model, snapshot: { ...snapshot }, view: 'isometric' })} />);
  expectSameScreen(probe, before);
});

it('mounted with parts still loading: the first snapshot with parts is framed once', () => {
  const view = render(<CadViewport {...props({ model, snapshot: emptySnapshot, view: 'isometric' })} />);
  const probe = [300, 200, 0];
  const before = viewportEl().cadProject(probe);
  // The opened model's geometry arrives from the worker: framed once.
  view.rerender(<CadViewport {...props({ model, snapshot, view: 'isometric' })} />);
  const framed = viewportEl().cadProject(probe);
  expect(Math.hypot(framed[0] - before[0], framed[1] - before[1])).toBeGreaterThan(1);
  // Later snapshots leave the camera alone.
  view.rerender(<CadViewport {...props({ model, snapshot: { ...snapshot }, view: 'isometric' })} />);
  expectSameScreen(probe, framed);
});

it('viewDropPoint: the default view of an empty model drops exactly at the origin', () => {
  const ref = createRef();
  const empty = { ...model, parts: [], instances: [] };
  render(<CadViewport {...props({ ref, model: empty, snapshot: emptySnapshot, view: 'isometric' })} />);
  const point = ref.current.viewDropPoint();
  expect(point).toEqual([0, 0, 0]);
  // No -0 from rounding the ~1e-13 ray noise.
  point.forEach((v) => expect(Object.is(v, -0)).toBe(false));
  // Perspective too.
  cleanup();
  render(
    <CadViewport {...props({ ref, model: empty, snapshot: emptySnapshot, view: 'isometric', perspective: true })} />,
  );
  expect(ref.current.viewDropPoint()).toEqual([0, 0, 0]);
});

it('viewDropPoint: the ground under the view centre after the camera moves', () => {
  const ref = createRef();
  const empty = { ...model, parts: [], instances: [] };
  const view = render(<CadViewport {...props({ ref, model: empty, snapshot: emptySnapshot, view: 'isometric' })} />);
  // Looking down from the isometric direction at a point 200 mm up: the centre
  // ray meets the ground 250 mm further along -x and +y (dz / 0.8 per axis).
  const focusTarget = { position: [1000, 500, 200], normal: [1, -1, 0.8], span: 800 };
  view.rerender(
    <CadViewport {...props({ ref, model: empty, snapshot: emptySnapshot, view: 'isometric', focusTarget })} />,
  );
  expect(ref.current.viewDropPoint()).toEqual([750, 750, 0]);
  // Straight down: the point under the target.
  const down = { position: [-1234.4, 567.6, 300], normal: [0, 0, 1], span: 800 };
  view.rerender(
    <CadViewport {...props({ ref, model: empty, snapshot: emptySnapshot, view: 'isometric', focusTarget: down })} />,
  );
  expect(ref.current.viewDropPoint()).toEqual([-1234, 568, 0]);
});

it('viewDropPoint: a level view (front) falls back to the orbit target on the ground', () => {
  const ref = createRef();
  // The board's box centre (300, 200, 9) is the fitted target.
  render(<CadViewport {...props({ ref, view: 'front' })} />);
  expect(ref.current.viewDropPoint()).toEqual([300, 200, 0]);
  cleanup();
  render(<CadViewport {...props({ ref, view: 'left', perspective: true })} />);
  expect(ref.current.viewDropPoint()).toEqual([300, 200, 0]);
});

it('viewDropPoint: rounds to the Move grid, and to 1 mm when moving freely', () => {
  const ref = createRef();
  const empty = { ...model, parts: [], instances: [] };
  const focusTarget = { position: [1012.6, 487.4, 0], normal: [0, 0, 1], span: 800 };
  const view = render(
    <CadViewport {...props({ ref, model: empty, snapshot: emptySnapshot, view: 'top', focusTarget, moveSnap: 25 })} />,
  );
  expect(ref.current.viewDropPoint()).toEqual([1025, 475, 0]);
  view.rerender(
    <CadViewport {...props({ ref, model: empty, snapshot: emptySnapshot, view: 'top', focusTarget, moveSnap: 0 })} />,
  );
  expect(ref.current.viewDropPoint()).toEqual([1013, 487, 0]);
});

// Phase K (docs/sketch-studio-hole-row.md): a hole row in the viewport.
const rowDraft = () =>
  createOperationDraft({ type: 'hole', model, placement: startPlacement({ type: 'hole', row: true }) });
const rowSeed = () => placeClick(rowDraft(), topClick([100, 100, 18]), ctx);

it('Hole row: the direction stage picks the last hole on the seed plane and draws the rubber row', () => {
  const onPlace = vi.fn();
  render(<CadViewport {...props({ placement: placementView(rowSeed(), ctx), onPlace })} />);
  expect(document.querySelector('.cad-viewport-hint').textContent).toContain('click where the last hole goes');
  pointer('pointermove', viewportEl().cadProject([250.3, 100.2, 18]));
  expect(state()).toMatchObject({ tool: 'hole', stage: 'place', pick: 'path', cut: true });
  expect(state().row).toMatchObject({ seed: true, count: 4, pitch: 50, length: 150 });
  expect(state().layers).toEqual(expect.arrayContaining(['placement-row', 'placement-cursor']));
  expect(document.querySelectorAll('.cad-placement-hud')).toHaveLength(1);
  expect(document.querySelectorAll('.cad-viewport-hint')).toHaveLength(1);
  expect(document.querySelector('.cad-placement-hud').textContent).toContain('4 holes · pitch 50 mm · 150 mm');
  click(viewportEl().cadProject([250.3, 100.2, 18]));
  expect(onPlace).toHaveBeenCalledOnce();
  const info = onPlace.mock.calls[0][0];
  expect(info).toMatchObject({ kind: 'path', step: 1, free: false });
  info.point.forEach((v, i) => expect(v).toBeCloseTo([250, 100, 18][i], 6));
});

it('Hole row: the end square has orthoFrom; a drag re-lays the row live; typed 50 + Enter sends { along: 50 }', () => {
  const shapedRow = placeClick(rowSeed(), { kind: 'path', point: [250, 100, 18], snapKind: 'grid', step: 1 }, ctx);
  const callbacks = { onPlacementDrag: vi.fn(), onPlacementCancelDrag: vi.fn(), onSelect: vi.fn() };
  render(<CadViewport {...props({ placement: placementView(shapedRow, ctx), ...callbacks })} />);
  expect(state().handles.map((h) => h.id)).toEqual(['distance', 'slide', 'radius', 'row-end']);
  const end = state().handles.find((h) => h.id === 'row-end');
  expect(end.orthoFrom).toEqual([100, 100, 18]);
  expect(state().row).toMatchObject({ seed: false, count: 4, pitch: 50, length: 150 });
  expect(state().layers).toEqual(expect.arrayContaining(['placement-row-line', 'placement-row-ticks']));
  pointer('pointerdown', [end.x, end.y], { button: 0 });
  expect(state()).toMatchObject({ dragging: 'row-end', orbit: false });
  pointer('pointermove', viewportEl().cadProject([100.3, 190.2, 18]), { buttons: 1 });
  expect(document.querySelectorAll('.cad-placement-hud')).toHaveLength(1);
  expect(document.querySelector('.cad-placement-hud').textContent).toContain('pitch 30 mm · 4 holes · 90 mm');
  // Esc restores the row and re-enables orbit.
  press('Escape');
  expect(callbacks.onPlacementCancelDrag).toHaveBeenCalledOnce();
  expect(state()).toMatchObject({ dragging: null, orbit: true });
  pointer('pointerdown', [end.x, end.y], { button: 0 });
  pointer('pointermove', viewportEl().cadProject([262, 100, 18]), { buttons: 1 });
  press('5');
  press('0');
  expect(document.querySelector('.cad-placement-hud').textContent).toContain('50');
  press('Enter');
  expect(callbacks.onPlacementDrag).toHaveBeenCalledOnce();
  expect(callbacks.onPlacementDrag.mock.calls[0][0]).toMatchObject({ id: 'row-end', value: { along: 50 } });
  expect(state()).toMatchObject({ dragging: null, orbit: true });
  // A pointer drag hands over the point and how it was snapped.
  pointer('pointerdown', [end.x, end.y], { button: 0 });
  pointer('pointermove', viewportEl().cadProject([100.3, 190.2, 18]), { buttons: 1 });
  pointer('pointerup', viewportEl().cadProject([100.3, 190.2, 18]), { button: 0 });
  const change = callbacks.onPlacementDrag.mock.calls[1][0];
  expect(change).toMatchObject({ id: 'row-end', snapKind: 'grid', step: 1, free: false });
  change.value.forEach((v, i) => expect(v).toBeCloseTo([100, 190, 18][i], 6));
});

it('Move holes: one orange handle per centre of a row; dragging the third hands over its index', () => {
  for (const name of ['setPointerCapture', 'releasePointerCapture'])
    if (!HTMLCanvasElement.prototype[name]) HTMLCanvasElement.prototype[name] = () => {};
  if (!HTMLCanvasElement.prototype.hasPointerCapture) HTMLCanvasElement.prototype.hasPointerCapture = () => false;
  const row = { count: 3, pitch: 40, direction: [1, 0, 0] };
  const rowModel = {
    ...model,
    parts: [
      {
        id: 'board',
        name: 'Board',
        features: [
          {
            id: 'r',
            type: 'hole',
            diameter: 6,
            throughAll: true,
            position: [100, 100, 18],
            direction: [0, 0, -1],
            row,
          },
        ],
      },
    ],
  };
  const centres = [
    [100, 100, 18],
    [140, 100, 18],
    [180, 100, 18],
  ];
  const rowSnapshot = {
    ...snapshot,
    parts: [
      {
        id: 'board',
        bounds: BOUNDS,
        features: {
          r: {
            cut: { position: [100, 100, 18], direction: [0, 0, -1], widthDirection: [1, 0, 0] },
            row: { ...row, centres },
          },
        },
      },
    ],
  };
  const onMoveHole = vi.fn();
  render(
    <CadViewport
      {...props({ model: rowModel, snapshot: rowSnapshot, selectedId: 'board', holeMode: 'move', onMoveHole })}
    />,
  );
  const handles = viewportEl().cadHoleHandles();
  expect(handles.map((h) => [h.featureId, h.index])).toEqual([
    ['r', 0],
    ['r', 1],
    ['r', 2],
  ]);
  handles.forEach((h, i) => h.at.forEach((v, k) => expect(v).toBeCloseTo(centres[i][k], 6)));
  const third = viewportEl().cadProject(centres[2]);
  pointer('pointerdown', third, { button: 0 });
  pointer('pointermove', viewportEl().cadProject([190, 105, 18]), { buttons: 1 });
  pointer('pointerup', viewportEl().cadProject([190, 105, 18]), { button: 0 });
  expect(onMoveHole).toHaveBeenCalledOnce();
  const [id, point, index] = onMoveHole.mock.calls[0];
  expect([id, index]).toEqual(['r', 2]);
  point.forEach((v, k) => expect(v).toBeCloseTo([190, 105, 18][k], 4));
});

it('Hole row: a click on the third centre of a row hands over its feature and index (hardware seats there)', () => {
  const row = { count: 3, pitch: 40, direction: [1, 0, 0] };
  const rowModel = {
    ...model,
    parts: [{ id: 'board', name: 'Board', features: [{ id: 'r', type: 'hole', diameter: 6, depth: 5, row }] }],
  };
  const rowSnapshot = {
    ...snapshot,
    parts: [
      {
        id: 'board',
        bounds: BOUNDS,
        features: {
          r: {
            cut: { position: [150, 100, 18], direction: [0, 0, -1], widthDirection: [1, 0, 0] },
            row: {
              ...row,
              centres: [
                [150, 100, 18],
                [190, 100, 18],
                [230, 100, 18],
              ],
            },
          },
        },
      },
    ],
  };
  const placement = placementView(
    createOperationDraft({
      type: 'hardware',
      model: rowModel,
      placement: startPlacement({ type: 'hardware', hardware: { id: 'hw', type: 'hardware', kind: 'standoff' } }),
    }),
    { model: rowModel, snapshot: rowSnapshot, parameters: {} },
  );
  const onPlace = vi.fn();
  render(<CadViewport {...props({ model: rowModel, snapshot: rowSnapshot, placement, onPlace })} />);
  const at = viewportEl().cadProject([230, 100, 18]);
  pointer('pointermove', [at[0] + 2, at[1] - 1]);
  expect(state().snapKind).toBe('hole centre');
  click([at[0] + 2, at[1] - 1]);
  expect(onPlace.mock.calls[0][0]).toMatchObject({ snapKind: 'hole centre', holeFeatureId: 'r', holeIndex: 2 });
});

// Phase M (docs/sketch-studio-hardware-holes.md): choosing holes for hardware.
it('Hardware: the HUD says chosen over a chosen centre, state().chosen counts, Shift+click and double-click hand over the hole', () => {
  const row = { count: 3, pitch: 40, direction: [1, 0, 0] };
  const rowModel = {
    ...model,
    parts: [{ id: 'board', name: 'Board', features: [{ id: 'r', type: 'hole', diameter: 6, depth: 5, row }] }],
  };
  const centres = [
    [150, 100, 18],
    [190, 100, 18],
    [230, 100, 18],
  ];
  const rowSnapshot = {
    ...snapshot,
    parts: [
      {
        id: 'board',
        bounds: BOUNDS,
        features: {
          r: {
            cut: { position: centres[0], direction: [0, 0, -1], widthDirection: [1, 0, 0] },
            row: { ...row, centres },
          },
        },
      },
    ],
  };
  const ctx2 = { model: rowModel, snapshot: rowSnapshot, parameters: {} };
  const draft = createOperationDraft({
    type: 'hardware',
    model: rowModel,
    placement: startPlacement({ type: 'hardware', hardware: hardwareDefaults('bolt', 'M6') }),
  });
  // Hole 2 of the row already chosen.
  const chosenDraft = placeClick(
    draft,
    {
      kind: 'face',
      planar: true,
      instanceId: 'board',
      partId: 'board',
      point: centres[1],
      normal: [0, 0, 1],
      snapKind: 'hole centre',
      holeFeatureId: 'r',
      holeAttachable: true,
      holeIndex: 1,
    },
    ctx2,
  );
  const placement = placementView(chosenDraft, ctx2);
  const onPlace = vi.fn(),
    onPlacementFinish = vi.fn();
  render(<CadViewport {...props({ model: rowModel, snapshot: rowSnapshot, placement, onPlace, onPlacementFinish })} />);
  expect(state().chosen).toBe(1);
  // The ring at the chosen centre is drawn as the placement ghost.
  expect(state().layers).toContain('placement-ghost');
  const second = viewportEl().cadProject(centres[1]);
  pointer('pointermove', [second[0] + 2, second[1] - 1]);
  expect(state().snapKind).toBe('hole centre');
  expect(document.querySelectorAll('.cad-placement-hud')).toHaveLength(1);
  const hud = document.querySelector('.cad-placement-hud').textContent;
  expect(hud).toContain('hole centre · Hex bolt M6 · Board top · chosen · click to remove');
  const third = viewportEl().cadProject(centres[2]);
  pointer('pointermove', [third[0] + 2, third[1] - 1]);
  expect(document.querySelector('.cad-placement-hud').textContent).toContain('Board top · click to add');
  // Shift+click: the click info says so (a whole row is toggled).
  pointer('pointerdown', [third[0] + 2, third[1] - 1], { button: 0, shiftKey: true });
  pointer('pointerup', [third[0] + 2, third[1] - 1], { button: 0, shiftKey: true });
  expect(onPlace).toHaveBeenCalledOnce();
  expect(onPlace.mock.calls[0][0]).toMatchObject({
    snapKind: 'hole centre',
    holeFeatureId: 'r',
    holeIndex: 2,
    shift: true,
  });
  click([third[0] + 2, third[1] - 1]);
  expect(onPlace.mock.calls[1][0].shift).toBe(false);
  // A double-click on a hole centre finishes with that hole.
  pointer('dblclick', [third[0] + 2, third[1] - 1]);
  expect(onPlacementFinish).toHaveBeenCalledOnce();
  expect(onPlacementFinish.mock.calls[0][0]).toMatchObject({
    snapKind: 'hole centre',
    holeFeatureId: 'r',
    holeIndex: 2,
  });
  // A double-click on the plain face finishes nothing.
  const plain = viewportEl().cadProject([400, 300, 18]);
  click(plain);
  pointer('dblclick', plain);
  expect(onPlacementFinish).toHaveBeenCalledOnce();
});

// Phase M: a real hole's rim is drawn as edges, whose vertices are always
// nearer the pointer than the centre; pointing over the opening still picks
// the hole (for hardware only; Alt places freely).
it('Hardware: pointing just outside a hole rim picks the hole centre, not a rim vertex; Alt does not', () => {
  const at = [200, 150, 18];
  const radius = 6;
  const rim = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2,
      b = ((i + 1) / 24) * Math.PI * 2;
    rim.push(at[0] + radius * Math.cos(a), at[1] + radius * Math.sin(a), 18);
    rim.push(at[0] + radius * Math.cos(b), at[1] + radius * Math.sin(b), 18);
  }
  const holeModel = {
    ...model,
    parts: [{ id: 'board', name: 'Board', features: [{ id: 'h', type: 'hole', diameter: 2 * radius, depth: 5 }] }],
  };
  const holeSnapshot = {
    ...snapshot,
    parts: [
      {
        id: 'board',
        bounds: BOUNDS,
        features: { h: { cut: { position: at, direction: [0, 0, -1], widthDirection: [1, 0, 0] } } },
      },
    ],
    instances: [{ ...board, edges: { lines: [...boxEdges(...BOUNDS), ...rim] } }],
  };
  const hctx = { model: holeModel, snapshot: holeSnapshot, parameters: {} };
  const draftOf = (type) =>
    createOperationDraft({
      type,
      model: holeModel,
      placement: startPlacement({ type, hardware: hardwareDefaults('bolt', 'M6') }),
    });
  const onPlace = vi.fn();
  const view = render(
    <CadViewport
      {...props({
        model: holeModel,
        snapshot: holeSnapshot,
        placement: placementView(draftOf('hardware'), hctx),
        onPlace,
      })}
    />,
  );
  // Just outside the rim (the nearest rim vertex is ~1 mm away, the centre 7 mm).
  const outside = viewportEl().cadProject([at[0] + radius + 1, at[1], 18]);
  pointer('pointermove', outside);
  expect(state().snapKind).toBe('hole centre');
  state().hover.point.forEach((v, i) => expect(v).toBeCloseTo(at[i], 6));
  click(outside);
  expect(onPlace.mock.calls[0][0]).toMatchObject({
    kind: 'face',
    planar: true,
    instanceId: 'board',
    snapKind: 'hole centre',
    holeFeatureId: 'h',
    holeAttachable: true,
    holeIndex: 0,
    normal: [0, 0, 1],
  });
  // Alt: free placement, no snapping at all.
  pointer('pointermove', outside, { altKey: true });
  expect(state().snapKind).toBe('face');
  // The Hole tool keeps the ordinary candidates (the rim vertex wins there).
  view.rerender(
    <CadViewport
      {...props({ model: holeModel, snapshot: holeSnapshot, placement: placementView(draftOf('hole'), hctx), onPlace })}
    />,
  );
  pointer('pointermove', outside);
  expect(state().snapKind).toBe('vertex');
});

it('Hole row: digits + Enter in the direction stage set the spacing along the hovered direction', () => {
  const onPlace = vi.fn();
  render(<CadViewport {...props({ placement: placementView(rowSeed(), ctx), onPlace })} />);
  // Nothing typed: Enter is left to the workspace (the default row).
  press('Enter');
  expect(onPlace).not.toHaveBeenCalled();
  pointer('pointermove', viewportEl().cadProject([100.4, 180.3, 18]));
  press('2');
  press('0');
  expect(state().row.typed).toBe('20');
  expect(document.querySelectorAll('.cad-placement-hud')).toHaveLength(1);
  expect(document.querySelector('.cad-placement-hud').textContent).toContain('Spacing 20 mm · Enter applies');
  press('Enter');
  expect(onPlace).toHaveBeenCalledOnce();
  const info = onPlace.mock.calls[0][0];
  expect(info).toMatchObject({ kind: 'path', along: 20 });
  info.direction.forEach((v, i) => expect(v).toBeCloseTo([0, 1, 0][i], 9));
});
