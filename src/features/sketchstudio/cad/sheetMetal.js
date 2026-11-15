// Sheet-metal fold maths (docs/sketch-studio-fab-shop.md §5). The flat blank
// is the source of truth; a bend is a punch line across it; the folded part is
// derived by folding the blank forward. Pure: no three, no DOM, no WASM. The
// kernel (worker), the panels and the viewport preview all fold through here.
//
// Frames (§5.1): blank in XY, material z ∈ [0, t]. For a bend a → b:
// u = (b − a)/|b − a|, n = (−u.y, u.x), u × n = +Z; s = (p − a)·u, v = (p − a)·n.
// After `foldSheet` every bend is oriented so its fixed side (nearer the root
// piece) is v < 0.
//
// Matrices are 4 × 4, column-major (three.js `Matrix4.elements` order), and
// map flat part coordinates to folded part coordinates.
import polygonClipping from 'polygon-clipping';
import { numeric } from './model.js';
import { arcGeometry } from './sketchProfile.js';
import {
  DEFAULT_PUNCH,
  PUNCHES,
  airBendRadius,
  defaultDie,
  dieOf,
  distortionDistance,
  kFactorFor,
  minLeg,
  punchOf,
  radiusPunchFor,
  stockOf,
} from './shopCatalog.js';

export const CHORD_ERROR = 0.05;
export const BEND_DIRECTIONS = Object.freeze(['up', 'down']);
export const BLANK_EDGES = Object.freeze(['left', 'right', 'front', 'rear']);
// The strip box overshoots the material by this much at each interval end,
// and a join probe sits this far outside each strip edge (§5.3, §6).
const STRIP_OVERSHOOT = 0.01;
const PROBE = 0.01;
const SQUARE_TOLERANCE = 1e-4;

const fmt = (value) => Number(value.toFixed(2)).toString();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const along = (a, u, s, n, v) => [a[0] + u[0] * s + n[0] * v, a[1] + u[1] * s + n[1] * v];

// ---------------------------------------------------------------- matrices
export const identityMatrix = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function multiplyMatrices(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  return out;
}
export const transformPoint = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
const translationMatrix = ([x, y, z]) => {
  const m = identityMatrix();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
};
// Right-handed turn by `angle` radians about the line through `origin` along unit `axis`.
function rotationMatrix(origin, axis, angle) {
  const [x, y, z] = axis,
    c = Math.cos(angle),
    s = Math.sin(angle),
    k = 1 - c;
  const r = [
    c + x * x * k,
    y * x * k + z * s,
    z * x * k - y * s,
    0,
    x * y * k - z * s,
    c + y * y * k,
    z * y * k + x * s,
    0,
    x * z * k + y * s,
    y * z * k - x * s,
    c + z * z * k,
    0,
    0,
    0,
    0,
    1,
  ];
  return multiplyMatrices(translationMatrix(origin), multiplyMatrices(r, translationMatrix(origin.map((v) => -v))));
}

// ---------------------------------------------------------------- polygons
const ringArea = (ring) => {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return sum / 2;
};
const ringCentroid = (ring) => {
  let cx = 0,
    cy = 0,
    a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
    a += f;
  }
  return a ? [cx / (3 * a), cy / (3 * a)] : ring[0];
};
const ringLength = (ring) => ring.reduce((sum, p, i) => sum + Math.hypot(...sub(ring[(i + 1) % ring.length], p)), 0);
export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inMaterial = (point, outer, holes) => pointInRing(point, outer) && !holes.some((h) => pointInRing(point, h));
const orient = (ring, ccw) => (ringArea(ring) > 0 === ccw ? ring : [...ring].reverse());
// polygon-clipping rings close on their first point; ours do not.
const openRing = (ring) =>
  ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
const closedRing = (ring) => [...ring, ring[0]];
const polygonArea = (outer, holes) => Math.abs(ringArea(outer)) - holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0);
function polygonCentroid(outer, holes) {
  const parts = [[outer, Math.abs(ringArea(outer))], ...holes.map((h) => [h, -Math.abs(ringArea(h))])];
  const total = parts.reduce((s, [, a]) => s + a, 0);
  const c = parts.reduce(
    (acc, [ring, a]) => {
      const [x, y] = ringCentroid(ring);
      return [acc[0] + x * a, acc[1] + y * a];
    },
    [0, 0],
  );
  return [c[0] / total, c[1] / total];
}

// Segments per arc for a chord error ≤ CHORD_ERROR at radius R over `sweep` radians.
const arcSteps = (radius, sweep) => {
  const half = Math.acos(Math.max(-1, Math.min(1, 1 - CHORD_ERROR / radius)));
  return Math.max(2, Math.ceil(Math.abs(sweep) / (2 * Math.max(half, 1e-3))));
};

// One closed loop of a kernel profile as a polyline (no repeated end point).
function loopPolygon(profile, n) {
  const point = (p) => {
    if (!Array.isArray(p) || p.length !== 2) throw new Error('Expected a 2D point.');
    return [n(p[0]), n(p[1])];
  };
  if (profile.type === 'rectangle') {
    const w = n(profile.width),
      h = n(profile.height),
      [x, y] = point(profile.origin || [0, 0]);
    if (!(w > 0 && h > 0)) throw new Error('The blank rectangle needs a positive width and height.');
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  }
  if (profile.type === 'circle') {
    const r = n(profile.radius),
      [cx, cy] = point(profile.center || [0, 0]);
    if (!(r > 0)) throw new Error('A circle needs a positive radius.');
    const steps = Math.max(12, arcSteps(r, Math.PI * 2));
    return Array.from({ length: steps }, (_, i) => [
      cx + r * Math.cos((i / steps) * Math.PI * 2),
      cy + r * Math.sin((i / steps) * Math.PI * 2),
    ]);
  }
  if (profile.type === 'polygon') {
    if (!(profile.points?.length >= 3)) throw new Error('A polygon needs at least three vertices.');
    return profile.points.map(point);
  }
  if (profile.type === 'path') {
    if (profile.closed === false) throw new Error('A sheet-metal blank needs a closed outline.');
    const ring = [point(profile.start)];
    for (const segment of profile.segments || []) {
      if (segment.construction) continue;
      const from = ring.at(-1),
        end = point(segment.end);
      if (segment.type === 'line') ring.push(end);
      else if (segment.type === 'arc') {
        const mid = point(segment.mid);
        const arc = arcGeometry(from, mid, end);
        if (!arc) ring.push(end);
        else {
          const steps = arcSteps(arc.radius, arc.sweep);
          for (let i = 1; i < steps; i++) {
            const t = arc.start + (arc.sweep * i) / steps;
            ring.push([arc.center[0] + arc.radius * Math.cos(t), arc.center[1] + arc.radius * Math.sin(t)]);
          }
          ring.push(end);
        }
      } else if (segment.type === 'spline') {
        const c1 = point(segment.control1),
          c2 = point(segment.control2);
        const hull = Math.hypot(...sub(c1, from)) + Math.hypot(...sub(c2, c1)) + Math.hypot(...sub(end, c2));
        const steps = Math.min(256, Math.max(8, Math.ceil(Math.sqrt(hull / CHORD_ERROR))));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps,
            m = 1 - t;
          ring.push(
            [0, 1].map((k) => m * m * m * from[k] + 3 * m * m * t * c1[k] + 3 * m * t * t * c2[k] + t * t * t * end[k]),
          );
        }
      } else throw new Error(`Unsupported sketch segment: ${segment.type}`);
    }
    // A closed path ends on its start.
    if (ring.length > 1 && Math.hypot(...sub(ring.at(-1), ring[0])) < 1e-9) ring.pop();
    if (ring.length < 3) throw new Error('The blank outline needs at least three corners.');
    return ring;
  }
  throw new Error(`Unsupported profile: ${profile.type}`);
}

/**
 * The flat blank as polylines: `{ outer, holes }`, outer counter-clockwise,
 * holes clockwise; arcs, circles and splines sampled to ≤ 0.05 mm chord error.
 * One outer loop only; an offset profile is refused.
 */
export function profilePolygon(profile, params = {}) {
  if (!profile || typeof profile.type !== 'string') throw new Error('Choose a closed blank profile first.');
  if (profile.offset) throw new Error('A sheet-metal blank cannot use an offset profile; draw the outline itself.');
  const n = (value) => numeric(value, params);
  const outer = orient(loopPolygon(profile, n), true);
  if (!(Math.abs(ringArea(outer)) > 1e-9)) throw new Error('The blank outline encloses no area.');
  const holes = (profile.holes || []).map((hole) => {
    if (hole.offset || hole.holes?.length) throw new Error('A cut-out must be a single closed outline.');
    const ring = orient(loopPolygon(hole, n), false);
    if (!ring.every((p) => pointInRing(p, outer))) throw new Error('A cut-out runs outside the blank.');
    return ring;
  });
  return { outer, holes };
}

export function polygonBounds(ring) {
  const xs = ring.map((p) => p[0]),
    ys = ring.map((p) => p[1]);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}

// The laser path of one loop: exact for lines, arcs and circles; splines sampled.
function loopLength(profile, n) {
  if (profile.type === 'rectangle') return 2 * (n(profile.width) + n(profile.height));
  if (profile.type === 'circle') return 2 * Math.PI * n(profile.radius);
  if (profile.type === 'path') {
    let from = profile.start.map(n),
      total = 0;
    for (const segment of profile.segments || []) {
      if (segment.construction) continue;
      const end = segment.end.map(n);
      const arc = segment.type === 'arc' ? arcGeometry(from, segment.mid.map(n), end) : null;
      if (arc) total += arc.radius * Math.abs(arc.sweep);
      else if (segment.type === 'spline') {
        const c1 = segment.control1.map(n),
          c2 = segment.control2.map(n);
        let previous = from;
        for (let i = 1; i <= 256; i++) {
          const s = i / 256,
            m = 1 - s;
          const p = [0, 1].map(
            (k) => m * m * m * from[k] + 3 * m * m * s * c1[k] + 3 * m * s * s * c2[k] + s * s * s * end[k],
          );
          total += Math.hypot(...sub(p, previous));
          previous = p;
        }
      } else total += Math.hypot(...sub(end, from));
      from = end;
    }
    return total;
  }
  return ringLength(loopPolygon(profile, n));
}

/**
 * Blank readouts: bounding size, area, cut length (every loop; exact when the
 * `profile` is given) and pierces (one per loop).
 */
export function flatSummary({ outer, holes }, profile = null, params = {}) {
  const bounds = polygonBounds(outer);
  const n = (value) => numeric(value, params);
  return {
    width: bounds[1][0] - bounds[0][0],
    height: bounds[1][1] - bounds[0][1],
    bounds,
    area: polygonArea(outer, holes),
    cutLength: profile
      ? [profile, ...(profile.holes || [])].reduce((sum, loop) => sum + loopLength(loop, n), 0)
      : [outer, ...holes].reduce((sum, ring) => sum + ringLength(ring), 0),
    pierces: 1 + holes.length,
  };
}

// ---------------------------------------------------------------- per-bend numbers
/**
 * §5.2 for one bend: inside radius (override or air-bend rule with the
 * bend's or the default tooling), K (override or table), allowance, setback
 * and deduction. `angle` in degrees.
 */
export function bendNumbers({ thickness, stock, angle, radius = null, kFactor = null, punch = null, die = null }) {
  const t = thickness,
    entry = typeof stock === 'string' ? stockOf(stock) : stock;
  const punchEntry = punchOf(punch || DEFAULT_PUNCH),
    dieEntry = die ? dieOf(die) : defaultDie(t, punchEntry);
  let r,
    sharp = false;
  if (radius != null) {
    r = radius;
    if (!(r > 0)) throw new Error('The inside radius must be greater than zero.');
  } else ({ radius: r, sharp } = airBendRadius(entry, t, punchEntry, dieEntry));
  const k = kFactor != null ? kFactor : kFactorFor(r, t, entry.hardness);
  if (!(k >= 0 && k <= 1)) throw new Error('The K-factor must be between 0 and 1.');
  const theta = (angle * Math.PI) / 180;
  const allowance = theta * (r + k * t);
  const setback = angle <= 90 ? (r + t) * Math.tan(theta / 2) : r + t;
  return {
    radius: r,
    kFactor: k,
    allowance,
    setback,
    deduction: 2 * setback - allowance,
    sharp,
    punch: punchEntry.key,
    die: dieEntry.key,
  };
}
/** Outside leg from the flat distance d of that side: leg = d − BA/2 + OSSB. */
export const legFromDistance = (d, { allowance, setback }) => d - allowance / 2 + setback;
/** Inverse: the flat distance for a wanted outside leg, d = leg − OSSB + BA/2. */
export const distanceFromLeg = (leg, { allowance, setback }) => leg - setback + allowance / 2;

/** "UP 90° R1.6": what the flat pattern says at a bend line; a round bend "UP 90° R40 · 13 hits". */
export const bendLabel = (bend) =>
  `${bend.direction.toUpperCase()} ${fmt(bend.angle)}° R${fmt(bend.radius)}${bend.steps ? ` · ${bend.steps} hits` : ''}`;

// ---------------------------------------------------------------- round bends (docs/sketch-studio-round-bend.md)
// A bend with `steps` (an integer ≥ 2) is a round bend: its `radius` is the
// finished inside radius and the press brake makes it in `steps` hits across
// its zone (bump bending). The zone and its numbers are any bend's.
export const MAX_HITS = 200;
// Hits closer than this are refused (§5.1, the spec's own choice).
export const MIN_PITCH = 1;

/**
 * The automatic hit count (§5.1): the pitch is half the die opening, the die
 * the sheet uses anyway (`die`: a key, or the default for `thickness`):
 * N = max(2, ⌈BA / (V / 2)⌉).
 */
export function autoHits({ allowance, die = null, thickness }) {
  const v = (die ? dieOf(die) : defaultDie(thickness)).v;
  return Math.max(2, Math.ceil(allowance / (v / 2) - 1e-9));
}

/**
 * A round bend's hits (§5.1) from a resolved bend ({ angle, allowance,
 * radius, steps }): { steps, stepAngle (degrees per hit), pitch (flat mm
 * between hits), flat (how far a flat between two hits stands off the true
 * curve on the outside face), lines (the hit lines' v across the bend line,
 * −BA/2 + (j − ½)·p) }; null for an ordinary bend.
 */
export function bumpHits(bend, thickness) {
  if (!bend?.steps) return null;
  const steps = bend.steps;
  const stepAngle = bend.angle / steps,
    pitch = bend.allowance / steps;
  return {
    steps,
    stepAngle,
    pitch,
    flat: (bend.radius + thickness) * (1 - Math.cos((stepAngle * Math.PI) / 360)),
    lines: Array.from({ length: steps }, (_, j) => -bend.allowance / 2 + (j + 0.5) * pitch),
  };
}

/**
 * Is a bend round (round-bend spec §12.5)? Either way of making one: bump hits
 * (`steps`) or one hit of a radius punch (its `punch` is `round`). The zone
 * displays and rules key on this; the bump-only logic (the pose, the hit walk,
 * the hit count) stays on `steps`.
 */
export const isRoundBend = (bend) => Boolean(bend?.steps) || Boolean(PUNCHES[bend?.punch]?.round);

/**
 * A round bend's two tangent lines on the flat (§7: where its zone starts and
 * ends), over the same intervals as its centre line: [[s0, s1, v]] with v =
 * −BA/2 then +BA/2 across the bend's own n; [] for an ordinary bend.
 */
export const roundTangents = (bend) =>
  isRoundBend(bend)
    ? [-bend.allowance / 2, bend.allowance / 2].flatMap((v) => bend.intervals.map(([s0, s1]) => [s0, s1, v]))
    : [];

/** Samples across a zone: `base`, or for a round bend the next multiple of its hits (a sample on every hit boundary). */
export const zoneSamples = (bend, base) => (bend?.steps ? bend.steps * Math.ceil(base / bend.steps) : base);

/**
 * A punch line parallel to one edge of the blank's bounding box ('left' =
 * min x, 'right' = max x, 'front' = min y, 'rear' = max y), `distance` in from
 * it, running edge to edge.
 */
export function bendLineFromEdge(outer, edge, distance) {
  const [[x0, y0], [x1, y1]] = polygonBounds(outer);
  if (edge === 'left') return { a: [x0 + distance, y0], b: [x0 + distance, y1] };
  if (edge === 'right') return { a: [x1 - distance, y1], b: [x1 - distance, y0] };
  if (edge === 'front') return { a: [x1, y0 + distance], b: [x0, y0 + distance] };
  if (edge === 'rear') return { a: [x0, y1 - distance], b: [x1, y1 - distance] };
  throw new Error(`Unknown blank edge: ${edge}`);
}

// ---------------------------------------------------------------- topology
// Where the infinite line a + s·u crosses the material: [{ s0, s1, ends }],
// `ends` the unit directions of the outline edges at each end.
function lineIntervals(outer, holes, a, u, n) {
  const hits = [];
  for (const ring of [outer, ...holes])
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i],
        q = ring[(i + 1) % ring.length];
      const vp = dot(sub(p, a), n),
        vq = dot(sub(q, a), n);
      if ((vp > 0 && vq > 0) || (vp < 0 && vq < 0) || (vp === 0 && vq === 0)) continue;
      const f = vp / (vp - vq);
      const x = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
      const length = Math.hypot(...sub(q, p));
      hits.push({ s: dot(sub(x, a), u), dir: [(q[0] - p[0]) / length, (q[1] - p[1]) / length] });
    }
  hits.sort((x, y) => x.s - y.s);
  const stops = [];
  for (const hit of hits) {
    if (stops.length && hit.s - stops.at(-1).s < 1e-7) stops.at(-1).dirs.push(hit.dir);
    else stops.push({ s: hit.s, dirs: [hit.dir] });
  }
  const intervals = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const s0 = stops[i].s,
      s1 = stops[i + 1].s;
    if (s1 - s0 < 1e-7 || !inMaterial(along(a, u, (s0 + s1) / 2, n, 0), outer, holes)) continue;
    const last = intervals.at(-1);
    if (last && Math.abs(last.s1 - s0) < 1e-7) {
      last.s1 = s1;
      last.ends[1] = stops[i + 1].dirs;
    } else intervals.push({ s0, s1, ends: [stops[i].dirs, stops[i + 1].dirs] });
  }
  return intervals;
}

const stripRing = (bend, [s0, s1], h) => [
  along(bend.a, bend.u, s0 - STRIP_OVERSHOOT, bend.n, -h),
  along(bend.a, bend.u, s1 + STRIP_OVERSHOOT, bend.n, -h),
  along(bend.a, bend.u, s1 + STRIP_OVERSHOOT, bend.n, h),
  along(bend.a, bend.u, s0 - STRIP_OVERSHOOT, bend.n, h),
];
const multiArea = (multi) =>
  multi.reduce((sum, polygon) => sum + polygonArea(openRing(polygon[0]), polygon.slice(1).map(openRing)), 0);

// ---------------------------------------------------------------- bend on (docs/sketch-studio-tight-bends.md §4)
// `feature.bends` is the sequence, in the order made. An entry with `again`
// (§4.1) is no bend of its own: "hit bend `again` again, on to `angle`" (the
// angle after this hit), with its own punch, die, lengths and stroke; the
// line, direction and radius are the bend's. The fold keeps one bend per
// line at its FINAL angle (§4.2); the order made is hitSequence below.

/** A bend-on entry of `feature.bends` (§4.1). */
export const isBendOn = (record) => record?.again != null && record.again !== '';
/** The entries of `feature.bends` that are bends (one line each): every one but the bend-on hits. */
export const madeBends = (records = []) => records.filter((record) => !isBendOn(record));

// The bend-on entries checked in the order made (§4.1), refused in shop words:
// each names an ordinary bend made before it (the bend named by its place
// among the bends, as the fold names it; the step by its place in the
// sequence, as the brake numbers its rows), not round, and takes it further,
// at most to 180°. Returns bend id → its later hits [{ id, index (its place in
// `feature.bends`), angle, punch, die, punchTrim?, dieTrim?, stroke? }].
function bendOnHits(records, params, thickness) {
  const n = (value, label) => numeric(value, params, label);
  const steps = bendStrokes(records);
  const stepAt = (i) => steps.findIndex((s) => i >= s.start && i <= s.end) + 1;
  const made = new Map();
  const later = new Map();
  let count = 0;
  records.forEach((record, i) => {
    if (!isBendOn(record)) {
      count += 1;
      let angle = NaN;
      try {
        angle = n(record?.angle, `Bend ${count} angle`);
      } catch {
        // resolveBends words a bend's own angle.
      }
      const round = !(record?.steps == null || record.steps === '') || Boolean(PUNCHES[record?.punch]?.round);
      if (record?.id && !made.has(record.id)) made.set(record.id, { number: count, angle, round });
      return;
    }
    const step = stepAt(i);
    if (!record.id) throw new Error(`Step ${step} has no id.`);
    const stroke = steps[step - 1];
    const together = records.slice(stroke.start, stroke.end + 1);
    if (together.some((r) => !isBendOn(r)))
      throw new Error(`Step ${step} makes new bends and bends made ones on in one hit: make them as separate hits.`);
    const bend = made.get(record.again);
    if (!bend)
      throw new Error(
        records.slice(i + 1).some((r) => r?.id === record.again && !isBendOn(r))
          ? `Step ${step} bends a bend on before it is made: a bend is made first, then bent on.`
          : `Step ${step} bends on a bend that is not on this part.`,
      );
    const name = `Bend ${bend.number}`;
    if (together.filter((r) => r.again === record.again).length > 1)
      throw new Error(`Step ${step} bends ${name.toLowerCase()} on twice in one hit.`);
    if (bend.round) throw new Error(`Step ${step}: a round bend is made in its own hits: it cannot be bent on.`);
    if (PUNCHES[record.punch]?.round)
      throw new Error(`Step ${step}: a radius punch makes a round bend: a bend is bent on with a straight punch.`);
    const angle = n(record.angle, `Step ${step} angle`);
    const hits = later.get(record.again) || [];
    const now = hits.length ? hits.at(-1).angle : bend.angle;
    if (Number.isFinite(now) && !(angle > now + 1e-9))
      throw new Error(`${name} is already at ${fmt(now)}°: a hit only bends it further.`);
    if (!(angle <= 180)) throw new Error(`Step ${step}: a bend goes at most to 180°.`);
    const punchEntry = punchOf(record.punch || DEFAULT_PUNCH);
    const trims = {};
    for (const [key, label] of [
      ['punchTrim', 'punch length'],
      ['dieTrim', 'die length'],
    ])
      if (!(record[key] == null || record[key] === '')) trims[key] = n(record[key], `Step ${step} ${label}`);
    hits.push({
      id: record.id,
      index: i,
      angle,
      punch: punchEntry.key,
      die: record.die ? dieOf(record.die).key : defaultDie(thickness, punchEntry).key,
      ...trims,
      ...(record.stroke ? { stroke: String(record.stroke) } : {}),
    });
    later.set(record.again, hits);
  });
  return later;
}

// Resolve every bend's numbers and line, before topology. A bend that is bent
// on (§4.2) resolves at its final angle with its last hit's punch, die and
// lengths; `hits` lists every hit that makes it, the first its own record.
function resolveBends(feature, params, thickness, stock) {
  const n = (value, label) => numeric(value, params, label);
  const records = feature.bends || [];
  const onward = records.some(isBendOn) ? bendOnHits(records, params, thickness) : null;
  const plain = [];
  records.forEach((record, at) => {
    if (!isBendOn(record)) plain.push([record, at]);
  });
  return plain.map(([record, at], index) => {
    const name = `Bend ${index + 1}`;
    if (!record?.id) throw new Error(`${name} has no id.`);
    const first = n(record.angle, `${name} angle`);
    if (!(first > 0 && first <= 180)) throw new Error(`${name}: the angle must be more than 0° and at most 180°.`);
    const later = onward?.get(record.id) || [];
    const last = later.at(-1) || null;
    // The bend as its last hit leaves it (§4.2): every number below is that hit's.
    const bend = last
      ? (({ punchTrim: _p, dieTrim: _d, ...own }) => ({
          ...own,
          punch: last.punch,
          die: last.die,
          ...(last.punchTrim != null ? { punchTrim: last.punchTrim } : {}),
          ...(last.dieTrim != null ? { dieTrim: last.dieTrim } : {}),
        }))(record)
      : record;
    const angle = last ? last.angle : first;
    if (!BEND_DIRECTIONS.includes(bend.direction)) throw new Error(`${name}: choose Up or Down.`);
    const point = (p, label) => {
      if (!Array.isArray(p) || p.length !== 2) throw new Error(`${name}: the punch line needs two points.`);
      return [n(p[0], `${name} ${label}`), n(p[1], `${name} ${label}`)];
    };
    const a = point(bend.a, 'start'),
      b = point(bend.b, 'end');
    const length = Math.hypot(...sub(b, a));
    if (!(length > 1e-6)) throw new Error(`${name}: the punch line needs two different points.`);
    const override = !(bend.radius == null || bend.radius === '');
    const numbers = bendNumbers({
      thickness,
      stock,
      angle,
      radius: override ? n(bend.radius, `${name} radius`) : null,
      kFactor: feature.kFactor == null || feature.kFactor === '' ? null : n(feature.kFactor, 'K-factor'),
      punch: bend.punch,
      die: bend.die,
    });
    // What one hit of the bend's tooling forms: a round bend must ask for more (§5.1).
    const dieEntry = dieOf(numbers.die);
    const formed = airBendRadius(stock, thickness, punchOf(numbers.punch), dieEntry).radius;
    let round = null;
    if (!(bend.steps == null || bend.steps === '')) {
      const steps = n(bend.steps, `${name} hits`);
      if (!(Number.isInteger(steps) && steps >= 2 && steps <= MAX_HITS))
        throw new Error(`${name}: a round bend is made in a whole number of hits from 2 to ${MAX_HITS}.`);
      if (!override) throw new Error(`${name}: a round bend needs its inside radius.`);
      if (!(numbers.radius > formed + 1e-9))
        throw new Error(
          `${name}: R${fmt(formed)} is what one hit in the ${dieEntry.name} die makes: make it an ordinary bend.`,
        );
      round = bumpHits({ angle, allowance: numbers.allowance, radius: numbers.radius, steps }, thickness);
      if (round.pitch < MIN_PITCH - 1e-9)
        throw new Error(`${name}: ${steps} hits would stand ${fmt(round.pitch)} mm apart: use fewer hits.`);
    }
    // Brake tool length (docs/sketch-studio-brake-tool-length.md §3.1): mm off
    // each end of every tooling run of the punch and of the die (negative:
    // past the bend); absent, the tooling is fitted to the bend.
    const trims = {};
    for (const [key, label] of [
      ['punchTrim', 'punch length'],
      ['dieTrim', 'die length'],
    ])
      if (!(bend[key] == null || bend[key] === '')) trims[key] = n(bend[key], `${name} ${label}`);
    const u = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    // The bend's first hit, its own record (§4.2): its angle, tooling and lengths.
    const ownTrims = last ? {} : trims;
    if (last)
      for (const key of ['punchTrim', 'dieTrim'])
        if (!(record[key] == null || record[key] === '')) ownTrims[key] = n(record[key], `${name} ${key}`);
    const ownPunch = last ? punchOf(record.punch || DEFAULT_PUNCH) : null;
    const hit = {
      id: bend.id,
      index: at,
      angle: first,
      punch: last ? ownPunch.key : numbers.punch,
      die: last ? (record.die ? dieOf(record.die).key : defaultDie(thickness, ownPunch).key) : numbers.die,
      ...ownTrims,
      ...(bend.stroke ? { stroke: String(bend.stroke) } : {}),
    };
    return {
      id: bend.id,
      ...(bend.stroke ? { stroke: String(bend.stroke) } : {}),
      ...trims,
      index,
      name,
      a,
      b,
      u,
      n: [-u[1], u[0]],
      angle,
      direction: bend.direction,
      segment: length,
      ...numbers,
      ...(round
        ? { steps: round.steps, stepAngle: round.stepAngle, pitch: round.pitch, flat: round.flat }
        : { override, formed }),
      hits: [hit, ...later],
    };
  });
}

// The pieces just outside one interval's strip, on each side: { minus, plus } index sets.
function intervalSides(bend, [s0, s1], pieces) {
  const pieceAt = (point) => pieces.findIndex((piece) => inMaterial(point, piece.outer, piece.holes));
  const h = bend.allowance / 2;
  const sides = { minus: new Set(), plus: new Set() };
  for (const [side, v] of [
    ['minus', -h - PROBE],
    ['plus', h + PROBE],
  ]) {
    for (const f of [0.5, 0.25, 0.75, 0.1, 0.9, 0.02, 0.98]) {
      const index = pieceAt(along(bend.a, bend.u, s0 + (s1 - s0) * f, bend.n, v));
      if (index >= 0) sides[side].add(index);
    }
    if (!sides[side].size)
      throw new Error(
        `${bend.name} runs too close to the edge: there is no material beyond its bend zone on one side. Move it in or cut the blank larger.`,
      );
  }
  return sides;
}
const notSeparating = (bend) =>
  new Error(
    `${bend.name} does not separate the sheet: material beside the punch line is still connected. Run the bend edge to edge or cut a relief.`,
  );

// Joins the blank's pieces through its bends (§5.3 step 4): a bipartite graph
// of pieces and bends; each bend lists the pieces on its v < 0 and v > 0 side.
function joinPieces(bends, pieces) {
  for (const bend of bends) {
    bend.sides = { minus: new Set(), plus: new Set() };
    // The pieces each interval joins (a hinge each), for the loop message below.
    bend.hinges = [];
    for (const interval of bend.intervals) {
      const sides = intervalSides(bend, interval, pieces);
      sides.minus.forEach((index) => bend.sides.minus.add(index));
      sides.plus.forEach((index) => bend.sides.plus.add(index));
      bend.hinges.push([...sides.minus, ...sides.plus]);
    }
    if ([...bend.sides.minus].some((index) => bend.sides.plus.has(index))) throw notSeparating(bend);
  }
  // Cycles: union-find over pieces, bend by bend; a bend whose pieces are
  // already joined closes a loop (named with the bends on the path between).
  const parent = pieces.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const adjacency = pieces.map(() => []);
  for (const bend of bends) {
    const members = [...bend.sides.minus, ...bend.sides.plus];
    for (let i = 1; i < members.length; i++) {
      const x = members[0],
        y = members[i];
      if (find(x) === find(y)) {
        const path = bendsBetween(adjacency, x, y);
        const involved = [...new Set([...path, bend.index])].sort((p, q) => p - q);
        const names = involved.map((k) => k + 1);
        const split = separateTabs(bends, involved, pieces.length);
        if (split)
          throw new Error(
            `Bend ${split.index + 1} bends separate tabs in one record (a file made before strokes): its tabs now hang on different pieces of the sheet, so it cannot fold as one bend. Remove it and make it again at the press brake, where its punch line makes one bend per tab in one stroke.`,
          );
        throw new Error(
          `Bends ${names.slice(0, -1).join(', ')} and ${names.at(-1)} close a loop in the sheet: they cannot all fold. Remove one of them or cut the material between them.`,
        );
      }
      parent[find(y)] = find(x);
    }
    for (const x of members) for (const y of members) if (x !== y) adjacency[x].push({ to: y, bend: bend.index });
  }
  if (new Set(pieces.map((_, i) => find(i))).size > 1)
    throw new Error(
      'The bends leave a piece of the blank unconnected. Check that every bend line crosses the material.',
    );
}
// A loop that only comes from lumping one bend's hinges together (§6.1: a
// stored bend whose intervals join different piece pairs, possible in files
// made before SF-3): the bends `involved` (indexes) joined hinge by hinge
// make no loop. Returns that bend, or null for a true loop. Old files that
// fold are untouched: this only words the refusal.
const hingeKey = (hinge) => [...hinge].sort((p, q) => p - q).join(',');
function separateTabs(bends, involved, count) {
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const bend of bends) {
    if (bend.index > Math.max(...involved)) break;
    const seen = new Set();
    for (const hinge of bend.hinges) {
      const key = hingeKey(hinge);
      if (seen.has(key)) continue;
      seen.add(key);
      for (let i = 1; i < hinge.length; i++) {
        if (find(hinge[0]) === find(hinge[i])) return null;
        parent[find(hinge[i])] = find(hinge[0]);
      }
    }
  }
  return bends.find((b) => involved.includes(b.index) && new Set(b.hinges.map(hingeKey)).size > 1) || null;
}
function bendsBetween(adjacency, from, to) {
  const previous = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    if (node === to) break;
    for (const { to: next, bend } of adjacency[node])
      if (!previous.has(next)) {
        previous.set(next, { node, bend });
        queue.push(next);
      }
  }
  const bends = [];
  for (let step = previous.get(to); step; step = previous.get(step.node)) bends.push(step.bend);
  return bends;
}

// ---------------------------------------------------------------- transforms
/**
 * The flat → folded transform of a bend's moving side relative to its fixed
 * side (§5.4) at `angle` degrees (the posed angle). The flat zone width stays
 * the allowance of the target angle, so a part angle uses the radius that
 * keeps the neutral fibre that long: r' = BA/θ' − k·t (r' = r at the target).
 * Returns { matrix, translate, origin, axis, angle (signed degrees), radius } or
 * an identity transform at 0°.
 */
export function bendTransform(bend, thickness, angle = bend.angle, from = 'fixed') {
  if (!bend.steps) return zoneTransform(bend, thickness, -bend.allowance / 2, bend.allowance, angle);
  // A round bend (docs/sketch-studio-round-bend.md §5.2): N mini-bends in a
  // row, p = BA/N wide, each bent by the uniform rule above, filled one after
  // another from the `from` side. At its own angle a mini-bend has radius
  // p/a − k·t = R and the N arcs share one centre: at the full angle the
  // result is the single arc's, field for field (the kernel replays that).
  const hits = bumpPose(bend, thickness, angle, from);
  const plain = zoneTransform(bend, thickness, -bend.allowance / 2, bend.allowance, angle);
  if (!plain.origin || angle >= bend.angle - 1e-9) return { ...plain, from, hits };
  // Part-way: `matrix` (the mini-bends' product, fixed side outward) and
  // `hits` are the pose; `origin` and `radius` are the hit being formed's (in
  // the fixed side's flat frame), for readouts only.
  const last = hits.at(-1);
  // The hit being formed: the last one zoneTransform actually bends (its own
  // test, in radians). A degree threshold here let a hit a hair past its start
  // (1e-9° … 5.7e-8°: the first frame of a bump hit's bend) through with no
  // origin, and the stroke died on "object null is not iterable" (BQ-1, rb2).
  const forming = hits.filter((h) => h.transform.origin).sort((p, q) => q.hit - p.hit)[0];
  return {
    matrix: multiplyMatrices(last.before, last.transform.matrix),
    translate: plain.translate,
    origin: transformPoint(forming.before, forming.transform.origin),
    axis: plain.axis,
    angle: plain.angle,
    radius: forming.transform.radius,
    from,
    hits,
  };
}

// One uniformly bent zone (§5.4): `lo` its start across the line (v) and
// `width` its flat width, posed at `angle` degrees.
function zoneTransform(bend, thickness, lo, width, angle) {
  const theta = (angle * Math.PI) / 180;
  if (!(theta > 1e-9))
    return { matrix: identityMatrix(), translate: [0, 0, 0], origin: null, axis: null, angle: 0, radius: Infinity };
  const radius = width / theta - bend.kFactor * thickness;
  const up = bend.direction === 'up';
  const foot = along(bend.a, bend.u, 0, bend.n, lo);
  const origin = [foot[0], foot[1], up ? thickness + radius : -radius];
  const axis = [bend.u[0], bend.u[1], 0];
  const translate = [-bend.n[0] * width, -bend.n[1] * width, 0];
  const signed = up ? angle : -angle;
  const matrix = multiplyMatrices(rotationMatrix(origin, axis, (signed * Math.PI) / 180), translationMatrix(translate));
  return { matrix, translate, origin, axis, angle: signed, radius };
}

/**
 * A round bend's mini-bends posed at `angle` (§5.2), in order from the fixed
 * side: [{ index (1 … N from the fixed side), hit (1 … N in bump order: from
 * the `from` side), lo, width (its strip of the zone), angle (its posed
 * degrees, clamp(angle − (hit − 1)·a, 0, a)), transform (the uniform rule on
 * its strip, in the frame where the mini-bends before it are flat), before
 * (the product of the mini-bends before it: that frame → the fixed side's) }].
 */
export function bumpPose(bend, thickness, angle, from = 'fixed') {
  const steps = bend.steps,
    a = bend.angle / steps,
    p = bend.allowance / steps;
  const hits = [];
  let before = identityMatrix();
  for (let index = 1; index <= steps; index++) {
    const hit = from === 'moving' ? steps + 1 - index : index;
    const posed = Math.min(a, Math.max(0, angle - (hit - 1) * a));
    const lo = -bend.allowance / 2 + (index - 1) * p;
    const transform = zoneTransform(bend, thickness, lo, p, posed);
    hits.push({ index, hit, lo, width: p, angle: posed, transform, before });
    before = multiplyMatrices(before, transform.matrix);
  }
  return hits;
}

// A point of one uniform zone (`lo`, `width`) at its `transform`, in that zone's flat frame.
function zonePoint(bend, thickness, transform, lo, width, s, fraction, z) {
  if (!transform.origin) {
    const p = along(bend.a, bend.u, s, bend.n, lo + fraction * width);
    return [p[0], p[1], z];
  }
  const phi = (Math.abs(transform.angle) * Math.PI * fraction) / 180;
  const up = transform.angle > 0;
  const rho = up ? thickness + transform.radius - z : transform.radius + z;
  const c = transform.origin;
  const out = Math.sin(phi) * rho,
    lift = (up ? -1 : 1) * Math.cos(phi) * rho;
  return [c[0] + bend.u[0] * s + bend.n[0] * out, c[1] + bend.u[1] * s + bend.n[1] * out, c[2] + lift];
}

/**
 * A point of a bend's arc in the fixed side's flat frame (§5.4): flat
 * s along the line, `fraction` ∈ [0, 1] across the zone (v = −BA/2 … +BA/2),
 * height z in the material, at the posed `transform` (bendTransform). A round
 * bend's is piecewise: the mini-bend holding `fraction`, carried through the
 * mini-bends before it.
 */
export function bendArcPoint(bend, thickness, transform, s, fraction, z) {
  if (transform.hits?.length && transform.origin) {
    const steps = transform.hits.length;
    const index = Math.min(steps, Math.max(1, Math.floor(fraction * steps) + 1));
    const hit = transform.hits[index - 1];
    const local = zonePoint(bend, thickness, hit.transform, hit.lo, hit.width, s, fraction * steps - (index - 1), z);
    return transformPoint(hit.before, local);
  }
  return zonePoint(bend, thickness, transform, -bend.allowance / 2, bend.allowance, s, fraction, z);
}

/**
 * Pose a fold at other angles (`angles`: bend id → degrees; absent = the
 * bend's own angle): new piece matrices and bend transforms, same topology.
 * `from` (bend id → 'fixed' | 'moving', default 'fixed'): the side a round
 * bend part-way is filled from (§5.2); ordinary bends ignore it.
 */
export function poseFold(fold, angles = null, from = null) {
  const transforms = new Map(
    fold.bends.map((bend) => [
      bend.id,
      bendTransform(
        bend,
        fold.thickness,
        angles && angles[bend.id] != null ? angles[bend.id] : bend.angle,
        (from && from[bend.id]) || 'fixed',
      ),
    ]),
  );
  const pieces = fold.pieces.map((piece) => ({
    ...piece,
    matrix: piece.path.reduce((m, id) => multiplyMatrices(m, transforms.get(id).matrix), identityMatrix()),
  }));
  const byId = new Map(pieces.map((p) => [p.id, p]));
  return {
    ...fold,
    pieces,
    bends: fold.bends.map((bend) => {
      const transform = transforms.get(bend.id);
      return {
        ...bend,
        posedAngle: Math.abs(transform.angle),
        transform,
        fixedMatrix: byId.get(bend.fixedPiece).matrix,
      };
    }),
  };
}

// ---------------------------------------------------------------- the fold
/**
 * Fold a sheet-metal feature's blank (§5.3–5.5). `profile` is the blank's
 * sketch profile, `params` resolved parameter values; `options.angles`
 * (bend id → degrees) poses the bends at other angles (a stroke in progress,
 * "first k bends", the unfold animation). Errors refuse the build; warnings
 * are data. Returns { thickness, stock, kFactor, pieces, bends, flat,
 * warnings, rootPiece }.
 */
export function foldSheet(feature, profile, params = {}, { angles = null } = {}) {
  const { thickness, stock, material, flat, bends, pieces } = cutBlank(feature, profile, params);
  const warnings = [];
  joinPieces(bends, pieces);
  return finishFold({ feature, params, thickness, stock, material, flat, bends, pieces, warnings, angles });
}

// §5.3 steps 1–4: the blank, every bend resolved with its intervals and
// strips (the segment a–b picks the intervals it touches; `skip` (bend id →
// indexes into them) leaves some out), the crossing check and the rigid pieces.
function cutBlank(feature, profile, params, { skip = null } = {}) {
  const thickness = numeric(feature.thickness, params, 'Sheet thickness');
  if (!(thickness > 0)) throw new Error('Sheet thickness must be greater than zero.');
  const stock = stockOf(feature.stock || 'spcc');
  const material = profilePolygon(profile, params);
  const { outer, holes } = material;
  const flat = flatSummary(material, profile, params);
  const bends = resolveBends(feature, params, thickness, stock);
  const materialPolygon = [closedRing(outer), ...holes.map(closedRing)];
  for (const bend of bends) {
    const all = lineIntervals(outer, holes, bend.a, bend.u, bend.n);
    const left = new Set(skip?.[bend.id] || []);
    const chosen = all
      .filter(({ s0, s1 }) => s1 >= -1e-6 && s0 <= bend.segment + 1e-6)
      .filter((_, index) => !left.has(index));
    if (!chosen.length) throw new Error(`${bend.name}: the punch line misses the blank.`);
    bend.intervals = chosen.map(({ s0, s1 }) => [s0, s1]);
    bend.ends = chosen.map(({ ends }) => ends);
    bend.strips = bend.intervals.map((interval) => stripRing(bend, interval, bend.allowance / 2));
  }
  // Step 3: strips of different bends must not overlap inside the material.
  for (let j = 1; j < bends.length; j++)
    for (let i = 0; i < j; i++)
      for (const a of bends[i].strips)
        for (const b of bends[j].strips) {
          const overlap = polygonClipping.intersection(materialPolygon, [closedRing(a)], [closedRing(b)]);
          if (multiArea(overlap) > 1e-6) throw new Error(`Bend ${j + 1} crosses bend ${i + 1}.`);
        }
  // Step 4: the rigid pieces between the strips.
  const strips = bends.flatMap((bend) => bend.strips.map((ring) => [closedRing(ring)]));
  const clipped = strips.length ? polygonClipping.difference(materialPolygon, ...strips) : [materialPolygon];
  const pieces = clipped
    .map((polygon) => {
      const pieceOuter = orient(openRing(polygon[0]), true),
        pieceHoles = polygon.slice(1).map((ring) => orient(openRing(ring), false));
      return { outer: pieceOuter, holes: pieceHoles, area: polygonArea(pieceOuter, pieceHoles) };
    })
    .filter((piece) => piece.area > 1e-4)
    .map((piece, index) => ({
      id: `piece-${index + 1}`,
      ...piece,
      centroid: polygonCentroid(piece.outer, piece.holes),
    }));
  return { thickness, stock, material, flat, bends, pieces };
}

// §5.3 step 5 to §5.5: root, orientation, paths, legs and warnings.
function finishFold({ feature, params, thickness, stock, material, flat, bends, pieces, warnings, angles }) {
  const { holes } = material;
  // Step 5: the root keeps its place; every bend's fixed side is the one nearer it.
  const base = feature.base ? [numeric(feature.base[0], params), numeric(feature.base[1], params)] : null;
  let root = base ? pieces.findIndex((piece) => inMaterial(base, piece.outer, piece.holes)) : -1;
  if (root < 0) root = pieces.reduce((best, piece, i) => (piece.area > pieces[best].area ? i : best), 0);
  const paths = new Map([[root, []]]);
  const queue = [root];
  const entered = new Set();
  while (queue.length) {
    const index = queue.shift();
    for (const bend of bends) {
      if (entered.has(bend.id)) continue;
      const side = bend.sides.minus.has(index) ? 'minus' : bend.sides.plus.has(index) ? 'plus' : null;
      if (!side) continue;
      entered.add(bend.id);
      bend.fixedIndex = index;
      if (side === 'plus') flipBend(bend);
      const fixedSide = bend.sides.minus,
        movingSide = bend.sides.plus;
      for (const other of fixedSide)
        if (!paths.has(other)) {
          paths.set(other, paths.get(index));
          queue.push(other);
        }
      for (const other of movingSide)
        if (!paths.has(other)) {
          paths.set(other, [...paths.get(index), bend.id]);
          queue.push(other);
        }
    }
  }
  // Legs and warnings per bend (§5.2, §5.5).
  const distortion = (bend) => distortionDistance(thickness, bend.radius);
  for (const bend of bends) {
    const reach = (indices) =>
      Math.max(...[...indices].flatMap((i) => pieces[i].outer.map((p) => Math.abs(dot(sub(p, bend.a), bend.n)))));
    const flatFixed = reach(bend.sides.minus),
      flatMoving = reach(bend.sides.plus);
    // An outside leg that ends at a parallel bend runs to that bend's mould line.
    const nextSetback = (d) =>
      bends.find(
        (other) =>
          other !== bend &&
          Math.abs(Math.abs(dot(other.u, bend.u)) - 1) < 1e-9 &&
          Math.abs(Math.abs(dot(sub(other.a, bend.a), bend.n)) - (d + other.allowance / 2)) < 1e-6,
      )?.setback || 0;
    bend.flatLegs = { fixed: flatFixed, moving: flatMoving };
    bend.legs = {
      fixed: legFromDistance(flatFixed, bend) + nextSetback(flatFixed),
      moving: legFromDistance(flatMoving, bend) + nextSetback(flatMoving),
    };
    bend.length = bend.intervals.reduce((sum, [s0, s1]) => sum + s1 - s0, 0);
    const say = (code, message) => warnings.push({ code, bendId: bend.id, message: `${bend.name}: ${message}` });
    if (bend.sharp)
      say(
        'sharp-bend',
        `the die forms a sharp bend; the inside radius stays at 0.63 t = ${fmt(bend.radius)} mm and the bend line creases.`,
      );
    if (bend.radius < stock.minRadius * thickness - 1e-9)
      say(
        'tight-radius',
        `R${fmt(bend.radius)} is below the ${fmt(stock.minRadius)} t minimum for ${stock.name} (${fmt(stock.minRadius * thickness)} mm); it may crack.`,
      );
    const dieEntry = dieOf(bend.die);
    // A round bend is checked per hit (round-bend spec §5.4): the die carries
    // the sheet beside the outermost hit, bumped or not, at one hit's angle.
    const needed = minLeg(dieEntry, bend.steps ? bend.stepAngle : bend.angle);
    for (const [label, flatLeg] of [
      ['fixed', flatFixed],
      ['moving', flatMoving],
    ]) {
      const d = bend.steps ? flatLeg - bend.allowance / 2 + bend.pitch / 2 : flatLeg;
      if (d < needed - 1e-9)
        say(
          'short-leg',
          `the ${label === 'moving' ? 'flange' : 'fixed'} leg is ${fmt(d)} mm from the ${bend.steps ? 'outermost hit' : 'bend line'} in the flat; the ${dieEntry.name} die needs at least ${fmt(needed)} mm to sit on both shoulders.`,
        );
    }
    if (!bend.steps && bend.override && bend.radius >= 3 * bend.formed - 1e-9) {
      // The other way (round-bend spec §12.4): one hit of a radius punch of that radius.
      const radiusPunch = radiusPunchFor(bend.radius);
      say(
        'radius-needs-hits',
        `one hit in the ${dieEntry.name} die forms about R${fmt(bend.formed)}, not R${fmt(bend.radius)}: make it a round bend (several hits)${radiusPunch ? `, or make it in one hit with the ${radiusPunch.name} punch` : ''}.`,
      );
    }
    const sRange = [Math.min(...bend.intervals.map((i) => i[0])), Math.max(...bend.intervals.map((i) => i[1]))];
    let nearest = Infinity;
    for (const hole of holes)
      for (let i = 0; i < hole.length; i++) {
        const p = hole[i],
          q = hole[(i + 1) % hole.length];
        const sp = dot(sub(p, bend.a), bend.u),
          sq = dot(sub(q, bend.a), bend.u);
        if (Math.max(sp, sq) < sRange[0] || Math.min(sp, sq) > sRange[1]) continue;
        const vp = dot(sub(p, bend.a), bend.n),
          vq = dot(sub(q, bend.a), bend.n);
        nearest = Math.min(nearest, vp * vq <= 0 ? 0 : Math.min(Math.abs(vp), Math.abs(vq)));
      }
    // A round bend's zone is wide (either way it is made, §12.5): a cut-out distorts within half of it plus 2.5 t.
    const round = isRoundBend(bend);
    const distorts = round ? bend.allowance / 2 + 2.5 * thickness : distortion(bend);
    if (nearest < distorts - 1e-9)
      say(
        'hole-near-bend',
        `a cut-out is ${fmt(nearest)} mm from the bend line; within ${fmt(distorts)} mm (${round ? 'half the bend zone + 2.5 t' : '2.5 t + r'}) it will distort.`,
      );
    if (bend.ends.some((pair) => pair.some((dirs) => dirs.every((d) => Math.abs(dot(d, bend.u)) > SQUARE_TOLERANCE))))
      say(
        'outline-not-square',
        'the blank outline crosses the bend zone at an angle; the zone is built from the punch-line interval, so its corners are approximate.',
      );
  }
  const out = {
    thickness,
    stock: stock.key,
    kFactor: feature.kFactor ?? null,
    rootPiece: pieces[root].id,
    flat,
    // The blank's material (profilePolygon), for the brake's tooling runs along a line.
    blank: material,
    warnings,
    pieces: pieces.map((piece, index) => ({
      id: piece.id,
      outer: piece.outer,
      holes: piece.holes,
      area: piece.area,
      centroid: piece.centroid,
      path: paths.get(index),
      matrix: identityMatrix(),
    })),
    bends: bends.map((bend) => ({
      id: bend.id,
      ...(bend.stroke ? { stroke: bend.stroke } : {}),
      index: bend.index,
      a: bend.a,
      b: bend.b,
      u: bend.u,
      n: bend.n,
      angle: bend.angle,
      direction: bend.direction,
      radius: bend.radius,
      kFactor: bend.kFactor,
      allowance: bend.allowance,
      setback: bend.setback,
      deduction: bend.deduction,
      sharp: bend.sharp,
      punch: bend.punch,
      die: bend.die,
      // Brake tool length (§3.1): the trims per end, only when set.
      ...(bend.punchTrim != null ? { punchTrim: bend.punchTrim } : {}),
      ...(bend.dieTrim != null ? { dieTrim: bend.dieTrim } : {}),
      // A round bend's hits (docs/sketch-studio-round-bend.md §5.1); absent on an ordinary bend.
      ...(bend.steps ? { steps: bend.steps, stepAngle: bend.stepAngle, pitch: bend.pitch, flat: bend.flat } : {}),
      intervals: bend.intervals,
      fixedPiece: pieces[bend.fixedIndex].id,
      movingPieces: [...bend.sides.plus].map((i) => pieces[i].id),
      legs: bend.legs,
      flatLegs: bend.flatLegs,
      length: bend.length,
      label: bendLabel(bend),
      // Every hit that makes it, in the order made (tight bends §4.2): one for an ordinary bend.
      hits: bend.hits,
    })),
  };
  return poseFold(out, angles);
}

// A bend turned end for end: a ↔ b, u, n and v reverse, intervals mirror.
function flipBend(bend) {
  const length = bend.segment;
  [bend.a, bend.b] = [bend.b, bend.a];
  bend.u = [-bend.u[0], -bend.u[1]];
  bend.n = [-bend.n[0], -bend.n[1]];
  bend.intervals = bend.intervals.map(([s0, s1]) => [length - s1, length - s0]).reverse();
  bend.ends = bend.ends.map(([start, end]) => [end, start]).reverse();
  [bend.sides.minus, bend.sides.plus] = [bend.sides.plus, bend.sides.minus];
}

/** The folded part's bounding box [[x, y, z], [x, y, z]] from a (posed) fold: piece corners and sampled arcs. */
export function foldedBounds(fold, steps = 64) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  const add = (p) =>
    p.forEach((v, i) => {
      min[i] = Math.min(min[i], v);
      max[i] = Math.max(max[i], v);
    });
  for (const piece of fold.pieces)
    for (const [x, y] of piece.outer) for (const z of [0, fold.thickness]) add(transformPoint(piece.matrix, [x, y, z]));
  for (const bend of fold.bends) {
    const samples = zoneSamples(bend, steps);
    for (const [s0, s1] of bend.intervals)
      for (let i = 0; i <= samples; i++)
        for (const s of [s0, s1])
          for (const z of [0, fold.thickness])
            add(
              transformPoint(bend.fixedMatrix, bendArcPoint(bend, fold.thickness, bend.transform, s, i / samples, z)),
            );
  }
  return [min, max];
}

/**
 * The blank's round cut-outs a fastener can go through (docs/sketch-studio-
 * shop-floor.md §5.3): every circle of `profile.holes` lying wholly inside one
 * rigid piece of `fold` (foldSheet's result, posed), as { index (its place in
 * profile.holes, as laserStation.js profileCircles counts them), diameter,
 * centre, direction, pieceId } in the folded part frame: the centre on the
 * piece's top face (flat z = t), the direction into the sheet (flat −Z). A
 * circle reaching into a bend zone (it deforms) is left out. The index is
 * positional: reordering the cut-outs moves what is seated in them.
 */
export function blankHoles(fold, profile, params = {}) {
  const rows = [];
  (profile?.holes || []).forEach((hole, index) => {
    if (hole?.type !== 'circle') return;
    let centre, radius;
    try {
      centre = (hole.center || [0, 0]).map((v) => numeric(v, params));
      radius = numeric(hole.radius, params);
    } catch {
      return;
    }
    if (!(radius > 0)) return;
    // Clear of every bend zone: the circle's distance to each zone strip.
    const inZone = fold.bends.some((bend) => {
      const v = dot(sub(centre, bend.a), bend.n),
        s = dot(sub(centre, bend.a), bend.u);
      return (
        Math.abs(v) < bend.allowance / 2 + radius &&
        bend.intervals.some(([s0, s1]) => s > s0 - radius && s < s1 + radius)
      );
    });
    if (inZone) return;
    // The piece whose outline holds the circle (the smallest, should one hold another).
    const piece = fold.pieces.filter((p) => pointInRing(centre, p.outer)).sort((a, b) => a.area - b.area)[0];
    if (!piece) return;
    const m = piece.matrix;
    const down = [-m[8], -m[9], -m[10]];
    const length = Math.hypot(...down);
    rows.push({
      index,
      diameter: 2 * radius,
      centre: transformPoint(m, [centre[0], centre[1], fold.thickness]),
      direction: down.map((v) => v / length || 0),
      pieceId: piece.id,
    });
  });
  return rows;
}

// ---------------------------------------------------------------- strokes (shop floor §6.1)
// A bend record is one hinge (one piece pair). One stroke of the press brake
// may make several: a punch line across several separate tabs bends them all
// at once. The bends of one stroke share `stroke` (absent: a stroke of its
// own) and stand next to each other in `feature.bends`.

/**
 * The strokes of a list of bends (a feature's `bends` or a fold's): runs of
 * neighbours sharing a `stroke` id, every other bend alone. The one place
 * that says what a stroke is. Returns [{ id (the stroke id, or the bend's),
 * key (its first bend's id), bendIds, start, end (indexes into the list),
 * index }].
 */
export function bendStrokes(bends = []) {
  const strokes = [];
  bends.forEach((bend, i) => {
    const last = strokes.at(-1);
    if (bend?.stroke && last?.stroke === bend.stroke && last.end === i - 1) {
      last.bendIds.push(bend.id);
      last.end = i;
    } else strokes.push({ stroke: bend?.stroke || null, bendIds: [bend?.id], start: i, end: i });
  });
  return strokes.map(({ stroke, ...s }, index) => ({ id: stroke || s.bendIds[0], key: s.bendIds[0], ...s, index }));
}
/** The stroke (bendStrokes) holding the bend `bendId`, or null. */
export const strokeOf = (bends, bendId) => bendStrokes(bends).find((s) => s.bendIds.includes(bendId)) || null;

// ---------------------------------------------------------------- the order made (tight bends §4.2)
const TRIM_KEYS = ['punchTrim', 'dieTrim'];
// A fold bend's hits; a fold made without them (a hand-built test fold) is one hit per bend.
const hitsOfBend = (bend) =>
  bend.hits || [
    {
      id: bend.id,
      index: bend.index,
      angle: bend.angle,
      punch: bend.punch,
      die: bend.die,
      ...Object.fromEntries(TRIM_KEYS.filter((k) => bend[k] != null).map((k) => [k, bend[k]])),
      ...(bend.stroke ? { stroke: bend.stroke } : {}),
    },
  ];

/**
 * The steps of the press brake in the order made (tight bends §4.2): every
 * hit of every bend of `fold` (foldSheet's result), neighbours sharing a
 * `stroke` one step as bendStrokes has them. [{ id (the stroke id, or the
 * step's first record's), key (its first record's id), recordIds, bendIds,
 * start, end (indexes into `feature.bends`), index, again (a bend-on step),
 * from, to (bend id → angle before and after it), punch, die, punchTrim?,
 * dieTrim? (its first record's) }]. With no bend-on entry it is bendStrokes'
 * list step for step (the same id, key, bendIds, start, end and index).
 */
export function hitSequence(fold) {
  const hits = fold.bends
    .flatMap((bend) => hitsOfBend(bend).map((hit) => ({ ...hit, bendId: bend.id })))
    .sort((p, q) => p.index - q.index);
  const runs = [];
  for (const hit of hits) {
    const last = runs.at(-1);
    if (hit.stroke && last?.stroke === hit.stroke && last.end === hit.index - 1) {
      last.hits.push(hit);
      last.end = hit.index;
    } else runs.push({ stroke: hit.stroke || null, hits: [hit], start: hit.index, end: hit.index });
  }
  const now = {};
  return runs.map(({ stroke, hits: members, start, end }, index) => {
    const first = members[0];
    const from = {},
      to = {};
    for (const hit of members) {
      from[hit.bendId] = now[hit.bendId] || 0;
      to[hit.bendId] = hit.angle;
    }
    Object.assign(now, to);
    return {
      id: stroke || first.id,
      key: first.id,
      recordIds: members.map((h) => h.id),
      bendIds: members.map((h) => h.bendId),
      start,
      end,
      index,
      again: first.id !== first.bendId,
      from,
      to,
      punch: first.punch,
      die: first.die,
      ...Object.fromEntries(TRIM_KEYS.filter((k) => first[k] != null).map((k) => [k, first[k]])),
    };
  });
}

/** The step (hitSequence) holding the record `recordId` (a bend's id is its first hit's), or null. */
export const stepOf = (fold, recordId) => hitSequence(fold).find((s) => s.recordIds.includes(recordId)) || null;

/** Every bend's angle as step `index` of hitSequence(fold) starts (0: not yet hit); index = the step count: as made. */
export function anglesBefore(fold, index) {
  const angles = Object.fromEntries(fold.bends.map((b) => [b.id, 0]));
  for (const step of hitSequence(fold).slice(0, Math.max(0, index))) Object.assign(angles, step.to);
  return angles;
}

/** A bend's number at the brake (§4.4): the place of the step that first makes it, 1-based (0: none). */
export const bendNumber = (fold, bendId) => hitSequence(fold).findIndex((s) => s.bendIds.includes(bendId)) + 1;

/**
 * The fold as the machine makes the step `step` (a hitSequence entry): its
 * bends at the step's angle (`to`), with the step's punch, die and lengths
 * and their label, posed there (§4.3: the machine's checks and the stroke use
 * a step's own angle and tooling; the zone and its allowance stay the final
 * angle's). A fold whose bends are made in one hit each is returned as it is.
 */
export function stepFold(fold, step) {
  if (!step?.to || fold.bends.every((b) => !b.hits || b.hits.length < 2)) return fold;
  const own = new Set(step.bendIds);
  return poseFold({
    ...fold,
    bends: fold.bends.map((bend) => {
      if (!own.has(bend.id)) return bend;
      const next = { ...bend, angle: step.to[bend.id], punch: step.punch, die: step.die };
      for (const key of TRIM_KEYS) {
        if (step[key] != null) next[key] = step[key];
        else delete next[key];
      }
      return { ...next, label: bendLabel(next) };
    }),
  });
}

/**
 * The pose as step `index` starts (`after`: as it ends), as poseFold takes
 * it: { step, fold (stepFold), angles (bend id → angle, only where it differs
 * from that fold's own: a bend still to come at 0, one part-way at its angle
 * then) }. With no bend-on entry: the later steps flat, and the step's own
 * bends flat before it, as the sequence list has always posed a step.
 */
export function stepPose(fold, index, { after = false } = {}) {
  const step = hitSequence(fold)[index] || null;
  const shown = stepFold(fold, step);
  const at = anglesBefore(fold, after ? index + 1 : index);
  const angles = {};
  for (const bend of shown.bends) if (Math.abs(at[bend.id] - bend.angle) > 1e-9) angles[bend.id] = at[bend.id];
  return { step, fold: shown, angles };
}

/**
 * The material a punch line a → b crosses, in order along it: every interval
 * the segment touches, as foldSheet picks them ({ index, s0, s1, a, b } in
 * flat mm). `polygon`: profilePolygon's { outer, holes }. The brake draws
 * them on the flat blank; `strokeBends`' `skip` counts in this list.
 */
export function lineSegments({ outer, holes }, { a, b }) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(length > 1e-6)) return [];
  const u = [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
    n = [-u[1], u[0]];
  return lineIntervals(outer, holes, a, u, n)
    .filter(({ s0, s1 }) => s1 >= -1e-6 && s0 <= length + 1e-6)
    .map(({ s0, s1 }, index) => ({ index, s0, s1, a: along(a, u, s0, n, 0), b: along(a, u, s1, n, 0) }));
}

const STROKE_PROBE = 'stroke-line';
/**
 * One stroke of the brake as bend records (§6.1): the punch line `line` ({ a,
 * b, angle, direction, radius, punch, die }) clipped to the material, minus
 * the segments in `skip` (indexes into lineSegments), the blank cut by the
 * existing bends' strips and this line's, the segments grouped by the piece
 * pair they join. Returns [{ a, b }], one line per group, each running just
 * inside its group's first and last segment (the line as given when it makes
 * one bend and nothing is skipped: old hits are unchanged). Throws the fold's
 * errors (named "Bend N", N = the new bend's place) and its own.
 */
export function strokeBends(feature, profile, params = {}, line, { skip = [] } = {}) {
  const probe = { angle: 90, direction: 'up', radius: null, ...line, id: STROKE_PROBE };
  delete probe.stroke;
  const trial = { ...feature, bends: [...(feature.bends || []), probe] };
  const left = [...new Set(skip)].filter((i) => Number.isInteger(i) && i >= 0);
  if (left.length) {
    const n = (v) => numeric(v, params);
    const count = lineSegments(profilePolygon(profile, params), { a: line.a.map(n), b: line.b.map(n) }).length;
    if (count && left.filter((i) => i < count).length >= count)
      throw new Error('Every segment of this line is left out: keep at least one to bend.');
  }
  const { material, bends, pieces } = cutBlank(trial, profile, params, { skip: { [STROKE_PROBE]: left } });
  const bend = bends.at(-1);
  const touched = lineIntervals(material.outer, material.holes, bend.a, bend.u, bend.n).filter(
    ({ s0, s1 }) => s1 >= -1e-6 && s0 <= bend.segment + 1e-6,
  );
  // Group the kept segments by the (minus, plus) piece pair they join.
  const groups = [];
  for (const interval of bend.intervals) {
    const sides = intervalSides(bend, interval, pieces);
    if ([...sides.minus].some((i) => sides.plus.has(i))) throw notSeparating(bend);
    const key = [[...sides.minus].sort().join(','), [...sides.plus].sort().join(',')].sort().join('|');
    const group = groups.find((g) => g.key === key);
    if (group) group.intervals.push(interval);
    else groups.push({ key, intervals: [interval] });
  }
  if (groups.length === 1 && !left.length) return [{ a: line.a, b: line.b }];
  const keptBy = (s0) => groups.findIndex((g) => g.intervals.some((iv) => Math.abs(iv[0] - s0) < 1e-6));
  for (const [gi, group] of groups.entries()) {
    const from = group.intervals[0][0],
      to = group.intervals.at(-1)[1];
    for (const { s0, s1 } of touched) {
      if (!(s0 > from + 1e-6 && s1 < to - 1e-6)) continue;
      const owner = keptBy(s0);
      if (owner === gi) continue;
      if (owner >= 0) throw new Error('These tabs interleave on the line: bend them one at a time (two points).');
      throw new Error(
        'A segment left out lies between tabs this hit bends together: bend them one at a time (two points).',
      );
    }
  }
  const round = (p) => p.map((v) => Math.round(v * 1e6) / 1e6);
  return groups.map(({ intervals }) => {
    const [f0, f1] = intervals[0],
      [l0, l1] = intervals.at(-1);
    const s0 = f0 + Math.min(0.5, (f1 - f0) / 4),
      s1 = l1 - Math.min(0.5, (l1 - l0) / 4);
    return { a: round(along(bend.a, bend.u, s0, bend.n, 0)), b: round(along(bend.a, bend.u, s1, bend.n, 0)) };
  });
}

/** The fold's error message, or '' when it folds (the panels check before committing). */
export function foldProblem(feature, profile, params = {}) {
  try {
    foldSheet(feature, profile, params);
    return '';
  } catch (error) {
    return error.message || String(error);
  }
}

/** The first enabled feature of a part when it is a sheet-metal blank, else null. */
export const sheetMetalFeature = (part) => {
  const first = (part?.features || []).find((f) => !f.suppressed);
  return first?.type === 'sheetmetal' ? first : null;
};

// ---------------------------------------------------------------- 2D drawing nesting
/**
 * Closed drawing profiles (collectDraftingProfiles candidates) → blanks
 * (§9 SM-1 item 4): a loop strictly inside another becomes its cut-out, a
 * loop inside a cut-out is skipped and reported.
 * Returns { blanks: [{ id, name, profile, sourceIds, holes }], skipped: [{ id, name, reason }] }.
 */
export function nestProfiles(candidates = [], params = {}) {
  const loops = [];
  const skipped = [];
  for (const candidate of candidates) {
    try {
      const { outer } = profilePolygon({ ...candidate.profile, holes: [] }, params);
      loops.push({ ...candidate, ring: outer, area: Math.abs(ringArea(outer)) });
    } catch (error) {
      skipped.push({ id: candidate.id, name: candidate.name, reason: error.message });
    }
  }
  for (const loop of loops)
    loop.parents = loops.filter(
      (other) => other !== loop && other.area > loop.area && loop.ring.every((p) => pointInRing(p, other.ring)),
    );
  const blanks = [];
  for (const loop of loops) {
    if (loop.parents.length === 0) continue;
    if (loop.parents.length > 1)
      skipped.push({ id: loop.id, name: loop.name, reason: 'It sits inside a cut-out; cut it from its own blank.' });
  }
  for (const outer of loops.filter((loop) => !loop.parents.length).sort((a, b) => b.area - a.area)) {
    const holes = loops.filter((loop) => loop.parents.length === 1 && loop.parents[0] === outer);
    const { holes: _ignored, ...profile } = outer.profile;
    blanks.push({
      id: outer.id,
      name: outer.name,
      profile: holes.length ? { ...profile, holes: holes.map((h) => h.profile) } : profile,
      sourceIds: [...outer.sourceIds, ...holes.flatMap((h) => h.sourceIds)],
      holes: holes.length,
    });
  }
  return { blanks, skipped };
}
