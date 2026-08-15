import sampleDocument from '../data/sampleDocument';
import { cloneJoint as cloneJoineryJoint } from '../joinery';
import { normalizeEntityGroupMemberships } from './groupUtils';

/**
 * Document schema version.
 *
 *   1 — cascade constraints.
 *   2 — solver-era constraint types and driving dimensions
 *       (`entity.driving` / `entity.drivingValue`).
 *   3 — no constraints at all. Sketch Studio is pure freehand drafting again:
 *       dimensions MEASURE geometry and never drive it.
 *
 * The v1/v2 -> v3 migration happens on load, in `normalizeSketchDocument`: a
 * stored `constraints` array is dropped and the `driving` / `drivingValue`
 * fields are stripped from dimension entities. Nothing else in the document
 * changes, so every old sketch still opens with its geometry, variables,
 * joints, groups and layers intact — it simply opens un-constrained, which is
 * the same shape it would have had if the constraints had never been added.
 *
 * The bump is deliberate rather than cosmetic: a v3 document is genuinely no
 * longer readable as a v2 one (its constraints are gone for good), so a file
 * written here must not claim to be the version that still carried them.
 */
export const SKETCH_DOCUMENT_SCHEMA_VERSION = 3;

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

function cloneJoint(joint) {
  return cloneJoineryJoint(joint);
}

function isDimensionEntity(entity) {
  return entity?.type === 'dimension' || entity?.type === 'angle-dimension';
}

/**
 * Drop the driving-dimension fields left behind by the constraint era. Entities
 * that carry NEITHER field are returned by identity, so an untouched document
 * keeps its entity array (and the array itself) by reference.
 */
function stripDimensionDrivingFields(entities = []) {
  let changed = false;

  const next = entities.map((entity) => {
    if (!isDimensionEntity(entity)) {
      return entity;
    }

    if (!Object.hasOwn(entity, 'driving') && !Object.hasOwn(entity, 'drivingValue')) {
      return entity;
    }

    changed = true;
    const { driving: _driving, drivingValue: _drivingValue, ...rest } = entity;
    return rest;
  });

  return changed ? next : entities;
}

export function normalizeSketchDocument(document) {
  const source = document && typeof document === 'object' ? document : {};
  // `constraints` is dropped on load: see the schema note above.
  const { groupIndex: _runtimeGroupIndex, constraints: _legacyConstraints, ...sourceWithoutRuntimeFields } = source;
  const sourceEntities = Array.isArray(sourceWithoutRuntimeFields.entities)
    ? [...sourceWithoutRuntimeFields.entities]
    : [];
  const normalizedEntities = stripDimensionDrivingFields(normalizeEntityGroupMemberships(sourceEntities));

  return {
    ...sampleDocument,
    ...sourceWithoutRuntimeFields,
    version: SKETCH_DOCUMENT_SCHEMA_VERSION,
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
