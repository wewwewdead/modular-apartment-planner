import { useMemo } from 'react';
import { getBomRowGroupKey, groupBomRows } from '../../utils/bomUtils';
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
      const key = getBomRowGroupKey(row);
      const ids = entityIdsByKey.get(key);
      if (ids) {
        ids.push(row.partId);
      } else {
        entityIdsByKey.set(key, [row.partId]);
      }
    }

    const { bomRows, totalCost, costByMaterial } = grouped.reduce((accumulator, row) => {
      const cost = computeRowCost(row, materialPricing);
      const key = getBomRowGroupKey(row);

      if (row.material) {
        accumulator.costByMaterial[row.material] = (accumulator.costByMaterial[row.material] || 0) + cost.totalCost;
      }

      accumulator.totalCost += cost.totalCost;
      accumulator.bomRows.push({
        ...row,
        entityIds: entityIdsByKey.get(key) || [],
        ...cost,
        costBasis: row.costBasis ?? cost.costBasis,
      });

      return accumulator;
    }, {
      bomRows: [],
      totalCost: 0,
      costByMaterial: {},
    });

    return { bomRows, totalCost, costByMaterial };
  }, [entities]);
}
