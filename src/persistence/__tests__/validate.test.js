import { describe, it, expect } from 'vitest';
import {
  validateProjectStructure,
  validateProjectReferences,
  repairBrokenReferences,
  validateAndRepair,
} from '../validate';

function makeProject(overrides = {}) {
  return {
    id: 'proj_1',
    name: 'Test',
    floors: [
      {
        id: 'floor_1',
        walls: [{ id: 'w1' }],
        doors: [],
        windows: [],
        columns: [],
        beams: [],
        stairs: [],
        landings: [],
        fixtures: [],
        annotations: [],
        slabs: [],
        sectionCuts: [],
        rooms: [],
        railings: [],
      },
    ],
    phases: [],
    sheets: [],
    roofSystem: null,
    trussSystems: [],
    ...overrides,
  };
}

describe('validateProjectStructure', () => {
  it('returns no errors for a valid project', () => {
    const errors = validateProjectStructure(makeProject());
    expect(errors).toEqual([]);
  });

  it('returns errors for null project', () => {
    const errors = validateProjectStructure(null);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns errors for missing id', () => {
    const errors = validateProjectStructure(makeProject({ id: '' }));
    expect(errors.some((e) => e.path === 'id')).toBe(true);
  });

  it('returns errors for missing name', () => {
    const errors = validateProjectStructure(makeProject({ name: '' }));
    expect(errors.some((e) => e.path === 'name')).toBe(true);
  });

  it('returns errors for empty floors', () => {
    const errors = validateProjectStructure(makeProject({ floors: [] }));
    expect(errors.some((e) => e.path === 'floors')).toBe(true);
  });

  it('returns errors for floor without id', () => {
    const errors = validateProjectStructure(makeProject({
      floors: [{ walls: [] }],
    }));
    expect(errors.some((e) => e.path.includes('floors[0]'))).toBe(true);
  });

  it('returns errors for floor without walls array', () => {
    const errors = validateProjectStructure(makeProject({
      floors: [{ id: 'f1' }],
    }));
    expect(errors.some((e) => e.path.includes('floors[0]'))).toBe(true);
  });

  it('returns errors for door without id', () => {
    const errors = validateProjectStructure(makeProject({
      floors: [{ id: 'f1', walls: [], doors: [{ wallId: 'w1' }] }],
    }));
    expect(errors.some((e) => e.message.includes('Door missing id'))).toBe(true);
  });

  it('returns errors for door without wallId', () => {
    const errors = validateProjectStructure(makeProject({
      floors: [{ id: 'f1', walls: [], doors: [{ id: 'd1' }] }],
    }));
    expect(errors.some((e) => e.message.includes('missing wallId'))).toBe(true);
  });
});

describe('validateProjectReferences', () => {
  it('returns no warnings for a valid project', () => {
    const warnings = validateProjectReferences(makeProject());
    expect(warnings).toEqual([]);
  });

  it('flags doors referencing non-existent walls', () => {
    const project = makeProject({
      floors: [{
        id: 'f1',
        walls: [{ id: 'w1' }],
        doors: [{ id: 'd1', wallId: 'w_nonexistent' }],
        windows: [],
        columns: [],
        beams: [],
        stairs: [],
        landings: [],
        fixtures: [],
        annotations: [],
        slabs: [],
        sectionCuts: [],
        rooms: [],
        railings: [],
      }],
    });
    const warnings = validateProjectReferences(project);
    expect(warnings.some((w) => w.message.includes('non-existent wall'))).toBe(true);
  });

  it('flags windows referencing non-existent walls', () => {
    const project = makeProject({
      floors: [{
        id: 'f1',
        walls: [{ id: 'w1' }],
        doors: [],
        windows: [{ id: 'win1', wallId: 'w_nonexistent' }],
        columns: [],
        beams: [],
        stairs: [],
        landings: [],
        fixtures: [],
        annotations: [],
        slabs: [],
        sectionCuts: [],
        rooms: [],
        railings: [],
      }],
    });
    const warnings = validateProjectReferences(project);
    expect(warnings.some((w) => w.message.includes('non-existent wall'))).toBe(true);
  });

  it('flags objects with non-existent phaseId', () => {
    const project = makeProject({
      phases: [{ id: 'phase_1' }],
      floors: [{
        id: 'f1',
        walls: [{ id: 'w1', phaseId: 'phase_nonexistent' }],
        doors: [],
        windows: [],
        columns: [],
        beams: [],
        stairs: [],
        landings: [],
        fixtures: [],
        annotations: [],
        slabs: [],
        sectionCuts: [],
        rooms: [],
        railings: [],
      }],
    });
    const warnings = validateProjectReferences(project);
    expect(warnings.some((w) => w.message.includes('non-existent phase'))).toBe(true);
  });
});

describe('repairBrokenReferences', () => {
  it('removes doors referencing non-existent walls', () => {
    const project = makeProject({
      floors: [{
        id: 'f1',
        walls: [{ id: 'w1' }],
        doors: [
          { id: 'd1', wallId: 'w1' },
          { id: 'd2', wallId: 'w_gone' },
        ],
        windows: [],
        columns: [],
        beams: [],
        stairs: [],
        landings: [],
        fixtures: [],
        annotations: [],
        slabs: [],
        sectionCuts: [],
        rooms: [],
        railings: [],
      }],
    });
    const repaired = repairBrokenReferences(project);
    expect(repaired.floors[0].doors).toHaveLength(1);
    expect(repaired.floors[0].doors[0].id).toBe('d1');
  });

  it('nullifies invalid phaseId on walls', () => {
    const project = makeProject({
      phases: [{ id: 'phase_1' }],
      floors: [{
        id: 'f1',
        walls: [{ id: 'w1', phaseId: 'phase_gone' }],
        doors: [],
        windows: [],
        columns: [],
        beams: [],
        stairs: [],
        landings: [],
        fixtures: [],
        annotations: [],
        slabs: [],
        sectionCuts: [],
        rooms: [],
        railings: [],
      }],
    });
    const repaired = repairBrokenReferences(project);
    expect(repaired.floors[0].walls[0].phaseId).toBeNull();
  });

  it('does not modify valid references', () => {
    const project = makeProject({
      phases: [{ id: 'phase_1' }],
      floors: [{
        id: 'f1',
        walls: [{ id: 'w1', phaseId: 'phase_1' }],
        doors: [{ id: 'd1', wallId: 'w1', phaseId: 'phase_1' }],
        windows: [],
        columns: [],
        beams: [],
        stairs: [],
        landings: [],
        fixtures: [],
        annotations: [],
        slabs: [],
        sectionCuts: [],
        rooms: [],
        railings: [],
      }],
    });
    const repaired = repairBrokenReferences(project);
    expect(repaired.floors[0].walls[0].phaseId).toBe('phase_1');
    expect(repaired.floors[0].doors[0].wallId).toBe('w1');
  });
});

describe('validateAndRepair', () => {
  it('throws ProjectValidationError for structurally invalid projects', () => {
    expect(() => validateAndRepair({ id: '', name: '', floors: [] })).toThrow('Project failed structural validation');
  });

  it('returns project unchanged when references are valid', () => {
    const project = makeProject();
    const result = validateAndRepair(project);
    expect(result.id).toBe('proj_1');
    expect(result.floors).toHaveLength(1);
  });

  it('auto-repairs broken references and returns fixed project', () => {
    const project = makeProject({
      floors: [{
        id: 'f1',
        walls: [{ id: 'w1' }],
        doors: [{ id: 'd1', wallId: 'w_broken' }],
        windows: [],
        columns: [],
        beams: [],
        stairs: [],
        landings: [],
        fixtures: [],
        annotations: [],
        slabs: [],
        sectionCuts: [],
        rooms: [],
        railings: [],
      }],
    });
    const result = validateAndRepair(project);
    // Broken door should be removed
    expect(result.floors[0].doors).toHaveLength(0);
  });
});
