// @vitest-environment jsdom
// The paint and print stations in the viewport (docs/sketch-studio-fab-shop.md
// §7, §9 SM-3): print decals are real geometry outside the parts group,
// follow their parts and hide with them (and in the unfold view, the press
// brake and the replay's mask), and are disposed with their records; while a
// station picks, clicks pick faces or parts instead of selecting, and a print
// drags on its face.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import CadViewport from './CadViewport.jsx';
import { foldSheet } from './sheetMetal.js';
import { SHEET_STOCK } from './shopCatalog.js';

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

let frames = [];
const drawn = [];
beforeEach(() => {
  scenes.last = null;
  frames = [];
  drawn.length = 0;
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
  // An image "loads" at once.
  vi.stubGlobal(
    'Image',
    class {
      set src(value) {
        this.source = value;
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  // A 2D context for the text decals (jsdom has none).
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    clearRect() {},
    fillText: (text) => drawn.push(text),
    measureText: (text) => ({ width: String(text).length * 60 }),
  }));
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

// A kernel-style mesh: every face with its own four corners and normal, outward winding.
function boxMesh([x0, y0, z0], [x1, y1, z1]) {
  const faces = [
    [
      [0, 0, 1],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    [
      [0, 0, -1],
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y0, z0],
    ],
    [
      [1, 0, 0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x1, y0, z1],
    ],
    [
      [-1, 0, 0],
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
    ],
    [
      [0, 1, 0],
      [x0, y1, z0],
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
    ],
    [
      [0, -1, 0],
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
    ],
  ];
  const vertices = [],
    normals = [],
    triangles = [];
  faces.forEach(([n, ...corners], f) => {
    for (const c of corners) (vertices.push(...c), normals.push(...n));
    triangles.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  return { vertices, normals, triangles };
}
function boxEdges([x0, y0, z0], [x1, y1, z1]) {
  const rect = (z) => [
    [x0, y0, z],
    [x1, y0, z],
    [x1, y1, z],
    [x0, y1, z],
  ];
  const lines = [];
  for (let i = 0; i < 4; i++) {
    lines.push(...rect(z0)[i], ...rect(z0)[(i + 1) % 4], ...rect(z1)[i], ...rect(z1)[(i + 1) % 4]);
    lines.push(...rect(z0)[i], ...rect(z1)[i]);
  }
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
// A plate, a sheet standing on it, and a sheet-metal blank.
const profile = { type: 'rectangle', width: 100, height: 60, origin: [0, 0] };
const sheetFeature = {
  id: 'sm',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: 1.5,
  stock: 'spcc',
  bends: [{ id: 'b1', a: [20, 0], b: [20, 60], angle: 90, direction: 'up' }],
};
const fold = foldSheet(sheetFeature, profile);
const text = {
  id: 't1',
  instanceId: 'plate',
  origin: [70, 0, 1.5],
  x: [1, 0, 0],
  normal: [0, 0, 1],
  width: 30,
  height: 10,
  rotation: 0,
  method: 'silk',
  kind: 'text',
  text: 'ACME',
  font: 'sans-serif',
  colour: '#ffffff',
};
const model = (extra = {}) => ({
  sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile }],
  parts: [
    {
      id: 'plate',
      name: 'Plate',
      material: 'Steel',
      features: [{ id: 'f', type: 'box', width: 200, depth: 120, height: 1.5 }],
    },
    {
      id: 'web',
      name: 'Web',
      material: 'Steel',
      features: [{ id: 'g', type: 'box', width: 1.5, depth: 60, height: 28.5 }],
    },
    { id: 'sheet', name: 'Sheet', material: SHEET_STOCK.spcc.name, features: [sheetFeature] },
  ],
  instances: [
    { id: 'plate', partId: 'plate', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'web', partId: 'web', position: [0, 0, 0], rotation: [0, 0, 0] },
    { id: 'sheet-1', partId: 'sheet', position: [0, 0, 0], rotation: [0, 0, 0] },
  ],
  connections: [],
  finishes: [],
  prints: [text],
  ...extra,
});
const snapshot = {
  parameters: {},
  parts: [],
  instances: [
    item('plate', 'plate', [-100, -60, 0], [100, 60, 1.5]),
    item('web', 'web', [40, -30, 1.5], [41.5, 30, 30]),
    item('sheet-1', 'sheet', [300, 0, 0], [400, 60, 22]),
  ],
};
const props = (extra = {}) => ({
  model: model(),
  snapshot,
  selectedId: null,
  ready: true,
  view: 'isometric',
  onSelect: vi.fn(),
  ...extra,
});
const shop = () => document.querySelector('.cad-viewport').cadShop();
const viewport = () => document.querySelector('.cad-viewport');
const canvas = () => document.querySelector('canvas');
const pointer = (type, [clientX, clientY], init = {}) =>
  act(() => canvas().dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, button: 0, ...init })));
const click = (at) => {
  pointer('pointerdown', at);
  pointer('pointerup', at);
};
const named = (name) => {
  const found = [];
  scenes.last.traverse((o) => o.name === name && found.push(o));
  return found;
};

it('draws a print on its part, outside the parts group, and follows a move', () => {
  const { rerender } = render(<CadViewport {...props()} />);
  const { records } = shop();
  expect(records).not.toHaveProperty('beads');
  const [decal] = named('print-decal');
  expect(decal.parent.name).toBe('shop-records');
  expect(drawn).toEqual(['ACME']);
  expect(records.prints[0]).toMatchObject({ id: 't1', visible: true, ready: true });
  records.prints[0].centre.forEach((v, i) => expect(v).toBeCloseTo([70, 0, 1.54][i], 6));
  // The plate moves 10 mm (committed before the rebuild): its print follows.
  const moved = model({
    instances: model().instances.map((i) => (i.id === 'plate' ? { ...i, position: [10, 0, 0] } : i)),
  });
  rerender(<CadViewport {...props({ model: moved })} />);
  expect(shop().records.prints[0].centre[0]).toBeCloseTo(80, 6);
});

it('hides prints with their parts, in the unfold view, while the press brake shows and under the replay’s mask', () => {
  const onSheet = { ...text, id: 't2', instanceId: 'sheet-1', origin: [10, 30, 1.5] };
  const both = model({ prints: [text, onSheet] });
  const visible = () => shop().records.prints.map((p) => p.visible);
  const { rerender } = render(<CadViewport {...props({ model: both })} />);
  expect(visible()).toEqual([true, true]);
  // The plate hidden: its print hides.
  const hidden = model({
    prints: [text, onSheet],
    instances: both.instances.map((i) => (i.id === 'plate' ? { ...i, visible: false } : i)),
  });
  rerender(<CadViewport {...props({ model: hidden })} />);
  expect(visible()).toEqual([false, true]);
  // The sheet-metal part unfolded: its stand-in shows, the print on it hides.
  rerender(
    <CadViewport
      {...props({ model: both, selectedId: 'sheet-1', sheetView: { instanceId: 'sheet-1', fold, flat: true } })}
    />,
  );
  expect(visible()).toEqual([true, false]);
  rerender(<CadViewport {...props({ model: both, selectedId: 'sheet-1' })} />);
  // The replay's mask (shop floor §8): the parts not made yet hide, with their prints.
  rerender(<CadViewport {...props({ model: both, selectedId: 'sheet-1', filmHidden: ['plate'] })} />);
  expect(shop().hidden).toEqual(['plate']);
  expect(visible()).toEqual([false, true]);
  // The kernel group of a part: the first group in the scene carrying its instance id.
  const groupOf = (id) => {
    let found = null;
    scenes.last.traverse((o) => {
      if (!found && o.isGroup && o.userData.instanceId === id) found = o;
    });
    return found;
  };
  expect(groupOf('plate').visible).toBe(false);
  expect(groupOf('web').visible).toBe(true);
  rerender(<CadViewport {...props({ model: both, selectedId: 'sheet-1' })} />);
  expect(shop().hidden).toEqual([]);
  expect(visible()).toEqual([true, true]);
  // The press brake: every part hides, so do all the records.
  const brakeView = {
    key: 'brake-1',
    instanceId: 'sheet-1',
    machine: 'brake-50-2000',
    punch: 'straight-88',
    die: 'v10-88',
    fold,
    bendId: 'b1',
    angles: { b1: 0 },
    gaugePoint: [0, 30],
    gaugeDistance: 20,
    collision: null,
  };
  rerender(<CadViewport {...props({ model: both, selectedId: 'sheet-1', brakeView })} />);
  expect(shop().records.shown).toBe(false);
  expect(visible().every((v) => !v)).toBe(true);
  rerender(<CadViewport {...props({ model: both, selectedId: 'sheet-1' })} />);
  expect(shop().records.shown).toBe(true);
  expect(visible()).toEqual([true, true]);
});

it('disposes a print and its texture with its record, and everything on unmount', () => {
  const geometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
  const texture = vi.spyOn(THREE.Texture.prototype, 'dispose');
  const material = vi.spyOn(THREE.Material.prototype, 'dispose');
  const { rerender, unmount } = render(<CadViewport {...props()} />);
  const decal = named('print-decal')[0];
  const [decalGeometry, decalMaterial, decalTexture] = [decal.geometry, decal.material, decal.material.map];
  rerender(<CadViewport {...props({ model: model({ prints: [] }) })} />);
  expect(named('print-decal')).toEqual([]);
  expect(geometry.mock.contexts).toContain(decalGeometry);
  expect(material.mock.contexts).toContain(decalMaterial);
  expect(texture.mock.contexts).toContain(decalTexture);
  // A text change makes a new texture and lets the old one go.
  rerender(<CadViewport {...props()} />);
  const first = named('print-decal')[0].material.map;
  rerender(<CadViewport {...props({ model: model({ prints: [{ ...text, text: 'ACME 2' }] }) })} />);
  expect(texture.mock.contexts).toContain(first);
  expect(named('print-decal')[0].material.map).not.toBe(first);
  const last = named('print-decal')[0].material.map;
  unmount();
  expect(texture.mock.contexts).toContain(last);
});

it('shows an image print once its image has loaded', async () => {
  const image = {
    ...text,
    id: 't2',
    kind: 'image',
    image: 'data:image/png;base64,AAAA',
    text: undefined,
    font: undefined,
  };
  render(<CadViewport {...props({ model: model({ prints: [image] }) })} />);
  expect(shop().records.prints[0]).toMatchObject({ visible: false, ready: false });
  await act(async () => {});
  expect(shop().records.prints[0]).toMatchObject({ visible: true, ready: true });
  expect(named('print-decal')[0].material.map.image.source).toBe(image.image);
});

it('a station picks instead of selecting: a part, a face (with its part-frame plane)', () => {
  const onSelect = vi.fn(),
    onShopPick = vi.fn();
  const { rerender } = render(
    <CadViewport
      {...props({
        onSelect,
        onShopPick,
        shopPick: { station: 'paint', stage: 'pick', pick: 'part', hint: 'Paint: click the part to paint' },
      })}
    />,
  );
  expect(document.querySelector('.cad-viewport-hint').textContent).toContain('Paint: click the part to paint');
  const onPlate = viewport().cadProject([-50, 0, 1.5]);
  click(onPlate);
  expect(onShopPick).toHaveBeenLastCalledWith({ kind: 'part', instanceId: 'plate' });
  expect(onSelect).not.toHaveBeenCalled();
  // The print station: the face under the cursor, in world and in the part's own frame.
  const moved = model({
    instances: model().instances.map((i) => (i.id === 'plate' ? { ...i, position: [10, 0, 0] } : i)),
  });
  rerender(
    <CadViewport
      {...props({
        model: moved,
        onSelect,
        onShopPick,
        shopPick: { station: 'print', stage: 'face', pick: 'face', hint: 'Print' },
      })}
    />,
  );
  click(viewport().cadProject([-40, 0, 1.5]));
  const face = onShopPick.mock.lastCall[0];
  expect(face).toMatchObject({ kind: 'face', instanceId: 'plate', planar: true });
  face.normal.forEach((v, i) => expect(v).toBeCloseTo([0, 0, 1][i], 6));
  face.x.forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0][i], 6));
  [-50, 0, 1.5].forEach((v, i) => expect(face.local.point[i]).toBeCloseTo(v, 3));
  expect(face.outline).toHaveLength(4);
  // A pick on nothing picks nothing, and never selects.
  const picks = onShopPick.mock.calls.length;
  click([3, 3]);
  expect(onShopPick.mock.calls).toHaveLength(picks);
  expect(onSelect).not.toHaveBeenCalled();
  expect(shop().pick).toMatchObject({ station: 'print', stage: 'face' });
});

it('drags a print on its face and reports its new centre in the part frame; Esc puts it back', () => {
  const onShopPrintMove = vi.fn(),
    onShopPick = vi.fn();
  const shopPick = { station: 'print', stage: 'artwork', pick: 'face', hint: 'Print', printId: 't1' };
  const { rerender } = render(<CadViewport {...props({ onShopPrintMove, onShopPick, shopPick })} />);
  const from = viewport().cadProject([70, 0, 1.54]);
  const to = viewport().cadProject([90, 10, 1.54]);
  pointer('pointerdown', from);
  pointer('pointermove', [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]);
  pointer('pointermove', to);
  expect(shop().pick.dragging).toBe(true);
  // The decal follows the drag before anything is committed.
  expect(shop().records.prints[0].centre[0]).toBeCloseTo(90, 0);
  pointer('pointerup', to);
  expect(onShopPrintMove).toHaveBeenCalledTimes(1);
  const [id, origin] = onShopPrintMove.mock.lastCall;
  expect(id).toBe('t1');
  [90, 10, 1.5].forEach((v, i) => expect(origin[i]).toBeCloseTo(v, 1));
  // The workspace commits the new centre; the decal is drawn from the model again.
  const committed = model({ prints: [{ ...text, origin }] });
  rerender(<CadViewport {...props({ model: committed, onShopPrintMove, onShopPick, shopPick })} />);
  expect(shop().records.prints[0].centre[0]).toBeCloseTo(origin[0], 6);
  // A press without travel selects the print; a drag cancelled by Esc goes back.
  pointer('pointerdown', to);
  pointer('pointerup', to);
  expect(onShopPick).toHaveBeenLastCalledWith({ kind: 'print', printId: 't1' });
  pointer('pointerdown', to);
  pointer('pointermove', from);
  expect(shop().records.prints[0].centre[0]).toBeCloseTo(70, 0);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(shop().pick.dragging).toBe(false);
  expect(shop().records.prints[0].centre[0]).toBeCloseTo(origin[0], 6);
  pointer('pointerup', from);
  expect(onShopPrintMove).toHaveBeenCalledTimes(1);
});

it('a press a drag took is no click: Esc mid print drag, then a release where an earlier click was, picks nothing', () => {
  const onShopPrintMove = vi.fn(),
    onShopPick = vi.fn();
  const shopPick = { station: 'print', stage: 'artwork', pick: 'face', hint: 'Print', printId: 't1' };
  render(<CadViewport {...props({ onShopPrintMove, onShopPick, shopPick })} />);
  // An ordinary click on the plate, off the print: a face pick.
  const elsewhere = viewport().cadProject([-50, 0, 1.5]);
  click(elsewhere);
  expect(onShopPick).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'face', instanceId: 'plate' }));
  onShopPick.mockClear();
  // The print taken by the hand, dragged there, Esc, and let go: the press was the drag's.
  const decal = viewport().cadProject([70, 0, 1.54]);
  pointer('pointerdown', decal);
  pointer('pointermove', elsewhere);
  expect(shop().pick.dragging).toBe(true);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  pointer('pointerup', elsewhere);
  expect(onShopPick).not.toHaveBeenCalled();
  expect(onShopPrintMove).not.toHaveBeenCalled();
});
