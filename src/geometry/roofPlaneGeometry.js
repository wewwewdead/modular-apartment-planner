import { createRoofPitch, normalizeRoofPitchDirection } from '@/domain/roofModels';
import { deriveCustomRoofTopology } from '@/roof/customRoofTopology';
import { add, dot, normalize, perpendicular, scale, subtract } from './point';
import { pointInPolygon, polygonCentroid, signedPolygonArea } from './polygon';

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

function interpolateAxisIntersection(start, end, startValue, endValue, limit) {
  const denominator = endValue - startValue;
  if (Math.abs(denominator) < EPSILON) {
    return clonePoint(start);
  }

  const t = (limit - startValue) / denominator;
  return {
    x: start.x + ((end.x - start.x) * t),
    y: start.y + ((end.y - start.y) * t),
  };
}

function clipPolygonByAxis(points, origin, axis, limit, keepLessOrEqual) {
  const input = uniqueSequentialPoints(points);
  if (input.length < 3) return [];

  const output = [];
  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const previous = input[(index + input.length - 1) % input.length];
    const currentValue = axisValue(current, origin, axis);
    const previousValue = axisValue(previous, origin, axis);
    const currentInside = keepLessOrEqual
      ? currentValue <= limit + EPSILON
      : currentValue >= limit - EPSILON;
    const previousInside = keepLessOrEqual
      ? previousValue <= limit + EPSILON
      : previousValue >= limit - EPSILON;

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

function isConvexPolygon(points = []) {
  if (points.length < 3) return false;

  const normalized = ensureCounterClockwise(points);
  let sign = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const a = normalized[index];
    const b = normalized[(index + 1) % normalized.length];
    const c = normalized[(index + 2) % normalized.length];
    const ab = subtract(b, a);
    const bc = subtract(c, b);
    const cross = ab.x * bc.y - ab.y * bc.x;
    if (Math.abs(cross) < EPSILON) continue;

    const nextSign = Math.sign(cross);
    if (!sign) {
      sign = nextSign;
      continue;
    }
    if (nextSign !== sign) return false;
  }

  return true;
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

function ensureRoofOutline(boundaryPolygon, roofType, pitch) {
  const convexBoundary = isConvexPolygon(boundaryPolygon);
  const wantsOverhang = roofType !== 'flat' && roofType !== 'custom' && (pitch.overhang ?? 0) > EPSILON;
  const overhangApplied = wantsOverhang && convexBoundary;

  return {
    convexBoundary,
    overhangApplied,
    roofOutline: overhangApplied
      ? offsetConvexPolygon(boundaryPolygon, pitch.overhang)
      : clonePoints(boundaryPolygon),
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

function nearestPlaneByCentroid(planes = [], point) {
  if (!planes.length) return null;

  return [...planes]
    .sort((a, b) => {
      const aDistance = Math.hypot((a.centroid?.x || 0) - point.x, (a.centroid?.y || 0) - point.y);
      const bDistance = Math.hypot((b.centroid?.x || 0) - point.x, (b.centroid?.y || 0) - point.y);
      return aDistance - bDistance;
    })[0] || null;
}

function buildCustomPlane(roofSystem, plane) {
  const outline = ensureCounterClockwise(plane.boundaryPoints || []);
  const centroid = polygonCentroid(outline);
  const direction = normalizeRoofPitchDirection(plane.slopeDirection);
  const planeRange = axisRange(outline, centroid, direction);
  const ratio = slopeRatio(plane);
  const slabThickness = roofSystem?.slabThickness ?? 0;
  const baseElevation = plane.baseElevation ?? (roofSystem?.baseElevation ?? 0);

  function getRiseAtPoint(point) {
    const axisPosition = axisValue(point, centroid, direction);
    return Math.max(0, ratio * (planeRange.max - axisPosition));
  }

  function getSurfaceElevation(point, surface = 'top') {
    const rise = getRiseAtPoint(point);
    return surface === 'bottom'
      ? baseElevation + rise
      : baseElevation + slabThickness + rise;
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
    surfaceFactor: Math.sqrt(1 + (ratio * ratio)),
  };
}

function buildCustomRoofGeometry(roofSystem, boundaryPolygon) {
  const topology = deriveCustomRoofTopology(roofSystem);
  const planes = topology.roofPlanes.map((plane) => buildCustomPlane(roofSystem, plane));
  const roofOutline = uniqueSequentialPoints(topology.perimeterLoops?.[0] || boundaryPolygon);
  const centroid = roofOutline.length >= 3
    ? polygonCentroid(roofOutline)
    : polygonCentroid(boundaryPolygon);
  const direction = normalizeRoofPitchDirection(roofSystem?.pitch?.direction);

  function findContainingPlane(point) {
    const candidates = planes.filter((plane) => pointInPolygon(point, plane.outline || []));
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      return candidates.sort((a, b) => (
        b.getSurfaceElevation(point, 'top') - a.getSurfaceElevation(point, 'top')
      ))[0];
    }
    return nearestPlaneByCentroid(planes, point);
  }

  function getSurfaceElevation(point, surface = 'top') {
    const plane = findContainingPlane(point);
    if (!plane) {
      const baseElevation = roofSystem?.baseElevation ?? 0;
      return surface === 'bottom'
        ? baseElevation
        : baseElevation + (roofSystem?.slabThickness ?? 0);
    }
    return plane.getSurfaceElevation(point, surface);
  }

  const roofOutlineWithElevations = roofOutline.map((point) => ({
    ...point,
    topElevation: getSurfaceElevation(point, 'top'),
    bottomElevation: getSurfaceElevation(point, 'bottom'),
  }));
  const allPlaneOutlinePoints = planes.flatMap((plane) => (
    (plane.outline || []).map((point) => ({
      topElevation: plane.getSurfaceElevation(point, 'top'),
      bottomElevation: plane.getSurfaceElevation(point, 'bottom'),
    }))
  ));
  const elevationSamples = [...roofOutlineWithElevations, ...allPlaneOutlinePoints];
  const minBottomElevation = elevationSamples.length
    ? Math.min(...elevationSamples.map((point) => point.bottomElevation))
    : (roofSystem?.baseElevation ?? 0);
  const maxTopElevation = elevationSamples.length
    ? Math.max(...elevationSamples.map((point) => point.topElevation))
    : ((roofSystem?.baseElevation ?? 0) + (roofSystem?.slabThickness ?? 0));

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
      getSurfaceElevation: () => (roofSystem?.baseElevation ?? 0),
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
  const { convexBoundary, overhangApplied, roofOutline } = ensureRoofOutline(boundaryPolygon, roofType, pitch);
  const outlineRange = axisRange(roofOutline, centroid, direction);
  const baseElevation = roofSystem?.baseElevation ?? 0;
  const slabThickness = roofSystem?.slabThickness ?? 0;
  const ratio = slopeRatio({ pitch });
  const axisSpan = Math.max(0, outlineRange.max - outlineRange.min);
  const ridgeSpanMargin = axisSpan > 20 ? Math.min(axisSpan * 0.1, 10) : 0;
  const ridgeAxisValue = roofType === 'gable'
    ? clamp(
        pitch.ridgeOffset,
        outlineRange.min + ridgeSpanMargin,
        outlineRange.max - ridgeSpanMargin
      )
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
      return Math.max(0, gablePeakRise - (ratio * Math.abs(axisPosition - ridgeAxisValue)));
    }

    return 0;
  }

  function getSurfaceElevation(point, surface = 'top') {
    const rise = getRiseAtPoint(point);
    return surface === 'bottom'
      ? baseElevation + rise
      : baseElevation + slabThickness + rise;
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

    const ridgeHits = uniquePoints(collectAxisIntersections(roofOutline, centroid, direction, ridgeAxisValue))
      .sort((a, b) => axisValue(a, centroid, ridgeDirection) - axisValue(b, centroid, ridgeDirection));

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
        direction
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
    ridges: ridgeSegment ? [{
      id: `${roofSystem?.id || 'roof'}-ridge`,
      edgeId: `${roofSystem?.id || 'roof'}-ridge`,
      startPoint: clonePoint(ridgeSegment.start),
      endPoint: clonePoint(ridgeSegment.end),
      planeIds: planes.map((plane) => plane.id),
    }] : [],
    valleys: [],
    hips: [],
    minBottomElevation,
    maxTopElevation,
    getRiseAtPoint,
    getSurfaceElevation,
    findPlaneAtPoint: (point) => (
      (planes || []).find((plane) => pointInPolygon(point, plane.outline || []))
      || planes[0]
      || null
    ),
  };
}

export function getRoofSurfaceElevation(roofSystem, point, surface = 'top') {
  const geometry = buildRoofPlaneGeometry(roofSystem);
  return geometry.getSurfaceElevation(point, surface);
}
