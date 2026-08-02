import { describe, expect, it } from 'vitest';
import { deserializeProject } from '@/persistence/deserialize';
import { serializeProject } from '@/persistence/serialize';
import { buildFloorPreviewObjects } from '@/three/scene/objectBuilders';
import { deriveApartmentDesignCoordination } from './apartmentDesign';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { validateBuildingCoordination } from './buildingGraph';
import { buildBuildingReport, derivePreliminaryPackage } from './documentPackage';
import { createProject } from './models';
import { deriveProfessionalHandoff, deriveRevisionEntityRecords } from './professionalHandoff';
import { deriveQuantityTakeoff } from './quantityTakeoff';
import { deriveSpatialCoordination } from './spatialValidation';

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

describe('Apartment Planner Iota acceptance', () => {
  it('turns a two-storey four-unit test fit into one traceable architectural design basis', () => {
    let project = createProject('Iota two-storey four-unit apartment');
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
        targetRentalIncome: 48_000,
        currency: 'PHP',
        preferredStructuralSystem: 'reinforced_concrete_frame',
      },
    });
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM,
      unitType: {
        id: 'iota_studio',
        name: 'Typical Studio',
        category: 'studio',
        targetArea: { min: 20_000_000, preferred: 24_000_000, max: 30_000_000 },
        spaceRequirements: [
          { id: 'iota_living', name: 'Living / sleeping', spaceType: 'living_sleeping', minCount: 1, maxCount: 1 },
          { id: 'iota_kitchen', name: 'Kitchen', spaceType: 'kitchen', minCount: 1, maxCount: 1 },
          { id: 'iota_bathroom', name: 'Bathroom', spaceType: 'bathroom', minCount: 1, maxCount: 1 },
        ],
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

    const design = deriveApartmentDesignCoordination(project);
    expect(design).toMatchObject({
      detailedUnitCount: 4,
      adjacencyCompleteUnitCount: 4,
      egressCompleteUnitCount: 4,
      actualStairCount: 1,
      professionalReviewRequired: true,
    });
    expect(project.floors.flatMap((floor) => floor.rooms).filter((room) => room.unitInstanceId)).toHaveLength(12);
    expect(project.floors.flatMap((floor) => floor.rooms).filter((room) => room.spaceType === 'unit_block')).toEqual(
      [],
    );
    expect(project.floors.flatMap((floor) => floor.windows)).toHaveLength(4);
    expect(project.floors.flatMap((floor) => floor.fixtures)).toHaveLength(16);
    expect(project.floors[1].slabs[0].openings.map((opening) => opening.purpose)).toEqual(
      expect.arrayContaining(['stair', 'plumbing_riser']),
    );

    const spatial = deriveSpatialCoordination(project);
    expect(spatial).toMatchObject({
      ventilationRequiredRoomCount: 12,
      naturallyVentilatedRoomCount: 4,
      crossVentilationCandidateCount: 4,
      crossVentilatedRoomCount: 0,
    });
    const relevantErrors = validateBuildingCoordination(project).filter(
      (issue) =>
        issue.severity === 'error' &&
        [
          'apartment_design_coordination',
          'egress_coordination',
          'vertical_coordination',
          'spatial_coordination',
        ].includes(issue.category),
    );
    expect(relevantErrors).toEqual([]);

    const takeoff = deriveQuantityTakeoff(project);
    expect(takeoff.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'doors',
          quantity: project.floors.flatMap((floor) => floor.doors).length,
          provenance: 'exact_from_geometry',
        }),
        expect.objectContaining({ id: 'windows', quantity: 4, provenance: 'exact_from_geometry' }),
        expect.objectContaining({ id: 'plumbing_fixtures', quantity: 12, provenance: 'exact_from_geometry' }),
      ]),
    );
    const previewKinds = project.floors.flatMap(buildFloorPreviewObjects).map((entry) => entry.kind);
    expect(previewKinds).toEqual(expect.arrayContaining(['wall', 'slab', 'door', 'window', 'fixture', 'stair']));

    const manifest = derivePreliminaryPackage(project);
    expect(manifest.hasApartmentDesign).toBe(true);
    expect(manifest.deliverables).toContainEqual(
      expect.objectContaining({ id: 'apartment_design_quality', ready: true }),
    );
    expect(manifest.sheets.find((sheet) => sheet.number === 'Q-001').viewports).toContainEqual(
      expect.objectContaining({ sourceRefId: 'apartment_design_quality' }),
    );
    const report = buildBuildingReport(project, 'apartment_design_quality');
    expect(report.rows).toHaveLength(4);
    expect(report.rows.flat().join(' ')).toContain('cross-flow');
    expect(report.notes.join(' ')).toContain(
      'not accessibility, fire-code, architectural, engineering, or permit approval',
    );

    expect(deriveRevisionEntityRecords(project).map((record) => record.kind)).toEqual(
      expect.arrayContaining(['apartmentDesignProfile', 'apartmentDesignState', 'egressExit', 'egressRoute']),
    );
    expect(deriveProfessionalHandoff(project)).toMatchObject({
      apartmentDesignState: expect.objectContaining({ status: 'detailed' }),
      professionalReviewRequired: true,
    });

    const restored = deserializeProject(serializeProject(project)).project;
    expect(restored.building.apartmentDesign).toEqual(project.building.apartmentDesign);
    expect(deriveApartmentDesignCoordination(restored)).toMatchObject({
      detailedUnitCount: 4,
      adjacencyCompleteUnitCount: 4,
      egressCompleteUnitCount: 4,
    });
  });
});
