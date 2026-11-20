// @vitest-environment jsdom
// Cut's picker in the viewport (docs/sketch-studio-cut-pick.md §4.2): a click
// inside a ready outline on the ground reports its sketch id, a part in front
// takes the click as before, a miss changes nothing, an open tool keeps its
// clicks, the cursor says an outline can be clicked; with no pick callback
// (Draw) every click is as before.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import CadViewport from './CadViewport.jsx';
import { emptyModel } from './model.js';
import { shopOutlineView } from './shopRoute.js';

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

const SIZE = 600;
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
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
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
const runFrames = () =>
  act(() => {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(performance.now()));
  });

function boxMesh([x0, y0, z0], [x1, y1, z1]) {
  const vertices = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) vertices.push(x, y, z);
  return {
    vertices,
    normals: vertices.map(() => 0),
    triangles: [
      0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3,
    ],
  };
}
// A board standing over the outline "Under"; "Plate" with a 40 mm cut-out beside it; an open line.
const board = {
  id: 'board',
  partId: 'board',
  bounds: [
    [0, 0, 0],
    [100, 100, 20],
  ],
  mesh: boxMesh([0, 0, 0], [100, 100, 20]),
  edges: { lines: [0, 0, 0, 100, 100, 20] },
  placement: [{ translation: [0, 0, 0] }],
};
const outlineModel = {
  ...emptyModel(),
  sketches: [
    {
      id: 'under',
      name: 'Under',
      plane: 'XY',
      profile: { type: 'rectangle', width: 80, height: 80, origin: [10, 10] },
    },
    {
      id: 'plate',
      name: 'Plate',
      plane: 'XY',
      profile: {
        type: 'polygon',
        points: [
          [200, 0],
          [320, 0],
          [320, 100],
          [200, 100],
        ],
        holes: [
          {
            type: 'polygon',
            points: [
              [240, 30],
              [280, 30],
              [280, 70],
              [240, 70],
            ],
          },
        ],
      },
    },
    {
      id: 'open',
      name: 'Open',
      plane: 'XY',
      entities: [{ id: 'l', type: 'line', a: [400, 0], b: [500, 100] }],
      profile: null,
    },
  ],
};
const model = {
  ...emptyModel(),
  parts: [{ id: 'board', name: 'Board', features: [{ id: 'f', type: 'box' }] }],
  instances: [{ id: 'board', partId: 'board', position: [0, 0, 0], rotation: [0, 0, 0] }],
};
const outlines = shopOutlineView(outlineModel, {}, ['plate']);
const props = (extra = {}) => ({
  model,
  snapshot: { parts: [], instances: [board] },
  ready: true,
  view: 'top',
  onSelect: vi.fn(),
  selectedId: null,
  shopOutlines: outlines,
  ...extra,
});
const canvas = () => document.querySelector('canvas');
const viewport = () => document.querySelector('.cad-viewport');
const pointer = (type, [clientX, clientY], init = {}) =>
  act(() => canvas().dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, ...init })));
const click = (at, init = {}) => {
  pointer('pointerdown', at, { button: 0, ...init });
  pointer('pointerup', at, { button: 0, ...init });
};
const at = (x, y) => viewport().cadProject([x, y, 0]);

it('reads the outlines it is handed: the ready ones pickable, the open line not', () => {
  expect(outlines.map((o) => [o.id, o.ready, o.chosen])).toEqual([
    ['under', true, false],
    ['plate', true, true],
    ['open', false, false],
  ]);
});

it('toggles the outline under a click; a part in front takes the click; a miss changes nothing', () => {
  const onSelect = vi.fn(),
    onPickOutline = vi.fn();
  render(<CadViewport {...props({ onSelect, onPickOutline })} />);
  click(at(215, 50));
  expect(onPickOutline).toHaveBeenLastCalledWith('plate');
  // Inside the cut-out is still the drawing (its outline and cut-outs are one thing).
  click(at(260, 50));
  expect(onPickOutline).toHaveBeenLastCalledWith('plate');
  expect(onPickOutline).toHaveBeenCalledTimes(2);
  expect(onSelect).not.toHaveBeenCalled();
  // The board stands over "Under": the part takes the click, as today.
  click(at(50, 50));
  expect(onSelect).toHaveBeenLastCalledWith('board');
  expect(onPickOutline).toHaveBeenCalledTimes(2);
  // Off every outline and part, or on the open line: nothing (the picker stays open).
  onSelect.mockClear();
  click(at(160, 300));
  click(at(450, 50));
  expect(onSelect).not.toHaveBeenCalled();
  expect(onPickOutline).toHaveBeenCalledTimes(2);
  // A drag is no click.
  pointer('pointerdown', at(215, 50), { button: 0 });
  pointer(
    'pointerup',
    at(260, 50).map((v) => v + 30),
    { button: 0 },
  );
  expect(onPickOutline).toHaveBeenCalledTimes(2);
  // The browser checks' probe agrees.
  const [x, y] = at(215, 50);
  expect(viewport().cadOutlineAt(x, y)).toBe('plate');
  expect(viewport().cadOutlineAt(...at(50, 50))).toBe(null);
});

it('says an outline can be clicked with the cursor, once per frame, and puts it back', () => {
  render(<CadViewport {...props({ onPickOutline: vi.fn() })} />);
  pointer('pointermove', at(215, 50));
  pointer('pointermove', at(216, 50));
  expect(frames).toHaveLength(1);
  runFrames();
  expect(canvas().style.cursor).toBe('pointer');
  pointer('pointermove', at(50, 50));
  runFrames();
  expect(canvas().style.cursor).toBe('');
  pointer('pointermove', at(215, 50));
  runFrames();
  pointer('pointerleave', at(215, 50));
  expect(canvas().style.cursor).toBe('');
});

it('leaves an open tool its clicks', () => {
  const onSelect = vi.fn(),
    onPickOutline = vi.fn(),
    onMeasure = vi.fn();
  render(<CadViewport {...props({ onSelect, onPickOutline, onMeasure, measureMode: true })} />);
  click(at(215, 50));
  expect(onPickOutline).not.toHaveBeenCalled();
});

it('with no pick callback (Draw) draws the same outlines and every click is as before', () => {
  const onSelect = vi.fn();
  const { rerender } = render(<CadViewport {...props({ onSelect })} />);
  expect(viewport().cadViewMode().shopOutlines).toBe(3);
  click(at(215, 50));
  expect(onSelect).toHaveBeenLastCalledWith(null);
  pointer('pointermove', at(215, 50));
  runFrames();
  expect(canvas().style.cursor).toBe('');
  expect(viewport().cadOutlineAt(...at(215, 50))).toBe(null);
  // The callback taken away (the picker closed): its cursor goes with it.
  const onPickOutline = vi.fn();
  rerender(<CadViewport {...props({ onSelect, onPickOutline })} />);
  pointer('pointermove', at(215, 50));
  runFrames();
  expect(canvas().style.cursor).toBe('pointer');
  rerender(<CadViewport {...props({ onSelect })} />);
  expect(canvas().style.cursor).toBe('');
  click(at(215, 50));
  expect(onPickOutline).not.toHaveBeenCalled();
});
