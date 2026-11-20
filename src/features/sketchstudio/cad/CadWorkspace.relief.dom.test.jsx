// @vitest-environment jsdom
// Bend reliefs BR-1 in the workspace (docs/sketch-studio-bend-relief.md §3.4,
// §5.1): Draw → a cross typed with the Line tool → Relief on a corner →
// Finish: the outline is a closed path holding the relief; the next sketch
// starts with the settings left; Edit outline of a cut 1.2 mm part sizes for
// that part's own sheet. Shapes are typed through the sketcher's HUD; the
// relief clicks go to a stand-in canvas whose plane point is the client point
// (1 mm per pixel). Kernel hook and 3D viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
import { emptyModel } from './model.js';
import { sheetMetalPart } from './ShopPanels.jsx';
// The whole workspace renders in each test: under the full suite’s parallel load
// its long tests outrun the default 5 s, so the file allows 15 s.
vi.setConfig({ testTimeout: 15000 });

const stage = vi.hoisted(() => ({ canvas: null, overlay: null }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'ready',
    ready: true,
    snapshot: {
      parameters: {},
      parts: model.parts.map((p) => ({
        id: p.id,
        bounds: [
          [0, 0, 0],
          [100, 60, 30],
        ],
        features: {},
      })),
      instances: model.instances.map((i) => ({
        id: i.id,
        partId: i.partId,
        bounds: [
          [0, 0, 0],
          [100, 60, 30],
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
  default: function ViewportStandIn({ ref }) {
    useImperativeHandle(ref, () => ({
      viewDropPoint: () => [0, 0, 0],
      getInstanceBounds: () => null,
      isDragging: () => false,
      getCanvas: () => stage.canvas,
      planePoint: (x, y) => [x, y],
      getGroupPoses: () => new Map(),
      planeEdges: () => [],
      getMarkPoints: () => [],
      setSketchOverlay: (overlay) => {
        stage.overlay = overlay;
      },
    }));
    return <div aria-label="Solid model viewport" />;
  },
}));
beforeEach(() => {
  stage.canvas = document.createElement('canvas');
  document.body.append(stage.canvas);
  stage.overlay = null;
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
// The punch stays in the machine (docs/sketch-studio-shop-punches.md §5.5): each test starts from the default.
beforeEach(() => forgetPunch());
afterEach(() => {
  cleanup();
  stage.canvas.remove();
  vi.unstubAllGlobals();
});

function setup(model = emptyModel()) {
  let current = model;
  const setCadModel = vi.fn((next) => {
    current = next;
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
  const view = render(workspace());
  const rerender = () => view.rerender(workspace());
  return { rerender, model: () => current };
}
const region = (name) => screen.getByRole('region', { name });
const toolbar = () => screen.queryByRole('toolbar', { name: 'Sketch tools' });
const tool = (name) => act(() => fireEvent.click(within(toolbar()).getByRole('button', { name })));
const typeStep = (values) =>
  act(() => {
    const entries = Object.entries(values);
    for (const [field, value] of entries)
      fireEvent.change(screen.getByLabelText(`Sketch ${field}`), { target: { value: String(value) } });
    fireEvent.keyDown(screen.getByLabelText(`Sketch ${entries.at(-1)[0]}`), { key: 'Enter' });
  });
// A short click on the stand-in canvas at plane point (u, v).
const clickAt = ([u, v]) =>
  act(() => {
    for (const type of ['pointermove', 'pointerdown', 'pointerup'])
      stage.canvas.dispatchEvent(new MouseEvent(type, { clientX: u, clientY: v, button: 0, bubbles: true }));
  });
const finish = () => act(() => fireEvent.click(within(toolbar()).getByRole('button', { name: 'Finish sketch' })));
const statusLine = () => document.querySelector('.cad-sketch-status').textContent;
const reliefOptions = () => screen.queryByRole('group', { name: 'Relief options' });
const drawTheOutline = () =>
  act(() => fireEvent.click(within(region('Draw')).getByRole('button', { name: /^Draw the outline/ })));
// The cross blank (base 200 × 100, flaps 20) as twelve typed lines, closed on its start.
const typeCross = () => {
  tool('Line');
  typeStep({ x: 0, y: -20 });
  for (const [length, angle] of [
    [200, 0],
    [20, 90],
    [20, 0],
    [100, 90],
    [20, 180],
    [20, 90],
    [200, 180],
    [20, -90],
    [20, 180],
    [100, -90],
    [20, 0],
    [20, -90],
  ])
    typeStep({ length, angle });
  tool('Line');
};
// Every corner of a path profile, in order.
const corners = (profile) => [profile.start, ...profile.segments.map((s) => s.end)];

it('cuts a relief into a drawn outline that finishes as a closed path holding it', () => {
  const harness = setup();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() =>
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name: 'Draw' }),
    ),
  );
  drawTheOutline();
  typeCross();
  expect(statusLine()).toContain('12 items · closed profile');
  tool('Relief');
  // Nothing handed over: the sheet starts at 1.5 mm, Square 4.6 automatic.
  expect(screen.getByLabelText('Relief sheet thickness (mm)').value).toBe('1.5');
  expect(screen.getByLabelText('Relief size (mm)').placeholder).toBe('4.6');
  clickAt([0, 0]);
  expect(statusLine()).toContain('16 items · closed profile');
  // The help panel says how (HD-4, §8.0 item 3: its Now block names the tool in hand).
  const now = within(document.querySelector('.cad-properties')).getByRole('region', { name: 'Now' });
  expect(now.textContent).toContain('Now · Relief (B)');
  expect(now.textContent).toContain('Move to an inside corner and click');
  finish();
  harness.rerender();
  const [sketch] = harness.model().sketches;
  expect(sketch.profile).toMatchObject({ type: 'path', closed: true });
  expect(sketch.profile.segments).toHaveLength(16);
  const points = corners(sketch.profile);
  for (const point of [
    [-2.3, 0],
    [-2.3, 2.3],
    [2.3, 2.3],
    [2.3, -2.3],
    [0, -2.3],
  ])
    expect(points).toContainEqual(point);
  expect(points).not.toContainEqual([0, 0]);
  expect(within(region('Draw')).getByRole('list', { name: 'Outlines ready to cut' })).toBeTruthy();

  // The next sketch starts with the settings left: Round, typed 3.
  drawTheOutline();
  tool('Relief');
  act(() => fireEvent.change(screen.getByLabelText('Relief shape'), { target: { value: 'round' } }));
  const diameter = screen.getByLabelText('Relief diameter (mm)');
  act(() => {
    fireEvent.change(diameter, { target: { value: '3' } });
    fireEvent.keyDown(diameter, { key: 'Enter' });
  });
  tool('Cancel sketch');
  drawTheOutline();
  tool('Relief');
  expect(screen.getByLabelText('Relief shape').value).toBe('round');
  expect(screen.getByLabelText('Relief diameter (mm)').value).toBe('3');
});

it('sizes for a cut part’s own sheet when its outline is edited', () => {
  const part = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.2, name: 'Tray' });
  part.id = 'tray';
  setup({
    ...emptyModel(),
    sketches: [
      {
        id: 'blank',
        name: 'Blank',
        plane: 'XY',
        origin: [0, 0, 0],
        profile: { type: 'rectangle', width: 100, height: 60, origin: [0, 0] },
      },
    ],
    parts: [part],
    instances: [{ id: 'tray-1', partId: 'tray', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }],
  });
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() =>
    fireEvent.click(within(screen.getByRole('region', { name: 'Job board' })).getByRole('button', { name: /^Tray/ })),
  );
  act(() =>
    fireEvent.click(within(screen.getByLabelText('Sheet metal')).getByRole('button', { name: 'Edit outline' })),
  );
  expect(toolbar()).toBeTruthy();
  tool('Relief');
  expect(reliefOptions().textContent).toContain('1.2 mm SPCC (this part)');
  expect(screen.queryByLabelText('Relief sheet thickness (mm)')).toBe(null);
  expect(screen.getByLabelText('Relief size (mm)').placeholder).toBe('4');
});
