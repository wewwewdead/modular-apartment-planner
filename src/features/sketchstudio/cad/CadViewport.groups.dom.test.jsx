// @vitest-environment jsdom
// Part groups in the viewport (docs/sketch-studio-part-groups.md §3.3, §3.5,
// §4.4): Shift+click and double-click report to the workspace, the gizmo
// carries every member rigidly about the union centre, the rotate ghost draws
// each member, and an attached part rides its root's pending pose.
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
      setSpace(space) {
        this.space = space;
      }
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
// Meshed at the origin pose: placement translation 0.
const item = (id, min, max) => ({
  id,
  partId: id,
  bounds: [min, max],
  mesh: boxMesh(min, max),
  edges: { lines: [...min, ...max] },
  placement: [{ translation: [0, 0, 0] }],
});
const snapshot = {
  parts: [],
  instances: [
    item('a', [0, 0, 0], [100, 100, 20]),
    item('b', [200, 0, 0], [300, 100, 20]),
    item('c', [500, 0, 0], [600, 100, 20]),
  ],
};
const modelWith = (positions = {}, connections = []) => ({
  parts: ['a', 'b', 'c'].map((id) => ({ id, name: id, features: [] })),
  instances: ['a', 'b', 'c'].map((id) => ({
    id,
    partId: id,
    position: positions[id] || [0, 0, 0],
    rotation: [0, 0, 0],
  })),
  connections,
  groups: [{ id: 'g', name: 'Group 1', parentId: null }],
});
const props = (extra) => ({
  model: modelWith(),
  snapshot,
  ready: true,
  view: 'top',
  onSelect: vi.fn(),
  selectedId: null,
  selectedIds: ['a', 'b'],
  movingKey: 'g',
  moveEnabled: true,
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
const bodies = () =>
  Object.fromEntries(
    viewport()
      .cadViewMode()
      .bodies.map((b) => [b.id, b.bounds]),
  );

it('Shift / Ctrl+click reports a toggle; a double-click on a part asks to open its group', () => {
  const onSelect = vi.fn();
  render(<CadViewport {...props({ onSelect, moveEnabled: false })} />);
  const onB = viewport().cadProject([250, 50, 20]);
  click(onB, { shiftKey: true });
  expect(onSelect).toHaveBeenLastCalledWith('b', { toggle: true });
  click(onB, { ctrlKey: true });
  expect(onSelect).toHaveBeenLastCalledWith('b', { toggle: true });
  click(onB);
  expect(onSelect).toHaveBeenLastCalledWith('b');
  pointer('dblclick', onB, { button: 0 });
  expect(onSelect).toHaveBeenLastCalledWith('b', { open: true });
  // Not while measuring (the clicks pick points there).
  onSelect.mockClear();
  cleanup();
  render(<CadViewport {...props({ onSelect, moveEnabled: false, measureMode: true })} />);
  click(onB);
  pointer('dblclick', onB, { button: 0 });
  expect(onSelect).not.toHaveBeenCalled();
});

it('the gizmo sits at the union centre in World space and moves every member rigidly', () => {
  const onMove = vi.fn();
  const ref = createRef();
  render(<CadViewport {...props({ onMove, ref, rotateSpace: 'local', transformMode: 'rotate' })} />);
  const transform = TransformControls.current;
  expect(transform.object.position.toArray()).toEqual([150, 50, 10]);
  expect(transform.space).toBe('world');
  expect(viewport().cadGizmo().moving).toBe('g');
  expect(viewport().cadGizmo().movingIds).toEqual(['a', 'b']);
  expect(ref.current.getBounds(['a', 'b'])).toEqual([
    [0, 0, 0],
    [300, 100, 20],
  ]);
  expect(ref.current.getBounds(['missing'])).toBeNull();
  cleanup();
  render(<CadViewport {...props({ onMove })} />);
  const gizmo = TransformControls.current;
  act(() => {
    gizmo.dispatchEvent({ type: 'mouseDown' });
    gizmo.object.position.add(new THREE.Vector3(40, -10, 0));
    gizmo.dispatchEvent({ type: 'objectChange' });
  });
  // Both members moved by the same delta on screen; the outsider stayed.
  expect(bodies()).toEqual({
    a: [
      [40, -10, 0],
      [140, 90, 20],
    ],
    b: [
      [240, -10, 0],
      [340, 90, 20],
    ],
    c: [
      [500, 0, 0],
      [600, 100, 20],
    ],
  });
  act(() => gizmo.dispatchEvent({ type: 'mouseUp' }));
  expect(onMove).toHaveBeenCalledExactlyOnceWith('g', [40, -10, 0]);
});

it('a ring drag turns every member about the union centre and ghosts each one; Esc restores them', () => {
  const onRotate = vi.fn();
  render(<CadViewport {...props({ onRotate, transformMode: 'rotate' })} />);
  const transform = TransformControls.current;
  const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  act(() => {
    transform.dispatchEvent({ type: 'mouseDown' });
    transform.object.quaternion.copy(quarter);
    transform.dispatchEvent({ type: 'objectChange' });
  });
  const close = (actual, expected) => actual.flat().forEach((v, i) => expect(v).toBeCloseTo(expected.flat()[i], 6));
  // About (150, 50): a's box x 0…100, y 0…100 → x 100…200, y -100…0.
  close(bodies().a, [
    [100, -100, 0],
    [200, 0, 20],
  ]);
  close(bodies().b, [
    [100, 100, 0],
    [200, 200, 20],
  ]);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(bodies().a).toEqual([
    [0, 0, 0],
    [100, 100, 20],
  ]);
  act(() => transform.dispatchEvent({ type: 'mouseUp' }));
  expect(onRotate).not.toHaveBeenCalled();
  // A ring grab (the dial) ghosts each member's start pose.
  transform.axis = 'Z';
  act(() => transform.dispatchEvent({ type: 'mouseDown' }));
  expect(
    viewport()
      .cadGizmo()
      .feedback.filter((name) => name === 'rotate-ghost'),
  ).toHaveLength(2);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(viewport().cadGizmo().feedback).toEqual([]);
});

it('an attached part rides its root’s pending pose until the rebuild (root-delta rule)', () => {
  const fixed = [{ id: 'fix', type: 'fixed', from: 'c', to: 'a', offset: [0, 0, 0] }];
  const { rerender } = render(
    <CadViewport {...props({ model: modelWith({}, fixed), moveEnabled: false, selectedIds: [] })} />,
  );
  // The model commits a move of a; the worker has not rebuilt yet.
  rerender(
    <CadViewport
      {...props({ model: modelWith({ a: [0, 0, 50] }, fixed), moveEnabled: false, selectedIds: [], ready: false })}
    />,
  );
  expect(bodies().a[0]).toEqual([0, 0, 50]);
  expect(bodies().c[0]).toEqual([500, 0, 50]);
  expect(bodies().b[0]).toEqual([200, 0, 0]);
});

it('Isolate shows every member; the selected look reaches every member', () => {
  render(<CadViewport {...props({ isolated: true, moveEnabled: false })} />);
  const shown = viewport().cadViewMode().bodies;
  expect(shown.map((b) => [b.id, b.visible])).toEqual([
    ['a', true],
    ['b', true],
    ['c', false],
  ]);
  expect(shown[0].color).toBe(shown[1].color);
  expect(shown[0].color).not.toBe(shown[2].color);
});
