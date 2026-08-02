import { describe, expect, it } from 'vitest';
import { createFloor, createProject, createRoom, createWall } from './models';
import { syncCanonicalBuilding } from './buildingModels';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { validateBuildingCoordination } from './buildingGraph';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

describe('Apartment Planner Beta acceptance', () => {
  it('captures one typical unit and updates three placed instances across two levels from one revision', () => {
    let project = createProject('Beta four-unit apartment');
    const ground = project.floors[0];
    const upper = createFloor('Second Floor', 1, { elevation: 3000, floorToFloorHeight: 3000 });
    project = syncCanonicalBuilding({ ...project, floors: [ground, upper] });
    project = run(project, {
      type: BUILDING_COMMANDS.CREATE_UNIT_TYPE,
      unitType: {
        id: 'typical_studio',
        name: 'Typical Studio',
        category: 'studio',
        targetArea: { min: 10_000_000, preferred: 12_000_000, max: 14_000_000 },
        spaceRequirements: [
          { id: 'studio_living', name: 'Living / sleeping', spaceType: 'living_sleeping', minCount: 1, maxCount: 1 },
        ],
      },
    });
    const placements = [
      [ground.id, 'unit_g1', 0],
      [ground.id, 'unit_g2', 5000],
      [upper.id, 'unit_u1', 0],
      [upper.id, 'unit_u2', 5000],
    ];
    for (const [floorId, instanceId, x] of placements) {
      project = run(project, {
        type: BUILDING_COMMANDS.CREATE_UNIT_INSTANCE,
        instanceId,
        name: instanceId.toUpperCase(),
        typeId: 'typical_studio',
        floorId,
        placement: { origin: { x, y: 0 }, rotation: 0 },
      });
    }
    const sourceWalls = [
      { ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }), id: 'source_wall_1' },
      { ...createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }), id: 'source_wall_2' },
      { ...createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }), id: 'source_wall_3' },
      { ...createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }), id: 'source_wall_4' },
    ];
    const sourceRoom = {
      ...createRoom('Living / sleeping', rectangle(0, 0, 4000, 3000)),
      id: 'source_room',
    };
    project = {
      ...project,
      floors: project.floors.map((floor) =>
        floor.id === ground.id ? { ...floor, walls: sourceWalls, rooms: [sourceRoom] } : floor,
      ),
    };
    project = run(project, {
      type: BUILDING_COMMANDS.ASSIGN_ROOM_TO_UNIT,
      floorId: ground.id,
      roomId: sourceRoom.id,
      instanceId: 'unit_g1',
      spaceType: 'living_sleeping',
    });
    project = run(project, {
      type: BUILDING_COMMANDS.CAPTURE_UNIT_TYPE_GEOMETRY,
      sourceInstanceId: 'unit_g1',
    });
    project = run(project, {
      type: BUILDING_COMMANDS.PROPAGATE_UNIT_TYPE_GEOMETRY,
      unitTypeId: 'typical_studio',
      targetInstanceIds: ['unit_g2', 'unit_u1', 'unit_u2'],
    });

    const type = project.building.unitTypes.find((entry) => entry.id === 'typical_studio');
    expect(type.geometryTemplate).toMatchObject({ revision: 2, capturedFromInstanceId: 'unit_g1' });
    expect(project.floors[0].rooms).toHaveLength(2);
    expect(project.floors[1].rooms).toHaveLength(2);
    expect(project.floors[1].walls).toHaveLength(8);
    expect(project.building.unitInstances).toHaveLength(4);
    expect(project.building.unitInstances.every((instance) => instance.sourceRevision === type.revision)).toBe(true);
    const ruleIds = validateBuildingCoordination(project).map((issue) => issue.ruleId);
    expect(ruleIds).not.toContain('PROGRAM.UNIT_INSTANCE_OUTDATED');
    expect(ruleIds).not.toContain('PROGRAM.UNIT_GEOMETRY_INCOMPLETE');
    expect(ruleIds).not.toContain('PROGRAM.LINKED_UNIT_DIVERGED');
  });
});
