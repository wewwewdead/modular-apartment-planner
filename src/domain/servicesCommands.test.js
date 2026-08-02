import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { createFloor, createProject, createRoom, createSlab, createStair } from './models';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

function makeProject() {
  const project = createProject('Delta commands');
  const ground = project.floors[0];
  const upper = createFloor('Second Floor', 1, { elevation: 3000, floorToFloorHeight: 3000 });
  project.floors.push(upper);
  project.building.levelIds.push(upper.id);
  ground.rooms = [{ ...createRoom('Studio', rectangle(0, 0, 3000, 3000)), id: 'room_1' }];
  ground.stairs = [
    {
      ...createStair(
        { x: 0, y: 1500 },
        1000,
        15,
        200,
        300,
        { angle: 0 },
        { fromFloorId: ground.id, toFloorId: upper.id },
      ),
      id: 'stair_1',
    },
  ];
  upper.slabs = [{ ...createSlab(upper.id, rectangle(0, 0, 6000, 4000), 150, upper.elevation), id: 'slab_1' }];
  return { project, ground, upper };
}

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result;
}

describe('Delta service and egress commands', () => {
  it('creates vertical service routes and idempotent linked slab openings', () => {
    const { project, ground, upper } = makeProject();
    let result = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
      shaftId: 'shaft_1',
      name: 'Wet shaft',
      origin: { x: 1000, y: 1000 },
      width: 600,
      depth: 800,
      maxFixtureDistance: 3000,
      servedFloorIds: [ground.id, upper.id],
    });
    result = run(result.project, {
      type: BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_RISER,
      riserId: 'riser_1',
      name: 'Electrical riser',
      origin: { x: 2500, y: 1000 },
      width: 400,
      depth: 400,
      openingClearance: 100,
      servedFloorIds: [ground.id, upper.id],
    });
    result = run(result.project, {
      type: BUILDING_COMMANDS.COORDINATE_VERTICAL_SERVICE_OPENINGS,
      serviceKind: 'plumbing',
      serviceId: 'shaft_1',
      clearance: 100,
    });
    result = run(result.project, {
      type: BUILDING_COMMANDS.COORDINATE_VERTICAL_SERVICE_OPENINGS,
      serviceKind: 'electrical',
      serviceId: 'riser_1',
      clearance: 100,
    });
    const repeated = run(result.project, {
      type: BUILDING_COMMANDS.COORDINATE_VERTICAL_SERVICE_OPENINGS,
      serviceKind: 'electrical',
      serviceId: 'riser_1',
      clearance: 100,
    });
    const openings = repeated.project.floors[1].slabs[0].openings;
    expect(openings).toHaveLength(2);
    expect(openings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serviceRef: { kind: 'plumbing', id: 'shaft_1' } }),
        expect.objectContaining({ serviceRef: { kind: 'electrical', id: 'riser_1' } }),
      ]),
    );
    expect(repeated.undo).toMatchObject({ kind: 'project_snapshot' });
  });

  it('creates traceable drainage and room-to-exit route relationships', () => {
    const { project, ground, upper } = makeProject();
    let result = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
      shaftId: 'shaft_1',
      origin: { x: 1000, y: 1000 },
      width: 600,
      depth: 800,
      maxFixtureDistance: 3000,
      servedFloorIds: [ground.id, upper.id],
    });
    result = run(result.project, {
      type: BUILDING_COMMANDS.CONFIGURE_DRAINAGE_ROUTE,
      routeId: 'drain_1',
      sourceShaftId: 'shaft_1',
      floorId: ground.id,
      points: [
        { x: 1000, y: 1000 },
        { x: 6000, y: 1000 },
      ],
      startInvertElevation: -300,
      endInvertElevation: -400,
      minimumSlopePercent: 1,
    });
    result = run(result.project, {
      type: BUILDING_COMMANDS.CONFIGURE_EGRESS_EXIT,
      exitId: 'exit_1',
      floorId: ground.id,
      point: { x: 4000, y: 1500 },
      name: 'Front exit',
    });
    result = run(result.project, {
      type: BUILDING_COMMANDS.CONFIGURE_EGRESS_ROUTE,
      routeId: 'route_1',
      floorId: ground.id,
      fromRoomId: 'room_1',
      exitId: 'exit_1',
      waypoints: [],
      maximumTravelDistance: 30_000,
    });
    expect(result.project.building.systems.plumbing.drainageRoutes).toHaveLength(1);
    expect(result.project.building.systems.egress.routes[0]).toMatchObject({
      fromRoomId: 'room_1',
      exitId: 'exit_1',
      points: [
        { x: 1500, y: 1500 },
        { x: 4000, y: 1500 },
      ],
    });
  });

  it('links stair headroom to a destination-level slab opening', () => {
    const { project, ground, upper } = makeProject();
    let result = run(project, {
      type: BUILDING_COMMANDS.ADD_SLAB_OPENING,
      floorId: upper.id,
      slabId: 'slab_1',
      openingId: 'stair_opening',
      purpose: 'stair',
      boundaryPoints: rectangle(1000, 900, 4000, 1200),
    });
    result = run(result.project, {
      type: BUILDING_COMMANDS.LINK_STAIR_CLEARANCE_OPENING,
      floorId: ground.id,
      stairId: 'stair_1',
      openingFloorId: upper.id,
      slabId: 'slab_1',
      openingId: 'stair_opening',
      minimumHeadroom: 2000,
    });
    expect(result.project.floors[0].stairs[0].coordination).toEqual({
      minimumHeadroom: 2000,
      clearanceOpeningRef: { floorId: upper.id, slabId: 'slab_1', openingId: 'stair_opening' },
    });
    expect(result.validation.issues.map((entry) => entry.ruleId)).not.toContain('STAIR.HEADROOM_NOT_VERIFIED');
  });
});
