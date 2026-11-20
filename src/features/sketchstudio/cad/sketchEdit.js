// Changing what is drawn in the in-viewport sketcher (docs/sketch-studio-
// hand-drawing.md §5.3 – §5.4, HD-1): the selected entity's numbers, the
// dimensions that follow an edited entity, the joins at a line end and the
// construction flag. Pure: plain arrays in, new arrays out (an entity that
// does not change keeps its object), no three, no DOM; it imports
// sketchProfile.js and sketchZero.js only (sketchDimensions.js reaches three
// through marks.js). X and Y are measured from the zero (HD-2, §6.1).
import {
  arcGeometry,
  cornerRadiusRefusal,
  entityKeyPoints,
  explode,
  isRounded,
  polygonRefusal,
  roundPoint,
  samePoint,
  slotRefusal,
} from './sketchProfile.js';
import { fromZero, toZero } from './sketchZero.js';

// A dimension end lies on a key point within this (mm): sketchDimensions.js ATTACH_MM.
const ATTACH_MM = 1e-3;
const round = (value) => {
  const result = Math.round(value * 1e6) / 1e6;
  return Object.is(result, -0) ? 0 : result;
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);
const lowerLeft = ({ a, b }) => [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
const angleOf = (from, to) => round((Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI);

// The boxes of the selection row, per entity type: [key, label, unit].
export const EDIT_FIELDS = {
  line: [
    ['x1', 'X1', 'mm'],
    ['y1', 'Y1', 'mm'],
    ['x2', 'X2', 'mm'],
    ['y2', 'Y2', 'mm'],
    ['length', 'Length', 'mm'],
    ['angle', 'Angle', '°'],
  ],
  rect: [
    ['x', 'X', 'mm'],
    ['y', 'Y', 'mm'],
    ['width', 'Width', 'mm'],
    ['height', 'Height', 'mm'],
    // HD-3 (§7.1): the corner radius, empty or 0 for sharp corners.
    ['r', 'Radius', 'mm'],
  ],
  slot: [
    ['x', 'X', 'mm'],
    ['y', 'Y', 'mm'],
    ['length', 'Length', 'mm'],
    ['width', 'Width', 'mm'],
    ['angle', 'Angle', '°'],
  ],
  polygon: [
    ['x', 'X', 'mm'],
    ['y', 'Y', 'mm'],
    ['sides', 'Sides', ''],
    ['af', 'Across flats', 'mm'],
    ['angle', 'Angle', '°'],
  ],
  circle: [
    ['x', 'X', 'mm'],
    ['y', 'Y', 'mm'],
    ['diameter', 'Diameter', 'mm'],
  ],
  arc: [
    ['x1', 'X1', 'mm'],
    ['y1', 'Y1', 'mm'],
    ['x2', 'X2', 'mm'],
    ['y2', 'Y2', 'mm'],
    ['radius', 'Radius', 'mm'],
  ],
};

// The X, Y pairs among the keys of EDIT_FIELDS.
const POINT_KEYS = [
  ['x', 'y'],
  ['x1', 'y1'],
  ['x2', 'y2'],
];

/**
 * The selection row's numbers for one entity: [{ key, label, unit, value }],
 * X and Y from `zero` (the sketch origin when none). A line: its ends, length
 * and angle (degrees counter-clockwise from +X); a rectangle: its lower-left
 * corner, size and corner radius (null: sharp); a circle: its centre and
 * diameter; an arc: its ends and radius; a slot: its centre, overall length,
 * width and angle; a polygon: its centre, sides, across flats and angle.
 */
export function entityFields(entity, zero = null) {
  const values = (() => {
    if (entity.type === 'line') {
      const { a, b } = entity;
      return { x1: a[0], y1: a[1], x2: b[0], y2: b[1], length: round(len(sub(b, a))), angle: angleOf(a, b) };
    }
    if (entity.type === 'rect') {
      const [x, y] = lowerLeft(entity);
      return {
        x,
        y,
        width: round(Math.abs(entity.b[0] - entity.a[0])),
        height: round(Math.abs(entity.b[1] - entity.a[1])),
        r: isRounded(entity) ? entity.r : null,
      };
    }
    if (entity.type === 'slot')
      return { x: entity.c[0], y: entity.c[1], length: entity.length, width: entity.width, angle: entity.angle };
    if (entity.type === 'polygon')
      return { x: entity.c[0], y: entity.c[1], sides: entity.sides, af: entity.af, angle: entity.angle };
    if (entity.type === 'circle') return { x: entity.c[0], y: entity.c[1], diameter: round(entity.r * 2) };
    if (entity.type === 'arc') {
      const geometry = arcGeometry(entity.a, entity.m, entity.b);
      return {
        x1: entity.a[0],
        y1: entity.a[1],
        x2: entity.b[0],
        y2: entity.b[1],
        radius: geometry ? round(geometry.radius) : null,
      };
    }
    return {};
  })();
  for (const [kx, ky] of POINT_KEYS)
    if (kx in values) [values[kx], values[ky]] = fromZero([values[kx], values[ky]], zero);
  return (EDIT_FIELDS[entity.type] || []).map(([key, label, unit]) => ({ key, label, unit, value: values[key] }));
}

// A patch typed from the zero, its X and Y back in sketch coordinates (a key
// not typed stays out, and a value that is not a number is left to be refused).
function patchToSketch(patch, zero) {
  const back = { ...patch };
  for (const [kx, ky] of POINT_KEYS) {
    const [x, y] = toZero([Number(patch[kx]) || 0, Number(patch[ky]) || 0], zero);
    if (typeof patch[kx] === 'number' && Number.isFinite(patch[kx])) back[kx] = x;
    if (typeof patch[ky] === 'number' && Number.isFinite(patch[ky])) back[ky] = y;
  }
  return back;
}

// An arc through `a` and `b` of radius `r` bulging to `side` (+1: left of a → b)
// with its centre on that side (`major`) or the other; refused under half the chord.
function arcThrough(a, b, r, side, major) {
  const chord = sub(b, a);
  const c = len(chord);
  if (c < 1e-9) throw new Error('An arc needs two different ends.');
  if (!(r > 0)) throw new Error('An arc needs a radius greater than zero.');
  const half = c / 2;
  if (r < half - 1e-9) throw new Error(`An arc's radius must be at least half its chord: ${round(half)} mm here.`);
  const h = Math.sqrt(Math.max(0, r * r - half * half));
  const n = [(-chord[1] / c) * side, (chord[0] / c) * side];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const centre = [mid[0] + n[0] * (major ? h : -h), mid[1] + n[1] * (major ? h : -h)];
  return roundPoint([centre[0] + n[0] * r, centre[1] + n[1] * r]);
}

const number = (patch, key, label) => {
  const value = patch[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a number.`);
  return value;
};
const labelOf = (type, key) => (EDIT_FIELDS[type] || []).find(([k]) => k === key)?.[1] || key;

// The entity with `patch` applied (keys of EDIT_FIELDS), or the refusal thrown.
function edited(entity, patch) {
  const { type } = entity;
  const keys = Object.keys(patch);
  const unknown = keys.find((key) => !(EDIT_FIELDS[type] || []).some(([k]) => k === key));
  if (unknown) throw new Error(`A ${type} has no ${unknown}.`);
  const get = (key) => number(patch, key, labelOf(type, key));
  const has = (key) => key in patch;
  // A centre typed from the zero (a slot's, a polygon's).
  const centre = () => roundPoint([has('x') ? get('x') : entity.c[0], has('y') ? get('y') : entity.c[1]]);
  if (type === 'line') {
    let a = [has('x1') ? get('x1') : entity.a[0], has('y1') ? get('y1') : entity.a[1]];
    let b = [has('x2') ? get('x2') : entity.b[0], has('y2') ? get('y2') : entity.b[1]];
    // Length and Angle move end 2 about end 1.
    if (has('length') || has('angle')) {
      const length = has('length') ? get('length') : len(sub(b, a));
      if (!(length > 0)) throw new Error('A line needs a length greater than zero.');
      const current = len(sub(b, a));
      const angle = has('angle')
        ? (get('angle') * Math.PI) / 180
        : current > 1e-12
          ? Math.atan2(b[1] - a[1], b[0] - a[0])
          : 0;
      b = [a[0] + length * Math.cos(angle), a[1] + length * Math.sin(angle)];
    }
    [a, b] = [roundPoint(a), roundPoint(b)];
    if (samePoint(a, b)) throw new Error('A line needs two different ends.');
    return { ...entity, a, b };
  }
  if (type === 'rect') {
    const [x0, y0] = lowerLeft(entity);
    const x = has('x') ? get('x') : x0,
      y = has('y') ? get('y') : y0;
    const width = has('width') ? get('width') : Math.abs(entity.b[0] - entity.a[0]);
    const height = has('height') ? get('height') : Math.abs(entity.b[1] - entity.a[1]);
    if (!(width > 1e-6) || !(height > 1e-6)) throw new Error('A rectangle needs a nonzero width and height.');
    const a = roundPoint([x, y]),
      b = roundPoint([x + width, y + height]);
    // The radius typed (empty or 0: sharp, the key dropped), else kept; it must fit the size.
    if (has('r') && patch.r != null && !(typeof patch.r === 'number' && Number.isFinite(patch.r)))
      throw new Error('Radius must be a number.');
    const r = has('r') ? round(patch.r || 0) : Number(entity.r) || 0;
    const refusal = cornerRadiusRefusal({ a, b }, r);
    if (refusal) throw new Error(refusal);
    const { r: _r, ...sharp } = entity;
    // The same rectangle typed again keeps its corners as drawn (a may be any corner).
    const [x1, y1] = [Math.max(entity.a[0], entity.b[0]), Math.max(entity.a[1], entity.b[1])];
    const kept = samePoints(a, [x0, y0]) && samePoints(b, [x1, y1]);
    if (kept && r === (Number(entity.r) || 0)) return entity;
    if (kept) return r ? { ...entity, r } : sharp;
    return r ? { ...sharp, a, b, r } : { ...sharp, a, b };
  }
  if (type === 'slot') {
    const next = {
      ...entity,
      c: centre(),
      length: has('length') ? round(get('length')) : entity.length,
      width: has('width') ? round(get('width')) : entity.width,
      angle: has('angle') ? round(get('angle')) : entity.angle,
    };
    const refusal = slotRefusal(next);
    if (refusal) throw new Error(refusal);
    return next;
  }
  if (type === 'polygon') {
    const next = {
      ...entity,
      c: centre(),
      sides: has('sides') ? get('sides') : entity.sides,
      af: has('af') ? round(get('af')) : entity.af,
      angle: has('angle') ? round(get('angle')) : entity.angle,
    };
    const refusal = polygonRefusal(next);
    if (refusal) throw new Error(refusal);
    return next;
  }
  if (type === 'circle') {
    const c = roundPoint([has('x') ? get('x') : entity.c[0], has('y') ? get('y') : entity.c[1]]);
    const diameter = has('diameter') ? get('diameter') : entity.r * 2;
    if (!(diameter > 1e-6)) throw new Error('A circle needs a diameter greater than zero.');
    return { ...entity, c, r: round(diameter / 2) };
  }
  if (type === 'arc') {
    const geometry = arcGeometry(entity.a, entity.m, entity.b);
    if (!geometry) throw new Error('This arc has no radius: draw it again.');
    const a = roundPoint([has('x1') ? get('x1') : entity.a[0], has('y1') ? get('y1') : entity.a[1]]);
    const b = roundPoint([has('x2') ? get('x2') : entity.b[0], has('y2') ? get('y2') : entity.b[1]]);
    const r = has('radius') ? get('radius') : geometry.radius;
    // The same ends and radius: the arc as drawn (its third point anywhere on it).
    if (samePoints(a, entity.a) && samePoints(b, entity.b) && Math.abs(r - geometry.radius) < 1e-9) return entity;
    // The side it bulges to, and whether its centre lies on that side (more than a half circle).
    const chord = sub(entity.b, entity.a);
    const normal = [-chord[1], chord[0]];
    const mid = [(entity.a[0] + entity.b[0]) / 2, (entity.a[1] + entity.b[1]) / 2];
    const dot = (p) => (p[0] - mid[0]) * normal[0] + (p[1] - mid[1]) * normal[1];
    const side = dot(entity.m) >= 0 ? 1 : -1;
    const major = dot(geometry.center) * side > 1e-9;
    return { ...entity, a, b, m: arcThrough(a, b, r, side, major) };
  }
  throw new Error(`A ${type} has no numbers to change.`);
}

const samePoints = (p, q) => (!p && !q) || (p && q && p[0] === q[0] && p[1] === q[1]);
const NUMBERS = ['r', 'length', 'width', 'angle', 'sides', 'af'];
const sameShape = (e, f) =>
  ['a', 'b', 'c', 'm'].every((key) => samePoints(e[key], f[key])) && NUMBERS.every((key) => e[key] === f[key]);

/**
 * `entities` with entity `id` changed by `patch` ({ x1: 12 }, { diameter: 8 },
 * … the keys of EDIT_FIELDS; X and Y from `zero`), or the refusal thrown ("A
 * rectangle needs a nonzero width and height."). The same array when nothing
 * changes. A line or arc end moves alone: whatever else ends there stays.
 */
export function editEntity(entities, id, patch, zero = null) {
  const index = entities.findIndex((e) => e.id === id);
  if (index < 0) throw new Error('That entity is no longer in the drawing.');
  const before = entities[index];
  const after = edited(before, patchToSketch(patch, zero));
  if (sameShape(before, after)) return entities;
  const next = entities.slice();
  next[index] = after;
  return next;
}

// The circles an entity's round parts lie on (rounded as sketchDimensions.js
// keeps them): a circle's own, an arc's, a slot's two ends, a rounded
// rectangle's four corners, in its pieces' order.
export function circlesOf(entity) {
  if (entity.type === 'circle') return [{ center: entity.c, radius: entity.r }];
  const pieces = entity.type === 'arc' ? [entity] : explode(entity).filter((piece) => piece.type === 'arc');
  return pieces.flatMap((piece) => {
    const geometry = arcGeometry(piece.a, piece.m, piece.b);
    return geometry ? [{ center: roundPoint(geometry.center), radius: round(geometry.radius) }] : [];
  });
}
// Which key point of `to` each of `from` became: the same index when the
// two lists are laid out alike (the same kinds in the same order), else the
// same kind's same ordinal (a rectangle given a radius keeps its side
// midpoints and its centre; its sharp corners have none to go to).
function keyMap(from, to) {
  if (from.length === to.length && from.every((key, k) => key.kind === to[k].kind)) return from.map((_, k) => k);
  const named = (list) => {
    const seen = new Map();
    return list.map((key) => {
      const n = seen.get(key.kind) || 0;
      seen.set(key.kind, n + 1);
      return `${key.kind}:${n}`;
    });
  };
  const targets = named(to);
  return named(from).map((name) => targets.indexOf(name));
}

/**
 * The dimensions once `before` became `after` (the same entity edited): an
 * end that lay on one of its key points (an end, a midpoint, a corner, a
 * centre, a quadrant) moves with that point; a radial one that measured its
 * circle follows it, the label keeping its direction and its distance off the
 * circle. The same array when none follows.
 */
export function followDimensions(dimensions = [], before, after) {
  if (!dimensions.length) return dimensions;
  const from = entityKeyPoints(before),
    to = entityKeyPoints(after);
  const map = keyMap(from, to);
  const moved = (end) => {
    const k = from.findIndex((key) => samePoint(key.point, end, ATTACH_MM));
    const j = k >= 0 ? map[k] : -1;
    return j >= 0 && to[j] && !samePoint(to[j].point, from[k].point, 1e-9) ? roundPoint(to[j].point) : null;
  };
  // A radial one follows the round part it measured, by that part's place among the entity's round parts.
  const wasAll = circlesOf(before),
    nowAll = circlesOf(after);
  let changed = false;
  const next = dimensions.map((dimension) => {
    if (dimension.type === 'radial') {
      const k = wasAll.findIndex(
        (was) =>
          samePoint(was.center, dimension.center, ATTACH_MM) && Math.abs(was.radius - dimension.radius) <= ATTACH_MM,
      );
      const was = wasAll[k],
        now = wasAll.length === nowAll.length ? nowAll[k] : null;
      if (!was || !now || (samePoint(was.center, now.center, 1e-9) && was.radius === now.radius)) return dimension;
      const off = sub(dimension.at, dimension.center);
      const distance = len(off);
      const toward = distance > 1e-9 ? [off[0] / distance, off[1] / distance] : [1, 0];
      const gap = distance - dimension.radius;
      changed = true;
      return {
        ...dimension,
        center: roundPoint(now.center),
        radius: round(now.radius),
        at: roundPoint([
          now.center[0] + toward[0] * (now.radius + gap),
          now.center[1] + toward[1] * (now.radius + gap),
        ]),
      };
    }
    const fromEnd = moved(dimension.from),
      toEnd = moved(dimension.to);
    if (!fromEnd && !toEnd) return dimension;
    changed = true;
    return { ...dimension, ...(fromEnd ? { from: fromEnd } : {}), ...(toEnd ? { to: toEnd } : {}) };
  });
  return changed ? next : dimensions;
}

/**
 * How many other drawn lines and arcs end at `point` (construction ones take
 * no part in an outline, so they do not count).
 */
export function joinsAt(entities, id, point) {
  return entities.filter(
    (e) =>
      e.id !== id &&
      !e.construction &&
      (e.type === 'line' || e.type === 'arc') &&
      (samePoint(e.a, point) || samePoint(e.b, point)),
  ).length;
}

/**
 * `entities` with the `construction` flag set (`on`) or taken off on the
 * entities `ids`; the others keep their objects.
 */
export function setConstruction(entities, ids = [], on = true) {
  const set = new Set(ids);
  let changed = false;
  const next = entities.map((entity) => {
    if (!set.has(entity.id) || Boolean(entity.construction) === on) return entity;
    changed = true;
    if (on) return { ...entity, construction: true };
    const { construction: _flag, ...rest } = entity;
    return rest;
  });
  return changed ? next : entities;
}
