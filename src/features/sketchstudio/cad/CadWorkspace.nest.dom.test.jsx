// @vitest-environment jsdom
// SN-1 in the workspace (docs/sketch-studio-outline-edit-sheet-nest.md §4):
// Draw's Cut all, Cut from sheet on a batch (Quantity per outline, a row
// unticked — Leave out until docs/sketch-studio-cut-pick.md —, one commit),
// the laser on the job (This cut, the lead, Quantity as model
// instances, the copies that stay), the route's Cut on several outlines. The
// kernel hook and the 3D viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
import { emptyModel } from './model.js';
// The whole workspace renders in each test: allow for the full suite's load.
vi.setConfig({ testTimeout: 15000 });

// Every instance is built as its blank lying at its position (the stand-in kernel).
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
          [100, 60, 1.5],
        ],
        features: {},
      })),
      instances: model.instances.map((i) => {
        const sketchId = model.parts.find((p) => p.id === i.partId)?.features[0]?.sketchId;
        const { width = 100, height = 60 } = model.sketches.find((s) => s.id === sketchId)?.profile || {};
        const [x, y] = i.position || [0, 0, 0];
        return {
          id: i.id,
          partId: i.partId,
          bounds: [
            [x, y, 0],
            [x + width, y + height, 1.5],
          ],
          placement: [],
        };
      }),
    },
    request: vi.fn(),
    retry() {},
    cancel() {},
  }),
}));
vi.mock('./CadViewport.jsx', () => ({
  default: function ViewportStandIn({ ref }) {
    useImperativeHandle(ref, () => ({
      viewDropPoint: () => [1000, 500, 0],
      getInstanceBounds: () => null,
      isDragging: () => false,
      getCanvas: () => null,
      getGroupPoses: () => new Map(),
    }));
    return <div aria-label="Solid model viewport" />;
  },
}));
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

function setup(model) {
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
  return { setCadModel, rerender: () => view.rerender(workspace()), model: () => current };
}
const rect = (width, height) => ({ type: 'rectangle', width, height, origin: [0, 0] });
const outlines = () => ({
  ...emptyModel(),
  sketches: [
    { id: 'big', name: 'Big', plane: 'XY', profile: rect(300, 200) },
    { id: 'small', name: 'Small', plane: 'XY', profile: rect(200, 100) },
    { id: 'tab', name: 'Tab', plane: 'XY', profile: rect(150, 150) },
  ],
});
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
const shopStation = (name) => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route(name)));
};
const commitNumber = (field, value) => {
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: String(value) } });
  });
  act(() => fireEvent.blur(field));
};
const overlap = (a, b) => a[0][0] < b[1][0] && b[0][0] < a[1][0] && a[0][1] < b[1][1] && b[0][1] < a[1][1];

// Cut all opens Cut's picker with every outline ticked (docs/sketch-studio-cut-pick.md §4.1);
// unticking a row is what Leave out was.
it('cuts every outline in one go: Cut all, a quantity each, a row unticked, one commit, the laser on the job', () => {
  const harness = setup(outlines());
  shopStation('Draw');
  const draw = screen.getByRole('region', { name: 'Draw' });
  const cutAll = within(draw).getByRole('button', { name: 'Cut all outlines' });
  expect(cutAll.textContent).toMatch(/^Cut all 3 outlines/);
  act(() => fireEvent.click(cutAll));
  let cut = screen.getByRole('region', { name: 'Cut from sheet' });
  expect(within(cut).getByText('Choose the outlines to cut, then the sheet stock.')).toBeTruthy();
  const rows = () => within(screen.getByRole('list', { name: 'Outlines to cut' })).getAllByRole('listitem');
  expect(rows().map((li) => li.querySelector('strong').textContent)).toEqual(['Big', 'Small', 'Tab']);
  expect(rows()[1].textContent).toContain('200 × 100 mm');
  expect(within(cut).getByLabelText('Selected outlines').textContent).toBe('3 of 3 selected');
  commitNumber(within(cut).getByLabelText('Quantity of Small'), 2);
  expect(within(cut).getByLabelText('Batch').textContent).toBe('4 blanks from 3 outlines');
  // Untick the third, then back to Draw and Cut all again: all three are ticked again.
  act(() => fireEvent.click(within(cut).getByRole('checkbox', { name: 'Select Tab' })));
  expect(rows()).toHaveLength(3);
  expect(within(cut).getByLabelText('Batch').textContent).toBe('3 blanks from 2 outlines');
  act(() => fireEvent.click(within(cut).getByRole('button', { name: 'Back: Draw' })));
  act(() =>
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Draw' })).getByRole('button', { name: 'Cut all outlines' }),
    ),
  );
  cut = screen.getByRole('region', { name: 'Cut from sheet' });
  expect(within(cut).getByLabelText('Selected outlines').textContent).toBe('3 of 3 selected');
  commitNumber(within(cut).getByLabelText('Quantity of Small'), 2);

  // Cut on the laser: one commit, 3 parts named after their outlines, 4 instances, none overlapping.
  const commits = harness.setCadModel.mock.calls.length;
  act(() => fireEvent.click(within(cut).getByRole('button', { name: 'Cut on the laser' })));
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 1);
  const model = harness.model();
  expect(model.parts.map((p) => p.name)).toEqual(['Big', 'Small', 'Tab']);
  expect(model.parts.map((p) => p.features[0].sketchId)).toEqual(['big', 'small', 'tab']);
  expect(model.instances.map((i) => model.parts.find((p) => p.id === i.partId).name)).toEqual([
    'Big',
    'Small',
    'Small',
    'Tab',
  ]);
  const boxes = model.instances.map((i) => {
    const { width, height } = model.sketches.find(
      (s) => s.id === model.parts.find((p) => p.id === i.partId).features[0].sketchId,
    ).profile;
    return [
      [i.position[0], i.position[1]],
      [i.position[0] + width, i.position[1] + height],
    ];
  });
  for (let a = 0; a < boxes.length; a++)
    for (let b = a + 1; b < boxes.length; b++) expect(overlap(boxes[a], boxes[b])).toBe(false);

  // The commit reaches the workspace: the laser opens on the first, cutting all four.
  harness.rerender();
  const laser = screen.getByRole('region', { name: 'Laser station' });
  const bed = screen.getByRole('figure', { name: 'Laser bed' });
  expect(bed.dataset.state).toBe('cutting');
  expect(within(bed).getByRole('button', { name: 'Whole sheet' }).getAttribute('aria-pressed')).toBe('true');
  expect(
    within(bed)
      .getAllByLabelText(/^Blank \d+$/)
      .map((n) => n.getAttribute('aria-label')),
  ).toEqual(['Blank 1', 'Blank 2', 'Blank 3', 'Blank 4']);
  runFrames();
  expect(within(laser).getByRole('status', { name: '' }).textContent).toMatch(
    /^Cut 4 blanks on the 1219 × 2438 mm sheet: /,
  );
  // This cut: three rows, the lead current; the shell names it and how many more.
  const job = within(laser).getByRole('list', { name: 'This cut' });
  const jobRows = within(job).getAllByRole('button');
  expect(jobRows.map((b) => b.querySelector('strong').textContent)).toEqual(['Big', 'Small × 2', 'Tab']);
  expect(jobRows[0].getAttribute('aria-current')).toBe('true');
  expect(laser.querySelector('.cad-shell-subject').textContent).toBe('Big + 2 more');
  expect(within(laser).getByLabelText('Cut time').textContent).toMatch(/ for 4 blanks$/);
  expect(within(laser).getByLabelText('On this sheet').textContent).toBe('4 blanks');
  expect(within(laser).getByLabelText('Quantity').value).toBe('1');

  // A row makes Small the lead: Quantity follows, the cut stays done.
  act(() => fireEvent.click(jobRows[1]));
  expect(within(laser).getByLabelText('Quantity').value).toBe('2');
  expect(within(job).getAllByRole('button')[1].getAttribute('aria-current')).toBe('true');
  expect(screen.getByRole('figure', { name: 'Laser bed' }).dataset.state).toBe('cut');
  // Its third copy joins the job.
  commitNumber(within(laser).getByLabelText('Quantity'), 3);
  expect(harness.model().instances).toHaveLength(5);
  harness.rerender();
  expect(within(screen.getByRole('figure', { name: 'Laser bed' })).getAllByLabelText(/^Blank \d+$/)).toHaveLength(5);
  expect(within(job).getAllByRole('button')[1].querySelector('strong').textContent).toBe('Small × 3');
});

it('keeps a painted copy when Quantity goes down, and says so', () => {
  const harness = setup(outlines());
  shopStation('Draw');
  act(() =>
    fireEvent.click(
      within(screen.getByRole('list', { name: 'Outlines ready to cut' })).getByRole('button', { name: 'Cut Big' }),
    ),
  );
  const cut = screen.getByRole('region', { name: 'Cut from sheet' });
  commitNumber(within(cut).getByLabelText('Quantity'), 3);
  act(() => fireEvent.click(within(cut).getByRole('button', { name: 'Cut on the laser' })));
  // A single cut keeps its name (tests pin it); three instances of one part.
  expect(harness.model().parts.map((p) => p.name)).toEqual(['Sheet-metal part']);
  expect(harness.model().instances).toHaveLength(3);
  harness.rerender();
  runFrames();
  const laser = screen.getByRole('region', { name: 'Laser station' });
  expect(within(laser).queryByRole('list', { name: 'This cut' })).toBe(null);
  expect(within(laser).getByLabelText('Quantity').value).toBe('3');
  // Paint the newest copy (a finish row of its own), then ask for one.
  const [first, , last] = harness.model().instances;
  act(() => {
    harness.setCadModel({
      ...harness.model(),
      finishes: [{ id: 'f', instanceId: last.id, kind: 'powder', colour: '#000000', thickness: 0.07 }],
    });
  });
  harness.rerender();
  commitNumber(within(screen.getByRole('region', { name: 'Laser station' })).getByLabelText('Quantity'), 1);
  const after = harness.model();
  expect(after.instances.map((i) => i.id)).toEqual([first.id, last.id]);
  harness.rerender();
  const panel = screen.getByRole('region', { name: 'Laser station' });
  expect(within(panel).getByLabelText('Quantity').value).toBe('2');
  expect(
    within(panel)
      .getAllByRole('note')
      .map((n) => n.textContent),
  ).toContain('1 copy is painted, printed or grouped: delete it in the view if you mean to.');
});

// Since docs/sketch-studio-cut-pick.md §4.1 the route's Cut opens the picker with nothing ticked.
it('opens Cut from sheet on every ready outline from the route, with no "Several outlines" card', () => {
  setup(outlines());
  shopStation('Cut');
  const cut = screen.getByRole('region', { name: 'Cut from sheet' });
  expect(
    within(within(cut).getByRole('list', { name: 'Outlines to cut' }))
      .getAllByRole('listitem')
      .map((li) => li.querySelector('strong').textContent),
  ).toEqual(['Big', 'Small', 'Tab']);
  expect(within(cut).getByLabelText('Selected outlines').textContent).toBe('0 of 3 selected');
  expect(screen.queryByText(/Several outlines/)).toBe(null);
  // Bend with no part points at Cut.
  shopStation('Bend');
  expect(screen.getByRole('region', { name: 'Press brake' }).textContent).toContain(
    'Nothing to bend yet: cut a blank first.',
  );
});
