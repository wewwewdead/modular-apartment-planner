import { describe, expect, it } from 'vitest';
import { buildWorkshopPackageContents } from '../export/workshopExport';

const PANEL_ENTITY = {
  id: 'r1',
  type: 'rect',
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  materialId: 'birch-plywood-18',
  thickness: 18,
  meta: { label: 'Back panel' },
};

const RAIL_ENTITY = {
  id: 'l1',
  type: 'line',
  x1: 0,
  y1: 300,
  x2: 1200,
  y2: 300,
  materialId: 'pine-20x45',
  thickness: 20,
};

function panelRow(overrides = {}) {
  return {
    partId: 'r1',
    partName: 'Back panel',
    role: 'rect',
    material: 'birch-plywood-18',
    materialName: '18mm Birch Plywood',
    thickness: 18,
    width: 200,
    height: 100,
    stockKind: 'sheet',
    costBasis: 'perM2',
    quantity: 1,
    dimensionAccuracy: 'exact',
    ...overrides,
  };
}

function railRow(overrides = {}) {
  return {
    partId: 'l1',
    partName: 'Rail',
    role: 'line',
    material: 'pine-20x45',
    materialName: 'Pine 20x45mm',
    thickness: 20,
    width: 1200,
    height: 45,
    stockLength: 1200,
    stockSectionWidth: 45,
    stockKind: 'linear',
    costBasis: 'perLinearMeter',
    quantity: 3,
    dimensionAccuracy: 'exact',
    ...overrides,
  };
}

function fileNames(packageContents) {
  return packageContents.files.map((file) => file.name);
}

function readFile(packageContents, name) {
  return packageContents.files.find((file) => file.name === name)?.content;
}

describe('workshop package - Shaper Origin files', () => {
  const contents = buildWorkshopPackageContents(
    [PANEL_ENTITY, RAIL_ENTITY],
    [panelRow(), railRow()],
    10,
    {},
    'Bookcase',
  );

  it('adds one SVG per part plus a combined file under shaper/', () => {
    const shaperFiles = fileNames(contents).filter((name) => name.startsWith('shaper/'));
    expect(shaperFiles).toEqual(['shaper/Back-panel-r1.svg', 'shaper/l1.svg', 'shaper/all-parts.svg']);
  });

  it('colour-codes the part perimeter as an exterior cut', () => {
    const svg = readFile(contents, 'shaper/Back-panel-r1.svg');
    expect(svg).toContain('fill="#FFFFFF" stroke="#000000"');
    expect(svg).toContain('data-shaper-cut="exterior"');
  });

  it('documents the colour contract and the kerf rule in the README', () => {
    const readme = readFile(contents, 'README.txt');
    expect(readme).toContain('Shaper Origin (shaper/):');
    expect(readme).toContain('white fill + black stroke = exterior cut');
    expect(readme).toContain('black fill                = interior cut');
    expect(readme).toContain('grey fill  (#808080)      = pocket');
    expect(readme).toContain('blue stroke (#0068FF)     = guide only');
    expect(readme).toContain('Kerf is NOT compensated in these files');
  });

  it('lists the intended depth of every cut for the operator', () => {
    const readme = readFile(contents, 'README.txt');
    expect(readme).toContain('Intended depth per cut (Origin ignores it; set depth on the tool)');
    expect(readme).toContain('Back-panel-r1.svg - 1x exterior @ 18mm');
    expect(readme).toContain('l1.svg - 1x online');
  });

  it('keeps a blank line between the README sections', () => {
    expect(readFile(contents, 'README.txt')).toContain('\n\nShaper Origin (shaper/):');
  });

  it('tells the operator corner relief is off, and applies it when it is on', () => {
    expect(readFile(contents, 'README.txt')).toContain('Corner relief is off.');

    const relieved = buildWorkshopPackageContents([PANEL_ENTITY], [panelRow()], 10, {}, 'Bookcase', {
      dogbone: { style: 'dogbone', bitDiameter: 6.35 },
    });
    expect(readFile(relieved, 'README.txt')).toContain('Corner relief IS applied, the same as the DXFs');
  });
});

describe('workshop package - cutlist.csv', () => {
  const contents = buildWorkshopPackageContents(
    [PANEL_ENTITY, RAIL_ENTITY],
    [panelRow(), railRow()],
    10,
    {},
    'Bookcase',
    { cutKerfMm: 3 },
  );

  it('adds cutlist.csv when the project has linear stock', () => {
    expect(fileNames(contents)).toContain('cutlist.csv');
  });

  it('lists each board with its cut sequence and offcut', () => {
    // Three 1200mm rails on 2400mm pine boards at a 3mm kerf. Each rail costs
    // 1203mm of board, and 2 x 1203 = 2406 > 2400, so only one rail fits per
    // board: 3 boards, each with 1197mm of offcut.
    const csv = readFile(contents, 'cutlist.csv');
    expect(csv.split('\n')[0]).toBe('material,board,stockLengthMm,cutCount,cutLengthsMm,kerfLossMm,offcutMm,parts');
    expect(csv).toContain('Pine 20x45mm,1,2400,1,1200,3,1197,Rail');
    expect(csv.split('\n')).toHaveLength(4); // header + 3 boards
  });

  it('describes the cut list in the README', () => {
    const readme = readFile(contents, 'README.txt');
    expect(readme).toContain('cutlist.csv - 1D cut list');
    expect(readme).toContain('Linear cut list (cutlist.csv):');
    expect(readme).toContain('Kerf allowance: 3mm per cut');
    expect(readme).toContain('Pine 20x45mm: 3 x 2400mm');
  });

  it('honours a per-material stock length override', () => {
    const longStock = buildWorkshopPackageContents([RAIL_ENTITY], [railRow()], 10, {}, 'Bookcase', {
      cutKerfMm: 3,
      linearStockLengthsMm: { 'pine-20x45': 3900 },
    });
    expect(readFile(longStock, 'cutlist.csv')).toContain('Pine 20x45mm,1,3900,3,1200 | 1200 | 1200,9,291,');
  });

  it('omits cutlist.csv entirely for an all-sheet-goods project', () => {
    const sheetOnly = buildWorkshopPackageContents([PANEL_ENTITY], [panelRow()], 10, {}, 'Bookcase');
    expect(fileNames(sheetOnly)).not.toContain('cutlist.csv');
    expect(readFile(sheetOnly, 'README.txt')).not.toContain('Linear cut list');
  });

  it('stays deterministic across repeated builds', () => {
    const again = buildWorkshopPackageContents(
      [PANEL_ENTITY, RAIL_ENTITY],
      [panelRow(), railRow()],
      10,
      {},
      'Bookcase',
      { cutKerfMm: 3 },
    );
    expect(JSON.stringify(again.files)).toBe(JSON.stringify(contents.files));
  });
});
