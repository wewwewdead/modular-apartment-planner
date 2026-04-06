import { useEffect, useMemo, useState } from 'react';
import styles from '../styles/craftsman.module.css';
import {
  createSketchJoint,
  isSketchJointPairSupported,
  resolveSketchJoinery,
} from '../../utils/sketchJoineryUtils';
import {
  buildJointFormState,
  buildJointFromForm,
  orderSelectedJoineryEntities,
} from './jointPanelHelpers';
import JointForm from './JointForm';
import ExistingJointList from './ExistingJointList';

export { orderSelectedJoineryEntities };

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
