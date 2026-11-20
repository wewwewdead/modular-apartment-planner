// @vitest-environment jsdom
// The zero in the workspace (docs/sketch-studio-hand-drawing.md §6.1, §6.7): a
// moved zero is stored as `sketch.zero`, Edit sketch gives it back, a finish
// whose only change is the zero is one model step, Reset zero drops the key,
// and a sketch never zeroed has none. Shapes and the zero are typed through
// the sketcher's HUD. Kernel hook and 3D viewport are stand-ins (those of
// CadWorkspace.sketchDimensions.dom.test.jsx).
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
  return { rerender, model: () => current, setCadModel };
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
const finish = () => act(() => fireEvent.click(within(toolbar()).getByRole('button', { name: 'Finish sketch' })));

const startSketch = () => {
  act(() => fireEvent.click(within(document.querySelector('.cad-start')).getByRole('button', { name: 'New sketch' })));
  const properties = within(document.querySelector('.cad-properties'));
  act(() => fireEvent.click(properties.getByRole('button', { name: 'Start sketch', exact: true })));
};
const zeroButton = () => within(toolbar()).getByRole('button', { name: 'Zero' });
const summary = (sketch) => screen.getByRole('region', { name: `Sketch ${sketch.name}` });

it('stores a moved zero with the sketch and gives it back on Edit sketch; Reset zero drops it', () => {
  const harness = setup();
  startSketch();
  rectangle(0, 0, 200, 100);
  // Z, then the zero typed at the rectangle's upper-right corner.
  act(() => fireEvent.keyDown(window, { key: 'z' }));
  typeStep({ x: 200, y: 100 });
  expect(stage.overlay.zero).toEqual([200, 100]);
  finish();
  harness.rerender();
  let [sketch] = harness.model().sketches;
  expect(sketch.zero).toEqual([200, 100]);
  expect(sketch.entities).toEqual([{ id: 'e1', type: 'rect', a: [0, 0], b: [200, 100] }]);
  // Edit sketch: the zero is where it was.
  act(() => fireEvent.click(within(summary(sketch)).getByRole('button', { name: 'Edit sketch' })));
  expect(toolbar()).toBeTruthy();
  expect(stage.overlay.zero).toEqual([200, 100]);
  expect(zeroButton().getAttribute('aria-pressed')).toBe('true');
  expect(zeroButton().title).toBe('Zero at (200, 100): Z to move or reset it');
  // A finish whose only change is the zero is stored: one model step.
  act(() => fireEvent.keyDown(window, { key: 'z' }));
  typeStep({ x: -100, y: -50 });
  expect(stage.overlay.zero).toEqual([100, 50]);
  const before = harness.setCadModel.mock.calls.length;
  finish();
  harness.rerender();
  expect(harness.setCadModel.mock.calls.length).toBe(before + 1);
  [sketch] = harness.model().sketches;
  expect(sketch.zero).toEqual([100, 50]);
  // Reset zero: the key goes.
  act(() => fireEvent.click(within(summary(sketch)).getByRole('button', { name: 'Edit sketch' })));
  act(() => fireEvent.click(zeroButton()));
  act(() =>
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Zero options' })).getByRole('button', { name: 'Reset zero' }),
    ),
  );
  expect(stage.overlay.zero).toBe(null);
  finish();
  harness.rerender();
  expect('zero' in harness.model().sketches[0]).toBe(false);
});

it('stores no zero for a sketch whose zero was never moved', () => {
  const harness = setup();
  startSketch();
  rectangle(0, 0, 200, 100);
  finish();
  harness.rerender();
  expect('zero' in harness.model().sketches[0]).toBe(false);
  expect(stage.overlay).toBe(null);
});
