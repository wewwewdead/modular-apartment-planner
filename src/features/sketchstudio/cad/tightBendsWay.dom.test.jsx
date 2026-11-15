// @vitest-environment jsdom
// The brake finds the way at the press brake (docs/sketch-studio-tight-bends.md
// §5.2, TB-2): the collision card's two buttons (this hit first; a step
// part-way first), the armed state (its note, the view as the sheet is then,
// Esc, Cancel and a new line disarming it), the pedal committing the try —
// try 2 in one commit, so one Undo — and a stored row's Move button. The
// kernel hook and the 3D viewport are stand-ins.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import { sheetMetalPart } from './ShopPanels.jsx';
import { brakeSessionDefaults, brakeStation, sequenceChecks } from './brakeStation.js';
import { machineOf } from './shopCatalog.js';
import { emptyModel } from './model.js';
import { LIVE_DEBOUNCE_MS } from './liveField.js';
// The whole workspace renders, and the tries run on the advice's settle: allow for the full suite's load.
vi.setConfig({ testTimeout: 20000 });

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
afterEach(() => cleanup());

// The screenshot's tray (spec §1): 605.4 × 420.4, t 1.2 SPCC; the right edge is edge 2.
const W = 605.4,
  H = 420.4;
// The tight Z (§5.3 2): 315 × 200, a line 150 from the left edge up, then 150 from the right edge down.
const ZW = 315,
  ZH = 200;
const RIGHT = 1;
const line = (id, x, h, angle = 90, direction = 'up') => ({
  id,
  a: [x, 0],
  b: [x, h],
  angle,
  direction,
  radius: null,
  punch: 'straight-88',
  die: 'v8-88',
});
const sheetModel = (bends, width = W, height = H) => {
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
        profile: { type: 'rectangle', width, height, origin: [0, 0] },
        primitives: [],
        constrained: false,
      },
    ],
    parts: [part],
    instances: [{ id: 'tray-1', partId: 'tray', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }],
  };
};
const session = (patch = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'tray-1',
  mode: 'gauge',
  edge: RIGHT,
  ...patch,
});
const region = () => screen.getByRole('region', { name: 'Press brake' });
const steps = () => within(region()).getByRole('list', { name: 'Sequence' });
const step = (n) => within(steps()).getByRole('listitem', { name: `Step ${n}` });
const rowTexts = () => [...steps().querySelectorAll('li strong')].map((s) => s.textContent);
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, LIVE_DEBOUNCE_MS + 60)));
const button = (name) => within(region()).queryByRole('button', { name });

// ---------------------------------------------------------------- the panel alone
const panelOf = (model, s, handlers = {}) => {
  const station = brakeStation({ model, session: s });
  const checks = sequenceChecks({ fold: station.fold, machine: machineOf('brake-50-2000') });
  render(
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
      {...handlers}
    />,
  );
  return station;
};

it('the card offers "Make this hit before bend 1"; one click arms it', () => {
  const onSession = vi.fn();
  panelOf(sheetModel([line('inner', W - 29, H)]), session({ distance: 11 }), { onSession });
  const card = within(region()).getByRole('alert', { name: 'Collision' });
  expect(card.textContent).toMatch(/^Bend 2: the part hits the ram as the ram comes down\./);
  expect(button('Bend 1 to 60° first, finish it after this hit')).toBe(null);
  act(() => fireEvent.click(button('Make this hit before bend 1')));
  expect(onSession).toHaveBeenCalledWith({ armed: { kind: 'before', key: 'inner' }, scrub: null });
});

it('the card offers "Bend 1 to 60° first, finish it after this hit" (no "Make this hit before"); one click arms it', () => {
  const onSession = vi.fn();
  panelOf(sheetModel([line('b1', 150, ZH)], ZW, ZH), session({ distance: 150, flip: true }), { onSession });
  expect(within(region()).queryByRole('button', { name: /^Make this hit before/ })).toBe(null);
  act(() => fireEvent.click(button('Bend 1 to 60° first, finish it after this hit')));
  expect(onSession).toHaveBeenCalledWith({ armed: { kind: 'partway', key: 'b1', angle: 60 }, scrub: null });
});

it('armed, the card reads where the hit goes in, the pedal is on, and Cancel disarms it', () => {
  const onSession = vi.fn();
  panelOf(sheetModel([line('inner', W - 29, H)]), session({ distance: 11, armed: { kind: 'before', key: 'inner' } }), {
    onSession,
  });
  const note = within(region()).getByRole('status', { name: 'Bend order' });
  expect(note.querySelector('p').textContent).toBe(
    'This hit goes in before bend 1: the view shows the sheet as it is then.',
  );
  expect(within(region()).queryByRole('alert', { name: 'Collision' })).toBe(null);
  expect(button('Bend').disabled).toBe(false);
  act(() => fireEvent.click(within(note).getByRole('button', { name: 'Cancel' })));
  expect(onSession).toHaveBeenCalledWith({ armed: null });
});

it('nothing passes (lip 15 / web 15): no button, try 3’s words', () => {
  panelOf(sheetModel([line('inner', W - 30, H)]), session({ distance: 15 }));
  const card = within(region()).getByRole('alert', { name: 'Collision' });
  expect(card.textContent).toMatch(/No order and no part-way bend clears it with this punch/);
  expect(within(region()).queryByRole('button', { name: /^Make this hit|first, finish it/ })).toBe(null);
});

// ---------------------------------------------------------------- the workspace
// A history of commits, so Undo is the studio's (one commit, one step back).
function setup(model) {
  const history = [model];
  let index = 0;
  const setCadModel = vi.fn((next) => {
    history.splice(index + 1);
    history.push(next);
    index = history.length - 1;
  });
  const workspace = () => (
    <MemoryRouter>
      <CadWorkspace
        document={{ id: 'doc', name: 'Test', entities: [], model: history[index] }}
        setCadModel={setCadModel}
        undo={() => {
          index = Math.max(0, index - 1);
        }}
        redo={() => {
          index = Math.min(history.length - 1, index + 1);
        }}
        canUndo
        canRedo
        documentPersistence={{}}
      />
    </MemoryRouter>
  );
  const view = render(workspace());
  const rerender = () => view.rerender(workspace());
  act(() => viewport.props.onSelect('tray-1'));
  return {
    setCadModel,
    rerender,
    model: () => history[index],
    undo: () => {
      index = Math.max(0, index - 1);
      rerender();
    },
  };
}
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
const openBrake = () => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route('Bend')));
};
const map = () => screen.getByRole('figure', { name: 'Flat blank' });
const fill = (label, value) => {
  const field = within(region()).getByLabelText(label, { exact: true });
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: String(value) } });
  });
  act(() => fireEvent.blur(field));
};
const key = (k) => act(() => fireEvent.keyDown(document.body, { key: k }));
const bendsOf = (harness) => harness.model().parts[0].features[0].bends;
const pick = (L) => {
  act(() => fireEvent.click(within(map()).getByRole('button', { name: 'Gauge edge 2' })));
  fill('Backgauge L (mm)', L);
};
const pedal = () => {
  act(() => fireEvent.click(button('Bend')));
  const view = viewport.props.brakeView;
  act(() => viewport.props.onBrakeStrokeEnd(view.stroke.token));
  return view;
};

it('try 1 at the station: armed, the view flat at the inner line; Esc and a new line disarm; the pedal commits the lip first', async () => {
  const harness = setup(sheetModel([line('inner', W - 29, H)]));
  openBrake();
  pick(11);
  await settle();
  act(() => fireEvent.click(button('Make this hit before bend 1')));
  expect(within(region()).getByRole('status', { name: 'Bend order' })).toBeTruthy();
  // The view: the sheet as it is then (the inner line still flat).
  expect(viewport.props.brakeView).toMatchObject({ bendIds: ['pending-hit'], angles: { inner: 0, 'pending-hit': 0 } });
  expect(viewport.props.brakeView.collision).toBe(null);
  // Esc puts the try down and keeps the line; the refusal is back.
  key('Escape');
  expect(within(region()).queryByRole('status', { name: 'Bend order' })).toBe(null);
  expect(within(region()).getByLabelText('Backgauge L (mm)', { exact: true }).value).toBe('11');
  expect(button('Bend').disabled).toBe(true);
  // Armed again, then a new line: disarmed.
  await settle();
  act(() => fireEvent.click(button('Make this hit before bend 1')));
  fill('Backgauge L (mm)', 12);
  expect(within(region()).queryByRole('status', { name: 'Bend order' })).toBe(null);
  fill('Backgauge L (mm)', 11);
  await settle();
  act(() => fireEvent.click(button('Make this hit before bend 1')));
  const commits = harness.setCadModel.mock.calls.length;
  // The stroke runs with the inner line still flat.
  const stroking = pedal();
  expect(stroking.angles).toEqual({ inner: 0 });
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 1);
  const bends = bendsOf(harness);
  expect(bends.map((b) => b.id).slice(1)).toEqual(['inner']);
  expect(bends[0]).toMatchObject({ angle: 90, direction: 'up' });
  harness.rerender();
  expect(rowTexts()).toEqual(['1 · UP 90° R1.28', '2 · UP 90° R1.28']);
  expect([...steps().querySelectorAll('.cad-brake-check')].map((c) => c.textContent)).toEqual(['ok', 'ok']);
  // The try is spent.
  expect(within(region()).queryByRole('status', { name: 'Bend order' })).toBe(null);
});

it('try 2 at the station: bend 1 shown at 60°; the pedal is one commit (one Undo) of three changes', async () => {
  const harness = setup(sheetModel([line('b1', 150, ZH)], ZW, ZH));
  openBrake();
  pick(150);
  act(() => fireEvent.click(within(region()).getByLabelText('Flip sheet')));
  await settle();
  act(() => fireEvent.click(button('Bend 1 to 60° first, finish it after this hit')));
  expect(within(region()).getByRole('status', { name: 'Bend order' }).querySelector('p').textContent).toBe(
    'Bend 1 goes to 60° first and is finished after this hit: the view shows bend 1 at 60°.',
  );
  expect(viewport.props.brakeView.angles).toMatchObject({ b1: 60 });
  const commits = harness.setCadModel.mock.calls.length;
  pedal();
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 1);
  const bends = bendsOf(harness);
  expect(bends.map((b) => [b.again ?? null, b.angle, b.direction ?? null])).toEqual([
    [null, 60, 'up'],
    [null, 90, 'down'],
    ['b1', 90, null],
  ]);
  harness.rerender();
  expect(rowTexts()).toEqual(['1 · UP 60° R1.28', '2 · DOWN 90° R1.28', '3 · bend 1 on: 60° → 90°']);
  expect([...steps().querySelectorAll('.cad-brake-check')].map((c) => c.textContent)).toEqual(['ok', 'ok', 'ok']);
  expect(within(region()).getByRole('status', { name: 'Part-way bend' }).textContent).toBe(
    'Bend 1 now stands at 60° and is finished in step 3.',
  );
  // One Undo takes the three changes back.
  harness.undo();
  expect(bendsOf(harness)).toEqual([line('b1', 150, ZH)]);
  expect(rowTexts()).toEqual(['1 · UP 90° R1.28']);
});

it('a stored sequence that collides: the row offers "Move step 2 before step 1", committed as a move', async () => {
  const harness = setup(sheetModel([line('inner', W - 29, H), line('lip', W - 11, H)]));
  openBrake();
  expect([...steps().querySelectorAll('.cad-brake-check')].map((c) => c.textContent)).toEqual(['ok', 'refused']);
  expect(within(step(2)).queryByRole('button', { name: 'Move step 2 before step 1' })).toBe(null);
  await settle();
  const move = within(step(2)).getByRole('button', { name: 'Move step 2 before step 1' });
  expect(within(step(1)).queryByRole('button', { name: /^Move step/ })).toBe(null);
  act(() => fireEvent.click(move));
  expect(bendsOf(harness).map((b) => b.id)).toEqual(['lip', 'inner']);
  harness.rerender();
  expect([...steps().querySelectorAll('.cad-brake-check')].map((c) => c.textContent)).toEqual(['ok', 'ok']);
  expect(document.querySelector('.cad-error')).toBe(null);
});
