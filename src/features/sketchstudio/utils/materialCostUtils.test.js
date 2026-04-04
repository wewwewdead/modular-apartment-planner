import { describe, it, expect } from 'vitest';
import {
  computePartArea,
  computeRowCost,
  computeCostSummary,
  createMaterialPricing,
} from './materialCostUtils';

describe('computePartArea', () => {
  it('computes area in m² from mm dimensions', () => {
    const part = { width: 1000, height: 500 };
    const area = computePartArea(part);
    expect(area).toBeCloseTo(0.5, 4); // 1000*500 mm² = 0.5 m²
  });

  it('uses parametric dimensions as fallback', () => {
    const part = { parametric: { width: 2000, height: 1000 } };
    const area = computePartArea(part);
    expect(area).toBeCloseTo(2.0, 4);
  });

  it('returns 0 for missing dimensions', () => {
    expect(computePartArea({})).toBe(0);
  });
});

describe('createMaterialPricing', () => {
  it('creates pricing entry', () => {
    const p = createMaterialPricing('plywood', 25, 'perM2');
    expect(p.material).toBe('plywood');
    expect(p.unitCost).toBe(25);
    expect(p.costBasis).toBe('perM2');
  });

  it('defaults to perM2', () => {
    const p = createMaterialPricing('oak', 50);
    expect(p.costBasis).toBe('perM2');
  });
});

describe('computeRowCost', () => {
  it('computes perM2 cost', () => {
    const row = { material: 'plywood', width: 1000, height: 500, quantity: 2 };
    const pricing = { plywood: { unitCost: 20, costBasis: 'perM2' } };
    const result = computeRowCost(row, pricing);
    expect(result.area).toBeCloseTo(0.5, 4);
    expect(result.totalCost).toBeCloseTo(20, 1); // 0.5 m² * 20 $/m² * 2
    expect(result.costAccuracy).toBe('approximate');
  });

  it('computes perPiece cost', () => {
    const row = { material: 'hardware', width: 100, height: 100, quantity: 4 };
    const pricing = { hardware: { unitCost: 5, costBasis: 'perPiece' } };
    const result = computeRowCost(row, pricing);
    expect(result.totalCost).toBe(20); // 5 * 4
    expect(result.costBasis).toBe('perPiece');
  });

  it('returns zero for missing pricing', () => {
    const row = { material: 'unknown', width: 100, height: 100, quantity: 1 };
    const result = computeRowCost(row, {});
    expect(result.totalCost).toBe(0);
  });

  it('computes perLinearMeter cost using longest dimension', () => {
    const row = { material: 'pine', width: 2400, height: 45, quantity: 2 };
    const pricing = { pine: { unitCost: 1.20, costBasis: 'perLinearMeter' } };
    const result = computeRowCost(row, pricing);
    // max(2400, 45) = 2400mm = 2.4m * 1.20 * 2 = 5.76
    expect(result.totalCost).toBeCloseTo(5.76, 2);
    expect(result.costBasis).toBe('perLinearMeter');
    expect(result.costAccuracy).toBe('approximate');
  });

  it('perLinearMeter with single quantity', () => {
    const row = { material: 'oak', width: 1000, height: 95, quantity: 1 };
    const pricing = { oak: { unitCost: 12.00, costBasis: 'perLinearMeter' } };
    const result = computeRowCost(row, pricing);
    // max(1000, 95) = 1000mm = 1.0m * 12.00 * 1 = 12.00
    expect(result.totalCost).toBeCloseTo(12.0, 2);
  });

  it('uses exact geometry area when provided for irregular sheet parts', () => {
    const row = { material: 'plywood', width: 200, height: 100, areaMm2: 15000, quantity: 1 };
    const pricing = { plywood: { unitCost: 20, costBasis: 'perM2' } };
    const result = computeRowCost(row, pricing);

    expect(result.area).toBeCloseTo(0.015, 4);
    expect(result.totalCost).toBeCloseTo(0.3, 4);
    expect(result.costAccuracy).toBe('exact');
    expect(result.costNote).toContain('exact geometry area');
  });

  it('uses exact stock length when provided for irregular linear parts', () => {
    const row = { material: 'steel', width: 100, height: 50, stockLength: 350, quantity: 2 };
    const pricing = { steel: { unitCost: 10, costBasis: 'perLinearMeter' } };
    const result = computeRowCost(row, pricing);

    expect(result.totalCost).toBeCloseTo(7, 4);
    expect(result.costAccuracy).toBe('exact');
    expect(result.costNote).toContain('exact cut length');
  });
});

describe('computeCostSummary', () => {
  it('aggregates costs from object draft', () => {
    const draft = {
      parts: [
        { id: 'p1', name: 'Panel', role: 'panel', material: 'plywood', width: 1000, height: 500, thickness: 18 },
        { id: 'p2', name: 'Panel', role: 'panel', material: 'plywood', width: 1000, height: 500, thickness: 18 },
      ],
      defaults: { material: 'plywood' },
    };
    const pricing = { plywood: { unitCost: 10, costBasis: 'perM2' } };
    const summary = computeCostSummary(draft, pricing);

    expect(summary.rows.length).toBeGreaterThan(0);
    expect(summary.totalCost).toBeGreaterThan(0);
    expect(summary.costByMaterial.plywood).toBeGreaterThan(0);
    expect(summary.totalArea).toBeGreaterThan(0);
  });

  it('returns zero for empty draft', () => {
    const summary = computeCostSummary({ parts: [] }, {});
    expect(summary.totalCost).toBe(0);
    expect(summary.rows).toHaveLength(0);
  });
});
