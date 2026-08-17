import { describe, expect, it } from 'vitest';
import {
  buildReferenceSnapGeometry,
  findParallelSupportLine,
  resolveReferenceSnapGeometry,
  snapOffsetToReference,
  snapPointToReference,
} from './referenceSnap';

/**
 * The floor below, as the ghost underlay draws it: one 6000 wall along y=0 and a
 * 300 column parked off it at (0, 4000). Everything here is millimetres, and the
 * tolerance used throughout is 100mm — SNAP_DISTANCE_PX (10) at the default 0.1
 * zoom.
 */
const TOLERANCE = 100;

function floorBelow() {
  return {
    id: 'floor_below',
    walls: [{ id: 'wall_below', start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, thickness: 200 }],
    columns: [{ id: 'col_below', x: 0, y: 4000, width: 300, depth: 300 }],
  };
}

describe('buildReferenceSnapGeometry', () => {
  it('returns empty geometry for no floor at all', () => {
    expect(buildReferenceSnapGeometry(null)).toEqual({ points: [], segments: [] });
    expect(buildReferenceSnapGeometry(undefined)).toEqual({ points: [], segments: [] });
  });

  it('returns empty geometry for a floor with nothing on it', () => {
    expect(buildReferenceSnapGeometry({ id: 'empty', walls: [], columns: [] })).toEqual({ points: [], segments: [] });
    expect(buildReferenceSnapGeometry({ id: 'bare' })).toEqual({ points: [], segments: [] });
  });

  it('takes wall endpoints and column centres as points, wall centrelines as segments', () => {
    const geometry = buildReferenceSnapGeometry(floorBelow());

    expect(geometry.points).toEqual([
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 0, y: 4000 },
    ]);
    expect(geometry.segments).toEqual([{ start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } }]);
  });

  it('keeps a zero-length wall as points but not as a segment to project onto', () => {
    const floor = {
      id: 'degenerate',
      walls: [{ id: 'w', start: { x: 500, y: 500 }, end: { x: 500, y: 500 } }],
      columns: [],
    };

    expect(buildReferenceSnapGeometry(floor).points).toHaveLength(2);
    expect(buildReferenceSnapGeometry(floor).segments).toHaveLength(0);
  });

  it('memoizes on the floor object, because it runs on every pointer event', () => {
    const floor = floorBelow();

    expect(buildReferenceSnapGeometry(floor)).toBe(buildReferenceSnapGeometry(floor));
    // A different object with the same contents is a different (edited) floor.
    expect(buildReferenceSnapGeometry(floorBelow())).not.toBe(buildReferenceSnapGeometry(floor));
  });
});

describe('resolveReferenceSnapGeometry', () => {
  it('gives geometry only when snapping is on AND the ghost is on screen', () => {
    const floor = floorBelow();

    expect(
      resolveReferenceSnapGeometry({ floorBelow: floor, showFloorBelowUnderlay: true, snapEnabled: true }),
    ).not.toBeNull();
    // A layer you cannot see must never tug the cursor.
    expect(
      resolveReferenceSnapGeometry({ floorBelow: floor, showFloorBelowUnderlay: false, snapEnabled: true }),
    ).toBeNull();
    expect(
      resolveReferenceSnapGeometry({ floorBelow: floor, showFloorBelowUnderlay: true, snapEnabled: false }),
    ).toBeNull();
    expect(
      resolveReferenceSnapGeometry({ floorBelow: null, showFloorBelowUnderlay: true, snapEnabled: true }),
    ).toBeNull();
  });

  it('gives null for a floor below with nothing to snap to', () => {
    expect(
      resolveReferenceSnapGeometry({
        floorBelow: { id: 'empty', walls: [], columns: [] },
        showFloorBelowUnderlay: true,
        snapEnabled: true,
      }),
    ).toBeNull();
  });
});

describe('snapPointToReference', () => {
  const geometry = buildReferenceSnapGeometry(floorBelow());

  it('projects onto a wall centreline below', () => {
    expect(snapPointToReference({ x: 3000, y: 60 }, geometry, TOLERANCE)).toEqual({
      x: 3000,
      y: 0,
      kind: 'reference-line',
    });
  });

  it('prefers the endpoint even when the line through it is nearer', () => {
    // 50 from the corner at (0,0), but only 40 from the centreline it sits on.
    // The corner is the place a user aims at; the line is a thousand equivalent
    // ones.
    expect(snapPointToReference({ x: 30, y: 40 }, geometry, TOLERANCE)).toEqual({
      x: 0,
      y: 0,
      kind: 'reference-point',
    });
  });

  it('catches a column centre below', () => {
    expect(snapPointToReference({ x: 40, y: 4030 }, geometry, TOLERANCE)).toEqual({
      x: 0,
      y: 4000,
      kind: 'reference-point',
    });
  });

  it('misses when the foot of the perpendicular falls off the end of the wall', () => {
    // Level with the wall line but 180 past its end: the projection is outside
    // the segment, and the endpoint itself is out of reach.
    expect(snapPointToReference({ x: 6180, y: 20 }, geometry, TOLERANCE)).toBeNull();
  });

  it('misses beyond tolerance', () => {
    expect(snapPointToReference({ x: 3000, y: 101 }, geometry, TOLERANCE)).toBeNull();
  });

  it('takes the nearest of several candidates', () => {
    const twoWalls = buildReferenceSnapGeometry({
      id: 'two',
      walls: [
        { id: 'a', start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } },
        { id: 'b', start: { x: 0, y: 150 }, end: { x: 6000, y: 150 } },
      ],
      columns: [],
    });

    expect(snapPointToReference({ x: 3000, y: 90 }, twoWalls, TOLERANCE)).toMatchObject({ y: 150 });
  });

  it('is inert without geometry or tolerance', () => {
    expect(snapPointToReference({ x: 0, y: 0 }, null, TOLERANCE)).toBeNull();
    expect(snapPointToReference({ x: 0, y: 0 }, geometry, 0)).toBeNull();
    expect(snapPointToReference(null, geometry, TOLERANCE)).toBeNull();
  });
});

/**
 * Edge-offset snapping: the plate's top edge sits at y=1000, its outward normal
 * points up the page (-y in this y-down space), and the wall below runs along
 * y=0. Pushing the edge out 1000 lands it dead on that wall line — which is what
 * "drag the plate until it clicks onto the wall below" has to mean.
 */
describe('snapOffsetToReference', () => {
  const ORIGIN_EDGE = { start: { x: 0, y: 1000 }, end: { x: 6000, y: 1000 } };
  const NORMAL = { x: 0, y: -1 };

  function referenceWall(start, end) {
    return buildReferenceSnapGeometry({ id: `ref_${end.y}`, walls: [{ id: 'w', start, end }], columns: [] });
  }

  const parallel = referenceWall({ x: 0, y: 0 }, { x: 6000, y: 0 });

  it('pulls a near-enough push onto the wall line below', () => {
    expect(snapOffsetToReference(ORIGIN_EDGE, NORMAL, 960, parallel, TOLERANCE)).toBe(1000);
    expect(snapOffsetToReference(ORIGIN_EDGE, NORMAL, 1040, parallel, TOLERANCE)).toBe(1000);
  });

  it('leaves a push that is nowhere near it alone', () => {
    expect(snapOffsetToReference(ORIGIN_EDGE, NORMAL, 700, parallel, TOLERANCE)).toBeNull();
    expect(snapOffsetToReference(ORIGIN_EDGE, NORMAL, 1101, parallel, TOLERANCE)).toBeNull();
  });

  it('accepts a reference line within 3 degrees of parallel', () => {
    // 200 rise over 6000 run — 1.9 degrees, a wall the user reads as parallel.
    const nearlyParallel = referenceWall({ x: 0, y: 0 }, { x: 6000, y: 200 });

    expect(snapOffsetToReference(ORIGIN_EDGE, NORMAL, 880, nearlyParallel, TOLERANCE)).toBe(900);
  });

  it('rejects a reference line beyond 3 degrees, however close the number lands', () => {
    // 600 over 6000 — 5.7 degrees. Its midpoint would give an offset of 700, in
    // easy reach of the drag, but the edge would not end up ON it.
    const skewed = referenceWall({ x: 0, y: 0 }, { x: 6000, y: 600 });

    expect(snapOffsetToReference(ORIGIN_EDGE, NORMAL, 700, skewed, TOLERANCE)).toBeNull();
  });

  it('ignores a perpendicular wall entirely', () => {
    // A wall crossing the edge's travel says nothing about where it should stop.
    const perpendicular = referenceWall({ x: 3000, y: -2000 }, { x: 3000, y: 2000 });

    expect(snapOffsetToReference(ORIGIN_EDGE, NORMAL, 0, perpendicular, TOLERANCE)).toBeNull();
    expect(snapOffsetToReference(ORIGIN_EDGE, NORMAL, 1000, perpendicular, TOLERANCE)).toBeNull();
  });

  it('reads a wall drawn the other way round as the same line', () => {
    const reversed = referenceWall({ x: 6000, y: 0 }, { x: 0, y: 0 });

    expect(snapOffsetToReference(ORIGIN_EDGE, NORMAL, 960, reversed, TOLERANCE)).toBe(1000);
  });

  it('takes the candidate closest to the raw offset when two lines are in reach', () => {
    const twoLines = buildReferenceSnapGeometry({
      id: 'two_lines',
      walls: [
        { id: 'a', start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } },
        { id: 'b', start: { x: 0, y: 100 }, end: { x: 6000, y: 100 } },
      ],
      columns: [],
    });

    // Offsets on offer are 1000 and 900; the drag is asking for 940.
    expect(snapOffsetToReference(ORIGIN_EDGE, NORMAL, 940, twoLines, TOLERANCE)).toBe(900);
  });

  it('is inert for a degenerate edge or missing geometry', () => {
    const degenerate = { start: { x: 0, y: 1000 }, end: { x: 0, y: 1000 } };

    expect(snapOffsetToReference(degenerate, NORMAL, 1000, parallel, TOLERANCE)).toBeNull();
    expect(snapOffsetToReference(ORIGIN_EDGE, NORMAL, 1000, null, TOLERANCE)).toBeNull();
    expect(snapOffsetToReference(null, NORMAL, 1000, parallel, TOLERANCE)).toBeNull();
  });
});

/**
 * The support line a typed cantilever is measured from.
 *
 * Same plate edge as above — running along y=1000 with its outward normal
 * pointing up the page — because the sign is the whole point of this function:
 * in a y-down space "outward" is -y here, so a line at y=0 is OUTSIDE the edge
 * (+1000) and one at y=1400 is inside the plate (-400). Getting that backwards
 * would land every cantilever on the wrong side of its beam.
 */
describe('findParallelSupportLine', () => {
  const ORIGIN_EDGE = { start: { x: 0, y: 1000 }, end: { x: 6000, y: 1000 } };
  const NORMAL = { x: 0, y: -1 };

  function wallAt(y, options = {}) {
    return {
      id: `wall_${y}`,
      start: { x: options.x0 ?? 0, y },
      end: { x: options.x1 ?? 6000, y: options.y1 ?? y },
      thickness: 200,
    };
  }

  /** A beam on two columns, which is how beams are actually drawn. */
  function beamOnColumns(y) {
    return {
      floor: {
        columns: [
          { id: `col_w_${y}`, x: 0, y, width: 300, depth: 300 },
          { id: `col_e_${y}`, x: 6000, y, width: 300, depth: 300 },
        ],
        beams: [
          {
            id: `beam_${y}`,
            startRef: { kind: 'column', id: `col_w_${y}` },
            endRef: { kind: 'column', id: `col_e_${y}` },
            width: 250,
            depth: 450,
          },
        ],
      },
    };
  }

  it('measures a wall line INSIDE the plate as a negative offset', () => {
    // y=1400 is 400 into the plate, against an outward normal of -y.
    const support = findParallelSupportLine(ORIGIN_EDGE, NORMAL, { walls: [wallAt(1400)], columns: [] });

    expect(support).toEqual({ kind: 'wall', offsetMm: -400 });
  });

  it('measures a wall line OUTSIDE the current edge as a positive offset', () => {
    const support = findParallelSupportLine(ORIGIN_EDGE, NORMAL, { walls: [wallAt(750)], columns: [] });

    expect(support).toEqual({ kind: 'wall', offsetMm: 250 });
  });

  it('finds a beam axis through its render data, columns and all', () => {
    const { floor } = beamOnColumns(1600);

    // Trimming at the column faces shortens the axis but cannot move the line
    // it runs along, which is the only thing the offset depends on.
    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, floor)).toEqual({ kind: 'beam', offsetMm: -600 });
  });

  it('reads a beam on bare point refs the same way', () => {
    const floor = {
      walls: [],
      columns: [],
      beams: [
        {
          id: 'beam_free',
          startRef: { kind: 'point', x: 0, y: 1900 },
          endRef: { kind: 'point', x: 6000, y: 1900 },
          width: 250,
          depth: 450,
        },
      ],
    };

    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, floor)).toEqual({ kind: 'beam', offsetMm: -900 });
  });

  it('skips a beam whose refs resolve to nothing', () => {
    const floor = {
      walls: [],
      columns: [],
      beams: [
        {
          id: 'beam_orphan',
          startRef: { kind: 'column', id: 'col_gone' },
          endRef: { kind: 'column', id: 'col_also_gone' },
          width: 250,
          depth: 450,
        },
      ],
    };

    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, floor)).toBeNull();
  });

  it('accepts a line within 3 degrees of parallel and rejects one beyond it', () => {
    // 200 over 6000 is 1.9 degrees — a wall anyone would call parallel.
    const nearlyParallel = { walls: [wallAt(1400, { y1: 1600 })], columns: [] };
    // 600 over 6000 is 5.7 degrees. Its midpoint is in easy reach, but the edge
    // would not end up parallel to it, so the number would mean nothing.
    const skewed = { walls: [wallAt(1400, { y1: 2000 })], columns: [] };

    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, nearlyParallel)).toEqual({ kind: 'wall', offsetMm: -500 });
    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, skewed)).toBeNull();
  });

  it('ignores a wall crossing the edge, however close it runs', () => {
    const crossing = {
      walls: [{ id: 'w_cross', start: { x: 3000, y: -2000 }, end: { x: 3000, y: 3000 } }],
      columns: [],
    };

    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, crossing)).toBeNull();
  });

  it('ignores a parallel line further off than the reach', () => {
    // 3200 below the edge: a different bay, not the support under this one.
    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, { walls: [wallAt(4200)], columns: [] })).toBeNull();
    // And the boundary itself is in.
    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, { walls: [wallAt(4000)], columns: [] })).toEqual({
      kind: 'wall',
      offsetMm: -3000,
    });
  });

  it('honours an overridden reach and skew', () => {
    const far = { walls: [wallAt(4200)], columns: [] };

    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, far, { maxDistanceMm: 4000 })).toEqual({
      kind: 'wall',
      offsetMm: -3200,
    });
    expect(
      findParallelSupportLine(ORIGIN_EDGE, NORMAL, { walls: [wallAt(1400, { y1: 2000 })] }, { maxSkewDegrees: 8 }),
    ).toEqual({ kind: 'wall', offsetMm: -700 });
  });

  it('takes the nearest candidate, whichever kind it is', () => {
    // Wall at -200 against a beam at -900.
    const wallNearer = { ...beamOnColumns(1900).floor, walls: [wallAt(1200)] };
    // Beam at -200 against a wall on the far side of the edge at +600 — nearest
    // is measured as a distance, so which side it sits on does not enter into it.
    const beamNearer = { ...beamOnColumns(1200).floor, walls: [wallAt(400)] };

    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, wallNearer)).toEqual({ kind: 'wall', offsetMm: -200 });
    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, beamNearer)).toEqual({ kind: 'beam', offsetMm: -200 });
  });

  it('has nothing to say with no floor below, no edge, or no normal', () => {
    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, null)).toBeNull();
    expect(findParallelSupportLine(ORIGIN_EDGE, NORMAL, { walls: [], columns: [] })).toBeNull();
    expect(findParallelSupportLine(null, NORMAL, { walls: [wallAt(1400)] })).toBeNull();
    expect(findParallelSupportLine(ORIGIN_EDGE, null, { walls: [wallAt(1400)] })).toBeNull();
  });

  it('has no line to be parallel to when the edge is degenerate', () => {
    const degenerate = { start: { x: 0, y: 1000 }, end: { x: 0, y: 1000 } };

    expect(findParallelSupportLine(degenerate, NORMAL, { walls: [wallAt(1400)] })).toBeNull();
  });
});
