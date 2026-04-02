import { getArcBoundingBox } from './arcUtils';
import { getDimensionGeometry } from './dimensionUtils';
import { getTextCorners } from './entityUtils';
import { getPolylineBoundingBox } from './polylineUtils';

function getPointsBoundingBox(points) {
  if (!points.length) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function getEllipseBoundingBox(entity) {
  const radians = ((entity.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const xRadius = Math.sqrt(((entity.rx * cos) ** 2) + ((entity.ry * sin) ** 2));
  const yRadius = Math.sqrt(((entity.rx * sin) ** 2) + ((entity.ry * cos) ** 2));

  return {
    minX: entity.cx - xRadius,
    minY: entity.cy - yRadius,
    maxX: entity.cx + xRadius,
    maxY: entity.cy + yRadius,
  };
}

export function computeEntityBoundingBox(entity, entities = []) {
  if (!entity) {
    return null;
  }

  if (entity.type === 'line') {
    return {
      minX: Math.min(entity.x1, entity.x2),
      minY: Math.min(entity.y1, entity.y2),
      maxX: Math.max(entity.x1, entity.x2),
      maxY: Math.max(entity.y1, entity.y2),
    };
  }

  if (entity.type === 'rect') {
    const rotation = entity.rotation ?? 0;

    if (!rotation) {
      return {
        minX: entity.x,
        minY: entity.y,
        maxX: entity.x + entity.width,
        maxY: entity.y + entity.height,
      };
    }

    const center = {
      x: entity.x + entity.width / 2,
      y: entity.y + entity.height / 2,
    };
    const angle = (rotation * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const baseCorners = [
      { x: entity.x, y: entity.y },
      { x: entity.x + entity.width, y: entity.y },
      { x: entity.x + entity.width, y: entity.y + entity.height },
      { x: entity.x, y: entity.y + entity.height },
    ];
    const corners = baseCorners.map((point) => {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      return {
        x: center.x + (dx * cos) - (dy * sin),
        y: center.y + (dx * sin) + (dy * cos),
      };
    });
    return getPointsBoundingBox(corners);
  }

  if (entity.type === 'circle') {
    return {
      minX: entity.cx - entity.r,
      minY: entity.cy - entity.r,
      maxX: entity.cx + entity.r,
      maxY: entity.cy + entity.r,
    };
  }

  if (entity.type === 'ellipse') {
    return getEllipseBoundingBox(entity);
  }

  if (entity.type === 'polyline') {
    return getPolylineBoundingBox(entity);
  }

  if (entity.type === 'arc') {
    return getArcBoundingBox(entity);
  }

  if (entity.type === 'dimension') {
    const geometry = getDimensionGeometry({
      p1: entity.p1,
      p2: entity.p2,
      subtype: entity.subtype,
      offset: entity.offset,
    });
    return getPointsBoundingBox([
      { x: geometry.ext1.x1, y: geometry.ext1.y1 },
      { x: geometry.ext1.x2, y: geometry.ext1.y2 },
      { x: geometry.ext2.x1, y: geometry.ext2.y1 },
      { x: geometry.ext2.x2, y: geometry.ext2.y2 },
      { x: geometry.textPoint.x, y: geometry.textPoint.y },
    ]);
  }

  if (entity.type === 'angle-dimension') {
    const r = entity.arcRadius ?? 0;
    return getPointsBoundingBox([
      entity.vertex,
      entity.p1,
      entity.p2,
      { x: entity.vertex.x - r, y: entity.vertex.y - r },
      { x: entity.vertex.x + r, y: entity.vertex.y + r },
    ]);
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle') {
      const radius = entity.diameter / 2;
      return {
        minX: entity.cx - radius,
        minY: entity.cy - radius,
        maxX: entity.cx + radius,
        maxY: entity.cy + radius,
      };
    }

    if (entity.shape === 'rect') {
      return {
        minX: entity.x,
        minY: entity.y,
        maxX: entity.x + entity.width,
        maxY: entity.y + entity.height,
      };
    }

    if (entity.shape === 'ellipse') {
      return getEllipseBoundingBox(entity);
    }

    if (entity.shape === 'polygon') {
      return getPointsBoundingBox(entity.points || []);
    }
  }

  if (entity.type === 'text') {
    return getPointsBoundingBox(Object.values(getTextCorners(entity)));
  }

  return null;
}

export function computeDocumentBoundingBox(document, options = {}) {
  const includeAnnotations = options.includeAnnotations ?? false;
  const entities = includeAnnotations
    ? document.entities
    : document.entities.filter((entity) => entity.type !== 'dimension' && entity.type !== 'text');
  const boxes = entities.map((entity) => computeEntityBoundingBox(entity, document.entities)).filter(Boolean);

  if (!boxes.length) {
    return null;
  }

  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
  };
}

export function computeFootprintFromEntities(entities) {
  const geometryEntities = entities.filter((entity) => entity.type !== 'dimension' && entity.type !== 'feature' && entity.type !== 'text');
  const boxes = geometryEntities.map((entity) => computeEntityBoundingBox(entity, entities)).filter(Boolean);

  if (!boxes.length) {
    return null;
  }

  const minX = Math.min(...boxes.map((box) => box.minX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const maxY = Math.max(...boxes.map((box) => box.maxY));

  return {
    origin: { x: minX, y: minY },
    width: maxX - minX,
    height: maxY - minY,
    points: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
  };
}
