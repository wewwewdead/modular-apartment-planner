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
  sheetMetalFeature,
  stepOf,
  stepPose,
  strokeBends,
} from './sheetMetal.js';
import {
  DEFAULT_MACHINE,
  DIES,
  MACHINES,
  PUNCHES,
  SHORTEST_SECTION,
  machineOf,
  maxBendAngle,
  punchOf,
  punchSymmetric,
} from './shopCatalog.js';
import {
  assessBend,
  backSide,
  brakeHit,
  bumpTimeline,
  gaugeBendLine,
  gaugeEdges,
  gaugeReading,
  MIN_COVERAGE,
  pairTimeline,
  strokeTimeline,
  strokeTooling,
} from './pressBrake.js';
import {
  ADVISED_PUNCH,
  EARLIER,
  PUNCH_LABELS,
  brakeCollisions,
  hangingMessage,
  partSurface,
  ramClearance,
} from './brakeCollisions.js';
import { nodeName } from './groups.js';

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
  // (a stored step is rechecked with it); reset with `skip` by a new line.
  punchTrim: null,
  dieTrim: null,
  // The brake finds the way (docs/sketch-studio-tight-bends.md §5.2): a try
  // the collision card offered and the operator armed — { kind: 'before',
  // key } (this hit before the step `key`) or { kind: 'partway', key, angle }
  // (the step `key` opened to `angle`, finished after this hit). The pending
  // hit is checked, posed and committed that way; null: made last, as ever.
  armed: null,
});

/**
 * What stays in the machine when the brake moves to the next part without the
 * station being left (docs/sketch-studio-outline-edit-sheet-nest.md §7.3):
 * the punch, the die and which way round the punch is clamped — never the
 * picks (edge, L, points, angle, shape, skips, trims, turned, scrub, the last
 * hit). null with no session. A die that does not suit the next part is told
 * by the station's own checks, as when it is chosen by hand.
 */
export function brakeCarry(session) {
  if (!session) return null;
  const defaults = brakeSessionDefaults();
  return {
    punch: session.punch ?? defaults.punch,
    die: session.die ?? defaults.die,
    reverse: Boolean(session.reverse),
  };
}

/**
 * The session patch that puts the punch `key` in (brake blades §4.1): the one
 * rule the Punch select and the blade picker share. A radius punch is Round ·
 * Radius punch (round-bend spec §12.6); between a radius punch and any other
 * the die goes back to automatic.
 */
export function punchChoice(session, key) {
  const round = Boolean(PUNCHES[key]?.round);
  return {
    punch: key,
    ...(round ? { shape: 'round' } : {}),
    ...(round !== Boolean(PUNCHES[session.punch]?.round) ? { die: null } : {}),
  };
}
/**
 * The session after a patch, as the workspace applies every pick
 * (docs/sketch-studio-brake-hands-on.md §5.4: the one copy of the rule). A
 * new line (an edge, L, points or the mode) puts every segment back in the
 * hit (shop floor §6.2), starts the right way round (Turn sheet around, brake
 * flip tooling §5.2) and fits the punch and die to it (brake tool length
 * §3.1); a patch naming `skip` is a segment toggle on the same line.
 * `station` (brakeStation(), docs/sketch-studio-tight-bends.md §4.4): a line
 * that arrives on a made bend's line with an angle not above the bend's sets
 * the angle to 90° (to 180° for a bend at 90° or more), once, on arriving;
 * the line moving on before the angle is touched puts the angle it had back
 * (`arrived`: { from, set }, the spec's silence filled: a gauge edge clicked
 * at the last L may pass over a made line on the way to the one meant).
 */
export function brakePatch(session, patch, station = null) {
  const newLine = ['edge', 'distance', 'points', 'mode'].some((k) => k in patch) && !('skip' in patch);
  const next = {
    ...session,
    ...(newLine ? { skip: [], turned: false, punchTrim: null, dieTrim: null } : {}),
    ...patch,
  };
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
  return next;
}

/**
 * The punch line a session picks (§9 SM-2): a gauge edge and L, or two
 * points. `station`: { polygon, edges } (brakeStation's). { edge, line,
 * gaugePoint } (line null while none is picked).
 */
export function sessionLine({ polygon, edges }, session) {
  const edge = session.mode === 'gauge' && session.edge != null ? edges[session.edge] || null : null;
  let line = null;
  if (edge) line = gaugeBendLine(polygon.outer, edge, Number(session.distance) || 0);
  else if (session.mode === 'points' && session.points?.length === 2)
    line = { a: session.points[0], b: session.points[1] };
  return { edge, line, gaugePoint: edge ? [(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2] : null };
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
  const { fold, polygon, edges } = station;
  const step = fold ? stepOf(fold, key) : null;
  if (!step) return null;
  const ids = [...new Set(step.bendIds)];
  const members = ids.map((id) => fold.bends.find((b) => b.id === id)).filter(Boolean);
  if (!members.length) return null;
  const fresh = { turned: false, punchTrim: null, dieTrim: null, scrub: null };
  const fit = (line) => {
    const skip = lineSegments(polygon, line)
      .filter((s) => !members.some((b) => runsOf(b).some((run) => sameRun(run, [s.a, s.b]))))
      .map((s) => s.index);
    const made = madeLine(fold, polygon, line, skip);
    return made && made.bendIds.length === ids.length && ids.every((id) => made.bendIds.includes(id)) ? skip : null;
  };
  const [first] = members;
  const gauged = (edges || [])
    .filter((e) => Math.abs(e.d[0] * first.u[1] - e.d[1] * first.u[0]) < 1e-6)
    .map((e) => ({
      edge: e,
      distance: exact((first.a[0] - e.a[0]) * e.inward[0] + (first.a[1] - e.a[1]) * e.inward[1]),
    }))
    .filter((g) => g.distance > 1e-6)
    .sort((p, q) => p.distance - q.distance);
  for (const { edge, distance } of gauged) {
    const skip = fit(gaugeBendLine(polygon.outer, edge, distance));
    if (skip) return { mode: 'gauge', edge: edge.index, distance, skip, ...fresh };
  }
  const along = members.flatMap((b) =>
    b.intervals.flat().map((s) => {
      const p = [b.a[0] + b.u[0] * s, b.a[1] + b.u[1] * s];
      return (p[0] - first.a[0]) * first.u[0] + (p[1] - first.a[1]) * first.u[1];
    }),
  );
  const point = (s) => [exact(first.a[0] + first.u[0] * s), exact(first.a[1] + first.u[1] * s)];
  const points = [point(Math.min(...along)), point(Math.max(...along))];
  const skip = fit({ a: points[0], b: points[1] });
  return skip ? { mode: 'points', points, skip, ...fresh } : null;
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

// A collision, and whether the sheet turned around (the other side to the back) clears.
function collision(options) {
  const result = brakeCollisions(options);
  if (!result.hit) return { ...result, turnedClears: false };
  const turned = brakeCollisions({ ...options, turned: !options.turned, advise: false });
  return { ...result, turnedClears: !turned.hit, ms: result.ms + turned.ms };
}

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
    const L = Number(session.distance) || 0;
    const point = [edge.a[0] + edge.inward[0] * L, edge.a[1] + edge.inward[1] * L];
    const opposite = !session.turned && oppositeEdge(edges || [], edge, point);
    if (opposite) return { edge: opposite.edge.index, distance: exact(opposite.distance), turned: false };
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

// A collision whose advice names a punch (brakeCollisions.js ADVISED_PUNCH)
// offers it as one click (brake blades §4.3), only when the hit really passes
// with it: the throat to the operator first, then reversed. A reversed punch
// is first tried turned back round (the smallest change). { fix (null when
// none passes), tried: what was tried and does not pass, in words for the
// card (BT-2 follow-up: "turning the punch round", "the gooseneck punch",
// "the gooseneck punch reversed", "the gooseneck punch either way round") }.
// A ram hit (brake tool length §3.6) tries every taller punch in the
// catalogue instead: the straight-flanked ones of the same angle that stand
// the ram higher, the lowest first. `ramStill`: the tallest of them was tried
// and still meets the ram (no punch in the list holds it high enough).
const tallerPunches = (session) => {
  const own = punchOf(session.punch);
  return Object.values(PUNCHES)
    .filter((p) => !p.round && p.angle === own.angle && p.height > own.height + 1e-9)
    .sort((a, b) => a.height - b.height)
    .map((p) => ({ key: p.key, label: PUNCH_LABELS[p.key] || `Use the ${p.name} punch` }));
};
function punchFix({ model, session, params, hit }) {
  const ram = hit?.tool === 'ram';
  const candidates = ram ? tallerPunches(session) : hit && ADVISED_PUNCH[hit.tool] ? [ADVISED_PUNCH[hit.tool]] : [];
  if (!candidates.length) return { fix: null, tried: [], ramStill: ram };
  const nameOf = (c) => c.label.replace(/^Use the /, 'the ');
  const tries = [
    ...(punchReversed(session) ? [[session.punch, false, null]] : []),
    ...candidates.flatMap((c) =>
      (punchSymmetric(punchOf(c.key)) ? [false] : [false, true]).map((reverse) => [c.key, reverse, c]),
    ),
  ];
  const failed = [];
  const tallest = candidates.at(-1);
  let ramStill = ram;
  for (const [key, reverse, c] of tries) {
    const same = key === session.punch;
    if (same && reverse === punchReversed(session)) continue;
    const patch = { ...punchChoice(session, key), reverse };
    const { pending } = brakeStation({ model, session: { ...session, ...patch }, params, advise: false });
    if (!pending || pending.error || pending.refusals.length || pending.collision?.hit) {
      const name = c ? nameOf(c) : null;
      const what = same ? 'turning the punch round' : reverse ? `${name} reversed` : name;
      if (!failed.includes(what)) failed.push(what);
      // Every way the tallest was tried must still meet the ram to say none holds it high enough.
      if (c === tallest && pending?.collision?.hit?.tool !== 'ram') ramStill = false;
      continue;
    }
    return {
      fix: {
        label: same ? 'Turn the punch round' : reverse ? `${c.label}, reversed` : c.label,
        session: patch,
      },
      tried: failed,
      ramStill: false,
    };
  }
  let tried = failed;
  for (const c of candidates) {
    const name = nameOf(c);
    if (tried.includes(name) && tried.includes(`${name} reversed`))
      tried = [...tried.filter((f) => f !== name && f !== `${name} reversed`), `${name} either way round`];
  }
  return { fix: null, tried, ramStill };
}

// The patch that sets a tool's trim (§3.4): fitted is null.
const trimKey = { punch: 'punchTrim', die: 'dieTrim' };
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
    const tried = brakeStation({ model, session: { ...session, [key]: trim }, params, advise: false }).pending;
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
  const spare = allowed.at(-1) - now;
  const atEnds = (hit.runs || []).length
    ? hit.triangles.every((triangle) => {
        const xs = triangle.map((p) => p[0]);
        const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
        return hit.runs.every(([x0, x1]) => {
          const a = Math.max(lo, x0),
            b = Math.min(hi, x1);
          return b < a || b <= x0 + spare + 1e-6 || a >= x1 - spare - 1e-6;
        });
      })
    : false;
  if (!atEnds) return { kind, fix: null, tried: [] };
  // The shortest still colliding settles it; refused instead (its load, §3.3), a longer one may pass.
  const shortest = brakeStation({
    model,
    session: { ...session, [key]: allowed.at(-1) },
    params,
    advise: false,
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
  const said = failed.length
    ? ` ${listed(failed)[0].toUpperCase()}${listed(failed).slice(1)} ${failed.length > 1 ? 'were' : 'was'} tried: ${
        failed.length > 2 ? 'none clears' : failed.length > 1 ? 'neither clears' : 'it does not clear'
      }.`
    : '';
  return `${factOf(hit.message)} ${stands}${remedy}${none}${said}${nothing ? ` ${NO_WAY}` : ''}`;
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
function triedAdvice(hit, { turn, fix, tried, length = null, ways = null }) {
  const facts = factOf(hit.message);
  // The brake finds the way (tight bends §5.2): "bend this one earlier" only
  // where try 1 found the place (its button names it), else the order is
  // said tried; a part-way bend found is offered with the rest.
  const way = wayWords(ways);
  const offered = [
    turn && 'turn the sheet around',
    fix &&
      `${fix.label[0].toLowerCase()}${fix.label.slice(1)}${fix.label.startsWith('Use') ? PUNCH_WHY[hit.tool] || '' : ''}`,
    // Brake tool length §3.5: the punch fitted or shorter, when that clears.
    length?.fix && lower(length.fix.label),
    ...way.partway,
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
  const said = failed.length
    ? ` ${listed(failed)[0].toUpperCase()}${listed(failed).slice(1)} ${failed.length > 1 ? 'were' : 'was'} tried: ${
        failed.length > 2 ? 'none clears' : failed.length > 1 ? 'neither clears' : 'it does not clear'
      }.`
    : '';
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
      ? Object.keys(PUNCHES).map((key) => [key, punchChoice(session, key)])
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
      const L = Number(session.distance) || 0;
      return { distance: exact(L + Math.sign(L - madeL) * move) };
    }
    const sign = across > 0 ? -1 : 1;
    return { points: session.points.map((p) => [p[0] + bend.n[0] * sign * move, p[1] + bend.n[1] * sign * move]) };
  };
  const clears = (step) => {
    const tried = brakeStation({ model, session: { ...session, ...patchFor(step) }, params, advise: false }).pending;
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
    const hit =
      quick && refused
        ? { hit: null, samples: 0, ms: 0 }
        : brakeCollisions({
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
          });
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
      : gaugeReading(pair.alone.fold, OFFSET_IDS[0], edge)
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
/** The part-way angles tried for a step in the way, the largest first (§5.2 try 2). */
export const PART_WAY = Object.freeze([60, 45, 30, 15]);
// The tools whose collision the order and a part-way bend may cure (§5.2).
const WAY_TOOLS = ['ram', 'punch', 'holder', 'die', 'bed'];
// The bend-on entry that finishes a step opened part-way, while it is only tried.
const FINISH_ID = `${PENDING_BEND}:finish`;
/** Try 3 (§5.2): nothing in the order and no part-way bend clears it, and nothing else was offered. */
export const NO_WAY =
  'No order and no part-way bend clears it with this punch either: the shape cannot be closed with the tools in this rack. Make the web wider or the flange shorter, or use tooling this rack does not hold.';
const TRIM_FIELDS = ['punchTrim', 'dieTrim'];
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
 * put in before the record `key` (try 1: this hit first); with { kind:
 * 'partway', key, angle } appended, the record `key` set to `angle` and a
 * bend-on entry (`finishId`) taking it back to its own angle after this hit
 * (try 2). No new keys: an ordinary record at a place, or one angle changed
 * and a TB-1 bend-on entry.
 */
export function placedBends(bends, records, armed = null, finishId = FINISH_ID) {
  if (armed?.kind === 'before') {
    const at = bends.findIndex((b) => b.id === armed.key);
    if (at >= 0) return [...bends.slice(0, at), ...records, ...bends.slice(at)];
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

/**
 * The session's armed try (§5.2) as it stands on `fold` (the part as made):
 * the step it names must still be there, a bend-on hit (`own`, its bends)
 * must stay after its bend, and a step opened part-way must be a sharp bend
 * of one tab, made in one hit (its only one), above the angle. Else null:
 * the hit is made last, as if nothing were armed.
 */
function armedOf(fold, armed, own = []) {
  if (!armed?.key) return null;
  const steps = hitSequence(fold);
  const step = steps.find((s) => s.key === armed.key);
  if (!step) return null;
  const words = { number: step.index + 1, again: step.again };
  if (armed.kind === 'before') return step.index > lastOf(steps, own) ? { ...armed, ...words, step } : null;
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
  return fits ? { ...armed, ...words, angle, step, bendId: id, to: step.to[id] } : null;
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

/** One step of the sequence (hitSequence's `index`) checked as the machine would make it: sequenceChecks' row. */
function stepCheck(fold, stroke, index, machine, surface) {
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
  if (today) allowed = today.filter((c, i) => i >= since && failed(c)).length;
  else {
    const surface = partSurface(fold);
    for (let i = since; i < made.length; i++) if (failed(stepCheck(fold, made[i], i, machine, surface))) allowed++;
  }
  const steps = hitSequence(trial);
  const surface = partSurface(trial);
  let failing = 0;
  for (let i = from; i < steps.length; i++) {
    if (skip.includes(i)) continue;
    const check = stepCheck(trial, steps[i], i, machine, surface);
    if (failed(check) && ++failing > allowed) return check;
  }
  return null;
}

/**
 * The tries (§5.2) for a pending hit that collides, on the station's own
 * checks with the try armed (brakeStation, `advise: false`): the same checks
 * the pedal makes. Try 1, this hit first: the latest place before a made step
 * (after a bend-on hit's own bend) where this hit passes with that step and
 * the later ones not yet made and every step after it is no worse. Try 2,
 * when no place passes: the made steps from the latest back, each a sharp
 * bend of one tab made in one hit (not this hit's own), at the largest of
 * PART_WAY below its angle with which that step, the steps between, this hit
 * and the bend-on entry finishing it all pass. `today`: sequenceChecks of
 * the part as made. null with nothing made to reorder, else { first, partway
 * ({ label, session } or absent), places, openings (how many were tried) }.
 */
export function wayTries({ model, session, params, fold, machine, pending, today }) {
  const steps = hitSequence(fold);
  if (!steps.length) return null;
  const checks = today || sequenceChecks({ fold, machine });
  const own = pending.again?.bendIds || [];
  const passes = (armed) => {
    const tried = brakeStation({ model, session: { ...session, armed }, params, advise: false, checks }).pending;
    return Boolean(tried?.armed && !tried.error && !tried.refusals.length && !tried.collision?.hit);
  };
  let places = 0,
    openings = 0;
  for (let k = steps.length - 1; k > lastOf(steps, own); k--) {
    places++;
    const armed = { kind: 'before', key: steps[k].key };
    if (passes(armed))
      return {
        first: {
          label: `Make this hit before ${steps[k].again ? 'step' : 'bend'} ${k + 1}`,
          session: { armed },
          number: k + 1,
        },
        places,
        openings,
      };
  }
  for (let k = steps.length - 1; k >= 0; k--) {
    const step = steps[k];
    const angles = PART_WAY.filter((a) => a < (step.to[step.bendIds[0]] ?? 0) - 1e-9);
    if (!angles.length || !armedOf(fold, { kind: 'partway', key: step.key, angle: angles[0] }, own)) continue;
    openings++;
    for (const angle of angles) {
      const armed = { kind: 'partway', key: step.key, angle };
      if (passes(armed))
        return {
          partway: {
            label: `Bend ${k + 1} to ${fmt(angle)}° first, finish it after this hit`,
            session: { armed },
            number: k + 1,
            angle,
          },
          places,
          openings,
        };
    }
  }
  return { places, openings };
}

// What the tries add to a card's words (§5.2): "bend this one earlier" only
// where try 1 found the place, else the order said tried; a part-way bend
// offered; try 3 (`nothing`: no order, no part-way bend) for the caller to
// end with NO_WAY when nothing else is offered either.
function wayWords(ways) {
  if (!ways) return { first: false, partway: [], tried: [], nothing: false };
  const nothing = !ways.first && !ways.partway;
  return {
    first: Boolean(ways.first),
    partway: ways.partway ? [lower(ways.partway.label)] : [],
    tried: ways.first
      ? []
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
  const partway = way.partway[0];
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
  return `${fact}${offered.length ? ` ${capital(orList(offered))}.` : ''} ${capital(listed(way.tried))} ${way.tried.length > 1 ? 'were' : 'was'} tried: ${way.tried.length > 1 ? 'neither clears' : 'it does not clear'}.`;
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
export function brakeStation({ model, session, params = {}, advise = true, checks = null }) {
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
  const { edge, line, gaugePoint } = sessionLine({ polygon, edges }, session);
  const skip = session.skip || [];
  const segments = line ? lineSegments(polygon, line).map((s) => ({ ...s, skipped: skip.includes(s.index) })) : [];
  let pending = null,
    gauge = null;
  // A round bend: the automatic hit count for the session's radius and tooling (the panel's placeholder).
  // A radius punch (round-bend spec §12.6) makes it in one ordinary hit instead: no radius, no hits.
  const radiusPunch = Boolean(punchOf(session.punch).round);
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
        lines = { error: (error.message || String(error)).replace(`Bend ${number}`, 'This hit') };
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
    if (folded?.error) pending = { error: folded.error, data, bendIds: ids, ...(again ? { again } : {}) };
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
      gauge = edge
        ? turned
          ? { distance: null, reason: TURNED_GAUGE }
          : gaugeReading(folded.fold, ids, edge)
        : { distance: null, reason: 'Two-point line: no backgauge edge.' };
      // An armed try (§5.2): the other bends as they stand when this hit is made there.
      const others = armed ? folded.others || {} : {};
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
      const inLine = hit.refusals.some((r) => r.code === 'not-in-line');
      pending = {
        ...hit,
        data,
        bendIds: ids,
        ...(again ? { again } : {}),
        ...(armed ? { armed: { ...armed, place: folded.place }, others } : {}),
        // A stroke whose tabs are not in line cannot be posed in the die: no collision check.
        collision: inLine
          ? { hit: null, samples: 0, ms: 0, turnedClears: false }
          : collision({
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
              advise,
            }),
      };
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
        if (worse)
          pending.refusals = [
            ...pending.refusals,
            {
              code: 'order',
              message: `That order is refused: step ${worse.index + 1} could not be made then. ${worse.collision?.message || worse.refusals[0].message}`,
            },
          ];
      }
      // Brake tool length (§3.2): where the punch and die stand along the line, for the panel's lengths.
      pending.tooling = strokeTooling(hit.fold, ids, { bed: machine.bed });
      const punchTry = advise ? punchFix({ model, session, params, hit: pending.collision.hit }) : null;
      if (punchTry?.fix) pending.collision = { ...pending.collision, fix: punchTry.fix };
      // The punch or die fitted or shorter (§3.5), a button of its own when the hit clears with it.
      const lengthTry = advise && pending.collision.hit ? lengthFix({ model, session, params, pending }) : null;
      if (lengthTry?.fix) pending.collision = { ...pending.collision, length: lengthTry.fix };
      // "Turned around it clears" is a button (§5.2), only when the whole hit passes that way.
      if (advise && pending.collision.turnedClears) {
        const patch = turnAround({ edges, edge }, session);
        const tried = brakeStation({
          model,
          // A new edge is a new line, as the workspace takes it: every segment back, the tooling fitted.
          session: brakePatch(session, patch),
          params,
          advise: false,
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
          ? wayTries({ model, session, params, fold, machine, pending, today: checks })
          : null;
      if (ways?.first || ways?.partway)
        pending.collision = {
          ...pending.collision,
          ways: { first: ways.first || null, partway: ways.partway || null },
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
  return {
    placed,
    fold,
    notice: finished
      ? `Bend ${armed.number} now stands at ${fmt(armed.angle)}° and is finished in step ${finished.index + 1}.`
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
export function sequenceChecks({ fold, machine }) {
  const surface = partSurface(fold);
  // The steps in the order made (tight bends §4.3): each from its `from` to
  // its `to`, the other bends as they stand then, its own angle and tooling.
  return hitSequence(fold).map((stroke, index) => stepCheck(fold, stroke, index, machine, surface));
}

/**
 * The stored sequence's remedies (tight bends §5.2): for each step that
 * collides, the pending hit's two tries as moves of the made steps — the step
 * moved before an earlier one (the latest first; a bend-on step stays after
 * its bend), else an earlier step (a sharp bend of one tab, made in one hit,
 * not hit again before this one) opened to the largest of PART_WAY below its
 * angle that works, finished by a bend-on entry right after this step. Each
 * is tried on the folded new order: it folds, this step passes and fewer
 * steps fail than now (what changeBrakeBends, which commits it, re-checks).
 * `newId()`: the finishing entry's id. { [step key]: { move, partway } }, each
 * { label, bends (feature.bends to commit) } or null; steps with neither are
 * left out.
 */
export function sequenceTries({ feature, profile, params = {}, machine, checks = null, newId = () => FINISH_ID }) {
  const fold = foldSheet(feature, profile, params);
  const steps = hitSequence(fold);
  const today = checks || sequenceChecks({ fold, machine });
  const failing = failingSteps(today);
  const bends = feature.bends || [];
  const recordsOf = (step) => bends.slice(step.start, step.end + 1);
  const better = (list, index) => {
    if (foldProblem({ ...feature, bends: list }, profile, params)) return false;
    const trial = sequenceChecks({ fold: foldSheet({ ...feature, bends: list }, profile, params), machine });
    return !failed(trial[index]) && failingSteps(trial) < failing;
  };
  const tries = {};
  for (const [n, step] of steps.entries()) {
    if (!today[n]?.collision) continue;
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
    if (move || partway) tries[step.key] = { move, partway };
  }
  return tries;
}

/** How many steps of a sequence the machine refuses (refusal or collision). */
export const failingSteps = (checks) => checks.filter((c) => c.refusals.length || c.collision).length;
