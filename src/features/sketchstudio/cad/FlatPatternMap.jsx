// The press brake's flat-pattern map (docs/sketch-studio-fab-shop.md §9 SM-2
// item 3): an SVG card over the viewport with the blank (+Y up, as the flat
// DXF reads), the bends already made, numbered in order, and the etched
// marks. Picking happens here: click a straight outline edge to put it on the
// backgauge (or the same edge on the sheet in the 3D view, hands on the sheet
// §6.1: the workspace hands both clicks the one onPickEdge), then drag the
// punch line (or the backgauge fingers, or type L in the panel); or click two
// points, which snap to the outline's corners and edge midpoints. Flat-blank
// millimetres throughout; the 3D pose follows from the session. Shop floor
// §6.2: an etched line is a button (the punch line goes on it, with the
// mark's angle and side when it carries them), and with a line chosen the
// material it crosses shows as pieces (docs/sketch-studio-piece-pick.md
// §5.6): a click bends only that piece, Ctrl, Shift or Meta + click puts it
// into the hit or leaves it flat. Bends are numbered by stroke, as the
// sequence list counts hits. Where click areas overlap (on a thin blank the
// long edges' strips cover the short ends, the etched lines and the pieces), a
// pointer click goes to the nearest line whose own area holds the pointer, not
// to the one drawn last; the click's modifier keys go with it.
// Tight bends §7.4 (e): in gauge mode a made bend that can be bent on is a
// button too (its line seats the punch line on it, as the row's Bend on does).
import { useEffect, useRef } from 'react';
import { hitSequence, isRoundBend } from './sheetMetal.js';
import { nearestLine } from './pressBrake.js';
import { bendOnKey } from './brakeStation.js';
import { fingerRestore } from './brakeHands.js';

const BEND_COLOURS = { up: '#c2410c', down: '#1864ab' };
// Snap reach for two-point picks, in screen pixels.
const SNAP_PX = 10;
const fmt = (value) => Number(value.toFixed(1)).toString();
const ringPath = (ring) => `M ${ring.map(([x, y]) => `${x} ${-y}`).join(' L ')} Z`;

// The corners and edge midpoints a two-point pick snaps to.
const snapPoints = ({ outer, holes }) =>
  [outer, ...holes].flatMap((ring) =>
    ring.flatMap((p, i) => {
      const q = ring[(i + 1) % ring.length];
      return [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]];
    }),
  );

/**
 * `station`: brakeStation(); `session`: brakeSession. onPickEdge(index),
 * onDistance(L) while dragging the punch line, onPoints([[x, y], ...]),
 * onMark(mark) for an etched line, onPiece(index, { add }) for a piece of
 * the line (piece pick §5.6: `add` with Ctrl, Shift or Meta held), onBendOn(step
 * key) for a made bend's line (gauge mode). `gapEdges`: the hovered flange
 * gap's edge(s) of the blank ([[p, q], …], flat mm,
 * docs/sketch-studio-corner-gaps.md §3.3), drawn over the rest and never in a
 * click's way; absent, nothing is drawn for it. `litPiece`: the piece the
 * panel names (§5.5, its index), drawn lit; null none.
 */
export default function FlatPatternMap({
  station,
  session,
  onPickEdge,
  onDistance,
  onPoints,
  onMark = null,
  onPiece = null,
  onBendOn = null,
  gapEdges = null,
  litPiece = null,
  disabled = false,
}) {
  const svg = useRef(null);
  const drag = useRef(null);
  // A drag of the punch line that started on a piece is not a click on it.
  const dragged = useRef(false);
  const { polygon, fold, feature, edges, edge, pending } = station;
  const xs = polygon.outer.map((p) => p[0]),
    ys = polygon.outer.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const margin = Math.max(x1 - x0, y1 - y0) * 0.08 + 2;
  const viewBox = [x0 - margin, -(y1 + margin), x1 - x0 + 2 * margin, y1 - y0 + 2 * margin];
  // Screen → flat millimetres (the root user space is (x, −y)).
  const toFlat = (event) => {
    const element = svg.current;
    const matrix = element?.getScreenCTM?.();
    if (matrix && typeof DOMPoint !== 'undefined') {
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      return { point: [p.x, -p.y], perPixel: 1 / Math.abs(matrix.a || 1) };
    }
    const rect = element.getBoundingClientRect();
    const scale = Math.min(rect.width / viewBox[2], rect.height / viewBox[3]) || 1;
    const left = rect.left + (rect.width - viewBox[2] * scale) / 2,
      top = rect.top + (rect.height - viewBox[3] * scale) / 2;
    return {
      point: [viewBox[0] + (event.clientX - left) / scale, -(viewBox[1] + (event.clientY - top) / scale)],
      perPixel: 1 / scale,
    };
  };
  const pickPoint = (event) => {
    if (disabled || session.mode !== 'points' || drag.current) return;
    const { point, perPixel } = toFlat(event);
    let best = null,
      bestDistance = SNAP_PX * perPixel;
    for (const p of snapPoints(polygon)) {
      const d = Math.hypot(p[0] - point[0], p[1] - point[1]);
      if (d < bestDistance) [best, bestDistance] = [p, d];
    }
    const picked = (best || point).map((v) => Math.round(v * 100) / 100);
    onPoints(session.points.length === 1 ? [session.points[0], picked] : [picked]);
  };
  // Dragging the pending punch line along the gauge edge's normal sets L.
  // The drag keeps the line as it was when it started, for Esc (brakeHands.js
  // fingerRestore, the backgauge fingers' rule).
  const startDrag = (event) => {
    if (disabled || !edge) return;
    event.stopPropagation();
    drag.current = { moved: false, from: fingerRestore(session) };
    dragged.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event) => {
    if (!drag.current) return;
    // A move with no button held: the release was lost, the drag is over
    // (state-machines rule 6). So is one the card no longer takes.
    if (!event.buttons || disabled || !edge) return endDrag(event);
    const { point } = toFlat(event);
    const distance = (point[0] - edge.a[0]) * edge.inward[0] + (point[1] - edge.a[1]) * edge.inward[1];
    const next = Math.max(0, Math.round(distance * 10) / 10);
    // The card's line is where it lies on the flat blank (skin gauge §4.7): a flat distance, named so.
    if (next === Number(station.flat ?? session.distance)) return;
    drag.current.moved = dragged.current = true;
    // Its pieces matched against the line the drag started from (piece pick, the PK-1 audit).
    onDistance(next, { stop: null, dragFrom: drag.current.from });
  };
  const endDrag = (event) => {
    if (!drag.current) return;
    event?.stopPropagation();
    drag.current = null;
  };
  // Esc puts the line back as it was (one patch, rule 4); the window losing
  // focus ends the drag where it is. Capture phase, so the Esc is the drag's
  // before the brake's own Esc (which clears the line) sees it.
  useEffect(() => {
    const key = (event) => {
      if (event.key !== 'Escape' || !drag.current) return;
      event.preventDefault();
      const { moved, from } = drag.current;
      drag.current = null;
      if (moved) onDistance(from.distance, from);
    };
    const blur = () => endDrag(null);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', blur);
    };
  });
  const segmentsOf = (bend) =>
    bend.intervals.map(([s0, s1]) => [
      [bend.a[0] + bend.u[0] * s0, bend.a[1] + bend.u[1] * s0],
      [bend.a[0] + bend.u[0] * s1, bend.a[1] + bend.u[1] * s1],
    ]);
  const label = (bend) => {
    const [s0, s1] = bend.intervals.reduce((best, i) => (i[1] - i[0] > best[1] - best[0] ? i : best));
    const s = (s0 + s1) / 2;
    return [bend.a[0] + bend.u[0] * s, bend.a[1] + bend.u[1] * s];
  };
  // An offset bend (docs/sketch-studio-brake-flip-tooling.md §5.3) draws both
  // lines of the pending pair: line A (the punch line, dragged for L) and line B.
  const offsetLines = pending && !pending.error ? pending.offset?.lines || null : null;
  const pendingBends = pending && !pending.error && !offsetLines ? pending.members || [pending.bend] : [];
  const pendingBend = offsetLines ? pending.bend : pendingBends[0] || null;
  const pendingLine = offsetLines
    ? offsetLines[0].segments
    : pendingBends.length
      ? pendingBends.flatMap(segmentsOf)
      : pending?.again
        ? pending.again.lines
        : pending?.data
          ? pending.data.map((d) => [d.a, d.b])
          : [];
  const segments = station.segments || [];
  // The punch beside the line (sheet slide §6.3) when it is not the fitted one centred: a bar over
  // each of its runs, a little off the line, never in a click's way.
  const tooling = pending && !pending.error && !offsetLines ? pending.tooling : null;
  const punchBars =
    tooling?.line && (tooling.punchTrim || tooling.slide)
      ? tooling.punch.map(([s0, s1]) => {
          const { a, u } = tooling.line;
          const off = Math.max(x1 - x0, y1 - y0) / 60;
          const n = [-u[1] * off, u[0] * off];
          return [s0, s1].map((s) => [a[0] + u[0] * s + n[0], a[1] + u[1] * s + n[1]]);
        })
      : [];
  // A bend's number: the step that first makes it (a bend-on step makes none, tight bends §4.4).
  const strokeNumber = new Map(
    hitSequence(fold)
      .filter((s) => !s.again)
      .flatMap((s) => s.bendIds.map((id) => [id, s.index + 1])),
  );
  const dot = Math.max(viewBox[2], viewBox[3]) / 90;
  // Half-widths of the click areas: a gauge edge's strip, an etched line's or a piece's band.
  const edgeReach = dot * 1.6,
    bandReach = dot * 1.4;
  // Every line a click can pick, with what picking it does.
  const targets = new Map();
  if (session.mode === 'gauge')
    for (const e of edges)
      targets.set(`edge-${e.index}`, { a: e.a, b: e.b, reach: edgeReach, act: () => onPickEdge(e.index) });
  if (onMark)
    for (const mark of feature.marks || [])
      targets.set(`mark-${mark.id}`, { a: mark.a, b: mark.b, reach: bandReach, act: () => onMark(mark) });
  // Point at the bend (tight bends §7.4 (e)): each made bend that can be bent
  // on, but those the pending hit already bends on, sets the line on it.
  const onward =
    session.mode === 'gauge' && onBendOn && !disabled
      ? fold.bends
          .filter((bend) => !(pending?.again?.bendIds || []).includes(bend.id))
          .map((bend) => ({ bend, key: bendOnKey(fold, bend.id) }))
          .filter((b) => b.key)
      : [];
  for (const { bend, key } of onward)
    segmentsOf(bend).forEach(([a, b], k) =>
      targets.set(`bend-${bend.id}-${k}`, { a, b, reach: bandReach, act: () => onBendOn(key) }),
    );
  // A piece (piece pick §5.6): bend only it; with Ctrl, Shift or Meta, into the hit or left flat.
  if ((station.segments || []).length > 1 && onPiece)
    for (const segment of station.segments)
      targets.set(`segment-${segment.index}`, {
        a: segment.a,
        b: segment.b,
        reach: bandReach,
        act: (event) => onPiece(segment.index, { add: Boolean(event?.ctrlKey || event?.shiftKey || event?.metaKey) }),
      });
  // A click on line `key`'s area: a pointer click (detail ≥ 1) picks the
  // nearest line in reach of the pointer; a click with no pointer (the
  // keyboard, a synthetic event) picks the line clicked. The event goes with
  // it (a piece's modifier keys).
  const pickAt = (event, key) => {
    const own = targets.get(key);
    let target = own;
    if (event.detail > 0 && svg.current) target = nearestLine([...targets.values()], toFlat(event).point, own) || own;
    target?.act(event);
  };
  // A band either side of a line to click (a bare line has no area to hit).
  const band = (a, b) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const w = bandReach;
    const n = [(-(b[1] - a[1]) / length) * w, ((b[0] - a[0]) / length) * w];
    return [
      [a[0] + n[0], a[1] + n[1]],
      [b[0] + n[0], b[1] + n[1]],
      [b[0] - n[0], b[1] - n[1]],
      [a[0] - n[0], a[1] - n[1]],
    ]
      .map(([x, y]) => `${x},${-y}`)
      .join(' ');
  };
  // A round bend (docs/sketch-studio-round-bend.md §6, either way it is made,
  // §12.5): its zone as a light band between its two tangent lines, and, for
  // bump hits, its hit lines, faint.
  const roundZone = (bend) => {
    const shifted = (v) =>
      segmentsOf(bend).map(([a, b]) => [
        [a[0] + bend.n[0] * v, a[1] + bend.n[1] * v],
        [b[0] + bend.n[0] * v, b[1] + bend.n[1] * v],
      ]);
    const h = bend.allowance / 2;
    const lines = (v, className) =>
      shifted(v).map(([a, b], k) => (
        <line key={`${className}-${v}-${k}`} className={className} x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} />
      ));
    return (
      <g key={`${bend.id}-zone`} className="cad-map-zone" aria-label={`Round bend zone: ${bend.label}`}>
        {shifted(-h).map(([a, b], k) => {
          const [c, d] = shifted(h)[k];
          return (
            <polygon
              key={`band-${k}`}
              className="cad-map-band"
              points={[a, b, d, c].map(([x, y]) => `${x},${-y}`).join(' ')}
            />
          );
        })}
        {Array.from({ length: bend.steps || 0 }, (_, j) =>
          lines(-h + (j + 0.5) * (bend.allowance / bend.steps), 'cad-map-hitline'),
        )}
        {lines(-h, 'cad-map-tangent')}
        {lines(h, 'cad-map-tangent')}
      </g>
    );
  };
  return (
    <figure className="cad-brake-map" aria-label="Flat blank">
      <figcaption>
        Flat blank
        <small>
          {session.mode === 'gauge'
            ? edge
              ? 'Drag the punch line or type L'
              : 'Click an edge, here or on the sheet'
            : session.points.length === 1
              ? 'Click the second point'
              : 'Click the first point'}
        </small>
      </figcaption>
      <svg
        ref={svg}
        viewBox={viewBox.join(' ')}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Flat pattern"
        onClick={pickPoint}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <path
          className="cad-map-blank"
          d={[polygon.outer, ...polygon.holes].map(ringPath).join(' ')}
          fillRule="evenodd"
        />
        {(feature.marks || []).map((mark, index) =>
          onMark ? (
            <g
              key={mark.id}
              className="cad-map-mark is-button"
              role="button"
              aria-label={`Etched line ${index + 1}${mark.bend ? `: ${String(mark.bend.direction).toUpperCase()} ${Number(mark.bend.angle)}°` : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                if (!disabled) pickAt(event, `mark-${mark.id}`);
              }}
            >
              <polygon className="cad-map-hit" points={band(mark.a, mark.b)} />
              <line x1={mark.a[0]} y1={-mark.a[1]} x2={mark.b[0]} y2={-mark.b[1]} />
            </g>
          ) : (
            <line
              key={mark.id}
              className="cad-map-mark"
              x1={mark.a[0]}
              y1={-mark.a[1]}
              x2={mark.b[0]}
              y2={-mark.b[1]}
            />
          ),
        )}
        {[...fold.bends, ...pendingBends].filter(isRoundBend).map(roundZone)}
        {fold.bends.map((bend) =>
          segmentsOf(bend).map(([a, b], k) => (
            <line
              key={`${bend.id}-${k}`}
              className="cad-map-bend"
              stroke={BEND_COLOURS[bend.direction]}
              x1={a[0]}
              y1={-a[1]}
              x2={b[0]}
              y2={-b[1]}
            />
          )),
        )}
        {fold.bends.map((bend) => {
          const [x, y] = label(bend);
          const index = strokeNumber.get(bend.id) - 1;
          return (
            <g key={`${bend.id}-n`} className="cad-map-number" aria-label={`Bend ${index + 1}: ${bend.label}`}>
              <circle cx={x} cy={-y} r={dot * 2.2} fill={BEND_COLOURS[bend.direction]} />
              <text x={x} y={-y} fontSize={dot * 2.6} dy="0.35em" textAnchor="middle">
                {index + 1}
              </text>
            </g>
          );
        })}
        {/* Under the gauge edges and the pending line: their clicks and the line's drag are unchanged. */}
        {onward.map(({ bend }) => (
          <g
            key={`${bend.id}-on`}
            className="cad-map-bend-on"
            role="button"
            aria-label={`Bend ${strokeNumber.get(bend.id)}'s line: bend it on`}
            onClick={(event) => {
              event.stopPropagation();
              pickAt(event, `bend-${bend.id}-0`);
            }}
          >
            {segmentsOf(bend).map(([a, b], k) => (
              <g key={k}>
                <polygon className="cad-map-hit" points={band(a, b)} />
                <line x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} />
              </g>
            ))}
          </g>
        ))}
        {session.mode === 'gauge' &&
          edges.map((e) => {
            // A strip either side of the edge to click (a bare line has no area to hit).
            const w = edgeReach;
            const strip = [
              [e.a[0] - e.inward[0] * w, e.a[1] - e.inward[1] * w],
              [e.b[0] - e.inward[0] * w, e.b[1] - e.inward[1] * w],
              [e.b[0] + e.inward[0] * w, e.b[1] + e.inward[1] * w],
              [e.a[0] + e.inward[0] * w, e.a[1] + e.inward[1] * w],
            ];
            return (
              <g
                key={e.index}
                className={`cad-map-edge ${edge?.index === e.index ? 'is-picked' : ''}`}
                role="button"
                aria-label={`Gauge edge ${e.index + 1}`}
                aria-pressed={edge?.index === e.index}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!disabled) pickAt(event, `edge-${e.index}`);
                }}
              >
                <polygon points={strip.map(([x, y]) => `${x},${-y}`).join(' ')} />
                <line x1={e.a[0]} y1={-e.a[1]} x2={e.b[0]} y2={-e.b[1]} />
              </g>
            );
          })}
        {pendingLine.map(([a, b], k) => (
          <line
            key={`pending-${k}`}
            className={`cad-map-pending ${pending?.error || pending?.refusals?.length || pending?.collision?.hit ? 'is-refused' : ''}`}
            aria-label={k === 0 ? 'Punch line' : undefined}
            x1={a[0]}
            y1={-a[1]}
            x2={b[0]}
            y2={-b[1]}
            onPointerDown={startDrag}
          />
        ))}
        {offsetLines?.[1].segments.map(([a, b], k) => (
          <line
            key={`pending-b-${k}`}
            className={`cad-map-pending is-second ${pending.refusals?.length || pending.collision?.hit ? 'is-refused' : ''}`}
            aria-label={k === 0 ? 'Second line' : undefined}
            x1={a[0]}
            y1={-a[1]}
            x2={b[0]}
            y2={-b[1]}
          />
        ))}
        {segments.length > 1 &&
          onPiece &&
          segments.map((segment) => (
            <g
              key={`segment-${segment.index}`}
              className={`cad-map-segment${segment.skipped ? ' is-skipped' : ''}${litPiece === segment.index ? ' is-lit' : ''}`}
              role="button"
              aria-label={`Piece ${segment.index + 1} of ${segments.length}`}
              aria-pressed={!segment.skipped}
              onPointerDown={startDrag}
              onClick={(event) => {
                event.stopPropagation();
                if (!disabled && !dragged.current) pickAt(event, `segment-${segment.index}`);
                dragged.current = false;
              }}
            >
              <polygon className="cad-map-hit" points={band(segment.a, segment.b)} />
              <line x1={segment.a[0]} y1={-segment.a[1]} x2={segment.b[0]} y2={-segment.b[1]} />
            </g>
          ))}
        {punchBars.map(([a, b], k) => (
          // Where the punch stands (docs/sketch-studio-sheet-slide.md §6.3): a length or a slide readable in plan.
          <line
            key={`punch-${k}`}
            className="cad-map-punch"
            aria-label={k === 0 ? 'Punch' : undefined}
            x1={a[0]}
            y1={-a[1]}
            x2={b[0]}
            y2={-b[1]}
          />
        ))}
        {edge && station.gauge?.distance != null && pendingBend && (
          <text
            className="cad-map-reading"
            // Half way to the line where it lies on the blank (off a flange L is not the flat distance).
            x={(edge.a[0] + edge.b[0]) / 2 + (edge.inward[0] * (station.flat ?? station.gauge.distance)) / 2}
            y={-((edge.a[1] + edge.b[1]) / 2 + (edge.inward[1] * (station.flat ?? station.gauge.distance)) / 2)}
            fontSize={dot * 2.6}
            textAnchor="middle"
          >
            L {fmt(station.gauge.distance)}
          </text>
        )}
        {gapEdges?.map(([a, b], k) => (
          // A ring round its middle: a corner's edges are short on a whole blank.
          <g key={`gap-${k}`} className="cad-map-gap" aria-label={k === 0 ? 'Flange gap edge' : undefined}>
            <line x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} />
            <circle cx={(a[0] + b[0]) / 2} cy={-(a[1] + b[1]) / 2} r={dot * 2} />
          </g>
        ))}
        {session.mode === 'points' &&
          session.points.map((p, i) => (
            <circle
              key={i}
              className="cad-map-point"
              cx={p[0]}
              cy={-p[1]}
              r={dot * 1.4}
              aria-label={`Point ${i ? 'B' : 'A'}`}
            />
          ))}
      </svg>
    </figure>
  );
}
