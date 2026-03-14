import { add, distance, normalize, perpendicular, scale, subtract } from '@/geometry/point';

function getSafeAxis(rawVector) {
  return normalize(rawVector.x || rawVector.y ? rawVector : { x: 1, y: 0 });
}

function getSupportOffset(instance) {
  return Number.isFinite(instance?.supportOffsetAlongAxis)
    ? Math.max(0, instance.supportOffsetAlongAxis)
    : 0;
}

export function getTrussSupportLength(instance) {
  return Math.max(
    distance(instance.startPoint, instance.endPoint),
    Number(instance.spacing || 0) * Math.max((instance.count || 1) - 1, 0),
    1
  );
}

export function resolveTrussLayout(instance) {
  const rawVector = subtract(instance.endPoint, instance.startPoint);
  const axis = getSafeAxis(rawVector);

  return {
    axis,
    spanDirection: perpendicular(axis),
    supportLength: getTrussSupportLength(instance),
  };
}

export function buildTrussCopyOrigins(instance) {
  const layout = resolveTrussLayout(instance);
  const count = Math.max(1, Math.round(instance.count || 1));
  const startOrigin = add(instance.startPoint, scale(layout.axis, getSupportOffset(instance)));

  return Array.from({ length: count }, (_, index) => ({
    id: `${instance.id}_copy_${index}`,
    index,
    origin: add(startOrigin, scale(layout.axis, (instance.spacing || 0) * index)),
  }));
}
