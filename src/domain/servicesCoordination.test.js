import { describe, expect, it } from 'vitest';
import { createDoor, createFloor, createProject, createRoom, createSlab, createWall } from './models';
import {
  createDrainageRoute,
  createEgressExit,
  createEgressRoute,
  createElectricalRiserZone,
  drainageRouteMetrics,
  validateServicesCoordination,
} from './servicesCoordination';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

function twoLevelProject() {
  const project = createProject('Services coordination');
  const ground = project.floors[0];
  const upper = createFloor('Second Floor', 1, { elevation: 3000 });
  project.floors.push(upper);
  project.building.levelIds.push(upper.id);
  const shaft = {
    id: 'shaft_1',
    name: 'Wet shaft',
    origin: { x: 1000, y: 1000 },
    width: 600,
    depth: 800,
    servedFloorIds: [ground.id, upper.id],
    fixtureRefs: [],
  };
  const riser = createElectricalRiserZone({
    id: 'riser_1',
    origin: { x: 2500, y: 1000 },
    width: 400,
    depth: 400,
    servedFloorIds: [ground.id, upper.id],
  });
  project.building.systems.plumbing.shafts = [shaft];
  project.building.systems.electrical.riserZones = [riser];
  upper.slabs = [
    createSlab(upper.id, rectangle(0, 0, 5000, 4000), 150, upper.elevation, {
      openings: [
        {
          id: 'opening_p',
          serviceRef: { kind: 'plumbing', id: shaft.id },
          boundaryPoints: rectangle(700, 600, 600, 800),
        },
        {
          id: 'opening_e',
          serviceRef: { kind: 'electrical', id: riser.id },
          boundaryPoints: rectangle(2300, 800, 400, 400),
        },
      ],
    }),
  ];
  return { project, ground, upper, shaft, riser };
}

describe('Delta services coordination', () => {
  it('checks linked vertical openings and drainage fall from explicit geometry', () => {
    const { project, ground, shaft } = twoLevelProject();
    project.building.systems.plumbing.drainageRoutes = [
      createDrainageRoute({
        id: 'drain_1',
        sourceShaftId: shaft.id,
        floorId: ground.id,
        points: [
          { x: 1000, y: 1000 },
          { x: 6000, y: 1000 },
        ],
        startInvertElevation: -300,
        endInvertElevation: -400,
        minimumSlopePercent: 1,
      }),
    ];

    expect(drainageRouteMetrics(project.building.systems.plumbing.drainageRoutes[0])).toMatchObject({
      planLength: 5000,
      fall: 100,
      slopePercent: 2,
    });
    expect(validateServicesCoordination(project).map((entry) => entry.ruleId)).not.toContain(
      'SERVICE.VERTICAL_OPENING_MISSING',
    );
  });

  it('reports missing vertical openings and insufficient drainage slope', () => {
    const { project, ground, shaft, upper } = twoLevelProject();
    upper.slabs[0].openings = [];
    project.building.systems.plumbing.drainageRoutes = [
      createDrainageRoute({
        id: 'drain_1',
        sourceShaftId: shaft.id,
        floorId: ground.id,
        points: [
          { x: 1000, y: 1000 },
          { x: 6000, y: 1000 },
        ],
        startInvertElevation: -300,
        endInvertElevation: -320,
      }),
    ];
    const ruleIds = validateServicesCoordination(project).map((entry) => entry.ruleId);
    expect(ruleIds.filter((ruleId) => ruleId === 'SERVICE.VERTICAL_OPENING_MISSING')).toHaveLength(2);
    expect(ruleIds).toContain('SERVICE.DRAINAGE_SLOPE_BELOW_ASSUMPTION');
  });

  it('checks explicit room-to-exit paths against doors and travel assumptions', () => {
    const { project, ground } = twoLevelProject();
    const wall = { ...createWall({ x: 3000, y: 0 }, { x: 3000, y: 3000 }), id: 'wall_1' };
    ground.walls = [wall];
    ground.doors = [{ ...createDoor(wall.id, 1500, 900), id: 'door_1' }];
    ground.rooms = [{ ...createRoom('Unit', rectangle(0, 0, 3000, 3000)), id: 'room_1' }];
    const exit = createEgressExit({ id: 'exit_1', floorId: ground.id, point: { x: 4000, y: 1500 } });
    project.building.systems.egress = {
      exits: [exit],
      routes: [
        createEgressRoute({
          id: 'route_1',
          floorId: ground.id,
          fromRoomId: 'room_1',
          exitId: exit.id,
          points: [
            { x: 1500, y: 1500 },
            { x: 4000, y: 1500 },
          ],
          maximumTravelDistance: 3000,
        }),
      ],
    };
    expect(validateServicesCoordination(project).map((entry) => entry.ruleId)).not.toContain(
      'EGRESS.ROUTE_CROSSES_WALL_WITHOUT_DOOR',
    );

    ground.doors[0].offset = 500;
    expect(validateServicesCoordination(project)).toContainEqual(
      expect.objectContaining({
        ruleId: 'EGRESS.ROUTE_CROSSES_WALL_WITHOUT_DOOR',
        evidence: expect.objectContaining({ resultKind: 'verified_geometry' }),
        professionalReviewRequired: true,
      }),
    );
  });
});
