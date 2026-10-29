import { svgPathProperties } from 'svg-path-properties';

// Paper-space geometry follows the same SVG transforms as vector PDF.
// Cutting profiles remain model-space millimetres in exports.js.
export function sheetDxf(svgText) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
  host.innerHTML = svgText;
  document.body.appendChild(host);
  try {
    const root = host.querySelector('svg'),
      inverse = root.getCTM().inverse();
    const lines = [
      '0',
      'SECTION',
      '2',
      'HEADER',
      '9',
      '$ACADVER',
      '1',
      'AC1021',
      '9',
      '$INSUNITS',
      '70',
      '4',
      '9',
      '$MEASUREMENT',
      '70',
      '1',
      '0',
      'ENDSEC',
      '0',
      'SECTION',
      '2',
      'ENTITIES',
    ];
    const map = (point, matrix) => new DOMPoint(point.x, point.y).matrixTransform(matrix);
    const clipLine = (a, b, box) => {
      if (!box) return [a, b];
      const dx = b.x - a.x,
        dy = b.y - a.y,
        ps = [-dx, dx, -dy, dy],
        qs = [a.x - box[0], box[2] - a.x, a.y - box[1], box[3] - a.y];
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 4; i++) {
        if (Math.abs(ps[i]) < 1e-12) {
          if (qs[i] < 0) return null;
          continue;
        }
        const t = qs[i] / ps[i];
        if (ps[i] < 0) lo = Math.max(lo, t);
        else hi = Math.min(hi, t);
        if (lo > hi) return null;
      }
      return [
        { x: a.x + lo * dx, y: a.y + lo * dy },
        { x: a.x + hi * dx, y: a.y + hi * dy },
      ];
    };
    const segment = (a, b, layer, clip) => {
      const pair = clipLine(a, b, clip);
      if (!pair) return;
      lines.push(
        '0',
        'LINE',
        '8',
        layer,
        '10',
        String(pair[0].x),
        '20',
        String(-pair[0].y),
        '11',
        String(pair[1].x),
        '21',
        String(-pair[1].y),
      );
    };
    for (const element of root.querySelectorAll('path,rect,text')) {
      if (element.closest('defs')) continue;
      const matrix = inverse.multiply(element.getCTM());
      if (element.tagName === 'text') {
        const position = map(
          { x: Number(element.getAttribute('x') || 0), y: Number(element.getAttribute('y') || 0) },
          matrix,
        );
        const height = parseFloat(getComputedStyle(element).fontSize) * Math.hypot(matrix.a, matrix.b);
        const text = element.textContent.replace(/[\r\n]/g, ' ');
        const anchor = element.getAttribute('text-anchor');
        lines.push(
          '0',
          'TEXT',
          '8',
          'ANNOTATIONS',
          '10',
          String(position.x),
          '20',
          String(-position.y),
          '40',
          String(height),
          '1',
          text,
          '50',
          String((-Math.atan2(matrix.b, matrix.a) * 180) / Math.PI),
          '72',
          anchor === 'middle' ? '1' : anchor === 'end' ? '2' : '0',
          '11',
          String(position.x),
          '21',
          String(-position.y),
        );
        continue;
      }
      if (element.tagName === 'rect') {
        if (!element.getAttribute('stroke')) continue;
        const x = Number(element.getAttribute('x') || 0),
          y = Number(element.getAttribute('y') || 0),
          w = Number(element.getAttribute('width')),
          h = Number(element.getAttribute('height'));
        const points = [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
          [x, y],
        ].map(([x, y]) => map({ x, y }, matrix));
        for (let i = 1; i < points.length; i++) segment(points[i - 1], points[i], 'BORDER');
        continue;
      }
      if (element.getAttribute('stroke') === 'none') continue;
      const layer = element.getAttribute('stroke-dasharray') ? 'HIDDEN' : 'DRAWING';
      let clip;
      const clippedGroup = element.closest('[clip-path]');
      if (clippedGroup) {
        const id = clippedGroup.getAttribute('clip-path').match(/#([^)]+)/)?.[1];
        const rect = id && root.querySelector('[id="' + id + '"] rect');
        if (rect) {
          const cm = inverse.multiply(clippedGroup.getCTM()),
            x = Number(rect.getAttribute('x')),
            y = Number(rect.getAttribute('y'));
          const a = map({ x, y }, cm),
            b = map({ x: x + Number(rect.getAttribute('width')), y: y + Number(rect.getAttribute('height')) }, cm);
          clip = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
        }
      }
      for (const subpath of (element.getAttribute('d') || '').match(/[Mm][^Mm]*/g) || []) {
        const curve = new svgPathProperties(subpath),
          length = curve.getTotalLength();
        const sample = (distance) => map(curve.getPointAtLength(distance), matrix);
        const subdivide = (start, end, depth = 0) => {
          const a = sample(start),
            b = sample(end);
          let error = 0;
          for (const fraction of [0.25, 0.5, 0.75]) {
            const p = sample(start + (end - start) * fraction);
            error = Math.max(error, Math.hypot(p.x - a.x - (b.x - a.x) * fraction, p.y - a.y - (b.y - a.y) * fraction));
          }
          if (depth < 22 && (error > 0.02 || Math.hypot(b.x - a.x, b.y - a.y) > 10)) {
            subdivide(start, (start + end) / 2, depth + 1);
            subdivide((start + end) / 2, end, depth + 1);
          } else segment(a, b, layer, clip);
        };
        if (length) subdivide(0, length);
      }
    }
    lines.push('0', 'ENDSEC', '0', 'EOF');
    return lines.join('\n');
  } finally {
    host.remove();
  }
}
