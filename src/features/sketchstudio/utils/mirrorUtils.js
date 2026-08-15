import { getRectCenter, getRectCorners } from './entityUtils';
import { createTransformedCopies, isCopyableEntity } from './entityCopyUtils';

/**
 * Mirror a selection across an arbitrary axis, producing COPIES.
 *
 * Copies rather than in-place flips: the overwhelmingly common use is building a
 * symmetric part, where you want both halves. Delete the original afterwards if
 * you wanted a flip.
 *
 * PER-TYPE MATH
 * -------------
 * line / polyline / arc / feature-polygon
 *   Every defining point is reflected. Exact — a quadratic Bézier's reflection
 *   is the Bézier of the reflected control points.
 *
 * circle / feature-circle
 *   The centre reflects, the radius is unchanged.
 *
 * ellipse / feature-ellipse
 *   NO polyline approximation. A reflection maps a direction at angle `a` to
 *   `2*axisAngle - a`, so the copy keeps `rx`/`ry` verbatim and takes
 *   `rotation' = 2*axisAngle - rotation` (degrees, normalised to (-180, 180]).
 *   The centre reflects. Exact for any axis.
 *
 * rect / feature-rect
 *   With a HORIZONTAL or VERTICAL axis the reflection maps the rect's edge
 *   directions onto `-rotation`, so the copy stays a rect: centre reflected,
 *   `rotation' = -rotation`, width/height untouched. (A rect is symmetric under
 *   a half turn, so `-rotation` is correct for both axis orientations.)
 *   For an OBLIQUE axis the copy is emitted as a CLOSED POLYLINE through the
 *   four reflected corners (a `feature` rect becomes a `polygon` feature). The
 *   reflected shape is still a rectangle, but expressing it as a rotated `rect`
 *   would hand the rest of the editor a rotated rect, which several paths
 *   (corner handles, rotation transforms) do not round-trip; a polyline is the
 *   representation that survives every downstream tool.
 */

const AXIS_ALIGNMENT_EPSILON = 1e-9;

export function normalizeAngleDegrees(angle) {
  const normalized = (((Number(angle) || 0) % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

export function reflectPointAcrossLine(point, axisStart, axisEnd) {
  const dx = axisEnd.x - axisStart.x;
  const dy = axisEnd.y - axisStart.y;
  const lengthSquared = dx * dx + dy * dy;

  if (!lengthSquared) {
    return { x: point.x, y: point.y };
  }

  const vx = point.x - axisStart.x;
  const vy = point.y - axisStart.y;
  const projection = (vx * dx + vy * dy) / lengthSquared;

  return {
    x: axisStart.x + 2 * dx * projection - vx,
    y: axisStart.y + 2 * dy * projection - vy,
  };
}

export function getMirrorAxisAngleDegrees(axisStart, axisEnd) {
  return (Math.atan2(axisEnd.y - axisStart.y, axisEnd.x - axisStart.x) * 180) / Math.PI;
}

export function isAxisOrthogonal(axisStart, axisEnd) {
  const dx = Math.abs(axisEnd.x - axisStart.x);
  const dy = Math.abs(axisEnd.y - axisStart.y);
  const scale = Math.max(dx, dy);

  if (!scale) {
    return false;
  }

  return dy <= scale * AXIS_ALIGNMENT_EPSILON || dx <= scale * AXIS_ALIGNMENT_EPSILON;
}

function reflectRectCorners(entity, axisStart, axisEnd) {
  const corners = getRectCorners(entity);
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft].map((corner) =>
    reflectPointAcrossLine(corner, axisStart, axisEnd),
  );
}

function reflectFeatureRectCorners(entity, axisStart, axisEnd) {
  const corners = [
    { x: entity.x, y: entity.y },
    { x: entity.x + entity.width, y: entity.y },
    { x: entity.x + entity.width, y: entity.y + entity.height },
    { x: entity.x, y: entity.y + entity.height },
  ];

  return corners.map((corner) => reflectPointAcrossLine(corner, axisStart, axisEnd));
}

export function mirrorEntityAcrossLine(entity, axisStart, axisEnd) {
  const reflect = (point) => reflectPointAcrossLine(point, axisStart, axisEnd);
  const axisAngle = getMirrorAxisAngleDegrees(axisStart, axisEnd);
  const orthogonal = isAxisOrthogonal(axisStart, axisEnd);

  if (entity.type === 'line') {
    const start = reflect({ x: entity.x1, y: entity.y1 });
    const end = reflect({ x: entity.x2, y: entity.y2 });
    return { ...entity, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  }

  if (entity.type === 'polyline') {
    return { ...entity, points: (entity.points || []).map(reflect) };
  }

  if (entity.type === 'arc') {
    return { ...entity, start: reflect(entity.start), control: reflect(entity.control), end: reflect(entity.end) };
  }

  if (entity.type === 'circle') {
    const center = reflect({ x: entity.cx, y: entity.cy });
    return { ...entity, cx: center.x, cy: center.y };
  }

  if (entity.type === 'ellipse') {
    const center = reflect({ x: entity.cx, y: entity.cy });
    return {
      ...entity,
      cx: center.x,
      cy: center.y,
      rotation: normalizeAngleDegrees(2 * axisAngle - (entity.rotation ?? 0)),
    };
  }

  if (entity.type === 'rect') {
    if (orthogonal) {
      const center = reflect(getRectCenter(entity));
      return {
        ...entity,
        x: center.x - entity.width / 2,
        y: center.y - entity.height / 2,
        rotation: normalizeAngleDegrees(-(entity.rotation ?? 0)),
      };
    }

    const { x: _x, y: _y, width: _width, height: _height, rotation: _rotation, ...rest } = entity;
    return { ...rest, type: 'polyline', points: reflectRectCorners(entity, axisStart, axisEnd), closed: true };
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle') {
      const center = reflect({ x: entity.cx, y: entity.cy });
      return { ...entity, cx: center.x, cy: center.y };
    }

    if (entity.shape === 'ellipse') {
      const center = reflect({ x: entity.cx, y: entity.cy });
      return {
        ...entity,
        cx: center.x,
        cy: center.y,
        rotation: normalizeAngleDegrees(2 * axisAngle - (entity.rotation ?? 0)),
      };
    }

    if (entity.shape === 'polygon') {
      return { ...entity, points: (entity.points || []).map(reflect) };
    }

    if (entity.shape === 'rect') {
      if (orthogonal) {
        const center = reflect({ x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 });
        return { ...entity, x: center.x - entity.width / 2, y: center.y - entity.height / 2 };
      }

      const { x: _x, y: _y, width: _width, height: _height, ...rest } = entity;
      return { ...rest, shape: 'polygon', points: reflectFeatureRectCorners(entity, axisStart, axisEnd), closed: true };
    }
  }

  return null;
}

/**
 * Mirror `entityIds` across the axis through `axisStart` and `axisEnd`.
 *
 * @returns `{ entities, createdEntities, createdIds, skippedEntities }`, or null
 *   when the axis is degenerate.
 */
export function mirrorEntitiesAcrossLine(entities, entityIds, axisStart, axisEnd) {
  if (!axisStart || !axisEnd) {
    return null;
  }

  if (Math.hypot(axisEnd.x - axisStart.x, axisEnd.y - axisStart.y) <= 0) {
    return null;
  }

  return createTransformedCopies(entities, entityIds, (entity) => mirrorEntityAcrossLine(entity, axisStart, axisEnd));
}

/**
 * Ghosts for the hover preview. Deliberately skips id allocation and group
 * remapping: it runs on every pointer move and only ever feeds the renderer.
 */
export function buildMirrorPreviewEntities(entities, entityIds, axisStart, axisEnd) {
  if (!entityIds?.length || !axisStart || !axisEnd) {
    return [];
  }

  if (!Math.hypot(axisEnd.x - axisStart.x, axisEnd.y - axisStart.y)) {
    return [];
  }

  const idSet = new Set(entityIds);
  const ghosts = [];

  entities.forEach((entity) => {
    if (!idSet.has(entity.id) || !isCopyableEntity(entity)) {
      return;
    }

    const shape = mirrorEntityAcrossLine(entity, axisStart, axisEnd);

    if (shape) {
      ghosts.push({ ...shape, id: `mirror-ghost-${ghosts.length}` });
    }
  });

  return ghosts;
}
