import { useMemo, useRef, useState } from 'react';
import { JsonEditor } from './CadEditors.jsx';
import ExpressionInput from './ExpressionInput.jsx';
import { uid } from './model.js';
import {
  deleteParameter,
  mergeParameters,
  parameterUses,
  parseParameterValue,
  parsePasteList,
  renameParameter,
  replaceParameterWithNumber,
  resolveParameterRows,
  validateParameterName,
} from './parameters.js';
import { PARAMETER_PRESETS, SNAP_CHOICES, presetById } from './parameterPresets.js';
import { hasStarterModel } from './starterModels.js';

const show = (value) => (typeof value === 'number' ? String(value) : String(value ?? ''));
const format = (value) => String(+value.toFixed(4));

// One parameter: Name → Value → (next row's Name) with Enter; Esc reverts.
// Drafts commit on Enter or blur, like the CAD panel's other fields.
function ParameterRow({ parameter, index, resolved, uses, failing, focusRow, onRename, onValue, onNote, onDelete }) {
  const [name, setName] = useState(parameter.name);
  const [value, setValue] = useState(show(parameter.value));
  const [note, setNote] = useState(parameter.note || '');
  const [nameError, setNameError] = useState('');
  const committed = useRef(false);
  const nameInput = useRef(null),
    valueInput = useRef(null);
  const commitName = () => {
    if (name.trim() === parameter.name) return true;
    const problem = onRename(name);
    setNameError(problem);
    return !problem;
  };
  const commitValue = () => {
    if (value.trim() === show(parameter.value)) return;
    onValue(parseParameterValue(value));
  };
  return (
    <div
      className={`cad-param-row${resolved?.error || failing ? ' is-failing' : ''}`}
      role="group"
      aria-label={`Parameter ${parameter.name}`}
    >
      <input
        ref={nameInput}
        className="cad-param-name"
        aria-label={`Name of parameter ${index + 1}`}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setNameError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (commitName()) valueInput.current?.focus();
          } else if (e.key === 'Escape') {
            setName(parameter.name);
            setNameError('');
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (!commitName()) setName(parameter.name);
        }}
      />
      <ExpressionInput
        ref={valueInput}
        className="cad-param-value"
        aria-label={parameter.name}
        value={value}
        onChange={setValue}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            committed.current = true;
            commitValue();
            focusRow(index + 1);
          } else if (e.key === 'Escape') {
            setValue(show(parameter.value));
            committed.current = true;
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (!committed.current) commitValue();
          committed.current = false;
        }}
      />
      <span className="cad-param-resolved" aria-label={`${parameter.name} resolved`}>
        {resolved?.error ? resolved.error : resolved ? format(resolved.value) : ''}
      </span>
      <input
        className="cad-param-note"
        aria-label={`Note for ${parameter.name}`}
        placeholder="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        onBlur={() => note !== (parameter.note || '') && onNote(note)}
      />
      <span className="cad-param-actions">
        <span className="cad-param-uses" title="Model values that reference this parameter">
          used by {uses}
        </span>
        <button type="button" aria-label={`Delete ${parameter.name}`} onClick={onDelete}>
          Delete
        </button>
      </span>
      {nameError && (
        <p className="cad-param-message" role="alert">
          {nameError}
        </p>
      )}
      {failing && !resolved?.error && (
        <p className="cad-param-message">The model failed to rebuild after this change. Undo, or change the value.</p>
      )}
    </div>
  );
}

// The row being added: Name, then Value; Enter commits it and opens the next
// empty row; Esc cancels.
function NewParameterRow({ parameters, onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const valueInput = useRef(null);
  const cancel = (e) => {
    if (e.key !== 'Escape') return false;
    e.preventDefault();
    onCancel();
    return true;
  };
  return (
    <div className="cad-param-row is-new" role="group" aria-label="New parameter">
      <input
        autoFocus
        className="cad-param-name"
        aria-label="New parameter name"
        placeholder="name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError('');
        }}
        onKeyDown={(e) => {
          if (cancel(e) || e.key !== 'Enter') return;
          e.preventDefault();
          const problem = validateParameterName(name, parameters);
          setError(problem);
          if (!problem) valueInput.current?.focus();
        }}
      />
      <ExpressionInput
        ref={valueInput}
        className="cad-param-value"
        aria-label="New parameter value"
        placeholder="value or =expression"
        value={value}
        onChange={(text) => {
          setValue(text);
          setError('');
        }}
        onKeyDown={(e) => {
          if (cancel(e) || e.key !== 'Enter') return;
          e.preventDefault();
          const problem = validateParameterName(name, parameters) || (value.trim() ? '' : 'Enter a value.');
          setError(problem);
          if (!problem) onAdd(name.trim(), parseParameterValue(value));
        }}
      />
      {error && (
        <p className="cad-param-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ParametersPanel({ model, onCommit, failingId, onDesign, onEdited, notice = '' }) {
  const [adding, setAdding] = useState(0);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [message, setMessage] = useState('');
  const [refusal, setRefusal] = useState(null);
  const rows = useMemo(() => resolveParameterRows(model.parameters), [model.parameters]);
  const uses = useMemo(
    () => Object.fromEntries(model.parameters.map((p) => [p.id, parameterUses(model, p.name, p.id)])),
    [model],
  );
  const panel = useRef(null);
  const focusRow = (index) => {
    const next = panel.current?.querySelector(`[aria-label="Name of parameter ${index + 1}"]`);
    if (next) next.focus();
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };
  const run = (fn, id) => {
    try {
      onCommit(fn());
      onEdited?.(id);
      setMessage('');
      return '';
    } catch (error) {
      return error.message;
    }
  };
  const update = (id, patch) =>
    run(() => ({ ...model, parameters: model.parameters.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), id);
  return (
    <div className="cad-parameters" ref={panel}>
      <h3>Named parameters</h3>
      <p className="cad-help">
        Type a number or an expression such as <code>=width-2*t</code>. Values that use a name follow it when it
        changes. All lengths are mm.
      </p>
      <div className="cad-inline">
        <button type="button" className="cad-primary" onClick={onDesign}>
          Design parameters
        </button>
        <button type="button" onClick={() => setPasting(!pasting)} aria-pressed={pasting}>
          Paste list
        </button>
      </div>
      {pasting && (
        <div className="cad-param-paste">
          <label className="cad-field">
            One per line: <code>width = 800</code>, <code>t 18</code> or <code>depth: 500</code>
            <textarea
              aria-label="Parameter list"
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const { entries, errors } = parsePasteList(pasteText);
              if (errors.length) return setMessage(errors.join(' '));
              if (!entries.length) return setMessage('Nothing to add.');
              const merged = mergeParameters(model.parameters, entries, () => uid('parameter'));
              const problem = run(() => ({ ...model, parameters: merged.parameters }));
              if (problem) return setMessage(problem);
              setMessage(`Added ${merged.added}, updated ${merged.updated}.`);
              setPasteText('');
              setPasting(false);
            }}
          >
            Add / update parameters
          </button>
        </div>
      )}
      {(message || notice) && (
        <p className="cad-param-status" role="status">
          {message || notice}
        </p>
      )}
      <div className="cad-param-header" aria-hidden="true">
        <span>Name</span>
        <span>Value</span>
        <span>Resolved</span>
      </div>
      {model.parameters.map((p, index) => (
        <ParameterRow
          key={`${p.id}:${p.name}:${show(p.value)}:${p.note || ''}`}
          parameter={p}
          index={index}
          resolved={rows[p.id]}
          uses={uses[p.id]}
          failing={failingId === p.id}
          focusRow={(next) => (next >= model.parameters.length && adding ? null : focusRow(next))}
          onRename={(name) => {
            const problem = validateParameterName(name, model.parameters, p.id);
            return problem || run(() => renameParameter(model, p.id, name), p.id);
          }}
          onValue={(value) => update(p.id, { value })}
          onNote={(note) => update(p.id, { note })}
          onDelete={() => {
            try {
              onCommit(deleteParameter(model, p.id));
              setRefusal(null);
            } catch (error) {
              setRefusal({ id: p.id, message: error.message });
            }
          }}
        />
      ))}
      {refusal && model.parameters.some((p) => p.id === refusal.id) && (
        <div className="cad-param-refusal" role="alert">
          <p>{refusal.message}</p>
          <div className="cad-inline">
            <button
              type="button"
              onClick={() => {
                const problem = run(() => replaceParameterWithNumber(model, refusal.id));
                if (problem) setMessage(problem);
                setRefusal(null);
              }}
            >
              Replace uses with number
            </button>
            <button type="button" onClick={() => setRefusal(null)}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {adding > 0 && (
        <NewParameterRow
          key={adding}
          parameters={model.parameters}
          onCancel={() => setAdding(0)}
          onAdd={(name, value) => {
            const id = uid('parameter');
            const problem = run(() => ({ ...model, parameters: [...model.parameters, { id, name, value }] }), id);
            if (problem) setMessage(problem);
            else setAdding(adding + 1);
          }}
        />
      )}
      <button type="button" onClick={() => setAdding(adding + 1)}>
        Add parameter
      </button>
      <details>
        <summary>Advanced</summary>
        <JsonEditor
          key={JSON.stringify(model.parameters)}
          label="Parameter definitions"
          value={model.parameters}
          onApply={(parameters) => onCommit({ ...model, parameters })}
        />
      </details>
    </div>
  );
}

// Preset → editable values → one commit (existing names keep their ids).
export function DesignParametersForm({ model, snap, onApply, onCancel }) {
  const [presetId, setPresetId] = useState(PARAMETER_PRESETS[0].id);
  const [rows, setRows] = useState(() => presetRows(PARAMETER_PRESETS[0]));
  const [snapValue, setSnapValue] = useState(String(presetById(PARAMETER_PRESETS[0].id).snap ?? snap));
  const [error, setError] = useState('');
  // A starter model is only built into an empty model, so existing work is
  // never replaced.
  const occupied = model.parts.length > 0;
  const [build, setBuild] = useState(!occupied);
  const buildable = hasStarterModel(presetId);
  const building = build && buildable && !occupied;
  const existing = new Set(model.parameters.map((p) => p.name));
  const change = (index, patch) => setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="cad-design-parameters">
      <h3>Design parameters</h3>
      <p className="cad-help">
        Start from a preset, adjust the values, then Apply. Names that already exist are updated in place, so every
        value that uses them follows.
      </p>
      <label className="cad-field">
        Preset
        <select
          aria-label="Preset"
          value={presetId}
          onChange={(e) => {
            const preset = presetById(e.target.value);
            setPresetId(preset.id);
            setRows(presetRows(preset));
            setSnapValue(String(preset.snap ?? snapValue));
            setError('');
          }}
        >
          {PARAMETER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <p className="cad-help">{presetById(presetId).description}</p>
      {buildable && (
        <label className="cad-sheet-check">
          <input type="checkbox" checked={building} disabled={occupied} onChange={(e) => setBuild(e.target.checked)} />
          Build the starter model from these parameters
        </label>
      )}
      {buildable && occupied && (
        <p className="cad-help">Model already has parts — only the parameters are added or updated.</p>
      )}
      {rows.map((row, index) => (
        <div className="cad-design-row" key={index}>
          <input
            aria-label={`Preset name ${index + 1}`}
            value={row.name}
            onChange={(e) => change(index, { name: e.target.value })}
          />
          <ExpressionInput
            aria-label={`${row.name || `Row ${index + 1}`} value`}
            value={row.value}
            names={rows.map((r) => r.name).filter(Boolean)}
            onChange={(value) => change(index, { value })}
          />
          <button
            type="button"
            aria-label={`Remove ${row.name || `row ${index + 1}`}`}
            onClick={() => setRows(rows.filter((_, i) => i !== index))}
          >
            ×
          </button>
          {row.note && <small>{row.note}</small>}
          {existing.has(row.name) && <small className="cad-design-update">updates existing</small>}
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { name: '', value: '', note: '' }])}>
        Add row
      </button>
      <label className="cad-field">
        Default snap (mm) for moving parts
        <select aria-label="Default snap (mm)" value={snapValue} onChange={(e) => setSnapValue(e.target.value)}>
          {SNAP_CHOICES.map((value) => (
            <option key={value} value={String(value)}>
              {value === 0 ? 'Off (free)' : value}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="cad-param-message" role="alert">
          {error}
        </p>
      )}
      <div className="cad-inline">
        <button
          type="button"
          className="cad-primary"
          onClick={() => {
            const named = rows.filter((row) => row.name.trim() || String(row.value).trim());
            const seen = [];
            for (const row of named) {
              const problem =
                validateParameterName(row.name, seen) ||
                (String(row.value).trim() ? '' : `${row.name}: enter a value.`);
              if (problem) return setError(problem);
              seen.push({ id: row.name, name: row.name.trim() });
            }
            const message = onApply(
              named.map((row) => ({ name: row.name.trim(), value: parseParameterValue(row.value), note: row.note })),
              Number(snapValue),
              building ? presetId : null,
            );
            if (message) setError(message);
          }}
        >
          {building ? 'Apply & build' : 'Apply'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
const presetRows = (preset) =>
  preset.parameters.map((p) => ({ name: p.name, value: show(p.value), note: p.note || '' }));
