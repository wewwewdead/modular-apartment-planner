import { describe, expect, it } from 'vitest';
import { createColumn, createFloor, createProject, createSlab } from './models';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { validateStructuralCoordination } from './structuralCoordination';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

/**
 * A first floor whose plate reaches 600 mm past the ground floor, with the
 * frame below 4 m inboard of the projecting edge.
 */
function cantileveredProject({
  columns = [
    { x: 500, y: 1600 },
    { x: 2600, y: 1600 },
  ],
} = {}) {
  const project = createProject();
  const ground = project.floors[0];
  ground.columns = columns.map((point, index) => ({ ...createColumn(point.x, point.y), id: `column_${index}` }));
  ground.slabs = [{ ...createSlab(ground.id, rectangle(0, 0, 3000, 5000), 200, 0), id: 'slab_ground' }];

  const first = { ...createFloor('First', 1, { elevation: 3000, floorToFloorHeight: 3000 }), id: 'floor_first' };
  first.slabs = [{ ...createSlab(first.id, rectangle(0, 0, 3000, 5600), 200, 3000), id: 'slab_upper' }];

  return { ...project, floors: [ground, first] };
}

function generateSupports(project) {
  return executeBuildingCommand(project, {
    type: BUILDING_COMMANDS.GENERATE_SLAB_OVERHANG_SUPPORTS,
    floorId: 'floor_first',
    slabId: 'slab_upper',
  });
}

describe('Gamma structural commands', () => {
  it('creates declared cantilevers and exposes excessive planning length without claiming capacity', () => {
    const project = createProject();
    const floor = project.floors[0];
    floor.columns = [{ ...createColumn(0, 0), id: 'column_support' }];
    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_CANTILEVER_BEAM,
      floorId: floor.id,
      beamId: 'cantilever_1',
      supportColumnId: 'column_support',
      freeEnd: { x: 2200, y: 0 },
    });
    expect(result.ok).toBe(true);
    expect(result.project.floors[0].beams[0]).toMatchObject({
      endRef: { kind: 'point', x: 2200, y: 0 },
      coordination: { condition: 'cantilever' },
    });
    expect(result.validation.issues).toContainEqual(
      expect.objectContaining({ ruleId: 'STRUCT.CANTILEVER_EXCEEDS_ASSUMPTION', severity: 'warning' }),
    );
    expect(result.validation.issues.some((entry) => entry.ruleId === 'STRUCT.BEAM_UNSUPPORTED_END')).toBe(false);
  });

  it('coordinates slab supports, adds an opening, and returns validation consequences atomically', () => {
    let project = createProject();
    const floor = project.floors[0];
    const first = { ...createColumn(0, 2000), id: 'column_a' };
    const second = { ...createColumn(4000, 2000), id: 'column_b' };
    floor.columns = [first, second];
    let result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
      floorId: floor.id,
      beamId: 'beam_1',
      startColumnId: first.id,
      endColumnId: second.id,
    });
    project = result.project;
    project.floors[0].slabs = [{ ...createSlab(floor.id, rectangle(0, 0, 4000, 4000)), id: 'slab_1' }];
    result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.COORDINATE_SLAB_SUPPORTS,
      floorId: floor.id,
      slabId: 'slab_1',
      supportRefs: [
        { kind: 'beam', id: 'beam_1' },
        { kind: 'column', id: first.id },
      ],
      maxPlanningSpan: 4500,
    });
    expect(result.ok).toBe(true);
    expect(result.project.floors[0].slabs[0]).toMatchObject({
      supportRefs: [
        { kind: 'beam', id: 'beam_1', inference: 'user_selected' },
        { kind: 'column', id: first.id, inference: 'user_selected' },
      ],
      coordination: { supportAssignment: 'user_selected', maxPlanningSpan: 4500 },
    });
    expect(result.changes.domain).toContainEqual(
      expect.objectContaining({ operation: 'derive', entityType: 'conceptualLoadPath' }),
    );

    result = executeBuildingCommand(result.project, {
      type: BUILDING_COMMANDS.ADD_SLAB_OPENING,
      floorId: floor.id,
      slabId: 'slab_1',
      openingId: 'shaft_opening',
      origin: { x: 1900, y: 1700 },
      width: 300,
      depth: 600,
      purpose: 'plumbing_shaft',
    });
    expect(result.ok).toBe(true);
    expect(result.validation.introduced).toContainEqual(
      expect.objectContaining({ ruleId: 'STRUCT.SLAB_OPENING_INTERSECTS_BEAM' }),
    );
    expect(result.undo.project).not.toBe(result.project);
  });
});

describe('GenerateSlabOverhangSupports', () => {
  it('files cantilever beams on the storey below with their tops at the slab soffit', () => {
    const result = generateSupports(cantileveredProject());
    const [ground, first] = result.project.floors;

    expect(result.ok).toBe(true);
    expect(first.beams).toHaveLength(0);
    expect(ground.beams).toHaveLength(3);
    for (const beam of ground.beams) {
      expect(beam).toMatchObject({
        startRef: { kind: 'column' },
        endRef: { kind: 'point', y: 5600 },
        coordination: { condition: 'cantilever' },
        // Slab top 3000 less its 200 plate: where a beam carrying it bears.
        floorLevel: 2800,
      });
    }
  });

  it('names the created beams, the floor they went on, and the stations it passed over', () => {
    const result = generateSupports(cantileveredProject());
    const generated = result.changes.domain.find((entry) => entry.entityType === 'slabOverhangSupport');
    const [ground] = result.project.floors;

    expect(generated).toMatchObject({
      operation: 'generate',
      id: 'slab_upper',
      floorId: ground.id,
      hostFloorId: 'floor_first',
      stationCount: 5,
      // Neither return-edge tail has a column square behind it: one is reached
      // before the long edge is framed and passed over, the other afterwards,
      // by which time a beam already runs close enough to carry it.
      skippedStationCount: 1,
      carriedStationCount: 1,
    });
    expect(generated.beamIds).toEqual(ground.beams.map((beam) => beam.id));
  });

  it('records the new beams as supports of the slab they carry', () => {
    const result = generateSupports(cantileveredProject());
    const slab = result.project.floors[1].slabs[0];

    expect(slab.supportRefs).toHaveLength(3);
    for (const ref of slab.supportRefs) {
      expect(ref).toMatchObject({ kind: 'beam', role: 'overhang_support', inference: 'generated_overhang_support' });
    }
  });

  it('settles the unsupported-overhang warning it was reached for', () => {
    const project = cantileveredProject();

    expect(
      validateStructuralCoordination(project).some((entry) => entry.ruleId === 'STRUCT.SLAB_OVERHANG_UNSUPPORTED'),
    ).toBe(true);
    expect(
      validateStructuralCoordination(generateSupports(project).project).some(
        (entry) => entry.ruleId === 'STRUCT.SLAB_OVERHANG_UNSUPPORTED',
      ),
    ).toBe(false);
  });

  it('plants nothing the second time, having already carried every station', () => {
    const once = generateSupports(cantileveredProject());
    const twice = generateSupports(once.project);

    expect(twice.ok).toBe(false);
    expect(twice.error.code).toBe('slab-overhang-already-supported');
    expect(twice.project.floors[0].beams).toHaveLength(3);
    expect(twice.project.floors[1].slabs[0].supportRefs).toHaveLength(3);
  });

  it('refuses to anchor beams on nothing when the storey below has no columns', () => {
    const result = generateSupports(cantileveredProject({ columns: [] }));

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('overhang-support-column-not-found');
    expect(result.error.details.skippedStationCount).toBe(5);
    expect(result.project.floors[0].beams).toHaveLength(0);
  });

  it('has nothing to do for a slab that stays inside the floor below', () => {
    const project = cantileveredProject();
    project.floors[1].slabs[0].boundaryPoints = rectangle(0, 0, 3000, 5000);
    const result = generateSupports(project);

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('slab-overhang-not-found');
  });

  it('rejects a slab or floor that is not there', () => {
    const project = cantileveredProject();

    expect(
      executeBuildingCommand(project, {
        type: BUILDING_COMMANDS.GENERATE_SLAB_OVERHANG_SUPPORTS,
        floorId: 'floor_first',
        slabId: 'missing_slab',
      }).error.code,
    ).toBe('slab-not-found');
    expect(
      executeBuildingCommand(project, {
        type: BUILDING_COMMANDS.GENERATE_SLAB_OVERHANG_SUPPORTS,
        floorId: 'missing_floor',
        slabId: 'slab_upper',
      }).error.code,
    ).toBe('floor-not-found');
  });
});
