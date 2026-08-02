import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { createProject, createRoom } from './models';

function execute(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

function configureBasis() {
  let project = createProject('Theta commands');
  project = execute(project, {
    type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
    width: 16_000,
    depth: 24_000,
    northAngle: 0,
    frontEdgeIndex: 0,
    roadName: 'Road',
    setbacks: { front: 1000, rear: 1000, left: 1000, right: 1000 },
  });
  project = execute(project, {
    type: BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF,
    updates: { targetStoreys: 2, targetUnitCount: 4, targetBudget: 10_000_000, currency: 'PHP' },
  });
  project = execute(project, {
    type: BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM,
    unitType: {
      id: 'theta_studio',
      name: 'Theta Studio',
      category: 'studio',
      targetArea: { min: 20_000_000, preferred: 24_000_000, max: 30_000_000 },
      spaceRequirements: [],
    },
    targetCount: 4,
    parkingRequirement: 0,
  });
  return project;
}

describe('Theta test-fit commands', () => {
  it('generates, selects, and safely materializes a test fit through one undoable command', () => {
    let project = configureBasis();
    project = execute(project, {
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
    const generated = executeBuildingCommand(project, { type: BUILDING_COMMANDS.GENERATE_TEST_FIT_OPTIONS });
    expect(generated.ok, generated.error?.message).toBe(true);
    expect(generated.project.building.testFitOptions).toHaveLength(2);
    expect(generated.undo).toMatchObject({ kind: 'project_snapshot', project });
    project = generated.project;
    const option = project.building.testFitOptions.find(
      (entry) => !entry.findings.some((finding) => finding.severity === 'error'),
    );
    expect(option).toBeTruthy();
    project = execute(project, { type: BUILDING_COMMANDS.SELECT_TEST_FIT_OPTION, optionId: option.id });
    const accepted = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.ACCEPT_TEST_FIT_OPTION,
      optionId: option.id,
    });
    expect(accepted.ok, accepted.error?.message).toBe(true);
    project = accepted.project;

    expect(project.floors).toHaveLength(2);
    expect(project.floors.every((floor) => floor.slabs.some((entry) => entry.generatedByTestFitId === option.id))).toBe(
      true,
    );
    expect(project.floors.every((floor) => floor.walls.length > 0)).toBe(true);
    expect(project.building.unitInstances).toHaveLength(4);
    expect(
      project.building.unitInstances.every(
        (entry) => entry.generatedByTestFitId === option.id && entry.roomIds.length === 1,
      ),
    ).toBe(true);
    expect(project.building.systems.structural.gridSystems).toContainEqual(
      expect.objectContaining({ id: option.proposedGrid.id, generatedByTestFitId: option.id }),
    );
    expect(project.building.systems.plumbing.shafts).toContainEqual(
      expect.objectContaining({
        generatedByTestFitId: option.id,
        servedFloorIds: project.floors.map((floor) => floor.id),
      }),
    );
    expect(project.building).toMatchObject({ selectedTestFitId: option.id, acceptedTestFitId: option.id });
    expect(accepted.changes.domain).toContainEqual(
      expect.objectContaining({ operation: 'materialize', entityType: 'testFitBuildingBasis' }),
    );
    expect(accepted.undo).toMatchObject({ kind: 'project_snapshot' });
  });

  it('protects authored geometry and rejects stale or infeasible options', () => {
    let project = configureBasis();
    project = execute(project, { type: BUILDING_COMMANDS.GENERATE_TEST_FIT_OPTIONS });
    const option = project.building.testFitOptions.find(
      (entry) => !entry.findings.some((finding) => finding.severity === 'error'),
    );
    project.floors[0].rooms = [
      createRoom('Authored room', [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 },
      ]),
    ];
    expect(
      executeBuildingCommand(project, { type: BUILDING_COMMANDS.ACCEPT_TEST_FIT_OPTION, optionId: option.id }),
    ).toMatchObject({ ok: false, error: { code: 'authored-geometry-protected' } });
    project.floors[0].rooms = [];
    project.building.brief.targetBudget += 1;
    expect(
      executeBuildingCommand(project, { type: BUILDING_COMMANDS.ACCEPT_TEST_FIT_OPTION, optionId: option.id }),
    ).toMatchObject({ ok: false, error: { code: 'test-fit-option-outdated' } });
  });
});
