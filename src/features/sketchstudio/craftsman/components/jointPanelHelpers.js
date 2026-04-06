import styles from '../styles/craftsman.module.css';
import {
  JOINT_PLACEMENT_MODES,
  computeSketchJointDefaults,
  createSketchJoint,
  getSketchJointSegmentOptions,
  listJointTypeParameterFields,
  parseSerializedSketchJointReference,
  serializeSketchJointReference,
  supportsAutoOverlapDepth,
} from '../../utils/sketchJoineryUtils';

export function getRectPartOptions(entities = []) {
  return entities
    .filter((entity) => entity.type === 'rect')
    .map((entity) => ({
      value: entity.id,
      label: `${entity.id} (${Math.round(entity.width)} x ${Math.round(entity.height)} mm)`,
    }));
}

export function getEntityById(entities, entityId) {
  return entities.find((entity) => entity.id === entityId) || null;
}

export function getEdgeOptionsForEntity(entities, entityId) {
  const entity = getEntityById(entities, entityId);
  return entity ? getSketchJointSegmentOptions([entity]) : [];
}

export function supportsAutoDepthMode(type, placementMode) {
  return placementMode === JOINT_PLACEMENT_MODES.AUTO_CONTACT && supportsAutoOverlapDepth(type);
}

export function formatNumericValue(value) {
  return Number.isFinite(Number(value)) ? `${Number(value)} mm` : 'Not resolved';
}

export function formatEdgeLabel(edgeKey) {
  return edgeKey ? String(edgeKey).replace(/^./, (value) => value.toUpperCase()) : 'Unknown';
}

export function buildParameterValues(type, defaults = {}, existingParameters = null) {
  return listJointTypeParameterFields(type).reduce(
    (accumulator, field) => ({
      ...accumulator,
      [field.key]:
        existingParameters?.[field.key] != null
          ? String(existingParameters[field.key])
          : defaults?.[field.key] != null
            ? String(defaults[field.key])
            : '',
    }),
    {},
  );
}

export function buildSeedJoint(formState) {
  return createSketchJoint({
    id: formState.id || 'joint-draft',
    type: formState.type,
    placementMode: formState.placementMode,
    parameterModes: formState.parameterModes,
    sourcePartId: formState.sourcePartId,
    targetPartId: formState.targetPartId,
    sourceEdgeRef:
      formState.placementMode === JOINT_PLACEMENT_MODES.MANUAL_REFS
        ? parseSerializedSketchJointReference(formState.sourceEdgeValue)
        : null,
    targetEdgeRef:
      formState.placementMode === JOINT_PLACEMENT_MODES.MANUAL_REFS
        ? parseSerializedSketchJointReference(formState.targetEdgeValue)
        : null,
  });
}

export function orderSelectedJoineryEntities(entities = [], selectedEntities = [], selectedIds = []) {
  const selectedEntityMap = new Map((selectedEntities || []).map((entity) => [entity.id, entity]));
  const orderedSelection = (selectedIds || [])
    .map((entityId) => selectedEntityMap.get(entityId) || getEntityById(entities, entityId))
    .filter(Boolean);

  return orderedSelection.length ? orderedSelection : selectedEntities;
}

export function getFocusedJointForEditing(joints = [], focusedJointId = null) {
  if (!focusedJointId) {
    return null;
  }

  return joints.find((joint) => joint.id === focusedJointId) || null;
}

export function getJointFormContextPairIds(editingJoint = null, orderedSelectedEntities = []) {
  return editingJoint
    ? [editingJoint.sourcePartId, editingJoint.targetPartId].filter(Boolean)
    : orderedSelectedEntities.map((entity) => entity.id);
}

export function getJointPanelContextMessage({
  editingJoint = null,
  formContextPairIds = [],
  editablePair = false,
  orderedSelectedEntities = [],
  selectedEntity = null,
}) {
  if (editingJoint) {
    const editingPairLabel = formContextPairIds.join(' + ') || editingJoint.label || editingJoint.id;
    return `Editing pair: ${editingPairLabel}`;
  }

  if (editablePair) {
    return `Selected parts: ${orderedSelectedEntities.map((entity) => entity.id).join(' + ')}`;
  }

  if (selectedEntity) {
    return `Select one more rectangular part to create automatic joinery from ${selectedEntity.id}.`;
  }

  return 'Select exactly two rectangular parts to create joinery.';
}

export function buildJointFormState(entities, selectedEntities = [], existing = null) {
  const partOptions = getRectPartOptions(entities);
  const sourcePartId = existing?.sourcePartId || selectedEntities[0]?.id || partOptions[0]?.value || '';
  const targetPartId =
    existing?.targetPartId ||
    selectedEntities[1]?.id ||
    partOptions.find((option) => option.value !== sourcePartId)?.value ||
    partOptions[0]?.value ||
    '';
  const sourceEdgeOptions = getEdgeOptionsForEntity(entities, sourcePartId);
  const targetEdgeOptions = getEdgeOptionsForEntity(entities, targetPartId);
  const type = existing?.type || 'dado';
  const placementMode = existing?.placementMode || JOINT_PLACEMENT_MODES.AUTO_CONTACT;
  const seedJoint = createSketchJoint({
    id: existing?.id || 'joint-draft',
    type,
    placementMode,
    parameterModes: existing?.parameterModes,
    sourcePartId,
    targetPartId,
    sourceEdgeRef:
      placementMode === JOINT_PLACEMENT_MODES.MANUAL_REFS
        ? existing?.sourceEdgeRef || parseSerializedSketchJointReference(sourceEdgeOptions[0]?.value || '')
        : null,
    targetEdgeRef:
      placementMode === JOINT_PLACEMENT_MODES.MANUAL_REFS
        ? existing?.targetEdgeRef || parseSerializedSketchJointReference(targetEdgeOptions[0]?.value || '')
        : null,
    parameters: existing?.parameters,
  });
  const computedDefaults = computeSketchJointDefaults(seedJoint, entities);

  return {
    id: existing?.id || null,
    autoDefaults: !existing,
    type,
    label: existing?.label || '',
    enabled: existing?.enabled !== false,
    placementMode: seedJoint.placementMode,
    parameterModes: {
      ...seedJoint.parameterModes,
    },
    sourcePartId,
    targetPartId,
    sourceEdgeValue: serializeSketchJointReference(existing?.sourceEdgeRef) || sourceEdgeOptions[0]?.value || '',
    targetEdgeValue: serializeSketchJointReference(existing?.targetEdgeRef) || targetEdgeOptions[0]?.value || '',
    parameterValues: buildParameterValues(type, computedDefaults, existing?.parameters || null),
  };
}

export function buildJointFromForm(formState) {
  const parameters = listJointTypeParameterFields(formState.type).reduce((accumulator, field) => {
    if (field.key === 'depth' && formState.parameterModes.depth === 'auto_overlap') {
      return accumulator;
    }

    const rawValue = formState.parameterValues[field.key];
    if (rawValue == null || rawValue === '') {
      return accumulator;
    }

    const numericValue = field.kind === 'integer' ? Math.round(Number(rawValue)) : Number(rawValue);

    return Number.isFinite(numericValue) ? { ...accumulator, [field.key]: numericValue } : accumulator;
  }, {});

  return createSketchJoint({
    id: formState.id || 'joint-draft',
    type: formState.type,
    label: formState.label,
    enabled: formState.enabled,
    placementMode: formState.placementMode,
    parameterModes: formState.parameterModes,
    sourcePartId: formState.sourcePartId,
    targetPartId: formState.targetPartId,
    sourceEdgeRef:
      formState.placementMode === JOINT_PLACEMENT_MODES.MANUAL_REFS
        ? parseSerializedSketchJointReference(formState.sourceEdgeValue)
        : null,
    targetEdgeRef:
      formState.placementMode === JOINT_PLACEMENT_MODES.MANUAL_REFS
        ? parseSerializedSketchJointReference(formState.targetEdgeValue)
        : null,
    parameters,
  });
}

export function buildContactSummary(joint) {
  const contact = joint?.resolvedContact;
  if (!contact || !joint?.sourcePartId || !joint?.targetPartId) {
    return null;
  }

  const directionSummary = contact.autoFlipped
    ? ' Automatic source and target roles were corrected from the detected overlap.'
    : '';

  if (contact.kind === 'penetration') {
    return [
      `Detected overlap: ${joint.sourcePartId} ${formatEdgeLabel(contact.sourceEdgeKey).toLowerCase()} edge enters`,
      `${joint.targetPartId} ${formatEdgeLabel(contact.targetEdgeKey).toLowerCase()} edge by`,
      `${formatNumericValue(contact.penetrationDepth)} over a ${formatNumericValue(contact.overlap?.length)} span.${directionSummary}`,
    ].join(' ');
  }

  return [
    `Detected contact: ${joint.sourcePartId} ${formatEdgeLabel(contact.sourceEdgeKey).toLowerCase()} edge touches`,
    `${joint.targetPartId} ${formatEdgeLabel(contact.targetEdgeKey).toLowerCase()} edge over`,
    `${formatNumericValue(contact.overlap?.length)}.${directionSummary}`,
  ].join(' ');
}

export function getJointStatusClassName(diagnostic) {
  switch (diagnostic?.status) {
    case 'applied':
      return styles.jointStatusApplied;
    case 'warning':
      return styles.jointStatusWarning;
    case 'disabled':
      return styles.jointStatusDisabled;
    default:
      return styles.jointStatusInvalid;
  }
}
