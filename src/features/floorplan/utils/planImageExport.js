/**
 * Save the plan on the canvas as a PNG.
 *
 * The browser's own SVG rasteriser draws it, not the hand-written PDF exporter,
 * so everything the presentation plan uses — the card's drop shadow, the
 * fixture shadows, the wall-shadow clip paths — comes through exactly as it is
 * on screen. The picture is the screen at `pixelRatio`× resolution, cropped to
 * the drawing, on a white margin:
 *
 *   - geometry and text are in world millimetres, so they scale with the
 *     output's pixels-per-millimetre (the canvas zoom × `pixelRatio`);
 *   - strokes are non-scaling screen pixels on the canvas, so they are scaled by
 *     `pixelRatio` alone — a 1 px line on screen is a 3 px line in a 3× image;
 *   - the fonts are inlined as data URLs, because an SVG drawn into a canvas
 *     cannot load anything — and nothing is fetched from the network, so the
 *     desktop app works offline.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_OUTPUT_PX = 7000;
const MARGIN_CSS_PX = 48;

const FONT_FILES = [
  { family: 'Manrope', file: 'fonts/manrope-latin.woff2', weight: '200 800' },
  { family: 'JetBrains Mono', file: 'fonts/jetbrains-mono-latin.woff2', weight: '400' },
];

const FONT_STACKS = {
  '--font-ui': 'Manrope, system-ui, -apple-system, sans-serif',
  '--font-heading': 'Manrope, system-ui, -apple-system, sans-serif',
  '--font-blueprint': "'JetBrains Mono', 'Courier New', monospace",
};

/** `var(--x)` → the value the page resolves it to, for a document that has no stylesheet. */
export function resolveCssVariables(value, lookup) {
  return String(value).replace(/var\((--[a-z0-9-]+)(?:\s*,\s*([^)]+))?\)/gi, (_, name, fallback) => {
    const resolved = lookup(name);
    return resolved || (fallback ? fallback.trim() : '');
  });
}

/**
 * Multiply the stroke of every non-scaling element by `factor`, dashes included
 * — on the canvas they are screen pixels, and the image has `factor` pixels for
 * every one of them.
 */
export function scaleNonScalingStrokes(root, factor) {
  const nodes = [root, ...root.querySelectorAll('*')];
  for (const node of nodes) {
    if (node.getAttribute?.('vector-effect') !== 'non-scaling-stroke') continue;
    const width = Number.parseFloat(node.getAttribute('stroke-width'));
    node.setAttribute('stroke-width', String((Number.isFinite(width) ? width : 1) * factor));
    const dashes = node.getAttribute('stroke-dasharray');
    if (dashes && dashes !== 'none') {
      node.setAttribute(
        'stroke-dasharray',
        dashes
          .split(/[\s,]+/)
          .filter(Boolean)
          .map((part) => String(Number.parseFloat(part) * factor))
          .join(' '),
      );
    }
  }
}

function rootVariableLookup() {
  const style = typeof window !== 'undefined' ? window.getComputedStyle(document.documentElement) : null;
  return (name) => FONT_STACKS[name] || style?.getPropertyValue(name)?.trim() || '';
}

function resolveVariablesInTree(root, lookup) {
  const nodes = [root, ...root.querySelectorAll('*')];
  for (const node of nodes) {
    for (const attribute of [...node.attributes]) {
      if (attribute.value.includes('var(--'))
        node.setAttribute(attribute.name, resolveCssVariables(attribute.value, lookup));
    }
    const inline = node.getAttribute('style');
    if (inline && inline.includes('var(--')) node.setAttribute('style', resolveCssVariables(inline, lookup));
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * The fonts as `@font-face` rules with data URLs. Tried against the page's own
 * origin first and then relative to the document, which is what a `file://`
 * desktop build needs; a font that cannot be read is simply left out and the
 * text falls back to the system face.
 */
async function inlineFontCss() {
  const rules = [];
  for (const font of FONT_FILES) {
    const candidates = [];
    if (/^https?:$/.test(window.location.protocol))
      candidates.push(new URL(`/${font.file}`, window.location.origin).href);
    candidates.push(new URL(font.file, window.location.href.split('#')[0]).href);
    for (const url of candidates) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const dataUrl = await blobToDataUrl(await response.blob());
        rules.push(
          `@font-face{font-family:'${font.family}';font-weight:${font.weight};font-style:normal;src:url(${dataUrl}) format('woff2');}`,
        );
        break;
      } catch {
        // Next candidate.
      }
    }
  }
  return rules.join('');
}

function unionBox(boxes) {
  const valid = boxes.filter((box) => box && box.width > 0 && box.height > 0);
  if (!valid.length) return null;
  const minX = Math.min(...valid.map((box) => box.x));
  const minY = Math.min(...valid.map((box) => box.y));
  const maxX = Math.max(...valid.map((box) => box.x + box.width));
  const maxY = Math.max(...valid.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The standalone SVG for the plan on `svgElement`, and the pixel size to draw
 * it at. Null when there is no plan on the canvas.
 */
export async function buildPlanImageSvg(svgElement, { zoom, pixelRatio = 3 } = {}) {
  const planLayer = svgElement?.querySelector('[data-plan-layer]');
  if (!planLayer || !(zoom > 0)) return null;
  const card = svgElement.querySelector('[data-type="plan-card"]');

  // World-millimetre extents of what is drawn: the card's shadow and the
  // drawing itself, not the grid or the tool overlays around them.
  const box = unionBox([planLayer.getBBox(), card?.getBBox()]);
  if (!box) return null;

  let pxPerMm = zoom * pixelRatio;
  const marginMm = (MARGIN_CSS_PX * pixelRatio) / pxPerMm;
  const viewBox = {
    x: box.x - marginMm,
    y: box.y - marginMm,
    width: box.width + marginMm * 2,
    height: box.height + marginMm * 2,
  };
  // Very deep zooms would ask for an enormous image; cap the long side.
  let strokeFactor = pixelRatio;
  const longest = Math.max(viewBox.width, viewBox.height) * pxPerMm;
  if (longest > MAX_OUTPUT_PX) {
    const shrink = MAX_OUTPUT_PX / longest;
    pxPerMm *= shrink;
    strokeFactor *= shrink;
  }
  const width = Math.round(viewBox.width * pxPerMm);
  const height = Math.round(viewBox.height * pxPerMm);

  const doc = document.implementation.createDocument(SVG_NS, 'svg', null);
  const root = doc.documentElement;
  root.setAttribute('xmlns', SVG_NS);
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);

  const style = doc.createElementNS(SVG_NS, 'style');
  style.textContent = await inlineFontCss();
  root.appendChild(style);

  const paper = doc.createElementNS(SVG_NS, 'rect');
  paper.setAttribute('x', String(viewBox.x));
  paper.setAttribute('y', String(viewBox.y));
  paper.setAttribute('width', String(viewBox.width));
  paper.setAttribute('height', String(viewBox.height));
  paper.setAttribute('fill', '#ffffff');
  root.appendChild(paper);

  const lookup = rootVariableLookup();
  for (const source of [card, planLayer]) {
    if (!source) continue;
    const clone = doc.importNode(source, true);
    resolveVariablesInTree(clone, lookup);
    scaleNonScalingStrokes(clone, strokeFactor);
    root.appendChild(clone);
  }

  return { markup: new XMLSerializer().serializeToString(root), width, height };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The plan image could not be drawn.'));
    image.src = url;
  });
}

/** Rasterise the plan to a PNG data URL. */
export async function renderPlanImage(svgElement, options = {}) {
  const built = await buildPlanImageSvg(svgElement, options);
  if (!built) return null;
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(built.markup)}`);
  const canvas = document.createElement('canvas');
  canvas.width = built.width;
  canvas.height = built.height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** `My House` → `my-house-plan.png`; no name at all → `floor-plan.png`. */
export function planImageFileName(projectName) {
  const base =
    String(projectName || 'floor')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'floor';
  return `${base}-plan.png`;
}

export async function savePlanImage(svgElement, { zoom, projectName, pixelRatio = 3 } = {}) {
  const dataUrl = await renderPlanImage(svgElement, { zoom, pixelRatio });
  if (!dataUrl) return null;
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = planImageFileName(projectName);
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return dataUrl;
}
