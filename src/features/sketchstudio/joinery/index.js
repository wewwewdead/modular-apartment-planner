import { collectSnapSegmentsFromEntities } from '../utils/snapUtils';
import {
  JOINT_PARAMETER_DEPTH_MODES,
  JOINT_PLACEMENT_MODES,
  computeJointDefaultParameters,
  supportsAutoOverlapDepth,
} from './jointDefaults';
import { resolveJointGeometry } from './jointGeometryUtils';
import { buildJoineryEntityMap, isJoineryRectGenerationSupported, resolveJoineryContext } from './jointResolvers';
import {
  cloneJoint,
  listJointEntityIds,
  normalizeJoint,
  normalizeJointCollection,
  parseSerializedJointReference,
  patchJoint,
  serializeJointReference,
} from './jointSerializationUtils';
import {
  getJointTypeDefinition,
  getJointTypeLabel,
  getJointTypeOptions,
  listJointTypeParameterFields,
} from './jointTypes';

export {
  cloneJoint,
  getJointTypeDefinition,
  getJointTypeLabel,
  getJointTypeOptions,
  isJoineryRectGenerationSupported,
  JOINT_PARAMETER_DEPTH_MODES,
  JOINT_PLACEMENT_MODES,
  listJointEntityIds,
  listJointTypeParameterFields,
  normalizeJoint,
  normalizeJointCollection,
  parseSerializedJointReference,
  patchJoint,
  serializeJointReference,
  supportsAutoOverlapDepth,
};

export function createSketchJoint(input = {}) {
  return normalizeJoint(input);
}

export function normalizeSketchJoint(input = {}) {
  return normalizeJoint(input);
}

export function normalizeSketchJoints(joints = []) {
  return normalizeJointCollection(joints);
}

export function serializeSketchJointReference(reference) {
  return serializeJointReference(reference);
}

export function parseSerializedSketchJointReference(serialized) {
  return parseSerializedJointReference(serialized);
}

export function listSketchJointEntityIds(joint) {
  return listJointEntityIds(joint);
}

export function getSketchJointTypeOptions() {
  return getJointTypeOptions();
}

export function getSketchJointSegmentOptions(entities = []) {
  return entities
    .filter((entity) => entity.visible !== false && entity.type === 'rect')
    .flatMap((entity) => (
      collectSnapSegmentsFromEntities([entity]).map((segment) => ({
        entityId: entity.id,
        entityLabel: `${entity.id} (${entity.type})`,
        label: String(segment.sourceKey).replace(/^./, (value) => value.toUpperCase()),
        value: serializeJointReference({
          partId: entity.id,
          entityId: entity.id,
          sourceType: segment.sourceType,
          sourceKey: segment.sourceKey,
        }),
      }))
    ));
}

export function computeSketchJointDefaults(input, entities = []) {
  const joint = normalizeJoint(input);
  const context = resolveJoineryContext(joint, buildJoineryEntityMap(entities));
  const defaults = computeJointDefaultParameters(joint.type, context.error ? null : context);

  if (
    !context.error
    && joint.parameterModes?.depth === JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP
    && supportsAutoOverlapDepth(joint.type)
  ) {
    return {
      ...defaults,
      depth: context.penetrationDepth ?? defaults.depth,
    };
  }

  return defaults;
}

export function getSketchJointSummary(joint) {
  const normalized = normalizeJoint(joint);
  const widthWithOffset = (
    normalized.type === 'dado'
    || normalized.type === 'rabbet'
    || normalized.type === 'mortise_tenon'
  )
    ? (((normalized.parameters.width || 0) + (normalized.parameters.offset || 0)) || '?')
    : null;

  switch (normalized.type) {
    case 'dowel':
      return `${normalized.sourcePartId || 'Unset'} → ${normalized.targetPartId || 'Unset'} · ${normalized.parameters.count || '?'} dowels`;
    case 'pocket_screw':
      return `${normalized.sourcePartId || 'Unset'} → ${normalized.targetPartId || 'Unset'} · ${normalized.parameters.count || '?'} pockets`;
    case 'tab_slot':
      return `${normalized.sourcePartId || 'Unset'} → ${normalized.targetPartId || 'Unset'} · ${normalized.parameters.count || '?'} tabs × ${normalized.parameters.depth || '?'}mm`;
    case 'butt':
      return `${normalized.sourcePartId || 'Unset'} → ${normalized.targetPartId || 'Unset'} · butt joint`;
    case 'dado':
    case 'rabbet':
    case 'mortise_tenon':
      return `${normalized.sourcePartId || 'Unset'} → ${normalized.targetPartId || 'Unset'} · ${widthWithOffset}mm × ${normalized.parameters.depth || '?'}mm`;
    default:
      return `${normalized.sourcePartId || 'Unset'} → ${normalized.targetPartId || 'Unset'} · ${normalized.parameters.width || '?'}mm × ${normalized.parameters.depth || '?'}mm`;
  }
}

export function resolveSketchJoinery(entities = [], joints = []) {
  return resolveJointGeometry(entities, joints);
}

export function isSketchJointPairSupported(entities = []) {
  return entities.length === 2 && entities.every((entity) => isJoineryRectGenerationSupported(entity));
}
