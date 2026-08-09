import { memo } from 'react';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';
import { NumberField, Readout, Section, SelectField, Stack, panelKitStyles } from './PanelKit';

const DOOR_TYPES = [
  { value: 'swing', label: 'Swing' },
  { value: 'double', label: 'Double' },
  { value: 'sliding', label: 'Sliding' },
];

function DoorProperties({ door, wall, dispatch, floorId, u, phases }) {
  const updateDoor = (updates) => {
    dispatch({ type: 'DOOR_UPDATE', floorId, door: { id: door.id, ...updates } });
  };

  const doorType = door.type || 'swing';
  const swings = doorType !== 'double';
  const flip = () => updateDoor({ openDirection: door.openDirection === 'left' ? 'right' : 'left' });

  return (
    <div className={panelKitStyles.gutter}>
      <PhaseSelector phaseId={door.phaseId} phases={phases} onChange={(v) => updateDoor({ phaseId: v })} />

      <Section id="door.leaf" title="Leaf" summary={`${u.toDisplay(door.width)} × ${u.toDisplay(door.height)}`}>
        <SelectField label="Type" value={doorType} onChange={(type) => updateDoor({ type })}>
          {DOOR_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <NumberField
          label="Width"
          value={u.toDisplay(door.width)}
          step={u.step(50)}
          unit={u.suffix}
          onChange={(v) => updateDoor({ width: Math.max(400, u.fromDisplay(v)) })}
        />
        <NumberField
          label="Height"
          value={u.toDisplay(door.height)}
          step={u.step(50)}
          unit={u.suffix}
          onChange={(v) => updateDoor({ height: Math.max(300, u.fromDisplay(v)) })}
        />
        {/*
         * One control per action. This used to be a text input that looked
         * editable, silently discarded whatever you typed, and flipped the
         * value instead — with a button doing the identical thing beneath it.
         */}
        {swings ? (
          <Stack>
            <button type="button" className={styles.actionBtn} onClick={flip}>
              {doorType === 'sliding' ? 'Slides from' : 'Swings from'} {door.openDirection} — flip
            </button>
          </Stack>
        ) : null}
      </Section>

      <Section
        id="door.placement"
        title="Placement"
        defaultOpen={false}
        summary={`${u.toDisplay(door.offset)} along wall`}
      >
        <NumberField
          label="Along wall"
          value={u.toDisplay(door.offset)}
          unit={u.suffix}
          onChange={(v) => updateDoor({ offset: Math.max(0, u.fromDisplay(v)) })}
        />
        <NumberField
          label="Sill"
          value={u.toDisplay(door.sillHeight)}
          step={u.step(50)}
          unit={u.suffix}
          onChange={(v) => updateDoor({ sillHeight: u.fromDisplay(v) })}
        />
        {wall ? <Readout label="Host wall" value={wall.id.split('_').pop()} muted /> : null}
      </Section>
    </div>
  );
}

export default memo(DoorProperties);
