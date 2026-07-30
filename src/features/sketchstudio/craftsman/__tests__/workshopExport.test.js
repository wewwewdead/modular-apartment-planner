import { describe, expect, it } from 'vitest';
import { buildWorkshopPackageContents } from '../export/workshopExport';

const PANEL_ENTITY = { id: 'r1', type: 'rect', x: 0, y: 0, width: 200, height: 100, materialId: 'birch-plywood-18' };

function panelRow(overrides = {}) {
  return {
    partId: 'r1',
    entityIds: ['r1'],
    partName: 'Panel',
    role: 'rect',
    material: 'birch-plywood-18',
    materialName: '18mm Birch Plywood',
    thickness: 18,
    width: 200,
    height: 100,
    quantity: 1,
    area: 0.02,
    totalCost: 0.9,
    dimensionAccuracy: 'exact',
    costAccuracy: 'exact',
    ...overrides,
  };
}

function railRow(overrides = {}) {
  return {
    partId: 'l1',
    entityIds: ['l1'],
    partName: 'Rail',
    role: 'line',
    material: 'steel-sq-25',
    materialName: 'Steel SQ Tube 25x25x1.5mm',
    thickness: 1.5,
    width: 1200,
    height: 25,
    quantity: 2,
    stockKind: 'linear',
    costBasis: 'perLinearMeter',
    defaultStockLength: 6000,
    dimensionAccuracy: 'exact',
    costAccuracy: 'exact',
    ...overrides,
  };
}

function fileNames(packageContents) {
  return packageContents.files.map((file) => file.name);
}

function readFile(packageContents, name) {
  return packageContents.files.find((file) => file.name === name)?.content;
}

describe('Workshop export content builder', () => {
  it('builds a deterministic workshop package without browser APIs', () => {
    const packageContents = buildWorkshopPackageContents(
      [PANEL_ENTITY],
      [panelRow()],
      0.9,
      { 'birch-plywood-18': 0.9 },
      'Shelf Unit',
    );

    expect(packageContents.folderName).toBe('Shelf Unit-Workshop');
    expect(packageContents.errors).toHaveLength(0);
    expect(fileNames(packageContents)).toEqual([
      'Shelf Unit.dxf',
      'sheets/sheet-01.dxf',
      'Shelf Unit.svg',
      'cutting-list.csv',
      'cutting-list.html',
      'assembly-instructions.html',
      'README.txt',
    ]);
  });

  it('nests the real part geometry into each per-sheet DXF', () => {
    const packageContents = buildWorkshopPackageContents(
      [{ ...PANEL_ENTITY, x: 900, y: 900 }],
      [panelRow()],
      0.9,
      {},
      'Shelf Unit',
      { sheetSize: { width: 1000, height: 800 }, bladeKerf: 3 },
    );

    const sheet = readFile(packageContents, 'sheets/sheet-01.dxf');
    expect(sheet).toContain('LWPOLYLINE');
    expect(sheet).toContain('SHEET');
    // Stock outline corner plus a part translated to the sheet origin, i.e. the
    // sketch-space offset of 900,900 is gone.
    expect(sheet).toContain('\n1000\n');
    expect(sheet).not.toContain('\n900\n');
  });

  it('emits one DXF per sheet when the parts do not fit on a single sheet', () => {
    const entities = [1, 2, 3].map((index) => ({
      id: `r${index}`,
      type: 'rect',
      x: 0,
      y: 0,
      width: 1300,
      height: 900,
      materialId: 'birch-plywood-18',
    }));
    const packageContents = buildWorkshopPackageContents(
      entities,
      [panelRow({ entityIds: ['r1', 'r2', 'r3'], width: 1300, height: 900, quantity: 3 })],
      0,
      {},
      'Big Panels',
    );

    expect(fileNames(packageContents).filter((name) => name.startsWith('sheets/'))).toEqual([
      'sheets/sheet-01.dxf',
      'sheets/sheet-02.dxf',
      'sheets/sheet-03.dxf',
    ]);
    expect(readFile(packageContents, 'README.txt')).toContain('sheets/sheet-01.dxf .. sheet-03.dxf');
    expect(readFile(packageContents, 'README.txt')).toContain('3 nested sheets');
    expect(packageContents.errors).toHaveLength(0);
  });

  it('lists the nested sheets in the README when there is one sheet', () => {
    const packageContents = buildWorkshopPackageContents([PANEL_ENTITY], [panelRow()], 0.9, {}, 'Shelf Unit');

    expect(readFile(packageContents, 'README.txt')).toContain('sheets/sheet-01.dxf - 1 nested sheet');
  });

  it('emits no per-sheet files and no warning when nothing is sheet-nestable', () => {
    const linearOnly = buildWorkshopPackageContents(
      [{ id: 'l1', type: 'line', x1: 0, y1: 0, x2: 1200, y2: 0, materialId: 'steel-sq-25' }],
      [railRow()],
      12,
      {},
      'Steel Frame',
    );

    expect(fileNames(linearOnly).some((name) => name.startsWith('sheets/'))).toBe(false);
    expect(linearOnly.errors).toHaveLength(0);
    expect(readFile(linearOnly, 'README.txt')).not.toContain('sheets/');

    const emptyBom = buildWorkshopPackageContents([PANEL_ENTITY], [], 0, {}, 'Empty');
    expect(fileNames(emptyBom).some((name) => name.startsWith('sheets/'))).toBe(false);
    expect(emptyBom.errors).toHaveLength(0);
    expect(readFile(emptyBom, 'README.txt')).not.toContain('sheets/');
  });

  it('contains a nesting failure without losing the rest of the package', () => {
    const packageContents = buildWorkshopPackageContents([PANEL_ENTITY], [panelRow()], 0.9, {}, 'Shelf Unit', {
      sheetSize: {
        get width() {
          throw new Error('bad sheet size');
        },
        height: 1220,
      },
    });

    expect(packageContents.errors).toEqual(['Nested sheet DXF: bad sheet size']);
    expect(fileNames(packageContents)).toEqual([
      'Shelf Unit.dxf',
      'Shelf Unit.svg',
      'cutting-list.csv',
      'cutting-list.html',
      'assembly-instructions.html',
      'README.txt',
    ]);
    const readme = readFile(packageContents, 'README.txt');
    expect(readme).not.toContain('sheets/');
    expect(readme).toContain('Warnings during export:');
  });
});
