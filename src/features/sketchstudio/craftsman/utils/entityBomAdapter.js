import { getEntityManufacturingGeometry, getMaterialStockKind } from './entityManufacturingGeometry';

const BOM_ELIGIBLE_TYPES = new Set(['rect', 'line', 'circle', 'polyline']);

export function isEntityBomEligible(entity) {
  return BOM_ELIGIBLE_TYPES.has(entity?.type) && Boolean(entity?.materialId);
}

function getEntityLabel(entity) {
  if (entity.meta?.label) {
    return entity.meta.label;
  }

  switch (entity.type) {
    case 'rect':
      return 'Panel';
    case 'line':
      return 'Strip';
    case 'circle':
      return 'Disc';
    case 'polyline':
      return 'Profile';
    default:
      return 'Part';
  }
}

function roundDimension(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function entityToBomRow(entity, materialCatalog) {
  if (!isEntityBomEligible(entity)) {
    return null;
  }

  const material = materialCatalog?.[entity.materialId] ?? null;
  const geometry = getEntityManufacturingGeometry(entity, material);
  const thickness = entity.thickness ?? material?.thickness ?? 0;

  return {
    partId: entity.id,
    partName: getEntityLabel(entity),
    role: entity.type,
    material: entity.materialId,
    materialName: material?.name ?? entity.materialId ?? '',
    thickness,
    width: roundDimension(geometry.width),
    height: roundDimension(geometry.height),
    areaMm2: geometry.areaMm2 != null ? roundDimension(geometry.areaMm2) : null,
    stockLength: geometry.stockLength != null ? roundDimension(geometry.stockLength) : null,
    stockSectionWidth: geometry.stockSectionWidth != null ? roundDimension(geometry.stockSectionWidth) : 0,
    costBasis: material?.costBasis ?? 'perM2',
    stockKind: getMaterialStockKind(material),
    defaultStockWidth: material?.defaultWidth ?? 0,
    defaultStockLength: material?.defaultHeight ?? 0,
    dimensionAccuracy: geometry.dimensionAccuracy,
    dimensionNote: geometry.dimensionNote,
    quantity: 1,
  };
}

export function entitiesToBomRows(entities, materialCatalog) {
  const rows = [];
  for (const entity of entities) {
    const row = entityToBomRow(entity, materialCatalog);
    if (row) {
      rows.push(row);
    }
  }
  return rows;
}
