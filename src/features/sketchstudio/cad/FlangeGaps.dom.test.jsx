// @vitest-environment jsdom
// The flange gaps card (docs/sketch-studio-corner-gaps.md §3.2): one line
// always in sight, the rows nearest first in a disclosure (open while a gap is
// under 1 mm, the user's own toggle remembered), a warning card per overlap,
// the flat blank with every row's edge marked, a hovered row handed to
// onHover; nothing at all for a part with nothing to read. And where it shows
// (§3.3): the Sheet metal panel and the press brake's panel, the brake's read
// from the part as made, whatever line is picked.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import FlangeGaps from './FlangeGaps.jsx';
import { SheetMetalForm } from './ShopPanels.jsx';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import FlatPatternMap from './FlatPatternMap.jsx';
import { USER_TRAY_FEATURE, USER_TRAY_PROFILE, lCorner } from './cornerGaps.fixtures.js';
import { foldSheet } from './sheetMetal.js';
import { brakeSessionDefaults, brakeStation } from './brakeStation.js';
import { emptyModel } from './model.js';

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

const PARAMS = {};
const trayFold = foldSheet(USER_TRAY_FEATURE, USER_TRAY_PROFILE, {});
const card = (props) => render(<FlangeGaps fold={trayFold} profile={USER_TRAY_PROFILE} params={PARAMS} {...props} />);
const summary = () => screen.getByLabelText('Flange gaps summary');
const list = () => screen.getByRole('list', { name: 'Flange gaps, nearest first' });
const items = () => within(list()).getAllByRole('listitem');
const details = () => document.querySelector('details.cad-gaps-rows');

it("shows the least gap, the rows nearest first and every row's edge on the flat blank", () => {
  card();
  expect(summary().textContent).toBe('Flange gaps: least 0.72 mm · 12 within 3 mm');
  // A gap under 1 mm: the rows are open.
  expect(details().open).toBe(true);
  expect(items()).toHaveLength(12);
  expect(items()[0].textContent).toBe(
    'Bend 7 flange, end → bend 5 flange, inside face0.72 mm · passes 1.22 mm beside it',
  );
  expect(items()[0].getAttribute('aria-label')).toBe(
    'Bend 7 flange, end → bend 5 flange, inside face: 0.72 mm · passes 1.22 mm beside it',
  );
  expect(items().at(-1).textContent).toBe('Bend 1 flange ↔ bend 3 flange, edge to edge1.35 mm');
  const map = screen.getByRole('img', { name: 'Flange gaps on the flat blank' });
  expect(map.querySelectorAll('.cad-gaps-edge')).toHaveLength(12);
  // A mitre row marks both its edges.
  expect(map.querySelectorAll('.cad-gaps-edge line')).toHaveLength(16);
  expect(map.querySelectorAll('.cad-gaps-bend')).toHaveLength(8);
  expect(screen.queryByRole('note', { name: 'Overlap' })).toBeNull();
});

it('hands a hovered or focused row to onHover and draws its edge in the accent', () => {
  const onHover = vi.fn();
  card({ onHover });
  const first = items()[0];
  fireEvent.pointerEnter(first);
  const row = onHover.mock.calls.at(-1)[0];
  expect(row.gap).toBeCloseTo(0.717, 3);
  expect(row.at).toHaveLength(2);
  expect(first.classList.contains('is-hot')).toBe(true);
  const hot = document.querySelectorAll('.cad-gaps-edge.is-hot');
  expect(hot).toHaveLength(1);
  expect(hot[0].dataset.key).toBe(row.key);
  // Drawn last, over the other edges.
  expect(document.querySelector('.cad-gaps-map').lastElementChild).toBe(hot[0]);
  fireEvent.pointerLeave(first);
  expect(onHover).toHaveBeenLastCalledWith(null);
  expect(document.querySelectorAll('.cad-gaps-edge.is-hot')).toHaveLength(0);
  act(() => items()[3].focus());
  expect(items()[3].getAttribute('aria-label')).toMatch(
    new RegExp(`: ${onHover.mock.calls.at(-1)[0].gap.toFixed(2)} mm`),
  );
  act(() => items()[3].blur());
  expect(onHover).toHaveBeenLastCalledWith(null);
});

it('hands the hovered row on as the part is read again, and lets go when it goes away', () => {
  const onHover = vi.fn();
  const { rerender, unmount } = card({ onHover });
  fireEvent.pointerEnter(items()[0]);
  const before = onHover.mock.calls.at(-1)[0];
  // The same part folded again (a new object): the same row, as it reads now.
  const again = foldSheet(USER_TRAY_FEATURE, USER_TRAY_PROFILE, {});
  rerender(<FlangeGaps fold={again} profile={USER_TRAY_PROFILE} params={PARAMS} onHover={onHover} />);
  const after = onHover.mock.calls.at(-1)[0];
  expect(after).not.toBe(before);
  expect(after.key).toBe(before.key);
  unmount();
  expect(onHover).toHaveBeenLastCalledWith(null);
});

it('warns of an overlap with a card, the row first', () => {
  const { feature, profile } = lCorner({ gap: -0.3 });
  render(<FlangeGaps fold={foldSheet(feature, profile, {})} profile={profile} params={PARAMS} />);
  expect(summary().textContent).toBe('Flange gaps: least 0.00 mm · 3 within 3 mm');
  const overlap = screen.getByRole('note', { name: 'Overlap' });
  expect(overlap.textContent).toBe(
    "Bend 1's flange runs 0.30 mm into bend 2's flange. Real sheet cannot: give that gap 0 mm or more.",
  );
  expect(overlap.querySelector('strong').textContent).toBe("Bend 1's flange runs 0.30 mm into bend 2's flange.");
  expect(items()[0].textContent).toBe('Bend 1 flange, end → bend 2 flange, inside faceruns 0.30 mm into it');
  expect(items()[0].classList.contains('is-overlap')).toBe(true);
  expect(document.querySelectorAll('.cad-gaps-edge.is-overlap')).toHaveLength(1);
});

it("keeps the rows closed when nothing is near, and remembers the user's own toggle", () => {
  const { feature, profile } = lCorner({ cover: true });
  const fold = foldSheet(feature, profile, {});
  const { unmount } = render(<FlangeGaps fold={fold} profile={profile} params={PARAMS} />);
  expect(summary().textContent).toBe('Flange gaps: least 2.87 mm · 3 within 3 mm');
  expect(details().open).toBe(false);
  // The covering row reads by the far face, last.
  expect(items().at(-1).textContent).toBe(
    'Bend 1 flange, end → bend 2 flange, inside faceruns past its end: flush with its outside face',
  );
  details().open = true;
  fireEvent(details(), new Event('toggle'));
  expect(window.localStorage.getItem('cad-shop-numbers:gaps')).toBe('open');
  unmount();
  render(<FlangeGaps fold={fold} profile={profile} params={PARAMS} />);
  expect(details().open).toBe(true);
  cleanup();
  window.localStorage.setItem('cad-shop-numbers:gaps', 'closed');
  card();
  expect(details().open).toBe(false);
});

it('says nothing for a part with nothing to read, one line for flanges far apart', () => {
  const plate = { type: 'rectangle', origin: [0, 0], width: 100, height: 100 };
  const bend = (id, y, flip = false) => ({
    id,
    a: flip ? [101, y] : [-1, y],
    b: flip ? [-1, y] : [101, y],
    angle: 90,
    direction: 'up',
    radius: null,
    punch: 'a102',
    die: 'v8-88',
  });
  const feature = (bends) => ({ ...USER_TRAY_FEATURE, bends });
  for (const bends of [[], [bend('b1', 80)]]) {
    const { container, unmount } = render(
      <FlangeGaps fold={foldSheet(feature(bends), plate, {})} profile={plate} params={PARAMS}>
        <button type="button">Set</button>
      </FlangeGaps>,
    );
    expect(container.innerHTML).toBe('');
    unmount();
  }
  // Two flanges on opposite edges: one quiet line, no card, no rows, no blank.
  const { container } = render(
    <FlangeGaps
      fold={foldSheet(feature([bend('b1', 80), bend('b2', 20, true)]), plate, {})}
      profile={plate}
      params={PARAMS}
    />,
  );
  expect(summary().textContent).toBe('Flange gaps: none within 3 mm');
  expect(container.querySelectorAll('details, svg, .cad-problem')).toHaveLength(0);
});

it('puts its children under the rows', () => {
  card({ children: <button type="button">Set all</button> });
  const section = screen.getByRole('region', { name: 'Flange gaps' });
  expect(section.lastElementChild).toBe(screen.getByRole('button', { name: 'Set all' }));
});

// ---------------------------------------------------------------- where it shows
const model = {
  ...emptyModel(),
  sketches: [
    { id: USER_TRAY_FEATURE.sketchId, name: 'Sketch 1', plane: 'XY', profile: USER_TRAY_PROFILE, primitives: [] },
  ],
  parts: [{ id: 'p', name: 'Tray', material: 'SPCC cold-rolled steel', features: [USER_TRAY_FEATURE] }],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
};

it("shows in the Sheet metal panel after the fold's warnings, before the bends", () => {
  render(<SheetMetalForm feature={USER_TRAY_FEATURE} model={model} onChange={() => {}} />);
  const form = screen.getByLabelText('Sheet metal');
  const line = within(form).getByLabelText('Flange gaps summary');
  expect(line.textContent).toBe('Flange gaps: least 0.72 mm · 12 within 3 mm');
  const heading = within(form).getByRole('heading', { name: 'Bends, in the order they are made' });
  expect(line.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('shows on the press brake, read from the part as made whatever line is picked, and hands a hover on', () => {
  const onGapHover = vi.fn();
  const panel = (patch) => {
    const session = { ...brakeSessionDefaults(), stage: 'setup', key: 'k', instanceId: 'i', ...patch };
    const station = brakeStation({ model, session, advise: false });
    return render(
      <PressBrakePanel
        station={station}
        session={session}
        onSession={() => {}}
        onMachine={() => {}}
        onBend={() => {}}
        onLeave={() => {}}
        onScrub={() => {}}
        onRerun={() => {}}
        onMove={() => {}}
        onRemove={() => {}}
        onGapHover={onGapHover}
      />,
    );
  };
  panel();
  const region = screen.getByRole('region', { name: 'Press brake' });
  const line = within(region).getByLabelText('Flange gaps summary');
  expect(line.textContent).toBe('Flange gaps: least 0.72 mm · 12 within 3 mm');
  // After the "Folded …" line of the sequence.
  const folded = within(region).getAllByLabelText('Folded size').at(-1);
  expect(folded.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.pointerEnter(items()[0]);
  expect(onGapHover.mock.calls.at(-1)[0].gap).toBeCloseTo(0.717, 3);
  cleanup();
  // A pending line across the part, and a step scrubbed: the readout is still the part as made.
  panel({
    mode: 'points',
    points: [
      [0, -500],
      [0, 130],
    ],
    scrub: { bendId: USER_TRAY_FEATURE.bends[0].id, after: false },
  });
  expect(screen.getByLabelText('Flange gaps summary').textContent).toBe('Flange gaps: least 0.72 mm · 12 within 3 mm');
});

it("draws the hovered row's edges on the brake's flat-blank map, and nothing without them", () => {
  const session = { ...brakeSessionDefaults(), stage: 'setup', key: 'k', instanceId: 'i' };
  const station = brakeStation({ model, session, advise: false });
  const map = (gapEdges) =>
    render(
      <FlatPatternMap
        station={station}
        session={session}
        onPickEdge={() => {}}
        onDistance={() => {}}
        onPoints={() => {}}
        {...(gapEdges ? { gapEdges } : {})}
      />,
    );
  const { container, unmount } = map(null);
  const plain = container.innerHTML;
  expect(container.querySelectorAll('.cad-map-gap')).toHaveLength(0);
  unmount();
  const edges = [
    [
      [285.97, 103.03],
      [285.97, 83.03],
    ],
    [
      [271.12, 117.88],
      [285.97, 103.03],
    ],
  ];
  const drawn = map(edges).container;
  const marks = drawn.querySelectorAll('.cad-map-gap');
  expect(marks).toHaveLength(2);
  expect(marks[0].getAttribute('aria-label')).toBe('Flange gap edge');
  expect(marks[0].querySelector('line').getAttribute('y1')).toBe('-103.03');
  // Taken away again, the map is as it was.
  marks.forEach((m) => m.remove());
  expect(drawn.innerHTML).toBe(plain);
});
