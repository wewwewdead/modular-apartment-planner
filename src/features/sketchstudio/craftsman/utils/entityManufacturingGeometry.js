import { calculateDistance } from '../../utils/canvasMath';
import { getClosedProfileArea, isPolylineClosed } from '../../utils/profileUtils';

function toPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function getRectDimensions(entity) {
  return {
    width: Math.abs(entity.width ?? ((entity.x2 ?? 0) - (entity.x1 ?? 0))),
    height: Math.abs(entity.height ?? ((entity.y2 ?? 0) - (entity.y1 ?? 0))),
  };
}

function getCircleRadius(entity) {
  return toPositiveNumber(entity.r ?? entity.radius);
}

function getPolylineBoundingBox(points = []) {
  if (!points.length) {
    return { width: 0, height: 0 };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function getPolylineLength(points = [], closed = false) {
  if (points.length < 2) {
    return 0;
  }

  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += calculateDistance(points[index], points[index + 1]);
  }

  if (closed) {
    length += calculateDistance(points[points.length - 1], points[0]);
  }

  return length;
}

export function getMaterialStockKind(material) {
  return material?.costBasis === 'perLinearMeter' ? 'linear' : 'sheet';
}

export function getEntityManufacturingGeometry(entity, material = null) {
  const stockKind = getMaterialStockKind(material);
  const defaultSectionWidth = toPositiveNumber(material?.defaultWidth);

  switch (entity.type) {
    case 'rect': {
      const { width, height } = getRectDimensions(entity);
      return {
        width,
        height,
        areaMm2: width * height,
        stockLength: (2 * width) + (2 * height),
        stockSectionWidth: defaultSectionWidth,
        dimensionAccuracy: 'exact',
        dimensionNote: '',
      };
    }

    case 'line': {
      const length = calculateDistance(
        { x: entity.x1, y: entity.y1 },
        { x: entity.x2, y: entity.y2 },
      );
      const inferredWidth = defaultSectionWidth || toPositiveNumber(entity.thickness);
      const dimensionsAreExact = stockKind === 'linear' && defaultSectionWidth > 0;

      return {
        width: length,
        height: inferredWidth,
        areaMm2: null,
        stockLength: length,
        stockSectionWidth: inferredWidth,
        dimensionAccuracy: dimensionsAreExact ? 'exact' : 'approximate',
        dimensionNote: dimensionsAreExact
          ? ''
          : 'Displayed width/height are inferred from line length plus stock/thickness metadata.',
      };
    }

    case 'circle': {
      const radius = getCircleRadius(entity);
      const diameter = radius * 2;
      return {
        width: diameter,
        height: diameter,
        areaMm2: Math.PI * radius * radius,
        stockLength: Math.PI * diameter,
        stockSectionWidth: defaultSectionWidth,
        dimensionAccuracy: 'exact',
        dimensionNote: '',
      };
    }

    case 'polyline': {
      const closed = isPolylineClosed(entity);
      const bounds = getPolylineBoundingBox(entity.points);
      return {
        width: bounds.width,
        height: bounds.height,
        areaMm2: closed ? getClosedProfileArea(entity) : null,
        stockLength: getPolylineLength(entity.points, closed),
        stockSectionWidth: defaultSectionWidth,
        dimensionAccuracy: 'approximate',
        dimensionNote: closed
          ? 'Displayed width/height are bounding-box dimensions for a non-rectangular closed profile.'
          : 'Displayed width/height are bounding-box dimensions for a multi-segment path.',
      };
    }

    default:
      return {
        width: 0,
        height: 0,
        areaMm2: null,
        stockLength: null,
        stockSectionWidth: defaultSectionWidth,
        dimensionAccuracy: 'approximate',
        dimensionNote: 'No manufacturing geometry is available for this entity type.',
      };
  }
}
