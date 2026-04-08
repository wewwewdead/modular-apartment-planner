import { describe, expect, it } from 'vitest';
import {
  assignEntitiesToGroup,
  buildGroupIndex,
  expandGroupedSelection,
  getEntityGroupId,
  normalizeEntityGroupMemberships,
  removeEntitiesFromGroups,
} from './groupUtils';

function createEntity(id, groupId = null) {
  return {
    id,
    type: 'rect',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    layerId: 'default',
    meta: groupId ? { groupId } : {},
  };
}

describe('groupUtils', () => {
  it('expands a clicked member to the full group selection', () => {
    const entities = [createEntity('rect-1', 'group-a'), createEntity('rect-2', 'group-a'), createEntity('rect-3')];

    expect(expandGroupedSelection(entities, ['rect-2'])).toEqual(['rect-2', 'rect-1']);
  });

  it('assigns a fresh shared group id to the selected entities', () => {
    const entities = [createEntity('rect-1'), createEntity('rect-2'), createEntity('rect-3')];

    const grouped = assignEntitiesToGroup(entities, ['rect-1', 'rect-3']);
    const nextGroupId = getEntityGroupId(grouped[0]);

    expect(nextGroupId).toBeTruthy();
    expect(getEntityGroupId(grouped[2])).toBe(nextGroupId);
    expect(getEntityGroupId(grouped[1])).toBeNull();
  });

  it('removes group ids from the selected members and cleans up singletons', () => {
    const entities = [
      createEntity('rect-1', 'group-a'),
      createEntity('rect-2', 'group-a'),
      createEntity('rect-3', 'group-b'),
      createEntity('rect-4', 'group-b'),
    ];

    const degrouped = removeEntitiesFromGroups(entities, ['rect-1', 'rect-3', 'rect-4']);

    expect(getEntityGroupId(degrouped[0])).toBeNull();
    expect(getEntityGroupId(degrouped[1])).toBeNull();
    expect(getEntityGroupId(degrouped[2])).toBeNull();
    expect(getEntityGroupId(degrouped[3])).toBeNull();
  });

  it('restores the previous group when de-grouping a nested group', () => {
    const entities = [createEntity('rect-1'), createEntity('rect-2'), createEntity('rect-3')];

    // Group A+B into G1
    const step1 = assignEntitiesToGroup(entities, ['rect-1', 'rect-2']);
    const g1 = getEntityGroupId(step1[0]);
    expect(g1).toBeTruthy();
    expect(getEntityGroupId(step1[1])).toBe(g1);
    expect(getEntityGroupId(step1[2])).toBeNull();

    // Group G1+C into G2 (all three get same groupId)
    const step2 = assignEntitiesToGroup(step1, ['rect-1', 'rect-2', 'rect-3']);
    const g2 = getEntityGroupId(step2[0]);
    expect(g2).toBeTruthy();
    expect(g2).not.toBe(g1);
    expect(getEntityGroupId(step2[1])).toBe(g2);
    expect(getEntityGroupId(step2[2])).toBe(g2);

    // De-group G2: A and B should restore to G1, C should be ungrouped
    const step3 = removeEntitiesFromGroups(step2, ['rect-1', 'rect-2', 'rect-3']);
    expect(getEntityGroupId(step3[0])).toBe(g1);
    expect(getEntityGroupId(step3[1])).toBe(g1);
    expect(getEntityGroupId(step3[2])).toBeNull();
  });

  it('supports multiple levels of nesting', () => {
    const entities = [createEntity('a'), createEntity('b'), createEntity('c'), createEntity('d')];

    // Level 1: group a+b
    const level1 = assignEntitiesToGroup(entities, ['a', 'b']);
    const g1 = getEntityGroupId(level1[0]);

    // Level 2: group (a+b)+c
    const level2 = assignEntitiesToGroup(level1, ['a', 'b', 'c']);
    const g2 = getEntityGroupId(level2[0]);

    // Level 3: group ((a+b)+c)+d
    const level3 = assignEntitiesToGroup(level2, ['a', 'b', 'c', 'd']);
    const _g3 = getEntityGroupId(level3[0]);

    // De-group level 3 → restores level 2
    const pop1 = removeEntitiesFromGroups(level3, ['a', 'b', 'c', 'd']);
    expect(getEntityGroupId(pop1[0])).toBe(g2);
    expect(getEntityGroupId(pop1[1])).toBe(g2);
    expect(getEntityGroupId(pop1[2])).toBe(g2);
    expect(getEntityGroupId(pop1[3])).toBeNull();

    // De-group level 2 → restores level 1
    const pop2 = removeEntitiesFromGroups(pop1, ['a', 'b', 'c']);
    expect(getEntityGroupId(pop2[0])).toBe(g1);
    expect(getEntityGroupId(pop2[1])).toBe(g1);
    expect(getEntityGroupId(pop2[2])).toBeNull();
  });

  describe('buildGroupIndex', () => {
    it('returns an empty map for empty entities', () => {
      expect(buildGroupIndex([]).size).toBe(0);
    });

    it('returns an empty map when no entities have groups', () => {
      const entities = [createEntity('a'), createEntity('b')];
      expect(buildGroupIndex(entities).size).toBe(0);
    });

    it('maps each groupId to its member entity ids', () => {
      const entities = [createEntity('a', 'g1'), createEntity('b', 'g1'), createEntity('c', 'g2'), createEntity('d')];
      const index = buildGroupIndex(entities);
      expect(index.size).toBe(2);
      expect(index.get('g1')).toEqual(new Set(['a', 'b']));
      expect(index.get('g2')).toEqual(new Set(['c']));
    });

    it('normalizes whitespace-padded groupIds', () => {
      const entities = [createEntity('a', ' g1 '), createEntity('b', 'g1')];
      const index = buildGroupIndex(entities);
      expect(index.size).toBe(1);
      expect(index.get('g1')).toEqual(new Set(['a', 'b']));
    });
  });

  describe('expandGroupedSelection with groupIndex', () => {
    it('produces the same result as the non-indexed path', () => {
      const entities = [createEntity('rect-1', 'group-a'), createEntity('rect-2', 'group-a'), createEntity('rect-3')];
      const index = buildGroupIndex(entities);

      const withoutIndex = expandGroupedSelection(entities, ['rect-2']);
      const withIndex = expandGroupedSelection(entities, ['rect-2'], index);

      expect(withIndex).toEqual(withoutIndex);
    });

    it('filters out entity ids not in the provided entities array', () => {
      const allEntities = [createEntity('a', 'g1'), createEntity('b', 'g1'), createEntity('c', 'g1')];
      const index = buildGroupIndex(allEntities);

      // Only pass a subset as "editable" entities
      const editableEntities = [createEntity('a', 'g1'), createEntity('b', 'g1')];
      const result = expandGroupedSelection(editableEntities, ['a'], index);

      expect(result).toEqual(['a', 'b']);
      expect(result).not.toContain('c');
    });

    it('handles selection of multiple groups via index', () => {
      const entities = [
        createEntity('a', 'g1'),
        createEntity('b', 'g1'),
        createEntity('c', 'g2'),
        createEntity('d', 'g2'),
        createEntity('e'),
      ];
      const index = buildGroupIndex(entities);

      const result = expandGroupedSelection(entities, ['a', 'c'], index);
      expect(result).toEqual(expect.arrayContaining(['a', 'c', 'b', 'd']));
      expect(result).not.toContain('e');
    });
  });

  it('drops invalid and singleton group ids during normalization', () => {
    const entities = [
      createEntity('rect-1', ' group-a '),
      createEntity('rect-2', 'group-a'),
      createEntity('rect-3', 'group-b'),
      { ...createEntity('rect-4'), meta: { groupId: '   ' } },
    ];

    const normalized = normalizeEntityGroupMemberships(entities);

    expect(getEntityGroupId(normalized[0])).toBe('group-a');
    expect(getEntityGroupId(normalized[1])).toBe('group-a');
    expect(getEntityGroupId(normalized[2])).toBeNull();
    expect(getEntityGroupId(normalized[3])).toBeNull();
  });
});
