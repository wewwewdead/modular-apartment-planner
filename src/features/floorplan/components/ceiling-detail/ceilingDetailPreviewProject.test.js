import { describe, expect, it } from 'vitest';
import { createFloor, createWall } from '@/domain/models';
import { createCeiling } from '@/domain/ceilingModels';
import { createCeilingDetailPreviewProject } from './ceilingDetailPreviewProject';

function buildProject(ceilingOverrides = {}) {
  const floor = createFloor('Ground', 0);
  floor.walls = [createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 100)];
  floor.rooms = [{ id: 'room_1', points: [] }];
  floor.columns = [{ id: 'column_1' }];
  floor.slabs = [{ id: 'slab_1' }];

  const ceiling = createCeiling('Ceiling', {
    floorId: floor.id,
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

describe('createCeilingDetailPreviewProject', () => {
  it('keeps only the owning floor and empties every one of its collections', () => {
    const { project, floor, ceiling } = buildProject();

    const preview = createCeilingDetailPreviewProject(project, ceiling.id);

    expect(preview.floors).toHaveLength(1);
    const previewFloor = preview.floors[0];
    expect(previewFloor.id).toBe(floor.id);
    expect(previewFloor.name).toBe('Ground');
    expect(previewFloor.elevation).toBe(floor.elevation);
    expect(previewFloor.floorToFloorHeight).toBe(floor.floorToFloorHeight);
    expect(previewFloor.walls).toEqual([]);
    expect(previewFloor.rooms).toEqual([]);
    expect(previewFloor.columns).toEqual([]);
    expect(previewFloor.slabs).toEqual([]);
    // The source floor is never mutated.
    expect(floor.walls).toHaveLength(1);
  });

  it('carries only the edited ceiling, drops the roof, and empties the building systems', () => {
    const { project, ceiling } = buildProject();
    project.ceilings.push(createCeiling('Other', { floorId: project.floors[0].id }));

    const preview = createCeilingDetailPreviewProject(project, ceiling.id);

    expect(preview.ceilings).toEqual([ceiling]);
    expect(preview.roofSystem).toBeNull();
    expect(preview.building.systems).toEqual({});
  });

  it('keeps the attached truss system only when the ceiling hangs from a truss', () => {
    const manual = buildProject();
    expect(createCeilingDetailPreviewProject(manual.project, manual.ceiling.id).trussSystems).toEqual([]);

    const attached = buildProject({ attachment: { mode: 'truss', trussSystemId: 'truss_2' } });
    const preview = createCeilingDetailPreviewProject(attached.project, attached.ceiling.id);
    expect(preview.trussSystems).toHaveLength(1);
    expect(preview.trussSystems[0].id).toBe('truss_2');
  });

  it('carries the support beams of the attached truss, and the columns they need', () => {
    const { project, ceiling } = buildProject({ attachment: { mode: 'truss', trussSystemId: 'truss_2' } });
    const floor = project.floors[0];
    floor.columns = [{ id: 'column_1' }, { id: 'column_2' }, { id: 'column_3' }];
    floor.beams = [
      { id: 'beam_support', startRef: { kind: 'column', id: 'column_1' }, endRef: { kind: 'column', id: 'column_2' } },
      { id: 'beam_other', startRef: { kind: 'column', id: 'column_3' }, endRef: { kind: 'point', x: 0, y: 0 } },
    ];
    project.trussSystems[1].trussInstances = [{ id: 'truss_i1', supportBeamIds: { start: 'beam_support', end: null } }];

    const previewFloor = createCeilingDetailPreviewProject(project, ceiling.id).floors[0];

    // The beam the ceiling boundary is trimmed to comes along; the unrelated one
    // does not, and nor does the column only it referenced.
    expect(previewFloor.beams.map((beam) => beam.id)).toEqual(['beam_support']);
    expect(previewFloor.columns.map((column) => column.id)).toEqual(['column_1', 'column_2']);
  });

  it('returns null when the project or the ceiling is missing', () => {
    const { project, ceiling } = buildProject();

    expect(createCeilingDetailPreviewProject(null, ceiling.id)).toBeNull();
    expect(createCeilingDetailPreviewProject(project, 'ceiling_missing')).toBeNull();
    expect(createCeilingDetailPreviewProject(project, undefined)).toBeNull();
  });
});
