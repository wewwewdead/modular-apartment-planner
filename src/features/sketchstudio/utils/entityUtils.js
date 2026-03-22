import { getArcReferencePoint } from './arcUtils';
import { calculateDistance, getMidpoint, projectPointFromStart } from './canvasMath';
import { formatDimensionText, inferDimensionSubtype, measureDistance } from './dimensionUtils';
import { buildIsometricEllipse, getEllipseSnapPoints } from './isometricUtils';
import { getPolylineMidpoints } from './polylineUtils';

const DEFAULT_TEXT_LABEL = 'Label';
const DEFAULT_TEXT_SIZE = 120;
const TEXT_WIDTH_FACTOR = 0.6;
const TEXT_LINE_HEIGHT_FACTOR = 1.2;

function getHighestEntityNumber(entities, prefix) {
  return entities.reduce((highest, entity) => {
    if (!entity.id.startsWith(`${prefix}-`)) {
      return highest;
    }

    const suffix = Number(entity.id.split('-').at(-1));
    return Number.isFinite(suffix) ? Math.max(highest, suffix) : highest;
  }, 0);
}

function createEntityId(type, entities) {
  const nextNumber = getHighestEntityNumber(entities, type) + 1;
  return `${type}-${nextNumber}`;
}

export { createEntityId };

function getEntityIdPrefix(entity) {
  if (entity?.type === 'dimension') {
    return 'dim';
  }

  return entity?.type ?? 'entity';
}

function cloneSourceRefs(sourceRefs = [], idMap = new Map()) {
  return sourceRefs.map((ref) => ({
    ...ref,
    entityId: idMap.get(ref.entityId) ?? ref.entityId,
  }));
}

function cloneEntityWithId(entity, nextId, idMap = new Map()) {
  const base = {
    ...entity,
    id: nextId,
    meta: {
      ...(entity.meta || {}),
    },
  };

  if (entity.type === 'line') {
    return {
      ...base,
      x1: entity.x1,
      y1: entity.y1,
      x2: entity.x2,
      y2: entity.y2,
    };
  }

  if (entity.type === 'rect') {
    return {
      ...base,
      x: entity.x,
      y: entity.y,
      width: entity.width,
      height: entity.height,
      rotation: entity.rotation ?? 0,
    };
  }

  if (entity.type === 'circle') {
    return {
      ...base,
      cx: entity.cx,
      cy: entity.cy,
      r: entity.r,
    };
  }

  if (entity.type === 'ellipse') {
    return {
      ...base,
      cx: entity.cx,
      cy: entity.cy,
      rx: entity.rx,
      ry: entity.ry,
      rotation: entity.rotation ?? 0,
    };
  }

  if (entity.type === 'polyline') {
    return {
      ...base,
      points: (entity.points || []).map((point) => ({ ...point })),
      closed: entity.closed === true,
    };
  }

  if (entity.type === 'arc') {
    return {
      ...base,
      start: { ...entity.start },
      end: { ...entity.end },
      control: { ...entity.control },
    };
  }

  if (entity.type === 'feature') {
    return {
      ...base,
      points: Array.isArray(entity.points) ? entity.points.map((point) => ({ ...point })) : entity.points,
      meta: {
        ...(entity.meta || {}),
      },
    };
  }

  if (entity.type === 'dimension') {
    return {
      ...base,
      p1: { ...entity.p1 },
      p2: { ...entity.p2 },
      meta: {
        ...(entity.meta || {}),
        sourceRefs: cloneSourceRefs(entity.meta?.sourceRefs, idMap),
      },
    };
  }

  if (entity.type === 'text') {
    return {
      ...base,
      x: entity.x,
      y: entity.y,
      text: entity.text,
      fontSize: entity.fontSize ?? DEFAULT_TEXT_SIZE,
      rotation: entity.rotation ?? 0,
    };
  }

  return base;
}

function canDuplicateDimension(entity, selectedIdSet) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];

  if (!sourceRefs.length) {
    return true;
  }

  return sourceRefs.every((ref) => selectedIdSet.has(ref.entityId));
}

export function duplicateEntitiesByIds(entities, entityIds) {
  const selectedIdSet = new Set(entityIds);
  const duplicableEntities = entities.filter((entity) => (
    selectedIdSet.has(entity.id)
      && (entity.type !== 'dimension' || canDuplicateDimension(entity, selectedIdSet))
  ));
  const idMap = new Map();
  const nextEntities = [...entities];

  duplicableEntities.forEach((entity) => {
    const nextId = createEntityId(getEntityIdPrefix(entity), nextEntities);
    idMap.set(entity.id, nextId);
    nextEntities.push({
      ...entity,
      id: nextId,
    });
  });

  const duplicatedEntities = duplicableEntities.map((entity) => cloneEntityWithId(entity, idMap.get(entity.id), idMap));
  const duplicatedIdSet = new Set(duplicatedEntities.map((entity) => entity.id));
  const mergedEntities = [
    ...entities,
    ...duplicatedEntities,
  ];

  return {
    entities: mergedEntities,
    duplicatedEntities,
    duplicatedIds: duplicatedEntities.map((entity) => entity.id),
    skippedIds: entityIds.filter((entityId) => !idMap.has(entityId)),
    idMap,
    duplicatedIdSet,
  };
}

export function applyLineStyleToEntities(entities, entityIds, lineStyle = null) {
  const selectedIdSet = new Set(entityIds);

  return entities.map((entity) => {
    if (!selectedIdSet.has(entity.id)) {
      return entity;
    }

    const nextMeta = {
      ...(entity.meta || {}),
    };

    if (lineStyle) {
      nextMeta.lineStyle = lineStyle;
    } else {
      delete nextMeta.lineStyle;
    }

    return {
      ...entity,
      meta: nextMeta,
    };
  });
}

export function toggleBrokenLineForEntities(entities, entityIds) {
  const selectedEntities = entities.filter((entity) => entityIds.includes(entity.id));

  if (!selectedEntities.length) {
    return entities;
  }

  const shouldApplyBrokenLine = selectedEntities.some((entity) => entity.meta?.lineStyle !== 'broken');
  return applyLineStyleToEntities(entities, entityIds, shouldApplyBrokenLine ? 'broken' : null);
}

export function createBaseEntity(entity, layerId = 'default') {
  return {
    layerId,
    locked: false,
    visible: true,
    meta: {},
    ...entity,
  };
}

export function normalizeRectFromPoints(startPoint, endPoint) {
  const x = Math.min(startPoint.x, endPoint.x);
  const y = Math.min(startPoint.y, endPoint.y);
  const width = Math.abs(endPoint.x - startPoint.x);
  const height = Math.abs(endPoint.y - startPoint.y);

  return { x, y, width, height };
}

function sanitizeTextValue(rawValue) {
  const normalized = String(rawValue ?? '').replace(/\r?\n/g, ' ').trim();
  return normalized || DEFAULT_TEXT_LABEL;
}

export function getTextMetrics(entity) {
  const fontSize = Math.max(Number(entity?.fontSize) || DEFAULT_TEXT_SIZE, 1);
  const text = sanitizeTextValue(entity?.text);
  const width = Math.max(text.length, 1) * fontSize * TEXT_WIDTH_FACTOR;
  const height = fontSize * TEXT_LINE_HEIGHT_FACTOR;

  return {
    text,
    fontSize,
    width,
    height,
  };
}

export function getTextCorners(entity) {
  const { width, height } = getTextMetrics(entity);
  const anchor = {
    x: entity.x,
    y: entity.y,
  };
  const corners = {
    topLeft: anchor,
    topRight: { x: entity.x + width, y: entity.y },
    bottomRight: { x: entity.x + width, y: entity.y + height },
    bottomLeft: { x: entity.x, y: entity.y + height },
  };
  const rotation = entity.rotation ?? 0;

  if (!rotation) {
    return corners;
  }

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return Object.fromEntries(Object.entries(corners).map(([key, point]) => {
    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    return [key, {
      x: anchor.x + (dx * cos) - (dy * sin),
      y: anchor.y + (dx * sin) + (dy * cos),
    }];
  }));
}

export function getRectCenter(entity) {
  return {
    x: entity.x + entity.width / 2,
    y: entity.y + entity.height / 2,
  };
}

export function getRectCorners(entity) {
  const corners = {
    topLeft: { x: entity.x, y: entity.y },
    topRight: { x: entity.x + entity.width, y: entity.y },
    bottomRight: { x: entity.x + entity.width, y: entity.y + entity.height },
    bottomLeft: { x: entity.x, y: entity.y + entity.height },
  };
  const rotation = entity.rotation ?? 0;

  if (!rotation) {
    return corners;
  }

  const center = getRectCenter(entity);
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return Object.fromEntries(Object.entries(corners).map(([key, point]) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return [key, {
      x: center.x + (dx * cos) - (dy * sin),
      y: center.y + (dx * sin) + (dy * cos),
    }];
  }));
}

export function createLineEntity(startPoint, endPoint, entities, layerId = 'default') {
  const isZeroLength = startPoint.x === endPoint.x && startPoint.y === endPoint.y;

  if (isZeroLength) {
    return null;
  }

  return createBaseEntity({
    id: createEntityId('line', entities),
    type: 'line',
    x1: startPoint.x,
    y1: startPoint.y,
    x2: endPoint.x,
    y2: endPoint.y,
  }, layerId);
}

export function createRectEntity(startPoint, endPoint, entities, layerId = 'default') {
  const rect = normalizeRectFromPoints(startPoint, endPoint);

  if (!rect.width || !rect.height) {
    return null;
  }

  return createBaseEntity({
    id: createEntityId('rect', entities),
    type: 'rect',
    rotation: 0,
    ...rect,
  }, layerId);
}

export function createCircleEntity(centerPoint, radiusPoint, entities, layerId = 'default') {
  const radius = calculateDistance(centerPoint, radiusPoint);

  if (!radius) {
    return null;
  }

  return createBaseEntity({
    id: createEntityId('circle', entities),
    type: 'circle',
    cx: centerPoint.x,
    cy: centerPoint.y,
    r: radius,
  }, layerId);
}

export function createEllipseEntity(centerPoint, radiusPoint, entities, layerId = 'default', options = {}) {
  const ellipse = buildIsometricEllipse(centerPoint, radiusPoint, options.plane, options);

  if (!ellipse?.rx || !ellipse?.ry) {
    return null;
  }

  return createBaseEntity({
    id: createEntityId('ellipse', entities),
    type: 'ellipse',
    cx: ellipse.cx,
    cy: ellipse.cy,
    rx: ellipse.rx,
    ry: ellipse.ry,
    rotation: ellipse.rotation,
    meta: {
      projectionMode: 'isometric',
      isometricPlane: options.plane || ellipse.plane || 'top',
      ...options.meta,
    },
  }, layerId);
}

export function createFeatureEntity(featureConfig, entities, layerId = 'default') {
  if (!featureConfig?.featureType || !featureConfig?.shape) {
    return null;
  }

  const base = {
    id: createEntityId('feature', entities),
    type: 'feature',
    featureType: featureConfig.featureType,
    operation: featureConfig.operation ?? 'subtract',
    targetPartId: featureConfig.targetPartId ?? null,
    sourceProfileId: featureConfig.sourceProfileId ?? null,
    shape: featureConfig.shape,
    depth: featureConfig.depth ?? null,
    through: featureConfig.through !== false,
    meta: {
      objectDraftId: null,
      profileEntityId: null,
      targetPartId: featureConfig.targetPartId ?? null,
      ...featureConfig.meta,
    },
  };

  if (featureConfig.shape === 'circle') {
    const diameter = Math.abs(featureConfig.diameter ?? 0);

    if (!diameter) {
      return null;
    }

    return createBaseEntity({
      ...base,
      cx: featureConfig.cx,
      cy: featureConfig.cy,
      diameter,
    }, layerId);
  }

  if (featureConfig.shape === 'rect') {
    const width = Math.abs(featureConfig.width ?? 0);
    const height = Math.abs(featureConfig.height ?? 0);

    if (!width || !height) {
      return null;
    }

    return createBaseEntity({
      ...base,
      x: featureConfig.x,
      y: featureConfig.y,
      width,
      height,
    }, layerId);
  }

  if (featureConfig.shape === 'ellipse') {
    const rx = Math.abs(featureConfig.rx ?? 0);
    const ry = Math.abs(featureConfig.ry ?? 0);

    if (!rx || !ry) {
      return null;
    }

    return createBaseEntity({
      ...base,
      cx: featureConfig.cx,
      cy: featureConfig.cy,
      rx,
      ry,
      rotation: Number(featureConfig.rotation) || 0,
    }, layerId);
  }

  if (featureConfig.shape === 'polygon') {
    const points = Array.isArray(featureConfig.points)
      ? featureConfig.points.map((point) => ({ x: point.x, y: point.y }))
      : [];

    if (points.length < 3) {
      return null;
    }

    return createBaseEntity({
      ...base,
      points,
      closed: true,
    }, layerId);
  }

  return null;
}

export function createPolylineEntity(points, entities, layerId = 'default', closed = false) {
  if (!points || points.length < 2) {
    return null;
  }

  return createBaseEntity({
    id: createEntityId('polyline', entities),
    type: 'polyline',
    points: points.map((point) => ({ ...point })),
    closed,
  }, layerId);
}

export function createArcEntity(start, end, control, entities, layerId = 'default') {
  if (!start || !end || !control) {
    return null;
  }

  return createBaseEntity({
    id: createEntityId('arc', entities),
    type: 'arc',
    start: { ...start },
    end: { ...end },
    control: { ...control },
  }, layerId);
}

export function createTextEntity(point, entities, layerId = 'default', options = {}) {
  if (!point) {
    return null;
  }

  return createBaseEntity({
    id: createEntityId('text', entities),
    type: 'text',
    x: point.x,
    y: point.y,
    text: sanitizeTextValue(options.text),
    fontSize: Math.max(Number(options.fontSize) || DEFAULT_TEXT_SIZE, 1),
    rotation: Number(options.rotation) || 0,
  }, layerId);
}

export function createDimensionEntity({
  p1,
  p2,
  placementPoint,
  units,
  entities,
  sourceRefs = [],
  layerId = 'dimensions',
  subtype: explicitSubtype = null,
}) {
  const subtype = explicitSubtype ?? inferDimensionSubtype(p1, p2);
  const offset = placementPoint ? getDimensionOffsetFromPlacement(subtype, p1, p2, placementPoint) : 40;

  return createBaseEntity({
    id: createEntityId('dim', entities),
    type: 'dimension',
    subtype,
    p1,
    p2,
    offset,
    text: formatDimensionText(measureDistance(p1, p2, subtype), units),
    units,
    meta: {
      sourceRefs,
    },
  }, layerId);
}

export function createAngleDimensionEntity({ vertex, p1, p2, arcRadius, entities, sourceRefs = [], layerId = 'dimensions', isometricPlane = null }) {
  const entity = {
    id: createEntityId('ang', entities),
    type: 'angle-dimension',
    vertex: { ...vertex },
    p1: { ...p1 },
    p2: { ...p2 },
    arcRadius,
    meta: { sourceRefs },
  };
  if (isometricPlane) {
    entity.isometricPlane = isometricPlane;
  }
  return createBaseEntity(entity, layerId);
}

export function getDimensionOffsetFromPlacement(subtype, p1, p2, placementPoint) {
  if (subtype === 'horizontal') {
    const baseY = (p1.y + p2.y) / 2;
    return placementPoint.y - baseY;
  }

  if (subtype === 'vertical') {
    const baseX = (p1.x + p2.x) / 2;
    return placementPoint.x - baseX;
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  return (placementPoint.x - p1.x) * nx + (placementPoint.y - p1.y) * ny;
}

export function buildSourceRefFromSnap(snap) {
  if (!snap?.point || !snap.sourceEntityId || !snap.sourceType) {
    return null;
  }

  const stableTypes = new Set(['endpoint', 'corner', 'center', 'midpoint', 'vertex', 'arcPoint', 'extrema']);

  if (!stableTypes.has(snap.sourceType)) {
    return null;
  }

  return {
    entityId: snap.sourceEntityId,
    sourceType: snap.sourceType,
    sourceKey: snap.sourceKey ?? null,
  };
}

export function resolveEntityReference(entity, ref) {
  if (!entity || !ref) {
    return null;
  }

  if (entity.type === 'line') {
    if (ref.sourceType === 'endpoint' && ref.sourceKey === 'start') {
      return { x: entity.x1, y: entity.y1 };
    }

    if (ref.sourceType === 'endpoint' && ref.sourceKey === 'end') {
      return { x: entity.x2, y: entity.y2 };
    }

    if (ref.sourceType === 'midpoint') {
      return getMidpoint({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 });
    }
  }

  if (entity.type === 'rect') {
    const corners = getRectCorners(entity);
    const edgeMidpoints = {
      top: getMidpoint(corners.topLeft, corners.topRight),
      right: getMidpoint(corners.topRight, corners.bottomRight),
      bottom: getMidpoint(corners.bottomLeft, corners.bottomRight),
      left: getMidpoint(corners.topLeft, corners.bottomLeft),
    };

    if (ref.sourceType === 'corner') {
      return corners[ref.sourceKey] ?? null;
    }

    if (ref.sourceType === 'midpoint') {
      return edgeMidpoints[ref.sourceKey] ?? null;
    }
  }

  if (entity.type === 'circle') {
    if (ref.sourceType === 'center') {
      return { x: entity.cx, y: entity.cy };
    }

    if (ref.sourceType === 'radius') {
      return { x: entity.cx + entity.r, y: entity.cy };
    }
  }

  if (entity.type === 'ellipse') {
    if (ref.sourceType === 'center') {
      return { x: entity.cx, y: entity.cy };
    }

    if (ref.sourceType === 'extrema') {
      const snapPoint = getEllipseSnapPoints(entity).find((point) => point.sourceKey === ref.sourceKey);
      return snapPoint ? { x: snapPoint.x, y: snapPoint.y } : null;
    }
  }

  if (entity.type === 'polyline') {
    if (ref.sourceType === 'vertex') {
      const index = Number(ref.sourceKey);
      return entity.points[index] ?? null;
    }

    if (ref.sourceType === 'midpoint') {
      const segmentIndex = Number(String(ref.sourceKey).replace('segment-', ''));
      return getPolylineMidpoints(entity).find((midpoint) => midpoint.segmentIndex === segmentIndex) ?? null;
    }
  }

  if (entity.type === 'arc') {
    if (ref.sourceType === 'arcPoint') {
      return getArcReferencePoint(entity, ref.sourceKey);
    }

    if (ref.sourceType === 'midpoint') {
      return getArcReferencePoint(entity, 'midpoint');
    }
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'ellipse') {
      if (ref.sourceType === 'center') {
        return { x: entity.cx, y: entity.cy };
      }

      if (ref.sourceType === 'extrema') {
        const snapPoint = getEllipseSnapPoints(entity).find((point) => point.sourceKey === ref.sourceKey);
        return snapPoint ? { x: snapPoint.x, y: snapPoint.y } : null;
      }
    }

    if (entity.shape === 'polygon' && ref.sourceType === 'vertex') {
      const index = Number(ref.sourceKey);
      return entity.points?.[index] ?? null;
    }
  }

  if (entity.type === 'text') {
    const corners = getTextCorners(entity);

    if (ref.sourceType === 'anchor') {
      return { x: entity.x, y: entity.y };
    }

    if (ref.sourceType === 'corner') {
      return corners[ref.sourceKey] ?? null;
    }
  }

  return null;
}

export function resolveSourceReferenceFromEntities(entities, ref, fallbackPoint = null) {
  if (!ref) {
    return fallbackPoint;
  }

  const entity = entities.find((item) => item.id === ref.entityId);
  return resolveEntityReference(entity, ref) ?? fallbackPoint;
}

export function updateLineEndpoint(entity, handleKey, point) {
  if (handleKey === 'start') {
    return { ...entity, x1: point.x, y1: point.y };
  }

  return { ...entity, x2: point.x, y2: point.y };
}

export function updateRectCorner(entity, handleKey, point) {
  if (entity.rotation) {
    return entity;
  }

  const corners = {
    topLeft: { x: entity.x, y: entity.y },
    topRight: { x: entity.x + entity.width, y: entity.y },
    bottomLeft: { x: entity.x, y: entity.y + entity.height },
    bottomRight: { x: entity.x + entity.width, y: entity.y + entity.height },
  };
  const updatedCorners = {
    ...corners,
    [handleKey]: point,
  };

  if (handleKey === 'topRight') {
    return normalizeRectFromPoints(updatedCorners.bottomLeft, updatedCorners.topRight);
  }

  if (handleKey === 'bottomLeft') {
    return normalizeRectFromPoints(updatedCorners.topRight, updatedCorners.bottomLeft);
  }

  return normalizeRectFromPoints(updatedCorners.topLeft, updatedCorners.bottomRight);
}

export function updateCircleCenter(entity, point) {
  return {
    ...entity,
    cx: point.x,
    cy: point.y,
  };
}

export function updateCircleRadius(entity, point) {
  return {
    ...entity,
    r: calculateDistance({ x: entity.cx, y: entity.cy }, point),
  };
}

export function updateEllipseCenter(entity, point) {
  return {
    ...entity,
    cx: point.x,
    cy: point.y,
  };
}

export function updateEllipseRadius(entity, handleKey, point) {
  const radians = ((entity.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - entity.cx;
  const dy = point.y - entity.cy;

  if (handleKey === 'east' || handleKey === 'west') {
    return {
      ...entity,
      rx: Math.max(0, Math.abs((dx * cos) + (dy * sin))),
    };
  }

  return {
    ...entity,
    ry: Math.max(0, Math.abs((-dx * sin) + (dy * cos))),
  };
}

export function updateTextFontSize(entity, point) {
  const radians = ((entity.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - entity.x;
  const dy = point.y - entity.y;
  const localX = (dx * cos) + (dy * sin);
  const localY = (-dx * sin) + (dy * cos);
  const metrics = getTextMetrics(entity);
  const widthFontSize = Math.abs(localX) / (Math.max(metrics.text.length, 1) * TEXT_WIDTH_FACTOR);
  const heightFontSize = Math.abs(localY) / TEXT_LINE_HEIGHT_FACTOR;

  return {
    ...entity,
    fontSize: Math.max(widthFontSize, heightFontSize, 8),
  };
}

export function updateEntityInList(entities, entityId, updater) {
  return entities.map((entity) => (
    entity.id === entityId ? updater(entity) : entity
  ));
}

export function patchDimensionText(entity) {
  if (entity.type !== 'dimension') {
    return entity;
  }

  const distance = measureDistance(entity.p1, entity.p2, entity.subtype);
  return {
    ...entity,
    text: formatDimensionText(distance, entity.units),
  };
}

export function updateEntityFromNumericField(entity, field, rawValue) {
  if (entity.type === 'text' && field === 'text') {
    return {
      ...entity,
      text: sanitizeTextValue(rawValue),
    };
  }

  const numericValue = Number(rawValue);

  if (field === 'subtype' && entity.type === 'dimension') {
    return {
      ...entity,
      subtype: rawValue,
      text: formatDimensionText(measureDistance(entity.p1, entity.p2, rawValue), entity.units),
    };
  }

  if (!Number.isFinite(numericValue)) {
    return entity;
  }

  if (entity.type === 'line') {
    return {
      ...entity,
      [field]: numericValue,
    };
  }

  if (entity.type === 'rect') {
    if (field === 'width' || field === 'height') {
      return {
        ...entity,
        [field]: Math.abs(numericValue),
      };
    }

    if (field === 'rotation') {
      return {
        ...entity,
        rotation: numericValue,
      };
    }

    return {
      ...entity,
      [field]: numericValue,
    };
  }

  if (entity.type === 'circle') {
    if (field === 'r') {
      return {
        ...entity,
        r: Math.abs(numericValue),
      };
    }

    return {
      ...entity,
      [field]: numericValue,
    };
  }

  if (entity.type === 'ellipse') {
    if (field === 'rx' || field === 'ry') {
      return {
        ...entity,
        [field]: Math.abs(numericValue),
      };
    }

    return {
      ...entity,
      [field]: numericValue,
    };
  }

  if (entity.type === 'dimension' && field === 'offset') {
    return {
      ...entity,
      offset: numericValue,
    };
  }

  if (entity.type === 'feature') {
    if (field === 'featureType' || field === 'shape') {
      return {
        ...entity,
        [field]: rawValue,
      };
    }

    if (field === 'diameter') {
      return {
        ...entity,
        diameter: Math.abs(numericValue),
      };
    }

    if (field === 'width' || field === 'height') {
      return {
        ...entity,
        [field]: Math.abs(numericValue),
      };
    }

    if (field === 'rx' || field === 'ry' || field === 'rotation') {
      return {
        ...entity,
        [field]: field === 'rotation' ? numericValue : Math.abs(numericValue),
      };
    }

    return {
      ...entity,
      [field]: numericValue,
    };
  }

  if (entity.type === 'text') {
    if (field === 'fontSize') {
      return {
        ...entity,
        fontSize: Math.max(Math.abs(numericValue), 1),
      };
    }

    if (field === 'rotation') {
      return {
        ...entity,
        rotation: numericValue,
      };
    }

    return {
      ...entity,
      [field]: numericValue,
    };
  }

  return entity;
}

export function getEntityMeasurementRows(entity) {
  if (!entity) {
    return [];
  }

  if (entity.type === 'line') {
    const midpoint = getMidpoint({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 });
    return [
      ['Length', calculateDistance({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 })],
      ['Start', `${entity.x1.toFixed(1)}, ${entity.y1.toFixed(1)}`],
      ['End', `${entity.x2.toFixed(1)}, ${entity.y2.toFixed(1)}`],
      ['Midpoint', `${midpoint.x.toFixed(1)}, ${midpoint.y.toFixed(1)}`],
    ];
  }

  if (entity.type === 'rect') {
    return [
      ['Width', entity.width],
      ['Height', entity.height],
      ['Area', entity.width * entity.height],
      ['Rotation', entity.rotation ?? 0],
    ];
  }

  if (entity.type === 'circle') {
    return [
      ['Radius', entity.r],
      ['Diameter', entity.r * 2],
      ['Center', `${entity.cx.toFixed(1)}, ${entity.cy.toFixed(1)}`],
    ];
  }

  if (entity.type === 'polyline') {
    return [
      ['Vertices', entity.points.length],
      ['Closed', entity.closed ? 'Yes' : 'No'],
    ];
  }

  if (entity.type === 'arc') {
    return [
      ['Start', `${entity.start.x.toFixed(1)}, ${entity.start.y.toFixed(1)}`],
      ['End', `${entity.end.x.toFixed(1)}, ${entity.end.y.toFixed(1)}`],
      ['Control', `${entity.control.x.toFixed(1)}, ${entity.control.y.toFixed(1)}`],
    ];
  }

  if (entity.type === 'ellipse') {
    return [
      ['Radius X', entity.rx],
      ['Radius Y', entity.ry],
      ['Rotation', entity.rotation ?? 0],
      ['Center', `${entity.cx.toFixed(1)}, ${entity.cy.toFixed(1)}`],
    ];
  }

  if (entity.type === 'dimension') {
    return [
      ['Subtype', entity.subtype],
      ['Offset', entity.offset],
      ['Text', entity.text],
    ];
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle') {
      return [
        ['Feature', entity.featureType],
        ['Shape', entity.shape],
        ['Diameter', entity.diameter],
        ['Center', `${entity.cx.toFixed(1)}, ${entity.cy.toFixed(1)}`],
      ];
    }

    if (entity.shape === 'ellipse') {
      return [
        ['Feature', entity.featureType],
        ['Shape', entity.shape],
        ['Radius X', entity.rx],
        ['Radius Y', entity.ry],
        ['Rotation', entity.rotation ?? 0],
      ];
    }

    if (entity.shape === 'polygon') {
      return [
        ['Feature', entity.featureType],
        ['Shape', entity.shape],
        ['Vertices', entity.points?.length ?? 0],
      ];
    }

    return [
      ['Feature', entity.featureType],
      ['Shape', entity.shape],
      ['Width', entity.width],
      ['Height', entity.height],
    ];
  }

  if (entity.type === 'text') {
    const metrics = getTextMetrics(entity);
    return [
      ['Text', metrics.text],
      ['Font Size', metrics.fontSize],
      ['Rotation', entity.rotation ?? 0],
      ['Position', `${entity.x.toFixed(1)}, ${entity.y.toFixed(1)}`],
    ];
  }

  return [];
}

export function buildLineFromExactLength(startPoint, currentPoint, length) {
  return projectPointFromStart(startPoint, currentPoint, length);
}
