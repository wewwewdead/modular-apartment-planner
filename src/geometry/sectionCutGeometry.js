import { distanceToSegment } from './line';
import { add, distance, midpoint, normalize, perpendicular, scale, subtract } from './point';

const EPSILON = 1e-6;

export function sectionCutLength(sectionCut) {
  return distance(sectionCut?.startPoint || { x: 0, y: 0 }, sectionCut?.endPoint || { x: 0, y: 0 });
}

export function sectionCutAxis(sectionCut) {
  return normalize(subtract(sectionCut?.endPoint || { x: 0, y: 0 }, sectionCut?.startPoint || { x: 0, y: 0 }));
}

export function sectionCutNormal(sectionCut) {
  const axis = sectionCutAxis(sectionCut);
  const direction = sectionCut?.direction === -1 ? -1 : 1;
  return scale(perpendicular(axis), direction);
}

export function sectionCutViewAxis(sectionCut) {
  const normal = sectionCutNormal(sectionCut);
  return { x: -normal.y, y: normal.x };
}

export function projectPointToSectionCut(sectionCut, point) {
  const origin = sectionCut?.startPoint || { x: 0, y: 0 };
  const relative = subtract(point, origin);
  const normal = sectionCutNormal(sectionCut);
  const viewAxis = sectionCutViewAxis(sectionCut);
  const start = sectionCut?.startPoint || { x: 0, y: 0 };
  const end = sectionCut?.endPoint || { x: 0, y: 0 };
  const startAlong = start.x * viewAxis.x + start.y * viewAxis.y;
  const endAlong = end.x * viewAxis.x + end.y * viewAxis.y;
  const pointAlong = point.x * viewAxis.x + point.y * viewAxis.y;
  const minAlong = Math.min(startAlong, endAlong);

  return {
    along: pointAlong - minAlong,
    offset: relative.x * normal.x + relative.y * normal.y,
  };
}

export function sectionCutArrow(sectionCut) {
  const axis = sectionCutAxis(sectionCut);
  if (Math.abs(axis.x) < EPSILON && Math.abs(axis.y) < EPSILON) return null;

  const normal = sectionCutNormal(sectionCut);
  const center = midpoint(sectionCut.startPoint, sectionCut.endPoint);
  const shaftStart = add(center, scale(normal, 100));
  const shaftEnd = add(center, scale(normal, 450));
  const headBase = add(shaftEnd, scale(normal, -120));
  const headNormal = scale(axis, 90);

  return {
    shaftStart,
    shaftEnd,
    headA: add(headBase, headNormal),
    headB: add(headBase, scale(headNormal, -1)),
  };
}

export function getSectionCutRenderData(sectionCut) {
  if (!sectionCut || sectionCutLength(sectionCut) < EPSILON) return null;

  return {
    line: {
      start: sectionCut.startPoint,
      end: sectionCut.endPoint,
    },
    arrow: sectionCutArrow(sectionCut),
    center: midpoint(sectionCut.startPoint, sectionCut.endPoint),
    length: sectionCutLength(sectionCut),
    label: sectionCut.label || 'Section',
  };
}

export function hitTestSectionCut(point, sectionCut, tolerance) {
  if (!sectionCut) return false;
  return distanceToSegment(point, sectionCut.startPoint, sectionCut.endPoint) <= tolerance;
}
