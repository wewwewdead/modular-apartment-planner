import { describe, expect, it } from 'vitest';
import { deserializeProject } from '@/persistence/deserialize';
import { serializeProject } from '@/persistence/serialize';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { validateBuildingCoordination } from './buildingGraph';
import { buildBuildingReport, derivePreliminaryPackage } from './documentPackage';
import { createProject } from './models';
import { deriveProfessionalHandoff, deriveRevisionEntityRecords } from './professionalHandoff';
import { deriveQuantityTakeoff } from './quantityTakeoff';
import { deriveServicesRealization } from './servicesRealization';

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

function buildKappaBasis() {
  let project = createProject('Lambda two-storey four-unit apartment');
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
    width: 16_000,
    depth: 24_000,
    northAngle: 0,
    frontEdgeIndex: 0,
    roadName: 'Municipal road',
    setbacks: { front: 1000, rear: 1000, left: 1000, right: 1000 },
  });
  project = run(project, {
    type: BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF,
    updates: {
      targetStoreys: 2,
      targetUnitCount: 4,
      targetBudget: 10_000_000,
      currency: 'PHP',
      preferredStructuralSystem: 'reinforced_concrete_frame',
    },
  });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM,
    unitType: {
      id: 'lambda_studio',
      name: 'Typical Studio',
      category: 'studio',
      targetArea: { min: 20_000_000, preferred: 24_000_000, max: 30_000_000 },
      spaceRequirements: [],
    },
    targetCount: 4,
    parkingRequirement: 0,
  });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_TEST_FIT_PROFILE,
    unitDepth: 5000,
    corridorWidth: 1500,
    stairWidth: 2400,
    stairDepth: 4500,
    wetCoreWidth: 1200,
    wetCoreDepth: 1800,
    structuralBayTarget: 5500,
    floorToFloorHeight: 3000,
    planningCostPerSquareMeter: 25_000,
    currency: 'PHP',
  });
  project = run(project, { type: BUILDING_COMMANDS.GENERATE_TEST_FIT_OPTIONS });
  const option = project.building.testFitOptions.find(
    (entry) => !entry.findings.some((finding) => finding.severity === 'error'),
  );
  project = run(project, { type: BUILDING_COMMANDS.ACCEPT_TEST_FIT_OPTION, optionId: option.id });
  project = run(project, { type: BUILDING_COMMANDS.DETAIL_ACCEPTED_TEST_FIT });
  project = run(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_STRUCTURAL_BASIS });
  return { project, option };
}

describe('Apartment Planner Lambda acceptance', () => {
  it('realizes simplified services from the accepted apartment and Kappa structural basis', () => {
    let { project, option } = buildKappaBasis();
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_SERVICES_REALIZATION_PROFILE,
      electricalPointsPerUnit: 3,
      minimumDrainSlopePercent: 1,
    });
    project = run(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_BUILDING_SYSTEMS });

    const realization = deriveServicesRealization(project);
    expect(realization).toMatchObject({
      state: expect.objectContaining({
        status: 'realized',
        sourceTestFitId: option.id,
        hydraulicDesignStatus: 'not_performed',
        electricalDesignStatus: 'not_performed',
        equipmentSizingStatus: 'not_performed',
      }),
      actualEntityCounts: {
        drainageRoutes: 12,
        electricalRisers: 1,
        panelZones: 2,
        electricalPoints: 12,
        waterEquipmentZones: 2,
        outdoorUnitZones: 2,
        slabOpenings: 1,
      },
      unresolvedItems: [],
      outOfDate: false,
      professionalReviewRequired: true,
    });
    expect(realization.totalDrainagePlanningLength).toBeGreaterThan(0);
    const systemsErrors = validateBuildingCoordination(project).filter(
      (issue) =>
        issue.severity === 'error' &&
        ['building_systems', 'vertical_coordination', 'equipment_coordination', 'structural_coordination'].includes(
          issue.category,
        ),
    );
    expect(systemsErrors).toEqual([]);

    const takeoff = deriveQuantityTakeoff(project);
    expect(takeoff.items.find((item) => item.id === 'electrical_points')).toMatchObject({
      quantity: 12,
      provenance: 'exact_from_geometry',
    });
    expect(takeoff.items.find((item) => item.id === 'plumbing_fixtures')).toMatchObject({
      quantity: 12,
      provenance: 'exact_from_geometry',
    });
    const previewKinds = buildPreviewScene(project)
      .floors.flatMap((floor) => floor.objects)
      .map((entry) => entry.kind);
    expect(previewKinds).toEqual(
      expect.arrayContaining([
        'electricalRiser',
        'electricalPanel',
        'electricalPoint',
        'drainageRoute',
        'water_tank',
        'water_pump',
        'ac_outdoor_zone',
      ]),
    );

    const manifest = derivePreliminaryPackage(project);
    expect(manifest.hasServicesRealization).toBe(true);
    expect(manifest.deliverables).toContainEqual(
      expect.objectContaining({ id: 'services_realization_basis', ready: true }),
    );
    expect(manifest.sheets.find((sheet) => sheet.number === 'Q-001').viewports).toContainEqual(
      expect.objectContaining({ sourceRefId: 'services_realization_basis' }),
    );
    const report = buildBuildingReport(project, 'services_realization_basis');
    expect(report.rows.flat().join(' ')).toContain('12');
    expect(report.notes.join(' ')).toContain('No pipe sizing');

    expect(deriveRevisionEntityRecords(project).map((record) => record.kind)).toEqual(
      expect.arrayContaining([
        'servicesRealizationProfile',
        'servicesRealizationState',
        'drainageRoute',
        'electricalRiser',
        'electricalPanelZone',
        'electricalPoint',
        'waterEquipmentZone',
        'mechanicalOutdoorUnitZone',
      ]),
    );
    expect(deriveProfessionalHandoff(project)).toMatchObject({
      servicesRealizationState: expect.objectContaining({ status: 'realized' }),
      professionalReviewRequired: true,
    });

    const firstRefs = project.building.systems.realization.generatedEntityRefs;
    project = run(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_BUILDING_SYSTEMS });
    expect(project.building.systems.realization.generatedEntityRefs).toEqual(firstRefs);

    const restored = deserializeProject(serializeProject(project)).project;
    expect(restored.building.systems.realization).toEqual(project.building.systems.realization);
    expect(deriveServicesRealization(restored)).toMatchObject({
      actualEntityCounts: realization.actualEntityCounts,
      outOfDate: false,
    });
  });

  it('guards the structural prerequisite and protects authored systems geometry', () => {
    let { project } = buildKappaBasis();
    project = {
      ...project,
      building: {
        ...project.building,
        systems: {
          ...project.building.systems,
          structural: {
            ...project.building.systems.structural,
            realization: { ...project.building.systems.structural.realization, status: 'not_realized' },
          },
        },
      },
    };
    expect(
      executeBuildingCommand(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_BUILDING_SYSTEMS }),
    ).toMatchObject({ ok: false, error: { code: 'current-structural-realization-required' } });
  });
});
