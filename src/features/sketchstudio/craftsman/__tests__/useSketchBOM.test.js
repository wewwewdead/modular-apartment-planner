import { describe, expect, it } from 'vitest';
import { getBomRowGroupKey, groupBomRows } from '../../utils/bomUtils';
import { computeRowCost } from '../../utils/materialCostUtils';
import { entitiesToBomRows } from '../utils/entityBomAdapter';
import materials, { buildMaterialPricingDict } from '../data/materials';

const materialCatalogById = Object.fromEntries(materials.map((material) => [material.id, material]));
const materialPricing = buildMaterialPricingDict();

function runBomPipeline(entities) {
  const rawRows = entitiesToBomRows(entities, materialCatalogById);
  const grouped = groupBomRows(rawRows);

  const entityIdsByKey = new Map();
  rawRows.forEach((row) => {
    const key = getBomRowGroupKey(row);
    const ids = entityIdsByKey.get(key);
    if (ids) {
      ids.push(row.partId);
    } else {
      entityIdsByKey.set(key, [row.partId]);
    }
  });

  let totalCost = 0;
  const costByMaterial = {};

  const bomRows = grouped.map((row) => {
    const cost = computeRowCost(row, materialPricing);
    totalCost += cost.totalCost;
    if (row.material) {
      costByMaterial[row.material] = (costByMaterial[row.material] || 0) + cost.totalCost;
    }

    return {
      ...row,
      entityIds: entityIdsByKey.get(getBomRowGroupKey(row)) || [],
      ...cost,
      costBasis: row.costBasis ?? cost.costBasis,
    };
  });

  return { bomRows, totalCost, costByMaterial };
}

describe('useSketchBOM pipeline', () => {
  it('returns empty results for no entities', () => {
    const result = runBomPipeline([]);
    expect(result.bomRows).toHaveLength(0);
    expect(result.totalCost).toBe(0);
    expect(Object.keys(result.costByMaterial)).toHaveLength(0);
  });

  it('groups identical exact parts together', () => {
    const { bomRows } = runBomPipeline([
      { id: 'r1', type: 'rect', materialId: 'birch-plywood-18', width: 600, height: 400 },
      { id: 'r2', type: 'rect', materialId: 'birch-plywood-18', width: 600, height: 400 },
    ]);

    expect(bomRows).toHaveLength(1);
    expect(bomRows[0].quantity).toBe(2);
  });

  it('keeps exact-area costing for irregular closed profiles', () => {
    const { bomRows, totalCost } = runBomPipeline([{
      id: 'p1',
      type: 'polyline',
      materialId: 'birch-plywood-18',
      closed: true,
      points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }],
    }]);

    expect(bomRows[0].area).toBeCloseTo(0.02, 4);
    expect(bomRows[0].costAccuracy).toBe('exact');
    expect(bomRows[0].dimensionAccuracy).toBe('approximate');
    expect(totalCost).toBeCloseTo(0.9, 4);
  });

  it('keeps exact linear cost for path-based parts when stock length is known', () => {
    const { bomRows } = runBomPipeline([{
      id: 'l1',
      type: 'line',
      materialId: 'steel-sq-25',
      x1: 0,
      y1: 0,
      x2: 1000,
      y2: 0,
    }]);

    expect(bomRows[0].stockLength).toBe(1000);
    expect(bomRows[0].costAccuracy).toBe('exact');
  });
});
