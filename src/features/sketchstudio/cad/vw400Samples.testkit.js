// For tests only: the sample drawing's three flat patterns
// (scripts/fixtures/vw-400-parts.expected.json) drawn as a user would in the
// sketcher, as sketchProfile.loops.test.js draws them: the outline as lines
// V1 → … → V1, a hole a circle, a slot / window / keyhole as lines and 3-point
// arcs, a hexagon six lines. 226 / 2 210 / 117 entities.
import { readFileSync } from 'node:fs';
import { arcGeometry, roundPoint } from './sketchProfile.js';

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

// [{ name: 'BODY -01' | 'COVER -02' | 'MOUNTING PLATE -03', entities }]
export function samplePartEntities() {
  const parts = JSON.parse(
    readFileSync(new URL('../../../../scripts/fixtures/vw-400-parts.expected.json', import.meta.url)),
  );
  return parts.map((part) => ({ name: part.title, entities: sampleEntities(part) }));
}

/**
 * The exact area a closed kernel profile encloses (mm², its holes taken
 * out): a path's lines by the shoelace, its 3-point arcs by their circles
 * (HD-4: trimmed and filleted outlines measured to 1e-6 of themselves); a
 * rectangle, circle or polygon by its own formula.
 */
export function profileArea(profile) {
  const own = (shape) => {
    if (shape.type === 'rectangle') return shape.width * shape.height;
    if (shape.type === 'circle') return Math.PI * shape.radius * shape.radius;
    const ring = shape.type === 'polygon' ? shape.points : null;
    if (ring) return Math.abs(ring.reduce((sum, p, i) => sum + cross(p, ring[(i + 1) % ring.length]), 0) / 2);
    let sum = 0,
      from = shape.start;
    for (const segment of shape.segments) {
      const to = segment.end;
      if (segment.type === 'arc') {
        const g = arcGeometry(from, segment.mid, to);
        sum += cross(g.center, [to[0] - from[0], to[1] - from[1]]) + g.radius * g.radius * g.sweep;
      } else sum += cross(from, to);
      from = to;
    }
    return Math.abs(sum / 2);
  };
  return own(profile) - (profile.holes || []).reduce((sum, hole) => sum + own(hole), 0);
}
const cross = (p, q) => p[0] * q[1] - p[1] * q[0];

// The median and the worst of `runs` timings of `fn` (ms), after one warm-up call.
export function timeRuns(fn, runs = 21) {
  fn();
  const times = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn(i);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(times.length / 2)], worst: times.at(-1) };
}
