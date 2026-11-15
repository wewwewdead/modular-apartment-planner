// @vitest-environment jsdom
// The drawing view kind 'flat' through the sheet PDF (docs/sketch-studio-fab-
// shop.md §9 SM-4 item 3): the control box body's flat-pattern sheet, projected
// by the real kernel, fitted to its page and written as one true-size page with
// its bend labels and bend table in single-byte WinAnsi text.
import { beforeAll, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createKernelSession } from './kernel.js';
import { normalizeModel } from './model.js';
import { sheetMetalControlBox } from './shopExamples.js';
import { sheetSvg } from './drawings.js';
import { pdfTextIssues } from './pdfText.js';
import { sheetsPdf } from './sheetPdf.js';

vi.mock('svg2pdf.js', async () => await import('svg2pdf.js/dist/svg2pdf.es.min.js'));
const require = createRequire(import.meta.url);
let model, snapshot, sheet;
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) }));
  HTMLCanvasElement.prototype.getContext = () => null;
  window.SVGElement.prototype.getBBox = function () {
    return { x: 0, y: 0, width: (this.textContent || '').length * 1.5, height: 3 };
  };
  model = normalizeModel(sheetMetalControlBox());
  const session = createKernelSession(model);
  try {
    snapshot = session.snapshot();
    const [drawn] = session.drawings({ sheetIds: ['shop-box-flat-sheet'] });
    sheet = { ...model.sheets.find((s) => s.id === drawn.id), bounds: drawn.bounds, views: drawn.views };
  } finally {
    session.dispose();
  }
}, 120000);

it('writes the flat-pattern sheet as an A3 page with its bend labels and bend table', async () => {
  const svg = sheetSvg(sheet, model, snapshot, 1, 1);
  expect(pdfTextIssues(svg, sheet.title)).toBe(null);
  const blob = await sheetsPdf([sheet], model, snapshot, { compress: false });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let pdf = '';
  for (const b of bytes) pdf += String.fromCharCode(b);
  const shown = [...pdf.matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map((m) => m[1]);
  expect([...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)]).toHaveLength(1);
  // ° is 0xB0, · 0xB7, — 0x97 in WinAnsi.
  expect(shown).toContain('1 \xb7 UP 90\xb0 R1.28');
  expect(shown).toContain('BEND TABLE \x97 IN THE ORDER MADE');
  expect(shown).toContain('Straight 88\xb0 / V8 88\xb0');
}, 60000);
