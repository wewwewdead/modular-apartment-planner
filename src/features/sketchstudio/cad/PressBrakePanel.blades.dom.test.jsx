// @vitest-environment jsdom
// The press brake's blades on the panel (docs/sketch-studio-brake-flip-tooling.md
// §4, BT-1): the Blades row (Top: punch, Bottom: die, each a silhouette, its
// name and one fact), the picker (every punch or die as a card, whether this
// hit clears with it), the picker and the Machine and tooling selects as one
// source of truth, Reverse punch for the gooseneck, and the collision card's
// punch fix.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import { bladeOptions, brakeSessionDefaults, brakeStation } from './brakeStation.js';
import { emptyModel } from './model.js';
import { DIES, PUNCHES } from './shopCatalog.js';

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
// A U channel's blank: the 45 flange already up; the line 20 in from the right end.
const modelWith = (bends = [], width = 115) => ({
  ...emptyModel(),
  sketches: [
    {
      id: 's',
      name: 'Blank',
      plane: 'XY',
      profile: { type: 'rectangle', width, height: 60, origin: [0, 0] },
      primitives: [],
      constrained: false,
    },
  ],
  parts: [{ id: 'p', name: 'Channel', material: 'SPCC cold-rolled steel', features: [sheet(bends)] }],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
});
const FLANGE = { id: 'b1', a: [45, -1], b: [45, 61], angle: 90, direction: 'up', radius: null, punch: 'straight-88' };
const session = (patch = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  edge: 1,
  distance: 20,
  ...patch,
});
const panel = (s, model = modelWith([FLANGE]), onSession = () => {}, withOptions = true) =>
  render(
    <PressBrakePanel
      station={brakeStation({ model, session: s })}
      session={s}
      bladeOptions={withOptions ? (kind) => bladeOptions({ model, session: s, kind }) : null}
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
const top = () => within(blades()).getByRole('button', { name: /^Top: punch/ });
const bottom = () => within(blades()).getByRole('button', { name: /^Bottom: die/ });

it('shows the punch and the die in view, each with its silhouette, name and one fact', () => {
  panel(session(), modelWith());
  expect(top().textContent).toBe('Top: punchStraight 88°tip R0.8');
  expect(bottom().textContent).toBe('Bottom: dieV10 88°V 10 mm (automatic)');
  for (const button of [top(), bottom()]) {
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.querySelector('svg path').getAttribute('d')).toMatch(/^M .* Z$/);
  }
  // A straight punch is its own mirror image: no Reverse punch.
  expect(within(region()).queryByRole('checkbox', { name: 'Reverse punch' })).toBeNull();
  // The Blades row sits after the angle and Bend shape, before Machine and tooling.
  const order = [
    within(region()).getByLabelText('Bend angle (°)'),
    within(region()).getByRole('group', { name: 'Bend shape' }),
    blades(),
    document.querySelector('details.cad-shop-tooling'),
  ];
  for (let i = 1; i < order.length; i++)
    expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('opens the punch picker: every punch as a card, whether this hit clears with it, and chooses one', () => {
  const onSession = vi.fn();
  panel(session(), modelWith([FLANGE]), onSession);
  act(() => fireEvent.click(top()));
  expect(top().getAttribute('aria-expanded')).toBe('true');
  const picker = within(region()).getByRole('region', { name: 'Punches' });
  const cards = within(picker)
    .getAllByRole('button')
    .filter((b) => b.classList.contains('cad-blade-card'));
  expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual(Object.values(PUNCHES).map((p) => p.name));
  // One common scale: every silhouette in the same view box.
  expect(new Set(cards.map((c) => c.querySelector('svg').getAttribute('viewBox'))).size).toBe(1);
  const card = (name) => within(picker).getByRole('button', { name });
  expect(card('Straight 88°').getAttribute('aria-pressed')).toBe('true');
  expect(card('Straight 88°').textContent).toContain('88° · tip R0.8 · H 66.5 · 1000 kN/m');
  expect(card('Straight 88°').textContent).toContain('Everyday bends.');
  expect(card('Straight 88°').querySelector('.cad-blade-verdict').textContent).toMatch(
    /^Refused: the part hits the punch at [\d.]+°\.$/,
  );
  expect(card('Gooseneck 88°').textContent).toContain('88° · tip R0.8 · H 104.5 · 500 kN/m');
  expect(card('Gooseneck 88°').textContent).toContain('A flange already standing that would hit a straight punch');
  expect(card('Gooseneck 88°').querySelector('.cad-blade-verdict').textContent).toBe('Clears this hit');
  expect(card('Radius R30').textContent).toContain('nose R30 · H 157.4 · 1300 kN/m');
  // A refused tool stays choosable.
  expect(card('Straight 88° sharp').disabled).toBe(false);
  act(() => fireEvent.click(card('Gooseneck 88°')));
  expect(onSession).toHaveBeenLastCalledWith({ punch: 'gooseneck-88', scrub: null });
  expect(within(region()).queryByRole('region', { name: 'Punches' })).toBeNull();
  // A radius punch from the picker is Round · Radius punch, as from the select (round-bend spec §12.6).
  act(() => fireEvent.click(top()));
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Radius R20' })));
  expect(onSession).toHaveBeenLastCalledWith({ punch: 'radius-20', shape: 'round', die: null, scrub: null });
});

it('opens the die picker with Automatic first; Close shuts it', () => {
  const onSession = vi.fn();
  panel(session(), modelWith([FLANGE]), onSession);
  act(() => fireEvent.click(bottom()));
  const picker = within(region()).getByRole('region', { name: 'Dies' });
  const names = within(picker)
    .getAllByRole('button')
    .filter((b) => b.classList.contains('cad-blade-card'))
    .map((c) => c.getAttribute('aria-label'));
  expect(names).toEqual(['Automatic (V10 88°)', ...Object.values(DIES).map((d) => d.name)]);
  const automatic = within(picker).getByRole('button', { name: 'Automatic (V10 88°)' });
  expect(automatic.getAttribute('aria-pressed')).toBe('true');
  expect(within(picker).getByRole('button', { name: 'V25 88°' }).textContent).toContain(
    'Refused: The flange is 20 mm from the punch line in the flat; the V25 88° die needs 20.68 mm to carry it on both shoulders.',
  );
  act(() => fireEvent.click(within(picker).getByRole('button', { name: 'V8 88°' })));
  expect(onSession).toHaveBeenLastCalledWith({ die: 'v8-88', scrub: null });
  act(() => fireEvent.click(bottom()));
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Close' })));
  expect(within(region()).queryByRole('region', { name: 'Dies' })).toBeNull();
  expect(bottom().getAttribute('aria-expanded')).toBe('false');
});

it('never disagrees with the Machine and tooling selects: both read and write the session', () => {
  const onSession = vi.fn();
  panel(session({ punch: 'gooseneck-88', die: 'v12-88' }), modelWith([FLANGE]), onSession);
  expect(within(region()).getByLabelText('Punch').value).toBe('gooseneck-88');
  expect(within(region()).getByLabelText('Die').value).toBe('v12-88');
  expect(top().textContent).toBe('Top: punchGooseneck 88°tip R0.8');
  expect(bottom().textContent).toBe('Bottom: dieV12 88°V 12 mm');
  act(() => fireEvent.click(top()));
  expect(within(region()).getByRole('button', { name: 'Gooseneck 88°' }).getAttribute('aria-pressed')).toBe('true');
  expect(within(region()).getByRole('button', { name: 'Straight 88°' }).getAttribute('aria-pressed')).toBe('false');
  // The select's change is the picker's patch (brakeStation.js punchChoice), without the scrub.
  act(() => fireEvent.change(within(region()).getByLabelText('Punch'), { target: { value: 'gooseneck-88-deep' } }));
  expect(onSession).toHaveBeenLastCalledWith({ punch: 'gooseneck-88-deep' });
});

it('shows Reverse punch for the gooseneck: the silhouette and the summary turn round with it', () => {
  const onSession = vi.fn();
  panel(session({ punch: 'gooseneck-88' }), modelWith([FLANGE]), onSession);
  const reverse = within(region()).getByRole('checkbox', { name: 'Reverse punch' });
  expect(reverse.checked).toBe(false);
  const drawn = top().querySelector('svg path').getAttribute('d');
  act(() => fireEvent.click(reverse));
  expect(onSession).toHaveBeenLastCalledWith({ reverse: true, scrub: null });
  cleanup();
  panel(session({ punch: 'gooseneck-88', reverse: true }), modelWith([FLANGE]), onSession);
  expect(within(region()).getByRole('checkbox', { name: 'Reverse punch' }).checked).toBe(true);
  expect(top().textContent).toBe('Top: punchGooseneck 88°tip R0.8 · reversed');
  expect(top().querySelector('svg path').getAttribute('d')).not.toBe(drawn);
  expect(document.querySelector('details.cad-shop-tooling summary small').textContent).toBe(
    '50 t × 2 m press brake · Gooseneck 88° punch (reversed) · V10 88° (automatic) die',
  );
  // Throat to the backgauge, the standing flange meets the neck; the card turns it round in one click.
  const card = within(region()).getByRole('alert', { name: 'Collision' });
  expect(card.textContent).toMatch(/the part hits the punch/);
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Turn the punch round' })));
  expect(onSession).toHaveBeenLastCalledWith({ punch: 'gooseneck-88', reverse: false, scrub: null });
});

it('offers the gooseneck on the collision card when this hit clears with it', () => {
  const onSession = vi.fn();
  panel(session(), modelWith([FLANGE]), onSession);
  expect(within(region()).getByRole('alert', { name: 'Collision' }).textContent).toMatch(
    /^Bend 2: the part hits the punch at [\d.]+°\. Bend this one earlier \(before the flange in the way\), or use the gooseneck punch\. Turning the sheet around was tried: it does not clear\.$/,
  );
  expect(within(region()).getByRole('button', { name: 'Bend' }).disabled).toBe(true);
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Use the gooseneck punch' })));
  expect(onSession).toHaveBeenLastCalledWith({ punch: 'gooseneck-88', reverse: false, scrub: null });
  cleanup();
  // With the gooseneck the hit clears: no card, the pedal ready.
  panel(session({ punch: 'gooseneck-88' }), modelWith([FLANGE]), onSession);
  expect(within(region()).queryByRole('alert', { name: 'Collision' })).toBeNull();
  expect(within(region()).getByRole('status', { name: 'Collision check' }).textContent).toMatch(/^Clear through/);
  expect(within(region()).getByRole('button', { name: 'Bend' }).disabled).toBe(false);
});

it('offers no punch when the hit does not clear with it', () => {
  // The web of a tray between two standing flanges: one swings in from each side.
  const tray = modelWith(
    [
      { id: 'b1', a: [20, -1], b: [20, 61], angle: 90, direction: 'up', radius: null },
      { id: 'b2', a: [75, -1], b: [75, 61], angle: 90, direction: 'up', radius: null },
    ],
    100,
  );
  panel(session({ edge: 3, distance: 47.5 }), tray);
  expect(within(region()).getByRole('alert', { name: 'Collision' }).textContent).toMatch(/hits the punch/);
  expect(within(region()).queryByRole('button', { name: /^Use the/ })).toBeNull();
});

it('lists the cards without verdicts until a hit is pending', () => {
  panel(session({ edge: null }), modelWith(), () => {}, false);
  act(() => fireEvent.click(top()));
  const picker = within(region()).getByRole('region', { name: 'Punches' });
  expect(picker.querySelector('.cad-blade-verdict')).toBeNull();
  expect(picker.textContent).toContain('Pick the punch line and each card says whether this hit clears with it.');
});
