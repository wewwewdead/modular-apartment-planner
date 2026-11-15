// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
function DimensionHarness({ onFinish, viewport, entities = plate, dimensions = [] }) {
  const session = {
    key: 'd',
    frame: planeFrame('XY'),
    name: 'Sketch 1',
    support: { type: 'plane', plane: 'XY', offset: 0 },
    boundary: [],
    entities,
    dimensions,
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
  // A drawing tool's field keeps its D.
  fireEvent.click(screen.getByRole('button', { name: 'Line' }));
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
