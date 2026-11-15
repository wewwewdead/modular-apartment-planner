// The press brake station's maths (docs/sketch-studio-fab-shop.md §9 SM-2):
// gauge edges and the backgauge reading, every refusal with its remedy, the
// symmetric pose on the die shoulders and the stroke's timeline.
import { describe, expect, it } from 'vitest';
import { bendNumbers, foldSheet, poseFold, transformPoint } from './sheetMetal.js';
import {
  MACHINES,
  dieOf,
  machineOf,
  punchOf,
  ramDepth,
  shoulderOffset,
  springback,
  stockOf,
  tonnage,
} from './shopCatalog.js';
import {
  STROKE_GAP,
  assessBend,
  brakeFrame,
  brakeHit,
  gaugeBendLine,
  gaugeEdges,
  gaugeReading,
  SIDE_VIEW_ASPECT,
  flatFrame,
  restHeight,
  sheetSection,
  sideViewWindow,
  strokeAt,
  strokeTimeline,
  trimAtBreaks,
} from './pressBrake.js';

const rect = (width, height) => ({ type: 'rectangle', width, height, origin: [0, 0] });
const blank = (extra = {}) => ({
  id: 'sm',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: 1.5,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends: [],
  ...extra,
});
const hit = (bend, { feature = blank(), profile = rect(100, 60), machine = 'brake-50-2000', gauge = null } = {}) =>
  brakeHit({
    feature,
    profile,
    bend: { id: 'hit', angle: 90, direction: 'up', radius: null, punch: 'straight-88', ...bend },
    machine,
    gauge,
  });
const codes = (result) => result.refusals.map((r) => r.code);

describe('gauge edges', () => {
  it('finds the four sides of a rectangle with their inward normals, counter-clockwise from the origin', () => {
    const edges = gaugeEdges([
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ]);
    expect(edges.map((e) => [e.a, e.b, e.length])).toEqual([
      [[0, 0], [100, 0], 100],
      [[100, 0], [100, 60], 60],
      [[100, 60], [0, 60], 100],
      [[0, 60], [0, 0], 60],
    ]);
    expect(edges.map((e) => e.inward.map((v) => v + 0))).toEqual([
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 0],
    ]);
  });
  it('merges a split side and leaves the chords of a rounded corner out', () => {
    // A side split in two, and a quarter round of R10 sampled into chords.
    const ring = [
      [0, 0],
      [50, 0],
      [100, 0],
      [100, 50],
    ];
    for (let i = 1; i < 12; i++) {
      const a = (Math.PI / 2) * (i / 12);
      ring.push([90 + 10 * Math.cos(a), 50 + 10 * Math.sin(a)]);
    }
    ring.push([90, 60], [0, 60]);
    const edges = gaugeEdges(ring);
    expect(edges.map((e) => Math.round(e.length))).toEqual([100, 50, 90, 60]);
  });
  it('runs the punch line across the whole blank, parallel to the gauge edge and L in from it', () => {
    const outer = [
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ];
    const [, right] = gaugeEdges(outer);
    const line = gaugeBendLine(outer, right, 25);
    expect(line.a[0]).toBeCloseTo(75, 9);
    expect(line.b[0]).toBeCloseTo(75, 9);
    expect(Math.min(line.a[1], line.b[1])).toBeLessThan(0);
    expect(Math.max(line.a[1], line.b[1])).toBeGreaterThan(60);
  });
  it('reads L only when the gauge edge lies on a flat face beside the bend', () => {
    const outer = [
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ];
    const edges = gaugeEdges(outer);
    const left = edges[3];
    // A bend already made at x = 20: gauging x = 50 off the left edge is not a straight gauge.
    const feature = blank({ bends: [{ id: 'b1', a: [20, 0], b: [20, 60], angle: 90, direction: 'up' }] });
    const near = foldSheet(
      { ...feature, bends: [{ id: 'p', ...gaugeBendLine(outer, left, 10), angle: 90, direction: 'up' }] },
      rect(100, 60),
    );
    expect(gaugeReading(near, 'p', left).distance).toBeCloseTo(10, 9);
    const far = foldSheet(
      {
        ...feature,
        bends: [...feature.bends, { id: 'p', ...gaugeBendLine(outer, left, 50), angle: 90, direction: 'up' }],
      },
      rect(100, 60),
    );
    expect(gaugeReading(far, 'p', left)).toMatchObject({ distance: null });
    expect(gaugeReading(far, 'p', left).reason).toMatch(/another bend/);
    // The right edge is on the face beside the new bend: L = 50.
    expect(gaugeReading(far, 'p', edges[1]).distance).toBeCloseTo(50, 9);
    // A gauge edge not parallel to the punch line.
    expect(gaugeReading(far, 'p', edges[0]).reason).toMatch(/not parallel/);
  });
});

describe('the hit and its refusals', () => {
  it('reads out the numbers for 1.5 SPCC on the automatic V10 die', () => {
    const result = hit({ a: [20, -1], b: [20, 61] }, { gauge: { distance: 20 } });
    expect(result.refusals).toEqual([]);
    expect(result.die.key).toBe('v10-88');
    expect(result.dieAuto).toBe(true);
    const numbers = bendNumbers({ thickness: 1.5, stock: 'spcc', angle: 90 });
    const stock = stockOf('spcc');
    const sb = springback(stock, 90, numbers.radius, 1.5);
    expect(result.readouts).toMatchObject({
      radius: numbers.radius,
      allowance: numbers.allowance,
      deduction: numbers.deduction,
      length: 60,
      capacity: 500,
      springback: sb,
      bendTo: 90 + sb,
    });
    expect(result.readouts.tonnage).toBeCloseTo(tonnage(stock, 1.5, 60, dieOf('v10-88')), 9);
    expect(result.readouts.tonnage).toBeCloseTo((1.42 * 330 * 2.25 * 60) / 10000, 9);
    expect(result.readouts.toolingLimit).toBeCloseTo(60, 9);
    expect(result.readouts.ramDepth).toBeCloseTo(
      ramDepth({ v: 10, thickness: 1.5, radius: 1.6, angle: 90, springback: sb, shoulderRadius: 1.2, dieAngle: 88 }),
      9,
    );
  });
  it('refuses an angle beyond the die, naming the acute die and punch', () => {
    const result = hit({ a: [20, -1], b: [20, 61], angle: 120 });
    expect(codes(result)).toEqual(['angle']);
    expect(result.refusals[0].message).toBe(
      'The V10 88° die bends to at most 92° (180° − its 88° V). For 120° fit an acute 30° die (V8, V12 or V16) and the acute punch.',
    );
    // The acute tooling takes it.
    expect(codes(hit({ a: [20, -1], b: [20, 61], angle: 120, die: 'v12-30', punch: 'acute-30' }))).toEqual([]);
  });
  it('refuses a punch blunter than its die', () => {
    expect(codes(hit({ a: [20, -1], b: [20, 61], die: 'v12-30' }))).toEqual(['punch-angle']);
  });
  it('refuses a flange shorter than the die minimum, naming the die that fits', () => {
    const result = hit({ a: [6, -1], b: [6, 61] });
    expect(codes(result)).toEqual(['short-leg']);
    expect(result.refusals[0].message).toMatch(
      /^The flange is 6 mm from the punch line in the flat; the V10 88° die needs 8\.27 mm to carry it on both shoulders\. Use the V6 88° die or smaller, or cut the blank larger\.$/,
    );
    expect(codes(hit({ a: [6, -1], b: [6, 61], die: 'v6-88' }))).toEqual([]);
    // The remedy is one field: the station's card applies it (shop floor §4.6).
    expect(result.refusals[0].fix).toEqual({ label: 'Use the V6 88° die', session: { die: 'v6-88' } });
  });
  it('says in one sentence how much larger to cut the blank when no die is small enough', () => {
    const result = hit({ a: [3, -1], b: [3, 61] });
    expect(codes(result)).toEqual(['short-leg']);
    expect(result.refusals[0].message).toBe(
      'The flange is 3 mm from the punch line in the flat; the V10 88° die needs 8.27 mm to carry it on both shoulders. No catalogue die is small enough: cut the blank larger, so the flange is at least 5.04 mm from the punch line, and use the V6 88° die.',
    );
    // No one field cures it: the card keeps its text only.
    expect(result.refusals[0].fix).toBeUndefined();
  });
  it('refuses more force than the press gives, naming a wider die and a bigger press', () => {
    // 3.2 SPCC over 1.9 m in a V16: 1.42 · 330 · 3.2² · 1900 / 16000 = 570 kN > 500 kN.
    const feature = blank({ thickness: 3.2 });
    const result = hit({ a: [100, -1], b: [100, 1901], die: 'v16-88' }, { feature, profile: rect(200, 1900) });
    expect(codes(result)).toEqual(['tonnage']);
    expect(result.readouts.tonnage).toBeCloseTo((1.42 * 330 * 3.2 * 3.2 * 1900) / 16000, 9);
    expect(result.refusals[0].message).toBe(
      'This hit needs 569.82 kN; the 50 t × 2 m press brake gives 500 kN. A wider die lowers the force (the V20 88° die needs 455.85 kN), or use the 80 t × 2.5 m press brake.',
    );
    expect(result.refusals[0].fix).toEqual({ label: 'Use the V20 88° die', session: { die: 'v20-88' } });
    expect(
      codes(
        hit(
          { a: [100, -1], b: [100, 1901], die: 'v16-88' },
          { feature, profile: rect(200, 1900), machine: 'brake-80-2500' },
        ),
      ),
    ).toEqual([]);
  });
  it('refuses more force than the tooling is rated for', () => {
    // 4 mm in the 30° V16 (400 kN/m) over 1 m: 469 kN against 400 kN.
    const feature = blank({ thickness: 4 });
    const result = hit(
      { a: [100, -1], b: [100, 1001], die: 'v16-30', punch: 'acute-30' },
      { feature, profile: rect(200, 1000) },
    );
    expect(codes(result)).toEqual(['tooling-load']);
    expect(result.refusals[0].message).toMatch(
      /^This hit needs 468\.6\d? kN; the Acute 30° punch is rated 400 kN\/m|^This hit needs 468\.6\d? kN; the V16 30° die is rated 400 kN\/m/,
    );
  });
  it('refuses a bend longer than the bed, and a backgauge reading out of its reach', () => {
    const long = hit({ a: [20, -1], b: [20, 2201] }, { profile: rect(100, 2200), machine: 'brake-50-2000' });
    expect(codes(long)).toContain('bed');
    expect(long.refusals.find((r) => r.code === 'bed').message).toBe(
      'The bend runs 2200 mm; the bed of the 50 t × 2 m press brake is 2090 mm. Use the 80 t × 2.5 m press brake.',
    );
    const far = hit({ a: [650, -1], b: [650, 61] }, { profile: rect(1000, 60), gauge: { distance: 650 } });
    expect(codes(far)).toEqual(['backgauge']);
    expect(far.refusals[0].message).toMatch(/reaches 5–600 mm from the punch line; L 650 mm is out of its reach/);
  });
  it('warns, with the remedy, when the thickness is beyond the automatic die catalogue', () => {
    const result = hit({ a: [60, -1], b: [60, 61] }, { feature: blank({ thickness: 4 }), profile: rect(200, 60) });
    expect(result.die.key).toBe('v25-88');
    expect(result.warnings.map((w) => w.code)).toContain('die-range');
    expect(result.warnings.find((w) => w.code === 'die-range').message).toBe(
      't 4 mm wants a V ≥ 32 mm die; the widest in the catalogue is the V25 88° die, so the radius comes out tighter and the force higher than this sheet should take. Use thinner stock, or choose the die by hand to accept it.',
    );
    // Chosen by hand, it is the operator's call.
    expect(
      hit(
        { a: [60, -1], b: [60, 61], die: 'v25-88' },
        { feature: blank({ thickness: 4 }), profile: rect(200, 60) },
      ).warnings.map((w) => w.code),
    ).not.toContain('die-range');
  });
  it('names the hit in the fold’s own errors', () => {
    expect(hit({ a: [200, 0], b: [200, 60] }).error).toBe('This hit: the punch line misses the blank.');
  });
  it('checks a bend already in the sequence with its own tooling', () => {
    const fold = foldSheet(
      blank({ bends: [{ id: 'b1', a: [20, 0], b: [20, 60], angle: 120, direction: 'up', die: 'v10-88' }] }),
      rect(100, 60),
    );
    expect(codes(assessBend(fold, 'b1', { machine: 'brake-50-2000' }))).toEqual(['angle']);
  });
});

describe('the pose in the machine', () => {
  const die = dieOf('v10-88');
  const outer = [
    [0, 0],
    [100, 0],
    [100, 60],
    [0, 60],
  ];
  const right = gaugeEdges(outer)[1];
  const feature = (direction = 'up', angle = 90) =>
    blank({ bends: [{ id: 'p', ...gaugeBendLine(outer, right, 30), angle, direction }] });
  const frameAt = (angle, direction = 'up', gaugePoint = [100, 30]) => {
    const posed = poseFold(foldSheet(feature(direction), rect(100, 60)), { p: angle });
    return { posed, frame: brakeFrame(posed, 'p', { die, gaugePoint }) };
  };
  // A flat point on the blank's bottom (z 0) or top (z t), in the machine.
  // (A point in the bend zone is only asked for flat, where every piece is unmoved.)
  const at = ({ posed, frame }, [x, y], z) => {
    const piece = posed.pieces.find((p) => {
      const xs = p.outer.map((q) => q[0]);
      return x > Math.min(...xs) && x < Math.max(...xs);
    });
    return transformPoint(frame.matrix, piece ? transformPoint(piece.matrix, [x, y, z]) : [x, y, z]);
  };
  it('lays the flat blank on the die: punch line over the V, gauge edge L behind, top face up', () => {
    const pose = frameAt(0);
    expect(pose.frame.tipZ).toBe(1.5);
    // The punch line (x = 70) on Y = 0, the gauge edge (x = 100) at Y = +30, bottom on the die top.
    const line = at(pose, [70, 30], 0),
      edge = at(pose, [100, 30], 0),
      top = at(pose, [0, 30], 1.5);
    expect(line.map((v) => +v.toFixed(9) + 0)).toEqual([0, 0, 0]);
    expect(edge[1]).toBeCloseTo(30, 9);
    expect(edge[2]).toBeCloseTo(0, 9);
    expect(top[1]).toBeCloseTo(-70, 9);
    expect(top[2]).toBeCloseTo(1.5, 9);
  });
  it('raises both wings by half the angle, the outer surface tangent to both die shoulders', () => {
    const pose = frameAt(90);
    const c = shoulderOffset(die),
      rd = die.shoulderRadius;
    for (const [x, side] of [
      [10, -1],
      [95, 1],
    ]) {
      // Two points of each wing's outer surface (z 0): its line rises at 45°.
      const p = at(pose, [x, 30], 0),
        q = at(pose, [x + side * 2, 30], 0);
      expect(Math.atan2(q[2] - p[2], Math.abs(q[1] - p[1])) * (180 / Math.PI)).toBeCloseTo(45, 9);
      // Distance from the shoulder centre (±c, −Rd) to that line = Rd: resting on it.
      const d = [q[1] - p[1], q[2] - p[2]];
      const length = Math.hypot(...d);
      const distance = Math.abs(d[0] * (-rd - p[2]) - d[1] * (side * c - p[1])) / length;
      expect(distance).toBeCloseTo(rd, 6);
    }
    // The punch tip sits on the inside of the bend: t − ram depth (no springback).
    const numbers = bendNumbers({ thickness: 1.5, stock: 'spcc', angle: 90 });
    expect(pose.frame.tipZ).toBeCloseTo(
      1.5 - ramDepth({ v: 10, thickness: 1.5, radius: numbers.radius, angle: 90, shoulderRadius: 1.2, dieAngle: 88 }),
      9,
    );
    expect(restHeight(numbers.radius + 1.5, die, Math.PI / 4)).toBeCloseTo(pose.frame.centre, 9);
  });
  it('is continuous from the flat: a hair of angle moves nothing visibly', () => {
    const flat = frameAt(0),
      started = frameAt(1e-4);
    for (const point of [
      [10, 10],
      [95, 50],
    ])
      at(started, point, 0).forEach((v, i) => expect(Math.abs(v - at(flat, point, 0)[i])).toBeLessThan(1e-3));
  });
  it('turns the sheet over for a down bend (the machine always bends up)', () => {
    const pose = frameAt(0, 'down');
    // The blank's top face now rests on the die; its bottom faces the punch.
    expect(at(pose, [10, 30], 1.5)[2]).toBeCloseTo(0, 9);
    expect(at(pose, [10, 30], 0)[2]).toBeCloseTo(1.5, 9);
    // At 90° the wings still rise.
    const bent = frameAt(90, 'down');
    expect(at(bent, [5, 30], 0)[2]).toBeGreaterThan(40);
    expect(at(bent, [99, 30], 0)[2]).toBeGreaterThan(15);
  });
  it('puts the gauge side back, or the shorter flat leg without a gauge', () => {
    expect(at(frameAt(0), [100, 30], 0)[1]).toBeCloseTo(30, 9);
    expect(at(frameAt(0, 'up', [0, 30]), [100, 30], 0)[1]).toBeCloseTo(-30, 9);
    expect(at(frameAt(0, 'up', null), [100, 30], 0)[1]).toBeCloseTo(30, 9);
  });
});

describe('the stroke', () => {
  it('runs ≈ 1.2 s for 1.5 mm steel at the machine speeds', () => {
    const depth = ramDepth({ v: 10, thickness: 1.5, radius: 1.6, angle: 91.1, shoulderRadius: 1.2, dieAngle: 88 });
    const timeline = strokeTimeline(machineOf('brake-50-2000'), depth);
    expect(timeline.approach).toBeCloseTo((STROKE_GAP / 100) * 1000, 9);
    expect(timeline.bend).toBeCloseTo(Math.max(350, (depth / 10) * 1000), 9);
    expect(timeline.return).toBeCloseTo(((STROKE_GAP + depth) / 100) * 1000, 9);
    expect(timeline.total).toBeGreaterThan(1100);
    expect(timeline.total).toBeLessThan(1300);
  });
  it('approaches, bends from 0 to the target and returns', () => {
    const timeline = strokeTimeline(MACHINES['brake-50-2000'], 3.9);
    expect(strokeAt(timeline, 0, 90)).toEqual({ phase: 'approach', angle: 0, ram: 1, done: false });
    expect(strokeAt(timeline, timeline.approach + timeline.bend / 2, 90)).toMatchObject({ phase: 'bend', angle: 45 });
    expect(strokeAt(timeline, timeline.approach + timeline.bend + 1, 90)).toMatchObject({ phase: 'return', angle: 90 });
    expect(strokeAt(timeline, timeline.total, 90)).toEqual({ phase: 'done', angle: 90, ram: 1, done: true });
    expect(punchOf('gooseneck-88').height).toBe(104.5);
  });
});

describe('the side view', () => {
  const die = dieOf('v10-88');
  const outer = [
    [0, 0],
    [100, 0],
    [100, 60],
    [0, 60],
  ];
  const right = gaugeEdges(outer)[1];
  // A 30 mm flange off the right edge (the gauge side, back), a 70 mm leg in front.
  const fold = (direction = 'up') =>
    foldSheet(blank({ bends: [{ id: 'p', ...gaugeBendLine(outer, right, 30), angle: 90, direction }] }), rect(100, 60));
  const poseAt = (angle, direction = 'up') => {
    const posed = poseFold(fold(direction), { p: angle });
    return { posed, frame: brakeFrame(posed, 'p', { die, gaugePoint: [100, 30] }) };
  };
  // A blank point at mid-thickness, as the 3D scene places it, in the side view's (y, z).
  const placed = ({ posed, frame }, [x, y]) => {
    const piece = posed.pieces.find((p) => {
      const xs = p.outer.map((q) => q[0]);
      return x >= Math.min(...xs) - 1e-9 && x <= Math.max(...xs) + 1e-9;
    });
    const point = transformPoint(frame.matrix, transformPoint(piece.matrix, [x, y, 0.75]));
    return [point[1], point[2]];
  };
  const end = (wing) => wing.start.map((v, i) => v + wing.direction[i] * wing.length);
  const window = sideViewWindow({ punch: punchOf('straight-88'), die });

  it('sizes its window round the tooling, wider for the gooseneck', () => {
    expect(window.y1).toBe(50);
    expect(window.y0).toBe(-50);
    expect(window.z1 - window.z0).toBeCloseTo(100 * SIDE_VIEW_ASPECT, 9);
    // The V (5 mm deep) and the parked punch tip (t + 40 above the die top) are inside.
    expect(window.z0).toBeLessThan(-30);
    expect(window.z1).toBeGreaterThan(1.5 + STROKE_GAP + 20);
    // Brake blades BT-1: the catalogue gooseneck's body reaches 49 mm back (the schematic one 45).
    expect(sideViewWindow({ punch: 'gooseneck-88', die }).y1).toBe(61);
  });
  it('lays the flat sheet on the die top, the gauge side back', () => {
    const pose = poseAt(0);
    const section = sheetSection(pose.posed, 'p', pose.frame);
    expect(section).toMatchObject({ angle: 0, radius: null, centre: null, breaks: [] });
    expect(section.wings.back).toMatchObject({ length: 30, shown: 30, broken: false, direction: [1, 0] });
    expect(section.wings.front).toMatchObject({ length: 70, broken: false });
    const ys = section.outline.map((p) => p[0]),
      zs = section.outline.map((p) => p[1]);
    expect([Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)]).toEqual([-70, 30, 0, 1.5]);
  });
  it('draws the cross-section the 3D scene poses: wings at half the angle, ends where the pieces end', () => {
    for (const angle of [30, 90]) {
      const pose = poseAt(angle);
      const section = sheetSection(pose.posed, 'p', pose.frame);
      const bend = pose.posed.bends[0];
      expect(section.angle).toBeCloseTo(angle, 9);
      expect(section.radius).toBeCloseTo(bend.transform.radius, 9);
      expect(section.centre[1]).toBeCloseTo(pose.frame.centre, 9);
      expect(Math.atan2(section.wings.back.direction[1], section.wings.back.direction[0])).toBeCloseTo(
        (angle * Math.PI) / 360,
        9,
      );
      // The straight legs: the flat legs less half the bend zone.
      expect(section.wings.back.length).toBeCloseTo(30 - bend.allowance / 2, 9);
      expect(section.wings.front.length).toBeCloseTo(70 - bend.allowance / 2, 9);
      // The flange's far edge (x 100) and the other leg's (x 0), as the 3D scene places them.
      end(section.wings.back).forEach((v, i) => expect(v).toBeCloseTo(placed(pose, [100, 30])[i], 6));
      end(section.wings.front).forEach((v, i) => expect(v).toBeCloseTo(placed(pose, [0, 30])[i], 6));
    }
  });
  it('rests the outer surface on both die shoulders and keeps the inner radius round the centre', () => {
    const pose = poseAt(90);
    const { outline, centre, radius, wings } = sheetSection(pose.posed, 'p', pose.frame);
    const c = shoulderOffset(die),
      rd = die.shoulderRadius;
    for (const [wing, side] of [
      [wings.back, 1],
      [wings.front, -1],
    ]) {
      // The outer surface line, half a thickness off the mid-surface: Rd from the shoulder centre.
      const n = [-wing.direction[1] * side, wing.direction[0] * side];
      const p = [wing.start[0] - n[0] * 0.75, wing.start[1] - n[1] * 0.75];
      const distance = Math.abs(wing.direction[0] * (-rd - p[1]) - wing.direction[1] * (side * c - p[0]));
      expect(distance).toBeCloseTo(rd, 6);
    }
    // Every inner arc point (the second half of the ring) lies on the inner radius.
    const inner = outline.slice(outline.length / 2 + 1, -1);
    for (const [y, z] of inner) expect(Math.hypot(y - centre[0], z - centre[1])).toBeCloseTo(radius, 9);
  });
  it('cuts a wing that leaves the window with a break mark, keeping the short one whole', () => {
    const pose = poseAt(90);
    const section = sheetSection(pose.posed, 'p', pose.frame, window);
    expect(section.wings.back.broken).toBe(false);
    expect(section.wings.front.broken).toBe(true);
    expect(section.wings.front.shown).toBeLessThan(section.wings.front.length);
    expect(section.breaks).toHaveLength(1);
    const [mark] = section.breaks;
    expect(mark.thickness).toBe(1.5);
    // The break is inside the window, on the front wing, across the sheet.
    expect(mark.at[0]).toBeGreaterThan(window.y0);
    expect(mark.at[1]).toBeLessThan(window.z1);
    expect(mark.normal[0] * mark.direction[0] + mark.normal[1] * mark.direction[1]).toBeCloseTo(0, 12);
    for (const [y, z] of section.outline) {
      expect(y).toBeGreaterThanOrEqual(window.y0 - 1e-9);
      expect(y).toBeLessThanOrEqual(window.y1 + 1e-9);
      expect(z).toBeLessThanOrEqual(window.z1 + 1e-9);
    }
  });
  it('drops the part beyond a break mark, keeping what lies before it', () => {
    const mark = { at: [-40, 20], direction: [-Math.SQRT1_2, Math.SQRT1_2], normal: [0, 1], thickness: 1.5 };
    const before = [
      [-10, 2],
      [-20, 8],
    ];
    const beyond = [
      [-50, 32],
      [-55, 40],
    ];
    expect(trimAtBreaks([before, beyond], [mark])).toEqual([before]);
    expect(trimAtBreaks([before, beyond], [])).toEqual([before, beyond]);
  });
  it('turns the sheet over for a down bend and spans the blank with no bend', () => {
    const pose = poseAt(90, 'down');
    const down = sheetSection(pose.posed, 'p', pose.frame);
    const up = sheetSection(poseAt(90).posed, 'p', poseAt(90).frame);
    expect(down.centre[1]).toBeCloseTo(up.centre[1], 9);
    expect(down.wings.back.length).toBeCloseTo(up.wings.back.length, 9);
    const plain = poseFold(foldSheet(blank(), rect(100, 60)));
    const flat = sheetSection(plain, null, flatFrame(plain), window);
    expect(flat.wings.back).toMatchObject({ length: 30, broken: false });
    expect(flat.angle).toBe(0);
  });
});
