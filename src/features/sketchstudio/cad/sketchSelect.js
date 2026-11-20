// Selection in the in-viewport sketcher (docs/sketch-studio-hand-drawing.md
// §5.1, HD-1): a set of entity ids kept in drawing order, a box that takes
// what lies wholly inside it (dragged to the right) or what it touches
// (dragged to the left), and the words the selection note uses. Pure: plain
// arrays in and out, no three, no DOM.
import { entityPolyline } from './sketchProfile.js';

// Each entity's polyline box, worked out once per entity object (entities are
// never mutated in place: an edit makes a new object).
const boxes = new WeakMap();
function polylineBox(entity) {
  let box = boxes.get(entity);
  if (box) return box;
  box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of entityPolyline(entity)) {
    if (x < box[0]) box[0] = x;
    if (y < box[1]) box[1] = y;
    if (x > box[2]) box[2] = x;
    if (y > box[3]) box[3] = y;
  }
  boxes.set(entity, box);
  return box;
}

// Does segment pq meet the box [x0, y0, x1, y1] (crossing it or lying in it)?
// Liang–Barsky clipping: the part of the segment inside the box is not empty.
function segmentMeetsBox(p, q, [x0, y0, x1, y1]) {
  const d = [q[0] - p[0], q[1] - p[1]];
  let t0 = 0,
    t1 = 1;
  for (const [step, from] of [
    [-d[0], p[0] - x0],
    [d[0], x1 - p[0]],
    [-d[1], p[1] - y0],
    [d[1], y1 - p[1]],
  ]) {
    if (step === 0) {
      if (from < 0) return false;
      continue;
    }
    const t = from / step;
    if (step < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return t0 <= t1;
}

/**
 * The ids a box from `p` to `q` (two sketch-plane points, any two opposite
 * corners) takes, in drawing order. `mode` 'inside': every point of the
 * entity's polyline lies in the box; 'touching': any of its segments crosses
 * the box or lies in it. A box with no width or no height takes nothing.
 */
export function boxSelect(entities = [], [p, q], mode = 'inside') {
  const box = [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
  if (!(box[2] - box[0] > 0) || !(box[3] - box[1] > 0)) return [];
  const ids = [];
  for (const entity of entities) {
    const own = polylineBox(entity);
    const within = own[0] >= box[0] && own[1] >= box[1] && own[2] <= box[2] && own[3] <= box[3];
    if (within) {
      ids.push(entity.id);
      continue;
    }
    if (mode !== 'touching') continue;
    if (own[2] < box[0] || own[0] > box[2] || own[3] < box[1] || own[1] > box[3]) continue;
    const points = entityPolyline(entity);
    for (let i = 1; i < points.length; i++)
      if (segmentMeetsBox(points[i - 1], points[i], box)) {
        ids.push(entity.id);
        break;
      }
  }
  return ids;
}

// The ids of `wanted` (a Set or an array) that are entities, in drawing order.
export function inDrawingOrder(entities = [], wanted = []) {
  const set = wanted instanceof Set ? wanted : new Set(wanted);
  return entities.filter((e) => set.has(e.id)).map((e) => e.id);
}

/**
 * The selection after a click on entity `id` (null: on nothing). Alone it
 * selects that entity only, or clears on nothing; with `toggle` (Shift or
 * Ctrl) it adds the entity or removes it, and a click on nothing changes
 * nothing.
 */
export function clickSelection(entities, selected = [], id, toggle = false) {
  if (!toggle) return id ? [id] : [];
  if (!id) return selected;
  return selected.includes(id)
    ? selected.filter((s) => s !== id)
    : inDrawingOrder(entities, new Set([...selected, id]));
}

// A box's ids added to the selection (Shift) or in its place.
export const boxSelection = (entities, selected = [], ids = [], add = false) =>
  add ? inDrawingOrder(entities, new Set([...selected, ...ids])) : ids;

const NOUNS = { line: 'line', rect: 'rectangle', circle: 'circle', arc: 'arc', slot: 'slot', polygon: 'polygon' };
/**
 * The selection note's words for several entities: "5 selected: 3 lines,
 * 2 circles" (kinds in the order first drawn).
 */
export function describeSelection(entities = [], ids = []) {
  const set = new Set(ids);
  const counts = new Map();
  for (const entity of entities) if (set.has(entity.id)) counts.set(entity.type, (counts.get(entity.type) || 0) + 1);
  const kinds = [...counts].map(([type, n]) => `${n} ${NOUNS[type] || type}${n === 1 ? '' : 's'}`);
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return `${total} selected: ${kinds.join(', ')}`;
}
