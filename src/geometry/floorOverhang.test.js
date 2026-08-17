import { describe, expect, it } from 'vitest';
import { createSlab } from '@/domain/models';
import {
  beamSupportsOverhang,
  computeFloorOverhangs,
  computeSlabOverhang,
  findOverhangSupportColumn,
  getFloorFootprintPolygons,
  overhangEdgeInwardNormal,
  overhangRunRetractionMm,
  overhangSupportStations,
  planOverhangSupportBeams,
  segmentGap,
} from './floorOverhang';
import { distanceToSegment } from './line';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

function slabOf(id, boundaryPoints, { thickness = 200, elevation = 0 } = {}) {
  return { ...createSlab('floor', boundaryPoints, thickness, elevation), id };
}

function floorOf(id, levelIndex, elevation, slabs) {
  return { id, levelIndex, elevation, floorToFloorHeight: 3000, slabs, beams: [], columns: [], walls: [] };
}

describe('computeSlabOverhang', () => {
  const below = [rectangle(0, 0, 5000, 5000)];

  it('reports nothing when the slab sits inside the floor below', () => {
    const slab = slabOf('slab_inside', rectangle(500, 500, 3000, 3000));
    const result = computeSlabOverhang(slab, below);

    expect(result.maxDepthMm).toBe(0);
    expect(result.overhangEdges).toEqual([]);
  });

  it('treats a slab aligned to the floor below as supported, not overhanging', () => {
    // Exactly coincident edges are the normal case; a stack of identical floors
    // must not light up as a building of cantilevers.
    const slab = slabOf('slab_aligned', rectangle(0, 0, 5000, 5000));

    expect(computeSlabOverhang(slab, below).maxDepthMm).toBe(0);
  });

  it('measures a single edge pushed 600 mm past the floor below', () => {
    const slab = slabOf('slab_600', rectangle(0, 0, 5000, 5600));
    const result = computeSlabOverhang(slab, below);

    expect(result.slabId).toBe('slab_600');
    expect(result.maxDepthMm).toBeCloseTo(600, 5);

    // The far edge, plus the overhanging tail of each return edge.
    expect(result.overhangEdges.length).toBe(3);
    const deepest = result.overhangEdges.reduce((best, edge) => (edge.depthMm > best.depthMm ? edge : best));
    expect(deepest.depthMm).toBeCloseTo(600, 5);
    // Every reported run has length; a zero-length "edge" is unusable downstream.
    for (const edge of result.overhangEdges) {
      expect(Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y)).toBeGreaterThan(0);
    }
  });

  it('follows an L-shaped slab and reports only the projecting arm', () => {
    const slab = slabOf('slab_l', [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 6000 },
      { x: 3000, y: 6000 },
      { x: 3000, y: 9000 },
      { x: 0, y: 9000 },
    ]);
    const result = computeSlabOverhang(slab, [rectangle(0, 0, 6000, 6000)]);

    expect(result.maxDepthMm).toBeCloseTo(3000, 5);
    // Nothing on the three edges that sit over the floor below.
    for (const edge of result.overhangEdges) {
      expect(Math.max(edge.start.y, edge.end.y)).toBeGreaterThan(6000);
    }
  });

  it('returns null when there is no floor below to compare against', () => {
    // Absence of evidence, not evidence of a cantilever: reporting the whole
    // perimeter here would bury every real overhang in the project.
    const slab = slabOf('slab_alone', rectangle(0, 0, 5000, 5000));

    expect(computeSlabOverhang(slab, [])).toBeNull();
    expect(computeSlabOverhang(slab, null)).toBeNull();
  });

  it('returns null for a degenerate slab boundary', () => {
    expect(
      computeSlabOverhang(
        slabOf('slab_line', [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ]),
        below,
      ),
    ).toBeNull();
  });
});

describe('a run knows which boundary edge it came off', () => {
  const below = [rectangle(0, 0, 5000, 5000)];

  it('names the edge for the projecting edge and for each corner tail', () => {
    // 0: (0,0)->(5000,0) sits over the floor below, so it reports nothing.
    // 1 and 3 are the returns, overhanging only at their far ends; 2 is the
    // whole projecting edge.
    const result = computeSlabOverhang(slabOf('slab_600', rectangle(0, 0, 5000, 5600)), below);

    expect(result.overhangEdges.map((edge) => edge.boundaryEdgeIndex)).toEqual([1, 2, 3]);
  });

  it('points at an edge the run actually lies on, corners included', () => {
    // The strong version of the claim: re-deriving the edge by proximity is
    // ambiguous at a corner, so the index has to be carried, and it has to be
    // right. A run is a sub-segment, so both its ends sit ON its named edge.
    const boundary = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 6000 },
      { x: 3000, y: 6000 },
      { x: 3000, y: 9000 },
      { x: 0, y: 9000 },
    ];
    const result = computeSlabOverhang(slabOf('slab_l', boundary), [rectangle(0, 0, 6000, 6000)]);

    expect(result.overhangEdges.length).toBeGreaterThan(0);
    for (const edge of result.overhangEdges) {
      const index = edge.boundaryEdgeIndex;
      const start = boundary[index];
      const end = boundary[(index + 1) % boundary.length];
      expect(distanceToSegment(edge.start, start, end)).toBeLessThan(1e-6);
      expect(distanceToSegment(edge.end, start, end)).toBeLessThan(1e-6);
    }
  });

  it('survives the trip through computeFloorOverhangs', () => {
    const project = {
      floors: [
        floorOf('ground', 0, 0, [slabOf('slab_lower', rectangle(0, 0, 5000, 5000))]),
        floorOf('first', 1, 3000, [slabOf('slab_upper', rectangle(0, 0, 5000, 6200), { elevation: 3000 })]),
      ],
    };

    const [overhang] = computeFloorOverhangs(project);
    for (const edge of overhang.overhangEdges) {
      expect(Number.isInteger(edge.boundaryEdgeIndex)).toBe(true);
    }
  });
});

/* ── How far back a run has to come ───────────────────────────────────────
 *
 * The travel is NOT the run's depth, and every case below is a case where they
 * differ. The depth is the distance to the nearest thing below in whatever
 * direction that thing lies; the travel is along the edge's own normal, which is
 * the only way an edge can move.
 */
describe('overhangRunRetractionMm', () => {
  const plate = rectangle(0, 0, 5000, 5600);

  function runsOf(boundaryPoints, below) {
    return computeSlabOverhang(slabOf('slab', boundaryPoints), below).overhangEdges;
  }

  function runOnEdge(runs, boundaryEdgeIndex) {
    return runs.filter((run) => run.boundaryEdgeIndex === boundaryEdgeIndex).sort((a, b) => b.lengthMm - a.lengthMm)[0];
  }

  it('is the plain reach when the support line below runs parallel to the edge', () => {
    const below = [rectangle(0, 0, 5000, 5000)];
    const run = runOnEdge(runsOf(plate, below), 2);

    expect(overhangRunRetractionMm(run, plate, below)).toBeCloseTo(600, 6);
  });

  it('is the travel the far end needs when the line below is not parallel', () => {
    // The below footprint's edge falls away from y=5000 to y=3000. The measured
    // depth is the perpendicular distance to that slanted line; the travel is
    // how far the edge has to come DOWN the page at its worst point, 2600.
    const below = [
      [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 3000 },
        { x: 0, y: 5000 },
      ],
    ];
    const run = runOnEdge(runsOf(plate, below), 2);

    expect(run.depthMm).toBeLessThan(2600);
    expect(overhangRunRetractionMm(run, plate, below)).toBeCloseTo(2600, 6);
  });

  it('measures only what this edge can reach, on a bay that projects two ways', () => {
    // Overhanging west and south at once. The south edge's deepest sample is
    // the diagonal gap at the corner — which pulling the south edge back can
    // never cover, because it is the west edge that leaves it open. So the
    // travel is the 600 the rest of the run needs, not the 781 to that corner.
    const below = [rectangle(500, 0, 2500, 5000)];
    const plateTwoWays = rectangle(0, 0, 3000, 5600);
    const run = runOnEdge(runsOf(plateTwoWays, below), 2);

    expect(run.depthMm).toBeCloseTo(781, 0);
    expect(overhangRunRetractionMm(run, plateTwoWays, below)).toBeCloseTo(600, 6);
  });

  it('has no answer for a corner tail, which its own edge can never carry', () => {
    // The short run at the end of a return edge hangs over nothing because of
    // the edge NEXT to it: moving this one inward only narrows the plate.
    const below = [rectangle(0, 0, 5000, 5000)];
    const tail = runOnEdge(runsOf(plate, below), 1);

    expect(tail.depthMm).toBeCloseTo(600, 6);
    expect(overhangRunRetractionMm(tail, plate, below)).toBeNull();
  });

  it('has no answer without a footprint, a direction, or a plate behind the edge', () => {
    const below = [rectangle(0, 0, 5000, 5000)];
    const run = runOnEdge(runsOf(plate, below), 2);

    expect(overhangRunRetractionMm(run, plate, [])).toBeNull();
    expect(overhangRunRetractionMm(run, [], below)).toBeNull();
    expect(overhangRunRetractionMm({ start: run.start, end: run.start }, plate, below)).toBeNull();
  });
});

describe('getFloorFootprintPolygons', () => {
  it('keeps valid slabs and drops degenerate ones', () => {
    const floor = floorOf('ground', 0, 0, [
      slabOf('good', rectangle(0, 0, 4000, 4000)),
      slabOf('bad', [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    ]);

    expect(getFloorFootprintPolygons(floor)).toHaveLength(1);
    expect(getFloorFootprintPolygons(null)).toEqual([]);
  });
});

describe('computeFloorOverhangs', () => {
  it('measures the upper floor against the floor ordered below it', () => {
    const project = {
      floors: [
        floorOf('first', 1, 3000, [slabOf('slab_upper', rectangle(0, 0, 5000, 6200), { elevation: 3000 })]),
        floorOf('ground', 0, 0, [slabOf('slab_lower', rectangle(0, 0, 5000, 5000))]),
      ],
    };

    const overhangs = computeFloorOverhangs(project);

    expect(overhangs).toHaveLength(1);
    expect(overhangs[0]).toMatchObject({ floorId: 'first', belowFloorId: 'ground', slabId: 'slab_upper' });
    expect(overhangs[0].maxDepthMm).toBeCloseTo(1200, 5);
  });

  it('ignores the lowest floor and snap-sized differences', () => {
    const project = {
      floors: [
        floorOf('ground', 0, 0, [slabOf('slab_lower', rectangle(0, 0, 5000, 5000))]),
        floorOf('first', 1, 3000, [slabOf('slab_upper', rectangle(0, 0, 5000, 5040), { elevation: 3000 })]),
      ],
    };

    expect(computeFloorOverhangs(project)).toEqual([]);
  });

  it('skips a storey whose floor below has no slab to compare against', () => {
    const project = {
      floors: [
        floorOf('ground', 0, 0, []),
        floorOf('first', 1, 3000, [slabOf('slab_upper', rectangle(0, 0, 5000, 9000), { elevation: 3000 })]),
      ],
    };

    expect(computeFloorOverhangs(project)).toEqual([]);
  });
});

describe('beamSupportsOverhang', () => {
  const overhangEdges = [{ start: { x: 0, y: 5600 }, end: { x: 5000, y: 5600 }, depthMm: 600 }];

  it('accepts a beam running under the overhanging edge', () => {
    expect(beamSupportsOverhang({ start: { x: 0, y: 5550 }, end: { x: 5000, y: 5550 } }, overhangEdges)).toBe(true);
  });

  it('accepts a beam that crosses the edge', () => {
    expect(beamSupportsOverhang({ start: { x: 2500, y: 4000 }, end: { x: 2500, y: 6000 } }, overhangEdges)).toBe(true);
  });

  it('rejects a beam too far inboard to be carrying it', () => {
    expect(beamSupportsOverhang({ start: { x: 0, y: 5000 }, end: { x: 5000, y: 5000 } }, overhangEdges)).toBe(false);
  });

  it('rejects an unresolved axis or an empty edge list', () => {
    expect(beamSupportsOverhang(null, overhangEdges)).toBe(false);
    expect(beamSupportsOverhang({ start: { x: 0, y: 5600 }, end: { x: 5000, y: 5600 } }, [])).toBe(false);
  });
});

describe('segmentGap', () => {
  it('is zero for crossing segments and the perpendicular distance for parallel ones', () => {
    expect(segmentGap({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: -50 }, { x: 50, y: 50 })).toBe(0);
    expect(segmentGap({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 40 }, { x: 100, y: 40 })).toBeCloseTo(40, 5);
  });
});

describe('overhangSupportStations', () => {
  // Run start first, so a station's place in the list follows the edge.
  const run = { start: { x: 3000, y: 5600 }, end: { x: 0, y: 5600 } };

  it('holds both ends inside the corners and fills the middle to the spacing', () => {
    const stations = overhangSupportStations(run);

    expect(stations).toHaveLength(3);
    expect(stations[0]).toEqual({ x: 2850, y: 5600 });
    expect(stations[2]).toEqual({ x: 150, y: 5600 });
    for (let index = 1; index < stations.length; index += 1) {
      expect(Math.abs(stations[index].x - stations[index - 1].x)).toBeLessThanOrEqual(1800);
    }
  });

  it('adds stations as the run grows so no stretch is left unspaced', () => {
    const long = overhangSupportStations({ start: { x: 0, y: 0 }, end: { x: 12000, y: 0 } });

    expect(long).toHaveLength(8);
    expect(long[0].x).toBeCloseTo(150, 5);
    expect(long[long.length - 1].x).toBeCloseTo(11850, 5);
  });

  it('gives a run too short for two beams a single one at its middle', () => {
    // A 550 mm nib: two inset stations would land 250 mm apart and duplicate
    // each other.
    expect(overhangSupportStations({ start: { x: 0, y: 0 }, end: { x: 550, y: 0 } })).toEqual([{ x: 275, y: 0 }]);
  });

  it('reports nothing for a degenerate run', () => {
    expect(overhangSupportStations({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } })).toEqual([]);
    expect(overhangSupportStations(null)).toEqual([]);
  });
});

describe('overhangEdgeInwardNormal', () => {
  const boundary = rectangle(0, 0, 3000, 5600);

  it('points back into the slab from the projecting edge', () => {
    const normal = overhangEdgeInwardNormal({ start: { x: 3000, y: 5600 }, end: { x: 0, y: 5600 } }, boundary);

    expect(normal.x).toBeCloseTo(0, 9);
    expect(normal.y).toBeCloseTo(-1, 9);
  });

  it('follows the boundary whichever way it is wound', () => {
    const reversed = [...boundary].reverse();
    const normal = overhangEdgeInwardNormal({ start: { x: 0, y: 5600 }, end: { x: 3000, y: 5600 } }, reversed);

    expect(normal.x).toBeCloseTo(0, 9);
    expect(normal.y).toBeCloseTo(-1, 9);
  });

  it('has no answer without a polygon to be inside of', () => {
    expect(overhangEdgeInwardNormal({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }, [])).toBeNull();
    expect(overhangEdgeInwardNormal({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }, boundary)).toBeNull();
  });
});

describe('findOverhangSupportColumn', () => {
  const station = { x: 1500, y: 5600 };
  const inward = { x: 0, y: -1 };

  it('takes the nearest column that lies the way the beam wants to run', () => {
    const found = findOverhangSupportColumn(station, inward, [
      { id: 'far', x: 1500, y: 2000 },
      { id: 'near', x: 1500, y: 3000 },
    ]);

    expect(found.column.id).toBe('near');
    expect(found.spanMm).toBeCloseTo(2600, 5);
    expect(found.deviationDegrees).toBeCloseTo(0, 5);
  });

  it('refuses a column so far off the normal that the beam would be a diagonal', () => {
    // 45° off: closer than the aligned one, and still the wrong member.
    expect(findOverhangSupportColumn(station, inward, [{ id: 'sideways', x: 500, y: 4600 }])).toBeNull();
  });

  it('refuses a column beyond the search reach', () => {
    expect(findOverhangSupportColumn(station, inward, [{ id: 'distant', x: 1500, y: -900 }])).toBeNull();
    expect(findOverhangSupportColumn(station, inward, [])).toBeNull();
  });
});

describe('planOverhangSupportBeams', () => {
  // A 3 m edge projecting 600 mm, with the frame below 4 m inboard of it.
  const overhangEdges = [{ start: { x: 3000, y: 5600 }, end: { x: 0, y: 5600 }, depthMm: 600 }];
  const boundary = rectangle(0, 0, 3000, 5600);
  const columns = [
    { id: 'col_a', x: 500, y: 1600 },
    { id: 'col_b', x: 2600, y: 1600 },
  ];

  it('plants one beam per station, each running back to its nearest usable column', () => {
    const plan = planOverhangSupportBeams({ overhangEdges, boundary, columns });

    expect(plan.stationCount).toBe(3);
    expect(plan.placements).toHaveLength(3);
    expect(plan.skippedStationCount).toBe(0);
    expect(plan.placements.map((entry) => entry.columnId)).toEqual(['col_b', 'col_a', 'col_a']);
    // Every free end is on the overhanging edge, and no beam leans further off
    // the perpendicular than the search allows.
    for (const placement of plan.placements) {
      expect(placement.freeEnd.y).toBeCloseTo(5600, 5);
      expect(placement.deviationDegrees).toBeLessThanOrEqual(30);
    }
  });

  it('leaves alone a station a beam is already running under', () => {
    const plan = planOverhangSupportBeams({
      overhangEdges,
      boundary,
      columns,
      existingAxes: [{ start: { x: 0, y: 5550 }, end: { x: 3000, y: 5550 } }],
    });

    expect(plan.placements).toEqual([]);
    expect(plan.carriedStationCount).toBe(3);
  });

  it('keeps beams that fan out from one column instead of reading them as duplicates', () => {
    // Two stations sharing col_a: their axes touch at the column, so anything
    // measuring axis-to-axis would throw the second one away.
    const plan = planOverhangSupportBeams({ overhangEdges, boundary, columns });
    const fromColumnA = plan.placements.filter((entry) => entry.columnId === 'col_a');

    expect(fromColumnA).toHaveLength(2);
    expect(plan.carriedStationCount).toBe(0);
  });

  it('counts the stations it could not anchor rather than forcing them', () => {
    const plan = planOverhangSupportBeams({ overhangEdges, boundary, columns: [] });

    expect(plan.placements).toEqual([]);
    expect(plan.skippedStationCount).toBe(3);
  });

  it('has nothing to plan without an inward direction to work from', () => {
    expect(planOverhangSupportBeams({ overhangEdges, boundary: [], columns }).placements).toEqual([]);
    expect(planOverhangSupportBeams({}).stationCount).toBe(0);
  });
});
