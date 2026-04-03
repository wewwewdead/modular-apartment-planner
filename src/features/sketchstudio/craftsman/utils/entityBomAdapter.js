import { calculateDistance } from '../../utils/canvasMath';

const BOM_ELIGIBLE_TYPES = new Set(['rect', 'line', 'circle', 'polyline']);

function getMaterialStockKind(material) {
  return material?.costBasis === 'perLinearMeter' ? 'linear' : 'sheet';
}

export function isEntityBomEligible(entity) {
  return BOM_ELIGIBLE_TYPES.has(entity?.type) && Boolean(entity?.materialId);
}

function getEntityLabel(entity) {
  if (entity.meta?.label) return entity.meta.label;
  switch (entity.type) {
    case 'rect': return 'Panel';
    case 'line': return 'Strip';
    case 'circle': return 'Disc';
    case 'polyline': return 'Profile';
    default: return 'Part';
  }
}

function getEntityDimensions(entity, material = null) {
  const stockKind = getMaterialStockKind(material);

  switch (entity.type) {
    case 'rect':
      return {
        width: Math.abs(entity.width ?? (entity.x2 - entity.x1) ?? 0),
        height: Math.abs(entity.height ?? (entity.y2 - entity.y1) ?? 0),
      };

    case 'line': {
      const length = calculateDistance(
        { x: entity.x1, y: entity.y1 },
        { x: entity.x2, y: entity.y2 },
      );
      if (stockKind === 'linear') {
        return { width: length, height: material?.defaultWidth ?? 0 };
      }
      return { width: length, height: entity.thickness ?? 0 };
    }

    case 'circle':
      return {
        width: (entity.radius ?? 0) * 2,
        height: (entity.radius ?? 0) * 2,
      };

    case 'polyline': {
      if (!entity.points?.length) return { width: 0, height: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of entity.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { width: maxX - minX, height: maxY - minY };
    }

    default:
      return { width: 0, height: 0 };
  }
}

export function entityToBomRow(entity, materialCatalog) {
  if (!isEntityBomEligible(entity)) return null;

  const material = materialCatalog?.[entity.materialId] ?? null;
  const dims = getEntityDimensions(entity, material);
  const thickness = entity.thickness ?? material?.thickness ?? 0;
  const stockKind = getMaterialStockKind(material);

  return {
    partId: entity.id,
    partName: getEntityLabel(entity),
    role: entity.type,
    material: entity.materialId,
    materialName: material?.name ?? entity.materialId ?? '',
    thickness,
    width: Math.round(dims.width * 100) / 100,
    height: Math.round(dims.height * 100) / 100,
    costBasis: material?.costBasis ?? 'perM2',
    stockKind,
    defaultStockWidth: material?.defaultWidth ?? 0,
    defaultStockLength: material?.defaultHeight ?? 0,
    quantity: 1,
  };
}

export function entitiesToBomRows(entities, materialCatalog) {
  const rows = [];
  for (const entity of entities) {
    const row = entityToBomRow(entity, materialCatalog);
    if (row) rows.push(row);
  }
  return rows;
}
