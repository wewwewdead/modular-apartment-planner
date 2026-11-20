// Moving, copying, turning and mirroring a selection (docs/sketch-studio-
// hand-drawing.md §7.3, HD-3). A transform is an orthogonal map of the plane
// (a move, a turn about a centre, a mirror about a line); each entity type
// goes through it as itself: lines, arcs, circles, slots and polygons stay
// what they are (a slot's and a polygon's angle turns or reflects, an arc
// keeps its three points), a rectangle stays one while its sides stay along
// X and Y and otherwise becomes its lines and arcs. Pure: no three, no DOM;
// it imports sketchProfile.js and sketchEdit.js only.
import { explode, entityKeyPoints, roundPoint, samePoint } from './sketchProfile.js';
import { circlesOf } from './sketchEdit.js';

// A dimension end lies on a key point within this (mm): sketchDimensions.js ATTACH_MM.
const ATTACH_MM = 1e-3;
const round = (value) => {
  const result = Math.round(value * 1e6) / 1e6;
  return Object.is(result, -0) ? 0 : result;
};
// A cosine or sine that is 0 or ±1 to rounding is that exactly, so four quarter turns give the drawing back.
const exact = (v) => (Math.abs(v) < 1e-12 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-12 ? Math.sign(v) : v);
// Degrees into (−180, 180].
export const normalAngle = (degrees) => {
  let a = ((degrees % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return round(a);
};

/**
 * A transform: p → [m0 x + m1 y + t0, m2 x + m3 y + t1]; `turn` the
 * rotation in degrees (a move 0), `mirror` with `axis` the mirror line's
 * direction in degrees.
 */
export const translation = (dx, dy) => ({ m: [1, 0, 0, 1], t: [dx, dy], turn: 0, mirror: false });
export function rotation(center, degrees) {
  const r = (degrees * Math.PI) / 180;
  const [c, s] = [exact(Math.cos(r)), exact(Math.sin(r))];
  return {
    m: [c, -s, s, c],
    t: [center[0] - c * center[0] + s * center[1], center[1] - s * center[0] - c * center[1]],
    turn: degrees,
    mirror: false,
  };
}
/** The mirror about the line through `p` and `q` (two different points). */
export function reflection(p, q) {
  const axis = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
  const r = (2 * axis * Math.PI) / 180;
  const [c, s] = [exact(Math.cos(r)), exact(Math.sin(r))];
  return {
    m: [c, s, s, -c],
    t: [p[0] - c * p[0] - s * p[1], p[1] - s * p[0] + c * p[1]],
    turn: 0,
    mirror: true,
    axis,
  };
}
/** A point through a transform, rounded to 1e-6 mm as every drawn point is. */
export const applyTo = (T, p) =>
  roundPoint([T.m[0] * p[0] + T.m[1] * p[1] + T.t[0], T.m[2] * p[0] + T.m[3] * p[1] + T.t[1]]);
// The map keeps X and Y along X and Y (a move, a quarter turn, a mirror about a level or plumb line).
export const keepsAxes = (T) => T.m.every((v) => v === 0 || Math.abs(v) === 1);

// A slot's or polygon's angle after T: a turn adds; a mirror reflects the
// direction about the axis (a polygon's flats about it: half a turn more).
function turnedAngle(entity, T) {
  if (T.mirror) return normalAngle(2 * T.axis - entity.angle + (entity.type === 'polygon' ? 180 : 0));
  return T.turn ? normalAngle(entity.angle + T.turn) : entity.angle;
}

/**
 * One entity through T: [the entity, same id] or, for a rectangle whose sides
 * would leave X and Y, its lines and arcs with the ids "{id}.{n}" (the
 * caller renumbers them). Throws for a type it does not know.
 */
export function transformEntity(entity, T) {
  const map = (p) => applyTo(T, p);
  switch (entity.type) {
    case 'line':
      return [{ ...entity, a: map(entity.a), b: map(entity.b) }];
    case 'arc':
      return [{ ...entity, a: map(entity.a), b: map(entity.b), m: map(entity.m) }];
    case 'circle':
      return [{ ...entity, c: map(entity.c) }];
    case 'slot':
    case 'polygon':
      return [{ ...entity, c: map(entity.c), angle: turnedAngle(entity, T) }];
    case 'rect':
      if (keepsAxes(T)) return [{ ...entity, a: map(entity.a), b: map(entity.b) }];
      return explode(entity, { ids: true }).flatMap((piece) => transformEntity(piece, T));
    default:
      throw new Error(`A ${entity.type} cannot be moved.`);
  }
}

// An entity with a new id, the id first as the reducer writes it.
const renamed = (entity, id) => {
  const { id: _old, ...rest } = entity;
  return { id, ...rest };
};

/**
 * `entities` with the ones `ids` taken through T → { entities, nextId, ids,
 * before }. Without `keep` each moves in its place and keeps its id (a
 * rectangle that becomes its pieces: new ids from `nextId`, where it was);
 * with `keep` the originals stay and the results are added after the last
 * entity with new ids (a copy). `ids` are the results' ids, in drawing order;
 * `before` the entities that moved, as they were (for the dimensions).
 */
export function transformEntities(entities, ids, T, { keep = false, nextId = 1 } = {}) {
  const chosen = new Set(ids);
  let next = nextId;
  const fresh = (entity) => renamed(entity, `e${next++}`);
  if (keep) {
    const copies = entities.filter((e) => chosen.has(e.id)).flatMap((e) => transformEntity(e, T).map(fresh));
    return { entities: [...entities, ...copies], nextId: next, ids: copies.map((e) => e.id), before: [] };
  }
  const out = [],
    made = [],
    before = [];
  for (const entity of entities) {
    if (!chosen.has(entity.id)) {
      out.push(entity);
      continue;
    }
    before.push(entity);
    const after = transformEntity(entity, T);
    const results = after.length === 1 && after[0].id === entity.id ? after : after.map(fresh);
    out.push(...results);
    made.push(...results.map((e) => e.id));
  }
  return { entities: out, nextId: next, ids: made, before };
}

/**
 * The dimensions once the entities `moved` (as they were) went through T: a
 * linear end on one of their key points goes with it; a radial one that
 * measured one of their round parts goes with that part (its label too: T
 * keeps lengths). Copies carry none, so a copy passes no entities. The same
 * array when none follows.
 */
export function transformDimensions(dimensions = [], moved = [], T) {
  if (!dimensions.length || !moved.length) return dimensions;
  const keys = moved.flatMap((entity) => entityKeyPoints(entity).map((key) => key.point));
  const circles = moved.flatMap(circlesOf);
  const onKey = (p) => keys.some((key) => samePoint(key, p, ATTACH_MM));
  let changed = false;
  const next = dimensions.map((dimension) => {
    if (dimension.type === 'radial') {
      const measured = circles.some(
        (c) => samePoint(c.center, dimension.center, ATTACH_MM) && Math.abs(c.radius - dimension.radius) <= ATTACH_MM,
      );
      if (!measured) return dimension;
      changed = true;
      return { ...dimension, center: applyTo(T, dimension.center), at: applyTo(T, dimension.at) };
    }
    const [from, to] = [onKey(dimension.from), onKey(dimension.to)];
    if (!from && !to) return dimension;
    changed = true;
    // One end moved: it follows, the line keeps its kind and offset (as an edit's do).
    if (!(from && to) || (!T.turn && !T.mirror))
      return {
        ...dimension,
        ...(from ? { from: applyTo(T, dimension.from) } : {}),
        ...(to ? { to: applyTo(T, dimension.to) } : {}),
      };
    return turnedLinear(dimension, T);
  });
  return changed ? next : dimensions;
}

// The left normal of from → to (sheetAnnotations.js leftNormal).
const leftNormal = (from, to) => {
  const d = [to[0] - from[0], to[1] - from[1]];
  const l = Math.hypot(d[0], d[1]);
  return l ? [-d[1] / l, d[0] / l] : [0, -1];
};
// A linear dimension whose both ends turned or mirrored with what they measure:
// its line's first end goes through T too and the offset is read back from it;
// a level one turned a quarter reads plumb (and back); an aligned one stays
// aligned; a level or plumb one turned by what does not keep the axes becomes
// aligned (HD-4, §8.0: it keeps its reading, not the projection).
function turnedLinear(dimension, T) {
  const { from, to, orientation, offset = 0 } = dimension;
  const lineStart =
    orientation === 'horizontal'
      ? [from[0], from[1] + offset]
      : orientation === 'vertical'
        ? [from[0] + offset, from[1]]
        : [from[0] + leftNormal(from, to)[0] * offset, from[1] + leftNormal(from, to)[1] * offset];
  const [f, t, s] = [applyTo(T, from), applyTo(T, to), applyTo(T, lineStart)];
  // A level line goes to a plumb one when T sends X to Y.
  const swaps = keepsAxes(T) && T.m[0] === 0;
  const kind =
    orientation === 'aligned' || !keepsAxes(T)
      ? 'aligned'
      : swaps
        ? orientation === 'horizontal'
          ? 'vertical'
          : 'horizontal'
        : orientation;
  const n = leftNormal(f, t);
  const off =
    kind === 'horizontal'
      ? s[1] - f[1]
      : kind === 'vertical'
        ? s[0] - f[0]
        : (s[0] - f[0]) * n[0] + (s[1] - f[1]) * n[1];
  return { ...dimension, from: f, to: t, orientation: kind, offset: round(off) };
}
