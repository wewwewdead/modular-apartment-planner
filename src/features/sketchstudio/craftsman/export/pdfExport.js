/**
 * Full-scale PDF export via browser print.
 * Creates a hidden iframe with SVG content and triggers print dialog.
 * Includes a ruler graphic for physical scale verification.
 */

import { exportEntitiesToSvg } from './svgExport';

function buildRulerSvg(x, y) {
  let ruler = `<g transform="translate(${x}, ${y})" stroke="black" stroke-width="0.3" fill="none">`;
  ruler += `<line x1="0" y1="0" x2="100" y2="0" />`;
  for (let i = 0; i <= 100; i += 10) {
    const h = i % 50 === 0 ? 8 : 4;
    ruler += `<line x1="${i}" y1="0" x2="${i}" y2="${-h}" />`;
    if (i % 10 === 0) {
      ruler += `<text x="${i}" y="${-10}" font-size="3" text-anchor="middle" fill="black" font-family="sans-serif">${i}</text>`;
    }
  }
  ruler += `<text x="50" y="6" font-size="2.5" text-anchor="middle" fill="black" font-family="sans-serif">100mm ruler — verify with physical ruler</text>`;
  ruler += `</g>`;
  return ruler;
}

export function printEntities(entities, options = {}) {
  const svgContent = exportEntitiesToSvg(entities, options);

  // Parse the SVG to inject the ruler
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');

  if (!svgEl) return;

  const viewBox = svgEl.getAttribute('viewBox')?.split(' ').map(Number) || [0, 0, 100, 100];
  const rulerX = viewBox[0] + 5;
  const rulerY = viewBox[1] + viewBox[3] - 5;

  // Expand viewBox to fit ruler and ensure mm units for print scale
  const newHeight = viewBox[3] + 15;
  svgEl.setAttribute('viewBox', `${viewBox[0]} ${viewBox[1]} ${viewBox[2]} ${newHeight}`);
  svgEl.setAttribute('width', `${viewBox[2]}mm`);
  svgEl.setAttribute('height', `${newHeight}mm`);

  // Add ruler
  const rulerGroup = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  rulerGroup.innerHTML = buildRulerSvg(rulerX, rulerY);
  svgEl.appendChild(rulerGroup);

  const svgString = new XMLSerializer().serializeToString(doc);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.width = '0';
  iframe.style.height = '0';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(`<!DOCTYPE html>
<html>
<head>
<style>
  @page { margin: 5mm; }
  body { margin: 0; padding: 0; }
  svg { display: block; max-width: 100%; height: auto; }
  .print-note { font-family: sans-serif; font-size: 10px; color: #666; margin: 2mm 0; }
</style>
</head>
<body>
  <p class="print-note">Craftsman Studio — set "Scale: 100%" and "Margins: None" for true 1:1 output</p>
  ${svgString}
</body>
</html>`);
  iframeDoc.close();

  iframe.contentWindow.focus();
  iframe.contentWindow.print();

  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);
}
