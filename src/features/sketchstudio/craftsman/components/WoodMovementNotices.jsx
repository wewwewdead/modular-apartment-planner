import { useMemo } from 'react';
import { buildWoodMovementDiagnostics } from '../physics/woodMovement';
import styles from '../styles/craftsman.module.css';

/**
 * Seasonal-movement warnings, rendered in the joint panel beside the joint
 * diagnostics they are about.
 *
 * These are a property of the JOINT GRAPH, not of any one joint: the failure
 * only exists because two separate joints happen to capture opposite edges of
 * the same solid panel, and neither of them is individually wrong. So they sit
 * next to the joint list rather than inside a joint's own warning list, and use
 * the same card and status vocabulary so a maker reads them the same way.
 */
export default function WoodMovementNotices({ entities = [], joints = [] }) {
  const diagnostics = useMemo(() => buildWoodMovementDiagnostics(entities, joints), [entities, joints]);

  if (!diagnostics.length) {
    return null;
  }

  return (
    <div className={styles.jointExistingList}>
      {diagnostics.map((diagnostic) => (
        <div key={diagnostic.partId} className={styles.jointExistingCard}>
          <div className={styles.jointExistingHeader}>
            <div>
              <div className={styles.jointName}>Wood movement — {diagnostic.partId}</div>
              <div className={styles.jointMeta}>
                {diagnostic.materialName} · {diagnostic.crossGrainDimensionMm}mm across the grain · captured at the{' '}
                {diagnostic.edgeKeys.join(' and ')} edges
              </div>
            </div>
            <span className={`${styles.jointStatus} ${styles.jointStatusWarning}`}>{diagnostic.statusLabel}</span>
          </div>
          <p className={styles.jointDescription}>{diagnostic.message}</p>
        </div>
      ))}
    </div>
  );
}
