import { describe, expect, it } from 'vitest';
import { bearingToAzimuthDegrees, formatBearing, isValidTraverseLine, traverseBoundary } from './surveyTraverse';

function line(ns, degrees, minutes, ew, distanceMeters) {
  return { ns, degrees, minutes, ew, distance: distanceMeters * 1000 };
}

// Lot 812-I-1-A from a real Lapu-Lapu subdivision sketch plan: five lines,
// titled area 60 sq m. Distances are rounded to centimetres and bearings to
// minutes, so the traverse should close within surveying tolerance but not
// exactly.
const LOT_812_I_1_A = [
  line('N', 50, 56, 'W', 12.69),
  line('N', 47, 0, 'E', 4.51),
  line('S', 54, 57, 'E', 5.97),
  line('S', 54, 57, 'E', 5.94),
  line('S', 37, 2, 'W', 5.31),
];

describe('bearingToAzimuthDegrees', () => {
  it.each([
    ['N 30° E', { ns: 'N', degrees: 30, ew: 'E' }, 30],
    ['S 30° E', { ns: 'S', degrees: 30, ew: 'E' }, 150],
    ['S 30° W', { ns: 'S', degrees: 30, ew: 'W' }, 210],
    ['N 30° W', { ns: 'N', degrees: 30, ew: 'W' }, 330],
    ['due north', { ns: 'N', degrees: 0, ew: 'E' }, 0],
    ['due east', { ns: 'N', degrees: 90, ew: 'E' }, 90],
    ['due south', { ns: 'S', degrees: 0, ew: 'E' }, 180],
    ['due west', { ns: 'S', degrees: 90, ew: 'W' }, 270],
  ])('converts %s to its azimuth', (_label, bearing, azimuth) => {
    expect(bearingToAzimuthDegrees(bearing)).toBeCloseTo(azimuth, 10);
  });

  it('folds minutes into the angle', () => {
    expect(bearingToAzimuthDegrees({ ns: 'N', degrees: 50, minutes: 56, ew: 'W' })).toBeCloseTo(360 - (50 + 56 / 60));
  });
});

describe('isValidTraverseLine', () => {
  it('accepts a plain quadrant bearing with a positive distance', () => {
    expect(isValidTraverseLine(line('S', 42, 21, 'E', 3.98))).toBe(true);
  });

  it.each([
    ['degrees past the quadrant', line('N', 91, 0, 'E', 5)],
    ['minutes past 60', line('N', 30, 60, 'E', 5)],
    ['degrees plus minutes past the quadrant', line('N', 90, 30, 'E', 5)],
    ['zero distance', line('N', 30, 0, 'E', 0)],
    ['negative distance', line('N', 30, 0, 'E', -5)],
    ['missing north/south letter', { degrees: 30, minutes: 0, ew: 'E', distance: 5000 }],
    ['missing east/west letter', { ns: 'N', degrees: 30, minutes: 0, distance: 5000 }],
    ['non-numeric degrees', { ns: 'N', degrees: '30', minutes: 0, ew: 'E', distance: 5000 }],
  ])('rejects %s', (_label, entry) => {
    expect(isValidTraverseLine(entry)).toBe(false);
  });
});

describe('traverseBoundary', () => {
  it('walks a cardinal square in y-down plan space', () => {
    const result = traverseBoundary([
      line('N', 0, 0, 'E', 10),
      line('N', 90, 0, 'E', 10),
      line('S', 0, 0, 'E', 10),
      line('S', 90, 0, 'W', 10),
    ]);

    // North goes up the screen (negative y), east goes right.
    expect(result.points[0]).toEqual({ x: 0, y: 0 });
    expect(result.points[1].x).toBeCloseTo(0, 6);
    expect(result.points[1].y).toBeCloseTo(-10_000, 6);
    expect(result.points[2].x).toBeCloseTo(10_000, 6);
    expect(result.points[2].y).toBeCloseTo(-10_000, 6);
    expect(result.misclosure).toBeCloseTo(0, 6);
    expect(result.area).toBeCloseTo(100_000_000, 0);
    expect(result.perimeter).toBeCloseTo(40_000, 6);
  });

  it('rotates the whole lot with the north angle, keeping bearings true', () => {
    const rotated = traverseBoundary(
      [line('N', 0, 0, 'E', 10), line('N', 90, 0, 'E', 10), line('S', 0, 0, 'E', 10), line('S', 90, 0, 'W', 10)],
      { northAngle: 90 },
    );

    // With north swung 90° clockwise, a due-north line runs right (+x).
    expect(rotated.points[1].x).toBeCloseTo(10_000, 6);
    expect(rotated.points[1].y).toBeCloseTo(0, 6);
    expect(rotated.area).toBeCloseTo(100_000_000, 0);
  });

  it('starts from the given origin', () => {
    const result = traverseBoundary(LOT_812_I_1_A, { origin: { x: 2000, y: 3000 } });
    expect(result.points[0]).toEqual({ x: 2000, y: 3000 });
  });

  it('closes the real sketch-plan lot within surveying tolerance', () => {
    const result = traverseBoundary(LOT_812_I_1_A);

    // Rounded input closes within centimetres, not exactly.
    expect(result.misclosure).toBeGreaterThan(0);
    expect(result.misclosure).toBeLessThan(20);
    expect(result.misclosureRatio).toBeLessThan(1 / 1000);
    expect(result.points).toHaveLength(5);
    expect(result.perimeter).toBeCloseTo(34_420, 0);
  });

  it('reproduces the titled area of the real lot', () => {
    const result = traverseBoundary(LOT_812_I_1_A);
    expect(result.area / 1_000_000).toBeGreaterThan(59.5);
    expect(result.area / 1_000_000).toBeLessThan(60.5);
  });

  it('surfaces a data-entry typo as a large misclosure', () => {
    const typo = LOT_812_I_1_A.map((entry, index) => (index === 0 ? { ...entry, distance: 11_690 } : entry));
    const result = traverseBoundary(typo);
    expect(result.misclosure).toBeGreaterThan(900);
    expect(result.misclosureRatio).toBeGreaterThan(1 / 200);
  });

  it('returns null for fewer than three lines or invalid entries', () => {
    expect(traverseBoundary([line('N', 0, 0, 'E', 10), line('S', 0, 0, 'E', 10)])).toBeNull();
    expect(
      traverseBoundary([line('N', 0, 0, 'E', 10), line('N', 91, 0, 'E', 10), line('S', 0, 0, 'E', 10)]),
    ).toBeNull();
  });
});

describe('formatBearing', () => {
  it('renders the surveyor notation', () => {
    expect(formatBearing({ ns: 'N', degrees: 50, minutes: 56, ew: 'W' })).toBe('N 50°56′ W');
    expect(formatBearing({ ns: 'S', degrees: 37, minutes: 2, ew: 'W' })).toBe('S 37°02′ W');
  });
});
