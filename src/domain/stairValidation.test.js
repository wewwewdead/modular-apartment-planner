import { describe, expect, it } from 'vitest';
import { createFloor, createProject, createSlab, createStair } from './models';
import { deriveStairClearanceEnvelope, deriveStairMetrics, validateStairCoordination } from './stairValidation';

function projectWithStair(overrides = {}) {
  const project = createProject('Stair Checks');
  const ground = project.floors[0];
  const upper = createFloor('Second Floor', 1, { elevation: 3150, floorToFloorHeight: 3150 });
  const stair = {
    ...createStair({ x: 0, y: 0 }, 1000, 18, 175, 280, { angle: 0 }, { fromFloorId: ground.id, toFloorId: upper.id }),
    id: 'stair_1',
    ...overrides,
  };
  ground.stairs = [stair];
  return { ...project, floors: [ground, upper] };
}

describe('stair coordination', () => {
  it('derives rise, run, level difference, and comfort evidence', () => {
    const project = projectWithStair();
    const stair = project.floors[0].stairs[0];
    expect(deriveStairMetrics(stair, project.floors[0], project.floors[1])).toEqual({
      totalRise: 3150,
      totalRun: 5040,
      levelRise: 3150,
      riseDifference: 0,
      comfortValue: 630,
    });
  });

  it('accepts coordinated geometry while retaining the explicit headroom limitation', () => {
    const issues = validateStairCoordination(projectWithStair());
    expect(issues).toEqual([
      expect.objectContaining({
        ruleId: 'STAIR.HEADROOM_NOT_VERIFIED',
        professionalReviewRequired: true,
        evidence: expect.objectContaining({ resultKind: 'missing_coordination_geometry' }),
      }),
    ]);
  });

  it('reports level-rise, width, tread, riser, and comfort contradictions from configured assumptions', () => {
    const project = projectWithStair({ width: 800, numberOfRisers: 14, riserHeight: 210, treadDepth: 100 });
    const ruleIds = validateStairCoordination(project).map((issue) => issue.ruleId);
    expect(ruleIds).toEqual(
      expect.arrayContaining([
        'STAIR.RISE_LEVEL_MISMATCH',
        'STAIR.WIDTH_BELOW_ASSUMPTION',
        'STAIR.RISER_OUTSIDE_ASSUMPTION',
        'STAIR.TREAD_BELOW_ASSUMPTION',
        'STAIR.COMFORT_RELATION_OUTSIDE_ASSUMPTION',
        'STAIR.HEADROOM_NOT_VERIFIED',
      ]),
    );
  });

  it('rejects missing or non-ascending floor relationships', () => {
    const missing = projectWithStair({ floorRelation: { fromFloorId: null, toFloorId: null } });
    expect(validateStairCoordination(missing)).toContainEqual(
      expect.objectContaining({ ruleId: 'STAIR.FLOOR_RELATION_MISSING', severity: 'error' }),
    );

    const sameFloor = projectWithStair();
    sameFloor.floors[0].stairs[0].floorRelation.toFloorId = sameFloor.floors[0].id;
    expect(validateStairCoordination(sameFloor)).toContainEqual(
      expect.objectContaining({ ruleId: 'STAIR.NON_ASCENDING_RELATION', severity: 'error' }),
    );
  });

  it('checks a linked destination slab opening against the derived headroom envelope', () => {
    const project = projectWithStair();
    const ground = project.floors[0];
    const upper = project.floors[1];
    const stair = ground.stairs[0];
    const slab = {
      ...createSlab(
        upper.id,
        [
          { x: 0, y: -1000 },
          { x: 6000, y: -1000 },
          { x: 6000, y: 1000 },
          { x: 0, y: 1000 },
        ],
        150,
        upper.elevation,
      ),
      id: 'slab_1',
    };
    const envelope = deriveStairClearanceEnvelope(stair, ground, slab, 2000);
    slab.openings = [{ id: 'opening_1', purpose: 'stair', boundaryPoints: envelope }];
    upper.slabs = [slab];
    stair.coordination = {
      minimumHeadroom: 2000,
      clearanceOpeningRef: { floorId: upper.id, slabId: slab.id, openingId: 'opening_1' },
    };

    expect(validateStairCoordination(project).map((entry) => entry.ruleId)).not.toContain(
      'STAIR.HEADROOM_NOT_VERIFIED',
    );
    expect(validateStairCoordination(project).map((entry) => entry.ruleId)).not.toContain(
      'STAIR.CLEARANCE_OPENING_INCOMPLETE',
    );

    slab.openings[0].boundaryPoints = envelope.map((point) => ({ ...point, x: point.x + 2000 }));
    expect(validateStairCoordination(project)).toContainEqual(
      expect.objectContaining({ ruleId: 'STAIR.CLEARANCE_OPENING_INCOMPLETE', severity: 'error' }),
    );
  });
});
