import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { groupBomRows } from '../../utils/bomUtils';
import { computeRowCost } from '../../utils/materialCostUtils';
import { entitiesToBomRows } from '../utils/entityBomAdapter';
import builtInMaterials, {
  MATERIAL_CATEGORIES,
  buildMaterialCatalogById,
  buildMaterialPricingDict,
  getAllMaterials,
  getBuiltInMaterials,
  getMaterialById,
  getMaterialsByCategory,
  getMergedMaterialCategories,
} from '../data/materials';
import {
  addCustomMaterial,
  deleteCustomMaterial,
  reloadCustomMaterials,
  replaceCustomMaterials,
} from '../data/customMaterials';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

const CUSTOM_SHEET = {
  id: 'custom-sheet',
  name: 'Quoted 18mm Ply',
  category: 'plywood',
  thickness: 18,
  defaultWidth: 2500,
  defaultHeight: 1250,
  pricePerM2: 100,
  costBasis: 'perM2',
  density: 690,
  color: '#AABBCC',
};

const CUSTOM_TUBE = {
  id: 'custom-tube',
  name: 'Quoted 25mm SQ Tube',
  category: 'weldingStock',
  thickness: 2,
  defaultWidth: 25,
  defaultHeight: 6000,
  pricePerM2: 5,
  costBasis: 'perLinearMeter',
  density: 7850,
  color: '#556677',
};

/** Mirrors the useSketchBOM pipeline against the merged catalog. */
function runBomPipeline(entities) {
  const rawRows = entitiesToBomRows(entities, buildMaterialCatalogById());
  const pricing = buildMaterialPricingDict();

  return groupBomRows(rawRows).map((row) => ({ ...row, ...computeRowCost(row, pricing) }));
}

describe('material catalog merge', () => {
  let originalLocalStorage;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createMemoryStorage();
    reloadCustomMaterials();
  });

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
  });

  it('leaves the default export and built-in list as the catalog only', () => {
    replaceCustomMaterials([CUSTOM_SHEET]);

    expect(builtInMaterials.some((material) => material.isCustom)).toBe(false);
    expect(getBuiltInMaterials()).toBe(builtInMaterials);
    expect(getAllMaterials()).toHaveLength(builtInMaterials.length + 1);
  });

  it('resolves custom materials through getMaterialById alongside built-ins', () => {
    expect(getMaterialById('custom-sheet')).toBeNull();

    replaceCustomMaterials([CUSTOM_SHEET]);

    expect(getMaterialById('custom-sheet')).toMatchObject({ name: 'Quoted 18mm Ply', isCustom: true });
    expect(getMaterialById('birch-plywood-18')?.name).toBe('18mm Birch Plywood');
    expect(getMaterialById('does-not-exist')).toBeNull();
    expect(getMaterialById(null)).toBeNull();
  });

  it('includes custom prices in the pricing dict and the id catalog', () => {
    replaceCustomMaterials([CUSTOM_SHEET, CUSTOM_TUBE]);

    const pricing = buildMaterialPricingDict();
    expect(pricing['custom-sheet']).toEqual({ unitCost: 100, costBasis: 'perM2' });
    expect(pricing['custom-tube']).toEqual({ unitCost: 5, costBasis: 'perLinearMeter' });
    expect(pricing['birch-plywood-18']).toEqual({ unitCost: 45, costBasis: 'perM2' });

    const catalog = buildMaterialCatalogById();
    expect(catalog['custom-sheet'].defaultWidth).toBe(2500);
    expect(Object.keys(catalog)).toHaveLength(builtInMaterials.length + 2);
  });

  it('lists custom materials in their category and exposes custom-only categories', () => {
    replaceCustomMaterials([CUSTOM_SHEET, CUSTOM_TUBE]);

    expect(getMaterialsByCategory('plywood').some((material) => material.id === 'custom-sheet')).toBe(true);
    expect(getMaterialsByCategory('weldingStock').map((material) => material.id)).toEqual(['custom-tube']);

    const categories = getMergedMaterialCategories();
    expect(categories.slice(0, MATERIAL_CATEGORIES.length)).toEqual(MATERIAL_CATEGORIES);
    expect(categories.at(-1)).toEqual({ id: 'weldingStock', label: 'WeldingStock' });
  });

  it('returns the shared category list untouched when there are no custom categories', () => {
    replaceCustomMaterials([CUSTOM_SHEET]);
    expect(getMergedMaterialCategories()).toBe(MATERIAL_CATEGORIES);
  });

  it('costs BOM rows with user-entered custom prices', () => {
    replaceCustomMaterials([CUSTOM_SHEET, CUSTOM_TUBE]);

    const [sheetRow, tubeRow] = runBomPipeline([
      { id: 'r1', type: 'rect', materialId: 'custom-sheet', width: 1000, height: 1000 },
      { id: 'l1', type: 'line', materialId: 'custom-tube', x1: 0, y1: 0, x2: 2000, y2: 0 },
    ]);

    expect(sheetRow.materialName).toBe('Quoted 18mm Ply');
    expect(sheetRow.area).toBeCloseTo(1, 6);
    expect(sheetRow.unitCost).toBe(100);
    expect(sheetRow.totalCost).toBeCloseTo(100, 6);

    expect(tubeRow.costBasis).toBe('perLinearMeter');
    expect(tubeRow.stockLength).toBe(2000);
    expect(tubeRow.totalCost).toBeCloseTo(10, 6);
  });

  it('reflects an edited custom price on the next BOM run', () => {
    replaceCustomMaterials([CUSTOM_SHEET]);
    const entities = [{ id: 'r1', type: 'rect', materialId: 'custom-sheet', width: 1000, height: 1000 }];

    expect(runBomPipeline(entities)[0].totalCost).toBeCloseTo(100, 6);

    replaceCustomMaterials([{ ...CUSTOM_SHEET, pricePerM2: 250 }]);
    expect(runBomPipeline(entities)[0].totalCost).toBeCloseTo(250, 6);
  });

  it('degrades to an unknown, zero-cost material when a referenced custom material is deleted', () => {
    const { material } = addCustomMaterial(CUSTOM_SHEET);
    const entities = [{ id: 'r1', type: 'rect', materialId: material.id, width: 1000, height: 1000 }];

    expect(runBomPipeline(entities)[0].totalCost).toBeCloseTo(100, 6);

    deleteCustomMaterial(material.id);

    expect(getMaterialById(material.id)).toBeNull();
    const [row] = runBomPipeline(entities);
    expect(row.material).toBe(material.id);
    expect(row.materialName).toBe(material.id);
    expect(row.costBasis).toBe('perM2');
    expect(row.unitCost).toBe(0);
    expect(row.totalCost).toBe(0);
    expect(row.defaultStockWidth).toBe(0);
  });
});
