// Check (docs/sketch-studio-hand-drawing.md §6.4, HD-2): what in a drawing
// keeps it from being a clean blank, each problem located, with a fix where
// one is safe. Construction entities are never a problem. Boxes and a grid
// come before any exact test (sketchIntersect.js), so the example's cover
// (2 210 entities) is checked in well under its budget. Pure: no three, no
// DOM; it imports sketchProfile.js, sketchIntersect.js, sketchEdit.js and
// sketchZero.js only.
import { arcGeometry, entityPolyline, isShapeLoop, profileLoops, roundPoint, samePoint } from './sketchProfile.js';
import { directionAt, intersect, primitiveBox, primitives } from './sketchIntersect.js';
import { followDimensions } from './sketchEdit.js';
import { fromZero } from './sketchZero.js';

// A line or arc shorter than this (mm), a circle under this diameter, is tiny.
export const TINY_MM = 0.01;
// An open end this near another end (mm) can be closed onto it.
export const CLOSE_MM = 0.5;
// How far (mm) an open end looks for the nearest other end.
export const NEAR_MM = 5;
const EPS = 1e-6;
// The cell (mm) ends are joined through: sketchProfile.js `chains`, the same rule.
const CELL = 1e-3;
const NOUNS = {
  line: ['line', 'lines'],
  rect: ['rectangle', 'rectangles'],
  circle: ['circle', 'circles'],
  arc: ['arc', 'arcs'],
  slot: ['slot', 'slots'],
  polygon: ['polygon', 'polygons'],
};
const fmt = (value) => String(Number(value.toFixed(3)));
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const len = (p) => Math.hypot(p[0], p[1]);
const cross = (p, q) => p[0] * q[1] - p[1] * q[0];

// The ends of the drawn lines and arcs joined as `chains` joins them: a grid of
// cells no smaller than the samePoint tolerance, the lowest index winning, so
// the nodes are those of the profile.
function endNodes(pieces) {
  const nodes = [];
  const grid = new Map();
  const node = (p) => {
    const i = Math.floor(p[0] / CELL),
      j = Math.floor(p[1] / CELL);
    let index = -1;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (const k of grid.get(`${i + di},${j + dj}`) || [])
          if ((index < 0 || k < index) && samePoint(nodes[k].point, p)) index = k;
    if (index < 0) {
      index = nodes.push({ point: p, ends: [] }) - 1;
      const key = `${i},${j}`;
      if (grid.has(key)) grid.get(key).push(index);
      else grid.set(key, [index]);
    }
    return index;
  };
  pieces.forEach((entity, order) => {
    for (const end of ['a', 'b']) nodes[node(entity[end])].ends.push({ entity, end, order });
  });
  return nodes;
}

// A uniform grid over boxes: `add(item, box)`, then `pairs()` of items sharing a cell, each once.
function boxGrid(boxes) {
  let extent = 0;
  for (const [x0, y0, x1, y1] of boxes)
    extent = Math.max(extent, Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1));
  const size = Math.max(1e-3, (extent * 2) / Math.max(1, Math.ceil(Math.sqrt(boxes.length))));
  const cells = new Map();
  boxes.forEach(([x0, y0, x1, y1], index) => {
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    const [i0, j0, i1, j1] = [x0, y0, x1, y1].map((v) => Math.floor(v / size));
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const key = `${i},${j}`;
        if (cells.has(key)) cells.get(key).push(index);
        else cells.set(key, [index]);
      }
  });
  const seen = new Set();
  const pairs = [];
  for (const list of cells.values())
    for (let p = 0; p < list.length; p++)
      for (let q = p + 1; q < list.length; q++) {
        const key = list[p] * boxes.length + list[q];
        if (seen.has(key)) continue;
        seen.add(key);
        const [a, b] = [boxes[list[p]], boxes[list[q]]];
        if (a[0] <= b[2] + EPS && b[0] <= a[2] + EPS && a[1] <= b[3] + EPS && b[1] <= a[3] + EPS)
          pairs.push([list[p], list[q]]);
      }
  return pairs;
}

const rectBox = ({ a, b }) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
function arcMiddle(entity) {
  const g = arcGeometry(entity.a, entity.m, entity.b);
  if (!g) return null;
  const t = g.start + g.sweep / 2;
  return [g.center[0] + g.radius * Math.cos(t), g.center[1] + g.radius * Math.sin(t)];
}
// An angle's difference from another, in (−period / 2, period / 2].
const turnApart = (a, b, period) => {
  const d = (((a - b) % period) + period) % period;
  return d > period / 2 ? d - period : d;
};
/**
 * Two entities of one type on the same place (either direction, 1e-6): the
 * rule Check's copies, Copy's and Pattern's "already there" read
 * (docs/sketch-studio-hand-drawing.md §7.4). A slot turned half round, a
 * polygon turned by a side's angle, are the same; a sharp and a rounded
 * rectangle on one box are not.
 */
export function sameGeometry(e, f) {
  if (e.type !== f.type) return false;
  if (e.type === 'slot')
    return (
      samePoint(e.c, f.c) &&
      Math.abs(e.length - f.length) <= EPS &&
      Math.abs(e.width - f.width) <= EPS &&
      Math.abs(turnApart(e.angle, f.angle, 180)) <= EPS
    );
  if (e.type === 'polygon')
    return (
      samePoint(e.c, f.c) &&
      e.sides === f.sides &&
      Math.abs(e.af - f.af) <= EPS &&
      Math.abs(turnApart(e.angle, f.angle, 360 / e.sides)) <= EPS
    );
  if (e.type === 'line')
    return (samePoint(e.a, f.a) && samePoint(e.b, f.b)) || (samePoint(e.a, f.b) && samePoint(e.b, f.a));
  if (e.type === 'circle') return samePoint(e.c, f.c) && Math.abs(e.r - f.r) <= EPS;
  if (e.type === 'rect') {
    const [p, q] = [rectBox(e), rectBox(f)];
    return p.every((v, i) => Math.abs(v - q[i]) <= EPS) && Math.abs((Number(e.r) || 0) - (Number(f.r) || 0)) <= EPS;
  }
  if (e.type === 'arc') {
    const ends = (samePoint(e.a, f.a) && samePoint(e.b, f.b)) || (samePoint(e.a, f.b) && samePoint(e.b, f.a));
    const [m, n] = [arcMiddle(e), arcMiddle(f)];
    return ends && Boolean(m && n) && samePoint(m, n);
  }
  return false;
}
// Where an entity is said to be: a line's middle, a rectangle's lower-left corner, a centre, an arc's middle.
function placeOf(entity) {
  if (entity.type === 'line') return [(entity.a[0] + entity.b[0]) / 2, (entity.a[1] + entity.b[1]) / 2];
  if (entity.type === 'rect') return rectBox(entity).slice(0, 2);
  if (entity.type === 'circle' || entity.type === 'slot' || entity.type === 'polygon') return entity.c;
  return arcMiddle(entity) || entity.a;
}
// The points a row frames: a circle's, a slot's or a polygon's box corners, a rectangle's corners, a line's or arc's points.
function entityPoints(entity) {
  if (entity.type === 'circle')
    return [
      [entity.c[0] - entity.r, entity.c[1] - entity.r],
      [entity.c[0] + entity.r, entity.c[1] + entity.r],
    ];
  if (entity.type === 'rect') return [entity.a, entity.b];
  if (isShapeLoop(entity)) {
    const ring = entityPolyline(entity, 16);
    const xs = ring.map((p) => p[0]),
      ys = ring.map((p) => p[1]);
    return [
      [Math.min(...xs), Math.min(...ys)],
      [Math.max(...xs), Math.max(...ys)],
    ];
  }
  return [entity.a, entity.b, ...(entity.m ? [entity.m] : [])];
}
/**
 * Where an entity is looked for a copy of it (cells of 1e-3 mm): a line's
 * or an arc's ends, a centre, a rectangle's lower-left corner.
 */
export const anchorOf = (e) =>
  e.type === 'line' || e.type === 'arc'
    ? [e.a, e.b]
    : e.type === 'circle' || e.type === 'slot' || e.type === 'polygon'
      ? [e.c]
      : e.type === 'rect'
        ? [rectBox(e).slice(0, 2)]
        : [];
const loopEntities = (loop) => (loop.kind === 'chain' ? loop.chain.segments.map((s) => s.entity) : [loop.entity]);

/**
 * The drawing's problems and notes: { problems: [{ id, kind, text, at, points,
 * entityIds, fix? }], notes: [text] }. `at` and `points` are sketch-plane mm
 * (what a row frames); the words give X, Y from `zero`. `split`: a finish
 * makes one sketch per separate outline (the shop's finish), else the largest
 * is used. `sheet` is for HD-5's making notes (unused here). Kinds, in this
 * order: open-end, branch, duplicate, overlap, crossing, tiny, nested. A fix
 * is { label, kind: 'close' | 'remove', id, end?, to? } (applyFix).
 */
export function checkDrawing(entities = [], { zero = null, split = true } = {}) {
  const where = (p) => {
    const [x, y] = fromZero(p, zero);
    return `(${fmt(x)}, ${fmt(y)})`;
  };
  const { drawn, loops, outers, open: openChains } = profileLoops(entities);
  const found = {
    'open-end': [],
    branch: [],
    duplicate: [],
    overlap: [],
    crossing: [],
    tiny: [],
    nested: [],
  };

  // Ends: open ends (with the gap to the nearest other end) and branches.
  const pieces = drawn.filter(
    (e) => (e.type === 'line' || (e.type === 'arc' && arcGeometry(e.a, e.m, e.b))) && !samePoint(e.a, e.b),
  );
  const nodes = endNodes(pieces);
  const near = new Map();
  for (const [index, n] of nodes.entries()) {
    const key = `${Math.floor(n.point[0] / NEAR_MM)},${Math.floor(n.point[1] / NEAR_MM)}`;
    if (near.has(key)) near.get(key).push(index);
    else near.set(key, [index]);
  }
  // The nearest node to an open node that is not the same entity's other end: { index, d } or null.
  const nearest = (index) => {
    const { point, ends } = nodes[index];
    const own = ends[0].entity;
    const [i, j] = [Math.floor(point[0] / NEAR_MM), Math.floor(point[1] / NEAR_MM)];
    let best = null;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (const k of near.get(`${i + di},${j + dj}`) || []) {
          if (k === index || nodes[k].ends.some((end) => end.entity === own)) continue;
          const d = len(sub(nodes[k].point, point));
          if (d <= NEAR_MM && (!best || d < best.d)) best = { index: k, d };
        }
    return best;
  };
  const open = nodes.map((n, index) => (n.ends.length === 1 ? index : -1)).filter((index) => index >= 0);
  const nearestOf = new Map(open.map((index) => [index, nearest(index)]));
  const done = new Set();
  for (const index of open) {
    if (done.has(index)) continue;
    let mover = index;
    let other = nearestOf.get(index);
    // Two open ends nearest each other are one gap: the end drawn later moves onto the earlier.
    if (other && nearestOf.get(other.index)?.index === index) {
      done.add(other.index);
      if (nodes[other.index].ends[0].order > nodes[index].ends[0].order) {
        mover = other.index;
        other = { index, d: other.d };
      }
    }
    const { entity, end } = nodes[mover].ends[0];
    const point = nodes[mover].point;
    const target = other ? nodes[other.index].point : null;
    found['open-end'].push({
      id: `open-end:${entity.id}:${end}`,
      kind: 'open-end',
      text: other
        ? `Open end at ${where(point)}: ${fmt(other.d)} mm from the nearest other end`
        : `Open end at ${where(point)}: no other end within ${NEAR_MM} mm`,
      at: point,
      points: target ? [point, target] : [point],
      entityIds: [
        ...new Set([
          entity.id,
          ...(other && nodes[other.index].ends.length === 1 ? [nodes[other.index].ends[0].entity.id] : []),
        ]),
      ],
      ...(other && other.d < CLOSE_MM
        ? { fix: { label: 'Close it', kind: 'close', id: entity.id, end, to: target } }
        : {}),
    });
  }
  for (const n of nodes) {
    if (n.ends.length < 3) continue;
    const types = new Set(n.ends.map((end) => end.entity.type));
    const noun = types.size > 1 ? 'lines and arcs' : types.has('arc') ? 'arcs' : 'lines';
    const ids = [...new Set(n.ends.map((end) => end.entity.id))];
    found.branch.push({
      id: `branch:${ids.join(',')}`,
      kind: 'branch',
      text: `${n.ends.length} ${noun} meet at ${where(n.point)}: an outline corner joins two`,
      at: n.point,
      points: [n.point],
      entityIds: ids,
    });
  }

  // Copies: two entities of one type on the same place; the later one is the copy.
  const anchors = new Map();
  const copies = new Set();
  for (const entity of drawn) {
    let original = null;
    for (const p of anchorOf(entity)) {
      const [i, j] = [Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)];
      for (let di = -1; di <= 1 && !original; di++)
        for (let dj = -1; dj <= 1 && !original; dj++)
          for (const other of anchors.get(`${i + di},${j + dj}`) || [])
            if (other.type === entity.type && other !== entity && sameGeometry(other, entity)) {
              original = other;
              break;
            }
    }
    if (original) {
      copies.add(entity);
      const many = NOUNS[entity.type]?.[1] || `${entity.type}s`;
      found.duplicate.push({
        id: `duplicate:${entity.id}`,
        kind: 'duplicate',
        text: `Two ${many} on the same place at ${where(placeOf(entity))}`,
        at: placeOf(entity),
        points: entityPoints(entity),
        entityIds: [original.id, entity.id],
        fix: { label: 'Remove the copy', kind: 'remove', id: entity.id },
      });
      continue;
    }
    for (const p of anchorOf(entity)) {
      const key = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
      if (anchors.has(key)) anchors.get(key).push(entity);
      else anchors.set(key, [entity]);
    }
  }

  // Overlaps: two collinear drawn lines sharing more than a point (copies aside).
  const lines = drawn.filter((e) => e.type === 'line' && !copies.has(e) && !samePoint(e.a, e.b));
  for (const [p, q] of boxGrid(lines.map((e) => rectBox(e)))) {
    const [e, f] = [lines[p], lines[q]];
    const d = sub(e.b, e.a);
    const l = len(d);
    const u = [d[0] / l, d[1] / l];
    const off = (point) => Math.abs(cross(u, sub(point, e.a)));
    if (off(f.a) > EPS || off(f.b) > EPS) continue;
    const along = (point) => (point[0] - e.a[0]) * u[0] + (point[1] - e.a[1]) * u[1];
    const [s, t] = [along(f.a), along(f.b)].sort((x, y) => x - y);
    const from = Math.max(0, s),
      to = Math.min(l, t);
    if (to - from <= EPS) continue;
    const middle = [e.a[0] + u[0] * ((from + to) / 2), e.a[1] + u[1] * ((from + to) / 2)];
    found.overlap.push({
      id: `overlap:${e.id}:${f.id}`,
      kind: 'overlap',
      text: `Two lines overlap for ${fmt(to - from)} mm at ${where(middle)}`,
      at: middle,
      points: [
        [e.a[0] + u[0] * from, e.a[1] + u[1] * from],
        [e.a[0] + u[0] * to, e.a[1] + u[1] * to],
      ],
      entityIds: [e.id, f.id],
    });
  }

  // Crossings: two closed loops whose edges cross, or (HD-4, §8.0) meet at a
  // piece's end or only touch (a tangent); an open chain crossing a loop; a
  // closed loop crossing or touching itself anywhere but where two of its
  // pieces join. Copies take no part (a doubled shape meets itself everywhere).
  const owners = [
    ...loops.map((loop) => ({ loop, entities: loopEntities(loop) })),
    ...openChains.map((chain) => ({ open: true, entities: chain.segments.map((s) => s.entity) })),
  ];
  const pieceList = [];
  owners.forEach((owner, index) => {
    if (owner.entities.some((e) => copies.has(e))) return;
    for (const entity of owner.entities)
      for (const piece of primitives(entity)) pieceList.push({ piece, entity, owner: index, box: primitiveBox(piece) });
  });
  const crossed = new Map();
  const interior = (piece, point) =>
    piece.type === 'circle' || (len(sub(point, piece.a)) > EPS && len(sub(point, piece.b)) > EPS);
  // Two pieces of one loop meeting where they join (an end of each, on one point).
  const ends = (piece, point) =>
    (piece.type === 'circle' ? [] : [piece.a, piece.b]).filter((e) => len(sub(e, point)) <= CELL);
  const joined = (s, t, point) => ends(s, point).some((e) => ends(t, point).some((f) => samePoint(e, f)));
  for (const [p, q] of boxGrid(pieceList.map((item) => item.box))) {
    const [s, t] = [pieceList[p], pieceList[q]];
    const self = s.owner === t.owner;
    if ((owners[s.owner].open && owners[t.owner].open) || (self && s.entity === t.entity)) continue;
    const opened = owners[s.owner].open || owners[t.owner].open;
    for (const point of intersect(s.piece, t.piece)) {
      const crosses =
        interior(s.piece, point) &&
        interior(t.piece, point) &&
        Math.abs(cross(directionAt(s.piece, point), directionAt(t.piece, point))) > EPS;
      if (self ? joined(s.piece, t.piece, point) : !crosses && opened) continue;
      const key = `${Math.min(s.owner, t.owner)},${Math.max(s.owner, t.owner)}`;
      if (crossed.has(key)) {
        const known = crossed.get(key);
        known.points.push(point);
        known.crosses ||= crosses;
      } else
        crossed.set(key, {
          first: Math.min(s.owner, t.owner),
          second: Math.max(s.owner, t.owner),
          points: [point],
          ids: [s.entity.id, t.entity.id],
          crosses,
        });
    }
  }
  const outline = outers[0];
  for (const { first, second, points, ids, crosses } of [...crossed.values()].sort(
    (x, y) => x.first - y.first || x.second - y.second,
  )) {
    const [a, b] = [owners[first], owners[second]];
    const opened = a.open || b.open;
    const onOutline = a.loop === outline || b.loop === outline;
    const words =
      first === second
        ? a.loop === outline
          ? 'The outline crosses itself'
          : a.loop.parents.length
            ? 'A cut-out crosses itself'
            : 'An outline crosses itself'
        : opened
          ? `An open line crosses ${onOutline ? 'the outline' : 'a cut-out'}`
          : crosses
            ? onOutline
              ? 'A cut-out crosses the outline'
              : 'Two cut-outs cross'
            : onOutline
              ? 'A cut-out touches the outline'
              : 'Two cut-outs touch';
    found.crossing.push({
      id: `crossing:${ids.join(':')}`,
      kind: 'crossing',
      text: `${words} at ${where(points[0])}`,
      at: points[0],
      points,
      entityIds: [...new Set(ids)],
    });
  }

  // Tiny pieces.
  for (const entity of drawn) {
    let words = null;
    if (entity.type === 'line') {
      const l = len(sub(entity.b, entity.a));
      if (l < TINY_MM) words = `A line ${fmt(l)} mm long`;
    } else if (entity.type === 'arc') {
      const g = arcGeometry(entity.a, entity.m, entity.b);
      const l = g ? g.radius * Math.abs(g.sweep) : len(sub(entity.b, entity.a));
      if (l < TINY_MM) words = `An arc ${fmt(l)} mm long`;
    } else if (entity.type === 'circle' && entity.r * 2 < TINY_MM) words = `A circle Ø${fmt(entity.r * 2)}`;
    else if (entity.type === 'slot' && entity.width < TINY_MM) words = `A slot ${fmt(entity.width)} mm wide`;
    else if (entity.type === 'polygon' && entity.af < TINY_MM) words = `A polygon ${fmt(entity.af)} mm across`;
    if (!words) continue;
    const at = placeOf(entity);
    found.tiny.push({
      id: `tiny:${entity.id}`,
      kind: 'tiny',
      text: `${words} at ${where(at)}`,
      at,
      points: entityPoints(entity),
      entityIds: [entity.id],
      fix: { label: 'Remove it', kind: 'remove', id: entity.id },
    });
  }

  // A closed shape inside a cut-out: left out of the blank (a copy is no parent: it is a copy).
  const copied = (loop) => loopEntities(loop).some((e) => copies.has(e));
  for (const loop of loops) {
    if (copied(loop) || loop.parents.filter((parent) => !copied(parent)).length <= 1) continue;
    const xs = loop.polygon.map((p) => p[0]),
      ys = loop.polygon.map((p) => p[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const at = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
    const ids = loopEntities(loop).map((e) => e.id);
    found.nested.push({
      id: `nested:${ids[0]}`,
      kind: 'nested',
      text: `A shape inside a cut-out at ${where(at)} is left out of the blank`,
      at,
      points: [box.slice(0, 2), box.slice(2)],
      entityIds: ids,
    });
  }

  const problems = Object.values(found).flat();
  const notes = [];
  // While an outline is open its holes are loops of their own: no count of outlines then.
  if (outers.length > 1 && !found['open-end'].length && !found.branch.length)
    notes.push(
      split
        ? `${outers.length} separate outlines: Finish makes ${outers.length} sketches`
        : `${outers.length} separate outlines: one extrusion uses the largest; sketch the others separately`,
    );
  if (!problems.length) {
    const holes = outline ? loops.filter((l) => l.parents.length === 1 && l.parents[0] === outline).length : 0;
    notes.push(
      outline
        ? `Nothing to fix: a closed outline with ${holes ? plural(holes, 'cut-out') : 'no cut-outs'}.`
        : 'Nothing to fix: no outline drawn yet.',
    );
  }
  return { problems, notes };
}

/**
 * A problem's fix applied: { entities, dimensions }. 'close' moves the end
 * onto the other (the dimensions on it follow, sketchEdit.js
 * followDimensions); 'remove' takes the entity out through `remove(entities,
 * dimensions, ids)` when given (the reducer's removeEntities, which prunes the
 * dimensions that hung on it), else with the dimensions as they are. Throws
 * when the problem has no fix or is no longer in the drawing.
 */
export function applyFix(entities, dimensions = [], problem, { remove = null } = {}) {
  const fix = problem?.fix;
  if (!fix) throw new Error('This problem has no fix.');
  const index = entities.findIndex((e) => e.id === fix.id);
  if (index < 0) throw new Error('That problem is no longer in the drawing.');
  if (fix.kind === 'remove') {
    if (remove) return remove(entities, dimensions, [fix.id]);
    return { entities: entities.filter((e) => e.id !== fix.id), dimensions };
  }
  if (fix.kind === 'close') {
    const before = entities[index];
    if (!before[fix.end] || !samePoint(before[fix.end], problem.at))
      throw new Error('That problem is no longer in the drawing.');
    const after = { ...before, [fix.end]: roundPoint(fix.to) };
    const next = entities.slice();
    next[index] = after;
    return { entities: next, dimensions: followDimensions(dimensions, before, after) };
  }
  throw new Error(`Unknown fix: ${fix.kind}`);
}
