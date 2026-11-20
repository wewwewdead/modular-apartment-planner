// The fabrication shop's Properties panels (docs/sketch-studio-fab-shop.md
// §9 SM-1): Cut from sheet (the stock for an outline chosen in Draw,
// docs/sketch-studio-shop-floor.md §4.5), the sheet-metal feature form (stock, thickness, K, the bend
// table, Add bend) and Shop → More → Add bought-in item. Every number shown comes from sheetMetal.js and
// shopCatalog.js; nothing is committed that foldSheet refuses.
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { resolveParameters, uid } from './model.js';
import { isClosedProfile } from './operations.js';
import { sketchEditProblem } from './sketchOperations.js';
import {
  BLANK_EDGES,
  bendLineFromEdge,
  strokeBends,
  autoHits,
  bendNumbers,
  crossingText,
  distanceFromLeg,
  foldSheet,
  isBendOn,
  legFromDistance,
  madeBends,
  profilePolygon,
} from './sheetMetal.js';
import {
  DEFAULT_MACHINE,
  DEFAULT_STOCK,
  MACHINES,
  PUNCHES,
  RADIUS_PUNCHES,
  SHEET_STOCK,
  SHOP_TOLERANCE,
  STOCK_KEYS,
  dieOf,
  machineOf,
  nearestRadiusPunch,
  shopTolerance,
  stockOf,
} from './shopCatalog.js';
import { ValueField } from './CadEditors.jsx';
import { OutlineThumb, PrimaryButton, ProblemCard, StationShell } from './ShopFloor.jsx';
import { ParameterContext } from './ExpressionInput.jsx';
import { MAX_LASER_QUANTITY } from './laserStation.js';
import NumericInput from '../components/NumericInput.jsx';
import FlangeGaps from './FlangeGaps.jsx';
import { cornerRows, gapLabel, setGapsText } from './cornerGaps.js';
import { sequenceChecks } from './brakeStation.js';
import { cutParts, readyOutlines } from './shopRoute.js';

const fmt = (value) => (Number.isFinite(value) ? Number(value.toFixed(2)).toString() : '—');
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const EDGE_NAMES = { left: 'Left', right: 'Right', front: 'Front', rear: 'Rear' };
const blankLine = (flat) =>
  `Blank ${fmt(flat.width)} × ${fmt(flat.height)} mm · cut length ${fmt(flat.cutLength)} mm · ${plural(flat.pierces, 'pierce')}`;

// A sheet-metal feature for a blank sketch: no bends yet.
export function sheetMetalPart({ sketchId, stock, thickness, name = 'Sheet-metal part' }) {
  return {
    id: uid('part'),
    name,
    material: stockOf(stock).name,
    features: [
      {
        id: uid('feature'),
        type: 'sheetmetal',
        sketchId,
        thickness,
        stock,
        kFactor: null,
        base: null,
        marks: [],
        bends: [],
      },
    ],
  };
}

function Segmented({ label, options, value, onChange, disabled = false }) {
  return (
    <span className="cad-segmented" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} disabled={disabled} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </span>
  );
}

function StockSelect({ stock, onStock }) {
  return (
    <label className="cad-field">
      Sheet stock
      <select aria-label="Sheet stock" value={stock} onChange={(e) => onStock(e.target.value)}>
        {STOCK_KEYS.map((key) => (
          <option key={key} value={key}>
            {SHEET_STOCK[key].name}
          </option>
        ))}
      </select>
    </label>
  );
}

// The stock's standard thicknesses, or a custom one (also the panel maker's form, SF-3).
export function StockFields({ stock, thickness, onStock, onThickness }) {
  const entry = SHEET_STOCK[stock] || SHEET_STOCK[DEFAULT_STOCK];
  const standard = entry.thicknesses.includes(thickness);
  const [custom, setCustom] = useState(!standard);
  return (
    <>
      <StockSelect stock={entry.key} onStock={onStock} />
      <label className="cad-field">
        Thickness
        <select
          aria-label="Thickness"
          value={custom || !standard ? 'custom' : String(thickness)}
          onChange={(e) => {
            if (e.target.value === 'custom') return setCustom(true);
            setCustom(false);
            onThickness(Number(e.target.value));
          }}
        >
          {entry.thicknesses.map((t) => (
            <option key={t} value={String(t)}>
              {t} mm
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </label>
      {(custom || !standard) && (
        <label className="cad-field">
          Custom thickness (mm)
          <NumericInput
            aria-label="Custom thickness (mm)"
            min="0.1"
            step="0.1"
            value={thickness}
            onCommit={(v) => v > 0 && onThickness(v)}
          />
        </label>
      )}
    </>
  );
}

/**
 * Shop → More → Add bought-in item… (docs/sketch-studio-shop-floor.md §5.4):
 * a part the shop buys, by its name, size W × D × H, colour and reference.
 * `onAdd(item)` drops it in the view (shopParts.js boughtInItem); `onCancel`
 * closes the panel.
 */
export function BoughtInPanel({ onAdd, onCancel }) {
  const [item, setItem] = useState({ name: '', width: 200, depth: 20, height: 120, colour: '#22262a', reference: '' });
  const set = (patch) => setItem((old) => ({ ...old, ...patch }));
  return (
    <section className="cad-shop-panel" aria-label="Bought-in item">
      <h3>Add bought-in item</h3>
      <p className="cad-help">
        A part the shop buys (a display, a lock, a fan): its size and colour, dropped in the view. The job sheet lists
        it as not made here.
      </p>
      <label className="cad-field">
        Name
        <input
          aria-label="Item name"
          value={item.name}
          placeholder="Display"
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <div className="cad-inline">
        {[
          ['width', 'W (mm)'],
          ['depth', 'D (mm)'],
          ['height', 'H (mm)'],
        ].map(([key, label]) => (
          <label className="cad-field" key={key}>
            {label}
            <NumericInput
              aria-label={`Item ${label}`}
              min="0.1"
              step="1"
              value={item[key]}
              onCommit={(v) => v > 0 && set({ [key]: v })}
            />
          </label>
        ))}
      </div>
      <div className="cad-inline">
        <label className="cad-field">
          Colour
          <input
            type="color"
            aria-label="Item colour"
            value={item.colour}
            onChange={(e) => set({ colour: e.target.value })}
          />
        </label>
        <label className="cad-field">
          Reference
          <input
            aria-label="Item reference"
            value={item.reference}
            placeholder="Supplier part no."
            onChange={(e) => set({ reference: e.target.value })}
          />
        </label>
      </div>
      <div className="cad-inline">
        <button type="button" className="cad-primary" onClick={() => onAdd(item)}>
          Add the item
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

/**
 * The Cut station's outline with no part yet (docs/sketch-studio-shop-floor.md
 * §4.5; the outline is chosen in Draw): the stock and thickness, the blank's
 * size, how many, and Cut on the laser. `outline`: { kind: 'rectangle',
 * width, height } | { kind: 'sketch', sketchId } | { kind: 'drawing', blank }
 * (drawingBlanks) | { kind: 'batch', items: [sketch or drawing outlines] }
 * (docs/sketch-studio-outline-edit-sheet-nest.md §4.8: several outlines cut
 * in one go, BatchCutPanel).
 * `onCreate({ sketch, part, centre, bounds, quantity })`: `sketch` is a new XY
 * blank sketch, or null when an existing XY sketch is the blank; `centre` and
 * `bounds` are the blank's bounding-box centre and bounds (the workspace lays
 * the new instances out round the view's drop point); `quantity` the copies
 * (SN-1 §4.3: each one an instance). A batch calls `onCreate({ items })`, one
 * such record per outline. A sketch outline has Edit outline (§3.6):
 * `onEditOutline({ stock, thickness })` reopens it in the sketcher, and the
 * finish comes back here with the outline's `stock` and `thickness` as they
 * were; `editNotice` says what that finish did. `{ kind: 'pick', selected,
 * quantities, stock, thickness }` is Cut's picker (docs/sketch-studio-cut-pick.md
 * §4.2, PickCutPanel): every outline ready to cut, ticked to cut.
 */
export function CutFromSheetPanel(props) {
  const kind = props.outline?.kind;
  return kind === 'pick' ? (
    <PickCutPanel {...props} />
  ) : kind === 'batch' ? (
    <BatchCutPanel {...props} />
  ) : (
    <SingleCutPanel {...props} />
  );
}

// The panel's parameter values ({} when they cannot be read: the fold then says why).
function useParams(model) {
  return useMemo(() => {
    try {
      return resolveParameters(model.parameters);
    } catch {
      return {};
    }
  }, [model.parameters]);
}
// An XY sketch at the origin is the blank itself; anything else is copied flat.
const reusesSketch = (sketch) =>
  Boolean(sketch) &&
  (sketch.plane || 'XY') === 'XY' &&
  !sketch.normal &&
  !(sketch.origin || []).some((v) => Number(v) !== 0);
const blankSketch = ({ name, profile, sourceIds = null }) => ({
  id: uid('sketch'),
  name,
  plane: 'XY',
  profile: JSON.parse(JSON.stringify(profile)),
  primitives: [],
  constrained: false,
  ...(sourceIds ? { sourceEntityIds: sourceIds } : {}),
});
const centreOf = ([[x0, y0], [x1, y1]]) => [(x0 + x1) / 2, (y0 + y1) / 2];

// How many of a blank (SN-1 §4.3): 1 – MAX_LASER_QUANTITY, each a part instance.
function QuantityField({ label = 'Quantity', value, onChange }) {
  return (
    <label className="cad-field cad-quantity-field">
      {/* A batch row's field reads "× n" beside the outline's name; its full name is for the screen reader. */}
      {label === 'Quantity' ? (
        'Quantity'
      ) : (
        <span aria-hidden="true" className="cad-quantity-times">
          ×
        </span>
      )}
      <NumericInput
        aria-label={label}
        min="1"
        max={String(MAX_LASER_QUANTITY)}
        step="1"
        value={value}
        onCommit={(v) => onChange(Math.max(1, Math.min(MAX_LASER_QUANTITY, Math.round(v) || 1)))}
      />
    </label>
  );
}

function SingleCutPanel({ model, outline, shell = null, onCreate, onEditOutline = null, editNotice = '' }) {
  const source = outline?.kind || 'rectangle';
  const size = source === 'rectangle' ? { width: outline?.width ?? 100, height: outline?.height ?? 60 } : null;
  // A sketch outline comes back from Edit outline with the stock chosen before it.
  const [stock, setStock] = useState(outline?.stock || DEFAULT_STOCK);
  const [thickness, setThickness] = useState(outline?.thickness ?? 1.5);
  const [quantity, setQuantity] = useState(outline?.quantity ?? 1);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const params = useParams(model);
  const chosenSketch = source === 'sketch' ? model.sketches.find((s) => s.id === outline.sketchId) || null : null;
  const chosenBlank = source === 'drawing' ? outline.blank : null;
  const editProblem = useMemo(() => (chosenSketch ? sketchEditProblem(chosenSketch) : ''), [chosenSketch]);
  const width = size?.width,
    height = size?.height;
  const profile = useMemo(
    () =>
      source === 'rectangle'
        ? { type: 'rectangle', width, height, origin: [0, 0] }
        : source === 'sketch'
          ? isClosedProfile(chosenSketch)
            ? chosenSketch.profile
            : null
          : chosenBlank?.profile || null,
    [source, width, height, chosenSketch, chosenBlank],
  );
  const outlineName =
    source === 'rectangle'
      ? `Rectangle ${fmt(width)} × ${fmt(height)} mm`
      : source === 'sketch'
        ? chosenSketch?.name || 'The sketch is gone'
        : `${chosenBlank?.name || 'Profile'} · from the 2D drawing`;
  const preview = useMemo(() => {
    if (!profile) return { problem: 'Choose a closed outline for the blank.' };
    try {
      const fold = foldSheet({ thickness, stock, bends: [] }, profile, params);
      return { flat: fold.flat };
    } catch (e) {
      return { problem: e.message };
    }
  }, [profile, thickness, stock, params]);
  const create = () => {
    setError('');
    try {
      if (preview.problem) throw new Error(preview.problem);
      const reuse = source === 'sketch' && reusesSketch(chosenSketch);
      const sketch = reuse
        ? null
        : blankSketch({
            name:
              source === 'drawing'
                ? `${chosenBlank.name} blank`
                : source === 'sketch'
                  ? `${chosenSketch.name} blank`
                  : 'Sheet blank',
            profile,
            sourceIds: source === 'drawing' ? chosenBlank.sourceIds : null,
          });
      const part = sheetMetalPart({ sketchId: reuse ? chosenSketch.id : sketch.id, stock, thickness });
      const bounds = preview.flat.bounds;
      onCreate({ sketch, part, centre: centreOf(bounds), bounds, quantity });
      setNotice(
        `Cut ${quantity > 1 ? `${quantity} × ` : ''}${blankLine(preview.flat).slice(6)} from ${thickness} mm ${stockOf(stock).name}`,
      );
    } catch (e) {
      setError(e.message || String(e));
    }
  };
  return (
    <StationShell
      station="cut"
      region="Cut from sheet"
      shell={shell}
      primary={
        <PrimaryButton disabled={Boolean(preview.problem)} onClick={create}>
          Cut on the laser
        </PrimaryButton>
      }
    >
      <p className="cad-shop-lead">Choose the sheet stock, then cut the blank on the laser.</p>
      <div className="cad-cut-outline" aria-label="Outline">
        <OutlineThumb profile={profile} params={params} size={48} />
        <span>
          <span className="cad-cut-outline-name">
            <strong>{outlineName}</strong>
            {/* docs/sketch-studio-outline-edit-sheet-nest.md §3.6: back into the sketcher, then back here. */}
            {chosenSketch && onEditOutline && (
              <button
                type="button"
                className="cad-cut-outline-edit"
                disabled={Boolean(editProblem)}
                title={editProblem || `Open ${chosenSketch.name} in the sketcher`}
                onClick={() => onEditOutline({ stock, thickness })}
              >
                Edit outline
              </button>
            )}
          </span>
          <small>The flat blank is the part: bends fold it, and its size decides the flange lengths.</small>
        </span>
      </div>
      {editNotice && (
        <p className="cad-help cad-shop-notice" role="status">
          {editNotice}
        </p>
      )}
      <StockFields stock={stock} thickness={thickness} onStock={setStock} onThickness={setThickness} />
      {/* SN-1 §4.3: Cut on the laser makes this many instances, and the laser cuts them all. */}
      <QuantityField value={quantity} onChange={setQuantity} />
      {preview.flat ? (
        <p className="cad-part-size cad-shop-figure" aria-label="Blank size">
          {blankLine(preview.flat)}
        </p>
      ) : (
        <ProblemCard label="Blank size" message={preview.problem} />
      )}
      {notice && (
        <p className="cad-help" role="status">
          {notice}
        </p>
      )}
      {error && <ProblemCard message={error} />}
    </StationShell>
  );
}

/**
 * Cut from sheet on a batch (docs/sketch-studio-outline-edit-sheet-nest.md
 * §4.8): every outline Draw handed over, each with its own Quantity and Leave
 * out, cut from one stock and thickness (one sheet). A row whose outline does
 * not make a blank says why and keeps Cut on the laser off until it is left
 * out. Cut on the laser calls `onCreate({ items })`: per outline still in,
 * its blank sketch (an XY sketch at the origin is the blank itself), its part
 * — named after the outline, so the job board and This cut tell them apart —
 * the blank's centre and bounds and its quantity. No Edit outline here: Draw
 * has it on every row.
 */
function BatchCutPanel({ model, outline, shell = null, onCreate }) {
  const [stock, setStock] = useState(outline.stock || DEFAULT_STOCK);
  const [thickness, setThickness] = useState(outline.thickness ?? 1.5);
  // Panel state only: Back to Draw and Cut all again brings every outline back.
  const [left, setLeft] = useState(() => new Set());
  const [quantities, setQuantities] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const params = useParams(model);
  const rows = useMemo(
    () =>
      outline.items.map((item, index) => {
        const sketch = item.kind === 'sketch' ? model.sketches.find((s) => s.id === item.sketchId) || null : null;
        const blank = item.kind === 'drawing' ? item.blank : null;
        const name = sketch?.name || blank?.name || 'The sketch is gone';
        const profile = sketch ? (isClosedProfile(sketch) ? sketch.profile : null) : blank?.profile || null;
        let flat = null,
          problem = '';
        if (!profile) problem = sketch || blank ? 'Not closed: connect the ends so the outline is one loop.' : name;
        else
          try {
            flat = foldSheet({ thickness, stock, bends: [] }, profile, params).flat;
          } catch (e) {
            problem = e.message || String(e);
          }
        return { index, item, sketch, blank, name, profile, flat, problem };
      }),
    [outline.items, model.sketches, thickness, stock, params],
  );
  const shown = rows.filter((r) => !left.has(r.index));
  const quantityOf = (r) => quantities[r.index] ?? 1;
  const blanks = shown.reduce((sum, r) => sum + quantityOf(r), 0);
  const blocked = !shown.length || shown.some((r) => r.problem);
  const create = () => {
    setError('');
    try {
      const problem = shown.find((r) => r.problem);
      if (problem) throw new Error(`${problem.name}: ${problem.problem}`);
      const items = shown.map((r) => {
        const reuse = r.sketch && reusesSketch(r.sketch);
        const sketch = reuse
          ? null
          : blankSketch({ name: `${r.name} blank`, profile: r.profile, sourceIds: r.blank?.sourceIds || null });
        const part = sheetMetalPart({ sketchId: reuse ? r.sketch.id : sketch.id, stock, thickness, name: r.name });
        return { sketch, part, centre: centreOf(r.flat.bounds), bounds: r.flat.bounds, quantity: quantityOf(r) };
      });
      onCreate({ items });
      setNotice(`Cut ${plural(blanks, 'blank')} from ${thickness} mm ${stockOf(stock).name}`);
    } catch (e) {
      setError(e.message || String(e));
    }
  };
  return (
    <StationShell
      station="cut"
      region="Cut from sheet"
      shell={shell}
      primary={
        <PrimaryButton disabled={blocked} onClick={create}>
          Cut on the laser
        </PrimaryButton>
      }
    >
      <p className="cad-shop-lead">Choose the sheet stock, then cut these blanks on the laser.</p>
      <ul className="cad-draw-outlines cad-batch-outlines" aria-label="Outlines to cut">
        {shown.map((r) => (
          <li key={r.index}>
            <OutlineThumb profile={r.profile} params={params} />
            <span>
              <strong>{r.name}</strong>
              {r.flat ? (
                <small>
                  {fmt(r.flat.width)} × {fmt(r.flat.height)} mm
                </small>
              ) : (
                <small role="note">{r.problem}</small>
              )}
            </span>
            <span className="cad-draw-outline-actions">
              <QuantityField
                label={`Quantity of ${r.name}`}
                value={quantityOf(r)}
                onChange={(n) => setQuantities((old) => ({ ...old, [r.index]: n }))}
              />
              <button
                type="button"
                aria-label={`Leave out ${r.name}`}
                disabled={shown.length < 2}
                onClick={() => setLeft((old) => new Set([...old, r.index]))}
              >
                Leave out
              </button>
            </span>
          </li>
        ))}
      </ul>
      <StockFields stock={stock} thickness={thickness} onStock={setStock} onThickness={setThickness} />
      <p className="cad-help">
        One sheet is one stock and thickness: every outline here is cut from it. Cut an outline of another thickness on
        its own (Cut this in Draw).
      </p>
      <p className="cad-part-size cad-shop-figure" aria-label="Batch">
        {plural(blanks, 'blank')} from {plural(shown.length, 'outline')}
      </p>
      {notice && (
        <p className="cad-help" role="status">
          {notice}
        </p>
      )}
      {error && <ProblemCard message={error} />}
    </StationShell>
  );
}

/**
 * Cut's picker (docs/sketch-studio-cut-pick.md §4.2): every outline ready to
 * cut, in model order, ticked to cut — here, or by a click on it in the view
 * (the workspace toggles `outline.selected`) — then one stock and thickness
 * and Cut on the laser, which calls `onCreate({ items })` as the batch does,
 * one record per ticked outline. Controlled: `outline` is `{ kind: 'pick',
 * selected, quantities, stock, thickness }` and every change goes to
 * `onOutline(next)`, so Edit (`onEditOutline(sketchId)`: the sketcher, then
 * back here) and the view see the same selection. A row that makes no blank
 * at this stock says why and cannot be ticked; a quantity stays while its
 * row is unticked. Already cut: the sheet-metal parts (`cutParts`), each
 * with Open on the laser (`onOpenPart(instanceId)`).
 */
function PickCutPanel({
  model,
  outline,
  shell = null,
  onCreate,
  onOutline,
  onEditOutline = null,
  onOpenPart = null,
  editNotice = '',
}) {
  const stock = outline.stock || DEFAULT_STOCK;
  const thickness = outline.thickness ?? 1.5;
  const quantities = outline.quantities || {};
  const selected = useMemo(() => new Set(outline.selected || []), [outline.selected]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const params = useParams(model);
  const change = (patch) => onOutline({ ...outline, ...patch });
  const ready = useMemo(() => readyOutlines(model, params), [model, params]);
  const rows = useMemo(
    () =>
      ready.map((o) => {
        const sketch = model.sketches.find((s) => s.id === o.id);
        let flat = null,
          problem = '';
        try {
          flat = foldSheet({ thickness, stock, bends: [] }, sketch.profile, params).flat;
        } catch (e) {
          problem = e.message || String(e);
        }
        return { ...o, sketch, flat, problem, editProblem: sketchEditProblem(sketch) };
      }),
    [ready, model.sketches, thickness, stock, params],
  );
  const cut = useMemo(() => cutParts(model, params), [model, params]);
  // A ticked row that makes no blank at this stock is not cut (its tick comes back with a stock that takes it).
  const picked = rows.filter((r) => selected.has(r.id) && !r.problem);
  const quantityOf = (r) => quantities[r.id] ?? 1;
  const blanks = picked.reduce((sum, r) => sum + quantityOf(r), 0);
  const toggle = (id) =>
    change({
      selected: selected.has(id) ? [...selected].filter((s) => s !== id) : [...selected, id],
    });
  const create = () => {
    setError('');
    try {
      if (!picked.length) throw new Error('Choose an outline to cut.');
      const items = picked.map((r) => {
        const reuse = reusesSketch(r.sketch);
        const sketch = reuse ? null : blankSketch({ name: `${r.name} blank`, profile: r.sketch.profile });
        const part = sheetMetalPart({ sketchId: reuse ? r.sketch.id : sketch.id, stock, thickness, name: r.name });
        return { sketch, part, centre: centreOf(r.flat.bounds), bounds: r.flat.bounds, quantity: quantityOf(r) };
      });
      onCreate({ items });
      setNotice(`Cut ${plural(blanks, 'blank')} from ${thickness} mm ${stockOf(stock).name}`);
    } catch (e) {
      setError(e.message || String(e));
    }
  };
  return (
    <StationShell
      station="cut"
      region="Cut from sheet"
      shell={shell}
      className="cad-cut-pick"
      primary={
        <PrimaryButton disabled={!picked.length} onClick={create}>
          Cut on the laser
        </PrimaryButton>
      }
    >
      <p className="cad-shop-lead">Choose the outlines to cut, then the sheet stock.</p>
      <div className="cad-cut-pick-bar">
        <button
          type="button"
          disabled={rows.every((r) => r.problem || selected.has(r.id))}
          onClick={() =>
            change({
              selected: [...selected, ...rows.filter((r) => !r.problem && !selected.has(r.id)).map((r) => r.id)],
            })
          }
        >
          Select all
        </button>
        <button type="button" disabled={!selected.size} onClick={() => change({ selected: [] })}>
          Select none
        </button>
        <span className="cad-cut-pick-count" role="status" aria-label="Selected outlines">
          {picked.length} of {rows.length} selected
        </span>
      </div>
      <p className="cad-help">Or click a drawing in the view to select it; click it again to leave it out.</p>
      {editNotice && (
        <p className="cad-help cad-shop-notice" role="status">
          {editNotice}
        </p>
      )}
      <ul className="cad-draw-outlines cad-batch-outlines cad-pick-outlines" aria-label="Outlines to cut">
        {rows.map((r) => {
          const on = selected.has(r.id) && !r.problem;
          return (
            <li key={r.id} className={on ? 'is-picked' : r.problem ? 'is-problem' : ''}>
              <label className="cad-pick-check">
                <input
                  type="checkbox"
                  aria-label={`Select ${r.name}`}
                  checked={on}
                  disabled={Boolean(r.problem)}
                  onChange={() => toggle(r.id)}
                />
                <OutlineThumb profile={r.sketch.profile} params={params} />
              </label>
              <span>
                <strong>{r.name}</strong>
                {r.problem ? (
                  <small role="note">{r.problem}</small>
                ) : (
                  <small>
                    {fmt(r.width)} × {fmt(r.height)} mm
                  </small>
                )}
              </span>
              <span className="cad-draw-outline-actions">
                {on && (
                  <QuantityField
                    label={`Quantity of ${r.name}`}
                    value={quantityOf(r)}
                    onChange={(n) => change({ quantities: { ...quantities, [r.id]: n } })}
                  />
                )}
                <button
                  type="button"
                  aria-label={`Edit ${r.name}`}
                  disabled={Boolean(r.editProblem) || !onEditOutline}
                  title={r.editProblem || `Open ${r.name} in the sketcher`}
                  onClick={() => onEditOutline(r.id)}
                >
                  Edit
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <StockFields
        stock={stock}
        thickness={thickness}
        onStock={(key) => change({ stock: key })}
        onThickness={(t) => change({ thickness: t })}
      />
      <p className="cad-help">One sheet is one stock and thickness: every outline selected is cut from it.</p>
      <p className="cad-part-size cad-shop-figure" aria-label="Batch">
        {plural(blanks, 'blank')} from {plural(picked.length, 'outline')}
      </p>
      {notice && (
        <p className="cad-help" role="status">
          {notice}
        </p>
      )}
      {error && <ProblemCard message={error} />}
      {cut.length > 0 && (
        <>
          <h4>Already cut</h4>
          <ul className="cad-draw-outlines cad-pick-cut" aria-label="Already cut">
            {cut.map((row) => (
              <li key={row.partId}>
                <OutlineThumb profile={row.profile} params={params} />
                <span>
                  <strong>
                    {row.name}
                    {row.copies > 1 && <span className="cad-laser-copies"> × {row.copies}</span>}
                  </strong>
                  <small>{row.sheet}</small>
                </span>
                <span className="cad-draw-outline-actions">
                  <button
                    type="button"
                    aria-label={`Open ${row.name} on the laser`}
                    disabled={!onOpenPart || shell?.disabled}
                    onClick={() => onOpenPart(row.instanceId)}
                  >
                    Open on the laser
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </StationShell>
  );
}

// ------------------------------------------------------------ the feature form

function BendRow({ bend, numbers, index, count, onChange, onMove, onRemove, notes }) {
  const radiusAuto = bend.radius == null || bend.radius === '';
  const round = !(bend.steps == null || bend.steps === '');
  return (
    <article className="cad-bend-row" aria-label={`Bend ${index + 1}`}>
      <strong>
        Bend {index + 1}
        {numbers ? ` · ${numbers.label}` : ''}
      </strong>
      <div className="cad-bend-fields">
        <ValueField
          label="Angle (°)"
          value={bend.angle}
          onChange={(angle, meta) => onChange({ ...bend, angle }, meta)}
        />
        <Segmented
          label={`Bend ${index + 1} direction`}
          options={[
            ['up', 'Up'],
            ['down', 'Down'],
          ]}
          value={bend.direction}
          onChange={(direction) => onChange({ ...bend, direction })}
        />
      </div>
      {round ? (
        // A round bend (docs/sketch-studio-round-bend.md §4): its radius is required, made in `steps` hits.
        <div className="cad-inline">
          <ValueField
            label="Inside radius (mm)"
            value={bend.radius}
            onChange={(radius, meta) => onChange({ ...bend, radius }, meta)}
          />
          <ValueField label="Hits" value={bend.steps} onChange={(steps, meta) => onChange({ ...bend, steps }, meta)} />
        </div>
      ) : (
        <>
          <label className="cad-check">
            <input
              type="checkbox"
              aria-label={`Bend ${index + 1} automatic radius`}
              checked={radiusAuto}
              onChange={(e) =>
                onChange({ ...bend, radius: e.target.checked ? null : Number((numbers?.radius ?? 1).toFixed(2)) })
              }
            />
            Radius from the tooling
            {radiusAuto && numbers ? ` (R${fmt(numbers.radius)}, ${dieOf(numbers.die).name} die)` : ''}
          </label>
          {!radiusAuto && (
            <ValueField
              label="Inside radius (mm)"
              value={bend.radius}
              onChange={(radius, meta) => onChange({ ...bend, radius }, meta)}
            />
          )}
        </>
      )}
      {numbers && (
        <p className="cad-bend-readout" aria-label={`Bend ${index + 1} numbers`}>
          <span>Allowance {fmt(numbers.allowance)}</span>
          <span>Deduction {fmt(numbers.deduction)}</span>
          <span>
            Legs {fmt(numbers.legs.fixed)} / {fmt(numbers.legs.moving)} mm
          </span>
        </p>
      )}
      {notes}
      <div className="cad-inline">
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)}>
          Move up
        </button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(1)}>
          Move down
        </button>
        <button type="button" className="cad-danger-inline" onClick={onRemove}>
          Remove
        </button>
      </div>
    </article>
  );
}

// A bend-on entry (docs/sketch-studio-tight-bends.md §4.4): "Bend {n} on to", its angle (the bend's
// after this hit) and Remove. Its line, side and shape are the bend's own row's.
function BendOnRow({ record, number, onChange, onRemove, notes }) {
  return (
    <article className="cad-bend-row is-bend-on" aria-label={`Bend ${number} on to`}>
      <strong>Bend {number} on to</strong>
      <div className="cad-bend-fields">
        <ValueField
          label={`Bend ${number} on to (°)`}
          value={record.angle}
          onChange={(angle, meta) => onChange({ ...record, angle }, meta)}
        />
      </div>
      {notes}
      <div className="cad-inline">
        <button type="button" className="cad-danger-inline" onClick={onRemove}>
          Remove
        </button>
      </div>
    </article>
  );
}

function AddBendForm({ feature, profile, params, fold, onAdd, focusKey }) {
  const [mode, setMode] = useState('edge');
  const [edge, setEdge] = useState('left');
  const [distance, setDistance] = useState(20);
  const [points, setPoints] = useState({ a: [0, 0], b: [0, 0] });
  const [angle, setAngle] = useState(90);
  const [direction, setDirection] = useState('up');
  // A round bend (docs/sketch-studio-round-bend.md §6): its inside radius and hits (null: automatic).
  const [shape, setShape] = useState('sharp');
  const [radius, setRadius] = useState(20);
  const [steps, setSteps] = useState(null);
  // Made by (round-bend spec §12.6): bump hits, or one hit of a radius punch (its key; null: the nearest to the radius).
  const [madeBy, setMadeBy] = useState('bump');
  const [radiusPunchKey, setRadiusPunchKey] = useState(null);
  const round = shape === 'round';
  const radiusPunch = round && madeBy === 'punch' ? PUNCHES[radiusPunchKey] || nearestRadiusPunch(radius) : null;
  const bumped = round && !radiusPunch;
  // Just added: the same inputs now describe the bend that exists, so the
  // form waits for the next one instead of crying "crosses".
  // (Kept as the bend count it produced, so a bend removed or added elsewhere ends it.)
  const [addedAt, setAddedAt] = useState(null);
  const added = addedAt === (feature.bends || []).length;
  const change = (set) => (value) => {
    setAddedAt(null);
    set(value);
  };
  const heading = useRef(null);
  useEffect(() => {
    if (focusKey) heading.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusKey]);
  // The new bend's numbers (tooling radius, K, allowance, setback) drive the
  // flange ↔ distance fields before there is a line (§5.2).
  const numbers = useMemo(() => {
    try {
      return bendNumbers({
        thickness: fold?.thickness ?? Number(feature.thickness),
        stock: feature.stock || DEFAULT_STOCK,
        angle,
        radius: bumped ? radius : null,
        kFactor: feature.kFactor == null || feature.kFactor === '' ? null : Number(feature.kFactor),
        punch: radiusPunch?.key ?? null,
      });
    } catch {
      return null;
    }
  }, [fold, feature.thickness, feature.stock, feature.kFactor, angle, bumped, radius, radiusPunch]);
  const thickness = fold?.thickness ?? Number(feature.thickness);
  const autoSteps = bumped && numbers ? autoHits({ allowance: numbers.allowance, die: numbers.die, thickness }) : null;
  const hits = bumped ? (steps ?? autoSteps ?? 2) : null;
  const outer = useMemo(() => {
    try {
      return profilePolygon(profile, params).outer;
    } catch {
      return null;
    }
  }, [profile, params]);
  // The bend as it would be added, folded with the others before it is offered.
  const trial = useMemo(() => {
    const line = mode === 'edge' ? (outer ? bendLineFromEdge(outer, edge, distance) : null) : points;
    if (!line) return { error: 'The blank has no outline.' };
    const bend = {
      id: 'pending',
      a: line.a,
      b: line.b,
      angle,
      direction,
      radius: bumped ? radius : null,
      ...(bumped ? { steps: hits } : {}),
      // A radius punch: an ordinary one-hit bend with that punch (§12.2).
      ...(radiusPunch ? { punch: radiusPunch.key } : {}),
    };
    // One line across several separate tabs is one stroke of several bends (shop floor §6.1).
    const named = (e) =>
      // The fold numbers bends among the bends (a bend-on entry is none, tight bends §4.1).
      e.message.replace(/Bend \d+/, (m) =>
        Number(m.slice(5)) > madeBends(feature.bends || []).length ? 'The new bend' : m,
      );
    try {
      const lines = strokeBends(feature, profile, params, bend).map((l, i) => ({ ...bend, ...l, id: `pending-${i}` }));
      const folded = foldSheet({ ...feature, bends: [...(feature.bends || []), ...lines] }, profile, params);
      const ids = lines.map((l) => l.id);
      return {
        line: bend,
        lines,
        bend: folded.bends.find((b) => b.id === ids[0]),
        tabs: lines.length,
        warnings: folded.warnings.filter((w) => ids.includes(w.bendId)),
      };
    } catch (e) {
      return { line: bend, error: named(e) };
    }
  }, [
    feature,
    profile,
    params,
    outer,
    mode,
    edge,
    distance,
    points,
    angle,
    direction,
    bumped,
    radius,
    hits,
    radiusPunch,
  ]);
  const flange = numbers ? legFromDistance(distance, numbers) : null;
  return (
    <details className="cad-add-bend" open>
      <summary ref={heading}>Add bend</summary>
      <Segmented
        label="Bend line"
        options={[
          ['edge', 'Parallel to an edge'],
          ['points', 'Two points'],
        ]}
        value={mode}
        onChange={change(setMode)}
      />
      {mode === 'edge' ? (
        <>
          <label className="cad-field">
            Blank edge
            <select aria-label="Blank edge" value={edge} onChange={(e) => change(setEdge)(e.target.value)}>
              {BLANK_EDGES.map((key) => (
                <option key={key} value={key}>
                  {EDGE_NAMES[key]}
                </option>
              ))}
            </select>
          </label>
          <div className="cad-inline">
            <label className="cad-field">
              Distance D (mm)
              <NumericInput
                aria-label="Distance D (mm)"
                step="0.5"
                value={+distance.toFixed(4)}
                onCommit={change(setDistance)}
              />
            </label>
            <label className="cad-field">
              Flange, outside (mm)
              <NumericInput
                aria-label="Flange, outside (mm)"
                step="0.5"
                value={flange == null ? '' : +flange.toFixed(4)}
                onCommit={(v) => numbers && change(setDistance)(distanceFromLeg(v, numbers))}
              />
            </label>
          </div>
        </>
      ) : (
        ['a', 'b'].map((key) => (
          <div className="cad-inline" key={key} role="group" aria-label={`Point ${key.toUpperCase()}`}>
            {[0, 1].map((axis) => (
              <label className="cad-field" key={axis}>
                {`${key.toUpperCase()} ${axis ? 'Y' : 'X'} (mm)`}
                <NumericInput
                  aria-label={`${key.toUpperCase()} ${axis ? 'Y' : 'X'} (mm)`}
                  step="1"
                  value={points[key][axis]}
                  onCommit={(v) =>
                    change(setPoints)((old) => ({ ...old, [key]: old[key].map((c, i) => (i === axis ? v : c)) }))
                  }
                />
              </label>
            ))}
          </div>
        ))
      )}
      <div className="cad-inline">
        <label className="cad-field">
          Angle (°)
          <NumericInput aria-label="New bend angle (°)" step="1" value={angle} onCommit={change(setAngle)} />
        </label>
        <Segmented
          label="New bend direction"
          options={[
            ['up', 'Up'],
            ['down', 'Down'],
          ]}
          value={direction}
          onChange={change(setDirection)}
        />
      </div>
      <Segmented
        label="New bend shape"
        options={[
          ['sharp', 'Sharp'],
          ['round', 'Round'],
        ]}
        value={shape}
        onChange={change(setShape)}
      />
      {round && (
        <Segmented
          label="New bend made by"
          options={[
            ['bump', 'Bump hits'],
            ['punch', 'Radius punch'],
          ]}
          value={madeBy}
          onChange={change(setMadeBy)}
        />
      )}
      {radiusPunch && (
        <label className="cad-field">
          Radius punch
          <select
            aria-label="New bend radius punch"
            value={radiusPunch.key}
            onChange={(e) => change(setRadiusPunchKey)(e.target.value)}
          >
            {RADIUS_PUNCHES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {bumped && (
        <div className="cad-inline">
          <label className="cad-field">
            Inside radius (mm)
            <NumericInput
              aria-label="New bend inside radius (mm)"
              step="1"
              value={radius}
              onCommit={change(setRadius)}
            />
          </label>
          <label className="cad-field">
            Hits
            <NumericInput
              aria-label="New bend hits"
              step="1"
              min="2"
              allowEmpty
              placeholder={autoSteps != null ? String(autoSteps) : 'automatic'}
              title="Empty: automatic (the pitch half the die opening)"
              value={steps ?? ''}
              onCommit={change(setSteps)}
            />
          </label>
        </div>
      )}
      {trial.bend && (
        <p className="cad-bend-readout" aria-label="New bend numbers">
          <span>
            {trial.bend.label}
            {trial.tabs > 1 ? ` · ${trial.tabs} tabs in one stroke` : ''}
          </span>
          <span>Allowance {fmt(trial.bend.allowance)}</span>
          <span>Deduction {fmt(trial.bend.deduction)}</span>
          <span>
            Legs {fmt(trial.bend.legs.fixed)} / {fmt(trial.bend.legs.moving)} mm
          </span>
        </p>
      )}
      {trial.warnings?.map((w) => (
        <p className="cad-help" role="note" key={w.code}>
          {w.message.replace(/^Bend \d+/, 'The new bend')}
        </p>
      ))}
      {trial.error &&
        (added ? (
          <p className="cad-help" role="status">
            Bend added. Choose the edge, distance or flange of the next one.
          </p>
        ) : (
          <p className="cad-shop-error" role="alert">
            {trial.error}
          </p>
        ))}
      <button
        type="button"
        className="cad-primary cad-wide"
        disabled={Boolean(trial.error)}
        onClick={() => {
          const stroke = trial.lines.length > 1 ? uid('stroke') : null;
          const made = trial.lines.map((l) => ({ ...l, id: uid('bend'), ...(stroke ? { stroke } : {}) }));
          onAdd(made);
          setAddedAt((feature.bends || []).length + made.length);
        }}
      >
        Add bend
      </button>
    </details>
  );
}

// A flange in an edge-to-edge row's way: its bend path ('base': the base), steady when the row's a / b swap.
const sideOf = (path) => (path.length ? path.join('/') : 'base');
const edgeName = (bend) => (bend == null ? "The base's edge" : `Bend ${bend + 1}'s edge`);
const DEFAULT_GAP = 0.2; // the panel maker's fit-up gap (PANEL_DEFAULTS.gap)

// What the shop holds (corner gaps §6.1): the three fields, their words and units.
const TOLERANCE_FIELDS = [
  ['flange', 'Flange ± (mm)', '0.05'],
  ['cut', 'Cut ± (mm)', '0.05'],
  ['angle', 'Angle ± (°)', '0.25'],
];
/**
 * "What the shop holds" (docs/sketch-studio-corner-gaps.md §6.1): the flange,
 * cut and angle tolerances the gaps' band is worked out from. `tolerance`: in
 * force (the model's own over the catalogue's); `own`: the model's
 * `fabrication.shop.tolerance` (or null); `onTolerance(key, value)` commits
 * one settled field (null: back to the catalogue's value, the field emptied).
 */
function ShopTolerance({ tolerance, own, onTolerance }) {
  return (
    <details className="cad-shop-numbers cad-gaps-tolerance">
      <summary>What the shop holds</summary>
      <div className="cad-gaps-controls">
        {TOLERANCE_FIELDS.map(([key, label, step]) => (
          <label className="cad-field" key={key}>
            {label}
            <NumericInput
              aria-label={label}
              min="0"
              step={step}
              value={tolerance[key]}
              allowEmpty
              title={
                own && key in own
                  ? `This model's own; empty the field for the usual ${SHOP_TOLERANCE[key]}`
                  : 'The usual figure: put in what your brake gives you'
              }
              onCommit={(v) => onTolerance(key, v == null ? null : Math.max(0, v))}
            />
          </label>
        ))}
      </div>
      <p className="cad-help">
        Typical figures: a good CNC brake holds a flange to ± 0.1 mm, an ordinary shop ± 0.2 – 0.5 mm; ± 1° on the
        angle. Put in what your own brake gives you once you have measured a few parts.
      </p>
    </details>
  );
}

/**
 * The flange gaps with their Set controls (docs/sketch-studio-corner-gaps.md
 * §4.3): the "Gap (mm)" field and "Set all" (the corner rows, each its way as
 * its select shows), each row's way and its Set. The ways chosen live here by
 * row key until the part is left. `onSetGaps({ target, keys, styles })` sets
 * and commits (the workspace) and gives back setGaps' result, or throws the
 * refusal, shown here: nothing is committed then. `editProblem`: why the
 * outline cannot be edited ('' when it can): every control is disabled with
 * it as its title, as Edit outline is. After a set that moved something, the
 * brake's sequence is checked on the part as committed (§4.5, after the first
 * audit: deferred, off the click) and a step that no longer goes is added to
 * the note; nothing is refused for it. `feature`, `machine` (the shop's brake
 * key): what that check reads.
 */
function FlangeGapsSet({
  fold,
  feature,
  profile,
  params,
  editProblem,
  machine,
  onSetGaps,
  tolerance = null,
  ownTolerance = null,
  onTolerance = null,
}) {
  const [target, setTarget] = useState(DEFAULT_GAP);
  const [ways, setWays] = useState(() => new Map());
  const [outcome, setOutcome] = useState(null);
  const [refusal, setRefusal] = useState('');
  const disabled = Boolean(editProblem);
  const profileText = useMemo(() => JSON.stringify(profile), [profile]);
  // The status line says what the last set did while the outline is the one it made (Undo takes it away).
  const said = outcome && outcome.profile === profileText ? outcome : null;
  const t = fold.thickness;
  // The brake's steps on the part as committed, against the part before the set: off the click.
  const pending = said && said.brake == null ? said : null;
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(() => {
      let brake = '';
      try {
        const press = machineOf(MACHINES[machine] ? machine : DEFAULT_MACHINE);
        // Each step's end at the sheet's true thickness too (corner gaps §5).
        const after = sequenceChecks({ fold, machine: press, profile, params });
        const fails = (check) => Boolean(check && (check.refusals.length || check.collision));
        const why = (check) => (check.collision ? check.collision.message : check.refusals[0].message);
        // The part before the set is only read when a step fails now (each reading costs as much as the set's whole click).
        const before = after.some(fails)
          ? sequenceChecks({
              fold: foldSheet(pending.before.feature, pending.before.profile, params),
              machine: press,
              profile: pending.before.profile,
              params,
            })
          : [];
        brake = after
          .map((check, i) =>
            !fails(check)
              ? ''
              : fails(before[i])
                ? `Step ${i + 1} does not go at the brake (nor did it before the set): ${why(check)}`
                : `Step ${i + 1} no longer goes at the brake: ${why(check)}`,
          )
          .filter(Boolean)
          .join(' ');
      } catch {
        // The part's own fold error shows on the panel; nothing to add here.
      }
      setOutcome((o) => (o === pending ? { ...o, brake } : o));
    }, 0);
    return () => clearTimeout(timer);
  }, [pending, fold, machine, params, profile]);
  const wayOf = (row) => {
    const chosen = ways.get(row.key);
    if (row.b.kind === 'edge') return chosen ?? 'both';
    return chosen ?? (row.cover ? 'cover' : 'short');
  };
  const changed = (row) => {
    const chosen = ways.get(row.key);
    return chosen != null && chosen !== (row.b.kind === 'edge' ? 'both' : row.cover ? 'cover' : 'short');
  };
  // What setGaps takes for the row's way: an edge row's choice is the flange's bend path, 'a' / 'b' as the row reads.
  const styleOf = (row) => {
    const way = wayOf(row);
    if (row.b.kind !== 'edge') return way;
    return way === 'both' ? 'both' : way === sideOf(row.a.path) ? 'a' : 'b';
  };
  const offTarget = (row) => (wayOf(row) === 'cover' ? Math.abs(row.gap + t / row.k) : Math.abs(row.gap - target));
  const run = (request) => {
    try {
      const result = onSetGaps({ target, ...request });
      setOutcome({
        ...setGapsText(result, target),
        profile: JSON.stringify(result.committed ?? result.profile),
        before: { feature, profile },
        // Nothing moved: nothing to check at the brake.
        brake: result.moved.length ? null : '',
      });
      setRefusal('');
      // A row set reads its way now; the next Set starts from what it reads.
      setWays((old) => {
        const next = new Map(old);
        for (const key of result.asked) next.delete(key);
        return next;
      });
    } catch (e) {
      setRefusal(e.message || String(e));
      setOutcome(null);
    }
  };
  const rowControls = (row) => {
    const way = wayOf(row);
    const edge = row.b.kind === 'edge';
    return (
      <div className="cad-gaps-set">
        <select
          aria-label={`Way for ${gapLabel(row)}`}
          value={way}
          disabled={disabled}
          title={editProblem || undefined}
          onChange={(e) => {
            const chosen = e.target.value;
            setWays((old) => new Map(old).set(row.key, chosen));
          }}
        >
          {edge ? (
            <>
              <option value="both">Both edges</option>
              <option value={sideOf(row.a.path)}>{edgeName(row.a.bend)}</option>
              <option value={sideOf(row.b.path)}>{edgeName(row.b.bend)}</option>
            </>
          ) : (
            <>
              <option value="short">Stops short</option>
              <option value="cover">Runs past (covers)</option>
            </>
          )}
        </select>
        {(offTarget(row) > 0.001 || changed(row)) && (
          <button
            type="button"
            disabled={disabled}
            title={editProblem || `Move this edge so the gap reads ${fmt(target)} mm`}
            aria-label={`Set ${gapLabel(row)}`}
            onClick={() => run({ keys: [row.key], styles: { [row.key]: styleOf(row) } })}
          >
            Set
          </button>
        )}
      </div>
    );
  };
  const notes = [said?.warnings, said?.brake].filter(Boolean).join(' ');
  return (
    <FlangeGaps fold={fold} profile={profile} params={params} rowExtra={rowControls} tolerance={tolerance}>
      {({ rows }) => (
        <>
          <div className="cad-gaps-controls">
            <label className="cad-field">
              Gap (mm)
              <NumericInput
                aria-label="Gap (mm)"
                min="0"
                max="3"
                step="0.05"
                value={target}
                disabled={disabled}
                title={editProblem || undefined}
                onCommit={(v) => setTarget(v)}
              />
            </label>
            <button
              type="button"
              disabled={disabled || !cornerRows(rows).length}
              title={editProblem || 'Set every corner gap to this gap, each its way as shown'}
              // Every corner row its way as its select shows: the ones changed go with it.
              onClick={() =>
                run({
                  keys: null,
                  styles: Object.fromEntries(
                    cornerRows(rows)
                      .filter(changed)
                      .map((row) => [row.key, styleOf(row)]),
                  ),
                })
              }
            >
              Set all
            </button>
          </div>
          {refusal && (
            <p className="cad-shop-error" role="alert">
              {refusal}
            </p>
          )}
          {said && (
            <p
              className="cad-help cad-shop-notice"
              role="status"
              data-brake={said.brake == null ? 'checking' : 'checked'}
            >
              {said.text}
            </p>
          )}
          {notes && (
            <p className="cad-help" role="note">
              {notes}
            </p>
          )}
          {tolerance && onTolerance && (
            <ShopTolerance tolerance={tolerance} own={ownTolerance} onTolerance={onTolerance} />
          )}
        </>
      )}
    </FlangeGaps>
  );
}

/**
 * The `sheetmetal` feature (Properties → feature 1): stock, thickness, K and
 * the bend table, plus Add bend. A change the fold refuses is never committed:
 * a live value waits, Enter / blur shows the reason here. `onEditOutline()`
 * reopens the blank's outline in the sketcher (docs/sketch-studio-outline-
 * edit-sheet-nest.md §3.6); `editNotice` says what the last such finish did.
 * `onSetGaps(request)`: the flange gaps' Set controls (corner gaps §4.3;
 * none without it). The gaps' band on the bench is the model's shop
 * tolerances (§6.1); `onShopTolerance(key, value)` commits one of them from
 * the card's "What the shop holds" (none without it).
 */
export function SheetMetalForm({
  feature,
  model,
  onChange,
  addBendFocus = 0,
  onEditOutline = null,
  editNotice = '',
  onSetGaps = null,
  onShopTolerance = null,
}) {
  const { values } = useContext(ParameterContext);
  const shop = model.fabrication?.shop;
  const tolerance = useMemo(() => shopTolerance(shop), [shop]);
  const params = useMemo(() => {
    try {
      return resolveParameters(model.parameters);
    } catch {
      return values || {};
    }
  }, [model.parameters, values]);
  const blankSketch = model.sketches.find((s) => s.id === feature.sketchId) || null;
  const profile = blankSketch?.profile || null;
  const editProblem = useMemo(
    () => (blankSketch ? sketchEditProblem(blankSketch) : 'The blank sketch is gone.'),
    [blankSketch],
  );
  const [problem, setProblem] = useState(null);
  // A crossing at a corner says how far its relief must reach (corner gaps §4.2).
  const { fold, error } = useMemo(() => {
    try {
      return { fold: foldSheet(feature, profile, params) };
    } catch (e) {
      return { error: crossingText(e) };
    }
  }, [feature, profile, params]);
  // Commit only what folds; a refused live value waits for Enter / blur.
  const propose = (next, meta, where = 'form') => {
    try {
      foldSheet(next, profile, params);
    } catch (e) {
      if (!meta?.live) setProblem({ where, message: crossingText(e) });
      return;
    }
    setProblem(null);
    onChange(next);
  };
  const bends = feature.bends || [];
  // The bends by their place among the bends, as the fold names them (a bend-on entry is none, tight bends §4.1).
  const ordinal = new Map(madeBends(bends).map((b, i) => [b.id, i + 1]));
  const plainCount = ordinal.size;
  // Editing or moving one bend of a stroke here makes it a hit of its own (§6.1).
  const alone = (bend) => {
    const { stroke: _stroke, ...rest } = bend;
    return rest;
  };
  const setBends = (next, meta, where) => propose({ ...feature, bends: next }, meta, where);
  const autoK = feature.kFactor == null || feature.kFactor === '';
  const problemAt = (where) =>
    problem?.where === where ? (
      <p className="cad-shop-error" role="alert">
        {problem.message}
      </p>
    ) : null;
  return (
    <div className="cad-sheet-metal" aria-label="Sheet metal">
      {onEditOutline && (
        <div className="cad-inline">
          <button
            type="button"
            disabled={Boolean(editProblem)}
            title={editProblem || 'Open the blank outline in the sketcher'}
            onClick={onEditOutline}
          >
            Edit outline
          </button>
        </div>
      )}
      {editNotice && (
        <p className="cad-help cad-shop-notice" role="status">
          {editNotice}
        </p>
      )}
      {fold ? (
        <p className="cad-part-size" aria-label="Flat blank">
          {blankLine(fold.flat)} · {plural(madeBends(bends).length, 'bend')}
        </p>
      ) : (
        <p className="cad-shop-error" role="alert">
          {error}
        </p>
      )}
      <StockSelect stock={feature.stock || DEFAULT_STOCK} onStock={(stock) => propose({ ...feature, stock })} />
      <ValueField
        label="Thickness (mm)"
        value={feature.thickness}
        onChange={(thickness, meta) => propose({ ...feature, thickness }, meta)}
      />
      <p className="cad-help">
        Standard {stockOf(feature.stock || DEFAULT_STOCK).name}:{' '}
        {stockOf(feature.stock || DEFAULT_STOCK).thicknesses.join(', ')} mm
      </p>
      <label className="cad-check">
        <input
          type="checkbox"
          aria-label="Automatic K-factor"
          checked={autoK}
          onChange={(e) =>
            propose({
              ...feature,
              kFactor: e.target.checked ? null : Number((fold?.bends[0]?.kFactor ?? 0.43).toFixed(3)),
            })
          }
        />
        K-factor from r/t and the stock
        {autoK && fold?.bends.length ? ` (K ${[...new Set(fold.bends.map((b) => fmt(b.kFactor)))].join(', ')})` : ''}
      </label>
      {!autoK && (
        <ValueField
          label="K-factor"
          value={feature.kFactor}
          onChange={(kFactor, meta) => propose({ ...feature, kFactor }, meta)}
        />
      )}
      {problemAt('form')}
      {fold?.warnings
        .filter((w) => !w.bendId)
        .map((w) => (
          <p className="cad-help" role="note" key={w.code}>
            {w.message}
          </p>
        ))}
      {/* How far the folded flanges stand apart (docs/sketch-studio-corner-gaps.md §3.3): hover marks the
          thumbnail; with onSetGaps each row is set here (§4.3). */}
      {fold &&
        (onSetGaps ? (
          <FlangeGapsSet
            fold={fold}
            feature={feature}
            machine={model.fabrication?.shop?.machine}
            profile={profile}
            params={params}
            editProblem={editProblem}
            onSetGaps={onSetGaps}
            tolerance={tolerance}
            ownTolerance={shop?.tolerance || null}
            onTolerance={onShopTolerance}
          />
        ) : (
          <FlangeGaps fold={fold} profile={profile} params={params} tolerance={tolerance} />
        ))}
      <h4>Bends, in the order they are made</h4>
      {!bends.length && <p className="cad-help">No bends yet: the part is the flat blank.</p>}
      {bends.map((bend, index) =>
        isBendOn(bend) ? (
          <BendOnRow
            key={bend.id}
            record={bend}
            number={ordinal.get(bend.again) ?? '?'}
            onChange={(next, meta) =>
              setBends(
                bends.map((b) => (b.id === bend.id ? next : b)),
                meta,
                bend.id,
              )
            }
            onRemove={() =>
              setBends(
                bends.filter((b) => b.id !== bend.id),
                null,
                bend.id,
              )
            }
            notes={problemAt(bend.id)}
          />
        ) : (
          <BendRow
            key={bend.id}
            bend={bend}
            index={ordinal.get(bend.id) - 1}
            count={plainCount}
            // The bend's own row shows its first angle; the numbers are the bend as made (§4.2).
            numbers={fold?.bends.find((b) => b.id === bend.id)}
            onChange={(next, meta) =>
              setBends(
                bends.map((b) => (b.id === bend.id ? alone(next) : b)),
                meta,
                bend.id,
              )
            }
            onMove={(step) => {
              const next = [...bends];
              [next[index], next[index + step]] = [next[index + step], alone(next[index])];
              setBends(next, null, bend.id);
            }}
            // Its bend-on hits go with it (§4.4).
            onRemove={() =>
              setBends(
                bends.filter((b) => b.id !== bend.id && b.again !== bend.id),
                null,
                bend.id,
              )
            }
            notes={
              <>
                {fold?.warnings
                  .filter((w) => w.bendId === bend.id)
                  .map((w) => (
                    <p className="cad-help" role="note" key={w.code}>
                      {w.message}
                    </p>
                  ))}
                {problemAt(bend.id)}
              </>
            }
          />
        ),
      )}
      <AddBendForm
        feature={feature}
        profile={profile}
        params={params}
        fold={fold}
        focusKey={addBendFocus}
        onAdd={(made) => setBends([...bends, ...made], null, 'add')}
      />
      {problemAt('add')}
    </div>
  );
}
