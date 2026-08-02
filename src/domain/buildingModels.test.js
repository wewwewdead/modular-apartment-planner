import { describe, expect, it } from 'vitest';
import {
  DESIGN_CONFIDENCE,
  createCanonicalBuilding,
  migrateToCanonicalBuilding,
  syncCanonicalBuilding,
} from './buildingModels';

function floor(id, levelIndex, columns = []) {
  return { id, levelIndex, columns, walls: [], beams: [] };
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
