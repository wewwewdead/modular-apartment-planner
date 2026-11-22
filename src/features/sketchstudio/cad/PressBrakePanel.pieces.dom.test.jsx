// @vitest-environment jsdom
// The pieces on the line in the press brake's panel (docs/sketch-studio-piece-pick.md
// §5.5, PK-1): on the lip tray, one chip per piece (pressed while in the hit,
// a made piece tagged "bent 90°"), a chip's click puts its piece in or
// leaves it flat with no modifier, Every piece only when a piece is left flat
// that the line's default has in, and a chip pointed at or focused names its
// piece to the workspace.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import { brakePatch, brakeSessionDefaults, brakeStation, startStroke } from './brakeStation.js';
import { FAR_LIP_EDGE, FIRST_LIP_EDGE, lipTrayModel } from './piecePick.fixtures.js';

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
const stationOf = (model, s) => brakeStation({ model, session: s, advise: false });
const apply = (model, s, patch) => brakePatch(s, patch, stationOf(model, s));
const panel = (s, model = TRAY, { onSession = () => {}, onPieceHover = null } = {}) =>
  render(
    <PressBrakePanel
      station={stationOf(model, s)}
      session={s}
      onSession={onSession}
      onPieceHover={onPieceHover}
      onMachine={() => {}}
      onBend={() => {}}
      onLeave={() => {}}
      onScrub={() => {}}
      onRerun={() => {}}
      onMove={() => {}}
      onRemove={() => {}}
    />,
  );
const row = () => screen.getByRole('group', { name: 'Pieces on the line' });
const chips = () =>
  within(row())
    .getAllByRole('button')
    .filter((b) => !b.classList.contains('is-every'));
const every = () => within(row()).queryByRole('button', { name: 'Every piece' });
const lipLine = () => apply(TRAY, fresh(), { edge: FIRST_LIP_EDGE, distance: 15 });

it('one chip per piece, every one in; a click leaves that piece flat with no modifier, and puts it back', () => {
  const onSession = vi.fn();
  panel(lipLine(), TRAY, { onSession });
  expect(chips().map((c) => c.textContent)).toEqual(['1 · 82 mm', '2 · 522 mm', '3 · 82 mm']);
  expect(chips().map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true']);
  expect(within(row()).getByText(/^Click a piece on the sheet to bend only it\./).textContent).toBe(
    'Click a piece on the sheet to bend only it. The sheet comes to the punch; the punch and die keep their lengths.',
  );
  // Every piece is in: the button keeps its place, out of reach.
  expect(every()).toBe(null);
  expect(row().querySelector('.is-every.is-idle')).toBeTruthy();
  act(() => fireEvent.click(chips()[1]));
  expect(onSession).toHaveBeenLastCalledWith({ skip: [1], scrub: null });
  cleanup();
  panel({ ...lipLine(), skip: [1, 2] }, TRAY, { onSession });
  expect(chips().map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
  act(() => fireEvent.click(chips()[2]));
  expect(onSession).toHaveBeenLastCalledWith({ skip: [1], scrub: null });
  // The last piece in the hit stays in it.
  onSession.mockClear();
  act(() => fireEvent.click(chips()[0]));
  expect(onSession).not.toHaveBeenCalled();
  // Every piece: back to the line's default.
  act(() => fireEvent.click(every()));
  expect(onSession).toHaveBeenLastCalledWith({ skip: [], scrub: null });
});

it('a made piece is tagged bent, starts left flat, and Every piece leaves it so', () => {
  const lip = stationOf(TRAY, { ...lipLine(), skip: [1, 2] });
  const bent = lipTrayModel(startStroke({ station: lip, token: 't', id: 'lip1' }).bends);
  const onSession = vi.fn();
  const s = apply(bent, fresh(), { edge: FAR_LIP_EDGE, distance: 15 });
  panel(s, bent, { onSession });
  expect(chips().map((c) => c.textContent)).toEqual(['1 · 82 mm · bent 90°', '2 · 522 mm', '3 · 82 mm']);
  expect(chips().map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'true']);
  // The default leaves it flat: no Every piece.
  expect(every()).toBe(null);
  cleanup();
  panel({ ...s, skip: [0, 2] }, bent, { onSession });
  act(() => fireEvent.click(every()));
  expect(onSession).toHaveBeenLastCalledWith({ skip: [0], scrub: null });
});

it('pointing at or focusing a chip names its piece; leaving it lets go', () => {
  const onPieceHover = vi.fn();
  panel(lipLine(), TRAY, { onPieceHover });
  act(() => fireEvent.pointerEnter(chips()[2]));
  expect(onPieceHover).toHaveBeenLastCalledWith(2);
  act(() => fireEvent.pointerLeave(chips()[2]));
  expect(onPieceHover).toHaveBeenLastCalledWith(null);
  act(() => fireEvent.focus(chips()[0]));
  expect(onPieceHover).toHaveBeenLastCalledWith(0);
  act(() => fireEvent.blur(chips()[0]));
  expect(onPieceHover).toHaveBeenLastCalledWith(null);
  // The row going while a piece is named lets go of it.
  act(() => fireEvent.focus(chips()[1]));
  cleanup();
  expect(onPieceHover).toHaveBeenLastCalledWith(null);
});

it('no row for a line of one piece', () => {
  panel(apply(TRAY, fresh(), { edge: FIRST_LIP_EDGE, distance: 30 }));
  expect(screen.queryByRole('group', { name: 'Pieces on the line' })).toBe(null);
});
