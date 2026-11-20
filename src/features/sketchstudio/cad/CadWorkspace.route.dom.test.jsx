// @vitest-environment jsdom
// The shop floor in the workspace (docs/sketch-studio-shop-floor.md §4,
// SF-1): the route bar (order, names, the open station, what disables it,
// More), the job board, the gate (pick a part; what is missing and the
// button that makes it; waiting for the kernel — never an error line),
// Draw → Cut → the laser already cutting, Back / Next, the Machine numbers
// disclosure and a problem card's one-click fix. The kernel hook and the 3D
// viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
import { emptyModel, normalizeModel } from './model.js';
import { sheetMetalPart } from './ShopPanels.jsx';
import { sheetMetalControlBox } from './shopExamples.js';
// The whole workspace renders in each test: under the full suite’s parallel load
// its long tests outrun the default 5 s (SF-1 audit), so the file allows 15 s.
vi.setConfig({ testTimeout: 15000 });

const viewport = vi.hoisted(() => ({ props: null }));
const kernel = vi.hoisted(() => ({ ready: true }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: kernel.ready ? 'ready' : 'building',
    ready: kernel.ready,
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
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
// A frame far in the future: a cut's animation reaches its end on its first frame.
let frames = [];
beforeEach(() => {
  frames = [];
  kernel.ready = true;
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  try {
    window.localStorage.clear();
  } catch {
    // No storage: the disclosure starts closed anyway.
  }
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
  return { setCadModel, rerender, model: () => current, unmount: view.unmount };
}
const nav = () => screen.getByRole('navigation', { name: 'Shop route' });
const route = (name) => within(nav()).getByRole('button', { name });
const shopTab = () => act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
const station = (name) => act(() => fireEvent.click(route(name)));
const errorLine = () => document.querySelector('.cad-error');
const board = () => screen.getByRole('region', { name: 'Job board' });
// One flat 100 × 60 blank, selected.
function trayModel() {
  const part = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.5, name: 'Tray' });
  part.id = 'tray';
  return {
    ...emptyModel(),
    sketches: [{ id: 'blank', name: 'Blank', plane: 'XY', profile: { type: 'rectangle', width: 100, height: 60 } }],
    parts: [part],
    instances: [{ id: 'tray-1', partId: 'tray', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }],
  };
}

it('shows the route in shop order with where the product stands, and More runs the other commands', () => {
  const harness = setup(normalizeModel(sheetMetalControlBox()));
  shopTab();
  const buttons = within(nav()).getAllByRole('button');
  expect(buttons.map((b) => b.getAttribute('aria-label') || b.textContent)).toEqual([
    'Draw',
    'Cut',
    'Bend',
    // No Weld, no Assembly (docs/sketch-studio-shop-trim.md §4.1): five stations, 1–5.
    'Paint',
    'Print',
    // SF-5: the film of the product's route, at the end of the route bar.
    'Replay',
    'More ▾',
  ]);
  // The name is the station alone; its status is the description.
  expect(route('Bend').getAttribute('aria-description')).toBe('6 hits');
  expect(route('Paint').getAttribute('aria-description')).toBe('RAL 7035');
  expect(within(nav()).getByText('Control box')).toBeTruthy();
  expect(buttons.filter((b) => b.getAttribute('aria-current'))).toEqual([]);
  expect(buttons.slice(0, 5).map((b) => b.querySelector('.cad-route-number').textContent)).toEqual([
    '1',
    '2',
    '3',
    '4',
    '5',
  ]);
  act(() => fireEvent.click(route('More')));
  const menu = screen.getByRole('group', { name: 'More shop commands' });
  expect(
    within(menu)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual([
    'Add bend by numbers',
    'Unfold',
    // Putting parts together (shop trim §4.3): the Assemble tab's own commands, and a bought-in item.
    'Group',
    'Ungroup',
    'Mate faces',
    'Add bought-in item…',
    'Job sheet',
    'Flat pattern sheet',
    'Example: pump bracket',
    'Example: control box',
    // SF-4.
    'Example: kiosk',
  ]);
  act(() => fireEvent.click(within(menu).getByRole('button', { name: 'Job sheet' })));
  expect(screen.getByRole('region', { name: 'Job sheet' })).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'More shop commands' })).toBe(null);
  // Search still shows the commands, not the route.
  act(() => fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'Press' } }));
  expect(screen.queryByRole('navigation', { name: 'Shop route' })).toBe(null);
  expect(within(document.querySelector('.cad-ribbon')).getByRole('button', { name: 'Press brake' })).toBeTruthy();
  expect(harness.setCadModel).not.toHaveBeenCalled();
});

it('moves between stations without leaving first, and waits only for a stroke or a tool outside the shop', () => {
  setup(trayModel());
  act(() => viewport.props.onSelect('tray-1'));
  shopTab();
  station('Bend');
  expect(route('Bend').getAttribute('aria-current')).toBe('step');
  expect(viewport.props.brakeView).toMatchObject({ instanceId: 'tray-1' });
  // The open station's own button does nothing.
  station('Bend');
  expect(viewport.props.brakeView).toMatchObject({ instanceId: 'tray-1' });
  // Another station: the press brake is left, the laser opens on the same part.
  station('Cut');
  expect(viewport.props.brakeView).toBe(null);
  expect(screen.getByRole('region', { name: 'Laser station' })).toBeTruthy();
  expect(route('Cut').getAttribute('aria-current')).toBe('step');
  // While it cuts, every station waits.
  act(() =>
    fireEvent.click(within(screen.getByRole('region', { name: 'Laser station' })).getByRole('button', { name: 'Cut' })),
  );
  expect(
    within(nav())
      .getAllByRole('button')
      .slice(0, 6)
      .every((b) => b.disabled),
  ).toBe(true);
  runFrames();
  expect(route('Print').disabled).toBe(false);
  // Print: the selection clears, the subject stays: Paint paints that part.
  station('Print');
  expect(viewport.props.shopPick).toMatchObject({ station: 'print' });
  station('Paint');
  expect(viewport.props.shopPick).toMatchObject({ station: 'paint', targets: ['tray-1'] });
  expect(errorLine()).toBe(null);
  // A sketch (a tool outside the shop) turns the route off.
  act(() => fireEvent.keyDown(window, { key: 'Escape' }));
  act(() => fireEvent.keyDown(window, { key: 'Escape' }));
  act(() => fireEvent.keyDown(window, { key: 's' }));
  expect(viewport.props.sketchMode).toBe('pick');
  expect(route('Draw').disabled).toBe(true);
});

it('asks which part when the product has several, and steps back to what is missing instead of erring', () => {
  setup(normalizeModel(sheetMetalControlBox()));
  // An example loads with its group selected: Bend asks which part, with no error line.
  shopTab();
  station('Bend');
  const gate = screen.getByRole('region', { name: 'Press brake' });
  const parts = within(gate).getByRole('list', { name: 'Choose a part' });
  // One row per part with the bend queue's text (BQ-1 §7.4): what came after the brake shows.
  expect(
    within(parts)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Control box body4 bends · painted', 'Control box lid2 bends · painted and printed']);
  expect(errorLine()).toBe(null);
  act(() => fireEvent.click(within(parts).getByRole('button', { name: /Control box lid/ })));
  expect(viewport.props.brakeView).toBe(null);
  // The lid is bent, painted and printed: since SF-5 the brake says it is
  // finished here — a neutral card, no refusal — with this part's own records
  // and the remedy kept as a second choice.
  const brakeCard = screen.getByRole('region', { name: 'Press brake' });
  expect(within(brakeCard).queryByRole('alert')).toBe(null);
  expect(within(brakeCard).getByRole('status', { name: 'Finished here' }).textContent).toBe(
    'Bending is done on this part: 2 hits made. It has gone on down the route: powder-coated RAL 7035 Light grey and printed (2 prints).',
  );
  expect(within(brakeCard).getByRole('button', { name: 'Remove a paint finish and 2 prints and bend' })).toBeTruthy();
  cleanup();

  setup();
  shopTab();
  // An empty model opens Draw by itself.
  expect(screen.getByRole('region', { name: 'Draw' })).toBeTruthy();
  expect(route('Draw').getAttribute('aria-current')).toBe('step');
  // SF-1 audit: the card points at the station that fixes it, in one hop (Draw, not Cut → Draw).
  station('Bend');
  const blocked = screen.getByRole('region', { name: 'Press brake' });
  expect(within(blocked).getByRole('status').textContent).toBe('Nothing to bend yet: draw the outline first.');
  expect(errorLine()).toBe(null);
  act(() => fireEvent.click(within(blocked).getByRole('button', { name: 'Go to Draw' })));
  expect(screen.getByRole('region', { name: 'Draw' })).toBeTruthy();
  station('Cut');
  const cut = screen.getByRole('region', { name: 'Laser station' });
  expect(within(cut).getByRole('status').textContent).toBe('Nothing to cut yet: draw the outline first.');
  act(() => fireEvent.click(within(cut).getByRole('button', { name: 'Go to Draw' })));
  expect(screen.getByRole('region', { name: 'Draw' })).toBeTruthy();
  station('Paint');
  expect(within(screen.getByRole('region', { name: 'Paint booth' })).getByRole('status').textContent).toBe(
    'Nothing to paint yet: draw a part first.',
  );
  expect(errorLine()).toBe(null);
});

it('opens a kernel station once the model is current, with no wait line', () => {
  const harness = setup(trayModel());
  kernel.ready = false;
  harness.rerender();
  shopTab();
  station('Paint');
  const waiting = screen.getByRole('region', { name: 'Paint booth' });
  expect(within(waiting).getByRole('status').textContent).toMatch(/opens as soon as it is current/);
  expect(viewport.props.shopPick).toBe(null);
  expect(errorLine()).toBe(null);
  kernel.ready = true;
  harness.rerender();
  // The one product's part is the booth's target.
  expect(viewport.props.shopPick).toMatchObject({ station: 'paint', stage: 'colour', targets: ['tray-1'] });
});

it('Draw → Rectangle → Cut on the laser: the part is made and the laser is already cutting it', () => {
  const harness = setup();
  shopTab();
  const draw = screen.getByRole('region', { name: 'Draw' });
  act(() => fireEvent.click(within(draw).getByRole('button', { name: /^Rectangle/ })));
  for (const [label, value] of [
    ['Width W (mm)', 120],
    ['Height H (mm)', 80],
  ]) {
    const field = within(draw).getByLabelText(label);
    act(() => {
      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: String(value) } });
    });
    act(() => fireEvent.blur(field));
  }
  act(() => fireEvent.click(within(draw).getByRole('button', { name: 'Cut this rectangle' })));
  const cut = screen.getByRole('region', { name: 'Cut from sheet' });
  expect(within(cut).getByLabelText('Outline').textContent).toMatch(/^Rectangle 120 × 80 mm/);
  expect(route('Cut').getAttribute('aria-current')).toBe('step');
  act(() => fireEvent.click(within(cut).getByRole('button', { name: 'Cut on the laser' })));
  expect(harness.model().parts).toHaveLength(1);
  // The commit reaches the workspace: the laser opens on the new part, cutting.
  harness.rerender();
  const bed = screen.getByRole('figure', { name: 'Laser bed' });
  expect(bed.dataset.state).toBe('cutting');
  const laser = screen.getByRole('region', { name: 'Laser station' });
  expect(within(laser).getByRole('button', { name: 'Stop' })).toBeTruthy();
  runFrames();
  expect(screen.getByRole('figure', { name: 'Laser bed' }).dataset.state).toBe('cut');
  expect(within(laser).getByRole('status', { name: '' }).textContent).toMatch(/^Cut 1 blank on the/);
  // The job board has the part, its next step Bend.
  const row = within(board()).getByRole('button', { name: /Sheet-metal part/ });
  expect(row.textContent).toContain('t 1.5 SPCC · 120 × 80');
  expect(row.textContent).toContain('Next: Bend');
  // Next: Bend → the press brake on the same part; Back: Cut → the laser again.
  act(() => fireEvent.click(within(laser).getByRole('button', { name: 'Next: Bend' })));
  const instanceId = harness.model().instances[0].id;
  expect(viewport.props.brakeView).toMatchObject({ instanceId });
  act(() =>
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Press brake' })).getByRole('button', { name: 'Back: Cut' }),
    ),
  );
  expect(screen.getByRole('figure', { name: 'Laser bed' }).dataset.state).toBe('ready');
  expect(errorLine()).toBe(null);
});

it('the job board: a row selects, moves Bend, becomes the paint target, and only shows while print picks', () => {
  const box = normalizeModel(sheetMetalControlBox());
  const board3 = {
    ...box,
    parts: [
      ...box.parts,
      { id: 'foot', name: 'Foot', features: [{ id: 'foot-f', type: 'box', width: 5, depth: 5, height: 5 }] },
    ],
    instances: [
      ...box.instances,
      { id: 'foot-1', partId: 'foot', name: '', groupId: 'shop-box-group', position: [0, 0, 0], rotation: [0, 0, 0] },
    ],
  };
  setup(board3);
  shopTab();
  const card = within(board()).getByRole('region', { name: 'Product Control box' });
  expect(
    within(card)
      .getAllByRole('button')
      .map((b) => b.querySelector('strong')?.textContent || b.textContent),
  ).toEqual(['Control box body', 'Control box lid', '1 other part — see Tree']);
  // No station: the row selects the part.
  act(() => fireEvent.click(within(card).getByRole('button', { name: /^Control box body/ })));
  expect(viewport.props.selectedId).toBe('shop-box-body-instance');
  // Bend open (on the gate's pick list too): a row moves it.
  station('Bend');
  act(() => fireEvent.click(within(board()).getByRole('button', { name: /^Control box lid/ })));
  expect(screen.getByRole('region', { name: 'Press brake' }).textContent).toMatch(
    // The bend queue rides under the head (BQ-1 §7.2), then the Finished card.
    /^3BendControl box lidParts to bendEvery part is bent\..*Bending is done/,
  );
  // Paint: the row is the target.
  station('Paint');
  act(() => fireEvent.click(within(board()).getByRole('button', { name: /^Control box body/ })));
  expect(viewport.props.shopPick).toMatchObject({
    station: 'paint',
    stage: 'colour',
    targets: ['shop-box-body-instance'],
  });
  // Print picks in the view: the rows only show, and say so.
  station('Print');
  const body = within(board()).getByRole('button', { name: /^Control box body/ });
  expect(body.getAttribute('aria-disabled')).toBe('true');
  expect(body.title).toMatch(/picks a face in the view/);
  act(() => fireEvent.click(body));
  expect(viewport.props.shopPick).toMatchObject({ station: 'print' });
  // Tree shows the parts tree.
  act(() => fireEvent.click(within(card).getByRole('button', { name: '1 other part — see Tree' })));
  expect(document.querySelector('.cad-tree-body')).toBeTruthy();
});

it('keeps the machine numbers one click away, remembered per station, and fixes a short leg in one click', () => {
  const harness = setup(trayModel());
  act(() => viewport.props.onSelect('tray-1'));
  shopTab();
  station('Bend');
  const panel = () => screen.getByRole('region', { name: 'Press brake' });
  act(() =>
    fireEvent.click(
      within(screen.getByRole('figure', { name: 'Flat blank' })).getByRole('button', { name: 'Gauge edge 2' }),
    ),
  );
  const field = within(panel()).getByLabelText('Backgauge L (mm)');
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '6' } });
  });
  act(() => fireEvent.blur(field));
  // The refusal is a card with the die that fits as its button.
  const fix = within(panel()).getByRole('button', { name: 'Use the V6 88° die' });
  expect(within(panel()).getAllByRole('alert')[0].textContent).toMatch(
    /needs 8\.27 mm .* Use the V6 88° die or smaller/,
  );
  act(() => fireEvent.click(fix));
  expect(within(panel()).getByLabelText('Die').value).toBe('v6-88');
  expect(within(panel()).getByRole('button', { name: 'Bend' }).disabled).toBe(false);
  // Machine numbers: closed by default; opening it is remembered for the brake.
  const numbers = panel().querySelector('details.cad-shop-numbers');
  expect(numbers.open).toBe(false);
  expect(within(panel()).getByLabelText('Inside radius').textContent).toMatch(/^R/);
  act(() => {
    numbers.open = true;
    fireEvent(numbers, new Event('toggle'));
  });
  expect(window.localStorage.getItem('cad-shop-numbers:bend')).toBe('open');
  harness.unmount();
  setup(trayModel());
  act(() => viewport.props.onSelect('tray-1'));
  shopTab();
  station('Bend');
  act(() =>
    fireEvent.click(
      within(screen.getByRole('figure', { name: 'Flat blank' })).getByRole('button', { name: 'Gauge edge 2' }),
    ),
  );
  expect(screen.getByRole('region', { name: 'Press brake' }).querySelector('details.cad-shop-numbers').open).toBe(true);
});

// SF-1 audit fix 1: a station's primary button rides in the shell's pinned
// footer (with Back / Next), so it is in view however long the panel is.
it('keeps every station’s primary button in the pinned footer', () => {
  const harness = setup(trayModel());
  act(() => viewport.props.onSelect('tray-1'));
  shopTab();
  const pinned = (region, name) => {
    const button = within(screen.getByRole('region', { name: region })).getByRole('button', { name });
    expect(button.closest('.cad-shell-foot'), `${name} in the pinned footer of ${region}`).toBeTruthy();
    expect(button.closest('.cad-shell-foot').classList.contains('has-primary')).toBe(true);
  };
  station('Bend');
  pinned('Press brake', 'Bend');
  station('Cut');
  pinned('Laser station', 'Cut');
  station('Paint');
  pinned('Paint booth', 'Paint');
  station('Print');
  pinned('Print station', 'New print');
  harness.unmount();
  // A blocked gate's one button, and Cut from sheet's.
  setup();
  shopTab();
  station('Bend');
  pinned('Press brake', 'Go to Draw');
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Go to Draw' })));
  act(() => fireEvent.click(screen.getByRole('button', { name: /^Rectangle/ })));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Cut this rectangle' })));
  pinned('Cut from sheet', 'Cut on the laser');
  // A long workspace test: under the full suite’s load it outruns the default 5 s.
}, 15000);

// SF-1 audit fix 3: More → Add bend by numbers with a station open works on
// the current part (or asks which, through Bend's part gate), never an error line.
it('adds a bend by numbers on the current part from any open station', () => {
  setup(trayModel());
  act(() => viewport.props.onSelect('tray-1'));
  shopTab();
  // The print station clears the selection; the tray stays the subject.
  station('Print');
  expect(viewport.props.selectedId).toBe(null);
  act(() => fireEvent.click(within(nav()).getByRole('button', { name: /More/ })));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Add bend by numbers' })));
  expect(errorLine()).toBe(null);
  expect(viewport.props.selectedId).toBe('tray-1');
  expect(document.querySelector('.cad-sheet-metal .cad-add-bend')).toBeTruthy();
  cleanup();
  // The control box (two blanks, the group selected, the paint booth open):
  // which part gets the bend? Bend's own part gate asks, then the part's form.
  setup(normalizeModel(sheetMetalControlBox()));
  shopTab();
  act(() => viewport.props.onSelect('shop-box-body-instance'));
  station('Paint');
  act(() => fireEvent.click(within(nav()).getByRole('button', { name: /More/ })));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Add bend by numbers' })));
  const gate = screen.getByRole('region', { name: 'Press brake' });
  expect(within(gate).getByText('Which part gets the bend?')).toBeTruthy();
  expect(errorLine()).toBe(null);
  act(() => fireEvent.click(within(gate).getByRole('button', { name: /Control box lid/ })));
  expect(errorLine()).toBe(null);
  expect(viewport.props.selectedId).toBe('shop-box-lid-instance');
  expect(document.querySelector('.cad-sheet-metal .cad-add-bend')).toBeTruthy();
  // No sheet-metal part at all: the blocked card, pointing at Draw.
  cleanup();
  setup();
  shopTab();
  act(() => fireEvent.click(within(nav()).getByRole('button', { name: /More/ })));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Add bend by numbers' })));
  expect(errorLine()).toBe(null);
  expect(
    within(screen.getByRole('region', { name: 'Press brake' })).getByRole('button', { name: 'Go to Draw' }),
  ).toBeTruthy();
}, 15000);
