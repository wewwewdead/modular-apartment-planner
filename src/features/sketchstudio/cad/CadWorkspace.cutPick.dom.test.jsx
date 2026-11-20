// @vitest-environment jsdom
// RC-1 and RC-2 in the workspace (docs/sketch-studio-cut-pick.md): the route's
// Cut opens the picker once a part is cut and an outline waits (the part
// under Already cut, Open on the laser), the view's click ticks a row, the
// laser's Cut another outline, Edit back to the picker as it was, and a bent
// sheet removed with Remove instance gives its outline back (one commit:
// Undo brings the part again). The kernel hook and the 3D viewport are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { forgetPunch } from './brakeMemory.js';
import { emptyModel } from './model.js';
import { sheetMetalPart } from './ShopPanels.jsx';
// The whole workspace renders in each test: allow for the full suite's load.
vi.setConfig({ testTimeout: 15000 });

const viewport = vi.hoisted(() => ({ props: null }));
// Every instance is built as its blank lying at its position (the stand-in kernel).
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
          [100, 60, 1.5],
        ],
        features: {},
      })),
      instances: model.instances.map((i) => {
        const sketchId = model.parts.find((p) => p.id === i.partId)?.features[0]?.sketchId;
        const { width = 100, height = 60 } = model.sketches.find((s) => s.id === sketchId)?.profile || {};
        const [x, y] = i.position || [0, 0, 0];
        return {
          id: i.id,
          partId: i.partId,
          bounds: [
            [x, y, 0],
            [x + width, y + height, 1.5],
          ],
          placement: [],
        };
      }),
    },
    request: vi.fn(),
    retry() {},
    cancel() {},
  }),
}));
vi.mock('./CadViewport.jsx', () => ({
  default: function ViewportStandIn({ ref, ...props }) {
    useImperativeHandle(ref, () => ({
      viewDropPoint: () => [1000, 500, 0],
      getInstanceBounds: () => null,
      isDragging: () => false,
      getCanvas: () => null,
      getGroupPoses: () => new Map(),
      planeEdges: () => [],
      getMarkPoints: () => [],
      setSketchOverlay: () => {},
    }));
    viewport.props = props;
    return <div aria-label="Solid model viewport" />;
  },
}));
let frames = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
beforeEach(() => forgetPunch());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const runFrames = () =>
  act(() => {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(performance.now() + 1e7));
  });

// The parent keeps an undo history like SketchStudio.
function setup(model) {
  const history = [model];
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
        undo={() => {
          index = Math.max(0, index - 1);
        }}
        redo={() => {
          index = Math.min(history.length - 1, index + 1);
        }}
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
    rerender,
    model: () => history[index],
    undo: () => {
      index = Math.max(0, index - 1);
      rerender();
    },
  };
}
const rect = (width, height) => ({ type: 'rectangle', width, height, origin: [0, 0] });
const route = (name) => within(screen.getByRole('navigation', { name: 'Shop route' })).getByRole('button', { name });
const shopStation = (name) => {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Shop' })));
  act(() => fireEvent.click(route(name)));
};
const region = (name) => screen.getByRole('region', { name });
const toolbar = () => screen.queryByRole('toolbar', { name: 'Sketch tools' });
const names = (list) =>
  within(list)
    .getAllByRole('listitem')
    .map((li) => li.querySelector('strong').textContent);
const picker = () => region('Cut from sheet');
const pickRows = () => names(within(picker()).getByRole('list', { name: 'Outlines to cut' }));
const alreadyCut = () => within(picker()).queryByRole('list', { name: 'Already cut' });
const count = () => within(picker()).getByLabelText('Selected outlines').textContent;
// A bent tray cut from "Blank", and a second outline "Small" not cut yet.
function trayAndOutline() {
  const part = sheetMetalPart({ sketchId: 'blank', stock: 'spcc', thickness: 1.5, name: 'Tray' });
  part.id = 'tray';
  part.features[0].bends = [{ id: 'b1', a: [20, 0], b: [20, 60], angle: 90, direction: 'up' }];
  return {
    ...emptyModel(),
    sketches: [
      { id: 'blank', name: 'Blank', plane: 'XY', profile: rect(100, 60) },
      { id: 'small', name: 'Small', plane: 'XY', profile: rect(200, 100) },
    ],
    parts: [part],
    instances: [{ id: 'tray-1', partId: 'tray', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }],
  };
}

it('opens the route’s Cut on the picker once a part is cut: the other outline listed, the part under Already cut', () => {
  const harness = setup({
    ...emptyModel(),
    sketches: [
      { id: 'big', name: 'Big', plane: 'XY', profile: rect(300, 200) },
      { id: 'small', name: 'Small', plane: 'XY', profile: rect(200, 100) },
    ],
  });
  // Cut this keeps Cut from sheet on the one outline.
  shopStation('Draw');
  act(() =>
    fireEvent.click(
      within(within(region('Draw')).getByRole('list', { name: 'Outlines ready to cut' })).getByRole('button', {
        name: 'Cut Big',
      }),
    ),
  );
  expect(within(region('Cut from sheet')).getByLabelText('Outline').textContent).toMatch(/^Big/);
  act(() => fireEvent.click(within(region('Cut from sheet')).getByRole('button', { name: 'Cut on the laser' })));
  harness.rerender();
  runFrames();
  // The laser says an outline waits: Cut another outline opens the picker on this cut's sheet.
  const laser = region('Laser station');
  expect(laser.querySelector('.cad-laser-waiting').textContent).toBe(
    '1 outline waiting to be cut. Cut another outline',
  );
  act(() => fireEvent.click(within(laser).getByRole('button', { name: 'Cut another outline' })));
  expect(pickRows()).toEqual(['Small']);
  expect(count()).toBe('0 of 1 selected');
  expect(within(picker()).getByLabelText('Sheet stock').value).toBe('spcc');
  expect(names(alreadyCut())).toEqual(['Sheet-metal part']);
  // From Bend, the route's Cut (the part still the selection) opens the picker too.
  shopStation('Bend');
  expect(region('Press brake')).toBeTruthy();
  act(() => fireEvent.click(route('Cut')));
  expect(pickRows()).toEqual(['Small']);
  expect(alreadyCut()).toBeTruthy();
  // The view shows the outline waiting and its click ticks the row (the picker stays open).
  expect(viewport.props.shopOutlines.map((o) => [o.id, o.chosen])).toEqual([['small', false]]);
  act(() => viewport.props.onPickOutline('small'));
  expect(within(picker()).getByRole('checkbox', { name: 'Select Small' }).checked).toBe(true);
  expect(count()).toBe('1 of 1 selected');
  expect(viewport.props.shopOutlines.map((o) => [o.id, o.chosen])).toEqual([['small', true]]);
  // No origin plane tiles under the picker; Draw's outlines are never clickable.
  expect(viewport.props.planes.visible).toBe(false);
  // Open on the laser: the laser on that part.
  act(() => fireEvent.click(within(alreadyCut()).getByRole('button', { name: 'Open Sheet-metal part on the laser' })));
  expect(region('Laser station')).toBeTruthy();
  expect(viewport.props.onPickOutline).toBe(null);
  shopStation('Draw');
  expect(viewport.props.shopOutlines).toHaveLength(1);
  expect(viewport.props.onPickOutline).toBe(null);
});

it('gives a removed bent sheet its outline back in the picker and in Draw; one Undo brings the part back', () => {
  const harness = setup(trayAndOutline());
  shopStation('Cut');
  expect(pickRows()).toEqual(['Small']);
  expect(names(alreadyCut())).toEqual(['Tray']);
  // Select the sheet in the view and remove it: one commit takes the part with it.
  act(() => viewport.props.onSelect('tray-1'));
  const commits = harness.setCadModel.mock.calls.length;
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Remove instance' })));
  expect(harness.setCadModel.mock.calls.length).toBe(commits + 1);
  harness.rerender();
  expect(harness.model().parts).toEqual([]);
  expect(harness.model().instances).toEqual([]);
  expect(harness.model().sketches.map((s) => s.id)).toEqual(['blank', 'small']);
  shopStation('Cut');
  expect(pickRows()).toEqual(['Blank', 'Small']);
  expect(alreadyCut()).toBe(null);
  shopStation('Draw');
  expect(names(within(region('Draw')).getByRole('list', { name: 'Outlines ready to cut' }))).toEqual([
    'Blank',
    'Small',
  ]);
  // Undo: the part, its bend and its blank together.
  harness.undo();
  expect(harness.model().parts.map((p) => [p.id, p.features[0].bends.length])).toEqual([['tray', 1]]);
  expect(harness.model().instances.map((i) => i.id)).toEqual(['tray-1']);
  shopStation('Cut');
  expect(pickRows()).toEqual(['Small']);
  expect(names(alreadyCut())).toEqual(['Tray']);
});

it('comes back to the picker from Edit with the selection, the quantities and the sheet as they were', () => {
  setup(trayAndOutline());
  shopStation('Cut');
  act(() => fireEvent.click(within(picker()).getByRole('checkbox', { name: 'Select Small' })));
  const quantity = within(picker()).getByLabelText('Quantity of Small');
  act(() => {
    fireEvent.focus(quantity);
    fireEvent.change(quantity, { target: { value: '2' } });
  });
  act(() => fireEvent.blur(quantity));
  act(() => fireEvent.change(within(picker()).getByLabelText('Sheet stock'), { target: { value: 'sus304' } }));
  act(() => fireEvent.click(within(picker()).getByRole('button', { name: 'Edit Small' })));
  expect(toolbar()).toBeTruthy();
  expect(viewport.props.onPickOutline).toBe(null);
  act(() => fireEvent.click(within(toolbar()).getByRole('button', { name: 'Cancel sketch' })));
  expect(within(picker()).getByRole('checkbox', { name: 'Select Small' }).checked).toBe(true);
  expect(within(picker()).getByLabelText('Quantity of Small').value).toBe('2');
  expect(within(picker()).getByLabelText('Sheet stock').value).toBe('sus304');
  expect(within(picker()).getByLabelText('Batch').textContent).toBe('2 blanks from 1 outline');
});
