import { getRectCenter, getRectCorners } from './entityUtils';
import { createTransformedCopyBatches, isCopyableEntity } from './entityCopyUtils';
import { normalizeAngleDegrees } from './mirrorUtils';
import { rotatePointAroundPivot, translateEntity } from './transformUtils';

/**
 * Linear and polar arrays over the current selection.
 *
 * Both produce `count - 1` copies and leave the originals alone, so `count` is
 * the total number of instances the user ends up looking at.
 *
 * LINEAR   copy k is translated by k * spacing along the base -> target
 *          direction. Pure translation, so every entity type round-trips exactly.
 *
 * POLAR    copy k is rotated about the centre. A full turn (total angle a
 *          multiple of 360) divides by `count` so the last copy does not land on
 *          the original; any other total angle divides by `count - 1` so the last
 *          copy lands exactly on the requested angle.
 *
 * ROTATED RECTS follow the same rule as mirror: at a quarter-turn multiple the
 * copy stays a `rect` (centre rotated, width/height SWAPPED at 90 and 270, the
 * stored `rotation` field untouched); at any other angle the copy is emitted as
 * a closed polyline through the rotated corners, because a rotated `rect` does
 * not round-trip through the editor's corner handles. Ellipses rotate through
 * their `rotation` field, never through a polyline approximation.
 */

export const MAX_ARRAY_COUNT = 200;
export const MIN_ARRAY_COUNT = 2;
export const DEFAULT_POLAR_ANGLE = 360;

const QUARTER_TURN_EPSILON = 1e-9;

export function clampArrayCount(rawCount) {
  const count = Math.floor(Number(rawCount));

  if (!Number.isFinite(count)) {
    return { count: MIN_ARRAY_COUNT, capped: false };
  }

  if (count > MAX_ARRAY_COUNT) {
    return { count: MAX_ARRAY_COUNT, capped: true };
  }

  return { count: Math.max(count, MIN_ARRAY_COUNT), capped: false };
}

function getQuarterTurns(angleDegrees) {
  const normalized = (((Number(angleDegrees) || 0) % 360) + 360) % 360;
  const quarters = normalized / 90;
  const rounded = Math.round(quarters);

  return Math.abs(quarters - rounded) <= QUARTER_TURN_EPSILON ? rounded % 4 : null;
}

function rotateRectEntity(entity, pivot, angleDegrees, angleRadians) {
  const quarters = getQuarterTurns(angleDegrees);
  const center = rotatePointAroundPivot(getRectCenter(entity), pivot, angleRadians);

  if (quarters == null) {
    const corners = getRectCorners(entity);
    const { x: _x, y: _y, width: _width, height: _height, rotation: _rotation, ...rest } = entity;

    return {
      ...rest,
      type: 'polyline',
      points: [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft].map((corner) =>
        rotatePointAroundPivot(corner, pivot, angleRadians),
      ),
      closed: true,
    };
  }

  const swap = quarters === 1 || quarters === 3;
  const width = swap ? entity.height : entity.width;
  const height = swap ? entity.width : entity.height;

  return {
    ...entity,
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    rotation: entity.rotation ?? 0,
  };
}

function rotateFeatureRectEntity(entity, pivot, angleDegrees, angleRadians) {
  const quarters = getQuarterTurns(angleDegrees);
  const corners = [
    { x: entity.x, y: entity.y },
    { x: entity.x + entity.width, y: entity.y },
    { x: entity.x + entity.width, y: entity.y + entity.height },
    { x: entity.x, y: entity.y + entity.height },
  ];

  if (quarters == null) {
    const { x: _x, y: _y, width: _width, height: _height, ...rest } = entity;

    return {
      ...rest,
      shape: 'polygon',
      points: corners.map((corner) => rotatePointAroundPivot(corner, pivot, angleRadians)),
      closed: true,
    };
  }

  const center = rotatePointAroundPivot(
    { x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 },
    pivot,
    angleRadians,
  );
  const swap = quarters === 1 || quarters === 3;
  const width = swap ? entity.height : entity.width;
  const height = swap ? entity.width : entity.height;

  return { ...entity, x: center.x - width / 2, y: center.y - height / 2, width, height };
}

export function rotateEntityCopy(entity, pivot, angleDegrees) {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  const rotate = (point) => rotatePointAroundPivot(point, pivot, angleRadians);

  if (entity.type === 'line') {
    const start = rotate({ x: entity.x1, y: entity.y1 });
    const end = rotate({ x: entity.x2, y: entity.y2 });
    return { ...entity, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  }

  if (entity.type === 'polyline') {
    return { ...entity, points: (entity.points || []).map(rotate) };
  }

  if (entity.type === 'arc') {
    return { ...entity, start: rotate(entity.start), control: rotate(entity.control), end: rotate(entity.end) };
  }

  if (entity.type === 'circle') {
    const center = rotate({ x: entity.cx, y: entity.cy });
    return { ...entity, cx: center.x, cy: center.y };
  }

  if (entity.type === 'ellipse') {
    const center = rotate({ x: entity.cx, y: entity.cy });
    return {
      ...entity,
      cx: center.x,
      cy: center.y,
      rotation: normalizeAngleDegrees((entity.rotation ?? 0) + angleDegrees),
    };
  }

  if (entity.type === 'rect') {
    return rotateRectEntity(entity, pivot, angleDegrees, angleRadians);
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle') {
      const center = rotate({ x: entity.cx, y: entity.cy });
      return { ...entity, cx: center.x, cy: center.y };
    }

    if (entity.shape === 'ellipse') {
      const center = rotate({ x: entity.cx, y: entity.cy });
      return {
        ...entity,
        cx: center.x,
        cy: center.y,
        rotation: normalizeAngleDegrees((entity.rotation ?? 0) + angleDegrees),
      };
    }

    if (entity.shape === 'polygon') {
      return { ...entity, points: (entity.points || []).map(rotate) };
    }

    if (entity.shape === 'rect') {
      return rotateFeatureRectEntity(entity, pivot, angleDegrees, angleRadians);
    }
  }

  return null;
}

export function getPolarStepDegrees(totalAngleDegrees, count) {
  const total = Number(totalAngleDegrees);
  const safeTotal = Number.isFinite(total) && total !== 0 ? total : DEFAULT_POLAR_ANGLE;
  const isFullTurn = Math.abs(safeTotal % 360) <= QUARTER_TURN_EPSILON;

  if (isFullTurn) {
    return safeTotal / count;
  }

  return count > 1 ? safeTotal / (count - 1) : 0;
}

/**
 * @returns `{ entities, createdEntities, createdIds, skippedEntities, count, capped }`
 *   or null when the selection is empty or the offset is degenerate.
 */
export function computeLinearArray(entities, entityIds, { basePoint, targetPoint, count, spacing } = {}) {
  if (!entityIds?.length || !basePoint || !targetPoint) {
    return null;
  }

  const dx = targetPoint.x - basePoint.x;
  const dy = targetPoint.y - basePoint.y;
  const length = Math.hypot(dx, dy);

  if (!length) {
    return null;
  }

  const step = Number.isFinite(spacing) && spacing > 0 ? spacing : length;
  const direction = { x: dx / length, y: dy / length };
  const { count: safeCount, capped } = clampArrayCount(count);
  const batches = createTransformedCopyBatches(
    entities,
    entityIds,
    (entity, batch) =>
      translateEntity(entity, { x: direction.x * step * (batch + 1), y: direction.y * step * (batch + 1) }),
    safeCount - 1,
  );

  return { ...batches, count: safeCount, capped, spacing: step };
}

/**
 * @returns `{ entities, createdEntities, createdIds, skippedEntities, count, capped, stepDegrees }`
 *   or null when the selection is empty or no centre was picked.
 */
export function computePolarArray(entities, entityIds, { center, count, totalAngleDegrees } = {}) {
  if (!entityIds?.length || !center) {
    return null;
  }

  const { count: safeCount, capped } = clampArrayCount(count);
  const stepDegrees = getPolarStepDegrees(totalAngleDegrees ?? DEFAULT_POLAR_ANGLE, safeCount);

  if (!stepDegrees) {
    return null;
  }

  const batches = createTransformedCopyBatches(
    entities,
    entityIds,
    (entity, batch) => rotateEntityCopy(entity, center, stepDegrees * (batch + 1)),
    safeCount - 1,
  );

  return { ...batches, count: safeCount, capped, stepDegrees };
}

/**
 * Ghosts for the hover preview. Skips id allocation and group remapping — it
 * runs on every pointer move and only ever feeds the renderer.
 */
export function buildArrayPreviewEntities(entities, entityIds, config = {}) {
  if (!entityIds?.length) {
    return [];
  }

  const { count: safeCount } = clampArrayCount(config.count);
  const idSet = new Set(entityIds);
  const sources = entities.filter((entity) => idSet.has(entity.id) && isCopyableEntity(entity));

  if (!sources.length || safeCount < 2) {
    return [];
  }

  const ghosts = [];

  if (config.mode === 'polar') {
    if (!config.center) {
      return [];
    }

    const stepDegrees = getPolarStepDegrees(config.totalAngleDegrees ?? DEFAULT_POLAR_ANGLE, safeCount);

    if (!stepDegrees) {
      return [];
    }

    for (let index = 1; index < safeCount; index += 1) {
      sources.forEach((entity) => {
        const shape = rotateEntityCopy(entity, config.center, stepDegrees * index);

        if (shape) {
          ghosts.push({ ...shape, id: `array-ghost-${ghosts.length}` });
        }
      });
    }

    return ghosts;
  }

  if (!config.basePoint || !config.targetPoint) {
    return [];
  }

  const dx = config.targetPoint.x - config.basePoint.x;
  const dy = config.targetPoint.y - config.basePoint.y;
  const length = Math.hypot(dx, dy);

  if (!length) {
    return [];
  }

  const step = Number.isFinite(config.spacing) && config.spacing > 0 ? config.spacing : length;
  const direction = { x: dx / length, y: dy / length };

  for (let index = 1; index < safeCount; index += 1) {
    sources.forEach((entity) => {
      const shape = translateEntity(entity, { x: direction.x * step * index, y: direction.y * step * index });

      if (shape) {
        ghosts.push({ ...shape, id: `array-ghost-${ghosts.length}` });
      }
    });
  }

  return ghosts;
}
