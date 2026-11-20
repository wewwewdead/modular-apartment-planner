// Offset (docs/sketch-studio-hand-drawing.md §8.1, §8.4, HD-4): a copy of one
// line, arc, circle, rectangle, slot or polygon at a distance, on the side of
// the cursor. Each stays one entity: a line a parallel line of the same
// length, an arc the arc on the same centre and angles, a circle, a slot and a
// polygon their sizes ± the distance (a slot's width and length ± 2d, a
// polygon's across flats ± 2d), a rectangle each side out or in (its corner
// radius ± d, sharp at nothing or less). Pure: no three, no DOM.
import { arcGeometry, entityPolyline, polygonName, roundPoint } from './sketchProfile.js';
import { distanceToPrimitive } from './sketchIntersect.js';
import { drawingPieces, fmtMm, nearestPiece } from './sketchTrim.js';

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const round = (value) => {
  const result = Math.round(value * 1e6) / 1e6;
  return Object.is(result, -0) ? 0 : result;
};
const NOTHING = 'Point at a line, arc, circle or shape to offset.';
const SIDE = 'Move off it, to the side the copy goes on.';

/** The entity a first Offset click at `raw` takes: `{ type: 'entity', index, id }` or `{ type: 'none', message }`. */
export function offsetPick({ entities = [], raw, tolerance = 0 }) {
  const near = raw && nearestPiece(drawingPieces(entities), raw, tolerance);
  return near ? { type: 'entity', index: near.index, id: entities[near.index].id } : { type: 'none', message: NOTHING };
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// The words for "of this …" in a refusal.
function nameOf(entity, radius) {
  if (entity.type === 'circle') return `Ø${fmtMm(entity.r * 2)} circle`;
  if (entity.type === 'arc') return `R${fmtMm(radius)} arc`;
  if (entity.type === 'slot') return `${fmtMm(entity.length)} × ${fmtMm(entity.width)} slot`;
  if (entity.type === 'polygon') return `${polygonName(entity.sides).toLowerCase()} ${fmtMm(entity.af)} across flats`;
  const [x0, y0, x1, y1] = box(entity);
  return `${fmtMm(x1 - x0)} × ${fmtMm(y1 - y0)} rectangle`;
}
const box = ({ a, b }) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];

/**
 * The copy of `entities`' entity `id` offset by `distance` toward `raw` →
 * `{ copy (no id), outward (null for a line), text }`, or throws in words
 * ("Offsetting inward by 5 leaves nothing of this Ø8 circle.").
 */
export function offsetCopy(entity, raw, distance) {
  if (!(Number.isFinite(distance) && distance > 0)) throw new Error('Type an offset distance greater than zero.');
  if (!raw) throw new Error(SIDE);
  const d = distance;
  const { id: _id, ...rest } = entity;
  const inward = (size) => {
    throw new Error(`Offsetting inward by ${fmtMm(d)} leaves nothing of this ${size}.`);
  };
  if (entity.type === 'line') {
    const along = sub(entity.b, entity.a);
    const length = Math.hypot(along[0], along[1]);
    const side = along[0] * (raw[1] - entity.a[1]) - along[1] * (raw[0] - entity.a[0]);
    if (Math.abs(side) / length <= 1e-9) throw new Error(SIDE);
    const n = [(-along[1] / length) * Math.sign(side) * d, (along[0] / length) * Math.sign(side) * d];
    const move = (p) => roundPoint([p[0] + n[0], p[1] + n[1]]);
    return { copy: { ...rest, a: move(entity.a), b: move(entity.b) }, outward: null };
  }
  if (entity.type === 'arc' || entity.type === 'circle') {
    const geometry = entity.type === 'arc' ? arcGeometry(entity.a, entity.m, entity.b) : null;
    if (entity.type === 'arc' && !geometry) throw new Error(NOTHING);
    const [center, radius] = geometry ? [geometry.center, geometry.radius] : [entity.c, entity.r];
    const off = dist(raw, center);
    if (Math.abs(off - radius) <= 1e-9) throw new Error(SIDE);
    const outward = off > radius;
    const to = radius + (outward ? d : -d);
    if (to <= 1e-6) inward(nameOf(entity, radius));
    if (entity.type === 'circle') return { copy: { ...rest, r: round(to) }, outward };
    const at = (p) =>
      roundPoint([center[0] + ((p[0] - center[0]) * to) / radius, center[1] + ((p[1] - center[1]) * to) / radius]);
    return { copy: { ...rest, a: at(entity.a), b: at(entity.b), m: at(entity.m) }, outward };
  }
  if (entity.type === 'slot') {
    const t = (entity.angle * Math.PI) / 180;
    const reach = (entity.length - entity.width) / 2;
    const axis = {
      type: 'segment',
      a: [entity.c[0] - Math.cos(t) * reach, entity.c[1] - Math.sin(t) * reach],
      b: [entity.c[0] + Math.cos(t) * reach, entity.c[1] + Math.sin(t) * reach],
    };
    const off = distanceToPrimitive(raw, axis);
    if (Math.abs(off - entity.width / 2) <= 1e-9) throw new Error(SIDE);
    const outward = off > entity.width / 2;
    const width = entity.width + (outward ? 2 * d : -2 * d);
    if (width <= 1e-6) inward(nameOf(entity));
    return {
      copy: { ...rest, length: round(entity.length + (outward ? 2 * d : -2 * d)), width: round(width) },
      outward,
    };
  }
  if (entity.type === 'polygon') {
    const outward = !pointInRing(raw, entityPolyline(entity));
    const af = entity.af + (outward ? 2 * d : -2 * d);
    if (af <= 1e-6) inward(nameOf(entity));
    return { copy: { ...rest, af: round(af) }, outward };
  }
  if (entity.type === 'rect') {
    const outward = !pointInRing(raw, entityPolyline(entity, 16));
    const [x0, y0, x1, y1] = box(entity);
    const s = outward ? d : -d;
    if (x1 - x0 + 2 * s <= 1e-6 || y1 - y0 + 2 * s <= 1e-6) inward(nameOf(entity));
    const { r: _r, ...sharp } = rest;
    const r = Number(entity.r) > 0 ? round(entity.r + s) : 0;
    return {
      copy: { ...sharp, a: roundPoint([x0 - s, y0 - s]), b: roundPoint([x1 + s, y1 + s]), ...(r > 0 ? { r } : {}) },
      outward,
    };
  }
  throw new Error(NOTHING);
}

/**
 * Offset applied (§8.4): the copy of entity `id` toward `raw` as a new entity
 * after the last one → `{ entities, added: [id], replaced: [], nextId, text,
 * pieces: [the copy], removed: [] }`, or throws in words with nothing changed.
 */
export function offsetCut({ entities = [], id, raw, distance, nextId }) {
  const entity = entities.find((e) => e.id === id);
  if (!entity) throw new Error('That is no longer in the drawing.');
  const { copy, outward } = offsetCopy(entity, raw, distance);
  const made = { id: `e${nextId}`, ...copy };
  return {
    entities: [...entities, made],
    added: [made.id],
    replaced: [],
    nextId: nextId + 1,
    text: `Offset ${fmtMm(distance)} mm${outward == null ? '' : outward ? ' outward' : ' inward'}`,
    pieces: [copy],
    removed: [],
  };
}
