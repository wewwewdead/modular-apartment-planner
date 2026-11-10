// @vitest-environment jsdom
// Phase T (docs/sketch-studio-sheet-pdf.md §§3–4, §8): the sheet PDF writer.
// Pump-bracket sheets projected by the real kernel, written uncompressed so
// the page boxes, text operators and their WinAnsi bytes can be read back.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createKernelSession } from './kernel.js';
import { pumpBracketExample } from './pumpBracket.js';
import { sheetSvg } from './drawings.js';
import { pdfTextIssueMessage, pdfTextIssues, svgTexts, winAnsiText } from './pdfText.js';
import { sheetsPdf } from './sheetPdf.js';

// svg2pdf's package `main` is a UMD build that expects a global jsPDF; the
// app bundles its ES build (the `browser` / `module` field), so the tests do too.
vi.mock('svg2pdf.js', async () => await import('svg2pdf.js/dist/svg2pdf.es.min.js'));

const require = createRequire(import.meta.url);
let model, snapshot, sheets;
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) }));
  // jsdom has no layout: svg2pdf measures anchored text with getBBox (a
  // stand-in width) and probes a canvas it does not need.
  HTMLCanvasElement.prototype.getContext = () => null;
  window.SVGElement.prototype.getBBox = function () {
    return { x: 0, y: 0, width: (this.textContent || '').length * 1.5, height: 3 };
  };
  model = pumpBracketExample();
  // The symbols every sheet can print, in the first sheet's drawing notes.
  model.sheets[0] = { ...model.sheets[0], notes: 'TOL ± 0.1 · BEND 90° — EDGES 2–3 · 4 × Ø6.6' };
  const session = createKernelSession(model);
  try {
    snapshot = session.snapshot();
    const [assembly, detail] = session.drawings();
    sheets = [assembly, { ...detail, size: 'A1' }];
  } finally {
    session.dispose();
  }
}, 120000);

// The PDF as text, one char per byte, and each page's content stream.
const pdfText = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
};
const contents = (pdf) => [...pdf.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((m) => m[1]);
// The string operands of the text-showing operators, as byte strings.
const shown = (stream) => [...stream.matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map((m) => m[1]);
const mm = (v) => (v * 72) / 25.4;
const utf16 = (text) =>
  '\xfe\xff' + [...text].map((c) => String.fromCharCode(c.charCodeAt(0) >> 8, c.charCodeAt(0) & 255)).join('');
const boxes = (pdf) =>
  [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe('sheetsPdf', () => {
  it('two pump-bracket sheets on A3 and A1: true-size pages, numbered n of 2, with metadata', async () => {
    const progress = [];
    const blob = await sheetsPdf(sheets, model, snapshot, {
      title: 'Pump bracket - drawings',
      onProgress: (p) => progress.push(p),
      compress: false,
    });
    expect(blob.type).toBe('application/pdf');
    const pdf = await pdfText(blob);
    const [a3, a1] = boxes(pdf);
    expect(a3[0]).toBeCloseTo(mm(420), 2);
    expect(a3[1]).toBeCloseTo(mm(297), 2);
    expect(a1[0]).toBeCloseTo(mm(841), 2);
    expect(a1[1]).toBeCloseTo(mm(594), 2);
    expect(boxes(pdf)).toHaveLength(2);
    expect(pdf).toContain('/Title (Pump bracket - drawings)');
    expect(pdf).toContain('/Subject (Engineering drawings)');
    expect(pdf).toContain('/Creator (Sketch Studio)');
    // Non-ASCII metadata is UTF-16BE with its byte-order mark, so any title reads right.
    expect(pdf).toContain(`/Keywords (${utf16(sheets.map((s) => s.title).join(', '))})`);
    // Page numbers: the export set's, in page order.
    const pages = contents(pdf).filter((c) => / Tj/.test(c));
    expect(pages).toHaveLength(2);
    expect(shown(pages[0]).some((t) => t.includes('1 of 2'))).toBe(true);
    expect(shown(pages[1]).some((t) => t.includes('2 of 2'))).toBe(true);
    expect(shown(pages[0]).some((t) => t.includes('2 of 2'))).toBe(false);
    // Once per page, naming the page about to be drawn.
    expect(progress).toEqual([
      { done: 0, total: 2, title: sheets[0].title, page: 1 },
      { done: 1, total: 2, title: sheets[1].title, page: 2 },
    ]);
  }, 60000);

  it('prints Ø × ± ° — · – as their single WinAnsi bytes (no mapping needed)', async () => {
    const blob = await sheetsPdf(sheets.slice(0, 1), model, snapshot, { compress: false });
    const text = shown(contents(await pdfText(blob)).find((c) => / Tj/.test(c)));
    const note = text.find((t) => t.startsWith('TOL'));
    // Each a byte in Helvetica's WinAnsiEncoding: ± B1, · B7, ° B0, — 97, – 96, × D7, Ø D8.
    expect([...note].map((c) => c.charCodeAt(0).toString(16))).toEqual(
      [...'TOL \xb1 0.1 \xb7 BEND 90\xb0 \x97 EDGES 2\x963 \xb7 4 \xd7 \xd86.6'].map((c) =>
        c.charCodeAt(0).toString(16),
      ),
    );
    // Every text run is single-byte: no character went out as UTF-16.
    expect(text.every((t) => !t.includes('\0'))).toBe(true);
    // The hole callouts' diameter sign too.
    expect(text.some((t) => /\xd8\d/.test(t))).toBe(true);
    expect(await pdfText(blob)).toContain('/Encoding /WinAnsiEncoding');
  }, 60000);

  it('a character Helvetica cannot draw prints as its stand-in, and the rest of the line stays intact', async () => {
    const sheet = { ...sheets[0], notes: 'Frame 日本 ≤ 2 Böllhoff' };
    const blob = await sheetsPdf([sheet], model, snapshot, { compress: false });
    const text = shown(contents(await pdfText(blob)).find((c) => / Tj/.test(c)));
    // Left to jsPDF, the whole line would be written two bytes per character.
    expect(text).toContain('Frame ?? <= 2 B\xf6llhoff');
  }, 60000);

  it('an aborted signal rejects with AbortError and draws no further page', async () => {
    const controller = new AbortController();
    controller.abort();
    const before = vi.fn();
    await expect(sheetsPdf(sheets, model, snapshot, { signal: controller.signal, onProgress: before })).rejects.toThrow(
      expect.objectContaining({ name: 'AbortError' }),
    );
    expect(before).not.toHaveBeenCalled();
    // Cancelled while page 1 draws: page 2 is never started.
    const live = new AbortController();
    const progress = vi.fn(() => live.abort());
    await expect(sheetsPdf(sheets, model, snapshot, { signal: live.signal, onProgress: progress })).rejects.toThrow(
      expect.objectContaining({ name: 'AbortError' }),
    );
    expect(progress).toHaveBeenCalledTimes(1);
  }, 60000);

  it('takes the preflight’s pre-rendered pages and refuses an overflowing fixed scale itself', async () => {
    const svg = sheetSvg(sheets[0], model, snapshot, 4, 9);
    const blob = await sheetsPdf(null, model, snapshot, {
      pages: [{ svg, size: 'A4', title: 'Pre-rendered' }],
      compress: false,
    });
    const pdf = await pdfText(blob);
    expect(boxes(pdf)[0][0]).toBeCloseTo(mm(297), 2);
    expect(shown(contents(pdf).find((c) => / Tj/.test(c))).some((t) => t.includes('4 of 9'))).toBe(true);
    const tiny = { ...sheets[0], scaleMode: 'fixed', scale: 50 };
    await expect(sheetsPdf([tiny], model, snapshot)).rejects.toThrow(/does not fit on A3 at 50:1/);
  }, 60000);
});

describe('pdfTextIssues', () => {
  it('flags 日 and passes Ø × ± ° — · –', () => {
    expect(pdfTextIssues('<svg><text>Ø6.6 × 2 ± 0.1 ° — · –</text></svg>', 'Bracket')).toBeNull();
    const issue = pdfTextIssues('<svg><text x="1">Frame 日本</text><text>日 ≤ 3 &amp; &#x2713;</text></svg>', 'Frame');
    expect(issue).toEqual({ title: 'Frame', chars: ['日', '本', '≤', '✓'], standIns: ['?', '?', '<=', '?'] });
    expect(pdfTextIssueMessage({ title: 'Frame', chars: ['日', '本'], standIns: ['?', '?'] })).toBe(
      "‘Frame’: these characters can't be shown in the PDF: 日本 (they print as ?)",
    );
    expect(pdfTextIssueMessage(issue)).toContain('(they print as 日 → ?, 本 → ?, ≤ → <=, ✓ → ?)');
  });
  it('reads every <text> of a real sheet, entities decoded', () => {
    const texts = svgTexts(sheetSvg(sheets[0], model, snapshot, 1, 1));
    expect(texts.some((t) => t.startsWith('TOL ± 0.1'))).toBe(true);
    expect(pdfTextIssues(sheetSvg(sheets[0], model, snapshot, 1, 1), 'x')).toBeNull();
    expect(winAnsiText('a−b ⌀ 6 😀')).toBe('a-b Ø 6 ?');
  });
});
