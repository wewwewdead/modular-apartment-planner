// Draw → Flanged panel (docs/sketch-studio-shop-floor.md §6.3): the form in
// the right pane and its preview over the view. The user states the finished
// part — the outside face (a rectangle, a trapezoid or a closed straight-edged
// sketch), a flange on any edge (click it in the preview), creases across the
// face, windows and holes — and sees, before anything is made, the face as
// asked, the blank the laser will cut (its size, its bend lines numbered in
// brake order) and what the press brake will say. The layout is panelMaker.js;
// the workspace keeps the draft, so the form and the preview edit one thing.
// A square corner between two flanges may be rounded (docs/sketch-studio-
// round-bend.md §13.3): the flanges stop short and a corner piece closes it.
import { useId } from 'react';
import { profilePolygon, polygonBounds } from './sheetMetal.js';
import { StockFields } from './ShopPanels.jsx';
import { PrimaryButton, ProblemCard } from './ShopFloor.jsx';
import { ROUND_CORNER, presetFace } from './panelMaker.js';
import { isClosedProfile } from './operations.js';
import NumericInput from '../components/NumericInput.jsx';

const fmt = (value, digits = 1) => (Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const DIRECTION_ARROWS = { up: '↑', down: '↓' };
let draftCounter = 0;
const draftId = (kind) => `${kind}-${++draftCounter}`;

/** A fresh form: the kiosk-style face frame of the shop floor spec (§1). */
export const defaultPanelDraft = () => ({
  shape: 'rectangle',
  width: 600,
  height: 1400,
  bottom: 600,
  top: 400,
  sketchId: null,
  stock: 'spcc',
  thickness: 1.5,
  depth: 40,
  direction: 'up',
  flanges: {},
  // Round corners by corner index: { radius (outside), leg } (round-bend spec §13.3).
  rounds: {},
  creases: [],
  windows: [],
  holes: [],
  edge: null,
  name: 'Flanged panel',
});

/**
 * The corners a draft may round (round-bend spec §13.3): square (90°), a flange
 * on both edges (corner k = face[k], between edge k − 1 and edge k). The
 * panel maker refuses, by name, the rest of what a round corner needs (the
 * same side, the same depth).
 */
export function roundableCorners(face, flanges) {
  if (!face) return [];
  const n = face.length;
  return face
    .map((p, k) => {
      const a = face[(k - 1 + n) % n],
        b = face[(k + 1) % n];
      const u = [p[0] - a[0], p[1] - a[1]],
        v = [b[0] - p[0], b[1] - p[1]];
      const square = Math.abs(u[0] * v[0] + u[1] * v[1]) < 1e-6 * Math.hypot(...u) * Math.hypot(...v);
      return square && flanges[(k - 1 + n) % n] && flanges[k] ? k : null;
    })
    .filter((k) => k != null);
}
/** The draft's round corners that apply now (on a corner that may be rounded): { corner: { radius, leg } }. */
export function draftRounds(draft, face) {
  const ok = new Set(roundableCorners(face, draft.flanges));
  return Object.fromEntries(Object.entries(draft.rounds || {}).filter(([k]) => ok.has(Number(k))));
}

// A sketch's outline as a face: straight edges only, oriented counter-clockwise.
function sketchFace(sketch, params) {
  const profile = sketch?.profile;
  if (!profile) return null;
  if (profile.type === 'path' && profile.segments?.some((s) => s.type !== 'line' && !s.construction)) return null;
  if (!['polygon', 'rectangle', 'path'].includes(profile.type)) return null;
  try {
    return profilePolygon({ ...profile, holes: [] }, params).outer;
  } catch {
    return null;
  }
}
/** Closed XY sketches with straight edges, usable as a face: [{ id, name }]. */
export const faceSketches = (model, params = {}) =>
  model.sketches
    .filter((s) => isClosedProfile(s) && (s.plane || 'XY') === 'XY' && !s.normal && sketchFace(s, params))
    .map((s) => ({ id: s.id, name: s.name }));

/** The draft's face outline (outside mould lines), or null. */
export function draftFace(draft, model, params = {}) {
  if (draft.shape === 'rectangle') return presetFace('rectangle', draft);
  if (draft.shape === 'trapezoid') return presetFace('trapezoid', draft);
  return sketchFace(
    model.sketches.find((s) => s.id === draft.sketchId),
    params,
  );
}

/** The panel maker's input from a draft (panelMaker.js flangedPanel), or { error }. */
export function panelInput(draft, model, params = {}) {
  const face = draftFace(draft, model, params);
  if (!face) return { error: 'Choose a closed sketch with straight edges for the face.' };
  const [[x0], [x1]] = polygonBounds(face);
  return {
    face,
    thickness: draft.thickness,
    stock: draft.stock,
    flanges: Object.entries(draft.flanges)
      .filter(([edge]) => Number(edge) < face.length)
      .map(([edge, f]) => ({ edge: Number(edge), depth: f.depth, angle: f.angle ?? 90, direction: f.direction })),
    rounds: Object.entries(draftRounds(draft, face)).map(([corner, r]) => ({
      corner: Number(corner),
      radius: r.radius,
      leg: r.leg,
    })),
    creases: draft.creases.map((c) =>
      c.mode === 'points'
        ? { a: c.a, b: c.b, angle: c.angle, direction: c.direction }
        : { a: [x0 - 1, c.y], b: [x1 + 1, c.y], angle: c.angle, direction: c.direction },
    ),
    windows: draft.windows.map(({ id: _id, ...w }) => w),
    holes: draft.holes.map(({ id: _id, ...h }) => h),
  };
}

const edgeName = (face, i) => {
  const p = face[i],
    q = face[(i + 1) % face.length];
  const dx = q[0] - p[0],
    dy = q[1] - p[1];
  const side = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'bottom' : 'top') : dy > 0 ? 'right side' : 'left side';
  return `Edge ${i + 1} · ${side} · ${fmt(Math.hypot(dx, dy))} mm`;
};

function Field({ label, value, onCommit, min = null, step = '1', name = label }) {
  return (
    <label className="cad-field">
      {label}
      <NumericInput
        aria-label={name}
        step={step}
        {...(min != null ? { min: String(min) } : {})}
        value={Number.isFinite(value) ? +Number(value).toFixed(4) : ''}
        onCommit={(v) => Number.isFinite(v) && (min == null || v >= min) && onCommit(v)}
      />
    </label>
  );
}
function Segmented({ label, options, value, onChange }) {
  return (
    <span className="cad-segmented" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </span>
  );
}

/**
 * The form. `draft` / `onDraft(patch | fn)`: the workspace's draft; `face`:
 * draftFace(); `result`: flangedPanel() of it, or { error }. Its endings
 * (PanelEndings) sit in the station's footer.
 */
export function PanelMakerForm({ draft, onDraft, face, result, model, params }) {
  const sketches = faceSketches(model, params);
  const set = (patch) => onDraft((d) => ({ ...d, ...patch }));
  const setFlange = (edge, patch) =>
    onDraft((d) => {
      const flanges = { ...d.flanges };
      if (patch == null) delete flanges[edge];
      else flanges[edge] = { depth: d.depth, direction: d.direction, angle: 90, ...flanges[edge], ...patch };
      return { ...d, flanges, edge };
    });
  // A round corner on (patch {} the defaults, or { radius } / { leg }) or off (null).
  const setRound = (corner, patch) =>
    onDraft((d) => {
      const rounds = { ...(d.rounds || {}) };
      if (patch == null) delete rounds[corner];
      else rounds[corner] = { radius: ROUND_CORNER.radius, leg: ROUND_CORNER.leg, ...rounds[corner], ...patch };
      return { ...d, rounds };
    });
  const corners = roundableCorners(face, draft.flanges);
  const setList = (key, id, patch) =>
    onDraft((d) => ({
      ...d,
      [key]:
        patch == null ? d[key].filter((x) => x.id !== id) : d[key].map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  const height = face ? polygonBounds(face)[1][1] : 0;
  const width = face ? polygonBounds(face)[1][0] - polygonBounds(face)[0][0] : 0;
  const left = face ? polygonBounds(face)[0][0] : 0;
  const report = result?.report;
  const problems = report?.problems || [];
  const formId = useId();
  return (
    <div className="cad-panel-form" role="group" aria-label="Flanged panel">
      <p className="cad-help cad-panel-lead">
        Describe the finished part: the outside face, a flange on any edge, creases across it and the windows. The blank
        is laid out for you, bend allowances included.
      </p>
      <h5>1 · Face (outside size)</h5>
      <Segmented
        label="Face shape"
        options={[
          ['rectangle', 'Rectangle'],
          ['trapezoid', 'Trapezoid'],
          ['sketch', 'Sketch'],
        ]}
        value={draft.shape}
        onChange={(shape) => set({ shape, flanges: {}, rounds: {}, edge: null })}
      />
      {draft.shape === 'rectangle' && (
        <div className="cad-inline cad-panel-row">
          <Field label="Width W (mm)" value={draft.width} min={1} onCommit={(width) => set({ width })} />
          <Field label="Height H (mm)" value={draft.height} min={1} onCommit={(h) => set({ height: h })} />
        </div>
      )}
      {draft.shape === 'trapezoid' && (
        <div className="cad-inline cad-panel-row">
          <Field label="Bottom (mm)" value={draft.bottom} min={1} onCommit={(bottom) => set({ bottom })} />
          <Field label="Top (mm)" value={draft.top} min={1} onCommit={(top) => set({ top })} />
          <Field label="Height (mm)" value={draft.height} min={1} onCommit={(h) => set({ height: h })} />
        </div>
      )}
      {draft.shape === 'sketch' && (
        <label className="cad-field">
          Face sketch
          <select
            aria-label="Face sketch"
            value={draft.sketchId || ''}
            onChange={(e) => set({ sketchId: e.target.value || null, flanges: {}, rounds: {}, edge: null })}
          >
            <option value="">{sketches.length ? 'Choose a sketch' : 'No closed straight-edged sketch on XY'}</option>
            {sketches.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <StockFields
        stock={draft.stock}
        thickness={draft.thickness}
        onStock={(stock) => set({ stock })}
        onThickness={(thickness) => set({ thickness })}
      />
      <h5>2 · Flanges</h5>
      <p className="cad-help">Click an edge in the preview to put a flange on it (again to take it off).</p>
      <div className="cad-inline cad-panel-row">
        <Field
          label="Depth (mm)"
          name="Flange depth (mm)"
          value={draft.depth}
          min={1}
          onCommit={(depth) => set({ depth })}
        />
        <Segmented
          label="Flanges rise"
          options={[
            ['up', 'Up ↑'],
            ['down', 'Down ↓'],
          ]}
          value={draft.direction}
          onChange={(direction) => set({ direction })}
        />
      </div>
      {face && (
        <div className="cad-panel-row cad-inline">
          <button
            type="button"
            onClick={() =>
              onDraft((d) => ({
                ...d,
                flanges: Object.fromEntries(
                  face.map((_, i) => [i, { depth: d.depth, direction: d.direction, angle: 90 }]),
                ),
              }))
            }
          >
            Flange all edges
          </button>
          <button
            type="button"
            disabled={!Object.keys(draft.flanges).length}
            onClick={() => set({ flanges: {}, rounds: {} })}
          >
            No flanges
          </button>
        </div>
      )}
      {face && (
        <ul className="cad-panel-list" aria-label="Edges">
          {face.map((_, i) => {
            const f = draft.flanges[i];
            return (
              <li key={i} className={draft.edge === i ? 'is-current' : ''}>
                <label className="cad-check">
                  <input
                    type="checkbox"
                    aria-label={`Flange on edge ${i + 1}`}
                    checked={Boolean(f)}
                    onChange={(e) => setFlange(i, e.target.checked ? {} : null)}
                  />
                  {edgeName(face, i)}
                </label>
                {f && (
                  <span className="cad-panel-sub">
                    <Field
                      label="Depth"
                      name={`Edge ${i + 1} depth (mm)`}
                      value={f.depth}
                      min={1}
                      onCommit={(depth) => setFlange(i, { depth })}
                    />
                    <Segmented
                      label={`Edge ${i + 1} direction`}
                      options={[
                        ['up', '↑'],
                        ['down', '↓'],
                      ]}
                      value={f.direction}
                      onChange={(direction) => setFlange(i, { direction })}
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {corners.length > 0 && (
        <>
          <p className="cad-help">
            A square corner between two flanges closes square: one flange covers the other. Round it and both flanges
            stop short; a corner piece (a strip bent round in bump hits) is set in the corner against their ends.
            Radius: the outside of the corner. Leg: the corner piece’s straight ends, either side of its bend.
          </p>
          <ul className="cad-panel-list" aria-label="Corners">
            {corners.map((k) => {
              const r = draft.rounds?.[k];
              return (
                <li key={k}>
                  <label className="cad-check">
                    <input
                      type="checkbox"
                      aria-label={`Round corner ${k + 1}`}
                      checked={Boolean(r)}
                      onChange={(e) => setRound(k, e.target.checked ? {} : null)}
                    />
                    Corner {k + 1} · {r ? `round, R${fmt(r.radius)} outside` : 'square'}
                  </label>
                  {r && (
                    <span className="cad-panel-sub">
                      <Field
                        label="Radius"
                        name={`Corner ${k + 1} radius (mm)`}
                        value={r.radius}
                        min={0.1}
                        onCommit={(radius) => setRound(k, { radius })}
                      />
                      <Field
                        label="Leg"
                        name={`Corner ${k + 1} leg (mm)`}
                        value={r.leg}
                        min={0.1}
                        onCommit={(leg) => setRound(k, { leg })}
                      />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <h5>3 · Creases</h5>
      <p className="cad-help">
        A shallow bend across the face. Click the face in the preview to put one at that height.
      </p>
      <ul className="cad-panel-list" aria-label="Creases">
        {draft.creases.map((c, k) => (
          <li key={c.id}>
            <span className="cad-panel-sub">
              <strong>Crease {k + 1}</strong>
              {/* By its height (straight across), or by two points on the face's edges (§6.3). */}
              <Segmented
                label={`Crease ${k + 1} placed by`}
                options={[
                  ['height', 'Height'],
                  ['points', 'Two points'],
                ]}
                value={c.mode === 'points' ? 'points' : 'height'}
                onChange={(mode) =>
                  setList(
                    'creases',
                    c.id,
                    mode === 'points'
                      ? { mode, a: c.a || [left, c.y], b: c.b || [left + width, c.y] }
                      : { mode, y: c.y ?? Math.round((c.a[1] + c.b[1]) / 2) },
                  )
                }
              />
              {c.mode !== 'points' && (
                <Field
                  label="Height"
                  name={`Crease ${k + 1} height (mm)`}
                  value={c.y}
                  onCommit={(y) => setList('creases', c.id, { y })}
                />
              )}
              {c.mode === 'points' &&
                [
                  ['a', 0, 'A X'],
                  ['a', 1, 'A Y'],
                  ['b', 0, 'B X'],
                  ['b', 1, 'B Y'],
                ].map(([end, axis, label]) => (
                  <Field
                    key={label}
                    label={label}
                    name={`Crease ${k + 1} ${label} (mm)`}
                    value={c[end]?.[axis]}
                    onCommit={(v) =>
                      setList('creases', c.id, { [end]: (c[end] || [0, 0]).map((old, i) => (i === axis ? v : old)) })
                    }
                  />
                ))}
              <Field
                label="Angle °"
                name={`Crease ${k + 1} angle (°)`}
                value={c.angle}
                min={0.5}
                onCommit={(angle) => setList('creases', c.id, { angle })}
              />
              <Segmented
                label={`Crease ${k + 1} direction`}
                options={[
                  ['up', '↑'],
                  ['down', '↓'],
                ]}
                value={c.direction}
                onChange={(direction) => setList('creases', c.id, { direction })}
              />
              <button type="button" className="cad-danger-inline" onClick={() => setList('creases', c.id, null)}>
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={!face}
        onClick={() =>
          onDraft((d) => ({
            ...d,
            creases: [
              ...d.creases,
              { id: draftId('crease'), mode: 'height', y: Math.round(height * 0.43), angle: 12, direction: 'down' },
            ],
          }))
        }
      >
        Add crease
      </button>
      <h5>4 · Windows and holes</h5>
      <ul className="cad-panel-list" aria-label="Windows">
        {draft.windows.map((w, k) => (
          <li key={w.id}>
            <span className="cad-panel-sub cad-panel-window">
              <strong>
                {w.type === 'circle' ? 'Round window' : 'Window'} {k + 1}
              </strong>
              <Field
                label="X"
                name={`Window ${k + 1} X (mm)`}
                value={w.x}
                onCommit={(x) => setList('windows', w.id, { x })}
              />
              <Field
                label="Y"
                name={`Window ${k + 1} Y (mm)`}
                value={w.y}
                onCommit={(y) => setList('windows', w.id, { y })}
              />
              {w.type === 'circle' ? (
                <Field
                  label="Ø"
                  name={`Window ${k + 1} diameter (mm)`}
                  value={w.diameter}
                  min={0.1}
                  onCommit={(diameter) => setList('windows', w.id, { diameter })}
                />
              ) : (
                <>
                  <Field
                    label="W"
                    name={`Window ${k + 1} width (mm)`}
                    value={w.width}
                    min={0.1}
                    onCommit={(v) => setList('windows', w.id, { width: v })}
                  />
                  <Field
                    label="H"
                    name={`Window ${k + 1} height (mm)`}
                    value={w.height}
                    min={0.1}
                    onCommit={(v) => setList('windows', w.id, { height: v })}
                  />
                  <Field
                    label="R"
                    name={`Window ${k + 1} corner radius (mm)`}
                    value={w.radius}
                    min={0}
                    onCommit={(radius) => setList('windows', w.id, { radius })}
                  />
                </>
              )}
              <button type="button" className="cad-danger-inline" onClick={() => setList('windows', w.id, null)}>
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="cad-inline cad-panel-row">
        <button
          type="button"
          disabled={!face}
          onClick={() =>
            onDraft((d) => ({
              ...d,
              windows: [
                ...d.windows,
                {
                  id: draftId('window'),
                  type: 'rect',
                  x: Math.round(width / 2),
                  y: Math.round(height / 2),
                  width: Math.round(width * 0.6),
                  height: Math.round(height * 0.25),
                  radius: 10,
                },
              ],
            }))
          }
        >
          Add window
        </button>
        <button
          type="button"
          disabled={!face}
          onClick={() =>
            onDraft((d) => ({
              ...d,
              windows: [
                ...d.windows,
                {
                  id: draftId('window'),
                  type: 'circle',
                  x: Math.round(width / 2),
                  y: Math.round(height / 2),
                  diameter: 5,
                },
              ],
            }))
          }
        >
          Add hole
        </button>
      </div>
      <h5>5 · Result</h5>
      {result?.error ? (
        <ProblemCard message={result.error} />
      ) : report ? (
        <>
          <dl className="cad-shop-results" aria-label="Panel results">
            <div className="cad-shop-result">
              <dt>Blank</dt>
              <dd aria-label="Blank">
                {fmt(report.blank.width)} × {fmt(report.blank.height)} mm
              </dd>
            </div>
            <div className="cad-shop-result">
              <dt>Folded</dt>
              <dd aria-label="Folded" title="X × Y × Z, part coordinates">
                {report.folded.size.map((v) => fmt(v)).join(' × ')} mm
              </dd>
            </div>
            <div className="cad-shop-result">
              <dt>Press brake</dt>
              <dd aria-label="Hits">{plural(report.strokes, 'hit')}</dd>
            </div>
            {result.cornerPieces?.length > 0 && (
              <div className="cad-shop-result">
                <dt>Corner pieces</dt>
                <dd
                  aria-label="Corner pieces"
                  title="Cut and bent as their own part (one per size), then set in the round corners and grouped with the panel"
                >
                  {cornerPiecesText(result.cornerPieces)}
                </dd>
              </div>
            )}
          </dl>
          {problems.map((p) => (
            <ProblemCard key={`${p.index}`} label="Brake check" message={p.message} />
          ))}
          {!problems.length && (
            <p className="cad-help" role="status" aria-label="Brake check">
              The press brake takes every hit in this order:{' '}
              {result.strokes.length ? 'no refusal, no collision.' : 'nothing to bend.'}
            </p>
          )}
        </>
      ) : null}
      <label className="cad-field" htmlFor={`${formId}-name`}>
        Part name
        <input
          id={`${formId}-name`}
          aria-label="Part name"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
    </div>
  );
}

// "2 pieces · blank 75.9 × 40 mm · R30 outside in 10 hits", one clause per size.
function cornerPiecesText(cornerPieces) {
  const sizes = [...new Set(cornerPieces.map((c) => c.piece))];
  return sizes
    .map((piece) => {
      const at = cornerPieces.filter((c) => c.piece === piece);
      const { blank } = piece.report;
      return `${plural(at.length, 'piece')} · blank ${fmt(blank.width)} × ${fmt(blank.height)} mm · R${fmt(at[0].radius)} outside in ${piece.numbers.steps} hits`;
    })
    .join('; ');
}

/** The two endings (§6.3), pinned in the Draw station's footer while the form is open. */
export function PanelEndings({ ready, onCreate }) {
  return (
    <div className="cad-panel-endings">
      <PrimaryButton
        disabled={!ready}
        onClick={() => onCreate('cut')}
        title="The part with its etched bend lines: at the brake each hit is one click on its line"
      >
        Cut the blank — I will bend it
      </PrimaryButton>
      <button type="button" className="cad-panel-alt" disabled={!ready} onClick={() => onCreate('bend')}>
        Cut and bend it for me
      </button>
    </div>
  );
}

// ------------------------------------------------------------ the preview card
const COLOURS = { up: '#c2410c', down: '#1864ab' };
const ringPath = (ring) => `M ${ring.map(([x, y]) => `${fmt(x, 3)} ${fmt(-y, 3)}`).join(' L ')} Z`;
const svgPoint = ([x, y]) => `${fmt(x, 3)} ${fmt(-y, 3)}`;
const along = (p, u, d) => [p[0] + u[0] * d, p[1] + u[1] * d];
const unitOf = (a, b) => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};
// A round corner k of the face: the unit directions in (along edge k − 1) and out (along edge k).
const cornerDirections = (face, k) => {
  const n = face.length;
  return [unitOf(face[(k - 1 + n) % n], face[k]), unitOf(face[k], face[(k + 1) % n])];
};
// The face outline with its round corners (outside radius): a quarter arc between the tangent points.
function facePath(face, rounds) {
  const ends = face.map((p, k) => {
    const r = rounds[k];
    if (!r) return { from: p, to: p, radius: null };
    const [ua, ub] = cornerDirections(face, k);
    return { from: along(p, ua, -r.radius), to: along(p, ub, r.radius), radius: r.radius };
  });
  // Clockwise on screen (y down): a convex corner rounds with sweep 1.
  const segments = ends.map(
    (c) =>
      `L ${svgPoint(c.from)}${c.radius ? ` A ${fmt(c.radius, 3)} ${fmt(c.radius, 3)} 0 0 1 ${svgPoint(c.to)}` : ''}`,
  );
  return `M ${svgPoint(ends.at(-1).to)} ${segments.join(' ')} Z`;
}
const viewOf = (points, pad) => {
  const [[x0, y0], [x1, y1]] = polygonBounds(points);
  const margin = Math.max(x1 - x0, y1 - y0) * pad + 4;
  return { box: [x0 - margin, -(y1 + margin), x1 - x0 + 2 * margin, y1 - y0 + 2 * margin], x0, y0, x1, y1 };
};

/**
 * The preview over the view: the face as asked (click an edge for a flange,
 * the face for a crease at that height) beside the blank the laser will cut
 * with its bend lines numbered in brake order. `onEdge(i)`, `onFace([x, y])`.
 */
export function PanelPreview({ draft, face, result, onEdge, onFace }) {
  if (!face) return null;
  const design = viewOf(face, 0.16);
  const unit = Math.max(design.box[2], design.box[3]) / 100;
  const blank = result?.profile ? profilePolygon(result.profile) : null;
  const flat = blank ? viewOf(blank.outer, 0.08) : null;
  const flatUnit = flat ? Math.max(flat.box[2], flat.box[3]) / 100 : 1;
  const numberOf = new Map((result?.strokes || []).flatMap((s, i) => s.bendIds.map((id) => [id, i + 1])));
  // Round corners as the maker laid them out (none while the form is refused).
  const rounds = result?.error ? {} : draftRounds(draft, face);
  const toLocal = (event, svg) => {
    const m = svg.getScreenCTM?.();
    if (!m || typeof DOMPoint === 'undefined') return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
    return [p.x, -p.y];
  };
  return (
    <figure className="cad-panel-preview" aria-label="Panel preview">
      <div className="cad-panel-view">
        <figcaption>
          The finished face
          <small>
            {fmt(design.x1 - design.x0)} × {fmt(design.y1 - design.y0)} mm outside · click an edge for a flange, the
            face for a crease
          </small>
        </figcaption>
        <svg
          viewBox={design.box.join(' ')}
          role="img"
          aria-label="Finished face"
          onClick={(event) => {
            const p = toLocal(event, event.currentTarget);
            if (p) onFace(p);
          }}
        >
          <path className="cad-panel-face" d={facePath(face, rounds)} />
          {draft.windows.map((w) =>
            w.type === 'circle' ? (
              <circle key={w.id} className="cad-panel-cut" cx={w.x} cy={-w.y} r={w.diameter / 2} />
            ) : (
              <rect
                key={w.id}
                className="cad-panel-cut"
                x={w.x - w.width / 2}
                y={-(w.y + w.height / 2)}
                width={w.width}
                height={w.height}
                rx={w.radius || 0}
              />
            ),
          )}
          {(result?.error ? [] : panelCreases(draft, face)).map((c) => (
            <g key={c.id}>
              <line
                className={`cad-panel-crease is-${c.direction}`}
                x1={c.a[0]}
                y1={-c.a[1]}
                x2={c.b[0]}
                y2={-c.b[1]}
              />
              <text
                x={(c.a[0] + c.b[0]) / 2}
                y={-((c.a[1] + c.b[1]) / 2) - unit * 1.6}
                fontSize={unit * 3.4}
                textAnchor="middle"
              >
                {DIRECTION_ARROWS[c.direction]} {fmt(c.angle)}° at {fmt(c.a[1])}
              </text>
            </g>
          ))}
          {face.map((p, i) => {
            const q = face[(i + 1) % face.length];
            const f = draft.flanges[i];
            const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
            const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
            const out = [(q[1] - p[1]) / len, -(q[0] - p[0]) / len];
            // The label runs along its edge (turned to read left to right or
            // bottom to top), so only its height stands out from the face and
            // a side edge's label never lies over the outline (SF-3 audit).
            const at = [mid[0] + out[0] * unit * 4, -(mid[1] + out[1] * unit * 4)];
            // A flange stops `radius + leg` short of a round corner (the corner piece takes over).
            const short = (k) => (f && rounds[k] ? rounds[k].radius + rounds[k].leg : 0);
            const e = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
            const [p1, q1] = [along(p, e, short(i)), along(q, e, -short((i + 1) % face.length))];
            let turn = (Math.atan2(-(q[1] - p[1]), q[0] - p[0]) * 180) / Math.PI;
            if (turn > 89.999) turn -= 180;
            else if (turn < -90.001) turn += 180;
            return (
              <g
                key={i}
                className={`cad-panel-edge${f ? ' is-flanged' : ''}${draft.edge === i ? ' is-current' : ''}`}
                role="button"
                aria-label={`Edge ${i + 1}${f ? `: flange ${fmt(f.depth)} mm ${f.direction}` : ''}`}
                aria-pressed={Boolean(f)}
                onClick={(event) => {
                  event.stopPropagation();
                  onEdge(i);
                }}
              >
                {/* What to click: a band along the edge out to its label. */}
                <polygon
                  className="cad-panel-hit"
                  points={[
                    [p[0] - out[0] * unit * 1.5, p[1] - out[1] * unit * 1.5],
                    [q[0] - out[0] * unit * 1.5, q[1] - out[1] * unit * 1.5],
                    [q[0] + out[0] * unit * 6, q[1] + out[1] * unit * 6],
                    [p[0] + out[0] * unit * 6, p[1] + out[1] * unit * 6],
                  ]
                    .map(([x, y]) => `${x},${-y}`)
                    .join(' ')}
                />
                <line
                  x1={p1[0]}
                  y1={-p1[1]}
                  x2={q1[0]}
                  y2={-q1[1]}
                  style={f ? { stroke: COLOURS[f.direction] } : undefined}
                />
                <text
                  x={at[0]}
                  y={at[1]}
                  transform={
                    Math.abs(turn) > 1e-6 ? `rotate(${fmt(turn, 3)} ${fmt(at[0], 3)} ${fmt(at[1], 3)})` : undefined
                  }
                  fontSize={unit * 3.4}
                  className={f ? 'is-flange' : undefined}
                  textAnchor="middle"
                  dy="0.35em"
                >
                  {f ? `flange ${fmt(f.depth)} ${DIRECTION_ARROWS[f.direction]}` : `${fmt(len)} · no flange`}
                </text>
              </g>
            );
          })}
          {/* The corner pieces: from one flange's end round the arc to the other's. */}
          {Object.entries(rounds).map(([key, r]) => {
            const k = Number(key);
            const [ua, ub] = cornerDirections(face, k);
            const p = face[k];
            return (
              <path
                key={`corner-${k}`}
                className="cad-panel-corner-piece"
                d={`M ${svgPoint(along(p, ua, -(r.radius + r.leg)))} L ${svgPoint(along(p, ua, -r.radius))} A ${fmt(r.radius, 3)} ${fmt(r.radius, 3)} 0 0 1 ${svgPoint(along(p, ub, r.radius))} L ${svgPoint(along(p, ub, r.radius + r.leg))}`}
              />
            );
          })}
        </svg>
      </div>
      <div className="cad-panel-view">
        <figcaption>
          The blank the laser cuts
          <small>
            {result?.report
              ? `${fmt(result.report.blank.width)} × ${fmt(result.report.blank.height)} mm · bends numbered in brake order`
              : 'fix the form to see it'}
          </small>
        </figcaption>
        {flat ? (
          <svg viewBox={flat.box.join(' ')} role="img" aria-label="Blank">
            <path
              className="cad-panel-blank"
              d={[blank.outer, ...blank.holes].map(ringPath).join(' ')}
              fillRule="evenodd"
            />
            {result.bends.map((b) => (
              <line
                key={b.id}
                className="cad-panel-bend"
                stroke={COLOURS[b.direction]}
                x1={b.a[0]}
                y1={-b.a[1]}
                x2={b.b[0]}
                y2={-b.b[1]}
              />
            ))}
            {result.marks.map((m, i) => {
              const at = [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2];
              const bad = result.report.sequence[i] && !result.report.sequence[i].ok;
              return (
                <g key={m.id} className={`cad-panel-number${bad ? ' is-refused' : ''}`}>
                  <circle
                    cx={at[0]}
                    cy={-at[1]}
                    r={flatUnit * 2.6}
                    fill={bad ? '#c92a2a' : COLOURS[m.bend.direction]}
                  />
                  <text x={at[0]} y={-at[1]} fontSize={flatUnit * 3} textAnchor="middle" dy="0.35em">
                    {numberOf.get(result.strokes[i]?.bendIds[0]) || i + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <p className="cad-panel-empty">{result?.error || 'No blank yet.'}</p>
        )}
      </div>
      {result?.report && (
        <p className="cad-panel-verdict" role="status" aria-label="Panel verdict">
          Folded {result.report.folded.size.map((v) => fmt(v)).join(' × ')} mm · {plural(result.report.strokes, 'hit')}{' '}
          on the {result.report.machine}:{' '}
          {result.report.problems.length ? (
            <strong className="is-refused">
              {plural(result.report.problems.length, 'hit')} refused. {result.report.problems[0].message}
            </strong>
          ) : (
            <strong>every hit clears, in this order.</strong>
          )}
        </p>
      )}
    </figure>
  );
}

// The draft's creases as lines across the face (for the preview).
function panelCreases(draft, face) {
  const [[x0], [x1]] = polygonBounds(face);
  return draft.creases.map((c) => (c.mode === 'points' ? { ...c } : { ...c, a: [x0, c.y], b: [x1, c.y] }));
}
