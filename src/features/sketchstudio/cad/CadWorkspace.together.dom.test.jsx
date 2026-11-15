// @vitest-environment jsdom
// Putting parts together in the Shop tab (docs/sketch-studio-shop-trim.md
// §4.3): no station does it. With no station open, Move part and Rotate part
// work on every part whatever its route state (painted, printed), and Shop →
// More runs the Assemble tab's Group, Ungroup and Mate faces and adds a
// bought-in item. The kernel hook and the 3D viewport are stand-ins: the hook
// poses every part by its own position.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { emptyModel, normalizeModel } from './model.js';
import { sheetMetalPart } from './ShopPanels.jsx';
// The whole workspace renders in each test: under the full suite’s parallel load
// its long tests outrun the default 5 s (SF-1 audit), so the file allows 15 s.
vi.setConfig({ testTimeout: 15000 });

const SIZE = [200, 150, 1.5];
const viewport = vi.hoisted(() => ({ props: null }));
vi.mock('./useCadModel.js', () => {
  const pose = (instance) => [
    ...(instance.rotation || [0, 0, 0])
      .map((angle, i) => ({ angle, axis: [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0], origin: [0, 0, 0] }))
      .filter((op) => op.angle),
    { translation: instance.position || [0, 0, 0] },
  ];
  return {
    default: (model) => ({
      status: 'ready',
      ready: true,
      snapshot: {
        parameters: {},
        parts: model.parts.map((p) => ({ id: p.id, bounds: [[0, 0, 0], SIZE], features: {} })),
        instances: model.instances.map((i) => ({
          id: i.id,
          partId: i.partId,
          bounds: [(i.position || [0, 0, 0]).map(Number), (i.position || [0, 0, 0]).map((v, k) => Number(v) + SIZE[k])],
          placement: pose(i),
        })),
      },
      request: vi.fn(async () => []),
      retry() {},
      cancel() {},
    }),
  };
});
// Its boxes: each part's position plus the plate's size (the hook's own).
const harnessModel = { current: null };
const boxOf = (id) => {
  const instance = harnessModel.current?.instances.find((i) => i.id === id);
  if (!instance) return null;
  const at = (instance.position || [0, 0, 0]).map(Number);
  return [at, at.map((v, k) => v + SIZE[k])];
};
vi.mock('./CadViewport.jsx', () => ({
  default: function ViewportStandIn({ ref, ...props }) {
    useImperativeHandle(ref, () => ({
      viewDropPoint: () => [500, 300, 0],
      getInstanceBounds: (id) => boxOf(id),
      getBounds: (ids) => {
        const boxes = ids.map(boxOf).filter(Boolean);
        if (!boxes.length) return null;
        return [0, 1].map((end) => [0, 1, 2].map((k) => (end ? Math.max : Math.min)(...boxes.map((b) => b[end][k]))));
      },
      isDragging: () => false,
      getCanvas: () => null,
      getGroupPoses: () => new Map(),
      planeEdges: () => [],
      getMarkPoints: () => [],
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(model) {
  let current = model;
  harnessModel.current = model;
  const setCadModel = vi.fn((next) => {
    current = next;
    harnessModel.current = next;
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
  const rerender = () => act(() => view.rerender(workspace()));
  return { setCadModel, rerender, model: () => current };
}
// A frame and a cover plate, both cut (sheet metal), painted black; the cover
// printed and lying 40 mm above the frame, shifted.
function kitModel() {
  const plate = (id, name) => {
    const part = { ...sheetMetalPart({ sketchId: `${id}-blank`, stock: 'spcc', thickness: 1.5, name }), id };
    part.features[0].id = `${id}-f`;
    return part;
  };
  const blank = (id) => ({
    id,
    name: id,
    plane: 'XY',
    profile: { type: 'rectangle', width: 200, height: 150, origin: [0, 0] },
  });
  const finish = (id, instanceId) => ({
    id,
    instanceId,
    kind: 'powder',
    name: 'RAL 9005 Jet black',
    colour: '#0e0e10',
    gloss: 'matte',
    thickness: 70,
  });
  return normalizeModel({
    ...emptyModel(),
    sketches: [blank('frame-blank'), blank('cover-blank')],
    parts: [plate('frame', 'Frame'), plate('cover', 'Cover')],
    instances: [
      { id: 'frame-1', partId: 'frame', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true },
      { id: 'cover-1', partId: 'cover', name: '', position: [30, -10, 40], rotation: [0, 0, 0], visible: true },
    ],
    finishes: [finish('f1', 'frame-1'), finish('f2', 'cover-1')],
    prints: [
      {
        id: 'p1',
        instanceId: 'cover-1',
        origin: [100, 75, 1.5],
        x: [1, 0, 0],
        normal: [0, 0, 1],
        width: 40,
        height: 10,
        method: 'silk',
        kind: 'text',
        text: 'ACME',
        font: 'sans-serif',
        colour: '#ffffff',
      },
    ],
  });
}
const shopTab = () => act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
const nav = () => screen.getByRole('navigation', { name: 'Shop route' });
const more = (label) => {
  act(() => fireEvent.click(within(nav()).getByRole('button', { name: /More/ })));
  act(() =>
    fireEvent.click(
      within(screen.getByRole('group', { name: 'More shop commands' })).getByRole('button', { name: label }),
    ),
  );
};
const errorLine = () => document.querySelector('.cad-error');

it('has no Weld or Assembly station: the route is Draw, Cut, Bend, Paint, Print, and More puts parts together', () => {
  setup(kitModel());
  shopTab();
  const route = within(nav())
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') || b.textContent);
  expect(route.some((name) => /Weld|Assembly/.test(name))).toBe(false);
  act(() => fireEvent.click(within(nav()).getByRole('button', { name: /More/ })));
  const menu = within(screen.getByRole('group', { name: 'More shop commands' }));
  for (const label of ['Group', 'Ungroup', 'Mate faces', 'Add bought-in item…'])
    expect(menu.getByRole('button', { name: label })).toBeTruthy();
});

it('moves and turns painted and printed parts with no station open, groups them from More, moves them as one, paints the group in one pick', () => {
  const harness = setup(kitModel());
  shopTab();
  // Move part on the printed, painted cover: the gizmo is on, nothing refuses it.
  act(() => {
    viewport.props.onSelect('cover-1');
  });
  expect(screen.getByRole('button', { name: 'Move part' }).getAttribute('aria-pressed')).toBe('true');
  expect(viewport.props.moveEnabled).toBe(true);
  act(() => {
    viewport.props.onMove('cover-1', [-30, 10, -38.5]);
  });
  harness.rerender();
  expect(harness.model().instances.find((i) => i.id === 'cover-1').position).toEqual([0, 0, 1.5]);
  // Rotate part: ] turns it 15° about Z, in place.
  act(() => fireEvent.keyDown(window, { key: ']', code: 'BracketRight' }));
  harness.rerender();
  expect(harness.model().instances.find((i) => i.id === 'cover-1').rotation).toEqual([0, 0, 15]);
  // Shop → More → Group: the selection, the Assemble tab's own command.
  act(() => {
    viewport.props.onSelect('frame-1', { toggle: true });
  });
  more('Group');
  harness.rerender();
  expect(errorLine()).toBe(null);
  const [group] = harness.model().groups;
  expect(group).toMatchObject({ name: 'Group 1', parentId: null });
  expect(harness.model().instances.every((i) => i.groupId === group.id)).toBe(true);
  // Records and the finish stay as they were.
  expect(harness.model().finishes.map((f) => f.instanceId)).toEqual(['frame-1', 'cover-1']);
  expect(harness.model().prints).toHaveLength(1);
  // Moved as one: both parts go 100 mm along X.
  act(() => {
    viewport.props.onSelect('frame-1');
  });
  expect(viewport.props.movingKey).toBe(group.id);
  const before = harness.model().instances.map((i) => i.position);
  act(() => {
    viewport.props.onMove(group.id, [100, 0, 0]);
  });
  harness.rerender();
  harness
    .model()
    .instances.forEach((i, k) =>
      i.position.forEach((v, axis) => expect(v).toBeCloseTo(before[k][axis] + (axis ? 0 : 100), 9)),
    );
  // Paint: one pick offers the part's group; both get the finish.
  act(() => fireEvent.click(within(nav()).getByRole('button', { name: /Paint/ })));
  act(() => {
    viewport.props.onShopPick({ kind: 'part', instanceId: 'frame-1' });
  });
  const booth = screen.getByRole('region', { name: 'Paint booth' });
  act(() => fireEvent.click(within(booth).getByRole('button', { name: 'Paint the whole Group 1 (2 parts)' })));
  act(() => fireEvent.click(within(booth).getByRole('button', { name: 'RAL 7035 Light grey' })));
  act(() => fireEvent.click(within(booth).getByRole('button', { name: 'Repaint' })));
  // The cover's print goes with a repaint: the booth asks first.
  act(() =>
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Confirm' })).getByRole('button', { name: 'Paint and remove prints' }),
    ),
  );
  harness.rerender();
  expect(harness.model().finishes.map((f) => [f.instanceId, f.name])).toEqual([
    ['frame-1', 'RAL 7035 Light grey'],
    ['cover-1', 'RAL 7035 Light grey'],
  ]);
  expect(harness.model().prints).toEqual([]);
});

it('Mate faces from More puts one face against another; Ungroup from More splits a group', () => {
  const harness = setup(kitModel());
  shopTab();
  more('Mate faces');
  expect(screen.getByRole('heading', { name: 'Mate faces' })).toBeTruthy();
  // The cover's underside onto the frame's top face.
  act(() => {
    viewport.props.onPickSketchFace({ instanceId: 'cover-1', point: [130, 65, 40], normal: [0, 0, -1], planar: true });
  });
  act(() => {
    viewport.props.onPickSketchFace({ instanceId: 'frame-1', point: [100, 75, 1.5], normal: [0, 0, 1], planar: true });
  });
  harness.rerender();
  expect(errorLine()).toBe(null);
  expect(harness.model().instances.find((i) => i.id === 'cover-1').position[2]).toBeCloseTo(1.5, 9);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Done' })));
  // Group both, then Ungroup from More.
  act(() => {
    viewport.props.onSelect('frame-1');
  });
  act(() => {
    viewport.props.onSelect('cover-1', { toggle: true });
  });
  more('Group');
  harness.rerender();
  expect(harness.model().groups).toHaveLength(1);
  more('Ungroup');
  harness.rerender();
  expect(harness.model().groups).toEqual([]);
  expect(harness.model().instances.some((i) => i.groupId)).toBe(false);
});

it('Add bought-in item… from More drops the item under the view centre in its own colour, selected, nothing cut', () => {
  const harness = setup(kitModel());
  shopTab();
  more('Add bought-in item…');
  const form = screen.getByRole('region', { name: 'Bought-in item' });
  act(() => fireEvent.change(within(form).getByLabelText('Item name'), { target: { value: 'Display' } }));
  act(() => fireEvent.change(within(form).getByLabelText('Item colour'), { target: { value: '#1b1e22' } }));
  act(() => fireEvent.click(within(form).getByRole('button', { name: 'Add the item' })));
  harness.rerender();
  expect(errorLine()).toBe(null);
  const item = harness.model().parts.at(-1);
  expect(item).toMatchObject({
    name: 'Display',
    material: 'Bought in',
    purchased: { colour: '#1b1e22', reference: '' },
  });
  expect(item.features[0]).toMatchObject({ type: 'box', width: 200, depth: 20, height: 120 });
  const placed = harness.model().instances.at(-1);
  // Its footprint centred on the drop point, on the ground; selected; no laser blank made for it.
  expect(placed).toMatchObject({ partId: item.id, position: [400, 290, 0] });
  expect(viewport.props.selectedId).toBe(placed.id);
  expect(harness.model().sketches).toHaveLength(2);
  // Nothing in it is made here: no product card, no route subject; the status line says what to do next.
  const board = () => screen.getByRole('region', { name: 'Job board' });
  expect(within(board()).queryByRole('region', { name: 'Product Display' })).toBe(null);
  expect(nav().querySelector('.cad-route-subject')).toBe(null);
  const note = 'Display is in the view. Move it into place, then group it with its product (More → Group).';
  expect(document.querySelector('.cad-status').textContent).toContain(note);
  // Grouped with the frame it is the group's: still no card of its own, and the note is said once.
  act(() => {
    viewport.props.onSelect('frame-1', { toggle: true });
  });
  more('Group');
  harness.rerender();
  expect(within(board()).getByRole('region', { name: 'Product Group 1' })).toBeTruthy();
  expect(within(board()).queryByRole('region', { name: 'Product Display' })).toBe(null);
  expect(document.querySelector('.cad-status').textContent).not.toContain(note);
  act(() => {
    viewport.props.onSelect(placed.id);
  });
  expect(document.querySelector('.cad-status').textContent).not.toContain(note);
  // Cancel closes the form.
  more('Add bought-in item…');
  act(() =>
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Bought-in item' })).getByRole('button', { name: 'Cancel' }),
    ),
  );
  expect(screen.queryByRole('region', { name: 'Bought-in item' })).toBe(null);
});
