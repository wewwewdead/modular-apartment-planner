// @vitest-environment jsdom
// Phase T (docs/sketch-studio-sheet-pdf.md §§5–6, §8): saving drawing sheets
// as one PDF. The Save dialog opens first, inside the click; only the chosen
// sheets' views are requested (cached ones reused, never `export`); a sheet
// that cannot be exported stops the run with a report and one-click fixes
// while the picked file stays unwritten. The kernel hook, the 3D viewport,
// the PDF writer and the download are stand-ins.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CadWorkspace from './CadWorkspace.jsx';
import { createPart, emptyModel, normalizeModel } from './model.js';
import { sheetsPdf } from './sheetPdf.js';
import { download } from './download.js';
// The whole workspace renders in each test: under the full suite’s parallel load
// its long tests outrun the default 5 s (SF-1 audit), so the file allows 15 s.
vi.setConfig({ testTimeout: 15000 });

// What happened, in order: the picker, kernel requests, the file's writes.
const log = vi.hoisted(() => []);
// The stand-in kernel projects every view as `viewBox`; a sheet in `fail` is
// refused (as the kernel refuses a section that misses), per sheet when the
// request collects errors. `ready`: whether the model on show is built;
// `hold`: a promise a Generate views request waits on.
const kernel = vi.hoisted(() => ({
  viewBox: [0, -40, 140, 40],
  request: null,
  fail: new Set(),
  ready: true,
  hold: null,
}));
const views = (sheet) =>
  sheet.views.map((entry) => {
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
  });
const drawn = (sheet) => ({
  ...sheet,
  bounds: [
    [0, 0, 0],
    [140, 40, 700],
  ],
  views: views(sheet),
});
vi.mock('./useCadModel.js', () => ({
  default: (model) => {
    kernel.request ||= vi.fn();
    kernel.request.mockImplementation(async (type, payload) => {
      log.push(`request:${type}`);
      if (type !== 'drawings') return null;
      if (kernel.hold && !payload?.collectErrors) await kernel.hold;
      const asked = payload?.sheetIds ? model.sheets.filter((s) => payload.sheetIds.includes(s.id)) : [...model.sheets];
      const out = asked.map((sheet) => {
        if (!kernel.fail.has(sheet.id)) return drawn(sheet);
        const error = `Section ${sheet.title} does not cross the model.`;
        if (!payload?.collectErrors) throw new Error(error);
        return { id: sheet.id, title: sheet.title, error };
      });
      if (payload?.includeParts)
        for (const part of model.parts)
          if (!model.sheets.some((s) => s.partId === part.id))
            out.push(
              drawn({
                id: `detail-${part.id}`,
                title: part.name,
                partId: part.id,
                size: 'A3',
                units: 'mm',
                scaleMode: 'fit',
                scale: 1,
                revision: 'A',
                views: ['front', 'top', 'right', 'isometric'],
                annotations: [],
              }),
            );
      return out;
    });
    return {
      status: kernel.ready ? 'ready' : 'building',
      ready: kernel.ready,
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
// The writer: one progress call per page; `gate` holds a page until released.
const writer = vi.hoisted(() => ({ gate: null }));
vi.mock('./sheetPdf.js', () => ({
  sheetsPdf: vi.fn(async (sheets, model, snapshot, options) => {
    for (const [index, page] of options.pages.entries()) {
      if (options.signal?.aborted) throw new DOMException('PDF export cancelled.', 'AbortError');
      options.onProgress?.({ done: index, total: options.pages.length, title: page.title, page: index + 1 });
      if (writer.gate) await writer.gate(options.signal);
    }
    if (options.signal?.aborted) throw new DOMException('PDF export cancelled.', 'AbortError');
    return new Blob(['%PDF-1.3'], { type: 'application/pdf' });
  }),
}));
vi.mock('./download.js', () => ({ download: vi.fn() }));

// The Save dialog and its file: `picked` is what showSaveFilePicker resolves.
let file, writable;
beforeEach(() => {
  log.length = 0;
  writable = {
    write: vi.fn(async (blob) => log.push(`write:${blob.type}`)),
    close: vi.fn(async () => log.push('close')),
    abort: vi.fn(async () => log.push('abort')),
  };
  file = {
    name: 'Frame.pdf',
    createWritable: vi.fn(async () => {
      log.push('createWritable');
      return writable;
    }),
  };
  window.showSaveFilePicker = vi.fn((options) => {
    log.push('picker');
    return Promise.resolve(file, options);
  });
});
afterEach(() => {
  cleanup();
  kernel.viewBox = [0, -40, 140, 40];
  kernel.fail = new Set();
  kernel.ready = true;
  kernel.hold = null;
  kernel.request?.mockClear();
  writer.gate = null;
  sheetsPdf.mockClear();
  download.mockClear();
  delete window.showSaveFilePicker;
});

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
// Three legs and an undo history like SketchStudio's.
function setup(sheets) {
  const { part } = createPart('member');
  const leg = (id, x) => ({ id, partId: part.id, name: id, position: [x, 0, 0], rotation: [0, 0, 0] });
  const base = { ...emptyModel(), parts: [part], instances: [leg('A', 0), leg('B', 100), leg('C', 200)] };
  const history = [normalizeModel(sheets ? { ...base, sheets } : base)];
  let index = 0,
    id = 'doc';
  const setCadModel = vi.fn((next) => {
    history.splice(index + 1);
    history.push(next);
    index = history.length - 1;
  });
  const workspace = () => (
    <MemoryRouter>
      <CadWorkspace
        document={{ id, name: 'Test rig', entities: [], model: history[index] }}
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
  return {
    setCadModel,
    rerender,
    model: () => history[index],
    // The header's Undo: the snapshot before the last commit, the same model object.
    undo: () => {
      index -= 1;
      rerender();
    },
    // Open: another document under the same workspace.
    open: (nextId) => {
      id = nextId;
      history.splice(0, history.length, normalizeModel(base));
      index = 0;
      rerender();
    },
  };
}
const settle = () => act(async () => {});
const pane = () => document.querySelector('.cad-drawing');
const panel = () => screen.getByRole('region', { name: 'Export PDF' });
// The Drawings tab opens on the Sheets panel (nothing else in Properties).
const drawingsTab = () => act(() => fireEvent.click(screen.getByRole('button', { name: 'Drawings' })));
const exportPdf = () => act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Export PDF' })));
const pages = () => sheetsPdf.mock.calls.at(-1)?.[3].pages || null;

it('This sheet: the picker opens inside the click, before any request; only its views; the file gets a PDF', async () => {
  setup([plain('s1', 'Frame'), plain('s2', 'Other')]);
  drawingsTab();
  exportPdf();
  // Synchronously, before anything was awaited (user activation).
  expect(log).toEqual(['picker']);
  expect(window.showSaveFilePicker).toHaveBeenCalledWith({
    suggestedName: 'Test-rig - Frame.pdf',
    types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }],
  });
  await settle();
  expect(kernel.request.mock.calls).toEqual([['drawings', { sheetIds: ['s1'], collectErrors: true }]]);
  expect(log).toEqual(['picker', 'request:drawings', 'createWritable', 'write:application/pdf', 'close']);
  expect(pages()).toHaveLength(1);
  expect(pages()[0]).toMatchObject({ size: 'A3', title: 'Frame' });
  // The export set's numbering: page 1 of 1.
  expect(pages()[0].svg).toContain('1 of 1<');
  expect(sheetsPdf.mock.calls[0][3].title).toBe('Test rig - Frame');
  expect(within(panel()).getByRole('status').textContent).toBe('Saved Frame.pdf (1 page)');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('a current cached sheet makes no kernel request; the pane’s PDF button saves it', async () => {
  setup([plain('s1', 'Frame'), plain('s2', 'Other')]);
  drawingsTab();
  // Opening a row shows the split pane, which generates that sheet by itself.
  act(() => fireEvent.click(screen.getByRole('button', { name: /^Other/ })));
  await settle();
  expect(kernel.request.mock.calls).toEqual([['drawings', { sheetIds: ['s2'] }]]);
  kernel.request.mockClear();
  const button = within(pane()).getByRole('button', { name: 'PDF' });
  expect(button.title).toBe('Save this sheet as a PDF');
  act(() => fireEvent.click(button));
  await settle();
  expect(kernel.request).not.toHaveBeenCalled();
  expect(pages().map((p) => p.title)).toEqual(['Other']);
  expect(log.slice(-2)).toEqual(['write:application/pdf', 'close']);
  expect(file.createWritable).toHaveBeenCalledTimes(1);
});

it('Selected and All give their ids; automatic part sheets only when the box is ticked', async () => {
  const harness = setup([plain('s1', 'One'), plain('s2', 'Two'), plain('s3', 'Three')]);
  drawingsTab();
  const selected = within(panel()).getByRole('radio', { name: 'Selected (0)' });
  expect(selected.disabled).toBe(true);
  act(() => fireEvent.click(screen.getByRole('checkbox', { name: 'Select One' })));
  act(() => fireEvent.click(screen.getByRole('checkbox', { name: 'Select Three' })));
  act(() => fireEvent.click(within(panel()).getByRole('radio', { name: 'Selected (2)' })));
  // The box is only offered for All sheets.
  expect(within(panel()).queryByRole('checkbox', { name: 'Include automatic part detail sheets' })).toBeNull();
  exportPdf();
  expect(window.showSaveFilePicker.mock.calls[0][0].suggestedName).toBe('Test-rig - drawings.pdf');
  await settle();
  expect(kernel.request.mock.calls).toEqual([['drawings', { sheetIds: ['s1', 's3'], collectErrors: true }]]);
  expect(pages().map((p) => p.title)).toEqual(['One', 'Three']);
  expect(pages()[1].svg).toContain('2 of 2<');
  // All sheets: s1 and s3 are cached now; only s2 is asked for.
  kernel.request.mockClear();
  act(() => fireEvent.click(within(panel()).getByRole('radio', { name: 'All sheets (3)' })));
  exportPdf();
  await settle();
  expect(kernel.request.mock.calls).toEqual([['drawings', { sheetIds: ['s2'], collectErrors: true }]]);
  expect(pages().map((p) => p.title)).toEqual(['One', 'Two', 'Three']);
  kernel.request.mockClear();
  act(() => fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Include automatic part detail sheets' })));
  exportPdf();
  await settle();
  expect(kernel.request.mock.calls).toEqual([['drawings', { sheetIds: [], collectErrors: true, includeParts: true }]]);
  // The part has no sheet of its own: its automatic detail sheet comes last.
  expect(pages().map((p) => p.title)).toEqual(['One', 'Two', 'Three', harness.model().parts[0].name]);
  // The bulk bar exports the checked rows.
  kernel.request.mockClear();
  act(() =>
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Selected sheets' })).getByRole('button', {
        name: 'Export selected as PDF',
      }),
    ),
  );
  await settle();
  expect(pages().map((p) => p.title)).toEqual(['One', 'Three']);
});

it('preflight: an overflowing fixed sheet is reported and nothing is written; Fit to page commits once, then writes', async () => {
  const harness = setup([plain('s1', 'Frame', { scaleMode: 'fixed', scale: 50 }), plain('s2', 'Other')]);
  drawingsTab();
  act(() => fireEvent.click(within(panel()).getByRole('radio', { name: 'All sheets (2)' })));
  exportPdf();
  await settle();
  const report = within(panel()).getByRole('status');
  expect(report.textContent).toContain('1 of 2 sheets can’t be exported');
  expect(report.textContent).toContain('Frame — front does not fit on A3 at 50:1.');
  expect(file.createWritable).not.toHaveBeenCalled();
  expect(sheetsPdf).not.toHaveBeenCalled();
  expect(within(report).getByRole('button', { name: 'Export the other 1 sheet' })).toBeTruthy();
  act(() => fireEvent.click(within(report).getByRole('button', { name: 'Fit to page: Frame' })));
  expect(harness.setCadModel).toHaveBeenCalledTimes(1);
  expect(harness.model().sheets[0].scaleMode).toBe('fit');
  // Same ids, same file: straight to writing once the fix is the model on show.
  harness.rerender();
  await settle();
  expect(window.showSaveFilePicker).toHaveBeenCalledTimes(1);
  expect(pages().map((p) => p.title)).toEqual(['Frame', 'Other']);
  expect(log.slice(-3)).toEqual(['createWritable', 'write:application/pdf', 'close']);
  expect(within(panel()).getByRole('status').textContent).toBe('Saved Frame.pdf (2 pages)');
});

it('Fit to page, then Undo before the rebuild: the run waiting on the fix ends instead of spinning', async () => {
  const harness = setup([plain('s1', 'Frame', { scaleMode: 'fixed', scale: 50 }), plain('s2', 'Other')]);
  drawingsTab();
  act(() => fireEvent.click(within(panel()).getByRole('radio', { name: 'All sheets (2)' })));
  exportPdf();
  await settle();
  act(() =>
    fireEvent.click(within(within(panel()).getByRole('status')).getByRole('button', { name: 'Fit to page: Frame' })),
  );
  // The fix is on show and rebuilding: the run waits for it.
  kernel.ready = false;
  harness.rerender();
  expect(within(panel()).getByRole('status').textContent).toContain('Checking sheets…');
  // Undo takes the fix back; the kernel is current again.
  harness.undo();
  kernel.ready = true;
  harness.rerender();
  await settle();
  expect(harness.model().sheets[0].scaleMode).toBe('fixed');
  expect(within(panel()).queryByRole('status')).toBeNull();
  expect(sheetsPdf).not.toHaveBeenCalled();
  expect(file.createWritable).not.toHaveBeenCalled();
  expect(within(panel()).getByRole('button', { name: 'Export PDF' }).disabled).toBe(false);
});

it('preflight: Export the other N writes the sheets that pass, renumbered; Open sheet opens a failing one', async () => {
  kernel.fail = new Set(['bad']);
  setup([
    plain('s1', 'Frame', { scaleMode: 'fixed', scale: 50 }),
    plain('bad', 'Section', { section: { origin: [0, 0, 9e9], normal: [0, 0, 1] } }),
    plain('s3', 'Other'),
  ]);
  drawingsTab();
  act(() => fireEvent.click(within(panel()).getByRole('radio', { name: 'All sheets (3)' })));
  exportPdf();
  await settle();
  const report = within(panel()).getByRole('status');
  expect(report.textContent).toContain('2 of 3 sheets can’t be exported');
  expect(report.textContent).toContain('Section — Section Section does not cross the model.');
  // Fit to page only where fit mode can fix it.
  expect(within(report).queryByRole('button', { name: 'Fit to page: Section' })).toBeNull();
  act(() => fireEvent.click(within(report).getByRole('button', { name: 'Open sheet: Section' })));
  expect(within(pane()).getByLabelText('Drawing sheet').value).toBe('bad');
  kernel.request.mockClear();
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Export the other 1 sheet' })));
  await settle();
  // The refused sheet's error is cached for this geometry: no new request.
  expect(kernel.request.mock.calls.filter(([, p]) => p?.collectErrors)).toEqual([]);
  expect(pages().map((p) => p.title)).toEqual(['Other']);
  expect(pages()[0].svg).toContain('1 of 1<');
  expect(file.createWritable).toHaveBeenCalledTimes(1);
  expect(within(panel()).getByRole('status').textContent).toBe('Saved Frame.pdf (1 page)');
});

it('Cancel on the report drops the file unwritten', async () => {
  setup([plain('s1', 'Frame', { scaleMode: 'fixed', scale: 50 })]);
  drawingsTab();
  exportPdf();
  await settle();
  act(() => fireEvent.click(within(within(panel()).getByRole('status')).getByRole('button', { name: 'Cancel' })));
  expect(within(panel()).queryByRole('status')).toBeNull();
  expect(file.createWritable).not.toHaveBeenCalled();
});

it('a closed Save dialog requests nothing and says nothing', async () => {
  window.showSaveFilePicker = vi.fn(() =>
    Promise.reject(new DOMException('The user aborted a request.', 'AbortError')),
  );
  setup([plain('s1', 'Frame')]);
  drawingsTab();
  exportPdf();
  await settle();
  expect(kernel.request).not.toHaveBeenCalled();
  expect(sheetsPdf).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(within(panel()).queryByRole('status')).toBeNull();
  // The run is over: Export PDF works again.
  expect(within(panel()).getByRole('button', { name: 'Export PDF' }).disabled).toBe(false);
});

it('Cancel while a page renders writes nothing', async () => {
  let release;
  writer.gate = (signal) =>
    new Promise((resolve) => {
      release = resolve;
      signal.addEventListener('abort', resolve);
    });
  setup([plain('s1', 'Frame'), plain('s2', 'Other')]);
  drawingsTab();
  act(() => fireEvent.click(within(panel()).getByRole('radio', { name: 'All sheets (2)' })));
  exportPdf();
  await settle();
  const progress = within(panel()).getByRole('status');
  expect(progress.textContent).toContain('Rendering sheet 1 of 2 — Frame');
  expect(release).toBeTypeOf('function');
  await act(async () => fireEvent.click(within(progress).getByRole('button', { name: 'Cancel' })));
  await settle();
  expect(file.createWritable).not.toHaveBeenCalled();
  expect(writable.write).not.toHaveBeenCalled();
  expect(within(panel()).getByRole('status').textContent).toBe('PDF export cancelled — nothing was written.');
});

it('the status bar’s Cancel ends the PDF run it cancels: nothing written, Export PDF free again', async () => {
  writer.gate = (signal) => new Promise((resolve) => signal.addEventListener('abort', resolve));
  setup([plain('s1', 'Frame'), plain('s2', 'Other')]);
  drawingsTab();
  act(() => fireEvent.click(within(panel()).getByRole('radio', { name: 'All sheets (2)' })));
  exportPdf();
  await settle();
  expect(within(panel()).getByRole('status').textContent).toContain('Rendering sheet 1 of 2 — Frame');
  const footer = document.querySelector('.cad-status');
  await act(async () => fireEvent.click(within(footer).getByRole('button', { name: 'Cancel' })));
  await settle();
  expect(file.createWritable).not.toHaveBeenCalled();
  expect(writable.write).not.toHaveBeenCalled();
  expect(within(panel()).getByRole('status').textContent).toBe('PDF export cancelled — nothing was written.');
  expect(within(panel()).getByRole('button', { name: 'Export PDF' }).disabled).toBe(false);
  // The ribbon's Export PDF… drops its busy face (held at least 400 ms).
  await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
  const ribbonExport = within(document.querySelector('.cad-ribbon')).getByRole('button', { name: /Export PDF…/ });
  expect(ribbonExport.getAttribute('aria-busy')).toBe('false');
});

it('Generate views ending under a PDF run leaves the run its busy state and its Cancel', async () => {
  let views;
  setup([plain('s1', 'Frame', { scaleMode: 'fixed', scale: 50 }), plain('s2', 'Other')]);
  drawingsTab();
  act(() => fireEvent.click(within(panel()).getByRole('radio', { name: 'All sheets (2)' })));
  exportPdf();
  await settle();
  expect(within(panel()).getByRole('status').textContent).toContain('1 of 2 sheets can’t be exported');
  // Generate views starts and waits on the kernel; meanwhile the report's
  // Export the other 1 sheet starts the PDF run, which stops on its page.
  kernel.hold = new Promise((resolve) => {
    views = resolve;
  });
  writer.gate = (signal) => new Promise((resolve) => signal.addEventListener('abort', resolve));
  act(() =>
    fireEvent.click(within(document.querySelector('.cad-ribbon')).getByRole('button', { name: 'Generate views' })),
  );
  act(() => fireEvent.click(within(panel()).getByRole('button', { name: 'Export the other 1 sheet' })));
  await settle();
  expect(within(panel()).getByRole('status').textContent).toContain('Rendering sheet 1 of 1 — Other');
  // The views arrive first: the run is still working, and still busy.
  await act(async () => views());
  await settle();
  const footer = document.querySelector('.cad-status');
  expect(within(panel()).getByRole('status').textContent).toContain('Rendering sheet 1 of 1 — Other');
  expect(footer.textContent).toContain('Preparing workshop output…');
  expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  expect(within(document.querySelector('.cad-ribbon')).getByRole('button', { name: 'SVG sheet' }).disabled).toBe(true);
  // Its Cancel ends it.
  await act(async () => fireEvent.click(within(footer).getByRole('button', { name: 'Cancel' })));
  await settle();
  expect(within(panel()).getByRole('status').textContent).toBe('PDF export cancelled — nothing was written.');
  expect(writable.write).not.toHaveBeenCalled();
});

it('another document ends a PDF run waiting on its report', async () => {
  const harness = setup([plain('s1', 'Frame', { scaleMode: 'fixed', scale: 50 }), plain('s2', 'Other')]);
  drawingsTab();
  act(() => fireEvent.click(within(panel()).getByRole('radio', { name: 'All sheets (2)' })));
  exportPdf();
  await settle();
  expect(within(panel()).getByRole('status').textContent).toContain('1 of 2 sheets can’t be exported');
  harness.open('doc-2');
  await settle();
  expect(document.querySelector('.cad-pdf-report')).toBeNull();
  // The new document's Sheets panel has no run of the old one's on it.
  act(() => fireEvent.click(within(document.querySelector('.cad-ribbon')).getByRole('button', { name: /^Sheets/ })));
  expect(within(panel()).queryByRole('status')).toBeNull();
  expect(within(panel()).getByRole('button', { name: 'Export PDF' }).disabled).toBe(false);
  expect(file.createWritable).not.toHaveBeenCalled();
});

it('without a Save dialog the PDF downloads under the suggested name', async () => {
  delete window.showSaveFilePicker;
  setup([plain('s1', 'Frame / v2')]);
  drawingsTab();
  exportPdf();
  await settle();
  expect(download).toHaveBeenCalledTimes(1);
  expect(download.mock.calls[0][1]).toBe('Test-rig - Frame-v2.pdf');
  expect(download.mock.calls[0][0].type).toBe('application/pdf');
  expect(within(panel()).getByRole('status').textContent).toBe('Downloaded Test-rig - Frame-v2.pdf (1 page)');
});

it('characters the font cannot draw are a warning, not a block, and show in the result line', async () => {
  setup([plain('s1', 'Frame 日本')]);
  drawingsTab();
  exportPdf();
  await settle();
  expect(file.createWritable).toHaveBeenCalledTimes(1);
  expect(within(panel()).getByRole('status').textContent).toBe(
    "Saved Frame.pdf (1 page)⚠ ‘Frame 日本’: these characters can't be shown in the PDF: 日本 (they print as ?)",
  );
});

it('the ribbon’s Export PDF… opens the Sheets panel on its export section, focused', async () => {
  setup([plain('s1', 'Frame')]);
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Drawings' })));
  // Another panel first, so the command has to bring the Sheets panel back.
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Sheet properties' })));
  expect(screen.queryByRole('region', { name: 'Export PDF' })).toBeNull();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Export PDF…' })));
  expect(document.activeElement).toBe(panel());
  expect(window.showSaveFilePicker).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Vector PDF' })).toBeNull();
});
