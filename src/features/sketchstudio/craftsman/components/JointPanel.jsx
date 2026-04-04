import { useEffect, useMemo, useState } from 'react';
import { getJointById } from '../data/joints';
import styles from '../styles/craftsman.module.css';
import {
  computeSketchJointDefaults,
  createSketchJoint,
  getSketchJointSegmentOptions,
  getSketchJointSummary,
  getSketchJointTypeOptions,
  listSketchJointEntityIds,
  parseSerializedSketchJointReference,
  resolveSketchJoinery,
  serializeSketchJointReference,
} from '../../utils/sketchJoineryUtils';

function getRectPartOptions(entities = []) {
  return entities
    .filter((entity) => entity.type === 'rect' && !Number(entity.rotation))
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

function buildJointFormState(entities, selectedEntities = [], existing = null) {
  const partOptions = getRectPartOptions(entities);
  const initialPrimaryId = existing?.primaryEntityId || selectedEntities[0]?.id || partOptions[0]?.value || '';
  const initialSecondaryId =
    existing?.secondaryEntityId ||
    selectedEntities[1]?.id ||
    partOptions.find((option) => option.value !== initialPrimaryId)?.value ||
    partOptions[0]?.value ||
    '';
  const primaryEdgeOptions = getEdgeOptionsForEntity(entities, initialPrimaryId);
  const secondaryEdgeOptions = getEdgeOptionsForEntity(entities, initialSecondaryId);
  const type = existing?.type || 'finger';
  const seedJoint = createSketchJoint({
    id: existing?.id || 'joint-draft',
    type,
    primaryEntityId: initialPrimaryId,
    secondaryEntityId: initialSecondaryId,
    primaryEdgeRef:
      existing?.primaryEdgeRef || parseSerializedSketchJointReference(primaryEdgeOptions[0]?.value || ''),
    secondaryEdgeRef:
      existing?.secondaryEdgeRef || parseSerializedSketchJointReference(secondaryEdgeOptions[0]?.value || ''),
  });
  const computedDefaults = computeSketchJointDefaults(seedJoint, entities);
  const defaults = existing ? { ...computedDefaults, ...(existing.parameters || {}) } : computedDefaults;

  return {
    id: existing?.id || null,
    autoDefaults: !existing,
    type,
    label: existing?.label || '',
    enabled: existing?.enabled !== false,
    primaryEntityId: initialPrimaryId,
    secondaryEntityId: initialSecondaryId,
    primaryEdgeValue:
      serializeSketchJointReference(existing?.primaryEdgeRef) || primaryEdgeOptions[0]?.value || '',
    secondaryEdgeValue:
      serializeSketchJointReference(existing?.secondaryEdgeRef) || secondaryEdgeOptions[0]?.value || '',
    width: defaults.width != null ? String(defaults.width) : '',
    depth: defaults.depth != null ? String(defaults.depth) : '',
    fingerCount: defaults.fingerCount != null ? String(defaults.fingerCount) : '',
    fingerWidth: defaults.fingerWidth != null ? String(defaults.fingerWidth) : '',
  };
}

function buildJointFromForm(formState) {
  return createSketchJoint({
    id: formState.id || 'joint-draft',
    type: formState.type,
    label: formState.label,
    enabled: formState.enabled,
    primaryEntityId: formState.primaryEntityId,
    secondaryEntityId: formState.secondaryEntityId,
    primaryEdgeRef: parseSerializedSketchJointReference(formState.primaryEdgeValue),
    secondaryEdgeRef: parseSerializedSketchJointReference(formState.secondaryEdgeValue),
    parameters:
      formState.type === 'finger'
        ? {
            fingerCount: Number(formState.fingerCount),
            fingerWidth: Number(formState.fingerWidth),
            depth: Number(formState.depth),
          }
        : {
            width: Number(formState.width),
            depth: Number(formState.depth),
          },
  });
}

function getJointStatusClassName(diagnostic) {
  switch (diagnostic?.status) {
    case 'applied':
      return styles.jointStatusApplied;
    case 'disabled':
      return styles.jointStatusDisabled;
    case 'conflict':
      return styles.jointStatusConflict;
    case 'invalid_ref':
      return styles.jointStatusInvalid;
    case 'unsupported':
      return styles.jointStatusUnsupported;
    default:
      return '';
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
  const primaryEdgeOptions = useMemo(
    () => getEdgeOptionsForEntity(entities, formState.primaryEntityId),
    [entities, formState.primaryEntityId],
  );
  const secondaryEdgeOptions = useMemo(
    () => getEdgeOptionsForEntity(entities, formState.secondaryEntityId),
    [entities, formState.secondaryEntityId],
  );
  const currentType = getJointById(formState.type);
  const pairSelectionIds = selectedEntities.map((entity) => entity.id);

  useEffect(() => {
    if (!formState.primaryEntityId && partOptions[0]?.value) {
      setFormState((current) => ({
        ...current,
        primaryEntityId: partOptions[0].value,
      }));
    }
  }, [formState.primaryEntityId, partOptions, setFormState]);

  useEffect(() => {
    if (formState.primaryEntityId === formState.secondaryEntityId) {
      const nextSecondaryId = partOptions.find((option) => option.value !== formState.primaryEntityId)?.value || '';
      if (nextSecondaryId) {
        setFormState((current) => ({
          ...current,
          secondaryEntityId: nextSecondaryId,
        }));
      }
    }
  }, [formState.primaryEntityId, formState.secondaryEntityId, partOptions, setFormState]);

  useEffect(() => {
    if (!primaryEdgeOptions.some((option) => option.value === formState.primaryEdgeValue)) {
      setFormState((current) => ({
        ...current,
        primaryEdgeValue: primaryEdgeOptions[0]?.value || '',
      }));
    }
  }, [formState.primaryEdgeValue, primaryEdgeOptions, setFormState]);

  useEffect(() => {
    if (!secondaryEdgeOptions.some((option) => option.value === formState.secondaryEdgeValue)) {
      setFormState((current) => ({
        ...current,
        secondaryEdgeValue: secondaryEdgeOptions[0]?.value || '',
      }));
    }
  }, [formState.secondaryEdgeValue, secondaryEdgeOptions, setFormState]);

  useEffect(() => {
    if (!formState.autoDefaults) {
      return;
    }

    const defaults = computeSketchJointDefaults(candidateJoint, entities);

    setFormState((current) =>
      current.autoDefaults !== true
        ? current
        : (
      current.type === 'finger'
        ? {
            ...current,
            fingerCount: defaults.fingerCount != null ? String(defaults.fingerCount) : '',
            fingerWidth: defaults.fingerWidth != null ? String(defaults.fingerWidth) : '',
            depth: defaults.depth != null ? String(defaults.depth) : '',
          }
        : {
            ...current,
            width: defaults.width != null ? String(defaults.width) : '',
            depth: defaults.depth != null ? String(defaults.depth) : '',
          }
        ),
    );
  }, [
    formState.autoDefaults,
    candidateJoint.primaryEntityId,
    candidateJoint.secondaryEntityId,
    candidateJoint.primaryEdgeRef?.entityId,
    candidateJoint.primaryEdgeRef?.sourceKey,
    candidateJoint.secondaryEdgeRef?.entityId,
    candidateJoint.secondaryEdgeRef?.sourceKey,
    candidateJoint.type,
    entities,
    setFormState,
  ]);

  const canSubmit = candidateDiagnostic?.status === 'applied';

  return (
    <div className={styles.jointDetail}>
      <p className={styles.jointDescription}>
        {currentType?.description || 'Generate manufacturable joinery geometry from the selected parts.'}
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
            onChange={(event) =>
              setFormState((current) => ({ ...current, type: event.target.value, autoDefaults: true }))
            }
          >
            {getSketchJointTypeOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.fieldLabel}>
          Primary Part
          <select
            className={styles.materialSelect}
            value={formState.primaryEntityId}
            onChange={(event) =>
              setFormState((current) => ({ ...current, primaryEntityId: event.target.value, autoDefaults: true }))
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
          Secondary Part
          <select
            className={styles.materialSelect}
            value={formState.secondaryEntityId}
            onChange={(event) =>
              setFormState((current) => ({ ...current, secondaryEntityId: event.target.value, autoDefaults: true }))
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
          Primary Edge
          <select
            className={styles.materialSelect}
            value={formState.primaryEdgeValue}
            onChange={(event) =>
              setFormState((current) => ({ ...current, primaryEdgeValue: event.target.value, autoDefaults: true }))
            }
          >
            {primaryEdgeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.fieldLabel}>
          Secondary Edge
          <select
            className={styles.materialSelect}
            value={formState.secondaryEdgeValue}
            onChange={(event) =>
              setFormState((current) => ({ ...current, secondaryEdgeValue: event.target.value, autoDefaults: true }))
            }
          >
            {secondaryEdgeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

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

        {formState.type === 'finger' ? (
          <>
            <label className={styles.fieldLabel}>
              Finger Count
              <input
                type="number"
                min="3"
                step="2"
                className={styles.thicknessInput}
                value={formState.fingerCount}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, fingerCount: event.target.value, autoDefaults: false }))
                }
              />
            </label>
            <label className={styles.fieldLabel}>
              Finger Width (mm)
              <input
                type="number"
                min="1"
                step="0.1"
                className={styles.thicknessInput}
                value={formState.fingerWidth}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, fingerWidth: event.target.value, autoDefaults: false }))
                }
              />
            </label>
            <label className={styles.fieldLabel}>
              Finger Depth (mm)
              <input
                type="number"
                min="1"
                step="0.1"
                className={styles.thicknessInput}
                value={formState.depth}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, depth: event.target.value, autoDefaults: false }))
                }
              />
            </label>
          </>
        ) : (
          <>
            <label className={styles.fieldLabel}>
              Width (mm)
              <input
                type="number"
                min="1"
                step="0.1"
                className={styles.thicknessInput}
                value={formState.width}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, width: event.target.value, autoDefaults: false }))
                }
              />
            </label>
            <label className={styles.fieldLabel}>
              Depth (mm)
              <input
                type="number"
                min="1"
                step="0.1"
                className={styles.thicknessInput}
                value={formState.depth}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, depth: event.target.value, autoDefaults: false }))
                }
              />
            </label>
          </>
        )}
      </div>

      <div className={styles.jointCandidateRow}>
        <JointStatus diagnostic={candidateDiagnostic} />
        <span className={styles.jointSummary}>{getSketchJointSummary(candidateJoint)}</span>
      </div>

      {candidateDiagnostic?.message ? (
        <p className={styles.jointHowTo}>{candidateDiagnostic.message}</p>
      ) : (
        <p className={styles.jointHowTo}>
          {formState.type === 'finger'
            ? 'Generated finger joints replace both source part outlines with interlocking manufacturing profiles.'
            : formState.type === 'rabbet'
              ? 'Generated rabbets replace the primary part outline with a stepped manufacturing profile.'
              : 'Generated dados create subtractive slot geometry on the primary host part.'}
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
            !selectedIds.length ||
            listSketchJointEntityIds(joint).some((entityId) => selectedIds.includes(entityId)),
        }))
        .sort((left, right) => Number(right.relevant) - Number(left.relevant)),
    [diagnostics, joints, selectedIds],
  );

  if (!entries.length) {
    return (
      <p className={styles.emptyMessage}>
        No generated joints yet. Select two rectangular parts, choose touching edges, then apply a joint.
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
  const selectionIsPair = selectedEntities.length === 2;
  const editablePair = selectionIsPair && selectedEntities.every((entity) => entity.type === 'rect' && !Number(entity.rotation));
  const editingJoint = joints.find((joint) => joint.id === editingJointId) || null;
  const [formState, setFormState] = useState(() => buildJointFormState(entities, selectedEntities, null));

  useEffect(() => {
    if (!editingJointId) {
      setFormState(buildJointFormState(entities, selectedEntities, null));
    }
  }, [editingJointId, entities, selectedEntities]);

  const candidateJoint = useMemo(() => buildJointFromForm(formState), [formState]);
  const candidateDiagnostic = useMemo(() => {
    const resolution = resolveSketchJoinery(entities, [candidateJoint]);
    return resolution.diagnostics[0] || null;
  }, [candidateJoint, entities]);

  const handleEdit = (joint) => {
    setEditingJointId(joint.id);
    setFormState(buildJointFormState(entities, selectedEntities, joint));
  };

  const handleSubmit = () => {
    const payload = createSketchJoint({
      ...candidateJoint,
      id: editingJoint?.id || undefined,
    });

    if (candidateDiagnostic?.status !== 'applied') {
      return;
    }

    if (editingJoint) {
      onJointUpdate?.(editingJoint.id, payload);
    } else {
      onJointAdd?.(payload);
    }

    setEditingJointId(null);
    setFormState(buildJointFormState(entities, selectedEntities, null));
  };

  const handleCancel = () => {
    setEditingJointId(null);
    setFormState(buildJointFormState(entities, selectedEntities, null));
  };

  const contextMessage = editablePair
    ? `Selected parts: ${selectedEntities.map((entity) => entity.id).join(' + ')}`
    : selectedEntity
      ? `Select one more rectangular part to generate a joint from ${selectedEntity.id}.`
      : 'Select exactly two touching rectangular parts to generate joinery.';

  return (
    <div className={styles.jointPanel}>
      <p className={styles.jointContext}>{contextMessage}</p>

      {editablePair || editingJoint ? (
        <JointForm
          entities={entities}
          selectedEntities={selectedEntities}
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
          The first version of generated joinery supports <strong>non-rotated rectangular parts</strong> only.
          Assign thickness to both parts, pick the touching edges, and Craftsman Studio will generate the buildable cut geometry for export.
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
