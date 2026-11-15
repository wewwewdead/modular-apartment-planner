// @vitest-environment jsdom
// Shop → Press brake (docs/sketch-studio-fab-shop.md §9 SM-2): the station
// opens on the selected sheet-metal part, the flat map picks the gauge edge,
// the NC panel reads out the hit and refuses what the machine cannot do, the
// pedal starts a stroke the viewport runs and reports, its end commits the
// bend; Esc clears then leaves; a painted or printed part is refused with a
// one-click remedy; every "another tool is active" site sees the station.
// The kernel hook and the 3D viewport are stand-ins.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { emptyModel } from './model.js';
import { bendNumbers } from './sheetMetal.js';
import { sheetMetalPart } from './ShopPanels.jsx';
import { LIVE_DEBOUNCE_MS } from './liveField.js';
// The whole workspace renders in each test: under the full suite’s parallel load
// its long tests outrun the default 5 s (SF-1 audit), so the file allows 15 s.
vi.setConfig({ testTimeout: 15000 });

const viewport = vi.hoisted(() => ({ props: null }));
// The kernel's state as the stand-in reports it (a test may make it rebuild).
const kernel = vi.hoisted(() => ({ status: 'ready', ready: true }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: kernel.status,
    ready: kernel.ready,
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
afterEach(() => {
  cleanup();
  Object.assign(kernel, { status: 'ready', ready: true });
});

const sheetModel = ({ width = 135, height = 60, bends = [], extra = {} } = {}) => {
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
    ...extra,
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
  const rerender = () => view.rerender(workspace());
  act(() => viewport.props.onSelect('tray-1'));
  return { setCadModel, rerender, model: () => current };
}
const panel = () => screen.getByRole('region', { name: 'Press brake' });
const map = () => screen.getByRole('figure', { name: 'Flat blank' });
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
// The route's Bend station on the selected part (docs/sketch-studio-shop-floor.md §4.1).
const openBrake = () => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route('Bend')));
};
// The left pane's tree (on the Shop tab it opens on the job board, §4.2).
const tree = () => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Tree' })));
  return document.querySelector('.cad-tree-body');
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
const key = (k) => act(() => fireEvent.keyDown(document.body, { key: k }));

it('gauges, reads out, refuses, strokes and commits a hit, then stays open for the next', () => {
  const harness = setup(sheetModel({ width: 100 }));
  openBrake();
  // The station owns the viewport: every other tool site sees it.
  expect(viewport.props.brakeView).toMatchObject({ instanceId: 'tray-1', machine: 'brake-50-2000', bendId: null });
  expect(viewport.props.moveEnabled).toBe(false);
  expect(viewport.props.holeMode).toBe(null);
  expect(viewport.props.planes.visible).toBe(false);
  // The route shows Bend open; the other stations stay on (shop floor §4.1); the tree waits.
  expect(route('Bend').getAttribute('aria-current')).toBe('step');
  expect(route('Paint').disabled).toBe(false);
  expect(tree().disabled).toBe(true);
  expect(document.querySelector('.cad-status').textContent).toContain(
    'Press brake — 50 t × 2 m press brake · Model current',
  );
  expect(within(panel()).getByRole('button', { name: 'Bend' }).disabled).toBe(true);
  // The pedal with nothing picked says what to do.
  key('Enter');
  expect(within(panel()).getByRole('alert').textContent).toBe(
    // Hands on the sheet HO-2 (§6.1): the edge may be clicked on the sheet too.
    'Pick the gauge edge on the sheet or on the flat blank first, or two points for the punch line.',
  );

  // The left edge (edge 4) on the backgauge, L 20.
  act(() => fireEvent.click(within(map()).getByRole('button', { name: 'Gauge edge 4' })));
  fill('Backgauge L (mm)', 20);
  const numbers = bendNumbers({ thickness: 1.5, stock: 'spcc', angle: 90 });
  expect(readout('Gauge edge')).toBe('Edge 4 · 60 mm');
  expect(readout('Inside radius')).toBe('R1.6 mm');
  expect(readout('Bend deduction')).toBe(`${Number(numbers.deduction.toFixed(2))} mm`);
  expect(readout('Backgauge L')).toBe('20 mm');
  expect(within(panel()).getByRole('meter', { name: 'Tonnage against capacity' }).getAttribute('aria-valuenow')).toBe(
    String(Math.round(((1.42 * 330 * 2.25 * 60) / 10000) * 100) / 100),
  );
  expect(within(panel()).getByRole('status', { name: 'Collision check' }).textContent).toMatch(
    /^Clear through the stroke/,
  );
  // The viewport poses the pending hit flat on the die, the fingers at L.
  expect(viewport.props.brakeView).toMatchObject({ bendId: 'pending-hit', gaugeDistance: 20, die: 'v10-88' });
  expect(viewport.props.brakeView.angles).toEqual({ 'pending-hit': 0 });

  // Beyond the die: refused with the remedy, the pedal too.
  fill('Bend angle (°)', 120);
  const bend = within(panel()).getByRole('button', { name: 'Bend' });
  expect(bend.disabled).toBe(true);
  expect(within(panel()).getAllByRole('alert')[0].textContent).toMatch(/^The V10 88° die bends to at most 92°/);
  fill('Bend angle (°)', 90);

  // The pedal (Space): a stroke the viewport runs; nothing committed yet.
  const commits = harness.setCadModel.mock.calls.length;
  key(' ');
  expect(document.querySelector('.cad-status').textContent).toContain('Press brake — bending…');
  const stroke = viewport.props.brakeView.stroke;
  expect(stroke).toMatchObject({ target: 90, commit: true });
  expect(stroke.timeline.total).toBeGreaterThan(1000);
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
  // A second press mid-stroke changes nothing; Esc does not cut it short.
  key('Enter');
  key('Escape');
  expect(viewport.props.brakeView.stroke.token).toBe(stroke.token);
  // A stale token is ignored; the stroke's own end commits one bend.
  act(() => viewport.props.onBrakeStrokeEnd('another'));
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
  act(() => viewport.props.onBrakeStrokeEnd(stroke.token));
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 1);
  harness.rerender();
  const [made] = harness.model().parts[0].features[0].bends;
  expect(made).toMatchObject({
    id: stroke.bendId,
    angle: 90,
    direction: 'up',
    radius: null,
    punch: 'straight-88',
    die: 'v10-88',
  });
  expect(made.a[0]).toBeCloseTo(20, 9);
  expect(made.b[0]).toBeCloseTo(20, 9);
  // No backgauge reading is stored: L is derived.
  expect(Object.keys(made).sort()).toEqual(['a', 'angle', 'b', 'die', 'direction', 'id', 'punch', 'radius']);
  // Still open, the part resting where the stroke left it.
  expect(viewport.props.brakeView).toMatchObject({ bendId: made.id, gaugePoint: [0, 30] });
  expect(viewport.props.brakeView.stroke).toBeUndefined();
  expect(within(panel()).getByRole('list', { name: 'Sequence' }).textContent).toContain('1 · UP 90° R1.6');

  // A flange shorter than the die minimum: refused, naming the die that fits.
  act(() => fireEvent.click(within(map()).getByRole('button', { name: 'Gauge edge 2' })));
  fill('Backgauge L (mm)', 6);
  expect(within(panel()).getAllByRole('alert')[0].textContent).toMatch(
    /needs 8\.27 mm .* Use the V6 88° die or smaller/,
  );
  // Esc clears the pick, then leaves.
  key('Escape');
  expect(readout('Gauge edge')).toBe('Click a straight outline edge on the flat blank');
  key('Escape');
  expect(viewport.props.brakeView).toBe(null);
  expect(screen.queryByRole('region', { name: 'Press brake' })).toBe(null);
  expect(route('Bend').getAttribute('aria-current')).toBe(null);
  expect(route('Bend').disabled).toBe(false);
  // A long workspace test: under the full suite’s load it outruns the default 5 s.
}, 15000);

it('shows a collision red at its angle and clears it with the gooseneck punch', () => {
  // A U channel: the 45 flange made first; gauging the short side puts the
  // 50 web and the tall flange in front, where the flange swings back into the
  // straight punch's blade. (Before SF-3 a 70 web hit the ram, which sat on
  // the punch; on its 100 mm holders that channel now clears, shop floor §6.2.)
  const harness = setup(
    sheetModel({
      width: 115,
      bends: [{ id: 'b1', a: [45, -1], b: [45, 61], angle: 90, direction: 'up', radius: null, punch: 'straight-88' }],
    }),
  );
  openBrake();
  act(() => fireEvent.click(within(map()).getByRole('button', { name: 'Gauge edge 2' })));
  fill('Backgauge L (mm)', 20);
  const alert = within(panel()).getByRole('alert', { name: 'Collision' });
  expect(alert.textContent).toMatch(
    /^This hit: the part hits the punch at [\d.]+°|^Bend 2: the part hits the punch at [\d.]+°/,
  );
  expect(viewport.props.brakeView.collision).toMatchObject({ tool: 'punch' });
  expect(viewport.props.brakeView.angles['pending-hit']).toBe(viewport.props.brakeView.collision.angle);
  expect(within(panel()).getByRole('button', { name: 'Bend' }).disabled).toBe(true);
  // The pedal before the advice has settled: refused with the advice, worked out then (BT-2 follow-up).
  key('Enter');
  const said = within(panel())
    .getAllByRole('alert')
    .filter((a) => !a.getAttribute('aria-label'))
    .map((a) => a.textContent);
  expect(said.at(-1)).toMatch(
    /^Bend 2: the part hits the punch at [\d.]+°\. Bend this one earlier \(before the flange in the way\), or use the gooseneck punch\. Turning the sheet around was tried: it does not clear\.$/,
  );
  // The card shows that advice too: it is the very session's.
  expect(within(panel()).getByRole('alert', { name: 'Collision' }).textContent).toBe(said.at(-1));
  act(() => fireEvent.change(within(panel()).getByLabelText('Punch'), { target: { value: 'gooseneck-88' } }));
  expect(within(panel()).queryByRole('alert', { name: 'Collision' })).toBe(null);
  expect(viewport.props.brakeView.collision).toBe(null);
  expect(within(panel()).getByRole('button', { name: 'Bend' }).disabled).toBe(false);
  expect(harness.setCadModel).not.toHaveBeenCalled();
});

it('chooses the blades from the picker and clears a collision with its punch fix (brake blades BT-1)', async () => {
  // The same U channel: the card offers the gooseneck, one click makes the hit pass.
  setup(
    sheetModel({
      width: 115,
      bends: [{ id: 'b1', a: [45, -1], b: [45, 61], angle: 90, direction: 'up', radius: null, punch: 'straight-88' }],
    }),
  );
  openBrake();
  act(() => fireEvent.click(within(map()).getByRole('button', { name: 'Gauge edge 2' })));
  fill('Backgauge L (mm)', 20);
  expect(viewport.props.brakeView).toMatchObject({ punch: 'straight-88', reverse: false });
  // The fact at once; the remedies tried arrive once the pick has been still (BT-2 follow-up).
  const card = () => within(panel()).getByRole('alert', { name: 'Collision' });
  expect(card().textContent).toMatch(/^Bend 2: the part hits the punch at [\d.]+°\.$/);
  expect(within(panel()).queryByRole('button', { name: 'Use the gooseneck punch' })).toBeNull();
  await act(() => new Promise((resolve) => setTimeout(resolve, LIVE_DEBOUNCE_MS + 30)));
  expect(card().textContent).toMatch(
    /^Bend 2: the part hits the punch at [\d.]+°\. Bend this one earlier \(before the flange in the way\), or use the gooseneck punch\. Turning the sheet around was tried: it does not clear\.$/,
  );
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Use the gooseneck punch' })));
  expect(within(panel()).queryByRole('alert', { name: 'Collision' })).toBe(null);
  expect(within(panel()).getByLabelText('Punch').value).toBe('gooseneck-88');
  expect(viewport.props.brakeView).toMatchObject({ punch: 'gooseneck-88', reverse: false, collision: null });
  expect(within(panel()).getByRole('button', { name: 'Bend' }).disabled).toBe(false);
  // The picker: the deep gooseneck, then the V8 die; the selects follow, the viewport draws them.
  const blades = within(panel()).getByRole('group', { name: 'Blades' });
  act(() => fireEvent.click(within(blades).getByRole('button', { name: /^Top: punch/ })));
  const punches = within(panel()).getByRole('region', { name: 'Punches' });
  expect(within(punches).getByRole('button', { name: 'Gooseneck 88°' }).getAttribute('aria-pressed')).toBe('true');
  act(() => fireEvent.click(within(punches).getByRole('button', { name: 'Gooseneck 88° deep' })));
  expect(within(panel()).getByLabelText('Punch').value).toBe('gooseneck-88-deep');
  act(() => fireEvent.click(within(blades).getByRole('button', { name: /^Bottom: die/ })));
  act(() =>
    fireEvent.click(
      within(within(panel()).getByRole('region', { name: 'Dies' })).getByRole('button', { name: 'V8 88°' }),
    ),
  );
  expect(within(panel()).getByLabelText('Die').value).toBe('v8-88');
  expect(viewport.props.brakeView).toMatchObject({ punch: 'gooseneck-88-deep', die: 'v8-88' });
  // Reverse punch: the throat to the backgauge, drawn so; the standing flange then meets the neck.
  act(() => fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Reverse punch' })));
  expect(viewport.props.brakeView).toMatchObject({ reverse: true, collision: { tool: 'punch' } });
  // Its fixes arrive with the advice, once the pick has been still.
  await act(() => new Promise((resolve) => setTimeout(resolve, LIVE_DEBOUNCE_MS + 30)));
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Turn the punch round' })));
  expect(viewport.props.brakeView).toMatchObject({ reverse: false, collision: null });
});

it('refuses a painted or printed part, offering to remove them in one click', () => {
  const finished = sheetModel({
    extra: {
      instances: [
        { id: 'tray-1', partId: 'tray', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true },
        { id: 'tray-2', partId: 'tray', name: '', position: [200, 0, 0], rotation: [0, 0, 0], visible: true },
      ],
      finishes: [
        { id: 'f1', instanceId: 'tray-2', kind: 'powder', name: 'RAL 7035', colour: '#c5c7c4', gloss: 'matte' },
      ],
      prints: [
        {
          id: 'p1',
          instanceId: 'tray-1',
          origin: [50, 30, 1.5],
          x: [1, 0, 0],
          normal: [0, 0, 1],
          width: 30,
          height: 10,
          method: 'silk',
          kind: 'text',
          text: 'ACME',
        },
      ],
    },
  });
  const harness = setup(finished);
  openBrake();
  expect(viewport.props.brakeView).toBe(null);
  // Only paint and prints keep a part off the brake (docs/sketch-studio-shop-trim.md §2).
  expect(within(panel()).getByRole('alert').textContent).toBe(
    'This part already has a paint finish and 1 print. Shop order is cut → bend → paint → print: it cannot go back on the press brake until they are removed.',
  );
  act(() =>
    fireEvent.click(within(panel()).getByRole('button', { name: 'Remove a paint finish and 1 print and bend' })),
  );
  expect(harness.model()).toMatchObject({ finishes: [], prints: [] });
  harness.rerender();
  expect(viewport.props.brakeView).toMatchObject({ instanceId: 'tray-1' });
  expect(within(panel()).getByLabelText('Press brake machine').value).toBe('brake-50-2000');
});

it('changes the machine in the model and re-orders, refuses and removes steps of the sequence', () => {
  const harness = setup(
    sheetModel({
      width: 100,
      bends: [
        { id: 'b1', a: [20, -1], b: [20, 61], angle: 90, direction: 'up', radius: null },
        { id: 'b2', a: [80, -1], b: [80, 61], angle: 90, direction: 'up', radius: null },
      ],
    }),
  );
  openBrake();
  act(() =>
    fireEvent.change(within(panel()).getByLabelText('Press brake machine'), { target: { value: 'brake-80-2500' } }),
  );
  expect(harness.model().fabrication.shop.machine).toBe('brake-80-2500');
  harness.rerender();
  const steps = () => within(panel()).getByRole('list', { name: 'Sequence' });
  expect(within(steps()).getAllByRole('listitem')).toHaveLength(2);
  // Scrub: step 1 before its hit poses that bend flat and the later one too.
  act(() =>
    fireEvent.click(
      within(within(steps()).getByRole('listitem', { name: 'Step 1' })).getByRole('button', { name: 'Before' }),
    ),
  );
  expect(viewport.props.brakeView).toMatchObject({ bendId: 'b1', angles: { b1: 0, b2: 0 } });
  // Re-run: a view-only stroke.
  act(() =>
    fireEvent.click(
      within(within(steps()).getByRole('listitem', { name: 'Step 2' })).getByRole('button', { name: 'Re-run' }),
    ),
  );
  const rerun = viewport.props.brakeView.stroke;
  expect(rerun).toMatchObject({ bendId: 'b2', commit: false });
  const commits = harness.setCadModel.mock.calls.length;
  act(() => viewport.props.onBrakeStrokeEnd(rerun.token));
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
  // Later: the order swaps (both steps still pass).
  act(() =>
    fireEvent.click(
      within(within(steps()).getByRole('listitem', { name: 'Step 1' })).getByRole('button', { name: 'Later' }),
    ),
  );
  expect(harness.model().parts[0].features[0].bends.map((b) => b.id)).toEqual(['b2', 'b1']);
  harness.rerender();
  act(() =>
    fireEvent.click(
      within(within(steps()).getByRole('listitem', { name: 'Step 2' })).getByRole('button', { name: 'Remove' }),
    ),
  );
  expect(harness.model().parts[0].features[0].bends.map((b) => b.id)).toEqual(['b2']);
});

it('refuses a re-order that makes a step collide', () => {
  // The U channel made gooseneck-free in the right order: the short flange
  // first, the tall one last is fine; tall first then short drives the tall
  // flange into the punch... so the swap is refused when it adds a failing
  // step. (Before SF-3: a 70 web and the ram; with the punch holders that
  // channel clears either way, so the 50 web of the collision test above.)
  const harness = setup(
    sheetModel({
      width: 115,
      bends: [
        { id: 'b1', a: [95, -1], b: [95, 61], angle: 90, direction: 'up', radius: null, punch: 'straight-88' },
        { id: 'b2', a: [45, -1], b: [45, 61], angle: 90, direction: 'up', radius: null, punch: 'straight-88' },
      ],
    }),
  );
  openBrake();
  const steps = within(panel()).getByRole('list', { name: 'Sequence' });
  expect([...steps.querySelectorAll('.cad-brake-check')].map((c) => c.textContent)).toEqual(['ok', 'ok']);
  const commits = harness.setCadModel.mock.calls.length;
  act(() =>
    fireEvent.click(
      within(within(steps).getByRole('listitem', { name: 'Step 1' })).getByRole('button', { name: 'Later' }),
    ),
  );
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
  expect(document.querySelector('.cad-error').textContent).toMatch(
    /^That order is refused: step 2 could not be made then\. Bend 2: the part hits the punch/,
  );
});

it('says in the status bar, with the station open, when the exact solid is rebuilding and when it is current', () => {
  const harness = setup(sheetModel({ width: 100 }));
  openBrake();
  const status = () => document.querySelector('.cad-status').textContent;
  expect(status()).toContain('Press brake — 50 t × 2 m press brake · Model current');
  // A hit made: the kernel rebuilds the part behind the station.
  Object.assign(kernel, { status: 'building', ready: false });
  harness.rerender();
  expect(status()).toContain('Press brake — 50 t × 2 m press brake · Rebuilding solids…');
  Object.assign(kernel, { status: 'error', ready: false });
  harness.rerender();
  expect(status()).toContain('Press brake — 50 t × 2 m press brake · Rebuild failed');
  Object.assign(kernel, { status: 'ready', ready: true });
  harness.rerender();
  expect(status()).toContain('· Model current');
});

it('makes an offset in one press of Bend: two hits in one stroke, two ordinary records (brake flip tooling §5.3)', () => {
  const harness = setup(sheetModel({ width: 300, height: 100 }));
  openBrake();
  act(() => fireEvent.click(within(map()).getByRole('button', { name: 'Gauge edge 2' })));
  fill('Backgauge L (mm)', 200);
  fill('Bend angle (°)', 45);
  act(() =>
    fireEvent.click(
      within(within(panel()).getByRole('group', { name: 'Bend shape' })).getByRole('button', { name: 'Offset' }),
    ),
  );
  fill('Offset (mm)', 6.35);
  expect(within(panel()).getByLabelText('Offset results').textContent).toContain('Line B DOWN · L 191.2 · clear');
  expect(within(map()).getByLabelText('Second line')).toBeTruthy();
  // Before the pedal the first hit lies flat on the die.
  expect(viewport.props.brakeView).toMatchObject({ bendId: 'pending-hit', gaugeDistance: 200, flipped: false });
  const commits = harness.setCadModel.mock.calls.length;
  key('Enter');
  const stroke = viewport.props.brakeView.stroke;
  expect(stroke.timeline).toMatchObject({ pair: true, turn: 500 });
  expect(stroke.hits).toHaveLength(2);
  expect(stroke.hits[1].gaugeDistance).toBeCloseTo(191.20333, 4);
  expect(document.querySelector('.cad-status').textContent).toContain('Press brake — bending…');
  act(() => viewport.props.onBrakeStrokeEnd(stroke.token));
  // One commit, two records in the order made, no shared stroke.
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 1);
  harness.rerender();
  const bends = harness.model().parts[0].features[0].bends;
  expect(bends.map((b) => [b.direction, b.angle, b.stroke])).toEqual([
    ['up', 45, undefined],
    ['down', 45, undefined],
  ]);
  expect(bends[0].id).toBe(stroke.hits[0].bendId);
  expect(bends[1].id).toBe(stroke.hits[1].bendId);
  // The station shows the last hit made; the sequence lists two hits, both ok.
  expect(viewport.props.brakeView).toMatchObject({ bendId: bends[1].id });
  const steps = within(panel()).getByRole('list', { name: 'Sequence' });
  expect([...steps.querySelectorAll('.cad-brake-check')].map((c) => c.textContent)).toEqual(['ok', 'ok']);
});

it('keeps a set punch length on the hit made; a new line puts the tooling back to fitted (brake tool length §3.1)', () => {
  const harness = setup(sheetModel({ width: 100 }));
  openBrake();
  act(() => fireEvent.click(within(map()).getByRole('button', { name: 'Gauge edge 4' })));
  fill('Backgauge L (mm)', 20);
  const length = () => within(panel()).getByRole('spinbutton', { name: 'Punch length' });
  expect(length().value).toBe('60');
  act(() => fireEvent.keyDown(length(), { key: '5' }));
  act(() => fireEvent.change(length(), { target: { value: '50' }, nativeEvent: { inputType: 'insertText' } }));
  act(() => fireEvent.keyDown(length(), { key: 'Enter' }));
  expect(length().value).toBe('50');
  expect(within(panel()).getByLabelText('Punch length note').textContent).toBe('5 mm short at each end');
  // A new L is a new line: the punch is fitted to it again.
  fill('Backgauge L (mm)', 25);
  expect(length().value).toBe('60');
  expect(within(panel()).getByLabelText('Punch length note').textContent).toBe('fitted');
  fill('Backgauge L (mm)', 20);
  act(() => fireEvent.keyDown(length(), { key: '5' }));
  act(() => fireEvent.change(length(), { target: { value: '50' }, nativeEvent: { inputType: 'insertText' } }));
  act(() => fireEvent.blur(length()));
  key(' ');
  const stroke = viewport.props.brakeView.stroke;
  act(() => viewport.props.onBrakeStrokeEnd(stroke.token));
  harness.rerender();
  const [made] = harness.model().parts[0].features[0].bends;
  expect(made).toMatchObject({ id: stroke.bendId, punch: 'straight-88', punchTrim: 5 });
  expect('dieTrim' in made).toBe(false);
  expect(within(panel()).getByRole('list', { name: 'Sequence' }).textContent).toContain('Straight 88° punch, 50 mm');
}, 15000);
