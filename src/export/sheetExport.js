import { getPaperPreset } from '@/sheets/paper';

const MM_TO_PT = 72 / 25.4;
const ARC_SEGMENTS = 10;
// Line segments per flattened Bézier curve, and per full turn of a circle or ellipse.
const CURVE_SEGMENTS = 16;
const ELLIPSE_SEGMENTS = 48;
// SVG containers that never draw where they stand: their content is only
// drawn by reference (a clip, a fill pattern, a marker, a gradient).
const NON_RENDERED_TAGS = new Set([
  'defs',
  'clippath',
  'pattern',
  'marker',
  'lineargradient',
  'radialgradient',
  'filter',
]);
const MM_PER_INCH = 25.4;
const DEFAULT_PNG_DPI = 300;
const JPEG_QUALITY = 0.92;

function sanitizeFileName(name = 'sheet') {
  return (
    name
      .trim()
      // Strip filesystem-illegal characters and C0 control chars (U+0000-U+001F) from file names.
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 120) || 'sheet'
  );
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function applyComputedSvgStyle(sourceElement, targetElement) {
  const style = window.getComputedStyle(sourceElement);
  const properties = [
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-opacity',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-dasharray',
    'opacity',
    'font-size',
    'font-family',
    'font-weight',
    'letter-spacing',
    'text-anchor',
    'dominant-baseline',
  ];

  for (const property of properties) {
    const value = style.getPropertyValue(property);
    if (value) {
      targetElement.style.setProperty(property, value);
    }
  }
}

function inlineComputedStyles(sourceRoot, clonedRoot) {
  const sourceNodes = [sourceRoot, ...sourceRoot.querySelectorAll('*')];
  const clonedNodes = [clonedRoot, ...clonedRoot.querySelectorAll('*')];

  for (let index = 0; index < sourceNodes.length; index += 1) {
    applyComputedSvgStyle(sourceNodes[index], clonedNodes[index]);
  }
}

function serializeSvg(svgElement) {
  const clone = svgElement.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.removeAttribute('style');

  if (!clone.getAttribute('viewBox')) {
    const width = clone.getAttribute('width') || '100';
    const height = clone.getAttribute('height') || '100';
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  inlineComputedStyles(svgElement, clone);
  return new XMLSerializer().serializeToString(clone);
}

function createImageFromSvgString(svgString) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    image.src = url;
  });
}

function getCanvasScaleFromDpi(dpi) {
  return Math.max(1, (Number(dpi) || DEFAULT_PNG_DPI) / MM_PER_INCH);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function preloadSvgImages(svgElement) {
  const imageMap = new Map();
  const imageElements = svgElement.querySelectorAll('image');
  for (const el of imageElements) {
    const href = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (!href || imageMap.has(href)) continue;
    try {
      const img = await loadImage(href);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const ctx = tempCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const jpegDataUrl = tempCanvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const base64 = jpegDataUrl.split(',')[1];
      const binaryString = atob(base64);
      const jpegBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        jpegBytes[i] = binaryString.charCodeAt(i);
      }
      imageMap.set(href, { img, width: w, height: h, jpegBytes });
    } catch {
      // skip images that fail to load
    }
  }
  return imageMap;
}

async function renderSvgToCanvas(svgElement, dpi = DEFAULT_PNG_DPI, imageMap = new Map()) {
  const width = Number(svgElement.getAttribute('width')) || 100;
  const height = Number(svgElement.getAttribute('height')) || 100;
  const scale = getCanvasScaleFromDpi(dpi);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  [...svgElement.children].forEach((child) => drawElementToCanvas(context, child, imageMap));
  return { canvas };
}

function getExportSvg() {
  return document.querySelector('[data-sheet-export-root="true"]');
}

function fmt(value) {
  const number = Number(value) || 0;
  return Math.abs(number) < 1e-8 ? '0' : number.toFixed(3).replace(/\.?0+$/, '');
}

// The Unicode code points WinAnsiEncoding (Windows-1252) places in 0x80–0x9F;
// its 0xA0–0xFF are Latin-1 as they are.
const WIN_ANSI_HIGH = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

/**
 * A PDF string literal's body for the WinAnsi-encoded Helvetica the exporter
 * declares: printable ASCII as itself (with \, ( and ) escaped), any other
 * character WinAnsi has — ², °, ±, é, – — as its byte in an octal escape, and
 * only a character it cannot show at all as "?".
 */
export function escapePdfText(value = '') {
  let out = '';
  for (const character of String(value)) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0x20 && codePoint <= 0x7e) {
      out += character === '\\' || character === '(' || character === ')' ? `\\${character}` : character;
      continue;
    }
    const byte = codePoint >= 0xa0 && codePoint <= 0xff ? codePoint : WIN_ANSI_HIGH.get(codePoint);
    out += byte ? `\\${byte.toString(8).padStart(3, '0')}` : '?';
  }
  return out;
}

function parseNumberList(value = '') {
  const matches = String(value).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  return matches ? matches.map(Number) : [];
}

function parsePoints(points = '') {
  const values = parseNumberList(points);
  const result = [];
  for (let index = 0; index < values.length; index += 2) {
    result.push({ x: values[index], y: values[index + 1] });
  }
  return result;
}

function parseTransform(transform = '') {
  let matrix = new DOMMatrix();
  const pattern = /([a-zA-Z]+)\(([^)]*)\)/g;
  let match = pattern.exec(transform);
  while (match) {
    const [, name, argsString] = match;
    const args = parseNumberList(argsString);
    switch (name) {
      case 'translate':
        matrix = matrix.multiply(new DOMMatrix().translate(args[0] || 0, args[1] || 0));
        break;
      case 'scale':
        matrix = matrix.multiply(new DOMMatrix().scale(args[0] ?? 1, args[1] ?? args[0] ?? 1));
        break;
      case 'rotate':
        if (args.length >= 3) {
          matrix = matrix.multiply(
            new DOMMatrix().translate(args[1], args[2]).rotate(args[0]).translate(-args[1], -args[2]),
          );
        } else {
          matrix = matrix.multiply(new DOMMatrix().rotate(args[0] || 0));
        }
        break;
      case 'matrix':
        if (args.length >= 6) {
          matrix = matrix.multiply(new DOMMatrix([args[0], args[1], args[2], args[3], args[4], args[5]]));
        }
        break;
      default:
        break;
    }
    match = pattern.exec(transform);
  }
  return matrix;
}

function matrixIsIdentity(matrix) {
  return (
    Math.abs(matrix.a - 1) < 1e-8 &&
    Math.abs(matrix.b) < 1e-8 &&
    Math.abs(matrix.c) < 1e-8 &&
    Math.abs(matrix.d - 1) < 1e-8 &&
    Math.abs(matrix.e) < 1e-8 &&
    Math.abs(matrix.f) < 1e-8
  );
}

function parseViewBox(svgElement) {
  const values = parseNumberList(svgElement.getAttribute('viewBox') || '');
  if (values.length !== 4) {
    return {
      minX: 0,
      minY: 0,
      width: Number(svgElement.getAttribute('width')) || 0,
      height: Number(svgElement.getAttribute('height')) || 0,
    };
  }
  return {
    minX: values[0],
    minY: values[1],
    width: values[2],
    height: values[3],
  };
}

function getLocalMatrix(element) {
  const transformAttr = element.getAttribute('transform') || '';
  let matrix = new DOMMatrix();

  if (element.tagName.toLowerCase() === 'svg') {
    const x = Number(element.getAttribute('x')) || 0;
    const y = Number(element.getAttribute('y')) || 0;
    const width = Number(element.getAttribute('width')) || 0;
    const height = Number(element.getAttribute('height')) || 0;
    const viewBox = parseViewBox(element);
    const scaleX = viewBox.width ? width / viewBox.width : 1;
    const scaleY = viewBox.height ? height / viewBox.height : 1;
    matrix = matrix
      .translate(x, y)
      .scale(scaleX || 1, scaleY || 1)
      .translate(-viewBox.minX, -viewBox.minY);
  }

  if (transformAttr) {
    matrix = matrix.multiply(parseTransform(transformAttr));
  }

  return matrix;
}

/**
 * A CSS colour as `[r, g, b, alpha]`, each 0–1, or null for no paint at all.
 * Computed styles give rgb()/rgba(); hex (#rgb, #rgba, #rrggbb, #rrggbbaa)
 * and `transparent` are read as well.
 */
export function parseColor(styleValue) {
  if (!styleValue || styleValue === 'none') return null;
  const normalized = String(styleValue).trim();
  if (normalized.toLowerCase() === 'transparent') return [0, 0, 0, 0];

  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1);
    const chunks =
      hex.length === 3 || hex.length === 4
        ? hex.split('').map((value) => value + value)
        : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6), ...(hex.length === 8 ? [hex.slice(6, 8)] : [])];
    const [r, g, b, a = 'ff'] = chunks;
    return [r, g, b, a].map((value) => parseInt(value, 16) / 255);
  }

  const rgb = normalized.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    // Legacy commas, or the space-and-slash form.
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    const channels = parts.slice(0, 3).map((value) => Number.parseFloat(value) / 255);
    const alphaText = parts[3];
    const alpha =
      alphaText === undefined
        ? 1
        : alphaText.endsWith('%')
          ? Number.parseFloat(alphaText) / 100
          : Number.parseFloat(alphaText);
    return [...channels, Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1];
  }

  return null;
}

// An opacity property as 0–1: a missing or unreadable value is opaque, and 0 is 0.
function opacityValue(raw) {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

function computeStyle(element) {
  return styleFromComputed(window.getComputedStyle(element));
}

/**
 * The drawing style the exporters use, from a computed style. A colour with
 * no alpha (`transparent`, `rgba(…, 0)`) is no paint — not black — and a
 * colour's alpha folds into its fill or stroke opacity.
 */
export function styleFromComputed(style) {
  const fillColor = parseColor(style.fill);
  const strokeColor = parseColor(style.stroke);
  const fill = fillColor && fillColor[3] > 0 ? fillColor.slice(0, 3) : null;
  const stroke = strokeColor && strokeColor[3] > 0 ? strokeColor.slice(0, 3) : null;
  const strokeWidth = Number.parseFloat(style.strokeWidth) || 0;
  const lineCap = style.strokeLinecap || 'butt';
  const lineJoin = style.strokeLinejoin || 'miter';
  const dashArray = parseNumberList(style.strokeDasharray || '');
  const fontSize = Number.parseFloat(style.fontSize) || 12;
  const opacity = opacityValue(style.opacity);
  const fillOpacity = fill ? opacity * opacityValue(style.fillOpacity) * fillColor[3] : 0;
  const strokeOpacity = stroke ? opacity * opacityValue(style.strokeOpacity) * strokeColor[3] : 0;

  return {
    fill,
    stroke,
    strokeWidth,
    lineCap,
    lineJoin,
    dashArray,
    fontSize,
    fontFamily: style.fontFamily || 'Arial',
    fontWeight: style.fontWeight || '400',
    textAnchor: style.textAnchor || 'start',
    dominantBaseline: style.dominantBaseline || 'auto',
    fillOpacity,
    strokeOpacity,
  };
}

function lineCapCode(value) {
  if (value === 'round') return 1;
  if (value === 'square') return 2;
  return 0;
}

function lineJoinCode(value) {
  if (value === 'round') return 1;
  if (value === 'bevel') return 2;
  return 0;
}

/**
 * An SVG elliptical arc, start to end, as the points of its polyline (the
 * end point last). The endpoint-to-centre conversion of SVG 1.1 §F.6.5, with
 * §F.6.6's corrections: zero radii draw a straight line, and radii too small
 * to span the chord are scaled up until they just do — what a browser draws.
 */
export function buildArcPoints(start, rx, ry, rotation, largeArcFlag, sweepFlag, end) {
  if (!start || !end) return [end];
  let rxAbs = Math.abs(rx);
  let ryAbs = Math.abs(ry);
  if (Math.hypot(end.x - start.x, end.y - start.y) < 1e-9 || rxAbs < 1e-9 || ryAbs < 1e-9) return [end];

  const phi = ((Number(rotation) || 0) * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  // F.6.5.1: the midpoint, in the ellipse's own (unrotated) frame.
  const hx = (start.x - end.x) / 2;
  const hy = (start.y - end.y) / 2;
  const x1 = cos * hx + sin * hy;
  const y1 = -sin * hx + cos * hy;
  // F.6.6.2: scale radii up that cannot reach.
  const lambda = (x1 * x1) / (rxAbs * rxAbs) + (y1 * y1) / (ryAbs * ryAbs);
  if (lambda > 1) {
    const grow = Math.sqrt(lambda);
    rxAbs *= grow;
    ryAbs *= grow;
  }
  // F.6.5.2: the centre in that frame.
  const rx2 = rxAbs * rxAbs;
  const ry2 = ryAbs * ryAbs;
  const numerator = rx2 * ry2 - rx2 * y1 * y1 - ry2 * x1 * x1;
  const denominator = rx2 * y1 * y1 + ry2 * x1 * x1;
  const factor =
    (Boolean(largeArcFlag) === Boolean(sweepFlag) ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cx1 = (factor * rxAbs * y1) / ryAbs;
  const cy1 = (-factor * ryAbs * x1) / rxAbs;
  // F.6.5.3: back to user space.
  const cx = cos * cx1 - sin * cy1 + (start.x + end.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (start.y + end.y) / 2;
  // F.6.5.5–6: the start angle and the sweep.
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const startAngle = angle(1, 0, (x1 - cx1) / rxAbs, (y1 - cy1) / ryAbs);
  let sweep = angle((x1 - cx1) / rxAbs, (y1 - cy1) / ryAbs, (-x1 - cx1) / rxAbs, (-y1 - cy1) / ryAbs);
  if (!sweepFlag && sweep > 0) sweep -= Math.PI * 2;
  else if (sweepFlag && sweep < 0) sweep += Math.PI * 2;

  const points = [];
  for (let index = 1; index < ARC_SEGMENTS; index += 1) {
    const t = startAngle + (sweep * index) / ARC_SEGMENTS;
    const ex = rxAbs * Math.cos(t);
    const ey = ryAbs * Math.sin(t);
    points.push({ x: cx + cos * ex - sin * ey, y: cy + sin * ex + cos * ey });
  }
  // The end point exactly, so the next command starts where this one ended.
  points.push({ x: end.x, y: end.y });
  return points;
}

// A Bézier segment flattened to CURVE_SEGMENTS points after its start (its end last).
function cubicPoints(p0, p1, p2, p3) {
  const points = [];
  for (let index = 1; index <= CURVE_SEGMENTS; index += 1) {
    const t = index / CURVE_SEGMENTS;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    points.push(
      index === CURVE_SEGMENTS
        ? { x: p3.x, y: p3.y }
        : { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y },
    );
  }
  return points;
}

function quadraticPoints(p0, p1, p2) {
  const points = [];
  for (let index = 1; index <= CURVE_SEGMENTS; index += 1) {
    const t = index / CURVE_SEGMENTS;
    const u = 1 - t;
    points.push(
      index === CURVE_SEGMENTS
        ? { x: p2.x, y: p2.y }
        : { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y },
    );
  }
  return points;
}

/**
 * SVG path data as absolute M / L / Z commands: lines as they are, and every
 * curve — cubic and quadratic Béziers (C S Q T) and elliptical arcs (A) —
 * flattened into line segments.
 */
export function parsePathData(pathData = '') {
  const tokens = String(pathData).match(/[AaCcHhLlMmQqSsTtVvZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const commands = [];
  let index = 0;
  let current = { x: 0, y: 0 };
  let subpathStart = { x: 0, y: 0 };
  let command = null;

  // The last cubic / quadratic control point, for S and T to reflect; any
  // other command forgets it, as the SVG spec has it.
  let lastCubic = null;
  let lastQuad = null;

  const nextNumber = () => Number(tokens[index++]);
  const hasNumber = () => index < tokens.length && !/^[A-Za-z]$/.test(tokens[index]);
  const nextPoint = (relative) => {
    const x = nextNumber();
    const y = nextNumber();
    return relative ? { x: current.x + x, y: current.y + y } : { x, y };
  };
  const reflect = (control) => (control ? { x: 2 * current.x - control.x, y: 2 * current.y - control.y } : current);

  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) {
      command = tokens[index++];
    }
    if (!command) break;
    if (!'CcSs'.includes(command)) lastCubic = null;
    if (!'QqTt'.includes(command)) lastQuad = null;

    switch (command) {
      case 'C':
      case 'c':
      case 'S':
      case 's':
        while (hasNumber()) {
          const relative = command === 'c' || command === 's';
          const smooth = command === 'S' || command === 's';
          const c1 = smooth ? reflect(lastCubic) : nextPoint(relative);
          const c2 = nextPoint(relative);
          const end = nextPoint(relative);
          for (const point of cubicPoints(current, c1, c2, end)) commands.push({ type: 'L', ...point });
          lastCubic = c2;
          current = end;
        }
        break;
      case 'Q':
      case 'q':
      case 'T':
      case 't':
        while (hasNumber()) {
          const relative = command === 'q' || command === 't';
          const smooth = command === 'T' || command === 't';
          const control = smooth ? reflect(lastQuad) : nextPoint(relative);
          const end = nextPoint(relative);
          for (const point of quadraticPoints(current, control, end)) commands.push({ type: 'L', ...point });
          lastQuad = control;
          current = end;
        }
        break;
      case 'M':
      case 'm': {
        while (hasNumber()) {
          const x = nextNumber();
          const y = nextNumber();
          current = command === 'm' ? { x: current.x + x, y: current.y + y } : { x, y };
          commands.push({ type: 'M', x: current.x, y: current.y });
          subpathStart = { ...current };
          command = command === 'm' ? 'l' : 'L';
        }
        break;
      }
      case 'L':
      case 'l':
        while (hasNumber()) {
          const x = nextNumber();
          const y = nextNumber();
          current = command === 'l' ? { x: current.x + x, y: current.y + y } : { x, y };
          commands.push({ type: 'L', x: current.x, y: current.y });
        }
        break;
      case 'H':
      case 'h':
        while (hasNumber()) {
          const x = nextNumber();
          current = command === 'h' ? { x: current.x + x, y: current.y } : { x, y: current.y };
          commands.push({ type: 'L', x: current.x, y: current.y });
        }
        break;
      case 'V':
      case 'v':
        while (hasNumber()) {
          const y = nextNumber();
          current = command === 'v' ? { x: current.x, y: current.y + y } : { x: current.x, y };
          commands.push({ type: 'L', x: current.x, y: current.y });
        }
        break;
      case 'A':
      case 'a':
        while (hasNumber()) {
          const rx = nextNumber();
          const ry = nextNumber();
          const rotation = nextNumber();
          const largeArcFlag = nextNumber();
          const sweepFlag = nextNumber();
          const xValue = nextNumber();
          const yValue = nextNumber();
          const end = command === 'a' ? { x: current.x + xValue, y: current.y + yValue } : { x: xValue, y: yValue };
          const arcPoints = buildArcPoints(current, rx, ry, rotation, largeArcFlag, sweepFlag, end);
          for (const point of arcPoints) {
            commands.push({ type: 'L', x: point.x, y: point.y });
          }
          current = end;
        }
        break;
      case 'Z':
      case 'z':
        commands.push({ type: 'Z' });
        current = { ...subpathStart };
        break;
      default:
        index = tokens.length;
        break;
    }
  }

  return commands;
}

function emitPathFromPoints(builder, points, closePath) {
  if (!points.length) return;
  builder.write(`${fmt(points[0].x)} ${fmt(points[0].y)} m`);
  for (let index = 1; index < points.length; index += 1) {
    builder.write(`${fmt(points[index].x)} ${fmt(points[index].y)} l`);
  }
  if (closePath) builder.write('h');
}

class PdfBuilder {
  constructor(pageWidthPt, pageHeightPt) {
    this.pageWidthPt = pageWidthPt;
    this.pageHeightPt = pageHeightPt;
    this.content = [];
    this.pages = [{ pageWidthPt, pageHeightPt, content: this.content }];
    this.alphaMap = new Map();
    this.images = [];
  }

  addPage(pageWidthPt, pageHeightPt) {
    this.pageWidthPt = pageWidthPt;
    this.pageHeightPt = pageHeightPt;
    this.content = [];
    this.pages.push({ pageWidthPt, pageHeightPt, content: this.content });
  }

  write(line) {
    this.content.push(`${line}\n`);
  }

  alphaName(fillOpacity, strokeOpacity) {
    const fill = Math.max(0, Math.min(1, fillOpacity));
    const stroke = Math.max(0, Math.min(1, strokeOpacity));
    if (fill >= 0.999 && stroke >= 0.999) return null;
    const key = `${fill.toFixed(3)}:${stroke.toFixed(3)}`;
    if (!this.alphaMap.has(key)) {
      this.alphaMap.set(key, {
        name: `GS${this.alphaMap.size + 1}`,
        fill,
        stroke,
      });
    }
    return this.alphaMap.get(key).name;
  }

  applyStyle(style, { fillAllowed = true, strokeAllowed = true } = {}) {
    if (strokeAllowed && style.stroke && style.strokeWidth > 0) {
      this.write(`${fmt(style.stroke[0])} ${fmt(style.stroke[1])} ${fmt(style.stroke[2])} RG`);
      this.write(`${fmt(style.strokeWidth)} w`);
      this.write(`${lineCapCode(style.lineCap)} J`);
      this.write(`${lineJoinCode(style.lineJoin)} j`);
      if (style.dashArray.length) {
        this.write(`[${style.dashArray.map(fmt).join(' ')}] 0 d`);
      } else {
        this.write('[] 0 d');
      }
    }

    if (fillAllowed && style.fill) {
      this.write(`${fmt(style.fill[0])} ${fmt(style.fill[1])} ${fmt(style.fill[2])} rg`);
    }

    const alphaName = this.alphaName(fillAllowed ? style.fillOpacity : 1, strokeAllowed ? style.strokeOpacity : 1);
    if (alphaName) {
      this.write(`/${alphaName} gs`);
    }
  }

  addImage(jpegBytes, pixelWidth, pixelHeight) {
    const name = `Im${this.images.length + 1}`;
    this.images.push({ name, jpegBytes, pixelWidth, pixelHeight });
    return name;
  }

  finish() {
    const encoder = new TextEncoder();
    const alphaObjects = [...this.alphaMap.values()];
    const pageCount = this.pages.length;
    const firstPageObjectNumber = 3;
    const fontObjectNumber = firstPageObjectNumber + pageCount;
    const firstAlphaObjectNumber = fontObjectNumber + 1;
    const firstImageObjectNumber = firstAlphaObjectNumber + alphaObjects.length;
    const firstContentObjectNumber = firstImageObjectNumber + this.images.length;
    const totalObjects = firstContentObjectNumber + pageCount - 1;
    const objects = [];

    objects[1] = encoder.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    objects[2] = encoder.encode(
      `2 0 obj\n<< /Type /Pages /Kids [${this.pages.map((_, index) => `${firstPageObjectNumber + index} 0 R`).join(' ')}] /Count ${pageCount} >>\nendobj\n`,
    );

    const extGStateEntries = alphaObjects
      .map((entry, index) => `/${entry.name} ${firstAlphaObjectNumber + index} 0 R`)
      .join(' ');

    const xObjectEntries = this.images
      .map((entry, index) => `/${entry.name} ${firstImageObjectNumber + index} 0 R`)
      .join(' ');

    let resources = `/Font << /F1 ${fontObjectNumber} 0 R >>`;
    if (extGStateEntries) resources += ` /ExtGState << ${extGStateEntries} >>`;
    if (xObjectEntries) resources += ` /XObject << ${xObjectEntries} >>`;

    this.pages.forEach((page, index) => {
      const pageObjectNumber = firstPageObjectNumber + index;
      const contentObjectNumber = firstContentObjectNumber + index;
      objects[pageObjectNumber] = encoder.encode(
        `${pageObjectNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(page.pageWidthPt)} ${fmt(page.pageHeightPt)}] /Resources << ${resources} >> /Contents ${contentObjectNumber} 0 R >>\nendobj\n`,
      );
    });
    objects[fontObjectNumber] = encoder.encode(
      `${fontObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
    );

    alphaObjects.forEach((entry, index) => {
      objects[firstAlphaObjectNumber + index] = encoder.encode(
        `${firstAlphaObjectNumber + index} 0 obj\n<< /Type /ExtGState /ca ${fmt(entry.fill)} /CA ${fmt(entry.stroke)} >>\nendobj\n`,
      );
    });

    this.images.forEach((entry, index) => {
      const objNum = firstImageObjectNumber + index;
      const headerBytes = encoder.encode(
        `${objNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${entry.pixelWidth} /Height ${entry.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${entry.jpegBytes.length} >>\nstream\n`,
      );
      const footerBytes = encoder.encode('\nendstream\nendobj\n');
      const combined = new Uint8Array(headerBytes.length + entry.jpegBytes.length + footerBytes.length);
      combined.set(headerBytes, 0);
      combined.set(entry.jpegBytes, headerBytes.length);
      combined.set(footerBytes, headerBytes.length + entry.jpegBytes.length);
      objects[objNum] = combined;
    });

    this.pages.forEach((page, index) => {
      const contentObjectNumber = firstContentObjectNumber + index;
      const contentStream = encoder.encode(page.content.join(''));
      const contentHeader = encoder.encode(
        `${contentObjectNumber} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n`,
      );
      const contentFooter = encoder.encode('endstream\nendobj\n');
      objects[contentObjectNumber] = new Uint8Array(contentHeader.length + contentStream.length + contentFooter.length);
      objects[contentObjectNumber].set(contentHeader, 0);
      objects[contentObjectNumber].set(contentStream, contentHeader.length);
      objects[contentObjectNumber].set(contentFooter, contentHeader.length + contentStream.length);
    });

    const header = encoder.encode('%PDF-1.4\n');
    const binaryComment = new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
    const offsets = [0];
    let offset = header.length + binaryComment.length;

    for (let index = 1; index <= totalObjects; index += 1) {
      offsets[index] = offset;
      offset += objects[index].length;
    }

    const xrefStart = offset;
    let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index <= totalObjects; index += 1) {
      xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    const trailer = `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return new Blob([header, binaryComment, ...objects.slice(1), encoder.encode(xref), encoder.encode(trailer)], {
      type: 'application/pdf',
    });
  }
}

// A circle or ellipse as the closed polyline the exporters draw.
function ellipsePoints(cx, cy, rx, ry) {
  const points = [];
  for (let index = 0; index < ELLIPSE_SEGMENTS; index += 1) {
    const angle = (index / ELLIPSE_SEGMENTS) * Math.PI * 2;
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return points;
}

function roundShapePoints(element) {
  const tagName = element.tagName.toLowerCase();
  const cx = Number(element.getAttribute('cx')) || 0;
  const cy = Number(element.getAttribute('cy')) || 0;
  const rx = Number(element.getAttribute(tagName === 'circle' ? 'r' : 'rx')) || 0;
  const ry = tagName === 'circle' ? rx : Number(element.getAttribute('ry')) || 0;
  if (rx <= 0 || ry <= 0) return [];
  return ellipsePoints(cx, cy, rx, ry);
}

// A basic shape's outline as subpaths of points, or null for anything else.
function shapeSubpaths(element) {
  switch (element.tagName.toLowerCase()) {
    case 'rect': {
      const x = Number(element.getAttribute('x')) || 0;
      const y = Number(element.getAttribute('y')) || 0;
      const width = Number(element.getAttribute('width')) || 0;
      const height = Number(element.getAttribute('height')) || 0;
      return [
        [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
        ],
      ];
    }
    case 'polygon':
    case 'polyline':
      return [parsePoints(element.getAttribute('points') || '')];
    case 'circle':
    case 'ellipse':
      return [roundShapePoints(element)];
    case 'path': {
      const subpaths = [];
      for (const command of parsePathData(element.getAttribute('d') || '')) {
        if (command.type === 'M') subpaths.push([{ x: command.x, y: command.y }]);
        else if (command.type === 'L' && subpaths.length)
          subpaths[subpaths.length - 1].push({ x: command.x, y: command.y });
      }
      return subpaths;
    }
    default:
      return null;
  }
}

/*
 * The clip region a `clip-path="url(#id)"` names, in the element's own user
 * space: `{ subpaths, evenOdd }`. Only the plain case the drawings use is
 * honoured — a userSpaceOnUse clipPath holding one untransformed basic shape;
 * anything else draws unclipped, as every clip did before.
 */
export function resolveClip(element) {
  const match = /url\(\s*["']?#([^"')]+)["']?\s*\)/.exec(element.getAttribute('clip-path') || '');
  if (!match) return null;
  const clipPath = element.ownerDocument?.getElementById(match[1]);
  if (!clipPath || clipPath.tagName.toLowerCase() !== 'clippath') return null;
  if (clipPath.getAttribute('clipPathUnits') === 'objectBoundingBox' || clipPath.getAttribute('transform')) return null;
  const shapes = [...clipPath.children];
  if (shapes.length !== 1 || shapes[0].getAttribute('transform')) return null;
  const subpaths = shapeSubpaths(shapes[0])?.filter((points) => points.length >= 3);
  if (!subpaths?.length) return null;
  const rule = shapes[0].getAttribute('clip-rule') || window.getComputedStyle(shapes[0]).clipRule;
  return { subpaths, evenOdd: rule === 'evenodd' };
}

function beginNode(builder, element) {
  const localMatrix = getLocalMatrix(element);
  const tagName = element.tagName.toLowerCase();
  const needsClip = tagName === 'svg' && element !== getExportSvg();
  const clip = resolveClip(element);
  const shouldWrap = needsClip || Boolean(clip) || !matrixIsIdentity(localMatrix);

  if (!shouldWrap) return false;

  builder.write('q');
  if (!matrixIsIdentity(localMatrix)) {
    builder.write(
      `${fmt(localMatrix.a)} ${fmt(localMatrix.b)} ${fmt(localMatrix.c)} ${fmt(localMatrix.d)} ${fmt(localMatrix.e)} ${fmt(localMatrix.f)} cm`,
    );
  }

  if (needsClip) {
    const width = Number(element.getAttribute('width')) || 0;
    const height = Number(element.getAttribute('height')) || 0;
    builder.write(`0 0 ${fmt(width)} ${fmt(height)} re W n`);
  }

  if (clip) {
    for (const points of clip.subpaths) emitPathFromPoints(builder, points, true);
    builder.write(clip.evenOdd ? 'W* n' : 'W n');
  }

  return true;
}

function endNode(builder, wrapped) {
  if (wrapped) {
    builder.write('Q');
  }
}

function beginCanvasNode(context, element) {
  const localMatrix = getLocalMatrix(element);
  const tagName = element.tagName.toLowerCase();
  const needsClip = tagName === 'svg' && element !== getExportSvg();

  context.save();
  if (!matrixIsIdentity(localMatrix)) {
    context.transform(localMatrix.a, localMatrix.b, localMatrix.c, localMatrix.d, localMatrix.e, localMatrix.f);
  }

  if (needsClip) {
    const width = Number(element.getAttribute('width')) || 0;
    const height = Number(element.getAttribute('height')) || 0;
    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();
  }

  const clip = resolveClip(element);
  if (clip) {
    context.beginPath();
    for (const points of clip.subpaths) {
      context.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
      context.closePath();
    }
    context.clip(clip.evenOdd ? 'evenodd' : 'nonzero');
  }
}

function endCanvasNode(context) {
  context.restore();
}

function applyCanvasStyle(context, style) {
  if (style.fill) {
    context.fillStyle = `rgb(${Math.round(style.fill[0] * 255)}, ${Math.round(style.fill[1] * 255)}, ${Math.round(style.fill[2] * 255)})`;
  }
  if (style.stroke && style.strokeWidth > 0) {
    context.strokeStyle = `rgb(${Math.round(style.stroke[0] * 255)}, ${Math.round(style.stroke[1] * 255)}, ${Math.round(style.stroke[2] * 255)})`;
    context.lineWidth = style.strokeWidth;
    context.lineCap = style.lineCap || 'butt';
    context.lineJoin = style.lineJoin || 'miter';
    context.setLineDash(style.dashArray || []);
  } else {
    context.setLineDash([]);
  }
}

function fillAndStrokeCanvasPath(context, style) {
  const hasFill = Boolean(style.fill);
  const hasStroke = Boolean(style.stroke && style.strokeWidth > 0);

  if (hasFill) {
    context.globalAlpha = style.fillOpacity;
    context.fill();
  }
  if (hasStroke) {
    context.globalAlpha = style.strokeOpacity;
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawRectToCanvas(context, element) {
  const style = computeStyle(element);
  const x = Number(element.getAttribute('x')) || 0;
  const y = Number(element.getAttribute('y')) || 0;
  const width = Number(element.getAttribute('width')) || 0;
  const height = Number(element.getAttribute('height')) || 0;

  context.save();
  applyCanvasStyle(context, style);
  context.beginPath();
  context.rect(x, y, width, height);
  fillAndStrokeCanvasPath(context, style);
  context.restore();
}

function drawLineToCanvas(context, element) {
  const style = computeStyle(element);
  if (!style.stroke || style.strokeWidth <= 0) return;

  context.save();
  applyCanvasStyle(context, style);
  context.globalAlpha = style.strokeOpacity;
  context.beginPath();
  context.moveTo(Number(element.getAttribute('x1')) || 0, Number(element.getAttribute('y1')) || 0);
  context.lineTo(Number(element.getAttribute('x2')) || 0, Number(element.getAttribute('y2')) || 0);
  context.stroke();
  context.restore();
}

function drawPolygonToCanvas(context, element, closePath, points = parsePoints(element.getAttribute('points') || '')) {
  const style = computeStyle(element);
  if (!points.length) return;

  context.save();
  applyCanvasStyle(context, style);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  if (closePath) context.closePath();
  fillAndStrokeCanvasPath(context, style);
  context.restore();
}

function drawPathToCanvas(context, element) {
  const style = computeStyle(element);
  const commands = parsePathData(element.getAttribute('d') || '');
  if (!commands.length) return;

  context.save();
  applyCanvasStyle(context, style);
  context.beginPath();
  for (const command of commands) {
    if (command.type === 'M') context.moveTo(command.x, command.y);
    else if (command.type === 'L') context.lineTo(command.x, command.y);
    else if (command.type === 'Z') context.closePath();
  }
  fillAndStrokeCanvasPath(context, style);
  context.restore();
}

function drawTextToCanvas(context, element) {
  const style = computeStyle(element);
  if (!style.fill) return;

  context.save();
  context.fillStyle = `rgb(${Math.round(style.fill[0] * 255)}, ${Math.round(style.fill[1] * 255)}, ${Math.round(style.fill[2] * 255)})`;
  context.globalAlpha = style.fillOpacity;
  context.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
  context.textAlign = style.textAnchor === 'middle' ? 'center' : style.textAnchor === 'end' ? 'right' : 'left';
  context.textBaseline = style.dominantBaseline === 'middle' ? 'middle' : 'alphabetic';

  const lines = getTextLines(element);
  for (const line of lines) {
    context.fillText(line.text, line.x, line.y);
  }

  context.restore();
}

function drawImageToCanvas(context, element, imageMap) {
  const href = element.getAttribute('href') || element.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
  const entry = href && imageMap.get(href);
  if (!entry) return;
  const x = Number(element.getAttribute('x')) || 0;
  const y = Number(element.getAttribute('y')) || 0;
  const width = Number(element.getAttribute('width')) || entry.width;
  const height = Number(element.getAttribute('height')) || entry.height;
  context.drawImage(entry.img, x, y, width, height);
}

function drawElementToCanvas(context, element, imageMap) {
  const tagName = element.tagName.toLowerCase();
  if (NON_RENDERED_TAGS.has(tagName)) return;
  beginCanvasNode(context, element);

  switch (tagName) {
    case 'svg':
    case 'g':
      [...element.children].forEach((child) => drawElementToCanvas(context, child, imageMap));
      break;
    case 'rect':
      drawRectToCanvas(context, element);
      break;
    case 'line':
      drawLineToCanvas(context, element);
      break;
    case 'polygon':
      drawPolygonToCanvas(context, element, true);
      break;
    case 'polyline':
      drawPolygonToCanvas(context, element, false);
      break;
    case 'circle':
    case 'ellipse':
      drawPolygonToCanvas(context, element, true, roundShapePoints(element));
      break;
    case 'path':
      drawPathToCanvas(context, element);
      break;
    case 'text':
      drawTextToCanvas(context, element);
      break;
    case 'image':
      drawImageToCanvas(context, element, imageMap);
      break;
    default:
      [...element.children].forEach((child) => drawElementToCanvas(context, child, imageMap));
      break;
  }

  endCanvasNode(context);
}

function renderPolygonLike(builder, element, closePath, points = parsePoints(element.getAttribute('points') || '')) {
  if (!points.length) return;
  const style = computeStyle(element);
  builder.write('q');
  builder.applyStyle(style);
  emitPathFromPoints(builder, points, closePath);

  if (style.fill && style.stroke && style.strokeWidth > 0) builder.write('B');
  else if (style.fill) builder.write('f');
  else if (style.stroke && style.strokeWidth > 0) builder.write('S');
  builder.write('Q');
}

function renderRect(builder, element) {
  const x = Number(element.getAttribute('x')) || 0;
  const y = Number(element.getAttribute('y')) || 0;
  const width = Number(element.getAttribute('width')) || 0;
  const height = Number(element.getAttribute('height')) || 0;
  const style = computeStyle(element);

  builder.write('q');
  builder.applyStyle(style);
  builder.write(`${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)} re`);
  if (style.fill && style.stroke && style.strokeWidth > 0) builder.write('B');
  else if (style.fill) builder.write('f');
  else if (style.stroke && style.strokeWidth > 0) builder.write('S');
  builder.write('Q');
}

function renderLine(builder, element) {
  const x1 = Number(element.getAttribute('x1')) || 0;
  const y1 = Number(element.getAttribute('y1')) || 0;
  const x2 = Number(element.getAttribute('x2')) || 0;
  const y2 = Number(element.getAttribute('y2')) || 0;
  const style = computeStyle(element);
  if (!style.stroke || style.strokeWidth <= 0) return;

  builder.write('q');
  builder.applyStyle(style, { fillAllowed: false, strokeAllowed: true });
  builder.write(`${fmt(x1)} ${fmt(y1)} m`);
  builder.write(`${fmt(x2)} ${fmt(y2)} l`);
  builder.write('S');
  builder.write('Q');
}

function renderPath(builder, element) {
  const commands = parsePathData(element.getAttribute('d') || '');
  if (!commands.length) return;
  const style = computeStyle(element);

  builder.write('q');
  builder.applyStyle(style);
  for (const command of commands) {
    if (command.type === 'M') builder.write(`${fmt(command.x)} ${fmt(command.y)} m`);
    else if (command.type === 'L') builder.write(`${fmt(command.x)} ${fmt(command.y)} l`);
    else if (command.type === 'Z') builder.write('h');
  }

  if (style.fill && style.stroke && style.strokeWidth > 0) builder.write('B');
  else if (style.fill) builder.write('f');
  else if (style.stroke && style.strokeWidth > 0) builder.write('S');
  builder.write('Q');
}

function estimateTextWidth(text, fontSize) {
  return text.length * fontSize * 0.56;
}

function renderTextLine(builder, text, x, y, style) {
  if (!text) return;
  let drawX = x;
  const textWidth = estimateTextWidth(text, style.fontSize);
  if (style.textAnchor === 'middle') drawX -= textWidth / 2;
  else if (style.textAnchor === 'end') drawX -= textWidth;

  let baselineY = y;
  if (style.dominantBaseline === 'middle') {
    baselineY += style.fontSize * 0.32;
  }

  builder.write('q');
  builder.applyStyle(style, { fillAllowed: true, strokeAllowed: false });
  builder.write('BT');
  builder.write(`/F1 ${fmt(style.fontSize)} Tf`);
  builder.write(`1 0 0 -1 ${fmt(drawX)} ${fmt(baselineY)} Tm`);
  builder.write(`(${escapePdfText(text)}) Tj`);
  builder.write('ET');
  builder.write('Q');
}

function getTextLines(element) {
  const x = Number(element.getAttribute('x')) || 0;
  const y = Number(element.getAttribute('y')) || 0;
  const tspans = [...element.children].filter((child) => child.tagName?.toLowerCase() === 'tspan');

  if (!tspans.length) {
    return [{ text: element.textContent || '', x, y }];
  }

  let currentY = y;
  return tspans.map((tspan, index) => {
    const text = tspan.textContent || '';
    const lineX = tspan.hasAttribute('x') ? Number(tspan.getAttribute('x')) : x;
    if (tspan.hasAttribute('y')) {
      currentY = Number(tspan.getAttribute('y'));
    } else if (tspan.hasAttribute('dy')) {
      currentY += Number(tspan.getAttribute('dy'));
    } else if (index > 0) {
      currentY = y;
    }
    return { text, x: lineX, y: currentY };
  });
}

function renderText(builder, element) {
  const style = computeStyle(element);
  if (!style.fill) return;
  const lines = getTextLines(element);
  lines.forEach((line) => renderTextLine(builder, line.text, line.x, line.y, style));
}

function renderImage(builder, element, imageMap) {
  const href = element.getAttribute('href') || element.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
  const entry = href && imageMap.get(href);
  if (!entry) return;
  const x = Number(element.getAttribute('x')) || 0;
  const y = Number(element.getAttribute('y')) || 0;
  const width = Number(element.getAttribute('width')) || entry.width;
  const height = Number(element.getAttribute('height')) || entry.height;
  const imgName = builder.addImage(entry.jpegBytes, entry.width, entry.height);
  builder.write('q');
  builder.write(`${fmt(width)} 0 0 ${fmt(-height)} ${fmt(x)} ${fmt(y + height)} cm`);
  builder.write(`/${imgName} Do`);
  builder.write('Q');
}

function walkElement(builder, element, imageMap) {
  const tagName = element.tagName.toLowerCase();
  if (NON_RENDERED_TAGS.has(tagName)) return;
  const wrapped = beginNode(builder, element);

  switch (tagName) {
    case 'svg':
    case 'g':
      [...element.children].forEach((child) => walkElement(builder, child, imageMap));
      break;
    case 'rect':
      renderRect(builder, element);
      break;
    case 'line':
      renderLine(builder, element);
      break;
    case 'polygon':
      renderPolygonLike(builder, element, true);
      break;
    case 'polyline':
      renderPolygonLike(builder, element, false);
      break;
    case 'circle':
    case 'ellipse':
      renderPolygonLike(builder, element, true, roundShapePoints(element));
      break;
    case 'path':
      renderPath(builder, element);
      break;
    case 'text':
      renderText(builder, element);
      break;
    case 'image':
      renderImage(builder, element, imageMap);
      break;
    default:
      [...element.children].forEach((child) => walkElement(builder, child, imageMap));
      break;
  }

  endNode(builder, wrapped);
}

function buildVectorPdfFromSvg(svgElement, paperSize, imageMap = new Map()) {
  const paper = getPaperPreset(paperSize);
  const pageWidthPt = paper.width * MM_TO_PT;
  const pageHeightPt = paper.height * MM_TO_PT;
  const builder = new PdfBuilder(pageWidthPt, pageHeightPt);

  builder.write('q');
  builder.write(`${fmt(MM_TO_PT)} 0 0 ${fmt(-MM_TO_PT)} 0 ${fmt(pageHeightPt)} cm`);
  [...svgElement.children].forEach((child) => walkElement(builder, child, imageMap));
  builder.write('Q');

  return builder.finish();
}

export async function buildMultiSheetVectorPdf(entries = []) {
  if (!entries.length) throw new Error('At least one sheet SVG is required for multi-sheet PDF export.');
  let builder = null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry?.svgElement) throw new Error(`Sheet ${index + 1} has no SVG export source.`);
    const paper = getPaperPreset(entry.paperSize || 'A3_LANDSCAPE');
    const pageWidthPt = paper.width * MM_TO_PT;
    const pageHeightPt = paper.height * MM_TO_PT;
    if (!builder) builder = new PdfBuilder(pageWidthPt, pageHeightPt);
    else builder.addPage(pageWidthPt, pageHeightPt);
    const imageMap = await preloadSvgImages(entry.svgElement);
    builder.write('q');
    builder.write(`${fmt(MM_TO_PT)} 0 0 ${fmt(-MM_TO_PT)} 0 ${fmt(pageHeightPt)} cm`);
    [...entry.svgElement.children].forEach((child) => walkElement(builder, child, imageMap));
    builder.write('Q');
  }
  return builder.finish();
}

export async function exportActiveSheetAsPng(sheetTitle = 'sheet', options = {}) {
  const svgElement = getExportSvg();
  if (!svgElement) throw new Error('No sheet export source is available.');
  const { dpi = DEFAULT_PNG_DPI } = options;
  const imageMap = await preloadSvgImages(svgElement);
  const { canvas } = await renderSvgToCanvas(svgElement, dpi, imageMap);

  await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to render PNG export.'));
        return;
      }
      downloadBlob(blob, `${sanitizeFileName(sheetTitle)}.png`);
      resolve();
    }, 'image/png');
  });
}

export async function exportActiveSheetAsPdf(sheetTitle = 'sheet', paperSize = 'A3_LANDSCAPE') {
  const svgElement = getExportSvg();
  if (!svgElement) throw new Error('No sheet export source is available.');
  const imageMap = await preloadSvgImages(svgElement);
  const pdfBlob = buildVectorPdfFromSvg(svgElement, paperSize, imageMap);
  downloadBlob(pdfBlob, `${sanitizeFileName(sheetTitle)}.pdf`);
}
