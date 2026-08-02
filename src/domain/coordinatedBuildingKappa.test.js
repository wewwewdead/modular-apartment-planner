import { describe, expect, it } from 'vitest';
import { deserializeProject } from '@/persistence/deserialize';
import { serializeProject } from '@/persistence/serialize';
import { buildFloorPreviewObjects } from '@/three/scene/objectBuilders';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { validateBuildingCoordination } from './buildingGraph';
import { buildBuildingReport, derivePreliminaryPackage } from './documentPackage';
import { createProject } from './models';
import { deriveProfessionalHandoff, deriveRevisionEntityRecords } from './professionalHandoff';
import { deriveQuantityTakeoff } from './quantityTakeoff';
import { deriveStructuralRealization } from './structuralRealization';

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

describe('Apartment Planner Kappa acceptance', () => {
  it('realizes the Iota apartment basis as one coordinated structural relationship model', () => {
    let project = createProject('Kappa two-storey four-unit RC apartment');
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
        id: 'kappa_studio',
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
    const architecturalConcrete = deriveQuantityTakeoff(project).items.find((item) => item.id === 'concrete').quantity;
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_STRUCTURAL_REALIZATION_PROFILE,
      columnWidth: 300,
      columnDepth: 300,
      beamWidth: 250,
      beamDepth: 400,
    });
    project = run(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_STRUCTURAL_BASIS });

    const realization = deriveStructuralRealization(project);
    expect(realization).toMatchObject({
      state: expect.objectContaining({
        status: 'realized',
        sourceTestFitId: option.id,
        foundationStatus: 'not_modeled',
        professionalReviewRequired: true,
      }),
      generatedStackCount: 12,
      generatedColumnCount: 24,
      continuousStackCount: 12,
      supportedBeamCount: realization.generatedBeamCount,
      coordinatedSlabCount: 2,
    });
    expect(realization.generatedBeamCount).toBeGreaterThan(0);
    expect(realization.loadPath).toMatchObject({
      resultKind: 'conceptual_relationship_diagram',
      summary: { unsupportedNodeCount: 0 },
      professionalReviewRequired: true,
    });
    expect(realization.loadPath).not.toHaveProperty('loads');
    expect(realization.loadPath).not.toHaveProperty('capacity');

    const structuralErrors = validateBuildingCoordination(project).filter(
      (issue) =>
        issue.severity === 'error' && ['structural_coordination', 'vertical_coordination'].includes(issue.category),
    );
    expect(structuralErrors).toEqual([]);
    const warnings = validateBuildingCoordination(project);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'STRUCT.OPENING_REQUIRES_FRAMING_RESOLUTION',
          professionalReviewRequired: true,
        }),
        expect.objectContaining({ ruleId: 'STRUCT.FOUNDATION_NOT_MODELED', professionalReviewRequired: true }),
      ]),
    );

    const concrete = deriveQuantityTakeoff(project).items.find((item) => item.id === 'concrete');
    expect(concrete.quantity).toBeGreaterThan(architecturalConcrete);
    expect(concrete.inputs).toEqual(
      expect.objectContaining({ columnsM3: expect.any(Number), beamsM3: expect.any(Number) }),
    );
    expect(concrete.inputs.columnsM3).toBeGreaterThan(0);
    expect(concrete.inputs.beamsM3).toBeGreaterThan(0);
    const previewKinds = project.floors.flatMap(buildFloorPreviewObjects).map((entry) => entry.kind);
    expect(previewKinds).toEqual(expect.arrayContaining(['column', 'beam', 'slab', 'stair', 'wall']));

    const manifest = derivePreliminaryPackage(project);
    expect(manifest.hasStructuralRealization).toBe(true);
    expect(manifest.deliverables).toContainEqual(
      expect.objectContaining({ id: 'structural_realization_basis', ready: true }),
    );
    expect(manifest.sheets.filter((sheet) => sheet.number.startsWith('S-'))).toHaveLength(2);
    expect(manifest.sheets.find((sheet) => sheet.number === 'Q-001').viewports).toContainEqual(
      expect.objectContaining({ sourceRefId: 'structural_realization_basis' }),
    );
    const report = buildBuildingReport(project, 'structural_realization_basis');
    expect(report.rows.flat().join(' ')).toContain('not_modeled');
    expect(report.notes.join(' ')).toContain('No loads, reactions');

    expect(deriveRevisionEntityRecords(project).map((record) => record.kind)).toEqual(
      expect.arrayContaining([
        'structuralRealizationProfile',
        'structuralRealizationState',
        'structuralGrid',
        'columnStack',
        'columns',
        'beams',
      ]),
    );
    expect(deriveProfessionalHandoff(project)).toMatchObject({
      structuralRealizationState: expect.objectContaining({ status: 'realized' }),
      professionalReviewRequired: true,
    });

    const firstIds = project.building.systems.structural.realization.generatedEntityRefs;
    project = run(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_STRUCTURAL_BASIS });
    expect(project.building.systems.structural.realization.generatedEntityRefs).toEqual(firstIds);

    const restored = deserializeProject(serializeProject(project)).project;
    expect(restored.building.systems.structural.realization).toEqual(project.building.systems.structural.realization);
    expect(deriveStructuralRealization(restored)).toMatchObject({
      generatedStackCount: 12,
      generatedColumnCount: 24,
      continuousStackCount: 12,
      supportedBeamCount: realization.generatedBeamCount,
    });
  });
});
