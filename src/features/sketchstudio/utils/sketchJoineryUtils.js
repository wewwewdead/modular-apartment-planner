import { computeFingerJointParams, getJointById } from '../craftsman/data/joints';
import { collectSnapSegmentsFromEntities } from './snapUtils';

const JOINERY_TOLERANCE = 0.5;
const JOINERY_TYPES = ['dado', 'rabbet', 'finger'];
const JOINT_STATUS_LABELS = {
  applied: 'Applied',
  conflict: 'Conflict',
  disabled: 'Disabled',
  invalid_ref: 'Invalid Ref',
  unsupported: 'Unsupported',
};

let nextJointCounter = 1;

function createJointId() {
  return `joint-${nextJointCounter++}`;
}

function roundJoineryValue(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeReference(reference) {
  if (!reference || typeof reference !== 'object') {
    return null;
  }

  const entityId = typeof reference.entityId === 'string' && reference.entityId ? reference.entityId : null;
  const sourceType = typeof reference.sourceType === 'string' && reference.sourceType ? reference.sourceType : null;
  const sourceKey = reference.sourceKey == null ? null : String(reference.sourceKey);

  if (!entityId || sourceType !== 'segment' || !sourceKey) {
    return null;
  }

  return {
    entityId,
    sourceType,
    sourceKey,
  };
}

function isSupportedJointType(type) {
  return JOINERY_TYPES.includes(type);
}

function normalizeJointLabel(type, label) {
  const normalized = String(label || '').trim();
  return normalized || getJointById(type)?.name || type;
}

function toPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeOddFingerCount(value, fallback = 3) {
  const numeric = Number(value);
  const safeFallback = Math.max(3, Number.isInteger(fallback) ? fallback : 3);

  if (!Number.isInteger(numeric) || numeric < 3) {
    return safeFallback % 2 === 0 ? safeFallback - 1 : safeFallback;
  }

  return numeric % 2 === 0 ? numeric - 1 : numeric;
}

function resolveFingerPattern(parameters, overlapLength, fallbackThickness) {
  const safeOverlapLength = toPositiveNumber(overlapLength) ?? JOINERY_TOLERANCE * 3;
  const fallbackDepth = toPositiveNumber(parameters.depth) ?? fallbackThickness ?? null;
  const requestedWidth = toPositiveNumber(parameters.fingerWidth);
  const requestedCount = normalizeOddFingerCount(parameters.fingerCount, 3);

  let fingerCount = requestedCount;
  if (requestedWidth) {
    const estimatedCount = Math.max(3, Math.floor(safeOverlapLength / requestedWidth));
    fingerCount = normalizeOddFingerCount(estimatedCount, requestedCount);
  }

  const fingerWidth = roundJoineryValue(safeOverlapLength / fingerCount);

  return {
    fingerCount,
    fingerWidth,
    depth: fallbackDepth ? roundJoineryValue(fallbackDepth) : null,
  };
}

function normalizeJointParameters(type, parameters = {}) {
  if (type === 'finger') {
    const fingerCount = Number(parameters.fingerCount);

    return {
      fingerCount: Number.isInteger(fingerCount) && fingerCount > 0 ? fingerCount : null,
      fingerWidth: toPositiveNumber(parameters.fingerWidth),
      depth: toPositiveNumber(parameters.depth),
    };
  }

  return {
    width: toPositiveNumber(parameters.width),
    depth: toPositiveNumber(parameters.depth),
  };
}

function normalizeSketchJoint(input = {}) {
  const type = isSupportedJointType(input?.type) ? input.type : 'finger';

  return {
    id: typeof input?.id === 'string' && input.id ? input.id : createJointId(),
    type,
    label: normalizeJointLabel(type, input?.label),
    enabled: input?.enabled !== false,
    primaryEntityId:
      typeof input?.primaryEntityId === 'string' && input.primaryEntityId ? input.primaryEntityId : null,
    secondaryEntityId:
      typeof input?.secondaryEntityId === 'string' && input.secondaryEntityId ? input.secondaryEntityId : null,
    primaryEdgeRef: normalizeReference(input?.primaryEdgeRef),
    secondaryEdgeRef: normalizeReference(input?.secondaryEdgeRef),
    parameters: normalizeJointParameters(type, input?.parameters),
  };
}

function createJointDiagnostic(joint, status, message) {
  return {
    jointId: joint.id,
    type: joint.type,
    label: joint.label,
    status,
    statusLabel: JOINT_STATUS_LABELS[status] || status,
    message,
  };
}

function isAxisAlignedRect(entity) {
  return entity?.type === 'rect' && !Number(entity.rotation);
}

function getRectBounds(entity) {
  const minX = Math.min(entity.x, entity.x + entity.width);
  const maxX = Math.max(entity.x, entity.x + entity.width);
  const minY = Math.min(entity.y, entity.y + entity.height);
  const maxY = Math.max(entity.y, entity.y + entity.height);

  return { minX, maxX, minY, maxY };
}

function getRectEdge(entity, edgeKey) {
  if (!isAxisAlignedRect(entity)) {
    return null;
  }

  const bounds = getRectBounds(entity);

  switch (edgeKey) {
    case 'top':
      return {
        edgeKey,
        orientation: 'horizontal',
        coordinate: bounds.minY,
        start: bounds.minX,
        end: bounds.maxX,
        length: bounds.maxX - bounds.minX,
        normal: { x: 0, y: 1 },
      };
    case 'right':
      return {
        edgeKey,
        orientation: 'vertical',
        coordinate: bounds.maxX,
        start: bounds.minY,
        end: bounds.maxY,
        length: bounds.maxY - bounds.minY,
        normal: { x: -1, y: 0 },
      };
    case 'bottom':
      return {
        edgeKey,
        orientation: 'horizontal',
        coordinate: bounds.maxY,
        start: bounds.minX,
        end: bounds.maxX,
        length: bounds.maxX - bounds.minX,
        normal: { x: 0, y: -1 },
      };
    case 'left':
      return {
        edgeKey,
        orientation: 'vertical',
        coordinate: bounds.minX,
        start: bounds.minY,
        end: bounds.maxY,
        length: bounds.maxY - bounds.minY,
        normal: { x: 1, y: 0 },
      };
    default:
      return null;
  }
}

function buildEntityMap(entities = []) {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

function resolveRectEdge(entity, reference) {
  if (!isAxisAlignedRect(entity) || reference?.sourceType !== 'segment') {
    return null;
  }

  return getRectEdge(entity, reference.sourceKey);
}

function getOverlap(firstEdge, secondEdge) {
  if (
    !firstEdge ||
    !secondEdge ||
    firstEdge.orientation !== secondEdge.orientation ||
    Math.abs(firstEdge.coordinate - secondEdge.coordinate) > JOINERY_TOLERANCE
  ) {
    return null;
  }

  const start = Math.max(firstEdge.start, secondEdge.start);
  const end = Math.min(firstEdge.end, secondEdge.end);
  const length = end - start;

  if (length <= JOINERY_TOLERANCE) {
    return null;
  }

  return {
    start,
    end,
    length,
    center: (start + end) / 2,
  };
}

function getEntityThickness(entity) {
  const thickness = Number(entity?.thickness);
  return Number.isFinite(thickness) && thickness > 0 ? thickness : null;
}

function clampIntervalToEdge(center, width, edge) {
  const safeWidth = Math.min(Math.max(width, JOINERY_TOLERANCE), edge.length);
  let start = center - (safeWidth / 2);
  let end = center + (safeWidth / 2);

  if (start < edge.start) {
    end += edge.start - start;
    start = edge.start;
  }

  if (end > edge.end) {
    start -= end - edge.end;
    end = edge.end;
  }

  return {
    start: roundJoineryValue(Math.max(edge.start, start)),
    end: roundJoineryValue(Math.min(edge.end, end)),
  };
}

function buildJointContext(joint, entitiesById) {
  const primaryEntity = entitiesById.get(joint.primaryEntityId);
  const secondaryEntity = entitiesById.get(joint.secondaryEntityId);

  if (!primaryEntity || !secondaryEntity) {
    return { error: 'One or more source parts are missing', status: 'invalid_ref' };
  }

  if (primaryEntity.id === secondaryEntity.id) {
    return { error: 'Joint parts must be different entities', status: 'unsupported' };
  }

  if (!isAxisAlignedRect(primaryEntity) || !isAxisAlignedRect(secondaryEntity)) {
    return { error: 'Joinery generation currently supports non-rotated rectangular parts only', status: 'unsupported' };
  }

  const primaryEdge = resolveRectEdge(primaryEntity, joint.primaryEdgeRef);
  const secondaryEdge = resolveRectEdge(secondaryEntity, joint.secondaryEdgeRef);

  if (!primaryEdge || !secondaryEdge) {
    return { error: 'Selected edge references could not be resolved', status: 'invalid_ref' };
  }

  const overlap = getOverlap(primaryEdge, secondaryEdge);

  if (!overlap) {
    return { error: 'Selected edges must touch and overlap to generate joinery', status: 'unsupported' };
  }

  const primaryThickness = getEntityThickness(primaryEntity);
  const secondaryThickness = getEntityThickness(secondaryEntity);

  if (!primaryThickness || !secondaryThickness) {
    return { error: 'Assign a positive thickness to both parts before generating joinery', status: 'unsupported' };
  }

  return {
    primaryEntity,
    secondaryEntity,
    primaryEdge,
    secondaryEdge,
    overlap,
    primaryThickness,
    secondaryThickness,
  };
}

function buildDefaultParametersFromContext(type, context) {
  const catalogJoint = getJointById(type);

  if (!context || context.error) {
    if (type === 'finger') {
      return {
        fingerCount: 3,
        fingerWidth: null,
        depth: null,
      };
    }

    return {
      width: null,
      depth: null,
    };
  }

  if (type === 'finger') {
    const fingerThickness = Math.min(context.primaryThickness, context.secondaryThickness);
    const params = computeFingerJointParams(fingerThickness, context.overlap.length);
    return resolveFingerPattern(
      {
        fingerCount: params.fingerCount,
        fingerWidth: params.fingerWidth,
        depth: params.fingerDepth,
      },
      context.overlap.length,
      fingerThickness,
    );
  }

  if (type === 'dado') {
    return {
      width: roundJoineryValue(context.overlap.length || context.secondaryThickness),
      depth: roundJoineryValue(context.primaryThickness * (catalogJoint?.depthFactor ?? 0.33)),
    };
  }

  return {
    width: roundJoineryValue(context.overlap.length || context.secondaryThickness),
    depth: roundJoineryValue(context.primaryThickness * (catalogJoint?.depthFactor ?? 0.5)),
  };
}

function buildJointParameters(joint, context) {
  const defaults = buildDefaultParametersFromContext(joint.type, context);

  if (joint.type === 'finger') {
    return resolveFingerPattern(
      {
        fingerCount: joint.parameters.fingerCount ?? defaults.fingerCount,
        fingerWidth: joint.parameters.fingerWidth ?? defaults.fingerWidth,
        depth: joint.parameters.depth ?? defaults.depth,
      },
      context.overlap.length,
      Math.min(context.primaryThickness, context.secondaryThickness),
    );
  }

  return {
    width: joint.parameters.width ?? defaults.width,
    depth: joint.parameters.depth ?? defaults.depth,
  };
}

function validateInterval(cut) {
  return cut.end - cut.start > JOINERY_TOLERANCE && cut.depth > JOINERY_TOLERANCE;
}

function createEmptyCutMap() {
  return {
    top: [],
    right: [],
    bottom: [],
    left: [],
    jointIds: new Set(),
  };
}

function getEntityCutState(cutStateByEntity, entityId) {
  if (!cutStateByEntity.has(entityId)) {
    cutStateByEntity.set(entityId, createEmptyCutMap());
  }

  return cutStateByEntity.get(entityId);
}

function cutIntervalsOverlap(first, second) {
  return Math.max(first.start, second.start) < Math.min(first.end, second.end) - JOINERY_TOLERANCE;
}

function canApplyEdgeCuts(cutStateByEntity, entityId, edgeKey, cuts) {
  const edgeCuts = getEntityCutState(cutStateByEntity, entityId)[edgeKey];
  return cuts.every((cut) => edgeCuts.every((existingCut) => !cutIntervalsOverlap(existingCut, cut)));
}

function applyEdgeCuts(cutStateByEntity, entityId, edgeKey, cuts, jointId) {
  const entityCutState = getEntityCutState(cutStateByEntity, entityId);
  entityCutState[edgeKey].push(...cuts);
  entityCutState.jointIds.add(jointId);
}

function createGeneratedFeatureEntity(joint, entity, edge, width, depth, overlap, index = 0) {
  let x = entity.x;
  let y = entity.y;
  let featureWidth = width;
  let featureHeight = depth;

  if (edge.edgeKey === 'top') {
    x = overlap.center - (width / 2);
    y = entity.y;
    featureWidth = width;
    featureHeight = depth;
  } else if (edge.edgeKey === 'bottom') {
    x = overlap.center - (width / 2);
    y = entity.y + entity.height - depth;
    featureWidth = width;
    featureHeight = depth;
  } else if (edge.edgeKey === 'left') {
    x = entity.x;
    y = overlap.center - (width / 2);
    featureWidth = depth;
    featureHeight = width;
  } else if (edge.edgeKey === 'right') {
    x = entity.x + entity.width - depth;
    y = overlap.center - (width / 2);
    featureWidth = depth;
    featureHeight = width;
  }

  return {
    id: `joinery-feature-${joint.id}-${entity.id}-${index + 1}`,
    type: 'feature',
    featureType: 'joinery',
    operation: 'subtract',
    targetPartId: entity.id,
    shape: 'rect',
    x: roundJoineryValue(x),
    y: roundJoineryValue(y),
    width: roundJoineryValue(featureWidth),
    height: roundJoineryValue(featureHeight),
    depth: roundJoineryValue(depth),
    through: false,
    layerId: entity.layerId || 'default',
    locked: true,
    visible: true,
    meta: {
      joineryGenerated: true,
      jointId: joint.id,
      manufacturingSourceEntityIds: [entity.id],
      manufacturingDetailType: 'feature',
    },
  };
}

function buildFingerCutIntervals(edge, overlap, fingerCount, depth, invertPattern = false) {
  const count = Math.max(3, Number(fingerCount) || 0);
  if (!Number.isInteger(count) || count < 3 || count % 2 === 0) {
    return null;
  }

  const segmentWidth = overlap.length / count;
  const cuts = [];

  for (let index = 0; index < count; index += 1) {
    const isCut = invertPattern ? index % 2 === 0 : index % 2 === 1;
    if (!isCut) {
      continue;
    }

    const start = overlap.start + (segmentWidth * index);
    const end = overlap.start + (segmentWidth * (index + 1));
    const cut = {
      start: roundJoineryValue(start),
      end: roundJoineryValue(end),
      depth: roundJoineryValue(depth),
    };

    if (validateInterval(cut)) {
      cuts.push(cut);
    }
  }

  return cuts;
}

function pushUniquePoint(points, point) {
  const nextPoint = {
    x: roundJoineryValue(point.x),
    y: roundJoineryValue(point.y),
  };
  const previous = points.at(-1);

  if (previous && Math.abs(previous.x - nextPoint.x) <= JOINERY_TOLERANCE && Math.abs(previous.y - nextPoint.y) <= JOINERY_TOLERANCE) {
    return;
  }

  points.push(nextPoint);
}

function buildRectProfilePoints(entity, cutState) {
  const bounds = getRectBounds(entity);
  const points = [];
  const sortedTopCuts = [...cutState.top].sort((left, right) => left.start - right.start);
  const sortedRightCuts = [...cutState.right].sort((left, right) => left.start - right.start);
  const sortedBottomCuts = [...cutState.bottom].sort((left, right) => right.end - left.end);
  const sortedLeftCuts = [...cutState.left].sort((left, right) => right.end - left.end);

  pushUniquePoint(points, { x: bounds.minX, y: bounds.minY });

  sortedTopCuts.forEach((cut) => {
    pushUniquePoint(points, { x: cut.start, y: bounds.minY });
    pushUniquePoint(points, { x: cut.start, y: bounds.minY + cut.depth });
    pushUniquePoint(points, { x: cut.end, y: bounds.minY + cut.depth });
    pushUniquePoint(points, { x: cut.end, y: bounds.minY });
  });
  pushUniquePoint(points, { x: bounds.maxX, y: bounds.minY });

  sortedRightCuts.forEach((cut) => {
    pushUniquePoint(points, { x: bounds.maxX, y: cut.start });
    pushUniquePoint(points, { x: bounds.maxX - cut.depth, y: cut.start });
    pushUniquePoint(points, { x: bounds.maxX - cut.depth, y: cut.end });
    pushUniquePoint(points, { x: bounds.maxX, y: cut.end });
  });
  pushUniquePoint(points, { x: bounds.maxX, y: bounds.maxY });

  sortedBottomCuts.forEach((cut) => {
    pushUniquePoint(points, { x: cut.end, y: bounds.maxY });
    pushUniquePoint(points, { x: cut.end, y: bounds.maxY - cut.depth });
    pushUniquePoint(points, { x: cut.start, y: bounds.maxY - cut.depth });
    pushUniquePoint(points, { x: cut.start, y: bounds.maxY });
  });
  pushUniquePoint(points, { x: bounds.minX, y: bounds.maxY });

  sortedLeftCuts.forEach((cut) => {
    pushUniquePoint(points, { x: bounds.minX, y: cut.end });
    pushUniquePoint(points, { x: bounds.minX + cut.depth, y: cut.end });
    pushUniquePoint(points, { x: bounds.minX + cut.depth, y: cut.start });
    pushUniquePoint(points, { x: bounds.minX, y: cut.start });
  });

  return points;
}

function createGeneratedProfileEntity(entity, cutState) {
  const points = buildRectProfilePoints(entity, cutState);

  return {
    id: `joinery-profile-${entity.id}`,
    type: 'polyline',
    points,
    closed: true,
    layerId: entity.layerId || 'default',
    locked: true,
    visible: true,
    materialId: entity.materialId ?? null,
    thickness: entity.thickness ?? null,
    meta: {
      joineryGenerated: true,
      jointIds: Array.from(cutState.jointIds),
      manufacturingSourceEntityIds: [entity.id],
      manufacturingDetailType: 'profile',
    },
  };
}

function cloneManufacturingEntity(entity) {
  return {
    ...entity,
    meta: {
      ...(entity.meta || {}),
    },
  };
}

function buildDadoGeometry(joint, context) {
  const parameters = buildJointParameters(joint, context);
  const width = parameters.width;
  const depth = parameters.depth;

  if (!width || !depth) {
    return {
      error: 'Dado width and depth must be positive values',
      status: 'unsupported',
    };
  }

  const interval = clampIntervalToEdge(context.overlap.center, width, context.primaryEdge);
  return {
    previewEntities: [createGeneratedFeatureEntity(joint, context.primaryEntity, context.primaryEdge, interval.end - interval.start, depth, {
      center: (interval.start + interval.end) / 2,
    })],
  };
}

function buildRabbetCuts(joint, context) {
  const parameters = buildJointParameters(joint, context);
  const width = parameters.width;
  const depth = parameters.depth;

  if (!width || !depth) {
    return {
      error: 'Rabbet width and depth must be positive values',
      status: 'unsupported',
    };
  }

  const interval = clampIntervalToEdge(context.overlap.center, width, context.primaryEdge);
  const cut = {
    start: interval.start,
    end: interval.end,
    depth: roundJoineryValue(depth),
  };

  if (!validateInterval(cut)) {
    return {
      error: 'Rabbet dimensions are too small to generate',
      status: 'unsupported',
    };
  }

  return {
    edgeCuts: [
      {
        entityId: context.primaryEntity.id,
        edgeKey: context.primaryEdge.edgeKey,
        cuts: [cut],
      },
    ],
  };
}

function buildFingerCuts(joint, context) {
  if (Math.abs(context.primaryEdge.length - context.secondaryEdge.length) > JOINERY_TOLERANCE) {
    return {
      error: 'Finger joints require equal-length touching edges',
      status: 'unsupported',
    };
  }

  const parameters = buildJointParameters(joint, context);
  const fingerCount = parameters.fingerCount;
  const depth = parameters.depth;

  if (!fingerCount || !depth) {
    return {
      error: 'Finger joints require a finger count and depth',
      status: 'unsupported',
    };
  }

  const primaryCuts = buildFingerCutIntervals(context.primaryEdge, context.overlap, fingerCount, depth, false);
  const secondaryCuts = buildFingerCutIntervals(context.secondaryEdge, context.overlap, fingerCount, depth, true);

  if (!primaryCuts || !secondaryCuts) {
    return {
      error: 'Finger joint count must be an odd number of at least three',
      status: 'unsupported',
    };
  }

  return {
    edgeCuts: [
      {
        entityId: context.primaryEntity.id,
        edgeKey: context.primaryEdge.edgeKey,
        cuts: primaryCuts,
      },
      {
        entityId: context.secondaryEntity.id,
        edgeKey: context.secondaryEdge.edgeKey,
        cuts: secondaryCuts,
      },
    ],
  };
}

function buildJoineryGeometry(joint, context) {
  if (joint.type === 'dado') {
    return buildDadoGeometry(joint, context);
  }

  if (joint.type === 'rabbet') {
    return buildRabbetCuts(joint, context);
  }

  return buildFingerCuts(joint, context);
}

export function createSketchJoint(input = {}) {
  return normalizeSketchJoint(input);
}

export function normalizeSketchJoints(joints = []) {
  return Array.isArray(joints) ? joints.map(normalizeSketchJoint) : [];
}

export function serializeSketchJointReference(reference) {
  if (!reference?.entityId || !reference?.sourceType) {
    return '';
  }

  return `${reference.entityId}:${reference.sourceType}:${reference.sourceKey ?? ''}`;
}

export function parseSerializedSketchJointReference(serialized) {
  const [entityId, sourceType, sourceKey = ''] = String(serialized || '').split(':');

  if (!entityId || !sourceType || !sourceKey) {
    return null;
  }

  return {
    entityId,
    sourceType,
    sourceKey,
  };
}

export function listSketchJointEntityIds(joint) {
  return Array.from(
    new Set(
      [
        joint?.primaryEntityId,
        joint?.secondaryEntityId,
        joint?.primaryEdgeRef?.entityId,
        joint?.secondaryEdgeRef?.entityId,
      ].filter(Boolean),
    ),
  );
}

export function getSketchJointTypeOptions() {
  return JOINERY_TYPES.map((type) => ({
    value: type,
    label: getJointById(type)?.name || type,
  }));
}

export function getSketchJointSegmentOptions(entities = []) {
  return entities
    .filter(isAxisAlignedRect)
    .flatMap((entity) =>
      collectSnapSegmentsFromEntities([entity]).map((segment) => ({
        entityId: entity.id,
        entityLabel: `${entity.id} (${entity.type})`,
        label: String(segment.sourceKey).replace(/^./, (value) => value.toUpperCase()),
        value: serializeSketchJointReference({
          entityId: entity.id,
          sourceType: segment.sourceType,
          sourceKey: segment.sourceKey,
        }),
      })),
    );
}

export function getSketchJointSummary(joint) {
  if (joint.type === 'finger') {
    return `${joint.primaryEntityId || 'Unset'} ↔ ${joint.secondaryEntityId || 'Unset'} · ${joint.parameters.fingerCount || '?'} fingers @ ${joint.parameters.fingerWidth || '?'}mm`;
  }

  return `${joint.primaryEntityId || 'Unset'} ← ${joint.secondaryEntityId || 'Unset'} · ${joint.parameters.width || '?'}mm x ${joint.parameters.depth || '?'}mm`;
}

export function computeSketchJointDefaults(input, entities = []) {
  const joint = normalizeSketchJoint(input);
  const context = buildJointContext(joint, buildEntityMap(entities));
  return buildDefaultParametersFromContext(joint.type, context);
}

export function resolveSketchJoinery(entities = [], joints = []) {
  const normalizedJoints = normalizeSketchJoints(joints);
  const entitiesById = buildEntityMap(entities);
  const cutStateByEntity = new Map();
  const diagnostics = [];
  const previewEntities = [];
  const exportEntities = entities.map(cloneManufacturingEntity);
  const exportEntitiesById = new Map(exportEntities.map((entity) => [entity.id, entity]));

  normalizedJoints.forEach((joint) => {
    if (!joint.enabled) {
      diagnostics.push(createJointDiagnostic(joint, 'disabled', 'Joint generation is disabled'));
      return;
    }

    const context = buildJointContext(joint, entitiesById);

    if (context.error) {
      diagnostics.push(createJointDiagnostic(joint, context.status || 'unsupported', context.error));
      return;
    }

    const geometry = buildJoineryGeometry(joint, context);

    if (geometry.error) {
      diagnostics.push(createJointDiagnostic(joint, geometry.status || 'unsupported', geometry.error));
      return;
    }

    if (geometry.edgeCuts?.length) {
      const hasConflict = geometry.edgeCuts.some((edgeCut) =>
        !canApplyEdgeCuts(cutStateByEntity, edgeCut.entityId, edgeCut.edgeKey, edgeCut.cuts));

      if (hasConflict) {
        diagnostics.push(
          createJointDiagnostic(
            joint,
            'conflict',
            'Generated joinery overlaps existing generated cuts on the same edge',
          ),
        );
        return;
      }

      geometry.edgeCuts.forEach((edgeCut) => {
        applyEdgeCuts(cutStateByEntity, edgeCut.entityId, edgeCut.edgeKey, edgeCut.cuts, joint.id);
      });
    }

    if (geometry.previewEntities?.length) {
      geometry.previewEntities.forEach((entity) => {
        previewEntities.push(entity);
        exportEntities.push(entity);
      });
    }

    diagnostics.push(createJointDiagnostic(joint, 'applied', null));
  });

  cutStateByEntity.forEach((cutState, entityId) => {
    const entity = entitiesById.get(entityId);
    if (!entity) {
      return;
    }

    const generatedProfile = createGeneratedProfileEntity(entity, cutState);
    previewEntities.push(generatedProfile);
    exportEntities.push(generatedProfile);

    const baseExportEntity = exportEntitiesById.get(entityId);
    if (baseExportEntity) {
      baseExportEntity.meta = {
        ...(baseExportEntity.meta || {}),
        manufacturingHidden: true,
      };
    }
  });

  return {
    joints: normalizedJoints,
    diagnostics,
    previewEntities,
    exportEntities,
  };
}
