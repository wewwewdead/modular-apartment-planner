import { memo } from 'react';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';

function DoorProperties({ door, wall, dispatch, floorId, u, phases }) {
  const updateDoor = (updates) => {
    dispatch({ type: 'DOOR_UPDATE', floorId, door: { id: door.id, ...updates } });
  };

  const doorType = door.type || 'swing';
  const ventilation = {
    operable: door.ventilation?.operable ?? true,
    openFraction: door.ventilation?.openFraction ?? 0,
    dischargeCoefficient: door.ventilation?.dischargeCoefficient ?? 0.62,
  };
  const updateVentilation = (updates) => updateDoor({ ventilation: { ...ventilation, ...updates } });

  return (
    <div>
      <div className={styles.title}>Door</div>
      <PhaseSelector phaseId={door.phaseId} phases={phases} onChange={(v) => updateDoor({ phaseId: v })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Type</label>
        <select
          value={doorType}
          onChange={(e) => updateDoor({ type: e.target.value })}
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
          <option value="swing">Swing</option>
          <option value="double">Double</option>
          <option value="sliding">Sliding</option>
        </select>
      </div>
      <InputField
        label="Width"
        type="number"
        suffix={u.suffix}
        step={u.step(50)}
        value={u.toDisplay(door.width)}
        onChange={(v) => updateDoor({ width: Math.max(400, u.fromDisplay(v)) })}
      />
      <InputField
        label="Height"
        type="number"
        suffix={u.suffix}
        step={u.step(50)}
        value={u.toDisplay(door.height)}
        onChange={(v) => updateDoor({ height: Math.max(300, u.fromDisplay(v)) })}
      />
      <InputField
        label="Sill"
        type="number"
        suffix={u.suffix}
        step={u.step(50)}
        value={u.toDisplay(door.sillHeight)}
        onChange={(v) => updateDoor({ sillHeight: u.fromDisplay(v) })}
      />
      <InputField
        label="Offset"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(door.offset)}
        onChange={(v) => updateDoor({ offset: Math.max(0, u.fromDisplay(v)) })}
      />
      {doorType !== 'double' && (
        <>
          <InputField
            label={doorType === 'sliding' ? 'Slide Dir' : 'Swing'}
            value={door.openDirection}
            readOnly={false}
            onChange={() =>
              updateDoor({
                openDirection: door.openDirection === 'left' ? 'right' : 'left',
              })
            }
          />
          <button
            className={styles.actionBtn}
            onClick={() =>
              updateDoor({
                openDirection: door.openDirection === 'left' ? 'right' : 'left',
              })
            }
          >
            {doorType === 'sliding' ? 'Toggle Slide Direction' : 'Toggle Swing Direction'}
          </button>
        </>
      )}
      <div className={styles.subtitle}>Natural Ventilation</div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
          color: 'var(--color-text-secondary)',
          fontSize: '12px',
        }}
      >
        <input
          type="checkbox"
          checked={ventilation.operable}
          onChange={(event) => updateVentilation({ operable: event.target.checked })}
        />
        Participates in airflow model
      </label>
      <InputField
        label="Open Fraction"
        type="number"
        suffix="%"
        step={5}
        value={Math.round(ventilation.openFraction * 100)}
        readOnly={!ventilation.operable}
        onChange={(value) => updateVentilation({ openFraction: Math.min(1, Math.max(0, value / 100)) })}
      />
      <InputField
        label="Discharge Cd"
        type="number"
        step={0.01}
        value={ventilation.dischargeCoefficient}
        readOnly={!ventilation.operable}
        onChange={(value) => updateVentilation({ dischargeCoefficient: Math.min(1, Math.max(0.05, value)) })}
      />
      {wall && <InputField label="Wall" value={wall.id.split('_').pop()} readOnly />}
    </div>
  );
}

export default memo(DoorProperties);
