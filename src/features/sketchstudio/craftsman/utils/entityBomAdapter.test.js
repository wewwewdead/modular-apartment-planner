import { describe, expect, it } from 'vitest';
import { entityToBomRow, entitiesToBomRows, isEntityBomEligible } from './entityBomAdapter';

const catalog = {
  'birch-plywood-18': { id: 'birch-plywood-18', name: '18mm Birch Plywood', thickness: 18, pricePerM2: 45 },
  'steel-sq-25': {
    id: 'steel-sq-25',
    name: 'Steel SQ Tube 25x25x1.5mm',
    thickness: 1.5,
    defaultWidth: 25,
    defaultHeight: 6000,
    costBasis: 'perLinearMeter',
  },
};

describe('entityBomAdapter', () => {
  describe('isEntityBomEligible', () => {
    it('returns true for rect with materialId', () => {
      expect(isEntityBomEligible({ type: 'rect', materialId: 'birch-plywood-18' })).toBe(true);
    });

    it('returns false for rect without materialId', () => {
      expect(isEntityBomEligible({ type: 'rect' })).toBe(false);
    });

    it('returns false for dimension entities', () => {
      expect(isEntityBomEligible({ type: 'dimension', materialId: 'x' })).toBe(false);
    });

    it('returns false for text entities', () => {
      expect(isEntityBomEligible({ type: 'text', materialId: 'x' })).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isEntityBomEligible(null)).toBe(false);
      expect(isEntityBomEligible(undefined)).toBe(false);
    });
  });

  describe('entityToBomRow', () => {
    it('converts rect entity to BOM row', () => {
      const entity = { id: 'r1', type: 'rect', materialId: 'birch-plywood-18', width: 600, height: 400 };
      const row = entityToBomRow(entity, catalog);
      expect(row).toMatchObject({
        partName: 'Panel',
        material: 'birch-plywood-18',
        width: 600,
        height: 400,
        thickness: 18,
        quantity: 1,
      });
    });

    it('converts line entity to BOM row', () => {
      const entity = { id: 'l1', type: 'line', materialId: 'birch-plywood-18', x1: 0, y1: 0, x2: 300, y2: 400 };
      const row = entityToBomRow(entity, catalog);
      expect(row.width).toBe(500); // 3-4-5 triangle
      expect(row.partName).toBe('Strip');
    });

    it('uses stock metadata for linear material line entities', () => {
      const entity = { id: 'l2', type: 'line', materialId: 'steel-sq-25', x1: 0, y1: 0, x2: 1000, y2: 0 };
      const row = entityToBomRow(entity, catalog);
      expect(row).toMatchObject({
        width: 1000,
        height: 25,
        thickness: 1.5,
        costBasis: 'perLinearMeter',
        stockKind: 'linear',
        defaultStockWidth: 25,
        defaultStockLength: 6000,
      });
    });

    it('converts circle entity to BOM row', () => {
      const entity = { id: 'c1', type: 'circle', materialId: 'birch-plywood-18', radius: 50 };
      const row = entityToBomRow(entity, catalog);
      expect(row.width).toBe(100);
      expect(row.height).toBe(100);
      expect(row.partName).toBe('Disc');
    });

    it('returns null for non-eligible entity', () => {
      expect(entityToBomRow({ type: 'text', materialId: 'x' }, catalog)).toBeNull();
    });

    it('uses entity thickness override', () => {
      const entity = { id: 'r1', type: 'rect', materialId: 'birch-plywood-18', width: 100, height: 100, thickness: 25 };
      const row = entityToBomRow(entity, catalog);
      expect(row.thickness).toBe(25);
    });

    it('keeps wall thickness separate from stock width for linear materials', () => {
      const entity = { id: 'l3', type: 'line', materialId: 'steel-sq-25', x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 2 };
      const row = entityToBomRow(entity, catalog);
      expect(row.thickness).toBe(2);
      expect(row.height).toBe(25);
    });
  });

  describe('entitiesToBomRows', () => {
    it('filters out non-eligible entities', () => {
      const entities = [
        { id: 'r1', type: 'rect', materialId: 'birch-plywood-18', width: 100, height: 100 },
        { id: 'd1', type: 'dimension' },
        { id: 'r2', type: 'rect', materialId: 'birch-plywood-18', width: 200, height: 200 },
      ];
      const rows = entitiesToBomRows(entities, catalog);
      expect(rows).toHaveLength(2);
    });

    it('returns empty array for empty input', () => {
      expect(entitiesToBomRows([], catalog)).toHaveLength(0);
    });
  });
});
