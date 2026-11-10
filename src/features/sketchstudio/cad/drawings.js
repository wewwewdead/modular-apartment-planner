import { numeric, resolveParameters } from './model.js';
import { engineeringSheetSvg } from './engineeringSheet.js';
import { threadNote } from './hardware.js';
import { circularCut } from './circularCuts.js';
import { manualDimensionsSvg } from './sheetAnnotations.js';
import { balloonsSvg, partsListRows, partsListSvg, sheetHasPartsList, PARTS_LIST_WIDTH } from './partsList.js';
import {
  fitsCell,
  overflowMessage,
  placeView,
  resolveSheetScale,
  scaleLabel,
  sheetFit,
  viewCells,
} from './sheetLayout.js';

export { PAGE_SIZES } from './sheetLayout.js';
export const xml = (value) =>
  String(value ?? '').replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c],
  );
const fmt = (value, units) =>
  `${(units === 'inch' ? value / 25.4 : value).toFixed(units === 'inch' ? 3 : 2)}${units === 'inch' ? ' in' : ''}`;

export function annotationText(annotation, model, snapshot) {
  const part = model.parts.find((p) => p.id === annotation.partId);
  const feature = part?.features.find((f) => f.id === annotation.featureId);
  const p = resolveParameters(model.parameters);
  if (annotation.type === 'part-number') return `${part?.id || '?'} — ${part?.name || 'Broken reference'}`;
  if (annotation.type === 'weld-note') {
    const weld = model.connections.find((c) => c.id === annotation.connectionId && c.type === 'weld');
    if (!weld) throw new Error(`Broken weld reference: ${annotation.connectionId}`);
    return weld.note;
  }
  if (annotation.type === 'hole' || annotation.type === 'diameter' || annotation.type === 'radius') {
    if (!feature) throw new Error(`Broken feature reference: ${annotation.featureId}`);
    // A cut extrusion of one circle is described exactly like a drilled hole.
    const circular = circularCut(feature, model, p);
    const diameter = circular
      ? circular.diameter
      : feature.diameter != null
        ? numeric(feature.diameter, p)
        : numeric(feature.radius, p) * 2;
    const cut = snapshot?.parts?.find((item) => item.id === part.id)?.features?.[feature.id]?.cut;
    const position = circular?.position || cut?.position || feature.position || [0, 0, 0];
    const throughAll = circular ? circular.throughAll : feature.throughAll;
    const depth =
      annotation.type !== 'hole'
        ? ''
        : throughAll
          ? ' through all'
          : ` depth ${fmt(circular ? circular.depth : numeric(feature.depth, p), annotation.units)}`;
    // A hole row (Phase K): "4 × " in front, "; 4 holes, pitch 50.00" after the first hole's XYZ.
    const row =
      annotation.type === 'hole' && !circular && feature.row
        ? snapshot?.parts?.find((item) => item.id === part.id)?.features?.[feature.id]?.row || {
            count: numeric(feature.row.count, p),
            pitch: numeric(feature.row.pitch, p),
          }
        : null;
    const many = row && row.count > 1;
    const text = `${annotation.type === 'hole' && feature.holeSpec ? `${threadNote(feature)}; DRILL ` : ''}${annotation.type === 'radius' ? 'R' : 'Ø'}${fmt(annotation.type === 'radius' ? diameter / 2 : diameter, annotation.units)}${annotation.type === 'hole' ? `${depth}; XYZ ${position.map((v) => fmt(numeric(v, p), annotation.units)).join(', ')}` : ''}`;
    return many ? `${row.count} × ${text}; ${row.count} holes, pitch ${fmt(row.pitch, annotation.units)}` : text;
  }
  if (annotation.type === 'angular') {
    if (!feature) throw new Error('Angular annotation needs a feature reference.');
    return `${numeric(feature[annotation.field || 'angleStart'], p).toFixed(2)}°`;
  }
  if (annotation.type === 'aligned') {
    const geometry = snapshot.parts.find((g) => g.id === annotation.partId);
    const metrics = geometry?.features[annotation.featureId];
    if (metrics?.centerline != null) return fmt(metrics.centerline, annotation.units);
    if (!annotation.anchors || annotation.anchors.length !== 2)
      throw new Error('Aligned dimensions require two explicit feature anchors.');
    const points = annotation.anchors.map((anchor) => {
      const item = geometry?.features[anchor.featureId];
      if (!item?.bounds || !['min', 'max'].includes(anchor.point)) throw new Error('Broken aligned dimension anchor.');
      return item.bounds[anchor.point === 'min' ? 0 : 1];
    });
    return fmt(Math.hypot(...points[1].map((v, i) => v - points[0][i])), annotation.units);
  }
  const geometry = snapshot.parts.find((g) => g.id === annotation.partId);
  const bounds = annotation.featureId ? geometry?.features[annotation.featureId]?.bounds : geometry?.bounds;
  if (!bounds) throw new Error(`Broken dimension reference: ${annotation.partId}`);
  const axis = ['X', 'Y', 'Z'].indexOf(annotation.axis || 'X');
  return fmt(bounds[1][axis] - bounds[0][axis], annotation.units);
}

// allowOverflow (the live preview): a view too big for its cell is still
// drawn, centred, and its cell outlined red; exports throw instead.
export function sheetSvg(sheet, model, snapshot, page = 1, pages = 1, { allowOverflow = false } = {}) {
  if (sheet.layout === 'engineering')
    return engineeringSheetSvg(sheet, model, snapshot, page, pages, { allowOverflow });
  const views = sheet.views;
  const parts = sheetHasPartsList(sheet) ? partsListRows(model, snapshot, sheet) : [];
  const { width, height, notesHeight, notes, cells } = viewCells(sheet, views, parts);
  const scale = resolveSheetScale(sheet, views, parts);
  if (scale <= 0) throw new Error('Drawing scale must be positive.');
  if (notesHeight > height / 2)
    throw new Error('Too many annotations for this sheet. Move some to another detail sheet.');
  let body = '',
    balloonsDone = false;
  const dimension = (x1, x2, y, label) =>
    `<path d="M${x1} ${y - 2}v4m0 -2H${x2}m0 -2v4" stroke="#52606e" stroke-width="0.18" fill="none"/><text x="${(x1 + x2) / 2}" y="${y - 1.5}" text-anchor="middle">${xml(label)}</text>`;
  views.forEach((view, index) => {
    const viewScale = view.scale == null ? scale : numeric(view.scale);
    if (viewScale <= 0) throw new Error('View scale must be positive.');
    const [vx, vy, vw, vh] = view.viewBox;
    const cell = cells[index],
      cellW = cell.width,
      cellH = cell.height,
      cx = cell.x,
      cy = cell.y;
    if (!fitsCell(cell, view.viewBox, viewScale)) {
      if (!allowOverflow) throw new Error(overflowMessage(sheet, view, sheetFit(sheet, views, { scale, parts })));
      body += `<rect x="${cx}" y="${cy}" width="${cellW}" height="${cellH}" fill="none" stroke="#c62828" stroke-width="0.5" stroke-dasharray="3 2" data-overflow="true"/>`;
    }
    const [x, y] = placeView(cell, view.viewBox, viewScale);
    const tx = x - vx * viewScale,
      ty = y - vy * viewScale;
    const paths = (items, attrs = '') => items.map((d) => `<path d="${xml(d)}" ${attrs}/>`).join('');
    body += `<text x="${cx + 2}" y="${cy + 3}" font-weight="bold">${xml(view.name.toUpperCase())}${sheet.section ? ' — SECTION' : ''}${view.scale ? ` · SCALE ${scaleLabel(viewScale)}` : ''}</text>`;
    const clipId = `view-clip-${index}`;
    body += `<defs><clipPath id="${clipId}"><rect x="${vx}" y="${vy}" width="${vw}" height="${vh}"/></clipPath><pattern id="hatch-${index}" width="${2 / viewScale}" height="${2 / viewScale}" patternUnits="userSpaceOnUse"><path d="M0 ${2 / viewScale}L${2 / viewScale} 0" stroke="#80909d" stroke-width="${0.12 / viewScale}"/></pattern></defs>`;
    body += `<g ${viewDataAttributes(view)} transform="translate(${tx} ${ty}) scale(${viewScale})" fill="none" stroke="#253444" stroke-width="${0.22 / viewScale}"${view.detail ? ` clip-path="url(#${clipId})"` : ''}>${paths(view.hatch || [], `fill="url(#hatch-${index})" fill-rule="evenodd" stroke="none"`)}${paths(view.visible)}${sheet.hiddenLines === false ? '' : paths(view.hidden, `stroke="#82909e" stroke-dasharray="${2 / viewScale} ${1 / viewScale}"`)}</g>`;
    const x1 = tx + vx * viewScale,
      x2 = x1 + vw * viewScale;
    if (
      sheet.overallDimensions !== false &&
      !view.detail &&
      !['isometric', 'exploded'].includes(view.view || view.name)
    ) {
      body += dimension(x1, x2, cy + cellH - 4, fmt(vw, sheet.units));
      const y1 = ty + vy * viewScale,
        y2 = y1 + vh * viewScale,
        dx = cx + 5;
      body += `<path d="M${dx - 2} ${y1}h4m-2 0V${y2}m-2 0h4" stroke="#52606e" stroke-width="0.18" fill="none"/><text x="${dx - 1}" y="${(y1 + y2) / 2}" transform="rotate(-90 ${dx - 1} ${(y1 + y2) / 2})" text-anchor="middle">${xml(fmt(vh, sheet.units))}</text>`;
    }
    if (sheet.centerlines)
      body += `<path d="M${(x1 + x2) / 2} ${cy + 6}V${cy + cellH - 8}" fill="none" stroke="#8193a5" stroke-width="0.15" stroke-dasharray="4 1 0.5 1"/>`;
    const point = (p) => [tx + p[0] * viewScale, ty + p[1] * viewScale];
    const kind = view.view || view.name;
    body += manualDimensionsSvg(sheet, kind, point, viewScale, {
      units: sheet.units,
      style: 'overview',
      format: (v) => fmt(v, sheet.units),
    });
    if (parts.length && kind === 'isometric' && !balloonsDone) {
      balloonsDone = true;
      body += balloonsSvg(parts, view, snapshot, point, { x: cx, y: cy, width: cellW, height: cellH }, '#253444');
    }
  });
  const titleY = height - notesHeight;
  body += `<path d="M10 ${titleY}H${width - 10}" stroke="#253444" stroke-width="0.3"/><text x="14" y="${titleY + 7}" font-size="5" font-weight="bold">${xml(sheet.title)}</text>`;
  body += `<text x="14" y="${titleY + 14}">Rev ${xml(sheet.revision)} · Scale ${scaleLabel(scale)} · ${xml(sheet.units || 'mm')} · Tolerance ${xml(sheet.tolerance)} · ${xml(sheet.material || 'See material list')}</text>`;
  body += `<text x="${width - 14}" y="${height - 13}" text-anchor="end">${page} / ${pages} · ${xml(sheet.size)} LANDSCAPE</text>`;
  notes.forEach((a, index) => {
    body += `<text x="14" y="${titleY + 20 + index * 4}">${xml(annotationText({ ...a, units: sheet.units }, model, snapshot))}</text>`;
  });
  if (parts.length) body += partsListSvg(parts, width - 12 - PARTS_LIST_WIDTH, titleY + 3, sheet.units, '#253444');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="white"/><rect x="10" y="8" width="${width - 20}" height="${height - 16}" fill="none" stroke="#253444" stroke-width="0.3"/><g font-family="sans-serif" font-size="3" fill="#253444">${body}</g></svg>`;
}

// Lets the drawing preview map clicks to view-model millimetres and lets
// tests find a view: kind, projection basis and view box.
export function viewDataAttributes(view) {
  const basis = (view.basis || []).map((axis) => axis.map((v) => +v.toFixed(9)).join(',')).join(';');
  return `data-view="${xml(view.view || view.name)}" data-basis="${basis}" data-viewbox="${(view.viewBox || []).join(' ')}"`;
}

export function profileSvg(profile) {
  const [x, y, w, h] = profile.viewBox;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${x} ${y} ${w} ${h}"><g fill="none" stroke="black" stroke-width="0.1">${profile.visible.map((d) => `<path d="${xml(d)}"/>`).join('')}</g></svg>`;
}
