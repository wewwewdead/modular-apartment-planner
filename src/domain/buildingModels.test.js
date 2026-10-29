import { describe, expect, it } from 'vitest';
import {
  DESIGN_CONFIDENCE,
  createCanonicalBuilding,
  migrateToCanonicalBuilding,
  syncCanonicalBuilding,
} from './buildingModels';

function floor(id, levelIndex, columns = [], walls = []) {
  return { id, levelIndex, columns, walls, beams: [] };
}

function wall(id, stackId) {
  return { id, stackId, start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, thickness: 200 };
}

describe('canonical building model', () => {
  it('starts with Philippine metric assumptions and no implied verification', () => {
    const building = createCanonicalBuilding('proj_1', [floor('ground', 0)]);

    expect(building.jurisdiction).toMatchObject({ countryCode: 'PH', unitSystem: 'metric' });
    expect(building.levelIds).toEqual(['ground']);
    expect(building.systems.structural.strategy).toBe('reinforced_concrete_frame');
    expect(building.systems.structural.confidence).toBe(DESIGN_CONFIDENCE.MODELED);
    expect(building.systems.structural.professionalReviewRequired).toBe(true);
  });

  it('migrates matching legacy columns into an explicit vertical stack once', () => {
    const project = {
      id: 'proj_1',
      floors: [
        floor('ground', 0, [{ id: 'c1', name: 'C1', x: 1000, y: 2000, width: 300, depth: 300 }]),
        floor('upper', 1, [{ id: 'c2', name: 'C1', x: 1030, y: 2000, width: 300, depth: 300 }]),
      ],
    };

    const migrated = migrateToCanonicalBuilding(project);
    const [stack] = migrated.building.systems.structural.columnStacks;

    expect(migrated.floors[0].columns[0].stackId).toBe(stack.id);
    expect(migrated.floors[1].columns[0].stackId).toBe(stack.id);
    expect(stack.origin).toEqual({ x: 1000, y: 2000 });
    expect(stack.columnRefs).toEqual([
      { floorId: 'ground', columnId: 'c1' },
      { floorId: 'upper', columnId: 'c2' },
    ]);
  });

  it('synchronizes level and reverse-reference indexes from authoritative entities', () => {
    const building = createCanonicalBuilding('proj_1', []);
    const project = {
      id: 'proj_1',
      building,
      floors: [floor('ground', 0, [{ id: 'c1', stackId: 'stack_1', x: 0, y: 0 }])],
    };

    const synced = syncCanonicalBuilding(project);
    expect(synced.building.levelIds).toEqual(['ground']);
    expect(synced.building.systems.structural.columnStacks[0]).toMatchObject({
      id: 'stack_1',
      origin: { x: 0, y: 0 },
      columnRefs: [{ floorId: 'ground', columnId: 'c1' }],
    });
  });
});

/**
 * A wall's `stackId` is the facade counterpart of a column's, and wallStacks is
 * its reverse index: same source of truth on the entity, same rebuild on every
 * commit. The one difference the tests have to pin is that a storey brings
 * SEVERAL walls to a bay stack where it brings one column to a column stack.
 */
describe('wall stacks', () => {
  function bayProject(floors) {
    return { id: 'proj_1', building: createCanonicalBuilding('proj_1', floors), floors };
  }

  it('starts a building with no bays', () => {
    expect(createCanonicalBuilding('proj_1', []).systems.structural.wallStacks).toEqual([]);
  });

  it('indexes walls by the stack they name, in stacking order', () => {
    const project = bayProject([
      floor('upper', 1, [], [wall('w_face_upper', 'bay_1')]),
      floor('ground', 0, [], [wall('w_face', 'bay_1'), wall('w_left', 'bay_1'), wall('w_loose', null)]),
    ]);

    const [stack, ...rest] = syncCanonicalBuilding(project).building.systems.structural.wallStacks;

    expect(rest).toEqual([]);
    expect(stack).toEqual({
      id: 'bay_1',
      // Ordered by the floors array, which is the stacking order the project
      // keeps — and a storey contributes both of its bay walls.
      wallRefs: [
        { floorId: 'upper', wallId: 'w_face_upper' },
        { floorId: 'ground', wallId: 'w_face' },
        { floorId: 'ground', wallId: 'w_left' },
      ],
    });
  });

  it('keeps a wall that belongs to no stack out of the index entirely', () => {
    const project = bayProject([floor('ground', 0, [], [wall('w_plain', null)])]);

    expect(syncCanonicalBuilding(project).building.systems.structural.wallStacks).toEqual([]);
  });

  it('does not churn when the commit had nothing to do with walls', () => {
    const project = bayProject([
      floor('ground', 0, [{ id: 'c1', stackId: 'stack_1', x: 0, y: 0 }], [wall('w', 'bay_1')]),
    ]);

    const first = syncCanonicalBuilding(project);
    // The kind of edit that happens between two commits and touches no wall.
    const second = syncCanonicalBuilding({ ...first, name: 'Renamed' });

    expect(second.building.systems.structural.wallStacks).toEqual(first.building.systems.structural.wallStacks);
  });

  it('drops a stack whose last wall was deleted rather than leaving an empty one', () => {
    const project = bayProject([floor('ground', 0, [], [wall('w', 'bay_1')])]);
    const withBay = syncCanonicalBuilding(project);
    expect(withBay.building.systems.structural.wallStacks).toHaveLength(1);

    const emptied = syncCanonicalBuilding({
      ...withBay,
      floors: [{ ...withBay.floors[0], walls: [] }],
    });

    expect(emptied.building.systems.structural.wallStacks).toEqual([]);
  });
});
