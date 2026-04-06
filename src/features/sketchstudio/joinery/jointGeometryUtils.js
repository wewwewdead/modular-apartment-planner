import {
  JOINERY_TOUCH_TOLERANCE,
  JOINT_PARAMETER_DEPTH_MODES,
  createDefaultFaceReference,
  computeJointDefaultParameters,
  mergeJointParameters,
  roundJoineryValue,
  supportsAutoOverlapDepth,
} from './jointDefaults';
import {
  applyInsetToOverlap,
  buildJoineryEntityMap,
  buildRepeatedEdgeIntervals,
  getPointAlongEdge,
  getRectEdgeData,
  getRectPartBounds,
  resolveIntervalWithinOverlap,
  resolveJoineryContext,
} from './jointResolvers';
import {
  buildConflictValidationState,
  createJointDiagnostic,
  createValidationState,
  detectOccupiedRegionConflicts,
  validateResolvedJoint,
} from './jointValidationUtils';
import { normalizeJointCollection } from './jointSerializationUtils';
import { getRectCorners } from '../utils/entityUtils';
import { getJointTypeEntry } from './jointRegistry';

function cloneManufacturingEntity(entity) {
  return {
    ...entity,
    meta: {
      ...(entity.meta || {}),
    },
  };
}

function compactJointParameters(parameters = {}) {
  return Object.fromEntries(Object.entries(parameters).filter(([, value]) => value != null));
}

function createResolvedContact(context) {
  if (!context || context.error) {
    return null;
  }

  return {
    kind: context.contactKind || 'touch',
    overlap: context.overlap
      ? {
          start: context.overlap.start,
          end: context.overlap.end,
          length: context.overlap.length,
          center: context.overlap.center,
        }
      : null,
    penetrationDepth: context.penetrationDepth ?? null,
    sourceEdgeKey: context.sourceEdge?.edgeKey || null,
    targetEdgeKey: context.targetEdge?.edgeKey || null,
    autoFlipped: Boolean(context.autoFlipped),
  };
}

function resolveJointFaceReference(reference, partId) {
  if (!partId) {
    return null;
  }

  return createDefaultFaceReference(partId, {
    faceKey: reference?.faceKey,
  });
}

function applyJointParameterModes(joint, context, parameters) {
  if (
    joint.parameterModes?.depth === JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP &&
    supportsAutoOverlapDepth(joint.type)
  ) {
    return mergeJointParameters(joint.type, parameters, {
      depth: context?.penetrationDepth ?? null,
    });
  }

  return parameters;
}

function createEmptyPartModificationState() {
  return {
    top: [],
    right: [],
    bottom: [],
    left: [],
    jointIds: new Set(),
    fabricationReady: true,
  };
}

function getPartModificationState(partStatesById, partId) {
  if (!partStatesById.has(partId)) {
    partStatesById.set(partId, createEmptyPartModificationState());
  }

  return partStatesById.get(partId);
}

function attachJointConnectionMetadata(entity, joint, role, edgeKey, fabricationState = {}) {
  if (!entity) {
    return;
  }

  const fabricationReady = fabricationState.fabricationReady !== false;
  const nextConnections = Array.isArray(entity.meta?.joineryConnections) ? [...entity.meta.joineryConnections] : [];

  nextConnections.push({
    jointId: joint.id,
    type: joint.type,
    role,
    edgeKey,
    sourcePartId: joint.sourcePartId,
    targetPartId: joint.targetPartId,
    fabricationReady,
    previewOnly: !fabricationReady,
  });

  entity.meta = {
    ...(entity.meta || {}),
    joineryConnections: nextConnections,
  };
}

function createJoineryMeta(joint, part, role, operationKind, detailType, fabricationState = {}, index = 0) {
  const fabricationReady = fabricationState.fabricationReady !== false;

  return {
    joineryGenerated: true,
    joinery: {
      jointId: joint.id,
      jointType: joint.type,
      placementMode: joint.placementMode,
      operationId: `${joint.id}:${operationKind}:${part.id}:${index + 1}`,
      operationKind,
      role,
      sourcePartId: joint.sourcePartId,
      targetPartId: joint.targetPartId,
      parameterModes: { ...(joint.parameterModes || {}) },
      tolerance: { ...(joint.tolerance || {}) },
      fabrication: { ...(joint.fabrication || {}) },
      fabricationReady,
      previewOnly: !fabricationReady,
    },
    manufacturingSourceEntityIds: [part.id],
    manufacturingDetailType: detailType,
  };
}

function createRectFeatureEntity(
  joint,
  part,
  role,
  edge,
  interval,
  depth,
  operationKind,
  fabricationState = {},
  index = 0,
) {
  if (Number(part.rotation)) {
    return {
      id: `joinery-feature-${joint.id}-${part.id}-${operationKind}-${index + 1}`,
      type: 'feature',
      featureType: 'joinery',
      operation: 'subtract',
      targetPartId: part.id,
      shape: 'polygon',
      points: [
        getPointAlongEdge(edge, interval.start, 0),
        getPointAlongEdge(edge, interval.end, 0),
        getPointAlongEdge(edge, interval.end, depth, 'inward'),
        getPointAlongEdge(edge, interval.start, depth, 'inward'),
      ],
      depth: roundJoineryValue(depth),
      through: false,
      layerId: part.layerId || 'default',
      locked: true,
      visible: true,
      meta: createJoineryMeta(joint, part, role, operationKind, 'feature', fabricationState, index),
    };
  }

  const bounds = getRectPartBounds(part);
  const length = interval.end - interval.start;
  let x = bounds.minX;
  let y = bounds.minY;
  let width = length;
  let height = depth;

  switch (edge.edgeKey) {
    case 'top':
      x = interval.start;
      y = bounds.minY;
      break;
    case 'bottom':
      x = interval.start;
      y = bounds.maxY - depth;
      break;
    case 'right':
      x = bounds.maxX - depth;
      y = interval.start;
      width = depth;
      height = length;
      break;
    case 'left':
      x = bounds.minX;
      y = interval.start;
      width = depth;
      height = length;
      break;
    default:
      break;
  }

  return {
    id: `joinery-feature-${joint.id}-${part.id}-${operationKind}-${index + 1}`,
    type: 'feature',
    featureType: 'joinery',
    operation: 'subtract',
    targetPartId: part.id,
    shape: 'rect',
    x: roundJoineryValue(x),
    y: roundJoineryValue(y),
    width: roundJoineryValue(width),
    height: roundJoineryValue(height),
    depth: roundJoineryValue(depth),
    through: false,
    layerId: part.layerId || 'default',
    locked: true,
    visible: true,
    meta: createJoineryMeta(joint, part, role, operationKind, 'feature', fabricationState, index),
  };
}

function createCircleFeatureEntity(
  joint,
  part,
  role,
  center,
  diameter,
  depth,
  operationKind,
  fabricationState = {},
  index = 0,
) {
  return {
    id: `joinery-feature-${joint.id}-${part.id}-${operationKind}-${index + 1}`,
    type: 'feature',
    featureType: 'joinery',
    operation: 'subtract',
    targetPartId: part.id,
    shape: 'circle',
    cx: roundJoineryValue(center.x),
    cy: roundJoineryValue(center.y),
    diameter: roundJoineryValue(diameter),
    depth: roundJoineryValue(depth),
    through: false,
    layerId: part.layerId || 'default',
    locked: true,
    visible: true,
    meta: createJoineryMeta(joint, part, role, operationKind, 'feature', fabricationState, index),
  };
}

function pushUniquePoint(points, point) {
  const nextPoint = {
    x: roundJoineryValue(point.x),
    y: roundJoineryValue(point.y),
  };
  const previous = points.at(-1);

  if (previous && previous.x === nextPoint.x && previous.y === nextPoint.y) {
    return;
  }

  points.push(nextPoint);
}

function pointsMatch(left, right) {
  return Math.abs(left.x - right.x) <= JOINERY_TOUCH_TOLERANCE && Math.abs(left.y - right.y) <= JOINERY_TOUCH_TOLERANCE;
}

function sortEdgeModifications(modifications, isForwardTraversal) {
  return [...modifications].sort((left, right) =>
    isForwardTraversal ? left.start - right.start : right.start - left.start,
  );
}

function pushTraversalModificationPoints(points, edge, modification, isForwardTraversal) {
  const entryPosition = isForwardTraversal ? modification.start : modification.end;
  const exitPosition = isForwardTraversal ? modification.end : modification.start;
  const normalKind = modification.mode === 'cut' ? 'inward' : 'outward';

  pushUniquePoint(points, getPointAlongEdge(edge, entryPosition, 0));
  pushUniquePoint(points, getPointAlongEdge(edge, entryPosition, modification.depth, normalKind));
  pushUniquePoint(points, getPointAlongEdge(edge, exitPosition, modification.depth, normalKind));
  pushUniquePoint(points, getPointAlongEdge(edge, exitPosition, 0));
}

function buildRectProfilePoints(part, partState) {
  const corners = getRectCorners(part);
  const edgesByKey = {
    top: getRectEdgeData(part, 'top'),
    right: getRectEdgeData(part, 'right'),
    bottom: getRectEdgeData(part, 'bottom'),
    left: getRectEdgeData(part, 'left'),
  };
  const loopSteps = [
    { edgeKey: 'top', startPoint: corners.topLeft, endPoint: corners.topRight },
    { edgeKey: 'right', startPoint: corners.topRight, endPoint: corners.bottomRight },
    { edgeKey: 'bottom', startPoint: corners.bottomRight, endPoint: corners.bottomLeft },
    { edgeKey: 'left', startPoint: corners.bottomLeft, endPoint: corners.topLeft },
  ];
  const points = [];
  pushUniquePoint(points, loopSteps[0].startPoint);

  loopSteps.forEach((step) => {
    const edge = edgesByKey[step.edgeKey];
    if (!edge) {
      return;
    }

    const isForwardTraversal =
      pointsMatch(step.startPoint, edge.startPoint) && pointsMatch(step.endPoint, edge.endPoint);
    const sortedModifications = sortEdgeModifications(partState[step.edgeKey], isForwardTraversal);

    sortedModifications.forEach((modification) => {
      pushTraversalModificationPoints(points, edge, modification, isForwardTraversal);
    });

    pushUniquePoint(points, step.endPoint);
  });

  return points;
}

function createGeneratedProfileEntity(part, partState, fabricationState = {}) {
  const fabricationReady = fabricationState.fabricationReady !== false;

  return {
    id: `joinery-profile-${part.id}`,
    type: 'polyline',
    points: buildRectProfilePoints(part, partState),
    closed: true,
    layerId: part.layerId || 'default',
    locked: true,
    visible: true,
    materialId: part.materialId ?? null,
    thickness: part.thickness ?? null,
    meta: {
      joineryGenerated: true,
      jointIds: Array.from(partState.jointIds),
      joinery: {
        fabricationReady,
        previewOnly: !fabricationReady,
      },
      manufacturingSourceEntityIds: [part.id],
      manufacturingDetailType: 'profile',
    },
  };
}

function registerGeneratedEntity(generatedIdsByJoint, jointId, entityId) {
  if (!generatedIdsByJoint.has(jointId)) {
    generatedIdsByJoint.set(jointId, new Set());
  }

  generatedIdsByJoint.get(jointId).add(entityId);
}

function applyPartModifications(partStatesById, partId, edgeKey, modifications, joint, fabricationState = {}) {
  const partState = getPartModificationState(partStatesById, partId);
  const fabricationReady = fabricationState.fabricationReady !== false;
  partState[edgeKey].push(...modifications);
  partState.jointIds.add(joint.id);
  partState.fabricationReady = partState.fabricationReady && fabricationReady;
}

function buildOccupiedRegions(joint, partId, edgeKey, intervals) {
  return intervals.map((interval) => ({
    jointId: joint.id,
    partId,
    edgeKey,
    start: interval.start,
    end: interval.end,
  }));
}

function buildInterval(start, end) {
  const length = end - start;
  if (length <= JOINERY_TOUCH_TOLERANCE) {
    return null;
  }

  return {
    start: roundJoineryValue(start),
    end: roundJoineryValue(end),
    length: roundJoineryValue(length),
    center: roundJoineryValue((start + end) / 2),
  };
}

function buildComplementIntervals(overlap, retainedIntervals = []) {
  if (!overlap) {
    return [];
  }

  const normalizedIntervals = retainedIntervals
    .filter(Boolean)
    .map((interval) => ({
      start: Math.max(overlap.start, interval.start),
      end: Math.min(overlap.end, interval.end),
    }))
    .filter((interval) => interval.end - interval.start > JOINERY_TOUCH_TOLERANCE)
    .sort((left, right) => left.start - right.start);

  const complementIntervals = [];
  let cursor = overlap.start;

  normalizedIntervals.forEach((interval) => {
    const nextInterval = buildInterval(cursor, interval.start);
    if (nextInterval) {
      complementIntervals.push(nextInterval);
    }
    cursor = Math.max(cursor, interval.end);
  });

  const trailingInterval = buildInterval(cursor, overlap.end);
  if (trailingInterval) {
    complementIntervals.push(trailingInterval);
  }

  return complementIntervals;
}

function shrinkInterval(interval, clearance = 0) {
  const halfClearance = Math.max(0, Number(clearance) || 0) / 2;
  const start = interval.start + halfClearance;
  const end = interval.end - halfClearance;
  const length = end - start;

  if (length <= 0) {
    return interval;
  }

  return {
    start: roundJoineryValue(start),
    end: roundJoineryValue(end),
    length: roundJoineryValue(length),
    center: roundJoineryValue((start + end) / 2),
  };
}

function expandInterval(interval, clearance = 0, overlap = null) {
  const halfClearance = Math.max(0, Number(clearance) || 0) / 2;
  const start = overlap ? Math.max(overlap.start, interval.start - halfClearance) : interval.start - halfClearance;
  const end = overlap ? Math.min(overlap.end, interval.end + halfClearance) : interval.end + halfClearance;
  const length = end - start;

  if (length <= 0) {
    return interval;
  }

  return {
    start: roundJoineryValue(start),
    end: roundJoineryValue(end),
    length: roundJoineryValue(length),
    center: roundJoineryValue((start + end) / 2),
  };
}

function buildNominalInterval(context, parameters) {
  const insetOverlap = applyInsetToOverlap(context.overlap, parameters.inset || 0);
  if (!insetOverlap) {
    return null;
  }

  return resolveIntervalWithinOverlap(insetOverlap, parameters.width, 0);
}

function expandIntervalByWidth(interval, extraWidth, edge) {
  if (!interval) {
    return null;
  }

  const widthDelta = Number(extraWidth) || 0;
  const start = interval.start - widthDelta / 2;
  const end = interval.end + widthDelta / 2;
  const length = end - start;

  if (length <= JOINERY_TOUCH_TOLERANCE) {
    return null;
  }

  if (edge && (start < edge.start - JOINERY_TOUCH_TOLERANCE || end > edge.end + JOINERY_TOUCH_TOLERANCE)) {
    return null;
  }

  return {
    start: roundJoineryValue(start),
    end: roundJoineryValue(end),
    length: roundJoineryValue(length),
    center: roundJoineryValue((start + end) / 2),
  };
}

function buildWidthOffsetInterval(context, parameters) {
  const nominalInterval = buildNominalInterval(context, parameters);
  if (!nominalInterval) {
    return null;
  }

  return expandIntervalByWidth(nominalInterval, parameters.offset, context.targetEdge);
}

function buildFemaleClearanceIntervals(joint, context) {
  const nominalInterval = buildNominalInterval(context, joint.parameters);
  if (!nominalInterval) {
    return {
      nominalInterval: null,
      femaleInterval: null,
    };
  }

  const femaleWidthOffset = (Number(joint.parameters.offset) || 0) + (Number(joint.tolerance?.clearance) || 0);
  const femaleInterval = expandIntervalByWidth(nominalInterval, femaleWidthOffset, context.targetEdge);

  return {
    nominalInterval,
    femaleInterval,
  };
}

function buildRepeatedIntervals(context, parameters, widthKey) {
  return (
    buildRepeatedEdgeIntervals(context.overlap, {
      count: parameters.count,
      width: parameters[widthKey],
      spacing: parameters.spacing,
      edgeOffset: parameters.edgeOffset,
    }).intervals || null
  );
}

function buildHoleCenters(edge, intervals, inwardDistance) {
  return intervals.map((interval) => getPointAlongEdge(edge, interval.center, inwardDistance, 'inward'));
}

function getJointFabricationState(context) {
  const fabricationReady = context?.fabricationReady !== false;

  return {
    fabricationReady,
    previewOnly: !fabricationReady,
  };
}

const geometryHelpers = {
  buildOccupiedRegions,
  createRectFeatureEntity,
  createCircleFeatureEntity,
  buildWidthOffsetInterval,
  buildFemaleClearanceIntervals,
  buildComplementIntervals,
  buildRepeatedIntervals,
  buildHoleCenters,
  getJointFabricationState,
  shrinkInterval,
  expandInterval,
  buildRepeatedEdgeIntervalsRaw(overlap, options) {
    return buildRepeatedEdgeIntervals(overlap, options).intervals || null;
  },
};

function buildJointGeometry(joint, context) {
  return getJointTypeEntry(joint.type).buildGeometry(joint, context, geometryHelpers);
}

export function resolveJointGeometry(entities = [], joints = []) {
  const normalizedJoints = normalizeJointCollection(joints);
  const entitiesById = buildJoineryEntityMap(entities);
  const exportEntities = entities.map(cloneManufacturingEntity);
  const exportEntitiesById = new Map(exportEntities.map((entity) => [entity.id, entity]));
  const previewPartStatesById = new Map();
  const exportPartStatesById = new Map();
  const previewEntities = [];
  const occupiedRegions = [];
  const generatedIdsByJoint = new Map();

  const resolvedJoints = normalizedJoints.map((joint) => {
    const context = resolveJoineryContext(joint, entitiesById);
    const effectiveParameters = applyJointParameterModes(
      joint,
      context,
      mergeJointParameters(
        joint.type,
        computeJointDefaultParameters(joint.type, context.error ? null : context),
        compactJointParameters(joint.parameters),
      ),
    );
    const resolvedSourcePartId = context.error ? joint.sourcePartId : context.sourcePart?.id || joint.sourcePartId;
    const resolvedTargetPartId = context.error ? joint.targetPartId : context.targetPart?.id || joint.targetPartId;
    const resolvedSourceFaceRef = context.error
      ? joint.sourceFaceRef
      : resolveJointFaceReference(
          context.autoFlipped ? joint.targetFaceRef : joint.sourceFaceRef,
          resolvedSourcePartId,
        );
    const resolvedTargetFaceRef = context.error
      ? joint.targetFaceRef
      : resolveJointFaceReference(
          context.autoFlipped ? joint.sourceFaceRef : joint.targetFaceRef,
          resolvedTargetPartId,
        );
    let nextJoint = {
      ...joint,
      sourcePartId: resolvedSourcePartId,
      targetPartId: resolvedTargetPartId,
      sourceFaceRef: resolvedSourceFaceRef,
      targetFaceRef: resolvedTargetFaceRef,
      parameters: effectiveParameters,
      sourceEdgeRef: context.error ? joint.sourceEdgeRef : context.resolvedSourceEdgeRef || joint.sourceEdgeRef,
      targetEdgeRef: context.error ? joint.targetEdgeRef : context.resolvedTargetEdgeRef || joint.targetEdgeRef,
      resolvedContact: createResolvedContact(context),
      validationState: validateResolvedJoint(joint, context, effectiveParameters),
    };

    if (nextJoint.validationState.status === 'disabled' || nextJoint.validationState.status === 'invalid') {
      return nextJoint;
    }

    const geometry = buildJointGeometry(nextJoint, context);
    if (geometry.error) {
      nextJoint = {
        ...nextJoint,
        validationState: createValidationState('invalid', {
          reasons: [geometry.error],
          canApply: false,
        }),
      };
      return nextJoint;
    }

    const regionConflicts = detectOccupiedRegionConflicts(occupiedRegions, geometry.occupiedRegions || []);
    if (regionConflicts.length) {
      nextJoint = {
        ...nextJoint,
        validationState: buildConflictValidationState(nextJoint.validationState, regionConflicts),
      };
      return nextJoint;
    }

    const fabricationState = getJointFabricationState(context);
    attachJointConnectionMetadata(
      exportEntitiesById.get(joint.sourcePartId),
      nextJoint,
      'source',
      context.sourceEdge.edgeKey,
      fabricationState,
    );
    attachJointConnectionMetadata(
      exportEntitiesById.get(joint.targetPartId),
      nextJoint,
      'target',
      context.targetEdge.edgeKey,
      fabricationState,
    );

    (geometry.partModifications || []).forEach((partModification) => {
      applyPartModifications(
        previewPartStatesById,
        partModification.partId,
        partModification.edgeKey,
        partModification.modifications,
        nextJoint,
        fabricationState,
      );
      if (fabricationState.fabricationReady) {
        applyPartModifications(
          exportPartStatesById,
          partModification.partId,
          partModification.edgeKey,
          partModification.modifications,
          nextJoint,
          fabricationState,
        );
      }
    });

    (geometry.featureEntities || []).forEach((entity) => {
      previewEntities.push(entity);
      if (fabricationState.fabricationReady) {
        exportEntities.push(entity);
      }
      registerGeneratedEntity(generatedIdsByJoint, nextJoint.id, entity.id);
    });

    occupiedRegions.push(...(geometry.occupiedRegions || []));

    nextJoint = {
      ...nextJoint,
      validationState: createValidationState(nextJoint.validationState.warnings.length ? 'warning' : 'valid', {
        warnings: nextJoint.validationState.warnings,
        canApply: true,
        generatedEntityIds: Array.from(generatedIdsByJoint.get(nextJoint.id) || []),
      }),
    };

    return nextJoint;
  });

  previewPartStatesById.forEach((partState, partId) => {
    const part = entitiesById.get(partId);
    if (!part) {
      return;
    }

    const generatedProfile = createGeneratedProfileEntity(part, partState, {
      fabricationReady: partState.fabricationReady,
    });
    previewEntities.push(generatedProfile);
    partState.jointIds.forEach((jointId) => registerGeneratedEntity(generatedIdsByJoint, jointId, generatedProfile.id));
  });

  exportPartStatesById.forEach((partState, partId) => {
    const part = entitiesById.get(partId);
    if (!part) {
      return;
    }

    const generatedProfile = createGeneratedProfileEntity(part, partState, {
      fabricationReady: true,
    });
    exportEntities.push(generatedProfile);

    const baseExportEntity = exportEntitiesById.get(partId);
    if (baseExportEntity) {
      baseExportEntity.meta = {
        ...(baseExportEntity.meta || {}),
        manufacturingHidden: true,
      };
    }
  });

  const finalizedJoints = resolvedJoints.map((joint) => ({
    ...joint,
    validationState: {
      ...joint.validationState,
      generatedEntityIds: Array.from(
        generatedIdsByJoint.get(joint.id) || joint.validationState.generatedEntityIds || [],
      ),
    },
  }));

  return {
    joints: finalizedJoints,
    diagnostics: finalizedJoints.map((joint) => createJointDiagnostic(joint)),
    previewEntities,
    exportEntities,
  };
}
