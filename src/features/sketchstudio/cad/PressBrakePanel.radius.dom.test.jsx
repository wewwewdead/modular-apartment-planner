// @vitest-environment jsdom
// Round bends by a radius punch on the panels (docs/sketch-studio-round-bend.md
// §12.6): Round's Made by (Bump hits · Radius punch), the Radius punch select
// in place of Inside radius and Hits, the punch as the one source of truth
// (the Machine and tooling select, Sharp and Bump hits put the straight punch
// back), the short-leg card's bump fix, the sequence row and its tooling line,
// the flat blank's zone, and Add bend's Made by.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import { SheetMetalForm } from './ShopPanels.jsx';
import FlatPatternMap from './FlatPatternMap.jsx';
import { brakeSessionDefaults, brakeStation } from './brakeStation.js';
import { emptyModel } from './model.js';

afterEach(() => cleanup());

const sheet = (bends = []) => ({
  id: 'sm',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: 1.5,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends,
});
const STRIP = { type: 'rectangle', width: 1000, height: 40, origin: [0, 0] };
const BLANK = { type: 'rectangle', width: 600, height: 400, origin: [0, 0] };
const modelWith = (bends = [], profile = STRIP) => ({
  ...emptyModel(),
  sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile, primitives: [], constrained: false }],
  parts: [{ id: 'p', name: 'Kiosk top', material: 'SPCC cold-rolled steel', features: [sheet(bends)] }],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
});
// The right edge (edge 2 of the rectangle) on the backgauge at L 300, 90°.
const session = (patch = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  edge: 1,
  distance: 300,
  ...patch,
});
const panel = (s, model = modelWith(), onSession = () => {}) =>
  render(
    <PressBrakePanel
      station={brakeStation({ model, session: s })}
      session={s}
      onSession={onSession}
      onMachine={() => {}}
      onBend={() => {}}
      onLeave={() => {}}
      onScrub={() => {}}
      onRerun={() => {}}
      onMove={() => {}}
      onRemove={() => {}}
    />,
  );
const region = () => screen.getByRole('region', { name: 'Press brake' });
const pressed = (group, name) => within(group).getByRole('button', { name }).getAttribute('aria-pressed');
const radiusBend = {
  id: 'r',
  a: [700, -1],
  b: [700, 41],
  angle: 90,
  direction: 'up',
  radius: null,
  punch: 'radius-30',
};

it('shows Made by only for a round bend; Bump hits keeps the RB-1 fields, Radius punch swaps the punch in', () => {
  const onSession = vi.fn();
  panel(session(), modelWith(), onSession);
  expect(within(region()).queryByRole('group', { name: 'Made by' })).toBeNull();
  cleanup();
  panel(session({ shape: 'round' }), modelWith(), onSession);
  const made = within(region()).getByRole('group', { name: 'Made by' });
  expect(pressed(made, 'Bump hits')).toBe('true');
  expect(pressed(made, 'Radius punch')).toBe('false');
  expect(within(region()).getByLabelText('Inside radius (mm)').value).toBe('20');
  expect(within(region()).getByRole('spinbutton', { name: 'Hits' })).toBeTruthy();
  expect(within(region()).queryByRole('combobox', { name: 'Radius punch' })).toBeNull();
  // Bump hits again is no change; Radius punch takes the punch nearest the radius, the die automatic.
  act(() => fireEvent.click(within(made).getByRole('button', { name: 'Bump hits' })));
  expect(onSession).not.toHaveBeenCalled();
  act(() => fireEvent.click(within(made).getByRole('button', { name: 'Radius punch' })));
  expect(onSession).toHaveBeenCalledWith({ punch: 'radius-20', die: null, scrub: null });
});

it('makes the strip’s hit with the Radius R30 punch: one hit, R30, the automatic V80 die', () => {
  const onSession = vi.fn();
  panel(session({ shape: 'round', punch: 'radius-30' }), modelWith(), onSession);
  const shape = within(region()).getByRole('group', { name: 'Bend shape' });
  expect(pressed(shape, 'Round')).toBe('true');
  const made = within(region()).getByRole('group', { name: 'Made by' });
  expect(pressed(made, 'Radius punch')).toBe('true');
  const select = within(region()).getByRole('combobox', { name: 'Radius punch' });
  expect(select.value).toBe('radius-30');
  expect([...select.options].map((o) => o.textContent)).toEqual([
    'Radius R10',
    'Radius R15',
    'Radius R20',
    'Radius R25',
    'Radius R30',
  ]);
  expect(within(region()).queryByLabelText('Inside radius (mm)')).toBeNull();
  expect(within(region()).queryByRole('spinbutton', { name: 'Hits' })).toBeNull();
  // Results read like a sharp bend's: one hit, with the inside radius.
  const results = within(region()).getByLabelText('Hit results');
  expect(within(results).queryByLabelText('Hits')).toBeNull();
  expect(within(results).getByLabelText('Flange').textContent).toBe('307.35 mm');
  expect(within(region()).getByLabelText('Inside radius').textContent).toBe('R30 mm');
  expect(within(region()).getByLabelText('Ram depth')).toBeTruthy();
  expect(document.querySelector('details.cad-shop-tooling summary small').textContent).toBe(
    '50 t × 2 m press brake · Radius R30 punch · V80 60° (automatic) die',
  );
  expect(within(region()).getByRole('option', { name: 'Automatic (V80 60°)' })).toBeTruthy();
  expect(within(region()).getByRole('status', { name: 'Collision check' }).textContent).toMatch(/^Clear through/);
  expect(within(region()).getByRole('button', { name: 'Bend' }).disabled).toBe(false);
  // Another radius punch; Bump hits and Sharp put the straight punch back.
  act(() => fireEvent.change(select, { target: { value: 'radius-20' } }));
  expect(onSession).toHaveBeenLastCalledWith({ punch: 'radius-20', scrub: null });
  act(() => fireEvent.click(within(made).getByRole('button', { name: 'Bump hits' })));
  expect(onSession).toHaveBeenLastCalledWith({ punch: 'straight-88', die: null, radius: 30, steps: null, scrub: null });
  act(() => fireEvent.click(within(shape).getByRole('button', { name: 'Sharp' })));
  expect(onSession).toHaveBeenLastCalledWith({ shape: 'sharp', punch: 'straight-88', die: null, scrub: null });
});

it('treats a radius punch chosen under Machine and tooling as Round · Radius punch (one source of truth)', () => {
  const onSession = vi.fn();
  // Picked in the tooling select while the shape still reads Sharp: shown as Round · Radius punch.
  panel(session({ punch: 'radius-15' }), modelWith(), onSession);
  expect(pressed(within(region()).getByRole('group', { name: 'Bend shape' }), 'Round')).toBe('true');
  expect(pressed(within(region()).getByRole('group', { name: 'Made by' }), 'Radius punch')).toBe('true');
  const punch = within(region()).getByRole('combobox', { name: 'Punch' });
  act(() => fireEvent.change(punch, { target: { value: 'straight-88' } }));
  expect(onSession).toHaveBeenLastCalledWith({ punch: 'straight-88', die: null });
  cleanup();
  panel(session(), modelWith(), onSession);
  const select = within(region()).getByRole('combobox', { name: 'Punch' });
  act(() => fireEvent.change(select, { target: { value: 'radius-25' } }));
  expect(onSession).toHaveBeenLastCalledWith({ punch: 'radius-25', shape: 'round', die: null });
  // Between two straight punches nothing else changes, as before.
  act(() => fireEvent.change(select, { target: { value: 'gooseneck-88' } }));
  expect(onSession).toHaveBeenLastCalledWith({ punch: 'gooseneck-88' });
});

it('refuses a short leg for the radius punch and offers bump hits as the fix (§12.7 item 1)', () => {
  const onSession = vi.fn();
  const model = modelWith([], BLANK);
  panel(session({ shape: 'round', punch: 'radius-30', distance: 40 }), model, onSession);
  expect(within(region()).getByRole('alert').textContent).toMatch(
    /^The flange is 40 mm from the punch line in the flat; the V80 60° die needs 66.57 mm .* or make it with bump hits: they need only about 27.95 mm\.$/,
  );
  expect(within(region()).getByRole('button', { name: 'Bend' }).disabled).toBe(true);
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Make it with bump hits' })));
  const fix = { shape: 'round', radius: 30, steps: null, punch: 'straight-88', die: null, scrub: null };
  expect(onSession).toHaveBeenCalledWith(fix);
  // The session after the fix: bump hits at R30, ten of them, and the same bend passes.
  cleanup();
  panel(session({ shape: 'round', punch: 'radius-30', distance: 40, ...fix }), model);
  expect(pressed(within(region()).getByRole('group', { name: 'Made by' }), 'Bump hits')).toBe('true');
  expect(within(region()).getByRole('spinbutton', { name: 'Hits' }).getAttribute('placeholder')).toBe('10');
  expect(within(region()).queryByRole('alert')).toBeNull();
  expect(within(within(region()).getByLabelText('Hit results')).getByLabelText('Hits').textContent).toMatch(/^10 hits/);
  expect(within(region()).getByRole('button', { name: 'Bend' }).disabled).toBe(false);
});

it('lists a radius-punch bend as one step whose tooling line names the punch', () => {
  panel(session({ edge: null }), modelWith([{ ...radiusBend, die: 'v80-60' }]));
  const steps = within(within(region()).getByRole('list', { name: 'Sequence' })).getAllByRole('listitem');
  expect(steps).toHaveLength(1);
  expect(steps[0].querySelector('strong').textContent).toBe('1 · UP 90° R30');
  expect(steps[0].querySelector('small').textContent).toBe('Radius R30 punch · v80-60');
  expect(within(region()).getByLabelText('Hits made').textContent).toBe('1');
});

it('draws a radius-punch bend’s zone on the flat blank, without hit lines', () => {
  const s = session({ edge: null });
  render(
    <FlatPatternMap
      station={brakeStation({ model: modelWith([radiusBend]), session: s })}
      session={s}
      onPickEdge={() => {}}
      onDistance={() => {}}
      onPoints={() => {}}
    />,
  );
  const zone = screen.getByLabelText('Round bend zone: UP 90° R30');
  expect(zone.querySelectorAll('.cad-map-tangent')).toHaveLength(2);
  expect(zone.querySelectorAll('.cad-map-hitline')).toHaveLength(0);
  expect(zone.querySelectorAll('.cad-map-band')).toHaveLength(1);
});

it('adds a radius-punch bend by numbers: Round · Radius punch, one hit, no hits stored', () => {
  const onChange = vi.fn();
  const model = modelWith();
  render(<SheetMetalForm feature={model.parts[0].features[0]} model={model} onChange={onChange} />);
  const form = document.querySelector('details.cad-add-bend');
  act(() => fireEvent.change(within(form).getByLabelText('Distance D (mm)'), { target: { value: '300' } }));
  act(() => fireEvent.blur(within(form).getByLabelText('Distance D (mm)')));
  expect(within(form).queryByRole('group', { name: 'New bend made by' })).toBeNull();
  act(() =>
    fireEvent.click(
      within(within(form).getByRole('group', { name: 'New bend shape' })).getByRole('button', { name: 'Round' }),
    ),
  );
  const made = within(form).getByRole('group', { name: 'New bend made by' });
  expect(pressed(made, 'Bump hits')).toBe('true');
  act(() => fireEvent.click(within(made).getByRole('button', { name: 'Radius punch' })));
  // The punch nearest the radius field (20), then R30 chosen.
  const select = within(form).getByRole('combobox', { name: 'New bend radius punch' });
  expect(select.value).toBe('radius-20');
  expect(within(form).queryByLabelText('New bend inside radius (mm)')).toBeNull();
  expect(within(form).queryByLabelText('New bend hits')).toBeNull();
  act(() => fireEvent.change(select, { target: { value: 'radius-30' } }));
  expect(within(form).getByLabelText('New bend numbers').textContent).toMatch(/^UP 90° R30Allowance 48.3/);
  act(() => fireEvent.click(within(form).getByRole('button', { name: 'Add bend' })));
  const [bend] = onChange.mock.calls.at(-1)[0].bends;
  expect(bend).toMatchObject({ angle: 90, direction: 'up', radius: null, punch: 'radius-30' });
  expect(bend.steps).toBeUndefined();
});

it('picks the gauge edge (or etched line) nearest the pointer on a thin strip, not the strip drawn on top', () => {
  // 1000 × 40: the long edges' click strips (± 20.7 mm) cover the whole strip,
  // its two ends and the etched line across it.
  const model = modelWith();
  model.parts[0].features[0].marks = [{ id: 'm', a: [300, 0], b: [300, 40] }];
  const s = session({ edge: null });
  const onPickEdge = vi.fn(),
    onMark = vi.fn();
  const { container } = render(
    <FlatPatternMap
      station={brakeStation({ model, session: s })}
      session={s}
      onPickEdge={onPickEdge}
      onDistance={() => {}}
      onPoints={() => {}}
      onMark={onMark}
    />,
  );
  // The card's view box is [−82, −122, 1164, 204]; at one pixel per mm a flat point is (x + 82, 122 − y).
  const svg = container.querySelector('svg');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1164, height: 204, right: 1164, bottom: 204 });
  const click = (name, [x, y]) =>
    act(() => fireEvent.click(screen.getByRole('button', { name }), { detail: 1, clientX: x + 82, clientY: 122 - y }));
  // The top edge's strip is drawn over the right end: a click on the right edge picks it.
  click('Gauge edge 3', [1000, 20]);
  expect(onPickEdge).toHaveBeenLastCalledWith(1);
  // Just beyond the left end.
  click('Gauge edge 4', [-6, 20]);
  expect(onPickEdge).toHaveBeenLastCalledWith(3);
  // Near a long edge away from the ends: that edge.
  click('Gauge edge 3', [500, 4]);
  expect(onPickEdge).toHaveBeenLastCalledWith(0);
  click('Gauge edge 1', [500, 37]);
  expect(onPickEdge).toHaveBeenLastCalledWith(2);
  // On the etched line, under the edges' strips: the line.
  click('Gauge edge 3', [300, 20]);
  expect(onMark).toHaveBeenCalledWith(expect.objectContaining({ id: 'm' }));
  expect(onPickEdge).toHaveBeenCalledTimes(4);
  // A click with no pointer (the keyboard, a synthetic event) picks the element clicked, as before.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Gauge edge 3' })));
  expect(onPickEdge).toHaveBeenLastCalledWith(2);
});
