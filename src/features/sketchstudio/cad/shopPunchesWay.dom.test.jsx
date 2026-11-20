// @vitest-environment jsdom
// The earlier bends with another punch at the press brake
// (docs/sketch-studio-shop-punches.md §6.2 – §6.3, SP-2): the collision
// card's third button (this hit first, and the bend after it with another
// punch), its armed card, the pedal committing the hit and the changed punch
// in one commit (one Undo) with its status line, and a stored row's punch
// button. The kernel hook and the 3D viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
import { sheetMetalPart } from './ShopPanels.jsx';
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
// The punch stays in the machine (docs/sketch-studio-shop-punches.md §5.5): each test starts from the default.
beforeEach(() => forgetPunch());
afterEach(() => cleanup());

// The screenshot's tray (spec §1): 605.4 × 420.4, t 1.2 SPCC; the right edge is edge 2.
const W = 605.4,
  H = 420.4;
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
const region = () => screen.getByRole('region', { name: 'Press brake' });
const steps = () => within(region()).getByRole('list', { name: 'Sequence' });
const step = (n) => within(steps()).getByRole('listitem', { name: `Step ${n}` });
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, LIVE_DEBOUNCE_MS + 60)));
const button = (name) => within(region()).queryByRole('button', { name });

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

it('the card offers the earlier bend with the A 101; armed, its words; the pedal is one commit (one Undo) with its line', async () => {
  // Lip 15 / web 15: the inner bend made with the straight punch, the straight punch in, the lip pending.
  const harness = setup(sheetModel([line('inner', W - 30, H)]));
  openBrake();
  pick(15);
  expect(button('Make this hit before bend 1, and bend 1 with the A 101 punch')).toBe(null);
  await settle();
  const card = within(region()).getByRole('alert', { name: 'Collision' });
  expect(card.textContent).toContain('Make this hit before bend 1 and make bend 1 with the A 101 punch.');
  expect(card.textContent).not.toMatch(/No order/);
  act(() => fireEvent.click(button('Make this hit before bend 1, and bend 1 with the A 101 punch')));
  expect(within(region()).getByRole('status', { name: 'Bend order' }).querySelector('p').textContent).toBe(
    'This hit goes in before bend 1, and bend 1 is made with the A 101 punch: the view shows the sheet as it is then.',
  );
  // The view: the sheet as it is then (the inner line flat), clear.
  expect(viewport.props.brakeView).toMatchObject({ angles: { inner: 0, 'pending-hit': 0 }, collision: null });
  expect(button('Bend').disabled).toBe(false);
  const commits = harness.setCadModel.mock.calls.length;
  pedal();
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 1);
  const bends = bendsOf(harness);
  expect(bends.map((b) => [b.id === 'inner' ? 'inner' : 'new', b.punch])).toEqual([
    ['new', 'straight-88'],
    ['inner', 'a101'],
  ]);
  harness.rerender();
  expect([...steps().querySelectorAll('.cad-brake-check')].map((c) => c.textContent)).toEqual(['ok', 'ok']);
  expect(within(region()).getByRole('status', { name: 'Punch changed' }).textContent).toBe(
    'Bend 2 is now made with the A 101 punch.',
  );
  expect(within(region()).queryByRole('status', { name: 'Bend order' })).toBe(null);
  // One Undo takes the hit and the punch back.
  harness.undo();
  expect(bendsOf(harness)).toEqual([line('inner', W - 30, H)]);
  expect(document.querySelector('.cad-error')).toBe(null);
});

it('a stored row stopped by its punch offers "Make step 2 with the A 101 punch", committed as a sequence change', async () => {
  const harness = setup(sheetModel([line('lip', W - 15, H), line('inner', W - 30, H)]));
  openBrake();
  expect([...steps().querySelectorAll('.cad-brake-check')].map((c) => c.textContent)).toEqual(['ok', 'refused']);
  await settle();
  const fix = within(step(2)).getByRole('button', { name: 'Make step 2 with the A 101 punch' });
  act(() => fireEvent.click(fix));
  expect(bendsOf(harness).map((b) => [b.id, b.punch])).toEqual([
    ['lip', 'straight-88'],
    ['inner', 'a101'],
  ]);
  harness.rerender();
  expect([...steps().querySelectorAll('.cad-brake-check')].map((c) => c.textContent)).toEqual(['ok', 'ok']);
  expect(document.querySelector('.cad-error')).toBe(null);
});
