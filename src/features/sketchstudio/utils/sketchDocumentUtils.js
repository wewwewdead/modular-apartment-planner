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

export function createBlankSketchDocument(overrides = {}) {
  return {
    ...sampleDocument,
    ...overrides,
    id: overrides.id || createDocumentId(),
    name: normalizeCommittedSketchName(overrides.name || sampleDocument.name),
    units: overrides.units || sampleDocument.units || 'mm',
    metadata: {
      ...(sampleDocument.metadata || {}),
      ...(overrides.metadata || {}),
    },
    objectDefinition: {
      ...(sampleDocument.objectDefinition || {}),
      ...(overrides.objectDefinition || {}),
    },
    constraints: Array.isArray(overrides.constraints) ? [...overrides.constraints] : [],
    layers: Array.isArray(overrides.layers) && overrides.layers.length
      ? overrides.layers.map(cloneLayer)
      : (sampleDocument.layers || []).map(cloneLayer),
    entities: Array.isArray(overrides.entities) ? [...overrides.entities] : [],
  };
}
