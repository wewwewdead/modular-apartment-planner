// @vitest-environment jsdom
// The sheet slid under the punch on the panel and the card (docs/sketch-studio-
// sheet-slide.md §6.2, §6.3, §7): the Sheet slide field (the sheet's move,
// positive to the right) and Centre, the Length note per end, the three fix
// buttons ("Slide the sheet … to the left", "Centre the sheet", the collision
// card's "Centre the sheet under the punch") and the card's punch bar.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import FlatPatternMap from './FlatPatternMap.jsx';
import { brakePatch, brakeSessionDefaults, brakeStation } from './brakeStation.js';
import { flangedPanel, presetFace } from './panelMaker.js';
import { emptyModel } from './model.js';
import { FIRST_LIP_EDGE, lipTrayModel } from './piecePick.fixtures.js';

afterEach(() => cleanup());

const TRAY = lipTrayModel();
const fresh = () => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  mode: 'gauge',
  angle: 90,
});
const lipAlone = (extra = {}) => ({
  ...brakePatch(
    fresh(),
    { edge: FIRST_LIP_EDGE, distance: 15 },
    brakeStation({ model: TRAY, session: fresh(), advise: false }),
  ),
  skip: [1, 2],
  ...extra,
});
const panel = (s, model = TRAY, onSession = () => {}, advise = false) =>
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
const slideField = () => within(blades()).getByRole('spinbutton', { name: 'Sheet slide (mm)' });
const type = (input, text) => {
  act(() => fireEvent.keyDown(input, { key: text[0] }));
  act(() => fireEvent.change(input, { target: { value: text }, nativeEvent: { inputType: 'insertText' } }));
  act(() => fireEvent.keyDown(input, { key: 'Enter' }));
};

it('the field: the sheet’s move, positive to the right; Centre when off centre; the Length note per end', () => {
  const onSession = vi.fn();
  panel(lipAlone({ punchTrim: -9 }), TRAY, onSession);
  expect(slideField().value).toBe('0');
  expect(within(blades()).getByLabelText('Sheet slide note').textContent).toBe('centred');
  expect(within(blades()).queryByRole('button', { name: 'Centre' })).toBe(null);
  // 5 to the left: the session's slide along its line is −5 here.
  type(slideField(), '-5');
  expect(onSession).toHaveBeenLastCalledWith({ slide: -5, scrub: null });
  cleanup();
  panel(lipAlone({ punchTrim: -9, slide: -5 }), TRAY, onSession);
  expect(slideField().value).toBe('-5');
  expect(within(blades()).getByLabelText('Sheet slide note').textContent).toBe('to the left');
  expect(within(blades()).getByLabelText('Punch length note').textContent).toBe(
    '4 mm past the left, 14 mm past the right',
  );
  act(() => fireEvent.click(within(blades()).getByRole('button', { name: 'Centre' })));
  expect(onSession).toHaveBeenLastCalledWith({ slide: 0, scrub: null });
  cleanup();
  // No line: disabled.
  panel(fresh());
  expect(slideField().disabled).toBe(true);
});

it('the fix buttons: Slide the sheet 5 mm to the left; Centre the sheet; Centre the sheet under the punch', () => {
  const onSession = vi.fn();
  panel(lipAlone({ punchTrim: -9 }), TRAY, onSession);
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Slide the sheet 5 mm to the left' })));
  expect(onSession).toHaveBeenLastCalledWith({ slide: -5, scrub: null });
  cleanup();
  panel(lipAlone({ slide: -45 }), TRAY, onSession);
  // The refusal's (the warning of the ends says the same).
  act(() => fireEvent.click(within(region()).getAllByRole('button', { name: 'Centre the sheet' })[0]));
  expect(onSession).toHaveBeenLastCalledWith({ slide: 0, scrub: null });
  cleanup();
  // TL-1's tray, hit 3, punch 380 slid 12: the punch meets the standing side; centred it clears.
  const tray = flangedPanel({
    face: presetFace('rectangle', { width: 600, height: 400 }),
    thickness: 1.5,
    stock: 'spcc',
    flanges: [0, 1, 2, 3].map((edge) => ({ edge, depth: 50 })),
  });
  const feature = { ...tray.feature, bends: tray.feature.bends.slice(0, 2) };
  const model = {
    ...emptyModel(),
    sketches: [
      { id: feature.sketchId, name: 'Blank', plane: 'XY', profile: tray.profile, primitives: [], constrained: false },
    ],
    parts: [{ id: 'p', name: 'Tray', material: 'SPCC cold-rolled steel', features: [feature] }],
    instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
  };
  const third = tray.feature.bends[2];
  panel({ ...fresh(), mode: 'points', points: [third.a, third.b], punchTrim: 5.9, slide: 12 }, model, onSession, true);
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Centre the sheet under the punch' })));
  expect(onSession).toHaveBeenLastCalledWith({ slide: 0, scrub: null });
});

it('the card draws where the punch stands when it is not the fitted one centred', () => {
  const card = (s) => {
    const station = brakeStation({ model: TRAY, session: s, advise: false });
    const { container } = render(
      <FlatPatternMap station={station} session={s} onPickEdge={() => {}} onDistance={() => {}} onPoints={() => {}} />,
    );
    return [...container.querySelectorAll('line.cad-map-punch')].map((l) =>
      ['x1', 'y1', 'x2', 'y2'].map((k) => Math.round(Number(l.getAttribute(k)) * 1000) / 1000),
    );
  };
  expect(card(lipAlone())).toEqual([]);
  cleanup();
  const bars = card(lipAlone({ punchTrim: -9, slide: -5 }));
  expect(bars).toHaveLength(1);
  // On the flat blank y 11 – 111 (drawn −y), a little beside x = 410.
  const [x1, y1, x2, y2] = bars[0];
  expect([Math.min(-y1, -y2), Math.max(-y1, -y2)]).toEqual([11, 111]);
  expect(x1).toBe(x2);
  expect(Math.abs(x1 - 410)).toBeGreaterThan(1);
});
