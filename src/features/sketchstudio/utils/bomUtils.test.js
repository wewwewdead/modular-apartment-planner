import { describe, expect, it } from 'vitest';
import { buildObjectBom, exportBomRows, groupBomRows } from './bomUtils';

describe('bomUtils', () => {
  it('groups identical bom rows', () => {
    const rows = groupBomRows([
      { partName: 'Shelf', role: 'shelf', material: 'plywood', thickness: 18, width: 500, height: 300, quantity: 1 },
      { partName: 'Shelf', role: 'shelf', material: 'plywood', thickness: 18, width: 500, height: 300, quantity: 1 },
      { partName: 'Door', role: 'door', material: 'oak', thickness: 18, width: 450, height: 700, quantity: 1 },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.partName === 'Shelf').quantity).toBe(2);
  });

  it('builds and exports bom rows', () => {
    const bom = buildObjectBom({
      parts: [
        { id: 'part-1', name: 'Panel', role: 'panel', material: 'plywood', thickness: 18, width: 500, height: 700 },
      ],
    });

    expect(bom[0]).toMatchObject({ partName: 'Panel', thickness: 18 });
    expect(exportBomRows(bom, 'csv')).toContain('partName,role,material');
  });
});
