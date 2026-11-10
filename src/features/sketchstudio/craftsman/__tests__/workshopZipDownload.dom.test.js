// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildWorkshopPackageContents, generateWorkshopZip } from '../export/workshopExport';

const PANEL = { id: 'r1', type: 'rect', x: 0, y: 0, width: 200, height: 100, materialId: 'birch-plywood-18' };
const ROW = {
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
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('workshop ZIP download', () => {
  // JSZip is loaded on first use now; the archive must be the same one.
  it('downloads a ZIP holding every package file', async () => {
    let downloaded = null;
    URL.createObjectURL = vi.fn((blob) => {
      downloaded = blob;
      return 'blob:workshop';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const result = await generateWorkshopZip([PANEL], [ROW], 0.9, {}, 'Shelf');
    const expected = buildWorkshopPackageContents([PANEL], [ROW], 0.9, {}, 'Shelf');

    expect(result.fileCount).toBe(expected.files.length);
    const archive = await JSZip.loadAsync(
      await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsArrayBuffer(downloaded);
      }),
    );
    const names = Object.keys(archive.files).filter((name) => !archive.files[name].dir);
    expect(names.sort()).toEqual(expected.files.map((file) => `${expected.folderName}/${file.name}`).sort());
  });
});
