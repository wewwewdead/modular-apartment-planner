/**
 * DXF R13/R14 (AC1014) export — pure string generation, no dependencies.
 * Produces valid DXF files with millimeter units for CNC/laser cutters.
 */

import { downloadAsFile } from '../../utils/bomExportUtils';

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
1
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
  const r = entity.radius ?? 0;

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

function entityToDxf(entity) {
  switch (entity.type) {
    case 'line': return dxfLine(entity);
    case 'rect': return dxfRect(entity);
    case 'circle': return dxfCircle(entity);
    case 'arc': return dxfArc(entity);
    case 'polyline': return dxfPolyline(entity);
    case 'ellipse': return dxfEllipse(entity);
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
      const x = entity.x1 ?? entity.x ?? 0;
      const y = entity.y1 ?? entity.y ?? 0;
      const w = Math.abs(entity.width ?? (entity.x2 - entity.x1) ?? 0);
      const h = Math.abs(entity.height ?? (entity.y2 - entity.y1) ?? 0);
      return [{ x, y }, { x: x + w, y: y + h }];
    }
    case 'circle': {
      const cx = entity.center?.x ?? entity.cx ?? 0;
      const cy = entity.center?.y ?? entity.cy ?? 0;
      const r = entity.radius ?? 0;
      return [{ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r }];
    }
    case 'polyline': return entity.points ?? [];
    default: return [];
  }
}

const EXPORTABLE_TYPES = new Set(['line', 'rect', 'circle', 'arc', 'polyline', 'ellipse']);

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
      const r = (entity.radius ?? 0) + half;
      return { ...entity, radius: r };
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
    dxf += entityToDxf(entity);
  }

  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
}

export function downloadDxf(entities, filename = 'sketch.dxf', options = {}) {
  const content = exportEntitiesToDxf(entities, options);
  downloadAsFile(content, filename, 'application/dxf');
}
