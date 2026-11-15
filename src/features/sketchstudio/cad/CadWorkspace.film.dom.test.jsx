// @vitest-environment jsdom
// Replay the build in the workspace (docs/sketch-studio-shop-floor.md §8,
// SF-5): the Replay button at the end of the route plays the kiosk's route
// as a film — play, pause, previous / next, a step from the list, the speed,
// Esc — with the route and the panes read-only, the view handed only what
// exists at each scene (the laser bed's cut, the press brake's view-only
// hit, the records made so far, the mask of what is not made yet), no
// commit, and everything
// back as it was at the end. And the press brake on a finished part: a
// neutral "finished here" card with Watch the bends (the SF-4 audit). The
// kernel hook and the 3D viewport are stand-ins; the film's clock is driven
// through performance.now and the queued animation frames.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { emptyModel } from './model.js';
vi.setConfig({ testTimeout: 20000 });

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
let frames = [],
  now = 1000;
beforeEach(() => {
  frames = [];
  now = 1000;
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
// The film's time passes: `ms` later, every queued frame runs once.
const advance = (ms) =>
  act(() => {
    now += ms;
    const queued = frames.splice(0);
    for (const frame of queued) frame(now);
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
const nav = () => screen.getByRole('navigation', { name: 'Shop route' });
const route = (name) => within(nav()).getByRole('button', { name });
const shopTab = () => act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
const shopMore = (name) => {
  shopTab();
  act(() => fireEvent.click(route('More')));
  act(() =>
    fireEvent.click(within(screen.getByRole('group', { name: 'More shop commands' })).getByRole('button', { name })),
  );
};
const film = () => screen.getByRole('region', { name: 'Replay' });
const showing = () => within(film()).getByRole('status', { name: 'Now showing' });
const STATIONS = ['Draw', 'Cut', 'Bend', 'Paint', 'Print'];
function kiosk() {
  const harness = setup();
  shopMore('Example: kiosk');
  harness.rerender();
  shopTab();
  return harness;
}

it('Replay plays the kiosk’s route: the laser bed first, the route and panes read-only, the view given only what exists, nothing committed', () => {
  const harness = kiosk();
  const model = harness.model();
  const commits = harness.setCadModel.mock.calls.length;
  const selection = viewport.props.selectedIds;
  expect(route('Replay').disabled).toBe(false);
  act(() => fireEvent.click(route('Replay')));
  expect(film()).toBeTruthy();
  expect(within(film()).getByRole('heading', { name: '▶ · Replay' })).toBeTruthy();
  expect(showing().textContent).toMatch(/^2 · CutCut two face frame blanks: front and rear/);
  // The route waits; only its End replay is live. The panes are read-only.
  for (const name of STATIONS) expect(route(name).disabled).toBe(true);
  expect(route('End replay').disabled).toBe(false);
  expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'New' }).disabled).toBe(true);
  for (const row of within(screen.getByRole('region', { name: 'Job board' })).getAllByRole('button', {
    name: /face frame|tray|channel|cover/,
  }))
    expect(row.disabled).toBe(true);
  // The view: the laser bed cutting, nothing yet in the 3D view, no record, no selection look, no click.
  const bed = screen.getByRole('figure', { name: 'Laser bed' });
  expect(bed.getAttribute('data-state')).toBe('cutting');
  expect(viewport.props.brakeView).toBe(null);
  // RB-3 (round-bend spec §13.4): 33 + the four corner pieces.
  expect(viewport.props.filmHidden).toHaveLength(37);
  expect([viewport.props.model.finishes, viewport.props.model.prints]).toEqual([[], []]);
  expect(viewport.props.model.parts).toBe(model.parts);
  expect(viewport.props.shopPick).toMatchObject({ station: 'film', pick: null });
  expect(viewport.props.selectedIds).toEqual([]);
  expect(viewport.props.film).toMatchObject({ brake: true });
  expect(viewport.props.film.ids).toHaveLength(37);
  expect(screen.getByText(/^Replay — playing/)).toBeTruthy();
  // The first scene plays out (3.4 s at 1×) and the next starts by itself.
  advance(1000);
  expect(showing().textContent).toMatch(/Cut two face frame blanks/);
  advance(2500);
  advance(16);
  expect(showing().textContent).toMatch(/Cut the shelf tray blank/);
  // Esc ends it: back as it was, and nothing was committed.
  act(() => fireEvent.keyDown(window, { key: 'Escape' }));
  expect(screen.queryByRole('region', { name: 'Replay' })).toBe(null);
  expect(screen.queryByRole('figure', { name: 'Laser bed' })).toBe(null);
  expect(viewport.props.model).toBe(model);
  expect(viewport.props.selectedIds).toEqual(selection);
  expect(viewport.props.film).toBe(null);
  expect(viewport.props.filmHidden).toBe(null);
  expect(route('Replay').disabled).toBe(false);
  for (const name of STATIONS) expect(route(name).disabled).toBe(false);
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
  expect(harness.model()).toBe(model);
});

it('pause, previous / next, a step from the list, the speed, and the end of the film', () => {
  const harness = kiosk();
  const commits = harness.setCadModel.mock.calls.length;
  act(() => fireEvent.click(route('Replay')));
  const panel = film();
  // Pause: the clock stands still, the scene stays.
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Pause' })));
  expect(within(panel).getByRole('button', { name: 'Play' })).toBeTruthy();
  expect(screen.getByText(/^Replay — paused/)).toBeTruthy();
  advance(10000);
  advance(16);
  expect(showing().textContent).toMatch(/Cut two face frame blanks/);
  // Next and Previous step.
  const controls = within(panel).getByRole('group', { name: 'Replay controls' });
  expect(within(controls).getByRole('button', { name: /Previous step/ }).disabled).toBe(true);
  act(() => fireEvent.click(within(controls).getByRole('button', { name: /Next step/ })));
  expect(showing().textContent).toMatch(/Cut the shelf tray blank/);
  act(() => fireEvent.click(within(controls).getByRole('button', { name: /Previous step/ })));
  expect(showing().textContent).toMatch(/Cut two face frame blanks/);
  // A step from the list: the first hit on the press brake, view only.
  const steps = within(panel).getByRole('list', { name: 'Replay steps' });
  // 25 scenes since the shop trim (36 with the weld and assembly scenes).
  expect(within(steps).getAllByRole('button')).toHaveLength(25);
  act(() =>
    fireEvent.click(
      within(steps).getByRole('button', { name: 'Bend one long-side flange up 90°, two tabs in one stroke' }),
    ),
  );
  expect(
    within(steps)
      .getByRole('button', { name: 'Bend one long-side flange up 90°, two tabs in one stroke' })
      .getAttribute('aria-current'),
  ).toBe('step');
  expect(screen.queryByRole('figure', { name: 'Laser bed' })).toBe(null);
  expect(viewport.props.brakeView).toMatchObject({ angles: {}, stroke: { commit: false } });
  expect(viewport.props.brakeView.bendIds).toHaveLength(2);
  expect(viewport.props.brakeView.stroke.clock()).toBe(0);
  // The speed: the film's clock runs twice as fast.
  const speed = within(panel).getByRole('group', { name: 'Replay speed' });
  act(() => fireEvent.click(within(speed).getByRole('button', { name: '2×' })));
  expect(within(speed).getByRole('button', { name: '2×' }).getAttribute('aria-pressed')).toBe('true');
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Play' })));
  advance(500);
  expect(viewport.props.brakeView.stroke.clock()).toBe(1000);
  // The last scene's end waits on the finished product.
  act(() => fireEvent.click(within(steps).getByRole('button', { name: 'Finished: Kiosk' })));
  expect(within(panel).getByRole('button', { name: 'Pause' })).toBeTruthy();
  advance(2000);
  advance(16);
  expect(within(panel).getByRole('button', { name: 'Play again' })).toBeTruthy();
  expect(screen.getByText(/^Replay — finished/)).toBeTruthy();
  expect(viewport.props.filmHidden).toEqual([]);
  expect(viewport.props.model).toBe(harness.model());
  // End replay: back where it was.
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'End replay' })));
  expect(screen.queryByRole('region', { name: 'Replay' })).toBe(null);
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
});

it('scenes of the model view: the colour, the prints, and what is not made here coming on at the finish', () => {
  const harness = kiosk();
  act(() => fireEvent.click(route('Replay')));
  const steps = within(film()).getByRole('list', { name: 'Replay steps' });
  const names = (ids) => ids.map((id) => harness.model().instances.find((i) => i.id === id).name || '');
  // The black powder: only the frame's nine parts are in the booth, outlined.
  act(() => fireEvent.click(within(steps).getByRole('button', { name: /^Powder-coat the kiosk frame/ })));
  expect(viewport.props.model.finishes).toEqual([]);
  expect(viewport.props.model).not.toHaveProperty('welds');
  // 37 less the frame's 9 parts.
  expect(viewport.props.filmHidden).toHaveLength(28);
  expect(viewport.props.shopPick.targets).toHaveLength(9);
  advance(2000);
  advance(16);
  expect(viewport.props.model.finishes).toHaveLength(9);
  // A print: only its cover in the station.
  act(() => fireEvent.click(within(steps).getByRole('button', { name: 'Silk-screen “KIOSK” on the front cover' })));
  expect(viewport.props.filmHidden).toHaveLength(36);
  expect(viewport.props.model.finishes).toHaveLength(11);
  // The finished product: everything in the view, the displays and the fasteners with it.
  act(() => fireEvent.click(within(steps).getByRole('button', { name: 'Finished: Kiosk' })));
  expect(viewport.props.filmHidden).toEqual([]);
  expect(viewport.props.model.prints).toHaveLength(2);
  expect(showing().textContent).toMatch(/11 parts made in the shop · 26 items bought in or fastened/);
  // Before it, the last hit: every part made here, none of the bought-in items or fasteners.
  act(() => fireEvent.click(within(steps).getByRole('button', { name: 'Bend the blank up 90° across its middle' })));
  const hidden = names(viewport.props.filmHidden);
  expect(hidden).toHaveLength(26);
  expect(hidden.filter((n) => n.endsWith('display'))).toEqual(['Front display', 'Rear display']);
});

it('the press brake on a finished part says so, with this part’s own counts, the hits and Watch the bends', () => {
  const harness = kiosk();
  const model = harness.model();
  act(() => fireEvent.click(route('Bend')));
  act(() =>
    fireEvent.click(
      within(screen.getByRole('list', { name: 'Choose a part' })).getByRole('button', { name: /^Front face frame/ }),
    ),
  );
  const brake = screen.getByRole('region', { name: 'Press brake' });
  // Not a refusal: no alert, a neutral card.
  expect(within(brake).queryByRole('alert')).toBe(null);
  expect(within(brake).getByRole('status', { name: 'Finished here' }).textContent).toBe(
    'Bending is done on this part: 4 hits made. It has gone on down the route: powder-coated RAL 9005 Jet black.',
  );
  expect(within(within(brake).getByRole('list', { name: 'Hits made' })).getAllByRole('listitem')).toHaveLength(4);
  // The remedy stays, a second choice, and says plainly whose records it takes off.
  expect(within(brake).getByRole('note', { name: 'Bend it again' }).textContent).toBe(
    "Only bare metal goes back on the press brake, so bending it again means taking off what came after the brake. This part is one definition made twice (it is also the rear face frame), so that is every copy's: 2 paint finishes.",
  );
  expect(within(brake).getByRole('button', { name: 'Remove 2 paint finishes and bend' })).toBeTruthy();
  // Watch the bends: the film of this part's four hits, then back to the card.
  act(() => fireEvent.click(within(brake).getByRole('button', { name: 'Watch the bends' })));
  const panel = film();
  expect(within(panel).getByRole('heading', { name: '▶ · Watch the bends' })).toBeTruthy();
  expect(within(within(panel).getByRole('list', { name: 'Replay steps' })).getAllByRole('button')).toHaveLength(4);
  expect(viewport.props.brakeView).toMatchObject({ stroke: { commit: false } });
  act(() => fireEvent.click(within(panel).getByRole('button', { name: 'Back to the press brake' })));
  expect(
    within(screen.getByRole('region', { name: 'Press brake' })).getByRole('status', { name: 'Finished here' }),
  ).toBeTruthy();
  expect(harness.model()).toBe(model);
});

it('an empty model: Replay is off and says what is missing', () => {
  setup();
  shopTab();
  const replay = route('Replay');
  expect(replay.disabled).toBe(true);
  expect(replay.getAttribute('title')).toBe('Nothing to replay yet: draw and cut a part first.');
});
