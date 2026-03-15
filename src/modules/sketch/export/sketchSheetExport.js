import { PAPER_PRESETS } from '@/sheets/paper';
import { projectPartToView, getPartExtents } from '../domain/viewProjection';
import { createDimensionFigure } from '@/annotations/dimensions';

const MARGIN = 15; // mm
const TITLE_HEIGHT = 12; // mm
const VIEW_GAP = 10; // mm
const STROKE_WIDTH = 0.3;

function projectDimensionPoint(point, view) {
  switch (view) {
    case 'top':
      return { x: point.x, y: point.y };
    case 'front':
      return { x: point.x, y: -(point.z || 0) };
    case 'side':
      return { x: point.y, y: -(point.z || 0) };
    default:
      return { x: point.x, y: point.y };
  }
}

function getPartsBounds(parts, view, dimensions = []) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const part of parts) {
    if (part.type === 'dimension') continue;
    const { svgX, svgY, svgWidth, svgHeight } = projectPartToView(part, view);
    minX = Math.min(minX, svgX);
    minY = Math.min(minY, svgY);
    maxX = Math.max(maxX, svgX + svgWidth);
    maxY = Math.max(maxY, svgY + svgHeight);
  }

  // Include dimension figure bounds
  for (const dim of dimensions) {
    const start2D = projectDimensionPoint(dim.startPoint, view);
    const end2D = projectDimensionPoint(dim.endPoint, view);
    const figure = createDimensionFigure({
      id: dim.id,
      startPoint: start2D,
      endPoint: end2D,
      mode: 'aligned',
      offset: dim.offset || 200,
      label: dim.textOverride || undefined,
      source: 'manual',
    });
    if (!figure) continue;

    const points = [
      figure.lineStart, figure.lineEnd,
      ...figure.extensionLines.flatMap((l) => [l.start, l.end]),
    ];
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function renderViewSvg(parts, view, offsetX, offsetY, scale) {
  const lines = [];

  for (const part of parts) {
    if (part.type === 'dimension') continue;
    const { svgX, svgY, svgWidth, svgHeight } = projectPartToView(part, view);
    const isSubtractive = part.type === 'cutout' || part.type === 'hole';

    const x = offsetX + svgX * scale;
    const y = offsetY + svgY * scale;
    const w = svgWidth * scale;
    const h = svgHeight * scale;

    if (part.type === 'hole' && view === 'top') {
      lines.push(
        `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ` +
        `fill="none" stroke="#333" stroke-width="${STROKE_WIDTH}" ${isSubtractive ? 'stroke-dasharray="1 0.8"' : ''}/>`
      );
    } else {
      lines.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" ` +
        `fill="none" stroke="#333" stroke-width="${STROKE_WIDTH}" ${isSubtractive ? 'stroke-dasharray="1 0.8"' : ''}/>`
      );
    }
  }

  return lines.join('\n');
}

function renderDimensionsSvg(dimensions, view, offsetX, offsetY, scale) {
  const lines = [];
  const DIM_STROKE = 0.15;
  const FONT_SIZE = 2.5;
  const ARROW_SCALE = 0.08;

  for (const dim of dimensions) {
    const start2D = projectDimensionPoint(dim.startPoint, view);
    const end2D = projectDimensionPoint(dim.endPoint, view);

    const figure = createDimensionFigure({
      id: dim.id,
      startPoint: start2D,
      endPoint: end2D,
      mode: 'aligned',
      offset: dim.offset || 200,
      label: dim.textOverride || undefined,
      source: 'manual',
    });

    if (!figure) continue;

    // Extension lines
    for (const ext of figure.extensionLines) {
      const x1 = offsetX + ext.start.x * scale;
      const y1 = offsetY + ext.start.y * scale;
      const x2 = offsetX + ext.end.x * scale;
      const y2 = offsetY + ext.end.y * scale;
      lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#666" stroke-width="${DIM_STROKE}"/>`);
    }

    // Dimension line
    const lx1 = offsetX + figure.lineStart.x * scale;
    const ly1 = offsetY + figure.lineStart.y * scale;
    const lx2 = offsetX + figure.lineEnd.x * scale;
    const ly2 = offsetY + figure.lineEnd.y * scale;
    lines.push(`<line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="#333" stroke-width="${DIM_STROKE}"/>`);

    // Arrowheads
    for (const arrow of figure.arrowheads) {
      const tipX = offsetX + arrow.tip.x * scale;
      const tipY = offsetY + arrow.tip.y * scale;
      const leftX = offsetX + arrow.left.x * scale;
      const leftY = offsetY + arrow.left.y * scale;
      const rightX = offsetX + arrow.right.x * scale;
      const rightY = offsetY + arrow.right.y * scale;
      lines.push(`<polygon points="${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}" fill="#333"/>`);
    }

    // Text
    const tx = offsetX + figure.text.position.x * scale;
    const ty = offsetY + figure.text.position.y * scale;
    lines.push(
      `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central" ` +
      `transform="rotate(${figure.text.angle} ${tx} ${ty})" ` +
      `font-family="sans-serif" font-size="${FONT_SIZE}" fill="#333">${figure.text.value}</text>`
    );
  }

  return lines.join('\n');
}

export function exportSketchSvg(project) {
  const paper = PAPER_PRESETS.A4_LANDSCAPE;
  const pageW = paper.width;
  const pageH = paper.height;

  const renderParts = project.parts.filter((p) => p.type !== 'dimension');
  const dimensions = project.parts.filter((p) => p.type === 'dimension');

  if (renderParts.length === 0 && dimensions.length === 0) return null;

  const views = ['top', 'front', 'side'];
  const viewLabels = { top: 'Top View', front: 'Front View', side: 'Side View' };

  // Calculate bounds for each view (including dimensions)
  const boundsList = views.map((v) => getPartsBounds(renderParts, v, dimensions));

  // Available area for 3 views side by side
  const availW = pageW - 2 * MARGIN;
  const availH = pageH - 2 * MARGIN - TITLE_HEIGHT - VIEW_GAP;

  // Each view gets 1/3 of width
  const viewSlotW = (availW - 2 * VIEW_GAP) / 3;
  const viewSlotH = availH;

  // Find uniform scale that fits all views
  let scale = Infinity;
  for (let i = 0; i < views.length; i++) {
    const b = boundsList[i];
    if (b.width > 0) scale = Math.min(scale, viewSlotW / b.width);
    if (b.height > 0) scale = Math.min(scale, viewSlotH / b.height);
  }
  if (!isFinite(scale) || scale <= 0) scale = 0.1;

  // Build SVG
  let svgContent = '';
  svgContent += `<rect x="0" y="0" width="${pageW}" height="${pageH}" fill="white"/>\n`;

  // Title block
  svgContent += `<text x="${pageW / 2}" y="${MARGIN + 6}" text-anchor="middle" font-family="sans-serif" font-size="5" font-weight="bold" fill="#333">${project.name || 'Untitled'}</text>\n`;
  svgContent += `<text x="${pageW - MARGIN}" y="${pageH - 4}" text-anchor="end" font-family="sans-serif" font-size="3" fill="#999">${new Date().toLocaleDateString()}</text>\n`;

  // Render each view
  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    const b = boundsList[i];
    const slotX = MARGIN + i * (viewSlotW + VIEW_GAP);
    const slotY = MARGIN + TITLE_HEIGHT + VIEW_GAP;

    // Center within slot
    const renderedW = b.width * scale;
    const renderedH = b.height * scale;
    const offsetX = slotX + (viewSlotW - renderedW) / 2 - b.x * scale;
    const offsetY = slotY + (viewSlotH - renderedH) / 2 - b.y * scale;

    // View label
    svgContent += `<text x="${slotX + viewSlotW / 2}" y="${slotY - 2}" text-anchor="middle" font-family="sans-serif" font-size="3.5" fill="#666">${viewLabels[view]}</text>\n`;

    // View border
    svgContent += `<rect x="${slotX}" y="${slotY}" width="${viewSlotW}" height="${viewSlotH}" fill="none" stroke="#ddd" stroke-width="0.2"/>\n`;

    // Parts
    svgContent += renderViewSvg(renderParts, view, offsetX, offsetY, scale);

    // Dimensions
    svgContent += renderDimensionsSvg(dimensions, view, offsetX, offsetY, scale);
  }

  // Page border
  svgContent += `<rect x="0.5" y="0.5" width="${pageW - 1}" height="${pageH - 1}" fill="none" stroke="#999" stroke-width="0.3"/>\n`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageW} ${pageH}" width="${pageW}mm" height="${pageH}mm">\n${svgContent}</svg>`;

  return svg;
}

export function downloadSketchSvg(project) {
  const svg = exportSketchSvg(project);
  if (!svg) return;

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name || 'sketch'}-sheet.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
