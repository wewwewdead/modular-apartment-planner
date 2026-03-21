import { describe, it, expect } from 'vitest';
import {
  createPatternDefinition,
  expandPartPattern,
  expandFeaturePattern,
  applyPatterns,
  validatePattern,
} from './patternUtils';

describe('createPatternDefinition', () => {
  it('creates pattern with defaults', () => {
    const p = createPatternDefinition({ sourceId: 'part-1' });
    expect(p.id).toBeTruthy();
    expect(p.sourceId).toBe('part-1');
    expect(p.count).toBe(2);
    expect(p.spacing).toBe(100);
    expect(p.axis).toBe('x');
  });

  it('accepts custom values', () => {
    const p = createPatternDefinition({ sourceId: 'p', count: 5, spacing: 200, axis: 'z' });
    expect(p.count).toBe(5);
    expect(p.spacing).toBe(200);
    expect(p.axis).toBe('z');
  });
});

describe('expandPartPattern', () => {
  const source = {
    id: 'part-1',
    name: 'Shelf',
    parametric: { origin: { x: 10, y: 0, z: 50 }, anchor: { x: 10, y: 0 } },
    metadata: { generated: true },
  };

  it('generates correct number of copies', () => {
    const pattern = createPatternDefinition({ sourceId: 'part-1', count: 4, spacing: 100, axis: 'x' });
    const copies = expandPartPattern(source, pattern);
    expect(copies).toHaveLength(3); // count-1 copies
  });

  it('offsets along correct axis', () => {
    const pattern = createPatternDefinition({ sourceId: 'part-1', count: 3, spacing: 200, axis: 'z' });
    const copies = expandPartPattern(source, pattern);
    expect(copies[0].parametric.origin.z).toBe(250); // 50 + 200
    expect(copies[1].parametric.origin.z).toBe(450); // 50 + 400
    expect(copies[0].parametric.origin.x).toBe(10); // unchanged
  });

  it('sets pattern metadata', () => {
    const pattern = createPatternDefinition({ sourceId: 'part-1', count: 2, spacing: 100, axis: 'x' });
    const copies = expandPartPattern(source, pattern);
    expect(copies[0].metadata.patternGenerated).toBe(true);
    expect(copies[0].metadata.patternId).toBe(pattern.id);
    expect(copies[0].metadata.patternIndex).toBe(1);
  });

  it('returns empty for null source', () => {
    const pattern = createPatternDefinition({ count: 2 });
    expect(expandPartPattern(null, pattern)).toEqual([]);
  });
});

describe('expandFeaturePattern', () => {
  it('offsets circle features', () => {
    const source = { id: 'f-1', shape: 'circle', cx: 50, cy: 100, diameter: 10 };
    const pattern = createPatternDefinition({ sourceId: 'f-1', count: 3, spacing: 50, axis: 'x', sourceType: 'feature' });
    const copies = expandFeaturePattern(source, pattern);
    expect(copies).toHaveLength(2);
    expect(copies[0].cx).toBe(100);
    expect(copies[1].cx).toBe(150);
    expect(copies[0].cy).toBe(100); // y unchanged
  });

  it('offsets rect features', () => {
    const source = { id: 'f-2', shape: 'rect', x: 10, y: 20, width: 50, height: 30 };
    const pattern = createPatternDefinition({ sourceId: 'f-2', count: 2, spacing: 80, axis: 'y', sourceType: 'feature' });
    const copies = expandFeaturePattern(source, pattern);
    expect(copies[0].y).toBe(100);
    expect(copies[0].x).toBe(10);
  });
});

describe('applyPatterns', () => {
  it('expands and appends pattern copies', () => {
    const draft = {
      parts: [{ id: 'part-1', name: 'Shelf', parametric: { origin: { x: 0, y: 0, z: 0 } }, metadata: {} }],
      features: [],
    };
    const patterns = [createPatternDefinition({ sourceId: 'part-1', count: 3, spacing: 100, axis: 'x' })];
    const result = applyPatterns(draft, patterns);
    expect(result.parts).toHaveLength(3); // 1 original + 2 copies
  });

  it('removes old pattern instances on reapply', () => {
    const oldCopy = { id: 'old-copy', name: 'old', metadata: { patternGenerated: true, patternId: 'old-pat' } };
    const draft = {
      parts: [
        { id: 'part-1', name: 'Shelf', parametric: { origin: { x: 0, y: 0, z: 0 } }, metadata: {} },
        oldCopy,
      ],
      features: [],
    };
    const patterns = [createPatternDefinition({ sourceId: 'part-1', count: 2, spacing: 100, axis: 'x' })];
    const result = applyPatterns(draft, patterns);
    expect(result.parts.find((p) => p.id === 'old-copy')).toBeUndefined();
    expect(result.parts).toHaveLength(2); // source + 1 new copy
  });

  it('returns unchanged draft with no patterns', () => {
    const draft = { parts: [{ id: 'p1' }], features: [] };
    expect(applyPatterns(draft, [])).toBe(draft);
  });
});

describe('validatePattern', () => {
  it('valid pattern passes', () => {
    const draft = { parts: [{ id: 'part-1' }], features: [] };
    const pattern = createPatternDefinition({ sourceId: 'part-1' });
    expect(validatePattern(pattern, draft).valid).toBe(true);
  });

  it('detects missing source part', () => {
    const draft = { parts: [], features: [] };
    const pattern = createPatternDefinition({ sourceId: 'missing' });
    const result = validatePattern(pattern, draft);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not found');
  });

  it('detects missing source ID', () => {
    const pattern = createPatternDefinition({});
    const result = validatePattern(pattern, { parts: [], features: [] });
    expect(result.valid).toBe(false);
  });
});
