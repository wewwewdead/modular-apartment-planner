import { useEffect, useMemo, useRef } from 'react';
import styles from '../styles/craftsman.module.css';
import { getSketchJointSummary, listSketchJointEntityIds } from '../../utils/sketchJoineryUtils';
import { getJointStatusClassName } from './jointPanelHelpers';

function JointStatus({ diagnostic }) {
  if (!diagnostic) {
    return null;
  }

  return (
    <span className={`${styles.jointStatus} ${getJointStatusClassName(diagnostic)}`}>{diagnostic.statusLabel}</span>
  );
}

export default function ExistingJointList({
  joints,
  diagnostics,
  selectedIds,
  focusedJointId,
  onEdit,
  onToggle,
  onRemove,
}) {
  const cardRefs = useRef({});

  useEffect(() => {
    if (!focusedJointId) {
      return;
    }

    cardRefs.current[focusedJointId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focusedJointId]);

  const entries = useMemo(
    () =>
      joints
        .map((joint) => ({
          joint,
          diagnostic: diagnostics.find((item) => item.jointId === joint.id) || null,
          relevant:
            !selectedIds.length || listSketchJointEntityIds(joint).some((entityId) => selectedIds.includes(entityId)),
        }))
        .sort((left, right) => Number(right.relevant) - Number(left.relevant)),
    [diagnostics, joints, selectedIds],
  );

  if (!entries.length) {
    return (
      <p className={styles.emptyMessage}>
        No joints yet. Select two rectangular parts, choose a joint type, and let automatic detection resolve the active
        mating region.
      </p>
    );
  }

  return (
    <div className={styles.jointExistingList}>
      {entries.map(({ joint, diagnostic, relevant }) => (
        <div
          key={joint.id}
          ref={(el) => {
            cardRefs.current[joint.id] = el;
          }}
          className={`${styles.jointExistingCard} ${relevant ? styles.jointExistingCardActive : ''} ${focusedJointId === joint.id ? styles.jointExistingCardFocused : ''}`}
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
