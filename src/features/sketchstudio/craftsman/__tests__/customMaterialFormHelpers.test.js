import { describe, expect, it } from 'vitest';
import builtInMaterials, { MATERIAL_CATEGORIES } from '../data/materials';
import { validateCustomMaterialDraft } from '../data/customMaterials';
import {
  CUSTOM_CATEGORY_SENTINEL,
  buildCategoryOptions,
  createBlankMaterialForm,
  createDuplicateMaterialForm,
  createEditMaterialForm,
  formStateToDraft,
  formatMaterialPrice,
  getCostBasisUnitLabel,
  getFirstErrorMessage,
  groupMaterialsByCategory,
  resolveFormCategory,
} from '../components/customMaterialFormHelpers';

const CUSTOM_MATERIAL = {
  id: 'custom-1',
  name: 'Quoted Ply',
  category: 'plywood',
  thickness: 18,
  defaultWidth: 2500,
  defaultHeight: 1250,
  pricePerM2: 42.5,
  costBasis: 'perM2',
  density: 690,
  color: '#AABBCC',
  isCustom: true,
};

describe('customMaterialFormHelpers', () => {
  it('produces a blank form that only fails validation on the missing price', () => {
    const outcome = validateCustomMaterialDraft(formStateToDraft(createBlankMaterialForm()));

    expect(Object.keys(outcome.errors).sort()).toEqual(['name', 'pricePerM2']);
  });

  it('round-trips an existing custom material through the edit form', () => {
    const formState = createEditMaterialForm(CUSTOM_MATERIAL);

    expect(formState.id).toBe('custom-1');
    expect(formState.price).toBe('42.5');

    const outcome = validateCustomMaterialDraft(formStateToDraft(formState), { id: formState.id });

    expect(outcome.valid).toBe(true);
    expect(outcome.material).toMatchObject({
      id: 'custom-1',
      name: 'Quoted Ply',
      category: 'plywood',
      thickness: 18,
      defaultWidth: 2500,
      defaultHeight: 1250,
      pricePerM2: 42.5,
      costBasis: 'perM2',
      density: 690,
      isCustom: true,
    });
  });

  it('seeds a new custom entry from a catalog material without keeping its id', () => {
    const source = builtInMaterials.find((material) => material.id === 'steel-sq-25');
    const formState = createDuplicateMaterialForm(source);

    expect(formState.id).toBeNull();
    expect(formState.name).toContain(source.name);
    expect(formState.costBasis).toBe('perLinearMeter');
    expect(formState.price).toBe(String(source.pricePerM2));
    expect(validateCustomMaterialDraft(formStateToDraft(formState)).valid).toBe(true);
  });

  it('resolves the free-text category only for the new-category sentinel', () => {
    expect(resolveFormCategory({ category: 'plywood', newCategory: 'ignored' })).toBe('plywood');
    expect(resolveFormCategory({ category: CUSTOM_CATEGORY_SENTINEL, newCategory: ' Offcuts ' })).toBe('Offcuts');
    expect(resolveFormCategory({ category: CUSTOM_CATEGORY_SENTINEL, newCategory: '  ' })).toBe('custom');
    expect(resolveFormCategory({ category: '   ', newCategory: '' })).toBe('custom');
  });

  it('appends the new-category sentinel to the category options', () => {
    const options = buildCategoryOptions(MATERIAL_CATEGORIES);

    expect(options).toHaveLength(MATERIAL_CATEGORIES.length + 1);
    expect(options.at(-1).value).toBe(CUSTOM_CATEGORY_SENTINEL);
  });

  it('formats prices with the unit of the cost basis', () => {
    expect(getCostBasisUnitLabel('perLinearMeter')).toBe('lm');
    expect(getCostBasisUnitLabel('perPiece')).toBe('pc');
    expect(formatMaterialPrice(CUSTOM_MATERIAL)).toBe('$42.5/m²');
    expect(formatMaterialPrice({ pricePerM2: 3, costBasis: 'perLinearMeter' })).toBe('$3/lm');
    expect(formatMaterialPrice(null)).toBe('$0/m²');
  });

  it('groups catalog materials by category and custom ones into their own bucket', () => {
    const groups = groupMaterialsByCategory([...builtInMaterials, CUSTOM_MATERIAL], MATERIAL_CATEGORIES);
    const last = groups.at(-1);

    expect(last.label).toBe('My Materials');
    expect(last.materials).toEqual([CUSTOM_MATERIAL]);
    expect(groups.find((group) => group.id === 'plywood').materials.every((m) => !m.isCustom)).toBe(true);
    expect(groups.every((group) => group.materials.length > 0)).toBe(true);
  });

  it('reports the first error in a stable field order', () => {
    expect(getFirstErrorMessage({ pricePerM2: 'bad price', name: 'bad name' })).toBe('bad name');
    expect(getFirstErrorMessage({ id: 'bad id' })).toBe('bad id');
    expect(getFirstErrorMessage({})).toBeNull();
    expect(getFirstErrorMessage(undefined)).toBeNull();
  });
});
