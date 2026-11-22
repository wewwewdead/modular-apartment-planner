// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import * as THREE from 'three';
import CadViewport from './CadViewport.jsx';
import CadSketcher from './CadSketcher.jsx';
import { planeFrame, toWorld } from './sketchPlane.js';

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
      static current;
      target = new Vector3();
      enableRotate = true;
      constructor() {
        super();
        this.constructor.current = this;
      }
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

const RECT = { left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0 };
beforeEach(() => {
  scenes.length = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// A 1000 × 500 plate face at z = 0 (two triangles sharing vertices), facing +Z.
const model = {
  parts: [{ id: 'part', name: 'Plate', features: [] }],
  instances: [{ id: 'item', partId: 'part', position: [0, 0, 0] }],
};
const snapshot = {
  parts: [],
  instances: [
    {
      id: 'item',
      partId: 'part',
      bounds: [
        [0, 0, 0],
        [1000, 500, 0],
      ],
      mesh: {
        vertices: [0, 0, 0, 1000, 0, 0, 1000, 500, 0, 0, 500, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        triangles: [0, 1, 2, 0, 2, 3],
      },
      edges: { lines: [0, 0, 0, 1000, 0, 0, 1000, 0, 0, 1000, 500, 0, 1000, 500, 0, 0, 500, 0, 0, 500, 0, 0, 0, 0] },
      placement: [{ translation: [0, 0, 0] }],
    },
  ],
};
// Look straight down at the plate centre (perspective camera, up = +Y).
const focus = { position: [500, 250, 0], normal: [0, 0, 1], up: [0, 1, 0], span: 1200 };
const pointer = (target, type, x, y) =>
  act(() => {
    target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
  });
const scene = () => scenes.at(-1);
const named = (name) => {
  const found = [];
  scene().traverse((o) => o.name === name && found.push(o));
  return found;
};

it('draws sketch geometry in the sketch plane, on top of the model', () => {
  const ref = createRef();
  render(<CadViewport ref={ref} model={model} snapshot={snapshot} ready />);
  const frame = planeFrame('XZ', 10);
  act(() =>
    ref.current.setSketchOverlay({
      frame,
      gridBounds: [
        [-100, -100],
        [100, 100],
      ],
      gridStep: 10,
      boundary: [
        [
          [0, 0],
          [50, 0],
        ],
      ],
      entities: [{ id: 'e1', type: 'rect', a: [0, 0], b: [40, 30] }],
      preview: [{ id: 'preview', type: 'circle', c: [0, 0], r: 5 }],
      cursor: [40, 30],
      snapKind: 'endpoint',
      markerSize: 2,
    }),
  );
  scene().updateMatrixWorld(true);
  for (const name of [
    'sketch-grid',
    'sketch-axis',
    'sketch-boundary',
    'sketch-entity',
    'sketch-preview',
    'sketch-cursor',
  ])
    expect(named(name).length, name).toBeGreaterThan(0);
  const [entity] = named('sketch-entity');
  expect(entity.material.depthTest).toBe(false);
  const positions = entity.geometry.getAttribute('position');
  const world = Array.from({ length: positions.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(entity.matrixWorld).toArray(),
  );
  // Every vertex lies on the XZ plane at Y = 10, and corner (40, 30) is at X 40, Z 30.
  world.forEach((p) => expect(p[1]).toBeCloseTo(10, 6));
  expect(world.some((p) => Math.abs(p[0] - 40) < 1e-6 && Math.abs(p[2] - 30) < 1e-6)).toBe(true);
  expect(toWorld(frame, [40, 30])).toEqual([40, 10, 30]);
  act(() => ref.current.setSketchOverlay(null));
  expect(named('sketch-entity')).toHaveLength(0);
});

it('keeps the drawn entities as one batch while their array and selection stay (drawing-table §3.2 item 3)', () => {
  const ref = createRef();
  render(<CadViewport ref={ref} model={model} snapshot={snapshot} ready />);
  const frame = planeFrame('XY');
  const entities = [
    { id: 'e1', type: 'line', a: [0, 0], b: [40, 0] },
    { id: 'e2', type: 'circle', c: [20, 20], r: 5 },
    { id: 'e3', type: 'arc', a: [0, 10], m: [5, 15], b: [10, 10] },
  ];
  const overlay = (over = {}) => ({
    frame,
    gridBounds: [
      [-100, -100],
      [100, 100],
    ],
    gridStep: 10,
    boundary: [],
    entities,
    selectedId: 'e2',
    preview: [],
    cursor: [1, 1],
    snapKind: 'free',
    markerSize: 2,
    ...over,
  });
  const disposed = [];
  const watch = (obj) => {
    obj.geometry.addEventListener('dispose', () => disposed.push(obj.geometry));
    obj.material.addEventListener('dispose', () => disposed.push(obj.material));
  };
  const batch = () => named('sketch-entity').find((o) => o.userData.batch);
  act(() => ref.current.setSketchOverlay(overlay()));
  const first = batch();
  const selected = named('sketch-entity').find((o) => o.userData.entityId === 'e2');
  // The line (2 vertices) and the half-circle arc (32 segments) in one
  // LineSegments; the selected circle its own line.
  expect(first.isLineSegments).toBe(true);
  expect(first.geometry.getAttribute('position').count).toBe(2 + 64);
  expect(selected.isLine && !selected.isLineSegments).toBe(true);
  expect(named('sketch-entity')).toHaveLength(2);
  const [grid] = named('sketch-grid'),
    [cursor] = named('sketch-cursor');
  [first, selected, grid, cursor].forEach(watch);
  // A pointer move: same entities, selection, frame and grid.
  act(() => ref.current.setSketchOverlay(overlay({ cursor: [2, 2] })));
  expect(batch()).toBe(first);
  expect(named('sketch-entity').find((o) => o.userData.entityId === 'e2')).toBe(selected);
  expect(named('sketch-grid')[0]).toBe(grid);
  expect(named('sketch-cursor')[0]).not.toBe(cursor);
  expect(disposed).toEqual([cursor.geometry, cursor.material]);
  // A new array (same content) rebuilds the batch and disposes the old one.
  disposed.length = 0;
  act(() => ref.current.setSketchOverlay(overlay({ entities: [...entities] })));
  expect(batch()).not.toBe(first);
  expect(disposed).toEqual(
    expect.arrayContaining([first.geometry, first.material, selected.geometry, selected.material]),
  );
  // No selection: every entity in the batch (the circle's 64 segments too).
  act(() => ref.current.setSketchOverlay(overlay({ selectedId: null })));
  expect(named('sketch-entity')).toHaveLength(1);
  expect(batch().geometry.getAttribute('position').count).toBe(2 + 64 + 128);
  // null: the layer empty, every object's geometry and material disposed.
  const layer = batch().parent;
  const all = [];
  layer.traverse((o) => o !== layer && all.push(o));
  disposed.length = 0;
  all.forEach(watch);
  act(() => ref.current.setSketchOverlay(null));
  expect(layer.children).toHaveLength(0);
  // (distinct: the grid, built first and kept, is watched twice)
  expect(new Set(disposed).size).toBe(all.length * 2);
  expect(all.length).toBeGreaterThanOrEqual(5); // grid, two axes, batch, cursor
});

it('picks a flat face as a sketch frame and maps screen points onto the plane', () => {
  const ref = createRef();
  const onPick = vi.fn();
  const onSelect = vi.fn();
  const props = { ref, model, snapshot, ready: true, onSelect, onPickSketchFace: onPick, focusTarget: focus };
  const { rerender } = render(<CadViewport {...props} sketchMode="pick" />);
  const canvas = ref.current.getCanvas();
  const center = ref.current.planePoint(200, 100, planeFrame('XY'));
  expect(center[0]).toBeCloseTo(500, 3);
  expect(center[1]).toBeCloseTo(250, 3);
  const right = ref.current.planePoint(300, 60, planeFrame('XY'));
  expect(right[0]).toBeGreaterThan(500);
  expect(right[1]).toBeGreaterThan(250); // screen up is +Y
  pointer(canvas, 'pointerdown', 200, 100);
  pointer(canvas, 'pointerup', 200, 100);
  expect(onSelect).not.toHaveBeenCalled();
  expect(onPick).toHaveBeenCalledTimes(1);
  const picked = onPick.mock.calls[0][0];
  expect(picked).toMatchObject({ instanceId: 'item', partId: 'part', planar: true });
  expect(picked.frame.origin).toEqual([0, 0, 0]);
  expect(picked.frame.normal).toEqual([0, 0, 1]);
  expect(picked.outline).toHaveLength(4);
  expect(ref.current.planeEdges(picked.frame)).toHaveLength(4);
  // Drawing: clicks belong to the sketcher, orbiting is off, the model is dimmed.
  rerender(<CadViewport {...props} sketchMode="draw" sketchSupportId="item" />);
  pointer(canvas, 'pointerdown', 200, 100);
  pointer(canvas, 'pointerup', 200, 100);
  expect(onSelect).not.toHaveBeenCalled();
  expect(onPick).toHaveBeenCalledTimes(1);
  const [mesh] = named('').filter((o) => o.isMesh && o.userData.instanceId === 'item');
  expect(mesh.material.opacity).toBe(0.5);
  rerender(<CadViewport {...props} sketchMode={null} />);
  expect(mesh.material.opacity).toBe(1);
  pointer(canvas, 'pointerdown', 200, 100);
  pointer(canvas, 'pointerup', 200, 100);
  expect(onSelect).toHaveBeenCalledWith('item');
});

function Harness({ onFinish, onCancel = () => {}, viewport, markPoints }) {
  const frame = planeFrame('XY');
  const session = {
    key: 's',
    markPoints,
    frame,
    name: 'Sketch 1',
    support: { type: 'plane', plane: 'XY', offset: 0 },
    boundary: [
      [
        [0, 0],
        [1000, 0],
      ],
    ],
    span: 1200,
    gridBounds: [
      [-700, -950],
      [1700, 1450],
    ],
  };
  return (
    <div className="cad-model-view">
      <CadViewport ref={viewport} model={model} snapshot={snapshot} ready focusTarget={focus} sketchMode="draw" />
      <CadSketcher
        viewport={viewport}
        session={session}
        snap={1}
        onSnapChange={() => {}}
        onFinish={onFinish}
        onCancel={onCancel}
        onLookAt={() => {}}
      />
    </div>
  );
}

it('draws a typed rectangle from a snapped click and finishes with the entities', () => {
  const onFinish = vi.fn();
  const viewport = createRef();
  render(<Harness onFinish={onFinish} viewport={viewport} />);
  const canvas = document.querySelector('canvas');
  // Screen position of plane point (0, 0), from the viewport's own projection.
  const frame = planeFrame('XY');
  const p0 = viewport.current.planePoint(0, 0, frame);
  const px = viewport.current.planePoint(1, 0, frame);
  const py = viewport.current.planePoint(0, 1, frame);
  const origin = [-p0[0] / (px[0] - p0[0]), -p0[1] / (py[1] - p0[1])];
  fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }));
  expect(document.activeElement).toBe(screen.getByLabelText('Sketch x'));
  // Hover a couple of pixels off the plate corner (0, 0) and click: it snaps there.
  const corner = [origin[0] + 2, origin[1] - 1];
  pointer(canvas, 'pointermove', ...corner);
  expect(screen.getByRole('status').textContent).toMatch(/X 0 · Y 0 mm · (origin|edge end)/);
  pointer(canvas, 'pointerdown', ...corner);
  pointer(canvas, 'pointerup', ...corner);
  const width = screen.getByLabelText('Sketch width');
  expect(document.activeElement).toBe(width);
  fireEvent.change(width, { target: { value: '120' } });
  fireEvent.keyDown(width, { key: 'Tab' });
  const height = screen.getByLabelText('Sketch height');
  expect(document.activeElement).toBe(height);
  fireEvent.change(height, { target: { value: '65' } });
  fireEvent.keyDown(height, { key: 'Enter' });
  expect(screen.getByRole('status').textContent).toMatch(/1 item · closed profile/);
  // Esc in the HUD ends the tool; Esc again (outside the HUD) exits.
  fireEvent.keyDown(screen.getByLabelText('Sketch x'), { key: 'Escape' });
  expect(screen.queryByLabelText('Sketch x')).toBeNull();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onFinish).toHaveBeenCalledWith([{ id: 'e1', type: 'rect', a: [0, 0], b: [120, 65] }], []);
});

it('snaps to measure mark points on the plane and shows them as diamonds', () => {
  const viewport = createRef();
  render(<Harness onFinish={vi.fn()} viewport={viewport} markPoints={[[300, 200]]} />);
  expect(named('sketch-marks')).toHaveLength(1);
  expect(named('sketch-marks')[0].material.color.getHexString()).toBe('8a3fc6');
  const canvas = document.querySelector('canvas');
  const frame = planeFrame('XY');
  const p0 = viewport.current.planePoint(0, 0, frame);
  const px = viewport.current.planePoint(1, 0, frame);
  const py = viewport.current.planePoint(0, 1, frame);
  const screenOf = ([u, v]) => [(u - p0[0]) / (px[0] - p0[0]), (v - p0[1]) / (py[1] - p0[1])];
  fireEvent.click(screen.getByRole('button', { name: 'Line' }));
  const [x, y] = screenOf([300, 200]);
  pointer(canvas, 'pointermove', x + 2, y - 1);
  expect(screen.getByRole('status').textContent).toMatch(/X 300 · Y 200 mm · mark/);
});

// Sketch dimensions SD-1 (docs/sketch-studio-sketch-dimensions.md §5.1): a
// 600 × 300 plate outline with a Ø80 hole, drawn on the XY plane.
const plate = [
  { id: 'e1', type: 'rect', a: [100, 100], b: [700, 400] },
  { id: 'e2', type: 'circle', c: [300, 250], r: 40 },
];
// HD-3: `view` the camera's focus (a change of it is a camera change), `onShapeOptionsChange` the shape options reported up.
function DimensionHarness({
  onFinish,
  viewport,
  entities = plate,
  dimensions = [],
  zero = null,
  onLookAt = () => {},
  view = focus,
  onShapeOptionsChange = null,
}) {
  const session = {
    key: 'd',
    frame: planeFrame('XY'),
    name: 'Sketch 1',
    support: { type: 'plane', plane: 'XY', offset: 0 },
    boundary: [],
    entities,
    dimensions,
    zero,
    span: 1200,
    gridBounds: [
      [-700, -950],
      [1700, 1450],
    ],
  };
  return (
    <div className="cad-model-view">
      <CadViewport ref={viewport} model={model} snapshot={snapshot} ready focusTarget={view} sketchMode="draw" />
      <CadSketcher
        viewport={viewport}
        session={session}
        snap={1}
        onSnapChange={() => {}}
        onFinish={onFinish}
        onCancel={() => {}}
        onLookAt={onLookAt}
        onShapeOptionsChange={onShapeOptionsChange}
      />
    </div>
  );
}
// Screen position of a plane point (the plane faces the camera: an affine map).
const screenMap = (viewport) => {
  const frame = planeFrame('XY');
  const p0 = viewport.current.planePoint(0, 0, frame);
  const px = viewport.current.planePoint(1, 0, frame);
  const py = viewport.current.planePoint(0, 1, frame);
  return ([u, v]) => [(u - p0[0]) / (px[0] - p0[0]), (v - p0[1]) / (py[1] - p0[1])];
};
const clickAt = (canvas, [x, y]) => {
  pointer(canvas, 'pointermove', x, y);
  pointer(canvas, 'pointerdown', x, y);
  pointer(canvas, 'pointerup', x, y);
};
const probe = () => document.querySelector('.cad-viewport').cadSketchDimensions();
const readout = () => screen.queryByLabelText('Dimension readout');
const statusText = () => screen.getByRole('status').textContent;

it('dimensions a hole centre to an edge in three clicks and finishes with it', () => {
  const onFinish = vi.fn();
  const viewport = createRef();
  render(<DimensionHarness onFinish={onFinish} viewport={viewport} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  const button = screen.getByRole('button', { name: 'Dimension' });
  button.focus();
  fireEvent.click(button);
  expect(button.getAttribute('aria-pressed')).toBe('true');
  // The button gives the focus up: Space / Enter cannot re-press it.
  expect(document.activeElement).not.toBe(button);
  expect(screen.queryByLabelText('Sketch x')).toBeNull();
  expect(statusText()).toContain('Click a point, or a line, circle or arc to dimension it.');
  // The hole centre, then the body of the plate's left side: read square to it.
  clickAt(canvas, at([300, 250]));
  expect(statusText()).toContain('Click the second point · an edge reads square to it');
  pointer(canvas, 'pointermove', ...at([100, 330]));
  expect(readout().textContent).toBe('200 mm · ΔX -200 · ΔY 0');
  expect(readout().querySelector('input')).toBeNull();
  expect(named('sketch-preview')).toHaveLength(1);
  clickAt(canvas, at([100, 330]));
  // Where it goes: beside the span, so horizontal.
  pointer(canvas, 'pointermove', ...at([200, 150]));
  expect(readout().textContent).toBe('Horizontal 200 mmclick to keep · Esc drops it');
  expect(probe()).toMatchObject([{ id: 'd1', text: '200', value: 200, preview: true }]);
  clickAt(canvas, at([200, 150]));
  expect(named('sketch-dimension')).toHaveLength(1);
  const [line] = named('sketch-dimension');
  expect(line.userData.dimensionId).toBe('d1');
  expect(line.material.color.getHexString()).toBe('8a3fc6');
  expect(line.material.depthTest).toBe(false);
  const [label] = probe();
  expect(label).toMatchObject({ id: 'd1', text: '200', value: 200, hidden: false, selected: false, preview: false });
  // The label sits on the middle of its dimension line.
  const [lx, ly] = at([200, 150]);
  expect(label.x).toBeCloseTo(lx, 0);
  expect(label.y).toBeCloseTo(ly, 0);
  const chips = screen.getByLabelText('Sketch dimensions').querySelectorAll('.cad-sketch-dim-label');
  expect([...chips].map((c) => c.textContent)).toEqual(['200']);
  expect(statusText()).toContain('2 items · closed profile · 1 dimension');
  expect(screen.getByRole('button', { name: 'Dimension' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Finish sketch' }));
  expect(onFinish).toHaveBeenCalledWith(plate, [
    { id: 'd1', type: 'linear', from: [300, 250], to: [100, 250], orientation: 'horizontal', offset: -100 },
  ]);
});

it('only measures when Esc comes before the place click, and D toggles the tool', () => {
  const viewport = createRef();
  render(<DimensionHarness onFinish={vi.fn()} viewport={viewport} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  const dimension = () => screen.getByRole('button', { name: 'Dimension' });
  fireEvent.keyDown(window, { key: 'd' });
  expect(dimension().getAttribute('aria-pressed')).toBe('true');
  // Two opposite corners: the diagonal is read, Esc keeps nothing.
  clickAt(canvas, at([100, 100]));
  clickAt(canvas, at([700, 400]));
  pointer(canvas, 'pointermove', ...at([900, 600]));
  expect(readout().textContent).toMatch(/^Aligned 670.82 mm/);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(probe()).toEqual([]);
  expect(named('sketch-dimension')).toHaveLength(0);
  expect(dimension().getAttribute('aria-pressed')).toBe('true');
  expect(statusText()).toMatch(/2 items · closed profile$/);
  fireEvent.keyDown(window, { key: 'D' });
  expect(dimension().getAttribute('aria-pressed')).toBe('false');
  // A drawing tool's field keeps its D once something is typed in it (SK-1).
  fireEvent.click(screen.getByRole('button', { name: 'Line' }));
  fireEvent.change(screen.getByLabelText('Sketch x'), { target: { value: '12' } });
  fireEvent.keyDown(screen.getByLabelText('Sketch x'), { key: 'd' });
  expect(screen.getByRole('button', { name: 'Line' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
  expect(dimension().getAttribute('aria-pressed')).toBe('false');
});

it('selects a dimension by its label and deletes it', () => {
  const kept = { id: 'd3', type: 'linear', from: [100, 400], to: [700, 400], orientation: 'horizontal', offset: 60 };
  const viewport = createRef();
  render(<DimensionHarness onFinish={vi.fn()} viewport={viewport} dimensions={[kept]} />);
  const canvas = document.querySelector('canvas');
  expect(probe()).toMatchObject([{ id: 'd3', text: '600' }]);
  expect(statusText()).toContain('2 items · closed profile · 1 dimension');
  const [{ x, y }] = probe();
  clickAt(canvas, [x + 3, y]);
  expect(screen.getByRole('note').textContent).toBe('Horizontal 600 mm · Delete removes it');
  expect(probe()[0].selected).toBe(true);
  expect(named('sketch-dimension')[0].material.color.getHexString()).toBe('e2541c');
  fireEvent.keyDown(window, { key: 'Delete' });
  expect(probe()).toEqual([]);
  expect(screen.queryByRole('note')).toBeNull();
});

it('does not finish dimensions with no drawing', () => {
  const onFinish = vi.fn();
  const viewport = createRef();
  const lone = { id: 'd1', type: 'linear', from: [0, 0], to: [100, 0], orientation: 'horizontal', offset: 20 };
  render(<DimensionHarness onFinish={onFinish} viewport={viewport} entities={[]} dimensions={[lone]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Finish sketch' }));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onFinish).not.toHaveBeenCalled();
  expect(statusText()).toContain(
    'Dimensions are kept with a drawing: draw the outline first, or Cancel sketch to leave.',
  );
  expect(screen.getByRole('toolbar', { name: 'Sketch tools' })).toBeTruthy();
});

// Bend reliefs BR-1 (docs/sketch-studio-bend-relief.md §5.1): a cross blank
// (base 400 × 200 from (300, 150), flaps 40) drawn on the XY plane; its inside
// corners are the base's corners.
const crossPoints = [
  [300, 110],
  [700, 110],
  [700, 150],
  [740, 150],
  [740, 350],
  [700, 350],
  [700, 390],
  [300, 390],
  [300, 350],
  [260, 350],
  [260, 150],
  [300, 150],
];
const cross = crossPoints.map((p, i) => ({
  id: `e${i + 1}`,
  type: 'line',
  a: p,
  b: crossPoints[(i + 1) % crossPoints.length],
}));
function ReliefHarness({ onFinish = () => {}, onReliefChange, viewport, sheet = null, relief = null }) {
  const session = {
    key: 'r',
    frame: planeFrame('XY'),
    name: 'Sketch 1',
    support: { type: 'plane', plane: 'XY', offset: 0 },
    boundary: [],
    entities: cross,
    ...(sheet ? { sheet } : {}),
    span: 1200,
    gridBounds: [
      [-700, -950],
      [1700, 1450],
    ],
  };
  return (
    <div className="cad-model-view">
      <CadViewport ref={viewport} model={model} snapshot={snapshot} ready focusTarget={focus} sketchMode="draw" />
      <CadSketcher
        viewport={viewport}
        session={session}
        snap={1}
        onSnapChange={() => {}}
        onFinish={onFinish}
        onCancel={() => {}}
        onLookAt={() => {}}
        relief={relief}
        onReliefChange={onReliefChange}
      />
    </div>
  );
}
const options = () => screen.queryByRole('group', { name: 'Relief options' });

it('cuts a square relief into a corner of the cross from the Relief button, and finishes with it', () => {
  const onFinish = vi.fn();
  const viewport = createRef();
  render(<ReliefHarness onFinish={onFinish} viewport={viewport} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  expect(options()).toBeNull();
  const button = screen.getByRole('button', { name: 'Relief' });
  button.focus();
  fireEvent.click(button);
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).not.toBe(button);
  expect(screen.queryByLabelText('Sketch x')).toBeNull();
  // The options row: Square first, its size empty with the automatic size for 1.5 mm SPCC.
  expect(options()).toBeTruthy();
  const shape = screen.getByLabelText('Relief shape');
  expect(shape.value).toBe('square');
  expect([...shape.options].map((o) => o.textContent)).toEqual(['Square', 'Round', 'Obround', 'Rectangular']);
  expect(screen.getByLabelText('Relief size (mm)').value).toBe('');
  expect(screen.getByLabelText('Relief size (mm)').placeholder).toBe('4.6');
  expect(screen.getByLabelText('Relief sheet thickness (mm)').value).toBe('1.5');
  expect(statusText()).toContain('Move to an inside corner and click to cut the relief');
  expect(statusText()).toContain('12 items · closed profile');
  pointer(canvas, 'pointermove', ...at([300, 150]));
  expect(screen.getByLabelText('Relief readout').textContent).toBe('Square 4.6 × 4.6click to cut · Esc ends the tool');
  expect(named('sketch-preview')).toHaveLength(4);
  clickAt(canvas, at([300, 150]));
  expect(statusText()).toContain('16 items · closed profile');
  expect(screen.getByRole('button', { name: 'Relief' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Finish sketch' }));
  const [entities, dimensions] = onFinish.mock.calls[0];
  expect(dimensions).toEqual([]);
  expect(entities.find((e) => e.id === 'e11').b).toEqual([297.7, 150]);
  expect(entities.slice(11, 15)).toEqual([
    { id: 'e13', type: 'line', a: [297.7, 150], b: [297.7, 152.3] },
    { id: 'e14', type: 'line', a: [297.7, 152.3], b: [302.3, 152.3] },
    { id: 'e15', type: 'line', a: [302.3, 152.3], b: [302.3, 147.7] },
    { id: 'e16', type: 'line', a: [302.3, 147.7], b: [300, 147.7] },
  ]);
});

it('reports a shape change up, cuts a round relief, and B toggles the tool (R is the rectangle)', () => {
  const onFinish = vi.fn();
  const onReliefChange = vi.fn();
  const viewport = createRef();
  render(<ReliefHarness onFinish={onFinish} onReliefChange={onReliefChange} viewport={viewport} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  const relief = () => screen.getByRole('button', { name: 'Relief' });
  fireEvent.keyDown(window, { key: 'b' });
  expect(relief().getAttribute('aria-pressed')).toBe('true');
  fireEvent.change(screen.getByLabelText('Relief shape'), { target: { value: 'round' } });
  expect(onReliefChange).toHaveBeenLastCalledWith({
    shape: 'round',
    sizes: { diameter: null, size: null, width: null, depth: null },
    sheet: { thickness: 1.5, stock: 'spcc' },
  });
  expect(screen.queryByLabelText('Relief size (mm)')).toBeNull();
  expect(screen.getByLabelText('Relief diameter (mm)').placeholder).toBe('4.6');
  // The sheet thickness changes the automatic size, and is reported too.
  const thickness = screen.getByLabelText('Relief sheet thickness (mm)');
  fireEvent.change(thickness, { target: { value: '1.2' } });
  fireEvent.keyDown(thickness, { key: 'Enter' });
  expect(screen.getByLabelText('Relief diameter (mm)').placeholder).toBe('4');
  expect(onReliefChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ sheet: { thickness: 1.2, stock: 'spcc' } }),
  );
  clickAt(canvas, at([700, 350]));
  expect(statusText()).toContain('13 items · closed profile');
  // B again: the tool goes, the row with it.
  fireEvent.keyDown(window, { key: 'B' });
  expect(relief().getAttribute('aria-pressed')).toBe('false');
  expect(options()).toBeNull();
  fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
  expect(relief().getAttribute('aria-pressed')).toBe('false');
  // R is the rectangle now.
  fireEvent.keyDown(window, { key: 'r' });
  expect(relief().getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByRole('button', { name: 'Rectangle' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Finish sketch' }));
  const [entities] = onFinish.mock.calls[0];
  expect(entities.filter((e) => e.type === 'arc')).toEqual([
    { id: 'e13', type: 'arc', a: [702, 350], b: [700, 352], m: [698.585786, 348.585786] },
  ]);
});

it('takes a typed size (empty is automatic again), and shows a cut part’s own sheet as text', async () => {
  const viewport = createRef();
  render(
    <ReliefHarness
      viewport={viewport}
      sheet={{ thickness: 1.2, stock: 'spcc', fixed: true }}
      relief={{ shape: 'square', sizes: { size: 3 }, sheet: { thickness: 2, stock: 'spcc' } }}
    />,
  );
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  fireEvent.click(screen.getByRole('button', { name: 'Relief' }));
  expect(options().textContent).toContain('1.2 mm SPCC (this part)');
  expect(screen.queryByLabelText('Relief sheet thickness (mm)')).toBeNull();
  const size = screen.getByLabelText('Relief size (mm)');
  expect(size.value).toBe('3');
  pointer(canvas, 'pointermove', ...at([300, 150]));
  expect(screen.getByLabelText('Relief readout').textContent).toMatch(/^Square 3 × 3/);
  // Emptied and committed: automatic for the part's 1.2 mm again.
  fireEvent.change(size, { target: { value: '' } });
  fireEvent.keyDown(size, { key: 'Enter' });
  expect(size.value).toBe('');
  expect(size.placeholder).toBe('4');
  pointer(canvas, 'pointermove', ...at([300, 150]));
  expect(screen.getByLabelText('Relief readout').textContent).toMatch(/^Square 4 × 4/);
  // Esc in the box leaves it, so the next Esc reaches the sketcher and ends the tool.
  size.focus();
  fireEvent.keyDown(size, { key: 'Escape' });
  await act(() => new Promise((done) => setTimeout(done, 0)));
  expect(document.activeElement).not.toBe(size);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Relief' }).getAttribute('aria-pressed')).toBe('false');
});

// Sketch keys SK-1 (docs/sketch-studio-sketch-shortcuts.md §4): every tool of
// the bar has a key, read from the window and from an empty HUD field; Ctrl+Z
// is Undo last and goes no further.
const pressed = (name) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
const KEYS = [
  ['Line', 'L', { key: 'l' }],
  ['Rectangle', 'R', { key: 'r' }],
  ['Center rectangle', 'Shift+R', { key: 'R', shiftKey: true }],
  ['Circle', 'C', { key: 'c' }],
  ['3-point arc', 'A', { key: 'a' }],
  ['Dimension', 'D', { key: 'd' }],
  ['Relief', 'B', { key: 'b' }],
];
// The HUD as typed values, the last one applied with Enter.
const typeStep = (values) => {
  const entries = Object.entries(values);
  for (const [field, value] of entries)
    fireEvent.change(screen.getByLabelText(`Sketch ${field}`), { target: { value: String(value) } });
  fireEvent.keyDown(screen.getByLabelText(`Sketch ${entries.at(-1)[0]}`), { key: 'Enter' });
};

it('turns each tool on with its key and off again, and each button says its key', () => {
  render(<Harness onFinish={vi.fn()} viewport={createRef()} />);
  for (const [name, key, event] of KEYS) {
    const button = screen.getByRole('button', { name });
    expect(button.title).toBe(`${name} (${key})`);
    expect(button.getAttribute('aria-keyshortcuts')).toBe(key);
    fireEvent.keyDown(document.body, event);
    expect(pressed(name), name).toBe('true');
    expect(KEYS.filter(([other]) => other !== name && pressed(other) === 'true')).toEqual([]);
    // Off again from wherever the focus went: the HUD field of a drawing tool, else the page.
    const drawing = !['Dimension', 'Relief'].includes(name);
    expect(document.activeElement === screen.queryByLabelText('Sketch x'), name).toBe(drawing);
    fireEvent.keyDown(document.activeElement, event);
    expect(pressed(name), name).toBe('false');
    expect(screen.queryByLabelText('Sketch x')).toBeNull();
  }
  const undo = screen.getByRole('button', { name: 'Undo last' });
  expect(undo.title).toBe('Undo last (Ctrl+Z)');
  expect(undo.getAttribute('aria-keyshortcuts')).toBe('Control+Z Meta+Z');
});

it('switches tool from an empty HUD field only: typed text keeps its letters, and Ctrl is no key', () => {
  render(<Harness onFinish={vi.fn()} viewport={createRef()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Circle' }));
  const field = () => screen.getByLabelText('Sketch x');
  expect(document.activeElement).toBe(field());
  // L from the empty field: Line, and the letter is not typed.
  expect(fireEvent.keyDown(field(), { key: 'l' })).toBe(false);
  expect(pressed('Line')).toBe('true');
  expect(pressed('Circle')).toBe('false');
  expect(field().value).toBe('');
  expect(document.activeElement).toBe(field());
  // "12" then e (1e3) or a tool's letter: the field's.
  fireEvent.change(field(), { target: { value: '12' } });
  expect(fireEvent.keyDown(field(), { key: 'e' })).toBe(true);
  expect(fireEvent.keyDown(field(), { key: 'c' })).toBe(true);
  expect(pressed('Line')).toBe('true');
  expect(field().value).toBe('12');
  // An "=" expression: its letters are names.
  fireEvent.change(field(), { target: { value: '=' } });
  for (const key of ['a', 'b', 'r', 'd']) expect(fireEvent.keyDown(field(), { key })).toBe(true);
  expect(pressed('Line')).toBe('true');
  // With Ctrl, Alt or a held key, no tool key; in the Snap box none either.
  fireEvent.change(field(), { target: { value: '' } });
  expect(fireEvent.keyDown(field(), { key: 'c', ctrlKey: true })).toBe(true);
  expect(fireEvent.keyDown(field(), { key: 'c', altKey: true })).toBe(true);
  expect(fireEvent.keyDown(field(), { key: 'c', repeat: true })).toBe(true);
  fireEvent.keyDown(window, { key: 'c', metaKey: true });
  expect(fireEvent.keyDown(screen.getByLabelText('Sketch snap (mm)'), { key: 'c' })).toBe(true);
  expect(pressed('Line')).toBe('true');
  expect(pressed('Circle')).toBe('false');
});

it('takes Ctrl+Z as Undo last, from the HUD field and the page, and lets nothing else see it', () => {
  const onFinish = vi.fn();
  const onCancel = vi.fn();
  render(<Harness onFinish={onFinish} onCancel={onCancel} viewport={createRef()} />);
  // A window listener standing for the studio's own Ctrl+Z (useSketchKeyboard).
  const studio = vi.fn();
  window.addEventListener('keydown', studio);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }));
    typeStep({ x: 0, y: 0 });
    typeStep({ width: 100, height: 50 });
    fireEvent.click(screen.getByRole('button', { name: 'Circle' }));
    typeStep({ x: 300, y: 200 });
    typeStep({ radius: 40 });
    typeStep({ x: 600, y: 200 });
    typeStep({ radius: 20 });
    expect(statusText()).toContain('3 items');
    // In the Snap box Ctrl+Z is the box's own: the sketch keeps all three.
    expect(fireEvent.keyDown(screen.getByLabelText('Sketch snap (mm)'), { key: 'z', ctrlKey: true })).toBe(true);
    expect(statusText()).toContain('3 items');
    // From the Circle's empty HUD field: the last circle goes, the tool stays.
    expect(document.activeElement).toBe(screen.getByLabelText('Sketch x'));
    expect(fireEvent.keyDown(document.activeElement, { key: 'z', ctrlKey: true })).toBe(false);
    expect(statusText()).toContain('2 items');
    expect(pressed('Circle')).toBe('true');
    // From typed text too (a field's own text undo is not kept there): the
    // other circle goes, and the typing with it.
    const x = screen.getByLabelText('Sketch x');
    fireEvent.change(x, { target: { value: '7' } });
    expect(fireEvent.keyDown(x, { key: 'z', ctrlKey: true })).toBe(false);
    expect(statusText()).toContain('1 item · closed profile');
    expect(screen.getByLabelText('Sketch x').value).toBe('');
    // From the page (Meta+Z as well): the rectangle goes.
    fireEvent.keyDown(screen.getByLabelText('Sketch x'), { key: 'Escape' });
    expect(fireEvent.keyDown(document.body, { key: 'z', metaKey: true })).toBe(false);
    expect(statusText()).toContain('0 items · no profile yet');
    expect(studio).not.toHaveBeenCalled();
    // HD-1: Ctrl+Shift+Z is Redo, taken the same way (the rectangle comes back), never the studio's.
    expect(fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(statusText()).toContain('1 item · closed profile');
    expect(studio).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('keydown', studio);
  }
  expect(onFinish).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
});

// Hand drawing HD-1 (docs/sketch-studio-hand-drawing.md §5.5): an 800 × 500
// plate with five Ø20 holes on its middle line, drawn on the XY plane (the
// test canvas is 400 px wide: about 8 mm a pixel, a 64 mm pick radius).
const panel = [
  { id: 'e1', type: 'rect', a: [100, 0], b: [900, 500] },
  ...[300, 400, 500, 600, 700].map((x, i) => ({ id: `e${i + 2}`, type: 'circle', c: [x, 250], r: 10 })),
];
const note = () => screen.queryByRole('note');
// A left drag on the canvas the way a browser sends it: down, moves (the caller sends the up).
const dragTo = (canvas, from, to, steps = 4) => {
  pointer(canvas, 'pointermove', ...from);
  pointer(canvas, 'pointerdown', ...from);
  for (let i = 1; i <= steps; i++)
    pointer(
      canvas,
      'pointermove',
      from[0] + ((to[0] - from[0]) * i) / steps,
      from[1] + ((to[1] - from[1]) * i) / steps,
    );
};

it('selects by a box dragged to the right (inside, solid) and to the left (touching, dashed), then deletes in one step', () => {
  const viewport = createRef();
  render(<DimensionHarness onFinish={vi.fn()} viewport={viewport} entities={panel} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  // To the right from a point on nothing: the three left holes lie wholly inside.
  dragTo(canvas, at([220, 120]), at([520, 380]));
  const [box] = named('sketch-box');
  expect(box.userData.mode).toBe('inside');
  expect(box.material.isLineDashedMaterial).toBeFalsy();
  expect(named('sketch-box-fill')).toHaveLength(1);
  expect(statusText()).toContain('3 wholly inside · release to select');
  expect(note()).toBeNull();
  pointer(canvas, 'pointerup', ...at([520, 380]));
  expect(named('sketch-box')).toHaveLength(0);
  expect(note().textContent).toBe('3 selected: 3 circles · Delete removes them');
  // The selection drawn in the selected colour, as one batch.
  const selected = named('sketch-entity').find((o) => o.userData.entityIds);
  expect(selected.userData.entityIds).toEqual(['e2', 'e3', 'e4']);
  expect(selected.material.color.getHexString()).toBe('e2541c');
  // To the left over the middle line: every hole it touches, none lying inside it.
  dragTo(canvas, at([790, 390]), at([230, 245]));
  const [crossing] = named('sketch-box');
  expect(crossing.userData.mode).toBe('touching');
  expect(crossing.material.isLineDashedMaterial).toBe(true);
  expect(statusText()).toContain('5 touched · release to select');
  pointer(canvas, 'pointerup', ...at([230, 245]));
  expect(note().textContent).toBe('5 selected: 5 circles · Delete removes them');
  // Delete: the five in one step, Undo last brings all five back, Redo takes them again.
  fireEvent.keyDown(window, { key: 'Delete' });
  expect(statusText()).toContain('1 item · closed profile');
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
  expect(statusText()).toContain('6 items · closed profile');
  fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
  expect(statusText()).toContain('1 item · closed profile');
});

it('drops a box on Esc before the release, and a press on an entity is a click, never a box', () => {
  const viewport = createRef();
  render(<DimensionHarness onFinish={vi.fn()} viewport={viewport} entities={panel} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  dragTo(canvas, at([220, 120]), at([520, 380]));
  expect(named('sketch-box')).toHaveLength(1);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(named('sketch-box')).toHaveLength(0);
  pointer(canvas, 'pointermove', ...at([530, 390]));
  pointer(canvas, 'pointerup', ...at([530, 390]));
  expect(note()).toBeNull();
  expect(named('sketch-box')).toHaveLength(0);
  // Begun on the second hole and dragged away: no box, nothing selected.
  dragTo(canvas, at([410, 250]), at([600, 400]));
  expect(named('sketch-box')).toHaveLength(0);
  pointer(canvas, 'pointerup', ...at([600, 400]));
  expect(note()).toBeNull();
});

it('shows a selected circle’s numbers in the row; a typed diameter and Enter change it, and Finish gets it', () => {
  const onFinish = vi.fn();
  const viewport = createRef();
  render(<DimensionHarness onFinish={onFinish} viewport={viewport} entities={panel} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  clickAt(canvas, at([310, 250]));
  expect(note().textContent).toBe('Circle Ø20 at (300, 250) · Delete removes it');
  const row = screen.getByRole('group', { name: 'Selection' });
  const box = (label) => within(row).getByLabelText(`Selected ${label}`);
  expect([box('X (mm)').value, box('Y (mm)').value, box('Diameter (mm)').value]).toEqual(['300', '250', '20']);
  expect(within(row).queryByLabelText('Selected Width (mm)')).toBeNull();
  // Typed, nothing changes until Enter.
  const diameter = box('Diameter (mm)');
  fireEvent.keyDown(diameter, { key: '1' });
  fireEvent.change(diameter, { target: { value: '12' } });
  expect(note().textContent).toBe('Circle Ø20 at (300, 250) · Delete removes it');
  fireEvent.keyDown(diameter, { key: 'Enter' });
  expect(note().textContent).toBe('Circle Ø12 at (300, 250) · Delete removes it');
  // Leaving a typed box applies it too.
  const x = box('X (mm)');
  fireEvent.keyDown(x, { key: '3' });
  fireEvent.change(x, { target: { value: '250' } });
  fireEvent.blur(x);
  expect(note().textContent).toBe('Circle Ø12 at (250, 250) · Delete removes it');
  // A refusal stands in the row, and nothing changes.
  fireEvent.keyDown(diameter, { key: '0' });
  fireEvent.change(diameter, { target: { value: '0' } });
  fireEvent.keyDown(diameter, { key: 'Enter' });
  expect(row.textContent).toContain('A circle needs a diameter greater than zero.');
  expect(note().textContent).toBe('Circle Ø12 at (250, 250) · Delete removes it');
  // Esc clears the selection, then Esc finishes.
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('group', { name: 'Selection' })).toBeNull();
  expect(onFinish).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'Escape' });
  const [entities] = onFinish.mock.calls[0];
  expect(entities[1]).toEqual({ id: 'e2', type: 'circle', c: [250, 250], r: 6 });
  expect(entities.filter((e, i) => e !== panel[i]).map((e) => e.id)).toEqual(['e2']);
});

it('has Redo by its button and both keys, with Undo last disabled on a sketch just opened', () => {
  render(<DimensionHarness onFinish={vi.fn()} viewport={createRef()} entities={panel} />);
  const undo = screen.getByRole('button', { name: 'Undo last' });
  const redo = screen.getByRole('button', { name: 'Redo' });
  expect(undo.disabled).toBe(true);
  expect(redo.disabled).toBe(true);
  expect(redo.title).toBe('Redo (Ctrl+Y or Ctrl+Shift+Z)');
  expect(redo.getAttribute('aria-keyshortcuts')).toBe('Control+Y Meta+Y Control+Shift+Z Meta+Shift+Z');
  // The bar's groups, each with its label (HD-4, §8.6: Edit between Draw and Mark).
  expect(
    [...screen.getByRole('toolbar', { name: 'Sketch tools' }).querySelectorAll('[role="group"]')].map((g) =>
      g.getAttribute('aria-label'),
    ),
  ).toEqual(['Draw', 'Edit', 'Mark', 'History']);
  fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
  expect(note().textContent).toBe('6 selected: 1 rectangle, 5 circles · Delete removes them');
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  expect(statusText()).toContain('0 items · no profile yet');
  expect(undo.disabled).toBe(false);
  fireEvent.click(undo);
  expect(statusText()).toContain('6 items · closed profile');
  expect(redo.disabled).toBe(false);
  fireEvent.click(redo);
  expect(statusText()).toContain('0 items');
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
  expect(statusText()).toContain('6 items');
  expect(fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true })).toBe(false);
  expect(statusText()).toContain('0 items');
  expect(redo.disabled).toBe(true);
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
  expect(statusText()).toContain('6 items');
  expect(undo.disabled).toBe(true);
});

it('draws a construction line with X armed: dashed in the model-edge colour, counted apart, left out of the profile', () => {
  const onFinish = vi.fn();
  render(<DimensionHarness onFinish={onFinish} viewport={createRef()} entities={panel} />);
  const construction = () => screen.getByRole('button', { name: 'Construction' });
  expect(construction().title).toBe('Construction (X): a selection becomes construction, or what you draw next is');
  expect(construction().getAttribute('aria-keyshortcuts')).toBe('X');
  fireEvent.keyDown(window, { key: 'x' });
  expect(construction().getAttribute('aria-pressed')).toBe('true');
  fireEvent.keyDown(window, { key: 'l' });
  expect(statusText()).toContain('Construction · Click the start point');
  typeStep({ x: 200, y: 250 });
  typeStep({ length: 600, angle: 0 });
  // X from the empty HUD field turns it off again; the letter is not typed.
  expect(fireEvent.keyDown(screen.getByLabelText('Sketch length'), { key: 'x' })).toBe(false);
  expect(construction().getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByLabelText('Sketch length').value).toBe('');
  fireEvent.keyDown(screen.getByLabelText('Sketch length'), { key: 'Escape' });
  expect(statusText()).toContain('7 items · 1 construction · closed profile');
  const [dashed] = named('sketch-construction');
  expect(dashed.material.isLineDashedMaterial).toBe(true);
  expect(dashed.material.color.getHexString()).toBe('e0861a');
  expect(dashed.userData.entityIds).toEqual(['e7']);
  // Selected, it is drawn dashed in the selected colour; X on it is one Undo step.
  fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
  expect(construction().getAttribute('aria-pressed')).toBe('false');
  fireEvent.keyDown(window, { key: 'x' });
  expect(construction().getAttribute('aria-pressed')).toBe('true');
  expect(statusText()).toContain('7 items · 7 construction · no profile yet');
  expect(named('sketch-construction')[0].material.color.getHexString()).toBe('e2541c');
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
  expect(statusText()).toContain('7 items · 1 construction · closed profile');
  fireEvent.keyDown(window, { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Finish sketch' }));
  const [entities] = onFinish.mock.calls[0];
  expect(entities.at(-1)).toEqual({ id: 'e7', type: 'line', a: [200, 250], b: [800, 250], construction: true });
});

it('finishes a stored sketch unchanged when nothing was done', () => {
  const onFinish = vi.fn();
  const stored = [{ id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] }];
  const dimensions = [
    { id: 'd1', type: 'linear', from: [0, 60], to: [100, 60], orientation: 'horizontal', offset: 10 },
  ];
  render(<DimensionHarness onFinish={onFinish} viewport={createRef()} entities={stored} dimensions={dimensions} />);
  fireEvent.click(screen.getByRole('button', { name: 'Finish sketch' }));
  expect(onFinish.mock.calls[0][0]).toBe(stored);
  expect(onFinish.mock.calls[0][1]).toBe(dimensions);
});

// Hand drawing HD-2 (docs/sketch-studio-hand-drawing.md §6.7): the four boxes
// of a line's next point, the zero, Check, and stored sketches with and
// without a zero.
const overlayProbe = () => document.querySelector('.cad-viewport').cadSketchOverlay();
const hudBox = (field) => screen.getByLabelText(`Sketch ${field}`);
// The L outline of sketchCheck.test.js, its last line stopping 0.3 mm short of its start.
const gappedL = [
  [0, 0],
  [100, 0],
  [100, 40],
  [40, 40],
  [40, 80],
  [0, 80],
  [0, 0.3],
]
  .slice(0, -1)
  .map((a, i, corners) => ({ id: `e${i + 1}`, type: 'line', a, b: i === 5 ? [0, 0.3] : corners[i + 1] }));

it('asks Length, Angle · X, Y for a line’s next point, greys the pair not typed, and takes @ from the last point', () => {
  const onFinish = vi.fn();
  render(<DimensionHarness onFinish={onFinish} viewport={createRef()} entities={panel} />);
  fireEvent.keyDown(window, { key: 'l' });
  typeStep({ x: 200, y: 250 });
  expect(document.activeElement).toBe(hudBox('length'));
  const rows = [...document.querySelectorAll('.cad-sketch-hud-row')].map((row) =>
    [...row.querySelectorAll('input')].map((input) => input.getAttribute('aria-label')),
  );
  expect(rows).toEqual([
    ['Sketch length', 'Sketch angle'],
    ['Sketch x', 'Sketch y'],
  ]);
  // Length typed: X and Y greyed with the point it gives (Angle the live 0: no cursor yet).
  fireEvent.change(hudBox('length'), { target: { value: '100' } });
  expect(hudBox('x').className).toContain('is-derived');
  expect([hudBox('x').placeholder, hudBox('y').placeholder]).toEqual(['300', '250']);
  expect(hudBox('length').className).not.toContain('is-derived');
  // X typed with @: Length emptied, Length and Angle greyed; the line under X says the X it gives.
  fireEvent.change(hudBox('x'), { target: { value: '@50' } });
  expect(hudBox('length').value).toBe('');
  expect(hudBox('length').className).toContain('is-derived');
  expect(screen.getByLabelText('X resolves to').textContent).toBe('= 250');
  expect(hudBox('x').title).toBe('From the zero · @ before a number measures from the last point (@25)');
  fireEvent.change(hudBox('y'), { target: { value: '@-20' } });
  expect([hudBox('length').placeholder, hudBox('angle').placeholder]).toEqual(['53.85', '-21.8']);
  fireEvent.keyDown(hudBox('y'), { key: 'Enter' });
  expect(statusText()).toContain('7 items');
  fireEvent.keyDown(hudBox('length'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Finish sketch' }));
  expect(onFinish.mock.calls[0][0].at(-1)).toEqual({ id: 'e7', type: 'line', a: [200, 250], b: [250, 230] });
  // The zero was never moved: Finish hands over the drawing only, as before.
  expect(onFinish.mock.calls[0]).toHaveLength(2);
});

it('moves the zero by a click (Z) and by typing, marks it, measures every X, Y from it, and resets it', () => {
  const onFinish = vi.fn();
  const viewport = createRef();
  render(<DimensionHarness onFinish={onFinish} viewport={viewport} entities={panel} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  const zeroButton = () => screen.getByRole('button', { name: 'Zero' });
  expect(zeroButton().getAttribute('aria-pressed')).toBe('false');
  expect(zeroButton().title).toBe('Zero (Z): click a point to measure X and Y from it');
  expect(zeroButton().getAttribute('aria-keyshortcuts')).toBe('Z');
  // The bar's order: … Snap · Zero · Look at · Check · Finish sketch (by name: HD-4, §8.6 shows "Finish", "Cancel").
  const buttons = [...screen.getByRole('toolbar', { name: 'Sketch tools' }).querySelectorAll('button')];
  const names = buttons.map((b) => b.getAttribute('aria-label') || b.textContent);
  expect(names.slice(names.indexOf('Redo') + 1)).toEqual([
    'Zero',
    'Look at',
    'Check',
    'Finish sketch',
    'Cancel sketch',
  ]);
  expect(buttons.slice(-2).map((b) => b.textContent)).toEqual(['Finish', 'Cancel']);
  fireEvent.keyDown(window, { key: 'z' });
  expect(zeroButton().getAttribute('aria-pressed')).toBe('true');
  const options = () => screen.queryByRole('group', { name: 'Zero options' });
  expect(options().textContent).toBe('The zero is the sketch origin · click a point to measure from it');
  expect(statusText()).toContain('Click a point to measure X and Y from it');
  // A click on the plate's lower-right corner (900, 0): the zero goes there, the tool ends.
  clickAt(canvas, at([904, 4]));
  expect(zeroButton().getAttribute('aria-pressed')).toBe('true');
  expect(zeroButton().title).toBe('Zero at (900, 0): Z to move or reset it');
  expect(options()).toBeNull();
  expect(screen.queryByLabelText('Sketch x')).toBeNull();
  expect(overlayProbe().zero).toEqual({ at: [900, 0], color: '#e2541c' });
  expect(named('sketch-zero').length).toBeGreaterThan(0);
  // The status readout and the selection's note and row, from the zero.
  pointer(canvas, 'pointermove', ...at([700, 250]));
  expect(statusText()).toMatch(/X -200 · Y 250 mm from the zero · /);
  clickAt(canvas, at([710, 250]));
  expect(note().textContent).toBe('Circle Ø20 at (-200, 250) · Delete removes it');
  const row = screen.getByRole('group', { name: 'Selection' });
  expect(within(row).getByLabelText('Selected X (mm)').value).toBe('-200');
  expect(within(row).getByLabelText('Selected X (mm)').title).toBe('X from the zero');
  // Typed from the zero: X −150 puts the circle at 750 in the sketch.
  fireEvent.change(within(row).getByLabelText('Selected X (mm)'), { target: { value: '-150' } });
  fireEvent.keyDown(within(row).getByLabelText('Selected X (mm)'), { key: 'Enter' });
  expect(note().textContent).toBe('Circle Ø20 at (-150, 250) · Delete removes it');
  fireEvent.keyDown(window, { key: 'Escape' });
  // Z again, typed X, Y (from the zero as it is): the zero moves 100 left.
  fireEvent.keyDown(window, { key: 'z' });
  expect(options().textContent).toBe('Zero at X 900, Y 0 from the sketch origin' + 'Reset zero');
  typeStep({ x: -100, y: 0 });
  expect(overlayProbe().zero.at).toEqual([800, 0]);
  // The zero is no Undo step: Undo takes the edit back, the zero stays.
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
  expect(overlayProbe().zero.at).toEqual([800, 0]);
  // Reset zero: back to the origin, the marker gone, Zero no longer pressed.
  fireEvent.click(zeroButton());
  fireEvent.click(within(options()).getByRole('button', { name: 'Reset zero' }));
  expect(options()).toBeNull();
  expect(overlayProbe().zero).toBe(null);
  expect(named('sketch-zero')).toHaveLength(0);
  expect(zeroButton().getAttribute('aria-pressed')).toBe('false');
  pointer(canvas, 'pointermove', ...at([700, 250]));
  expect(statusText()).not.toContain('from the zero');
});

it('opens Check from the status line and the bar, frames a row, fixes it in one Undo step, and Esc closes it', () => {
  const onFinish = vi.fn();
  const onLookAt = vi.fn();
  render(<DimensionHarness onFinish={onFinish} viewport={createRef()} entities={gappedL} onLookAt={onLookAt} />);
  const fixButton = () => screen.getByRole('button', { name: '6 items · open outline · 1 to fix' });
  expect(fixButton()).toBeTruthy();
  fireEvent.click(fixButton());
  const region = () => screen.queryByRole('region', { name: 'Check' });
  expect(within(region()).getByText('Check · 1 to fix')).toBeTruthy();
  const place = within(region()).getByRole('button', {
    name: 'Open end at (0, 0.3): 0.3 mm from the nearest other end',
  });
  expect(document.activeElement).toBe(place);
  // Its red marker while the list is open, larger for the row with the focus (or the pointer).
  expect(overlayProbe().problems).toEqual([
    { id: 'open-end:e6:b', at: [0, 0.3], radius: expect.any(Number), focused: true, color: '#d22f27' },
  ]);
  const larger = overlayProbe().problems[0].radius;
  fireEvent.blur(place);
  expect(overlayProbe().problems[0]).toMatchObject({ focused: false });
  expect(overlayProbe().problems[0].radius).toBeLessThan(larger);
  fireEvent.mouseEnter(place.closest('li'));
  expect(overlayProbe().problems[0].focused).toBe(true);
  fireEvent.mouseLeave(place.closest('li'));
  expect(overlayProbe().problems[0].focused).toBe(false);
  // Enter on the row is the row's own (its click), never the sketcher's Enter, which takes the key's default.
  expect(fireEvent.keyDown(place, { key: 'Enter' })).toBe(true);
  // The row frames its place and selects what it is about.
  fireEvent.click(place);
  expect(onLookAt).toHaveBeenCalledWith(
    [],
    [
      [0, 0.3],
      [0, 0],
    ],
    { place: true },
  );
  expect(note().textContent).toBe('2 selected: 2 lines · Delete removes them');
  // Close it: one step; the list says nothing is left, the focus stays in it.
  fireEvent.click(within(region()).getByRole('button', { name: 'Close it' }));
  expect(statusText()).toContain('6 items · closed profile');
  expect(screen.queryByRole('button', { name: /to fix$/ })).toBeNull();
  expect(within(region()).getByText('Check · nothing to fix')).toBeTruthy();
  expect(region().textContent).toContain('Nothing to fix: a closed outline with no cut-outs.');
  expect(region().contains(document.activeElement)).toBe(true);
  expect(overlayProbe().problems).toEqual([]);
  // Undo last brings the gap back, and its row.
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
  expect(statusText()).toContain('6 items · open outline · 1 to fix');
  expect(within(region()).getByText('Check · 1 to fix')).toBeTruthy();
  // Esc with the focus in it closes it, before anything else Esc does.
  fireEvent.keyDown(within(region()).getByRole('button', { name: 'Close' }), { key: 'Escape' });
  expect(region()).toBeNull();
  expect(overlayProbe().problems).toEqual([]);
  expect(note()).not.toBeNull();
  expect(onFinish).not.toHaveBeenCalled();
  // The bar's Check opens it (pressed) and closes it again.
  const check = screen.getByRole('button', { name: 'Check' });
  fireEvent.click(check);
  expect(check.getAttribute('aria-pressed')).toBe('true');
  expect(region()).not.toBeNull();
  fireEvent.click(check);
  expect(region()).toBeNull();
});

it('finishes a stored sketch with its zero unchanged, and one without as before', () => {
  const onFinish = vi.fn();
  const stored = [{ id: 'e1', type: 'rect', a: [0, 0], b: [100, 60] }];
  const { unmount } = render(
    <DimensionHarness onFinish={onFinish} viewport={createRef()} entities={stored} zero={[40, 40]} />,
  );
  expect(overlayProbe().zero).toEqual({ at: [40, 40], color: '#e2541c' });
  expect(screen.getByRole('button', { name: 'Zero' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Finish sketch' }));
  expect(onFinish.mock.calls[0][0]).toBe(stored);
  expect(onFinish.mock.calls[0][2]).toEqual({ zero: [40, 40] });
  unmount();
  render(<DimensionHarness onFinish={onFinish} viewport={createRef()} entities={stored} />);
  fireEvent.click(screen.getByRole('button', { name: 'Finish sketch' }));
  expect(onFinish.mock.calls[1]).toHaveLength(2);
  expect(onFinish.mock.calls[1][0]).toBe(stored);
});

// Hand drawing HD-3 (docs/sketch-studio-hand-drawing.md §7.8): the two tools
// and their rows, the selection row's actions, a drag through the real pointer
// sequence (and one put back by Esc), Pattern's ghost and Apply; and §7.0's
// markers sized from the view after a camera change with no pointer move.
it('draws a slot and a polygon from S and P with their rows; Center rect and Arc keep their names', () => {
  const onFinish = vi.fn();
  const onShapeOptionsChange = vi.fn();
  render(
    <DimensionHarness
      onFinish={onFinish}
      viewport={createRef()}
      entities={panel}
      onShapeOptionsChange={onShapeOptionsChange}
    />,
  );
  // The bar: Slot and Polygon in Draw; two buttons show shorter words, their accessible names whole.
  const draw = screen.getByRole('group', { name: 'Draw' });
  expect([...draw.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
    'Line',
    'Rectangle',
    'Center rect',
    'Circle',
    'Arc',
    'Slot',
    'Polygon',
  ]);
  expect(screen.getByRole('button', { name: 'Center rectangle' }).title).toBe('Center rectangle (Shift+R)');
  expect(screen.getByRole('button', { name: '3-point arc' }).textContent).toBe('Arc');
  expect(screen.getByRole('button', { name: 'Slot' }).title).toBe('Slot (S)');
  // S: the Slot tool and its row.
  fireEvent.keyDown(window, { key: 's' });
  expect(pressed('Slot')).toBe('true');
  const slotRow = screen.getByRole('group', { name: 'Slot options' });
  expect(within(slotRow).getByLabelText('Slot width (mm)').value).toBe('5');
  expect(within(slotRow).getByLabelText('Slot length is').value).toBe('overall');
  expect(within(slotRow).getByLabelText('Slot first click').value).toBe('center');
  expect(statusText()).toContain('Click the slot’s centre');
  // A width typed in the row is reported up for the next sketch.
  const width = within(slotRow).getByLabelText('Slot width (mm)');
  fireEvent.change(width, { target: { value: '4' } });
  fireEvent.keyDown(width, { key: 'Enter' });
  expect(onShapeOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ width: 4 }));
  typeStep({ x: 200, y: 400 });
  expect([...document.querySelectorAll('.cad-sketch-hud input')].map((i) => i.getAttribute('aria-label'))).toEqual([
    'Sketch length',
    'Sketch angle',
    'Sketch x',
    'Sketch y',
  ]);
  typeStep({ length: 30, angle: 90 });
  expect(statusText()).toContain('7 items · closed profile');
  // P from the empty HUD field: the Polygon tool; Sides in its row.
  fireEvent.keyDown(screen.getByLabelText('Sketch x'), { key: 'p' });
  expect(pressed('Polygon')).toBe('true');
  const polygonRow = screen.getByRole('group', { name: 'Polygon options' });
  fireEvent.change(within(polygonRow).getByLabelText('Polygon sides'), { target: { value: '8' } });
  fireEvent.keyDown(within(polygonRow).getByLabelText('Polygon sides'), { key: 'Enter' });
  typeStep({ x: 700, y: 400 });
  typeStep({ 'across flats': 20, angle: 0 });
  // The rectangle's row: Corner radius.
  fireEvent.keyDown(screen.getByLabelText('Sketch x'), { key: 'r' });
  expect(screen.getByRole('group', { name: 'Rectangle options' })).toBeTruthy();
  expect(screen.getByLabelText('Corner radius (mm)').placeholder).toBe('sharp');
  fireEvent.keyDown(screen.getByLabelText('Sketch x'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Finish sketch' }));
  const [entities] = onFinish.mock.calls[0];
  expect(entities.slice(-2)).toEqual([
    { id: 'e7', type: 'slot', c: [200, 400], length: 30, width: 4, angle: 90 },
    { id: 'e8', type: 'polygon', c: [700, 400], sides: 8, af: 20, angle: 0 },
  ]);
});

it('shows Move, Copy, Rotate, Mirror and Pattern in the selection row; Move by a typed ΔX, ΔY is one Undo step', () => {
  const viewport = createRef();
  render(<DimensionHarness onFinish={vi.fn()} viewport={viewport} entities={panel} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  // M with nothing selected says so.
  fireEvent.keyDown(window, { key: 'm' });
  expect(statusText()).toContain('Select what to move first.');
  clickAt(canvas, at([410, 250]));
  const row = screen.getByRole('group', { name: 'Selection' });
  expect([...row.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
    'Move',
    'Copy',
    'Rotate',
    'Mirror',
    'Pattern',
    'Delete selected',
  ]);
  expect(within(row).getByRole('button', { name: 'Move' }).getAttribute('aria-keyshortcuts')).toBe('M');
  fireEvent.click(within(row).getByRole('button', { name: 'Move' }));
  expect(within(row).getByRole('button', { name: 'Move' }).getAttribute('aria-pressed')).toBe('true');
  // The row shows the action's options instead of the numbers; the HUD takes the typing.
  expect(within(row).queryByLabelText('Selected X (mm)')).toBeNull();
  expect(document.activeElement).toBe(screen.getByLabelText('Sketch ΔX'));
  expect(statusText()).toContain('Move: click the base point, or type ΔX, ΔY');
  typeStep({ ΔX: 25, ΔY: -50 });
  expect(note().textContent).toBe('Circle Ø20 at (425, 200) · Delete removes it');
  expect(screen.queryByLabelText('Sketch ΔX')).toBeNull();
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
  expect(note().textContent).toBe('Circle Ø20 at (400, 250) · Delete removes it');
  // K: Copy stays on; Esc ends it and the copies are the selection.
  fireEvent.keyDown(window, { key: 'k' });
  typeStep({ ΔX: 0, ΔY: 100 });
  typeStep({ ΔX: 0, ΔY: 150 });
  expect(statusText()).toContain('8 items');
  expect(within(screen.getByRole('group', { name: 'Selection' })).getByText('2 copies made')).toBeTruthy();
  fireEvent.keyDown(screen.getByLabelText('Sketch ΔX'), { key: 'Escape' });
  expect(note().textContent).toBe('2 selected: 2 circles · Delete removes them');
});

it('drags a selected entity through the real pointer sequence; one dragged again and put back by Esc adds no step', () => {
  const viewport = createRef();
  render(<DimensionHarness onFinish={vi.fn()} viewport={viewport} entities={panel} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  clickAt(canvas, at([400, 250]));
  expect(note().textContent).toBe('Circle Ø20 at (400, 250) · Delete removes it');
  // Pressed on the selected hole, dragged: the selection drawn offset, the rest kept; released: moved, one step.
  dragTo(canvas, at([400, 250]), at([400, 420]), 6);
  expect(statusText()).toContain('Release to move it here');
  expect(overlayProbe().dragOffset).toEqual([0, 170]);
  expect(note().textContent).toBe('Circle Ø20 at (400, 250) · Delete removes it');
  pointer(canvas, 'pointerup', ...at([400, 420]));
  expect(note().textContent).toBe('Circle Ø20 at (400, 420) · Delete removes it');
  expect(overlayProbe().dragOffset).toBe(null);
  const undo = screen.getByRole('button', { name: 'Undo last' });
  expect(undo.disabled).toBe(false);
  // Again, and Esc before the release: everything where it was, no step.
  fireEvent.click(undo);
  expect(undo.disabled).toBe(true);
  dragTo(canvas, at([400, 250]), at([300, 100]), 6);
  expect(overlayProbe().dragOffset).not.toBe(null);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(overlayProbe().dragOffset).toBe(null);
  pointer(canvas, 'pointerup', ...at([300, 100]));
  expect(note().textContent).toBe('Circle Ø20 at (400, 250) · Delete removes it');
  expect(undo.disabled).toBe(true);
  // A pointercancel the same.
  dragTo(canvas, at([400, 250]), at([300, 100]), 6);
  pointer(canvas, 'pointercancel', ...at([300, 100]));
  expect(overlayProbe().dragOffset).toBe(null);
  expect(undo.disabled).toBe(true);
  // A press on an entity not selected stays a click: it selects, never moves.
  dragTo(canvas, at([500, 250]), at([500, 400]), 6);
  pointer(canvas, 'pointerup', ...at([500, 400]));
  expect(note().textContent).toBe('Circle Ø20 at (400, 250) · Delete removes it');
  expect(undo.disabled).toBe(true);
});

it('shows Pattern’s ghost of every copy and its count, and Apply adds them in one step', () => {
  const viewport = createRef();
  render(<DimensionHarness onFinish={vi.fn()} viewport={viewport} entities={panel} />);
  const canvas = document.querySelector('canvas');
  clickAt(canvas, screenMap(viewport)([300, 250]));
  fireEvent.keyDown(window, { key: 'g' });
  const row = screen.getByRole('group', { name: 'Selection' });
  expect(within(row).getByLabelText('Pattern kind').value).toBe('row');
  expect(overlayProbe().ghost).toBe(3);
  expect(within(row).getByLabelText('Pattern adds').textContent).toBe('adds 3');
  fireEvent.change(within(row).getByLabelText('Pattern kind'), { target: { value: 'grid' } });
  const rows = within(row).getByLabelText('Pattern rows');
  fireEvent.change(rows, { target: { value: '2' } });
  fireEvent.keyDown(rows, { key: 'Enter' });
  // 4 columns 30 apart × 2 rows: 7 new holes.
  expect(overlayProbe().ghost).toBe(7);
  expect(within(row).getByLabelText('Pattern adds').textContent).toBe('adds 7');
  fireEvent.click(within(row).getByRole('button', { name: 'Apply' }));
  expect(statusText()).toContain('13 items');
  expect(overlayProbe().ghost).toBe(0);
  expect(note().textContent).toBe('Circle Ø20 at (300, 250) · Delete removes it');
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
  expect(statusText()).toContain('6 items');
});

it('sizes the markers from the view after a camera change with no pointer move (§7.0)', async () => {
  // A laid-out view (400 × 200 px), so the orthographic camera's frustum follows its span.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
  const viewport = createRef();
  const { rerender } = render(<DimensionHarness onFinish={vi.fn()} viewport={viewport} entities={gappedL} />);
  fireEvent.click(screen.getByRole('button', { name: /to fix$/ }));
  const before = overlayProbe();
  // 1200 mm over 200 px: 6 mm a pixel, the marker 4 px. The camera closes in ten times (a Check row
  // framed, Look at, a wheel zoom): no pointer move.
  expect(before.markerSize).toBeCloseTo(24, 6);
  rerender(
    <DimensionHarness
      onFinish={vi.fn()}
      viewport={viewport}
      entities={gappedL}
      view={{ ...focus, position: [0, 0.3, 0], span: 120 }}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  const after = overlayProbe();
  expect(after.markerSize).toBeCloseTo(before.markerSize / 10, 6);
  expect(after.problems[0].radius).toBeLessThan(before.problems[0].radius / 4);
});

// Hand drawing HD-4 (docs/sketch-studio-hand-drawing.md §8.9): the Edit group
// and its three rows, a Trim click through the real pointer sequence, the
// readout's refusal, Offset's two clicks; §8.0's window blur and missed
// release during a drag-move; a focus on a zoomed orthographic camera.
it('shows the Edit group and its rows; trims through the real pointer sequence and says a refusal by the cursor', () => {
  const onShapeOptionsChange = vi.fn();
  const viewport = createRef();
  // The plate, its hole, and a plumb line across the plate at x = 500.
  const across = { id: 'e3', type: 'line', a: [500, 0], b: [500, 500] };
  render(
    <DimensionHarness
      onFinish={vi.fn()}
      viewport={viewport}
      entities={[...plate, across]}
      onShapeOptionsChange={onShapeOptionsChange}
    />,
  );
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  const edit = screen.getByRole('group', { name: 'Edit' });
  expect([...edit.querySelectorAll('button')].map((b) => [b.textContent, b.title])).toEqual([
    ['Trim', 'Trim (T)'],
    ['Extend', 'Extend (E)'],
    ['Fillet', 'Fillet (F)'],
    ['Chamfer', 'Chamfer (H)'],
    ['Offset', 'Offset (O)'],
  ]);
  // T: Trim, no boxes by the cursor; the span over the plate's top previews red and the readout says it.
  fireEvent.keyDown(window, { key: 't' });
  expect(pressed('Trim')).toBe('true');
  expect(screen.queryByLabelText('Sketch x')).toBeNull();
  expect(statusText()).toContain('Trim: move over a piece');
  pointer(canvas, 'pointermove', ...at([500, 470]));
  expect(screen.getByLabelText('Trim readout').textContent).toBe('Trim 100 mmclick to trim · Esc ends the tool');
  expect(overlayProbe()).toMatchObject({ cut: 1, cutColor: '#d22f27' });
  clickAt(canvas, at([500, 470]));
  expect(pressed('Trim')).toBe('true');
  expect(screen.getByRole('button', { name: 'Undo last' }).disabled).toBe(false);
  pointer(canvas, 'pointermove', ...at([500, 40]));
  clickAt(canvas, at([500, 40]));
  // Nothing under the cursor: the refusal by it, and a click changes nothing.
  pointer(canvas, 'pointermove', ...at([1300, 900]));
  expect(screen.getByLabelText('Trim readout').textContent).toBe('Point at a line, arc or circle to trim.');
  expect(overlayProbe().cut).toBe(0);
  clickAt(canvas, at([1300, 900]));
  expect(statusText()).toContain('Point at a line, arc or circle to trim.');
  expect(statusText()).toContain('3 items');
  // F: the Fillet row and its radius, reported up; over the plate's corner the row says its own Radius does all four.
  fireEvent.keyDown(window, { key: 'f' });
  const filletRow = screen.getByRole('group', { name: 'Fillet options' });
  const radius = within(filletRow).getByLabelText('Fillet radius (mm)');
  expect(radius.value).toBe('5');
  fireEvent.change(radius, { target: { value: '8' } });
  fireEvent.keyDown(radius, { key: 'Enter' });
  expect(onShapeOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ fillet: 8 }));
  // Committed, the box gives the focus up: the tools' keys reach the sketcher.
  expect(document.activeElement).not.toBe(radius);
  pointer(canvas, 'pointermove', ...at([700, 400]));
  expect(screen.getByLabelText('Fillet readout').textContent).toBe('Fillet R8click to round · Esc ends the tool');
  expect(filletRow.textContent).toContain('A rectangle’s own Corner radius rounds all four corners at once.');
  // H and O: their rows.
  fireEvent.keyDown(window, { key: 'h' });
  expect(
    within(screen.getByRole('group', { name: 'Chamfer options' })).getByLabelText('Chamfer distance (mm)').value,
  ).toBe('2');
  fireEvent.keyDown(window, { key: 'o' });
  const offsetRow = screen.getByRole('group', { name: 'Offset options' });
  expect(within(offsetRow).getByLabelText('Offset distance (mm)').value).toBe('5');
  // Offset: the hole chosen (drawn as selected, named in the row), then the side; the copy goes after the last entity.
  clickAt(canvas, at([340, 250]));
  expect(offsetRow.textContent).toContain('Circle Ø80 at (300, 250) chosen');
  expect(overlayProbe().selectedIds).toEqual(['e2']);
  expect(statusText()).toContain('Click the side the copy goes on');
  pointer(canvas, 'pointermove', ...at([380, 250]));
  expect(screen.getByLabelText('Offset readout').textContent).toBe(
    'Offset 5 mm outwardclick to place the copy · Esc lets go of it',
  );
  clickAt(canvas, at([380, 250]));
  expect(statusText()).toContain('4 items');
  expect(overlayProbe().selectedIds).toEqual([]);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(pressed('Offset')).toBe('false');
});

it('puts a drag-move back on a window blur and on a missed release: nothing moves, no step (§8.0)', () => {
  const viewport = createRef();
  render(<DimensionHarness onFinish={vi.fn()} viewport={viewport} entities={panel} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  clickAt(canvas, at([400, 250]));
  const undo = screen.getByRole('button', { name: 'Undo last' });
  expect(undo.disabled).toBe(true);
  // A blur in the middle of the drag: back where it was; the release that follows moves nothing.
  dragTo(canvas, at([400, 250]), at([300, 100]), 6);
  expect(overlayProbe().dragOffset).not.toBe(null);
  act(() => {
    window.dispatchEvent(new Event('blur'));
  });
  expect(overlayProbe().dragOffset).toBe(null);
  pointer(canvas, 'pointerup', ...at([300, 100]));
  expect(note().textContent).toBe('Circle Ø20 at (400, 250) · Delete removes it');
  expect(undo.disabled).toBe(true);
  // A release missed (the next move comes with no button held): the same.
  dragTo(canvas, at([400, 250]), at([500, 400]), 6);
  expect(overlayProbe().dragOffset).not.toBe(null);
  act(() => {
    const [x, y] = at([520, 420]);
    const event = new MouseEvent('pointermove', { clientX: x, clientY: y, buttons: 0, bubbles: true });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    canvas.dispatchEvent(event);
  });
  expect(overlayProbe().dragOffset).toBe(null);
  pointer(canvas, 'pointerup', ...at([520, 420]));
  expect(note().textContent).toBe('Circle Ø20 at (400, 250) · Delete removes it');
  expect(undo.disabled).toBe(true);
});

it('ends a box with a tool key or Ctrl+A pressed in the middle of it: the next move and the release select nothing', () => {
  const viewport = createRef();
  render(<DimensionHarness onFinish={vi.fn()} viewport={viewport} entities={panel} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  // L with the button still down: the box goes and Line is on; moving on and releasing selects nothing.
  dragTo(canvas, at([220, 120]), at([520, 380]));
  expect(named('sketch-box')).toHaveLength(1);
  fireEvent.keyDown(window, { key: 'l' });
  expect(pressed('Line')).toBe('true');
  expect(named('sketch-box')).toHaveLength(0);
  pointer(canvas, 'pointermove', ...at([560, 400]));
  expect(named('sketch-box')).toHaveLength(0);
  pointer(canvas, 'pointerup', ...at([560, 400]));
  expect(note()).toBeNull();
  expect(pressed('Line')).toBe('true');
  expect(statusText()).toContain('Click the start point');
  fireEvent.keyDown(screen.getByLabelText('Sketch x'), { key: 'Escape' });
  expect(pressed('Line')).toBe('false');
  // Ctrl+A with the button still down: every entity, and the release keeps them.
  dragTo(canvas, at([220, 120]), at([520, 380]));
  fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
  expect(note().textContent).toBe('6 selected: 1 rectangle, 5 circles · Delete removes them');
  pointer(canvas, 'pointermove', ...at([560, 400]));
  expect(named('sketch-box')).toHaveLength(0);
  pointer(canvas, 'pointerup', ...at([560, 400]));
  expect(note().textContent).toBe('6 selected: 1 rectangle, 5 circles · Delete removes them');
});

it('ends a selection drag with Ctrl+Z pressed in the middle of it: the step goes back and the release moves nothing', () => {
  const viewport = createRef();
  render(<DimensionHarness onFinish={vi.fn()} viewport={viewport} entities={panel} />);
  const canvas = document.querySelector('canvas');
  const at = screenMap(viewport);
  clickAt(canvas, at([400, 250]));
  // One move to undo.
  dragTo(canvas, at([400, 250]), at([400, 420]), 6);
  pointer(canvas, 'pointerup', ...at([400, 420]));
  expect(note().textContent).toBe('Circle Ø20 at (400, 420) · Delete removes it');
  // Dragged again, Ctrl+Z with the button still down: the first move is undone and this one is gone.
  dragTo(canvas, at([400, 420]), at([600, 420]), 6);
  expect(overlayProbe().dragOffset).toEqual([200, 0]);
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
  expect(note().textContent).toBe('Circle Ø20 at (400, 250) · Delete removes it');
  expect(overlayProbe().dragOffset).toBe(null);
  pointer(canvas, 'pointermove', ...at([650, 420]));
  expect(overlayProbe().dragOffset).toBe(null);
  pointer(canvas, 'pointerup', ...at([650, 420]));
  expect(note().textContent).toBe('Circle Ø20 at (400, 250) · Delete removes it');
  expect(screen.getByRole('button', { name: 'Undo last' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Redo' }).disabled).toBe(false);
});

it('frames the span asked for on a zoomed orthographic camera (§8.0, HD-3 judgment call 22)', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
  const viewport = createRef();
  const { rerender } = render(<DimensionHarness onFinish={vi.fn()} viewport={viewport} entities={panel} />);
  const frame = planeFrame('XY');
  const scale = () => {
    const [a, b] = [viewport.current.planePoint(100, 100, frame), viewport.current.planePoint(110, 100, frame)];
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / 10;
  };
  // 1200 mm over 200 px: 6 mm a pixel. A wheel zoom of four (the orthographic camera's own `zoom`).
  expect(scale()).toBeCloseTo(6, 6);
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const camera = OrbitControls.current.object;
  expect(camera.isOrthographicCamera).toBe(true);
  camera.zoom = 4;
  camera.updateProjectionMatrix();
  expect(scale()).toBeCloseTo(1.5, 6);
  // A focus on a 120 mm span (Look at, a Check row): 120 mm over the 200 px, the zoom back to 1.
  rerender(<DimensionHarness onFinish={vi.fn()} viewport={viewport} entities={panel} view={{ ...focus, span: 120 }} />);
  expect(camera.zoom).toBe(1);
  expect(scale()).toBeCloseTo(0.6, 6);
});
