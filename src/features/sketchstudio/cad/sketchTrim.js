// Trim and Extend (docs/sketch-studio-hand-drawing.md §8.1, §8.2, HD-4): a
// pick says what a click at the cursor would take (or why not), a cut applies
// it and returns the new list. Exact crossings on true arcs (sketchIntersect.js)
// and the meet rule: a cut or landing point within MEET_MM of another piece's
// end IS that end, and a piece's cut points include every other piece's end
// lying within MEET_MM of it (an arc stored as three points rounded to 1e-6 mm
// is not exactly the circle it was cut from: a second trim must not hang on an
// exact crossing with the first one's result). Pure: no three, no DOM.
import { arcGeometry, explode, roundPoint, samePoint } from './sketchProfile.js';
import { distanceToPrimitive, intersect, primitiveBox } from './sketchIntersect.js';
import { TINY_MM } from './sketchCheck.js';

// A cut or landing point this near (mm) another piece's end is that end (sketchProfile.js `chains` grid cell).
export const MEET_MM = 1e-3;
// A cut point this near (mm, along the piece) to its own end is that end: no span.
const END_MM = 1e-6;
const TAU = Math.PI * 2;
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
const len = (p) => Math.hypot(p[0], p[1]);
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
export const fmtMm = (value) => Number(value.toFixed(2)).toString();
const none = (message) => ({ type: 'none', message });
const NOUNS = { rect: 'rectangle', slot: 'slot', polygon: 'polygon', circle: 'circle', line: 'line', arc: 'arc' };

// A line or arc piece as a primitive (sketchIntersect.js); null for an arc on three points in a line.
export function primitiveOf(piece) {
  if (piece.type === 'line') return { type: 'segment', a: piece.a, b: piece.b };
  if (piece.type === 'circle') return { type: 'circle', center: piece.c, radius: piece.r };
  const geometry = arcGeometry(piece.a, piece.m, piece.b);
  return geometry ? { type: 'arc', ...geometry, a: piece.a, b: piece.b } : null;
}
/**
 * Every piece of a drawing: { index (in entities), k (the piece's place in
 * explode for a rect, slot, polygon or rounded rectangle; null for a line, an
 * arc or a circle itself), piece, prim, box, ends }. Construction entities
 * take part (all entities cut); the model's edges never do.
 */
export function drawingPieces(entities) {
  const all = [];
  entities.forEach((entity, index) => {
    const whole = entity.type === 'line' || entity.type === 'arc' || entity.type === 'circle';
    const pieces = whole ? [entity] : explode(entity);
    pieces.forEach((piece, k) => {
      const prim = primitiveOf(piece);
      if (!prim || (prim.type === 'segment' && samePoint(prim.a, prim.b, 0))) return;
      all.push({
        index,
        k: whole ? null : k,
        piece,
        prim,
        box: primitiveBox(prim),
        ends: prim.type === 'circle' ? [] : [piece.a, piece.b],
      });
    });
  });
  return all;
}
const grow = ([x0, y0, x1, y1], d) => [x0 - d, y0 - d, x1 + d, y1 + d];
const overlaps = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
// The piece nearest `raw` within `tolerance` (the first of equals), or null.
export function nearestPiece(all, raw, tolerance) {
  let best = null,
    bestDistance = Infinity;
  for (const item of all) {
    const [x0, y0, x1, y1] = item.box;
    if (raw[0] < x0 - tolerance || raw[0] > x1 + tolerance || raw[1] < y0 - tolerance || raw[1] > y1 + tolerance)
      continue;
    const d = distanceToPrimitive(raw, item.prim);
    if (d <= tolerance && d < bestDistance) [best, bestDistance] = [item, d];
  }
  return best;
}

// A piece measured along itself: its length and, both ways, a point and its
// distance s from the piece's start (an arc in its sweep, a circle
// counter-clockwise from its rightmost point).
export function measureOf(prim) {
  if (prim.type === 'segment') {
    const d = sub(prim.b, prim.a);
    const length = len(d);
    const u = [d[0] / length, d[1] / length];
    return {
      length,
      at: (p) => dot(sub(p, prim.a), u),
      point: (s) => [prim.a[0] + u[0] * s, prim.a[1] + u[1] * s],
    };
  }
  const { center, radius } = prim;
  const angleAt = (p) => Math.atan2(p[1] - center[1], p[0] - center[0]);
  const pointAt = (t) => [center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)];
  if (prim.type === 'circle')
    return {
      length: TAU * radius,
      closed: true,
      at: (p) => (((angleAt(p) % TAU) + TAU) % TAU) * radius,
      point: (s) => pointAt(s / radius),
    };
  const dir = prim.sweep < 0 ? -1 : 1;
  const sweep = Math.abs(prim.sweep);
  return {
    length: radius * sweep,
    dir,
    at: (p) => {
      let t = ((((angleAt(p) - prim.start) * dir) % TAU) + TAU) % TAU;
      // Past the end by less than half the gap: beyond the end; else before the start.
      if (t > sweep + (TAU - sweep) / 2) t -= TAU;
      return t * radius;
    },
    point: (s) => pointAt(prim.start + (dir * s) / radius),
  };
}

// The ends lying within MEET_MM of `prim` (all pieces but `self`): where the meet rule snaps to.
function endsNear(all, prim, box, self) {
  const ends = [];
  for (const other of all) {
    if (other === self || !other.ends.length || !overlaps(box, other.box)) continue;
    for (const end of other.ends) if (distanceToPrimitive(end, prim) <= MEET_MM) ends.push(end);
  }
  return ends;
}
// The meet rule: the nearest of `ends` within MEET_MM of `point`, else the point rounded as drawn points are.
function meet(point, ends) {
  let best = null,
    bestDistance = MEET_MM;
  for (const end of ends) {
    const d = dist(end, point);
    if (d <= bestDistance) [best, bestDistance] = [end, d];
  }
  return best || roundPoint(point);
}

/**
 * The cut points of one piece of the drawing (§8.1): its crossings with
 * every piece of the other entities and every other piece's end lying within
 * MEET_MM of it, each crossing landed on an end within MEET_MM. [{ s, point,
 * end }] in order along the piece, none at its own ends, each once (an end
 * wins over a crossing at the same place).
 */
export function cutPoints(all, target) {
  const box = grow(target.box, MEET_MM);
  const near = endsNear(all, target.prim, box, target);
  const found = near.map((point) => ({ point, end: true }));
  for (const other of all) {
    if (other.index === target.index || !overlaps(box, other.box)) continue;
    for (const p of intersect(target.prim, other.prim)) {
      const point = meet(p, near);
      found.push({ point, end: near.includes(point) });
    }
  }
  const measure = measureOf(target.prim);
  const cuts = [];
  for (const cut of found) {
    const s = measure.at(cut.point);
    if (!measure.closed && (s <= END_MM || s >= measure.length - END_MM)) continue;
    cuts.push({ s, point: cut.point, end: cut.end });
  }
  cuts.sort((x, y) => x.s - y.s || Number(y.end) - Number(x.end));
  const once = [];
  for (const cut of cuts) {
    const last = once.at(-1);
    if (last && cut.s - last.s <= END_MM) continue;
    once.push(cut);
  }
  // A circle's first and last cut points across its start are one too.
  if (measure.closed && once.length > 1 && once[0].s + measure.length - once.at(-1).s <= END_MM) once.pop();
  return once;
}

/**
 * What a Trim click at `raw` would remove (§8.2): `{ type: 'span', index, id,
 * k, kind ('line' | 'arc' | 'circle'), from, to, whole, length }` — the span
 * of the piece under the cursor between its nearest cut points (`from` before
 * the cursor, `to` after it, null at the piece's own start or end; a circle's
 * run counter-clockwise from `from` to `to`) — or `{ type: 'none', message }`.
 */
export function trimPick({ entities = [], raw, tolerance = 0 }) {
  const all = drawingPieces(entities);
  const target = raw && nearestPiece(all, raw, tolerance);
  if (!target) return none('Point at a line, arc or circle to trim.');
  const entity = entities[target.index];
  const measure = measureOf(target.prim);
  const cuts = cutPoints(all, target);
  const at = Math.max(0, Math.min(measure.length, measure.at(raw)));
  const kind = target.prim.type === 'segment' ? 'line' : target.prim.type;
  const base = { type: 'span', index: target.index, id: entity.id, k: target.k, kind, shape: entity.type };
  if (measure.closed) {
    if (cuts.length < 2) return { ...base, from: null, to: null, whole: true, length: measure.length };
    let from = cuts.at(-1),
      to = cuts[0];
    for (let i = 0; i < cuts.length; i++)
      if (cuts[i].s > at) {
        [from, to] = [cuts[(i - 1 + cuts.length) % cuts.length], cuts[i]];
        break;
      }
    const length = (((to.s - from.s) % measure.length) + measure.length) % measure.length;
    return { ...base, from, to, whole: false, length };
  }
  const from = cuts.filter((c) => c.s < at).at(-1) || null;
  const to = cuts.find((c) => c.s >= at) || null;
  const length = (to ? to.s : measure.length) - (from ? from.s : 0);
  return { ...base, from, to, whole: !from && !to, length };
}

// The run of a line or arc between s0 and s1 (its ends given), or null when it would be tiny.
function runOf(source, prim, measure, s0, s1, a, b) {
  if (s1 - s0 < TINY_MM) return null;
  if (prim.type === 'segment') return { ...source, a, b };
  const m = roundPoint(measure.point((s0 + s1) / 2));
  return arcGeometry(a, m, b) ? { ...source, a, b, m } : null;
}
// An entity's keys besides its geometry (construction carries over).
function restOf(entity) {
  const {
    id: _id,
    type: _t,
    a: _a,
    b: _b,
    m: _m,
    c: _c,
    r: _r,
    length: _l,
    width: _w,
    angle: _g,
    sides: _s,
    af: _f,
    ...rest
  } = entity;
  return rest;
}
/**
 * `entities` with the shape at `index` (a rect, slot, polygon or rounded
 * rectangle) as its lines and arcs in its place, new ids from `next()`: {
 * list, pieces: the new pieces in explode order }. Shared by the Edit tools.
 */
export function explodeAt(entities, index, next) {
  const pieces = explode(entities[index]).map((piece) => ({ id: next(), ...piece }));
  return { list: [...entities.slice(0, index), ...pieces, ...entities.slice(index + 1)], pieces };
}

/**
 * The span a pick names removed (§8.2) → `{ entities, added: [ids],
 * replaced: [the entities as they were], nextId, text, pieces: [] (nothing
 * added), removed: [the geometry that goes] }`, or throws in words with
 * nothing changed. A line or arc only shortened keeps its id; a span from its
 * middle leaves two pieces, the second new, right after it; a circle becomes
 * the arc that is left (new id); a shape becomes its lines and arcs first. A
 * piece left under TINY_MM goes with the span. Entities not touched keep
 * their objects.
 */
export function trimCut({ entities = [], pick, nextId }) {
  if (!pick || pick.type === 'none') throw new Error(pick?.message || 'Point at a line, arc or circle to trim.');
  const entity = entities[pick.index];
  if (!entity || entity.id !== pick.id) throw new Error('That is no longer in the drawing.');
  let next = nextId;
  const newId = () => `e${next++}`;
  const added = [],
    replaced = [],
    removed = [];
  let list = entities,
    index = pick.index,
    source = entity;
  // A shape: its lines and arcs first, the picked one cut from them.
  if (pick.k != null) {
    replaced.push(entity);
    const exploded = explodeAt(entities, pick.index, newId);
    added.push(...exploded.pieces.map((p) => p.id));
    list = exploded.list;
    index = pick.index + pick.k;
    source = exploded.pieces[pick.k];
  }
  const prim = primitiveOf(source);
  const measure = measureOf(prim);
  let kept = [];
  if (pick.kind === 'circle') {
    replaced.push(entity);
    if (pick.whole) removed.push({ type: 'circle', c: entity.c, r: entity.r });
    else {
      const { from, to } = pick;
      const keep = (((from.s - to.s) % measure.length) + measure.length) % measure.length;
      const m = roundPoint(measure.point(to.s + keep / 2));
      const gone = roundPoint(measure.point(from.s + pick.length / 2));
      removed.push({ type: 'arc', a: from.point, b: to.point, m: gone });
      if (keep >= TINY_MM && arcGeometry(to.point, m, from.point)) {
        const id = newId();
        added.push(id);
        kept = [{ id, type: 'arc', a: to.point, b: from.point, m, ...restOf(entity) }];
      } else removed.push({ type: 'arc', a: to.point, b: from.point, m });
    }
  } else {
    const { from, to } = pick;
    const [s0, s1] = [from ? from.s : 0, to ? to.s : measure.length];
    const [p0, p1] = [from ? from.point : source.a, to ? to.point : source.b];
    const span = runOf({ type: source.type }, prim, measure, s0, s1, p0, p1) || {
      type: 'line',
      a: p0,
      b: p1,
    };
    removed.push(span.type === 'arc' ? span : { type: 'line', a: p0, b: p1 });
    // What stays before and after the span: the first keeps the id, the second is new.
    const before = from && runOf(source, prim, measure, 0, s0, source.a, p0);
    const after = to && runOf(source, prim, measure, s1, measure.length, p1, source.b);
    if (from && !before) removed.push({ type: 'line', a: source.a, b: p0 });
    if (to && !after) removed.push({ type: 'line', a: p1, b: source.b });
    if (before) kept.push(before);
    if (after) {
      if (before) {
        const id = newId();
        added.push(id);
        kept.push({ id, ...restOf(source), type: source.type, ...geometryOf(after) });
      } else kept.push(after);
    }
    if (pick.k == null) replaced.push(entity);
  }
  // A shape's piece that went whole leaves no id behind.
  const result = [...list.slice(0, index), ...kept, ...list.slice(index + 1)];
  const gone = added.filter((id) => !result.some((e) => e.id === id));
  return {
    entities: result,
    added: added.filter((id) => !gone.includes(id)),
    replaced,
    nextId: next,
    text: pick.whole
      ? `Nothing crosses it: click removes the whole ${pick.k != null ? 'side' : NOUNS[pick.kind]}`
      : `Trim ${fmtMm(pick.length)} mm`,
    pieces: [],
    removed,
  };
}
const geometryOf = (piece) =>
  piece.type === 'arc' ? { a: piece.a, b: piece.b, m: piece.m } : { a: piece.a, b: piece.b };

/**
 * What an Extend click at `raw` would do (§8.2): `{ type: 'end', index, id,
 * end ('a' | 'b'), from (the end now), to (where it lands), run (mm) }` — the
 * end of the line or arc under the cursor nearer the cursor runs on, a line
 * straight, an arc round its own circle, to the first piece it meets (the
 * meet rule lands it on an end within MEET_MM) — or `{ type: 'none', message }`.
 */
export function extendPick({ entities = [], raw, tolerance = 0 }) {
  const all = drawingPieces(entities);
  const target = raw && nearestPiece(all, raw, tolerance);
  if (!target) return none('Point near the end of a line or arc to extend it.');
  const entity = entities[target.index];
  if (entity.type === 'circle') return none('A circle has no end to extend.');
  if (target.k != null) return none(`A ${NOUNS[entity.type]} is closed: there is no end to extend.`);
  const end = dist(raw, entity.a) <= dist(raw, entity.b) ? 'a' : 'b';
  const from = entity[end];
  const others = all.filter((item) => item.index !== target.index);
  // Ends a landing may be (the meet rule): every piece's but the extended one's.
  const ends = all.filter((item) => item !== target).flatMap((item) => item.ends);
  const base = { type: 'end', index: target.index, id: entity.id, end, from };
  if (target.prim.type === 'segment') {
    const other = end === 'a' ? entity.b : entity.a;
    const d = sub(from, other);
    const u = [d[0] / len(d), d[1] / len(d)];
    let reach = 1;
    for (const item of all) for (const v of item.box) reach = Math.max(reach, Math.abs(v));
    const ray = { type: 'segment', a: from, b: [from[0] + u[0] * reach * 4, from[1] + u[1] * reach * 4] };
    const candidates = [];
    for (const item of others) {
      for (const p of intersect(ray, item.prim)) candidates.push(p);
      for (const e of item.ends) if (distanceToPrimitive(e, ray) <= MEET_MM) candidates.push(e);
    }
    let best = null;
    for (const p of candidates) {
      const to = meet(p, ends);
      const s = dot(sub(to, from), u);
      if (s <= END_MM || samePoint(to, from, 0) || (best && s >= best.run)) continue;
      best = { to, run: dist(to, from) };
    }
    if (!best) return none('Nothing ahead of this end to extend to.');
    return { ...base, ...best };
  }
  // An arc runs on round its own circle, the way it sweeps, short of its own other end.
  const { center, radius, start, sweep } = target.prim;
  const dir = (sweep < 0 ? -1 : 1) * (end === 'b' ? 1 : -1);
  const fromAngle = end === 'b' ? start + sweep : start;
  const room = TAU - Math.abs(sweep);
  const circle = { type: 'circle', center, radius };
  const turnTo = (p) => {
    const t = Math.atan2(p[1] - center[1], p[0] - center[0]);
    return ((((t - fromAngle) * dir) % TAU) + TAU) % TAU;
  };
  const candidates = [];
  for (const item of others) {
    for (const p of intersect(circle, item.prim)) candidates.push(p);
    for (const e of item.ends) if (Math.abs(dist(e, center) - radius) <= MEET_MM) candidates.push(e);
  }
  let best = null;
  for (const p of candidates) {
    const to = meet(p, ends);
    const turn = turnTo(to);
    if (turn * radius <= END_MM || turn >= room - END_MM / radius || samePoint(to, from, 0)) continue;
    if (best && turn >= best.turn) continue;
    best = { to, turn };
  }
  if (!best) return none('This arc meets only its own other end: there is nothing to extend it to.');
  return { ...base, to: best.to, run: best.turn * radius, turn: best.turn };
}

/**
 * The end a pick names run on (§8.2) → `{ entities, added: [], replaced,
 * nextId, text, pieces: [the run added], removed: [] }`, or throws in words.
 * The line or arc keeps its id; an arc keeps its circle, its middle point the
 * middle of the longer arc.
 */
export function extendCut({ entities = [], pick, nextId }) {
  if (!pick || pick.type === 'none')
    throw new Error(pick?.message || 'Point near the end of a line or arc to extend it.');
  const entity = entities[pick.index];
  if (!entity || entity.id !== pick.id) throw new Error('That is no longer in the drawing.');
  let changed, run;
  if (entity.type === 'line') {
    changed = { ...entity, [pick.end]: pick.to };
    run = { type: 'line', a: pick.from, b: pick.to };
  } else {
    const { center, radius, start, sweep } = arcGeometry(entity.a, entity.m, entity.b);
    const dir = sweep < 0 ? -1 : 1;
    const at = (t) => roundPoint([center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)]);
    const total = Math.abs(sweep) + pick.turn;
    // The arc from its start the way it sweeps: an `a` moved runs back from the old start first.
    const first = pick.end === 'a' ? start - dir * pick.turn : start;
    changed = { ...entity, [pick.end]: pick.to, m: at(first + (dir * total) / 2) };
    const runFrom = pick.end === 'b' ? start + sweep : start;
    const runDir = pick.end === 'b' ? dir : -dir;
    run = { type: 'arc', a: pick.from, b: pick.to, m: at(runFrom + (runDir * pick.turn) / 2) };
  }
  return {
    entities: entities.map((e, i) => (i === pick.index ? changed : e)),
    added: [],
    replaced: [entity],
    nextId,
    text: `click to extend ${fmtMm(pick.run)} mm`,
    pieces: [run],
    removed: [],
  };
}
