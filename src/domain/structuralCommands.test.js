import { describe, expect, it } from 'vitest';
import { createColumn, createProject, createSlab } from './models';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

describe('Gamma structural commands', () => {
  it('creates declared cantilevers and exposes excessive planning length without claiming capacity', () => {
    const project = createProject();
    const floor = project.floors[0];
    floor.columns = [{ ...createColumn(0, 0), id: 'column_support' }];
    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_CANTILEVER_BEAM,
      floorId: floor.id,
      beamId: 'cantilever_1',
      supportColumnId: 'column_support',
      freeEnd: { x: 2200, y: 0 },
    });
    expect(result.ok).toBe(true);
    expect(result.project.floors[0].beams[0]).toMatchObject({
      endRef: { kind: 'point', x: 2200, y: 0 },
      coordination: { condition: 'cantilever' },
    });
    expect(result.validation.issues).toContainEqual(
      expect.objectContaining({ ruleId: 'STRUCT.CANTILEVER_EXCEEDS_ASSUMPTION', severity: 'warning' }),
    );
    expect(result.validation.issues.some((entry) => entry.ruleId === 'STRUCT.BEAM_UNSUPPORTED_END')).toBe(false);
  });

  it('coordinates slab supports, adds an opening, and returns validation consequences atomically', () => {
    let project = createProject();
    const floor = project.floors[0];
    const first = { ...createColumn(0, 2000), id: 'column_a' };
    const second = { ...createColumn(4000, 2000), id: 'column_b' };
    floor.columns = [first, second];
    let result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
      floorId: floor.id,
      beamId: 'beam_1',
      startColumnId: first.id,
      endColumnId: second.id,
    });
    project = result.project;
    project.floors[0].slabs = [{ ...createSlab(floor.id, rectangle(0, 0, 4000, 4000)), id: 'slab_1' }];
    result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.COORDINATE_SLAB_SUPPORTS,
      floorId: floor.id,
      slabId: 'slab_1',
      supportRefs: [
        { kind: 'beam', id: 'beam_1' },
        { kind: 'column', id: first.id },
      ],
      maxPlanningSpan: 4500,
    });
    expect(result.ok).toBe(true);
    expect(result.project.floors[0].slabs[0]).toMatchObject({
      supportRefs: [
        { kind: 'beam', id: 'beam_1', inference: 'user_selected' },
        { kind: 'column', id: first.id, inference: 'user_selected' },
      ],
      coordination: { supportAssignment: 'user_selected', maxPlanningSpan: 4500 },
    });
    expect(result.changes.domain).toContainEqual(
      expect.objectContaining({ operation: 'derive', entityType: 'conceptualLoadPath' }),
    );

    result = executeBuildingCommand(result.project, {
      type: BUILDING_COMMANDS.ADD_SLAB_OPENING,
      floorId: floor.id,
      slabId: 'slab_1',
      openingId: 'shaft_opening',
      origin: { x: 1900, y: 1700 },
      width: 300,
      depth: 600,
      purpose: 'plumbing_shaft',
    });
    expect(result.ok).toBe(true);
    expect(result.validation.introduced).toContainEqual(
      expect.objectContaining({ ruleId: 'STRUCT.SLAB_OPENING_INTERSECTS_BEAM' }),
    );
    expect(result.undo.project).not.toBe(result.project);
  });
});
