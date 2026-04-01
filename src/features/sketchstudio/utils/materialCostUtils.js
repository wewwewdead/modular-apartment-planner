import { computePartCutSize, buildObjectBom, groupBomRows } from './bomUtils';

const MM2_TO_M2 = 1 / 1_000_000;

export function computePartArea(part) {
  const { width, height } = computePartCutSize(part);
  return width * height * MM2_TO_M2;
}

export function createMaterialPricing(material, unitCost = 0, costBasis = 'perM2') {
  return {
    material: material || '',
    unitCost: Number(unitCost) || 0,
    costBasis: costBasis === 'perPiece' ? 'perPiece' : 'perM2',
  };
}

const MM_TO_M = 1 / 1_000;

export function computeRowCost(bomRow, materialPricing = {}) {
  const pricing = materialPricing[bomRow.material];
  if (!pricing || !pricing.unitCost) {
    return { area: 0, unitCost: 0, totalCost: 0, costBasis: 'perM2' };
  }

  const cutSize = { width: bomRow.width, height: bomRow.height };
  const area = cutSize.width * cutSize.height * MM2_TO_M2;

  if (pricing.costBasis === 'perPiece') {
    return {
      area,
      unitCost: pricing.unitCost,
      totalCost: pricing.unitCost * (bomRow.quantity || 1),
      costBasis: 'perPiece',
    };
  }

  if (pricing.costBasis === 'perLinearMeter') {
    const lengthM = Math.max(cutSize.width, cutSize.height) * MM_TO_M;
    const totalCost = lengthM * pricing.unitCost * (bomRow.quantity || 1);
    return {
      area,
      unitCost: pricing.unitCost,
      totalCost,
      costBasis: 'perLinearMeter',
    };
  }

  const totalCost = area * pricing.unitCost * (bomRow.quantity || 1);
  return {
    area,
    unitCost: pricing.unitCost,
    totalCost,
    costBasis: 'perM2',
  };
}

export function computeCostSummary(objectDraft, materialPricing = {}) {
  const bomRows = groupBomRows(buildObjectBom(objectDraft));
  let totalCost = 0;
  let totalArea = 0;
  const costByMaterial = {};

  const rows = bomRows.map((row) => {
    const cost = computeRowCost(row, materialPricing);
    totalCost += cost.totalCost;
    totalArea += cost.area * (row.quantity || 1);
    if (row.material) {
      costByMaterial[row.material] = (costByMaterial[row.material] || 0) + cost.totalCost;
    }
    return { ...row, ...cost };
  });

  return { rows, totalCost, costByMaterial, totalArea };
}
