import materials, { MATERIAL_CATEGORIES, getMaterialById } from '../data/materials';
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
  const currentMaterial = !isMixedMaterial && selectedMaterialId ? getMaterialById(selectedMaterialId) : null;
  const selectedValue = isMixedMaterial ? MIXED_SELECT_VALUE : (selectedMaterialId || '');
  const thicknessValue = isMixedThickness ? '' : (thickness ?? '');
  const thicknessPlaceholder = isMixedThickness ? 'Mixed' : (currentMaterial?.thickness ?? '');

  return (
    <div className={styles.materialPicker}>
      {selectionCount > 1 && (
        <p className={styles.hint}>Apply changes to all {selectionCount} selected entities.</p>
      )}

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
        {MATERIAL_CATEGORIES.map((cat) => {
          const catMaterials = materials.filter((m) => m.category === cat.id);
          if (!catMaterials.length) return null;
          return (
            <optgroup key={cat.id} label={cat.label}>
              {catMaterials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — ${m.pricePerM2}/{m.costBasis === 'perLinearMeter' ? 'lm' : m.costBasis === 'perPiece' ? 'pc' : 'm\u00B2'}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>

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
        <div className={styles.materialPreview}>
          <span
            className={styles.materialSwatch}
            style={{ backgroundColor: currentMaterial.color }}
          />
          <span className={styles.materialInfo}>
            {currentMaterial.thickness}mm · {currentMaterial.density} kg/m3
          </span>
        </div>
      )}
    </div>
  );
}
