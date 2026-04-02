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

function FingerPreview({ fingerParams }) {
  const count = Math.min(Math.max(fingerParams.fingerCount, 1), 15);
  const fw = 200 / count;
  return (
    <div className={styles.jointPreview}>
      <svg width="100%" height="40" viewBox="0 0 200 40">
        {Array.from({ length: count }, (_, i) => (
          i % 2 === 0 ? (
            <rect key={i} x={i * fw} y="0" width={fw} height="20" fill="#d4856b" fillOpacity="0.6" stroke="#d4856b" strokeWidth="0.5" />
          ) : (
            <rect key={i} x={i * fw} y="20" width={fw} height="20" fill="#4a9eff" fillOpacity="0.6" stroke="#4a9eff" strokeWidth="0.5" />
          )
        ))}
      </svg>
      <span className={styles.jointPreviewLegend}>
        <span style={{ color: '#d4856b' }}>Board A</span> interlocks with <span style={{ color: '#4a9eff' }}>Board B</span>
      </span>
    </div>
  );
}

function DovetailPreview() {
  return (
    <div className={styles.jointPreview}>
      <svg width="100%" height="50" viewBox="0 0 200 50">
        {/* Board A — tails (trapezoids) */}
        <polygon points="10,0 30,0 25,22 15,22" fill="#d4856b" fillOpacity="0.6" stroke="#d4856b" strokeWidth="0.5" />
        <polygon points="50,0 70,0 65,22 55,22" fill="#d4856b" fillOpacity="0.6" stroke="#d4856b" strokeWidth="0.5" />
        <polygon points="90,0 110,0 105,22 95,22" fill="#d4856b" fillOpacity="0.6" stroke="#d4856b" strokeWidth="0.5" />
        <polygon points="130,0 150,0 145,22 135,22" fill="#d4856b" fillOpacity="0.6" stroke="#d4856b" strokeWidth="0.5" />
        <polygon points="170,0 190,0 185,22 175,22" fill="#d4856b" fillOpacity="0.6" stroke="#d4856b" strokeWidth="0.5" />
        {/* Board B — pins (inverted trapezoids) */}
        <polygon points="25,28 55,28 50,50 30,50" fill="#4a9eff" fillOpacity="0.6" stroke="#4a9eff" strokeWidth="0.5" />
        <polygon points="65,28 95,28 90,50 70,50" fill="#4a9eff" fillOpacity="0.6" stroke="#4a9eff" strokeWidth="0.5" />
        <polygon points="105,28 135,28 130,50 110,50" fill="#4a9eff" fillOpacity="0.6" stroke="#4a9eff" strokeWidth="0.5" />
        <polygon points="145,28 175,28 170,50 150,50" fill="#4a9eff" fillOpacity="0.6" stroke="#4a9eff" strokeWidth="0.5" />
      </svg>
      <span className={styles.jointPreviewLegend}>
        Tapered <span style={{ color: '#d4856b' }}>tails</span> lock into <span style={{ color: '#4a9eff' }}>pins</span>
      </span>
    </div>
  );
}

function DadoPreview({ thickness }) {
  const depth = Math.round(thickness * 0.33);
  return (
    <div className={styles.jointPreview}>
      <svg width="100%" height="60" viewBox="0 0 200 60">
        {/* Side panel */}
        <rect x="10" y="5" width="180" height="22" fill="#d4856b" fillOpacity="0.5" stroke="#d4856b" strokeWidth="0.5" rx="1" />
        {/* Dado channel cut into side panel */}
        <rect x="85" y="17" width="30" height="10" fill="#1a1a2e" stroke="#d4856b" strokeWidth="0.5" strokeDasharray="2,2" />
        {/* Shelf sliding in */}
        <rect x="85" y="30" width="30" height="25" fill="#4a9eff" fillOpacity="0.5" stroke="#4a9eff" strokeWidth="0.5" rx="1" />
        {/* Arrow showing insertion */}
        <line x1="100" y1="58" x2="100" y2="32" stroke="#4a9eff" strokeWidth="1" markerEnd="url(#arrowDado)" />
        <defs>
          <marker id="arrowDado" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
            <path d="M0,0 L6,2 L0,4" fill="#4a9eff" />
          </marker>
        </defs>
      </svg>
      <span className={styles.jointPreviewLegend}>
        <span style={{ color: '#4a9eff' }}>Shelf</span> slides into <span style={{ color: '#d4856b' }}>channel</span> ({depth}mm deep)
      </span>
    </div>
  );
}

function RabbetPreview({ thickness }) {
  const w = Math.round(thickness * 0.67);
  const d = Math.round(thickness * 0.5);
  return (
    <div className={styles.jointPreview}>
      <svg width="100%" height="55" viewBox="0 0 200 55">
        {/* Main board */}
        <rect x="10" y="5" width="80" height="45" fill="#d4856b" fillOpacity="0.5" stroke="#d4856b" strokeWidth="0.5" rx="1" />
        {/* L-shaped rabbet cut — show the step */}
        <rect x="70" y="5" width="20" height="22" fill="#1a1a2e" stroke="#d4856b" strokeWidth="0.5" strokeDasharray="2,2" />
        {/* Back panel fitting into the rabbet */}
        <rect x="70" y="5" width="20" height="45" fill="#4a9eff" fillOpacity="0.4" stroke="#4a9eff" strokeWidth="0.5" rx="1" />
        {/* Dimension lines */}
        <line x1="95" y1="5" x2="95" y2="27" stroke="#888" strokeWidth="0.5" />
        <text x="100" y="18" fill="#888" fontSize="7" fontFamily="monospace">{d}mm</text>
        <line x1="70" y1="2" x2="90" y2="2" stroke="#888" strokeWidth="0.5" />
        <text x="72" y="0" fill="#888" fontSize="7" fontFamily="monospace">{w}mm</text>
      </svg>
      <span className={styles.jointPreviewLegend}>
        <span style={{ color: '#4a9eff' }}>Back panel</span> sits in <span style={{ color: '#d4856b' }}>L-step</span>
      </span>
    </div>
  );
}

function PocketHolePreview({ thickness }) {
  const screwLen = thickness <= 19 ? 25 : 32;
  return (
    <div className={styles.jointPreview}>
      <svg width="100%" height="55" viewBox="0 0 200 55">
        {/* Bottom board */}
        <rect x="10" y="30" width="180" height="20" fill="#d4856b" fillOpacity="0.5" stroke="#d4856b" strokeWidth="0.5" rx="1" />
        {/* Top board (face) */}
        <rect x="100" y="5" width="20" height="25" fill="#4a9eff" fillOpacity="0.5" stroke="#4a9eff" strokeWidth="0.5" rx="1" />
        {/* Pocket hole angled line */}
        <line x1="60" y1="48" x2="105" y2="18" stroke="#51cf66" strokeWidth="1.5" strokeDasharray="3,2" />
        {/* Screw head dot */}
        <circle cx="60" cy="48" r="3" fill="#51cf66" fillOpacity="0.8" />
        {/* Angle arc */}
        <path d="M60,30 A12,12 0 0,1 68,34" fill="none" stroke="#888" strokeWidth="0.5" />
        <text x="70" y="36" fill="#888" fontSize="7" fontFamily="monospace">15&deg;</text>
      </svg>
      <span className={styles.jointPreviewLegend}>
        <span style={{ color: '#51cf66' }}>{screwLen}mm screw</span> at 15° through <span style={{ color: '#d4856b' }}>board</span> into <span style={{ color: '#4a9eff' }}>face</span>
      </span>
    </div>
  );
}

function BiscuitPreview({ thickness }) {
  const size = thickness >= 20 ? '#20' : thickness >= 15 ? '#10' : '#0';
  return (
    <div className={styles.jointPreview}>
      <svg width="100%" height="50" viewBox="0 0 200 50">
        {/* Left board */}
        <rect x="10" y="5" width="80" height="40" fill="#d4856b" fillOpacity="0.5" stroke="#d4856b" strokeWidth="0.5" rx="1" />
        {/* Right board */}
        <rect x="110" y="5" width="80" height="40" fill="#4a9eff" fillOpacity="0.5" stroke="#4a9eff" strokeWidth="0.5" rx="1" />
        {/* Biscuit in the middle — ellipse shape */}
        <ellipse cx="100" cy="16" rx="14" ry="5" fill="#51cf66" fillOpacity="0.7" stroke="#51cf66" strokeWidth="0.5" />
        <ellipse cx="100" cy="34" rx="14" ry="5" fill="#51cf66" fillOpacity="0.7" stroke="#51cf66" strokeWidth="0.5" />
        {/* Slot lines */}
        <line x1="86" y1="16" x2="90" y2="16" stroke="#d4856b" strokeWidth="1" />
        <line x1="110" y1="16" x2="114" y2="16" stroke="#4a9eff" strokeWidth="1" />
        <line x1="86" y1="34" x2="90" y2="34" stroke="#d4856b" strokeWidth="1" />
        <line x1="110" y1="34" x2="114" y2="34" stroke="#4a9eff" strokeWidth="1" />
      </svg>
      <span className={styles.jointPreviewLegend}>
        <span style={{ color: '#51cf66' }}>{size} biscuits</span> align <span style={{ color: '#d4856b' }}>board</span> to <span style={{ color: '#4a9eff' }}>board</span>
      </span>
    </div>
  );
}

function ButtPreview() {
  return (
    <div className={styles.jointPreview}>
      <svg width="100%" height="50" viewBox="0 0 200 50">
        {/* Horizontal board */}
        <rect x="10" y="25" width="180" height="20" fill="#d4856b" fillOpacity="0.5" stroke="#d4856b" strokeWidth="0.5" rx="1" />
        {/* Vertical board butting against it */}
        <rect x="90" y="2" width="20" height="23" fill="#4a9eff" fillOpacity="0.5" stroke="#4a9eff" strokeWidth="0.5" rx="1" />
        {/* Screw indicators */}
        <circle cx="96" cy="36" r="2" fill="#888" fillOpacity="0.6" />
        <circle cx="104" cy="36" r="2" fill="#888" fillOpacity="0.6" />
        {/* Glue line */}
        <line x1="90" y1="25" x2="110" y2="25" stroke="#51cf66" strokeWidth="1.5" strokeDasharray="2,2" />
      </svg>
      <span className={styles.jointPreviewLegend}>
        <span style={{ color: '#4a9eff' }}>End</span> meets <span style={{ color: '#d4856b' }}>face</span> — <span style={{ color: '#51cf66' }}>glue</span> + screws
      </span>
    </div>
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
            <>
              <p className={styles.jointHowTo}>
                Set your CNC/table saw to cut <strong>{fingerParams.fingerWidth}mm</strong> wide fingers,
                <strong> {fingerParams.fingerDepth}mm</strong> deep.
                You need <strong>{fingerParams.fingerCount}</strong> fingers along the {Math.round(selectedEntity.width || selectedEntity.height || 300)}mm edge.
              </p>
              <FingerPreview fingerParams={fingerParams} />
            </>
          )}

          {selectedJoint.id === 'dovetail' && (
            <>
              <p className={styles.jointHowTo}>
                Cut tails at <strong>14 degrees</strong> (1:4 ratio for softwood, 1:6 for hardwood).
                The interlocking shape resists pulling apart — the strongest traditional joint.
              </p>
              <DovetailPreview />
            </>
          )}

          {selectedJoint.id === 'dado' && (
            <>
              <p className={styles.jointHowTo}>
                Cut a channel <strong>{Math.round(thickness * 0.33)}mm</strong> deep across the side panel.
                The shelf slides into this groove for a strong, aligned fit.
              </p>
              <DadoPreview thickness={thickness} />
            </>
          )}

          {selectedJoint.id === 'rabbet' && (
            <>
              <p className={styles.jointHowTo}>
                Cut an L-shaped step: <strong>{Math.round(thickness * 0.67)}mm</strong> wide,
                <strong> {Math.round(thickness * 0.5)}mm</strong> deep along the edge.
                Great for attaching back panels flush with the sides.
              </p>
              <RabbetPreview thickness={thickness} />
            </>
          )}

          {selectedJoint.id === 'pocket-hole' && (
            <>
              <p className={styles.jointHowTo}>
                Drill pocket holes at <strong>15 degrees</strong> into the hidden face.
                Use {thickness <= 19 ? '25mm' : '32mm'} pocket screws.
                Fast assembly — no clamping needed.
              </p>
              <PocketHolePreview thickness={thickness} />
            </>
          )}

          {selectedJoint.id === 'biscuit' && (
            <>
              <p className={styles.jointHowTo}>
                Use <strong>#{thickness >= 20 ? '20' : thickness >= 15 ? '10' : '0'}</strong> biscuits.
                Cut matching slots 12mm deep in both pieces.
                Provides excellent alignment during glue-up.
              </p>
              <BiscuitPreview thickness={thickness} />
            </>
          )}

          {selectedJoint.id === 'butt' && (
            <>
              <p className={styles.jointHowTo}>
                The simplest joint — just glue and screw the two faces together.
                Reinforce with corner brackets or pocket screws for strength.
              </p>
              <ButtPreview />
            </>
          )}
        </div>
      )}
    </div>
  );
}
