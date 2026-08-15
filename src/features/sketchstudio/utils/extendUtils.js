import { getQuadraticPoint, getQuadraticSubCurve } from './arcUtils';
import { calculateDistance } from './canvasMath';
import { ARC_FLATTEN_TOLERANCE, collectEntityIntersections } from './intersectionUtils';

/**
 * Classic CAD extend: click near a free end and the entity grows along its own
 * direction until it meets the first piece of geometry in the way.
 *
 * Extendable ends are:
 *   line              — either endpoint
 *   arc               — either endpoint
 *   polyline (open)   — the first or last vertex only
 *
 * A LINE or POLYLINE end grows along the terminal segment's direction. An ARC
 * grows along its OWN curve: the quadratic Bézier is re-evaluated outside the
 * [0, 1] window (see `getQuadraticSubCurve`), so the extension leaves the
 * endpoint tangentially and stays exactly on the curve the arc already traced —
 * the result is still a single `arc` entity, not an arc plus a tangent line.
 * The arc probe is capped at one extra parameter unit beyond each end, which is
 * as far as extrapolating a quadratic stays geometrically meaningful.
 *
 * When nothing lies in the extension's path this returns null, and the tool
 * reports the no-op rather than moving anything.
 */

const MIN_EXTENSION = 1e-6;
const ARC_PROBE_PARAMETER = 1;
const ARC_PROBE_SAMPLES = 96;
const DEFAULT_REACH = 100000;

export const EXTENDABLE_ENTITY_TYPES = ['line', 'arc', 'polyline'];

function isOpenPolyline(entity) {
  return entity?.type === 'polyline' && entity.closed !== true && (entity.points?.length ?? 0) >= 2;
}

export function isExtendableEntity(entity) {
  if (entity?.type === 'line' || entity?.type === 'arc') {
    return true;
  }

  return isOpenPolyline(entity);
}

export function getExtendableEnds(entity) {
  if (entity?.type === 'line') {
    return [
      { endKey: 'start', point: { x: entity.x1, y: entity.y1 } },
      { endKey: 'end', point: { x: entity.x2, y: entity.y2 } },
    ];
  }

  if (entity?.type === 'arc' && entity.start && entity.end) {
    return [
      { endKey: 'start', point: { ...entity.start } },
      { endKey: 'end', point: { ...entity.end } },
    ];
  }

  if (isOpenPolyline(entity)) {
    return [
      { endKey: 'start', point: { ...entity.points[0] } },
      { endKey: 'end', point: { ...entity.points.at(-1) } },
    ];
  }

  return [];
}

/** The extendable end closest to `worldPoint`, or null when none is in range. */
export function findExtendCandidate(entities, worldPoint, tolerance) {
  let best = null;
  let bestDistance = Infinity;

  for (const entity of entities) {
    if (!isExtendableEntity(entity) || entity.visible === false) {
      continue;
    }

    for (const end of getExtendableEnds(entity)) {
      const distance = calculateDistance(worldPoint, end.point);

      if (distance <= tolerance && distance < bestDistance) {
        bestDistance = distance;
        best = { entity, endKey: end.endKey, point: end.point };
      }
    }
  }

  return best;
}

function getSceneReach(entities) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const track = (point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }

    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };

  for (const entity of entities) {
    if (entity.type === 'line') {
      track({ x: entity.x1, y: entity.y1 });
      track({ x: entity.x2, y: entity.y2 });
    } else if (entity.type === 'rect') {
      track({ x: entity.x, y: entity.y });
      track({ x: entity.x + entity.width, y: entity.y + entity.height });
    } else if (entity.type === 'circle') {
      track({ x: entity.cx - entity.r, y: entity.cy - entity.r });
      track({ x: entity.cx + entity.r, y: entity.cy + entity.r });
    } else if (entity.type === 'ellipse' || entity.shape === 'ellipse') {
      track({ x: entity.cx - entity.rx, y: entity.cy - entity.ry });
      track({ x: entity.cx + entity.rx, y: entity.cy + entity.ry });
    } else if (entity.type === 'arc') {
      track(entity.start);
      track(entity.control);
      track(entity.end);
    } else if (Array.isArray(entity.points)) {
      entity.points.forEach(track);
    }
  }

  if (!Number.isFinite(minX)) {
    return DEFAULT_REACH;
  }

  return Math.max(Math.hypot(maxX - minX, maxY - minY) * 2, 1000);
}

function buildProbeLine(origin, direction, reach) {
  return {
    id: '__extend-probe__',
    type: 'line',
    x1: origin.x,
    y1: origin.y,
    x2: origin.x + direction.x * reach,
    y2: origin.y + direction.y * reach,
    visible: true,
    meta: {},
  };
}

function getStraightExtension(origin, other, entities, others) {
  const dx = origin.x - other.x;
  const dy = origin.y - other.y;
  const length = Math.hypot(dx, dy);

  if (!length) {
    return null;
  }

  const direction = { x: dx / length, y: dy / length };
  const reach = getSceneReach(entities);
  const probe = buildProbeLine(origin, direction, reach);
  const hits = collectEntityIntersections(probe, others);
  let best = null;
  let bestDistance = Infinity;

  for (const hit of hits) {
    const distance = calculateDistance(origin, hit);

    if (distance > MIN_EXTENSION && distance < bestDistance) {
      bestDistance = distance;
      best = hit;
    }
  }

  return best ? { point: best, distance: bestDistance } : null;
}

function getArcExtension(entity, endKey, others) {
  const forward = endKey === 'end';
  const from = forward ? 1 : 0;
  const to = forward ? 1 + ARC_PROBE_PARAMETER : -ARC_PROBE_PARAMETER;
  const probeCurve = getQuadraticSubCurve(entity.start, entity.control, entity.end, from, to);
  const probe = {
    id: '__extend-probe__',
    type: 'arc',
    start: probeCurve.start,
    control: probeCurve.control,
    end: probeCurve.end,
    visible: true,
    meta: {},
  };
  const hits = collectEntityIntersections(probe, others, { tolerance: ARC_FLATTEN_TOLERANCE });

  if (!hits.length) {
    return null;
  }

  // Map each hit back to the ORIGINAL arc's parameter so "nearest" means nearest
  // along the curve, not nearest in a straight line.
  let best = null;
  let bestOffset = Infinity;

  for (const hit of hits) {
    let bestSample = null;
    let bestDistance = Infinity;

    for (let index = 0; index <= ARC_PROBE_SAMPLES; index += 1) {
      const local = index / ARC_PROBE_SAMPLES;
      const parameter = from + (to - from) * local;
      const point = getQuadraticPoint(entity.start, entity.control, entity.end, parameter);
      const distance = Math.hypot(point.x - hit.x, point.y - hit.y);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestSample = parameter;
      }
    }

    if (bestSample == null) {
      continue;
    }

    let low = Math.max(Math.min(bestSample - (to - from) / ARC_PROBE_SAMPLES, bestSample), Math.min(from, to));
    let high = Math.min(Math.max(bestSample + (to - from) / ARC_PROBE_SAMPLES, bestSample), Math.max(from, to));

    for (let index = 0; index < 60; index += 1) {
      const leftThird = low + (high - low) / 3;
      const rightThird = high - (high - low) / 3;
      const leftPoint = getQuadraticPoint(entity.start, entity.control, entity.end, leftThird);
      const rightPoint = getQuadraticPoint(entity.start, entity.control, entity.end, rightThird);

      if (
        Math.hypot(leftPoint.x - hit.x, leftPoint.y - hit.y) <= Math.hypot(rightPoint.x - hit.x, rightPoint.y - hit.y)
      ) {
        high = rightThird;
      } else {
        low = leftThird;
      }
    }

    const parameter = (low + high) / 2;
    const offset = forward ? parameter - 1 : -parameter;

    if (offset > 1e-9 && offset < bestOffset) {
      bestOffset = offset;
      best = parameter;
    }
  }

  if (best == null) {
    return null;
  }

  const span = forward
    ? getQuadraticSubCurve(entity.start, entity.control, entity.end, 0, best)
    : getQuadraticSubCurve(entity.start, entity.control, entity.end, best, 1);

  return {
    parameter: best,
    entity: { ...entity, start: span.start, control: span.control, end: span.end },
    point: getQuadraticPoint(entity.start, entity.control, entity.end, best),
  };
}

function sampleArcSpan(entity, from, to, steps = 16) {
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    points.push(getQuadraticPoint(entity.start, entity.control, entity.end, from + ((to - from) * index) / steps));
  }

  return points;
}

/**
 * Grow one end of an entity to the first intersection along its own direction.
 *
 * @returns null when nothing is in the way, otherwise
 *   `{ entity, entities, target, addedSpanPoints }`.
 */
export function computeSketchExtend(entities, candidate, options = {}) {
  if (!candidate?.entity) {
    return null;
  }

  const { entity, endKey } = candidate;
  const others = (options.blockers ?? entities).filter(
    (other) => other && other.id !== entity.id && other.visible !== false,
  );

  if (entity.type === 'line') {
    const origin = endKey === 'start' ? { x: entity.x1, y: entity.y1 } : { x: entity.x2, y: entity.y2 };
    const other = endKey === 'start' ? { x: entity.x2, y: entity.y2 } : { x: entity.x1, y: entity.y1 };
    const extension = getStraightExtension(origin, other, entities, others);

    if (!extension) {
      return null;
    }

    const nextEntity =
      endKey === 'start'
        ? { ...entity, x1: extension.point.x, y1: extension.point.y }
        : { ...entity, x2: extension.point.x, y2: extension.point.y };

    return {
      entity: nextEntity,
      entities: entities.map((item) => (item.id === entity.id ? nextEntity : item)),
      target: extension.point,
      addedSpanPoints: [origin, extension.point],
    };
  }

  if (isOpenPolyline(entity)) {
    const points = entity.points;
    const origin = endKey === 'start' ? points[0] : points.at(-1);
    const other = endKey === 'start' ? points[1] : points.at(-2);
    const extension = getStraightExtension(origin, other, entities, others);

    if (!extension) {
      return null;
    }

    const nextPoints = points.map((point) => ({ ...point }));
    nextPoints[endKey === 'start' ? 0 : nextPoints.length - 1] = { ...extension.point };
    const nextEntity = { ...entity, points: nextPoints };

    return {
      entity: nextEntity,
      entities: entities.map((item) => (item.id === entity.id ? nextEntity : item)),
      target: extension.point,
      addedSpanPoints: [{ ...origin }, extension.point],
    };
  }

  if (entity.type === 'arc') {
    const extension = getArcExtension(entity, endKey, others);

    if (!extension) {
      return null;
    }

    return {
      entity: extension.entity,
      entities: entities.map((item) => (item.id === entity.id ? extension.entity : item)),
      target: extension.point,
      addedSpanPoints:
        endKey === 'end'
          ? sampleArcSpan(entity, 1, extension.parameter)
          : sampleArcSpan(entity, extension.parameter, 0),
    };
  }

  return null;
}
