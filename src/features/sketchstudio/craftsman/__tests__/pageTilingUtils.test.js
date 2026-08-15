import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOOTER_MM,
  DEFAULT_PAGE_MARGIN_MM,
  MIN_OVERLAP_MM,
  PAGE_SIZES,
  buildPageLayout,
  computeAxisPageCount,
  computePageGrid,
  getPageSize,
  resolveOverlapMm,
  resolvePageGeometry,
  worldToPagePoint,
} from '../export/pageTilingUtils';

/** A square usable area with round numbers, so page counts are checkable by eye. */
const SQUARE = { usableWidthMm: 100, usableHeightMm: 100, overlapMm: 10 };

describe('page sizes', () => {
  it('knows A4 and Letter in millimetres', () => {
    expect(PAGE_SIZES.a4).toMatchObject({ widthMm: 210, heightMm: 297 });
    // 8.5 x 11 in exactly.
    expect(PAGE_SIZES.letter.widthMm).toBeCloseTo(8.5 * 25.4, 10);
    expect(PAGE_SIZES.letter.heightMm).toBeCloseTo(11 * 25.4, 10);
  });

  it('falls back to A4 for an unknown page id', () => {
    expect(getPageSize('tabloid').id).toBe('a4');
    expect(getPageSize().id).toBe('a4');
    expect(getPageSize('LETTER').id).toBe('letter');
  });
});

describe('resolvePageGeometry', () => {
  it('subtracts both margins and the footer band', () => {
    const geometry = resolvePageGeometry({ pageId: 'a4' });
    expect(geometry.usableWidthMm).toBe(210 - 2 * DEFAULT_PAGE_MARGIN_MM);
    expect(geometry.usableHeightMm).toBe(297 - 2 * DEFAULT_PAGE_MARGIN_MM - DEFAULT_FOOTER_MM);
  });

  it('leaves room for the 100mm ruler on both supported pages', () => {
    expect(resolvePageGeometry({ pageId: 'a4' }).usableWidthMm).toBeGreaterThan(100);
    expect(resolvePageGeometry({ pageId: 'letter' }).usableWidthMm).toBeGreaterThan(100);
  });

  it('swaps the axes in landscape', () => {
    const landscape = resolvePageGeometry({ pageId: 'a4', orientation: 'landscape' });
    expect(landscape.widthMm).toBe(297);
    expect(landscape.heightMm).toBe(210);
    expect(landscape.usableWidthMm).toBe(297 - 20);
  });

  it('accepts custom margin and footer', () => {
    const geometry = resolvePageGeometry({ pageId: 'a4', marginMm: 5, footerMm: 0 });
    expect(geometry.usableWidthMm).toBe(200);
    expect(geometry.usableHeightMm).toBe(287);
  });
});

describe('resolveOverlapMm', () => {
  it('never drops below the minimum glue tab', () => {
    expect(resolveOverlapMm(0, 100, 100)).toBe(MIN_OVERLAP_MM);
    expect(resolveOverlapMm(4, 100, 100)).toBe(MIN_OVERLAP_MM);
    expect(resolveOverlapMm(null, 100, 100)).toBe(MIN_OVERLAP_MM);
  });

  it('passes a larger requested overlap straight through', () => {
    expect(resolveOverlapMm(25, 100, 100)).toBe(25);
  });

  it('caps the overlap at half the smaller usable extent so the stride survives', () => {
    expect(resolveOverlapMm(90, 100, 100)).toBe(50);
    expect(resolveOverlapMm(90, 200, 60)).toBe(30);
  });
});

describe('computeAxisPageCount', () => {
  it('needs one page when the content fits', () => {
    expect(computeAxisPageCount(50, 100, 90)).toBe(1);
    expect(computeAxisPageCount(99.9, 100, 90)).toBe(1);
  });

  it('EXACT FIT: content exactly one usable wide is one page, not two', () => {
    expect(computeAxisPageCount(100, 100, 90)).toBe(1);
  });

  it('EXACT FIT: content exactly n strides past the first page is n+1 pages', () => {
    // usable 100, overlap 10 -> stride 90.
    expect(computeAxisPageCount(100 + 90, 100, 90)).toBe(2);
    expect(computeAxisPageCount(100 + 180, 100, 90)).toBe(3);
    expect(computeAxisPageCount(100 + 900, 100, 90)).toBe(11);
  });

  it('EXACT FIT survives fractional page geometry', () => {
    // Letter usable width 195.9, overlap 10 -> stride 185.9. Three pages cover
    // 195.9 + 2 x 185.9 = 567.7 exactly; float error must not make it four.
    const usable = 215.9 - 20;
    const stride = usable - 10;
    expect(computeAxisPageCount(usable + 2 * stride, usable, stride)).toBe(3);
  });

  it('rolls over to another page for the smallest overshoot', () => {
    expect(computeAxisPageCount(100.001, 100, 90)).toBe(2);
    expect(computeAxisPageCount(190.001, 100, 90)).toBe(3);
  });

  it('degrades to a single page for degenerate inputs', () => {
    expect(computeAxisPageCount(0, 100, 90)).toBe(1);
    expect(computeAxisPageCount(500, 0, 90)).toBe(1);
    expect(computeAxisPageCount(500, 100, 0)).toBe(1);
  });
});

describe('computePageGrid', () => {
  it('multiplies the two axis counts', () => {
    const grid = computePageGrid({ contentWidthMm: 280, contentHeightMm: 190, ...SQUARE });
    // width: 100 + 90 + 90 = 280 -> 3 columns exactly.
    // height: 100 + 90 = 190 -> 2 rows exactly.
    expect(grid).toMatchObject({ columns: 3, rows: 2, pageCount: 6, strideXMm: 90, strideYMm: 90, overlapMm: 10 });
  });

  it('reports how much paper the grid actually spans', () => {
    const grid = computePageGrid({ contentWidthMm: 250, contentHeightMm: 50, ...SQUARE });
    expect(grid.columns).toBe(3);
    expect(grid.coveredWidthMm).toBe(100 + 90 * 2);
    expect(grid.coveredWidthMm).toBeGreaterThanOrEqual(250);
    expect(grid.rows).toBe(1);
    expect(grid.coveredHeightMm).toBe(100);
  });

  it('widens the stride when the overlap shrinks, and the page count falls', () => {
    const tight = computePageGrid({ contentWidthMm: 500, contentHeightMm: 50, ...SQUARE, overlapMm: 50 });
    const loose = computePageGrid({ contentWidthMm: 500, contentHeightMm: 50, ...SQUARE, overlapMm: 10 });
    expect(tight.strideXMm).toBe(50);
    expect(loose.strideXMm).toBe(90);
    expect(tight.columns).toBeGreaterThan(loose.columns);
  });

  it('never divides by a zero stride', () => {
    const grid = computePageGrid({ contentWidthMm: 500, contentHeightMm: 500, usableWidthMm: 20, usableHeightMm: 20 });
    // Overlap is capped at half the usable extent, so the stride stays positive.
    expect(grid.overlapMm).toBe(10);
    expect(grid.strideXMm).toBe(10);
    expect(Number.isFinite(grid.pageCount)).toBe(true);
    expect(grid.columns).toBe(49); // 20 + 48 x 10 = 500
  });
});

describe('buildPageLayout', () => {
  const layout = buildPageLayout({
    content: { xMm: 1000, yMm: 500, widthMm: 280, heightMm: 190 },
    page: { pageId: 'a4', marginMm: 10, footerMm: 14 },
    overlapMm: 10,
  });

  const squareLayout = (content, overlapMm = 10) =>
    buildPageLayout({
      content,
      // Force a 100 x 100 usable area for arithmetic that is checkable by hand:
      // width 210 - 2x55 = 100; height 297 - 2x55 - 87 = 100.
      page: { pageId: 'a4', marginMm: 55, footerMm: 87 },
      overlapMm,
    });

  it('produces one page entry per grid cell, in row-major order', () => {
    const grid = squareLayout({ xMm: 0, yMm: 0, widthMm: 280, heightMm: 190 });
    expect(grid.page.usableWidthMm).toBe(100);
    expect(grid.page.usableHeightMm).toBe(100);
    expect(grid.pages).toHaveLength(6);
    expect(grid.pages.map((entry) => entry.label)).toEqual(['R1C1', 'R1C2', 'R1C3', 'R2C1', 'R2C2', 'R2C3']);
  });

  it('advances each page by exactly one stride in world space', () => {
    const grid = squareLayout({ xMm: 0, yMm: 0, widthMm: 280, heightMm: 190 });
    expect(grid.pages.map((entry) => entry.worldOriginXMm)).toEqual([0, 90, 180, 0, 90, 180]);
    expect(grid.pages.map((entry) => entry.worldOriginYMm)).toEqual([0, 0, 0, 90, 90, 90]);
  });

  it('maps world millimetres onto the page with a pure translation', () => {
    const first = layout.pages[0];
    // The content origin lands at the page margin.
    expect(worldToPagePoint(first, { x: 1000, y: 500 })).toEqual({ xMm: 10, yMm: 10 });
    // 1mm of world is 1mm of paper. That is the whole contract.
    expect(worldToPagePoint(first, { x: 1100, y: 600 })).toEqual({ xMm: 110, yMm: 110 });
  });

  it('offsets the second column by the stride, not by the page width', () => {
    const second = layout.pages[1];
    expect(second.worldOriginXMm - layout.pages[0].worldOriginXMm).toBe(layout.grid.strideXMm);
    expect(worldToPagePoint(second, { x: 1000 + layout.grid.strideXMm, y: 500 })).toEqual({ xMm: 10, yMm: 10 });
  });

  it('places registration crosses so neighbouring pages share the same world point', () => {
    const grid = squareLayout({ xMm: 0, yMm: 0, widthMm: 280, heightMm: 190 });
    const [first, second] = grid.pages;

    const firstRight = first.registration.filter((mark) => mark.corner.endsWith('right')).map((mark) => mark.worldXMm);
    const secondLeft = second.registration.filter((mark) => mark.corner.endsWith('left')).map((mark) => mark.worldXMm);

    // usable 100, overlap 10, stride 90: page 1 right = 0 + 100 - 5 = 95;
    // page 2 left = 90 + 5 = 95. Same world point.
    expect(firstRight).toEqual([95, 95]);
    expect(secondLeft).toEqual([95, 95]);
  });

  it('places registration crosses inside the printable area', () => {
    for (const entry of layout.pages) {
      for (const mark of entry.registration) {
        expect(mark.pageXMm).toBeGreaterThanOrEqual(layout.page.marginMm);
        expect(mark.pageXMm).toBeLessThanOrEqual(layout.page.widthMm - layout.page.marginMm);
        expect(mark.pageYMm).toBeGreaterThanOrEqual(layout.page.marginMm);
        expect(mark.pageYMm).toBeLessThanOrEqual(layout.page.heightMm - layout.page.marginMm);
      }
    }
  });

  it('marks a glue tab on every edge that has a neighbour, and none that do not', () => {
    const grid = squareLayout({ xMm: 0, yMm: 0, widthMm: 280, heightMm: 190 });
    expect(grid.pages[0].glueEdges.sort()).toEqual(['bottom', 'right']);
    expect(grid.pages[1].glueEdges.sort()).toEqual(['bottom', 'left', 'right']);
    expect(grid.pages[2].glueEdges.sort()).toEqual(['bottom', 'left']);
    expect(grid.pages[5].glueEdges.sort()).toEqual(['left', 'top']);
  });

  it('has no glue tabs at all on a single-page template', () => {
    const single = squareLayout({ xMm: 0, yMm: 0, widthMm: 80, heightMm: 80 });
    expect(single.pages).toHaveLength(1);
    expect(single.pages[0].glueEdges).toEqual([]);
    expect(single.pages[0].neighbours).toEqual({ left: false, right: false, top: false, bottom: false });
  });

  it('clips the coverage of the last page to the content', () => {
    const grid = squareLayout({ xMm: 0, yMm: 0, widthMm: 250, heightMm: 50 });
    expect(grid.pages).toHaveLength(3);
    // Third page starts at 180 and the content ends at 250, so it only carries
    // 70mm of drawing even though its usable area is 100mm wide.
    expect(grid.pages[2].coverage).toEqual({ xMm: 180, yMm: 0, widthMm: 70, heightMm: 50 });
    // ... while the first page is full.
    expect(grid.pages[0].coverage.widthMm).toBe(100);
  });

  it('EXACT FIT: content the size of one usable area is a single page', () => {
    const single = squareLayout({ xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 });
    expect(single.pages).toHaveLength(1);
    expect(single.pages[0].coverage).toEqual({ xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 });
  });

  it('respects a non-zero content origin', () => {
    const offset = squareLayout({ xMm: -250, yMm: 40, widthMm: 190, heightMm: 100 });
    expect(offset.pages.map((entry) => entry.worldOriginXMm)).toEqual([-250, -160]);
    expect(offset.pages[0].registration[0]).toMatchObject({ worldXMm: -245, worldYMm: 45 });
  });

  it('survives empty content without producing a page grid of zero', () => {
    const empty = buildPageLayout({ content: { xMm: 0, yMm: 0, widthMm: 0, heightMm: 0 } });
    expect(empty.pages).toHaveLength(1);
    expect(empty.grid.pageCount).toBe(1);
  });
});
