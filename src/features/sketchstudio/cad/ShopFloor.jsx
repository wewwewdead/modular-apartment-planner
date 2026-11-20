// The shop floor (docs/sketch-studio-shop-floor.md §4, SF-1): the route bar
// that replaces the Shop ribbon (stations in shop order, each with where the
// current product stands, and a More menu), the job board in the left pane,
// the station shell every station panel sits in (header, body, Back · Leave ·
// Next), problem cards with their one-click fixes, the Machine numbers
// disclosure, the station gate (pick a part, or what is missing and the
// button that makes it) and the Draw station. Progress and entry come from
// shopRoute.js; these components only show it and call back.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ROUTE, routeNeighbour, routeStation } from './shopRoute.js';
import { polygonBounds, nestProfiles, profilePolygon } from './sheetMetal.js';
import { entityPolyline, profileToEntities } from './sketchProfile.js';
import { DEFAULT_HEAL_GAP_MM, collectDraftingProfiles } from './draftingProfiles.js';
import NumericInput from '../components/NumericInput.jsx';

const NONE = [];
const STATUS_WORDS = { done: 'done', partial: 'part done', todo: 'not yet', none: 'not needed' };
const fmt = (value) => (Number.isFinite(value) ? Number(value.toFixed(1)).toString() : '—');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Done (filled), part done (half), not yet (hollow) or not needed (a dash):
 * shape as well as colour.
 */
export function RouteMark({ status = 'todo' }) {
  if (status === 'none')
    return (
      <svg className="cad-route-mark is-none" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M1.5 5h7" />
      </svg>
    );
  return (
    <svg className={`cad-route-mark is-${status}`} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="4" />
      {status === 'partial' && <path d="M5 1a4 4 0 0 1 0 8z" />}
    </svg>
  );
}

// ------------------------------------------------------------ the route bar (§4.1)

/**
 * `progress`: routeProgress(); `open`: the open station's key; `disabled`:
 * every station off (a non-shop tool, busy, a stroke or a cut); `subject`: the
 * current product's name; `more`: [{ label, title, disabled, run }];
 * `Icon`: the workspace's ribbon icon. `replay` (§8): { disabled, title,
 * playing, run } — the Replay button at the end of the route (End replay
 * while the film runs).
 */
export function ShopRoute({
  progress,
  open = null,
  disabled = false,
  subject = '',
  more = NONE,
  replay = null,
  onStation,
  Icon,
}) {
  const [menu, setMenu] = useState(null);
  const moreButton = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  // The menu is fixed-positioned under its button: the ribbon scrolls sideways and would clip it.
  const toggle = () => {
    if (menu) return setMenu(null);
    const box = moreButton.current.getBoundingClientRect();
    setMenu({ top: box.bottom + 4, right: Math.max(8, window.innerWidth - box.right) });
  };
  useEffect(() => {
    if (!menu) return undefined;
    const away = (event) => {
      if (!menuRef.current?.contains(event.target) && !moreButton.current?.contains(event.target)) setMenu(null);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [menu]);
  useLayoutEffect(() => {
    if (menu) menuRef.current?.querySelector('button:not(:disabled)')?.focus();
  }, [menu]);
  return (
    <nav className="cad-route" aria-label="Shop route">
      {subject && (
        <p className="cad-route-subject" title={`The product the route shows: ${subject}`}>
          <small>Product</small>
          <strong>{subject}</strong>
        </p>
      )}
      <ol className="cad-route-stations">
        {ROUTE.map((station) => {
          const mark = progress[station.key];
          const current = open === station.key;
          const next = !current && progress.next === station.key;
          return (
            <li key={station.key}>
              {station.number > 1 && (
                <span className="cad-route-chevron" aria-hidden="true">
                  ›
                </span>
              )}
              <button
                type="button"
                className={`cad-route-station is-${mark.status}${next ? ' is-next' : ''}`}
                aria-label={station.name}
                aria-description={`${mark.text === '—' ? STATUS_WORDS[mark.status] : mark.text}${next ? ' · next step' : ''}`}
                aria-current={current ? 'step' : undefined}
                disabled={disabled}
                title={next ? `${station.name} — the next step` : station.name}
                onClick={() => !current && onStation(station.key)}
              >
                <span className="cad-route-number" aria-hidden="true">
                  {station.number}
                </span>
                <Icon name={station.icon} />
                <span className="cad-route-text" aria-hidden="true">
                  <span className="cad-route-name">{station.name}</span>
                  <span className="cad-route-status">
                    <RouteMark status={mark.status} />
                    {mark.text === '—' ? STATUS_WORDS[mark.status] : mark.text}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {replay && (
        <button
          type="button"
          className={`cad-route-replay${replay.playing ? ' is-playing' : ''}`}
          aria-description={replay.title}
          disabled={replay.disabled}
          title={replay.title}
          onClick={replay.run}
        >
          <svg className="cad-route-replay-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            {replay.playing ? <rect x="3" y="3" width="8" height="8" rx="1" /> : <path d="M4 2.5v9l7.5-4.5z" />}
          </svg>
          {replay.playing ? 'End replay' : 'Replay'}
        </button>
      )}
      <button
        ref={moreButton}
        type="button"
        className="cad-route-more"
        aria-haspopup="true"
        aria-expanded={Boolean(menu)}
        aria-controls={menu ? menuId : undefined}
        onClick={toggle}
      >
        More <span aria-hidden="true">▾</span>
      </button>
      {menu && (
        <div
          ref={menuRef}
          id={menuId}
          className="cad-route-menu"
          role="group"
          aria-label="More shop commands"
          style={{ top: menu.top, right: menu.right }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            // Before the stations' own Esc (they skip a handled key).
            event.preventDefault();
            setMenu(null);
            moreButton.current?.focus();
          }}
        >
          {more.map((item) => (
            <button
              key={item.label}
              type="button"
              title={item.title}
              disabled={item.disabled}
              onClick={() => {
                setMenu(null);
                item.run();
              }}
            >
              {item.icon && <Icon name={item.icon} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}

// ------------------------------------------------------------ outline thumbnails

// One path per blank profile (and parameter set), kept while the sketch is.
const thumbs = new WeakMap();
const ringPath = (ring) => `M ${ring.map(([x, y]) => `${fmt(x)} ${fmt(-y)}`).join(' L ')} Z`;
function thumbOf(profile, params) {
  if (!profile || typeof profile !== 'object') return null;
  const hit = thumbs.get(profile);
  if (hit && hit.params === params) return hit.value;
  let value = null;
  try {
    const { outer, holes } = profilePolygon(profile, params);
    const [[x0, y0], [x1, y1]] = polygonBounds(outer);
    const pad = Math.max(x1 - x0, y1 - y0) * 0.06 || 1;
    value = {
      d: [outer, ...holes].map(ringPath).join(' '),
      viewBox: [x0 - pad, -(y1 + pad), x1 - x0 + 2 * pad, y1 - y0 + 2 * pad].map(fmt).join(' '),
    };
  } catch {
    value = null;
  }
  thumbs.set(profile, { params, value });
  return value;
}
// An outline that does not make a blank (docs/sketch-studio-outline-edit-sheet-nest.md
// §3.2): the lines it was drawn with, kept while the sketch is.
const lineThumbs = new WeakMap();
function linesOf(sketch) {
  if (!sketch) return null;
  if (lineThumbs.has(sketch)) return lineThumbs.get(sketch);
  const drawn = (sketch.entities?.length ? sketch.entities : profileToEntities(sketch.profile) || []).filter(
    (e) => !e.construction,
  );
  const rings = drawn.map((e) => entityPolyline(e, 32)).filter((r) => r.length > 1);
  let value = null;
  if (rings.length) {
    const [[x0, y0], [x1, y1]] = polygonBounds(rings.flat());
    const pad = Math.max(x1 - x0, y1 - y0) * 0.08 || 1;
    value = {
      d: rings.map((ring) => `M ${ring.map(([x, y]) => `${fmt(x)} ${fmt(-y)}`).join(' L ')}`).join(' '),
      viewBox: [x0 - pad, -(y1 + pad), x1 - x0 + 2 * pad, y1 - y0 + 2 * pad].map(fmt).join(' '),
    };
  }
  lineThumbs.set(sketch, value);
  return value;
}
/** The flat outline of a blank, `size` px square; or, with `sketch`, the open lines it was drawn with. */
export function OutlineThumb({ profile, params = null, size = 40, sketch = null }) {
  const thumb = sketch ? linesOf(sketch) : thumbOf(profile, params || {});
  return (
    <svg
      className="cad-outline-thumb"
      width={size}
      height={size}
      viewBox={thumb?.viewBox || '0 0 1 1'}
      aria-hidden="true"
    >
      {thumb && (
        <path
          className={sketch ? 'is-open' : undefined}
          d={thumb.d}
          fillRule="evenodd"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

// ------------------------------------------------------------ the job board (§4.2)

/** One pip per station, with the route bar's marks. */
function Pips({ progress }) {
  return (
    <span
      className="cad-job-pips"
      role="img"
      aria-label={ROUTE.map((s) => `${s.name} ${STATUS_WORDS[progress[s.key].status]}`).join(', ')}
    >
      {ROUTE.map((s) => (
        <RouteMark key={s.key} status={progress[s.key].status} />
      ))}
    </span>
  );
}

/**
 * `board`: [{ id, name, progress (routeProgress), parts: [{ instanceId, name,
 * profile, progress (partProgress) }], others }]; `selected`: the subject
 * part; `inert`: the open station picks in the viewport (a reason, or '');
 * `disabled`: rows off (a non-shop tool, a stroke or a cut).
 */
export function JobBoard({ board, params, selected = null, inert = '', disabled = false, onRow, onTree, onDraw }) {
  if (!board.length)
    return (
      <div className="cad-job-board" aria-label="Job board" role="region">
        <p className="cad-job-empty">No parts yet. Every part starts as a flat outline.</p>
        <button type="button" className="cad-primary cad-shop-go" onClick={onDraw}>
          Draw the first part
        </button>
      </div>
    );
  return (
    <div className="cad-job-board" aria-label="Job board" role="region">
      {board.map((product) => (
        <section key={product.id} className="cad-job-card" aria-label={`Product ${product.name}`}>
          <header>
            <strong>{product.name}</strong>
            <Pips progress={product.progress} />
          </header>
          <ul className="cad-job-rows">
            {product.parts.map((row) => (
              <li key={row.instanceId}>
                <button
                  type="button"
                  className={`cad-job-row${selected === row.instanceId ? ' is-selected' : ''}`}
                  aria-current={selected === row.instanceId ? 'true' : undefined}
                  aria-disabled={inert ? 'true' : undefined}
                  disabled={disabled}
                  title={inert || `Work on ${row.name}`}
                  onClick={() => !inert && onRow(row.instanceId)}
                >
                  <OutlineThumb profile={row.profile} params={params} />
                  <span className="cad-job-row-text">
                    <strong>{row.name}</strong>
                    <small>{row.progress.blank}</small>
                    <span className="cad-job-row-route">
                      <Pips progress={row.progress} />
                      <span className="cad-job-next">
                        {row.progress.next ? `Next: ${routeStation(row.progress.next).name}` : 'Route done'}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {product.others > 0 && (
            <button type="button" className="cad-link cad-job-others" onClick={onTree}>
              {product.parts.length ? `${plural(product.others, 'other part')}` : plural(product.others, 'part')} — see
              Tree
            </button>
          )}
        </section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ the station shell (§4.6)

/**
 * Every station panel: "3 · Bend" and the subject, the station's body, then
 * the pinned footer: the station's primary button (`primary`), ← Back · the
 * station's Leave button · Next →. The footer sticks to the foot of the
 * pane, so the primary button is always in view however long the body is
 * (SF-1 audit: at 1366 × 768 it was below the fold). `region`: the panel's
 * region name (kept from SM-1 … SM-4); `shell`: { subject, onBack, onNext,
 * disabled, nextReady } from the workspace (absent in a panel's own tests).
 * `heading` ({ number, name }) names a panel that is not a route station
 * (the replay, §8); it has no Back / Next. `shell.strip`: what rides under
 * the head in every state of the station (the press brake's bend queue,
 * docs/sketch-studio-outline-edit-sheet-nest.md §7.2).
 */
export function StationShell({
  station,
  region,
  shell = null,
  leave = null,
  primary = null,
  className = '',
  heading = null,
  children,
}) {
  const entry = heading || routeStation(station);
  const back = heading ? null : routeNeighbour(station, -1),
    next = heading ? null : routeNeighbour(station, 1);
  return (
    <section className={`cad-shop-panel cad-station cad-shell ${className}`} aria-label={region}>
      <header className="cad-shell-head">
        <h3 aria-label={`${entry.number} · ${entry.name}`}>
          <span className="cad-shell-number">{entry.number}</span>
          <span>{entry.name}</span>
        </h3>
        {shell?.subject && <p className="cad-shell-subject">{shell.subject}</p>}
      </header>
      {shell?.strip || null}
      {children}
      {(shell?.onBack || shell?.onNext || leave || primary) && (
        <footer className={`cad-shell-foot${primary ? ' has-primary' : ''}`}>
          {primary && <div className="cad-shell-primary">{primary}</div>}
          {back && shell?.onBack && (
            <button type="button" className="cad-shell-back" disabled={shell.disabled} onClick={shell.onBack}>
              <span aria-hidden="true">←</span> Back: {back.name}
            </button>
          )}
          {leave}
          {next && shell?.onNext && (
            <button
              type="button"
              className={`cad-shell-next${shell.nextReady ? ' is-ready' : ''}`}
              disabled={shell.disabled}
              onClick={shell.onNext}
            >
              Next: {next.name} <span aria-hidden="true">→</span>
            </button>
          )}
        </footer>
      )}
    </section>
  );
}

// A refusal or warning message as "what is wrong" + "the remedy": its first
// sentence, then the rest (decimal points are not sentence ends).
/** A station message as [what is wrong, the remedy]: split at the first sentence break before a capital. */
export const splitMessage = (message) => {
  const at = String(message).search(/[.:;] (?=[A-Z])/);
  return at < 0 ? [String(message), ''] : [message.slice(0, at + 1), message.slice(at + 2)];
};
/**
 * A problem the station found: `tone` 'refusal' (role alert) or 'warning'
 * (role note); `fix`: { label } with `onFix` — the one field that cures it.
 */
export function ProblemCard({ tone = 'refusal', message, fix = null, onFix = null, label, children }) {
  const [what, remedy] = splitMessage(message);
  return (
    <div className={`cad-problem is-${tone}`}>
      <p role={tone === 'refusal' ? 'alert' : 'note'} aria-label={label} className="cad-problem-text">
        <strong>{what}</strong>
        {remedy ? ' ' : ''}
        {remedy}
      </p>
      {children}
      {fix && onFix && (
        <button type="button" className="cad-problem-fix" onClick={onFix}>
          {fix.label}
        </button>
      )}
    </div>
  );
}

const numbersKey = (station) => `cad-shop-numbers:${station}`;
/** The machine's numbers, one click away: closed by default, its state per station remembered. */
export function MachineNumbers({ station, label = 'Machine numbers', children }) {
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(numbersKey(station)) === 'open';
    } catch {
      return false;
    }
  });
  return (
    <details
      className="cad-shop-numbers"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next === open) return;
        setOpen(next);
        try {
          window.localStorage.setItem(numbersKey(station), next ? 'open' : 'closed');
        } catch {
          // Storage off (a private window): the disclosure still works for this visit.
        }
      }}
    >
      <summary>{label}</summary>
      {children}
    </details>
  );
}

/** What a station made, on show: larger figures than the machine's numbers. */
export function Result({ label, title, children }) {
  return (
    <div className="cad-shop-result" title={title}>
      <dt>{label}</dt>
      <dd aria-label={label}>{children}</dd>
    </div>
  );
}
/** A machine number (inside Machine numbers): an engraved readout. */
export function Readout({ label, children, title }) {
  return (
    <div className="cad-brake-readout" title={title}>
      <dt>{label}</dt>
      <dd aria-label={label}>{children}</dd>
    </div>
  );
}
/** The station's primary action: full width, 40 px. */
export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button type="button" className={`cad-primary cad-shop-primary ${className}`} {...props}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------ the gate (§4.3)

/**
 * A station that cannot open by itself. `gate`: { station, kind: 'pick',
 * rows: [{ instanceId, name, state, profile, copies? }] } (one click
 * chooses; Bend's rows are per part, "× copies", §7.4), {
 * kind: 'blocked', message, go, goLabel } (what is missing and the button
 * that makes it) or { kind: 'waiting' } (opens once the model is current).
 */
export function StationGate({ gate, params, shell, onPick, onGo }) {
  const entry = routeStation(gate.station);
  return (
    <StationShell
      station={gate.station}
      region={entry.region}
      shell={shell}
      className="cad-gate"
      primary={
        gate.kind === 'blocked' && gate.go ? (
          <PrimaryButton onClick={onGo}>
            {gate.goLabel || `Go to ${routeStation(gate.go)?.name || gate.go}`}
          </PrimaryButton>
        ) : null
      }
    >
      {gate.kind === 'pick' ? (
        <>
          <p className="cad-shop-lead">
            {gate.lead || `Which part goes on the ${entry.key === 'cut' ? 'laser' : 'press brake'}?`}
          </p>
          <ul className="cad-gate-parts" aria-label="Choose a part">
            {gate.rows.map((row) => (
              <li key={row.instanceId}>
                <button type="button" className="cad-job-row" onClick={() => onPick(row.instanceId)}>
                  <OutlineThumb profile={row.profile} params={params} />
                  <span className="cad-job-row-text">
                    <strong>
                      {row.name}
                      {row.copies > 1 && <span className="cad-laser-copies"> × {row.copies}</span>}
                    </strong>
                    <small>{row.state}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : gate.kind === 'waiting' ? (
        <p className="cad-shop-lead" role="status">
          The model is rebuilding: the {entry.name.toLowerCase()} station opens as soon as it is current.
        </p>
      ) : (
        <div className="cad-gate-blocked">
          <p className="cad-shop-lead" role="status">
            {gate.message}
          </p>
        </div>
      )}
    </StationShell>
  );
}

// ------------------------------------------------------------ the bend queue (BQ-1)

const QUEUE_MARKS = { flat: 'todo', bent: 'done', finished: 'done', problem: 'todo' };
/**
 * The press brake's queue (docs/sketch-studio-outline-edit-sheet-nest.md
 * §7.2): every sheet-metal part, one row per part (its copies fold with it),
 * under the shell's head in every state of Bend that has a part. `rows`:
 * shopRoute.js bendQueue (shown from two rows); `current`: the part on the
 * brake (its partId); `disabled`: a stroke runs (or the route waits).
 * onRow(instanceId): Previous part, Next part and a row all go through the
 * route (goStation), so every rule of the station's entry holds.
 */
export function BendQueue({ rows = NONE, current = null, params = null, disabled = false, onRow }) {
  const list = useRef(null);
  // The current row brought into view inside the list when it changes; only
  // the list scrolls (the pane stays where the operator left it).
  useLayoutEffect(() => {
    const box = list.current;
    const row = box?.querySelector('[aria-current="true"]')?.closest('li');
    if (!row) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  }, [current, rows.length]);
  if (rows.length < 2) return null;
  const at = rows.findIndex((r) => r.partId === current);
  const previous = at > 0 ? rows[at - 1] : null,
    next = rows[at + 1] || null;
  const bent = rows.filter((r) => r.state === 'bent' || r.state === 'finished').length;
  // The accent goes to Next once this part has a bend and the next one waits flat.
  const nextReady = Boolean(rows[at]?.bends) && next?.state === 'flat';
  return (
    <section className="cad-bend-queue" aria-label="Bend queue">
      <div className="cad-bend-queue-head">
        <h4>Parts to bend</h4>
        <span className="cad-bend-queue-count" role="status" aria-label="Bend progress">
          {bent === rows.length ? 'Every part is bent.' : `${bent} of ${rows.length} bent`}
        </span>
      </div>
      <div className="cad-bend-queue-steps">
        <button
          type="button"
          aria-label="Previous part"
          disabled={disabled || !previous}
          title={previous ? `Put ${previous.name} on the brake` : 'This is the first part'}
          onClick={() => previous && onRow(previous.instanceId)}
        >
          <span aria-hidden="true">‹</span> Previous part
        </button>
        <button
          type="button"
          aria-label="Next part"
          className={nextReady ? 'is-ready' : ''}
          disabled={disabled || !next}
          title={next ? `Put ${next.name} on the brake` : 'This is the last part'}
          onClick={() => next && onRow(next.instanceId)}
        >
          Next part <span aria-hidden="true">›</span>
        </button>
      </div>
      <ul ref={list} className="cad-bend-queue-rows" aria-label="Parts to bend">
        {rows.map((row) => {
          const here = row.partId === current;
          return (
            <li key={row.partId}>
              <button
                type="button"
                className={`cad-job-row${here ? ' is-selected' : ''}`}
                aria-current={here ? 'true' : undefined}
                disabled={disabled}
                title={here ? `${row.name} is on the brake` : `Put ${row.name} on the brake`}
                onClick={() => !here && onRow(row.instanceId)}
              >
                <OutlineThumb profile={row.profile} params={params} size={28} />
                <span className="cad-job-row-text">
                  <strong>
                    {row.name}
                    {row.copies > 1 && <span className="cad-laser-copies"> × {row.copies}</span>}
                  </strong>
                  <small className={row.state === 'problem' ? 'is-problem' : undefined}>{row.text}</small>
                </span>
                <RouteMark status={QUEUE_MARKS[row.state] || 'todo'} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------ the Draw station (§4.4)

/** The 2D drawing's closed profiles as blanks (nestProfiles: an inner loop is a cut-out), with what was skipped. */
export function drawingBlanks(entities = NONE, { scope = 'all', selectedIds = NONE, layers = NONE } = {}) {
  const scoped = scope === 'selected' ? entities.filter((e) => selectedIds.includes(e.id)) : entities;
  const collected = collectDraftingProfiles(scoped, { healGapMm: DEFAULT_HEAL_GAP_MM, layers });
  return { ...nestProfiles(collected.candidates), rejected: collected.rejected };
}

function Tile({ id, title, text, expanded, disabled = false, onClick, children }) {
  return (
    <div className={`cad-draw-tile${expanded ? ' is-open' : ''}`}>
      <button
        type="button"
        className="cad-draw-tile-head"
        aria-expanded={children ? expanded : undefined}
        aria-controls={children ? id : undefined}
        disabled={disabled}
        onClick={onClick}
      >
        <strong>{title}</strong>
        <span>{text}</span>
      </button>
      {expanded && children && <div id={id}>{children}</div>}
    </div>
  );
}

/**
 * Draw (panel `shop-draw`): "What are you making?" — a rectangle, an outline
 * drawn in the sketcher, or the 2D drawing's profiles — and the outlines
 * drawn so far: those ready to cut, then those not (with why), each with Edit
 * and Delete (docs/sketch-studio-outline-edit-sheet-nest.md §3.2).
 * `outlines`: shopOutlines(); `chosen`: a sketch just drawn or edited from a
 * shop station; `notice`: what that finish did (several outlines split).
 * onEdit(id) reopens one in the sketcher, onDelete(id) removes it.
 * onOutline(outline) goes to Cut with { kind: 'rectangle', width,
 * height } | { kind: 'sketch', sketchId } | { kind: 'drawing', blank } | {
 * kind: 'batch', items } (the drawing's Cut all, docs/sketch-studio-outline-edit-sheet-nest.md
 * §4.8) | { kind: 'pick', selected } (Cut all outlines: Cut's picker with every
 * ready outline selected, docs/sketch-studio-cut-pick.md §4.1);
 * onSketch() starts the sketcher on XY at the origin. SF-3 (§6.3): the
 * Flanged panel tile holds `panelForm` (the workspace's PanelMakerForm);
 * onPanelTile(open) says when it opens or closes (its preview shows meanwhile);
 * `panelPrimary`, its endings, sits in the pinned footer while it is open.
 */
export function DrawPanel({
  model,
  params,
  outlines = NONE,
  chosen = null,
  notice = '',
  entities = NONE,
  layers = NONE,
  selectedEntityIds = NONE,
  shell,
  onOutline,
  onSketch,
  onEdit = null,
  onDelete = null,
  panelForm = null,
  panelPrimary = null,
  panelOpen = false,
  onPanelTile = null,
}) {
  const [chosenTile, setOpen] = useState(null);
  const open = panelOpen ? 'panel' : chosenTile === 'panel' ? null : chosenTile;
  const [size, setSize] = useState({ width: 100, height: 60 });
  const [scope, setScope] = useState(selectedEntityIds.length ? 'selected' : 'all');
  const drawing = useMemo(
    () =>
      open === 'drawing'
        ? drawingBlanks(entities, { scope, selectedIds: selectedEntityIds, layers })
        : { blanks: NONE, skipped: NONE, rejected: NONE },
    [open, entities, scope, selectedEntityIds, layers],
  );
  const sketchOf = (id) => model.sketches.find((s) => s.id === id);
  const ready = outlines.filter((o) => o.ready),
    notReady = outlines.filter((o) => !o.ready);
  // Back from the sketcher, the chosen row is brought into view (below the
  // tiles it is off the pane at 1366 × 768): once per row and list it is in,
  // never on a re-render, so it does not fight the user's own scrolling.
  const lists = useRef(null);
  const chosenAt = chosen ? `${chosen}:${ready.some((o) => o.id === chosen)}` : '';
  useEffect(() => {
    if (chosenAt) lists.current?.querySelector('li.is-chosen')?.scrollIntoView?.({ block: 'nearest' });
  }, [chosenAt]);
  // Every outline can be reopened in the sketcher, or deleted (one commit; Undo brings it back).
  const outlineTools = (outline) => (
    <>
      <button
        type="button"
        aria-label={`Edit ${outline.name}`}
        disabled={Boolean(outline.editProblem) || !onEdit}
        title={outline.editProblem || `Open ${outline.name} in the sketcher`}
        onClick={() => onEdit(outline.id)}
      >
        Edit
      </button>
      <button
        type="button"
        className="cad-danger-inline"
        aria-label={`Delete ${outline.name}`}
        disabled={!onDelete}
        onClick={() => onDelete(outline.id)}
      >
        Delete
      </button>
    </>
  );
  const toggle = (key) => {
    const next = open === key ? null : key;
    setOpen(next);
    onPanelTile?.(next === 'panel');
  };
  return (
    <StationShell
      station="draw"
      region="Draw"
      shell={shell}
      className="cad-draw"
      primary={open === 'panel' ? panelPrimary : null}
    >
      <p className="cad-shop-lead">What are you making? Every part starts as the flat outline the laser cuts.</p>
      <div className="cad-draw-tiles">
        <Tile
          id="cad-draw-rectangle"
          title="Rectangle"
          text="A plain W × H blank, straight to Cut."
          expanded={open === 'rectangle'}
          onClick={() => toggle('rectangle')}
        >
          <div className="cad-inline">
            {['width', 'height'].map((key) => (
              <label className="cad-field" key={key}>
                {key === 'width' ? 'Width W (mm)' : 'Height H (mm)'}
                <NumericInput
                  aria-label={key === 'width' ? 'Width W (mm)' : 'Height H (mm)'}
                  min="0.1"
                  step="1"
                  value={size[key]}
                  onCommit={(v) => v > 0 && setSize((old) => ({ ...old, [key]: v }))}
                />
              </label>
            ))}
          </div>
          <PrimaryButton onClick={() => onOutline({ kind: 'rectangle', width: size.width, height: size.height })}>
            Cut this rectangle <span aria-hidden="true">→</span>
          </PrimaryButton>
        </Tile>
        {onPanelTile && (
          <Tile
            id="cad-draw-panel"
            title="Flanged panel"
            text="A face with return flanges, creases and windows: the blank is laid out for you, bend allowances included."
            expanded={open === 'panel'}
            onClick={() => toggle('panel')}
          >
            {panelForm}
          </Tile>
        )}
        <Tile
          id="cad-draw-sketch"
          title="Draw the outline"
          text="Sketch the blank on the XY plane: its outline, then circles or shapes inside for holes."
          onClick={onSketch}
        />
        <Tile
          id="cad-draw-drawing"
          title="From the 2D drawing"
          text={
            entities.length
              ? 'Use the closed profiles of the 2D drafting view.'
              : 'No 2D drawing yet: draw one in 2D drafting (top right).'
          }
          disabled={!entities.length}
          expanded={open === 'drawing'}
          onClick={() => toggle('drawing')}
        >
          <label className="cad-field">
            Drawing profiles
            <select aria-label="Drawing profiles" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">Whole drawing</option>
              <option value="selected" disabled={!selectedEntityIds.length}>
                Drafting selection
              </option>
            </select>
          </label>
          <p className="cad-help">A closed outline inside another becomes its cut-out.</p>
          {!drawing.blanks.length && <p className="cad-help">No closed outline in the drawing.</p>}
          <ul className="cad-draw-outlines" aria-label="Drawing blanks">
            {drawing.blanks.map((blank) => (
              <li key={blank.id}>
                <OutlineThumb profile={blank.profile} params={params} />
                <span>
                  <strong>{blank.name}</strong>
                  <small>{blank.holes ? plural(blank.holes, 'cut-out') : 'no cut-outs'}</small>
                </span>
                <button
                  type="button"
                  aria-label={`Cut ${blank.name}`}
                  onClick={() => onOutline({ kind: 'drawing', blank })}
                >
                  Cut this
                </button>
              </li>
            ))}
          </ul>
          {/* SN-1 §4.8: every drawing blank in one cut, one sheet. */}
          {drawing.blanks.length > 1 && (
            <PrimaryButton
              aria-label="Cut all drawing blanks"
              onClick={() =>
                onOutline({ kind: 'batch', items: drawing.blanks.map((blank) => ({ kind: 'drawing', blank })) })
              }
            >
              Cut all {drawing.blanks.length} <span aria-hidden="true">→</span>
            </PrimaryButton>
          )}
          {[...drawing.skipped, ...drawing.rejected].map((item) => (
            <p className="cad-help" key={item.id} role="note">
              Not cut: {item.name} — {item.reason}
            </p>
          ))}
        </Tile>
      </div>
      <div ref={lists}>
        <h4>Outlines ready to cut</h4>
        {notice && (
          <p className="cad-help cad-shop-notice" role="status">
            {notice}
          </p>
        )}
        {!ready.length ? (
          <p className="cad-help">None yet: a closed sketch on the XY plane that no part is made from shows here.</p>
        ) : (
          <ul className="cad-draw-outlines" aria-label="Outlines ready to cut">
            {ready.map((outline) => (
              <li key={outline.id} className={chosen === outline.id ? 'is-chosen' : ''}>
                <OutlineThumb profile={sketchOf(outline.id)?.profile} params={params} />
                <span>
                  <strong>{outline.name}</strong>
                  <small>
                    {fmt(outline.width)} × {fmt(outline.height)} mm
                  </small>
                </span>
                <span className="cad-draw-outline-actions">
                  {outlineTools(outline)}
                  <button
                    type="button"
                    className={chosen === outline.id ? 'cad-primary' : ''}
                    aria-label={`Cut ${outline.name}`}
                    onClick={() => onOutline({ kind: 'sketch', sketchId: outline.id })}
                  >
                    Cut this
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* SN-1 §4.8: several outlines cut in one go, one sheet: Cut's picker with every ready row selected (cut-pick §4.1). */}
        {ready.length > 1 && (
          <PrimaryButton
            className="cad-cut-all"
            aria-label="Cut all outlines"
            onClick={() => onOutline({ kind: 'pick', selected: ready.map((o) => o.id) })}
          >
            Cut all {ready.length} outlines <span aria-hidden="true">→</span>
          </PrimaryButton>
        )}
        {notReady.length > 0 && (
          <>
            <h4>Not ready to cut</h4>
            <ul className="cad-draw-outlines is-not-ready" aria-label="Not ready to cut">
              {notReady.map((outline) => (
                <li key={outline.id} className={chosen === outline.id ? 'is-chosen' : ''}>
                  <OutlineThumb sketch={sketchOf(outline.id)} />
                  <span>
                    <strong>{outline.name}</strong>
                    <small role="note">{outline.problem}</small>
                  </span>
                  <span className="cad-draw-outline-actions">{outlineTools(outline)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </StationShell>
  );
}
