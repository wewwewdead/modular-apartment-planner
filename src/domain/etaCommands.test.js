import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { validateBuildingCoordination } from './buildingGraph';
import { createProject, createSlab } from './models';
import { deriveRevisionEntityRecords } from './professionalHandoff';

function rectangle(width, depth) {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

function execute(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

describe('Eta coordinated site and equipment commands', () => {
  it('creates stable parking, equipment, electrical, and roof-drainage relationships', () => {
    let project = createProject('Eta command basis');
    const floor = project.floors[0];
    floor.slabs = [{ ...createSlab(floor.id, rectangle(6000, 5000)), id: 'ground_slab' }];
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
      width: 12_000,
      depth: 20_000,
      northAngle: 0,
      frontEdgeIndex: 0,
      roadName: 'Road',
      setbacks: { front: 0, rear: 0, left: 0, right: 0 },
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_REGULAR_PARKING_PLAN,
      planId: 'parking_primary',
      bayCount: 1,
      bayWidth: 2500,
      bayLength: 5000,
      bayGap: 0,
      firstBayOrigin: { x: 9000, y: 2500 },
      angle: 0,
      location: 'open_site',
      roadEdgeIndex: 0,
      accessWidth: 3000,
      routePoints: [
        { x: 9000, y: 0 },
        { x: 9000, y: 2500 },
      ],
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_ZONE,
      zoneId: 'panel_ground',
      name: 'Ground panel',
      kind: 'electrical_panel',
      location: 'floor',
      floorId: floor.id,
      origin: { x: 1000, y: 1000 },
      width: 600,
      depth: 600,
      clearance: 600,
      servedFloorIds: [floor.id],
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_POINT,
      pointId: 'outlet_1',
      name: 'Outlet 1',
      kind: 'outlet',
      floorId: floor.id,
      position: { x: 2000, y: 1000 },
      panelZoneId: 'panel_ground',
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_ZONE,
      zoneId: 'tank_ground',
      name: 'Water tank',
      kind: 'water_tank',
      location: 'ground',
      origin: { x: 10_000, y: 10_000 },
      width: 1000,
      depth: 1000,
      clearance: 600,
      capacity: 2000,
      servedFloorIds: [floor.id],
    });
    project.roofSystem = {
      id: 'roof_eta',
      roofType: 'flat',
      boundaryPolygon: rectangle(6000, 5000),
      finishSlope: 1,
      roofPlanes: [],
      roofEdges: [],
      roofOpenings: [],
      drains: [],
    };
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_ZONE,
      zoneId: 'ac_roof',
      name: 'AC outdoor bank',
      kind: 'ac_outdoor_zone',
      location: 'roof',
      origin: { x: 3000, y: 3000 },
      width: 1200,
      depth: 600,
      clearance: 600,
      unitCount: 4,
      servedFloorIds: [floor.id],
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
      shaftId: 'shaft_eta',
      name: 'Wet shaft',
      origin: { x: 500, y: 2500 },
      width: 600,
      depth: 600,
      maxFixtureDistance: 3000,
      servedFloorIds: [floor.id],
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_ROOF_DRAINAGE_PATH,
      drainId: 'roof_drain_eta',
      name: 'Roof drain',
      position: { x: 3000, y: 2500 },
      diameter: 100,
      catchmentPlaneIds: [],
      outletRef: { kind: 'plumbing_shaft', id: 'shaft_eta' },
      routePoints: [
        { x: 3000, y: 2500 },
        { x: 500, y: 2500 },
      ],
      profile: { minimumFinishSlopePercent: 1 },
    });

    expect(project.building.site.parkingPlan.bays.map((entry) => entry.id)).toEqual(['parking_primary_bay_1']);
    expect(project.building.systems.electrical.points[0].panelZoneId).toBe('panel_ground');
    expect(project.building.systems.water.equipmentZones[0]).toMatchObject({ id: 'tank_ground', capacity: 2000 });
    expect(project.building.systems.mechanical.outdoorUnitZones[0]).toMatchObject({ id: 'ac_roof', unitCount: 4 });
    expect(project.roofSystem.drains[0]).toMatchObject({
      id: 'roof_drain_eta',
      outletRef: { kind: 'plumbing_shaft', id: 'shaft_eta' },
    });
    expect(
      validateBuildingCoordination(project).filter((issue) =>
        ['site_access_parking', 'equipment_coordination', 'roof_drainage_coordination'].includes(issue.category),
      ),
    ).toEqual([]);
    expect(deriveRevisionEntityRecords(project).map((entry) => entry.kind)).toEqual(
      expect.arrayContaining([
        'parkingBay',
        'vehicleAccessRoute',
        'electricalPanelZone',
        'electricalPoint',
        'waterEquipmentZone',
        'mechanicalOutdoorUnitZone',
      ]),
    );
  });

  it('rejects broken modeled destinations before mutating the project', () => {
    const project = createProject('Eta rejected commands');
    const electrical = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_POINT,
      pointId: 'point_bad',
      kind: 'outlet',
      floorId: project.floors[0].id,
      position: { x: 0, y: 0 },
      panelZoneId: 'panel_missing',
    });
    expect(electrical).toMatchObject({ ok: false, project });
    const roof = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_ROOF_DRAINAGE_PATH,
      drainId: 'drain_bad',
      position: { x: 0, y: 0 },
      diameter: 100,
      outletRef: { kind: 'plumbing_shaft', id: 'missing' },
      routePoints: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    expect(roof).toMatchObject({ ok: false, project });
  });
});
