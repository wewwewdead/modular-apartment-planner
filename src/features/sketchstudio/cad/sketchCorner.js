// Fillet and Chamfer (docs/sketch-studio-hand-drawing.md §8.1, §8.3, HD-4): a
// corner is a point where exactly two straight pieces end (lines, a sharp
// rectangle's or a polygon's sides; an open chain's corner as a closed
// loop's). Fillet cuts both lines back by r / tan(θ / 2) and joins them with
// one arc tangent to both; Chamfer cuts both back by a distance and joins them
// with a line. A pick says what a click would take or why not; a cut applies
// it or throws in words. Pure: no three, no DOM.
import { explode, roundPoint, samePoint } from './sketchProfile.js';
import { TINY_MM } from './sketchCheck.js';
import { explodeAt, fmtMm } from './sketchTrim.js';

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const scale = (p, s) => [p[0] * s, p[1] * s];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
const cross = (p, q) => p[0] * q[1] - p[1] * q[0];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const unit = (p) => scale(p, 1 / Math.hypot(p[0], p[1]));
const none = (message) => ({ type: 'none', message });
const NO_CORNER = 'Point at a corner where two lines meet.';
const STRAIGHT = {
  fillet: 'Fillet rounds a corner between two straight lines.',
  chamfer: 'Chamfer cuts a corner between two straight lines.',
};

/**
 * What a Fillet or Chamfer click at `raw` would take (§8.3): `{ type:
 * 'corner', point, ends: [{ index, id, k, end, length, away }, …two], rect }`
 * — the corner nearest the raw cursor within `tolerance`, its two lines in
 * drawing order (`k`: the side of a rect or polygon, null for a line; `end`:
 * which end lies on the corner; `away`: the unit direction from the corner
 * along it), `rect` when a rectangle's corner (its own Radius rounds all four)
 * — or `{ type: 'none', message }`.
 */
export function cornerPick({ entities = [], raw, tolerance = 0, tool = 'fillet' }) {
  if (!raw) return none(NO_CORNER);
  const near = [];
  entities.forEach((entity, index) => {
    if (entity.type === 'circle') return;
    const whole = entity.type === 'line' || entity.type === 'arc';
    (whole ? [entity] : explode(entity)).forEach((piece, k) => {
      if (samePoint(piece.a, piece.b, 0)) return;
      for (const end of ['a', 'b'])
        if (dist(piece[end], raw) <= tolerance + 1e-6)
          near.push({ index, id: entity.id, k: whole ? null : k, end, piece, type: entity.type });
    });
  });
  if (!near.length) return none(NO_CORNER);
  const nearest = near.reduce((best, e) => (dist(e.piece[e.end], raw) < dist(best.piece[best.end], raw) ? e : best));
  const point = nearest.piece[nearest.end];
  const ends = near.filter((e) => samePoint(e.piece[e.end], point));
  if (ends.length > 2) return none('More than two lines meet here.');
  if (ends.length < 2) return none(NO_CORNER);
  if (ends.some((e) => e.piece.type !== 'line')) return none(STRAIGHT[tool] || STRAIGHT.fillet);
  const read = ends.map(({ index, id, k, end, piece }) => {
    const other = end === 'a' ? piece.b : piece.a;
    return { index, id, k, end, length: dist(point, other), away: unit(sub(other, point)) };
  });
  const [u, v] = [read[0].away, read[1].away];
  if (Math.abs(cross(u, v)) <= 1e-9)
    return none(
      dot(u, v) < 0 ? 'These lines run straight on: there is no corner.' : 'These lines lie on each other: no corner.',
    );
  return { type: 'corner', point, ends: read, rect: ends.some((e) => e.type === 'rect') };
}

// A corner's two lines cut back by `cutBack` and joined by `join(T1, T2)`: the work both tools share.
function cutCorner({ entities, pick, cutBack, join, nextId, text }) {
  if (!pick || pick.type === 'none') throw new Error(pick?.message || NO_CORNER);
  const { point, ends } = pick;
  for (const end of ends)
    if (entities[end.index]?.id !== end.id) throw new Error('That corner is no longer in the drawing.');
  let next = nextId;
  const newId = () => `e${next++}`;
  const added = [],
    replaced = [];
  // A shape taking part (a sharp rect, a polygon): its lines first, in its place (each later index shifted by the pieces before it).
  let list = entities;
  const shapes = [...new Set(ends.filter((e) => e.k != null).map((e) => e.index))].sort((a, b) => a - b);
  const pieceIds = new Map();
  let shift = 0;
  for (const index of shapes) {
    const at = index + shift;
    replaced.push(entities[index]);
    const exploded = explodeAt(list, at, newId);
    exploded.pieces.forEach((piece, k) => pieceIds.set(`${index}:${k}`, piece.id));
    added.push(...exploded.pieces.map((p) => p.id));
    list = exploded.list;
    shift += exploded.pieces.length - 1;
  }
  const idOf = (end) => (end.k != null ? pieceIds.get(`${end.index}:${end.k}`) : end.id);
  const lines = ends.map((end) => list.find((e) => e.id === idOf(end)));
  // Each line cut back to its point; one used up (to under TINY_MM) goes, the join ending on its far end.
  const cut = ends.map((end, i) => {
    const line = lines[i];
    const far = end.end === 'a' ? line.b : line.a;
    const left = end.length - cutBack[i];
    if (left < TINY_MM) return { line, far, at: far, gone: true };
    return { line, far, at: roundPoint(add(point, scale(end.away, cutBack[i]))), gone: false };
  });
  const joined = { id: newId(), ...join(cut[0].at, cut[1].at) };
  if (lines.every((line) => line.construction)) joined.construction = true;
  added.push(joined.id);
  for (const { line } of cut) if (!replaced.includes(line) && !added.includes(line.id)) replaced.push(line);
  const first = list.indexOf(lines[0]) <= list.indexOf(lines[1]) ? 0 : 1;
  const result = [];
  for (const entity of list) {
    const i = lines.indexOf(entity);
    if (i < 0) {
      result.push(entity);
      continue;
    }
    const { gone, at } = cut[i];
    if (!gone) result.push({ ...entity, [ends[i].end]: at });
    if (i === first) result.push(joined);
  }
  const usedUp = cut.filter((c) => c.gone).map((c) => c.line.id);
  return {
    entities: result,
    added: added.filter((id) => !usedUp.includes(id)),
    replaced,
    nextId: next,
    text,
    pieces: [{ type: joined.type, a: joined.a, b: joined.b, ...(joined.m ? { m: joined.m } : {}) }],
    removed: cut.map(({ at }) => ({ type: 'line', a: point, b: at })),
  };
}

// θ, the angle the two lines open at the corner.
const openAngle = (pick) => Math.acos(Math.max(-1, Math.min(1, dot(pick.ends[0].away, pick.ends[1].away))));
const shorter = (pick) => Math.min(pick.ends[0].length, pick.ends[1].length);

/**
 * The corner a pick names rounded with radius `radius` (§8.3) → `{ entities,
 * added, replaced, nextId, text, pieces: [the arc], removed: [the two cut
 * back runs] }`, or throws ("R8 does not fit here: at most R5.19 (the shorter
 * line is 6 mm)."). The arc is a new entity right after the first line,
 * construction only when both lines are.
 */
export function filletCut({ entities = [], pick, radius, nextId }) {
  if (!(Number.isFinite(radius) && radius > 0)) throw new Error('Type a fillet radius greater than zero.');
  if (!pick || pick.type === 'none') throw new Error(pick?.message || NO_CORNER);
  const theta = openAngle(pick);
  const back = radius / Math.tan(theta / 2);
  const most = shorter(pick);
  if (back > most + 1e-6) {
    const fits = Math.floor(most * Math.tan(theta / 2) * 100 + 1e-9) / 100;
    throw new Error(
      `R${fmtMm(radius)} does not fit here: at most R${fmtMm(fits)} (the shorter line is ${fmtMm(most)} mm).`,
    );
  }
  const bisector = unit(add(pick.ends[0].away, pick.ends[1].away));
  const center = add(pick.point, scale(bisector, radius / Math.sin(theta / 2)));
  const m = roundPoint(sub(center, scale(bisector, radius)));
  return cutCorner({
    entities,
    pick,
    cutBack: [back, back],
    join: (a, b) => ({ type: 'arc', a, b, m }),
    nextId,
    text: `Fillet R${fmtMm(radius)}`,
  });
}

/**
 * The corner a pick names cut by `distance` on both lines (§8.3) → the same
 * as filletCut with one line joining them, or throws ("A 5 mm chamfer does
 * not fit here: the shorter line is 4 mm.").
 */
export function chamferCut({ entities = [], pick, distance, nextId }) {
  if (!(Number.isFinite(distance) && distance > 0)) throw new Error('Type a chamfer distance greater than zero.');
  if (!pick || pick.type === 'none') throw new Error(pick?.message || NO_CORNER);
  const most = shorter(pick);
  if (distance > most + 1e-6)
    throw new Error(`A ${fmtMm(distance)} mm chamfer does not fit here: the shorter line is ${fmtMm(most)} mm.`);
  return cutCorner({
    entities,
    pick,
    cutBack: [distance, distance],
    join: (a, b) => ({ type: 'line', a, b }),
    nextId,
    text: `Chamfer ${fmtMm(distance)}`,
  });
}
