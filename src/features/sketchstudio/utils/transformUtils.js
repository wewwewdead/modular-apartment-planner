import { computeEntityBoundingBox } from './bboxUtils';
import { inferDimensionSubtype } from './dimensionUtils';
import { getRectCenter } from './entityUtils';

export function translatePoint(point, delta) {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
  };
}

export function rotatePointAroundPivot(point, pivot, angleRadians) {
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;

  return {
    x: pivot.x + (dx * cos) - (dy * sin),
    y: pivot.y + (dx * sin) + (dy * cos),
  };
}

export function mirrorPointAcrossAxis(point, pivot, direction = 'horizontal') {
  if (direction === 'vertical') {
    return {
      x: point.x,
      y: (pivot.y * 2) - point.y,
    };
  }

  return {
    x: (pivot.x * 2) - point.x,
    y: point.y,
  };
}

function normalizeAngleDegrees(angle) {
  const normalized = ((Number(angle) || 0) % 360 + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function mirrorRotationDegrees(angle, direction = 'horizontal') {
  const nextAngle = direction === 'vertical'
    ? -(Number(angle) || 0)
    : 180 - (Number(angle) || 0);

  return normalizeAngleDegrees(nextAngle);
}

function mirrorRectByCenter(entity, pivot, direction) {
  const center = getRectCenter(entity);
  const mirroredCenter = mirrorPointAcrossAxis(center, pivot, direction);

  return {
    ...entity,
    x: mirroredCenter.x - entity.width / 2,
    y: mirroredCenter.y - entity.height / 2,
    rotation: mirrorRotationDegrees(entity.rotation ?? 0, direction),
  };
}

function mirrorDimensionOffset(entity, direction) {
  if (entity.subtype === 'horizontal') {
    return direction === 'vertical' ? -(entity.offset ?? 0) : (entity.offset ?? 0);
  }

  if (entity.subtype === 'vertical') {
    return direction === 'horizontal' ? -(entity.offset ?? 0) : (entity.offset ?? 0);
  }

  return -(entity.offset ?? 0);
}

export function translateEntity(entity, delta) {
  if (entity.type === 'line') {
    return {
      ...entity,
      x1: entity.x1 + delta.x,
      y1: entity.y1 + delta.y,
      x2: entity.x2 + delta.x,
      y2: entity.y2 + delta.y,
    };
  }

  if (entity.type === 'rect') {
    return {
      ...entity,
      x: entity.x + delta.x,
      y: entity.y + delta.y,
    };
  }

  if (entity.type === 'circle') {
    return {
      ...entity,
      cx: entity.cx + delta.x,
      cy: entity.cy + delta.y,
    };
  }

  if (entity.type === 'ellipse') {
    return {
      ...entity,
      cx: entity.cx + delta.x,
      cy: entity.cy + delta.y,
    };
  }

  if (entity.type === 'polyline') {
    return {
      ...entity,
      points: entity.points.map((point) => translatePoint(point, delta)),
    };
  }

  if (entity.type === 'arc') {
    return {
      ...entity,
      start: translatePoint(entity.start, delta),
      end: translatePoint(entity.end, delta),
      control: translatePoint(entity.control, delta),
    };
  }

  if (entity.type === 'dimension' && !(entity.meta?.sourceRefs?.length)) {
    return {
      ...entity,
      p1: translatePoint(entity.p1, delta),
      p2: translatePoint(entity.p2, delta),
    };
  }

  if (entity.type === 'text') {
    return {
      ...entity,
      x: entity.x + delta.x,
      y: entity.y + delta.y,
    };
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle' || entity.shape === 'ellipse') {
      return {
        ...entity,
        cx: entity.cx + delta.x,
        cy: entity.cy + delta.y,
      };
    }

    if (entity.shape === 'rect') {
      return {
        ...entity,
        x: entity.x + delta.x,
        y: entity.y + delta.y,
      };
    }

    if (entity.shape === 'polygon') {
      return {
        ...entity,
        points: (entity.points || []).map((point) => translatePoint(point, delta)),
      };
    }
  }

  return entity;
}

export function translateEntities(entities, entityIds, delta) {
  const idSet = new Set(entityIds);
  return entities.map((entity) => (
    idSet.has(entity.id)
      ? translateEntity(entity, delta)
      : entity
  ));
}

export function rotateEntityAroundPivot(entity, pivot, angleRadians) {
  if (entity.type === 'line') {
    return {
      ...entity,
      x1: rotatePointAroundPivot({ x: entity.x1, y: entity.y1 }, pivot, angleRadians).x,
      y1: rotatePointAroundPivot({ x: entity.x1, y: entity.y1 }, pivot, angleRadians).y,
      x2: rotatePointAroundPivot({ x: entity.x2, y: entity.y2 }, pivot, angleRadians).x,
      y2: rotatePointAroundPivot({ x: entity.x2, y: entity.y2 }, pivot, angleRadians).y,
    };
  }

  if (entity.type === 'circle') {
    const center = rotatePointAroundPivot({ x: entity.cx, y: entity.cy }, pivot, angleRadians);
    return {
      ...entity,
      cx: center.x,
      cy: center.y,
    };
  }

  if (entity.type === 'ellipse') {
    const center = rotatePointAroundPivot({ x: entity.cx, y: entity.cy }, pivot, angleRadians);
    return {
      ...entity,
      cx: center.x,
      cy: center.y,
      rotation: (entity.rotation ?? 0) + ((angleRadians * 180) / Math.PI),
    };
  }

  if (entity.type === 'polyline') {
    return {
      ...entity,
      points: entity.points.map((point) => rotatePointAroundPivot(point, pivot, angleRadians)),
    };
  }

  if (entity.type === 'arc') {
    return {
      ...entity,
      start: rotatePointAroundPivot(entity.start, pivot, angleRadians),
      end: rotatePointAroundPivot(entity.end, pivot, angleRadians),
      control: rotatePointAroundPivot(entity.control, pivot, angleRadians),
    };
  }

  if (entity.type === 'rect') {
    return {
      ...entity,
      rotation: (entity.rotation ?? 0) + ((angleRadians * 180) / Math.PI),
      x: rotatePointAroundPivot({ x: entity.x, y: entity.y }, pivot, angleRadians).x,
      y: rotatePointAroundPivot({ x: entity.x, y: entity.y }, pivot, angleRadians).y,
    };
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle' || entity.shape === 'ellipse') {
      const center = rotatePointAroundPivot({ x: entity.cx, y: entity.cy }, pivot, angleRadians);
      return {
        ...entity,
        cx: center.x,
        cy: center.y,
        ...(entity.shape === 'ellipse'
          ? { rotation: (entity.rotation ?? 0) + ((angleRadians * 180) / Math.PI) }
          : {}),
      };
    }

    if (entity.shape === 'rect') {
      const topLeft = rotatePointAroundPivot({ x: entity.x, y: entity.y }, pivot, angleRadians);
      return {
        ...entity,
        x: topLeft.x,
        y: topLeft.y,
      };
    }

    if (entity.shape === 'polygon') {
      return {
        ...entity,
        points: (entity.points || []).map((point) => rotatePointAroundPivot(point, pivot, angleRadians)),
      };
    }
  }

  if (entity.type === 'dimension' && !(entity.meta?.sourceRefs?.length)) {
    const p1 = rotatePointAroundPivot(entity.p1, pivot, angleRadians);
    const p2 = rotatePointAroundPivot(entity.p2, pivot, angleRadians);

    return {
      ...entity,
      p1,
      p2,
      subtype: inferDimensionSubtype(p1, p2),
    };
  }

  if (entity.type === 'text') {
    const anchor = rotatePointAroundPivot({ x: entity.x, y: entity.y }, pivot, angleRadians);
    return {
      ...entity,
      x: anchor.x,
      y: anchor.y,
      rotation: (entity.rotation ?? 0) + ((angleRadians * 180) / Math.PI),
    };
  }

  return entity;
}

export function rotateEntities(entities, entityIds, pivot, angleRadians) {
  const idSet = new Set(entityIds);
  return entities.map((entity) => (
    idSet.has(entity.id)
      ? rotateEntityAroundPivot(entity, pivot, angleRadians)
      : entity
  ));
}

export function mirrorEntityAcrossAxis(entity, pivot, direction = 'horizontal') {
  if (entity.type === 'line') {
    return {
      ...entity,
      x1: mirrorPointAcrossAxis({ x: entity.x1, y: entity.y1 }, pivot, direction).x,
      y1: mirrorPointAcrossAxis({ x: entity.x1, y: entity.y1 }, pivot, direction).y,
      x2: mirrorPointAcrossAxis({ x: entity.x2, y: entity.y2 }, pivot, direction).x,
      y2: mirrorPointAcrossAxis({ x: entity.x2, y: entity.y2 }, pivot, direction).y,
    };
  }

  if (entity.type === 'rect') {
    return mirrorRectByCenter(entity, pivot, direction);
  }

  if (entity.type === 'circle') {
    const center = mirrorPointAcrossAxis({ x: entity.cx, y: entity.cy }, pivot, direction);
    return {
      ...entity,
      cx: center.x,
      cy: center.y,
    };
  }

  if (entity.type === 'ellipse') {
    const center = mirrorPointAcrossAxis({ x: entity.cx, y: entity.cy }, pivot, direction);
    return {
      ...entity,
      cx: center.x,
      cy: center.y,
      rotation: mirrorRotationDegrees(entity.rotation ?? 0, direction),
    };
  }

  if (entity.type === 'polyline') {
    return {
      ...entity,
      points: entity.points.map((point) => mirrorPointAcrossAxis(point, pivot, direction)),
    };
  }

  if (entity.type === 'arc') {
    return {
      ...entity,
      start: mirrorPointAcrossAxis(entity.start, pivot, direction),
      end: mirrorPointAcrossAxis(entity.end, pivot, direction),
      control: mirrorPointAcrossAxis(entity.control, pivot, direction),
    };
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle') {
      const center = mirrorPointAcrossAxis({ x: entity.cx, y: entity.cy }, pivot, direction);
      return {
        ...entity,
        cx: center.x,
        cy: center.y,
      };
    }

    if (entity.shape === 'ellipse') {
      const center = mirrorPointAcrossAxis({ x: entity.cx, y: entity.cy }, pivot, direction);
      return {
        ...entity,
        cx: center.x,
        cy: center.y,
        rotation: mirrorRotationDegrees(entity.rotation ?? 0, direction),
      };
    }

    if (entity.shape === 'rect') {
      const center = mirrorPointAcrossAxis({
        x: entity.x + entity.width / 2,
        y: entity.y + entity.height / 2,
      }, pivot, direction);

      return {
        ...entity,
        x: center.x - entity.width / 2,
        y: center.y - entity.height / 2,
      };
    }

    if (entity.shape === 'polygon') {
      return {
        ...entity,
        points: (entity.points || []).map((point) => mirrorPointAcrossAxis(point, pivot, direction)),
      };
    }
  }

  if (entity.type === 'dimension' && !(entity.meta?.sourceRefs?.length)) {
    const p1 = mirrorPointAcrossAxis(entity.p1, pivot, direction);
    const p2 = mirrorPointAcrossAxis(entity.p2, pivot, direction);

    return {
      ...entity,
      p1,
      p2,
      offset: mirrorDimensionOffset(entity, direction),
      subtype: inferDimensionSubtype(p1, p2),
    };
  }

  if (entity.type === 'text') {
    const anchor = mirrorPointAcrossAxis({ x: entity.x, y: entity.y }, pivot, direction);
    return {
      ...entity,
      x: anchor.x,
      y: anchor.y,
      rotation: mirrorRotationDegrees(entity.rotation ?? 0, direction),
    };
  }

  return entity;
}

export function mirrorEntities(entities, entityIds, pivot, direction = 'horizontal') {
  const idSet = new Set(entityIds);
  return entities.map((entity) => (
    idSet.has(entity.id)
      ? mirrorEntityAcrossAxis(entity, pivot, direction)
      : entity
  ));
}

export function computeSelectionBounds(entities, allEntities) {
  if (!entities.length) {
    return null;
  }

  const boxes = entities
    .map((entity) => computeEntityBoundingBox(entity, allEntities))
    .filter(Boolean);

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
