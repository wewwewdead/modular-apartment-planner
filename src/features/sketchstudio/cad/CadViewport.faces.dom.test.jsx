// @vitest-environment jsdom
// Face picks without whole-mesh work (docs/perf-pass-3.md §5 B1.5): a face
// pick hands over exactly what it did when it copied every vertex to world
// space and rebuilt the vertex map per newly hovered face (the old pick is
// kept here as the oracle), on a part shown at a pending pose and after the
// pose changes; the print station's hover keeps the face it already found.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import CadViewport from './CadViewport.jsx';
import { faceFrame, faceOutline, segmentsInPlane } from './sketchPlane.js';
import { faceCentroid } from './placementTool.js';

const { scenes, outlines } = vi.hoisted(() => ({ scenes: [], outlines: { calls: 0 } }));
vi.mock('./sketchPlane.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    faceOutline: (...args) => {
      outlines.calls += 1;
      return actual.faceOutline(...args);
    },
  };
});
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

const WIDTH = 960,
  HEIGHT = 600;
let frames = [];
beforeEach(() => {
  frames = [];
  scenes.length = 0;
  outlines.calls = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
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

// A plate split into a grid of quads per face (shared vertices within a
// face, as the kernel meshes a face), so a face is many triangles.
function plateMesh([x0, y0, z0], [x1, y1, z1], cells = 6) {
  const vertices = [],
    normals = [],
    triangles = [];
  const face = (origin, u, v, normal) => {
    const base = vertices.length / 3;
    for (let j = 0; j <= cells; j++)
      for (let i = 0; i <= cells; i++) {
        vertices.push(...origin.map((o, k) => o + (u[k] * i) / cells + (v[k] * j) / cells));
        normals.push(...normal);
      }
    for (let j = 0; j < cells; j++)
      for (let i = 0; i < cells; i++) {
        const a = base + j * (cells + 1) + i;
        triangles.push(a, a + 1, a + cells + 2, a, a + cells + 2, a + cells + 1);
      }
  };
  const dx = x1 - x0,
    dy = y1 - y0,
    dz = z1 - z0;
  face([x0, y0, z1], [dx, 0, 0], [0, dy, 0], [0, 0, 1]);
  face([x0, y0, z0], [0, dy, 0], [dx, 0, 0], [0, 0, -1]);
  face([x0, y0, z0], [dx, 0, 0], [0, 0, dz], [0, -1, 0]);
  face([x0, y1, z0], [0, 0, dz], [dx, 0, 0], [0, 1, 0]);
  face([x0, y0, z0], [0, 0, dz], [0, dy, 0], [-1, 0, 0]);
  face([x1, y0, z0], [0, dy, 0], [0, 0, dz], [1, 0, 0]);
  return {
    vertices: Float32Array.from(vertices),
    normals: Float32Array.from(normals),
    triangles: Uint32Array.from(triangles),
  };
}
const BOUNDS = [
  [0, 0, 0],
  [600, 400, 18],
];
const snapshot = {
  parameters: {},
  parts: [{ id: 'plate', bounds: BOUNDS }],
  instances: [
    {
      id: 'plate',
      partId: 'plate',
      bounds: BOUNDS,
      mesh: plateMesh(...BOUNDS),
      edges: { lines: new Float32Array() },
      placement: [{ translation: [0, 0, 0] }],
    },
  ],
};
// The model moved and turned since the snapshot: the plate is shown at the pending pose.
const modelAt = (position, rotation) => ({
  parameters: [],
  sketches: [],
  marks: [],
  parts: [{ id: 'plate', name: 'Plate', features: [] }],
  instances: [{ id: 'plate', partId: 'plate', position, rotation }],
  connections: [],
});

// The pick as it was before B1.5 (CadViewport's pickedFace, 2026-11-22).
function oraclePick(hit) {
  const mesh = hit.object;
  mesh.updateMatrixWorld(true);
  const geometry = mesh.geometry;
  const normals = geometry.getAttribute('normal');
  const planar = [hit.face.a, hit.face.b, hit.face.c].every(
    (i) => Math.abs(new THREE.Vector3().fromBufferAttribute(normals, i).normalize().dot(hit.face.normal)) > 0.99999,
  );
  const normal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).toArray();
  const info = {
    instanceId: mesh.userData.instanceId,
    partId: mesh.parent.userData.partId,
    point: hit.point.toArray(),
    normal,
    planar,
  };
  if (!planar) return info;
  const source = geometry.getAttribute('position');
  const world = new Float64Array(source.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < source.count; i++) {
    v.fromBufferAttribute(source, i).applyMatrix4(mesh.matrixWorld);
    world[i * 3] = v.x;
    world[i * 3 + 1] = v.y;
    world[i * 3 + 2] = v.z;
  }
  const index = geometry.index ? geometry.index.array : Array.from({ length: source.count }, (_, i) => i);
  const outline = faceOutline(world, index, hit.faceIndex, normal);
  const frame = faceFrame(normal, outline.points);
  return {
    ...info,
    frame,
    outline: segmentsInPlane(frame, outline.segments, 0.05),
    outlineWorld: outline.segments,
    centre: faceCentroid(world, index, outline.triangles),
    triangles: outline.triangles,
  };
}

const canvas = () => document.querySelector('canvas');
const viewportEl = () => document.querySelector('.cad-viewport');
const pointer = (type, [clientX, clientY], init = {}) =>
  act(() => canvas().dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, ...init })));
const click = (screen) => {
  pointer('pointerdown', screen, { button: 0 });
  pointer('pointerup', screen, { button: 0 });
};
// The oracle's hit for a client point, through the live camera.
function oracleAt([x, y]) {
  let mesh;
  scenes.at(-1).traverse((o) => {
    if (o.isMesh && o.userData.instanceId === 'plate') mesh = o;
  });
  const camera = TransformControls.current.camera;
  camera.updateMatrixWorld();
  const caster = new THREE.Raycaster();
  caster.setFromCamera(new THREE.Vector2((x / WIDTH) * 2 - 1, 1 - (y / HEIGHT) * 2), camera);
  mesh.parent.parent.updateMatrixWorld(true);
  const [hit] = caster.intersectObject(mesh, false);
  return oraclePick(hit);
}

it('picks a face of a part at a pending pose exactly as the whole-mesh pick did, before and after the pose changes', () => {
  const onPickSketchFace = vi.fn();
  const props = { snapshot, ready: true, view: 'isometric', sketchMode: 'pick', onSelect: vi.fn(), onPickSketchFace };
  const { rerender } = render(<CadViewport {...props} model={modelAt([120, -40, 30], [0, 0, 27])} />);
  const points = [
    [180, 140, 18],
    [420, 260, 18],
    [300, 0, 9],
    [600, 200, 9],
  ];
  // Model points on the plate's top face and two sides, shown at the pending pose.
  const shown = (pose) => (p) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pose.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.rotation.map((d) => (d * Math.PI) / 180))),
      new THREE.Vector3(1, 1, 1),
    );
    return viewportEl().cadProject(new THREE.Vector3(...p).applyMatrix4(m).toArray());
  };
  let calls = 0;
  for (const pose of [
    { position: [120, -40, 30], rotation: [0, 0, 27] },
    { position: [-60, 80, 0], rotation: [0, 0, -40] },
  ]) {
    if (calls) rerender(<CadViewport {...props} model={modelAt(pose.position, pose.rotation)} />);
    for (const p of points) {
      const screen = shown(pose)(p);
      const expected = oracleAt(screen);
      click(screen);
      calls += 1;
      expect(onPickSketchFace).toHaveBeenCalledTimes(calls);
      expect(onPickSketchFace.mock.calls.at(-1)[0]).toEqual(expected);
      expect(expected.planar).toBe(true);
    }
  }
});

it("the print station's hover keeps the face it found; a click picks afresh", () => {
  const shopPick = { station: 'print', stage: 'face', pick: 'face', hint: 'Print' };
  const onShopPick = vi.fn();
  render(
    <CadViewport
      snapshot={snapshot}
      model={modelAt([0, 0, 0], [0, 0, 0])}
      ready
      view="isometric"
      shopPick={shopPick}
      onShopPick={onShopPick}
      onSelect={vi.fn()}
    />,
  );
  const hoverLine = () => {
    let line = null;
    scenes.at(-1).traverse((o) => {
      if (o.name === 'shop-hover-face') line = o;
    });
    return line;
  };
  const top = (x, y) => viewportEl().cadProject([x, y, 18]);
  const before = outlines.calls;
  pointer('pointermove', top(150, 120));
  flush();
  const first = hoverLine();
  expect(first).toBeTruthy();
  expect(viewportEl().cadShop().pick.hover).toBe('face');
  expect(outlines.calls).toBe(before + 1);
  // Elsewhere on the same face (other triangles): no new face pick, the same outline drawn.
  pointer('pointermove', top(470, 310));
  flush();
  pointer('pointermove', top(300, 60));
  flush();
  expect(outlines.calls).toBe(before + 1);
  expect(hoverLine()).toBe(first);
  // Another face: picked once.
  pointer('pointermove', viewportEl().cadProject([300, 0, 9]));
  flush();
  expect(outlines.calls).toBe(before + 2);
  expect(hoverLine()).not.toBe(first);
  // A click picks afresh, at its own point.
  const at = top(420, 260);
  click(at);
  expect(outlines.calls).toBe(before + 3);
  expect(onShopPick).toHaveBeenCalledOnce();
  const target = onShopPick.mock.calls[0][0];
  expect(target).toMatchObject({ kind: 'face', instanceId: 'plate', planar: true, normal: [0, 0, 1] });
  target.point.forEach((v, i) => expect(v).toBeCloseTo([420, 260, 18][i], 6));
  target.local.point.forEach((v, i) => expect(v).toBeCloseTo([420, 260, 18][i], 6));
});
