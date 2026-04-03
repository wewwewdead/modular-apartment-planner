/**
 * Stock-aware cut-list optimizer.
 *
 * - Sheet materials use the existing First-Fit Decreasing Height (FFDH) shelf algorithm.
 * - Linear materials use first-fit decreasing bin packing against stock lengths.
 */

const DEFAULT_SHEET = { width: 2440, height: 1220 };
const DEFAULT_LINEAR_STOCK = 6000;
const DEFAULT_BLADE_KERF = 3;

const MM2_TO_M2 = 1 / 1_000_000;
const MM_TO_M = 1 / 1_000;

function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function firstPositive(...values) {
  for (const value of values) {
    const numeric = toPositiveNumber(value);
    if (numeric > 0) return numeric;
  }
  return 0;
}

function minPositive(...values) {
  const positives = values
    .map((value) => toPositiveNumber(value))
    .filter((value) => value > 0);
  return positives.length ? Math.min(...positives) : 0;
}

function getStockKind(row) {
  if (row?.stockKind === 'linear' || row?.costBasis === 'perLinearMeter') return 'linear';
  return 'sheet';
}

function getPartId(row, quantityIndex) {
  return `${row.partName || 'Part'}-${row.material || '__none__'}-${quantityIndex}`;
}

function groupByMaterial(parts) {
  const byMaterial = new Map();
  for (const part of parts) {
    const key = part.material || '__none__';
    if (!byMaterial.has(key)) byMaterial.set(key, []);
    byMaterial.get(key).push(part);
  }
  return byMaterial;
}

function expandSheetRows(bomRows) {
  const parts = [];

  for (const row of bomRows) {
    if (getStockKind(row) !== 'sheet') continue;
    const width = toPositiveNumber(row.width);
    const height = toPositiveNumber(row.height);
    if (!width || !height) continue;

    for (let quantityIndex = 0; quantityIndex < (row.quantity || 1); quantityIndex += 1) {
      const placedWidth = Math.max(width, height);
      const placedHeight = Math.min(width, height);
      parts.push({
        id: getPartId(row, quantityIndex),
        partName: row.partName,
        material: row.material,
        materialName: row.materialName,
        width: placedWidth,
        height: placedHeight,
        originalRow: row,
      });
    }
  }

  parts.sort((a, b) => b.height - a.height || b.width - a.width);
  return parts;
}

function expandLinearRows(bomRows) {
  const parts = [];

  for (const row of bomRows) {
    if (getStockKind(row) !== 'linear') continue;

    const rawWidth = toPositiveNumber(row.width);
    const rawHeight = toPositiveNumber(row.height);
    const cutLength = Math.max(rawWidth, rawHeight);
    if (!cutLength) continue;

    const sectionWidth = firstPositive(
      minPositive(rawWidth, rawHeight),
      row.defaultStockWidth,
      row.thickness,
    );

    for (let quantityIndex = 0; quantityIndex < (row.quantity || 1); quantityIndex += 1) {
      parts.push({
        id: getPartId(row, quantityIndex),
        partName: row.partName,
        material: row.material,
        materialName: row.materialName,
        width: rawWidth,
        height: rawHeight,
        thickness: toPositiveNumber(row.thickness),
        cutLength,
        sectionWidth,
        defaultStockLength: firstPositive(row.defaultStockLength, DEFAULT_LINEAR_STOCK),
        originalRow: row,
      });
    }
  }

  parts.sort((a, b) => b.cutLength - a.cutLength || b.sectionWidth - a.sectionWidth);
  return parts;
}

function nestOnSheets(parts, sheet, kerf) {
  const sheets = [];
  const unplaced = [...parts];

  while (unplaced.length > 0) {
    const currentSheet = {
      width: sheet.width,
      height: sheet.height,
      placements: [],
      shelves: [],
    };

    let shelfY = 0;
    let shelfHeight = 0;
    let cursorX = 0;
    const stillUnplaced = [];

    for (const part of unplaced) {
      if (cursorX + part.width <= sheet.width && shelfY + part.height <= sheet.height) {
        currentSheet.placements.push({
          ...part,
          x: cursorX,
          y: shelfY,
          placedWidth: part.width,
          placedHeight: part.height,
        });
        cursorX += part.width + kerf;
        shelfHeight = Math.max(shelfHeight, part.height);
        continue;
      }

      const newShelfY = shelfY + shelfHeight + kerf;
      if (part.width <= sheet.width && newShelfY + part.height <= sheet.height) {
        if (shelfHeight > 0) {
          currentSheet.shelves.push({ y: shelfY, height: shelfHeight });
        }

        shelfY = newShelfY;
        shelfHeight = part.height;
        cursorX = part.width + kerf;
        currentSheet.placements.push({
          ...part,
          x: 0,
          y: shelfY,
          placedWidth: part.width,
          placedHeight: part.height,
        });
        continue;
      }

      if (part.height + kerf <= sheet.width - cursorX && part.width <= sheet.height - shelfY) {
        currentSheet.placements.push({
          ...part,
          x: cursorX,
          y: shelfY,
          placedWidth: part.height,
          placedHeight: part.width,
          rotated: true,
        });
        cursorX += part.height + kerf;
        shelfHeight = Math.max(shelfHeight, part.width);
        continue;
      }

      stillUnplaced.push(part);
    }

    if (shelfHeight > 0) {
      currentSheet.shelves.push({ y: shelfY, height: shelfHeight });
    }

    if (currentSheet.placements.length > 0) {
      currentSheet.usedArea = currentSheet.placements.reduce((sum, placement) => sum + placement.placedWidth * placement.placedHeight, 0);
      currentSheet.totalArea = sheet.width * sheet.height;
      currentSheet.wastePercent = currentSheet.totalArea > 0
        ? Math.round((1 - currentSheet.usedArea / currentSheet.totalArea) * 100)
        : 0;
      sheets.push(currentSheet);
    }

    if (stillUnplaced.length === unplaced.length) {
      for (const oversized of stillUnplaced) {
        sheets.push({
          width: sheet.width,
          height: sheet.height,
          placements: [{
            ...oversized,
            x: 0,
            y: 0,
            placedWidth: oversized.width,
            placedHeight: oversized.height,
            oversized: true,
          }],
          shelves: [],
          usedArea: oversized.width * oversized.height,
          totalArea: sheet.width * sheet.height,
          wastePercent: Math.round((1 - (oversized.width * oversized.height) / (sheet.width * sheet.height)) * 100),
          oversized: true,
        });
      }
      break;
    }

    unplaced.length = 0;
    unplaced.push(...stillUnplaced);
  }

  return sheets;
}

function buildSheetSummary(sheets, sheetSize, totalParts = null) {
  const totalAreaMm2 = sheets.length * sheetSize.width * sheetSize.height;
  const usedAreaMm2 = sheets.reduce((sum, sheet) => sum + (sheet.usedArea || 0), 0);
  const wasteAreaMm2 = totalAreaMm2 - usedAreaMm2;

  return {
    stockKind: 'sheet',
    unitsNeeded: sheets.length,
    sheetsNeeded: sheets.length,
    totalParts: totalParts ?? sheets.reduce((sum, sheet) => sum + (sheet.placements?.length || 0), 0),
    sheetSize: `${sheetSize.width} x ${sheetSize.height}mm`,
    totalAreaMm2,
    usedAreaMm2,
    wasteAreaMm2,
    totalAreaM2: roundTo(totalAreaMm2 * MM2_TO_M2),
    usedAreaM2: roundTo(usedAreaMm2 * MM2_TO_M2),
    wasteAreaM2: roundTo(wasteAreaMm2 * MM2_TO_M2),
    wastePercent: totalAreaMm2 > 0 ? Math.round((wasteAreaMm2 / totalAreaMm2) * 100) : 0,
    efficiency: totalAreaMm2 > 0 ? Math.round((usedAreaMm2 / totalAreaMm2) * 100) : 0,
    oversizedCount: sheets.filter((sheet) => sheet.oversized).length,
  };
}

function buildLinearCut(part, start) {
  return {
    ...part,
    start,
    end: start + part.cutLength,
    length: part.cutLength,
  };
}

function buildLinearUnit(length, sectionWidth) {
  return {
    length,
    displayLength: length,
    sectionWidth,
    cuts: [],
    cutLengthUsed: 0,
    kerfLoss: 0,
    consumedLength: 0,
    remainingLength: length,
    wasteLength: length,
    wastePercent: 100,
    efficiency: 0,
  };
}

function updateLinearUnitMetrics(unit, kerf) {
  const cutLengthUsed = unit.cuts.reduce((sum, cut) => sum + cut.length, 0);
  const kerfLoss = kerf * Math.max(0, unit.cuts.length - 1);
  const consumedLength = cutLengthUsed + kerfLoss;
  const remainingLength = Math.max(0, unit.length - consumedLength);
  const wasteLength = Math.max(0, unit.length - cutLengthUsed);

  unit.cutLengthUsed = cutLengthUsed;
  unit.kerfLoss = kerfLoss;
  unit.consumedLength = consumedLength;
  unit.remainingLength = remainingLength;
  unit.wasteLength = wasteLength;
  unit.wastePercent = unit.length > 0 ? Math.round((wasteLength / unit.length) * 100) : 0;
  unit.efficiency = unit.length > 0 ? Math.round((cutLengthUsed / unit.length) * 100) : 0;
}

function appendLinearCut(unit, part, kerf) {
  const start = unit.cuts.length === 0
    ? 0
    : unit.cuts[unit.cuts.length - 1].end + kerf;
  const cut = buildLinearCut(part, start);
  unit.cuts.push(cut);
  unit.displayLength = Math.max(unit.displayLength, cut.end);
  unit.sectionWidth = Math.max(unit.sectionWidth || 0, part.sectionWidth || 0);
  updateLinearUnitMetrics(unit, kerf);
}

function createOversizedLinearUnit(part, stockLength) {
  const cut = buildLinearCut(part, 0);
  return {
    ...buildLinearUnit(stockLength, part.sectionWidth),
    cuts: [cut],
    displayLength: cut.end,
    cutLengthUsed: cut.length,
    kerfLoss: 0,
    consumedLength: cut.length,
    remainingLength: 0,
    wasteLength: 0,
    wastePercent: 0,
    efficiency: 100,
    oversized: true,
    oversizeBy: cut.length - stockLength,
  };
}

function nestLinearUnits(parts, stockLength, kerf) {
  const units = [];

  for (const part of parts) {
    if (part.cutLength > stockLength) {
      units.push(createOversizedLinearUnit(part, stockLength));
      continue;
    }

    let placed = false;

    for (const unit of units) {
      if (unit.oversized) continue;

      const start = unit.cuts.length === 0
        ? 0
        : unit.cuts[unit.cuts.length - 1].end + kerf;
      if (start + part.cutLength <= stockLength) {
        appendLinearCut(unit, part, kerf);
        placed = true;
        break;
      }
    }

    if (!placed) {
      const unit = buildLinearUnit(stockLength, part.sectionWidth);
      appendLinearCut(unit, part, kerf);
      units.push(unit);
    }
  }

  return units;
}

function buildLinearSummary(units, stockLength, totalParts = null) {
  const validUnits = units.filter((unit) => !unit.oversized);
  const totalStockLengthMm = validUnits.reduce((sum, unit) => sum + unit.length, 0);
  const usedLengthMm = validUnits.reduce((sum, unit) => sum + unit.cutLengthUsed, 0);
  const kerfLossMm = validUnits.reduce((sum, unit) => sum + unit.kerfLoss, 0);
  const leftoverLengthMm = validUnits.reduce((sum, unit) => sum + unit.remainingLength, 0);
  const wasteLengthMm = Math.max(0, totalStockLengthMm - usedLengthMm);

  return {
    stockKind: 'linear',
    unitsNeeded: units.length,
    sticksNeeded: units.length,
    totalParts: totalParts ?? units.reduce((sum, unit) => sum + (unit.cuts?.length || 0), 0),
    stockLengthMm: stockLength,
    stockLength: `${stockLength}mm`,
    totalStockLengthMm,
    usedLengthMm,
    kerfLossMm,
    leftoverLengthMm,
    wasteLengthMm,
    totalStockLengthM: roundTo(totalStockLengthMm * MM_TO_M),
    usedLengthM: roundTo(usedLengthMm * MM_TO_M),
    kerfLossM: roundTo(kerfLossMm * MM_TO_M),
    leftoverLengthM: roundTo(leftoverLengthMm * MM_TO_M),
    wasteLengthM: roundTo(wasteLengthMm * MM_TO_M),
    wastePercent: totalStockLengthMm > 0 ? Math.round((wasteLengthMm / totalStockLengthMm) * 100) : 0,
    efficiency: totalStockLengthMm > 0 ? Math.round((usedLengthMm / totalStockLengthMm) * 100) : 0,
    oversizedCount: units.filter((unit) => unit.oversized).length,
  };
}

function buildSheetGroups(bomRows, sheetSize, kerf) {
  const parts = expandSheetRows(bomRows);
  const byMaterial = groupByMaterial(parts);
  const groups = [];

  for (const [materialId, materialParts] of byMaterial) {
    const units = nestOnSheets(materialParts, sheetSize, kerf).map((unit) => ({
      ...unit,
      material: materialId,
      materialName: materialParts[0]?.materialName || materialId,
    }));

    groups.push({
      stockKind: 'sheet',
      material: materialId,
      materialName: materialParts[0]?.materialName || materialId,
      stockSpec: {
        width: sheetSize.width,
        height: sheetSize.height,
      },
      stockLabel: `${sheetSize.width} x ${sheetSize.height}mm`,
      units,
      summary: buildSheetSummary(units, sheetSize, materialParts.length),
    });
  }

  return groups.sort((a, b) => a.materialName.localeCompare(b.materialName));
}

function buildLinearGroups(bomRows, linearStockLengths, kerf) {
  const parts = expandLinearRows(bomRows);
  const byMaterial = groupByMaterial(parts);
  const groups = [];

  for (const [materialId, materialParts] of byMaterial) {
    const stockLength = firstPositive(
      linearStockLengths?.[materialId],
      materialParts[0]?.defaultStockLength,
      DEFAULT_LINEAR_STOCK,
    );
    const units = nestLinearUnits(materialParts, stockLength, kerf).map((unit) => ({
      ...unit,
      material: materialId,
      materialName: materialParts[0]?.materialName || materialId,
    }));

    groups.push({
      stockKind: 'linear',
      material: materialId,
      materialName: materialParts[0]?.materialName || materialId,
      stockSpec: {
        length: stockLength,
        sectionWidth: firstPositive(materialParts[0]?.sectionWidth, materialParts[0]?.originalRow?.defaultStockWidth),
      },
      stockLabel: `${stockLength}mm stock`,
      units,
      summary: buildLinearSummary(units, stockLength, materialParts.length),
    });
  }

  return groups.sort((a, b) => a.materialName.localeCompare(b.materialName));
}

function aggregateSheetSummaries(groups, sheetSize) {
  if (!groups.length) {
    return buildSheetSummary([], sheetSize, 0);
  }

  const totalAreaMm2 = groups.reduce((sum, group) => sum + group.summary.totalAreaMm2, 0);
  const usedAreaMm2 = groups.reduce((sum, group) => sum + group.summary.usedAreaMm2, 0);
  const wasteAreaMm2 = totalAreaMm2 - usedAreaMm2;
  const unitsNeeded = groups.reduce((sum, group) => sum + group.summary.unitsNeeded, 0);
  const totalParts = groups.reduce((sum, group) => sum + group.summary.totalParts, 0);
  const oversizedCount = groups.reduce((sum, group) => sum + group.summary.oversizedCount, 0);

  return {
    stockKind: 'sheet',
    unitsNeeded,
    sheetsNeeded: unitsNeeded,
    totalParts,
    sheetSize: `${sheetSize.width} x ${sheetSize.height}mm`,
    totalAreaMm2,
    usedAreaMm2,
    wasteAreaMm2,
    totalAreaM2: roundTo(totalAreaMm2 * MM2_TO_M2),
    usedAreaM2: roundTo(usedAreaMm2 * MM2_TO_M2),
    wasteAreaM2: roundTo(wasteAreaMm2 * MM2_TO_M2),
    wastePercent: totalAreaMm2 > 0 ? Math.round((wasteAreaMm2 / totalAreaMm2) * 100) : 0,
    efficiency: totalAreaMm2 > 0 ? Math.round((usedAreaMm2 / totalAreaMm2) * 100) : 0,
    oversizedCount,
  };
}

function aggregateLinearSummaries(groups) {
  if (!groups.length) {
    return {
      stockKind: 'linear',
      unitsNeeded: 0,
      sticksNeeded: 0,
      totalParts: 0,
      totalStockLengthMm: 0,
      usedLengthMm: 0,
      kerfLossMm: 0,
      leftoverLengthMm: 0,
      wasteLengthMm: 0,
      totalStockLengthM: 0,
      usedLengthM: 0,
      kerfLossM: 0,
      leftoverLengthM: 0,
      wasteLengthM: 0,
      wastePercent: 0,
      efficiency: 0,
      oversizedCount: 0,
    };
  }

  const unitsNeeded = groups.reduce((sum, group) => sum + group.summary.unitsNeeded, 0);
  const totalParts = groups.reduce((sum, group) => sum + group.summary.totalParts, 0);
  const totalStockLengthMm = groups.reduce((sum, group) => sum + group.summary.totalStockLengthMm, 0);
  const usedLengthMm = groups.reduce((sum, group) => sum + group.summary.usedLengthMm, 0);
  const kerfLossMm = groups.reduce((sum, group) => sum + group.summary.kerfLossMm, 0);
  const leftoverLengthMm = groups.reduce((sum, group) => sum + group.summary.leftoverLengthMm, 0);
  const wasteLengthMm = groups.reduce((sum, group) => sum + group.summary.wasteLengthMm, 0);
  const oversizedCount = groups.reduce((sum, group) => sum + group.summary.oversizedCount, 0);

  return {
    stockKind: 'linear',
    unitsNeeded,
    sticksNeeded: unitsNeeded,
    totalParts,
    totalStockLengthMm,
    usedLengthMm,
    kerfLossMm,
    leftoverLengthMm,
    wasteLengthMm,
    totalStockLengthM: roundTo(totalStockLengthMm * MM_TO_M),
    usedLengthM: roundTo(usedLengthMm * MM_TO_M),
    kerfLossM: roundTo(kerfLossMm * MM_TO_M),
    leftoverLengthM: roundTo(leftoverLengthMm * MM_TO_M),
    wasteLengthM: roundTo(wasteLengthMm * MM_TO_M),
    wastePercent: totalStockLengthMm > 0 ? Math.round((wasteLengthMm / totalStockLengthMm) * 100) : 0,
    efficiency: totalStockLengthMm > 0 ? Math.round((usedLengthMm / totalStockLengthMm) * 100) : 0,
    oversizedCount,
  };
}

function buildOptimizationSummary(groups, sheetSize) {
  const sheetGroups = groups.filter((group) => group.stockKind === 'sheet');
  const linearGroups = groups.filter((group) => group.stockKind === 'linear');

  return {
    totalGroups: groups.length,
    totalUnits: groups.reduce((sum, group) => sum + group.summary.unitsNeeded, 0),
    totalParts: groups.reduce((sum, group) => sum + group.summary.totalParts, 0),
    sheet: sheetGroups.length ? aggregateSheetSummaries(sheetGroups, sheetSize) : null,
    linear: linearGroups.length ? aggregateLinearSummaries(linearGroups) : null,
  };
}

export function nestPartsOnSheets(bomRows, options = {}) {
  const sheetSize = options.sheetSize ?? DEFAULT_SHEET;
  const kerf = options.bladeKerf ?? DEFAULT_BLADE_KERF;
  const groups = buildSheetGroups(bomRows, sheetSize, kerf);
  const sheets = groups.flatMap((group) => group.units);
  const summary = aggregateSheetSummaries(groups, sheetSize);

  return {
    sheets,
    totalSheets: summary.sheetsNeeded,
    totalParts: summary.totalParts,
    summary,
  };
}

export function optimizeCutList(bomRows, options = {}) {
  const sheetSize = options.sheetSize ?? DEFAULT_SHEET;
  const kerf = options.bladeKerf ?? DEFAULT_BLADE_KERF;
  const linearStockLengths = options.linearStockLengths ?? {};

  const sheetGroups = buildSheetGroups(bomRows, sheetSize, kerf);
  const linearGroups = buildLinearGroups(bomRows, linearStockLengths, kerf);
  const groups = [...sheetGroups, ...linearGroups];

  return {
    groups,
    summary: buildOptimizationSummary(groups, sheetSize),
  };
}

export { DEFAULT_SHEET, DEFAULT_LINEAR_STOCK, DEFAULT_BLADE_KERF };
