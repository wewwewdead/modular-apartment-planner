import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createWall } from '@/domain/models';
import { createCeilingForProject } from '@/domain/ceilingModels';
import { createTrussSystem, syncProjectTrussSystems, TRUSS_SUPPORT_MODES } from '@/domain/trussModels';
import { getBeamRenderData } from './beamGeometry';
import { columnOutline } from './columnGeometry';
import { getWallRenderData } from './wallColumnGeometry';
import { intersectionArea } from './polygonBoolean';
import { buildCeilingPreviewObjects } from './ceilingGeometry';

/**
 * Nothing a ceiling puts in the model may end up inside the structure it hangs
 * beside. This measures the built 3D descriptors — the exact meshes the preview
 * draws — against the beam and wall footprints, so a regression shows up as a
 * real overlap area rather than as something that merely looks wrong on screen.
 */

const BEAM_TOP = 3000;
const BEAM_WIDTH = 250;
const SPAN = 6000;

function buildProject() {
  const columns = [
    ['col_a1', 0, 0],
    ['col_a2', 9000, 0],
    ['col_b1', 0, SPAN],
    ['col_b2', 9000, SPAN],
    ['col_m1', 4500, 0],
    ['col_m2', 4500, SPAN],
  ].map(([id, x, y]) => ({ ...createColumn(x, y, 300, 300, { height: BEAM_TOP }), id }));

  const beam = (id, startId, endId) => ({
    ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, BEAM_WIDTH, 450, BEAM_TOP),
    id,
  });

  const floor = {
    id: 'floor_1',
    elevation: 0,
    floorToFloorHeight: BEAM_TOP,
    columns,
    beams: [
      beam('beam_a', 'col_a1', 'col_a2'),
      beam('beam_b', 'col_b1', 'col_b2'),
      beam('beam_cross', 'col_m1', 'col_m2'),
    ],
    walls: [{ ...createWall({ x: 6800, y: 0 }, { x: 6800, y: SPAN }, 200, { height: BEAM_TOP }), id: 'wall_1' }],
    rooms: [],
    slabs: [],
    stairs: [],
    landings: [],
    fixtures: [],
    railings: [],
  };

  const project = syncProjectTrussSystems({
    floors: [floor],
    ceilings: [],
    trussSystems: [
      createTrussSystem('Roof trusses', {
        id: 'ts_1',
        floorId: floor.id,
        baseElevation: BEAM_TOP,
        trussInstances: [
          {
            trussTypeId: 'truss_type_gable',
            startPoint: { x: 0, y: SPAN / 2 },
            endPoint: { x: 9000, y: SPAN / 2 },
            span: SPAN,
            rise: 1200,
            spacing: 1000,
            count: 9,
            supportMode: TRUSS_SUPPORT_MODES.BEAM_PAIR,
            supportBeamIds: { start: 'beam_a', end: 'beam_b' },
          },
        ],
      }),
    ],
  });

  const ceiling = createCeilingForProject(project, {
    floorId: floor.id,
    attachment: { mode: 'truss', trussSystemId: 'ts_1' },
  });
  project.ceilings = [ceiling];

  return { floor, ceiling, project };
}

function structureFootprints(floor) {
  return [
    ...floor.beams.map((entry) => ({
      id: entry.id,
      outline: getBeamRenderData(entry, floor.columns).outline,
    })),
    ...floor.walls.map((entry) => ({
      id: entry.id,
      outline: getWallRenderData(entry, floor.columns).outline,
    })),
    // Columns are wider than the beams they carry, so they bite into the
    // ceiling area past the beam faces at every corner.
    ...floor.columns.map((entry) => ({ id: entry.id, outline: columnOutline(entry) })),
  ];
}

function rotatePoint(point, cos, sin) {
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

// Plan footprint of a preview descriptor, matching how each geometry kind is
// turned into a mesh: prisms extrude their outline, boxes are centred and
// rotated in plan, and segment3d is a box of crossSection.width laid along the
// line between its endpoints.
function planFootprint(descriptor) {
  if (descriptor.geometry === 'prism') return descriptor.outline;

  if (descriptor.geometry === 'box') {
    const cos = Math.cos(descriptor.rotation || 0);
    const sin = Math.sin(descriptor.rotation || 0);
    const halfX = descriptor.size.x / 2;
    const halfZ = descriptor.size.z / 2;
    return [
      { x: -halfX, y: -halfZ },
      { x: halfX, y: -halfZ },
      { x: halfX, y: halfZ },
      { x: -halfX, y: halfZ },
    ].map((corner) => {
      const rotated = rotatePoint(corner, cos, sin);
      return { x: descriptor.center.x + rotated.x, y: descriptor.center.y + rotated.y };
    });
  }

  const start = { x: descriptor.start.x, y: descriptor.start.z };
  const end = { x: descriptor.end.x, y: descriptor.end.z };
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const half = (descriptor.crossSection?.width || descriptor.thickness || 1) / 2;
  const normal = { x: (-(end.y - start.y) / length) * half, y: ((end.x - start.x) / length) * half };
  return [
    { x: start.x + normal.x, y: start.y + normal.y },
    { x: end.x + normal.x, y: end.y + normal.y },
    { x: end.x - normal.x, y: end.y - normal.y },
    { x: start.x - normal.x, y: start.y - normal.y },
  ];
}

function overlapReport(floor, descriptors) {
  const structure = structureFootprints(floor);
  const overlaps = [];

  for (const descriptor of descriptors) {
    const footprint = planFootprint(descriptor);
    for (const member of structure) {
      const area = intersectionArea(footprint, member.outline);
      if (area <= 1) continue;
      overlaps.push({
        kind: descriptor.metadata.ceilingDetailKind,
        framingKind: descriptor.metadata.framingKind || null,
        into: member.id,
        area,
        id: descriptor.id,
      });
    }
  }

  return overlaps;
}

describe('ceiling clearance against the structure it hangs beside', () => {
  it('puts no part of the ceiling inside a beam or a wall', () => {
    const { floor, ceiling, project } = buildProject();
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    // Guard the guard: an empty ceiling would pass the overlap check trivially.
    const kinds = new Set(descriptors.map((descriptor) => descriptor.metadata.ceilingDetailKind));
    expect([...kinds].sort()).toEqual(['framing', 'hanger', 'panel']);

    // Sorted worst-first so a failure names the biggest offender, what it is,
    // and which member it is buried in.
    const overlaps = overlapReport(floor, descriptors).sort((a, b) => b.area - a.area);
    expect(overlaps).toEqual([]);
  });

  it('runs the boards right up to the faces they stop at, not short of them', () => {
    const { ceiling, project } = buildProject();
    const boards = buildCeilingPreviewObjects(ceiling, project).filter(
      (descriptor) => descriptor.metadata.ceilingDetailKind === 'panel',
    );
    const points = boards.flatMap((board) => board.outline);

    // Support beams at y 0 and y 6000, 250 wide: the boards die on their inner
    // faces, so they reach 125 and 5875 exactly — no gap, no burial.
    expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(BEAM_WIDTH / 2, 6);
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(SPAN - BEAM_WIDTH / 2, 6);

    // Both faces of the beam crossing the middle at x 4500, and of the 200 mm
    // partition at x 6800, are reached from each side.
    for (const face of [4500 - BEAM_WIDTH / 2, 4500 + BEAM_WIDTH / 2, 6700, 6900]) {
      expect(points.some((point) => Math.abs(point.x - face) < 1e-6)).toBe(true);
    }
  });
});
