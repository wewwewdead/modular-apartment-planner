import { memo } from 'react';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';
import { ROOM_COLOR } from '@/domain/defaults';
import { SELECTABLE_ROOM_ZONES, hasCustomRoomColor, resolveRoomZone, zoneLabel } from '@/domain/roomZones';
import { SelectField, panelKitStyles } from './PanelKit';

const AUTO_ZONE = 'auto';

function RoomProperties({ room, dispatch, floorId, phases }) {
  const areaM2 = room.area ? (room.area / 1_000_000).toFixed(2) : '—';
  const updateRoom = (updates) => {
    dispatch({ type: 'ROOM_UPDATE', floorId, room: { id: room.id, ...updates } });
  };
  return (
    <div>
      <div className={styles.title}>Room</div>
      <PhaseSelector phaseId={room.phaseId} phases={phases} onChange={(v) => updateRoom({ phaseId: v })} />
      <InputField label="Name" value={room.name} onChange={(v) => updateRoom({ name: v })} />
      <InputField label="Area" suffix="m²" value={areaM2} readOnly />
      <div className={panelKitStyles.gutter}>
        {/* The floor tint on the presentation plan. Auto reads the room's
            program and its name; a custom fill below overrides either. */}
        <SelectField
          label="Zone"
          value={room.zone || AUTO_ZONE}
          onChange={(value) => updateRoom({ zone: value === AUTO_ZONE ? null : value })}
        >
          <option value={AUTO_ZONE}>{`Auto · ${zoneLabel(resolveRoomZone({ ...room, zone: null }))}`}</option>
          {SELECTABLE_ROOM_ZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zoneLabel(zone)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className={styles.colorField}>
        <label className={styles.colorLabel}>Custom fill</label>
        <div className={styles.colorControls}>
          <input
            className={styles.colorPicker}
            type="color"
            value={room.color}
            onChange={(e) => updateRoom({ color: e.target.value })}
            aria-label="Room color"
          />
          <input
            className={styles.colorHexInput}
            type="text"
            value={room.color}
            onChange={(e) => {
              const hex = e.target.value;
              if (/^#[0-9a-fA-F]{6}$/.test(hex)) updateRoom({ color: hex });
            }}
            onBlur={(e) => {
              let hex = e.target.value.trim();
              if (!hex.startsWith('#')) hex = '#' + hex;
              if (/^#[0-9a-fA-F]{6}$/.test(hex)) updateRoom({ color: hex });
            }}
          />
        </div>
      </div>
      {hasCustomRoomColor(room) ? (
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => updateRoom({ color: ROOM_COLOR })}
          title="Drop the custom fill and tint the floor by its zone"
        >
          Use zone colour
        </button>
      ) : null}
    </div>
  );
}

export default memo(RoomProperties);
