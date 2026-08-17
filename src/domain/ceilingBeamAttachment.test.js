import { describe, expect, it } from 'vitest';
import { pointInPolygon, polygonArea } from '@/geometry/polygon';
import { createBeam, createColumn } from './models';
import {
  CEILING_BEAM_ELEVATION_TOLERANCE,
  deriveCeilingBoundaryFromBeams,
  deriveCeilingStructuralCoverage,
  getCeilingSupportBeamLevels,
  getEligibleCeilingSupportBeams,
  isCeilingSupportBeam,
  resolveCeilingSupportBeams,
  selectCeilingBeamsForArea,
  selectCeilingCoverageSlabs,
  selectPreferredCeilingBeamLevel,
} from './ceilingBeamAttachment';

const BEAM_WIDTH = 250;
const BEAM_DEPTH = 450;
const BEAM_TOP = 3000;
const COLUMN_SIZE = 300;
const WIDTH = 9000;
const DEPTH = 6000;

function column(id, x, y) {
  return { ...createColumn(x, y, COLUMN_SIZE, COLUMN_SIZE, { height: BEAM_TOP }), id };
}

function beam(id, startId, endId, level = BEAM_TOP) {
  return {
    ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, BEAM_WIDTH, BEAM_DEPTH, level),
    id,
  };
}

// Four columns on a rectangle, rotated about the origin by `angle`.
function ringColumns(angle = 0) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    ['col_sw', 0, 0],
    ['col_se', WIDTH, 0],
    ['col_ne', WIDTH, DEPTH],
    ['col_nw', 0, DEPTH],
  ].map(([id, x, y]) => column(id, x * cos - y * sin, x * sin + y * cos));
}

// The four beams closing that ring, plus the pair alone for the simpler case.
const RING_BEAMS = [
  beam('beam_s', 'col_sw', 'col_se'),
  beam('beam_n', 'col_nw', 'col_ne'),
  beam('beam_w', 'col_sw', 'col_nw'),
  beam('beam_e', 'col_se', 'col_ne'),
];

function ringFloor({ angle = 0, beams = RING_BEAMS, elevation = 0 } = {}) {
  return { id: 'floor_1', elevation, floorToFloorHeight: BEAM_TOP, columns: ringColumns(angle), beams };
}

function boundsOf(boundary) {
  const xs = boundary.map((point) => point.x);
  const ys = boundary.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('ceiling support beam eligibility', () => {
  it('excludes a tie beam sitting at the floor datum and takes the beams above it', () => {
    const floor = ringFloor({
      beams: [
        // A slab/tie beam framing the deck this storey stands on: a ceiling hung
        // from it would be built into the floor.
        beam('beam_tie', 'col_sw', 'col_se', 0),
        beam('beam_top', 'col_nw', 'col_ne', BEAM_TOP),
      ],
    });

    expect(isCeilingSupportBeam(floor.beams[0], floor)).toBe(false);
    expect(isCeilingSupportBeam(floor.beams[1], floor)).toBe(true);
    expect(getEligibleCeilingSupportBeams(floor).map((entry) => entry.id)).toEqual(['beam_top']);
  });

  it('measures eligibility from the floor it stands on, not from zero', () => {
    const upper = ringFloor({ elevation: 3000, beams: [beam('beam_tie', 'col_sw', 'col_se', 3000)] });
    expect(getEligibleCeilingSupportBeams(upper)).toEqual([]);

    const raised = ringFloor({ elevation: 3000, beams: [beam('beam_top', 'col_sw', 'col_se', 6000)] });
    expect(getEligibleCeilingSupportBeams(raised).map((entry) => entry.id)).toEqual(['beam_top']);
  });

  it('keeps the tolerance band out: a beam has to clear the floor by more than 10 mm', () => {
    const onTolerance = ringFloor({
      beams: [beam('beam_edge', 'col_sw', 'col_se', CEILING_BEAM_ELEVATION_TOLERANCE)],
    });
    expect(getEligibleCeilingSupportBeams(onTolerance)).toEqual([]);

    const overTolerance = ringFloor({
      beams: [beam('beam_edge', 'col_sw', 'col_se', CEILING_BEAM_ELEVATION_TOLERANCE + 0.5)],
    });
    expect(getEligibleCeilingSupportBeams(overTolerance).map((entry) => entry.id)).toEqual(['beam_edge']);
  });

  it('ignores a beam carrying no usable level at all', () => {
    const floor = ringFloor({ beams: [{ ...beam('beam_nan', 'col_sw', 'col_se'), floorLevel: Number.NaN }] });
    expect(getEligibleCeilingSupportBeams(floor)).toEqual([]);
  });

  it('resolves stored beam ids against the floor, dropping the ones that are gone', () => {
    const floor = ringFloor();
    expect(resolveCeilingSupportBeams(floor, ['beam_e', 'beam_gone', 'beam_s']).map((entry) => entry.id)).toEqual([
      'beam_s',
      'beam_e',
    ]);
    expect(resolveCeilingSupportBeams(floor, [])).toEqual([]);
    expect(resolveCeilingSupportBeams(null, ['beam_s'])).toEqual([]);
  });
});

describe('ceiling support beam levels', () => {
  it('groups beams whose tops agree within tolerance and reports the plane they settle at', () => {
    const floor = ringFloor({
      beams: [
        beam('beam_low_a', 'col_sw', 'col_se', 2600),
        beam('beam_top_a', 'col_nw', 'col_ne', BEAM_TOP),
        // 6 mm out: the same level as far as anything hung from it is concerned.
        beam('beam_top_b', 'col_sw', 'col_nw', BEAM_TOP - 6),
        beam('beam_low_b', 'col_se', 'col_ne', 2604),
      ],
    });

    const levels = getCeilingSupportBeamLevels(floor);
    expect(levels.map((level) => level.beamIds)).toEqual([
      ['beam_top_a', 'beam_top_b'],
      ['beam_low_b', 'beam_low_a'],
    ]);
    // The lowest top in the group governs: nothing hangs from higher than the
    // support that stops first.
    expect(levels[0].elevation).toBe(BEAM_TOP - 6);
    expect(levels[1].elevation).toBe(2600);
    expect(levels[0].id).toBe('beam_level_2994');
  });

  it('prefers the level with the most beams, and the highest when they tie', () => {
    const busyLow = ringFloor({
      beams: [
        beam('beam_high', 'col_sw', 'col_se', 3400),
        beam('beam_low_a', 'col_nw', 'col_ne', 2800),
        beam('beam_low_b', 'col_sw', 'col_nw', 2800),
      ],
    });
    expect(selectPreferredCeilingBeamLevel(busyLow).beamIds).toEqual(['beam_low_a', 'beam_low_b']);

    const tied = ringFloor({
      beams: [
        beam('beam_high_a', 'col_sw', 'col_se', 3400),
        beam('beam_high_b', 'col_nw', 'col_ne', 3400),
        beam('beam_low_a', 'col_sw', 'col_nw', 2800),
        beam('beam_low_b', 'col_se', 'col_ne', 2800),
      ],
    });
    expect(selectPreferredCeilingBeamLevel(tied).elevation).toBe(3400);

    expect(selectPreferredCeilingBeamLevel(ringFloor({ beams: [] }))).toBeNull();
  });
});

describe('selectCeilingBeamsForArea', () => {
  const rect = (minX, minY, maxX, maxY) => [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  it('takes every beam the area runs under', () => {
    expect(selectCeilingBeamsForArea(ringFloor(), rect(0, 0, WIDTH, DEPTH))).toEqual([
      'beam_s',
      'beam_n',
      'beam_w',
      'beam_e',
    ]);
  });

  it('takes nothing from an area drawn clear of every beam', () => {
    // A room-sized area in the middle of the bay: the ring framing the next room
    // over says nothing about how high this ceiling hangs.
    expect(selectCeilingBeamsForArea(ringFloor(), rect(2000, 2000, 5000, 4000))).toEqual([]);
  });

  it('takes only the beams the area actually reaches', () => {
    // A strip across the bay: it runs under the two beams it crosses and stops
    // short of the two down the sides.
    expect(selectCeilingBeamsForArea(ringFloor(), rect(3000, 0, 4000, DEPTH))).toEqual(['beam_s', 'beam_n']);
  });

  it('leaves out a beam the outline only meets edge to edge', () => {
    // The south edge lands exactly on the south beam's far face. Sharing a line
    // is not running underneath it.
    expect(selectCeilingBeamsForArea(ringFloor(), rect(0, BEAM_WIDTH / 2, WIDTH, DEPTH))).toEqual([
      'beam_n',
      'beam_w',
      'beam_e',
    ]);
  });

  it('reduces the beams it found to one level by the same rule the floor uses', () => {
    const floor = ringFloor({
      beams: [
        beam('beam_high', 'col_sw', 'col_se', 3400),
        beam('beam_low_a', 'col_nw', 'col_ne', 2800),
        beam('beam_low_b', 'col_sw', 'col_nw', 2800),
      ],
    });

    // All three cross the area; a ceiling hangs from one plane, and the level
    // carried by the most beams is the one framing the room.
    expect(selectCeilingBeamsForArea(floor, rect(0, 0, WIDTH, DEPTH))).toEqual(['beam_low_a', 'beam_low_b']);
  });

  it('never offers a beam sitting at the floor datum, however much of the area it crosses', () => {
    const floor = ringFloor({
      beams: [beam('beam_tie', 'col_sw', 'col_se', 0), beam('beam_top', 'col_nw', 'col_ne', BEAM_TOP)],
    });

    expect(selectCeilingBeamsForArea(floor, rect(0, 0, WIDTH, DEPTH))).toEqual(['beam_top']);
  });

  it('takes nothing from an outline that is not an area', () => {
    const floor = ringFloor();

    expect(selectCeilingBeamsForArea(floor, [])).toEqual([]);
    expect(
      selectCeilingBeamsForArea(floor, [
        { x: 0, y: 0 },
        { x: WIDTH, y: 0 },
      ]),
    ).toEqual([]);
    expect(selectCeilingBeamsForArea(null, rect(0, 0, WIDTH, DEPTH))).toEqual([]);
  });
});

describe('deriveCeilingBoundaryFromBeams', () => {
  it('gives a ring of four beams the rectangle between their inner faces', () => {
    const floor = ringFloor();

    const bounds = boundsOf(deriveCeilingBoundaryFromBeams(floor.beams, floor));

    // The beams run down the middle of their own outlines, so the ceiling gives
    // up half a beam width on each side rather than burying its boards.
    expect(bounds.minX).toBeCloseTo(BEAM_WIDTH / 2, 6);
    expect(bounds.maxX).toBeCloseTo(WIDTH - BEAM_WIDTH / 2, 6);
    expect(bounds.minY).toBeCloseTo(BEAM_WIDTH / 2, 6);
    expect(bounds.maxY).toBeCloseTo(DEPTH - BEAM_WIDTH / 2, 6);
  });

  it('spans a parallel pair face to face, and runs the full length of the beams', () => {
    const floor = ringFloor({ beams: [RING_BEAMS[0], RING_BEAMS[1]] });

    const bounds = boundsOf(deriveCeilingBoundaryFromBeams(floor.beams, floor));

    expect(bounds.minY).toBeCloseTo(BEAM_WIDTH / 2, 6);
    expect(bounds.maxY).toBeCloseTo(DEPTH - BEAM_WIDTH / 2, 6);
    // Nothing bounds the run, so it is the beams' own extent — which stops at
    // the column faces the beams are trimmed to.
    expect(bounds.minX).toBeCloseTo(COLUMN_SIZE / 2, 6);
    expect(bounds.maxX).toBeCloseTo(WIDTH - COLUMN_SIZE / 2, 6);
  });

  it('lets a beam crossing the middle through: it obstructs the ceiling, it does not bound it', () => {
    const columns = [...ringColumns(), column('col_ms', WIDTH / 2, 0), column('col_mn', WIDTH / 2, DEPTH)];
    const floor = {
      id: 'floor_1',
      elevation: 0,
      columns,
      beams: [...RING_BEAMS, beam('beam_cross', 'col_ms', 'col_mn')],
    };

    const bounds = boundsOf(deriveCeilingBoundaryFromBeams(floor.beams, floor));

    expect(bounds.minX).toBeCloseTo(BEAM_WIDTH / 2, 6);
    expect(bounds.maxX).toBeCloseTo(WIDTH - BEAM_WIDTH / 2, 6);
  });

  it('follows the beam frame when the grid is rotated off plan north', () => {
    const angle = Math.PI / 6;
    const floor = ringFloor({ angle });

    const boundary = deriveCeilingBoundaryFromBeams(floor.beams, floor);
    const edge = (from, to) => Math.hypot(boundary[to].x - boundary[from].x, boundary[to].y - boundary[from].y);

    // The boundary is the rotated inner rectangle itself, not the plan bounding
    // box of it: its edges are the true clear dimensions.
    expect(edge(0, 1)).toBeCloseTo(WIDTH - BEAM_WIDTH, 6);
    expect(edge(1, 2)).toBeCloseTo(DEPTH - BEAM_WIDTH, 6);
    // ...and it is turned by the grid angle.
    expect(Math.atan2(boundary[1].y - boundary[0].y, boundary[1].x - boundary[0].x)).toBeCloseTo(angle, 9);
  });

  it('returns null when there is nothing sane to draw', () => {
    const floor = ringFloor();

    expect(deriveCeilingBoundaryFromBeams([], floor)).toBeNull();
    expect(deriveCeilingBoundaryFromBeams([RING_BEAMS[0]], floor)).toBeNull();
    // Beams whose columns are gone resolve to no geometry at all.
    expect(deriveCeilingBoundaryFromBeams(RING_BEAMS, { id: 'floor_1', columns: [] })).toBeNull();
    // Two beams face to face leave no depth between them.
    expect(
      deriveCeilingBoundaryFromBeams(
        [beam('beam_a', 'col_sw', 'col_se'), beam('beam_b', 'col_sw', 'col_se')],
        ringFloor(),
      ),
    ).toBeNull();
  });
});

const planRect = (minX, minY, maxX, maxY) => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: maxX, y: maxY },
  { x: minX, y: maxY },
];

// The storey's own footprint, and the same slab pulled 2000 mm east of the
// frame along its southern half — a cantilever, which is nothing but a slab
// drawn past the storey below it.
const FLUSH_SLAB = planRect(0, 0, WIDTH, DEPTH);
const CANTILEVER_SLAB = [
  { x: 0, y: 0 },
  { x: WIDTH + 2000, y: 0 },
  { x: WIDTH + 2000, y: 2000 },
  { x: WIDTH, y: 2000 },
  { x: WIDTH, y: DEPTH },
  { x: 0, y: DEPTH },
];
// Inside the overhang, past every beam: nothing under this point holds it up.
const OVERHANG_PROBE = { x: WIDTH + 1000, y: 1000 };

function upperFloor(...boundaries) {
  return {
    id: 'floor_2',
    levelIndex: 1,
    elevation: BEAM_TOP,
    floorToFloorHeight: BEAM_TOP,
    slabs: boundaries.map((boundaryPoints, index) => ({
      id: `slab_${index + 1}`,
      floorId: 'floor_2',
      elevation: BEAM_TOP,
      thickness: 200,
      boundaryPoints,
    })),
  };
}

function stack(floor, above = null) {
  return { floors: [floor, above].filter(Boolean) };
}

describe('deriveCeilingStructuralCoverage', () => {
  it('gives back the beam rectangle when nothing is stacked over the floor', () => {
    const floor = ringFloor();
    const beamOnly = deriveCeilingBoundaryFromBeams(floor.beams, floor);

    // Top floor, and a storey above that was never slabbed: both leave the beams
    // as the only authority there is.
    expect(deriveCeilingStructuralCoverage({ project: stack(floor), floor, supportBeams: floor.beams })).toEqual(
      beamOnly,
    );
    expect(
      deriveCeilingStructuralCoverage({ project: stack(floor, upperFloor()), floor, supportBeams: floor.beams }),
    ).toEqual(beamOnly);
    expect(deriveCeilingStructuralCoverage({ floor, supportBeams: floor.beams })).toEqual(beamOnly);
  });

  it('reaches out under a cantilevered slab, where there is no beam to be found', () => {
    const floor = ringFloor();
    const beamOnly = deriveCeilingBoundaryFromBeams(floor.beams, floor);
    const project = stack(floor, upperFloor(CANTILEVER_SLAB));

    const coverage = deriveCeilingStructuralCoverage({ project, floor, supportBeams: floor.beams });

    expect(pointInPolygon(OVERHANG_PROBE, coverage)).toBe(true);
    expect(pointInPolygon(OVERHANG_PROBE, beamOnly)).toBe(false);
    expect(polygonArea(coverage)).toBeGreaterThan(polygonArea(beamOnly));
    expect(boundsOf(coverage).maxX).toBeCloseTo(WIDTH + 2000, 6);
  });

  it('leaves out a slab the beam group never reaches', () => {
    const floor = ringFloor();
    const project = stack(floor, upperFloor(planRect(20000, 0, 26000, DEPTH)));

    expect(deriveCeilingStructuralCoverage({ project, floor, supportBeams: floor.beams })).toEqual(
      deriveCeilingBoundaryFromBeams(floor.beams, floor),
    );
    expect(selectCeilingCoverageSlabs({ project, floor, supportBeams: floor.beams }).slabs).toEqual([]);
  });

  it('covers both slabs when a terrace is poured alongside the main one', () => {
    const floor = ringFloor();
    const terrace = planRect(WIDTH - 1000, 0, WIDTH + 3000, 3000);
    const project = stack(floor, upperFloor(FLUSH_SLAB, terrace));

    const coverage = deriveCeilingStructuralCoverage({ project, floor, supportBeams: floor.beams });

    expect(selectCeilingCoverageSlabs({ project, floor, supportBeams: floor.beams }).slabs).toHaveLength(2);
    expect(pointInPolygon({ x: WIDTH / 2, y: DEPTH / 2 }, coverage)).toBe(true);
    expect(pointInPolygon({ x: WIDTH + 2000, y: 1500 }, coverage)).toBe(true);
    expect(boundsOf(coverage).maxX).toBeCloseTo(WIDTH + 3000, 6);
  });

  it('falls back on the slab alone when the beams give no rectangle', () => {
    const floor = ringFloor();
    const project = stack(floor, upperFloor(CANTILEVER_SLAB));

    // One beam bounds nothing, so there is no rectangle to union with — but the
    // slab overhead still says exactly what this ceiling closes off.
    expect(deriveCeilingStructuralCoverage({ project, floor, supportBeams: [RING_BEAMS[0]] })).toEqual(CANTILEVER_SLAB);
    expect(deriveCeilingStructuralCoverage({ project, floor, supportBeams: [] })).toEqual(CANTILEVER_SLAB);
    // With no rectangle to be local to, every slab up there is a candidate.
    expect(selectCeilingCoverageSlabs({ project, floor, supportBeams: [] }).slabs).toHaveLength(1);
  });

  it('picks one region out of a union that came apart, and never two', () => {
    const floor = ringFloor();
    const wing = planRect(20000, 0, 26000, DEPTH);
    const project = stack(floor, upperFloor(FLUSH_SLAB, wing));

    // No beams, so nothing filters the far wing out and the union is two
    // separate regions. A ceiling is one flat ring, so the bigger region wins.
    const coverage = deriveCeilingStructuralCoverage({ project, floor, supportBeams: [] });

    expect(polygonArea(FLUSH_SLAB)).toBeGreaterThan(polygonArea(wing));
    expect(coverage).toEqual(FLUSH_SLAB);
    expect(pointInPolygon({ x: 23000, y: 3000 }, coverage)).toBe(false);
  });
});
