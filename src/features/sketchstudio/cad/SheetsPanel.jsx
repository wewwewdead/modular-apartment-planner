import { useEffect, useMemo, useRef, useState } from 'react';
import { findSheetFor } from './model.js';
import { memberIds, sheetSubject, treeRows } from './groups.js';
import { LOADING_COPY, renderingSheetPdf } from '@/ui/loading';

// Why the last sheet cannot be deleted (the model keeps one; normalizeModel).
export const KEEP_ONE_SHEET = 'A model keeps at least one drawing sheet.';
// Parts tree rows, depth first.
const flatRows = (rows) => rows.flatMap((row) => [row, ...(row.children ? flatRows(row.children) : [])]);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A sheet PDF's state (Phase T, docs/sketch-studio-sheet-pdf.md §§5–6): its
// progress with Cancel, the preflight report (each sheet that cannot be
// exported with its one-click fixes, the text warnings, Export the other N
// and Cancel), or the result line. Nothing at all when idle.
export function PdfExportStatus({ run, notice, actions }) {
  if (run?.stage === 'report') {
    const { failures, warnings, passing, total } = run;
    return (
      <div className="cad-pdf-report" role="status">
        <strong>
          {failures.length} of {plural(total, 'sheet')} can’t be exported
        </strong>
        <ul>
          {failures.map((f) => (
            <li key={f.id}>
              {f.title} — {f.error}{' '}
              {f.fit && (
                <button type="button" aria-label={`Fit to page: ${f.title}`} onClick={() => actions.fit(f.id)}>
                  Fit to page
                </button>
              )}
              {!f.auto && (
                <button type="button" aria-label={`Open sheet: ${f.title}`} onClick={() => actions.open(f.id)}>
                  Open sheet
                </button>
              )}
            </li>
          ))}
        </ul>
        {warnings.map((w) => (
          <p key={w} className="cad-pdf-warning">
            ⚠ {w}
          </p>
        ))}
        <div className="cad-inline">
          <button type="button" className="cad-primary" disabled={!passing} onClick={actions.skip}>
            Export the other {plural(passing, 'sheet')}
          </button>
          <button type="button" onClick={actions.dismiss}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  if (run) {
    const { progress } = run;
    return (
      <div className="cad-pdf-progress" role="status">
        <span>
          {progress ? renderingSheetPdf(progress.page, progress.total, progress.title) : LOADING_COPY.sheetPdfPreflight}
        </span>
        {progress && <progress max={progress.total} value={progress.done} aria-label="PDF pages rendered" />}
        <button type="button" onClick={actions.cancel}>
          Cancel
        </button>
      </div>
    );
  }
  if (!notice) return null;
  return (
    <div className="cad-sheet-notice" role="status">
      {notice.text}
      {notice.warnings.map((w) => (
        <p key={w} className="cad-pdf-warning">
          ⚠ {w}
        </p>
      ))}
    </div>
  );
}

// The drawing sheets of a model (Phase S, docs/sketch-studio-sheet-manager.md
// §5): a "New drawing of" row that opens the subject's existing sheet or
// creates one, then one row per sheet (open, rename, duplicate, delete) with a
// bulk Delete selected. Every change is one commit in the workspace, so Undo
// restores it; the last sheet cannot go.
export default function SheetsPanel({
  model,
  currentId,
  // { subject, count } for the 3D selection, or null when nothing is selected.
  selection = null,
  // Sheet id → "A3 · 1:50" (the resolved scale once its views are generated).
  scales = new Map(),
  notice = null,
  disabled = false,
  onOpen,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onUndo,
  // Phase T: { run, notice, actions, focus } (PdfExportStatus; `focus`
  // bumps when Export PDF… asks for this section), and the export itself.
  pdf = null,
  exportDisabled = false,
  onExportPdf,
}) {
  const [choice, setChoice] = useState('assembly');
  const [scope, setScope] = useState('current');
  const [includeParts, setIncludeParts] = useState(false);
  const exportSection = useRef(null);
  const focus = pdf?.focus || 0;
  useEffect(() => {
    if (!focus || !exportSection.current) return;
    exportSection.current.scrollIntoView?.({ block: 'nearest' });
    exportSection.current.focus();
  }, [focus]);
  const [checked, setChecked] = useState(() => new Set());
  const [renaming, setRenaming] = useState(null);
  // The tree reads only the instances and groups: once per change to either,
  // not on every render of the panel.
  const rows = useMemo(
    () => flatRows(treeRows({ instances: model.instances, groups: model.groups })),
    [model.instances, model.groups],
  );
  // Parts in tree order (a part's first instance), then any part not placed.
  const partIds = [
    ...new Set([
      ...rows.filter((r) => r.kind === 'instance').map((r) => r.instance.partId),
      ...model.parts.map((p) => p.id),
    ]),
  ].filter((id) => model.parts.some((p) => p.id === id));
  const groups = rows.filter((r) => r.kind === 'group').map((r) => r.group);
  const subjectOf = (key) => {
    if (key === 'selection') return selection?.subject || null;
    if (key.startsWith('part:')) {
      const id = key.slice(5);
      return model.parts.some((p) => p.id === id) ? { partId: id } : null;
    }
    if (key.startsWith('group:')) {
      const group = groups.find((g) => g.id === key.slice(6));
      return group ? { instanceIds: memberIds(model, [group.id]), title: group.name } : null;
    }
    return {};
  };
  // A choice that went away (selection cleared, part removed) reads as the assembly.
  const key = subjectOf(choice) ? choice : 'assembly';
  const subject = subjectOf(key);
  const existing = findSheetFor(model, subject);
  // Checks on sheets that are gone (Undo, a removed part) drop out.
  const marked = model.sheets.filter((s) => checked.has(s.id)).map((s) => s.id);
  const all = marked.length === model.sheets.length;
  const only = model.sheets.length === 1;
  const toggle = (id) =>
    setChecked((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const commitRename = () => {
    if (!renaming) return;
    const title = renaming.value.trim();
    setRenaming(null);
    // An empty name is refused: the sheet keeps its title.
    if (title) onRename(renaming.id, title);
  };
  const remove = (ids) => {
    onDelete(ids);
    setChecked((old) => new Set([...old].filter((id) => !ids.includes(id))));
  };
  // Selected with nothing checked reads as This sheet.
  const shownScope = scope === 'selected' && !marked.length ? 'current' : scope;
  const exportIds =
    shownScope === 'all' ? model.sheets.map((s) => s.id) : shownScope === 'selected' ? marked : [currentId];
  const canExport = Boolean(onExportPdf) && !disabled && !exportDisabled;
  return (
    <section className="cad-sheets-panel" aria-label="Drawing sheets">
      <h3>Drawing sheets</h3>
      <section className="cad-pdf-export" aria-label="Export PDF" tabIndex={-1} ref={exportSection}>
        <h4>Export PDF</h4>
        <div className="cad-pdf-scope" role="radiogroup" aria-label="Sheets in the PDF">
          <label>
            <input
              type="radio"
              name="pdf-scope"
              checked={shownScope === 'current'}
              onChange={() => setScope('current')}
            />
            This sheet
          </label>
          <label>
            <input
              type="radio"
              name="pdf-scope"
              checked={shownScope === 'selected'}
              disabled={!marked.length}
              onChange={() => setScope('selected')}
            />
            Selected ({marked.length})
          </label>
          <label>
            <input type="radio" name="pdf-scope" checked={shownScope === 'all'} onChange={() => setScope('all')} />
            All sheets ({model.sheets.length})
          </label>
        </div>
        {shownScope === 'all' && (
          <label className="cad-sheet-check">
            <input type="checkbox" checked={includeParts} onChange={(e) => setIncludeParts(e.target.checked)} />
            Include automatic part detail sheets
          </label>
        )}
        <button
          type="button"
          className="cad-primary"
          title="One true-size PDF: print at actual size to keep the stated scale"
          disabled={!canExport || !exportIds.length || (shownScope === 'current' && !currentId)}
          onClick={() => onExportPdf(exportIds, { includeParts: shownScope === 'all' && includeParts })}
        >
          Export PDF
        </button>
        {pdf && <PdfExportStatus run={pdf.run} notice={pdf.notice} actions={pdf.actions} />}
      </section>
      <label className="cad-field">
        New drawing of
        <select aria-label="New drawing of" value={key} onChange={(e) => setChoice(e.target.value)}>
          <option value="assembly">Whole assembly</option>
          {selection && <option value="selection">3D selection ({selection.count})</option>}
          {partIds.length > 0 && (
            <optgroup label="Parts">
              {partIds.map((id) => (
                <option key={id} value={`part:${id}`}>
                  {model.parts.find((p) => p.id === id).name}
                </option>
              ))}
            </optgroup>
          )}
          {groups.length > 0 && (
            <optgroup label="Groups">
              {groups.map((g) => (
                <option key={g.id} value={`group:${g.id}`}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <div className="cad-inline">
        <button
          type="button"
          className="cad-primary"
          disabled={disabled}
          title={existing ? `Open “${existing.title}”` : 'A new sheet of this subject, fitted to the page'}
          onClick={() => onCreate(subject, false)}
        >
          {existing ? 'Open sheet' : 'Create'}
        </button>
        {existing && (
          <button type="button" className="cad-link" disabled={disabled} onClick={() => onCreate(subject, true)}>
            Create another
          </button>
        )}
      </div>
      {notice && (
        <p className="cad-sheet-notice" role="status">
          {notice.text}
          {notice.undo && (
            <>
              {' — '}
              <button type="button" className="cad-link" onClick={onUndo}>
                Undo
              </button>
            </>
          )}
        </p>
      )}
      <div className="cad-sheet-list-head">
        <label className="cad-sheet-check">
          <input
            type="checkbox"
            aria-label="Select all sheets"
            checked={all}
            onChange={() => setChecked(all ? new Set() : new Set(model.sheets.map((s) => s.id)))}
          />
          {model.sheets.length} sheet{model.sheets.length === 1 ? '' : 's'}
        </label>
      </div>
      {marked.length > 0 && (
        <div className="cad-sheet-bulk" role="group" aria-label="Selected sheets">
          <span>{marked.length} selected</span>
          <button
            type="button"
            className="cad-danger"
            disabled={disabled || all}
            title={all ? KEEP_ONE_SHEET : 'Delete the checked sheets (Undo restores them)'}
            onClick={() => remove(marked)}
          >
            Delete selected
          </button>
          <button
            type="button"
            disabled={!canExport}
            title="The checked sheets as one PDF"
            onClick={() => onExportPdf(marked)}
          >
            Export selected as PDF
          </button>
          <button type="button" onClick={() => setChecked(new Set())}>
            Clear
          </button>
        </div>
      )}
      <ul className="cad-sheet-list">
        {model.sheets.map((s) => {
          const current = s.id === currentId;
          const title = s.title || 'Untitled sheet';
          return (
            <li
              key={s.id}
              className={`cad-sheet-row ${current ? 'is-selected' : ''}`}
              aria-current={current ? 'true' : undefined}
            >
              <input
                type="checkbox"
                aria-label={`Select ${title}`}
                checked={checked.has(s.id)}
                onChange={() => toggle(s.id)}
              />
              {renaming?.id === s.id ? (
                <input
                  className="cad-sheet-rename"
                  aria-label="Rename sheet"
                  autoFocus
                  maxLength={65}
                  value={renaming.value}
                  onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="cad-sheet-open"
                  title="Open this sheet · double-click or F2 to rename"
                  onClick={() => onOpen(s.id)}
                  onDoubleClick={() => setRenaming({ id: s.id, value: s.title || '' })}
                  onKeyDown={(e) => {
                    if (e.key === 'F2') {
                      e.preventDefault();
                      setRenaming({ id: s.id, value: s.title || '' });
                    }
                  }}
                >
                  <span>{title}</span>
                  <small>{sheetSubject(s, model).label}</small>
                </button>
              )}
              <span className="cad-sheet-scale">{scales.get(s.id) || s.size || 'A3'}</span>
              <button
                type="button"
                className="cad-sheet-action"
                aria-label={`Duplicate ${title}`}
                title="Duplicate this sheet"
                disabled={disabled}
                onClick={() => onDuplicate(s.id)}
              >
                ⧉
              </button>
              <button
                type="button"
                className="cad-sheet-action"
                aria-label={`Delete ${title}`}
                title={only ? KEEP_ONE_SHEET : 'Delete this sheet (Undo restores it)'}
                disabled={disabled || only}
                onClick={() => remove([s.id])}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
