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
    it('returns true for a rect with a material assignment', () => {
      expect(isEntityBomEligible({ type: 'rect', materialId: 'birch-plywood-18' })).toBe(true);
    });

    it('returns false for unsupported or unassigned entities', () => {
      expect(isEntityBomEligible({ type: 'rect' })).toBe(false);
      expect(isEntityBomEligible({ type: 'dimension', materialId: 'x' })).toBe(false);
      expect(isEntityBomEligible({ type: 'text', materialId: 'x' })).toBe(false);
      expect(isEntityBomEligible(null)).toBe(false);
    });
  });

  describe('entityToBomRow', () => {
    it('converts rect entities to exact BOM rows', () => {
      const row = entityToBomRow({ id: 'r1', type: 'rect', materialId: 'birch-plywood-18', width: 600, height: 400 }, catalog);

      expect(row).toMatchObject({
        partName: 'Panel',
        material: 'birch-plywood-18',
        width: 600,
        height: 400,
        thickness: 18,
        areaMm2: 240000,
        stockLength: 2000,
        dimensionAccuracy: 'exact',
      });
    });

    it('supports real sketch circle entities that store radius as "r"', () => {
      const row = entityToBomRow({ id: 'c1', type: 'circle', materialId: 'birch-plywood-18', cx: 0, cy: 0, r: 50 }, catalog);

      expect(row.width).toBe(100);
      expect(row.height).toBe(100);
      expect(row.areaMm2).toBeCloseTo(Math.PI * 2500, 2);
      expect(row.stockLength).toBeCloseTo(Math.PI * 100, 2);
      expect(row.dimensionAccuracy).toBe('exact');
    });

    it('keeps exact stock length metadata for linear line entities', () => {
      const row = entityToBomRow({ id: 'l1', type: 'line', materialId: 'steel-sq-25', x1: 0, y1: 0, x2: 300, y2: 400 }, catalog);

      expect(row).toMatchObject({
        width: 500,
        height: 25,
        stockLength: 500,
        stockSectionWidth: 25,
        costBasis: 'perLinearMeter',
        stockKind: 'linear',
        dimensionAccuracy: 'exact',
      });
    });

    it('marks closed polyline dimensions as approximate while preserving exact area/length', () => {
      const row = entityToBomRow({
        id: 'p1',
        type: 'polyline',
        materialId: 'birch-plywood-18',
        closed: true,
        points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }],
      }, catalog);

      expect(row.width).toBe(200);
      expect(row.height).toBe(100);
      expect(row.areaMm2).toBe(20000);
      expect(row.stockLength).toBe(600);
      expect(row.dimensionAccuracy).toBe('approximate');
      expect(row.dimensionNote).toContain('bounding-box');
    });

    it('returns null for non-eligible entities', () => {
      expect(entityToBomRow({ type: 'text', materialId: 'x' }, catalog)).toBeNull();
    });
  });

  describe('entitiesToBomRows', () => {
    it('filters out non-eligible entities', () => {
      const rows = entitiesToBomRows([
        { id: 'r1', type: 'rect', materialId: 'birch-plywood-18', width: 100, height: 100 },
        { id: 'd1', type: 'dimension' },
        { id: 'r2', type: 'rect', materialId: 'birch-plywood-18', width: 200, height: 200 },
      ], catalog);

      expect(rows).toHaveLength(2);
    });
  });
});
