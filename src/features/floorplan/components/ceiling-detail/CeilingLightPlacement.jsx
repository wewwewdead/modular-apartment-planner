import { useEffect } from 'react';
import { FIXTURE_TYPES } from '@/domain/lightingCatalog';
import { pointInPolygon } from '@/geometry/polygon';
import styles from '@/features/floorplan/components/wall-detail/WallDetailEditor.module.css';
import { FIXTURE_SYMBOL_COLOR, fixtureSymbolNodes, formatMm } from './CeilingPlanLayers';
import { LIGHT_SNAP_RADIUS_PX, lightName, panelAtPoint, snapLightPoint } from './lightSnap';
import { describeLightRun } from './lightRun';

/*
 * The Light tool's feedback before the click: a ghost of the chosen luminaire at
 * true size where it will land, the alignment guides that put it there, and the
 * words for the chip at the cursor. The editor owns the pointer and the state;
 * these only draw and describe, and they re-render with every move — which is
 * why none of this lives inside the memoised plan layers.
 */

export const LIGHT_GUIDE_COLOR = '#ffb85c';

/** How the Light tool is driven, in the status bar and in the tool's own strip. */
export const LIGHT_TOOL_HINT =
  'Click to place · drag for a row (↑/↓ count) · hold Shift for a grid (←/→ columns, ↑/↓ rows)';

/**
 * Where the light under the pointer would go: the snapped point, what it
 * snapped to, and its guides. `hover` carries the raw ceiling-local point, the
 * screen scale it was measured at and whether Shift was down.
 *
 * Shift holds the line of the light selected, or failing that the light placed
 * last — the one a run is being continued from.
 */
export function resolveLightPlacement(hover, { targets, fixtures, selectedFixtureId, snapEnabled, snapStep, bounds }) {
  if (!hover) return null;
  let shiftAnchor = null;
  let shiftLabel = null;
  if (hover.shift && fixtures.length) {
    const selectedIndex = fixtures.findIndex((fixture) => fixture.id === selectedFixtureId);
    const index = selectedIndex >= 0 && fixtures[selectedIndex].id !== hover.excludeId ? selectedIndex : -1;
    const fallback = fixtures.reduce(
      (found, fixture, position) => (fixture.id === hover.excludeId ? found : position),
      -1,
    );
    const anchorIndex = index >= 0 ? index : fallback;
    if (anchorIndex >= 0) {
      shiftAnchor = fixtures[anchorIndex];
      shiftLabel = fixtures[anchorIndex].label || lightName(anchorIndex);
    }
  }
  // A light moved with Shift holds its own starting line, the way a dragged
  // object keeps to its axis anywhere else in the app.
  if (hover.shift && hover.origin) {
    shiftAnchor = hover.origin;
    shiftLabel = 'its starting point';
  }
  return snapLightPoint(hover.point, targets, {
    pixelsPerU: hover.pixelsPerU,
    pixelsPerV: hover.pixelsPerV,
    shiftAnchor,
    shiftLabel,
    enabled: snapEnabled,
    grid: { enabled: snapEnabled, step: snapStep },
    bounds: { length: bounds.length, depth: bounds.height },
  });
}

/** The room a plan point stands in, by its outline. */
export function roomAtPlanPoint(rooms, planPoint) {
  return (
    (rooms || []).find((room) => (room.points || []).length >= 3 && pointInPolygon(planPoint, room.points)) || null
  );
}

/**
 * The chip, top to bottom: the room the light is going into, what it locked to
 * (and the board it lands on, when that is not already the answer), and where.
 * Lines that do not apply are left out rather than shown empty.
 */
export function lightPlacementReadout(placement, { rooms, panels, toPlan }) {
  if (!placement) return null;
  const { point, snap } = placement;
  const lines = [];
  const room = roomAtPlanPoint(rooms, toPlan(point));
  if (room?.name) lines.push(room.name);
  const board = snap?.kind === 'board_centre' ? null : panelAtPoint(panels, point);
  const said = [snap?.label, board ? `on ${board.label}` : null].filter(Boolean).join(' · ');
  if (said) lines.push(said);
  lines.push(`U ${formatMm(point.u)} · V ${formatMm(point.v)}`);
  return lines;
}

/**
 * The luminaire about to be placed, drawn exactly as it will be (same symbol,
 * same size) but dashed and faded, so the drawing shows what a click will do
 * and never reads as a light already there.
 */
export function CeilingLightGhost({ fixtureType, point, aim = null, unitPx }) {
  if (!point) return null;
  const fixture = { fixtureType, u: point.u, v: point.v, aim: aim || { tiltDeg: 0, azimuthDeg: 0 } };
  return (
    <g
      data-light-ghost={fixtureType}
      className={styles.drawPreview}
      fill="none"
      stroke={FIXTURE_SYMBOL_COLOR}
      strokeWidth="1.25"
      strokeDasharray="4 3"
      opacity={0.6}
      style={{ pointerEvents: 'none' }}
    >
      {fixtureSymbolNodes(fixture, unitPx, FIXTURE_SYMBOL_COLOR)}
    </g>
  );
}

/** One dashed line across the whole ceiling per alignment the light locked to. */
export function CeilingLightGuides({ guides, length, depth }) {
  if (!guides?.length) return null;
  return (
    <g style={{ pointerEvents: 'none' }}>
      {guides.map((guide) =>
        guide.axis === 'u' ? (
          <line
            key={`u:${guide.value}`}
            data-light-guide="u"
            x1={guide.value}
            y1={0}
            x2={guide.value}
            y2={depth}
            stroke={LIGHT_GUIDE_COLOR}
            strokeWidth="1"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <line
            key={`v:${guide.value}`}
            data-light-guide="v"
            x1={0}
            y1={guide.value}
            x2={length}
            y2={guide.value}
            stroke={LIGHT_GUIDE_COLOR}
            strokeWidth="1"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
    </g>
  );
}

/**
 * The Light tool's own options, in the canvas toolbar beside Snap while the
 * tool is armed: the type the next click places (the same state as the
 * Lighting section's picker, so the two always agree) and how to drive it.
 */
export function LightToolOptions({ value, onChange }) {
  return (
    <div className={styles.toolGroup} data-tool-options="add_light">
      <span>Light</span>
      <label className={styles.snapControl}>
        <span>New light type</span>
        <select
          value={value}
          title="The luminaire the next click places"
          onChange={(event) => onChange(event.target.value)}
        >
          {FIXTURE_TYPES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <span className={styles.snapControl}>{LIGHT_TOOL_HINT}</span>
    </div>
  );
}

/**
 * The lights a drag is about to place: a dashed line A → B for a row or the
 * rectangle A → B for a grid, the guides the end point locked to, and one ghost
 * per light — so the drawing shows exactly what the release will commit.
 * `run` is the editor's resolved run (`points`, `grid`, `end`, `isRun`).
 */
export function CeilingLightRunGhost({ run, start, fixtureType, unitPx, length, depth }) {
  if (!run?.points?.length) return null;
  const { points, grid, end, isRun } = run;
  const b = end?.point || start;
  const outline = {
    fill: 'none',
    stroke: LIGHT_GUIDE_COLOR,
    strokeWidth: '1.25',
    strokeDasharray: '8 5',
    vectorEffect: 'non-scaling-stroke',
  };
  return (
    <g data-light-run={grid ? 'grid' : 'row'} data-light-count={points.length} style={{ pointerEvents: 'none' }}>
      {isRun && grid ? (
        <rect
          x={Math.min(start.u, b.u)}
          y={Math.min(start.v, b.v)}
          width={Math.abs(b.u - start.u)}
          height={Math.abs(b.v - start.v)}
          {...outline}
        />
      ) : null}
      {isRun && !grid ? <line x1={start.u} y1={start.v} x2={b.u} y2={b.v} {...outline} /> : null}
      {isRun ? <CeilingLightGuides guides={end?.guides} length={length} depth={depth} /> : null}
      {points.map((point, index) => (
        <CeilingLightGhost key={index} fixtureType={fixtureType} point={point} unitPx={unitPx} />
      ))}
    </g>
  );
}

/**
 * The chip for a run, at its end point: the room the END lands in, what the
 * run places (`3 × 1,500 mm`), and what the end snapped to when it did.
 */
export function lightRunReadout(run, { rooms, toPlan }) {
  if (!run?.points?.length) return null;
  const at = run.isRun ? run.end?.point || run.points.at(-1) : run.points[0];
  const room = roomAtPlanPoint(rooms, toPlan(at));
  const lines = [room?.name, describeLightRun(run.points, run), run.isRun ? run.end?.snap?.label : null];
  return { point: at, lines: lines.filter(Boolean) };
}

/**
 * The 3D pane has no plan pixels to judge a snap by, so its reach is set in
 * millimetres: a light clicked onto a board there locks onto anything the plan
 * would have offered within 150 mm of the hit.
 */
export const PANE_LIGHT_SNAP_REACH_MM = 150;
export const PANE_SNAP_SCALE = LIGHT_SNAP_RADIUS_PX / PANE_LIGHT_SNAP_REACH_MM;

/**
 * Where a click in the Live 3D pane puts a light, as the raw ceiling-local
 * point still to be snapped — or null when the click is not one that places:
 * only a hit on one of THIS ceiling's boards does. A luminaire, a hanger, a
 * beam or empty space falls through to the pane's ordinary selection.
 */
export function paneLightPoint(part, hit, { ceilingId, space }) {
  if (part?.kind !== 'panel' || hit?.kind !== 'ceiling' || hit.sourceId !== ceilingId || !hit.plan) return null;
  return space.toLocal(hit.plan);
}

/**
 * Shift turns a live row into a grid and letting go turns it back. The press
 * reaches the editor's key handler; the release is a keyup, which that handler
 * never hears, so this listens for it while a run is live.
 */
export function useLightRunShiftRelease(active, setGesture) {
  useEffect(() => {
    if (!active) return undefined;
    const onKeyUp = (event) => {
      if (event.key !== 'Shift') return;
      setGesture((value) => (value?.kind === 'draw' && value.tool === 'add_light' ? { ...value, grid: false } : value));
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  }, [active, setGesture]);
}
