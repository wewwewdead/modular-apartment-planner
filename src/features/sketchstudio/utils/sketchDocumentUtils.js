import sampleDocument from '../data/sampleDocument';
import {
  normalizeModel,
  pruneGroups,
  removeBlanklessParts,
  removeEmptyParts,
  removeOrphanedConnections,
  separateSheetBlanks,
} from '../cad/model';
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
 *   4 — a separate solid-model domain: part sketches (optionally constrained),
 *       features, definitions, instances, connections, sheets and fabrication.
 *       Legacy entities remain unconstrained and are never implicitly extruded.
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
export const SKETCH_DOCUMENT_SCHEMA_VERSION = 4;

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

// The object-valued fields a normalisation produced, for the fields whose
// normalisation is idempotent (`sketchDocumentUtils.idempotency.test.js` pins
// it on every template and CAD example): one of these handed back in
// normalises to an equal value. Not the joints -- a raw joint's missing
// `tolerance.clearanceMm` reads null after one pass and 0 after a second -- and
// not the entities: both are always normalised, exactly as before.
const NORMALIZED_FIELD_KEYS = ['metadata', 'objectDefinition', 'variables', 'layers', 'model'];
const normalizedFields = new WeakSet();

/**
 * `options.reuseNormalized`: a field that is itself the output of an earlier
 * normalisation is taken as it is instead of being normalised again. The
 * result is equal either way; reuse skips the work (the whole 3D model chain)
 * and keeps the field's identity. Callers that run many times on one document
 * (a drag frame, the dirty check) pass it; loading files never does, and a
 * field that came from anywhere else is always normalised.
 */
export function normalizeSketchDocument(document, { reuseNormalized = false } = {}) {
  const source = document && typeof document === 'object' ? document : {};
  if (source.version > SKETCH_DOCUMENT_SCHEMA_VERSION) throw new Error('This sketch uses a newer document schema.');
  // `constraints` is dropped on load: see the schema note above.
  const { groupIndex: _runtimeGroupIndex, constraints: _legacyConstraints, ...sourceWithoutRuntimeFields } = source;
  const sourceEntities = Array.isArray(sourceWithoutRuntimeFields.entities)
    ? [...sourceWithoutRuntimeFields.entities]
    : [];
  const normalizedEntities = stripDimensionDrivingFields(normalizeEntityGroupMemberships(sourceEntities));
  const reusable = (value) => reuseNormalized && value != null && normalizedFields.has(value);

  const normalized = {
    ...sampleDocument,
    ...sourceWithoutRuntimeFields,
    version: SKETCH_DOCUMENT_SCHEMA_VERSION,
    id:
      typeof sourceWithoutRuntimeFields.id === 'string' && sourceWithoutRuntimeFields.id
        ? sourceWithoutRuntimeFields.id
        : sampleDocument.id,
    name: normalizeCommittedSketchName(sourceWithoutRuntimeFields.name || sampleDocument.name),
    units: sourceWithoutRuntimeFields.units || sampleDocument.units || 'mm',
    metadata: reusable(sourceWithoutRuntimeFields.metadata)
      ? sourceWithoutRuntimeFields.metadata
      : {
          ...(sampleDocument.metadata || {}),
          ...(sourceWithoutRuntimeFields.metadata || {}),
        },
    objectDefinition: reusable(sourceWithoutRuntimeFields.objectDefinition)
      ? sourceWithoutRuntimeFields.objectDefinition
      : {
          ...(sampleDocument.objectDefinition || {}),
          ...(sourceWithoutRuntimeFields.objectDefinition || {}),
        },
    variables: reusable(sourceWithoutRuntimeFields.variables)
      ? sourceWithoutRuntimeFields.variables
      : Array.isArray(sourceWithoutRuntimeFields.variables)
        ? sourceWithoutRuntimeFields.variables.map(cloneVariable)
        : [],
    joints: Array.isArray(sourceWithoutRuntimeFields.joints) ? sourceWithoutRuntimeFields.joints.map(cloneJoint) : [],
    layers: reusable(sourceWithoutRuntimeFields.layers)
      ? sourceWithoutRuntimeFields.layers
      : Array.isArray(sourceWithoutRuntimeFields.layers) && sourceWithoutRuntimeFields.layers.length
        ? sourceWithoutRuntimeFields.layers.map(cloneLayer)
        : (sampleDocument.layers || []).map(cloneLayer),
    entities: normalizedEntities,
    // Load-time recovery, in order: links to deleted instances, then parts
    // that have no enabled feature (see removeEmptyParts), then sheet-metal
    // parts left with no blank (removeBlanklessParts, docs/sketch-studio-cut-pick.md
    // §3: their outlines come back). Part groups are repaired before
    // validation (a dangling groupId or parent is dropped, not refused) and
    // pruned again after parts were removed (pruneGroups). A sheet-metal part
    // saved with several instances opens as that many parts, each bent as it
    // stood (separateSheetBlanks, docs/sketch-studio-own-bends.md §4.2: one
    // piece of metal is one part).
    model: reusable(source.model)
      ? source.model
      : pruneGroups(
          separateSheetBlanks(
            removeBlanklessParts(
              removeEmptyParts(removeOrphanedConnections(normalizeModel(pruneGroups(source.model)))),
            ),
          ),
        ),
  };

  for (const key of NORMALIZED_FIELD_KEYS) {
    const value = normalized[key];
    if (value && typeof value === 'object') normalizedFields.add(value);
  }

  return normalized;
}

export function createBlankSketchDocument(overrides = {}) {
  return normalizeSketchDocument({
    ...overrides,
    id: overrides.id || createDocumentId(),
    name: overrides.name || sampleDocument.name,
  });
}
