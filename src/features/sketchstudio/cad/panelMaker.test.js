// The flanged panel maker (docs/sketch-studio-shop-floor.md §6.3), by its
// invariants rather than a formula sheet: for rectangles and trapezoids (base
// angles down to 60°), 0 – 4 flanges, 0 – 2 creases, up and down, t 1.0 – 3.2,
// the blank folds; each flange's outside face lies in the plane through its
// face edge at the flange angle and stands `depth` high; the folded face
// measures what was asked along and across every crease; flange ends at
// corners and crease notches stand `gap` apart and never cross; the brake's
// own sequence check passes where the set-up clears, and names the hit and
// the reason where it does not. Every number is measured on the folded part.
import { describe, expect, it } from 'vitest';
import { flangedPanel, pieceClearances, presetFace } from './panelMaker.js';
import { foldSheet, transformPoint } from './sheetMetal.js';

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(...a);
const unit3 = (a) => a.map((v) => v / norm(a));
const zAxis = (m) => unit3([m[8], m[9], m[10]]);
// Distance from p to the line through a along unit d.
const toLine = (p, a, d) => norm(cross3(sub3(p, a), d));
const designEdge = (face, i) => [face[i], face[(i + 1) % face.length]];
const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

const TRAPEZOID_60 = presetFace('trapezoid', {
  bottom: 800,
  top: 800 - (2 * 400) / Math.tan(Math.PI / 3),
  height: 400,
});
const CASES = [];
for (const [shape, face] of [
  ['rectangle 600 × 1400', presetFace('rectangle', { width: 600, height: 1400 })],
  ['rectangle 300 × 200', presetFace('rectangle', { width: 300, height: 200 })],
  ['trapezoid, 60° base', TRAPEZOID_60],
])
  for (const t of [1.0, 1.5, 3.2])
    for (const [label, edges] of [
      ['no flange', []],
      ['one flange', [0]],
      ['two flanges at a corner', [0, 1]],
      ['three flanges', [0, 1, 3]],
      ['four flanges', [0, 1, 2, 3]],
    ])
      for (const direction of ['up', 'down']) {
        const height = Math.max(...face.map((p) => p[1]));
        const width = Math.max(...face.map((p) => p[0]));
        const creases =
          edges.length === 4 && direction === 'up'
            ? [
                { a: [0, height * 0.4], b: [width, height * 0.4], angle: 12, direction: 'down' },
                ...(height > 1000
                  ? [{ a: [0, height * 0.75], b: [width, height * 0.75], angle: 8, direction: 'up' }]
                  : []),
              ]
            : edges.length === 2
              ? [{ a: [0, height / 2], b: [width, height / 2], angle: 10, direction }]
              : [];
        CASES.push({
          name: `${shape}, t ${t}, ${label} ${direction}, ${creases.length} crease${creases.length === 1 ? '' : 's'}`,
          input: {
            face,
            thickness: t,
            stock: 'spcc',
            flanges: edges.map((edge) => ({ edge, depth: 30, angle: 90, direction })),
            creases,
          },
        });
      }

function measure(result, input) {
  const { fold, strokes } = result;
  const t = fold.thickness;
  const byId = new Map(fold.bends.map((b) => [b.id, b]));
  const piece = (id) => fold.pieces.find((p) => p.id === id);
  const out = { flanges: [], creases: [] };
  for (const stroke of strokes.filter((s) => s.kind === 'flange')) {
    const flange = input.flanges.find((f) => f.edge === stroke.edge);
    const zOut = flange.direction === 'up' ? 0 : t;
    const [P, Q] = designEdge(input.face, stroke.edge);
    for (const id of stroke.bendIds) {
      const bend = byId.get(id);
      const face = piece(bend.fixedPiece),
        tab = piece(bend.movingPieces[0]);
      // The face edge (its mould line) where this tab stands: the design edge
      // points beside the tab, laid on the blank, lifted to the outside surface.
      const s = (p) => (p[0] - bend.a[0]) * bend.u[0] + (p[1] - bend.a[1]) * bend.u[1];
      const [s0, s1] = [bend.intervals[0][0], bend.intervals.at(-1)[1]];
      const onEdge = [0.25, 0.75].map((f) => {
        // The design edge point whose flat image lies across from the tab.
        let lo = 0,
          hi = 1,
          target = s0 + (s1 - s0) * f;
        const sAt = (g) => s(result.map.toFlat(lerp(P, Q, g)));
        const rising = sAt(1) > sAt(0);
        for (let k = 0; k < 60; k++) {
          const mid = (lo + hi) / 2;
          if (sAt(mid) < target === rising) lo = mid;
          else hi = mid;
        }
        const flat = result.map.toFlat(lerp(P, Q, (lo + hi) / 2));
        return transformPoint(face.matrix, [flat[0], flat[1], zOut]);
      });
      const faceNormal = zAxis(face.matrix),
        tabNormal = zAxis(tab.matrix);
      const tabPoint = transformPoint(tab.matrix, [...tab.outer[0], zOut]);
      const offPlane = Math.max(...onEdge.map((p) => Math.abs(dot3(sub3(p, tabPoint), tabNormal))));
      const angle = (Math.acos(Math.min(1, Math.abs(dot3(faceNormal, tabNormal)))) * 180) / Math.PI;
      const d = unit3(sub3(onEdge[1], onEdge[0]));
      const height = Math.max(
        ...tab.outer.map((p) => toLine(transformPoint(tab.matrix, [p[0], p[1], zOut]), onEdge[0], d)),
      );
      out.flanges.push({ edge: stroke.edge, offPlane, angle, height, depth: flange.depth, want: flange.angle });
    }
  }
  for (const stroke of strokes.filter((s) => s.kind === 'crease')) {
    const crease = input.creases[stroke.crease];
    const bend = byId.get(stroke.bendIds[0]);
    const zOut = crease.direction === 'up' ? 0 : t;
    const A = piece(bend.fixedPiece),
      B = piece(bend.movingPieces[0]);
    // The crease's virtual sharp: where the two outside planes meet.
    const nA = zAxis(A.matrix),
      nB = zAxis(B.matrix);
    const pA = transformPoint(A.matrix, [...A.outer[0], zOut]),
      pB = transformPoint(B.matrix, [...B.outer[0], zOut]);
    const dir = unit3(cross3(nA, nB));
    // A point on both planes: solve in the plane spanned by the normals.
    const c1 = dot3(nA, pA),
      c2 = dot3(nB, pB),
      k = dot3(nA, nB);
    const det = 1 - k * k;
    const alpha = (c1 - c2 * k) / det,
      beta = (c2 - c1 * k) / det;
    const sharp = [0, 1, 2].map((i) => alpha * nA[i] + beta * nB[i]);
    // Every face corner beside this crease: its distance to the sharp line and its place along it.
    const u = [crease.b[0] - crease.a[0], crease.b[1] - crease.a[1]];
    const ul = Math.hypot(...u);
    const along2 = [u[0] / ul, u[1] / ul],
      n2 = [-along2[1], along2[0]];
    const delta = (p) => (p[0] - crease.a[0]) * n2[0] + (p[1] - crease.a[1]) * n2[1];
    const sideOf = (sign) => {
      const probe = result.map.toFlat([
        crease.a[0] + along2[0] * ul * 0.5 + n2[0] * sign * 8,
        crease.a[1] + along2[1] * ul * 0.5 + n2[1] * sign * 8,
      ]);
      return [A, B].find((pc) => pointIn(probe, pc.outer));
    };
    const others = input.creases.filter((c) => c !== crease);
    for (const p of input.face) {
      const dp = delta(p);
      // Corners beyond another crease lie on a piece this one does not touch.
      if (
        others.some((c) => {
          const off = delta(c.a);
          return Math.sign(off) === Math.sign(dp) && Math.abs(off) < Math.abs(dp);
        })
      )
        continue;
      const pc = sideOf(Math.sign(dp));
      const flat = result.map.toFlat(p);
      const world = transformPoint(pc.matrix, [flat[0], flat[1], zOut]);
      out.creases.push({
        crease: stroke.crease,
        across: toLine(world, sharp, dir),
        wantAcross: Math.abs(dp),
        along: dot3(sub3(world, sharp), dir),
        wantAlong: (p[0] - crease.a[0]) * along2[0] + (p[1] - crease.a[1]) * along2[1],
      });
    }
  }
  return out;
}
function pointIn([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

describe('flangedPanel invariants', () => {
  it.each(CASES.map((c) => [c.name, c.input]))('%s', (_, input) => {
    const result = flangedPanel(input);
    // foldSheet accepts the blank and the bends on their own.
    const fold = foldSheet(result.feature, result.profile);
    expect(fold.bends).toHaveLength(result.bends.length);
    expect(result.bends.length).toBe(result.strokes.reduce((n, s) => n + s.bendIds.length, 0));
    const { flanges, creases } = measure(result, input);
    expect(flanges.length).toBeGreaterThanOrEqual(input.flanges.length);
    for (const f of flanges) {
      expect(f.offPlane).toBeLessThan(0.01);
      expect(Math.abs(f.angle - f.want)).toBeLessThan(0.01);
      expect(Math.abs(f.height - f.depth)).toBeLessThan(0.01);
    }
    for (const c of creases) {
      expect(Math.abs(c.across - c.wantAcross)).toBeLessThan(0.01);
    }
    // Along each crease: differences between corners as designed (the sharp
    // line's direction is either way round: the better of the two).
    for (const index of new Set(creases.map((c) => c.crease))) {
      const rows = creases.filter((c) => c.crease === index);
      const worst = (sign) =>
        Math.max(
          ...rows.flatMap((a) => rows.map((b) => Math.abs(sign * (a.along - b.along) - (a.wantAlong - b.wantAlong)))),
        );
      expect(Math.min(worst(1), worst(-1))).toBeLessThan(0.01);
    }
    // Flange ends at corners and notches: never crossing, at least the gap apart.
    expect(result.report.minClearance == null || result.report.minClearance >= 0.2 - 1e-6).toBe(true);
    // The brake's own check of the returned order: every hit passes, or the
    // report names the hit and the reason (an acute corner's first wall stands
    // where the second flange's punch goes, for one).
    for (const step of result.report.sequence) expect(step.ok || /^Bend \d+: /.test(step.message)).toBe(true);
    if (input.face.length === 4 && input.face[1][0] === input.face[2][0])
      expect(result.report.sequence.every((step) => step.ok)).toBe(true);
    // One etched line per stroke, carrying its bend.
    expect(result.marks).toHaveLength(result.strokes.length);
    expect(result.marks.every((m) => m.bend && ['up', 'down'].includes(m.bend.direction))).toBe(true);
  });
});

describe('flangedPanel', () => {
  // The §1 kiosk face frame.
  const kiosk = {
    face: presetFace('rectangle', { width: 600, height: 1400 }),
    thickness: 1.5,
    stock: 'spcc',
    flanges: [0, 1, 2, 3].map((edge) => ({ edge, depth: 40 })),
    creases: [{ a: [0, 600], b: [600, 600], angle: 12, direction: 'down' }],
    windows: [
      { type: 'rect', x: 300, y: 1000, width: 440, height: 560, radius: 12 },
      { type: 'rect', x: 300, y: 300, width: 440, height: 400 },
    ],
    holes: [{ x: 30, y: 30, diameter: 5 }],
  };
  it('lays out the kiosk face frame: brake order, strokes, marks, a clean sequence', () => {
    const result = flangedPanel(kiosk);
    // Long edges first (left and right, each notched at the crease: two tabs, one stroke), then bottom, top, crease.
    expect(result.strokes.map((s) => [s.kind, s.edge ?? s.crease, s.bendIds.length])).toEqual([
      ['flange', 1, 2],
      ['flange', 3, 2],
      ['flange', 0, 1],
      ['flange', 2, 1],
      ['crease', 0, 1],
    ]);
    const strokeIds = result.bends.filter((b) => b.stroke).map((b) => b.stroke);
    expect(new Set(strokeIds).size).toBe(2);
    expect(result.report.sequence.every((s) => s.ok)).toBe(true);
    expect(result.report.problems).toEqual([]);
    expect(result.marks.map((m) => m.bend)).toEqual([
      { angle: 90, direction: 'up' },
      { angle: 90, direction: 'up' },
      { angle: 90, direction: 'up' },
      { angle: 90, direction: 'up' },
      { angle: 12, direction: 'down' },
    ]);
    // Windows with a corner radius stay true arcs; a plain one is a polygon; the hole a circle.
    expect(result.profile.holes.map((h) => h.type)).toEqual(['path', 'polygon', 'circle']);
    expect(result.profile.holes[0].segments.filter((s) => s.type === 'arc')).toHaveLength(4);
    // The folded size: 600 wide, 40 deep flanges.
    expect(result.report.folded.size[0]).toBeCloseTo(600, 2);
    expect(result.report.blank.pierces).toBe(4);
  });
  it('closes square corners: the long flange covers, the short one stops the gap short', () => {
    const result = flangedPanel({ ...kiosk, creases: [], windows: [], holes: [] });
    const near = pieceClearances(result.fold, new Set([result.fold.rootPiece]));
    expect(Math.min(...near.map((c) => c.distance))).toBeCloseTo(0.2, 4);
  });
  it('reports, before anything is made, a hit the brake refuses', () => {
    // 120 mm returns on a 600 mm wide panel: the crease (last) hangs them below the die.
    const deep = flangedPanel({ ...kiosk, flanges: [0, 1, 2, 3].map((edge) => ({ edge, depth: 120 })) });
    expect(deep.report.problems.length).toBeGreaterThan(0);
    expect(deep.report.problems[0].message).toMatch(/^Bend \d: the part hits the /);
  });
  it('refuses by name what it cannot make', () => {
    const square = presetFace('rectangle', { width: 200, height: 100 });
    expect(() => flangedPanel({ face: [...square].reverse(), thickness: 1.5 })).toThrow(/counter-clockwise/);
    expect(() =>
      flangedPanel({
        face: [
          [0, 0],
          [100, 0],
          [50, 20],
          [100, 100],
          [0, 100],
        ],
        thickness: 1.5,
      }),
    ).toThrow(/convex/);
    // A 30° corner between two flanges.
    const sharp = [
      [0, 0],
      [200, 0],
      [200 - 100 / Math.tan(Math.PI / 6), 100],
    ];
    expect(() =>
      flangedPanel({
        face: sharp,
        thickness: 1.5,
        flanges: [
          { edge: 0, depth: 20 },
          { edge: 1, depth: 20 },
        ],
      }),
    ).toThrow(/^Corner 2 \(between edges 1 and 2\) is 30°: two flanges can meet only at 45° – 135°/);
    expect(() =>
      flangedPanel({
        face: square,
        thickness: 1.5,
        creases: [
          { a: [0, 50], b: [200, 50], angle: 10, direction: 'down' },
          { a: [100, 0], b: [100, 100], angle: 10, direction: 'down' },
        ],
      }),
    ).toThrow(/not parallel/);
    expect(() =>
      flangedPanel({
        face: square,
        thickness: 1.5,
        windows: [{ type: 'rect', x: 100, y: 50, width: 80, height: 40 }],
        creases: [{ a: [0, 50], b: [200, 50], angle: 10, direction: 'down' }],
      }),
    ).toThrow(/^Window 1 crosses a crease/);
    expect(() => flangedPanel({ face: square, thickness: 1.5, flanges: [{ edge: 0, depth: 1 }] })).toThrow(
      /too short to bend/,
    );
  });
});
