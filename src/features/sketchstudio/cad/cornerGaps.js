// Flange gaps (docs/sketch-studio-corner-gaps.md §3.1): how far each cut end of
// a folded sheet-metal part stands from the faces of the flanges round it, and
// where two flanges' metal would share space at the sheet's true thickness.
// Pure: no three, no DOM. Exact plane geometry, no sampling: a cut end is a
// rectangle (one straight edge of the blank × the thickness), a sheet face is
// the piece's outline in its plane, and every distance is between those.
//
// Frames: `fold` is foldSheet's result (posed): a piece's matrix maps its flat
// coordinates (blank XY, z ∈ [0, t]) to the folded part frame.
import { numeric } from './model.js';
import {
  crossingText,
  foldSheet,
  hitSequence,
  isBendOn,
  lineSegments,
  pointInRing,
  profilePolygon,
  transformPoint,
} from './sheetMetal.js';
import { triangulateWithHoles, trianglesCross } from './brakeCollisions.js';
import { outlineEditor, outlineMoveProblem } from './outlineMove.js';
import { strokeTooling } from './pressBrake.js';

export const GAP_REACH = 3; // rows further apart than this are left out
export const FACING = 0.94; // cos 20°: two faces face each other
export const OVERLAP_SKIN = 0.005; // deeper than this is metal inside metal

// A piece edge lies on a blank edge when both its ends are this close to it.
const ON_EDGE = 1e-6;
// A piece edge shorter than this is no face (a jog laid on a bend zone's edge leaves such slivers).
const SLIVER = 0.01;
// Under this a pushed end touches a face (beside 0).
const TOUCH = 1e-9;

const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// A matrix column (0 = flat X, 1 = flat Y, 2 = flat Z) in the folded frame: a unit vector, rigid matrices.
const column = (m, i) => [m[i * 4], m[i * 4 + 1], m[i * 4 + 2]];
const origin = (m) => [m[12], m[13], m[14]];

// ---------------------------------------------------------------- the blank's straight edges
/**
 * Every straight cut edge of the blank, in profile order: [{ loop (0 = the
 * outline, 1 … = profile.holes[loop − 1]), index (its place among that loop's
 * segments: a path's `segments` index, a polygon's point index (points[i] →
 * points[i + 1]), a rectangle's corner order from its origin; a path whose
 * last segment does not end on its start closes with an edge numbered
 * segments.length), a, b (flat mm, in the loop's own direction) }]. Path
 * `line` segments, polygon and rectangle edges; arcs, circles and splines
 * have none (their chords are no faces). Construction segments are skipped.
 */
export function straightEdges(profile, params = {}) {
  const n = (value) => numeric(value, params);
  const point = (p) => [n(p[0]), n(p[1])];
  const out = [];
  const push = (loop, index, a, b) => {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) out.push({ loop, index, a, b });
  };
  const edgesOf = (shape, loop) => {
    if (!shape || typeof shape.type !== 'string') return;
    if (shape.type === 'rectangle') {
      const [x, y] = point(shape.origin || [0, 0]),
        w = n(shape.width),
        h = n(shape.height);
      const corners = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ];
      corners.forEach((p, i) => push(loop, i, p, corners[(i + 1) % 4]));
    } else if (shape.type === 'polygon') {
      const points = (shape.points || []).map(point);
      points.forEach((p, i) => push(loop, i, p, points[(i + 1) % points.length]));
    } else if (shape.type === 'path') {
      const start = point(shape.start);
      let from = start;
      (shape.segments || []).forEach((segment, i) => {
        if (segment.construction) return;
        const end = point(segment.end);
        if (segment.type === 'line') push(loop, i, from, end);
        from = end;
      });
      // An outline that does not end on its start closes with a straight edge (as profilePolygon closes it).
      push(loop, (shape.segments || []).length, from, start);
    }
  };
  edgesOf(profile, 0);
  (profile?.holes || []).forEach((hole, i) => edgesOf(hole, i + 1));
  return out;
}

// ---------------------------------------------------------------- 2D helpers
function closestOnSegment(p, a, b) {
  const d = sub2(b, a);
  const length = dot2(d, d);
  const f = length ? Math.max(0, Math.min(1, dot2(sub2(p, a), d) / length)) : 0;
  const q = [a[0] + d[0] * f, a[1] + d[1] * f];
  return { point: q, distance: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}
// Where segments p → q and r → s meet (touching counts), or null. Collinear overlaps give an end inside the other.
function segmentsMeet(p, q, r, s) {
  const d = sub2(q, p),
    e = sub2(s, r);
  const den = cross2(d, e);
  const w = sub2(r, p);
  if (Math.abs(den) < 1e-15) {
    if (Math.abs(cross2(w, d)) > 1e-12 * Math.max(1, Math.hypot(...d))) return null;
    for (const [x, a, b] of [
      [r, p, q],
      [s, p, q],
      [p, r, s],
      [q, r, s],
    ])
      if (closestOnSegment(x, a, b).distance <= TOUCH) return x;
    return null;
  }
  const t = cross2(w, e) / den,
    u = cross2(w, d) / den;
  const slack = 1e-12;
  if (t < -slack || t > 1 + slack || u < -slack || u > 1 + slack) return null;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}
const insideRings = (p, rings) => pointInRing(p, rings[0]) && !rings.slice(1).some((h) => pointInRing(p, h));
const ringEdges = (ring) => ring.map((p, i) => [p, ring[(i + 1) % ring.length]]);

// The exact distance in a plane between a convex quadrilateral and a face
// (rings: outline, then holes): { beside: 0, inside: [points of the overlap's
// outline] } when they share area or touch, else { beside, pair: [on the quad,
// on the face] }.
function quadToFace(quad, rings) {
  const quadSides = ringEdges(quad);
  const faceSides = rings.flatMap(ringEdges);
  const inside = [];
  for (const [p, q] of quadSides)
    for (const [r, s] of faceSides) {
      const x = segmentsMeet(p, q, r, s);
      if (x) inside.push(x);
    }
  for (const v of quad) if (insideRings(v, rings)) inside.push(v);
  for (const ring of rings) for (const v of ring) if (pointInRing(v, quad)) inside.push(v);
  if (inside.length) return { beside: 0, inside };
  let best = { beside: Infinity, pair: null };
  for (const [p, q] of quadSides)
    for (const [r, s] of faceSides) {
      for (const [x, a, b, flip] of [
        [p, r, s, false],
        [q, r, s, false],
        [r, p, q, true],
        [s, p, q, true],
      ]) {
        const c = closestOnSegment(x, a, b);
        if (c.distance < best.beside) best = { beside: c.distance, pair: flip ? [c.point, x] : [x, c.point] };
      }
    }
  return best;
}

// ---------------------------------------------------------------- faces
// The faces of one posed piece: its two sheet faces and one end face per edge
// of its outline or holes that lies on a straight cut edge of the blank.
function pieceFaces(fold, piece, edges, bendsById) {
  const t = fold.thickness;
  const m = piece.matrix;
  const X = column(m, 0),
    Y = column(m, 1),
    Z = column(m, 2),
    T = origin(m);
  const own = piece.path.length ? bendsById.get(piece.path.at(-1)) : null;
  const rings = [piece.outer, ...(piece.holes || [])];
  // A sheet face: the piece's outline in the plane flat z.
  const sheet = (z, side) => {
    const at = transformPoint(m, [0, 0, z]);
    return {
      kind: 'face',
      side,
      normal: z ? Z : scale3(Z, -1),
      point: at,
      rings,
      toLocal: (P) => {
        const d = sub3(P, T);
        return [dot3(d, X), dot3(d, Y)];
      },
      lift: ([x, y]) => transformPoint(m, [x, y, z]),
    };
  };
  const inside = own ? (own.direction === 'up' ? 't' : '0') : null;
  const faces = [
    sheet(t, own ? (inside === 't' ? 'inside' : 'outside') : 'top'),
    sheet(0, own ? (inside === '0' ? 'inside' : 'outside') : 'underside'),
  ];
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i],
        q = ring[(i + 1) % ring.length];
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!(L >= SLIVER)) continue;
      // The straight cut edge it lies on (a bend zone's strip edge or a curve's chord lies on none).
      const edge = edges.find(
        (e) => closestOnSegment(p, e.a, e.b).distance <= ON_EDGE && closestOnSegment(q, e.a, e.b).distance <= ON_EDGE,
      );
      if (!edge) continue;
      // Outer counter-clockwise, holes clockwise: the metal is left of p → q, outward is right.
      const flatNormal = [(q[1] - p[1]) / L, -(q[0] - p[0]) / L];
      const P0 = transformPoint(m, [p[0], p[1], 0]),
        Q0 = transformPoint(m, [q[0], q[1], 0]);
      const e = scale3(sub3(Q0, P0), 1 / L);
      faces.push({
        kind: 'end',
        segment: { loop: edge.loop, index: edge.index },
        flat: [p, q],
        normal: add3(scale3(X, flatNormal[0]), scale3(Y, flatNormal[1])),
        point: P0,
        corners: [P0, Q0, transformPoint(m, [q[0], q[1], t]), transformPoint(m, [p[0], p[1], t])],
        rings: [
          [
            [0, 0],
            [L, 0],
            [L, t],
            [0, t],
          ],
        ],
        toLocal: (P) => {
          const d = sub3(P, P0);
          return [dot3(d, e), dot3(d, Z)];
        },
        lift: ([s, w]) => add3(P0, add3(scale3(e, s), scale3(Z, w))),
      });
    }
  return faces;
}

// The folded box of a piece (both faces), [min, max].
function pieceBox(fold, piece) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const [x, y] of piece.outer)
    for (const z of [0, fold.thickness]) {
      const p = transformPoint(piece.matrix, [x, y, z]);
      for (let k = 0; k < 3; k++) {
        if (p[k] < min[k]) min[k] = p[k];
        if (p[k] > max[k]) max[k] = p[k];
      }
    }
  return [min, max];
}
const boxesNear = ([a0, a1], [b0, b1], margin) =>
  [0, 1, 2].every((k) => a0[k] <= b1[k] + margin && b0[k] <= a1[k] + margin);
// Two pieces lying as they were cut against each other (the same pose): a gap between them is the cut's, not the fold's.
const samePose = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
const pathKey = (path) => (path.length ? path.join('/') : 'base');

// End face A of one piece against face B of another (§3.1): the row, or null.
function faceRow(A, B, reach) {
  const k = -dot3(A.normal, B.normal);
  if (k < FACING) return null;
  // The signed distance along n_A from each corner of A to B's plane.
  const along = A.corners.map((c) => dot3(sub3(c, B.point), B.normal) / k);
  const gap = Math.min(...along);
  if (Math.abs(gap) > reach) return null;
  const quad = A.corners.map((c, i) => B.toLocal(add3(c, scale3(A.normal, along[i]))));
  const found = quadToFace(quad, B.rings);
  const beside = found.beside <= TOUCH ? 0 : found.beside;
  if (beside > reach) return null;
  // A point of B's plane back on A's face along n_A, and how far it is from it.
  const back = (X2) => {
    const X = B.lift(X2);
    const g = dot3(sub3(X, A.point), A.normal);
    return { P: sub3(X, scale3(A.normal, g)), Q: X, g };
  };
  let at;
  if (beside) {
    const { P } = back(found.pair[0]);
    at = [P, B.lift(found.pair[1])];
  } else {
    // Where the two face each other, the point of A nearest B's plane.
    const best = found.inside.map(back).reduce((x, y) => (y.g < x.g ? y : x));
    at = [best.P, best.Q];
  }
  return { gap, beside, k, at };
}

// ---------------------------------------------------------------- the solids, for the overlaps
// A piece's outline as flat triangles, kept by its outline (a posed fold's
// pieces share their outline with the fold they were posed from): the brake
// tests every step's end at thickness (§5), the same outlines each time.
const flatTriangles = new WeakMap();
/** A piece's outline and holes as flat triangles (flat x, y), cached by its outline. */
export function pieceTriangles(piece) {
  let triangles = flatTriangles.get(piece.outer);
  if (!triangles) {
    triangles = triangulateWithHoles(piece.outer, piece.holes || []);
    flatTriangles.set(piece.outer, triangles);
  }
  return triangles;
}
// A piece as triangles at the sheet's true thickness, each sheet face pulled
// in by OVERLAP_SKIN (a flange lying on a face is no overlap).
function pieceSolid(fold, piece) {
  const t = fold.thickness;
  const lo = OVERLAP_SKIN,
    hi = t - OVERLAP_SKIN;
  const lift = (z) => (p) => transformPoint(piece.matrix, [p[0], p[1], z]);
  const flat = pieceTriangles(piece);
  const triangles = [...flat.map((tri) => tri.map(lift(lo))), ...flat.map((tri) => tri.map(lift(hi)))];
  for (const ring of [piece.outer, ...(piece.holes || [])])
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      const [a, b, c, d] = [lift(lo)(p), lift(lo)(q), lift(hi)(q), lift(hi)(p)];
      triangles.push([a, b, c], [a, c, d]);
    });
  return triangles.map((triangle) => {
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const p of triangle)
      for (let k = 0; k < 3; k++) {
        if (p[k] < min[k]) min[k] = p[k];
        if (p[k] > max[k]) max[k] = p[k];
      }
    return { triangle, box: [min, max] };
  });
}

// The pieces of a posed fold, each with its folded box and its own bend's index (null: the base).
const pieceEntries = (fold, bendsById) =>
  fold.pieces.map((piece) => ({
    piece,
    box: pieceBox(fold, piece),
    bend: piece.path.length ? (bendsById.get(piece.path.at(-1))?.index ?? null) : null,
  }));
// The piece pairs one bend joins (fixed ↔ moving), as "id|id" sorted.
const joinedPairs = (fold) =>
  new Set(fold.bends.flatMap((b) => b.movingPieces.map((m) => [b.fixedPiece, m].sort().join('|'))));
// Of `pairs` ([A, B] entries), those whose metal crosses at the true thickness (each sheet face pulled in by OVERLAP_SKIN).
function crossingPairs(fold, pairs) {
  const solids = new Map();
  const solidOf = (entry) => {
    if (!solids.has(entry)) solids.set(entry, pieceSolid(fold, entry.piece));
    return solids.get(entry);
  };
  return pairs.filter(([A, B]) => {
    if (!boxesNear(A.box, B.box, 0)) return false;
    const sa = solidOf(A),
      sb = solidOf(B);
    return sa.some((x) => sb.some((y) => boxesNear(x.box, y.box, 0) && trianglesCross(x.triangle, y.triangle)));
  });
}

/**
 * Metal inside metal on a posed fold (§5): the `overlaps` of flangeGaps
 * (§3.1) without the rows, for the brake's end of a stroke. Pairs of pieces
 * not joined by a bend and not lying as cut (the same pose) whose solids cross
 * at the sheet's true thickness, each sheet face pulled in by OVERLAP_SKIN.
 * `moved`: piece ids (a Set or an array; null: every pair) — a pair with
 * neither in it is skipped (it did not move in this stroke). Returns [{ pieces:
 * [id, id], bends: [index | null, index | null] }], in the fold's piece order.
 */
export function foldOverlaps(fold, { moved = null } = {}) {
  const bendsById = new Map(fold.bends.map((b) => [b.id, b]));
  const joined = joinedPairs(fold);
  const carried = moved == null ? null : new Set(moved);
  const pieces = pieceEntries(fold, bendsById);
  const pairs = [];
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const A = pieces[i],
        B = pieces[j];
      if (carried && !carried.has(A.piece.id) && !carried.has(B.piece.id)) continue;
      if (joined.has([A.piece.id, B.piece.id].sort().join('|'))) continue;
      if (samePose(A.piece.matrix, B.piece.matrix)) continue;
      if (!boxesNear(A.box, B.box, 0)) continue;
      pairs.push([A, B]);
    }
  return crossingPairs(fold, pairs).map(([A, B]) => ({ pieces: [A.piece.id, B.piece.id], bends: [A.bend, B.bend] }));
}

// ---------------------------------------------------------------- the rows
/**
 * The flange gaps of a folded part (§3.1). `fold`: foldSheet's result (posed;
 * the gaps are of that pose), `profile` the blank's sketch profile, `params`
 * resolved parameter values. Returns { rows, overlaps, least }:
 * rows [{ key (stable across an outline edit: the two bend paths and B's
 * side, numbered when not unique; an edge-to-edge row's paths in sorted
 * order), a: { piece, bend (index of the bend whose flange it is, null: the
 * base), path, segment: { loop, index } (straightEdges), flat: [p, q] }, b: {
 * piece, bend, path, kind: 'face' | 'edge', side (a face: 'inside' |
 * 'outside' by b's own bend direction, the base 'top' | 'underside'),
 * segment? and flat? (an edge) }, gap, beside, distance, k, at: [P, Q]
 * (folded), flatAt: [P, Q] (each in its own piece's flat frame, [x, y, z]),
 * both, overlap (gap < −OVERLAP_SKIN and beside 0), cover (a face row past
 * the face's plane but beside it: the end runs past the neighbour's end) and
 * flush (a covering row's gap + t / k: 0 in the plane of the neighbour's far
 * face) }]: overlaps first, then by the gap they read, the covering rows last;
 * overlaps [{ pieces, bends, row (the key of the row between them, or null) }];
 * least: the smallest gap a row reads (covering rows aside), 0 when anything
 * overlaps, null with no such row.
 */
export function flangeGaps(fold, profile, params = {}, { reach = GAP_REACH } = {}) {
  const edges = straightEdges(profile, params);
  const bendsById = new Map(fold.bends.map((b) => [b.id, b]));
  const joined = joinedPairs(fold);
  const pieces = pieceEntries(fold, bendsById).map((entry) => ({
    ...entry,
    faces: pieceFaces(fold, entry.piece, edges, bendsById),
  }));
  // The pairs whose gaps are the fold's: not one piece, not joined by a bend, not lying as cut, near.
  const pairs = [];
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const A = pieces[i],
        B = pieces[j];
      if (joined.has([A.piece.id, B.piece.id].sort().join('|'))) continue;
      if (samePose(A.piece.matrix, B.piece.matrix)) continue;
      if (!boxesNear(A.box, B.box, reach)) continue;
      pairs.push([A, B]);
    }
  // One row per blank segment of A against one face of B: the smallest gap.
  const best = new Map();
  for (const [first, second] of pairs)
    for (const [A, B] of [
      [first, second],
      [second, first],
    ])
      for (const fa of A.faces) {
        if (fa.kind !== 'end') continue;
        for (const fb of B.faces) {
          const found = faceRow(fa, fb, reach);
          if (!found) continue;
          const bFace = fb.kind === 'end' ? `${fb.segment.loop}:${fb.segment.index}` : fb.side;
          const id = `${A.piece.id}:${fa.segment.loop}:${fa.segment.index}|${B.piece.id}:${bFace}`;
          const held = best.get(id);
          if (held && held.gap <= found.gap) continue;
          const toFlat = (m, P) => {
            const d = sub3(P, origin(m));
            return [dot3(d, column(m, 0)), dot3(d, column(m, 1)), dot3(d, column(m, 2))];
          };
          best.set(id, {
            ...found,
            A,
            B,
            fa,
            fb,
            flatAt: [toFlat(A.piece.matrix, found.at[0]), toFlat(B.piece.matrix, found.at[1])],
          });
        }
      }
  // Edge against edge: the two mirror rows are one (the one with the smaller gap stands for both).
  const found = [...best.values()];
  const mirrorOf = (r) =>
    r.fb.kind === 'end'
      ? found.find(
          (o) =>
            o !== r &&
            o.A === r.B &&
            o.B === r.A &&
            o.fb.kind === 'end' &&
            o.fa.segment.loop === r.fb.segment.loop &&
            o.fa.segment.index === r.fb.segment.index &&
            o.fb.segment.loop === r.fa.segment.loop &&
            o.fb.segment.index === r.fa.segment.index,
        ) || null
      : null;
  const used = new Set();
  const rows = [];
  for (const r of found) {
    if (used.has(r)) continue;
    const mirror = mirrorOf(r);
    let kept = r;
    if (mirror) {
      used.add(mirror);
      if (mirror.gap < r.gap) kept = mirror;
    }
    used.add(r);
    const { A, B, fa, fb } = kept;
    const pathA = A.piece.path,
      pathB = B.piece.path;
    const both = Boolean(mirror);
    const kindKey = fb.kind === 'end' ? 'edge' : fb.side;
    // Stable across an outline edit: bend paths, not piece ids (those follow the clipping order).
    const key = both
      ? `${[pathKey(pathA), pathKey(pathB)].sort().join('>')}>edge`
      : `${pathKey(pathA)}>${pathKey(pathB)}>${kindKey}`;
    const overlap = kept.gap < -OVERLAP_SKIN && kept.beside === 0;
    // Past the plane of the face but beside it: the end runs past the neighbour's end (a closed corner).
    const cover = fb.kind !== 'end' && kept.gap < -OVERLAP_SKIN && kept.beside > 0;
    rows.push({
      key,
      a: { piece: A.piece.id, bend: A.bend, path: pathA, segment: fa.segment, flat: fa.flat },
      b: {
        piece: B.piece.id,
        bend: B.bend,
        path: pathB,
        kind: fb.kind === 'end' ? 'edge' : 'face',
        ...(fb.kind === 'end' ? { segment: fb.segment, flat: fb.flat } : { side: fb.side }),
      },
      gap: kept.gap,
      beside: kept.beside,
      distance: kept.beside ? Math.hypot(Math.max(kept.gap, 0), kept.beside) : Math.max(kept.gap, 0),
      k: kept.k,
      at: kept.at,
      flatAt: kept.flatAt,
      both,
      overlap,
      cover,
      // A covering end from the plane of the neighbour's far sheet face (0: flush with it).
      ...(cover ? { flush: kept.gap + fold.thickness / kept.k } : {}),
    });
  }
  // Keys used twice are numbered, in a stable order along the blank (the A edge's middle, x then y).
  const byKey = new Map();
  for (const row of rows) byKey.set(row.key, [...(byKey.get(row.key) || []), row]);
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const middle = (row) => [(row.a.flat[0][0] + row.a.flat[1][0]) / 2, (row.a.flat[0][1] + row.a.flat[1][1]) / 2];
    group
      .sort((p, q) => {
        const [mp, mq] = [middle(p), middle(q)];
        return Math.abs(mp[0] - mq[0]) > 1e-3 ? mp[0] - mq[0] : mp[1] - mq[1];
      })
      .forEach((row, i) => (row.key = `${row.key}#${i + 1}`));
  }
  rows.sort((p, q) =>
    p.overlap !== q.overlap
      ? p.overlap
        ? -1
        : 1
      : p.cover !== q.cover
        ? p.cover
          ? 1
          : -1
        : p.cover
          ? Math.abs(p.flush) - Math.abs(q.flush)
          : reading(p) - reading(q) || p.distance - q.distance,
  );
  // Metal inside metal at the true thickness: the pairs whose solids cross.
  const overlaps = [];
  for (const [A, B] of crossingPairs(fold, pairs)) {
    const between = rows.filter(
      (r) =>
        (r.a.piece === A.piece.id && r.b.piece === B.piece.id) ||
        (r.a.piece === B.piece.id && r.b.piece === A.piece.id),
    );
    const row = between.find((r) => r.overlap) || between[0] || null;
    const [first, second] = row && row.a.piece === B.piece.id ? [B, A] : [A, B];
    overlaps.push({
      pieces: [first.piece.id, second.piece.id],
      bends: [first.bend, second.bend],
      row: row?.key ?? null,
    });
  }
  // The least gap the rows read (a covering end has none of its own: it reads flush or not).
  const open = rows.filter((r) => !r.cover);
  const least =
    overlaps.length || rows.some((r) => r.overlap)
      ? 0
      : open.length
        ? open.reduce((m, r) => Math.min(m, reading(r)), Infinity)
        : null;
  return { rows, overlaps, least };
}
// The figure a row reads (its gap, never under 0).
const reading = (row) => Math.max(row.gap, 0);

// ---------------------------------------------------------------- on the bench (§6)
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// A direction carried by a rigid matrix (its rotation only).
const turn = (m, v) => add3(add3(scale3(column(m, 0), v[0]), scale3(column(m, 1), v[1])), scale3(column(m, 2), v[2]));
/**
 * What a row's band is made of (§6.1, as revised at the CG-4 audit: every
 * error projected on the gap's own direction), on the fold the row was read
 * on. `ends`: the cut edges that set the gap (1 for an end against a face, 2
 * for an end against an end). `bends`: one entry per bend on the path through
 * the part from one piece to the other — the symmetric difference of the two
 * pieces' `path` lists (bends both share move the two together) — { bend (its
 * index), slide, lever }, both per unit of the error and divided by the row's
 * k, read along n_B (the unit normal of the plane the gap is read to: B's sheet
 * face for a face row, B's end for an edge row, posed):
 * - `slide` (mm of gap per mm the bend line lies off): a line laid ε off
 *   across itself moves all it carries, rigidly, by ε · (d_fixed − d_moved),
 *   d the flat unit direction across the line (`bend.n`) as the bend's fixed
 *   side poses it and as the piece it bends directly poses it (a 90° wall: ε
 *   outward and ε lower); slide = |(d_fixed − d_moved) · n_B| / k.
 * - `lever` (mm of gap per radian the angle is off): all it carries turns about
 *   its axis (O, D: the line through its centre of curvature along the bend,
 *   carried into the folded frame by its fixed side); lever = the largest, over
 *   the four corners c of the row's end face (A's blank edge × z 0 and t,
 *   posed), of |(D × (c − O)) · n_B| / k.
 * A bend standing flat has neither. { ends, bends: [{ bend, slide, lever }] }.
 */
export function bandTerms(row, fold) {
  const ends = isEdgeRow(row) ? 2 : 1;
  const between = [
    ...row.a.path.filter((id) => !row.b.path.includes(id)),
    ...row.b.path.filter((id) => !row.a.path.includes(id)),
  ];
  const pieceOf = (id) => fold.pieces.find((p) => p.id === id);
  const A = pieceOf(row.a.piece),
    B = pieceOf(row.b.piece);
  // n_B (its sign plays no part: every term is read as a size).
  let nB = column(B.matrix, 2);
  if (row.b.kind === 'edge' && row.b.flat) {
    const [p, q] = row.b.flat;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    nB = turn(B.matrix, [(q[1] - p[1]) / L, -(q[0] - p[0]) / L, 0]);
  }
  const k = row.k || 1;
  const [p, q] = row.a.flat;
  const corners = [p, q].flatMap(([x, y]) => [0, fold.thickness].map((z) => transformPoint(A.matrix, [x, y, z])));
  const bends = between.map((id) => {
    const bend = fold.bends.find((b) => b.id === id);
    const carried = fold.pieces.find((piece) => piece.path.at(-1) === id);
    if (!bend?.transform?.origin || !bend.fixedMatrix || !carried)
      return { bend: bend?.index ?? null, slide: 0, lever: 0 };
    const across = [bend.n[0], bend.n[1], 0];
    const shift = sub3(turn(bend.fixedMatrix, across), turn(carried.matrix, across));
    const O = transformPoint(bend.fixedMatrix, bend.transform.origin);
    const along = turn(bend.fixedMatrix, bend.transform.axis);
    const D = scale3(along, 1 / Math.hypot(...along));
    const lever = corners.reduce((m, c) => Math.max(m, Math.abs(dot3(cross3(D, sub3(c, O)), nB))), 0) / k;
    return { bend: bend.index, slide: Math.abs(dot3(shift, nB)) / k, lever };
  });
  return { ends, bends };
}
/**
 * How far a row's gap may be off on the bench (§6.1), mm: independent errors
 * in quadrature, each projected on the gap's direction (bandTerms) —
 * √(cut² · ends + Σ over the bends between the two flanges of ((flange ·
 * slide)² + (lever · tan(angle))²)): each cut edge that sets the gap ± `cut`,
 * each bend line ± `flange` across itself, each bend's angle ± `angle` degrees
 * (a wall 1° off moves its top, not its foot). `tolerance`: { flange, cut,
 * angle } (shopCatalog.js shopTolerance). `fold`: the fold the row was read on.
 * A covering row's band is read against its `flush` (benchVerdict).
 */
export function gapBand(row, fold, tolerance) {
  const { ends, bends } = bandTerms(row, fold);
  const tan = Math.tan((tolerance.angle * Math.PI) / 180);
  const sum = bends.reduce((total, b) => total + (tolerance.flange * b.slide) ** 2 + (b.lever * tan) ** 2, 0);
  return Math.sqrt(tolerance.cut ** 2 * ends + sum);
}
/**
 * What the band says of a row (§6.1): 'touch' (its gap, less the band, is
 * under 0: on the bench the end may touch), 'proud' (a covering end: flush
 * less the band under 0, it may stand proud of the other wall's outside face)
 * or null; an overlap's own words stand (null).
 */
export function benchVerdict(row, band) {
  if (band == null || row.overlap) return null;
  if (row.cover) return row.flush - band < 0 ? 'proud' : null;
  return row.gap - band < 0 ? 'touch' : null;
}

// ---------------------------------------------------------------- words
const mm = (value) => `${(Math.abs(value) < 0.005 ? 0 : value).toFixed(2)} mm`;
const flange = (bend) => (bend == null ? 'the base' : `bend ${bend + 1} flange`);
const capital = (text) => text[0].toUpperCase() + text.slice(1);
/** "Bend 8 flange, end → bend 5 flange, inside face" / "Bend 1 flange ↔ bend 3 flange, edge to edge" / "… → the base, top". */
export function gapLabel(row) {
  const a = capital(flange(row.a.bend));
  if (row.both) return `${a} ↔ ${flange(row.b.bend)}, edge to edge`;
  if (row.b.kind === 'edge') return `${a}, end → ${flange(row.b.bend)}, end`;
  const side = row.b.bend == null ? row.b.side : `${row.b.side} face`;
  return `${a}, end → ${flange(row.b.bend)}, ${side}`;
}
/**
 * "0.73 mm", with " · passes 1.22 mm beside it" when it misses the face; "runs
 * 0.30 mm into it" for an overlap. With `band` (gapBand, §6.1) it adds " · ±
 * 0.42 on the bench", and ": may touch" (": may stand proud" for a covering
 * end) where benchVerdict says so; an overlap takes no band.
 */
export function gapText(row, band = null) {
  if (row.overlap) return `runs ${mm(-row.gap)} into it`;
  const bench =
    band == null
      ? ''
      : ` · ± ${band.toFixed(2)} on the bench${{ touch: ': may touch', proud: ': may stand proud' }[benchVerdict(row, band)] || ''}`;
  if (row.cover)
    return `${
      Math.abs(row.flush) <= 0.005
        ? 'runs past its end: flush with its outside face'
        : row.flush > 0
          ? `runs past its end: ${mm(row.flush)} short of flush`
          : `runs past its end: ${mm(-row.flush)} proud of it`
    }${bench}`;
  return `${mm(row.gap)}${row.beside > 0.005 ? ` · passes ${mm(row.beside)} beside it` : ''}${bench}`;
}
/** A flange's name in a sentence: "Bend 8's flange" / "the base". */
export const flangeName = (bend, start = false) => {
  const name = bend == null ? 'the base' : `bend ${bend + 1}'s flange`;
  return start ? capital(name) : name;
};

// ---------------------------------------------------------------- setting a gap (§4.2)
// A row this near what it is asked for is left alone; a set is done when every row is this near.
const SET_CLOSE = 0.0005;
const SET_DONE = 0.001;
const MAX_PASSES = 4;
const FACE_WAYS = ['short', 'cover'];
const EDGE_WAYS = ['both', 'a', 'b'];
const BOTH_COVER = 'Both flanges cannot cover the same corner: let one of them stop short.';
const faceWay = (style) => new Error(`A wall's gap stops short or runs past: not "${style}".`);
const edgeWay = (style) => new Error(`An edge-to-edge gap is set by both edges or by one: not "${style}".`);

/** An end against an end (a mitre): either edge may take the move (§4.2). */
export const isEdgeRow = (row) => row.b.kind === 'edge';
// The other wall's row of an open corner: its end back against this row's flange.
const partnerOf = (row, rows) =>
  rows.find((o) => o !== row && !isEdgeRow(o) && o.a.piece === row.b.piece && o.b.piece === row.a.piece) || null;

/**
 * The corner rows (§4.2), the rows "Set all" moves: a row whose two faces face
 * each other (beside ≤ 0.005), an edge-to-edge row, or a row whose other
 * flange has an end row back against this one (the two walls of an open
 * corner: that row passes beside too; or this end covers it). Of several ends
 * of one flange against one face (keys numbered #1, #2) only the nearest is
 * the corner's: the others stand behind it (a relief's side). Any other row
 * (an ear's top edge passing under a lip, a relief's side) is set on its own
 * or not at all.
 */
export function cornerRows(rows) {
  const base = (key) => key.replace(/#\d+$/, '');
  const nearest = new Map();
  for (const row of rows) {
    const held = nearest.get(base(row.key));
    if (!held || row.gap < held.gap) nearest.set(base(row.key), row);
  }
  return rows.filter((row) => {
    if (nearest.get(base(row.key)) !== row) return false;
    if (isEdgeRow(row) || row.beside <= 0.005) return true;
    const partner = partnerOf(row, rows);
    return partner != null && (row.cover || partner.beside > 0.005);
  });
}

// How far a row stands from what its way asks: a covering end from flush, any other from the gap.
const offTarget = (row, target, cover, thickness) => (cover ? row.gap + thickness / row.k : row.gap - target);

/**
 * The edge moves that bring `rows` to `target` (§4.2): [{ segment: { loop,
 * index }, span? ([p, q] flat: only that stretch moves), distance (mm out of
 * the metal, as moveProfileEdge takes it), keys (the rows asking for it) }].
 * `keys`: only those rows (null: every row given); `styles`: row key →
 * 'short' | 'cover' (a face row; absent: as it reads today) or 'both' | 'a' |
 * 'b' (edge to edge; absent: both). A face row stopping short moves its whole
 * edge (gap − target) / k; a covering one moves its flange's own stretch
 * (`a.flat`) to gap = −t / k, flush with the neighbour's far face (needs
 * `thickness`); an edge row moves each edge half, or one edge the whole. An
 * edge asked for by several rows takes the smallest move, so no gap ends under
 * the target; a row within 0.0005 of its target asks for nothing.
 */
export function gapMoves(rows, target, { keys = null, styles = {}, thickness = null } = {}) {
  const moves = new Map();
  const want = (segment, distance, span, key) => {
    const id = `${segment.loop}:${segment.index}`;
    const held = moves.get(id);
    if (held && held.distance <= distance) return held.keys.push(key);
    moves.set(id, { segment, ...(span ? { span } : {}), distance, keys: [...(held?.keys || []), key] });
  };
  for (const row of rows) {
    if (keys && !keys.includes(row.key)) continue;
    const style = styles[row.key] ?? null;
    if (isEdgeRow(row)) {
      if (style != null && !EDGE_WAYS.includes(style)) throw edgeWay(style);
      const off = row.gap - target;
      if (Math.abs(off) <= SET_CLOSE) continue;
      if ((style || 'both') === 'both') {
        want(row.a.segment, off / (2 * row.k), null, row.key);
        want(row.b.segment, off / (2 * row.k), null, row.key);
      } else want(style === 'a' ? row.a.segment : row.b.segment, off / row.k, null, row.key);
      continue;
    }
    if (style != null && !FACE_WAYS.includes(style)) throw faceWay(style);
    const cover = (style || (row.cover ? 'cover' : 'short')) === 'cover';
    if (cover && !(thickness > 0)) throw new Error('A covering end needs the sheet thickness.');
    const off = offTarget(row, target, cover, thickness);
    if (Math.abs(off) <= SET_CLOSE) continue;
    want(row.a.segment, off / row.k, cover ? row.a.flat : null, row.key);
  }
  return [...moves.values()];
}

// Every bend stays on the metal it bends today (§4.2): a record whose line
// picks up new metal after the move (an interval overlapping none it had) is
// clipped to the intervals it had, by strokeBends' rule (min(0.5, a quarter
// of the interval) inside the first and the last, rounded to 1e-6); every
// other record is given back as it was (the same object). Throws in shop words.
function keepBendsOnTheirMetal(records, before, profile, params) {
  const after = profilePolygon(profile, params);
  const n = (value) => numeric(value, params);
  const shared = (x, y, shift = 0) => Math.min(x.s1 + shift, y.s1) - Math.max(x.s0 + shift, y.s0) > 1e-6;
  let number = 0;
  return records.map((record) => {
    if (isBendOn(record)) return record;
    number += 1;
    const line = { a: record.a.map(n), b: record.b.map(n) };
    const had = lineSegments(before, line),
      now = lineSegments(after, line);
    if (had.some((x) => !now.some((y) => shared(x, y))))
      throw new Error(`This would take bend ${number} off metal it bends today.`);
    const fresh = now.filter((y) => !had.some((x) => shared(x, y)));
    if (!fresh.length) return record;
    const kept = now.filter((y) => !fresh.includes(y));
    const [first, last] = [kept[0], kept.at(-1)];
    if (fresh.some((y) => y.s0 > first.s0 && y.s0 < last.s0))
      throw new Error(`This would put new metal on bend ${number}'s line between the tabs it bends.`);
    if (![...record.a, ...record.b].every((v) => typeof v === 'number'))
      throw new Error(`Bend ${number}'s punch line is driven by parameters: change the parameter instead.`);
    const L = Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]);
    const u = [(line.b[0] - line.a[0]) / L, (line.b[1] - line.a[1]) / L];
    const s0 = first.s0 + Math.min(0.5, (first.s1 - first.s0) / 4),
      s1 = last.s1 - Math.min(0.5, (last.s1 - last.s0) / 4);
    const at = (s) => [0, 1].map((k) => Math.round((line.a[k] + u[k] * s) * 1e6) / 1e6);
    const clipped = { ...record, a: at(s0), b: at(s1) };
    // The clipped line takes exactly the stretches the bend had.
    const check = lineSegments(after, clipped);
    if (check.length !== kept.length || check.some((y, i) => !shared(y, kept[i], s0)))
      throw new Error(`Bend ${number}'s punch line could not be kept on the metal it bends.`);
    return clipped;
  });
}

// The punch and the die keep their length (§4.5, after the first audit): a
// trim is mm off each end of a tooling run (docs/sketch-studio-brake-tool-
// length.md §3.1), so a set that lengthens the run would grow the tool with
// it. For every step (hitSequence) whose tooling is ONE run before and after
// (pressBrake.js strokeTooling's `fitted`, the material the line crosses that
// the step bends) and whose run changed by more than 1e-6, each trim its
// records set (a number, not 0: 0 is fitted to the bend) takes half the
// change, rounded to 1e-6, so run − 2 × trim stays. A bend-on record hits its
// bend's line: the same rule. Several runs, or a trim that is an expression:
// the record as it was. Every other record is the same object.
const TRIMS = ['punchTrim', 'dieTrim'];
function holdToolLengths(records, before, after) {
  const now = new Map(hitSequence(after).map((step) => [step.key, step]));
  const change = new Map();
  for (const step of hitSequence(before)) {
    const later = now.get(step.key);
    if (!later) continue;
    const was = strokeTooling(before, step.bendIds).fitted,
      is = strokeTooling(after, later.bendIds).fitted;
    if (was.length !== 1 || is.length !== 1) continue;
    const delta = is[0][1] - is[0][0] - (was[0][1] - was[0][0]);
    if (Math.abs(delta) > 1e-6) for (const id of step.recordIds) change.set(id, delta);
  }
  return records.map((record) => {
    const delta = change.get(record?.id);
    if (delta == null) return record;
    const set = TRIMS.filter((key) => !(record[key] == null || record[key] === '' || record[key] === 0));
    if (!set.length || set.some((key) => typeof record[key] !== 'number')) return record;
    const out = { ...record };
    for (const key of set) out[key] = Math.round((record[key] + delta / 2) * 1e6) / 1e6;
    return out;
  });
}

/**
 * Set flange gaps (§4.2): the part's outline moved so the rows `keys` (null:
 * the corner rows, "Set all") read `target` mm, each its way (`styles`, see
 * gapMoves; a face row's way and an edge row's chosen flange are fixed from
 * the reading before the set). Fold, read, move, fold again: at most 4
 * passes, done when every asked row is within 0.001; rows are followed by key.
 * Returns { profile, bends (feature.bends, a record clipped only where its
 * line picked up new metal, its trims moved only where its tooling run
 * changed length), passes, moved: [{ segment (as the new outline
 * reads), origin, distance }], rows (after), residual (the furthest an asked
 * row stays from what it asks), newWarnings (fold warnings, by code + bend,
 * that were not there before), fold (after), trace (outlineEditor's), asked
 * (the keys set) }. Throws before anything is changed, in shop words.
 */
export function setGaps({ feature, profile, params = {}, target, keys = null, styles = {} }) {
  if (typeof target !== 'number' || !Number.isFinite(target)) throw new Error('Type the gap in mm.');
  if (target < 0) throw new Error('Flanges cannot overlap: give 0 mm or more.');
  if (target > GAP_REACH) throw new Error(`Gaps are read up to ${GAP_REACH} mm: give ${GAP_REACH} mm or less.`);
  const problem = outlineMoveProblem(profile);
  if (problem) throw new Error(problem);
  const said = (prefix) => (f, p) => {
    try {
      return foldSheet(f, p, params);
    } catch (error) {
      throw new Error(`${prefix}${crossingText(error)}`);
    }
  };
  const fold0 = said('The part does not fold as it stands: ')(feature, profile);
  const read0 = flangeGaps(fold0, profile, params);
  const asked = keys ? [...new Set(keys)] : cornerRows(read0.rows).map((row) => row.key);
  if (!asked.length) throw new Error('This part has no corner gaps to set.');
  const thickness = fold0.thickness;
  // Each row's way, fixed from the reading before the set.
  const ways = new Map();
  for (const key of asked) {
    const row = read0.rows.find((r) => r.key === key);
    if (!row) throw new Error('That gap is no longer on the part: read the gaps again.');
    const style = styles[key] ?? null;
    if (isEdgeRow(row)) {
      if (style != null && !EDGE_WAYS.includes(style)) throw edgeWay(style);
      ways.set(key, { mover: style === 'a' ? pathKey(row.a.path) : style === 'b' ? pathKey(row.b.path) : null });
    } else {
      if (style != null && !FACE_WAYS.includes(style)) throw faceWay(style);
      ways.set(key, { cover: (style || (row.cover ? 'cover' : 'short')) === 'cover' });
    }
  }
  // Both walls of one corner running past each other would stand in the same place.
  for (const key of asked) {
    if (!ways.get(key).cover) continue;
    const partner = partnerOf(
      read0.rows.find((r) => r.key === key),
      read0.rows,
    );
    if (partner && (ways.has(partner.key) ? ways.get(partner.key).cover : partner.cover)) throw new Error(BOTH_COVER);
  }
  const styleOf = (row) => {
    const way = ways.get(row.key);
    if ('cover' in way) return way.cover ? 'cover' : 'short';
    return way.mover == null ? 'both' : pathKey(row.a.path) === way.mover ? 'a' : 'b';
  };
  const off = (row) => offTarget(row, target, styleOf(row) === 'cover', thickness);
  const followed = (read) =>
    asked.map((key) => {
      const row = read.rows.find((r) => r.key === key);
      if (!row) throw new Error('A gap could not be followed through the set: nothing was changed.');
      return row;
    });
  const editor = outlineEditor(profile);
  const blank = profilePolygon(profile, params);
  const records = feature.bends || [];
  const refold = said(asked.length > 1 ? 'These gaps cannot be set: ' : 'This gap cannot be set: ');
  let now = { profile, fold: fold0, read: read0, bends: records };
  let passes = 0;
  for (;;) {
    const rows = followed(now.read);
    if (passes === MAX_PASSES || (passes && rows.every((row) => Math.abs(off(row)) <= SET_DONE))) break;
    const moves = gapMoves(rows, target, {
      styles: Object.fromEntries(rows.map((row) => [row.key, styleOf(row)])),
      thickness,
    });
    if (!moves.length) break;
    // Every edge as this outline reads it, before any of them moves (a jog shifts the indexes behind it).
    const handles = moves.map((move) => ({ move, edge: editor.edge(move.segment) }));
    for (const { move, edge } of handles) editor.move(edge, move.distance, { span: move.span || null });
    editor.check();
    passes += 1;
    const next = editor.profile();
    const bends = keepBendsOnTheirMetal(records, blank, next, params);
    const fold = refold({ ...feature, bends }, next);
    now = { profile: next, fold, read: flangeGaps(fold, next, params), bends };
  }
  const rows = followed(now.read);
  // Metal inside metal that was not there before is refused (two walls covering one corner among it).
  const pairOf = (bends) => bends.map(String).sort().join('|');
  const inside = (read) => [
    ...read.overlaps.map((o) => o.bends),
    ...read.rows.filter((r) => r.overlap).map((r) => [r.a.bend, r.b.bend]),
  ];
  const before = new Set(inside(read0).map(pairOf));
  const fresh = inside(now.read).find((bends) => !before.has(pairOf(bends)));
  if (fresh)
    throw new Error(`${flangeName(fresh[0], true)} would run into ${flangeName(fresh[1])}: nothing was changed.`);
  const had = new Set(fold0.warnings.map((w) => `${w.code}|${w.bendId || ''}`));
  return {
    profile: now.profile,
    bends: passes ? holdToolLengths(now.bends, fold0, now.fold) : now.bends,
    passes,
    moved: editor.moved(),
    rows: now.read.rows,
    residual: rows.reduce((m, row) => Math.max(m, Math.abs(off(row))), 0),
    newWarnings: now.fold.warnings.filter((w) => !had.has(`${w.code}|${w.bendId || ''}`)),
    fold: now.fold,
    trace: editor.trace(),
    asked,
  };
}

/**
 * What a set did, for the status line (§4.3): { text: "Set 12 gaps to 0.20
 * mm: 16 edges moved, the most 1.02 mm. Undo takes it back.", warnings:
 * "Bends 3 and 4: the outline now crosses the bend zone at an angle." or '' }.
 */
export function setGapsText(result, target) {
  const rows = result.asked.map((key) => result.rows.find((r) => r.key === key)).filter(Boolean);
  const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  if (!result.moved.length)
    return {
      text: `${rows.length === 1 ? 'This gap is' : 'These gaps are'} already as asked: nothing moved.`,
      warnings: '',
    };
  const covering = rows.filter((r) => r.cover).length;
  const parts = [
    ...(rows.length - covering ? [`${plural(rows.length - covering, 'gap')} to ${mm(target)}`] : []),
    ...(covering ? [`${plural(covering, 'covering end')} flush`] : []),
  ];
  const most = result.moved.reduce((m, x) => Math.max(m, Math.abs(x.distance)), 0);
  const edges =
    result.moved.length === 1
      ? `1 edge moved ${mm(most)}`
      : `${plural(result.moved.length, 'edge')} moved, the most ${mm(most)}`;
  const near = result.residual > SET_DONE ? ` The nearest it came: ${result.residual.toFixed(3)} mm off.` : '';
  // "Bend 3" / "Bends 3 and 4", by the fold's numbers.
  const names = (list) => {
    const numbers = [...new Set(list.map((w) => (result.fold.bends.find((b) => b.id === w.bendId)?.index ?? -1) + 1))]
      .filter(Boolean)
      .sort((p, q) => p - q);
    return numbers.length === 1
      ? `Bend ${numbers[0]}`
      : `Bends ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`;
  };
  const square = result.newWarnings.filter((w) => w.code === 'outline-not-square' && w.bendId);
  const others = result.newWarnings.filter((w) => !square.includes(w));
  const warnings = [
    ...(square.length ? [`${names(square)}: the outline now crosses the bend zone at an angle.`] : []),
    ...others.map((w) => w.message),
  ].join(' ');
  return { text: `Set ${parts.join(' and ')}: ${edges}. Undo takes it back.${near}`, warnings };
}
