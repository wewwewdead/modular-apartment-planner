// The press brake station's maths (docs/sketch-studio-fab-shop.md §9 SM-2):
// gauge edges and the backgauge reading on the flat blank, the checks a hit
// must pass before the pedal (each refusal names its remedy), the part's pose
// in the machine, and the stroke's timeline. Pure: no three, no DOM.
//
// Machine frame (mm): X along the bed (its centre at 0), Y across it with the
// backgauge behind at +Y and the operator in front at −Y, Z up; the die's top
// (its shoulder tangents) at Z = 0 and its V centred on Y = 0. The punch tip
// is at Z = `tipZ`. The machine always bends up: a `down` bend is made with
// the sheet turned over.
//
// Matrices are 4 × 4 column-major, like sheetMetal.js.
import {
  autoHits,
  bendArcPoint,
  bumpHits,
  foldSheet,
  identityMatrix,
  lineSegments,
  madeBends,
  multiplyMatrices,
  pointInRing,
  polygonBounds,
  poseFold,
  transformPoint,
  zoneSamples,
} from './sheetMetal.js';
import {
  BACKGAUGE,
  DEFAULT_PUNCH,
  DIES,
  FINGER_FACE,
  MACHINES,
  dieOf,
  hornOf,
  hornWords,
  machineOf,
  maxBendAngle,
  minLeg,
  punchOf,
  punchSection,
  radiusDieOpening,
  radiusPunchFor,
  ramDepth,
  SHORTEST_SECTION,
  shoulderOffset,
  springback,
  stockOf,
  suggestedDie,
  tonnage,
  toolingLimit,
} from './shopCatalog.js';

// The ram parks this far above the sheet between hits (its speed-change point).
export const STROKE_GAP = 40;
// Between the hits of one round bend the ram lifts only this far (round-bend
// spec §6, its own choice): the sheet is slid one pitch on, not taken out.
export const BUMP_GAP = 10;
// Horn sections (docs/sketch-studio-punch-library.md §4.3): a horn stands under
// what overhangs it, so the box is slid onto the horns with the punch held
// only this far above the sheet, and off again along the punch.
export const HORN_GAP = 5;
// A bend phase never runs quicker than this, so the wings are seen rising.
export const MIN_BEND_MS = 350;
// The sheet turned over on the die (brake flip tooling §5.1, view only): about half a second.
export const TURN_MS = 500;
// The sheet slid along the bed to the pieces picked (piece pick §6.2, view only).
export const SLIDE_MS = 300;
// Gauge edges: straight outline edges at least this long; an edge whose both
// corners turn less than SMOOTH_TURN is a chord of a sampled curve, not a side.
const MIN_GAUGE_EDGE = 3;
const SMOOTH_TURN = (12 * Math.PI) / 180;

const fmt = (value) => Number(value.toFixed(2)).toString();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale3 = (a, k) => a.map((v) => v * k);
const unit3 = (a) => {
  const length = Math.hypot(...a);
  return a.map((v) => v / length);
};
// A direction through a matrix (no translation).
const turn = (m, d) => [
  m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
  m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
  m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
];

// ---------------------------------------------------------------- gauge edges
/**
 * The blank's straight outline edges a backgauge finger can stop: collinear
 * runs merged, chords of sampled curves left out. `outer` is counter-clockwise
 * (profilePolygon). Returns [{ index, a, b, length, d (unit along a → b),
 * inward (unit normal into the material) }].
 */
export function gaugeEdges(outer) {
  const n = outer.length;
  const segments = [];
  for (let i = 0; i < n; i++) {
    const a = outer[i],
      b = outer[(i + 1) % n];
    const length = Math.hypot(...sub(b, a));
    if (length > 1e-9) segments.push({ a, b, length, d: [(b[0] - a[0]) / length, (b[1] - a[1]) / length] });
  }
  // Merge collinear neighbours (a polygon-clipping ring can split a side).
  const merged = [];
  for (const segment of segments) {
    const last = merged.at(-1);
    if (last && Math.abs(last.d[0] * segment.d[1] - last.d[1] * segment.d[0]) < 1e-9 && dot(last.d, segment.d) > 0) {
      last.b = segment.b;
      last.length = Math.hypot(...sub(last.b, last.a));
    } else merged.push({ ...segment });
  }
  if (merged.length > 1) {
    const first = merged[0],
      last = merged.at(-1);
    if (Math.abs(last.d[0] * first.d[1] - last.d[1] * first.d[0]) < 1e-9 && dot(last.d, first.d) > 0) {
      first.a = last.a;
      first.length = Math.hypot(...sub(first.b, first.a));
      merged.pop();
    }
  }
  const turnAt = (p, q) => Math.acos(Math.max(-1, Math.min(1, dot(p.d, q.d))));
  return merged
    .filter((edge, i) => {
      if (edge.length < MIN_GAUGE_EDGE) return false;
      const before = merged[(i - 1 + merged.length) % merged.length],
        after = merged[(i + 1) % merged.length];
      return !(turnAt(before, edge) < SMOOTH_TURN && turnAt(edge, after) < SMOOTH_TURN);
    })
    .map((edge, index) => ({
      index,
      a: edge.a,
      b: edge.b,
      length: edge.length,
      d: edge.d,
      inward: [-edge.d[1], edge.d[0]],
    }));
}

/** Distance from a flat point to the segment a–b. */
export function segmentDistance(point, a, b) {
  const d = sub(b, a);
  const length2 = dot(d, d);
  const f = length2 > 1e-18 ? Math.max(0, Math.min(1, dot(sub(point, a), d) / length2)) : 0;
  return Math.hypot(point[0] - (a[0] + d[0] * f), point[1] - (a[1] + d[1] * f));
}

/**
 * The flat-blank card's pick where click areas overlap (a thin blank: the two
 * long edges' strips cover its short ends and everything across it): of
 * `lines` ([{ a, b, reach }], reach the half-width of the line's own click
 * area), the one nearest `point` among those within their reach; `prefer`
 * (one of them, the element clicked) wins a tie. null when none is in reach.
 */
export function nearestLine(lines, point, prefer = null) {
  let best = null,
    bestDistance = Infinity;
  for (const line of lines) {
    const d = segmentDistance(point, line.a, line.b);
    if (d > line.reach + 1e-9) continue;
    if (d < bestDistance - 1e-9 || (line === prefer && d <= bestDistance + 1e-9)) [best, bestDistance] = [line, d];
  }
  return best;
}

/**
 * The punch line parallel to a gauge edge, `distance` in from it, run across
 * the whole blank (a full-length punch bends every interval the line crosses).
 */
export function gaugeBendLine(outer, edge, distance) {
  const p = [edge.a[0] + edge.inward[0] * distance, edge.a[1] + edge.inward[1] * distance];
  const [[x0, y0], [x1, y1]] = polygonBounds(outer);
  const along = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map((corner) => dot(sub(corner, p), edge.d));
  const s0 = Math.min(...along) - 1,
    s1 = Math.max(...along) + 1;
  return {
    a: [p[0] + edge.d[0] * s0, p[1] + edge.d[1] * s0],
    b: [p[0] + edge.d[0] * s1, p[1] + edge.d[1] * s1],
  };
}

/**
 * The backgauge reading L for a bend of `fold` against a gauge edge: the flat
 * distance from the punch line to the edge, valid only when the edge is
 * parallel to the line and on a flat face beside the bend (the face that lies
 * on the die). { distance } or { distance: null, reason }.
 */
export function gaugeReading(fold, bendId, edge) {
  // A stroke's bends lie on one flat line: the first gives the distance, any of them the face.
  const ids = Array.isArray(bendId) ? bendId : [bendId];
  const members = ids.map((id) => fold.bends.find((b) => b.id === id)).filter(Boolean);
  const bend = members[0];
  if (!bend || !edge) return { distance: null, reason: 'Pick a gauge edge.' };
  if (Math.abs(edge.d[0] * bend.u[1] - edge.d[1] * bend.u[0]) > 1e-6)
    return { distance: null, reason: 'The gauge edge is not parallel to the punch line.' };
  const mid = [(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2];
  // Just inside the edge, to find the face it bounds.
  const probe = [mid[0] + edge.inward[0] * 0.01, mid[1] + edge.inward[1] * 0.01];
  const piece = fold.pieces.find((p) => pointInRing(probe, p.outer) && !p.holes.some((h) => pointInRing(probe, h)));
  if (!piece || !members.some((m) => piece.id === m.fixedPiece || m.movingPieces.includes(piece.id)))
    return { distance: null, reason: 'The gauge edge is on a face another bend separates from this one.' };
  return { distance: Math.abs(dot(sub(mid, bend.a), bend.n)), piece: piece.id };
}

// ---------------------------------------------------------------- gauging off a flange (docs/sketch-studio-skin-gauge.md)
const SEPARATED = 'The gauge edge is on a face another bend separates from this one.';
// How finely a bend zone's arc is walked for the reading (§4.2), before the extreme is refined.
const ARC_SAMPLES = 24;
const REFINE_STEPS = 40;

/**
 * The machine frame of a flat punch line (§4.2): the frame brakeFrame poses a
 * flat bend in, built straight from the matrix of the face the line lies in.
 * `matrix`: that face's flat → posed matrix; `point`: a flat point on the
 * line; `back`: the flat unit normal toward the side that goes to the
 * backgauge; `up`: the bend is made up (down: the sheet turned over).
 * Returns the posed → machine matrix (column-major): X along the line, Y to
 * the backgauge, Z up, the die top (the sheet's underside) at Z = 0.
 */
export function flatLineFrame(matrix, point, back, up, thickness) {
  const P = transformPoint(matrix, [point[0], point[1], up ? 0 : thickness]);
  const Y = unit3(turn(matrix, [back[0], back[1], 0]));
  const Z = unit3(turn(matrix, [0, 0, up ? 1 : -1]));
  const X = cross3(Y, Z);
  return [X[0], Y[0], Z[0], 0, X[1], Y[1], Z[1], 0, X[2], Y[2], Z[2], 0, -dot3(X, P), -dot3(Y, P), -dot3(Z, P), 1];
}

/**
 * How far back of the punch line the part reaches where the backgauge
 * fingers stand (§4.2): the largest machine Y of its material with Z within
 * the finger's stop face (−below … +above). `posed`: poseFold's result;
 * `toMachine`: posed → machine (flatLineFrame, brakeFrame's matrix). The
 * material: every piece's outline at both skins and its edge faces, clipped
 * to the face's band (a leaning flange meets the finger's top corner part way
 * along an edge), and every bend zone at both skins (bendArcPoint; a flange
 * past 90° is stopped on its arc), refined to its extreme. Across the whole
 * bed. The largest Y, or null when nothing behind the line is in the band.
 */
export function skinReach(posed, toMachine, { face = FINGER_FACE } = {}) {
  const t = posed.thickness;
  const lo = -face.below,
    hi = face.above;
  const inBand = (p) => p[2] >= lo - 1e-9 && p[2] <= hi + 1e-9;
  let best = -Infinity;
  const consider = (p) => {
    if (inBand(p) && p[1] > best) best = p[1];
  };
  // A straight run p → q clipped to the band: its ends inside, or where it crosses a level.
  const segment = (p, q) => {
    consider(p);
    consider(q);
    for (const level of [lo, hi]) {
      const dz = q[2] - p[2];
      if (Math.abs(dz) < 1e-12) continue;
      const f = (level - p[2]) / dz;
      if (f > 0 && f < 1) consider([0, p[1] + (q[1] - p[1]) * f, level]);
    }
  };
  for (const piece of posed.pieces) {
    const M = multiplyMatrices(toMachine, piece.matrix);
    const skins = [0, t].map((z) => piece.outer.map(([x, y]) => transformPoint(M, [x, y, z])));
    const n = piece.outer.length;
    for (let i = 0; i < n; i++) {
      for (const ring of skins) segment(ring[i], ring[(i + 1) % n]);
      segment(skins[0][i], skins[1][i]);
    }
  }
  for (const bend of posed.bends) {
    const tr = bend.transform;
    const F = multiplyMatrices(toMachine, bend.fixedMatrix);
    for (const interval of bend.intervals)
      for (const s of interval)
        for (const z of [0, t]) {
          const at = (fraction) => transformPoint(F, bendArcPoint(bend, t, tr, s, fraction, z));
          const fractions = Array.from({ length: ARC_SAMPLES + 1 }, (_, k) => k / ARC_SAMPLES);
          const points = fractions.map(at);
          points.forEach(consider);
          for (let k = 0; k < ARC_SAMPLES; k++) {
            // Where the arc crosses a level of the band, found on the arc itself.
            for (const level of [lo, hi]) {
              const [p, q] = [points[k], points[k + 1]];
              if ((p[2] - level) * (q[2] - level) >= 0) continue;
              let [a, b] = [fractions[k], fractions[k + 1]];
              const below = p[2] < level;
              for (let step = 0; step < REFINE_STEPS; step++) {
                const middle = (a + b) / 2;
                if (at(middle)[2] < level === below) a = middle;
                else b = middle;
              }
              const crossing = at((a + b) / 2);
              consider([crossing[0], crossing[1], level]);
            }
          }
          // The arc's own extreme back (a flange past 90° reaches back on its arc): refined between its neighbours.
          for (let k = 1; k < ARC_SAMPLES; k++) {
            const [p, m, q] = [points[k - 1], points[k], points[k + 1]];
            if (!(m[1] >= p[1] && m[1] >= q[1]) || !inBand(m)) continue;
            let [a, b] = [fractions[k - 1], fractions[k + 1]];
            for (let step = 0; step < REFINE_STEPS; step++) {
              const c = a + (b - a) / 3,
                d = b - (b - a) / 3;
              if (at(c)[1] < at(d)[1]) a = c;
              else b = d;
            }
            consider(at((a + b) / 2));
          }
        }
  }
  return best > 1e-9 ? best : null;
}

/**
 * The made bends a gauge edge's fingers can stand against (§4.4): bends of
 * `fold` parallel to `edge`, in front of it, whose material runs across the
 * edge's span (those on the way from the edge's face inward), `exclude`
 * (ids: a pending stroke's own) left out. Nearest the edge first: [{ bendId,
 * d (flat mm from the edge to its line), half (its allowance / 2) }].
 */
export function gaugeStops(fold, edge, { exclude = [] } = {}) {
  if (!fold?.bends?.length || !edge) return [];
  const span = [dot(edge.a, edge.d), dot(edge.b, edge.d)].sort((p, q) => p - q);
  return fold.bends
    .filter((bend) => !exclude.includes(bend.id) && Math.abs(edge.d[0] * bend.u[1] - edge.d[1] * bend.u[0]) < 1e-6)
    .map((bend) => ({ bend, d: dot(sub(bend.a, edge.a), edge.inward) }))
    .filter(
      ({ bend, d }) =>
        d > 1e-6 &&
        bend.intervals.some((interval) => {
          const ends = interval.map((s) => dot([bend.a[0] + bend.u[0] * s, bend.a[1] + bend.u[1] * s], edge.d));
          return Math.min(Math.max(...ends), span[1]) - Math.max(Math.min(...ends), span[0]) > 1e-6;
        }),
    )
    .sort((p, q) => p.d - q.d)
    .map(({ bend, d }) => ({ bendId: bend.id, d, half: bend.allowance / 2 }));
}

/**
 * The backgauge reading for a hit (§4.2): gaugeReading's answer wherever it
 * has one (the flat distance, the same code path); where the edge is on a
 * face another bend separates from the line, the skin of the formed part:
 * the part posed as it stands when the hit is made (`angles`, an armed try's
 * other bends included; the stroke's own bends flat), in the machine frame of
 * the flat line (the side holding the edge to the back), read by skinReach.
 * { distance, stop: { bendId } (the nearest bend standing between the edge
 * and the line: its flange is what the fingers stop), flat (the line's flat
 * distance from the edge) } or gaugeReading's { distance: null, reason }.
 */
export function brakeReading(fold, bendId, edge, { angles = {}, face = FINGER_FACE } = {}) {
  const own = gaugeReading(fold, bendId, edge);
  if (own.distance != null || own.reason !== SEPARATED) return own;
  const ids = Array.isArray(bendId) ? bendId : [bendId];
  const posed = poseFold(fold, { ...angles, ...Object.fromEntries(ids.map((id) => [id, 0])) });
  const bend = posed.bends.find((b) => b.id === ids[0]);
  const flat = dot(sub(bend.a, edge.a), edge.inward);
  // The line's own flat frame (the stroke's bends are flat: one plane), the edge's side to the back.
  const back = dot(sub(edge.a, bend.a), bend.n) < 0 ? [-bend.n[0], -bend.n[1]] : bend.n;
  const frame = flatLineFrame(bend.fixedMatrix, bend.a, back, bend.direction === 'up', posed.thickness);
  const distance = skinReach(posed, frame, { face });
  if (distance == null)
    return { distance: null, reason: 'Nothing of the part stands where the backgauge fingers are.' };
  const standing = gaugeStops(posed, edge, { exclude: ids }).filter(
    (s) => s.d < flat - 1e-6 && posed.bends.find((b) => b.id === s.bendId).posedAngle > 1e-9,
  );
  return { distance, stop: standing.length ? { bendId: standing.at(-1).bendId } : null, flat };
}

/**
 * The take-up of a stop (§4.3): how much farther the punch line lies from
 * the gauge edge on the flat blank than the backgauge reads, for a line in
 * the face just beyond the made bend `bendId` (the part as made, every step
 * done; `up`: which side up the hit is made). flat − reads, the same
 * anywhere in that face. 0 when the face or the reading is not there.
 */
export function stopTakeUp(fold, edge, bendId, { up = true, face = FINGER_FACE } = {}) {
  const bend = fold.bends.find((b) => b.id === bendId);
  if (!bend || !edge) return 0;
  const d = dot(sub(bend.a, edge.a), edge.inward);
  // A point just past the zone, in the middle of the bend's longest run.
  const [s0, s1] = bend.intervals.reduce((best, i) => (i[1] - i[0] > best[1] - best[0] ? i : best));
  const s = (s0 + s1) / 2;
  const sign = dot(bend.n, edge.inward) >= 0 ? 1 : -1;
  const past = bend.allowance / 2 + Math.min(0.5, fold.thickness / 2);
  const point = [
    bend.a[0] + bend.u[0] * s + bend.n[0] * sign * past,
    bend.a[1] + bend.u[1] * s + bend.n[1] * sign * past,
  ];
  const piece = fold.pieces.find((p) => pointInRing(point, p.outer) && !p.holes.some((h) => pointInRing(point, h)));
  if (!piece) return 0;
  const posed = poseFold(fold);
  const matrix = posed.pieces.find((p) => p.id === piece.id).matrix;
  const frame = flatLineFrame(matrix, point, [-edge.inward[0], -edge.inward[1]], up, posed.thickness);
  const reads = skinReach(posed, frame, { face });
  return reads == null ? 0 : d + past - reads;
}

// ---------------------------------------------------------------- the hit's checks
const dieName = (d) => `${d.name} die`;
// The largest catalogue die of the same angle whose minimum leg a flat leg
// meets (and, for a radius punch, at least `wider` wide).
const dieForLeg = (dieEntry, angle, leg, wider = null) =>
  Object.values(DIES)
    .filter(
      (d) => d.angle === dieEntry.angle && minLeg(d, angle) <= leg + 1e-9 && (wider == null || d.v >= wider - 1e-9),
    )
    .sort((a, b) => b.v - a.v)[0] || null;
/**
 * A radius-punch bend made the other way (round-bend spec §12.4): bump hits
 * at the same radius with the straight punch, its automatic die and hit
 * count. { die, steps, needed (the flat distance from the punch line each leg
 * needs: the per-hit minimum leg beside the outermost hit, + BA/2 − p/2) }.
 */
function bumpAlternative(fold, bend) {
  const t = fold.thickness;
  const die = suggestedDie(t).die;
  const steps = autoHits({ allowance: bend.allowance, die: die.key, thickness: t });
  const pitch = bend.allowance / steps;
  return { die, steps, needed: minLeg(die, bend.angle / steps) + bend.allowance / 2 - pitch / 2 };
}
// The remedy when not even the smallest die of that angle carries the leg: a larger blank, by how much.
function shortLegRemedy(dieEntry, angle, label) {
  const smallest = Object.values(DIES)
    .filter((d) => d.angle === dieEntry.angle)
    .sort((a, b) => a.v - b.v)[0];
  return `No catalogue die is small enough: cut the blank larger, so the ${label} is at least ${fmt(minLeg(smallest, angle))} mm from the punch line, and use the ${dieName(smallest)}.`;
}
const widerDie = (dieEntry) =>
  Object.values(DIES)
    .filter((d) => d.angle === dieEntry.angle && d.v > dieEntry.v)
    .sort((a, b) => a.v - b.v)[0] || null;

/**
 * Everything the NC panel shows for one hit, and whether the machine takes it:
 * the pending `bend` (a §4.1 bend: a, b, angle, direction, radius, punch, die)
 * folded after the feature's own bends. `gauge` (optional): { distance } the
 * backgauge reading, checked against the backgauge's reach.
 * Returns { error } when the fold refuses the line, else { fold, bend (the
 * resolved bend), punch, die, dieAuto, readouts, refusals, warnings }.
 */
export function brakeHit({ feature, profile, params = {}, bend, machine, gauge = null, side = null, lineSign = 1 }) {
  // A stroke may make several bends (shop floor §6.1): `bend` is one or a list.
  const members = Array.isArray(bend) ? bend : [bend];
  // The fold names bends by their place among the bends (a bend-on hit is none, tight bends §4.1).
  const count = madeBends(feature.bends || []).length;
  let fold;
  try {
    fold = foldSheet({ ...feature, bends: [...(feature.bends || []), ...members] }, profile, params);
  } catch (error) {
    let message = error.message || String(error);
    for (let k = members.length; k >= 1; k--) message = message.replace(`Bend ${count + k}`, 'This hit');
    return { error: message };
  }
  const ids = members.map((m) => m.id);
  return assessBend(fold, ids.length === 1 ? ids[0] : ids, {
    machine,
    gauge,
    dieAuto: !members[0].die,
    label: 'This hit',
    angles: Object.fromEntries(ids.map((id) => [id, 0])),
    // The sheet slid (docs/sketch-studio-sheet-slide.md §3): the side to the back, for left and
    // right; the session line's way along the first bend's u, for a fix's slide.
    side,
    lineSign: typeof lineSign === 'function' ? lineSign(fold.bends.find((b) => b.id === ids[0])) : lineSign,
  });
}

/**
 * Are the bends of one stroke in line as the machine finds them (§6.1)? In
 * the pose `angles` (the part's state before the stroke), every member's
 * bend axis must lie on one line and their fixed faces in one plane, facing
 * the same way, to 0.01 mm and 0.01°. Returns null, or the refusal message.
 */
export function strokeInLine(fold, bendIds, angles = {}) {
  if (bendIds.length < 2) return null;
  const posed = poseFold(fold, angles);
  const cosTol = Math.cos((0.01 * Math.PI) / 180);
  const frames = bendIds.map((id) => {
    const bend = posed.bends.find((b) => b.id === id);
    const F = bend.fixedMatrix;
    return {
      p: transformPoint(F, [bend.a[0], bend.a[1], 0]),
      d: unit3(turn(F, [bend.u[0], bend.u[1], 0])),
      z: unit3(turn(F, [0, 0, 1])),
      side: unit3(turn(F, [-bend.n[0], -bend.n[1], 0])),
    };
  });
  const [first] = frames;
  const off = (p) => {
    const w = [p[0] - first.p[0], p[1] - first.p[1], p[2] - first.p[2]];
    return Math.hypot(...cross3(w, first.d));
  };
  const apart = frames.some(
    (f) =>
      Math.abs(dot3(f.d, first.d)) < cosTol ||
      off(f.p) > 0.01 ||
      dot3(f.z, first.z) < cosTol ||
      dot3(f.side, first.side) < cosTol,
  );
  // A plain click on a piece bends only it (piece pick §5.6): the one-at-a-time way.
  return apart
    ? 'The sheet is already bent between these flanges, so they are no longer in line. Bend them one at a time: click a piece to bend only it.'
    : null;
}

/**
 * The machine's checks for one bend of a fold (the pending hit, or a step of
 * the sequence): its tooling is the bend's own (`punch`, `die` as resolved by
 * foldSheet); `dieAuto` says the die was chosen automatically. Same result
 * shape as brakeHit.
 */
export function assessBend(
  fold,
  bendId,
  { machine, gauge = null, dieAuto = false, label = null, angles = null, side = null, lineSign = 1 } = {},
) {
  // A stroke (shop floor §6.1): `bendId` may list its bends. The first is the
  // one read for the tooling and the numbers (a stroke's members share them);
  // the force is the sum, the span the union, the legs checked per member.
  const ids = Array.isArray(bendId) ? bendId : [bendId];
  const members = ids.map((id) => fold.bends.find((b) => b.id === id));
  const resolved = members[0];
  const name = label || `Bend ${resolved.index + 1}`;
  const stock = stockOf(fold.stock),
    t = fold.thickness;
  const press = typeof machine === 'string' || machine == null ? machineOf(machine) : machine;
  const punch = punchOf(resolved.punch || DEFAULT_PUNCH);
  const auto = suggestedDie(t, punch);
  const die = dieOf(resolved.die);
  const along = members.flatMap((m) =>
    m.intervals.flatMap((iv) =>
      iv.map((s) => dot(sub([m.a[0] + m.u[0] * s, m.a[1] + m.u[1] * s], resolved.a), resolved.u)),
    ),
  );
  const span = Math.max(...along) - Math.min(...along);
  const length = members.reduce((sum, m) => sum + m.length, 0);
  const force = tonnage(stock, t, length, die);
  // Brake tool length (§3.3): a punch or die set shorter or longer than the
  // bend. Each tool carries the force over the length of it under the bend.
  // The sheet slid under the punch (docs/sketch-studio-sheet-slide.md §4) is read the same way.
  const slid = Boolean(resolved.slide);
  const trimmed = Boolean(resolved.punchTrim || resolved.dieTrim || slid);
  const tooling = trimmed ? strokeTooling(fold, ids, { bed: press.bed }) : null;
  const cover = trimmed ? toolingCover(tooling) : null;
  // Left and right (sheet slide §3): only where the side to the back is known (the pending hit's `side`).
  const sign = side ? frameSign(resolved, side) : null;
  // The same hit with the sheet centred: what "Centre the sheet" would leave (§4.4).
  const centred = slid
    ? toolingCover(
        strokeTooling({ ...fold, bends: fold.bends.map((b) => (ids.includes(b.id) ? { ...b, slide: 0 } : b)) }, ids, {
          bed: press.bed,
        }),
      )
    : null;
  const centre = { label: 'Centre the sheet', session: { slide: 0 } };
  const under = cover
    ? { punch: (cover.punch.length / cover.bend) * length, die: (cover.die.length / cover.bend) * length }
    : null;
  // Horn sections (docs/sketch-studio-punch-library.md §4.3): the punch with
  // them is rated at HORN.load of its own kN/m (the catalogue's 50 %).
  // A horn of another length (§4.8) is read by hornOf and named by its words.
  const horn = punch.round ? null : hornOf(resolved.horns);
  const horns = Boolean(horn);
  const rated = horns ? { ...punch, load: punch.load * horn.load } : punch;
  const punchName = horns ? `${punch.name} punch with ${hornWords(resolved.horns)}` : `${punch.name} punch`;
  const limit = under ? toolingLimit(rated, die, under.punch, under.die) : toolingLimit(rated, die, length);
  // A round bend (round-bend spec §5.4) is checked per hit: one hit's angle
  // for the die and the legs, one hit's ram depth with the springback shared
  // equally (the springback readout stays the whole bend's).
  const bump = bumpHits(resolved, t);
  const hitAngle = bump ? bump.stepAngle : resolved.angle;
  const overbend = springback(stock, resolved.angle, resolved.radius, t);
  const hitOverbend = bump ? overbend / bump.steps : overbend;
  const depth = ramDepth({
    v: die.v,
    thickness: t,
    radius: resolved.radius,
    angle: hitAngle,
    springback: hitOverbend,
    shoulderRadius: die.shoulderRadius,
    dieAngle: die.angle,
  });
  const refusals = [];
  // `fix` (docs/sketch-studio-shop-floor.md §4.6): when the remedy is one
  // station field, { label, session } — the brake session patch that applies it.
  const refuse = (code, message, fix = null) => refusals.push(fix ? { code, message, fix } : { code, message });
  // Both 30° punches named (docs/sketch-studio-shop-punches.md §5.6): the shop's A 103 and the catalogue's.
  const widest = maxBendAngle(die);
  if (hitAngle > widest + 1e-9)
    refuse(
      'angle',
      `The ${dieName(die)} bends to at most ${fmt(widest)}° (180° − its ${die.angle}° V). For ${fmt(resolved.angle)}° fit an acute 30° die (V8, V12 or V16) and a 30° punch (the A 103 or the Acute 30°).`,
    );
  // A radius punch's round nose has no flank angle to compare (round-bend spec §12.4).
  if (!punch.round && punch.angle > die.angle + 1e-9)
    refuse(
      'punch-angle',
      `The ${punch.name} punch does not go into the ${dieName(die)}: a punch may not be blunter than its die. Use a 30° punch: the A 103 or the Acute 30°.`,
    );
  const inLine = ids.length > 1 && angles ? strokeInLine(fold, ids, angles) : null;
  if (inLine) refuse('not-in-line', inLine);
  // A radius punch needs a die at least 2.2 × (R + t) wide (round-bend spec §12.4).
  const radiusWanted = punch.round ? radiusDieOpening(punch, t) : null;
  if (punch.round && die.v < radiusWanted - 1e-9) {
    const fit = auto.fits ? auto.die : null;
    refuse(
      'radius-die',
      `The ${punch.name} punch with ${fmt(t)} mm sheet needs a die at least ${fmt(radiusWanted)} mm wide; the ${dieName(die)} is ${fmt(die.v)} mm. ${fit ? `Use the ${dieName(fit)}.` : 'No die in the catalogue is that wide: use a smaller radius punch, or bump hits.'}`,
      fit ? { label: `Use the ${dieName(fit)}`, session: { die: fit.key } } : null,
    );
  }
  const needed = minLeg(die, hitAngle);
  // A radius-punch bend whose leg is short: the other way, bump hits at the same radius (§12.4).
  const bumpWay = punch.round ? bumpAlternative(fold, resolved) : null;
  // An angle past the die's widest (the `angle` refusal above): its legs have nothing true
  // to say (minLeg there is no length), so they are not checked (the PK-1 audit).
  const legsChecked = !(hitAngle > widest + 1e-9);
  for (const [k, member] of legsChecked ? members.entries() : [])
    for (const [side, label] of [
      ['moving', 'flange'],
      ['fixed', 'other leg'],
    ]) {
      // A round bend: the sheet beside the outermost hit on that side, bumped or not.
      const leg = bump ? member.flatLegs[side] - member.allowance / 2 + bump.pitch / 2 : member.flatLegs[side];
      if (leg >= needed - 1e-9) continue;
      // A radius punch: only a die it still fits in is a remedy.
      const smaller = dieForLeg(die, hitAngle, leg, radiusWanted);
      const what = members.length > 1 ? `${label} of tab ${k + 1}` : label;
      const bumpFits = Boolean(bumpWay) && member.flatLegs[side] >= bumpWay.needed - 1e-9;
      const bumpFix = bumpFits
        ? {
            label: 'Make it with bump hits',
            session: { shape: 'round', radius: resolved.radius, steps: null, punch: DEFAULT_PUNCH, die: null },
          }
        : null;
      const orBump = bumpFits ? `, or make it with bump hits: they need only about ${fmt(bumpWay.needed)} mm` : '';
      const remedy = smaller
        ? `Use the ${dieName(smaller)} or smaller, or cut the blank larger${orBump}.`
        : punch.round
          ? `Cut the blank larger, so the ${label} is at least ${fmt(needed)} mm from the punch line${orBump}.`
          : shortLegRemedy(die, hitAngle, label);
      refuse(
        'short-leg',
        `The ${what} is ${fmt(leg)} mm from the ${bump ? 'outermost hit' : 'punch line'} in the flat; the ${dieName(die)} needs ${fmt(needed)} mm to carry it on both shoulders. ${remedy}`,
        smaller ? { label: `Use the ${dieName(smaller)}`, session: { die: smaller.key } } : bumpFix,
      );
    }
  if (force > press.force + 1e-9) {
    const wider = widerDie(die);
    const bigger = Object.values(MACHINES).find((m) => m.force >= force && m.bed >= span);
    refuse(
      'tonnage',
      `This hit needs ${fmt(force)} kN; the ${press.name} gives ${fmt(press.force)} kN. ${wider ? `A wider die lowers the force (the ${dieName(wider)} needs ${fmt(tonnage(stock, t, length, wider))} kN)` : 'Use a wider die'}${bigger ? `, or use the ${bigger.name}` : ''}.`,
      wider ? { label: `Use the ${dieName(wider)}`, session: { die: wider.key } } : null,
    );
  }
  // Horn sections the weaker tool (punch library §4.3): named, and the punch without them is the remedy.
  const half = (punchWeaker) => (horns && punchWeaker ? " (half the punch's)" : '');
  const otherPunch = (punchWeaker) =>
    horns && punchWeaker
      ? ', or bend it without horn sections'
      : punch.load < 1000
        ? ' or the straight punch (1000 kN/m)'
        : '';
  if (force > limit + 1e-9 && !under) {
    const punchWeaker = rated.load <= die.load;
    const weaker = punchWeaker ? punchName : dieName(die);
    refuse(
      'tooling-load',
      `This hit needs ${fmt(force)} kN; the ${weaker} is rated ${Math.min(rated.load, die.load)} kN/m${half(punchWeaker)}, ${fmt(limit)} kN over ${fmt(length)} mm. Use a wider die${otherPunch(punchWeaker)}.`,
    );
  } else if (force > limit + 1e-9) {
    // A shortened tool carries the same force on less of it (§3.3): the one that gives way first.
    const punchFirst = rated.load * under.punch <= die.load * under.die;
    const [weaker, load, over, key] = punchFirst
      ? [punchName, rated.load, under.punch, 'punchTrim']
      : [dieName(die), die.load, under.die, 'dieTrim'];
    const shortened = (resolved[key] || 0) > 0;
    const tool = punchFirst ? 'punch' : 'die';
    refuse(
      'tooling-load',
      `This hit needs ${fmt(force)} kN; the ${weaker} is rated ${load} kN/m${half(punchFirst)}, ${fmt(limit)} kN over the ${fmt(over)} mm of it under the bend. ${shortened ? `Make the ${tool} longer (fit it to the bend) or use a wider die` : `Use a wider die${otherPunch(punchFirst)}`}.`,
      shortened ? { label: `Fit the ${tool} to the bend`, session: { [key]: null } } : null,
    );
  }
  // A tool shorter than the shortest section of a sectional set, or over too little of the bend (§3.2, §3.3).
  if (cover)
    for (const [tool, key] of [
      ['punch', 'punchTrim'],
      ['die', 'dieTrim'],
    ]) {
      // The punch is read with a slide too (sheet slide §4); the die only with its own length.
      if (!resolved[key] && !(tool === 'punch' && slid)) continue;
      const own = cover[tool];
      const fitOnly = { label: `Fit the ${tool} to the bend`, session: { [key]: null } };
      // With the sheet slid: centred instead, where the same tool centred has no such finding (§4.4).
      const centredClear = (test) => (slid && tool === 'punch' && !test(centred[tool]) ? centre : null);
      const coverFinding = (c) => c.bare.length > 0 || c.length < MIN_COVERAGE * cover.bend - 1e-9;
      const fit = centredClear(coverFinding) || (resolved[key] ? fitOnly : centre);
      if (own.shortest < SHORTEST_SECTION - 1e-9)
        refuse(
          'tool-short',
          `The ${tool} would be ${fmt(Math.max(0, own.shortest))} mm long: the shortest section is ${SHORTEST_SECTION} mm.`,
          resolved[key] ? fitOnly : centre,
        );
      else if (own.bare.length && members.length > 1)
        // Several pieces in the hit (piece pick §5.4): the way to the one wanted is to pick it.
        refuse(
          'tool-cover',
          `The ${tool} is ${fmt(own.runs.reduce((sum, [a, b]) => sum + (b - a), 0))} mm long and does not reach every piece this hit bends (${cover.pieces} pieces, ${fmt(cover.extent)} mm end to end). Click the piece to bend: it comes under the punch. Or fit the ${tool} to the bend.`,
          fit,
        );
      else if (own.bare.length)
        refuse('tool-cover', `The ${tool} stands over none of the bend: it is not pressed.`, fit);
      else if (own.length < MIN_COVERAGE * cover.bend - 1e-9)
        refuse(
          'tool-cover',
          // One piece (§5.4): it bends whole, so the words say what would let a part of it bend alone.
          `The ${tool} stands over ${fmt(own.length)} mm of the ${fmt(cover.bend)} mm bend: less than half of it is pressed. Make it longer, or fit it to the bend.${cover.pieces === 1 ? ' A piece of sheet bends whole. To bend a part of it alone, cut a relief across the bend line between that part and the rest (Relief, in the sketcher).' : ''}`,
          fit,
        );
      // A punch over a piece this hit leaves flat would bend it too (§5.4); a die under flat sheet presses nothing.
      // Its fix (sheet slide §4.4), only one that works: the smallest slide that takes the punch
      // off every piece left flat while it still covers the whole hit; else, slid, the centred
      // sheet when that is clear; else the punch fitted.
      if (tool === 'punch' && own.overFlat > 1e-6) {
        const off = clearSlide(tooling, press.bed / 2);
        const sheetGoes = (value) => (sign == null ? 'along the bed' : `to the ${endSide(sign, -value)}`);
        const fix =
          off != null
            ? {
                label: slid
                  ? `Slide the sheet to ${fmt(Math.abs(off))} mm ${sign == null ? 'off' : `${endSide(sign, -off)} of`} centre`
                  : `Slide the sheet ${fmt(Math.abs(off))} mm ${sheetGoes(off)}`,
                session: { slide: Math.round(off * lineSign * 1e6) / 1e6 },
              }
            : slid && centred.punch.overFlat <= 1e-6
              ? centre
              : fitOnly;
        refuse(
          'tool-over-flat',
          `The punch stands over ${fmt(own.overFlat)} mm of a piece this hit leaves flat: it would bend that too. Make the punch shorter, or fit it to the bend.`,
          fix,
        );
      }
    }
  // Horn sections stand at both ends of every run (punch library §4.1): a run
  // shorter than two horns and the shortest section between them has no room.
  if (horns) {
    const runs = cover ? cover.punch.runs : strokeTooling(fold, ids, { bed: press.bed }).punch;
    // Per horn (§4.8): 50, 60, 70, 120 mm; "Horn sections" for the standard, "30 mm horn sections" else.
    const least = 2 * horn.reach + SHORTEST_SECTION;
    const shortest = runs.length ? Math.min(...runs.map(([a, b]) => b - a)) : 0;
    const words = hornWords(resolved.horns);
    if (runs.length && shortest < least - 1e-9)
      refuse(
        'horn-short',
        `${words[0].toUpperCase()}${words.slice(1)} need a bend of at least ${least} mm: this one is ${fmt(shortest)} mm.`,
      );
  }
  if (span > press.bed + 1e-9) {
    const bigger = Object.values(MACHINES).find((m) => m.bed >= span);
    refuse(
      'bed',
      `The bend runs ${fmt(span)} mm; the bed of the ${press.name} is ${press.bed} mm. ${bigger ? `Use the ${bigger.name}` : 'No press in the shop is long enough'}.`,
    );
  } else if (slid) {
    // The bend must still stand on the bed where the slide puts it (sheet slide §4): the bed
    // centred on the punch, the bend `slide` along u the other way.
    const bent = tooling.bent.flat();
    const lo = Math.min(...bent.map((r) => r[0])) - resolved.slide,
      hi = Math.max(...bent.map((r) => r[1])) - resolved.slide;
    const halfBed = press.bed / 2;
    const over = Math.max(hi - halfBed, -halfBed - lo);
    if (over > 1e-9) {
      const end = sign == null ? 'one' : `the ${endSide(sign, hi - halfBed >= -halfBed - lo ? 1 : -1)}`;
      refuse('bed', `The bend would stand ${fmt(over)} mm past ${end} end of the bed: slide the sheet back.`, centre);
    }
  }
  const reach = press.backgauge || BACKGAUGE;
  const outOfReach = (L) => L < reach.min - 1e-9 || L > reach.max + 1e-9;
  // A round bend's hits gauge from the first (farthest from the gauge edge) to the last, a pitch nearer each.
  const gauged = bump && gauge?.distance != null ? hitGauges(gauge.distance, resolved.allowance, bump) : null;
  if (gauged) {
    const out = outOfReach(gauged.first)
      ? ['first', gauged.first]
      : outOfReach(gauged.last)
        ? ['last', gauged.last]
        : null;
    if (out)
      refuse(
        'backgauge',
        `The backgauge reaches ${reach.min}–${reach.max} mm from the punch line; the ${out[0]} hit gauges at L ${fmt(out[1])} mm, out of its reach. Gauge from the opposite edge or set the line with two points.`,
      );
  } else if (gauge?.distance != null && outOfReach(gauge.distance))
    refuse(
      'backgauge',
      `The backgauge reaches ${reach.min}–${reach.max} mm from the punch line; L ${fmt(gauge.distance)} mm is out of its reach. Gauge from the opposite edge or set the line with two points.`,
    );
  const warnings = fold.warnings
    .filter((w) => ids.includes(w.bendId) && w.code !== 'short-leg')
    .map((w) => ({ code: w.code, message: w.message.replace(/^Bend \d+/, name) }))
    .filter((w, i, all) => all.findIndex((o) => o.message === w.message) === i);
  // A tool shorter than the bend (§3.3): the fold is the same, the ends are only not pressed.
  if (cover)
    for (const tool of ['punch', 'die']) {
      const own = cover[tool];
      if (!own.runs.length || own.bare.length || own.length >= cover.bend - 0.05) continue;
      const [a, b] = own.short;
      // Per end where the operator's left and right are known (sheet slide §4.4): `a` at the −u end.
      const named = sign != null && Math.abs(a - b) >= 0.05;
      const [more, less] = a >= b ? [a, b] : [b, a];
      const where =
        Math.abs(a - b) < 0.05
          ? a > 0.05
            ? `stops ${fmt(a)} mm short of each end of the bend`
            : 'leaves gaps along the bend'
          : named
            ? `stops ${fmt(more)} mm short of the ${endSide(sign, a >= b ? -1 : 1)} end of the bend${less > 0.05 ? ` and ${fmt(less)} mm short of the ${endSide(sign, a >= b ? 1 : -1)} end` : ''}`
            : `stops ${fmt(Math.max(a, b))} mm short of one end of the bend${Math.min(a, b) > 0.05 ? ` and ${fmt(Math.min(a, b))} mm of the other` : ''}`;
      const tail =
        named && less <= 0.05
          ? 'that end is not pressed and comes out a little open.'
          : 'the ends are not pressed and come out a little open.';
      // Slid, and the same tool centred leaves no such ends: Centre the sheet.
      const unequal = (c) => c.runs.length && !c.bare.length && c.length < cover.bend - 0.05;
      const fix = slid && tool === 'punch' && !unequal(centred.punch) ? centre : null;
      warnings.push({
        code: 'tool-short-ends',
        message: `The ${tool} ${where}: ${tail}`,
        ...(fix ? { fix } : {}),
      });
    }
  // A die much wider than the pitch lets the part already bumped sink into its opening (§5.4).
  if (bump && die.v > 2.5 * bump.pitch + 1e-9) {
    // The other way (§12.4): a radius punch of that radius makes it in one hit.
    const oneHit = radiusPunchFor(resolved.radius);
    const narrower =
      Object.values(DIES)
        .filter((d) => d.angle === die.angle && d.v <= 2 * bump.pitch + 1e-9)
        .sort((a, b) => b.v - a.v)[0] || null;
    warnings.push({
      code: 'bump-die',
      message: `The ${dieName(die)} is ${fmt(die.v)} mm wide and the hits are ${fmt(bump.pitch)} mm apart: the part already bumped sinks into the die. ${narrower ? `Use the ${dieName(narrower)} or fewer hits.` : 'Use fewer hits.'}${oneHit ? ` Or make it in one hit with the ${oneHit.name} punch.` : ''}`,
      ...(narrower ? { fix: { label: `Use the ${dieName(narrower)}`, session: { die: narrower.key } } } : {}),
    });
  }
  if (dieAuto && !auto.fits && !punch.round)
    warnings.push({
      code: 'die-range',
      message: `t ${fmt(t)} mm wants a V ≥ ${fmt(auto.wanted)} mm die; the widest in the catalogue is the ${dieName(auto.die)}, so the radius comes out tighter and the force higher than this sheet should take. Use thinner stock, or choose the die by hand to accept it.`,
    });
  // A die so wide that it forms a rounder bend on its own than the radius punch's nose (§12.4).
  const natural = stock.radiusOfV * die.v;
  if (punch.round && natural > punch.radius + 1e-9) {
    const narrower =
      auto.fits && auto.die.key !== die.key && stock.radiusOfV * auto.die.v <= punch.radius + 1e-9 ? auto.die : null;
    warnings.push({
      code: 'radius-die-wide',
      message: `The ${dieName(die)} forms about R${fmt(natural)} on its own, more than the ${punch.name} punch's R${fmt(punch.radius)}: the bend comes out R${fmt(resolved.radius)}, rounder than the punch.${narrower ? ` Use the ${dieName(narrower)}.` : ''}`,
      ...(narrower ? { fix: { label: `Use the ${dieName(narrower)}`, session: { die: narrower.key } } } : {}),
    });
  }
  return {
    fold,
    bend: resolved,
    punch,
    die,
    dieAuto,
    machine: press,
    // The stroke's bends (one for an ordinary hit).
    members,
    readouts: {
      radius: resolved.radius,
      allowance: resolved.allowance,
      deduction: resolved.deduction,
      legs: resolved.legs,
      flatLegs: resolved.flatLegs,
      // Per member (a stroke of several tabs): their outside legs.
      memberLegs: members.map((m) => m.legs),
      length,
      span,
      tonnage: force,
      capacity: press.force,
      toolingLimit: limit,
      springback: overbend,
      // A round bend's ram depth and bend-to are one hit's.
      bendTo: hitAngle + hitOverbend,
      ramDepth: depth,
      minLeg: needed,
      ...(bump
        ? {
            hits: bump.steps,
            stepAngle: bump.stepAngle,
            pitch: bump.pitch,
            flat: bump.flat,
            gaugeFirst: gauged ? gauged.first : null,
            gaugeLast: gauged ? gauged.last : null,
          }
        : {}),
    },
    refusals,
    warnings,
  };
}

/**
 * A round bend's backgauge readings (round-bend spec §5.3): `L` the centre
 * line's, hit j (bump order) gauges at L + BA/2 − (j − ½)·p. { first, last, at(j) }.
 */
export function hitGauges(L, allowance, { steps, pitch }) {
  const at = (j) => L + allowance / 2 - (j - 0.5) * pitch;
  return { first: at(1), last: at(steps), at };
}

// ---------------------------------------------------------------- the pose in the machine
/**
 * Height of the centre of curvature above the die top when the sheet's outer
 * surface (radius `outer` about it) rests on both shoulders at half-angle φ:
 * the wing tangent to the shoulder circles (three-point contact, the same rule
 * as `ramDepth`), or, when that contact would fall on the arc itself, the arc
 * resting on the shoulder circles.
 */
export function restHeight(outer, dieEntry, phi) {
  const rd = dieEntry.shoulderRadius,
    c = shoulderOffset(dieEntry);
  const line = (outer + rd - c * Math.sin(phi)) / Math.cos(phi) - rd;
  // The arc's end on the outer surface and the shoulder's contact, along the wing.
  const arcEnd = [outer * Math.sin(phi), line - outer * Math.cos(phi)];
  const contact = [c - rd * Math.sin(phi), -rd + rd * Math.cos(phi)];
  if ((contact[0] - arcEnd[0]) * Math.cos(phi) + (contact[1] - arcEnd[1]) * Math.sin(phi) >= -1e-9) return line;
  const reach = outer + rd;
  return reach > c ? -rd + Math.sqrt(reach * reach - c * c) : line;
}

/**
 * Where a posed fold sits in the machine for its bend `bendId`: both wings
 * rise symmetrically about the punch line, the outer surface on both die
 * shoulders, the inside of the bend facing the punch (a `down` bend turns the
 * sheet over), the bend centred on the bed. The side holding `gaugePoint` (a
 * flat-blank point) goes back toward the backgauge; without one, the shorter
 * flat leg does. `turned` puts the other side back (the sheet turned end for end).
 * Returns { matrix (posed part → machine), tipZ (the punch tip on the inside
 * of the bend), centre (Z of the centre of curvature, or null when flat),
 * back: 'fixed' | 'moving', span: [s0, s1] (bend extent along X) }.
 * A round bend (posed with machineFrom) sits by the same rule its mini-bend
 * `hit` (1-based, bump order; absent: the hit the pose is in, which must be
 * passed while that hit is still flat), and the frame adds { hit, hits, s }.
 */
export function brakeFrame(
  posed,
  bendId,
  { die, gaugePoint = null, turned = false, members = null, hit = null, bed = null } = {},
) {
  const bend = posed.bends.find((b) => b.id === bendId);
  if (!bend) throw new Error(`Unknown bend: ${bendId}`);
  const t = posed.thickness;
  const dieEntry = typeof die === 'string' ? dieOf(die) : die || suggestedDie(t).die;
  // A round bend (round-bend spec §5.3): the frame of its mini-bend `hit` (bump
  // order) in the die, by the same rule; absent, the hit the pose is in.
  const minis = bend.steps ? bend.transform.hits : null;
  const mini = minis
    ? minis.find((m) => m.hit === (hit ?? Math.max(1, Math.ceil(bend.posedAngle / (bend.angle / bend.steps) - 1e-9))))
    : null;
  const tr = mini ? mini.transform : bend.transform;
  const F = mini ? multiplyMatrices(bend.fixedMatrix, mini.before) : bend.fixedMatrix;
  // A stroke's bends (§6.1) lie on this bend's flat line: their intervals in its s.
  const strokeBends = (members || [bendId]).map((id) => posed.bends.find((b) => b.id === id)).filter(Boolean);
  const kept = strokeBends.flatMap((m) =>
    m.intervals.map((iv) =>
      iv.map((s) => dot(sub([m.a[0] + m.u[0] * s, m.a[1] + m.u[1] * s], bend.a), bend.u)).sort((p, q) => p - q),
    ),
  );
  const s0 = Math.min(...kept.map((i) => i[0])),
    s1 = Math.max(...kept.map((i) => i[1]));
  const sMid = (s0 + s1) / 2;
  const up = bend.direction === 'up';
  const u = [bend.u[0], bend.u[1], 0];
  // In the fixed side's flat frame: the anchor on the bend, the opening
  // direction (from the outer arc's middle to the centre of curvature).
  let anchor, opening, outer, radius;
  if (tr.origin) {
    anchor = [tr.origin[0] + u[0] * sMid, tr.origin[1] + u[1] * sMid, tr.origin[2]];
    const middle = bendArcPoint(bend, t, tr, sMid, 0.5, up ? 0 : t);
    const toward = [anchor[0] - middle[0], anchor[1] - middle[1], anchor[2] - middle[2]];
    outer = Math.hypot(...toward);
    opening = scale3(toward, 1 / outer);
    radius = tr.radius;
  } else {
    // Flat: the punch line (a round bend's hit line) on the die top.
    const v = mini ? mini.lo + mini.width / 2 : 0;
    anchor = [bend.a[0] + u[0] * sMid + bend.n[0] * v, bend.a[1] + u[1] * sMid + bend.n[1] * v, up ? 0 : t];
    opening = [0, 0, up ? 1 : -1];
  }
  const theta = (tr.angle * Math.PI) / 180;
  const wings = {
    fixed: [-bend.n[0], -bend.n[1], 0],
    moving: [bend.n[0] * Math.cos(theta), bend.n[1] * Math.cos(theta), Math.sin(theta)],
  };
  const back = backSide(bend, { gaugePoint, turned });
  // Into the posed part frame.
  const P = transformPoint(F, anchor);
  const Z = unit3(turn(F, opening));
  let X = unit3(turn(F, u));
  let Y = cross3(Z, X);
  if (dot3(Y, turn(F, wings[back])) < 0) {
    X = scale3(X, -1);
    Y = scale3(Y, -1);
  }
  const height = tr.origin ? restHeight(outer, dieEntry, (Math.abs(theta) || 0) / 2) : 0;
  // Flat s along the bend → machine X (X may run against u).
  const sign = dot3(X, turn(F, u)) >= 0 ? 1 : -1;
  // The sheet slid under the punch (docs/sketch-studio-sheet-slide.md §4): the
  // frame is centred on the punch, not on the bend, so the machine (the punch,
  // its holders, the ram, the bed) stands where it always does and the sheet,
  // with the die under its bend, stands `slide` off: X −sign × slide. 0: as before.
  const shift = bend.slide ? -sign * bend.slide : 0;
  const translation = [-dot3(X, P) + shift, -dot3(Y, P), height - dot3(Z, P)];
  const matrix = [X[0], Y[0], Z[0], 0, X[1], Y[1], Z[1], 0, X[2], Y[2], Z[2], 0, ...translation, 1];
  const toX = ([a, b]) => [sign * (a - sMid), sign * (b - sMid)].sort((p, q) => p - q);
  const fitted = toolingRuns(posed, bend, kept)
    .map(toX)
    .sort((p, q) => p[0] - q[0]);
  // Brake tool length (§3.2): the punch (its holders follow it) and the die
  // each trimmed per end by the stroke's own record, on the bed.
  const half = bed ? bed / 2 : Infinity;
  return {
    matrix,
    tipZ: tr.origin ? height - radius : t,
    centre: tr.origin ? height : null,
    back,
    // Flat s → machine X: +1 along u, −1 against it (sheet slide §3, the one rule for left and right).
    sign,
    // The sheet's move along the bed from centred under the punch (mm, machine X; 0 centred).
    shift,
    span: shift ? [s0 - sMid + shift, s1 - sMid + shift] : [s0 - sMid, s1 - sMid],
    ranges: trimRuns(fitted, bend.punchTrim, half),
    // The die is set up under the bend (sheet slide §3): it goes with the sheet.
    dieRanges: shift
      ? clampRuns(trimRuns(shiftRuns(fitted, shift), bend.dieTrim), half)
      : trimRuns(fitted, bend.dieTrim, half),
    // Horn sections at the ends of the punch's runs (punch library §4.2), only when set.
    // The record's own value (§4.8): true (the standard) or a horn's key.
    ...(hornOf(bend.horns) ? { horns: bend.horns } : {}),
    // A round bend: its hit in the die, and the flat s its section is cut at (sheetSection).
    ...(mini ? { hit: mini.hit, hits: bend.steps, s: sMid } : {}),
  };
}

/**
 * Which side of a bend goes back to the backgauge (the rule brakeFrame poses
 * by): the side holding `gaugePoint` (a flat-blank point), else the shorter
 * flat leg; `turned` puts the other side back. 'fixed' | 'moving'.
 */
export function backSide(bend, { gaugePoint = null, turned = false } = {}) {
  let back;
  if (gaugePoint) back = dot(sub(gaugePoint, bend.a), bend.n) < 0 ? 'fixed' : 'moving';
  else back = bend.flatLegs.fixed <= bend.flatLegs.moving ? 'fixed' : 'moving';
  return turned ? (back === 'fixed' ? 'moving' : 'fixed') : back;
}

/**
 * poseFold's `from` for a stroke in the machine (round-bend spec §5.3): the
 * hits run from the front toward the backgauge, so every round bend of the
 * stroke `bendIds` is filled from the side NOT at the back (the first bend's,
 * as brakeFrame poses it). { bend id → 'fixed' | 'moving' }; {} with no round bend.
 */
export function machineFrom(fold, bendIds, { gaugePoint = null, turned = false } = {}) {
  const ids = bendIds.filter(Boolean);
  const first = fold.bends.find((b) => b.id === ids[0]);
  if (!first) return {};
  const from = backSide(first, { gaugePoint, turned }) === 'fixed' ? 'moving' : 'fixed';
  return Object.fromEntries(ids.filter((id) => fold.bends.find((b) => b.id === id)?.steps).map((id) => [id, from]));
}

/**
 * Where the sectional tooling stands for a stroke (shop floor §6.2): one run
 * per stretch of the bends' intervals (`kept`, flat s along `bend`) on the
 * blank's line; a gap with no material does not break a run, material the
 * line crosses that the stroke leaves flat does. [[s0, s1], …] in order.
 */
export function toolingRuns(posed, bend, kept) {
  return lineMaterial(posed, bend, kept).runs;
}
// The material on a stroke's line (flat s along `bend`), read once for
// toolingRuns' runs and for the stretches the stroke leaves flat (piece pick
// §5.4: the material that breaks a run). { runs, flat }; flat [] with no blank.
function lineMaterial(posed, bend, kept) {
  const ordered = [...kept].sort((p, q) => p[0] - q[0]);
  if (!posed.blank) return { runs: [[ordered[0][0], ordered.at(-1)[1]]], flat: [] };
  const FAR = 1e5;
  const start = [bend.a[0] - bend.u[0] * FAR, bend.a[1] - bend.u[1] * FAR];
  const material = lineSegments(posed.blank, {
    a: start,
    b: [bend.a[0] + bend.u[0] * FAR, bend.a[1] + bend.u[1] * FAR],
  }).map(({ s0, s1 }) => [s0 - FAR, s1 - FAR]);
  const bent = ([m0, m1]) => ordered.some(([k0, k1]) => Math.min(m1, k1) - Math.max(m0, k0) > 1e-6);
  const runs = [],
    flat = [];
  let open = null;
  for (const interval of material) {
    if (bent(interval)) {
      if (open) open[1] = interval[1];
      else runs.push((open = [...interval]));
    } else {
      open = null;
      flat.push([...interval]);
    }
  }
  return { runs: runs.length ? runs : [[ordered[0][0], ordered.at(-1)[1]]], flat };
}

// ---------------------------------------------------------------- the tool's length (brake tool length §3)
// A tool shorter than the bend leaves the ends to the sheet's own stiffness:
// refused when it covers less than this share of the bend (no sourced limit:
// the spec's call, §3.3).
export const MIN_COVERAGE = 0.5;

/**
 * Tooling runs ([[x0, x1], …] in order) with `trim` mm taken off each end of
 * every run (negative: the tool runs past it), each kept within ±`half` (the
 * bed's half length) and runs that meet after lengthening merged. A run
 * trimmed to nothing is left out. No trim: `runs` itself.
 */
export function trimRuns(runs, trim, half = Infinity) {
  if (!trim) return runs;
  const out = [];
  for (const [a, b] of runs) {
    const run = [Math.max(-half, a + trim), Math.min(half, b - trim)];
    if (!(run[1] - run[0] > 1e-9)) continue;
    const last = out.at(-1);
    if (last && run[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], run[1]);
    else out.push(run);
  }
  return out;
}

// Runs moved by `by` mm (sheet slide §4).
const shiftRuns = (runs, by) => runs.map(([a, b]) => [a + by, b + by]);
// Runs kept within [lo, hi] (the bed), one trimmed to nothing left out.
const clampRuns = (runs, half, lo = -half, hi = half) =>
  runs.map(([a, b]) => [Math.max(lo, a), Math.min(hi, b)]).filter(([a, b]) => b - a > 1e-9);

/**
 * Left and right for the operator in front of the machine (docs/sketch-
 * sheet-slide.md §3, the one helper): +X along the bed is the operator's
 * right (X along the bed, Y toward the backgauge, Z up). `sign`: the frame's
 * flat s → machine X (brakeFrame's `sign`, or frameSign); `along`: a
 * direction along the bend's u (> 0 its +u end). 'left' | 'right'.
 */
export const endSide = (sign, along) => (sign * along > 0 ? 'right' : 'left');

/**
 * brakeFrame's `sign` without posing (sheet slide §3): which way machine X
 * runs along a bend's u, from the side that goes to the back (backSide:
 * `gaugePoint`, `turned`) and its direction. The frame's Y points to the back
 * and its Z opens the bend (up: +z), X = Y × Z… so u runs along +X when the
 * moving side goes back on an up bend, or the fixed side on a down one.
 */
export function frameSign(bend, { gaugePoint = null, turned = false } = {}) {
  const back = backSide(bend, { gaugePoint, turned });
  return (bend.direction === 'up') === (back === 'moving') ? 1 : -1;
}

/**
 * Where a tool's ends stand against the bend's (sheet slide §4.4): mm short
 * of each end (positive) or past it (negative), as the operator sees them.
 * `tooling`: strokeTooling; `sign`: frameSign (or the frame's). { left, right }.
 */
export function toolEnds(tooling, sign, tool = 'punch') {
  const bent = tooling.bent.flat();
  const runs = tooling[tool];
  const b0 = Math.min(...bent.map((r) => r[0])),
    b1 = Math.max(...bent.map((r) => r[1]));
  const atMin = runs.length ? Math.min(...runs.map((r) => r[0])) - b0 : b1 - b0,
    atMax = runs.length ? b1 - Math.max(...runs.map((r) => r[1])) : b1 - b0;
  return endSide(sign, -1) === 'left' ? { left: atMin, right: atMax } : { left: atMax, right: atMin };
}

/**
 * The smallest slide (mm along the first bend's u, the punch off the middle of
 * the pieces in the hit) at which the punch stands over no piece the hit
 * leaves flat and still covers every piece it bends (sheet slide §4.4): pure
 * arithmetic on the runs, so exact. `tooling`: strokeTooling; `half`: the
 * bed's half length (the punch runs as set up there). null when none does.
 */
export function clearSlide(tooling, half = Infinity) {
  const runs = trimRuns(tooling.fitted, tooling.punchTrim, half);
  const bent = tooling.bent.flat();
  const flat = tooling.flat || [];
  const works = (slide) => {
    const at = shiftRuns(runs, slide);
    const covered = bent.every(([a, b]) => at.some(([c, d]) => c <= a + 1e-6 && d >= b - 1e-6));
    return covered && overlapLength(at, flat) <= 1e-6;
  };
  const tries = [0];
  for (const [c, d] of runs) {
    for (const [a, b] of bent) tries.push(a - c, b - d);
    for (const [a, b] of flat) tries.push(a - d, b - c);
  }
  const fine = tries.filter(works).sort((p, q) => Math.abs(p) - Math.abs(q));
  return fine.length ? Math.round(fine[0] * 1e6) / 1e6 : null;
}

// Total length of the overlap of two sorted lists of runs.
const overlapLength = (runs, others) =>
  runs.reduce(
    (sum, [a, b]) => sum + others.reduce((s, [c, d]) => s + Math.max(0, Math.min(b, d) - Math.max(a, c)), 0),
    0,
  );

/**
 * Where a stroke's punch and die stand along its line, as brakeFrame sets
 * them up (brake tool length §3.2), from the unposed fold: in flat mm along
 * the first bend, measured from the middle of the stroke. { fitted (the runs
 * fitted to the bend), punch, die (trimmed by the first bend's `punchTrim` /
 * `dieTrim` and kept on a bed `bed` mm long), punchTrim, dieTrim (0 when
 * fitted), bent (each member's intervals: [[s0, s1], …] per member), flat
 * (the material on the line this stroke leaves flat, [[s0, s1], …] in order,
 * piece pick §5.4: what breaks a run) }.
 */
export function strokeTooling(fold, bendIds, { bed = null } = {}) {
  const ids = Array.isArray(bendIds) ? bendIds : [bendIds];
  const members = ids.map((id) => fold.bends.find((b) => b.id === id)).filter(Boolean);
  const bend = members[0];
  const along = (m, s) => dot(sub([m.a[0] + m.u[0] * s, m.a[1] + m.u[1] * s], bend.a), bend.u);
  const kept = members.flatMap((m) => m.intervals.map((iv) => iv.map((s) => along(m, s)).sort((p, q) => p - q)));
  const s0 = Math.min(...kept.map((i) => i[0])),
    s1 = Math.max(...kept.map((i) => i[1]));
  const sMid = (s0 + s1) / 2;
  const material = lineMaterial(fold, bend, kept);
  const fitted = material.runs.map(([a, b]) => [a - sMid, b - sMid]).sort((p, q) => p[0] - q[0]);
  const half = bed ? bed / 2 : Infinity;
  // The sheet slid (sheet slide §4): the punch stands `slide` along u off the
  // middle, its run on the bed (centred on the punch); the die stays under the bend.
  const slide = bend.slide || 0;
  return {
    fitted,
    punch: slide ? shiftRuns(trimRuns(fitted, bend.punchTrim, half), slide) : trimRuns(fitted, bend.punchTrim, half),
    die: slide
      ? clampRuns(trimRuns(fitted, bend.dieTrim), half, slide - half, slide + half)
      : trimRuns(fitted, bend.dieTrim, half),
    punchTrim: bend.punchTrim || 0,
    dieTrim: bend.dieTrim || 0,
    slide,
    // Where s 0 lies on the flat blank (the first bend's line, from the middle): for the card's punch bar.
    line: { a: [bend.a[0] + bend.u[0] * sMid, bend.a[1] + bend.u[1] * sMid], u: bend.u },
    bent: members.map((m) =>
      m.intervals.map((iv) => iv.map((s) => along(m, s) - sMid).sort((p, q) => p - q)).sort((p, q) => p[0] - q[0]),
    ),
    flat: material.flat.map(([a, b]) => [a - sMid, b - sMid]).sort((p, q) => p[0] - q[0]),
  };
}

/**
 * The fitted tooling runs of a punch line before it is folded (brake tool
 * length §9.4, TL-2): `toolingRuns` on the line's own frame (`line.a`, along
 * a → b) with the segments it keeps (lineSegments of `polygon`, less the
 * indexes `skip`), measured from the middle of them as strokeTooling's
 * `fitted` is, so the lengths are the ones the hit has once folded. `fold`:
 * the part's fold (its `blank`, else `polygon`, is the material the runs
 * read). [[x0, x1], …] in order; [] when the line keeps no material.
 */
export function lineTooling(fold, polygon, line, skip = []) {
  if (!line) return [];
  const length = Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]);
  if (!(length > 1e-6)) return [];
  const u = [(line.b[0] - line.a[0]) / length, (line.b[1] - line.a[1]) / length];
  const kept = lineSegments(polygon, line)
    .filter((s) => !skip.includes(s.index))
    .map(({ s0, s1 }) => [s0, s1]);
  if (!kept.length) return [];
  const s0 = Math.min(...kept.map((i) => i[0])),
    s1 = Math.max(...kept.map((i) => i[1]));
  const sMid = (s0 + s1) / 2;
  return toolingRuns({ blank: fold?.blank || polygon }, { a: line.a, u }, kept)
    .map(([a, b]) => [a - sMid, b - sMid])
    .sort((p, q) => p[0] - q[0]);
}

/**
 * A stroke's custom punch and die lengths in words (§3.4), for the sequence
 * list and the job sheet: { punch, die }, each null when fitted to the bend,
 * '380 mm' for one run, '3 sections, 5 mm shorter at each end' for several.
 */
export function toolLengths(fold, bendIds, { bed = null } = {}) {
  const tooling = strokeTooling(fold, bendIds, { bed });
  const words = (runs, trim) => {
    if (!trim) return null;
    if (tooling.fitted.length === 1 && runs.length === 1) return `${Number((runs[0][1] - runs[0][0]).toFixed(1))} mm`;
    return `${runs.length} sections, ${fmt(Math.abs(trim))} mm ${trim > 0 ? 'shorter' : 'longer'} at each end`;
  };
  // A slid punch (docs/sketch-studio-sheet-slide.md §4): "9 mm off centre", no left or right (a
  // stored step does not say which way round the sheet went); a fitted one slid names its length too.
  const fittedLength =
    tooling.fitted.length === 1 && tooling.punch.length === 1
      ? `${Number((tooling.punch[0][1] - tooling.punch[0][0]).toFixed(1))} mm`
      : 'fitted';
  const slid = tooling.slide
    ? `${words(tooling.punch, tooling.punchTrim) || fittedLength}, ${fmt(Math.abs(tooling.slide))} mm off centre`
    : null;
  return { punch: slid || words(tooling.punch, tooling.punchTrim), die: words(tooling.die, tooling.dieTrim) };
}

/**
 * What a trimmed punch or die means for its stroke (§3.2, §3.3): per tool
 * ('punch', 'die') { runs, length (of it under the bend), short: [start,
 * end] (mm of the bend's extent it leaves bare at each end), bare (the tab
 * numbers, 1-based, it stands over nowhere), shortest (its shortest run, or
 * 0 with none), overFlat (mm of it over material the stroke leaves flat, piece
 * pick §5.4) }, `bend` the bend's total length, `pieces` the stretches of
 * material it bends and `extent` their span end to end. `tooling`: strokeTooling.
 */
export function toolingCover(tooling) {
  const bent = tooling.bent.flat().sort((p, q) => p[0] - q[0]);
  const length = bent.reduce((sum, [a, b]) => sum + (b - a), 0);
  const ends = [Math.min(...bent.map((r) => r[0])), Math.max(...bent.map((r) => r[1]))];
  const tool = (runs) => ({
    runs,
    length: overlapLength(runs, bent),
    short: runs.length
      ? [
          Math.max(0, Math.min(...runs.map((r) => r[0])) - ends[0]),
          Math.max(0, ends[1] - Math.max(...runs.map((r) => r[1]))),
        ]
      : [ends[1] - ends[0], ends[1] - ends[0]],
    bare: tooling.bent.flatMap((intervals, k) => (overlapLength(runs, intervals) > 1e-6 ? [] : [k + 1])),
    shortest: runs.length ? Math.min(...runs.map(([a, b]) => b - a)) : 0,
    overFlat: overlapLength(runs, tooling.flat || []),
  });
  return {
    bend: length,
    pieces: bent.length,
    extent: ends[1] - ends[0],
    punch: tool(tooling.punch),
    die: tool(tooling.die),
  };
}

/**
 * A blank with no bend to pose: flat on the die top, its bounding-box centre
 * over the V; `flipped` (brake flip tooling §5.1): turned over about the bed's
 * axis, its other face up.
 */
export function flatFrame(fold, { flipped = false } = {}) {
  const [[x0, y0], [x1, y1]] = polygonBounds(fold.pieces.flatMap((p) => p.outer));
  const m = identityMatrix();
  m[12] = -(x0 + x1) / 2;
  m[13] = -(y0 + y1) / 2;
  if (flipped) {
    // y → −y, z → t − z: half a turn about X, still lying on the die top.
    m[5] = -1;
    m[10] = -1;
    m[13] = (y0 + y1) / 2;
    m[14] = fold.thickness;
  }
  const span = [x0 - (x0 + x1) / 2, (x1 - x0) / 2];
  return { matrix: m, tipZ: fold.thickness, centre: null, back: null, span, ranges: [span] };
}

/** A machine-frame matrix after a posed one: `frame.matrix` · piece matrix. */
export const inMachine = (frame, matrix) => multiplyMatrices(frame.matrix, matrix);

// ---------------------------------------------------------------- the stroke
/**
 * The stroke's three phases in ms at the machine's speeds: approach (the ram
 * from STROKE_GAP above the sheet to contact), bend (down by the ram depth,
 * at least MIN_BEND_MS) and return (back up to the gap). ≈ 1.2 s for 1.5 mm
 * steel in a V10 die.
 */
export function strokeTimeline(machine, depth, gap = STROKE_GAP) {
  const { approach, bend, return: back } = (typeof machine === 'string' ? machineOf(machine) : machine).speeds;
  const phases = {
    approach: (gap / approach) * 1000,
    bend: Math.max(MIN_BEND_MS, (Math.max(0, depth) / bend) * 1000),
    return: ((gap + Math.max(0, depth)) / back) * 1000,
  };
  return { ...phases, total: phases.approach + phases.bend + phases.return, gap };
}

/**
 * Where a stroke is `elapsed` ms in: { phase, angle (the pending bend's posed
 * angle, `from` … target), ram (0 at contact, 1 at the gap; null while bending,
 * when the punch follows the part), done }. `from` (docs/sketch-studio-tight-
 * bends.md §4.4): the angle a bend bent on stands at as the ram comes down.
 */
export function strokeAt(timeline, elapsed, target, from = 0) {
  if (timeline.pair) return pairAt(timeline, elapsed, target);
  if (timeline.steps) return bumpAt(timeline, elapsed, target);
  if (elapsed < timeline.approach)
    return { phase: 'approach', angle: from, ram: 1 - elapsed / timeline.approach, done: false };
  const bent = elapsed - timeline.approach;
  if (bent < timeline.bend) {
    const x = bent / timeline.bend;
    // Smooth start and finish: the ram slows into the bottom of the stroke.
    return { phase: 'bend', angle: from + (target - from) * (x * x * (3 - 2 * x)), ram: null, done: false };
  }
  const back = elapsed - timeline.approach - timeline.bend;
  if (back < timeline.return) return { phase: 'return', angle: target, ram: back / timeline.return, done: false };
  return { phase: 'done', angle: target, ram: 1, done: true };
}

/**
 * A round bend's stroke (round-bend spec §6): `steps` hits in a row, each a
 * stroke of its own (strokeTimeline) whose ram parks only BUMP_GAP above the
 * sheet between hits (the first comes down from, the last goes back up to,
 * STROKE_GAP). { steps, hits: [{ start, approach, bend, return, gap (the
 * approach's), back (the return's) }], total }. ≈ 7.8 s for 13 hits of 1.5 mm
 * steel in a V10 die.
 */
export function bumpTimeline(machine, depth, steps) {
  const hits = [];
  let start = 0;
  for (let j = 1; j <= steps; j++) {
    const gap = j === 1 ? STROKE_GAP : BUMP_GAP,
      back = j === steps ? STROKE_GAP : BUMP_GAP;
    const down = strokeTimeline(machine, depth, gap),
      up = strokeTimeline(machine, depth, back);
    const hit = { start, approach: down.approach, bend: down.bend, return: up.return, gap, back };
    hits.push(hit);
    start += hit.approach + hit.bend + hit.return;
  }
  return { steps, hits, total: start, gap: STROKE_GAP };
}

/**
 * An offset bend's stroke (brake flip tooling §5.3): hit one (`first`, a
 * strokeTimeline), the sheet turned over on the die (`turn` ms, view only),
 * hit two (`second`). { pair: true, first, turn, second, total, gap }.
 */
export function pairTimeline(first, second, turn = TURN_MS) {
  return { pair: true, first, turn, second, total: first.total + turn + second.total, gap: STROKE_GAP };
}

// strokeAt for a pairTimeline: strokeAt of the hit under way plus `part` (0
// the first hit, 1 the second); between them phase 'turn' with `turn` 0 … 1,
// the first bend made and the ram parked.
function pairAt(timeline, elapsed, target) {
  const { first, turn, second } = timeline;
  if (elapsed < first.total) return { ...strokeAt(first, elapsed, target), part: 0 };
  if (elapsed < first.total + turn)
    return { phase: 'turn', angle: target, ram: 1, done: false, part: 0, turn: (elapsed - first.total) / turn };
  return { ...strokeAt(second, elapsed - first.total - turn, target), part: 1 };
}

// strokeAt for a bumpTimeline: the hit (1-based) and its phase; `angle` is the
// round bend's posed angle (hit j bends from (j − 1)·a to j·a); `gap` the
// height the ram comes down from (approach) or goes back up to (return).
function bumpAt(timeline, elapsed, target) {
  const { steps, hits } = timeline;
  const a = target / steps;
  const index = hits.findIndex((h) => elapsed < h.start + h.approach + h.bend + h.return);
  if (index < 0) return { phase: 'done', angle: target, ram: 1, done: true, hit: steps, hits: steps, gap: STROKE_GAP };
  const hit = hits[index],
    j = index + 1;
  const into = elapsed - hit.start;
  if (into < hit.approach)
    return {
      phase: 'approach',
      angle: (j - 1) * a,
      ram: 1 - into / hit.approach,
      done: false,
      hit: j,
      hits: steps,
      gap: hit.gap,
    };
  if (into < hit.approach + hit.bend) {
    const x = (into - hit.approach) / hit.bend;
    return {
      phase: 'bend',
      angle: (j - 1) * a + a * (x * x * (3 - 2 * x)),
      ram: null,
      done: false,
      hit: j,
      hits: steps,
      gap: hit.gap,
    };
  }
  return {
    phase: 'return',
    angle: j * a,
    ram: (into - hit.approach - hit.bend) / hit.return,
    done: false,
    hit: j,
    hits: steps,
    gap: hit.back,
  };
}

// ---------------------------------------------------------------- the side view (SM-2b)
// The NC controller's side view of the hit: the machine's Y–Z plane seen from
// the bed's right end (the backgauge, +Y, to the right; the operator on the
// left), the tooling at true proportion, and the sheet's cross-section through
// the bend in the die. Earlier bends of the part are not drawn: the two wings
// are straight legs as long as the flat runs to the far edge of the pieces
// beside the bend. Long wings are cut at the window with a break mark; the
// tooling keeps its scale.

/** The side view's window height over its width. */
export const SIDE_VIEW_ASPECT = 1.12;
// The share of the window kept clear round a broken wing (its break mark sits inside).
const SIDE_VIEW_INSET = 0.05;
// Arc samples per degree of the bend (at least 4).
const ARC_STEP = 5;

/**
 * The side view's window in machine Y–Z mm, { y0, y1, z0, z1 }: centred on the
 * punch line, wide enough for the punch section and the die body, a little
 * over a third of it below the die top (the die's upper part, its V and
 * shoulders) and the rest above (the parked punch tip, the clamp and, while
 * bending, the ram).
 */
export function sideViewWindow({ punch, die }) {
  const punchEntry = typeof punch === 'string' || punch == null ? punchOf(punch) : punch;
  const dieEntry = typeof die === 'string' ? dieOf(die) : die;
  const reach = Math.max(...punchSection(punchEntry).map(([y]) => Math.abs(y)));
  const half = Math.max(50, reach + 12, dieEntry.width / 2 + 25);
  const height = 2 * half * SIDE_VIEW_ASPECT;
  const z0 = -0.36 * height;
  return { y0: -half, y1: half, z0, z1: z0 + height };
}

// How far a ray from `p` along `d` runs inside the box before it leaves it (0 when it starts outside).
function runInside(p, d, box) {
  let run = Infinity;
  for (const [k, lo, hi] of [
    [0, box.y0, box.y1],
    [1, box.z0, box.z1],
  ]) {
    if (p[k] < lo - 1e-9 || p[k] > hi + 1e-9) return 0;
    if (d[k] > 1e-12) run = Math.min(run, (hi - p[k]) / d[k]);
    else if (d[k] < -1e-12) run = Math.min(run, (lo - p[k]) / d[k]);
  }
  return Math.max(0, run);
}

/**
 * The sheet's cross-section in the side view, for the pose the 3D scene shows:
 * `posed` (poseFold) with the bend `bendId` in the die (null: a blank with no
 * bend, flat on the die) and `frame` its brakeFrame (or flatFrame). The arc
 * is centred on the punch line at the frame's centre height with the posed
 * inner radius; both wings leave it tangentially at half the posed angle, the
 * one on the frame's `back` side toward the backgauge. `window`
 * (sideViewWindow, optional) cuts a wing that runs out of it.
 * Returns { outline (closed ring [y, z], outer surface then inner), wings:
 * { back, front } each { start (mid-surface at the arc end), direction,
 * length (the straight leg), shown (drawn length), broken }, breaks: [{ at,
 * direction, normal, thickness }], angle (posed, degrees), radius (inner, or
 * null while flat), centre ([0, h], or null while flat), thickness }.
 */
export function sheetSection(posed, bendId, frame, window = null) {
  const t = posed.thickness;
  const bend = bendId ? posed.bends.find((b) => b.id === bendId) : null;
  if (bendId && !bend) throw new Error(`Unknown bend: ${bendId}`);
  if (bend?.steps && bend.transform.origin && frame.s != null) return roundSection(posed, bend, frame, window);
  let legs;
  if (bend) {
    const back = frame.back || 'fixed';
    const front = back === 'fixed' ? 'moving' : 'fixed';
    // The bend zone (BA wide in the flat) becomes the arc; the rest of each flat leg stays straight.
    const zone = bend.transform.origin ? bend.allowance / 2 : 0;
    legs = {
      back: Math.max(0, bend.flatLegs[back] - zone),
      front: Math.max(0, bend.flatLegs[front] - zone),
    };
  } else {
    const [[, y0], [, y1]] = polygonBounds(posed.pieces.flatMap((p) => p.outer));
    legs = { back: (y1 - y0) / 2, front: (y1 - y0) / 2 };
  }
  const bent = Boolean(bend?.transform.origin);
  const angle = bent ? bend.posedAngle : 0;
  const phi = (angle * Math.PI) / 360;
  const radius = bent ? bend.transform.radius : null;
  const h = bent ? frame.centre : null;
  const inset = window ? SIDE_VIEW_INSET * (window.y1 - window.y0) : 0;
  const box = window && {
    y0: window.y0 + inset,
    y1: window.y1 - inset,
    z0: window.z0 + inset,
    z1: window.z1 - inset,
  };
  // One wing: its ends on the outer and inner surfaces where it leaves the arc, its direction.
  const wing = (side) => {
    const sign = side === 'back' ? 1 : -1;
    const direction = [sign * Math.cos(phi), Math.sin(phi)];
    const at = (rho) => (bent ? [sign * rho * Math.sin(phi), h - rho * Math.cos(phi)] : [0, rho]);
    // Flat: the outer surface is the die top (z 0), the inner one z = t.
    const outer = bent ? at(radius + t) : [0, 0],
      inner = bent ? at(radius) : [0, t];
    const length = legs[side];
    const room = box ? Math.min(runInside(outer, direction, box), runInside(inner, direction, box)) : Infinity;
    const shown = Math.min(length, room);
    const start = [(outer[0] + inner[0]) / 2, (outer[1] + inner[1]) / 2];
    return { side, outer, inner, direction, length, shown, broken: shown < length - 1e-9, start };
  };
  const back = wing('back'),
    front = wing('front');
  const reach = (p, w, s) => [p[0] + w.direction[0] * s, p[1] + w.direction[1] * s];
  // The arc from the front wing round the bottom to the back one, on radius rho.
  const arc = (rho) => {
    if (!bent) return [];
    const steps = Math.max(4, Math.ceil(angle / ARC_STEP));
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 - phi + (2 * phi * i) / steps;
      points.push([rho * Math.cos(a), h + rho * Math.sin(a)]);
    }
    return points;
  };
  const outline = [
    reach(front.outer, front, front.shown),
    ...(bent ? arc(radius + t) : [front.outer]),
    reach(back.outer, back, back.shown),
    reach(back.inner, back, back.shown),
    ...(bent ? arc(radius).reverse() : [back.inner]),
    reach(front.inner, front, front.shown),
  ];
  const breaks = [back, front]
    .filter((w) => w.broken)
    .map((w) => ({
      at: reach(w.start, w, w.shown),
      direction: w.direction,
      // Across the sheet, from the outer surface to the inner one.
      normal: [-w.direction[1] * (w.side === 'back' ? 1 : -1), w.direction[0] * (w.side === 'back' ? 1 : -1)],
      thickness: t,
    }));
  const strip = ({ side, start, direction, length, shown, broken }) => ({
    side,
    start,
    direction,
    length,
    shown,
    broken,
  });
  return {
    outline,
    wings: { back: strip(back), front: strip(front) },
    breaks,
    angle,
    radius,
    centre: bent ? [0, h] : null,
    thickness: t,
  };
}

// A round bend part-way or made (round-bend spec §6): the true posed section
// through its zone at the frame's s — the curve already formed, the hit in
// the die, the flat still to come — sampled on every hit boundary, and the
// two straight wings leaving the zone's ends tangentially, each as long as
// its flat leg beyond the zone. Same result shape as sheetSection.
function roundSection(posed, bend, frame, window) {
  const t = posed.thickness;
  const up = bend.direction === 'up';
  const F = bend.fixedMatrix,
    tr = bend.transform;
  const toYZ = (p) => {
    const m = transformPoint(frame.matrix, transformPoint(F, p));
    return [m[1], m[2]];
  };
  const dirYZ = (d) => {
    const m = turn(frame.matrix, turn(F, d));
    const length = Math.hypot(m[1], m[2]) || 1;
    return [m[1] / length, m[2] / length];
  };
  const samples = zoneSamples(bend, 48);
  const surface = (z) =>
    Array.from({ length: samples + 1 }, (_, i) => toYZ(bendArcPoint(bend, t, tr, frame.s, i / samples, z)));
  const outer = surface(up ? 0 : t),
    inner = surface(up ? t : 0);
  // Outward along each wing: the fixed side's −n, the moving side's n carried through the bend.
  const outward = {
    fixed: dirYZ([-bend.n[0], -bend.n[1], 0]),
    moving: dirYZ(turn(tr.matrix, [bend.n[0], bend.n[1], 0])),
  };
  const end = { fixed: 0, moving: samples };
  const inset = window ? SIDE_VIEW_INSET * (window.y1 - window.y0) : 0;
  const box = window && {
    y0: window.y0 + inset,
    y1: window.y1 - inset,
    z0: window.z0 + inset,
    z1: window.z1 - inset,
  };
  const back = frame.back || 'fixed',
    front = back === 'fixed' ? 'moving' : 'fixed';
  const wing = (key, side) => {
    const o = outer[end[side]],
      n = inner[end[side]],
      direction = outward[side];
    const length = Math.max(0, bend.flatLegs[side] - bend.allowance / 2);
    const room = box ? Math.min(runInside(o, direction, box), runInside(n, direction, box)) : Infinity;
    const shown = Math.min(length, room);
    const across = [n[0] - o[0], n[1] - o[1]];
    const size = Math.hypot(...across) || 1;
    return {
      side: key,
      outer: o,
      inner: n,
      direction,
      length,
      shown,
      broken: shown < length - 1e-9,
      start: [(o[0] + n[0]) / 2, (o[1] + n[1]) / 2],
      normal: [across[0] / size, across[1] / size],
    };
  };
  const wings = { back: wing('back', back), front: wing('front', front) };
  const reach = (p, w, s) => [p[0] + w.direction[0] * s, p[1] + w.direction[1] * s];
  // Front end to back end along the zone.
  const ordered = (ring) => (front === 'fixed' ? ring : [...ring].reverse());
  const outline = [
    reach(wings.front.outer, wings.front, wings.front.shown),
    ...ordered(outer),
    reach(wings.back.outer, wings.back, wings.back.shown),
    reach(wings.back.inner, wings.back, wings.back.shown),
    ...ordered(inner).reverse(),
    reach(wings.front.inner, wings.front, wings.front.shown),
  ];
  const strip = ({ side, start, direction, length, shown, broken }) => ({
    side,
    start,
    direction,
    length,
    shown,
    broken,
  });
  return {
    outline,
    wings: { back: strip(wings.back), front: strip(wings.front) },
    breaks: [wings.back, wings.front]
      .filter((w) => w.broken)
      .map((w) => ({ at: reach(w.start, w, w.shown), direction: w.direction, normal: w.normal, thickness: t })),
    angle: bend.posedAngle,
    radius: bend.radius,
    centre: frame.centre != null ? [0, frame.centre] : null,
    thickness: t,
  };
}

/**
 * The part beyond a cut wing is off the card: drop the side view's context
 * segments ([[y, z], [y, z]], brakeCollisions.js partSection) that lie past any
 * of `breaks` (sheetSection) along its wing, so nothing floats past a break mark.
 */
export function trimAtBreaks(segments, breaks) {
  if (!breaks.length) return segments;
  const past = (p, { at, direction }) => (p[0] - at[0]) * direction[0] + (p[1] - at[1]) * direction[1] > 1e-9;
  return segments.filter(([a, b]) => !breaks.some((mark) => past(a, mark) && past(b, mark)));
}
