// Flange gaps (docs/sketch-studio-corner-gaps.md §3.2): how far each cut end
// of the folded part stands from the flanges round it, read to 0.01 mm. One
// line always in sight, a warning card per overlap, the rows in a disclosure
// (open while any gap is under 1 mm or overlaps; the user's own toggle
// remembered as Machine numbers' is) and a small flat blank with every row's
// edge marked, the hovered one in the shop's accent. Hovering a row tells
// `onHover(row)` (the press brake marks it in the 3D view and on its map).
// Nothing at all for a part with no two flanges and nothing to read. The
// Sheet metal panel puts its Set controls in (CG-2, §4.3): `rowExtra(row)`
// under each row, `children(gaps)` above the rows; plain `children` (the
// brake's pointer sentence) under them. With `tolerance` (CG-4, §6.1) every
// row says how far it may be off on the bench, and the line how many may touch.
import { useEffect, useMemo, useRef, useState } from 'react';
import { GAP_REACH, benchVerdict, flangeGaps, flangeName, gapBand, gapLabel, gapText } from './cornerGaps.js';
import { ProblemCard } from './ShopFloor.jsx';

const STORE_KEY = 'cad-shop-numbers:';
const mm = (value) => `${value.toFixed(2)} mm`;
const ringPath = (ring) => `M ${ring.map(([x, y]) => `${x} ${-y}`).join(' L ')} Z`;

// The disclosure's state: the user's last toggle ('open' | 'closed'), or null (none yet: the default rule).
function readToggle(station) {
  try {
    const stored = window.localStorage.getItem(STORE_KEY + station);
    return stored === 'open' || stored === 'closed' ? stored : null;
  } catch {
    return null;
  }
}

// An overlap in words: "Bend 8's flange runs 0.30 mm into bend 5's flange. Real sheet cannot: …".
function overlapMessage(overlap, rows) {
  const row = rows.find((r) => r.key === overlap.row) || null;
  const [first, second] = row ? [row.a.bend, row.b.bend] : overlap.bends;
  const depth = row?.overlap ? ` ${mm(-row.gap)}` : '';
  return `${flangeName(first, true)} runs${depth} into ${flangeName(second)}. Real sheet cannot: give that gap 0 mm or more.`;
}

/**
 * `fold`: the folded part (sheetMetal.js foldSheet, posed as the gaps are to
 * be read); `profile`, `params`: its blank's sketch profile and parameter
 * values. `onHover(row | null)`; `children` go under the rows; a function
 * (CG-2's controls) is handed the reading, `{ rows, overlaps, least }`, and
 * goes above them, under the summary line and any overlap card;
 * `rowExtra(row)` inside each row, after its figure. `station` names the
 * disclosure's remembered toggle; `openNear`
 * false (the press brake, where the sequence follows the card) keeps the rows
 * closed until the user opens them or two flanges overlap. `tolerance`: what
 * the shop holds ({ flange, cut, angle }, shopCatalog.js shopTolerance; null:
 * no band): each row's "± on the bench" (gapBand), information only.
 */
export default function FlangeGaps({
  fold,
  profile,
  params,
  onHover = null,
  station = 'gaps',
  openNear = true,
  rowExtra = null,
  children = null,
  tolerance = null,
}) {
  const gaps = useMemo(() => {
    if (!fold || !profile) return null;
    try {
      return flangeGaps(fold, profile, params || {});
    } catch {
      return null;
    }
  }, [fold, profile, params]);
  const [hovered, setHot] = useState(null);
  const [toggle, setToggle] = useState(() => readToggle(station));
  const rows = gaps?.rows || null;
  // Each row's band on the bench (§6.1), by key: null without a tolerance.
  const bands = useMemo(() => {
    if (!rows || !tolerance) return null;
    try {
      return new Map(rows.map((row) => [row.key, gapBand(row, fold, tolerance)]));
    } catch {
      return null;
    }
  }, [rows, fold, tolerance]);
  // The hovered row, while the rows still hold it (by key: it survives a new reading of the same part).
  const hot = hovered && rows?.some((r) => r.key === hovered) ? hovered : null;
  const hover = useRef(onHover);
  useEffect(() => {
    hover.current = onHover;
  }, [onHover]);
  // Rows read again under the pointer: the hovered row is handed on as it reads now, or let go.
  const handed = useRef(null);
  useEffect(() => {
    if (!handed.current) return;
    const row = rows?.find((r) => r.key === handed.current.key) || null;
    if (row === handed.current) return;
    handed.current = row;
    hover.current?.(row);
  }, [rows]);
  // The card going lets go of it.
  useEffect(() => () => handed.current && hover.current?.(null), []);
  if (!gaps) return null;
  const { overlaps, least } = gaps;
  const flanges = fold.pieces.filter((p) => p.id !== fold.rootPiece).length;
  if (!rows.length && !overlaps.length && flanges < 2) return null;
  const bandOf = (row) => bands?.get(row.key) ?? null;
  const touching = bands ? rows.filter((row) => benchVerdict(row, bandOf(row)) === 'touch').length : 0;
  const summary = rows.length
    ? `Flange gaps: ${least != null ? `least ${mm(least)} · ` : ''}${rows.length} within ${GAP_REACH} mm${touching ? ` · ${touching} may touch on the bench` : ''}`
    : `Flange gaps: none within ${GAP_REACH} mm`;
  if (!rows.length && !overlaps.length)
    return (
      <p className="cad-help cad-gaps-line" aria-label="Flange gaps summary">
        {summary}
      </p>
    );
  const near = overlaps.length > 0 || rows.some((r) => r.overlap || (openNear && !r.cover && r.gap < 1));
  const open = toggle ? toggle === 'open' : near;
  const enter = (row) => {
    setHot(row.key);
    handed.current = row;
    onHover?.(row);
  };
  const leave = () => {
    setHot(null);
    handed.current = null;
    onHover?.(null);
  };
  // The flat blank, +Y up as the map reads; every row's edge(s), the hovered row's last (on top).
  const { outer, holes } = fold.blank;
  const xs = outer.map((p) => p[0]),
    ys = outer.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const margin = Math.max(x1 - x0, y1 - y0) * 0.04 + 1;
  const viewBox = [x0 - margin, -(y1 + margin), x1 - x0 + 2 * margin, y1 - y0 + 2 * margin];
  const dot = Math.max(viewBox[2], viewBox[3]) / 70;
  const edgesOf = (row) => [row.a.flat, ...(row.b.flat ? [row.b.flat] : [])];
  const ordered = [...rows.filter((r) => r.key !== hot), ...rows.filter((r) => r.key === hot)];
  return (
    <section className="cad-gaps" aria-label="Flange gaps">
      <p className="cad-part-size cad-gaps-line" aria-label="Flange gaps summary">
        {summary}
      </p>
      {overlaps.map((overlap) => (
        <ProblemCard
          key={overlap.pieces.join('|')}
          tone="warning"
          label="Overlap"
          message={overlapMessage(overlap, rows)}
        />
      ))}
      {/* The Sheet metal panel's Set controls, above the rows (§4.5, after the first audit). */}
      {typeof children === 'function' && children(gaps)}
      {rows.length > 0 && (
        <details
          className="cad-shop-numbers cad-gaps-rows"
          open={open}
          onToggle={(event) => {
            const next = event.currentTarget.open;
            if (next === open) return;
            setToggle(next ? 'open' : 'closed');
            try {
              window.localStorage.setItem(STORE_KEY + station, next ? 'open' : 'closed');
            } catch {
              // Storage off (a private window): the disclosure still works for this visit.
            }
          }}
        >
          <summary>The gaps, nearest first</summary>
          <svg
            className="cad-gaps-map"
            viewBox={viewBox.join(' ')}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Flange gaps on the flat blank"
          >
            <path className="cad-gaps-blank" d={[outer, ...holes].map(ringPath).join(' ')} fillRule="evenodd" />
            {fold.bends.flatMap((bend) =>
              bend.intervals.map(([s0, s1], k) => (
                <line
                  key={`${bend.id}-${k}`}
                  className="cad-gaps-bend"
                  x1={bend.a[0] + bend.u[0] * s0}
                  y1={-(bend.a[1] + bend.u[1] * s0)}
                  x2={bend.a[0] + bend.u[0] * s1}
                  y2={-(bend.a[1] + bend.u[1] * s1)}
                />
              )),
            )}
            {ordered.map((row) => (
              <g
                key={row.key}
                className={`cad-gaps-edge${row.key === hot ? ' is-hot' : ''}${row.overlap ? ' is-overlap' : ''}`}
                data-key={row.key}
              >
                {edgesOf(row).map(([p, q], k) => (
                  <g key={k}>
                    <line x1={p[0]} y1={-p[1]} x2={q[0]} y2={-q[1]} />
                    <circle cx={(p[0] + q[0]) / 2} cy={-(p[1] + q[1]) / 2} r={row.key === hot ? dot * 2.6 : dot} />
                  </g>
                ))}
              </g>
            ))}
          </svg>
          <ol className="cad-gaps-list" aria-label="Flange gaps, nearest first">
            {rows.map((row) => (
              <li
                key={row.key}
                tabIndex={0}
                className={`${row.key === hot ? 'is-hot' : ''}${row.overlap ? ' is-overlap' : ''}`.trim() || undefined}
                aria-label={`${gapLabel(row)}: ${gapText(row, bandOf(row))}`}
                onPointerEnter={() => enter(row)}
                onPointerLeave={leave}
                onFocus={() => enter(row)}
                onBlur={leave}
              >
                <span>{gapLabel(row)}</span>
                <strong>{gapText(row, bandOf(row))}</strong>
                {rowExtra?.(row)}
              </li>
            ))}
          </ol>
        </details>
      )}
      {typeof children === 'function' ? null : children}
    </section>
  );
}
