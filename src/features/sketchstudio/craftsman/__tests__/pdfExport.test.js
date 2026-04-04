import { describe, expect, it } from 'vitest';
import { buildPrintDocumentHtml, buildPrintableSvg } from '../export/pdfExport';

describe('PDF export content builders', () => {
  it('builds printable SVG content without touching the DOM', () => {
    const svg = buildPrintableSvg([{ id: 'r1', type: 'rect', x: 0, y: 0, width: 200, height: 100 }]);

    expect(svg).toContain('<svg');
    expect(svg).toContain('100mm ruler');
    expect(svg).toContain('width="240mm"');
  });

  it('builds the print document HTML around the generated SVG', () => {
    const html = buildPrintDocumentHtml([{ id: 'r1', type: 'rect', x: 0, y: 0, width: 200, height: 100 }]);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Craftsman Studio - set "Scale: 100%"');
    expect(html).toContain('<svg');
  });
});
