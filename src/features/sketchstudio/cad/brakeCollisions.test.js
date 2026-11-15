// Collisions on the press brake (docs/sketch-studio-fab-shop.md §9 SM-2 item 7):
// a clean L; U channels whose first flange swings back over the punch (clear
// of the punch holders at 45 mm, into them at 130, over them into the ram at
// 160; shop floor §6.2); a box whose end flange's
// corner ears fold into the side flanges (the part hitting itself, beside a
// punch set up to the bend's length); the sampling cost of a 6-bend part.
import { describe, expect, it } from 'vitest';
import { foldSheet, poseFold, transformPoint } from './sheetMetal.js';
import { brakeFrame } from './pressBrake.js';
import {
  brakeCollisions,
  partSection,
  partSurface,
  polygonsOverlap,
  toolingSections,
  triangulateRing,
  triangulateWithHoles,
  trianglesCross,
} from './brakeCollisions.js';
import { dieOf, machineOf, punchOf } from './shopCatalog.js';

const rect = (width, height) => ({ type: 'rectangle', width, height, origin: [0, 0] });
const sheet = (bends, thickness = 1.5) => ({
  id: 'sm',
  type: 'sheetmetal',
  sketchId: 's',
  thickness,
  stock: 'spcc',
  kFactor: null,
  base: null,
  bends: bends.map((bend, i) => ({ id: `b${i + 1}`, angle: 90, direction: 'up', radius: null, ...bend })),
});
const check = (fold, bendId, extra = {}) =>
  brakeCollisions({ fold, bendId, machine: machineOf('brake-50-2000'), punch: 'straight-88', ...extra });

describe('geometry helpers', () => {
  it('triangulates a concave L outline into its area', () => {
    const ring = [
      [0, 0],
      [100, 0],
      [100, 30],
      [40, 30],
      [40, 70],
      [0, 70],
    ];
    const triangles = triangulateRing(ring);
    const area = triangles.reduce(
      (sum, [a, b, c]) => sum + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2,
      0,
    );
    expect(triangles).toHaveLength(4);
    expect(area).toBeCloseTo(100 * 30 + 40 * 40, 9);
  });
  it('triangulates a plate with two windows into its area, the windows open', () => {
    const outer = [
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ];
    const hole = (x, y) => [
      [x, y],
      [x, y + 20],
      [x + 30, y + 20],
      [x + 30, y],
    ];
    const triangles = triangulateWithHoles(outer, [hole(10, 20), hole(60, 20)]);
    const area = triangles.reduce(
      (sum, [a, b, c]) => sum + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2,
      0,
    );
    expect(area).toBeCloseTo(6000 - 2 * 600, 6);
    // No triangle covers a window's middle.
    const inside = ([x, y], [a, b, c]) => {
      const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      return d(a, b, [x, y]) > 0 && d(b, c, [x, y]) > 0 && d(c, a, [x, y]) > 0;
    };
    expect(triangles.some((tri) => inside([25, 30], tri) || inside([75, 30], tri))).toBe(false);
  });
  it('tells crossing triangles and overlapping sections from touching ones', () => {
    const flat = [
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
    ];
    expect(
      trianglesCross(flat, [
        [2, 2, -1],
        [2, 2, 1],
        [3, 3, 1],
      ]),
    ).toBe(true);
    expect(
      trianglesCross(flat, [
        [2, 2, 0.5],
        [2, 2, 1],
        [3, 3, 1],
      ]),
    ).toBe(false);
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(
      polygonsOverlap(
        [
          [5, -5],
          [5, 15],
        ],
        square,
      ),
    ).toBe(true);
    expect(
      polygonsOverlap(
        [
          [10, 0],
          [10, 10],
        ],
        square,
      ),
    ).toBe(false);
    expect(
      polygonsOverlap(
        [
          [2, 2],
          [3, 2],
          [2, 3],
        ],
        square,
      ),
    ).toBe(true);
  });
  it('sets the punch, its holders and the die up in sections, the ram above the holders, the bed to the bed', () => {
    // Shop floor §6.2: sectional tooling over the stroke's runs; the full-length
    // ram stands on the 100 mm punch holders (before SF-3 it sat on the punch,
    // and the die ran the bed's length).
    const tools = toolingSections({
      machine: machineOf('brake-50-2000'),
      punch: punchOf('straight-88'),
      die: dieOf('v10-88'),
      tipZ: 1.5,
      span: [-30, 30],
      ranges: [
        [-30, -5],
        [5, 30],
      ],
    });
    expect(tools.punch.ranges).toEqual([
      [-30, -5],
      [5, 30],
    ]);
    expect(tools.die.ranges).toEqual(tools.punch.ranges);
    expect(tools.holder.ranges).toEqual(tools.punch.ranges);
    expect(tools.punch.x).toEqual([-30, 30]);
    expect(tools.ram.x).toEqual([-1045, 1045]);
    expect(tools.bed.x).toEqual([-1045, 1045]);
    expect(Math.min(...tools.punch.ring.map((p) => p[1]))).toBeCloseTo(1.5, 9);
    expect(Math.min(...tools.holder.ring.map((p) => p[1]))).toBeCloseTo(1.5 + 66.5, 9);
    expect(Math.min(...tools.ram.ring.map((p) => p[1]))).toBeCloseTo(1.5 + 66.5 + 100, 9);
    expect(Math.max(...tools.die.ring.map((p) => p[1]))).toBe(0);
  });
});

describe('brakeCollisions', () => {
  it('passes a clean L through the whole stroke', () => {
    const fold = foldSheet(sheet([{ a: [20, -1], b: [20, 61] }]), rect(100, 60));
    const result = check(fold, 'b1', { gaugePoint: [0, 30] });
    expect(result.hit).toBeNull();
    // The approach, 24 samples through the bend and the return.
    expect(result.samples).toBe(26);
  });

  // U channel: a 45 flange, a 70 web, a 20 flange; the first bend made, the
  // second gauged off the short flange so the web and the tall flange lie in
  // front of the die. Rising, the tall flange swings back over the punch.
  // Before SF-3 it hit the ram (which sat on the punch) between 60° and 90°;
  // with the punch on its 100 mm holders it clears (shop floor §6.2). Deeper
  // flanges still meet the holders, then the ram.
  const channel = foldSheet(
    sheet([
      { a: [45, -1], b: [45, 61] },
      { a: [115, -1], b: [115, 61] },
    ]),
    rect(135, 60),
  );
  const deepChannel = (flange) =>
    foldSheet(
      sheet([
        { a: [flange, -1], b: [flange, 61] },
        { a: [flange + 70, -1], b: [flange + 70, 61] },
      ]),
      rect(flange + 90, 60),
    );
  it('a U channel’s 45 mm flange clears the punch holders, on the straight punch and the gooseneck', () => {
    expect(check(channel, 'b2', { gaugePoint: [135, 30] }).hit).toBeNull();
    expect(check(channel, 'b2', { gaugePoint: [135, 30], punch: 'gooseneck-88' }).hit).toBeNull();
  });
  it('a 130 mm flange swings into the punch holders', () => {
    const { hit } = check(deepChannel(130), 'b2', { gaugePoint: [220, 30] });
    expect(hit).toMatchObject({ tool: 'holder', phase: 'bend' });
    expect(hit.angle).toBeGreaterThan(30);
    expect(hit.angle).toBeLessThan(60);
    expect(hit.triangles.length).toBeGreaterThan(0);
    expect(hit.message).toMatch(
      /^Bend 2: the part hits the punch holder at \d+(\.\d)?°\. Bend this one earlier \(before the flange that swings over the punch\), or use the tall straight punch: it holds the clamps higher\.$/,
    );
  });
  it('a 160 mm flange reaches over the holders into the ram', () => {
    const { hit } = check(deepChannel(160), 'b2', { gaugePoint: [250, 30] });
    expect(hit).toMatchObject({ tool: 'ram', phase: 'bend' });
    // Brake tool length §3.6: the general advice no longer promises the gooseneck.
    expect(hit.message).toMatch(
      /^Bend 2: the part hits the ram at \d+(\.\d)?°\. Bend this one earlier, or use a taller punch: it holds the ram higher\.$/,
    );
  });
  it('cuts the rest of the part for the side view: what earlier bends made, not the pieces beside the bend', () => {
    const surface = partSurface(channel);
    const posed = poseFold(channel, { b2: 40 });
    const frame = brakeFrame(posed, 'b2', { die: dieOf('v10-88'), gaugePoint: [135, 30] });
    const segments = partSection({ surface, posed, frame, bendId: 'b2', x: 0 });
    expect(segments.length).toBeGreaterThan(8);
    // The 45 flange's free edge (flat x 0) at mid-thickness, as the 3D scene places it, ends a segment.
    const flange = posed.pieces.find((p) => p.outer.some(([x]) => x === 0));
    const [, y, z] = transformPoint(frame.matrix, transformPoint(flange.matrix, [0, 30, 0.75]));
    const ends = segments.flat();
    expect(Math.min(...ends.map((p) => Math.hypot(p[0] - y, p[1] - z)))).toBeLessThan(1e-6);
    // Nothing of the web or the short flange (beside b2): every point is beyond bend 1's zone start.
    const web = posed.pieces.find((p) => p.centroid[0] > 60 && p.centroid[0] < 100);
    const [, wy, wz] = transformPoint(frame.matrix, transformPoint(web.matrix, [80, 30, 0.75]));
    expect(Math.min(...ends.map((p) => Math.hypot(p[0] - wy, p[1] - wz)))).toBeGreaterThan(10);
    // An L has nothing but the two pieces beside its one bend.
    const ell = foldSheet(sheet([{ a: [20, -1], b: [20, 61] }]), rect(100, 60));
    const ellPosed = poseFold(ell, { b1: 45 });
    const ellFrame = brakeFrame(ellPosed, 'b1', { die: dieOf('v10-88') });
    expect(partSection({ surface: partSurface(ell), posed: ellPosed, frame: ellFrame, bendId: 'b1' })).toEqual([]);
  });

  // A box end: a 60 × 60 base whose side flanges (front and back) are already
  // up; the left flange carries corner ears 8 mm past the base each way and is
  // folded to 110° with the acute tooling. The ears, beside the punch (set to
  // the 52 mm bend), fold into the side flanges.
  const box = {
    type: 'polygon',
    // Front and back flanges 24…76, the base 20…80 with its left corners
    // relieved (4 × 4), the left flange 0…20 with its ears at y 16…24 and 76…84.
    points: [
      [24, 0],
      [76, 0],
      [76, 20],
      [80, 20],
      [80, 80],
      [76, 80],
      [76, 100],
      [24, 100],
      [24, 76],
      [20, 76],
      [20, 84],
      [0, 84],
      [0, 16],
      [20, 16],
      [20, 24],
      [24, 24],
    ],
  };
  const boxFold = foldSheet(
    sheet(
      [
        { a: [22, 22], b: [80, 22], direction: 'up', die: 'v8-30', punch: 'acute-30' },
        { a: [80, 78], b: [22, 78], direction: 'up', die: 'v8-30', punch: 'acute-30' },
        { a: [22, 76], b: [22, 24], angle: 110, direction: 'up', die: 'v8-30', punch: 'acute-30' },
      ],
      1,
    ),
    box,
  );
  it('a box end’s corner ears fold into the side flanges: the part hits itself', () => {
    const { hit } = check(boxFold, 'b3', { punch: 'acute-30', die: 'v8-30' });
    expect(hit).toMatchObject({ tool: 'self', phase: 'bend' });
    expect(hit.angle).toBeGreaterThan(80);
    expect(hit.angle).toBeLessThan(110);
    expect(hit.message).toMatch(
      /^Bend 3: the part hits the part itself at [\d.]+°\. Bend this one earlier, or less far/,
    );
    // Folded only to 80°, the ears stay clear.
    expect(check(boxFold, 'b3', { punch: 'acute-30', die: 'v8-30', target: 80 }).hit).toBeNull();
  });

  // A tab cut free on three sides in the middle of a plate (a U slot), bent up
  // through its own window. Before SF-3 the collision mesh closed the window
  // and the full-length die met it at 5.9°; with cut-outs open and the die set
  // up under the tab only, it clears, as on the machine.
  it('a tab in the middle of a plate bends up through its own window', () => {
    const slot = {
      type: 'polygon',
      points: [
        [78, 100],
        [80, 100],
        [80, 148],
        [120, 148],
        [120, 100],
        [122, 100],
        [122, 150],
        [78, 150],
      ],
    };
    const fold = foldSheet(
      { ...sheet([{ a: [79.5, 104], b: [120.5, 104] }]), base: [100, 20] },
      { type: 'rectangle', width: 200, height: 200, origin: [0, 0], holes: [slot] },
    );
    expect(check(fold, 'b1').hit).toBeNull();
  });

  it('samples a 6-bend part quickly enough to run on every pick', () => {
    const six = foldSheet(
      sheet([20, 50, 90, 150, 190, 220].map((x, i) => ({ a: [x, -1], b: [x, 81], direction: i % 2 ? 'down' : 'up' }))),
      rect(240, 80),
    );
    let best = Infinity;
    for (let run = 0; run < 3; run++) best = Math.min(best, check(six, 'b6', { gaugePoint: [240, 40] }).ms);
    console.warn(`brakeCollisions, 6-bend part: ${best.toFixed(1)} ms`);
    expect(best).toBeLessThan(100);
  });
});
