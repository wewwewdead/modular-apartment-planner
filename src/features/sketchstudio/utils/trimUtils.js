import { getQuadraticPoint, getQuadraticSubCurve } from './arcUtils';
import { createEntityId, getRectCorners } from './entityUtils';
import { ARC_FLATTEN_TOLERANCE, collectEntityIntersections } from './intersectionUtils';

/**
 * Classic CAD trim: click a portion of an entity and it is removed up to the
 * nearest intersection with the surrounding geometry, in BOTH directions.
 *
 * Everything trimmable is reduced to one of three parameterised paths:
 *
 *   polyline  u in [0, segmentCount]  — line, polyline, and rect
 *   bezier    t in [0, 1]             — arc (a quadratic Bézier)
 *   circle    a in [0, 2*PI)          — circle
 *
 * Cut parameters slice that path; the span holding the click is dropped and the
 * survivors are rebuilt as entities.
 *
 * RULES
 * -----
 * - No intersections at all: the whole entity is deleted (standard CAD).
 * - A CLOSED path (circle, closed polyline, rect) needs at least two cuts. With
 *   one cut the loop is still a loop, so there is no bounded span to remove and
 *   the entity is deleted outright — same as the zero-cut case.
 * - RECT -> POLYLINE CONVERSION triggers only when a span is actually removed,
 *   i.e. only when the rect has two or more intersections and the click lands in
 *   one of the resulting spans. Fewer cuts delete the rect (no polyline is
 *   created), and a click that never hits the rect never reaches this module, so
 *   an untouched rect stays a rect. Once trimmed the loop is open, so the
 *   remainder is emitted as an OPEN polyline through the surviving corners.
 * - A trimmed circle is emitted as arc entities. Because an `arc` is a quadratic
 *   Bézier it cannot carry more than a half turn, so a surviving span longer than
 *   90 degrees is split into equal sub-arcs of at most 90 degrees each; every
 *   sub-arc's start, midpoint, and end sit exactly on the original circle.
 */

const PARAMETER_EPSILON = 1e-7;
const MAX_ARC_SPAN = Math.PI / 2;
const BEZIER_SAMPLE_COUNT = 256;
const BEZIER_REFINE_ITERATIONS = 60;
const TWO_PI = Math.PI * 2;

export const TRIMMABLE_ENTITY_TYPES = ['line', 'polyline', 'rect', 'arc', 'circle'];

export function isTrimmableEntity(entity) {
  return TRIMMABLE_ENTITY_TYPES.includes(entity?.type);
}

function rectPathPoints(entity) {
  const corners = getRectCorners(entity);
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
}

export function buildTrimPath(entity) {
  if (entity?.type === 'line') {
    return {
      kind: 'polyline',
      points: [
        { x: entity.x1, y: entity.y1 },
        { x: entity.x2, y: entity.y2 },
      ],
      closed: false,
      source: 'line',
    };
  }

  if (entity?.type === 'polyline') {
    if (!Array.isArray(entity.points) || entity.points.length < 2) {
      return null;
    }

    return {
      kind: 'polyline',
      points: entity.points.map((point) => ({ x: point.x, y: point.y })),
      closed: entity.closed === true,
      source: 'polyline',
    };
  }

  if (entity?.type === 'rect') {
    if (!entity.width || !entity.height) {
      return null;
    }

    return { kind: 'polyline', points: rectPathPoints(entity), closed: true, source: 'rect' };
  }

  if (entity?.type === 'arc') {
    if (!entity.start || !entity.control || !entity.end) {
      return null;
    }

    return { kind: 'bezier', p0: entity.start, p1: entity.control, p2: entity.end, source: 'arc' };
  }

  if (entity?.type === 'circle') {
    if (!(entity.r > 0)) {
      return null;
    }

    return { kind: 'circle', center: { x: entity.cx, y: entity.cy }, radius: entity.r, source: 'circle' };
  }

  return null;
}

function getPathSegmentCount(path) {
  return path.closed ? path.points.length : path.points.length - 1;
}

export function getPathParameterRange(path) {
  if (path.kind === 'polyline') {
    return getPathSegmentCount(path);
  }

  if (path.kind === 'circle') {
    return TWO_PI;
  }

  return 1;
}

export function isClosedTrimPath(path) {
  return path.kind === 'circle' || (path.kind === 'polyline' && path.closed);
}

function getPolylineVertex(path, index) {
  return path.points[((index % path.points.length) + path.points.length) % path.points.length];
}

export function getPathPoint(path, parameter) {
  if (path.kind === 'polyline') {
    const range = getPathParameterRange(path);
    const clamped = path.closed ? ((parameter % range) + range) % range : Math.min(Math.max(parameter, 0), range);
    const index = Math.min(Math.floor(clamped), range - 1);
    const local = clamped - index;
    const start = getPolylineVertex(path, index);
    const end = getPolylineVertex(path, index + 1);

    return { x: start.x + (end.x - start.x) * local, y: start.y + (end.y - start.y) * local };
  }

  if (path.kind === 'circle') {
    return {
      x: path.center.x + Math.cos(parameter) * path.radius,
      y: path.center.y + Math.sin(parameter) * path.radius,
    };
  }

  return getQuadraticPoint(path.p0, path.p1, path.p2, Math.min(Math.max(parameter, 0), 1));
}

export function getPathParameter(path, point) {
  if (!point) {
    return null;
  }

  if (path.kind === 'circle') {
    const angle = Math.atan2(point.y - path.center.y, point.x - path.center.x);
    return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
  }

  if (path.kind === 'polyline') {
    const range = getPathParameterRange(path);
    let best = 0;
    let bestDistance = Infinity;

    for (let index = 0; index < range; index += 1) {
      const start = getPolylineVertex(path, index);
      const end = getPolylineVertex(path, index + 1);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      const local = lengthSquared
        ? Math.min(Math.max(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0), 1)
        : 0;
      const closest = { x: start.x + dx * local, y: start.y + dy * local };
      const distance = Math.hypot(point.x - closest.x, point.y - closest.y);

      if (distance < bestDistance) {
        bestDistance = distance;
        best = index + local;
      }
    }

    return best;
  }

  let best = 0;
  let bestDistance = Infinity;

  for (let index = 0; index <= BEZIER_SAMPLE_COUNT; index += 1) {
    const t = index / BEZIER_SAMPLE_COUNT;
    const candidate = getQuadraticPoint(path.p0, path.p1, path.p2, t);
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);

    if (distance < bestDistance) {
      bestDistance = distance;
      best = t;
    }
  }

  let low = Math.max(best - 1 / BEZIER_SAMPLE_COUNT, 0);
  let high = Math.min(best + 1 / BEZIER_SAMPLE_COUNT, 1);

  for (let index = 0; index < BEZIER_REFINE_ITERATIONS; index += 1) {
    const leftThird = low + (high - low) / 3;
    const rightThird = high - (high - low) / 3;
    const leftPoint = getQuadraticPoint(path.p0, path.p1, path.p2, leftThird);
    const rightPoint = getQuadraticPoint(path.p0, path.p1, path.p2, rightThird);

    if (
      Math.hypot(point.x - leftPoint.x, point.y - leftPoint.y) <=
      Math.hypot(point.x - rightPoint.x, point.y - rightPoint.y)
    ) {
      high = rightThird;
    } else {
      low = leftThird;
    }
  }

  return (low + high) / 2;
}

function sortUniqueParameters(parameters, range) {
  const epsilon = Math.max(range * PARAMETER_EPSILON, PARAMETER_EPSILON);
  const sorted = [...parameters].sort((left, right) => left - right);
  const unique = [];

  for (const value of sorted) {
    if (!unique.length || Math.abs(unique.at(-1) - value) > epsilon) {
      unique.push(value);
    }
  }

  return unique;
}

/**
 * Split a path into the span the click sits in (removed) and everything else
 * (kept). Spans are `{ start, length }` so a closed path can wrap without
 * ambiguity about which way round the loop the survivor runs.
 */
export function resolveTrimSpans(path, cutParameters, clickParameter) {
  const range = getPathParameterRange(path);
  const epsilon = Math.max(range * PARAMETER_EPSILON, PARAMETER_EPSILON);
  const closed = isClosedTrimPath(path);
  const parameters = sortUniqueParameters(
    cutParameters.filter((value) => Number.isFinite(value)),
    range,
  );

  if (closed) {
    const onLoop = parameters.filter((value) => value >= -epsilon && value <= range + epsilon);

    if (onLoop.length < 2) {
      return { removed: { start: 0, length: range }, kept: [] };
    }

    let index = onLoop.findIndex((value, position) => {
      const next = position + 1 < onLoop.length ? onLoop[position + 1] : onLoop[0] + range;
      return clickParameter >= value - epsilon && clickParameter < next;
    });

    if (index < 0) {
      index = onLoop.length - 1;
    }

    const start = onLoop[index];
    const next = index + 1 < onLoop.length ? onLoop[index + 1] : onLoop[0] + range;
    const removedLength = next - start;
    const keptLength = range - removedLength;

    return {
      removed: { start, length: removedLength },
      kept: keptLength > epsilon ? [{ start: next % range, length: keptLength }] : [],
    };
  }

  const interior = parameters.filter((value) => value > epsilon && value < range - epsilon);
  let lower = 0;
  let upper = range;

  for (const value of interior) {
    if (value <= clickParameter && value > lower) {
      lower = value;
    }

    if (value > clickParameter && value < upper) {
      upper = value;
    }
  }

  const kept = [];

  if (lower > epsilon) {
    kept.push({ start: 0, length: lower });
  }

  if (range - upper > epsilon) {
    kept.push({ start: upper, length: range - upper });
  }

  return { removed: { start: lower, length: upper - lower }, kept };
}

export function collectPathSpanPoints(path, span) {
  if (path.kind === 'polyline') {
    const range = getPathParameterRange(path);
    const epsilon = Math.max(range * PARAMETER_EPSILON, PARAMETER_EPSILON);
    const points = [getPathPoint(path, span.start)];
    const end = span.start + span.length;

    for (let index = Math.floor(span.start) + 1; index < end - epsilon; index += 1) {
      points.push({ ...getPolylineVertex(path, index) });
    }

    points.push(getPathPoint(path, end));

    return points.filter(
      (point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 1e-9,
    );
  }

  if (path.kind === 'circle') {
    const steps = Math.max(2, Math.ceil((span.length / MAX_ARC_SPAN) * 8));
    const points = [];

    for (let index = 0; index <= steps; index += 1) {
      points.push(getPathPoint(path, span.start + (span.length * index) / steps));
    }

    return points;
  }

  const steps = 16;
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    points.push(getQuadraticPoint(path.p0, path.p1, path.p2, span.start + (span.length * index) / steps));
  }

  return points;
}

function derivePieceEntity(sourceEntity, prefix, shape, entities) {
  const piece = {
    id: createEntityId(prefix, entities),
    layerId: sourceEntity.layerId ?? 'default',
    locked: sourceEntity.locked ?? false,
    visible: sourceEntity.visible !== false,
    ...shape,
    meta: { ...(sourceEntity.meta || {}) },
  };

  if (sourceEntity.materialId != null) {
    piece.materialId = sourceEntity.materialId;
  }

  if (sourceEntity.thickness != null) {
    piece.thickness = sourceEntity.thickness;
  }

  return piece;
}

function buildCircleSpanEntities(path, span, sourceEntity, entities) {
  const count = Math.max(1, Math.ceil(span.length / MAX_ARC_SPAN - PARAMETER_EPSILON));
  const step = span.length / count;
  const half = step / 2;
  const created = [];
  let working = entities;

  for (let index = 0; index < count; index += 1) {
    const from = span.start + step * index;
    const to = from + step;
    const middle = from + half;
    // Control point chosen so the Bézier's own midpoint lands on the circle:
    // C = centre + r * (2 - cos(half)) * bisector.
    const reach = path.radius * (2 - Math.cos(half));
    const entity = derivePieceEntity(
      sourceEntity,
      'arc',
      {
        type: 'arc',
        start: getPathPoint(path, from),
        control: { x: path.center.x + Math.cos(middle) * reach, y: path.center.y + Math.sin(middle) * reach },
        end: getPathPoint(path, to),
      },
      working,
    );

    created.push(entity);
    working = [...working, entity];
  }

  return created;
}

function buildSpanEntities(path, spans, sourceEntity, entities) {
  const created = [];
  let working = entities;

  for (const span of spans) {
    if (!(span.length > 0)) {
      continue;
    }

    if (path.kind === 'circle') {
      const arcs = buildCircleSpanEntities(path, span, sourceEntity, working);
      created.push(...arcs);
      working = [...working, ...arcs];
      continue;
    }

    if (path.kind === 'bezier') {
      const sub = getQuadraticSubCurve(path.p0, path.p1, path.p2, span.start, span.start + span.length);
      const entity = derivePieceEntity(
        sourceEntity,
        'arc',
        { type: 'arc', start: sub.start, control: sub.control, end: sub.end },
        working,
      );
      created.push(entity);
      working = [...working, entity];
      continue;
    }

    const points = collectPathSpanPoints(path, span);

    if (points.length < 2) {
      continue;
    }

    // A trimmed line stays a line; anything with a corner in it becomes an open
    // polyline (this is the rect -> polyline conversion).
    const entity =
      path.source === 'line' && points.length === 2
        ? derivePieceEntity(
            sourceEntity,
            'line',
            { type: 'line', x1: points[0].x, y1: points[0].y, x2: points[1].x, y2: points[1].y },
            working,
          )
        : derivePieceEntity(sourceEntity, 'polyline', { type: 'polyline', points, closed: false }, working);

    created.push(entity);
    working = [...working, entity];
  }

  return created;
}

/**
 * Work out what a trim click does, without touching the document.
 *
 * @returns null when the entity cannot be trimmed, otherwise
 *   `{ removedIds, addedEntities, entities, removedSpanPoints, deletesEntity }`.
 */
export function computeSketchTrim(entities, targetEntity, clickPoint, options = {}) {
  const path = buildTrimPath(targetEntity);

  if (!path || !clickPoint) {
    return null;
  }

  const cutters = (options.cutters ?? entities).filter(
    (entity) => entity && entity.id !== targetEntity.id && entity.visible !== false,
  );
  const cutPoints = collectEntityIntersections(targetEntity, cutters, {
    tolerance: options.tolerance ?? ARC_FLATTEN_TOLERANCE,
  });
  const spans = resolveTrimSpans(
    path,
    cutPoints.map((point) => getPathParameter(path, point)),
    getPathParameter(path, clickPoint),
  );
  const remaining = entities.filter((entity) => entity.id !== targetEntity.id);
  const addedEntities = buildSpanEntities(path, spans.kept, targetEntity, remaining);

  return {
    removedIds: [targetEntity.id],
    addedEntities,
    entities: [...remaining, ...addedEntities],
    removedSpanPoints: collectPathSpanPoints(path, spans.removed),
    deletesEntity: addedEntities.length === 0,
    cutCount: cutPoints.length,
  };
}
