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
  distanceFromLeg,
  foldSheet,
  isBendOn,
  legFromDistance,
  madeBends,
  profilePolygon,
} from './sheetMetal.js';
import {
  DEFAULT_STOCK,
  PUNCHES,
  RADIUS_PUNCHES,
  SHEET_STOCK,
  STOCK_KEYS,
  dieOf,
  nearestRadiusPunch,
  stockOf,
} from './shopCatalog.js';
import { ValueField } from './CadEditors.jsx';
import { OutlineThumb, PrimaryButton, ProblemCard, StationShell } from './ShopFloor.jsx';
import { ParameterContext } from './ExpressionInput.jsx';
import { MAX_LASER_QUANTITY } from './laserStation.js';
import NumericInput from '../components/NumericInput.jsx';

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
 * were; `editNotice` says what that finish did.
 */
export function CutFromSheetPanel(props) {
  return props.outline?.kind === 'batch' ? <BatchCutPanel {...props} /> : <SingleCutPanel {...props} />;
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

/**
 * The `sheetmetal` feature (Properties → feature 1): stock, thickness, K and
 * the bend table, plus Add bend. A change the fold refuses is never committed:
 * a live value waits, Enter / blur shows the reason here. `onEditOutline()`
 * reopens the blank's outline in the sketcher (docs/sketch-studio-outline-
 * edit-sheet-nest.md §3.6); `editNotice` says what the last such finish did.
 */
export function SheetMetalForm({ feature, model, onChange, addBendFocus = 0, onEditOutline = null, editNotice = '' }) {
  const { values } = useContext(ParameterContext);
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
  const { fold, error } = useMemo(() => {
    try {
      return { fold: foldSheet(feature, profile, params) };
    } catch (e) {
      return { error: e.message };
    }
  }, [feature, profile, params]);
  // Commit only what folds; a refused live value waits for Enter / blur.
  const propose = (next, meta, where = 'form') => {
    try {
      foldSheet(next, profile, params);
    } catch (e) {
      if (!meta?.live) setProblem({ where, message: e.message });
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
