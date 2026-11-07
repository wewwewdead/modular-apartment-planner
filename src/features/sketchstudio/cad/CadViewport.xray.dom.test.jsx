// @vitest-environment jsdom
// Solid / X-ray / Wireframe in the viewport (docs/sketch-studio-xray-mode.md):
// which bodies turn to glass, the edge look, that a mode change or a rebuild
// swaps cached materials instead of disposing them, Section and the sketch dim
// in a see-through mode, and Measure seeing through glass.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import CadViewport from './CadViewport.jsx';
import { EDGE_ALPHA, GHOST_ALPHA, VIEW_MODE_COPY } from './viewMode.js';

const { scenes } = vi.hoisted(() => ({ scenes: { last: null } }));
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      info = { programs: [] };
      setPixelRatio() {}
      setSize() {}
      dispose() {}
      render(scene) {
        scenes.last = scene;
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
  scenes.last = null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  // jsdom lays nothing out: a square canvas at the page origin (as the measure tests).
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
const item = (id, partId, min, max) => ({
  id,
  partId,
  bounds: [min, max],
  mesh: boxMesh(min, max),
  edges: { lines: boxEdges(min, max) },
  placement: [{ translation: [0, 0, 0] }],
});
// A plain board, the selected board (same part) and a bolt (a hardware part).
const model = {
  parts: [
    { id: 'board', name: 'Board', material: 'Steel', features: [{ id: 'f1', type: 'box' }] },
    { id: 'bolt', name: 'Hex bolt M6', material: 'Steel', features: [{ id: 'f2', type: 'hardware', kind: 'bolt' }] },
  ],
  instances: [
    { id: 'plain', partId: 'board', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'chosen', partId: 'board', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'bolt', partId: 'bolt', position: [0, 0, 0], rotation: [0, 0, 0] },
  ],
  connections: [],
};
const snapshotOf = () => ({
  parts: [],
  instances: [
    item('plain', 'board', [0, 0, 0], [600, 400, 18]),
    item('chosen', 'board', [0, 500, 0], [600, 900, 18]),
    item('bolt', 'bolt', [100, 100, -10], [106, 106, 24]),
  ],
});
const props = (extra = {}) => ({
  model,
  snapshot: snapshotOf(),
  selectedId: 'chosen',
  ready: true,
  view: 'top',
  onSelect: vi.fn(),
  ...extra,
});
// The displayed parts: id → { mesh, edges }.
const parts = () => {
  const found = {};
  scenes.last.traverse((object) => {
    if (object.isMesh && object.userData.instanceId)
      found[object.userData.instanceId] = { mesh: object, edges: object.parent.children[1] };
  });
  return found;
};
const viewport = () => document.querySelector('.cad-viewport');
const hint = () => document.querySelector('.cad-viewport-hint').textContent;
const hex = (material) => `#${material.color.getHexString()}`;

it('X-ray turns other parts to glass while the selected part and hardware stay solid', () => {
  const { rerender } = render(<CadViewport {...props()} />);
  expect(viewport().dataset.viewMode).toBe('solid');
  for (const { mesh, edges } of Object.values(parts())) {
    expect(mesh.material.opacity).toBe(1);
    expect(mesh.material.transparent).toBe(false);
    expect(edges.material.opacity).toBe(EDGE_ALPHA.solid);
  }
  expect(hint()).not.toContain('X-ray');
  rerender(<CadViewport {...props({ viewMode: 'xray' })} />);
  expect(viewport().dataset.viewMode).toBe('xray');
  expect(hint()).toContain(VIEW_MODE_COPY.xray.hint);
  const { plain, chosen, bolt } = parts();
  expect(plain.mesh.material).toMatchObject({ opacity: GHOST_ALPHA.xray, transparent: true, depthWrite: false });
  expect(GHOST_ALPHA.xray).toBe(0.22);
  expect(plain.mesh.renderOrder).toBe(1);
  expect(hex(plain.mesh.material)).toBe('#8795a4');
  expect(plain.edges.material.opacity).toBe(0.55);
  expect(hex(plain.edges.material)).toBe('#3e4e5f');
  for (const solid of [chosen, bolt]) {
    expect(solid.mesh.material).toMatchObject({ opacity: 1, transparent: false, depthWrite: true });
    expect(solid.edges.material.opacity).toBe(0.65);
  }
  expect(hex(chosen.mesh.material)).toBe('#3687bd');
  for (const { edges } of Object.values(parts())) expect(edges.renderOrder).toBe(2);
  // The browser-check hook reads the same.
  const hook = viewport().cadViewMode();
  expect(hook.mode).toBe('xray');
  expect(hook.bodies.map((b) => [b.id, b.opacity, b.depthWrite, b.renderOrder, b.edgeOpacity])).toEqual([
    ['plain', 0.22, false, 1, 0.55],
    ['chosen', 1, true, 0, 0.65],
    ['bolt', 1, true, 0, 0.65],
  ]);
});

it('Wireframe ghosts every body and draws every edge at full strength, the selection in blue', () => {
  render(<CadViewport {...props({ viewMode: 'wireframe' })} />);
  expect(hint()).toContain(VIEW_MODE_COPY.wireframe.hint);
  const shown = parts();
  for (const { mesh, edges } of Object.values(shown)) {
    expect(mesh.material).toMatchObject({ opacity: GHOST_ALPHA.wireframe, transparent: true, depthWrite: false });
    expect(mesh.renderOrder).toBe(1);
    expect(edges.material.opacity).toBe(1);
  }
  expect(hex(shown.chosen.edges.material)).toBe('#3687bd');
  expect(hex(shown.plain.edges.material)).toBe('#3e4e5f');
  expect(hex(shown.bolt.edges.material)).toBe('#3e4e5f');
});

it('swaps cached materials: back to Solid disposes nothing and a rebuild keeps them', () => {
  const { rerender, unmount } = render(<CadViewport {...props({ viewMode: 'xray' })} />);
  const ghost = parts().plain.mesh.material;
  const solid = parts().bolt.mesh.material;
  const ghostDispose = vi.spyOn(ghost, 'dispose');
  const solidDispose = vi.spyOn(solid, 'dispose');
  rerender(<CadViewport {...props({ viewMode: 'solid' })} />);
  for (const { mesh } of Object.values(parts())) expect(mesh.material.opacity).toBe(1);
  // The plain board and the bolt share the one opaque metal material.
  expect(parts().plain.mesh.material).toBe(solid);
  expect(ghostDispose).not.toHaveBeenCalled();
  // A new snapshot rebuilds every mesh but borrows the same materials.
  const before = parts();
  rerender(<CadViewport {...props({ viewMode: 'solid', snapshot: snapshotOf() })} />);
  const after = parts();
  expect(after.plain.mesh).not.toBe(before.plain.mesh);
  for (const id of ['plain', 'chosen', 'bolt']) {
    expect(after[id].mesh.material).toBe(before[id].mesh.material);
    expect(after[id].edges.material).toBe(before[id].edges.material);
  }
  // Back to X-ray: the very same ghost material, still undisposed.
  rerender(<CadViewport {...props({ viewMode: 'xray', snapshot: snapshotOf() })} />);
  expect(parts().plain.mesh.material).toBe(ghost);
  expect(ghostDispose).not.toHaveBeenCalled();
  expect(solidDispose).not.toHaveBeenCalled();
  const count = viewport().cadViewMode().materials;
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(8);
  // Unmount disposes each cached material once.
  unmount();
  expect(ghostDispose).toHaveBeenCalledTimes(1);
  expect(solidDispose).toHaveBeenCalledTimes(1);
});

it('Section clips every body and edge material in X-ray', () => {
  const { rerender } = render(<CadViewport {...props({ viewMode: 'xray', section: 10 })} />);
  for (const { mesh, edges } of Object.values(parts())) {
    expect(mesh.material.clippingPlanes).toHaveLength(1);
    expect(edges.material.clippingPlanes).toHaveLength(1);
    expect(mesh.material.clippingPlanes[0].constant).toBe(10);
  }
  rerender(<CadViewport {...props({ viewMode: 'xray', section: null })} />);
  for (const { mesh, edges } of Object.values(parts())) {
    expect(mesh.material.clippingPlanes).toHaveLength(0);
    expect(edges.material.clippingPlanes).toHaveLength(0);
  }
});

it('composes the sketch dim in X-ray: the sketched-on part 0.5, other glass 0.22', () => {
  render(<CadViewport {...props({ viewMode: 'xray', sketchMode: 'draw', sketchSupportId: 'plain' })} />);
  const { plain, chosen, bolt } = parts();
  expect(plain.mesh.material.opacity).toBe(0.5);
  expect(chosen.mesh.material.opacity).toBe(0.22);
  // Hardware stays solid in X-ray, so it takes the plain sketch dim (§3.5).
  expect(bolt.mesh.material.opacity).toBe(0.28);
  for (const { edges } of [plain, chosen, bolt]) expect(edges.material.opacity).toBe(0.35);
  // No part shows as selected while sketching.
  expect(hex(chosen.mesh.material)).toBe('#8795a4');
});

it('Measure sees through glass: a vertex behind a glass part snaps in X-ray, not in Solid', () => {
  // A lid 100 mm above a base: from the top the lid hides the base's corner.
  const lidModel = {
    parts: [
      { id: 'lid', features: [{ type: 'box' }] },
      { id: 'base', features: [{ type: 'box' }] },
    ],
    instances: [
      { id: 'lid', partId: 'lid', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 'base', partId: 'base', position: [0, 0, 0], rotation: [0, 0, 0] },
    ],
    connections: [],
  };
  const snapshot = {
    parts: [],
    instances: [item('lid', 'lid', [0, 0, 100], [600, 400, 118]), item('base', 'base', [100, 100, 0], [300, 300, 18])],
  };
  const base = { model: lidModel, snapshot, ready: true, view: 'top', measureMode: true, onSelect: vi.fn() };
  const { rerender } = render(<CadViewport {...base} />);
  const corner = viewport().cadProject([100, 100, 18]);
  const hover = () =>
    act(() =>
      document
        .querySelector('canvas')
        .dispatchEvent(
          new MouseEvent('pointermove', { clientX: corner[0] + 1, clientY: corner[1] + 1, bubbles: true }),
        ),
    );
  hover();
  expect(viewport().cadMarks().snapKind).toBe('face');
  rerender(<CadViewport {...base} viewMode="xray" />);
  hover();
  expect(viewport().cadMarks().snapKind).toBe('vertex');
  // Wireframe: nothing is opaque, so nothing occludes.
  rerender(<CadViewport {...base} viewMode="wireframe" />);
  hover();
  expect(viewport().cadMarks().snapKind).toBe('vertex');
  // A glass face with nothing to snap to is still a face point.
  const open = viewport().cadProject([500, 50, 118]);
  act(() =>
    document
      .querySelector('canvas')
      .dispatchEvent(new MouseEvent('pointermove', { clientX: open[0], clientY: open[1], bubbles: true })),
  );
  expect(viewport().cadMarks().snapKind).toBe('face');
});
