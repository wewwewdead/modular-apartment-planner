import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CUT_KERF_MM,
  DEFAULT_STOCK_LENGTH_MM,
  buildCutListCsv,
  buildCutListReadmeLines,
  expandRequiredCuts,
  isLinearStockRow,
  optimizeLinearStock,
  resolveStockLengthMm,
} from '../utils/linearStockOptimizer';
import { getMaterialById } from '../data/materials';
import { getMaterialStockKind } from '../utils/entityManufacturingGeometry';

function lumberRow(overrides = {}) {
  return {
    partId: 'l1',
    partName: 'Rail',
    role: 'line',
    material: 'pine-20x45',
    materialName: 'Pine 20x45mm',
    thickness: 20,
    width: 600,
    height: 45,
    stockLength: 600,
    stockSectionWidth: 45,
    stockKind: 'linear',
    costBasis: 'perLinearMeter',
    quantity: 1,
    ...overrides,
  };
}

function sheetRow(overrides = {}) {
  return {
    partId: 'r1',
    partName: 'Panel',
    role: 'rect',
    material: 'birch-plywood-18',
    materialName: '18mm Birch Plywood',
    thickness: 18,
    width: 600,
    height: 400,
    stockKind: 'sheet',
    costBasis: 'perM2',
    quantity: 1,
    ...overrides,
  };
}

const NO_CATALOG = { lookupMaterial: () => null };

describe('lumber vs sheet classification', () => {
  it('follows the catalog rule the rest of the app already uses', () => {
    // getMaterialStockKind is the single source of truth: perLinearMeter is
    // linear, perPiece is hardware, everything else is sheet.
    expect(getMaterialStockKind(getMaterialById('pine-20x45'))).toBe('linear');
    expect(getMaterialStockKind(getMaterialById('oak-20x95'))).toBe('linear');
    expect(getMaterialStockKind(getMaterialById('steel-sq-25'))).toBe('linear');
    expect(getMaterialStockKind(getMaterialById('birch-plywood-18'))).toBe('sheet');
    expect(getMaterialStockKind(getMaterialById('mdf-18'))).toBe('sheet');
    expect(getMaterialStockKind(getMaterialById('aluminum-3'))).toBe('sheet');
    expect(getMaterialStockKind(getMaterialById('hw-screw-8-40'))).toBe('piece');
  });

  it('accepts linear rows and rejects sheet and hardware rows', () => {
    expect(isLinearStockRow(lumberRow())).toBe(true);
    expect(isLinearStockRow(sheetRow())).toBe(false);
    expect(isLinearStockRow({ stockKind: 'piece', role: 'hardware' })).toBe(false);
  });

  it('falls back to costBasis for rows built before stockKind existed', () => {
    expect(isLinearStockRow({ costBasis: 'perLinearMeter' })).toBe(true);
    expect(isLinearStockRow({ costBasis: 'perM2' })).toBe(false);
  });
});

describe('stock length resolution', () => {
  it('reads stockLengthMm off the catalog', () => {
    expect(getMaterialById('pine-20x45').stockLengthMm).toBe(2400);
    expect(getMaterialById('oak-20x95').stockLengthMm).toBe(2400);
    expect(getMaterialById('steel-sq-25').stockLengthMm).toBe(6000);
    expect(resolveStockLengthMm('pine-20x45', lumberRow())).toBe(2400);
    expect(resolveStockLengthMm('steel-sq-25', lumberRow({ material: 'steel-sq-25' }))).toBe(6000);
  });

  it('never puts stockLengthMm on sheet goods or hardware', () => {
    expect(getMaterialById('birch-plywood-18').stockLengthMm).toBeUndefined();
    expect(getMaterialById('hw-screw-8-40').stockLengthMm).toBeUndefined();
  });

  it('defaults a custom material with no stockLengthMm to 2400mm', () => {
    expect(resolveStockLengthMm('custom-oak', lumberRow(), NO_CATALOG)).toBe(DEFAULT_STOCK_LENGTH_MM);
    expect(DEFAULT_STOCK_LENGTH_MM).toBe(2400);
  });

  it('lets the caller override per material', () => {
    expect(resolveStockLengthMm('pine-20x45', lumberRow(), { stockLengthsMm: { 'pine-20x45': 3000 } })).toBe(3000);
  });

  it('prefers a length carried on the row over the catalog', () => {
    expect(resolveStockLengthMm('pine-20x45', lumberRow({ stockLengthMm: 1800 }))).toBe(1800);
  });
});

describe('expandRequiredCuts', () => {
  it('expands quantity into individual lengths, longest first', () => {
    const cuts = expandRequiredCuts([
      lumberRow({ partName: 'Short', stockLength: 300, quantity: 2 }),
      lumberRow({ partName: 'Long', stockLength: 900, quantity: 1 }),
    ]);

    expect(cuts.map((cut) => cut.lengthMm)).toEqual([900, 300, 300]);
    expect(cuts.map((cut) => cut.partName)).toEqual(['Long', 'Short', 'Short']);
  });

  it('ignores sheet and hardware rows entirely', () => {
    expect(expandRequiredCuts([sheetRow(), { stockKind: 'piece', role: 'hardware', quantity: 8 }])).toEqual([]);
  });

  it('skips rows with no usable length instead of packing a zero', () => {
    expect(expandRequiredCuts([lumberRow({ stockLength: 0, width: 0, height: 0 })])).toEqual([]);
  });
});

describe('FFD packing - hand-solved cases', () => {
  /*
   * CASE 1
   * Stock 2400mm, kerf 3mm. Required: 1000, 1000, 700 (all pine 20x45).
   * Sorted decreasing: 1000, 1000, 700.
   *   board 1: 1000 (+3 kerf) -> consumed 1003, remaining 1397
   *            1000 (+3)      -> consumed 2006, remaining  394
   *            700 does not fit (needs 703) -> new board
   *   board 2: 700 (+3)       -> consumed  703, offcut 1697
   * => 2 boards, offcuts 394 and 1697.
   */
  it('CASE 1: packs 1000 + 1000 on the first board and spills 700 onto a second', () => {
    const plan = optimizeLinearStock(
      [
        lumberRow({ partName: 'A', stockLength: 1000, quantity: 2 }),
        lumberRow({ partName: 'B', stockLength: 700, quantity: 1 }),
      ],
      { kerfMm: 3 },
    );

    const group = plan.groups[0];
    expect(group.stockLengthMm).toBe(2400);
    expect(group.boards).toHaveLength(2);
    expect(group.boards[0].cuts.map((cut) => cut.lengthMm)).toEqual([1000, 1000]);
    expect(group.boards[0].consumedLengthMm).toBe(2006);
    expect(group.boards[0].offcutLengthMm).toBe(394);
    expect(group.boards[1].cuts.map((cut) => cut.lengthMm)).toEqual([700]);
    expect(group.boards[1].offcutLengthMm).toBe(1697);
  });

  /*
   * CASE 2 - first fit, not best fit.
   * Stock 1000mm, kerf 0. Required: 600, 400, 300.
   *   board 1: 600 -> remaining 400
   *            400 -> remaining   0   (exact fit, must be allowed)
   *   board 2: 300 -> offcut 700
   * A best-fit-decreasing packer would make the same choice here; the point of
   * the case is the EXACT fit at zero remaining, which an off-by-one in the
   * remaining-space test would reject.
   */
  it('CASE 2: allows a cut that exactly fills the remaining length', () => {
    const plan = optimizeLinearStock(
      [
        lumberRow({ partName: 'A', stockLength: 600 }),
        lumberRow({ partName: 'B', stockLength: 400 }),
        lumberRow({ partName: 'C', stockLength: 300 }),
      ],
      { kerfMm: 0, stockLengthsMm: { 'pine-20x45': 1000 } },
    );

    const group = plan.groups[0];
    expect(group.boards).toHaveLength(2);
    expect(group.boards[0].cuts.map((cut) => cut.lengthMm)).toEqual([600, 400]);
    expect(group.boards[0].offcutLengthMm).toBe(0);
    expect(group.boards[1].cuts.map((cut) => cut.lengthMm)).toEqual([300]);
  });

  /*
   * CASE 3 - first fit puts a later, shorter piece back on an earlier board.
   * Stock 1000mm, kerf 0. Required: 700, 500, 300, 200.
   *   board 1: 700 -> remaining 300
   *   board 2: 500 -> remaining 500
   *   board 1: 300 -> remaining   0   (first fit scans board 1 first)
   *   board 2: 200 -> remaining 300
   * => 2 boards. A naive "fill the newest board" packer would need 3.
   */
  it('CASE 3: back-fills an earlier board rather than opening a new one', () => {
    const plan = optimizeLinearStock(
      [
        lumberRow({ partName: 'A', stockLength: 700 }),
        lumberRow({ partName: 'B', stockLength: 500 }),
        lumberRow({ partName: 'C', stockLength: 300 }),
        lumberRow({ partName: 'D', stockLength: 200 }),
      ],
      { kerfMm: 0, stockLengthsMm: { 'pine-20x45': 1000 } },
    );

    const group = plan.groups[0];
    expect(group.boards).toHaveLength(2);
    expect(group.boards[0].cuts.map((cut) => cut.lengthMm)).toEqual([700, 300]);
    expect(group.boards[1].cuts.map((cut) => cut.lengthMm)).toEqual([500, 200]);
  });

  it('records the running position of each cut along the board', () => {
    const plan = optimizeLinearStock([lumberRow({ stockLength: 500, quantity: 3 })], { kerfMm: 3 });
    const cuts = plan.groups[0].boards[0].cuts;
    // 0..500, then 503..1003, then 1006..1506 - each piece starts one kerf past
    // the end of the last.
    expect(cuts.map((cut) => [cut.startMm, cut.endMm])).toEqual([
      [0, 500],
      [503, 1003],
      [1006, 1506],
    ]);
  });
});

describe('kerf accounting', () => {
  it('charges exactly n x kerf for n cuts on a board', () => {
    for (const count of [1, 2, 5, 8]) {
      const plan = optimizeLinearStock([lumberRow({ stockLength: 200, quantity: count })], { kerfMm: 3 });
      const board = plan.groups[0].boards[0];
      expect(board.cuts).toHaveLength(count);
      expect(board.kerfLossMm).toBe(count * 3);
      expect(board.consumedLengthMm).toBe(count * 200 + count * 3);
      expect(board.offcutLengthMm).toBe(2400 - count * 203);
    }
  });

  it('charges the kerf on the cut that frees the last piece too', () => {
    // One 200mm piece off a 2400mm board still costs one kerf.
    const plan = optimizeLinearStock([lumberRow({ stockLength: 200, quantity: 1 })], { kerfMm: 3 });
    expect(plan.groups[0].boards[0].kerfLossMm).toBe(3);
    expect(plan.groups[0].boards[0].offcutLengthMm).toBe(2197);
  });

  it('defaults to a 3mm kerf and accepts zero', () => {
    expect(optimizeLinearStock([lumberRow()]).kerfMm).toBe(DEFAULT_CUT_KERF_MM);
    expect(DEFAULT_CUT_KERF_MM).toBe(3);
    expect(optimizeLinearStock([lumberRow()], { kerfMm: 0 }).kerfMm).toBe(0);
    expect(optimizeLinearStock([lumberRow()], { kerfMm: 'wide' }).kerfMm).toBe(DEFAULT_CUT_KERF_MM);
  });

  it('makes the kerf change the board count when it tips a piece over the edge', () => {
    // 12 x 200 = 2400 fits a 2400mm board with no kerf, but not with one.
    const noKerf = optimizeLinearStock([lumberRow({ stockLength: 200, quantity: 12 })], { kerfMm: 0 });
    const withKerf = optimizeLinearStock([lumberRow({ stockLength: 200, quantity: 12 })], { kerfMm: 3 });
    expect(noKerf.groups[0].boards).toHaveLength(1);
    expect(withKerf.groups[0].boards).toHaveLength(2);
    expect(withKerf.groups[0].boards[0].cuts).toHaveLength(11);
  });

  it('rolls kerf into the waste percentage, never into the used length', () => {
    const plan = optimizeLinearStock([lumberRow({ stockLength: 1000, quantity: 2 })], { kerfMm: 3 });
    const summary = plan.groups[0].summary;
    expect(summary.usedLengthMm).toBe(2000);
    expect(summary.kerfLossMm).toBe(6);
    expect(summary.offcutLengthMm).toBe(394);
    expect(summary.wasteLengthMm).toBe(400); // 6 kerf + 394 offcut
    expect(summary.usedLengthMm + summary.wasteLengthMm).toBe(summary.totalStockLengthMm);
  });
});

describe('oversize parts', () => {
  it('reports a part longer than the stock instead of dropping it', () => {
    const plan = optimizeLinearStock(
      [lumberRow({ partName: 'Long rail', stockLength: 3200 }), lumberRow({ partName: 'Short', stockLength: 400 })],
      { kerfMm: 3 },
    );

    const group = plan.groups[0];
    expect(group.oversize).toEqual([
      { partName: 'Long rail', partId: 'l1', lengthMm: 3200, stockLengthMm: 2400, overBy: 803 },
    ]);
    // The rest of the job still gets packed.
    expect(group.boards).toHaveLength(1);
    expect(group.boards[0].cuts.map((cut) => cut.lengthMm)).toEqual([400]);
    expect(plan.summary.oversizeCount).toBe(1);
  });

  it('treats a part that fits only without its kerf as oversize', () => {
    const exact = optimizeLinearStock([lumberRow({ stockLength: 2400 })], { kerfMm: 3 });
    expect(exact.groups[0].oversize).toHaveLength(1);
    expect(exact.groups[0].boards).toHaveLength(0);

    const noKerf = optimizeLinearStock([lumberRow({ stockLength: 2400 })], { kerfMm: 0 });
    expect(noKerf.groups[0].oversize).toHaveLength(0);
    expect(noKerf.groups[0].boards).toHaveLength(1);
  });

  it('surfaces oversize parts in the README section and the CSV', () => {
    const plan = optimizeLinearStock([lumberRow({ partName: 'Long rail', stockLength: 3200 })], { kerfMm: 3 });
    expect(buildCutListReadmeLines(plan).join('\n')).toContain('Long rail needs 3200mm, stock is 2400mm');
    expect(buildCutListCsv(plan)).toContain('OVERSIZE');
  });
});

describe('multi-material grouping', () => {
  const plan = optimizeLinearStock(
    [
      lumberRow({ partName: 'Pine rail', stockLength: 1000, quantity: 2 }),
      lumberRow({
        partName: 'Oak stile',
        material: 'oak-20x95',
        materialName: 'Oak 20x95mm',
        stockLength: 800,
        quantity: 3,
      }),
      lumberRow({
        partName: 'Steel leg',
        material: 'steel-sq-25',
        materialName: 'Steel SQ Tube 25x25x1.5mm',
        stockLength: 1500,
        quantity: 4,
      }),
      sheetRow(),
    ],
    { kerfMm: 3 },
  );

  it('packs each material against its own stock length', () => {
    expect(plan.groups.map((group) => [group.materialName, group.stockLengthMm])).toEqual([
      ['Oak 20x95mm', 2400],
      ['Pine 20x45mm', 2400],
      ['Steel SQ Tube 25x25x1.5mm', 6000],
    ]);
  });

  it('aggregates a summary across every material', () => {
    // Oak 3 x 800 -> 1 board; pine 2 x 1000 -> 1 board; steel 4 x 1500 -> 1 board
    // (4 x 1503 = 6012 > 6000, so it is 3 + 1 = 2 boards).
    expect(plan.summary.materialCount).toBe(3);
    expect(plan.summary.boardsNeeded).toBe(plan.groups.reduce((sum, g) => sum + g.summary.boardsNeeded, 0));
    expect(plan.summary.totalCuts).toBe(9);
  });

  it('leaves sheet stock entirely out of the plan', () => {
    expect(plan.groups.some((group) => group.material === 'birch-plywood-18')).toBe(false);
  });
});

describe('determinism', () => {
  const rows = [
    lumberRow({ partName: 'B', stockLength: 700 }),
    lumberRow({ partName: 'A', stockLength: 700 }),
    lumberRow({ partName: 'C', stockLength: 500, quantity: 3 }),
    lumberRow({ partName: 'D', material: 'oak-20x95', materialName: 'Oak 20x95mm', stockLength: 900, quantity: 2 }),
  ];

  it('produces byte-identical plans across repeated runs', () => {
    const first = JSON.stringify(optimizeLinearStock(rows, { kerfMm: 3 }));
    for (let run = 0; run < 5; run += 1) {
      expect(JSON.stringify(optimizeLinearStock(rows, { kerfMm: 3 }))).toBe(first);
    }
  });

  it('breaks length ties on a total order, so equal-length parts never shuffle', () => {
    const plan = optimizeLinearStock(rows, { kerfMm: 3 });
    const pine = plan.groups.find((group) => group.material === 'pine-20x45');
    // A and B are both 700mm; the tie-break is part name, so A comes first.
    expect(pine.boards[0].cuts.map((cut) => cut.partName)).toEqual(['A', 'B', 'C']);
  });

  it('produces an identical CSV across repeated runs', () => {
    const csv = buildCutListCsv(optimizeLinearStock(rows, { kerfMm: 3 }));
    expect(buildCutListCsv(optimizeLinearStock(rows, { kerfMm: 3 }))).toBe(csv);
  });
});

describe('cutlist.csv', () => {
  const plan = optimizeLinearStock(
    [
      lumberRow({ partName: 'Rail', stockLength: 1000, quantity: 2 }),
      lumberRow({ partName: 'Stub', stockLength: 300 }),
    ],
    { kerfMm: 3 },
  );
  const csv = buildCutListCsv(plan);
  const lines = csv.split('\n');

  it('has one header and one row per board', () => {
    expect(lines[0]).toBe('material,board,stockLengthMm,cutCount,cutLengthsMm,kerfLossMm,offcutMm,parts');
    expect(lines).toHaveLength(1 + plan.summary.boardsNeeded);
  });

  it('lists cut lengths in the order they come off the board, with the offcut', () => {
    expect(lines[1]).toBe('Pine 20x45mm,1,2400,3,1000 | 1000 | 300,9,91,Rail | Rail | Stub');
  });

  it('quotes material names containing a comma', () => {
    const quoted = buildCutListCsv(
      optimizeLinearStock([lumberRow({ materialName: 'Pine, dressed', stockLength: 400 })], { kerfMm: 3 }),
    );
    expect(quoted).toContain('"Pine, dressed"');
  });
});

describe('empty input', () => {
  it('produces an empty plan and no README section', () => {
    const plan = optimizeLinearStock([]);
    expect(plan.groups).toEqual([]);
    expect(plan.summary.boardsNeeded).toBe(0);
    expect(buildCutListReadmeLines(plan)).toEqual([]);
    expect(buildCutListCsv(plan)).toBe('material,board,stockLengthMm,cutCount,cutLengthsMm,kerfLossMm,offcutMm,parts');
  });
});
