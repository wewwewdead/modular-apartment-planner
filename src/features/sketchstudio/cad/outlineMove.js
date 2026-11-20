// Moving one straight edge of a blank outline (docs/sketch-studio-corner-gaps.md
// §4.1): the edge goes parallel to itself, `distance` mm out of the metal
// (negative: in). Where its neighbour is a straight edge at an angle the shared
// corner slides along the neighbour's own line (a mitre keeps its line, a notch
// keeps its side); where the neighbour is parallel, an arc or a spline, and at
// each end of a `span` that is not the edge's own end, the rest stays put and a
// new straight edge square to the moved one joins the two (a jog). Pure: no
// three, no DOM; plain numbers only, refused in shop words otherwise.
//
// The outline is held as loops of nodes while edges move: node k is the
// corner a segment starts at ({ v: { p, from }, seg }), the segment running to
// node k + 1. A segment keeps its object while it moves (`origin`: its
// { loop, index } in the outline it was read from, null for an edge a move
// made), so several moves read from one outline can be applied one after the
// other although a jog shifts the indexes behind it.
import { pointInRing } from './sheetMetal.js';
import { entitiesToProfile, explode, isShapeLoop, roundPoint, sampleArc } from './sketchProfile.js';

// Points closer than this are one point; an edge's end is this close to its line.
const ON_LINE = 1e-6;
// An edge shorter than this is too short to cut (and no face of the folded part, cornerGaps.js).
const SLIVER = 0.01;
// Two edges whose directions differ by less than this (sine) are parallel.
const PARALLEL = 1e-6;

const EXPRESSION = 'This outline is driven by parameters: change the parameter instead.';
const STRAIGHT = 'Only a straight edge of the outline can be moved.';
const GONE = 'That edge is not on the outline any more: read the gaps again.';
const CROSSING = 'This would make the outline cross itself.';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const length = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => scale(a, 1 / length(a));
const fmt = (value) => Number(value.toFixed(2)).toString();
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(isNumber);

// ---------------------------------------------------------------- reading the outline
/**
 * Why an edge of this profile cannot be moved here ('' when it can): literal
 * numbers only (an expression is the parameter's to change), no offset, no
 * construction segments, a closed outline.
 */
export function outlineMoveProblem(profile) {
  const shapes = [profile, ...(profile?.holes || [])];
  for (const shape of shapes) {
    if (!shape || typeof shape.type !== 'string') return 'Choose a closed blank outline first.';
    if (shape.offset) return 'An offset outline cannot have an edge moved: draw the outline itself.';
    if (shape.type === 'rectangle') {
      if (![shape.width, shape.height].every(isNumber) || !(shape.origin == null || isPoint(shape.origin)))
        return EXPRESSION;
    } else if (shape.type === 'circle') {
      if (!isNumber(shape.radius) || !(shape.center == null || isPoint(shape.center))) return EXPRESSION;
    } else if (shape.type === 'polygon') {
      if (!(shape.points?.length >= 3) || !shape.points.every(isPoint)) return EXPRESSION;
    } else if (shape.type === 'path') {
      if (shape.closed === false) return 'Close the outline before moving an edge.';
      if (!isPoint(shape.start)) return EXPRESSION;
      for (const segment of shape.segments || []) {
        if (segment.construction) return 'This outline holds construction lines: open it in the sketcher first.';
        const points = [segment.end, ...(segment.type === 'arc' ? [segment.mid] : [])];
        if (segment.type === 'spline') points.push(segment.control1, segment.control2);
        if (!points.every(isPoint)) return EXPRESSION;
      }
    } else return `An outline of type ${shape.type} cannot have an edge moved.`;
  }
  return '';
}

const vertex = (p, from = null) => ({ p, from });
const lineSeg = (origin = null, source = null) => ({ type: 'line', source, origin, moved: 0 });

// One closed loop of the profile as nodes (a circle has none: no straight edge).
function loopOf(shape, loop, hole) {
  const out = { shape, hole, nodes: [], changed: false };
  const node = (p, seg) => out.nodes.push({ v: vertex(p, p), seg });
  if (shape.type === 'rectangle') {
    const [x, y] = shape.origin || [0, 0];
    const corners = [
      [x, y],
      [x + shape.width, y],
      [x + shape.width, y + shape.height],
      [x, y + shape.height],
    ];
    corners.forEach((p, i) => node(p, lineSeg({ loop, index: i })));
  } else if (shape.type === 'polygon') {
    shape.points.forEach((p, i) => node(p, lineSeg({ loop, index: i })));
  } else if (shape.type === 'path') {
    const segments = shape.segments || [];
    let from = shape.start;
    segments.forEach((segment, i) => {
      node(from, { type: segment.type, source: segment, origin: { loop, index: i }, moved: 0 });
      from = segment.end;
    });
    // Ending on its start, the last segment closes the loop; else a straight edge closes it (profilePolygon).
    const closes = from[0] === shape.start[0] && from[1] === shape.start[1];
    if (!closes) node(from, { ...lineSeg({ loop, index: segments.length }), implicit: true });
  }
  return out;
}

// The profile's loops: the outline (loop 0), then its cut-outs (loop k = holes[k − 1]).
function outlineLoops(profile) {
  const problem = outlineMoveProblem(profile);
  if (problem) throw new Error(problem);
  return [loopOf(profile, 0, false), ...(profile.holes || []).map((hole, i) => loopOf(hole, i + 1, true))];
}

// A loop back into its shape; untouched loops are given back as they were.
function shapeOf(loop) {
  const { shape, nodes } = loop;
  if (!loop.changed) return shape;
  const point = (k) => nodes[k % nodes.length].v.p;
  if (shape.type === 'rectangle') {
    const square =
      nodes.length === 4 && nodes.every((_, k) => point(k)[0] === point(k + 1)[0] || point(k)[1] === point(k + 1)[1]);
    if (square) {
      const xs = nodes.map((n) => n.v.p[0]),
        ys = nodes.map((n) => n.v.p[1]);
      const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
      return {
        ...shape,
        origin: roundPoint([x0, y0]),
        width: roundPoint([Math.max(...xs) - x0, 0])[0],
        height: roundPoint([Math.max(...ys) - y0, 0])[0],
      };
    }
    // A jog in a rectangle: it is a closed outline from now on, from its origin corner.
    const { width: _w, height: _h, origin: _o, ...rest } = shape;
    return { ...rest, type: 'path', start: point(0), segments: pathSegments(nodes), closed: true };
  }
  if (shape.type === 'polygon') return { ...shape, points: nodes.map((n) => n.v.p) };
  return { ...shape, start: point(0), segments: pathSegments(nodes) };
}
function pathSegments(nodes) {
  const segments = nodes.map((node, k) => {
    const end = nodes[(k + 1) % nodes.length].v.p;
    const { source } = node.seg;
    if (node.seg.type !== 'line') return source; // arcs and splines never move (a jog meets them)
    if (source && source.end[0] === end[0] && source.end[1] === end[1]) return source;
    return source ? { ...source, end } : { type: 'line', end };
  });
  // The closing edge a path left implicit stays implicit while it is still the last one.
  return nodes.at(-1)?.seg.implicit ? segments.slice(0, -1) : segments;
}

// ---------------------------------------------------------------- the move
// The loop's turning sense (true: counter-clockwise), from its corners (and arcs' mid points).
function counterClockwise(loop) {
  const ring = loop.nodes.flatMap((n) => [n.v.p, ...(n.seg.type === 'arc' ? [n.seg.source.mid] : [])]);
  let area = 0;
  ring.forEach((p, i) => (area += cross(p, ring[(i + 1) % ring.length])));
  return area > 0;
}
// Out of the metal for an edge along `d`: out of the outline, into a cut-out.
function outward(loop, d) {
  const right = [d[1], -d[0]];
  const out = counterClockwise(loop) ? right : scale(right, -1);
  return loop.hole ? scale(out, -1) : out;
}
const atMost = (x) => new Error(`This edge can move at most ${fmt(x)} mm: its neighbour ends there.`);
const sliver = (x) =>
  new Error(
    `This would leave an edge ${x.toFixed(3)} mm long beside it, too short to cut: move it further or less far.`,
  );

// Edges p → q and q → r in one line, the same way on: one edge.
const inLine = (p, q, r) => {
  const a = sub(q, p),
    b = sub(r, q);
  return Math.abs(cross(a, b)) <= ON_LINE * Math.max(length(a), length(b)) && dot(a, b) > 0;
};

// Moves the segment `seg` of `loop` (see the module comment). Mutates the loop.
function moveSegment(loop, seg, delta, span) {
  if (!(Math.abs(delta) > 1e-9)) return;
  const nodes = loop.nodes;
  const n = nodes.length;
  const i = nodes.findIndex((node) => node.seg === seg);
  if (i < 0) throw new Error(GONE);
  if (seg.type !== 'line') throw new Error(STRAIGHT);
  const A = nodes[i].v,
    B = nodes[(i + 1) % n].v;
  const p = A.p,
    q = B.p;
  const L = length(sub(q, p));
  const d = unit(sub(q, p));
  const nrm = outward(loop, d);
  const off = scale(nrm, delta);
  // The stretch that moves, as distances from p along the edge.
  let s0 = 0,
    s1 = L;
  if (span) {
    const along = span.map((x) => dot(sub(x, p), d));
    if (span.some((x) => Math.abs(cross(d, sub(x, p))) > ON_LINE) || along.some((s) => s < -ON_LINE || s > L + ON_LINE))
      throw new Error('The stretch to move is not on that edge.');
    [s0, s1] = [Math.min(...along), Math.max(...along)];
    if (s0 <= ON_LINE) s0 = 0;
    if (s1 >= L - ON_LINE) s1 = L;
    if (s1 - s0 < SLIVER) throw new Error('The stretch to move is too short to cut.');
  }
  const prev = nodes[(i - 1 + n) % n],
    next = nodes[(i + 1) % n];
  const prevStart = prev.v.p,
    nextEnd = nodes[(i + 2) % n].v.p;
  // The corner slides along a straight neighbour at an angle; anything else takes a jog.
  const slides = (node, away) => node.seg.type === 'line' && Math.abs(cross(unit(away), d)) > PARALLEL;
  const jog = (length) => {
    if (length < SLIVER) throw sliver(length);
  };
  const point = (x) => roundPoint(x);
  // Where the slid corners go, set only once both ends are known to move (a refusal changes nothing).
  let start,
    startDrop = false,
    toA = null,
    toB = null;
  // What stays of the edge beside the stretch must be long enough to cut.
  if (s0 > 0 && s0 < SLIVER) throw sliver(s0);
  if (s1 < L && L - s1 < SLIVER) throw sliver(L - s1);
  if (s0 > 0) {
    // The rest of the edge stays; a jog out at the stretch's start.
    jog(Math.abs(delta));
    const X0 = add(p, scale(d, s0));
    start = [
      { v: A, seg: lineSeg() },
      { v: vertex(point(X0)), seg: lineSeg() },
      { v: vertex(point(add(X0, off))), seg },
    ];
  } else if (!slides(prev, sub(p, prevStart))) {
    jog(Math.abs(delta));
    start = [
      { v: A, seg: lineSeg() },
      { v: vertex(point(add(p, off))), seg },
    ];
  } else {
    const dp = unit(sub(p, prevStart));
    const t = delta / dot(dp, nrm);
    const left = length(sub(p, prevStart)) + t;
    if (left < -ON_LINE) throw atMost(Math.abs(dot(sub(p, prevStart), nrm)));
    if (Math.abs(left) <= ON_LINE) startDrop = true;
    else if (left < SLIVER) throw sliver(left);
    toA = startDrop ? prevStart : point(add(p, scale(dp, t)));
    start = [{ v: A, seg }];
  }
  let end = [],
    endDrop = false;
  if (s1 < L) {
    jog(Math.abs(delta));
    const X1 = add(p, scale(d, s1));
    end = [
      { v: vertex(point(add(X1, off))), seg: lineSeg() },
      { v: vertex(point(X1)), seg: lineSeg() },
    ];
  } else if (!slides(next, sub(nextEnd, q))) {
    jog(Math.abs(delta));
    end = [{ v: vertex(point(add(q, off))), seg: lineSeg() }];
  } else {
    const dn = unit(sub(nextEnd, q));
    const t = delta / dot(dn, nrm);
    const left = length(sub(nextEnd, q)) - t;
    if (left < -ON_LINE) throw atMost(Math.abs(dot(sub(nextEnd, q), nrm)));
    if (Math.abs(left) <= ON_LINE) endDrop = true;
    else if (left < SLIVER) throw sliver(left);
    toB = endDrop ? nextEnd : point(add(q, scale(dn, t)));
  }
  if (toA) A.p = toA;
  if (toB) B.p = toB;
  nodes.splice(i, 1, ...start, ...end);
  seg.moved += delta;
  loop.changed = true;
  // A neighbour brought to no length is taken out: its corner and the moved one are one.
  if (endDrop) {
    const k = nodes.findIndex((node) => node.v === B);
    B.into = nodes[(k + 1) % nodes.length].v;
    nodes.splice(k, 1);
  }
  if (startDrop) {
    const k = nodes.findIndex((node) => node.v === A);
    const before = nodes[(k - 1 + nodes.length) % nodes.length];
    A.into = before.v;
    before.seg = seg;
    nodes.splice(k, 1);
  }
  if (nodes.length < 3) throw new Error('This would close the outline up to nothing.');
  // Edges left in one line are one edge (the moved one keeps its object: what it came from).
  const k = nodes.findIndex((node) => node.seg === seg);
  const ends = [nodes[k].v, nodes[(k + 1) % nodes.length].v];
  for (const v of ends) {
    const m = nodes.length;
    const at = nodes.findIndex((node) => node.v === v);
    if (m <= 3 || at < 0) continue;
    const before = nodes[(at - 1 + m) % m],
      here = nodes[at];
    if (before.seg.type !== 'line' || here.seg.type !== 'line') continue;
    if (!inLine(before.v.p, here.v.p, nodes[(at + 1) % m].v.p)) continue;
    if (here.seg === seg) before.seg = seg;
    v.dropped = true;
    nodes.splice(at, 1);
  }
}

// ---------------------------------------------------------------- the outline stays an outline
// A loop as a closed polyline (arcs and splines sampled).
function ringOf(loop) {
  if (!loop.nodes.length) {
    const { center = [0, 0], radius } = loop.shape;
    return Array.from({ length: 48 }, (_, i) => [
      center[0] + radius * Math.cos((i / 48) * Math.PI * 2),
      center[1] + radius * Math.sin((i / 48) * Math.PI * 2),
    ]);
  }
  const ring = [];
  loop.nodes.forEach((node, k) => {
    const from = node.v.p,
      to = loop.nodes[(k + 1) % loop.nodes.length].v.p;
    ring.push(from);
    if (node.seg.type === 'arc') ring.push(...sampleArc(from, node.seg.source.mid, to, 32).slice(1, -1));
    else if (node.seg.type === 'spline') {
      const { control1: c1, control2: c2 } = node.seg.source;
      for (let s = 1; s < 16; s++) {
        const t = s / 16,
          u = 1 - t;
        ring.push(
          [0, 1].map((j) => u * u * u * from[j] + 3 * u * u * t * c1[j] + 3 * u * t * t * c2[j] + t * t * t * to[j]),
        );
      }
    }
  });
  return ring;
}
// Segments p → q and r → s share a point (touching counts).
function meet(p, q, r, s) {
  const d = sub(q, p),
    e = sub(s, r),
    w = sub(r, p);
  const den = cross(d, e);
  if (Math.abs(den) < 1e-12) {
    if (Math.abs(cross(w, d)) > 1e-9 * Math.max(1, length(d))) return false;
    const L = dot(d, d) || 1;
    const t0 = dot(w, d) / L,
      t1 = dot(sub(s, p), d) / L;
    return Math.max(t0, t1) >= -1e-12 && Math.min(t0, t1) <= 1 + 1e-12;
  }
  const t = cross(w, e) / den,
    u = cross(w, d) / den;
  return t >= -1e-12 && t <= 1 + 1e-12 && u >= -1e-12 && u <= 1 + 1e-12;
}
const box = (p, q) => [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
const boxesMeet = (a, b) => a[0] <= b[2] + 1e-9 && b[0] <= a[2] + 1e-9 && a[1] <= b[3] + 1e-9 && b[1] <= a[3] + 1e-9;
const edgesOf = (ring) =>
  ring.map((p, i) => {
    const q = ring[(i + 1) % ring.length];
    return { p, q, box: box(p, q) };
  });

// Throws when an edge crosses another, an edge folds back on its neighbour or a cut-out leaves the blank.
function checkLoops(loops) {
  const rings = loops.map(ringOf);
  const edges = rings.map(edgesOf);
  edges.forEach((list) => {
    const m = list.length;
    for (let j = 0; j < m; j++)
      for (let k = j + 1; k < m; k++) {
        const neighbours = k === j + 1 || (j === 0 && k === m - 1);
        const [a, b] = [list[j], list[k]];
        if (neighbours) {
          // Only their shared corner: an edge folding back along its neighbour crosses it.
          const [x, y] = k === j + 1 ? [a, b] : [b, a];
          const u = sub(x.q, x.p),
            v = sub(y.q, y.p);
          if (Math.abs(cross(u, v)) <= 1e-9 * length(u) * length(v) && dot(u, v) < 0) throw new Error(CROSSING);
          continue;
        }
        if (boxesMeet(a.box, b.box) && meet(a.p, a.q, b.p, b.q)) throw new Error(CROSSING);
      }
  });
  for (let h = 1; h < rings.length; h++) {
    if (!rings[h].every((p) => pointInRing(p, rings[0]))) throw new Error('This would run a cut-out out of the blank.');
    for (let o = 0; o < h; o++)
      for (const a of edges[h])
        for (const b of edges[o])
          if (boxesMeet(a.box, b.box) && meet(a.p, a.q, b.p, b.q))
            throw new Error(
              o ? 'This would run two cut-outs into each other.' : 'This would run a cut-out out of the blank.',
            );
  }
}

// ---------------------------------------------------------------- the editor
/**
 * An outline being edited by several moves (setGaps): `edge({ loop, index })`
 * is that edge as the outline reads now, a handle that stays good while other
 * edges move; `move(handle, distance, { span })` moves it (§4.1) and throws in
 * shop words; `check()` throws unless the outline is still simple;
 * `profile()` the outline as a profile (untouched loops as they were);
 * `trace()` where everything came from: `{ loops: [[origin | null per
 * segment]], corners: [{ from, to }] }` (each corner of the first outline that
 * moved, from → to); `moved()` the edges that moved, `[{ segment: { loop,
 * index } (as the outline reads now), origin, distance }]`.
 */
export function outlineEditor(profile) {
  const loops = outlineLoops(profile);
  // The corners of the first outline (a corner taken out by a move still tells where it went).
  const vertices = loops.flatMap((loop) => loop.nodes.map((node) => node.v));
  return {
    edge({ loop, index }) {
      const seg = loops[loop]?.nodes[index]?.seg;
      if (!seg) throw new Error(GONE);
      if (seg.type !== 'line') throw new Error(STRAIGHT);
      return { loop: loops[loop], seg };
    },
    move(handle, distance, { span = null } = {}) {
      moveSegment(handle.loop, handle.seg, distance, span);
    },
    check: () => checkLoops(loops),
    profile() {
      const outer = shapeOf(loops[0]);
      if (!profile.holes) return outer;
      const holes = loops.slice(1).map(shapeOf);
      return loops.slice(1).some((loop) => loop.changed) ? { ...outer, holes } : outer;
    },
    trace() {
      const corners = [];
      for (let v of vertices) {
        const from = v.from;
        while (v.into) v = v.into;
        if (v.p[0] !== from[0] || v.p[1] !== from[1]) corners.push({ from, to: v.p });
      }
      return { loops: loops.map((loop) => loop.nodes.map((node) => node.seg.origin)), corners };
    },
    moved: () =>
      loops.flatMap((loop, l) =>
        loop.nodes
          .map((node, index) => ({ segment: { loop: l, index }, origin: node.seg.origin, distance: node.seg.moved }))
          .filter((m) => Math.abs(m.distance) > 1e-9),
      ),
  };
}

/**
 * The profile with one straight edge moved (§4.1): `{ loop, index }` as
 * cornerGaps.straightEdges numbers them, `distance` mm out of the metal
 * (negative: in), `span` ([p, q] on the edge): only that stretch moves. A
 * rectangle stays a rectangle while it can (a jog makes it a closed path), a
 * polygon and a path keep their type, arcs elsewhere are untouched, every new
 * point rounded to 1e-6. Throws in shop words.
 */
export function moveProfileEdge(profile, { loop, index }, distance, { span = null } = {}) {
  const editor = outlineEditor(profile);
  editor.move(editor.edge({ loop, index }), distance, { span });
  editor.check();
  return editor.profile();
}

// ---------------------------------------------------------------- what the sketcher keeps
const same = (p, q) => Math.abs(p[0] - q[0]) <= ON_LINE && Math.abs(p[1] - q[1]) <= ON_LINE;
/**
 * The sketcher's editing copy carried through an edge move (§4.3): the same
 * entities with their points moved, ids kept (a new edge a move made gets the
 * next free `e` id, next to the entity it follows), for `entities` in step
 * with `profile` (entitiesToProfile gives it back as JSON). `next`, `trace`:
 * the moved profile and outlineEditor's trace. null when the entities cannot
 * be carried (not in step, a rectangle that took a jog, an edge no entity
 * draws): the caller rebuilds them from the profile. A moved loop drawn by a
 * slot, a polygon or a rounded rectangle (HD-3, §7.1) is carried as that
 * shape's lines and arcs (sketchProfile.js explode), each with a new id.
 */
export function carryEntities(entities, profile, next, trace) {
  if (!entities?.length) return null;
  const rebuilt = entitiesToProfile(entities).profile;
  if (!rebuilt || JSON.stringify(rebuilt) !== JSON.stringify(profile)) return null;
  const before = outlineLoops(profile);
  const after = outlineLoops(next);
  let highest = 0;
  for (const e of entities) {
    const m = /^e(\d+)$/.exec(e.id || '');
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  const fresh = () => `e${++highest}`;
  const ends = (loop, k) => [loop.nodes[k].v.p, loop.nodes[(k + 1) % loop.nodes.length].v.p];
  const replaced = new Map(); // entity → the entities that take its place ([] : it goes)
  // What can draw a segment: the drawn lines and arcs, and the pieces of the
  // drawn slots, polygons and rounded rectangles (`shape`: the one it is part of).
  const drawers = entities.flatMap((e) => {
    if (e.construction) return [];
    if (e.type === 'line' || e.type === 'arc') return [{ entity: e, shape: null }];
    return isShapeLoop(e) ? explode(e).map((piece) => ({ entity: piece, shape: e })) : [];
  });
  const shapes = new Map(); // shape → its pieces that took part
  for (const [l, loop] of after.entries()) {
    const old = before[l];
    if (JSON.stringify(loop.shape) === JSON.stringify(old.shape)) continue;
    if (old.shape.type === 'rectangle') {
      // A rectangle drawn as one rect entity: its corners go where the rectangle's went.
      if (loop.shape.type !== 'rectangle') return null;
      const [x0, y0] = old.shape.origin || [0, 0];
      const rect = entities.find(
        (e) =>
          e.type === 'rect' &&
          !isShapeLoop(e) &&
          same([Math.min(e.a[0], e.b[0]), Math.min(e.a[1], e.b[1])], [x0, y0]) &&
          same([Math.max(e.a[0], e.b[0]), Math.max(e.a[1], e.b[1])], [x0 + old.shape.width, y0 + old.shape.height]),
      );
      if (!rect) return null;
      const [x, y] = loop.shape.origin || [0, 0];
      const lo = [x, y],
        hi = [x + loop.shape.width, y + loop.shape.height];
      const pick = (p) =>
        roundPoint([
          p[0] === Math.min(rect.a[0], rect.b[0]) ? lo[0] : hi[0],
          p[1] === Math.min(rect.a[1], rect.b[1]) ? lo[1] : hi[1],
        ]);
      replaced.set(rect, [{ ...rect, a: pick(rect.a), b: pick(rect.b) }]);
      continue;
    }
    // Which entity drew each segment of the loop as it was, and which way round.
    const owners = old.nodes.map((_, k) => {
      const [from, to] = ends(old, k);
      const drawer = drawers.find(
        ({ entity: e }) => (same(e.a, from) && same(e.b, to)) || (same(e.a, to) && same(e.b, from)),
      );
      return drawer ? { entity: drawer.entity, shape: drawer.shape, forward: same(drawer.entity.a, from) } : null;
    });
    if (owners.some((o) => !o)) return null;
    for (const { entity, shape } of owners) {
      replaced.set(entity, []);
      if (shape) shapes.set(shape, [...(shapes.get(shape) || []), entity]);
    }
    const origins = trace.loops[l] || [];
    if (origins.length !== loop.nodes.length) return null;
    // From the first segment an entity drew: a new edge goes in after the entity before it.
    const first = origins.findIndex(Boolean);
    if (first < 0) return null;
    let last = null;
    for (let j = 0; j < loop.nodes.length; j++) {
      const k = (first + j) % loop.nodes.length;
      const [from, to] = ends(loop, k);
      const owner = origins[k] && origins[k].loop === l ? owners[origins[k].index] : null;
      if (owner) last = owner.entity;
      const list = replaced.get(last);
      if (owner && owner.entity.type === 'arc') list.push(owner.entity);
      else if (owner && !list.length)
        // It keeps its id and its sense along the outline.
        list.push({ ...owner.entity, a: owner.forward ? from : to, b: owner.forward ? to : from });
      else list.push({ id: fresh(), type: 'line', a: from, b: to });
    }
  }
  // A shape that took part goes; its pieces (each with a new id) take its place.
  for (const [shape, pieces] of shapes)
    replaced.set(
      shape,
      pieces.flatMap((piece) => replaced.get(piece)).map((e) => (e.id ? e : { id: fresh(), ...e })),
    );
  const out = entities.flatMap((e) => (replaced.has(e) ? replaced.get(e) : [e]));
  const check = entitiesToProfile(out).profile;
  return check && JSON.stringify(check) === JSON.stringify(next) ? out : null;
}

/**
 * The sketch's reference dimensions (docs/sketch-studio-sketch-dimensions.md)
 * after an edge move: a linear dimension's end on a corner that moved
 * (1e-3 mm) goes with it, so it keeps measuring what it measured; any other
 * end, and every radial one, stays (they only report). The list as it was
 * when nothing moves.
 */
export function carryDimensions(dimensions, trace) {
  if (!Array.isArray(dimensions) || !trace?.corners.length) return dimensions;
  const follow = (p) => trace.corners.find((c) => Math.hypot(p[0] - c.from[0], p[1] - c.from[1]) <= 1e-3)?.to || null;
  let changed = false;
  const out = dimensions.map((dimension) => {
    if (dimension.type !== 'linear') return dimension;
    const from = follow(dimension.from),
      to = follow(dimension.to);
    if (!from && !to) return dimension;
    changed = true;
    return { ...dimension, ...(from ? { from } : {}), ...(to ? { to } : {}) };
  });
  return changed ? out : dimensions;
}
