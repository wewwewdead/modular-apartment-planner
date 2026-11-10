// @vitest-environment jsdom
// Phase T (docs/sketch-studio-sheet-pdf.md §3, §8): exports.js no longer
// imports jsPDF or svg2pdf; the workshop ZIP's drawings/workshop.pdf comes
// from the same sheetPdf.js writer, loaded when the ZIP is packed, and a sheet
// that cannot be exported stops the ZIP by name.
import { beforeAll, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createKernelSession } from './kernel.js';
import { pumpBracketExample } from './pumpBracket.js';

const loaded = vi.hoisted(() => ({ jspdf: 0, svg2pdf: 0 }));
vi.mock('jspdf', async (importOriginal) => {
  loaded.jspdf++;
  return importOriginal();
});
// The ES build the app bundles (sheetPdf.test.js says why).
vi.mock('svg2pdf.js', async () => {
  loaded.svg2pdf++;
  return import('svg2pdf.js/dist/svg2pdf.es.min.js');
});

// The sheet DXF reads the laid-out SVG (getCTM), which jsdom cannot lay out.
vi.mock('./sheetDxf.js', () => ({ sheetDxf: (svg) => `0\nSECTION\n${svg.length}` }));

const require = createRequire(import.meta.url);
let model, snapshot, drawings;
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: readFileSync(require.resolve('replicad-opencascadejs/wasm')) }));
  HTMLCanvasElement.prototype.getContext = () => null;
  window.SVGElement.prototype.getBBox = function () {
    return { x: 0, y: 0, width: (this.textContent || '').length * 1.5, height: 3 };
  };
  model = pumpBracketExample();
  const session = createKernelSession(model);
  try {
    snapshot = session.snapshot();
    drawings = session.drawings({ includeParts: true });
  } finally {
    session.dispose();
  }
}, 120000);

it('exports.js loads without jsPDF; the workshop ZIP still holds drawings/workshop.pdf', async () => {
  const { workshopZip } = await import('./exports.js');
  expect(loaded).toEqual({ jspdf: 0, svg2pdf: 0 });
  const blob = await workshopZip(
    model,
    snapshot,
    { assembly: null, files: [], drawings, profiles: [] },
    'Pump bracket',
  );
  expect(loaded.jspdf).toBe(1);
  expect(loaded.svg2pdf).toBe(1);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const pdf = await zip.file('drawings/workshop.pdf').async('string');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  // One page per sheet, the automatic part detail sheets included.
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(drawings.length);
  for (const sheet of drawings) {
    expect(zip.file(`drawings/${sheet.id.replace(/[^A-Za-z0-9_-]/g, '_')}.svg`)).toBeTruthy();
    expect(zip.file(`drawings/${sheet.id.replace(/[^A-Za-z0-9_-]/g, '_')}.dxf`)).toBeTruthy();
  }
}, 60000);

it('a sheet the ZIP cannot export is named in the error', async () => {
  const { workshopZip } = await import('./exports.js');
  const broken = {
    ...drawings[0],
    annotations: [...(drawings[0].annotations || []), { id: 'w', type: 'weld-note', connectionId: 'gone' }],
  };
  await expect(
    workshopZip(model, snapshot, { assembly: null, files: [], drawings: [broken], profiles: [] }, 'Pump bracket'),
  ).rejects.toThrow(`Sheet “${broken.title}”: Broken weld reference: gone`);
  // An overflow already starts with the sheet's title: not named twice.
  const overflow = { ...drawings[0], scaleMode: 'fixed', scale: 50 };
  await expect(
    workshopZip(model, snapshot, { assembly: null, files: [], drawings: [overflow], profiles: [] }, 'Pump bracket'),
  ).rejects.toThrow(new RegExp(`^${overflow.title}: .* does not fit on A3 at 50:1`));
}, 60000);
