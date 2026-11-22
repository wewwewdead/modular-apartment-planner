// @vitest-environment jsdom
// How the shop stations end and what each leaves behind: a finished laser
// cut belongs to the sheet that was cut, an uploaded image lands only in the
// print session that asked for it, a cut's end is said only for the live
// cut, an Undo under a paint confirm, a laser cut, a replay or a press brake
// stroke leaves each in a state it can go on from, and the More menu puts
// back the brake's picker with the rest when its command refuses. Kernel
// hook and viewport are stand-ins; the laser bed is the real one, watched.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
import { emptyModel } from './model.js';
import { sheetMetalPart } from './ShopPanels.jsx';
import { printImage } from './printImage.js';
// The whole workspace renders in each test: under the full suite’s parallel load
// its long tests outrun the default 5 s, so the file allows 15 s.
vi.setConfig({ testTimeout: 15000 });

const stand = vi.hoisted(() => ({ viewport: null, bed: null }));
const BOX = [
  [0, 0, 0],
  [200, 120, 2],
];
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
vi.mock('./useCadModel.js', () => ({
  default: (model) => ({
    status: 'ready',
    ready: true,
    snapshot: {
      parameters: {},
      parts: model.parts.map((p) => ({ id: p.id, features: {}, bounds: BOX })),
      instances: model.instances.map((i) => ({
        id: i.id,
        partId: i.partId,
        bounds: BOX,
        placement: [],
        mesh: boxMesh(...BOX),
      })),
    },
    request: vi.fn(() => Promise.resolve([])),
    retry() {},
    cancel() {},
  }),
}));
vi.mock('./CadViewport.jsx', () => ({
  default: function ViewportStandIn({ ref, ...props }) {
    useImperativeHandle(ref, () => ({
      getInstanceBounds: () => BOX,
      getBounds: () => BOX,
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
// The real laser bed, its props kept: a test can hand it a stale token.
vi.mock('./LaserStation.jsx', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    LaserBed: (props) => {
      stand.bed = props;
      return real.LaserBed(props);
    },
  };
});
// An image's decode, settled by the test.
vi.mock('./printImage.js', async (importOriginal) => ({ ...(await importOriginal()), printImage: vi.fn() }));

let frames = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
// The punch stays in the machine (docs/sketch-studio-shop-punches.md §5.5): each test starts from the default.
beforeEach(() => forgetPunch());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  printImage.mockReset();
  stand.viewport = null;
  stand.bed = null;
});
// A frame far in the future: a cut reaches its end on its first frame.
const runFrames = () =>
  act(() => {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(performance.now() + 1e7));
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
  return {
    setCadModel,
    rerender,
    model: () => current,
    // The same document showing another model (a commit arriving, an Undo).
    show: (next) => {
      current = next;
      rerender();
    },
  };
}
// A sheet-metal tray cut from a `width` × `height` blank.
function trayModel({ width = 100, height = 60, bends = [] } = {}) {
  const tray = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.5, name: 'Tray' });
  tray.id = 'tray';
  tray.features[0].bends = bends;
  return {
    ...emptyModel(),
    sketches: [
      {
        id: 'blank',
        name: 'Blank',
        plane: 'XY',
        profile: { type: 'rectangle', width, height, origin: [0, 0] },
        primitives: [],
        constrained: false,
      },
    ],
    parts: [tray],
    instances: [{ id: 'tray-1', partId: 'tray', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }],
  };
}
// Three plain boxes; `extra` adds records.
const box = (id, name) => ({
  id,
  name,
  material: 'Steel',
  features: [{ id: `${id}-f`, type: 'box', width: 200, depth: 120, height: 2 }],
});
const boxModel = (extra = {}) => ({
  ...emptyModel(),
  parts: [box('plate', 'Plate'), box('web', 'Web'), box('lid', 'Lid')],
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
const select = (id) => act(() => stand.viewport.onSelect(id));
const press = (key) => act(() => fireEvent.keyDown(window, { key }));
const nav = () => screen.getByRole('navigation', { name: 'Shop route' });
const route = (name) => within(nav()).getByRole('button', { name });
const shop = () => act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
const station = (name) => act(() => fireEvent.click(route(name)));
const more = (label) => {
  act(() => fireEvent.click(within(nav()).getByRole('button', { name: /More/ })));
  act(() =>
    fireEvent.click(
      within(screen.getByRole('group', { name: 'More shop commands' })).getByRole('button', { name: label }),
    ),
  );
};
const searchCommand = (name) => {
  act(() => fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: name } }));
  act(() => fireEvent.click(within(document.querySelector('.cad-ribbon')).getByRole('button', { name })));
};
const fill = (scope, label, value) => {
  const field = within(scope).getByLabelText(label, { exact: true });
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: String(value) } });
  });
  act(() => fireEvent.blur(field));
};
const laser = () => screen.getByRole('region', { name: 'Laser station' });
const bedState = () => screen.getByRole('figure', { name: 'Laser bed' }).dataset.state;
const brakePanel = () => screen.getByRole('region', { name: 'Press brake' });

it('a finished cut is the sheet’s that was cut: the next sheet, or another stock sheet, is not drawn cut', () => {
  // Two blanks this size need two stock sheets (one each on 1219 × 2438).
  const harness = setup(trayModel({ width: 1300, height: 1000 }));
  select('tray-1');
  searchCommand('Laser');
  fill(laser(), 'Quantity', 2);
  harness.rerender();
  act(() => fireEvent.click(within(laser()).getByRole('button', { name: 'Cut' })));
  runFrames();
  expect(bedState()).toBe('cut');
  expect(screen.getByText(/1 more on sheet 2: switch the sheet and cut again\.$/)).toBeTruthy();
  // The notice's own advice: sheet 2 has nothing cut on it yet.
  act(() =>
    fireEvent.click(within(screen.getByRole('group', { name: 'Sheet' })).getByRole('button', { name: 'Sheet 2' })),
  );
  expect(bedState()).toBe('ready');
  expect(
    within(screen.getByRole('figure', { name: 'Laser bed' })).getByLabelText('Laser head').textContent,
  ).not.toMatch(/Cut done/);
  // Cut it; then another stock sheet is a new nest, nothing of it cut.
  act(() => fireEvent.click(within(laser()).getByRole('button', { name: 'Cut' })));
  runFrames();
  expect(bedState()).toBe('cut');
  act(() => fireEvent.change(within(laser()).getByLabelText('Stock sheet'), { target: { value: '1500x3000' } }));
  harness.rerender();
  expect(bedState()).toBe('ready');
});

it('a cut’s end is said only for the live cut: a stopped cut’s token says nothing', () => {
  setup(trayModel());
  select('tray-1');
  searchCommand('Laser');
  act(() => fireEvent.click(within(laser()).getByRole('button', { name: 'Cut' })));
  expect(bedState()).toBe('cutting');
  const { onDone, session } = stand.bed;
  const token = session.run.token;
  // Stopped (Esc): the stopped cut's end, should it ever be reported, is no cut.
  press('Escape');
  expect(bedState()).toBe('ready');
  act(() => onDone(token));
  expect(bedState()).toBe('ready');
  expect(screen.queryByText(/^Cut 1 blank/)).toBeNull();
});

it('an Undo during a laser cut stops it: nothing of the old job is drawn or said as cut', () => {
  const harness = setup(trayModel());
  select('tray-1');
  searchCommand('Laser');
  const one = harness.model();
  fill(laser(), 'Quantity', 2);
  harness.rerender();
  act(() => fireEvent.click(within(laser()).getByRole('button', { name: 'Cut' })));
  expect(bedState()).toBe('cutting');
  // The Undo of Quantity arrives while the head is moving.
  harness.show(one);
  expect(bedState()).toBe('ready');
  expect(within(laser()).getByRole('alert').textContent).toBe('The model changed during the cut: cut again.');
  runFrames();
  expect(bedState()).toBe('ready');
  expect(screen.queryByText(/^Cut 2 blanks/)).toBeNull();
  // The route waits no longer.
  shop();
  expect(route('Paint').disabled).toBe(false);
});

const IMAGE = (n) => ({ dataUrl: `data:image/png;base64,${'A'.repeat(4 * n)}`, width: 100 * n, height: 50 * n });
const decodes = () => {
  const pending = [];
  printImage.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  return pending;
};
const upload = () =>
  act(() =>
    fireEvent.change(screen.getByLabelText('Upload image'), {
      target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] },
    }),
  );
const printPanel = () => screen.getByRole('region', { name: 'Print station' });
const imageArtwork = () =>
  act(() =>
    fireEvent.click(
      within(within(printPanel()).getByRole('group', { name: 'Artwork' })).getByRole('button', { name: 'Image' }),
    ),
  );
const plateFace = () => ({
  kind: 'face',
  instanceId: 'plate',
  point: [70, 0, 2],
  normal: [0, 0, 1],
  planar: true,
  x: [1, 0, 0],
  local: { point: [70, 0, 2], normal: [0, 0, 1], x: [1, 0, 0] },
});

it('an image that decodes after its print station closed lands nowhere', async () => {
  const harness = setup(boxModel());
  shop();
  station('Print');
  imageArtwork();
  const pending = decodes();
  upload();
  await act(async () => pending[0](IMAGE(1)));
  act(() => {
    stand.viewport.onShopPick(plateFace());
  });
  harness.rerender();
  const [placed] = harness.model().prints;
  expect(placed).toMatchObject({ kind: 'image', image: IMAGE(1).dataUrl });
  // A second image for the placed print, still decoding as the station is left.
  upload();
  press('Escape');
  press('Escape');
  expect(screen.queryByRole('region', { name: 'Print station' })).toBeNull();
  const commits = harness.setCadModel.mock.calls.length;
  await act(async () => pending[1](IMAGE(2)));
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
  expect(harness.model().prints).toEqual([placed]);

  // Left and opened again before the decode ends: the new session's draft is its own.
  station('Print');
  imageArtwork();
  upload();
  press('Escape');
  station('Print');
  await act(async () => pending[2](IMAGE(3)));
  expect(
    within(within(printPanel()).getByRole('group', { name: 'Artwork' }))
      .getByRole('button', { name: 'Text' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
});

it('of two images chosen one after the other, the one chosen last is the draft’s, whichever decodes last', async () => {
  setup(boxModel());
  shop();
  station('Print');
  imageArtwork();
  const pending = decodes();
  upload();
  upload();
  await act(async () => pending[1](IMAGE(2)));
  await act(async () => pending[0](IMAGE(1)));
  expect(within(printPanel()).getByLabelText('Image size').textContent).toMatch(/^200 × 100 px · /);
});

it('an Undo under a Strip paint confirm keeps it a strip for the parts still there', () => {
  const finish = (instanceId) => ({
    id: `f-${instanceId}`,
    instanceId,
    kind: 'powder',
    name: 'RAL 9005 Jet black',
    colour: '#0e0e10',
    gloss: 'satin',
    thickness: 70,
  });
  const print = {
    id: 't',
    instanceId: 'plate',
    origin: [70, 0, 2],
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
  const model = boxModel({
    finishes: [finish('plate'), finish('web')],
    prints: [print],
    groups: [{ id: 'g', name: 'Stand', parentId: null }],
  });
  model.instances = model.instances.map((i) => (i.id === 'lid' ? i : { ...i, groupId: 'g' }));
  const harness = setup(model);
  shop();
  station('Paint');
  const booth = () => screen.getByRole('region', { name: 'Paint booth' });
  act(() => {
    stand.viewport.onShopPick({ kind: 'part', instanceId: 'web' });
  });
  act(() => fireEvent.click(within(booth()).getByRole('button', { name: 'Paint the whole Stand (2 parts)' })));
  act(() => fireEvent.click(within(booth()).getByRole('button', { name: 'Strip paint' })));
  expect(
    within(within(booth()).getByRole('group', { name: 'Confirm' })).getByRole('button', {
      name: 'Strip and remove prints',
    }),
  ).toBeTruthy();
  // The web goes (an Undo): the plate is still to be stripped, as asked.
  harness.show({ ...harness.model(), instances: harness.model().instances.filter((i) => i.id !== 'web') });
  const confirm = within(booth()).getByRole('group', { name: 'Confirm' });
  act(() => fireEvent.click(within(confirm).getByRole('button', { name: 'Strip and remove prints' })));
  harness.rerender();
  expect(harness.model().finishes.map((f) => f.instanceId)).toEqual(['web']);
  expect(harness.model().prints).toEqual([]);
});

const BENT = [{ id: 'b1', a: [20, -1], b: [20, 61], angle: 90, direction: 'up', radius: null }];

it('a replay that a model change ends puts back what it started over', () => {
  const harness = setup(trayModel({ bends: BENT }));
  select('tray-1');
  shop();
  station('Bend');
  expect(stand.viewport.brakeView).toMatchObject({ instanceId: 'tray-1' });
  station('Replay');
  expect(screen.getByRole('region', { name: 'Replay' })).toBeTruthy();
  // The model changes under the film: it ends, and the press brake is back as it was.
  harness.show({ ...harness.model() });
  expect(screen.queryByRole('region', { name: 'Replay' })).toBeNull();
  expect(brakePanel()).toBeTruthy();
  expect(stand.viewport.brakeView).toMatchObject({ instanceId: 'tray-1' });
  expect(stand.viewport.brakeView.stroke ?? null).toBeNull();
  expect(route('Bend').getAttribute('aria-current')).toBe('step');
});

it('a press brake stroke whose station goes from under it ends: the route and Esc answer again', () => {
  const harness = setup(trayModel());
  select('tray-1');
  shop();
  station('Bend');
  act(() => stand.viewport.onBrakeEdge(1));
  fill(brakePanel(), 'Backgauge L (mm)', 20);
  press('Enter');
  expect(stand.viewport.brakeView.stroke).toBeTruthy();
  expect(route('Paint').disabled).toBe(true);
  // The blank can no longer be read: no stroke can reach its end.
  const commits = harness.setCadModel.mock.calls.length;
  harness.show({ ...harness.model(), parameters: [{ id: 'p', name: 'a', value: 'b' }] });
  expect(route('Paint').disabled).toBe(false);
  expect(harness.setCadModel.mock.calls.length).toBe(commits);
});

it('More puts the press brake back with its open picker when its command refuses', () => {
  setup(trayModel());
  select('tray-1');
  shop();
  station('Bend');
  act(() => stand.viewport.onBrakeEdge(1));
  act(() => stand.viewport.onBrakeFocus('die'));
  expect(within(brakePanel()).getByRole('region', { name: 'Dies' })).toBeTruthy();
  more('Ungroup');
  expect(document.querySelector('.cad-error').textContent).toBe('Select a group to ungroup.');
  expect(within(brakePanel()).getByRole('region', { name: 'Dies' })).toBeTruthy();
  // A command that goes through leaves the brake with its picker.
  more('Job sheet');
  expect(stand.viewport.brakeView).toBeNull();
});

it('a replay over the press brake gives back its open picker at the end', () => {
  setup(trayModel({ bends: BENT }));
  select('tray-1');
  shop();
  station('Bend');
  act(() => stand.viewport.onBrakeEdge(1));
  act(() => stand.viewport.onBrakeFocus('die'));
  expect(within(brakePanel()).getByRole('region', { name: 'Dies' })).toBeTruthy();
  station('Replay');
  expect(screen.queryByRole('region', { name: 'Press brake' })).toBeNull();
  press('Escape');
  expect(within(brakePanel()).getByRole('region', { name: 'Dies' })).toBeTruthy();
});
