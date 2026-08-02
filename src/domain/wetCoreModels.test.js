import { describe, expect, it } from 'vitest';
import { createFixture, createFloor, createProject } from './models';
import { createDuplicatedFloor } from './floorModels';
import { createPlumbingShaft, deriveWetCoreCoordination, validateWetCoreCoordination } from './wetCoreModels';

function fixtureProject() {
  const project = createProject('Wet Core');
  const ground = project.floors[0];
  const upper = createFloor('Second Floor', 1, { elevation: 3000 });
  ground.fixtures = [{ ...createFixture('toilet', 1000, 0), id: 'toilet_ground' }];
  upper.fixtures = [{ ...createFixture('lavatory', 5000, 0), id: 'lavatory_upper' }];
  return { ...project, floors: [ground, upper] };
}

describe('wet-core coordination', () => {
  it('derives assignment coverage for wet fixtures only', () => {
    const project = fixtureProject();
    project.floors[0].fixtures[0].plumbingShaftId = 'shaft_1';
    expect(deriveWetCoreCoordination(project)).toEqual({
      shaftCount: 0,
      wetFixtureCount: 2,
      assignedFixtureCount: 1,
      unassignedFixtureCount: 1,
    });
  });

  it('checks shaft continuity, served levels, broken links, and configured distance', () => {
    const project = fixtureProject();
    const shaft = createPlumbingShaft({
      id: 'shaft_1',
      origin: { x: 0, y: 0 },
      width: 600,
      depth: 600,
      servedFloorIds: project.floors.map((floor) => floor.id),
      maxFixtureDistance: 2000,
    });
    project.building.systems.plumbing.shafts = [shaft];
    project.floors[0].fixtures[0].plumbingShaftId = shaft.id;
    project.floors[1].fixtures[0].plumbingShaftId = shaft.id;

    const issues = validateWetCoreCoordination(project);
    expect(issues.map((issue) => issue.ruleId)).toEqual(['SYSTEM.FIXTURE_TOO_FAR_FROM_SHAFT']);
    expect(issues[0].evidence.inputs).toMatchObject({ configuredMaximum: 2000, distance: 4700 });
  });

  it('reports unassigned wet fixtures without treating furniture as plumbing', () => {
    const project = fixtureProject();
    project.floors[0].fixtures.push({ ...createFixture('bed', 0, 0), id: 'bed_1' });
    const issues = validateWetCoreCoordination(project);
    expect(issues).toHaveLength(2);
    expect(issues.every((issue) => issue.ruleId === 'SYSTEM.WET_FIXTURE_UNASSIGNED')).toBe(true);
  });

  it('duplicates fixture geometry without silently inheriting shaft membership', () => {
    const project = fixtureProject();
    project.floors[0].fixtures[0].plumbingShaftId = 'shaft_1';
    const duplicate = createDuplicatedFloor(project.floors[0]);
    expect(duplicate.fixtures).toHaveLength(1);
    expect(duplicate.fixtures[0]).toMatchObject({ fixtureType: 'toilet', plumbingShaftId: null });
    expect(duplicate.fixtures[0].id).not.toBe(project.floors[0].fixtures[0].id);
  });
});
