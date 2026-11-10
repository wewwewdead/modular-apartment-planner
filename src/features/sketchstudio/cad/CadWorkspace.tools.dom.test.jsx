// @vitest-environment jsdom
// How one workstation tool gives way to another: a placed mate ends when the
// selection changes, selecting during an operation puts isolation back,
// "Apply and place another" does not open over a tool started meanwhile, and
// the hole buttons wait for a mate or a busy export. Kernel hook, viewport and
// the workshop exporters are stand-ins.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { createPart, emptyModel } from './model.js';

const viewport = vi.hoisted(() => ({ props: null }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'current',
    ready: true,
    snapshot: {
      parameters: {},
      parts: model.parts.map((p) => ({
        id: p.id,
        features: {},
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
    // Solids for STEP never arrive, so that export stays busy.
    request: vi.fn((type) => (type === 'solids' ? new Promise(() => {}) : Promise.resolve([]))),
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
      getBounds: () => [
        [0, 0, 0],
        [600, 400, 18],
      ],
      isDragging: () => false,
      getCanvas: () => null,
      getGroupPoses: () => new Map(),
      getSceneSpan: () => 1000,
      viewDropPoint: () => [0, 0, 0],
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
vi.mock('./exports.js', () => ({ workshopZip: vi.fn() }));

afterEach(cleanup);

// A board and a tube; `grouped` puts the tube and a second one in Group 1.
function setup({ grouped = false } = {}) {
  const board = createPart('board');
  const tube = createPart('member');
  let current = {
    ...emptyModel(),
    parts: [
      { ...board.part, id: 'board' },
      { ...tube.part, id: 'tube' },
    ],
    instances: [
      { id: 'b1', partId: 'board', name: '', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 't1', partId: 'tube', name: '', position: [800, 0, 0], rotation: [0, 0, 0] },
      ...(grouped
        ? [{ id: 't2', partId: 'tube', name: '', position: [900, 0, 0], rotation: [0, 0, 0], groupId: 'g1' }]
        : []),
    ].map((i) => (grouped && i.id === 't1' ? { ...i, groupId: 'g1' } : i)),
    groups: grouped ? [{ id: 'g1', name: 'Group 1', parentId: null }] : [],
  };
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
const ribbonButton = (name) => within(document.querySelector('.cad-ribbon')).getByRole('button', { name });
const ribbon = (name) => act(() => fireEvent.click(ribbonButton(name)));
const openTab = (name) =>
  act(() => fireEvent.click(within(document.querySelector('.cad-tab-buttons')).getByRole('button', { name })));
const toolbarButton = (name) => within(document.querySelector('.cad-view-toolbar')).getByRole('button', { name });
const treeBody = () => document.querySelector('.cad-tree-body');
// A tree row by its definition id (the small text under the name).
const treeRow = (partId) =>
  [...document.querySelectorAll('.cad-tree-item')].find((b) => b.querySelector('small')?.textContent === partId);
// The callbacks return perform()'s promise; act on the synchronous part only.
const pickFace = (info) =>
  act(() => {
    viewport.props.onPickSketchFace({ planar: true, ...info });
  });
const place = (info) =>
  act(() => {
    viewport.props.onPlace(info);
  });
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
// Mate faces: the tube's underside onto the board's top face.
function mateTubeOntoBoard() {
  openTab('Assemble');
  ribbon('Mate faces');
  expect(viewport.props.sketchMode).toBe('pick');
  pickFace({ instanceId: 't1', partId: 'tube', point: [800, 0, 0], normal: [0, 0, -1] });
  pickFace({ instanceId: 'b1', partId: 'board', point: [0, 0, 18], normal: [0, 0, 1] });
}

it('Mate faces walks the two picks; Done keeps the move and selects the moved part', () => {
  const { setCadModel, model, rerender } = setup();
  openTab('Assemble');
  ribbon('Mate faces');
  expect(viewport.props.pickHint).toContain('click a flat face on the part to move');
  pickFace({ instanceId: 't1', partId: 'tube', point: [800, 0, 0], normal: [0, 0, -1] });
  expect(viewport.props.pickHint).toContain('click the face it should sit against');
  pickFace({ instanceId: 'b1', partId: 'board', point: [0, 0, 18], normal: [0, 0, 1] });
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(model().instances.find((i) => i.id === 't1').position).toEqual([800, 0, 18]);
  rerender();
  // Placed: the view is back to normal clicks while the offset can still change.
  expect(viewport.props.sketchMode).toBeNull();
  expect(screen.getByLabelText('Offset (mm)')).toBeTruthy();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Done' })));
  expect(screen.queryByRole('heading', { name: 'Mate faces' })).toBeNull();
  expect(viewport.props.selectedId).toBe('t1');
  expect(ribbonButton('Mate faces').disabled).toBe(false);
  expect(setCadModel).toHaveBeenCalledOnce();
});

it('Cancel mate after the second pick puts the part back', () => {
  const { setCadModel, model, rerender } = setup();
  mateTubeOntoBoard();
  rerender();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Cancel mate' })));
  expect(setCadModel).toHaveBeenCalledTimes(2);
  expect(model().instances.find((i) => i.id === 't1').position).toEqual([800, 0, 0]);
  expect(ribbonButton('Mate faces').disabled).toBe(false);
});

it.each([
  ['a part', 'b1'],
  ['empty space', null],
])('a placed mate ends when %s is clicked: the move stays and the workspace is free again', (_, clicked) => {
  const { setCadModel, model, rerender } = setup();
  mateTubeOntoBoard();
  rerender();
  act(() => viewport.props.onSelect(clicked));
  expect(screen.queryByRole('heading', { name: 'Mate faces' })).toBeNull();
  expect(viewport.props.selectedId).toBe(clicked);
  // The ribbon and the parts tree answer again; the committed move is kept.
  expect(ribbonButton('Mate faces').disabled).toBe(false);
  expect(treeBody().disabled).toBe(false);
  expect(setCadModel).toHaveBeenCalledOnce();
  expect(model().instances.find((i) => i.id === 't1').position).toEqual([800, 0, 18]);
});

it('closing the open group mid-mate ends the mate with nothing moved', () => {
  const { setCadModel } = setup({ grouped: true });
  act(() => viewport.props.onSelect('t1', { open: true }));
  const banner = screen.getByRole('button', { name: 'Inside Group 1 · Close (Esc)' });
  openTab('Assemble');
  ribbon('Mate faces');
  expect(viewport.props.sketchMode).toBe('pick');
  act(() => fireEvent.click(banner));
  expect(viewport.props.sketchMode).toBeNull();
  expect(viewport.props.pickHint).toBeUndefined();
  expect(ribbonButton('Mate faces').disabled).toBe(false);
  expect(setCadModel).not.toHaveBeenCalled();
});

it('selecting another part from the tree during an operation drops it and restores isolation', () => {
  setup();
  ribbon('Hole');
  expect(viewport.props.isolated).toBe(false);
  place(topFace());
  expect(viewport.props.isolated).toBe(true);
  act(() => fireEvent.click(treeRow('tube')));
  expect(viewport.props.placement).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Place hole' })).toBeNull();
  expect(viewport.props.selectedId).toBe('t1');
  expect(viewport.props.isolated).toBe(false);
});

it('Apply restores isolation and selects the shaped part, as before', () => {
  setup();
  ribbon('Hole');
  place(topFace());
  expect(viewport.props.isolated).toBe(true);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply hole' })));
  expect(viewport.props.selectedId).toBe('b1');
  expect(viewport.props.isolated).toBe(false);
});

it('a sketch started before the rebuild keeps the view: Apply and place another does not reopen over it', () => {
  const { setCadModel, rerender } = setup();
  ribbon('Hole');
  place(topFace());
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply and place another' })));
  expect(setCadModel).toHaveBeenCalledOnce();
  // S before the committed model has come back.
  press('s');
  expect(viewport.props.sketchMode).toBe('pick');
  rerender();
  expect(screen.queryByRole('heading', { name: 'Place hole' })).toBeNull();
  expect(viewport.props.placement).toBeNull();
  expect(viewport.props.sketchMode).toBe('pick');
  expect(screen.getByRole('heading', { name: 'New sketch' })).toBeTruthy();
  // The dropped reopen does not come back once the sketch is put away.
  press('Escape');
  rerender();
  expect(viewport.props.sketchMode).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Place hole' })).toBeNull();
});

it('Place holes and Move holes wait while a mate is running', () => {
  setup();
  act(() => viewport.props.onSelect('b1'));
  expect(toolbarButton('Place holes').disabled).toBe(false);
  expect(toolbarButton('Move holes').disabled).toBe(false);
  openTab('Assemble');
  ribbon('Mate faces');
  expect(toolbarButton('Place holes').disabled).toBe(true);
  expect(toolbarButton('Move holes').disabled).toBe(true);
});

it('Place holes and Move holes wait while an export is busy', async () => {
  setup();
  act(() => viewport.props.onSelect('b1'));
  openTab('Manufacture');
  ribbon('STEP assembly');
  await act(async () => {});
  expect(document.querySelector('.cad-status').textContent).toContain('Preparing workshop output');
  expect(toolbarButton('Place holes').disabled).toBe(true);
  expect(toolbarButton('Move holes').disabled).toBe(true);
});
