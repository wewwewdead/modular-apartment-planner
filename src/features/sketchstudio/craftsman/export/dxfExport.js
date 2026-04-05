/**
 * DXF R14 (AC1014) export.
 * Pure string generation lives in exportEntitiesToDxf; browser download stays in downloadDxf.
 */

import { getAngleDimensionGeometry, formatAngleText } from '../../utils/angleUtils';
import { getArcMidpoint, getArcSamplePoints, solveThreePointCircle } from '../../utils/arcUtils';
import { computeEntityBoundingBox } from '../../utils/bboxUtils';
import { getDimensionGeometry, measureDistance, formatDimensionText } from '../../utils/dimensionUtils';
import { getRectCorners, resolveSourceReferenceFromEntities } from '../../utils/entityUtils';
import { getTextLeaderGeometry } from '../../utils/textLeaderUtils';
import { downloadAsFile } from '../../utils/bomExportUtils';
import { createDxfWriter } from './dxfWriter';

const DEFAULT_EXTENTS = {
  min: { x: 0, y: 0 },
  max: { x: 100, y: 100 },
};

const DXF_LAYERS = [
  { name: '0', color: 7 },
  { name: 'DIMENSIONS', color: 8 },
  { name: 'TEXT', color: 7 },
];

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

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Object.is(numeric, -0) ? 0 : numeric;
}

function toDxfPoint(point) {
  return {
    x: toNumber(point?.x),
    y: toNumber(-toNumber(point?.y)),
  };
}

function getEntityLayer(entity) {
  if (entity.type === 'dimension' || entity.type === 'angle-dimension') {
    return 'DIMENSIONS';
  }

  if (entity.type === 'text') {
    return 'TEXT';
  }

  return '0';
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

function writeHeader(writer, extents) {
  writer.section('HEADER', (section) => {
    section.pair(9, '$ACADVER');
    section.pair(1, 'AC1014');
    section.pair(9, '$INSUNITS');
    section.pair(70, 4);
    section.pair(9, '$EXTMIN');
    section.pair(10, extents.min.x);
    section.pair(20, extents.min.y);
    section.pair(9, '$EXTMAX');
    section.pair(10, extents.max.x);
    section.pair(20, extents.max.y);
  });
}

function writeTables(writer) {
  writer.section('TABLES', (section) => {
    section.table('LTYPE', (table) => {
      table.pair(70, 1);
      table.pair(0, 'LTYPE');
      table.pair(2, 'CONTINUOUS');
      table.pair(70, 0);
      table.pair(3, 'Solid line');
      table.pair(72, 65);
      table.pair(73, 0);
      table.pair(40, 0);
    });

    section.table('LAYER', (table) => {
      table.pair(70, DXF_LAYERS.length);
      DXF_LAYERS.forEach((layer) => {
        table.pair(0, 'LAYER');
        table.pair(2, layer.name);
        table.pair(70, 0);
        table.pair(62, layer.color);
        table.pair(6, 'CONTINUOUS');
      });
    });
  });
}

function writeLineEntity(writer, startPoint, endPoint, layer = '0') {
  const start = toDxfPoint(startPoint);
  const end = toDxfPoint(endPoint);

  writer.pair(0, 'LINE');
  writer.pair(8, layer);
  writer.pair(10, start.x);
  writer.pair(20, start.y);
  writer.pair(11, end.x);
  writer.pair(21, end.y);
}

function writePolylineEntity(writer, points, closed = false, layer = '0') {
  if (!points?.length) {
    return;
  }

  writer.pair(0, 'LWPOLYLINE');
  writer.pair(8, layer);
  writer.pair(90, points.length);
  writer.pair(70, closed ? 1 : 0);

  points.forEach((point) => {
    const dxfPoint = toDxfPoint(point);
    writer.pair(10, dxfPoint.x);
    writer.pair(20, dxfPoint.y);
  });
}

function writeCircleEntity(writer, entity, layer = '0') {
  const cx = toNumber(entity.center?.x ?? entity.cx);
  const cy = toNumber(entity.center?.y ?? entity.cy);
  const radius = toNumber(entity.r ?? entity.radius);

  writer.pair(0, 'CIRCLE');
  writer.pair(8, layer);
  writer.pair(10, cx);
  writer.pair(20, -cy);
  writer.pair(40, radius);
}

function normalizeAngle(angle) {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function getAngleDelta(startAngle, endAngle) {
  return (endAngle - startAngle + 360) % 360;
}

function isAngleOnCounterClockwiseArc(startAngle, endAngle, testAngle) {
  return getAngleDelta(startAngle, testAngle) <= getAngleDelta(startAngle, endAngle) + 1e-6;
}

function getDxfArcGeometry(entity) {
  if (!entity?.start || !entity?.end || !entity?.control) {
    return null;
  }

  const start = toDxfPoint(entity.start);
  const midpoint = toDxfPoint(getArcMidpoint(entity));
  const end = toDxfPoint(entity.end);
  const circle = solveThreePointCircle(start, midpoint, end);
  if (!circle) {
    return null;
  }

  const { center, radius } = circle;
  const startAngle = normalizeAngle(Math.atan2(start.y - center.y, start.x - center.x) * (180 / Math.PI));
  const midAngle = normalizeAngle(Math.atan2(midpoint.y - center.y, midpoint.x - center.x) * (180 / Math.PI));
  const endAngle = normalizeAngle(Math.atan2(end.y - center.y, end.x - center.x) * (180 / Math.PI));

  if (isAngleOnCounterClockwiseArc(startAngle, endAngle, midAngle)) {
    return { center, radius, startAngle, endAngle };
  }

  return {
    center,
    radius,
    startAngle: endAngle,
    endAngle: startAngle,
  };
}

function writeArcEntity(writer, entity, layer = '0') {
  const geometry = getDxfArcGeometry(entity);
  if (!geometry) {
    const samples = getArcSamplePoints(entity, 12);
    for (let index = 0; index < samples.length - 1; index += 1) {
      writeLineEntity(writer, samples[index], samples[index + 1], layer);
    }
    return;
  }

  writer.pair(0, 'ARC');
  writer.pair(8, layer);
  writer.pair(10, geometry.center.x);
  writer.pair(20, geometry.center.y);
  writer.pair(40, geometry.radius);
  writer.pair(50, geometry.startAngle);
  writer.pair(51, geometry.endAngle);
}

function writeEllipseEntity(writer, entity, layer = '0') {
  const cx = toNumber(entity.cx);
  const cy = toNumber(entity.cy);
  const rx = toNumber(entity.rx ?? entity.radius);
  const ry = toNumber(entity.ry ?? entity.radius);
  if (!rx || !ry) {
    return;
  }

  const rotation = (toNumber(entity.rotation) * Math.PI) / 180;
  const majorRadius = Math.max(rx, ry);
  const minorRadius = Math.min(rx, ry);
  const majorAxisRotation = rotation + (ry > rx ? Math.PI / 2 : 0);

  writer.pair(0, 'ELLIPSE');
  writer.pair(8, layer);
  writer.pair(10, cx);
  writer.pair(20, -cy);
  writer.pair(11, Math.cos(majorAxisRotation) * majorRadius);
  writer.pair(21, -Math.sin(majorAxisRotation) * majorRadius);
  writer.pair(40, minorRadius / majorRadius);
  writer.pair(41, 0);
  writer.pair(42, Math.PI * 2);
}

function writeFeatureEntity(writer, entity, layer = '0') {
  if (entity.shape === 'circle') {
    writeCircleEntity(writer, {
      cx: entity.cx,
      cy: entity.cy,
      r: toNumber(entity.diameter) / 2,
    }, layer);
    return;
  }

  if (entity.shape === 'ellipse') {
    writeEllipseEntity(writer, entity, layer);
    return;
  }

  if (entity.shape === 'polygon' && entity.points?.length) {
    writePolylineEntity(writer, entity.points, true, layer);
    return;
  }

  const x = toNumber(entity.x);
  const y = toNumber(entity.y);
  const width = toNumber(entity.width);
  const height = toNumber(entity.height);
  writePolylineEntity(writer, [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ], true, layer);
}

function writeDimensionEntity(writer, entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  const p1 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[0], entity.p1);
  const p2 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[1], entity.p2);
  if (!p1 || !p2) {
    return;
  }

  const geometry = getDimensionGeometry({
    p1,
    p2,
    subtype: entity.subtype,
    offset: entity.offset,
  });
  const text = formatDimensionText(measureDistance(p1, p2, entity.subtype), entity.units);

  writeLineEntity(writer, { x: geometry.ext1.x1, y: geometry.ext1.y1 }, { x: geometry.ext1.x2, y: geometry.ext1.y2 }, 'DIMENSIONS');
  writeLineEntity(writer, { x: geometry.ext2.x1, y: geometry.ext2.y1 }, { x: geometry.ext2.x2, y: geometry.ext2.y2 }, 'DIMENSIONS');
  writeLineEntity(writer, { x: geometry.dimLine.x1, y: geometry.dimLine.y1 }, { x: geometry.dimLine.x2, y: geometry.dimLine.y2 }, 'DIMENSIONS');
  writeLineEntity(writer, { x: geometry.tick1.x1, y: geometry.tick1.y1 }, { x: geometry.tick1.x2, y: geometry.tick1.y2 }, 'DIMENSIONS');
  writeLineEntity(writer, { x: geometry.tick2.x1, y: geometry.tick2.y1 }, { x: geometry.tick2.x2, y: geometry.tick2.y2 }, 'DIMENSIONS');
  writeTextEntity(writer, {
    x: geometry.textPoint.x,
    y: geometry.textPoint.y,
    fontSize: 8,
    text,
    rotation: geometry.textAngle,
  }, 'DIMENSIONS');
}

function writeAngleDimensionEntity(writer, entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  const vertex = resolveSourceReferenceFromEntities(allEntities, sourceRefs[1], entity.vertex);
  const p1 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[0], entity.p1);
  const p2 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[2], entity.p2);
  if (!vertex || !p1 || !p2) {
    return;
  }

  const geometry = getAngleDimensionGeometry({
    vertex,
    p1,
    p2,
    arcRadius: entity.arcRadius,
    isometricPlane: entity.isometricPlane,
  });
  const text = formatAngleText(geometry.angleDeg);

  writeLineEntity(writer, { x: geometry.ray1.x1, y: geometry.ray1.y1 }, { x: geometry.ray1.x2, y: geometry.ray1.y2 }, 'DIMENSIONS');
  writeLineEntity(writer, { x: geometry.ray2.x1, y: geometry.ray2.y1 }, { x: geometry.ray2.x2, y: geometry.ray2.y2 }, 'DIMENSIONS');

  const samples = geometry.arcSamples ?? [];
  for (let index = 0; index < samples.length - 1; index += 1) {
    writeLineEntity(writer, samples[index], samples[index + 1], 'DIMENSIONS');
  }

  writeTextEntity(writer, {
    x: geometry.textPoint.x,
    y: geometry.textPoint.y,
    fontSize: 8,
    text,
  }, 'DIMENSIONS');
}

function writeTextEntity(writer, entity, layer = 'TEXT') {
  const leaderGeometry = getTextLeaderGeometry(entity);

  if (leaderGeometry) {
    writeLineEntity(writer, leaderGeometry.anchor, leaderGeometry.shaftEnd, layer);
    writePolylineEntity(writer, leaderGeometry.arrowHead, true, layer);
  }

  writer.pair(0, 'TEXT');
  writer.pair(8, layer);
  writer.pair(10, toNumber(entity.x));
  writer.pair(20, -toNumber(entity.y));
  writer.pair(40, toNumber(entity.fontSize, 10));
  writer.pair(1, entity.text ?? '');
  if (entity.rotation) {
    writer.pair(50, toNumber(entity.rotation));
  }
}

function writeRectEntity(writer, entity, layer = '0') {
  if (entity.rotation) {
    const corners = getRectCorners(entity);
    writePolylineEntity(writer, [
      corners.topLeft,
      corners.topRight,
      corners.bottomRight,
      corners.bottomLeft,
    ], true, layer);
    return;
  }

  const x = Math.min(toNumber(entity.x1 ?? entity.x), toNumber(entity.x2 ?? (toNumber(entity.x) + toNumber(entity.width))));
  const y = Math.min(toNumber(entity.y1 ?? entity.y), toNumber(entity.y2 ?? (toNumber(entity.y) + toNumber(entity.height))));
  const width = Math.abs(toNumber(entity.width ?? (toNumber(entity.x2) - toNumber(entity.x1))));
  const height = Math.abs(toNumber(entity.height ?? (toNumber(entity.y2) - toNumber(entity.y1))));
  writePolylineEntity(writer, [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ], true, layer);
}

function writeEntity(writer, entity, allEntities) {
  const layer = getEntityLayer(entity);

  switch (entity.type) {
    case 'line':
      writeLineEntity(writer, { x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }, layer);
      return;
    case 'rect':
      writeRectEntity(writer, entity, layer);
      return;
    case 'circle':
      writeCircleEntity(writer, entity, layer);
      return;
    case 'arc':
      writeArcEntity(writer, entity, layer);
      return;
    case 'polyline':
      writePolylineEntity(writer, entity.points, entity.closed, layer);
      return;
    case 'ellipse':
      writeEllipseEntity(writer, entity, layer);
      return;
    case 'feature':
      writeFeatureEntity(writer, entity, layer);
      return;
    case 'dimension':
      writeDimensionEntity(writer, entity, allEntities);
      return;
    case 'angle-dimension':
      writeAngleDimensionEntity(writer, entity, allEntities);
      return;
    case 'text':
      writeTextEntity(writer, entity, layer);
      return;
    default:
      break;
  }
}

function computeExtents(entities) {
  const boxes = entities
    .map((entity) => computeEntityBoundingBox(entity, entities))
    .filter(Boolean);

  if (!boxes.length) {
    return DEFAULT_EXTENTS;
  }

  const minX = Math.min(...boxes.map((box) => box.minX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const maxY = Math.max(...boxes.map((box) => box.maxY));

  return {
    min: { x: minX, y: -maxY },
    max: { x: maxX, y: -minY },
  };
}

function applyKerfToEntity(entity, kerf) {
  if (!kerf || kerf <= 0) {
    return entity;
  }

  const halfKerf = kerf / 2;

  switch (entity.type) {
    case 'rect': {
      const x = toNumber(entity.x1 ?? entity.x);
      const y = toNumber(entity.y1 ?? entity.y);
      const width = Math.abs(toNumber(entity.width ?? (toNumber(entity.x2) - toNumber(entity.x1))));
      const height = Math.abs(toNumber(entity.height ?? (toNumber(entity.y2) - toNumber(entity.y1))));
      return {
        ...entity,
        x1: x - halfKerf,
        y1: y - halfKerf,
        x2: x + width + halfKerf,
        y2: y + height + halfKerf,
        width: width + kerf,
        height: height + kerf,
      };
    }
    case 'circle': {
      const radius = toNumber(entity.r ?? entity.radius) + halfKerf;
      return {
        ...entity,
        r: radius,
        radius,
      };
    }
    case 'polyline': {
      if (!entity.points?.length || !entity.closed) {
        return entity;
      }

      const expandedPoints = entity.points.map((point, index, points) => {
        const previous = points[(index - 1 + points.length) % points.length];
        const next = points[(index + 1) % points.length];
        const normalX = -(next.y - previous.y);
        const normalY = next.x - previous.x;
        const length = Math.hypot(normalX, normalY) || 1;
        return {
          x: point.x + (normalX / length) * halfKerf,
          y: point.y + (normalY / length) * halfKerf,
        };
      });

      return {
        ...entity,
        points: expandedPoints,
      };
    }
    default:
      return entity;
  }
}

function getExportEntities(entities, options = {}) {
  const exportable = entities.filter(
    (entity) => EXPORTABLE_TYPES.has(entity.type) && !isEntityHiddenFromManufacturing(entity),
  );
  const filtered = options.selectedOnly
    ? exportable.filter((entity) => isEntitySelectedForExport(entity, options.selectedIds || []))
    : exportable;
  const kerf = toNumber(options.kerf);
  return kerf > 0 ? filtered.map((entity) => applyKerfToEntity(entity, kerf)) : filtered;
}

export function exportEntitiesToDxf(entities, options = {}) {
  const exportEntities = getExportEntities(entities, options);
  const referenceEntities = options.referenceEntities || entities;
  const writer = createDxfWriter();

  writeHeader(writer, computeExtents(exportEntities));
  writeTables(writer);
  writer.section('ENTITIES', (section) => {
    exportEntities.forEach((entity) => writeEntity(section, entity, referenceEntities));
  });
  writer.pair(0, 'EOF');

  return writer.toString();
}

export function downloadDxf(entities, filename = 'sketch.dxf', options = {}) {
  const content = exportEntitiesToDxf(entities, options);
  downloadAsFile(content, filename, 'application/dxf');
}
