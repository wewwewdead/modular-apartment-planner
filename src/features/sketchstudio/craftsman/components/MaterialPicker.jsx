import { getMaterialById, getMergedMaterialCategories, getStockMaterials, materialHasGrain } from '../data/materials';
import { duplicateMaterialAsCustom } from '../data/customMaterials';
import { useCustomMaterialList } from '../hooks/useCustomMaterials';
import { GRAIN_ANGLE_PRESETS, normalizeGrainAngle } from '../utils/grainUtils';
import { formatMaterialPrice, groupMaterialsByCategory } from './customMaterialFormHelpers';
import styles from '../styles/craftsman.module.css';

const MIXED_SELECT_VALUE = '__mixed__';
const GRAIN_FREE_VALUE = '';
const GRAIN_CUSTOM_VALUE = '__custom__';

function getGrainSelectValue({ isMixedGrainAngle, grainAngle }) {
  if (isMixedGrainAngle) {
    return MIXED_SELECT_VALUE;
  }
  if (grainAngle == null) {
    return GRAIN_FREE_VALUE;
  }
  return GRAIN_ANGLE_PRESETS.some((preset) => preset.value === grainAngle) ? String(grainAngle) : GRAIN_CUSTOM_VALUE;
}

/**
 * Grain direction control. Only rendered for stock that actually has a grain, so
 * a part cut from MDF or acrylic is never asked a question with no answer.
 */
function GrainControl({ grainAngle, isMixedGrainAngle, onGrainAngleChange }) {
  const selectValue = getGrainSelectValue({ isMixedGrainAngle, grainAngle });

  return (
    <>
      <label className={styles.fieldLabel}>
        Grain Direction
        {isMixedGrainAngle && <span className={styles.fieldHint}> — mixed selection</span>}
      </label>
      <select
        className={styles.materialSelect}
        value={selectValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (nextValue === GRAIN_CUSTOM_VALUE || nextValue === MIXED_SELECT_VALUE) {
            return;
          }
          onGrainAngleChange(nextValue === GRAIN_FREE_VALUE ? null : Number(nextValue));
        }}
      >
        {isMixedGrainAngle && (
          <option value={MIXED_SELECT_VALUE} disabled>
            Mixed grain directions
          </option>
        )}
        <option value={GRAIN_FREE_VALUE}>Unconstrained — any rotation</option>
        {GRAIN_ANGLE_PRESETS.map((preset) => (
          <option key={preset.value} value={String(preset.value)}>
            {preset.label}
          </option>
        ))}
        {selectValue === GRAIN_CUSTOM_VALUE && <option value={GRAIN_CUSTOM_VALUE}>{grainAngle}° — custom</option>}
      </select>

      <label className={styles.fieldLabel}>
        Grain Angle (deg, 0 = along sheet length)
        <input
          type="number"
          className={styles.thicknessInput}
          value={isMixedGrainAngle || grainAngle == null ? '' : grainAngle}
          placeholder={isMixedGrainAngle ? 'Mixed' : 'Unconstrained'}
          step="1"
          onChange={(event) =>
            onGrainAngleChange(event.target.value === '' ? null : normalizeGrainAngle(event.target.value))
          }
        />
      </label>
      <p className={styles.hint}>
        Sheet grain runs along the sheet length. A locked part may only be nested at rotations that keep its grain on
        that axis, which can cost sheet efficiency.
      </p>
    </>
  );
}

export default function MaterialPicker({
  selectedMaterialId,
  onMaterialChange,
  onThicknessChange,
  onGrainAngleChange,
  thickness,
  grainAngle = null,
  selectionCount = 1,
  isMixedMaterial = false,
  isMixedThickness = false,
  isMixedGrainAngle = false,
}) {
  // Subscribing keeps the option list in sync with the custom material editor.
  useCustomMaterialList();

  const currentMaterial = !isMixedMaterial && selectedMaterialId ? getMaterialById(selectedMaterialId) : null;
  const selectedValue = isMixedMaterial ? MIXED_SELECT_VALUE : selectedMaterialId || '';
  const thicknessValue = isMixedThickness ? '' : (thickness ?? '');
  const thicknessPlaceholder = isMixedThickness ? 'Mixed' : (currentMaterial?.thickness ?? '');
  // Hardware is placed as a fastener, never assigned as the stock a part is cut from.
  const groups = groupMaterialsByCategory(getStockMaterials(), getMergedMaterialCategories());

  // A material id with no catalog entry (e.g. a deleted custom material) still
  // needs an option so the select keeps showing what the part is assigned to.
  const hasUnknownMaterial = !isMixedMaterial && Boolean(selectedMaterialId) && !currentMaterial;

  const handleDuplicateAsCustom = () => {
    const outcome = duplicateMaterialAsCustom(currentMaterial);
    if (outcome.valid) {
      onMaterialChange(outcome.material.id);
    }
  };

  return (
    <div className={styles.materialPicker}>
      {selectionCount > 1 && <p className={styles.hint}>Apply changes to all {selectionCount} selected entities.</p>}

      <label className={styles.fieldLabel}>Material</label>
      <select
        className={styles.materialSelect}
        value={selectedValue}
        onChange={(e) => onMaterialChange(e.target.value || null)}
      >
        {isMixedMaterial && (
          <option value={MIXED_SELECT_VALUE} disabled>
            Mixed materials
          </option>
        )}
        <option value="">None</option>
        {hasUnknownMaterial && <option value={selectedMaterialId}>{selectedMaterialId} (unavailable)</option>}
        {groups.map((group) => (
          <optgroup key={group.id} label={group.label}>
            {group.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.isCustom ? '★ ' : ''}
                {m.name} — {formatMaterialPrice(m)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {hasUnknownMaterial && (
        <p className={styles.materialFormError}>
          This material is no longer in the catalog. It is costed at $0 until you pick a replacement.
        </p>
      )}

      <label className={styles.fieldLabel}>
        Thickness (mm)
        {isMixedThickness && <span className={styles.fieldHint}> — mixed selection</span>}
        {currentMaterial && !thickness && (
          <span className={styles.fieldHint}> — default: {currentMaterial.thickness}mm</span>
        )}
      </label>
      <input
        type="number"
        className={styles.thicknessInput}
        value={thicknessValue}
        placeholder={thicknessPlaceholder}
        min="0.1"
        step="0.5"
        onChange={(e) => onThicknessChange(e.target.value ? Number(e.target.value) : null)}
      />

      {materialHasGrain(currentMaterial) && onGrainAngleChange && (
        <GrainControl
          grainAngle={grainAngle}
          isMixedGrainAngle={isMixedGrainAngle}
          onGrainAngleChange={onGrainAngleChange}
        />
      )}

      {currentMaterial && (
        <>
          <div className={styles.materialPreview}>
            <span className={styles.materialSwatch} style={{ backgroundColor: currentMaterial.color }} />
            <span className={styles.materialInfo}>
              {currentMaterial.thickness}mm · {currentMaterial.density} kg/m3
            </span>
            {currentMaterial.isCustom && <span className={styles.customMaterialBadge}>Custom</span>}
          </div>

          {!currentMaterial.isCustom && (
            <button
              type="button"
              className={styles.exportBtn}
              onClick={handleDuplicateAsCustom}
              title="Copy this catalog material so you can set your own local price"
            >
              Duplicate As Custom
            </button>
          )}
        </>
      )}
    </div>
  );
}
