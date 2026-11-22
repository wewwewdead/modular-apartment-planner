// @vitest-environment jsdom
// How the workspace's tools and stations end and give way: another document
// ends every session (nothing is finished into it), an Undo of "Apply and
// place another" forgets the tool it would reopen, a station waiting on the
// kernel gives way to a tool started meanwhile, the replay ends Measure, the
// More menu leaves the open station only when its command goes through, a
// press brake whose part goes takes its panel with it, Delete waits for the
// tools that own the view, an operation started from a sketch ends the hole
// tool, and an operation whose references arrive after the selection moved
// does not open. Kernel hook, viewport and sketcher are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
import { createPart, emptyModel, normalizeModel } from './model.js';
import { sheetMetalPart } from './ShopPanels.jsx';
import { sheetMetalControlBox } from './shopExamples.js';
// The whole workspace renders in each test: under the full suite’s parallel load
// its long tests outrun the default 5 s, so the file allows 15 s.
vi.setConfig({ testTimeout: 15000 });

const stand = vi.hoisted(() => ({ viewport: null, sketcher: null }));
// `ready`: whether the model on show is built; `references`: what a fillet's
// edge request resolves with (a promise the test settles), else at once.
const kernel = vi.hoisted(() => ({ ready: true, references: null }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: kernel.ready ? 'ready' : 'building',
    ready: kernel.ready,
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
    request: vi.fn((type) => (type === 'references' && kernel.references ? kernel.references : Promise.resolve([]))),
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
      planeEdges: () => [],
      getMarkPoints: () => [],
    }));
    stand.viewport = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
vi.mock('./CadSketcher.jsx', () => ({
  default: function SketcherStandIn(props) {
    stand.sketcher = props;
    return <div role="toolbar" aria-label="Sketch tools" />;
  },
}));

let frames = [];
beforeEach(() => {
  frames = [];
  kernel.ready = true;
  kernel.references = null;
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
// The punch stays in the machine (docs/sketch-studio-shop-punches.md §5.5): each test starts from the default.
beforeEach(() => forgetPunch());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  stand.viewport = null;
  stand.sketcher = null;
});

function setup(model) {
  let current = model,
    id = 'doc';
  const setCadModel = vi.fn((next) => {
    current = next;
  });
  const workspace = () => (
    <MemoryRouter>
      <CadWorkspace
        document={{ id, name: 'Test', entities: [], model: current }}
        setCadModel={setCadModel}
        documentPersistence={{}}
      />
    </MemoryRouter>
  );
  const view = render(workspace());
  const rerender = () => view.rerender(workspace());
  return {
    setCadModel,
    rerender,
    model: () => current,
    // The same document showing another model (a commit arriving, an Undo).
    show: (next) => {
      current = next;
      rerender();
    },
    // New, Open, Import: another document under the same workspace.
    open: (next, nextId) => {
      current = next;
      id = nextId;
      rerender();
    },
  };
}
// A flat 100 × 60 tray blank (sheet metal) and a board.
function shopModel({ marks = [] } = {}) {
  const tray = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.5, name: 'Tray' });
  tray.id = 'tray';
  const board = createPart('board');
  return {
    ...emptyModel(),
    sketches: [
      { id: 'blank', name: 'Blank', plane: 'XY', profile: { type: 'rectangle', width: 100, height: 60 } },
      { id: 'free', name: 'Free outline', plane: 'XY', profile: { type: 'rectangle', width: 80, height: 40 } },
    ],
    parts: [tray, { ...board.part, id: 'board' }],
    instances: [
      { id: 'tray-1', partId: 'tray', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true },
      { id: 'b1', partId: 'board', name: '', position: [800, 0, 0], rotation: [0, 0, 0], visible: true },
    ],
    marks,
  };
}
// Two boards, for the operations.
function boardsModel() {
  const one = createPart('board');
  const two = createPart('board');
  return {
    ...emptyModel(),
    parts: [
      { ...one.part, id: 'board' },
      { ...two.part, id: 'other' },
    ],
    instances: [
      { id: 'b1', partId: 'board', name: '', position: [0, 0, 0], rotation: [0, 0, 0] },
      { id: 'b2', partId: 'other', name: '', position: [800, 0, 0], rotation: [0, 0, 0] },
    ],
  };
}
const press = (key, init = {}) => act(() => fireEvent.keyDown(window, { key, ...init }));
const ribbon = (name) =>
  act(() => fireEvent.click(within(document.querySelector('.cad-ribbon')).getByRole('button', { name })));
const openTab = (name) =>
  act(() => fireEvent.click(within(document.querySelector('.cad-tab-buttons')).getByRole('button', { name })));
const toolbarButton = (name) => within(document.querySelector('.cad-view-toolbar')).getByRole('button', { name });
const nav = () => screen.getByRole('navigation', { name: 'Shop route' });
const route = (name) => within(nav()).getByRole('button', { name });
const station = (name) => act(() => fireEvent.click(route(name)));
const more = (label) => {
  act(() => fireEvent.click(within(nav()).getByRole('button', { name: /More/ })));
  act(() =>
    fireEvent.click(
      within(screen.getByRole('group', { name: 'More shop commands' })).getByRole('button', { name: label }),
    ),
  );
};
const errorLine = () => document.querySelector('.cad-error');
const select = (id) => act(() => stand.viewport.onSelect(id));
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

it('a sketch in progress ends with its document: nothing is finished into the next one', async () => {
  const harness = setup(shopModel());
  await act(async () => stand.viewport.onPickSketchPlane('XY', 0));
  expect(stand.viewport.sketchMode).toBe('draw');
  expect(screen.getByRole('toolbar', { name: 'Sketch tools' })).toBeTruthy();
  harness.open(boardsModel(), 'doc-2');
  expect(screen.queryByRole('toolbar', { name: 'Sketch tools' })).toBeNull();
  expect(stand.viewport.sketchMode).toBeNull();
  expect(harness.setCadModel).not.toHaveBeenCalled();
});

it('a mate, the selection and the panel end with their document, and nothing is put back into the next one', () => {
  const harness = setup(shopModel());
  select('b1');
  openTab('Assemble');
  ribbon('Mate faces');
  expect(stand.viewport.sketchMode).toBe('pick');
  expect(screen.getByRole('heading', { name: 'Mate faces' })).toBeTruthy();
  harness.open(boardsModel(), 'doc-2');
  expect(stand.viewport.sketchMode).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Mate faces' })).toBeNull();
  expect(stand.viewport.selectedId).toBeNull();
  expect(harness.setCadModel).not.toHaveBeenCalled();
});

it('the hole tool and Measure end with their document', () => {
  const harness = setup(shopModel());
  select('b1');
  act(() => fireEvent.click(toolbarButton('Place holes')));
  expect(stand.viewport.holeMode).toBe('place');
  harness.open(boardsModel(), 'doc-2');
  expect(stand.viewport.holeMode).toBeNull();
  openTab('Assemble');
  ribbon('Measure');
  expect(stand.viewport.measureMode).toBe(true);
  harness.open(shopModel(), 'doc-3');
  expect(stand.viewport.measureMode).toBe(false);
  expect(screen.queryByRole('heading', { name: 'Measure' })).toBeNull();
});

it('an Undo of Apply and place another before the rebuild forgets the tool it would have reopened', () => {
  const harness = setup(boardsModel());
  const before = harness.model();
  ribbon('Hole');
  act(() => {
    stand.viewport.onPlace(topFace());
  });
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Apply and place another' })));
  expect(harness.setCadModel).toHaveBeenCalledOnce();
  // The commit is on show and rebuilding; Undo puts the model from before the apply back.
  kernel.ready = false;
  harness.rerender();
  harness.show(before);
  kernel.ready = true;
  harness.rerender();
  expect(screen.queryByRole('heading', { name: 'Place hole' })).toBeNull();
  // A later change of any kind does not bring the Hole tool up by itself.
  harness.show({ ...before, marks: [] });
  expect(screen.queryByRole('heading', { name: 'Place hole' })).toBeNull();
  expect(stand.viewport.placement).toBeNull();
});

it('a station waiting on the kernel gives way to a tool started meanwhile', () => {
  const harness = setup(shopModel());
  kernel.ready = false;
  harness.rerender();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  station('Paint');
  expect(within(screen.getByRole('region', { name: 'Paint booth' })).getByRole('status').textContent).toMatch(
    /opens as soon as it is current/,
  );
  // S while it waits: the sketch pick opens.
  press('s');
  expect(stand.viewport.sketchMode).toBe('pick');
  kernel.ready = true;
  harness.rerender();
  // The booth does not open over the pick, and does not come back after it.
  expect(stand.viewport.shopPick).toBeNull();
  expect(stand.viewport.sketchMode).toBe('pick');
  expect(screen.getByRole('heading', { name: 'New sketch' })).toBeTruthy();
  press('Escape');
  harness.rerender();
  expect(stand.viewport.sketchMode).toBeNull();
  expect(stand.viewport.shopPick).toBeNull();
});

it('Replay ends Measure: Esc then ends the replay, not the measuring under it', () => {
  setup(normalizeModel(sheetMetalControlBox()));
  openTab('Assemble');
  ribbon('Measure');
  expect(stand.viewport.measureMode).toBe(true);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  expect(route('Replay').disabled).toBe(false);
  station('Replay');
  expect(screen.getByRole('region', { name: 'Replay' })).toBeTruthy();
  expect(stand.viewport.shopPick).toMatchObject({ station: 'film' });
  press('Escape');
  expect(stand.viewport.shopPick).toBeNull();
  expect(screen.queryByRole('region', { name: 'Replay' })).toBeNull();
  expect(stand.viewport.measureMode).toBe(false);
});

it('More leaves the open station only when its command goes through', () => {
  setup(shopModel());
  select('tray-1');
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  station('Bend');
  expect(stand.viewport.brakeView).toMatchObject({ instanceId: 'tray-1' });
  // Nothing grouped: Ungroup refuses, and the press brake stays as it was.
  more('Ungroup');
  expect(errorLine().textContent).toBe('Select a group to ungroup.');
  expect(stand.viewport.brakeView).toMatchObject({ instanceId: 'tray-1' });
  expect(route('Bend').getAttribute('aria-current')).toBe('step');
  // A command that goes through still leaves it first.
  more('Job sheet');
  expect(stand.viewport.brakeView).toBeNull();
  expect(screen.getByRole('region', { name: 'Job sheet' })).toBeTruthy();
});

it('a press brake whose part goes (an Undo) takes its panel with it: Bend opens again', () => {
  const harness = setup(shopModel());
  select('tray-1');
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  station('Bend');
  expect(route('Bend').getAttribute('aria-current')).toBe('step');
  harness.show({ ...harness.model(), instances: harness.model().instances.filter((i) => i.id !== 'tray-1') });
  expect(stand.viewport.brakeView).toBeNull();
  expect(route('Bend').getAttribute('aria-current')).toBeNull();
  // The route's Bend answers again instead of being "the open station".
  station('Bend');
  expect(screen.getByRole('region', { name: 'Press brake' })).toBeTruthy();
});

it('Delete leaves the selected mark alone while the press brake owns the view', () => {
  const mark = {
    id: 'm1',
    from: { instanceId: 'tray-1', local: [0, 0, 0] },
    to: { instanceId: 'tray-1', local: [100, 0, 0] },
    along: 'aligned',
    offset: [0, -10, 0],
  };
  const harness = setup(shopModel({ marks: [mark] }));
  select('tray-1');
  act(() => stand.viewport.onSelectMark('m1'));
  expect(stand.viewport.selectedMarkId).toBe('m1');
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  station('Bend');
  expect(stand.viewport.brakeView).toMatchObject({ instanceId: 'tray-1' });
  press('Delete');
  expect(harness.setCadModel).not.toHaveBeenCalled();
  expect(harness.model().marks).toEqual([mark]);
});

it('an operation started from a sketch ends the hole tool, as every other operation does', () => {
  setup(shopModel());
  select('b1');
  act(() => fireEvent.click(toolbarButton('Move holes')));
  expect(toolbarButton('Move holes').getAttribute('aria-pressed')).toBe('true');
  // The sketch's own panel (a Part sketches row), then Extrude with preview.
  const row = [...document.querySelectorAll('.cad-tree-body button')].find((b) =>
    b.textContent.includes('Free outline'),
  );
  act(() => fireEvent.click(row));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Extrude with preview' })));
  expect(screen.getByRole('button', { name: 'Cancel operation' })).toBeTruthy();
  expect(toolbarButton('Move holes').getAttribute('aria-pressed')).toBe('false');
  // Cancel: the hole tool does not come back under the user's hands.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Cancel operation' })));
  expect(stand.viewport.holeMode).toBeNull();
});

it('a fillet whose edges arrive after the selection moved does not open on the old part', async () => {
  let resolve;
  kernel.references = new Promise((r) => {
    resolve = r;
  });
  setup(boardsModel());
  select('b1');
  ribbon('Fillet');
  // While the edges are fetched, another part is selected.
  select('b2');
  expect(stand.viewport.selectedId).toBe('b2');
  await act(async () => resolve([]));
  expect(screen.queryByRole('button', { name: 'Apply fillet' })).toBeNull();
  expect(errorLine().textContent).toBe('The selection changed. Open the operation again.');
  expect(stand.viewport.selectedId).toBe('b2');
});
