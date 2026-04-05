import { describe, expect, it } from 'vitest';
import {
  OBJECT_TYPES,
  OBJECT_CATEGORIES,
  PART_ROLES,
  PART_KINDS,
  DEFAULT_OBJECT_TYPE,
  DEFAULT_CATEGORY,
} from './objectTypeConstants';

describe('objectTypeConstants', () => {
  it('OBJECT_TYPES has 4 entries', () => {
    expect(Object.keys(OBJECT_TYPES)).toHaveLength(4);
    expect(OBJECT_TYPES.ASSEMBLY).toBe('assembly');
    expect(OBJECT_TYPES.SINGLE_PART).toBe('single-part');
    expect(OBJECT_TYPES.FRAME).toBe('frame');
    expect(OBJECT_TYPES.PANEL_OBJECT).toBe('panel-object');
  });

  it('OBJECT_CATEGORIES has 5 entries', () => {
    expect(Object.keys(OBJECT_CATEGORIES)).toHaveLength(5);
    expect(OBJECT_CATEGORIES.CUSTOM).toBe('custom');
    expect(OBJECT_CATEGORIES.FURNITURE).toBe('furniture');
    expect(OBJECT_CATEGORIES.FIXTURE).toBe('fixture');
    expect(OBJECT_CATEGORIES.STORAGE).toBe('storage');
    expect(OBJECT_CATEGORIES.STRUCTURE).toBe('structure');
  });

  it('PART_ROLES has 16 entries', () => {
    expect(PART_ROLES).toHaveLength(16);
    expect(PART_ROLES).toContain('panel');
    expect(PART_ROLES).toContain('rail');
    expect(PART_ROLES).toContain('brace');
    expect(PART_ROLES).toContain('divider');
    expect(PART_ROLES).toContain('custom-profile');
  });

  it('PART_KINDS has 3 entries', () => {
    expect(Object.keys(PART_KINDS)).toHaveLength(3);
    expect(PART_KINDS.PANEL).toBe('panel');
    expect(PART_KINDS.RAIL).toBe('rail');
    expect(PART_KINDS.PROFILE).toBe('profile');
  });

  it('DEFAULT_OBJECT_TYPE is assembly', () => {
    expect(DEFAULT_OBJECT_TYPE).toBe('assembly');
  });

  it('DEFAULT_CATEGORY is custom', () => {
    expect(DEFAULT_CATEGORY).toBe('custom');
  });
});
