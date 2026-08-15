import {
  COST_BASIS_OPTIONS,
  CUSTOM_MATERIAL_CATEGORY,
  CUSTOM_MATERIAL_DEFAULTS,
  buildDuplicateDraft,
} from '../data/customMaterials';

export const CUSTOM_CATEGORY_SENTINEL = '__new_category__';

/** Empty form state for "Add custom material". All fields are strings. */
export function createBlankMaterialForm() {
  return {
    id: null,
    name: '',
    category: CUSTOM_MATERIAL_CATEGORY,
    newCategory: '',
    thickness: String(CUSTOM_MATERIAL_DEFAULTS.thickness),
    defaultWidth: String(CUSTOM_MATERIAL_DEFAULTS.defaultWidth),
    defaultHeight: String(CUSTOM_MATERIAL_DEFAULTS.defaultHeight),
    price: '',
    costBasis: CUSTOM_MATERIAL_DEFAULTS.costBasis,
    density: String(CUSTOM_MATERIAL_DEFAULTS.density),
    hasGrain: CUSTOM_MATERIAL_DEFAULTS.hasGrain,
    color: CUSTOM_MATERIAL_DEFAULTS.color,
  };
}

function toFormFields(material, { id = null, name = material?.name ?? '' } = {}) {
  const blank = createBlankMaterialForm();

  return {
    ...blank,
    id,
    name,
    category: material?.category || blank.category,
    thickness: material?.thickness != null ? String(material.thickness) : blank.thickness,
    defaultWidth: material?.defaultWidth != null ? String(material.defaultWidth) : blank.defaultWidth,
    defaultHeight: material?.defaultHeight != null ? String(material.defaultHeight) : blank.defaultHeight,
    price: material?.pricePerM2 != null ? String(material.pricePerM2) : blank.price,
    costBasis: material?.costBasis || blank.costBasis,
    density: material?.density != null ? String(material.density) : blank.density,
    hasGrain: material?.hasGrain === true,
    color: material?.color || blank.color,
  };
}

/** Form state for editing an existing custom material. */
export function createEditMaterialForm(material) {
  return toFormFields(material, { id: material?.id ?? null });
}

/** Form state seeded from any catalog (or custom) material, as a new custom entry. */
export function createDuplicateMaterialForm(source) {
  const draft = buildDuplicateDraft(source);
  return toFormFields({ ...draft, pricePerM2: draft.pricePerM2 }, { id: null, name: draft.name });
}

/** Collapse the form's category select + free-text field into a single value. */
export function resolveFormCategory(formState) {
  if (formState.category === CUSTOM_CATEGORY_SENTINEL) {
    return formState.newCategory.trim() || CUSTOM_MATERIAL_CATEGORY;
  }
  return formState.category.trim() || CUSTOM_MATERIAL_CATEGORY;
}

/** Map form state onto a registry draft (validation lives in the registry). */
export function formStateToDraft(formState) {
  return {
    name: formState.name,
    category: resolveFormCategory(formState),
    thickness: formState.thickness,
    defaultWidth: formState.defaultWidth,
    defaultHeight: formState.defaultHeight,
    pricePerM2: formState.price,
    costBasis: formState.costBasis,
    density: formState.density,
    hasGrain: formState.hasGrain === true,
    color: formState.color,
  };
}

export function getCostBasisUnitLabel(costBasis) {
  return COST_BASIS_OPTIONS.find((option) => option.id === costBasis)?.unitLabel ?? 'm²';
}

/** Compact price label, e.g. `$45/m²`. */
export function formatMaterialPrice(material) {
  // Catalog hardware prices live in `pricePerPiece`; custom materials keep every
  // cost basis in `pricePerM2`.
  const rawPrice =
    material?.costBasis === 'perPiece' ? (material.pricePerPiece ?? material.pricePerM2) : material?.pricePerM2;
  const price = Number(rawPrice);
  const amount = rawPrice != null && Number.isFinite(price) ? price : 0;
  return `$${amount}/${getCostBasisUnitLabel(material?.costBasis)}`;
}

/** Category options for the form select, including the "new category" sentinel. */
export function buildCategoryOptions(categories) {
  return [
    ...categories.map((category) => ({ value: category.id, label: category.label })),
    { value: CUSTOM_CATEGORY_SENTINEL, label: 'New category…' },
  ];
}

/**
 * Group a merged material list into `<optgroup>`-ready buckets.
 * Custom materials are split into their own trailing "My Materials" group so they
 * are visually distinct from the read-only catalog.
 */
export function groupMaterialsByCategory(materials, categories, { customGroupLabel = 'My Materials' } = {}) {
  const catalog = materials.filter((material) => !material.isCustom);
  const custom = materials.filter((material) => material.isCustom);

  const groups = categories
    .map((category) => ({
      id: category.id,
      label: category.label,
      materials: catalog.filter((material) => material.category === category.id),
    }))
    .filter((group) => group.materials.length > 0);

  if (custom.length) {
    groups.push({ id: '__custom__', label: customGroupLabel, materials: custom });
  }

  return groups;
}

/** First error message in a stable field order, for a single-line form summary. */
export function getFirstErrorMessage(errors) {
  const order = ['name', 'category', 'costBasis', 'thickness', 'pricePerM2', 'defaultWidth', 'defaultHeight', 'id'];

  for (const key of order) {
    if (errors?.[key]) {
      return errors[key];
    }
  }

  const remaining = Object.keys(errors ?? {});
  return remaining.length ? errors[remaining[0]] : null;
}
