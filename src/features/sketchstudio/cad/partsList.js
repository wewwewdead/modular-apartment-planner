import { buildCutList } from './fabrication.js';

const xml = (value) =>
  String(value ?? '').replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c],
  );
const fmt = (value, units) => String(+(units === 'inch' ? value / 25.4 : value).toFixed(units === 'inch' ? 3 : 1));

// An assembly sheet carries a parts list unless it shows a single part or a
// section, or the user turned it off.
export const sheetHasPartsList = (sheet) => !sheet.partId && !sheet.section && sheet.partsList !== false;

// Parts list rows from the workshop cut list (same quantities and part
// bounds), limited to the sheet's instances, numbered in model order.
// Size is the part's overall bounding box, largest first (L × W × T).
export function partsListRows(model, snapshot, sheet = {}) {
  const instances = model.instances.filter((i) => !sheet.instanceIds?.length || sheet.instanceIds.includes(i.id));
  if (!instances.length || !snapshot?.parts || !snapshot?.instances) return [];
  return buildCutList({ ...model, instances }, snapshot).map((row, index) => ({
    item: index + 1,
    partId: row.partId,
    instanceId: instances.find((i) => i.partId === row.partId).id,
    name: row.name,
    quantity: row.quantity,
    material: row.material,
    size: [...row.dimensions].sort((a, b) => b - a),
  }));
}
export const sizeText = (size, units) => size.map((v) => fmt(v, units)).join(' × ');

const COLUMNS = [
  ['ITEM', 9],
  ['PART', 42],
  ['QTY', 9],
  ['MATERIAL', 34],
  ['SIZE L × W × T', 46],
];
export const PARTS_LIST_WIDTH = COLUMNS.reduce((sum, [, w]) => sum + w, 0);
export const PARTS_ROW = 4.5;
export const partsListHeight = (rows) => (rows.length + 1) * PARTS_ROW;

const fit = (value, width) => {
  const max = Math.floor(width / 1.45);
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

// Table with its top-left corner at (x, y), paper millimetres.
export function partsListSvg(rows, x, y, units, stroke = '#20252b') {
  const width = PARTS_LIST_WIDTH,
    height = partsListHeight(rows);
  const line = (x1, y1, x2, y2) =>
    `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="0.18"/>`;
  let body = line(x, y, x + width, y) + line(x, y + height, x + width, y + height);
  let cx = x;
  for (const [, w] of COLUMNS) {
    body += line(cx, y, cx, y + height);
    cx += w;
  }
  body += line(cx, y, cx, y + height);
  const cells = (values, rowY, attrs = '') => {
    let left = x;
    return COLUMNS.map(([, w], i) => {
      const cell = `<text x="${left + 1.2}" y="${rowY + PARTS_ROW - 1.3}" font-size="2.5"${attrs}>${xml(fit(values[i], w))}</text>`;
      left += w;
      return cell;
    }).join('');
  };
  body += `<g data-parts-header="true">${cells(
    COLUMNS.map(([name]) => name),
    y,
    ' font-weight="bold"',
  )}</g>`;
  rows.forEach((row, index) => {
    const rowY = y + (index + 1) * PARTS_ROW;
    body += line(x, rowY, x + width, rowY);
    body += `<g data-part-row="${xml(row.name)}" data-quantity="${row.quantity}">${cells(
      [row.item, row.name, row.quantity, row.material, sizeText(row.size, units)],
      rowY,
    )}</g>`;
  });
  return `<g data-parts-list="true">${body}</g>`;
}

// Circles as arc paths, so the DXF export (paths, rects, text) keeps them.
const circlePath = ([x, y], r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const project = (point, basis) => basis.map((axis) => axis.reduce((sum, v, i) => sum + v * point[i], 0));

// Numbered balloons on a view (normally the isometric one): a leader from the
// projected centre of one instance of each part to a balloon outside the
// view's outline, nudged round so balloons never overlap.
export function balloonsSvg(rows, view, snapshot, point, cell, stroke = '#20252b') {
  if (!view.basis || !rows.length) return '';
  const [vx, vy, vw, vh] = view.viewBox;
  const a = point([vx, vy]),
    b = point([vx + vw, vy + vh]);
  const centre = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const reach = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + 6;
  const placed = [];
  let body = '';
  for (const row of rows) {
    const bounds = snapshot.instances.find((i) => i.id === row.instanceId)?.bounds;
    if (!bounds) continue;
    const anchor = point(
      project(
        bounds[0].map((v, i) => (v + bounds[1][i]) / 2),
        view.basis,
      ),
    );
    let angle = Math.atan2(anchor[1] - centre[1], anchor[0] - centre[0]);
    if (Math.hypot(anchor[0] - centre[0], anchor[1] - centre[1]) < 1e-6) angle = -Math.PI / 4;
    let balloon;
    for (let attempt = 0; attempt < 24; attempt++) {
      const turn = angle + (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * 0.35;
      const candidate = [
        Math.min(cell.x + cell.width - 5, Math.max(cell.x + 5, centre[0] + Math.cos(turn) * reach)),
        Math.min(cell.y + cell.height - 5, Math.max(cell.y + 7, centre[1] + Math.sin(turn) * reach)),
      ];
      balloon = candidate;
      if (placed.every((p) => Math.hypot(p[0] - candidate[0], p[1] - candidate[1]) > 7.5)) break;
    }
    placed.push(balloon);
    const toward = [anchor[0] - balloon[0], anchor[1] - balloon[1]],
      distance = Math.hypot(...toward) || 1;
    const start = [balloon[0] + (toward[0] / distance) * 3.2, balloon[1] + (toward[1] / distance) * 3.2];
    body +=
      `<g data-balloon="${row.item}">` +
      `<path d="M${start[0]} ${start[1]}L${anchor[0]} ${anchor[1]}" fill="none" stroke="${stroke}" stroke-width="0.18"/>` +
      `<path d="${circlePath(anchor, 0.55)}" fill="${stroke}" stroke="${stroke}" stroke-width="0.1"/>` +
      `<path d="${circlePath(balloon, 3.2)}" fill="white" stroke="${stroke}" stroke-width="0.25"/>` +
      `<text x="${balloon[0]}" y="${balloon[1] + 1}" text-anchor="middle" font-size="2.8">${row.item}</text></g>`;
  }
  return body;
}
