import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { derivePreliminaryPackage, buildBuildingReport } from './documentPackage';
import { createFloor, createProject, createRoom, createSlab, createStair } from './models';
import { deriveServicesCoordination } from './servicesCoordination';
import { deriveStairClearanceEnvelope } from './stairValidation';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { deriveQuantityTakeoff } from './quantityTakeoff';
import { resolveSheetViewportSource } from '@/sheets/sources';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

function execute(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

describe('Apartment Planner Delta acceptance', () => {
  it('coordinates two-level services, drainage, egress, headroom, 3D voids, validation, and sheets', () => {
    let project = createProject('Two-storey four-unit Delta basis');
    const ground = project.floors[0];
    const upper = createFloor('Second Floor', 1, { elevation: 3000, floorToFloorHeight: 3000 });
    project.floors.push(upper);
    project.building.levelIds.push(upper.id);
    ground.rooms = [{ ...createRoom('Ground studio', rectangle(0, 0, 3000, 3000)), id: 'room_ground' }];
    upper.rooms = [{ ...createRoom('Upper studio', rectangle(0, 0, 3000, 3000)), id: 'room_upper' }];
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
        id: 'stair_main',
      },
    ];
    upper.slabs = [{ ...createSlab(upper.id, rectangle(0, 0, 8000, 5000), 150, upper.elevation), id: 'slab_upper' }];

    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
      shaftId: 'shaft_primary',
      name: 'Primary wet shaft',
      origin: { x: 1000, y: 1000 },
      width: 600,
      depth: 800,
      maxFixtureDistance: 3000,
      servedFloorIds: [ground.id, upper.id],
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_RISER,
      riserId: 'riser_primary',
      name: 'Primary electrical riser',
      origin: { x: 2500, y: 1000 },
      width: 400,
      depth: 400,
      openingClearance: 100,
      servedFloorIds: [ground.id, upper.id],
    });
    for (const [serviceKind, serviceId] of [
      ['plumbing', 'shaft_primary'],
      ['electrical', 'riser_primary'],
    ]) {
      project = execute(project, {
        type: BUILDING_COMMANDS.COORDINATE_VERTICAL_SERVICE_OPENINGS,
        serviceKind,
        serviceId,
      });
    }
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_DRAINAGE_ROUTE,
      routeId: 'drain_primary',
      sourceShaftId: 'shaft_primary',
      floorId: ground.id,
      points: [
        { x: 1000, y: 1000 },
        { x: 7000, y: 1000 },
      ],
      startInvertElevation: -300,
      endInvertElevation: -420,
      minimumSlopePercent: 1,
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_EGRESS_EXIT,
      exitId: 'exit_ground',
      floorId: ground.id,
      point: { x: 3500, y: 1500 },
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_EGRESS_ROUTE,
      routeId: 'route_ground',
      floorId: ground.id,
      fromRoomId: 'room_ground',
      exitId: 'exit_ground',
      waypoints: [],
      maximumTravelDistance: 30_000,
    });

    const stair = project.floors[0].stairs[0];
    const targetSlab = project.floors[1].slabs[0];
    const envelope = deriveStairClearanceEnvelope(stair, project.floors[0], targetSlab, 2000);
    project = execute(project, {
      type: BUILDING_COMMANDS.ADD_SLAB_OPENING,
      floorId: upper.id,
      slabId: targetSlab.id,
      openingId: 'opening_stair',
      purpose: 'stair',
      boundaryPoints: envelope,
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.LINK_STAIR_CLEARANCE_OPENING,
      floorId: ground.id,
      stairId: stair.id,
      openingFloorId: upper.id,
      slabId: targetSlab.id,
      openingId: 'opening_stair',
      minimumHeadroom: 2000,
    });

    const relevantRuleIds = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_SERVICES_COORDINATION,
      minimumDrainSlopePercent: 1,
      maximumEgressTravelDistance: 30_000,
      routeEndpointTolerance: 150,
      doorPassageTolerance: 75,
      minimumVerticalOpeningOverlap: 10_000,
    }).validation.issues.map((entry) => entry.ruleId);
    expect(relevantRuleIds).not.toEqual(
      expect.arrayContaining([
        'SERVICE.VERTICAL_OPENING_MISSING',
        'SERVICE.DRAINAGE_SLOPE_BELOW_ASSUMPTION',
        'EGRESS.ROUTE_REFERENCE_BROKEN',
        'STAIR.HEADROOM_NOT_VERIFIED',
        'STAIR.CLEARANCE_OPENING_INCOMPLETE',
      ]),
    );

    const services = deriveServicesCoordination(project);
    expect(services).toMatchObject({
      plumbingShaftCount: 1,
      electricalRiserCount: 1,
      drainageRouteCount: 1,
      egressExitCount: 1,
      egressRouteCount: 1,
      routedRoomCount: 1,
    });
    const upperScene = buildPreviewScene(project).floors.find((floor) => floor.floorId === upper.id);
    expect(upperScene.objects.find((entry) => entry.id === targetSlab.id).holes).toHaveLength(3);
    const concrete = deriveQuantityTakeoff(project).items.find((item) => item.id === 'concrete');
    expect(concrete.inputs.slabOpeningsDeductedM2).toBeGreaterThan(1.16);

    const manifest = derivePreliminaryPackage(project, 'delta');
    expect(manifest.deliverables).toContainEqual(expect.objectContaining({ id: 'services_layout', ready: true }));
    const servicesSheets = manifest.sheets.filter((sheet) => sheet.number.startsWith('M-'));
    expect(servicesSheets).toHaveLength(2);
    expect(servicesSheets.every((sheet) => sheet.viewports[0].sourceView === 'services_plan')).toBe(true);
    expect(resolveSheetViewportSource(project, servicesSheets[0].viewports[0])).toMatchObject({
      kind: 'services_plan',
      project,
    });
    const report = buildBuildingReport(project, 'services_schedule');
    expect(report.rows.map((row) => row[0])).toEqual(
      expect.arrayContaining(['Plumbing shaft', 'Electrical riser', 'Drainage route', 'Egress route']),
    );
    expect(report.notes.join(' ')).toContain('No hydraulic sizing');
  });
});
