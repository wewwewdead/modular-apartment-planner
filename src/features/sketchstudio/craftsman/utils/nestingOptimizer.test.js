import { describe, expect, it } from 'vitest';
import { nestPartsOnSheets, optimizeCutList } from './nestingOptimizer';

describe('nestingOptimizer', () => {
  it('nests a single part on one sheet', () => {
    const rows = [{ partName: 'Panel', material: 'ply', materialName: 'Plywood', width: 500, height: 300, quantity: 1 }];
    const result = nestPartsOnSheets(rows);
    expect(result.totalSheets).toBe(1);
    expect(result.totalParts).toBe(1);
    expect(result.sheets[0].placements).toHaveLength(1);
    expect(result.sheets[0].wastePercent).toBeGreaterThan(0);
  });

  it('nests multiple identical parts on one sheet', () => {
    const rows = [{ partName: 'Shelf', material: 'ply', materialName: 'Plywood', width: 600, height: 300, quantity: 4 }];
    const result = nestPartsOnSheets(rows);
    expect(result.totalParts).toBe(4);
    expect(result.totalSheets).toBeGreaterThanOrEqual(1);
    expect(result.summary.efficiency).toBeGreaterThan(0);
  });

  it('separates materials onto different sheets', () => {
    const rows = [
      { partName: 'Side', material: 'oak', materialName: 'Oak', width: 500, height: 300, quantity: 1 },
      { partName: 'Back', material: 'ply', materialName: 'Plywood', width: 500, height: 300, quantity: 1 },
    ];
    const result = nestPartsOnSheets(rows);
    expect(result.totalSheets).toBe(2);
    expect(result.sheets[0].material).not.toBe(result.sheets[1].material);
  });

  it('handles empty BOM', () => {
    const result = nestPartsOnSheets([]);
    expect(result.totalSheets).toBe(0);
    expect(result.totalParts).toBe(0);
  });

  it('handles parts with zero dimensions', () => {
    const rows = [{ partName: 'Empty', material: 'ply', materialName: 'Plywood', width: 0, height: 0, quantity: 1 }];
    const result = nestPartsOnSheets(rows);
    expect(result.totalParts).toBe(0);
  });

  it('handles oversized parts', () => {
    const rows = [{ partName: 'Huge', material: 'ply', materialName: 'Plywood', width: 5000, height: 3000, quantity: 1 }];
    const result = nestPartsOnSheets(rows);
    expect(result.totalSheets).toBe(1);
    expect(result.sheets[0].oversized).toBe(true);
  });

  it('respects custom sheet size', () => {
    const rows = [{ partName: 'Panel', material: 'ply', materialName: 'Plywood', width: 500, height: 500, quantity: 1 }];
    const result = nestPartsOnSheets(rows, { sheetSize: { width: 1000, height: 1000 } });
    expect(result.summary.sheetSize).toBe('1000 x 1000mm');
  });

  it('produces valid summary statistics', () => {
    const rows = [{ partName: 'Panel', material: 'ply', materialName: 'Plywood', width: 1000, height: 500, quantity: 2 }];
    const result = nestPartsOnSheets(rows);
    expect(result.summary.sheetsNeeded).toBeGreaterThanOrEqual(1);
    expect(result.summary.efficiency).toBeGreaterThan(0);
    expect(result.summary.efficiency).toBeLessThanOrEqual(100);
    expect(result.summary.wastePercent).toBeGreaterThanOrEqual(0);
  });
});

describe('optimizeCutList', () => {
  it('packs linear stock against catalog stick lengths', () => {
    const rows = [
      {
        partName: 'Rail',
        material: 'steel-sq-25',
        materialName: 'Steel SQ Tube 25x25x1.5mm',
        width: 1200,
        height: 25,
        quantity: 6,
        costBasis: 'perLinearMeter',
        stockKind: 'linear',
        defaultStockWidth: 25,
        defaultStockLength: 6000,
      },
      {
        partName: 'Leg',
        material: 'steel-sq-25',
        materialName: 'Steel SQ Tube 25x25x1.5mm',
        width: 900,
        height: 25,
        quantity: 4,
        costBasis: 'perLinearMeter',
        stockKind: 'linear',
        defaultStockWidth: 25,
        defaultStockLength: 6000,
      },
      {
        partName: 'Brace',
        material: 'steel-sq-25',
        materialName: 'Steel SQ Tube 25x25x1.5mm',
        width: 500,
        height: 25,
        quantity: 4,
        costBasis: 'perLinearMeter',
        stockKind: 'linear',
        defaultStockWidth: 25,
        defaultStockLength: 6000,
      },
    ];

    const result = optimizeCutList(rows);
    const group = result.groups[0];

    expect(result.summary.linear?.sticksNeeded).toBe(3);
    expect(group.stockKind).toBe('linear');
    expect(group.units).toHaveLength(3);
    expect(group.summary.usedLengthM).toBeCloseTo(12.8, 2);
    expect(group.summary.leftoverLengthM).toBeCloseTo(5.17, 2);
    expect(group.summary.efficiency).toBe(71);
  });

  it('flags oversized linear cuts', () => {
    const rows = [{
      partName: 'Long Rail',
      material: 'steel-sq-25',
      materialName: 'Steel SQ Tube 25x25x1.5mm',
      width: 6500,
      height: 25,
      quantity: 1,
      costBasis: 'perLinearMeter',
      stockKind: 'linear',
      defaultStockWidth: 25,
      defaultStockLength: 6000,
    }];

    const result = optimizeCutList(rows);
    const group = result.groups[0];

    expect(group.summary.oversizedCount).toBe(1);
    expect(group.units[0].oversized).toBe(true);
    expect(group.units[0].oversizeBy).toBe(500);
  });

  it('respects per-material stock length overrides for linear stock', () => {
    const rows = [{
      partName: 'Rail',
      material: 'steel-sq-25',
      materialName: 'Steel SQ Tube 25x25x1.5mm',
      width: 1200,
      height: 25,
      quantity: 6,
      costBasis: 'perLinearMeter',
      stockKind: 'linear',
      defaultStockWidth: 25,
      defaultStockLength: 6000,
    }];

    const result = optimizeCutList(rows, {
      linearStockLengths: { 'steel-sq-25': 3000 },
    });

    expect(result.summary.linear?.sticksNeeded).toBe(3);
    expect(result.groups[0].stockSpec.length).toBe(3000);
  });

  it('separates sheet and linear stock into different groups', () => {
    const rows = [
      {
        partName: 'Panel',
        material: 'ply',
        materialName: 'Plywood',
        width: 500,
        height: 300,
        quantity: 2,
        costBasis: 'perM2',
        stockKind: 'sheet',
        defaultStockWidth: 2440,
        defaultStockLength: 1220,
      },
      {
        partName: 'Rail',
        material: 'steel-sq-25',
        materialName: 'Steel SQ Tube 25x25x1.5mm',
        width: 1200,
        height: 25,
        quantity: 2,
        costBasis: 'perLinearMeter',
        stockKind: 'linear',
        defaultStockWidth: 25,
        defaultStockLength: 6000,
      },
    ];

    const result = optimizeCutList(rows);

    expect(result.summary.sheet?.unitsNeeded).toBe(1);
    expect(result.summary.linear?.unitsNeeded).toBe(1);
    expect(result.groups.map((group) => group.stockKind)).toEqual(['sheet', 'linear']);
  });
});
