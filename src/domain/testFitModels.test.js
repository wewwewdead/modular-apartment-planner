import { describe, expect, it } from 'vitest';
import { createProject } from './models';
import { createSpaceProgram, createUnitType } from './apartmentProgram';
import {
  deriveTestFitCoordination,
  generateTestFitOptions,
  testFitInputSignature,
  validateTestFitCoordination,
} from './testFitModels';

function configuredProject() {
  const project = createProject('Test-fit basis');
  project.building.site.boundary = [
    { x: 0, y: 0 },
    { x: 12_000, y: 0 },
    { x: 12_000, y: 20_000 },
    { x: 0, y: 20_000 },
  ];
  project.building.site.edgeSetbacks = [
    { edgeIndex: 0, distance: 1000 },
    { edgeIndex: 1, distance: 1000 },
    { edgeIndex: 2, distance: 1000 },
    { edgeIndex: 3, distance: 1000 },
  ];
  project.building.brief = { ...project.building.brief, targetStoreys: 2, targetUnitCount: 4, targetBudget: 8_000_000 };
  project.building.unitTypes = [
    createUnitType({
      id: 'studio',
      name: 'Studio',
      category: 'studio',
      targetArea: { min: 20_000_000, preferred: 24_000_000, max: 30_000_000 },
    }),
  ];
  project.building.spaceProgram = createSpaceProgram({
    configured: true,
    unitTargets: [{ unitTypeId: 'studio', count: 4 }],
    parkingRequirement: 0,
  });
  project.building.testFitProfile = { planningCostPerSquareMeter: 25_000 };
  return project;
}

describe('deterministic apartment test fits', () => {
  it('generates stable comparable schemes with traceable area, grid, and budget metrics', () => {
    const project = configuredProject();
    const first = generateTestFitOptions(project);
    const repeated = generateTestFitOptions(project);
    expect(first).toEqual(repeated);
    expect(first.map((entry) => entry.strategy)).toEqual(expect.arrayContaining(['single_loaded', 'double_loaded']));
    for (const option of first) {
      expect(option).toMatchObject({
        inputSignature: testFitInputSignature(project),
        metrics: {
          storeys: 2,
          unitCount: 4,
          planningCostPerSquareMeter: 25_000,
          costProvenance: 'rule_of_thumb_allowance',
        },
        proposedGrid: { origin: expect.any(Object), xOffsets: expect.any(Array), yOffsets: expect.any(Array) },
        professionalReviewRequired: true,
      });
      expect(option.floorPlans).toHaveLength(2);
      expect(option.metrics.estimatedCost).toBeGreaterThan(0);
      expect(option.floorPlans.flatMap((entry) => entry.blocks).filter((entry) => entry.kind === 'unit')).toHaveLength(
        4,
      );
    }
  });

  it('withholds cost without a planning rate and marks a selected scheme stale after program input changes', () => {
    const project = configuredProject();
    project.building.testFitProfile = {};
    const options = generateTestFitOptions(project);
    expect(options.every((entry) => entry.metrics.estimatedCost == null)).toBe(true);
    project.building.testFitOptions = options;
    project.building.selectedTestFitId = options[0].id;
    expect(deriveTestFitCoordination(project).outOfDateOptionCount).toBe(0);
    project.building.brief.targetBudget += 1;
    expect(validateTestFitCoordination(project)).toContainEqual(
      expect.objectContaining({ ruleId: 'TEST_FIT.OPTION_OUTDATED' }),
    );
  });

  it('refuses to invent schemes before the site, storeys, and unit program are configured', () => {
    expect(generateTestFitOptions(createProject('Incomplete'))).toEqual([]);
  });
});
