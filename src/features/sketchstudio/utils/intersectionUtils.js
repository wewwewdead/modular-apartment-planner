import { getQuadraticDerivative, getQuadraticFlatness, getQuadraticPoint } from './arcUtils';
import { getRectCorners } from './entityUtils';
import { getPolylineSegments } from './polylineUtils';

/**
 * Pairwise intersection points between sketch geometry, in millimetres.
 *
 * Every entity is reduced to a list of PRIMITIVE CURVES:
 *   segment  — a straight piece (line, polyline/rect edge, flattened ellipse edge)
 *   circle   — a full circle, parameterised by t in [0, 1] over 2*PI
 *   bezier   — a quadratic Bézier, which is what an `arc` entity actually is
 *
 * PRECISION
 * ---------
 *   segment x segment  closed form (2x2 solve)
 *   segment x circle   closed form (quadratic in the segment parameter)
 *   circle  x circle   closed form (radical line)
 *   segment x bezier   closed form: the signed distance from a quadratic Bézier
 *                      to a straight line is itself a quadratic in t, so the
 *                      roots are exact rather than sampled. Tangency shows up
 *                      as a (near-)zero discriminant and reports ONE point.
 *   circle  x bezier   the arc is flattened at ARC_FLATTEN_TOLERANCE (0.05 mm)
 *                      to bracket sign changes of g(t) = |P(t) - c| - r, then
 *                      each bracket is refined by PARAMETER BISECTION to
 *                      ~1e-12 of the parameter span (well under 1e-6 mm on
 *                      apartment-scale geometry). Tangential contact is picked
 *                      up separately as a local minimum of |g|.
 *   bezier  x bezier   both arcs are flattened at ARC_FLATTEN_TOLERANCE, the
 *                      flattened crossings seed a 2-D Newton iteration on
 *                      A(u) - B(v) = 0, which converges to |A(u) - B(v)| < 1e-9 mm.
 *                      A purely TANGENTIAL arc-to-arc touch (no crossing in the
 *                      flattened seeds) is not reported — documented limitation.
 *
 * COLLINEAR OVERLAP POLICY
 * ------------------------
 * Parallel curves report NO intersection points — including collinear segments
 * that overlap or merely touch end-to-end. Two collinear segments share an
 * infinite point set, which is not a "cut" in any tool that consumes this
 * module: trim needs transverse crossings to bound a span, and returning the
 * overlap endpoints would carve pieces out of geometry the user never crossed.
 * The same rule makes concentric circles (identical or not) report nothing.
 */

/** Chord tolerance an arc/ellipse is flattened to before numeric refinement. */
export const ARC_FLATTEN_TOLERANCE = 0.05;

/** Two intersection points closer than this (mm) are the same point. */
export const INTERSECTION_TOLERANCE = 1e-6;

// |sin(angle)| between two directions below this counts as parallel.
const PARALLEL_EPSILON = 1e-10;
// Slack allowed at the ends of a bounded parameter range.
const PARAM_EPSILON = 1e-9;
const MIN_FLATTEN_SEGMENTS = 4;
const MAX_FLATTEN_SEGMENTS = 512;
const ELLIPSE_MIN_SEGMENTS = 24;
const ELLIPSE_MAX_SEGMENTS = 512;
const BISECTION_ITERATIONS = 80;
const TERNARY_ITERATIONS = 80;
const NEWTON_ITERATIONS = 32;
const NEWTON_CONVERGENCE = 1e-9;

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

export function createSegmentCurve(a, b) {
  return { kind: 'segment', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
}

export function createCircleCurve(center, radius) {
  return { kind: 'circle', center: { x: center.x, y: center.y }, radius: Math.abs(radius) };
}

export function createBezierCurve(p0, p1, p2) {
  return {
    kind: 'bezier',
    p0: { x: p0.x, y: p0.y },
    p1: { x: p1.x, y: p1.y },
    p2: { x: p2.x, y: p2.y },
  };
}

export function evaluateCurve(curve, t) {
  if (curve.kind === 'segment') {
    return {
      x: curve.a.x + (curve.b.x - curve.a.x) * t,
      y: curve.a.y + (curve.b.y - curve.a.y) * t,
    };
  }

  if (curve.kind === 'circle') {
    const angle = t * Math.PI * 2;
    return {
      x: curve.center.x + Math.cos(angle) * curve.radius,
      y: curve.center.y + Math.sin(angle) * curve.radius,
    };
  }

  return getQuadraticPoint(curve.p0, curve.p1, curve.p2, t);
}

export function evaluateCurveDerivative(curve, t) {
  if (curve.kind === 'segment') {
    return { x: curve.b.x - curve.a.x, y: curve.b.y - curve.a.y };
  }

  if (curve.kind === 'circle') {
    const angle = t * Math.PI * 2;
    return {
      x: -Math.sin(angle) * curve.radius * Math.PI * 2,
      y: Math.cos(angle) * curve.radius * Math.PI * 2,
    };
  }

  return getQuadraticDerivative(curve.p0, curve.p1, curve.p2, t);
}

function getFlattenSegmentCount(curve, tolerance) {
  if (curve.kind === 'segment') {
    return 1;
  }

  const safeTolerance = Math.max(tolerance, 1e-6);

  if (curve.kind === 'circle') {
    // Sagitta of a chord spanning `angle` on radius r is ~ r*angle^2/8.
    const angle = Math.sqrt((8 * safeTolerance) / Math.max(curve.radius, 1e-6));
    const count = Math.ceil((Math.PI * 2) / Math.max(angle, 1e-6));
    return Math.min(Math.max(count, ELLIPSE_MIN_SEGMENTS), ELLIPSE_MAX_SEGMENTS);
  }

  // Uniformly splitting a quadratic into n pieces cuts its chord deviation by n^2.
  const deviation = getQuadraticFlatness(curve.p0, curve.p1, curve.p2);
  const count = Math.ceil(Math.sqrt(deviation / safeTolerance));
  return Math.min(Math.max(count, MIN_FLATTEN_SEGMENTS), MAX_FLATTEN_SEGMENTS);
}

/** Sample a curve into `{ t, point }` stations no further than `tolerance` off it. */
export function flattenCurve(curve, tolerance = ARC_FLATTEN_TOLERANCE) {
  const count = getFlattenSegmentCount(curve, tolerance);
  const stations = [];

  for (let index = 0; index <= count; index += 1) {
    const t = index / count;
    stations.push({ t, point: evaluateCurve(curve, t) });
  }

  return stations;
}

export function flattenCurveToPoints(curve, tolerance = ARC_FLATTEN_TOLERANCE) {
  return flattenCurve(curve, tolerance).map((station) => station.point);
}

function curveBoundingBox(curve) {
  if (curve.kind === 'segment') {
    return {
      minX: Math.min(curve.a.x, curve.b.x),
      minY: Math.min(curve.a.y, curve.b.y),
      maxX: Math.max(curve.a.x, curve.b.x),
      maxY: Math.max(curve.a.y, curve.b.y),
    };
  }

  if (curve.kind === 'circle') {
    return {
      minX: curve.center.x - curve.radius,
      minY: curve.center.y - curve.radius,
      maxX: curve.center.x + curve.radius,
      maxY: curve.center.y + curve.radius,
    };
  }

  // The convex hull of the control points bounds a Bézier.
  const xs = [curve.p0.x, curve.p1.x, curve.p2.x];
  const ys = [curve.p0.y, curve.p1.y, curve.p2.y];
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function boxesOverlap(left, right, slack) {
  return !(
    left.maxX < right.minX - slack ||
    left.minX > right.maxX + slack ||
    left.maxY < right.minY - slack ||
    left.minY > right.maxY + slack
  );
}

function isSamePoint(left, right, tolerance = INTERSECTION_TOLERANCE) {
  const scale = 1 + (Math.abs(left.x) + Math.abs(left.y)) * 1e-9;
  return Math.hypot(left.x - right.x, left.y - right.y) <= tolerance * scale;
}

export function dedupeIntersectionPoints(points, tolerance = INTERSECTION_TOLERANCE) {
  const unique = [];

  for (const point of points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
      continue;
    }

    if (!unique.some((existing) => isSamePoint(existing, point, tolerance))) {
      unique.push({ x: point.x, y: point.y });
    }
  }

  return unique;
}

function withinUnitRange(value) {
  return value >= -PARAM_EPSILON && value <= 1 + PARAM_EPSILON;
}

function intersectSegmentSegment(first, second) {
  const r = subtract(first.b, first.a);
  const s = subtract(second.b, second.a);
  const denominator = r.x * s.y - r.y * s.x;
  const scale = Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y);

  // Parallel (which includes collinear overlap) reports nothing. See the module
  // header: an overlap is not a cut.
  if (!scale || Math.abs(denominator) <= scale * PARALLEL_EPSILON) {
    return [];
  }

  const delta = subtract(second.a, first.a);
  const t = (delta.x * s.y - delta.y * s.x) / denominator;
  const u = (delta.x * r.y - delta.y * r.x) / denominator;

  if (!withinUnitRange(t) || !withinUnitRange(u)) {
    return [];
  }

  return [{ x: first.a.x + r.x * t, y: first.a.y + r.y * t }];
}

function intersectSegmentCircle(segment, circle) {
  const direction = subtract(segment.b, segment.a);
  const length = Math.hypot(direction.x, direction.y);

  if (!length || !circle.radius) {
    return [];
  }

  const unit = { x: direction.x / length, y: direction.y / length };
  const offset = subtract(segment.a, circle.center);
  const projection = dot(offset, unit);
  // Roots of |offset + s*unit|^2 = r^2 in arc-length s along the segment.
  const discriminant = projection * projection - (dot(offset, offset) - circle.radius * circle.radius);
  const tangentTolerance = Math.max(circle.radius, 1) * 1e-9;

  if (discriminant < -tangentTolerance * tangentTolerance) {
    return [];
  }

  const root = Math.sqrt(Math.max(discriminant, 0));
  const candidates = root <= tangentTolerance ? [-projection] : [-projection - root, -projection + root];

  return candidates
    .map((s) => s / length)
    .filter(withinUnitRange)
    .map((t) => ({ x: segment.a.x + direction.x * t, y: segment.a.y + direction.y * t }));
}

function intersectCircleCircle(first, second) {
  const delta = subtract(second.center, first.center);
  const distance = Math.hypot(delta.x, delta.y);
  const scale = Math.max(first.radius, second.radius, 1);
  const tolerance = scale * 1e-9;

  // Concentric circles either coincide entirely or never meet; both report none.
  if (distance <= tolerance) {
    return [];
  }

  if (distance > first.radius + second.radius + tolerance) {
    return [];
  }

  if (distance < Math.abs(first.radius - second.radius) - tolerance) {
    return [];
  }

  const a = (distance * distance - second.radius * second.radius + first.radius * first.radius) / (2 * distance);
  const heightSquared = first.radius * first.radius - a * a;
  const unit = { x: delta.x / distance, y: delta.y / distance };
  const base = { x: first.center.x + unit.x * a, y: first.center.y + unit.y * a };

  if (heightSquared <= tolerance * tolerance) {
    return [base];
  }

  const height = Math.sqrt(heightSquared);

  return [
    { x: base.x - unit.y * height, y: base.y + unit.x * height },
    { x: base.x + unit.y * height, y: base.y - unit.x * height },
  ];
}

function intersectSegmentBezier(segment, bezier) {
  const direction = subtract(segment.b, segment.a);
  const length = Math.hypot(direction.x, direction.y);

  if (!length) {
    return [];
  }

  const normal = { x: -direction.y / length, y: direction.x / length };
  // f(t) = (P(t) - segment.a) . normal is exactly quadratic in t.
  const c = dot(subtract(bezier.p0, segment.a), normal);
  const b = 2 * dot(subtract(bezier.p1, bezier.p0), normal);
  const a = dot(
    { x: bezier.p0.x - 2 * bezier.p1.x + bezier.p2.x, y: bezier.p0.y - 2 * bezier.p1.y + bezier.p2.y },
    normal,
  );
  const coefficientScale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), 1);
  const roots = [];

  if (Math.abs(a) <= coefficientScale * 1e-12) {
    if (Math.abs(b) > coefficientScale * 1e-12) {
      roots.push(-c / b);
    }
  } else {
    const discriminant = b * b - 4 * a * c;
    const discriminantTolerance = coefficientScale * coefficientScale * 1e-18;

    if (discriminant >= discriminantTolerance) {
      const root = Math.sqrt(discriminant);
      roots.push((-b - root) / (2 * a), (-b + root) / (2 * a));
    } else if (discriminant > -discriminantTolerance) {
      // Tangent: a double root is one point of contact, not two.
      roots.push(-b / (2 * a));
    }
  }

  const points = [];

  for (const t of roots) {
    if (!withinUnitRange(t)) {
      continue;
    }

    const point = getQuadraticPoint(bezier.p0, bezier.p1, bezier.p2, Math.min(Math.max(t, 0), 1));
    const along = dot(subtract(point, segment.a), direction) / (length * length);

    if (withinUnitRange(along)) {
      points.push(point);
    }
  }

  return points;
}

function bisectRoot(evaluate, lower, upper) {
  let low = lower;
  let high = upper;
  let lowValue = evaluate(low);

  for (let index = 0; index < BISECTION_ITERATIONS; index += 1) {
    const middle = (low + high) / 2;
    const middleValue = evaluate(middle);

    if (middleValue === 0) {
      return middle;
    }

    if (lowValue < 0 === middleValue < 0) {
      low = middle;
      lowValue = middleValue;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
}

function minimizeAbsolute(evaluate, lower, upper) {
  let low = lower;
  let high = upper;

  for (let index = 0; index < TERNARY_ITERATIONS; index += 1) {
    const leftThird = low + (high - low) / 3;
    const rightThird = high - (high - low) / 3;

    if (Math.abs(evaluate(leftThird)) <= Math.abs(evaluate(rightThird))) {
      high = rightThird;
    } else {
      low = leftThird;
    }
  }

  return (low + high) / 2;
}

function intersectCircleBezier(circle, bezier, tolerance) {
  const stations = flattenCurve(bezier, tolerance);
  const distanceError = (t) => {
    const point = getQuadraticPoint(bezier.p0, bezier.p1, bezier.p2, t);
    return Math.hypot(point.x - circle.center.x, point.y - circle.center.y) - circle.radius;
  };
  const values = stations.map((station) => distanceError(station.t));
  const contactTolerance = Math.max(circle.radius, 1) * 1e-9;
  const roots = [];

  for (let index = 0; index < stations.length - 1; index += 1) {
    const low = values[index];
    const high = values[index + 1];

    if (low === 0) {
      roots.push(stations[index].t);
      continue;
    }

    if (low < 0 !== high < 0) {
      roots.push(bisectRoot(distanceError, stations[index].t, stations[index + 1].t));
    }
  }

  if (values.at(-1) === 0) {
    roots.push(stations.at(-1).t);
  }

  // Tangential contact never flips the sign, so hunt local minima of |g| too.
  for (let index = 1; index < stations.length - 1; index += 1) {
    if (
      Math.abs(values[index]) > Math.abs(values[index - 1]) ||
      Math.abs(values[index]) > Math.abs(values[index + 1])
    ) {
      continue;
    }

    const t = minimizeAbsolute(distanceError, stations[index - 1].t, stations[index + 1].t);

    if (Math.abs(distanceError(t)) <= contactTolerance) {
      roots.push(t);
    }
  }

  return roots
    .filter(withinUnitRange)
    .map((t) => getQuadraticPoint(bezier.p0, bezier.p1, bezier.p2, Math.min(Math.max(t, 0), 1)));
}

function refineCurvePair(first, second, seedU, seedV) {
  let u = seedU;
  let v = seedV;

  for (let index = 0; index < NEWTON_ITERATIONS; index += 1) {
    const pointA = evaluateCurve(first, u);
    const pointB = evaluateCurve(second, v);
    const errorX = pointA.x - pointB.x;
    const errorY = pointA.y - pointB.y;

    if (Math.hypot(errorX, errorY) < NEWTON_CONVERGENCE) {
      return { u, v, point: pointA };
    }

    const derivativeA = evaluateCurveDerivative(first, u);
    const derivativeB = evaluateCurveDerivative(second, v);
    const determinant = derivativeB.x * derivativeA.y - derivativeA.x * derivativeB.y;

    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
      return null;
    }

    u += (errorX * derivativeB.y - derivativeB.x * errorY) / determinant;
    v += (errorX * derivativeA.y - derivativeA.x * errorY) / determinant;

    if (!Number.isFinite(u) || !Number.isFinite(v) || u < -0.25 || u > 1.25 || v < -0.25 || v > 1.25) {
      return null;
    }
  }

  const pointA = evaluateCurve(first, u);
  const pointB = evaluateCurve(second, v);

  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y) < INTERSECTION_TOLERANCE ? { u, v, point: pointA } : null;
}

function intersectBezierBezier(first, second, tolerance) {
  const stationsA = flattenCurve(first, tolerance);
  const stationsB = flattenCurve(second, tolerance);
  const points = [];

  for (let indexA = 0; indexA < stationsA.length - 1; indexA += 1) {
    const segmentA = createSegmentCurve(stationsA[indexA].point, stationsA[indexA + 1].point);

    for (let indexB = 0; indexB < stationsB.length - 1; indexB += 1) {
      const segmentB = createSegmentCurve(stationsB[indexB].point, stationsB[indexB + 1].point);
      const hits = intersectSegmentSegment(segmentA, segmentB);

      if (!hits.length) {
        continue;
      }

      const spanA = Math.hypot(
        stationsA[indexA + 1].point.x - stationsA[indexA].point.x,
        stationsA[indexA + 1].point.y - stationsA[indexA].point.y,
      );
      const spanB = Math.hypot(
        stationsB[indexB + 1].point.x - stationsB[indexB].point.x,
        stationsB[indexB + 1].point.y - stationsB[indexB].point.y,
      );
      const fractionA = spanA
        ? Math.hypot(hits[0].x - stationsA[indexA].point.x, hits[0].y - stationsA[indexA].point.y) / spanA
        : 0;
      const fractionB = spanB
        ? Math.hypot(hits[0].x - stationsB[indexB].point.x, hits[0].y - stationsB[indexB].point.y) / spanB
        : 0;
      const refined = refineCurvePair(
        first,
        second,
        stationsA[indexA].t + (stationsA[indexA + 1].t - stationsA[indexA].t) * fractionA,
        stationsB[indexB].t + (stationsB[indexB + 1].t - stationsB[indexB].t) * fractionB,
      );

      if (refined && withinUnitRange(refined.u) && withinUnitRange(refined.v)) {
        points.push(refined.point);
      } else {
        points.push(hits[0]);
      }
    }
  }

  return points;
}

export function intersectCurves(first, second, options = {}) {
  const tolerance = options.tolerance ?? ARC_FLATTEN_TOLERANCE;

  if (!boxesOverlap(curveBoundingBox(first), curveBoundingBox(second), tolerance)) {
    return [];
  }

  if (first.kind === 'segment' && second.kind === 'segment') {
    return intersectSegmentSegment(first, second);
  }

  if (first.kind === 'segment' && second.kind === 'circle') {
    return intersectSegmentCircle(first, second);
  }

  if (first.kind === 'circle' && second.kind === 'segment') {
    return intersectSegmentCircle(second, first);
  }

  if (first.kind === 'circle' && second.kind === 'circle') {
    return intersectCircleCircle(first, second);
  }

  if (first.kind === 'segment' && second.kind === 'bezier') {
    return intersectSegmentBezier(first, second);
  }

  if (first.kind === 'bezier' && second.kind === 'segment') {
    return intersectSegmentBezier(second, first);
  }

  if (first.kind === 'circle' && second.kind === 'bezier') {
    return intersectCircleBezier(first, second, tolerance);
  }

  if (first.kind === 'bezier' && second.kind === 'circle') {
    return intersectCircleBezier(second, first, tolerance);
  }

  if (first.kind === 'bezier' && second.kind === 'bezier') {
    return intersectBezierBezier(first, second, tolerance);
  }

  return [];
}

function rectCurves(entity) {
  const corners = getRectCorners(entity);
  const ordered = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];

  return ordered.map((corner, index) => createSegmentCurve(corner, ordered[(index + 1) % ordered.length]));
}

function getEllipsePoint(entity, angle) {
  const radians = ((Number(entity.rotation) || 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const localX = Math.cos(angle) * Math.abs(Number(entity.rx) || 0);
  const localY = Math.sin(angle) * Math.abs(Number(entity.ry) || 0);

  return {
    x: entity.cx + localX * cos - localY * sin,
    y: entity.cy + localX * sin + localY * cos,
  };
}

function ellipseCurves(entity, tolerance) {
  const rx = Math.abs(Number(entity.rx) || 0);
  const ry = Math.abs(Number(entity.ry) || 0);

  if (!rx || !ry) {
    return [];
  }

  const largest = Math.max(rx, ry);
  const step = Math.sqrt((8 * Math.max(tolerance, 1e-6)) / Math.max(largest, 1e-6));
  const count = Math.min(
    Math.max(Math.ceil((Math.PI * 2) / Math.max(step, 1e-6)), ELLIPSE_MIN_SEGMENTS),
    ELLIPSE_MAX_SEGMENTS,
  );
  const points = [];

  for (let index = 0; index < count; index += 1) {
    points.push(getEllipsePoint(entity, (index / count) * Math.PI * 2));
  }

  return points.map((point, index) => createSegmentCurve(point, points[(index + 1) % points.length]));
}

function polygonCurves(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return [];
  }

  return points.map((point, index) => createSegmentCurve(point, points[(index + 1) % points.length]));
}

/**
 * The primitive curves an entity contributes to intersection tests.
 * Annotations (text, dimensions, angle dimensions) contribute none: they are
 * documentation, not geometry, and must never cut or be cut.
 */
export function getEntityCurves(entity, options = {}) {
  if (!entity || typeof entity !== 'object') {
    return [];
  }

  const tolerance = options.tolerance ?? ARC_FLATTEN_TOLERANCE;

  if (entity.type === 'line') {
    return [createSegmentCurve({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 })];
  }

  if (entity.type === 'polyline') {
    return getPolylineSegments(entity).map((segment) => createSegmentCurve(segment.start, segment.end));
  }

  if (entity.type === 'rect') {
    return rectCurves(entity);
  }

  if (entity.type === 'circle') {
    return entity.r > 0 ? [createCircleCurve({ x: entity.cx, y: entity.cy }, entity.r)] : [];
  }

  if (entity.type === 'arc') {
    return entity.start && entity.control && entity.end
      ? [createBezierCurve(entity.start, entity.control, entity.end)]
      : [];
  }

  if (entity.type === 'ellipse') {
    return ellipseCurves(entity, tolerance);
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle') {
      const radius = Math.abs(Number(entity.diameter) || 0) / 2;
      return radius > 0 ? [createCircleCurve({ x: entity.cx, y: entity.cy }, radius)] : [];
    }

    if (entity.shape === 'rect') {
      return rectCurves({ x: entity.x, y: entity.y, width: entity.width, height: entity.height, rotation: 0 });
    }

    if (entity.shape === 'ellipse') {
      return ellipseCurves(entity, tolerance);
    }

    if (entity.shape === 'polygon') {
      return polygonCurves(entity.points);
    }
  }

  return [];
}

export function intersectEntities(first, second, options = {}) {
  const curvesFirst = getEntityCurves(first, options);
  const curvesSecond = getEntityCurves(second, options);

  if (!curvesFirst.length || !curvesSecond.length) {
    return [];
  }

  const points = [];

  for (const curveFirst of curvesFirst) {
    for (const curveSecond of curvesSecond) {
      points.push(...intersectCurves(curveFirst, curveSecond, options));
    }
  }

  return dedupeIntersectionPoints(points);
}

/**
 * Every point where `entity` meets any of `others`. Entities sharing the target's
 * id are skipped so a shape can never cut itself.
 */
export function collectEntityIntersections(entity, others = [], options = {}) {
  const points = [];

  for (const other of others) {
    if (!other || other.id === entity?.id) {
      continue;
    }

    points.push(...intersectEntities(entity, other, options));
  }

  return dedupeIntersectionPoints(points);
}
