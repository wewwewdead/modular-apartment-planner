// The flanged panel maker's round corner (docs/sketch-studio-round-bend.md
// §13.3, acceptance §13.5): the corner piece's numbers are the hand values of
// the §13.5 table (inside radius 28.5, K 0.5, automatic hits in the V10 die),
// and everything else is measured on the folded geometry: the piece's legs
// and arc, the panel's flange ends, and the piece standing in its corner —
// its free ends on the flange ends, its outside flush with the flanges'
// outsides, its inside on the face plate's cut-back. The kernel side (no
// interference on the kiosk, the check finding a piece pushed in) is
// kiosk.kernel.test.js.
import { describe, expect, it } from 'vitest';
import { CHORD_ERROR, bendArcPoint, foldSheet, multiplyMatrices, transformPoint } from './sheetMetal.js';
import { ROUND_CORNER, cornerPiece, flangedPanel, presetFace } from './panelMaker.js';
import { sequenceChecks } from './brakeStation.js';
import { machineOf } from './shopCatalog.js';

const PRESS = machineOf('brake-50-2000');
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const zAxis = (m) => [m[8], m[9], m[10]];
const clear = (fold) =>
  sequenceChecks({ fold, machine: PRESS }).map((c) => ({
    label: c.label,
    ok: !c.refusals.length && !c.collision,
    message: c.collision?.message || c.refusals[0]?.message || '',
  }));

describe('cornerPiece: the §13.5 table (SPCC t 1.5, depth 40, radius 30, leg 15)', () => {
  const piece = cornerPiece({ radius: 30, leg: 15, depth: 40, thickness: 1.5, stock: 'spcc' });
  const { fold } = piece;
  const bend = fold.bends[0];

  it('lays out the hand values: allowance, blank, automatic hits in the V10 die', () => {
    expect(piece.numbers.radius).toBe(28.5);
    expect(piece.numbers.kFactor).toBe(0.5);
    expect(piece.numbers.allowance).toBeCloseTo(45.94579, 5);
    expect(piece.report.blank.width).toBeCloseTo(75.94579, 5);
    expect(piece.report.blank.height).toBe(40);
    expect(piece.numbers.die).toBe('v10-88');
    expect([piece.numbers.steps, piece.numbers.stepAngle]).toEqual([10, 9]);
    expect(piece.numbers.pitch).toBeCloseTo(4.59458, 5);
    // One bend record: a round bend by bump hits, and the etched line carrying it.
    expect(piece.bends).toHaveLength(1);
    expect(piece.bends[0]).toMatchObject({ angle: 90, direction: 'up', radius: 28.5, steps: 10, punch: 'straight-88' });
    expect(bend.label).toBe('UP 90° R28.5 · 10 hits');
    expect(piece.marks).toHaveLength(1);
    expect(piece.marks[0].bend).toEqual({ angle: 90, direction: 'up', radius: 28.5, steps: 10 });
    expect(fold.warnings).toEqual([]);
  });

  it('folds to two straight 15 mm legs at 90° round an R30 outside: 45 × 45 × 40', () => {
    const root = fold.pieces.find((p) => p.id === fold.rootPiece);
    const moving = fold.pieces.find((p) => p.id === bend.movingPieces[0]);
    // The first leg stays flat (`base`): its outside (z = 0) runs x 0 … 15.
    expect(root.matrix).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const xs = root.outer.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(15, 5);
    // The second leg stands square: its outside in the plane x = 45, from z = 30 to 45.
    const out = moving.outer.map(([x, y]) => transformPoint(moving.matrix, [x, y, 0]));
    for (const p of out) expect(p[0]).toBeCloseTo(45, 5);
    const zs = out.map((p) => p[2]);
    expect(Math.min(...zs)).toBeCloseTo(30, 5);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(15, 5);
    expect(Math.abs(dot3(zAxis(root.matrix), zAxis(moving.matrix)))).toBeLessThan(1e-9);
    // The bend: outside R30, inside R28.5, about the line x = 15, z = 30.
    for (const fraction of [0, 0.13, 0.5, 0.77, 1])
      for (const [z, r] of [
        [0, 30],
        [1.5, 28.5],
      ]) {
        const p = bendArcPoint(bend, fold.thickness, bend.transform, 7, fraction, z);
        expect(Math.hypot(p[0] - 15, p[2] - 30)).toBeCloseTo(r, 6);
      }
    expect(piece.report.folded.size.map((v) => Number(v.toFixed(5)))).toEqual([45, 40, 45]);
  });

  it('passes the press brake’s sequence checks on the 50 t × 2 m press (§13.5 item 1)', () => {
    expect(clear(fold)).toEqual([{ label: 'UP 90° R28.5 · 10 hits', ok: true, message: '' }]);
    expect(piece.report.problems).toEqual([]);
  });

  it('refuses, by name, a corner it cannot make', () => {
    const base = { leg: 15, depth: 40, thickness: 1.5, stock: 'spcc' };
    expect(() => cornerPiece({ ...base, radius: 1.5 })).toThrow(/radius must be more than the sheet thickness/);
    // R3: 1.5 inside, below the R1.6 one hit in the V10 die forms.
    expect(() => cornerPiece({ ...base, radius: 3 })).toThrow(
      /^Corner piece: R3 is too tight for a corner piece: one hit in the V10 88° die already forms R1\.6 inside/,
    );
    expect(() => cornerPiece({ ...base, radius: 30, leg: 0 })).toThrow(/straight legs longer than zero/);
    expect(() => cornerPiece({ ...base, radius: 30, depth: 0 })).toThrow(/needs a width/);
  });
});

// A screen-housing-like panel: 600 × 800, 40 mm flanges on the bottom, the
// right and the top, its two right-hand corners round (corner k = face[k]).
const PANEL = {
  face: presetFace('rectangle', { width: 600, height: 800 }),
  thickness: 1.5,
  stock: 'spcc',
  flanges: [0, 1, 2].map((edge) => ({ edge, depth: 40, angle: 90, direction: 'up' })),
  rounds: [
    { corner: 1, radius: 30 },
    { corner: 2, radius: 30 },
  ],
};
const withDirection = (direction) => ({
  ...PANEL,
  flanges: PANEL.flanges.map((f) => ({ ...f, direction })),
});

// Measured on the folds: for each round corner, the corner and its two
// flanges (edge, the tab beside the corner, its end edge, its outside plane)
// and the corner piece in place (its pieces through the pose).
function corners(result, input) {
  const { fold } = result;
  const t = fold.thickness;
  const n = input.face.length;
  const zOut = input.flanges[0].direction === 'up' ? 0 : t;
  const piece = (fold, id) => fold.pieces.find((p) => p.id === id);
  const world = (m, pc, z) => pc.outer.map(([x, y]) => transformPoint(m, [x, y, z]));
  return result.cornerPieces.map((cp) => {
    const k = cp.corner;
    const flat = result.map.toFlat(input.face[k]);
    const P = [flat[0], flat[1], zOut];
    const flanges = [(k - 1 + n) % n, k].map((edge, i) => {
      const [A, B] = [input.face[edge], input.face[(edge + 1) % n]];
      const length = Math.hypot(B[0] - A[0], B[1] - A[1]);
      // Toward the corner along the edge (the first edge runs into it, the second away from it).
      const e = [((B[0] - A[0]) / length) * (i ? -1 : 1), ((B[1] - A[1]) / length) * (i ? -1 : 1), 0];
      const stroke = result.strokes.find((s) => s.kind === 'flange' && s.edge === edge);
      const tabs = stroke.bendIds
        .map((id) => fold.bends.find((b) => b.id === id))
        .map((b) => piece(fold, b.movingPieces[0]));
      // The tab beside the corner and how far its end stands from the sharp corner, along the edge.
      const measured = tabs.map((tab) => {
        const points = world(tab.matrix, tab, zOut);
        return { tab, points, end: Math.min(...points.map((p) => dot3(sub3(P, p), e))) };
      });
      const near = measured.reduce((best, m) => (m.end < best.end ? m : best));
      const normal = zAxis(near.tab.matrix);
      return { edge, e, ...near, plane: { point: near.points[0], normal } };
    });
    const cf = cp.piece.fold;
    const legs = [cf.rootPiece, ...cf.bends[0].movingPieces].map((id) => piece(cf, id));
    const placed = (pc, z) => world(multiplyMatrices(cp.pose, pc.matrix), pc, z);
    return { k, P, cp, flanges, legs, placed, bend: cf.bends[0], t };
  });
}

describe('flangedPanel with round corners (§13.3, §13.5 items 2 – 4)', () => {
  it.each(['up', 'down'])(
    'folds with flanges %s, passes the brake, and stops each flange 45 mm from its corner',
    (dir) => {
      const input = withDirection(dir);
      const result = flangedPanel(input);
      // foldSheet accepts the blank and the bends on their own; the brake takes every hit.
      expect(foldSheet(result.feature, result.profile).bends).toHaveLength(result.bends.length);
      expect(clear(result.fold).every((s) => s.ok)).toBe(true);
      expect(result.report.problems).toEqual([]);
      expect(result.fold.warnings).toEqual([]);
      expect(result.report.corners.map((c) => c.style)).toEqual([null, 'round', 'round', null]);
      expect(result.report.corners[1]).toMatchObject({ radius: 30, leg: ROUND_CORNER.leg });
      // The folded size is the face's and the flanges' as asked.
      expect(result.report.folded.size.map((v) => Number(v.toFixed(4)))).toEqual([600, 800, 40]);
      // One corner piece of one size, a pose per corner.
      expect(result.cornerPieces.map((c) => c.corner)).toEqual([1, 2]);
      expect(result.cornerPieces[0].piece).toBe(result.cornerPieces[1].piece);
      for (const c of corners(result, input)) for (const f of c.flanges) expect(f.end).toBeCloseTo(45, 6);
    },
  );

  it.each(['up', 'down'])(
    'stands each corner piece in its corner (flanges %s): ends on the flange ends, outside flush, inside on the face',
    (dir) => {
      const input = withDirection(dir);
      const result = flangedPanel(input);
      for (const c of corners(result, input)) {
        const t = c.t;
        // Each leg's free end: the outline segment farthest from its bend line, both faces.
        const fromBend = (p) => Math.abs((p[0] - c.bend.a[0]) * c.bend.n[0] + (p[1] - c.bend.a[1]) * c.bend.n[1]);
        const met = [];
        for (const leg of c.legs) {
          const far = Math.max(...leg.outer.map(fromBend));
          const endPoints = [0, t].flatMap((z) =>
            c.placed({ ...leg, outer: leg.outer.filter((p) => Math.abs(fromBend(p) - far) < 1e-6) }, z),
          );
          // The flange whose end it meets: its end face is the plane across the edge at `end` from P.
          const gaps = c.flanges.map((f) =>
            Math.max(...endPoints.map((p) => Math.abs(dot3(sub3(c.P, p), f.e) - f.end))),
          );
          const meets = c.flanges[gaps[0] < gaps[1] ? 0 : 1];
          met.push(meets.edge);
          // Within the fit-up gap (0.2): measured 0, the piece's end on the flange's end.
          expect(Math.min(...gaps)).toBeLessThan(1e-6);
          // Flush: the leg's outside (its own z = 0) in the flange's outside plane.
          for (const p of c.placed(leg, 0))
            expect(Math.abs(dot3(sub3(p, meets.plane.point), meets.plane.normal))).toBeLessThan(0.05);
          // The leg's inside (z = t) is t in from that plane, on the face's side.
          for (const p of c.placed(leg, t))
            expect(Math.abs(dot3(sub3(p, meets.plane.point), meets.plane.normal))).toBeCloseTo(t, 6);
        }
        // One leg on each flange.
        expect(met.sort()).toEqual(c.flanges.map((f) => f.edge).sort());
        // The arc: the outside on R30 about the corner's centre (R in from both outside planes), the inside on R28.5.
        const [a, b] = c.flanges;
        // The corner's centre: P moved R back along both edges (into the face).
        const centreAt = (z) => [c.P[0] - (a.e[0] + b.e[0]) * 30, c.P[1] - (a.e[1] + b.e[1]) * 30, z];
        const arcPoints = (z) =>
          [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((f) =>
            transformPoint(c.cp.pose, bendArcPoint(c.bend, t, c.bend.transform, 5, f, z)),
          );
        for (const [z, r] of [
          [0, 30],
          [t, 28.5],
        ])
          for (const p of arcPoints(z)) {
            const centre = centreAt(p[2]);
            expect(Math.hypot(p[0] - centre[0], p[1] - centre[1])).toBeCloseTo(r, 6);
          }
        // The strip is as deep as the flanges: from the face's outside to the flanges' tips.
        const heights = c.legs.flatMap((leg) => [0, t].flatMap((z) => c.placed(leg, z).map((p) => p[2])));
        const [lo, hi] = [Math.min(...heights), Math.max(...heights)];
        expect(hi - lo).toBeCloseTo(40, 6);
        expect(dir === 'up' ? lo : hi).toBeCloseTo(dir === 'up' ? 0 : t, 6);
        // The face plate in that corner: cut back by t along the legs and round the arc (R − t):
        // every outline point of the face near the corner lies on or inside the piece's inside.
        const root = result.fold.pieces.find((p) => p.id === result.fold.rootPiece);
        const centre = centreAt(0);
        const square = root.outer.filter(
          (p) => dot3(sub3(c.P, [...p, 0]), a.e) < 30 && dot3(sub3(c.P, [...p, 0]), b.e) < 30,
        );
        expect(square.length).toBeGreaterThan(8);
        const radii = square.map((p) => Math.hypot(p[0] - centre[0], p[1] - centre[1]));
        expect(Math.max(...radii)).toBeLessThanOrEqual(28.5 + 1e-6);
        // Its vertices on the circle, the chords between them within CHORD_ERROR of it.
        expect(Math.min(...radii)).toBeGreaterThan(28.5 - 1e-6);
        for (let i = 0; i + 1 < square.length; i++) {
          const m = [(square[i][0] + square[i + 1][0]) / 2, (square[i][1] + square[i + 1][1]) / 2];
          if (Math.hypot(square[i][0] - square[i + 1][0], square[i][1] - square[i + 1][1]) > 20) continue;
          expect(28.5 - Math.hypot(m[0] - centre[0], m[1] - centre[1])).toBeLessThanOrEqual(CHORD_ERROR + 1e-9);
        }
      }
    },
  );

  it('lays out a panel with no round corner exactly as before (§13.5 item 4)', () => {
    const square = { ...PANEL, rounds: undefined };
    const strip = ({ map: _map, ...rest }) => rest;
    expect(JSON.stringify(strip(flangedPanel({ ...square, rounds: [] })))).toBe(
      JSON.stringify(strip(flangedPanel(square))),
    );
    const result = flangedPanel(square);
    expect(result.cornerPieces).toEqual([]);
    expect(result.report.corners.map((c) => c.style)).toEqual([null, 'closed', 'closed', null]);
    // A round corner leaves the panel's other corners as they were: one round, one closed.
    const one = flangedPanel({ ...PANEL, rounds: [{ corner: 1, radius: 30 }] });
    expect(one.report.corners.map((c) => c.style)).toEqual([null, 'round', 'closed', null]);
    expect(one.report.problems).toEqual([]);
  });

  it('refuses, by name, a round corner it cannot make', () => {
    const at =
      (rounds, extra = {}) =>
      () =>
        flangedPanel({ ...PANEL, ...extra, rounds });
    expect(at([{ corner: 0, radius: 30 }])).toThrow(
      /^Corner 1 \(between edges 4 and 1\): a round corner needs a flange on both edges\./,
    );
    expect(at([{ corner: 7, radius: 30 }])).toThrow(/^Round corner 1: there is no corner 8\./);
    expect(
      at([
        { corner: 1, radius: 30 },
        { corner: 1, radius: 20 },
      ]),
    ).toThrow(/^Corner 2 is rounded twice/);
    expect(at([{ corner: 1, radius: 2 }])).toThrow(/^Corner 2: R2 is too tight for a corner piece/);
    expect(
      at([{ corner: 1, radius: 30 }], {
        flanges: [
          { edge: 0, depth: 40 },
          { edge: 1, depth: 30 },
        ],
      }),
    ).toThrow(/a round corner needs both flanges the same depth \(they are 40 and 30 mm\)/);
    expect(
      at([{ corner: 1, radius: 30 }], {
        flanges: [
          { edge: 0, depth: 40 },
          { edge: 1, depth: 40, direction: 'down' },
        ],
      }),
    ).toThrow(/a round corner needs both flanges bent the same way/);
    // A corner that is not square (a trapezoid's).
    const trapezoid = presetFace('trapezoid', { bottom: 600, top: 400, height: 400 });
    expect(
      at([{ corner: 1, radius: 30 }], {
        face: trapezoid,
        flanges: [0, 1].map((edge) => ({ edge, depth: 30 })),
      }),
    ).toThrow(/^Corner 2 \(between edges 1 and 2\) is \d+(\.\d+)?°: a round corner needs a square \(90°\) corner\./);
    // Two corners eating one short edge.
    expect(
      at(
        [
          { corner: 1, radius: 60, leg: 30 },
          { corner: 2, radius: 60, leg: 30 },
        ],
        { face: presetFace('rectangle', { width: 600, height: 150 }) },
      ),
    ).toThrow(/^The flange on edge 2 is too short for its round corners/);
    // A window into the arc, a crease through the corner piece.
    // (590, 790) is clear of both flanges' bends but 28.3 mm from the arc's centre (570, 770).
    expect(at(PANEL.rounds, { windows: [{ type: 'circle', x: 590, y: 790, diameter: 4 }] })).toThrow(
      /^Window 1 runs into the round corner at corner 3: keep it 3 mm inside the arc\./,
    );
    expect(() => flangedPanel({ ...PANEL, windows: [{ type: 'circle', x: 580, y: 760, diameter: 4 }] })).not.toThrow();
    expect(at(PANEL.rounds, { creases: [{ a: [0, 770], b: [600, 770], angle: 10, direction: 'down' }] })).toThrow(
      /^Crease 1 crosses the flange on edge 2 too near corner 3/,
    );
  });
});
