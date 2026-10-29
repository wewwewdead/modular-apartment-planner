// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import CadViewport from './CadViewport.jsx';
import { createRef } from 'react';
import { flipAxis, flipInstance, turnInstance } from './movement.js';
import { rotateVector } from './model.js';

const { frames } = vi.hoisted(() => ({ frames: [] }));
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      setPixelRatio() {}
      setSize() {}
      dispose() {}
      render(scene) {
        scene.updateMatrixWorld(true);
        const positions = {};
        scene.traverse((object) => {
          if (!object.isMesh || !object.userData.instanceId) return;
          positions[object.userData.instanceId] = new actual.Box3()
            .setFromObject(object)
            .getCenter(new actual.Vector3())
            .toArray();
        });
        frames.push(positions);
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

const model = {
  parts: [{ id: 'part', features: [] }],
  instances: [{ id: 'item', partId: 'part', position: [0, 0, 0] }],
};
function snapshotAt([x, y, z] = [0, 0, 0]) {
  return {
    parts: [],
    instances: [
      {
        id: 'item',
        partId: 'part',
        bounds: [
          [x, y, z],
          [x + 10, y + 10, z],
        ],
        mesh: {
          vertices: [x, y, z, x + 10, y, z, x, y + 10, z],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          triangles: [0, 1, 2],
        },
        edges: { lines: [] },
        placement: [{ translation: [x, y, z] }],
      },
    ],
  };
}
function dragBy(delta) {
  const transform = TransformControls.current;
  act(() => {
    transform.dispatchEvent({ type: 'mouseDown' });
    transform.object.position.add(new THREE.Vector3(...delta));
    transform.dispatchEvent({ type: 'objectChange' });
  });
}
beforeEach(() => {
  frames.length = 0;
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
});

it('reports displayed bounds, including a placement the worker has not rebuilt', () => {
  const ref = createRef();
  const props = { model, snapshot: snapshotAt(), ready: true, ref };
  const { rerender } = render(<CadViewport {...props} />);
  expect(ref.current.getInstanceBounds('item')).toEqual([
    [0, 0, 0],
    [10, 10, 0],
  ]);
  const moved = { ...model, instances: [{ ...model.instances[0], position: [100, 0, 50] }] };
  rerender(<CadViewport {...props} model={moved} ready={false} />);
  expect(ref.current.getInstanceBounds('item')).toEqual([
    [100, 0, 50],
    [110, 10, 50],
  ]);
  expect(ref.current.getInstanceBounds('missing')).toBeNull();
});

it('keeps a flat object level and centered when flipped either way', () => {
  const source = {
    ...model,
    connections: [],
    instances: [{ ...model.instances[0], position: [20, 30, 40], rotation: [0, 0, 27] }],
  };
  const bounds = [
    [-30, -20, 30],
    [70, 80, 50],
  ];
  for (const direction of ['horizontal', 'vertical']) {
    const axis = flipAxis(direction, bounds);
    const flipped = flipInstance(source, 'item', axis, bounds);
    const normal = rotateVector([0, 0, 1], flipped.instances[0].rotation);
    expect(normal[0]).toBeCloseTo(0, 8);
    expect(normal[1]).toBeCloseTo(0, 8);
    expect(Math.abs(normal[2])).toBeCloseTo(1, 8);
    const restored = flipInstance(flipped, 'item', axis, bounds);
    const point = [25, 10, 7];
    const originalPoint = rotateVector(point, source.instances[0].rotation);
    rotateVector(point, restored.instances[0].rotation).forEach((v, i) => expect(v).toBeCloseTo(originalPoint[i], 8));
  }
});

it('turns the displayed part with the rotate ring and keeps the turn until the rebuild', () => {
  const onRotate = vi.fn();
  const props = {
    model,
    snapshot: snapshotAt(),
    selectedId: 'item',
    ready: true,
    moveEnabled: true,
    transformMode: 'rotate',
    onRotate,
    onSelect: vi.fn(),
  };
  const { rerender } = render(<CadViewport {...props} />);
  const transform = TransformControls.current;
  const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  act(() => {
    transform.dispatchEvent({ type: 'mouseDown' });
    transform.object.quaternion.copy(quarter);
    transform.dispatchEvent({ type: 'objectChange' });
  });
  // Mesh center (5, 5, 0) turns 90° about the gizmo center, which is the same point.
  frames.at(-1).item.forEach((v, i) => expect(v).toBeCloseTo([5, 5, 0][i], 8));
  act(() => transform.dispatchEvent({ type: 'mouseUp' }));
  expect(onRotate).toHaveBeenCalledOnce();
  const [id, turn, center] = onRotate.mock.calls[0];
  expect(id).toBe('item');
  expect(center).toEqual([5, 5, 0]);
  const turned = turnInstance({ ...model, connections: [] }, 'item', turn, center);
  expect(turned.instances[0].rotation).toEqual([0, 0, 90]);
  expect(turned.instances[0].position).toEqual([10, 0, 0]);
  frames.length = 0;
  rerender(<CadViewport {...props} model={turned} ready={false} moveEnabled={false} />);
  // The old mesh is shown turned in place before the worker answers.
  frames.at(-1).item.forEach((v, i) => expect(v).toBeCloseTo([5, 5, 0][i], 6));
});

it('keeps every rendered frame at the dropped position until rebuilt geometry replaces it', () => {
  const onMove = vi.fn();
  const props = {
    model,
    snapshot: snapshotAt(),
    selectedId: 'item',
    ready: true,
    moveEnabled: true,
    onMove,
    onSelect: vi.fn(),
    perspective: true,
  };
  const { rerender } = render(<CadViewport {...props} />);
  dragBy([20, 30, 40]);
  expect(frames.at(-1).item).toEqual([25, 35, 40]);
  frames.length = 0;
  act(() => TransformControls.current.dispatchEvent({ type: 'mouseUp' }));
  expect(onMove).toHaveBeenCalledExactlyOnceWith('item', [20, 30, 40]);
  const movedModel = { ...model, instances: [{ ...model.instances[0], position: [20, 30, 40] }] };
  // The model commits immediately; the worker snapshot is still at the old position.
  rerender(<CadViewport {...props} model={movedModel} ready={false} moveEnabled={false} />);
  // Appearance/selection changes while rebuilding must also retain the drop.
  rerender(
    <CadViewport {...props} model={movedModel} ready={false} moveEnabled={false} section={100} selectedId={null} />,
  );
  rerender(<CadViewport {...props} model={movedModel} snapshot={snapshotAt([20, 30, 40])} />);
  expect(frames.length).toBeGreaterThan(0);
  for (const frame of frames) expect(frame.item).toEqual([25, 35, 40]);
  expect(TransformControls.current.object.position.toArray()).toEqual([25, 35, 40]);
  // Undo supplies fresh geometry and must discard the temporary drag offset.
  rerender(<CadViewport {...props} snapshot={snapshotAt()} />);
  expect(frames.at(-1).item).toEqual([5, 5, 0]);
});

it('applies exploded spacing without losing or accumulating the pending move', () => {
  const snapshot = snapshotAt();
  snapshot.instances.unshift({ ...snapshot.instances[0], id: 'other' });
  const props = {
    model,
    snapshot,
    selectedId: 'item',
    ready: true,
    moveEnabled: true,
    onMove: vi.fn(),
  };
  const { rerender } = render(<CadViewport {...props} />);
  dragBy([20, 30, 40]);
  act(() => TransformControls.current.dispatchEvent({ type: 'mouseUp' }));
  const moved = { ...model, instances: [{ ...model.instances[0], position: [20, 30, 40] }] };
  rerender(<CadViewport {...props} model={moved} ready={false} moveEnabled={false} exploded />);
  expect(frames.at(-1).item).toEqual([25, 35, 125]);
  rerender(<CadViewport {...props} model={moved} ready={false} moveEnabled={false} exploded section={100} />);
  expect(frames.at(-1).item).toEqual([25, 35, 125]);
  rerender(<CadViewport {...props} model={moved} ready={false} moveEnabled={false} exploded={false} />);
  expect(frames.at(-1).item).toEqual([25, 35, 40]);
});

it('restores the original position on Escape without committing a move', () => {
  const onMove = vi.fn();
  render(<CadViewport model={model} snapshot={snapshotAt()} selectedId="item" ready moveEnabled onMove={onMove} />);
  dragBy([20, 0, 0]);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  act(() => TransformControls.current.dispatchEvent({ type: 'mouseUp' }));
  expect(frames.at(-1).item).toEqual([5, 5, 0]);
  expect(onMove).not.toHaveBeenCalled();
});
