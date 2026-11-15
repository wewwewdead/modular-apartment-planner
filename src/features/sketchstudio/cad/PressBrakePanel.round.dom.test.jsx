// @vitest-environment jsdom
// Round bends on the panels (docs/sketch-studio-round-bend.md §6): the press
// brake's Bend shape (Sharp · Round, Inside radius, Hits with the automatic
// count as its placeholder), the hit results and machine numbers of the §8
// case, the sequence row; Add bend's Sharp · Round, and a round bend's row.
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
const modelWith = (bends = []) => ({
  ...emptyModel(),
  sketches: [
    {
      id: 's',
      name: 'Blank',
      plane: 'XY',
      profile: { type: 'rectangle', width: 600, height: 400, origin: [0, 0] },
      primitives: [],
      constrained: false,
    },
  ],
  parts: [{ id: 'p', name: 'Kiosk side', material: 'SPCC cold-rolled steel', features: [sheet(bends)] }],
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

it('keeps the sharp panel as it was, with Bend shape under the angle', () => {
  const onSession = vi.fn();
  panel(session(), modelWith(), onSession);
  const region = screen.getByRole('region', { name: 'Press brake' });
  const shape = within(region).getByRole('group', { name: 'Bend shape' });
  expect(within(shape).getByRole('button', { name: 'Sharp' }).getAttribute('aria-pressed')).toBe('true');
  expect(within(region).queryByLabelText('Inside radius (mm)')).toBeNull();
  expect(within(region).queryByRole('spinbutton', { name: 'Hits' })).toBeNull();
  const results = within(region).getByLabelText('Hit results');
  expect(within(results).queryByLabelText('Hits')).toBeNull();
  expect(within(region).getByLabelText('Ram depth')).toBeTruthy();
  act(() => fireEvent.click(within(shape).getByRole('button', { name: 'Round' })));
  expect(onSession).toHaveBeenCalledWith({ shape: 'round', scrub: null });
});

it('shows a round bend: radius, automatic hits, the hit results and the machine numbers per hit', () => {
  const onSession = vi.fn();
  panel(session({ shape: 'round', radius: 40 }), modelWith(), onSession);
  const region = screen.getByRole('region', { name: 'Press brake' });
  expect(within(region).getByLabelText('Inside radius (mm)').value).toBe('40');
  const hits = within(region).getByRole('spinbutton', { name: 'Hits' });
  expect(hits.value).toBe('');
  expect(hits.getAttribute('placeholder')).toBe('13');
  const results = within(region).getByLabelText('Hit results');
  expect(within(results).getByLabelText('Hits').textContent).toBe('13 hits · 6.92° each · every 4.92 mm');
  expect(within(results).getByLabelText('Flats').textContent).toBe('0.08 mm high');
  expect(within(results).getByLabelText('Flange').textContent).toBe('309.5 mm');
  expect(within(region).getByLabelText('Backgauge per hit').textContent).toBe('329.54 → 270.46 mm');
  expect(within(region).getByLabelText('Ram depth per hit').textContent).toBe('0.26 mm');
  expect(within(region).getByLabelText('Springback').textContent).toBe('2.8° · bends to 7.1° per hit');
  expect(within(region).getByRole('status', { name: 'Collision check' }).textContent).toMatch(/^Clear through/);
  expect(within(region).getByRole('button', { name: 'Bend' }).disabled).toBe(false);
  // Hits typed: kept in the session.
  act(() => fireEvent.change(hits, { target: { value: '18' } }));
  act(() => fireEvent.blur(hits));
  expect(onSession).toHaveBeenCalledWith({ steps: 18, scrub: null });
});

it('puts a die warning with its fix on show, and refuses a radius one hit already makes', () => {
  const onSession = vi.fn();
  panel(session({ shape: 'round', radius: 40, die: 'v16-88', steps: 13 }), modelWith(), onSession);
  const region = screen.getByRole('region', { name: 'Press brake' });
  expect(within(region).getByRole('note').textContent).toMatch(/^The V16 88° die is 16 mm wide and the hits/);
  act(() => fireEvent.click(within(region).getByRole('button', { name: 'Use the V8 88° die' })));
  expect(onSession).toHaveBeenCalledWith({ die: 'v8-88', scrub: null });
  cleanup();
  panel(session({ shape: 'round', radius: 1.6 }));
  expect(screen.getByRole('alert').textContent).toBe(
    'This hit: R1.6 is what one hit in the V10 88° die makes: make it an ordinary bend.',
  );
});

it('lists a round bend as one step and counts its hits', () => {
  const bend = {
    id: 'r',
    a: [300, -1],
    b: [300, 401],
    angle: 90,
    direction: 'up',
    radius: 40,
    steps: 13,
    punch: 'straight-88',
    die: 'v10-88',
  };
  panel(session({ edge: null }), modelWith([bend]));
  const region = screen.getByRole('region', { name: 'Press brake' });
  const steps = within(within(region).getByRole('list', { name: 'Sequence' })).getAllByRole('listitem');
  expect(steps).toHaveLength(1);
  expect(steps[0].querySelector('strong').textContent).toBe('1 · UP 90° R40 · 13 hits');
  expect(within(region).getByLabelText('Hits made').textContent).toBe('13');
  expect(within(region).getByLabelText('Folded size').textContent).toMatch(/^Folded 309.5 × 400 × 309.5 mm/);
});

it('draws a round bend’s zone and hit lines on the flat blank', () => {
  const bend = { id: 'r', a: [300, -1], b: [300, 401], angle: 90, direction: 'up', radius: 40, steps: 13 };
  const s = session({ edge: null });
  const { container } = render(
    <FlatPatternMap
      station={brakeStation({ model: modelWith([bend]), session: s })}
      session={s}
      onPickEdge={() => {}}
      onDistance={() => {}}
      onPoints={() => {}}
    />,
  );
  const zone = screen.getByLabelText('Round bend zone: UP 90° R40 · 13 hits');
  expect(zone.querySelectorAll('.cad-map-tangent')).toHaveLength(2);
  expect(zone.querySelectorAll('.cad-map-hitline')).toHaveLength(13);
  expect(zone.querySelectorAll('.cad-map-band')).toHaveLength(1);
  // The numbered dot stays on the centre line.
  expect(container.querySelector('.cad-map-number circle').getAttribute('cx')).toBe('300');
});

it('adds a round bend by numbers and edits its hits in the bend row', () => {
  const onChange = vi.fn();
  const model = modelWith();
  const { rerender } = render(
    <SheetMetalForm feature={model.parts[0].features[0]} model={model} onChange={onChange} />,
  );
  const form = document.querySelector('details.cad-add-bend');
  act(() => fireEvent.change(within(form).getByLabelText('Distance D (mm)'), { target: { value: '300' } }));
  act(() => fireEvent.blur(within(form).getByLabelText('Distance D (mm)')));
  const shape = within(form).getByRole('group', { name: 'New bend shape' });
  act(() => fireEvent.click(within(shape).getByRole('button', { name: 'Round' })));
  const radius = within(form).getByLabelText('New bend inside radius (mm)');
  act(() => fireEvent.change(radius, { target: { value: '40' } }));
  act(() => fireEvent.blur(radius));
  expect(within(form).getByLabelText('New bend hits').getAttribute('placeholder')).toBe('13');
  expect(within(form).getByLabelText('New bend numbers').textContent).toMatch(/^UP 90° R40 · 13 hits/);
  act(() => fireEvent.click(within(form).getByRole('button', { name: 'Add bend' })));
  const next = onChange.mock.calls.at(-1)[0];
  expect(next.bends).toHaveLength(1);
  expect(next.bends[0]).toMatchObject({ angle: 90, direction: 'up', radius: 40, steps: 13 });
  // Its row: radius and hits, no automatic radius.
  rerender(<SheetMetalForm feature={next} model={model} onChange={onChange} />);
  const row = screen.getByRole('article', { name: 'Bend 1' });
  expect(within(row).queryByLabelText('Bend 1 automatic radius')).toBeNull();
  expect(within(row).getByLabelText('Hits').value).toBe('13');
  expect(row.querySelector('strong').textContent).toBe('Bend 1 · UP 90° R40 · 13 hits');
  // An ordinary bend with a radius it cannot make in one hit is warned in its row.
  const plain = { ...next, bends: [{ ...next.bends[0], steps: undefined }] };
  rerender(<SheetMetalForm feature={plain} model={model} onChange={onChange} />);
  expect(within(screen.getByRole('article', { name: 'Bend 1' })).getByRole('note').textContent).toBe(
    'Bend 1: one hit in the V10 88° die forms about R1.6, not R40: make it a round bend (several hits).',
  );
});
