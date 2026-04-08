import sampleDocument from '../data/sampleDocument';
import { cloneJoint as cloneJoineryJoint } from '../joinery';
import { normalizeEntityGroupMemberships } from './groupUtils';

export function normalizeCommittedSketchName(name) {
  return String(name || '').trim() || 'Untitled Sketch';
}

function createDocumentId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `doc-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

function cloneLayer(layer) {
  return {
    ...layer,
  };
}

function cloneVariable(variable, index) {
  return {
    ...variable,
    id: variable?.id || `var-${variable?.name || 'value'}-${index + 1}`,
    name: String(variable?.name || '').trim(),
    value: Number(variable?.value) || 0,
    unit: variable?.unit || 'mm',
  };
}

function cloneConstraint(constraint) {
  return {
    ...constraint,
  };
}

function cloneJoint(joint) {
  return cloneJoineryJoint(joint);
}

export function normalizeSketchDocument(document) {
  const source = document && typeof document === 'object' ? document : {};
  const { groupIndex: _runtimeGroupIndex, ...sourceWithoutRuntimeFields } = source;
  const sourceEntities = Array.isArray(sourceWithoutRuntimeFields.entities)
    ? [...sourceWithoutRuntimeFields.entities]
    : [];
  const normalizedEntities = normalizeEntityGroupMemberships(sourceEntities);

  return {
    ...sampleDocument,
    ...sourceWithoutRuntimeFields,
    id:
      typeof sourceWithoutRuntimeFields.id === 'string' && sourceWithoutRuntimeFields.id
        ? sourceWithoutRuntimeFields.id
        : sampleDocument.id,
    name: normalizeCommittedSketchName(sourceWithoutRuntimeFields.name || sampleDocument.name),
    units: sourceWithoutRuntimeFields.units || sampleDocument.units || 'mm',
    metadata: {
      ...(sampleDocument.metadata || {}),
      ...(sourceWithoutRuntimeFields.metadata || {}),
    },
    objectDefinition: {
      ...(sampleDocument.objectDefinition || {}),
      ...(sourceWithoutRuntimeFields.objectDefinition || {}),
    },
    variables: Array.isArray(sourceWithoutRuntimeFields.variables)
      ? sourceWithoutRuntimeFields.variables.map(cloneVariable)
      : [],
    constraints: Array.isArray(sourceWithoutRuntimeFields.constraints)
      ? sourceWithoutRuntimeFields.constraints.map(cloneConstraint)
      : [],
    joints: Array.isArray(sourceWithoutRuntimeFields.joints) ? sourceWithoutRuntimeFields.joints.map(cloneJoint) : [],
    layers:
      Array.isArray(sourceWithoutRuntimeFields.layers) && sourceWithoutRuntimeFields.layers.length
        ? sourceWithoutRuntimeFields.layers.map(cloneLayer)
        : (sampleDocument.layers || []).map(cloneLayer),
    entities: normalizedEntities,
  };
}

export function createBlankSketchDocument(overrides = {}) {
  return normalizeSketchDocument({
    ...overrides,
    id: overrides.id || createDocumentId(),
    name: overrides.name || sampleDocument.name,
  });
}
