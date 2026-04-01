import { useMemo, useState } from 'react';
import joints, { getJointsForConnection, computeFingerJointParams } from '../data/joints';
import { getMaterialById } from '../data/materials';
import styles from '../styles/craftsman.module.css';

export default function JointPanel({ selectedEntity, entities }) {
  const [selectedJointId, setSelectedJointId] = useState(null);

  const material = selectedEntity?.materialId ? getMaterialById(selectedEntity.materialId) : null;
  const thickness = selectedEntity?.thickness ?? material?.thickness ?? 0;
  const category = material?.category ?? 'lumber';

  const availableJoints = useMemo(
    () => thickness > 0 ? getJointsForConnection(thickness, category) : [],
    [thickness, category],
  );

  const selectedJoint = availableJoints.find((j) => j.id === selectedJointId) ?? availableJoints[0] ?? null;

  const fingerParams = useMemo(() => {
    if (!selectedJoint || selectedJoint.id !== 'finger' || !selectedEntity) return null;
    const length = selectedEntity.width ?? selectedEntity.height ?? 300;
    return computeFingerJointParams(thickness, length);
  }, [selectedJoint, selectedEntity, thickness]);

  if (!selectedEntity) {
    return (
      <div className={styles.jointPanel}>
        <h3 className={styles.panelTitle}>Joint Library</h3>
        <p className={styles.emptyMessage}>Select an entity with material to see joint recommendations.</p>
      </div>
    );
  }

  if (!thickness) {
    return (
      <div className={styles.jointPanel}>
        <h3 className={styles.panelTitle}>Joint Library</h3>
        <p className={styles.emptyMessage}>Assign a material first to get joint recommendations.</p>
      </div>
    );
  }

  return (
    <div className={styles.jointPanel}>
      <h3 className={styles.panelTitle}>Joint Library</h3>
      <p className={styles.hint}>{thickness}mm {category} — {availableJoints.length} joints available</p>

      <div className={styles.jointList}>
        {availableJoints.map((joint) => (
          <button
            key={joint.id}
            type="button"
            className={`${styles.jointCard} ${selectedJoint?.id === joint.id ? styles.jointCardActive : ''}`}
            onClick={() => setSelectedJointId(joint.id)}
          >
            <span className={styles.jointIcon}>{joint.icon}</span>
            <div className={styles.jointCardInfo}>
              <span className={styles.jointName}>{joint.name}</span>
              <span className={styles.jointMeta}>
                {joint.strength} strength · {joint.difficulty}
                {joint.cncFriendly && ' · CNC'}
              </span>
            </div>
          </button>
        ))}
      </div>

      {selectedJoint && (
        <div className={styles.jointDetail}>
          <p className={styles.jointDescription}>{selectedJoint.description}</p>

          {fingerParams && (
            <div className={styles.jointParams}>
              <div className={styles.jointParam}>
                <span className={styles.jointParamLabel}>Finger width</span>
                <span className={styles.jointParamValue}>{fingerParams.fingerWidth}mm</span>
              </div>
              <div className={styles.jointParam}>
                <span className={styles.jointParamLabel}>Finger count</span>
                <span className={styles.jointParamValue}>{fingerParams.fingerCount}</span>
              </div>
              <div className={styles.jointParam}>
                <span className={styles.jointParamLabel}>Finger depth</span>
                <span className={styles.jointParamValue}>{fingerParams.fingerDepth}mm</span>
              </div>

              <div className={styles.fingerPreview}>
                <svg width="100%" height="40" viewBox="0 0 200 40">
                  {Array.from({ length: Math.min(Math.max(fingerParams.fingerCount, 1), 15) }, (_, i) => {
                    const fw = 200 / Math.min(Math.max(fingerParams.fingerCount, 1), 15);
                    return i % 2 === 0 ? (
                      <rect key={i} x={i * fw} y="0" width={fw} height="20" fill="#f5a623" fillOpacity="0.6" stroke="#f5a623" strokeWidth="0.5" />
                    ) : (
                      <rect key={i} x={i * fw} y="20" width={fw} height="20" fill="#4a9eff" fillOpacity="0.6" stroke="#4a9eff" strokeWidth="0.5" />
                    );
                  })}
                </svg>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
