import { add, dot, perpendicular, scale, subtract } from '@/geometry/point';

const EPSILON = 1e-6;

/**
 * Plan-frame helpers shared by everything that traces a truss system in plan
 * (roof outlines, ceiling boundaries). A truss system has two natural axes:
 * the layout axis the copies march along, and the span axis each truss runs
 * across. Working in that frame keeps derived boundaries square to the trusses
 * no matter how the system sits on the plan.
 */

export function normalizePlanVector(vector, fallback = { x: 1, y: 0 }) {
  const x = Number(vector?.x || 0);
  const y = Number(vector?.y || 0);
  const length = Math.hypot(x, y);
  if (length <= EPSILON) {
    return { ...fallback };
  }

  return {
    x: x / length,
    y: y / length,
  };
}

export function projectPointOntoAxis(point, origin, axis) {
  return dot(subtract(point, origin), axis);
}

export function pointFromAxisCoordinates(origin, axisX, axisY, x, y) {
  return add(add(origin, scale(axisX, x)), scale(axisY, y));
}

// Overall copy extents: structural span plus the overhangs, i.e. what the roof
// covers.
export function collectSystemCopyPlanPoints(systemGeometry) {
  return (systemGeometry?.instances || []).flatMap((instanceGeometry) =>
    (instanceGeometry.copies || []).flatMap((copy) => [copy.overallStartPoint, copy.overallEndPoint]),
  );
}

// Structural copy extents: the bearing points at each end of the bottom chord,
// i.e. what the truss actually carries.
export function collectSystemCopyBearingPoints(systemGeometry) {
  return (systemGeometry?.instances || []).flatMap((instanceGeometry) =>
    (instanceGeometry.copies || []).flatMap((copy) => [copy.structuralStartPoint, copy.structuralEndPoint]),
  );
}

export function collectSystemLayoutGuidePoints(systemGeometry) {
  return (systemGeometry?.instances || []).flatMap((instanceGeometry) =>
    [instanceGeometry.layoutLineStartPoint, instanceGeometry.layoutLineEndPoint].filter(Boolean),
  );
}

export function resolveSystemPlanAxes(systemGeometry) {
  const instanceGeometry =
    (systemGeometry?.instances || []).find(
      (entry) => (entry.copies || []).length || (entry.layoutLineStartPoint && entry.layoutLineEndPoint),
    ) || null;
  if (!instanceGeometry) return null;

  const firstCopy = instanceGeometry.copies?.[0] || null;
  const layoutAxis = normalizePlanVector(
    subtract(
      instanceGeometry.layoutLineEndPoint || instanceGeometry.layoutLineStartPoint || { x: 1, y: 0 },
      instanceGeometry.layoutLineStartPoint || { x: 0, y: 0 },
    ),
  );
  let spanAxis = firstCopy
    ? normalizePlanVector(subtract(firstCopy.overallEndPoint, firstCopy.overallStartPoint), perpendicular(layoutAxis))
    : perpendicular(layoutAxis);

  if (Math.abs(dot(layoutAxis, spanAxis)) > 0.95) {
    spanAxis = perpendicular(layoutAxis);
  }

  return {
    origin: systemGeometry.transform?.pivot ||
      instanceGeometry.layoutLineStartPoint ||
      firstCopy?.overallStartPoint || { x: 0, y: 0 },
    layoutAxis,
    spanAxis,
  };
}

export function resolveSystemLayoutRange(systemGeometry, planAxes) {
  const copyPlanPoints = collectSystemCopyPlanPoints(systemGeometry);
  if (!planAxes || !copyPlanPoints.length) return null;

  let values = copyPlanPoints.map((point) => projectPointOntoAxis(point, planAxes.origin, planAxes.layoutAxis));

  // A single copy has no run of its own, so the layout line it sits on stands
  // in for one.
  if (Math.max(...values) - Math.min(...values) <= EPSILON) {
    const layoutGuidePoints = collectSystemLayoutGuidePoints(systemGeometry);
    if (layoutGuidePoints.length) {
      values = layoutGuidePoints.map((point) => projectPointOntoAxis(point, planAxes.origin, planAxes.layoutAxis));
    }
  }

  return { min: Math.min(...values), max: Math.max(...values) };
}

export function buildSystemBoundary(planAxes, spanRange, layoutRange) {
  if (!planAxes || !spanRange || !layoutRange) return null;
  if (spanRange.max - spanRange.min <= EPSILON || layoutRange.max - layoutRange.min <= EPSILON) {
    return null;
  }

  return [
    pointFromAxisCoordinates(planAxes.origin, planAxes.spanAxis, planAxes.layoutAxis, spanRange.min, layoutRange.min),
    pointFromAxisCoordinates(planAxes.origin, planAxes.spanAxis, planAxes.layoutAxis, spanRange.max, layoutRange.min),
    pointFromAxisCoordinates(planAxes.origin, planAxes.spanAxis, planAxes.layoutAxis, spanRange.max, layoutRange.max),
    pointFromAxisCoordinates(planAxes.origin, planAxes.spanAxis, planAxes.layoutAxis, spanRange.min, layoutRange.max),
  ];
}
