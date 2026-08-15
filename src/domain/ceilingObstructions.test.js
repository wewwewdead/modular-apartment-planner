import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createWall } from './models';
import {
  createCeilingForProject,
  createCeiling,
  deriveCeilingDetail,
  deriveCeilingFramingMembers,
  deriveCeilingPanels,
  resolveCeilingBoundary,
} from './ceilingModels';
import { createTrussSystem, syncProjectTrussSystems, TRUSS_SUPPORT_MODES } from './trussModels';
import { collectCeilingObstructions } from './ceilingObstructions';

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
