// The laser station (docs/sketch-studio-fab-shop.md §9 SM-4, numbers §8.5):
// the blank of a sheet-metal part nested on a stock sheet, the cut path the
// head follows (a pierce, then the contour; the cut-outs first, the outline
// last, so the part never drops out before its holes are cut), the readouts
// (cut length, pierces, cut time, kerf, sheet use) and the checks a laser
// programmer makes (holes too small for the thickness, webs too thin, a part
// larger than the sheet). Pure: models and plain arrays in and out.
//
// The station changes nothing in the solid (Cut from sheet already made the
// blank). It records only the sheet choice (model.fabrication.shop.sheet) and,
// with "Etch bend lines", the feature's marks (§4.1).
//
// SN-1 (docs/sketch-studio-outline-edit-sheet-nest.md §4): the stock sheet is
// derived from the model — every blank of one stock and thickness shares it
// (`sheetNest`), a blank is an instance, and one cut is a job of blanks that
// may come from several parts.
import { foldSheet, polygonBounds, profilePolygon, sheetMetalFeature } from './sheetMetal.js';
import { blankBaseName, numeric, uid } from './model.js';
import {
  DEFAULT_LASER_SHEET,
  LASER_PART_GAP,
  LASER_RANGE,
  LASER_SHEETS,
  LASER_SHEET_MARGIN,
  laserCutTime,
  laserKerf,
  laserSheetOf,
  laserSpeed,
  pierceTime,
} from './shopCatalog.js';

// How long a cut animation lasts, in seconds of the watcher's time: the
// machine's own time, stretched to at least `min` or squeezed to at most `max`.
export const LASER_WATCH = Object.freeze({ min: 6, max: 15 });
// The most copies the quantity field takes: since SN-1 each is an instance in
// the model (and a mesh in the view), so a shop-sized run, not a stress test.
export const MAX_LASER_QUANTITY = 100;

/**
 * The stock sheet a blank `width` × `height` (mm, as drawn: the laser never
 * turns a blank) is cut from: `current` when it holds it inside its margins,
 * else the first catalogue sheet that does (the smallest), or null when none
 * does. The panel maker's Create and the replay's laser scenes share it.
 */
export function sheetHolding(width, height, current = DEFAULT_LASER_SHEET) {
  const holds = (key) => {
    const s = LASER_SHEETS[key];
    return Boolean(s) && width <= s.width - 2 * LASER_SHEET_MARGIN && height <= s.height - 2 * LASER_SHEET_MARGIN;
  };
  return holds(current) ? current : Object.keys(LASER_SHEETS).find(holds) || null;
}

const fmt = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—');
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const ringLength = (ring) => ring.reduce((sum, p, i) => sum + Math.hypot(...sub(ring[(i + 1) % ring.length], p)), 0);

/**
 * The machine's numbers for one blank (§8.5): kerf, cutting speed (m/min, by
 * stock family and thickness), pierce time, the time per blank (pierces ×
 * pierce time + cut length / speed) and for `quantity` blanks. `beyond`: the
 * thickness is outside the 1 – 6 mm the speed table covers.
 */
export function laserNumbers({ cutLength, pierces, stock, thickness, quantity = 1 }) {
  const perBlank = laserCutTime({ cutLength, pierces, stock, thickness });
  return {
    kerf: laserKerf(thickness),
    speed: laserSpeed(stock, thickness),
    pierceTime: pierceTime(thickness),
    cutLength,
    pierces,
    perBlank,
    quantity,
    time: perBlank * quantity,
    beyond: thickness < LASER_RANGE.min - 1e-9 || thickness > LASER_RANGE.max + 1e-9,
  };
}

// The ring turned to start at index k.
const rotate = (ring, k) => [...ring.slice(k), ...ring.slice(0, k)];
const nearestIndex = (ring, point) => {
  let best = 0,
    bestDistance = Infinity;
  ring.forEach((p, i) => {
    const d = Math.hypot(...sub(p, point));
    if (d < bestDistance) [best, bestDistance] = [i, d];
  });
  return best;
};

/**
 * The order the head cuts one blank: every cut-out first (nearest one next,
 * from `start`), the outline last; each contour starts at its pierce point
 * (the vertex nearest the head) and runs back round to it. Returns
 * [{ kind: 'hole' | 'outline', index (the cut-out's own index), ring (from
 * the pierce point), pierce, length (of the sampled polyline) }].
 */
export function cutPlan({ outer, holes }, start = null) {
  const plan = [];
  let head = start || polygonBounds(outer)[0];
  const left = holes.map((ring, index) => ({ ring, index }));
  while (left.length) {
    let pick = 0,
      pickDistance = Infinity;
    left.forEach(({ ring }, i) => {
      const d = Math.hypot(...sub(ring[nearestIndex(ring, head)], head));
      if (d < pickDistance) [pick, pickDistance] = [i, d];
    });
    const [{ ring, index }] = left.splice(pick, 1);
    const turned = rotate(ring, nearestIndex(ring, head));
    plan.push({ kind: 'hole', index, ring: turned, pierce: turned[0], length: ringLength(turned) });
    head = turned[0];
  }
  const turned = rotate(outer, nearestIndex(outer, head));
  plan.push({ kind: 'outline', index: 0, ring: turned, pierce: turned[0], length: ringLength(turned) });
  return plan;
}

/**
 * The machine clock of a cut: for each contour of each copy, its pierce
 * (pierce time) then its cut (its share of the blank's exact cut length at
 * the cutting speed). Rapid moves between contours take no time (§8.5 counts
 * only pierces and cutting). `contours`: [{ ring, length, … }] in cutting
 * order; `numbers`: laserNumbers. Returns { segments: [{ start, cutStart,
 * end, contour }], total } in seconds.
 */
export function laserTimeline(contours, numbers, sampledPerBlank) {
  // The sampled polylines are a hair shorter than the exact arcs: each one is
  // timed at its share of the exact length, so the clock ends on the readout.
  // A job of several parts (SN-1 §4.2) gives each contour its own blank's
  // `stretch`; the speed and the pierce are the job's (one stock, one thickness).
  const stretch = sampledPerBlank > 0 ? numbers.cutLength / sampledPerBlank : 1;
  const speed = (numbers.speed * 1000) / 60;
  let clock = 0;
  const segments = contours.map((contour) => {
    const start = clock,
      cutStart = start + numbers.pierceTime,
      end = cutStart + (contour.length * (contour.stretch ?? stretch)) / speed;
    clock = end;
    return { start, cutStart, end, contour };
  });
  return { segments, total: clock };
}

/** Where the head is `t` s into a timeline: { phase ('pierce' | 'cut' | 'done'), index, point, fraction }. */
export function headAt(timeline, t) {
  const { segments } = timeline;
  if (!segments.length) return { phase: 'done', index: -1, point: null, fraction: 1 };
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (t >= s.end) continue;
    if (t < s.cutStart) return { phase: 'pierce', index: i, point: s.contour.pierce, fraction: 0 };
    const fraction = (t - s.cutStart) / (s.end - s.cutStart || 1);
    return { phase: 'cut', index: i, point: pointAlong(s.contour.ring, fraction), fraction };
  }
  const last = segments.at(-1);
  return { phase: 'done', index: segments.length - 1, point: last.contour.pierce, fraction: 1 };
}

/** The point a `fraction` of the way round a closed ring, from its first vertex. */
export function pointAlong(ring, fraction) {
  const total = ringLength(ring);
  let left = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      q = ring[(i + 1) % ring.length];
    const length = Math.hypot(...sub(q, p));
    if (left <= length || i === ring.length - 1) {
      const f = length > 0 ? Math.min(1, left / length) : 0;
      return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    }
    left -= length;
  }
  return ring[0];
}

/** The polyline the head has cut a `fraction` of the way round a closed ring: its first vertex, the vertices passed, the head. */
export function partialRing(ring, fraction) {
  const total = ringLength(ring);
  let left = Math.max(0, Math.min(1, fraction)) * total;
  const out = [ring[0]];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      q = ring[(i + 1) % ring.length];
    const length = Math.hypot(...sub(q, p));
    if (left <= length) {
      const f = length > 0 ? left / length : 0;
      out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
      return out;
    }
    out.push(q);
    left -= length;
  }
  return out;
}

/** How long a cut of `seconds` machine time is shown: { duration (s), scale (machine s per shown s) }. */
export function animationScale(seconds) {
  const duration = Math.min(LASER_WATCH.max, Math.max(LASER_WATCH.min, seconds));
  return { duration, scale: duration > 0 ? seconds / duration : 1 };
}

// ---------------------------------------------------------------- checks
// Convex hull (monotone chain).
function hull(points) {
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (sorted.length < 3) return sorted;
  const lower = [],
    upper = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
/** A cut-out's size for the hole rules: its smallest width (rotating calipers over its hull). */
export function holeWidth(ring) {
  const h = hull(ring);
  if (h.length < 3) return 0;
  let best = Infinity;
  for (let i = 0; i < h.length; i++) {
    const p = h[i],
      q = h[(i + 1) % h.length];
    const length = Math.hypot(...sub(q, p));
    if (!(length > 0)) continue;
    let far = 0;
    for (const r of h) far = Math.max(far, Math.abs(cross(p, q, r)) / length);
    best = Math.min(best, far);
  }
  return best;
}
// Distance between segments p–q and r–s (0 when they cross).
function segmentDistance(p, q, r, s) {
  const crosses =
    Math.sign(cross(r, s, p)) * Math.sign(cross(r, s, q)) < 0 &&
    Math.sign(cross(p, q, r)) * Math.sign(cross(p, q, s)) < 0;
  if (crosses) return 0;
  const toSegment = (x, a, b) => {
    const e = sub(b, a);
    const l2 = dot(e, e);
    const f = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(x, a), e) / l2)) : 0;
    return Math.hypot(x[0] - a[0] - e[0] * f, x[1] - a[1] - e[1] * f);
  };
  return Math.min(toSegment(p, r, s), toSegment(q, r, s), toSegment(r, p, q), toSegment(s, p, q));
}
const ringBox = (ring) => polygonBounds(ring);
const boxGap = ([a0, a1], [b0, b1]) =>
  Math.hypot(Math.max(0, b0[0] - a1[0], a0[0] - b1[0]), Math.max(0, b0[1] - a1[1], a0[1] - b1[1]));
/** The least distance between two rings' outlines. */
export function ringDistance(a, b) {
  let best = Infinity;
  for (let i = 0; i < a.length; i++) {
    const p = a[i],
      q = a[(i + 1) % a.length];
    const segment = [
      [Math.min(p[0], q[0]), Math.min(p[1], q[1])],
      [Math.max(p[0], q[0]), Math.max(p[1], q[1])],
    ];
    for (let j = 0; j < b.length; j++) {
      const r = b[j],
        s = b[(j + 1) % b.length];
      const other = [
        [Math.min(r[0], s[0]), Math.min(r[1], s[1])],
        [Math.max(r[0], s[0]), Math.max(r[1], s[1])],
      ];
      if (boxGap(segment, other) >= best) continue;
      best = Math.min(best, segmentDistance(p, q, r, s));
    }
  }
  return best;
}

// Distance from a point to a ring's outline.
function pointRingDistance(point, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      e = sub(ring[(i + 1) % ring.length], a);
    const l2 = dot(e, e);
    const f = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(point, a), e) / l2)) : 0;
    best = Math.min(best, Math.hypot(point[0] - a[0] - e[0] * f, point[1] - a[1] - e[1] * f));
  }
  return best;
}

/**
 * The cut-outs that are circles, exactly (index-aligned with the polygon's
 * holes): [{ center, radius } | null]. A sampled circle is a hair smaller
 * than the circle, so the checks measure these from the profile itself.
 */
export function profileCircles(profile, params = {}) {
  return (profile?.holes || []).map((hole) => {
    if (hole?.type !== 'circle') return null;
    try {
      const center = (hole.center || [0, 0]).map((v) => numeric(v, params));
      return { center, radius: numeric(hole.radius, params) };
    } catch {
      return null;
    }
  });
}

/**
 * The narrowest web of a blank: the least distance between two cut-outs, or
 * from a cut-out to the outline (exact for circles given in `circles`, else
 * between the sampled outlines). Returns { distance, between: [a, b] } (a, b:
 * cut-out indices or 'outline') or null when the blank has no cut-outs.
 */
export function narrowestWeb({ outer, holes }, circles = []) {
  let best = null;
  const boxes = holes.map(ringBox);
  const consider = (distance, between) => {
    if (!best || distance < best.distance) best = { distance, between };
  };
  holes.forEach((hole, i) => {
    const ci = circles[i];
    consider(ci ? pointRingDistance(ci.center, outer) - ci.radius : ringDistance(hole, outer), [i, 'outline']);
    for (let j = i + 1; j < holes.length; j++) {
      if (best && boxGap(boxes[i], boxes[j]) >= best.distance) continue;
      const cj = circles[j];
      const distance =
        ci && cj
          ? Math.hypot(...sub(ci.center, cj.center)) - ci.radius - cj.radius
          : ci
            ? pointRingDistance(ci.center, holes[j]) - ci.radius
            : cj
              ? pointRingDistance(cj.center, hole) - cj.radius
              : ringDistance(hole, holes[j]);
      consider(distance, [i, j]);
    }
  });
  return best;
}

const holeName = (index) => `Cut-out ${index + 1}`;
const webName = ([a, b]) => `${holeName(a)} ${b === 'outline' ? 'to the outline' : `to ${holeName(b).toLowerCase()}`}`;

/**
 * The laser programmer's checks (§8.5) with their remedies. Refusals (the
 * Cut button stays off): a cut-out narrower than 0.5 t (the beam cannot cut a
 * clean hole that small) and a blank larger than the sheet. Warnings: a
 * cut-out narrower than t, a web below 0.5 t, a thickness outside the speed
 * table. `profile` (the blank's own) makes circles exact. Returns {
 * refusals, warnings, holes: [{ index, width }], web }.
 */
export function laserChecks({ polygon, thickness, sheet, flat, profile = null, params = {} }) {
  const refusals = [],
    warnings = [];
  const t = thickness;
  const circles = profileCircles(profile, params);
  const holes = polygon.holes.map((ring, index) => ({
    index,
    width: circles[index] ? 2 * circles[index].radius : holeWidth(ring),
  }));
  for (const { index, width } of holes) {
    if (width < 0.5 * t - 1e-9)
      refusals.push({
        code: 'tiny-hole',
        message: `${holeName(index)} is ${fmt(width)} mm across: below 0.5 t (${fmt(0.5 * t)} mm) the beam cannot cut it clean. Make it at least ${fmt(0.5 * t)} mm, or leave it out of the blank and drill it after cutting.`,
      });
    else if (width < t - 1e-9)
      warnings.push({
        code: 'small-hole',
        message: `${holeName(index)} is ${fmt(width)} mm across, under the sheet thickness (${fmt(t)} mm): it cuts with a rough, tapered wall. Make it at least ${fmt(t)} mm, or drill it to size after cutting.`,
      });
  }
  const web = narrowestWeb(polygon, circles);
  if (web && web.distance < 0.5 * t - 1e-9)
    warnings.push({
      code: 'thin-web',
      message: `${webName(web.between)}: the web is ${fmt(web.distance)} mm, below 0.5 t (${fmt(0.5 * t)} mm); it burns through or warps. Move the cut-outs at least ${fmt(0.5 * t)} mm apart.`,
    });
  const usable = [sheet.width - 2 * LASER_SHEET_MARGIN, sheet.height - 2 * LASER_SHEET_MARGIN];
  if (flat.width > usable[0] + 1e-9 || flat.height > usable[1] + 1e-9) {
    const larger = Object.values(LASER_SHEETS).find(
      (s) => flat.width <= s.width - 2 * LASER_SHEET_MARGIN && flat.height <= s.height - 2 * LASER_SHEET_MARGIN,
    );
    refusals.push({
      code: 'sheet',
      message: `The blank is ${fmt(flat.width)} × ${fmt(flat.height)} mm; the ${sheet.name} sheet holds ${fmt(usable[0])} × ${fmt(usable[1])} mm inside its ${LASER_SHEET_MARGIN} mm edge. ${larger ? `Choose the ${larger.name} sheet.` : 'No sheet in the shop is large enough: split the part.'}`,
    });
  }
  if (t < LASER_RANGE.min - 1e-9 || t > LASER_RANGE.max + 1e-9)
    warnings.push({
      code: 'thickness-range',
      message: `The cutting table covers ${LASER_RANGE.min} – ${LASER_RANGE.max} mm; ${fmt(t)} mm is timed at the ${fmt(t < LASER_RANGE.min ? LASER_RANGE.min : LASER_RANGE.max)} mm speed and pierce.`,
    });
  return { refusals, warnings, holes, web };
}

/**
 * The shelf packer of the stock sheet (SN-1 §4.1), first fit, never rotated:
 * each blank (its own bounds [[x0, y0], [x1, y1]], in order) goes on the first
 * sheet and the first shelf there with room — width left on the shelf, and the
 * blank no taller than the shelf, except that a sheet's last shelf grows while
 * the sheet has height left — else on a new shelf, else on the next sheet,
 * else on a new sheet. Placing a blank never moves an earlier one. Each blank
 * reserves its size plus LASER_PART_GAP (the gap stands in for the kerf; the
 * last one's may run into the margin), inside LASER_SHEET_MARGIN. For blanks
 * of one size this is exactly the cut list's packer (fabrication.js
 * planSheets), so one part alone nests as it did before SN-1. Returns {
 * placements: [{ sheet (0-based), offset: [dx, dy] (added to the blank's own
 * X, Y) } | null (larger than the sheet)], sheets (the count) }.
 */
function shelfPack(boxes, sheet) {
  const gap = LASER_PART_GAP,
    margin = LASER_SHEET_MARGIN;
  const width = sheet.width - 2 * margin + gap,
    height = sheet.height - 2 * margin + gap;
  // Per sheet, its shelves: { y, height (its tallest blank), x (the width used) }.
  const sheets = [];
  const placements = boxes.map(([[x0, y0], [x1, y1]]) => {
    const w = x1 - x0 + gap,
      h = y1 - y0 + gap;
    if (w > width || h > height) return null;
    for (let s = 0; ; s++) {
      if (s === sheets.length) sheets.push([]);
      const shelves = sheets[s];
      let shelf = shelves.find(
        (f, i) => f.x + w <= width && (h <= f.height || (i === shelves.length - 1 && f.y + h <= height)),
      );
      if (!shelf) {
        const last = shelves.at(-1);
        const y = last ? last.y + last.height : 0;
        if (y + h > height) continue;
        shelf = { y, height: 0, x: 0 };
        shelves.push(shelf);
      }
      const offset = [margin + shelf.x - x0, margin + shelf.y - y0];
      shelf.x += w;
      shelf.height = Math.max(shelf.height, h);
      return { sheet: s, offset };
    }
  });
  return { placements, sheets: sheets.length };
}

/**
 * `quantity` copies of one blank on the sheet (the shelf packer above):
 * LASER_PART_GAP between copies, LASER_SHEET_MARGIN from the sheet edge.
 * Returns { copies: [{ copy, sheet (1-based), offset: [dx, dy] (added to the
 * blank's own X, Y) }], sheets, use (the share of the sheets' area the blanks
 * take) } or throws when it does not fit. Kept for its numbers (the tests pin
 * them): `sheetNest` places one part's copies exactly here.
 */
export function nestBlanks({ bounds, area, quantity, sheet }) {
  const { placements, sheets } = shelfPack(
    Array.from({ length: quantity }, () => bounds),
    sheet,
  );
  if (placements.some((p) => !p)) throw new Error('The blank exceeds sheet stock dimensions.');
  const copies = placements.map((p, i) => ({ copy: i + 1, sheet: p.sheet + 1, offset: p.offset }));
  return { copies, sheets, use: (quantity * area) / (sheets * sheet.width * sheet.height) };
}

// One stock, one thickness: equal within 1e-6 mm (§4.1).
const sameThickness = (a, b) => Math.abs(a - b) <= 1e-6;
const thicknessOf = (feature, params) => {
  try {
    return numeric(feature.thickness, params);
  } catch {
    return NaN;
  }
};
/**
 * Two sheet-metal features of one lot (docs/sketch-studio-own-bends.md §3):
 * cut from the same outline (`sketchId`) in the same stock and thickness
 * (sameThickness; a thickness that does not read as a number only matches the
 * same text). The one rule: shopRoute.js lotOf and the station's Quantity use it.
 */
export function sameLot(a, b, params = {}) {
  if (!a || !b || a.sketchId !== b.sketchId || (a.stock || 'spcc') !== (b.stock || 'spcc')) return false;
  const [ta, tb] = [thicknessOf(a, params), thicknessOf(b, params)];
  if (Number.isFinite(ta) && Number.isFinite(tb)) return sameThickness(ta, tb);
  return !Number.isFinite(ta) && !Number.isFinite(tb) && String(a.thickness) === String(b.thickness);
}
/** The instances of `feature`'s lot in the model, in model order (sameLot). */
export function lotInstances(model, feature, params = {}) {
  const parts = new Map(model.parts.map((p) => [p.id, p]));
  const member = new Map();
  return model.instances.filter((i) => {
    if (!member.has(i.partId)) member.set(i.partId, sameLot(feature, sheetMetalFeature(parts.get(i.partId)), params));
    return member.get(i.partId);
  });
}
/**
 * Every instance, in model order, whose part's sheet-metal blank is `stock`
 * at `thickness` and folds: [{ instance, part, feature, profile, fold }].
 * One foldSheet per part, kept in `folds` (partId → { part, feature, profile,
 * fold } or null), which a caller may share or seed.
 */
function stockBlanks(model, { stock, thickness, params = {}, folds = new Map() }) {
  const parts = new Map(model.parts.map((p) => [p.id, p]));
  const out = [];
  for (const instance of model.instances) {
    let entry = folds.get(instance.partId);
    if (entry === undefined) {
      entry = null;
      const part = parts.get(instance.partId);
      const feature = sheetMetalFeature(part);
      if (feature) {
        // Another stock or thickness is never folded here: read from the feature first.
        let t = NaN;
        try {
          t = numeric(feature.thickness, params);
        } catch {
          t = NaN;
        }
        if ((feature.stock || 'spcc') === stock && sameThickness(t, thickness)) {
          const profile = model.sketches.find((s) => s.id === feature.sketchId)?.profile || null;
          try {
            entry = { part, feature, profile, fold: foldSheet(feature, profile, params) };
          } catch {
            entry = null;
          }
        }
      }
      folds.set(instance.partId, entry);
    }
    if (entry && entry.fold.stock === stock && sameThickness(entry.fold.thickness, thickness))
      out.push({ instance, ...entry });
  }
  return out;
}
// The nest of stockBlanks' entries on `sheet` (sheetNest's result).
function nestOf(entries, sheet) {
  const { placements, sheets: count } = shelfPack(
    entries.map((e) => e.fold.flat.bounds),
    sheet,
  );
  const sheets = Array.from({ length: count }, (_, index) => ({ index, blanks: [] }));
  const oversize = [];
  // The blanks' area by part (copies × area), so one part alone reads as before.
  const areas = new Map();
  placements.forEach((p, i) => {
    const { instance, part, fold } = entries[i];
    if (!p) return oversize.push(instance.id);
    const { width, height, area } = fold.flat;
    sheets[p.sheet].blanks.push({ instanceId: instance.id, partId: part.id, offset: p.offset, width, height, area });
    const a = areas.get(part.id) || { area, copies: 0 };
    a.copies++;
    areas.set(part.id, a);
  });
  const total = [...areas.values()].reduce((sum, a) => sum + a.copies * a.area, 0);
  return {
    sheet,
    sheets,
    use: count ? total / (count * sheet.width * sheet.height) : 0,
    oversize,
  };
}

/**
 * The stock sheet of `stock` at `thickness` (SN-1 §4.1): every instance in
 * model order whose part's sheet-metal blank is of this stock and thickness
 * and folds, packed first-fit on shelves (shelfPack). `sheetKey`: the stock
 * sheet (the model's, else the default; an unknown key is the default).
 * Returns { sheet, sheets: [{ index (0-based), blanks: [{ instanceId, partId,
 * offset: [dx, dy], width, height, area }] }], use (the placed blanks' area
 * over the sheets' area), oversize: [instanceId] (larger than the sheet, left
 * out) }. Pure; `folds` (partId → fold entry) may be shared with the caller.
 */
export function sheetNest(model, { stock, thickness, sheetKey = null, params = {}, folds = new Map() }) {
  const key = sheetKey ?? model.fabrication?.shop?.sheet ?? DEFAULT_LASER_SHEET;
  const sheet = laserSheetOf(LASER_SHEETS[key] ? key : DEFAULT_LASER_SHEET);
  return nestOf(stockBlanks(model, { stock, thickness, params, folds }), sheet);
}

/**
 * "Etch bend lines": the current bends' punch lines as marks (§4.1), one per
 * bend-zone interval, on the blank's own X, Y. They replace the marks the
 * feature had. Rounded to 0.0001 mm.
 */
export function etchBendMarks(fold) {
  const round = (v) => Math.round(v * 1e4) / 1e4;
  return fold.bends.flatMap((bend) =>
    bend.intervals.map(([s0, s1]) => ({
      id: uid('mark'),
      a: [round(bend.a[0] + bend.u[0] * s0), round(bend.a[1] + bend.u[1] * s0)],
      b: [round(bend.a[0] + bend.u[0] * s1), round(bend.a[1] + bend.u[1] * s1)],
    })),
  );
}

/** The marks of a feature that are readable lines: [{ id, a, b }]. */
export const featureMarks = (feature) =>
  (feature?.marks || []).filter(
    (m) =>
      Array.isArray(m?.a) &&
      Array.isArray(m?.b) &&
      m.a.length === 2 &&
      m.b.length === 2 &&
      [...m.a, ...m.b].every((v) => Number.isFinite(Number(v))),
  );

const moved = (ring, [dx, dy]) => ring.map(([x, y]) => [x + dx, y + dy]);
const partName = (instance, part) => instance?.name || part?.name || 'Part';

/**
 * The station for `session` on `model` (SN-1 §4.2). `session`: { instanceId
 * (the lead: Quantity, Edit outline and the etched marks act on its part),
 * instanceIds (the job's instances when the session names them — a batch,
 * the replay's scene — else null: every blank of the lead's lot,
 * docs/sketch-studio-own-bends.md §4.4),
 * sheetIndex (the sheet shown, null: the one holding the lead), cutIds (the
 * replay: the instances already cut; null: every one on the sheet exists, so
 * is cut) }.
 *
 * Returns { closed } when the lead's part is gone or not sheet metal, {
 * error } when its blank does not fold, else the lead's own fields, as before
 * SN-1 — { instance, part, feature, polygon, fold, flat, thickness, stock,
 * sheet, sheetKey, sheetKnown, contours (one blank, cutting order), checks
 * (the lead's, for the readouts), marks } — and the job's: job (instance ids,
 * model order), parts (one row per lot in the job, job order: [{ partId,
 * instanceId (its first blank in the job), name (without its " #k"), copies
 * (its blanks in the job), flat, profile, numbers, lead }]), quantity (the
 * lead's lot in the model), numbers (the lead row's), time (the job's
 * machine time, every sheet), refusals / warnings (every job part's checks,
 * each with its partId, the message led by the part's name when the job holds
 * more than one part), nest (sheetNest), sheetIndex, blanks (the job's
 * instances on the shown sheet, nest order: { copy, instanceId, partId, name
 * (the instance's, else its own part's: "Tray #2"), offset, marks, lead (of
 * the lead's lot) }), plan (each blank's contours moved by its offset,
 * with its instanceId and copy), timeline, others (the other blanks on the
 * shown sheet: { instanceId, partId, name, rings, cut }), elsewhere ([{ index,
 * count }]: the job's blanks on the other sheets) and shownUse (the shown
 * sheet's blanks' area over its area). `nestError` stays '' (the nest leaves
 * an oversize blank out instead of throwing; its refusal says why).
 */
export function laserStation({ model, session, params = {} }) {
  const instance = model.instances.find((i) => i.id === session.instanceId);
  const part = model.parts.find((p) => p.id === instance?.partId);
  const feature = sheetMetalFeature(part);
  if (!feature) return { closed: true };
  const profile = model.sketches.find((s) => s.id === feature.sketchId)?.profile || null;
  let polygon, fold;
  try {
    polygon = profilePolygon(profile, params);
    fold = foldSheet(feature, profile, params);
  } catch (error) {
    return { error: error.message || String(error), part, feature };
  }
  const sheetKey = model.fabrication?.shop?.sheet || DEFAULT_LASER_SHEET;
  const sheetKnown = Boolean(LASER_SHEETS[sheetKey]);
  const sheet = laserSheetOf(sheetKnown ? sheetKey : DEFAULT_LASER_SHEET);
  const { flat, thickness, stock } = fold;
  const checks = laserChecks({ polygon, thickness, sheet, flat, profile, params });
  const contours = cutPlan(polygon);

  // Every blank of this stock and thickness (the lead's fold is not done twice).
  const folds = new Map([[part.id, { part, feature, profile, fold }]]);
  const eligible = stockBlanks(model, { stock, thickness, params, folds });
  if (!eligible.some((e) => e.instance.id === instance.id))
    eligible.unshift({ instance, part, feature, profile, fold });
  // The lot (docs/sketch-studio-own-bends.md §4.4): one piece of metal is one
  // part, so the blanks of the lead's outline are counted together. Every
  // entry here is of one stock and thickness, so a lot is one `sketchId`.
  const lotKey = (entry) => entry.feature.sketchId;
  const leadLot = feature.sketchId;
  const named = Array.isArray(session.instanceIds) ? new Set(session.instanceIds) : null;
  const job = eligible.filter(
    (e) => e.instance.id === instance.id || (named ? named.has(e.instance.id) : lotKey(e) === leadLot),
  );
  const inJob = new Set(job.map((e) => e.instance.id));

  // Per outline (§4.4): its polygon, cut order and checks, worked out once.
  const geometry = new Map([[leadLot, { polygon, contours, checks }]]);
  const geometryOf = (entry) => {
    let g = geometry.get(lotKey(entry));
    if (!g) {
      const p = profilePolygon(entry.profile, params);
      g = { polygon: p, contours: cutPlan(p), checks: null };
      geometry.set(lotKey(entry), g);
    }
    if (g.stretch == null) {
      const sampled = g.contours.reduce((sum, c) => sum + c.length, 0);
      g.stretch = sampled > 0 ? entry.fold.flat.cutLength / sampled : 1;
    }
    return g;
  };

  // The job's lots (§4.4), in job order, each with its blanks and machine
  // numbers: its first blank's part and instance, the name without its number.
  const rows = new Map();
  for (const e of job) {
    const row = rows.get(lotKey(e));
    if (row) row.copies++;
    else
      rows.set(lotKey(e), {
        partId: e.part.id,
        instanceId: e.instance.id,
        name: blankBaseName(e.part.name),
        copies: 1,
        flat: e.fold.flat,
        profile: e.profile,
        lead: lotKey(e) === leadLot,
        entry: e,
      });
  }
  const entries = new Map([...rows.values()].map((row) => [row.partId, row.entry]));
  const parts = [...rows.values()].map(({ entry: _entry, ...row }) => ({
    ...row,
    numbers: laserNumbers({
      cutLength: row.flat.cutLength,
      pierces: row.flat.pierces,
      stock,
      thickness,
      quantity: row.copies,
    }),
  }));
  const leadRow = parts.find((r) => r.lead);
  const numbers = leadRow.numbers;
  const time = parts.reduce((sum, r) => sum + r.numbers.time, 0);
  // The lead's lot in the model, whatever the job names (§4.4).
  const quantity = lotInstances(model, feature, params).length;
  const many = parts.length > 1;
  const refusals = [],
    warnings = [];
  for (const row of parts) {
    const g = geometryOf(entries.get(row.partId));
    g.checks ||= laserChecks({ polygon: g.polygon, thickness, sheet, flat: row.flat, profile: row.profile, params });
    const lead = (m) => (many ? `${row.name}: ${m}` : m);
    refusals.push(...g.checks.refusals.map((r) => ({ ...r, message: lead(r.message), partId: row.partId })));
    warnings.push(...g.checks.warnings.map((w) => ({ ...w, message: lead(w.message), partId: row.partId })));
  }

  // The shared sheet, the one shown and what is on it.
  const nest = nestOf(eligible, sheet);
  const where = new Map();
  nest.sheets.forEach((s) => s.blanks.forEach((b) => where.set(b.instanceId, { sheet: s.index, blank: b })));
  const requested = Number.isInteger(session.sheetIndex) ? session.sheetIndex : null;
  const sheetIndex =
    requested != null && requested >= 0 && requested < nest.sheets.length
      ? requested
      : (where.get(instance.id)?.sheet ?? 0);
  const entryOf = new Map(eligible.map((e) => [e.instance.id, e]));
  const cutIds = Array.isArray(session.cutIds) ? new Set(session.cutIds) : null;
  const blanks = [],
    others = [];
  for (const b of nest.sheets[sheetIndex]?.blanks || []) {
    const e = entryOf.get(b.instanceId);
    const name = partName(e.instance, e.part);
    if (inJob.has(b.instanceId))
      blanks.push({
        copy: blanks.length + 1,
        instanceId: b.instanceId,
        partId: b.partId,
        name,
        offset: b.offset,
        marks: featureMarks(e.feature),
        lead: lotKey(e) === leadLot,
      });
    else {
      const g = geometryOf(e);
      others.push({
        instanceId: b.instanceId,
        partId: b.partId,
        name,
        rings: [g.polygon.outer, ...g.polygon.holes].map((ring) => moved(ring, b.offset)),
        cut: cutIds ? cutIds.has(b.instanceId) : true,
      });
    }
  }
  // A lead larger than the sheet is on no sheet: drawn where it would start (its refusal says why).
  if (!where.has(instance.id) && !blanks.length)
    blanks.push({
      copy: 1,
      instanceId: instance.id,
      partId: part.id,
      name: partName(instance, part),
      offset: [0, 0],
      marks: featureMarks(feature),
      lead: true,
    });
  const elsewhere = nest.sheets
    .filter((s) => s.index !== sheetIndex)
    .map((s) => ({ index: s.index, count: s.blanks.filter((b) => inJob.has(b.instanceId)).length }))
    .filter((s) => s.count);
  const shownArea = (nest.sheets[sheetIndex]?.blanks || []).reduce((sum, b) => sum + b.area, 0);

  // Every blank's contours, in nest order, each timed at its own blank's share of its exact cut length.
  const plan = blanks.flatMap((b) => {
    const g = geometryOf(entryOf.get(b.instanceId) || { part, profile, fold });
    return g.contours.map((c) => {
      const ring = moved(c.ring, b.offset);
      return { ...c, copy: b.copy, instanceId: b.instanceId, ring, pierce: ring[0], stretch: g.stretch };
    });
  });
  const sampled = contours.reduce((sum, c) => sum + c.length, 0);
  const timeline = laserTimeline(plan, numbers, sampled);
  return {
    instance,
    part,
    feature,
    polygon,
    fold,
    flat,
    thickness,
    stock,
    sheet,
    sheetKey,
    sheetKnown,
    quantity,
    numbers,
    time,
    checks,
    refusals,
    warnings,
    job: job.map((e) => e.instance.id),
    parts,
    nest,
    nestError: '',
    sheetIndex,
    blanks,
    contours,
    plan,
    timeline,
    others,
    elsewhere,
    shownUse: shownArea / (sheet.width * sheet.height),
    marks: featureMarks(feature),
  };
}
