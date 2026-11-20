// Bend reliefs cut into a blank outline in one click (docs/sketch-studio-bend-relief.md
// §3.1): the outline's inside corners, the automatic sizes for the sheet, what
// a click would take, and the cut itself, spliced into the outline's own lines
// and arcs. Afterwards a relief is ordinary lines and arcs: no relief record.
// Pure: no three, no DOM; plain numbers, refused in shop words.
import { bendNumbers } from './sheetMetal.js';
import { DEFAULT_STOCK } from './shopCatalog.js';
import { outlineEditor } from './outlineMove.js';
import {
  distanceToSegment,
  entitiesToProfile,
  explode,
  profileLoops,
  roundPoint,
  samePoint,
  splitOutlines,
} from './sketchProfile.js';

// The options row's shapes, first the default (§7: it is what the user draws).
export const RELIEF_SHAPES = [
  ['square', 'Square'],
  ['round', 'Round'],
  ['obround', 'Obround'],
  ['rect', 'Rectangular'],
];
// The fields each shape is cut from (typed in the options row, null = automatic).
export const RELIEF_FIELDS = {
  square: ['size'],
  round: ['diameter'],
  obround: ['width', 'depth'],
  rect: ['width', 'depth'],
};

// SendCutSend's clearance past the bend zone (§2.1); also how far a bend line may sit off the corner.
const CLEARANCE = 0.5;
// Never under half the thickness, and the laser's own minimum is about 0.4 mm (§2.1).
const MIN_WIDTH = 0.5;
// What must stay of every trimmed edge (outlineMove.js: shorter is too short to cut).
const SLIVER = 0.01;
// Two edges are square when the cosine between them is under this.
const SQUARE = 1e-6;

const NO_CORNER = 'No inside corner here: move to the corner that needs the relief.';
const NO_CORNER_OR_EDGE = 'No inside corner or straight edge here: move to one.';
const OUTSIDE = 'An outside corner needs no relief: move to an inside corner.';
const ON_EDGE = 'Round and Square go on an inside corner: move to one, or use Obround or Rectangular on an edge.';
const NOT_SQUARE = 'Square needs a square corner: use Round here.';
const OPEN = 'Close the outline first: a relief is cut into a closed outline.';
const BRANCHING = 'Three or more lines meet at one point: fix the outline first.';
const CUT_THROUGH = 'This relief would cut through another edge: make it smaller.';
const TOO_OPEN = 'This corner is too open for a slot this shallow: make the relief deeper.';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// A unit direction (never -0, so directions compare plainly).
const unit = (a) => scale(a, 1 / Math.hypot(a[0], a[1])).map((x) => x + 0);
const fmt = (value) => Number(value.toFixed(2)).toString();
const tidy = (value) => Number(value.toFixed(6));
// Up to the next 0.1 mm (a hair under a step stays on it: 2.0000000001 is 2).
const upTo01 = (value) => tidy(Math.ceil(value * 10 - 1e-6) / 10);

/**
 * The automatic sizes for a sheet (§3.1): h = half the bend allowance of a
 * 90° bend in that sheet with its default tooling, the reach e = h + 0.5
 * rounded up to 0.1 mm. 1.2 mm SPCC: Ø4, 4 × 4, 1.2 × 2, 1.2 × 2.6.
 */
export function reliefSizes({ thickness, stock = DEFAULT_STOCK }) {
  if (!(Number.isFinite(thickness) && thickness > 0))
    throw new Error('Type the sheet thickness: the automatic sizes come from it.');
  const { allowance } = bendNumbers({ thickness, stock: stock || DEFAULT_STOCK, angle: 90 });
  const reach = upTo01(allowance / 2 + CLEARANCE);
  const width = upTo01(Math.max(thickness, MIN_WIDTH));
  return {
    reach,
    round: tidy(2 * reach),
    square: tidy(2 * reach),
    width,
    rectDepth: reach,
    obroundDepth: tidy(reach + width / 2),
  };
}

/**
 * The sizes a cut takes ({ diameter, size, width, depth }): a typed one (a
 * number) wins, null is automatic. An obround's automatic depth is the reach
 * plus half the width it is cut with, so its straight sides still reach.
 */
export function chosenSizes(shape, typed = {}, auto) {
  const pick = (key, fallback) => (typed[key] != null ? typed[key] : fallback);
  const width = pick('width', auto.width);
  return {
    diameter: pick('diameter', auto.round),
    size: pick('size', auto.square),
    width,
    depth: pick('depth', shape === 'obround' ? tidy(auto.reach + width / 2) : auto.rectDepth),
  };
}

/** "Round Ø4", "Square 4 × 4", "Rectangular 1.2 × 2", "Obround 1.2 × 2.6". */
export function describeRelief(shape, sizes) {
  if (shape === 'round') return `Round Ø${fmt(sizes.diameter)}`;
  if (shape === 'square') return `Square ${fmt(sizes.size)} × ${fmt(sizes.size)}`;
  return `${shape === 'rect' ? 'Rectangular' : 'Obround'} ${fmt(sizes.width)} × ${fmt(sizes.depth)}`;
}

// ---------------------------------------------------------------- reading the outline
const signedArea = (ring) =>
  ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;

// One closed loop as pieces in its walking order: { entity, side (the index of
// the piece in sketchProfile.js explode for a rectangle, a slot, a polygon or a
// rounded rectangle, else null), from, to, straight }.
function walkOf(loop) {
  if (loop.kind === 'rect' || loop.kind === 'shape')
    return explode(loop.entity).map((piece, side) => ({
      entity: loop.entity,
      side,
      from: piece.a,
      to: piece.b,
      straight: piece.type === 'line',
    }));
  return loop.chain.segments.map(({ entity, forward }) => ({
    entity,
    side: null,
    from: forward ? entity.a : entity.b,
    to: forward ? entity.b : entity.a,
    straight: entity.type === 'line',
  }));
}

// What the outline offers a relief: every vertex of its loops (`kind`
// 'inside' | 'outside' | 'arc', or 'open' on an open chain), its straight
// edges with the normal into the metal, and the open chains' straight pieces.
// Metal is inside an outer loop and outside a loop directly inside it (a
// cut-out); construction entities and loops nested deeper take no part.
const outlines = new WeakMap();
function readOutline(entities) {
  const known = outlines.get(entities);
  if (known) return known;
  const { loops, open, branching } = profileLoops(entities);
  const vertices = [],
    edges = [],
    openEdges = [];
  for (const loop of loops) {
    if (loop.kind === 'circle' || loop.parents.length > 1) continue;
    const walk = walkOf(loop);
    // +1: the metal lies left of the walk (a counter-clockwise outline, a clockwise cut-out).
    const sense = (signedArea(loop.polygon.slice(0, -1)) > 0 ? 1 : -1) * (loop.parents.length ? -1 : 1);
    walk.forEach((piece, k) => {
      const before = walk[(k - 1 + walk.length) % walk.length];
      if (piece.straight) {
        const d = unit(sub(piece.to, piece.from));
        edges.push({
          id: piece.entity.id,
          side: piece.side,
          a: piece.from,
          b: piece.to,
          into: scale([-d[1], d[0]], sense),
        });
      }
      if (!piece.straight || !before.straight) {
        vertices.push({ point: piece.from, kind: 'arc' });
        return;
      }
      const din = unit(sub(before.to, before.from)),
        dout = unit(sub(piece.to, piece.from));
      const turn = cross(din, dout);
      // Straight on through: no corner.
      if (Math.abs(turn) < 1e-9 && dot(din, dout) > 0) return;
      vertices.push({
        point: piece.from,
        // A turn against the metal side: the metal takes more than 180° there.
        kind: turn * sense < 0 ? 'inside' : 'outside',
        // The edge walked in on, then the one walked out on.
        edges: [
          {
            id: before.entity.id,
            side: before.side,
            away: scale(din, -1).map((x) => x + 0),
            length: distance(before.from, before.to),
          },
          { id: piece.entity.id, side: piece.side, away: dout, length: distance(piece.from, piece.to) },
        ],
        square: Math.abs(dot(din, dout)) <= SQUARE,
      });
    });
  }
  for (const chain of open)
    for (const { entity } of chain.segments) {
      vertices.push({ point: entity.a, kind: 'open' }, { point: entity.b, kind: 'open' });
      if (entity.type === 'line') openEdges.push({ a: entity.a, b: entity.b });
    }
  const read = { vertices, edges, openEdges, branching };
  outlines.set(entities, read);
  return read;
}

const publicCorner = ({ point, edges, square }) => ({
  point,
  edges: edges.map(({ id, side, away }) => (side == null ? { id, away } : { id, side, away })),
  square,
});

/**
 * The outline's inside corners (§3.1): `[{ point, edges: [{ id, away }, { id,
 * away }], square }]`, where exactly two straight edges of one closed loop
 * meet and the metal takes more than 180°. `away`: the unit direction along
 * the edge away from the corner; the edges come in the loop's walking order
 * (the one walked in on first). A rectangle's side also carries `side` (0–3,
 * from its lowest corner round). No corner beside an arc.
 */
export function reliefCorners(entities = []) {
  return readOutline(entities)
    .vertices.filter((v) => v.kind === 'inside')
    .map(publicCorner);
}

// The nearest of `items` within `tolerance` by `measure`, or null.
function nearest(items, measure, tolerance) {
  let best = null,
    bestDistance = Infinity;
  for (const item of items) {
    const d = measure(item);
    if (d <= tolerance && d < bestDistance) [best, bestDistance] = [item, d];
  }
  return best;
}
const none = (message) => ({ type: 'none', message });

/**
 * What a Relief click would take (§3.1): `{ type: 'corner', corner, pointed }`
 * (`pointed`: the index in `corner.edges` of the edge nearer the raw cursor,
 * the one a slot continues), `{ type: 'edge', id, at }` (a straight edge at
 * the snapped point; a rectangle's side carries `side`) or `{ type: 'none',
 * message }`. Corners within `tolerance` of the raw cursor come first.
 */
export function reliefPick({ entities = [], raw, point = raw, tolerance = 0, shape = 'square' }) {
  const outline = readOutline(entities);
  if (outline.branching) return none(BRANCHING);
  const corner = nearest(
    outline.vertices.filter((v) => v.kind !== 'arc'),
    (v) => distance(v.point, raw),
    tolerance,
  );
  if (corner) {
    if (corner.kind === 'open') return none(OPEN);
    if (corner.kind === 'outside') return none(OUTSIDE);
    if (shape === 'square' && !corner.square) return none(NOT_SQUARE);
    const [d0, d1] = corner.edges.map((e) =>
      distanceToSegment(raw, [corner.point, add(corner.point, scale(e.away, e.length))]),
    );
    return { type: 'corner', corner: publicCorner(corner), pointed: d1 < d0 ? 1 : 0 };
  }
  const edge = nearest(outline.edges, (e) => distanceToSegment(raw, [e.a, e.b]), tolerance);
  if (!edge && nearest(outline.openEdges, (e) => distanceToSegment(raw, [e.a, e.b]), tolerance)) return none(OPEN);
  if (shape === 'round' || shape === 'square') return none(edge ? ON_EDGE : NO_CORNER);
  if (!edge) return none(NO_CORNER_OR_EDGE);
  const u = unit(sub(edge.b, edge.a));
  const t = Math.max(0, Math.min(distance(edge.a, edge.b), dot(sub(point, edge.a), u)));
  return {
    type: 'edge',
    id: edge.id,
    ...(edge.side != null ? { side: edge.side } : {}),
    at: roundPoint(add(edge.a, scale(u, t))),
  };
}

// ---------------------------------------------------------------- the cut
const line = (a, b) => ({ type: 'line', a, b });
const arc = (a, b, m) => ({ type: 'arc', a, b, m });
const reversed = (pieces) =>
  pieces
    .slice()
    .reverse()
    .map((p) => ({ ...p, a: p.b, b: p.a }));
const rounded = (piece) => ({
  ...piece,
  a: roundPoint(piece.a),
  b: roundPoint(piece.b),
  ...(piece.m ? { m: roundPoint(piece.m) } : {}),
});

// The sizes a shape is cut from, each a positive number (an obround at least half its width deep).
function checkSizes(shape, sizes) {
  const fields = RELIEF_FIELDS[shape];
  if (!fields) throw new Error(`Unknown relief shape: ${shape}`);
  for (const key of fields)
    if (!(Number.isFinite(sizes?.[key]) && sizes[key] > 0))
      throw new Error(`The relief ${key} must be a positive number.`);
  if (shape === 'obround' && sizes.depth < sizes.width / 2 - 1e-9)
    throw new Error(`An obround relief is at least half its width deep: ${fmt(sizes.width / 2)} mm here.`);
}

/**
 * Cuts the relief a pick names (§3.1) → `{ entities, added: [ids], replaced:
 * [the entities as they were], nextId, text, pieces }`, or throws in shop
 * words with nothing changed. An edge only trimmed or extended keeps its id;
 * new pieces take the next free `e` ids and go in the list right after the
 * edge they follow; a `rect` (or a slot, a polygon, a rounded rectangle:
 * HD-3, §7.1) taking part becomes its lines and arcs (new ids) first.
 * `pieces`: the relief's own outline as drawn (what the hover previews),
 * the run a slot adds to the edge it continues included.
 */
export function cutRelief({ entities = [], pick, shape, sizes, nextId }) {
  checkSizes(shape, sizes);
  if (!pick || pick.type === 'none') throw new Error(pick?.message || NO_CORNER);
  if (pick.type === 'edge' && (shape === 'round' || shape === 'square')) throw new Error(ON_EDGE);
  if (pick.type === 'corner' && shape === 'square' && !pick.corner.square) throw new Error(NOT_SQUARE);
  let next = nextId;
  const newId = () => `e${next++}`;
  const added = [],
    replaced = [];

  // A rectangle (a slot, a polygon, a rounded rectangle) taking part: its
  // lines and arcs first, side k its piece k (sketchProfile.js explode).
  const refs = pick.type === 'corner' ? pick.corner.edges : [pick];
  const rectIds = new Set(refs.filter((r) => r.side != null).map((r) => r.id));
  const sides = new Map();
  let list = entities.flatMap((entity) => {
    if (!rectIds.has(entity.id) || entity.type === 'line' || entity.type === 'arc') return [entity];
    replaced.push(entity);
    return explode(entity).map((piece, k) => {
      const id = newId();
      added.push(id);
      sides.set(`${entity.id}:${k}`, id);
      return { id, ...piece };
    });
  });
  const idOf = (ref) => (ref.side != null ? sides.get(`${ref.id}:${ref.side}`) : ref.id);
  const find = (ref) => {
    const entity = list.find((e) => e.id === idOf(ref));
    if (!entity || entity.type !== 'line') throw new Error(NO_CORNER);
    return entity;
  };
  // Changed entities by id, and the pieces to put right after an entity.
  const changed = new Map(),
    after = new Map();
  let pieces;

  if (pick.type === 'corner') {
    const V = pick.corner.point;
    const [inRef, outRef] = pick.corner.edges;
    const edgeIn = find(inRef),
      edgeOut = find(outRef);
    const [aIn, aOut] = [inRef.away, outRef.away];
    // An edge's end at the corner moved to p (the other end stays).
    const moveEnd = (entity, p) =>
      changed.set(entity.id, samePoint(entity.a, V) ? { ...entity, a: p } : { ...entity, b: p });
    // At least SLIVER of the edge must stay: an edge as long as the trim reads "needs more than".
    const needs = (entity, trim) => {
      const length = distance(entity.a, entity.b);
      if (length < trim + SLIVER) {
        const more = fmt(length) === fmt(trim) ? 'more than ' : '';
        throw new Error(
          `The edge beside this corner is ${fmt(length)} mm long: the relief needs ${more}${fmt(trim)} mm of it.`,
        );
      }
    };
    let walked;
    if (shape === 'round') {
      // A circle centred on the corner: both edges trimmed to it, one arc through the metal.
      const r = sizes.diameter / 2;
      needs(edgeIn, r);
      needs(edgeOut, r);
      const [pin, pout] = [add(V, scale(aIn, r)), add(V, scale(aOut, r))];
      moveEnd(edgeIn, pin);
      moveEnd(edgeOut, pout);
      walked = [arc(pin, pout, sub(V, scale(unit(add(aIn, aOut)), r)))];
      pieces = walked;
    } else if (shape === 'square') {
      // A square centred on the corner, sides along the edges: S/2, S, S, S/2.
      const h = sizes.size / 2;
      needs(edgeIn, h);
      needs(edgeOut, h);
      const [pin, pout] = [add(V, scale(aIn, h)), add(V, scale(aOut, h))];
      moveEnd(edgeIn, pin);
      moveEnd(edgeOut, pout);
      const q1 = sub(pin, scale(aOut, h)),
        q2 = sub(q1, scale(aIn, 2 * h)),
        q3 = add(q2, scale(aOut, 2 * h));
      walked = [line(pin, q1), line(q1, q2), line(q2, q3), line(q3, pout)];
      pieces = walked;
    } else {
      // A slot continuing the pointed edge P past the corner, w wide on the
      // other edge's side: O is trimmed by w / sin θ, its side runs down to the
      // bottom (d + w·cot θ long; d on a square corner), the bottom is w across
      // (a half round for an obround) and P runs on to it.
      const { width: w, depth: d } = sizes;
      const p = pick.pointed ? 1 : 0;
      const [P, O] = p ? [edgeOut, edgeIn] : [edgeIn, edgeOut];
      const [pDir, oDir] = p ? [aOut, aIn] : [aIn, aOut];
      const sin = Math.abs(cross(pDir, oDir)),
        cos = dot(pDir, oDir);
      const n = unit(sub(oDir, scale(pDir, cos)));
      const trim = w / sin;
      needs(O, trim);
      const straight = shape === 'obround' ? d - w / 2 : d;
      const side = straight + (w * cos) / sin;
      if (side < -1e-6) throw new Error(TOO_OPEN);
      const po = add(V, scale(oDir, trim));
      const bottom = sub(V, scale(pDir, straight));
      const q1 = add(bottom, scale(n, w));
      // From O to P: down the far side, then across the bottom.
      const fromO = [
        ...(side > 1e-6 ? [line(po, q1)] : []),
        shape === 'obround' ? arc(q1, bottom, add(sub(V, scale(pDir, d)), scale(n, w / 2))) : line(q1, bottom),
      ];
      moveEnd(O, po);
      if (straight > 1e-9) moveEnd(P, bottom);
      walked = p ? fromO : reversed(fromO);
      pieces = [...fromO, ...(straight > 1e-9 ? [line(bottom, V)] : [])];
    }
    // Right after the edge walked in on, in the walking order.
    after.set(edgeIn.id, walked);
  } else {
    // A slot w wide centred on the point, d into the metal: the edge split in two, three lines join them.
    const edge = find(pick);
    const { width: w, depth: d } = sizes;
    const read = readOutline(entities).edges.find(
      (e) => e.id === pick.id && (pick.side == null ? e.side == null : e.side === pick.side),
    );
    if (!read) throw new Error(NO_CORNER_OR_EDGE);
    const into = read.into;
    const length = distance(edge.a, edge.b);
    const u = unit(sub(edge.b, edge.a));
    const t = dot(sub(pick.at, edge.a), u);
    if (t < w / 2 + SLIVER || length - t < w / 2 + SLIVER)
      throw new Error(
        `The slot needs ${fmt(w / 2)} mm of the edge each side of its centre: move it away from the corner.`,
      );
    const x1 = add(edge.a, scale(u, t - w / 2)),
      x2 = add(edge.a, scale(u, t + w / 2));
    const straight = shape === 'obround' ? d - w / 2 : d;
    const [s1, s2] = [add(x1, scale(into, straight)), add(x2, scale(into, straight))];
    pieces =
      shape === 'obround'
        ? [
            ...(straight > 1e-9 ? [line(x1, s1)] : []),
            arc(s1, s2, add(add(edge.a, scale(u, t)), scale(into, d))),
            ...(straight > 1e-9 ? [line(s2, x2)] : []),
          ]
        : [line(x1, s1), line(s1, s2), line(s2, x2)];
    changed.set(edge.id, { ...edge, b: x1 });
    const { id: _id, a: _a, b: _b, ...rest } = edge;
    after.set(edge.id, [...pieces, { ...rest, a: x2, b: edge.b }]);
  }

  // The list: changed entities in place (rounded), the new pieces after theirs with the next ids.
  list = list.flatMap((entity) => {
    const own = changed.get(entity.id);
    if (own && !added.includes(entity.id)) replaced.push(entity);
    const kept = own ? rounded(own) : entity;
    const following = (after.get(entity.id) || []).map((piece) => {
      const id = newId();
      added.push(id);
      return { id, ...rounded(piece) };
    });
    return [kept, ...following];
  });

  // Still one closed outline per loop, and nothing crosses (outlineMove.js check).
  const before = profileLoops(entities),
    now = profileLoops(list);
  // A cut-out the relief runs into (or swallows) is no longer inside its outline: one outline more.
  if (
    now.branching ||
    now.loops.length !== before.loops.length ||
    now.open.length !== before.open.length ||
    now.outers.length !== before.outers.length
  )
    throw new Error(CUT_THROUGH);
  const touched = new Set([...added, ...changed.keys()]);
  const group = splitOutlines(list).find((g) => g.some((e) => touched.has(e.id)));
  const { profile } = entitiesToProfile(group);
  try {
    outlineEditor(profile).check();
  } catch {
    throw new Error(CUT_THROUGH);
  }
  return {
    entities: list,
    added,
    replaced,
    nextId: next,
    text: describeRelief(shape, sizes),
    pieces: pieces.map(rounded),
  };
}
