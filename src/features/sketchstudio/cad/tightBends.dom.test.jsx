// @vitest-environment jsdom
// Bending a bend on at the press brake and in the part form (docs/sketch-
// studio-tight-bends.md §4.4, TB-1): the station's note and its "Bend on to
// (°)" field on a made bend's line, the Bend on row button (which sets the
// line, and the angle on arriving), the bend-on row in the sequence with its
// Remove and the Earlier refusal, the pedal committing the bend-on entry, and
// the part form's "Bend {n} on to" row. The kernel hook and the 3D viewport
// are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
import { PressBrakePanel } from './PressBrakePanel.jsx';
import { SheetMetalForm, sheetMetalPart } from './ShopPanels.jsx';
import { brakeSessionDefaults, brakeStation, sequenceChecks } from './brakeStation.js';
import { foldSheet } from './sheetMetal.js';
import { machineOf } from './shopCatalog.js';
import { emptyModel } from './model.js';
// The whole workspace renders in some tests: allow for the full suite's load.
vi.setConfig({ testTimeout: 15000 });

const viewport = vi.hoisted(() => ({ props: null }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'ready',
    ready: true,
    snapshot: {
      parameters: {},
      parts: [],
      instances: model.instances.map((i) => ({
        id: i.id,
        partId: i.partId,
        bounds: [
          [0, 0, 0],
          [100, 60, 30],
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
  default: function ViewportStandIn({ ref, ...props }) {
    useImperativeHandle(ref, () => ({
      viewDropPoint: () => [0, 0, 0],
      getInstanceBounds: () => null,
      isDragging: () => false,
      getCanvas: () => null,
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
// The punch stays in the machine (docs/sketch-studio-shop-punches.md §5.5): each test starts from the default.
beforeEach(() => forgetPunch());
afterEach(() => cleanup());

// The user's tray (spec §1): 605.4 × 420.4, t 1.2 SPCC; the inner bend 29 mm
// and the return lip 11 mm from the right edge (edge 2 of the outline).
const W = 605.4,
  H = 420.4;
const RIGHT = 1;
const line = (id, fromRight, angle = 90) => ({
  id,
  a: [W - fromRight, 0],
  b: [W - fromRight, H],
  angle,
  direction: 'up',
  radius: null,
  punch: 'straight-88',
  die: 'v8-88',
});
const MADE = [line('b1', 29, 30), line('b2', 11)];
const ON = { id: 'b3', again: 'b1', angle: 90, punch: 'straight-88', die: 'v8-88' };
const sheetModel = (bends) => {
  const part = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.2, name: 'Tray' });
  part.id = 'tray';
  part.features[0].bends = bends;
  return {
    ...emptyModel(),
    sketches: [
      {
        id: 'blank',
        name: 'Blank',
        plane: 'XY',
        profile: { type: 'rectangle', width: W, height: H, origin: [0, 0] },
        primitives: [],
        constrained: false,
      },
    ],
    parts: [part],
    instances: [{ id: 'tray-1', partId: 'tray', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }],
  };
};
const session = (patch = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'tray-1',
  ...patch,
});
const region = () => screen.getByRole('region', { name: 'Press brake' });
const steps = () => within(region()).getByRole('list', { name: 'Sequence' });
const step = (n) => within(steps()).getByRole('listitem', { name: `Step ${n}` });
const panelOf = (model, s, handlers = {}) => {
  const station = brakeStation({ model, session: s, advise: false });
  const checks = sequenceChecks({ fold: station.fold, machine: machineOf('brake-50-2000') });
  return render(
    <PressBrakePanel
      station={station}
      session={s}
      checks={checks}
      onSession={() => {}}
      onMachine={() => {}}
      onBend={() => {}}
      onLeave={() => {}}
      onScrub={() => {}}
      onRerun={() => {}}
      onMove={() => {}}
      onRemove={() => {}}
      onBendOn={() => {}}
      {...handlers}
    />,
  );
};

it('on a made bend’s line the station says so; the angle field reads Bend on to (°) with what the hit adds', () => {
  panelOf(sheetModel(MADE), session({ mode: 'gauge', edge: RIGHT, distance: 29, angle: 90 }));
  expect(within(region()).getByRole('note', { name: 'Bend on' }).textContent).toBe(
    'This is bend 1’s line: it stands at 30°. This hit bends it on.'.replace('’', "'"),
  );
  const field = within(region()).getByLabelText('Bend on to (°)', { exact: true });
  expect(field.value).toBe('90');
  expect(within(region()).getByRole('note', { name: 'Bend on note' }).textContent).toBe('now 30° · this hit adds 60°');
  // Up / Down and Sharp / Round / Offset are the bend's own: off.
  expect(within(region()).getByLabelText('Flip sheet').disabled).toBe(true);
  const shape = within(region()).getByRole('group', { name: 'Bend shape' });
  expect(
    within(shape)
      .getAllByRole('button')
      .every((b) => b.disabled),
  ).toBe(true);
  expect(within(region()).getByRole('button', { name: 'Bend', exact: true }).disabled).toBe(false);
  expect(within(region()).getByRole('status', { name: 'Collision check' })).toBeTruthy();
});

it('a new line elsewhere is an ordinary hit: Bend angle (°), no note', () => {
  panelOf(sheetModel(MADE), session({ mode: 'gauge', edge: RIGHT, distance: 60, angle: 90 }));
  expect(within(region()).getByLabelText('Bend angle (°)', { exact: true })).toBeTruthy();
  expect(within(region()).queryByRole('note', { name: 'Bend on' })).toBe(null);
  expect(within(region()).getByLabelText('Flip sheet').disabled).toBe(false);
});

it('typed not above the bend’s angle the hit is refused in §4.1’s words', () => {
  panelOf(sheetModel(MADE), session({ mode: 'gauge', edge: RIGHT, distance: 29, angle: 20 }));
  expect(region().textContent).toContain('Bend 1 is already at 30°: a hit only bends it further.');
  expect(within(region()).getByRole('note', { name: 'Bend on note' }).textContent).toBe('now 30° · this hit adds 0°');
  expect(within(region()).getByRole('button', { name: 'Bend', exact: true }).disabled).toBe(true);
});

it('the sequence lists a bend-on step as its own row; Bend on sits on each bend’s last row', () => {
  const onBendOn = vi.fn();
  panelOf(sheetModel([...MADE, ON]), session(), { onBendOn });
  expect(within(steps()).getAllByRole('listitem')).toHaveLength(3);
  expect(step(1).querySelector('strong').textContent).toBe('1 · UP 30° R1.28');
  expect(step(2).querySelector('strong').textContent).toBe('2 · UP 90° R1.28');
  expect(step(3).querySelector('strong').textContent).toBe('3 · bend 1 on: 30° → 90°');
  expect([...steps().querySelectorAll('.cad-brake-check')].map((c) => c.textContent)).toEqual(['ok', 'ok', 'ok']);
  // Bend 1's last step is row 3: its Bend on is there, not on row 1.
  expect(within(step(1)).queryByRole('button', { name: /^Bend \d on$/ })).toBe(null);
  expect(within(step(2)).getByRole('button', { name: 'Bend 2 on' })).toBeTruthy();
  act(() => fireEvent.click(within(step(3)).getByRole('button', { name: 'Bend 1 on' })));
  expect(onBendOn).toHaveBeenCalledWith('b3');
  // The same rows, Scrub, Re-run, Earlier, Later and Remove on the bend-on step.
  for (const name of ['Before', 'After', 'Re-run', 'Earlier', 'Remove'])
    expect(within(step(3)).getByRole('button', { name })).toBeTruthy();
});

// ---------------------------------------------------------------- the workspace
function setup(model) {
  let current = model;
  const setCadModel = vi.fn((next) => {
    current = next;
  });
  const workspace = () => (
    <MemoryRouter>
      <CadWorkspace
        document={{ id: 'doc', name: 'Test', entities: [], model: current }}
        setCadModel={setCadModel}
        documentPersistence={{}}
      />
    </MemoryRouter>
  );
  const view = render(workspace());
  const rerender = () => view.rerender(workspace());
  act(() => viewport.props.onSelect('tray-1'));
  return { setCadModel, rerender, model: () => current };
}
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
const openBrake = () => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route('Bend')));
};
const bendsOf = (harness) => harness.model().parts[0].features[0].bends;

it('Bend on sets the line on the bend (the angle on arriving), and the pedal commits the bend-on entry', () => {
  const harness = setup(sheetModel(MADE));
  openBrake();
  // The session's angle is 20 (typed for nothing yet): arriving on bend 1's line it becomes 90°.
  const angle = within(region()).getByLabelText('Bend angle (°)', { exact: true });
  act(() => {
    fireEvent.focus(angle);
    fireEvent.change(angle, { target: { value: '20' } });
  });
  act(() => fireEvent.blur(angle));
  act(() => fireEvent.click(within(step(1)).getByRole('button', { name: 'Bend 1 on' })));
  expect(within(region()).getByLabelText('Bend on to (°)', { exact: true }).value).toBe('90');
  expect(within(region()).getByRole('note', { name: 'Bend on' }).textContent).toContain('it stands at 30°');
  // The view: the stroke's bend in the die at the angle it stands at.
  expect(viewport.props.brakeView).toMatchObject({ bendId: 'b1', angles: { b1: 30 } });
  act(() => fireEvent.click(within(region()).getByRole('button', { name: 'Bend', exact: true })));
  const stroke = viewport.props.brakeView.stroke;
  expect([stroke.from, stroke.target, stroke.bendIds]).toEqual([30, 90, ['b1']]);
  act(() => viewport.props.onBrakeStrokeEnd(stroke.token));
  const bends = bendsOf(harness);
  expect(bends).toHaveLength(3);
  expect(bends[2]).toMatchObject({ again: 'b1', angle: 90, punch: 'straight-88' });
  expect(bends[2].a).toBeUndefined();
  harness.rerender();
  expect(step(3).querySelector('strong').textContent).toBe('3 · bend 1 on: 30° → 90°');
});

it('Remove on a bend-on row takes that hit away; Earlier into a worse order and before its bend are refused', () => {
  const harness = setup(sheetModel([...MADE, ON]));
  openBrake();
  const commits = harness.setCadModel.mock.calls.length;
  // Earlier on row 3: inner on to 90° before the lip, the lip then hits the ram.
  act(() => fireEvent.click(within(step(3)).getByRole('button', { name: 'Earlier' })));
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
  expect(document.querySelector('.cad-error').textContent).toMatch(
    /^That order is refused: step 3 could not be made then\. Bend 3: the part hits the ram/,
  );
  // The lip first (Later on row 1) is a good order; then Earlier on the bend-on row puts it before its bend.
  act(() => fireEvent.click(within(step(1)).getByRole('button', { name: 'Later' })));
  expect(bendsOf(harness).map((b) => b.id)).toEqual(['b2', 'b1', 'b3']);
  harness.rerender();
  act(() => fireEvent.click(within(step(3)).getByRole('button', { name: 'Earlier' })));
  expect(bendsOf(harness).map((b) => b.id)).toEqual(['b2', 'b1', 'b3']);
  expect(document.querySelector('.cad-error').textContent).toBe(
    'Step 2 bends a bend on before it is made: a bend is made first, then bent on.',
  );
  // Remove the bend-on row: two rows, bend 1 back at 30°.
  act(() => fireEvent.click(within(step(3)).getByRole('button', { name: 'Remove' })));
  expect(bendsOf(harness).map((b) => b.id)).toEqual(['b2', 'b1']);
  harness.rerender();
  expect(within(steps()).getAllByRole('listitem')).toHaveLength(2);
  expect(step(2).querySelector('strong').textContent).toBe('2 · UP 30° R1.28');
});

it('removing a bend’s first step takes its bend-on hits with it', () => {
  const harness = setup(sheetModel([...MADE, ON]));
  openBrake();
  act(() => fireEvent.click(within(step(1)).getByRole('button', { name: 'Remove' })));
  expect(bendsOf(harness).map((b) => b.id)).toEqual(['b2']);
});

// ---------------------------------------------------------------- the part form
it('the part form shows a bend-on entry as "Bend {n} on to" with its angle and Remove', () => {
  const model = sheetModel([...MADE, ON]);
  const onChange = vi.fn();
  render(<SheetMetalForm feature={model.parts[0].features[0]} model={model} onChange={onChange} />);
  const form = screen.getByLabelText('Sheet metal');
  expect(form.querySelector('.cad-part-size').textContent).toMatch(/· 2 bends$/);
  // The bend's own row shows its first angle.
  const first = within(form).getByRole('article', { name: 'Bend 1' });
  expect(within(first).getByLabelText('Angle (°)', { exact: true }).value).toBe('30');
  const row = within(form).getByRole('article', { name: 'Bend 1 on to' });
  expect(within(row).getByLabelText('Bend 1 on to (°)', { exact: true }).value).toBe('90');
  act(() => fireEvent.click(within(row).getByRole('button', { name: 'Remove' })));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0].bends.map((b) => b.id)).toEqual(['b1', 'b2']);
  // Removing the bend takes its bend-on entry with it.
  act(() => fireEvent.click(within(first).getByRole('button', { name: 'Remove' })));
  expect(onChange.mock.calls[1][0].bends.map((b) => b.id)).toEqual(['b2']);
  // Its angle edited below the bend's: refused in §4.1's words, nothing committed.
  const field = within(row).getByLabelText('Bend 1 on to (°)', { exact: true });
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '20' } });
  });
  act(() => fireEvent.blur(field));
  expect(onChange).toHaveBeenCalledTimes(2);
  expect(form.textContent).toContain('Bend 1 is already at 30°: a hit only bends it further.');
  // The fold itself is unchanged by the form (the three entries fold as before).
  expect(foldSheet(model.parts[0].features[0], model.sketches[0].profile).bends).toHaveLength(2);
});
