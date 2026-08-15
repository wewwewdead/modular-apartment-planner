/**
 * Full-scale (1:1) tiled paper templates.
 *
 * One part per template, each rendered so that 1mm of geometry is 1mm of paper,
 * split across as many A4 / Letter sheets as it takes. Glue the sheets on their
 * registration crosses and you have a paper copy of the part you can lay on the
 * stock and trace, which is how a hand-tool shop uses CAD.
 *
 * What each page carries
 * ----------------------
 *   - the part geometry, clipped to the page's usable area, at 1:1;
 *   - a registration cross in each corner of the usable area, inset by half the
 *     overlap so the same cross lands on the neighbouring sheet too (the
 *     alignment argument lives in `pageTilingUtils`);
 *   - a dashed line along every edge that has a neighbour, marking the glue tab;
 *   - a 100.0mm scale-check ruler labelled "verify 100mm" - on EVERY page, not
 *     just the first, because a printer that silently scales does it to all of
 *     them and the maker must be able to catch it on whichever sheet they pick
 *     up;
 *   - the part name, material, thickness, and the page's grid position.
 *
 * A grain arrow is drawn at the part's centre in WORLD space, so it lands on
 * whichever sheet contains the centre rather than being repeated per page and
 * pointing at nothing.
 *
 * Reuse
 * -----
 * Geometry comes from `buildSvgExportDocument`, so cut lines, feature lines and
 * joinery lines keep exactly the lineweight conventions the single-document SVG
 * and the 1:1 PDF already use. The ruler is `pdfExport`'s ruler primitive, and
 * printing goes through `pdfExport`'s iframe. Only the tiling is new.
 */

import { computeEntityBoundingBox } from '../../utils/bboxUtils';
import { buildMaterialCatalogById } from '../data/materials';
import { entityToBomRow, isEntityBomEligible } from '../utils/entityBomAdapter';
import { normalizeGrainAngle } from '../utils/grainUtils';
import { selectPartCutEntities } from './dxfExport';
import { buildRulerSvg, printHtmlDocument } from './pdfExport';
import { buildSvgExportDocument } from './svgExport';
import { DEFAULT_OVERLAP_MM, buildPageLayout, resolvePageGeometry } from './pageTilingUtils';

/** Breathing room around the part so a cut line never sits on a glue seam. */
export const DEFAULT_TEMPLATE_MARGIN_MM = 5;

/** Reserved bottom band: 13mm of ruler above its baseline, 6mm of caption below. */
export const TEMPLATE_FOOTER_MM = 20;

const REGISTRATION_ARM_MM = 5;
const REGISTRATION_RING_MM = 2;
const GLUE_DASH = '3 2';
const GRAIN_ARROW_MAX_MM = 120;

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function round(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function isEntitySelected(entity, selectedIds = []) {
  return selectedIds.includes(entity.id);
}

/**
 * Parts a template can be produced for: the same BOM-eligible entities the
 * cutting list bills, so "every part" means the same set everywhere in the app.
 */
export function selectTemplateParts(entities = [], options = {}) {
  const parts = entities.filter((entity) => isEntityBomEligible(entity));
  return options.selectedOnly ? parts.filter((entity) => isEntitySelected(entity, options.selectedIds || [])) : parts;
}

function computeTightBounds(partEntities, referenceEntities, marginMm) {
  const boxes = partEntities.map((entity) => computeEntityBoundingBox(entity, referenceEntities)).filter(Boolean);
  if (!boxes.length) {
    return null;
  }

  const minX = Math.min(...boxes.map((box) => box.minX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const maxY = Math.max(...boxes.map((box) => box.maxY));

  return {
    xMm: minX - marginMm,
    yMm: minY - marginMm,
    widthMm: maxX - minX + marginMm * 2,
    heightMm: maxY - minY + marginMm * 2,
  };
}

function buildGrainArrowSvg(bounds, grainAngleDeg) {
  const angle = normalizeGrainAngle(grainAngleDeg);
  if (angle == null) {
    return '';
  }

  const centerX = bounds.xMm + bounds.widthMm / 2;
  const centerY = bounds.yMm + bounds.heightMm / 2;
  const span = Math.min(Math.min(bounds.widthMm, bounds.heightMm) * 0.5, GRAIN_ARROW_MAX_MM);
  if (!(span > 0)) {
    return '';
  }

  const radians = (angle * Math.PI) / 180;
  const dirX = Math.cos(radians);
  const dirY = Math.sin(radians);
  const half = span / 2;
  const head = Math.max(span * 0.12, 2);
  const tipX = centerX + dirX * half;
  const tipY = centerY + dirY * half;
  const tailX = centerX - dirX * half;
  const tailY = centerY - dirY * half;
  const barb = (sign) => ({
    x: tipX - head * (dirX * Math.SQRT1_2 - sign * dirY * Math.SQRT1_2),
    y: tipY - head * (dirY * Math.SQRT1_2 + sign * dirX * Math.SQRT1_2),
  });
  const left = barb(1);
  const right = barb(-1);

  return [
    '  <g stroke="#666" stroke-width="0.4" fill="none">',
    `    <line x1="${round(tailX)}" y1="${round(tailY)}" x2="${round(tipX)}" y2="${round(tipY)}" />`,
    `    <polyline points="${round(left.x)},${round(left.y)} ${round(tipX)},${round(tipY)} ${round(right.x)},${round(right.y)}" />`,
    `    <text x="${round(tailX)}" y="${round(tailY - 2)}" font-size="4" font-family="sans-serif" fill="#666" stroke="none">GRAIN</text>`,
    '  </g>',
  ].join('\n');
}

/**
 * Everything needed to draw one part's template, with no drawing done yet.
 * Returns null for a part that carries no drawable geometry.
 */
export function buildPartTemplatePlan(entities, part, options = {}) {
  const referenceEntities = options.referenceEntities || entities;
  const marginMm = Number.isFinite(options.templateMarginMm) ? options.templateMarginMm : DEFAULT_TEMPLATE_MARGIN_MM;
  const partEntities = selectPartCutEntities(entities, part.id);
  if (!partEntities.length) {
    return null;
  }

  const bounds = computeTightBounds(partEntities, referenceEntities, marginMm);
  if (!bounds || !(bounds.widthMm > 0) || !(bounds.heightMm > 0)) {
    return null;
  }

  const catalog = options.materialCatalog ?? buildMaterialCatalogById();
  const row = entityToBomRow(part, catalog);
  // `hardwareLegend: false` keeps the template pure geometry: a fastener legend
  // is documentation, and this sheet is a cutting aid glued to the stock.
  const document = buildSvgExportDocument(partEntities, {
    referenceEntities,
    hardwareLegend: false,
  });

  const layout = buildPageLayout({
    content: bounds,
    page: {
      pageId: options.pageId,
      orientation: options.orientation,
      marginMm: options.pageMarginMm,
      footerMm: TEMPLATE_FOOTER_MM,
    },
    overlapMm: options.overlapMm ?? DEFAULT_OVERLAP_MM,
  });

  return {
    partId: part.id,
    partName: row?.partName ?? part.id,
    materialName: row?.materialName ?? '',
    thicknessMm: row?.thickness ?? part.thickness ?? 0,
    grainAngle: normalizeGrainAngle(part.grainAngle),
    bounds,
    layout,
    elements: [...document.elements, buildGrainArrowSvg(bounds, part.grainAngle)].filter(Boolean),
  };
}

export function buildTemplatePlans(entities = [], options = {}) {
  return selectTemplateParts(entities, options)
    .map((part) => buildPartTemplatePlan(entities, part, options))
    .filter(Boolean);
}

function buildRegistrationSvg(mark) {
  const x = round(mark.pageXMm);
  const y = round(mark.pageYMm);

  return [
    `  <g stroke="black" stroke-width="0.25" fill="none">`,
    `    <line x1="${round(x - REGISTRATION_ARM_MM)}" y1="${y}" x2="${round(x + REGISTRATION_ARM_MM)}" y2="${y}" />`,
    `    <line x1="${x}" y1="${round(y - REGISTRATION_ARM_MM)}" x2="${x}" y2="${round(y + REGISTRATION_ARM_MM)}" />`,
    `    <circle cx="${x}" cy="${y}" r="${REGISTRATION_RING_MM}" />`,
    '  </g>',
  ].join('\n');
}

/**
 * Dashed marker along the inner boundary of each glue tab. The tab itself is
 * the strip between this dash and the sheet edge - the part of the page that
 * duplicates the neighbour.
 */
function buildGlueEdgeSvg(edge, page, grid) {
  const left = page.marginMm;
  const top = page.marginMm;
  const right = page.marginMm + grid.usableWidthMm;
  const bottom = page.marginMm + grid.usableHeightMm;
  const overlap = grid.overlapMm;

  const line = (x1, y1, x2, y2) =>
    `  <line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="#888" stroke-width="0.25" stroke-dasharray="${GLUE_DASH}" fill="none" />`;

  switch (edge) {
    case 'right':
      return line(right - overlap, top, right - overlap, bottom);
    case 'left':
      return line(left + overlap, top, left + overlap, bottom);
    case 'bottom':
      return line(left, bottom - overlap, right, bottom - overlap);
    case 'top':
      return line(left, top + overlap, right, top + overlap);
    default:
      return '';
  }
}

function buildFooterSvg(plan, pageLayout, page) {
  // The ruler needs 13mm above its baseline and 6mm below, and the footer band
  // is TEMPLATE_FOOTER_MM tall, so the baseline sits 6.5mm off the page bottom
  // margin - the only placement that fits both halves inside the band.
  const rulerBaselineY = page.heightMm - page.marginMm - 6.5;
  const textX = page.marginMm + 106;
  const label = `${plan.partName}${plan.materialName ? ` — ${plan.materialName}` : ''}${
    plan.thicknessMm ? ` — ${plan.thicknessMm}mm` : ''
  }`;
  const gridLabel =
    pageLayout.pageCount > 1
      ? `${pageLayout.label} — sheet ${pageLayout.index + 1} of ${pageLayout.pageCount}`
      : 'single sheet';

  return [
    buildRulerSvg(page.marginMm, rulerBaselineY, { label: 'verify 100mm' }),
    `  <text x="${round(textX)}" y="${round(page.heightMm - page.marginMm - 11)}" font-size="3.5" font-family="sans-serif" fill="black">${escapeXml(label)}</text>`,
    `  <text x="${round(textX)}" y="${round(page.heightMm - page.marginMm - 6)}" font-size="2.8" font-family="sans-serif" fill="#666">${escapeXml(gridLabel)} — 1:1, print at 100% scale</text>`,
    plan.grainAngle == null
      ? ''
      : `  <text x="${round(textX)}" y="${round(page.heightMm - page.marginMm - 1)}" font-size="2.8" font-family="sans-serif" fill="#666">grain ${round(plan.grainAngle, 2)}°</text>`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** One page of one part's template, as a standalone millimetre-sized SVG. */
export function buildTemplatePageSvg(plan, pageIndex, options = {}) {
  const { page, grid, pages } = plan.layout;
  const pageLayout = { ...pages[pageIndex], pageCount: pages.length };
  const clipId = `tpl-clip-${options.clipPrefix ?? plan.partId}-${pageIndex}`;

  return `<svg xmlns="http://www.w3.org/2000/svg"
     width="${page.widthMm}mm" height="${page.heightMm}mm"
     viewBox="0 0 ${page.widthMm} ${page.heightMm}">
  <!-- Generated by Craftsman Studio - full-scale template, ${escapeXml(plan.partName)} -->
  <defs>
    <clipPath id="${clipId}">
      <rect x="${page.marginMm}" y="${page.marginMm}" width="${round(grid.usableWidthMm)}" height="${round(grid.usableHeightMm)}" />
    </clipPath>
  </defs>
  <g clip-path="url(#${clipId})">
    <g transform="translate(${round(pageLayout.translateXMm)}, ${round(pageLayout.translateYMm)})">
${plan.elements.join('\n')}
    </g>
  </g>
${pageLayout.glueEdges.map((edge) => buildGlueEdgeSvg(edge, page, grid)).join('\n')}
${pageLayout.registration.map((mark) => buildRegistrationSvg(mark)).join('\n')}
${buildFooterSvg(plan, pageLayout, page)}
</svg>`;
}

/** Every page of every requested part, flattened in part-then-page order. */
export function buildTemplatePages(entities = [], options = {}) {
  const plans = buildTemplatePlans(entities, options);
  const pages = [];

  plans.forEach((plan, planIndex) => {
    plan.layout.pages.forEach((pageLayout, pageIndex) => {
      pages.push({
        partId: plan.partId,
        partName: plan.partName,
        materialName: plan.materialName,
        pageIndex,
        pageCount: plan.layout.pages.length,
        column: pageLayout.column,
        row: pageLayout.row,
        label: pageLayout.label,
        svg: buildTemplatePageSvg(plan, pageIndex, { clipPrefix: `p${planIndex}` }),
      });
    });
  });

  return pages;
}

export function buildTemplatePrintDocumentHtml(entities = [], options = {}) {
  const pages = buildTemplatePages(entities, options);
  const page = resolvePageGeometry({
    pageId: options.pageId,
    orientation: options.orientation,
    marginMm: options.pageMarginMm,
    footerMm: TEMPLATE_FOOTER_MM,
  });

  if (!pages.length) {
    return `<!DOCTYPE html>
<html>
<head><style>body { font-family: sans-serif; padding: 20px; }</style></head>
<body><p>No parts with material assigned — nothing to template.</p></body>
</html>`;
  }

  const body = pages
    .map(
      (entry, index) =>
        `  <div class="tpl-page"${index === pages.length - 1 ? ' data-last="true"' : ''}>\n${entry.svg}\n  </div>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<style>
  @page { size: ${page.widthMm}mm ${page.heightMm}mm; margin: 0; }
  body { margin: 0; padding: 0; }
  .tpl-page { page-break-after: always; break-after: page; }
  .tpl-page[data-last="true"] { page-break-after: auto; break-after: auto; }
  svg { display: block; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** Browser entry point: same hidden-iframe print path as the 1:1 PDF export. */
export function printTemplatePdf(entities = [], options = {}) {
  printHtmlDocument(buildTemplatePrintDocumentHtml(entities, options));
}
