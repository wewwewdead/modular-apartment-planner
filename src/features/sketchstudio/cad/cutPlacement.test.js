// Phase J (docs/sketch-studio-cut-placement.md): the kernel's pocket width
// rule as a helper (cutWidthDirection), the member frame shared with
// resolveCutPlacement, and memberPlacementFromPoint — a click on a round
// member drills radially at the clicked point. resolveCutPlacement must give
// exactly what it gave before the extraction (the legacy copy below).
import { describe, expect, it } from 'vitest';
import { memberMetrics, numeric, positive, vector } from './model.js';
import { mapPlacement } from './placement.js';
import {
  CUT_SIDES,
  cutWidthDirection,
  memberFrame,
  memberPlacementFromPoint,
  resolveCutPlacement,
  resolveRow,
} from './cutPlacement.js';

const normalize = (value) => {
  const length = Math.hypot(...value);
  if (length < 1e-10) throw new Error('Cut direction must be nonzero.');
  return value.map((x) => x / length);
};
const percent = (value, parameters) => {
  const result = numeric(value, parameters);
  if (result < 0 || result > 100) throw new Error('Surface position must be between 0 and 100 percent.');
  return result / 100;
};
// resolveCutPlacement as it was before Phase J (git HEAD), verbatim.
function legacyResolveCutPlacement(feature, previousFeatures, bounds, parameters = {}) {
  const placement = feature.placement;
  let position, direction, widthDirection;
  if (placement?.type === 'member') {
    const sourceIndex = previousFeatures.findIndex(
      (f) => f.id === placement.featureId && !f.suppressed && f.type === 'member',
    );
    if (sourceIndex < 0) throw new Error('Broken cut reference: choose an earlier, enabled member.');
    if (
      previousFeatures
        .slice(sourceIndex + 1)
        .some((f) => !f.suppressed && ['transform', 'mirror', 'pattern'].includes(f.type))
    )
      throw new Error(
        'Member reference changed after a transform or pattern. Choose a part side or explicit coordinates.',
      );
    const member = memberMetrics(previousFeatures[sourceIndex], parameters),
      section = member.section;
    const side = CUT_SIDES[placement.side];
    if (!side || side.axis === 2) throw new Error('Choose a member side: front, rear, left or right.');
    const axis = normalize(member.end.map((x, i) => x - member.start[i]));
    const rotationAxis = [-axis[1], axis[0], 0];
    const rotation =
      Math.hypot(...rotationAxis) > 1e-9
        ? [
            {
              axis: rotationAxis,
              angle: (Math.acos(Math.max(-1, Math.min(1, axis[2]))) * 180) / Math.PI,
              origin: [0, 0, 0],
            },
          ]
        : axis[2] < 0
          ? [{ axis: [1, 0, 0], angle: 180, origin: [0, 0, 0] }]
          : [];
    const distance =
      placement.distance != null
        ? numeric(placement.distance, parameters)
        : member.centerline * percent(placement.along ?? 50, parameters);
    if (distance < 0 || distance > member.centerline)
      throw new Error('Cut position must be within the finished member length.');
    const offset = numeric(placement.offset ?? 0, parameters);
    const local = side.width.map((x) => x * offset);
    if (section.diameter) {
      const radius = section.diameter / 2;
      if (Math.abs(offset) >= radius) throw new Error('Cut offset must be inside the pipe radius.');
      local[side.axis] = side.sign * Math.sqrt(radius * radius - offset * offset);
      direction = normalize([-local[0], -local[1], 0]);
      widthDirection = normalize([direction[1], -direction[0], 0]);
    } else {
      const half = (side.axis === 0 ? section.width : section.height) / 2;
      local[side.axis] = side.sign * half;
      direction = [0, 0, 0];
      direction[side.axis] = -side.sign;
      widthDirection = side.width;
    }
    local[2] = distance + member.gapStart;
    position = mapPlacement(local, rotation).map((x, i) => x + member.start[i]);
    direction = mapPlacement(direction, rotation, true);
    widthDirection = mapPlacement(widthDirection, rotation, true);
  } else if (placement?.type === 'side') {
    const side = CUT_SIDES[placement.side];
    if (!side || !bounds) throw new Error('Choose a valid part side.');
    const fractions =
      placement.units === 'mm'
        ? [numeric(placement.u, parameters), numeric(placement.v, parameters)]
        : [percent(placement.u ?? 50, parameters), percent(placement.v ?? 50, parameters)];
    let index = 0;
    position = bounds[0].map((min, axis) =>
      axis === side.axis
        ? bounds[side.sign > 0 ? 1 : 0][axis]
        : min + (placement.units === 'mm' ? 1 : bounds[1][axis] - min) * fractions[index++],
    );
    if (position.some((v, i) => v < bounds[0][i] - 1e-6 || v > bounds[1][i] + 1e-6))
      throw new Error('Edge distances must lie within the part side.');
    direction = [0, 0, 0];
    direction[side.axis] = -side.sign;
    widthDirection = side.width;
  } else {
    position = vector(feature.position || [0, 0, 0], parameters);
    direction = normalize(vector(feature.direction || [0, 0, 1], parameters));
    const reference = Math.abs(direction[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const dot = reference.reduce((sum, x, i) => sum + x * direction[i], 0);
    widthDirection = normalize(reference.map((x, i) => x - dot * direction[i]));
  }
  let depth = feature.throughAll ? 0 : positive(feature.depth, parameters, 'Cut depth');
  if (feature.throughAll) {
    const farthest = direction.reduce((sum, d, i) => sum + (bounds[d >= 0 ? 1 : 0][i] - position[i]) * d, 0);
    if (farthest <= 0) throw new Error('Cut points away from the part. Choose another side or reverse the direction.');
    depth = farthest + 0.01;
  }
  return { position, direction, widthDirection, depth, throughAll: Boolean(feature.throughAll) };
}

const close = (actual, expected, digits = 6) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
};
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

describe('cutWidthDirection', () => {
  it('is the kernel rule for the six axis directions: X square to the cut, else Y', () => {
    const cases = [
      [
        [0, 0, 1],
        [1, 0, 0],
      ],
      [
        [0, 0, -1],
        [1, 0, 0],
      ],
      [
        [0, 1, 0],
        [1, 0, 0],
      ],
      [
        [0, -1, 0],
        [1, 0, 0],
      ],
      [
        [1, 0, 0],
        [0, 1, 0],
      ],
      [
        [-1, 0, 0],
        [0, 1, 0],
      ],
    ];
    for (const [direction, width] of cases) close(cutWidthDirection(direction), width, 12);
  });
  it('projects the reference square to an oblique direction', () => {
    const direction = normalize([0.6, 0.48, -0.64]);
    const width = cutWidthDirection(direction);
    expect(dot(width, direction)).toBeCloseTo(0, 12);
    expect(Math.hypot(...width)).toBeCloseTo(1, 12);
    // |x| < 0.9: X minus its part along the cut.
    close(width, normalize([1 - direction[0] ** 2, -direction[0] * direction[1], -direction[0] * direction[2]]), 12);
    // Nearly along X: the Y reference.
    const alongX = normalize([0.95, 0.1, 0.2]);
    const w = cutWidthDirection(alongX);
    expect(dot(w, alongX)).toBeCloseTo(0, 12);
    expect(w[1]).toBeGreaterThan(0.9);
  });
});

const pipe = (start, end, extra = {}) => ({
  id: 'm',
  type: 'member',
  start,
  end,
  section: { type: 'pipe', diameter: 40, wall: 2 },
  gapStart: 0,
  gapEnd: 0,
  angleStart: 0,
  angleEnd: 0,
  ...extra,
});
// The surface point of a round member at `distance` from its finished start
// and `angle` (degrees) about its axis from member-local +X.
function surfacePoint(member, distance, angle) {
  const { start, rotation, metrics } = memberFrame(member);
  const r = metrics.section.diameter / 2;
  const a = (angle * Math.PI) / 180;
  const local = [r * Math.cos(a), r * Math.sin(a), distance + metrics.gapStart];
  return mapPlacement(local, rotation).map((v, i) => v + start[i]);
}
function roundTrip(member, distance, angle) {
  const point = surfacePoint(member, distance, angle);
  const placement = memberPlacementFromPoint(member, point);
  const cut = resolveCutPlacement({ type: 'hole', diameter: 6, depth: 2, placement }, [member], null);
  close(cut.position, point, 6);
  // Radial and inward: square to the axis, pointing at it.
  const { start, axis } = memberFrame(member);
  const along = dot(
    point.map((p, k) => p - start[k]),
    axis,
  );
  const fromAxis = point.map((v, i) => v - start[i] - along * axis[i]);
  expect(dot(cut.direction, axis)).toBeCloseTo(0, 9);
  // The stored offset is tidied to 1e-6 mm: the direction agrees to ~1e-8.
  close(cut.direction, normalize(fromAxis.map((v) => -v)), 6);
  return placement;
}

describe('memberPlacementFromPoint', () => {
  it('round-trips a Ø40 pipe along +Z at 0°, 90° and 45° and stores mm, not percent', () => {
    const member = pipe([0, 0, 0], [0, 0, 300]);
    expect(roundTrip(member, 120, 0)).toEqual({
      type: 'member',
      featureId: 'm',
      side: 'right',
      distance: 120,
      offset: 0,
    });
    expect(roundTrip(member, 75, 90)).toMatchObject({ side: 'rear', distance: 75, offset: 0 });
    const diagonal = roundTrip(member, 200, 45);
    expect(diagonal.distance).toBe(200);
    expect(Math.abs(diagonal.offset)).toBeCloseTo(20 * Math.SQRT1_2, 5);
    expect(roundTrip(member, 10, 200).side).toBe('left');
    expect(roundTrip(member, 10, 260).side).toBe('front');
    expect('along' in diagonal).toBe(false);
  });
  it('round-trips a pipe along +X and one tilted 15°, with an end gap', () => {
    roundTrip(pipe([0, 0, 0], [500, 0, 0]), 250, 30);
    roundTrip(pipe([0, 0, 0], [500, 0, 0]), 40, 135);
    const tilt = (15 * Math.PI) / 180;
    const tilted = pipe([10, 20, 30], [10 + 400 * Math.sin(tilt), 20, 30 + 400 * Math.cos(tilt)], { gapStart: 5 });
    roundTrip(tilted, 100, 0);
    roundTrip(tilted, 333, 300);
    expect(memberPlacementFromPoint(tilted, surfacePoint(tilted, 100, 0)).distance).toBe(100);
  });
  it('refuses a point beyond the finished length and clamps one a hair past either end', () => {
    const member = pipe([0, 0, 0], [0, 0, 300]);
    expect(() => memberPlacementFromPoint(member, [20, 0, 301])).toThrow('Click on the finished length of the member.');
    expect(memberPlacementFromPoint(member, [20, 0, 300.3]).distance).toBe(300);
    expect(memberPlacementFromPoint(member, [20, 0, -0.3]).distance).toBe(0);
    const square = { ...member, section: { type: 'tube', width: 40, height: 40, wall: 2 } };
    expect(() => memberPlacementFromPoint(square, [20, 0, 10])).toThrow('round tube');
  });
  it('shares memberFrame: member-local +Z runs along the member', () => {
    const { rotation, axis } = memberFrame(pipe([0, 0, 0], [0, 300, 0]));
    close(axis, [0, 1, 0]);
    close(mapPlacement([0, 0, 1], rotation, true), [0, 1, 0]);
  });
});

describe('resolveCutPlacement after the extraction', () => {
  const box = { id: 'box', type: 'box', width: 100, depth: 80, height: 10 };
  const BOUNDS = [
    [0, 0, 0],
    [100, 80, 10],
  ];
  const tube = {
    id: 'tube',
    type: 'member',
    start: [0, 0, 0],
    end: [0, 0, 700],
    section: { type: 'tube', width: 40, height: 30, wall: 2 },
    gapStart: 3,
    gapEnd: 4,
  };
  const memberBounds = [
    [-20, -15, 0],
    [20, 15, 700],
  ];
  const BIG = [
    [-500, -500, -500],
    [500, 500, 500],
  ];
  const pocket = (extra) => ({ type: 'pocket', shape: 'rectangle', width: 12, height: 20, depth: 3, ...extra });
  const fixtures = [
    [{ type: 'hole', diameter: 6, depth: 4, position: [30, 20, 10], direction: [0, 0, -1] }, [box], BOUNDS],
    [{ type: 'hole', diameter: 6, throughAll: true, position: [100, 40, 5], direction: [-1, 0, 0] }, [box], BOUNDS],
    [pocket({ position: [50, 0, 5], direction: [0, 1, 0] }), [box], BOUNDS],
    [{ type: 'hole', diameter: 4, depth: 2, position: [10, 10, 10], direction: [0.3, -0.2, -1] }, [box], BOUNDS],
    [
      { type: 'hole', diameter: 4, depth: 2, position: ['=a', 10, 10], direction: [0, 0, -1] },
      [box],
      BOUNDS,
      { a: 42 },
    ],
    ...['top', 'bottom', 'front', 'rear', 'left', 'right'].map((side) => [
      pocket({ placement: { type: 'side', side, u: 25, v: 60 } }),
      [box],
      BOUNDS,
    ]),
    [
      {
        type: 'hole',
        diameter: 5,
        throughAll: true,
        placement: { type: 'side', side: 'top', units: 'mm', u: 12, v: 7 },
      },
      [box],
      BOUNDS,
    ],
    ...['front', 'rear', 'left', 'right'].map((side) => [
      {
        type: 'hole',
        diameter: 6,
        depth: 2,
        placement: { type: 'member', featureId: 'tube', side, along: 30, offset: 4 },
      },
      [tube],
      memberBounds,
    ]),
    [
      {
        type: 'hole',
        diameter: 6,
        throughAll: true,
        placement: { type: 'member', featureId: 'tube', side: 'left', distance: 90, offset: -3 },
      },
      [tube],
      memberBounds,
    ],
    ...[
      [
        [0, 0, 0],
        [300, 0, 0],
      ],
      [
        [0, 0, 0],
        [0, 0, -300],
      ],
      [
        [5, 5, 5],
        [105, 205, 305],
      ],
    ].flatMap(([start, end]) =>
      ['front', 'right'].map((side) => [
        {
          type: 'hole',
          diameter: 6,
          throughAll: true,
          placement: { type: 'member', featureId: 'p', side, along: 40, offset: 7 },
        },
        [{ ...pipe(start, end), id: 'p' }],
        BIG,
      ]),
    ),
  ];
  it('gives the same position, direction, width direction and depth as before for every fixture', () => {
    expect(fixtures.length).toBeGreaterThan(20);
    for (const [feature, previous, bounds, parameters = {}] of fixtures)
      expect(resolveCutPlacement(feature, previous, bounds, parameters)).toEqual(
        legacyResolveCutPlacement(feature, previous, bounds, parameters),
      );
  });
  it('fails the same way as before', () => {
    const broken = [
      [
        { type: 'hole', depth: 2, placement: { type: 'member', featureId: 'nope', side: 'front' } },
        [tube],
        memberBounds,
      ],
      [{ type: 'hole', depth: 2, placement: { type: 'member', featureId: 'tube', side: 'top' } }, [tube], memberBounds],
      [
        { type: 'hole', depth: 2, placement: { type: 'member', featureId: 'tube', side: 'front', along: 120 } },
        [tube],
        memberBounds,
      ],
      [{ type: 'hole', depth: 2, position: [0, 0, 0], direction: [0, 0, 0] }, [box], BOUNDS],
    ];
    for (const [feature, previous, bounds] of broken) {
      let message = null;
      try {
        legacyResolveCutPlacement(feature, previous, bounds);
      } catch (e) {
        message = e.message;
      }
      expect(message).toBeTruthy();
      expect(() => resolveCutPlacement(feature, previous, bounds)).toThrow(message);
    }
  });
  it('builds pocket rectangles on x = width direction, y = direction × width', () => {
    const cut = resolveCutPlacement(fixtures[2][0], [box], BOUNDS);
    // A front-face pocket (+Y into the part): width along X, height along Y × X = -Z.
    close(cut.widthDirection, [1, 0, 0]);
    close(cross(cut.direction, cut.widthDirection), [0, 0, -1]);
  });
});

// Phase K (docs/sketch-studio-hole-row.md §4.2): every centre of a hole row.
describe('resolveRow', () => {
  const top = { position: [20, 40, 10], direction: [0, 0, -1] };
  const row = (patch) => ({ type: 'hole', row: { count: 4, pitch: 20, direction: [1, 0, 0], ...patch } });
  it('is null without a row', () => {
    expect(resolveRow({ type: 'hole' }, top)).toBeNull();
  });
  it('lays the centres along +X, +Y and an oblique direction from the first hole', () => {
    expect(resolveRow(row({}), top).centres).toEqual([
      [20, 40, 10],
      [40, 40, 10],
      [60, 40, 10],
      [80, 40, 10],
    ]);
    const y = resolveRow(row({ count: 3, pitch: 15, direction: [0, 1, 0] }), top);
    expect(y).toMatchObject({ count: 3, pitch: 15, direction: [0, 1, 0] });
    expect(y.centres.map((c) => c[1])).toEqual([40, 55, 70]);
    const oblique = resolveRow(row({ count: 2, pitch: 10, direction: [3, 4, 0] }), top);
    close(oblique.direction, [0.6, 0.8, 0]);
    close(oblique.centres[1], [26, 48, 10]);
  });
  it('projects an out-of-plane direction into the face; refuses one square to it', () => {
    const tilted = resolveRow(row({ count: 2, pitch: 10, direction: [1, 0, 1] }), top);
    close(tilted.direction, [1, 0, 0]);
    close(tilted.centres[1], [30, 40, 10]);
    // A side face (cut along +Y): a top-face direction is projected, a normal one refused.
    const front = { position: [0, 0, 5], direction: [0, 1, 0] };
    close(resolveRow(row({ count: 2, pitch: 10, direction: [1, 0.5, 0] }), front).direction, [1, 0, 0]);
    expect(() => resolveRow(row({ direction: [0, -2, 0] }), front)).toThrow(
      'Row direction must lie in the face of the first hole.',
    );
  });
  it('gives the three messages for a bad count, spacing and direction', () => {
    for (const count of [0, 1.5, 101])
      expect(() => resolveRow(row({ count }), top)).toThrow('Holes in a row must be a whole number from 1 to 100.');
    for (const pitch of [0, -5])
      expect(() => resolveRow(row({ pitch }), top)).toThrow('Row spacing must be greater than zero.');
    expect(() => resolveRow(row({ direction: [0, 0, 3] }), top)).toThrow(
      'Row direction must lie in the face of the first hole.',
    );
  });
  it('takes count and spacing from expressions; a count of 1 is a single hole', () => {
    const parameters = { n: 3, pitch: 40 };
    const r = resolveRow(row({ count: '=n', pitch: '=pitch' }), top, parameters);
    expect(r).toMatchObject({ count: 3, pitch: 40 });
    expect(r.centres.map((c) => c[0])).toEqual([20, 60, 100]);
    const one = resolveRow(row({ count: '=n' }), top, { n: 1 });
    expect(one).toMatchObject({ count: 1, centres: [[20, 40, 10]] });
  });
});
