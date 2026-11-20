// @vitest-environment jsdom
// BQ-1 in the workspace (docs/sketch-studio-outline-edit-sheet-nest.md §7):
// the bend queue under the press brake's head (its rows, count, Previous /
// Next part, a row click, the Finished card), the punch and die carried to
// the next part and dropped by a real leave, Bend's gate one row per part,
// and a job board row while the laser is open on a batch. The kernel hook and
// the 3D viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
import { emptyModel } from './model.js';
import { sheetMetalPart } from './ShopPanels.jsx';
// The whole workspace renders in each test: allow for the full suite's load.
vi.setConfig({ testTimeout: 15000 });

const viewport = vi.hoisted(() => ({ props: null }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'ready',
    ready: true,
    snapshot: {
      parameters: {},
      parts: [],
      instances: model.instances.map((i) => {
        const [x, y] = i.position || [0, 0, 0];
        return {
          id: i.id,
          partId: i.partId,
          bounds: [
            [x, y, 0],
            [x + 100, y + 60, 1.5],
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

const rect = (width, height) => ({ type: 'rectangle', width, height, origin: [0, 0] });
// Three cut parts, as a batch makes them: Big, Small × 2, Tab (each copy loose).
function cutParts({ only = null } = {}) {
  const list = [
    ['big', 'Big', 300, 200, 1],
    ['small', 'Small', 200, 100, 2],
    ['tab', 'Tab', 150, 150, 1],
  ].filter(([id]) => !only || only.includes(id));
  return {
    ...emptyModel(),
    sketches: list.map(([id, name, w, h]) => ({ id: `s-${id}`, name, plane: 'XY', profile: rect(w, h) })),
    parts: list.map(([id, name]) => ({
      ...sheetMetalPart({ sketchId: `s-${id}`, stock: 'spcc', thickness: 1.5, name }),
      id,
    })),
    instances: list.flatMap(([id, , w, , copies], k) =>
      Array.from({ length: copies }, (_, c) => ({
        id: `${id}-${c + 1}`,
        partId: id,
        name: '',
        position: [k * 400 + c * (w + 20), 0, 0],
        rotation: [0, 0, 0],
        visible: true,
      })),
    ),
  };
}
const outlines = () => ({
  ...emptyModel(),
  sketches: [
    { id: 'big', name: 'Big', plane: 'XY', profile: rect(300, 200) },
    { id: 'small', name: 'Small', plane: 'XY', profile: rect(200, 100) },
    { id: 'tab', name: 'Tab', plane: 'XY', profile: rect(150, 150) },
  ],
});
function setup(model, select = null) {
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
  if (select) act(() => viewport.props.onSelect(select));
  return { setCadModel, rerender, model: () => current };
}
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
const station = (name) => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route(name)));
};
const brake = () => screen.getByRole('region', { name: 'Press brake' });
const queue = () => within(brake()).getByRole('region', { name: 'Bend queue' });
const rows = () => within(within(queue()).getByRole('list', { name: 'Parts to bend' })).getAllByRole('button');
const progress = () => within(queue()).getByRole('status', { name: 'Bend progress' }).textContent;
const step = (name) => within(queue()).getByRole('button', { name });
const punch = () => within(brake()).getByLabelText('Punch').value;
const fill = (label, value) => {
  const field = within(brake()).getByLabelText(label, { exact: true });
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: String(value) } });
  });
  act(() => fireEvent.blur(field));
};
// One hit: the right edge on the backgauge, L 20, the pedal, the stroke's end, the commit shown.
const bendOnce = (harness) => {
  act(() =>
    fireEvent.click(
      within(screen.getByRole('figure', { name: 'Flat blank' })).getByRole('button', { name: 'Gauge edge 2' }),
    ),
  );
  fill('Backgauge L (mm)', 20);
  act(() => fireEvent.keyDown(document.body, { key: ' ' }));
  const token = viewport.props.brakeView.stroke.token;
  act(() => viewport.props.onBrakeStrokeEnd(token));
  harness.rerender();
};

it('lists every part to bend under the head, steps through them and keeps the punch and die in the machine', () => {
  const harness = setup(cutParts(), 'big-1');
  station('Bend');
  expect(viewport.props.brakeView).toMatchObject({ instanceId: 'big-1' });
  // Under the shell's head, before the station's own body.
  expect(brake().textContent).toMatch(/^3BendBigParts to bend0 of 3 bent/);
  expect(rows().map((b) => b.textContent)).toEqual([
    'Bigflat · no bends yet',
    'Small × 2flat · no bends yet',
    'Tabflat · no bends yet',
  ]);
  expect(rows().map((b) => b.getAttribute('aria-current'))).toEqual(['true', null, null]);
  expect(progress()).toBe('0 of 3 bent');
  expect(step('Previous part').disabled).toBe(true);
  expect(step('Next part').disabled).toBe(false);
  expect(step('Next part').classList.contains('is-ready')).toBe(false);

  // Another punch than the default, one hit: row 1 bent, Next is the accent.
  act(() => fireEvent.change(within(brake()).getByLabelText('Punch'), { target: { value: 'gooseneck-88' } }));
  bendOnce(harness);
  expect(harness.model().parts[0].features[0].bends).toHaveLength(1);
  expect(rows()[0].textContent).toBe('Big1 bend');
  expect(progress()).toBe('1 of 3 bent');
  expect(step('Next part').classList.contains('is-ready')).toBe(true);

  // Next part: Small on the brake, the punch still in, the picks fresh.
  act(() => fireEvent.click(step('Next part')));
  expect(viewport.props.brakeView).toMatchObject({ instanceId: 'small-1', bendId: null });
  expect(punch()).toBe('gooseneck-88');
  expect(within(brake()).getByLabelText('Gauge edge', { exact: true }).textContent).toBe(
    'Click a straight outline edge on the flat blank',
  );
  expect(rows()[1].getAttribute('aria-current')).toBe('true');
  expect(step('Previous part').disabled).toBe(false);
  // A bend belongs to the part: both copies fold with it.
  bendOnce(harness);
  expect(harness.model().parts.find((p) => p.id === 'small').features[0].bends).toHaveLength(1);
  expect(rows()[1].textContent).toBe('Small × 21 bend');

  // A row: Tab on the brake (still the same punch); bent, every part is.
  act(() => fireEvent.click(rows()[2]));
  expect(viewport.props.brakeView).toMatchObject({ instanceId: 'tab-1' });
  expect(punch()).toBe('gooseneck-88');
  expect(step('Next part').disabled).toBe(true);
  bendOnce(harness);
  expect(progress()).toBe('Every part is bent.');

  // Big painted: its row reads so, and it shows its Finished card with the strip above it.
  act(() =>
    harness.setCadModel({
      ...harness.model(),
      finishes: [{ id: 'f', instanceId: 'big-1', kind: 'powder', name: 'RAL 9005', colour: '#000000', thickness: 70 }],
    }),
  );
  harness.rerender();
  expect(rows()[0].textContent).toBe('Big1 bend · painted');
  act(() => fireEvent.click(rows()[0]));
  expect(viewport.props.brakeView).toBe(null);
  expect(brake().textContent).toMatch(/^3BendBigParts to bendEvery part is bent\..*Bending is done on this part/);
  // Next part still works from there, and the punch is still in the machine.
  act(() => fireEvent.click(step('Next part')));
  expect(viewport.props.brakeView).toMatchObject({ instanceId: 'small-1' });
  expect(punch()).toBe('gooseneck-88');

  // Leave press brake, Bend again: the carry ended with the station, but the punch stays in the
  // machine (docs/sketch-studio-shop-punches.md §5.5): the visit starts with the last hit's punch.
  act(() => fireEvent.click(within(brake()).getByRole('button', { name: 'Leave press brake' })));
  station('Bend');
  expect(punch()).toBe('gooseneck-88');
});

it('starts from the defaults after another station in between, and shows no queue for one part', () => {
  const harness = setup(cutParts(), 'big-1');
  station('Bend');
  // A punch chosen with no hit made is not remembered (shop punches §5.5: written when a hit is committed).
  act(() => fireEvent.change(within(brake()).getByLabelText('Punch'), { target: { value: 'gooseneck-88' } }));
  // Back to Cut, then the job board's Bend on another part: a real leave in between.
  act(() => fireEvent.click(within(brake()).getByRole('button', { name: 'Back: Cut' })));
  harness.rerender();
  station('Bend');
  expect(punch()).toBe('straight-88');
  cleanup();

  setup(cutParts({ only: ['big'] }), 'big-1');
  station('Bend');
  expect(viewport.props.brakeView).toMatchObject({ instanceId: 'big-1' });
  expect(within(brake()).queryByRole('region', { name: 'Bend queue' })).toBe(null);
});

it('asks which part with one row per part, its copies counted', () => {
  setup(cutParts());
  station('Bend');
  const gate = brake();
  expect(within(gate).getByText('Which part goes on the press brake?')).toBeTruthy();
  const choose = within(within(gate).getByRole('list', { name: 'Choose a part' })).getAllByRole('button');
  expect(choose.map((b) => b.textContent)).toEqual([
    'Bigflat · no bends yet',
    'Small × 2flat · no bends yet',
    'Tabflat · no bends yet',
  ]);
  // A row opens the brake on that part's first copy, with the queue.
  act(() => fireEvent.click(choose[1]));
  expect(viewport.props.brakeView).toMatchObject({ instanceId: 'small-1' });
  expect(rows()[1].getAttribute('aria-current')).toBe('true');
});

it('makes a job board row of the batch the laser is on the lead, keeping the job', () => {
  const harness = setup(outlines());
  station('Draw');
  act(() =>
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Draw' })).getByRole('button', { name: 'Cut all outlines' }),
    ),
  );
  const cut = screen.getByRole('region', { name: 'Cut from sheet' });
  const quantity = within(cut).getByLabelText('Quantity of Small');
  act(() => {
    fireEvent.focus(quantity);
    fireEvent.change(quantity, { target: { value: '2' } });
  });
  act(() => fireEvent.blur(quantity));
  act(() => fireEvent.click(within(cut).getByRole('button', { name: 'Cut on the laser' })));
  harness.rerender();
  runFrames();
  const laser = () => screen.getByRole('region', { name: 'Laser station' });
  const job = () => within(within(laser()).getByRole('list', { name: 'This cut' })).getAllByRole('button');
  expect(job().map((b) => b.getAttribute('aria-current'))).toEqual(['true', null, null]);
  const board = screen.getByRole('region', { name: 'Job board' });
  // Small's second copy on the job board: Small leads, the job of four blanks stays.
  const [, , second] = harness.model().instances;
  act(() => fireEvent.click(within(board).getAllByRole('button', { name: /^Small/ })[1]));
  expect(job().map((b) => b.getAttribute('aria-current'))).toEqual([null, 'true', null]);
  expect(laser().querySelector('.cad-shell-subject').textContent).toBe('Small + 2 more');
  expect(within(laser()).getByLabelText('On this sheet').textContent).toBe('4 blanks');
  expect(within(laser()).getByLabelText('Quantity').value).toBe('2');
  expect(second.partId).toBe(harness.model().parts[1].id);
});
