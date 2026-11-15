// @vitest-environment jsdom
// Phase R (docs/sketch-studio-drawing-fit.md §§5–7): a drawing sheet of the
// 3D selection, fitted and generated straight away; the overflow banner's
// one-click fixes; the scale slider's live preview and single commit.
// The kernel hook and the 3D viewport are stand-ins.
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { createPart, emptyModel, normalizeModel } from './model.js';
import { standardScales } from './sheetLayout.js';
// The whole workspace renders in each test: under the full suite’s parallel load
// its long tests outrun the default 5 s (SF-1 audit), so the file allows 15 s.
vi.setConfig({ testTimeout: 15000 });

// What the stand-in kernel projects every view as.
// Phase S: a request projects only the sheets it names, and one naming a
// sheet in `fail` throws, as the kernel does for a section that misses.
const kernel = vi.hoisted(() => ({ viewBox: [0, -40, 140, 40], request: null, fail: new Set() }));
const asked = (model, payload) =>
  payload?.sheetIds ? model.sheets.filter((sheet) => payload.sheetIds.includes(sheet.id)) : model.sheets;
vi.mock('./useCadModel.js', () => ({
  default: (model) => {
    kernel.request ||= vi.fn();
    kernel.request.mockImplementation(async (type, payload) => {
      const bad = type === 'drawings' && asked(model, payload).find((sheet) => kernel.fail.has(sheet.id));
      if (bad) throw new Error(`Section ${bad.title} does not cross the model.`);
      return type === 'drawings'
        ? asked(model, payload).map((sheet) => ({
            ...sheet,
            bounds: [
              [0, 0, 0],
              [140, 40, 700],
            ],
            views: sheet.views.map((entry) => {
              const config = typeof entry === 'string' ? { name: entry, view: entry } : entry;
              return {
                name: config.name,
                view: config.view || config.name,
                viewBox: kernel.viewBox,
                basis: [
                  [1, 0, 0],
                  [0, 0, -1],
                ],
                visible: ['M 0 0 L 10 0'],
                hidden: [],
                hatch: [],
                detail: false,
                scale: config.scale,
              };
            }),
          }))
        : null;
    });
    return {
      status: 'ready',
      ready: true,
      snapshot: {
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
      },
      request: kernel.request,
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

afterEach(() => {
  cleanup();
  kernel.viewBox = [0, -40, 140, 40];
  kernel.request?.mockClear();
});

// Three legs and an undo history like SketchStudio's.
function setup(sheets) {
  const { part } = createPart('member');
  const leg = (id, x) => ({ id, partId: part.id, name: id, position: [x, 0, 0], rotation: [0, 0, 0] });
  const base = { ...emptyModel(), parts: [part], instances: [leg('A', 0), leg('B', 100), leg('C', 200)] };
  const history = [normalizeModel(sheets ? { ...base, sheets } : base)];
  let index = 0;
  const setCadModel = vi.fn((next, meta = {}) => {
    if (meta.skipHistory) history[index] = next;
    else {
      history.splice(index + 1);
      history.push(next);
      index = history.length - 1;
    }
  });
  const undo = () => {
    index = Math.max(0, index - 1);
    rerender();
  };
  const workspace = () => (
    <MemoryRouter>
      <CadWorkspace
        document={{ id: 'doc', name: 'Test rig', entities: [], model: history[index] }}
        setCadModel={setCadModel}
        undo={undo}
        redo={() => {}}
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
    undo,
  };
}
const press = (key, init = {}) => act(() => fireEvent.keyDown(window, { key, ...init }));
const row = (name) =>
  [...document.querySelectorAll('.cad-tree .cad-tree-item')].find(
    (b) => b.querySelector('span').firstChild.data === name,
  );
const pane = () => document.querySelector('.cad-drawing');
const settle = () => act(async () => {});

it('a group → Drawing sheet: its members, its name, fit to page, views generated straight away', async () => {
  const harness = setup();
  act(() => fireEvent.click(row('A')));
  act(() => fireEvent.click(row('B'), { shiftKey: true }));
  press('g', { ctrlKey: true });
  harness.rerender();
  const commits = harness.setCadModel.mock.calls.length;
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Drawing sheet' })));
  expect(harness.setCadModel).toHaveBeenCalledTimes(commits + 1);
  const sheet = harness.model().sheets.at(-1);
  expect(sheet).toMatchObject({ title: 'Group 1', instanceIds: ['A', 'B'], scaleMode: 'fit', layout: 'engineering' });
  expect(sheet.partId).toBeUndefined();
  expect(screen.getByRole('button', { name: 'Drawings' }).getAttribute('aria-pressed')).toBe('true');
  // The views are requested once the new sheet's model is the one built.
  harness.rerender();
  await settle();
  // Phase S: the new sheet only.
  expect(kernel.request).toHaveBeenCalledWith('drawings', { sheetIds: [sheet.id] });
  harness.rerender();
  // 140 × 40 views in A3 quarters (169 × 63.5 mm): fitted at 1:1.
  expect(pane().querySelector('.cad-sheet-preview svg').innerHTML).toContain('>1:1 / mm / 2 of 2<');
  expect(within(pane()).getByRole('button', { name: 'Fit to page · 1:1' })).toBeTruthy();
});

// Long (2–2.5 s alone): under the full suite's load it outgrows the 5 s default.
it('New engineering sheet titles several parts "N parts" and no selection after the document', async () => {
  const harness = setup();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Drawings' })));
  // Phase S §4: the whole assembly already has a plain sheet, so it opens (no commit);
  // Create another in the Sheets panel adds one anyway.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'New engineering sheet' })));
  expect(harness.setCadModel).not.toHaveBeenCalled();
  expect(within(pane()).getByLabelText('Drawing sheet').value).toBe('assembly-sheet');
  // It had no views: they are generated by themselves.
  await settle();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Sheets' })));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Create another' })));
  expect(harness.model().sheets.at(-1)).toMatchObject({ title: 'Test rig', scaleMode: 'fit' });
  expect(harness.model().sheets.at(-1).instanceIds).toBeUndefined();
  harness.rerender();
  await settle();
  act(() => fireEvent.click(row('A')));
  act(() => fireEvent.click(row('C'), { shiftKey: true }));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'New engineering sheet' })));
  expect(harness.model().sheets.at(-1)).toMatchObject({ title: '2 parts', instanceIds: ['A', 'C'] });
  harness.rerender();
  await settle();
}, 15000);

// A fixed 1:20 sheet whose 6000 × 2000 views need 300 × 100 mm of a 169 × 63.5 mm quarter.
const big = {
  id: 'big',
  title: 'Big',
  layout: 'engineering',
  size: 'A3',
  units: 'mm',
  scale: 0.05,
  revision: 'A',
  views: ['front', 'top'],
  annotations: [],
  partsList: false,
};
async function overflowing() {
  kernel.viewBox = [0, -2000, 6000, 2000];
  const harness = setup([big]);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Split drawing' })));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Refresh drawings' })));
  await settle();
  return harness;
}

it('an overflowing fixed scale shows the sheet, flags the view and offers fixes, each one commit', async () => {
  const harness = await overflowing();
  const banner = within(pane()).getByRole('status');
  expect(banner.textContent).toContain('Front doesn’t fit on A3 at 1:20.');
  expect(pane().querySelectorAll('[data-overflow="true"]')).toHaveLength(2);
  const fixes = [
    ['Fit to page (1:50)', { scaleMode: 'fit' }],
    ['Use 1:50', { scaleMode: 'fixed', scale: 0.02 }],
    ['Use A1 at 1:20', { size: 'A1', scale: 0.05 }],
  ];
  for (const [name, expected] of fixes) {
    const commits = harness.setCadModel.mock.calls.length;
    act(() => fireEvent.click(within(pane()).getByRole('button', { name })));
    expect(harness.setCadModel).toHaveBeenCalledTimes(commits + 1);
    expect(harness.model().sheets[0]).toMatchObject(expected);
    harness.rerender();
    expect(within(pane()).queryByRole('status')).toBeNull();
    expect(pane().querySelector('[data-overflow]')).toBeNull();
    harness.undo();
    expect(within(pane()).getByRole('status')).toBeTruthy();
  }
});

it('the pane slider previews live and commits once; Screen zoom is a separate control', async () => {
  const harness = await overflowing();
  const slider = within(pane()).getByLabelText('Scale slider');
  const stops = standardScales()
    .filter((s) => s <= 20 && s >= 1 / 5000)
    .reverse();
  const commits = harness.setCadModel.mock.calls.length;
  for (const s of [0.01, 0.02]) act(() => fireEvent.change(slider, { target: { value: String(stops.indexOf(s)) } }));
  // Drawn at the draft: it fits, so no banner, and nothing saved yet.
  expect(pane().querySelector('.cad-sheet-preview svg').innerHTML).toContain('>1:50 / mm / 1 of 1<');
  expect(within(pane()).queryByRole('status')).toBeNull();
  expect(harness.setCadModel).toHaveBeenCalledTimes(commits);
  act(() => fireEvent.pointerUp(slider));
  expect(harness.setCadModel).toHaveBeenCalledTimes(commits + 1);
  expect(harness.model().sheets[0]).toMatchObject({ scaleMode: 'fixed', scale: 0.02 });
  expect(within(pane()).getByLabelText('Screen zoom').title).toMatch(/does not change the printed scale/);
});

// Phase S §7: the changed sheet regenerates by itself (Phase R waited for the button).
it('a changed subject says so while the sheet regenerates by itself; Refresh drawings regenerates it', async () => {
  const harness = await overflowing();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Drawings' })));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Sheet properties' })));
  act(() => fireEvent.change(screen.getByLabelText('Drawing subject'), { target: { value: '__chosen-parts' } }));
  expect(harness.model().sheets[0].instanceIds).toEqual(['A', 'B', 'C']);
  kernel.request.mockClear();
  harness.rerender();
  expect(pane().querySelector('.cad-sheet-preview')).toBeNull();
  expect(pane().textContent).toContain('The drawing subject changed —');
  expect(kernel.request).toHaveBeenCalledTimes(1);
  expect(kernel.request).toHaveBeenCalledWith('drawings', { sheetIds: ['big'] });
  await settle();
  expect(pane().querySelector('.cad-sheet-preview svg')).toBeTruthy();
  kernel.request.mockClear();
  act(() => fireEvent.click(within(pane()).getByRole('button', { name: 'Refresh drawings' })));
  await settle();
  expect(kernel.request).toHaveBeenCalledWith('drawings', { sheetIds: ['big'] });
  expect(pane().querySelector('.cad-sheet-preview svg')).toBeTruthy();
  // A long workspace test: under the full suite's load it outruns the default 5 s.
}, 15000);

// Phase S (docs/sketch-studio-sheet-manager.md §§4–7).
const plain = (id, title, extra = {}) => ({
  id,
  title,
  layout: 'engineering',
  size: 'A3',
  units: 'mm',
  scaleMode: 'fit',
  scale: 1,
  revision: 'A',
  views: ['front', 'top'],
  annotations: [],
  ...extra,
});
const sheetSelect = () => within(pane()).getByLabelText('Drawing sheet');

it('the tree draw icon shows on the Drawings tab only and opens the sheet it made instead of duplicating', async () => {
  const harness = setup();
  expect(screen.queryByRole('button', { name: 'Draw A' })).toBeNull();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Drawings' })));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Draw A' })));
  expect(harness.setCadModel).toHaveBeenCalledTimes(1);
  const sheet = harness.model().sheets.at(-1);
  expect(sheet).toMatchObject({ partId: harness.model().parts[0].id, scaleMode: 'fit' });
  // Not a selection, not a rename.
  expect(document.querySelector('.cad-tree .is-selected')).toBeNull();
  expect(document.querySelector('.cad-tree-rename')).toBeNull();
  harness.rerender();
  await settle();
  expect(kernel.request).toHaveBeenCalledWith('drawings', { sheetIds: [sheet.id] });
  // B is the same part: its sheet opens, nothing is added.
  act(() => fireEvent.change(sheetSelect(), { target: { value: 'assembly-sheet' } }));
  await settle();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Draw B' })));
  expect(harness.setCadModel).toHaveBeenCalledTimes(1);
  expect(sheetSelect().value).toBe(sheet.id);
  // The select tells sheets apart by subject.
  expect([...sheetSelect().options].map((o) => o.textContent)).toEqual([
    'Assembly — Whole assembly',
    `${sheet.title} — Part · ${sheet.title}`,
  ]);
  const ribbon = screen.getByRole('navigation', { name: 'Modeling ribbon' });
  act(() => fireEvent.click(within(ribbon).getByRole('button', { name: 'Solid' })));
  expect(screen.queryByRole('button', { name: 'Draw A' })).toBeNull();
});

it('Add missing part sheets adds a sheet for a part without one, then nothing', async () => {
  const harness = setup();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Drawings' })));
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Add missing part sheets' })));
  expect(harness.model().sheets).toHaveLength(2);
  expect(harness.model().sheets[1]).toMatchObject({ partId: harness.model().parts[0].id, scaleMode: 'fit' });
  harness.rerender();
  expect(screen.getByText('Added 1 sheet')).toBeTruthy();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Add missing part sheets' })));
  expect(harness.setCadModel).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Every part already has a sheet')).toBeTruthy();
});

it('deleting the open sheet opens its neighbour, and the notice’s Undo brings it back', async () => {
  const harness = setup([plain('s1', 'One'), plain('s2', 'Two'), plain('s3', 'Three')]);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Drawings' })));
  // The Drawings tab opened the Sheets panel; a row's title opens its sheet.
  act(() => fireEvent.click(screen.getByRole('button', { name: /^Two/ })));
  expect(sheetSelect().value).toBe('s2');
  await settle();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Delete Two' })));
  expect(harness.model().sheets.map((s) => s.id)).toEqual(['s1', 's3']);
  harness.rerender();
  expect(sheetSelect().value).toBe('s3');
  await settle();
  // The last row hands over to the previous one.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Delete Three' })));
  harness.rerender();
  expect(sheetSelect().value).toBe('s1');
  expect(screen.getByRole('button', { name: 'Delete One' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Delete One' }).title).toBe('A model keeps at least one drawing sheet.');
  expect(screen.getByRole('status').textContent).toBe('Deleted 1 sheet — Undo');
  act(() => fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' })));
  expect(harness.model().sheets.map((s) => s.id)).toEqual(['s1', 's3']);
  // The notice belonged to the undone delete.
  expect(screen.queryByText(/Deleted 1 sheet/)).toBeNull();
  // Load-sensitive like its siblings at :200 (≈ 3 s alone, over 5 s in the full suite).
}, 15000);
it('switching to an ungenerated sheet generates that sheet only, and the generated one stays', async () => {
  setup([plain('s1', 'One'), plain('s2', 'Two')]);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Split drawing' })));
  await settle();
  expect(kernel.request.mock.calls).toEqual([['drawings', { sheetIds: ['s1'] }]]);
  expect(pane().querySelector('.cad-sheet-preview svg').innerHTML).toContain('1 of 2<');
  kernel.request.mockClear();
  act(() => fireEvent.change(sheetSelect(), { target: { value: 's2' } }));
  await settle();
  expect(kernel.request.mock.calls).toEqual([['drawings', { sheetIds: ['s2'] }]]);
  expect(pane().querySelector('.cad-sheet-preview svg').innerHTML).toContain('2 of 2<');
  kernel.request.mockClear();
  act(() => fireEvent.change(sheetSelect(), { target: { value: 's1' } }));
  await settle();
  expect(kernel.request).not.toHaveBeenCalled();
  expect(pane().querySelector('.cad-sheet-preview svg')).toBeTruthy();
});

it('a sheet the kernel refuses shows its own error, once, while another sheet still previews', async () => {
  kernel.fail = new Set(['bad']);
  try {
    setup([plain('good', 'Good'), plain('bad', 'Bad', { section: { origin: [0, 0, 9e9], normal: [0, 0, 1] } })]);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Split drawing' })));
    await settle();
    act(() => fireEvent.change(sheetSelect(), { target: { value: 'bad' } }));
    await settle();
    expect(pane().querySelector('.cad-sheet-error').textContent).toContain('Section Bad does not cross the model.');
    expect(screen.queryByRole('alert')).toBeNull();
    // Tried once: no request loop.
    await settle();
    expect(kernel.request.mock.calls.filter(([, p]) => p?.sheetIds?.includes('bad'))).toHaveLength(1);
    act(() => fireEvent.change(sheetSelect(), { target: { value: 'good' } }));
    await settle();
    expect(pane().querySelector('.cad-sheet-preview svg')).toBeTruthy();
    expect(pane().querySelector('.cad-sheet-error')).toBeNull();
    // Update drawing preview retries by hand.
    act(() => fireEvent.change(sheetSelect(), { target: { value: 'bad' } }));
    kernel.request.mockClear();
    act(() => fireEvent.click(within(pane()).getByRole('button', { name: 'Update drawing preview' })));
    await settle();
    expect(kernel.request).toHaveBeenCalledWith('drawings', { sheetIds: ['bad'] });
  } finally {
    kernel.fail = new Set();
  }
});
