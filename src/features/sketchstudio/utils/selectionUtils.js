import { getArcSegments } from './arcUtils';
import { computeEntityBoundingBox } from './bboxUtils';
import { getDimensionGeometry } from './dimensionUtils';
import { getRectCorners, resolveSourceReferenceFromEntities } from './entityUtils';
import { getPolylineSegments } from './polylineUtils';
import { getSegmentIntersectionPoint } from './hitTest';

export function normalizeSelectionBox(start, current) {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);

  return {
    x,
    y,
    width,
    height,
    minX: x,
    minY: y,
    maxX: x + width,
    maxY: y + height,
  };
}

function pointInBox(point, box) {
  return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
}

function boxEdges(box) {
  return [
    [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }],
    [{ x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }],
    [{ x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }],
    [{ x: box.minX, y: box.maxY }, { x: box.minX, y: box.minY }],
  ];
}

function segmentIntersectsBox(start, end, box) {
  if (pointInBox(start, box) || pointInBox(end, box)) {
    return true;
  }

  return boxEdges(box).some(([edgeStart, edgeEnd]) => Boolean(getSegmentIntersectionPoint(start, end, edgeStart, edgeEnd)));
}

export function entityIntersectsSelectionBox(entity, box, entities) {
  const bbox = computeEntityBoundingBox(entity, entities);

  if (!bbox) {
    return false;
  }

  const bboxOverlaps = !(bbox.maxX < box.minX
    || bbox.minX > box.maxX
    || bbox.maxY < box.minY
    || bbox.minY > box.maxY);

  if (!bboxOverlaps) {
    return false;
  }

  if (entity.type === 'line') {
    return segmentIntersectsBox({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }, box);
  }

  if (entity.type === 'rect') {
    const corners = Object.values(getRectCorners(entity));
    return corners.some((corner) => pointInBox(corner, box))
      || corners.some((corner, index) => segmentIntersectsBox(corner, corners[(index + 1) % corners.length], box));
  }

  if (entity.type === 'circle') {
    return true;
  }

  if (entity.type === 'polyline') {
    return getPolylineSegments(entity).some((segment) => segmentIntersectsBox(segment.start, segment.end, box));
  }

  if (entity.type === 'arc') {
    return getArcSegments(entity).some((segment) => segmentIntersectsBox(segment.start, segment.end, box));
  }

  if (entity.type === 'dimension') {
    const sourceRefs = entity.meta?.sourceRefs ?? [];
    const p1 = resolveSourceReferenceFromEntities(entities, sourceRefs[0], entity.p1);
    const p2 = resolveSourceReferenceFromEntities(entities, sourceRefs[1], entity.p2);
    const geometry = getDimensionGeometry({ p1, p2, subtype: entity.subtype, offset: entity.offset });

    return segmentIntersectsBox({ x: geometry.ext1.x1, y: geometry.ext1.y1 }, { x: geometry.ext1.x2, y: geometry.ext1.y2 }, box)
      || segmentIntersectsBox({ x: geometry.ext2.x1, y: geometry.ext2.y1 }, { x: geometry.ext2.x2, y: geometry.ext2.y2 }, box)
      || segmentIntersectsBox({ x: geometry.dimLine.x1, y: geometry.dimLine.y1 }, { x: geometry.dimLine.x2, y: geometry.dimLine.y2 }, box);
  }

  if (entity.type === 'angle-dimension') {
    return pointInBox(entity.vertex, box)
      || segmentIntersectsBox(entity.vertex, entity.p1, box)
      || segmentIntersectsBox(entity.vertex, entity.p2, box);
  }

  return false;
}

export function getEntityIdsInSelectionBox(entities, box) {
  return entities
    .filter((entity) => entity.visible !== false)
    .filter((entity) => entityIntersectsSelectionBox(entity, box, entities))
    .map((entity) => entity.id);
}
