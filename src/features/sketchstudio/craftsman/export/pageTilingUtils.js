/**
 * Page tiling for full-scale (1:1) paper templates.
 *
 * A 900mm cabinet side does not fit on A4, so a 1:1 template has to be split
 * across a grid of pages that the maker tapes back together. Everything in this
 * module is the arithmetic of that split; nothing here draws.
 *
 * The model
 * ---------
 * Each page has an unprintable MARGIN all round and a FOOTER band reserved at
 * the bottom for the scale-check ruler and the part label. What is left is the
 * page's USABLE area, and that is what carries drawing:
 *
 *   usableWidth  = pageWidth  - 2 x margin
 *   usableHeight = pageHeight - 2 x margin - footer
 *
 * Adjacent pages OVERLAP by `overlapMm` so there is material to glue and a band
 * in which registration marks from both pages coincide. A page therefore only
 * advances by its STRIDE:
 *
 *   stride = usable - overlap
 *
 * which is the single number the whole page count falls out of.
 *
 * Page count (per axis)
 * ---------------------
 *   content <= usable                    -> 1 page
 *   otherwise  ceil((content - usable) / stride) + 1
 *
 * The subtraction is deliberate: the FIRST page covers a full `usable`, and
 * every page after it only adds `stride`. Writing it as ceil(content / stride)
 * would over-count, and ceil((content - overlap) / stride) - algebraically the
 * same - loses the "one page" special case to floating point at exact fit.
 *
 * EXACT FIT is the case that has to be right, because it is the common one: a
 * content width of exactly `usable`, or of exactly `usable + n x stride`, must
 * produce 1 and n+1 pages, not 2 and n+2. Floating-point page geometry (Letter
 * is 215.9mm wide) makes `content - usable` land at 1e-14 instead of 0, so the
 * ceil is taken with a small tolerance rather than raw.
 *
 * Registration
 * ------------
 * Registration crosses sit at the four corners of the page's usable area, INSET
 * BY HALF THE OVERLAP. That placement is what makes them align: page N's
 * right-hand cross is at
 *
 *   colOrigin + usable - overlap/2
 *
 * and page N+1's left-hand cross is at
 *
 *   (colOrigin + stride) + overlap/2 = colOrigin + usable - overlap/2
 *
 * - the same world point, by construction, for any overlap. Line the crosses up
 * and the drawing lines up.
 *
 * All lengths are millimetres. Paper points are not this module's business.
 */

/** ISO 216 A4 and ANSI Letter, portrait, in millimetres. */
export const PAGE_SIZES = Object.freeze({
  a4: Object.freeze({ id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 }),
  // 8.5 x 11 in = 215.9 x 279.4 mm exactly.
  letter: Object.freeze({ id: 'letter', label: 'Letter', widthMm: 215.9, heightMm: 279.4 }),
});

export const DEFAULT_PAGE_ID = 'a4';

/** Glue tabs narrower than this are not worth taping. */
export const MIN_OVERLAP_MM = 10;
export const DEFAULT_OVERLAP_MM = 10;

/** Border no consumer printer reaches. */
export const DEFAULT_PAGE_MARGIN_MM = 10;

/** Bottom band reserved for the 100mm ruler and the part label. */
export const DEFAULT_FOOTER_MM = 14;

/** Exact-fit tolerance: 1e-9 mm is a nanometre, far below any real geometry. */
const EPSILON_MM = 1e-9;

function toPositiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function toNonNegativeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

export function getPageSize(pageId = DEFAULT_PAGE_ID) {
  return PAGE_SIZES[String(pageId).toLowerCase()] ?? PAGE_SIZES[DEFAULT_PAGE_ID];
}

/**
 * Resolve a page spec into the usable drawing rectangle.
 *
 * @param {object} [options]
 * @param {string} [options.pageId] 'a4' | 'letter'
 * @param {'portrait'|'landscape'} [options.orientation]
 * @param {number} [options.marginMm]
 * @param {number} [options.footerMm] bottom band reserved for ruler + label.
 */
export function resolvePageGeometry(options = {}) {
  const size = getPageSize(options.pageId);
  const landscape = options.orientation === 'landscape';
  const widthMm = landscape ? size.heightMm : size.widthMm;
  const heightMm = landscape ? size.widthMm : size.heightMm;
  const marginMm = toNonNegativeNumber(options.marginMm, DEFAULT_PAGE_MARGIN_MM);
  const footerMm = toNonNegativeNumber(options.footerMm, DEFAULT_FOOTER_MM);

  return {
    pageId: size.id,
    label: size.label,
    orientation: landscape ? 'landscape' : 'portrait',
    widthMm,
    heightMm,
    marginMm,
    footerMm,
    usableWidthMm: Math.max(0, widthMm - marginMm * 2),
    usableHeightMm: Math.max(0, heightMm - marginMm * 2 - footerMm),
  };
}

/**
 * Overlap actually used, after the two guards:
 *   - never below MIN_OVERLAP_MM (a tab you cannot glue is not a tab);
 *   - never more than half the usable extent, or the stride would collapse and
 *     the page count would run away. The smaller of the two page axes governs,
 *     so a single overlap value is valid on both.
 */
export function resolveOverlapMm(requestedMm, usableWidthMm, usableHeightMm) {
  const requested = Math.max(toNonNegativeNumber(requestedMm, DEFAULT_OVERLAP_MM), MIN_OVERLAP_MM);
  const ceiling = Math.min(usableWidthMm, usableHeightMm) / 2;
  return ceiling > 0 ? Math.min(requested, ceiling) : requested;
}

/** Pages needed along one axis. See the exact-fit note in the module header. */
export function computeAxisPageCount(contentMm, usableMm, strideMm) {
  if (!(usableMm > 0) || !(contentMm > 0)) {
    return 1;
  }

  if (contentMm <= usableMm + EPSILON_MM) {
    return 1;
  }

  if (!(strideMm > 0)) {
    return 1;
  }

  const extra = contentMm - usableMm;
  return Math.ceil(extra / strideMm - EPSILON_MM) + 1;
}

/**
 * Page grid for a content rectangle.
 *
 * @param {object} input
 * @param {number} input.contentWidthMm
 * @param {number} input.contentHeightMm
 * @param {number} input.usableWidthMm
 * @param {number} input.usableHeightMm
 * @param {number} [input.overlapMm]
 * @returns {{columns:number, rows:number, pageCount:number, strideXMm:number,
 *   strideYMm:number, overlapMm:number, usableWidthMm:number,
 *   usableHeightMm:number, coveredWidthMm:number, coveredHeightMm:number}}
 */
export function computePageGrid({
  contentWidthMm,
  contentHeightMm,
  usableWidthMm,
  usableHeightMm,
  overlapMm = DEFAULT_OVERLAP_MM,
} = {}) {
  const usableWidth = Math.max(0, Number(usableWidthMm) || 0);
  const usableHeight = Math.max(0, Number(usableHeightMm) || 0);
  const overlap = resolveOverlapMm(overlapMm, usableWidth, usableHeight);
  const strideX = Math.max(0, usableWidth - overlap);
  const strideY = Math.max(0, usableHeight - overlap);

  const columns = computeAxisPageCount(Number(contentWidthMm) || 0, usableWidth, strideX);
  const rows = computeAxisPageCount(Number(contentHeightMm) || 0, usableHeight, strideY);

  return {
    columns,
    rows,
    pageCount: columns * rows,
    strideXMm: strideX,
    strideYMm: strideY,
    overlapMm: overlap,
    usableWidthMm: usableWidth,
    usableHeightMm: usableHeight,
    // What the grid physically spans: the first page's full usable extent plus
    // one stride per additional page. Always >= the content.
    coveredWidthMm: usableWidth + strideX * (columns - 1),
    coveredHeightMm: usableHeight + strideY * (rows - 1),
  };
}

function buildRegistrationPoints(worldOriginX, worldOriginY, grid, page) {
  const half = grid.overlapMm / 2;
  const xs = [worldOriginX + half, worldOriginX + grid.usableWidthMm - half];
  const ys = [worldOriginY + half, worldOriginY + grid.usableHeightMm - half];
  const corners = [
    ['top-left', xs[0], ys[0]],
    ['top-right', xs[1], ys[0]],
    ['bottom-right', xs[1], ys[1]],
    ['bottom-left', xs[0], ys[1]],
  ];

  return corners.map(([corner, worldXMm, worldYMm]) => ({
    corner,
    worldXMm,
    worldYMm,
    pageXMm: worldXMm - worldOriginX + page.marginMm,
    pageYMm: worldYMm - worldOriginY + page.marginMm,
  }));
}

/**
 * Full tiling plan for a world-space content rectangle.
 *
 * Every page carries the affine `translateXMm`/`translateYMm` that maps world
 * millimetres to page millimetres - one translation, no scale, because 1:1 is
 * the entire point:
 *
 *   pageX = worldX + translateXMm
 *
 * @param {object} input
 * @param {{xMm:number, yMm:number, widthMm:number, heightMm:number}} input.content
 *   content bounds in world millimetres.
 * @param {object} [input.page] passed through to `resolvePageGeometry`.
 * @param {number} [input.overlapMm]
 */
export function buildPageLayout({ content, page: pageOptions = {}, overlapMm = DEFAULT_OVERLAP_MM } = {}) {
  const page = resolvePageGeometry(pageOptions);
  const contentX = Number(content?.xMm) || 0;
  const contentY = Number(content?.yMm) || 0;
  const contentWidth = toPositiveNumber(content?.widthMm, 0);
  const contentHeight = toPositiveNumber(content?.heightMm, 0);

  const grid = computePageGrid({
    contentWidthMm: contentWidth,
    contentHeightMm: contentHeight,
    usableWidthMm: page.usableWidthMm,
    usableHeightMm: page.usableHeightMm,
    overlapMm,
  });

  const pages = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const worldOriginX = contentX + column * grid.strideXMm;
      const worldOriginY = contentY + row * grid.strideYMm;

      // The world region this page can show, clipped to the content so the last
      // page in a run reports only the strip that actually carries drawing.
      const coverageEndX = Math.min(worldOriginX + grid.usableWidthMm, contentX + contentWidth);
      const coverageEndY = Math.min(worldOriginY + grid.usableHeightMm, contentY + contentHeight);

      pages.push({
        index: pages.length,
        column,
        row,
        label: `R${row + 1}C${column + 1}`,
        worldOriginXMm: worldOriginX,
        worldOriginYMm: worldOriginY,
        translateXMm: page.marginMm - worldOriginX,
        translateYMm: page.marginMm - worldOriginY,
        coverage: {
          xMm: worldOriginX,
          yMm: worldOriginY,
          widthMm: Math.max(0, coverageEndX - worldOriginX),
          heightMm: Math.max(0, coverageEndY - worldOriginY),
        },
        neighbours: {
          left: column > 0,
          right: column < grid.columns - 1,
          top: row > 0,
          bottom: row < grid.rows - 1,
        },
        // Edges that carry a glue tab: the ones with a page on the far side.
        glueEdges: [
          column < grid.columns - 1 ? 'right' : null,
          row < grid.rows - 1 ? 'bottom' : null,
          column > 0 ? 'left' : null,
          row > 0 ? 'top' : null,
        ].filter(Boolean),
        registration: buildRegistrationPoints(worldOriginX, worldOriginY, grid, page),
      });
    }
  }

  return {
    page,
    grid,
    content: { xMm: contentX, yMm: contentY, widthMm: contentWidth, heightMm: contentHeight },
    pages,
  };
}

/** World point -> page-local millimetres for one page of a layout. */
export function worldToPagePoint(pageLayout, worldPoint) {
  return {
    xMm: (Number(worldPoint?.x ?? worldPoint?.xMm) || 0) + pageLayout.translateXMm,
    yMm: (Number(worldPoint?.y ?? worldPoint?.yMm) || 0) + pageLayout.translateYMm,
  };
}
