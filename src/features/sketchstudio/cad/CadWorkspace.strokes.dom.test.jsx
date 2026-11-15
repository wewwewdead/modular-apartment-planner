// @vitest-environment jsdom
// Kiosk-class parts in the workspace (docs/sketch-studio-shop-floor.md §6,
// SF-3): at the press brake an etched line is one click (the punch line, its
// angle and its side); a line across two separate tabs is one stroke of two
// bends, committed with one stroke id and listed as one hit; a segment
// clicked on the flat blank leaves that tab out of the hit; a stroke whose
// tabs the sheet has already bent apart is refused. Draw → Flanged panel: the
// form and its preview, and both endings. The kernel hook and the 3D viewport
// are stand-ins.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { emptyModel } from './model.js';
import { sheetMetalPart } from './ShopPanels.jsx';
vi.setConfig({ testTimeout: 20000 });

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
          [200, 300, 30],
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
      getBounds: () => null,
      isDragging: () => false,
      getCanvas: () => null,
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
afterEach(() => cleanup());

// The gang probe's plate: 200 × 300, a 34 mm left flange strip notched at
// y 140 … 160 (two tabs on the line x = 30), its etched lines: the flange
// (one line across both tabs) and a crease at y 150.
const MARKS = [
  { id: 'm1', a: [30, 0.5], b: [30, 299.5], bend: { angle: 90, direction: 'up' } },
  { id: 'm2', a: [40.5, 150], b: [199.5, 150], bend: { angle: 12, direction: 'down' } },
];
function plateModel(bends = []) {
  const part = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.5, name: 'Frame' });
  part.id = 'frame';
  part.features[0].bends = bends;
  part.features[0].marks = MARKS;
  return {
    ...emptyModel(),
    sketches: [
      {
        id: 'blank',
        name: 'Blank',
        plane: 'XY',
        profile: {
          type: 'polygon',
          points: [
            [34, 0],
            [200, 0],
            [200, 300],
            [34, 300],
            [0, 300],
            [0, 160],
            [34, 160],
            [34, 140],
            [0, 140],
            [0, 0],
          ],
        },
        primitives: [],
        constrained: false,
      },
    ],
    parts: [part],
    instances: [{ id: 'frame-1', partId: 'frame', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }],
  };
}
function setup(model, { select = true } = {}) {
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
  if (select) act(() => viewport.props.onSelect('frame-1'));
  return { setCadModel, rerender, model: () => current };
}
const panel = () => screen.getByRole('region', { name: 'Press brake' });
const map = () => screen.getByRole('figure', { name: 'Flat blank' });
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
const openBrake = () => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route('Bend')));
};
const click = (scope, name) => act(() => fireEvent.click(within(scope).getByRole('button', { name })));
const pedal = (harness) => {
  act(() => fireEvent.keyDown(document.body, { key: ' ' }));
  const stroke = viewport.props.brakeView.stroke;
  act(() => viewport.props.onBrakeStrokeEnd(stroke.token));
  harness.rerender();
  return stroke;
};

it('sets the punch line, the angle and the side from one click on an etched line', () => {
  setup(plateModel());
  openBrake();
  expect(within(map()).getAllByRole('button', { name: /^Etched line \d/ })).toHaveLength(2);
  click(map(), 'Etched line 2: DOWN 12°');
  expect(within(panel()).getByLabelText('Bend angle (°)').value).toBe('12');
  expect(within(panel()).getByLabelText('Flip sheet').checked).toBe(true);
  expect(
    within(panel()).getByRole('group', { name: 'Punch line' }).querySelector('[aria-pressed="true"]').textContent,
  ).toBe('Two points');
  expect(viewport.props.brakeView.bendIds).toEqual(['pending-hit']);
});

it('bends two tabs on one line in one stroke: two bends, one stroke id, one hit', () => {
  const harness = setup(plateModel());
  openBrake();
  click(map(), 'Etched line 1: UP 90°');
  expect(within(panel()).getByLabelText('Tabs').textContent).toBe('2 in one stroke');
  expect(within(map()).getAllByRole('button', { name: /^Segment \d of 2$/ })).toHaveLength(2);
  expect(viewport.props.brakeView.bendIds).toEqual(['pending-hit', 'pending-hit:2']);
  expect(within(panel()).getByRole('status', { name: 'Collision check' }).textContent).toMatch(/^Clear through/);
  const stroke = pedal(harness);
  expect(stroke.bendIds).toHaveLength(2);
  const bends = harness.model().parts[0].features[0].bends;
  expect(bends).toHaveLength(2);
  expect(bends[0].stroke).toBeTruthy();
  expect(bends[1].stroke).toBe(bends[0].stroke);
  const sequence = within(panel()).getByRole('list', { name: 'Sequence' });
  expect(within(sequence).getAllByRole('listitem')).toHaveLength(1);
  expect(within(sequence).getByRole('listitem', { name: 'Step 1' }).textContent).toContain(
    '1 · UP 90° R1.6 · 2 flanges',
  );
  expect(route('Bend').getAttribute('aria-description')).toBe('1 hit');
  // Remove takes the whole stroke.
  click(within(sequence).getByRole('listitem', { name: 'Step 1' }), 'Remove');
  harness.rerender();
  expect(harness.model().parts[0].features[0].bends).toEqual([]);
});

it('leaves a tab out of the hit when its segment is clicked, and puts it back', () => {
  const harness = setup(plateModel());
  openBrake();
  click(map(), 'Etched line 1: UP 90°');
  const second = () => within(map()).getByRole('button', { name: 'Segment 2 of 2' });
  act(() => fireEvent.click(second()));
  expect(second().getAttribute('aria-pressed')).toBe('false');
  expect(within(panel()).queryByLabelText('Tabs')).toBe(null);
  expect(viewport.props.brakeView.bendIds).toEqual(['pending-hit']);
  expect(within(panel()).getByLabelText('Segments on the line').textContent).toContain('(1 left out)');
  pedal(harness);
  const [made] = harness.model().parts[0].features[0].bends;
  // Just inside the kept tab, no stroke id (a stroke of its own).
  expect(made.a[1]).toBeCloseTo(0.5, 6);
  expect(made.b[1]).toBeCloseTo(139.5, 6);
  expect(made.stroke).toBeUndefined();
  // A new line puts every segment back.
  click(map(), 'Etched line 1: UP 90°');
  expect(second().getAttribute('aria-pressed')).toBe('true');
});

it('refuses two tabs the sheet has already bent apart, and takes one tab alone', () => {
  // The crease made first: the face halves are no longer in one plane.
  setup(
    plateModel([
      {
        id: 'c',
        a: [40.5, 150],
        b: [199.5, 150],
        angle: 12,
        direction: 'down',
        radius: null,
        punch: 'straight-88',
        die: 'v10-88',
      },
    ]),
  );
  openBrake();
  click(map(), 'Etched line 1: UP 90°');
  expect(within(panel()).getAllByRole('alert')[0].textContent).toMatch(
    /^The sheet is already bent between these flanges, so they are no longer in line\. Bend them one at a time/,
  );
  expect(within(panel()).getByRole('button', { name: 'Bend' }).disabled).toBe(true);
  act(() => fireEvent.click(within(map()).getByRole('button', { name: 'Segment 2 of 2' })));
  expect(within(panel()).queryByText(/no longer in line/)).toBe(null);
  expect(viewport.props.brakeView.bendIds).toEqual(['pending-hit']);
});

it('Draw → Flanged panel: the form, its preview, and both endings', () => {
  const harness = setup(emptyModel(), { select: false });
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  const draw = screen.getByRole('region', { name: 'Draw' });
  click(draw, /^Flanged panel/);
  const form = within(draw).getByRole('group', { name: 'Flanged panel' });
  const preview = screen.getByRole('figure', { name: 'Panel preview' });
  // An edge clicked in the preview takes a flange; the form's list agrees.
  click(preview, 'Edge 1');
  expect(within(preview).getByRole('button', { name: 'Edge 1: flange 40 mm up' })).toBeTruthy();
  expect(within(form).getByLabelText('Flange on edge 1').checked).toBe(true);
  click(form, 'Flange all edges');
  click(form, 'Add crease');
  expect(within(form).getByLabelText('Panel results').textContent).toMatch(/Blank674\.7 × 1474\.5 mm/);
  expect(within(preview).getByRole('status', { name: 'Panel verdict' }).textContent).toMatch(
    /5 hits on the 50 t × 2 m press brake: every hit clears, in this order\.$/,
  );
  // Cut the blank — I will bend it: the part with its five etched lines, no bends, on the laser.
  click(draw, 'Cut the blank — I will bend it');
  harness.rerender();
  const model = harness.model();
  const feature = model.parts[0].features[0];
  expect(feature.bends).toEqual([]);
  expect(feature.marks.map((m) => m.bend)).toEqual([
    { angle: 90, direction: 'up' },
    { angle: 90, direction: 'up' },
    { angle: 90, direction: 'up' },
    { angle: 90, direction: 'up' },
    { angle: 12, direction: 'down' },
  ]);
  // A 1474 mm blank does not fit the 1219 × 2438 sheet: the 1500 × 3000 one is chosen.
  expect(model.fabrication.shop.sheet).toBe('1500x3000');
  expect(screen.queryByRole('figure', { name: 'Panel preview' })).toBe(null);
  expect(document.querySelector('.cad-error')).toBe(null);
});

it('a crease by two points on the face’s edges (SF-4 Part A, optional item)', () => {
  setup(emptyModel(), { select: false });
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  const draw = screen.getByRole('region', { name: 'Draw' });
  click(draw, /^Flanged panel/);
  const form = within(draw).getByRole('group', { name: 'Flanged panel' });
  const preview = screen.getByRole('figure', { name: 'Panel preview' });
  const set = (label, value) => {
    const field = within(form).getByLabelText(label, { exact: true });
    act(() => {
      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: String(value) } });
    });
    act(() => fireEvent.blur(field));
  };
  click(form, 'Flange all edges');
  click(form, 'Add crease');
  set('Crease 1 height (mm)', 600);
  const verdict = () => within(preview).getByRole('status', { name: 'Panel verdict' }).textContent;
  const byHeight = verdict();
  // Two points: the line starts where the height put it, edge to edge, and lays out the same blank.
  act(() =>
    fireEvent.click(
      within(within(form).getByRole('group', { name: 'Crease 1 placed by' })).getByRole('button', {
        name: 'Two points',
      }),
    ),
  );
  expect(within(form).queryByLabelText('Crease 1 height (mm)')).toBe(null);
  expect(within(form).getByLabelText('Crease 1 A Y (mm)').value).toBe('600');
  expect(within(form).getByLabelText('Crease 1 B X (mm)').value).toBe('600');
  expect(verdict()).toBe(byHeight);
  // Move both ends up: the crease follows (the folded size along the face is unchanged, the blank moves it).
  set('Crease 1 A Y (mm)', 700);
  set('Crease 1 B Y (mm)', 700);
  expect(verdict()).toMatch(/5 hits on the 50 t × 2 m press brake: every hit clears, in this order\.$/);
  expect(within(preview).getByText('↓ 12° at 700')).toBeTruthy();
  expect(document.querySelector('.cad-error')).toBe(null);
});

it('Cut and bend it for me: the bends in brake order, the side flanges one stroke each', () => {
  const harness = setup(emptyModel(), { select: false });
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  const draw = screen.getByRole('region', { name: 'Draw' });
  click(draw, /^Flanged panel/);
  const form = within(draw).getByRole('group', { name: 'Flanged panel' });
  click(form, 'Flange all edges');
  click(form, 'Add crease');
  click(draw, 'Cut and bend it for me');
  harness.rerender();
  const bends = harness.model().parts[0].features[0].bends;
  expect(bends).toHaveLength(7);
  const strokes = bends.map((b) => b.stroke || b.id);
  expect(new Set(strokes).size).toBe(5);
  expect(bends.at(-1)).toMatchObject({ angle: 12, direction: 'down' });
});

it('Add bend by numbers: one line across two tabs adds one stroke of two bends; editing one makes it its own', () => {
  const harness = setup(plateModel());
  const form = () => document.querySelector('.cad-sheet-metal');
  const set = (label, value, scope = form()) => {
    const field = within(scope).getByLabelText(label, { exact: true });
    act(() => {
      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: String(value) } });
    });
    act(() => fireEvent.blur(field));
  };
  act(() =>
    fireEvent.click(
      within(within(form()).getByRole('group', { name: 'Bend line' })).getByRole('button', { name: 'Two points' }),
    ),
  );
  set('A X (mm)', 30);
  set('A Y (mm)', 0);
  set('B X (mm)', 30);
  set('B Y (mm)', 300);
  expect(within(form()).getByLabelText('New bend numbers').textContent).toContain('UP 90° R1.6 · 2 tabs in one stroke');
  act(() => fireEvent.click(within(form()).getByRole('button', { name: 'Add bend' })));
  harness.rerender();
  let bends = harness.model().parts[0].features[0].bends;
  expect(bends).toHaveLength(2);
  expect(bends[0].stroke).toBeTruthy();
  expect(bends[1].stroke).toBe(bends[0].stroke);
  // The bend table stays per bend; an edit to one of them drops its stroke.
  set('Angle (°)', 80, within(form()).getByRole('article', { name: 'Bend 1' }));
  harness.rerender();
  bends = harness.model().parts[0].features[0].bends;
  expect(bends[0]).toMatchObject({ angle: 80 });
  expect(bends[0].stroke).toBeUndefined();
  expect(bends[1].stroke).toBeTruthy();
});
