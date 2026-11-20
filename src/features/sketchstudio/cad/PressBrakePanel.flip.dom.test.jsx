// @vitest-environment jsdom
// Flip, turn and the offset bend on the panel (docs/sketch-studio-brake-flip-
// tooling.md §5, BT-2): Flip sheet as a two-state control (This side up ·
// Flipped over, still the "Flip sheet" switch), Turn sheet around, Bend shape
// Offset with its field, results and cards (the order said, the die offered,
// the collision card's turn button), both lines on the flat blank, and the
// side view saying which side is up.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import FlatPatternMap from './FlatPatternMap.jsx';
import BrakeSideView from './BrakeSideView.jsx';
import { bladeOptions, brakeSessionDefaults, brakeStation, offsetSpacing } from './brakeStation.js';
import { emptyModel } from './model.js';

afterEach(() => cleanup());

const modelOf = (width, bends = [], height = 100) => ({
  ...emptyModel(),
  sketches: [
    {
      id: 's',
      name: 'Blank',
      plane: 'XY',
      profile: { type: 'rectangle', width, height, origin: [0, 0] },
      primitives: [],
      constrained: false,
    },
  ],
  parts: [
    {
      id: 'p',
      name: 'Step',
      material: 'SPCC cold-rolled steel',
      features: [
        {
          id: 'sm',
          type: 'sheetmetal',
          sketchId: 's',
          thickness: 1.5,
          stock: 'spcc',
          kFactor: null,
          base: null,
          marks: [],
          bends: bends.map((b, i) => ({ id: `b${i + 1}`, angle: 90, direction: 'up', radius: null, ...b })),
        },
      ],
    },
  ],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
});
const session = (patch = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  ...patch,
});
const panel = (s, model = modelOf(300), onSession = () => {}) =>
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
// The offset's results (a description list): one figure by its label.
const figure = (label) =>
  within(within(region()).getByLabelText('Offset results')).getByLabelText(label, { exact: true }).textContent;
const STEP = { edge: 1, distance: 200, shape: 'offset', offset: 6.35, angle: 45 };

it('shows Flip sheet as two states beside the angle, still the "Flip sheet" switch', () => {
  const onSession = vi.fn();
  panel(session(), modelOf(300), onSession);
  const flip = within(region()).getByLabelText('Flip sheet');
  expect(flip.getAttribute('role')).toBe('switch');
  expect(flip.checked).toBe(false);
  const control = flip.closest('.cad-flip');
  expect(
    [...control.querySelectorAll('.cad-flip-side')].map((s) => [s.textContent, s.classList.contains('is-on')]),
  ).toEqual([
    ['This side up', true],
    ['Flipped over', false],
  ]);
  // Beside the angle, in its row.
  expect(control.parentElement).toBe(within(region()).getByLabelText('Bend angle (°)').closest('.cad-inline'));
  act(() => fireEvent.click(within(control).getByText('Flipped over')));
  expect(onSession).toHaveBeenLastCalledWith({ flip: true, scrub: null });
  cleanup();
  panel(session({ flip: true }));
  const over = within(region()).getByRole('switch', { name: 'Flip sheet' });
  expect(over.checked).toBe(true);
  expect(over.closest('.cad-flip').querySelector('.is-on').textContent).toBe('Flipped over');
});

it('turns the sheet around: the opposite edge and L to the same line, or `turned` on a two-point line', () => {
  const onSession = vi.fn();
  panel(session({ edge: null }), modelOf(300), onSession);
  expect(within(region()).getByRole('button', { name: 'Turn sheet around' }).disabled).toBe(true);
  cleanup();
  panel(session({ edge: 1, distance: 200 }), modelOf(300), onSession);
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Turn sheet around' })));
  expect(onSession).toHaveBeenLastCalledWith({ edge: 3, distance: 100, turned: false, scrub: null });
  cleanup();
  const points = {
    mode: 'points',
    points: [
      [100, 0],
      [100, 100],
    ],
  };
  panel(session(points), modelOf(300), onSession);
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Turn sheet around' })));
  expect(onSession).toHaveBeenLastCalledWith({ turned: true, scrub: null });
  cleanup();
  panel(session({ ...points, turned: true }));
  expect(within(region()).getByRole('note', { name: 'Turned around' }).textContent).toBe(
    'Turned around: the other side to the backgauge.',
  );
});

it('offers Offset as a third bend shape, with its field; a radius punch gives way to the straight punch', () => {
  const onSession = vi.fn();
  panel(session(), modelOf(300), onSession);
  const shapes = within(region()).getByRole('group', { name: 'Bend shape' });
  expect(
    within(shapes)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Sharp', 'Round', 'Offset']);
  act(() => fireEvent.click(within(shapes).getByRole('button', { name: 'Offset' })));
  expect(onSession).toHaveBeenLastCalledWith({ shape: 'offset', scrub: null });
  expect(within(region()).queryByLabelText('Offset (mm)')).toBeNull();
  cleanup();
  panel(session({ punch: 'radius-20', shape: 'round' }), modelOf(300), onSession);
  act(() =>
    fireEvent.click(
      within(within(region()).getByRole('group', { name: 'Bend shape' })).getByRole('button', { name: 'Offset' }),
    ),
  );
  expect(onSession).toHaveBeenLastCalledWith({ shape: 'offset', punch: 'straight-88', die: null, scrub: null });
  cleanup();
  panel(session({ shape: 'offset' }));
  expect(within(region()).getByLabelText('Offset (mm)').value).toBe('10');
  expect(
    within(within(region()).getByRole('group', { name: 'Bend shape' }))
      .getByRole('button', { name: 'Offset' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
});

it('reads out the offset before the pedal: spacing, web, each hit with its backgauge reading, the force', () => {
  panel(session(STEP));
  expect(figure('Spacing')).toBe('8.8 mm');
  expect(figure('Web')).toBe('7.03 mm');
  expect(figure('Hit 1')).toBe('Line A UP · L 200 · clear');
  expect(figure('Hit 2')).toBe('Line B DOWN · L 191.2 · clear');
  expect(within(region()).getByRole('meter', { name: 'Tonnage against capacity' })).toBeTruthy();
  expect(within(region()).queryByLabelText('Hit results')).toBeNull();
  expect(within(region()).getByRole('status', { name: 'Collision check' }).textContent).toBe(
    'Both hits clear: no part of the sheet meets the punch, ram, die, bed or itself.',
  );
  expect(within(region()).getByRole('button', { name: 'Bend' }).disabled).toBe(false);
  expect(within(region()).queryByRole('status', { name: 'Offset order' })).toBeNull();
});

it('says when it is made the other way round', () => {
  const { spacing } = offsetSpacing({
    offset: 20,
    angle: 90,
    radius: 1.6,
    allowance: (Math.PI / 2) * 2.245,
    thickness: 1.5,
  });
  panel(session({ ...STEP, edge: 3, distance: 60 + spacing, offset: 20, angle: 90 }), modelOf(260));
  expect(within(region()).getByRole('status', { name: 'Offset order' }).textContent).toBe(
    'Made the other way round: the shorter side hangs down.',
  );
  expect(figure('Hit 1')).toBe('Line B DOWN · L 60 · clear');
  expect(figure('Hit 2')).toMatch(/^Line A UP · L 181\.17 \(turned\) · clear$/);
  expect(within(region()).getByRole('button', { name: 'Bend' }).disabled).toBe(false);
});

it('refuses an offset too small for the die, with the die that makes it as one click', () => {
  const onSession = vi.fn();
  panel(session({ ...STEP, offset: 5 }), modelOf(260), onSession);
  const card = within(region()).getAllByRole('alert')[0];
  expect(card.textContent).toMatch(/^Offset 5 mm at 45° is too small for the V10 88° die: the web leaves 6\.01 mm/);
  expect(within(region()).getByRole('button', { name: 'Bend' }).disabled).toBe(true);
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Use the V8 88° die' })));
  expect(onSession).toHaveBeenLastCalledWith({ die: 'v8-88', scrub: null });
  expect(figure('Hit 2')).toMatch(/· refused$/);
});

it('gives the collision card a Turn the sheet around button when that clears the whole hit', () => {
  const onSession = vi.fn();
  const channel = modelOf(115, [{ a: [45, -1], b: [45, 61], punch: 'straight-88' }], 60);
  panel(session({ edge: 1, distance: 20, punch: 'gooseneck-88', reverse: true }), channel, onSession);
  const card = within(region()).getByRole('alert', { name: 'Collision' });
  expect(card.textContent).not.toMatch(/Turned around/);
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Turn the sheet around' })));
  // A flat distance past the made bend from that edge, named so (skin gauge §4.5 step 1).
  expect(onSession).toHaveBeenLastCalledWith({ edge: 3, distance: 95, turned: false, stop: null, scrub: null });
  // Its punch fix stays beside it.
  expect(within(region()).getByRole('button', { name: 'Turn the punch round' })).toBeTruthy();
});

it('draws both lines of an offset on the flat blank', () => {
  const s = session(STEP);
  const station = brakeStation({ model: modelOf(300), session: s });
  render(
    <FlatPatternMap station={station} session={s} onPickEdge={() => {}} onDistance={() => {}} onPoints={() => {}} />,
  );
  const map = screen.getByRole('figure', { name: 'Flat blank' });
  const first = within(map).getByLabelText('Punch line');
  const second = within(map).getByLabelText('Second line');
  expect(Number(first.getAttribute('x1'))).toBeCloseTo(100, 6);
  expect(Number(second.getAttribute('x1'))).toBeCloseTo(108.79667, 4);
  expect(second.classList.contains('is-second')).toBe(true);
});

it('says in the side view which side is up, and that the sheet is turning over', () => {
  let listener = null;
  render(<BrakeSideView subscribe={(fn) => ((listener = fn), () => {})} />);
  const pose = (patch) => ({
    window: { y0: -60, y1: 60, z0: -48, z1: 86 },
    tools: {},
    sheet: {
      outline: [
        [-50, 0],
        [50, 0],
        [50, 1.5],
        [-50, 1.5],
      ],
      breaks: [],
      thickness: 1.5,
    },
    context: [],
    finger: null,
    collision: null,
    angle: 0,
    target: 45,
    tipZ: 41.5,
    punch: 'Straight 88°',
    die: 'V10 88°',
    phase: null,
    flipped: false,
    ...patch,
  });
  act(() => listener(pose()));
  const side = screen.getByLabelText('Side up');
  expect(side.textContent).toBe('This side up');
  act(() => listener(pose({ flipped: true, phase: 'turn' })));
  expect(side.textContent).toBe('Flipped over');
  expect(side.classList.contains('is-flipped')).toBe(true);
  expect(screen.getByLabelText('Ram').textContent).toBe('Turning the sheet over');
});

it('the picker says the R10 radius punch clears a plain 90° bend now its holder is drawn as the catalogue has it (§5.6)', () => {
  const s = session({ edge: 1, distance: 150 });
  const model = modelOf(300);
  render(
    <PressBrakePanel
      station={brakeStation({ model, session: s })}
      session={s}
      bladeOptions={(kind) => bladeOptions({ model, session: s, kind })}
      onSession={() => {}}
      onMachine={() => {}}
      onBend={() => {}}
      onLeave={() => {}}
      onScrub={() => {}}
      onRerun={() => {}}
      onMove={() => {}}
      onRemove={() => {}}
    />,
  );
  act(() =>
    fireEvent.click(
      within(within(region()).getByRole('group', { name: 'Blades' })).getByRole('button', { name: /^Top: punch/ }),
    ),
  );
  const card = within(within(region()).getByRole('region', { name: 'Punches' })).getByRole('button', {
    name: 'Radius R10',
  });
  expect(card.querySelector('.cad-blade-verdict').textContent).toBe('Clears this hit');
});
