import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { createColumn, createProject } from './models';
import { deriveStructuralRealization, validateStructuralRealization } from './structuralRealization';
import { validateBuildingCoordination } from './buildingGraph';

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

function detailedApartment() {
  let project = createProject('Kappa structural realization');
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
    width: 16_000,
    depth: 24_000,
    northAngle: 0,
    frontEdgeIndex: 0,
    roadName: 'Road',
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
      id: 'kappa_studio',
      name: 'Kappa Studio',
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
  return run(project, { type: BUILDING_COMMANDS.DETAIL_ACCEPTED_TEST_FIT });
}

describe('Kappa coordinated structural realization', () => {
  it('realizes the accepted grid as continuous columns, opening-aware beams, slab supports, and conceptual load paths', () => {
    let project = detailedApartment();
    expect(validateStructuralRealization(project)).toContainEqual(
      expect.objectContaining({ ruleId: 'STRUCT.REALIZATION_REQUIRED' }),
    );
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_STRUCTURAL_REALIZATION_PROFILE,
      columnWidth: 300,
      columnDepth: 300,
      beamWidth: 250,
      beamDepth: 400,
    });
    const result = executeBuildingCommand(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_STRUCTURAL_BASIS });
    expect(result.ok, result.error?.message).toBe(true);
    expect(result.undo).toMatchObject({ kind: 'project_snapshot' });
    project = result.project;

    const derived = deriveStructuralRealization(project);
    expect(derived).toMatchObject({
      generatedStackCount: 12,
      generatedColumnCount: 24,
      continuousStackCount: 12,
      supportedBeamCount: derived.generatedBeamCount,
      coordinatedSlabCount: 2,
      slabCount: 2,
      foundationStatus: 'not_modeled',
    });
    expect(derived.generatedBeamCount).toBeGreaterThan(0);
    expect(derived.skippedBeamSegments.length).toBeGreaterThan(0);
    expect(derived.loadPath.summary.unsupportedNodeCount).toBe(0);
    expect(project.floors.every((floor) => floor.slabs.every((slab) => slab.supportRefs.length >= 2))).toBe(true);
    expect(
      project.floors
        .flatMap((floor) => floor.beams)
        .every(
          (beam) =>
            beam.startRef?.kind === 'column' &&
            beam.endRef?.kind === 'column' &&
            beam.generatedByStructuralRealizationId,
        ),
    ).toBe(true);

    const issues = validateBuildingCoordination(project);
    expect(issues).toContainEqual(
      expect.objectContaining({ ruleId: 'STRUCT.OPENING_REQUIRES_FRAMING_RESOLUTION', severity: 'warning' }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ ruleId: 'STRUCT.FOUNDATION_NOT_MODELED', severity: 'warning' }),
    );
    expect(
      issues.filter(
        (issue) =>
          issue.severity === 'error' && ['structural_coordination', 'vertical_coordination'].includes(issue.category),
      ),
    ).toEqual([]);
  });

  it('protects authored structure and marks a realized basis stale when modeled member assumptions change', () => {
    let project = detailedApartment();
    project.floors[0].columns.push({ ...createColumn(1000, 1000), id: 'authored_column' });
    expect(
      executeBuildingCommand(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_STRUCTURAL_BASIS }),
    ).toMatchObject({
      ok: false,
      error: { code: 'authored-structural-geometry-protected' },
    });

    project = detailedApartment();
    project = run(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_STRUCTURAL_BASIS });
    project.building.systems.structural.realizationProfile.beamDepth = 450;
    expect(validateStructuralRealization(project)).toContainEqual(
      expect.objectContaining({ ruleId: 'STRUCT.REALIZATION_OUTDATED' }),
    );
  });
});
