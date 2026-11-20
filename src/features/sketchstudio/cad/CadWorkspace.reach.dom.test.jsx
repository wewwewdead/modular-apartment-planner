// @vitest-environment jsdom
// Hands on the sheet HO-2 in the workspace (docs/sketch-studio-brake-hands-on.md
// §6.1 – §6.4): an edge clicked on the sheet is the flat-blank card's pick; a
// finger drag of 30 positions makes 30 facts-only stations and one pair of
// outcomes once it settles, and Esc puts the line back as it was; a click on
// the fingers opens the panel with its L field focused and selected; a click
// on the punch or the die opens that picker and no other, focused; and
// nothing is offered in points mode, a scrub, a stroke or the replay. The
// kernel hook and the 3D viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
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
const viewport = vi.hoisted(() => ({ props: null, dragging: false }));
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
      lightBrakeHand: () => {},
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
// The punch stays in the machine (docs/sketch-studio-shop-punches.md §5.5): each test starts from the default.
beforeEach(() => forgetPunch());
afterEach(() => {
  cleanup();
  viewport.dragging = false;
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
  const workspace = () => (
    <MemoryRouter>
      <CadWorkspace
        document={{ id: 'doc', name: 'Test', entities: [], model }}
        setCadModel={vi.fn()}
        documentPersistence={{}}
      />
    </MemoryRouter>
  );
  render(workspace());
  act(() => viewport.props.onSelect('tray-1'));
}
const panel = () => screen.getByRole('region', { name: 'Press brake' });
const map = () => screen.getByRole('figure', { name: 'Flat blank' });
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
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, LIVE_DEBOUNCE_MS + 60)));
const pose = () => {
  const v = viewport.props.brakeView;
  return { flipped: v.flipped, turned: v.turned, gaugePoint: v.gaugePoint, gaugeDistance: v.gaugeDistance };
};
const grip = () => viewport.props.brakeGrip;

it('takes an edge clicked on the sheet exactly as the flat-blank card’s pick', () => {
  setup(sheetModel());
  openBrake();
  // Offered: every gauge edge of the blank, in gauge mode, before a line is picked.
  expect(grip().edges.map((e) => e.index)).toEqual([0, 1, 2, 3]);
  expect(grip()).toMatchObject({ mode: 'gauge', edge: null, fingers: { offered: false } });
  // The card's pick, then the same from the sheet after the line is cleared.
  act(() => fireEvent.click(within(map()).getByRole('button', { name: 'Gauge edge 2' })));
  const byCard = {
    pose: pose(),
    edge: readout('Gauge edge'),
    L: within(panel()).getByLabelText('Backgauge L (mm)').value,
  };
  expect(byCard.edge).toBe('Edge 2 · 100 mm');
  act(() => fireEvent.keyDown(document.body, { key: 'Escape' }));
  expect(viewport.props.brakeView.bendId).toBe(null);
  act(() => viewport.props.onBrakeEdge(1));
  expect({
    pose: pose(),
    edge: readout('Gauge edge'),
    L: within(panel()).getByLabelText('Backgauge L (mm)').value,
  }).toEqual(byCard);
  // The card and the sheet hold the very same function.
  expect(grip().edge).toBe(1);
  expect(within(map()).getByRole('button', { name: 'Gauge edge 2' }).getAttribute('aria-pressed')).toBe('true');
  // The panel's step 1 and the card's caption say both places.
  expect(within(panel()).getByText(/Pick the gauge edge on the sheet or on the flat blank/)).toBeTruthy();
  act(() => fireEvent.keyDown(document.body, { key: 'Escape' }));
  expect(within(map()).getByText('Click an edge, here or on the sheet')).toBeTruthy();
});

it('drags the backgauge: 30 positions make 30 facts-only stations, one pair of outcomes after it settles', async () => {
  setup(sheetModel());
  openBrake();
  act(() => viewport.props.onBrakeEdge(1));
  fill('Backgauge L (mm)', 200);
  await settle();
  expect(grip().fingers).toMatchObject({ offered: true, L: 200, why: null });
  expect(grip().fingers.flange).toBe(readout('Flange').replace(' mm', ''));
  brakeStation.mockClear();
  const facts = () =>
    brakeStation.mock.calls.filter(([{ session, advise }]) => advise === false && !session.flip && session.edge === 1);
  const outcomes = () =>
    brakeStation.mock.calls.filter(([{ session, advise }]) => advise === false && (session.flip || session.edge === 3));
  act(() => viewport.props.onBrakeFingers({ start: true }));
  for (let i = 1; i <= 30; i++) act(() => viewport.props.onBrakeFingers({ distance: 200 - i }));
  act(() => viewport.props.onBrakeFingers({ end: true }));
  expect(facts()).toHaveLength(30);
  expect(outcomes()).toHaveLength(0);
  expect(within(panel()).getByLabelText('Backgauge L (mm)').value).toBe('170');
  expect(grip().fingers).toMatchObject({ offered: true, L: 170 });
  await settle();
  expect(outcomes()).toHaveLength(2);
  expect(facts()).toHaveLength(30);
});

it('puts the line back as it was when Esc lets go of the fingers', () => {
  setup(sheetModel());
  openBrake();
  act(() => viewport.props.onBrakeEdge(1));
  fill('Backgauge L (mm)', 200);
  // Turned with its own flag and a shorter punch: a new L resets the turn; the punch keeps its length (TL-2).
  fill('Punch length', 80);
  const before = { L: 200, punch: within(panel()).getByLabelText('Punch length').value, pose: pose() };
  act(() => viewport.props.onBrakeFingers({ start: true }));
  for (const distance of [195, 190, 185]) act(() => viewport.props.onBrakeFingers({ distance }));
  expect(within(panel()).getByLabelText('Punch length').value).toBe(before.punch);
  act(() => viewport.props.onBrakeFingers({ cancel: true }));
  expect(within(panel()).getByLabelText('Backgauge L (mm)').value).toBe('200');
  expect(within(panel()).getByLabelText('Punch length').value).toBe(before.punch);
  expect(pose()).toEqual(before.pose);
});

it('opens the panel on the L field, focused and selected, when the fingers are clicked', () => {
  setup(sheetModel());
  openBrake();
  act(() => viewport.props.onBrakeEdge(1));
  fill('Backgauge L (mm)', 200);
  // The panel collapsed: a click on the fingers opens it.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Collapse properties panel' })));
  expect(screen.queryByRole('region', { name: 'Press brake' })).toBe(null);
  act(() => viewport.props.onBrakeFocus('distance'));
  const field = within(panel()).getByLabelText('Backgauge L (mm)');
  expect(document.activeElement).toBe(field);
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
  // Typing replaces it.
  expect(field.value).toBe('200');
});

it('opens the punch’s or the die’s picker and no other, focused, when that blade is clicked', () => {
  setup(sheetModel());
  openBrake();
  act(() => viewport.props.onBrakeEdge(1));
  act(() => viewport.props.onBrakeFocus('die'));
  expect(within(panel()).queryByRole('region', { name: 'Punches' })).toBe(null);
  const dies = within(panel()).getByRole('region', { name: 'Dies' });
  expect(dies.contains(document.activeElement)).toBe(true);
  expect(document.activeElement.getAttribute('aria-pressed')).toBe('true');
  act(() => viewport.props.onBrakeFocus('punch'));
  expect(within(panel()).queryByRole('region', { name: 'Dies' })).toBe(null);
  const punches = within(panel()).getByRole('region', { name: 'Punches' });
  expect(punches.contains(document.activeElement)).toBe(true);
  expect(document.activeElement.getAttribute('aria-label')).toBe('Straight 88°');
  // The Blades row's own button still toggles the same picker.
  const blades = within(panel()).getByRole('group', { name: 'Blades' });
  act(() => fireEvent.click(within(blades).getByRole('button', { name: /^Top: punch/ })));
  expect(within(panel()).queryByRole('region', { name: 'Punches' })).toBe(null);
  // Chosen from the picker: the session's punch, the picker closed.
  act(() => viewport.props.onBrakeFocus('punch'));
  act(() =>
    fireEvent.click(
      within(within(panel()).getByRole('region', { name: 'Punches' })).getByRole('button', { name: 'Gooseneck 88°' }),
    ),
  );
  expect(viewport.props.brakeView.punch).toBe('gooseneck-88');
  expect(within(panel()).queryByRole('region', { name: 'Punches' })).toBe(null);
});

it('offers nothing in points mode, a scrub, a stroke or the replay', () => {
  setup(
    sheetModel({
      width: 100,
      height: 60,
      bends: [{ id: 'b1', a: [20, -1], b: [20, 61], angle: 90, direction: 'up', radius: null }],
    }),
  );
  openBrake();
  act(() => viewport.props.onBrakeEdge(1));
  fill('Backgauge L (mm)', 20);
  expect(grip()).toMatchObject({ shown: true, fingers: { offered: true } });
  expect(grip().edges).toHaveLength(4);
  // Points mode: no edges, no fingers.
  act(() =>
    fireEvent.click(
      within(within(panel()).getByRole('group', { name: 'Punch line' })).getByRole('button', { name: 'Two points' }),
    ),
  );
  expect(grip()).toMatchObject({ mode: 'points', edges: null, fingers: { offered: false } });
  act(() =>
    fireEvent.click(
      within(within(panel()).getByRole('group', { name: 'Punch line' })).getByRole('button', {
        name: 'Backgauge edge',
      }),
    ),
  );
  act(() => viewport.props.onBrakeEdge(1));
  fill('Backgauge L (mm)', 20);
  // A made step shown: nothing.
  const steps = within(panel()).getByRole('list', { name: 'Sequence' });
  act(() =>
    fireEvent.click(
      within(within(steps).getByRole('listitem', { name: 'Step 1' })).getByRole('button', { name: 'Before' }),
    ),
  );
  expect(grip()).toMatchObject({ shown: false, edges: null, fingers: null });
  // And no picker from the sheet then.
  act(() => viewport.props.onBrakeFocus('die'));
  act(() => fireEvent.keyDown(document.body, { key: 'Escape' }));
  expect(grip().shown).toBe(true);
  expect(within(panel()).queryByRole('region', { name: 'Dies' })).toBe(null);
  // A stroke: nothing (Esc cleared the line with the scrub: picked again).
  act(() => viewport.props.onBrakeEdge(1));
  fill('Backgauge L (mm)', 20);
  act(() => fireEvent.keyDown(document.body, { key: 'Enter' }));
  expect(viewport.props.brakeView.stroke).toBeTruthy();
  expect(grip()).toMatchObject({ shown: false, edges: null, fingers: null });
});

it('hands the viewport nothing to offer while the replay plays', () => {
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
