/**
 * Standalone SVG export with millimeter dimensions.
 * Pure geometry/document generation lives in buildSvgExportDocument/exportEntitiesToSvg.
 */

import { getAngleDimensionGeometry, formatAngleText } from '../../utils/angleUtils';
import { getArcPath } from '../../utils/arcUtils';
import { computeEntityBoundingBox } from '../../utils/bboxUtils';
import { getDimensionGeometry, measureDistance, formatDimensionText } from '../../utils/dimensionUtils';
import { getRectCorners, resolveSourceReferenceFromEntities } from '../../utils/entityUtils';
import { getTextLeaderGeometry } from '../../utils/textLeaderUtils';
import { downloadAsFile } from '../../utils/bomExportUtils';

const EXPORTABLE_TYPES = new Set([
  'line',
  'rect',
  'circle',
  'arc',
  'polyline',
  'ellipse',
  'feature',
  'dimension',
  'angle-dimension',
  'text',
]);

const GEO_ATTRS = 'stroke="black" stroke-width="0.5" fill="none"';
const DIM_ATTRS = 'stroke="#666" stroke-width="0.3" fill="none"';
const DIM_FONT = 'font-size="10" font-family="sans-serif" fill="#666"';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isEntityHiddenFromManufacturing(entity) {
  return entity?.meta?.manufacturingHidden === true;
}

function isEntitySelectedForExport(entity, selectedIds = []) {
  if (selectedIds.includes(entity.id)) {
    return true;
  }

  return (entity.meta?.manufacturingSourceEntityIds || []).some((entityId) => selectedIds.includes(entityId));
}

function getExportEntities(entities, options = {}) {
  const exportable = entities.filter(
    (entity) => EXPORTABLE_TYPES.has(entity.type) && !isEntityHiddenFromManufacturing(entity),
  );
  return options.selectedOnly
    ? exportable.filter((entity) => isEntitySelectedForExport(entity, options.selectedIds || []))
    : exportable;
}

function getPointsBounds(points) {
  if (!points?.length) {
    return null;
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function getDimensionBounds(entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  const p1 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[0], entity.p1);
  const p2 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[1], entity.p2);
  if (!p1 || !p2) {
    return null;
  }

  const geometry = getDimensionGeometry({
    p1,
    p2,
    subtype: entity.subtype,
    offset: entity.offset,
  });

  return getPointsBounds([
    { x: geometry.ext1.x1, y: geometry.ext1.y1 },
    { x: geometry.ext1.x2, y: geometry.ext1.y2 },
    { x: geometry.ext2.x1, y: geometry.ext2.y1 },
    { x: geometry.ext2.x2, y: geometry.ext2.y2 },
    { x: geometry.dimLine.x1, y: geometry.dimLine.y1 },
    { x: geometry.dimLine.x2, y: geometry.dimLine.y2 },
    { x: geometry.tick1.x1, y: geometry.tick1.y1 },
    { x: geometry.tick1.x2, y: geometry.tick1.y2 },
    { x: geometry.tick2.x1, y: geometry.tick2.y1 },
    { x: geometry.tick2.x2, y: geometry.tick2.y2 },
    geometry.textPoint,
  ]);
}

function getAngleDimensionBounds(entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  const vertex = resolveSourceReferenceFromEntities(allEntities, sourceRefs[1], entity.vertex);
  const p1 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[0], entity.p1);
  const p2 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[2], entity.p2);
  if (!vertex || !p1 || !p2) {
    return null;
  }

  const geometry = getAngleDimensionGeometry({
    vertex,
    p1,
    p2,
    arcRadius: entity.arcRadius,
    isometricPlane: entity.isometricPlane,
  });

  return getPointsBounds([
    { x: geometry.ray1.x1, y: geometry.ray1.y1 },
    { x: geometry.ray1.x2, y: geometry.ray1.y2 },
    { x: geometry.ray2.x1, y: geometry.ray2.y1 },
    { x: geometry.ray2.x2, y: geometry.ray2.y2 },
    ...(geometry.arcSamples ?? []),
    geometry.textPoint,
  ]);
}

function getEntityBounds(entity, allEntities) {
  if (entity.type === 'dimension') {
    return getDimensionBounds(entity, allEntities);
  }

  if (entity.type === 'angle-dimension') {
    return getAngleDimensionBounds(entity, allEntities);
  }

  return computeEntityBoundingBox(entity, allEntities);
}

function computeBounds(entities, allEntities) {
  const boxes = entities
    .map((entity) => getEntityBounds(entity, allEntities))
    .filter(Boolean);

  if (!boxes.length) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  const minX = Math.min(...boxes.map((box) => box.minX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const maxY = Math.max(...boxes.map((box) => box.maxY));
  const margin = 20;

  return {
    x: minX - margin,
    y: minY - margin,
    width: (maxX - minX) + (margin * 2),
    height: (maxY - minY) + (margin * 2),
  };
}

function featureToSvgElement(entity) {
  if (entity.shape === 'circle') {
    return `  <circle cx="${entity.cx}" cy="${entity.cy}" r="${(entity.diameter ?? 0) / 2}" ${GEO_ATTRS} />`;
  }

  if (entity.shape === 'ellipse') {
    const transform = entity.rotation ? ` transform="rotate(${entity.rotation} ${entity.cx} ${entity.cy})"` : '';
    return `  <ellipse cx="${entity.cx}" cy="${entity.cy}" rx="${entity.rx}" ry="${entity.ry}"${transform} ${GEO_ATTRS} />`;
  }

  if (entity.shape === 'polygon') {
    if (!entity.points?.length) {
      return '';
    }

    return `  <polygon points="${entity.points.map((point) => `${point.x},${point.y}`).join(' ')}" ${GEO_ATTRS} />`;
  }

  return `  <rect x="${entity.x ?? 0}" y="${entity.y ?? 0}" width="${entity.width ?? 0}" height="${entity.height ?? 0}" ${GEO_ATTRS} />`;
}

function dimensionToSvgElement(entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  const p1 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[0], entity.p1);
  const p2 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[1], entity.p2);
  if (!p1 || !p2) {
    return '';
  }

  const geometry = getDimensionGeometry({
    p1,
    p2,
    subtype: entity.subtype,
    offset: entity.offset,
  });
  const text = formatDimensionText(measureDistance(p1, p2, entity.subtype), entity.units);

  return `  <g>
    <line x1="${geometry.ext1.x1}" y1="${geometry.ext1.y1}" x2="${geometry.ext1.x2}" y2="${geometry.ext1.y2}" ${DIM_ATTRS} />
    <line x1="${geometry.ext2.x1}" y1="${geometry.ext2.y1}" x2="${geometry.ext2.x2}" y2="${geometry.ext2.y2}" ${DIM_ATTRS} />
    <line x1="${geometry.dimLine.x1}" y1="${geometry.dimLine.y1}" x2="${geometry.dimLine.x2}" y2="${geometry.dimLine.y2}" ${DIM_ATTRS} />
    <line x1="${geometry.tick1.x1}" y1="${geometry.tick1.y1}" x2="${geometry.tick1.x2}" y2="${geometry.tick1.y2}" ${DIM_ATTRS} />
    <line x1="${geometry.tick2.x1}" y1="${geometry.tick2.y1}" x2="${geometry.tick2.x2}" y2="${geometry.tick2.y2}" ${DIM_ATTRS} />
    <text x="${geometry.textPoint.x}" y="${geometry.textPoint.y}" text-anchor="middle" dominant-baseline="middle" ${DIM_FONT} transform="rotate(${geometry.textAngle} ${geometry.textPoint.x} ${geometry.textPoint.y})">${escapeXml(text)}</text>
  </g>`;
}

function angleDimensionToSvgElement(entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  const vertex = resolveSourceReferenceFromEntities(allEntities, sourceRefs[1], entity.vertex);
  const p1 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[0], entity.p1);
  const p2 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[2], entity.p2);
  if (!vertex || !p1 || !p2) {
    return '';
  }

  const geometry = getAngleDimensionGeometry({
    vertex,
    p1,
    p2,
    arcRadius: entity.arcRadius,
    isometricPlane: entity.isometricPlane,
  });
  const text = formatAngleText(geometry.angleDeg);

  return `  <g>
    <line x1="${geometry.ray1.x1}" y1="${geometry.ray1.y1}" x2="${geometry.ray1.x2}" y2="${geometry.ray1.y2}" ${DIM_ATTRS} />
    <line x1="${geometry.ray2.x1}" y1="${geometry.ray2.y1}" x2="${geometry.ray2.x2}" y2="${geometry.ray2.y2}" ${DIM_ATTRS} />
    <path d="${geometry.arcPath}" ${DIM_ATTRS} />
    <text x="${geometry.textPoint.x}" y="${geometry.textPoint.y}" text-anchor="middle" dominant-baseline="middle" ${DIM_FONT}>${escapeXml(text)}</text>
  </g>`;
}

function textToSvgElement(entity) {
  const transform = entity.rotation ? ` transform="rotate(${entity.rotation} ${entity.x} ${entity.y})"` : '';
  const leaderGeometry = getTextLeaderGeometry(entity);

  if (!leaderGeometry) {
    return `  <text x="${entity.x}" y="${entity.y}" font-size="${entity.fontSize}" font-family="sans-serif" fill="black" dominant-baseline="hanging"${transform}>${escapeXml(entity.text)}</text>`;
  }

  return `  <g>
    <line x1="${leaderGeometry.anchor.x}" y1="${leaderGeometry.anchor.y}" x2="${leaderGeometry.shaftEnd.x}" y2="${leaderGeometry.shaftEnd.y}" ${GEO_ATTRS} />
    <polygon points="${leaderGeometry.arrowHead.map((point) => `${point.x},${point.y}`).join(' ')}" stroke="black" stroke-width="0.5" fill="black" />
    <text x="${entity.x}" y="${entity.y}" font-size="${entity.fontSize}" font-family="sans-serif" fill="black" dominant-baseline="hanging"${transform}>${escapeXml(entity.text)}</text>
  </g>`;
}

function entityToSvgElement(entity, allEntities) {
  switch (entity.type) {
    case 'line':
      return `  <line x1="${entity.x1}" y1="${entity.y1}" x2="${entity.x2}" y2="${entity.y2}" ${GEO_ATTRS} />`;
    case 'rect': {
      if (entity.rotation) {
        const corners = getRectCorners(entity);
        const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
          .map((point) => `${point.x},${point.y}`)
          .join(' ');
        return `  <polygon points="${points}" ${GEO_ATTRS} />`;
      }

      const x = Math.min(entity.x1 ?? entity.x ?? 0, entity.x2 ?? ((entity.x ?? 0) + (entity.width ?? 0)));
      const y = Math.min(entity.y1 ?? entity.y ?? 0, entity.y2 ?? ((entity.y ?? 0) + (entity.height ?? 0)));
      const width = Math.abs(entity.width ?? ((entity.x2 ?? 0) - (entity.x1 ?? 0)));
      const height = Math.abs(entity.height ?? ((entity.y2 ?? 0) - (entity.y1 ?? 0)));
      return `  <rect x="${x}" y="${y}" width="${width}" height="${height}" ${GEO_ATTRS} />`;
    }
    case 'circle':
      return `  <circle cx="${entity.center?.x ?? entity.cx ?? 0}" cy="${entity.center?.y ?? entity.cy ?? 0}" r="${entity.r ?? entity.radius ?? 0}" ${GEO_ATTRS} />`;
    case 'ellipse': {
      const transform = entity.rotation ? ` transform="rotate(${entity.rotation} ${entity.cx} ${entity.cy})"` : '';
      return `  <ellipse cx="${entity.cx ?? 0}" cy="${entity.cy ?? 0}" rx="${entity.rx ?? entity.radius ?? 0}" ry="${entity.ry ?? entity.radius ?? 0}"${transform} ${GEO_ATTRS} />`;
    }
    case 'polyline': {
      if (!entity.points?.length) {
        return '';
      }

      const tag = entity.closed ? 'polygon' : 'polyline';
      const points = entity.points.map((point) => `${point.x},${point.y}`).join(' ');
      return `  <${tag} points="${points}" ${GEO_ATTRS} />`;
    }
    case 'arc':
      return entity.start && entity.end && entity.control
        ? `  <path d="${getArcPath(entity)}" ${GEO_ATTRS} />`
        : '';
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

export function buildSvgExportDocument(entities, options = {}) {
  const referenceEntities = options.referenceEntities || entities;
  const exportEntities = getExportEntities(entities, options);
  const bounds = computeBounds(exportEntities, referenceEntities);
  const elements = exportEntities
    .map((entity) => entityToSvgElement(entity, referenceEntities))
    .filter(Boolean);

  return {
    bounds,
    elements,
  };
}

export function exportEntitiesToSvg(entities, options = {}) {
  const document = buildSvgExportDocument(entities, options);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${document.bounds.width}mm" height="${document.bounds.height}mm"
     viewBox="${document.bounds.x} ${document.bounds.y} ${document.bounds.width} ${document.bounds.height}">
  <!-- Generated by Craftsman Studio -->
${document.elements.join('\n')}
</svg>`;
}

export function downloadSvg(entities, filename = 'sketch.svg', options = {}) {
  const content = exportEntitiesToSvg(entities, options);
  downloadAsFile(content, filename, 'image/svg+xml');
}
