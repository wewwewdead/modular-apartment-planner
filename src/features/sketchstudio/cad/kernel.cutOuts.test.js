// The kernel's compound face for cut-outs (docs/sketch-studio-drawing-table.md
// §3.2 item 2, §4.1): the sample drawing's cover (368 cut-outs, drawn as the
// sketcher would hold it) flat and folded inside its time budget, the body by both paths to the same volume,
// and cut-outs that touch, cross or hold each other cut one by one as before.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { emptyModel } from './model.js';
import { createKernelSession, separateCutOuts } from './kernel.js';
import { foldSheet, foldedBounds } from './sheetMetal.js';
import { entitiesToProfile, roundPoint } from './sketchProfile.js';
import { patternEntities } from './sketchPattern.js';

const require = createRequire(import.meta.url);
beforeAll(
  async () =>
    setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) })),
  60000,
);

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
const parts = sampleParts.map((part) => ({
  name: part.title,
  profile: entitiesToProfile(sampleEntities(part)).profile,
  bendLines: part.bends.map((b) => ({ a: b.a, b: b.b, angle: b.angle, direction: b.direction })),
}));
const partNamed = (name) => parts.find((p) => p.name === name);

const t = 1.2;
const sheetFeature = (bendLines = []) => ({
  id: 'sm',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: t,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends: bendLines.map((line, i) => ({
    id: `b${i + 1}`,
    a: line.a,
    b: line.b,
    angle: line.angle,
    direction: line.direction,
    radius: null,
  })),
});
const sheetModel = (profile, bendLines = []) => ({
  ...emptyModel(),
  sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile, primitives: [], constrained: false }],
  parts: [{ id: 'p', name: 'Sheet part', material: 'SPCC cold-rolled steel', features: [sheetFeature(bendLines)] }],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
});
// A plain extrusion of a sketch (the 'each' / 'compound' paths for any profile).
const extrudeModel = (profile) => ({
  ...emptyModel(),
  sketches: [{ id: 's', name: 'Plate', plane: 'XY', profile, primitives: [], constrained: false }],
  parts: [{ id: 'p', name: 'Plate', features: [{ id: 'x', type: 'extrude', sketchId: 's', length: 2 }] }],
  instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
});
// Build + tessellation (the session and its snapshot), wall clock.
const build = (model, options) => {
  const start = performance.now();
  const session = createKernelSession(model, options);
  try {
    const snapshot = session.snapshot();
    return { part: snapshot.parts[0], ms: performance.now() - start };
  } finally {
    session.dispose();
  }
};

describe('kernel: cut-outs as one compound face', () => {
  it('cuts the cover flat (368 cut-outs) to its blank area × t, under 10 s', () => {
    const cover = partNamed('COVER -02');
    expect(separateCutOuts(cover.profile)).toEqual({ free: [...Array(368).keys()], rest: [] });
    const fold = foldSheet(sheetFeature(), cover.profile);
    const { part, ms } = build(sheetModel(cover.profile));
    console.warn(`cover flat: ${ms.toFixed(0)} ms, volume ${part.volume.toFixed(1)} mm³`);
    expect(Math.abs(part.volume / (fold.flat.area * t) - 1)).toBeLessThan(0.001);
    expect(ms).toBeLessThan(10000);
  }, 60000);

  it('folds the cover on its four bend lines to the fold’s bounds, under 20 s', () => {
    const cover = partNamed('COVER -02');
    const fold = foldSheet(sheetFeature(cover.bendLines), cover.profile);
    const { part, ms } = build(sheetModel(cover.profile, cover.bendLines));
    const expected = foldedBounds(fold);
    console.warn(`cover folded: ${ms.toFixed(0)} ms, bounds ${JSON.stringify(part.bounds)}`);
    part.bounds.forEach((corner, i) =>
      corner.forEach((v, k) => expect(Math.abs(v - expected[i][k])).toBeLessThan(0.05)),
    );
    expect(ms).toBeLessThan(20000);
  }, 60000);

  it('builds the body flat to the same volume by both paths', () => {
    const body = partNamed('BODY -01');
    const each = build(sheetModel(body.profile), { cutOuts: 'each' });
    const compound = build(sheetModel(body.profile));
    console.warn(
      `body flat: one by one ${each.ms.toFixed(0)} ms, compound ${compound.ms.toFixed(0)} ms, volume ${compound.part.volume.toFixed(1)} mm³`,
    );
    expect(Math.abs(compound.part.volume / each.part.volume - 1)).toBeLessThan(1e-6);
  }, 60000);

  it('cuts overlapping circles, a circle across the outline and one outside it one by one, to today’s volume', () => {
    const profile = {
      type: 'rectangle',
      width: 100,
      height: 60,
      origin: [0, 0],
      holes: [
        { type: 'circle', radius: 5, center: [20, 30] },
        { type: 'circle', radius: 6, center: [40, 30] },
        { type: 'circle', radius: 6, center: [48, 30] }, // overlaps the one before
        { type: 'circle', radius: 8, center: [100, 30] }, // crosses the outline
        {
          type: 'polygon',
          points: [
            [70, 10],
            [80, 10],
            [75, 20],
          ],
        },
        { type: 'circle', radius: 3, center: [150, 30] }, // wholly outside
      ],
    };
    expect(separateCutOuts(profile)).toEqual({ free: [0, 4], rest: [1, 2, 3, 5] });
    const each = build(extrudeModel(profile), { cutOuts: 'each' });
    const compound = build(extrudeModel(profile));
    expect(compound.part.volume).toBeGreaterThan(0);
    expect(Math.abs(compound.part.volume / each.part.volume - 1)).toBeLessThan(1e-9);
  }, 60000);

  // HD-3 (docs/sketch-studio-hand-drawing.md §7.6): the drawing Pattern makes, an
  // outline with rounded corners round a staggered grid of 360 hexagons (polygon
  // entities, `{ type: 'polygon', points }` cut-outs), as one compound face.
  it('builds an outline with 360 patterned hexagons as one compound face', () => {
    const drawing = [
      { id: 'e1', type: 'rect', a: [-10, -10], b: [165, 215], r: 5 },
      { id: 'e2', type: 'polygon', c: [0, 0], sides: 6, af: 8, angle: 0 },
    ];
    const grid = { kind: 'grid', columns: 15, rows: 24, columnStep: 10, rowStep: 8.66, stagger: true };
    const { entities } = patternEntities(drawing, ['e2'], grid, { nextId: 3 });
    const { profile } = entitiesToProfile(entities);
    expect(profile.holes).toHaveLength(360);
    expect(profile.holes.every((h) => h.type === 'polygon' && h.points.length === 6)).toBe(true);
    expect(separateCutOuts(profile)).toEqual({ free: [...Array(360).keys()], rest: [] });
    const fold = foldSheet(sheetFeature(), profile);
    const { part, ms } = build(sheetModel(profile));
    console.warn(`360 hexagons flat: ${ms.toFixed(0)} ms, volume ${part.volume.toFixed(1)} mm³`);
    expect(Math.abs(part.volume / (fold.flat.area * t) - 1)).toBeLessThan(0.001);
    expect(ms).toBeLessThan(10000);
  }, 60000);

  it('keeps holes inside holes, touching holes, clockwise outlines and splines to the rule', () => {
    const outline = [
      [0, 0],
      [0, 80],
      [120, 80],
      [120, 0],
    ]; // clockwise
    const square = (x, y, s) => ({
      type: 'polygon',
      points: [
        [x, y],
        [x + s, y],
        [x + s, y + s],
        [x, y + s],
      ],
    });
    const profile = {
      type: 'polygon',
      points: outline,
      holes: [
        { type: 'circle', radius: 15, center: [30, 40] },
        { type: 'circle', radius: 3, center: [30, 40] }, // inside the one before
        square(60, 30, 10),
        square(70, 30, 10), // shares an edge with the one before
        { ...square(90, 30, 10), points: square(90, 30, 10).points.reverse() }, // clockwise
        { type: 'circle', radius: 4, center: [110.05, 70] }, // 0.05 from the next: too near
        { type: 'circle', radius: 3, center: [110.05, 62.95] },
      ],
    };
    expect(separateCutOuts(profile)).toEqual({ free: [4], rest: [0, 1, 2, 3, 5, 6] });
    const each = build(extrudeModel(profile), { cutOuts: 'each' });
    const compound = build(extrudeModel(profile));
    expect(Math.abs(compound.part.volume / each.part.volume - 1)).toBeLessThan(1e-9);
    // Free cut-outs only, one of them drawn clockwise, on a clockwise outline.
    const apart = { ...profile, holes: [profile.holes[0], profile.holes[2], profile.holes[4]] };
    expect(separateCutOuts(apart)).toEqual({ free: [0, 1, 2], rest: [] });
    expect(
      Math.abs(
        build(extrudeModel(apart)).part.volume / build(extrudeModel(apart), { cutOuts: 'each' }).part.volume - 1,
      ),
    ).toBeLessThan(1e-9);
    // Fewer than two holes, an offset or a spline: today's path, whole.
    expect(separateCutOuts({ ...apart, holes: [apart.holes[0]] })).toBeNull();
    expect(separateCutOuts({ ...apart, offset: 1 })).toBeNull();
    expect(
      separateCutOuts({
        ...apart,
        holes: [
          ...apart.holes,
          {
            type: 'path',
            start: [50, 60],
            closed: true,
            segments: [
              { type: 'spline', end: [60, 60], control1: [52, 66], control2: [58, 66] },
              { type: 'line', end: [50, 60] },
            ],
          },
        ],
      }),
    ).toBeNull();
  }, 60000);
});
