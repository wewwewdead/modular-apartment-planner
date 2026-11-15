// @vitest-environment jsdom
// Shop → More → Example: kiosk in the workspace (docs/sketch-studio-shop-floor.md
// §7, SF-4): it loads with fresh ids and every record still names its parts
// (the fasteners' connections their hardware and hole features too), the
// product is selected, the route bar reads done at every station, the job
// sheet says All steps done, and every station opens on it with no error
// line. The kernel hook and the 3D viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { emptyModel } from './model.js';
// The whole workspace renders in each test: under the full suite’s parallel load
// its long tests outrun the default 5 s (SF-1 audit), so the file allows 15 s.
vi.setConfig({ testTimeout: 15000 });

const viewport = vi.hoisted(() => ({ props: null }));
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
  default: function ViewportStandIn({ ref, ...props }) {
    useImperativeHandle(ref, () => ({
      viewDropPoint: () => [0, 0, 0],
      getInstanceBounds: () => null,
      isDragging: () => false,
      getCanvas: () => null,
      getGroupPoses: () => new Map(),
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
// A frame far in the future: a cut's animation reaches its end on its first frame.
let frames = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  cleanup();
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
  return { setCadModel, rerender, model: () => current };
}
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
// The Shop tab's ribbon is the route (docs/sketch-studio-shop-floor.md §4.1):
// a station by its name, the other Shop commands from More.
const shopMore = (name) => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route('More')));
  act(() =>
    fireEvent.click(within(screen.getByRole('group', { name: 'More shop commands' })).getByRole('button', { name })),
  );
};

// RB-3 (round-bend spec §13.4): the corner pieces' outline, four blanks and 40 hits (10 each).
const STATIONS = [
  ['Draw', 'Draw', '5 outlines'],
  ['Cut', 'Laser station', '11 blanks'],
  ['Bend', 'Press brake', '64 hits'],
  ['Paint', 'Paint booth', 'RAL 9005, RAL 9003'],
  ['Print', 'Print station', '2 prints'],
];

it('loads Example: kiosk from More: fresh ids, every record names its parts and features, the product selected', () => {
  const harness = setup();
  shopMore('Example: kiosk');
  const model = harness.model();
  expect(model.parts.map((p) => p.name)).toEqual([
    'Kiosk face frame — sheet metal',
    'Kiosk shelf tray — sheet metal',
    'Kiosk base channel — sheet metal',
    'Kiosk lower cover — sheet metal',
    'Kiosk corner piece — sheet metal',
    'Display',
    'Pan head machine screw M4',
    'Hex nut M4',
  ]);
  expect(
    [model.instances, model.finishes, model.prints, model.connections, model.groups].map((list) => list.length),
  ).toEqual([37, 11, 2, 24, 2]);
  expect(model).not.toHaveProperty('welds');
  expect(model).not.toHaveProperty('assembly');
  // Fresh ids (the example's own are replaced) …
  expect(model.instances.some((i) => i.id.startsWith('shop-kiosk'))).toBe(false);
  const ids = new Set(model.instances.map((i) => i.id));
  // … and every record still names them.
  expect(model.finishes.every((f) => ids.has(f.instanceId))).toBe(true);
  expect(model.prints.every((p) => ids.has(p.instanceId))).toBe(true);
  expect(model.instances.every((i) => model.groups.some((g) => g.id === i.groupId))).toBe(true);
  const features = (instanceId) =>
    model.parts
      .find((p) => p.id === model.instances.find((i) => i.id === instanceId)?.partId)
      ?.features.map((f) => f.id) || [];
  for (const c of model.connections) {
    expect(ids.has(c.from) && ids.has(c.to)).toBe(true);
    expect(features(c.from)).toContain(c.fromFeatureId);
    expect(features(c.to)).toContain(c.toFeatureId);
  }
  const product = model.groups.find((g) => !g.parentId);
  expect(product.name).toBe('Kiosk');
  expect(model.groups.find((g) => g.parentId === product.id)).toEqual({
    id: expect.any(String),
    name: 'Kiosk frame',
    parentId: product.id,
  });
  harness.rerender();
  // The product (the top group, not the frame group inside it) is the route's subject.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  const nav = screen.getByRole('navigation', { name: 'Shop route' });
  expect(within(nav).getByText('Kiosk')).toBeTruthy();
  expect(viewport.props.selectedIds || viewport.props.selectedId).toBeTruthy();
  for (const [name, , status] of STATIONS) expect(route(name).getAttribute('aria-description')).toBe(status);
  expect(document.querySelector('.cad-error')).toBe(null);
});

it('shows the kiosk’s job sheet complete and opens every station on it with no error line', () => {
  const harness = setup();
  shopMore('Example: kiosk');
  harness.rerender();
  shopMore('Job sheet');
  const sheet = screen.getByRole('region', { name: 'Job sheet' });
  const product = within(sheet).getByRole('article', { name: 'Product Kiosk' });
  expect(within(product).getByLabelText('Route status').textContent).toBe('All steps done');
  for (const step of ['Cut', 'Bend', 'Paint', 'Print'])
    expect(within(product).getByLabelText(`${step} status`).textContent).toBe('Done');
  // What is in it but not made here: the displays and the fasteners, untimed.
  expect(within(product).getByLabelText('Kiosk not made here').textContent).toBe(
    'Not made here (not timed): 2 × Display (bought in), 16 × M4 × 12 pan head, 8 × M4 hex nut',
  );
  expect(within(sheet).getByText(/Welding and assembly are not counted/)).toBeTruthy();
  for (const [name, region] of STATIONS) {
    act(() => fireEvent.click(route(name)));
    expect(screen.getByRole('region', { name: region })).toBeTruthy();
    expect(document.querySelector('.cad-error')).toBe(null);
  }
}, 20000);
