// @vitest-environment jsdom
// Draw → Flanged panel's round corners in the workspace (docs/sketch-studio-
// round-bend.md §13.3): a square corner between two flanges offers Round
// corner (radius, leg); the result says how many corner pieces it will cut;
// the preview draws the rounded face, the shortened flanges and the corner
// pieces; both endings make the corner pieces as their own part, set in
// their corners and grouped with the panel (docs/sketch-studio-shop-trim.md
// §4.7: they move as one, no seam); and at the press brake a corner piece's etched line is one
// click that sets up its round bend. The kernel hook and the 3D viewport are
// stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
import { emptyModel } from './model.js';
import { cornerPiece, flangedPanel, presetFace } from './panelMaker.js';
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
// The punch stays in the machine (docs/sketch-studio-shop-punches.md §5.5): each test starts from the default.
beforeEach(() => forgetPunch());
afterEach(() => cleanup());

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
  return { setCadModel, rerender, model: () => current };
}
const click = (scope, name) => act(() => fireEvent.click(within(scope).getByRole('button', { name })));
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
// Draw → Flanged panel (the default 600 × 1400 face), flanges on every edge.
function openForm() {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  const draw = screen.getByRole('region', { name: 'Draw' });
  click(draw, /^Flanged panel/);
  const form = within(draw).getByRole('group', { name: 'Flanged panel' });
  click(form, 'Flange all edges');
  return { draw, form, preview: screen.getByRole('figure', { name: 'Panel preview' }) };
}
const toggle = (form, label) => act(() => fireEvent.click(within(form).getByLabelText(label)));
const set = (form, label, value) => {
  const field = within(form).getByLabelText(label, { exact: true });
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: String(value) } });
  });
  act(() => fireEvent.blur(field));
};

it('offers Round corner on each square flanged corner; the result counts the corner pieces; the preview draws them', () => {
  setup(emptyModel());
  const { form, preview } = openForm();
  // Square corners with a flange on both edges: all four of the rectangle.
  const corners = within(form).getByRole('list', { name: 'Corners' });
  expect(
    within(corners)
      .getAllByRole('checkbox')
      .map((c) => c.getAttribute('aria-label')),
  ).toEqual(['Round corner 1', 'Round corner 2', 'Round corner 3', 'Round corner 4']);
  expect(within(form).queryByLabelText('Corner pieces')).toBe(null);
  expect(preview.querySelectorAll('.cad-panel-corner-piece')).toHaveLength(0);
  // The two top corners round: R30 outside, 15 mm legs by default.
  toggle(form, 'Round corner 3');
  toggle(form, 'Round corner 4');
  expect(within(form).getByLabelText('Corner 3 radius (mm)').value).toBe('30');
  expect(within(form).getByLabelText('Corner 3 leg (mm)').value).toBe('15');
  expect(within(form).getByLabelText('Corner pieces').textContent).toBe(
    '2 pieces · blank 75.9 × 40 mm · R30 outside in 10 hits',
  );
  expect(within(preview).getByRole('status', { name: 'Panel verdict' }).textContent).toMatch(
    /4 hits on the 50 t × 2 m press brake: every hit clears, in this order\.$/,
  );
  // The preview: the face's outline rounds those corners, a corner piece in each, the flanges stop short.
  expect(
    preview
      .querySelector('.cad-panel-face')
      .getAttribute('d')
      .match(/ A 30 30 /g),
  ).toHaveLength(2);
  expect(preview.querySelectorAll('.cad-panel-corner-piece')).toHaveLength(2);
  const top = within(preview).getByRole('button', { name: 'Edge 3: flange 40 mm up' }).querySelector('line');
  // The top edge runs (600, 1400) → (0, 1400): it stops 45 short of each end.
  expect([top.getAttribute('x1'), top.getAttribute('x2')].map(Number)).toEqual([555, 45]);
  // A larger radius: a longer blank, more hits; too small a one is refused by name.
  set(form, 'Corner 3 radius (mm)', 50);
  expect(within(form).getByLabelText('Corner pieces').textContent).toBe(
    '1 piece · blank 107.4 × 40 mm · R50 outside in 16 hits; 1 piece · blank 75.9 × 40 mm · R30 outside in 10 hits',
  );
  set(form, 'Corner 3 radius (mm)', 2);
  expect(within(form).getByRole('alert').textContent).toMatch(/Corner 3: R2 is too tight for a corner piece/);
  set(form, 'Corner 3 radius (mm)', 30);
  // A corner whose flange comes off is no longer offered (and its round corner no longer applies).
  act(() => fireEvent.click(within(form).getByLabelText('Flange on edge 3')));
  expect(within(within(form).getByRole('list', { name: 'Corners' })).getAllByRole('checkbox')).toHaveLength(2);
  expect(within(form).queryByLabelText('Corner pieces')).toBe(null);
  expect(document.querySelector('.cad-error')).toBe(null);
});

it('makes the corner pieces as their own part with either ending, an instance in each corner, grouped with the panel', () => {
  for (const ending of ['Cut and bend it for me', 'Cut the blank — I will bend it']) {
    const harness = setup(emptyModel());
    const { draw, form } = openForm();
    toggle(form, 'Round corner 3');
    toggle(form, 'Round corner 4');
    click(draw, ending);
    harness.rerender();
    const model = harness.model();
    expect(model.parts.map((p) => p.name)).toEqual(['Flanged panel', 'Flanged panel corner piece']);
    expect(model.sketches.map((s) => s.name)).toEqual(['Flanged panel blank', 'Flanged panel corner piece blank']);
    const [panel, piece] = model.parts;
    const feature = piece.features[0];
    // One round bend by bump hits (with "Cut and bend it for me"), its etched line carrying it either way.
    expect(feature.bends).toHaveLength(ending === 'Cut and bend it for me' ? 1 : 0);
    if (feature.bends.length)
      expect(feature.bends[0]).toMatchObject({ angle: 90, direction: 'up', radius: 28.5, steps: 10 });
    expect(feature.marks.map((m) => m.bend)).toEqual([{ angle: 90, direction: 'up', radius: 28.5, steps: 10 }]);
    expect(feature.base).toEqual([7.5, 20]);
    // The panel instance and one corner piece in each of the two corners.
    const [placed, ...corners] = model.instances;
    expect(placed.partId).toBe(panel.id);
    expect(corners.map((i) => i.partId)).toEqual([piece.id, piece.id]);
    // Each where the panel maker's pose stands it, moved with the panel (which is not turned).
    const { cornerPieces } = flangedPanel({
      face: presetFace('rectangle', { width: 600, height: 1400 }),
      thickness: 1.5,
      stock: 'spcc',
      flanges: [0, 1, 2, 3].map((edge) => ({ edge, depth: 40, direction: 'up' })),
      rounds: [2, 3].map((corner) => ({ corner, radius: 30, leg: 15 })),
    });
    expect(placed.rotation).toEqual([0, 0, 0]);
    corners.forEach((c, i) => {
      const pose = cornerPieces[i].pose;
      c.position.forEach((v, k) => expect(v).toBeCloseTo(placed.position[k] + pose[12 + k], 6));
    });
    // The top right one: its legs along the top edge (x) and up the strip (z), its inside toward the face (−y).
    expect(corners[0].rotation).toEqual([90, 0, 0]);
    // One group named after the panel, so the panel and its corner pieces move as one; no seam is recorded.
    expect(model.groups).toEqual([{ id: expect.any(String), name: 'Flanged panel', parentId: null }]);
    expect(model.instances.every((i) => i.groupId === model.groups[0].id)).toBe(true);
    expect(model).not.toHaveProperty('welds');
    expect(document.querySelector('.cad-error')).toBe(null);
    cleanup();
  }
});

it('sets up the round bend from one click on a corner piece’s etched line at the press brake', () => {
  const layout = cornerPiece({ radius: 30, leg: 15, depth: 40, thickness: 1.5, stock: 'spcc' });
  const part = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.5, name: 'Corner piece' });
  part.id = 'corner';
  part.features[0] = { ...part.features[0], base: layout.feature.base, marks: layout.marks };
  setup({
    ...emptyModel(),
    sketches: [
      { id: 'blank', name: 'Blank', plane: 'XY', profile: layout.profile, primitives: [], constrained: false },
    ],
    parts: [part],
    instances: [
      { id: 'corner-1', partId: 'corner', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true },
    ],
  });
  act(() => viewport.props.onSelect('corner-1'));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route('Bend')));
  const brake = screen.getByRole('region', { name: 'Press brake' });
  click(screen.getByRole('figure', { name: 'Flat blank' }), 'Etched line 1: UP 90°');
  expect(
    within(brake).getByRole('group', { name: 'Bend shape' }).querySelector('[aria-pressed="true"]').textContent,
  ).toBe('Round');
  expect(within(brake).getByLabelText('Inside radius (mm)').value).toBe('28.5');
  expect(within(brake).getByRole('spinbutton', { name: 'Hits' }).value).toBe('10');
  expect(within(brake).getByRole('definition', { name: 'Hits' }).textContent).toBe('10 hits · 9° each · every 4.59 mm');
  expect(within(brake).getByRole('status', { name: 'Collision check' }).textContent).toMatch(/^Clear through/);
});
