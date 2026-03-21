import { calculateDistance } from './canvasMath';
import { getGridSpacing, getVisibleWorldBounds } from './gridUtils';

const COS_30 = Math.sqrt(3) / 2;
const SIN_30 = 0.5;
const ISO_LINE_OFFSET_FACTOR = COS_30;
const ISO_FAMILY_DEFINITIONS = [
  { id: 'right', angle: 30, direction: { x: COS_30, y: SIN_30 } },
  { id: 'left', angle: 150, direction: { x: -COS_30, y: SIN_30 } },
  { id: 'vertical', angle: 90, direction: { x: 0, y: 1 } },
];

const ISO_PLANE_AXES = {
  top: ['left', 'right'],
  left: ['left', 'vertical'],
  right: ['right', 'vertical'],
};

function roundValue(value, precision = 1000) {
  return Math.round(value * precision) / precision;
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y);

  if (!length) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function getFamilyNormal(direction) {
  return normalizeVector({
    x: -direction.y,
    y: direction.x,
  });
}

function dotProduct(left, right) {
  return (left.x * right.x) + (left.y * right.y);
}

function subtractPoints(left, right) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
  };
}

function scaleVector(vector, amount) {
  return {
    x: vector.x * amount,
    y: vector.y * amount,
  };
}

function addPoints(left, right) {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
  };
}

function getBoundsCorners(bounds) {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
}

function buildLineConstants(min, max, step) {
  const values = [];
  const start = Math.floor(min / step) * step;

  for (let value = start; value <= max; value += step) {
    values.push(roundValue(value, 10000));
  }

  return values;
}

function isMajorConstant(value, majorStep) {
  const remainder = Math.abs(value % majorStep);
  return remainder < 0.0001 || Math.abs(remainder - majorStep) < 0.0001;
}

function uniquePoints(points) {
  const seen = new Set();

  return points.filter((point) => {
    const key = `${roundValue(point.x, 10000)}:${roundValue(point.y, 10000)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getLineSegmentForBounds(normal, constant, bounds) {
  const candidates = [];
  const edges = [
    { axis: 'x', value: bounds.minX },
    { axis: 'x', value: bounds.maxX },
    { axis: 'y', value: bounds.minY },
    { axis: 'y', value: bounds.maxY },
  ];

  edges.forEach((edge) => {
    if (edge.axis === 'x' && Math.abs(normal.y) > 1e-6) {
      const y = (constant - (normal.x * edge.value)) / normal.y;
      if (y >= bounds.minY - 1e-6 && y <= bounds.maxY + 1e-6) {
        candidates.push({ x: edge.value, y });
      }
    }

    if (edge.axis === 'y' && Math.abs(normal.x) > 1e-6) {
      const x = (constant - (normal.y * edge.value)) / normal.x;
      if (x >= bounds.minX - 1e-6 && x <= bounds.maxX + 1e-6) {
        candidates.push({ x, y: edge.value });
      }
    }
  });

  const points = uniquePoints(candidates);

  if (points.length < 2) {
    return null;
  }

  let bestPair = null;
  let bestDistance = -1;

  for (let index = 0; index < points.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < points.length; otherIndex += 1) {
      const distance = calculateDistance(points[index], points[otherIndex]);
      if (distance > bestDistance) {
        bestDistance = distance;
        bestPair = [points[index], points[otherIndex]];
      }
    }
  }

  if (!bestPair) {
    return null;
  }

  return {
    x1: bestPair[0].x,
    y1: bestPair[0].y,
    x2: bestPair[1].x,
    y2: bestPair[1].y,
  };
}

function solveIntersection(normalA, constantA, normalB, constantB) {
  const determinant = (normalA.x * normalB.y) - (normalA.y * normalB.x);

  if (Math.abs(determinant) < 1e-6) {
    return null;
  }

  return {
    x: ((constantA * normalB.y) - (normalA.y * constantB)) / determinant,
    y: ((normalA.x * constantB) - (constantA * normalB.x)) / determinant,
  };
}

function solveBasisValues(vector, axisA, axisB) {
  const determinant = (axisA.x * axisB.y) - (axisA.y * axisB.x);

  if (Math.abs(determinant) < 1e-6) {
    return { a: 0, b: 0 };
  }

  return {
    a: ((vector.x * axisB.y) - (vector.y * axisB.x)) / determinant,
    b: ((axisA.x * vector.y) - (axisA.y * vector.x)) / determinant,
  };
}

function getEllipseExtrema(center, rx, ry, rotation = 0) {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    east: {
      x: center.x + (rx * cos),
      y: center.y + (rx * sin),
    },
    west: {
      x: center.x - (rx * cos),
      y: center.y - (rx * sin),
    },
    north: {
      x: center.x - (ry * sin),
      y: center.y + (ry * cos),
    },
    south: {
      x: center.x + (ry * sin),
      y: center.y - (ry * cos),
    },
  };
}

export function getIsometricFamilyDefinitions() {
  return ISO_FAMILY_DEFINITIONS.map((family) => ({
    ...family,
    direction: { ...family.direction },
    normal: getFamilyNormal(family.direction),
  }));
}

export function getIsometricPlaneAxes(plane = 'top') {
  const familyDefinitions = Object.fromEntries(getIsometricFamilyDefinitions().map((family) => [family.id, family]));
  const [firstAxisId, secondAxisId] = ISO_PLANE_AXES[plane] || ISO_PLANE_AXES.top;

  return {
    axisA: familyDefinitions[firstAxisId].direction,
    axisB: familyDefinitions[secondAxisId].direction,
    familyIds: [firstAxisId, secondAxisId],
  };
}

export function applyIsometricOrthoPoint(startPoint, point) {
  const families = getIsometricFamilyDefinitions();
  const vector = subtractPoints(point, startPoint);

  const bestCandidate = families.reduce((nearest, family) => {
    const projection = dotProduct(vector, family.direction);
    const candidate = addPoints(startPoint, scaleVector(family.direction, projection));
    const distance = calculateDistance(candidate, point);

    if (!nearest || distance < nearest.distance) {
      return {
        point: candidate,
        distance,
      };
    }

    return nearest;
  }, null);

  return bestCandidate?.point || point;
}

export function resolveIsometricPlaneVector(startPoint, point, plane = 'top') {
  const { axisA, axisB } = getIsometricPlaneAxes(plane);
  return solveBasisValues(subtractPoints(point, startPoint), axisA, axisB);
}

export function buildIsometricPlaneRectangle(startPoint, point, plane = 'top', dimensions = {}) {
  const { axisA, axisB } = getIsometricPlaneAxes(plane);
  const resolved = resolveIsometricPlaneVector(startPoint, point, plane);
  const signA = resolved.a < 0 ? -1 : 1;
  const signB = resolved.b < 0 ? -1 : 1;
  const sizeA = Number.isFinite(dimensions.sizeA) ? Math.abs(dimensions.sizeA) : Math.abs(resolved.a);
  const sizeB = Number.isFinite(dimensions.sizeB) ? Math.abs(dimensions.sizeB) : Math.abs(resolved.b);

  if (!sizeA || !sizeB) {
    return null;
  }

  const edgeA = scaleVector(axisA, signA * sizeA);
  const edgeB = scaleVector(axisB, signB * sizeB);
  const pointA = addPoints(startPoint, edgeA);
  const pointB = addPoints(pointA, edgeB);
  const pointC = addPoints(startPoint, edgeB);

  return {
    points: [startPoint, pointA, pointB, pointC],
    width: sizeA,
    height: sizeB,
    plane,
  };
}

export function buildIsometricEllipse(centerPoint, radiusPoint, plane = 'top', overrides = {}) {
  const radius = Number.isFinite(overrides.radius)
    ? Math.abs(overrides.radius)
    : calculateDistance(centerPoint, radiusPoint);

  if (!radius) {
    return null;
  }

  const { axisA, axisB } = getIsometricPlaneAxes(plane);
  const matrix = {
    xx: (radius * radius) * ((axisA.x * axisA.x) + (axisB.x * axisB.x)),
    xy: (radius * radius) * ((axisA.x * axisA.y) + (axisB.x * axisB.y)),
    yy: (radius * radius) * ((axisA.y * axisA.y) + (axisB.y * axisB.y)),
  };
  const trace = matrix.xx + matrix.yy;
  const determinant = (matrix.xx * matrix.yy) - (matrix.xy * matrix.xy);
  const discriminant = Math.sqrt(Math.max(0, ((trace * trace) / 4) - determinant));
  const lambdaA = (trace / 2) + discriminant;
  const lambdaB = (trace / 2) - discriminant;
  const rotation = 0.5 * Math.atan2(2 * matrix.xy, matrix.xx - matrix.yy);

  return {
    cx: centerPoint.x,
    cy: centerPoint.y,
    rx: Math.sqrt(Math.max(lambdaA, lambdaB)),
    ry: Math.sqrt(Math.max(0, Math.min(lambdaA, lambdaB))),
    rotation: roundValue((rotation * 180) / Math.PI, 10000),
    plane,
  };
}

export function getEllipseSnapPoints(entity) {
  const extrema = getEllipseExtrema({ x: entity.cx, y: entity.cy }, entity.rx, entity.ry, entity.rotation ?? 0);

  return [
    {
      x: entity.cx,
      y: entity.cy,
      sourceType: 'center',
      sourceKey: 'center',
      snapType: 'center',
    },
    {
      x: extrema.east.x,
      y: extrema.east.y,
      sourceType: 'extrema',
      sourceKey: 'east',
      snapType: 'extrema',
    },
    {
      x: extrema.west.x,
      y: extrema.west.y,
      sourceType: 'extrema',
      sourceKey: 'west',
      snapType: 'extrema',
    },
    {
      x: extrema.north.x,
      y: extrema.north.y,
      sourceType: 'extrema',
      sourceKey: 'north',
      snapType: 'extrema',
    },
    {
      x: extrema.south.x,
      y: extrema.south.y,
      sourceType: 'extrema',
      sourceKey: 'south',
      snapType: 'extrema',
    },
  ];
}

export function getIsometricGridData(viewport, canvasSize) {
  const { minor, major } = getGridSpacing(viewport.zoom);
  const bounds = getVisibleWorldBounds(viewport, canvasSize);
  const padding = major * 3;
  const extendedBounds = {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  };
  const corners = getBoundsCorners(extendedBounds);
  const offsetStep = minor * ISO_LINE_OFFSET_FACTOR;
  const majorOffsetStep = major * ISO_LINE_OFFSET_FACTOR;
  const families = getIsometricFamilyDefinitions();
  const lines = {
    bounds: extendedBounds,
    isoMinor: [],
    isoMajor: [],
    axis: [],
  };

  families.forEach((family) => {
    const minConstant = Math.min(...corners.map((corner) => dotProduct(corner, family.normal)));
    const maxConstant = Math.max(...corners.map((corner) => dotProduct(corner, family.normal)));
    const constants = buildLineConstants(minConstant, maxConstant, offsetStep);

    constants.forEach((constant) => {
      const segment = getLineSegmentForBounds(family.normal, constant, extendedBounds);

      if (!segment) {
        return;
      }

      const line = {
        id: `${family.id}-${constant}`,
        family: family.id,
        angle: family.angle,
        ...segment,
      };

      if (Math.abs(constant) < 0.0001) {
        lines.axis.push(line);
        return;
      }

      if (isMajorConstant(constant, majorOffsetStep)) {
        lines.isoMajor.push(line);
        return;
      }

      lines.isoMinor.push(line);
    });
  });

  return lines;
}

export function findNearestIsometricGridSnap({ worldPoint, toleranceWorld, zoom }) {
  const minor = getGridSpacing(zoom).minor;
  const offsetStep = minor * ISO_LINE_OFFSET_FACTOR;
  const families = getIsometricFamilyDefinitions();
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let familyIndex = 0; familyIndex < families.length; familyIndex += 1) {
    for (let otherIndex = familyIndex + 1; otherIndex < families.length; otherIndex += 1) {
      const family = families[familyIndex];
      const otherFamily = families[otherIndex];
      const baseConstant = Math.round(dotProduct(worldPoint, family.normal) / offsetStep);
      const otherBaseConstant = Math.round(dotProduct(worldPoint, otherFamily.normal) / offsetStep);

      for (let constantOffset = -1; constantOffset <= 1; constantOffset += 1) {
        for (let otherConstantOffset = -1; otherConstantOffset <= 1; otherConstantOffset += 1) {
          const candidate = solveIntersection(
            family.normal,
            (baseConstant + constantOffset) * offsetStep,
            otherFamily.normal,
            (otherBaseConstant + otherConstantOffset) * offsetStep,
          );

          if (!candidate) {
            continue;
          }

          const distance = calculateDistance(candidate, worldPoint);

          if (distance <= toleranceWorld && distance < nearestDistance) {
            nearest = candidate;
            nearestDistance = distance;
          }
        }
      }
    }
  }

  return nearest;
}

export function isIsometricProjectionMeta(meta) {
  return meta?.projectionMode === 'isometric';
}

export function isIsometricEntity(entity) {
  return isIsometricProjectionMeta(entity?.meta);
}

export function filterNonIsometricEntities(entities = []) {
  return entities.filter((entity) => !isIsometricEntity(entity));
}
