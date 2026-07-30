import { memo } from 'react';
import { countObjectsInProjectPhase } from '@/domain/phaseAssignments';
import InputField from '../InputField';
import styles from '../PropertiesPanel.module.css';

function PhaseProperties({ phase, project, dispatch }) {
  const updatePhase = (updates) => {
    dispatch({ type: 'PHASE_UPDATE', phase: { id: phase.id, ...updates } });
  };

  return (
    <div>
      <div className={styles.title}>Phase</div>
      <InputField label="Name" value={phase.name} onChange={(value) => updatePhase({ name: value })} />
      <div className={styles.colorField}>
        <label className={styles.colorLabel}>Color</label>
        <div className={styles.colorControls}>
          <input
            className={styles.colorPicker}
            type="color"
            value={phase.color}
            onChange={(e) => updatePhase({ color: e.target.value })}
            aria-label="Phase color"
          />
          <input
            className={styles.colorHexInput}
            type="text"
            value={phase.color}
            onChange={(e) => {
              const hex = e.target.value;
              if (/^#[0-9a-fA-F]{6}$/.test(hex)) updatePhase({ color: hex });
            }}
            onBlur={(e) => {
              let hex = e.target.value.trim();
              if (!hex.startsWith('#')) hex = '#' + hex;
              if (/^#[0-9a-fA-F]{6}$/.test(hex)) updatePhase({ color: hex });
            }}
          />
        </div>
      </div>
      <InputField label="Order" value={phase.order} readOnly />
      <InputField label="Objects" value={countObjectsInProjectPhase(project, phase.id)} readOnly />
    </div>
  );
}

export default memo(PhaseProperties);
