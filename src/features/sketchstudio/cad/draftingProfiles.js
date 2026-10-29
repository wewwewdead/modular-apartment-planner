import { getArcSamplePoints, getQuadraticFlatness, getQuadraticPoint } from '../utils/arcUtils.js';

// Geometric validity checks inside polygon() -- zero-length edge, crossing or
// touching edges, enclosed area -- stay tight at this value.
const EPS = 1e-6;

/**
 * Line/arc endpoints closer than this (mm) are silently treated as one node
 * when loops are assembled, and consecutive polyline points closer than this
 * are collapsed. It only absorbs floating-point noise (a typed 0.1 + 0.2, a
 * rotated copy): 0.01 mm is far below anything a workshop can cut, yet far
 * above double-precision error at drawing scale.
 */
export const LOOP_JOIN_TOLERANCE_MM = 0.01;

/** The import dialog's default for the opt-in "Close small gaps" healing. */
export const DEFAULT_HEAL_GAP_MM = 0.5;

const ANNOTATION_TYPES = new Set(['dimension', 'angle-dimension', 'text']);

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const same = (a, b, tolerance = EPS) => distance(a, b) <= tolerance;
const finitePoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const isIsometric = (entity) => entity?.meta?.projectionMode === 'isometric' || Boolean(entity?.meta?.isometricPlane);

/** 2-decimal mm, never "-0.00". */
export const formatMm = (value) => (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);
const formatPoint = (p) => `(${formatMm(p[0])}, ${formatMm(p[1])})`;

/** Drop consecutive points (including last→first) closer than `tolerance`. */
function collapseNearDuplicatePoints(points, tolerance) {
  const result = [];
  for (const point of points) {
    if (!result.length || !same(result.at(-1), point, tolerance)) result.push(point);
  }
  while (result.length > 1 && same(result[0], result.at(-1), tolerance)) result.pop();
  return result;
}

function polygon(points) {
  if (!points.every(finitePoint)) throw new Error('Profile coordinates must be finite numbers.');
  points = points.map((p) => [...p]);
  if (points.length > 1 && same(points[0], points.at(-1))) points.pop();
  if (points.length < 3) throw new Error('A closed profile needs at least three corners.');
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (a, b, p) =>
    Math.abs(cross(a, b, p)) <= EPS &&
    p.every((v, i) => v >= Math.min(a[i], b[i]) - EPS && v <= Math.max(a[i], b[i]) + EPS);
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (same(a, b)) throw new Error('Remove zero-length profile edges.');
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j],
        d = points[(j + 1) % points.length];
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
        onSegment(a, b, c) ||
        onSegment(a, b, d) ||
        onSegment(c, d, a) ||
        onSegment(c, d, b)
      )
        throw new Error('Profile edges cross or touch. Use a simple closed outline.');
    }
  }
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  if (Math.abs(area) <= EPS) throw new Error('The profile has no enclosed area.');
  return { type: 'polygon', points };
}

const xy = (p) => ({ x: p[0], y: p[1] });
const toPair = (p) => [p.x, p.y];

/**
 * The point at the middle of the circular arc the kernel draws for a drafting
 * arc (a quadratic Bézier start/control/end), so `threePointsArcTo(end, mid)`
 * reproduces it.
 *
 * - Fillet arcs (meta.filletRadius, symmetric control triangle) get the exact
 *   tangent fillet: the circle tangent to both control legs at the endpoints.
 *   Its midpoint is the rational-quadratic point (M + w·C) / (1 + w) with
 *   w = cos(angle between chord and leg), M = chord midpoint. This is the
 *   radius the fillet tool asked for, tangent to both lines. (The parabola the
 *   canvas draws for it bulges ~6% of R further toward the corner at a 90°
 *   fillet; the 3D part follows the requested radius, not the parabola.)
 * - Any other arc uses the Bézier point at t = 0.5, so start, mid and end lie
 *   on the drawn curve and the kernel draws the circle through them. A
 *   quadratic is not a circle, so between those three points the 3D edge can
 *   differ from the drawing (worst for strongly asymmetric control points).
 */
export function draftingArcMidpoint(start, control, end, filletRadius) {
  const legA = distance(start, control),
    legB = distance(end, control),
    chord = distance(start, end);
  if (
    Number.isFinite(filletRadius) &&
    filletRadius > 0 &&
    legA > EPS &&
    chord > EPS &&
    Math.abs(legA - legB) <= Math.max(LOOP_JOIN_TOLERANCE_MM, 1e-6 * legA)
  ) {
    const w =
      ((end[0] - start[0]) * (control[0] - start[0]) + (end[1] - start[1]) * (control[1] - start[1])) / (chord * legA);
    if (w > EPS) {
      return [
        ((start[0] + end[0]) / 2 + w * control[0]) / (1 + w),
        ((start[1] + end[1]) / 2 + w * control[1]) / (1 + w),
      ];
    }
  }
  return toPair(getQuadraticPoint(xy(start), xy(control), xy(end), 0.5));
}

/**
 * A closed loop of line and arc edges, as assembled by collectDraftingProfiles:
 * `{ type: 'loop', edges: [{ type: 'line' | 'arc', start, end, control?, filletRadius? }] }`
 * with [x, y] points, each edge starting where the previous one ended.
 * Becomes a kernel `path` profile; validity is checked on a sampled outline.
 */
function loopProfile(entity) {
  const edges = entity.edges || [];
  if (edges.length < 2) throw new Error('A closed profile needs at least two edges.');
  for (const edge of edges) {
    if (!finitePoint(edge.start) || !finitePoint(edge.end) || (edge.type === 'arc' && !finitePoint(edge.control)))
      throw new Error('Profile coordinates must be finite numbers.');
  }
  edges.forEach((edge, i) => {
    if (!same(edge.end, edges[(i + 1) % edges.length].start, LOOP_JOIN_TOLERANCE_MM))
      throw new Error('Loop edges must connect end to start.');
  });
  // A practically straight "arc" is a line: three collinear points define no circle.
  const isArc = (edge) =>
    edge.type === 'arc' &&
    getQuadraticFlatness(xy(edge.start), xy(edge.control), xy(edge.end)) > LOOP_JOIN_TOLERANCE_MM;
  // Approximate self-intersection / area check on a sampled outline.
  const outline = edges.flatMap((edge) =>
    isArc(edge)
      ? getArcSamplePoints({ start: xy(edge.start), control: xy(edge.control), end: xy(edge.end) })
          .slice(0, -1)
          .map(toPair)
      : [edge.start],
  );
  const checked = polygon(collapseNearDuplicatePoints(outline, LOOP_JOIN_TOLERANCE_MM));
  if (!edges.some(isArc)) return checked;
  const start = [...edges[0].start];
  const segments = edges.map((edge, i) => {
    // A closed loop ends exactly on its start, so the kernel adds no extra edge.
    const end = i === edges.length - 1 ? [...start] : [...edge.end];
    return isArc(edge)
      ? { type: 'arc', end, mid: draftingArcMidpoint(edge.start, edge.control, edge.end, edge.filletRadius) }
      : { type: 'line', end };
  });
  return { type: 'path', start, segments, closed: true };
}

export function draftingProfile(entity) {
  if (isIsometric(entity))
    throw new Error('Isometric drawings do not define a true-size flat profile. Draw a plan or part outline first.');
  if (entity?.type === 'circle') {
    const radius = entity.r ?? entity.radius;
    const center = [entity.cx ?? entity.center?.x ?? 0, entity.cy ?? entity.center?.y ?? 0];
    if (!Number.isFinite(radius) || radius <= 0 || !finitePoint(center))
      throw new Error('Circle dimensions must be valid.');
    return { type: 'circle', radius, center };
  }
  if (entity?.type === 'rect') {
    const { x, y, width, height } = entity;
    const rotation = entity.rotation ?? entity.angle ?? 0;
    if (![x, y, width, height, rotation].every(Number.isFinite) || width <= 0 || height <= 0)
      throw new Error('Rectangle dimensions must be positive and finite.');
    if (!rotation) return { type: 'rectangle', width, height, origin: [x, y] };
    const cx = x + width / 2,
      cy = y + height / 2,
      angle = (rotation * Math.PI) / 180;
    return polygon(
      [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ].map(([px, py]) => [
        cx + (px - cx) * Math.cos(angle) - (py - cy) * Math.sin(angle),
        cy + (px - cx) * Math.sin(angle) + (py - cy) * Math.cos(angle),
      ]),
    );
  }
  if (entity?.type === 'polyline') {
    const raw = (entity.points || []).map((p) => [p?.x, p?.y]);
    if (!raw.every(finitePoint)) throw new Error('Profile coordinates must be finite numbers.');
    if (!entity.closed && !(raw.length > 2 && same(raw[0], raw.at(-1), LOOP_JOIN_TOLERANCE_MM)))
      throw new Error('Close this polyline before importing it.');
    // A double-click on a vertex (or on the closing point) leaves a repeated
    // point; collapse those so polygon() does not see a zero-length edge.
    return polygon(collapseNearDuplicatePoints(raw, LOOP_JOIN_TOLERANCE_MM));
  }
  if (entity?.type === 'loop') return loopProfile(entity);
  throw new Error('Use a rectangle, circle, closed polyline, or connected closed line loop.');
}

/** Hidden entities (own flag or hidden layer) never take part in an import. */
function isHidden(entity, hiddenLayerIds) {
  return entity.visible === false || (entity.layerId != null && hiddenLayerIds.has(entity.layerId));
}

/** Union-find over endpoint indices; the root is always the lowest index. */
function createClusters(count) {
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i, j) => {
    const a = find(i),
      b = find(j);
    if (a === b) return a;
    const [root, child] = a < b ? [a, b] : [b, a];
    parent[child] = root;
    return root;
  };
  return { find, union };
}

/** Candidate endpoint pairs within `tolerance`, nearest first, via a spatial hash. */
function nearPairs(endpoints, indices, tolerance) {
  const cell = Math.max(tolerance, 1e-9);
  const key = (x, y) => `${x},${y}`;
  const grid = new Map();
  for (const i of indices) {
    const [x, y] = endpoints[i].point;
    const k = key(Math.floor(x / cell), Math.floor(y / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const pairs = [];
  for (const i of indices) {
    const [x, y] = endpoints[i].point;
    const cx = Math.floor(x / cell),
      cy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of grid.get(key(cx + dx, cy + dy)) || []) {
          if (j <= i) continue;
          const gap = distance(endpoints[i].point, endpoints[j].point);
          if (gap <= tolerance) pairs.push({ i, j, gap });
        }
  }
  return pairs.sort((p, q) => p.gap - q.gap || p.i - q.i || p.j - q.j);
}

/**
 * Why a connected group of edges is not a closed loop: `{ kind, reason, gapMm? }`.
 * `openEnds` holds every open end in the drawing as `{ node, component }`, so
 * the reported gap can be the one to a neighbouring line group -- that is
 * usually where the user's outline is actually broken.
 */
function describeComponentFailure(component, nodes, openEnds, edgeNoun) {
  const parts = [];
  const branches = nodes.filter((n) => n.edges.length >= 3);
  if (branches.length) {
    const first = branches[0];
    const more = branches.length > 1 ? `; ${branches.length - 1} more branch point(s)` : '';
    parts.push(`branch at ${formatPoint(first.point)}: ${first.edges.length} ${edgeNoun} meet${more}`);
  }
  const own = openEnds.filter((end) => end.component === component);
  let best = null;
  for (const a of own)
    for (const b of openEnds) {
      if (b === a) continue;
      const gap = distance(a.node.point, b.node.point);
      if (!best || gap < best.gap) best = { gap, a: a.node.point, b: b.node.point };
    }
  const between = best && `${formatMm(best.gap)} mm gap between ${formatPoint(best.a)} and ${formatPoint(best.b)}`;
  if (branches.length) {
    if (best) parts.push(`${own.length} open end(s); closest is a ${between}`);
    return { kind: 'branch', reason: parts.join('; ') };
  }
  if (best) {
    return {
      kind: 'open-loop',
      gapMm: best.gap,
      reason:
        own.length > 2 ? `open loop — ${own.length} open ends; closest is a ${between}` : `open loop — ${between}`,
    };
  }
  return { kind: 'degenerate', reason: `${component.length} ${edgeNoun} cannot enclose an area` };
}

/**
 * Collect importable closed profiles from a drawing.
 *
 * Loose lines and arcs are assembled into closed loops (a loop with an arc
 * becomes a `path` profile; see draftingArcMidpoint for the arc geometry). Endpoints within
 * LOOP_JOIN_TOLERANCE_MM are the same node. With `healGapMm` > that, the
 * remaining OPEN ends (nodes touched by one line) are additionally closed,
 * nearest pair first, when they lie within `healGapMm`; each closure is
 * reported in `healed`. A merged node sits at the endpoint of the entity that
 * comes FIRST in drawing order (usually the corner the user snapped onto), so
 * the earlier line stays exactly as drawn and only the later one is nudged.
 * Healing only changes the imported copy -- `entities` is never mutated.
 * Never infers holes, assemblies, or depth from a drawing's appearance.
 *
 * Returns { candidates, rejected, healed, skipped }:
 * - rejected: geometry that could not be imported, `{ id, name, reason }`; a
 *             line group also carries `kind` ('open-loop' | 'branch' |
 *             'degenerate') and, for open loops, the closest `gapMm`.
 * - healed:   `{ ids: [entityA, entityB], gapMm, at: [x, y] }` per closed gap.
 * - skipped:  quietly ignored entities, `{ id, name, kind, reason }`, kind is
 *             'annotation' | 'feature' | 'hidden' | 'duplicate'.
 */
export function collectDraftingProfiles(entities = [], options = {}) {
  const healGapMm = Number(options.healGapMm);
  const healing = Number.isFinite(healGapMm) && healGapMm > LOOP_JOIN_TOLERANCE_MM;
  const hiddenLayerIds = new Set((options.layers || []).filter((l) => l?.visible === false).map((l) => l.id));
  const candidates = [],
    rejected = [],
    healed = [],
    skipped = [],
    isometric = [],
    edges = [];
  const add = (entity, sourceIds) => {
    try {
      const profile = draftingProfile(entity);
      candidates.push({
        id: sourceIds.join('|'),
        sourceIds,
        entity,
        profile,
        name: entity.name || `${entity.type} ${candidates.length + 1}`,
      });
    } catch (error) {
      rejected.push({ id: entity.id, name: entity.name || entity.type, reason: error.message });
    }
  };

  for (const entity of entities) {
    if (!entity) continue;
    if (isHidden(entity, hiddenLayerIds)) {
      skipped.push({
        id: entity.id,
        type: entity.type,
        name: entity.name || entity.type,
        kind: 'hidden',
        reason: 'Hidden; ignored.',
      });
    } else if (ANNOTATION_TYPES.has(entity.type)) {
      skipped.push({
        id: entity.id,
        type: entity.type,
        name: entity.name || entity.type,
        kind: 'annotation',
        reason: 'Annotations are not geometry.',
      });
    } else if (entity.type === 'feature') {
      skipped.push({
        id: entity.id,
        type: entity.type,
        name: entity.name || entity.featureType || 'feature',
        kind: 'feature',
        reason: 'Hole and cutout features are not imported as parts.',
      });
    } else if (isIsometric(entity)) {
      isometric.push(entity);
    } else if (entity.type === 'line') {
      const a = [entity.x1, entity.y1],
        b = [entity.x2, entity.y2];
      if (!finitePoint(a) || !finitePoint(b) || same(a, b, LOOP_JOIN_TOLERANCE_MM)) {
        rejected.push({
          id: entity.id,
          name: entity.name || 'Line',
          reason: 'Line endpoints must be distinct and finite.',
        });
        continue;
      }
      edges.push({ entity, kind: 'line', points: [a, b] });
    } else if (entity.type === 'arc') {
      const a = [entity.start?.x, entity.start?.y],
        b = [entity.end?.x, entity.end?.y],
        control = [entity.control?.x, entity.control?.y];
      if (!finitePoint(a) || !finitePoint(b) || !finitePoint(control) || same(a, b, LOOP_JOIN_TOLERANCE_MM)) {
        rejected.push({
          id: entity.id,
          name: entity.name || 'Arc',
          reason: 'Arc endpoints must be distinct and finite; a closed arc cannot be imported.',
        });
        continue;
      }
      edges.push({ entity, kind: 'arc', points: [a, b], control });
    } else add(entity, [entity.id]);
  }
  if (isometric.length) {
    rejected.push({
      id: isometric[0].id,
      name: isometric.length === 1 ? isometric[0].name || isometric[0].type : `${isometric.length} isometric entities`,
      reason: 'Isometric drawings do not define a true-size flat profile. Draw a plan or part outline first.',
    });
  }

  // Endpoint 2k is edge k's start, 2k+1 its end, so "lowest index" == drawing order.
  const endpoints = edges.flatMap((edge, k) => [
    { edge: k, point: edge.points[0] },
    { edge: k, point: edge.points[1] },
  ]);
  const clusters = createClusters(endpoints.length);
  const members = new Map(endpoints.map((_, i) => [i, new Set([endpoints[i].edge])]));
  // Never merge both ends of one edge into a node (that would erase the edge).
  const tryUnion = (i, j) => {
    const a = clusters.find(i),
      b = clusters.find(j);
    if (a === b) return null;
    const edgesA = members.get(a),
      edgesB = members.get(b);
    for (const e of edgesB) if (edgesA.has(e)) return null;
    const root = clusters.union(a, b);
    const merged = new Set([...edgesA, ...edgesB]);
    members.set(root, merged);
    return root;
  };
  const allIndices = endpoints.map((_, i) => i);
  for (const { i, j } of nearPairs(endpoints, allIndices, LOOP_JOIN_TOLERANCE_MM)) tryUnion(i, j);

  // Exact duplicates (same two nodes, either orientation; arcs also the same
  // control point) would read as branches. A line and an arc, or two
  // different arcs, between the same nodes are a legitimate 2-edge loop.
  const kept = [],
    seen = new Map();
  edges.forEach((edge, k) => {
    const [ra, rb] = [clusters.find(2 * k), clusters.find(2 * k + 1)].sort((x, y) => x - y);
    const key = `${edge.kind}:${ra}:${rb}`;
    const original = (seen.get(key) || []).find(
      (other) => edge.kind === 'line' || same(other.control, edge.control, LOOP_JOIN_TOLERANCE_MM),
    );
    if (original) {
      skipped.push({
        id: edge.entity.id,
        type: edge.entity.type,
        duplicateOf: original.entity.id,
        name: edge.entity.name || edge.kind,
        kind: 'duplicate',
        reason: `Duplicate of ${original.entity.id}; ignored.`,
      });
      return;
    }
    seen.set(key, [...(seen.get(key) || []), edge]);
    kept.push(k);
  });

  const degree = new Map();
  for (const k of kept)
    for (const i of [2 * k, 2 * k + 1]) degree.set(clusters.find(i), (degree.get(clusters.find(i)) || 0) + 1);

  if (healing) {
    const openRoots = [...degree].filter(([, d]) => d === 1).map(([root]) => root);
    for (const { i, j, gap } of nearPairs(endpoints, openRoots, healGapMm)) {
      if (degree.get(i) !== 1 || degree.get(j) !== 1) continue;
      const root = tryUnion(i, j);
      if (root === null) continue;
      degree.set(i, 0);
      degree.set(j, 0);
      degree.set(root, 2);
      const [first, second] = i < j ? [i, j] : [j, i];
      healed.push({
        ids: [edges[endpoints[first].edge].entity.id, edges[endpoints[second].edge].entity.id],
        gapMm: gap,
        at: [...endpoints[first].point],
      });
    }
  }

  const nodes = new Map();
  const nodeFor = (i) => {
    const root = clusters.find(i);
    if (!nodes.has(root)) nodes.set(root, { point: endpoints[root].point, edges: [] });
    return nodes.get(root);
  };
  const graphEdges = kept.map((k) => {
    const graphEdge = { ...edges[k], a: nodeFor(2 * k), b: nodeFor(2 * k + 1) };
    graphEdge.a.edges.push(graphEdge);
    graphEdge.b.edges.push(graphEdge);
    return graphEdge;
  });

  const visited = new Set(),
    components = [];
  for (const first of graphEdges) {
    if (visited.has(first)) continue;
    const component = [],
      pending = [first],
      componentNodes = new Set();
    while (pending.length) {
      const edge = pending.pop();
      if (visited.has(edge)) continue;
      visited.add(edge);
      component.push(edge);
      for (const node of [edge.a, edge.b]) {
        componentNodes.add(node);
        pending.push(...node.edges.filter((e) => !visited.has(e)));
      }
    }
    components.push({ first, component, nodes: [...componentNodes] });
  }
  const openEnds = components.flatMap(({ component, nodes: list }) =>
    list.filter((node) => node.edges.length === 1).map((node) => ({ node, component })),
  );
  for (const { first, component, nodes: componentNodeList } of components) {
    const hasArc = component.some((e) => e.kind === 'arc');
    const noun = hasArc ? 'lines/arcs' : 'lines';
    const name = `${component.length} connected ${component.length === 1 ? noun.replace(/s(?=\/|$)/g, '') : noun}`;
    // Straight lines need three edges to enclose area; with an arc two will do.
    if (component.length < (hasArc ? 2 : 3) || componentNodeList.some((n) => n.edges.length !== 2)) {
      rejected.push({
        id: first.entity.id,
        name,
        ...describeComponentFailure(component, componentNodeList, openEnds, hasArc ? 'edges' : 'lines'),
      });
      continue;
    }
    const ordered = [],
      start = first.a;
    let node = start,
      previous = null;
    do {
      const next = node.edges.find((edge) => edge !== previous);
      ordered.push({ edge: next, from: node, to: next.a === node ? next.b : next.a });
      node = ordered.at(-1).to;
      previous = next;
    } while (node !== start && ordered.length <= component.length);
    const sameMaterial = component.every((e) => e.entity.materialId === first.entity.materialId);
    // Keep the first entity's identity/material/thickness, not its own geometry.
    const { x1: _x1, y1: _y1, x2: _x2, y2: _y2, start: _start, end: _end, control: _control, ...base } = first.entity;
    const shared = {
      ...base,
      closed: true,
      name: first.entity.name || `${hasArc ? 'Outline' : 'Line loop'} ${candidates.length + 1}`,
      materialId: sameMaterial ? first.entity.materialId : undefined,
    };
    add(
      hasArc
        ? {
            ...shared,
            type: 'loop',
            // Node positions (not raw endpoints) so joins and healed gaps close exactly.
            edges: ordered.map(({ edge, from, to }) =>
              edge.kind === 'arc'
                ? {
                    type: 'arc',
                    start: [...from.point],
                    end: [...to.point],
                    control: [...edge.control],
                    filletRadius: edge.entity.meta?.filletRadius,
                  }
                : { type: 'line', start: [...from.point], end: [...to.point] },
            ),
          }
        : { ...shared, type: 'polyline', points: ordered.map(({ from }) => ({ x: from.point[0], y: from.point[1] })) },
      component.map((e) => e.entity.id),
    );
  }
  return { candidates, rejected, healed, skipped };
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const ANNOTATION_NOUNS = {
  dimension: ['dimension', 'dimensions'],
  'angle-dimension': ['angle dimension', 'angle dimensions'],
  text: ['text', 'texts'],
};
const joinWords = (words) =>
  words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/** One quiet sentence per kind of skipped entity, for the import dialog. */
export function summarizeSkipped(skipped = []) {
  const byKind = (kind) => skipped.filter((item) => item.kind === kind);
  const lines = [];
  const annotations = byKind('annotation');
  if (annotations.length) {
    const counts = new Map();
    for (const item of annotations) counts.set(item.type, (counts.get(item.type) || 0) + 1);
    const words = [...counts].map(([type, count]) => plural(count, ...(ANNOTATION_NOUNS[type] || [type, `${type}s`])));
    lines.push(`${joinWords(words)} skipped (annotations are not geometry)`);
  }
  const duplicates = byKind('duplicate');
  if (duplicates.length) {
    const named = duplicates
      .slice(0, 3)
      .map((item) => `${item.id} duplicates ${item.duplicateOf}`)
      .join(', ');
    const more = duplicates.length > 3 ? `, ${duplicates.length - 3} more` : '';
    const noun = duplicates.every((item) => item.type === 'arc')
      ? ['duplicate arc', 'duplicate arcs']
      : duplicates.some((item) => item.type === 'arc')
        ? ['duplicate line/arc', 'duplicate lines/arcs']
        : ['duplicate line', 'duplicate lines'];
    lines.push(`${plural(duplicates.length, ...noun)} ignored (${named}${more})`);
  }
  const features = byKind('feature');
  if (features.length)
    lines.push(
      `${plural(features.length, 'hole/cutout feature', 'hole/cutout features')} skipped (features are not imported as parts)`,
    );
  const hidden = byKind('hidden');
  if (hidden.length) lines.push(`${plural(hidden.length, 'hidden entity', 'hidden entities')} ignored`);
  return lines;
}

/** "Closed a 0.62 mm gap at (100.00, 100.00) between line_1 and line_4" */
export function describeHealedGap(item) {
  return `Closed a ${formatMm(item.gapMm)} mm gap at ${formatPoint(item.at)} between ${item.ids[0]} and ${item.ids[1]}`;
}
