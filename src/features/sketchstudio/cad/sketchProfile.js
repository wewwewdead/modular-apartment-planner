// In-viewport sketch entities (2D, sketch-plane millimetres) and their
// conversion to the kernel profile format of kernel.js `drawing()`:
//   line   { id, type: 'line', a, b }
//   rect   { id, type: 'rect', a, b }          opposite corners, axis aligned
//   circle { id, type: 'circle', c, r }
//   arc    { id, type: 'arc', a, b, m }        start, end, a point on the arc

const EPS = 1e-6;
export const samePoint = (p, q, tolerance = EPS) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tolerance;
const round = (value) => {
  const result = Math.round(value * 1e6) / 1e6;
  return Object.is(result, -0) ? 0 : result;
};
export const roundPoint = (p) => [round(p[0]), round(p[1])];
const distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// Circle through three points; null when they are (nearly) collinear.
export function arcGeometry(a, m, b) {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  const scale = Math.max(distance(a, m), distance(m, b), distance(a, b), 1e-9);
  if (Math.abs(d) < 1e-9 * scale * scale) return null;
  const sq = (p) => p[0] * p[0] + p[1] * p[1];
  const center = [
    (sq(a) * (m[1] - b[1]) + sq(m) * (b[1] - a[1]) + sq(b) * (a[1] - m[1])) / d,
    (sq(a) * (b[0] - m[0]) + sq(m) * (a[0] - b[0]) + sq(b) * (m[0] - a[0])) / d,
  ];
  const radius = distance(center, a);
  const angle = (p) => Math.atan2(p[1] - center[1], p[0] - center[0]);
  const start = angle(a);
  const turn = (to) => {
    let value = to - start;
    while (value <= 0) value += Math.PI * 2;
    return value;
  };
  // Counter-clockwise sweep reaches m before b, otherwise the arc runs clockwise.
  const ccw = turn(angle(m)) < turn(angle(b));
  const sweep = ccw ? turn(angle(b)) : turn(angle(b)) - Math.PI * 2;
  return { center, radius, start, sweep };
}

export function sampleArc(a, m, b, steps = 32) {
  const geometry = arcGeometry(a, m, b);
  if (!geometry) return [a, b];
  const { center, radius, start, sweep } = geometry;
  const count = Math.max(4, Math.ceil((steps * Math.abs(sweep)) / (Math.PI * 2)));
  return Array.from({ length: count + 1 }, (_, i) => {
    if (i === 0) return a;
    if (i === count) return b;
    const t = start + (sweep * i) / count;
    return [center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)];
  });
}

const rectCorners = ({ a, b }) => {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
};

// Polyline used for drawing an entity in the viewport and for containment tests.
export function entityPolyline(entity, steps = 64) {
  if (entity.type === 'line') return [entity.a, entity.b];
  if (entity.type === 'rect') {
    const corners = rectCorners(entity);
    return [...corners, corners[0]];
  }
  if (entity.type === 'circle')
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = (i / steps) * Math.PI * 2;
      return [entity.c[0] + entity.r * Math.cos(t), entity.c[1] + entity.r * Math.sin(t)];
    });
  if (entity.type === 'arc') return sampleArc(entity.a, entity.m, entity.b, steps);
  return [];
}

// Snap targets an entity offers: ends, midpoints, centres.
export function entityKeyPoints(entity) {
  if (entity.type === 'line')
    return [
      { point: entity.a, kind: 'endpoint' },
      { point: entity.b, kind: 'endpoint' },
      { point: [(entity.a[0] + entity.b[0]) / 2, (entity.a[1] + entity.b[1]) / 2], kind: 'midpoint' },
    ];
  if (entity.type === 'rect') {
    const corners = rectCorners(entity);
    return [
      ...corners.map((point) => ({ point, kind: 'endpoint' })),
      ...corners.map((p, i) => {
        const q = corners[(i + 1) % 4];
        return { point: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], kind: 'midpoint' };
      }),
      { point: [(corners[0][0] + corners[2][0]) / 2, (corners[0][1] + corners[2][1]) / 2], kind: 'center' },
    ];
  }
  if (entity.type === 'circle')
    return [
      { point: entity.c, kind: 'center' },
      ...[0, 1, 2, 3].map((i) => ({
        point: [
          entity.c[0] + entity.r * Math.cos((i * Math.PI) / 2),
          entity.c[1] + entity.r * Math.sin((i * Math.PI) / 2),
        ],
        kind: 'quadrant',
      })),
    ];
  if (entity.type === 'arc') {
    const geometry = arcGeometry(entity.a, entity.m, entity.b);
    return [
      { point: entity.a, kind: 'endpoint' },
      { point: entity.b, kind: 'endpoint' },
      ...(geometry ? [{ point: geometry.center, kind: 'center' }] : []),
    ];
  }
  return [];
}

// Straight pieces used for "on edge" snapping and hit testing.
export function entitySegments(entity) {
  const points = entityPolyline(entity, 48);
  return points.slice(1).map((p, i) => [points[i], p]);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i],
      [xj, yj] = polygon[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distanceToSegment(p, [a, b]) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const signedArea = (polygon) =>
  polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;

// Loop A lies inside loop B when none of A's samples is outside B and at least
// one is clearly inside (samples on B's boundary are ignored, so touching
// loops are still classified).
function inside(inner, outer) {
  const boundary = outer.polygon.slice(1).map((p, i) => [outer.polygon[i], p]);
  let any = false;
  for (const p of inner.polygon) {
    if (boundary.some((s) => distanceToSegment(p, s) < 1e-6)) continue;
    if (!pointInPolygon(p, outer.polygon)) return false;
    any = true;
  }
  return any;
}

// Group line/arc entities into chains by shared endpoints.
function chains(pieces) {
  const nodes = [];
  const node = (p) => {
    let index = nodes.findIndex((n) => samePoint(n.point, p));
    if (index < 0) {
      nodes.push({ point: p, edges: [] });
      index = nodes.length - 1;
    }
    return index;
  };
  const edges = pieces.map((entity, index) => {
    const from = node(entity.a),
      to = node(entity.b);
    nodes[from].edges.push(index);
    nodes[to].edges.push(index);
    return { entity, from, to };
  });
  const problems = [];
  if (nodes.some((n) => n.edges.length > 2))
    problems.push('Three or more lines meet at one point. Each corner of an outline must join exactly two lines.');
  const used = new Set();
  const result = [];
  const walk = (startNode, closedHint) => {
    const ordered = [];
    let current = startNode;
    for (;;) {
      const next = nodes[current].edges.find((e) => !used.has(e));
      if (next == null) break;
      used.add(next);
      const edge = edges[next];
      const forward = edge.from === current;
      ordered.push({ entity: edge.entity, forward });
      current = forward ? edge.to : edge.from;
      if (closedHint && current === startNode) break;
    }
    return { segments: ordered, closed: ordered.length > 0 && current === startNode };
  };
  // Open chains start at a dead end; the rest are loops.
  nodes.forEach((n, index) => {
    if (n.edges.length === 1 && !used.has(n.edges[0])) result.push(walk(index, false));
  });
  nodes.forEach((n, index) => {
    if (n.edges.some((e) => !used.has(e))) result.push(walk(index, true));
  });
  return { chains: result, problems };
}

const chainStart = (chain) => {
  const first = chain.segments[0];
  return first.forward ? first.entity.a : first.entity.b;
};
function chainPolygon(chain) {
  const points = [chainStart(chain)];
  for (const { entity, forward } of chain.segments) {
    const [a, b] = forward ? [entity.a, entity.b] : [entity.b, entity.a];
    const piece = entity.type === 'arc' ? sampleArc(a, entity.m, b, 48) : [a, b];
    points.push(...piece.slice(1));
  }
  return points;
}
function chainPath(chain, closed) {
  const start = roundPoint(chainStart(chain));
  const segments = chain.segments.map(({ entity, forward }, index) => {
    // A closed loop ends exactly on its start, so the kernel adds no extra edge.
    const rawEnd = forward ? entity.b : entity.a;
    const end = closed && index === chain.segments.length - 1 ? start : roundPoint(rawEnd);
    return entity.type === 'arc' ? { type: 'arc', end, mid: roundPoint(entity.m) } : { type: 'line', end };
  });
  return { type: 'path', start, segments, closed };
}
function loopProfile(loop) {
  if (loop.kind === 'rect') {
    const [min, , max] = rectCorners(loop.entity);
    return {
      type: 'rectangle',
      width: round(max[0] - min[0]),
      height: round(max[1] - min[1]),
      origin: roundPoint(min),
    };
  }
  if (loop.kind === 'circle')
    return { type: 'circle', radius: round(loop.entity.r), center: roundPoint(loop.entity.c) };
  return chainPath(loop.chain, true);
}

// Convert drawn entities to one kernel profile: the outer outline with any
// loops directly inside it as `holes`. Returns problems for anything the
// kernel cannot extrude, rather than guessing.
export function entitiesToProfile(entities = []) {
  const drawn = entities.filter((e) => !e.construction);
  const problems = [];
  const loops = [];
  for (const entity of drawn) {
    if (entity.type === 'rect') {
      const [min, , max] = rectCorners(entity);
      if (max[0] - min[0] > EPS && max[1] - min[1] > EPS) loops.push({ kind: 'rect', entity });
    } else if (entity.type === 'circle') {
      if (entity.r > EPS) loops.push({ kind: 'circle', entity });
    }
  }
  const pieces = drawn.filter(
    (e) => (e.type === 'line' || (e.type === 'arc' && arcGeometry(e.a, e.m, e.b))) && !samePoint(e.a, e.b),
  );
  const grouped = chains(pieces);
  problems.push(...grouped.problems);
  const open = [];
  for (const chain of grouped.chains) {
    if (chain.closed) loops.push({ kind: 'chain', chain });
    else open.push(chain);
  }
  if (open.length)
    problems.push(
      `${open.length} open outline${open.length > 1 ? 's' : ''}: connect the ends (snap to the start point) to close the profile.`,
    );
  for (const loop of loops) {
    loop.polygon =
      loop.kind === 'chain' ? chainPolygon(loop.chain) : entityPolyline(loop.entity, loop.kind === 'circle' ? 96 : 4);
    loop.area = Math.abs(signedArea(loop.polygon.slice(0, -1)));
  }
  for (const loop of loops) loop.parents = loops.filter((other) => other !== loop && inside(loop, other));
  const outers = loops.filter((l) => !l.parents.length).sort((a, b) => b.area - a.area);
  if (!outers.length) {
    if (!open.length) return { profile: null, problems: drawn.length ? problems : ['Draw a closed outline first.'] };
    // Keep unfinished work as an open path (a valid sweep path, not extrudable).
    const longest = open.sort((a, b) => b.segments.length - a.segments.length)[0];
    return { profile: chainPath(longest, false), closed: false, problems };
  }
  if (outers.length > 1)
    problems.push(
      `${outers.length} separate outlines: one extrusion uses one outer outline (the largest is used). Sketch the others separately.`,
    );
  const outer = outers[0];
  const holes = loops.filter((l) => l.parents.length === 1 && l.parents[0] === outer);
  if (loops.some((l) => l.parents.length > 1))
    problems.push('An outline inside a hole is not supported yet; it was left out of the profile.');
  const profile = loopProfile(outer);
  if (holes.length) profile.holes = holes.map(loopProfile);
  // Branching lines make the outline ambiguous, so nothing is extruded.
  return { profile, closed: !grouped.problems.length, problems, loops: loops.length, holes: holes.length };
}

// Rebuild editable entities from a stored profile, so sketches made with the
// old editor (or by data) can be opened in the viewport. Returns null when the
// profile uses expressions, splines or offsets, which would be lost.
export function profileToEntities(profile) {
  const entities = [];
  let next = 1;
  const id = () => `e${next++}`;
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const pt = (p) => Array.isArray(p) && p.length === 2 && p.every(num);
  const add = (shape) => {
    if (!shape || shape.offset) return false;
    if (shape.type === 'rectangle') {
      const origin = shape.origin || [0, 0];
      if (!num(shape.width) || !num(shape.height) || !pt(origin)) return false;
      entities.push({ id: id(), type: 'rect', a: origin, b: [origin[0] + shape.width, origin[1] + shape.height] });
    } else if (shape.type === 'circle') {
      const center = shape.center || [0, 0];
      if (!num(shape.radius) || !pt(center)) return false;
      entities.push({ id: id(), type: 'circle', c: center, r: shape.radius });
    } else if (shape.type === 'polygon') {
      if (!shape.points?.length || !shape.points.every(pt)) return false;
      shape.points.forEach((p, i) =>
        entities.push({ id: id(), type: 'line', a: p, b: shape.points[(i + 1) % shape.points.length] }),
      );
    } else if (shape.type === 'path') {
      if (!pt(shape.start)) return false;
      let current = shape.start;
      for (const segment of shape.segments || []) {
        if (!pt(segment.end) || segment.construction) return false;
        if (segment.type === 'line') entities.push({ id: id(), type: 'line', a: current, b: segment.end });
        else if (segment.type === 'arc' && pt(segment.mid))
          entities.push({ id: id(), type: 'arc', a: current, b: segment.end, m: segment.mid });
        else return false;
        current = segment.end;
      }
      if (shape.closed !== false && !samePoint(current, shape.start))
        entities.push({ id: id(), type: 'line', a: current, b: shape.start });
    } else return false;
    return (shape.holes || []).every(add);
  };
  return add(profile) ? entities : null;
}

const fmt = (value) => Number(value.toFixed(2)).toString();
export function describeEntity(entity) {
  if (entity.type === 'line') return `Line ${fmt(distance(entity.a, entity.b))} mm`;
  if (entity.type === 'rect') {
    const [min, , max] = rectCorners(entity);
    return `Rectangle ${fmt(max[0] - min[0])} × ${fmt(max[1] - min[1])} at (${fmt(min[0])}, ${fmt(min[1])})`;
  }
  if (entity.type === 'circle') return `Circle Ø${fmt(entity.r * 2)} at (${fmt(entity.c[0])}, ${fmt(entity.c[1])})`;
  if (entity.type === 'arc') {
    const geometry = arcGeometry(entity.a, entity.m, entity.b);
    return `Arc R${geometry ? fmt(geometry.radius) : '?'}`;
  }
  return entity.type;
}

export function describeProfile(profile) {
  if (!profile) return 'No profile';
  const holes = profile.holes?.length ? ` with ${profile.holes.length} hole${profile.holes.length > 1 ? 's' : ''}` : '';
  if (profile.type === 'rectangle') return `Rectangle ${profile.width} × ${profile.height}${holes}`;
  if (profile.type === 'circle') return `Circle R${profile.radius}${holes}`;
  if (profile.type === 'polygon') return `Polygon, ${profile.points?.length || 0} corners${holes}`;
  if (profile.type === 'path')
    return `${profile.closed === false ? 'Open' : 'Closed'} path, ${profile.segments?.length || 0} segments${holes}`;
  return profile.type;
}

export function hitEntity(entities, point, tolerance) {
  let best = null;
  for (const entity of entities) {
    const d = Math.min(...entitySegments(entity).map((s) => distanceToSegment(point, s)));
    if (d <= tolerance && (!best || d < best.d)) best = { id: entity.id, d };
  }
  return best?.id || null;
}
export { distanceToSegment };
