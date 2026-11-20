// @vitest-environment jsdom
// Shop SM-4 in the workspace (docs/sketch-studio-fab-shop.md §9 SM-4): the
// laser station's session (the bed over the view, Cut and its end, Stop, Esc,
// the sheet and the marks as model commits, the other tools waiting), the job
// sheet panel, Example: control box and the flat pattern sheet. The kernel
// hook and the 3D viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
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
// The punch stays in the machine (docs/sketch-studio-shop-punches.md §5.5): each test starts from the default.
beforeEach(() => forgetPunch());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const runFrames = () =>
  act(() => {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(performance.now() + 1e7));
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
const ribbon = () => document.querySelector('.cad-ribbon');
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
// The Shop tab's ribbon is the route (docs/sketch-studio-shop-floor.md §4.1):
// a station by its name, the other Shop commands from More.
const shopStation = (name) => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route(name)));
};
const shopMore = (name) => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route('More')));
  act(() =>
    fireEvent.click(within(screen.getByRole('group', { name: 'More shop commands' })).getByRole('button', { name })),
  );
};
// A command by its own label, through the search box.
const searchCommand = (name) => {
  act(() => fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: name } }));
  act(() => fireEvent.click(within(ribbon()).getByRole('button', { name })));
};

it('refuses the laser with no sheet-metal part selected', () => {
  setup();
  // The search-only Laser command keeps its refusal; the route's Cut never errs (CadWorkspace.route.dom.test.jsx).
  searchCommand('Laser');
  expect(screen.getByRole('alert').textContent).toBe(
    'Select a sheet-metal part first (Shop → Cut from sheet makes one).',
  );
  expect(screen.queryByRole('figure', { name: 'Laser bed' })).toBe(null);
});

it('puts the selected blank on the laser, cuts it, stops a cut, and Esc leaves', () => {
  const harness = setup();
  shopMore('Example: pump bracket');
  harness.rerender();
  shopStation('Cut');
  const panel = screen.getByRole('region', { name: 'Laser station' });
  const bed = screen.getByRole('figure', { name: 'Laser bed' });
  expect(bed.dataset.state).toBe('ready');
  // The pump bracket's blank: 166 long, its 11 cut-outs, 1.5 A5052 (aluminium table, 1.5 mm: 18.75 m/min).
  expect(within(panel).getByLabelText('Pierces').textContent).toBe('12 × 0.19 s');
  expect(within(panel).getByLabelText('Cutting speed').textContent).toBe('18.75 m/min');
  expect(within(panel).getByLabelText('Kerf').textContent).toBe('0.1 mm');
  expect(within(panel).getByLabelText('Laser checks').textContent).toMatch(/^Ready to cut/);
  // The viewport has no station picks; the route shows Cut open and the other stations stay on (shop floor §4.1).
  expect(route('Cut').getAttribute('aria-current')).toBe('step');
  expect(route('Paint').disabled).toBe(false);
  expect(viewport.props.shopPick).toBe(null);
  expect(document.querySelector('.cad-status').textContent).toContain('Laser — 1219 × 2438 mm sheet · Model current');

  // Cut: the bed animates; its end comes back to the sheet with the parts cut.
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Cut' })));
  expect(screen.getByRole('figure', { name: 'Laser bed' }).dataset.state).toBe('cutting');
  expect(document.querySelector('.cad-status').textContent).toContain('Laser — cutting…');
  expect(within(panel).getByRole('button', { name: 'Stop' })).toBeTruthy();
  const commits = harness.setCadModel.mock.calls.length;
  runFrames();
  expect(screen.getByRole('figure', { name: 'Laser bed' }).dataset.state).toBe('cut');
  expect(screen.getByLabelText('Laser clock').textContent).toMatch(/^([\d.]+) s of \1 s$/);
  expect(within(panel).getByRole('status', { name: '' }).textContent).toMatch(
    /^Cut 1 blank on the 1219 × 2438 mm sheet/,
  );
  // A cut writes nothing to the model.
  expect(harness.setCadModel.mock.calls.length).toBe(commits);

  // A second cut stopped by Esc: back to the sheet, nothing cut.
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Cut' })));
  act(() => fireEvent.keyDown(window, { key: 'Escape' }));
  expect(screen.getByRole('figure', { name: 'Laser bed' }).dataset.state).toBe('ready');
  // The stopped cut's frame changes nothing.
  runFrames();
  expect(screen.getByRole('figure', { name: 'Laser bed' }).dataset.state).toBe('ready');
  // Esc again leaves.
  act(() => fireEvent.keyDown(window, { key: 'Escape' }));
  expect(screen.queryByRole('figure', { name: 'Laser bed' })).toBe(null);
  expect(screen.queryByRole('region', { name: 'Laser station' })).toBe(null);
  expect(route('Cut').getAttribute('aria-current')).toBe(null);
  expect(route('Paint').disabled).toBe(false);
});

it('saves the sheet choice and the etched bend lines; the quantity nests copies on the sheet', () => {
  const harness = setup();
  shopMore('Example: pump bracket');
  harness.rerender();
  shopStation('Cut');
  const panel = () => screen.getByRole('region', { name: 'Laser station' });
  act(() => fireEvent.change(within(panel()).getByLabelText('Stock sheet'), { target: { value: '1500x3000' } }));
  expect(harness.model().fabrication.shop.sheet).toBe('1500x3000');
  harness.rerender();
  expect(within(panel()).getByLabelText('Etched marks').textContent).toBe('No etched lines');
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Etch bend lines' })));
  const marks = harness.model().parts.at(-1).features[0].marks;
  expect(marks).toHaveLength(2);
  harness.rerender();
  expect(within(panel()).getByLabelText('Etched marks').textContent).toBe('2 etched lines');
  expect(screen.getAllByLabelText('Etched line')).toHaveLength(2);
  // Ten copies (docs/sketch-studio-outline-edit-sheet-nest.md §4.3): nine new
  // instances of the part in one commit, ten blanks on the bed.
  const instances = harness.model().instances.length;
  const commits = harness.setCadModel.mock.calls.length;
  const field = within(panel()).getByLabelText('Quantity');
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '10' } });
  });
  act(() => fireEvent.blur(field));
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 1);
  expect(harness.model().instances).toHaveLength(instances + 9);
  harness.rerender();
  expect(screen.getAllByLabelText(/^Blank \d+$/)).toHaveLength(10);
  expect(within(panel()).getByLabelText('Quantity').value).toBe('10');
  expect(within(panel()).getByLabelText('Cut time').textContent).toMatch(/per blank · .* for 10$/);
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Clear marks' })));
  expect(harness.model().parts.at(-1).features[0].marks).toEqual([]);
});

it('loads Example: control box with its records, shows its job sheet complete and draws its flat pattern', async () => {
  const harness = setup();
  shopMore('Example: control box');
  const model = harness.model();
  expect(model.parts).toHaveLength(2);
  expect([model.finishes.length, model.prints.length, model.groups.length]).toEqual([2, 2, 1]);
  expect(model).not.toHaveProperty('welds');
  // Fresh ids, and every record still names its instance.
  const ids = new Set(model.instances.map((i) => i.id));
  expect(model.finishes.every((f) => ids.has(f.instanceId))).toBe(true);
  expect(model.prints.every((p) => ids.has(p.instanceId))).toBe(true);
  expect(model.instances.every((i) => i.groupId === model.groups[0].id)).toBe(true);
  expect(model.sheets.map((s) => s.views)).toEqual([['front', 'top', 'right', 'isometric'], ['flat']]);
  harness.rerender();

  shopMore('Job sheet');
  const sheet = screen.getByRole('region', { name: 'Job sheet' });
  const product = within(sheet).getByRole('article', { name: 'Product Control box' });
  // Four steps (shop trim §4.5): Cut, Bend, Paint, Print.
  expect(within(product).getByLabelText('Route status').textContent).toBe('All steps done');
  for (const step of ['Cut', 'Bend', 'Paint', 'Print'])
    expect(within(product).getByLabelText(`${step} status`).textContent).toBe('Done');
  expect(within(product).queryByLabelText('Weld status')).toBe(null);
  expect(within(product).queryByLabelText('Assemble status')).toBe(null);
  expect(within(product).getByLabelText('Bend time').textContent).toMatch(/^6 · est\. /);
  expect(within(sheet).getByRole('button', { name: 'Download job sheet CSV' }).disabled).toBe(false);

  // Drawings → Flat pattern sheet for the selected body: the example's sheet is opened, not duplicated.
  // The tree's instance rows (not the part definitions listed below them).
  // (The Drawings tab first: on the Shop tab the left pane is the job board, shop floor §4.2.)
  const row = (name) =>
    [...document.querySelectorAll('.cad-tree .cad-tree-item')].find((b) => b.textContent.startsWith(name));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Drawings' })));
  act(() => fireEvent.click(row('Control box body')));
  const sheets = harness.model().sheets.length;
  act(() => fireEvent.click(within(ribbon()).getByRole('button', { name: 'Flat pattern sheet' })));
  expect(harness.model().sheets.length).toBe(sheets);
  // The opened sheet asks for its views (the stand-in kernel answers nothing): let that settle.
  await act(async () => {});
  // The lid has none yet: one is added, with the flat view only.
  act(() => fireEvent.click(row('Control box lid')));
  act(() => fireEvent.click(within(ribbon()).getByRole('button', { name: 'Flat pattern sheet' })));
  const added = harness.model().sheets.at(-1);
  expect(added).toMatchObject({ views: ['flat'], layout: 'engineering', scaleMode: 'fit' });
  expect(added.title).toBe('Control box lid — sheet metal — flat pattern');
  // A long workspace test: under the full suite’s load it outruns the default 5 s.
}, 15000);
