// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import CadViewport from './CadViewport.jsx';

const { scenes } = vi.hoisted(() => ({ scenes: [] }));
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
        scenes.push(scene);
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
      axis = null;
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
  scenes.length = 0;
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

// Axis-aligned box mesh (8 corners, 12 triangles) in world coordinates.
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
// A desktop at Z 726–750 and a leg standing off to the side.
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
const legCenter = () => {
  const scene = scenes.at(-1);
  scene.updateMatrixWorld(true);
  let mesh;
  scene.traverse((o) => {
    if (o.isMesh && o.userData.instanceId === 'leg') mesh = o;
  });
  return new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()).toArray();
};
const snapLines = () => {
  const found = [];
  scenes.at(-1).traverse((o) => o.name?.startsWith('snap-') && found.push(o));
  return found;
};
function drag(delta, axis = 'XYZ') {
  const transform = TransformControls.current;
  transform.axis = axis;
  act(() => {
    transform.dispatchEvent({ type: 'mouseDown' });
    transform.object.position.add(new THREE.Vector3(...delta));
    transform.dispatchEvent({ type: 'objectChange' });
  });
}

it('snaps a dragged part flush and edge-aligned to a nearby part and commits the snapped move', () => {
  const onMove = vi.fn();
  render(
    <CadViewport
      model={model}
      snapshot={snapshot}
      ready
      selectedId="leg"
      moveEnabled
      onMove={onMove}
      onSelect={vi.fn()}
    />,
  );
  // Dropped 4.6 mm right and 3.4 mm in front of the desktop's front-left corner.
  drag([-1395.4, -3.4, 0]);
  expect(legCenter()).toEqual([30, 30, 363]);
  const lines = snapLines();
  expect(lines.map((l) => l.name).sort()).toEqual(['snap-aligned', 'snap-aligned', 'snap-flush']);
  expect(lines.find((l) => l.name === 'snap-flush').userData.snap).toMatchObject({ axis: 2, value: 726 });
  act(() => TransformControls.current.dispatchEvent({ type: 'mouseUp' }));
  expect(onMove).toHaveBeenCalledWith('leg', [-1400, 0, 0]);
  expect(snapLines()).toHaveLength(0);
});

it('moves freely with Alt held, with Snap 0, and only along the dragged handle', () => {
  const onMove = vi.fn();
  const props = { model, snapshot, ready: true, selectedId: 'leg', moveEnabled: true, onMove, onSelect: vi.fn() };
  render(<CadViewport {...props} />);
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }));
  });
  drag([-1395, -3, 0]);
  expect(legCenter()).toEqual([35, 27, 363]);
  expect(snapLines()).toHaveLength(0);
  act(() => TransformControls.current.dispatchEvent({ type: 'mouseUp' }));
  expect(onMove).toHaveBeenLastCalledWith('leg', [-1395, -3, 0]);
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false }));
  });
  // Each case starts from a fresh viewport (a committed move would rebuild it).
  cleanup();
  render(<CadViewport {...props} moveSnap={0} />);
  drag([-1395.4, -3.4, 0]);
  expect(legCenter()[0]).toBeCloseTo(34.6, 6);
  expect(snapLines()).toHaveLength(0);
  cleanup();
  render(<CadViewport {...props} moveSnap={1} />);
  // Dragging the X arrow snaps X only; Y keeps its (grid-rounded) offset.
  drag([-1395.4, -3.4, 0], 'X');
  expect(legCenter()).toEqual([30, 27, 363]);
  act(() => TransformControls.current.dispatchEvent({ type: 'mouseUp' }));
  expect(onMove).toHaveBeenLastCalledWith('leg', [-1400, -3, 0]);
});
