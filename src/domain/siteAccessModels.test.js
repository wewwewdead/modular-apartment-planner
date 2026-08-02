import { describe, expect, it } from 'vitest';
import { createProject, createSlab } from './models';
import {
  createParkingBay,
  createParkingPlan,
  createVehicleAccessRoute,
  deriveParkingCoordination,
  validateParkingCoordination,
} from './siteAccessModels';

const rectangle = (width, depth) => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: depth },
  { x: 0, y: depth },
];

describe('site access and parking coordination', () => {
  it('accepts road-connected, non-overlapping bays that meet the configured program', () => {
    const project = createProject('Parking');
    project.building.site.boundary = rectangle(12_000, 20_000);
    project.building.site.roadEdges = [{ edgeIndex: 0, roadName: 'Road' }];
    project.building.brief.parkingRequirement = 2;
    const bays = [
      createParkingBay({ id: 'bay_1', origin: { x: 3000, y: 5000 }, width: 2500, length: 5000 }),
      createParkingBay({ id: 'bay_2', origin: { x: 5500, y: 5000 }, width: 2500, length: 5000 }),
    ];
    project.building.site.parkingPlan = createParkingPlan({
      bays,
      accessRoutes: [
        createVehicleAccessRoute({
          id: 'access_1',
          roadEdgeIndex: 0,
          points: [
            { x: 4250, y: 0 },
            { x: 4250, y: 7500 },
          ],
          clearWidth: 3000,
          servedBayIds: bays.map((entry) => entry.id),
        }),
      ],
    });
    expect(deriveParkingCoordination(project)).toMatchObject({
      targetCount: 2,
      modeledBayCount: 2,
      explicitlyServedBayCount: 2,
    });
    expect(validateParkingCoordination(project)).toEqual([]);
  });

  it('reports insufficient count, undersized/overlapping bays, building collision, and disconnected access', () => {
    const project = createProject('Broken parking');
    project.building.site.boundary = rectangle(8000, 10_000);
    project.building.site.roadEdges = [{ edgeIndex: 0, roadName: 'Road' }];
    project.building.brief.parkingRequirement = 2;
    project.floors[0].slabs = [createSlab(project.floors[0].id, rectangle(4000, 4000))];
    const bay = createParkingBay({ id: 'bay_1', origin: { x: 2000, y: 2000 }, width: 2000, length: 4000 });
    project.building.site.parkingPlan = createParkingPlan({
      bays: [bay, { ...bay, id: 'bay_2' }],
      accessRoutes: [
        createVehicleAccessRoute({
          id: 'access_1',
          roadEdgeIndex: 0,
          points: [
            { x: 7000, y: 5000 },
            { x: 7000, y: 7000 },
          ],
          clearWidth: 2000,
          servedBayIds: ['bay_missing'],
        }),
      ],
    });
    const rules = validateParkingCoordination(project).map((entry) => entry.ruleId);
    expect(rules).toEqual(
      expect.arrayContaining([
        'PARKING.BAY_BELOW_ASSUMPTION',
        'PARKING.BAYS_OVERLAP',
        'PARKING.BAY_BUILDING_COLLISION',
        'PARKING.ACCESS_NOT_CONNECTED_TO_ROAD',
        'PARKING.ACCESS_BAY_REFERENCE_BROKEN',
      ]),
    );
  });
});
