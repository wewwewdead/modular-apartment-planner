import { describe, it, expect } from 'vitest';
import {
  evenShelfPositions,
  validateShelfPositions,
  normalizeCabinetInternalsParams,
  generateCabinetInternalsParts,
} from './cabinetInternalsUtils';

describe('evenShelfPositions', () => {
  it('returns empty for zero shelves', () => {
    expect(evenShelfPositions(864, 0, 18)).toEqual([]);
  });

  it('returns evenly spaced positions', () => {
    const positions = evenShelfPositions(864, 2, 18);
    expect(positions).toHaveLength(2);
    expect(positions[0]).toBeCloseTo(279, 0);
    expect(positions[1]).toBeCloseTo(567, 0);
  });

  it('single shelf is centered', () => {
    const positions = evenShelfPositions(400, 1, 18);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toBeCloseTo(191, 0);
  });
});

describe('validateShelfPositions', () => {
  it('valid positions pass', () => {
    const result = validateShelfPositions([100, 300, 500], 864, 18);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects position exceeding inner height', () => {
    const result = validateShelfPositions([850], 864, 18);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds inner height');
  });

  it('detects overlapping shelves', () => {
    const result = validateShelfPositions([100, 110], 864, 18);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('overlap');
  });

  it('rejects non-array input', () => {
    const result = validateShelfPositions(null, 864, 18);
    expect(result.valid).toBe(false);
  });
});

describe('normalizeCabinetInternalsParams', () => {
  it('sets defaults', () => {
    const p = normalizeCabinetInternalsParams({});
    expect(p.width).toBe(1200);
    expect(p.dividerCount).toBe(0);
    expect(p.includeBackPanel).toBe(true);
    expect(p.shelfPositions).toBeNull();
  });

  it('passes through custom values', () => {
    const p = normalizeCabinetInternalsParams({
      width: 800,
      shelfPositions: [100, 200],
      dividerCount: 2,
      includeBackPanel: false,
    });
    expect(p.width).toBe(800);
    expect(p.shelfPositions).toEqual([100, 200]);
    expect(p.dividerCount).toBe(2);
    expect(p.includeBackPanel).toBe(false);
  });
});

describe('generateCabinetInternalsParts', () => {
  it('generates basic cabinet with back panel', () => {
    const parts = generateCabinetInternalsParts({ width: 600, height: 900, depth: 450, thickness: 18 });
    const names = parts.map((p) => p.name);
    expect(names).toContain('Left Side Panel');
    expect(names).toContain('Right Side Panel');
    expect(names).toContain('Top Panel');
    expect(names).toContain('Bottom Panel');
    expect(names).toContain('Back Panel');
  });

  it('excludes back panel when toggled off', () => {
    const parts = generateCabinetInternalsParts({ includeBackPanel: false });
    const names = parts.map((p) => p.name);
    expect(names).not.toContain('Back Panel');
  });

  it('generates dividers', () => {
    const parts = generateCabinetInternalsParts({ dividerCount: 2 });
    const dividers = parts.filter((p) => p.name.startsWith('Divider'));
    expect(dividers).toHaveLength(2);
  });

  it('uses custom shelf positions', () => {
    const parts = generateCabinetInternalsParts({ shelfPositions: [100, 400] });
    const shelves = parts.filter((p) => p.name.startsWith('Shelf'));
    expect(shelves).toHaveLength(2);
  });

  it('backward compat: evenly-spaced shelves with shelfCount', () => {
    const parts = generateCabinetInternalsParts({ shelfCount: 3 });
    const shelves = parts.filter((p) => p.name.startsWith('Shelf'));
    expect(shelves).toHaveLength(3);
  });

  it('all parts have generated metadata', () => {
    const parts = generateCabinetInternalsParts({});
    parts.forEach((part) => {
      expect(part.metadata.generated).toBe(true);
    });
  });
});
