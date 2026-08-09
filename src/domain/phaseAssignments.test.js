import { describe, expect, it } from 'vitest';
import {
  clearProjectPhaseReferences,
  countObjectsInProjectPhase,
  sanitizeProjectPhaseReferences,
} from './phaseAssignments';

function projectFixture() {
  return {
    id: 'proj-1',
    phases: [{ id: 'p1' }, { id: 'p2' }],
    floors: [
      {
        id: 'floor-1',
        walls: [{ id: 'wall_p1', phaseId: 'p1' }],
        doors: [],
        windows: [],
        columns: [],
        beams: [],
        slabs: [],
        stairs: [],
        landings: [],
        fixtures: [],
        rooms: [],
        railings: [],
        annotations: [],
        sectionCuts: [],
      },
    ],
    roofSystem: null,
    trussSystems: [{ id: 'truss_p1', phaseId: 'p1' }],
    ceilings: [
      { id: 'ceiling_p1', floorId: 'floor-1', phaseId: 'p1' },
      { id: 'ceiling_p2', floorId: 'floor-1', phaseId: 'p2' },
      { id: 'ceiling_unphased', floorId: 'floor-1', phaseId: null },
    ],
    sheets: [],
  };
}

describe('project-level phase assignments include ceilings', () => {
  it('counts ceilings assigned to a phase', () => {
    expect(countObjectsInProjectPhase(projectFixture(), 'p1')).toBe(3);
    expect(countObjectsInProjectPhase(projectFixture(), 'p2')).toBe(1);
  });

  it('clears ceiling phaseIds when their phase is deleted, leaving other ceilings alone', () => {
    const project = projectFixture();
    const cleared = clearProjectPhaseReferences(project, 'p1');

    expect(cleared.ceilings.map((ceiling) => ceiling.phaseId)).toEqual([null, 'p2', null]);
    expect(cleared.ceilings[1]).toBe(project.ceilings[1]);
    expect(cleared.trussSystems[0].phaseId).toBeNull();
  });

  it('sanitizes ceiling phaseIds that point at phases the project no longer has', () => {
    const project = projectFixture();
    project.ceilings = [
      { id: 'ceiling_valid', phaseId: 'p1' },
      { id: 'ceiling_dangling', phaseId: 'p_gone' },
    ];
    const sanitized = sanitizeProjectPhaseReferences(project, new Set(['p1', 'p2']));

    expect(sanitized.ceilings[0]).toBe(project.ceilings[0]);
    expect(sanitized.ceilings[1].phaseId).toBeNull();
  });
});
