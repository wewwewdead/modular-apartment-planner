import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { validateBuildingCoordination } from './buildingGraph';
import { buildBuildingReport, derivePreliminaryPackage } from './documentPackage';
import { deriveEquipmentCoordination } from './equipmentCoordination';
import { createProject, createSlab } from './models';
import { deriveQuantityTakeoff, QUANTITY_PROVENANCE } from './quantityTakeoff';
import { deriveRoofDrainageCoordination } from './roofDrainageCoordination';
import { deriveParkingCoordination } from './siteAccessModels';

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

describe('Apartment Planner Eta acceptance', () => {
  it('coordinates road access, parking, equipment, roof drainage, quantities, checks, and professional outputs from one model', () => {
    let project = createProject('Eta owner-builder apartment basis');
    const floor = project.floors[0];
    floor.slabs = [{ ...createSlab(floor.id, rectangle(6000, 5000), 150, 0), id: 'eta_ground_slab' }];
    project = execute(project, {
      type: BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF,
      updates: {
        targetStoreys: 2,
        targetUnitCount: 4,
        targetBudget: 6_000_000,
        parkingRequirement: 1,
        currency: 'PHP',
      },
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
      width: 12_000,
      depth: 20_000,
      northAngle: 0,
      frontEdgeIndex: 0,
      roadName: 'Barangay Road',
      setbacks: { front: 0, rear: 0, left: 0, right: 0 },
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_REGULAR_PARKING_PLAN,
      planId: 'eta_parking',
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
      zoneId: 'eta_panel',
      name: 'Main panel',
      kind: 'electrical_panel',
      location: 'floor',
      floorId: floor.id,
      origin: { x: 1000, y: 1000 },
      width: 600,
      depth: 600,
      clearance: 600,
      servedFloorIds: [floor.id],
    });
    for (const [index, kind] of ['outlet', 'light', 'switch'].entries()) {
      project = execute(project, {
        type: BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_POINT,
        pointId: `eta_point_${index + 1}`,
        name: `Electrical point ${index + 1}`,
        kind,
        floorId: floor.id,
        position: { x: 1800 + index * 500, y: 1000 },
        panelZoneId: 'eta_panel',
      });
    }
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_ZONE,
      zoneId: 'eta_tank',
      name: 'Ground water tank',
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
      id: 'eta_roof',
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
      zoneId: 'eta_ac',
      name: 'Four-unit AC reservation',
      kind: 'ac_outdoor_zone',
      location: 'roof',
      origin: { x: 3000, y: 3500 },
      width: 1800,
      depth: 600,
      clearance: 600,
      unitCount: 4,
      servedFloorIds: [floor.id],
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
      shaftId: 'eta_shaft',
      name: 'Roof-water shaft',
      origin: { x: 500, y: 2500 },
      width: 600,
      depth: 600,
      maxFixtureDistance: 3000,
      servedFloorIds: [floor.id],
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_ROOF_DRAINAGE_PATH,
      drainId: 'eta_drain',
      name: 'Primary roof drain',
      position: { x: 3000, y: 2500 },
      diameter: 100,
      catchmentPlaneIds: [],
      outletRef: { kind: 'plumbing_shaft', id: 'eta_shaft' },
      routePoints: [
        { x: 3000, y: 2500 },
        { x: 500, y: 2500 },
      ],
      profile: { minimumFinishSlopePercent: 1 },
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE,
      reinforcementAllowanceKgPerM3: null,
      excavationDepth: 800,
      unitRates: { electricalPoint: 1200, excavation: 450 },
    });

    expect(deriveParkingCoordination(project)).toMatchObject({
      targetCount: 1,
      modeledBayCount: 1,
      explicitlyServedBayCount: 1,
    });
    expect(deriveEquipmentCoordination(project)).toMatchObject({
      panelCount: 1,
      waterTankCount: 1,
      acOutdoorZoneCount: 1,
      electricalPointCount: 3,
    });
    expect(deriveRoofDrainageCoordination(project)).toMatchObject({ drainCount: 1, routedDrainCount: 1 });
    expect(
      validateBuildingCoordination(project).filter((entry) =>
        ['site_access_parking', 'equipment_coordination', 'roof_drainage_coordination'].includes(entry.category),
      ),
    ).toEqual([]);

    const takeoff = deriveQuantityTakeoff(project);
    expect(takeoff.items.find((entry) => entry.id === 'electrical_points')).toMatchObject({
      quantity: 3,
      provenance: QUANTITY_PROVENANCE.EXACT_GEOMETRY,
    });
    expect(takeoff.items.find((entry) => entry.id === 'excavation')).toMatchObject({
      quantity: 24,
      provenance: QUANTITY_PROVENANCE.ALLOWANCE,
    });

    const siteAccessReport = buildBuildingReport(project, 'site_access_schedule');
    const servicesReport = buildBuildingReport(project, 'services_schedule');
    expect(siteAccessReport.rows.map((row) => row[0])).toEqual(
      expect.arrayContaining(['Parking bay', 'Vehicle access']),
    );
    expect(siteAccessReport.notes.join(' ')).toContain('No swept-path analysis');
    expect(servicesReport.rows.map((row) => row[0])).toEqual(
      expect.arrayContaining([
        'Electrical panel zone',
        'Electrical point',
        'Water tank zone',
        'AC outdoor-unit zone',
        'Roof drain path',
      ]),
    );
    expect(servicesReport.notes.join(' ')).toContain('No hydraulic sizing');

    const manifest = derivePreliminaryPackage(project, 'eta');
    expect(manifest).toMatchObject({
      hasParking: true,
      hasEquipment: true,
      hasRoofDrainage: true,
      professionalReviewRequired: true,
    });
    expect(manifest.deliverables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'site_access', ready: true }),
        expect.objectContaining({ id: 'roof_drainage', ready: true }),
        expect.objectContaining({ id: 'services_layout', ready: true }),
      ]),
    );
    expect(manifest.sheets.map((sheet) => sheet.number)).toEqual(
      expect.arrayContaining(['A-001', 'A-202', 'M-101', 'Q-001']),
    );
    expect(manifest.sheets.every((sheet) => sheet.notes.some((note) => note.includes('PROFESSIONAL REVIEW')))).toBe(
      true,
    );
  });
});
