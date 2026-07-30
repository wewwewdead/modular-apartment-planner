import { memo } from 'react';
import { railingLength } from '@/geometry/railingGeometry';
import { RAILING_TYPES } from '@/editor/tools';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';

function RailingProperties({ railing, dispatch, floorId, u, phases }) {
  const updateRailing = (updates) => {
    dispatch({ type: 'RAILING_UPDATE', floorId, railing: { id: railing.id, ...updates } });
  };
  const len = railingLength(railing);

  return (
    <div>
      <div className={styles.title}>Railing</div>
      <PhaseSelector phaseId={railing.phaseId} phases={phases} onChange={(v) => updateRailing({ phaseId: v })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Type</label>
        <select
          value={railing.type}
          onChange={(e) => updateRailing({ type: e.target.value })}
          style={{
            flex: 1,
            height: '28px',
            padding: '0 4px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            background: 'var(--color-surface-elevated)',
          }}
        >
          <option value={RAILING_TYPES.GLASS}>Glass</option>
          <option value={RAILING_TYPES.HANDRAIL}>Handrail</option>
          <option value={RAILING_TYPES.GUARDRAIL}>Guardrail</option>
        </select>
      </div>
      <div className={styles.subtitle}>Start Point</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(railing.startPoint.x)}
        onChange={(value) =>
          updateRailing({
            startPoint: { ...railing.startPoint, x: u.fromDisplay(value) },
          })
        }
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(railing.startPoint.y)}
        onChange={(value) =>
          updateRailing({
            startPoint: { ...railing.startPoint, y: u.fromDisplay(value) },
          })
        }
      />
      <div className={styles.subtitle}>End Point</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(railing.endPoint.x)}
        onChange={(value) =>
          updateRailing({
            endPoint: { ...railing.endPoint, x: u.fromDisplay(value) },
          })
        }
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(railing.endPoint.y)}
        onChange={(value) =>
          updateRailing({
            endPoint: { ...railing.endPoint, y: u.fromDisplay(value) },
          })
        }
      />
      <div className={styles.subtitle}>Properties</div>
      <InputField
        label="Height"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(railing.height)}
        onChange={(value) => updateRailing({ height: Math.max(100, u.fromDisplay(value)) })}
      />
      <InputField
        label="Width"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(railing.width)}
        onChange={(value) => updateRailing({ width: Math.max(10, u.fromDisplay(value)) })}
      />
      <InputField label="Length" type="number" suffix={u.suffix} value={u.toDisplay(len)} readOnly />
    </div>
  );
}

export default memo(RailingProperties);
