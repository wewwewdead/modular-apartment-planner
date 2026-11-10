// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildArcPoints,
  buildMultiSheetVectorPdf,
  escapePdfText,
  parseColor,
  parsePathData,
  styleFromComputed,
} from './sheetExport';

const close = (a, b, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
};

describe('parseColor', () => {
  it('reads rgb, rgba, hex and transparent with their alpha', () => {
    expect(parseColor('rgb(255, 0, 51)')).toEqual([1, 0, 0.2, 1]);
    expect(parseColor('rgba(0, 0, 0, 0)')).toEqual([0, 0, 0, 0]);
    expect(parseColor('rgba(255, 255, 255, 0.5)')).toEqual([1, 1, 1, 0.5]);
    expect(parseColor('rgb(0 0 0 / 25%)')).toEqual([0, 0, 0, 0.25]);
    expect(parseColor('#ff0000')).toEqual([1, 0, 0, 1]);
    expect(parseColor('#f00')).toEqual([1, 0, 0, 1]);
    expect(parseColor('#ff000080')[3]).toBeCloseTo(128 / 255, 6);
    expect(parseColor('transparent')).toEqual([0, 0, 0, 0]);
    expect(parseColor('none')).toBeNull();
    expect(parseColor('url("#hatch")')).toBeNull();
  });
});

describe('styleFromComputed', () => {
  const computed = (overrides) => ({
    fill: 'rgb(0, 0, 0)',
    stroke: 'none',
    strokeWidth: '1',
    opacity: '1',
    fillOpacity: '1',
    strokeOpacity: '1',
    ...overrides,
  });

  it('treats a transparent fill as no paint, not black', () => {
    const style = styleFromComputed(computed({ fill: 'rgba(0, 0, 0, 0)', stroke: 'rgb(10, 20, 30)' }));
    expect(style.fill).toBeNull();
    expect(style.fillOpacity).toBe(0);
    expect(style.stroke).toHaveLength(3);
    expect(style.strokeOpacity).toBe(1);
  });

  it('folds a colour alpha into its opacity', () => {
    const style = styleFromComputed(computed({ fill: 'rgba(255, 0, 0, 0.5)', fillOpacity: '0.5' }));
    expect(style.fill).toEqual([1, 0, 0]);
    expect(style.fillOpacity).toBeCloseTo(0.25, 6);
  });

  it('keeps an opacity of 0 at 0 and an unreadable one opaque', () => {
    expect(styleFromComputed(computed({ opacity: '0' })).fillOpacity).toBe(0);
    expect(styleFromComputed(computed({ fillOpacity: '0' })).fillOpacity).toBe(0);
    expect(styleFromComputed(computed({ opacity: '' })).fillOpacity).toBe(1);
  });
});

describe('buildArcPoints', () => {
  it('draws a half circle through the far side, ending exactly at the end point', () => {
    const points = buildArcPoints({ x: -10, y: 0 }, 10, 10, 0, 0, 1, { x: 10, y: 0 });
    close(points.at(-1), { x: 10, y: 0 });
    for (const point of points) expect(Math.hypot(point.x, point.y)).toBeCloseTo(10, 6);
    // Sweep 1 runs through positive angles — clockwise on a y-down page — so
    // from the left end it goes over the top (y < 0), as a browser draws it.
    expect(points[Math.floor(points.length / 2) - 1].y).toBeCloseTo(-10, 6);
    expect(buildArcPoints({ x: -10, y: 0 }, 10, 10, 0, 0, 0, { x: 10, y: 0 })[4].y).toBeCloseTo(10, 6);
  });

  it('scales up radii too small to span the chord', () => {
    const points = buildArcPoints({ x: 0, y: 0 }, 1, 1, 0, 0, 1, { x: 20, y: 0 });
    expect(points.length).toBeGreaterThan(2);
    for (const point of points) expect(Math.hypot(point.x - 10, point.y)).toBeCloseTo(10, 6);
  });

  it('follows an ellipse, and a rotated one', () => {
    const flat = buildArcPoints({ x: 20, y: 0 }, 20, 10, 0, 0, 1, { x: 0, y: 10 });
    for (const point of flat) expect((point.x / 20) ** 2 + (point.y / 10) ** 2).toBeCloseTo(1, 6);

    // The same quarter turned 90°: the long axis now runs along y.
    const turned = buildArcPoints({ x: 0, y: 20 }, 20, 10, 90, 0, 1, { x: -10, y: 0 });
    for (const point of turned) expect((point.y / 20) ** 2 + (point.x / 10) ** 2).toBeCloseTo(1, 6);
  });

  it('draws a straight line for a zero radius', () => {
    expect(buildArcPoints({ x: 0, y: 0 }, 0, 5, 0, 0, 1, { x: 4, y: 0 })).toEqual([{ x: 4, y: 0 }]);
  });
});

describe('parsePathData', () => {
  it('flattens cubic curves and their smooth continuation', () => {
    const commands = parsePathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
    expect(commands[0]).toEqual({ type: 'M', x: 0, y: 0 });
    const lines = commands.filter((command) => command.type === 'L');
    expect(lines.length).toBeGreaterThan(10);
    close(lines.at(-1), { x: 20, y: 0 });
    // The first curve peaks at y = 7.5 (t = 0.5); the reflected second at y = -7.5.
    const firstHalf = lines.filter((point) => point.x <= 10);
    expect(Math.max(...firstHalf.map((point) => point.y))).toBeCloseTo(7.5, 6);
    expect(Math.min(...lines.map((point) => point.y))).toBeCloseTo(-7.5, 6);
  });

  it('flattens quadratic curves, relative and smooth', () => {
    const lines = parsePathData('M0 0 q5 10 10 0 t10 0').filter((command) => command.type === 'L');
    close(lines.at(-1), { x: 20, y: 0 });
    expect(Math.max(...lines.map((point) => point.y))).toBeCloseTo(5, 6);
    expect(Math.min(...lines.map((point) => point.y))).toBeCloseTo(-5, 6);
  });

  it('keeps lines and closes as before', () => {
    expect(parsePathData('M0 0 L10 0 v10 h-10 Z')).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'L', x: 0, y: 10 },
      { type: 'Z' },
    ]);
  });
});

describe('escapePdfText', () => {
  it('writes WinAnsi characters as octal escapes', () => {
    expect(escapePdfText('m²')).toBe('m\\262');
    expect(escapePdfText('90°')).toBe('90\\260');
    expect(escapePdfText('±5 – é')).toBe('\\2615 \\226 \\351');
  });

  it('escapes the string delimiters and only gives up on what WinAnsi lacks', () => {
    expect(escapePdfText('a(b)\\c')).toBe('a\\(b\\)\\\\c');
    expect(escapePdfText('平')).toBe('?');
  });
});

describe('sheet PDF drawing', () => {
  const SVG = 'http://www.w3.org/2000/svg';
  const make = (tag, attributes = {}, style = '') => {
    const element = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    if (style) element.setAttribute('style', style);
    return element;
  };

  // jsdom has no DOMMatrix; untransformed elements only ever need the identity.
  class IdentityMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
  }

  async function pdfText(children) {
    globalThis.DOMMatrix ??= IdentityMatrix;
    const svg = make('svg', { width: '420', height: '297' });
    for (const child of children) svg.appendChild(child);
    document.body.appendChild(svg);
    try {
      const blob = await buildMultiSheetVectorPdf([{ svgElement: svg, paperSize: 'A3_LANDSCAPE' }]);
      const buffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });
      const bytes = new Uint8Array(buffer);
      return new TextDecoder('latin1').decode(bytes);
    } finally {
      svg.remove();
    }
  }

  it('draws circles, skips defs, and clips to a clip path', async () => {
    const defs = make('defs');
    const clipPath = make('clipPath', { id: 'clip-1', clipPathUnits: 'userSpaceOnUse' });
    clipPath.appendChild(make('rect', { x: '1', y: '2', width: '30', height: '40' }));
    defs.appendChild(clipPath);
    // A symbol stand-in inside defs: drawn only where used, never in place.
    defs.appendChild(make('rect', { x: '0', y: '0', width: '99', height: '99' }, 'fill: rgb(255, 0, 0)'));
    const clipped = make('g', { 'clip-path': 'url(#clip-1)' });
    clipped.appendChild(make('circle', { cx: '10', cy: '10', r: '5' }, 'fill: rgb(0, 0, 255)'));
    const text = await pdfText([defs, clipped]);

    expect(text).not.toContain('99 99 re');
    expect(text).toMatch(/1 2 m\n31 2 l\n31 42 l\n1 42 l\nh\nW n/);
    expect(text).toContain('0 0 1 rg');
    expect(text).toMatch(/15 10 m\n/);
    expect(text).toContain('/Encoding /WinAnsiEncoding');
  });
});
