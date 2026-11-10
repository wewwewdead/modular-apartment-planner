// @vitest-environment jsdom
// Phase S (docs/sketch-studio-sheet-manager.md §5): the Sheets panel's rows
// (open, rename, duplicate, delete), the bulk bar, the keep-one rule, the
// Undo notice and the "New drawing of" row. The workspace's commits are
// stood in for by the model helpers and a history list.
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SheetsPanel, { PdfExportStatus } from './SheetsPanel.jsx';
import { duplicateSheet, emptyModel, normalizeModel, removeSheets } from './model.js';

afterEach(cleanup);

const sheet = (id, title, extra = {}) => ({ id, title, size: 'A3', views: ['front'], annotations: [], ...extra });
const start = () =>
  normalizeModel({
    ...emptyModel(),
    parts: [
      { id: 'p1', name: 'Profile part 1', features: [{ id: 'f', type: 'box', width: 1, depth: 1, height: 1 }] },
      { id: 'p2', name: 'Bracket', features: [{ id: 'f', type: 'box', width: 1, depth: 1, height: 1 }] },
    ],
    groups: [{ id: 'g', name: 'Frame', parentId: null }],
    instances: [
      { id: 'a', partId: 'p2', groupId: 'g' },
      { id: 'b', partId: 'p1', groupId: 'g' },
    ],
    sheets: [
      sheet('s1', 'Assembly'),
      sheet('s2', 'Profile', { partId: 'p1', scaleMode: 'fixed', scale: 0.05 }),
      sheet('s3', 'Frame', { instanceIds: ['a', 'b'], scaleMode: 'fit' }),
    ],
  });

function setup({ selection = null } = {}) {
  const created = vi.fn();
  const opened = vi.fn();
  function Harness() {
    const [history, setHistory] = useState([start()]);
    const [currentId, setCurrentId] = useState('s1');
    const [notice, setNotice] = useState(null);
    const model = history.at(-1);
    const commit = (next) => setHistory((h) => [...h, next]);
    return (
      <>
        <SheetsPanel
          model={model}
          currentId={currentId}
          selection={selection}
          scales={new Map([['s2', 'A3 · 1:20']])}
          notice={notice?.model === model ? notice : null}
          onOpen={(id) => {
            opened(id);
            setCurrentId(id);
          }}
          onCreate={created}
          onRename={(id, title) =>
            commit({ ...model, sheets: model.sheets.map((s) => (s.id === id ? { ...s, title } : s)) })
          }
          onDuplicate={(id) => commit(duplicateSheet(model, id))}
          onDelete={(ids) => {
            const next = removeSheets(model, ids);
            commit(next);
            setNotice({ text: `Deleted ${ids.length} sheet${ids.length === 1 ? '' : 's'}`, undo: true, model: next });
          }}
          onUndo={() => setHistory((h) => h.slice(0, -1))}
        />
        <pre data-testid="model">{JSON.stringify(model.sheets)}</pre>
      </>
    );
  }
  render(<Harness />);
  return { created, opened, sheets: () => JSON.parse(screen.getByTestId('model').textContent) };
}
const rows = () => [...document.querySelectorAll('.cad-sheet-row')];

it('lists every sheet with its subject and scale; a title opens its sheet', () => {
  const harness = setup();
  expect(rows().map((r) => r.querySelector('.cad-sheet-open small').textContent)).toEqual([
    'Whole assembly',
    'Part · Profile part 1',
    'Group · Frame',
  ]);
  expect(rows().map((r) => r.querySelector('.cad-sheet-scale').textContent)).toEqual(['A3', 'A3 · 1:20', 'A3']);
  expect(rows()[0].getAttribute('aria-current')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: /^Profile/ }));
  expect(harness.opened).toHaveBeenCalledWith('s2');
  expect(rows()[1].className).toContain('is-selected');
  expect(rows()[0].getAttribute('aria-current')).toBeNull();
});

it('renames by double-click or F2: Enter commits, Escape cancels, an empty name is refused', () => {
  const harness = setup();
  fireEvent.doubleClick(screen.getByRole('button', { name: /^Profile/ }));
  fireEvent.change(screen.getByLabelText('Rename sheet'), { target: { value: '  Side plate  ' } });
  fireEvent.keyDown(screen.getByLabelText('Rename sheet'), { key: 'Enter' });
  expect(harness.sheets()[1].title).toBe('Side plate');
  fireEvent.keyDown(screen.getByRole('button', { name: /^Side plate/ }), { key: 'F2' });
  fireEvent.change(screen.getByLabelText('Rename sheet'), { target: { value: 'Nope' } });
  fireEvent.keyDown(screen.getByLabelText('Rename sheet'), { key: 'Escape' });
  expect(screen.queryByLabelText('Rename sheet')).toBeNull();
  expect(harness.sheets()[1].title).toBe('Side plate');
  fireEvent.doubleClick(screen.getByRole('button', { name: /^Side plate/ }));
  fireEvent.change(screen.getByLabelText('Rename sheet'), { target: { value: '   ' } });
  fireEvent.keyDown(screen.getByLabelText('Rename sheet'), { key: 'Enter' });
  expect(harness.sheets()[1].title).toBe('Side plate');
});

it('duplicates a sheet right after it and deletes one, with an Undo notice', () => {
  const harness = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate Profile' }));
  expect(harness.sheets().map((s) => s.title)).toEqual(['Assembly', 'Profile', 'Profile (copy)', 'Frame']);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Profile (copy)' }));
  expect(harness.sheets().map((s) => s.title)).toEqual(['Assembly', 'Profile', 'Frame']);
  const notice = screen.getByRole('status');
  expect(notice.textContent).toBe('Deleted 1 sheet — Undo');
  fireEvent.click(within(notice).getByRole('button', { name: 'Undo' }));
  expect(harness.sheets().map((s) => s.title)).toEqual(['Assembly', 'Profile', 'Profile (copy)', 'Frame']);
  // The notice belonged to the model the delete made.
  expect(screen.queryByRole('status')).toBeNull();
});

it('keeps the last sheet: Delete is disabled on it, Delete selected when every row is checked', () => {
  setup();
  fireEvent.click(screen.getByLabelText('Select Assembly'));
  fireEvent.click(screen.getByLabelText('Select Frame'));
  const bulk = screen.getByRole('group', { name: 'Selected sheets' });
  expect(bulk.textContent).toContain('2 selected');
  expect(within(bulk).getByRole('button', { name: 'Delete selected' }).disabled).toBe(false);
  fireEvent.click(screen.getByLabelText('Select all sheets'));
  const all = within(bulk).getByRole('button', { name: 'Delete selected' });
  expect(all.disabled).toBe(true);
  expect(all.title).toBe('A model keeps at least one drawing sheet.');
  // Clear, then delete two at once in one commit.
  fireEvent.click(within(bulk).getByRole('button', { name: 'Clear' }));
  expect(screen.queryByRole('group', { name: 'Selected sheets' })).toBeNull();
  fireEvent.click(screen.getByLabelText('Select Assembly'));
  fireEvent.click(screen.getByLabelText('Select Profile'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  expect(screen.getByRole('status').textContent).toBe('Deleted 2 sheets — Undo');
  expect(rows()).toHaveLength(1);
  const last = screen.getByRole('button', { name: 'Delete Frame' });
  expect(last.disabled).toBe(true);
  expect(last.title).toBe('A model keeps at least one drawing sheet.');
  expect(screen.queryByRole('group', { name: 'Selected sheets' })).toBeNull();
});

it('New drawing of: Open sheet when the subject has one, Create another forces a new one', () => {
  const harness = setup({ selection: { subject: { partId: 'p2' }, count: 1 } });
  const select = screen.getByLabelText('New drawing of');
  // Whole assembly, the 3D selection, parts in tree order, then groups.
  expect([...select.options].map((o) => o.textContent)).toEqual([
    'Whole assembly',
    '3D selection (1)',
    'Bracket',
    'Profile part 1',
    'Frame',
  ]);
  expect(screen.getByRole('button', { name: 'Open sheet' })).toBeTruthy();
  fireEvent.change(select, { target: { value: 'part:p1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open sheet' }));
  expect(harness.created).toHaveBeenLastCalledWith({ partId: 'p1' }, false);
  fireEvent.click(screen.getByRole('button', { name: 'Create another' }));
  expect(harness.created).toHaveBeenLastCalledWith({ partId: 'p1' }, true);
  fireEvent.change(select, { target: { value: 'group:g' } });
  expect(screen.getByRole('button', { name: 'Open sheet' })).toBeTruthy();
  // Bracket has no sheet yet.
  fireEvent.change(select, { target: { value: 'selection' } });
  expect(screen.queryByRole('button', { name: 'Open sheet' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create another' })).toBeNull();
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Create' })));
  expect(harness.created).toHaveBeenLastCalledWith({ partId: 'p2' }, false);
});

// Phase T (docs/sketch-studio-sheet-pdf.md §§5–6): the Export PDF section and its report.
it('Export PDF: This sheet / Selected (N) / All sheets (N), the part-sheet box for All only', () => {
  const exported = vi.fn();
  render(<SheetsPanel model={start()} currentId="s2" onExportPdf={exported} onDelete={() => {}} onOpen={() => {}} />);
  const section = screen.getByRole('region', { name: 'Export PDF' });
  const radio = (name) => within(section).getByRole('radio', { name });
  expect(radio('This sheet').checked).toBe(true);
  expect(radio('Selected (0)').disabled).toBe(true);
  fireEvent.click(within(section).getByRole('button', { name: 'Export PDF' }));
  expect(exported).toHaveBeenLastCalledWith(['s2'], { includeParts: false });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Frame' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Assembly' }));
  fireEvent.click(radio('Selected (2)'));
  expect(within(section).queryByRole('checkbox')).toBeNull();
  fireEvent.click(within(section).getByRole('button', { name: 'Export PDF' }));
  // Model order, whatever order they were ticked in.
  expect(exported).toHaveBeenLastCalledWith(['s1', 's3'], { includeParts: false });
  fireEvent.click(screen.getByRole('button', { name: 'Export selected as PDF' }));
  expect(exported).toHaveBeenLastCalledWith(['s1', 's3']);
  fireEvent.click(radio('All sheets (3)'));
  const parts = within(section).getByRole('checkbox', { name: 'Include automatic part detail sheets' });
  expect(parts.checked).toBe(false);
  fireEvent.click(within(section).getByRole('button', { name: 'Export PDF' }));
  expect(exported).toHaveBeenLastCalledWith(['s1', 's2', 's3'], { includeParts: false });
  fireEvent.click(parts);
  fireEvent.click(within(section).getByRole('button', { name: 'Export PDF' }));
  expect(exported).toHaveBeenLastCalledWith(['s1', 's2', 's3'], { includeParts: true });
  // Unchecking every row while Selected is chosen falls back to This sheet.
  fireEvent.click(radio('Selected (2)'));
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(radio('This sheet').checked).toBe(true);
});

it('the preflight report: each failure with its fixes, the warnings, Export the other N and Cancel', () => {
  const actions = { fit: vi.fn(), open: vi.fn(), skip: vi.fn(), dismiss: vi.fn(), cancel: vi.fn() };
  const run = {
    stage: 'report',
    total: 7,
    passing: 5,
    warnings: ["‘Bracket’: these characters can't be shown in the PDF: 日本 (they print as ?)"],
    failures: [
      { id: 'f', title: 'Frame', error: 'isometric does not fit on A3 at 1:20.', fit: true, auto: false },
      { id: 's', title: 'Section details', error: 'Section does not cross the model.', fit: false, auto: false },
      { id: 'detail-p', title: 'Plate', error: 'Broken weld reference: w', fit: false, auto: true },
    ],
  };
  const { rerender } = render(<PdfExportStatus run={run} actions={actions} />);
  const report = screen.getByRole('status');
  expect(report.querySelector('strong').textContent).toBe('3 of 7 sheets can’t be exported');
  expect([...report.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
    'Frame — isometric does not fit on A3 at 1:20. Fit to pageOpen sheet',
    'Section details — Section does not cross the model. Open sheet',
    // An automatic part sheet has no sheet of its own to open.
    'Plate — Broken weld reference: w ',
  ]);
  expect(report.textContent).toContain(`⚠ ${run.warnings[0]}`);
  fireEvent.click(screen.getByRole('button', { name: 'Fit to page: Frame' }));
  expect(actions.fit).toHaveBeenCalledWith('f');
  fireEvent.click(screen.getByRole('button', { name: 'Open sheet: Section details' }));
  expect(actions.open).toHaveBeenCalledWith('s');
  fireEvent.click(screen.getByRole('button', { name: 'Export the other 5 sheets' }));
  expect(actions.skip).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(actions.dismiss).toHaveBeenCalledTimes(1);
  // While rendering: the sheet on the way and Cancel.
  rerender(
    <PdfExportStatus
      run={{ stage: 'working', progress: { done: 2, total: 12, page: 3, title: 'Frame' } }}
      actions={actions}
    />,
  );
  expect(screen.getByRole('status').textContent).toBe('Rendering sheet 3 of 12 — FrameCancel');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(actions.cancel).toHaveBeenCalledTimes(1);
  rerender(<PdfExportStatus run={null} notice={null} actions={actions} />);
  expect(screen.queryByRole('status')).toBeNull();
});
