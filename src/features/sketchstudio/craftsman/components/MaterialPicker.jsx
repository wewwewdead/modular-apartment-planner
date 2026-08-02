import { getMaterialById, getMergedMaterialCategories, getStockMaterials } from '../data/materials';
import { duplicateMaterialAsCustom } from '../data/customMaterials';
import { useCustomMaterialList } from '../hooks/useCustomMaterials';
import { formatMaterialPrice, groupMaterialsByCategory } from './customMaterialFormHelpers';
import styles from '../styles/craftsman.module.css';

const MIXED_SELECT_VALUE = '__mixed__';

export default function MaterialPicker({
  selectedMaterialId,
  onMaterialChange,
  onThicknessChange,
  thickness,
  selectionCount = 1,
  isMixedMaterial = false,
  isMixedThickness = false,
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
