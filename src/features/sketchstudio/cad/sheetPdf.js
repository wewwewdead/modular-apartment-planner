import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import { sheetSvg } from './drawings.js';
import { PAGE_SIZES } from './sheetLayout.js';
import { winAnsiText } from './pdfText.js';

export { pdfTextIssues, pdfTextIssueMessage } from './pdfText.js';

// The drawing-sheet PDF writer (Phase T, docs/sketch-studio-sheet-pdf.md §3):
// the only importer of jsPDF and svg2pdf, loaded with import() when a PDF is
// made, so neither library is in the workspace or exports chunk.

export const abortError = () => new DOMException('PDF export cancelled.', 'AbortError');

// Each <text>'s characters as Helvetica (WinAnsi) can draw them: a character
// outside cp1252 would make jsPDF write the whole line as two-byte text,
// which a single-byte font prints as garbage (pdfText.js).
function winAnsiSvg(root) {
  for (const element of root.getElementsByTagName('text'))
    for (const node of element.childNodes) {
      if (node.nodeType !== 3) continue;
      const safe = winAnsiText(node.data);
      if (safe !== node.data) node.data = safe;
    }
  return root;
}

// One PDF of true-size landscape pages, PAGE_SIZES[sheet.size] millimetres
// each, so A3 at 1:20 prints at 1:20 at actual size. `pages` takes sheet SVG
// strings the preflight already rendered ([{ svg, size, title }]); otherwise
// each sheet is rendered here as page `pageOffset + n` of `pageTotal`, never
// with allowOverflow (an export refuses a view that does not fit). Before each
// page the signal is checked (AbortError) and `onProgress({ done, total,
// title, page })` names the page about to be drawn; the loop yields between
// pages so the progress paints and Cancel is heard. `compress: false` is for
// tests, which read the content streams.
export async function sheetsPdf(
  sheets,
  model,
  snapshot,
  { title = '', onProgress, signal, pageOffset = 0, pageTotal, pages, compress = true } = {},
) {
  const list = pages || sheets.map((sheet) => ({ sheet, size: sheet.size, title: sheet.title }));
  if (!list.length) throw new Error('No sheets to export.');
  const total = list.length,
    numbered = pageTotal ?? pageOffset + total;
  let pdf = null;
  for (let index = 0; index < total; index++) {
    if (signal?.aborted) throw abortError();
    const page = list[index],
      [width, height] = PAGE_SIZES[page.size] || PAGE_SIZES.A3;
    onProgress?.({ done: index, total, title: page.title, page: index + 1 });
    const svg =
      page.svg ??
      sheetSvg(page.sheet, model, snapshot, pageOffset + index + 1, numbered, {
        allowOverflow: false,
      });
    if (pdf) pdf.addPage([width, height], 'landscape');
    else pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [width, height], compress });
    const root = winAnsiSvg(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement);
    await pdf.svg(root, { x: 0, y: 0, width, height });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (signal?.aborted) throw abortError();
  // jsPDF writes non-ASCII metadata as UTF-16 (with its BOM), so these need no stand-ins.
  pdf.setProperties({
    title,
    subject: 'Engineering drawings',
    creator: 'Sketch Studio',
    keywords: list.map((p) => p.title).join(', '),
  });
  return pdf.output('blob');
}
