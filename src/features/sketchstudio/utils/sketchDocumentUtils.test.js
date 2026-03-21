import { describe, expect, it } from 'vitest';
import { normalizeCommittedSketchName } from './sketchDocumentUtils';

describe('sketchDocumentUtils', () => {
  it('preserves non-empty names after trimming', () => {
    expect(normalizeCommittedSketchName('  Kitchen Island  ')).toBe('Kitchen Island');
  });

  it('falls back to Untitled Sketch for empty names', () => {
    expect(normalizeCommittedSketchName('')).toBe('Untitled Sketch');
    expect(normalizeCommittedSketchName('   ')).toBe('Untitled Sketch');
  });
});
