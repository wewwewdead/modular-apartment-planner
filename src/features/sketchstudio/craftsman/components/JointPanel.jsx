import { useMemo, useState } from 'react';
import joints, { getJointsForConnection, computeFingerJointParams } from '../data/joints';
import { getMaterialById } from '../data/materials';
import styles from '../styles/craftsman.module.css';

const STRENGTH_BARS = { 'low': 1, 'medium': 2, 'medium-high': 3, 'high': 4, 'very-high': 5 };

function StrengthMeter({ strength }) {
  const bars = STRENGTH_BARS[strength] ?? 2;
  return (
    <span className={styles.strengthMeter} title={`${strength} strength`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`${styles.strengthBar} ${i <= bars ? styles.strengthBarFilled : ''}`} />
      ))}
    </span>
  );
}

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
        <p className={styles.jointHelp}>
          <strong>What is this?</strong> When two pieces of wood meet, you need a joint.
          Select a part with material assigned, and this panel recommends the best joint
          type based on your material thickness — with exact measurements for your CNC or hand tools.
        </p>
      </div>
    );
  }

  if (!thickness) {
    return (
      <div className={styles.jointPanel}>
        <p className={styles.emptyMessage}>Assign a material first to get joint recommendations.</p>
      </div>
    );
  }

  return (
    <div className={styles.jointPanel}>
      <p className={styles.jointContext}>
        Your <strong>{Math.round(selectedEntity.width || 0)}x{Math.round(selectedEntity.height || 0)}mm</strong> {category} part ({thickness}mm thick) works with these joints:
      </p>

      <div className={styles.jointList}>
        {availableJoints.map((joint, i) => (
          <button
            key={joint.id}
            type="button"
            className={`${styles.jointCard} ${selectedJoint?.id === joint.id ? styles.jointCardActive : ''}`}
            onClick={() => setSelectedJointId(joint.id)}
          >
            <span className={styles.jointIcon}>{joint.icon}</span>
            <div className={styles.jointCardInfo}>
              <span className={styles.jointName}>
                {joint.name}
                {i === 0 && <span className={styles.recommendedBadge}>Best</span>}
              </span>
              <span className={styles.jointMeta}>
                <StrengthMeter strength={joint.strength} />
                <span>{joint.difficulty}</span>
                {joint.cncFriendly && <span className={styles.cncBadge}>CNC</span>}
              </span>
            </div>
          </button>
        ))}
      </div>

      {selectedJoint && (
        <div className={styles.jointDetail}>
          <p className={styles.jointDescription}>{selectedJoint.description}</p>

          {selectedJoint.id === 'finger' && fingerParams && (
            <div className={styles.jointParams}>
              <p className={styles.jointHowTo}>
                Set your CNC/table saw to cut <strong>{fingerParams.fingerWidth}mm</strong> wide fingers,
                <strong> {fingerParams.fingerDepth}mm</strong> deep.
                You need <strong>{fingerParams.fingerCount}</strong> fingers along the {Math.round(selectedEntity.width || selectedEntity.height || 300)}mm edge.
              </p>
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
                <span className={styles.fingerLegend}>
                  <span style={{ color: '#f5a623' }}>Board A</span> interlocks with <span style={{ color: '#4a9eff' }}>Board B</span>
                </span>
              </div>
            </div>
          )}

          {selectedJoint.id === 'dado' && (
            <p className={styles.jointHowTo}>
              Cut a channel <strong>{Math.round(thickness * 0.33)}mm</strong> deep across the side panel.
              The shelf slides into this groove for a strong, aligned fit.
            </p>
          )}

          {selectedJoint.id === 'rabbet' && (
            <p className={styles.jointHowTo}>
              Cut an L-shaped step: <strong>{Math.round(thickness * 0.67)}mm</strong> wide,
              <strong> {Math.round(thickness * 0.5)}mm</strong> deep along the edge.
              Great for attaching back panels flush with the sides.
            </p>
          )}

          {selectedJoint.id === 'pocket-hole' && (
            <p className={styles.jointHowTo}>
              Drill pocket holes at <strong>15 degrees</strong> into the hidden face.
              Use {thickness <= 19 ? '25mm' : '32mm'} pocket screws.
              Fast assembly — no clamping needed.
            </p>
          )}

          {selectedJoint.id === 'biscuit' && (
            <p className={styles.jointHowTo}>
              Use <strong>#{thickness >= 20 ? '20' : thickness >= 15 ? '10' : '0'}</strong> biscuits.
              Cut matching slots 12mm deep in both pieces.
              Provides excellent alignment during glue-up.
            </p>
          )}

          {selectedJoint.id === 'dovetail' && (
            <p className={styles.jointHowTo}>
              Cut tails at <strong>14 degrees</strong> (1:4 ratio for softwood, 1:6 for hardwood).
              The interlocking shape resists pulling apart — the strongest traditional joint.
            </p>
          )}

          {selectedJoint.id === 'butt' && (
            <p className={styles.jointHowTo}>
              The simplest joint — just glue and screw the two faces together.
              Reinforce with corner brackets or pocket screws for strength.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
