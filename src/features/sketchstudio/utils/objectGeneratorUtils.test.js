import { describe, expect, it } from 'vitest';
import {
  applyGeneratedPartsToObjectDraft,
  generateCabinetBoxObjectParts,
  generateShelvingUnitObjectParts,
} from './objectGeneratorUtils';

describe('objectGeneratorUtils', () => {
  it('generates cabinet box parts with side, top, bottom, back, and shelves', () => {
    const parts = generateCabinetBoxObjectParts({
      width: 1200,
      height: 900,
      depth: 450,
      thickness: 18,
      shelfCount: 2,
      material: 'plywood',
    });

    expect(parts.map((part) => part.name)).toEqual([
      'Left Side Panel',
      'Right Side Panel',
      'Top Panel',
      'Bottom Panel',
      'Back Panel',
      'Shelf 1',
      'Shelf 2',
    ]);
  });

  it('generates a shelving unit without a back panel', () => {
    const parts = generateShelvingUnitObjectParts({
      width: 900,
      height: 2000,
      depth: 350,
      thickness: 18,
      shelfCount: 4,
    });

    expect(parts.some((part) => part.name === 'Back Panel')).toBe(false);
    expect(parts.filter((part) => part.role === 'shelf').length).toBeGreaterThan(1);
  });

  it('applies generated parts into an object draft', () => {
    const result = applyGeneratedPartsToObjectDraft({
      id: 'object-1',
      defaults: { thickness: 18, material: 'plywood' },
      bounds: { width: 0, depth: 0, height: 0 },
      parts: [],
    }, 'cabinetBox', {
      width: 800,
      height: 900,
      depth: 400,
      thickness: 18,
      shelfCount: 1,
    });

    expect(result.generator.type).toBe('cabinetBox');
    expect(result.parts.length).toBe(6);
    expect(result.bounds.width).toBe(800);
  });
});
