import { numeric } from './model.js';
import { isDrawnAnnotation } from './sheetAnnotations.js';
import { partsListHeight, partsListRows, sheetHasPartsList } from './partsList.js';
import { bendTableHeight } from './bendTable.js';

// Drawing sheet geometry shared by fit and both renderers (Phase R,
// docs/sketch-studio-drawing-fit.md §4): where each view's cell sits, the box
// a view must fit, and the standard scale that makes every view fit. Paper mm.

// Landscape pages, width × height.
export const PAGE_SIZES = {
  A3: [420, 297],
  A4: [297, 210],
  Letter: [279.4, 215.9],
  A2: [594, 420],
  A1: [841, 594],
  A0: [1189, 841],
};
export const SCALE_MODES = Object.freeze(['fit', 'fixed']);

export const scaleLabel = (scale) => (scale >= 1 ? `${scale}:1` : `1:${+(1 / scale).toFixed(3)}`);

// 1, 2, 5, 10, 20, 50 … up to `limit` (exact integers).
const series = (limit) => {
  const out = [];
  for (let p = 1; p <= limit; p *= 10) for (const m of [1, 2, 5]) if (m * p <= limit) out.push(m * p);
  return out;
};
// ISO 5455 1-2-5 scales, largest first: 50:1 … 2:1, 1:1, 1:2 … 1:10 000.
// A reduction is 1 / N, so 1:20 is exactly the 0.05 a user types.
export const standardScales = () => [
  ...series(50)
    .filter((n) => n > 1)
    .reverse(),
  ...series(10000).map((n) => 1 / n),
];

// "50", "1:50" or "2:1" as a scale (2:1 = 2, 1:50 = 0.02); null if not a positive ratio.
export function parseScale(text) {
  const match = /^(\d*\.?\d+)(?::(\d*\.?\d+))?$/.exec(String(text ?? '').replace(/\s+/g, ''));
  if (!match) return null;
  const value = match[2] == null ? 1 / Number(match[1]) : Number(match[1]) / Number(match[2]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const kindOf = (view) => (typeof view === 'string' ? view : view.view || view.name);

// The parts list rows a standard sheet reserves room for (its notes band grows).
export const layoutParts = (sheet, model, snapshot) =>
  sheet.layout !== 'engineering' && sheetHasPartsList(sheet) && model ? partsListRows(model, snapshot, sheet) : [];

// Each view's cell: { slot, x, y, width, height } on the page, `avail` (the
// box the scaled view must fit) and `frame` [x, y, w, h] (the box it is
// centred in). Exactly the numbers each renderer used before Phase R.
export function viewCells(sheet, views = sheet.views, parts = []) {
  const [width, height] = PAGE_SIZES[sheet.size] || PAGE_SIZES.A3;
  if (sheet.layout === 'engineering') {
    const titleY = height - 58,
      divisions = views.length === 1 ? 1 : 2,
      cellW = (width - 30) / divisions,
      cellH = (titleY - 20) / divisions;
    // Explicitly arranged views, rather than pretending to follow a projection
    // standard whose camera definitions may differ between imported models.
    const used = new Set();
    const cells = views.map((view) => {
      let slot = divisions === 1 ? 0 : { top: 0, isometric: 1, front: 2, right: 3 }[kindOf(view)];
      if (slot == null || used.has(slot)) slot = [0, 1, 2, 3].find((i) => !used.has(i));
      used.add(slot);
      const x = 15 + (slot % 2) * cellW,
        y = 12 + Math.floor(slot / 2) * cellH;
      // A flat view's bend table (SM-4) sits under its overall dimensions.
      const table = bendTableHeight(view);
      const avail = [cellW - 26, cellH - 46 - (table ? table + 2 : 0)];
      const cell = { slot, x, y, width: cellW, height: cellH, avail, frame: [x + 18, y + 25, ...avail] };
      return table ? { ...cell, table: { x: x + 18, y: y + 25 + avail[1] + 12, width: avail[0] } } : cell;
    });
    return { width, height, titleY, cells };
  }
  const columns = views.length > 1 ? 2 : 1,
    rows = Math.ceil(views.length / columns);
  // Dimensions and callouts are drawn in their views; the rest are notes.
  const notes = (sheet.annotations || []).filter((a) => !isDrawnAnnotation(a));
  // The parts list sits under the title rule, clear of the border and page label.
  const notesHeight = Math.max(36, 27 + notes.length * 4, parts.length ? partsListHeight(parts) + 20 : 0);
  const cellW = (width - 30) / columns,
    cellH = (height - notesHeight - 26) / rows;
  const cells = views.map((view, index) => {
    const x = 15 + (index % columns) * cellW,
      y = 12 + Math.floor(index / columns) * cellH;
    // A flat view's bend table (SM-4) sits under the view, above the overall dimension.
    const table = bendTableHeight(view);
    const reserve = table ? table + 4 : 0;
    const cell = {
      slot: index,
      x,
      y,
      width: cellW,
      height: cellH,
      avail: [cellW - 18, cellH - 24 - reserve],
      frame: [x, y + 10, cellW, cellH - 24 - reserve],
    };
    return table ? { ...cell, table: { x: x + 9, y: y + 10 + cellH - 24 - reserve + 2, width: cellW - 18 } } : cell;
  });
  return { width, height, titleY: height - notesHeight, notesHeight, notes, cells };
}

// Top-left of a view box drawn at scale s, centred in its cell's frame.
export const placeView = (cell, viewBox, s) => [
  cell.frame[0] + (cell.frame[2] - viewBox[2] * s) / 2,
  cell.frame[1] + (cell.frame[3] - viewBox[3] * s) / 2,
];
export const fitsCell = (cell, viewBox, s) => !(viewBox[2] * s > cell.avail[0] || viewBox[3] * s > cell.avail[1]);

const sized = (view) =>
  Array.isArray(view?.viewBox) &&
  Number.isFinite(view.viewBox[2]) &&
  Number.isFinite(view.viewBox[3]) &&
  view.viewBox[2] > 0 &&
  view.viewBox[3] > 0;

// The largest standard scale at which every generated view without its own
// scale fits its cell (continuing the 1-2-5 series below 1:10 000); the fixed
// scale when no view qualifies (none generated yet, or all scaled per view).
export function fitScale(sheet, views = sheet.views, parts = []) {
  const { cells } = viewCells(sheet, views, parts);
  const fitted = views
    .map((view, i) => [view, cells[i]])
    .filter(
      ([view, cell]) => typeof view === 'object' && view.scale == null && sized(view) && cell.avail.every((a) => a > 0),
    );
  if (!fitted.length) return numeric(sheet.scale);
  const fitsAll = (s) => fitted.every(([view, cell]) => fitsCell(cell, view.viewBox, s));
  const hit = standardScales().find(fitsAll);
  if (hit) return hit;
  for (let p = 10000; p < 1e300; p *= 10) for (const m of [2, 5, 10]) if (fitsAll(1 / (m * p))) return 1 / (m * p);
  return 1e-300;
}

// The sheet scale views without their own scale are drawn at.
export const resolveSheetScale = (sheet, views = sheet.views, parts = []) =>
  sheet.scaleMode === 'fit' ? fitScale(sheet, views, parts) : numeric(sheet.scale);

const viewScale = (view, scale) => (typeof view === 'object' && view.scale != null ? numeric(view.scale) : scale);
// Whether every generated view fits at this sheet scale (own view scales kept).
export function fitsAt(sheet, views, scale, parts = []) {
  const { cells } = viewCells(sheet, views, parts);
  return views.every((view, i) => !sized(view) || fitsCell(cells[i], view.viewBox, viewScale(view, scale)));
}

// What fits at a scale (given, or the sheet's own): per view { name, kind,
// scale, need, avail, fits, ownScale }, the largest standard scale that fits,
// and the smallest page on which this scale fits (null when none does).
export function sheetFit(sheet, views = sheet.views, { scale, parts = [] } = {}) {
  const s = scale ?? resolveSheetScale(sheet, views, parts);
  const { cells } = viewCells(sheet, views, parts);
  const rows = views.map((view, i) => {
    const vs = viewScale(view, s),
      box = sized(view) ? view.viewBox : null;
    return {
      name: typeof view === 'string' ? view : view.name,
      kind: kindOf(view),
      scale: vs,
      ownScale: typeof view === 'object' && view.scale != null,
      need: box ? [box[2] * vs, box[3] * vs] : [0, 0],
      avail: cells[i].avail,
      fits: !box || fitsCell(cells[i], box, vs),
    };
  });
  const area = (size) => PAGE_SIZES[size][0] * PAGE_SIZES[size][1];
  return {
    scale: s,
    views: rows,
    fits: rows.every((r) => r.fits),
    largestFittingScale: fitScale({ ...sheet, scaleMode: 'fit' }, views, parts),
    smallestFittingPage:
      Object.keys(PAGE_SIZES)
        .sort((a, b) => area(a) - area(b))
        .find((size) => fitsAt({ ...sheet, size }, views, s, parts)) || null,
  };
}

// The renderers' overflow error: what to do, not only what went wrong.
export function overflowMessage(sheet, view, fit) {
  const row = fit.views.find((r) => r.name === view.name && !r.fits) || fit.views.find((r) => !r.fits);
  const page = fit.smallestFittingPage && fit.smallestFittingPage !== sheet.size ? fit.smallestFittingPage : null;
  const advice = row?.ownScale
    ? `Reduce its view scale${page ? `, or use ${page}` : ''}.`
    : `Use Fit to page, choose ${scaleLabel(fit.largestFittingScale)} or smaller${page ? `, or use ${page}` : ''}.`;
  return `${sheet.title}: ${view.name} does not fit on ${PAGE_SIZES[sheet.size] ? sheet.size : 'A3'} at ${scaleLabel(row?.scale ?? fit.scale)}. ${advice}`;
}
