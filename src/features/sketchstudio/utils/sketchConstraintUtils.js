import { getArcBoundingBox } from './arcUtils';
import { computeEntityBoundingBox } from './bboxUtils';
import { getMidpoint } from './canvasMath';
import { getRectCenter, getTextCorners, resolveEntityReference } from './entityUtils';
import { getEllipseSnapPoints } from './isometricUtils';
import { getPolylineMidpoints } from './polylineUtils';
import { collectSnapSegmentsFromEntities } from './snapUtils';
import { translateEntity } from './transformUtils';
import { evaluateSketchExpression } from './sketchExpressionUtils';
import {
  getSketchConstraintLabel,
  getSketchConstraintPriority,
  getSketchConstraintStatusLabel,
  isSketchConstraintType,
  SKETCH_CONSTRAINT_TYPES,
} from './sketchConstraintTypes';

const CONSTRAINT_EPSILON = 1e-6;
let nextConstraintCounter = 1;

function createConstraintId() {
  return `constraint-${nextConstraintCounter++}`;
}

function normalizeConstraintLabel(type, label) {
  const normalized = String(label || '').trim();
  return normalized || getSketchConstraintLabel(type);
}

function normalizeReference(reference, allowedSourceTypes = null) {
  if (!reference || typeof reference !== 'object') {
    return null;
  }

  const entityId = typeof reference.entityId === 'string' && reference.entityId ? reference.entityId : null;
  const sourceType = typeof reference.sourceType === 'string' && reference.sourceType ? reference.sourceType : null;
  const sourceKey = reference.sourceKey == null ? null : String(reference.sourceKey);

  if (!entityId || !sourceType) {
    return null;
  }

  if (Array.isArray(allowedSourceTypes) && !allowedSourceTypes.includes(sourceType)) {
    return null;
  }

  return {
    entityId,
    sourceType,
    sourceKey,
  };
}

function normalizeConstraintByType(constraint) {
  const type = isSketchConstraintType(constraint?.type) ? constraint.type : 'equal_length';
  const base = {
    id: typeof constraint?.id === 'string' && constraint.id ? constraint.id : createConstraintId(),
    type,
    label: normalizeConstraintLabel(type, constraint?.label),
    enabled: constraint?.enabled !== false,
  };

  if (type === 'equal_length' || type === 'equal_width' || type === 'equal_height') {
    return {
      ...base,
      driverEntityId:
        typeof constraint?.driverEntityId === 'string' && constraint.driverEntityId ? constraint.driverEntityId : null,
      drivenEntityId:
        typeof constraint?.drivenEntityId === 'string' && constraint.drivenEntityId ? constraint.drivenEntityId : null,
    };
  }

  if (type === 'horizontal' || type === 'vertical') {
    return {
      ...base,
      entityId: typeof constraint?.entityId === 'string' && constraint.entityId ? constraint.entityId : null,
    };
  }

  if (type === 'coincident_point') {
    return {
      ...base,
      driverRef: normalizeReference(constraint?.driverRef),
      drivenRef: normalizeReference(constraint?.drivenRef),
    };
  }

  if (type === 'midpoint_lock') {
    return {
      ...base,
      midpointRef: normalizeReference(constraint?.midpointRef, ['midpoint']),
      drivenRef: normalizeReference(constraint?.drivenRef),
    };
  }

  if (type === 'centered_between') {
    return {
      ...base,
      betweenStartRef: normalizeReference(constraint?.betweenStartRef),
      betweenEndRef: normalizeReference(constraint?.betweenEndRef),
      drivenEntityId:
        typeof constraint?.drivenEntityId === 'string' && constraint.drivenEntityId ? constraint.drivenEntityId : null,
      axis: ['x', 'y', 'both'].includes(constraint?.axis) ? constraint.axis : 'x',
    };
  }

  if (type === 'offset_distance' || type === 'thickness_offset') {
    return {
      ...base,
      sourceSegmentRef: normalizeReference(constraint?.sourceSegmentRef, ['segment']),
      targetSegmentRef: normalizeReference(constraint?.targetSegmentRef, ['segment']),
      distanceExpression: String(constraint?.distanceExpression || '').trim(),
    };
  }

  return base;
}

function getConstraintDependency(constraint) {
  if (constraint.type === 'equal_length' || constraint.type === 'equal_width' || constraint.type === 'equal_height') {
    return {
      driverIds: constraint.driverEntityId ? [constraint.driverEntityId] : [],
      drivenId: constraint.drivenEntityId ?? null,
    };
  }

  if (constraint.type === 'horizontal' || constraint.type === 'vertical') {
    return {
      driverIds: [],
      drivenId: constraint.entityId ?? null,
    };
  }

  if (constraint.type === 'coincident_point') {
    return {
      driverIds: constraint.driverRef?.entityId ? [constraint.driverRef.entityId] : [],
      drivenId: constraint.drivenRef?.entityId ?? null,
    };
  }

  if (constraint.type === 'midpoint_lock') {
    return {
      driverIds: constraint.midpointRef?.entityId ? [constraint.midpointRef.entityId] : [],
      drivenId: constraint.drivenRef?.entityId ?? null,
    };
  }

  if (constraint.type === 'centered_between') {
    return {
      driverIds: [constraint.betweenStartRef?.entityId, constraint.betweenEndRef?.entityId].filter(Boolean),
      drivenId: constraint.drivenEntityId ?? null,
    };
  }

  if (constraint.type === 'offset_distance' || constraint.type === 'thickness_offset') {
    return {
      driverIds: constraint.sourceSegmentRef?.entityId ? [constraint.sourceSegmentRef.entityId] : [],
      drivenId: constraint.targetSegmentRef?.entityId ?? null,
    };
  }

  return {
    driverIds: [],
    drivenId: null,
  };
}

function addUnique(list, value) {
  if (value == null || list.includes(value)) {
    return list;
  }

  list.push(value);
  return list;
}

function buildEntityGraph(entityIds, constraints) {
  const adjacency = new Map(entityIds.map((entityId) => [entityId, []]));

  constraints.forEach((constraint) => {
    const dependency = getConstraintDependency(constraint);

    dependency.driverIds.forEach((driverId) => {
      if (!driverId || !dependency.drivenId || driverId === dependency.drivenId) {
        return;
      }

      if (!adjacency.has(driverId)) {
        adjacency.set(driverId, []);
      }

      adjacency.get(driverId).push(dependency.drivenId);
    });
  });

  return adjacency;
}

function findCyclicSccEntityIds(entityIds, constraints) {
  const graph = buildEntityGraph(entityIds, constraints);
  const indexByEntity = new Map();
  const lowLinkByEntity = new Map();
  const onStack = new Set();
  const stack = [];
  const cyclicEntityIds = new Set();
  let nextIndex = 0;

  function strongConnect(entityId) {
    indexByEntity.set(entityId, nextIndex);
    lowLinkByEntity.set(entityId, nextIndex);
    nextIndex += 1;
    stack.push(entityId);
    onStack.add(entityId);

    const neighbors = graph.get(entityId) || [];

    neighbors.forEach((neighborId) => {
      if (!indexByEntity.has(neighborId)) {
        strongConnect(neighborId);
        lowLinkByEntity.set(entityId, Math.min(lowLinkByEntity.get(entityId), lowLinkByEntity.get(neighborId)));
      } else if (onStack.has(neighborId)) {
        lowLinkByEntity.set(entityId, Math.min(lowLinkByEntity.get(entityId), indexByEntity.get(neighborId)));
      }
    });

    if (lowLinkByEntity.get(entityId) !== indexByEntity.get(entityId)) {
      return;
    }

    const component = [];
    let currentEntityId = null;

    do {
      currentEntityId = stack.pop();
      onStack.delete(currentEntityId);
      component.push(currentEntityId);
    } while (currentEntityId !== entityId);

    const hasSelfLoop = (graph.get(entityId) || []).includes(entityId);

    if (component.length > 1 || hasSelfLoop) {
      component.forEach((memberId) => cyclicEntityIds.add(memberId));
    }
  }

  entityIds.forEach((entityId) => {
    if (!indexByEntity.has(entityId)) {
      strongConnect(entityId);
    }
  });

  return cyclicEntityIds;
}

function createConstraintDiagnostic(constraint, status, message) {
  return {
    constraintId: constraint.id,
    type: constraint.type,
    label: constraint.label,
    status,
    statusLabel: getSketchConstraintStatusLabel(status),
    message,
  };
}

function buildTopologicalOrder(entityIds, constraints) {
  const cyclicEntityIds = findCyclicSccEntityIds(entityIds, constraints);
  const applicableConstraints = constraints.filter((constraint) => {
    const dependency = getConstraintDependency(constraint);

    if (!dependency.drivenId || !dependency.driverIds.length) {
      return true;
    }

    return !dependency.driverIds.some(
      (driverId) => cyclicEntityIds.has(driverId) && cyclicEntityIds.has(dependency.drivenId),
    );
  });

  const adjacency = new Map(entityIds.map((entityId) => [entityId, []]));
  const inDegree = new Map(entityIds.map((entityId) => [entityId, 0]));

  applicableConstraints.forEach((constraint) => {
    const dependency = getConstraintDependency(constraint);

    dependency.driverIds.forEach((driverId) => {
      if (!driverId || !dependency.drivenId || driverId === dependency.drivenId) {
        return;
      }

      if (!adjacency.has(driverId) || !inDegree.has(dependency.drivenId)) {
        return;
      }

      adjacency.get(driverId).push(dependency.drivenId);
      inDegree.set(dependency.drivenId, inDegree.get(dependency.drivenId) + 1);
    });
  });

  const queue = entityIds.filter((entityId) => inDegree.get(entityId) === 0);
  const order = [];

  while (queue.length) {
    const entityId = queue.shift();
    order.push(entityId);

    (adjacency.get(entityId) || []).forEach((neighborId) => {
      inDegree.set(neighborId, inDegree.get(neighborId) - 1);

      if (inDegree.get(neighborId) === 0) {
        queue.push(neighborId);
      }
    });
  }

  entityIds.forEach((entityId) => {
    if (!order.includes(entityId)) {
      order.push(entityId);
    }
  });

  const blockedConstraintIds = new Set();

  constraints.forEach((constraint) => {
    const dependency = getConstraintDependency(constraint);

    if (
      dependency.drivenId &&
      dependency.driverIds.some((driverId) => cyclicEntityIds.has(driverId) && cyclicEntityIds.has(dependency.drivenId))
    ) {
      blockedConstraintIds.add(constraint.id);
    }
  });

  return {
    order,
    blockedConstraintIds,
  };
}

function getLineLength(entity) {
  return Math.hypot((entity.x2 ?? 0) - (entity.x1 ?? 0), (entity.y2 ?? 0) - (entity.y1 ?? 0));
}

function getEntityRectLikeSize(entity) {
  if (entity?.type === 'rect') {
    return {
      width: Number(entity.width) || 0,
      height: Number(entity.height) || 0,
    };
  }

  if (entity?.type === 'feature' && entity.shape === 'rect') {
    return {
      width: Number(entity.width) || 0,
      height: Number(entity.height) || 0,
    };
  }

  return null;
}

function setEntityRectLikeSize(entity, nextSize) {
  if (entity?.type === 'rect') {
    return {
      ...entity,
      width: nextSize.width ?? entity.width,
      height: nextSize.height ?? entity.height,
    };
  }

  if (entity?.type === 'feature' && entity.shape === 'rect') {
    return {
      ...entity,
      width: nextSize.width ?? entity.width,
      height: nextSize.height ?? entity.height,
    };
  }

  return entity;
}

function getEntityCenter(entity, allEntities) {
  if (!entity) {
    return null;
  }

  if (entity.type === 'line') {
    return {
      x: (entity.x1 + entity.x2) / 2,
      y: (entity.y1 + entity.y2) / 2,
    };
  }

  if (entity.type === 'rect') {
    return getRectCenter(entity);
  }

  if (entity.type === 'circle' || entity.type === 'ellipse') {
    return {
      x: entity.cx,
      y: entity.cy,
    };
  }

  if (entity.type === 'polyline') {
    const bbox = computeEntityBoundingBox(entity, allEntities || [entity]);
    return bbox ? { x: bbox.minX + bbox.width / 2, y: bbox.minY + bbox.height / 2 } : null;
  }

  if (entity.type === 'arc') {
    const bbox = getArcBoundingBox(entity);
    return {
      x: bbox.minX + bbox.width / 2,
      y: bbox.minY + bbox.height / 2,
    };
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle' || entity.shape === 'ellipse') {
      return {
        x: entity.cx,
        y: entity.cy,
      };
    }

    if (entity.shape === 'rect') {
      return {
        x: entity.x + entity.width / 2,
        y: entity.y + entity.height / 2,
      };
    }

    if (entity.shape === 'polygon') {
      const bbox = computeEntityBoundingBox(entity, allEntities || [entity]);
      return bbox ? { x: bbox.minX + bbox.width / 2, y: bbox.minY + bbox.height / 2 } : null;
    }
  }

  if (entity.type === 'text') {
    const corners = getTextCorners(entity);
    const xValues = Object.values(corners).map((point) => point.x);
    const yValues = Object.values(corners).map((point) => point.y);

    return {
      x: (Math.min(...xValues) + Math.max(...xValues)) / 2,
      y: (Math.min(...yValues) + Math.max(...yValues)) / 2,
    };
  }

  return null;
}

function translateEntityToAlignPoint(entity, currentPoint, targetPoint) {
  if (!currentPoint || !targetPoint) {
    return entity;
  }

  return translateEntity(entity, {
    x: targetPoint.x - currentPoint.x,
    y: targetPoint.y - currentPoint.y,
  });
}

function resolveSegmentReference(entitiesById, reference) {
  if (!reference?.entityId || reference.sourceType !== 'segment') {
    return null;
  }

  const entity = entitiesById.get(reference.entityId);

  if (!entity) {
    return null;
  }

  return collectSnapSegmentsFromEntities([entity]).find((segment) => segment.sourceKey === reference.sourceKey) || null;
}

function resolvePointReference(entitiesById, reference) {
  if (!reference?.entityId) {
    return null;
  }

  return resolveEntityReference(entitiesById.get(reference.entityId), reference);
}

function isAxisAlignedRectSegmentEntity(entity) {
  return (
    (entity?.type === 'rect' && !Number(entity.rotation)) || (entity?.type === 'feature' && entity.shape === 'rect')
  );
}

function isOffsetSegmentSupported(entity, segmentReference) {
  if (!entity || !segmentReference || segmentReference.sourceType !== 'segment') {
    return false;
  }

  if (entity.type === 'line') {
    return segmentReference.sourceKey === 'segment';
  }

  if (isAxisAlignedRectSegmentEntity(entity)) {
    return ['top', 'right', 'bottom', 'left'].includes(segmentReference.sourceKey);
  }

  return false;
}

function evaluateConstraintDistanceExpression(constraint, variables, context) {
  if (constraint.type === 'thickness_offset' && !constraint.distanceExpression) {
    const thicknessVariable = variables.find((variable) => variable?.name === 'thickness');

    if (thicknessVariable && Number.isFinite(Number(thicknessVariable.value))) {
      return {
        value: Number(thicknessVariable.value),
        error: null,
      };
    }

    const sourceThickness = Number(context?.source?.thickness);

    if (Number.isFinite(sourceThickness) && sourceThickness > 0) {
      return {
        value: sourceThickness,
        error: null,
      };
    }

    const targetThickness = Number(context?.target?.thickness);

    if (Number.isFinite(targetThickness) && targetThickness > 0) {
      return {
        value: targetThickness,
        error: null,
      };
    }
  }

  if (!constraint.distanceExpression) {
    return {
      value: null,
      error: 'Distance expression is required',
    };
  }

  return evaluateSketchExpression(constraint.distanceExpression, {
    variables,
    context,
    requireFormulaPrefix: false,
  });
}

function normalizeVector(dx, dy) {
  const length = Math.hypot(dx, dy);

  if (length <= CONSTRAINT_EPSILON) {
    return null;
  }

  return {
    x: dx / length,
    y: dy / length,
    length,
  };
}

function applyLineConstraint(entity, mode) {
  if (entity?.type !== 'line') {
    return null;
  }

  const vector = normalizeVector((entity.x2 ?? 0) - (entity.x1 ?? 0), (entity.y2 ?? 0) - (entity.y1 ?? 0));

  if (!vector) {
    return entity;
  }

  if (mode === 'horizontal') {
    const sign = Math.abs(vector.x) > CONSTRAINT_EPSILON ? Math.sign(vector.x) : 1;
    const length = getLineLength(entity);

    return {
      ...entity,
      x2: entity.x1 + sign * length,
      y2: entity.y1,
    };
  }

  const sign = Math.abs(vector.y) > CONSTRAINT_EPSILON ? Math.sign(vector.y) : 1;
  const length = getLineLength(entity);

  return {
    ...entity,
    x2: entity.x1,
    y2: entity.y1 + sign * length,
  };
}

function applyEqualLengthConstraint(driverEntity, drivenEntity) {
  if (driverEntity?.type !== 'line' || drivenEntity?.type !== 'line') {
    return null;
  }

  const nextLength = getLineLength(driverEntity);
  const currentVector = normalizeVector(
    (drivenEntity.x2 ?? 0) - (drivenEntity.x1 ?? 0),
    (drivenEntity.y2 ?? 0) - (drivenEntity.y1 ?? 0),
  );
  const driverVector = normalizeVector(
    (driverEntity.x2 ?? 0) - (driverEntity.x1 ?? 0),
    (driverEntity.y2 ?? 0) - (driverEntity.y1 ?? 0),
  );
  const direction = currentVector || driverVector;

  if (!direction) {
    return drivenEntity;
  }

  return {
    ...drivenEntity,
    x2: drivenEntity.x1 + direction.x * nextLength,
    y2: drivenEntity.y1 + direction.y * nextLength,
  };
}

function applyEqualSizeConstraint(driverEntity, drivenEntity, field) {
  const driverSize = getEntityRectLikeSize(driverEntity);
  const drivenSize = getEntityRectLikeSize(drivenEntity);

  if (!driverSize || !drivenSize) {
    return null;
  }

  return setEntityRectLikeSize(drivenEntity, {
    [field]: Math.abs(driverSize[field] ?? drivenSize[field] ?? 0),
  });
}

function applyCenteredBetweenConstraint(drivenEntity, startPoint, endPoint, axis, entities) {
  const entityCenter = getEntityCenter(drivenEntity, entities);

  if (!entityCenter) {
    return null;
  }

  const targetCenter = getMidpoint(startPoint, endPoint);
  const nextPoint = {
    x: axis === 'y' ? entityCenter.x : targetCenter.x,
    y: axis === 'x' ? entityCenter.y : targetCenter.y,
  };

  return translateEntityToAlignPoint(drivenEntity, entityCenter, nextPoint);
}

function applyOffsetConstraint(sourceSegment, targetSegment, drivenEntity, distanceValue) {
  const sourceDirection = normalizeVector(
    sourceSegment.end.x - sourceSegment.start.x,
    sourceSegment.end.y - sourceSegment.start.y,
  );
  const targetDirection = normalizeVector(
    targetSegment.end.x - targetSegment.start.x,
    targetSegment.end.y - targetSegment.start.y,
  );

  if (!sourceDirection || !targetDirection) {
    return null;
  }

  const cross = Math.abs(sourceDirection.x * targetDirection.y - sourceDirection.y * targetDirection.x);

  if (cross > 1e-3) {
    return null;
  }

  const normal = {
    x: -sourceDirection.y,
    y: sourceDirection.x,
  };
  const currentSignedDistance =
    (targetSegment.start.x - sourceSegment.start.x) * normal.x +
    (targetSegment.start.y - sourceSegment.start.y) * normal.y;
  const desiredDistanceMagnitude = Math.abs(Number(distanceValue) || 0);
  const desiredSignedDistance =
    Number(distanceValue) < 0
      ? -desiredDistanceMagnitude
      : Math.abs(currentSignedDistance) > CONSTRAINT_EPSILON && currentSignedDistance < 0
        ? -desiredDistanceMagnitude
        : desiredDistanceMagnitude;

  return translateEntity(drivenEntity, {
    x: normal.x * (desiredSignedDistance - currentSignedDistance),
    y: normal.y * (desiredSignedDistance - currentSignedDistance),
  });
}

function buildConstraintExpressionContext(driverEntity, drivenEntity) {
  return {
    source: {
      thickness: driverEntity?.thickness ?? null,
    },
    target: {
      thickness: drivenEntity?.thickness ?? null,
    },
    driver: {
      thickness: driverEntity?.thickness ?? null,
    },
    driven: {
      thickness: drivenEntity?.thickness ?? null,
    },
  };
}

function applyConstraintToEntities({ constraint, entitiesById, variables }) {
  if (!constraint.enabled) {
    return createConstraintDiagnostic(constraint, 'disabled', 'Constraint is disabled');
  }

  if (constraint.type === 'horizontal' || constraint.type === 'vertical') {
    const targetEntity = entitiesById.get(constraint.entityId);

    if (!targetEntity) {
      return createConstraintDiagnostic(constraint, 'invalid_ref', 'Target entity is missing');
    }

    const nextEntity = applyLineConstraint(targetEntity, constraint.type);

    if (!nextEntity) {
      return createConstraintDiagnostic(constraint, 'unsupported', 'Only line entities support this constraint');
    }

    entitiesById.set(targetEntity.id, nextEntity);
    return createConstraintDiagnostic(constraint, 'applied', null);
  }

  if (constraint.type === 'equal_length') {
    const driverEntity = entitiesById.get(constraint.driverEntityId);
    const drivenEntity = entitiesById.get(constraint.drivenEntityId);

    if (!driverEntity || !drivenEntity) {
      return createConstraintDiagnostic(constraint, 'invalid_ref', 'Driver or driven entity is missing');
    }

    const nextEntity = applyEqualLengthConstraint(driverEntity, drivenEntity);

    if (!nextEntity) {
      return createConstraintDiagnostic(
        constraint,
        'unsupported',
        'Equal length currently supports line-to-line constraints',
      );
    }

    entitiesById.set(drivenEntity.id, nextEntity);
    return createConstraintDiagnostic(constraint, 'applied', null);
  }

  if (constraint.type === 'equal_width' || constraint.type === 'equal_height') {
    const driverEntity = entitiesById.get(constraint.driverEntityId);
    const drivenEntity = entitiesById.get(constraint.drivenEntityId);

    if (!driverEntity || !drivenEntity) {
      return createConstraintDiagnostic(constraint, 'invalid_ref', 'Driver or driven entity is missing');
    }

    const nextEntity = applyEqualSizeConstraint(
      driverEntity,
      drivenEntity,
      constraint.type === 'equal_width' ? 'width' : 'height',
    );

    if (!nextEntity) {
      return createConstraintDiagnostic(
        constraint,
        'unsupported',
        'Equal width and height currently support rectangular entities',
      );
    }

    entitiesById.set(drivenEntity.id, nextEntity);
    return createConstraintDiagnostic(constraint, 'applied', null);
  }

  if (constraint.type === 'coincident_point') {
    const driverEntity = entitiesById.get(constraint.driverRef?.entityId);
    const drivenEntity = entitiesById.get(constraint.drivenRef?.entityId);
    const driverPoint = resolvePointReference(entitiesById, constraint.driverRef);
    const drivenPoint = resolvePointReference(entitiesById, constraint.drivenRef);

    if (!driverEntity || !drivenEntity || !driverPoint || !drivenPoint) {
      return createConstraintDiagnostic(constraint, 'invalid_ref', 'Point references could not be resolved');
    }

    if (driverEntity.id === drivenEntity.id) {
      return createConstraintDiagnostic(
        constraint,
        'unsupported',
        'Coincident point requires separate driver and driven entities',
      );
    }

    entitiesById.set(drivenEntity.id, translateEntityToAlignPoint(drivenEntity, drivenPoint, driverPoint));
    return createConstraintDiagnostic(constraint, 'applied', null);
  }

  if (constraint.type === 'midpoint_lock') {
    const midpointEntity = entitiesById.get(constraint.midpointRef?.entityId);
    const drivenEntity = entitiesById.get(constraint.drivenRef?.entityId);
    const midpoint = resolvePointReference(entitiesById, constraint.midpointRef);
    const drivenPoint = resolvePointReference(entitiesById, constraint.drivenRef);

    if (!midpointEntity || !drivenEntity || !midpoint || !drivenPoint) {
      return createConstraintDiagnostic(constraint, 'invalid_ref', 'Midpoint or driven point could not be resolved');
    }

    if (midpointEntity.id === drivenEntity.id) {
      return createConstraintDiagnostic(
        constraint,
        'unsupported',
        'Midpoint lock requires separate driver and driven entities',
      );
    }

    entitiesById.set(drivenEntity.id, translateEntityToAlignPoint(drivenEntity, drivenPoint, midpoint));
    return createConstraintDiagnostic(constraint, 'applied', null);
  }

  if (constraint.type === 'centered_between') {
    const drivenEntity = entitiesById.get(constraint.drivenEntityId);
    const startPoint = resolvePointReference(entitiesById, constraint.betweenStartRef);
    const endPoint = resolvePointReference(entitiesById, constraint.betweenEndRef);

    if (!drivenEntity || !startPoint || !endPoint) {
      return createConstraintDiagnostic(constraint, 'invalid_ref', 'Centering references could not be resolved');
    }

    if (
      constraint.drivenEntityId === constraint.betweenStartRef?.entityId ||
      constraint.drivenEntityId === constraint.betweenEndRef?.entityId
    ) {
      return createConstraintDiagnostic(
        constraint,
        'unsupported',
        'Centered-between requires an independent driven entity',
      );
    }

    const nextEntity = applyCenteredBetweenConstraint(
      drivenEntity,
      startPoint,
      endPoint,
      constraint.axis,
      Array.from(entitiesById.values()),
    );

    if (!nextEntity) {
      return createConstraintDiagnostic(constraint, 'unsupported', 'Driven entity does not expose a movable center');
    }

    entitiesById.set(drivenEntity.id, nextEntity);
    return createConstraintDiagnostic(constraint, 'applied', null);
  }

  if (constraint.type === 'offset_distance' || constraint.type === 'thickness_offset') {
    const sourceEntity = entitiesById.get(constraint.sourceSegmentRef?.entityId);
    const drivenEntity = entitiesById.get(constraint.targetSegmentRef?.entityId);
    const sourceSegment = resolveSegmentReference(entitiesById, constraint.sourceSegmentRef);
    const targetSegment = resolveSegmentReference(entitiesById, constraint.targetSegmentRef);

    if (!sourceEntity || !drivenEntity || !sourceSegment || !targetSegment) {
      return createConstraintDiagnostic(constraint, 'invalid_ref', 'Offset segment references could not be resolved');
    }

    if (sourceEntity.id === drivenEntity.id) {
      return createConstraintDiagnostic(
        constraint,
        'unsupported',
        'Offset constraints require separate source and driven entities',
      );
    }

    if (
      !isOffsetSegmentSupported(sourceEntity, constraint.sourceSegmentRef) ||
      !isOffsetSegmentSupported(drivenEntity, constraint.targetSegmentRef)
    ) {
      return createConstraintDiagnostic(
        constraint,
        'unsupported',
        'Offset constraints currently support lines and axis-aligned rectangle edges only',
      );
    }

    const distanceResult = evaluateConstraintDistanceExpression(
      constraint,
      variables,
      buildConstraintExpressionContext(sourceEntity, drivenEntity),
    );

    if (distanceResult.error || !Number.isFinite(distanceResult.value)) {
      return createConstraintDiagnostic(
        constraint,
        'expression_error',
        distanceResult.error || 'Distance expression could not be resolved',
      );
    }

    const nextEntity = applyOffsetConstraint(sourceSegment, targetSegment, drivenEntity, distanceResult.value);

    if (!nextEntity) {
      return createConstraintDiagnostic(constraint, 'unsupported', 'Source and target segments must remain parallel');
    }

    entitiesById.set(drivenEntity.id, nextEntity);
    return createConstraintDiagnostic(constraint, 'applied', null);
  }

  return createConstraintDiagnostic(constraint, 'unsupported', 'Constraint type is not supported');
}

function getPointReferenceOptions(entity) {
  if (!entity) {
    return [];
  }

  if (entity.type === 'line') {
    return [
      { label: 'Start', ref: { entityId: entity.id, sourceType: 'endpoint', sourceKey: 'start' } },
      { label: 'End', ref: { entityId: entity.id, sourceType: 'endpoint', sourceKey: 'end' } },
      { label: 'Midpoint', ref: { entityId: entity.id, sourceType: 'midpoint', sourceKey: 'segment' } },
    ];
  }

  if (entity.type === 'rect') {
    return [
      { label: 'Top Left', ref: { entityId: entity.id, sourceType: 'corner', sourceKey: 'topLeft' } },
      { label: 'Top Right', ref: { entityId: entity.id, sourceType: 'corner', sourceKey: 'topRight' } },
      { label: 'Bottom Left', ref: { entityId: entity.id, sourceType: 'corner', sourceKey: 'bottomLeft' } },
      { label: 'Bottom Right', ref: { entityId: entity.id, sourceType: 'corner', sourceKey: 'bottomRight' } },
      { label: 'Top Midpoint', ref: { entityId: entity.id, sourceType: 'midpoint', sourceKey: 'top' } },
      { label: 'Right Midpoint', ref: { entityId: entity.id, sourceType: 'midpoint', sourceKey: 'right' } },
      { label: 'Bottom Midpoint', ref: { entityId: entity.id, sourceType: 'midpoint', sourceKey: 'bottom' } },
      { label: 'Left Midpoint', ref: { entityId: entity.id, sourceType: 'midpoint', sourceKey: 'left' } },
    ];
  }

  if (entity.type === 'circle') {
    return [{ label: 'Center', ref: { entityId: entity.id, sourceType: 'center', sourceKey: 'center' } }];
  }

  if (entity.type === 'ellipse') {
    return getEllipseSnapPoints(entity).map((snapPoint) => ({
      label: snapPoint.sourceType === 'center' ? 'Center' : `Extrema ${snapPoint.sourceKey}`,
      ref: {
        entityId: entity.id,
        sourceType: snapPoint.sourceType,
        sourceKey: snapPoint.sourceKey,
      },
    }));
  }

  if (entity.type === 'polyline') {
    return [
      ...entity.points.map((point, index) => ({
        label: `Vertex ${index + 1}`,
        ref: { entityId: entity.id, sourceType: 'vertex', sourceKey: String(index) },
      })),
      ...getPolylineMidpoints(entity).map((midpoint) => ({
        label: `Segment ${midpoint.segmentIndex + 1} Midpoint`,
        ref: { entityId: entity.id, sourceType: 'midpoint', sourceKey: `segment-${midpoint.segmentIndex}` },
      })),
    ];
  }

  if (entity.type === 'arc') {
    return [
      { label: 'Start', ref: { entityId: entity.id, sourceType: 'arcPoint', sourceKey: 'start' } },
      { label: 'End', ref: { entityId: entity.id, sourceType: 'arcPoint', sourceKey: 'end' } },
      { label: 'Control', ref: { entityId: entity.id, sourceType: 'arcPoint', sourceKey: 'control' } },
      { label: 'Midpoint', ref: { entityId: entity.id, sourceType: 'midpoint', sourceKey: 'midpoint' } },
    ];
  }

  if (entity.type === 'feature') {
    if (entity.shape === 'circle') {
      return [{ label: 'Center', ref: { entityId: entity.id, sourceType: 'center', sourceKey: 'center' } }];
    }

    if (entity.shape === 'rect') {
      return [
        { label: 'Top Left', ref: { entityId: entity.id, sourceType: 'corner', sourceKey: 'topLeft' } },
        { label: 'Top Right', ref: { entityId: entity.id, sourceType: 'corner', sourceKey: 'topRight' } },
        { label: 'Bottom Left', ref: { entityId: entity.id, sourceType: 'corner', sourceKey: 'bottomLeft' } },
        { label: 'Bottom Right', ref: { entityId: entity.id, sourceType: 'corner', sourceKey: 'bottomRight' } },
        { label: 'Top Midpoint', ref: { entityId: entity.id, sourceType: 'midpoint', sourceKey: 'top' } },
        { label: 'Right Midpoint', ref: { entityId: entity.id, sourceType: 'midpoint', sourceKey: 'right' } },
        { label: 'Bottom Midpoint', ref: { entityId: entity.id, sourceType: 'midpoint', sourceKey: 'bottom' } },
        { label: 'Left Midpoint', ref: { entityId: entity.id, sourceType: 'midpoint', sourceKey: 'left' } },
      ];
    }

    if (entity.shape === 'ellipse') {
      return getEllipseSnapPoints(entity).map((snapPoint) => ({
        label: snapPoint.sourceType === 'center' ? 'Center' : `Extrema ${snapPoint.sourceKey}`,
        ref: {
          entityId: entity.id,
          sourceType: snapPoint.sourceType,
          sourceKey: snapPoint.sourceKey,
        },
      }));
    }

    if (entity.shape === 'polygon') {
      return (entity.points || []).map((point, index) => ({
        label: `Vertex ${index + 1}`,
        ref: { entityId: entity.id, sourceType: 'vertex', sourceKey: String(index) },
      }));
    }
  }

  if (entity.type === 'text') {
    return [{ label: 'Anchor', ref: { entityId: entity.id, sourceType: 'anchor', sourceKey: 'anchor' } }];
  }

  return [];
}

function getSegmentReferenceOptions(entity) {
  return collectSnapSegmentsFromEntities([entity]).map((segment) => ({
    label:
      segment.sourceKey === 'segment'
        ? 'Segment'
        : String(segment.sourceKey).replace(/^./, (char) => char.toUpperCase()),
    ref: {
      entityId: entity.id,
      sourceType: segment.sourceType,
      sourceKey: segment.sourceKey,
    },
  }));
}

function serializeReference(ref) {
  if (!ref) {
    return '';
  }

  return `${ref.entityId}:${ref.sourceType}:${ref.sourceKey ?? ''}`;
}

export function parseSerializedConstraintReference(serialized) {
  const [entityId, sourceType, sourceKey = ''] = String(serialized || '').split(':');

  if (!entityId || !sourceType) {
    return null;
  }

  return {
    entityId,
    sourceType,
    sourceKey: sourceKey || null,
  };
}

export function listConstraintEntityIds(constraint) {
  const ids = [];
  const dependency = getConstraintDependency(constraint);

  dependency.driverIds.forEach((entityId) => addUnique(ids, entityId));
  addUnique(ids, dependency.drivenId);

  return ids;
}

export function createSketchConstraint(input = {}) {
  return normalizeConstraintByType(input);
}

export function normalizeSketchConstraints(constraints = []) {
  return Array.isArray(constraints) ? constraints.map(normalizeConstraintByType) : [];
}

export function getConstraintTypeOptions() {
  return SKETCH_CONSTRAINT_TYPES.map((type) => ({
    value: type,
    label: getSketchConstraintLabel(type),
  }));
}

export function getConstraintPointOptions(entities = []) {
  return entities.flatMap((entity) =>
    getPointReferenceOptions(entity).map((option) => ({
      ...option,
      value: serializeReference(option.ref),
      entityId: entity.id,
      entityLabel: `${entity.id} (${entity.type})`,
    })),
  );
}

export function getConstraintMidpointOptions(entities = []) {
  return getConstraintPointOptions(entities).filter((option) => option.ref.sourceType === 'midpoint');
}

export function getConstraintSegmentOptions(entities = []) {
  return entities.flatMap((entity) =>
    getSegmentReferenceOptions(entity).map((option) => ({
      ...option,
      value: serializeReference(option.ref),
      entityId: entity.id,
      entityLabel: `${entity.id} (${entity.type})`,
    })),
  );
}

export function getConstraintSupportedEntityOptions(entities = [], type) {
  return entities
    .filter((entity) => {
      if (type === 'horizontal' || type === 'vertical' || type === 'equal_length') {
        return entity.type === 'line';
      }

      if (type === 'equal_width' || type === 'equal_height') {
        return entity.type === 'rect' || (entity.type === 'feature' && entity.shape === 'rect');
      }

      if (type === 'centered_between') {
        return Boolean(getEntityCenter(entity, entities));
      }

      return true;
    })
    .map((entity) => ({
      value: entity.id,
      label: `${entity.id} (${entity.type}${entity.shape ? `:${entity.shape}` : ''})`,
    }));
}

export function getSuggestedConstraintTypesForSelection(selectedEntities = []) {
  const suggestions = [];

  if (selectedEntities.length === 1 && selectedEntities[0].type === 'line') {
    addUnique(suggestions, 'horizontal');
    addUnique(suggestions, 'vertical');
  }

  if (selectedEntities.length >= 2) {
    const [first, second] = selectedEntities;

    if (first?.type === 'line' && second?.type === 'line') {
      addUnique(suggestions, 'equal_length');
      addUnique(suggestions, 'coincident_point');
      addUnique(suggestions, 'offset_distance');
      addUnique(suggestions, 'thickness_offset');
    }

    if (
      (first?.type === 'rect' || (first?.type === 'feature' && first.shape === 'rect')) &&
      (second?.type === 'rect' || (second?.type === 'feature' && second.shape === 'rect'))
    ) {
      addUnique(suggestions, 'equal_width');
      addUnique(suggestions, 'equal_height');
      addUnique(suggestions, 'centered_between');
      addUnique(suggestions, 'offset_distance');
      addUnique(suggestions, 'thickness_offset');
    }

    addUnique(suggestions, 'coincident_point');
    addUnique(suggestions, 'midpoint_lock');
    addUnique(suggestions, 'centered_between');
  }

  return suggestions;
}

export function getSketchConstraintSummary(constraint) {
  if (constraint.type === 'equal_length' || constraint.type === 'equal_width' || constraint.type === 'equal_height') {
    return `${constraint.driverEntityId || 'Unset'} -> ${constraint.drivenEntityId || 'Unset'}`;
  }

  if (constraint.type === 'horizontal' || constraint.type === 'vertical') {
    return constraint.entityId || 'Unset target';
  }

  if (constraint.type === 'coincident_point') {
    return `${constraint.driverRef?.entityId || 'Unset'} -> ${constraint.drivenRef?.entityId || 'Unset'}`;
  }

  if (constraint.type === 'midpoint_lock') {
    return `${constraint.midpointRef?.entityId || 'Unset midpoint'} -> ${constraint.drivenRef?.entityId || 'Unset driven'}`;
  }

  if (constraint.type === 'centered_between') {
    return `${constraint.betweenStartRef?.entityId || 'Unset'} + ${constraint.betweenEndRef?.entityId || 'Unset'} -> ${constraint.drivenEntityId || 'Unset'}`;
  }

  if (constraint.type === 'offset_distance' || constraint.type === 'thickness_offset') {
    return `${constraint.sourceSegmentRef?.entityId || 'Unset'} -> ${constraint.targetSegmentRef?.entityId || 'Unset'}`;
  }

  return getSketchConstraintLabel(constraint.type);
}

export function resolveSketchConstraints(entities = [], constraints = [], variables = []) {
  const normalizedConstraints = normalizeSketchConstraints(constraints);
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const entityIds = entities.map((entity) => entity.id);
  const diagnostics = [];
  const { order, blockedConstraintIds } = buildTopologicalOrder(
    entityIds,
    normalizedConstraints.filter((constraint) => constraint.enabled !== false),
  );
  const constraintsByDrivenEntity = new Map();

  normalizedConstraints.forEach((constraint, index) => {
    const dependency = getConstraintDependency(constraint);
    const drivenEntityId = dependency.drivenId ?? constraint.entityId ?? null;

    if (!drivenEntityId) {
      diagnostics.push(
        createConstraintDiagnostic(constraint, 'invalid_ref', 'Constraint is missing its target entity'),
      );
      return;
    }

    if (!constraintsByDrivenEntity.has(drivenEntityId)) {
      constraintsByDrivenEntity.set(drivenEntityId, []);
    }

    constraintsByDrivenEntity.get(drivenEntityId).push({
      index,
      constraint,
    });
  });

  order.forEach((entityId) => {
    const entityConstraints = (constraintsByDrivenEntity.get(entityId) || [])
      .slice()
      .sort(
        (left, right) =>
          getSketchConstraintPriority(left.constraint.type) - getSketchConstraintPriority(right.constraint.type) ||
          left.index - right.index,
      );

    entityConstraints.forEach(({ constraint }) => {
      if (blockedConstraintIds.has(constraint.id)) {
        diagnostics.push(
          createConstraintDiagnostic(constraint, 'cycle_blocked', 'Constraint participates in a dependency cycle'),
        );
        return;
      }

      diagnostics.push(
        applyConstraintToEntities({
          constraint,
          entitiesById,
          variables,
        }),
      );
    });
  });

  normalizedConstraints.forEach((constraint) => {
    if (!diagnostics.some((diagnostic) => diagnostic.constraintId === constraint.id)) {
      diagnostics.push(createConstraintDiagnostic(constraint, 'invalid_ref', 'Constraint could not be scheduled'));
    }
  });

  return {
    entities: entities.map((entity) => entitiesById.get(entity.id) || entity),
    diagnostics,
    constraints: normalizedConstraints,
  };
}
