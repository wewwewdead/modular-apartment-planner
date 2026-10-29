// @vitest-environment jsdom
// The rotate dial in the viewport: the part follows the cursor around the
// pivot, Alt frees the snap, the swept sector and start-pose ghost, Local
// space, cancel paths, HUD clamping and the picked pivot.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import CadViewport from './CadViewport.jsx';
import { instanceOrientation } from './movement.js';

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
      axis = null;
      dragging = false;
      spaces = [];
      sizes = [];
      constructor() {
        super();
        TransformControls.current = this;
      }
      getHelper() {
        return new Object3D();
      }
      setMode() {}
      setSpace(space) {
        this.spaces.push(space);
      }
      setSize(size) {
        this.sizes.push(size);
      }
      setTranslationSnap() {}
      setRotationSnap(snap) {
        this.rotationSnap = snap;
      }
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
  // jsdom lays nothing out: a square canvas at the page origin (the camera
  // keeps aspect 1 because jsdom never resizes it).
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: SIZE, height: SIZE }),
  );
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
const legMin = [1400, 0, 0],
  legMax = [1460, 60, 726],
  centre = [1430, 30, 363];
const snapshot = {
  parts: [],
  instances: [
    {
      id: 'leg',
      partId: 'leg',
      bounds: [legMin, legMax],
      mesh: boxMesh(legMin, legMax),
      edges: { lines: [1400, 0, 0, 1460, 0, 0, 1400, 0, 0, 1400, 60, 0] },
      placement: [{ translation: [0, 0, 0] }],
    },
  ],
};
const modelWith = (rotation = [0, 0, 0]) => ({
  parts: [{ id: 'leg', name: 'Leg', features: [] }],
  instances: [{ id: 'leg', partId: 'leg', position: [0, 0, 0], rotation }],
  connections: [],
});
const props = (extra) => ({
  model: modelWith(),
  snapshot,
  ready: true,
  selectedId: 'leg',
  moveEnabled: true,
  transformMode: 'rotate',
  view: 'top',
  onSelect: vi.fn(),
  ...extra,
});

const hud = () => document.querySelector('.cad-gizmo-hud');
const canvas = () => document.querySelector('canvas');
const viewport = () => document.querySelector('.cad-viewport');
const pointer = (type, [clientX, clientY], init = {}) =>
  act(() => canvas().dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, ...init })));
// Top view: screen right is +X, screen up is +Y. A point `degrees`
// counter-clockwise (on screen) round the projected pivot, 100 px out.
const around = (degrees, pivot = viewport().cadGizmo().pivot) => {
  const [px, py] = viewport().cadProject(pivot);
  return [px + 100 * Math.cos((degrees * Math.PI) / 180), py - 100 * Math.sin((degrees * Math.PI) / 180)];
};
function grab(axis, at) {
  pointer('pointermove', at);
  const transform = TransformControls.current;
  transform.axis = axis;
  act(() => transform.dispatchEvent({ type: 'mouseDown' }));
  return transform;
}
const sweep = (from, to, init) => {
  const step = Math.sign(to - from) * 5;
  for (let d = from + step; step > 0 ? d <= to : d >= to; d += step) pointer('pointermove', around(d), init);
};
const scene = () => TransformControls.current.object.parent;
const leg = () =>
  scene()
    .getObjectsByProperty('isGroup', true)
    .find((g) => g.userData.instanceId === 'leg');
const axisAngle = (axis, degrees) =>
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), (degrees * Math.PI) / 180).toArray();
const same = (a, b) => expect(Math.abs(new THREE.Quaternion(...a).dot(new THREE.Quaternion(...b)))).toBeCloseTo(1, 9);

it('turns the part by the angle the cursor sweeps and commits that quaternion', () => {
  const onRotate = vi.fn();
  render(<CadViewport {...props({ onRotate })} />);
  // The dial snaps by itself; TransformControls' tangent snap is off.
  expect(TransformControls.current.rotationSnap).toBeNull();
  expect(TransformControls.current.sizes.at(-1)).toBe(1);
  const transform = grab('Z', around(0));
  expect(hud().textContent).toContain('0.0° about Z · snap 15°');
  sweep(0, 50);
  // TransformControls writing its own angle is overruled by the dial.
  act(() => {
    transform.object.quaternion.set(0.3, 0.1, 0.2, 0.9).normalize();
    transform.dispatchEvent({ type: 'objectChange' });
  });
  same(transform.object.quaternion.toArray(), axisAngle([0, 0, 1], 45));
  sweep(50, 90);
  expect(hud().textContent).toContain('+90.0° about Z');
  // The displayed leg turned 90° about its centre: its +X edge now points +Y.
  const turned = new THREE.Vector3(1, 0, 0).applyQuaternion(leg().quaternion);
  turned.toArray().forEach((v, i) => expect(v).toBeCloseTo([0, 1, 0][i], 9));
  act(() => transform.dispatchEvent({ type: 'mouseUp' }));
  expect(onRotate).toHaveBeenCalledOnce();
  const [id, turn, center] = onRotate.mock.calls[0];
  expect(id).toBe('leg');
  same(turn, axisAngle([0, 0, 1], 90));
  expect(center).toEqual(centre);
  expect(transform.object.quaternion.toArray()).toEqual([0, 0, 0, 1]);
});

it('keeps counting past 180° and a full circle back commits nothing', () => {
  const onRotate = vi.fn();
  render(<CadViewport {...props({ onRotate })} />);
  const transform = grab('Z', around(0));
  sweep(0, 270);
  expect(hud().textContent).toContain('+270.0° about Z');
  sweep(270, 360);
  expect(hud().textContent).toContain('+360.0° about Z');
  // A second turn keeps counting (not -345°).
  sweep(360, 375);
  expect(hud().textContent).toContain('+375.0° about Z');
  sweep(375, 360);
  act(() => transform.dispatchEvent({ type: 'mouseUp' }));
  expect(onRotate).not.toHaveBeenCalled();
});

it('turns freely while Alt is held and snaps again when it is released', () => {
  render(<CadViewport {...props({ onRotate: vi.fn() })} />);
  grab('Z', around(0));
  sweep(0, 35);
  pointer('pointermove', around(37), { altKey: true });
  expect(hud().textContent).toContain('+37.0° about Z · free · Alt');
  act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false })));
  expect(hud().textContent).toContain('+30.0° about Z · snap 15°');
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true })));
  expect(hud().textContent).toContain('+37.0° about Z · free · Alt');
});

it('draws the swept sector and a ghost of the start pose, then clears them', () => {
  render(<CadViewport {...props({ onRotate: vi.fn() })} />);
  const edges = leg().children[1];
  const disposed = vi.fn();
  edges.geometry.addEventListener('dispose', disposed);
  const start = leg().matrix.clone();
  const transform = grab('Z', around(0));
  sweep(0, 60);
  const layer = scene().children.find((g) => g.children.some((c) => c.name === 'rotate-ghost'));
  const byName = (name) => layer.children.find((c) => c.name === name);
  expect(layer.children.map((c) => c.name)).toEqual(['rotate-ghost', 'rotate-sector', 'rotate-arc', 'rotate-radials']);
  // The ghost borrows the edge geometry and stays at the drag-start pose.
  expect(byName('rotate-ghost').geometry).toBe(edges.geometry);
  expect(byName('rotate-ghost').matrix.equals(start)).toBe(true);
  expect(byName('rotate-ghost').material.depthTest).toBe(false);
  // 60° in 5° triangles, in the Z ring's colour (cad.css .cad-axis-z).
  const sector = byName('rotate-sector');
  expect(sector.geometry.drawRange.count).toBe(12 * 3);
  expect(`#${sector.material.color.getHexString()}`).toBe('#2f5fc6');
  // The current radial ends one ring radius out along the turned start
  // direction: 60° counter-clockwise from +X, seen from above.
  const radials = byName('rotate-radials').geometry.getAttribute('position');
  const end = new THREE.Vector3()
    .fromBufferAttribute(radials, 3)
    .sub(new THREE.Vector3(...centre))
    .normalize();
  end.toArray().forEach((v, i) => expect(v).toBeCloseTo([0.5, Math.sqrt(3) / 2, 0][i], 5)); // Float32 buffer
  act(() => transform.dispatchEvent({ type: 'mouseUp' }));
  expect(layer.children).toHaveLength(0);
  expect(disposed).not.toHaveBeenCalled();
});

it.each([
  ['Escape', () => act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))],
  ['window blur', () => act(() => window.dispatchEvent(new Event('blur')))],
  ['pointercancel', () => act(() => canvas().dispatchEvent(new Event('pointercancel')))],
])('%s cancels the turn and its feedback', (_, cancel) => {
  const onRotate = vi.fn();
  render(<CadViewport {...props({ onRotate })} />);
  const start = leg().matrix.clone();
  const transform = grab('Z', around(0));
  sweep(0, 45);
  cancel();
  leg().updateMatrix();
  expect(leg().matrix.equals(start)).toBe(true);
  expect(transform.object.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  expect(hud().hidden).toBe(true);
  expect(viewport().cadGizmo().feedback).toEqual([]);
  // Moves after the cancel do nothing, and the release commits nothing.
  pointer('pointermove', around(90));
  act(() => transform.dispatchEvent({ type: 'mouseUp' }));
  expect(onRotate).not.toHaveBeenCalled();
});

it('aligns the rings to the part in Local space and still commits a world turn', () => {
  const onRotate = vi.fn();
  // Turned 90° about X: the part's own Y axis points up (world +Z).
  const model = modelWith([90, 0, 0]);
  const { rerender } = render(<CadViewport {...props({ model, onRotate })} />);
  const transform = TransformControls.current;
  expect(transform.spaces.at(-1)).toBe('world');
  expect(transform.object.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  rerender(<CadViewport {...props({ model, onRotate, rotateSpace: 'local' })} />);
  expect(transform.spaces.at(-1)).toBe('local');
  same(transform.object.quaternion.toArray(), instanceOrientation(model.instances[0]).toArray());
  // The local Y ring is seen face-on from the top: circling it is a dial.
  grab('Y', around(0));
  expect(viewport().cadGizmo().dial).toBe('dial');
  sweep(0, 90);
  expect(hud().textContent).toContain('+90.0° about local Y');
  act(() => transform.dispatchEvent({ type: 'mouseUp' }));
  same(onRotate.mock.calls[0][1], axisAngle([0, 0, 1], 90));
  // A typed angle is about the local axis too.
  grab('Y', around(0));
  for (const key of ['4', '5', 'Enter']) act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key })));
  same(onRotate.mock.calls[1][1], axisAngle([0, 0, 1], 45));
  // Back to World: identity rings.
  rerender(<CadViewport {...props({ model, onRotate, rotateSpace: 'world' })} />);
  expect(transform.spaces.at(-1)).toBe('world');
  expect(transform.object.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  // The move gizmo keeps its own size and World space.
  rerender(<CadViewport {...props({ model, rotateSpace: 'local', transformMode: 'translate' })} />);
  expect(transform.spaces.at(-1)).toBe('world');
  expect(transform.sizes.at(-1)).toBe(0.85);
});

it('keeps the HUD inside the viewport near the right and bottom edges', () => {
  const size = (name, value) =>
    vi.spyOn(HTMLElement.prototype, name, 'get').mockImplementation(function () {
      return this.classList.contains('cad-gizmo-hud') ? value[0] : value[1];
    });
  size('clientWidth', [0, SIZE]);
  size('clientHeight', [0, SIZE]);
  size('offsetWidth', [120, 0]);
  size('offsetHeight', [40, 0]);
  render(<CadViewport {...props({ onRotate: vi.fn() })} />);
  grab('Z', around(0));
  // Inside: below-right of the cursor.
  pointer('pointermove', [200, 150]);
  expect([hud().style.left, hud().style.top]).toEqual(['218px', '168px']);
  // Near the bottom-right corner: flipped to above-left.
  pointer('pointermove', [580, 590]);
  expect([hud().style.left, hud().style.top]).toEqual([`${580 - 18 - 120}px`, `${590 - 18 - 40}px`]);
  // Near the top-left corner it never leaves the viewport.
  pointer('pointermove', [-30, -30]);
  expect([hud().style.left, hud().style.top]).toEqual(['6px', '6px']);
});

it('turns about a picked point: a nearby corner snaps, the selection resets it', () => {
  const onRotate = vi.fn(),
    onSelect = vi.fn();
  const { rerender } = render(<CadViewport {...props({ onRotate, onSelect, pivotPick: true })} />);
  const click = (at) => {
    pointer('pointerdown', at, { button: 0 });
    pointer('pointerup', at, { button: 0 });
  };
  // Close to the top (+X, +Y) corner of the leg, seen from above.
  const corner = viewport().cadProject(legMax);
  click([corner[0] - 3, corner[1] + 3]);
  expect(onSelect).not.toHaveBeenCalled();
  expect(viewport().cadGizmo().pivot).toEqual(legMax);
  expect(viewport().cadGizmo().picked.corner).toBe(true);
  // A turn now goes about that corner.
  grab('Z', around(0, legMax));
  sweep(0, 90);
  act(() => TransformControls.current.dispatchEvent({ type: 'mouseUp' }));
  expect(onRotate.mock.calls[0][2]).toEqual(legMax);
  // Far from any corner: the surface point itself (the top face, z = 726).
  const face = viewport().cadProject([1420, 20, 726]);
  click(face);
  const pivot = viewport().cadGizmo().pivot;
  [1420, 20, 726].forEach((v, i) => expect(pivot[i]).toBeCloseTo(v, 6));
  expect(viewport().cadGizmo().picked.corner).toBe(false);
  // A new selection starts at the centre again.
  rerender(<CadViewport {...props({ onRotate, onSelect, pivotPick: true, selectedId: null })} />);
  rerender(<CadViewport {...props({ onRotate, onSelect, pivotPick: true })} />);
  expect(viewport().cadGizmo().pivot).toEqual(centre);
  // So does switching back to Rotate about: Centre.
  click(face);
  rerender(<CadViewport {...props({ onRotate, onSelect, pivotPick: false })} />);
  expect(viewport().cadGizmo().pivot).toEqual(centre);
});

it('treats a click on a ring as a pick while picking a pivot, and a drag as a turn', () => {
  const onRotate = vi.fn(),
    onSelect = vi.fn();
  render(<CadViewport {...props({ onRotate, onSelect, pivotPick: true })} />);
  const transform = TransformControls.current;
  // The press lands on a ring drawn over the part: TransformControls takes it.
  const corner = viewport().cadProject(legMax);
  pointer('pointerdown', corner, { button: 0 });
  transform.axis = 'Z';
  act(() => transform.dispatchEvent({ type: 'mouseDown' }));
  act(() => transform.dispatchEvent({ type: 'mouseUp' }));
  pointer('pointerup', corner, { button: 0 });
  expect(onRotate).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
  expect(viewport().cadGizmo().pivot).toEqual(legMax);
  // With travel it is a turn about the picked point.
  grab('Z', around(0));
  sweep(0, 45);
  act(() => transform.dispatchEvent({ type: 'mouseUp' }));
  expect(onRotate).toHaveBeenCalledOnce();
  expect(onRotate.mock.calls[0][2]).toEqual(legMax);
});
