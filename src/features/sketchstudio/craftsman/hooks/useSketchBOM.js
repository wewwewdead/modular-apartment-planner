import { useMemo } from 'react';
import { getBomRowGroupKey, groupBomRows } from '../../utils/bomUtils';
import { computeRowCost } from '../../utils/materialCostUtils';
import { entitiesToBomRows } from '../utils/entityBomAdapter';
import { buildMaterialCatalogById, buildMaterialPricingDict, getBuiltInMaterials } from '../data/materials';
import { useCustomMaterialList } from './useCustomMaterials';

export default function useSketchBOM(entities) {
  // Catalog + pricing are rebuilt whenever the custom material registry changes so
  // BOM costs immediately reflect user-entered local prices.
  const customMaterials = useCustomMaterialList();
  const allMaterials = useMemo(() => [...getBuiltInMaterials(), ...customMaterials], [customMaterials]);

  return useMemo(() => {
    const materialCatalogById = buildMaterialCatalogById(allMaterials);
    const materialPricing = buildMaterialPricingDict(allMaterials);
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

    const { bomRows, totalCost, costByMaterial } = grouped.reduce(
      (accumulator, row) => {
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
      },
      {
        bomRows: [],
        totalCost: 0,
        costByMaterial: {},
      },
    );

    return { bomRows, totalCost, costByMaterial };
  }, [entities, allMaterials]);
}
