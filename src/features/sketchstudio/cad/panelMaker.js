// The flanged panel maker (docs/sketch-studio-shop-floor.md §6.3): the user
// states the finished part — the outside face, flanges on its edges, creases
// across it, windows and holes — and the maker lays out the blank a
// programmer would send to the laser, with the bends in brake order (flange
// strokes, the longest edge first, then the creases) and one etched line per
// stroke. It unfolds nothing: the blank is laid out from the same §5.2
// numbers the brake uses (sheetMetal.js bendNumbers), as controlBoxBody
// (shopExamples.js) does by hand, then folded by foldSheet and checked by
// the brake's own sequenceChecks. Pure: no three, no DOM.
//
// Design frame: the face outline as given (outside mould lines, mm). Edge i
// runs face[i] → face[i + 1]; along it s, and w the distance out of the face
// (w = 0 on the edge, w < 0 inside). A flange's bend line lies c = OSSB − BA/2
// inside its edge and its blank edge depth − BD outside it; a crease's bend
// deduction comes out of the blank (the face on the crease's far side moves
// 2c toward it), so the folded outside sizes are the ones asked for.
//
// A round corner (docs/sketch-studio-round-bend.md §13.3) is how the kiosk's
// screen housing is closed: the two flanges stop short of the corner, a corner
// piece (a strip with one 90° round bend made by bump hits) is set in the
// corner against their ends, and the face plate is cut back so the piece's
// inside lies against it.
import polygonClipping from 'polygon-clipping';
import {
  CHORD_ERROR,
  autoHits,
  bendNumbers,
  distanceFromLeg,
  flatSummary,
  foldSheet,
  foldedBounds,
  lineSegments,
  multiplyMatrices,
  pointInRing,
  profilePolygon,
  transformPoint,
} from './sheetMetal.js';
import { DEFAULT_PUNCH, airBendRadius, defaultDie, machineOf, punchOf, stockOf } from './shopCatalog.js';
import { sequenceChecks } from './brakeStation.js';
import { triangulateRing, trianglesCross } from './brakeCollisions.js';

export const PANEL_DEFAULTS = Object.freeze({ relief: 1, gap: 0.2 });
// Corners two flanges may meet at, degrees (§6.3).
export const FLANGED_CORNER = Object.freeze({ min: 45, max: 135 });
// A round corner's defaults (round-bend spec §13.3): the corner piece's straight
// legs either side of its bend, mm (enough for the bump hits to sit on, and the
// flange ends meet straight metal); the radius the form offers, outside, mm.
export const ROUND_CORNER = Object.freeze({ leg: 15, radius: 30 });
const BIG = 1e5;
const INSIDE = 0.5; // a bend line starts and ends this far inside its tab (at most a quarter of it)
const OVERLAP = 1e-3; // neighbouring regions overlap this much (inside material), so the union merges them
const fmt = (value) => Number(value.toFixed(2)).toString();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const unit = (a) => mul(a, 1 / Math.hypot(...a));
const round = (p) => p.map((v) => Math.round(v * 1e6) / 1e6);

// ---------------------------------------------------------------- convex half-planes
// Keep the part of a convex polygon where (p − origin)·normal ≤ limit (Sutherland–Hodgman).
function clipHalf(poly, origin, normal, limit) {
  const out = [];
  const f = (p) => dot(sub(p, origin), normal) - limit;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length];
    const fp = f(p),
      fq = f(q);
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) out.push(add(p, mul(sub(q, p), fp / (fp - fq))));
  }
  return out;
}
const box = (cx, cy, r) => [
  [cx - r, cy - r],
  [cx + r, cy - r],
  [cx + r, cy + r],
  [cx - r, cy + r],
];
// A convex region of half-planes [{ origin, normal, limit }] inside the big box.
const region = (planes, centre) =>
  planes.reduce(
    (poly, { origin, normal, limit }) => (poly.length ? clipHalf(poly, origin, normal, limit) : poly),
    box(...centre, BIG),
  );
const ringArea = (ring) => ring.reduce((sum, p, i) => sum + cross(p, ring[(i + 1) % ring.length]), 0) / 2;
const asMulti = (poly) =>
  poly.length >= 3 && Math.abs(ringArea(poly)) > 1e-9 ? [[[...poly, poly[0]].map(round)]] : [];
const openRing = (ring) =>
  ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;

// ---------------------------------------------------------------- input
const FACE_PRESETS = Object.freeze(['rectangle', 'trapezoid', 'sketch']);
/** The face outline of a form preset: Rectangle { width, height }, Trapezoid { bottom, top, height } (counter-clockwise from the bottom left). */
export function presetFace(kind, { width = 600, height = 1400, bottom = 600, top = 400 } = {}) {
  if (kind === 'trapezoid')
    return [
      [0, 0],
      [bottom, 0],
      [(bottom + top) / 2, height],
      [(bottom - top) / 2, height],
    ];
  if (kind === 'rectangle')
    return [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ];
  throw new Error(`Unknown face preset: ${kind} (one of ${FACE_PRESETS.join(', ')}).`);
}

function edgeFrames(face) {
  return face.map((P, i) => {
    const Q = face[(i + 1) % face.length];
    const length = Math.hypot(...sub(Q, P));
    const e = unit(sub(Q, P));
    return { index: i, P, Q, length, e, m: [e[1], -e[0]] };
  });
}
const wOf = (frame, p) => dot(sub(p, frame.P), frame.m);
const sOf = (frame, p) => dot(sub(p, frame.P), frame.e);

/** Interior angle at face[k] (between edge k − 1 and edge k), degrees. */
const cornerAngle = (frames, k) => {
  const a = frames[(k - 1 + frames.length) % frames.length].e,
    b = frames[k].e;
  return 180 - (Math.atan2(cross(a, b), dot(a, b)) * 180) / Math.PI;
};

function validate(input) {
  const face = input.face;
  if (!Array.isArray(face) || face.length < 3) throw new Error('The face needs at least three corners.');
  if (!face.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))
    throw new Error('Every face corner needs two numbers (x, y).');
  const t = Number(input.thickness);
  if (!(t > 0)) throw new Error('The sheet thickness must be greater than zero.');
  stockOf(input.stock || 'spcc');
  if (ringArea(face) <= 0) throw new Error('The face outline must run counter-clockwise.');
  const frames = edgeFrames(face);
  for (const f of frames) if (!(f.length > 1e-6)) throw new Error(`Edge ${f.index + 1} of the face has no length.`);
  for (let k = 0; k < face.length; k++) {
    const turn = cross(frames[(k - 1 + face.length) % face.length].e, frames[k].e);
    if (!(turn > 1e-9))
      throw new Error(`The face must be convex: corner ${k + 1} turns inward (or is straight). Draw a convex outline.`);
  }
  return { face: face.map((p) => p.map(Number)), t, frames };
}

// ---------------------------------------------------------------- the layout
/**
 * The blank for a flanged panel. `input`: { face: [[x, y], …] (finished
 * OUTSIDE face outline, convex, counter-clockwise, mm), thickness, stock,
 * flanges: [{ edge, depth, angle = 90, direction = 'up' }] (edge i = face[i]
 * → face[i + 1]; depth = outside height), creases: [{ a, b, angle,
 * direction }] (a line across the face; parallel to each other), windows:
 * [{ type: 'rect', x, y, width, height, radius } | { type: 'circle', x, y,
 * diameter }] (centres, face coordinates), holes: [{ x, y, diameter }],
 * rounds: [{ corner, radius, leg = 15 }] (corner k = face[k], between edge
 * k − 1 and edge k; radius = the wall's outside radius; leg = the corner
 * piece's straight legs), relief = 1, gap = 0.2 }. Options: { machine (the
 * press brake key for the report), idPrefix }.
 * Returns { profile (the blank: a polygon outline, windows and holes as
 * exact rectangles, line-and-arc loops and circles), bends (brake order,
 * strokes sharing `stroke`), marks (one etched line per stroke with { bend:
 * { angle, direction } }), feature (a sheetmetal feature of them), report:
 * { blank, folded, sequence, problems, warnings, corners (per face corner:
 * { index, angle, style: 'closed' | 'open' | 'round' | null, radius, leg })
 * }, cornerPieces (per round corner: { corner, radius, leg, depth, piece
 * (cornerPiece(): one layout shared by the corners of one size), pose (the
 * piece's frame → the panel's folded part frame, a 4 × 4 column-major
 * matrix) }), map (design → flat, for the form's preview) }. Throws, by name,
 * what cannot be made.
 */
export function flangedPanel(input, options = {}) {
  // An open corner whose flanges still come too close folded gets a wider relief, a few times.
  for (let attempt = 0; ; attempt++)
    try {
      return layoutPanel(input, options, attempt * 1.5);
    } catch (error) {
      if (!error.tight || attempt >= 4) throw error;
    }
}

function layoutPanel(input, { machine = null, idPrefix = 'panel' } = {}, extra = 0) {
  const { face, t, frames } = validate(input);
  const stock = input.stock || 'spcc';
  const relief = Number(input.relief ?? PANEL_DEFAULTS.relief);
  const gap = Number(input.gap ?? PANEL_DEFAULTS.gap);
  if (!(relief > 0)) throw new Error('The corner relief must be greater than zero.');
  if (!(gap >= 0)) throw new Error('The fit-up gap cannot be negative.');
  const die = defaultDie(t).key;
  const n = face.length;
  // Flanges, by edge.
  const flanges = new Map();
  for (const [k, raw] of (input.flanges || []).entries()) {
    const edge = Number(raw.edge);
    if (!Number.isInteger(edge) || edge < 0 || edge >= n)
      throw new Error(`Flange ${k + 1}: there is no edge ${edge + 1}.`);
    if (flanges.has(edge)) throw new Error(`Edge ${edge + 1} has two flanges: give it one.`);
    const angle = Number(raw.angle ?? 90);
    if (!(angle > 0 && angle <= 90))
      throw new Error(`Flange on edge ${edge + 1}: the angle must be more than 0° and at most 90°.`);
    const direction = raw.direction === 'down' ? 'down' : 'up';
    const depth = Number(raw.depth);
    const numbers = bendNumbers({ thickness: t, stock, angle, punch: DEFAULT_PUNCH, die });
    const h = numbers.allowance / 2;
    const c = numbers.setback - h;
    const d = distanceFromLeg(depth, numbers);
    if (!(depth > 0) || d < h + t)
      throw new Error(
        `Flange on edge ${edge + 1}: ${fmt(depth)} mm is too short to bend; it needs more than ${fmt(numbers.deduction + h + t)} mm (the bend takes ${fmt(numbers.deduction)} mm).`,
      );
    flanges.set(edge, { edge, angle, direction, depth, numbers, h, c, d });
  }
  // Round corners (round-bend spec §13.3), by corner.
  const rounds = new Map();
  for (const [k, raw] of (input.rounds || []).entries()) {
    const at = Number(raw.corner);
    if (!Number.isInteger(at) || at < 0 || at >= n)
      throw new Error(`Round corner ${k + 1}: there is no corner ${Number.isFinite(at) ? at + 1 : raw.corner}.`);
    if (rounds.has(at)) throw new Error(`Corner ${at + 1} is rounded twice: give it one radius.`);
    const radius = Number(raw.radius),
      leg = Number(raw.leg ?? ROUND_CORNER.leg);
    const problem = cornerRadiusProblem({ radius, leg, thickness: t, stock });
    if (problem) throw new Error(`Corner ${at + 1}: ${problem}`);
    rounds.set(at, { radius, leg });
  }
  // Corners: angle, style (§6.3: flanged corners 45° – 135°, closed when
  // square; round when asked, round-bend spec §13.3).
  const corners = face.map((_, k) => {
    const prev = (k - 1 + n) % n;
    const angle = cornerAngle(frames, k);
    const a = flanges.get(prev),
      b = flanges.get(k);
    if (a && b && (angle < FLANGED_CORNER.min - 1e-9 || angle > FLANGED_CORNER.max + 1e-9))
      throw new Error(
        `Corner ${k + 1} (between edges ${prev + 1} and ${k + 1}) is ${fmt(angle)}°: two flanges can meet only at ${FLANGED_CORNER.min}° – ${FLANGED_CORNER.max}°. Take the flange off one of the edges.`,
      );
    const asked = rounds.get(k);
    let round = null;
    if (asked) {
      // Where a closed corner could be: square, two 90° flanges the same way, and the same depth (one strip closes it).
      const where = `Corner ${k + 1} (between edges ${prev + 1} and ${k + 1})`;
      if (!(a && b)) throw new Error(`${where}: a round corner needs a flange on both edges.`);
      if (Math.abs(angle - 90) > 1e-6)
        throw new Error(`${where} is ${fmt(angle)}°: a round corner needs a square (90°) corner.`);
      if (a.angle !== 90 || b.angle !== 90) throw new Error(`${where}: a round corner needs both flanges at 90°.`);
      if (a.direction !== b.direction)
        throw new Error(`${where}: a round corner needs both flanges bent the same way.`);
      if (Math.abs(a.depth - b.depth) > 1e-9)
        throw new Error(
          `${where}: a round corner needs both flanges the same depth (they are ${fmt(a.depth)} and ${fmt(b.depth)} mm): its corner piece is one strip as wide as they are deep.`,
        );
      const P = face[k];
      round = {
        ...asked,
        // The flange ends this far from the sharp corner, square: `leg` before its tangent point.
        reach: asked.radius + asked.leg,
        depth: a.depth,
        direction: a.direction,
        // The centre of the arc (design frame), `radius` in from both edges.
        centre: sub(sub(P, mul(frames[prev].m, asked.radius)), mul(frames[k].m, asked.radius)),
      };
    }
    const closed =
      !round &&
      Boolean(a && b) &&
      Math.abs(angle - 90) < 1e-6 &&
      a.angle === 90 &&
      b.angle === 90 &&
      a.direction === b.direction;
    // The longer edge covers (it is bent first, longest edge first); a tie: the earlier edge.
    const cover = closed ? (frames[prev].length >= frames[k].length ? prev : k) : null;
    // An open corner's relief, widened at an oblique corner so the zones' square ends stay clear.
    const oblique = a && b ? Math.max(a.h, b.h) * Math.abs(1 / Math.tan((angle * Math.PI) / 180)) : 0;
    return {
      index: k,
      prev,
      next: k,
      angle,
      both: Boolean(a && b),
      closed,
      cover,
      round,
      relief: relief + (closed || round ? 0 : oblique + extra),
    };
  });
  // A flange keeps some length between its round corners.
  for (const [edge, f] of flanges) {
    const ends = [corners[edge], corners[(edge + 1) % n]].filter((c) => c.round);
    const taken = ends.reduce((sum, c) => sum + c.round.reach, 0);
    if (ends.length && frames[edge].length - taken < 2 * (f.c + f.h + relief))
      throw new Error(
        `The flange on edge ${edge + 1} is too short for its round corner${ends.length > 1 ? 's' : ''}: each takes its radius + leg (${ends.map((c) => fmt(c.round.reach)).join(' and ')} mm) of the ${fmt(frames[edge].length)} mm edge. Make the radius or the legs smaller.`,
      );
  }
  // Creases: parallel lines across the face.
  const creases = (input.creases || []).map((raw, k) => {
    const a = raw.a.map(Number),
      b = raw.b.map(Number);
    if (!(Math.hypot(...sub(b, a)) > 1e-6)) throw new Error(`Crease ${k + 1} needs two different points.`);
    const angle = Number(raw.angle);
    if (!(angle > 0 && angle <= 90))
      throw new Error(`Crease ${k + 1}: the angle must be more than 0° and at most 90°.`);
    const direction = raw.direction === 'up' ? 'up' : 'down';
    const numbers = bendNumbers({ thickness: t, stock, angle, punch: DEFAULT_PUNCH, die });
    const h = numbers.allowance / 2;
    return { index: k, a, b, angle, direction, numbers, h, c: numbers.setback - h };
  });
  const along = creases.length ? unit(sub(creases[0].b, creases[0].a)) : null;
  const normal = along ? [-along[1], along[0]] : null;
  for (const crease of creases) {
    const u = unit(sub(crease.b, crease.a));
    if (Math.abs(cross(u, along)) > 1e-9)
      throw new Error(`Crease ${crease.index + 1} is not parallel to crease 1: the creases must all run one way.`);
    crease.offset = dot(crease.a, normal);
    const sides = face.map((p) => dot(p, normal) - crease.offset);
    if (!(Math.min(...sides) < -1e-6 && Math.max(...sides) > 1e-6))
      throw new Error(`Crease ${crease.index + 1} does not cross the face: its line must run from edge to edge.`);
  }
  creases.sort((p, q) => p.offset - q.offset);
  for (let k = 1; k < creases.length; k++)
    if (
      creases[k].offset - creases[k - 1].offset <
      creases[k].c + creases[k].h + creases[k - 1].c + creases[k - 1].h + 4 * t
    )
      throw new Error(
        `Creases ${creases[k - 1].index + 1} and ${creases[k].index + 1} are too close together to bend apart.`,
      );
  const delta = (crease, p) => dot(p, normal) - crease.offset;
  const centre = mul(
    face.reduce((s, p) => add(s, p), [0, 0]),
    1 / n,
  );

  // Edge frames' half-planes: w_i ≤ limit and w_i ≥ limit.
  const below = (i, limit) => ({ origin: frames[i].P, normal: frames[i].m, limit });
  const above = (i, limit) => ({ origin: frames[i].P, normal: mul(frames[i].m, -1), limit: -limit });
  const band = (crease, from, to) => [
    { origin: [0, 0], normal, limit: crease.offset + to },
    { origin: [0, 0], normal: mul(normal, -1), limit: -(crease.offset + from) },
  ];
  const innerAt = (edge, corner) => {
    const f = flanges.get(edge);
    return -f.c - f.h - corner.relief;
  };
  // The face inside every flange's bend line.
  const core = region(
    frames.map((f) => below(f.index, flanges.has(f.index) ? -flanges.get(f.index).c : 0)),
    centre,
  );
  const reliefs = [],
    tabs = new Map(),
    ears = [];
  // A flange's tab: from its bend line out to its blank edge, ending at each
  // corner on the neighbour's edge (no flange there), on its inner relief line
  // (a closed corner), or square across at the last place the whole tab and
  // its zone stand inside that line (an open corner: the folded ends stand
  // square, so an acute corner's walls do not lean into each other).
  const squareCut = (edge, neighbour, corner, end) => {
    const f = flanges.get(edge),
      a = frames[edge],
      b = frames[neighbour];
    const inner = innerAt(neighbour, corner);
    const sAt = (W) => (inner - dot(sub(a.P, b.P), b.m) - W * dot(a.m, b.m)) / dot(a.e, b.m);
    const cuts = [-f.c - f.h, f.d - f.c].map(sAt);
    return end ? Math.min(...cuts) : Math.max(...cuts);
  };
  const along_e = (edge, s, end) =>
    end
      ? { origin: frames[edge].P, normal: frames[edge].e, limit: s }
      : { origin: frames[edge].P, normal: mul(frames[edge].e, -1), limit: -s };
  for (const [edge, f] of flanges) {
    // A hair into the face (OVERLAP): pieces that only touch would not merge.
    const planes = [above(edge, -f.c - OVERLAP), below(edge, f.d - f.c)];
    for (const [neighbour, corner, end] of [
      [(edge - 1 + n) % n, corners[edge], false],
      [(edge + 1) % n, corners[(edge + 1) % n], true],
    ]) {
      if (!flanges.has(neighbour)) planes.push(below(neighbour, 0));
      else if (corner.round) {
        // A round corner: the flange ends square `radius + leg` from the sharp
        // corner (the corner piece's leg butts on there); its zone ends there
        // too, with a relief `relief` wide beyond it, in to the inner relief line.
        const cut = end ? frames[edge].length - corner.round.reach : corner.round.reach;
        planes.push(along_e(edge, cut, end));
        reliefs.push(
          region(
            [
              above(edge, innerAt(edge, corner)),
              along_e(edge, cut, !end),
              along_e(edge, end ? cut + corner.relief : cut - corner.relief, end),
            ],
            centre,
          ),
        );
      } else if (corner.closed) planes.push(below(neighbour, innerAt(neighbour, corner)));
      else {
        const cut = squareCut(edge, neighbour, corner, end);
        planes.push(along_e(edge, cut, end));
        // The face beside the zone goes as far: the zone ends square.
        reliefs.push(region([above(edge, innerAt(edge, corner)), along_e(edge, cut, !end)], centre));
      }
    }
    tabs.set(edge, region(planes, centre));
  }
  // A round corner's face (round-bend spec §13.3): cut back by t along both
  // legs and round the arc (radius − t about the corner's centre), so the
  // corner piece's inside lies against it. The arc's vertices lie on that
  // circle (one on each tangent line), its chords inside it: the face never
  // runs into the piece, and stands at most CHORD_ERROR off it.
  const cutBacks = [];
  for (const corner of corners) {
    if (!corner.round) continue;
    const i = corner.prev,
      j = corner.next;
    const { radius, leg, centre: C } = corner.round;
    const r = radius - t;
    const quarter = Math.max(4, Math.ceil(Math.PI / 2 / (2 * Math.acos(1 - Math.min(CHORD_ERROR, r) / r))));
    const disc = Array.from({ length: 4 * quarter }, (_, k) => {
      const phi = (k * Math.PI) / (2 * quarter);
      return add(C, add(mul(frames[i].m, r * Math.cos(phi)), mul(frames[j].m, r * Math.sin(phi))));
    });
    const square = region([along_e(i, frames[i].length - radius, false), along_e(j, radius, true)], centre);
    cutBacks.push(
      asMulti(region([above(i, -t), along_e(i, frames[i].length - radius - leg, false)], centre)),
      asMulti(region([above(j, -t), along_e(j, radius + leg, true)], centre)),
      polygonClipping.difference(asMulti(square), asMulti(disc)),
    );
  }
  for (const corner of corners) {
    if (!corner.both || corner.round) continue;
    const i = corner.prev,
      j = corner.next;
    reliefs.push(region([above(i, innerAt(i, corner)), above(j, innerAt(j, corner))], centre));
    if (!corner.closed) continue;
    // A closed corner (controlBoxBody): the covering flange runs to the other
    // flange's outside face; the covered one stops `gap` short of its inner face.
    const A = corner.cover,
      B = A === i ? j : i;
    const fa = flanges.get(A),
      fb = flanges.get(B);
    ears.push({
      edge: A,
      poly: region(
        [above(A, -fa.c + fa.h), below(A, fa.d - fa.c), above(B, innerAt(B, corner) - OVERLAP), below(B, 0)],
        centre,
      ),
    });
    ears.push({
      edge: B,
      poly: region(
        [above(B, -fb.c + fb.h), below(B, fb.d - fb.c), above(A, innerAt(A, corner) - OVERLAP), below(A, -t - gap)],
        centre,
      ),
    });
  }
  // Crease notches in the flanges the crease crosses (§1: the side flanges are
  // notched where the crease crosses them), wider where the flange stands on
  // the inside of the crease (its two ends lean together as the crease bends).
  const notches = [];
  for (const crease of creases)
    for (const [edge, f] of flanges) {
      const frame = frames[edge];
      const dp = delta(crease, frame.P),
        dq = delta(crease, frame.Q);
      if (!((dp < 0 && dq > 0) || (dp > 0 && dq < 0))) continue;
      const theta = (crease.angle * Math.PI) / 180;
      const inside = f.direction === crease.direction;
      const half = inside
        ? Math.max(relief, (gap + 0.05 + (f.depth + t) * Math.sin(theta)) / (1 + Math.cos(theta)))
        : relief;
      // The crossing must stay clear of the corner reliefs at both ends.
      const at = sOf(frame, add(frame.P, mul(sub(frame.Q, frame.P), dp / (dp - dq))));
      const width = (crease.c + crease.h + half) / Math.abs(dot(frame.e, normal) || 1);
      for (const [corner, from] of [
        [corners[edge], at],
        [corners[(edge + 1) % n], frame.length - at],
      ]) {
        const other = flanges.get(corner.prev === edge ? corner.next : corner.prev);
        // A round corner's flange ends `radius + leg` from it: the crease stays clear of the corner piece.
        const reach = corner.round ? corner.round.reach + corner.relief : other ? other.c + other.h + corner.relief : 0;
        if (from - width < reach + t)
          throw new Error(
            `Crease ${crease.index + 1} crosses the flange on edge ${edge + 1} too near corner ${corner.index + 1}: move it at least ${fmt(reach + width + t - from)} mm further from the corner.`,
          );
      }
      notches.push({
        crease: crease.index,
        edge,
        half,
        poly: region(
          [
            ...band(crease, -(crease.c + crease.h + half), crease.c + crease.h + half),
            above(edge, -f.c - f.h - relief),
            below(edge, f.d - f.c + 1),
          ],
          centre,
        ),
      });
    }
  // The design blank (face, tabs, ears), less the reliefs, the round corners' cut-backs and the notches.
  const cuts = [...reliefs.map(asMulti), ...cutBacks];
  const faced = cuts.length ? polygonClipping.difference(asMulti(core), ...cuts) : asMulti(core);
  let design = polygonClipping.union(faced, ...[...tabs.values()].map(asMulti), ...ears.map((e) => asMulti(e.poly)));
  if (notches.length) design = polygonClipping.difference(design, ...notches.map((x) => asMulti(x.poly)));

  // ------------------------------------------------ design → flat (the creases' deduction)
  // Slab k lies between crease k − 1 and crease k; it moves toward the first
  // slab by 2c of every crease before it. A crease's zone is bridged straight.
  const shifts = [0];
  for (const crease of creases) shifts.push(shifts.at(-1) + 2 * crease.c);
  const slabOf = (p) => {
    let k = 0;
    while (k < creases.length && delta(creases[k], p) > 0) k++;
    return k;
  };
  const shiftOf = (k) => (normal ? mul(normal, -shifts[k]) : [0, 0]);
  const toFlatRaw = (p, k = slabOf(p)) => add(p, shiftOf(k));
  const slabs = [];
  for (let k = 0; k <= creases.length; k++) {
    const planes = [];
    if (k > 0) planes.push(...band(creases[k - 1], creases[k - 1].c + creases[k - 1].h, BIG));
    if (k < creases.length) planes.push(...band(creases[k], -BIG, -creases[k].c - creases[k].h));
    const cut = planes.length ? polygonClipping.intersection(design, asMulti(region(planes, centre))) : design;
    slabs.push(cut.map((poly) => poly.map((ring) => ring.map((p) => round(add(p, shiftOf(k)))))));
  }
  // Where a polygon set crosses the line at signed distance `level` from a crease: [[p, q], …].
  const crossSection = (multi, crease, level) => {
    const origin = add(mul(normal, crease.offset + level), mul(along, -BIG));
    const line = { a: origin, b: add(origin, mul(along, 2 * BIG)) };
    return multi.flatMap((poly) =>
      lineSegments({ outer: openRing(poly[0]), holes: poly.slice(1).map(openRing) }, line).map((s) => [s.a, s.b]),
    );
  };
  const bridges = creases.map((crease, k) => {
    // A hair into each slab, so the bridge overlaps both (rounding never leaves a seam).
    const low = crossSection(design, crease, -crease.c - crease.h - 1e-4);
    const high = crossSection(design, crease, crease.c + crease.h + 1e-4);
    if (low.length !== 1 || high.length !== 1)
      throw new Error(
        `Crease ${crease.index + 1} crosses a cut-out or splits the blank: move it so it runs across solid face from flange to flange.`,
      );
    const [m0, m1] = low[0].map((p) => toFlatRaw(p, k)),
      [p0, p1] = high[0].map((p) => toFlatRaw(p, k + 1));
    const order = (seg) => (dot(seg[0], along) <= dot(seg[1], along) ? seg : [seg[1], seg[0]]);
    const [a0, a1] = order([m0, m1]),
      [b0, b1] = order([p0, p1]);
    return asMulti([a0, a1, b1, b0]);
  });
  let flat = polygonClipping.union(...slabs.filter((s) => s.length), ...bridges);
  if (flat.length !== 1)
    throw new Error('The blank falls apart into separate pieces: check the creases, the flanges and the cut-outs.');
  let outline = openRing(flat[0][0]);
  if (flat[0].length > 1) throw new Error('The blank has an enclosed gap: check the flanges at the corners.');
  // Shift so the blank's lower left corner is the origin.
  const x0 = Math.min(...outline.map((p) => p[0])),
    y0 = Math.min(...outline.map((p) => p[1]));
  const origin = [-x0, -y0];
  const toFlat = (p, k = slabOf(p)) => round(add(toFlatRaw(p, k), origin));
  outline = outline.map((p) => round(add(p, origin)));

  // ------------------------------------------------ cut-outs (exact loops)
  const clearOfBends = (points, label) => {
    for (const p of points) {
      if (!pointInRing(p, face)) throw new Error(`${label} runs outside the face.`);
      for (const frame of frames) {
        const f = flanges.get(frame.index);
        const limit = f ? -f.c - f.h - t : -t / 2;
        if (wOf(frame, p) > limit + 1e-9)
          throw new Error(
            f
              ? `${label} runs into the bend of the flange on edge ${frame.index + 1}: keep it ${fmt(f.c + f.h + t)} mm inside that edge.`
              : `${label} runs to edge ${frame.index + 1}: keep it inside the face.`,
          );
      }
      for (const crease of creases)
        if (Math.abs(delta(crease, p)) < crease.c + crease.h + t)
          throw new Error(`${label} runs into crease ${crease.index + 1}: keep it clear of the crease.`);
      // A round corner's face ends on its arc (radius − t): keep t inside that.
      for (const corner of corners) {
        if (!corner.round) continue;
        const { radius, centre: C } = corner.round;
        const inSquare =
          sOf(frames[corner.prev], p) > frames[corner.prev].length - radius && sOf(frames[corner.next], p) < radius;
        if (inSquare && Math.hypot(...sub(p, C)) > radius - 2 * t - 1e-9)
          throw new Error(
            `${label} runs into the round corner at corner ${corner.index + 1}: keep it ${fmt(2 * t)} mm inside the arc.`,
          );
      }
    }
    const slabsHit = new Set(points.map(slabOf));
    if (slabsHit.size > 1) throw new Error(`${label} crosses a crease: keep it on one side.`);
  };
  const cutouts = [];
  for (const [k, w] of (input.windows || []).entries()) {
    const label = `Window ${k + 1}`;
    const x = Number(w.x),
      y = Number(w.y);
    if (w.type === 'circle') {
      const r = Number(w.diameter) / 2;
      if (!(r > 0)) throw new Error(`${label} needs a diameter.`);
      clearOfBends(
        Array.from({ length: 16 }, (_, i) => [
          x + r * Math.cos((i * Math.PI) / 8),
          y + r * Math.sin((i * Math.PI) / 8),
        ]),
        label,
      );
      cutouts.push({ type: 'circle', center: toFlat([x, y]), radius: r });
      continue;
    }
    const W = Number(w.width),
      H = Number(w.height),
      R = Math.max(0, Number(w.radius) || 0);
    if (!(W > 0 && H > 0)) throw new Error(`${label} needs a width and a height.`);
    if (R > Math.min(W, H) / 2 + 1e-9) throw new Error(`${label}: the corner radius is more than half its side.`);
    const corners4 = [
      [x - W / 2, y - H / 2],
      [x + W / 2, y - H / 2],
      [x + W / 2, y + H / 2],
      [x - W / 2, y + H / 2],
    ];
    clearOfBends(corners4, label);
    const k0 = slabOf([x, y]);
    const at = (p) => toFlat(p, k0);
    if (R < 1e-9) {
      cutouts.push({ type: 'polygon', points: corners4.map(at) });
      continue;
    }
    // The line-and-arc loop sketchProfile.js makes: exact arcs for the laser and the DXF.
    const s45 = R * (1 - Math.SQRT1_2);
    const [l, b] = corners4[0],
      [r, tp] = corners4[2];
    cutouts.push({
      type: 'path',
      closed: true,
      start: at([l + R, b]),
      segments: [
        { type: 'line', end: at([r - R, b]) },
        { type: 'arc', mid: at([r - s45, b + s45]), end: at([r, b + R]) },
        { type: 'line', end: at([r, tp - R]) },
        { type: 'arc', mid: at([r - s45, tp - s45]), end: at([r - R, tp]) },
        { type: 'line', end: at([l + R, tp]) },
        { type: 'arc', mid: at([l + s45, tp - s45]), end: at([l, tp - R]) },
        { type: 'line', end: at([l, b + R]) },
        { type: 'arc', mid: at([l + s45, b + s45]), end: at([l + R, b]) },
      ],
    });
  }
  for (const [k, hole] of (input.holes || []).entries()) {
    const label = `Hole ${k + 1}`;
    const r = Number(hole.diameter) / 2,
      x = Number(hole.x),
      y = Number(hole.y);
    if (!(r > 0)) throw new Error(`${label} needs a diameter.`);
    clearOfBends(
      Array.from({ length: 12 }, (_, i) => [x + r * Math.cos((i * Math.PI) / 6), y + r * Math.sin((i * Math.PI) / 6)]),
      label,
    );
    cutouts.push({ type: 'circle', center: toFlat([x, y]), radius: r });
  }
  const profile = { type: 'polygon', points: outline, ...(cutouts.length ? { holes: cutouts } : {}) };
  const polygon = profilePolygon(profile);

  // ------------------------------------------------ bends, strokes, marks
  const inside = (from, to) => Math.min(INSIDE, (to - from) / 4);
  const segmentOn = (a, u, [s0, s1]) => [
    round(add(a, mul(u, s0 + inside(s0, s1)))),
    round(add(a, mul(u, s1 - inside(s0, s1)))),
  ];
  // The material a flat line crosses: lineSegments over the whole blank.
  const across = (point, u) =>
    lineSegments(polygon, { a: add(point, mul(u, -BIG)), b: add(point, mul(u, BIG)) }).map((s) => ({
      ...s,
      s0: s.s0 - BIG,
      s1: s.s1 - BIG,
    }));
  const tabPolys = new Map(
    [...tabs].map(([edge, poly]) => [edge, [poly, ...ears.filter((e) => e.edge === edge).map((e) => e.poly)]]),
  );
  const fromFlat = (p, k) => sub(sub(p, origin), shiftOf(k));
  const strokes = [];
  const order = [...flanges.keys()].sort((p, q) => frames[q].length - frames[p].length || p - q);
  // A flange's bend line in each slab; its tabs on one flat line make one
  // stroke (a crease across an edge square to it leaves the line in place).
  for (const edge of order) {
    const f = flanges.get(edge),
      frame = frames[edge];
    const lines = new Map();
    for (let k = 0; k <= creases.length; k++) {
      const point = toFlat(add(frame.P, mul(frame.m, -f.c)), k);
      const key = Math.round(dot(point, frame.m) * 1e4);
      for (const seg of across(point, frame.e)) {
        const mid = add(point, mul(frame.e, (seg.s0 + seg.s1) / 2));
        if (slabOf(fromFlat(mid, k)) !== k) continue;
        const probe = fromFlat(add(mid, mul(frame.m, f.h + 0.05)), k);
        if (!tabPolys.get(edge).some((poly) => pointInRing(probe, poly))) continue;
        if (!lines.has(key)) lines.set(key, []);
        lines.get(key).push(segmentOn(point, frame.e, [seg.s0, seg.s1]));
      }
    }
    for (const members of lines.values()) {
      members.sort((p, q) => dot(p[0], frame.e) - dot(q[0], frame.e));
      strokes.push({ kind: 'flange', edge, angle: f.angle, direction: f.direction, members });
    }
  }
  for (const [k, crease] of creases.entries()) {
    const point = toFlat(mul(normal, crease.offset - crease.c), k);
    const segs = across(point, along);
    if (!segs.length) throw new Error(`Crease ${crease.index + 1} crosses no material.`);
    strokes.push({
      kind: 'crease',
      crease: crease.index,
      angle: crease.angle,
      direction: crease.direction,
      members: [segmentOn(point, along, [segs[0].s0, segs.at(-1).s1])],
    });
  }
  const bends = [],
    marks = [];
  strokes.forEach((stroke, i) => {
    stroke.bendIds = stroke.members.map(
      (_, j) => `${idPrefix}-bend-${i + 1}${stroke.members.length > 1 ? `-${j + 1}` : ''}`,
    );
    const strokeId = stroke.members.length > 1 ? `${idPrefix}-stroke-${i + 1}` : null;
    stroke.members.forEach(([a, b], j) =>
      bends.push({
        id: stroke.bendIds[j],
        a,
        b,
        angle: stroke.angle,
        direction: stroke.direction,
        radius: null,
        punch: DEFAULT_PUNCH,
        die,
        ...(strokeId ? { stroke: strokeId } : {}),
      }),
    );
    marks.push({
      id: `${idPrefix}-mark-${i + 1}`,
      a: stroke.members[0][0],
      b: stroke.members.at(-1)[1],
      bend: { angle: stroke.angle, direction: stroke.direction },
    });
  });
  const feature = {
    id: `${idPrefix}-sheet`,
    type: 'sheetmetal',
    sketchId: `${idPrefix}-blank`,
    thickness: t,
    stock,
    kFactor: null,
    base: null,
    marks,
    bends,
  };
  const fold = foldSheet(feature, profile);
  // The face pieces (the root and both sides of every crease); the rest are flanges.
  const creaseIds = new Set(bends.slice(bends.length - creases.length).map((b) => b.id));
  const facePieces = new Set([
    fold.rootPiece,
    ...fold.bends.filter((b) => creaseIds.has(b.id)).flatMap((b) => [b.fixedPiece, ...b.movingPieces]),
  ]);
  const clearances = pieceClearances(fold, facePieces);
  const tight = clearances.filter((c) => c.distance < gap - 1e-6);
  if (tight.length) {
    const worst = tight.sort((p, q) => p.distance - q.distance)[0];
    throw tightError(
      worst.distance <= 0
        ? `Folded, two flanges run into each other (${worst.pair.join(' and ')}). Make the flanges shallower or take one off a corner.`
        : `Folded, two flanges stand only ${fmt(worst.distance)} mm apart (${worst.pair.join(' and ')}); the fit-up gap is ${fmt(gap)} mm.`,
    );
  }
  const press = machineOf(machine || undefined);
  const checks = sequenceChecks({ fold, machine: press, profile });
  const [lo, hi] = foldedBounds(fold);
  const flatNumbers = flatSummary(polygon, profile);
  const problems = checks
    .filter((c) => c.refusals.length || c.collision)
    .map((c) => ({ index: c.index, label: c.label, message: c.collision?.message || c.refusals[0].message }));
  // ------------------------------------------------ round corners: the corner pieces (round-bend spec §13.3)
  // One layout per size; each corner gets the pose that stands the piece in it.
  const pieces = new Map();
  const cornerPieces = corners
    .filter((corner) => corner.round)
    .map((corner) => {
      const { radius, leg, depth } = corner.round;
      const key = JSON.stringify([radius, leg, depth]);
      if (!pieces.has(key)) {
        const piece = cornerPiece(
          { radius, leg, depth, thickness: t, stock },
          { machine, idPrefix: `${idPrefix}-corner-${pieces.size + 1}` },
        );
        pieces.set(key, piece);
        for (const p of piece.report.problems)
          problems.push({
            index: `corner-${pieces.size}`,
            label: 'Corner piece',
            message: `Corner piece: ${p.message}`,
          });
      }
      return { corner: corner.index, radius, leg, depth, piece: pieces.get(key), pose: cornerPose(corner) };
    });
  // Where a corner piece stands (its frame: the first leg flat with its
  // outside on z = 0, bent up about X = leg, Z = radius; Y across the strip):
  // its outside on the two flanges' outside planes, its legs ending where they
  // do, the strip as deep as they are, in the frame of the face piece that holds
  // the corner (the panel's folded part frame).
  function cornerPose(corner) {
    const { radius, leg, direction } = corner.round;
    const a = frames[corner.prev],
      b = frames[corner.next];
    const P = face[corner.index];
    // Flanges up: the first leg on the corner's second edge, X toward the
    // corner, the strip up from the outside face (z = 0). Down: the first leg
    // on its first edge, the strip down from the outside face (z = t).
    const [X, Z, start, Y, z0] =
      direction === 'up'
        ? [mul(b.e, -1), mul(b.m, -1), add(P, mul(b.e, radius + leg)), 1, 0]
        : [a.e, mul(a.m, -1), sub(P, mul(a.e, radius + leg)), -1, t];
    // The face piece: found at a point `radius + leg` in from both edges (clear of every bend zone).
    const inside = sub(sub(P, mul(a.m, radius + leg)), mul(b.m, radius + leg));
    const k = slabOf(inside);
    const holder = fold.pieces.find((piece) => pointInRing(toFlat(inside, k), piece.outer));
    const o = add(toFlatRaw(start, k), origin);
    const local = [X[0], X[1], 0, 0, 0, 0, Y, 0, Z[0], Z[1], 0, 0, o[0], o[1], z0, 1];
    return multiplyMatrices(holder.matrix, local);
  }
  return {
    profile,
    bends,
    marks,
    feature,
    fold,
    // What each stroke makes: { kind: 'flange' (edge) | 'crease' (crease), bendIds }.
    strokes: strokes.map(({ kind, edge, crease, bendIds }) => ({
      kind,
      edge: edge ?? null,
      crease: crease ?? null,
      bendIds,
    })),
    report: {
      blank: {
        width: flatNumbers.width,
        height: flatNumbers.height,
        area: flatNumbers.area,
        cutLength: flatNumbers.cutLength,
        pierces: flatNumbers.pierces,
      },
      folded: { size: hi.map((v, i) => v - lo[i]), bounds: [lo, hi] },
      strokes: strokes.length,
      sequence: checks.map((c) => ({
        index: c.index,
        label: c.label,
        kind: strokes[c.index]?.kind,
        ok: !c.refusals.length && !c.collision,
        message: c.collision?.message || c.refusals[0]?.message || '',
      })),
      problems,
      warnings: fold.warnings.map((w) => w.message),
      machine: press.name,
      minClearance: clearances.length ? Math.min(...clearances.map((c) => c.distance)) : null,
      corners: corners.map((c) => ({
        index: c.index,
        angle: c.angle,
        style: c.round ? 'round' : c.closed ? 'closed' : c.both ? 'open' : null,
        ...(c.round ? { radius: c.round.radius, leg: c.round.leg } : {}),
      })),
    },
    cornerPieces,
    // For the form's preview: the design pieces and how they land on the blank.
    map: {
      toFlat: (p) => toFlat(p),
      shifts,
      origin,
      creases: creases.map((c) => ({ index: c.index, offset: c.offset, c: c.c })),
    },
  };
}

const tightError = (message) => Object.assign(new Error(message), { tight: true });

// ---------------------------------------------------------------- the corner piece
// What a round corner's sizes cannot be (null when they can): `radius` is the
// wall's outside radius, so the piece bends at radius − t inside, and that has
// to be rounder than one ordinary hit forms (else it is no round bend).
function cornerRadiusProblem({ radius, leg, thickness: t, stock }) {
  if (!(radius > t))
    return `the radius must be more than the sheet thickness (${fmt(t)} mm): it is the outside radius.`;
  const die = defaultDie(t);
  const formed = airBendRadius(stockOf(stock), t, punchOf(DEFAULT_PUNCH), die).radius;
  if (!(radius - t > formed + 1e-9))
    return `R${fmt(radius)} is too tight for a corner piece: one hit in the ${die.name} die already forms R${fmt(formed)} inside (R${fmt(formed + t)} outside). Make it more than R${fmt(formed + t)}, or leave the corner square.`;
  if (!(leg > 0)) return 'the corner piece needs straight legs longer than zero.';
  return null;
}

/**
 * A round corner's corner piece (round-bend spec §13.3): a strip `depth`
 * wide and leg + BA + leg long with ONE 90° round bend across its middle,
 * inside radius = radius − t, made by bump hits (the automatic count for the
 * sheet's default die), and its etched line carrying the bend. Folded: two
 * straight legs `leg` long (outside), the outside radius `radius`, outside
 * size (radius + leg) × depth × (radius + leg). Its frame: the first leg flat
 * (x 0 … leg, outside on z = 0, `base` holds it), the bend up about x = leg,
 * z = radius; y across the strip. Options: { machine (the press brake key for
 * the sequence check), idPrefix }.
 * Returns { profile, bends, marks, feature, fold, strokes, numbers: { radius
 * (inside), kFactor, allowance, steps, stepAngle, pitch, die }, report: {
 * blank, folded, strokes, sequence, problems, warnings, machine } }.
 */
export function cornerPiece(
  { radius, leg = ROUND_CORNER.leg, depth, thickness, stock = 'spcc' },
  { machine = null, idPrefix = 'corner' } = {},
) {
  const t = Number(thickness),
    R = Number(radius),
    L = Number(leg),
    D = Number(depth);
  if (!(t > 0)) throw new Error('The sheet thickness must be greater than zero.');
  const problem = cornerRadiusProblem({ radius: R, leg: L, thickness: t, stock });
  if (problem) throw new Error(`Corner piece: ${problem}`);
  if (!(D > 0)) throw new Error('Corner piece: the strip needs a width (the flanges’ depth).');
  const die = defaultDie(t).key;
  const inner = Number((R - t).toFixed(6));
  const numbers = bendNumbers({ thickness: t, stock, angle: 90, radius: inner, punch: DEFAULT_PUNCH, die });
  const steps = autoHits({ allowance: numbers.allowance, die, thickness: t });
  const length = 2 * L + numbers.allowance;
  const x = L + numbers.allowance / 2;
  // The punch line across the strip, a hair inside its edges (as the panel's own lines).
  const inset = Math.min(INSIDE, D / 4);
  const [a, b] = [
    [x, inset],
    [x, D - inset],
  ].map(round);
  const profile = {
    type: 'polygon',
    points: [
      [0, 0],
      [length, 0],
      [length, D],
      [0, D],
    ].map(round),
  };
  const bend = {
    id: `${idPrefix}-bend-1`,
    a,
    b,
    angle: 90,
    direction: 'up',
    radius: inner,
    steps,
    punch: DEFAULT_PUNCH,
    die,
  };
  const feature = {
    id: `${idPrefix}-sheet`,
    type: 'sheetmetal',
    sketchId: `${idPrefix}-blank`,
    thickness: t,
    stock,
    kFactor: null,
    base: round([L / 2, D / 2]),
    // The etched line carries the round bend, so one click at the brake sets it up.
    marks: [{ id: `${idPrefix}-mark-1`, a, b, bend: { angle: 90, direction: 'up', radius: inner, steps } }],
    bends: [bend],
  };
  const fold = foldSheet(feature, profile);
  const press = machineOf(machine || undefined);
  const checks = sequenceChecks({ fold, machine: press, profile });
  const [lo, hi] = foldedBounds(fold);
  const flatNumbers = flatSummary(profilePolygon(profile), profile);
  return {
    profile,
    bends: [bend],
    marks: feature.marks,
    feature,
    fold,
    strokes: [{ kind: 'round', edge: null, crease: null, bendIds: [bend.id] }],
    numbers: {
      radius: inner,
      kFactor: numbers.kFactor,
      allowance: numbers.allowance,
      steps,
      stepAngle: 90 / steps,
      pitch: numbers.allowance / steps,
      die,
    },
    report: {
      blank: {
        width: flatNumbers.width,
        height: flatNumbers.height,
        area: flatNumbers.area,
        cutLength: flatNumbers.cutLength,
        pierces: flatNumbers.pierces,
      },
      folded: { size: hi.map((v, i) => v - lo[i]), bounds: [lo, hi] },
      strokes: 1,
      sequence: checks.map((c) => ({
        index: c.index,
        label: c.label,
        kind: 'round',
        ok: !c.refusals.length && !c.collision,
        message: c.collision?.message || c.refusals[0]?.message || '',
      })),
      problems: checks
        .filter((c) => c.refusals.length || c.collision)
        .map((c) => ({ index: c.index, label: c.label, message: c.collision?.message || c.refusals[0].message })),
      warnings: fold.warnings.map((w) => w.message),
      machine: press.name,
    },
  };
}

// ---------------------------------------------------------------- folded clearance
// The pieces as solids for the clearance check: each piece's top and bottom
// faces (triangulated outline) and its sides, in the folded part frame.
function pieceSolid(fold, piece) {
  const t = fold.thickness;
  const ring = piece.outer;
  const top = triangulateRing(ring);
  const lift = (z) => (p) => transformPoint(piece.matrix, [p[0], p[1], z]);
  const triangles = [
    ...top.map((tri) => tri.map(lift(0))),
    ...top.map((tri) => tri.map(lift(t))),
    ...ring.flatMap((p, i) => {
      const q = ring[(i + 1) % ring.length];
      const [a, b, c, d] = [lift(0)(p), lift(0)(q), lift(t)(q), lift(t)(p)];
      return [
        [a, b, c],
        [a, c, d],
      ];
    }),
  ];
  // Outline points every 2 mm on both faces (where two pieces come closest).
  const points = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      q = ring[(i + 1) % ring.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(...sub(q, p)) / 2));
    for (let k = 0; k < steps; k++) {
      const s = add(p, mul(sub(q, p), k / steps));
      points.push(lift(0)(s), lift(t)(s));
    }
  }
  const min = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])));
  const max = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])));
  return { id: piece.id, triangles, points, box: [min, max] };
}
// Distance from point p to triangle (a, b, c) (Ericson, Real-Time Collision Detection 5.1.5).
function pointTriangle(p, [a, b, c]) {
  const v = (x, y) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
  const d3 = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const at = (o, e1, s, e2, r) => [
    o[0] + e1[0] * s + e2[0] * r,
    o[1] + e1[1] * s + e2[1] * r,
    o[2] + e1[2] * s + e2[2] * r,
  ];
  const ab = v(b, a),
    ac = v(c, a),
    ap = v(p, a);
  const d1 = d3(ab, ap),
    d2 = d3(ac, ap);
  let q;
  if (d1 <= 0 && d2 <= 0) q = a;
  else {
    const bp = v(p, b);
    const e3 = d3(ab, bp),
      e4 = d3(ac, bp);
    const cp = v(p, c);
    const e5 = d3(ab, cp),
      e6 = d3(ac, cp);
    const vc = d1 * e4 - e3 * d2,
      vb = e5 * d2 - d1 * e6,
      va = e3 * e6 - e5 * e4;
    if (e3 >= 0 && e4 <= e3) q = b;
    else if (vc <= 0 && d1 >= 0 && e3 <= 0) q = at(a, ab, d1 / (d1 - e3), ac, 0);
    else if (e6 >= 0 && e5 <= e6) q = c;
    else if (vb <= 0 && d2 >= 0 && e6 <= 0) q = at(a, ab, 0, ac, d2 / (d2 - e6));
    else if (va <= 0 && e4 - e3 >= 0 && e5 - e6 >= 0) {
      const w = (e4 - e3) / (e4 - e3 + (e5 - e6));
      q = [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
    } else {
      const denom = 1 / (va + vb + vc);
      q = at(a, ab, vb * denom, ac, vc * denom);
    }
  }
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
const near = ([a0, a1], [b0, b1], margin) => [0, 1, 2].every((k) => a0[k] <= b1[k] + margin && b0[k] <= a1[k] + margin);
/**
 * How far apart the folded flanges stand (§6.3 invariant): for every pair of
 * pieces of `fold` that are not joined by a bend and not both face pieces
 * (`facePieces`: ids), the least distance between them (0 when they cross;
 * pairs further apart than 5 mm are left out). [{ pair: [id, id], distance }].
 */
export function pieceClearances(fold, facePieces = new Set()) {
  const joined = new Set(fold.bends.flatMap((b) => b.movingPieces.map((m) => [b.fixedPiece, m].sort().join('|'))));
  const solids = fold.pieces.map((piece) => pieceSolid(fold, piece));
  const out = [];
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) {
      const A = solids[i],
        B = solids[j];
      if (facePieces.has(A.id) && facePieces.has(B.id)) continue;
      if (joined.has([A.id, B.id].sort().join('|'))) continue;
      if (!near(A.box, B.box, 5)) continue;
      let distance = Infinity;
      if (A.triangles.some((s) => B.triangles.some((u) => trianglesCross(s, u)))) distance = 0;
      else
        for (const [P, Q] of [
          [A, B],
          [B, A],
        ])
          for (const p of P.points) {
            if (!near([p, p], Q.box, distance)) continue;
            for (const tri of Q.triangles) distance = Math.min(distance, pointTriangle(p, tri));
          }
      if (distance < 5) out.push({ pair: [A.id, B.id], distance });
    }
  return out;
}
