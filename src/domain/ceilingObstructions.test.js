import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createFloor, createWall } from './models';
import {
  ceilingElevationRange,
  createCeilingForProject,
  createCeiling,
  deriveCeilingDetail,
  deriveCeilingFramingMembers,
  deriveCeilingPanels,
  resolveCeilingBoundary,
  resolveCeilingElevations,
} from './ceilingModels';
import { createTrussSystem, syncProjectTrussSystems, TRUSS_SUPPORT_MODES } from './trussModels';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { collectCeilingBandStructure, collectCeilingObstructions } from './ceilingObstructions';
import { syncFloorWallHeights } from './wallFit';

// 8000 × 6000 room at a 3000 ceiling: a partition splits it down the middle at
// x = 4000, a beam runs across it at y = 3000, and a column stands at the
// crossing.
const BOUNDARY = [
  { x: 0, y: 0 },
  { x: 8000, y: 0 },
  { x: 8000, y: 6000 },
  { x: 0, y: 6000 },
];

const CEILING_LEVEL = 3000;

function buildProject({ walls = [], beams = [], columns = [] } = {}) {
  const floor = { id: 'floor_1', elevation: 0, floorToFloorHeight: CEILING_LEVEL, walls, beams, columns };
  const ceiling = createCeiling('Ceiling', {
    id: 'ceiling_1',
    floorId: floor.id,
    boundaryPolygon: BOUNDARY,
    baseElevation: CEILING_LEVEL,
  });

  return { floor, ceiling, project: { floors: [floor], ceilings: [ceiling], trussSystems: [] } };
}

function partition(height = CEILING_LEVEL) {
  return { ...createWall({ x: 4000, y: 0 }, { x: 4000, y: 6000 }, 200, { height }), id: 'wall_partition' };
}

function crossBeam({ y = 3000, level = CEILING_LEVEL } = {}) {
  return {
    ...createBeam({ kind: 'point', x: 0, y }, { kind: 'point', x: 8000, y }, 250, 450, level),
    id: 'beam_cross',
  };
}

describe('collectCeilingObstructions', () => {
  it('takes the walls, beams and columns that cross the ceiling band', () => {
    const { floor } = buildProject({
      walls: [partition()],
      beams: [crossBeam()],
      columns: [{ ...createColumn(4000, 3000, 300, 300, { height: CEILING_LEVEL }), id: 'col_mid' }],
    });

    expect(collectCeilingObstructions([floor], { min: 2850, max: 3000 })).toHaveLength(3);
  });

  it('ignores structure that stops short of the ceiling, and beams on other levels', () => {
    const { floor } = buildProject({
      walls: [partition(1200)],
      beams: [crossBeam({ level: 6000 })],
      columns: [{ ...createColumn(4000, 3000, 300, 300, { height: 1200 }), id: 'col_low' }],
    });

    expect(collectCeilingObstructions([floor], { min: 2850, max: 3000 })).toEqual([]);
  });

  // A short bypass wall still reaches the ceiling: its plane runs to the floor
  // above whatever height is stored on it, and the boards have to stop at it.
  it('reads a bypass wall over the span it is drawn on, not its stored height', () => {
    const short = { ...partition(1200), framingMode: 'bypass' };
    const { floor } = buildProject({ walls: [short] });

    expect(collectCeilingObstructions([floor], { min: 2850, max: 3000 })).toHaveLength(1);
  });

  // A beam whose supports cannot be resolved is not skipped so much as absent.
  // `getBeamRenderData` is the one resolver, and the preview builds its beam
  // meshes through the same call, so a beam with no footprint to subtract has no
  // volume for a ceiling to run through either.
  it('has nothing to subtract for a beam whose supports do not resolve', () => {
    const orphan = {
      ...createBeam({ kind: 'column', id: 'missing_a' }, { kind: 'column', id: 'missing_b' }, 250, 450, CEILING_LEVEL),
      id: 'beam_orphan',
    };
    const { floor } = buildProject({ beams: [orphan] });

    expect(getBeamRenderData(orphan, floor.columns || [])).toBeNull();
    expect(collectCeilingObstructions([floor], { min: 2850, max: 3000 })).toEqual([]);
  });

  // A beam raised clear of the band is not an omission either. The band's top IS
  // the highest thing the assembly builds, so a beam the band excludes has its
  // soffit above every part of the ceiling and the boards genuinely pass beneath
  // it — which is what raising a beam over a room means.
  it('leaves a beam raised clear of the band alone, and stops at one that touches it', () => {
    const { floor, ceiling, project } = buildProject({});
    const elevations = resolveCeilingElevations(project, ceiling);
    const range = ceilingElevationRange(elevations);

    expect(range.max).toBe(Math.max(elevations.carrierTop, elevations.attachment));

    const raised = { ...crossBeam({ level: range.max + 450 + 1 }), id: 'beam_raised' };
    const onSoffit = { ...crossBeam({ level: range.max + 450 }), id: 'beam_soffit' };

    expect(collectCeilingObstructions([{ ...floor, beams: [raised] }], range)).toEqual([]);
    expect(collectCeilingObstructions([{ ...floor, beams: [onSoffit] }], range)).toHaveLength(1);
  });

  it('returns nothing without a usable elevation band', () => {
    const { floor } = buildProject({ walls: [partition()] });

    expect(collectCeilingObstructions([floor], null)).toEqual([]);
    expect(collectCeilingObstructions([floor], { min: 3000, max: 3000 })).toEqual([]);
    expect(collectCeilingObstructions([null, undefined], { min: 0, max: 3000 })).toEqual([]);
  });
});

describe('ceilings traced around the structure under them', () => {
  it('splits the ceiling into one region per side of a partition', () => {
    const { ceiling, project } = buildProject({ walls: [partition()] });

    const regions = deriveCeilingDetail(ceiling, project).regions;

    expect(regions).toHaveLength(2);
    // The 200 mm partition takes its full thickness out of the middle: each side
    // runs to the wall face at u 3900 and u 4100.
    const spans = regions.map((region) => {
      const us = region.outline.map((point) => point.u);
      return [Math.min(...us), Math.max(...us)];
    });
    expect(spans.map(([u0]) => u0).sort((a, b) => a - b)).toEqual([0, 4100]);
    expect(spans.map(([, u1]) => u1).sort((a, b) => a - b)).toEqual([3900, 8000]);
  });

  it('keeps boards and furring out of a beam that crosses the ceiling', () => {
    const { ceiling, project } = buildProject({ beams: [crossBeam()] });
    const beamBand = { v0: 6000 - 3125, v1: 6000 - 2875 };

    for (const panel of deriveCeilingPanels(ceiling, project)) {
      for (const region of panel.regions) {
        for (const point of region.outline) {
          const insideBand = point.v > beamBand.v0 + 0.01 && point.v < beamBand.v1 - 0.01;
          expect(insideBand).toBe(false);
        }
      }
    }

    const furring = deriveCeilingFramingMembers(ceiling, project).filter((member) => member.kind === 'furring');
    expect(furring.some((member) => member.v0 >= beamBand.v0 - 0.01 && member.v1 <= beamBand.v1 + 0.01)).toBe(false);
  });

  it('runs a wall angle down both faces of the partition, half a leg inboard', () => {
    const { ceiling, project } = buildProject({ walls: [partition()] });

    const angleUs = deriveCeilingFramingMembers(ceiling, project)
      .filter((member) => member.kind === 'wall_angle')
      .flatMap((member) => [member.start.u, member.end.u]);

    // Wall faces at 3900 / 4100, each angle sitting 12.5 mm into the ceiling.
    expect(angleUs).toContainEqual(3887.5);
    expect(angleUs).toContainEqual(4112.5);
  });

  it('drops the hangers that would land inside the structure', () => {
    const clear = buildProject();
    // Plan y 3600 is local v 2400 — a whole hanger row lands on this beam.
    const blocked = buildProject({ beams: [crossBeam({ y: 3600 })] });

    const clearHangers = deriveCeilingDetail(clear.ceiling, clear.project).hangers;
    const blockedHangers = deriveCeilingDetail(blocked.ceiling, blocked.project).hangers;

    expect(clearHangers.filter((hanger) => hanger.v === 2400).length).toBeGreaterThan(0);
    expect(blockedHangers.filter((hanger) => hanger.v === 2400)).toEqual([]);
    expect(blockedHangers.length).toBeLessThan(clearHangers.length);
  });

  it('trims a beam-hung ceiling to its support beams, a crossing beam and a partition', () => {
    const columns = [
      ['col_a1', 0, 0],
      ['col_a2', 8000, 0],
      ['col_b1', 0, 6000],
      ['col_b2', 8000, 6000],
      ['col_m1', 3000, 0],
      ['col_m2', 3000, 6000],
    ].map(([id, x, y]) => ({ ...createColumn(x, y, 300, 300, { height: CEILING_LEVEL }), id }));
    const beam = (id, startId, endId) => ({
      ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, 250, 450, CEILING_LEVEL),
      id,
    });
    const floor = {
      id: 'floor_1',
      elevation: 0,
      floorToFloorHeight: CEILING_LEVEL,
      columns,
      beams: [
        beam('beam_a', 'col_a1', 'col_a2'),
        beam('beam_b', 'col_b1', 'col_b2'),
        // Crosses the ceiling rather than bounding it.
        beam('beam_cross', 'col_m1', 'col_m2'),
      ],
      walls: [{ ...createWall({ x: 5500, y: 0 }, { x: 5500, y: 6000 }, 200, { height: CEILING_LEVEL }), id: 'wall_1' }],
    };

    const project = syncProjectTrussSystems({
      floors: [floor],
      ceilings: [],
      trussSystems: [
        createTrussSystem('Roof trusses', {
          id: 'ts_1',
          floorId: floor.id,
          baseElevation: CEILING_LEVEL,
          trussInstances: [
            {
              trussTypeId: 'truss_type_gable',
              startPoint: { x: 0, y: 3000 },
              endPoint: { x: 8000, y: 3000 },
              span: 6000,
              rise: 1200,
              spacing: 1000,
              count: 8,
              supportMode: TRUSS_SUPPORT_MODES.BEAM_PAIR,
              supportBeamIds: { start: 'beam_a', end: 'beam_b' },
            },
          ],
        }),
      ],
    });
    const ceiling = createCeilingForProject(project, { floorId: floor.id });
    project.ceilings = [ceiling];
    expect(ceiling.attachment.mode).toBe('beam');

    const detail = deriveCeilingDetail(ceiling, project);

    // Crossing beam and partition each cut the run: three stretches of ceiling.
    expect(detail.regions).toHaveLength(3);

    // Nothing — boards, framing or hangers — may sit in a beam or a wall.
    const originX = Math.min(...resolveCeilingBoundary(project, ceiling).map((point) => point.x));
    const obstructedU = [
      [2875 - originX, 3125 - originX], // the 250 mm crossing beam
      [5400 - originX, 5600 - originX], // the 200 mm partition
    ];
    const inside = (u) => obstructedU.some(([u0, u1]) => u > u0 + 0.01 && u < u1 - 0.01);

    for (const panel of detail.panels) {
      for (const region of panel.regions) {
        for (const point of region.outline) expect(inside(point.u)).toBe(false);
      }
    }
    for (const member of detail.framing.filter((entry) => entry.kind === 'furring')) {
      expect(inside((member.u0 + member.u1) / 2)).toBe(false);
    }
    for (const hanger of detail.hangers) {
      expect(inside(hanger.u)).toBe(false);
    }
  });

  it('leaves a ceiling with nothing under it alone', () => {
    const { ceiling, project } = buildProject();

    const detail = deriveCeilingDetail(ceiling, project);

    expect(detail.regions).toHaveLength(1);
    expect(detail.regions[0].holes).toEqual([]);
    expect(detail.takeoff.installedAreaMm2).toBeGreaterThan(0);
  });
});

// A real bay: four columns capped by 450-deep beams, the ceiling hung 150 mm
// under the beam tops, and the structure inside the bay built up to the beam
// soffit rather than to the beam top. The boards hang INSIDE the beams' depth,
// so everything reaching that soffit stands beside the assembly and divides it,
// even though its head finishes 300 mm below the boards.
const BEAM_DEPTH = 450;
const SOFFIT = CEILING_LEVEL - BEAM_DEPTH;

function beamBay({
  walls = [],
  columns = [],
  ceilingOptions = {},
  beamLevel = CEILING_LEVEL,
  beamRefs = null,
  // Per-corner heights, for the split-level bay where one support lands short of
  // the storey the rest of the frame stands at.
  cornerHeights = {},
} = {}) {
  let floor = createFloor('Ground', 0, { elevation: 0, floorToFloorHeight: CEILING_LEVEL });
  floor.columns = [
    ...[
      ['col_sw', 0, 0],
      ['col_se', 8000, 0],
      ['col_ne', 8000, 6000],
      ['col_nw', 0, 6000],
    ].map(([id, x, y]) => ({
      ...createColumn(x, y, 300, 300, { height: cornerHeights[id] ?? CEILING_LEVEL }),
      id,
    })),
    ...columns,
  ];
  // Either the beams name the columns they bear on, or they span bare points and
  // bear on nothing — the two ways a beam can be drawn, and they answer the
  // bearing question differently.
  const at = (id) => {
    if (beamRefs !== 'point') return { kind: 'column', id };
    const column = floor.columns.find((entry) => entry.id === id);
    return { kind: 'point', x: column.x, y: column.y };
  };
  floor.beams = [
    ['beam_s', 'col_sw', 'col_se'],
    ['beam_e', 'col_se', 'col_ne'],
    ['beam_n', 'col_ne', 'col_nw'],
    ['beam_w', 'col_nw', 'col_sw'],
  ].map(([id, start, end]) => ({
    ...createBeam(at(start), at(end), 300, BEAM_DEPTH, beamLevel),
    id,
  }));
  floor.walls = walls;
  // The wall fitter is what puts an auto wall under the beam head; running it
  // here is the whole point, since its answer is the elevation the tracer used
  // to miss.
  floor = syncFloorWallHeights(floor);

  const project = { floors: [floor], ceilings: [], trussSystems: [] };
  const ceiling = createCeilingForProject(project, { floorId: floor.id, ...ceilingOptions });
  project.ceilings = [ceiling];
  return { project, ceiling, floor };
}

function midPartition(options = {}) {
  return { ...createWall({ x: 4000, y: 0 }, { x: 4000, y: 6000 }, 200, options), id: 'wall_mid' };
}

describe('ceilings traced around the structure inside their beam bay', () => {
  it('traces the partition the wall fitter stopped at the beam soffit', () => {
    const { project, ceiling, floor } = beamBay({ walls: [midPartition()] });

    // The fitter has taken the wall to the underside of the beams it runs
    // between, 300 mm clear of the boards it now has to divide.
    expect(floor.walls[0].height).toBe(SOFFIT);
    const elevations = resolveCeilingElevations(project, ceiling);
    expect(elevations.attachment).toBe(CEILING_LEVEL);
    expect(elevations.boardUnderside).toBe(2850);
    expect(elevations.supportSoffit).toBe(SOFFIT);
    // The beams sit on their columns, so the bearing is the beam top and the
    // soffit under it is still the lowest thing the band has to reach.
    expect(elevations.supportBearing).toBe(CEILING_LEVEL);
    expect(ceilingElevationRange(elevations).min).toBe(SOFFIT);

    expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(2);
  });

  it('leaves a pony wall that dies below the beams alone', () => {
    const pony = midPartition({ height: 1200, heightMode: 'manual' });
    const { project, ceiling, floor } = beamBay({ walls: [pony] });

    // The band bottoms out at the beam soffit, not at the floor: half a storey
    // of partition still passes clean under the ceiling.
    expect(floor.walls[0].height).toBe(1200);
    expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(1);
  });

  it('traces a column whose head finishes exactly on the soffit', () => {
    const midColumn = (height) =>
      beamBay({ columns: [{ ...createColumn(4000, 3000, 300, 300, { height }), id: 'col_mid' }] });
    const stopped = midColumn(SOFFIT);
    const short = midColumn(SOFFIT - 1);

    // Closed interval: a column built up to the soffit carries the bay, one that
    // stops a millimetre short of it passes under the boards.
    expect(deriveCeilingDetail(stopped.ceiling, stopped.project).regions[0].holes).toHaveLength(1);
    expect(deriveCeilingDetail(short.ceiling, short.project).regions[0].holes).toHaveLength(0);
  });

  it('leaves a manual-datum ceiling reading its band off its own boards', () => {
    const { project, ceiling } = beamBay({
      walls: [midPartition()],
      ceilingOptions: { attachment: { mode: 'manual' }, baseElevation: 2850, boundaryPolygon: BOUNDARY },
    });

    // Nothing to hang from means nothing to reach down to: a ceiling sitting on
    // its own datum is bounded by its boards, so the wall 300 mm under them is
    // no part of it.
    expect(ceiling.attachment.mode).toBe('manual');
    const elevations = resolveCeilingElevations(project, ceiling);
    expect(elevations.supportSoffit).toBeNull();
    expect(elevations.supportBearing).toBeNull();
    expect(ceilingElevationRange(elevations).min).toBe(2850);
    expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(1);
  });

  it('keeps tracing the partition when the boards hang below the beam soffit', () => {
    const { project, ceiling } = beamBay({
      walls: [midPartition()],
      ceilingOptions: { detailing: { suspension: { drop: 500 } } },
    });

    // Dropped further than the beams are deep, so the boards are the lowest
    // thing the assembly owns and the band bottoms out on them — which is lower
    // still, and the wall is bounded by it either way.
    const elevations = resolveCeilingElevations(project, ceiling);
    expect(elevations.boardUnderside).toBe(2500);
    expect(elevations.supportSoffit).toBe(SOFFIT);
    expect(ceilingElevationRange(elevations).min).toBe(2500);
    expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(2);
  });

  // Retyping the beam levels lifts the bay off the columns carrying it: the
  // beams now top out at 3600 with their soffit at 3150, while the columns still
  // stop at 3000 and everything the fitter never touched is still built to the
  // storey height. The zone between the two is where those columns get extended
  // to meet the beams, so it is structure and the band has to reach through it.
  const RAISED_LEVEL = 3600;
  const RAISED_SOFFIT = RAISED_LEVEL - BEAM_DEPTH;

  describe('with the beams raised above the columns that carry them', () => {
    // The fitter only reaches walls running under a beam; a partition it leaves
    // alone keeps the storey height it was drawn at, which is what the raised
    // beams have moved away from. Pinned manually so the test states the height
    // it is about rather than inheriting whatever the fitter decides.
    const storeyPartition = () => midPartition({ height: CEILING_LEVEL, heightMode: 'manual' });

    it('traces the partition left standing at the storey height under them', () => {
      const { project, ceiling, floor } = beamBay({ beamLevel: RAISED_LEVEL, walls: [storeyPartition()] });

      expect(floor.walls[0].height).toBe(CEILING_LEVEL);
      const elevations = resolveCeilingElevations(project, ceiling);
      expect(elevations.attachment).toBe(RAISED_LEVEL);
      expect(elevations.supportSoffit).toBe(RAISED_SOFFIT);
      expect(elevations.supportBearing).toBe(CEILING_LEVEL);
      // Not the 3150 soffit: the band reaches past it to the column heads, and
      // the wall whose top lands exactly there is inside the closed interval.
      expect(ceilingElevationRange(elevations)).toEqual({ min: CEILING_LEVEL, max: RAISED_LEVEL });

      expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(2);
    });

    it('traces a column whose head finishes exactly on the bearing level', () => {
      const { project, ceiling } = beamBay({
        beamLevel: RAISED_LEVEL,
        columns: [{ ...createColumn(4000, 3000, 300, 300, { height: CEILING_LEVEL }), id: 'col_mid' }],
      });

      expect(deriveCeilingDetail(ceiling, project).regions[0].holes).toHaveLength(1);
    });

    it('still leaves a pony wall that dies below the bearing alone', () => {
      const pony = midPartition({ height: 1200, heightMode: 'manual' });
      const { project, ceiling } = beamBay({ beamLevel: RAISED_LEVEL, walls: [pony] });

      // Reaching down to the bearing is not reaching down to the floor: half a
      // storey of partition still passes clean under the ceiling.
      expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(1);
    });

    it('falls back to the top of the storey for beams drawn between bare points', () => {
      const { project, ceiling } = beamBay({
        beamLevel: RAISED_LEVEL,
        beamRefs: 'point',
        walls: [storeyPartition()],
      });

      // No column named, so nothing to bear on but the storey the beams stand
      // in — which here is the same 3000, and the partition is traced either way.
      const elevations = resolveCeilingElevations(project, ceiling);
      expect(elevations.supportBearing).toBe(CEILING_LEVEL);
      expect(ceilingElevationRange(elevations).min).toBe(CEILING_LEVEL);
      expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(2);
    });

    // One corner of the raised bay drops into a split-level pocket: its column
    // is a 2000 stub while the other three still stand at the storey height.
    // What the stub says is where one beam end bears, not where the storey's
    // structure stops, so the bay keeps reading 3000 and the band with it.
    describe('with one support standing on a short split-level column', () => {
      const splitBay = (options = {}) =>
        beamBay({ beamLevel: RAISED_LEVEL, cornerHeights: { col_ne: 2000 }, ...options });

      it('keeps the bearing at the level the rest of the frame stands on', () => {
        const { project, ceiling } = splitBay();

        const elevations = resolveCeilingElevations(project, ceiling);
        expect(elevations.supportBearing).toBe(CEILING_LEVEL);
        expect(ceilingElevationRange(elevations)).toEqual({ min: CEILING_LEVEL, max: RAISED_LEVEL });
      });

      it('leaves a wall that passes a metre clear under the boards alone', () => {
        const low = midPartition({ height: 2400, heightMode: 'manual' });
        const { project, ceiling, floor } = splitBay({ walls: [low] });

        // 2400 is a metre below the boards and 600 below the bay's bearing. Read
        // off the stub the band would have started at 2000 and cut this ceiling
        // in two around a wall nothing was ever built against.
        //
        // This is also the tie case, and the assertion is what pins the tie
        // rule: the mid-bay partition runs down x = 4000 from y 0 to 6000, which
        // is exactly 4000 mm from every one of the bay's four corner anchors.
        // The field genuinely cannot say which step this wall belongs to, so the
        // tie goes to the HIGHEST plane the tied anchors name — the storey's
        // 3000 rather than the stub's 2000 — and the wall stays clear of the
        // band. Resolve the tie the other way and this ceiling splits in two.
        expect(floor.walls[0].height).toBe(2400);
        expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(1);
      });

      it('still traces the wall left standing at the storey height', () => {
        const { project, ceiling } = splitBay({
          walls: [midPartition({ height: CEILING_LEVEL, heightMode: 'manual' })],
        });

        // The fix must not cost the bay the walls it does have to stop at: one
        // built to the level its supports stand on is still inside the band.
        expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(2);
      });

      // The bay's bearing statements, as positions: (0,0), (8000,0) and (0,6000)
      // at the storey's 3000 and the north-east corner at the 2000 stub, each
      // named twice because two beams meet at every corner.
      //
      // A diagonal across the north-east corner, from (8000,4000) to
      // (4000,6000). Distances from the four anchors to that segment, by hand:
      // (8000,6000) projects onto it at t = 0.2, at (7200,4400), 1789 mm away;
      // (8000,0) and (0,6000) both fall off an end and measure 4000; (0,0)
      // measures 7211. The stub is the nearest support by better than a factor
      // of two, so this wall stands on the low step and on nothing else.
      const stubDiagonal = (options) => ({
        ...createWall({ x: 8000, y: 4000 }, { x: 4000, y: 6000 }, 200, options),
        id: 'wall_stub_diagonal',
      });
      // The same wall mirrored about the bay's centre, so it hugs the tall (0,0)
      // corner instead — 1789 from it, 4000 from each neighbour, 7211 from the
      // stub. Same wall, same height, other step.
      const tallDiagonal = (options) => ({
        ...createWall({ x: 0, y: 2000 }, { x: 4000, y: 0 }, 200, options),
        id: 'wall_tall_diagonal',
      });

      it("traces the partition built to the low step's framing level", () => {
        const { project, ceiling, floor } = splitBay({
          walls: [stubDiagonal({ height: 2100, heightMode: 'manual' })],
        });

        expect(floor.walls[0].height).toBe(2100);
        const elevations = resolveCeilingElevations(project, ceiling);
        // The bay-wide band is untouched: it still starts 900 above this wall.
        expect(elevations.supportBearing).toBe(CEILING_LEVEL);
        expect(ceilingElevationRange(elevations)).toEqual({ min: CEILING_LEVEL, max: RAISED_LEVEL });
        expect(elevations.supportBearingEnds).toHaveLength(8);

        // Judged against the stub it was built beside, the wall is in the band:
        // 2100 stands 100 above that end's 2000 bearing.
        const band = collectCeilingBandStructure(
          floor,
          ceilingElevationRange(elevations),
          elevations.supportBearingEnds,
        );
        expect(band.walls.map((wall) => wall.id)).toEqual(['wall_stub_diagonal']);
        // And the tracer reads the same field, so the boards part at it.
        expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(2);
      });

      it('leaves the same low partition alone when it stands on the tall side', () => {
        const { project, ceiling, floor } = splitBay({
          walls: [tallDiagonal({ height: 2100, heightMode: 'manual' })],
        });

        // Nothing about the wall changed — only which support it stands beside.
        // Over here the framing stopped at 3000, so a 2100 head passes 900 clear
        // underneath and the boards run over it.
        expect(floor.walls[0].height).toBe(2100);
        const elevations = resolveCeilingElevations(project, ceiling);
        const band = collectCeilingBandStructure(
          floor,
          ceilingElevationRange(elevations),
          elevations.supportBearingEnds,
        );
        expect(band.walls).toEqual([]);
        expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(1);
      });

      it('leaves a pony wall alone even where the low step brings the band down', () => {
        const { project, ceiling } = splitBay({
          walls: [stubDiagonal({ height: 1500, heightMode: 'manual' })],
        });

        // The field lowers the floor to the stub's 2000, not to the slab: a
        // pony wall dying 500 below even the low step's framing is still
        // something the ceiling passes over.
        expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(1);
      });

      // The preview pane restores exactly the structure the boards were traced
      // around, and in a stepped bay that is only true if it asks with the same
      // bearing field. Asserted here as the parity the invariant actually needs:
      // the walls the band hands the preview are the walls whose footprints the
      // tracer subtracted to make those regions.
      it('shows the low partition in the preview exactly when the tracer traces it', () => {
        for (const [wall, traced] of [
          [stubDiagonal({ height: 2100, heightMode: 'manual' }), true],
          [tallDiagonal({ height: 2100, heightMode: 'manual' }), false],
        ]) {
          const { project, ceiling, floor } = splitBay({ walls: [wall] });
          const elevations = resolveCeilingElevations(project, ceiling);
          const previewWalls = collectCeilingBandStructure(
            floor,
            ceilingElevationRange(elevations),
            elevations.supportBearingEnds,
          ).walls;

          expect(previewWalls.length > 0).toBe(traced);
          expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(traced ? 2 : 1);
        }
      });
    });
  });

  it('breaks the furring at the partition instead of running it through', () => {
    const clear = beamBay();
    const traced = beamBay({ walls: [midPartition()] });

    const furringOf = ({ ceiling, project }) =>
      deriveCeilingFramingMembers(ceiling, project).filter((member) => member.kind === 'furring');
    const clearFurring = furringOf(clear);
    const tracedFurring = furringOf(traced);

    const originX = Math.min(...resolveCeilingBoundary(traced.project, traced.ceiling).map((point) => point.x));
    const faces = [3900 - originX, 4100 - originX];

    // Every row is cut into two: one either side of the 200 mm wall, and none
    // crossing the gap between its faces.
    expect(tracedFurring.length).toBe(clearFurring.length * 2);
    for (const member of tracedFurring) {
      expect(member.u1 <= faces[0] + 0.01 || member.u0 >= faces[1] - 0.01).toBe(true);
    }
  });
});
