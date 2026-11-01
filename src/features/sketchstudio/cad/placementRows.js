// Hole rows (Phase K, docs/sketch-studio-hole-row.md): a straight line of N
// equally spaced, identical holes, stored as ONE hole feature with a `row`
// record ({ count, pitch, direction }, part coordinates; cutPlacement.js
// resolveRow lays out the centres). The Hole tool runs this behaviour when
// its placement carries `row` (placementCuts.js dispatches here); all pure:
//
//   Place      first click = the first hole, exactly Phase J Hole Place;
//              the stage stays Place with placement.row.seed = true
//   direction  ("Place, seed set") the second click = the last hole: it sets
//              the direction and the spacing (rowFromEnd); ↑ ↓ the count;
//              Enter = the default row along the face's +X; Esc = back
//   Shape      the Phase J handles plus the end square (row-end) at the last
//              hole; ↑ ↓ the count (the spacing is kept)
//
// While the row is placed and shaped the viewport draws the row line — a
// dashed construction line through every centre with a tick at each hole —
// in the cut red; it goes when the row is applied.
import { numeric, vector } from './model.js';
import { mapPlacement, unmapPlacement } from './placement.js';
import { ROW_MAX_COUNT, resolveRow } from './cutPlacement.js';
import { cross, dot, normalize, toPlane, toWorld } from './sketchPlane.js';
import { snapValue } from './placementHandles.js';
// Cycle-safe: these are only called, never used while the modules load.
import { MIN_LENGTH, axisSegments, hostOperations, placeFrame, tidyDirection } from './placementTool.js';
import { faceCutFrame, memberAxisWorld, resolvedCut } from './placementCuts.js';

export const ROW_MIN_COUNT = 2;
export const ROW_DEFAULT_COUNT = 4;
// A free end within this of a face axis snaps onto it (degrees).
export const AXIS_SNAP_DEGREES = 3;
// Snap kinds that fix the end exactly: the spacing is not rounded and the
// direction not snapped to an axis.
const FEATURE_KINDS = ['vertex', 'midpoint', 'face centre', 'mark', 'hole centre'];
// A curved face that is not a round member's (spec §3.5).
export const ROW_CURVED = 'Hole row: pick a flat face, or a round tube to drill a row along it.';

export const ROW_HINTS = {
  place:
    'Hole row: click where the first hole goes · corners, midpoints, face centres, marks and hole centres snap · Esc cancels',
  direction: (count) =>
    `Hole row: click where the last hole goes · Shift locks to the face axes · snap points snap · ↑ ↓ change the count (${count}) · Enter takes the default · Esc goes back to the first hole`,
  member: (count) =>
    `Hole row: click where the last hole goes along the tube (the row follows its axis) · snap points snap · ↑ ↓ change the count (${count}) · Enter takes the default · Esc goes back to the first hole`,
  shape:
    'Hole row: drag the end square to set the spacing and direction (Shift locks to the face axes · type a value + Enter sets the spacing) · the first square moves the row · the arrow sets the depth (past the far face = through all) · the grip sets the diameter · ↑ ↓ change the count · Enter applies · Esc cancels',
};

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, s) => a.map((v) => v * s);
const neg = (a) => a.map((v) => (v ? -v : 0));
const tidy = (value, step = 1e-6) => {
  const result = Math.round(value / step) * step;
  const out = Number(result.toFixed(Math.max(0, Math.ceil(-Math.log10(step)))));
  return Object.is(out, -0) || Math.abs(out) < step ? 0 : out;
};
const fmt = (value) => String(Number(Number(value).toFixed(2)));
const num = (value, parameters, fallback = 0) => {
  try {
    return numeric(value, parameters || {});
  } catch {
    return fallback;
  }
};
const circleLoop = (r, c = [0, 0], n = 48) =>
  Array.from({ length: n }, (_, i) => [
    c[0] + r * Math.cos((i / n) * Math.PI * 2),
    c[1] + r * Math.sin((i / n) * Math.PI * 2),
  ]);

// ---------------------------------------------------------------- rules

// The spacing a row gets when Enter takes the default: 4 × Ø, at least
// 10 mm, rounded up to a multiple of 5 mm (Ø 6.6 → 30, Ø 3 → 15, Ø 10 → 40).
export function defaultPitch(diameter) {
  const raw = Math.max(10, 4 * (Number(diameter) || 0));
  return Math.ceil(raw / 5 - 1e-9) * 5;
}
export const clampCount = (count) => Math.max(ROW_MIN_COUNT, Math.min(ROW_MAX_COUNT, Math.round(count)));
// A new row's count and spacing: "Apply and place another" carries them in
// the template; else 4 holes, spacing set by the second click.
export function rowDefaults(template = null) {
  const row = template?.row;
  return { count: row?.count ?? ROW_DEFAULT_COUNT, pitch: row?.pitch ?? null };
}
// The count a draft works with (an expression from an edited row resolved).
export const rowCount = (count, parameters) => clampCount(num(count, parameters, ROW_DEFAULT_COUNT));
export const isFeatureSnap = (kind) =>
  Boolean(kind) && FEATURE_KINDS.some((k) => kind === k || kind === `ortho · ${k}`);

// The second click (or the end square) as a row (spec §3.2): `origin` the
// first centre, `end` the last hole's point, both world, on the face; `grid`
// the face grid frame (its x / y are the face axes). Returns null for an end
// on the first hole (a double click), else { direction (world unit), pitch,
// length, snapKind }:
//   - the direction snaps to ±grid.x / ±grid.y within AXIS_SNAP_DEGREES,
//     unless `free` (Alt) or the end came from a feature snap;
//   - the spacing is the length / (count − 1), rounded to the Move grid
//     `step` unless the end came from a feature snap (a row fits exactly
//     between two snapped points), and never below MIN_LENGTH.
// `axis` (a round member's axis, world unit): the row runs along it, toward
// the end's projection on it; the face-axis rules do not apply (spec §3.5).
export function rowFromEnd({ origin, end, count, step = 0, grid, free = false, snapKind = null, axis = null }) {
  const raw = sub(end, origin);
  if (axis) {
    const along = dot(raw, axis);
    if (Math.abs(along) < MIN_LENGTH) return null;
    const feature = isFeatureSnap(snapKind);
    let pitch = Math.abs(along) / (count - 1);
    if (!feature && step > 0) pitch = snapValue(pitch, step);
    pitch = Math.max(MIN_LENGTH, pitch);
    return {
      direction: scale(normalize(axis), Math.sign(along)),
      pitch,
      length: pitch * (count - 1),
      snapKind: feature ? snapKind : 'member axis',
    };
  }
  const n = grid?.normal ? normalize(grid.normal) : [0, 0, 1];
  const v = sub(raw, scale(n, dot(raw, n)));
  const length = Math.hypot(...v);
  if (length < MIN_LENGTH) return null;
  let direction = scale(v, 1 / length);
  let kind = snapKind || 'free';
  const feature = isFeatureSnap(kind);
  if (!free && !feature && grid?.x && grid?.y) {
    const limit = Math.cos((AXIS_SNAP_DEGREES * Math.PI) / 180);
    let best = null;
    for (const axis of [grid.x, neg(grid.x), grid.y, neg(grid.y)]) {
      const d = dot(direction, axis);
      if (d >= limit && (!best || d > best.d)) best = { d, axis };
    }
    if (best) {
      direction = normalize(best.axis);
      if (!String(kind).startsWith('ortho')) kind = 'axis';
    }
  }
  const along = feature ? length : Math.max(MIN_LENGTH, dot(v, direction));
  let pitch = along / (count - 1);
  if (!feature && step > 0) pitch = snapValue(pitch, step);
  pitch = Math.max(MIN_LENGTH, pitch);
  return { direction, pitch, length: pitch * (count - 1), snapKind: kind };
}

// The world centres of a row from its first centre.
export const rowCentres = (origin, direction, pitch, count) =>
  Array.from({ length: count }, (_, k) => add(origin, scale(direction, pitch * k)));

// The edge margin (spec §7): from the last centre `from2` along the row
// direction `dir2` to the face outline (segments [[u, v], [u, v]] in the face
// grid frame). { inside, distance }; null without an outline. A centre
// outside the outline (or inside an opening of it) is past the edge.
export function edgeMargin(outline2, from2, dir2) {
  if (!outline2?.length) return null;
  const [px, py] = from2;
  let inside = false;
  for (const [a, b] of outline2) {
    if (a[1] > py !== b[1] > py && px < a[0] + ((py - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside;
  }
  const l = Math.hypot(...dir2);
  if (!(l > 0)) return { inside, distance: null };
  const [dx, dy] = [dir2[0] / l, dir2[1] / l];
  let distance = null;
  for (const [a, b] of outline2) {
    const ex = b[0] - a[0],
      ey = b[1] - a[1];
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const wx = a[0] - px,
      wy = a[1] - py;
    const t = (wx * ey - wy * ex) / denom;
    const s = (wx * dy - wy * dx) / denom;
    if (t >= -1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && (distance == null || t < distance)) distance = Math.max(0, t);
  }
  return { inside, distance };
}
const marginText = (row, last) => {
  if (!row.outline?.length || !row.grid) return '';
  const g = row.grid;
  const m = edgeMargin(row.outline, toPlane(g, last).slice(0, 2), [dot(row.direction, g.x), dot(row.direction, g.y)]);
  if (!m) return '';
  if (!m.inside) return ' · past the edge';
  return m.distance == null ? '' : ` · ${fmt(m.distance)} mm to the edge`;
};

// The row direction named against the face grid: +X / −X / +Y / −Y, else
// the angle from the face's +X ("at 30°").
export function rowDirectionLabel(direction, grid) {
  const u = dot(direction, grid.x),
    v = dot(direction, grid.y);
  for (const [value, name] of [
    [u, 'X'],
    [v, 'Y'],
  ])
    if (Math.abs(Math.abs(value) - 1) < 1e-6) return `${value > 0 ? '+' : '−'}${name}`;
  return `at ${fmt((Math.atan2(v, u) * 180) / Math.PI)}°`;
}
// A round member's row: along its axis (start → end) or back toward its start.
const memberLabel = (direction, axis) => (dot(direction, axis) > 0 ? 'the member' : 'the member, toward its start');
// The face grid for a cut frame without a picked face (an edited row): the
// upright axes of the face, as the viewport's face frame uses.
const uprightGrid = (frame) => placeFrame(frame.origin, neg(frame.normal));
// The plane frame on a round member's tangent plane at the seed: x along the axis.
const axisGrid = (frame, axis) => ({
  origin: [...frame.origin],
  x: [...axis],
  y: normalize(cross(frame.normal, axis)),
  normal: [...frame.normal],
});

// ---------------------------------------------------------------- drawing

// The row line, as existing extras (spec §5): the dashed axis through the
// first and last centres (it overshoots both, a construction line) and a
// tick square to the row at every hole, 1.2 × Ø long. `row: true` draws them
// in the cut red with no "axis" tag.
export function rowExtras(centres, direction, normal, diameter) {
  if (centres.length < 2) return [];
  const across = normalize(cross(normal, direction));
  const half = 0.6 * (diameter || 1);
  return [
    { kind: 'axis', a: [...centres[0]], b: [...centres.at(-1)], row: true },
    {
      kind: 'outline',
      row: true,
      segments: centres.map((c) => [add(c, scale(across, -half)), add(c, scale(across, half))]),
    },
  ];
}
const loopsAt = (frame, centres, radius) => centres.map((c) => circleLoop(radius, toPlane(frame, c).slice(0, 2)));

// ---------------------------------------------------------------- start

// A Hole tool's placement record with the row flag (spec §3, §4.4).
export function rowPlacement(template, existingFeature) {
  if (existingFeature) {
    const r = existingFeature.row;
    return r ? { count: r.count, pitch: r.pitch, seed: false } : null;
  }
  return { ...rowDefaults(template), seed: false };
}

// ---------------------------------------------------------------- clicks

// The first click of a row: `placed` is the draft the plain Hole click made
// (stage Shape); keep Place, drop any row from the feature (the preview shows
// one hole) and remember where the seed sits.
export function seedRow(draft, placed, info, ctx) {
  const { row: _row, ...seed } = placed.feature;
  const p = placed.placement;
  let frame,
    grid,
    axis = null;
  if (!info.planar) {
    // A round member (spec §3.5): the row runs along its axis.
    const cut = resolvedCut({ ...placed, feature: seed }, ctx);
    axis = cut ? memberAxisWorld(seed, cut, ctx.parameters || {}) : null;
    if (!axis) throw new Error(ROW_CURVED);
    frame = cut.frame;
    grid = axisGrid(frame, axis);
  } else {
    const ops = hostOperations(placed, ctx);
    frame = faceCutFrame(mapPlacement(seed.position, ops), info.normal, ops);
    grid = info.faceFrame || uprightGrid(frame);
  }
  return {
    ...placed,
    feature: seed,
    placement: {
      ...p,
      stage: 'place',
      frame,
      grid,
      axis,
      outline: info.planar && info.outline?.length ? info.outline : null,
      row: {
        count: p.row.count,
        pitch: p.row.pitch,
        seed: true,
        before: { feature: draft.feature, partId: draft.partId, placement: draft.placement },
      },
    },
  };
}

// The second click: the last hole (info.kind 'path', already projected onto
// the seed's plane and snapped by the viewport; info.step / info.free / the
// snap kind say how).
export function placeRowEnd(draft, info, ctx) {
  const p = draft.placement;
  const parameters = ctx.parameters || {};
  const count = rowCount(p.row.count, parameters);
  if (info.kind === 'path' && info.along != null) {
    // Typed in the direction stage: the spacing along the hovered direction.
    const pitch = Math.max(MIN_LENGTH, tidy(Math.abs(Number(info.along)), 1e-4));
    if (!Number.isFinite(pitch)) throw new Error('Type a spacing in millimetres.');
    const n = normalize((p.grid || p.frame).normal);
    const raw = info.direction || (p.grid || p.frame).x;
    let direction = normalize(sub(raw, scale(n, dot(raw, n))));
    if (p.axis) direction = scale(p.axis, dot(direction, p.axis) < 0 ? -1 : 1);
    return withRow(draft, ctx, {
      count: typeof p.row.count === 'string' ? p.row.count : count,
      pitch,
      direction,
      snapKind: 'typed',
    });
  }
  if (info.kind !== 'path' || !info.point) throw new Error('Click where the last hole goes.');
  const result = rowFromEnd({
    origin: p.frame.origin,
    end: info.point,
    count,
    step: info.step ?? ctx.snap ?? 0,
    grid: p.grid || p.frame,
    free: Boolean(info.free),
    snapKind: info.snapKind || null,
    axis: p.axis || null,
  });
  if (!result) return draft;
  return withRow(draft, ctx, {
    count: typeof p.row.count === 'string' ? p.row.count : count,
    pitch: tidy(result.pitch, 1e-4),
    direction: result.direction,
    snapKind: result.snapKind,
  });
}
function withRow(draft, ctx, { count, pitch, direction, snapKind = null }) {
  const p = draft.placement;
  const ops = hostOperations(draft, ctx);
  const local = tidyDirection(unmapPlacement(direction, ops, true));
  return {
    ...draft,
    feature: { ...draft.feature, row: { count, pitch, direction: local } },
    placement: { ...p, stage: 'shape', row: { count, pitch, seed: false }, snapKind, problem: '' },
  };
}

// Enter in the direction stage (spec §3.3): the default row along the face's
// +X — the carried spacing, else defaultPitch(Ø).
export function finishRowSeed(draft, ctx) {
  const p = draft.placement;
  const parameters = ctx.parameters || {};
  const pitch = p.row.pitch != null ? p.row.pitch : defaultPitch(num(draft.feature?.diameter, parameters, 6));
  const grid = p.grid || p.frame;
  return withRow(draft, ctx, {
    count: typeof p.row.count === 'string' ? p.row.count : rowCount(p.row.count, parameters),
    pitch,
    direction: normalize(p.axis || grid.x),
  });
}

// Esc in the direction stage: back to the first click (the draft as it was
// before it: nothing placed, or the kept preview of a Re-place).
export function rowStepBack(draft) {
  const p = draft.placement;
  const before = p.row.before || { feature: null, partId: null, placement: { ...p, frame: undefined } };
  return {
    ...draft,
    feature: before.feature,
    partId: before.partId,
    placement: {
      ...before.placement,
      stage: 'place',
      row: { count: p.row.count, pitch: p.row.pitch, seed: false },
      problem: '',
    },
  };
}

// ↑ / ↓ (spec §3.4): count ± 1 within 2 … 100. The direction stage changes
// the count the second click uses; Shape changes the feature's, keeping the
// spacing (the row grows or shrinks at its end). Unchanged at a limit.
export function changeRowCount(draft, delta, ctx = {}) {
  const p = draft.placement;
  const parameters = ctx.parameters || {};
  if (p?.row?.seed && p.stage === 'place') {
    const current = rowCount(p.row.count, parameters);
    const next = clampCount(current + delta);
    if (next === current && typeof p.row.count === 'number') return draft;
    return { ...draft, placement: { ...p, row: { ...p.row, count: next } } };
  }
  const row = draft.feature?.row;
  if (!row) return draft;
  const current = num(row.count, parameters, NaN);
  if (!Number.isFinite(current)) return draft;
  const next = clampCount(current + delta);
  if (next === current) return draft;
  return {
    ...draft,
    feature: { ...draft.feature, row: { ...row, count: next } },
    ...(p?.row ? { placement: { ...p, row: { ...p.row, count: next } } } : {}),
  };
}

// Flip direction: the row runs the other way from the first hole.
export function flipRow(feature, parameters = {}) {
  const direction = vector(feature.row.direction, parameters).map((v) => tidy(v ? -v : 0, 1e-9));
  return { ...feature, row: { ...feature.row, direction } };
}
// Row length typed (spec §6): the spacing it gives at the same count.
export function setRowLength(feature, length, parameters = {}) {
  const count = numeric(feature.row.count, parameters, 'Holes in a row');
  const value = numeric(length, parameters, 'Row length');
  if (!(count > 1)) throw new Error('A row needs 2 or more holes for a length.');
  if (!(value > 0)) throw new Error('Row length must be greater than zero.');
  return { ...feature, row: { ...feature.row, pitch: Math.max(MIN_LENGTH, tidy(value / (count - 1), 1e-4)) } };
}

// ---------------------------------------------------------------- drags

// The end square's completed drag (spec §5): a point through rowFromEnd with
// the drag's snap kind, or typed digits as { along } = the spacing along the
// current direction. Count fixed. `cut` = placementCuts' resolved cut.
export function applyRowDrag(draft, change, ctx, cut, axis = null) {
  const f = draft.feature;
  if (!f?.row) throw new Error('This hole has no row.');
  if (!cut) throw new Error('This row needs current geometry before changing it.');
  const parameters = ctx.parameters || {};
  const { value } = change;
  if (value && typeof value === 'object' && !Array.isArray(value) && value.along != null) {
    const pitch = Math.max(MIN_LENGTH, tidy(Math.abs(Number(value.along)), 1e-4));
    if (!Number.isFinite(pitch)) throw new Error('Type a spacing in millimetres.');
    return syncPlacement({ ...draft, feature: { ...f, row: { ...f.row, pitch } } });
  }
  const count = num(f.row.count, parameters, NaN);
  if (!(count > 1)) throw new Error('A row needs 2 or more holes to drag its end.');
  const result = rowFromEnd({
    origin: cut.frame.origin,
    end: value,
    count,
    step: change.step ?? ctx.snap ?? 0,
    grid: axis ? axisGrid(cut.frame, axis) : draft.placement.grid || uprightGrid(cut.frame),
    free: Boolean(change.free),
    snapKind: change.snapKind || null,
    axis,
  });
  if (!result) return draft;
  const direction = tidyDirection(unmapPlacement(result.direction, cut.ops, true));
  return syncPlacement({
    ...draft,
    feature: { ...f, row: { ...f.row, pitch: tidy(result.pitch, 1e-4), direction } },
    placement: { ...draft.placement, snapKind: result.snapKind },
  });
}
const syncPlacement = (draft) =>
  draft.placement?.row
    ? {
        ...draft,
        placement: {
          ...draft.placement,
          row: { ...draft.placement.row, count: draft.feature.row.count, pitch: draft.feature.row.pitch },
        },
      }
    : draft;

// ---------------------------------------------------------------- views

// The direction stage (spec §3): the seed hole, the Sweep-style path pick on
// the seed's plane (face axes, so Shift locks to them) and view.row for the
// rubber row the viewport draws from the hovered end.
export function rowSeedView(draft, ctx, view) {
  const p = draft.placement;
  const parameters = ctx.parameters || {};
  const count = rowCount(p.row.count, parameters);
  const grid = p.grid || uprightGrid(p.frame);
  const diameter = num(draft.feature?.diameter, parameters, 6);
  view.hint = p.axis ? ROW_HINTS.member(count) : ROW_HINTS.direction(count);
  view.cut = true;
  view.path = {
    frame: { origin: [...p.frame.origin], x: grid.x, y: grid.y, normal: grid.normal },
    points: [[...p.frame.origin]],
    radius: 0,
  };
  view.shape = { kind: 'flat', frame: p.frame, loops: [circleLoop(diameter / 2)] };
  view.row = {
    seed: true,
    count,
    pitch: p.row.pitch ?? null,
    origin: [...p.frame.origin],
    frame: p.frame,
    grid,
    axis: p.axis || null,
    diameter,
    outline: p.outline || null,
  };
  return view;
}

// The rubber row while the direction stage hovers (pathHover from the
// viewport: { point, kind, step, free }): segments to draw, the HUD text and
// the row it would make. null without a usable end.
export function rowHover(view, hover) {
  const row = view?.row;
  if (!row?.seed || !hover?.point) return null;
  const result = rowFromEnd({
    origin: row.origin,
    end: hover.point,
    count: row.count,
    step: hover.step || 0,
    grid: row.grid,
    free: Boolean(hover.free),
    snapKind: hover.kind || null,
    axis: row.axis || null,
  });
  if (!result)
    return {
      segments: [],
      centres: [row.origin],
      text: `${row.count} holes · move to the last hole`,
      row: { count: row.count, pitch: null, length: 0 },
    };
  const centres = rowCentres(row.origin, result.direction, result.pitch, row.count);
  const segments = [];
  for (const loop of loopsAt(row.frame, centres, row.diameter / 2))
    loop.forEach((q, i) => segments.push([toWorld(row.frame, q), toWorld(row.frame, loop[(i + 1) % loop.length])]));
  const extras = rowExtras(centres, result.direction, row.frame.normal, row.diameter);
  segments.push(...axisSegments(extras[0]), ...extras[1].segments);
  const margin = marginText({ ...row, direction: result.direction }, centres.at(-1));
  return {
    segments,
    centres,
    text: `${row.count} holes · pitch ${fmt(result.pitch)} mm · ${fmt(result.length)} mm · ${result.snapKind}${margin}`,
    row: {
      count: row.count,
      pitch: result.pitch,
      length: result.length,
      direction: result.direction,
      snapKind: result.snapKind,
    },
  };
}

// Shape (spec §5): every hole in the prism ghost, the row line and the end
// square at the last hole. `cut` = placementCuts' resolved cut. A count of 1
// (an expression) or an unresolvable row leaves the single-hole view.
export function rowView(draft, ctx, view, cut, baseHint, axis = null) {
  const f = draft.feature;
  const p = draft.placement;
  const parameters = ctx.parameters || {};
  let row;
  try {
    row = resolveRow(f, cut.local, parameters);
  } catch {
    return view;
  }
  if (!row || row.count < 2) return view;
  if (baseHint && view.hint.startsWith(baseHint)) view.hint = ROW_HINTS.shape + view.hint.slice(baseHint.length);
  const frame = cut.frame;
  const centres = row.centres.map((c) => mapPlacement(c, cut.ops));
  const direction = normalize(mapPlacement(row.direction, cut.ops, true));
  const diameter = num(f.diameter, parameters, 6);
  const grid = axis ? axisGrid(frame, axis) : p.grid || uprightGrid(frame);
  if (view.shape) view.shape = { ...view.shape, loops: loopsAt(frame, centres, diameter / 2) };
  view.extras.push(...rowExtras(centres, direction, frame.normal, diameter));
  view.handles.push({
    id: 'row-end',
    kind: 'square',
    at: [...centres.at(-1)],
    frame: { ...frame, origin: [...centres.at(-1)] },
    grid,
    typing: true,
    orthoFrom: [...frame.origin],
    expression: typeof f.row.pitch === 'string' ? f.row.pitch : null,
  });
  view.row = {
    seed: false,
    count: row.count,
    pitch: row.pitch,
    length: row.pitch * (row.count - 1),
    direction,
    origin: [...frame.origin],
    frame,
    grid,
    axis,
    diameter,
    outline: p.outline || null,
  };
  return view;
}

// The live view while a row handle is dragged (the draft changes on
// release): the end square re-lays every hole from the live end, the
// diameter grip resizes them all. `meta` = the drag's { snapKind, step, free }.
export function rowDragView(view, id, value, meta = {}) {
  const row = view.row;
  const handles = view.handles.map((h) => ({ ...h }));
  const next = { ...view, handles, shape: view.shape ? { ...view.shape } : null, extras: [...(view.extras || [])] };
  const handle = handles.find((h) => h.id === id);
  if (!handle || !row) return next;
  let { direction, pitch } = row;
  let diameter = row.diameter;
  if (id === 'row-end') {
    if (value && !Array.isArray(value) && value.along != null)
      pitch = Math.max(MIN_LENGTH, Math.abs(Number(value.along)) || 0);
    else {
      const result = rowFromEnd({
        origin: row.origin,
        end: value,
        count: row.count,
        step: meta.step || 0,
        grid: row.grid,
        free: Boolean(meta.free),
        snapKind: meta.snapKind || null,
        axis: row.axis || null,
      });
      if (!result) return next;
      ({ direction, pitch } = result);
    }
  } else if (id === 'radius') {
    diameter = 2 * value.radius;
    handle.at = toWorld(handle.frame, [handle.centre2[0] + value.radius, handle.centre2[1]]);
  }
  const centres = rowCentres(row.origin, direction, pitch, row.count);
  if (next.shape) next.shape.loops = loopsAt(row.frame, centres, diameter / 2);
  next.extras = [...next.extras.filter((e) => !e.row), ...rowExtras(centres, direction, row.frame.normal, diameter)];
  const end = handles.find((h) => h.id === 'row-end');
  if (end) {
    end.at = [...centres.at(-1)];
    end.frame = { ...end.frame, origin: [...centres.at(-1)] };
  }
  next.row = { ...row, direction, pitch, diameter, length: pitch * (row.count - 1) };
  return next;
}
// The slide square moves the whole row: its line goes with it.
export function shiftRowExtras(extras, delta) {
  return extras.map((e) =>
    !e.row
      ? e
      : e.kind === 'axis'
        ? { ...e, a: add(e.a, delta), b: add(e.b, delta) }
        : { ...e, segments: e.segments.map(([a, b]) => [add(a, delta), add(b, delta)]) },
  );
}

// The end square's readout: "pitch 50 mm · 4 holes · 150 mm" (+ the margin).
export function rowReadout(view, value, meta = {}) {
  const live = rowDragView(view, 'row-end', value, meta).row;
  if (!live) return '';
  const last = add(live.origin, scale(live.direction, live.length));
  return `pitch ${fmt(live.pitch)} mm · ${live.count} holes · ${fmt(live.length)} mm${marginText(live, last)}`;
}

// ---------------------------------------------------------------- panel line

// The placement line (spec §6): `parts` = what cutSummary already knows
// ({ host, label, at, size, extent }).
export function rowSummary(draft, ctx, { host, label, at, size, extent, cut, axis = null }) {
  const p = draft.placement;
  const parameters = ctx.parameters || {};
  const where = at.map((v) => fmt(v)).join(', ');
  if (p.row?.seed && p.stage === 'place')
    return `First hole on ${host} · ${label} at (${where}) · click where the last hole goes`;
  let row = null;
  try {
    row = cut ? resolveRow(draft.feature, cut.local, parameters) : null;
  } catch {
    row = null;
  }
  if (!row || row.count < 2) return null;
  const direction = normalize(mapPlacement(row.direction, cut.ops, true));
  const along = axis ? memberLabel(direction, axis) : rowDirectionLabel(direction, p.grid || uprightGrid(cut.frame));
  return `Row of ${row.count} holes on ${host} · ${label} · from (${where}) along ${along} · pitch ${fmt(row.pitch)} mm · ${fmt(row.pitch * (row.count - 1))} mm · ${size} · ${extent}`;
}

// The panel's engraved direction readout: "+X of face · 0°" / "at 30°".
export function rowDirectionText(draft, ctx, cut, axis = null) {
  const parameters = ctx.parameters || {};
  try {
    const row = resolveRow(draft.feature, cut.local, parameters);
    if (!row?.direction) return '';
    const direction = normalize(mapPlacement(row.direction, cut.ops, true));
    if (axis) return `along ${memberLabel(direction, axis)}`;
    const grid = draft.placement?.grid || uprightGrid(cut.frame);
    const label = rowDirectionLabel(direction, grid);
    const angle = (Math.atan2(dot(direction, grid.y), dot(direction, grid.x)) * 180) / Math.PI;
    return label.startsWith('at') ? label : `${label} of face · ${fmt(tidy(angle, 0.01))}°`;
  } catch {
    return '';
  }
}

// The tree heading's count ("hole ×4 · feature 3"): the resolved count, or
// the expression as typed when it does not resolve.
export const rowCountLabel = (row, parameters) => num(row?.count, parameters, row?.count);
