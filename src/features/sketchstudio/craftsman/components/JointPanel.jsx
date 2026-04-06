import { useCallback, useMemo, useState } from 'react';
import styles from '../styles/craftsman.module.css';
import { createSketchJoint, isSketchJointPairSupported, resolveSketchJoinery } from '../../utils/sketchJoineryUtils';
import {
  buildJointFormState,
  buildJointFromForm,
  getFocusedJointForEditing,
  getJointFormContextPairIds,
  getJointPanelContextMessage,
  orderSelectedJoineryEntities,
} from './jointPanelHelpers';
import JointForm from './JointForm';
import ExistingJointList from './ExistingJointList';

export {
  getFocusedJointForEditing,
  getJointFormContextPairIds,
  getJointPanelContextMessage,
  orderSelectedJoineryEntities,
};

function JointEditor({ entities, orderedSelectedEntities, editingJoint, onClose, onJointAdd, onJointUpdate }) {
  const [formState, setFormState] = useState(() =>
    buildJointFormState(entities, orderedSelectedEntities, editingJoint),
  );
  const formContextPairIds = getJointFormContextPairIds(editingJoint, orderedSelectedEntities);
  const candidateDraftJoint = useMemo(() => buildJointFromForm(formState), [formState]);
  const candidateResolution = useMemo(
    () => resolveSketchJoinery(entities, [candidateDraftJoint]),
    [candidateDraftJoint, entities],
  );
  const candidateJoint = candidateResolution.joints[0] || candidateDraftJoint;
  const candidateDiagnostic = candidateResolution.diagnostics[0] || null;

  const handleSubmit = useCallback(() => {
    if (
      !candidateDiagnostic ||
      candidateDiagnostic.status === 'invalid' ||
      candidateDiagnostic.status === 'disabled' ||
      candidateDiagnostic.canApply === false
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

    onClose?.();
  }, [candidateDiagnostic, candidateDraftJoint, editingJoint, onClose, onJointAdd, onJointUpdate]);

  return (
    <JointForm
      entities={entities}
      selectedEntities={orderedSelectedEntities}
      formState={formState}
      setFormState={setFormState}
      candidateJoint={candidateJoint}
      candidateDiagnostic={candidateDiagnostic}
      contextPairIds={formContextPairIds}
      isEditingExistingJoint={Boolean(editingJoint)}
      onSubmit={handleSubmit}
      onCancel={editingJoint ? onClose : null}
      submitLabel={editingJoint ? 'Save Joint' : 'Apply Joint'}
    />
  );
}

export default function JointPanel({
  entities,
  selectedEntity,
  selectedEntities = [],
  selectedIds = [],
  joints = [],
  diagnostics = [],
  focusedJointId,
  editingJointId,
  onClearFocusedJoint,
  onEditJoint,
  onClearEditingJoint,
  onJointAdd,
  onJointUpdate,
  onJointRemove,
}) {
  const orderedSelectedEntities = useMemo(
    () => orderSelectedJoineryEntities(entities, selectedEntities, selectedIds),
    [entities, selectedEntities, selectedIds],
  );
  const editablePair = isSketchJointPairSupported(orderedSelectedEntities);
  const editingJoint = getFocusedJointForEditing(joints, editingJointId);
  const formContextPairIds = getJointFormContextPairIds(editingJoint, orderedSelectedEntities);
  const editorKey = editingJoint
    ? `joint:${editingJoint.id}`
    : `selection:${orderedSelectedEntities.map((entity) => entity.id).join('|')}`;

  const handleEdit = useCallback(
    (joint) => {
      onEditJoint?.(joint.id);
      if (focusedJointId && focusedJointId !== joint.id) {
        onClearFocusedJoint?.();
      }
    },
    [focusedJointId, onClearFocusedJoint, onEditJoint],
  );

  const handleEditorClose = () => {
    onClearEditingJoint?.();
    if (focusedJointId === editingJoint?.id) {
      onClearFocusedJoint?.();
    }
  };

  const contextMessage = getJointPanelContextMessage({
    editingJoint,
    formContextPairIds,
    editablePair,
    orderedSelectedEntities,
    selectedEntity,
  });

  return (
    <div className={styles.jointPanel}>
      <p className={styles.jointContext}>{contextMessage}</p>

      {editablePair || editingJoint ? (
        <JointEditor
          key={editorKey}
          entities={entities}
          orderedSelectedEntities={orderedSelectedEntities}
          editingJoint={editingJoint}
          onClose={handleEditorClose}
          onJointAdd={onJointAdd}
          onJointUpdate={onJointUpdate}
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
        focusedJointId={focusedJointId}
        onEdit={handleEdit}
        onToggle={(joint) => onJointUpdate?.(joint.id, { enabled: joint.enabled === false })}
        onRemove={onJointRemove}
      />
    </div>
  );
}
