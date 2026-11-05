import { pointInPolygon, polygonCentroid } from '@/geometry/polygon';
import { snapWallLocalPoint } from '@/features/floorplan/components/wall-detail/wallDetailEditorGeometry';

/**
 * Where a light wants to go on a reflected ceiling plan, and why.
 *
 * The drawing tools snap to board edges and a 50 mm grid, which is right for a
 * board or a channel and wrong for a luminaire: a downlight goes in the middle
 * of a board, in the middle of a room, in line with the lights already up, or
 * one more spacing along a run of them — never on the joint between two boards.
 * This module is that rule, pure and unit-tested; the editor feeds it the
 * pointer and draws what it answers (the ghost, the guides, the chip).
 *
 * Everything is in ceiling-local UV millimetres. Distances are judged in
 * screen pixels (`pixelsPerU` / `pixelsPerV`), so a snap feels the same at any
 * zoom.
 */

export const LIGHT_SNAP_RADIUS_PX = 12;

/** Two fixtures within this of one line share it. */
const SHARED_LINE_TOLERANCE = 1;

function mm(value) {
  return `${Math.round(value).toLocaleString('en-US')} mm`;
}

/** The name a light goes by on the plan and in the chip: its place in the list. */
export function lightName(index) {
  return `Light ${index + 1}`;
}

/**
 * Everything a light can lock onto:
 *
 *  - `fixture_line` — the U and the V line through every placed light, so a
 *    new one can be put in line with any of them;
 *  - `midpoint` — halfway between two lights that already share a line;
 *  - `run` — the spacing of the last two lights placed, repeated past either
 *    end of the pair, which is how a row is laid out;
 *  - `board_centre` — the middle of each board's rectangle;
 *  - `region_centre` — the middle of each stretch of ceiling (one per room once
 *    the partitions are cut out of it).
 *
 * `fixtures` are the lights already on the ceiling in list order, which is what
 * names them ("Light 2"). A light being moved is named by `excludeId` so it
 * keeps the others' names steady and does not snap to itself.
 */
export function collectLightSnapTargets({
  panels = [],
  regions = [],
  fixtures = [],
  length = 0,
  depth = 0,
  excludeId = null,
} = {}) {
  const targets = [];
  const named = fixtures
    .map((fixture, index) => ({ fixture, name: fixture.label || lightName(index) }))
    .filter(({ fixture }) => fixture.id !== excludeId);

  for (const { fixture, name } of named) {
    targets.push({
      kind: 'fixture_line',
      axis: 'u',
      value: fixture.u,
      fixtureId: fixture.id,
      label: name,
      anchor: fixture,
    });
    targets.push({
      kind: 'fixture_line',
      axis: 'v',
      value: fixture.v,
      fixtureId: fixture.id,
      label: name,
      anchor: fixture,
    });
  }

  for (let first = 0; first < named.length; first += 1) {
    for (let second = first + 1; second < named.length; second += 1) {
      const a = named[first].fixture;
      const b = named[second].fixture;
      const sharedU = Math.abs(a.u - b.u) <= SHARED_LINE_TOLERANCE;
      const sharedV = Math.abs(a.v - b.v) <= SHARED_LINE_TOLERANCE;
      if (!sharedU && !sharedV) continue;
      targets.push({
        kind: 'midpoint',
        u: (a.u + b.u) / 2,
        v: (a.v + b.v) / 2,
        guides: [sharedU ? { axis: 'u', value: (a.u + b.u) / 2 } : { axis: 'v', value: (a.v + b.v) / 2 }],
        label: `Midway ${named[first].name} – ${named[second].name}`,
      });
    }
  }

  if (named.length >= 2) {
    const a = named[named.length - 2].fixture;
    const b = named[named.length - 1].fixture;
    const du = b.u - a.u;
    const dv = b.v - a.v;
    const spacing = Math.hypot(du, dv);
    if (spacing > SHARED_LINE_TOLERANCE) {
      // A run along one axis gets that axis as its guide; a diagonal pair
      // still repeats, it just has no grid line to show for it.
      const along = Math.abs(dv) <= SHARED_LINE_TOLERANCE ? 'v' : Math.abs(du) <= SHARED_LINE_TOLERANCE ? 'u' : null;
      for (const point of [
        { u: b.u + du, v: b.v + dv },
        { u: a.u - du, v: a.v - dv },
      ]) {
        if (point.u < 0 || point.u > length || point.v < 0 || point.v > depth) continue;
        targets.push({
          kind: 'run',
          ...point,
          guides: along ? [{ axis: along, value: along === 'v' ? b.v : b.u }] : [],
          label: `Next in run · ${mm(spacing)}`,
        });
      }
    }
  }

  for (const panel of panels) {
    targets.push({
      kind: 'board_centre',
      u: (panel.u0 + panel.u1) / 2,
      v: (panel.v0 + panel.v1) / 2,
      label: `Board ${panel.label || panel.localId || panel.id} · centre`,
    });
  }

  for (const region of regions) {
    const outline = (region.outline || []).map((point) => ({ x: point.u, y: point.v }));
    if (outline.length < 3) continue;
    const centre = polygonCentroid(outline);
    if (!Number.isFinite(centre.x) || !Number.isFinite(centre.y)) continue;
    targets.push({ kind: 'region_centre', u: centre.x, v: centre.y, label: 'Room centre' });
  }

  return targets;
}

function clampToCeiling(point, bounds) {
  if (!bounds) return point;
  return {
    u: Math.max(0, Math.min(bounds.length, point.u)),
    v: Math.max(0, Math.min(bounds.depth, point.v)),
  };
}

function nearestPoint(point, targets, kinds, scale, radiusPx) {
  let best = null;
  for (const target of targets) {
    if (!kinds.has(target.kind)) continue;
    const distance = Math.hypot((target.u - point.u) * scale.u, (target.v - point.v) * scale.v);
    if (distance <= radiusPx && (!best || distance < best.distance)) best = { target, distance };
  }
  return best?.target || null;
}

function nearestLine(point, targets, axis, scale, radiusPx) {
  let best = null;
  for (const target of targets) {
    if (target.kind !== 'fixture_line' || target.axis !== axis) continue;
    const distance = Math.abs(target.value - point[axis]) * scale[axis];
    if (distance <= radiusPx && (!best || distance < best.distance)) best = { target, distance };
  }
  return best?.target || null;
}

function roundToGrid(value, step) {
  return Math.round(value / step) * step;
}

/** How far along the line from the light it is in line with, for the chip. */
function lineLabel(line, point) {
  const along = line.axis === 'u' ? point.v - line.anchor.v : point.u - line.anchor.u;
  return Math.abs(along) >= 1 ? `In line with ${line.label} · ${mm(Math.abs(along))}` : `In line with ${line.label}`;
}

/**
 * Snap one pointer position. Returns the point the light goes to, what it
 * snapped to (`{ kind, label }`, or null for a free point) and the alignment
 * guides to draw (`{ axis, value }`: a 'u' guide is the line u = value).
 *
 * Priority, when several are in reach:
 *   1. a point target — a midpoint or the next step of a run — beats a line;
 *   2. the lines through the lights already placed; a U line and a V line in
 *      reach together lock to their crossing, one alone holds that coordinate
 *      and leaves the other to the grid;
 *   3. a board's centre, then a room's centre;
 *   4. the drawing grid when snapping is on, else the raw point.
 *
 * With `enabled: false` nothing snaps but an explicit Shift constraint.
 * `shiftAnchor` (a fixture's `{ u, v }`) replaces every line candidate with
 * that light's own U or V line, whichever is nearer — held, not in reach: a
 * Shift-placed light always lands on it.
 */
export function snapLightPoint(point, targets = [], options = {}) {
  const {
    pixelsPerU = 1,
    pixelsPerV = 1,
    radiusPx = LIGHT_SNAP_RADIUS_PX,
    shiftAnchor = null,
    shiftLabel = null,
    enabled = true,
    grid = null,
    bounds = null,
  } = options;
  const scale = { u: pixelsPerU, v: pixelsPerV };
  const gridStep = grid?.enabled !== false && Number(grid?.step) > 0 ? Number(grid.step) : null;
  const snapToGrid = (value) => (enabled && gridStep ? roundToGrid(value, gridStep) : value);

  if (shiftAnchor) {
    // Whichever of the anchor's two lines the pointer is nearer, on screen.
    const offU = Math.abs(point.u - shiftAnchor.u) * scale.u;
    const offV = Math.abs(point.v - shiftAnchor.v) * scale.v;
    const axis = offU <= offV ? 'u' : 'v';
    const free = axis === 'u' ? 'v' : 'u';
    // Along the held line the light still finds a board or room centre, a
    // midpoint or the next step of a run; failing those, the grid.
    let freeValue = snapToGrid(point[free]);
    let label = `In line with ${shiftLabel || 'last light'}`;
    if (enabled) {
      let best = null;
      for (const target of targets) {
        if (!('u' in target) || !['midpoint', 'run', 'board_centre', 'region_centre'].includes(target.kind)) continue;
        if (Math.abs(target[axis] - shiftAnchor[axis]) > SHARED_LINE_TOLERANCE) continue;
        const distance = Math.abs(target[free] - point[free]) * scale[free];
        if (distance <= radiusPx && (!best || distance < best.distance)) best = { target, distance };
      }
      if (best) {
        freeValue = best.target[free];
        label = `${label} · ${best.target.label}`;
      }
    }
    const snapped = clampToCeiling({ [axis]: shiftAnchor[axis], [free]: freeValue }, bounds);
    return {
      point: snapped,
      snap: { kind: 'shift', label },
      guides: [{ axis, value: shiftAnchor[axis] }],
    };
  }

  if (!enabled) return { point: clampToCeiling(point, bounds), snap: null, guides: [] };

  const pointTarget = nearestPoint(point, targets, new Set(['midpoint', 'run']), scale, radiusPx);
  if (pointTarget) {
    return {
      point: clampToCeiling({ u: pointTarget.u, v: pointTarget.v }, bounds),
      snap: { kind: pointTarget.kind, label: pointTarget.label },
      guides: pointTarget.guides || [],
    };
  }

  const lineU = nearestLine(point, targets, 'u', scale, radiusPx);
  const lineV = nearestLine(point, targets, 'v', scale, radiusPx);
  if (lineU && lineV) {
    const snapped = clampToCeiling({ u: lineU.value, v: lineV.value }, bounds);
    const label =
      lineU.fixtureId === lineV.fixtureId ? `On ${lineU.label}` : `In line with ${lineU.label} and ${lineV.label}`;
    return {
      point: snapped,
      snap: { kind: 'fixture_line', label },
      guides: [
        { axis: 'u', value: lineU.value },
        { axis: 'v', value: lineV.value },
      ],
    };
  }
  if (lineU || lineV) {
    const line = lineU || lineV;
    const free = line.axis === 'u' ? 'v' : 'u';
    const snapped = clampToCeiling({ [line.axis]: line.value, [free]: snapToGrid(point[free]) }, bounds);
    return {
      point: snapped,
      snap: { kind: 'fixture_line', label: lineLabel(line, snapped) },
      guides: [{ axis: line.axis, value: line.value }],
    };
  }

  for (const kind of ['board_centre', 'region_centre']) {
    const target = nearestPoint(point, targets, new Set([kind]), scale, radiusPx);
    if (target) {
      return {
        point: clampToCeiling({ u: target.u, v: target.v }, bounds),
        snap: { kind, label: target.label },
        guides: [],
      };
    }
  }

  if (gridStep) {
    return {
      // The drawing tools' own grid snap, with no edge candidates and a reach of
      // a whole step, so the light always lands on a grid crossing.
      point: clampToCeiling(
        snapWallLocalPoint(point, { u: [], v: [] }, { step: gridStep, threshold: gridStep }),
        bounds,
      ),
      snap: { kind: 'grid', label: 'Grid' },
      guides: [],
    };
  }
  return { point: clampToCeiling(point, bounds), snap: null, guides: [] };
}

const uvRing = (ring) => (ring || []).map((entry) => ({ x: entry.u, y: entry.v }));

/**
 * The board a point falls on, for the chip. By what is left of the board once
 * the boundary and the structure are cut out of it, not by its stock
 * rectangle: a board clipped by an L-shaped ceiling still has its full
 * rectangle, and the chip would name it over the notch where there is no board.
 * A board without derived regions falls back to its rectangle.
 */
export function panelAtPoint(panels, point) {
  const xy = { x: point.u, y: point.v };
  const inRect = (panel) => point.u >= panel.u0 && point.u <= panel.u1 && point.v >= panel.v0 && point.v <= panel.v1;
  return (
    panels.find((panel) => {
      if (!inRect(panel)) return false;
      if (!panel.regions?.length) return true;
      return panel.regions.some(
        (region) =>
          pointInPolygon(xy, uvRing(region.outline)) &&
          !(region.holes || []).some((hole) => pointInPolygon(xy, uvRing(hole))),
      );
    }) || null
  );
}
