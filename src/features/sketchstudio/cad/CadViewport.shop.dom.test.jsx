// @vitest-environment jsdom
// The fabrication shop in the viewport (docs/sketch-studio-fab-shop.md §7):
// a sheet-metal part unfolds into its preview and folds back in ≈ 600 ms with
// its own animation loop, the kernel group hides meanwhile, bend labels show
// while flat; paint finishes and bare stock colour the bodies.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import CadViewport from './CadViewport.jsx';
import { foldSheet } from './sheetMetal.js';
import { SHEET_STOCK } from './shopCatalog.js';
import { BODY_COLORS } from './viewMode.js';

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
      attach() {}
      detach() {}
      dispose() {}
    },
  };
});

// A hand-cranked animation clock: frames run only when the test says so.
let frames = [],
  now = 0;
beforeEach(() => {
  scenes.last = null;
  frames = [];
  now = 1000;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 600, height: 600 }),
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const step = (ms) => {
  now += ms;
  const run = frames;
  frames = [];
  run.forEach((callback) => callback(now));
};

const profile = { type: 'rectangle', width: 100, height: 60, origin: [0, 0] };
const sheetFeature = {
  id: 'sm',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: 1.5,
  stock: 'sus304',
  bends: [
    { id: 'b1', a: [20, 0], b: [20, 60], angle: 90, direction: 'up' },
    { id: 'b2', a: [80, 0], b: [80, 60], angle: 90, direction: 'down' },
  ],
};
const fold = foldSheet(sheetFeature, profile);
const box = (min, max) => {
  const vertices = [];
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) vertices.push(x, y, z);
  return {
    vertices,
    normals: vertices.map(() => 0),
    triangles: [
      0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3,
    ],
  };
};
const item = (id, partId, min, max) => ({
  id,
  partId,
  bounds: [min, max],
  mesh: box(min, max),
  edges: { lines: [...min, ...max] },
  placement: [{ translation: [0, 0, 0] }],
});
const model = (finishes = []) => ({
  sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile }],
  parts: [
    { id: 'sheet', name: 'Sheet', material: SHEET_STOCK.sus304.name, features: [sheetFeature] },
    { id: 'plate', name: 'Plate', material: 'Steel', features: [{ id: 'f', type: 'box' }] },
  ],
  instances: [
    { id: 'sheet-1', partId: 'sheet', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'plate-1', partId: 'plate', position: [0, 0, 0], rotation: [0, 0, 0] },
  ],
  connections: [],
  finishes,
});
const snapshot = {
  parts: [],
  instances: [
    item('sheet-1', 'sheet', [18, 0, -20], [82, 60, 20]),
    item('plate-1', 'plate', [200, 0, 0], [300, 50, 5]),
  ],
};
const props = (extra = {}) => ({
  model: model(),
  snapshot,
  selectedId: null,
  ready: true,
  view: 'top',
  onSelect: vi.fn(),
  ...extra,
});
const kernel = (id) => {
  let found = null;
  scenes.last.traverse((o) => {
    if (o.isMesh && o.userData.instanceId === id) found = o;
  });
  return found;
};
const preview = () => scenes.last.getObjectByName('sheet-metal-preview');
const shop = () => document.querySelector('.cad-viewport').cadShop();
const hex = (material) => `#${material.color.getHexString()}`;

it('colours bare sheet stock, a paint finish with its gloss, and lets the selection win', () => {
  const { rerender } = render(<CadViewport {...props()} />);
  expect(hex(kernel('sheet-1').material)).toBe(SHEET_STOCK.sus304.colour);
  expect(hex(kernel('plate-1').material)).toBe(BODY_COLORS.metal);
  const painted = model([
    {
      id: 'f',
      instanceId: 'plate-1',
      kind: 'powder',
      name: 'RAL 3020',
      colour: '#cc0605',
      gloss: 'gloss',
      thickness: 70,
    },
  ]);
  rerender(<CadViewport {...props({ model: painted })} />);
  expect(hex(kernel('plate-1').material)).toBe('#cc0605');
  expect(kernel('plate-1').material.roughness).toBe(0.25);
  rerender(<CadViewport {...props({ model: painted, selectedId: 'plate-1' })} />);
  expect(hex(kernel('plate-1').material)).toBe(BODY_COLORS.selected);
  expect(shop()).toMatchObject({ station: null, flat: false, animating: false, prints: [], hidden: [] });
});

it('unfolds the selected part in its own animation loop, hides the kernel body, labels the bends and folds back', () => {
  const { rerender } = render(<CadViewport {...props({ selectedId: 'sheet-1' })} />);
  expect(preview()).toBeUndefined();
  expect(frames).toHaveLength(0);
  rerender(
    <CadViewport {...props({ selectedId: 'sheet-1', sheetView: { instanceId: 'sheet-1', fold, flat: true } })} />,
  );
  // The stand-in is outside the parts group; the kernel body hides at once.
  expect(preview()).toBeDefined();
  expect(preview().parent.name).toBe('shop-layer');
  expect(kernel('sheet-1').parent.visible).toBe(false);
  expect(kernel('plate-1').parent.visible).toBe(true);
  expect(shop()).toMatchObject({ animating: true, flat: false, bends: [] });
  expect(frames).toHaveLength(1);
  step(300);
  expect(shop().flatness).toBeGreaterThan(0.4);
  expect(shop().flatness).toBeLessThan(0.6);
  step(300);
  // Flat: the loop stops, labels and bend lines show.
  expect(frames).toHaveLength(0);
  expect(shop()).toMatchObject({ animating: false, flat: true, pieces: 3 });
  expect(shop().bends.map((b) => b.label)).toEqual(['UP 90° R2.1', 'DOWN 90° R2.1']);
  const labels = [...document.querySelectorAll('.cad-shop-label')];
  expect(labels.map((l) => [l.textContent, l.hidden])).toEqual([
    ['UP 90° R2.1', false],
    ['DOWN 90° R2.1', false],
  ]);
  expect(scenes.last.getObjectByName('sheet-bend-lines').visible).toBe(true);
  // Every piece lies flat in the blank's plane.
  for (const mesh of preview().children.filter((c) => c.isMesh && c.name.startsWith('sheet-piece')))
    expect(mesh.matrix.elements.slice(12, 15).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 0]);
  // Fold: back over the same time, then the kernel body returns and the preview goes.
  rerender(
    <CadViewport {...props({ selectedId: 'sheet-1', sheetView: { instanceId: 'sheet-1', fold, flat: false } })} />,
  );
  // The labels go the moment it leaves the flat.
  expect(shop().animating).toBe(true);
  expect(document.querySelector('.cad-shop-label').hidden).toBe(true);
  step(16);
  expect(shop().flatness).toBeLessThan(1);
  step(700);
  expect(frames).toHaveLength(0);
  expect(preview()).toBeUndefined();
  expect(document.querySelectorAll('.cad-shop-label')).toHaveLength(0);
  expect(kernel('sheet-1').parent.visible).toBe(true);
  expect(shop()).toMatchObject({ instanceId: null, flat: false, animating: false });
});

it('drops the preview at once when the view goes (another selection, a tool) and keeps a hidden part hidden', () => {
  const hidden = model();
  hidden.instances[0] = { ...hidden.instances[0], visible: false };
  const { rerender } = render(
    <CadViewport
      {...props({ model: hidden, selectedId: 'sheet-1', sheetView: { instanceId: 'sheet-1', fold, flat: true } })}
    />,
  );
  step(600);
  expect(shop().flat).toBe(true);
  rerender(<CadViewport {...props({ model: hidden, selectedId: 'plate-1', sheetView: null })} />);
  expect(frames).toHaveLength(0);
  expect(preview()).toBeUndefined();
  expect(kernel('sheet-1').parent.visible).toBe(false);
  expect(shop().instanceId).toBe(null);
});
