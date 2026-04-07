import { describe, expect, it } from 'vitest';
import { getJointTypeEntry, getAllJointTypes } from '../../jointRegistry';

describe('jointRegistry', () => {
  it('returns all 7 registered joint types', () => {
    const allTypes = getAllJointTypes();
    expect(allTypes).toHaveLength(7);
    expect(allTypes.map((e) => e.type).sort()).toEqual([
      'butt',
      'dado',
      'dowel',
      'mortise_tenon',
      'pocket_screw',
      'rabbet',
      'tab_slot',
    ]);
  });

  it('looks up each type by key', () => {
    expect(getJointTypeEntry('butt').type).toBe('butt');
    expect(getJointTypeEntry('dado').type).toBe('dado');
    expect(getJointTypeEntry('rabbet').type).toBe('rabbet');
    expect(getJointTypeEntry('mortise_tenon').type).toBe('mortise_tenon');
    expect(getJointTypeEntry('dowel').type).toBe('dowel');
    expect(getJointTypeEntry('pocket_screw').type).toBe('pocket_screw');
    expect(getJointTypeEntry('tab_slot').type).toBe('tab_slot');
  });

  it('falls back to butt for unknown types', () => {
    expect(getJointTypeEntry('nonexistent').type).toBe('butt');
    expect(getJointTypeEntry(undefined).type).toBe('butt');
    expect(getJointTypeEntry(null).type).toBe('butt');
  });

  it('every entry has required methods', () => {
    for (const entry of getAllJointTypes()) {
      expect(typeof entry.normalizeParameters).toBe('function');
      expect(typeof entry.computeDefaults).toBe('function');
      expect(typeof entry.validate).toBe('function');
      expect(typeof entry.buildGeometry).toBe('function');
    }
  });

  it('every entry has fabrication metadata', () => {
    for (const entry of getAllJointTypes()) {
      expect(entry.fabrication).toBeDefined();
      expect(typeof entry.fabrication.process).toBe('string');
      expect(typeof entry.fabrication.operationKind).toBe('string');
    }
  });

  it('every entry has manufacturing metadata', () => {
    for (const entry of getAllJointTypes()) {
      expect(typeof entry.strength).toBe('string');
      expect(typeof entry.difficulty).toBe('string');
      expect(typeof entry.minThickness).toBe('number');
      expect(Array.isArray(entry.materials)).toBe(true);
    }
  });

  it('every entry has a summary function', () => {
    for (const entry of getAllJointTypes()) {
      expect(typeof entry.summary).toBe('function');
    }
  });

  it('every entry has a supportsAutoOverlapDepth boolean', () => {
    for (const entry of getAllJointTypes()) {
      expect(typeof entry.supportsAutoOverlapDepth).toBe('boolean');
    }
  });

  it('supportsAutoOverlapDepth matches expected values per type', () => {
    expect(getJointTypeEntry('butt').supportsAutoOverlapDepth).toBe(false);
    expect(getJointTypeEntry('dado').supportsAutoOverlapDepth).toBe(true);
    expect(getJointTypeEntry('rabbet').supportsAutoOverlapDepth).toBe(true);
    expect(getJointTypeEntry('mortise_tenon').supportsAutoOverlapDepth).toBe(true);
    expect(getJointTypeEntry('dowel').supportsAutoOverlapDepth).toBe(false);
    expect(getJointTypeEntry('pocket_screw').supportsAutoOverlapDepth).toBe(false);
    expect(getJointTypeEntry('tab_slot').supportsAutoOverlapDepth).toBe(true);
  });

  it('summary returns a string for each type', () => {
    const mockJoint = {
      sourcePartId: 'part-a',
      targetPartId: 'part-b',
      parameters: { width: 50, depth: 10, offset: 0, count: 3, tabWidth: 20 },
    };

    for (const entry of getAllJointTypes()) {
      const result = entry.summary(mockJoint);
      expect(typeof result).toBe('string');
      expect(result).toContain('part-a');
      expect(result).toContain('part-b');
    }
  });
});
