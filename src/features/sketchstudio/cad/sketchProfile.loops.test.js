// The loop finder's speedups (docs/sketch-studio-drawing-table.md §3.2 item 4):
// chains through a grid hash, profileLoops skipping `inside` on box misses.
// The code before them is kept below as a copy; both must give the same
// loops, profile and outline split, on the three flat patterns of the
// sample dimension drawing (drawn as the sketcher would hold them) and on
// the shapes the other sketch tests draw.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  arcGeometry,
  distanceToSegment,
  entitiesToProfile,
  entityPolyline,
  profileLoops,
  roundPoint,
  sampleArc,
  samePoint,
  splitOutlines,
} from './sketchProfile.js';

// ------------------------------------------------ the old code, as it was
const old = (() => {
  const EPS = 1e-6;
  const round = (value) => {
    const result = Math.round(value * 1e6) / 1e6;
    return Object.is(result, -0) ? 0 : result;
  };
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
  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i],
        [xj, yj] = polygon[j];
      if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }
  const signedArea = (polygon) =>
    polygon.reduce((sum, p, i) => {
      const q = polygon[(i + 1) % polygon.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2;
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
  function profileLoops(entities) {
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
    for (const loop of loops) {
      loop.polygon =
        loop.kind === 'chain' ? chainPolygon(loop.chain) : entityPolyline(loop.entity, loop.kind === 'circle' ? 96 : 4);
      loop.area = Math.abs(signedArea(loop.polygon.slice(0, -1)));
    }
    for (const loop of loops) loop.parents = loops.filter((other) => other !== loop && inside(loop, other));
    const outers = loops.filter((l) => !l.parents.length).sort((a, b) => b.area - a.area);
    return { drawn, loops, outers, open, problems, branching: grouped.problems.length > 0 };
  }
  const loopEntities = (loop) => (loop.kind === 'chain' ? loop.chain.segments.map((s) => s.entity) : [loop.entity]);
  function splitOutlines(entities = []) {
    const { loops, outers } = profileLoops(entities);
    if (outers.length < 2) return [entities];
    const owner = new Map();
    outers.forEach((outer, index) => {
      for (const loop of [outer, ...loops.filter((l) => l.parents.length === 1 && l.parents[0] === outer)])
        for (const entity of loopEntities(loop)) owner.set(entity, index);
    });
    const groups = outers.map(() => []);
    for (const entity of entities) groups[owner.get(entity) ?? 0].push(entity);
    return groups;
  }
  function entitiesToProfile(entities = []) {
    const { drawn, loops, outers, open, problems, branching } = profileLoops(entities);
    if (open.length)
      problems.push(
        `${open.length} open outline${open.length > 1 ? 's' : ''}: connect the ends (snap to the start point) to close the profile.`,
      );
    if (!outers.length) {
      if (!open.length) return { profile: null, problems: drawn.length ? problems : ['Draw a closed outline first.'] };
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
    return { profile, closed: !branching, problems, loops: loops.length, holes: holes.length };
  }
  return { profileLoops, splitOutlines, entitiesToProfile };
})();

// ------------------------------------------------ the cases
// The sample drawing's three flat patterns (scripts/fixtures/vw-400-parts.
// expected.json) drawn as a user would in the sketcher: the outline as lines
// V1 → … → V1, a hole a circle, a slot / window / keyhole as lines and
// 3-point arcs, a hexagon (pointy-top, across flats af) six lines.
const sampleParts = JSON.parse(
  readFileSync(new URL('../../../../scripts/fixtures/vw-400-parts.expected.json', import.meta.url)),
);
function featureShapes(f) {
  const [cx, cy] = f.c;
  const P = (x, y) => [cx + x, cy + y];
  if (f.type === 'hole') return [{ type: 'circle', c: f.c, r: f.d / 2 }];
  if (f.type === 'slot') {
    const t = (f.angle * Math.PI) / 180,
      r = f.width / 2,
      h = f.length / 2 - r;
    const u = [Math.cos(t), Math.sin(t)];
    const Q = (s, v) => [cx + u[0] * s - u[1] * v, cy + u[1] * s + u[0] * v];
    return [
      { type: 'line', a: Q(-h, -r), b: Q(h, -r) },
      { type: 'arc', a: Q(h, -r), m: Q(h + r, 0), b: Q(h, r) },
      { type: 'line', a: Q(h, r), b: Q(-h, r) },
      { type: 'arc', a: Q(-h, r), m: Q(-h - r, 0), b: Q(-h, -r) },
    ];
  }
  if (f.type === 'window') {
    const w = f.w / 2,
      h = f.h / 2,
      r = f.r,
      k = r * (1 - Math.SQRT1_2);
    return [
      { type: 'line', a: P(-w + r, -h), b: P(w - r, -h) },
      { type: 'arc', a: P(w - r, -h), m: P(w - k, -h + k), b: P(w, -h + r) },
      { type: 'line', a: P(w, -h + r), b: P(w, h - r) },
      { type: 'arc', a: P(w, h - r), m: P(w - k, h - k), b: P(w - r, h) },
      { type: 'line', a: P(w - r, h), b: P(-w + r, h) },
      { type: 'arc', a: P(-w + r, h), m: P(-w + k, h - k), b: P(-w, h - r) },
      { type: 'line', a: P(-w, h - r), b: P(-w, -h + r) },
      { type: 'arc', a: P(-w, -h + r), m: P(-w + k, -h + k), b: P(-w + r, -h) },
    ];
  }
  // Keyhole: Ø d circle, a slot `slot` wide running +Y to its round end at `travel`.
  const R = f.d / 2,
    s = f.slot / 2,
    y0 = Math.sqrt(R * R - s * s);
  return [
    { type: 'arc', a: P(s, y0), m: P(0, -R), b: P(-s, y0) },
    { type: 'line', a: P(-s, y0), b: P(-s, f.travel) },
    { type: 'arc', a: P(-s, f.travel), m: P(0, f.travel + s), b: P(s, f.travel) },
    { type: 'line', a: P(s, f.travel), b: P(s, y0) },
  ];
}
function hexShapes({ c, af }) {
  const R = af / Math.sqrt(3);
  const corners = [30, 90, 150, 210, 270, 330].map((d) => [
    c[0] + R * Math.cos((d * Math.PI) / 180),
    c[1] + R * Math.sin((d * Math.PI) / 180),
  ]);
  return corners.map((a, i) => ({ type: 'line', a, b: corners[(i + 1) % 6] }));
}
function sampleEntities(part) {
  const corners = [...part.vertices].sort((a, b) => a.n - b.n).map((v) => v.p);
  const shapes = [
    ...corners.map((a, i) => ({ type: 'line', a, b: corners[(i + 1) % corners.length] })),
    ...part.features.flatMap(featureShapes),
    ...part.hexes.flatMap(hexShapes),
  ];
  return shapes.map((shape, i) => {
    const id = `e${i + 1}`;
    if (shape.type === 'circle') return { id, type: 'circle', c: roundPoint(shape.c), r: shape.r };
    if (shape.type === 'arc')
      return { id, type: 'arc', a: roundPoint(shape.a), b: roundPoint(shape.b), m: roundPoint(shape.m) };
    return { id, type: 'line', a: roundPoint(shape.a), b: roundPoint(shape.b) };
  });
}
const parts = sampleParts.map((part) => ({ name: part.title, entities: sampleEntities(part) }));

let next = 0;
const line = (a, b, extra = {}) => ({ id: `t${++next}`, type: 'line', a, b, ...extra });
const arc = (a, m, b) => ({ id: `t${++next}`, type: 'arc', a, m, b });
const circle = (c, r, extra = {}) => ({ id: `t${++next}`, type: 'circle', c, r, ...extra });
const rect = (a, b) => ({ id: `t${++next}`, type: 'rect', a, b });
const poly = (points) => points.map((p, i) => line(p, points[(i + 1) % points.length]));
const slot = (cx, cy, half, r) => [
  line([cx - half, cy - r], [cx + half, cy - r]),
  arc([cx + half, cy - r], [cx + half + r, cy], [cx + half, cy + r]),
  line([cx + half, cy + r], [cx - half, cy + r]),
  arc([cx - half, cy + r], [cx - half - r, cy], [cx - half, cy - r]),
];
// The shapes the sketch tests draw (sketchOnFace, outlineEdit, outlineMove,
// sketchRelief, the gaps workspace test): outlines, holes, open chains,
// branches, nested loops, several outlines, touching loops, construction.
const cases = {
  'rectangle with a circle': [rect([0, 0], [100, 50]), circle([50, 25], 10)],
  'polygon with a slot and a rectangle': [
    ...poly([
      [0, 0],
      [200, 0],
      [200, 120],
      [0, 120],
    ]),
    ...slot(60, 60, 20, 5),
    rect([120, 40], [160, 80]),
  ],
  'L outline drawn in reverse': poly([
    [0, 0],
    [0, 80],
    [30, 80],
    [30, 30],
    [100, 30],
    [100, 0],
  ]).reverse(),
  'open chain': [line([0, 0], [10, 0]), line([10, 0], [10, 10]), arc([10, 10], [5, 15], [0, 10])],
  'two open chains': [line([0, 0], [10, 0]), line([20, 0], [30, 5])],
  branching: [
    ...poly([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]),
    line([10, 10], [20, 20]),
  ],
  'loop inside a hole': [rect([0, 0], [100, 100]), circle([50, 50], 30), circle([50, 50], 10)],
  'two outlines with their own holes': [
    rect([0, 0], [100, 100]),
    circle([50, 50], 10),
    rect([200, 0], [260, 40]),
    ...slot(230, 20, 10, 4),
    line([500, 500], [510, 500], { construction: true }),
  ],
  'hole touching the outline': [
    ...poly([
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ]),
    ...poly([
      [0, 20],
      [20, 20],
      [20, 40],
      [0, 40],
    ]),
  ],
  'two crossing holes': [rect([0, 0], [100, 100]), circle([40, 50], 15), circle([60, 50], 15)],
  'ends 1e-7 apart join, 5e-6 apart do not': [
    line([0, 0], [10, 0]),
    line([10.0000001, 0], [10, 10]),
    line([10, 10], [0, 10]),
    line([0, 10.000005], [0, 0]),
  ],
  'ends on cell edges': [
    line([0.0009999995, 0], [5, 0]),
    line([5, 0], [5, 5]),
    line([5, 5], [0.0010000004, 0.0000004]),
  ],
  'degenerate pieces': [line([1, 1], [1, 1]), arc([0, 0], [1, 1], [2, 2]), circle([0, 0], 0), rect([0, 0], [0, 5])],
  'a coordinate that is not finite': [rect([0, 0], [10, 10]), line([2, 2], [Number.NaN, 3]), circle([5, 5], 1)],
  'construction only': [line([0, 0], [1, 1], { construction: true })],
  nothing: [],
};

describe('sketch loops, old code against new', () => {
  for (const [name, entities] of [...Object.entries(cases), ...parts.map((p) => [p.name, p.entities])])
    it(`${name}: same loops, profile and split`, () => {
      expect(entitiesToProfile(entities)).toEqual(old.entitiesToProfile(entities));
      expect(profileLoops(entities)).toEqual(old.profileLoops(entities));
      expect(splitOutlines(entities)).toEqual(old.splitOutlines(entities));
    });

  it('draws the three parts as closed outlines with every cut-out a hole', () => {
    expect(parts.map((p) => [p.name, p.entities.length, entitiesToProfile(p.entities)])).toEqual([
      ['BODY -01', 226, expect.objectContaining({ closed: true, problems: [], holes: 68 })],
      ['COVER -02', 2210, expect.objectContaining({ closed: true, problems: [], holes: 368 })],
      ['MOUNTING PLATE -03', 117, expect.objectContaining({ closed: true, problems: [], holes: 35 })],
    ]);
  });

  it('the three parts side by side split into three outlines as before', () => {
    const all = parts.flatMap((part, k) =>
      part.entities.map((e) => {
        const shift = (p) => [p[0] + 800 * k, p[1]];
        return {
          ...e,
          id: `${e.id}-${k}`,
          ...(e.a ? { a: shift(e.a), b: shift(e.b) } : {}),
          ...(e.m ? { m: shift(e.m) } : {}),
          ...(e.c ? { c: shift(e.c) } : {}),
        };
      }),
    );
    const split = splitOutlines(all);
    expect(split.map((g) => g.length)).toEqual([226, 2210, 117]);
    expect(split).toEqual(old.splitOutlines(all));
  });

  it("reads the cover's 2 210 entities into its profile in under 40 ms", async () => {
    // Wall clock, the best of at least five runs. Under the full suite's
    // parallel load a run can measure how long it waited for a core (40.07 ms
    // seen for the best of five; 18 ms alone), so up to twenty are taken,
    // 0.1 s apart, stopping once one is inside the budget.
    const BUDGET = 40;
    const cover = parts.find((p) => p.name === 'COVER -02').entities;
    const time = async (fn, budget = Infinity) => {
      let best = Infinity,
        runs = 0;
      while (runs < 5 || (best >= budget && runs < 20)) {
        if (runs >= 5) await new Promise((resolve) => setTimeout(resolve, 100));
        const t0 = performance.now();
        fn(cover);
        best = Math.min(best, performance.now() - t0);
        runs += 1;
      }
      return best;
    };
    const before = await time(old.entitiesToProfile),
      after = await time(entitiesToProfile, BUDGET);
    console.warn(`cover entitiesToProfile: old ${before.toFixed(1)} ms, new ${after.toFixed(1)} ms (best runs)`);
    expect(after).toBeLessThan(BUDGET);
  }, 20000);
});
