// @vitest-environment jsdom
// Shop → Paint, Print (docs/sketch-studio-fab-shop.md §9 SM-3): each station
// owns the viewport's clicks (every "another tool is active" site sees it),
// picks come from the viewport, the panel reads out and refuses what the shop
// would, and Paint and a placed print are ordinary commits (one finish per
// instance, a group painted in one pick, prints in the part frame). Esc steps
// back, then leaves. The kernel hook and the viewport are stand-ins.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { Matrix4 } from 'three';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { emptyModel } from './model.js';
// The whole workspace renders in each test: under the full suite’s parallel load
// its long tests outrun the default 5 s (SF-1 audit), so the file allows 15 s.
vi.setConfig({ testTimeout: 15000 });

const viewport = vi.hoisted(() => ({ props: null }));
const boxMesh = ([x0, y0, z0], [x1, y1, z1]) => ({
  vertices: [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ].flat(),
  triangles: [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7,
  ],
});
const BOXES = {
  plate: [
    [-100, -60, 0],
    [100, 60, 1.5],
  ],
  web: [
    [40, -30, 1.5],
    [41.5, 30, 30],
  ],
  lid: [
    [-100, -60, 30],
    [100, 60, 31.5],
  ],
};
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'ready',
    ready: true,
    snapshot: {
      parameters: {},
      parts: model.parts.map((p) => ({
        id: p.id,
        bounds: BOXES[p.id] || [
          [0, 0, 0],
          [1, 1, 1],
        ],
      })),
      instances: model.instances.map((i) => ({
        id: i.id,
        partId: i.partId,
        bounds: BOXES[i.partId],
        placement: [],
        mesh: boxMesh(...BOXES[i.partId]),
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
      // Every part shown where the model puts it (no pending move).
      getGroupPoses: () => new Map(props.model.instances.map((i) => [i.id, { matrix: new Matrix4(), placement: [] }])),
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
afterEach(() => cleanup());

// Boxes sized like BOXES.
const part = (id, name) => {
  const [min, max] = BOXES[id];
  const [width, depth, height] = max.map((v, i) => v - min[i]);
  return { id, name, material: 'Steel', features: [{ id: `${id}-f`, type: 'box', width, depth, height }] };
};
const shopModel = (extra = {}) => ({
  ...emptyModel(),
  parts: [part('plate', 'Plate'), part('web', 'Web'), part('lid', 'Lid')],
  instances: ['plate', 'web', 'lid'].map((id) => ({
    id,
    partId: id,
    name: '',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    visible: true,
  })),
  ...extra,
});
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
const station = (name) => screen.getByRole('region', { name });
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
// A station from the Shop tab's route (docs/sketch-studio-shop-floor.md §4.1).
const run = (label) => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route(label)));
};
const key = (k) => act(() => fireEvent.keyDown(document.body, { key: k }));
// The handlers return perform()'s promise: called inside a plain act so its updates flush.
const pick = (info) =>
  act(() => {
    viewport.props.onShopPick(info);
  });
const fill = (scope, label, value) => {
  const field = within(scope).getByLabelText(label, { exact: true });
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: String(value) } });
  });
  act(() => fireEvent.blur(field));
};
const readout = (scope, label) => within(scope).getByLabelText(label, { exact: true }).textContent;
const plateFace = (instanceId = 'plate', z = 1.5, extra = {}) => ({
  kind: 'face',
  instanceId,
  point: [70, 0, z],
  normal: [0, 0, 1],
  planar: true,
  outline: [
    [
      [-100, -60, z],
      [100, -60, z],
    ],
    [
      [100, -60, z],
      [100, 60, z],
    ],
    [
      [100, 60, z],
      [-100, 60, z],
    ],
    [
      [-100, 60, z],
      [-100, -60, z],
    ],
  ],
  x: [1, 0, 0],
  local: { point: [70, 0, z], normal: [0, 0, 1], x: [1, 0, 0] },
  ...extra,
});
it('paints a group in a RAL colour: readouts, one finish per part, prints removed after confirmation', () => {
  const print = {
    id: 't',
    instanceId: 'plate',
    origin: [70, 0, 1.5],
    x: [1, 0, 0],
    normal: [0, 0, 1],
    width: 30,
    height: 10,
    rotation: 0,
    method: 'silk',
    kind: 'text',
    text: 'ACME',
    font: 'sans-serif',
    colour: '#ffffff',
  };
  // The plate and the web put together in one group (the lid stands apart).
  const model = shopModel({ prints: [print], groups: [{ id: 'g', name: 'Stand', parentId: null }] });
  model.instances = model.instances.map((i) => (i.id === 'lid' ? i : { ...i, groupId: 'g' }));
  const harness = setup(model);
  run('Paint');
  const panel = () => station('Paint booth');
  expect(viewport.props.shopPick).toMatchObject({ station: 'paint', stage: 'pick', pick: 'part', targets: [] });
  // The station owns the viewport: every other tool site sees it.
  expect(viewport.props.moveEnabled).toBe(false);
  expect(viewport.props.holeMode).toBe(null);
  expect(viewport.props.planes.visible).toBe(false);
  // The route shows Paint open, the other stations stay on (shop floor §4.1); the tree waits.
  expect(route('Paint').getAttribute('aria-current')).toBe('step');
  expect(route('Print').disabled).toBe(false);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Tree' })));
  expect(document.querySelector('.cad-tree-body').disabled).toBe(true);
  expect(document.querySelector('.cad-status').textContent).toContain('Paint booth — pick a part');
  expect(within(panel()).getByRole('button', { name: 'Paint' }).disabled).toBe(true);
  pick({ kind: 'part', instanceId: 'web' });
  expect(viewport.props.shopPick.targets).toEqual(['web']);
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Paint the whole Stand (2 parts)' })));
  // The group, in model order.
  expect(viewport.props.shopPick.targets).toEqual(['plate', 'web']);
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'RAL 9005 Jet black' })));
  expect(within(panel()).getByRole('button', { name: 'RAL 9005 Jet black' }).getAttribute('aria-pressed')).toBe('true');
  // Area from both meshes; powder by the coverage formula; the cure.
  const area = (2 * (200 * 120 + 200 * 1.5 + 120 * 1.5) + 2 * (1.5 * 60 + 1.5 * 28.5 + 60 * 28.5)) / 1e6;
  expect(readout(panel(), 'Painted area')).toBe(`${Number(area.toFixed(4))} m²`);
  const coverage = (1000 / (1.5 * 70)) * 0.6;
  // Shop floor §4.6: the powder mass on show, the coverage under Machine numbers.
  expect(readout(panel(), 'Powder')).toBe(`${Number(((area / coverage) * 1000).toFixed(1))} g`);
  expect(readout(panel(), 'Coverage')).toBe(`${Number(coverage.toFixed(2))} m²/kg`);
  expect(readout(panel(), 'Cure')).toBe('200 °C part temperature for 10 min');
  // The plate carries a print: Paint asks first, in the panel.
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Paint' })));
  expect(harness.setCadModel).not.toHaveBeenCalled();
  const confirm = within(panel()).getByRole('group', { name: 'Confirm' });
  expect(within(confirm).getByRole('alert').textContent).toBe(
    'Painting removes 1 print on Plate: printing comes after paint, so they go on again afterwards.',
  );
  expect(viewport.props.shopPick.pick).toBe(null);
  act(() => fireEvent.click(within(confirm).getByRole('button', { name: 'Paint and remove prints' })));
  harness.rerender();
  const painted = harness.model();
  expect(painted.prints).toEqual([]);
  expect(painted.finishes.map((f) => [f.instanceId, f.name, f.colour, f.kind, f.gloss, f.thickness])).toEqual([
    ['plate', 'RAL 9005 Jet black', '#0e0e10', 'powder', 'satin', 70],
    ['web', 'RAL 9005 Jet black', '#0e0e10', 'powder', 'satin', 70],
  ]);
  expect(within(panel()).getByRole('status').textContent).toBe('Painted Plate, Web: RAL 9005 Jet black.');
  // Repaint in a custom colour: one row per instance still.
  act(() => fireEvent.change(within(panel()).getByLabelText('Custom colour'), { target: { value: '#123456' } }));
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Repaint' })));
  harness.rerender();
  expect(harness.model().finishes.map((f) => [f.instanceId, f.colour, f.name])).toEqual([
    ['plate', '#123456', 'Custom #123456'],
    ['web', '#123456', 'Custom #123456'],
  ]);
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Strip paint' })));
  harness.rerender();
  expect(harness.model().finishes).toEqual([]);
  key('Escape');
  expect(viewport.props.shopPick).toMatchObject({ stage: 'pick', targets: [] });
  key('Escape');
  expect(viewport.props.shopPick).toBe(null);
  expect(screen.queryByRole('region', { name: 'Paint booth' })).toBe(null);
  expect(route('Paint').getAttribute('aria-current')).toBe(null);
});

it('prints: places the artwork on the picked face in the part frame, edits and drags it, refuses a curved face', () => {
  const harness = setup(shopModel());
  run('Print');
  const panel = () => station('Print station');
  expect(viewport.props.shopPick).toMatchObject({ station: 'print', stage: 'face', pick: 'face' });
  fill(panel(), 'Text', 'ACME');
  fill(panel(), 'Width (mm)', 30);
  fill(panel(), 'Text height (mm)', 3);
  expect(readout(panel(), 'Text size')).toBe('Text 3 mm ≈ 8.5 pt (silk-screen holds 9 pt and up)');
  // A curved face is refused for silk-screen.
  pick(plateFace('plate', 1.5, { planar: false }));
  expect(within(panel()).getByRole('alert').textContent).toBe(
    'Silk-screen needs a flat face: pick a flat face, or use pad printing for a curved one.',
  );
  expect(harness.setCadModel).not.toHaveBeenCalled();
  pick(plateFace());
  harness.rerender();
  let [print] = harness.model().prints;
  expect(print).toMatchObject({
    instanceId: 'plate',
    origin: [70, 0, 1.5],
    x: [1, 0, 0],
    normal: [0, 0, 1],
    width: 30,
    height: 3,
    rotation: 0,
    method: 'silk',
    kind: 'text',
    text: 'ACME',
    font: 'sans-serif',
    colour: '#111111',
  });
  expect(viewport.props.shopPick).toMatchObject({ stage: 'artwork', printId: print.id });
  // On a bare part, under 9 pt: the note and the warning.
  expect(within(panel()).getByRole('alert').textContent).toMatch(/^Silk-screen text 3 mm high is 8.5 pt/);
  expect(within(panel()).getByText(/bare-metal marking/)).toBeTruthy();
  // The placed print's fields edit the model.
  fill(panel(), 'Text height (mm)', 10);
  harness.rerender();
  [print] = harness.model().prints;
  expect(print.height).toBe(10);
  expect(within(panel()).queryByRole('alert')).toBe(null);
  // A drag in the viewport commits the new centre (part frame) once.
  const commits = harness.setCadModel.mock.calls.length;
  act(() => {
    viewport.props.onShopPrintMove(print.id, [80, 5, 1.5]);
  });
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 1);
  harness.rerender();
  expect(harness.model().prints[0].origin).toEqual([80, 5, 1.5]);
  // Another face moves it there.
  pick(plateFace('lid', 31.5));
  harness.rerender();
  expect(harness.model().prints[0]).toMatchObject({ instanceId: 'lid', origin: [70, 0, 31.5] });
  // New print, then Esc out; Remove in the list.
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'New print' })));
  expect(viewport.props.shopPick).toMatchObject({ stage: 'face', printId: null });
  act(() =>
    fireEvent.click(
      within(within(panel()).getByRole('list', { name: 'Prints' })).getByRole('button', { name: 'Remove' }),
    ),
  );
  harness.rerender();
  expect(harness.model().prints).toEqual([]);
  key('Escape');
  expect(viewport.props.shopPick).toBe(null);
});

it('steps back when the parts its picks name go away (an Undo)', () => {
  const harness = setup(shopModel());
  run('Paint');
  pick({ kind: 'part', instanceId: 'web' });
  expect(viewport.props.shopPick).toMatchObject({ stage: 'colour', targets: ['web'] });
  act(() =>
    harness.setCadModel({ ...harness.model(), instances: harness.model().instances.filter((i) => i.id !== 'web') }),
  );
  harness.rerender();
  expect(viewport.props.shopPick).toMatchObject({ stage: 'pick', targets: [] });
});
