import { describe, expect, it } from 'vitest';
import {
  registerGenerator,
  getGenerator,
  getAllGenerators,
  getGeneratorParamFields,
  getGeneratorDefaultParams,
  runGenerator,
} from './generatorRegistry';

describe('generatorRegistry', () => {
  it('getAllGenerators returns cabinetBox and shelvingUnit', () => {
    const generators = getAllGenerators();
    const ids = generators.map((g) => g.id);
    expect(ids).toContain('cabinetBox');
    expect(ids).toContain('shelvingUnit');
    expect(generators.length).toBeGreaterThanOrEqual(2);
  });

  it('getGenerator returns definition with all fields for known generator', () => {
    const gen = getGenerator('cabinetBox');
    expect(gen).not.toBeNull();
    expect(gen.id).toBe('cabinetBox');
    expect(gen.label).toBe('Cabinet Box');
    expect(gen.defaultParams).toBeTruthy();
    expect(typeof gen.generateParts).toBe('function');
    expect(Array.isArray(gen.paramFields)).toBe(true);
  });

  it('getGenerator returns null for unknown generator', () => {
    expect(getGenerator('nonexistent')).toBeNull();
  });

  it('getGeneratorParamFields returns expected fields for cabinetBox', () => {
    const fields = getGeneratorParamFields('cabinetBox');
    expect(fields.length).toBeGreaterThan(0);
    const keys = fields.map((f) => f.key);
    expect(keys).toContain('width');
    expect(keys).toContain('depth');
    expect(keys).toContain('height');
    expect(keys).toContain('thickness');
    expect(keys).toContain('shelfCount');
  });

  it('getGeneratorParamFields returns empty array for unknown', () => {
    expect(getGeneratorParamFields('nonexistent')).toEqual([]);
  });

  it('getGeneratorDefaultParams returns defaults for cabinetBox', () => {
    const params = getGeneratorDefaultParams('cabinetBox');
    expect(params.width).toBe(1200);
    expect(params.height).toBe(900);
    expect(params.depth).toBe(450);
  });

  it('getGeneratorDefaultParams returns empty object for unknown', () => {
    expect(getGeneratorDefaultParams('nonexistent')).toEqual({});
  });

  it('runGenerator produces parts array for cabinetBox', () => {
    const parts = runGenerator('cabinetBox', { width: 1200, height: 900, depth: 450, thickness: 18, shelfCount: 2 });
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts[0]).toHaveProperty('name');
    expect(parts[0]).toHaveProperty('role');
  });

  it('runGenerator returns null for unknown generator', () => {
    expect(runGenerator('nonexistent', {})).toBeNull();
  });

  it('registerGenerator adds custom generator retrievable by id', () => {
    registerGenerator({
      id: 'testCustom',
      label: 'Test Custom',
      defaultParams: { width: 100 },
      generateParts: (params) => [{ name: 'Test Part', width: params.width }],
      paramFields: [{ key: 'width', label: 'Width', type: 'number', step: 1 }],
    });

    const gen = getGenerator('testCustom');
    expect(gen).not.toBeNull();
    expect(gen.label).toBe('Test Custom');

    const parts = runGenerator('testCustom', { width: 200 });
    expect(parts).toEqual([{ name: 'Test Part', width: 200 }]);

    const all = getAllGenerators();
    expect(all.some((g) => g.id === 'testCustom')).toBe(true);
  });
});
