import { describe, expect, it } from 'vitest';
import { groupBomRows } from '../../utils/bomUtils';
import { computeRowCost, createMaterialPricing } from '../../utils/materialCostUtils';
import { entitiesToBomRows } from '../utils/entityBomAdapter';
import { getMaterialStockKind } from '../utils/entityManufacturingGeometry';
import {
  DEFAULT_HARDWARE_ID_BY_FASTENER_KIND,
  HARDWARE_CATEGORY_ID,
  buildMaterialCatalogById,
  buildMaterialPricingDict,
  getBuiltInMaterials,
  getHardwareById,
  getHardwareItems,
  getMaterialUnitPrice,
  getStockMaterials,
  isHardwareMaterial,
  resolveHardwareIdForFastener,
} from '../data/materials';

const FASTENER_KINDS = new Set(['wood-screw', 'machine-bolt', 'pocket-screw', 'dowel', 'confirmat', 'threaded-insert']);
const PATTERN_KINDS = new Set(['hinge', 'handle']);

const builtInMaterials = getBuiltInMaterials();
const hardwareItems = getHardwareItems();
const materialCatalogById = buildMaterialCatalogById(builtInMaterials);

describe('hardware catalog', () => {
  it('ships a starter set of fasteners with a complete data contract', () => {
    expect(hardwareItems.length).toBeGreaterThanOrEqual(12);

    for (const item of hardwareItems) {
      expect(item.id.startsWith('hw-')).toBe(true);
      expect(item.category).toBe(HARDWARE_CATEGORY_ID);
      expect(item.costBasis).toBe('perPiece');
      expect(item.pricePerPiece).toBeGreaterThan(0);
      expect(typeof item.name).toBe('string');
      expect(item.color).toMatch(/^#[0-9a-fA-F]{6}$/);

      // Every item is exactly one of: a fastener (single pilot hole) or
      // pattern hardware (multi-hole boring pattern).
      expect(Boolean(item.fastener) !== Boolean(item.pattern)).toBe(true);

      if (item.pattern) {
        expect(PATTERN_KINDS.has(item.pattern.kind)).toBe(true);
        expect(['edge', 'center']).toContain(item.pattern.anchor);
        expect(typeof item.pattern.summary).toBe('string');
        expect(item.pattern.holes.length).toBeGreaterThan(0);

        for (const hole of item.pattern.holes) {
          expect(Number.isFinite(hole.along)).toBe(true);
          expect(Number.isFinite(hole.inset)).toBe(true);
          expect(hole.diameter).toBeGreaterThan(0);
          if (hole.through !== true) {
            expect(hole.depth).toBeGreaterThan(0);
          }
        }
        continue;
      }

      expect(FASTENER_KINDS.has(item.fastener.kind)).toBe(true);
      expect(item.fastener.shankDiameter).toBeGreaterThan(0);
      expect(item.fastener.pilotDiameter).toBeGreaterThan(0);
      expect(item.fastener.headDiameter).toBeGreaterThan(0);
      expect(item.fastener.length).toBeGreaterThan(0);
      expect(typeof item.fastener.countersink).toBe('boolean');
    }
  });

  it('covers every fastener kind and keeps ids unique', () => {
    const kinds = new Set(hardwareItems.filter((item) => item.fastener).map((item) => item.fastener.kind));
    expect([...FASTENER_KINDS].every((kind) => kinds.has(kind))).toBe(true);

    const patternKinds = new Set(hardwareItems.filter((item) => item.pattern).map((item) => item.pattern.kind));
    expect([...PATTERN_KINDS].every((kind) => patternKinds.has(kind))).toBe(true);

    const ids = builtInMaterials.map((material) => material.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every default hardware id per kind', () => {
    for (const [kind, id] of Object.entries(DEFAULT_HARDWARE_ID_BY_FASTENER_KIND)) {
      const item = getHardwareById(id);
      expect(item, `${kind} default ${id}`).not.toBeNull();
      expect(item.fastener.kind).toBe(kind);
      expect(resolveHardwareIdForFastener(kind)).toBe(id);
    }

    expect(resolveHardwareIdForFastener('not-a-kind')).toBeNull();
    expect(resolveHardwareIdForFastener(null)).toBeNull();
  });

  it('matches diameter-sized hardware to the nearest catalog size', () => {
    expect(resolveHardwareIdForFastener('dowel', 6.2)).toBe('hw-dowel-6-30');
    expect(resolveHardwareIdForFastener('dowel', 8)).toBe('hw-dowel-8-35');
    expect(resolveHardwareIdForFastener('dowel', 11)).toBe('hw-dowel-10-40');
    expect(resolveHardwareIdForFastener('dowel', 0)).toBe(DEFAULT_HARDWARE_ID_BY_FASTENER_KIND.dowel);
  });

  it('keeps hardware out of the stock material list', () => {
    expect(getStockMaterials().some(isHardwareMaterial)).toBe(false);
    expect(getStockMaterials().length + hardwareItems.length).toBe(builtInMaterials.length);
    expect(isHardwareMaterial({ category: 'plywood' })).toBe(false);
    expect(isHardwareMaterial(null)).toBe(false);
  });

  it('reports hardware as piece stock so it is never nested', () => {
    expect(getMaterialStockKind(getHardwareById('hw-dowel-8-35'))).toBe('piece');
    expect(getMaterialStockKind(materialCatalogById['birch-plywood-18'])).toBe('sheet');
    expect(getMaterialStockKind(materialCatalogById['steel-sq-25'])).toBe('linear');
  });
});

describe('perPiece pricing', () => {
  it('maps unitCost from pricePerPiece for perPiece materials', () => {
    const pricing = buildMaterialPricingDict(builtInMaterials);

    expect(pricing['hw-pocket-screw-32-coarse']).toEqual({ unitCost: 0.12, costBasis: 'perPiece' });
    expect(pricing['hw-dowel-8-35']).toEqual({ unitCost: 0.07, costBasis: 'perPiece' });
  });

  it('keeps the existing pricePerM2 mapping for area and linear stock', () => {
    const pricing = buildMaterialPricingDict(builtInMaterials);

    expect(pricing['birch-plywood-18']).toEqual({ unitCost: 45, costBasis: 'perM2' });
    expect(pricing['steel-sq-25'].costBasis).toBe('perLinearMeter');
    expect(pricing['steel-sq-25'].unitCost).toBe(materialCatalogById['steel-sq-25'].pricePerM2);
  });

  it('accepts custom perPiece materials, which keep their unit price in pricePerM2', () => {
    const custom = { id: 'custom-knob', costBasis: 'perPiece', pricePerM2: 2.5, isCustom: true };

    expect(getMaterialUnitPrice(custom)).toBe(2.5);
    expect(buildMaterialPricingDict([custom])['custom-knob']).toEqual({ unitCost: 2.5, costBasis: 'perPiece' });
  });
});

describe('hardware row costing', () => {
  const pricing = buildMaterialPricingDict(builtInMaterials);

  function createPlacedFastener(id, hardwareId) {
    return {
      id,
      type: 'feature',
      featureType: 'hole',
      shape: 'circle',
      cx: 0,
      cy: 0,
      diameter: 3,
      hardwareId,
    };
  }

  it('costs a single fastener at its unit price', () => {
    const [row] = entitiesToBomRows([createPlacedFastener('f1', 'hw-bolt-m8-50')], materialCatalogById);
    const cost = computeRowCost(row, pricing);

    expect(cost).toMatchObject({ unitCost: 0.7, totalCost: 0.7, costBasis: 'perPiece', costAccuracy: 'exact' });
  });

  it('groups identical fasteners and multiplies cost by quantity', () => {
    const rows = groupBomRows(
      entitiesToBomRows(
        [
          createPlacedFastener('f1', 'hw-screw-8-40'),
          createPlacedFastener('f2', 'hw-screw-8-40'),
          createPlacedFastener('f3', 'hw-screw-8-40'),
          createPlacedFastener('f4', 'hw-dowel-6-30'),
        ],
        materialCatalogById,
      ),
    );

    expect(rows).toHaveLength(2);

    const screws = rows.find((row) => row.material === 'hw-screw-8-40');
    expect(screws.quantity).toBe(3);
    expect(computeRowCost(screws, pricing).totalCost).toBeCloseTo(0.27, 6);
  });

  it('falls back to a zero unit cost for an unknown hardware id', () => {
    const [row] = entitiesToBomRows([createPlacedFastener('f1', 'hw-not-in-catalog')], materialCatalogById);

    expect(row.partName).toBe('hw-not-in-catalog');
    expect(computeRowCost(row, pricing).totalCost).toBe(0);
  });

  it('honours an explicit perPiece pricing override', () => {
    const [row] = entitiesToBomRows([createPlacedFastener('f1', 'hw-screw-8-40')], materialCatalogById);
    const override = { 'hw-screw-8-40': createMaterialPricing('hw-screw-8-40', 0.5, 'perPiece') };

    expect(computeRowCost({ ...row, quantity: 4 }, override).totalCost).toBe(2);
  });
});
