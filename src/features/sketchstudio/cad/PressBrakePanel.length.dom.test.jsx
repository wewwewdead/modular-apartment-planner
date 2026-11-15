// @vitest-environment jsdom
// The punch and die length on the panel (docs/sketch-studio-brake-tool-length.md
// §3.4, §3.5, TL-1): one line under each blade, always in view — Length
// [391.8] mm · fitted for one tooling run, typed or stepped (Enter / blur
// commit the trim per end), emptied or Fit to bend back to fitted; Shorter [0] mm at
// each end for several runs; the collision card's length fix; the sequence
// naming a custom length.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import { brakeSessionDefaults, brakeStation, startStroke } from './brakeStation.js';
import { flangedPanel, presetFace } from './panelMaker.js';
import { emptyModel } from './model.js';

afterEach(() => cleanup());

const modelOf = (feature, profile) => ({
  ...emptyModel(),
  sketches: [{ id: feature.sketchId, name: 'Blank', plane: 'XY', profile, primitives: [], constrained: false }],
  parts: [{ id: 'p', name: 'Tray', material: 'SPCC cold-rolled steel', features: [feature] }],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
});
// The spec's tray (§2): 600 × 400, flanges 50, the two long ones made; the line on a short edge.
const panelTray = flangedPanel({
  face: presetFace('rectangle', { width: 600, height: 400 }),
  thickness: 1.5,
  stock: 'spcc',
  flanges: [0, 1, 2, 3].map((edge) => ({ edge, depth: 50 })),
});
const trayFeature = { ...panelTray.feature, bends: panelTray.feature.bends.slice(0, 2) };
const TRAY = modelOf(trayFeature, panelTray.profile);
const LINE = [panelTray.feature.bends[2].a, panelTray.feature.bends[2].b];
const session = (patch = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  mode: 'points',
  points: LINE,
  ...patch,
});
const panel = (s, model = TRAY, onSession = () => {}, advise = true) =>
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
const field = (name) => within(blades()).getByRole('spinbutton', { name });
const note = (name) => within(blades()).getByLabelText(name);
const fit = (kind) => within(blades()).queryByRole('button', { name: `Fit the ${kind} to the bend` });
const type = (input, text) => {
  act(() => fireEvent.keyDown(input, { key: text[0] }));
  act(() => fireEvent.change(input, { target: { value: text }, nativeEvent: { inputType: 'insertText' } }));
};

it('shows the fitted length under each blade, with no line picked too', () => {
  panel(session());
  expect(field('Punch length').value).toBe('391.8');
  expect(field('Die length').value).toBe('391.8');
  expect(note('Punch length note').textContent).toBe('fitted');
  expect(note('Die length note').textContent).toBe('fitted');
  // Fit to bend is kept in place but out of reach while fitted (the row never moves).
  expect(fit('punch')).toBeNull();
  expect(document.querySelectorAll('.cad-blade-fit.is-idle')).toHaveLength(2);
  cleanup();
  panel(session({ mode: 'gauge', points: [], edge: null }));
  expect(field('Punch length').disabled).toBe(true);
  expect(field('Punch length').value).toBe('');
  expect(note('Punch length note').textContent).toBe('fitted to the bend');
});

it('typing a length sets the trim per end on Enter; emptying the field goes back to fitted', () => {
  const onSession = vi.fn();
  panel(session(), TRAY, onSession);
  const input = field('Punch length');
  type(input, '380');
  // Nothing is committed while typing.
  expect(onSession).not.toHaveBeenCalled();
  act(() => fireEvent.keyDown(input, { key: 'Enter' }));
  expect(onSession).toHaveBeenLastCalledWith({ punchTrim: 5.9, scrub: null });
  // A longer die: past each end; blur commits too.
  const die = field('Die length');
  type(die, '400');
  act(() => fireEvent.blur(die));
  expect(onSession).toHaveBeenLastCalledWith({ dieTrim: -4.1, scrub: null });
  cleanup();
  panel(session({ punchTrim: 5.9 }), TRAY, onSession);
  type(field('Punch length'), '');
  act(() => fireEvent.keyDown(field('Punch length'), { key: 'Enter' }));
  expect(onSession).toHaveBeenLastCalledWith({ punchTrim: null, scrub: null });
});

it('shows a custom length, its note and the warning card; Fit to bend puts it back', () => {
  const onSession = vi.fn();
  panel(session({ punchTrim: 5.9 }), TRAY, onSession);
  expect(field('Punch length').value).toBe('380');
  expect(note('Punch length note').textContent).toBe('5.9 mm short at each end');
  expect(within(region()).getByText(/^The punch stops 5\.9 mm short of each end of the bend/)).toBeTruthy();
  expect(within(region()).getByRole('button', { name: 'Bend' }).disabled).toBe(false);
  act(() => fireEvent.click(fit('punch')));
  expect(onSession).toHaveBeenLastCalledWith({ punchTrim: null, scrub: null });
  cleanup();
  panel(session({ dieTrim: -4.1 }), TRAY, onSession, false);
  expect(field('Die length').value).toBe('400');
  expect(note('Die length note').textContent).toBe('4.1 mm past each end');
});

it('offers Fit the punch to the bend on the collision card when a longer punch meets the sides', () => {
  const onSession = vi.fn();
  panel(session({ punchTrim: -4.1 }), TRAY, onSession);
  const card = within(region()).getByRole('alert', { name: 'Collision' });
  expect(card.textContent).toMatch(
    /as the ram comes down\. Bend this one earlier \(.+\), or fit the punch to the bend\./,
  );
  expect(within(region()).getByRole('button', { name: 'Bend' }).disabled).toBe(true);
  // The card's button (the Blades row's Fit to bend is the other one).
  const buttons = within(region()).getAllByRole('button', { name: /Fit the punch to the bend|^Fit the punch/ });
  const onCard = buttons.find((b) => card.parentElement.contains(b));
  expect(onCard.textContent).toBe('Fit the punch to the bend');
  act(() => fireEvent.click(onCard));
  expect(onSession).toHaveBeenLastCalledWith({ punchTrim: null, scrub: null });
});

it('offers Shorten the punch to … when the contact is a return lip at the punch ends', () => {
  // §4 item 6's tray (brakeToolLength.test.js): return lips over the punch's ends.
  const [H, W, S] = [60, 15, 40];
  const L = 2 + H + W;
  const profile = {
    type: 'polygon',
    points: [
      [6, -L],
      [594, -L],
      [594, 6],
      [600 + S, 6],
      [600 + S, 394],
      [594, 394],
      [594, 400 + L],
      [6, 400 + L],
      [6, 394],
      [-S, 394],
      [-S, 6],
      [6, 6],
    ],
  };
  const bend = (id, a, b, punch) => ({ id, a, b, angle: 90, direction: 'up', radius: null, punch });
  const feature = {
    id: 'sm',
    type: 'sheetmetal',
    sketchId: 's',
    thickness: 1.5,
    stock: 'spcc',
    kFactor: null,
    base: null,
    marks: [],
    bends: [
      bend('lip1', [5, 2 - H], [595, 2 - H], 'straight-88'),
      bend('lip2', [595, 398 + H], [5, 398 + H], 'straight-88'),
      bend('long1', [5, 2], [595, 2], 'gooseneck-88'),
      bend('long2', [595, 398], [5, 398], 'gooseneck-88'),
    ],
  };
  const model = modelOf(feature, profile);
  const onSession = vi.fn();
  const s = session({
    points: [
      [598, 5],
      [598, 395],
    ],
  });
  panel(s, model, onSession);
  expect(field('Punch length').value).toBe('388');
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Shorten the punch to 348 mm' })));
  expect(onSession).toHaveBeenLastCalledWith({ punchTrim: 20, scrub: null });
  cleanup();
  // Made with it: the sequence names the 348 mm punch.
  const station = brakeStation({ model, session: { ...s, punchTrim: 20 } });
  const stroke = startStroke({ station, token: 't', id: 'short' });
  const made = modelOf({ ...feature, bends: [...feature.bends, ...stroke.bends] }, profile);
  panel(session({ mode: 'gauge', points: [], edge: null }), made);
  const steps = within(region()).getByRole('list', { name: 'Sequence' });
  expect(within(steps).getByRole('listitem', { name: 'Step 5' }).textContent).toContain(
    'Straight 88° punch, 348 mm · v10-88',
  );
  expect(within(steps).getByRole('listitem', { name: 'Step 4' }).textContent).not.toContain('punch,');
});

it('words several tooling runs as sections, the field the trim per end', () => {
  const profile = {
    type: 'polygon',
    points: [
      [0, 0],
      [95, 0],
      [95, 60],
      [105, 60],
      [105, 0],
      [195, 0],
      [195, 60],
      [205, 60],
      [205, 0],
      [300, 0],
      [300, 100],
      [0, 100],
    ],
  };
  const feature = { id: 'sm', type: 'sheetmetal', sketchId: 's', thickness: 1.5, stock: 'spcc', bends: [] };
  const model = modelOf(feature, profile);
  const onSession = vi.fn();
  const s = session({
    points: [
      [-1, 30],
      [301, 30],
    ],
    skip: [1],
  });
  panel(s, model, onSession, false);
  // "Shorter [0] mm" over "at each end · 2 sections" (the column is too narrow for one line).
  expect(within(blades()).getAllByText(/^Shorter/)).toHaveLength(2);
  expect(field('Punch length').value).toBe('0');
  expect(note('Punch length note').textContent).toBe('at each end · 2 sections, fitted');
  type(field('Punch length'), '5');
  act(() => fireEvent.keyDown(field('Punch length'), { key: 'Enter' }));
  expect(onSession).toHaveBeenLastCalledWith({ punchTrim: 5, scrub: null });
  cleanup();
  panel({ ...s, punchTrim: 5 }, model, onSession, false);
  expect(field('Punch length').value).toBe('5');
  expect(note('Punch length note').textContent).toBe('at each end · 2 sections');
  expect(fit('punch')).not.toBeNull();
});
