import { describe, expect, it } from 'vitest';
import { createCanonicalBuilding, syncCanonicalBuilding } from './buildingModels';
import { validateBuildingCoordination } from './buildingGraph';

function makeProject() {
  const floors = [
    {
      id: 'ground',
      levelIndex: 0,
      walls: [],
      columns: [
        { id: 'c1', stackId: 'stack_1', x: 0, y: 0 },
        { id: 'c2', stackId: 'stack_2', x: 4000, y: 0 },
      ],
      beams: [
        {
          id: 'b1',
          startRef: { kind: 'column', id: 'c1' },
          endRef: { kind: 'column', id: 'c2' },
        },
      ],
    },
    {
      id: 'upper',
      levelIndex: 1,
      walls: [],
      columns: [{ id: 'c3', stackId: 'stack_1', x: 0, y: 0 }],
      beams: [],
    },
  ];
  return syncCanonicalBuilding({ id: 'proj_1', floors, building: createCanonicalBuilding('proj_1', floors) });
}

describe('building coordination validation', () => {
  it('accepts aligned column stacks and supported beams', () => {
    expect(validateBuildingCoordination(makeProject())).toEqual([]);
  });

  it('reports traceable geometric evidence when an upper column moves off its stack', () => {
    const project = makeProject();
    project.floors[1].columns[0] = { ...project.floors[1].columns[0], x: 80 };

    const [warning] = validateBuildingCoordination(project);
    expect(warning).toMatchObject({
      ruleId: 'STRUCT.COLUMN_STACK_MISALIGNED',
      severity: 'warning',
      professionalReviewRequired: true,
      evidence: { resultKind: 'verified_geometry', confidence: 'checked' },
    });
    expect(warning.evidence.inputs).toMatchObject({ offset: 80, tolerance: 25 });
  });

  it('rejects a beam endpoint that is only a free point', () => {
    const project = makeProject();
    project.floors[0].beams[0].endRef = { kind: 'point', x: 4000, y: 0 };

    const issues = validateBuildingCoordination(project);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('STRUCT.BEAM_UNSUPPORTED_END');
    expect(issues[0].severity).toBe('error');
  });

  it('reports a broken grid relationship on a planned column stack', () => {
    const project = makeProject();
    project.building.systems.structural.columnStacks.push({
      id: 'planned',
      intent: 'planned',
      name: 'C4',
      origin: { x: 8000, y: 0 },
      gridIntersection: { gridId: 'missing', xAxisId: 'x', yAxisId: 'y' },
      columnRefs: [],
    });

    const issues = validateBuildingCoordination(project);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('STRUCT.COLUMN_STACK_GRID_REFERENCE_BROKEN');
  });
});
