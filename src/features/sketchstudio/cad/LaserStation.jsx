// The laser station (docs/sketch-studio-fab-shop.md §9 SM-4): the panel (the
// sheet, the quantity, the blank, cut time and sheet use on show and the
// machine's numbers one click away, docs/sketch-studio-shop-floor.md §4.6;
// the checks as problem cards, Cut, Etch bend lines) and the laser bed, a full-view SVG over the 3D viewport
// (a cut is a flat thing: the sheet at true scale reads better square on than
// in perspective, and the bed covering the view keeps its clicks off the
// parts). The bed draws the stock sheet with the blank nested on it in the
// sketch's own X, Y (+Y up, as the flat DXF), the programmed path, the etched
// marks, and during a cut the head following the path: a pierce, then the
// contour, the cut-outs first and the outline last. The animation runs in
// its own requestAnimationFrame loop and rewrites the SVG in place (no React
// render per frame); its end is reported by token. Every number comes from
// laserStation.js and shopCatalog.js.
//
// SN-1 (docs/sketch-studio-outline-edit-sheet-nest.md §4.4): the sheet is
// shared — the bed draws the other blanks of the stock sheet under this cut's,
// a Sheet switch when the nest needs more than one, and a job of several parts
// lists them under "This cut" (a row makes that part the lead).
import { useEffect, useMemo, useRef } from 'react';
import { animationScale, headAt, MAX_LASER_QUANTITY, partialRing } from './laserStation.js';
import { LASER_PART_GAP, LASER_SHEETS, LASER_SHEET_KEYS, LASERS, SHEET_STOCK } from './shopCatalog.js';
import {
  MachineNumbers,
  OutlineThumb,
  PrimaryButton,
  ProblemCard,
  Readout,
  Result,
  StationShell,
} from './ShopFloor.jsx';
import NumericInput from '../components/NumericInput.jsx';

const fmt = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const seconds = (s) => (s < 60 ? `${fmt(s, 1)} s` : `${Math.floor(s / 60)} min ${fmt(s % 60, 0)} s`);
const linePath = (points) => `M ${points.map(([x, y]) => `${fmt(x, 3)} ${fmt(-y, 3)}`).join(' L ')}`;
const ringPath = (ring) => `${linePath(ring)} Z`;
/** "shown at 1/2.4 speed" or "shown 3.1× faster": the animation's time scale in words. */
export const scaleWords = (scale) =>
  Math.abs(scale - 1) < 0.05
    ? 'shown in real time'
    : scale < 1
      ? `shown at 1/${fmt(1 / scale, 1)} speed`
      : `shown ${fmt(scale, 1)}× faster`;
const contourName = (contour, count) =>
  contour.kind === 'outline' ? 'the outline' : `cut-out ${contour.index + 1} of ${count}`;
// Cut is off on a sheet that holds none of this cut's blanks (§4.4).
export const NONE_ON_SHEET = 'None of this part is on this sheet.';
// Its share of the sheet below which the station says there is room for another part (§4.4).
const ROOM_BELOW = 0.6;
/**
 * The bed's view until the user chooses one (§4.4): Close-up while the shown
 * sheet holds this one blank and nothing else, else the whole sheet.
 */
export const laserAutoView = (station) => (station.blanks.length === 1 && !station.others.length ? 'close' : 'sheet');

/**
 * The laser station's panel. `station`: laserStation(); `session`: the
 * workspace's shopSession (station 'laser'); `shell`: the station shell's
 * subject and Back / Next. Callbacks: onSheet(key) (a model commit,
 * kernel-inert), onQuantity(n) (SN-1 §4.3: a model commit, the lead part's
 * instances), onLead(instanceId) (a This cut row: that part leads, session),
 * onDraw (Draw another part), onCut, onStop, onEtch / onClearMarks (model
 * commits of the feature's marks), onLeave; onEditOutline (the blank's
 * sketch in the sketcher, off with `editProblem`). `warning`: Quantity's
 * card when fewer copies could go than asked. `params`: for the thumbnails.
 */
export function LaserPanel({
  station,
  session,
  problem = '',
  notice = '',
  warning = '',
  shell = null,
  params = null,
  onSheet,
  onQuantity,
  onLead = null,
  onDraw = null,
  onCut,
  onStop,
  onEtch,
  onClearMarks,
  onLeave,
  onEditOutline = null,
  editProblem = '',
}) {
  const cutting = session.stage === 'cutting';
  const { numbers, checks, flat, nest, sheet, fold, part } = station;
  const refusals = station.refusals;
  const none = !station.blanks.length;
  const many = station.parts.length > 1;
  const { scale } = animationScale(station.timeline.total);
  return (
    <StationShell
      station="cut"
      region="Laser station"
      shell={shell && { ...shell, disabled: shell.disabled || cutting }}
      leave={
        <button type="button" className="cad-shell-leave" disabled={cutting} onClick={onLeave}>
          Leave laser
        </button>
      }
      primary={
        cutting ? (
          <PrimaryButton onClick={onStop}>Stop</PrimaryButton>
        ) : (
          <PrimaryButton
            disabled={Boolean(refusals.length) || none}
            title={none ? NONE_ON_SHEET : undefined}
            onClick={onCut}
          >
            Cut
          </PrimaryButton>
        )
      }
    >
      <ol className="cad-mate-steps">
        <li className={!cutting && !session.cut ? 'is-current' : ''}>Choose the stock sheet and how many to cut.</li>
        <li className={cutting ? 'is-current' : ''}>
          Cut: the head pierces, then follows each contour, cut-outs first.
        </li>
        <li className={!cutting && session.cut ? 'is-current' : ''}>Take the blanks to the press brake.</li>
      </ol>
      <p className="cad-part-size" aria-label="On the laser">
        {part.name} · t {fmt(station.thickness)} {SHEET_STOCK[station.stock]?.name} · {LASERS['fiber-2kw'].name}
      </p>
      <fieldset className="cad-profile-fields" disabled={cutting}>
        <label className="cad-field">
          Stock sheet
          <select aria-label="Stock sheet" value={station.sheetKey} onChange={(e) => onSheet(e.target.value)}>
            {!station.sheetKnown && <option value={station.sheetKey}>{station.sheetKey} (not in this shop)</option>}
            {LASER_SHEET_KEYS.map((key) => (
              <option key={key} value={key}>
                {LASER_SHEETS[key].name}
              </option>
            ))}
          </select>
        </label>
        {!station.sheetKnown && (
          <p className="cad-help" role="note">
            The model names a sheet this shop does not stock; the {sheet.name} sheet is used.
          </p>
        )}
        <label className="cad-field">
          Quantity
          <NumericInput
            aria-label="Quantity"
            min="1"
            max={String(MAX_LASER_QUANTITY)}
            step="1"
            value={station.quantity}
            onCommit={(v) => onQuantity(Math.max(1, Math.min(MAX_LASER_QUANTITY, Math.round(v) || 1)))}
          />
        </label>
      </fieldset>
      {warning && <ProblemCard tone="warning" message={warning} />}
      {refusals.map((r, i) => (
        <ProblemCard key={`${r.code}-${i}`} message={r.message} />
      ))}
      {station.warnings.map((w, i) => (
        <ProblemCard key={`${w.code}-${i}`} tone="warning" message={w.message} />
      ))}
      {problem && <ProblemCard message={problem} />}
      {many && (
        // A job of several parts (§4.4): a row makes that part the lead.
        <>
          <h4>This cut</h4>
          <ul className="cad-laser-job" aria-label="This cut">
            {station.parts.map((row) => (
              <li key={row.partId}>
                <button
                  type="button"
                  className={`cad-job-row${row.lead ? ' is-selected' : ''}`}
                  aria-current={row.lead ? 'true' : undefined}
                  disabled={cutting || !onLead}
                  title={row.lead ? `${row.name} leads: Quantity and Edit outline act on it` : `Lead with ${row.name}`}
                  onClick={() => !row.lead && onLead(row.instanceId)}
                >
                  <OutlineThumb profile={row.profile} params={params} size={32} />
                  <span className="cad-job-row-text">
                    <strong>
                      {row.name}
                      {row.copies > 1 && <span className="cad-laser-copies"> × {row.copies}</span>}
                    </strong>
                    <small>
                      {fmt(row.flat.width)} × {fmt(row.flat.height)} mm
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <dl className="cad-shop-results" aria-label="Laser results">
        <Result label="Blank">
          {fmt(flat.width)} × {fmt(flat.height)} mm
        </Result>
        <Result label="Cut time" title="pierces × pierce time + cut length / speed (rapid moves not counted)">
          {many
            ? `${seconds(station.time)} for ${plural(station.job.length, 'blank')}`
            : `${seconds(numbers.perBlank)} per blank${numbers.quantity > 1 ? ` · ${seconds(numbers.time)} for ${numbers.quantity}` : ''}`}
        </Result>
        <Result label="Sheet use" title={`Blanks' area over the sheets' area; copies ${LASER_PART_GAP} mm apart`}>
          {nest.sheets.length ? `${fmt(nest.use * 100, 1)}% · ${plural(nest.sheets.length, 'sheet')}` : '—'}
        </Result>
        <Result
          label="On this sheet"
          title="This cut's blanks on the sheet shown, and those of other parts beside them"
        >
          {plural(station.blanks.length, 'blank')}
          {station.others.length ? ` · ${station.others.length} of other parts` : ''}
        </Result>
      </dl>
      {onDraw && station.shownUse < ROOM_BELOW && (
        <p className="cad-help cad-laser-room">
          There is room on this sheet: another part of {fmt(station.thickness)} mm{' '}
          {SHEET_STOCK[station.stock]?.name || station.stock} lands beside these.{' '}
          <button type="button" className="cad-link" disabled={cutting} onClick={onDraw}>
            Draw another part
          </button>
        </p>
      )}
      {onEditOutline && <EditOutline problem={editProblem} disabled={cutting} onEdit={onEditOutline} />}
      {!refusals.length && !station.warnings.length && (
        <p className="cad-help" role="status" aria-label="Laser checks">
          Ready to cut: every cut-out is at least t across and every web at least 0.5 t.
        </p>
      )}
      {notice && (
        <p className="cad-help cad-shop-notice" role="status">
          {notice}
        </p>
      )}
      {session.cut && !cutting && <p className="cad-help">Cut again to watch it once more.</p>}
      <p className="cad-help">The cut on the bed is {scaleWords(scale)}; the clock reads the machine&apos;s time.</p>
      <MachineNumbers station="cut">
        <dl className="cad-brake-readouts" aria-label="Laser readouts">
          <Readout label="Cut length" title="Every contour of one blank: the outline and each cut-out">
            {fmt(numbers.cutLength, 1)} mm
          </Readout>
          <Readout label="Pierces" title="One per contour">
            {numbers.pierces} × {fmt(numbers.pierceTime, 3)} s
          </Readout>
          <Readout label="Cutting speed" title="2 kW fiber, interpolated on the thickness for this stock">
            {fmt(numbers.speed, 2)} m/min
          </Readout>
          <Readout label="Kerf" title="The width the beam burns away (drawn wider on the bed)">
            {fmt(numbers.kerf)} mm
          </Readout>
          <Readout label="Narrowest web" title="Between two cut-outs, or from a cut-out to the outline">
            {checks.web ? `${fmt(checks.web.distance)} mm` : 'no cut-outs'}
          </Readout>
        </dl>
      </MachineNumbers>
      <h4>Etched marks</h4>
      <p className="cad-help">
        Etched lines on the blank (the laser marks them at low power, no cut): the bend lines show the brake operator
        where each hit goes. They do not change the folded part.
      </p>
      <p className="cad-part-size" aria-label="Etched marks">
        {station.marks.length ? plural(station.marks.length, 'etched line') : 'No etched lines'}
      </p>
      <div className="cad-inline">
        <button type="button" disabled={cutting || !fold.bends.length} onClick={onEtch}>
          Etch bend lines
        </button>
        <button type="button" disabled={cutting || !station.marks.length} onClick={onClearMarks}>
          Clear marks
        </button>
      </div>
    </StationShell>
  );
}

// Edit outline (docs/sketch-studio-outline-edit-sheet-nest.md §3.6): the
// blank's sketch back in the sketcher; the finish comes back to the laser.
function EditOutline({ problem = '', disabled = false, onEdit }) {
  return (
    <div className="cad-inline">
      <button
        type="button"
        disabled={disabled || Boolean(problem)}
        title={problem || 'Open the blank outline in the sketcher'}
        onClick={onEdit}
      >
        Edit outline
      </button>
    </div>
  );
}

/**
 * The laser could not set up on its part (the blank cannot be read): what is
 * wrong, Edit outline (a blank the fold refuses is fixed in its outline) and Leave.
 */
export function LaserError({ message, shell = null, onLeave, onEditOutline = null, editProblem = '' }) {
  return (
    <StationShell
      station="cut"
      region="Laser station"
      shell={shell}
      leave={
        <button type="button" className="cad-shell-leave" onClick={onLeave}>
          Leave laser
        </button>
      }
    >
      <ProblemCard message={message} />
      {onEditOutline && <EditOutline problem={editProblem} onEdit={onEditOutline} />}
    </StationShell>
  );
}

// The part of the sheet the bed shows: this cut's blanks with room round them
// ('close'), or the whole sheet.
function frameOf(station, mode) {
  const { sheet, plan } = station;
  if (mode === 'sheet' || !plan.length) return [-30, -(sheet.height + 30), sheet.width + 60, sheet.height + 60];
  const xs = plan.flatMap((c) => c.ring.map((p) => p[0])),
    ys = plan.flatMap((c) => c.ring.map((p) => p[1]));
  const x0 = Math.min(0, ...xs),
    y0 = Math.min(0, ...ys);
  const x1 = Math.max(...xs),
    y1 = Math.max(...ys);
  const pad = Math.max(x1 - x0, y1 - y0) * 0.12 + 12;
  return [x0 - pad, -(y1 + pad), x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
}

/**
 * The laser bed over the viewport. `station`: laserStation(); `session`: the
 * shopSession (`view` null: laserAutoView); onDone(token) when a cut's
 * animation ends; onView('close' | 'sheet'); onSheet(index) (the Sheet
 * switch, shown when the nest needs more than one sheet; none in a replay).
 * A replay (shop floor §8) gives the bed its own pace: `watch`, the seconds
 * the cut takes to watch, and `clock()`, the film's milliseconds into it (it
 * stands still while the film is paused).
 */
export function LaserBed({ station, session, onDone, onView, onSheet = null, watch = null, clock = null }) {
  const nodes = useRef({ cuts: [], pierces: [] });
  const { sheet, plan, timeline } = station;
  const mode = session.view || laserAutoView(station);
  const frame = useMemo(() => frameOf(station, mode), [station, mode]);
  const unit = Math.max(frame[2], frame[3]) / 120;
  const colour = SHEET_STOCK[station.stock]?.colour || '#a7afb3';
  const copies = station.blanks;
  // Each blank's contours (plan order), for its filled shape.
  const ringsOf = useMemo(() => {
    const out = new Map();
    for (const c of plan) {
      if (!out.has(c.instanceId)) out.set(c.instanceId, []);
      out.get(c.instanceId).push(c.ring);
    }
    return out;
  }, [plan]);
  // Cut-outs per blank, for the HUD's "cut-out k of n".
  const holesOf = useMemo(() => {
    const out = new Map();
    for (const c of plan) if (c.kind === 'hole') out.set(c.instanceId, (out.get(c.instanceId) || 0) + 1);
    return out;
  }, [plan]);
  const paced = animationScale(timeline.total);
  const duration = watch > 0 ? watch : paced.duration;
  const scale = watch > 0 ? timeline.total / watch : paced.scale;
  const run = session.stage === 'cutting' ? session.run : null;
  const cut = Boolean(session.cut);
  // The cut: the head and the HUD rewritten each frame, the kerf trace
  // growing along the contour being cut (its path rewritten to the head).
  useEffect(() => {
    if (!run) return undefined;
    const n = nodes.current;
    let frameId = 0,
      last = null;
    const started = performance.now();
    const draw = (now) => {
      const elapsed = clock ? clock() : now - started;
      // A paused replay: the head stays where it is, nothing is rewritten.
      if (clock && elapsed === last) {
        frameId = requestAnimationFrame(draw);
        return;
      }
      last = elapsed;
      const machine = Math.min(timeline.total, (elapsed / 1000) * scale);
      const at = headAt(timeline, machine);
      // Only the contours (and pierce marks) whose state changed are rewritten:
      // with fifty blanks on the sheet a frame touches one or two nodes.
      timeline.segments.forEach((segment, i) => {
        const done = i < at.index || at.phase === 'done';
        const state = done ? 'done' : i === at.index && at.phase === 'cut' ? `cut ${at.fraction}` : 'none';
        if (n.cuts[i] && n.cuts[i].dataset.cut !== state) {
          n.cuts[i].dataset.cut = state;
          n.cuts[i].setAttribute(
            'd',
            done
              ? ringPath(segment.contour.ring)
              : state === 'none'
                ? ''
                : linePath(partialRing(segment.contour.ring, at.fraction)),
          );
        }
        const pierced = i < at.index || (i === at.index && machine >= segment.start);
        if (n.pierces[i] && n.pierces[i].dataset.done !== String(pierced)) {
          n.pierces[i].dataset.done = String(pierced);
          n.pierces[i].classList.toggle('is-done', pierced);
        }
      });
      if (at.point && n.head) {
        n.head.setAttribute('transform', `translate(${fmt(at.point[0], 3)} ${fmt(-at.point[1], 3)})`);
        n.head.classList.toggle('is-piercing', at.phase === 'pierce');
      }
      const contour = at.index >= 0 ? timeline.segments[at.index].contour : null;
      if (n.doing)
        n.doing.textContent =
          at.phase === 'done'
            ? 'Cut done'
            : `${at.phase === 'pierce' ? 'Piercing' : 'Cutting'} ${contourName(contour, holesOf.get(contour.instanceId) || 0)}${copies.length > 1 ? ` · blank ${contour.copy} of ${copies.length}` : ''}`;
      if (n.head && at.point && n.where)
        n.where.textContent = `Head at X ${fmt(at.point[0], 1)} · Y ${fmt(at.point[1], 1)} mm on the sheet`;
      if (n.clock) n.clock.textContent = `${fmt(machine, 2)} s of ${fmt(timeline.total, 2)} s`;
      if (machine >= timeline.total) {
        onDone(run.token);
        return;
      }
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
    // One loop per cut (its token); the station it cuts is the one it started on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.token]);
  const keep = (key, i) => (node) => {
    nodes.current[key][i] = node;
  };
  const keepOne = (key) => (node) => {
    nodes.current[key] = node;
  };
  const parked = cut && plan.length ? plan.at(-1).pierce : [0, 0];
  const sheets = station.nest?.sheets.length || 0;
  // One blank's lines carry the label (the marks are its part's, on every copy).
  const labelledId = copies.find((b) => b.lead && b.marks.length)?.instanceId;
  return (
    <figure className="cad-laser-bed" aria-label="Laser bed" data-state={run ? 'cutting' : cut ? 'cut' : 'ready'}>
      <div className="cad-laser-hud" aria-label="Laser head">
        <strong ref={keepOne('doing')}>
          {run
            ? 'Cutting'
            : cut
              ? 'Cut done'
              : plan.length
                ? 'Ready: the head waits at the sheet corner'
                : 'Nothing of this cut on this sheet'}
        </strong>
        <span ref={keepOne('where')}>
          Head at X {fmt(parked[0], 1)} · Y {fmt(parked[1], 1)} mm on the sheet
        </span>
        <span>
          Clock{' '}
          <b ref={keepOne('clock')} aria-label="Laser clock">
            {cut ? `${fmt(timeline.total, 2)} s of ${fmt(timeline.total, 2)} s` : `0 s of ${fmt(timeline.total, 2)} s`}
          </b>{' '}
          (machine time; {scaleWords(scale)}, {fmt(duration, 1)} s to watch)
        </span>
      </div>
      <div className="cad-laser-switches">
        {/* SN-1 §4.4: a nest of several sheets, one shown at a time. */}
        {onSheet && sheets > 1 && (
          <span className="cad-segmented cad-laser-zoom" role="group" aria-label="Sheet">
            {Array.from({ length: sheets }, (_, index) => (
              <button
                key={index}
                type="button"
                aria-pressed={station.sheetIndex === index}
                disabled={Boolean(run)}
                onClick={() => onSheet(index)}
              >
                Sheet {index + 1}
              </button>
            ))}
          </span>
        )}
        <span className="cad-segmented cad-laser-zoom" role="group" aria-label="Bed view">
          {[
            ['close', 'Close-up'],
            ['sheet', 'Whole sheet'],
          ].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={mode === key} onClick={() => onView(key)}>
              {label}
            </button>
          ))}
        </span>
      </div>
      <svg
        viewBox={frame.map((v) => fmt(v, 3)).join(' ')}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Stock sheet"
      >
        <rect
          className="cad-laser-sheet"
          x={0}
          y={-sheet.height}
          width={sheet.width}
          height={sheet.height}
          fill={colour}
        />
        <text className="cad-laser-label" x={4} y={-sheet.height + unit * 2.4} fontSize={unit * 1.8}>
          {sheet.name}
          {sheets > 1 ? ` · sheet ${station.sheetIndex + 1} of ${sheets}` : ''} · t {fmt(station.thickness)}{' '}
          {SHEET_STOCK[station.stock]?.name}
        </text>
        {/* The sheet's other blanks (§4.4): cut metal with its cut-outs, or (a replay) the programmed path. */}
        {(station.others || []).map((other) => (
          <path
            key={`other-${other.instanceId}`}
            className={`cad-laser-other${other.cut ? ' is-cut' : ''}`}
            aria-label={`Blank of ${other.name}`}
            d={other.rings.map(ringPath).join(' ')}
            fillRule="evenodd"
          >
            <title>{other.name}</title>
          </path>
        ))}
        {copies.map((blank) => (
          <path
            key={`blank-${blank.instanceId}`}
            className={`cad-laser-blank${blank.lead ? ' is-lead' : ''}`}
            aria-label={`Blank ${blank.copy}`}
            d={(ringsOf.get(blank.instanceId) || []).map(ringPath).join(' ')}
            fillRule="evenodd"
          >
            <title>{blank.name}</title>
          </path>
        ))}
        {copies.map((blank) =>
          blank.marks.map((mark) => (
            <line
              key={`mark-${blank.instanceId}-${mark.id}`}
              className="cad-laser-mark"
              aria-label={blank.instanceId === labelledId ? 'Etched line' : undefined}
              x1={Number(mark.a[0]) + blank.offset[0]}
              y1={-(Number(mark.a[1]) + blank.offset[1])}
              x2={Number(mark.b[0]) + blank.offset[0]}
              y2={-(Number(mark.b[1]) + blank.offset[1])}
            />
          )),
        )}
        {plan.map((contour, i) => (
          <path key={`path-${i}`} className="cad-laser-path" d={ringPath(contour.ring)} />
        ))}
        <g key={`run-${session.runKey || 0}`}>
          {plan.map((contour, i) => (
            <path
              key={`cut-${i}`}
              ref={keep('cuts', i)}
              className="cad-laser-cut"
              d={cut ? ringPath(contour.ring) : ''}
            />
          ))}
          {plan.map((contour, i) => (
            <circle
              key={`pierce-${i}`}
              ref={keep('pierces', i)}
              className={`cad-laser-pierce ${cut ? 'is-done' : ''}`}
              cx={contour.pierce[0]}
              cy={-contour.pierce[1]}
              r={unit * 0.45}
            />
          ))}
          {/* A sheet with none of this cut's blanks has no head (§4.4). */}
          {plan.length > 0 && (
            <g
              ref={keepOne('head')}
              className="cad-laser-head"
              transform={`translate(${fmt(parked[0], 3)} ${fmt(-parked[1], 3)})`}
            >
              <circle r={unit * 1.4} className="cad-laser-glow" />
              <path
                d={`M ${-unit * 2.2} 0 H ${unit * 2.2} M 0 ${-unit * 2.2} V ${unit * 2.2}`}
                className="cad-laser-cross"
              />
              <circle r={unit * 0.35} className="cad-laser-spot" />
            </g>
          )}
        </g>
      </svg>
      <figcaption className="cad-laser-legend">
        <span className="is-path">Programmed path</span>
        <span className="is-cut">Cut (drawn 2.5 px wide; true kerf {fmt(station.numbers.kerf)} mm)</span>
        <span className="is-pierce">Pierce</span>
        <span className="is-mark">Etched</span>
        <span className="is-other">Already cut</span>
      </figcaption>
    </figure>
  );
}
