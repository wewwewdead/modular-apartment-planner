import { describe, expect, it } from 'vitest';
import { createColumn, createDoor, createProject, createRoom, createWall, createWindow } from './models';
import { ROOM_USE_CATEGORIES } from './apartmentProgram';
import { deriveSpatialCoordination, validateSpatialCoordination } from './spatialValidation';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

describe('spatial and environmental coordination', () => {
  it('detects column collisions, overlapping openings, and openings outside their host wall', () => {
    const project = createProject();
    const floor = project.floors[0];
    const wall = { ...createWall({ x: 0, y: 0 }, { x: 5000, y: 0 }), id: 'wall_1' };
    floor.walls = [wall];
    floor.columns = [{ ...createColumn(2500, 0, 300, 300), id: 'column_1' }];
    floor.windows = [
      { ...createWindow(wall.id, 2500, 1200), id: 'window_collision' },
      { ...createWindow(wall.id, 4900, 400), id: 'window_outside' },
    ];
    floor.doors = [{ ...createDoor(wall.id, 2700, 900), id: 'door_overlap' }];

    const issues = validateSpatialCoordination(project);
    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'SPATIAL.OPENING_COLUMN_COLLISION',
        severity: 'error',
        entityRefs: expect.arrayContaining([{ type: 'column', id: 'column_1' }]),
      }),
    );
    expect(issues).toContainEqual(expect.objectContaining({ ruleId: 'SPATIAL.OPENINGS_OVERLAP' }));
    expect(issues).toContainEqual(expect.objectContaining({ ruleId: 'SPATIAL.OPENING_OUTSIDE_HOST_WALL' }));
  });

  it('checks circulation width against a named assumption and flags a bathroom without an exterior window', () => {
    const project = createProject();
    const floor = project.floors[0];
    floor.rooms = [
      {
        ...createRoom('Narrow corridor', rectangle(0, 0, 5000, 800)),
        id: 'corridor_1',
        useCategory: ROOM_USE_CATEGORIES.CIRCULATION,
        spaceType: 'corridor',
      },
      {
        ...createRoom('Bathroom', rectangle(6000, 0, 1800, 2200)),
        id: 'bathroom_1',
        useCategory: ROOM_USE_CATEGORIES.RENTABLE,
        spaceType: 'bathroom',
      },
    ];

    const issues = validateSpatialCoordination(project);
    const corridor = issues.find((entry) => entry.ruleId === 'SPATIAL.CORRIDOR_WIDTH_BELOW_ASSUMPTION');
    expect(corridor).toMatchObject({
      category: 'spatial_coordination',
      evidence: {
        resultKind: 'configured_rule_check',
        inputs: { measuredWidth: 800, configuredMinimum: 900 },
      },
      professionalReviewRequired: true,
    });
    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'ENV.BATHROOM_VENTILATION_ROUTE_MISSING',
        category: 'environmental_coordination',
      }),
    );
  });

  it('derives natural and cross-ventilation potential from exterior-window directions', () => {
    const project = createProject();
    const floor = project.floors[0];
    const room = {
      ...createRoom('Living / sleeping', rectangle(0, 0, 4000, 3000)),
      id: 'room_1',
      useCategory: ROOM_USE_CATEGORIES.RENTABLE,
      spaceType: 'living_sleeping',
    };
    const rightWall = { ...createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }), id: 'wall_right' };
    const topWall = { ...createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }), id: 'wall_top' };
    floor.rooms = [room];
    floor.walls = [rightWall, topWall];
    floor.windows = [
      { ...createWindow(rightWall.id, 1500, 1000), id: 'window_right' },
      { ...createWindow(topWall.id, 2000, 1000), id: 'window_top' },
    ];

    const derived = deriveSpatialCoordination(project);
    expect(derived).toMatchObject({
      ventilationRequiredRoomCount: 1,
      naturallyVentilatedRoomCount: 1,
      crossVentilationCandidateCount: 1,
      crossVentilatedRoomCount: 1,
    });
    expect(derived.rooms[0]).toMatchObject({
      exteriorWindowCount: 2,
      ventilationDirectionCount: 2,
      naturalVentilationPotential: true,
      crossVentilationPotential: true,
    });
    expect(validateSpatialCoordination(project)).toEqual([]);
  });
});
