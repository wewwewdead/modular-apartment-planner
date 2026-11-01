// @vitest-environment jsdom
// Direct placement in the workspace (Phase H): an operation opens in Place
// with every part clickable, a click isolates the shaped part, Re-place goes
// back, Esc walks back one step or cancels (restoring selection and
// isolation), Enter finishes a path or applies, choosing Operation stops the
// inference, and R / M switch a boolean tool gizmo. Kernel hook and viewport
// are stand-ins.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { createPart, emptyModel } from './model.js';
import { LIVE_DEBOUNCE_MS } from './liveField.js';

// dropPoint: what the viewport reports as the ground under the view centre.
const viewport = vi.hoisted(() => ({ props: null, dragging: false, dropPoint: [1250, -480, 0] }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'current',
    ready: true,
    snapshot: {
      parameters: {},
      parts: model.parts.map((p) => ({
        id: p.id,
        // Hole rows (Phase M tests) report their centres, as the kernel does.
        features: Object.fromEntries(
          p.features
            .filter((f) => f.type === 'hole' && f.row && f.position)
            .map((f) => [
              f.id,
              {
                cut: { position: f.position, direction: f.direction, widthDirection: [1, 0, 0] },
                row: {
                  ...f.row,
                  centres: Array.from({ length: f.row.count }, (_, k) =>
                    f.position.map((v, i) => v + f.row.direction[i] * f.row.pitch * k),
                  ),
                },
              },
            ]),
        ),
        bounds: [
          [0, 0, 0],
          [600, 400, 18],
        ],
      })),
      instances: model.instances.map((i) => ({
        id: i.id,
        partId: i.partId,
        bounds: [
          [0, 0, 0],
          [600, 400, 18],
        ],
        placement: [],
      })),
    },
    request: vi.fn(async () => [{ plane: 'XY', offset: 18, label: 'Top (XY)', edges: 4, faces: 1 }]),
    retry() {},
    cancel() {},
  }),
}));
vi.mock('./CadViewport.jsx', () => ({
  default: function ViewportStandIn({ ref, ...props }) {
    useImperativeHandle(ref, () => ({
      getInstanceBounds: () => [
        [0, 0, 0],
        [600, 400, 18],
      ],
      isDragging: () => viewport.dragging,
      getCanvas: () => null,
      getGroupPoses: () => new Map(),
      getSceneSpan: () => 1000,
      viewDropPoint: () => viewport.dropPoint,
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));

afterEach(() => {
  cleanup();
  viewport.dragging = false;
});

function setup(initial) {
  const board = createPart('board');
  const tube = createPart('member');
  const model = initial || {
    ...emptyModel(),
    parts: [
      { ...board.part, id: 'board' },
      { ...tube.part, id: 'tube' },
    ],
    instances: [
      { id: 'b1', partId: 'board', name: '', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 't1', partId: 'tube', name: '', position: [800, 0, 0], rotation: [0, 0, 0] },
    ],
  };
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
  return { setCadModel, rerender: () => view.rerender(workspace()), model: () => current };
}
const press = (key, init = {}, target = window) => act(() => fireEvent.keyDown(target, { key, ...init }));
const ribbon = (name) =>
  act(() => fireEvent.click(within(document.querySelector('.cad-ribbon')).getByRole('button', { name })));
const topFace = (point = [120, 60, 18]) => ({
  kind: 'face',
  planar: true,
  instanceId: 'b1',
  partId: 'board',
  point,
  normal: [0, 0, 1],
  faceFrame: { origin: [0, 0, 18], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1] },
  outline: [
    [
      [0, 0],
      [600, 0],
    ],
    [
      [600, 0],
      [600, 400],
    ],
  ],
});
// The callbacks return perform()'s promise; act on the synchronous part only.
const place = (info) =>
  act(() => {
    viewport.props.onPlace(info);
  });
const dragged = (change) =>
  act(() => {
    viewport.props.onPlacementDrag(change);
  });

it('opens Extrude in Place unisolated, isolates the clicked part, and Esc restores everything', () => {
  setup();
  expect(viewport.props.selectedId).toBeNull();
  expect(viewport.props.isolated).toBe(false);
  ribbon('Extrude');
  expect(screen.getByRole('heading', { name: 'Place extrude' })).toBeTruthy();
  expect(viewport.props.placement).toMatchObject({ stage: 'place', pick: 'face', allowGround: true });
  expect(viewport.props.placement.hint).toContain('Extrude: click a flat face to place the profile');
  // Every part stays clickable while placing.
  expect(viewport.props.isolated).toBe(false);
  expect(screen.getByRole('status').textContent).toBe('Click in the viewport to place the operation.');
  place(topFace());
  // The part you click is the part you shape: selected and isolated, not the tube.
  expect(viewport.props.selectedId).toBe('b1');
  expect(viewport.props.isolated).toBe(true);
  expect(viewport.props.placement.stage).toBe('shape');
  expect(viewport.props.placement.handles.map((h) => h.id)).toEqual(['distance', 'slide', 'corner']);
  expect(screen.getByText('On Board / plate · top face · profile 40 × 40 mm at (120, 60) · along +Z')).toBeTruthy();
  expect(screen.getByLabelText('Length (mm)').value).toBe('18');
  expect(screen.getByLabelText('Width (mm)').value).toBe('40');
  expect(screen.getByText('Operation (auto)')).toBeTruthy();
  // Esc cancels: selection and isolation come back.
  press('Escape');
  expect(screen.queryByRole('heading', { name: 'Place extrude' })).toBeNull();
  expect(viewport.props.selectedId).toBeNull();
  expect(viewport.props.isolated).toBe(false);
  expect(viewport.props.placement).toBeNull();
});

it('a selected square tube keeps its hollow end start in Shape; Re-place places a profile anew', () => {
  setup();
  act(() => viewport.props.onSelect('t1'));
  ribbon('Extrude');
  expect(viewport.props.placement).toMatchObject({ stage: 'shape', mode: 'stored' });
  const arrow = viewport.props.placement.handles.find((h) => h.id === 'distance');
  // The copied section sits on the tube's far end (z = 700), extruding along it.
  expect(arrow.origin.map((v) => Math.round(v))).toEqual([0, 0, 700]);
  expect(arrow.direction.map((v) => Math.round(v))).toEqual([0, 0, 1]);
  expect(screen.getByText(/Copied member section · profile/)).toBeTruthy();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Re-place' })));
  expect(viewport.props.placement).toMatchObject({ stage: 'place', pick: 'face' });
  place(topFace());
  expect(viewport.props.selectedId).toBe('b1');
  expect(viewport.props.placement.stage).toBe('shape');
});

it('Re-place goes back to Place (unisolated); a completed drag updates the draft once', () => {
  setup();
  ribbon('Extrude');
  place(topFace());
  dragged({ id: 'distance', value: -6 });
  expect(screen.getByLabelText('Length (mm)').value).toBe('6');
  expect(screen.getByLabelText('Operation').value).toBe('cut');
  expect(viewport.props.placement.cut).toBe(true);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Re-place' })));
  expect(viewport.props.placement.stage).toBe('place');
  expect(viewport.props.isolated).toBe(false);
  // The next click re-places, keeping the length.
  place(topFace([300, 200, 18]));
  expect(viewport.props.placement.stage).toBe('shape');
  expect(screen.getByLabelText('Length (mm)').value).toBe('6');
});

it('choosing Operation by hand stops the drag-direction inference', () => {
  setup();
  ribbon('Extrude');
  place(topFace());
  expect(viewport.props.placement.inference.active).toBe(true);
  act(() => fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'intersect' } }));
  expect(screen.queryByText('Operation (auto)')).toBeNull();
  expect(viewport.props.placement.inference.active).toBe(false);
  dragged({ id: 'distance', value: -6 });
  expect(screen.getByLabelText('Operation').value).toBe('intersect');
});

it('Enter applies the placed extrude, then selects the part and restores isolation', () => {
  const { setCadModel, model } = setup();
  ribbon('Extrude');
  place(topFace());
  dragged({ id: 'distance', value: 25 });
  // Enter inside a field does not apply.
  press('Enter', {}, screen.getByLabelText('Length (mm)'));
  expect(setCadModel).not.toHaveBeenCalled();
  // Apply keeps the camera where the user left it: no Fit request.
  const fitKey = viewport.props.fitKey;
  press('Enter');
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(viewport.props.fitKey).toBe(fitKey);
  const feature = model().parts[0].features.at(-1);
  expect(feature).toMatchObject({ type: 'extrude', operation: 'add', length: 25 });
  expect(model().sketches.at(-1)).toMatchObject({ plane: 'XY', origin: [120, 60, 18] });
  expect(viewport.props.isolated).toBe(false);
  expect(viewport.props.placement).toBeNull();
});

it('Esc during a viewport drag is left to the viewport', () => {
  setup();
  ribbon('Extrude');
  place(topFace());
  viewport.dragging = true;
  press('Escape');
  expect(viewport.props.placement.stage).toBe('shape');
  viewport.dragging = false;
  press('Escape');
  expect(viewport.props.placement).toBeNull();
});

it('Sweep: Esc removes the last point, Enter finishes the path (2+ points), the panel shows Bend radius', () => {
  setup();
  ribbon('Sweep');
  expect(viewport.props.placement.hint).toContain('Sweep: click where the path starts');
  const front = { ...topFace([300, 0, 18]), normal: [0, -1, 0], faceFrame: undefined, outline: [] };
  place(front);
  place({ kind: 'path', point: [300, 0, 138] });
  place({ kind: 'path', point: [450, 0, 138] });
  expect(viewport.props.placement.path.points).toHaveLength(3);
  expect(screen.getByRole('button', { name: 'Finish path' }).disabled).toBe(false);
  press('Escape');
  expect(viewport.props.placement.path.points).toHaveLength(2);
  press('Enter');
  expect(viewport.props.placement.stage).toBe('shape');
  expect(viewport.props.isolated).toBe(true);
  expect(screen.getByLabelText('Bend radius (mm)').value).toBe('10');
  expect(screen.getByLabelText('Radius (mm)').value).toBe('5');
  expect(screen.getByRole('button', { name: 'Redraw path' })).toBeTruthy();
  expect(viewport.props.placement.handles.map((h) => h.id)).toEqual(['section']);
  // Esc in Shape cancels the operation.
  press('Escape');
  expect(viewport.props.placement).toBeNull();
});

it('Sweep with no points: Esc cancels the operation', () => {
  setup();
  ribbon('Sweep');
  press('Escape');
  expect(viewport.props.placement).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Place sweep' })).toBeNull();
});

it('Subtract shows the tool gizmo; R / M switch it while the draft is open', () => {
  setup();
  act(() => viewport.props.onSelect('b1'));
  ribbon('Subtract');
  expect(viewport.props.placement.toolGizmo).toMatchObject({ partId: 'tube', hostInstanceId: 'b1' });
  expect(viewport.props.placement.hint).toContain('Subtract: drag the tool ghost');
  expect(viewport.props.transformMode).toBe('translate');
  press('r');
  expect(viewport.props.transformMode).toBe('rotate');
  press('m');
  expect(viewport.props.transformMode).toBe('translate');
  dragged({ id: 'tool', value: { position: [310, 200, 9], rotation: [0, 0, 90] } });
  const position = within(screen.getByRole('group', { name: 'Position (part mm)' }));
  expect(position.getByLabelText('X').value).toBe('310');
  const rotation = within(screen.getByRole('group', { name: 'Rotation (degrees)' }));
  expect(rotation.getByLabelText('Z').value).toBe('90');
});

it('Fillet: a face click picks the reference; Mirror requires a face square to an axis', async () => {
  setup();
  act(() => viewport.props.onSelect('b1'));
  await act(async () => ribbon('Fillet'));
  expect(viewport.props.placement).toMatchObject({ pick: 'reference', pickInstanceId: 'b1' });
  place(topFace([300, 200, 18]));
  expect(screen.getByText('Picked Top (XY) in the viewport')).toBeTruthy();
  press('Escape');
  act(() => viewport.props.onSelect('b1'));
  ribbon('Mirror');
  expect(viewport.props.placement).toMatchObject({ stage: 'place', pick: 'plane' });
  place({ ...topFace([300, 200, 18]), normal: [0, 0.6, 0.8] });
  expect(screen.getByRole('alert').textContent).toContain('Mirror needs a face square to X, Y or Z');
  place(topFace([300, 200, 18]));
  expect(viewport.props.placement.stage).toBe('shape');
  expect(screen.getByLabelText('Mirror plane').value).toBe('XY');
});

// Phase J: Hole, Pocket, Transform and Hardware open in the stage machine.
it('Hole opens in Place with no feature; a click stores coordinates; Apply adds it; the tree form is unchanged', () => {
  const { setCadModel, model, rerender } = setup();
  ribbon('Hole');
  expect(screen.getByRole('heading', { name: 'Place hole' })).toBeTruthy();
  expect(viewport.props.placement).toMatchObject({ tool: 'hole', stage: 'place', pick: 'face', cut: true });
  expect(viewport.props.placement.hint).toContain('Hole: click a flat face to drill there');
  expect(viewport.props.isolated).toBe(false);
  expect(screen.getByRole('status').textContent).toBe('Click in the viewport to place the operation.');
  expect(screen.queryByLabelText('Diameter (mm)')).toBeNull();
  place(topFace());
  expect(viewport.props.selectedId).toBe('b1');
  expect(viewport.props.isolated).toBe(true);
  expect(viewport.props.placement.handles.map((h) => h.id)).toEqual(['distance', 'slide', 'radius']);
  expect(screen.getByText('On Board / plate · top face · Ø 6 mm at (120, 60) · through all')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Re-place' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Apply and place another' })).toBeTruthy();
  for (const label of ['Diameter (mm)', 'Cut extent']) expect(screen.getByLabelText(label)).toBeTruthy();
  expect(screen.getByText('Hole purpose')).toBeTruthy();
  // The location fieldset sits, collapsed, under Exact placement (mm).
  const exact = screen.getByText('Exact placement (mm)').closest('details');
  expect(exact.open).toBe(false);
  expect(within(exact).getByLabelText('Cut placement').value).toBe('coordinates');
  expect(within(exact).getByRole('group', { name: 'Cut start (part mm)' })).toBeTruthy();
  dragged({ id: 'distance', value: 3 });
  expect(screen.getByLabelText('Cut extent').value).toBe('blind');
  expect(screen.getByLabelText('Depth (mm)').value).toBe('3');
  const fitKey = viewport.props.fitKey;
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply hole' })));
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(viewport.props.fitKey).toBe(fitKey);
  const hole = model().parts[0].features.at(-1);
  expect(hole).toMatchObject({
    type: 'hole',
    position: [120, 60, 18],
    direction: [0, 0, -1],
    depth: 3,
    throughAll: false,
  });
  expect(hole.placement).toBeUndefined();
  rerender();
  // The tree editor: Edit hole with preview above the unchanged form.
  expect(screen.getByRole('button', { name: 'Edit hole with preview' })).toBeTruthy();
  // Label text without the options of a select inside it.
  const labelText = (node) => {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('select').forEach((select) => select.remove());
    return copy.textContent.replace(/\s+/g, ' ').trim();
  };
  const labels = [...document.querySelector('.cad-properties').querySelectorAll('label, legend')]
    .map(labelText)
    .filter((text) =>
      /^(Hole purpose|Lock hole position|Diameter|Cut extent|Depth|Cut placement|Cut start|Cut direction)/.test(text),
    );
  expect(labels).toEqual([
    'Hole purpose',
    'Lock hole position',
    'Diameter (mm)',
    'Cut extent',
    'Depth (mm)',
    'Cut placement',
    'Cut start (part mm)',
    'Cut direction (into material)',
  ]);
  expect(screen.getByRole('button', { name: 'Move hole on surface' })).toBeTruthy();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Edit hole with preview' })));
  expect(viewport.props.placement).toMatchObject({ tool: 'hole', stage: 'shape' });
  expect(viewport.props.placement.handles.map((h) => h.id)).toEqual(['distance', 'slide', 'radius']);
});

it('Pocket places a rectangle; its corner grip sets width and length', () => {
  setup();
  ribbon('Pocket');
  place(topFace([200, 100, 18]));
  expect(viewport.props.placement.handles.map((h) => h.id)).toEqual(['distance', 'slide', 'corner']);
  dragged({ id: 'corner', value: { width: 30, height: 14 } });
  expect(screen.getByLabelText('Pocket width (mm)').value).toBe('30');
  expect(screen.getByLabelText('Pocket length (mm)').value).toBe('14');
  expect(screen.getByLabelText('Pocket profile').value).toBe('rectangle');
  expect(screen.getByText('On Board / plate · top face · 30 × 14 mm at (200, 100) · depth 5 mm')).toBeTruthy();
});

it('Transform opens in Shape with the tool gizmo on the part itself; R switches it', () => {
  setup();
  act(() => viewport.props.onSelect('b1'));
  ribbon('Transform');
  expect(screen.getByRole('heading', { name: 'Place transform' })).toBeTruthy();
  expect(viewport.props.placement).toMatchObject({ stage: 'shape' });
  expect(viewport.props.placement.toolGizmo).toMatchObject({ self: true, partId: 'board', hostInstanceId: 'b1' });
  expect(screen.getByText('Drag the ghost in the viewport (M move, R rotate)')).toBeTruthy();
  press('r');
  expect(viewport.props.transformMode).toBe('rotate');
  dragged({ id: 'tool', value: { position: [0, 0, 25], rotation: [0, 0, 0] } });
  const position = within(screen.getByRole('group', { name: 'Position (part mm)' }));
  expect(position.getByLabelText('Z').value).toBe('25');
});

it('Add hardware without a hole to attach opens Place; a click seats it; Apply adds the part', () => {
  const { setCadModel, model } = setup();
  ribbon('Hardware library');
  expect(screen.getByText(/click a flat face in the view to seat it there/)).toBeTruthy();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Add hardware' })));
  expect(screen.getByRole('heading', { name: 'Place hardware' })).toBeTruthy();
  expect(viewport.props.placement).toMatchObject({ tool: 'hardware', stage: 'place', pick: 'face', allowGround: true });
  expect(setCadModel).not.toHaveBeenCalled();
  place(topFace());
  // The board it sits on stays in view.
  expect(viewport.props.isolated).toBe(false);
  expect(screen.getByText('Hex bolt M3 on Board / plate · top face at (120, 60)')).toBeTruthy();
  const fitKey = viewport.props.fitKey;
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply hardware' })));
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(viewport.props.fitKey).toBe(fitKey);
  const instance = model().instances.at(-1);
  expect(instance).toMatchObject({ position: [120, 60, 18], rotation: [0, 0, 0] });
  expect(model().parts.at(-1).features).toEqual([expect.objectContaining({ type: 'hardware', kind: 'bolt' })]);
  expect(viewport.props.selectedId).toBe(instance.id);
});

// Phase N (docs/sketch-studio-screw-library.md §10): a screw kind takes the
// same Place → face → Apply path and commits its head / drive / point.
it('Add hardware: a socket head cap screw M6 seats on a face and commits with its hex socket', () => {
  const { setCadModel, model } = setup();
  ribbon('Hardware library');
  act(() => fireEvent.change(screen.getByLabelText('Hardware type'), { target: { value: 'socket-cap' } }));
  // The bolt's M3 is a valid socket-cap size and survives; choose M6.
  act(() => fireEvent.change(screen.getByLabelText('Metric size'), { target: { value: 'M6' } }));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Add hardware' })));
  expect(screen.getByRole('heading', { name: 'Place hardware' })).toBeTruthy();
  place(topFace());
  expect(screen.getByText('Socket head cap screw M6 on Board / plate · top face at (120, 60)')).toBeTruthy();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply hardware' })));
  expect(setCadModel).toHaveBeenCalledOnce();
  const part = model().parts.at(-1);
  expect(part.name).toBe('Socket head cap screw M6');
  expect(part.features[0]).toMatchObject({
    kind: 'socket-cap',
    head: 'socket-cap',
    drive: 'hex-socket',
    point: 'blunt',
  });
  expect(model().instances.at(-1)).toMatchObject({ position: [120, 60, 18], rotation: [0, 0, 0] });
});

it('Apply and place another commits the hole and reopens Hole in Place with the same sizes', () => {
  const { setCadModel, model, rerender } = setup();
  ribbon('Hole');
  place(topFace());
  dragged({ id: 'radius', value: { radius: 1.7 } });
  dragged({ id: 'distance', value: 4 });
  const fitKey = viewport.props.fitKey;
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply and place another' })));
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(model().parts[0].features.at(-1)).toMatchObject({ type: 'hole', diameter: 3.4, depth: 4 });
  rerender();
  expect(viewport.props.fitKey).toBe(fitKey);
  expect(screen.getByRole('heading', { name: 'Place hole' })).toBeTruthy();
  expect(viewport.props.placement).toMatchObject({ tool: 'hole', stage: 'place' });
  place(topFace([300, 300, 18]));
  expect(screen.getByLabelText('Diameter (mm)').value).toBe('3.4');
  expect(screen.getByLabelText('Depth (mm)').value).toBe('4');
});

it('Board / plate lands centred on the view drop point, on the ground, without a Fit', () => {
  const { setCadModel, model } = setup();
  const fitKey = viewport.props.fitKey;
  ribbon('Board / plate');
  expect(setCadModel).toHaveBeenCalledOnce();
  const instance = model().instances.at(-1);
  const box = model().parts.find((p) => p.id === instance.partId).features[0];
  expect(box).toMatchObject({ type: 'box', width: 600, depth: 400 });
  // Footprint centre (part-local 300, 200) under the drop point; z = 0.
  expect(instance.position).toEqual([1250 - 300, -480 - 200, 0]);
  expect(instance.rotation).toEqual([0, 0, 0]);
  expect(viewport.props.selectedId).toBe(instance.id);
  expect(viewport.props.fitKey).toBe(fitKey);
});

it('Tube / member lands with its axis through the view drop point, without a Fit', () => {
  const { model } = setup();
  const fitKey = viewport.props.fitKey;
  ribbon('Tube / member');
  const instance = model().instances.at(-1);
  expect(model().parts.find((p) => p.id === instance.partId).features[0]).toMatchObject({
    type: 'member',
    start: [0, 0, 0],
    end: [0, 0, 700],
  });
  expect(instance.position).toEqual([1250, -480, 0]);
  expect(instance.rotation).toEqual([0, 0, 0]);
  expect(viewport.props.fitKey).toBe(fitKey);
});

it('on an empty model the Start list Board lands at the drop point with no Fit and no preview flag', () => {
  const startBoard = () =>
    act(() =>
      fireEvent.click(within(document.querySelector('.cad-start')).getByRole('button', { name: 'Board / plate' })),
    );
  // Moved view: centred on the drop point like any other new board.
  const moved = setup(emptyModel());
  const fitKey = viewport.props.fitKey;
  startBoard();
  moved.rerender();
  expect(moved.model().instances).toHaveLength(1);
  expect(moved.model().instances[0].position).toEqual([950, -680, 0]);
  expect(viewport.props.fitKey).toBe(fitKey);
  expect(viewport.props.previewShown).toBe(false);
  cleanup();
  // A new model's untouched view drops at the origin: the board is centred
  // on it (its box is built from the corner, so the corner sits at -300, -200).
  viewport.dropPoint = [0, 0, 0];
  try {
    const fresh = setup(emptyModel());
    startBoard();
    fresh.rerender();
    expect(fresh.model().instances[0].position).toEqual([-300, -200, 0]);
    expect(fresh.model().instances[0].rotation).toEqual([0, 0, 0]);
    expect(viewport.props.fitKey).toBe(fitKey);
    expect(viewport.props.previewShown).toBe(false);
  } finally {
    viewport.dropPoint = [1250, -480, 0];
  }
});

it('opening another document while the workspace stays mounted asks for one Fit', () => {
  const opened = createPart('board');
  const documents = [
    { id: 'doc', name: 'Empty', entities: [], model: emptyModel() },
    {
      id: 'opened',
      name: 'Opened',
      entities: [],
      model: { ...emptyModel(), parts: [opened.part], instances: [opened.instance] },
    },
  ];
  const workspace = (document) => (
    <MemoryRouter>
      <CadWorkspace document={document} setCadModel={vi.fn()} documentPersistence={{}} />
    </MemoryRouter>
  );
  const view = render(workspace(documents[0]));
  const fitKey = viewport.props.fitKey;
  view.rerender(workspace(documents[1]));
  expect(viewport.props.fitKey).toBe(fitKey + 1);
  // Edits to the same document (same id) never refit.
  view.rerender(workspace({ ...documents[1], model: { ...documents[1].model } }));
  expect(viewport.props.fitKey).toBe(fitKey + 1);
});

it('Apply never asks for a Fit; on an empty model the preview is flagged so it cannot trigger the first fit', () => {
  const { setCadModel, model, rerender } = setup(emptyModel());
  const fitKey = viewport.props.fitKey;
  expect(viewport.props.previewShown).toBe(false);
  ribbon('Extrude');
  place({ kind: 'ground', planar: true, point: [100, 50, 0], normal: [0, 0, 1] });
  expect(viewport.props.placement.stage).toBe('shape');
  // The viewport is showing the first part's preview, not committed geometry.
  expect(viewport.props.previewShown).toBe(true);
  expect(viewport.props.snapshot.instances).toHaveLength(1);
  press('Enter');
  expect(setCadModel).toHaveBeenCalledOnce();
  rerender();
  // Committed: the same part now arrives as saved geometry, with no Fit request.
  expect(model().instances).toHaveLength(1);
  expect(viewport.props.previewShown).toBe(false);
  expect(viewport.props.snapshot.instances).toHaveLength(1);
  expect(viewport.props.fitKey).toBe(fitKey);
});

// Phase K (docs/sketch-studio-hole-row.md): Solid → Hole row.
const lastHole = (point, extra = {}) => ({ kind: 'path', point, snapKind: 'grid', step: 1, free: false, ...extra });
const typeInto = (label, value) =>
  act(() => {
    const field = screen.getByLabelText(label);
    fireEvent.change(field, { target: { value } });
    fireEvent.blur(field);
  });

it('Hole row: the first click keeps Place, ↑ ↓ change the count, the second click shapes the row, Apply adds one feature', () => {
  const { setCadModel, model, rerender } = setup();
  ribbon('Hole row');
  expect(screen.getByRole('heading', { name: 'Place hole row' })).toBeTruthy();
  expect(screen.getByText(/Drill a straight row of identical holes/)).toBeTruthy();
  expect(viewport.props.placement).toMatchObject({ tool: 'hole', stage: 'place', pick: 'face', cut: true });
  expect(viewport.props.placement.hint).toContain('Hole row: click where the first hole goes');
  place(topFace([100, 100, 18]));
  // The seed: still Place, every part clickable, nothing selected, one hole.
  expect(viewport.props.placement).toMatchObject({ stage: 'place', pick: 'path' });
  expect(viewport.props.placement.hint).toContain('click where the last hole goes');
  expect(viewport.props.placement.row).toMatchObject({ seed: true, count: 4 });
  expect(viewport.props.isolated).toBe(false);
  expect(viewport.props.selectedId).toBeNull();
  expect(
    screen.getByText('First hole on Board / plate · top face at (100, 100) · click where the last hole goes'),
  ).toBeTruthy();
  expect(screen.getByLabelText('Holes in row').value).toBe('4');
  press('ArrowUp');
  expect(viewport.props.placement.hint).toContain('change the count (5)');
  press('ArrowDown');
  expect(viewport.props.placement.hint).toContain('change the count (4)');
  place(lastHole([250, 100, 18]));
  expect(viewport.props.placement.stage).toBe('shape');
  expect(viewport.props.selectedId).toBe('b1');
  expect(viewport.props.isolated).toBe(true);
  expect(viewport.props.placement.handles.map((h) => h.id)).toEqual(['distance', 'slide', 'radius', 'row-end']);
  expect(
    screen.getByText(
      'Row of 4 holes on Board / plate · top face · from (100, 100) along +X · pitch 50 mm · 150 mm · Ø 6 mm · through all',
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText('Spacing (mm)').value).toBe('50');
  expect(screen.getByLabelText('Row length (mm)').value).toBe('150');
  expect(screen.getByLabelText('Row direction').textContent).toBe('+X of face · 0°');
  // ↑ in Shape: one more hole at the same spacing.
  press('ArrowUp');
  expect(screen.getByText(/^Row of 5 holes .* pitch 50 mm · 200 mm/)).toBeTruthy();
  press('ArrowDown');
  // A spacing below the diameter warns, without blocking.
  typeInto('Spacing (mm)', '5');
  expect(
    screen.getByText(/Spacing 5 mm is less than the hole diameter 6 mm: the holes overlap into a slot\./),
  ).toBeTruthy();
  typeInto('Spacing (mm)', '50');
  const fitKey = viewport.props.fitKey;
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply hole row' })));
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(viewport.props.fitKey).toBe(fitKey);
  const features = model().parts[0].features;
  expect(features.filter((f) => f.type === 'hole')).toHaveLength(1);
  expect(features.at(-1)).toMatchObject({
    type: 'hole',
    position: [100, 100, 18],
    direction: [0, 0, -1],
    row: { count: 4, pitch: 50, direction: [1, 0, 0] },
  });
  expect(features.at(-1).placement).toBeUndefined();
  rerender();
  // The tree: one entry, its heading names the count; the Row of holes block edits it.
  expect(screen.getByRole('heading', { name: 'hole ×4 · feature 2' })).toBeTruthy();
  const block = screen.getByRole('group', { name: 'Row of holes' });
  expect(within(block).getByLabelText('Holes in row').value).toBe('4');
  typeInto('Holes in row', '1');
  expect(model().parts[0].features.at(-1).row).toBeUndefined();
  rerender();
  expect(screen.getByRole('heading', { name: 'hole · feature 2' })).toBeTruthy();
  expect(screen.getByText('2 or more makes a straight row from this hole.')).toBeTruthy();
  typeInto('Holes in row', '3');
  // Ø 6 → defaultPitch 25, along the cut's width direction (part +X here).
  expect(model().parts[0].features.at(-1).row).toEqual({ count: 3, pitch: 25, direction: [1, 0, 0] });
});

it('Hole row: Enter in the direction stage takes the default row; Esc there goes back to the first click', () => {
  setup();
  ribbon('Hole row');
  place(topFace([100, 100, 18]));
  press('Escape');
  expect(viewport.props.placement).toMatchObject({ stage: 'place', pick: 'face' });
  expect(viewport.props.placement.hint).toContain('Hole row: click where the first hole goes');
  expect(screen.getByRole('status').textContent).toBe('Click in the viewport to place the operation.');
  // Esc in Place with no seed cancels.
  press('Escape');
  expect(viewport.props.placement).toBeNull();
  ribbon('Hole row');
  place(topFace([100, 100, 18]));
  press('Enter');
  expect(viewport.props.placement.stage).toBe('shape');
  expect(viewport.props.isolated).toBe(true);
  // Ø 6 → 4 × 6 = 24, rounded up to 25 mm, along the face's +X.
  expect(screen.getByText(/^Row of 4 holes .* along \+X · pitch 25 mm · 75 mm/)).toBeTruthy();
});

it('Hole row: Apply and place another reopens as a row with the same count and spacing', () => {
  const { model, rerender } = setup();
  ribbon('Hole row');
  place(topFace([100, 100, 18]));
  press('ArrowUp');
  place(lastHole([300, 100, 18]));
  expect(viewport.props.placement.handles.at(-1).id).toBe('row-end');
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply and place another' })));
  expect(model().parts[0].features.at(-1).row).toEqual({ count: 5, pitch: 50, direction: [1, 0, 0] });
  rerender();
  expect(screen.getByRole('heading', { name: 'Place hole row' })).toBeTruthy();
  expect(viewport.props.placement).toMatchObject({ tool: 'hole', stage: 'place' });
  place(topFace([100, 300, 18]));
  expect(viewport.props.placement.row).toMatchObject({ seed: true, count: 5, pitch: 50 });
  press('Enter');
  expect(screen.getByText(/^Row of 5 holes .* pitch 50 mm · 200 mm/)).toBeTruthy();
});

// Phase M (docs/sketch-studio-hardware-holes.md): hardware in chosen holes.
// A board with a 4-hole row (pitch 50 along +X from (100, 100) on its top)
// and a single hole; the stand-in kernel reports the row's centres. The last
// feature is what a selected instance offers to Attach to selected hole.
function holesSetup({ singleLast = false } = {}) {
  const board = createPart('board');
  const row = {
    id: 'row',
    type: 'hole',
    diameter: 6.6,
    depth: 5,
    throughAll: true,
    position: [100, 100, 18],
    direction: [0, 0, -1],
    row: { count: 4, pitch: 50, direction: [1, 0, 0] },
  };
  const single = {
    id: 'single',
    type: 'hole',
    diameter: 5,
    depth: 5,
    throughAll: true,
    position: [400, 300, 18],
    direction: [0, 0, -1],
  };
  return setup({
    ...emptyModel(),
    parts: [
      {
        ...board.part,
        id: 'board',
        features: [...board.part.features, ...(singleLast ? [row, single] : [single, row])],
      },
    ],
    instances: [{ id: 'b1', partId: 'board', name: '', position: [0, 0, 0], rotation: [0, 0, 0] }],
  });
}
const holeCentre = (k) => ({
  ...topFace([100 + 50 * k, 100, 18]),
  snapKind: 'hole centre',
  holeFeatureId: 'row',
  holeAttachable: true,
  holeIndex: k,
});
const openHardware = () => {
  ribbon('Hardware library');
  act(() => fireEvent.change(screen.getByLabelText('Metric size'), { target: { value: 'M6' } }));
  const attach = screen.queryByLabelText('Attach to selected hole');
  if (attach?.checked) act(() => fireEvent.click(attach));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Add hardware' })));
};
const chosen = () => within(screen.getByRole('list', { name: 'Chosen holes' })).getAllByRole('listitem');

it('Hardware: clicks choose holes in Place, Enter seats one part in all, Remove rebuilds, Apply commits once', () => {
  const { setCadModel, model } = holesSetup();
  const before = model();
  openHardware();
  expect(screen.getByRole('heading', { name: 'Place hardware' })).toBeTruthy();
  expect(viewport.props.placement.hint).toContain('Hardware: click the holes it goes in');
  expect(screen.getByRole('button', { name: 'Seat in 0 holes' }).disabled).toBe(true);
  place(holeCentre(1));
  place(holeCentre(3));
  expect(viewport.props.placement).toMatchObject({ stage: 'place', place: { chosenCount: 2 } });
  expect(viewport.props.isolated).toBe(false);
  expect(viewport.props.placement.shape.kind).toBe('rings');
  expect(chosen().map((li) => li.textContent)).toEqual([
    'Hole 2 of 4 · Board / plateRemove',
    'Hole 4 of 4 · Board / plateRemove',
  ]);
  expect(screen.getByText('Hex bolt M6 · 2 holes chosen on Board / plate · Enter seats it')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Seat in 2 holes' }).disabled).toBe(false);
  // The sizes are in the panel while choosing.
  expect(screen.getByLabelText('Head across flats (mm)')).toBeTruthy();
  // A plain face while holes are chosen: the error, the draft unchanged.
  place(topFace());
  expect(screen.getByRole('alert').textContent).toContain(
    'Click another hole centre to add it, or press Enter to seat the hardware in the chosen holes.',
  );
  expect(viewport.props.placement.place.chosenCount).toBe(2);
  expect(setCadModel).not.toHaveBeenCalled();
  press('Enter');
  expect(viewport.props.placement.stage).toBe('shape');
  expect(screen.getByRole('status').textContent).toBe('Preview ready');
  expect(viewport.props.placement.hint).toContain('Hardware: seated in 2 holes (concentric)');
  expect(viewport.props.placement.handles).toEqual([]);
  expect(viewport.props.isolated).toBe(false);
  expect(screen.getByText('Hex bolt M6 in 2 holes on Board / plate · holes 2 and 4 of the row')).toBeTruthy();
  expect(screen.getByLabelText('Axial offset (mm)').value).toBe('0');
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Remove hole 4 of 4 on Board / plate' })));
  expect(chosen()).toHaveLength(1);
  expect(viewport.props.placement.stage).toBe('shape');
  expect(viewport.props.placement.hint).toContain('seated in the hole you clicked');
  const first = viewport.props.selectedId;
  const fitKey = viewport.props.fitKey;
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply hardware' })));
  expect(setCadModel).toHaveBeenCalledOnce();
  const after = model();
  expect(after.parts).toHaveLength(before.parts.length + 1);
  expect(after.instances).toHaveLength(before.instances.length + 1);
  expect(after.connections).toHaveLength(1);
  const instance = after.instances.at(-1);
  expect(instance.partId).toBe(after.parts.at(-1).id);
  expect(instance).toMatchObject({ position: [150, 100, 18], rotation: [0, 0, 0] });
  expect(after.connections[0]).toMatchObject({
    type: 'concentric',
    from: instance.id,
    to: 'b1',
    toFeatureId: 'row',
    holeIndex: 1,
  });
  expect(viewport.props.fitKey).toBe(fitKey);
  expect(viewport.props.selectedId).toBe(instance.id);
  expect(instance.id).toBe(first);
});

it('Hardware: three holes → one part with three instances and connections; Esc walks back then cancels', () => {
  const { setCadModel, model, rerender } = holesSetup();
  openHardware();
  place(holeCentre(0));
  place(holeCentre(1));
  place(holeCentre(3));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Seat in 3 holes' })));
  expect(viewport.props.placement.stage).toBe('shape');
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply hardware' })));
  expect(setCadModel).toHaveBeenCalledOnce();
  const bolts = model().instances.slice(1);
  expect(bolts).toHaveLength(3);
  expect(new Set(bolts.map((b) => b.partId)).size).toBe(1);
  expect(model().connections.map((c) => c.holeIndex)).toEqual([undefined, 1, 3]);
  rerender();
  // The tree lists every bolt as an ordinary instance; one definition.
  expect(screen.getByText('Assembly · 4 instances')).toBeTruthy();
  expect(screen.getByText('2 definitions · 4 instances')).toBeTruthy();
  // Esc: the last chosen hole goes, then the operation is cancelled with the
  // selection and isolation restored.
  act(() => viewport.props.onSelect('b1'));
  openHardware();
  expect(viewport.props.isolated).toBe(false);
  place(holeCentre(0));
  place(holeCentre(2));
  press('Escape');
  expect(viewport.props.placement.place.chosenCount).toBe(1);
  // Hole 1 already has the bolt applied above (nuts and washers stack).
  expect(chosen().map((li) => li.textContent)).toEqual(['Hole 1 of 4 · Board / plate · has Hex bolt M6Remove']);
  press('Escape');
  expect(viewport.props.placement.place.chosenCount).toBe(0);
  expect(screen.getByRole('heading', { name: 'Place hardware' })).toBeTruthy();
  press('Escape');
  expect(viewport.props.placement).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Place hardware' })).toBeNull();
  expect(viewport.props.selectedId).toBe('b1');
  expect(viewport.props.isolated).toBe(false);
  expect(setCadModel).toHaveBeenCalledOnce();
});

it('Attach to selected hole: a row opens Place with all its holes chosen', () => {
  const { setCadModel, model } = holesSetup();
  act(() => viewport.props.onSelect('b1'));
  ribbon('Hardware library');
  expect(screen.getByLabelText('Attach to selected hole').checked).toBe(true);
  expect(
    screen.getByText("Opens Place with every hole of this row chosen; remove any you don't want, then press Enter."),
  ).toBeTruthy();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Add hardware' })));
  expect(screen.getByRole('heading', { name: 'Place hardware' })).toBeTruthy();
  expect(viewport.props.placement).toMatchObject({ stage: 'place', place: { chosenCount: 4 } });
  expect(chosen()).toHaveLength(4);
  expect(setCadModel).not.toHaveBeenCalled();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Remove hole 3 of 4 on Board / plate' })));
  press('Enter');
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply hardware' })));
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(model().connections.map((c) => c.holeIndex)).toEqual([undefined, 1, 3]);
});

it('Attach to selected hole on a single hole still commits one part, instance and connection at once', () => {
  const { setCadModel, model } = holesSetup({ singleLast: true });
  act(() => viewport.props.onSelect('b1'));
  ribbon('Hardware library');
  expect(screen.getByText(/The seating plane follows this hole/)).toBeTruthy();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Add hardware' })));
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(screen.queryByRole('heading', { name: 'Place hardware' })).toBeNull();
  expect(model().instances).toHaveLength(2);
  expect(model().connections).toEqual([
    expect.objectContaining({
      type: 'concentric',
      from: model().instances[1].id,
      to: 'b1',
      toFeatureId: 'single',
      offset: 0,
    }),
  ]);
  expect('holeIndex' in model().connections[0]).toBe(false);
});

it('Hardware: Axial offset applies as you type (Phase L), keeps the field, and writes every connection', () => {
  vi.useFakeTimers();
  try {
    const { model } = holesSetup();
    openHardware();
    place(holeCentre(0));
    place(holeCentre(2));
    press('Enter');
    const field = screen.getByLabelText('Axial offset (mm)');
    act(() => field.focus());
    act(() => fireEvent.change(field, { target: { value: '-3', selectionStart: 2 } }));
    act(() => vi.advanceTimersByTime(LIVE_DEBOUNCE_MS));
    expect(screen.getByLabelText('Axial offset (mm)')).toBe(field);
    expect(document.activeElement).toBe(field);
    act(() => fireEvent.keyDown(field, { key: 'Enter' }));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply hardware' })));
    expect(model().connections.map((c) => [c.holeIndex, c.offset])).toEqual([
      [undefined, -3],
      [2, -3],
    ]);
  } finally {
    vi.useRealTimers();
  }
});
