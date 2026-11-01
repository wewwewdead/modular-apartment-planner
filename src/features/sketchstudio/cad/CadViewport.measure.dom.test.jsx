// @vitest-environment jsdom
// The Measure tool in the viewport: two clicks make a mark (anchored to the
// part), Esc clears the first point, labels follow the parts and select a
// mark, Show marks hides them, and a dragged part box-snaps to mark points.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { createRef } from 'react';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import CadViewport from './CadViewport.jsx';

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
      static current;
      constructor() {
        super();
        TransformControls.current = this;
      }
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
  // jsdom lays nothing out: a square canvas at the page origin, sized so the
  // view fit renders (and places the labels) as in a browser.
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
const item = (id, min, max) => ({
  id,
  partId: id,
  bounds: [min, max],
  mesh: boxMesh(min, max),
  edges: { lines: boxEdges(min, max) },
  placement: [{ translation: [0, 0, 0] }],
});
const board = item('board', [0, 0, 0], [600, 400, 18]);
const tube = item('tube', [700, 500, 0], [740, 540, 700]);
const modelOf = (...ids) => ({
  parts: ids.map((id) => ({ id, name: id, features: [] })),
  instances: ids.map((id) => ({ id, partId: id, position: [0, 0, 0], rotation: [0, 0, 0] })),
  connections: [],
});
const props = (extra) => ({
  model: modelOf('board'),
  snapshot: { parts: [], instances: [board] },
  ready: true,
  view: 'top',
  onSelect: vi.fn(),
  ...extra,
});
const widthMark = {
  id: 'm1',
  from: { instanceId: 'board', local: [0, 0, 18] },
  to: { instanceId: 'board', local: [600, 0, 18] },
  along: 'aligned',
  offset: [0, -30, 0],
};

const canvas = () => document.querySelector('canvas');
const viewport = () => document.querySelector('.cad-viewport');
const pointer = (type, [clientX, clientY], init = {}) =>
  act(() => canvas().dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, ...init })));
const click = (at) => {
  pointer('pointerdown', at, { button: 0 });
  pointer('pointerup', at, { button: 0 });
};
const close = (actual, expected, digits = 6) => expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));

it('makes a mark from two clicks, anchored to the part, and never selects', () => {
  const ref = createRef();
  const onMeasure = vi.fn(),
    onSelect = vi.fn();
  render(<CadViewport {...props({ ref, onMeasure, onSelect, measureMode: true })} />);
  const hint = () => document.querySelector('.cad-viewport-hint').textContent;
  expect(hint()).toContain('Measure: click the first point');
  // A click on nothing is ignored.
  click([5, 5]);
  expect(ref.current.measureState().first).toBeNull();
  expect(hint()).toContain('Point at a part');
  // Near a top corner: the corner itself (nearest the camera of the two that line up).
  const [x0, y0] = viewport().cadProject([0, 0, 18]);
  click([x0 + 3, y0 - 2]);
  expect(ref.current.measureState().first).toEqual([0, 0, 18]);
  expect(hint()).toContain('Click the second point');
  expect(viewport().cadMarks()).toMatchObject({ measuring: true, first: [0, 0, 18], snapKind: 'vertex' });
  // The readout shows distance and deltas once the cursor reaches the other corner.
  const far = viewport().cadProject([600, 0, 18]);
  pointer('pointermove', far);
  const hud = document.querySelector('.cad-measure-hud');
  expect(hud.hidden).toBe(false);
  expect(hud.textContent).toBe('600 mm · ΔX 600 · ΔY 0 · ΔZ 0 · vertex');
  // The same point twice is not a mark.
  click([x0, y0]);
  expect(onMeasure).not.toHaveBeenCalled();
  click(far);
  expect(onMeasure).toHaveBeenCalledOnce();
  const { from, to, fromWorld, toWorld } = onMeasure.mock.calls[0][0];
  expect(from.instanceId).toBe('board');
  expect(to.instanceId).toBe('board');
  close(from.local, [0, 0, 18]);
  close(to.local, [600, 0, 18]);
  expect(fromWorld).toEqual([0, 0, 18]);
  expect(toWorld).toEqual([600, 0, 18]);
  expect(ref.current.measureState().first).toBeNull();
  expect(onSelect).not.toHaveBeenCalled();
});

it('anchors in the part frame of a moved part and clears the first point on cancel', () => {
  const ref = createRef();
  const onMeasure = vi.fn();
  const moved = modelOf('board');
  moved.instances[0].position = [100, 50, 0];
  // The worker has not rebuilt: the old mesh is shown moved by (100, 50, 0).
  render(<CadViewport {...props({ ref, onMeasure, measureMode: true, model: moved })} />);
  click(viewport().cadProject([700, 50, 18]));
  expect(ref.current.measureState().first).toEqual([700, 50, 18]);
  act(() => ref.current.cancelMeasure());
  expect(ref.current.measureState().first).toBeNull();
  expect(document.querySelector('.cad-viewport-hint').textContent).toContain('Measure: click the first point');
  click(viewport().cadProject([700, 50, 18]));
  click(viewport().cadProject([700, 450, 18]));
  const { from, to } = onMeasure.mock.calls[0][0];
  close(from.local, [600, 0, 18]);
  close(to.local, [600, 400, 18]);
});

it('selects as usual when not measuring', () => {
  const onSelect = vi.fn();
  render(<CadViewport {...props({ onSelect })} />);
  click(viewport().cadProject([300, 200, 18]));
  expect(onSelect).toHaveBeenCalledWith('board');
  expect(document.querySelector('.cad-measure-hud').hidden).toBe(true);
  expect(viewport().cadMarks().measuring).toBe(false);
});

it('labels each drawn mark, follows the part and selects on click', () => {
  const ref = createRef();
  const onSelectMark = vi.fn(),
    onSelect = vi.fn();
  const missing = { ...widthMark, id: 'gone', to: { instanceId: 'deleted', local: [0, 0, 0] } };
  const { rerender } = render(
    <CadViewport {...props({ ref, onSelect, onSelectMark, marks: [widthMark, missing], selectedMarkId: null })} />,
  );
  const labels = () => [...document.querySelectorAll('.cad-mark-label')];
  expect(labels().map((l) => [l.textContent, l.dataset.markId, l.hidden])).toEqual([['600', 'm1', false]]);
  // Centred on the dimension line's midpoint (300, -30, 18).
  const [cx, cy] = viewport().cadProject([300, -30, 18]);
  expect(viewport().cadMarks().labels).toEqual([{ id: 'm1', text: '600', x: cx, y: cy, selected: false }]);
  expect(labels()[0].style.left).toBe(`${cx}px`);
  act(() => labels()[0].click());
  expect(onSelectMark).toHaveBeenCalledWith('m1');
  expect(onSelect).not.toHaveBeenCalled();
  // Selected: orange label.
  rerender(<CadViewport {...props({ ref, onSelect, onSelectMark, marks: [widthMark], selectedMarkId: 'm1' })} />);
  expect(labels()[0].classList.contains('is-selected')).toBe(true);
  // The part moves (committed before the rebuild): the mark goes with it.
  const moved = modelOf('board');
  moved.instances[0].position = [100, 0, 0];
  rerender(<CadViewport {...props({ ref, onSelectMark, marks: [widthMark], model: moved, ready: false })} />);
  const [mx, my] = viewport().cadProject([400, -30, 18]);
  expect(viewport().cadMarks().labels[0]).toMatchObject({ x: mx, y: my });
  expect(ref.current.getMarkPoints()).toEqual([
    [100, 0, 18],
    [700, 0, 18],
    [400, 0, 18],
  ]);
  // Show marks off: nothing drawn, nothing to snap to.
  rerender(<CadViewport {...props({ ref, onSelectMark, marks: [widthMark], hideMarks: true })} />);
  expect(labels()).toEqual([]);
  expect(ref.current.getMarkPoints()).toEqual([]);
  // A hidden part hides its marks.
  const hidden = modelOf('board');
  hidden.instances[0].visible = false;
  rerender(<CadViewport {...props({ ref, onSelectMark, marks: [widthMark], model: hidden })} />);
  expect(labels()).toEqual([]);
});

it('reports live poses and the scene span for a new mark offset', () => {
  const ref = createRef();
  render(<CadViewport {...props({ ref })} />);
  const poses = ref.current.getGroupPoses();
  expect([...poses.keys()]).toEqual(['board']);
  expect(poses.get('board').bounds).toEqual([
    [0, 0, 0],
    [600, 400, 18],
  ]);
  expect(poses.get('board').visible).toBe(true);
  expect(poses.get('board').matrix).toBeInstanceOf(THREE.Matrix4);
  expect(ref.current.getSceneSpan()).toBeCloseTo(Math.hypot(600, 400, 18), 6);
});

it('snaps a dragged part box onto a mark point', () => {
  const onMove = vi.fn();
  render(
    <CadViewport
      {...props({
        model: modelOf('board', 'tube'),
        snapshot: { parts: [], instances: [board, tube] },
        selectedId: 'tube',
        moveEnabled: true,
        onMove,
        marks: [widthMark],
      })}
    />,
  );
  const transform = TransformControls.current;
  act(() => {
    transform.dispatchEvent({ type: 'mouseDown' });
    // The tube's right face (x 740) to 604: 4 mm short of the mark end at x 600.
    transform.object.position.add(new THREE.Vector3(-136, 0, 0));
    transform.dispatchEvent({ type: 'objectChange' });
  });
  expect(document.querySelector('.cad-gizmo-hud').textContent).toContain('· mark');
  act(() => transform.dispatchEvent({ type: 'mouseUp' }));
  expect(onMove).toHaveBeenCalledExactlyOnceWith('tube', [-140, 0, 0]);
});

it('places a hole exactly on a nearby mark point, dropped onto the clicked face', () => {
  const onPlaceHole = vi.fn();
  const lowMark = { ...widthMark, id: 'low', from: { instanceId: 'board', local: [0, 0, 0] } };
  render(<CadViewport {...props({ selectedId: 'board', holeMode: 'place', onPlaceHole, marks: [lowMark] })} />);
  // Near the mark's midpoint (300, 0, 9), on the top face: the hole goes to (300, 0, 18).
  click(viewport().cadProject([301, 3, 18]));
  expect(onPlaceHole).toHaveBeenCalledOnce();
  const [point, normal, , options] = onPlaceHole.mock.calls[0];
  close(point, [300, 0, 18]);
  close(normal.map(Math.abs), [0, 0, 1]);
  expect(options).toEqual({ exact: true });
  // Away from any mark point: the surface point, grid-snapped later by the workspace.
  click(viewport().cadProject([200, 200, 18]));
  expect(onPlaceHole.mock.calls[1]).toHaveLength(3);
  close(onPlaceHole.mock.calls[1][0], [200, 200, 18]);
});
