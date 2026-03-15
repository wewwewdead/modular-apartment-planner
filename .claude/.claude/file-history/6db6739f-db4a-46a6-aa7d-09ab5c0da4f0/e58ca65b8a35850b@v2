import { add, subtract, scale, normalize, perpendicular, distance, midpoint } from './point';
import { pointInPolygon } from './polygon';

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

export function getRailingRenderData(railing) {
  if (!railing || !railing.startPoint || !railing.endPoint) return null;
  const { startPoint, endPoint, width } = railing;
  const len = distance(startPoint, endPoint);
  if (len < 1) return null;

  const outline = makeOutline(startPoint, endPoint, width);

  return {
    railing,
    start: startPoint,
    end: endPoint,
    outline,
    midpoint: midpoint(startPoint, endPoint),
    length: len,
  };
}

export function railingContainsPoint(railing, point) {
  const renderData = getRailingRenderData(railing);
  if (!renderData) return false;
  return pointInPolygon(point, renderData.outline);
}

export function railingLength(railing) {
  return distance(railing.startPoint, railing.endPoint);
}
