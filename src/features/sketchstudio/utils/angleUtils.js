import { calculateDistance, normalizeVector, getVector } from './canvasMath';
import { getIsometricPlaneAxes } from './isometricUtils';

const ARC_SAMPLE_SEGMENTS = 24;
const TEXT_OFFSET_FACTOR = 1.35;

export function formatAngleText(angleDeg) {
  return `${Math.round(angleDeg * 10) / 10}°`;
}

function solveBasis(vector, axisA, axisB) {
  const det = (axisA.x * axisB.y) - (axisA.y * axisB.x);
  if (Math.abs(det) < 1e-6) return { a: 0, b: 0 };
  return {
    a: ((vector.x * axisB.y) - (vector.y * axisB.x)) / det,
    b: ((axisA.x * vector.y) - (axisA.y * vector.x)) / det,
  };
}

export function computeIsometricAngle(dir1, dir2, plane) {
  const { axisA, axisB } = getIsometricPlaneAxes(plane);
  const proj1 = solveBasis(dir1, axisA, axisB);
  const proj2 = solveBasis(dir2, axisA, axisB);
  const len1 = Math.hypot(proj1.a, proj1.b) || 1;
  const len2 = Math.hypot(proj2.a, proj2.b) || 1;
  const dot = Math.max(-1, Math.min(1, (proj1.a * proj2.a + proj1.b * proj2.b) / (len1 * len2)));
  return Math.acos(dot) * (180 / Math.PI);
}

export function getAngleDimensionGeometry({ vertex, p1, p2, arcRadius, isometricPlane }) {
  const dir1 = normalizeVector(getVector(vertex, p1));
  const dir2 = normalizeVector(getVector(vertex, p2));

  // Angle between the two rays — corrected for isometric if applicable
  const angleDeg = isometricPlane
    ? computeIsometricAngle(getVector(vertex, p1), getVector(vertex, p2), isometricPlane)
    : Math.acos(Math.max(-1, Math.min(1, dir1.x * dir2.x + dir1.y * dir2.y))) * (180 / Math.PI);

  // Cross product sign to determine sweep direction
  const cross = dir1.x * dir2.y - dir1.y * dir2.x;

  // Points on the arc at arcRadius distance from vertex
  const arcStart = {
    x: vertex.x + dir1.x * arcRadius,
    y: vertex.y + dir1.y * arcRadius,
  };
  const arcEnd = {
    x: vertex.x + dir2.x * arcRadius,
    y: vertex.y + dir2.y * arcRadius,
  };

  // Ray extension lines (from vertex outward, slightly past the arc)
  const rayLen = arcRadius * 1.15;
  const ray1 = {
    x1: vertex.x,
    y1: vertex.y,
    x2: vertex.x + dir1.x * rayLen,
    y2: vertex.y + dir1.y * rayLen,
  };
  const ray2 = {
    x1: vertex.x,
    y1: vertex.y,
    x2: vertex.x + dir2.x * rayLen,
    y2: vertex.y + dir2.y * rayLen,
  };

  // SVG arc path
  const largeArc = angleDeg > 180 ? 1 : 0;
  const sweep = cross < 0 ? 1 : 0;
  const arcPath = `M ${arcStart.x} ${arcStart.y} A ${arcRadius} ${arcRadius} 0 ${largeArc} ${sweep} ${arcEnd.x} ${arcEnd.y}`;

  // Text at midpoint of the arc (bisector direction)
  const bisector = normalizeVector({
    x: dir1.x + dir2.x,
    y: dir1.y + dir2.y,
  });

  // If directions are opposite, bisector is zero — use perpendicular
  const bisectorLen = Math.hypot(dir1.x + dir2.x, dir1.y + dir2.y);
  const textDir = bisectorLen > 0.01
    ? bisector
    : { x: -dir1.y, y: dir1.x };

  const textPoint = {
    x: vertex.x + textDir.x * arcRadius * TEXT_OFFSET_FACTOR,
    y: vertex.y + textDir.y * arcRadius * TEXT_OFFSET_FACTOR,
  };

  // Sample points along the arc for hit testing
  const arcSamples = sampleArcSegments(vertex, dir1, dir2, cross, arcRadius, ARC_SAMPLE_SEGMENTS);

  return {
    ray1,
    ray2,
    arcPath,
    arcStart,
    arcEnd,
    arcSamples,
    textPoint,
    textAngle: 0,
    angleDeg,
  };
}

function sampleArcSegments(vertex, dir1, dir2, cross, radius, segments) {
  // Angle from dir1
  const angle1 = Math.atan2(dir1.y, dir1.x);
  const angle2 = Math.atan2(dir2.y, dir2.x);

  let startAngle = angle1;
  let endAngle = angle2;

  // Match sweep direction
  if (cross < 0) {
    // Clockwise sweep
    if (endAngle > startAngle) {
      endAngle -= 2 * Math.PI;
    }
  } else {
    // Counter-clockwise sweep
    if (endAngle < startAngle) {
      endAngle += 2 * Math.PI;
    }
  }

  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const a = startAngle + (endAngle - startAngle) * t;
    points.push({
      x: vertex.x + Math.cos(a) * radius,
      y: vertex.y + Math.sin(a) * radius,
    });
  }

  return points;
}
