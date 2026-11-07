// Phase P (docs/sketch-studio-angle-bar.md §2.7): the angle outline, its
// area and the member section labels.
import { describe, expect, it } from 'vitest';
import {
  ANGLE_SIZES,
  angleRadiiAutomatic,
  angleRadiiFor,
  angleSectionArea,
  angleSectionProfile,
  angleSizeOf,
  sectionLabel,
} from './stockSections.js';
import { resolveSection } from './model.js';

const L50 = { type: 'angle', width: 50, height: 50, wall: 5, rootRadius: 7, toeRadius: 3.5 };
// Every vertex of a path profile, start first (an arc contributes its end).
const vertices = (profile) => [profile.start, ...profile.segments.map((s) => s.end)];
const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
const edges = (points) => points.map((p, i) => [p, points[(i + 1) % points.length]]);
// The circle through three points: centre and radius.
function circle([ax, ay], [bx, by], [cx, cy]) {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  return { centre: [ux, uy], radius: Math.hypot(ax - ux, ay - uy) };
}
// Area of a closed line/arc path: the shoelace of its vertices plus, per
// arc, the circular segment between chord and arc (added where the arc
// bulges out of the counter-clockwise outline, taken away where it is concave).
function pathArea(profile) {
  const points = vertices(profile);
  let area = 0;
  for (const [p, q] of edges(points)) area += (p[0] * q[1] - q[0] * p[1]) / 2;
  profile.segments.forEach((segment, i) => {
    if (segment.type !== 'arc') return;
    const from = points[i];
    const { centre, radius } = circle(from, segment.mid, segment.end);
    expect(Math.hypot(segment.mid[0] - centre[0], segment.mid[1] - centre[1])).toBeCloseTo(radius, 9);
    // Every arc here is less than a half circle.
    const chord = Math.hypot(segment.end[0] - from[0], segment.end[1] - from[1]);
    const theta = 2 * Math.asin(Math.min(1, chord / 2 / radius));
    const piece = ((radius * radius) / 2) * (theta - Math.sin(theta));
    area += cross(from, segment.end, segment.mid) < 0 ? piece : -piece;
  });
  return area;
}

describe('angleSectionProfile', () => {
  it('draws the hot-rolled L: heel at (−w/2, −h/2), three arcs, closed, every edge non-degenerate', () => {
    const profile = angleSectionProfile(L50);
    expect(profile).toMatchObject({ type: 'path', start: [-25, -25], closed: true });
    expect(profile.segments.map((s) => s.type)).toEqual(['line', 'line', 'arc', 'line', 'arc', 'line', 'arc', 'line']);
    const points = vertices(profile);
    expect(points).toEqual([
      [-25, -25],
      [25, -25],
      [25, -23.5],
      [21.5, -20],
      [-13, -20],
      [-20, -13],
      [-20, 21.5],
      [-23.5, 25],
      [-25, 25],
    ]);
    // The implicit closing edge (the outside of leg B) and every drawn edge have length.
    for (const [p, q] of edges(points)) expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeGreaterThan(1);
    // Toe mids on the +,+ diagonal of their centres; the root mid on the −,−.
    const k = Math.SQRT1_2;
    expect(profile.segments[2].mid[0]).toBeCloseTo(21.5 + 3.5 * k, 12);
    expect(profile.segments[2].mid[1]).toBeCloseTo(-23.5 + 3.5 * k, 12);
    expect(profile.segments[4].mid[0]).toBeCloseTo(-13 - 7 * k, 12);
    expect(profile.segments[4].mid[1]).toBeCloseTo(-13 - 7 * k, 12);
    expect(profile.segments[6].mid[0]).toBeCloseTo(-23.5 + 3.5 * k, 12);
    expect(profile.segments[6].mid[1]).toBeCloseTo(21.5 + 3.5 * k, 12);
  });
  it('a zero radius is a plain corner: no arc and no zero-length edge', () => {
    const sharp = angleSectionProfile({ type: 'angle', width: 60, height: 40, wall: 6 });
    expect(sharp.segments.every((s) => s.type === 'line')).toBe(true);
    expect(vertices(sharp)).toEqual([
      [-30, -20],
      [30, -20],
      [30, -14],
      [-24, -14],
      [-24, 20],
      [-30, 20],
    ]);
    for (const radii of [
      { rootRadius: 5, toeRadius: 0 },
      { rootRadius: 0, toeRadius: 2 },
    ]) {
      const profile = angleSectionProfile({ type: 'angle', width: 50, height: 50, wall: 5, ...radii });
      expect(profile.segments.filter((s) => s.type === 'arc')).toHaveLength(radii.rootRadius ? 1 : 2);
      for (const [p, q] of edges(vertices(profile))) expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeGreaterThan(1);
    }
  });
});

describe('angleSectionArea', () => {
  it('is 480.3 mm² for L 50×50×5 (EN 10056-1: 4.80 cm²) and t(w + h − t) without radii', () => {
    expect(angleSectionArea(L50)).toBeCloseTo(480.26, 2);
    expect(angleSectionArea({ width: 60, height: 40, wall: 6 })).toBe(6 * 94);
  });
  it('matches the shoelace-plus-arc area of the profile for every standard size and an unequal angle', () => {
    for (const size of [...ANGLE_SIZES, { width: 75, height: 50, wall: 6, rootRadius: 7, toeRadius: 3.5 }])
      expect(pathArea(angleSectionProfile(size))).toBeCloseTo(angleSectionArea(size), 9);
    // And without radii, where it is the plain shoelace.
    expect(pathArea(angleSectionProfile({ width: 60, height: 40, wall: 6 }))).toBeCloseTo(6 * 94, 9);
  });
});

describe('ANGLE_SIZES and sectionLabel', () => {
  it('lists the ten equal angles with their EN 10056-1 radii, labelled L w×h×t', () => {
    expect(ANGLE_SIZES.map((s) => s.label)).toEqual([
      'L 20×20×3',
      'L 25×25×3',
      'L 30×30×3',
      'L 40×40×4',
      'L 40×40×5',
      'L 50×50×5',
      'L 50×50×6',
      'L 60×60×6',
      'L 80×80×8',
      'L 100×100×10',
    ]);
    expect(ANGLE_SIZES[5]).toMatchObject({ width: 50, height: 50, wall: 5, rootRadius: 7, toeRadius: 3.5 });
    expect(ANGLE_SIZES.at(-1)).toMatchObject({ width: 100, height: 100, wall: 10, rootRadius: 12, toeRadius: 6 });
    // Every size passes its own fit rules.
    for (const s of ANGLE_SIZES) {
      expect(s.toeRadius).toBeLessThan(s.wall);
      expect(s.rootRadius + s.toeRadius).toBeLessThan(s.width - s.wall);
    }
  });
  it('finds the matching size by all five numbers, or by legs and thickness', () => {
    expect(angleSizeOf(L50)?.label).toBe('L 50×50×5');
    expect(angleSizeOf({ ...L50, toeRadius: 3 })).toBeNull();
    expect(angleSizeOf({ ...L50, width: '=50' })).toBeNull();
    expect(angleSizeOf({ type: 'angle', width: 50, height: 50, wall: 5 })).toBeNull();
    expect(angleSizeOf({ type: 'angle', width: 50, height: 50, wall: 5 }, 'leg')?.label).toBe('L 50×50×5');
  });
  it('names every member section type', () => {
    expect(sectionLabel({ type: 'tube', width: 40, height: 40, wall: 2 })).toBe('SHS 40×40×2');
    expect(sectionLabel({ type: 'tube', width: 60, height: 40, wall: 3 })).toBe('RHS 60×40×3');
    expect(sectionLabel({ type: 'pipe', diameter: 48.3, wall: 3 })).toBe('CHS Ø48.3×3');
    expect(sectionLabel({ type: 'bar', width: 40, height: 10 })).toBe('Flat 40×10');
    expect(sectionLabel({ type: 'round-bar', diameter: 20 })).toBe('Round Ø20');
    expect(sectionLabel(L50)).toBe('L 50×50×5');
    expect(sectionLabel({ type: 'angle', width: 75, height: 50, wall: 6 })).toBe('L 75×50×6');
    expect(sectionLabel({ type: 'tube', width: 40, height: 40, wall: 1.25 })).toBe('SHS 40×40×1.25');
    expect(sectionLabel(null)).toBe('');
  });
});

// Phase P.1 (docs/sketch-studio-angle-bar.md §8.2.2): the radii a custom size
// gets while nobody has set them.
describe('angleRadiiFor', () => {
  it('returns the catalogue radii on an exact legs-and-thickness match', () => {
    for (const size of ANGLE_SIZES)
      expect(angleRadiiFor(size)).toEqual({ rootRadius: size.rootRadius, toeRadius: size.toeRadius });
    // The default part's section is automatic.
    expect(angleRadiiAutomatic(L50)).toBe(true);
  });

  it('takes the nearest thickness (a tie goes to the smaller entry), scaled to fit with margin', () => {
    // t 6 on long legs: the first t-6 entry (50×50×6, r7 / r3.5), r2 ≤ 3 → × 6/7.
    expect(angleRadiiFor({ width: 120, height: 120, wall: 6 })).toEqual({ rootRadius: 6, toeRadius: 3 });
    // t 10 on 120 legs: L 100×100×10's r12 / r6 fit unscaled (r2 ≤ 5? no → × 5/6).
    expect(angleRadiiFor({ width: 120, height: 120, wall: 10 })).toEqual({ rootRadius: 10, toeRadius: 5 });
    // t 4.5: 4 and 5 are equally near → the smaller entry, L 40×40×4 (r6 / r3) → r2 ≤ 2.25 → × 0.75.
    expect(angleRadiiFor({ width: 70, height: 70, wall: 4.5 })).toEqual({ rootRadius: 4.5, toeRadius: 2.2 });
    // t 3 (three t-3 entries → the smallest, L 20×20×3 r3.5 / r2) on 63 × 50 → r2 ≤ 1.5.
    expect(angleRadiiFor({ width: 63, height: 50, wall: 3 })).toEqual({ rootRadius: 2.6, toeRadius: 1.5 });
    // Short legs: r1 + r2 ≤ (min − t) / 2 binds. 10 × 10 × 3 → 5.5 scaled to 3.5.
    expect(angleRadiiFor({ width: 10, height: 10, wall: 3 })).toEqual({ rootRadius: 2.2, toeRadius: 1.2 });
    // Far past the catalogue: t 20 → the t-10 entry, r12 / r6, fits as is.
    expect(angleRadiiFor({ width: 200, height: 150, wall: 20 })).toEqual({ rootRadius: 12, toeRadius: 6 });
  });

  it('always passes resolveSection over a sweep of sizes, with margin off the catalogue', () => {
    let count = 0;
    for (let width = 10; width <= 120; width += 10)
      for (let height = 10; height <= 120; height += 10)
        for (let wall = 0.5; wall < Math.min(width, height); wall += 0.5) {
          const radii = angleRadiiFor({ width, height, wall });
          expect(() => resolveSection({ type: 'angle', width, height, wall, ...radii })).not.toThrow();
          count++;
          // A catalogue size keeps its own radii (L 20×20×3's r2 2 > t / 2).
          if (angleSizeOf({ width, height, wall }, 'leg')) continue;
          expect(radii.toeRadius).toBeLessThanOrEqual(0.5 * wall + 1e-9);
          expect(radii.rootRadius + radii.toeRadius).toBeLessThanOrEqual(0.5 * (Math.min(width, height) - wall) + 1e-9);
          expect(Math.round(radii.rootRadius * 10)).toBeCloseTo(radii.rootRadius * 10, 9);
          expect(Math.round(radii.toeRadius * 10)).toBeCloseTo(radii.toeRadius * 10, 9);
        }
    expect(count).toBeGreaterThan(5000);
  });

  it('is 0 / 0 for input that is not a positive number, or a thickness that fills a leg', () => {
    const none = { rootRadius: 0, toeRadius: 0 };
    expect(angleRadiiFor({ width: 50, height: 50, wall: 50 })).toEqual(none);
    expect(angleRadiiFor({ width: 50, height: 4, wall: 5 })).toEqual(none);
    expect(angleRadiiFor({ width: 0, height: 50, wall: 5 })).toEqual(none);
    expect(angleRadiiFor({ width: -50, height: 50, wall: 5 })).toEqual(none);
    expect(angleRadiiFor({ width: '=a', height: 50, wall: 5 })).toEqual(none);
    expect(angleRadiiFor({ width: '50', height: 50, wall: 5 })).toEqual(none);
    expect(angleRadiiFor({ width: 50, height: 50, wall: NaN })).toEqual(none);
    expect(angleRadiiFor({ width: 50, height: 50 })).toEqual(none);
    expect(angleRadiiFor()).toEqual(none);
  });

  it('depends on the three values only: typing "6" then "60" ends with the radii of 60', () => {
    const typed = (section, width) => {
      const next = { ...section, width };
      return angleRadiiAutomatic(section) ? { ...next, ...angleRadiiFor(next) } : next;
    };
    const six = typed(L50, 6);
    expect(six).toMatchObject({ width: 6, ...angleRadiiFor({ width: 6, height: 50, wall: 5 }) });
    expect(six.rootRadius).toBeLessThan(1);
    const sixty = typed(six, 60);
    expect(sixty).toEqual({ ...L50, width: 60, ...angleRadiiFor({ width: 60, height: 50, wall: 5 }) });
    expect(sixty).toMatchObject({ rootRadius: 5, toeRadius: 2.5 });
    // Typed radii (or an expression, or none) are not automatic.
    expect(angleRadiiAutomatic({ ...L50, toeRadius: 3 })).toBe(false);
    expect(angleRadiiAutomatic({ ...L50, rootRadius: '=7' })).toBe(false);
    expect(angleRadiiAutomatic({ type: 'angle', width: 50, height: 50, wall: 5 })).toBe(false);
  });
});
