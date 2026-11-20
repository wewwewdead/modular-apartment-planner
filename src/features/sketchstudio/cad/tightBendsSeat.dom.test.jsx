// @vitest-environment jsdom
// The line finds the bend at the press brake (docs/sketch-studio-tight-bends.md
// §7.4 (d), (e), TB-3): the seated note in both wordings, "Bend {n} on
// instead" on the error card and on the short-leg card (calling onBendOn, not
// there without it), the flat blank's made bend lines as buttons (gauge mode
// only, not the bend being bent on, the nearest line in reach of the pointer
// against a gauge edge 11 mm away), and in the workspace: the L field typed
// while the seat rewrites L, the short-leg card's button and the flat blank's
// bend click setting the line. The kernel hook and the 3D viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import FlatPatternMap from './FlatPatternMap.jsx';
import { forgetPunch } from './brakeMemory.js';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import { sheetMetalPart } from './ShopPanels.jsx';
import { brakePatch, brakeSessionDefaults, brakeStation, sequenceChecks } from './brakeStation.js';
import { machineOf } from './shopCatalog.js';
import { emptyModel } from './model.js';
// The whole workspace renders in some tests: allow for the full suite's load.
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
      viewDropPoint: () => [0, 0, 0],
      getInstanceBounds: () => null,
      isDragging: () => false,
      getCanvas: () => null,
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
beforeEach(() => forgetPunch());
afterEach(() => cleanup());

// §7.2: the 605.4 × 420.4 tray, t 1.2 SPCC, bend 1 made at L 29 from the right edge (edge 2) to 45°.
const W = 605.4,
  H = 420.4;
const RIGHT = 1;
const line = (id, fromRight, angle = 90) => ({
  id,
  a: [W - fromRight, 0],
  b: [W - fromRight, H],
  angle,
  direction: 'up',
  radius: null,
  punch: 'straight-88',
});
const sheetModel = (bends) => {
  const part = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.2, name: 'Tray' });
  part.id = 'tray';
  part.features[0].bends = bends;
  return {
    ...emptyModel(),
    sketches: [
      {
        id: 'blank',
        name: 'Blank',
        plane: 'XY',
        profile: { type: 'rectangle', width: W, height: H, origin: [0, 0] },
        primitives: [],
        constrained: false,
      },
    ],
    parts: [part],
    instances: [{ id: 'tray-1', partId: 'tray', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }],
  };
};
const MADE = [line('b1', 29, 45)];
const session = (patch = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'tray-1',
  mode: 'gauge',
  edge: RIGHT,
  distance: 100,
  ...patch,
});
// A pick as the workspace applies it: brakePatch with the station of the session before.
const picked = (model, patch, before = session()) =>
  brakePatch(before, patch, brakeStation({ model, session: before, advise: false }));
const region = () => screen.getByRole('region', { name: 'Press brake' });
const panelOf = (model, s, handlers = {}) => {
  const station = brakeStation({ model, session: s, advise: false });
  const checks = sequenceChecks({ fold: station.fold, machine: machineOf('brake-50-2000') });
  return render(
    <PressBrakePanel
      station={station}
      session={s}
      checks={checks}
      onSession={() => {}}
      onMachine={() => {}}
      onBend={() => {}}
      onLeave={() => {}}
      onScrub={() => {}}
      onRerun={() => {}}
      onMove={() => {}}
      onRemove={() => {}}
      onBendOn={() => {}}
      {...handlers}
    />,
  );
};

it('says where the line was set and why it moved: gauge and two-point wording', () => {
  const model = sheetModel(MADE);
  const { unmount } = panelOf(model, picked(model, { distance: 30 }));
  expect(within(region()).getByRole('note', { name: 'Bend on' }).textContent).toBe(
    "This is bend 1's line: it stands at 45°. This hit bends it on.",
  );
  expect(within(region()).getByRole('note', { name: 'Seated on the bend' }).textContent).toBe(
    "L 30 is 1 mm from bend 1's line. A bent line seats itself in the die, so the line is on bend 1.",
  );
  expect(within(region()).getByLabelText('Bend on to (°)', { exact: true }).value).toBe('90');
  expect(within(region()).getByRole('button', { name: 'Bend', exact: true }).disabled).toBe(false);
  unmount();
  const points = picked(model, {
    mode: 'points',
    points: [
      [576.7, 5],
      [576.6, 415],
    ],
  });
  const second = panelOf(model, points);
  expect(within(region()).getByRole('note', { name: 'Seated on the bend' }).textContent).toBe(
    "The line you set is 0.3 mm from bend 1's line. A bent line seats itself in the die, so the line is on bend 1.",
  );
  second.unmount();
  // On the line exactly: no seated note.
  panelOf(model, picked(model, { distance: 29 }));
  expect(within(region()).getByRole('note', { name: 'Bend on' })).toBeTruthy();
  expect(within(region()).queryByRole('note', { name: 'Seated on the bend' })).toBe(null);
});

it('puts "Bend 1 on instead" on the error card and on the short-leg card; it calls onBendOn', () => {
  const model = sheetModel(MADE);
  const onBendOn = vi.fn();
  // A session that reached the station unseated (set without brakePatch): the error card's button.
  const { unmount } = panelOf(model, session({ distance: 30 }), { onBendOn });
  const card = screen.getByText(/^This line is 1 mm from bend 1's line/).closest('.cad-problem');
  const button = within(card).getByRole('button', { name: 'Bend 1 on instead' });
  expect(button.className).toBe('cad-problem-fix');
  expect(button.title).toBe('Set the punch line on bend 1, to bend it further');
  act(() => fireEvent.click(button));
  expect(onBendOn).toHaveBeenCalledWith('b1');
  unmount();
  // The line at flat 34 (typed, L 34 now reads off bend 1's flange: docs/sketch-studio-skin-gauge.md
  // §4.4; set without brakePatch it lies 34 from the edge): the short-leg refusal, its words and the button.
  const short = panelOf(model, session({ distance: 34 }), { onBendOn });
  const leg = screen.getByText(/^The flange is 4\.29 mm/).closest('.cad-problem');
  act(() => fireEvent.click(within(leg).getByRole('button', { name: 'Bend 1 on instead' })));
  expect(onBendOn).toHaveBeenCalledTimes(2);
  expect(within(region()).getAllByRole('button', { name: 'Bend 1 on instead' })).toHaveLength(1);
  short.unmount();
  // Without onBendOn: no button.
  panelOf(model, session({ distance: 30 }), { onBendOn: null });
  expect(within(region()).queryByRole('button', { name: 'Bend 1 on instead' })).toBe(null);
});

// ---------------------------------------------------------------- the flat blank (§7.4 (e))
const mapOf = (model, s, handlers = {}) => {
  const result = render(
    <FlatPatternMap
      station={brakeStation({ model, session: s, advise: false })}
      session={s}
      onPickEdge={() => {}}
      onDistance={() => {}}
      onPoints={() => {}}
      {...handlers}
    />,
  );
  // The card's view box is [−50.432, −470.832, 706.264, 521.264]: at one pixel per mm a flat point is (x + 50.432, 470.832 − y).
  const svg = result.container.querySelector('svg');
  svg.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 706.264,
    height: 521.264,
    right: 706.264,
    bottom: 521.264,
  });
  return result;
};
const clickAt = (name, [x, y]) =>
  act(() =>
    fireEvent.click(screen.getByRole('button', { name }), { detail: 1, clientX: x + 50.432, clientY: 470.832 - y }),
  );

it('makes each made bend’s line a button in gauge mode, nearest line in reach of the pointer winning', () => {
  // Bend 1 at L 29 (30°), bend 2 the lip at L 11: 11 mm from the right edge.
  const model = sheetModel([line('b1', 29, 30), line('b2', 11)]);
  const onBendOn = vi.fn(),
    onPickEdge = vi.fn();
  const { unmount } = mapOf(model, session({ edge: null }), { onBendOn, onPickEdge });
  expect(screen.getByRole('button', { name: "Bend 1's line: bend it on" })).toBeTruthy();
  // In reach of both (the edge's strip is ± 12.6 mm, a line's band ± 11), nearer the lip's line: the lip,
  // though the click lands on the edge's strip.
  clickAt('Gauge edge 2', [W - 9, 200]);
  expect(onBendOn).toHaveBeenLastCalledWith('b2');
  expect(onPickEdge).not.toHaveBeenCalled();
  // Nearer the edge: the edge, though the lip's band is under the pointer too.
  clickAt("Bend 2's line: bend it on", [W - 2, 200]);
  expect(onPickEdge).toHaveBeenLastCalledWith(1);
  clickAt("Bend 1's line: bend it on", [W - 29.5, 100]);
  expect(onBendOn).toHaveBeenLastCalledWith('b1');
  // A keyboard click: the line clicked.
  act(() => fireEvent.click(screen.getByRole('button', { name: "Bend 2's line: bend it on" })));
  expect(onBendOn).toHaveBeenLastCalledWith('b2');
  unmount();
  // The bend the pending hit already bends on is no button; the others are.
  const on29 = mapOf(model, session({ distance: 29 }), { onBendOn });
  expect(screen.queryByRole('button', { name: "Bend 1's line: bend it on" })).toBe(null);
  expect(screen.getByRole('button', { name: "Bend 2's line: bend it on" })).toBeTruthy();
  on29.unmount();
  // Two points: no bend buttons; nor without onBendOn, nor while disabled.
  const points = mapOf(model, session({ mode: 'points', edge: null, points: [] }), { onBendOn });
  expect(screen.queryByRole('button', { name: /line: bend it on$/ })).toBe(null);
  points.unmount();
  const bare = mapOf(model, session({ edge: null }));
  expect(screen.queryByRole('button', { name: /line: bend it on$/ })).toBe(null);
  bare.unmount();
  mapOf(model, session({ edge: null }), { onBendOn, disabled: true });
  expect(screen.queryByRole('button', { name: /line: bend it on$/ })).toBe(null);
});

// ---------------------------------------------------------------- the workspace
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
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
const openBrake = () => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route('Bend')));
};
const map = () => screen.getByRole('figure', { name: 'Flat blank' });
const L = () => within(region()).getByLabelText('Backgauge L (mm)', { exact: true });
// The L field applies as you type, after the live settle.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 220)));

it('the L field keeps what is typed while focused, the seated L after blur', async () => {
  setup(sheetModel(MADE));
  openBrake();
  act(() => fireEvent.click(within(map()).getByRole('button', { name: 'Gauge edge 2' })));
  const field = L();
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '30' } });
  });
  await settle();
  // The line seated on bend 1 under the focused field: the field still reads what was typed.
  expect(L().value).toBe('30');
  expect(within(region()).getByRole('note', { name: 'Seated on the bend' }).textContent).toMatch(
    /^L 30 is 1 mm from bend 1's line/,
  );
  expect(within(region()).getByLabelText('Bend on to (°)', { exact: true }).value).toBe('90');
  // Typing on goes on from the text typed: 300 is a new line, nothing seated.
  act(() => fireEvent.change(L(), { target: { value: '300' } }));
  await settle();
  expect(L().value).toBe('300');
  expect(within(region()).queryByRole('note', { name: 'Seated on the bend' })).toBe(null);
  expect(within(region()).queryByRole('note', { name: 'Bend on' })).toBe(null);
  act(() => fireEvent.change(L(), { target: { value: '31' } }));
  await settle();
  act(() => fireEvent.blur(L()));
  // After blur: the seated L.
  expect(L().value).toBe('29');
  expect(within(region()).getByRole('note', { name: 'Seated on the bend' }).textContent).toMatch(
    /^L 31 is 2 mm from bend 1's line/,
  );
});

it('the short-leg card’s button and the flat blank’s bend line set the punch line on bend 1', () => {
  setup(sheetModel(MADE));
  openBrake();
  act(() => fireEvent.click(within(map()).getByRole('button', { name: 'Gauge edge 2' })));
  // L 34 from the edge itself, past the seat: only with Gauge off the edge held (docs/sketch-studio-
  // skin-gauge.md §4.6; automatic, L 34 reads off bend 1's flange).
  act(() => fireEvent.change(within(region()).getByLabelText('Gauge off'), { target: { value: 'edge' } }));
  const field = L();
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '34' } });
  });
  act(() => fireEvent.blur(field));
  expect(L().value).toBe('34');
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Bend 1 on instead' })));
  expect(L().value).toBe('29');
  expect(within(region()).getByRole('note', { name: 'Bend on' }).textContent).toBe(
    "This is bend 1's line: it stands at 45°. This hit bends it on.",
  );
  // Away again, then bend 1's line clicked on the flat blank.
  act(() => {
    fireEvent.focus(L());
    fireEvent.change(L(), { target: { value: '100' } });
  });
  act(() => fireEvent.blur(L()));
  expect(within(region()).queryByRole('note', { name: 'Bend on' })).toBe(null);
  act(() => fireEvent.click(within(map()).getByRole('button', { name: "Bend 1's line: bend it on" })));
  expect(L().value).toBe('29');
  expect(within(region()).getByRole('note', { name: 'Bend on' })).toBeTruthy();
});
