/**
 * 1D cut optimizer for linear stock (boards, sections, tube).
 *
 * The sheet nester in `nestingOptimizer` packs rectangles onto panels. This
 * packs LENGTHS onto boards, which is a different problem with a different
 * answer: a board is one dimension plus a saw kerf, and the classic result is
 * that First-Fit Decreasing is both the right shape of algorithm and the one a
 * human can follow at the saw.
 *
 * Which BOM rows are linear
 * -------------------------
 * The catalog already draws this line and this module does not redraw it.
 * `entityManufacturingGeometry.getMaterialStockKind` maps a material to
 * `linear` | `sheet` | `piece`, and it calls a material linear when
 * `costBasis === 'perLinearMeter'` - which is exactly the set of catalog entries
 * sold by the metre: all six lumber entries, and every metal tube, angle and
 * flat bar. Sheet goods (plywood, MDF, acrylic, metal sheet) are `perM2` and go
 * to the sheet nester; hardware is `perPiece` and is counted, never cut. Rows
 * carry the answer as `stockKind`, and this module reads that, falling back to
 * the raw `costBasis` for rows built before `stockKind` existed.
 *
 * Note that "linear" is wider than "lumber": a steel tube is linear stock too,
 * and it belongs in a cut list for exactly the same reason. Nothing here is
 * wood-specific.
 *
 * Stock length
 * ------------
 * Per material, resolved in this order:
 *   1. an explicit override for that material id (the UI's per-material field);
 *   2. `stockLengthMm` on the BOM row, if a caller put one there;
 *   3. `stockLengthMm` on the catalog material - added to the lumber entries
 *      (2400mm, the standard length those are sold in) and to the metal
 *      sections (6000mm, the standard mill length);
 *   4. DEFAULT_STOCK_LENGTH_MM.
 * A user-defined custom material carries no `stockLengthMm`, so it lands on the
 * 2400mm default, which is the additive behaviour the catalog schema promises.
 *
 * Kerf
 * ----
 * EVERY cut consumes one kerf, including the last one: `n` pieces taken off a
 * board consume `n x cutLength + n x kerf`. That is the pessimistic convention
 * and it is the correct one for a board, because the piece is cut FREE of the
 * board - the final cut is real, it just happens to leave the offcut rather than
 * a part. (The sheet nester uses a different rule, `n-1` gaps between nested
 * parts, because there the kerf is a gap BETWEEN parts, not a separation cut.
 * The two are answering different questions and are deliberately not shared.)
 *
 * Determinism
 * -----------
 * Guaranteed and tested. Rows are expanded in input order, sorted by a total
 * order (length desc, then section width desc, then material, then part name,
 * then the expansion index), and first-fit scans boards in creation order. The
 * same BOM always yields the same boards, in the same order, with the same cuts.
 */

import { getMaterialById } from '../data/materials';

/** Standard length the catalog's lumber is sold in, and the additive default. */
export const DEFAULT_STOCK_LENGTH_MM = 2400;

/** Saw kerf per cut. 3mm is a typical mitre-saw / table-saw blade. */
export const DEFAULT_CUT_KERF_MM = 3;

function toPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function firstPositive(...values) {
  for (const value of values) {
    const numeric = toPositiveNumber(value);
    if (numeric > 0) {
      return numeric;
    }
  }
  return 0;
}

function minPositive(...values) {
  const positives = values.map(toPositiveNumber).filter((value) => value > 0);
  return positives.length ? Math.min(...positives) : 0;
}

function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Whether a BOM row is cut from linear stock. See the module header. */
export function isLinearStockRow(row) {
  if (row?.stockKind === 'piece' || row?.role === 'hardware') {
    return false;
  }
  return row?.stockKind === 'linear' || row?.costBasis === 'perLinearMeter';
}

/**
 * Stock length for a material, in the documented precedence order.
 * `lookupMaterial` is injectable so tests never touch the localStorage-backed
 * custom-material registry.
 */
export function resolveStockLengthMm(materialId, row, options = {}) {
  const overrides = options.stockLengthsMm ?? {};
  const lookupMaterial = options.lookupMaterial ?? getMaterialById;
  const material = materialId && materialId !== '__none__' ? lookupMaterial(materialId) : null;

  return firstPositive(
    overrides[materialId],
    row?.stockLengthMm,
    material?.stockLengthMm,
    options.defaultStockLengthMm,
    DEFAULT_STOCK_LENGTH_MM,
  );
}

/**
 * The cut length a row asks for. `stockLength` is what the manufacturing
 * geometry already computed for linear parts (a line's length, a rect's
 * perimeter); the longer of width/height is the fallback for rows that predate
 * it.
 */
function resolveCutLengthMm(row) {
  return firstPositive(row.stockLength, Math.max(toPositiveNumber(row.width), toPositiveNumber(row.height)));
}

function resolveSectionWidthMm(row) {
  return firstPositive(
    row.stockSectionWidth,
    minPositive(toPositiveNumber(row.width), toPositiveNumber(row.height)),
    row.defaultStockWidth,
    row.thickness,
  );
}

/**
 * BOM rows -> individual required lengths, one per unit of quantity, sorted
 * decreasing. The sort is a strict total order so the result cannot depend on
 * the sort implementation's stability.
 */
export function expandRequiredCuts(bomRows = []) {
  const cuts = [];

  bomRows.forEach((row, rowIndex) => {
    if (!isLinearStockRow(row)) {
      return;
    }

    const lengthMm = resolveCutLengthMm(row);
    if (!lengthMm) {
      return;
    }

    const quantity = Math.max(1, Math.round(Number(row.quantity) || 1));
    for (let unit = 0; unit < quantity; unit += 1) {
      cuts.push({
        material: row.material || '__none__',
        materialName: row.materialName || row.material || 'Unspecified',
        partName: row.partName || 'Part',
        partId: row.partId ?? null,
        lengthMm,
        sectionWidthMm: resolveSectionWidthMm(row),
        sequence: rowIndex * 1000 + unit,
        row,
      });
    }
  });

  return cuts.sort(
    (left, right) =>
      right.lengthMm - left.lengthMm ||
      right.sectionWidthMm - left.sectionWidthMm ||
      (left.material < right.material ? -1 : left.material > right.material ? 1 : 0) ||
      (left.partName < right.partName ? -1 : left.partName > right.partName ? 1 : 0) ||
      left.sequence - right.sequence,
  );
}

function createBoard(index, stockLengthMm) {
  return {
    index,
    boardNumber: index + 1,
    stockLengthMm,
    cuts: [],
    usedLengthMm: 0,
    kerfLossMm: 0,
    consumedLengthMm: 0,
    offcutLengthMm: stockLengthMm,
  };
}

function boardRemaining(board, kerfMm) {
  // Each existing cut has already paid its own kerf, so the space left is the
  // stock minus everything consumed. A new cut must fit its length AND its kerf.
  return board.stockLengthMm - board.consumedLengthMm - kerfMm;
}

function placeCut(board, cut, kerfMm) {
  const start = board.consumedLengthMm;
  board.cuts.push({
    partName: cut.partName,
    partId: cut.partId,
    lengthMm: cut.lengthMm,
    startMm: roundTo(start, 3),
    endMm: roundTo(start + cut.lengthMm, 3),
    sequence: board.cuts.length + 1,
  });
  board.usedLengthMm = roundTo(board.usedLengthMm + cut.lengthMm, 3);
  board.kerfLossMm = roundTo(board.kerfLossMm + kerfMm, 3);
  board.consumedLengthMm = roundTo(board.consumedLengthMm + cut.lengthMm + kerfMm, 3);
  board.offcutLengthMm = roundTo(Math.max(0, board.stockLengthMm - board.consumedLengthMm), 3);
}

/**
 * First-Fit Decreasing over one material's cuts.
 *
 * Longest first, and each cut goes on the FIRST board it fits on - not the
 * tightest, not a new one. FFD is within 11/9 of optimal for bin packing and,
 * more usefully here, it produces a cut order a person can actually follow: the
 * big pieces come off first, while the board is still long enough to handle
 * safely.
 */
function packMaterial(cuts, stockLengthMm, kerfMm) {
  const boards = [];
  const oversize = [];

  for (const cut of cuts) {
    // A piece longer than the stock cannot be cut from it. Reported, never
    // silently dropped and never quietly split across two boards - a butt joint
    // in the middle of a rail is a decision the maker has to make, not the
    // optimizer.
    if (cut.lengthMm + kerfMm > stockLengthMm) {
      oversize.push({
        partName: cut.partName,
        partId: cut.partId,
        lengthMm: cut.lengthMm,
        stockLengthMm,
        overBy: roundTo(cut.lengthMm + kerfMm - stockLengthMm, 3),
      });
      continue;
    }

    const board = boards.find((candidate) => boardRemaining(candidate, kerfMm) >= cut.lengthMm);
    if (board) {
      placeCut(board, cut, kerfMm);
      continue;
    }

    const fresh = createBoard(boards.length, stockLengthMm);
    placeCut(fresh, cut, kerfMm);
    boards.push(fresh);
  }

  return { boards, oversize };
}

function summarizeBoards(boards, oversize) {
  const totalStockLengthMm = boards.reduce((sum, board) => sum + board.stockLengthMm, 0);
  const usedLengthMm = roundTo(
    boards.reduce((sum, board) => sum + board.usedLengthMm, 0),
    3,
  );
  const kerfLossMm = roundTo(
    boards.reduce((sum, board) => sum + board.kerfLossMm, 0),
    3,
  );
  const offcutLengthMm = roundTo(
    boards.reduce((sum, board) => sum + board.offcutLengthMm, 0),
    3,
  );
  const wasteLengthMm = roundTo(Math.max(0, totalStockLengthMm - usedLengthMm), 3);

  return {
    boardsNeeded: boards.length,
    totalCuts: boards.reduce((sum, board) => sum + board.cuts.length, 0),
    totalStockLengthMm,
    usedLengthMm,
    kerfLossMm,
    offcutLengthMm,
    wasteLengthMm,
    totalStockLengthM: roundTo(totalStockLengthMm / 1000),
    usedLengthM: roundTo(usedLengthMm / 1000),
    kerfLossM: roundTo(kerfLossMm / 1000),
    offcutLengthM: roundTo(offcutLengthMm / 1000),
    // Waste is everything that is not a finished part: kerf plus offcut.
    wastePercent: totalStockLengthMm > 0 ? roundTo((wasteLengthMm / totalStockLengthMm) * 100, 1) : 0,
    efficiencyPercent: totalStockLengthMm > 0 ? roundTo((usedLengthMm / totalStockLengthMm) * 100, 1) : 0,
    oversizeCount: oversize.length,
  };
}

/**
 * Full 1D cut plan, grouped by material.
 *
 * @param {object[]} bomRows grouped BOM rows.
 * @param {object} [options]
 * @param {number} [options.kerfMm] saw kerf per cut.
 * @param {Record<string, number>} [options.stockLengthsMm] per-material override.
 * @param {number} [options.defaultStockLengthMm]
 * @param {Function} [options.lookupMaterial] injectable catalog lookup.
 * @returns {{groups:Array, summary:object, kerfMm:number}}
 */
export function optimizeLinearStock(bomRows = [], options = {}) {
  const kerfMm =
    Number.isFinite(Number(options.kerfMm)) && Number(options.kerfMm) >= 0
      ? Number(options.kerfMm)
      : DEFAULT_CUT_KERF_MM;
  const cuts = expandRequiredCuts(bomRows);

  const byMaterial = new Map();
  for (const cut of cuts) {
    if (!byMaterial.has(cut.material)) {
      byMaterial.set(cut.material, []);
    }
    byMaterial.get(cut.material).push(cut);
  }

  const groups = [];
  for (const [material, materialCuts] of byMaterial) {
    const stockLengthMm = resolveStockLengthMm(material, materialCuts[0]?.row, options);
    const { boards, oversize } = packMaterial(materialCuts, stockLengthMm, kerfMm);

    groups.push({
      material,
      materialName: materialCuts[0].materialName,
      stockLengthMm,
      sectionWidthMm: materialCuts[0].sectionWidthMm,
      kerfMm,
      boards,
      oversize,
      summary: summarizeBoards(boards, oversize),
    });
  }

  // Stable, name-ordered output so the panel and the CSV agree run to run.
  groups.sort((left, right) =>
    left.materialName < right.materialName ? -1 : left.materialName > right.materialName ? 1 : 0,
  );

  const allBoards = groups.flatMap((group) => group.boards);
  const allOversize = groups.flatMap((group) => group.oversize);

  return {
    kerfMm,
    groups,
    summary: {
      ...summarizeBoards(allBoards, allOversize),
      materialCount: groups.length,
    },
  };
}

/**
 * `cutlist.csv` for the workshop package: one row per board, cut lengths in the
 * order they come off it, and the offcut left over. Oversize parts get their own
 * clearly-flagged rows so they cannot be missed by someone reading the sheet.
 */
export function buildCutListCsv(plan) {
  const header = ['material', 'board', 'stockLengthMm', 'cutCount', 'cutLengthsMm', 'kerfLossMm', 'offcutMm', 'parts'];
  const lines = [header.join(',')];

  const cell = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  for (const group of plan.groups) {
    for (const board of group.boards) {
      lines.push(
        [
          cell(group.materialName),
          board.boardNumber,
          board.stockLengthMm,
          board.cuts.length,
          cell(board.cuts.map((cut) => cut.lengthMm).join(' | ')),
          board.kerfLossMm,
          board.offcutLengthMm,
          cell(board.cuts.map((cut) => cut.partName).join(' | ')),
        ].join(','),
      );
    }

    for (const item of group.oversize) {
      lines.push(
        [
          cell(group.materialName),
          'OVERSIZE',
          group.stockLengthMm,
          1,
          item.lengthMm,
          0,
          0,
          cell(`${item.partName} — exceeds stock by ${item.overBy}mm`),
        ].join(','),
      );
    }
  }

  return lines.join('\n');
}

/** README section describing the cut list. Empty when there is no linear stock. */
export function buildCutListReadmeLines(plan) {
  if (!plan.groups.length) {
    return [];
  }

  const lines = [
    '',
    'Linear cut list (cutlist.csv):',
    `  ${plan.summary.boardsNeeded} board(s) across ${plan.summary.materialCount} material(s), ` +
      `${plan.summary.efficiencyPercent}% of the stock ends up as parts.`,
    `  Kerf allowance: ${plan.kerfMm}mm per cut, charged on every cut including the one that frees the last piece.`,
  ];

  for (const group of plan.groups) {
    lines.push(
      `  ${group.materialName}: ${group.summary.boardsNeeded} x ${group.stockLengthMm}mm, ` +
        `${group.summary.offcutLengthM}m of offcut, ${group.summary.wastePercent}% waste.`,
    );
  }

  const oversize = plan.groups.flatMap((group) => group.oversize);
  if (oversize.length) {
    lines.push(
      `  WARNING: ${oversize.length} part(s) are longer than the stock they are assigned to and were NOT packed:`,
      ...oversize.map((item) => `    ${item.partName} needs ${item.lengthMm}mm, stock is ${item.stockLengthMm}mm.`),
    );
  }

  return lines;
}
