import { describe, expect, it } from 'vitest';
import { exportEntitiesToDxf } from '../export/dxfExport';

describe('DXF export', () => {
  it('produces valid DXF structure for a rect', () => {
    const entities = [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 600, height: 400 }];
    const dxf = exportEntitiesToDxf(entities);

    expect(dxf).toContain('AC1014');
    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('ENDSEC');
    expect(dxf).toContain('EOF');
  });

  it('produces valid DXF for empty entities', () => {
    const dxf = exportEntitiesToDxf([]);

    expect(dxf).toContain('AC1014');
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('EOF');
    expect(dxf).not.toContain('LWPOLYLINE');
  });

  it('applies kerf compensation to rect', () => {
    const entities = [{ id: 'r1', type: 'rect', x: 100, y: 100, width: 200, height: 100 }];

    const noKerf = exportEntitiesToDxf(entities);
    const withKerf = exportEntitiesToDxf(entities, { kerf: 0.4 });

    // With kerf, rect expands by 0.2 each side — different coordinates
    expect(withKerf).not.toEqual(noKerf);
    // Both should be valid DXF
    expect(withKerf).toContain('EOF');
    expect(withKerf).toContain('LWPOLYLINE');
  });

  it('filters by selection when selectedOnly is true', () => {
    const entities = [
      { id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 100 },
      { id: 'r2', type: 'rect', x: 200, y: 0, width: 100, height: 100 },
    ];

    const dxf = exportEntitiesToDxf(entities, { selectedOnly: true, selectedIds: ['r1'] });

    // Should contain exactly one LWPOLYLINE (for r1 only)
    const polylineCount = (dxf.match(/LWPOLYLINE/g) || []).length;
    expect(polylineCount).toBe(1);
  });

  it('skips non-exportable entity types', () => {
    const entities = [
      { id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 100 },
      { id: 't1', type: 'text', x: 0, y: 0, text: 'hello' },
      { id: 'd1', type: 'dimension' },
    ];

    const dxf = exportEntitiesToDxf(entities);
    const polylineCount = (dxf.match(/LWPOLYLINE/g) || []).length;
    expect(polylineCount).toBe(1);
  });

  it('exports circles correctly', () => {
    const entities = [{ id: 'c1', type: 'circle', cx: 50, cy: 50, radius: 25 }];
    const dxf = exportEntitiesToDxf(entities);
    expect(dxf).toContain('CIRCLE');
    expect(dxf).toContain('25');
  });

  it('exports lines correctly', () => {
    const entities = [{ id: 'l1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 200 }];
    const dxf = exportEntitiesToDxf(entities);
    expect(dxf).toContain('LINE');
  });
});
