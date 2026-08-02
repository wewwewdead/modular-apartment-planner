import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { deriveApartmentProgram, validateApartmentProgram } from './apartmentProgram';
import { createDuplicatedFloor } from './floorModels';
import { createFloor, createProject, createRoom } from './models';
import { syncCanonicalBuilding } from './buildingModels';

function room(id, name, x, y, width, depth) {
  return {
    ...createRoom(name, [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + depth },
      { x, y: y + depth },
    ]),
    id,
  };
}

function projectWithRooms() {
  const project = createProject('Apartment Program');
  const ground = project.floors[0];
  const upper = createFloor('Second Floor', 1, { elevation: 3000 });
  ground.rooms = [room('g_sleep', 'Sleeping', 0, 0, 3000, 4000), room('g_bath', 'Bathroom', 3000, 0, 2000, 2000)];
  upper.rooms = [room('u_sleep', 'Sleeping', 0, 0, 3000, 4000), room('u_bath', 'Bathroom', 3000, 0, 3000, 2000)];
  return syncCanonicalBuilding({ ...project, floors: [ground, upper] });
}

function execute(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok).toBe(true);
  return result.project;
}

function defineStudioType(project) {
  return execute(project, {
    type: BUILDING_COMMANDS.CREATE_UNIT_TYPE,
    unitType: {
      id: 'studio',
      name: 'Studio',
      category: 'studio',
      targetArea: { min: 15000000, preferred: 18000000, max: 25000000 },
      spaceRequirements: [
        { id: 'studio_sleep', spaceType: 'sleeping', name: 'Sleeping Area', minCount: 1, maxCount: 1 },
        { id: 'studio_bath', spaceType: 'bathroom', name: 'Bathroom', minCount: 1, maxCount: 1 },
      ],
    },
  });
}

describe('apartment program relationships', () => {
  it('configures a four-unit typical program and generates stable instances evenly across two levels', () => {
    let project = projectWithRooms();
    const unitType = {
      id: 'typical_studio',
      name: 'Typical Studio',
      category: 'studio',
      targetArea: { min: 20000000, preferred: 25000000, max: 30000000 },
      spaceRequirements: [
        { id: 'studio_living_sleeping', spaceType: 'living_sleeping', minCount: 1, maxCount: 1 },
        { id: 'studio_bathroom', spaceType: 'bathroom', minCount: 1, maxCount: 1 },
        { id: 'studio_kitchen', spaceType: 'kitchen', minCount: 1, maxCount: 1 },
      ],
    };
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM,
      unitType,
      targetCount: 4,
      parkingRequirement: 1,
    });
    expect(project.building).toMatchObject({
      brief: { targetUnitCount: 4 },
      spaceProgram: {
        configured: true,
        unitTargets: [{ unitTypeId: 'typical_studio', count: 4 }],
        parkingRequirement: 1,
      },
    });

    const generated = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.GENERATE_UNIT_INSTANCES,
      typeId: unitType.id,
      count: 4,
      floorIds: project.floors.map((floor) => floor.id),
    });
    expect(generated.ok).toBe(true);
    project = generated.project;
    expect(project.building.unitInstances).toHaveLength(4);
    expect(project.building.unitInstances.filter((instance) => instance.floorId === project.floors[0].id)).toHaveLength(
      2,
    );
    expect(project.building.unitInstances.filter((instance) => instance.floorId === project.floors[1].id)).toHaveLength(
      2,
    );
    expect(new Set(project.building.unitInstances.map((instance) => instance.id)).size).toBe(4);
    expect(generated.validation.issues.some((issue) => issue.ruleId === 'PROGRAM.UNIT_COUNT_MISMATCH')).toBe(false);

    const repeated = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.GENERATE_UNIT_INSTANCES,
      typeId: unitType.id,
      count: 4,
      floorIds: project.floors.map((floor) => floor.id),
    });
    expect(repeated.ok).toBe(true);
    expect(repeated.changes.domain[0].createdInstanceIds).toEqual([]);
    expect(repeated.project.building.unitInstances).toHaveLength(4);
  });

  it('tracks brief targets, unit types, and modeled instance counts', () => {
    let project = defineStudioType(projectWithRooms());
    project = execute(project, {
      type: BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF,
      updates: { targetStoreys: 2, targetUnitCount: 2, targetBudget: 6000000, currency: 'PHP' },
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.DEFINE_SPACE_PROGRAM,
      unitTargets: [{ unitTypeId: 'studio', count: 2 }],
      parkingRequirement: 1,
    });

    let derived = deriveApartmentProgram(project);
    expect(derived).toMatchObject({
      configured: true,
      totalUnitInstances: 0,
      unitTypeSummaries: [{ unitTypeId: 'studio', targetCount: 2, linkedInstanceCount: 0 }],
    });
    expect(validateApartmentProgram(project)).toContainEqual(
      expect.objectContaining({ ruleId: 'PROGRAM.UNIT_COUNT_MISMATCH' }),
    );

    project = execute(project, {
      type: BUILDING_COMMANDS.CREATE_UNIT_INSTANCE,
      instanceId: 'unit_ground',
      typeId: 'studio',
      floorId: project.floors[0].id,
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CREATE_UNIT_INSTANCE,
      instanceId: 'unit_upper',
      typeId: 'studio',
      floorId: project.floors[1].id,
    });
    derived = deriveApartmentProgram(project);
    expect(derived.unitTypeSummaries[0]).toMatchObject({ linkedInstanceCount: 2, targetCount: 2 });
  });

  it('synchronizes room membership and detects linked-unit divergence from geometry', () => {
    let project = defineStudioType(projectWithRooms());
    project = execute(project, {
      type: BUILDING_COMMANDS.CREATE_UNIT_INSTANCE,
      instanceId: 'unit_ground',
      typeId: 'studio',
      floorId: project.floors[0].id,
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CREATE_UNIT_INSTANCE,
      instanceId: 'unit_upper',
      typeId: 'studio',
      floorId: project.floors[1].id,
    });

    const assignments = [
      [0, 'g_sleep', 'unit_ground', 'sleeping'],
      [0, 'g_bath', 'unit_ground', 'bathroom'],
      [1, 'u_sleep', 'unit_upper', 'sleeping'],
      [1, 'u_bath', 'unit_upper', 'bathroom'],
    ];
    for (const [floorIndex, roomId, instanceId, spaceType] of assignments) {
      project = execute(project, {
        type: BUILDING_COMMANDS.ASSIGN_ROOM_TO_UNIT,
        floorId: project.floors[floorIndex].id,
        roomId,
        instanceId,
        spaceType,
      });
    }

    expect(project.building.unitInstances.find((instance) => instance.id === 'unit_ground').roomIds).toEqual([
      'g_sleep',
      'g_bath',
    ]);
    expect(project.floors[0].rooms.every((entry) => entry.useCategory === 'rentable')).toBe(true);
    expect(validateApartmentProgram(project)).toContainEqual(
      expect.objectContaining({
        ruleId: 'PROGRAM.LINKED_UNIT_DIVERGED',
        evidence: expect.objectContaining({ resultKind: 'verified_geometry', confidence: 'checked' }),
      }),
    );
  });

  it('marks linked instances outdated after a type revision and excludes detached instances', () => {
    let project = defineStudioType(projectWithRooms());
    for (const [instanceId, floor] of [
      ['unit_ground', project.floors[0]],
      ['unit_upper', project.floors[1]],
    ]) {
      project = execute(project, {
        type: BUILDING_COMMANDS.CREATE_UNIT_INSTANCE,
        instanceId,
        typeId: 'studio',
        floorId: floor.id,
      });
    }
    project = execute(project, {
      type: BUILDING_COMMANDS.UPDATE_UNIT_TYPE,
      unitTypeId: 'studio',
      updates: { name: 'Studio Rev B' },
    });
    expect(
      validateApartmentProgram(project).filter((issue) => issue.ruleId === 'PROGRAM.UNIT_INSTANCE_OUTDATED'),
    ).toHaveLength(2);

    project = execute(project, {
      type: BUILDING_COMMANDS.DETACH_UNIT_INSTANCE,
      instanceId: 'unit_upper',
    });
    expect(
      validateApartmentProgram(project).filter((issue) => issue.ruleId === 'PROGRAM.UNIT_INSTANCE_OUTDATED'),
    ).toHaveLength(1);
  });

  it('clears unit membership when a floor is duplicated as raw geometry', () => {
    const source = projectWithRooms().floors[0];
    source.rooms[0].unitInstanceId = 'unit_ground';
    source.rooms[0].spaceRequirementId = 'studio_sleep';

    const duplicate = createDuplicatedFloor(source);
    expect(duplicate.rooms[0].unitInstanceId).toBeNull();
    expect(duplicate.rooms[0].spaceRequirementId).toBeNull();
    expect(duplicate.rooms[0].spaceType).toBeNull();
  });

  it('classifies shared circulation independently from apartment-unit membership', () => {
    let project = projectWithRooms();
    project = execute(project, {
      type: BUILDING_COMMANDS.CLASSIFY_ROOM,
      floorId: project.floors[0].id,
      roomId: 'g_sleep',
      useCategory: 'circulation',
      spaceType: 'shared_corridor',
    });

    const classified = project.floors[0].rooms.find((entry) => entry.id === 'g_sleep');
    expect(classified).toMatchObject({ useCategory: 'circulation', spaceType: 'shared_corridor' });
    expect(deriveApartmentProgram(project).areaByUseCategory.circulation).toBe(12000000);
  });

  it('explicitly removes a room from a linked unit and synchronizes reverse membership', () => {
    let project = defineStudioType(projectWithRooms());
    project = execute(project, {
      type: BUILDING_COMMANDS.CREATE_UNIT_INSTANCE,
      instanceId: 'unit_ground',
      typeId: 'studio',
      floorId: project.floors[0].id,
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.ASSIGN_ROOM_TO_UNIT,
      floorId: project.floors[0].id,
      roomId: 'g_sleep',
      instanceId: 'unit_ground',
      spaceType: 'sleeping',
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.UNASSIGN_ROOM_FROM_UNIT,
      floorId: project.floors[0].id,
      roomId: 'g_sleep',
    });
    expect(project.floors[0].rooms[0]).toMatchObject({
      unitInstanceId: null,
      spaceRequirementId: null,
      useCategory: null,
    });
    expect(project.building.unitInstances[0].roomIds).toEqual([]);
  });
});
