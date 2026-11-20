// @vitest-environment jsdom
// Horn sections on the panel (docs/sketch-studio-punch-library.md §4.4, PL-1):
// the checkbox under the punch's length and its note, off and disabled with a
// radius punch; the collision card's "Use horn sections at the ends" before
// "Shorten the punch to …"; the hooked warning; the sequence row's line.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import BrakeSideView from './BrakeSideView.jsx';
import { HOOKED, brakeSessionDefaults, brakeStation, startStroke } from './brakeStation.js';
import { emptyModel } from './model.js';

afterEach(() => cleanup());

const W = 400,
  H = 300;
const bend = (id, a, b) => ({ id, a, b, angle: 90, direction: 'up', radius: null, punch: 'straight-88' });
// The §2.2 tray: walls 30 deep with 15 mm lips bent in, the flange between them pending.
function tray(lip = 15, depth = 30) {
  const out = depth + lip;
  const profile = {
    type: 'polygon',
    points: [
      [-out, 0],
      [W + out, 0],
      [W + out, H - 4],
      [W - 2, H - 4],
      [W - 2, H + depth],
      [2, H + depth],
      [2, H - 4],
      [-out, H - 4],
    ],
  };
  const feature = {
    id: 'f',
    type: 'sheetmetal',
    sketchId: 's',
    thickness: 1.2,
    stock: 'spcc',
    kFactor: null,
    base: [W / 2, H / 2],
    marks: [],
    bends: [
      ...(lip ? [bend('lipR', [W + depth, 0], [W + depth, H - 4]), bend('lipL', [-depth, H - 4], [-depth, 0])] : []),
      bend('sideR', [W, 0], [W, H - 4]),
      bend('sideL', [0, H - 4], [0, 0]),
    ],
  };
  return { model: modelOf(feature, profile), feature, profile };
}
function modelOf(feature, profile) {
  const model = emptyModel();
  model.sketches = [{ id: 's', name: 'S', plane: 'XY', profile, primitives: [], constrained: false }];
  model.parts = [{ id: 'p', name: 'Tray', features: [feature] }];
  model.instances = [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }];
  return model;
}
const session = (patch = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  mode: 'points',
  points: [
    [2, H],
    [W - 2, H],
  ],
  ...patch,
});
const panel = (s, model, onSession = () => {}, advise = true) =>
  render(
    <PressBrakePanel
      station={brakeStation({ model, session: s, advise })}
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
const blades = () => within(region()).getByRole('group', { name: 'Blades' });
const checkbox = () => within(blades()).getByRole('checkbox', { name: 'Horn sections at the ends' });
const NOTE =
  "The tip runs 20 mm past the punch body at each end, 10 mm high: it reaches under a lip. Half the punch's load (500 kN/m).";

it('a checkbox under the punch’s length; on, its note; a click sets the session', () => {
  const { model } = tray();
  const onSession = vi.fn();
  panel(session(), model, onSession, false);
  expect(checkbox().checked).toBe(false);
  expect(checkbox().disabled).toBe(false);
  expect(within(blades()).queryByRole('note', { name: 'Horn sections' })).toBeNull();
  act(() => fireEvent.click(checkbox()));
  expect(onSession).toHaveBeenLastCalledWith({ horns: true, scrub: null });
  cleanup();
  panel(session({ horns: true }), model, onSession, false);
  expect(checkbox().checked).toBe(true);
  expect(within(blades()).getByRole('note', { name: 'Horn sections' }).textContent).toBe(NOTE);
  // The hit clears with the corners pressed, and the hooked warning says how the box goes on.
  expect(within(region()).getByRole('status', { name: 'Collision check' }).textContent).toMatch(/^Clear through/);
  expect(
    within(region())
      .getAllByRole('note')
      .some((n) => n.textContent === HOOKED),
  ).toBe(true);
  expect(within(region()).queryByText(/the ends are not pressed/)).toBeNull();
  act(() => fireEvent.click(checkbox()));
  expect(onSession).toHaveBeenLastCalledWith({ horns: false, scrub: null });
});

it('a radius punch: the checkbox off and disabled, with its title; the gooseneck: half its 500 kN/m', () => {
  const { model } = tray();
  panel(session({ punch: 'radius-10', shape: 'round', horns: true }), model, () => {}, false);
  expect(checkbox().checked).toBe(false);
  expect(checkbox().disabled).toBe(true);
  expect(checkbox().closest('label').title).toBe('A radius punch has no horn sections');
  expect(within(blades()).queryByRole('note', { name: 'Horn sections' })).toBeNull();
  cleanup();
  panel(session({ punch: 'gooseneck-88', horns: true }), model, () => {}, false);
  expect(within(blades()).getByRole('note', { name: 'Horn sections' }).textContent).toMatch(
    /Half the punch's load \(250 kN\/m\)\.$/,
  );
});

it('the card: "Use horn sections at the ends" first, then "Shorten the punch to 356 mm"', () => {
  const { model } = tray();
  const onSession = vi.fn();
  panel(session(), model, onSession);
  const card = within(region()).getByRole('alert', { name: 'Collision' }).parentElement;
  const labels = within(card)
    .getAllByRole('button')
    .map((b) => b.textContent);
  expect(labels.slice(0, 2)).toEqual(['Use horn sections at the ends', 'Shorten the punch to 356 mm']);
  const horn = within(card).getByRole('button', { name: 'Use horn sections at the ends' });
  expect(horn.title).toBe('Tried with horn sections, the hit clears: the corners are pressed');
  act(() => fireEvent.click(horn));
  expect(onSession).toHaveBeenLastCalledWith({ horns: true, scrub: null });
  cleanup();
  // Walls 20 deep: the horn rises into the lip, no horn button.
  panel(session(), tray(15, 20).model);
  const deep = within(region()).getByRole('alert', { name: 'Collision' }).parentElement;
  expect(within(deep).queryByRole('button', { name: 'Use horn sections at the ends' })).toBeNull();
});

it('the side view’s caption gains "· horn sections"', () => {
  let listener = null;
  const { container } = render(<BrakeSideView subscribe={(fn) => ((listener = fn), () => {})} />);
  const pose = (patch) => ({
    window: { y0: -60, y1: 60, z0: -48, z1: 86 },
    tools: {},
    sheet: {
      outline: [
        [-50, 0],
        [50, 0],
        [50, 1.2],
        [-50, 1.2],
      ],
      breaks: [],
      thickness: 1.2,
    },
    context: [],
    finger: null,
    collision: null,
    angle: 0,
    target: 90,
    tipZ: 41.2,
    punch: 'Straight 88°',
    die: 'V8 88°',
    phase: null,
    flipped: false,
    ...patch,
  });
  const caption = () => container.querySelector('figcaption small').textContent;
  act(() => listener(pose()));
  expect(caption()).toBe('Straight 88° punch · V8 88° die');
  act(() => listener(pose({ horns: true })));
  expect(caption()).toBe('Straight 88° punch · V8 88° die · horn sections');
});

it('the sequence row of a step made with horns ends "· horn sections"', () => {
  const setup = tray();
  const station = brakeStation({ model: setup.model, session: session({ horns: true }) });
  const stroke = startStroke({ station, token: 't', id: 'flange' });
  const made = modelOf({ ...setup.feature, bends: [...setup.feature.bends, ...stroke.bends] }, setup.profile);
  panel(session({ mode: 'gauge', points: [], edge: null }), made);
  const steps = within(region()).getByRole('list', { name: 'Sequence' });
  expect(within(steps).getByRole('listitem', { name: 'Step 5' }).querySelector('small').textContent).toMatch(
    / · horn sections$/,
  );
  expect(within(steps).getByRole('listitem', { name: 'Step 4' }).textContent).not.toContain('horn sections');
});

// ---------------------------------------------------------------- PL-1.1: horn lengths (§4.8)
it('the Horn length select beside the box: its four horns, the standard as true, the note reading the chosen horn', () => {
  const { model } = tray();
  const onSession = vi.fn();
  panel(session(), model, onSession, false);
  expect(within(blades()).queryByRole('combobox', { name: 'Horn length' })).toBeNull();
  cleanup();
  panel(session({ horns: true }), model, onSession, false);
  const select = within(blades()).getByRole('combobox', { name: 'Horn length' });
  expect([...select.options].map((o) => o.textContent)).toEqual([
    '20 mm · 10 high (standard)',
    '25 mm · 10 high',
    '30 mm · 10 high',
    '55 mm · 45 high (special)',
  ]);
  expect(select.value).toBe('20');
  act(() => fireEvent.change(select, { target: { value: '30' } }));
  expect(onSession).toHaveBeenLastCalledWith({ horns: 30, scrub: null });
  act(() => fireEvent.change(select, { target: { value: '20' } }));
  expect(onSession).toHaveBeenLastCalledWith({ horns: true, scrub: null });
  cleanup();
  panel(session({ horns: 55 }), model, onSession, false);
  expect(within(blades()).getByRole('combobox', { name: 'Horn length' }).value).toBe('55');
  expect(checkbox().checked).toBe(true);
  expect(within(blades()).getByRole('note', { name: 'Horn sections' }).textContent).toBe(
    "The tip runs 55 mm past the punch body at each end, 45 mm high: it reaches under a lip. Half the punch's load (500 kN/m).",
  );
});

it('the card offers the 25 mm horn on lips 19, named in its sentence', () => {
  const { model } = tray(19);
  const onSession = vi.fn();
  panel(session(), model, onSession);
  const alert = within(region()).getByRole('alert', { name: 'Collision' });
  expect(alert.textContent).toContain('use 25 mm horn sections at the ends or shorten the punch to 356 mm.');
  const card = alert.parentElement;
  const button = within(card).getByRole('button', { name: 'Use 25 mm horn sections at the ends' });
  act(() => fireEvent.click(button));
  expect(onSession).toHaveBeenLastCalledWith({ horns: 25, scrub: null });
});

it('a step made with the 30 mm horn reads "· 30 mm horn sections"; the side view says the 55', () => {
  const setup = tray(22);
  const station = brakeStation({ model: setup.model, session: session({ horns: 30 }) });
  const stroke = startStroke({ station, token: 't', id: 'flange' });
  const made = modelOf({ ...setup.feature, bends: [...setup.feature.bends, ...stroke.bends] }, setup.profile);
  panel(session({ mode: 'gauge', points: [], edge: null }), made);
  const steps = within(region()).getByRole('list', { name: 'Sequence' });
  expect(within(steps).getByRole('listitem', { name: 'Step 5' }).querySelector('small').textContent).toMatch(
    / · 30 mm horn sections$/,
  );
  cleanup();
  let listener = null;
  const { container } = render(<BrakeSideView subscribe={(fn) => ((listener = fn), () => {})} />);
  act(() =>
    listener({
      window: { y0: -60, y1: 60, z0: -48, z1: 86 },
      tools: {},
      sheet: {
        outline: [
          [-50, 0],
          [50, 0],
          [50, 1.2],
          [-50, 1.2],
        ],
        breaks: [],
        thickness: 1.2,
      },
      context: [],
      finger: null,
      collision: null,
      angle: 0,
      target: 90,
      tipZ: 41.2,
      punch: 'Straight 88°',
      die: 'V8 88°',
      phase: null,
      flipped: false,
      horns: 55,
    }),
  );
  expect(container.querySelector('figcaption small').textContent).toBe(
    'Straight 88° punch · V8 88° die · 55 mm horn sections',
  );
});
