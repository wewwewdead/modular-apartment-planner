/**
 * DXF R13/R14 (AC1014) export — pure string generation, no dependencies.
 * Produces valid DXF files with millimeter units for CNC/laser cutters.
 * Includes dimensions and text labels on separate layers.
 */

import { downloadAsFile } from '../../utils/bomExportUtils';
import { getRectCorners, resolveSourceReferenceFromEntities } from '../../utils/entityUtils';
import { getDimensionGeometry, measureDistance, formatDimensionText } from '../../utils/dimensionUtils';
import { getAngleDimensionGeometry, formatAngleText } from '../../utils/angleUtils';

function dxfHeader(extMin, extMax) {
  return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1014
9
$INSUNITS
70
4
9
$EXTMIN
10
${extMin.x}
20
${extMin.y}
9
$EXTMAX
10
${extMax.x}
20
${extMax.y}
0
ENDSEC
`;
}

function dxfTables() {
  return `0
SECTION
2
TABLES
0
TABLE
2
LTYPE
70
1
0
LTYPE
2
CONTINUOUS
70
0
3
Solid line
72
65
73
0
40
0.0
0
ENDTAB
0
TABLE
2
LAYER
70
3
0
LAYER
2
0
70
0
62
7
6
CONTINUOUS
0
LAYER
2
DIMENSIONS
70
0
62
8
6
CONTINUOUS
0
LAYER
2
TEXT
70
0
62
7
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
`;
}

function dxfLine(entity) {
  return `0
LINE
8
0
10
${entity.x1}
20
${-entity.y1}
11
${entity.x2}
21
${-entity.y2}
`;
}

function dxfRect(entity) {
  const rotation = entity.rotation ?? 0;
  if (rotation) {
    const corners = getRectCorners(entity);
    const pts = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
    let out = `0
LWPOLYLINE
8
0
90
4
70
1
`;
    for (const p of pts) {
      out += `10
${p.x}
20
${-p.y}
`;
    }
    return out;
  }

  const x = Math.min(entity.x1 ?? entity.x, entity.x2 ?? (entity.x + entity.width));
  const y = Math.min(entity.y1 ?? entity.y, entity.y2 ?? (entity.y + entity.height));
  const w = Math.abs(entity.width ?? (entity.x2 - entity.x1));
  const h = Math.abs(entity.height ?? (entity.y2 - entity.y1));

  return `0
LWPOLYLINE
8
0
90
4
70
1
10
${x}
20
${-y}
10
${x + w}
20
${-y}
10
${x + w}
20
${-(y + h)}
10
${x}
20
${-(y + h)}
`;
}

function dxfCircle(entity) {
  const cx = entity.center?.x ?? entity.cx ?? 0;
  const cy = entity.center?.y ?? entity.cy ?? 0;
  const r = entity.r ?? entity.radius ?? 0;

  return `0
CIRCLE
8
0
10
${cx}
20
${-cy}
40
${r}
`;
}

function dxfArc(entity) {
  if (!entity.start || !entity.end || !entity.control) return '';

  const cx = (entity.start.x + entity.end.x) / 2;
  const cy = (entity.start.y + entity.end.y) / 2;
  const r = Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y) / 2;

  const startAngle = Math.atan2(-(entity.start.y - cy), entity.start.x - cx) * (180 / Math.PI);
  const endAngle = Math.atan2(-(entity.end.y - cy), entity.end.x - cx) * (180 / Math.PI);

  return `0
ARC
8
0
10
${cx}
20
${-cy}
40
${r}
50
${startAngle}
51
${endAngle}
`;
}

function dxfPolyline(entity) {
  if (!entity.points?.length) return '';

  const closed = entity.closed ? 1 : 0;
  let out = `0
LWPOLYLINE
8
0
90
${entity.points.length}
70
${closed}
`;
  for (const p of entity.points) {
    out += `10
${p.x}
20
${-p.y}
`;
  }
  return out;
}

function dxfEllipse(entity) {
  const cx = entity.cx ?? 0;
  const cy = entity.cy ?? 0;
  const rx = entity.rx ?? entity.radius ?? 0;
  const ry = entity.ry ?? entity.radius ?? 0;

  return `0
ELLIPSE
8
0
10
${cx}
20
${-cy}
11
${rx}
21
0
40
${ry / rx}
41
0
42
${Math.PI * 2}
`;
}

function dxfFeature(entity) {
  if (entity.shape === 'circle') {
    const r = (entity.diameter ?? 0) / 2;
    return `0
CIRCLE
8
0
10
${entity.cx}
20
${-entity.cy}
40
${r}
`;
  }

  if (entity.shape === 'polygon' && entity.points?.length) {
    let out = `0
LWPOLYLINE
8
0
90
${entity.points.length}
70
1
`;
    for (const p of entity.points) {
      out += `10
${p.x}
20
${-p.y}
`;
    }
    return out;
  }

  // default rect
  const x = entity.x ?? 0;
  const y = entity.y ?? 0;
  const w = entity.width ?? 0;
  const h = entity.height ?? 0;
  return `0
LWPOLYLINE
8
0
90
4
70
1
10
${x}
20
${-y}
10
${x + w}
20
${-y}
10
${x + w}
20
${-(y + h)}
10
${x}
20
${-(y + h)}
`;
}

function dxfDimLineSegment(line) {
  return `0
LINE
8
DIMENSIONS
10
${line.x1}
20
${-line.y1}
11
${line.x2}
21
${-line.y2}
`;
}

function dxfText(x, y, height, text, layer = 'TEXT', rotation = 0) {
  let out = `0
TEXT
8
${layer}
10
${x}
20
${-y}
40
${height}
1
${text}
`;
  if (rotation) {
    out += `50
${rotation}
`;
  }
  return out;
}

function dxfDimension(entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  const p1 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[0], entity.p1);
  const p2 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[1], entity.p2);
  if (!p1 || !p2) return '';

  const geometry = getDimensionGeometry({ p1, p2, subtype: entity.subtype, offset: entity.offset });
  const text = formatDimensionText(measureDistance(p1, p2, entity.subtype), entity.units);

  let out = '';
  out += dxfDimLineSegment(geometry.ext1);
  out += dxfDimLineSegment(geometry.ext2);
  out += dxfDimLineSegment(geometry.dimLine);
  out += dxfDimLineSegment(geometry.tick1);
  out += dxfDimLineSegment(geometry.tick2);
  out += dxfText(geometry.textPoint.x, geometry.textPoint.y, 8, text, 'DIMENSIONS', geometry.textAngle);
  return out;
}

function dxfAngleDimension(entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  const vertex = resolveSourceReferenceFromEntities(allEntities, sourceRefs[1], entity.vertex);
  const p1 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[0], entity.p1);
  const p2 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[2], entity.p2);
  if (!vertex || !p1 || !p2) return '';

  const geometry = getAngleDimensionGeometry({ vertex, p1, p2, arcRadius: entity.arcRadius, isometricPlane: entity.isometricPlane });
  const text = formatAngleText(geometry.angleDeg);

  let out = '';
  out += dxfDimLineSegment(geometry.ray1);
  out += dxfDimLineSegment(geometry.ray2);
  // Approximate arc with line segments from the sampled points
  const samples = geometry.arcSamples ?? [];
  for (let i = 0; i < samples.length - 1; i++) {
    out += dxfDimLineSegment({ x1: samples[i].x, y1: samples[i].y, x2: samples[i + 1].x, y2: samples[i + 1].y });
  }
  out += dxfText(geometry.textPoint.x, geometry.textPoint.y, 8, text, 'DIMENSIONS');
  return out;
}

function dxfTextEntity(entity) {
  const rotation = entity.rotation ?? 0;
  return dxfText(entity.x, entity.y, entity.fontSize ?? 10, entity.text, 'TEXT', rotation);
}

function entityToDxf(entity, allEntities) {
  switch (entity.type) {
    case 'line': return dxfLine(entity);
    case 'rect': return dxfRect(entity);
    case 'circle': return dxfCircle(entity);
    case 'arc': return dxfArc(entity);
    case 'polyline': return dxfPolyline(entity);
    case 'ellipse': return dxfEllipse(entity);
    case 'feature': return dxfFeature(entity);
    case 'dimension': return dxfDimension(entity, allEntities);
    case 'angle-dimension': return dxfAngleDimension(entity, allEntities);
    case 'text': return dxfTextEntity(entity);
    default: return '';
  }
}

function computeExtents(entities) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const e of entities) {
    const points = getEntityPoints(e);
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!Number.isFinite(minX)) return { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } };
  return { min: { x: minX, y: -maxY }, max: { x: maxX, y: -minY } };
}

function getEntityPoints(entity) {
  switch (entity.type) {
    case 'line': return [{ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }];
    case 'rect': {
      if (entity.rotation) {
        const corners = getRectCorners(entity);
        return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
      }
      const x = entity.x1 ?? entity.x ?? 0;
      const y = entity.y1 ?? entity.y ?? 0;
      const w = Math.abs(entity.width ?? (entity.x2 - entity.x1) ?? 0);
      const h = Math.abs(entity.height ?? (entity.y2 - entity.y1) ?? 0);
      return [{ x, y }, { x: x + w, y: y + h }];
    }
    case 'circle': {
      const cx = entity.center?.x ?? entity.cx ?? 0;
      const cy = entity.center?.y ?? entity.cy ?? 0;
      const r = entity.r ?? entity.radius ?? 0;
      return [{ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r }];
    }
    case 'polyline': return entity.points ?? [];
    case 'dimension': {
      const pts = [];
      if (entity.p1) pts.push(entity.p1);
      if (entity.p2) pts.push(entity.p2);
      return pts;
    }
    case 'angle-dimension': {
      const pts = [];
      if (entity.vertex) pts.push(entity.vertex);
      if (entity.p1) pts.push(entity.p1);
      if (entity.p2) pts.push(entity.p2);
      return pts;
    }
    case 'text': return [{ x: entity.x, y: entity.y }];
    default: return [];
  }
}

const EXPORTABLE_TYPES = new Set([
  'line', 'rect', 'circle', 'arc', 'polyline', 'ellipse', 'feature',
  'dimension', 'angle-dimension', 'text',
]);

function applyKerfToEntity(entity, kerf) {
  if (!kerf || kerf <= 0) return entity;
  const half = kerf / 2;

  switch (entity.type) {
    case 'rect': {
      const x = entity.x1 ?? entity.x ?? 0;
      const y = entity.y1 ?? entity.y ?? 0;
      const w = Math.abs(entity.width ?? ((entity.x2 ?? 0) - (entity.x1 ?? 0)));
      const h = Math.abs(entity.height ?? ((entity.y2 ?? 0) - (entity.y1 ?? 0)));
      return { ...entity, x1: x - half, y1: y - half, x2: x + w + half, y2: y + h + half, width: w + kerf, height: h + kerf };
    }
    case 'circle': {
      const r = (entity.r ?? entity.radius ?? 0) + half;
      return { ...entity, r, radius: r };
    }
    case 'polyline': {
      if (!entity.points?.length || !entity.closed) return entity;
      const pts = entity.points;
      const n = pts.length;
      const expanded = pts.map((p, i) => {
        const prev = pts[(i - 1 + n) % n];
        const next = pts[(i + 1) % n];
        const nx = -((next.y - prev.y));
        const ny = (next.x - prev.x);
        const len = Math.hypot(nx, ny) || 1;
        return { x: p.x + (nx / len) * half, y: p.y + (ny / len) * half };
      });
      return { ...entity, points: expanded };
    }
    default:
      return entity;
  }
}

export function exportEntitiesToDxf(entities, options = {}) {
  const exportable = entities.filter((e) => EXPORTABLE_TYPES.has(e.type));
  const filtered = options.selectedOnly
    ? exportable.filter((e) => options.selectedIds?.includes(e.id))
    : exportable;

  const kerf = options.kerf ?? 0;
  const kerfAdjusted = kerf > 0 ? filtered.map((e) => applyKerfToEntity(e, kerf)) : filtered;

  const extents = computeExtents(kerfAdjusted);
  let dxf = dxfHeader(extents.min, extents.max);
  dxf += dxfTables();
  dxf += `0\nSECTION\n2\nENTITIES\n`;

  for (const entity of kerfAdjusted) {
    dxf += entityToDxf(entity, entities);
  }

  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
}

export function downloadDxf(entities, filename = 'sketch.dxf', options = {}) {
  const content = exportEntitiesToDxf(entities, options);
  downloadAsFile(content, filename, 'application/dxf');
}
