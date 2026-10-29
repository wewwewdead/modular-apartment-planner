import { describe, expect, it } from 'vitest';
import { computeSlabOverhang, getFloorFootprintPolygons } from '@/geometry/floorOverhang';
import { polygonArea } from '@/geometry/polygon';
import { getCeilingHostFloor, planCantileverCeilings } from './cantileverCeiling';
import { deriveCeilingDetail } from './ceilingModels';
import { createBeam, createColumn, createFloor, createSlab, createWall } from '@/domain/models';

/* A 6000 × 4000 column grid on the ground floor, with the first floor's deck
   drawn 1500 mm past it to the east. That overhang is the whole subject: it is
   closed off by a ceiling filed on the GROUND floor, hung from the ground
   floor's beams — the deck it shuts is the first floor's own plate. */

const RING_COLUMNS = [
  ['col_sw', 0, 0],
  ['col_se', 6000, 0],
  ['col_ne', 6000, 4000],
  ['col_nw', 0, 4000],
].map(([id, x, y]) => ({ ...createColumn(x, y, 300, 300, { height: 3200 }), id }));

function ringBeam(id, startId, endId, level) {
  return {
    ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, 250, 450, level),
    id,
  };
}

function beamRing(level, suffix = '') {
  return [
    ringBeam(`beam_s${suffix}`, 'col_sw', 'col_se', level),
    ringBeam(`beam_n${suffix}`, 'col_nw', 'col_ne', level),
    ringBeam(`beam_w${suffix}`, 'col_sw', 'col_nw', level),
    ringBeam(`beam_e${suffix}`, 'col_se', 'col_ne', level),
  ];
}

function rectangle(x0, y0, x1, y1) {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

const GROUND_DECK = rectangle(0, 0, 6000, 4000);
const CANTILEVERED_DECK = rectangle(0, 0, 7500, 4000);

/**
 * @param groundBeamLevel  null for a floor with nothing overhead to hang from.
 * @param upperBeams       beams on the CANTILEVERED floor. They exist purely to
 *                         be the wrong answer: a ladder run against the active
 *                         floor rather than the one below would find these.
 */
function createProject({
  groundBeamLevel = 3200,
  groundColumns = RING_COLUMNS,
  upperDeck = CANTILEVERED_DECK,
  groundSlabs = [GROUND_DECK],
  groundWalls = [],
  upperBeams = [],
} = {}) {
  const ground = Object.assign(createFloor('Ground Floor', 0, { elevation: 0, floorToFloorHeight: 3200 }), {
    id: 'floor_ground',
    columns: groundColumns,
    beams: groundBeamLevel === null ? [] : beamRing(groundBeamLevel),
    walls: groundWalls,
    slabs: groundSlabs.map((ring, index) => ({
      ...createSlab('floor_ground', ring, 200, 0),
      id: `slab_ground_${index}`,
    })),
  });

  const upper = Object.assign(createFloor('First Floor', 1, { elevation: 3200, floorToFloorHeight: 2800 }), {
    id: 'floor_first',
    columns: RING_COLUMNS.map((column) => ({ ...column, id: `${column.id}_up` })),
    beams: upperBeams,
    slabs: upperDeck ? [{ ...createSlab('floor_first', upperDeck, 200, 3200), id: 'slab_upper' }] : [],
  });

  return { project: { floors: [ground, upper], trussSystems: [], ceilings: [] }, ground, upper };
}

function upperSlab(upper) {
  return upper.slabs[0];
}

describe('getCeilingHostFloor', () => {
  it('answers with the storey below in stack order, not array order', () => {
    const { project, ground, upper } = createProject();
    // Reversed on purpose: `project.floors` order is not the stack.
    const shuffled = { ...project, floors: [upper, ground] };

    expect(getCeilingHostFloor(shuffled, upper.id)?.id).toBe(ground.id);
  });

  it('has nothing to answer with on the lowest floor', () => {
    const { project, ground } = createProject();

    expect(getCeilingHostFloor(project, ground.id)).toBeNull();
    expect(getCeilingHostFloor(project, null)).toBeNull();
  });
});

describe('planCantileverCeilings', () => {
  it('files the ceiling on the floor below and hangs it from THAT floor’s beams', () => {
    // The cantilevered floor carries a ring of its own, two metres higher. If
    // the ladder ran against the active floor it would find these instead.
    const { project, ground, upper } = createProject({ upperBeams: beamRing(5800, '_up') });

    const { floorBelow, ceilings } = planCantileverCeilings(project, upper, upperSlab(upper), { phaseId: 'phase_1' });

    expect(floorBelow?.id).toBe(ground.id);
    expect(ceilings).toHaveLength(1);

    const [ceiling] = ceilings;
    expect(ceiling.floorId).toBe(ground.id);
    expect(ceiling.phaseId).toBe('phase_1');
    expect(ceiling.attachment.mode).toBe('beam');
    expect(ceiling.attachment.beamIds.every((id) => ground.beams.some((beam) => beam.id === id))).toBe(true);
    expect(ceiling.baseElevation).toBe(3200);
  });

  it('keeps the traced overhang as a drawn boundary, so nothing re-derives it back to the bay', () => {
    const { project, upper } = createProject();

    const [ceiling] = planCantileverCeilings(project, upper, upperSlab(upper)).ceilings;

    expect(ceiling.boundarySource).toBe('drawn');
    // The strip east of the ground floor's edge: 1500 × 4000.
    expect(polygonArea(ceiling.boundaryPolygon)).toBeCloseTo(6_000_000, 3);
    expect(ceiling.boundaryPolygon.every((point) => point.x >= 6000 - 1e-6)).toBe(true);
  });

  it('falls back to the floor below’s own top when nothing up there can carry it', () => {
    const { project, ground, upper } = createProject({ groundBeamLevel: null });

    const [ceiling] = planCantileverCeilings(project, upper, upperSlab(upper)).ceilings;

    expect(ceiling.attachment).toEqual({ mode: 'manual', beamIds: [] });
    expect(ceiling.floorId).toBe(ground.id);
    // Top of the ceiling's own storey, which under a cantilever is the slab
    // soffit it closes off.
    expect(ceiling.baseElevation).toBe(3200);
  });

  it('plans nothing for a plate that sits square over the storey below', () => {
    const { project, upper } = createProject({ upperDeck: GROUND_DECK });

    expect(planCantileverCeilings(project, upper, upperSlab(upper)).ceilings).toEqual([]);
  });

  it('plans nothing on the lowest floor, which has no storey under it to ceil', () => {
    const { project, ground } = createProject();

    const plan = planCantileverCeilings(project, ground, ground.slabs[0]);
    expect(plan).toEqual({ floorBelow: null, ceilings: [] });
  });

  it('refuses to read an empty storey below as one long overhang', () => {
    const { project, upper } = createProject({ groundSlabs: [] });

    expect(planCantileverCeilings(project, upper, upperSlab(upper)).ceilings).toEqual([]);
  });

  it('drops slivers the boolean leaves behind and puts the real overhang first', () => {
    // The ground plate stops 0.005 mm short of the north edge, which the
    // subtract reports as a 6000 × 0.005 strip: 30 mm² of nothing.
    const { project, upper } = createProject({ groundSlabs: [rectangle(0, 0, 6000, 3999.995)] });

    const { ceilings } = planCantileverCeilings(project, upper, upperSlab(upper));

    expect(ceilings).toHaveLength(1);
    expect(polygonArea(ceilings[0].boundaryPolygon)).toBeGreaterThan(1_000_000);
  });

  it('returns several regions largest first when the plate reaches out in two places', () => {
    // A ground plate narrower than the deck on the east AND missing its
    // north-west corner: two disjoint overhangs of different size.
    const { project, upper } = createProject({
      groundSlabs: [rectangle(0, 0, 6000, 2000), rectangle(2000, 2000, 6000, 4000)],
    });

    const { ceilings } = planCantileverCeilings(project, upper, upperSlab(upper));

    expect(ceilings.length).toBeGreaterThan(1);
    const areas = ceilings.map((ceiling) => polygonArea(ceiling.boundaryPolygon));
    expect([...areas].sort((a, b) => b - a)).toEqual(areas);
  });
});

/* ── One cantilever of several ────────────────────────────────────────────
 *
 * A plate reaching out on two sides is two cantilevers to whoever has to build
 * them. Clicking one on the plan is a way of asking for THAT one, and the runs
 * clicked are the ones `computeSlabOverhang` measures — so the fixture measures
 * them the same way rather than inventing run records the plan could not
 * produce.
 */
describe('planCantileverCeilings — scoped to one run', () => {
  // The deck reaches 1000 past the storey below to the west and 1500 to the
  // east. Two disjoint regions of different size, so a plan scoped to one is
  // provably not the plan for the other.
  function createTwoSided() {
    const built = createProject({ groundSlabs: [rectangle(1000, 0, 6000, 4000)] });
    const { overhangEdges } = computeSlabOverhang(upperSlab(built.upper), getFloorFootprintPolygons(built.ground));
    return {
      ...built,
      // Found rather than indexed: which slot a run lands in is an artefact of
      // the boundary walk, and naming the side is what the test is about.
      eastRun: overhangEdges.find((run) => run.start.x === 7500 && run.end.x === 7500),
      westRun: overhangEdges.find((run) => run.start.x === 0 && run.end.x === 0),
      southWestTail: overhangEdges.find((run) => run.start.x === 0 && run.end.y === 0 && run.end.x > 0),
    };
  }

  const EAST_AREA = 1500 * 4000;
  const WEST_AREA = 1000 * 4000;

  function areas(ceilings) {
    return ceilings.map((ceiling) => polygonArea(ceiling.boundaryPolygon));
  }

  it('plans every overhang when no run is named', () => {
    const { project, upper } = createTwoSided();

    const { ceilings } = planCantileverCeilings(project, upper, upperSlab(upper));

    expect(areas(ceilings)).toEqual([EAST_AREA, WEST_AREA]);
    // Undefined and null both mean "no run was named" — a resolution that came
    // back empty must not be read as a request for nothing.
    expect(areas(planCantileverCeilings(project, upper, upperSlab(upper), { focusRun: null }).ceilings)).toEqual([
      EAST_AREA,
      WEST_AREA,
    ]);
  });

  it('plans only the overhang the named run belongs to', () => {
    const { project, upper, eastRun, westRun } = createTwoSided();

    const east = planCantileverCeilings(project, upper, upperSlab(upper), { focusRun: eastRun });
    expect(areas(east.ceilings)).toEqual([EAST_AREA]);
    expect(east.ceilings[0].boundaryPolygon.every((point) => point.x >= 6000 - 1e-6)).toBe(true);

    const west = planCantileverCeilings(project, upper, upperSlab(upper), { focusRun: westRun });
    expect(areas(west.ceilings)).toEqual([WEST_AREA]);
    expect(west.ceilings[0].boundaryPolygon.every((point) => point.x <= 1000 + 1e-6)).toBe(true);
  });

  it('answers with the same region for the tail of a run as for the run itself', () => {
    // The measurement reports a corner as a short stretch on the RETURNING
    // edge, and clicking that stretch is still pointing at the same cantilever.
    const { project, upper, southWestTail } = createTwoSided();

    expect(
      areas(planCantileverCeilings(project, upper, upperSlab(upper), { focusRun: southWestTail }).ceilings),
    ).toEqual([WEST_AREA]);
  });

  it('keeps everything a scoped ceiling is, and files it on the same storey', () => {
    const { project, ground, upper, eastRun } = createTwoSided();

    const { floorBelow, ceilings } = planCantileverCeilings(project, upper, upperSlab(upper), {
      phaseId: 'phase_1',
      focusRun: eastRun,
    });

    expect(floorBelow?.id).toBe(ground.id);
    const [ceiling] = ceilings;
    expect(ceiling.floorId).toBe(ground.id);
    expect(ceiling.phaseId).toBe('phase_1');
    expect(ceiling.boundarySource).toBe('drawn');
    expect(ceiling.attachment.mode).toBe('beam');
    expect(ceiling.attachment.beamIds.every((id) => ground.beams.some((beam) => beam.id === id))).toBe(true);
  });

  it('falls back to the strip a run sweeps when its own midpoint stands on carried plate', () => {
    // The shape a run takes when its depth was found in a direction its edge
    // does not face: the stretch straddles the storey below, so a probe stepped
    // off its middle lands on plate that is held up. The strip it sweeps still
    // reaches the overhang, and that is the cantilever meant.
    const { project, upper } = createTwoSided();
    const straddling = {
      start: { x: 500, y: 0 },
      end: { x: 2500, y: 0 },
      depthMm: 1000,
      lengthMm: 2000,
      boundaryEdgeIndex: 0,
    };

    expect(areas(planCantileverCeilings(project, upper, upperSlab(upper), { focusRun: straddling }).ceilings)).toEqual([
      WEST_AREA,
    ]);
  });

  it('plans nothing at all for a run that names no overhang', () => {
    // Neither the probe nor the strip reaches a region. Planning every
    // cantilever instead would be the opposite of what was asked for.
    const { project, upper } = createTwoSided();
    const inland = {
      start: { x: 2000, y: 0 },
      end: { x: 3000, y: 0 },
      depthMm: 500,
      lengthMm: 1000,
      boundaryEdgeIndex: 0,
    };

    expect(planCantileverCeilings(project, upper, upperSlab(upper), { focusRun: inland }).ceilings).toEqual([]);
    // A run record with no geometry to read a normal off says nothing about
    // which cantilever is meant, so it plans nothing rather than all of them.
    expect(planCantileverCeilings(project, upper, upperSlab(upper), { focusRun: { depthMm: 600 } }).ceilings).toEqual(
      [],
    );
  });
});

/**
 * The point of the whole exercise, checked end to end: a ceiling filed on the
 * right floor sees that floor's structure. Obstructions are never stored — they
 * are collected from `ceiling.floorId` on every read — so this is the assertion
 * that says the corrected floor id actually reaches them.
 */
describe('planCantileverCeilings — obstructions follow the corrected floor', () => {
  function regionArea(detail) {
    return detail.regions.reduce((total, region) => {
      const outer = polygonArea(region.outline.map((point) => ({ x: point.u, y: point.v })));
      const holes = (region.holes || []).reduce(
        (sum, hole) => sum + polygonArea(hole.map((point) => ({ x: point.u, y: point.v }))),
        0,
      );
      return total + outer - holes;
    }, 0);
  }

  it('traces around the storey-below wall standing under the overhang', () => {
    // A partition on the GROUND floor, out under the projecting deck and built
    // up to the beam soffit. Nothing on the first floor stands anywhere near it.
    const partition = {
      ...createWall({ x: 6600, y: 500 }, { x: 6600, y: 3500 }, 150, { height: 2750 }),
      id: 'wall_under_overhang',
    };
    const { project, upper } = createProject({ groundWalls: [partition] });

    const [ceiling] = planCantileverCeilings(project, upper, upperSlab(upper)).ceilings;
    const withCeiling = { ...project, ceilings: [ceiling] };
    const detail = deriveCeilingDetail(ceiling, withCeiling);

    const boundary = polygonArea(ceiling.boundaryPolygon);
    expect(detail.regions.length).toBeGreaterThan(0);
    expect(regionArea(detail)).toBeLessThan(boundary);
    // 150 × 3000 of wall taken out of the 1500 × 4000 strip, give or take the
    // beam that shares the strip's west edge.
    expect(boundary - regionArea(detail)).toBeGreaterThan(400_000);
  });

  it('cuts nothing out when the same strip has no structure under it', () => {
    // The control for the case above. With the ring taken away the strip is
    // whole — which also says the cut in that case came from the floor below,
    // not from the deck the strip is drawn under.
    const { project, upper } = createProject({ groundBeamLevel: null, groundColumns: [] });

    const [ceiling] = planCantileverCeilings(project, upper, upperSlab(upper)).ceilings;
    const detail = deriveCeilingDetail(ceiling, { ...project, ceilings: [ceiling] });

    expect(regionArea(detail)).toBeCloseTo(polygonArea(ceiling.boundaryPolygon), 3);
  });
});
