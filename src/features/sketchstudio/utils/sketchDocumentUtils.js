import sampleDocument from '../data/sampleDocument';

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
  return {
    ...joint,
    parameters: {
      ...(joint?.parameters || {}),
    },
    primaryEdgeRef: joint?.primaryEdgeRef ? { ...joint.primaryEdgeRef } : null,
    secondaryEdgeRef: joint?.secondaryEdgeRef ? { ...joint.secondaryEdgeRef } : null,
  };
}

export function normalizeSketchDocument(document) {
  const source = document && typeof document === 'object' ? document : {};

  return {
    ...sampleDocument,
    ...source,
    id: typeof source.id === 'string' && source.id ? source.id : sampleDocument.id,
    name: normalizeCommittedSketchName(source.name || sampleDocument.name),
    units: source.units || sampleDocument.units || 'mm',
    metadata: {
      ...(sampleDocument.metadata || {}),
      ...(source.metadata || {}),
    },
    objectDefinition: {
      ...(sampleDocument.objectDefinition || {}),
      ...(source.objectDefinition || {}),
    },
    variables: Array.isArray(source.variables) ? source.variables.map(cloneVariable) : [],
    constraints: Array.isArray(source.constraints) ? source.constraints.map(cloneConstraint) : [],
    joints: Array.isArray(source.joints) ? source.joints.map(cloneJoint) : [],
    layers:
      Array.isArray(source.layers) && source.layers.length
        ? source.layers.map(cloneLayer)
        : (sampleDocument.layers || []).map(cloneLayer),
    entities: Array.isArray(source.entities) ? [...source.entities] : [],
  };
}

export function createBlankSketchDocument(overrides = {}) {
  return normalizeSketchDocument({
    ...overrides,
    id: overrides.id || createDocumentId(),
    name: overrides.name || sampleDocument.name,
  });
}
