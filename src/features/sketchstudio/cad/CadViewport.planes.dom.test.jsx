// @vitest-environment jsdom
// Origin plane tiles in the viewport (Phase I, docs/sketch-studio-start-sketch.md
// §4.2–4.3): shown only when asked, hover highlights a tile (rAF-throttled)
// and says which plane, a click or a label click picks the plane, a drag
// never does; while picking, the nearest of the model and the tiles wins,
// a flat face is outlined and picked, a curved face only says so.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import CadViewport from './CadViewport.jsx';
import { CURVED_HINT, PICK_HINT, REST_HINT } from './originPlanes.js';

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

// A viewport about the shape of the real one.
const WIDTH = 960,
  HEIGHT = 600;
let frames = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  // Hover waits for an animation frame; the test runs them by hand.
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', (id) => {
    frames[id - 1] = null;
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: WIDTH, height: HEIGHT }),
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(HEIGHT);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const flush = () =>
  act(() => {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback?.(0));
  });

// A box mesh as the kernel sends it: every face its own vertices and normals.
function boxMesh([x0, y0, z0], [x1, y1, z1], { curvedTop = false } = {}) {
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
    corners.forEach((c, i) => {
      vertices.push(...c);
      // A "curved" top: vertex normals that lean away from the flat triangle normal.
      normals.push(...(curvedTop && f === 0 ? [i % 2 ? 0.3 : -0.3, 0, 0.95] : normal));
    });
    triangles.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  return { vertices, normals, triangles };
}
const BOUNDS = [
  [0, 0, 0],
  [600, 400, 18],
];
const boardSnapshot = (options) => ({
  parameters: {},
  parts: [{ id: 'board', bounds: BOUNDS }],
  instances: [
    {
      id: 'board',
      partId: 'board',
      bounds: BOUNDS,
      mesh: boxMesh(...BOUNDS, options),
      edges: { lines: [] },
      placement: [{ translation: [0, 0, 0] }],
    },
  ],
});
const boardModel = {
  parameters: [],
  sketches: [],
  marks: [],
  parts: [{ id: 'board', name: 'Board / plate', features: [] }],
  instances: [{ id: 'board', partId: 'board', position: [0, 0, 0], rotation: [0, 0, 0] }],
  connections: [],
};
const emptyModel = { parameters: [], sketches: [], marks: [], parts: [], instances: [], connections: [] };
const emptySnapshot = { parameters: {}, parts: [], instances: [] };

const canvas = () => document.querySelector('canvas');
const viewportEl = () => document.querySelector('.cad-viewport');
const planes = () => viewportEl().cadPlanes();
const hint = () => document.querySelector('.cad-viewport-hint').textContent;
const chip = (plane) => document.querySelector(`.cad-plane-label[data-plane="${plane}"]`);
const at = (point) => viewportEl().cadProject(point);
const pointer = (type, [clientX, clientY], init = {}) =>
  act(() => canvas().dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, ...init })));
const hover = (point) => {
  pointer('pointermove', at(point));
  flush();
};
const click = (screen) => {
  pointer('pointerdown', screen, { button: 0 });
  pointer('pointerup', screen, { button: 0 });
};
const props = (extra) => ({
  model: emptyModel,
  snapshot: emptySnapshot,
  ready: true,
  view: 'isometric',
  onSelect: vi.fn(),
  onPickSketchPlane: vi.fn(),
  onPickSketchFace: vi.fn(),
  planes: { visible: true, offset: 0 },
  ...extra,
});

it('reports three tiles and three labels only when the planes are visible', () => {
  const { rerender } = render(<CadViewport {...props({ planes: { visible: false, offset: 0 } })} />);
  expect(planes()).toMatchObject({ visible: false, hovered: null, tiles: {} });
  expect([...document.querySelectorAll('.cad-plane-label')].every((c) => c.hidden)).toBe(true);
  expect(hint()).not.toContain(REST_HINT);
  rerender(<CadViewport {...props()} />);
  const state = planes();
  expect(state).toMatchObject({ visible: true, size: 400, offset: 0, hovered: null });
  expect(Object.keys(state.tiles)).toEqual(['XY', 'XZ', 'YZ']);
  expect(state.tiles.XZ[2]).toEqual([200, 0, 200]);
  // One container, one chip per tile, named for the plane.
  expect(document.querySelectorAll('.cad-plane-labels')).toHaveLength(1);
  expect(
    [...document.querySelectorAll('.cad-plane-label')].map((c) => [c.dataset.plane, c.textContent, c.hidden]),
  ).toEqual([
    ['XY', 'Top · XY', false],
    ['XZ', 'Front · XZ', false],
    ['YZ', 'Right · YZ', false],
  ]);
  // Mark labels are a separate container (scripts count them).
  expect(document.querySelector('.cad-mark-labels').children).toHaveLength(0);
  expect(hint()).toContain(REST_HINT);
});

it('hovers a tile once per frame, highlights it and its label, and a click picks it (never selects)', () => {
  const p = props();
  render(<CadViewport {...p} />);
  // Top's unoccluded quarter from the default isometric view (+x / −y).
  const top = at([120, -120, 0]);
  pointer('pointermove', top);
  pointer('pointermove', [top[0] + 1, top[1]]);
  expect(frames).toHaveLength(1);
  expect(planes().hovered).toBeNull();
  flush();
  expect(planes().hovered).toBe('XY');
  expect(hint()).toContain('Sketch on Top (XY) · click to start');
  expect(chip('XY').classList.contains('is-hovered')).toBe(true);
  expect(canvas().style.cursor).toBe('pointer');
  click(top);
  expect(p.onPickSketchPlane).toHaveBeenCalledWith('XY', 0);
  expect(p.onSelect).not.toHaveBeenCalled();
  // Leaving the canvas clears the hover.
  hover([120, -120, 0]);
  act(() => canvas().dispatchEvent(new MouseEvent('pointerleave')));
  expect(planes().hovered).toBeNull();
  expect(hint()).toContain(REST_HINT);
});

it('a drag that starts on a tile orbits instead of picking', () => {
  const p = props();
  render(<CadViewport {...p} />);
  const front = at([120, 0, 120]);
  pointer('pointerdown', front, { button: 0 });
  pointer('pointermove', [front[0] + 30, front[1]], { buttons: 1 });
  pointer('pointerup', [front[0] + 60, front[1]], { button: 0 });
  flush();
  expect(p.onPickSketchPlane).not.toHaveBeenCalled();
  expect(p.onSelect).not.toHaveBeenCalled();
});

it('the offset moves every tile along its own axis; a label hover and click use it', () => {
  const p = props({ sketchMode: 'pick', planes: { visible: true, offset: 50 } });
  render(<CadViewport {...p} />);
  const { tiles, offset } = planes();
  expect(offset).toBe(50);
  expect(tiles.XZ.every((c) => c[1] === 50)).toBe(true);
  expect(tiles.XY.every((c) => c[2] === 50)).toBe(true);
  expect(tiles.YZ.every((c) => c[0] === 50)).toBe(true);
  hover([120, 50, 120]);
  expect(planes().hovered).toBe('XZ');
  expect(hint()).toContain('Sketch on Front (XZ, +50 mm) · click to start');
  act(() => chip('YZ').dispatchEvent(new MouseEvent('pointerenter')));
  expect(planes().hovered).toBe('YZ');
  expect(hint()).toContain('Sketch on Right (YZ, +50 mm)');
  act(() => chip('YZ').click());
  expect(p.onPickSketchPlane).toHaveBeenCalledWith('YZ', 50);
});

it('picking with a part: tiles sized to the model, nearest hit wins, flat faces outline and pick', () => {
  const p = props({ model: boardModel, snapshot: boardSnapshot(), sketchMode: 'pick' });
  render(<CadViewport {...p} />);
  expect(planes().size).toBe(300);
  expect(hint()).toContain(PICK_HINT);
  // The top face where no tile is in front of it.
  hover([450, 200, 18]);
  expect(planes()).toMatchObject({ hovered: null, outline: 4 });
  expect(hint()).toContain('Sketch on this face of Board / plate · click to start');
  // Near the origin the Front tile (y = 0) is in front of the top face.
  hover([60, 50, 18]);
  expect(planes()).toMatchObject({ hovered: 'XZ', outline: 0 });
  // The board's front face lies in the Front tile's plane: the face wins the tie.
  hover([100, 0, 9]);
  expect(planes()).toMatchObject({ hovered: null, outline: 4 });
  click(at([450, 200, 18]));
  expect(p.onPickSketchFace).toHaveBeenCalledOnce();
  const info = p.onPickSketchFace.mock.calls[0][0];
  expect(info).toMatchObject({ planar: true, instanceId: 'board', partId: 'board' });
  expect(info.frame.origin).toEqual([0, 0, 18]);
  expect(p.onPickSketchPlane).not.toHaveBeenCalled();
  expect(p.onSelect).not.toHaveBeenCalled();
  // A tile in front picks the plane.
  click(at([60, 50, 18]));
  expect(p.onPickSketchPlane).toHaveBeenCalledWith('XZ', 0);
});

it('a curved face only says so', () => {
  const p = props({ model: boardModel, snapshot: boardSnapshot({ curvedTop: true }), sketchMode: 'pick' });
  render(<CadViewport {...p} />);
  hover([450, 200, 18]);
  expect(planes().outline).toBe(0);
  expect(hint()).toContain(CURVED_HINT);
  click(at([450, 200, 18]));
  expect(p.onPickSketchFace).not.toHaveBeenCalled();
  expect(hint()).toContain(CURVED_HINT);
});

it('a mate pick keeps its own hint, no tiles and no face hover', () => {
  const p = props({
    model: boardModel,
    snapshot: boardSnapshot(),
    sketchMode: 'pick',
    planes: { visible: false, offset: 0 },
    pickHint: 'Mate: click a flat face on the part to move · Esc cancels',
  });
  render(<CadViewport {...p} />);
  hover([450, 200, 18]);
  expect(planes()).toMatchObject({ visible: false, hovered: null, outline: 0 });
  expect(hint()).toContain('Mate: click a flat face on the part to move');
  click(at([450, 200, 18]));
  // The mate flow still gets every face click.
  expect(p.onPickSketchFace).toHaveBeenCalledOnce();
});
