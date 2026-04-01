import { describe, expect, it } from 'vitest';
import { nestPartsOnSheets } from './nestingOptimizer';

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
