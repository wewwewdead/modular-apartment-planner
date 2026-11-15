// @vitest-environment jsdom
// Sketch dimensions SD-1 in the workspace (docs/sketch-studio-sketch-
// dimensions.md §3.5): a dimension finished with a sketch is in
// `model.sketches[…].dimensions`, Edit sketch brings it back, and a shop finish
// that splits outlines gives each sketch its own. Shapes are typed through the
// sketcher's HUD; the dimension clicks go to a stand-in canvas whose plane
// point is the client point (1 mm per pixel). Kernel hook and 3D viewport are
// stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { emptyModel } from './model.js';
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
const toolbar = () => screen.queryByRole('toolbar', { name: 'Sketch tools' });
const tool = (name) => act(() => fireEvent.click(within(toolbar()).getByRole('button', { name })));
const typeStep = (values) =>
  act(() => {
    const entries = Object.entries(values);
    for (const [field, value] of entries)
      fireEvent.change(screen.getByLabelText(`Sketch ${field}`), { target: { value: String(value) } });
    fireEvent.keyDown(screen.getByLabelText(`Sketch ${entries.at(-1)[0]}`), { key: 'Enter' });
  });
const rectangle = (x, y, width, height) => {
  tool('Rectangle');
  typeStep({ x, y });
  typeStep({ width, height });
  tool('Rectangle');
};
// A short click on the stand-in canvas at plane point (u, v).
const clickAt = ([u, v]) =>
  act(() => {
    for (const type of ['pointermove', 'pointerdown', 'pointerup'])
      stage.canvas.dispatchEvent(new MouseEvent(type, { clientX: u, clientY: v, button: 0, bubbles: true }));
  });
// Dimension tool: the body of a side, then where the dimension goes.
const dimensionSide = (body, place) => {
  tool('Dimension');
  clickAt(body);
  clickAt(place);
  tool('Dimension');
};
const finish = () => act(() => fireEvent.click(within(toolbar()).getByRole('button', { name: 'Finish sketch' })));
const statusLine = () => document.querySelector('.cad-sketch-status').textContent;
const shown = () => stage.overlay?.dimensions.map((d) => [d.id, d.text]);
const region = (name) => screen.getByRole('region', { name });

it('keeps a dimension with a finished sketch, lists it, and brings it back on Edit sketch', () => {
  const harness = setup();
  act(() => fireEvent.click(within(document.querySelector('.cad-start')).getByRole('button', { name: 'New sketch' })));
  const properties = within(document.querySelector('.cad-properties'));
  act(() => fireEvent.click(properties.getByRole('button', { name: 'Start sketch', exact: true })));
  rectangle(0, 0, 200, 100);
  // The top side, dimensioned above it.
  dimensionSide([50, 100.5], [50, 130]);
  expect(statusLine()).toContain('1 item · closed profile · 1 dimension');
  expect(shown()).toEqual([['d1', '200']]);
  finish();
  harness.rerender();
  const [sketch] = harness.model().sketches;
  expect(sketch.dimensions).toEqual([
    { id: 'd1', type: 'linear', from: [200, 100], to: [0, 100], orientation: 'horizontal', offset: 30 },
  ]);
  // The finished panel lists it under the primitives.
  const summary = screen.getByRole('region', { name: `Sketch ${sketch.name}` });
  expect(within(summary).getByText('Dimensions · 1')).toBeTruthy();
  expect(summary.textContent).toContain('Horizontal 200 mm');
  // Edit sketch: the dimension is back in the sketcher.
  act(() => fireEvent.click(within(summary).getByRole('button', { name: 'Edit sketch' })));
  expect(toolbar()).toBeTruthy();
  expect(statusLine()).toContain('1 item · closed profile · 1 dimension');
  expect(shown()).toEqual([['d1', '200']]);
  // Deleting the side's rectangle takes its dimension; Undo last brings the
  // rectangle back (the dimension went with it), and an edit without any
  // dimension drops the key.
  act(() => fireEvent.click(within(toolbar()).getByRole('button', { name: 'Undo last' })));
  expect(shown()).toEqual([]);
  rectangle(0, 0, 200, 100);
  finish();
  harness.rerender();
  expect('dimensions' in harness.model().sketches[0]).toBe(false);
});

it('gives each outline of a shop finish its own dimension', () => {
  const harness = setup();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() =>
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name: 'Draw' }),
    ),
  );
  act(() => fireEvent.click(within(region('Draw')).getByRole('button', { name: /^Draw the outline/ })));
  rectangle(0, 0, 200, 100);
  rectangle(260, 0, 200, 100);
  dimensionSide([50, 100.5], [50, 130]);
  // The right side of the second one, dimensioned beside it.
  dimensionSide([460.5, 30], [490, 30]);
  expect(statusLine()).toContain('2 items · closed profile · 2 dimensions');
  finish();
  harness.rerender();
  const sketches = harness.model().sketches;
  expect(sketches.map((s) => [s.name, s.dimensions])).toEqual([
    ['Sketch 1', [{ id: 'd1', type: 'linear', from: [200, 100], to: [0, 100], orientation: 'horizontal', offset: 30 }]],
    [
      'Sketch 1 · 2',
      [{ id: 'd2', type: 'linear', from: [460, 0], to: [460, 100], orientation: 'vertical', offset: 30 }],
    ],
  ]);
  // Edit each: each shows its own.
  const ready = () => within(within(region('Draw')).getByRole('list', { name: 'Outlines ready to cut' }));
  act(() => fireEvent.click(ready().getByRole('button', { name: 'Edit Sketch 1 · 2' })));
  expect(statusLine()).toContain('1 item · closed profile · 1 dimension');
  expect(shown()).toEqual([['d2', '100']]);
  tool('Cancel sketch');
  act(() => fireEvent.click(ready().getByRole('button', { name: 'Edit Sketch 1' })));
  expect(statusLine()).toContain('1 item · closed profile · 1 dimension');
  expect(shown()).toEqual([['d1', '200']]);
});
