import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMPLATE_MARGIN_MM,
  TEMPLATE_FOOTER_MM,
  buildPartTemplatePlan,
  buildTemplatePageSvg,
  buildTemplatePages,
  buildTemplatePlans,
  buildTemplatePrintDocumentHtml,
  selectTemplateParts,
} from '../export/templatePdfExport';
import { buildPrintableSvg } from '../export/pdfExport';

const SMALL_PART = {
  id: 'p-small',
  type: 'rect',
  x: 0,
  y: 0,
  width: 120,
  height: 80,
  materialId: 'birch-plywood-18',
  thickness: 18,
  layerId: 'default',
  meta: { label: 'Drawer front' },
};

/** Wider than one A4 usable width (190mm) and taller than one usable height. */
const BIG_PART = {
  id: 'p-big',
  type: 'rect',
  x: 1000,
  y: 500,
  width: 600,
  height: 400,
  materialId: 'oak-20x95',
  thickness: 20,
  grainAngle: 0,
  layerId: 'default',
  meta: { label: 'Side panel' },
};

const POCKET = {
  id: 'f-pocket',
  type: 'feature',
  shape: 'rect',
  operation: 'subtract',
  x: 1100,
  y: 600,
  width: 60,
  height: 20,
  depth: 6,
  through: false,
  layerId: 'default',
  meta: { manufacturingSourceEntityIds: ['p-big'] },
};

const NO_MATERIAL = { id: 'sketch-line', type: 'line', x1: 0, y1: 0, x2: 50, y2: 0, layerId: 'default' };

const ENTITIES = [SMALL_PART, BIG_PART, POCKET, NO_MATERIAL];

describe('selectTemplateParts', () => {
  it('templates the same parts the BOM bills, and nothing else', () => {
    expect(selectTemplateParts(ENTITIES).map((part) => part.id)).toEqual(['p-small', 'p-big']);
  });

  it('honours a selection', () => {
    expect(selectTemplateParts(ENTITIES, { selectedOnly: true, selectedIds: ['p-big'] }).map((p) => p.id)).toEqual([
      'p-big',
    ]);
    expect(selectTemplateParts(ENTITIES, { selectedOnly: true, selectedIds: [] })).toEqual([]);
  });
});

describe('buildPartTemplatePlan', () => {
  const plan = buildPartTemplatePlan(ENTITIES, BIG_PART);

  it('bounds the part with a small working margin', () => {
    expect(DEFAULT_TEMPLATE_MARGIN_MM).toBe(5);
    expect(plan.bounds).toEqual({ xMm: 995, yMm: 495, widthMm: 610, heightMm: 410 });
  });

  it('carries the part label, material and thickness', () => {
    expect(plan).toMatchObject({
      partId: 'p-big',
      partName: 'Side panel',
      materialName: 'Oak 20x95mm',
      thicknessMm: 20,
      grainAngle: 0,
    });
  });

  it('tiles a 610 x 410mm part across A4', () => {
    // A4 usable: 190 x (297 - 20 - 20) = 190 x 257. Overlap 10 -> strides 180 / 247.
    // columns: 190 + 180 + 180 + 180 = 730 >= 610 -> 4 columns (ceil((610-190)/180)+1)
    // rows: 257 + 247 = 504 >= 410 -> 2 rows
    expect(plan.layout.page.usableWidthMm).toBe(190);
    expect(plan.layout.page.usableHeightMm).toBe(297 - 20 - TEMPLATE_FOOTER_MM);
    expect(plan.layout.grid).toMatchObject({ columns: 4, rows: 2, pageCount: 8 });
  });

  it('fits a small part on a single page', () => {
    expect(buildPartTemplatePlan(ENTITIES, SMALL_PART).layout.grid.pageCount).toBe(1);
  });

  it('includes the part geometry and its joinery features', () => {
    const svg = plan.elements.join('\n');
    expect(svg).toContain('<rect x="1000" y="500" width="600" height="400"');
    expect(svg).toContain('<rect x="1100" y="600" width="60" height="20"');
  });

  it('draws a grain arrow only when the part declares a grain angle', () => {
    expect(plan.elements.join('\n')).toContain('GRAIN');
    expect(buildPartTemplatePlan(ENTITIES, SMALL_PART).elements.join('\n')).not.toContain('GRAIN');
  });

  it('returns null for a part with no drawable geometry', () => {
    expect(buildPartTemplatePlan([], { id: 'nothing' })).toBeNull();
  });

  it('honours the requested page size', () => {
    const letter = buildPartTemplatePlan(ENTITIES, BIG_PART, { pageId: 'letter' });
    expect(letter.layout.page.widthMm).toBeCloseTo(215.9, 6);
    expect(letter.layout.page.usableWidthMm).toBeCloseTo(195.9, 6);
    expect(letter.layout.page.usableHeightMm).toBeCloseTo(279.4 - 20 - TEMPLATE_FOOTER_MM, 6);
  });

  it('honours the requested overlap, and a bigger glue tab costs pages', () => {
    // A4 usable 190 wide; overlap 60 -> stride 130, so the 610mm part needs
    // ceil((610 - 190) / 130) + 1 = 5 columns instead of 4.
    const wide = buildPartTemplatePlan(ENTITIES, BIG_PART, { overlapMm: 60 });
    expect(wide.layout.grid.overlapMm).toBe(60);
    expect(wide.layout.grid.columns).toBe(5);
    expect(wide.layout.grid.pageCount).toBeGreaterThan(plan.layout.grid.pageCount);
  });

  it('never lets the overlap drop below the 10mm minimum', () => {
    expect(buildPartTemplatePlan(ENTITIES, BIG_PART, { overlapMm: 2 }).layout.grid.overlapMm).toBe(10);
  });
});

describe('buildTemplatePageSvg', () => {
  const plan = buildPartTemplatePlan(ENTITIES, BIG_PART);
  const first = buildTemplatePageSvg(plan, 0);
  const last = buildTemplatePageSvg(plan, plan.layout.pages.length - 1);

  it('is a page-sized SVG in millimetres', () => {
    expect(first).toContain('width="210mm" height="297mm"');
    expect(first).toContain('viewBox="0 0 210 297"');
  });

  it('places the geometry at 1:1 with a pure translation - no scale anywhere', () => {
    // The content origin (995, 495) has to land on the page margin (10, 10).
    expect(first).toContain('<g transform="translate(-985, -485)">');
    expect(first).not.toContain('scale(');
  });

  it('clips the drawing to the usable area so a page never bleeds a neighbour', () => {
    expect(first).toContain('clipPath id="tpl-clip-p-big-0"');
    expect(first).toContain('clip-path="url(#tpl-clip-p-big-0)"');
    expect(first).toContain('<rect x="10" y="10" width="190" height="257" />');
  });

  it('puts four registration crosses on every page', () => {
    for (let index = 0; index < plan.layout.pages.length; index += 1) {
      const svg = buildTemplatePageSvg(plan, index);
      expect(svg.match(/<circle cx=/g)).toHaveLength(4);
    }
  });

  it('puts the 100mm scale-check ruler labelled "verify 100mm" on EVERY page', () => {
    for (let index = 0; index < plan.layout.pages.length; index += 1) {
      const svg = buildTemplatePageSvg(plan, index);
      expect(svg).toContain('verify 100mm');
      expect(svg).toContain('<line x1="0" y1="0" x2="100" y2="0" />');
    }
  });

  it('marks the glue tab dashed on edges with a neighbour, and not elsewhere', () => {
    // Page 0 of a 4 x 2 grid has neighbours right and below: 2 dashed edges.
    expect(first.match(/stroke-dasharray="3 2"/g)).toHaveLength(2);
    // The last page (bottom-right) has neighbours left and above: also 2.
    expect(last.match(/stroke-dasharray="3 2"/g)).toHaveLength(2);
    // A single-page template has none at all.
    const single = buildTemplatePageSvg(buildPartTemplatePlan(ENTITIES, SMALL_PART), 0);
    expect(single).not.toContain('stroke-dasharray="3 2"');
  });

  it('labels the part, material, thickness and grid position', () => {
    expect(first).toContain('Side panel — Oak 20x95mm — 20mm');
    expect(first).toContain('R1C1 — sheet 1 of 8');
    expect(first).toContain('grain 0°');
    expect(last).toContain('R2C4 — sheet 8 of 8');
  });

  it('says the sheet is 1:1', () => {
    expect(first).toContain('1:1, print at 100% scale');
  });

  it('keeps the ruler and labels inside the footer band', () => {
    // Ruler baseline sits 6.5mm above the bottom margin: 297 - 10 - 6.5 = 280.5.
    expect(first).toContain('translate(10, 280.5)');
    // Its 13mm of ticks and numerals reach 267.5, which is below the usable
    // area's bottom edge at 10 + 257 = 267.
    expect(280.5 - 13).toBeGreaterThanOrEqual(10 + 257);
  });
});

describe('buildTemplatePages', () => {
  it('flattens every part into part-then-page order with unique clip ids', () => {
    const pages = buildTemplatePages(ENTITIES);
    expect(pages).toHaveLength(1 + 8);
    expect(pages[0].partId).toBe('p-small');
    expect(pages[1].partId).toBe('p-big');
    expect(pages[0].svg).toContain('tpl-clip-p0-0');
    expect(pages[1].svg).toContain('tpl-clip-p1-0');
    expect(pages[8].svg).toContain('tpl-clip-p1-7');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(buildTemplatePages(ENTITIES))).toBe(JSON.stringify(buildTemplatePages(ENTITIES)));
  });
});

describe('buildTemplatePrintDocumentHtml', () => {
  const html = buildTemplatePrintDocumentHtml(ENTITIES);

  it('sets the @page box to the paper size with no printer margin', () => {
    expect(html).toContain('@page { size: 210mm 297mm; margin: 0; }');
  });

  it('breaks after every sheet except the last', () => {
    // 1 sheet for the small part + 8 for the big one.
    expect(html.match(/class="tpl-page"/g)).toHaveLength(9);
    expect(html.match(/<div class="tpl-page" data-last="true">/g)).toHaveLength(1);
  });

  it('says something useful when there is nothing to template', () => {
    expect(buildTemplatePrintDocumentHtml([NO_MATERIAL])).toContain('nothing to template');
  });
});

describe('backward compatibility of the shared PDF primitives', () => {
  it('leaves the existing 1:1 PDF ruler caption untouched', () => {
    const svg = buildPrintableSvg([SMALL_PART]);
    expect(svg).toContain('100mm ruler - verify with a physical ruler');
    expect(svg).not.toContain('verify 100mm<');
  });

  it('still produces a single-document printable SVG with no template chrome', () => {
    const svg = buildPrintableSvg([SMALL_PART]);
    expect(svg).not.toContain('clipPath');
    expect(svg).not.toContain('stroke-dasharray="3 2"');
  });
});

describe('plans for the whole document', () => {
  it('builds one plan per material-bearing part', () => {
    expect(buildTemplatePlans(ENTITIES).map((plan) => plan.partId)).toEqual(['p-small', 'p-big']);
  });

  it('builds nothing when no part carries a material', () => {
    expect(buildTemplatePlans([NO_MATERIAL])).toEqual([]);
  });
});
