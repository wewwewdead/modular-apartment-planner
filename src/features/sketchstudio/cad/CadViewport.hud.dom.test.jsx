// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import CadViewport from './CadViewport.jsx';
import { rotationReadout, translationReadout, typeKey, typedRotation } from './gizmoHud.js';

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

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
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
const item = (id, min, max) => ({
  id,
  partId: id,
  bounds: [min, max],
  mesh: boxMesh(min, max),
  edges: { lines: [] },
  placement: [{ translation: [0, 0, 0] }],
});
const snapshot = {
  parts: [],
  instances: [item('desktop', [0, 0, 726], [1200, 650, 750]), item('leg', [1400, 0, 0], [1460, 60, 726])],
};
const model = {
  parts: [
    { id: 'desktop', name: 'Desktop', features: [] },
    { id: 'leg', name: 'Leg', features: [] },
  ],
  instances: [
    { id: 'desktop', partId: 'desktop', position: [0, 0, 0] },
    { id: 'leg', partId: 'leg', position: [0, 0, 0] },
  ],
  connections: [],
};
const hud = () => document.querySelector('.cad-gizmo-hud');
const key = (k) => act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: k })));
function start(axis) {
  const transform = TransformControls.current;
  transform.axis = axis;
  act(() => transform.dispatchEvent({ type: 'mouseDown' }));
  return transform;
}
const change = (fn) =>
  act(() => {
    fn(TransformControls.current.object);
    TransformControls.current.dispatchEvent({ type: 'objectChange' });
  });
const props = (extra) => ({
  model,
  snapshot,
  ready: true,
  selectedId: 'leg',
  moveEnabled: true,
  onSelect: vi.fn(),
  ...extra,
});

it('formats angles and moves', () => {
  const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2).toArray();
  expect(rotationReadout(quarter, 'Z').text).toBe('+90.0° about Z');
  expect(rotationReadout(quarter, 'E').text).toBe('90.0° turn');
  expect(translationReadout([120, 0, -2.5], [{ kind: 'flush' }]).text).toBe('ΔX +120 · ΔY 0 · ΔZ -2.5 mm · flush');
  expect(['4', '5', '.', '5', '.'].reduce((t, k) => typeKey(t, k) ?? t, '')).toBe('45.5');
  expect(typeKey('', '-')).toBe('-');
  expect(typeKey('1', '-')).toBeNull();
  expect(typeKey('1', 'a')).toBeNull();
});

it('shows the signed angle about the dragged ring while rotating, beside the cursor', () => {
  // jsdom lays nothing out; give the canvas a square size (the camera keeps
  // aspect 1 because jsdom never resizes it) so the dial can project.
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 600, height: 600 }),
  );
  render(<CadViewport {...props({ transformMode: 'rotate', onRotate: vi.fn(), view: 'top' })} />);
  const canvas = document.querySelector('canvas');
  const move = ([clientX, clientY]) =>
    act(() => canvas.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY, bubbles: true })));
  // Top view: screen right is +X, screen up is +Y. Grab the Z ring right of
  // the pivot and circle counter-clockwise on screen: a positive turn about Z.
  const [px, py] = document.querySelector('.cad-viewport').cadProject([1430, 30, 363]);
  const at = (degrees) => [
    px + 100 * Math.cos((degrees * Math.PI) / 180),
    py - 100 * Math.sin((degrees * Math.PI) / 180),
  ];
  move(at(0));
  expect(hud().hidden).toBe(true);
  start('Z');
  for (let d = 10; d <= 90; d += 10) move(at(d));
  expect(hud().hidden).toBe(false);
  expect(hud().textContent).toContain('+90.0° about Z');
  expect(hud().textContent).toContain('snap 15°');
  expect(hud().querySelector('.cad-axis-z').textContent).toBe('Z');
  const [x, y] = at(90);
  expect(hud().style.left).toBe(`${x + 18}px`);
  expect(hud().style.top).toBe(`${y + 18}px`);
  for (let d = 80; d >= -45; d -= 10) move(at(d));
  move(at(-45));
  expect(hud().textContent).toContain('-45.0° about Z');
  act(() => TransformControls.current.dispatchEvent({ type: 'mouseUp' }));
  expect(hud().hidden).toBe(true);
});

it('shows the snapped move and which box snap engaged', () => {
  render(<CadViewport {...props({ onMove: vi.fn() })} />);
  start('XYZ');
  change((pivot) => pivot.position.add(new THREE.Vector3(-1395.4, -3.4, 0)));
  expect(hud().textContent).toContain('ΔX -1400 · ΔY 0 · ΔZ 0 mm · aligned · flush');
  // The free centre handle ignores typing.
  expect(hud().textContent).not.toContain('Type a value');
  act(() => TransformControls.current.dispatchEvent({ type: 'mouseUp' }));
  expect(hud().hidden).toBe(true);
});

it('applies a typed angle about the dragged ring through onRotate', () => {
  const onRotate = vi.fn();
  render(<CadViewport {...props({ transformMode: 'rotate', onRotate })} />);
  start('Z');
  change((pivot) => pivot.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 6));
  expect(hud().textContent).toContain('Type a value');
  key('4');
  key('5');
  expect(hud().textContent).toContain('45 ° · Enter applies');
  key('Enter');
  expect(onRotate).toHaveBeenCalledTimes(1);
  const [id, turn, center] = onRotate.mock.calls[0];
  expect(id).toBe('leg');
  typedRotation('Z', 45).forEach((v, i) => expect(turn[i]).toBeCloseTo(v, 12));
  expect(rotationReadout(turn, 'Z').text).toBe('+45.0° about Z');
  expect(center).toEqual([1430, 30, 363]);
  expect(hud().hidden).toBe(true);
  // The mouse release afterwards does not commit the mouse angle as well.
  act(() => TransformControls.current.dispatchEvent({ type: 'mouseUp' }));
  expect(onRotate).toHaveBeenCalledTimes(1);
});

it('applies a typed distance along the dragged arrow through onMove; planes ignore typing', () => {
  const onMove = vi.fn();
  render(<CadViewport {...props({ onMove })} />);
  start('X');
  change((pivot) => pivot.position.add(new THREE.Vector3(37, 0, 0)));
  for (const k of ['-', '1', '2', '0']) key(k);
  key('Enter');
  expect(onMove).toHaveBeenCalledWith('leg', [-120, 0, 0]);
  expect(hud().hidden).toBe(true);
  cleanup();
  const ignored = vi.fn();
  render(<CadViewport {...props({ onMove: ignored })} />);
  start('XY');
  change((pivot) => pivot.position.add(new THREE.Vector3(10, 10, 0)));
  key('5');
  key('Enter');
  expect(ignored).not.toHaveBeenCalled();
  key('Escape');
  expect(hud().hidden).toBe(true);
});
