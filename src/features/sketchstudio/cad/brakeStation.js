// The press brake station's state, derived (docs/sketch-studio-fab-shop.md §9
// SM-2): from the model and the workspace's `brakeSession` (the operator's
// picks, never saved) to the pending hit with its checks and collision, the
// sequence of the bends already made, and the view the viewport poses. Pure.
//
// A bend's stored data stays §4.1 (a, b, angle, direction, radius, punch,
// die); the backgauge distance L is derived from the gauge edge, never stored.
import { numeric } from './model.js';
import {
  autoHits,
  bendNumber,
  bendNumbers,
  foldProblem,
  foldSheet,
  hitSequence,
  isBendOn,
  isRoundBend,
  lineSegments,
  madeBends,
  profilePolygon,
  poseFold,
  sheetMetalFeature,
  stepOf,
  stepPose,
  strokeBends,
  transformPoint,
} from './sheetMetal.js';
import {
  DEFAULT_MACHINE,
  DIES,
  HORNS,
  HORN_KEYS,
  MACHINES,
  PUNCHES,
  RACK_ORDER,
  SHORTEST_SECTION,
  airBendRadius,
  dieOf,
  hornOf,
  machineOf,
  maxBendAngle,
  minLeg,
  punchOf,
  punchSymmetric,
  stockOf,
  suggestedDie,
} from './shopCatalog.js';
import {
  assessBend,
  backSide,
  brakeFrame,
  brakeHit,
  brakeReading,
  bumpTimeline,
  gaugeBendLine,
  gaugeEdges,
  gaugeReading,
  gaugeStops,
  lineTooling,
  machineFrom,
  MIN_COVERAGE,
  pairTimeline,
  stopTakeUp,
  strokeTimeline,
  strokeTooling,
} from './pressBrake.js';
import {
  EARLIER,
  PUNCH_LABELS,
  brakeCollisions,
  hangingMessage,
  hitName,
  partSurface,
  ramClearance,
  takeOffOf,
} from './brakeCollisions.js';
import { nodeName } from './groups.js';
import { flangeGaps, foldOverlaps, pieceTriangles } from './cornerGaps.js';

export const PENDING_BEND = 'pending-hit';

/** A fresh station session for an instance (the workspace adds `stage` and `key`). */
export const brakeSessionDefaults = () => ({
  mode: 'gauge',
  edge: null,
  distance: 20,
  points: [],
  angle: 90,
  flip: false,
  punch: 'straight-88',
  die: null,
  lastHit: null,
  scrub: null,
  stroke: null,
  // Segments of the punch line left out of the hit (shop floor §6.2), reset when the line changes.
  skip: [],
  // A round bend (docs/sketch-studio-round-bend.md §6): its inside radius and
  // hits (null: automatic), made by bump bending — or, when `punch` is a
  // radius punch (§12.6, the one source of truth), in one hit of that punch.
  shape: 'sharp',
  radius: 20,
  steps: null,
  // Reverse punch (docs/sketch-studio-brake-flip-tooling.md §4.2): an
  // asymmetric punch (a gooseneck) turned round in its clamps, its throat to
  // the backgauge. Session only: a stored step is checked either way round.
  reverse: false,
  // Turn sheet around (§5.2) where no opposite edge can go to the backgauge
  // (or on a two-point line): the other side of the line goes back. A new
  // line starts the right way round.
  turned: false,
  // Bend shape Offset (§5.3, shape 'offset'): the step between the two faces
  // (mm, on the same side of the sheet), made in two hits, flipped between.
  offset: 10,
  // Brake tool length (docs/sketch-studio-brake-tool-length.md §3.1): mm off
  // each end of every run of the punch (its holders follow it) and of the
  // die; negative runs past the bend; null fitted. Stored on the bend record
  // (a stored step is rechecked with it). Since TL-2 (§9) a new line keeps
  // them: a tool's length changes only when the operator changes it. Beside
  // them, `punchHold` / `dieHold` (absent until a length is set, brakePatch):
  // the length in mm the tool is held at while one run stands under the line.
  punchTrim: null,
  dieTrim: null,
  // Horn sections at the ends of the punch (docs/sketch-studio-punch-library.md
  // §4.1): tooling, so a new line keeps them; written on the bend record only
  // when on (not with a radius punch, which has none).
  horns: false,
  // The brake finds the way (docs/sketch-studio-tight-bends.md §5.2): a try
  // the collision card offered and the operator armed — { kind: 'before',
  // key } (this hit before the step `key`) or { kind: 'partway', key, angle }
  // (the step `key` opened to `angle`, finished after this hit). The pending
  // hit is checked, posed and committed that way; null: made last, as ever.
  armed: null,
  // Gauging off a flange (docs/sketch-studio-skin-gauge.md §4.3): `distance`
  // is what the backgauge reads, L from `stop` — null, the gauge edge; or a
  // made bend's id, the outside face of that bend's flange (the line lies
  // `distance` + its take-up from the edge on the flat blank). `stopHold`:
  // the operator's own choice of stop (§4.6; 'edge' or a bend id), null
  // automatic (§4.4). Neither is carried to the next part.
  stop: null,
  stopHold: null,
});

/**
 * What stays in the machine when the brake moves to the next part without the
 * station being left (docs/sketch-studio-outline-edit-sheet-nest.md §7.3):
 * the punch, the die and which way round the punch is clamped — never the
 * picks (edge, L, points, angle, shape, skips, turned, scrub, the last
 * hit). Since TL-2 (brake tool length §9.4) the tools' lengths go too: the
 * holds and the trims when set; the next part's first line derives its trim
 * from the hold as any new line does. null with no session. A die that does not suit the next part is told
 * by the station's own checks, as when it is chosen by hand.
 */
export function brakeCarry(session) {
  if (!session) return null;
  const defaults = brakeSessionDefaults();
  return {
    punch: session.punch ?? defaults.punch,
    die: session.die ?? defaults.die,
    reverse: Boolean(session.reverse),
    // Horn sections go with the punch (punch library §4.1), named only when on.
    ...(hornOf(session.horns) && !PUNCHES[session.punch]?.round ? { horns: hornSetting(hornOf(session.horns)) } : {}),
    ...Object.fromEntries(
      HELD_TOOLS.flatMap(([trim, hold]) => [
        ...(trimSet(session[trim]) ? [[trim, Number(session[trim])]] : []),
        ...(Number.isFinite(session[hold]) ? [[hold, session[hold]]] : []),
      ]),
    ),
  };
}

// The tools' lengths (brake tool length §9.4, TL-2): each trim beside the
// length in mm it holds the tool at.
const HELD_TOOLS = [
  ['punchTrim', 'punchHold'],
  ['dieTrim', 'dieHold'],
];
// The span of the one tooling run under the session's line (pressBrake.js
// lineTooling), or null: no station, no line, or several runs (tabs).
function oneRun(station, session) {
  if (!station?.polygon || !station.edges) return null;
  const { line } = sessionLine(station, session);
  if (!line) return null;
  const runs = lineTooling(station.fold, station.polygon, line, session.skip || []);
  return runs.length === 1 ? runs[0][1] - runs[0][0] : null;
}
/**
 * The lengths stay as set (brake tool length §9.3, §9.4): `next` (the
 * session after `patch`) gets its trims and holds. A patch naming a trim
 * takes it as given: with one run under the line the hold is that length (a
 * null trim, fitted, removes it); several runs or no station, the hold goes
 * and the trim itself stays. A new line keeps the trim, or, with a hold and
 * one run under it, derives the trim from the hold. A patch naming `skip`
 * keeps the trim and re-reads the hold from it. A session that never sets a
 * length gains no key.
 */
function holdTools(next, patch, newLine, station) {
  let span;
  const run = () => (span === undefined ? (span = oneRun(station, next)) : span);
  for (const [trim, hold] of HELD_TOOLS) {
    if (trim in patch || 'skip' in patch) {
      if (!trimSet(next[trim]) || run() == null) delete next[hold];
      else next[hold] = exact(run() - 2 * Number(next[trim]));
    } else if (newLine && Number.isFinite(next[hold]) && run() != null) {
      const derived = exact((run() - next[hold]) / 2);
      next[trim] = Math.abs(derived) < 1e-6 ? null : derived;
    }
  }
}

/**
 * The session patch that puts the punch `key` in (brake blades §4.1): the one
 * rule the Punch select and the blade picker share. A radius punch is Round ·
 * Radius punch (round-bend spec §12.6); between a radius punch and any other
 * the die goes back to automatic. A radius punch has no horn sections
 * (docs/sketch-studio-punch-library.md §4.1): choosing one clears them.
 */
export function punchChoice(session, key) {
  const round = Boolean(PUNCHES[key]?.round);
  return {
    punch: key,
    ...(round ? { shape: 'round' } : {}),
    ...(round !== Boolean(PUNCHES[session.punch]?.round) ? { die: null } : {}),
    ...(round && session.horns ? { horns: false } : {}),
  };
}
/**
 * The session after a patch, as the workspace applies every pick
 * (docs/sketch-studio-brake-hands-on.md §5.4: the one copy of the rule). A
 * new line (an edge, L, points or the mode) puts every segment back in the
 * hit (shop floor §6.2) and starts the right way round (Turn sheet around,
 * brake flip tooling §5.2); the punch and die keep their lengths (brake tool
 * length §9.3, holdTools); a patch naming `skip` is a segment toggle on the
 * same line.
 * `station` (brakeStation(), docs/sketch-studio-tight-bends.md §4.4): a line
 * that arrives on a made bend's line with an angle not above the bend's sets
 * the angle to 90° (to 180° for a bend at 90° or more), once, on arriving;
 * the line moving on before the angle is touched puts the angle it had back
 * (`arrived`: { from, set }, the spec's silence filled: a gauge edge clicked
 * at the last L may pass over a made line on the way to the one meant).
 * A new line along a made bend within half the V seats on it first (tight
 * bends §7.3, seatOf): the session's line is moved onto the bend's and
 * `seated` { number, off, from (the L asked for, gauge mode; else null) }
 * says so; a new line that does not seat clears it. A session that never
 * seated gains no key. A patch naming `seated` (Esc on a finger drag,
 * brakeHands.js fingerRestore) puts it back as it was.
 * Gauging off a flange (docs/sketch-studio-skin-gauge.md §4.5): in gauge mode
 * `distance` is what the backgauge reads off `stop`. A new line's stop is the
 * patch's own (writers of a flat distance name `stop: null`), else the held
 * one (`stopHold`, Gauge off), else the automatic rule (§4.4; a finger drag's
 * `dragStop`, a patch-only key, tried first); the seat and the arrival run on
 * the line that gives, and last the line is written canonical (its own stop,
 * the L the fingers read). A new edge, the mode or the points clear the hold.
 */
export function brakePatch(session, patch, station = null) {
  const newLine = ['edge', 'distance', 'points', 'mode'].some((k) => k in patch) && !('skip' in patch);
  const next = {
    ...session,
    // A new line keeps the tools' lengths (brake tool length §9.3): holdTools below.
    ...(newLine ? { skip: [], turned: false } : {}),
    ...patch,
  };
  if ('dragStop' in next) delete next.dragStop;
  // Which stop L is read from (skin gauge §4.5 steps 1, 2), before the line is
  // found: named, held (Gauge off), a finger drag's own, or automatic (§4.4).
  if (newLine) stopOfPatch(next, patch, session, station);
  // A bent line seats itself in the die (§7.4 (b)): before the arrival rule,
  // which then runs on the seated line as on an exact one; an etched mark's
  // patch names the angle too, and seats all the same.
  if (newLine && !('seated' in patch)) {
    const seat = station ? seatOf(station, next) : null;
    if (seat) {
      const from = next.mode === 'gauge' ? Number(next.distance) : null;
      Object.assign(next, seat.patch);
      next.seated = { number: seat.number, off: seat.off, from };
    } else if (next.seated) next.seated = null;
  }
  // The tools' lengths (brake tool length §9.4), on the line as it now stands.
  holdTools(next, patch, newLine, station);
  // An armed try (tight bends §5.2) was tried for this very hit: a new line, a
  // segment toggled, Flip sheet or another bend shape is another hit and
  // disarms it (the tooling, the angle and the lengths keep it, re-checked).
  // The note a part-way commit left goes with the next pick.
  if (
    next.armed &&
    !('armed' in patch) &&
    ['edge', 'distance', 'points', 'mode', 'skip', 'flip', 'shape'].some((k) => k in patch)
  )
    next.armed = null;
  if (next.notice && !('notice' in patch)) next.notice = null;
  if ('angle' in patch) {
    if (next.arrived) next.arrived = null;
  } else if (station?.fold && station.polygon && station.edges && (newLine || 'skip' in patch)) {
    const { arrived } = next;
    if (arrived) {
      if (Number(next.angle) === arrived.set) next.angle = arrived.from;
      next.arrived = null;
    }
    const made = madeLine(station.fold, station.polygon, sessionLine(station, next).line, next.skip || []);
    if (made && !made.error && !(Number(next.angle) > made.from + 1e-9)) {
      const set = made.from >= 90 - 1e-9 ? 180 : 90;
      next.arrived = { from: next.angle, set };
      next.angle = set;
    }
  }
  // Last, the line in its canonical form (skin gauge §4.5 step 4): the field
  // shows what the fingers read, after Bend on, the seat or Turn sheet around too.
  // Bend on names its segments (`skip`) with the line, and its stop: canonical as well.
  if (newLine || 'stop' in patch) canonicalStop(next, station);
  return next;
}

/**
 * The punch line a session picks (§9 SM-2): a gauge edge and L, or two
 * points. `station`: { polygon, edges } (brakeStation's). { edge, line,
 * gaugePoint } (line null while none is picked).
 */
export function sessionLine(station, session) {
  const { polygon, edges } = station;
  const edge = session.mode === 'gauge' && session.edge != null ? edges[session.edge] || null : null;
  let line = null;
  // L is what the backgauge reads (skin gauge §4.3): the line lies L plus the stop's take-up from the edge.
  if (edge) line = gaugeBendLine(polygon.outer, edge, flatDistance(station, session, edge));
  else if (session.mode === 'points' && session.points?.length === 2)
    line = { a: session.points[0], b: session.points[1] };
  return { edge, line, gaugePoint: edge ? [(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2] : null };
}

// ---------------------------------------------------------------- gauging off a flange (docs/sketch-studio-skin-gauge.md)
// The stops of a gauge edge and their take-ups, per fold object (§4.3): while
// one station stands, brakePatch, sessionLine and the station read them many
// times (a finger drag's every sample), and a fold is never changed in place.
const STOPS = new WeakMap();
function stopMemo(fold) {
  let memo = STOPS.get(fold);
  if (!memo) STOPS.set(fold, (memo = new Map()));
  return memo;
}
/** The made bends a gauge edge's fingers can stand against (pressBrake.js gaugeStops), nearest the edge first, with their bend numbers. */
export function edgeStops(fold, edge) {
  if (!fold?.bends?.length || !edge) return [];
  const memo = stopMemo(fold);
  const key = `stops|${edge.index}`;
  if (!memo.has(key))
    memo.set(
      key,
      gaugeStops(fold, edge).map((s) => ({ ...s, number: bendNumber(fold, s.bendId) })),
    );
  return memo.get(key);
}
// The take-up of the stop `bendId` (pressBrake.js stopTakeUp): 0 for the edge (null).
function takeUpOf(fold, edge, bendId, up) {
  if (bendId == null || !fold || !edge) return 0;
  const memo = stopMemo(fold);
  const key = `${edge.index}|${bendId}|${up ? 'up' : 'down'}`;
  if (!memo.has(key)) memo.set(key, stopTakeUp(fold, edge, bendId, { up }));
  return memo.get(key);
}
/** The session's stop as the fold has it (§4.3): a bend id the fold no longer has reads as the edge (null). */
export const sessionStop = (fold, session) =>
  session.stop != null && fold?.bends?.some((b) => b.id === session.stop) ? session.stop : null;
// Which side up a hit at flat `x` from the edge is made: a made bend's line
// there is bent on its own way up (tight bends §4.4), anything else as Flip sheet says.
function upAt(fold, edge, session, x) {
  const on = edgeStops(fold, edge).find((s) => Math.abs(s.d - x) <= MADE_LINE_TOLERANCE);
  const bend = on && fold.bends.find((b) => b.id === on.bendId);
  return bend ? bend.direction === 'up' : !session.flip;
}
/**
 * The punch line's flat distance from the gauge edge (§4.3): the session's L
 * plus the take-up of its stop (0 for the edge, or with no fold). The take-up
 * is for the side up the hit is made: Flip sheet's, or where the line lands on
 * a made bend's line (bent on), that bend's own.
 */
export function flatDistance(station, session, edge) {
  const L = Number(session.distance) || 0;
  const { fold } = station || {};
  const stop = sessionStop(fold, session);
  if (stop == null) return L;
  const up = !session.flip;
  const own = L + takeUpOf(fold, edge, stop, up);
  const other = L + takeUpOf(fold, edge, stop, !up);
  // A flange whose reading depends on the side up: the other way up only where a bend of that way is there to bend on.
  if (Math.abs(other - own) > 1e-9 && upAt(fold, edge, session, other) === !up) return other;
  return own;
}
/**
 * Whether stop `k` (0 the edge, k the flange of edge stop k) can make a line
 * at L (§4.4): the flat line L + takeUp(k) is beyond its own bend zone and
 * no farther than the next stop's bend plus the seat's reach (half the V;
 * that bend's half zone where nothing seats); the last stop has no limit.
 */
function stopFits(station, session, edge, L, k) {
  const { fold } = station;
  const stops = edgeStops(fold, edge);
  const own = k ? stops[k - 1] : null;
  const x = L + (own ? takeUpOf(fold, edge, own.bendId, !session.flip) : 0);
  const next = stops[k];
  const reach = seatReach(fold, session);
  if (own && x < own.d + own.half - 1e-6) return false;
  return !next || x <= next.d + (reach > 0 ? reach : next.half) + 1e-6;
}
/**
 * Which stop a typed L means (§4.4, automatic): the nearest stop that can
 * make the line, the edge when none can. `first` (a finger drag's stop,
 * §4.5): tried before the rest, so a drag stays on the stop it started on
 * while that stop makes the line. A bend id, or null (the edge).
 */
export function automaticStop(station, session, edge, L, first = undefined) {
  const stops = edgeStops(station.fold, edge);
  if (first !== undefined) {
    const k = first == null ? 0 : stops.findIndex((s) => s.bendId === first) + 1;
    if ((first == null || k > 0) && stopFits(station, session, edge, L, k)) return first ?? null;
  }
  for (let k = 0; k <= stops.length; k++)
    if (stopFits(station, session, edge, L, k)) return k ? stops[k - 1].bendId : null;
  return null;
}
// The stop the operator holds (§4.6): 'edge' → null, a bend the fold still has → its id, else none (undefined).
const heldStop = (fold, session) =>
  session.stopHold === 'edge'
    ? null
    : session.stopHold != null && fold?.bends?.some((b) => b.id === session.stopHold)
      ? session.stopHold
      : undefined;
/**
 * The line's own stop (§4.5 step 4): the made bend nearest the line among the
 * edge's stops strictly between the edge and it (its flange is what the
 * fingers meet), null when there is none (a line on bend 1 or in the first
 * face reads off the edge, as ever).
 */
export function lineStop(fold, edge, x) {
  const between = edgeStops(fold, edge).filter((s) => s.d < x - MADE_LINE_TOLERANCE);
  return between.length ? between.at(-1).bendId : null;
}
// The stop of a new line in gauge mode (§4.5 steps 1, 2): named (taken as
// given), held, a finger drag's, or automatic. Keys only where they change,
// so a session that never gauged off a flange gains none.
function stopOfPatch(next, patch, session, station) {
  // A new edge, the mode or the points put Gauge off back to automatic (§4.3).
  if (
    !('stopHold' in patch) &&
    next.stopHold != null &&
    (('edge' in patch && patch.edge !== session.edge) ||
      ('mode' in patch && patch.mode !== session.mode) ||
      'points' in patch)
  )
    next.stopHold = null;
  if (!station?.fold || !station.edges || next.mode !== 'gauge') return;
  const edge = next.edge != null ? station.edges[next.edge] || null : null;
  if (!edge || 'stop' in patch) return;
  const held = heldStop(station.fold, next);
  const L = Number(next.distance) || 0;
  const stop =
    held !== undefined ? held : automaticStop(station, next, edge, L, 'dragStop' in patch ? patch.dragStop : undefined);
  if (stop !== (next.stop ?? null)) next.stop = stop;
}
// The line written in its canonical form (§4.5 step 4): `stop` the line's own,
// `distance` what the fingers read off it; the flat line unchanged. Under a
// held stop the line has left, the held stop stays and the station refuses
// the hit in words (`gauge-stop`).
function canonicalStop(next, station) {
  if (!station?.fold || !station.edges || next.mode !== 'gauge' || next.edge == null) return;
  const edge = station.edges[next.edge];
  if (!edge) return;
  const { fold } = station;
  const x = flatDistance(station, next, edge);
  const held = heldStop(fold, next);
  const own = lineStop(fold, edge, x);
  const stop = held !== undefined ? held : own;
  if (stop === sessionStop(fold, next)) return;
  next.stop = stop;
  next.distance = exact(x - takeUpOf(fold, edge, stop, upAt(fold, edge, next, x)));
}
// A stop as the panel says it: "the edge", "bend 2's flange".
const stopWords = (fold, stop) => (stop == null ? 'the edge' : `bend ${bendNumber(fold, stop)}'s flange`);
/**
 * Gauge off a stop the line has left (§4.5 step 4, the builder's call): with a
 * held stop, the fingers read the line off another, so the field's L is not
 * what they read. A refusal with the one click that gauges off what they do
 * stop on (the same line), or null.
 */
function stopRefusal({ session, fold, gauge, edge }) {
  if (session.mode !== 'gauge' || !edge || session.stopHold == null) return null;
  const held = heldStop(fold, session);
  if (held === undefined) return null;
  const read = gauge.stop?.bendId ?? null;
  if (read === held) return null;
  const there = stopWords(fold, read);
  return {
    code: 'gauge-stop',
    message: `Gauged off ${stopWords(fold, held)}, L ${fmt(Number(session.distance) || 0)} mm does not reach this line: here the fingers stop on ${there}, at L ${fmt(gauge.distance)} mm. Gauge off ${there}, or set L again.`,
    fix: {
      label: `Gauge off ${there}`,
      session: { stopHold: read ?? 'edge', stop: read, distance: exact(gauge.distance) },
    },
  };
}
/**
 * The hint under the L field (§4.6): automatic took the edge, and the same L
 * would also make a line off a made flange (§4.4's test passes for a later
 * stop). { L, bendId, number, words, label } or null.
 */
function gaugeHint({ fold, session, edge, stops, pending }) {
  if (session.mode !== 'gauge' || session.stopHold != null || !stops.length || sessionStop(fold, session) != null)
    return null;
  // The L asked for: a line that seated on a bend was asked for at `seated.from`.
  const L = session.seated?.from ?? (Number(session.distance) || 0);
  const k = stops.findIndex((_, i) => stopFits({ fold }, session, edge, L, i + 1));
  if (k < 0) return null;
  const { bendId, number } = stops[k];
  const on = pending?.again?.number ?? null;
  return {
    L,
    bendId,
    number,
    words: `L ${fmt(L)} is from the edge, ${on != null ? `on bend ${on}'s line` : `inside bend ${stops[0].number}'s flange`}.`,
    label: `Gauge off bend ${number}'s flange`,
  };
}

// ---------------------------------------------------------------- bend on (docs/sketch-studio-tight-bends.md §4.4)
/** How near a punch line's segment ends must lie to a made bend's to be its line (§4.4: the same gauge edge and L do it). */
export const MADE_LINE_TOLERANCE = 0.05;
// A fold bend's material along its line, as flat point pairs.
const runsOf = (bend) =>
  bend.intervals.map((interval) => interval.map((s) => [bend.a[0] + bend.u[0] * s, bend.a[1] + bend.u[1] * s]));
const nearPoint = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= MADE_LINE_TOLERANCE;
const sameRun = ([p, q], [r, s]) => (nearPoint(p, r) && nearPoint(q, s)) || (nearPoint(p, s) && nearPoint(q, r));

/**
 * The made bends a punch line hits again (§4.4 (a)): `line` (less the
 * segments `skip`) lies on bends of `fold` made already, segment for segment,
 * every end within MADE_LINE_TOLERANCE, and covers each of them whole. A line
 * that crosses a bend, lies beside it or covers part of one is no bend's next
 * hit: null. Else { bendIds (fold order), from (the angle they stand at),
 * number (the brake's bend number: its first step's place), segments
 * ([[a, b]] flat), error (why it cannot be bent on, or absent) }.
 */
export function madeLine(fold, polygon, line, skip = []) {
  if (!line || !fold?.bends?.length) return null;
  const kept = lineSegments(polygon, line).filter((s) => !skip.includes(s.index));
  if (!kept.length) return null;
  const members = [];
  for (const segment of kept) {
    const owner = fold.bends.find((bend) => runsOf(bend).some((run) => sameRun(run, [segment.a, segment.b])));
    if (!owner) return null;
    if (!members.includes(owner)) members.push(owner);
  }
  if (members.some((bend) => !runsOf(bend).every((run) => kept.some((s) => sameRun(run, [s.a, s.b]))))) return null;
  members.sort((p, q) => fold.bends.indexOf(p) - fold.bends.indexOf(q));
  const from = members[0].angle;
  const number = bendNumber(fold, members[0].id);
  const made = { bendIds: members.map((b) => b.id), from, number, segments: members.flatMap(runsOf) };
  if (members.some(isRoundBend))
    return { ...made, error: 'A round bend is made in its own hits: it cannot be bent on.' };
  if (members.some((b) => Math.abs(b.angle - from) > 1e-6))
    return {
      ...made,
      error:
        'These flanges stand at different angles: bend them on one at a time. Click the others on the flat blank to leave them out.',
    };
  if (from >= 180 - 1e-9) return { ...made, error: `Bend ${number} is already at 180°: it cannot be bent further.` };
  return made;
}

/**
 * Bend on (§4.4 (b)): the session patch that puts the punch line on the bends
 * of the step `key` (a stroke of tabs is bent on as one hit): gauged off the
 * nearest straight edge parallel to it (L the flat distance), else two points
 * along it, every other segment the line crosses left out, the sheet the
 * right way round and the tooling fitted. null when no line finds them.
 */
export function bendOnPatch(station, key) {
  const { fold } = station;
  const step = fold ? stepOf(fold, key) : null;
  if (!step) return null;
  const ids = [...new Set(step.bendIds)];
  const members = ids.map((id) => fold.bends.find((b) => b.id === id)).filter(Boolean);
  if (!members.length) return null;
  const patch = lineOnBends(station, members);
  // A new line like any other (brake tool length §9.4): the tools' lengths stay.
  return patch ? { ...patch, turned: false, scrub: null } : null;
}

// The punch line put on made bends `members` (fold bends, §4.4 (b), shared by
// the seat, tight bends §7.4 (b)): { mode, edge, distance, skip } or { mode,
// points, skip }, every other segment the line crosses left out, or null.
// `mode` 'gauge' keeps the session's own `edge` (the operator chose it: the
// nearest edge may be on a face another bend cuts off from the gauge) when it
// is parallel and in front of the bend; 'points' two points along the bends,
// the first the end nearer `start` (the operator's point A stays A); none,
// the search Bend on has always made.
function lineOnBends(station, members, { edge = null, mode = null, start = null } = {}) {
  const { fold, polygon, edges } = station;
  const ids = members.map((b) => b.id);
  const fit = (line) => {
    const skip = lineSegments(polygon, line)
      .filter((s) => !members.some((b) => runsOf(b).some((run) => sameRun(run, [s.a, s.b]))))
      .map((s) => s.index);
    const made = madeLine(fold, polygon, line, skip);
    return made && made.bendIds.length === ids.length && ids.every((id) => made.bendIds.includes(id)) ? skip : null;
  };
  const [first] = members;
  if (mode !== 'points') {
    const parallel = (e) => Math.abs(e.d[0] * first.u[1] - e.d[1] * first.u[0]) < 1e-6;
    const gauged = (mode === 'gauge' ? (edge ? [edge] : []) : edges || [])
      .filter(parallel)
      .map((e) => ({
        edge: e,
        distance: exact((first.a[0] - e.a[0]) * e.inward[0] + (first.a[1] - e.a[1]) * e.inward[1]),
      }))
      .filter((g) => g.distance > 1e-6)
      .sort((p, q) => p.distance - q.distance);
    for (const { edge: e, distance } of gauged) {
      const skip = fit(gaugeBendLine(polygon.outer, e, distance));
      // A flat distance (skin gauge §4.5 step 1): from the edge, where the edge has stops to tell it from.
      if (skip)
        return { mode: 'gauge', edge: e.index, distance, skip, ...(edgeStops(fold, e).length ? { stop: null } : {}) };
    }
    if (mode === 'gauge') return null;
  }
  const along = members.flatMap((b) =>
    b.intervals.flat().map((s) => {
      const p = [b.a[0] + b.u[0] * s, b.a[1] + b.u[1] * s];
      return (p[0] - first.a[0]) * first.u[0] + (p[1] - first.a[1]) * first.u[1];
    }),
  );
  const point = (s) => [exact(first.a[0] + first.u[0] * s), exact(first.a[1] + first.u[1] * s)];
  const points = [point(Math.min(...along)), point(Math.max(...along))];
  const gap = (p) => Math.hypot(p[0] - start[0], p[1] - start[1]);
  if (start && gap(points[1]) < gap(points[0])) points.reverse();
  const skip = fit({ a: points[0], b: points[1] });
  return skip ? { mode: 'points', points, skip } : null;
}

/**
 * The step a made bend is bent on from (tight bends §7.4 (c)): the key of its
 * last step, as the sequence row's Bend on button has it (every bend of that
 * step sharp and under 180°, none of them hit again later); null when the
 * bend is round, at 180° or not on the part.
 */
export function bendOnKey(fold, bendId) {
  const steps = hitSequence(fold);
  const at = steps.findLastIndex((s) => s.bendIds.includes(bendId));
  if (at < 0) return null;
  const step = steps[at];
  const members = step.bendIds.map((id) => fold.bends.find((b) => b.id === id));
  if (!members.every((b) => b && !isRoundBend(b) && b.angle < 180 - 1e-9)) return null;
  if (steps.slice(at + 1).some((later) => later.bendIds.some((id) => step.bendIds.includes(id)))) return null;
  return step.key;
}

// ---------------------------------------------------------------- the seat (docs/sketch-studio-tight-bends.md §7)
// How far each end of a made bend's material lies from the infinite line a → b (mm).
const offLine = ({ a, b }) => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  return (bend) =>
    Math.max(
      ...runsOf(bend)
        .flat()
        .map((p) => Math.abs((p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1])),
    );
};

/**
 * How far a line seats on a made bend (§7.4 (b)): half the V of the hit's die
 * (the session's, else the automatic one). 0 (no seat) for a round bend, by
 * radius punch or bump hits: its die and its zone are another size.
 */
export function seatReach(fold, session) {
  if (session.shape === 'round' || punchOf(session.punch).round) return 0;
  const die = session.die ? DIES[session.die] : suggestedDie(fold.thickness, session.punch).die;
  return die ? die.v / 2 : 0;
}

/**
 * The made bends a punch line lies along (§7.4 (b)): every end of every run
 * of a bend within `reach` (mm, or a function of the bend) of the infinite
 * line through line.a, line.b, and one of its runs overlapping a kept segment
 * of the line (lineSegments less `skip`) along it. The nearest wins (its
 * farthest end the nearest; ties in fold order) with the bends collinear with
 * it (every end within MADE_LINE_TOLERANCE of its line). null, or { bendIds
 * (fold order), bendId (the nearest's), number (its bend number), off (mm, its
 * farthest end from the line), whole (every kept segment of the line overlaps
 * a run of those bends: the line crosses no piece they do not bend) }.
 */
export function bendAlong(fold, polygon, line, skip = [], reach = 0) {
  if (!line || !fold?.bends?.length) return null;
  const length = Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]);
  if (!(length > 1e-6)) return null;
  const u = [(line.b[0] - line.a[0]) / length, (line.b[1] - line.a[1]) / length];
  const at = (p) => (p[0] - line.a[0]) * u[0] + (p[1] - line.a[1]) * u[1];
  const kept = lineSegments(polygon, line)
    .filter((s) => !skip.includes(s.index))
    .map((s) => [Math.min(at(s.a), at(s.b)), Math.max(at(s.a), at(s.b))]);
  const off = offLine(line);
  // A run of `bend` and the kept segment [s0, s1] share more than a point along the line.
  const meets = (bend, [s0, s1]) =>
    runsOf(bend).some(([p, q]) => Math.min(Math.max(at(p), at(q)), s1) - Math.max(Math.min(at(p), at(q)), s0) > 1e-6);
  const candidates = [];
  for (const bend of fold.bends) {
    const far = off(bend);
    const limit = typeof reach === 'function' ? reach(bend) : reach;
    if (!(far <= limit + 1e-6)) continue;
    if (kept.some((segment) => meets(bend, segment))) candidates.push({ bend, far });
  }
  if (!candidates.length) return null;
  const nearest = candidates.reduce((best, c) => (c.far < best.far - 1e-9 ? c : best));
  const own = nearest.bend;
  const onIts = offLine({ a: own.a, b: [own.a[0] + own.u[0], own.a[1] + own.u[1]] });
  const members = candidates.filter((c) => onIts(c.bend) <= MADE_LINE_TOLERANCE).map((c) => c.bend);
  return {
    bendIds: members.map((b) => b.id),
    bendId: own.id,
    number: bendNumber(fold, own.id),
    off: nearest.far,
    // Every kept segment lies on the members' material: no unbent piece on the line (the seat's condition).
    whole: kept.every((segment) => members.some((bend) => meets(bend, segment))),
  };
}

/**
 * The seat (§7.3, §7.4 (b)): a session's punch line lying along a made bend
 * within seatReach IS that bend's line. null when there is no line, when it
 * is on a made line already (madeLine answers, with or without its error:
 * nothing to move), when the hit does not seat (seatReach 0), when no bend lies
 * along it, or when the line also crosses material those bends do not bend
 * (a made tab and an unbent one on the same line: the operator's line, its
 * segment toggles kept, goes to the station's net); else { number, off, patch } — the patch that puts the line on the
 * bend ({ mode, edge, distance, skip } off the session's own edge, or { mode,
 * points, skip }), given only when madeLine answers on the line it makes.
 * `station`: brakeStation()'s { fold, polygon, edges }.
 */
export function seatOf(station, session) {
  const { fold, polygon, edges } = station || {};
  if (!fold?.bends?.length || !polygon || !edges) return null;
  const { edge, line } = sessionLine(station, session);
  if (!line) return null;
  const skip = session.skip || [];
  if (madeLine(fold, polygon, line, skip)) return null;
  const reach = seatReach(fold, session);
  if (!(reach > 0)) return null;
  const along = bendAlong(fold, polygon, line, skip, reach);
  // No makeable bend is lost (§7.3): the whole line must be the bends' line.
  if (!along?.whole) return null;
  const members = along.bendIds.map((id) => fold.bends.find((b) => b.id === id));
  const patch = lineOnBends(station, members, { edge, mode: session.mode, start: session.points?.[0] || null });
  if (!patch) return null;
  const moved = sessionLine(station, { ...session, ...patch }).line;
  if (!madeLine(fold, polygon, moved, patch.skip)) return null;
  return { number: along.number, off: along.off, patch };
}

// The refusal a new line gets from the fold when it lies along or across a
// made bend (§7.4 (c)): the fold's "Bend j crosses bend i." in the brake's
// words, the made bend by its step number, with `seat` (Bend {n} on instead)
// where it lies along one that can be bent on. null for any other fold error.
function crossingRefusal(error, { fold, line, segments }) {
  const crossing = error?.crossing;
  const bend = crossing && crossing.bend === fold.bends.length ? fold.bends[crossing.other] : null;
  if (!bend) return null;
  const n = bendNumber(fold, bend.id);
  const off = offLine(line)(bend);
  const key = bendOnKey(fold, bend.id);
  if (!crossing.along)
    return {
      error: `This line runs across bend ${n}, which is already made: the brake cannot bend across a formed bend.${segments.length > 1 ? ' Click that piece on the flat blank to leave it out of this hit.' : ''}`,
    };
  return {
    error:
      off > MADE_LINE_TOLERANCE
        ? `This line is ${fmt(off)} mm from bend ${n}'s line: too close for a new bend.${key ? ` To bend bend ${n} further, bend it on.` : ''}`
        : `This line is bend ${n}'s line, but the pieces in this hit are not the ones bend ${n} bends: a made bend is bent on whole, and nothing else with it.${segments.length > 1 ? ' Click a piece on the flat blank to leave it out of this hit.' : ''}`,
    ...(key ? { seat: { key, number: n, off, label: `Bend ${n} on instead` } } : {}),
  };
}

/** Reverse punch applies: the session's punch is not its own mirror image. */
export const punchReversed = (session) => Boolean(session.reverse) && !punchSymmetric(punchOf(session.punch));

/**
 * The shop-order rule (§9 SM-2 item 9): what keeps a part off the brake, its
 * paint and prints. The part is one definition, so every instance of it
 * counts. Returns null, or { finishes, prints } (the rows), a message and the
 * model with them removed.
 */
export function shopOrderBlock(model, partId) {
  const ids = new Set(model.instances.filter((i) => i.partId === partId).map((i) => i.id));
  const finishes = (model.finishes || []).filter((f) => ids.has(f.instanceId));
  const prints = (model.prints || []).filter((p) => ids.has(p.instanceId));
  if (!finishes.length && !prints.length) return null;
  // "2 paint finishes", not "finishs" (a part made twice and painted, SF-4's kiosk face frames).
  const counted = (n, one) => `${n} ${one}${n === 1 ? '' : one.endsWith('sh') ? 'es' : 's'}`;
  const done = [
    finishes.length && (finishes.length === 1 ? 'a paint finish' : counted(finishes.length, 'paint finish')),
    prints.length && counted(prints.length, 'print'),
  ].filter(Boolean);
  const list = done.length > 1 ? `${done.slice(0, -1).join(', ')} and ${done.at(-1)}` : done[0];
  return {
    finishes,
    prints,
    message: `This part already has ${list}. Shop order is cut → bend → paint → print: it cannot go back on the press brake until they are removed.`,
    remedy: `Remove ${list} and bend`,
    model: {
      ...model,
      finishes: (model.finishes || []).filter((f) => !finishes.includes(f)),
      prints: (model.prints || []).filter((p) => !prints.includes(p)),
    },
  };
}

/**
 * What one instance has had done to it after the brake (shop floor §8.1, the
 * SF-4 audit): its own finish and prints, and the other copies of its part —
 * shopOrderBlock counts the part's records, every copy's together, which the
 * instance alone does not carry. { finish (name or colour, or null),
 * finishKind, prints, copies: [names of the other instances of the part] }.
 */
export function finishedHere(model, instanceId) {
  const instance = model.instances.find((i) => i.id === instanceId);
  const finish = (model.finishes || []).find((f) => f.instanceId === instanceId);
  return {
    finish: finish ? finish.name || finish.colour || 'painted' : null,
    finishKind: finish?.kind || null,
    prints: (model.prints || []).filter((p) => p.instanceId === instanceId).length,
    copies: model.instances
      .filter((i) => i.partId === instance?.partId && i.id !== instanceId)
      .map((i) => nodeName(model, i.id)),
  };
}

// ---------------------------------------------------------------- the sheet's thickness (corner gaps §5)
// Where a flange's metal ends inside another's at the end of a stroke. The
// stroke itself is checked on the mid-surface (brakeCollisions); its end pose
// once more at the sheet's true thickness (cornerGaps.js foldOverlaps), so a
// flange may no longer end up to t/2 inside another unseen. A fact of the
// part's outline, not of the order, the angle or the tooling: no remedy is
// tried for it (the card says where the outline is changed).
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// The blank as polygons, for the end faces when the caller has no profile
// (sequenceChecks({ fold, machine })): its straight edges are the outline's, a
// curve's chords among them (only the depth in the message reads them).
const blankProfile = (fold) => ({
  type: 'polygon',
  points: fold.blank.outer,
  holes: (fold.blank.holes || []).map((points) => ({ type: 'polygon', points })),
});
/**
 * The end of a stroke at the sheet's true thickness (docs/sketch-studio-
 * corner-gaps.md §5): `fold` (unposed), `bendIds`, `angles` (the other bends'),
 * `target`, `start`, `number`, `die`, `machine`, `gaugePoint`, `turned` as
 * brakeCollisions takes them. The pose: this stroke's bends at `target` (a
 * bend-on step's part-way angle; default the bend's), the others at `angles`
 * or as made. foldOverlaps with `moved` the pieces this stroke carries. null
 * when clear, else a hit { tool: 'part', thickness: true, phase: 'end',
 * angle, owner, pieces ([the piece whose end runs in, the other]), bends
 * (their bend numbers at the brake, null: the base), depth (mm, from the facing
 * row of flangeGaps on that pose; null when no row faces), triangles (the two
 * pieces' sheet faces in the machine frame, for showHit), message, ms; a round
 * bend's: bump / bumps its last hit, where the view shows it }. `profile` /
 * `params`: the blank's, for the end faces of the depth (default: the blank as
 * polygons).
 */
export function thicknessHit({
  fold,
  bendId = null,
  bendIds = null,
  angles = {},
  target = null,
  start = 0,
  number = null,
  machine,
  die,
  gaugePoint = null,
  turned = false,
  profile = null,
  params = {},
}) {
  const started = nowMs();
  const ids = bendIds?.length ? bendIds : [bendId];
  const bend = fold.bends.find((b) => b.id === ids[0]);
  if (!bend) throw new Error(`Unknown bend: ${ids[0]}`);
  const goal = target ?? bend.angle;
  const from = bend.steps ? machineFrom(fold, ids, { gaugePoint, turned }) : null;
  const posed = poseFold(fold, { ...angles, ...Object.fromEntries(ids.map((id) => [id, goal])) }, from);
  const members = new Set(ids);
  const moved = posed.pieces.filter((p) => p.path.some((id) => members.has(id))).map((p) => p.id);
  const found = foldOverlaps(posed, { moved });
  if (!found.length) return null;
  // The depth from the row facing it (an end run into a face), the deepest of the pairs.
  const { rows } = flangeGaps(posed, profile || blankProfile(fold), profile ? params : {});
  const carried = new Set(moved);
  const read = found.map((overlap) => {
    const [p, q] = overlap.pieces;
    const row =
      rows
        .filter((r) => r.overlap && ((r.a.piece === p && r.b.piece === q) || (r.a.piece === q && r.b.piece === p)))
        .sort((x, y) => x.gap - y.gap)[0] || null;
    // The end that runs in, then the other: the row's way, else the piece this stroke carries first.
    const order = row ? [row.a.piece, row.b.piece] : carried.has(p) ? [p, q] : [q, p];
    return { order, depth: row ? -row.gap : null };
  });
  const chosen = read.reduce((best, r) => ((r.depth ?? -1) > (best.depth ?? -1) ? r : best), read[0]);
  const strokes = hitSequence(fold);
  const pieceOf = (id) => posed.pieces.find((p) => p.id === id);
  const ownBend = (id) => pieceOf(id).path.at(-1) ?? null;
  const numberOf = (bendRef) =>
    bendRef == null
      ? null
      : strokes.findIndex((s) => s.bendIds.includes(bendRef)) + 1 || fold.bends.find((b) => b.id === bendRef).index + 1;
  const [inner, outer] = chosen.order;
  // "the flange" (this stroke's, running in), else "bend 5's flange" (this one's too, when run into) / "the base".
  const named = (id, subject) => {
    const own = ownBend(id);
    if (subject && own != null && members.has(own)) return 'the flange';
    return own == null ? 'the base' : `bend ${numberOf(own)}'s flange`;
  };
  const press = typeof machine === 'string' || machine == null ? machineOf(machine) : machine;
  const dieEntry = typeof die === 'string' ? dieOf(die) : die || suggestedDie(fold.thickness).die;
  const frame = brakeFrame(posed, ids[0], {
    die: dieEntry,
    gaugePoint,
    turned,
    members: ids,
    hit: bend.steps || null,
    bed: press.bed,
  });
  // Both sheet faces of the two pieces, as the part is drawn in the machine.
  const triangles = [inner, outer].flatMap((id) => {
    const piece = pieceOf(id);
    return [0, fold.thickness].flatMap((z) =>
      pieceTriangles(piece).map((tri) =>
        tri.map(([x, y]) => transformPoint(frame.matrix, transformPoint(piece.matrix, [x, y, z]))),
      ),
    );
  });
  const prefix = hitName({ fold, bendIds: ids, number, start, target: goal, strokes });
  const depth = chosen.depth;
  const how = depth != null ? `ends ${depth.toFixed(2)} mm inside` : 'ends inside';
  return {
    tool: 'part',
    thickness: true,
    phase: 'end',
    angle: goal,
    owner: inner,
    pieces: [inner, outer],
    bends: [numberOf(ownBend(inner)), numberOf(ownBend(outer))],
    depth,
    triangles,
    ...(bend.steps ? { bump: bend.steps, bumps: bend.steps } : {}),
    message: `${prefix}: ${named(inner, true)} ${how} ${named(outer, false)} (the sheet is ${Number(fold.thickness.toFixed(2))} mm thick). Give that gap 0 mm or more in the part's Sheet metal panel.`,
    ms: nowMs() - started,
  };
}

// A collision, and whether the sheet turned around (the other side to the back) clears.
// `thickness` (corner gaps §5): a stroke otherwise clear is checked at its end
// at the sheet's true thickness (thicknessHit); the candidate searches (a
// remedy being tried) leave it out. A thickness hit is cured by no turn.
function collision(options, { thickness = true, profile = null, params = {} } = {}) {
  const result = brakeCollisions(options);
  if (!result.hit) {
    const inside = thickness ? thicknessHit({ ...options, profile, params }) : null;
    if (!inside) return { ...result, turnedClears: false };
    return { ...result, hit: inside, takeOff: null, turnedClears: false, ms: result.ms + inside.ms };
  }
  const turned = brakeCollisions({ ...options, turned: !options.turned, advise: false });
  return { ...result, turnedClears: !turned.hit, ms: result.ms + turned.ms };
}

/** The pending hit's warning when the part stands over the horn sections (docs/sketch-studio-punch-library.md §4.3). */
export const HOOKED =
  'The part stands over the horns: slide it onto them under the punch, and off again along the punch (or spring it off). The brake checks the stroke, not that.';
// A session trim that is set: a number other than 0 (null, '' and 0 are fitted).
const trimSet = (value) => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) !== 0;
const mid = (edge) => [(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2];
const exact = (value) => Math.round(value * 1e6) / 1e6;
const fmt = (value) => Number(value.toFixed(2)).toString();
// A message's first sentence: the fact, without its remedy (ShopFloor.jsx splitMessage's rule).
const factOf = (message) => {
  const at = String(message).search(/[.:;] (?=[A-Z])/);
  return at < 0 ? String(message) : message.slice(0, at + 1);
};
const TURNED_GAUGE =
  'Turned around: the gauge edge faces the operator, and no straight edge opposite it can go to the backgauge.';

/**
 * The gauge edge across the punch line from `edge` (brake flip tooling §5.2):
 * parallel to it, facing the other way, the line `point` inside it. Of
 * several (a stepped outline) the farthest: the one the fingers meet.
 * { edge, distance (L from it to the same line) } or null.
 */
export function oppositeEdge(edges, edge, point) {
  let best = null;
  for (const e of edges) {
    if (e === edge || Math.abs(e.d[0] * edge.d[1] - e.d[1] * edge.d[0]) > 1e-6) continue;
    if (e.inward[0] * edge.inward[0] + e.inward[1] * edge.inward[1] > 0) continue;
    const distance = (point[0] - e.a[0]) * e.inward[0] + (point[1] - e.a[1]) * e.inward[1];
    if (distance > 1e-6 && (!best || distance > best.distance)) best = { edge: e, distance };
  }
  return best;
}

/**
 * Turn sheet around (§5.2): the session patch that puts the other side of the
 * same punch line to the backgauge. With a gauge edge picked: the opposite
 * parallel edge and L from it to the same line (the same hit, the other way
 * round); with no such edge, or a two-point line, `turned` toggles, which the
 * pending check, the pose and the stroke use. `station`: brakeStation().
 */
export function turnAround(station, session) {
  const { edges, edge } = station;
  if (session.mode === 'gauge' && edge) {
    // The line where it lies on the flat blank (skin gauge §4.3), L from its stop.
    const L = flatDistance(station, session, edge);
    const point = [edge.a[0] + edge.inward[0] * L, edge.a[1] + edge.inward[1] * L];
    const opposite = !session.turned && oppositeEdge(edges || [], edge, point);
    // A flat distance from the opposite edge (§4.5 step 1): named so, where a stop could be meant.
    const flat = (session.stop ?? null) !== null || edgeStops(station.fold, opposite?.edge).length;
    if (opposite)
      return {
        edge: opposite.edge.index,
        distance: exact(opposite.distance),
        turned: false,
        ...(flat ? { stop: null } : {}),
      };
  }
  return { turned: !session.turned };
}

/**
 * The bend-to-bend spacing of an offset (§5.3): two bends of `angle` (deg),
 * inside `radius`, allowance BA, sheet `thickness`, making a step `offset`
 * between the two faces on the same side of the sheet. ρ = r + t/2 (the
 * mid-surface); web w = (offset − 2ρ(1 − cos a)) / sin a (the flat between
 * the two bend zones); spacing = w + BA (punch line to punch line, flat).
 */
export function offsetSpacing({ offset, angle, radius, allowance, thickness }) {
  const a = (angle * Math.PI) / 180;
  const rho = radius + thickness / 2;
  const web = (offset - 2 * rho * (1 - Math.cos(a))) / Math.sin(a);
  return { web, spacing: web + allowance, rho };
}
/**
 * The smallest value from `from` up at which `clears(value)` holds, found by
 * trying (§5.3, §5.4: what limits it is the die's leg and its body, the bed
 * and the die's height, so no formula): steps growing from `step`, then
 * halving down to `tolerance`. { value (one that was tried and clears), low
 * (the last tried below it that did not) } or null.
 */
function smallestClearing(clears, from, { step = 0.5, tries = 8, tolerance = 0.02 } = {}) {
  let low = from,
    high = null;
  for (let k = 0, size = step; k < tries; k++, size *= 2) {
    const value = from + size;
    if (clears(value)) {
      high = value;
      break;
    }
    low = value;
  }
  if (high == null) return null;
  while (high - low > tolerance) {
    const middle = (low + high) / 2;
    if (clears(middle)) high = middle;
    else low = middle;
  }
  return { value: high, low };
}
// What the panel says: the first tenth of a mm past the last value that
// failed, up to the one found, that clears when tried; else the one found.
const tenthUp = (clears, { value, low }) => {
  for (let tenth = Math.floor(low * 10 + 1e-9) + 1; tenth / 10 <= value + 1e-9; tenth++)
    if (clears(tenth / 10)) return tenth / 10;
  return value;
};

// A collision with the punch, its holders or the ram tried with the other
// punches (brake blades §4.3), offered as one click only when the hit really
// passes with it. A punch or holder hit (docs/sketch-studio-shop-punches.md
// §5.4) tries the punch in the machine turned round first (the smallest
// change), then every other sharp punch not blunter than the hit's die, in
// rack order (RACK_ORDER: the shop's own first), each with its room toward
// the operator first, then reversed. A ram hit (brake tool length §3.6) tries
// every taller punch instead: the straight-flanked ones of the same angle
// that stand the ram higher, the lowest first (a reversed punch first tried
// turned back round). { fix (null when none passes), tried: what was tried
// and does not pass, in words for the card ("turning the punch round", "the
// gooseneck punch", "the gooseneck punch reversed", "the gooseneck punch
// either way round"; past two punches one item, "every other punch in the
// rack" / "every taller punch in the rack", with ", either way round" when
// any of them was tried both ways) }. `ramStill`: the tallest was tried and
// still meets the ram (no punch in the list holds it high enough).
//
// A quicker card (docs/sketch-studio-shop-punches.md §6.5): `check` is the
// station's own collision check of the pending hit (brakeCollisions' options:
// the fold, bends, other angles, start and target, die, gauge side, turned,
// surface). A candidate that forms the same inside radius as the punch in the
// machine with the hit's die (airBendRadius: the fold is then the same) is
// first checked there with only its punch and way round changed; a hit there
// is the station run's own collision, so it fails with no station run. Clear,
// or another radius, the station run decides, as before.
const labelOf = (p) => ({ key: p.key, label: PUNCH_LABELS[p.key] || `Use the ${p.name} punch` });
// A punch as the card names it: "the A 101 punch" (its label without "Use").
const punchWords = (key) => labelOf(punchOf(key)).label.replace(/^Use /, '');
const tallerPunches = (session) => {
  const own = punchOf(session.punch);
  return RACK_ORDER.map((key) => PUNCHES[key])
    .filter((p) => !p.round && p.angle === own.angle && p.height > own.height + 1e-9)
    .sort((a, b) => a.height - b.height)
    .map(labelOf);
};
// The rack's other sharp punches for a punch or holder hit (§5.4), in rack order.
const rackPunches = (session, die) =>
  RACK_ORDER.map((key) => PUNCHES[key])
    .filter((p) => !p.round && p.key !== session.punch && !(die && p.angle > die.angle + 1e-9))
    .map(labelOf);
function punchFix({ model, session, params, hit, die = null, check = null }) {
  const ram = hit?.tool === 'ram';
  const tool = hit?.tool === 'punch' || hit?.tool === 'holder';
  const candidates = ram ? tallerPunches(session) : tool ? rackPunches(session, die) : [];
  const own = punchOf(session.punch);
  // The punch in the machine turned round: un-reversed as ever; for a punch or
  // holder hit an asymmetric one not reversed is also tried reversed (§5.4).
  const turnOwn = punchReversed(session) || (tool && !own.round && !punchSymmetric(own));
  if (!candidates.length && (ram || !turnOwn)) return { fix: null, tried: [], ramStill: ram };
  const nameOf = (c) => c.label.replace(/^Use the /, 'the ');
  const tries = [
    ...(turnOwn ? [[session.punch, !punchReversed(session), null]] : []),
    ...candidates.flatMap((c) =>
      (punchSymmetric(punchOf(c.key)) ? [false] : [false, true]).map((reverse) => [c.key, reverse, c]),
    ),
  ];
  // A punch tried both ways and passing neither: one item, "… either way round".
  const eitherWay = (list) => {
    let tried = list;
    for (const c of candidates) {
      const name = nameOf(c);
      if (tried.includes(name) && tried.includes(`${name} reversed`))
        tried = [...tried.filter((f) => f !== name && f !== `${name} reversed`), `${name} either way round`];
    }
    return tried;
  };
  const failed = [];
  // The punches tried and not passing, and whether any was tried both ways.
  const missed = new Set();
  let bothWays = false;
  const tallest = candidates.at(-1);
  let ramStill = ram;
  // §6.5: the inside radius the punch in the machine forms with the hit's die (null: no shortcut).
  const formed = (punch) => airBendRadius(stockOf(check.fold.stock), check.fold.thickness, punch, check.die).radius;
  const ownRadius = check?.fold && check.die ? formed(own) : null;
  for (const [key, reverse, c] of tries) {
    const same = key === session.punch;
    const patch = { ...punchChoice(session, key), reverse };
    const candidate = punchOf(key);
    const quick =
      ownRadius != null && Math.abs(formed(candidate) - ownRadius) < 1e-9
        ? brakeCollisions({
            ...check,
            punch: key,
            reverse: reverse && !punchSymmetric(candidate),
            advise: false,
          }).hit
        : null;
    const { pending } = quick
      ? { pending: { refusals: [], collision: { hit: quick } } }
      : brakeStation({ model, session: { ...session, ...patch }, params, advise: false, thickness: false });
    if (!pending || pending.error || pending.refusals.length || pending.collision?.hit) {
      const name = c ? nameOf(c) : null;
      const what = same ? 'turning the punch round' : reverse ? `${name} reversed` : name;
      if (!failed.includes(what)) failed.push(what);
      if (c) missed.add(c.key);
      if (c && reverse) bothWays = true;
      // Every way the tallest was tried must still meet the ram to say none holds it high enough.
      if (c === tallest && pending?.collision?.hit?.tool !== 'ram') ramStill = false;
      continue;
    }
    return {
      fix: {
        label: same ? 'Turn the punch round' : reverse ? `${c.label}, reversed` : c.label,
        session: patch,
      },
      tried: summarised(eitherWay(failed), candidates, missed, bothWays, { ram, all: false }),
      ramStill: false,
    };
  }
  return {
    fix: null,
    tried: summarised(eitherWay(failed), candidates, missed, bothWays, { ram, all: true }),
    ramStill,
  };
}
// What was tried, in words (§5.4): one or two punches named, as they were
// tried; past two, one item for them. `all`: every candidate was tried (no
// punch passed): "every other punch in the rack" (a ram hit: "every taller
// punch in the rack"); a fix found after more than two: "{n} other punches in
// the rack" (the ones before it), so the words never claim more than was tried.
function summarised(tried, candidates, missed, bothWays, { ram, all }) {
  if (missed.size <= 2) return tried;
  const names = new Set(candidates.filter((c) => missed.has(c.key)).map((c) => c.label.replace(/^Use the /, 'the ')));
  const rest = tried.filter((f) => ![...names].some((n) => f === n || f.startsWith(`${n} `)));
  const punches = all
    ? ram
      ? 'every taller punch in the rack'
      : 'every other punch in the rack'
    : `${missed.size} ${ram ? 'taller' : 'other'} punches in the rack`;
  return [...rest, `${punches}${bothWays ? ', either way round' : ''}`];
}

// The patch that sets a tool's trim (§3.4): fitted is null.
const trimKey = { punch: 'punchTrim', die: 'dieTrim' };
// Every part triangle of a contact `hit` lies, along the bed, within `spare`
// mm of an end of the runs the tool stood over (`hit.runs`, machine X), or
// beside them: the contact is at the tool's ends (brake tool length §3.5).
function contactAtEnds(hit, spare) {
  if (!(hit.runs || []).length) return false;
  return hit.triangles.every((triangle) => {
    const xs = triangle.map((p) => p[0]);
    const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
    return hit.runs.every(([x0, x1]) => {
      const a = Math.max(lo, x0),
        b = Math.min(hi, x1);
      return b < a || b <= x0 + spare + 1e-6 || a >= x1 - spare - 1e-6;
    });
  });
}
/**
 * The session's `horns` value for a horn (docs/sketch-studio-punch-library.md
 * §4.8): `true` for the standard (as the checkbox and the PL-1 card set it),
 * else the horn's key, its reach.
 */
export const hornSetting = (horn) => (horn === HORNS[20] ? true : horn.reach);
/**
 * Horn sections tried (docs/sketch-studio-punch-library.md §4.4, §4.8): a
 * contact with the punch or its holders at the punch's ends, a punch that
 * takes horns. Without horns, every horn, shortest first; with horns on, the
 * longer ones. Each is tried only when the contact lies within its reach of
 * the ends (contactAtEnds), and the first whose hit passes every check is
 * offered as one click. { label, session } or null.
 */
function hornFix({ model, session, params, hit }) {
  if (punchOf(session.punch).round) return null;
  if (!(hit?.tool === 'punch' || hit?.tool === 'holder')) return null;
  const now = hornOf(session.horns);
  for (const key of HORN_KEYS) {
    const horn = HORNS[key];
    if (now && horn.reach <= now.reach) continue;
    if (!contactAtEnds(hit, horn.reach)) continue;
    const value = hornSetting(horn);
    const tried = brakeStation({
      model,
      session: { ...session, horns: value },
      params,
      advise: false,
      thickness: false,
    }).pending;
    if (tried && !tried.error && !tried.refusals.length && !tried.collision?.hit)
      return {
        label: value === true ? 'Use horn sections at the ends' : `Use ${horn.reach} mm horn sections at the ends`,
        session: { horns: value },
      };
  }
  return null;
}
// The shorter tools tried for a contact at a tool's ends (§3.5), mm off each end.
const SHORTER_TRIMS = [5, 10, 20, 40];
/**
 * A collision with the punch, its holders or the die tried with that tool
 * fitted or shorter (brake tool length §3.5): a tool longer than the bend is
 * first tried fitted; else the trims SHORTER_TRIMS that keep it over half the
 * bend and every section at least SHORTEST_SECTION, only when every contact
 * lies within the ends a shorter tool leaves bare (elsewhere none could
 * clear). A shorter tool is a part of a longer one, so the shortest is tried
 * first: when it still collides, none clears. { kind ('punch' | 'die'), fix
 * ({ label, session }) or null, tried (what was tried and does not clear, in
 * words), none (nothing to try) }.
 */
function lengthFix({ model, session, params, pending }) {
  const hit = pending.collision?.hit;
  const kind = hit?.tool === 'punch' || hit?.tool === 'holder' ? 'punch' : hit?.tool === 'die' ? 'die' : null;
  if (!kind || !pending.tooling) return { kind, fix: null, tried: [] };
  const key = trimKey[kind];
  const now = Number(session[key]) || 0;
  const passes = (trim) => {
    const tried = brakeStation({
      model,
      session: { ...session, [key]: trim },
      params,
      advise: false,
      thickness: false,
    }).pending;
    return Boolean(tried && !tried.error && !tried.refusals.length && !tried.collision?.hit);
  };
  if (now < 0)
    return passes(null)
      ? { kind, fix: { label: `Fit the ${kind} to the bend`, session: { [key]: null } }, tried: [] }
      : { kind, fix: null, tried: [`the ${kind} fitted to the bend`] };
  const { fitted, bent } = pending.tooling;
  const bend = bent.flat().reduce((sum, [a, b]) => sum + (b - a), 0);
  const allowed = SHORTER_TRIMS.filter((trim) => {
    if (trim <= now + 1e-9) return false;
    const runs = fitted.map(([a, b]) => [a + trim, b - trim]);
    if (runs.some(([a, b]) => b - a < SHORTEST_SECTION - 1e-9)) return false;
    const under = runs.reduce(
      (sum, [a, b]) => sum + bent.flat().reduce((s, [c, d]) => s + Math.max(0, Math.min(b, d) - Math.max(a, c)), 0),
      0,
    );
    return under >= MIN_COVERAGE * bend - 1e-9;
  });
  if (!allowed.length) return { kind, fix: null, tried: [] };
  // The contact must lie in the ends the shortest of them leaves bare (machine X, the runs the tool stood over).
  if (!contactAtEnds(hit, allowed.at(-1) - now)) return { kind, fix: null, tried: [] };
  // The shortest still colliding settles it; refused instead (its load, §3.3), a longer one may pass.
  const shortest = brakeStation({
    model,
    session: { ...session, [key]: allowed.at(-1) },
    params,
    advise: false,
    thickness: false,
  }).pending;
  const trim = shortest?.collision?.hit ? null : allowed.find(passes);
  if (trim == null) return { kind, fix: null, tried: [`a shorter ${kind}`] };
  const runs = fitted.map(([a, b]) => b - a - 2 * trim);
  return {
    kind,
    fix: {
      label:
        runs.length === 1
          ? `Shorten the ${kind} to ${fmt(runs[0])} mm`
          : `Shorten the ${kind} by ${fmt(trim)} mm at each end`,
      session: { [key]: trim },
    },
    tried: [],
  };
}

const lower = (label) => `${label[0].toLowerCase()}${label.slice(1)}`;
const ROUND_UP = 5;
/**
 * The pending hit's advice for the ram (brake tool length §3.6): the facts
 * (how high this punch and its holder stand the ram above the tip), then
 * only what was tried: a taller punch that clears, Turn the sheet around;
 * none clearing, that no punch in the list holds the ram high enough (the
 * tallest set-up's height) and about how high this bend needs it (`need`,
 * measured from the stroke's poses), then what was tried and does not clear.
 */
function ramAdvice(hit, { turn, fix, tried, ramStill, punch, machine, need, ways = null }) {
  const holder = machine.holder?.height || 0;
  const stands = `This punch and its holder stand the ram ${fmt(punch.height + holder)} mm above the tip.`;
  // The brake finds the way (tight bends §5.2): this hit earlier, or a part-way bend first, only as tried.
  const way = wayWords(ways);
  const offered = [
    way.first && lower(EARLIER.ram),
    turn && 'turn the sheet around',
    fix && `${lower(fix.label)}: it holds the ram higher`,
    ...way.partway,
    ...way.compound,
  ].filter(Boolean);
  const nothing = way.nothing && !offered.length;
  const remedy = offered.length
    ? ` ${offered.length >= 2 ? `${capital(offered.slice(0, -1).join(', '))}, or ${offered.at(-1)}` : capital(offered[0])}.`
    : '';
  const tallest = Math.max(
    ...Object.values(PUNCHES)
      .filter((p) => !p.round && p.angle === punch.angle)
      .map((p) => p.height),
  );
  const none =
    !fix && ramStill
      ? ` No punch in the list holds the ram high enough (the tallest gives ${fmt(tallest + holder)} mm)${need != null ? `: this bend needs about ${fmt(Math.ceil(need / ROUND_UP) * ROUND_UP)} mm` : ''}.`
      : '';
  const failed = [
    ...(turn ? [] : ['turning the sheet around']),
    ...(nothing ? [] : way.tried),
    ...(ramStill && !fix ? [] : tried),
  ];
  const said = triedWords(failed);
  return `${factOf(hit.message)} ${stands}${remedy}${none}${said}${nothing ? ` ${NO_WAY}` : ''}`;
}

// What was tried and does not clear, as the card's closing sentence (BT-2
// follow-up): "Turning the sheet around and the gooseneck punch were tried:
// neither clears." An item that stands for several punches (shop punches
// §5.4: "every other punch in the rack, either way round") sets its way round
// off with commas, and alone it reads "none clears".
const RACK_ITEM = / in the rack(, either way round)?$/;
function triedWords(failed) {
  if (!failed.length) return '';
  const text = listed(failed).replace(/, either way round(?= and |$)/, ', either way round,');
  const many = failed.length > 1;
  const group = !many && RACK_ITEM.test(failed[0]);
  const verdict =
    failed.length > 2 ? 'none clears' : many ? 'neither clears' : group ? 'none clears' : 'it does not clear';
  const verb = many || /^\d+ /.test(failed[0]) ? 'were' : 'was';
  return ` ${capital(text)} ${verb} tried: ${verdict}.`;
}
// Why a tool is in the way, once more where the advice names a punch: the
// tall punch raises the clamps, the gooseneck the ram.
const PUNCH_WHY = { holder: ': it holds the clamps higher', ram: ': it holds the ram higher' };
const listed = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] || '');
/**
 * The pending hit's advice for the punch, its holders or the ram (BT-2
 * follow-up), from what the station tried: bend this one earlier (not tried,
 * general advice), then only the remedies that pass (Turn the sheet around,
 * the punch fix, each a button on the card), then, plainly, what was tried
 * and does not: "Turning the sheet around and the gooseneck punch were
 * tried: neither clears."
 */
function triedAdvice(hit, { turn, fix, tried, length = null, horn = null, ways = null }) {
  const facts = factOf(hit.message);
  // The brake finds the way (tight bends §5.2): "bend this one earlier" only
  // where try 1 found the place (its button names it), else the order is
  // said tried; a part-way bend found is offered with the rest.
  const way = wayWords(ways);
  const offered = [
    turn && 'turn the sheet around',
    fix &&
      `${fix.label[0].toLowerCase()}${fix.label.slice(1)}${fix.label.startsWith('Use') ? PUNCH_WHY[hit.tool] || '' : ''}`,
    // Horn sections (punch library §4.4), when the hit clears with them:
    // said before a shorter punch, as their button stands before its.
    horn && lower(horn.label),
    // Brake tool length §3.5: the punch fitted or shorter, when that clears.
    length?.fix && lower(length.fix.label),
    ...way.partway,
    ...way.compound,
  ].filter(Boolean);
  // Try 3: no order, no part-way bend and nothing else clears it.
  const nothing = way.nothing && !offered.length;
  // A bend bent on (tight bends §4.5) says "bend this one earlier" only as tried too.
  const remedy = !way.first
    ? offered.length
      ? `${orList(offered)}.`.replace(/^./, (c) => c.toUpperCase())
      : ''
    : `${EARLIER[hit.tool]}${
        offered.length >= 2
          ? `, ${offered.slice(0, -1).join(', ')} or ${offered.at(-1)}`
          : offered.length
            ? `, or ${offered[0]}`
            : ''
      }.`;
  const failed = [
    ...(turn ? [] : ['turning the sheet around']),
    ...(nothing ? [] : way.tried),
    ...tried,
    ...(length?.tried || []),
  ];
  const said = triedWords(failed);
  return `${facts}${remedy ? ` ${remedy}` : ''}${said}${nothing ? ` ${NO_WAY}` : ''}`;
}

/**
 * Whether the station's advice (brakeStation with `advise`) can differ from
 * its facts (`advise: false`), BT-2 follow-up: a collision (the remedies
 * tried, a hanging side's other order, shorter side and step) or a refused
 * offset (its searches). Otherwise the two are the same and the facts serve.
 */
export const needsAdvice = (station) => {
  const pending = station?.pending;
  return Boolean(pending && !pending.error && (pending.collision?.hit || (pending.offset && !pending.pair)));
};

/**
 * The blade picker's cards (brake blades §4.1): every punch (`kind` 'punch')
 * or die ('die', Automatic first) as the pending hit would be made with it.
 * [{ key (null: the automatic die), patch (the session patch that chooses
 * it, the one the selects apply), error, refusals, collision (the hit, or
 * null) }]; null while no hit is pending.
 */
export function bladeOptions({ model, session, params = {}, kind }) {
  const choices =
    kind === 'punch'
      ? // The rack's order (docs/sketch-studio-shop-punches.md §5.2): the shop's own punches first.
        RACK_ORDER.map((key) => [key, punchChoice(session, key)])
      : [[null, { die: null }], ...Object.keys(DIES).map((key) => [key, { die: key }])];
  return choices.map(([key, patch]) => {
    const pending = brakeStation({ model, session: { ...session, ...patch }, params, advise: false }).pending;
    return {
      key,
      patch,
      error: pending?.error || null,
      refusals: pending?.refusals || [],
      collision: pending?.collision?.hit || null,
    };
  });
}

/** The pending stroke's bend ids (shop floor §6.1): PENDING_BEND, PENDING_BEND:2, … */
export const pendingIds = (count) =>
  Array.from({ length: count }, (_, i) => (i ? `${PENDING_BEND}:${i + 1}` : PENDING_BEND));

// ---------------------------------------------------------------- a side that hangs (§5.4)
/**
 * The step a back-to-back pair needs for its side to hang clear (§5.4), found
 * by moving the pending line away from the bend made the other way and trying
 * the hit at each place (the L from the gauge edge, or the two points). Only
 * for two bends of the same angle (a step). The step, rounded up to 0.1 mm, or null.
 */
function hangingStep({ model, session, params, edge, pending, hanging }) {
  const bend = pending.bend,
    made = pending.fold.bends.find((b) => b.id === hanging.bendId);
  if (!made || Math.abs(made.angle - bend.angle) > 1e-6 || pending.bendIds.length > 1) return null;
  const t = pending.fold.thickness;
  const a = (bend.angle * Math.PI) / 180;
  const rise = (made.radius + bend.radius + t) * (1 - Math.cos(a));
  const zones = (made.allowance + bend.allowance) / 2;
  const across = (made.a[0] - bend.a[0]) * bend.n[0] + (made.a[1] - bend.a[1]) * bend.n[1];
  const spacingOf = (step) => (step - rise) / Math.sin(a) + zones;
  const now = (Math.abs(across) - zones) * Math.sin(a) + rise;
  const patchFor = (step) => {
    const move = spacingOf(step) - Math.abs(across);
    if (session.mode === 'gauge' && edge) {
      const madeL = (made.a[0] - edge.a[0]) * edge.inward[0] + (made.a[1] - edge.a[1]) * edge.inward[1];
      // Which way is judged on the flat blank; L moves as much on the session's own stop (skin gauge §4.5).
      const flatL = (bend.a[0] - edge.a[0]) * edge.inward[0] + (bend.a[1] - edge.a[1]) * edge.inward[1];
      const L = Number(session.distance) || 0;
      return { distance: exact(L + Math.sign(flatL - madeL) * move), stop: session.stop ?? null };
    }
    const sign = across > 0 ? -1 : 1;
    return { points: session.points.map((p) => [p[0] + bend.n[0] * sign * move, p[1] + bend.n[1] * sign * move]) };
  };
  const clears = (step) => {
    const tried = brakeStation({
      model,
      session: { ...session, ...patchFor(step) },
      params,
      advise: false,
      thickness: false,
    }).pending;
    return Boolean(tried && !tried.error && !tried.refusals.length && !tried.collision?.hit);
  };
  const found = smallestClearing(clears, now, { step: 2, tries: 7, tolerance: 0.05 });
  return found ? tenthUp(clears, found) : null;
}

// ---------------------------------------------------------------- the offset bend (§5.3)
const OFFSET_IDS = [PENDING_BEND, `${PENDING_BEND}:2`];
const LINE_NAMES = { [OFFSET_IDS[0]]: 'Line A', [OFFSET_IDS[1]]: 'Line B' };

/**
 * An offset bend tried as the machine would make it (§5.3): line A (the
 * station's punch line) bent up (down with Flip sheet), line B `spacing`
 * nearer the side of A that goes to the backgauge, bent the other way; made A
 * then B and, when that is refused, B then A. Each hit is gauged off the
 * session's edge where that edge bounds a face beside its line, else off the
 * opposite edge (the sheet turned around for it), else not gauged.
 * `ctx`: { feature, profile, params, machine, line, base (the bend fields),
 * flip, edge, edges, gaugePoint, turned, reverse }; `die`: a die key to try
 * in place of the session's (null: automatic). `quick` (the searches) skips
 * what cannot change the answer: the collision of a refused hit, the second
 * hit after a first refused. Returns { error } or { alone (line A folded on
 * its own), web, spacing, rho, allowance, lines: { A, B }, ab, ba (null when
 * A then B clears) }, each order { order, hits: [first, second], ok }; a hit
 * is assessBend's result plus { data, fold, gauge, gaugePoint, turned,
 * around (gauged off the opposite edge), collision, ok } or { data, error }.
 */
function offsetPair(ctx, { offset, die = undefined, quick = false }) {
  const { feature, profile, params, machine, line, flip, edge, edges, turned, reverse } = ctx;
  const base = { ...ctx.base };
  if (die !== undefined) {
    if (die) base.die = die;
    else delete base.die;
  }
  const A = { id: OFFSET_IDS[0], a: line.a, b: line.b, ...base, direction: flip ? 'down' : 'up' };
  const alone = brakeHit({ feature, profile, params, bend: [A], machine });
  if (alone.error) return { error: alone.error };
  const { radius, allowance } = alone.bend;
  const { web, spacing, rho } = offsetSpacing({
    offset,
    angle: base.angle,
    radius,
    allowance,
    thickness: alone.fold.thickness,
  });
  // Line B: on the side of A that goes to the backgauge.
  const back = backSide(alone.bend, { gaugePoint: ctx.gaugePoint, turned });
  const toward = back === 'moving' ? alone.bend.n : [-alone.bend.n[0], -alone.bend.n[1]];
  const shift = (p) => [p[0] + toward[0] * spacing, p[1] + toward[1] * spacing];
  const B = { id: OFFSET_IDS[1], a: shift(line.a), b: shift(line.b), ...base, direction: flip ? 'up' : 'down' };
  const count = madeBends(feature.bends || []).length;
  const gaugeFor = (fold, id) => {
    if (!edge)
      return { gauge: { distance: null, reason: 'Two-point line: no backgauge edge.' }, gaugePoint: null, turned };
    if (turned) return { gauge: { distance: null, reason: TURNED_GAUGE }, gaugePoint: mid(edge), turned: true };
    const own = gaugeReading(fold, id, edge);
    if (own.distance != null) return { gauge: own, gaugePoint: mid(edge), turned: false };
    const bend = fold.bends.find((b) => b.id === id);
    const opposite = oppositeEdge(edges, edge, bend.a);
    const other = opposite && gaugeReading(fold, id, opposite.edge);
    if (other?.distance != null) return { gauge: other, gaugePoint: mid(opposite.edge), turned: false, around: true };
    // Where neither edge is beside the line, the fingers stop on a made flange (skin gauge §4.2).
    const skin = brakeReading(fold, id, edge, { angles: { [id]: 0 } });
    if (skin.distance != null) return { gauge: skin, gaugePoint: mid(edge), turned: false };
    return { gauge: { distance: null, reason: own.reason }, gaugePoint: null, turned: false };
  };
  const hitOf = (made, data) => {
    let fold;
    try {
      fold = foldSheet({ ...feature, bends: [...(feature.bends || []), ...made, data] }, profile, params);
    } catch (error) {
      let message = error.message || String(error);
      [...made, data].forEach((d, i) => (message = message.replace(`Bend ${count + 1 + i}`, LINE_NAMES[d.id])));
      return { data, error: message, ok: false };
    }
    const g = gaugeFor(fold, data.id);
    const assessed = assessBend(fold, data.id, {
      machine,
      gauge: g.gauge.distance != null ? g.gauge : null,
      dieAuto: !data.die,
      label: 'This hit',
      angles: { [data.id]: 0 },
    });
    const refused = assessed.refusals.length > 0;
    const options = {
      fold,
      bendIds: [data.id],
      machine,
      punch: assessed.punch,
      die: assessed.die,
      gaugePoint: g.gaugePoint,
      turned: g.turned,
      reverse,
      number: hitSequence(fold).length,
      advise: false,
    };
    let hit = quick && refused ? { hit: null, samples: 0, ms: 0 } : brakeCollisions(options);
    // The end at the sheet's true thickness (corner gaps §5), not in the searches (`quick`).
    if (!quick && !hit.hit) {
      const inside = thicknessHit({ ...options, profile, params });
      if (inside) hit = { ...hit, hit: inside, takeOff: null, ms: hit.ms + inside.ms };
    }
    return {
      ...assessed,
      data,
      fold,
      gauge: g.gauge,
      gaugePoint: g.gaugePoint,
      turned: g.turned,
      around: Boolean(g.around),
      collision: { ...hit, turnedClears: false },
      ok: !refused && !hit.hit,
    };
  };
  const order = (key, first, second) => {
    const one = hitOf([], first);
    const two = one.fold && (!quick || one.ok) ? hitOf([first], second) : null;
    return { order: key, hits: [one, two], ok: Boolean(one.ok && two?.ok) };
  };
  const ab = web > 1e-9 ? order('ab', A, B) : null;
  const ba = !ab || ab.ok ? null : order('ba', B, A);
  return { alone, web, spacing, rho, allowance, lines: { A, B }, ab, ba };
}

const pairClears = (pair) => !pair.error && Boolean(pair.ab?.ok || pair.ba?.ok);

/**
 * The station's pending offset (§5.3): offsetPair for the session's offset,
 * the order chosen (A then B; B then A when only that clears, said so), and
 * when neither clears what was tried and what would work (§5.4): a step too
 * small for the die says the smallest this die makes at this angle and offers
 * a catalogue die that makes the offset asked for (each found by trying); a
 * side hanging into the bed says the shorter side and the larger step that
 * clear. { pending, gauge (line A's own reading: the station's L) }.
 */
function offsetPending(ctx) {
  const { session, line, base, edge, polygon } = ctx;
  const offset = Number(session.offset),
    angle = Number(session.angle);
  const data = [{ id: OFFSET_IDS[0], a: line.a, b: line.b, ...base, direction: ctx.flip ? 'down' : 'up' }];
  const failed = (error) => ({ pending: { error, data, bendIds: [OFFSET_IDS[0]] }, gauge: null });
  if (!(offset > 0)) return failed('Set the offset: the step between the two faces, in mm.');
  if (!(angle > 0 && angle < 180))
    return failed('An offset is two bends of one angle, more than 0° and less than 180°.');
  const pair = offsetPair(ctx, { offset });
  if (pair.error) return failed(pair.error);
  const gauge = edge
    ? ctx.turned
      ? { distance: null, reason: TURNED_GAUGE }
      : brakeReading(pair.alone.fold, OFFSET_IDS[0], edge)
    : { distance: null, reason: 'Two-point line: no backgauge edge.' };
  const made = pair.ab?.ok ? pair.ab : pair.ba?.ok ? pair.ba : null;
  // A step too small for even the two bend zones has no hits to show (pair.ab null).
  const shown = made || pair.ab || { order: 'ab', hits: [], ok: false };
  const lines = [pair.lines.A, pair.lines.B].map((l) => ({
    id: l.id,
    name: LINE_NAMES[l.id],
    direction: l.direction,
    a: l.a,
    b: l.b,
    segments: lineSegments(polygon, l).map(({ a, b }) => [a, b]),
  }));
  const rows = (shown.hits || []).map(
    (h, k) =>
      h && {
        label: `Hit ${k + 1}`,
        line: LINE_NAMES[h.data.id],
        direction: h.data.direction,
        distance: h.gauge?.distance ?? null,
        reason: h.gauge?.reason || null,
        around: Boolean(h.around),
        ok: Boolean(h.ok),
        problem: h.ok ? null : factOf(h.error || h.refusals?.[0]?.message || h.collision?.hit?.message || ''),
      },
  );
  // A line's side away from the other line (the side that hangs while the other is made), flat mm.
  const farSide = (fold, id) => {
    const bend = fold.bends.find((b) => b.id === id),
      other = fold.bends.find((b) => b.id !== id && OFFSET_IDS.includes(b.id));
    if (!bend || !other) return null;
    const ahead = (other.a[0] - bend.a[0]) * bend.n[0] + (other.a[1] - bend.a[1]) * bend.n[1];
    return ahead > 0 ? bend.flatLegs.fixed : bend.flatLegs.moving;
  };
  const info = {
    offset,
    angle,
    spacing: pair.spacing,
    web: pair.web,
    order: made?.order || null,
    note: null,
    hits: rows,
    lines,
  };
  let refusals = [],
    found = null;
  if (made?.order === 'ba') {
    // B then A: line B's far side hangs while A is made, not line A's.
    const fold = made.hits[1].fold;
    const hangs = farSide(fold, OFFSET_IDS[1]),
      instead = farSide(fold, OFFSET_IDS[0]);
    info.note =
      hangs != null && instead != null && hangs < instead
        ? 'Made the other way round: the shorter side hangs down.'
        : 'Made the other way round: line B first.';
  }
  if (!made) ({ refusals, found } = offsetProblem(ctx, pair, offset, angle));
  const [one, two] = shown.hits;
  const first = one && !one.error ? one : null;
  // The pose before the pedal: the first hit flat on the die, or the hit a
  // collision happens in, at its angle (the bend made before it hanging).
  const posed = found?.where || first;
  const view = posed
    ? {
        fold: posed.fold,
        bendId: posed.data.id,
        bendIds: [posed.data.id],
        angles: { [posed.data.id]: found?.hit ? found.hit.angle : 0 },
        die: posed.die.key,
        punch: posed.punch.key,
        gaugePoint: posed.gaugePoint,
        turned: posed.turned,
        gaugeDistance: posed.gauge?.distance ?? null,
      }
    : {
        fold: pair.alone.fold,
        bendId: OFFSET_IDS[0],
        bendIds: [OFFSET_IDS[0]],
        angles: { [OFFSET_IDS[0]]: 0 },
        die: pair.alone.die.key,
        punch: pair.alone.punch.key,
        gaugePoint: ctx.gaugePoint,
        turned: ctx.turned,
        gaugeDistance: gauge?.distance ?? null,
      };
  const warnings = [...(one?.warnings || []), ...(two?.warnings || [])].filter(
    (w, i, all) => all.findIndex((o) => o.message === w.message) === i,
  );
  const pending = {
    ...(first || pair.alone),
    data: (made || shown).hits.filter(Boolean).map((h) => h.data),
    bendIds: (made || shown).hits.filter(Boolean).map((h) => h.data.id),
    refusals,
    warnings,
    collision: found?.hit
      ? { hit: found.hit, samples: 0, ms: 0, turnedClears: false }
      : { hit: null, samples: 0, ms: 0, turnedClears: false },
    // The two hits the pedal makes, in order (null while refused).
    pair: made ? made.hits : null,
    offset: info,
    view,
  };
  return { pending, gauge };
}

/**
 * Why neither order of an offset clears, and what does (§5.3, §5.4): {
 * refusals: [{ code, message, fix? }], found: { hit (a collision to show,
 * with its message), where (the hit it happens in) } | null }.
 */
function offsetProblem(ctx, pair, offset, angle) {
  // `ctx.advise` false (a blade picker card, a remedy being tried): the facts only, nothing searched.
  const tries = (o, die = undefined) => pairClears(offsetPair(ctx, { offset: o, die, quick: true }));
  const search = ctx.advise !== false;
  const ab = pair.ab;
  const [, second] = ab?.hits || [];
  const other = pair.ba?.hits?.[1];
  const die = [second, ab?.hits?.[0], pair.alone].find((h) => h?.die).die;
  const webLeg = pair.web + pair.allowance / 2;
  const shortWeb = (h) =>
    Boolean(h?.refusals?.some((r) => r.code === 'short-leg') && webLeg < h.readouts.minLeg - 1e-9);
  const dieHit = (h) => h?.collision?.hit?.tool === 'die';
  const small = !ab || pair.web <= 1e-9 || shortWeb(second) || shortWeb(other) || dieHit(second) || dieHit(other);
  if (small) {
    const short = [second, other].find(shortWeb);
    const why =
      !ab || pair.web <= 1e-9
        ? 'the two bend zones would overlap'
        : short
          ? `the web leaves ${fmt(webLeg)} mm beside the punch line; the die needs ${fmt(short.readouts.minLeg)} mm to carry it`
          : "the side bent first meets the die's body";
    const least = search ? smallestClearing((o) => tries(o), offset) : null;
    const leastValue = least && tenthUp((o) => tries(o), least);
    const punch = punchOf(ctx.base.punch);
    const candidates = Object.values(DIES)
      .filter((d) => d.key !== die.key && maxBendAngle(d) >= angle - 1e-9 && (punch.round || punch.angle <= d.angle))
      .sort(
        (p, q) =>
          (p.angle === die.angle ? 0 : 1) - (q.angle === die.angle ? 0 : 1) ||
          Math.abs(p.v - die.v) - Math.abs(q.v - die.v) ||
          p.v - q.v,
      );
    const fixDie = (search && candidates.find((d) => tries(offset, d.key))) || null;
    let elsewhere = '';
    if (search && !fixDie) {
      // The smaller dies of the same angle make smaller steps: the smallest that works with any of them.
      const best = candidates
        .filter((d) => d.angle === die.angle && d.v < die.v)
        .map((d) => {
          const found = smallestClearing((o) => tries(o, d.key), offset);
          return found ? { die: d, value: tenthUp((o) => tries(o, d.key), found) } : null;
        })
        .filter(Boolean)
        .sort((p, q) => p.value - q.value)[0];
      if (best) elsewhere = ` The ${best.die.name} die makes ${fmt(best.value)} mm and up.`;
    }
    const message = `Offset ${fmt(offset)} mm at ${fmt(angle)}° is too small for the ${die.name} die: ${why}.${
      leastValue != null ? ` The smallest it makes at ${fmt(angle)}° is ${fmt(leastValue)} mm.` : ''
    }${fixDie ? ` The ${fixDie.name} die makes ${fmt(offset)} mm.` : elsewhere}`;
    return {
      refusals: [
        {
          code: 'offset-small',
          message,
          smallest: leastValue ?? null,
          ...(fixDie ? { fix: { label: `Use the ${fixDie.name} die`, session: { die: fixDie.key } } } : {}),
        },
      ],
      found: null,
    };
  }
  // The first hit that fails, A then B (the order the user's diagram makes).
  const failing = ab.hits.find((h) => h && !h.ok);
  if (failing.error) return { refusals: [{ code: 'offset-line', message: failing.error }], found: null };
  if (failing.refusals.length) {
    // A remedy stays a button only when the offset made with it clears (tried).
    const refusals = failing.refusals.map((r) => {
      const keys = r.fix ? Object.keys(r.fix.session) : [];
      const ok = search && r.fix && keys.every((k) => k === 'die') && tries(offset, r.fix.session.die);
      const { fix, ...rest } = r;
      return ok ? { ...rest, fix } : rest;
    });
    return { refusals, found: null };
  }
  const hit = failing.collision.hit;
  // Metal inside metal at the end (corner gaps §5): the outline's, said as it is.
  if (hit.thickness) return { refusals: [], found: { hit, where: failing } };
  if (hit.hanging && !search) return { refusals: [], found: { hit, where: failing } };
  if (hit.hanging) {
    // Tried: the side shorter (brakeCollisions, the other order already known
    // not to clear) and the step larger (this offset made bigger).
    const shorter = brakeCollisions({
      fold: failing.fold,
      bendIds: [failing.data.id],
      machine: ctx.machine,
      punch: failing.punch,
      die: failing.die,
      gaugePoint: failing.gaugePoint,
      turned: failing.turned,
      reverse: ctx.reverse,
      number: hitSequence(failing.fold).length,
      advise: 'shorten',
    }).hit;
    const found = smallestClearing((o) => tries(o), offset, { step: 2, tries: 7, tolerance: 0.05 });
    const step = found ? tenthUp((o) => tries(o), found) : null;
    const hanging = { ...(shorter?.hanging || hit.hanging), otherFirst: false, broken: null, advised: true };
    return {
      refusals: [],
      found: { hit: { ...hit, hanging, step, message: hangingMessage(hanging, { step }) }, where: failing },
    };
  }
  return {
    refusals: [],
    found: { hit: { ...hit, message: `${factOf(hit.message)} Neither order clears.` }, where: failing },
  };
}

// A bend-on hit (tight bends §4.4) as brakeHit has a new one: its entries
// folded after the feature's own, the machine's checks at the angle after
// the hit with the part as it stands before it. { error } when the fold
// refuses them, else assessBend's result.
function againHit({ feature, profile, params, data, ids, from, machine, dieAuto }) {
  let fold;
  try {
    fold = foldSheet({ ...feature, bends: [...(feature.bends || []), ...data] }, profile, params);
  } catch (error) {
    return { error: error.message || String(error) };
  }
  return assessBend(fold, ids.length === 1 ? ids[0] : ids, {
    machine,
    dieAuto,
    label: 'This hit',
    angles: Object.fromEntries(ids.map((id) => [id, from])),
  });
}

// ---------------------------------------------------------------- the brake finds the way (tight bends §5.2)
/**
 * The part-way angles tried for a step in the way (§5.2 try 2), each only
 * below the step's own angle. 45° first (docs/sketch-studio-shop-punches.md
 * §6.4: the shop's own way into a tight space, 45° and the rest later), then
 * the others, the largest first.
 */
export const PART_WAY = Object.freeze([45, 60, 30, 15]);
// The tools whose collision the order and a part-way bend may cure (§5.2).
const WAY_TOOLS = ['ram', 'punch', 'holder', 'die', 'bed'];
// The bend-on entry that finishes a step opened part-way, while it is only tried.
const FINISH_ID = `${PENDING_BEND}:finish`;
/**
 * Nothing in the order, no part-way bend and no other punch for the earlier
 * bends clears it (§5.2 item 3), and nothing else was offered. Reworded by
 * docs/sketch-studio-shop-punches.md §5.4 to claim only what was tried, and
 * by §6.2 once the earlier bends with another punch are tried too.
 */
export const NO_WAY =
  'No order, no part-way bend and no other punch for the earlier bends clears it. Make the web wider or the flange shorter, or use tooling this rack does not hold.';
// The step's own lengths and horn sections (punch library §4.1), carried only when set.
const TRIM_FIELDS = ['punchTrim', 'dieTrim', 'horns'];
// A step opened part-way is finished by a bend-on entry with the step's own punch, die and lengths (§5.2).
const finishOf = (made, id) => ({
  id,
  again: made.id,
  angle: made.angle,
  punch: made.punch || punchOf(null).key,
  ...(made.die ? { die: made.die } : {}),
  ...Object.fromEntries(TRIM_FIELDS.filter((k) => made[k] != null).map((k) => [k, made[k]])),
});

/**
 * The feature's bends once a pending hit's `records` are made (§5.2):
 * appended (the hit made last, as ever); with `armed` { kind: 'before', key }
 * put in before the record `key` (try 1: this hit first), and with its
 * `punches` ({ [record id]: punch key }, docs/sketch-studio-shop-punches.md
 * §6.2, try 3) those records after the place made with those punches; with
 * { kind: 'partway', key, angle } appended, the record `key` set to `angle`
 * and a bend-on entry (`finishId`) taking it back to its own angle after this
 * hit (try 2). No new keys: an ordinary record at a place (its punch changed),
 * or one angle changed and a TB-1 bend-on entry.
 */
export function placedBends(bends, records, armed = null, finishId = FINISH_ID) {
  if (armed?.kind === 'before') {
    const at = bends.findIndex((b) => b.id === armed.key);
    if (at >= 0) {
      const punches = armed.punches || null;
      const later = punches
        ? bends.slice(at).map((b) => (punches[b.id] ? { ...b, punch: punches[b.id] } : b))
        : bends.slice(at);
      return [...bends.slice(0, at), ...records, ...later];
    }
  }
  if (armed?.kind === 'partway') {
    const made = bends.find((b) => b.id === armed.key && !isBendOn(b));
    if (made)
      return [
        ...bends.map((b) => (b === made ? { ...b, angle: armed.angle } : b)),
        ...records,
        finishOf(made, finishId),
      ];
  }
  return [...bends, ...records];
}

// The last step of `steps` that hits one of the bends `own` (-1: none): a bend-on hit goes after it.
const lastOf = (steps, own) => steps.reduce((at, s, i) => (s.bendIds.some((id) => own.includes(id)) ? i : at), -1);

// A sharp step (not a round bend, nor one made with a radius punch).
const sharpStep = (fold, step) => !step.bendIds.some((id) => isRoundBend(fold.bends.find((b) => b.id === id)));
// The sharp punches of the rack, by key.
const rackPunch = (key) => Boolean(PUNCHES[key] && !PUNCHES[key].round);

/**
 * An armed try's `punches` (docs/sketch-studio-shop-punches.md §6.2) as they
 * stand on `fold`: only records of steps from `from` on (after the place), of
 * sharp steps, naming sharp punches of the rack; any other entry is dropped.
 * { punches, changes ([{ key (the step's), number, again, punch }], in the
 * order made) } or null when none is left.
 */
function armedPunches(fold, steps, from, punches) {
  if (!punches || typeof punches !== 'object') return null;
  const kept = {};
  const changes = [];
  for (const [id, key] of Object.entries(punches)) {
    const step = steps.find((s) => s.recordIds.includes(id));
    if (!step || step.index < from || !sharpStep(fold, step) || !rackPunch(key)) continue;
    kept[id] = key;
    if (!changes.some((c) => c.key === step.key))
      changes.push({ key: step.key, index: step.index, number: step.index + 1, again: step.again, punch: key });
  }
  if (!changes.length) return null;
  changes.sort((a, b) => a.index - b.index);
  return { punches: kept, changes: changes.map(({ index: _index, ...c }) => c) };
}

/**
 * The session's armed try (§5.2) as it stands on `fold` (the part as made):
 * the step it names must still be there, a bend-on hit (`own`, its bends)
 * must stay after its bend, and a step opened part-way must be a sharp bend
 * of one tab, made in one hit (its only one), above the angle. Else null:
 * the hit is made last, as if nothing were armed. A try made before a step
 * keeps the `punches` armedPunches keeps (shop punches §6.2; with none it is
 * plain try 1); a part-way try never has any (§6.6).
 */
function armedOf(fold, armed, own = []) {
  if (!armed?.key) return null;
  const steps = hitSequence(fold);
  const step = steps.find((s) => s.key === armed.key);
  if (!step) return null;
  const words = { number: step.index + 1, again: step.again };
  if (armed.kind === 'before') {
    if (!(step.index > lastOf(steps, own))) return null;
    const changed = armedPunches(fold, steps, step.index, armed.punches);
    return { kind: 'before', key: armed.key, ...(changed || {}), ...words, step };
  }
  if (armed.kind !== 'partway') return null;
  const [id] = step.bendIds;
  const bend = fold.bends.find((b) => b.id === id);
  const angle = Number(armed.angle);
  const fits =
    !step.again &&
    step.bendIds.length === 1 &&
    bend &&
    !isRoundBend(bend) &&
    !own.includes(id) &&
    !steps.some((s) => s.index > step.index && s.bendIds.includes(id)) &&
    angle > 1e-9 &&
    angle < step.to[id] - 1e-9;
  return fits ? { kind: 'partway', key: armed.key, ...words, angle, step, bendId: id, to: step.to[id] } : null;
}

/**
 * The pending hit made where an armed try puts it (§5.2): the trial fold (the
 * records placed, a part-way step's bend-on entry in it, so the zone's
 * allowance is the final angle's: tight bends §4.7), posed as that step
 * starts (stepPose). The machine's checks with the part as it stands then.
 * { error } or assessBend's result plus { others (the other bends' angles
 * then), place (the hit's step index), trial (the unposed trial fold) }.
 */
function armedHit({ feature, profile, params, data, ids, armed, machine, dieAuto, from = 0 }) {
  let trial;
  try {
    trial = foldSheet({ ...feature, bends: placedBends(feature.bends || [], data, armed) }, profile, params);
  } catch (error) {
    return { error: error.message || String(error) };
  }
  const step = stepOf(trial, data[0].id);
  if (!step) return { error: 'This hit is not in the order made.' };
  const pose = stepPose(trial, step.index);
  const others = Object.fromEntries(Object.entries(pose.angles).filter(([id]) => !ids.includes(id)));
  const assessed = assessBend(pose.fold, ids.length === 1 ? ids[0] : ids, {
    machine,
    dieAuto,
    label: 'This hit',
    angles: { ...others, ...Object.fromEntries(ids.map((id) => [id, from])) },
  });
  return { ...assessed, others, place: step.index, trial };
}

/**
 * One step of the sequence (hitSequence's `index`) checked as the machine
 * would make it: sequenceChecks' row. `thickness` (corner gaps §5): a step
 * otherwise clear is checked at its end at the sheet's true thickness
 * (thicknessHit; `profile` / `params` the blank's for the depth); the
 * candidate searches leave it out.
 */
function stepCheck(fold, stroke, index, machine, surface, { thickness = true, profile = null, params = {} } = {}) {
  const pose = stepPose(fold, index);
  const shown = pose.fold;
  const ids = stroke.bendIds;
  const bend = shown.bends.find((b) => b.id === ids[0]);
  const from = stroke.from[ids[0]] || 0;
  const later = Object.fromEntries(Object.entries(pose.angles).filter(([id]) => !ids.includes(id)));
  const refusals = assessBend(shown, ids.length === 1 ? ids[0] : ids, {
    machine,
    label: stroke.again ? `Bend ${bendNumber(fold, ids[0])} on to ${fmt(stroke.to[ids[0]])}°` : `Bend ${index + 1}`,
    angles: { ...later, ...Object.fromEntries(ids.map((id) => [id, from])) },
  }).refusals;
  let hit = null;
  if (!refusals.some((r) => r.code === 'not-in-line')) {
    const options = {
      fold: shown,
      bendIds: ids,
      angles: later,
      machine,
      punch: stroke.punch,
      die: stroke.die,
      surface,
      number: index + 1,
      ...(stroke.again ? { start: from, target: stroke.to[ids[0]] } : {}),
    };
    const first = brakeCollisions(options);
    hit = first.hit ? brakeCollisions({ ...options, turned: true, advise: false }).hit && first.hit : null;
    if (!hit && thickness) hit = thicknessHit({ ...options, profile, params });
  }
  return {
    bendId: stroke.key,
    bendIds: ids,
    index,
    label: stroke.again
      ? `bend ${bendNumber(fold, ids[0])} on: ${fmt(from)}° → ${fmt(stroke.to[ids[0]])}°`
      : ids.length > 1
        ? `${bend.label} · ${ids.length} flanges`
        : bend.label,
    refusals,
    collision: hit,
  };
}
const failed = (check) => Boolean(check && (check.refusals.length || check.collision));
// Failed on the mid-surface: a refusal, or a collision other than metal inside metal at the end (corner
// gaps §5). The candidate searches check their trials without the thickness, so they count today's alike.
const failedMid = (check) =>
  Boolean(check && (check.refusals.length || (check.collision && !check.collision.thickness)));

/**
 * (§5.2 (ii)) The first step of `trial` from step `from` on (less the steps
 * `skip`) that makes the order worse than the part as made from `since` on:
 * more failing steps there than `today` (sequenceChecks of the part as made,
 * or computed from `fold`) has. Walked step by step, so the first step too
 * many ends it. The step's check, or null.
 */
function worseFrom({ trial, from, skip = [], since, fold, today = null, machine }) {
  const made = hitSequence(fold);
  let allowed = 0;
  // On the mid-surface (corner gaps §5: a try, not a verdict): the thickness is left out on both sides.
  if (today) allowed = today.filter((c, i) => i >= since && failedMid(c)).length;
  else {
    const surface = partSurface(fold);
    for (let i = since; i < made.length; i++)
      if (failed(stepCheck(fold, made[i], i, machine, surface, { thickness: false }))) allowed++;
  }
  const steps = hitSequence(trial);
  const surface = partSurface(trial);
  let failing = 0;
  for (let i = from; i < steps.length; i++) {
    if (skip.includes(i)) continue;
    const check = stepCheck(trial, steps[i], i, machine, surface, { thickness: false });
    if (failed(check) && ++failing > allowed) return check;
  }
  return null;
}

/**
 * The words of a try that changes the punch of made steps
 * (docs/sketch-studio-shop-punches.md §6.2), from `changes` ([{ number,
 * again, punch }], in the order made): `mode` 'with' "bend 1 with the A 101
 * punch" (the button), 'is' "bend 1 is made with the A 101 punch" (the armed
 * card), 'now' "bend 2 is now made with the A 101 punch" (the line after the
 * commit). Several steps with one punch: "bends 1 and 3 with the A 101
 * punch"; with several punches each is named.
 */
export function punchChangeWords(changes, mode = 'with') {
  const name = (c) => `${c.again ? 'step' : 'bend'} ${c.number}`;
  const verb = (many) => (mode === 'with' ? 'with' : `${many ? 'are' : 'is'}${mode === 'now' ? ' now' : ''} made with`);
  if (new Set(changes.map((c) => c.punch)).size === 1) {
    const many = changes.length > 1;
    const kind = changes.every((c) => c.again === changes[0].again);
    const who =
      many && kind
        ? `${changes[0].again ? 'steps' : 'bends'} ${listed(changes.map((c) => c.number))}`
        : listed(changes.map(name));
    return `${who} ${verb(many)} ${punchWords(changes[0].punch)}`;
  }
  return listed(changes.map((c, i) => `${name(c)} ${i ? 'with' : verb(false)} ${punchWords(c.punch)}`));
}
// The most made steps try 3 changes the punch of (§6.2).
const MOST_CHANGED = 3;

/**
 * The tries (§5.2) for a pending hit that collides, on the station's own
 * checks with the try armed (brakeStation, `advise: false`): the same checks
 * the pedal makes. Try 1, this hit first: the latest place before a made step
 * (after a bend-on hit's own bend) where this hit passes with that step and
 * the later ones not yet made and every step after it is no worse. Try 2,
 * when no place passes: the made steps from the latest back, each a sharp
 * bend of one tab made in one hit (not this hit's own), at the first of
 * PART_WAY below its angle (45° first) with which that step, the steps
 * between, this hit and the bend-on entry finishing it all pass. Try 3
 * (docs/sketch-studio-shop-punches.md §6.2), the last resort — when neither
 * found anything and the card offers nothing else for this hit (`offered`:
 * Turn the sheet around, a punch or a length for it): at the latest place of
 * try 1 where this hit itself passes and only the order is refused, the step
 * the refusal names made with another punch of the rack (a sharp step stopped
 * by its punch or holder: the sharp punches not blunter than its die, in
 * RACK_ORDER, its own left out). Each candidate is first checked on that step
 * alone (stepCheck on the trial with its punch swapped: it may only rule the
 * candidate out), then tried armed with `punches`; a punch with which the
 * station passes is the try, one that moves the refusal to another step is
 * kept and that step tried next (at most MOST_CHANGED steps). One place only
 * (the follow-up to SP-2's audit, §6.8): a step from the place on is made with
 * the same part before it wherever earlier the hit goes in, so what cannot be
 * cured there cannot be cured earlier — unless the part as made already has
 * failing steps between, whose count the order rule allows: then the earlier
 * places are walked too, and without the step check. `feature`, `profile`:
 * the part's, for the step check. `today`: sequenceChecks of the part as made.
 * null with nothing made to reorder, else { first, partway, compound ({ label,
 * session, number, changes: [{ number, punch }] }), each present only when
 * found, and the counts places, openings, compoundPlaces (try 3's places),
 * stepChecks, stepPassed (try 3's step checks, and those passed), punchRuns
 * (try 3's armed station runs) }.
 */
export function wayTries({
  model,
  session,
  params,
  fold,
  machine,
  pending,
  today,
  feature = null,
  profile = null,
  offered = false,
}) {
  const steps = hitSequence(fold);
  if (!steps.length) return null;
  const checks = today || sequenceChecks({ fold, machine, thickness: false });
  const own = pending.again?.bendIds || [];
  const run = (armed) =>
    brakeStation({ model, session: { ...session, armed }, params, advise: false, checks, thickness: false }).pending;
  const passes = (tried) => Boolean(tried?.armed && !tried.error && !tried.refusals.length && !tried.collision?.hit);
  let places = 0,
    openings = 0,
    punchRuns = 0,
    compoundPlaces = 0,
    stepChecks = 0,
    stepPassed = 0;
  const counts = () => ({ places, openings, compoundPlaces, stepChecks, stepPassed, punchRuns });
  // Try 1's runs, kept for try 3 (the same armed run with no punch changed).
  const before = new Map();
  for (let k = steps.length - 1; k > lastOf(steps, own); k--) {
    places++;
    const armed = { kind: 'before', key: steps[k].key };
    const tried = run(armed);
    before.set(k, tried);
    if (passes(tried))
      return {
        first: {
          label: `Make this hit before ${steps[k].again ? 'step' : 'bend'} ${k + 1}`,
          session: { armed },
          number: k + 1,
        },
        ...counts(),
      };
  }
  for (let k = steps.length - 1; k >= 0; k--) {
    const step = steps[k];
    const angles = PART_WAY.filter((a) => a < (step.to[step.bendIds[0]] ?? 0) - 1e-9);
    if (!angles.length || !armedOf(fold, { kind: 'partway', key: step.key, angle: angles[0] }, own)) continue;
    openings++;
    for (const angle of angles) {
      const armed = { kind: 'partway', key: step.key, angle };
      if (passes(run(armed)))
        return {
          partway: {
            label: `Bend ${k + 1} to ${fmt(angle)}° first, finish it after this hit`,
            session: { armed },
            number: k + 1,
            angle,
          },
          ...counts(),
        };
    }
  }
  // Try 3 (§6.2): the last resort, when the card has nothing else for this hit.
  if (offered) return counts();
  // The hit itself passes at the place and only the order is refused.
  const orderOnly = (tried) =>
    tried?.armed && !tried.error && !tried.collision?.hit && tried.refusals.length
      ? tried.refusals.every((r) => r.code === 'order')
        ? tried.refusals[0]
        : null
      : null;
  const first = lastOf(steps, own);
  let latest = null;
  for (let k = steps.length - 1; k > first && latest == null; k--) if (orderOnly(before.get(k))) latest = k;
  if (latest == null) return counts();
  // The steps of the part as made that already fail from `k` on: the "no worse" rule allows as many.
  const spare = (k) => checks.filter((c, i) => i >= k && failedMid(c)).length;
  const stock = stockOf(fold.stock);
  const radiusOf = (key, die) => (die ? airBendRadius(stock, fold.thickness, punchOf(key), die).radius : null);
  // A candidate on the refused step alone: the trial with the punches, that step's own check (either way round).
  const stepClears = (key, punches, index) => {
    let trial;
    try {
      trial = foldSheet(
        { ...feature, bends: placedBends(feature.bends || [], pending.data, { kind: 'before', key, punches }) },
        profile,
        params,
      );
    } catch {
      return false;
    }
    const step = hitSequence(trial)[index];
    return Boolean(step) && !failed(stepCheck(trial, step, index, machine, partSurface(trial), { thickness: false }));
  };
  for (let k = latest; k > first; k--) {
    // An earlier place is the same refusal with more steps after the hit, unless it allows more failures.
    if (k !== latest && spare(k) === spare(latest)) break;
    if (!orderOnly(before.get(k))) continue;
    compoundPlaces++;
    // The step check may rule a candidate out only where no failing step is allowed (it is then the station's).
    const checked = Boolean(feature && profile) && spare(k) === 0;
    const key = steps[k].key;
    const punches = {};
    const changes = [];
    let tried = before.get(k);
    for (;;) {
      const order = orderOnly(tried);
      // The trial holds this hit at index k: a later step of the trial is step index − 1 as made.
      const made = order && order.step > tried.armed.place ? steps[order.step - 1] : null;
      if (
        !made ||
        !['punch', 'holder'].includes(order.tool) ||
        !sharpStep(fold, made) ||
        changes.some((c) => c.key === made.key) ||
        changes.length >= MOST_CHANGED
      )
        break;
      const die = DIES[made.die] || null;
      let cured = null;
      for (const { key: punch } of rackPunches({ punch: made.punch }, die)) {
        const next = { ...punches, ...Object.fromEntries(made.recordIds.map((id) => [id, punch])) };
        // Ruled out by the step's own check (the same inside radius: the rest of the trial unchanged).
        if (checked && radiusOf(punch, die) === radiusOf(made.punch, die)) {
          stepChecks++;
          if (!stepClears(key, next, order.step)) continue;
          stepPassed++;
        }
        const armed = { kind: 'before', key, punches: next };
        const result = run(armed);
        punchRuns++;
        const change = { key: made.key, number: made.index + 1, again: made.again, punch };
        if (passes(result)) {
          const all = [...changes, change].sort((a, b) => a.number - b.number);
          return {
            compound: {
              label: `Make this hit before ${steps[k].again ? 'step' : 'bend'} ${k + 1}, and ${punchChangeWords(all, 'with')}`,
              session: { armed },
              number: k + 1,
              changes: all.map((c) => ({ number: c.number, punch: c.punch })),
            },
            ...counts(),
          };
        }
        const moved = orderOnly(result);
        if (moved && moved.step !== order.step) {
          cured = { next, result, change };
          break;
        }
      }
      if (!cured) break;
      Object.assign(punches, cured.next);
      changes.push(cured.change);
      tried = cured.result;
    }
  }
  return counts();
}

// What the tries add to a card's words (§5.2): "bend this one earlier" only
// where try 1 found the place, else the order said tried; a part-way bend
// offered; the earlier bends with another punch offered (shop punches §6.2:
// "make this hit before bend 1 and make bend 1 with the A 101 punch", the
// part-way bend then said tried; the order is the offer's own, not said
// tried); `nothing` (no order, no part-way bend, no other punch for the
// earlier bends) for the caller to end with NO_WAY when nothing else is
// offered either.
function wayWords(ways) {
  if (!ways) return { first: false, partway: [], compound: [], tried: [], nothing: false };
  const nothing = !ways.first && !ways.partway && !ways.compound;
  return {
    first: Boolean(ways.first),
    partway: ways.partway ? [lower(ways.partway.label)] : [],
    compound: ways.compound ? [lower(ways.compound.label).replace(', and ', ' and make ')] : [],
    tried: ways.first
      ? []
      : ways.compound
        ? ways.openings
          ? ['a part-way bend first']
          : []
        : ['bending this one earlier', ...(nothing && ways.openings ? ['a part-way bend first'] : [])],
    nothing,
  };
}
// "A, B or C" in the card's style (the EARLIER branch keeps its own).
const orList = (items) => (items.length >= 2 ? `${items.slice(0, -1).join(', ')} or ${items.at(-1)}` : items[0] || '');
const capital = (text) => (text ? `${text[0].toUpperCase()}${text.slice(1)}` : text);

/**
 * A die or bed collision's words with the tries (§5.2): its own advice kept
 * where try 1 found the place (it says to bend this one before a bend, or
 * hangs a side the other way: said once); otherwise its order advice becomes
 * what was tried; a part-way bend found is offered. `hit`: the collision as
 * brakeCollisions worded it.
 */
function dieWays(hit, ways) {
  const way = wayWords(ways);
  const fact = factOf(hit.message);
  const rest = hit.message.slice(fact.length).trim();
  // A part-way bend, or the earlier bends with another punch (shop punches §6.2): offered alike.
  const partway = way.partway[0] || way.compound[0];
  if (hit.hanging) {
    // A side that hangs (brake flip tooling §5.4): its message tried the other order already.
    if (hit.hanging.otherFirst) return hit.message;
    const more = [
      way.first && `Made before bend ${ways.first.number} instead, it clears.`,
      partway && `Or ${partway}.`,
    ].filter(Boolean);
    return more.length ? `${hit.message} ${more.join(' ')}` : hit.message;
  }
  if (way.first) return rest ? hit.message : `${fact} ${EARLIER.ram}.`;
  // "Bending it before bend N would leave …": the order is already explained.
  if (/^Bending it before bend/.test(rest)) return partway ? `${hit.message} Or ${partway}.` : hit.message;
  const flip = rest && /flip the sheet/i.test(rest) ? 'flip the sheet (bend the other way up)' : null;
  const offered = [partway, flip].filter(Boolean);
  const said = way.tried.length
    ? ` ${capital(listed(way.tried))} ${way.tried.length > 1 ? 'were' : 'was'} tried: ${way.tried.length > 1 ? 'neither clears' : 'it does not clear'}.`
    : '';
  return `${fact}${offered.length ? ` ${capital(orList(offered))}.` : ''}${said}`;
}

/**
 * The station for `session` on `model`. Returns { closed } when its part is
 * gone, { error, part, feature } when the blank does not fold, else
 * { instance, part, feature, profile, polygon, fold, machine, machineKnown,
 * edges, gauge, segments, pending, view }.
 * segments: the material the punch line crosses (sheetMetal.js lineSegments,
 * each with `skipped`), for the flat blank's segment toggles (§6.2).
 * pending: null (no line picked), { error, data }, or brakeHit's result plus
 * { data (the stroke's bends to commit: one per tab the line bends, ids
 * pendingIds), bendIds, collision }. A collision whose advice names another
 * punch (brake blades §4.3) carries `fix: { label, session }` when the hit
 * made with that punch passes every check (tried; `advise: false` skips it).
 */
export function brakeStation({ model, session, params = {}, advise = true, checks = null, thickness = true }) {
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
  const key = model.fabrication?.shop?.machine || DEFAULT_MACHINE;
  const machineKnown = Boolean(MACHINES[key]);
  const machine = machineOf(machineKnown ? key : DEFAULT_MACHINE);
  const edges = gaugeEdges(polygon.outer);
  const { edge, line, gaugePoint } = sessionLine({ polygon, edges, fold }, session);
  // Gauging off a flange (skin gauge §4.3, §4.7): the line's flat distance from
  // the edge, the stop L is read from and the stops the edge has (Gauge off).
  const flat = edge ? flatDistance({ fold }, session, edge) : null;
  const stops = edge ? edgeStops(fold, edge) : [];
  const skip = session.skip || [];
  const segments = line ? lineSegments(polygon, line).map((s) => ({ ...s, skipped: skip.includes(s.index) })) : [];
  let pending = null,
    gauge = null;
  // A round bend: the automatic hit count for the session's radius and tooling (the panel's placeholder).
  // A radius punch (round-bend spec §12.6) makes it in one ordinary hit instead: no radius, no hits.
  const radiusPunch = Boolean(punchOf(session.punch).round);
  // Horn sections (punch library §4.1): a radius punch takes none.
  const hornsOn = radiusPunch ? null : hornOf(session.horns);
  const roundShape = session.shape === 'round' && !radiusPunch;
  let autoSteps = null;
  if (roundShape)
    try {
      const numbers = bendNumbers({
        thickness: fold.thickness,
        stock: fold.stock,
        angle: Number(session.angle),
        radius: Number(session.radius),
        kFactor: feature.kFactor == null || feature.kFactor === '' ? null : numeric(feature.kFactor, params),
        punch: punchOf(session.punch).key,
        die: session.die,
      });
      autoSteps = autoHits({ allowance: numbers.allowance, die: numbers.die, thickness: fold.thickness });
    } catch {
      autoSteps = null;
    }
  // Turn sheet around (§5.2) where no opposite edge goes back: the other side of the line to the backgauge.
  const turned = Boolean(session.turned);
  // Bend shape Offset (§5.3): two hits, flipped between (not with a radius punch, the one source of truth).
  const offsetShape = session.shape === 'offset' && !radiusPunch;
  if (line) {
    const base = {
      angle: Number(session.angle),
      direction: session.flip ? 'down' : 'up',
      radius: roundShape ? Number(session.radius) : null,
      ...(roundShape
        ? { steps: session.steps == null || session.steps === '' ? (autoSteps ?? 2) : Number(session.steps) }
        : {}),
      punch: punchOf(session.punch).key,
      ...(session.die ? { die: session.die } : {}),
      // Brake tool length (§3.1): only when set, so a fitted hit's record is as before.
      ...(trimSet(session.punchTrim) ? { punchTrim: Number(session.punchTrim) } : {}),
      ...(trimSet(session.dieTrim) ? { dieTrim: Number(session.dieTrim) } : {}),
      // Horn sections (docs/sketch-studio-punch-library.md §4.1): only when on, as the trims.
      ...(hornsOn ? { horns: hornSetting(hornsOn) } : {}),
    };
    // A made bend's line (docs/sketch-studio-tight-bends.md §4.4): this hit
    // bends it on. Its line, side and shape are the bend's; the angle is the
    // one after the hit; the punch, die and lengths are chosen as for any hit.
    const made = madeLine(fold, polygon, line, skip);
    let ids, data, folded;
    let again = null;
    // An armed try (§5.2): the hit made at its place in the order, or with a step opened part-way.
    const armed = offsetShape && !made ? null : armedOf(fold, session.armed, made?.bendIds || []);
    if (made) {
      const to = Number(session.angle);
      again = { bendIds: made.bendIds, from: made.from, to, number: made.number, lines: made.segments };
      const records = pendingIds(made.bendIds.length);
      ids = made.bendIds;
      data = made.bendIds.map((bendId, i) => ({
        id: records[i],
        again: bendId,
        angle: to,
        punch: punchOf(session.punch).key,
        ...(session.die ? { die: session.die } : {}),
        ...(trimSet(session.punchTrim) ? { punchTrim: Number(session.punchTrim) } : {}),
        ...(trimSet(session.dieTrim) ? { dieTrim: Number(session.dieTrim) } : {}),
        ...(hornsOn ? { horns: hornSetting(hornsOn) } : {}),
      }));
      folded = made.error
        ? { error: made.error }
        : radiusPunch
          ? { error: 'A radius punch makes a round bend: a bend is bent on with a straight punch.' }
          : !(to > made.from + 1e-9)
            ? { error: `Bend ${made.number} is already at ${fmt(made.from)}°: a hit only bends it further.` }
            : !(to <= 180)
              ? { error: `Bend ${made.number} on: a bend goes at most to 180°.` }
              : armed
                ? armedHit({
                    feature,
                    profile,
                    params,
                    data,
                    ids,
                    armed,
                    machine,
                    dieAuto: !session.die,
                    from: made.from,
                  })
                : againHit({ feature, profile, params, data, ids, from: made.from, machine, dieAuto: !session.die });
    } else {
      // One stroke, as many bends as separate tabs the line bends (§6.1).
      let lines;
      try {
        lines = strokeBends(feature, profile, params, { a: line.a, b: line.b, ...base }, { skip });
      } catch (error) {
        // The fold names the new bend by its place among the bends (a bend-on hit is none, §4.1).
        const number = madeBends(feature.bends || []).length + 1;
        // A line along or across a made bend (tight bends §7.4 (c)): said in the brake's words,
        // never a dead end where the bend can be bent on.
        lines = crossingRefusal(error, { fold, line, segments }) || {
          error: (error.message || String(error)).replace(`Bend ${number}`, 'This hit'),
        };
      }
      // An offset is made on one tab at a time.
      if (offsetShape && !lines.error && lines.length > 1)
        lines = {
          error: `The line crosses ${lines.length} separate tabs: an offset is made on one at a time. Click the others on the flat blank to leave them out.`,
        };
      ids = lines.error ? [PENDING_BEND] : pendingIds(lines.length);
      data = lines.error
        ? [{ id: PENDING_BEND, a: line.a, b: line.b, ...base }]
        : lines.map((l, i) => ({ id: ids[i], a: l.a, b: l.b, ...base }));
      // The reading first (the backgauge's reach is one of the checks).
      folded = lines.error
        ? lines
        : offsetShape
          ? null
          : armed
            ? armedHit({ feature, profile, params, data, ids, armed, machine, dieAuto: !base.die })
            : brakeHit({ feature, profile, params, bend: data, machine });
    }
    if (folded?.error)
      pending = {
        error: folded.error,
        data,
        bendIds: ids,
        ...(again ? { again } : {}),
        // Bend {n} on instead (§7.4 (c)).
        ...(folded.seat ? { seat: folded.seat } : {}),
      };
    else if (offsetShape && !again) {
      const ctx = {
        model,
        session,
        params,
        feature,
        profile,
        polygon,
        machine,
        line: { a: data[0].a, b: data[0].b },
        base,
        flip: Boolean(session.flip),
        edge,
        edges,
        gaugePoint,
        turned,
        reverse: punchReversed(session),
        advise,
      };
      ({ pending, gauge } = offsetPending(ctx));
      // Both hits share the tooling (brake tool length §3.1): line A's lengths stand for the pair.
      if (!pending.error && pending.fold && pending.bend)
        pending.tooling = strokeTooling(pending.fold, [pending.bend.id], { bed: machine.bed });
    } else {
      // An armed try (§5.2): the other bends as they stand when this hit is made there.
      const others = armed ? folded.others || {} : {};
      // What the backgauge reads (skin gauge §4.2): off the edge beside the line,
      // else off the skin of the part as it stands then (this stroke's bends flat).
      gauge = edge
        ? turned
          ? { distance: null, reason: TURNED_GAUGE }
          : brakeReading(folded.fold, ids, edge, { angles: others })
        : { distance: null, reason: 'Two-point line: no backgauge edge.' };
      // The stop by its number at the brake (the bends as made, not the armed order's places).
      if (gauge.stop) gauge = { ...gauge, stop: { ...gauge.stop, number: bendNumber(fold, gauge.stop.bendId) } };
      const hit =
        gauge.distance != null
          ? assessBend(folded.fold, ids.length === 1 ? ids[0] : ids, {
              machine,
              gauge,
              dieAuto: !base.die,
              label: 'This hit',
              // The part before the stroke: a bend bent on stands at its angle (§4.4).
              angles: { ...others, ...Object.fromEntries(ids.map((id) => [id, again ? again.from : 0])) },
            })
          : folded;
      // A held stop the line has left (skin gauge §4.5 step 4): the fingers would not read the field's L, so refused in words.
      const off = gauge.distance != null && !armed ? stopRefusal({ session, fold, gauge, edge, flat }) : null;
      if (off) hit.refusals = [...hit.refusals, off];
      const inLine = hit.refusals.some((r) => r.code === 'not-in-line');
      // The collision check of this hit (also the card's quick punch check, shop punches §6.5).
      const check = inLine
        ? null
        : {
            fold: hit.fold,
            bendIds: ids,
            angles: others,
            machine,
            punch: hit.punch,
            die: hit.die,
            gaugePoint,
            turned,
            reverse: punchReversed(session),
            // A bend bent on runs from the angle it stands at (§4.3).
            ...(again ? { start: again.from, target: again.to } : {}),
            ...(again ? {} : { number: armed ? folded.place + 1 : hitSequence(hit.fold).length }),
          };
      pending = {
        ...hit,
        data,
        bendIds: ids,
        ...(again ? { again } : {}),
        ...(armed ? { armed: { ...armed, place: folded.place }, others } : {}),
        // A stroke whose tabs are not in line cannot be posed in the die: no collision check.
        collision: inLine
          ? { hit: null, samples: 0, ms: 0, turnedClears: false }
          : collision({ ...check, advise }, { thickness, profile, params }),
      };
      // The part stands over the horns (punch library §4.3): said, as the brake checks only the stroke.
      if (pending.collision.hooked) pending.warnings = [...pending.warnings, { code: 'horn-hooked', message: HOOKED }];
      // A new bend whose leg is too short because the line lies along a made bend
      // (tight bends §7.4 (c)): that bend on instead, beside the refusal's own fix.
      if (!again && hit.refusals.some((r) => r.code === 'short-leg')) {
        const need = minLeg(hit.die, Number(session.angle));
        const near = bendAlong(fold, polygon, line, skip, (bend) => need + bend.allowance / 2);
        const key = near && bendOnKey(fold, near.bendId);
        if (key) pending.seat = { key, number: near.number, off: near.off, label: `Bend ${near.number} on instead` };
      }
      // (§5.2 (ii)) Armed, the steps after this hit must be no worse with it
      // made there (try 2: the steps from the one opened on, and the bend-on
      // entry that finishes it): re-checked here, so at the pedal, as every hit is.
      if (armed && !pending.refusals.length && !pending.collision.hit) {
        const place = folded.place;
        const since = armed.kind === 'before' ? place : armed.step.index;
        const worse = worseFrom({
          trial: folded.trial,
          from: since,
          skip: [place],
          since,
          fold,
          today: checks,
          machine,
        });
        // The step it names and why (docs/sketch-studio-shop-punches.md §6.2): `step` its
        // index in the trial, `tool` its collision's tool (null: refused by the machine).
        if (worse)
          pending.refusals = [
            ...pending.refusals,
            {
              code: 'order',
              message: `That order is refused: step ${worse.index + 1} could not be made then. ${worse.collision?.message || worse.refusals[0].message}`,
              step: worse.index,
              tool: worse.collision?.tool ?? null,
            },
          ];
      }
      // Brake tool length (§3.2): where the punch and die stand along the line, for the panel's lengths.
      pending.tooling = strokeTooling(hit.fold, ids, { bed: machine.bed });
      // Metal inside metal at the end (corner gaps §5) is the outline's: no punch, turn or order cures it.
      const thick = Boolean(pending.collision.hit?.thickness);
      const punchTry =
        advise && !thick ? punchFix({ model, session, params, hit: pending.collision.hit, die: hit.die, check }) : null;
      if (punchTry?.fix) pending.collision = { ...pending.collision, fix: punchTry.fix };
      // Horn sections (docs/sketch-studio-punch-library.md §4.4), tried before a
      // shorter punch: the corners pressed, where shortening leaves them open.
      const hornTry =
        advise && pending.collision.hit ? hornFix({ model, session, params, hit: pending.collision.hit }) : null;
      if (hornTry) pending.collision = { ...pending.collision, horn: hornTry };
      // The punch or die fitted or shorter (§3.5), a button of its own when the hit clears with it.
      const lengthTry = advise && pending.collision.hit ? lengthFix({ model, session, params, pending }) : null;
      if (lengthTry?.fix) pending.collision = { ...pending.collision, length: lengthTry.fix };
      // "Turned around it clears" is a button (§5.2), only when the whole hit passes that way.
      if (advise && pending.collision.turnedClears) {
        const patch = turnAround({ edges, edge, fold }, session);
        const tried = brakeStation({
          model,
          // A new edge is a new line, as the workspace takes it: every segment back, the tooling fitted.
          session: brakePatch(session, patch),
          params,
          advise: false,
          thickness: false,
        }).pending;
        if (tried && !tried.error && !tried.refusals.length && !tried.collision?.hit)
          pending.collision = { ...pending.collision, turn: { label: 'Turn the sheet around', session: patch } };
      }
      // The brake finds the way (tight bends §5.2), after the remedies above:
      // this hit first, else a made step part-way first; each a button only
      // where the station's own checks passed it armed. Not while a try is armed.
      const contact = pending.collision.hit;
      const ways =
        advise && !armed && contact && WAY_TOOLS.includes(contact.tool)
          ? wayTries({
              model,
              session,
              params,
              fold,
              machine,
              pending,
              today: checks,
              feature,
              profile,
              // Try 3 is the last resort (shop punches §6.2): not when the card offers a remedy for this hit.
              offered: Boolean(
                pending.collision.turn || pending.collision.fix || pending.collision.horn || pending.collision.length,
              ),
            })
          : null;
      // Try 3 (docs/sketch-studio-shop-punches.md §6.2): `compound` only when found.
      if (ways?.first || ways?.partway || ways?.compound)
        pending.collision = {
          ...pending.collision,
          ways: {
            first: ways.first || null,
            partway: ways.partway || null,
            ...(ways.compound ? { compound: ways.compound } : {}),
          },
        };
      // The punch, its holders or the ram: the advice says what was tried (BT-2 follow-up).
      if (advise && contact?.tool === 'ram') {
        // The ram (brake tool length §3.6): the facts, every taller punch tried, the height the bend needs.
        const ramStill = Boolean(punchTry?.ramStill) && !pending.collision.fix;
        const need = ramStill
          ? ramClearance({
              fold: hit.fold,
              bendIds: ids,
              angles: others,
              machine,
              die: hit.die,
              gaugePoint,
              turned,
              ...(again ? { start: again.from, target: again.to } : {}),
            })
          : null;
        pending.collision = {
          ...pending.collision,
          hit: {
            ...contact,
            message: ramAdvice(contact, {
              turn: pending.collision.turn,
              fix: pending.collision.fix,
              tried: punchTry?.tried || [],
              ramStill,
              punch: hit.punch,
              machine,
              need,
              ways,
            }),
          },
        };
      } else if (advise && contact && EARLIER[contact.tool] && !contact.hanging)
        pending.collision = {
          ...pending.collision,
          hit: {
            ...contact,
            message: triedAdvice(contact, {
              turn: pending.collision.turn,
              fix: pending.collision.fix,
              tried: punchTry?.tried || [],
              length: lengthTry,
              horn: pending.collision.horn || null,
              ways,
            }),
          },
        };
      // A side hanging from a back-to-back pair (§5.4): the step that clears, found by moving this line.
      const hanging = pending.collision.hit?.hanging;
      if (advise && hanging?.advised && !hanging.otherFirst) {
        const step = hangingStep({ model, session, params, edge, pending, hanging });
        if (step != null)
          pending.collision = {
            ...pending.collision,
            hit: { ...pending.collision.hit, step, message: hangingMessage(hanging, { step }) },
          };
      }
      // The die or the bed (§5.2): its order advice said only as tried.
      if (ways && (contact.tool === 'die' || contact.tool === 'bed'))
        pending.collision = {
          ...pending.collision,
          hit: { ...pending.collision.hit, message: dieWays(pending.collision.hit, ways) },
        };
      // The die fitted or shorter (§3.5): said after the die's own advice, only as tried.
      if (lengthTry?.kind === 'die' && (lengthTry.fix || lengthTry.tried.length)) {
        const said = lengthTry.fix
          ? ` Or ${lower(lengthTry.fix.label)}.`
          : ` ${lengthTry.tried[0][0].toUpperCase()}${lengthTry.tried[0].slice(1)} was tried: it does not clear.`;
        pending.collision = {
          ...pending.collision,
          hit: { ...pending.collision.hit, message: `${pending.collision.hit.message}${said}` },
        };
      }
    }
  }
  return {
    instance,
    part,
    feature,
    profile,
    polygon,
    fold,
    machine,
    machineKnown,
    machineKey: key,
    edges,
    edge,
    gaugePoint,
    gauge,
    // Gauging off a flange (skin gauge §4.3, §4.6, §4.7): the line's flat
    // distance from the gauge edge (gauge mode), the stop L is read from (a
    // bend id, null the edge), the edge's stops, and the hint that the same L
    // would also make a line off a flange.
    flat,
    stop: edge ? sessionStop(fold, session) : null,
    stops,
    gaugeHint: edge ? gaugeHint({ fold, session, edge, stops, pending }) : null,
    segments,
    pending,
    // Round (§6): the automatic hit count for the session's radius, or null.
    autoSteps,
    view: stationView({ session, fold, pending, gaugePoint, gauge, machine }),
  };
}

/** A stroke's timeline: one stroke, or a round bend's hits (`steps`), from the hit's ram depth. */
export const hitTimeline = (machine, depth, steps = null) =>
  steps > 1 ? bumpTimeline(machine, depth, steps) : strokeTimeline(machine, depth);

// What the viewport poses (shopLayer.setStation): the fold, the stroke sitting
// in the die (bendId its first bend, bendIds all of them; null: the flat blank
// on the die), the other bends' angles, the tooling and, while a stroke runs,
// the stroke. `turned` (brake flip tooling §5.2): the other side of the line
// to the backgauge; `flipped` (§5.1): the sheet the other way up while no
// bend is in the die (with one, its direction says which side is up).
function stationView({ session, fold, pending, gaugePoint, gauge, machine }) {
  // `reverse`: the punch turned round in its clamps (brake blades §4.2), drawn mirrored.
  const base = {
    key: session.key,
    instanceId: session.instanceId,
    machine: machine.key,
    punch: session.punch,
    reverse: punchReversed(session),
    turned: Boolean(session.turned),
    flipped: Boolean(session.flip),
  };
  if (session.stroke) return { ...base, ...session.stroke.view, stroke: session.stroke.run };
  if (session.scrub) {
    // `scrub.bendId`: the step's key (its first record: a bend-on step's own, tight bends §4.4).
    const stroke = stepOf(fold, session.scrub.bendId);
    if (stroke) {
      const pose = stepPose(fold, stroke.index, { after: Boolean(session.scrub.after) });
      return {
        ...base,
        // A made step shown (hands on the sheet §5.3): its own pose, never swung to.
        scrub: true,
        fold: pose.fold,
        bendId: stroke.bendIds[0],
        bendIds: stroke.bendIds,
        angles: pose.angles,
        die: stroke.die,
        gaugePoint: null,
      };
    }
  }
  if (pending && !pending.error) {
    const hit = pending.collision?.hit;
    // An offset (§5.3) poses its first hit, or the hit a collision happens in.
    if (pending.view)
      return {
        ...base,
        ...pending.view,
        collision: hit ? { angle: hit.angle, tool: hit.tool, triangles: hit.triangles } : null,
      };
    return {
      ...base,
      fold: pending.fold,
      bendId: pending.bendIds[0],
      bendIds: pending.bendIds,
      // A bend bent on sits in the die at the angle it stands at (tight bends §4.4); an
      // armed try (§5.2) shows the sheet as it is then: the later steps flat, a step part-way.
      angles: {
        ...(pending.others || {}),
        ...Object.fromEntries(pending.bendIds.map((id) => [id, hit ? hit.angle : pending.again?.from || 0])),
      },
      die: pending.die.key,
      punch: pending.punch.key,
      gaugePoint,
      gaugeDistance: gauge?.distance ?? null,
      collision: hit ? { angle: hit.angle, tool: hit.tool, triangles: hit.triangles } : null,
      // A round bend's collision is shown in the hit it happens in.
      ...(hit?.bump ? { hit: hit.bump } : {}),
    };
  }
  const last = session.lastHit && stepOf(fold, session.lastHit.bendId);
  const shown = last || hitSequence(fold).at(-1);
  if (shown)
    return {
      ...base,
      fold,
      bendId: shown.bendIds[0],
      bendIds: shown.bendIds,
      angles: {},
      die: shown.die,
      punch: last ? session.lastHit.punch || session.punch : shown.punch,
      gaugePoint: last ? session.lastHit.gaugePoint : null,
    };
  return { ...base, fold, bendId: null, bendIds: [], angles: {}, die: null, gaugePoint: null };
}

/**
 * The stroke the pedal starts for a pending hit that passed: the bends to
 * commit (fresh ids from `newId()`; several share a fresh `strokeId`, §6.1),
 * the fold they are made on, the timeline and the view it animates. `token`
 * names it, so its end is matched to it. (`id`: one bend's id, the SM-2 form.)
 */
export function startStroke({ station, token, id = null, newId = null, strokeId = null, params = {} }) {
  const { pending, feature, profile, machine } = station;
  if (pending.pair) return startOffset({ station, token, id, newId, params });
  if (pending.again) return startAgain({ station, token, id, newId, strokeId, params });
  const many = pending.data.length > 1;
  const sharing = many ? strokeId || `${id || PENDING_BEND}-stroke` : null;
  const bends = pending.data.map((d, i) => ({
    ...d,
    id: newId ? newId() : i ? `${id}-${i + 1}` : id,
    punch: pending.punch.key,
    die: pending.die.key,
    ...(sharing ? { stroke: sharing } : {}),
  }));
  // An armed try (tight bends §5.2): the records at their place, or a step opened part-way.
  const way = armedStroke({ station, records: bends, id, newId, params });
  const fold = way?.fold || foldSheet({ ...feature, bends: [...(feature.bends || []), ...bends] }, profile, params);
  const ids = bends.map((b) => b.id);
  return {
    bend: bends[0],
    bends,
    ...(way ? { placed: way.placed, notice: way.notice } : {}),
    gaugePoint: station.gaugePoint,
    view: {
      fold,
      bendId: ids[0],
      bendIds: ids,
      // Armed, the other bends as they stand then (the later steps flat, a step part-way).
      angles: pending.others || {},
      die: bends[0].die,
      punch: bends[0].punch,
      gaugePoint: station.gaugePoint,
      gaugeDistance: station.gauge?.distance ?? null,
    },
    run: {
      token,
      bendId: ids[0],
      bendIds: ids,
      target: pending.bend.angle,
      timeline: hitTimeline(machine, pending.readouts.ramDepth, pending.readouts.hits),
      // The slant the part comes off the punch along (docs/sketch-studio-shop-punches.md §5.3): view only.
      takeOff: pending.collision?.takeOff ?? null,
      commit: true,
    },
  };
}

/**
 * The offset bend's pedal (§5.3): both hits in one stroke of the station
 * (the `BRAKE` table's STROKE → DONE once, as a round bend's hits): hit one,
 * the sheet turned over (TURN_MS, view only), hit two. The two bends are
 * ordinary records with fresh ids, in the order made, sharing no stroke id.
 * `run.hits`: each hit's pose { bendId, bendIds, angles, gaugePoint, turned,
 * gaugeDistance }; `bend` (the last hit, for the station's last-hit view) and
 * `gaugePoint` are the second hit's.
 */
function startOffset({ station, token, id, newId, params }) {
  const { pending, feature, profile, machine } = station;
  const ids = pending.pair.map((_, i) => (newId ? newId() : i ? `${id}-2` : id));
  const bends = pending.pair.map((h, i) => ({ ...h.data, id: ids[i], punch: h.punch.key, die: h.die.key }));
  const fold = foldSheet({ ...feature, bends: [...(feature.bends || []), ...bends] }, profile, params);
  const hits = pending.pair.map((h, i) => ({
    bendId: ids[i],
    bendIds: [ids[i]],
    // The second bend still flat while the first is made.
    angles: i ? {} : { [ids[1]]: 0 },
    gaugePoint: h.gaugePoint,
    turned: h.turned,
    gaugeDistance: h.gauge?.distance ?? null,
    // Each hit's take-off (shop punches §5.3), view only.
    takeOff: h.collision?.takeOff ?? null,
  }));
  const [first, second] = pending.pair;
  return {
    bend: bends[1],
    bends,
    gaugePoint: second.gaugePoint,
    view: { fold, ...hits[0], die: bends[0].die, punch: bends[0].punch },
    run: {
      token,
      bendId: ids[0],
      bendIds: [ids[0]],
      target: first.bend.angle,
      timeline: pairTimeline(
        strokeTimeline(machine, first.readouts.ramDepth),
        strokeTimeline(machine, second.readouts.ramDepth),
      ),
      hits,
      commit: true,
    },
  };
}

/**
 * The pedal of an armed try (tight bends §5.2): the feature's bends as the
 * one commit leaves them (`placed`: the records at their place, or appended
 * with the step opened part-way and its bend-on entry, a fresh id), the fold
 * the stroke is shown on, and for a part-way step the note the card shows
 * after it. null when nothing is armed.
 */
function armedStroke({ station, records, id, newId, params }) {
  const { pending, feature, profile } = station;
  const { armed } = pending;
  if (!armed) return null;
  const finishId = armed.kind === 'partway' ? (newId ? newId() : `${id}-finish`) : undefined;
  const placed = placedBends(feature.bends || [], records, armed, finishId);
  const fold = foldSheet({ ...feature, bends: placed }, profile, params);
  const finished = finishId ? stepOf(fold, finishId) : null;
  // The earlier bends with another punch (shop punches §6.2): numbered as the
  // rows read after the commit (this hit now stands before them).
  const changed = armed.changes
    ? armed.changes.map((c) => ({ ...c, number: (stepOf(fold, c.key)?.index ?? c.number - 1) + 1 }))
    : null;
  return {
    placed,
    fold,
    notice: finished
      ? `Bend ${armed.number} now stands at ${fmt(armed.angle)}° and is finished in step ${finished.index + 1}.`
      : changed
        ? `${capital(punchChangeWords(changed, 'now'))}.`
        : null,
  };
}

/**
 * A bend-on hit's pedal (tight bends §4.4): the stroke runs from the angle the
 * bend stands at to the angle after the hit; its end commits the bend-on
 * entries (fresh ids, one per tab, several sharing a fresh `stroke`, §6.1).
 * `run.from`: the angle the stroke starts at.
 */
function startAgain({ station, token, id, newId, strokeId, params }) {
  const { pending, feature, profile, machine } = station;
  const many = pending.data.length > 1;
  const sharing = many ? strokeId || `${id || PENDING_BEND}-stroke` : null;
  const records = pending.data.map((d, i) => ({
    ...d,
    id: newId ? newId() : i ? `${id}-${i + 1}` : id,
    punch: pending.punch.key,
    die: pending.die.key,
    ...(sharing ? { stroke: sharing } : {}),
  }));
  const way = armedStroke({ station, records, id, newId, params });
  const fold = way?.fold || foldSheet({ ...feature, bends: [...(feature.bends || []), ...records] }, profile, params);
  const ids = pending.again.bendIds;
  return {
    bend: records[0],
    bends: records,
    ...(way ? { placed: way.placed, notice: way.notice } : {}),
    gaugePoint: station.gaugePoint,
    view: {
      fold,
      bendId: ids[0],
      bendIds: ids,
      angles: pending.others || {},
      die: records[0].die,
      punch: records[0].punch,
      gaugePoint: station.gaugePoint,
      gaugeDistance: station.gauge?.distance ?? null,
    },
    run: {
      token,
      bendId: ids[0],
      bendIds: ids,
      from: pending.again.from,
      target: pending.again.to,
      // A bend-on hit is one hit, timed as one (§4.3).
      timeline: hitTimeline(machine, pending.readouts.ramDepth),
      takeOff: pending.collision?.takeOff ?? null,
      commit: true,
    },
  };
}

/**
 * A view-only re-run of a step already made (`bendId`: the step's key): the
 * steps after it as they were then, it bent again from the angle it started
 * at (0, or a bend-on step's angle before it, tight bends §4.3).
 */
export function rerunStroke({ station, token, bendId }) {
  const { fold, machine } = station;
  const stroke = stepOf(fold, bendId);
  const pose = stepPose(fold, stroke.index);
  const ids = stroke.bendIds;
  const report = assessBend(pose.fold, ids.length === 1 ? ids[0] : ids, { machine });
  // The stroke poses its own bends: only the others' angles stand in the view.
  const angles = Object.fromEntries(Object.entries(pose.angles).filter(([id]) => !ids.includes(id)));
  const from = stroke.from[ids[0]] || 0;
  // The part taken off the punch as the pedal's stroke takes it (shop punches
  // §5.3), the return alone checked, as the view poses it (no gauge, this
  // side back, the punch as the station clamps it).
  const takeOff = takeOffOf({
    fold: pose.fold,
    bendIds: ids,
    angles,
    machine,
    punch: stroke.punch,
    die: stroke.die,
    reverse: Boolean(station.view?.reverse),
    ...(from > 0 ? { start: from } : {}),
    target: stroke.to[ids[0]],
  });
  return {
    view: {
      fold: pose.fold,
      bendId: ids[0],
      bendIds: ids,
      angles,
      die: stroke.die,
      punch: stroke.punch,
      gaugePoint: null,
      // A made step shown (hands on the sheet §5.3): the sheet is not swung back to the line after it.
      scrub: true,
    },
    run: {
      token,
      bendId: ids[0],
      bendIds: ids,
      ...(from > 0 ? { from } : {}),
      target: stroke.to[ids[0]],
      timeline: hitTimeline(machine, report.readouts.ramDepth, stroke.again ? null : report.readouts.hits),
      takeOff,
      commit: false,
    },
  };
}

/**
 * Every stroke of the sequence checked as the machine would make it, in
 * order (§9 SM-2 item 8, shop floor §6.1): the later strokes still flat, the
 * stroke's own tooling, either way round on the die. Returns [{ bendId (the
 * stroke's first bend), bendIds, index (the stroke's place), label,
 * refusals, collision }] (collision: the hit when both ways round collide,
 * else null; a stroke whose tabs are no longer in line is refused, not posed).
 */
export function sequenceChecks({ fold, machine, profile = null, params = {}, thickness = true }) {
  const surface = partSurface(fold);
  // The steps in the order made (tight bends §4.3): each from its `from` to
  // its `to`, the other bends as they stand then, its own angle and tooling;
  // each step's end at the sheet's true thickness (corner gaps §5).
  return hitSequence(fold).map((stroke, index) =>
    stepCheck(fold, stroke, index, machine, surface, { thickness, profile, params }),
  );
}

/**
 * The stored sequence's remedies (tight bends §5.2): for each step that
 * collides, the pending hit's two tries as moves of the made steps — the step
 * moved before an earlier one (the latest first; a bend-on step stays after
 * its bend), else an earlier step (a sharp bend of one tab, made in one hit,
 * not hit again before this one) opened to the first of PART_WAY below its
 * angle that works (45° first), finished by a bend-on entry right after this
 * step. A step stopped by its punch or holder (a sharp step) with neither
 * gets a third (docs/sketch-studio-shop-punches.md §6.3): the first sharp
 * punch in RACK_ORDER, its own left out and not blunter than its die, that it
 * is made with. Each is tried on the folded new order: it folds, this step
 * passes and fewer steps fail than now (what changeBrakeBends, which commits
 * it, re-checks). `newId()`: the finishing entry's id. { [step key]: { move,
 * partway, punch } }, each { label, bends (feature.bends to commit) } or
 * null; steps with none are left out.
 */
export function sequenceTries({ feature, profile, params = {}, machine, checks = null, newId = () => FINISH_ID }) {
  const fold = foldSheet(feature, profile, params);
  const steps = hitSequence(fold);
  const today = checks || sequenceChecks({ fold, machine, profile, params });
  // The trials on the mid-surface (corner gaps §5: a search, not a verdict), today's failures counted alike.
  const failing = today.filter(failedMid).length;
  const bends = feature.bends || [];
  const recordsOf = (step) => bends.slice(step.start, step.end + 1);
  const better = (list, index) => {
    if (foldProblem({ ...feature, bends: list }, profile, params)) return false;
    const trial = sequenceChecks({
      fold: foldSheet({ ...feature, bends: list }, profile, params),
      machine,
      thickness: false,
    });
    return !failed(trial[index]) && failingSteps(trial) < failing;
  };
  const tries = {};
  for (const [n, step] of steps.entries()) {
    // Metal inside metal at a step's end (§5) is the outline's: no other order or punch cures it.
    if (!today[n]?.collision || today[n].collision.thickness) continue;
    const records = recordsOf(step);
    const rest = steps.filter((s) => s !== step).map(recordsOf);
    let move = null;
    for (let k = n - 1; k > lastOf(steps.slice(0, n), step.bendIds) && !move; k--) {
      const list = [...rest.slice(0, k), records, ...rest.slice(k)].flat();
      if (better(list, k)) move = { label: `Move step ${n + 1} before step ${k + 1}`, bends: list };
    }
    let partway = null;
    for (let k = n - 1; k >= 0 && !move && !partway; k--) {
      const open = steps[k];
      const [id] = open.bendIds;
      const bend = fold.bends.find((b) => b.id === id);
      if (open.again || open.bendIds.length > 1 || !bend || isRoundBend(bend) || step.bendIds.includes(id)) continue;
      if (
        steps.slice(0, k).some((s) => s.bendIds.includes(id)) ||
        steps.slice(k + 1, n).some((s) => s.bendIds.includes(id))
      )
        continue;
      const [made] = recordsOf(open);
      for (const angle of PART_WAY.filter((a) => a < open.to[id] - 1e-9)) {
        const list = [
          ...bends.slice(0, step.end + 1).map((b) => (b === made ? { ...b, angle } : b)),
          finishOf({ ...made, angle: open.to[id] }, newId()),
          ...bends.slice(step.end + 1),
        ];
        if (better(list, n)) {
          partway = { label: `Bend ${k + 1} to ${fmt(angle)}° first`, bends: list };
          break;
        }
      }
    }
    // §6.3: the step made with another punch of the rack (no move together with it, §6.6).
    let punch = null;
    if (!move && !partway && ['punch', 'holder'].includes(today[n].collision.tool) && sharpStep(fold, step))
      for (const { key } of rackPunches({ punch: step.punch }, DIES[step.die] || null)) {
        const list = bends.map((b, i) => (i >= step.start && i <= step.end ? { ...b, punch: key } : b));
        if (better(list, n)) {
          punch = { label: `Make step ${n + 1} with ${punchWords(key)}`, bends: list };
          break;
        }
      }
    if (move || partway || punch) tries[step.key] = { move, partway, punch };
  }
  return tries;
}

/** How many steps of a sequence the machine refuses (refusal or collision). */
export const failingSteps = (checks) => checks.filter((c) => c.refusals.length || c.collision).length;
