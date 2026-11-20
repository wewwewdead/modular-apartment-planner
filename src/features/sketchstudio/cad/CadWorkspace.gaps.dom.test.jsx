// @vitest-environment jsdom
// Setting flange gaps in the workspace (docs/sketch-studio-corner-gaps.md
// §4.3, §4.4 DOM): the user's own file, its part's Sheet metal panel — Set
// all, one row run past its neighbour, the status line, Undo bringing the
// outline back byte for byte, a refusal on the form's line with nothing
// committed, another part cut from the outline refusing by name, the
// controls disabled as Edit outline is, the sketcher's entities kept (ids)
// and its reference dimensions following their corners; and the press
// brake's card, read-only, pointing here. The kernel hook and the 3D viewport
// are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import { forgetPunch } from './brakeMemory.js';
import { brakeSessionDefaults, brakeStation } from './brakeStation.js';
import { normalizeModel } from './model.js';
import { entitiesToProfile } from './sketchProfile.js';
vi.setConfig({ testTimeout: 20000 });

vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'ready',
    ready: true,
    snapshot: {
      parameters: {},
      parts: model.parts.map((p) => ({
        id: p.id,
        bounds: [
          [0, 0, 0],
          [450, 600, 25],
        ],
        features: {},
      })),
      instances: model.instances.map((i) => ({
        id: i.id,
        partId: i.partId,
        bounds: [
          [0, 0, 0],
          [450, 600, 25],
        ],
        placement: [],
      })),
    },
    request: vi.fn(),
    retry() {},
    cancel() {},
  }),
}));
vi.mock('./CadViewport.jsx', () => ({
  default: function ViewportStandIn({ ref }) {
    useImperativeHandle(ref, () => ({
      viewDropPoint: () => [0, 0, 0],
      getInstanceBounds: () => null,
      isDragging: () => false,
      getCanvas: () => null,
      getGroupPoses: () => new Map(),
      planeEdges: () => [],
      getMarkPoints: () => [],
      setSketchOverlay: () => {},
    }));
    return <div aria-label="Solid model viewport" />;
  },
}));
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  window.localStorage.clear();
  forgetPunch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The user's file (a copy; the original is never written).
const USER = JSON.parse(
  readFileSync(resolve(process.cwd(), 'scripts/fixtures/corner-gaps-sample-bending.json'), 'utf8'),
).document.model;

// The workspace with an undo history like SketchStudio's.
function setup(model = USER) {
  const history = [normalizeModel(model)];
  let index = 0;
  const setCadModel = vi.fn((next, meta = {}) => {
    if (meta.skipHistory) history[index] = next;
    else {
      history.splice(index + 1);
      history.push(next);
      index = history.length - 1;
    }
  });
  const workspace = () => (
    <MemoryRouter>
      <CadWorkspace
        document={{ id: 'doc', name: 'Test', entities: [], model: history[index] }}
        setCadModel={setCadModel}
        undo={() => (index = Math.max(0, index - 1))}
        redo={() => (index = Math.min(history.length - 1, index + 1))}
        canUndo
        canRedo
        documentPersistence={{}}
      />
    </MemoryRouter>
  );
  const view = render(workspace());
  const rerender = () => view.rerender(workspace());
  return {
    setCadModel,
    first: history[0],
    model: () => history[index],
    rerender,
    undo: () => {
      index = Math.max(0, index - 1);
      rerender();
    },
  };
}
// The part's Sheet metal panel, opened from the job board.
const openPart = (name = /^Sheet-metal part/) => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(within(screen.getByRole('region', { name: 'Job board' })).getByRole('button', { name })));
  return screen.getByLabelText('Sheet metal');
};
const form = () => screen.getByLabelText('Sheet metal');
const summary = () => within(form()).getByLabelText('Flange gaps summary').textContent;
const status = () => within(form()).queryByRole('status');
const alert = () => within(form()).queryByRole('alert');
const gapsNote = () => within(within(form()).getByRole('region', { name: 'Flange gaps' })).getByRole('note');
const REAR = 'Bend 8 flange, end → bend 5 flange, inside face';
const RIGHT = 'Bend 5 flange, end → bend 8 flange, inside face';
const sketchOf = (model) => model.sketches[0];
const inStep = (sketch) =>
  JSON.stringify(entitiesToProfile(sketch.entities).profile) === JSON.stringify(sketch.profile);

it('sets every corner gap in one commit, says so, keeps the entities, and Undo brings the outline back byte for byte', async () => {
  const harness = setup();
  openPart();
  expect(summary()).toBe('Flange gaps: least 0.72 mm · 12 within 3 mm');
  expect(within(form()).getByLabelText('Gap (mm)').value).toBe('0.2');
  const commits = harness.setCadModel.mock.calls.length;
  act(() => fireEvent.click(within(form()).getByRole('button', { name: 'Set all' })));
  harness.rerender();
  // One commit, one undo entry.
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 1);
  expect(harness.setCadModel.mock.calls.at(-1)[1]).toEqual({ skipHistory: false });
  // The band on the bench (corner gaps §6, CG-4): at 0.2 every corner may touch with the shop's usual figures.
  expect(summary()).toBe('Flange gaps: least 0.20 mm · 12 within 3 mm · 12 may touch on the bench');
  expect(status().textContent).toBe('Set 12 gaps to 0.20 mm: 16 edges moved, the most 1.02 mm. Undo takes it back.');
  expect(within(form()).getByText('Bends 3 and 4: the outline now crosses the bend zone at an angle.')).toBeTruthy();
  const before = sketchOf(harness.first),
    after = sketchOf(harness.model());
  expect(JSON.stringify(after.profile)).not.toBe(JSON.stringify(before.profile));
  // The sketcher's copy: the same entities (ids), moved, in step with the profile.
  expect(after.entities.map((e) => e.id)).toEqual(before.entities.map((e) => e.id));
  expect(inStep(after)).toBe(true);
  // No line picked up new metal: bends 1 – 6 as stored; 7 and 8 keep their punch's length (their trims moved).
  const bends = harness.model().parts[0].features[0].bends,
    stored = harness.first.parts[0].features[0].bends;
  expect(bends.slice(0, 6)).toEqual(stored.slice(0, 6));
  // Both punches held at 367.70 mm: the trims 6.517073 now (cornerGapsSet.test.js measures the length).
  for (const i of [6, 7]) expect(bends[i]).toEqual({ ...stored[i], punchTrim: expect.closeTo(6.517073, 6) });
  // The brake's steps checked off the click: all go, nothing added to the note.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(status().dataset.brake).toBe('checked');
  expect(gapsNote().textContent).toBe('Bends 3 and 4: the outline now crosses the bend zone at an angle.');
  // The controls stand above the rows (§4.5, after the first audit).
  const list = within(form()).getByRole('list', { name: 'Flange gaps, nearest first' });
  const all = within(form()).getByRole('button', { name: 'Set all' });
  expect(all.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // No Set offered on a row at its target.
  expect(within(form()).queryAllByRole('button', { name: /^Set Bend/ })).toHaveLength(0);
  harness.undo();
  expect(JSON.stringify(sketchOf(harness.model()))).toBe(JSON.stringify(before));
  expect(summary()).toBe('Flange gaps: least 0.72 mm · 12 within 3 mm');
  expect(status()).toBe(null);
});

it("runs one wall past its neighbour from the row's own way and Set; bend 5's line kept on its tabs; Undo takes both back", () => {
  const harness = setup();
  openPart();
  const way = within(form()).getByRole('combobox', { name: `Way for ${REAR}` });
  expect(way.value).toBe('short');
  expect([...way.options].map((o) => o.textContent)).toEqual(['Stops short', 'Runs past (covers)']);
  act(() => fireEvent.change(way, { target: { value: 'cover' } }));
  act(() => fireEvent.click(within(form()).getByRole('button', { name: `Set ${REAR}` })));
  harness.rerender();
  expect(alert()).toBe(null);
  expect(status().textContent).toBe('Set 1 covering end flush: 1 edge moved 1.93 mm. Undo takes it back.');
  const rear = within(form())
    .getAllByRole('listitem')
    .find((li) => li.getAttribute('aria-label').startsWith(REAR));
  expect(rear.getAttribute('aria-label')).toBe(
    `${REAR}: runs past its end: flush with its outside face · ± 0.37 on the bench: may stand proud`,
  );
  // It reads as covering now: its way says so and Set is no longer offered.
  expect(within(form()).getByRole('combobox', { name: `Way for ${REAR}` }).value).toBe('cover');
  expect(within(form()).queryByRole('button', { name: `Set ${REAR}` })).toBe(null);
  const bends = harness.model().parts[0].features[0].bends,
    stored = harness.first.parts[0].features[0].bends;
  expect(bends[4]).toEqual({ ...stored[4], a: [286.834742, -446.16916], b: [286.834742, 80.529437] });
  bends.forEach((b, i) => i === 4 || expect(b).toEqual(stored[i]));
  expect(inStep(sketchOf(harness.model()))).toBe(true);
  // The right wall's row against the ear is set from its own Set.
  act(() => fireEvent.click(within(form()).getByRole('button', { name: `Set ${RIGHT}` })));
  harness.rerender();
  expect(status().textContent).toBe('Set 1 gap to 0.20 mm: 1 edge moved 1.02 mm. Undo takes it back.');
  harness.undo();
  harness.undo();
  expect(JSON.stringify(harness.model().parts)).toBe(JSON.stringify(harness.first.parts));
  expect(JSON.stringify(harness.model().sketches)).toBe(JSON.stringify(harness.first.sketches));
});

it('takes the ways the selects show on Set all: one wall covers, its partner the gap, the rest the gap', () => {
  const harness = setup();
  openPart();
  act(() =>
    fireEvent.change(within(form()).getByRole('combobox', { name: `Way for ${REAR}` }), { target: { value: 'cover' } }),
  );
  const all = within(form()).getByRole('button', { name: 'Set all' });
  expect(all.title).toBe('Set every corner gap to this gap, each its way as shown');
  act(() => fireEvent.click(all));
  harness.rerender();
  expect(alert()).toBe(null);
  expect(status().textContent).toBe(
    'Set 11 gaps to 0.20 mm and 1 covering end flush: 16 edges moved, the most 1.93 mm. Undo takes it back.',
  );
  const items = within(form()).getAllByRole('listitem');
  const text = (label) =>
    items.find((li) => li.getAttribute('aria-label').startsWith(label)).querySelector('strong').textContent;
  expect(text(REAR)).toBe('runs past its end: flush with its outside face · ± 0.37 on the bench: may stand proud');
  expect(text(RIGHT)).toBe('0.20 mm · ± 0.39 on the bench: may touch');
  for (const li of items) {
    const label = li.getAttribute('aria-label');
    if (label.startsWith(REAR) || label.startsWith('Bend 8 flange, end → bend 3')) continue;
    expect(li.querySelector('strong').textContent).toMatch(/^0\.20 mm/);
  }
  // The choice is spent: the select reads what the row is.
  expect(within(form()).getByRole('combobox', { name: `Way for ${REAR}` }).value).toBe('cover');
});

it('adds a step that no longer goes at the brake to the note, off the click; the set stands', async () => {
  const harness = setup();
  openPart();
  const field = within(form()).getByLabelText('Gap (mm)');
  act(() => {
    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.keyDown(field, { key: 'Enter' });
  });
  const commits = harness.setCadModel.mock.calls.length;
  act(() => fireEvent.click(within(form()).getByRole('button', { name: 'Set all' })));
  harness.rerender();
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 1);
  expect(status().textContent).toBe('Set 12 gaps to 0.00 mm: 16 edges moved, the most 1.22 mm. Undo takes it back.');
  expect(status().dataset.brake).toBe('checking');
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(status().dataset.brake).toBe('checked');
  const hit = (n) =>
    `Step ${n} no longer goes at the brake: Bend ${n}: the part hits the punch at 32.5°. Bend this one earlier (before the flange in the way), or use the gooseneck punch.`;
  expect(gapsNote().textContent).toBe(
    `Bends 3 and 4: the outline now crosses the bend zone at an angle. ${hit(7)} ${hit(8)}`,
  );
  expect(summary()).toBe('Flange gaps: least 0.00 mm · 12 within 3 mm · 12 may touch on the bench');
});

it("shows a refusal on the form's line and commits nothing", () => {
  const harness = setup();
  openPart();
  const field = within(form()).getByLabelText('Gap (mm)');
  act(() => {
    fireEvent.change(field, { target: { value: '-1' } });
    fireEvent.keyDown(field, { key: 'Enter' });
  });
  const commits = harness.setCadModel.mock.calls.length;
  act(() => fireEvent.click(within(form()).getByRole('button', { name: 'Set all' })));
  expect(alert().textContent).toBe('Flanges cannot overlap: give 0 mm or more.');
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
  expect(status()).toBe(null);
});

it('refuses, by name, an outline another part cut from it can no longer fold', () => {
  // A second part cut from the same outline with the bends as stored: the ear lies across its bend 5.
  const copy = {
    ...USER.parts[0],
    id: 'part-copy',
    name: 'Copy',
    features: [{ ...USER.parts[0].features[0], id: 'feature-copy' }],
  };
  const model = {
    ...USER,
    parts: [...USER.parts, copy],
    instances: [...USER.instances, { ...USER.instances[0], id: 'instance-copy', partId: 'part-copy' }],
  };
  const harness = setup(model);
  openPart(/^Sheet-metal part/);
  act(() =>
    fireEvent.change(within(form()).getByRole('combobox', { name: `Way for ${REAR}` }), { target: { value: 'cover' } }),
  );
  const commits = harness.setCadModel.mock.calls.length;
  act(() => fireEvent.click(within(form()).getByRole('button', { name: `Set ${REAR}` })));
  expect(alert().textContent).toBe(
    'This outline no longer takes the bends of Copy: Bend 5 crosses bend 1: their bend zones would share metal at the corner. The relief must reach 1.41 mm (half the bend zone) past each bend line: cut it wider, or ask for a wider gap. Fix the outline, or remove that bend first.',
  );
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
});

it('is disabled with the title Edit outline has when the outline cannot be edited', () => {
  const model = { ...USER, sketches: USER.sketches.map((s) => ({ ...s, constrained: true })) };
  setup(model);
  openPart();
  const edit = within(form()).getByRole('button', { name: 'Edit outline' });
  expect(edit.disabled).toBe(true);
  const all = within(form()).getByRole('button', { name: 'Set all' });
  expect(all.disabled).toBe(true);
  expect(all.title).toBe(edit.title);
  const way = within(form()).getByRole('combobox', { name: `Way for ${REAR}` });
  expect(way.disabled).toBe(true);
  expect(within(form()).getByRole('button', { name: `Set ${REAR}` }).disabled).toBe(true);
  expect(within(form()).getByLabelText('Gap (mm)').disabled).toBe(true);
});

it('moves a reference dimension with the corners it measures and leaves the others', () => {
  const dimensions = [
    // The rear wall's end, corner to corner (segment 2: x 285.970563, from the mitre down to the notch).
    {
      id: 'd1',
      type: 'linear',
      from: [285.970563, 103.029437],
      to: [285.970563, 83.029437],
      orientation: 'vertical',
      offset: 12,
    },
    // From a free point to the middle of the rear lip's edge: on the outline, but no corner.
    { id: 'd2', type: 'linear', from: [0, 0], to: [100, 117.878679], orientation: 'horizontal', offset: 5 },
  ];
  const model = { ...USER, sketches: USER.sketches.map((s) => ({ ...s, dimensions })) };
  const harness = setup(model);
  openPart();
  act(() => fireEvent.click(within(form()).getByRole('button', { name: 'Set all' })));
  const stored = sketchOf(harness.model()).dimensions;
  expect(stored).toHaveLength(2);
  // Its ends are the rear wall end's corners as the outline now stands (segments 1 and 2 end there).
  const { segments } = sketchOf(harness.model()).profile;
  expect(stored[0]).toEqual({ ...dimensions[0], from: segments[1].end, to: segments[2].end });
  expect(segments[2].end).toEqual([286.504167, 83.029437]);
  expect(stored[1]).toEqual(dimensions[1]);
});

it("keeps the press brake's card read-only and points to the Sheet metal panel", () => {
  const model = normalizeModel(USER);
  const session = { ...brakeSessionDefaults(), stage: 'setup', key: 'k', instanceId: model.instances[0].id };
  render(
    <PressBrakePanel
      station={brakeStation({ model, session, advise: false })}
      session={session}
      onSession={() => {}}
      onMachine={() => {}}
      onBend={() => {}}
      onLeave={() => {}}
      onScrub={() => {}}
      onRerun={() => {}}
      onMove={() => {}}
      onRemove={() => {}}
      onGapHover={() => {}}
    />,
  );
  const card = screen.getByRole('region', { name: 'Flange gaps' });
  expect(within(card).getByText("To change a gap, set it in the part's Sheet metal panel.")).toBeTruthy();
  expect(within(card).queryByRole('button', { name: 'Set all' })).toBe(null);
  expect(within(card).queryByRole('combobox')).toBe(null);
});

// What the shop holds (corner gaps §6.2 DOM, CG-4): the three fields write
// fabrication.shop.tolerance, one commit each; the rows follow; an emptied
// field goes back to the catalogue's figure; Undo restores, field by field,
// until the shop settings read as the file had them.
it('writes what the shop holds field by field, the band follows, and Undo restores the file', () => {
  const harness = setup();
  openPart();
  act(() => fireEvent.click(within(form()).getByRole('button', { name: 'Set all' })));
  harness.rerender();
  expect(summary()).toBe('Flange gaps: least 0.20 mm · 12 within 3 mm · 12 may touch on the bench');
  const holds = within(form()).getByText('What the shop holds').closest('details');
  expect(holds.open).toBe(false);
  expect(within(holds).getByText(/Typical figures: a good CNC brake holds a flange to ± 0.1 mm/)).toBeTruthy();
  const field = (label) => within(holds).getByLabelText(label);
  expect([field('Flange ± (mm)').value, field('Cut ± (mm)').value, field('Angle ± (°)').value]).toEqual([
    '0.2',
    '0.1',
    '1',
  ]);
  const settle = (label, value) => {
    act(() => {
      fireEvent.keyDown(field(label), { key: '5' });
      fireEvent.change(field(label), { target: { value } });
    });
    act(() => fireEvent.blur(field(label)));
    harness.rerender();
  };
  const commits = harness.setCadModel.mock.calls.length;
  // The catalogue's own figure, with none of the model's held: nothing to commit, no Undo entry.
  settle('Cut ± (mm)', '0.1');
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
  settle('Flange ± (mm)', '0.05');
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 1);
  expect(harness.model().fabrication.shop.tolerance).toEqual({ flange: 0.05 });
  settle('Cut ± (mm)', '0.05');
  settle('Angle ± (°)', '0.25');
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 3);
  for (const call of harness.setCadModel.mock.calls.slice(commits)) expect(call[1]).toEqual({ skipHistory: false });
  expect(harness.model().fabrication.shop).toEqual({
    ...harness.first.fabrication.shop,
    tolerance: { flange: 0.05, cut: 0.05, angle: 0.25 },
  });
  // With a good CNC brake's figures no corner may touch: the wall row reads its band only.
  expect(summary()).toBe('Flange gaps: least 0.20 mm · 12 within 3 mm');
  expect(
    within(form())
      .getByRole('listitem', { name: new RegExp(`^${REAR}: `) })
      .getAttribute('aria-label'),
  ).toBe(`${REAR}: 0.20 mm · passes 0.20 mm beside it · ± 0.10 on the bench`);
  // Settling a field on the value it holds commits nothing.
  settle('Angle ± (°)', '0.25');
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 3);
  // The cut typed back to the catalogue's 0.1: the model's own goes (one commit), then comes back by Undo.
  settle('Cut ± (mm)', '0.1');
  expect(harness.model().fabrication.shop.tolerance).toEqual({ flange: 0.05, angle: 0.25 });
  harness.undo();
  expect(harness.model().fabrication.shop.tolerance).toEqual({ flange: 0.05, cut: 0.05, angle: 0.25 });
  // The angle field emptied: back to the catalogue's 1°, the key gone from the model.
  settle('Angle ± (°)', '');
  expect(harness.model().fabrication.shop.tolerance).toEqual({ flange: 0.05, cut: 0.05 });
  expect(field('Angle ± (°)').value).toBe('1');
  expect(summary()).toMatch(/· 12 may touch on the bench$/);
  // Undo, one field at a time, back to the file's own shop settings, byte for byte.
  harness.undo();
  expect(harness.model().fabrication.shop.tolerance).toEqual({ flange: 0.05, cut: 0.05, angle: 0.25 });
  harness.undo();
  harness.undo();
  harness.undo();
  expect(JSON.stringify(harness.model().fabrication)).toBe(JSON.stringify(harness.first.fabrication));
  expect('tolerance' in harness.model().fabrication.shop).toBe(false);
});

it("shows the band at the press brake too, read only, from the model's tolerance", () => {
  const model = normalizeModel({
    ...USER,
    fabrication: { ...USER.fabrication, shop: { ...USER.fabrication.shop, tolerance: { flange: 0.8 } } },
  });
  const session = { ...brakeSessionDefaults(), stage: 'setup', key: 'k', instanceId: model.instances[0].id };
  render(
    <PressBrakePanel
      station={brakeStation({ model, session, advise: false })}
      session={session}
      tolerance={{ flange: 0.8, cut: 0.1, angle: 1 }}
      onSession={() => {}}
      onMachine={() => {}}
      onBend={() => {}}
      onLeave={() => {}}
      onScrub={() => {}}
      onRerun={() => {}}
      onMove={() => {}}
      onRemove={() => {}}
      onGapHover={() => {}}
    />,
  );
  const card = screen.getByRole('region', { name: 'Flange gaps' });
  // Flange ± 0.8: the four walls at 0.72 – 0.73 mm may touch (√(0.01 + 0.8² + 0.0848) = 0.86); the others not.
  expect(within(card).getByLabelText('Flange gaps summary').textContent).toBe(
    'Flange gaps: least 0.72 mm · 12 within 3 mm · 4 may touch on the bench',
  );
  expect(
    within(card)
      .getByRole('listitem', { name: new RegExp(`^${REAR}: `) })
      .getAttribute('aria-label'),
  ).toBe(`${REAR}: 0.73 mm · passes 1.22 mm beside it · ± 0.86 on the bench: may touch`);
  expect(within(card).queryByText('What the shop holds')).toBe(null);
});
