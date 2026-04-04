import { computePartCutSize, buildObjectBom, groupBomRows } from './bomUtils';

const MM2_TO_M2 = 1 / 1_000_000;
const MM_TO_M = 1 / 1_000;

function toPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function getFallbackAreaMm2(bomRow) {
  return toPositiveNumber(bomRow.width) * toPositiveNumber(bomRow.height);
}

function buildAreaCostMetadata(bomRow) {
  const exactAreaMm2 = toPositiveNumber(bomRow.areaMm2);
  if (exactAreaMm2 > 0) {
    return {
      area: exactAreaMm2 * MM2_TO_M2,
      costAccuracy: 'exact',
      costNote: 'Cost uses exact geometry area.',
    };
  }

  return {
    area: getFallbackAreaMm2(bomRow) * MM2_TO_M2,
    costAccuracy: 'approximate',
    costNote: 'Cost uses a bounding-box area estimate because exact geometry area is unavailable.',
  };
}

function buildLinearCostMetadata(bomRow) {
  const exactLengthMm = toPositiveNumber(bomRow.stockLength);
  if (exactLengthMm > 0) {
    return {
      lengthM: exactLengthMm * MM_TO_M,
      costAccuracy: 'exact',
      costNote: 'Cost uses exact cut length.',
    };
  }

  return {
    lengthM: Math.max(toPositiveNumber(bomRow.width), toPositiveNumber(bomRow.height)) * MM_TO_M,
    costAccuracy: 'approximate',
    costNote: 'Cost uses the largest displayed dimension as an estimate because exact cut length is unavailable.',
  };
}

export function computePartArea(part) {
  const { width, height } = computePartCutSize(part);
  return width * height * MM2_TO_M2;
}

export function createMaterialPricing(material, unitCost = 0, costBasis = 'perM2') {
  return {
    material: material || '',
    unitCost: Number(unitCost) || 0,
    costBasis: ['perM2', 'perLinearMeter', 'perPiece'].includes(costBasis) ? costBasis : 'perM2',
  };
}

export function computeRowCost(bomRow, materialPricing = {}) {
  const pricing = materialPricing[bomRow.material];
  const costBasis = pricing?.costBasis || bomRow.costBasis || 'perM2';
  const quantity = bomRow.quantity || 1;

  if (costBasis === 'perPiece') {
    return {
      area: buildAreaCostMetadata(bomRow).area,
      unitCost: pricing?.unitCost || 0,
      totalCost: (pricing?.unitCost || 0) * quantity,
      costBasis: 'perPiece',
      costAccuracy: 'exact',
      costNote: '',
    };
  }

  if (costBasis === 'perLinearMeter') {
    const linearCost = buildLinearCostMetadata(bomRow);
    return {
      area: buildAreaCostMetadata(bomRow).area,
      unitCost: pricing?.unitCost || 0,
      totalCost: linearCost.lengthM * (pricing?.unitCost || 0) * quantity,
      costBasis: 'perLinearMeter',
      costAccuracy: linearCost.costAccuracy,
      costNote: linearCost.costNote,
    };
  }

  const areaCost = buildAreaCostMetadata(bomRow);
  return {
    area: areaCost.area,
    unitCost: pricing?.unitCost || 0,
    totalCost: areaCost.area * (pricing?.unitCost || 0) * quantity,
    costBasis: 'perM2',
    costAccuracy: areaCost.costAccuracy,
    costNote: areaCost.costNote,
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
