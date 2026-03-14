import {
  add,
  dot,
  normalize,
  perpendicular,
  rotate as rotatePoint,
  scale,
  subtract,
} from '@/geometry/point';

export const MIN_TRUSS_SYSTEM_LENGTH = 1000;

export function normalizeRotationDegrees(value = 0) {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
}

export function normalizeSignedRotationDegrees(value = 0) {
  const normalized = normalizeRotationDegrees(value);
  return normalized > 180 ? normalized - 360 : normalized;
}

export function rotatePlanPoint(point, pivot, rotationDegrees = 0) {
  if (!point) return point;

  const angle = normalizeSignedRotationDegrees(rotationDegrees);
  if (Math.abs(angle) < 1e-6) {
    return { ...point };
  }

  return rotatePoint(point, pivot, angle);
}

export function rotatePlanVector(vector, rotationDegrees = 0) {
  if (!vector) return vector;

  return rotatePlanPoint(vector, { x: 0, y: 0 }, rotationDegrees);
}

export function normalizePlanOffset(offset = null) {
  return {
    x: Number.isFinite(offset?.x) ? offset.x : 0,
    y: Number.isFinite(offset?.y) ? offset.y : 0,
  };
}

export function normalizePlanLengthScale(value = 1) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(value, 0.01);
}

export function getSafeAxis(vector = null) {
  return normalize(vector?.x || vector?.y ? vector : { x: 1, y: 0 });
}

export function projectAlongAxis(point, pivot, axis) {
  return dot(subtract(point, pivot), axis);
}

export function reconstructFromAxis(pivot, axis, along, cross = 0) {
  const crossAxis = perpendicular(axis);
  return add(pivot, add(scale(axis, along), scale(crossAxis, cross)));
}

export function scalePlanPointAlongAxis(point, pivot, axis, lengthScale = 1) {
  const safeAxis = getSafeAxis(axis);
  const relative = subtract(point, pivot);
  const along = dot(relative, safeAxis);
  const cross = dot(relative, perpendicular(safeAxis));

  return reconstructFromAxis(pivot, safeAxis, along * normalizePlanLengthScale(lengthScale), cross);
}

export function translatePlanPoint(point, offset = null) {
  return add(point, normalizePlanOffset(offset));
}

export function transformPlanPoint(point, transform = {}) {
  const safeAxis = getSafeAxis(transform.axis);
  const rawPivot = transform.rawPivot || transform.pivot || { x: 0, y: 0 };
  const scaledPoint = scalePlanPointAlongAxis(
    point,
    rawPivot,
    safeAxis,
    normalizePlanLengthScale(transform.lengthScale)
  );
  const rotatedPoint = rotatePlanPoint(scaledPoint, rawPivot, transform.rotationDegrees || 0);
  return translatePlanPoint(rotatedPoint, transform.translation);
}

export function getDisplayedAxis(transform = {}) {
  return getSafeAxis(rotatePlanVector(transform.axis || { x: 1, y: 0 }, transform.rotationDegrees || 0));
}

export function angleFromPivot(pivot, point) {
  return Math.atan2(point.y - pivot.y, point.x - pivot.x) * (180 / Math.PI);
}

export function deltaAngleDegrees(startAngle, endAngle) {
  return normalizeSignedRotationDegrees(endAngle - startAngle);
}
