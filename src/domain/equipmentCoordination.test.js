import { describe, expect, it } from 'vitest';
import { createProject, createSlab } from './models';
import {
  createElectricalPoint,
  createEquipmentZone,
  deriveEquipmentCoordination,
  validateEquipmentCoordination,
} from './equipmentCoordination';

const rectangle = (width, depth) => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: depth },
  { x: 0, y: depth },
];

describe('remaining equipment coordination', () => {
  it('coordinates panel, electrical point, water, and AC zones against modeled hosts', () => {
    const project = createProject('Equipment');
    const floor = project.floors[0];
    floor.slabs = [createSlab(floor.id, rectangle(10_000, 8000))];
    project.building.site.boundary = rectangle(15_000, 20_000);
    project.roofSystem = {
      id: 'roof_1',
      roofType: 'flat',
      boundaryPolygon: rectangle(10_000, 8000),
      finishSlope: 1,
      drains: [],
      roofPlanes: [],
    };
    const panel = createEquipmentZone({
      id: 'panel_1',
      name: 'Panel',
      kind: 'electrical_panel',
      location: 'floor',
      floorId: floor.id,
      origin: { x: 1000, y: 1000 },
      width: 600,
      depth: 300,
      clearance: 600,
      servedFloorIds: [floor.id],
    });
    project.building.systems.electrical.panelZones = [panel];
    project.building.systems.electrical.points = [
      createElectricalPoint({
        id: 'outlet_1',
        floorId: floor.id,
        position: { x: 3000, y: 1000 },
        panelZoneId: panel.id,
      }),
    ];
    project.building.systems.water.equipmentZones = [
      createEquipmentZone({
        id: 'tank_1',
        kind: 'water_tank',
        location: 'roof',
        origin: { x: 7000, y: 4000 },
        width: 1500,
        depth: 1500,
        clearance: 600,
      }),
    ];
    project.building.systems.mechanical.outdoorUnitZones = [
      createEquipmentZone({
        id: 'ac_1',
        kind: 'ac_outdoor_zone',
        location: 'ground',
        origin: { x: 12_000, y: 5000 },
        width: 1500,
        depth: 1000,
        clearance: 600,
      }),
    ];
    expect(deriveEquipmentCoordination(project)).toMatchObject({
      panelCount: 1,
      waterTankCount: 1,
      acOutdoorZoneCount: 1,
      electricalPointCount: 1,
    });
    expect(validateEquipmentCoordination(project)).toEqual([]);
  });

  it('reports invalid hosts, clearances, panel references, and planning distance', () => {
    const project = createProject('Bad equipment');
    const floor = project.floors[0];
    floor.slabs = [createSlab(floor.id, rectangle(3000, 3000))];
    const panel = createEquipmentZone({
      id: 'panel_1',
      kind: 'electrical_panel',
      location: 'floor',
      floorId: floor.id,
      origin: { x: 5000, y: 5000 },
      width: 600,
      depth: 300,
      clearance: 100,
    });
    project.building.systems.electrical.panelZones = [panel];
    project.building.systems.electrical.points = [
      createElectricalPoint({
        id: 'point_far',
        floorId: floor.id,
        position: { x: 30_000, y: 0 },
        panelZoneId: panel.id,
      }),
      createElectricalPoint({
        id: 'point_broken',
        floorId: floor.id,
        position: { x: 0, y: 0 },
        panelZoneId: 'missing',
      }),
    ];
    const rules = validateEquipmentCoordination(project).map((entry) => entry.ruleId);
    expect(rules).toEqual(
      expect.arrayContaining([
        'EQUIPMENT.ZONE_OUTSIDE_HOST',
        'EQUIPMENT.CLEARANCE_BELOW_ASSUMPTION',
        'EQUIPMENT.ELECTRICAL_POINT_DISTANCE_EXCEEDED',
        'EQUIPMENT.ELECTRICAL_POINT_PANEL_BROKEN',
      ]),
    );
  });
});
