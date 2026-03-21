import { describe, expect, it } from 'vitest';
import { getObjectDraftWarnings, isObjectExportReady, validateObjectDraft } from './validationUtils';

const validDraft = {
  name: 'Cabinet',
  footprint: {
    type: 'profile',
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }],
  },
  bounds: { width: 100, depth: 50, height: 900 },
  anchors: [{ id: 'anchor-origin', name: 'origin', x: 0, y: 0, kind: 'primary' }],
  parts: [{ id: 'part-1' }],
};

describe('validationUtils', () => {
  it('validates exportable object drafts', () => {
    expect(validateObjectDraft(validDraft).isValid).toBe(true);
    expect(isObjectExportReady(validDraft)).toBe(true);
  });

  it('reports missing export requirements', () => {
    const warnings = getObjectDraftWarnings({
      ...validDraft,
      name: '',
      anchors: [],
      bounds: { width: 100, depth: 50, height: 0 },
    });

    expect(warnings).toContain('Object name is required.');
    expect(warnings).toContain('Object height must be greater than 0.');
    expect(warnings).toContain('A primary anchor is required.');
  });
});
