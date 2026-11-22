// @vitest-environment jsdom
// The flat-blank card's punch-line drag (docs/state-machines.md rules 4 and
// 6): it ends on release, on a lost pointer (pointercancel, lost capture), on
// the window losing focus and on a move with no button held; Escape puts the
// line back as it was before the drag in one patch, as the backgauge
// fingers' drag in the viewport does, and the brake's own Escape waits. The
// pieces of the line (docs/sketch-studio-piece-pick.md §5.6): a click bends
// only that one, Ctrl / Shift / Meta adds or leaves out, a drag is no click.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import FlatPatternMap from './FlatPatternMap.jsx';
import { brakeSessionDefaults, brakeStation } from './brakeStation.js';
import { fingerRestore } from './brakeHands.js';
import { emptyModel } from './model.js';
import { FIRST_LIP_EDGE, lipTrayModel } from './piecePick.fixtures.js';

afterEach(() => cleanup());

const model = {
  ...emptyModel(),
  sketches: [
    {
      id: 's',
      name: 'Blank',
      plane: 'XY',
      profile: { type: 'rectangle', width: 300, height: 100, origin: [0, 0] },
      primitives: [],
      constrained: false,
    },
  ],
  parts: [
    {
      id: 'p',
      name: 'Plate',
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
          bends: [],
        },
      ],
    },
  ],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
};
const session = {
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  edge: 1,
  distance: 50,
};
const station = brakeStation({ model, session });

function mapped() {
  const onDistance = vi.fn();
  const { container } = render(
    <FlatPatternMap
      station={station}
      session={session}
      onPickEdge={() => {}}
      onDistance={onDistance}
      onPoints={() => {}}
    />,
  );
  // The card's view box is [−26, −126, 352, 152]: at one pixel per mm a flat
  // point (x, y) is at the client point (x + 26, 126 − y).
  const svg = container.querySelector('svg');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 352, height: 152, right: 352, bottom: 152 });
  const line = within(screen.getByRole('figure', { name: 'Flat blank' })).getByLabelText('Punch line');
  // The client point `d` mm in from the gauge edge, half way along it.
  const at = (d) => {
    const { a, b, inward } = station.edge;
    const x = (a[0] + b[0]) / 2 + inward[0] * d,
      y = (a[1] + b[1]) / 2 + inward[1] * d;
    return { clientX: x + 26, clientY: 126 - y };
  };
  const down = () => act(() => fireEvent.pointerDown(line, { ...at(50), button: 0, buttons: 1, pointerId: 1 }));
  const move = (d, buttons = 1) => act(() => fireEvent.pointerMove(svg, { ...at(d), buttons, pointerId: 1 }));
  return { onDistance, svg, line, down, move };
}

it('drags the punch line: each new L goes once, and a release ends the drag', () => {
  const { onDistance, svg, down, move } = mapped();
  expect(station.edge).toBeTruthy();
  down();
  move(60);
  expect(onDistance).toHaveBeenLastCalledWith(60, { stop: null, dragFrom: fingerRestore(session) });
  move(72.5);
  expect(onDistance).toHaveBeenLastCalledWith(72.5, { stop: null, dragFrom: fingerRestore(session) });
  act(() => fireEvent.pointerUp(svg, { button: 0, pointerId: 1 }));
  move(90);
  expect(onDistance).toHaveBeenCalledTimes(2);
});

it('ends the drag on a move with no button held (the release was lost)', () => {
  const { onDistance, down, move } = mapped();
  down();
  move(60);
  move(70, 0);
  move(80);
  expect(onDistance).toHaveBeenCalledTimes(1);
  expect(onDistance).toHaveBeenLastCalledWith(60, { stop: null, dragFrom: fingerRestore(session) });
});

it('ends the drag on pointercancel, on lost capture and on the window losing focus', () => {
  for (const lose of [
    (svg) => fireEvent.pointerCancel(svg, { pointerId: 1 }),
    (svg, line) => fireEvent.lostPointerCapture(line, { pointerId: 1 }),
    () => fireEvent.blur(window),
  ]) {
    const { onDistance, svg, line, down, move } = mapped();
    down();
    move(60);
    act(() => lose(svg, line));
    move(80);
    expect(onDistance).toHaveBeenCalledTimes(1);
    cleanup();
  }
});

it('Escape puts the line back as it was before the drag, in one patch, and the brake’s Escape waits', () => {
  const { onDistance, down, move } = mapped();
  down();
  move(60);
  move(75);
  const brakeEscape = vi.fn((event) => event.defaultPrevented);
  window.addEventListener('keydown', brakeEscape);
  act(() => fireEvent.keyDown(window, { key: 'Escape' }));
  window.removeEventListener('keydown', brakeEscape);
  expect(onDistance).toHaveBeenCalledTimes(3);
  const restore = fingerRestore(session);
  expect(onDistance).toHaveBeenLastCalledWith(restore.distance, restore);
  // The workspace's brake keys see the Escape taken.
  expect(brakeEscape.mock.results[0].value).toBe(true);
  // Over: later moves send nothing, and another Escape is the brake's.
  move(90);
  act(() => fireEvent.keyDown(window, { key: 'Escape' }));
  expect(onDistance).toHaveBeenCalledTimes(3);
});

it('Escape on a press that never moved ends it without a patch', () => {
  const { onDistance, down, move } = mapped();
  down();
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
  act(() => window.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  move(60);
  expect(onDistance).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------- the pieces (docs/sketch-studio-piece-pick.md §5.6)
// The lip tray at the first lip's edge, L 15: three pieces on the line x = 410.
const lipSession = { ...session, edge: FIRST_LIP_EDGE, distance: 15 };
const lipStation = brakeStation({ model: lipTrayModel(), session: lipSession, advise: false });
function pieces(extra = {}) {
  const onPiece = vi.fn();
  const onDistance = vi.fn();
  const { container } = render(
    <FlatPatternMap
      station={lipStation}
      session={lipSession}
      onPickEdge={() => {}}
      onDistance={onDistance}
      onPoints={() => {}}
      onPiece={onPiece}
      {...extra}
    />,
  );
  // The view box is [−61.52, −805.52, 651.04, 867.04]: one pixel per mm.
  const svg = container.querySelector('svg');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 651.04, height: 867.04, right: 651.04, bottom: 867.04 });
  const piece = (n) =>
    within(screen.getByRole('figure', { name: 'Flat blank' })).getByRole('button', { name: `Piece ${n} of 3` });
  return { onPiece, onDistance, svg, piece };
}

it('a piece clicked: bend only it; with Ctrl, Shift or Meta: into the hit or left flat', () => {
  const { onPiece, piece } = pieces();
  expect([1, 2, 3].map((n) => piece(n).getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true']);
  act(() => fireEvent.click(piece(1)));
  expect(onPiece).toHaveBeenLastCalledWith(0, { add: false });
  for (const key of ['ctrlKey', 'shiftKey', 'metaKey']) {
    act(() => fireEvent.click(piece(2), { [key]: true }));
    expect(onPiece).toHaveBeenLastCalledWith(1, { add: true });
  }
  expect(onPiece).toHaveBeenCalledTimes(4);
});

it('a pointer click keeps its modifier keys through the nearest-line pick', () => {
  const { onPiece, piece } = pieces();
  // A real click (detail 1) on the far lip's middle (x 410, y 678): client (471.52, 127.52).
  act(() => fireEvent.click(piece(3), { detail: 1, clientX: 471.52, clientY: 127.52, ctrlKey: true }));
  expect(onPiece).toHaveBeenLastCalledWith(2, { add: true });
});

it('a drag of the punch line that starts on a piece is not a click on it', () => {
  const { onPiece, onDistance, svg, piece } = pieces();
  act(() => fireEvent.pointerDown(piece(2), { clientX: 471.52, clientY: 433.52, button: 0, buttons: 1, pointerId: 1 }));
  // L 20: the line at x = 405.
  act(() => fireEvent.pointerMove(svg, { clientX: 466.52, clientY: 433.52, buttons: 1, pointerId: 1 }));
  expect(onDistance).toHaveBeenLastCalledWith(20, { stop: null, dragFrom: fingerRestore(lipSession) });
  act(() => fireEvent.pointerUp(svg, { button: 0, pointerId: 1 }));
  act(() => fireEvent.click(piece(2)));
  expect(onPiece).not.toHaveBeenCalled();
  // The next click is one.
  act(() => fireEvent.click(piece(2)));
  expect(onPiece).toHaveBeenCalledWith(1, { add: false });
});

it('a piece left flat keeps its look; the piece the panel names is drawn lit', () => {
  const flat = brakeStation({ model: lipTrayModel(), session: { ...lipSession, skip: [1, 2] }, advise: false });
  const { piece } = pieces({ station: flat, session: { ...lipSession, skip: [1, 2] }, litPiece: 2 });
  expect([1, 2, 3].map((n) => piece(n).getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
  expect([1, 2, 3].map((n) => piece(n).classList.contains('is-skipped'))).toEqual([false, true, true]);
  expect([1, 2, 3].map((n) => piece(n).classList.contains('is-lit'))).toEqual([false, false, true]);
});
