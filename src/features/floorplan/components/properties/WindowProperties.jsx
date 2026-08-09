import { memo } from 'react';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';
import { NumberField, Readout, Section, SelectField, Stack, panelKitStyles } from './PanelKit';

const WINDOW_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'casement', label: 'Casement' },
  { value: 'awning', label: 'Awning' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'jalousie', label: 'Jalousie' },
];

function WindowProperties({ window: win, wall, dispatch, floorId, u, phases }) {
  const updateWindow = (updates) => {
    dispatch({ type: 'WINDOW_UPDATE', floorId, window: { id: win.id, ...updates } });
  };

  const winType = win.type || 'standard';
  const opens = winType === 'casement' || winType === 'awning';

  return (
    <div className={panelKitStyles.gutter}>
      <PhaseSelector phaseId={win.phaseId} phases={phases} onChange={(v) => updateWindow({ phaseId: v })} />

      <Section id="window.opening" title="Opening" summary={`${u.toDisplay(win.width)} × ${u.toDisplay(win.height)}`}>
        <SelectField label="Type" value={winType} onChange={(type) => updateWindow({ type })}>
          {WINDOW_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <NumberField
          label="Width"
          value={u.toDisplay(win.width)}
          step={u.step(50)}
          unit={u.suffix}
          onChange={(v) => updateWindow({ width: Math.max(300, u.fromDisplay(v)) })}
        />
        <NumberField
          label="Height"
          value={u.toDisplay(win.height)}
          step={u.step(50)}
          unit={u.suffix}
          onChange={(v) => updateWindow({ height: Math.max(300, u.fromDisplay(v)) })}
        />
        {opens ? (
          <Stack>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => updateWindow({ openDirection: win.openDirection === 'left' ? 'right' : 'left' })}
            >
              Opens from {win.openDirection || 'left'} — flip
            </button>
          </Stack>
        ) : null}
      </Section>

      <Section
        id="window.placement"
        title="Placement"
        defaultOpen={false}
        summary={`sill ${u.toDisplay(win.sillHeight)}`}
      >
        <NumberField
          label="Sill height"
          value={u.toDisplay(win.sillHeight)}
          step={u.step(50)}
          unit={u.suffix}
          onChange={(v) => updateWindow({ sillHeight: u.fromDisplay(v) })}
        />
        <NumberField
          label="Along wall"
          value={u.toDisplay(win.offset)}
          unit={u.suffix}
          onChange={(v) => updateWindow({ offset: Math.max(0, u.fromDisplay(v)) })}
        />
        {wall ? <Readout label="Host wall" value={wall.id.split('_').pop()} muted /> : null}
      </Section>
    </div>
  );
}

export default memo(WindowProperties);
