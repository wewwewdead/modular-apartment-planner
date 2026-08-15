import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '@/domain/models';
import { ceilingElevationRange, createCeiling, resolveCeilingElevations } from '@/domain/ceilingModels';
import { collectCeilingObstructions } from '@/domain/ceilingObstructions';
import { createCeilingDetailPreviewProject } from './ceilingDetailPreviewProject';

// A manual ceiling's boards sit exactly on its base elevation, so a member
// 3000 tall on a floor at 0 finishes level with the underside: the closed
// interval the tracer uses counts that as reaching the ceiling, and anything
// stopping below it is floating clear.
const CEILING_LEVEL = 3000;
const SHORT = CEILING_LEVEL - 400;

function buildProject(ceilingOverrides = {}) {
  const floor = createFloor('Ground', 0);
  floor.walls = [createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 100, { height: CEILING_LEVEL })];
  floor.rooms = [{ id: 'room_1', points: [] }];
  floor.columns = [{ id: 'column_1' }];
  floor.slabs = [{ id: 'slab_1' }];

  const ceiling = createCeiling('Ceiling', {
    floorId: floor.id,
    baseElevation: CEILING_LEVEL,
    boundaryPolygon: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    ...ceilingOverrides,
  });

  return {
    project: {
      id: 'project',
      floors: [floor],
      ceilings: [ceiling],
      roofSystem: { id: 'roof_1' },
      trussSystems: [
        { id: 'truss_1', floorId: floor.id, trussInstances: [] },
        { id: 'truss_2', floorId: floor.id, trussInstances: [] },
      ],
      building: { id: 'building', systems: { structural: { members: [1, 2] } } },
    },
    floor,
    ceiling,
  };
}

function column(id, height) {
  return { id, x: 2000, y: 2000, width: 300, depth: 300, height };
}

describe('createCeilingDetailPreviewProject', () => {
  it('keeps only the owning floor and empties every collection that is no part of the ceiling', () => {
    const { project, floor, ceiling } = buildProject();

    const preview = createCeilingDetailPreviewProject(project, ceiling.id);

    expect(preview.floors).toHaveLength(1);
    const previewFloor = preview.floors[0];
    expect(previewFloor.id).toBe(floor.id);
    expect(previewFloor.name).toBe('Ground');
    expect(previewFloor.elevation).toBe(floor.elevation);
    expect(previewFloor.floorToFloorHeight).toBe(floor.floorToFloorHeight);
    expect(previewFloor.rooms).toEqual([]);
    expect(previewFloor.slabs).toEqual([]);
    expect(previewFloor.stairs).toEqual([]);
    expect(previewFloor.railings).toEqual([]);
    expect(previewFloor.fixtures).toEqual([]);
    expect(previewFloor.landings).toEqual([]);
    expect(previewFloor.annotations).toEqual([]);
    expect(previewFloor.sectionCuts).toEqual([]);
    // The stub column is height-less, so it never reaches the boards.
    expect(previewFloor.columns).toEqual([]);
    // The source floor is never mutated.
    expect(floor.walls).toHaveLength(1);
    expect(floor.rooms).toHaveLength(1);
  });

  it('carries only the edited ceiling, drops the roof, and empties the building systems', () => {
    const { project, ceiling } = buildProject();
    project.ceilings.push(createCeiling('Other', { floorId: project.floors[0].id }));

    const preview = createCeilingDetailPreviewProject(project, ceiling.id);

    expect(preview.ceilings).toEqual([ceiling]);
    expect(preview.roofSystem).toBeNull();
    expect(preview.building.systems).toEqual({});
  });

  it('drops the truss systems whatever the ceiling hangs from', () => {
    const manual = buildProject();
    expect(createCeilingDetailPreviewProject(manual.project, manual.ceiling.id).trussSystems).toEqual([]);

    const hung = buildProject({ attachment: { mode: 'beam', beamIds: ['beam_support'] } });
    expect(createCeilingDetailPreviewProject(hung.project, hung.ceiling.id).trussSystems).toEqual([]);
  });

  it('carries the support beams the ceiling hangs from, and the columns they need', () => {
    const { project, ceiling } = buildProject({ attachment: { mode: 'beam', beamIds: ['beam_support'] } });
    const floor = project.floors[0];
    floor.columns = [{ id: 'column_1' }, { id: 'column_2' }, { id: 'column_3' }];
    floor.beams = [
      { id: 'beam_support', startRef: { kind: 'column', id: 'column_1' }, endRef: { kind: 'column', id: 'column_2' } },
      { id: 'beam_other', startRef: { kind: 'column', id: 'column_3' }, endRef: { kind: 'point', x: 0, y: 0 } },
    ];

    const previewFloor = createCeilingDetailPreviewProject(project, ceiling.id).floors[0];

    // The beam the ceiling boundary is trimmed to comes along; the unrelated one
    // does not, and nor does the column only it referenced.
    expect(previewFloor.beams.map((beam) => beam.id)).toEqual(['beam_support']);
    expect(previewFloor.columns.map((entry) => entry.id)).toEqual(['column_1', 'column_2']);
  });

  it('keeps the support beams and their end columns even where the elevation test drops them', () => {
    const { project, ceiling } = buildProject({ attachment: { mode: 'beam', beamIds: ['beam_support'] } });
    const floor = project.floors[0];
    // Stub legs: far too short to reach the band the ceiling hangs in, but the
    // beam has no geometry at all without them.
    floor.columns = [column('column_1', 10), column('column_2', 10)];
    floor.beams = [
      {
        id: 'beam_support',
        startRef: { kind: 'column', id: 'column_1' },
        endRef: { kind: 'column', id: 'column_2' },
        floorLevel: CEILING_LEVEL,
        depth: 450,
      },
    ];

    const previewFloor = createCeilingDetailPreviewProject(project, ceiling.id).floors[0];

    expect(previewFloor.beams.map((beam) => beam.id)).toEqual(['beam_support']);
    expect(previewFloor.columns.map((entry) => entry.id)).toEqual(['column_1', 'column_2']);
  });

  it('carries a mid-ceiling column that reaches the band, and leaves a short one out', () => {
    const { project, ceiling } = buildProject();
    project.floors[0].columns = [
      // Exactly level with the board underside: the tracer's interval is closed,
      // so this one carries the ceiling rather than passing under it.
      column('column_touching', CEILING_LEVEL),
      column('column_through', CEILING_LEVEL + 500),
      column('column_short', SHORT),
    ];

    const previewFloor = createCeilingDetailPreviewProject(project, ceiling.id).floors[0];

    expect(previewFloor.columns.map((entry) => entry.id)).toEqual(['column_touching', 'column_through']);
  });

  it('carries a wall that reaches the band, and leaves a floating one out', () => {
    const { project, ceiling } = buildProject();
    const floor = project.floors[0];
    const tall = createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 100, { height: CEILING_LEVEL });
    const stub = createWall({ x: 0, y: 4000 }, { x: 6000, y: 4000 }, 100, { height: SHORT });
    floor.walls = [tall, stub];

    const previewFloor = createCeilingDetailPreviewProject(project, ceiling.id).floors[0];

    expect(previewFloor.walls.map((wall) => wall.id)).toEqual([tall.id]);
  });

  it('sends the doors and windows of a carried wall along with it', () => {
    const { project, ceiling } = buildProject();
    const floor = project.floors[0];
    const tall = createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 100, { height: CEILING_LEVEL });
    const stub = createWall({ x: 0, y: 4000 }, { x: 6000, y: 4000 }, 100, { height: SHORT });
    floor.walls = [tall, stub];
    floor.doors = [
      { id: 'door_carried', wallId: tall.id, offset: 1000, width: 900 },
      { id: 'door_dropped', wallId: stub.id, offset: 1000, width: 900 },
    ];
    floor.windows = [
      { id: 'win_carried', wallId: tall.id, offset: 3000, width: 1200 },
      { id: 'win_orphan', wallId: 'wall_gone', offset: 3000, width: 1200 },
    ];

    const previewFloor = createCeilingDetailPreviewProject(project, ceiling.id).floors[0];

    // An opening only travels with the wall it is cut into: a wall carried here
    // without its door would stand solid where the model shows a doorway.
    expect(previewFloor.doors.map((door) => door.id)).toEqual(['door_carried']);
    expect(previewFloor.windows.map((entry) => entry.id)).toEqual(['win_carried']);
  });

  it('gives a manual-datum ceiling the same traced structure a hung one gets', () => {
    const { project, ceiling } = buildProject();
    const floor = project.floors[0];
    expect(ceiling.attachment.mode).toBe('manual');
    floor.columns = [column('column_mid', CEILING_LEVEL), column('column_short', SHORT)];
    floor.beams = [
      { id: 'beam_crossing', startRef: null, endRef: null, floorLevel: CEILING_LEVEL, depth: 450 },
      { id: 'beam_below', startRef: null, endRef: null, floorLevel: SHORT, depth: 450 },
    ];

    const previewFloor = createCeilingDetailPreviewProject(project, ceiling.id).floors[0];

    expect(previewFloor.columns.map((entry) => entry.id)).toEqual(['column_mid']);
    expect(previewFloor.beams.map((beam) => beam.id)).toEqual(['beam_crossing']);
    expect(previewFloor.walls.map((wall) => wall.id)).toEqual([floor.walls[0].id]);
  });

  it('returns null when the project or the ceiling is missing', () => {
    const { project, ceiling } = buildProject();

    expect(createCeilingDetailPreviewProject(null, ceiling.id)).toBeNull();
    expect(createCeilingDetailPreviewProject(project, 'ceiling_missing')).toBeNull();
    expect(createCeilingDetailPreviewProject(project, undefined)).toBeNull();
  });
});

// The preview only ever contains what the RCP's own cutouts were traced around,
// so the two panes of the editor cannot disagree about the shape of a board.
describe('preview structure matches what the obstruction tracer sees', () => {
  it('includes every member whose footprint the tracer subtracts from the boards', () => {
    const { project, ceiling } = buildProject();
    const floor = project.floors[0];
    floor.columns = [column('column_mid', CEILING_LEVEL + 200), column('column_short', SHORT)];
    floor.walls = [
      createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 100, { height: CEILING_LEVEL }),
      createWall({ x: 0, y: 4000 }, { x: 6000, y: 4000 }, 100, { height: SHORT }),
    ];

    const range = ceilingElevationRange(resolveCeilingElevations(project, ceiling));
    const previewFloor = createCeilingDetailPreviewProject(project, ceiling.id).floors[0];

    // Same floor, same band: the preview and the tracer count the same members.
    expect(collectCeilingObstructions([previewFloor], range)).toHaveLength(
      collectCeilingObstructions([floor], range).length,
    );
    expect(collectCeilingObstructions([previewFloor], range)).toHaveLength(2);
  });
});
