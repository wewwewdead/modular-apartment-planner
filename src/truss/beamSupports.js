import { getBeamRenderData } from '@/geometry/beamGeometry';
import { add, dot, midpoint, normalize, perpendicular, scale, subtract } from '@/geometry/point';
import { distanceToSegment } from '@/geometry/line';
import { pointInPolygon } from '@/geometry/polygon';

const PARALLEL_TOLERANCE = 0.05;
const ELEVATION_TOLERANCE = 10;
const MIN_SUPPORT_LENGTH = 1000;
const MIN_TRUSS_SPAN = 300;

function cross(a, b) {
  return (a.x * b.y) - (a.y * b.x);
}

function projectPointOntoAxis(point, axis) {
  return dot(point, axis);
}

function pointOnAxisLine(axisPoint, axis, position) {
  return add(axisPoint, scale(axis, position - projectPointOntoAxis(axisPoint, axis)));
}

function getBeamTopElevation(beam) {
  return Number.isFinite(beam?.floorLevel) ? beam.floorLevel : 0;
}

function buildBeamData(floor, beam) {
  const renderData = getBeamRenderData(beam, floor?.columns || []);
  if (!renderData) return null;

  const axisVector = subtract(renderData.end, renderData.start);
  const axis = normalize(axisVector);
  if (!axis.x && !axis.y) return null;

  return {
    beam,
    renderData,
    axis,
    topElevation: getBeamTopElevation(beam),
  };
}

function resolveBeam(floor, beamId) {
  const beam = (floor?.beams || []).find((entry) => entry.id === beamId) || null;
  return beam ? buildBeamData(floor, beam) : null;
}

function orientPrimaryAxis(primary, secondary) {
  let axis = primary.axis;
  let spanDirection = perpendicular(axis);
  let signedOffset = dot(subtract(secondary.renderData.start, primary.renderData.start), spanDirection);

  if (signedOffset < 0) {
    axis = scale(axis, -1);
    spanDirection = perpendicular(axis);
    signedOffset = dot(subtract(secondary.renderData.start, primary.renderData.start), spanDirection);
  }

  return {
    axis,
    spanDirection,
    signedOffset,
  };
}

function resolveProjectedInterval(beamData, axis) {
  const start = projectPointOntoAxis(beamData.renderData.start, axis);
  const end = projectPointOntoAxis(beamData.renderData.end, axis);

  return {
    min: Math.min(start, end),
    max: Math.max(start, end),
  };
}

function getDefaultCountForSupportLength(supportLength, spacing) {
  const safeSpacing = Math.max(Number(spacing || 0), 300);
  return Math.max(1, Math.floor(supportLength / safeSpacing) + 1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getBeamSupportCountLimit(supportLength, spacing) {
  return getDefaultCountForSupportLength(supportLength, spacing);
}

export function getFloorBeamSupportData(floor) {
  return (floor?.beams || [])
    .map((beam) => buildBeamData(floor, beam))
    .filter(Boolean);
}

export function findBeamSupportAtPoint(floor, point, tolerance = 0) {
  const beamData = getFloorBeamSupportData(floor);

  for (const entry of beamData) {
    if (pointInPolygon(point, entry.renderData.outline)) {
      return entry;
    }

    const hitDistance = distanceToSegment(point, entry.renderData.start, entry.renderData.end);
    const maxDistance = Math.max((entry.beam.width || 0) / 2, tolerance);
    if (hitDistance <= maxDistance) {
      return entry;
    }
  }

  return null;
}

export function resolveBeamPairSupport(floor, startBeamId, endBeamId) {
  if (!floor) {
    return { valid: false, message: 'Select a floor before drawing trusses.' };
  }
  if (!startBeamId || !endBeamId) {
    return { valid: false, message: 'Select two support beams.' };
  }
  if (startBeamId === endBeamId) {
    return { valid: false, message: 'Select two different support beams.' };
  }

  const startBeam = resolveBeam(floor, startBeamId);
  const endBeam = resolveBeam(floor, endBeamId);
  if (!startBeam || !endBeam) {
    return { valid: false, message: 'Both support beams must remain valid.' };
  }

  const axisAlignment = Math.abs(cross(startBeam.axis, endBeam.axis));
  if (axisAlignment > PARALLEL_TOLERANCE) {
    return { valid: false, message: 'Support beams must be parallel.' };
  }

  if (Math.abs(startBeam.topElevation - endBeam.topElevation) > ELEVATION_TOLERANCE) {
    return { valid: false, message: 'Support beams must have matching top elevation.' };
  }

  const oriented = orientPrimaryAxis(startBeam, endBeam);
  const span = Math.abs(oriented.signedOffset);
  if (span < MIN_TRUSS_SPAN) {
    return { valid: false, message: 'Support beams are too close together for a truss span.' };
  }

  const startInterval = resolveProjectedInterval(startBeam, oriented.axis);
  const endInterval = resolveProjectedInterval(endBeam, oriented.axis);
  const overlapStart = Math.max(startInterval.min, endInterval.min);
  const overlapEnd = Math.min(startInterval.max, endInterval.max);
  const supportLength = overlapEnd - overlapStart;

  if (supportLength < MIN_SUPPORT_LENGTH) {
    return { valid: false, message: 'Support beams need a longer overlapping run.' };
  }

  const startSupportA = pointOnAxisLine(startBeam.renderData.start, oriented.axis, overlapStart);
  const endSupportA = pointOnAxisLine(startBeam.renderData.start, oriented.axis, overlapEnd);
  const startSupportB = pointOnAxisLine(endBeam.renderData.start, oriented.axis, overlapStart);
  const endSupportB = pointOnAxisLine(endBeam.renderData.start, oriented.axis, overlapEnd);

  return {
    valid: true,
    floorId: floor.id,
    supportBeamIds: {
      start: startBeam.beam.id,
      end: endBeam.beam.id,
    },
    startBeam: startBeam.beam,
    endBeam: endBeam.beam,
    startPoint: midpoint(startSupportA, startSupportB),
    endPoint: midpoint(endSupportA, endSupportB),
    span,
    supportLength,
    baseElevation: startBeam.topElevation,
    axis: oriented.axis,
    spanDirection: oriented.spanDirection,
    supportLines: {
      start: {
        startPoint: startSupportA,
        endPoint: endSupportA,
      },
      end: {
        startPoint: startSupportB,
        endPoint: endSupportB,
      },
    },
  };
}

export function deriveBeamSupportedInstanceGeometry(instance, floor) {
  const support = resolveBeamPairSupport(
    floor,
    instance?.supportBeamIds?.start || null,
    instance?.supportBeamIds?.end || null
  );
  if (!support.valid) return support;

  const spacing = Math.max(Number(instance?.spacing || 0), 300);
  const countLimit = getBeamSupportCountLimit(support.supportLength, spacing);
  const count = Number.isFinite(instance?.count)
    ? Math.max(1, Math.min(Math.round(instance.count), countLimit))
    : countLimit;
  const occupiedRunLength = spacing * Math.max(count - 1, 0);
  const maxOffset = Math.max(0, support.supportLength - occupiedRunLength);
  const requestedOffset = Number.isFinite(instance?.supportOffsetAlongAxis)
    ? instance.supportOffsetAlongAxis
    : 0;
  const effectiveOffset = clamp(requestedOffset, 0, maxOffset);
  const placementStartPoint = add(support.startPoint, scale(support.axis, effectiveOffset));
  const placementEndPoint = add(placementStartPoint, scale(support.axis, occupiedRunLength));

  return {
    ...support,
    spacing,
    countLimit,
    count,
    occupiedRunLength,
    maxOffset,
    requestedOffset,
    effectiveOffset,
    placementStartPoint,
    placementEndPoint,
  };
}
