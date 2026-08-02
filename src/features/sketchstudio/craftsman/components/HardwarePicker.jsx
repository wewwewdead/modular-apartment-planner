import { getHardwareById } from '../data/materials';
import {
  getFastenerDrillingDefaults,
  getHardwarePattern,
  groupHardwareByFastenerKind,
} from '../../utils/fastenerUtils';
import { formatMaterialPrice } from './customMaterialFormHelpers';
import styles from '../styles/craftsman.module.css';

function formatMillimetres(value) {
  return Number.isFinite(Number(value)) ? `${Number(value)}mm` : '—';
}

/** `pilot 3mm` for fasteners, the authored summary for pattern hardware. */
function describeHardwareOption(item) {
  if (item.pattern) {
    return item.pattern.summary || `${item.pattern.holes.length} holes`;
  }

  return `pilot ${formatMillimetres(item.fastener?.pilotDiameter)}`;
}

/**
 * Catalog hardware chooser, grouped by fastener kind. Used both for the tool's
 * active fastener and for re-pointing an already placed one.
 */
export default function HardwarePicker({ label = 'Hardware', selectedHardwareId, onHardwareChange, hint }) {
  const groups = groupHardwareByFastenerKind();
  const hardware = getHardwareById(selectedHardwareId);
  const drilling = getFastenerDrillingDefaults(selectedHardwareId);
  const pattern = getHardwarePattern(selectedHardwareId);
  const hasUnknownHardware = Boolean(selectedHardwareId) && !hardware;

  return (
    <div className={styles.materialPicker}>
      {hint && <p className={styles.hint}>{hint}</p>}

      <label className={styles.fieldLabel}>{label}</label>
      <select
        className={styles.materialSelect}
        value={selectedHardwareId || ''}
        onChange={(event) => onHardwareChange(event.target.value || null)}
      >
        {hasUnknownHardware && <option value={selectedHardwareId}>{selectedHardwareId} (unavailable)</option>}
        {groups.map((group) => (
          <optgroup key={group.id} label={group.label}>
            {group.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {describeHardwareOption(item)} · {formatMaterialPrice(item)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {hasUnknownHardware && (
        <p className={styles.materialFormError}>
          This hardware is no longer in the catalog. It is costed at $0 until you pick a replacement.
        </p>
      )}

      {hardware && drilling && (
        <div className={styles.materialPreview}>
          <span className={styles.materialSwatch} style={{ backgroundColor: hardware.color }} />
          <span className={styles.materialInfo}>
            pilot {formatMillimetres(drilling.diameter)} · head {formatMillimetres(drilling.headDiameter)} · length{' '}
            {formatMillimetres(drilling.length)}
            {drilling.countersink ? ' · countersunk' : ''}
          </span>
        </div>
      )}

      {hardware && pattern && (
        <div className={styles.materialPreview}>
          <span className={styles.materialSwatch} style={{ backgroundColor: hardware.color }} />
          <span className={styles.materialInfo}>
            {pattern.summary || `${pattern.holes.length} holes`} · placed as one set of {pattern.holes.length} holes
          </span>
        </div>
      )}
    </div>
  );
}
