import { describe, expect, it } from 'vitest';
import { createRoofSystemForProject } from '@/domain/roofModels';
import { createTrussSystem } from '@/domain/trussModels';
import { buildTrussProfile } from './profile';
import { buildTrussInstanceWarnings, resolveCarriedCovering, suggestPurlinsFromCovering } from './trussAdvice';

function system(instance = {}, options = {}) {
  return createTrussSystem('Trusses', {
    id: 'ts_1',
    floorId: 'floor_1',
    ...options,
    trussInstances: [
      {
        id: 'ti_1',
        trussTypeId: 'truss_type_gable',
        span: 7200,
        rise: 1800,
        spacing: 900,
        count: 5,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 3600, y: 0 },
        ...instance,
      },
    ],
  });
}

function warningsFor(trussSystem, roofSystem = null) {
  const trussInstance = trussSystem.trussInstances[0];
  return buildTrussInstanceWarnings({
    trussSystem,
    trussInstance,
    profile: buildTrussProfile(trussInstance),
    roofSystem,
  });
}

describe('truss advice (spec §7.6)', () => {
  it('says nothing about a sound truss', () => {
    expect(warningsFor(system())).toEqual([]);
  });

  it('flags an overhang past the 750 mm eave limit', () => {
    expect(warningsFor(system({ overhangs: { start: 800, end: 0 } }))[0]).toContain('750 mm');
  });

  it('flags a flat truss shallower than span / 6.67', () => {
    const flat = system({ trussTypeId: 'truss_type_flat', rise: 600 });
    expect(warningsFor(flat).some((warning) => warning.includes('Span / depth'))).toBe(true);
    const deep = system({ trussTypeId: 'truss_type_flat', rise: 1000 });
    expect(warningsFor(deep)).toEqual([]);
  });

  it('applies the carried covering: truss spacing, purlin spacing and minimum pitch', () => {
    const base = system({ spacing: 1500, rise: 150 }, { purlinSystem: { enabled: true, spacing: 1500 } });
    const roofSystem = createRoofSystemForProject({ trussSystems: [base] }, { id: 'roof_1' });
    expect(resolveCarriedCovering(base, roofSystem).product.id).toBe('corrugated_042');
    const warnings = warningsFor(base, roofSystem);
    expect(warnings.some((warning) => warning.startsWith('Trusses at 1500 mm'))).toBe(true);
    expect(warnings.some((warning) => warning.startsWith('Purlins at 1500 mm'))).toBe(true);
    // 150 over a 3600 run is 2.4°, under corrugated's 5°.
    expect(warnings.some((warning) => warning.includes('below the 5.0° minimum'))).toBe(true);
    // A roof carried by another system does not count.
    expect(warningsFor(base, { ...roofSystem, trussAttachmentId: 'other' }).length).toBe(0);
  });

  it('suggests purlins for sheet, battens for tile, nothing for a deck', () => {
    expect(suggestPurlinsFromCovering({ kind: 'metal_corrugated', productId: 'corrugated_042' })).toEqual({
      enabled: true,
      role: 'purlin',
      spacing: 1200,
      width: 75,
      depth: 50,
    });
    const tile = suggestPurlinsFromCovering({ kind: 'concrete_tile', productId: '', coverWidth: 330 });
    expect(tile).toMatchObject({ role: 'batten', spacing: 330, width: 50, depth: 25 });
    expect(suggestPurlinsFromCovering({ kind: 'membrane', productId: '' })).toBeNull();
  });
});
