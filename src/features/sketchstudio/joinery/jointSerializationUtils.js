import {
  createDefaultFaceReference,
  createDefaultFabrication,
  createDefaultTolerance,
  mergeJointParameters,
  normalizeJointParameterModes,
  normalizeJointPlacementMode,
  normalizeJointParameters,
} from './jointDefaults';
import { getJointTypeLabel, resolveJointType } from './jointTypes';

const VALIDATION_STATUSES = new Set(['pending', 'disabled', 'valid', 'warning', 'invalid']);

function createJointId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `joint-${crypto.randomUUID()}`;
  }
  return `joint-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

function normalizeLabel(type, label) {
  const trimmed = String(label || '').trim();
  return trimmed || getJointTypeLabel(type);
}

function normalizeEdgeReference(reference, fallbackPartId = null) {
  if (!reference || typeof reference !== 'object') {
    return null;
  }

  const entityId = typeof reference.entityId === 'string' && reference.entityId ? reference.entityId : fallbackPartId;
  const partId = typeof reference.partId === 'string' && reference.partId ? reference.partId : entityId;
  const sourceType = typeof reference.sourceType === 'string' && reference.sourceType ? reference.sourceType : 'segment';
  const sourceKey = reference.sourceKey == null ? null : String(reference.sourceKey);

  if (!entityId || !sourceKey || sourceType !== 'segment') {
    return null;
  }

  return {
    partId,
    entityId,
    sourceType,
    sourceKey,
  };
}

function normalizeFaceReference(reference, fallbackPartId = null) {
  if (!reference && !fallbackPartId) {
    return null;
  }

  return createDefaultFaceReference(
    reference?.partId || fallbackPartId || null,
    reference,
  );
}

function normalizeLegacyParameters(inputType, normalizedType, parameters = {}) {
  if (inputType === 'finger') {
    return {
      count: parameters.fingerCount,
      tabWidth: parameters.fingerWidth,
      spacing: parameters.spacing,
      edgeOffset: parameters.edgeOffset,
      depth: parameters.depth,
    };
  }

  if (normalizedType === 'pocket_screw') {
    return {
      pocketDiameter: parameters.pocketDiameter ?? parameters.diameter,
      pilotDiameter: parameters.pilotDiameter,
      count: parameters.count,
      spacing: parameters.spacing,
      edgeOffset: parameters.edgeOffset,
      pocketOffset: parameters.pocketOffset,
      depth: parameters.depth,
    };
  }

  return parameters;
}

function normalizeValidationState(validationState = null) {
  if (!validationState || typeof validationState !== 'object') {
    return {
      status: 'pending',
      reasons: [],
      warnings: [],
      canApply: true,
      generatedEntityIds: [],
    };
  }

  const status = VALIDATION_STATUSES.has(validationState.status) ? validationState.status : 'pending';
  const reasons = Array.isArray(validationState.reasons) ? validationState.reasons.filter(Boolean) : [];
  const warnings = Array.isArray(validationState.warnings) ? validationState.warnings.filter(Boolean) : [];
  const generatedEntityIds = Array.isArray(validationState.generatedEntityIds)
    ? Array.from(new Set(validationState.generatedEntityIds.filter(Boolean)))
    : [];

  return {
    status,
    reasons,
    warnings,
    canApply: validationState.canApply ?? (status === 'pending' || status === 'valid' || status === 'warning'),
    generatedEntityIds,
  };
}

function resolveLegacyPartIds(input, type) {
  const hasNewSource = typeof input?.sourcePartId === 'string' && input.sourcePartId;
  const hasNewTarget = typeof input?.targetPartId === 'string' && input.targetPartId;

  if (hasNewSource || hasNewTarget) {
    return {
      sourcePartId: hasNewSource ? input.sourcePartId : null,
      targetPartId: hasNewTarget ? input.targetPartId : null,
      sourceEdgeRef: input?.sourceEdgeRef || null,
      targetEdgeRef: input?.targetEdgeRef || null,
    };
  }

  const primaryEntityId = typeof input?.primaryEntityId === 'string' && input.primaryEntityId ? input.primaryEntityId : null;
  const secondaryEntityId = typeof input?.secondaryEntityId === 'string' && input.secondaryEntityId ? input.secondaryEntityId : null;

  if (!primaryEntityId && !secondaryEntityId) {
    return {
      sourcePartId: null,
      targetPartId: null,
      sourceEdgeRef: null,
      targetEdgeRef: null,
    };
  }

  if (type === 'dado' || type === 'rabbet') {
    return {
      sourcePartId: secondaryEntityId,
      targetPartId: primaryEntityId,
      sourceEdgeRef: input?.secondaryEdgeRef || null,
      targetEdgeRef: input?.primaryEdgeRef || null,
    };
  }

  return {
    sourcePartId: primaryEntityId,
    targetPartId: secondaryEntityId,
    sourceEdgeRef: input?.primaryEdgeRef || null,
    targetEdgeRef: input?.secondaryEdgeRef || null,
  };
}

export function serializeJointReference(reference) {
  if (!reference?.entityId || !reference?.sourceKey) {
    return '';
  }

  return `${reference.entityId}:${reference.sourceType || 'segment'}:${reference.sourceKey}`;
}

export function parseSerializedJointReference(serialized) {
  const [entityId, sourceType, sourceKey = ''] = String(serialized || '').split(':', 3);

  if (!entityId || sourceType !== 'segment' || !sourceKey) {
    return null;
  }

  return {
    partId: entityId,
    entityId,
    sourceType,
    sourceKey,
  };
}

export function normalizeJoint(input = {}) {
  const inputType = typeof input?.type === 'string' ? input.type.trim() : '';
  const type = resolveJointType(inputType);
  const legacyParts = resolveLegacyPartIds(input, type);
  const hasExplicitReferences = Boolean(
    input?.sourceEdgeRef
    || input?.targetEdgeRef
    || input?.primaryEdgeRef
    || input?.secondaryEdgeRef,
  );
  const placementMode = normalizeJointPlacementMode(input?.placementMode, hasExplicitReferences);
  const sourcePartId = legacyParts.sourcePartId || input?.sourceEdgeRef?.entityId || null;
  const targetPartId = legacyParts.targetPartId || input?.targetEdgeRef?.entityId || null;
  const normalizedParameters = normalizeJointParameters(
    type,
    normalizeLegacyParameters(inputType, type, input?.parameters || {}),
  );
  const normalizedParameterModes = normalizeJointParameterModes(
    type,
    placementMode,
    input?.parameterModes,
    input?.parameters || {},
  );

  return {
    id: typeof input?.id === 'string' && input.id ? input.id : createJointId(),
    type,
    label: normalizeLabel(type, input?.label),
    enabled: input?.enabled !== false,
    placementMode,
    sourcePartId,
    targetPartId,
    sourceFaceRef: normalizeFaceReference(input?.sourceFaceRef, sourcePartId),
    sourceEdgeRef: normalizeEdgeReference(input?.sourceEdgeRef || legacyParts.sourceEdgeRef, sourcePartId),
    targetFaceRef: normalizeFaceReference(input?.targetFaceRef, targetPartId),
    targetEdgeRef: normalizeEdgeReference(input?.targetEdgeRef || legacyParts.targetEdgeRef, targetPartId),
    parameters: normalizedParameters,
    parameterModes: normalizedParameterModes,
    tolerance: createDefaultTolerance(input?.tolerance, input?.clearance),
    fabrication: createDefaultFabrication(type, input?.fabricationMetadata || input?.fabrication),
    validationState: normalizeValidationState(input?.validationState),
  };
}

export function normalizeJointCollection(joints = []) {
  return Array.isArray(joints) ? joints.map((joint) => normalizeJoint(joint)) : [];
}

export function cloneJoint(joint) {
  if (!joint || !joint.id) {
    throw new Error('cloneJoint requires a joint with an id');
  }
  return {
    ...normalizeJoint(joint),
    id: joint.id,
  };
}

export function listJointEntityIds(joint) {
  return Array.from(new Set([
    joint?.sourcePartId,
    joint?.targetPartId,
    joint?.sourceEdgeRef?.entityId,
    joint?.targetEdgeRef?.entityId,
  ].filter(Boolean)));
}

export function patchJoint(baseJoint, patch = {}) {
  const normalizedBase = normalizeJoint(baseJoint);
  const nextType = patch?.type ? resolveJointType(patch.type) : normalizedBase.type;
  const nextPlacementMode =
    patch?.placementMode != null
      ? normalizeJointPlacementMode(
          patch.placementMode,
          Boolean(
            patch?.sourceEdgeRef
            || patch?.targetEdgeRef
            || normalizedBase.sourceEdgeRef
            || normalizedBase.targetEdgeRef,
          ),
        )
      : normalizedBase.placementMode;
  const nextParameters = patch?.parameters
    ? mergeJointParameters(nextType, normalizedBase.parameters, normalizeLegacyParameters(nextType, nextType, patch.parameters))
    : normalizeJointParameters(nextType, normalizedBase.parameters);
  const nextParameterModes = normalizeJointParameterModes(
    nextType,
    nextPlacementMode,
    patch?.parameterModes ?? normalizedBase.parameterModes,
    patch?.parameters
      ? { ...normalizedBase.parameters, ...patch.parameters }
      : normalizedBase.parameters,
  );

  return normalizeJoint({
    ...normalizedBase,
    ...patch,
    type: nextType,
    placementMode: nextPlacementMode,
    parameters: nextParameters,
    parameterModes: nextParameterModes,
    sourceFaceRef: patch?.sourceFaceRef ?? normalizedBase.sourceFaceRef,
    sourceEdgeRef: patch?.sourceEdgeRef ?? normalizedBase.sourceEdgeRef,
    targetFaceRef: patch?.targetFaceRef ?? normalizedBase.targetFaceRef,
    targetEdgeRef: patch?.targetEdgeRef ?? normalizedBase.targetEdgeRef,
  });
}
