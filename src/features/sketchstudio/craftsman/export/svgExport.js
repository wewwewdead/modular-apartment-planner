/**
 * Standalone SVG export with correct mm dimensions.
 * Produces clean SVG suitable for laser cutters and CNC.
 * Includes dimensions, angle dimensions, and text labels.
 */

import { downloadAsFile } from '../../utils/bomExportUtils';
import { getRectCorners, resolveSourceReferenceFromEntities } from '../../utils/entityUtils';
import { getDimensionGeometry, measureDistance, formatDimensionText } from '../../utils/dimensionUtils';
import { getAngleDimensionGeometry, formatAngleText } from '../../utils/angleUtils';

const EXPORTABLE_TYPES = new Set([
  'line', 'rect', 'circle', 'arc', 'polyline', 'ellipse', 'feature',
  'dimension', 'angle-dimension', 'text',
]);

const GEO_ATTRS = 'stroke="black" stroke-width="0.5" fill="none"';
const DIM_ATTRS = 'stroke="#666" stroke-width="0.3" fill="none"';
const DIM_FONT = 'font-size="10" font-family="sans-serif" fill="#666"';

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function featureToSvgElement(entity) {
  if (entity.shape === 'circle') {
    const r = (entity.diameter ?? 0) / 2;
    return `  <circle cx="${entity.cx}" cy="${entity.cy}" r="${r}" ${GEO_ATTRS} />`;
  }

  if (entity.shape === 'ellipse') {
    const rot = entity.rotation ?? 0;
    const transform = rot ? ` transform="rotate(${rot} ${entity.cx} ${entity.cy})"` : '';
    return `  <ellipse cx="${entity.cx}" cy="${entity.cy}" rx="${entity.rx}" ry="${entity.ry}"${transform} ${GEO_ATTRS} />`;
  }

  if (entity.shape === 'polygon') {
    if (!entity.points?.length) return '';
    const pts = entity.points.map((p) => `${p.x},${p.y}`).join(' ');
    return `  <polygon points="${pts}" ${GEO_ATTRS} />`;
  }

  const x = entity.x ?? 0;
  const y = entity.y ?? 0;
  const w = entity.width ?? 0;
  const h = entity.height ?? 0;
  return `  <rect x="${x}" y="${y}" width="${w}" height="${h}" ${GEO_ATTRS} />`;
}

function dimensionToSvgElement(entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  const p1 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[0], entity.p1);
  const p2 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[1], entity.p2);
  if (!p1 || !p2) return '';

  const geometry = getDimensionGeometry({ p1, p2, subtype: entity.subtype, offset: entity.offset });
  const text = formatDimensionText(measureDistance(p1, p2, entity.subtype), entity.units);
  const { ext1, ext2, dimLine, tick1, tick2, textPoint, textAngle } = geometry;

  return `  <g>
    <line x1="${ext1.x1}" y1="${ext1.y1}" x2="${ext1.x2}" y2="${ext1.y2}" ${DIM_ATTRS} />
    <line x1="${ext2.x1}" y1="${ext2.y1}" x2="${ext2.x2}" y2="${ext2.y2}" ${DIM_ATTRS} />
    <line x1="${dimLine.x1}" y1="${dimLine.y1}" x2="${dimLine.x2}" y2="${dimLine.y2}" ${DIM_ATTRS} />
    <line x1="${tick1.x1}" y1="${tick1.y1}" x2="${tick1.x2}" y2="${tick1.y2}" ${DIM_ATTRS} />
    <line x1="${tick2.x1}" y1="${tick2.y1}" x2="${tick2.x2}" y2="${tick2.y2}" ${DIM_ATTRS} />
    <text x="${textPoint.x}" y="${textPoint.y}" text-anchor="middle" dominant-baseline="middle" ${DIM_FONT} transform="rotate(${textAngle} ${textPoint.x} ${textPoint.y})">${escapeXml(text)}</text>
  </g>`;
}

function angleDimensionToSvgElement(entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  const vertex = resolveSourceReferenceFromEntities(allEntities, sourceRefs[1], entity.vertex);
  const p1 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[0], entity.p1);
  const p2 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[2], entity.p2);
  if (!vertex || !p1 || !p2) return '';

  const geometry = getAngleDimensionGeometry({ vertex, p1, p2, arcRadius: entity.arcRadius, isometricPlane: entity.isometricPlane });
  const text = formatAngleText(geometry.angleDeg);
  const { ray1, ray2, arcPath, textPoint } = geometry;

  return `  <g>
    <line x1="${ray1.x1}" y1="${ray1.y1}" x2="${ray1.x2}" y2="${ray1.y2}" ${DIM_ATTRS} />
    <line x1="${ray2.x1}" y1="${ray2.y1}" x2="${ray2.x2}" y2="${ray2.y2}" ${DIM_ATTRS} />
    <path d="${arcPath}" ${DIM_ATTRS} />
    <text x="${textPoint.x}" y="${textPoint.y}" text-anchor="middle" dominant-baseline="middle" ${DIM_FONT}>${escapeXml(text)}</text>
  </g>`;
}

function textToSvgElement(entity) {
  const rot = entity.rotation ?? 0;
  const transform = rot ? ` transform="rotate(${rot} ${entity.x} ${entity.y})"` : '';
  return `  <text x="${entity.x}" y="${entity.y}" font-size="${entity.fontSize}" font-family="sans-serif" fill="black" dominant-baseline="hanging"${transform}>${escapeXml(entity.text)}</text>`;
}

function entityToSvgElement(entity, allEntities) {
  switch (entity.type) {
    case 'line':
      return `  <line x1="${entity.x1}" y1="${entity.y1}" x2="${entity.x2}" y2="${entity.y2}" ${GEO_ATTRS} />`;

    case 'rect': {
      const rotation = entity.rotation ?? 0;
      if (rotation) {
        const corners = getRectCorners(entity);
        const pts = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
          .map((p) => `${p.x},${p.y}`)
          .join(' ');
        return `  <polygon points="${pts}" ${GEO_ATTRS} />`;
      }
      const x = Math.min(entity.x1 ?? entity.x ?? 0, entity.x2 ?? ((entity.x ?? 0) + (entity.width ?? 0)));
      const y = Math.min(entity.y1 ?? entity.y ?? 0, entity.y2 ?? ((entity.y ?? 0) + (entity.height ?? 0)));
      const w = Math.abs(entity.width ?? ((entity.x2 ?? 0) - (entity.x1 ?? 0)));
      const h = Math.abs(entity.height ?? ((entity.y2 ?? 0) - (entity.y1 ?? 0)));
      return `  <rect x="${x}" y="${y}" width="${w}" height="${h}" ${GEO_ATTRS} />`;
    }

    case 'circle': {
      const cx = entity.center?.x ?? entity.cx ?? 0;
      const cy = entity.center?.y ?? entity.cy ?? 0;
      const r = entity.r ?? entity.radius ?? 0;
      return `  <circle cx="${cx}" cy="${cy}" r="${r}" ${GEO_ATTRS} />`;
    }

    case 'ellipse': {
      const cx = entity.cx ?? 0;
      const cy = entity.cy ?? 0;
      const rx = entity.rx ?? entity.radius ?? 0;
      const ry = entity.ry ?? entity.radius ?? 0;
      const rot = entity.rotation ?? 0;
      const transform = rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : '';
      return `  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${transform} ${GEO_ATTRS} />`;
    }

    case 'polyline': {
      if (!entity.points?.length) return '';
      const pts = entity.points.map((p) => `${p.x},${p.y}`).join(' ');
      const tag = entity.closed ? 'polygon' : 'polyline';
      return `  <${tag} points="${pts}" ${GEO_ATTRS} />`;
    }

    case 'arc': {
      if (!entity.start || !entity.end) return '';
      const r = Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y) / 2;
      return `  <path d="M ${entity.start.x} ${entity.start.y} A ${r} ${r} 0 0 1 ${entity.end.x} ${entity.end.y}" ${GEO_ATTRS} />`;
    }

    case 'feature':
      return featureToSvgElement(entity);

    case 'dimension':
      return dimensionToSvgElement(entity, allEntities);

    case 'angle-dimension':
      return angleDimensionToSvgElement(entity, allEntities);

    case 'text':
      return textToSvgElement(entity);

    default:
      return '';
  }
}

function computeBounds(entities) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const e of entities) {
    const pts = getPoints(e);
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 100, height: 100 };
  const margin = 20;
  return {
    x: minX - margin,
    y: minY - margin,
    width: (maxX - minX) + margin * 2,
    height: (maxY - minY) + margin * 2,
  };
}

function getPoints(entity) {
  switch (entity.type) {
    case 'line': return [{ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }];
    case 'rect': {
      if (entity.rotation) {
        const corners = getRectCorners(entity);
        return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
      }
      const x = entity.x1 ?? entity.x ?? 0;
      const y = entity.y1 ?? entity.y ?? 0;
      const w = Math.abs(entity.width ?? ((entity.x2 ?? 0) - (entity.x1 ?? 0)));
      const h = Math.abs(entity.height ?? ((entity.y2 ?? 0) - (entity.y1 ?? 0)));
      return [{ x, y }, { x: x + w, y: y + h }];
    }
    case 'circle': {
      const cx = entity.center?.x ?? entity.cx ?? 0;
      const cy = entity.center?.y ?? entity.cy ?? 0;
      const r = entity.r ?? entity.radius ?? 0;
      return [{ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r }];
    }
    case 'ellipse': {
      const cx = entity.cx ?? 0;
      const cy = entity.cy ?? 0;
      const rx = entity.rx ?? entity.radius ?? 0;
      const ry = entity.ry ?? entity.radius ?? 0;
      return [{ x: cx - rx, y: cy - ry }, { x: cx + rx, y: cy + ry }];
    }
    case 'arc': {
      const pts = [];
      if (entity.start) pts.push(entity.start);
      if (entity.end) pts.push(entity.end);
      if (entity.control) pts.push(entity.control);
      return pts;
    }
    case 'polyline': return entity.points ?? [];
    case 'feature': return getFeaturePoints(entity);
    case 'dimension': {
      const g = getDimensionGeometry({ p1: entity.p1, p2: entity.p2, subtype: entity.subtype, offset: entity.offset });
      return [entity.p1, entity.p2, { x: g.dimLine.x1, y: g.dimLine.y1 }, { x: g.dimLine.x2, y: g.dimLine.y2 }, g.textPoint];
    }
    case 'angle-dimension': {
      const pts = [];
      if (entity.vertex) pts.push(entity.vertex);
      if (entity.p1) pts.push(entity.p1);
      if (entity.p2) pts.push(entity.p2);
      return pts;
    }
    case 'text':
      return [{ x: entity.x, y: entity.y }];
    default: return [];
  }
}

function getFeaturePoints(entity) {
  if (entity.shape === 'circle') {
    const r = (entity.diameter ?? 0) / 2;
    return [{ x: entity.cx - r, y: entity.cy - r }, { x: entity.cx + r, y: entity.cy + r }];
  }
  if (entity.shape === 'ellipse') {
    const rx = entity.rx ?? 0;
    const ry = entity.ry ?? 0;
    return [{ x: entity.cx - rx, y: entity.cy - ry }, { x: entity.cx + rx, y: entity.cy + ry }];
  }
  if (entity.shape === 'polygon') {
    return entity.points ?? [];
  }
  const x = entity.x ?? 0;
  const y = entity.y ?? 0;
  return [{ x, y }, { x: x + (entity.width ?? 0), y: y + (entity.height ?? 0) }];
}

export function exportEntitiesToSvg(entities, options = {}) {
  const exportable = entities.filter((e) => EXPORTABLE_TYPES.has(e.type));
  const filtered = options.selectedOnly
    ? exportable.filter((e) => options.selectedIds?.includes(e.id))
    : exportable;

  const bounds = computeBounds(filtered);
  const elements = filtered.map((e) => entityToSvgElement(e, entities)).filter(Boolean).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${bounds.width}" height="${bounds.height}"
     viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">
  <!-- Generated by Craftsman Studio -->
${elements}
</svg>`;
}

export function downloadSvg(entities, filename = 'sketch.svg', options = {}) {
  const content = exportEntitiesToSvg(entities, options);
  downloadAsFile(content, filename, 'image/svg+xml');
}
