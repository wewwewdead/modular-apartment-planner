// @vitest-environment jsdom
// Perf pass 3, B2.3 (docs/perf-pass-3.md §6): what the workspace works out on
// a render that changes nothing it reads. The drawing preview, the Sheets
// panel's scales, the parts tree, the cutting list and the mark poses are
// counted through their modules; the kernel hook keeps one snapshot per model
// (as the real one does) and the 3D viewport is a stand-in.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { createPart, emptyModel, normalizeModel } from './model.js';
import { layoutParts } from './sheetLayout.js';
import { sheetSvg } from './drawings.js';
import { treeRows } from './groups.js';
import { buildCutList } from './fabrication.js';
import { shopRecordRows } from './shopRecords.js';
import { modelPoses } from './marks.js';
vi.setConfig({ testTimeout: 15000 });

const { counted } = vi.hoisted(() => ({
  counted: (name) => async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, [name]: vi.fn(actual[name]) };
  },
}));
vi.mock('./sheetLayout.js', counted('layoutParts'));
vi.mock('./drawings.js', counted('sheetSvg'));
vi.mock('./groups.js', counted('treeRows'));
vi.mock('./fabrication.js', counted('buildCutList'));
vi.mock('./shopRecords.js', counted('shopRecordRows'));
vi.mock('./marks.js', counted('modelPoses'));

const kernel = vi.hoisted(() => ({ snapshots: new WeakMap() }));
vi.mock('./useCadModel.js', () => ({
  default: (model) => {
    // One snapshot per model, like the real hook: a render that changes
    // nothing hands the same object back.
    let snapshot = kernel.snapshots.get(model);
    if (!snapshot) {
      snapshot = {
        parameters: {},
        parts: model.parts.map((p) => ({
          id: p.id,
          bounds: [
            [0, 0, 0],
            [40, 40, 700],
          ],
          volume: 1,
          features: {},
        })),
        instances: model.instances.map((i, index) => ({
          id: i.id,
          partId: i.partId,
          bounds: [
            [index * 100, 0, 0],
            [index * 100 + 40, 40, 700],
          ],
          placement: [],
        })),
      };
      kernel.snapshots.set(model, snapshot);
    }
    return {
      status: 'ready',
      ready: true,
      snapshot,
      request: async (type, payload) =>
        type === 'drawings'
          ? model.sheets
              .filter((sheet) => !payload?.sheetIds || payload.sheetIds.includes(sheet.id))
              .map((sheet) => ({
                ...sheet,
                bounds: [
                  [0, 0, 0],
                  [140, 40, 700],
                ],
                views: sheet.views.map((name) => ({
                  name,
                  view: name,
                  viewBox: [0, -40, 140, 40],
                  basis: [
                    [1, 0, 0],
                    [0, 0, -1],
                  ],
                  visible: ['M 0 0 L 10 0'],
                  hidden: [],
                  hatch: [],
                  detail: false,
                })),
              }))
          : null,
      retry() {},
      cancel() {},
    };
  },
}));
vi.mock('./CadViewport.jsx', () => ({
  default: function ViewportStandIn({ ref }) {
    useImperativeHandle(ref, () => ({
      getInstanceBounds: () => null,
      getBounds: () => null,
      isDragging: () => false,
      getPivot: () => [0, 0, 0],
      getCanvas: () => null,
      getGroupPoses: () => new Map(),
      getSceneSpan: () => 1000,
    }));
    return <div aria-label="Solid model viewport" />;
  },
}));

afterEach(cleanup);

function setup() {
  const { part } = createPart('member');
  const leg = (id, x) => ({ id, partId: part.id, name: id, position: [x, 0, 0], rotation: [0, 0, 0] });
  let model = normalizeModel({
    ...emptyModel(),
    parts: [part],
    instances: [leg('A', 0), leg('B', 100), leg('C', 200)],
  });
  const setCadModel = vi.fn((next) => {
    model = next;
    rerender();
  });
  const workspace = () => (
    <MemoryRouter>
      <CadWorkspace
        document={{ id: 'doc', name: 'Test rig', entities: [], model }}
        setCadModel={setCadModel}
        undo={() => {}}
        redo={() => {}}
        canUndo
        canRedo
        documentPersistence={{}}
      />
    </MemoryRouter>
  );
  const view = render(workspace());
  const rerender = () => view.rerender(workspace());
  // A new model object from outside (as an Undo hands one back).
  const replace = (next) => {
    model = next;
    rerender();
  };
  return { rerender, replace, model: () => model };
}
const settle = () => act(async () => {});
const counters = { layoutParts, sheetSvg, treeRows, buildCutList, shopRecordRows, modelPoses };
const reset = () => Object.values(counters).forEach((fn) => fn.mockClear());
const calls = () => Object.fromEntries(Object.entries(counters).map(([name, fn]) => [name, fn.mock.calls.length]));
// Three renders of the workspace that change nothing it reads.
const idleRenders = (harness) => {
  reset();
  for (let i = 0; i < 3; i++) harness.rerender();
  return calls();
};
const none = { layoutParts: 0, sheetSvg: 0, treeRows: 0, buildCutList: 0, shopRecordRows: 0, modelPoses: 0 };
const preview = () => document.querySelector('.cad-drawing .cad-sheet-preview svg');
const ribbon = () => document.querySelector('.cad-ribbon');

it('draws the sheet preview once per change, and not at all with the pane and the sheet panels closed', async () => {
  const harness = setup();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Drawings' })));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'New engineering sheet' })));
  await settle();
  harness.rerender();
  const drawn = preview().innerHTML;
  expect(drawn).toContain('1 / 1 · A3 LANDSCAPE');
  // The pane open: nothing redrawn while nothing changes (before: one
  // layoutParts and one sheetSvg per render).
  expect(idleRenders(harness)).toEqual(none);
  expect(preview().innerHTML).toBe(drawn);
  // The Sheets panel: the preview is not drawn again for it.
  reset();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Sheets' })));
  expect(calls().sheetSvg).toBe(0);
  // The Sheets panel's scales: worked out once when it opens, then not per render.
  expect(screen.getByText(/A3 · /)).toBeTruthy();
  expect(idleRenders(harness)).toEqual(none);
  // Pane closed and the Sheets panel showing: the preview is not drawn at all,
  // even for a new model. The scales are: one sheet with views, one layout
  // (its parts list's rows are partsList.js's buildCutList); the tree call is
  // the job sheet's products, a memo on the model.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Split drawing' })));
  expect(document.querySelector('.cad-drawing')).toBeNull();
  reset();
  harness.replace({ ...harness.model() });
  expect(calls()).toEqual({ ...none, layoutParts: 1, buildCutList: 1, treeRows: 1 });
  reset();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Split drawing' })));
  // Back on: drawn once, the same picture.
  expect(calls().sheetSvg).toBe(1);
  expect(preview().innerHTML).toBe(drawn);
  expect(idleRenders(harness)).toEqual(none);
});

it('works out the parts tree once per instance or group change, and the cut list and mark poses only for their panels', async () => {
  const harness = setup();
  await settle();
  // Nothing on a render that changes nothing (before: treeRows once per
  // render, the cut list, shop rows and mark poses once per model).
  expect(idleRenders(harness)).toEqual(none);
  const tree = document.querySelector('.cad-tree');
  const row = (name) =>
    [...tree.querySelectorAll('.cad-tree-item')].find((b) => b.querySelector('span').firstChild.data === name);
  // A selection is no tree change.
  reset();
  act(() => fireEvent.click(row('B')));
  expect(calls().treeRows).toBe(0);
  // Hide B: one commit, the tree worked out once (plus the job sheet's
  // products, a memo on the model: jobSheet.js jobProducts); the closed
  // panels' lists not at all.
  reset();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Assemble' })));
  act(() => fireEvent.click(within(ribbon()).getByRole('button', { name: 'Hide / show' })));
  expect(harness.model().instances.find((i) => i.id === 'B').visible).toBe(false);
  expect(row('B').parentElement.textContent).toContain('hidden');
  expect(calls()).toEqual({ ...none, treeRows: 2 });
  // The cutting list: worked out when its panel opens, then once per change.
  reset();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Manufacture' })));
  act(() => fireEvent.click(within(ribbon()).getByRole('button', { name: 'Cutting list' })));
  expect(calls().buildCutList).toBe(1);
  expect(screen.getByText('3 × Square tube')).toBeTruthy();
  expect(idleRenders(harness)).toEqual(none);
});
