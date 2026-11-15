// The drawing view kind 'flat' on a sheet (docs/sketch-studio-fab-shop.md §9
// SM-4): a sheet-metal blank's bend lines with their labels, and its bend
// table under the view. Shared by both sheet layouts (drawings.js,
// engineeringSheet.js) and by the cell layout (sheetLayout.js), which keeps
// room for the table so Fit to page fits the view and the table together.
// Paper millimetres; a view with no bend table changes nothing.

const escape = (value) =>
  String(value ?? '').replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c],
  );
const fmt = (value) => String(Number(value.toFixed(2)));

export const BEND_TABLE_COLUMNS = Object.freeze([
  ['BEND', 11],
  ['ANGLE', 14],
  ['DIR', 12],
  ['INSIDE R', 16],
  ['ALLOWANCE', 20],
  ['DEDUCTION', 20],
  ['TOOLING (PUNCH / DIE)', 52],
]);
export const BEND_TABLE_WIDTH = BEND_TABLE_COLUMNS.reduce((sum, [, w]) => sum + w, 0);
// A table with a round bend (docs/sketch-studio-round-bend.md §7, "R40 · 13
// HITS") gives INSIDE R the room it needs from TOOLING: the same total width,
// and a table of ordinary bends is drawn exactly as before.
const ROUND_COLUMNS = Object.freeze(
  BEND_TABLE_COLUMNS.map(([name, w]) => [name, name === 'INSIDE R' ? w + 8 : name.startsWith('TOOLING') ? w - 8 : w]),
);
const TITLE = 5,
  HEADER = 4.5,
  ROW = 4.2;

/** The bend table's height (0 for a view without one). */
export const bendTableHeight = (view) =>
  typeof view === 'object' && view?.bendTable?.length ? TITLE + HEADER + view.bendTable.length * ROW : 0;

/**
 * The bend table of a flat view at (x, y), fitted to `width` (scaled down,
 * never up). `format(mm)` writes a length in the sheet's units.
 */
export function bendTableSvg(rows, x, y, width, { format = fmt, stroke = '#20252b' } = {}) {
  const k = Math.min(1, width / BEND_TABLE_WIDTH);
  const height = TITLE + HEADER + rows.length * ROW;
  let out = `<g data-bend-table="true" transform="translate(${x} ${y}) scale(${k})" font-size="2.3">`;
  out += `<text x="0" y="3.4" font-weight="bold" font-size="2.6">BEND TABLE — IN THE ORDER MADE</text>`;
  out += `<rect x="0" y="${TITLE}" width="${BEND_TABLE_WIDTH}" height="${height - TITLE}" fill="none" stroke="${stroke}" stroke-width="0.25"/>`;
  out += `<path d="M0 ${TITLE + HEADER}H${BEND_TABLE_WIDTH}" stroke="${stroke}" stroke-width="0.2"/>`;
  let left = 0;
  const columns = rows.some((row) => row.steps) ? ROUND_COLUMNS : BEND_TABLE_COLUMNS;
  columns.forEach(([name, w], i) => {
    if (i) out += `<path d="M${left} ${TITLE}V${height}" stroke="${stroke}" stroke-width="0.15"/>`;
    out += `<text x="${left + 1.2}" y="${TITLE + 3.2}" font-weight="bold" font-size="2">${escape(name)}</text>`;
    left += w;
  });
  rows.forEach((row, r) => {
    const cells = [
      String(row.bend),
      `${fmt(row.angle)}°`,
      row.direction.toUpperCase(),
      `R${format(row.radius)}${row.steps ? ` · ${row.steps} HITS` : ''}`,
      format(row.allowance),
      format(row.deduction),
      row.tooling,
    ];
    let at = 0;
    const baseline = TITLE + HEADER + r * ROW + 3;
    cells.forEach((cell, i) => {
      out += `<text x="${at + 1.2}" y="${baseline}">${escape(cell)}</text>`;
      at += columns[i][1];
    });
  });
  return `${out}</g>`;
}

/**
 * A flat view's bend lines (phantom lines) and one label per bend on its
 * longest interval ("1 · UP 90° R1.6"), in paper space through `point`
 * (drawing mm → paper mm).
 */
export function bendLinesSvg(view, point, { stroke = '#20252b' } = {}) {
  const lines = view.bendLines || [];
  if (!lines.length) return '';
  let out = '<g data-bend-lines="true">';
  const longest = new Map();
  for (const line of lines) {
    const [a, b] = [point(line.a), point(line.b)];
    // A round bend's tangent line (round-bend spec §7): thin, continuous, never labelled.
    if (line.tangent) {
      out += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" fill="none" stroke="${stroke}" stroke-width="0.13" data-tangent="true"/>`;
      continue;
    }
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    out += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" fill="none" stroke="${stroke}" stroke-width="0.25" stroke-dasharray="6 1.5 1 1.5"/>`;
    if (!longest.has(line.bend) || longest.get(line.bend).length < length)
      longest.set(line.bend, { a, b, length, line });
  }
  for (const { a, b, line } of longest.values()) {
    let angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle <= -90) angle += 180;
    const rad = (angle * Math.PI) / 180;
    // 1.2 mm off the line, on the side above the text's baseline.
    const mid = [(a[0] + b[0]) / 2 + Math.sin(rad) * 1.2, (a[1] + b[1]) / 2 - Math.cos(rad) * 1.2];
    out += `<text x="${fmt(mid[0])}" y="${fmt(mid[1])}" font-size="2.2" text-anchor="middle" transform="rotate(${fmt(angle)} ${fmt(mid[0])} ${fmt(mid[1])})">${escape(`${line.bend} · ${line.label}`)}</text>`;
  }
  return `${out}</g>`;
}
