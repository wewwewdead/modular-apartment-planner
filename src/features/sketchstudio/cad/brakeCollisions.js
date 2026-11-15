// Collision check for a press brake hit (docs/sketch-studio-fab-shop.md §9
// SM-2 item 7), before the pedal and sampled through the stroke. Pure JS.
//
// The part is its mid-surface as triangles (each rigid piece's outline at
// z = t/2 with its cut-outs open — since SF-3: a tab bent up through its own
// window no longer counts the window as sheet; a piece whose cut-outs do not
// triangulate cleanly keeps them closed, erring toward caution; each bend
// zone as a strip of quads), posed in the
// machine frame (pressBrake.js brakeFrame). The punch, ram, die and bed are
// prisms along X — the punch set up to the bend's length (sectional tooling,
// as a shop sets it for a box), the ram, die and bed the bed's length — so a
// triangle is cut to a prism's X range and tested in its Y–Z section; the
// moving punch and ram are also swept over the approach and the return. The
// part is tested against itself between the two sides of the bend being made
// (each side is rigid, so only those pairs can come to meet). Contact in the
// working zone is exempt: the bend zone being formed, and part triangles
// wholly inside the die opening below the punch's reach. The return sweeps
// only as far as the ram goes back up (brake blades §4.2). A side that hangs
// into the bed or the die from a neighbouring bend made the other way (a
// back-to-back pair, brake flip tooling §5.4) is reported with its facts and
// only the remedies tried: the other order, a shorter side.
import { bendArcPoint, bendLabel, hitSequence, poseFold, transformPoint, zoneSamples } from './sheetMetal.js';
import { BUMP_GAP, STROKE_GAP, assessBend, brakeFrame, machineFrom, strokeInLine } from './pressBrake.js';
import {
  dieOf,
  dieSection,
  machineOf,
  minLeg,
  punchOf,
  punchSection,
  shoulderOffset,
  suggestedDie,
} from './shopCatalog.js';

export const ARC_STRIPS = 8;
// Coarse samples through the bend, then the first hit is narrowed down by halving.
export const STROKE_SAMPLES = 24;
const REFINE_STEPS = 8;
// Outline simplification for the mid-surface (mm), and the contact tolerance.
const SIMPLIFY = 0.25;
const EPS = 1e-6;
const RAM_HEIGHT = 400;
const BED_HEIGHT = 400;
const FAR = 1e4;
const fmt = (value) => Number(value.toFixed(1)).toString();

// ---------------------------------------------------------------- 2D helpers
const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const boxOf = (points) => {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
};
const boxesMeet = (a, b) => a[0] <= b[2] + EPS && b[0] <= a[2] + EPS && a[1] <= b[3] + EPS && b[1] <= a[3] + EPS;
function insideRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Proper crossing (touching ends do not count: contact is not a collision).
function segmentsCross(p, q, r, s) {
  const d1 = cross2(r, s, p),
    d2 = cross2(r, s, q),
    d3 = cross2(p, q, r),
    d4 = cross2(p, q, s);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}
/** Two 2D polygons (rings) overlap with some area or a crossing; a ring may be degenerate (a segment). */
export function polygonsOverlap(a, b, boxA = boxOf(a), boxB = boxOf(b)) {
  if (!boxesMeet(boxA, boxB)) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i],
      q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) if (segmentsCross(p, q, b[j], b[(j + 1) % b.length])) return true;
  }
  if (a.some((p) => insideRing(p, b))) return true;
  return b.some((p) => insideRing(p, a));
}
// Convex hull (monotone chain), counter-clockwise.
function hull(points) {
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (sorted.length < 3) return sorted;
  const lower = [],
    upper = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross2(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross2(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// Douglas–Peucker on a closed ring (split at its two farthest-apart points).
function simplifyRing(ring, tolerance) {
  if (ring.length <= 4) return ring;
  const far = (from, to, list) => {
    let best = -1,
      index = -1;
    const [a, b] = [list[from], list[to]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    for (let i = from + 1; i < to; i++) {
      const d = Math.abs(cross2(a, b, list[i])) / length;
      if (d > best) [best, index] = [d, i];
    }
    return [best, index];
  };
  const keep = (from, to, list, out) => {
    const [d, index] = far(from, to, list);
    if (index < 0 || d <= tolerance) return out.push(list[from]);
    keep(from, index, list, out);
    keep(index, to, list, out);
  };
  let split = 1,
    best = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > best) [best, split] = [d, i];
  }
  const closed = [...ring, ring[0]];
  const out = [];
  keep(0, split, closed, out);
  keep(split, closed.length - 1, closed, out);
  return out.length >= 3 ? out : ring;
}

// Ear clipping of a simple counter-clockwise ring (no holes).
export function triangulateRing(ring) {
  const points = ring.slice();
  const index = points.map((_, i) => i);
  const triangles = [];
  let guard = 0;
  while (index.length > 3 && guard++ < 100000) {
    let clipped = false;
    for (let i = 0; i < index.length; i++) {
      const ia = index[(i - 1 + index.length) % index.length],
        ib = index[i],
        ic = index[(i + 1) % index.length];
      const [a, b, c] = [points[ia], points[ib], points[ic]];
      const turn = cross2(a, b, c);
      if (Math.abs(turn) < 1e-12) {
        index.splice(i, 1);
        clipped = true;
        break;
      }
      if (turn < 0) continue;
      let ear = true;
      for (const j of index) {
        if (j === ia || j === ib || j === ic) continue;
        const p = points[j];
        // A bridged hole repeats two corners: a copy of the ear's own corner does not block it.
        if ([a, b, c].some((q) => q[0] === p[0] && q[1] === p[1])) continue;
        if (cross2(a, b, p) >= 0 && cross2(b, c, p) >= 0 && cross2(c, a, p) >= 0) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      triangles.push([a, b, c]);
      index.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (index.length === 3) triangles.push(index.map((i) => points[i]));
  return triangles;
}

const signedArea = (ring) => ring.reduce((sum, p, i) => sum + cross2([0, 0], p, ring[(i + 1) % ring.length]), 0) / 2;
const triangleArea = ([a, b, c]) => Math.abs(cross2(a, b, c)) / 2;
/**
 * Ear clipping of a counter-clockwise ring with holes: each hole (rightmost
 * first) is bridged to a visible corner of the ring (Eberly), then the one
 * ring is clipped. When the triangles do not cover the area (a degenerate
 * bridge) the holes are left closed.
 */
export function triangulateWithHoles(outer, holes = []) {
  if (!holes.length) return triangulateRing(outer);
  const ccw = (r) => (signedArea(r) >= 0 ? r : [...r].reverse());
  let ring = ccw(outer);
  const cw = holes.map((h) => [...ccw(h)].reverse());
  const rightmost = (h) => Math.max(...h.map((p) => p[0]));
  const order = [...cw].sort((p, q) => rightmost(q) - rightmost(p));
  const crossesAny = (m, p, rings) =>
    rings.some((r) => r.some((a, i) => segmentsCross(m, p, a, r[(i + 1) % r.length])));
  for (const [k, hole] of order.entries()) {
    const mi = hole.reduce((best, p, i) => (p[0] > hole[best][0] ? i : best), 0);
    const M = hole[mi];
    const rest = order.slice(k + 1);
    const candidates = ring.map((p, i) => [i, Math.hypot(p[0] - M[0], p[1] - M[1])]).sort((a, b) => a[1] - b[1]);
    const found = candidates.find(([i]) => {
      const P = ring[i];
      if (crossesAny(M, P, [ring, hole, ...rest])) return false;
      const mid = [(M[0] + P[0]) / 2, (M[1] + P[1]) / 2];
      return insideRing(mid, ring) && ![hole, ...rest].some((h) => insideRing(mid, h));
    });
    if (!found) return triangulateRing(ccw(outer));
    const pi = found[0];
    ring = [...ring.slice(0, pi + 1), ...hole.slice(mi), ...hole.slice(0, mi + 1), ring[pi], ...ring.slice(pi + 1)];
  }
  const triangles = triangulateRing(ring);
  const want = Math.abs(signedArea(outer)) - holes.reduce((sum, h) => sum + Math.abs(signedArea(h)), 0);
  const got = triangles.reduce((sum, tri) => sum + triangleArea(tri), 0);
  return Math.abs(got - want) <= 0.005 * Math.max(want, 1e-9) ? triangles : triangulateRing(ccw(outer));
}

// A triangle cut to the slab x0 ≤ X ≤ x1 (Sutherland–Hodgman), or null.
function clipX(polygon, x0, x1) {
  let points = polygon;
  for (const [limit, above] of [
    [x0, true],
    [x1, false],
  ]) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i],
        q = points[(i + 1) % points.length];
      const inP = above ? p[0] >= limit : p[0] <= limit,
        inQ = above ? q[0] >= limit : q[0] <= limit;
      if (inP) out.push(p);
      if (inP !== inQ) {
        const f = (limit - p[0]) / (q[0] - p[0]);
        out.push([limit, p[1] + f * (q[1] - p[1]), p[2] + f * (q[2] - p[2])]);
      }
    }
    points = out;
    if (!points.length) return null;
  }
  return points;
}

// ---------------------------------------------------------------- 3D helpers
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// A segment p → q through the interior of triangle (a, b, c), ends excluded.
function segmentHitsTriangle(p, q, [a, b, c]) {
  const d = sub3(q, p),
    e1 = sub3(b, a),
    e2 = sub3(c, a);
  const h = cross3(d, e2);
  const det = dot3(e1, h);
  if (Math.abs(det) < 1e-12) return false;
  const f = 1 / det,
    s = sub3(p, a);
  const u = f * dot3(s, h);
  if (u < EPS || u > 1 - EPS) return false;
  const k = cross3(s, e1);
  const v = f * dot3(d, k);
  if (v < EPS || u + v > 1 - EPS) return false;
  const t = f * dot3(e2, k);
  return t > EPS && t < 1 - EPS;
}
const box3 = (tri) => {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const p of tri)
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
  return [min, max];
};
const boxes3Meet = ([a0, a1], [b0, b1]) =>
  a0[0] <= b1[0] + EPS &&
  b0[0] <= a1[0] + EPS &&
  a0[1] <= b1[1] + EPS &&
  b0[1] <= a1[1] + EPS &&
  a0[2] <= b1[2] + EPS &&
  b0[2] <= a1[2] + EPS;
/** Two triangles cross (an edge of one passes through the other); coplanar contact is not counted. */
export function trianglesCross(s, t) {
  for (let i = 0; i < 3; i++) {
    if (segmentHitsTriangle(s[i], s[(i + 1) % 3], t)) return true;
    if (segmentHitsTriangle(t[i], t[(i + 1) % 3], s)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- the part as triangles
/**
 * The fold's mid-surface in flat terms: per piece its triangles (flat x, y at
 * z = t/2), per bend interval the (s, fraction) grid of its zone strip.
 */
export function partSurface(fold) {
  const mid = fold.thickness / 2;
  return {
    pieces: fold.pieces.map((piece) => ({
      id: piece.id,
      triangles: triangulateWithHoles(
        simplifyRing(piece.outer, SIMPLIFY),
        (piece.holes || []).map((h) => simplifyRing(h, SIMPLIFY)),
      ).map((tri) => tri.map(([x, y]) => [x, y, mid])),
    })),
    arcs: fold.bends.flatMap((bend) =>
      bend.intervals.map(([s0, s1], k) => ({ id: `${bend.id}:${k}`, bendId: bend.id, s0, s1 })),
    ),
  };
}

// The posed mid-surface in the machine frame: [{ owner, side, triangle }].
// A stroke's bends (shop floor §6.1): every member's zone is the working zone,
// every piece beyond any member moves. A round bend in the die (round-bend
// spec §5.5, `hit` its hit in bump order): only that hit's strip of the zone
// is the working zone; the curve already formed and the flat still to come
// are ordinary sheet, rigid with the side they lie on. Arc items carry `bendId`.
function posedTriangles(surface, posed, frame, bendIds, hit = null) {
  const t = posed.thickness;
  const members = new Set(Array.isArray(bendIds) ? bendIds : [bendIds]);
  const moving = new Set(posed.pieces.filter((p) => p.path.some((id) => members.has(id))).map((p) => p.id));
  const pieces = new Map(posed.pieces.map((p) => [p.id, p]));
  const bends = new Map(posed.bends.map((b) => [b.id, b]));
  const out = [];
  const place = (m, p) => transformPoint(frame.matrix, transformPoint(m, p));
  for (const { id, triangles } of surface.pieces) {
    const piece = pieces.get(id);
    const side = moving.has(id) ? 'moving' : 'fixed';
    for (const tri of triangles) out.push({ owner: id, side, triangle: tri.map((p) => place(piece.matrix, p)) });
  }
  for (const arc of surface.arcs) {
    const bend = bends.get(arc.bendId);
    const member = members.has(arc.bendId);
    const outside = moving.has(bend.fixedPiece) ? 'moving' : 'fixed';
    // The mini-bend in the die, counted from the fixed side.
    const working =
      member && bend.steps && hit ? (bend.transform.from === 'moving' ? bend.steps + 1 - hit : hit) : null;
    const strips = zoneSamples(bend, ARC_STRIPS);
    const at = (s, f) => place(bend.fixedMatrix, bendArcPoint(bend, t, bend.transform, s, f, t / 2));
    for (let j = 0; j < strips; j++) {
      let side = member ? 'zone' : outside;
      if (working) {
        const index = Math.floor((j * bend.steps) / strips) + 1;
        side = index === working ? 'zone' : index < working ? 'fixed' : 'moving';
      }
      const [a, b, c, d] = [
        at(arc.s0, j / strips),
        at(arc.s1, j / strips),
        at(arc.s1, (j + 1) / strips),
        at(arc.s0, (j + 1) / strips),
      ];
      out.push(
        { owner: `arc:${arc.id}`, bendId: arc.bendId, side, triangle: [a, b, c] },
        { owner: `arc:${arc.id}`, bendId: arc.bendId, side, triangle: [a, c, d] },
      );
    }
  }
  return out;
}

/**
 * The rest of the posed part cut by the machine-frame plane X = `x`, for the
 * side view (pressBrake.js sheetSection draws the bend in the die and the two
 * pieces beside it exactly; this adds what earlier bends made of the part):
 * the mid-surface's crossings as segments [[y, z], [y, z]], every piece and
 * bend zone but the zone of `bendId` and the pieces either side of it.
 * `surface`: partSurface(fold); `posed` / `frame`: the pose shown.
 */
export function partSection({ surface, posed, frame, bendId, bendIds = null, x = 0 }) {
  const ids = bendIds || (bendId ? [bendId] : []);
  const members = ids.map((id) => posed.bends.find((b) => b.id === id)).filter(Boolean);
  const beside = new Set(
    members.length ? members.flatMap((b) => [b.fixedPiece, ...b.movingPieces]) : posed.pieces.map((p) => p.id),
  );
  const segments = [];
  for (const { owner, side, triangle } of posedTriangles(surface, posed, frame, ids)) {
    if (side === 'zone' || beside.has(owner)) continue;
    const cut = [];
    for (let i = 0; i < 3; i++) {
      const p = triangle[i],
        q = triangle[(i + 1) % 3];
      const a = p[0] - x,
        b = q[0] - x;
      if (Math.abs(a) < EPS && Math.abs(b) < EPS) continue;
      if ((a < 0 && b < 0) || (a > 0 && b > 0)) continue;
      const f = Math.abs(a - b) < 1e-12 ? 0 : a / (a - b);
      cut.push([p[1] + f * (q[1] - p[1]), p[2] + f * (q[2] - p[2])]);
    }
    if (cut.length < 2) continue;
    const [s, e] = [cut[0], cut.find((c) => Math.hypot(c[0] - cut[0][0], c[1] - cut[0][1]) > 1e-9)];
    if (e) segments.push([s, e]);
  }
  return segments;
}

// ---------------------------------------------------------------- the tooling
/**
 * The machine's sections in the Y–Z plane for a punch tip at `tipZ`: punch,
 * punch holder (the sectional clamps on the punch, shop floor §6.2), ram
 * (above the holders), die (top at 0) and bed (under the die), each { ring
 * (counter-clockwise), x: [x0, x1] the prism's extent along the bed, ranges:
 * the X ranges it stands over }. The punch, holder and die are sectional:
 * they stand over `ranges` (the stroke's tooling runs, pressBrake.js
 * brakeFrame) or `span`; the ram and bed run the bed's length. The die
 * stands over `dieRanges` when given (brake tool length §3.2: trimmed apart
 * from the punch; the holders follow the punch). `reverse`: the punch turned
 * round in its clamps (brake blades §4.2), its section mirrored.
 */
export function toolingSections({
  machine,
  punch,
  die,
  tipZ,
  span = null,
  ranges = null,
  dieRanges = null,
  reverse = false,
}) {
  const press = typeof machine === 'string' || machine == null ? machineOf(machine) : machine;
  const half = press.beam / 2;
  const holder = press.holder || { height: 0, width: 0 };
  const top = tipZ + punch.height;
  const ram = top + holder.height;
  const bed = [-press.bed / 2, press.bed / 2];
  // A tool trimmed to nothing (refused, brake tool length §3.2) stands nowhere.
  const runsOf = (list) => {
    if (list && !list.length) return { x: [0, 0], ranges: [] };
    const sections = list || [span || bed];
    return { x: [Math.min(...sections.map((r) => r[0])), Math.max(...sections.map((r) => r[1]))], ranges: sections };
  };
  const sectional = runsOf(ranges);
  const dieSectional = dieRanges && dieRanges !== ranges ? runsOf(dieRanges) : sectional;
  const box = (w, z0, z1) => [
    [-w, z0],
    [w, z0],
    [w, z1],
    [-w, z1],
  ];
  return {
    punch: { ring: punchSection(punch, reverse).map(([y, z]) => [y, z + tipZ]), ...sectional },
    ...(holder.height > 0 ? { holder: { ring: box(holder.width / 2, top, ram), ...sectional } } : {}),
    ram: { ring: box(half, ram, ram + RAM_HEIGHT), x: bed, ranges: [bed] },
    die: { ring: dieSection(die), ...(span || ranges ? dieSectional : { x: bed, ranges: [bed] }) },
    bed: {
      ring: [
        [-half, -die.height - BED_HEIGHT],
        [half, -die.height - BED_HEIGHT],
        [half, -die.height],
        [-half, -die.height],
      ],
      x: bed,
      ranges: [bed],
    },
  };
}

// The general advice (a stored step's, sequenceChecks: reported only when
// both ways round collide, so turning the sheet around is no remedy there).
// For the pending hit the station rewords the punch, holder and ram advice
// from what it tried (brakeStation.js: Turn the sheet around, the punch fix;
// BT-2 follow-up), starting from EARLIER.
const ADVICE = {
  punch: 'bend this one earlier (before the flange in the way), or use the gooseneck punch',
  holder:
    'bend this one earlier (before the flange that swings over the punch), or use the tall straight punch: it holds the clamps higher',
  // Brake tool length §3.6: no one punch is promised (the station tries every taller one).
  ram: 'bend this one earlier, or use a taller punch: it holds the ram higher',
  die: 'flip the sheet (bend the other way up) or bend this one before the flange that swings into the die',
  bed: 'flip the sheet (bend the other way up) or bend this one before the flange that swings down',
  self: 'bend this one earlier, or less far: the part folds into itself',
};
// A bend bent on (tight bends §4.5): the tooling remedies only. Its bend is
// made already, so "bend this one earlier" and "flip the sheet" are no remedy.
const ONWARD_ADVICE = {
  punch: 'Use the gooseneck punch',
  holder: 'Use the tall straight punch: it holds the clamps higher',
  ram: 'Use a taller punch: it holds the ram higher',
};
/** The advice that is not tried, for the tools a punch can be changed for: bend this one earlier. */
export const EARLIER = Object.freeze({
  punch: 'Bend this one earlier (before the flange in the way)',
  holder: 'Bend this one earlier (before the flange that swings over the punch)',
  ram: 'Bend this one earlier',
});
/**
 * The punch the advice above names for a tool hit (brake blades §4.3): the
 * station offers it as a fix button when the hit really clears with it.
 */
export const ADVISED_PUNCH = Object.freeze({
  punch: Object.freeze({ key: 'gooseneck-88', label: 'Use the gooseneck punch' }),
  ram: Object.freeze({ key: 'gooseneck-88', label: 'Use the gooseneck punch' }),
  holder: Object.freeze({ key: 'straight-88-tall', label: 'Use the tall straight punch' }),
});
/** A punch's fix-button label, in the words the advice uses for it (brake tool length §3.6). */
export const PUNCH_LABELS = Object.freeze({
  'straight-88': 'Use the straight punch',
  'straight-88-sharp': 'Use the sharp straight punch',
  'straight-88-tall': 'Use the tall straight punch',
  'gooseneck-88': 'Use the gooseneck punch',
  'gooseneck-88-deep': 'Use the deep gooseneck punch',
  'acute-30': 'Use the acute punch',
});
const TOOL_NAMES = {
  punch: 'punch',
  holder: 'punch holder',
  ram: 'ram',
  die: 'die',
  bed: 'bed',
  self: 'part itself',
};
const TOOLS = ['punch', 'holder', 'ram', 'die', 'bed'];

// A 2D ring cut to the band lo ≤ y ≤ hi (Sutherland–Hodgman), as points.
function clipBand(ring, lo, hi) {
  let points = ring;
  for (const [limit, above] of [
    [lo, true],
    [hi, false],
  ]) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i],
        q = points[(i + 1) % points.length];
      const inP = above ? p[0] >= limit : p[0] <= limit,
        inQ = above ? q[0] >= limit : q[0] <= limit;
      if (inP) out.push(p);
      if (inP !== inQ) out.push([limit, p[1] + ((limit - p[0]) / (q[0] - p[0])) * (q[1] - p[1])]);
    }
    points = out;
    if (!points.length) return [];
  }
  return points;
}

/**
 * How high above the punch tip the ram would have to stand for the part to
 * pass under it (brake tool length §3.6): the highest the posed part reaches
 * inside the ram's width (the press's `beam`) over the bed, through the poses
 * of the stroke (`samples` through the bend, as brakeCollisions samples it).
 * Same options as brakeCollisions; the punch plays no part. Returns mm.
 */
export function ramClearance({
  fold,
  bendId = null,
  bendIds = null,
  angles = {},
  target = null,
  start = 0,
  machine,
  die,
  gaugePoint = null,
  turned = false,
  samples = STROKE_SAMPLES,
  surface = partSurface(fold),
}) {
  const ids = bendIds?.length ? bendIds : [bendId];
  const bend = fold.bends.find((b) => b.id === ids[0]);
  if (!bend) throw new Error(`Unknown bend: ${ids[0]}`);
  const press = typeof machine === 'string' || machine == null ? machineOf(machine) : machine;
  const dieEntry = typeof die === 'string' ? dieOf(die) : die || suggestedDie(fold.thickness).die;
  const goal = target ?? bend.angle;
  const from = bend.steps ? machineFrom(fold, ids, { gaugePoint, turned }) : null;
  const half = press.beam / 2;
  let need = 0;
  for (let k = 1; k <= samples; k++) {
    // A round bend's poses between its hits (the frame finds the hit each is in).
    // A bend bent on (tight bends §4.3) from the angle it stands at.
    const angle = bend.steps ? (goal * (k - 0.5)) / samples : start + ((goal - start) * k) / samples;
    const posed = poseFold(fold, { ...angles, ...Object.fromEntries(ids.map((id) => [id, angle])) }, from);
    const frame = brakeFrame(posed, ids[0], { die: dieEntry, gaugePoint, turned, members: ids, bed: press.bed });
    for (const item of posedTriangles(surface, posed, frame, ids)) {
      if (item.side === 'zone') continue;
      const cut = clipX(item.triangle, -press.bed / 2, press.bed / 2);
      if (!cut) continue;
      for (const [, z] of clipBand(
        cut.map((p) => [p[1], p[2]]),
        -half,
        half,
      ))
        need = Math.max(need, z - frame.tipZ);
    }
  }
  return need;
}

// ---------------------------------------------------------------- a side that hangs (brake flip tooling §5.4)
// A flat triangle (constant z) cut to the half-plane keep(p) ≥ 0, as triangles.
function clipTriangle(triangle, keep) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const p = triangle[i],
      q = triangle[(i + 1) % 3];
    const kp = keep(p),
      kq = keep(q);
    if (kp >= 0) out.push(p);
    if (kp >= 0 !== kq >= 0) {
      const f = kp / (kp - kq);
      out.push([p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1]), p[2] + f * (q[2] - p[2])]);
    }
  }
  return out.length < 3 ? [] : out.slice(1, -1).map((p, i) => [out[0], p, out[i + 2]]);
}

/**
 * partSurface(fold) with the side of `bend` away from the piece `piece` cut
 * `length` mm from the bend's line in the flat (and any bend zone past the
 * cut left out): the part as it would be with that side shorter, for trying
 * the "shorten the side that hangs" remedy (§5.4) without a new blank.
 */
export function shortenedSurface(surface, fold, bend, piece, length) {
  // The moving side lies along +n (pressBrake.js backSide).
  const sign = bend.fixedPiece === piece ? 1 : -1;
  const keep = ([x, y]) => length - sign * ((x - bend.a[0]) * bend.n[0] + (y - bend.a[1]) * bend.n[1]);
  const bends = new Map(fold.bends.map((b) => [b.id, b]));
  return {
    pieces: surface.pieces.map(({ id, triangles }) => ({
      id,
      triangles: triangles.flatMap((triangle) => clipTriangle(triangle, keep)),
    })),
    arcs: surface.arcs.filter(({ bendId, s0, s1 }) => {
      const b = bends.get(bendId),
        s = (s0 + s1) / 2;
      return keep([b.a[0] + b.u[0] * s, b.a[1] + b.u[1] * s]) >= 0;
    }),
  };
}

/**
 * The message for a side that hangs into the bed or the die from a
 * neighbouring bend made the other way (§5.4): the facts, then only the
 * remedies tried (the other order; a shorter side; `step`, the step that
 * clears when the caller found it by trying, brakeStation.js). `hanging`: a
 * hit's `hanging` (brakeCollisions).
 */
export function hangingMessage(hanging, { step = null } = {}) {
  const { prefix, tool, side, other, die, otherFirst, broken, shorten, advised } = hanging;
  const facts =
    tool === 'bed'
      ? `${prefix}: the ${fmt(side)} mm side hangs down beside the die and meets the bed (the ${die.name} die stands ${fmt(die.height)} mm above it).`
      : `${prefix}: the ${fmt(side)} mm side hangs down and meets the die's body (the ${die.name} die is ${fmt(die.width)} mm wide).`;
  if (!advised) return facts;
  if (otherFirst) return `${facts} Bend the other one first, so the ${fmt(other)} mm side hangs instead.`;
  const lead = broken
    ? `Bending the other one first would leave bend ${broken.number}'s ${broken.tabs} flanges out of line`
    : 'Neither order clears';
  const ways = [
    shorten != null && `shorten the side that hangs to ${fmt(shorten)} mm or less`,
    step != null && `make the step at least ${fmt(step)} mm so it hangs clear of the ${tool === 'bed' ? 'bed' : 'die'}`,
  ].filter(Boolean);
  return `${facts} ${lead}${ways.length ? `: ${ways.join(', or ')}` : ''}.`;
}

/**
 * Does a hit collide, and where first? `fold`: an unposed foldSheet result
 * holding the bend `bendId` (or the stroke `bendIds`, shop floor §6.1: they
 * move through the angle together, every member's zone is the working zone
 * and the tooling stands over the stroke's runs); `angles`: the other bends'
 * posed angles (absent = their own); `target`: the angle the stroke bends to
 * (default the bend's); `gaugePoint` / `turned`: which side goes back
 * (pressBrake.js brakeFrame); `reverse`: the punch turned round in its clamps
 * (brake blades §4.2); `number`: the hit's number in messages
 * (default the bend's place). Checks the approach (the punch, holders and
 * ram coming down onto the flat-on-the-die part), STROKE_SAMPLES poses
 * through the bend (the first hit narrowed by halving) and the return.
 * `start` (docs/sketch-studio-tight-bends.md §4.3): the angle the bend
 * stands at before this hit, a bend made earlier and now bent on (0: a bend
 * made from flat). The approach is checked at `start`, the samples run
 * `start` → `target`, the return at `target`; such a hit is named "Bend {n}
 * on to {a}°" and gets the fact and the tooling remedies only (§4.5).
 * A round bend walks its hits (round-bend spec §5.5) and its hit carries
 * `bump` (the hit it happens in, bump order) and `bumps` (the hit count).
 * A side hanging into the bed or the die from a neighbouring bend made the
 * other way (brake flip tooling §5.4) carries `hanging` { prefix, tool,
 * side, other (the flat lengths of the side that hangs and of this bend's
 * far side), bendId (the bend it hangs from), die, otherFirst, broken,
 * shorten, advised } and its message from hangingMessage. `advise` false
 * skips every remedy (and the checks a hanging side's cost: the other order,
 * a shorter side): any collision's message is then its fact alone; 'shorten'
 * tries the shorter side only (the caller has tried the other order itself).
 * Returns { hit: null | { angle, phase, tool, owner, triangles (machine
 * frame, the part's triangles that hit), message }, samples, ms }.
 */
export function brakeCollisions({
  fold,
  bendId = null,
  bendIds = null,
  angles = {},
  target = null,
  start = 0,
  machine,
  punch,
  die,
  gaugePoint = null,
  turned = false,
  reverse = false,
  number = null,
  samples = STROKE_SAMPLES,
  surface = partSurface(fold),
  advise = true,
}) {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const ids = bendIds?.length ? bendIds : [bendId];
  const bend = fold.bends.find((b) => b.id === ids[0]);
  if (!bend) throw new Error(`Unknown bend: ${ids[0]}`);
  const punchEntry = typeof punch === 'string' || punch == null ? punchOf(punch) : punch;
  const dieEntry = typeof die === 'string' ? dieOf(die) : die || suggestedDie(fold.thickness).die;
  const press = typeof machine === 'string' || machine == null ? machineOf(machine) : machine;
  const goal = target ?? bend.angle;
  const exempt = shoulderOffset(dieEntry) + dieEntry.shoulderRadius;
  // A round bend (round-bend spec §5.3): filled from the side away from the backgauge.
  const from = bend.steps ? machineFrom(fold, ids, { gaugePoint, turned }) : null;
  let checked = 0;
  // One pose: the hit (or null) at the stroke's posed angle `angle`; sweep:
  // 'down' (approach) / 'up' (return) sweeps the punch, holders and ram over
  // the stroke; `hit`: a round bend's hit in the die (bump order).
  const check = (angle, sweep = null, hit = null) => {
    checked++;
    const posed = poseFold(fold, { ...angles, ...Object.fromEntries(ids.map((id) => [id, angle])) }, from);
    const frame = brakeFrame(posed, ids[0], { die: dieEntry, gaugePoint, turned, members: ids, hit, bed: press.bed });
    const triangles = posedTriangles(surface, posed, frame, ids, hit);
    const tools = toolingSections({
      machine,
      punch: punchEntry,
      die: dieEntry,
      tipZ: frame.tipZ,
      span: frame.span,
      ranges: frame.ranges,
      dieRanges: frame.dieRanges,
      reverse,
    });
    const boxes = Object.fromEntries(Object.entries(tools).map(([k, { ring }]) => [k, boxOf(ring)]));
    const reach = frame.tipZ + punchEntry.radius + fold.thickness;
    // The return goes back up as far as the stroke does (brake blades §4.2):
    // to STROKE_GAP above the sheet (BUMP_GAP between a round bend's hits),
    // where the part is taken off. A flange standing in a gooseneck's throat
    // is drawn out forward there, not lifted on the neck all the way up.
    const back = hit && hit < bend.steps ? BUMP_GAP : STROKE_GAP;
    const lift = sweep === 'up' ? Math.max(0, fold.thickness + back - frame.tipZ) : null;
    for (const tool of TOOLS) {
      if (!tools[tool]) continue;
      const hits = [];
      let owner = null;
      const moves = tool === 'punch' || tool === 'holder' || tool === 'ram';
      for (const item of triangles) {
        if (item.side === 'zone') continue;
        for (const [x0, x1] of tools[tool].ranges) {
          const cut = clipX(item.triangle, x0, x1);
          if (!cut) continue;
          const section = cut.map((p) => [p[1], p[2]]);
          // In the die opening, below the punch's reach: the working contact.
          if ((tool === 'punch' || tool === 'die') && section.every(([y, z]) => Math.abs(y) <= exempt && z <= reach))
            continue;
          // A moving tool swept over the stroke meets what lies in its path:
          // coming down, anything above it; going back up, what lies within the lift.
          const shape =
            sweep && moves
              ? hull([...section, ...section.map(([y, z]) => [y, lift == null ? -FAR : z - lift])])
              : section;
          if (polygonsOverlap(shape, tools[tool].ring, boxOf(shape), boxes[tool])) {
            hits.push(item.triangle);
            owner ||= item.owner;
            break;
          }
        }
      }
      // `runs`: where the tool stood along the bed (brake tool length §3.5: is the contact at its ends?).
      if (hits.length) return { tool, owner, triangles: hits, runs: tools[tool].ranges };
    }
    // The part against itself: the two rigid sides of this bend.
    const fixed = triangles.filter((i) => i.side === 'fixed').map((i) => ({ ...i, box: box3(i.triangle) }));
    const moving = triangles.filter((i) => i.side === 'moving').map((i) => ({ ...i, box: box3(i.triangle) }));
    const hits = [];
    let owner = null;
    for (const a of moving)
      for (const b of fixed)
        if (boxes3Meet(a.box, b.box) && trianglesCross(a.triangle, b.triangle)) {
          hits.push(a.triangle, b.triangle);
          owner ||= a.owner;
        }
    return hits.length ? { tool: 'self', owner, triangles: hits } : null;
  };
  // The steps in the order made (tight bends §4.2): a bend's number is its first step's place.
  const strokes = hitSequence(fold);
  const onward = start > 1e-9;
  const firstStep = (id) => strokes.findIndex((s) => s.bendIds.includes(id)) + 1;
  const hitNumber = number ?? (firstStep(ids[0]) || bend.index + 1);
  const prefix = onward ? `Bend ${firstStep(ids[0]) || bend.index + 1} on to ${fmt(goal)}°` : `Bend ${hitNumber}`;
  // The bend made earlier that turned the colliding piece where it is,
  // relative to the face on the die: a bend between the two on the sheet
  // (on one's path from the root, not the other's), bent at this pose, not
  // of this stroke.
  const pathOf = (pieceId) => fold.pieces.find((p) => p.id === pieceId)?.path || [];
  const culprit = (owner) => {
    const arc = String(owner || '').match(/^arc:(.+):\d+$/);
    const pieceId = arc ? fold.bends.find((b) => b.id === arc[1])?.fixedPiece : owner;
    const path = [...pathOf(pieceId), ...(arc ? [arc[1]] : [])];
    const base = pathOf(bend.fixedPiece);
    const between = [...path.filter((b) => !base.includes(b)), ...base.filter((b) => !path.includes(b))];
    const id = between.find((b) => !ids.includes(b) && (angles[b] == null || angles[b] > 1e-9));
    const made = id && fold.bends.find((b) => b.id === id);
    if (!made) return null;
    // Read from the steps (docs/sketch-studio-tight-bends.md §5.2): a bend made
    // part-way and bent on later is named by its first step, as its row reads
    // ("1 · UP 30° R1.28"), not at the angle its last hit leaves it.
    const first = strokes.find((s) => s.bendIds.includes(id));
    const then = first?.to?.[id];
    const label = then != null && Math.abs(then - made.angle) > 1e-9 ? bendLabel({ ...made, angle: then }) : made.label;
    return { id, number: firstStep(id), label };
  };
  // "Bend this one before bend N" only when the brake would take that order
  // (the SF-3 audit): moved ahead of strokes N … (this one − 1), none of them
  // may be a stroke of several tabs that this hit would then leave out of
  // line. Returns the first stroke it would break, or null.
  const own = strokes.findIndex((s) => s.bendIds.includes(ids[0]) && Math.abs((s.from[ids[0]] || 0) - start) < 1e-9);
  const breaks = (number) => {
    if (own < 0) return null;
    for (let k = number - 1; k < own; k++) {
      const stroke = strokes[k];
      if (stroke.bendIds.length < 2) continue;
      // That stroke as it would be made: this hit already bent, it and the
      // strokes after it not yet made. Read from the steps (tight bends §5.2):
      // a bend made before them and bent on among them stands at its angle then.
      const then = {};
      for (const s of strokes.slice(0, k)) Object.assign(then, s.to);
      const flat = { ...angles };
      for (let j = k; j < own; j++) for (const id of strokes[j].bendIds) flat[id] = then[id] || 0;
      for (const id of ids) delete flat[id];
      if (strokeInLine(fold, stroke.bendIds, flat)) return { number: k + 1, tabs: stroke.bendIds.length };
    }
    return null;
  };
  // A back-to-back pair (§5.4): the bend `madeId` (made earlier, the other
  // way, parallel to this one, the two sharing a piece: the web) turns the
  // side that hangs down. { made, web } or null.
  const adjacent = (b) =>
    new Set([b.fixedPiece, ...fold.pieces.filter((p) => p.path.at(-1) === b.id).map((p) => p.id)]);
  const pairWith = (madeId) => {
    const made = fold.bends.find((b) => b.id === madeId);
    if (!made || made.direction === bend.direction) return null;
    if (Math.abs(made.u[0] * bend.u[1] - made.u[1] * bend.u[0]) > 1e-6) return null;
    const mine = adjacent(bend);
    const web = [...adjacent(made)].find((id) => mine.has(id));
    return web ? { made, web } : null;
  };
  const quiet = { fold, machine, samples, surface, reverse, advise: false };
  const clears = (options) => !brakeCollisions({ ...quiet, ...options }).hit;
  const either = (options) => clears({ ...options, turned: false }) || clears({ ...options, turned: true });
  // Tried, not assumed: this hit made first with the other one still flat,
  // then the other one with this one made, each passing the machine's checks
  // and clearing either way round (as a stored step is checked).
  const otherOrderClears = (made) => {
    const first = { ...angles, [made.id]: 0 };
    const zero = Object.fromEntries(ids.map((id) => [id, 0]));
    if (assessBend(fold, ids.length === 1 ? ids[0] : ids, { machine, angles: { ...first, ...zero } }).refusals.length)
      return false;
    if (!either({ bendIds: ids, angles: first, target: goal, punch: punchEntry, die: dieEntry })) return false;
    const after = { ...angles };
    for (const id of [...ids, made.id]) delete after[id];
    if (assessBend(fold, made.id, { machine, angles: { ...after, [made.id]: 0 } }).refusals.length) return false;
    return either({ bendIds: [made.id], angles: after, punch: made.punch, die: made.die });
  };
  // The longest the side that hangs may be for this hit to clear, as posed
  // (found by halving, from the shortest leg the die that made it carries), or null.
  const shortestClear = ({ made, web }, side) => {
    const least = minLeg(dieOf(made.die), made.angle);
    const at = (length) =>
      clears({
        bendIds: ids,
        angles,
        target: goal,
        punch: punchEntry,
        die: dieEntry,
        gaugePoint,
        turned,
        surface: shortenedSurface(surface, fold, made, web, length),
      });
    if (!(least < side) || !at(least)) return null;
    let low = least,
      high = side;
    for (let step = 0; step < REFINE_STEPS; step++) {
      const middle = (low + high) / 2;
      if (at(middle)) low = middle;
      else high = middle;
    }
    return Math.floor(low * 10) / 10;
  };
  // `bump`: a round bend's hit (bump order) the contact happens in.
  const report = (found, angle, phase, bump = null) => {
    const where =
      phase === 'approach'
        ? 'as the ram comes down'
        : phase === 'return'
          ? 'as the ram goes back up'
          : `at ${fmt(angle)}°`;
    // A bend bent on gets no "bend this one before …": its bend is made already (§4.5).
    const earlier = !onward && (found.tool === 'bed' || found.tool === 'die') ? culprit(found.owner) : null;
    const broken = earlier && breaks(earlier.number);
    const pair = earlier && pairWith(earlier.id);
    if (pair) {
      const { made, web } = pair;
      const away = (b) => (b.fixedPiece === web ? b.flatLegs.moving : b.flatLegs.fixed);
      // advise 'shorten': the caller has tried the other order already (an offset, brakeStation.js).
      const otherFirst = advise === true && !broken ? otherOrderClears(made) : false;
      const hanging = {
        prefix: `${prefix}${bump ? `, hit ${bump} of ${bend.steps}` : ''}`,
        tool: found.tool,
        side: away(made),
        other: away(bend),
        bendId: made.id,
        die: { name: dieEntry.name, height: dieEntry.height, width: dieEntry.width },
        otherFirst,
        broken: broken || null,
        shorten: advise && !otherFirst ? shortestClear(pair, away(made)) : null,
        advised: Boolean(advise),
      };
      return {
        ...found,
        angle,
        phase,
        ...(otherFirst ? { earlier: earlier.number } : {}),
        ...(bump ? { bump, bumps: bend.steps } : {}),
        hanging,
        message: hangingMessage(hanging),
      };
    }
    // The order that would break a stroke out of line is no remedy: what does work instead.
    const advice = broken
      ? `Bending it before bend ${earlier.number} would leave bend ${broken.number}'s ${broken.tabs} flanges out of line. Make the flanges that ${found.tool === 'bed' ? `hang below the die shallower (the ${dieEntry.name} die stands ${fmt(dieEntry.height)} mm above the bed)` : 'swing into the die shallower'}, bend bend ${broken.number}'s flanges one at a time, or flip the sheet (bend the other way up)`
      : earlier
        ? `Bend this one before bend ${earlier.number} (${earlier.label}): that bend turns part of the sheet down into the ${TOOL_NAMES[found.tool]}. Or flip the sheet (bend the other way up)`
        : onward
          ? ONWARD_ADVICE[found.tool] || ''
          : `${ADVICE[found.tool][0].toUpperCase()}${ADVICE[found.tool].slice(1)}`;
    return {
      ...found,
      angle,
      phase,
      ...(earlier && !broken ? { earlier: earlier.number } : {}),
      ...(bump ? { bump, bumps: bend.steps } : {}),
      // Without `advise` the fact alone: the remedies come with the advice.
      message: `${prefix}${bump ? `, hit ${bump} of ${bend.steps}` : ''}: the part hits the ${TOOL_NAMES[found.tool]} ${where}.${advise && advice ? ` ${advice}.` : ''}`,
    };
  };
  // A round bend (round-bend spec §5.5): the hits in order, each in its own
  // frame from (j − 1)·a to j·a — the punch coming down, ⌈samples / N⌉ poses
  // through the hit, the last of them the punch going back up (a sweep holds
  // the pose under it) — so at least two poses per hit.
  if (bend.steps) {
    const steps = bend.steps,
      a = goal / steps,
      per = Math.max(1, Math.ceil(samples / steps));
    let hit = null;
    for (let j = 1; j <= steps && !hit; j++) {
      const start = (j - 1) * a;
      const approach = check(start, 'down', j);
      if (approach) {
        hit = report(approach, start, 'approach', j);
        break;
      }
      let clear = start;
      for (let k = 1; k <= per && !hit; k++) {
        const angle = start + (a * k) / per;
        const last = k === per;
        let found = check(angle, last ? 'up' : null, j);
        if (!found) {
          clear = angle;
          continue;
        }
        // The return's sweep meets it: is it there at the bottom of the hit, or only on the way up?
        if (last) {
          const still = check(angle, null, j);
          if (!still) {
            hit = report(found, angle, 'return', j);
            break;
          }
          found = still;
        }
        let low = clear,
          high = angle,
          first = found;
        for (let step = 0; step < REFINE_STEPS; step++) {
          const middle = (low + high) / 2;
          const there = check(middle, null, j);
          if (there) [high, first] = [middle, there];
          else low = middle;
        }
        hit = report(first, high, 'bend', j);
      }
    }
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return { hit, samples: checked, ms: ended - started };
  }
  let hit = null;
  const approach = check(start, 'down');
  if (approach) hit = report(approach, start, 'approach');
  if (!hit) {
    let clear = start;
    for (let k = 1; k <= samples && !hit; k++) {
      const angle = start + ((goal - start) * k) / samples;
      const found = check(angle);
      if (!found) {
        clear = angle;
        continue;
      }
      // Narrow the first contact down between the last clear sample and this one.
      let low = clear,
        high = angle,
        first = found;
      for (let step = 0; step < REFINE_STEPS; step++) {
        const middle = (low + high) / 2;
        const there = check(middle);
        if (there) [high, first] = [middle, there];
        else low = middle;
      }
      hit = report(first, high, 'bend');
    }
  }
  if (!hit) {
    const back = check(goal, 'up');
    if (back) hit = report(back, goal, 'return');
  }
  const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { hit, samples: checked, ms: ended - started };
}
