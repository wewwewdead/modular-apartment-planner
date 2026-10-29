const xml = (value) =>
  String(value ?? '').replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c],
  );

// Manual drawing dimensions. Coordinates are view-model millimetres: the
// projected coordinates the view's paths use (x right, y down, 1:1), so a
// dimension survives regeneration and sheet/view scale changes.
//   { id, type: 'linear', view, from: [x, y], to: [x, y], orientation, offset }
//     orientation 'horizontal' | 'vertical' | 'aligned'; offset = signed
//     distance (model mm) from `from` to the dimension line, measured along
//     +y (horizontal), +x (vertical) or the left normal of from→to (aligned).
//   { id, type: 'radial', view, mode: 'diameter' | 'radius', center, radius, at }
export const MANUAL_DIMENSION_TYPES = ['linear', 'radial'];
export const isManualDimension = (annotation) => MANUAL_DIMENSION_TYPES.includes(annotation?.type);
// Annotations drawn on the sheet itself rather than listed as notes.
export const isDrawnAnnotation = (annotation) =>
  isManualDimension(annotation) || ['hole-chain', 'hole-callout'].includes(annotation?.type);

const round = (value) => Math.round(value * 1e6) / 1e6;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);

// --- snap candidates from SVG path data -------------------------------------

// SVG F.6.5: centre of an endpoint-parameterised arc.
export function arcCenter([x1, y1], rx, ry, phiDegrees, largeArc, sweep, [x2, y2]) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry) return null;
  const phi = (phiDegrees * Math.PI) / 180,
    cos = Math.cos(phi),
    sin = Math.sin(phi);
  const dx = (x1 - x2) / 2,
    dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy,
    y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let factor = denominator ? Math.sqrt(Math.max(0, numerator / denominator)) : 0;
  if (Boolean(largeArc) === Boolean(sweep)) factor = -factor;
  const cxp = (factor * rx * y1p) / ry,
    cyp = (-factor * ry * x1p) / rx;
  return {
    center: [cos * cxp - sin * cyp + (x1 + x2) / 2, sin * cxp + cos * cyp + (y1 + y2) / 2],
    radius: (rx + ry) / 2,
    circular: Math.abs(rx - ry) < 1e-6 * Math.max(rx, ry),
  };
}

const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
// Vertices, straight-segment midpoints and arc centres of one path.
export function pathFeatures(d) {
  const tokens = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const vertices = [],
    midpoints = [],
    arcs = [];
  let index = 0,
    command = null,
    current = [0, 0],
    start = [0, 0];
  const take = (n) => tokens.slice(index, (index += n)).map(Number);
  while (index < tokens.length) {
    if (/[a-z]/i.test(tokens[index])) command = tokens[index++];
    if (!command) break;
    const upper = command.toUpperCase(),
      relative = command !== upper;
    if (upper === 'Z') {
      if (len(sub(current, start)) > 1e-9) midpoints.push([(current[0] + start[0]) / 2, (current[1] + start[1]) / 2]);
      current = start;
      command = null;
      continue;
    }
    const args = take(ARITY[upper]);
    if (args.length < ARITY[upper] || args.some((n) => !Number.isFinite(n))) break;
    const at = (x, y) => (relative ? [current[0] + x, current[1] + y] : [x, y]);
    let end;
    if (upper === 'H') end = [relative ? current[0] + args[0] : args[0], current[1]];
    else if (upper === 'V') end = [current[0], relative ? current[1] + args[0] : args[0]];
    else end = at(args.at(-2), args.at(-1));
    if (upper === 'M') {
      start = end;
      // Further pairs after M are implicit line-tos.
      command = relative ? 'l' : 'L';
    } else if (['L', 'H', 'V'].includes(upper)) midpoints.push([(current[0] + end[0]) / 2, (current[1] + end[1]) / 2]);
    else if (upper === 'A') {
      const arc = arcCenter(current, args[0], args[1], args[2], args[3], args[4], end);
      if (arc?.circular) arcs.push({ center: arc.center, radius: arc.radius });
    }
    vertices.push(end);
    current = end;
  }
  return { vertices, midpoints, arcs };
}

// Snap candidates for one generated view: projected vertices, edge midpoints
// and circle/arc centres (hole centres included), with circles for radial
// dimensions. Hidden edges contribute centres only.
export function viewSnapData(view) {
  const points = [],
    circles = [],
    seen = new Set();
  const add = (point, kind) => {
    const key = `${point[0].toFixed(4)},${point[1].toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push({ point: [round(point[0]), round(point[1])], kind });
  };
  const circleKeys = new Set();
  const addArcs = (arcs) =>
    arcs.forEach((arc) => {
      add(arc.center, 'centre');
      const key = `${arc.center.map((v) => v.toFixed(4)).join(',')},${arc.radius.toFixed(4)}`;
      if (!circleKeys.has(key)) {
        circleKeys.add(key);
        circles.push({ center: arc.center.map(round), radius: round(arc.radius) });
      }
    });
  for (const d of view.visible || []) {
    const { vertices, midpoints, arcs } = pathFeatures(d);
    vertices.forEach((p) => add(p, 'vertex'));
    addArcs(arcs);
    midpoints.forEach((p) => add(p, 'midpoint'));
  }
  for (const d of view.hidden || []) addArcs(pathFeatures(d).arcs);
  return { points, circles };
}

export function snapViewPoint(raw, data, tolerance) {
  let best = null;
  for (const candidate of data.points) {
    const d = len(sub(candidate.point, raw));
    // Prefer vertices over midpoints/centres at the same distance.
    const rank = d + (candidate.kind === 'vertex' ? 0 : tolerance * 0.05);
    if (d <= tolerance && (!best || rank < best.rank)) best = { ...candidate, rank };
  }
  return best ? { point: best.point, kind: best.kind } : { point: raw.map(round), kind: 'free' };
}

export function nearestCircle(raw, data, tolerance) {
  let best = null;
  for (const circle of data.circles) {
    const d = Math.abs(len(sub(raw, circle.center)) - circle.radius);
    if (d <= tolerance && (!best || d < best.d)) best = { ...circle, d };
  }
  return best && { center: best.center, radius: best.radius };
}

// --- linear dimensions --------------------------------------------------------

// Fusion-style: placing the line beside the measured span (within its x range)
// gives a horizontal dimension, within its y range a vertical one, and
// anywhere else an aligned one.
export function chooseOrientation(from, to, at) {
  const within = (axis) => {
    const lo = Math.min(from[axis], to[axis]),
      hi = Math.max(from[axis], to[axis]);
    return hi - lo > 1e-6 && at[axis] > lo && at[axis] < hi;
  };
  if (within(0)) return 'horizontal';
  if (within(1)) return 'vertical';
  if (Math.abs(from[1] - to[1]) < 1e-6) return 'horizontal';
  if (Math.abs(from[0] - to[0]) < 1e-6) return 'vertical';
  return 'aligned';
}
const leftNormal = (from, to) => {
  const d = sub(to, from),
    l = len(d);
  return l ? [-d[1] / l, d[0] / l] : [0, -1];
};
export function linearOffset(from, to, orientation, at) {
  if (orientation === 'horizontal') return round(at[1] - from[1]);
  if (orientation === 'vertical') return round(at[0] - from[0]);
  const n = leftNormal(from, to);
  return round((at[0] - from[0]) * n[0] + (at[1] - from[1]) * n[1]);
}
export function linearValue({ from, to, orientation }) {
  if (orientation === 'horizontal') return Math.abs(to[0] - from[0]);
  if (orientation === 'vertical') return Math.abs(to[1] - from[1]);
  return len(sub(to, from));
}
// Ends of the dimension line, in view-model mm.
export function linearLine({ from, to, orientation, offset = 0 }) {
  if (orientation === 'horizontal')
    return [
      [from[0], from[1] + offset],
      [to[0], from[1] + offset],
    ];
  if (orientation === 'vertical')
    return [
      [from[0] + offset, from[1]],
      [from[0] + offset, to[1]],
    ];
  const n = leftNormal(from, to);
  return [
    [from[0] + n[0] * offset, from[1] + n[1] * offset],
    [to[0] + n[0] * offset, to[1] + n[1] * offset],
  ];
}

export function createLinearDimension({ id, view, from, to, at, orientation }) {
  if (len(sub(to, from)) < 1e-6) throw new Error('Pick two different points to dimension.');
  const chosen = orientation || chooseOrientation(from, to, at);
  const annotation = {
    id,
    type: 'linear',
    view,
    from: from.map(round),
    to: to.map(round),
    orientation: chosen,
    offset: linearOffset(from, to, chosen, at),
  };
  if (linearValue(annotation) < 1e-6)
    throw new Error('Those points have no extent in that direction. Place the line elsewhere.');
  return annotation;
}

export function createRadialDimension({ id, view, circle, at, mode = 'diameter' }) {
  return { id, type: 'radial', view, mode, center: circle.center, radius: circle.radius, at: at.map(round) };
}

export const formatLength = (value, units, decimals = 2) =>
  `${(units === 'inch' ? value / 25.4 : value).toFixed(units === 'inch' ? 3 : decimals)}${units === 'inch' ? ' in' : ''}`;

// --- paper rendering ------------------------------------------------------------

// The two existing dimension looks: 'engineering' (filled-line arrows, dark)
// and 'overview' (end bars, grey), matching each sheet layout's automatic dims.
const STYLES = {
  engineering: { stroke: '#20252b', width: 0.18, arrows: true },
  overview: { stroke: '#52606e', width: 0.18, arrows: false },
};
const pathEl = (d, style) => `<path d="${d}" fill="none" stroke="${style.stroke}" stroke-width="${style.width}"/>`;
const segment = (a, b, style) => pathEl(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, style);
function arrowHead(tip, direction, style) {
  const [x, y] = tip,
    [dx, dy] = direction;
  return pathEl(
    `M${x + dx * 2.2 - dy * 0.65} ${y + dy * 2.2 + dx * 0.65}L${x} ${y}L${x + dx * 2.2 + dy * 0.65} ${y + dy * 2.2 - dx * 0.65}`,
    style,
  );
}
// Text along a paper direction, kept readable (never upside down).
function label(position, direction, value, attrs = '') {
  let angle = (Math.atan2(direction[1], direction[0]) * 180) / Math.PI;
  if (angle > 90.001) angle -= 180;
  if (angle <= -90.001) angle += 180;
  const rotate =
    Math.abs(angle) > 1e-6 ? ` transform="rotate(${+angle.toFixed(4)} ${position[0]} ${position[1]})"` : '';
  return `<text x="${position[0]}" y="${position[1]}" text-anchor="middle"${rotate}${attrs}>${xml(value)}</text>`;
}

// `point` maps view-model mm to paper mm.
export function linearDimensionSvg(annotation, point, { units, style = 'engineering', format } = {}) {
  const look = STYLES[style] || STYLES.engineering;
  const [lineA, lineB] = linearLine(annotation).map(point);
  const A = point(annotation.from),
    B = point(annotation.to);
  const along = sub(lineB, lineA),
    length = len(along);
  if (length < 1e-9) return '';
  const u = [along[0] / length, along[1] / length];
  let body = '';
  for (const [object, end] of [
    [A, lineA],
    [B, lineB],
  ]) {
    const e = sub(end, object),
      el = len(e);
    if (el < 1e-9) continue;
    const dir = [e[0] / el, e[1] / el];
    const gap = Math.min(1, el / 2);
    body += segment(
      [object[0] + dir[0] * gap, object[1] + dir[1] * gap],
      [end[0] + dir[0] * 1.5, end[1] + dir[1] * 1.5],
      look,
    );
  }
  body += segment(lineA, lineB, look);
  if (look.arrows) body += arrowHead(lineA, u, look) + arrowHead(lineB, [-u[0], -u[1]], look);
  else {
    const n = [-u[1] * 2, u[0] * 2];
    for (const end of [lineA, lineB])
      body += segment([end[0] - n[0], end[1] - n[1]], [end[0] + n[0], end[1] + n[1]], look);
  }
  // Text sits on the side of the line facing up the page (or left).
  let normal = [u[1], -u[0]];
  if (normal[1] > 1e-9 || (Math.abs(normal[1]) <= 1e-9 && normal[0] > 0)) normal = [-normal[0], -normal[1]];
  const mid = [(lineA[0] + lineB[0]) / 2 + normal[0] * 1.6, (lineA[1] + lineB[1]) / 2 + normal[1] * 1.6];
  const text = (format || ((v) => formatLength(v, units)))(linearValue(annotation));
  return `<g data-dimension="${xml(annotation.id)}" data-value="${round(linearValue(annotation))}">${body}${label(mid, u, text)}</g>`;
}

export function radialDimensionSvg(annotation, point, scale, { units, style = 'engineering', format } = {}) {
  const look = STYLES[style] || STYLES.engineering;
  const center = point(annotation.center),
    at = point(annotation.at);
  const r = annotation.radius * scale;
  const toward = sub(at, center),
    distance = len(toward);
  const u = distance > 1e-9 ? [toward[0] / distance, toward[1] / distance] : [0.707, -0.707];
  const edge = [center[0] + u[0] * r, center[1] + u[1] * r];
  const end = distance > r + 2 ? at : [center[0] + u[0] * (r + 8), center[1] + u[1] * (r + 8)];
  const side = u[0] >= 0 ? 1 : -1;
  const landing = [end[0] + side * 6, end[1]];
  const value = annotation.mode === 'radius' ? annotation.radius : annotation.radius * 2;
  const text = `${annotation.mode === 'radius' ? 'R' : 'Ø'}${(format || ((v) => formatLength(v, units)))(value)}`;
  const leader = sub(edge, end),
    ll = len(leader);
  return (
    `<g data-dimension="${xml(annotation.id)}" data-value="${round(value)}">` +
    segment(end, edge, look) +
    segment(end, landing, look) +
    (ll > 1e-9 ? arrowHead(edge, [-leader[0] / ll, -leader[1] / ll], look) : '') +
    `<text x="${(end[0] + landing[0]) / 2}" y="${end[1] - 1.4}" text-anchor="middle">${xml(text)}</text></g>`
  );
}

// All manual dimensions of one view, for a sheet renderer.
export function manualDimensionsSvg(sheet, viewKind, point, scale, options) {
  return (sheet.annotations || [])
    .filter((a) => isManualDimension(a) && a.view === viewKind)
    .map((a) =>
      a.type === 'linear' ? linearDimensionSvg(a, point, options) : radialDimensionSvg(a, point, scale, options),
    )
    .join('');
}

export function describeManualDimension(annotation, units) {
  if (annotation.type === 'linear')
    return `${annotation.orientation} ${formatLength(linearValue(annotation), units)} · ${annotation.view}`;
  const value = annotation.mode === 'radius' ? annotation.radius : annotation.radius * 2;
  return `${annotation.mode === 'radius' ? 'R' : 'Ø'}${formatLength(value, units)} · ${annotation.view}`;
}
