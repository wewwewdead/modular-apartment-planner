import { describe, expect, it } from 'vitest';
import {
  PAGE_SIZES,
  fitScale,
  parseScale,
  placeView,
  resolveSheetScale,
  scaleLabel,
  sheetFit,
  standardScales,
  viewCells,
} from './sheetLayout.js';
import { sheetSvg } from './drawings.js';
import { emptyModel, normalizeModel } from './model.js';
import { bracketExample, furnitureExample } from './examples.js';

// Phase R (docs/sketch-studio-drawing-fit.md §9): the shared layout geometry,
// fit to page, the overflow contract and the A2–A0 pages.
const view = (name, w, h, extra = {}) => ({
  name,
  view: name,
  viewBox: [0, -h, w, h],
  visible: [`M 0 0 L ${w} 0 L ${w} ${-h} Z`],
  hidden: [],
  ...extra,
});
const four = (w, h) => ['top', 'isometric', 'front', 'right'].map((n) => view(n, w, h));
const engineering = (views, extra = {}) => ({
  id: 's',
  title: 'T',
  layout: 'engineering',
  size: 'A3',
  units: 'mm',
  scale: 0.05,
  revision: 'A',
  views,
  annotations: [],
  notes: '',
  partsList: false,
  ...extra,
});
const standard = (views, extra = {}) => ({ ...engineering(views, extra), layout: 'standard', ...extra });
const model = { ...emptyModel(), instances: [] };
const empty = { parts: [], instances: [] };
// translate(tx ty) scale(s) of each drawn view, in order.
const transforms = (svg) =>
  [...svg.matchAll(/<g data-view="[^"]*"[^>]*transform="translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)"/g)].map((m) =>
    m.slice(1).map(Number),
  );

describe('standard scales', () => {
  it('is the ISO 1-2-5 series from 50:1 to 1:10 000, monotonic, with clean labels', () => {
    const stops = standardScales();
    expect(stops[0]).toBe(50);
    expect(stops.at(-1)).toBe(1 / 10000);
    expect(stops).toContain(1);
    expect(stops).toContain(0.05);
    expect(stops).toContain(0.02);
    stops.slice(1).forEach((s, i) => expect(s).toBeLessThan(stops[i]));
    expect(stops.map(scaleLabel).slice(0, 7)).toEqual(['50:1', '20:1', '10:1', '5:1', '2:1', '1:1', '1:2']);
    for (const s of stops) expect(scaleLabel(s)).toMatch(/^\d+:\d+$/);
    expect(scaleLabel(0.02)).toBe('1:50');
    expect(scaleLabel(1 / 10000)).toBe('1:10000');
  });
  it('parses 50, 1:50 and 2:1 and refuses what is not a positive ratio', () => {
    expect(parseScale('50')).toBe(0.02);
    expect(parseScale('1:50')).toBe(0.02);
    expect(parseScale(' 1 : 20 ')).toBe(0.05);
    expect(parseScale('2:1')).toBe(2);
    for (const bad of ['', '0', '1:0', 'abc', '-5', '1:-2', '1:2:3']) expect(parseScale(bad)).toBeNull();
  });
});

describe('fit to page', () => {
  // One engineering view on A3: a 364 × 173 mm box.
  it('snaps down to the nearest standard stop, and an exact fit keeps its stop', () => {
    expect(viewCells(engineering([view('front', 1, 1)])).cells[0].avail).toEqual([364, 173]);
    expect(fitScale(engineering([view('front', 364 / 0.03, 100)]))).toBe(0.02);
    expect(fitScale(engineering([view('front', 7280, 100)]))).toBe(0.05);
    expect(fitScale(engineering([view('front', 10, 10)]))).toBe(10);
    expect(fitScale(engineering([view('front', 0.1, 0.1)]))).toBe(50);
  });
  it('fits a 60 m × 40 m view, and continues the series below 1:10 000', () => {
    expect(scaleLabel(fitScale(engineering(four(60000, 40000))))).toBe('1:1000');
    expect(scaleLabel(fitScale(engineering(four(1e9, 1e9))))).toBe('1:20000000');
  });
  it('leaves out views with their own scale or no size; none left keeps the fixed scale', () => {
    const big = view('top', 1e6, 1e6, { scale: 0.001 });
    expect(fitScale(engineering([big, view('front', 100, 50)]))).toBe(1);
    expect(fitScale(engineering([view('top', 0, 0), view('front', 100, 50)]))).toBe(1);
    expect(fitScale(engineering([big]))).toBe(0.05);
    expect(fitScale(engineering(['front', 'top']))).toBe(0.05);
  });
  it('resolves the sheet scale: absent or fixed = the number, fit = fitted', () => {
    const views = four(60000, 40000);
    expect(resolveSheetScale(engineering(views))).toBe(0.05);
    expect(resolveSheetScale(engineering(views, { scaleMode: 'fixed' }))).toBe(0.05);
    expect(resolveSheetScale(engineering(views, { scaleMode: 'fit' }))).toBe(0.001);
    // An unknown mode never crashes a render: it is drawn fixed.
    expect(resolveSheetScale(engineering(views, { scaleMode: 'zoom' }))).toBe(0.05);
  });
  it('never throws for huge geometry and prints the resolved ratio in both layouts', () => {
    const huge = engineering(four(60000, 40000), { scaleMode: 'fit', scale: 1 });
    const svg = sheetSvg(huge, model, empty);
    expect(svg).toContain('>1:1000 / mm / 1 of 1<');
    expect(svg).not.toContain('data-overflow');
    expect(transforms(svg).every(([, , s]) => s === 0.001)).toBe(true);
    const overview = sheetSvg(standard(four(60000, 40000), { scaleMode: 'fit', scale: 1 }), model, empty);
    // The overview's cells are taller (93.5 mm boxes): 1:500.
    expect(overview).toContain('Scale 1:500 ·');
    expect(overview).not.toMatch(/NaN|Infinity|data-overflow/);
  });
});

describe('one layout geometry for fit and both renderers', () => {
  it('engineering: the renderer places each view exactly where viewCells says', () => {
    // 'rear' takes the first free slot; the others keep top/iso/front/right.
    const views = [view('rear', 1000, 400), view('front', 2000, 600), view('isometric', 1500, 900)];
    const sheet = engineering(views, { scale: 0.02 });
    const { cells } = viewCells(sheet);
    expect(cells.map((c) => c.slot)).toEqual([0, 2, 1]);
    expect(cells[1]).toMatchObject({
      x: 15,
      y: 12 + (297 - 58 - 20) / 2,
      width: 195,
      height: 109.5,
      avail: [169, 63.5],
    });
    const drawn = transforms(sheetSvg(sheet, model, empty));
    views.forEach((v, i) => {
      const [x, y] = placeView(cells[i], v.viewBox, 0.02);
      expect(drawn[i]).toEqual([x - v.viewBox[0] * 0.02, y - v.viewBox[1] * 0.02, 0.02]);
    });
  });
  it('standard: cells, notes band and placement match the renderer', () => {
    const views = four(1000, 400);
    const sheet = standard(views, {
      scale: 0.05,
      annotations: [{ id: 'n', type: 'part-number', partId: 'x' }],
    });
    const { cells, notesHeight, titleY } = viewCells(sheet);
    expect(notesHeight).toBe(36);
    expect(titleY).toBe(297 - 36);
    expect(cells[3]).toMatchObject({ x: 15 + 195, width: 195, height: (297 - 36 - 26) / 2, avail: [177, 93.5] });
    const drawn = transforms(sheetSvg({ ...sheet, annotations: [] }, model, empty));
    views.forEach((v, i) => {
      const [x, y] = placeView(cells[i], v.viewBox, 0.05);
      expect(drawn[i]).toEqual([x - v.viewBox[0] * 0.05, y - v.viewBox[1] * 0.05, 0.05]);
    });
    // A parts list grows the notes band, and the cells shrink with it.
    expect(viewCells(sheet, views, Array(8).fill({})).notesHeight).toBe((8 + 1) * 4.5 + 20);
  });
});

describe('a fixed scale that overflows', () => {
  // 6000 × 2000 at 1:20 needs 300 × 100 mm; an A3 quarter holds 169 × 63.5.
  const sheet = engineering([view('front', 6000, 2000), view('top', 100, 100)], { scale: 0.05 });
  it('throws for export with what to do, keeping "does not fit"', () => {
    expect(() => sheetSvg(sheet, model, empty)).toThrow(
      'T: front does not fit on A3 at 1:20. Use Fit to page, choose 1:50 or smaller, or use A1.',
    );
    // No page holds it: the page clause is left out.
    expect(() => sheetSvg({ ...sheet, scale: 1 }, model, empty)).toThrow(
      /does not fit on A3 at 1:1\. Use Fit to page, choose 1:50 or smaller\.$/,
    );
    expect(() => sheetSvg(standard(sheet.views, { scale: 0.05 }), model, empty)).toThrow(/does not fit on A3 at 1:20/);
  });
  it('renders with the view flagged under allowOverflow, in both layouts', () => {
    const svg = sheetSvg(sheet, model, empty, 1, 1, { allowOverflow: true });
    expect(svg.match(/data-overflow="true"/g)).toHaveLength(1);
    expect(svg).toContain('>1:20 / mm / 1 of 1<');
    const overview = sheetSvg(standard(sheet.views), model, empty, 1, 1, { allowOverflow: true });
    expect(overview.match(/data-overflow="true"/g)).toHaveLength(1);
  });
  it('reports each view, the largest fitting scale and the smallest page that fits', () => {
    const fit = sheetFit(sheet);
    expect(fit).toMatchObject({ scale: 0.05, fits: false, largestFittingScale: 0.02, smallestFittingPage: 'A1' });
    expect(fit.views[0]).toMatchObject({
      name: 'front',
      kind: 'front',
      need: [300, 100],
      avail: [169, 63.5],
      fits: false,
    });
    expect(fit.views[1].fits).toBe(true);
    expect(sheetFit(sheet, sheet.views, { scale: 0.02 }).fits).toBe(true);
    expect(sheetFit({ ...sheet, scale: 1 }).smallestFittingPage).toBeNull();
  });
});

describe('pages and the data model', () => {
  it('adds A2, A1 and A0 landscape pages and renders the title block on A0', () => {
    expect(PAGE_SIZES).toMatchObject({ A2: [594, 420], A1: [841, 594], A0: [1189, 841] });
    const svg = sheetSvg(engineering(four(60000, 40000), { size: 'A0', scaleMode: 'fit' }), model, empty);
    expect(svg).toContain('width="1189mm" height="841mm"');
    expect(svg).toContain('>1:200 / mm / 1 of 1<');
    expect(svg).not.toMatch(/NaN|Infinity/);
  });
  it('new models fit; examples and files without a mode stay fixed; unknown modes are rejected', () => {
    expect(emptyModel().sheets[0].scaleMode).toBe('fit');
    expect(furnitureExample('desk').sheets[0].scaleMode).toBeUndefined();
    expect(bracketExample().sheets[0].scaleMode).toBeUndefined();
    const sheet = emptyModel().sheets[0];
    expect(normalizeModel({ ...emptyModel(), sheets: [{ ...sheet, scaleMode: 'fixed' }] }).sheets[0].scaleMode).toBe(
      'fixed',
    );
    expect(() => normalizeModel({ ...emptyModel(), sheets: [{ ...sheet, scaleMode: 'zoom' }] })).toThrow(
      /Invalid drawing sheet/,
    );
  });
});
