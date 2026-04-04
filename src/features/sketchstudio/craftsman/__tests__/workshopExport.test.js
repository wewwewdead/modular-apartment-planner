import { describe, expect, it } from 'vitest';
import { buildWorkshopPackageContents } from '../export/workshopExport';

describe('Workshop export content builder', () => {
  it('builds a deterministic workshop package without browser APIs', () => {
    const packageContents = buildWorkshopPackageContents(
      [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 200, height: 100, materialId: 'birch-plywood-18' }],
      [{
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
      }],
      0.9,
      { 'birch-plywood-18': 0.9 },
      'Shelf Unit',
    );

    expect(packageContents.folderName).toBe('Shelf Unit-Workshop');
    expect(packageContents.errors).toHaveLength(0);
    expect(packageContents.files.map((file) => file.name)).toEqual([
      'Shelf Unit.dxf',
      'Shelf Unit.svg',
      'cutting-list.csv',
      'cutting-list.html',
      'assembly-instructions.html',
      'README.txt',
    ]);
  });
});
