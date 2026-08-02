import { describe, expect, it } from 'vitest';
import { createDoor, createFixture, createProject, createRoom, createWall } from './models';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

function configureUnits(project) {
  let result = executeBuildingCommand(project, {
    type: BUILDING_COMMANDS.CREATE_UNIT_TYPE,
    unitType: {
      id: 'studio',
      name: 'Typical Studio',
      category: 'studio',
      spaceRequirements: [{ id: 'studio_living', spaceType: 'living_sleeping', name: 'Living / sleeping' }],
    },
  });
  result = executeBuildingCommand(result.project, {
    type: BUILDING_COMMANDS.CREATE_UNIT_INSTANCE,
    instanceId: 'studio_source',
    typeId: 'studio',
    floorId: project.floors[0].id,
    name: 'Studio 1',
  });
  result = executeBuildingCommand(result.project, {
    type: BUILDING_COMMANDS.CREATE_UNIT_INSTANCE,
    instanceId: 'studio_target',
    typeId: 'studio',
    floorId: project.floors[0].id,
    name: 'Studio 2',
    placement: { origin: { x: 5000, y: 0 }, rotation: 0 },
  });
  return result.project;
}

describe('geometry-backed unit types', () => {
  it('captures a mapped source and propagates stable, owned geometry to a placed linked instance', () => {
    let project = configureUnits(createProject('Unit geometry'));
    const floor = project.floors[0];
    const walls = [
      { ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }), id: 'source_wall_1' },
      { ...createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }), id: 'source_wall_2' },
      { ...createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }), id: 'source_wall_3' },
      { ...createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }), id: 'source_wall_4' },
    ];
    const room = {
      ...createRoom('Living / sleeping', rectangle(0, 0, 4000, 3000)),
      id: 'source_room',
    };
    project = {
      ...project,
      floors: [
        {
          ...floor,
          walls,
          rooms: [room],
          doors: [{ ...createDoor('source_wall_1', 1200, 900), id: 'source_door' }],
          fixtures: [{ ...createFixture('bed', 2000, 1500), id: 'source_fixture' }],
        },
      ],
    };
    let result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.ASSIGN_ROOM_TO_UNIT,
      floorId: floor.id,
      roomId: room.id,
      instanceId: 'studio_source',
      spaceType: 'living_sleeping',
    });
    result = executeBuildingCommand(result.project, {
      type: BUILDING_COMMANDS.CAPTURE_UNIT_TYPE_GEOMETRY,
      sourceInstanceId: 'studio_source',
    });

    expect(result.ok).toBe(true);
    const type = result.project.building.unitTypes[0];
    expect(type.geometryTemplate).toMatchObject({
      coordinateSystem: 'unit_local_mm',
      capturedFromInstanceId: 'studio_source',
      walls: expect.arrayContaining([expect.objectContaining({ key: 'wall_1' })]),
      rooms: [expect.objectContaining({ key: 'room_1', spaceType: 'living_sleeping' })],
    });
    expect(type.geometryTemplate.walls).toHaveLength(4);
    expect(result.validation.issues).toContainEqual(
      expect.objectContaining({ ruleId: 'PROGRAM.UNIT_INSTANCE_OUTDATED' }),
    );

    result = executeBuildingCommand(result.project, {
      type: BUILDING_COMMANDS.PROPAGATE_UNIT_TYPE_GEOMETRY,
      unitTypeId: 'studio',
      targetInstanceIds: ['studio_target'],
    });
    expect(result.ok).toBe(true);
    const targetRoom = result.project.floors[0].rooms.find((entry) => entry.id === 'studio_target__room_1');
    expect(targetRoom).toMatchObject({
      unitInstanceId: 'studio_target',
      unitTemplateGenerated: true,
      points: rectangle(5000, 0, 4000, 3000),
    });
    expect(result.project.floors[0].doors.find((entry) => entry.id === 'studio_target__door_1')).toMatchObject({
      wallId: 'studio_target__wall_1',
      unitInstanceId: 'studio_target',
    });
    expect(result.project.building.unitInstances.find((entry) => entry.id === 'studio_target')).toMatchObject({
      sourceRevision: type.revision,
      roomIds: ['studio_target__room_1'],
      generatedEntityRefs: { walls: expect.arrayContaining(['studio_target__wall_1']) },
    });
    expect(result.validation.issues.some((entry) => entry.ruleId === 'PROGRAM.UNIT_GEOMETRY_INCOMPLETE')).toBe(false);

    const repeated = executeBuildingCommand(result.project, {
      type: BUILDING_COMMANDS.PROPAGATE_UNIT_TYPE_GEOMETRY,
      unitTypeId: 'studio',
      targetInstanceIds: ['studio_target'],
    });
    expect(repeated.ok).toBe(true);
    expect(repeated.project.floors[0].walls.filter((wall) => wall.unitInstanceId === 'studio_target')).toHaveLength(4);
    expect(repeated.project.floors[0].rooms.filter((entry) => entry.unitInstanceId === 'studio_target')).toHaveLength(
      1,
    );

    const moved = executeBuildingCommand(repeated.project, {
      type: BUILDING_COMMANDS.SET_UNIT_INSTANCE_PLACEMENT,
      instanceId: 'studio_target',
      placement: { origin: { x: 6000, y: 1000 }, rotation: 0 },
    });
    expect(moved.ok).toBe(true);
    expect(moved.validation.issues).toContainEqual(
      expect.objectContaining({ ruleId: 'PROGRAM.UNIT_INSTANCE_OUTDATED' }),
    );
    const updated = executeBuildingCommand(moved.project, {
      type: BUILDING_COMMANDS.PROPAGATE_UNIT_TYPE_GEOMETRY,
      unitTypeId: 'studio',
      targetInstanceIds: ['studio_target'],
    });
    expect(updated.project.floors[0].rooms.find((entry) => entry.id === 'studio_target__room_1').points).toEqual(
      rectangle(6000, 1000, 4000, 3000),
    );
  });

  it('protects manually mapped targets and requires an explicit placement', () => {
    let project = configureUnits(createProject('Safe propagation'));
    project = {
      ...project,
      building: {
        ...project.building,
        unitTypes: project.building.unitTypes.map((type) => ({
          ...type,
          revision: 2,
          geometryTemplate: {
            revision: 2,
            capturedFromInstanceId: 'studio_source',
            walls: [],
            doors: [],
            windows: [],
            fixtures: [],
            rooms: [{ key: 'room_1', points: rectangle(0, 0, 3000, 3000), labelPosition: { x: 1500, y: 1500 } }],
          },
        })),
      },
    };
    const target = project.building.unitInstances.find((entry) => entry.id === 'studio_target');
    const room = {
      ...createRoom('Manual room', rectangle(5000, 0, 3000, 3000)),
      id: 'manual_room',
      unitInstanceId: target.id,
    };
    project.floors[0].rooms = [room];
    project.building.unitInstances = project.building.unitInstances.map((entry) =>
      entry.id === target.id ? { ...entry, roomIds: [room.id] } : entry,
    );
    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.PROPAGATE_UNIT_TYPE_GEOMETRY,
      unitTypeId: 'studio',
      targetInstanceIds: ['studio_target'],
    });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('unit-manual-geometry-replacement-required');
    expect(result.project).toBe(project);
  });
});
