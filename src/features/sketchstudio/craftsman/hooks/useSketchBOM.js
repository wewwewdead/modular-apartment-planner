import { useMemo } from 'react';
import { groupBomRows } from '../../utils/bomUtils';
import { computeRowCost } from '../../utils/materialCostUtils';
import { entitiesToBomRows } from '../utils/entityBomAdapter';
import materials, { buildMaterialPricingDict } from '../data/materials';

const materialCatalogById = Object.fromEntries(materials.map((m) => [m.id, m]));
const materialPricing = buildMaterialPricingDict();

export default function useSketchBOM(entities) {
  return useMemo(() => {
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
      return {
        ...row,
        area: cost.area,
        unitCost: cost.unitCost,
        totalCost: cost.totalCost,
      };
    });

    return { bomRows, totalCost, costByMaterial };
  }, [entities]);
}
