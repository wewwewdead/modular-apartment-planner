import { describe, expect, it } from 'vitest';
import { createColumn, createProject } from './models';
import { syncCanonicalBuilding } from './buildingModels';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { validateBuildingCoordination } from './buildingGraph';

function projectWithColumn() {
  const project = createProject('Deferral');
  const ground = project.floors[0];
  ground.columns = [{ ...createColumn(0, 0, 300, 300), id: 'column_a' }];
  return syncCanonicalBuilding(project);
}

function shaftCommand(project) {
  return {
    type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
    shaftId: 'shaft_1',
    name: 'Shaft',
    origin: { x: 0, y: 0 },
    width: 600,
    depth: 800,
    servedFloorIds: project.floors.map((floor) => floor.id),
    maxFixtureDistance: 2500,
  };
}

describe('executeBuildingCommand with deferred validation', () => {
  it('reports the validation delta by default', () => {
    const project = projectWithColumn();
    const result = executeBuildingCommand(project, shaftCommand(project));
    expect(result.ok).toBe(true);
    expect(result.changes.derived[1]).toMatchObject({ kind: 'coordination_validation_recomputed' });
    expect(Array.isArray(result.validation.issues)).toBe(true);
    expect(result.validation.deferred).toBeUndefined();
  });

  it('produces the same project without validating when the store asks it to defer', () => {
    const project = projectWithColumn();
    const settled = executeBuildingCommand(project, shaftCommand(project));
    const deferred = executeBuildingCommand(project, shaftCommand(project), { deferValidation: true });
    expect(deferred.ok).toBe(true);
    expect(deferred.project).toEqual(settled.project);
    expect(deferred.changes.derived[1]).toEqual({ kind: 'coordination_validation_deferred' });
    expect(deferred.validation).toEqual({ issues: null, introduced: [], resolved: [], deferred: true });
    expect(deferred.undo).toEqual(settled.undo);
  });

  it('forgets the option as soon as the command returns', () => {
    const project = projectWithColumn();
    executeBuildingCommand(project, shaftCommand(project), { deferValidation: true });
    const next = executeBuildingCommand(project, shaftCommand(project));
    expect(next.changes.derived[1]).toMatchObject({ kind: 'coordination_validation_recomputed' });
  });
});

describe('validateBuildingCoordination memo', () => {
  it('answers the same project object with the same issue list', () => {
    const project = projectWithColumn();
    const first = validateBuildingCoordination(project);
    expect(validateBuildingCoordination(project)).toBe(first);
  });

  it('recomputes for a different project and for explicit options', () => {
    const project = projectWithColumn();
    const first = validateBuildingCoordination(project);
    const other = syncCanonicalBuilding({ ...project, floors: [{ ...project.floors[0], columns: [] }] });
    expect(validateBuildingCoordination(other)).not.toBe(first);
    expect(validateBuildingCoordination(project, { columnAlignmentTolerance: 5 })).not.toBe(first);
    expect(validateBuildingCoordination(project, { columnAlignmentTolerance: 5 })).toEqual(first);
  });
});
