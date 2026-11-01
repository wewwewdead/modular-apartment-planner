import { numeric, resolveParameters } from './model.js';
import { mapPlacement } from './placement.js';
import { PAGE_SIZES, xml, annotationText, viewDataAttributes } from './drawings.js';
import { circularCut } from './circularCuts.js';
import { isDrawnAnnotation, manualDimensionsSvg } from './sheetAnnotations.js';
import {
  balloonsSvg,
  partsListHeight,
  partsListRows,
  partsListSvg,
  sheetHasPartsList,
  PARTS_LIST_WIDTH,
} from './partsList.js';

export const scaleLabel = (scale) => (scale >= 1 ? `${scale}:1` : `1:${+(1 / scale).toFixed(3)}`);
const number = (n, units) => String(+(units === 'inch' ? n / 25.4 : n).toFixed(units === 'inch' ? 3 : 2));
const text = (x, y, value, attrs = '') => `<text x="${x}" y="${y}" ${attrs}>${xml(value)}</text>`;
const path = (d, attrs = '') => `<path d="${d}" fill="none" stroke="#20252b" stroke-width="0.18" ${attrs}/>`;
const line = (a, b, attrs = '') => path(`M${a.join(' ')}L${b.join(' ')}`, attrs);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const project = (point, basis) => basis.map((axis) => dot(point, axis));

// Resolve feature references each time a sheet is generated. Positions are never
// cached in the document, so parameter changes also move dimensions and leaders.
export function sheetHoleFeatures(sheet, model, snapshot, view) {
  if (!view.basis) return [];
  const parameters = resolveParameters(model.parameters);
  const sources = sheet.partId
    ? [{ partId: sheet.partId, id: null }]
    : model.instances.filter((i) => !sheet.instanceIds?.length || sheet.instanceIds.includes(i.id));
  return sources.flatMap((instance) => {
    const part = model.parts.find((p) => p.id === instance.partId);
    const geometry = snapshot.parts.find((p) => p.id === instance.partId);
    const placement = instance.id ? snapshot.instances.find((i) => i.id === instance.id)?.placement : null;
    if (instance.id && !placement) throw new Error(`Missing drawing placement: ${instance.id}`);
    return (part?.features || [])
      .filter((f) => (f.type === 'hole' && !f.suppressed) || circularCut(f, model, parameters))
      .flatMap((feature) => {
        // Circular cut extrusions are holes too; their geometry comes from the sketch.
        const circular = feature.type === 'hole' ? null : circularCut(feature, model, parameters);
        const cut = circular || geometry?.features[feature.id]?.cut;
        if (!cut) return [];
        // A later transform/pattern changes the topology: do not invent a center.
        const later = part.features.slice(part.features.indexOf(feature) + 1);
        if (later.some((f) => !f.suppressed && ['transform', 'pattern', 'mirror'].includes(f.type))) return [];
        const direction = placement ? mapPlacement(cut.direction, placement, true) : cut.direction;
        if (Math.hypot(...project(direction, view.basis)) > 1e-6) return [];
        // A hole row (Phase K): one entry per centre, all with the feature's id,
        // so a callout over it reads "4 × Ø…" and a chain across it gives the pitch.
        const row = circular ? null : geometry?.features[feature.id]?.row;
        const centres = row?.centres?.length ? row.centres : [cut.position];
        return centres.map((centre) => ({
          id: feature.id,
          partId: part.id,
          instanceId: instance.id,
          point: project(placement ? mapPlacement(centre, placement) : centre, view.basis),
          diameter: circular ? circular.diameter : numeric(feature.diameter, parameters),
          holeSpec: feature.holeSpec,
          throughAll: feature.throughAll === true,
          depth: cut.depth,
        }));
      });
  });
}

function arrow(tip, direction) {
  const [x, y] = tip,
    [dx, dy] = direction;
  return path(
    `M${x + dx * 2.2 - dy * 0.65} ${y + dy * 2.2 + dx * 0.65}L${x} ${y}L${x + dx * 2.2 + dy * 0.65} ${y + dy * 2.2 - dx * 0.65}`,
  );
}

function dimension(a, b, position, vertical, label) {
  if (vertical) {
    return (
      line(a, [position - 1.5, a[1]]) +
      line(b, [position - 1.5, b[1]]) +
      line([position, a[1]], [position, b[1]]) +
      arrow([position, a[1]], [0, 1]) +
      arrow([position, b[1]], [0, -1]) +
      text(
        position - 1.4,
        (a[1] + b[1]) / 2,
        label,
        `text-anchor="middle" transform="rotate(-90 ${position - 1.4} ${(a[1] + b[1]) / 2})"`,
      )
    );
  }
  return (
    line(a, [a[0], position + 1.5]) +
    line(b, [b[0], position + 1.5]) +
    line([a[0], position], [b[0], position]) +
    arrow([a[0], position], [1, 0]) +
    arrow([b[0], position], [-1, 0]) +
    text((a[0] + b[0]) / 2, position - 1.6, label, 'text-anchor="middle"')
  );
}

function wrap(value, limit) {
  return String(value || '')
    .split('\n')
    .flatMap((paragraph) => {
      const lines = [''];
      for (const word of paragraph.split(/\s+/)) {
        if (word.length > limit)
          throw new Error('A drawing note contains a word that is too long. Add spaces or line breaks.');
        if ((lines.at(-1) + ' ' + word).trim().length > limit) lines.push(word);
        else lines[lines.length - 1] = (lines.at(-1) + ' ' + word).trim();
      }
      return lines;
    });
}

export function engineeringSheetSvg(sheet, model, snapshot, page, pages) {
  const [width, height] = PAGE_SIZES[sheet.size] || PAGE_SIZES.A3;
  const scale = numeric(sheet.scale);
  if (scale <= 0) throw new Error('Drawing scale must be positive.');
  if (sheet.views.length > 4)
    throw new Error('Engineering layout supports up to four views. Add another sheet for more views.');
  for (const a of sheet.annotations || []) {
    if (!['hole-chain', 'hole-callout'].includes(a.type)) continue;
    if (!sheet.views.some((v) => (v.view || v.name) === a.view))
      throw new Error(`Annotation view ${a.view} is not on this sheet. Restore the view or remove the annotation.`);
    if (sheet.section)
      throw new Error('Hole annotations on sectioned geometry are not supported. Use a separate uncut detail sheet.');
  }
  const parts = sheetHasPartsList(sheet) ? partsListRows(model, snapshot, sheet) : [];
  let balloonsDone = false;
  const titleY = height - 58,
    divisions = sheet.views.length === 1 ? 1 : 2,
    cellW = (width - 30) / divisions,
    cellH = (titleY - 20) / divisions;
  let body = '';
  // Explicitly arranged views, rather than pretending to follow a projection
  // standard whose camera definitions may differ between imported models.
  const used = new Set();
  sheet.views.forEach((view) => {
    const kind = view.view || view.name;
    let slot = divisions === 1 ? 0 : { top: 0, isometric: 1, front: 2, right: 3 }[kind];
    if (slot == null || used.has(slot)) slot = [0, 1, 2, 3].find((i) => !used.has(i));
    used.add(slot);
    const s = view.scale == null ? scale : numeric(view.scale);
    if (s <= 0) throw new Error('View scale must be positive.');
    const [vx, vy, vw, vh] = view.viewBox;
    const marginX = 26,
      marginY = 46;
    if (vw * s > cellW - marginX || vh * s > cellH - marginY)
      throw new Error(
        `${sheet.title}: ${view.name} does not fit at ${scaleLabel(s)}. Use a larger page or smaller view scale.`,
      );
    const cx = 15 + (slot % 2) * cellW,
      cy = 12 + Math.floor(slot / 2) * cellH;
    const x = cx + 18 + (cellW - marginX - vw * s) / 2;
    const y = cy + 25 + (cellH - marginY - vh * s) / 2;
    const tx = x - vx * s,
      ty = y - vy * s;
    const point = (p) => [tx + p[0] * s, ty + p[1] * s];
    const paths = (items, attrs = '') => (items || []).map((d) => path(xml(d), attrs)).join('');
    body += text(
      cx + cellW / 2,
      cy + cellH - 1,
      `${view.name.toUpperCase()}${sheet.section ? ' — SECTION' : ''}   ${scaleLabel(s)}`,
      'text-anchor="middle" font-weight="bold"',
    );
    body += `<defs><clipPath id="engineering-clip-${slot}"><rect x="${vx}" y="${vy}" width="${vw}" height="${vh}"/></clipPath><pattern id="engineering-hatch-${slot}" width="${2 / s}" height="${2 / s}" patternUnits="userSpaceOnUse">${path(`M0 ${2 / s}L${2 / s} 0`, `style="stroke-width:${0.12 / s}"`)}</pattern></defs>`;
    body += `<g ${viewDataAttributes(view)} transform="translate(${tx} ${ty}) scale(${s})"${view.detail ? ` clip-path="url(#engineering-clip-${slot})"` : ''}>`;
    body += (view.hatch || [])
      .map((d) => `<path d="${xml(d)}" fill="url(#engineering-hatch-${slot})" fill-rule="evenodd" stroke="none"/>`)
      .join('');
    body += paths(view.visible, `style="stroke-width:${0.25 / s}"`);
    if (sheet.hiddenLines !== false)
      body += paths(
        view.hidden,
        `style="stroke:#71777d;stroke-width:${0.13 / s}" stroke-dasharray="${2 / s} ${1 / s}"`,
      );
    body += '</g>';
    if (sheet.overallDimensions !== false && !view.detail && !['isometric', 'exploded'].includes(kind)) {
      body += dimension([x, y + vh * s], [x + vw * s, y + vh * s], y + vh * s + 9, false, number(vw, sheet.units));
      body += dimension([x, y], [x, y + vh * s], x - 9, true, number(vh, sheet.units));
    }
    body += manualDimensionsSvg(sheet, kind, point, s, { units: sheet.units, format: (v) => number(v, sheet.units) });
    if (parts.length && kind === 'isometric' && !balloonsDone) {
      balloonsDone = true;
      body += balloonsSvg(parts, view, snapshot, point, { x: cx, y: cy, width: cellW, height: cellH });
    }
    const holes = view.detail || sheet.section ? [] : sheetHoleFeatures(sheet, model, snapshot, view);
    if (sheet.centerlines !== false)
      holes.forEach((h) => {
        const [hx, hy] = point(h.point),
          r = (h.diameter * s) / 2 + 2;
        body += path(
          `M${hx - r} ${hy}H${hx + r}M${hx} ${hy - r}V${hy + r}`,
          'stroke-dasharray="4 1 0.5 1" style="stroke:#626a72;stroke-width:0.13"',
        );
      });
    (sheet.annotations || [])
      .filter((a) => a.view === kind)
      .forEach((a) => {
        const selected = holes.filter(
          (h) =>
            h.partId === a.partId &&
            (!a.instanceId || h.instanceId === a.instanceId) &&
            (a.featureIds || [a.featureId]).includes(h.id),
        );
        if (
          ['hole-chain', 'hole-callout'].includes(a.type) &&
          (a.featureIds || [a.featureId]).some((id) => !selected.some((h) => h.id === id))
        )
          throw new Error(
            'A referenced hole is not visible face-on in this view, or its geometry changed. Choose another view or update the annotation.',
          );
        if (a.type === 'hole-chain') {
          if (!selected.length)
            throw new Error('Hole chain needs visible, face-on hole references in its selected view.');
          const vertical = a.axis === 'Y',
            axis = vertical ? 1 : 0;
          const coords = [...new Set(selected.map((h) => +h.point[axis].toFixed(6)))].sort((a, b) => a - b);
          const start = vertical ? vy : vx;
          if (a.fromEdge !== false && Math.abs(coords[0] - start) > 1e-5) coords.unshift(start);
          const offset = numeric(a.offset ?? 12);
          const location = vertical ? x - offset : y - offset;
          if (
            vertical ? location < cx + 4 || location > cx + cellW - 4 : location < cy + 4 || location > cy + cellH - 6
          )
            throw new Error('Dimension offset leaves its view area. Reduce the offset or use a smaller view scale.');
          coords.slice(1).forEach((v, i) => {
            const first = vertical ? point([vx, coords[i]]) : point([coords[i], vy]);
            const second = vertical ? point([vx, v]) : point([v, vy]);
            body += dimension(
              first,
              second,
              vertical ? x - offset : y - offset,
              vertical,
              number(v - coords[i], sheet.units),
            );
          });
        } else if (a.type === 'hole-callout') {
          if (!selected.length)
            throw new Error('Hole callout needs visible, face-on hole references in its selected view.');
          if (
            selected.some(
              (h) =>
                Math.abs(h.diameter - selected[0].diameter) > 1e-6 ||
                h.throughAll !== selected[0].throughAll ||
                JSON.stringify(h.holeSpec) !== JSON.stringify(selected[0].holeSpec) ||
                (!h.throughAll && Math.abs(h.depth - selected[0].depth) > 1e-6),
            )
          )
            throw new Error('Group only holes with matching diameters and cut depths in one callout.');
          const h = selected.at(-1),
            center = point(h.point),
            r = (h.diameter * s) / 2;
          const tip = [center[0] + r * 0.707, center[1] - r * 0.707];
          const end = [tip[0] + numeric(a.dx ?? 7), tip[1] + numeric(a.dy ?? -12)];
          if (end[0] < cx + 2 || end[0] > cx + cellW - 2 || end[1] < cy + 4 || end[1] > cy + cellH - 6)
            throw new Error('Leader offset leaves its view area. Reduce the offset or use a smaller view scale.');
          const thread = h.holeSpec
            ? `${h.holeSpec.mode === 'tap' ? 'TAP' : 'FOR'} ${h.holeSpec.size} × ${h.holeSpec.pitch}; DRILL `
            : '';
          const label = `${selected.length > 1 ? `${selected.length} × ` : ''}${thread}Ø${number(h.diameter, sheet.units)} ${h.throughAll ? 'THRU' : `DEPTH ${number(h.depth, sheet.units)}`}`;
          // Keep callout text within its view cell, even for a hole near an edge.
          const labelX = Math.max(cx + 3, Math.min(end[0], cx + cellW - label.length * 1.7 - 3));
          body += line(tip, end) + line(end, [labelX, end[1]]) + text(labelX, end[1] - 1.5, label);
          const len = Math.hypot(end[0] - tip[0], end[1] - tip[1]);
          if (len) body += arrow(tip, [(end[0] - tip[0]) / len, (end[1] - tip[1]) / len]);
        }
      });
  });
  const blockX = width - 162,
    tableX = blockX - 4 - PARTS_LIST_WIDTH,
    noteWidth = (parts.length ? tableX - 4 : blockX) - 18;
  body += line([10, titleY], [width - 10, titleY]);
  body += text(14, titleY + 6, 'DRAWING NOTES', 'font-size="2.5" font-weight="bold"');
  const notes = wrap(sheet.notes || '', Math.floor(noteWidth / 1.5));
  for (const a of sheet.annotations || []) {
    if (!isDrawnAnnotation(a))
      notes.push(...wrap(annotationText({ ...a, units: sheet.units }, model, snapshot), Math.floor(noteWidth / 1.5)));
  }
  if (notes.length > 9)
    throw new Error('Drawing notes exceed the title area. Shorten the notes or move them to another sheet.');
  notes.forEach((n, i) => {
    body += text(14, titleY + 12 + i * 4, n, 'font-size="2.6"');
  });
  if (parts.length) {
    if (partsListHeight(parts) > 48)
      throw new Error('The parts list does not fit the title area. Use a larger page or a sheet per sub-assembly.');
    body += partsListSvg(parts, tableX, titleY + 2, sheet.units);
  }
  body += line([blockX, titleY], [blockX, height - 8]);
  [12, 24, 36].forEach((dy) => {
    body += line([blockX, titleY + dy], [width - 10, titleY + dy]);
  });
  function field(x, y, label, value, limit = 37) {
    if (String(value || '').length > limit)
      throw new Error(`${label} is too long for the title block (maximum ${limit} characters).`);
    body += text(x + 3, y + 3.6, label, 'font-size="2" fill="#626a72"') + text(x + 3, y + 9, value, 'font-size="3"');
  }
  field(blockX, titleY, 'TITLE', sheet.title, 65);
  field(blockX, titleY + 12, 'DRAWING NO.', sheet.drawingNumber || '—', 29);
  field(blockX + 86, titleY + 12, 'REVISION', sheet.revision, 14);
  body += line([blockX + 86, titleY + 12], [blockX + 86, titleY + 24]);
  field(blockX, titleY + 24, 'MATERIAL / FINISH', sheet.material || 'See parts list', 29);
  field(blockX + 86, titleY + 24, 'TOLERANCE', sheet.tolerance || 'Not specified', 22);
  body += line([blockX + 86, titleY + 24], [blockX + 86, titleY + 36]);
  const mixed = sheet.views.some((v) => v.scale != null && numeric(v.scale) !== scale);
  field(
    blockX,
    titleY + 36,
    'SCALE / UNITS / SHEET',
    `${mixed ? 'AS SHOWN' : scaleLabel(scale)} / ${sheet.units || 'mm'} / ${page} of ${pages}`,
    29,
  );
  field(blockX + 86, titleY + 36, 'DRAWN BY / DATE', `${sheet.drawnBy || '—'} / ${sheet.date || '—'}`, 25);
  body += line([blockX + 86, titleY + 36], [blockX + 86, height - 8]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="white"/><rect x="10" y="8" width="${width - 20}" height="${height - 16}" fill="none" stroke="#20252b" stroke-width="0.35"/><g font-family="sans-serif" font-size="3" fill="#20252b">${body}</g></svg>`;
}
