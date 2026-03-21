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
