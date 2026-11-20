// @vitest-environment jsdom
// Outline edit OE-1 in the workspace (docs/sketch-studio-outline-edit-sheet-nest.md
// §3): a sketch started from a shop station goes back there (returnTo) —
// Draw (open or several outlines too, never "Make it solid"), Cut from sheet,
// the laser, the sheet-metal part — Draw's Delete, the view's outlines while
// Draw is open, and the guard that refuses an outline a cut part's bends fall
// off. The sketcher is driven through its typed HUD (no canvas here). The
// kernel hook and the 3D viewport are stand-ins.
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
      planeEdges: () => [],
      getMarkPoints: () => [],
      setSketchOverlay: () => {},
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
// The punch stays in the machine (docs/sketch-studio-shop-punches.md §5.5): each test starts from the default.
beforeEach(() => forgetPunch());
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
const shopStation = (name) => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route(name)));
};
const region = (name) => screen.getByRole('region', { name });
const toolbar = () => screen.queryByRole('toolbar', { name: 'Sketch tools' });
const errorLine = () => document.querySelector('.cad-error');
// The sketcher's typed HUD: each field of a step, then Enter.
const typeStep = (values) =>
  act(() => {
    const entries = Object.entries(values);
    for (const [field, value] of entries)
      fireEvent.change(screen.getByLabelText(`Sketch ${field}`), { target: { value: String(value) } });
    fireEvent.keyDown(screen.getByLabelText(`Sketch ${entries.at(-1)[0]}`), { key: 'Enter' });
  });
const tool = (name) => act(() => fireEvent.click(within(toolbar()).getByRole('button', { name })));
const rectangle = (x, y, width, height) => {
  tool('Rectangle');
  typeStep({ x, y });
  typeStep({ width, height });
  tool('Rectangle');
};
const finish = () => act(() => fireEvent.click(within(toolbar()).getByRole('button', { name: 'Finish sketch' })));
// HD-1 (docs/sketch-studio-hand-drawing.md §5.2): Undo last has nothing to undo in a sketch just
// reopened, so the old outline is cleared the way a user would: Ctrl+A, then Delete selected.
const clearDrawing = () => {
  act(() => fireEvent.keyDown(window, { key: 'a', ctrlKey: true }));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Delete selected' })));
};
const drawTheOutline = () =>
  act(() => fireEvent.click(within(region('Draw')).getByRole('button', { name: /^Draw the outline/ })));
// A 100 × 60 blank cut as the part "Tray"; `bend`: one bend 20 mm in from its left edge.
function trayModel({ bend = false } = {}) {
  const part = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.5, name: 'Tray' });
  part.id = 'tray';
  if (bend) part.features[0].bends = [{ id: 'b1', a: [20, 0], b: [20, 60], angle: 90, direction: 'up' }];
  return {
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
  };
}

it('brings an open outline back to Draw under "Not ready to cut", and its edit back as ready', () => {
  const harness = setup();
  shopStation('Draw');
  drawTheOutline();
  // Two lines that do not close.
  tool('Line');
  typeStep({ x: 0, y: 0 });
  typeStep({ length: 100, angle: 0 });
  typeStep({ length: 60, angle: 90 });
  tool('Line');
  finish();
  harness.rerender();
  expect(toolbar()).toBe(null);
  expect(screen.queryByText('Make it solid')).toBe(null);
  const notReady = within(region('Draw')).getByRole('list', { name: 'Not ready to cut' });
  const row = within(notReady).getByRole('listitem');
  expect(row.className).toBe('is-chosen');
  expect(row.textContent).toContain('Sketch 1');
  expect(within(row).getByRole('note').textContent).toBe('Not closed: connect the ends so the outline is one loop.');
  // The view draws it while Draw is open.
  expect(viewport.props.shopOutlines.map((o) => [o.id, o.ready, o.chosen])).toEqual([
    [harness.model().sketches[0].id, false, true],
  ]);

  // Edit: the sketcher opens with the two lines; a third closes the outline.
  act(() => fireEvent.click(within(row).getByRole('button', { name: 'Edit Sketch 1' })));
  expect(toolbar()).toBeTruthy();
  expect(viewport.props.shopOutlines).toBe(null);
  expect(document.querySelector('.cad-sketch-status').textContent).toContain('2 items · open outline');
  tool('Line');
  typeStep({ x: 100, y: 60 });
  typeStep({ length: Math.hypot(100, 60), angle: (Math.atan2(-60, -100) * 180) / Math.PI });
  tool('Line');
  expect(document.querySelector('.cad-sketch-status').textContent).toContain('3 items · closed profile');
  finish();
  harness.rerender();
  const ready = within(region('Draw')).getByRole('list', { name: 'Outlines ready to cut' });
  expect(within(ready).getByRole('listitem').className).toBe('is-chosen');
  expect(within(ready).getByRole('listitem').textContent).toContain('100 × 60 mm');
  expect(within(region('Draw')).queryByRole('list', { name: 'Not ready to cut' })).toBe(null);
  // Edited in place: one sketch, its id kept.
  expect(harness.model().sketches).toHaveLength(1);
  expect(errorLine()).toBe(null);
});

it('makes two outlines drawn in one sketch two blanks, and Delete removes one in a commit', () => {
  const harness = setup();
  shopStation('Draw');
  drawTheOutline();
  rectangle(0, 0, 200, 100);
  rectangle(260, 0, 200, 100);
  finish();
  harness.rerender();
  const draw = region('Draw');
  const ready = within(draw).getByRole('list', { name: 'Outlines ready to cut' });
  expect(
    within(ready)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('strong').textContent),
  ).toEqual(['Sketch 1', 'Sketch 1 · 2']);
  expect(within(ready).getAllByRole('listitem')[0].className).toBe('is-chosen');
  expect(within(draw).getByRole('status').textContent).toBe(
    'Sketch 1 held 2 separate outlines: each is its own blank.',
  );
  // One commit made both.
  expect(harness.setCadModel).toHaveBeenCalledTimes(1);
  const [first, second] = harness.model().sketches;
  expect(first.profile).toMatchObject({ type: 'rectangle', width: 200, origin: [0, 0] });
  expect(second.profile).toMatchObject({ type: 'rectangle', width: 200, origin: [260, 0] });
  expect(viewport.props.shopOutlines).toHaveLength(2);

  act(() => fireEvent.click(within(ready).getByRole('button', { name: 'Delete Sketch 1 · 2' })));
  harness.rerender();
  expect(harness.model().sketches.map((s) => s.name)).toEqual(['Sketch 1']);
  expect(harness.setCadModel).toHaveBeenCalledTimes(2);
  expect(viewport.props.shopOutlines).toHaveLength(1);
  // The view's outlines are Draw's only: another station hands the viewport null.
  shopStation('Bend');
  expect(viewport.props.shopOutlines).toBe(null);
});

it('keeps the Sketch tab flow: one outline per sketch, its warning and the finished panel', () => {
  const harness = setup();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Sketch', exact: true })));
  act(() =>
    fireEvent.click(
      within(document.querySelector('.cad-ribbon')).getByRole('button', { name: 'New sketch', exact: true }),
    ),
  );
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Start sketch' })));
  rectangle(0, 0, 200, 100);
  rectangle(260, 0, 100, 100);
  finish();
  harness.rerender();
  expect(harness.model().sketches).toHaveLength(1);
  expect(screen.getByText('Make it solid')).toBeTruthy();
  expect(screen.getByText(/^2 separate outlines: one extrusion uses one outer outline/)).toBeTruthy();
});

it('comes back to Cut from sheet from its Edit outline, with the stock chosen', () => {
  const harness = setup({
    ...emptyModel(),
    sketches: [
      {
        id: 'plate',
        name: 'Plate',
        plane: 'XY',
        profile: { type: 'rectangle', width: 120, height: 80, origin: [0, 0] },
      },
    ],
  });
  shopStation('Cut');
  const cut = region('Cut from sheet');
  act(() => fireEvent.change(within(cut).getByLabelText('Sheet stock'), { target: { value: 'sus304' } }));
  act(() => fireEvent.click(within(cut).getByRole('button', { name: 'Edit outline' })));
  expect(toolbar()).toBeTruthy();
  // A circle inside: a cut-out.
  tool('Circle');
  typeStep({ x: 60, y: 40 });
  typeStep({ radius: 10 });
  tool('Circle');
  finish();
  harness.rerender();
  const back = region('Cut from sheet');
  expect(within(back).getByLabelText('Sheet stock').value).toBe('sus304');
  expect(within(back).getByLabelText('Blank size').textContent).toMatch(/· 2 pierces$/);
  expect(harness.model().sketches[0].profile.holes).toHaveLength(1);

  // Cancel goes back too, and an outline no longer closed goes to Draw's "Not ready to cut".
  act(() => fireEvent.click(within(back).getByRole('button', { name: 'Edit outline' })));
  act(() => fireEvent.click(within(toolbar()).getByRole('button', { name: 'Cancel sketch' })));
  expect(region('Cut from sheet')).toBeTruthy();
  act(() => fireEvent.click(within(region('Cut from sheet')).getByRole('button', { name: 'Edit outline' })));
  clearDrawing();
  tool('Line');
  typeStep({ x: 0, y: 0 });
  typeStep({ length: 50, angle: 0 });
  tool('Line');
  finish();
  harness.rerender();
  const notReady = within(region('Draw')).getByRole('list', { name: 'Not ready to cut' });
  expect(within(notReady).getByRole('listitem').className).toBe('is-chosen');
  expect(errorLine()).toBe(null);
});

it('comes back to the laser on its part, ready, with the new blank size', () => {
  const harness = setup(trayModel());
  shopStation('Cut');
  const laser = region('Laser station');
  act(() => fireEvent.click(within(laser).getByRole('button', { name: 'Edit outline' })));
  expect(toolbar()).toBeTruthy();
  expect(screen.queryByRole('figure', { name: 'Laser bed' })).toBe(null);
  // A larger blank: the rectangle replaced.
  clearDrawing();
  rectangle(0, 0, 140, 80);
  finish();
  harness.rerender();
  const back = region('Laser station');
  expect(screen.getByRole('figure', { name: 'Laser bed' }).dataset.state).toBe('ready');
  expect(within(back).getByText('Outline updated: blank 140 × 80 mm.')).toBeTruthy();
  expect(harness.model().sketches[0]).toMatchObject({ id: 'blank', name: 'Blank' });
  expect(harness.model().sketches[0].profile).toMatchObject({ width: 140, height: 80 });
  // Cancel from the laser comes back to it as well.
  act(() => fireEvent.click(within(region('Laser station')).getByRole('button', { name: 'Edit outline' })));
  act(() => fireEvent.click(within(toolbar()).getByRole('button', { name: 'Cancel sketch' })));
  expect(region('Laser station')).toBeTruthy();
});

it('brings the sheet-metal form and the Tree back to the part, and refuses an outline its bend falls off', () => {
  const harness = setup(trayModel({ bend: true }));
  // Select the part on the job board: its feature form has Edit outline.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() =>
    fireEvent.click(within(screen.getByRole('region', { name: 'Job board' })).getByRole('button', { name: /^Tray/ })),
  );
  const form = () => screen.getByLabelText('Sheet metal');
  act(() => fireEvent.click(within(form()).getByRole('button', { name: 'Edit outline' })));
  expect(toolbar()).toBeTruthy();
  clearDrawing();
  // Shrunk so the bend line (x = 20) is off it.
  rectangle(40, 0, 60, 60);
  const commits = harness.setCadModel.mock.calls.length;
  finish();
  expect(toolbar()).toBeTruthy();
  const refusal =
    'This outline no longer takes the bends of Tray: Bend 1: the punch line misses the blank. Fix the outline, or remove that bend first.';
  expect(screen.getByLabelText('Sketch refused').textContent).toBe(refusal);
  expect(errorLine().textContent).toBe(refusal);
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
  // Cancel: the part as it was, selected with its feature open; the line goes.
  act(() => fireEvent.click(within(toolbar()).getByRole('button', { name: 'Cancel sketch' })));
  expect(errorLine()).toBe(null);
  expect(form()).toBeTruthy();
  expect(harness.model().sketches[0].profile).toMatchObject({ width: 100, height: 60 });

  // A larger outline takes the bend: back to the part with its feature open.
  act(() => fireEvent.click(within(form()).getByRole('button', { name: 'Edit outline' })));
  clearDrawing();
  rectangle(0, 0, 140, 60);
  finish();
  harness.rerender();
  expect(toolbar()).toBe(null);
  expect(screen.queryByText(/updated$/)).toBe(null);
  expect(within(form()).getByLabelText('Flat blank').textContent).toMatch(/^Blank /);
  expect(harness.model().sketches[0].profile).toMatchObject({ width: 140, height: 60 });

  // The Tree's ↳ Edit sketch on the sheet-metal feature comes back to the part too.
  act(() =>
    fireEvent.click(within(screen.getByRole('group', { name: 'Left pane' })).getByRole('button', { name: 'Tree' })),
  );
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Edit sketch of feature 1' })));
  expect(toolbar()).toBeTruthy();
  finish();
  harness.rerender();
  expect(form()).toBeTruthy();
  expect(screen.queryByText('Blank updated')).toBe(null);
});
