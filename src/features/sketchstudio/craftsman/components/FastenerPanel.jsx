import HardwarePicker from './HardwarePicker';
import { getFastenerKindLabel, getHardwarePattern, isFastenerEntity } from '../../utils/fastenerUtils';
import styles from '../styles/craftsman.module.css';

export const FASTENER_TOOL_ID = 'fastener';

/** The panel only has something to say while placing or while one is selected. */
export function isFastenerPanelVisible(activeTool, selectedEntity) {
  return activeTool === FASTENER_TOOL_ID || isFastenerEntity(selectedEntity);
}

/**
 * A selected hinge/handle is one hole of a placed boring pattern. The set is
 * grouped, so it moves and deletes together; re-pointing it at other hardware
 * would orphan the sibling holes, so the panel shows what it is instead of a
 * picker.
 */
function SelectedPatternFields({ pattern }) {
  return (
    <div className={styles.materialPicker}>
      <label className={styles.fieldLabel}>{getFastenerKindLabel(pattern.kind)}</label>
      <p className={styles.hint}>
        {pattern.name} — {pattern.summary || `${pattern.holes.length} holes`}. Placed as a grouped set of{' '}
        {pattern.holes.length} holes: selecting any hole selects the whole set, and deleting removes all of them.
      </p>
    </div>
  );
}

function SelectedFastenerFields({ entity, selectedIds, onEntityHardwareChange, onEntityFieldCommit }) {
  const isThrough = entity.through !== false;

  return (
    <>
      <HardwarePicker
        label="Fastener"
        selectedHardwareId={entity.hardwareId}
        onHardwareChange={(hardwareId) => onEntityHardwareChange(selectedIds, hardwareId)}
        hint="Changing the hardware re-sizes the pilot hole and resets the drilling defaults."
      />

      <div className={styles.materialPicker}>
        <label className={styles.fieldLabel}>Hole</label>
        <select
          className={styles.materialSelect}
          value={isThrough ? 'through' : 'blind'}
          onChange={(event) => onEntityFieldCommit('through', event.target.value === 'through' ? 'true' : 'false')}
          disabled={!onEntityFieldCommit}
        >
          <option value="through">Through hole</option>
          <option value="blind">Blind hole</option>
        </select>

        <label className={styles.fieldLabel}>
          Depth (mm)
          {isThrough && <span className={styles.fieldHint}> — through holes have no depth</span>}
        </label>
        <input
          type="number"
          className={styles.thicknessInput}
          value={isThrough ? '' : (entity.depth ?? '')}
          placeholder={isThrough ? 'Through' : 'Depth'}
          min="0"
          step="0.5"
          disabled={isThrough || !onEntityFieldCommit}
          onChange={(event) => onEntityFieldCommit('depth', event.target.value)}
        />
      </div>
    </>
  );
}

/**
 * Fastener tool options plus the properties of a selected fastener. Rendered in
 * both the drafting right panel and the Craftsman sidebar.
 */
export default function FastenerPanel({
  activeTool,
  activeHardwareId,
  onActiveHardwareChange,
  selectedEntity,
  selectedIds = [],
  onEntityHardwareChange,
  onEntityFieldCommit,
}) {
  const isToolActive = activeTool === FASTENER_TOOL_ID;
  const selectedFastener = isFastenerEntity(selectedEntity) ? selectedEntity : null;
  const selectedPattern = selectedFastener ? getHardwarePattern(selectedFastener.hardwareId) : null;
  const activePattern = getHardwarePattern(activeHardwareId);

  if (!isToolActive && !selectedFastener) {
    return null;
  }

  return (
    <div className={styles.materialPicker}>
      {isToolActive && onActiveHardwareChange && (
        <HardwarePicker
          label="Placing"
          selectedHardwareId={activeHardwareId}
          onHardwareChange={onActiveHardwareChange}
          hint={
            activePattern
              ? `Click near a part edge to place the ${activePattern.kind} boring pattern - it orients to the nearest edge.`
              : 'Click the canvas to drill a pilot hole for this fastener.'
          }
        />
      )}

      {selectedPattern && <SelectedPatternFields pattern={selectedPattern} />}

      {selectedFastener && !selectedPattern && onEntityHardwareChange && (
        <SelectedFastenerFields
          entity={selectedFastener}
          selectedIds={selectedIds.length ? selectedIds : [selectedFastener.id]}
          onEntityHardwareChange={onEntityHardwareChange}
          onEntityFieldCommit={onEntityFieldCommit}
        />
      )}
    </div>
  );
}
