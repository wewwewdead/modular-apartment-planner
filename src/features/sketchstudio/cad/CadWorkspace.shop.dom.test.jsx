// @vitest-environment jsdom
// The Shop tab (docs/sketch-studio-fab-shop.md §9 SM-1; its ribbon is the
// route since docs/sketch-studio-shop-floor.md §4.1): Draw → Cut makes
// a sheet-metal part at the view's drop point, the feature form adds bends by
// edge distance or outside flange and refuses what the fold refuses before
// committing, Unfold / Fold hands the viewport its view, and the example
// loads. The kernel hook and the 3D viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
import { emptyModel } from './model.js';
import { bendNumbers } from './sheetMetal.js';
import { SHEET_STOCK } from './shopCatalog.js';
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
      parts: [],
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
      viewDropPoint: () => [200, 100, 0],
      getInstanceBounds: () => null,
      isDragging: () => false,
      getCanvas: () => null,
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
// The punch stays in the machine (docs/sketch-studio-shop-punches.md §5.5): each test starts from the default.
beforeEach(() => forgetPunch());
afterEach(() => cleanup());

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
const ribbon = () => document.querySelector('.cad-ribbon');
const properties = () => document.querySelector('.cad-properties');
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
// The route's More menu (shop floor §4.1): open it, then run one of its commands.
const shopMore = (name) => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route('More')));
  act(() =>
    fireEvent.click(within(screen.getByRole('group', { name: 'More shop commands' })).getByRole('button', { name })),
  );
};
const fill = (label, value, scope = properties()) => {
  const field = within(scope).getByLabelText(label, { exact: true });
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: String(value) } });
  });
  act(() => fireEvent.blur(field));
};

it('puts Shop between Assemble and Drawings; its ribbon is the route, and search still finds the eleven commands', () => {
  setup();
  const tabs = within(screen.getByRole('navigation', { name: 'Modeling ribbon' }))
    .getAllByRole('button')
    .map((b) => b.textContent);
  expect(tabs).toEqual(['Sketch', 'Solid', 'Assemble', 'Shop', 'Drawings', 'Manufacture']);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  // Shop floor §4.1 (shop trim §4.1): the five stations in shop order, Replay (SF-5), then More.
  expect(
    within(ribbon())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') || b.textContent),
  ).toEqual(['Draw', 'Cut', 'Bend', 'Paint', 'Print', 'Replay', 'More ▾']);
  // The Shop commands stay in the list: search finds each by its label.
  for (const label of [
    'Cut from sheet',
    'Laser',
    'Add bend',
    'Press brake',
    'Unfold',
    'Paint',
    'Print',
    'Add bought-in item…',
    'Job sheet',
    'Example: pump bracket',
    'Example: control box',
  ]) {
    act(() => fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: label } }));
    expect(within(ribbon()).getByRole('button', { name: label })).toBeTruthy();
  }
});

it('cuts a 100 × 60 blank of 1.5 SPCC, adds a bend by flange length and refuses a bend that misses', () => {
  const harness = setup();
  // An empty model: the Shop tab opens Draw; Rectangle goes straight to Cut.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  const draw = screen.getByRole('region', { name: 'Draw' });
  act(() => fireEvent.click(within(draw).getByRole('button', { name: /^Rectangle/ })));
  act(() => fireEvent.click(within(draw).getByRole('button', { name: 'Cut this rectangle' })));
  const panel = screen.getByRole('region', { name: 'Cut from sheet' });
  expect(within(panel).getByLabelText('Blank size').textContent).toBe(
    'Blank 100 × 60 mm · cut length 320 mm · 1 pierce',
  );
  // 1.5 is not a standard SPCC gauge: the custom field holds it.
  expect(within(panel).getByLabelText('Thickness').value).toBe('custom');
  expect(within(panel).getByLabelText('Custom thickness (mm)').value).toBe('1.5');
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Cut on the laser' })));
  const made = harness.model();
  const part = made.parts.at(-1);
  expect(part.material).toBe(SHEET_STOCK.spcc.name);
  expect(part.features).toEqual([
    expect.objectContaining({ type: 'sheetmetal', thickness: 1.5, stock: 'spcc', kFactor: null, bends: [] }),
  ]);
  expect(made.sketches.at(-1)).toMatchObject({
    plane: 'XY',
    profile: { type: 'rectangle', width: 100, height: 60, origin: [0, 0] },
  });
  // The blank's centre lands on the view's drop point.
  expect(made.instances.at(-1)).toMatchObject({ partId: part.id, position: [150, 70, 0] });
  harness.rerender();
  // Cut on the laser: the laser opens on it, cutting (shop floor §4.5); Esc stops, Leave laser leaves.
  expect(screen.getByRole('figure', { name: 'Laser bed' }).dataset.state).toBe('cutting');
  act(() => fireEvent.keyDown(window, { key: 'Escape' }));
  act(() =>
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Laser station' })).getByRole('button', { name: 'Leave laser' }),
    ),
  );

  // The feature form: the blank line, then Add bend from the left edge.
  const form = () => properties().querySelector('.cad-sheet-metal');
  expect(within(form()).getByLabelText('Flat blank').textContent).toBe(
    'Blank 100 × 60 mm · cut length 320 mm · 1 pierce · 0 bends',
  );
  const numbers = bendNumbers({ thickness: 1.5, stock: 'spcc', angle: 90 });
  // The outside flange field drives the distance: 30 outside = 30 − OSSB + BA/2 in.
  fill('Flange, outside (mm)', 30, form());
  const distance = Number(within(form()).getByLabelText('Distance D (mm)').value);
  expect(distance).toBeCloseTo(30 - numbers.setback + numbers.allowance / 2, 3);
  expect(within(form()).getByLabelText('New bend numbers').textContent).toContain('UP 90° R1.6');
  act(() => fireEvent.click(within(form()).getByRole('button', { name: 'Add bend' })));
  const bend = harness.model().parts.at(-1).features[0].bends[0];
  expect(bend).toMatchObject({ angle: 90, direction: 'up', radius: null });
  expect(bend.a[0]).toBeCloseTo(distance, 3);
  expect(bend.b[0]).toBeCloseTo(distance, 3);
  harness.rerender();
  // The same inputs now describe the bend just made: a hint, not an alarm.
  expect(within(form()).queryByRole('alert')).toBe(null);
  expect(within(form()).getByRole('status').textContent).toBe(
    'Bend added. Choose the edge, distance or flange of the next one.',
  );
  const row = within(form()).getByRole('article', { name: 'Bend 1' });
  // The legs add up to the blank plus one deduction: 72.67 + 30 = 100 + 2.67.
  expect(within(row).getByLabelText('Bend 1 numbers').textContent).toBe(
    'Allowance 3.53Deduction 2.67Legs 72.67 / 30 mm',
  );

  // A distance past the blank misses it: shown, never committed.
  const commits = harness.setCadModel.mock.calls.length;
  fill('Distance D (mm)', 150, form());
  expect(within(form()).getByRole('alert').textContent).toBe('The new bend: the punch line misses the blank.');
  expect(within(form()).getByRole('button', { name: 'Add bend' }).disabled).toBe(true);
  // An angle the fold refuses, typed into the table: reported on Enter / blur, not committed.
  fill('Angle (°)', 200, row);
  expect(within(row).getByRole('alert').textContent).toBe('Bend 1: the angle must be more than 0° and at most 180°.');
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
  // Down: one commit, the direction flips.
  act(() => fireEvent.click(within(row).getByRole('button', { name: 'Down' })));
  expect(harness.model().parts.at(-1).features[0].bends[0].direction).toBe('down');
});

it('Unfold hands the viewport the selected part’s fold and folds back on another selection', () => {
  const harness = setup();
  shopMore('Example: pump bracket');
  harness.rerender();
  const instanceId = harness.model().instances[0].id;
  const part = harness.model().parts[0];
  expect(part.material).toBe(SHEET_STOCK.a5052.name);
  expect(part.features[0].bends).toHaveLength(2);
  expect(viewport.props.selectedId).toBe(instanceId);
  expect(viewport.props.sheetView).toBe(null);
  expect(viewport.props.moveEnabled).toBe(true);
  const toolbar = document.querySelector('.cad-view-toolbar');
  act(() => fireEvent.click(within(toolbar).getByRole('button', { name: 'Unfold' })));
  expect(viewport.props.sheetView).toMatchObject({ instanceId, flat: true });
  expect(viewport.props.sheetView.fold.bends.map((b) => b.label)).toEqual(['UP 90° R1.35', 'UP 90° R1.35']);
  // The gizmo stays off while the stand-in shows; the route's More names it Fold.
  expect(viewport.props.moveEnabled).toBe(false);
  act(() => fireEvent.click(route('More')));
  expect(
    within(screen.getByRole('group', { name: 'More shop commands' })).getByRole('button', { name: 'Fold' }),
  ).toBeDefined();
  act(() => fireEvent.click(route('More')));
  act(() => fireEvent.click(within(toolbar).getByRole('button', { name: 'Fold' })));
  expect(viewport.props.sheetView).toMatchObject({ instanceId, flat: false });
  act(() => fireEvent.click(within(toolbar).getByRole('button', { name: 'Unfold' })));
  act(() => viewport.props.onSelect(null));
  expect(viewport.props.sheetView).toBe(null);
  // Fabrication settings list the millimetre values only (the shop's machines are names).
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Manufacture' })));
  act(() => fireEvent.click(within(ribbon()).getByRole('button', { name: 'Fabrication settings' })));
  expect(within(properties()).queryByLabelText('shop (mm)')).toBe(null);
  expect(within(properties()).getByLabelText('kerf (mm)')).toBeDefined();
});
