import materials, { MATERIAL_CATEGORIES, getMaterialById } from '../data/materials';
import styles from '../styles/craftsman.module.css';

export default function MaterialPicker({ selectedMaterialId, onMaterialChange, onThicknessChange, thickness }) {
  const currentMaterial = selectedMaterialId ? getMaterialById(selectedMaterialId) : null;

  return (
    <div className={styles.materialPicker}>
      <label className={styles.fieldLabel}>Material</label>
      <select
        className={styles.materialSelect}
        value={selectedMaterialId || ''}
        onChange={(e) => onMaterialChange(e.target.value || null)}
      >
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
        {currentMaterial && !thickness && (
          <span className={styles.fieldHint}> — default: {currentMaterial.thickness}mm</span>
        )}
      </label>
      <input
        type="number"
        className={styles.thicknessInput}
        value={thickness ?? ''}
        placeholder={currentMaterial?.thickness ?? ''}
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
