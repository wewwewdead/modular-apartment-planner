import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { buildBuildingReport, derivePreliminaryPackage } from './documentPackage';
import { createProject } from './models';
import { deriveProfessionalHandoff, deriveRevisionEntityRecords } from './professionalHandoff';
import { deriveQuantityTakeoff } from './quantityTakeoff';
import { deriveTestFitCoordination } from './testFitModels';
import { validateBuildingCoordination } from './buildingGraph';

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

describe('Apartment Planner Theta acceptance', () => {
  it('turns a checked site, brief, program, and budget into a traceable coordinated test-fit basis', () => {
    let project = createProject('Theta two-storey four-unit apartment');
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
        id: 'theta_studio',
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

    const emptyFloorBeforeGeneration = project.floors[0];
    project = run(project, { type: BUILDING_COMMANDS.GENERATE_TEST_FIT_OPTIONS });
    const coordination = deriveTestFitCoordination(project);
    expect(coordination.options).toHaveLength(2);
    expect(coordination.options.map((option) => option.strategy).sort()).toEqual(['double_loaded', 'single_loaded']);
    expect(coordination.options.every((option) => option.inputSignature === coordination.currentInputSignature)).toBe(
      true,
    );
    expect(coordination.options.every((option) => option.metrics.estimatedCost > 0)).toBe(true);
    expect(project.floors[0]).toEqual(emptyFloorBeforeGeneration);

    const feasible = coordination.options.find(
      (option) => !option.findings.some((finding) => finding.severity === 'error'),
    );
    expect(feasible).toBeTruthy();
    project = run(project, { type: BUILDING_COMMANDS.SELECT_TEST_FIT_OPTION, optionId: feasible.id });
    const acceptance = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.ACCEPT_TEST_FIT_OPTION,
      optionId: feasible.id,
    });
    expect(acceptance.ok, acceptance.error?.message).toBe(true);
    expect(acceptance.undo).toMatchObject({ kind: 'project_snapshot' });
    project = acceptance.project;

    expect(project.floors).toHaveLength(2);
    expect(
      project.floors.every((floor) => floor.rooms.length >= 4 && floor.walls.length > 0 && floor.slabs.length === 1),
    ).toBe(true);
    expect(project.building.unitInstances).toHaveLength(4);
    expect(project.building.systems.structural.gridSystems).toHaveLength(1);
    expect(project.building.systems.plumbing.shafts).toHaveLength(1);
    expect(project.building.acceptedTestFitId).toBe(feasible.id);

    const takeoff = deriveQuantityTakeoff(project);
    expect(takeoff.items.some((item) => item.quantity > 0)).toBe(true);
    const packageManifest = derivePreliminaryPackage(project);
    expect(packageManifest.hasTestFits).toBe(true);
    expect(packageManifest.deliverables).toContainEqual(
      expect.objectContaining({ id: 'test_fit_comparison', ready: true }),
    );
    expect(packageManifest.sheets).toContainEqual(expect.objectContaining({ number: 'A-101' }));
    expect(packageManifest.sheets).toContainEqual(expect.objectContaining({ number: 'A-501' }));
    expect(packageManifest.sheets.find((sheet) => sheet.number === 'Q-001').viewports).toContainEqual(
      expect.objectContaining({ sourceRefId: 'test_fit_comparison' }),
    );
    const comparisonReport = buildBuildingReport(project, 'test_fit_comparison');
    expect(comparisonReport.rows).toHaveLength(2);
    expect(comparisonReport.notes.join(' ')).toContain('not architectural approval');

    expect(deriveRevisionEntityRecords(project).map((record) => record.kind)).toEqual(
      expect.arrayContaining(['testFitProfile', 'testFitOption', 'testFitSelection']),
    );
    expect(deriveProfessionalHandoff(project).professionalReviewRequired).toBe(true);
    expect(
      validateBuildingCoordination(project).filter(
        (issue) => issue.category === 'test_fit_coordination' && issue.severity === 'error',
      ),
    ).toEqual([]);

    const changedBudget = {
      ...project,
      building: {
        ...project.building,
        brief: { ...project.building.brief, targetBudget: project.building.brief.targetBudget + 1 },
      },
    };
    expect(validateBuildingCoordination(changedBudget)).toContainEqual(
      expect.objectContaining({ ruleId: 'TEST_FIT.OPTION_OUTDATED', professionalReviewRequired: true }),
    );
  });
});
