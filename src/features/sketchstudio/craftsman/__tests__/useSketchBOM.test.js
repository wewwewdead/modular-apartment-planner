import { describe, expect, it } from 'vitest';
import { groupBomRows } from '../../utils/bomUtils';
import { computeRowCost } from '../../utils/materialCostUtils';
import { entitiesToBomRows } from '../utils/entityBomAdapter';
import materials, { buildMaterialPricingDict } from '../data/materials';

const materialCatalogById = Object.fromEntries(materials.map((m) => [m.id, m]));
const materialPricing = buildMaterialPricingDict();

/**
 * Replicate the useSketchBOM pipeline without React:
 * entitiesToBomRows → groupBomRows → computeRowCost → accumulate totals
 */
function runBomPipeline(entities) {
  const rawRows = entitiesToBomRows(entities, materialCatalogById);
  const grouped = groupBomRows(rawRows);

  let totalCost = 0;
  const costByMaterial = {};

  const bomRows = grouped.map((row) => {
    const cost = computeRowCost(row, materialPricing);
    totalCost += cost.totalCost;
    if (row.material) {
      costByMaterial[row.material] = (costByMaterial[row.material] || 0) + cost.totalCost;
    }
    return { ...row, area: cost.area, unitCost: cost.unitCost, totalCost: cost.totalCost };
  });

  return { bomRows, totalCost, costByMaterial };
}

describe('useSketchBOM pipeline', () => {
  it('returns empty results for no entities', () => {
    const { bomRows, totalCost, costByMaterial } = runBomPipeline([]);
    expect(bomRows).toHaveLength(0);
    expect(totalCost).toBe(0);
    expect(Object.keys(costByMaterial)).toHaveLength(0);
  });

  it('groups identical parts and sums quantity', () => {
    const entities = [
      { id: 'r1', type: 'rect', materialId: 'birch-plywood-18', width: 600, height: 400 },
      { id: 'r2', type: 'rect', materialId: 'birch-plywood-18', width: 600, height: 400 },
    ];
    const { bomRows } = runBomPipeline(entities);
    expect(bomRows).toHaveLength(1);
    expect(bomRows[0].quantity).toBe(2);
  });

  it('calculates cost correctly for perM2 material', () => {
    // birch-plywood-18: pricePerM2 = 45
    const entities = [
      { id: 'r1', type: 'rect', materialId: 'birch-plywood-18', width: 1000, height: 1000 },
    ];
    const { bomRows, totalCost } = runBomPipeline(entities);
    // 1000mm x 1000mm = 1m², cost = 1 * 45 = $45
    expect(bomRows).toHaveLength(1);
    expect(totalCost).toBeCloseTo(45, 1);
  });

  it('breaks down cost by material', () => {
    const entities = [
      { id: 'r1', type: 'rect', materialId: 'birch-plywood-18', width: 1000, height: 1000 },
      { id: 'r2', type: 'rect', materialId: 'mdf-18', width: 1000, height: 1000 },
    ];
    const { costByMaterial } = runBomPipeline(entities);
    expect(costByMaterial['birch-plywood-18']).toBeGreaterThan(0);
    expect(costByMaterial['mdf-18']).toBeGreaterThan(0);
    expect(Object.keys(costByMaterial)).toHaveLength(2);
  });

  it('ignores entities without materialId', () => {
    const entities = [
      { id: 'r1', type: 'rect', width: 600, height: 400 },
      { id: 'r2', type: 'rect', materialId: 'birch-plywood-18', width: 600, height: 400 },
    ];
    const { bomRows } = runBomPipeline(entities);
    expect(bomRows).toHaveLength(1);
  });
});
