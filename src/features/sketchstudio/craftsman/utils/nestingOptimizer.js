/**
 * Cut-list optimizer: nests parts onto standard sheet sizes using
 * First-Fit Decreasing Height (FFDH) shelf algorithm.
 *
 * Input: BOM rows with width/height/quantity
 * Output: Sheet layouts with placed parts and waste %
 */

const DEFAULT_SHEET = { width: 2440, height: 1220 }; // standard plywood sheet in mm
const BLADE_KERF = 3; // mm between cuts

export function nestPartsOnSheets(bomRows, options = {}) {
  const sheet = options.sheetSize ?? DEFAULT_SHEET;
  const kerf = options.bladeKerf ?? BLADE_KERF;

  // Expand BOM rows by quantity and try both orientations
  const parts = [];
  for (const row of bomRows) {
    if (!row.width || !row.height) continue;
    for (let q = 0; q < (row.quantity || 1); q++) {
      // Always orient so the wider dimension goes along sheet width
      const w = Math.max(row.width, row.height);
      const h = Math.min(row.width, row.height);
      parts.push({
        id: `${row.partName}-${row.material}-${q}`,
        partName: row.partName,
        material: row.material,
        materialName: row.materialName,
        width: w,
        height: h,
        originalRow: row,
      });
    }
  }

  // Sort by height descending (FFDH)
  parts.sort((a, b) => b.height - a.height || b.width - a.width);

  // Group parts by material — each material nests on its own sheets
  const byMaterial = new Map();
  for (const part of parts) {
    const key = part.material || '__none__';
    if (!byMaterial.has(key)) byMaterial.set(key, []);
    byMaterial.get(key).push(part);
  }

  const allSheets = [];

  for (const [materialId, materialParts] of byMaterial) {
    const sheets = nestOnSheets(materialParts, sheet, kerf);
    for (const s of sheets) {
      s.material = materialId;
      s.materialName = materialParts[0]?.materialName || materialId;
    }
    allSheets.push(...sheets);
  }

  return {
    sheets: allSheets,
    totalSheets: allSheets.length,
    totalParts: parts.length,
    summary: buildNestingSummary(allSheets, sheet),
  };
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

    // Try to place each part
    const stillUnplaced = [];

    for (const part of unplaced) {
      // Check if part fits on current shelf
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

      // Try starting a new shelf
      const newShelfY = shelfY + shelfHeight + kerf;
      if (part.width <= sheet.width && newShelfY + part.height <= sheet.height) {
        // Close current shelf, start new one
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

      // Try rotated (swap w/h)
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

      // Doesn't fit on this sheet
      stillUnplaced.push(part);
    }

    // Close last shelf
    if (shelfHeight > 0) {
      currentSheet.shelves.push({ y: shelfY, height: shelfHeight });
    }

    if (currentSheet.placements.length > 0) {
      currentSheet.usedArea = currentSheet.placements.reduce((sum, p) => sum + p.placedWidth * p.placedHeight, 0);
      currentSheet.totalArea = sheet.width * sheet.height;
      currentSheet.wastePercent = Math.round((1 - currentSheet.usedArea / currentSheet.totalArea) * 100);
      sheets.push(currentSheet);
    }

    // If nothing was placed this round, parts are too large for the sheet
    if (stillUnplaced.length === unplaced.length) {
      for (const oversized of stillUnplaced) {
        sheets.push({
          width: sheet.width,
          height: sheet.height,
          placements: [{
            ...oversized,
            x: 0, y: 0,
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

function buildNestingSummary(sheets, sheetSize) {
  const totalArea = sheets.length * sheetSize.width * sheetSize.height;
  const usedArea = sheets.reduce((sum, s) => sum + (s.usedArea || 0), 0);
  const wasteArea = totalArea - usedArea;

  return {
    sheetsNeeded: sheets.length,
    sheetSize: `${sheetSize.width} x ${sheetSize.height}mm`,
    totalArea: Math.round(totalArea / 1_000_000 * 100) / 100, // m2
    usedArea: Math.round(usedArea / 1_000_000 * 100) / 100,
    wasteArea: Math.round(wasteArea / 1_000_000 * 100) / 100,
    wastePercent: totalArea > 0 ? Math.round((wasteArea / totalArea) * 100) : 0,
    efficiency: totalArea > 0 ? Math.round((usedArea / totalArea) * 100) : 0,
  };
}

export { DEFAULT_SHEET };
