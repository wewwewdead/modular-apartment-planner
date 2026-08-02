import { describe, expect, it } from 'vitest';
import {
  createBeam,
  createColumn,
  createDoor,
  createFixture,
  createFloor,
  createProject,
  createRoom,
  createStair,
  createWall,
} from './models';
import { validateBuildabilityCoordination } from './buildabilityValidation';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

describe('Beta buildability coordination', () => {
  it('reports a door swing obstruction and configured room-width shortfall with traceable evidence', () => {
    const project = createProject();
    const floor = project.floors[0];
    const wall = { ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }), id: 'wall_host' };
    floor.walls = [wall];
    floor.doors = [{ ...createDoor(wall.id, 1000, 750, 'left'), id: 'door_narrow' }];
    floor.fixtures = [{ ...createFixture('bed', 900, -400, { width: 500, depth: 500 }), id: 'fixture_blocking' }];
    floor.rooms = [
      { ...createRoom('Narrow bedroom', rectangle(0, 500, 2200, 3500)), id: 'room_narrow', spaceType: 'bedroom' },
    ];

    const issues = validateBuildabilityCoordination(project);
    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'BUILD.DOOR_SWING_OBSTRUCTED',
        severity: 'error',
        entityRefs: expect.arrayContaining([{ type: 'fixture', id: 'fixture_blocking' }]),
        evidence: { resultKind: 'verified_geometry', confidence: 'checked', inputs: expect.any(Object) },
      }),
    );
    expect(issues).toContainEqual(expect.objectContaining({ ruleId: 'BUILD.DOOR_WIDTH_BELOW_ASSUMPTION' }));
    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'BUILD.ROOM_WIDTH_BELOW_ASSUMPTION',
        evidence: expect.objectContaining({
          inputs: expect.objectContaining({ measuredWidth: 2200, configuredMinimum: 2400 }),
        }),
      }),
    );
  });

  it('checks a modeled beam crossing against the stair walking-line headroom', () => {
    const project = createProject();
    const ground = project.floors[0];
    const upper = createFloor('Second Floor', 1, { elevation: 3000, floorToFloorHeight: 3000 });
    ground.stairs = [
      {
        ...createStair(
          { x: 0, y: 0 },
          1000,
          15,
          200,
          300,
          { angle: 0 },
          { fromFloorId: ground.id, toFloorId: upper.id },
        ),
        id: 'stair_1',
      },
    ];
    const start = { ...createColumn(1000, -1000), id: 'column_a' };
    const end = { ...createColumn(1000, 1000), id: 'column_b' };
    upper.columns = [start, end];
    upper.beams = [
      {
        ...createBeam({ kind: 'column', id: start.id }, { kind: 'column', id: end.id }, 300, 600, 3000),
        id: 'beam_crossing',
      },
    ];
    project.floors = [ground, upper];

    const finding = validateBuildabilityCoordination(project).find(
      (entry) => entry.ruleId === 'BUILD.STAIR_BEAM_HEADROOM_BELOW_ASSUMPTION',
    );
    expect(finding).toMatchObject({
      severity: 'error',
      entityRefs: [
        { type: 'stair', id: 'stair_1' },
        { type: 'beam', id: 'beam_crossing' },
      ],
      evidence: {
        resultKind: 'verified_geometry',
        inputs: { configuredMinimum: 2000 },
      },
      professionalReviewRequired: true,
    });
    expect(finding.evidence.inputs.clearance).toBeLessThan(2000);
  });
});
