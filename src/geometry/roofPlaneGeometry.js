import { createRoofPitch, normalizeRoofPitchDirection } from '@/domain/roofModels';
import { deriveCustomRoofTopology } from '@/roof/customRoofTopology';
import { add, dot, normalize, perpendicular, scale, subtract } from './point';
import { isConvexPolygon, pointInPolygon, polygonCentroid, signedPolygonArea } from './polygon';

const EPSILON = 1e-6;

function clonePoint(point) {
  return point ? { x: point.x, y: point.y } : null;
}

function clonePoints(points = []) {
  return points.map(clonePoint);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function ensureCounterClockwise(points = []) {
  const cloned = clonePoints(points);
  return signedPolygonArea(cloned) >= 0 ? cloned : cloned.reverse();
}

function restoreOrientation(points, reference = []) {
  if (!points.length) return points;
  return signedPolygonArea(reference) >= 0 ? points : [...points].reverse();
}

function uniqueSequentialPoints(points = []) {
  const unique = [];

  for (const point of points) {
    const previous = unique[unique.length - 1];
    if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 1e-4) {
      unique.push(point);
    }
  }

  if (unique.length > 1) {
    const first = unique[0];
    const last = unique[unique.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= 1e-4) {
      unique.pop();
    }
  }

  return unique;
}

function uniquePoints(points = []) {
  const unique = [];

  for (const point of points) {
    if (!unique.some((entry) => Math.hypot(entry.x - point.x, entry.y - point.y) <= 1e-4)) {
      unique.push(point);
    }
  }

  return uniqueSequentialPoints(unique);
}

function lineIntersection(a1, a2, b1, b2) {
  const da = subtract(a2, a1);
  const db = subtract(b2, b1);
  const denominator = da.x * db.y - da.y * db.x;

  if (Math.abs(denominator) < EPSILON) {
    return null;
  }

  const delta = subtract(b1, a1);
  const t = (delta.x * db.y - delta.y * db.x) / denominator;
  return add(a1, scale(da, t));
}

function axisValue(point, origin, axis) {
  return dot(subtract(point, origin), axis);
}

function axisRange(points, origin, axis) {
  const values = points.map((point) => axisValue(point, origin, axis));
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function pointFromAxisCoordinates(origin, axisX, axisY, x, y) {
  return add(add(origin, scale(axisX, x)), scale(axisY, y));
}

function interpolateAxisIntersection(start, end, startValue, endValue, limit) {
  const denominator = endValue - startValue;
  if (Math.abs(denominator) < EPSILON) {
    return clonePoint(start);
  }

  const t = (limit - startValue) / denominator;
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

export function clipPolygonByAxis(points, origin, axis, limit, keepLessOrEqual) {
  const input = uniqueSequentialPoints(points);
  if (input.length < 3) return [];

  const output = [];
  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const previous = input[(index + input.length - 1) % input.length];
    const currentValue = axisValue(current, origin, axis);
    const previousValue = axisValue(previous, origin, axis);
    const currentInside = keepLessOrEqual ? currentValue <= limit + EPSILON : currentValue >= limit - EPSILON;
    const previousInside = keepLessOrEqual ? previousValue <= limit + EPSILON : previousValue >= limit - EPSILON;

    if (currentInside) {
      if (!previousInside) {
        output.push(interpolateAxisIntersection(previous, current, previousValue, currentValue, limit));
      }
      output.push(clonePoint(current));
    } else if (previousInside) {
      output.push(interpolateAxisIntersection(previous, current, previousValue, currentValue, limit));
    }
  }

  return uniqueSequentialPoints(output);
}

function collectAxisIntersections(points, origin, axis, limit) {
  const hits = [];

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const startValue = axisValue(start, origin, axis) - limit;
    const endValue = axisValue(end, origin, axis) - limit;

    if (Math.abs(startValue) < EPSILON) {
      hits.push(clonePoint(start));
    }

    if ((startValue < -EPSILON && endValue > EPSILON) || (startValue > EPSILON && endValue < -EPSILON)) {
      hits.push(interpolateAxisIntersection(start, end, startValue, endValue, 0));
    }
  }

  return uniqueSequentialPoints(hits);
}

export function clipPolygonToAxisBand(points, origin, axis, minLimit, maxLimit) {
  if (maxLimit - minLimit <= EPSILON) return [];
  const highClipped = clipPolygonByAxis(points, origin, axis, maxLimit, true);
  return clipPolygonByAxis(highClipped, origin, axis, minLimit, false);
}

function offsetConvexPolygon(points = [], distance) {
  if (points.length < 3 || distance <= EPSILON) return clonePoints(points);

  const ccw = ensureCounterClockwise(points);
  const offsetPoints = [];

  for (let index = 0; index < ccw.length; index += 1) {
    const previous = ccw[(index + ccw.length - 1) % ccw.length];
    const current = ccw[index];
    const next = ccw[(index + 1) % ccw.length];
    const prevEdge = subtract(current, previous);
    const nextEdge = subtract(next, current);
    const prevLength = Math.hypot(prevEdge.x, prevEdge.y) || 1;
    const nextLength = Math.hypot(nextEdge.x, nextEdge.y) || 1;
    const prevNormal = { x: prevEdge.y / prevLength, y: -prevEdge.x / prevLength };
    const nextNormal = { x: nextEdge.y / nextLength, y: -nextEdge.x / nextLength };

    const prevStart = add(previous, scale(prevNormal, distance));
    const prevEnd = add(current, scale(prevNormal, distance));
    const nextStart = add(current, scale(nextNormal, distance));
    const nextEnd = add(next, scale(nextNormal, distance));
    const intersection = lineIntersection(prevStart, prevEnd, nextStart, nextEnd);

    if (intersection) {
      offsetPoints.push(intersection);
      continue;
    }

    const bisector = normalize(add(prevNormal, nextNormal));
    offsetPoints.push(add(current, scale(bisector, distance)));
  }

  return restoreOrientation(uniqueSequentialPoints(offsetPoints), points);
}

function slopeRatio(source) {
  return Math.max(0, Number(source?.pitch?.slope ?? source?.slope ?? 0)) / 100;
}

// Shape-profile rises are SIGNED since RT-3 (spec §7.2): an attached roof
// follows the truss top face from the start-heel datum, and its sloped tails
// sit below it.
function sampleShapeProfileRise(shapeProfile, ratio) {
  const points = (shapeProfile?.points || []).filter(
    (point) => Number.isFinite(point?.position) && Number.isFinite(point?.rise),
  );
  if (!points.length) return 0;
  if (points.length === 1) return points[0].rise;

  const ordered = [...points].sort((a, b) => a.position - b.position);
  // Beyond the profile (a roof overhang of its own past the truss tails) the
  // end segments continue: the roof keeps its slope out to its edge.
  const first = ordered[0];
  const second = ordered[1];
  const last = ordered[ordered.length - 1];
  const beforeLast = ordered[ordered.length - 2];
  if (ratio < first.position - EPSILON) {
    const run = second.position - first.position;
    return Math.abs(run) <= EPSILON
      ? first.rise
      : first.rise + ((second.rise - first.rise) * (ratio - first.position)) / run;
  }
  if (ratio > last.position + EPSILON) {
    const run = last.position - beforeLast.position;
    return Math.abs(run) <= EPSILON
      ? last.rise
      : last.rise + ((last.rise - beforeLast.rise) * (ratio - last.position)) / run;
  }
  const clampedRatio = clamp01(ratio);
  if (clampedRatio <= ordered[0].position + EPSILON) return ordered[0].rise;
  if (clampedRatio >= ordered[ordered.length - 1].position - EPSILON) {
    return ordered[ordered.length - 1].rise;
  }

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (clampedRatio < start.position - EPSILON || clampedRatio > end.position + EPSILON) continue;

    const span = end.position - start.position;
    if (Math.abs(span) <= EPSILON) return end.rise;

    const localRatio = (clampedRatio - start.position) / span;
    return start.rise + (end.rise - start.rise) * localRatio;
  }

  return ordered[ordered.length - 1].rise;
}

/**
 * The slab's vertical thickness factor (1 / cos θ) at a profile position: the
 * slope of the segment there; at a vertex the steeper of the two (the body
 * stays at least `slabThickness` thick square to both faces).
 */
function sampleShapeProfileThicknessFactor(shapeProfile, ratio, axisSpan) {
  const ordered = [...(shapeProfile?.points || [])]
    .filter((point) => Number.isFinite(point?.position) && Number.isFinite(point?.rise))
    .sort((a, b) => a.position - b.position);
  if (ordered.length < 2 || axisSpan <= EPSILON) return 1;
  const clampedRatio = clamp01(ratio);
  let factor = 0;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (clampedRatio < start.position - 1e-9 || clampedRatio > end.position + 1e-9) continue;
    const run = Math.max((end.position - start.position) * axisSpan, EPSILON);
    factor = Math.max(factor, Math.sqrt(1 + ((end.rise - start.rise) / run) ** 2));
  }
  return factor || 1;
}

/**
 * The peak of a shape profile, or null when there is no ridge: a flat profile
 * or one whose peak is at an edge of the roof (the high side of a shed is an
 * edge, not a ridge).
 */
function resolveShapeProfilePeakBand(shapeProfile) {
  const points = (shapeProfile?.points || []).filter(
    (point) => Number.isFinite(point?.position) && Number.isFinite(point?.rise),
  );
  if (!points.length) return null;

  const maxRise = Math.max(...points.map((point) => point.rise));
  const peakPoints = points.filter((point) => Math.abs(point.rise - maxRise) <= EPSILON);
  if (!peakPoints.length) return null;
  const minPosition = Math.min(...peakPoints.map((point) => point.position));
  const maxPosition = Math.max(...peakPoints.map((point) => point.position));
  if (minPosition <= EPSILON || maxPosition >= 1 - EPSILON) return null;

  return { maxRise, minPosition, maxPosition };
}

/**
 * The underside run slope (a ratio) a shape profile was built at: the stored
 * `slope` (RT-3.1, carried by `buildAttachedRoofShapeProfile`), else the
 * first segment's rise over its run across `axisSpan`.
 */
function resolveShapeProfileSlope(shapeProfile, axisSpan) {
  if (Number.isFinite(shapeProfile?.slope) && shapeProfile.slope > EPSILON) return shapeProfile.slope;
  const ordered = [...(shapeProfile?.points || [])]
    .filter((point) => Number.isFinite(point?.position) && Number.isFinite(point?.rise))
    .sort((a, b) => a.position - b.position);
  if (ordered.length < 2 || axisSpan <= EPSILON) return 0;
  const run = (ordered[1].position - ordered[0].position) * axisSpan;
  return run > EPSILON ? Math.abs(ordered[1].rise - ordered[0].rise) / run : 0;
}

/**
 * RT-3.1 (spec §7.8.2): a hand-set slope on an attached gable/shed pivots on
 * the start heel. Every signed rise of the truss profile (heel = 0) scales by
 * `manualSlope / profileSlope`, so the ridge lands at `manualSlope × run` and
 * the tails at `−manualSlope × overhang`. A profile with no slope of its own
 * is returned unchanged.
 */
function scaleShapeProfileToSlope(shapeProfile, manualSlope, axisSpan) {
  const profileSlope = resolveShapeProfileSlope(shapeProfile, axisSpan);
  if (profileSlope <= EPSILON || !Number.isFinite(manualSlope)) return shapeProfile;
  const factor = manualSlope / profileSlope;
  if (Math.abs(factor - 1) <= 1e-12) return shapeProfile;
  return {
    ...shapeProfile,
    slope: manualSlope,
    maxRise: Number.isFinite(shapeProfile?.maxRise) ? shapeProfile.maxRise * factor : shapeProfile?.maxRise,
    points: (shapeProfile?.points || []).map((point) => ({ ...point, rise: point.rise * factor })),
  };
}

function ensureRoofOutline(boundaryPolygon, roofType, pitch) {
  const convexBoundary = isConvexPolygon(boundaryPolygon);
  const wantsOverhang = roofType !== 'flat' && roofType !== 'custom' && (pitch.overhang ?? 0) > EPSILON;
  const overhangApplied = wantsOverhang && convexBoundary;

  return {
    convexBoundary,
    overhangApplied,
    roofOutline: overhangApplied ? offsetConvexPolygon(boundaryPolygon, pitch.overhang) : clonePoints(boundaryPolygon),
  };
}

function createPresetPlane(id, planeType, outline, slopeDirection) {
  return {
    id,
    planeType,
    outline: uniqueSequentialPoints(outline),
    slopeDirection,
    slope: 0,
    baseElevation: 0,
    material: '',
    heightRule: 'base_low_edge',
  };
}

function createShapeProfilePlane(id, planeType, outline, slopeDirection, slope, baseElevation, getSurfaceElevation) {
  return {
    ...createPresetPlane(id, planeType, outline, slopeDirection),
    slope,
    baseElevation,
    getSurfaceElevation,
    surfaceFactor: Math.sqrt(1 + Math.pow(Math.max(0, slope) / 100, 2)),
  };
}

function createRoofEdgeRelationship(id, edgeRole, startPoint, endPoint, planeIds = []) {
  return {
    id,
    edgeId: id,
    edgeRole,
    isPerimeter: false,
    startPoint: clonePoint(startPoint),
    endPoint: clonePoint(endPoint),
    planeIds: [...new Set((planeIds || []).filter(Boolean))],
  };
}

function buildHipRoofGeometry(
  roofSystem,
  roofType,
  boundaryPolygon,
  roofOutline,
  centroid,
  direction,
  ridgeDirection,
  pitch,
  outlineState = {},
) {
  const spanRange = axisRange(roofOutline, centroid, direction);
  const layoutRange = axisRange(roofOutline, centroid, ridgeDirection);
  const spanWidth = Math.max(0, spanRange.max - spanRange.min);
  const layoutLength = Math.max(0, layoutRange.max - layoutRange.min);
  const baseElevation = roofSystem?.baseElevation ?? 0;
  const slabThickness = roofSystem?.slabThickness ?? 0;
  const slope = pitch?.slope ?? 0;
  const ratio = slopeRatio({ pitch });

  if (spanWidth <= EPSILON || layoutLength <= EPSILON) {
    return null;
  }

  const spanMid = (spanRange.min + spanRange.max) / 2;
  const hipInset = Math.min(spanWidth / 2, layoutLength / 2);
  const ridgeStartValue = layoutRange.min + hipInset;
  const ridgeEndValue = layoutRange.max - hipInset;
  const ridgeStartPoint = pointFromAxisCoordinates(centroid, direction, ridgeDirection, spanMid, ridgeStartValue);
  const ridgeEndPoint = pointFromAxisCoordinates(centroid, direction, ridgeDirection, spanMid, ridgeEndValue);
  const hasRidge = ridgeEndValue - ridgeStartValue > EPSILON;

  function sideDistance(point) {
    const spanValue = axisValue(point, centroid, direction);
    return Math.max(0, Math.min(spanValue - spanRange.min, spanRange.max - spanValue));
  }

  function endDistance(point) {
    const layoutValue = axisValue(point, centroid, ridgeDirection);
    return Math.max(0, Math.min(layoutValue - layoutRange.min, layoutRange.max - layoutValue));
  }

  function getRiseAtPoint(point) {
    if (!point) return 0;
    return Math.max(0, ratio * Math.min(sideDistance(point), endDistance(point)));
  }

  // RT-3 (spec §7.2): the body is `slabThickness` thick SQUARE to its plane;
  // every hip plane has the same slope.
  const verticalThickness = slabThickness * Math.sqrt(1 + ratio * ratio);

  function getSurfaceElevation(point, surface = 'top') {
    const rise = getRiseAtPoint(point);
    return surface === 'bottom' ? baseElevation + rise : baseElevation + verticalThickness + rise;
  }

  function createPlaneOutline(localPoints) {
    const points = localPoints.map((point) =>
      pointFromAxisCoordinates(centroid, direction, ridgeDirection, point.x, point.y),
    );
    return restoreOrientation(uniqueSequentialPoints(points), roofOutline);
  }

  const leftOutline = createPlaneOutline([
    { x: spanRange.min, y: layoutRange.min },
    { x: spanRange.min, y: layoutRange.max },
    { x: spanMid, y: ridgeEndValue },
    { x: spanMid, y: ridgeStartValue },
  ]);
  const rightOutline = createPlaneOutline([
    { x: spanMid, y: ridgeStartValue },
    { x: spanMid, y: ridgeEndValue },
    { x: spanRange.max, y: layoutRange.max },
    { x: spanRange.max, y: layoutRange.min },
  ]);
  const startHipOutline = createPlaneOutline([
    { x: spanRange.min, y: layoutRange.min },
    { x: spanRange.max, y: layoutRange.min },
    { x: spanMid, y: ridgeStartValue },
  ]);
  const endHipOutline = createPlaneOutline([
    { x: spanRange.min, y: layoutRange.max },
    { x: spanMid, y: ridgeEndValue },
    { x: spanRange.max, y: layoutRange.max },
  ]);

  const planes = [];
  const leftPlane =
    leftOutline.length >= 3
      ? createShapeProfilePlane(
          `${roofSystem?.id || 'roof'}-hip-left`,
          'hip_left',
          leftOutline,
          scale(direction, -1),
          slope,
          baseElevation,
          getSurfaceElevation,
        )
      : null;
  const rightPlane =
    rightOutline.length >= 3
      ? createShapeProfilePlane(
          `${roofSystem?.id || 'roof'}-hip-right`,
          'hip_right',
          rightOutline,
          direction,
          slope,
          baseElevation,
          getSurfaceElevation,
        )
      : null;
  const startHipPlane =
    startHipOutline.length >= 3
      ? createShapeProfilePlane(
          `${roofSystem?.id || 'roof'}-hip-start`,
          'hip_start',
          startHipOutline,
          scale(ridgeDirection, -1),
          slope,
          baseElevation,
          getSurfaceElevation,
        )
      : null;
  const endHipPlane =
    endHipOutline.length >= 3
      ? createShapeProfilePlane(
          `${roofSystem?.id || 'roof'}-hip-end`,
          'hip_end',
          endHipOutline,
          ridgeDirection,
          slope,
          baseElevation,
          getSurfaceElevation,
        )
      : null;

  if (leftPlane) planes.push(leftPlane);
  if (rightPlane) planes.push(rightPlane);
  if (startHipPlane) planes.push(startHipPlane);
  if (endHipPlane) planes.push(endHipPlane);

  const roofOutlineWithElevations = roofOutline.map((point) => ({
    ...point,
    topElevation: getSurfaceElevation(point, 'top'),
    bottomElevation: getSurfaceElevation(point, 'bottom'),
  }));
  const elevationSamplePoints = uniquePoints([
    ...roofOutline,
    ...planes.flatMap((plane) => plane.outline || []),
    ridgeStartPoint,
    ridgeEndPoint,
  ]).map((point) => ({
    ...point,
    topElevation: getSurfaceElevation(point, 'top'),
    bottomElevation: getSurfaceElevation(point, 'bottom'),
  }));
  const minBottomElevation = Math.min(...elevationSamplePoints.map((point) => point.bottomElevation));
  const maxTopElevation = Math.max(...elevationSamplePoints.map((point) => point.topElevation));

  const roofEdges = [
    leftPlane && startHipPlane
      ? createRoofEdgeRelationship(
          `${roofSystem?.id || 'roof'}-hip-start-left`,
          'hip',
          pointFromAxisCoordinates(centroid, direction, ridgeDirection, spanRange.min, layoutRange.min),
          ridgeStartPoint,
          [leftPlane.id, startHipPlane.id],
        )
      : null,
    rightPlane && startHipPlane
      ? createRoofEdgeRelationship(
          `${roofSystem?.id || 'roof'}-hip-start-right`,
          'hip',
          pointFromAxisCoordinates(centroid, direction, ridgeDirection, spanRange.max, layoutRange.min),
          ridgeStartPoint,
          [rightPlane.id, startHipPlane.id],
        )
      : null,
    leftPlane && endHipPlane
      ? createRoofEdgeRelationship(
          `${roofSystem?.id || 'roof'}-hip-end-left`,
          'hip',
          pointFromAxisCoordinates(centroid, direction, ridgeDirection, spanRange.min, layoutRange.max),
          ridgeEndPoint,
          [leftPlane.id, endHipPlane.id],
        )
      : null,
    rightPlane && endHipPlane
      ? createRoofEdgeRelationship(
          `${roofSystem?.id || 'roof'}-hip-end-right`,
          'hip',
          pointFromAxisCoordinates(centroid, direction, ridgeDirection, spanRange.max, layoutRange.max),
          ridgeEndPoint,
          [rightPlane.id, endHipPlane.id],
        )
      : null,
  ].filter(Boolean);

  const ridges = hasRidge
    ? [
        {
          id: `${roofSystem?.id || 'roof'}-ridge`,
          edgeId: `${roofSystem?.id || 'roof'}-ridge`,
          startPoint: clonePoint(ridgeStartPoint),
          endPoint: clonePoint(ridgeEndPoint),
          planeIds: [leftPlane?.id, rightPlane?.id].filter(Boolean),
        },
      ]
    : [];
  const hips = roofEdges.map((edge) => ({
    id: edge.id,
    edgeId: edge.id,
    startPoint: clonePoint(edge.startPoint),
    endPoint: clonePoint(edge.endPoint),
    planeIds: [...edge.planeIds],
  }));

  return {
    roofType,
    boundaryPolygon,
    roofOutline,
    roofOutlineWithElevations,
    // The outline state ensureRoofOutline produced (the roof overhang IS applied
    // to roofOutline here), so the panel hint reads the truth.
    convexBoundary: Boolean(outlineState.convexBoundary),
    overhangApplied: Boolean(outlineState.overhangApplied),
    pitch,
    centroid,
    direction,
    ridgeDirection,
    ridgeAxisValue: spanMid,
    ridgeSegment: hasRidge
      ? {
          start: ridgeStartPoint,
          end: ridgeEndPoint,
        }
      : null,
    planes,
    roofEdges,
    ridges,
    valleys: [],
    hips,
    minBottomElevation,
    maxTopElevation,
    getRiseAtPoint,
    getSurfaceElevation,
    findPlaneAtPoint: (point) =>
      (planes || []).find((plane) => pointInPolygon(point, plane.outline || [])) || planes[0] || null,
  };
}

function buildProfileDrivenRoofGeometry(
  roofSystem,
  roofType,
  boundaryPolygon,
  roofOutline,
  centroid,
  direction,
  ridgeDirection,
  pitch,
  shapeProfile,
  options = {},
) {
  const outlineState = options.outlineState || {};
  // The profile spans the BOUNDARY (the truss tail-to-tail outline); a roof
  // overhang of its own (`roofOutline` offset past it) continues the end slopes.
  const roofRange = axisRange(roofOutline, centroid, direction);
  const outlineRange = boundaryPolygon?.length >= 3 ? axisRange(boundaryPolygon, centroid, direction) : roofRange;
  const axisSpan = Math.max(0, outlineRange.max - outlineRange.min);
  // Profile position 0 is the start-bearing side of the truss. It sits at the
  // axis MINIMUM, except for an attached shed, whose pitch direction is the
  // negated span axis (pitch directions point downhill app-wide).
  const reverse = Boolean(options.reverse);
  const axisAt = (position) =>
    reverse ? outlineRange.max - axisSpan * position : outlineRange.min + axisSpan * position;
  const baseElevation = roofSystem?.baseElevation ?? 0;
  const slabThickness = roofSystem?.slabThickness ?? 0;
  if (Number.isFinite(options.manualSlope)) {
    shapeProfile = scaleShapeProfileToSlope(shapeProfile, options.manualSlope, axisSpan);
  }
  const profilePoints = [...(shapeProfile?.points || [])]
    .filter((point) => Number.isFinite(point?.position) && Number.isFinite(point?.rise))
    .sort((a, b) => a.position - b.position);

  if (axisSpan <= EPSILON || profilePoints.length < 2) {
    return null;
  }

  function ratioAt(point) {
    const axisPosition = axisValue(point, centroid, direction);
    return reverse ? (outlineRange.max - axisPosition) / axisSpan : (axisPosition - outlineRange.min) / axisSpan;
  }

  function getRiseAtPoint(point) {
    if (!point) return 0;
    return sampleShapeProfileRise(shapeProfile, ratioAt(point));
  }

  // RT-3 (spec §7.2): `slabThickness` is measured square to each segment.
  function getSurfaceElevation(point, surface = 'top') {
    const rise = getRiseAtPoint(point);
    if (surface === 'bottom') return baseElevation + rise;
    const factor = point ? sampleShapeProfileThicknessFactor(shapeProfile, ratioAt(point), axisSpan) : 1;
    return baseElevation + slabThickness * factor + rise;
  }

  const planes = [];
  for (let index = 0; index < profilePoints.length - 1; index += 1) {
    const start = profilePoints[index];
    const end = profilePoints[index + 1];
    const bandA = axisAt(index === 0 ? Math.min(start.position, -1) : start.position);
    const bandB = axisAt(index === profilePoints.length - 2 ? Math.max(end.position, 2) : end.position);
    const bandOutline = clipPolygonToAxisBand(
      roofOutline,
      centroid,
      direction,
      Math.max(Math.min(bandA, bandB), roofRange.min - 1),
      Math.min(Math.max(bandA, bandB), roofRange.max + 1),
    );
    if (bandOutline.length < 3) continue;

    const segmentRun = Math.max((end.position - start.position) * axisSpan, EPSILON);
    const segmentSlope = Math.max(0, Math.abs(end.rise - start.rise) / segmentRun) * 100;
    // Downhill: against the way position grows when the segment rises.
    const positionAxis = reverse ? scale(direction, -1) : direction;
    const segmentDirection =
      end.rise > start.rise ? scale(positionAxis, -1) : end.rise < start.rise ? positionAxis : { x: 0, y: 0 };

    const planeType = segmentSlope <= EPSILON ? `${roofType}_crown` : `${roofType}_segment_${index + 1}`;
    planes.push(
      createShapeProfilePlane(
        `${roofSystem?.id || 'roof'}-${planeType}`,
        planeType,
        bandOutline,
        segmentDirection,
        segmentSlope,
        baseElevation,
        getSurfaceElevation,
      ),
    );
  }

  const roofOutlineWithElevations = roofOutline.map((point) => ({
    ...point,
    topElevation: getSurfaceElevation(point, 'top'),
    bottomElevation: getSurfaceElevation(point, 'bottom'),
  }));
  const minBottomElevation = Math.min(...roofOutlineWithElevations.map((point) => point.bottomElevation));
  const maxTopElevation = Math.max(...roofOutlineWithElevations.map((point) => point.topElevation));

  const peakBand = resolveShapeProfilePeakBand(shapeProfile);
  const ridgeAxisValue = peakBand ? axisAt((peakBand.minPosition + peakBand.maxPosition) / 2) : 0;
  const ridgeHits = peakBand
    ? uniquePoints(collectAxisIntersections(roofOutline, centroid, direction, ridgeAxisValue)).sort(
        (a, b) => axisValue(a, centroid, ridgeDirection) - axisValue(b, centroid, ridgeDirection),
      )
    : [];
  const ridgeSegment =
    ridgeHits.length >= 2
      ? {
          start: ridgeHits[0],
          end: ridgeHits[ridgeHits.length - 1],
        }
      : null;

  return {
    roofType,
    boundaryPolygon,
    roofOutline,
    roofOutlineWithElevations,
    // The outline state ensureRoofOutline produced (the roof overhang IS applied
    // to roofOutline here), so the panel hint reads the truth.
    convexBoundary: Boolean(outlineState.convexBoundary),
    overhangApplied: Boolean(outlineState.overhangApplied),
    pitch,
    centroid,
    direction,
    ridgeDirection,
    ridgeAxisValue,
    ridgeSegment,
    planes,
    roofEdges: [],
    ridges: ridgeSegment
      ? [
          {
            id: `${roofSystem?.id || 'roof'}-ridge`,
            edgeId: `${roofSystem?.id || 'roof'}-ridge`,
            startPoint: clonePoint(ridgeSegment.start),
            endPoint: clonePoint(ridgeSegment.end),
            planeIds: planes.map((plane) => plane.id),
          },
        ]
      : [],
    valleys: [],
    hips: [],
    minBottomElevation,
    maxTopElevation,
    getRiseAtPoint,
    getSurfaceElevation,
    findPlaneAtPoint: (point) =>
      (planes || []).find((plane) => pointInPolygon(point, plane.outline || [])) || planes[0] || null,
  };
}

function nearestPlaneByCentroid(planes = [], point) {
  if (!planes.length) return null;

  return (
    [...planes].sort((a, b) => {
      const aDistance = Math.hypot((a.centroid?.x || 0) - point.x, (a.centroid?.y || 0) - point.y);
      const bDistance = Math.hypot((b.centroid?.x || 0) - point.x, (b.centroid?.y || 0) - point.y);
      return aDistance - bDistance;
    })[0] || null
  );
}

function buildCustomPlane(roofSystem, plane) {
  const outline = ensureCounterClockwise(plane.boundaryPoints || []);
  const centroid = polygonCentroid(outline);
  const direction = normalizeRoofPitchDirection(plane.slopeDirection);
  const planeRange = axisRange(outline, centroid, direction);
  const ratio = slopeRatio(plane);
  const slabThickness = roofSystem?.slabThickness ?? 0;
  const baseElevation = plane.baseElevation ?? roofSystem?.baseElevation ?? 0;

  function getRiseAtPoint(point) {
    const axisPosition = axisValue(point, centroid, direction);
    return Math.max(0, ratio * (planeRange.max - axisPosition));
  }

  function getSurfaceElevation(point, surface = 'top') {
    const rise = getRiseAtPoint(point);
    return surface === 'bottom' ? baseElevation + rise : baseElevation + slabThickness + rise;
  }

  return {
    id: plane.id,
    name: plane.name || plane.id,
    planeType: plane.planeType || 'roof_plane',
    outline,
    boundaryPoints: outline,
    slope: plane.slope ?? 0,
    slopeDirection: direction,
    baseElevation,
    heightRule: plane.heightRule ?? 'base_low_edge',
    material: plane.material ?? '',
    centroid,
    axisRange: planeRange,
    getRiseAtPoint,
    getSurfaceElevation,
    surfaceFactor: Math.sqrt(1 + ratio * ratio),
  };
}

function buildCustomRoofGeometry(roofSystem, boundaryPolygon) {
  const topology = deriveCustomRoofTopology(roofSystem);
  const planes = topology.roofPlanes.map((plane) => buildCustomPlane(roofSystem, plane));
  const roofOutline = uniqueSequentialPoints(topology.perimeterLoops?.[0] || boundaryPolygon);
  const centroid = roofOutline.length >= 3 ? polygonCentroid(roofOutline) : polygonCentroid(boundaryPolygon);
  const direction = normalizeRoofPitchDirection(roofSystem?.pitch?.direction);

  function findContainingPlane(point) {
    const candidates = planes.filter((plane) => pointInPolygon(point, plane.outline || []));
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      return candidates.sort((a, b) => b.getSurfaceElevation(point, 'top') - a.getSurfaceElevation(point, 'top'))[0];
    }
    return nearestPlaneByCentroid(planes, point);
  }

  function getSurfaceElevation(point, surface = 'top') {
    const plane = findContainingPlane(point);
    if (!plane) {
      const baseElevation = roofSystem?.baseElevation ?? 0;
      return surface === 'bottom' ? baseElevation : baseElevation + (roofSystem?.slabThickness ?? 0);
    }
    return plane.getSurfaceElevation(point, surface);
  }

  const roofOutlineWithElevations = roofOutline.map((point) => ({
    ...point,
    topElevation: getSurfaceElevation(point, 'top'),
    bottomElevation: getSurfaceElevation(point, 'bottom'),
  }));
  const allPlaneOutlinePoints = planes.flatMap((plane) =>
    (plane.outline || []).map((point) => ({
      topElevation: plane.getSurfaceElevation(point, 'top'),
      bottomElevation: plane.getSurfaceElevation(point, 'bottom'),
    })),
  );
  const elevationSamples = [...roofOutlineWithElevations, ...allPlaneOutlinePoints];
  const minBottomElevation = elevationSamples.length
    ? Math.min(...elevationSamples.map((point) => point.bottomElevation))
    : (roofSystem?.baseElevation ?? 0);
  const maxTopElevation = elevationSamples.length
    ? Math.max(...elevationSamples.map((point) => point.topElevation))
    : (roofSystem?.baseElevation ?? 0) + (roofSystem?.slabThickness ?? 0);

  return {
    roofType: 'custom',
    boundaryPolygon,
    roofOutline,
    roofOutlineWithElevations,
    convexBoundary: false,
    overhangApplied: false,
    pitch: createRoofPitch(roofSystem?.pitch),
    centroid,
    direction,
    ridgeDirection: normalize(perpendicular(direction)),
    ridgeAxisValue: 0,
    ridgeSegment: null,
    planes,
    roofEdges: topology.roofEdges || [],
    ridges: topology.ridges || [],
    valleys: topology.valleys || [],
    hips: topology.hips || [],
    minBottomElevation,
    maxTopElevation,
    getRiseAtPoint: (point) => Math.max(0, getSurfaceElevation(point, 'bottom') - (roofSystem?.baseElevation ?? 0)),
    getSurfaceElevation,
    findPlaneAtPoint: findContainingPlane,
  };
}

export function buildRoofPlaneGeometry(roofSystem) {
  const boundaryPolygon = clonePoints(roofSystem?.boundaryPolygon || []);
  const roofType = roofSystem?.roofType || 'flat';

  if (boundaryPolygon.length < 3) {
    return {
      roofType,
      boundaryPolygon,
      roofOutline: boundaryPolygon,
      convexBoundary: false,
      overhangApplied: false,
      pitch: createRoofPitch(),
      centroid: { x: 0, y: 0 },
      direction: normalizeRoofPitchDirection(),
      ridgeDirection: { x: -1, y: 0 },
      ridgeAxisValue: 0,
      ridgeSegment: null,
      planes: [],
      roofEdges: [],
      ridges: [],
      valleys: [],
      hips: [],
      minBottomElevation: roofSystem?.baseElevation ?? 0,
      maxTopElevation: (roofSystem?.baseElevation ?? 0) + (roofSystem?.slabThickness ?? 0),
      getSurfaceElevation: () => roofSystem?.baseElevation ?? 0,
      getRiseAtPoint: () => 0,
      findPlaneAtPoint: () => null,
    };
  }

  if (roofType === 'custom') {
    return buildCustomRoofGeometry(roofSystem, boundaryPolygon);
  }

  const pitch = createRoofPitch(roofSystem?.pitch);
  const centroid = polygonCentroid(boundaryPolygon);
  const direction = normalizeRoofPitchDirection(pitch.direction);
  const ridgeDirection = normalize(perpendicular(direction));
  const attachedShapeProfile = roofSystem?.attachedShapeProfile || null;
  const { convexBoundary, overhangApplied, roofOutline } = ensureRoofOutline(boundaryPolygon, roofType, pitch);

  if (roofType === 'hip') {
    const hipGeometry = buildHipRoofGeometry(
      roofSystem,
      roofType,
      boundaryPolygon,
      roofOutline,
      centroid,
      direction,
      ridgeDirection,
      pitch,
      { convexBoundary, overhangApplied },
    );
    if (hipGeometry) return hipGeometry;
  }

  // Every ATTACHED roof but hip and custom follows the truss profile (RT-3,
  // spec §7.2): the box-gable family always did; an attached gable or shed
  // does too, whatever its pitch source (RT-3.1, §7.8.2): a hand-set slope
  // (pitchSource 'manual') scales the profile's rises about the start heel.
  // Detached gable/shed keep the preset formula.
  const attachedGableOrShed = ['gable', 'shed'].includes(roofType) && Boolean(roofSystem?.trussAttachmentId);
  const followsTrussProfile =
    attachedShapeProfile?.points?.length >= 2 &&
    (['box_gable', 'pyramid_hipped', 'domed', 'dropped_eaves'].includes(roofType) || attachedGableOrShed);
  if (followsTrussProfile) {
    const profileGeometry = buildProfileDrivenRoofGeometry(
      roofSystem,
      roofType,
      boundaryPolygon,
      roofOutline,
      centroid,
      direction,
      ridgeDirection,
      pitch,
      attachedShapeProfile,
      {
        reverse: roofType === 'shed',
        outlineState: { convexBoundary, overhangApplied },
        manualSlope: attachedGableOrShed && roofSystem?.pitchSource === 'manual' ? slopeRatio({ pitch }) : undefined,
      },
    );
    if (profileGeometry) return profileGeometry;
  }

  const outlineRange = axisRange(roofOutline, centroid, direction);
  const baseElevation = roofSystem?.baseElevation ?? 0;
  const slabThickness = roofSystem?.slabThickness ?? 0;
  const ratio = slopeRatio({ pitch });
  const axisSpan = Math.max(0, outlineRange.max - outlineRange.min);
  const ridgeSpanMargin = axisSpan > 20 ? Math.min(axisSpan * 0.1, 10) : 0;
  const ridgeAxisValue =
    roofType === 'gable'
      ? clamp(pitch.ridgeOffset, outlineRange.min + ridgeSpanMargin, outlineRange.max - ridgeSpanMargin)
      : 0;
  const gableLeftSpan = Math.max(0, ridgeAxisValue - outlineRange.min);
  const gableRightSpan = Math.max(0, outlineRange.max - ridgeAxisValue);
  const gablePeakRise = ratio * Math.max(gableLeftSpan, gableRightSpan);

  function getRiseAtPoint(point) {
    if (!point) return 0;
    const axisPosition = axisValue(point, centroid, direction);

    if (roofType === 'shed') {
      return Math.max(0, ratio * (outlineRange.max - axisPosition));
    }

    if (roofType === 'gable') {
      return Math.max(0, gablePeakRise - ratio * Math.abs(axisPosition - ridgeAxisValue));
    }

    return 0;
  }

  // RT-3 (spec §7.2): the body is `slabThickness` thick square to the plane
  // (a 180 slab at 25 % is 185.6 deep plumb); a flat roof is unchanged.
  const verticalThickness =
    roofType === 'gable' || roofType === 'shed' ? slabThickness * Math.sqrt(1 + ratio * ratio) : slabThickness;

  function getSurfaceElevation(point, surface = 'top') {
    const rise = getRiseAtPoint(point);
    return surface === 'bottom' ? baseElevation + rise : baseElevation + verticalThickness + rise;
  }

  const planes = [];
  let ridgeSegment = null;

  if (roofType === 'gable') {
    const leftOutline = clipPolygonByAxis(roofOutline, centroid, direction, ridgeAxisValue, true);
    const rightOutline = clipPolygonByAxis(roofOutline, centroid, direction, ridgeAxisValue, false);
    if (leftOutline.length >= 3) {
      planes.push({
        ...createPresetPlane(`${roofSystem.id}-gable-left`, 'gable_left', leftOutline, scale(direction, -1)),
        slope: pitch.slope ?? 0,
        baseElevation,
      });
    }
    if (rightOutline.length >= 3) {
      planes.push({
        ...createPresetPlane(`${roofSystem.id}-gable-right`, 'gable_right', rightOutline, direction),
        slope: pitch.slope ?? 0,
        baseElevation,
      });
    }

    const ridgeHits = uniquePoints(collectAxisIntersections(roofOutline, centroid, direction, ridgeAxisValue)).sort(
      (a, b) => axisValue(a, centroid, ridgeDirection) - axisValue(b, centroid, ridgeDirection),
    );

    if (ridgeHits.length >= 2) {
      ridgeSegment = {
        start: ridgeHits[0],
        end: ridgeHits[ridgeHits.length - 1],
      };
    }
  } else {
    planes.push({
      ...createPresetPlane(
        `${roofSystem?.id || 'roof'}-${roofType || 'flat'}`,
        roofType === 'shed' ? 'shed' : 'flat',
        roofOutline,
        direction,
      ),
      slope: pitch.slope ?? 0,
      baseElevation,
    });
  }

  const roofOutlineWithElevations = roofOutline.map((point) => ({
    ...point,
    topElevation: getSurfaceElevation(point, 'top'),
    bottomElevation: getSurfaceElevation(point, 'bottom'),
  }));
  const minBottomElevation = Math.min(...roofOutlineWithElevations.map((point) => point.bottomElevation));
  const maxTopElevation = Math.max(...roofOutlineWithElevations.map((point) => point.topElevation));

  return {
    roofType,
    boundaryPolygon,
    roofOutline,
    roofOutlineWithElevations,
    convexBoundary,
    overhangApplied,
    pitch,
    centroid,
    direction,
    ridgeDirection,
    ridgeAxisValue,
    ridgeSegment,
    planes,
    roofEdges: [],
    ridges: ridgeSegment
      ? [
          {
            id: `${roofSystem?.id || 'roof'}-ridge`,
            edgeId: `${roofSystem?.id || 'roof'}-ridge`,
            startPoint: clonePoint(ridgeSegment.start),
            endPoint: clonePoint(ridgeSegment.end),
            planeIds: planes.map((plane) => plane.id),
          },
        ]
      : [],
    valleys: [],
    hips: [],
    minBottomElevation,
    maxTopElevation,
    getRiseAtPoint,
    getSurfaceElevation,
    findPlaneAtPoint: (point) =>
      (planes || []).find((plane) => pointInPolygon(point, plane.outline || [])) || planes[0] || null,
  };
}

export function getRoofSurfaceElevation(roofSystem, point, surface = 'top') {
  const geometry = buildRoofPlaneGeometry(roofSystem);
  return geometry.getSurfaceElevation(point, surface);
}
