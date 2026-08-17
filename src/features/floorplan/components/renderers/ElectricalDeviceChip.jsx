import { memo } from 'react';
import { ELECTRICAL_DEVICE_DEFAULTS, ELECTRICAL_DEVICE_TYPES, TOOLS } from '@/editor/tools';
import Tooltip from '../Tooltip';
import styles from './SvgCanvas.module.css';

// Buttons carry the plan symbol's own lettering rather than a bespoke icon, so
// the palette reads the same way the drawing does.
const deviceCodes = {
  [ELECTRICAL_DEVICE_TYPES.OUTLET]: 'DUP',
  [ELECTRICAL_DEVICE_TYPES.OUTLET_GFCI]: 'GFCI',
  [ELECTRICAL_DEVICE_TYPES.OUTLET_220V]: '220',
  [ELECTRICAL_DEVICE_TYPES.SWITCH]: 'S',
  [ELECTRICAL_DEVICE_TYPES.SWITCH_3WAY]: 'S3',
  [ELECTRICAL_DEVICE_TYPES.SWITCH_DIMMER]: 'SD',
};

const deviceItems = Object.values(ELECTRICAL_DEVICE_TYPES).map((deviceType) => ({
  deviceType,
  label: ELECTRICAL_DEVICE_DEFAULTS[deviceType].label,
  code: deviceCodes[deviceType],
}));

/*
 * Which device the Electrical tool places — outlet, GFCI, 220V, switch, 3-way,
 * dimmer — floats over the plan rather than sitting in the toolbar, for the
 * same reason as the beam level chip: the toolbar's content runs ~2970px wide,
 * so at a 1536px window this palette sat entirely past the fold behind an
 * invisible scrollbar and every device placed as the default duplex outlet.
 *
 * It drives toolState.deviceType directly, which is the same value
 * electricalPlaceHandler reads; there is no second copy of the choice.
 */
const ElectricalDeviceChip = memo(function ElectricalDeviceChip({
  activeTool,
  viewMode,
  modelTarget,
  floor,
  deviceType,
  editorDispatch,
}) {
  if (activeTool !== TOOLS.ELECTRICAL || viewMode !== 'plan' || modelTarget !== 'floor' || !floor) return null;

  // Unset reads as the duplex outlet, matching the placement handler's fallback.
  const selected = deviceType || ELECTRICAL_DEVICE_TYPES.OUTLET;

  return (
    <div className={styles.chipDock} role="group" aria-label="Electrical device type">
      <span className={styles.chipLabel}>Device</span>
      <div className={styles.chipGroup}>
        {deviceItems.map((item) => {
          const isActive = selected === item.deviceType;
          return (
            <Tooltip key={item.deviceType} label={item.label}>
              <button
                type="button"
                className={isActive ? styles.chipCodeBtnActive : styles.chipCodeBtn}
                onClick={() => editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { deviceType: item.deviceType } })}
                aria-label={item.label}
                aria-pressed={isActive}
              >
                {item.code}
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
});

export default ElectricalDeviceChip;
