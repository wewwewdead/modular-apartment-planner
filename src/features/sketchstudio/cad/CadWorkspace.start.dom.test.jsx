// @vitest-environment jsdom
// Starting a sketch without the welcome card (Phase I,
// docs/sketch-studio-start-sketch.md): an empty model shows the Start list
// and the origin plane tiles, New sketch / S enter the pick stage with the
// exact-plane path, a tile pick and the exact path save the same plane
// sketch, and Esc cancels. Kernel hook, viewport and sketcher are stand-ins.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { createPart, emptyModel } from './model.js';

const stand = vi.hoisted(() => ({ viewport: null, sketcher: null }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'current',
    ready: true,
    snapshot: {
      parameters: {},
      parts: [],
      instances: model.instances.map((i) => ({
        id: i.id,
        partId: i.partId,
        bounds: [
          [0, 0, 0],
          [600, 400, 18],
        ],
        placement: [],
      })),
    },
    request: vi.fn(),
    retry() {},
    cancel() {},
  }),
}));
vi.mock('./CadViewport.jsx', () => ({
  default: function ViewportStandIn({ ref, ...props }) {
    useImperativeHandle(ref, () => ({
      isDragging: () => false,
      getCanvas: () => null,
      planeEdges: () => [],
      getMarkPoints: () => [],
      getGroupPoses: () => new Map(),
      getSceneSpan: () => 1000,
    }));
    stand.viewport = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
vi.mock('./CadSketcher.jsx', () => ({
  default: function SketcherStandIn(props) {
    stand.sketcher = props;
    return <div role="toolbar" aria-label="Sketch tools" />;
  },
}));

afterEach(() => {
  cleanup();
  stand.viewport = null;
  stand.sketcher = null;
});

function setup(model = emptyModel()) {
  let current = model;
  const setCadModel = vi.fn((next) => {
    current = next;
    view?.rerender(workspace());
  });
  const workspace = () => (
    <MemoryRouter>
      <CadWorkspace
        document={{ id: 'doc', name: 'Test', entities: [], model: current }}
        setCadModel={setCadModel}
        documentPersistence={{}}
      />
    </MemoryRouter>
  );
  let view = null;
  view = render(workspace());
  return { setCadModel, model: () => current };
}
const properties = () => document.querySelector('.cad-properties');
const start = () => document.querySelector('.cad-start');
const press = (key, init = {}) => act(() => fireEvent.keyDown(window, { key, ...init }));
const rect = (w, h) => [{ id: 'r1', type: 'rect', a: [0, 0], b: [w, h] }];
const withPart = () => {
  const { part, instance } = createPart('board');
  return { ...emptyModel(), parts: [part], instances: [instance] };
};

it('an empty model shows the Start list and the origin plane tiles, never the welcome card', () => {
  setup();
  expect(document.querySelector('.cad-empty')).toBeNull();
  const list = start();
  expect(list).not.toBeNull();
  expect(list.getAttribute('aria-label')).toBe('Start');
  const names = within(list)
    .getAllByRole('button')
    .map((b) => b.textContent);
  expect(names).toEqual([
    'New sketch',
    'Board / plate',
    'Tube / member',
    'Design parameters',
    'Welded table example',
    'Pump bracket drawing study',
    'Rear cover example',
    'Import 2D profiles',
  ]);
  expect(within(list).getByRole('button', { name: 'New sketch' }).className).toContain('cad-primary');
  expect(list.textContent).not.toContain('parameters ready');
  // The viewport shows the tiles at rest, at offset 0.
  expect(stand.viewport.planes).toEqual({ visible: true, offset: 0 });
  expect(stand.viewport.sketchMode).toBeNull();
  // The Sketch ribbon: one New sketch, the legacy forms relabelled.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Sketch', exact: true })));
  const ribbon = within(document.querySelector('.cad-ribbon'))
    .getAllByRole('button')
    .map((b) => b.textContent);
  expect(ribbon).toEqual([
    'New sketch',
    'Import 2D profiles',
    'Freehand drafting',
    'Sketch from fields',
    'Precision path',
  ]);
});

it('the parameters-ready line heads the Start list', () => {
  setup({
    ...emptyModel(),
    parameters: [
      { id: 'p1', name: 'width', expression: '900' },
      { id: 'p2', name: 'depth', expression: '500' },
    ],
  });
  expect(start().querySelector('p').textContent).toBe('2 parameters ready · start a sketch to use them');
});

it('a model with a part shows neither the Start list nor the tiles at rest', () => {
  setup(withPart());
  expect(start()).toBeNull();
  expect(document.querySelector('.cad-empty')).toBeNull();
  expect(properties().textContent).toContain('Build accurately.');
  expect(stand.viewport.planes.visible).toBe(false);
});

it('New sketch enters the pick: tiles shown, the exact-plane fields, and the typed path saves the plane', async () => {
  const { model } = setup();
  act(() => fireEvent.click(within(start()).getByRole('button', { name: 'New sketch' })));
  expect(stand.viewport.sketchMode).toBe('pick');
  // No pickHint override: the viewport shows its own idle pick hint.
  expect(stand.viewport.pickHint).toBeUndefined();
  expect(stand.viewport.planes).toEqual({ visible: true, offset: 0 });
  const panel = within(properties());
  expect(panel.getByRole('heading', { name: 'New sketch' })).toBeTruthy();
  expect(panel.getByRole('heading', { name: 'Exact plane' })).toBeTruthy();
  const plane = panel.getByLabelText('Sketch plane', { exact: true });
  const offset = panel.getByLabelText('Plane offset (mm)', { exact: true });
  expect(document.querySelector('.cad-status').textContent).toContain('Pick a face or plane to sketch on');
  // The offset moves the tiles live.
  act(() => fireEvent.change(offset, { target: { value: '50' } }));
  expect(stand.viewport.planes).toEqual({ visible: true, offset: '50' });
  act(() => fireEvent.change(plane, { target: { value: 'YZ' } }));
  act(() => fireEvent.click(panel.getByRole('button', { name: 'Start sketch', exact: true })));
  expect(stand.sketcher.session).toMatchObject({
    stage: 'draw',
    support: { type: 'plane', plane: 'YZ', offset: 50 },
  });
  expect(stand.sketcher.session.frame.origin).toEqual([50, 0, 0]);
  expect(stand.viewport.planes.visible).toBe(false);
  await act(async () => stand.sketcher.onFinish(rect(100, 60)));
  const saved = model().sketches.at(-1);
  expect(saved).toMatchObject({ plane: 'YZ', origin: [50, 0, 0], support: { type: 'plane', plane: 'YZ', offset: 50 } });
  // Finished: Extrude has the focus, so Enter extrudes.
  expect(document.activeElement?.textContent).toBe('Extrude');
});

it('a tile pick saves the same sketch as the exact path', async () => {
  const { model } = setup();
  await act(async () => stand.viewport.onPickSketchPlane('YZ', 50));
  await act(async () => stand.sketcher.onFinish(rect(100, 60)));
  const fromTile = model().sketches.at(-1);
  expect(fromTile).toMatchObject({
    plane: 'YZ',
    origin: [50, 0, 0],
    support: { type: 'plane', plane: 'YZ', offset: 50 },
  });
  const { id: _a, ...tileFields } = fromTile;
  // The same through the panel, in a fresh workspace.
  cleanup();
  const typed = setup();
  act(() => fireEvent.click(within(start()).getByRole('button', { name: 'New sketch' })));
  const panel = within(properties());
  act(() => fireEvent.change(panel.getByLabelText('Sketch plane'), { target: { value: 'YZ' } }));
  act(() => fireEvent.change(panel.getByLabelText('Plane offset (mm)'), { target: { value: '50' } }));
  act(() => fireEvent.click(panel.getByRole('button', { name: 'Start sketch' })));
  await act(async () => stand.sketcher.onFinish(rect(100, 60)));
  const { id: _b, ...typedFields } = typed.model().sketches.at(-1);
  expect(typedFields).toEqual(tileFields);
});

it('a tile click at rest starts drawing on that plane at offset 0', async () => {
  setup();
  await act(async () => stand.viewport.onPickSketchPlane('XY', 0));
  expect(stand.viewport.sketchMode).toBe('draw');
  expect(stand.sketcher.session.support).toEqual({ type: 'plane', plane: 'XY', offset: 0 });
  expect(screen.getByRole('toolbar', { name: 'Sketch tools' })).toBeTruthy();
  expect(document.querySelector('.cad-status').textContent).toContain('Sketching');
});

it('S enters the pick (also with a part), Esc cancels it, and the pick works on a face', async () => {
  setup(withPart());
  press('s');
  expect(stand.viewport.sketchMode).toBe('pick');
  // Tiles appear for the pick even though the model has parts.
  expect(stand.viewport.planes.visible).toBe(true);
  press('Escape');
  expect(stand.viewport.sketchMode).toBeNull();
  expect(stand.viewport.planes.visible).toBe(false);
  expect(properties().textContent).toContain('Build accurately.');
  // S again, then a flat face.
  press('S', { shiftKey: true });
  expect(stand.viewport.sketchMode).toBe('pick');
  await act(async () =>
    stand.viewport.onPickSketchFace({
      planar: true,
      instanceId: 'i',
      partId: 'p',
      frame: { origin: [0, 0, 18], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1] },
      outline: [],
    }),
  );
  expect(stand.sketcher.session.support).toEqual({ type: 'face', instanceId: 'i', partId: 'p' });
  // S does nothing while sketching or typing.
  press('s');
  expect(stand.viewport.sketchMode).toBe('draw');
});

it('S is ignored in an input and with Ctrl', async () => {
  setup();
  const search = screen.getByLabelText('Search commands');
  act(() => fireEvent.keyDown(search, { key: 's' }));
  expect(stand.viewport.sketchMode).toBeNull();
  press('s', { ctrlKey: true });
  expect(stand.viewport.sketchMode).toBeNull();
  press('s');
  expect(stand.viewport.sketchMode).toBe('pick');
  // The offset is reset each time a pick starts.
  await act(async () =>
    fireEvent.change(within(properties()).getByLabelText('Plane offset (mm)'), { target: { value: '20' } }),
  );
  press('Escape');
  press('s');
  expect(within(properties()).getByLabelText('Plane offset (mm)').value).toBe('0');
});

it('the Start list buttons run the same actions as before', async () => {
  const { model } = setup();
  act(() => fireEvent.click(within(start()).getByRole('button', { name: 'Design parameters' })));
  expect(properties().textContent).toMatch(/Design parameters/);
  expect(start()).toBeNull();
  cleanup();
  const next = setup();
  act(() => fireEvent.click(within(start()).getByRole('button', { name: 'Board / plate' })));
  expect(next.model().parts.map((p) => p.name)).toEqual(['Board / plate']);
  expect(model().parts).toEqual([]);
});
