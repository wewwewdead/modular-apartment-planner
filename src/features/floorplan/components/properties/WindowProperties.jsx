import { memo } from 'react';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';

function WindowProperties({ window: win, wall, dispatch, floorId, u, phases }) {
  const updateWindow = (updates) => {
    dispatch({ type: 'WINDOW_UPDATE', floorId, window: { id: win.id, ...updates } });
  };

  const winType = win.type || 'standard';
  const fixed = winType === 'fixed';
  const ventilation = {
    operable: fixed ? false : (win.ventilation?.operable ?? true),
    openFraction: fixed ? 0 : (win.ventilation?.openFraction ?? 0.5),
    dischargeCoefficient: win.ventilation?.dischargeCoefficient ?? 0.62,
  };
  const updateVentilation = (updates) => updateWindow({ ventilation: { ...ventilation, ...updates } });

  return (
    <div>
      <div className={styles.title}>Window</div>
      <PhaseSelector phaseId={win.phaseId} phases={phases} onChange={(v) => updateWindow({ phaseId: v })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <label style={{ flex: '0 0 80px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Type</label>
        <select
          value={winType}
          onChange={(e) => updateWindow({ type: e.target.value })}
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
          <option value="standard">Standard</option>
          <option value="casement">Casement</option>
          <option value="awning">Awning</option>
          <option value="fixed">Fixed</option>
          <option value="jalousie">Jalousie</option>
        </select>
      </div>
      <InputField
        label="Width"
        type="number"
        suffix={u.suffix}
        step={u.step(50)}
        value={u.toDisplay(win.width)}
        onChange={(v) => updateWindow({ width: Math.max(300, u.fromDisplay(v)) })}
      />
      <InputField
        label="Height"
        type="number"
        suffix={u.suffix}
        step={u.step(50)}
        value={u.toDisplay(win.height)}
        onChange={(v) => updateWindow({ height: Math.max(300, u.fromDisplay(v)) })}
      />
      <InputField
        label="Sill Height"
        type="number"
        suffix={u.suffix}
        step={u.step(50)}
        value={u.toDisplay(win.sillHeight)}
        onChange={(v) => updateWindow({ sillHeight: u.fromDisplay(v) })}
      />
      <InputField
        label="Wall Offset"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(win.offset)}
        onChange={(v) => updateWindow({ offset: Math.max(0, u.fromDisplay(v)) })}
      />
      {(winType === 'casement' || winType === 'awning') && (
        <button
          className={styles.actionBtn}
          onClick={() =>
            updateWindow({
              openDirection: win.openDirection === 'left' ? 'right' : 'left',
            })
          }
        >
          Toggle Open Side
        </button>
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
          disabled={fixed}
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
        readOnly={fixed || !ventilation.operable}
        onChange={(value) => updateVentilation({ openFraction: Math.min(1, Math.max(0, value / 100)) })}
      />
      <InputField
        label="Discharge Cd"
        type="number"
        step={0.01}
        value={ventilation.dischargeCoefficient}
        readOnly={fixed || !ventilation.operable}
        onChange={(value) => updateVentilation({ dischargeCoefficient: Math.min(1, Math.max(0.05, value)) })}
      />
      {wall && <InputField label="Wall" value={wall.id.split('_').pop()} readOnly />}
    </div>
  );
}

export default memo(WindowProperties);
