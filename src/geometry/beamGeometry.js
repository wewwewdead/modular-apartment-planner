import { add, subtract, scale, normalize, perpendicular, distance, midpoint } from './point';
import { columnCenter, columnOutline } from './columnGeometry';

const EPSILON = 1e-6;

function makeOutline(start, end, width) {
  const direction = normalize(subtract(end, start));
  const offset = scale(perpendicular(direction), width / 2);
  return [
    add(start, offset),
    add(end, offset),
    subtract(end, offset),
    subtract(start, offset),
  ];
}

function findColumn(columns, ref) {
  if (!ref || ref.kind !== 'column') return null;
  return (columns || []).find((column) => column.id === ref.id) || null;
}

function raySegmentIntersection(origin, direction, start, end) {
  const segment = subtract(end, start);
  const cross = direction.x * segment.y - direction.y * segment.x;
  if (Math.abs(cross) < EPSILON) return null;

  const delta = subtract(start, origin);
  const t = (delta.x * segment.y - delta.y * segment.x) / cross;
  const u = (delta.x * direction.y - delta.y * direction.x) / cross;

  if (t < -EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;

  return {
    t,
    point: add(origin, scale(direction, Math.max(0, t))),
  };
}

function trimPoint(origin, otherPoint, column) {
  if (!column) return { ...origin };

  const direction = normalize(subtract(otherPoint, origin));
  if (Math.abs(direction.x) < EPSILON && Math.abs(direction.y) < EPSILON) {
    return { ...origin };
  }

  const polygon = columnOutline(column);
  let best = null;

  for (let i = 0; i < polygon.length; i += 1) {
    const hit = raySegmentIntersection(origin, direction, polygon[i], polygon[(i + 1) % polygon.length]);
    if (!hit) continue;
    if (!best || hit.t < best.t) {
      best = hit;
    }
  }

  return best ? best.point : { ...origin };
}

function resolveRefPosition(ref, columns) {
  if (!ref) return null;
  if (ref.kind === 'point') {
    return { point: { x: ref.x, y: ref.y }, column: null };
  }
  const column = findColumn(columns, ref);
  if (!column) return null;
  return { point: columnCenter(column), column };
}

export function resolveBeamColumns(beam, columns = []) {
  return {
    startColumn: findColumn(columns, beam.startRef),
    endColumn: findColumn(columns, beam.endRef),
  };
}

export function resolveBeamAxis(beam, columns = []) {
  const startResolved = resolveRefPosition(beam.startRef, columns);
  const endResolved = resolveRefPosition(beam.endRef, columns);
  if (!startResolved || !endResolved) return null;

  // Prevent zero-length beams (same column)
  if (startResolved.column && endResolved.column
    && startResolved.column.id === endResolved.column.id) return null;

  return {
    startColumn: startResolved.column,
    endColumn: endResolved.column,
    startCenter: startResolved.point,
    endCenter: endResolved.point,
  };
}

export function getBeamRenderData(beam, columns = []) {
  const axis = resolveBeamAxis(beam, columns);
  if (!axis) return null;

  const start = trimPoint(axis.startCenter, axis.endCenter, axis.startColumn);
  const end = trimPoint(axis.endCenter, axis.startCenter, axis.endColumn);
  const outline = makeOutline(start, end, beam.width);

  return {
    beam,
    start,
    end,
    outline,
    midpoint: midpoint(start, end),
    length: distance(start, end),
    startColumn: axis.startColumn,
    endColumn: axis.endColumn,
  };
}

export function beamLength(beam, columns = []) {
  return getBeamRenderData(beam, columns)?.length || 0;
}
