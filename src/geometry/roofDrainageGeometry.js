import { add, normalize, perpendicular, scale, subtract } from './point';
import { buildRoofPlaneGeometry } from './roofPlaneGeometry';
import { polygonCentroid } from './polygon';
import { buildRoofPlanGeometry } from './roofPlanGeometry';
import { buildDerivedRoofDrainage } from '@/roof/drainage';

function formatSlopeLabel(finishSlope) {
  const slope = Number(finishSlope) || 0;
  if (!slope) return '';
  return `${slope.toFixed(1)}%`;
}

function fallbackDirection() {
  return { x: 0, y: 1 };
}

function planeArrow(plane, label) {
  const outline = plane?.outline || [];
  if (outline.length < 3) return null;

  const centroid = polygonCentroid(outline);
  const rawDirection = plane.slopeDirection || fallbackDirection();
  const direction = normalize((rawDirection.x === 0 && rawDirection.y === 0) ? fallbackDirection() : rawDirection);
  const shaftLength = 1400;
  const shaftStart = add(centroid, scale(direction, -shaftLength * 0.35));
  const shaftEnd = add(centroid, scale(direction, shaftLength * 0.35));
  const headBase = shaftEnd;
  const headPerp = scale(perpendicular(direction), 120);

  return {
    id: `roof-plane-arrow-${plane.id}`,
    shaftStart,
    shaftEnd,
    headA: add(add(headBase, scale(direction, -40)), headPerp),
    headB: add(add(headBase, scale(direction, -40)), scale(headPerp, -1)),
    label,
    labelPosition: add(shaftStart, scale(direction, -140)),
  };
}

export function buildRoofSlopeArrows(roofSystem) {
  const boundaryPolygon = roofSystem?.boundaryPolygon || [];
  if (boundaryPolygon.length < 3) return [];

  const roofType = roofSystem?.roofType || 'flat';
  if (roofType !== 'flat') {
    const roofGeometry = buildRoofPlaneGeometry(roofSystem);
    return (roofGeometry.planes || [])
      .map((plane) => planeArrow(plane, formatSlopeLabel(plane.slope ?? roofGeometry.pitch?.slope)))
      .filter(Boolean);
  }

  const drains = roofSystem?.drains || [];
  const finishSlope = Number(roofSystem?.finishSlope) || 0;
  if (!drains.length || finishSlope <= 0) return [];

  const centroid = polygonCentroid(boundaryPolygon);
  const label = formatSlopeLabel(finishSlope);

  return drains.map((drain) => {
    const end = drain.position;
    const rawDirection = subtract(end, centroid);
    const direction = normalize((rawDirection.x === 0 && rawDirection.y === 0) ? fallbackDirection() : rawDirection);
    const shaftLength = 1200;
    const shaftEnd = add(end, scale(direction, -Math.max((drain.diameter ?? 120) * 0.65, 120)));
    const shaftStart = add(shaftEnd, scale(direction, -shaftLength));
    const headBase = shaftEnd;
    const headVector = scale(direction, 180);
    const headPerp = scale(perpendicular(direction), 120);

    return {
      id: `roof-slope-arrow-${drain.id}`,
      shaftStart,
      shaftEnd,
      headA: add(add(headBase, scale(direction, -40)), headPerp),
      headB: add(add(headBase, scale(direction, -40)), scale(headPerp, -1)),
      label,
      labelPosition: add(shaftStart, scale(headVector, -0.15)),
    };
  });
}

export function buildRoofDrainagePlanGeometry(roofSystem) {
  if (!roofSystem) {
    return {
      roofPlan: buildRoofPlanGeometry(null),
      arrows: [],
      gutters: [],
      downspouts: [],
      drains: [],
    };
  }

  const roofPlan = buildRoofPlanGeometry(roofSystem);
  const arrows = buildRoofSlopeArrows(roofSystem);
  const { gutters, downspouts } = buildDerivedRoofDrainage(roofSystem);

  return {
    roofPlan,
    arrows,
    gutters,
    downspouts,
    drains: roofPlan.drains || [],
  };
}
