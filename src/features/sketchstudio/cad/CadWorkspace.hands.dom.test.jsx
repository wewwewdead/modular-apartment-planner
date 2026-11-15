// @vitest-environment jsdom
// Hands on the sheet HO-1 in the workspace (docs/sketch-studio-brake-hands-on.md
// §5.1, §5.4, §5.5, §5.6): the view toolbar speaks sheet at the brake (Flip
// over, Turn around in place of the model's part commands) and patches the
// session exactly as the panel's controls do; F and T, never while typing;
// both disabled while a stroke runs; the two outcomes worked out once the
// session is still (not during 30 changes of L); a handle's act from the
// viewport; Esc while a handle is in the hand leaves the line picked; no
// handles in a scrub or the replay. The kernel hook and the 3D viewport are
// stand-ins.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { emptyModel } from './model.js';
import { sheetMetalPart } from './ShopPanels.jsx';
import { LIVE_DEBOUNCE_MS } from './liveField.js';
import { brakeStation } from './brakeStation.js';
// The whole workspace renders in each test: under the full suite's load the long ones outrun 5 s.
vi.setConfig({ testTimeout: 15000 });

// Every station the workspace works out, counted (the facts, the advice, the grip's outcomes).
vi.mock('./brakeStation.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, brakeStation: vi.fn(actual.brakeStation) };
});
const viewport = vi.hoisted(() => ({ props: null, dragging: false, lit: [] }));
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
      viewDropPoint: () => [0, 0, 0],
      getInstanceBounds: () => null,
      isDragging: () => viewport.dragging,
      getCanvas: () => null,
      lightBrakeHand: (kind) => viewport.lit.push(kind),
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
afterEach(() => {
  cleanup();
  viewport.dragging = false;
  viewport.lit = [];
  brakeStation.mockClear();
});

const sheetModel = ({ width = 300, height = 100, bends = [] } = {}) => {
  const part = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.5, name: 'Tray' });
  part.id = 'tray';
  part.features[0].bends = bends;
  return {
    ...emptyModel(),
    sketches: [
      {
        id: 'blank',
        name: 'Blank',
        plane: 'XY',
        profile: { type: 'rectangle', width, height, origin: [0, 0] },
        primitives: [],
        constrained: false,
      },
    ],
    parts: [part],
    instances: [{ id: 'tray-1', partId: 'tray', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }],
  };
};
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
  act(() => viewport.props.onSelect('tray-1'));
  return { setCadModel, rerender: () => view.rerender(workspace()), model: () => current };
}
const panel = () => screen.getByRole('region', { name: 'Press brake' });
const map = () => screen.getByRole('figure', { name: 'Flat blank' });
const toolbar = () => document.querySelector('.cad-view-toolbar');
const sheet = () => within(toolbar()).getByRole('group', { name: 'Sheet' });
const flipOver = () => within(sheet()).getByRole('button', { name: 'Flip over' });
const turnAround = () => within(sheet()).getByRole('button', { name: 'Turn around' });
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
const openBrake = () => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route('Bend')));
};
const fill = (label, value, scope = panel()) => {
  const field = within(scope).getByLabelText(label, { exact: true });
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: String(value) } });
  });
  act(() => fireEvent.blur(field));
};
const readout = (label) => within(panel()).getByLabelText(label, { exact: true }).textContent;
const key = (k, target = document.body) => act(() => fireEvent.keyDown(target, { key: k }));
const gauge = (edge, L) => {
  act(() => fireEvent.click(within(map()).getByRole('button', { name: `Gauge edge ${edge}` })));
  fill('Backgauge L (mm)', L);
};
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, LIVE_DEBOUNCE_MS + 60)));
// What the station poses after an act: the fields an act changes.
const pose = () => {
  const v = viewport.props.brakeView;
  return { flipped: v.flipped, turned: v.turned, gaugePoint: v.gaugePoint, gaugeDistance: v.gaugeDistance };
};
const named = (name) => within(toolbar()).queryByRole('button', { name, exact: true });

it('speaks sheet in the view toolbar at the brake, and the model’s commands again when it closes', () => {
  setup(sheetModel());
  for (const name of ['Move part', 'Rotate part', 'Flip Horizontal', 'Flip Vertical', 'Measure', 'Place holes'])
    expect(named(name)).not.toBe(null);
  expect(within(toolbar()).queryByRole('group', { name: 'Sheet' })).toBe(null);
  openBrake();
  for (const name of [
    'Move part',
    'Rotate part',
    'Flip Horizontal',
    'Flip Vertical',
    'Measure',
    'Place holes',
    'Move holes',
  ])
    expect(named(name)).toBe(null);
  // Standard view, the projection, Fit, the see-through modes and Split drawing stay.
  for (const name of ['Orthographic', 'Fit', 'Split drawing']) expect(named(name)).not.toBe(null);
  expect(within(toolbar()).getByRole('group', { name: 'See-through mode' })).toBeTruthy();
  expect(flipOver().getAttribute('aria-pressed')).toBe('false');
  expect(flipOver().title).toBe(
    'Flip the sheet over: the machine always bends up, so a bend down is made with the sheet turned over (F)',
  );
  expect(turnAround().disabled).toBe(true);
  expect(turnAround().title).toBe('Pick the punch line first');
  gauge(2, 200);
  expect(turnAround().disabled).toBe(false);
  expect(turnAround().title).toBe('Turn the sheet around: the other side of the punch line goes to the backgauge (T)');
  // Hovering or focusing a button lights its handle in the view; leaving puts it out.
  act(() => fireEvent.pointerEnter(turnAround()));
  act(() => fireEvent.pointerLeave(turnAround()));
  act(() => fireEvent.focus(flipOver()));
  expect(viewport.lit).toEqual(['turn', null, 'flip']);
  // Leaving the brake: the model's commands come back.
  key('Escape');
  key('Escape');
  expect(viewport.props.brakeView).toBe(null);
  expect(named('Flip Horizontal')).not.toBe(null);
  expect(within(toolbar()).queryByRole('group', { name: 'Sheet' })).toBe(null);
});

it('patches the session exactly as the panel’s Flip sheet and Turn sheet around do', () => {
  setup(sheetModel());
  openBrake();
  gauge(2, 200);
  const start = pose();
  // The panel's switch, then the toolbar's button, from the same state: the same pose.
  act(() => fireEvent.click(within(panel()).getByRole('switch', { name: 'Flip sheet' })));
  const byPanel = pose();
  act(() => fireEvent.click(within(panel()).getByRole('switch', { name: 'Flip sheet' })));
  expect(pose()).toEqual(start);
  act(() => fireEvent.click(flipOver()));
  expect(pose()).toEqual(byPanel);
  expect(within(panel()).getByRole('switch', { name: 'Flip sheet' }).checked).toBe(true);
  expect(flipOver().getAttribute('aria-pressed')).toBe('true');
  act(() => fireEvent.click(flipOver()));
  // Turn around: the opposite edge and L to the same line, as the panel's button gives.
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Turn sheet around' })));
  const turnedByPanel = { pose: pose(), edge: readout('Gauge edge') };
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Turn sheet around' })));
  expect(pose()).toEqual(start);
  act(() => fireEvent.click(turnAround()));
  expect({ pose: pose(), edge: readout('Gauge edge') }).toEqual(turnedByPanel);
  expect(turnedByPanel.edge).toBe('Edge 4 · 100 mm');
  // The viewport's handles make the same acts (a click, or a drag let go past 90°).
  act(() => viewport.props.onBrakeGrip('turn'));
  expect(pose()).toEqual(start);
  act(() => viewport.props.onBrakeGrip('flip'));
  expect(pose()).toEqual(byPanel);
});

it('flips with F and turns around with T, never while typing in a field, and waits through a stroke', () => {
  setup(sheetModel());
  openBrake();
  // No line: T does nothing, F flips the blank.
  key('t');
  key('f');
  expect(viewport.props.brakeView.flipped).toBe(true);
  key('f');
  gauge(2, 200);
  key('t');
  expect(readout('Gauge edge')).toBe('Edge 4 · 100 mm');
  key('T');
  expect(readout('Gauge edge')).toBe('Edge 2 · 100 mm');
  // Typing in a field: the letters are the field's.
  const angle = within(panel()).getByLabelText('Bend angle (°)', { exact: true });
  key('f', angle);
  key('t', angle);
  expect(viewport.props.brakeView.flipped).toBe(false);
  expect(readout('Gauge edge')).toBe('Edge 2 · 100 mm');
  // Ctrl / Alt chords are not F.
  act(() => fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true }));
  act(() => fireEvent.keyDown(document.body, { key: 'f', altKey: true }));
  expect(viewport.props.brakeView.flipped).toBe(false);
  // The pedal: a stroke runs; the Sheet buttons wait (with their reason) and F does nothing.
  key('Enter');
  expect(viewport.props.brakeView.stroke).toBeTruthy();
  expect(flipOver().disabled).toBe(true);
  expect(turnAround().disabled).toBe(true);
  expect(flipOver().title).toBe('Wait for the stroke to finish');
  key('f');
  expect(within(panel()).getByRole('switch', { name: 'Flip sheet' }).checked).toBe(false);
  // The grip is not shown while it runs.
  expect(viewport.props.brakeGrip.shown).toBe(false);
});

it('works out both outcomes once the session is still, not during 30 changes of L', async () => {
  setup(sheetModel());
  openBrake();
  gauge(2, 200);
  await settle();
  brakeStation.mockClear();
  // The outcomes' stations: the session flipped, or gauged from the opposite edge.
  const outcomeCalls = () =>
    brakeStation.mock.calls.filter(([{ session, advise }]) => advise === false && (session.flip || session.edge === 3));
  for (let i = 0; i < 30; i++) fill('Backgauge L (mm)', 150 + i);
  expect(outcomeCalls()).toHaveLength(0);
  // The facts follow every change.
  expect(brakeStation.mock.calls.length).toBeGreaterThanOrEqual(30);
  expect(viewport.props.brakeGrip).toMatchObject({ shown: true, lined: true, flip: null, turn: null });
  await settle();
  expect(outcomeCalls()).toHaveLength(2);
  expect(viewport.props.brakeGrip.flip).toMatchObject({ hit: true, ok: true, fact: null });
  expect(viewport.props.brakeGrip.turn).toMatchObject({ hit: true, ok: true, fact: null });
  expect(viewport.props.brakeGrip.turn.view.gaugeDistance).toBeCloseTo(300 - 179, 6);
  expect(viewport.props.brakeGrip.ms).toBeGreaterThanOrEqual(0);
  // Still: worked out once, not again.
  await settle();
  expect(outcomeCalls()).toHaveLength(2);
  // A new L: the old outcomes are not shown for it.
  fill('Backgauge L (mm)', 120);
  expect(viewport.props.brakeGrip).toMatchObject({ flip: null, turn: null });
});

it('keeps the line picked when Esc puts a handle down, and draws no handles in a scrub', () => {
  setup(
    sheetModel({
      width: 100,
      height: 60,
      bends: [{ id: 'b1', a: [20, -1], b: [20, 61], angle: 90, direction: 'up', radius: null }],
    }),
  );
  openBrake();
  gauge(2, 20);
  // A handle in the hand (the viewport says so): Esc is the drag's.
  viewport.dragging = true;
  key('Escape');
  expect(readout('Gauge edge')).toBe('Edge 2 · 60 mm');
  viewport.dragging = false;
  expect(viewport.props.brakeGrip.shown).toBe(true);
  // A made step shown: no handles.
  const steps = within(panel()).getByRole('list', { name: 'Sequence' });
  act(() =>
    fireEvent.click(
      within(within(steps).getByRole('listitem', { name: 'Step 1' })).getByRole('button', { name: 'Before' }),
    ),
  );
  expect(viewport.props.brakeView.scrub).toBe(true);
  expect(viewport.props.brakeGrip.shown).toBe(false);
  key('Escape');
  expect(viewport.props.brakeGrip.shown).toBe(true);
});

it('hands the viewport no grip while the replay plays', () => {
  setup(
    sheetModel({
      width: 100,
      height: 60,
      bends: [{ id: 'b1', a: [20, -1], b: [20, 61], angle: 90, direction: 'up', radius: null }],
    }),
  );
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route('Replay')));
  expect(screen.getByRole('region', { name: 'Replay' })).toBeTruthy();
  expect(viewport.props.brakeGrip).toBe(null);
});

it('waits for a handle’s first approach on a part whose pair would pass the budget (the kiosk face frame)', async () => {
  setup(sheetModel());
  openBrake();
  // The clock runs 20 ms a reading: the facts read as a heavy station, so the pair would pass HANDS_BUDGET_MS.
  let clock = 0;
  const now = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 20));
  gauge(2, 200);
  expect(viewport.props.brakeGrip.lazy).toBe(true);
  await settle();
  expect(viewport.props.brakeGrip).toMatchObject({ flip: null, turn: null });
  // The turn ring approached: its outcome now, the flip's still waiting.
  act(() => viewport.props.onBrakeGripWant('turn'));
  expect(viewport.props.brakeGrip.turn).toMatchObject({ hit: true, ok: true });
  expect(viewport.props.brakeGrip.flip).toBe(null);
  act(() => viewport.props.onBrakeGripWant('flip'));
  expect(viewport.props.brakeGrip.flip).toMatchObject({ hit: true, ok: true });
  const ms = viewport.props.brakeGrip.ms;
  // Approached again: nothing more is worked out.
  brakeStation.mockClear();
  act(() => viewport.props.onBrakeGripWant('flip'));
  expect(brakeStation).not.toHaveBeenCalled();
  expect(viewport.props.brakeGrip.ms).toBe(ms);
  now.mockRestore();
});
