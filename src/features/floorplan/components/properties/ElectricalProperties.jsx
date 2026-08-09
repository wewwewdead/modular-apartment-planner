import { memo } from 'react';
import { ELECTRICAL_DEVICE_DEFAULTS, ELECTRICAL_DEVICE_TYPES } from '@/editor/tools';
import PhaseSelector from '../PhaseSelector';
import { NumberField, Readout, Section, SelectField, panelKitStyles } from './PanelKit';

function ElectricalProperties({ device, wall, dispatch, floorId, u, phases }) {
  const updateDevice = (updates) => {
    dispatch({ type: 'ELECTRICAL_DEVICE_UPDATE', floorId, device: { id: device.id, ...updates } });
  };

  const deviceType = device.deviceType || ELECTRICAL_DEVICE_TYPES.OUTLET;

  return (
    <div className={panelKitStyles.gutter}>
      <PhaseSelector phaseId={device.phaseId} phases={phases} onChange={(v) => updateDevice({ phaseId: v })} />

      <Section id="electrical.device" title="Device" summary={ELECTRICAL_DEVICE_DEFAULTS[deviceType]?.label}>
        <SelectField label="Type" value={deviceType} onChange={(type) => updateDevice({ deviceType: type })}>
          {Object.values(ELECTRICAL_DEVICE_TYPES).map((type) => (
            <option key={type} value={type}>
              {ELECTRICAL_DEVICE_DEFAULTS[type].label}
            </option>
          ))}
        </SelectField>
        <NumberField
          label="Mount height"
          value={u.toDisplay(device.mountHeight)}
          step={u.step(50)}
          unit={u.suffix}
          onChange={(v) => updateDevice({ mountHeight: Math.max(0, u.fromDisplay(v)) })}
        />
      </Section>

      <Section
        id="electrical.placement"
        title="Placement"
        defaultOpen={false}
        summary={`${device.side || 'right'} side`}
      >
        <SelectField label="Wall side" value={device.side || 'right'} onChange={(side) => updateDevice({ side })}>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </SelectField>
        <NumberField
          label="Along wall"
          value={u.toDisplay(device.offset)}
          step={u.step(50)}
          unit={u.suffix}
          onChange={(v) => updateDevice({ offset: Math.max(0, u.fromDisplay(v)) })}
        />
        {wall ? <Readout label="Host wall" value={wall.id.split('_').pop()} muted /> : null}
      </Section>
    </div>
  );
}

export default memo(ElectricalProperties);
