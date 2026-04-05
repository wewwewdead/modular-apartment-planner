import { useEffect, useMemo, useState } from 'react';
import styles from '../styles/craftsman.module.css';
import {
  JOINT_PARAMETER_DEPTH_MODES,
  JOINT_PLACEMENT_MODES,
  computeSketchJointDefaults,
  createSketchJoint,
  getJointTypeDefinition,
  getSketchJointSegmentOptions,
  getSketchJointSummary,
  getSketchJointTypeOptions,
  isSketchJointPairSupported,
  listJointTypeParameterFields,
  listSketchJointEntityIds,
  parseSerializedSketchJointReference,
  resolveSketchJoinery,
  serializeSketchJointReference,
  supportsAutoOverlapDepth,
} from '../../utils/sketchJoineryUtils';

function getRectPartOptions(entities = []) {
  return entities
    .filter((entity) => entity.type === 'rect')
    .map((entity) => ({
      value: entity.id,
      label: `${entity.id} (${Math.round(entity.width)} x ${Math.round(entity.height)} mm)`,
    }));
}

function getEntityById(entities, entityId) {
  return entities.find((entity) => entity.id === entityId) || null;
}

function getEdgeOptionsForEntity(entities, entityId) {
  const entity = getEntityById(entities, entityId);
  return entity ? getSketchJointSegmentOptions([entity]) : [];
}

function supportsAutoDepthMode(type, placementMode) {
  return placementMode === JOINT_PLACEMENT_MODES.AUTO_CONTACT && supportsAutoOverlapDepth(type);
}

function formatNumericValue(value) {
  return Number.isFinite(Number(value)) ? `${Number(value)} mm` : 'Not resolved';
}

function formatEdgeLabel(edgeKey) {
  return edgeKey ? String(edgeKey).replace(/^./, (value) => value.toUpperCase()) : 'Unknown';
}

function buildParameterValues(type, defaults = {}, existingParameters = null) {
  return listJointTypeParameterFields(type).reduce((accumulator, field) => ({
    ...accumulator,
    [field.key]:
      existingParameters?.[field.key] != null
        ? String(existingParameters[field.key])
        : defaults?.[field.key] != null
          ? String(defaults[field.key])
          : '',
  }), {});
}

function buildSeedJoint(formState) {
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
  const selectedEntityMap = new Map(
    (selectedEntities || []).map((entity) => [entity.id, entity]),
  );
  const orderedSelection = (selectedIds || [])
    .map((entityId) => selectedEntityMap.get(entityId) || getEntityById(entities, entityId))
    .filter(Boolean);

  return orderedSelection.length ? orderedSelection : selectedEntities;
}

function buildJointFormState(entities, selectedEntities = [], existing = null) {
  const partOptions = getRectPartOptions(entities);
  const sourcePartId = existing?.sourcePartId || selectedEntities[0]?.id || partOptions[0]?.value || '';
  const targetPartId =
    existing?.targetPartId
    || selectedEntities[1]?.id
    || partOptions.find((option) => option.value !== sourcePartId)?.value
    || partOptions[0]?.value
    || '';
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
        ? (existing?.sourceEdgeRef || parseSerializedSketchJointReference(sourceEdgeOptions[0]?.value || ''))
        : null,
    targetEdgeRef:
      placementMode === JOINT_PLACEMENT_MODES.MANUAL_REFS
        ? (existing?.targetEdgeRef || parseSerializedSketchJointReference(targetEdgeOptions[0]?.value || ''))
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
    sourceEdgeValue:
      serializeSketchJointReference(existing?.sourceEdgeRef) || sourceEdgeOptions[0]?.value || '',
    targetEdgeValue:
      serializeSketchJointReference(existing?.targetEdgeRef) || targetEdgeOptions[0]?.value || '',
    parameterValues: buildParameterValues(type, computedDefaults, existing?.parameters || null),
  };
}

function buildJointFromForm(formState) {
  const parameters = listJointTypeParameterFields(formState.type).reduce((accumulator, field) => {
    if (
      field.key === 'depth'
      && formState.parameterModes.depth === JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP
    ) {
      return accumulator;
    }

    const rawValue = formState.parameterValues[field.key];
    if (rawValue == null || rawValue === '') {
      return accumulator;
    }

    const numericValue = field.kind === 'integer'
      ? Math.round(Number(rawValue))
      : Number(rawValue);

    return Number.isFinite(numericValue)
      ? { ...accumulator, [field.key]: numericValue }
      : accumulator;
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

function buildContactSummary(joint) {
  const contact = joint?.resolvedContact;
  if (!contact || !joint?.sourcePartId || !joint?.targetPartId) {
    return null;
  }

  const directionSummary = contact.autoFlipped ? ' Automatic source and target roles were corrected from the detected overlap.' : '';

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

function getJointStatusClassName(diagnostic) {
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

function JointStatus({ diagnostic }) {
  if (!diagnostic) {
    return null;
  }

  return (
    <span className={`${styles.jointStatus} ${getJointStatusClassName(diagnostic)}`}>
      {diagnostic.statusLabel}
    </span>
  );
}

function JointForm({
  entities,
  selectedEntities,
  formState,
  setFormState,
  candidateJoint,
  candidateDiagnostic,
  onSubmit,
  onCancel,
  submitLabel,
}) {
  const partOptions = useMemo(() => getRectPartOptions(entities), [entities]);
  const sourceEdgeOptions = useMemo(
    () => getEdgeOptionsForEntity(entities, formState.sourcePartId),
    [entities, formState.sourcePartId],
  );
  const targetEdgeOptions = useMemo(
    () => getEdgeOptionsForEntity(entities, formState.targetPartId),
    [entities, formState.targetPartId],
  );
  const currentType = getJointTypeDefinition(formState.type);
  const parameterFields = listJointTypeParameterFields(formState.type);
  const pairSelectionIds = selectedEntities.map((entity) => entity.id);
  const isManualPlacement = formState.placementMode === JOINT_PLACEMENT_MODES.MANUAL_REFS;
  const autoDepthEnabled = supportsAutoDepthMode(formState.type, formState.placementMode);
  const depthIsAuto = formState.parameterModes.depth === JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP;
  const defaultSeedJoint = useMemo(() => buildSeedJoint(formState), [formState]);
  const defaultParameters = useMemo(
    () => computeSketchJointDefaults(defaultSeedJoint, entities),
    [defaultSeedJoint, entities],
  );
  const contactSummary = buildContactSummary(candidateJoint);

  useEffect(() => {
    if (!formState.sourcePartId && partOptions[0]?.value) {
      setFormState((current) => ({
        ...current,
        sourcePartId: partOptions[0].value,
      }));
    }
  }, [formState.sourcePartId, partOptions, setFormState]);

  useEffect(() => {
    if (formState.sourcePartId === formState.targetPartId) {
      const nextTargetId = partOptions.find((option) => option.value !== formState.sourcePartId)?.value || '';
      if (nextTargetId) {
        setFormState((current) => ({
          ...current,
          targetPartId: nextTargetId,
        }));
      }
    }
  }, [formState.sourcePartId, formState.targetPartId, partOptions, setFormState]);

  useEffect(() => {
    if (!isManualPlacement) {
      return;
    }

    if (!sourceEdgeOptions.some((option) => option.value === formState.sourceEdgeValue)) {
      setFormState((current) => ({
        ...current,
        sourceEdgeValue: sourceEdgeOptions[0]?.value || '',
      }));
    }
  }, [formState.sourceEdgeValue, isManualPlacement, sourceEdgeOptions, setFormState]);

  useEffect(() => {
    if (!isManualPlacement) {
      return;
    }

    if (!targetEdgeOptions.some((option) => option.value === formState.targetEdgeValue)) {
      setFormState((current) => ({
        ...current,
        targetEdgeValue: targetEdgeOptions[0]?.value || '',
      }));
    }
  }, [formState.targetEdgeValue, isManualPlacement, targetEdgeOptions, setFormState]);

  useEffect(() => {
    setFormState((current) => {
      let nextParameterValues = current.parameterValues;
      let didChange = false;

      if (current.autoDefaults) {
        const computedValues = buildParameterValues(current.type, defaultParameters, null);
        const currentSerialized = JSON.stringify(current.parameterValues);
        const nextSerialized = JSON.stringify(computedValues);

        if (currentSerialized !== nextSerialized) {
          nextParameterValues = computedValues;
          didChange = true;
        }
      } else if (current.parameterModes.depth === JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP) {
        const nextDepthValue = defaultParameters.depth != null ? String(defaultParameters.depth) : '';
        if ((current.parameterValues.depth ?? '') !== nextDepthValue) {
          nextParameterValues = {
            ...current.parameterValues,
            depth: nextDepthValue,
          };
          didChange = true;
        }
      }

      return didChange
        ? {
            ...current,
            parameterValues: nextParameterValues,
          }
        : current;
    });
  }, [
    defaultParameters,
    formState.autoDefaults,
    formState.parameterModes.depth,
    formState.placementMode,
    formState.sourceEdgeValue,
    formState.sourcePartId,
    formState.targetEdgeValue,
    formState.targetPartId,
    formState.type,
    setFormState,
  ]);

  const canSubmit =
    candidateDiagnostic
    && candidateDiagnostic.status !== 'invalid'
    && candidateDiagnostic.status !== 'disabled'
    && candidateDiagnostic.canApply !== false;

  return (
    <div className={styles.jointDetail}>
      <p className={styles.jointDescription}>
        {currentType?.description || 'Generate manufacturing-aware joinery from the selected parts.'}
      </p>

      {pairSelectionIds.length === 2 ? (
        <p className={styles.jointContext}>
          Selected pair: <strong>{pairSelectionIds.join(' + ')}</strong>
        </p>
      ) : null}

      <div className={styles.jointFormGrid}>
        <label className={styles.fieldLabel}>
          Joint Type
          <select
            className={styles.materialSelect}
            value={formState.type}
            onChange={(event) => {
              const nextType = event.target.value;
              const nextDepthMode =
                supportsAutoDepthMode(nextType, formState.placementMode)
                  ? JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP
                  : JOINT_PARAMETER_DEPTH_MODES.MANUAL;

              setFormState((current) => ({
                ...current,
                type: nextType,
                autoDefaults: true,
                parameterModes: {
                  ...current.parameterModes,
                  depth: nextDepthMode,
                },
                parameterValues: {},
              }));
            }}
          >
            {getSketchJointTypeOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.fieldLabel}>
          Source Part
          <select
            className={styles.materialSelect}
            value={formState.sourcePartId}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                sourcePartId: event.target.value,
                autoDefaults: true,
              }))
            }
          >
            {partOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.fieldLabel}>
          Target Part
          <select
            className={styles.materialSelect}
            value={formState.targetPartId}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                targetPartId: event.target.value,
                autoDefaults: true,
              }))
            }
          >
            {partOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.fieldLabel}>
          Placement
          <div className={styles.jointModeValue}>
            {isManualPlacement ? 'Manual edge references' : 'Automatic contact detection'}
          </div>
        </label>

        {isManualPlacement ? (
          <>
            <label className={styles.fieldLabel}>
              Source Edge
              <select
                className={styles.materialSelect}
                value={formState.sourceEdgeValue}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    sourceEdgeValue: event.target.value,
                    autoDefaults: true,
                  }))
                }
              >
                {sourceEdgeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.fieldLabel}>
              Target Edge
              <select
                className={styles.materialSelect}
                value={formState.targetEdgeValue}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    targetEdgeValue: event.target.value,
                    autoDefaults: true,
                  }))
                }
              >
                {targetEdgeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        <label className={styles.fieldLabel}>
          Label
          <input
            type="text"
            className={styles.thicknessInput}
            value={formState.label}
            onChange={(event) => setFormState((current) => ({ ...current, label: event.target.value }))}
            placeholder="Optional joint label"
          />
        </label>

        {parameterFields.map((field) => {
          if (field.key === 'depth' && autoDepthEnabled && depthIsAuto) {
            return (
              <label key={field.key} className={styles.fieldLabel}>
                {field.label}
                <input
                  type="text"
                  className={styles.thicknessInput}
                  value={formState.parameterValues.depth ?? ''}
                  readOnly
                />
                <div className={styles.jointFieldControls}>
                  <button
                    type="button"
                    className={styles.exportBtn}
                    onClick={() =>
                      setFormState((current) => ({
                        ...current,
                        autoDefaults: false,
                        parameterModes: {
                          ...current.parameterModes,
                          depth: JOINT_PARAMETER_DEPTH_MODES.MANUAL,
                        },
                        parameterValues: {
                          ...current.parameterValues,
                          depth: current.parameterValues.depth ?? '',
                        },
                      }))
                    }
                  >
                    Use Manual Depth
                  </button>
                </div>
              </label>
            );
          }

          return (
            <label key={field.key} className={styles.fieldLabel}>
              {field.label}
              <input
                type="number"
                min={field.min}
                step={field.step}
                className={styles.thicknessInput}
                value={formState.parameterValues[field.key] ?? ''}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    autoDefaults: false,
                    parameterValues: {
                      ...current.parameterValues,
                      [field.key]: event.target.value,
                    },
                  }))
                }
              />
              {field.key === 'depth' && autoDepthEnabled ? (
                <div className={styles.jointFieldControls}>
                  <button
                    type="button"
                    className={styles.exportBtn}
                    onClick={() =>
                      setFormState((current) => ({
                        ...current,
                        parameterModes: {
                          ...current.parameterModes,
                          depth: JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP,
                        },
                        parameterValues: {
                          ...current.parameterValues,
                          depth: defaultParameters.depth != null ? String(defaultParameters.depth) : '',
                        },
                      }))
                    }
                  >
                    Link To Overlap
                  </button>
                </div>
              ) : null}
            </label>
          );
        })}
      </div>

      <div className={styles.jointCandidateRow}>
        <JointStatus diagnostic={candidateDiagnostic} />
        <span className={styles.jointSummary}>{getSketchJointSummary(candidateJoint)}</span>
      </div>

      {contactSummary ? (
        <p className={styles.jointHowTo}>{contactSummary}</p>
      ) : null}

      {candidateDiagnostic?.message ? (
        <p className={styles.jointHowTo}>{candidateDiagnostic.message}</p>
      ) : (
        <p className={styles.jointHowTo}>
          Automatic joints detect the single valid contact or overlap region between the selected parts, keep the joint
          definition intact after edits, and regenerate manufacturing geometry instead of decorative labels.
        </p>
      )}

      <div className={styles.jointActionRow}>
        <button type="button" className={styles.exportBtn} onClick={onSubmit} disabled={!canSubmit}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className={styles.exportBtn} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ExistingJointList({ joints, diagnostics, selectedIds, onEdit, onToggle, onRemove }) {
  const entries = useMemo(
    () =>
      joints
        .map((joint) => ({
          joint,
          diagnostic: diagnostics.find((item) => item.jointId === joint.id) || null,
          relevant:
            !selectedIds.length
            || listSketchJointEntityIds(joint).some((entityId) => selectedIds.includes(entityId)),
        }))
        .sort((left, right) => Number(right.relevant) - Number(left.relevant)),
    [diagnostics, joints, selectedIds],
  );

  if (!entries.length) {
    return (
      <p className={styles.emptyMessage}>
        No joints yet. Select two rectangular parts, choose a joint type, and let automatic detection resolve the
        active mating region.
      </p>
    );
  }

  return (
    <div className={styles.jointExistingList}>
      {entries.map(({ joint, diagnostic, relevant }) => (
        <div
          key={joint.id}
          className={`${styles.jointExistingCard} ${relevant ? styles.jointExistingCardActive : ''}`}
        >
          <div className={styles.jointExistingHeader}>
            <div>
              <div className={styles.jointName}>{joint.label}</div>
              <div className={styles.jointMeta}>{getSketchJointSummary(joint)}</div>
            </div>
            <JointStatus diagnostic={diagnostic} />
          </div>
          {diagnostic?.message ? <p className={styles.jointDescription}>{diagnostic.message}</p> : null}
          <div className={styles.jointActionRow}>
            <button type="button" className={styles.exportBtn} onClick={() => onEdit(joint)}>
              Edit
            </button>
            <button type="button" className={styles.exportBtn} onClick={() => onToggle(joint)}>
              {joint.enabled === false ? 'Enable' : 'Disable'}
            </button>
            <button type="button" className={styles.exportBtn} onClick={() => onRemove(joint.id)}>
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function JointPanel({
  entities,
  selectedEntity,
  selectedEntities = [],
  selectedIds = [],
  joints = [],
  diagnostics = [],
  onJointAdd,
  onJointUpdate,
  onJointRemove,
}) {
  const [editingJointId, setEditingJointId] = useState(null);
  const editingJoint = joints.find((joint) => joint.id === editingJointId) || null;
  const orderedSelectedEntities = useMemo(
    () => orderSelectedJoineryEntities(entities, selectedEntities, selectedIds),
    [entities, selectedEntities, selectedIds],
  );
  const [formState, setFormState] = useState(() => buildJointFormState(entities, orderedSelectedEntities, null));
  const editablePair = isSketchJointPairSupported(orderedSelectedEntities);

  useEffect(() => {
    if (!editingJointId) {
      setFormState(buildJointFormState(entities, orderedSelectedEntities, null));
    }
  }, [editingJointId, entities, orderedSelectedEntities]);

  const candidateDraftJoint = useMemo(() => buildJointFromForm(formState), [formState]);
  const candidateResolution = useMemo(
    () => resolveSketchJoinery(entities, [candidateDraftJoint]),
    [candidateDraftJoint, entities],
  );
  const candidateJoint = candidateResolution.joints[0] || candidateDraftJoint;
  const candidateDiagnostic = candidateResolution.diagnostics[0] || null;

  const handleEdit = (joint) => {
    setEditingJointId(joint.id);
    setFormState(buildJointFormState(entities, orderedSelectedEntities, joint));
  };

  const handleSubmit = () => {
    if (
      !candidateDiagnostic
      || candidateDiagnostic.status === 'invalid'
      || candidateDiagnostic.status === 'disabled'
      || candidateDiagnostic.canApply === false
    ) {
      return;
    }

    const payload = createSketchJoint({
      ...candidateDraftJoint,
      id: editingJoint?.id || undefined,
    });

    if (editingJoint) {
      onJointUpdate?.(editingJoint.id, payload);
    } else {
      onJointAdd?.(payload);
    }

    setEditingJointId(null);
    setFormState(buildJointFormState(entities, orderedSelectedEntities, null));
  };

  const handleCancel = () => {
    setEditingJointId(null);
    setFormState(buildJointFormState(entities, orderedSelectedEntities, null));
  };

  const contextMessage = editablePair
    ? `Selected parts: ${orderedSelectedEntities.map((entity) => entity.id).join(' + ')}`
    : selectedEntity
      ? `Select one more rectangular part to create automatic joinery from ${selectedEntity.id}.`
      : 'Select exactly two rectangular parts to create joinery.';

  return (
    <div className={styles.jointPanel}>
      <p className={styles.jointContext}>{contextMessage}</p>

      {editablePair || editingJoint ? (
        <JointForm
          entities={entities}
          selectedEntities={orderedSelectedEntities}
          formState={formState}
          setFormState={setFormState}
          candidateJoint={candidateJoint}
          candidateDiagnostic={candidateDiagnostic}
          onSubmit={handleSubmit}
          onCancel={editingJoint ? handleCancel : null}
          submitLabel={editingJoint ? 'Save Joint' : 'Apply Joint'}
        />
      ) : (
        <p className={styles.jointHelp}>
          Joinery supports <strong>entity-backed rectangular panels</strong>, including rotated rectangles. New joints
          detect contact or overlap automatically, while legacy manual-reference joints remain editable without
          migration.
        </p>
      )}

      <ExistingJointList
        joints={joints}
        diagnostics={diagnostics}
        selectedIds={selectedIds}
        onEdit={handleEdit}
        onToggle={(joint) => onJointUpdate?.(joint.id, { enabled: joint.enabled === false })}
        onRemove={onJointRemove}
      />
    </div>
  );
}
