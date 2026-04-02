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

    // Collect all entity IDs per grouped row for removal support
    const entityIdsByKey = new Map();
    for (const row of rawRows) {
      const key = [row.partName, row.role, row.material, row.thickness, row.width, row.height].join('|');
      const ids = entityIdsByKey.get(key);
      if (ids) {
        ids.push(row.partId);
      } else {
        entityIdsByKey.set(key, [row.partId]);
      }
    }

    let totalCost = 0;
    const costByMaterial = {};

    const bomRows = grouped.map((row) => {
      const cost = computeRowCost(row, materialPricing);
      totalCost += cost.totalCost;
      if (row.material) {
        costByMaterial[row.material] = (costByMaterial[row.material] || 0) + cost.totalCost;
      }
      const key = [row.partName, row.role, row.material, row.thickness, row.width, row.height].join('|');
      return {
        ...row,
        entityIds: entityIdsByKey.get(key) || [],
        area: cost.area,
        unitCost: cost.unitCost,
        totalCost: cost.totalCost,
      };
    });

    return { bomRows, totalCost, costByMaterial };
  }, [entities]);
}
